/**
 * コインの状態機械。
 *
 * **落ちる / 落ちないを決めるルールはここに一切無い。**
 * レールもフィンもポケットの底も Matter.js の実体なので、コインは実際に
 * どれかのポケットへ落ちて止まる。ここがやるのは、
 * 「いまコインがどのポケットの中にいるか」を位置から読むことだけ。
 *
 * 位置はレーンに沿った座標 (u, perp) に射影して見る。
 *   u    = そのレーンの低い端からの距離
 *   perp = レール面からの高さ。載っているとき COIN_R、受け皿の中では負
 */

import { COIN_R, FALL_ANIM, P_MIN, REST_SPEED, ROW_COUNT, WIN_ANIM, type Vec2 } from '../config.ts';
import {
  binAt,
  ENTRY_U,
  IN_BIN_PERP,
  laneP,
  laneProject,
  restPoint,
  THROUGH_PERP,
  type Bin,
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

export type CoinPhase = 'rolling' | 'ready' | 'inBin' | 'falling' | 'lost' | 'win';
export type LostKind = 'weak' | 'strong';

/** 着地とみなす接触距離 */
const LAND_PERP = COIN_R + 3;
/** 構えに入る条件。壁ぎわに寄っていて、ほぼ止まっている */
const READY_U = COIN_R + 10;

/** 受け皿に入ったコインが落ち着くのを待つ上限 (s) */
const SETTLE_LIMIT = 2.5;
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
  /** 入った受け皿。まだ入っていなければ null */
  bin: Bin | null;
  lostKind: LostKind | null;
  /** 一度でも弾かれたか */
  flicked: boolean;

  pos: Vec2;
  vel: Vec2;
  /** 見た目の回転 (rad)。物理では回さず、進んだ距離から作る */
  spin: number;
  u: number;
  perp: number;
  speed: number;

  /** 受け皿の中で落ち着くのを待っている時間 */
  settle: number;
  /** lost / win の演出タイマ(秒、カウントダウン) */
  timer: number;
}

export interface StepResult {
  becameReady: boolean;
  /** この step でどれかの受け皿に入った */
  enteredBin: BinKindOrNull;
  /** この step でまん中の受け皿の出口を抜けた */
  droppedThrough: boolean;
  /** この step で 1 段下に着地した */
  landed: boolean;
  lost: LostKind | null;
  won: boolean;
  /** 演出が終わってリザルトへ移ってよい */
  finished: boolean;
}

type BinKindOrNull = 'weak' | 'good' | 'strong' | null;

function emptyResult(): StepResult {
  return {
    becameReady: false,
    enteredBin: null,
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
    bin: null,
    lostKind: null,
    flicked: false,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    spin: 0,
    u: 0,
    perp: 0,
    speed: 0,
    settle: 0,
    timer: 0,
  };
  resetToEntry(coin);
  return coin;
}

/** 1 段目に投入された状態にする。レールを滑って壁ぎわへ向かう */
export function resetToEntry(coin: CoinState): void {
  const lane = coin.lanes[0]!;
  coin.phase = 'rolling';
  coin.laneIndex = 0;
  coin.targetIndex = 0;
  coin.bin = null;
  coin.lostKind = null;
  coin.flicked = false;
  coin.settle = 0;
  coin.timer = 0;
  placeCoin(coin.world, laneP(lane, ENTRY_U, COIN_R));
  sync(coin);
}

/**
 * 壁ぎわで構えた状態を作る(テストと検算用)。
 *
 * 理想の座標に置くだけでは接地が厳密でないので、実際に少しだけ
 * 物理を回して落ち着かせる。ゲーム中に自然に構えたときとまったく
 * 同じ状態になり、同じ力で弾けば同じ結果になる。
 */
export function placeReady(coin: CoinState, laneIndex: number): void {
  const lane = coin.lanes[laneIndex]!;
  coin.laneIndex = laneIndex;
  coin.targetIndex = laneIndex;
  coin.bin = null;
  coin.settle = 0;
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
  if (Math.abs(dx) + Math.abs(dy) < 200) {
    coin.spin += (Math.hypot(dx, dy) * Math.sign(dx || 1)) / COIN_R;
  }
  const pr = laneProject(lane, coin.pos);
  coin.u = pr.u;
  coin.perp = pr.perp;
}

export function canFlick(coin: CoinState): boolean {
  return coin.phase === 'ready';
}

/** 引き量 0..1 → 斜面に沿った初速。上限は難易度ごと */
export function pullToPower(pull: number, powerMax: number): number {
  return P_MIN + (powerMax - P_MIN) * pull;
}

