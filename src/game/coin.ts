/**
 * コインの状態機械。動きそのものは Matter.js が決めるので、ここは
 * 「いまどのレーンにいるか」「穴に入ったか、隙間から落ちたか」を
 * 見張って結果を出すだけ。
 *
 * 位置と速度は Matter から読み、レーンに沿った座標 (u, perp) に射影して判定する。
 *   u    = そのレーンの低い端からの距離
 *   perp = レール上面からの高さ。載っているとき COIN_R、落ちると負になる
 */

import {
  COIN_R,
  FALL_ANIM,
  P_MAX,
  P_MIN,
  REST_SPEED,
  ROW_COUNT,
  WIN_ANIM,
  type Vec2,
} from '../config.ts';
import {
  ENTRY_U,
  inSpan,
  laneP,
  laneProject,
  restPoint,
  type Lane,
  type WinPocket,
} from './board.ts';
import {
  coinPos,
  coinSpeed,
  coinVel,
  createWorld,
  freezeCoin,
  placeCoin,
  stepWorld,
  wakeCoin,
  type PhysWorld,
} from './world.ts';

export type CoinPhase = 'rolling' | 'ready' | 'falling' | 'lost' | 'win';
export type LostKind = 'weak' | 'strong';

/** レール上面からこれだけ下に中心が来たら「穴の中」。コイン全体が面の下 */
const PIT_DEPTH = -30;
/** 着地とみなす接触距離 */
const LAND_PERP = COIN_R + 3;
/** 構えに入る条件。ストッパーに寄っていて、ほぼ止まっている */
const READY_U = COIN_R + 10;

/** 動かなくなったコインを助ける。詰み(結果が出ない)を作らないため */
const STUCK_SPEED = 22;
const STUCK_NUDGE_AT = 1.2; // s
const STUCK_GIVEUP_AT = 4.0; // s
const NUDGE_SPEED = 70;
/** 構えを作るときに落ち着かせるフレーム数 */
const SETTLE_STEPS = 20;

export interface CoinState {
  world: PhysWorld;
  lanes: Lane[];
  pocket: WinPocket;
  phase: CoinPhase;
  /** いま乗っているレーン。falling 中は「出発したレーン」 */
  laneIndex: number;
  /** falling 中の着地先 */
  targetIndex: number;
  lostKind: LostKind | null;
  /** 落ちた穴の中心(沈む演出用) */
  lostAt: Vec2 | null;
  /** 一度でも弾かれたか */
  flicked: boolean;

  pos: Vec2;
  vel: Vec2;
  /** 見た目の回転 (rad)。物理では回さず、進んだ距離から作る */
  spin: number;
  u: number;
  perp: number;
  speed: number;

  stuck: number;
  /** lost / win の演出タイマ(秒、カウントダウン) */
  timer: number;
}

export interface StepResult {
  becameReady: boolean;
  droppedThrough: boolean;
  landed: boolean;
  lost: LostKind | null;
  won: boolean;
  /** 演出が終わってリザルトへ移ってよい */
  finished: boolean;
}

function emptyResult(): StepResult {
  return {
    becameReady: false,
    droppedThrough: false,
    landed: false,
    lost: null,
    won: false,
    finished: false,
  };
}

export function createCoin(lanes: Lane[], pocket: WinPocket): CoinState {
  const world = createWorld(lanes, pocket);
  const coin: CoinState = {
    world,
    lanes,
    pocket,
    phase: 'rolling',
    laneIndex: 0,
    targetIndex: 0,
    lostKind: null,
    lostAt: null,
    flicked: false,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    spin: 0,
    u: 0,
    perp: 0,
    speed: 0,
    stuck: 0,
    timer: 0,
  };
  resetToEntry(coin);
  return coin;
}

/** 1 段目に投入された状態にする。斜面を滑ってストッパーへ向かう */
export function resetToEntry(coin: CoinState): void {
  const lane = coin.lanes[0]!;
  coin.phase = 'rolling';
  coin.laneIndex = 0;
  coin.targetIndex = 0;
  coin.lostKind = null;
  coin.lostAt = null;
  coin.flicked = false;
  coin.stuck = 0;
  coin.timer = 0;
  placeCoin(coin.world, laneP(lane, ENTRY_U, COIN_R));
  sync(coin);
}

