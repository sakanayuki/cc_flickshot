/**
 * レーンの幾何。実機の写真に引かれた青い線そのものを、1 本の折れ線として持つ。
 *
 * レーンの形(上から下へ):
 *
 *      [投入口]
 *   走路0:  ←──────────────●   ← 右上から入って左へ走る
 *          ╭╯                    ● = 止まり木(レバー)。走路の端 = 壁ぎわ
 *   走路1:  ○○──────────────→●   ○ = 穴(アウト)。U ターンを出てすぐ
 *                            ╰╮
 *   走路2:  ●←──────────────○○
 *          ╭╯
 *   走路3:  ○○──────────────→●
 *                            ╰╮
 *   走路4:  ●←──────────────○○
 *          ╭╯
 *   走路5:  ○○──────────[あたり]  → その先にも穴(乗り越えたとき用)
 *
 * コインはこの折れ線の上を、経路に沿った距離 `s` だけで動く。
 * 止まり木から弾かれる → U ターンを回る → 穴を渡る → 次の止まり木で止まる、
 * が 1 回ぶんの操作。どの回も「U ターン + 穴 + 助走」の同じ並びを通るので、
 * 遊びの条件は最初から最後まで完全に同一になる。
 *
 * このモジュールは Canvas も DOM も参照しない。
 */

import {
  BOARD_LEFT,
  BOARD_RIGHT,
  COIN_R,
  ROW_COUNT,
  ROW_GAP,
  ROW_TOP_Y,
  RUN_COUNT,
  RUN_DROP,
  RUN_LEFT_X,
  RUN_RIGHT_X,
  type DifficultyConfig,
  type RunDir,
  type Vec2,
} from '../config.ts';

/** レーンの直線部分 1 本。見た目の装飾と止まり木の配置に使う */
export interface Run {
  index: number;
  dir: RunDir;
  from: Vec2;
  to: Vec2;
  /** 経路上での開始・終了距離 */
  startS: number;
  endS: number;
}

/** 止まり木(レバー)。ここでコインが止まり、ここから弾く */
export interface Stop {
  index: number;
  /** 経路上の距離 */
  s: number;
  pos: Vec2;
  /** どちらの壁ぎわか */
  side: RunDir;
}

/** 丸い落とし穴。勢いが足りないままここへ来ると落ちる */
export interface Hole {
  index: number;
  /** 経路上の区間 [s0, s1] */
  s0: number;
  s1: number;
  /** 見た目の丸。区間を隙間なく埋める */
  circles: Array<{ cx: number; cy: number; r: number }>;
  /** 演出でコインが吸い込まれる先 */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** 盤面のレーン一式 */
export interface Lane {
  /** 折れ線の頂点 */
  pts: Vec2[];
  /** pts[i] までの累積距離。pts と同じ長さ */
  cum: number[];
  /** 経路の全長 */
  length: number;
  runs: Run[];
  stops: Stop[];
  holes: Hole[];
  /** あたりの口の経路上の位置 */
  goalS: number;
  goalPos: Vec2;
}

/** U ターン 1 つを折れ線に刻む分割数 */
const TURN_STEPS = 14;
/** 穴を描く丸の直径のめやす。区間をこれに近い個数で割る */
const HOLE_CIRCLE_PITCH = 74;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * レーンの折れ線を作る。
 *
 * 走路 i は y = ROW_TOP_Y + i * ROW_GAP から RUN_DROP だけ下りながら、
 * 左右の端(RUN_LEFT_X / RUN_RIGHT_X)を結ぶ。端まで来たら半円の U ターンで
 * 1 段下の走路の始点へつなぐ。U ターンは壁の側へ膨らむ。
 */
function buildPolyline(): { pts: Vec2[]; runs: Run[] } {
  const pts: Vec2[] = [];
  const runs: Run[] = [];

  for (let i = 0; i < RUN_COUNT; i++) {
    // 走路0 は左へ。以降は交互
    const dir: RunDir = i % 2 === 0 ? 'left' : 'right';
    const y = ROW_TOP_Y + i * ROW_GAP;
    const from: Vec2 =
      dir === 'left' ? { x: RUN_RIGHT_X, y } : { x: RUN_LEFT_X, y };
    const to: Vec2 =
      dir === 'left'
        ? { x: RUN_LEFT_X, y: y + RUN_DROP }
        : { x: RUN_RIGHT_X, y: y + RUN_DROP };

    pts.push(from, to);
    runs.push({ index: i, dir, from, to, startS: 0, endS: 0 });

    // 最後の走路の先は U ターンせず、まっすぐ少し伸ばして終わる
    if (i === RUN_COUNT - 1) break;

    // U ターン。to から 1 段下の走路の始点(x は同じ)へ、壁側へ膨らむ半円
    const nextY = ROW_TOP_Y + (i + 1) * ROW_GAP;
    const cy = (to.y + nextY) / 2;
    const r = (nextY - to.y) / 2;
    const outward = dir === 'left' ? -1 : 1;
    for (let k = 1; k < TURN_STEPS; k++) {
      const a = (k / TURN_STEPS) * Math.PI;
      pts.push({
        x: to.x + outward * Math.sin(a) * r,
        y: cy - Math.cos(a) * r,
      });
    }
  }

  // あたりの口を乗り越えたコインが落ちる先。四分円で下へ逃がす
  const last = runs[runs.length - 1]!;
  const outward = last.dir === 'left' ? -1 : 1;
  const tailR = 56;
  for (let k = 1; k <= TURN_STEPS / 2; k++) {
    const a = (k / (TURN_STEPS / 2)) * (Math.PI / 2);
    pts.push({
      x: last.to.x + outward * Math.sin(a) * tailR,
      y: last.to.y + (1 - Math.cos(a)) * tailR,
    });
  }

  return { pts, runs };
}

/** 折れ線の累積距離と、走路ごとの s を埋める */
function measure(pts: Vec2[], runs: Run[]): { cum: number[]; length: number } {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + dist(pts[i - 1]!, pts[i]!));
  // 走路 i の from / to は折れ線のどこにあるか(from の頂点番号を数える)
  let vi = 0;
  for (const run of runs) {
    run.startS = cum[vi]!;
    run.endS = cum[vi + 1]!;
    vi += 2 + (run.index === runs.length - 1 ? 0 : TURN_STEPS - 1);
  }
  return { cum, length: cum[cum.length - 1]! };
}