/** 斜面に沿った初速を与える */
export function flickCoin(coin: CoinState, power: number): boolean {
  if (!canFlick(coin)) return false;
  const lane = coin.lanes[coin.laneIndex]!;
  wakeCoin(coin.world);
  placeCoin(coin.world, coin.pos, { x: lane.dir.x * power, y: lane.dir.y * power });
  coin.phase = 'rolling';
  coin.flicked = true;
  coin.settle = 0;
  sync(coin);
  return true;
}

/** 到達した段数 (1..ROW_COUNT)。あたりなら ROW_COUNT */
export function depthOf(coin: CoinState): number {
  if (coin.phase === 'win') return ROW_COUNT;
  return Math.min(ROW_COUNT, coin.laneIndex + 1);
}

export function stepCoin(coin: CoinState, dt: number): StepResult {
  const res = emptyResult();

  if (coin.phase === 'lost' || coin.phase === 'win') {
    coin.timer -= dt;
    // 演出のあいだもコインは受け皿の中で動いているので、物理は回し続ける
    stepWorld(coin.world, dt);
    sync(coin);
    if (coin.timer <= 0) res.finished = true;
    return res;
  }

  if (coin.phase === 'ready') return res;

  let settled = false;
  stepWorld(coin.world, dt, () => {
    sync(coin);
    settled = advance(coin, res);
    return settled;
  });
  sync(coin);

  if (coin.phase === 'inBin') updateInBin(coin, dt, res);
  return res;
}

/** サブステップごとの見張り。状態ごとに見るものが違う */
function advance(coin: CoinState, res: StepResult): boolean {
  switch (coin.phase) {
    case 'rolling':
      return checkRolling(coin, res);
    case 'falling':
      return checkFalling(coin, res);
    case 'inBin':
      return checkInBin(coin, res);
    default:
      return true;
  }
}

/**
 * レールの上、または飛んでいるとき。
 * どのフィンの頂点よりも深く沈んだら、もうどれかのポケットの中にいる。
 *
 * **ここではまだどのポケットかを決めない。** 面を横切った瞬間の u で決めると、
 * そのあとフィンに当たって隣へ落ちたコインを取り違える。
 * 決めるのは「実際に止まった場所」か「実際に穴を抜けたか」だけ。
 */
function checkRolling(coin: CoinState, res: StepResult): boolean {
  if (coin.perp < IN_BIN_PERP) {
    coin.phase = 'inBin';
    coin.bin = null;
    coin.settle = 0;
    return true;
  }

  if (
    coin.speed < REST_SPEED &&
    coin.u < READY_U &&
    coin.perp > COIN_R * 0.4 &&
    coin.perp < COIN_R * 2
  ) {
    coin.phase = 'ready';
    freezeCoin(coin.world);
    res.becameReady = true;
    return true;
  }

  return false;
}

/**
 * ポケットの中。**底が無いのはまん中だけ**なので、ここまで沈んだ時点で
 * 「進める」が物理的に確定している。
 * 手前と奥のポケットには底があり、コインはその上で止まる。
 */
function checkInBin(coin: CoinState, res: StepResult): boolean {
  if (coin.perp > THROUGH_PERP) return false;

  coin.bin = binAt(coin.lanes[coin.laneIndex]!, coin.u);
  res.enteredBin = 'good';
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

/** 出口を抜けて落ちているとき。1 段下のレーンに触れたら乗り換える */
function checkFalling(coin: CoinState, res: StepResult): boolean {
  const target = coin.lanes[coin.targetIndex]!;
  const pr = laneProject(target, coin.pos);
  if (pr.perp <= LAND_PERP && pr.perp > IN_BIN_PERP) {
    coin.laneIndex = coin.targetIndex;
    coin.phase = 'rolling';
    coin.bin = null;
    res.landed = true;
    sync(coin);
    return true;
  }
  return false;
}

/**
 * 底のあるポケットに落ちたコインが**止まるのを待ってから**結果を読む。
 *
 * 転がっている最中に読むと、そのあとフィンに弾かれて隣へ移るコインを
 * 取り違える。止まってしまえば、フィンが実体としてコインを分けているので
 * u を見るだけでどのポケットかが一意に決まる。
 */
function updateInBin(coin: CoinState, dt: number, res: StepResult): void {
  coin.settle += dt;
  const stopped = coin.speed < REST_SPEED && coin.settle > 0.12;
  if (!stopped && coin.settle < SETTLE_LIMIT) return;

  const bin = binAt(coin.lanes[coin.laneIndex]!, coin.u);
  coin.bin = bin;
  res.enteredBin = bin.kind;
  if (bin.kind === 'good') {
    // 底が無いので止まることは無いはずだが、詰ませないための保険
    coin.settle = 0;
    return;
  }
  coin.phase = 'lost';
  coin.lostKind = bin.kind;
  coin.timer = FALL_ANIM;
  res.lost = bin.kind;
}