/**
 * ストッパーで構えた状態を作る(テストと検算用)。
 *
 * 理想の座標に置くだけでは接地が厳密でないので、実際に少しだけ
 * 物理を回して落ち着かせる。ゲーム中に自然に構えたときとまったく
 * 同じ状態になり、同じ力で弾けば同じ結果になる。
 */
export function placeReady(coin: CoinState, laneIndex: number): void {
  const lane = coin.lanes[laneIndex]!;
  coin.laneIndex = laneIndex;
  coin.targetIndex = laneIndex;
  coin.stuck = 0;
  coin.phase = 'rolling';
  placeCoin(coin.world, restPoint(lane));
  for (let i = 0; i < SETTLE_STEPS; i++) stepWorld(coin.world, 1 / 60);
  coin.phase = 'ready';
  freezeCoin(coin.world);
  sync(coin);
}

function sync(coin: CoinState): void {
  const lane = coin.lanes[coin.laneIndex]!;
  const prev = coin.pos;
  coin.pos = coinPos(coin.world);
  coin.vel = coinVel(coin.world);
  coin.speed = coinSpeed(coin.world);
  // 転がって見えるように、進んだ距離ぶんだけ回す(物理には影響しない)
  const dx = coin.pos.x - prev.x;
  const dy = coin.pos.y - prev.y;
  if (Math.abs(dx) + Math.abs(dy) < 200) coin.spin += Math.hypot(dx, dy) * Math.sign(dx || 1) / COIN_R;
  const pr = laneProject(lane, coin.pos);
  coin.u = pr.u;
  coin.perp = pr.perp;
}

export function canFlick(coin: CoinState): boolean {
  return coin.phase === 'ready';
}

export function pullToPower(pull: number): number {
  return P_MIN + (P_MAX - P_MIN) * pull;
}

/** 斜面に沿った初速を与える。転がりに合った回転も一緒に入れる */
export function flickCoin(coin: CoinState, power: number): boolean {
  if (!canFlick(coin)) return false;
  const lane = coin.lanes[coin.laneIndex]!;
  wakeCoin(coin.world);
  placeCoin(coin.world, coin.pos, { x: lane.dir.x * power, y: lane.dir.y * power });
  coin.phase = 'rolling';
  coin.flicked = true;
  coin.stuck = 0;
  sync(coin);
  return true;
}

/** 到達した段数 (1..ROW_COUNT)。あたりなら ROW_COUNT */
export function depthOf(coin: CoinState): number {
  if (coin.phase === 'win') return ROW_COUNT;
  return Math.min(ROW_COUNT, coin.laneIndex + 1);
}

function toLost(coin: CoinState, kind: LostKind, at: Vec2): void {
  coin.phase = 'lost';
  coin.lostKind = kind;
  coin.lostAt = at;
  coin.timer = FALL_ANIM;
}

/** 落ちた穴の中心。沈む演出の着地点にする */
function holeCenter(lane: Lane, from: number, to: number): Vec2 {
  return laneP(lane, (from + to) / 2, -COIN_R * 0.4);
}

export function stepCoin(coin: CoinState, dt: number): StepResult {
  const res = emptyResult();

  if (coin.phase === 'lost' || coin.phase === 'win') {
    coin.timer -= dt;
    // あたりのコインはカップに落ちきるまで物理を回し続ける
    if (coin.phase === 'win') {
      stepWorld(coin.world, dt);
      sync(coin);
    }
    if (coin.timer <= 0) res.finished = true;
    return res;
  }

  if (coin.phase === 'ready') return res;

  let settled = false;
  let prevU = coin.u;
  let prevPerp = coin.perp;
  stepWorld(coin.world, dt, () => {
    const pu = prevU;
    const pp = prevPerp;
    sync(coin);
    prevU = coin.u;
    prevPerp = coin.perp;
    settled =
      coin.phase === 'falling' ? checkFalling(coin, res) : checkRolling(coin, res, pu, pp);
    return settled;
  });
  sync(coin);

  if (!settled) updateStuck(coin, dt, res);
  return res;
}

