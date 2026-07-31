/**
 * コインの状態機械と物理。
 *
 * 重力は画面の下向きに働く。コインの動きは 2 つだけ。
 *
 *   1. `onLane` — ななめ上向きのレーンの上。斜面に沿った 1 次元の運動。
 *      加速度は斜面成分の `-GRAVITY * sinθ` だけ(摩擦なし)。
 *      弾かれると登り、減速し、止まって、また滑り降りてくる。
 *   2. `dropping` — 隙間から落ちて 1 段下のレーンへ向かう自由落下。
 *      画面下向きの重力そのままの放物線で、次のレーンに着地する。
 *
 * 勝ち負けはレーンの上の 3 区間だけで決まる。
 *
 *   手前の穴を HOLE_CATCH_SPEED 未満で通る → 落ちる(**弱すぎ**)
 *   隙間を HOLE_CATCH_SPEED 未満で通る     → 落ちる(**成功。1 段下へ**)
 *   隙間を渡りきる                          → 奥の穴へ(**強すぎ**)
 *
 * 摩擦を入れていないので、登りと下りが対称になり、
 * 「どの初速でどこまで登れるか」が閉じた式で決まる。
 * チューニングも検算もその式と実物理の突き合わせで行う。
 *
 * Canvas も DOM も参照しない純粋なロジック。Vitest でそのままテストできる。
 */

import {
  COIN_R,
  GRAVITY,
  HOLE_CATCH_SPEED,
  MAX_SUBSTEP_MOVE,
  ROW_COUNT,
  type Vec2,
} from '../config.ts';
import {
  inFarHole,
  inGap,
  inNearHole,
  laneUAtX,
  laneYAtX,
  posOnLane,
  xOnLane,
  type Lane,
  type WinPocket,
} from './board.ts';

export type CoinState = 'onLane' | 'dropping' | 'lost' | 'win';

/** どこで没収されたか。演出と検算で使い分ける */
export type LostKind = 'weak' | 'strong';

export interface Coin {
  state: CoinState;
  /** いま乗っている(または向かっている)レーン */
  laneIndex: number;
  /** onLane: 斜面に沿った位置。低い端が 0 */
  u: number;
  /** onLane: 斜面に沿った速さ。登りが + */
  v: number;
  /** レバーに受け止められて静止しているか。true のときだけ弾ける */
  held: boolean;
  /** コインの中心。常に有効 */
  pos: Vec2;
  /** dropping のときの速度 */
  vel: Vec2;
  /** lost / win の演出経過秒 */
  timer: number;
  /** lost のとき、どちら側で落ちたか */
  lostKind: LostKind | null;
  /** 落ちた穴の中心(演出の吸い込み先) */
  lostAt: Vec2;
  /** 見た目の回転 */
  spin: number;
}

export interface StepResult {
  /** このステップでレバーに受け止められたレーン */
  heldOnLane: number | null;
  /** 隙間から落ちて次の段へ向かい始めた */
  droppedThrough: boolean;
  /** 1 段下のレーンに着地した */
  landedOnLane: number | null;
  /** 穴に落ちて没収 */
  lost: LostKind | null;
  /** あたりの口に入った */
  reachedWin: boolean;
}

const EMPTY = (): StepResult => ({
  heldOnLane: null,
  droppedThrough: false,
  landedOnLane: null,
  lost: null,
  reachedWin: false,
});

export function createCoin(): Coin {
  return {
    state: 'onLane',
    laneIndex: 0,
    u: 0,
    v: 0,
    held: false,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    timer: 0,
    lostKind: null,
    lostAt: { x: 0, y: 0 },
    spin: 0,
  };
}

function syncPos(coin: Coin, lanes: readonly Lane[]): void {
  coin.pos = posOnLane(lanes[coin.laneIndex]!, coin.u);
}

/** 指定したレーンの指定した位置に置く */
export function placeOnLane(
  coin: Coin,
  lanes: readonly Lane[],
  laneIndex: number,
  u: number,
  v: number,
): void {
  coin.state = 'onLane';
  coin.laneIndex = laneIndex;
  coin.u = u;
  coin.v = v;
  coin.held = v === 0 && u === 0;
  coin.timer = 0;
  coin.lostKind = null;
  syncPos(coin, lanes);
}

/** レバーに受け止められた状態(低い端で静止)にする */
export function placeAtLever(coin: Coin, lanes: readonly Lane[], laneIndex: number): void {
  placeOnLane(coin, lanes, laneIndex, 0, 0);
  coin.held = true;
}

/**
 * 投入されたコインの初期位置。
 * 1 段目のレーンの、手前の穴より低い側に落として滑り降りさせる。
 * 落ちてくるコインと同じ経路をたどるので、投入だけで没収されることはない。
 */
export function placeAtStart(coin: Coin, lanes: readonly Lane[]): void {
  placeOnLane(coin, lanes, 0, ENTRY_U, 0);
  coin.held = false;
  coin.spin = 0;
}

/** 投入されたコインが 1 段目に乗る位置。手前の穴より必ず低い側 */
export const ENTRY_U = 120;

// ---------------------------------------------------------------- 弾く

/** レバーで止まっているコインだけが弾ける */
export function canFlick(coin: Coin): boolean {
  return coin.state === 'onLane' && coin.held;
}