/**
 * 盤面のレーン一式を作る。
 *
 * 止まり木は走路 0..ROW_COUNT-1 の終端(壁ぎわ)に置く。
 * 穴は「U ターンを出てすぐ」= 次の走路の始まりに置く。
 * つまり弾かれたコインは必ず「U ターン → 穴 → 助走 → 止まり木」の順に通る。
 */
export function buildLane(d: DifficultyConfig): Lane {
  const { pts, runs } = buildPolyline();
  const { cum, length } = measure(pts, runs);

  const at = (s: number): Vec2 => posOnPolyline(pts, cum, s);

  const stops: Stop[] = [];
  for (let i = 0; i < ROW_COUNT; i++) {
    const run = runs[i]!;
    stops.push({ index: i, s: run.endS, pos: run.to, side: run.dir });
  }

  const holes: Hole[] = [];
  // 走路 1..RUN_COUNT-1 の頭に 1 つずつ。最後にもう 1 つ、あたりの口の先に置く
  for (let i = 1; i < RUN_COUNT; i++) {
    holes.push(makeHole(holes.length, runs[i]!.startS, d.holeSpan, at));
  }
  const goalS = runs[RUN_COUNT - 1]!.endS;
  // 乗り越えたときの受け皿。レーンの残りが短いので入るだけ確保する
  const tailStart = goalS + 20;
  holes.push(makeHole(holes.length, tailStart, Math.min(d.holeSpan, length - tailStart), at));

  return { pts, cum, length, runs, stops, holes, goalS, goalPos: at(goalS) };
}

/** 経路上の区間 [s0, s0+span] を丸で埋めた穴を作る */
function makeHole(
  index: number,
  s0: number,
  span: number,
  at: (s: number) => Vec2,
): Hole {
  const n = Math.max(1, Math.round(span / HOLE_CIRCLE_PITCH));
  const step = span / n;
  const circles = Array.from({ length: n }, (_, k) => {
    const c = at(s0 + step * (k + 0.5));
    return { cx: c.x, cy: c.y, r: step / 2 };
  });
  const mid = at(s0 + span / 2);
  return {
    index,
    s0,
    s1: s0 + span,
    circles,
    cx: mid.x,
    cy: mid.y,
    rx: step / 2,
    ry: step / 2,
  };
}

// ---------------------------------------------------------------- 経路の上の幾何

function posOnPolyline(pts: Vec2[], cum: number[], s: number): Vec2 {
  const t = Math.max(0, Math.min(cum[cum.length - 1]!, s));
  // 二分探索で t を含む区間を見つける
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi]! - cum[lo]!;
  const u = seg > 0 ? (t - cum[lo]!) / seg : 0;
  return {
    x: pts[lo]!.x + (pts[hi]!.x - pts[lo]!.x) * u,
    y: pts[lo]!.y + (pts[hi]!.y - pts[lo]!.y) * u,
  };
}

/** 経路上の距離 s の座標 */
export function posAt(lane: Lane, s: number): Vec2 {
  return posOnPolyline(lane.pts, lane.cum, s);
}

/** 経路の進行方向(単位ベクトル) */
export function dirAt(lane: Lane, s: number): Vec2 {
  const a = posAt(lane, Math.max(0, s - 4));
  const b = posAt(lane, Math.min(lane.length, s + 4));
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

/** s が穴の上か。上なら穴を返す */
export function holeAt(lane: Lane, s: number): Hole | null {
  for (const h of lane.holes) if (s >= h.s0 && s <= h.s1) return h;
  return null;
}

/** s より先にある最初の穴 */
export function nextHole(lane: Lane, s: number): Hole | null {
  for (const h of lane.holes) if (h.s1 > s) return h;
  return null;
}

/** 穴を渡りきってから止まり木までの助走距離。成功域の広さを決める */
export function runUpLength(lane: Lane, stopIndex: number): number {
  const stop = lane.stops[stopIndex]!;
  // その止まり木の直前にある穴
  let last: Hole | null = null;
  for (const h of lane.holes) if (h.s1 <= stop.s) last = h;
  return last ? stop.s - last.s1 : stop.s;
}

/** 弾く向き(画面上のどちらへ走り出すか)。止まり木の位置で決まる */
export function stopFlickDirX(stop: Stop): number {
  // 左端の止まり木なら、U ターンを回った先は右向きの走路
  return stop.side === 'left' ? 1 : -1;
}

export const WALL_LEFT_X = BOARD_LEFT;
export const WALL_RIGHT_X = BOARD_RIGHT;

/** U ターンが壁へ食い込んでいないか(検算用) */
export function turnOuterMargin(): number {
  const r = (ROW_GAP - RUN_DROP) / 2;
  return RUN_LEFT_X - r - (BOARD_LEFT + COIN_R);
}

export { RUN_LEFT_X, RUN_RIGHT_X };
