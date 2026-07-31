/**
 * コインの状態機械と物理。
 *
 * **コインは飛ばない。レーンの上を走る。**
 * 位置はレーンに沿った距離 `s` ひとつ、速度は前向きの速さ `v` ひとつだけ。
 * 放物線も 2 次元の当たり判定も無い。
 *
 *   1. 止まり木(レバー)に受け止められて止まっている
 *   2. 弾かれて勢いを得る。レーンを走りながら摩擦で減速していく
 *   3. 穴を勢いよく渡りきり、次の止まり木に受け止められる(成功)か、
 *      勢いが足りずに穴へ落ちる / 勢いが強すぎて止まり木を乗り越えて
 *      その先の穴へ落ちる(没収)
 *
 * 減速は `dv/dt = LANE_ASSIST - LANE_DRAG * v`。
 * 速い間はほぼ `v ≒ v0 - LANE_DRAG * 走った距離` の一次関数になるので、
 * 「引いた量」と「走る距離」が素直に対応する。
 * 止まりかけると LANE_ASSIST(レーンの傾き)が勝ってゆっくり前へ進み続けるので、
 * コインがレーンの途中で永久に止まって詰むことがない。
 *
 * Canvas も DOM も参照しない純粋なロジック。Vitest でそのままテストできる。
 */

import {
  COIN_R,
  ENTRY_SPEED,
  HOLE_CATCH_SPEED,
  LANE_ASSIST,
  LANE_DRAG,
  MAX_SUBSTEP_MOVE,
  STOP_HOLD_SPEED,
  type Vec2,
} from '../config.ts';
import { holeAt, posAt, type Hole, type Lane } from './board.ts';

export type CoinState = 'onLane' | 'falling' | 'win';

export interface Coin {
  state: CoinState;
  /** レーンに沿った位置 */
  s: number;
  /** レーンに沿った速さ。つねに 0 以上(後戻りしない) */
  v: number;
  /** 止まり木に受け止められて静止しているか。true のときだけ弾ける */
  held: boolean;
  /** 直近で受け止められた止まり木。-1 は投入直後 */
  stopIndex: number;
  /** コインの中心。常に有効 */
  pos: Vec2;
  /** falling / win の演出経過秒 */
  timer: number;
  /** falling のとき、落ちた穴 */
  hole: Hole | null;
  /** falling に入った瞬間の位置(落下演出の始点) */
  fallFrom: Vec2;
  /** 見た目の回転 */
  spin: number;
}

export interface StepResult {
  /** このステップで受け止められた止まり木 */
  heldAtStop: number | null;
  /** 穴に落ちた */
  fellInHole: Hole | null;
  /** 落ちかたが「弱すぎ」か「強すぎ」か */
  fellKind: 'weak' | 'strong' | null;
  /** あたりの口に入った */
  reachedWin: boolean;
  /** 止まり木を乗り越えてしまった位置(火花演出用) */
  overran: Vec2 | null;
}

const EMPTY = (): StepResult => ({
  heldAtStop: null,
  fellInHole: null,
  fellKind: null,
  reachedWin: false,
  overran: null,
});

export function createCoin(): Coin {
  return {
    state: 'onLane',
    s: 0,
    v: 0,
    held: false,
    stopIndex: -1,
    pos: { x: 0, y: 0 },
    timer: 0,
    hole: null,
    fallFrom: { x: 0, y: 0 },
    spin: 0,
  };
}

function syncPos(coin: Coin, lane: Lane): void {
  coin.pos = posAt(lane, coin.s);
}

/** 指定した位置・速さでレーンに置く */
export function placeOnLane(coin: Coin, lane: Lane, s: number, v: number): void {
  coin.state = 'onLane';
  coin.s = s;
  coin.v = v;
  coin.held = v === 0;
  coin.timer = 0;
  coin.hole = null;
  syncPos(coin, lane);
}

/** 指定した止まり木に受け止められた状態にする */
export function placeAtStop(coin: Coin, lane: Lane, stopIndex: number): void {
  const stop = lane.stops[stopIndex]!;
  placeOnLane(coin, lane, stop.s, 0);
  coin.held = true;
  coin.stopIndex = stopIndex;
}

/**
 * 投入されたコインの初期位置。
 * レーンの先頭に勢いよく送り出す。1 本目の走路には穴が無いので、
 * どこにも落ちずに 1 つ目の止まり木まで走って止まる。
 */