/** 弾けたら true。power は斜面に沿った初速 (px/s) */
export function flickCoin(coin: Coin, power: number): boolean {
  if (!canFlick(coin)) return false;
  coin.held = false;
  coin.v = power;
  return true;
}

// ---------------------------------------------------------------- 更新

export function stepCoin(
  coin: Coin,
  dt: number,
  lanes: readonly Lane[],
  pocket: WinPocket,
): StepResult {
  switch (coin.state) {
    case 'onLane':
      return coin.held ? EMPTY() : stepOnLane(coin, dt, lanes);
    case 'dropping':
      return stepDropping(coin, dt, lanes, pocket);
    default:
      coin.timer += dt;
      return EMPTY();
  }
}

/** 斜面に沿った 1 次元の運動。登りも下りも同じ式 */
function stepOnLane(coin: Coin, dt: number, lanes: readonly Lane[]): StepResult {
  const res = EMPTY();
  const lane = lanes[coin.laneIndex]!;

  const steps = Math.min(24, Math.max(1, Math.ceil((Math.abs(coin.v) * dt) / MAX_SUBSTEP_MOVE)));
  const h = dt / steps;

  for (let i = 0; i < steps; i++) {
    coin.v -= lane.decel * h; // 斜面に沿った重力。つねに低い端の向き
    coin.u += coin.v * h;
    coin.spin += (coin.v * h) / COIN_R;

    // 穴と隙間。ゆっくり通ると落ちる。勢いがあれば口をかすめて渡れる
    if (Math.abs(coin.v) < HOLE_CATCH_SPEED) {
      if (inGap(lane, coin.u)) {
        syncPos(coin, lanes);
        return dropThrough(coin, res);
      }
      if (inNearHole(lane, coin.u)) return lose(coin, lanes, res, 'weak');
      if (inFarHole(lane, coin.u)) return lose(coin, lanes, res, 'strong');
    }
    // 高い端を越えたら、そのまま奥の穴と同じ扱い
    if (coin.u > lane.length) return lose(coin, lanes, res, 'strong');

    // 低い端のレバーで受け止める
    if (coin.u <= 0) {
      coin.u = 0;
      coin.v = 0;
      coin.held = true;
      syncPos(coin, lanes);
      res.heldOnLane = lane.index;
      return res;
    }
  }

  syncPos(coin, lanes);
  return res;
}

/** 隙間から落ちる。ここから 1 段下のレーンへ向かう自由落下になる */
function dropThrough(coin: Coin, res: StepResult): StepResult {
  coin.state = 'dropping';
  // 斜面に沿っていた速度をそのまま画面座標へ移す
  coin.vel = { x: 0, y: 0 };
  res.droppedThrough = true;
  return res;
}

/** 穴に落ちて没収 */
function lose(coin: Coin, lanes: readonly Lane[], res: StepResult, kind: LostKind): StepResult {
  const lane = lanes[coin.laneIndex]!;
  const span = kind === 'weak' ? lane.nearHole : lane.farHole;
  const mid = Math.min(Math.max(coin.u, span.from), span.to);
  syncPos(coin, lanes);
  coin.state = 'lost';
  coin.timer = 0;
  coin.lostKind = kind;
  coin.lostAt = posOnLane(lane, mid);
  coin.v = 0;
  res.lost = kind;
  return res;
}

/** 画面下向きの重力そのままの自由落下。1 段下のレーンかあたりの口で受ける */
function stepDropping(
  coin: Coin,
  dt: number,
  lanes: readonly Lane[],
  pocket: WinPocket,
): StepResult {
  const res = EMPTY();
  const target = coin.laneIndex + 1;
  const isPocket = target >= ROW_COUNT;

  const steps = Math.min(
    24,
    Math.max(1, Math.ceil((Math.abs(coin.vel.y + GRAVITY * dt) * dt) / MAX_SUBSTEP_MOVE)),
  );
  const h = dt / steps;

  for (let i = 0; i < steps; i++) {
    coin.vel.y += GRAVITY * h;
    coin.pos.x += coin.vel.x * h;
    coin.pos.y += coin.vel.y * h;
    coin.spin += (coin.vel.x * h) / COIN_R;

    if (isPocket) {
      if (coin.pos.y >= pocket.y) {
        coin.pos.y = pocket.y;
        coin.vel = { x: 0, y: 0 };
        coin.state = 'win';
        coin.timer = 0;
        res.reachedWin = true;
        return res;
      }
      continue;
    }

    const lane = lanes[target]!;
    if (!xOnLane(lane, coin.pos.x)) continue;
    const surface = laneYAtX(lane, coin.pos.x);
    if (coin.pos.y >= surface) {
      // 着地。斜面に沿った成分だけを引き継ぐ(低い端へ滑り出す)
      coin.laneIndex = target;
      coin.u = laneUAtX(lane, coin.pos.x);
      coin.v = coin.vel.x * lane.dir.x + coin.vel.y * lane.dir.y;
      coin.state = 'onLane';
      coin.held = false;
      syncPos(coin, lanes);
      res.landedOnLane = target;
      return res;
    }
  }
  return res;
}

/** いまコインがいる段(1 起点)。到達段数の表示に使う */
export function depthOf(coin: Coin): number {
  return coin.laneIndex + 1;
}