/**
 * レーンの上にいるとき。穴・隙間・構えを見る。
 *
 * 結果は「レール面から PIT_DEPTH まで沈んだ瞬間の u」だけで決まる。
 * サブステップは 1/300 秒あり、900px/s では 1 歩で 3px 進むので、
 * そのまま見ると境目が 3px ぶんガタつき、弾く力に対して結果が
 * 単調でなくなる。前の歩との間で**線形補間して交差の瞬間を出す**。
 */
function checkRolling(coin: CoinState, res: StepResult, prevU: number, prevPerp: number): boolean {
  const lane = coin.lanes[coin.laneIndex]!;

  // レール面より下へ抜けた瞬間
  const tPit =
    prevPerp >= PIT_DEPTH && coin.perp < PIT_DEPTH
      ? (prevPerp - PIT_DEPTH) / (prevPerp - coin.perp)
      : Infinity;
  /*
   * 隙間の終わりから先には床が無いので、そこへ中心が届いた時点で
   * もう隙間に受け止められない = 強すぎが確定している。
   * 落ちきるのを待つと高い端の壁で跳ね返って戻り、隙間や手前の穴に
   * 落ちて「強すぎたのに助かる」が起きる。plan §4.2 が禁じる挙動なので、
   * 幾何で断ち切る。
   */
  const tOver =
    prevU <= lane.gap.to && coin.u > lane.gap.to
      ? (lane.gap.to - prevU) / (coin.u - prevU)
      : Infinity;

  if (tPit <= tOver && tPit !== Infinity) {
    const u = prevU + (coin.u - prevU) * tPit;
    if (inSpan(lane.nearHole, u)) {
      toLost(coin, 'weak', holeCenter(lane, lane.nearHole.from, lane.nearHole.to));
      res.lost = 'weak';
      return true;
    }
    if (u <= lane.gap.to) {
      res.droppedThrough = true;
      if (coin.laneIndex >= ROW_COUNT - 1) {
        coin.phase = 'win';
        coin.timer = WIN_ANIM;
        res.won = true;
      } else {
        coin.phase = 'falling';
        coin.targetIndex = coin.laneIndex + 1;
      }
      return true;
    }
  }

  if (tPit !== Infinity || tOver !== Infinity) {
    toLost(coin, 'strong', holeCenter(lane, lane.farHole.from, lane.farHole.to));
    res.lost = 'strong';
    return true;
  }

  if (
    coin.speed < REST_SPEED &&
    coin.u < READY_U &&
    coin.perp > COIN_R * 0.4 &&
    coin.perp < COIN_R * 2
  ) {
    coin.phase = 'ready';
    coin.stuck = 0;
    freezeCoin(coin.world);
    res.becameReady = true;
    return true;
  }

  return false;
}

/** 隙間から落ちているとき。1 段下のレーンに触れたら乗り換える */
function checkFalling(coin: CoinState, res: StepResult): boolean {
  const target = coin.lanes[coin.targetIndex]!;
  const pr = laneProject(target, coin.pos);
  if (pr.perp <= LAND_PERP && pr.perp > PIT_DEPTH) {
    coin.laneIndex = coin.targetIndex;
    coin.phase = 'rolling';
    coin.stuck = 0;
    res.landed = true;
    sync(coin);
    return true;
  }
  return false;
}

/**
 * 動かなくなったコインを助ける。
 * レールの角に乗ったまま静止すると、弾くこともできず結果も出ない
 * (=進行不能)。まず低い端へ軽く押し、それでも駄目なら決着させる。
 */
function updateStuck(coin: CoinState, dt: number, res: StepResult): void {
  if (coin.phase !== 'rolling' || coin.speed >= STUCK_SPEED) {
    coin.stuck = 0;
    return;
  }
  coin.stuck += dt;
  const lane = coin.lanes[coin.laneIndex]!;

  if (coin.stuck > STUCK_GIVEUP_AT) {
    const kind: LostKind = coin.u > lane.gap.from ? 'strong' : 'weak';
    toLost(coin, kind, { ...coin.pos });
    res.lost = kind;
    return;
  }
  if (coin.stuck > STUCK_NUDGE_AT) {
    placeCoin(coin.world, coin.pos, {
      x: -lane.dir.x * NUDGE_SPEED,
      y: -lane.dir.y * NUDGE_SPEED,
    });
    coin.stuck = STUCK_NUDGE_AT * 0.5;
  }
}