export function placeAtStart(coin: Coin, lane: Lane): void {
  placeOnLane(coin, lane, 0, ENTRY_SPEED);
  coin.held = false;
  coin.stopIndex = -1;
  coin.spin = 0;
}

// ---------------------------------------------------------------- 弾く

/** 止まり木に止まっているコインだけが弾ける */
export function canFlick(coin: Coin): boolean {
  return coin.state === 'onLane' && coin.held;
}

/** 弾けたら true。power はレーンに沿った初速 (px/s) */
export function flickCoin(coin: Coin, power: number): boolean {
  if (!canFlick(coin)) return false;
  coin.held = false;
  coin.v = power;
  return true;
}

// ---------------------------------------------------------------- 更新

export function stepCoin(coin: Coin, dt: number, lane: Lane): StepResult {
  if (coin.state !== 'onLane') {
    coin.timer += dt;
    return EMPTY();
  }
  if (coin.held) return EMPTY();
  return stepOnLane(coin, dt, lane);
}

function stepOnLane(coin: Coin, dt: number, lane: Lane): StepResult {
  const res = EMPTY();

  // 1 サブステップの移動量が MAX_SUBSTEP_MOVE を超えないよう分割する。
  // 高速のときに穴や止まり木をまたいで見落とさないため
  const steps = Math.min(24, Math.max(1, Math.ceil((coin.v * dt) / MAX_SUBSTEP_MOVE)));
  const h = dt / steps;

  for (let i = 0; i < steps; i++) {
    const prevS = coin.s;
    coin.v += (LANE_ASSIST - LANE_DRAG * coin.v) * h;
    coin.s += coin.v * h;
    coin.spin += (coin.v * h) / COIN_R;

    // 止まり木。またいだ瞬間に、受け止められるか乗り越えるかが決まる
    for (const stop of lane.stops) {
      if (prevS >= stop.s || coin.s < stop.s) continue;
      if (coin.v <= STOP_HOLD_SPEED) {
        coin.s = stop.s;
        coin.v = 0;
        coin.held = true;
        coin.stopIndex = stop.index;
        syncPos(coin, lane);
        res.heldAtStop = stop.index;
        return res;
      }
      // 勢いが強すぎる。乗り越えてそのまま先の穴へ向かう
      res.overran = { ...stop.pos };
    }

    // あたりの口。止まり木と同じで、受け止められる速さで来る必要がある
    if (prevS < lane.goalS && coin.s >= lane.goalS && coin.v <= STOP_HOLD_SPEED) {
      coin.s = lane.goalS;
      coin.v = 0;
      coin.state = 'win';
      coin.timer = 0;
      syncPos(coin, lane);
      res.reachedWin = true;
      return res;
    }

    // 穴。勢いが足りないまま口の上に来ると落ちる
    const hole = holeAt(lane, coin.s);
    if (hole && coin.v < HOLE_CATCH_SPEED) {
      syncPos(coin, lane);
      return fall(coin, hole, res);
    }

    // レーンの終端。通り過ぎたら最後の穴へ落とす
    if (coin.s >= lane.length) {
      coin.s = lane.length;
      syncPos(coin, lane);
      return fall(coin, lane.holes[lane.holes.length - 1]!, res);
    }
  }

  syncPos(coin, lane);
  return res;
}

/**
 * 穴に落ちる。
 *
 * 穴 i は止まり木 i と i+1 のあいだにある。止まり木 k から弾いたコインが
 * 渡るべき穴は k なので、
 *   穴 k に落ちた   → 渡りきれなかった = 弱すぎ
 *   穴 k+1 以降     → 止まり木 k+1 を乗り越えている = 強すぎ
 */
function fall(coin: Coin, hole: Hole, res: StepResult): StepResult {
  coin.state = 'falling';
  coin.timer = 0;
  coin.hole = hole;
  coin.fallFrom = { ...coin.pos };
  res.fellInHole = hole;
  res.fellKind = hole.index <= coin.stopIndex ? 'weak' : 'strong';
  return res;
}

/** いまコインがいる走路の番号(0 起点)。到達段数の表示に使う */
export function runIndexOf(lane: Lane, s: number): number {
  let idx = 0;
  for (const run of lane.runs) if (s >= run.startS) idx = run.index;
  return idx;
}
