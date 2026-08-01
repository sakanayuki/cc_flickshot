/**
 * 盤面の幾何。ここには物理も描画も無い。純粋な座標計算だけ。
 *
 * 5 段のレーンは長さも傾きも同じで、低い端が右・左・右…と交互に入れ替わる。
 * **違うのは受け皿の並びだけ**で、下の段ほど「まん中の受け皿」が遠くて狭い。
 */

import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  COIN_R,
  FIN_T,
  FLOOR_T,
  HOLE_FROM_BASE,
  HOLE_FROM_STEP,
  HOLE_SPAN_BASE,
  HOLE_SPAN_MIN,
  HOLE_SPAN_STEP,
  LANE_LEFT_X,
  LANE_RIGHT_X,
  LANE_RISE,
  LANE_SPAN_X,
  LANE_THICK,
  PIT_DEPTH,
  RAIL_RUN,
  RIM_BASE,
  RIM_STEP,
  ROW_COUNT,
  ROW_GAP,
  ROW_TOP_Y,
  type LaneSide,
  type Span,
  type Vec2,
} from '../config.ts';

/** 落ちた先の種類。棚(good)だけが 1 段下へつながっている */
export type BinKind = 'weak' | 'good' | 'strong';

export interface Bin {
  kind: BinKind;
  /** レーンに沿った範囲 */
  from: number;
  to: number;
}

export interface Lane {
  index: number;
  /** 低い端(レバーのある側)がどちらの壁か */
  side: LaneSide;
  low: Vec2;
  high: Vec2;
  /** レーンに沿った全長 */
  length: number;
  /** 低い端 → 高い端の単位ベクトル */
  dir: Vec2;
  /** レーン面から上向きの単位法線 */
  norm: Vec2;
  /** dir の角度 (rad)。Matter.js の body.angle に渡す */
  angle: number;
  /** sinθ。斜面の減速の強さ */
  slope: number;
  /** 床のあるレール */
  rail: Span;
  /** 手前のポケット / 落とし穴 / 奥のポケット。u の小さい順 */
  bins: Bin[];
  /** フィンの頂点の深さ(レール面から)。段が下るほど深い */
  rim: number;
}

export interface WinPocket {
  center: Vec2;
  w: number;
  h: number;
}

function sideOf(index: number): LaneSide {
  return index % 2 === 0 ? 'right' : 'left';
}

/** レーン 1 本ぶんの長さ。全段共通 */
export const LANE_LENGTH = Math.hypot(LANE_SPAN_X, LANE_RISE);

/** 窪みの長さ */
export const MOUTH_LENGTH = LANE_LENGTH - RAIL_RUN;

/** 段 index のフィンの頂点の深さ。2 枚とも同じ深さ(config.ts の理由を参照) */
export function rimOf(index: number): number {
  return RIM_BASE + RIM_STEP * index;
}

/** 段 index の落とし穴の手前の縁(レール端からの距離)。下の段ほど遠い */
export function holeFrom(index: number): number {
  return HOLE_FROM_BASE + HOLE_FROM_STEP * index;
}

/** 段 index の落とし穴の幅。下の段ほど狭い */
export function holeSpan(index: number): number {
  return Math.max(HOLE_SPAN_MIN, HOLE_SPAN_BASE - HOLE_SPAN_STEP * index);
}

/** 段 index の落とし穴の奥の縁 */
export function holeTo(index: number): number {
  return holeFrom(index) + holeSpan(index);
}

function binsOf(index: number): Bin[] {
  const from = RAIL_RUN + holeFrom(index);
  const to = RAIL_RUN + holeTo(index);
  return [
    { kind: 'weak', from: RAIL_RUN, to: from },
    { kind: 'good', from, to },
    { kind: 'strong', from: to, to: LANE_LENGTH },
  ];
}

export function buildLanes(): Lane[] {
  return Array.from({ length: ROW_COUNT }, (_, i): Lane => {
    const side = sideOf(i);
    const y = ROW_TOP_Y + i * ROW_GAP;
    const low: Vec2 = { x: side === 'right' ? LANE_RIGHT_X : LANE_LEFT_X, y };
    const high: Vec2 = { x: side === 'right' ? LANE_LEFT_X : LANE_RIGHT_X, y: y - LANE_RISE };

    const dir: Vec2 = {
      x: (high.x - low.x) / LANE_LENGTH,
      y: (high.y - low.y) / LANE_LENGTH,
    };
    // 上向き(y が負)の法線を選ぶ
    let norm: Vec2 = { x: -dir.y, y: dir.x };
    if (norm.y > 0) norm = { x: -norm.x, y: -norm.y };

    return {
      index: i,
      side,
      low,
      high,
      length: LANE_LENGTH,
      dir,
      norm,
      angle: Math.atan2(dir.y, dir.x),
      slope: LANE_RISE / LANE_LENGTH,
      rail: { from: 0, to: RAIL_RUN },
      bins: binsOf(i),
      rim: rimOf(i),
    };
  });
}

/** レーン上の点。u = 低い端からの距離、perp = レール面からの高さ */
export function laneP(lane: Lane, u: number, perp = 0): Vec2 {
  return {
    x: lane.low.x + lane.dir.x * u + lane.norm.x * perp,
    y: lane.low.y + lane.dir.y * u + lane.norm.y * perp,
  };
}

/** 任意の点を、そのレーンの (u, perp) に射影する */
export function laneProject(lane: Lane, p: Vec2): { u: number; perp: number } {
  const dx = p.x - lane.low.x;
  const dy = p.y - lane.low.y;
  return {
    u: dx * lane.dir.x + dy * lane.dir.y,
    perp: dx * lane.norm.x + dy * lane.norm.y,
  };
}

/**
 * コインが構えるときの中心位置。壁とレール面の両方にちょうど接する。
 *
 * ここが 1px でも浮いていると、弾いた直後にコインが落ちて跳ね、
 * その跳ねの位相がレールの端に届くタイミング次第で飛距離を変えてしまう。
 * 弾く力に対して結果が単調でなくなるので、厳密に接地させること。
 */
export function restPoint(lane: Lane): Vec2 {
  return laneP(lane, COIN_R, COIN_R);
}

/** いちばん深いフィンの頂点(= いちばん低いフィン)。段が下るほど浅くなる */
export const RIM_MAX = Math.max(rimOf(0), rimOf(ROW_COUNT - 1));

/**
 * どのフィンの頂点よりも深い = もうどれかのポケットの中にいる。
 * ここから先は「底の上で止まる」か「穴を抜ける」かのどちらか。
 */
export const IN_BIN_PERP = -(RIM_MAX + 4);
/**
 * 穴を抜けきった深さ。ポケットの底で止まったコインの中心は
 * `-(PIT_DEPTH - COIN_R)` までしか下がらないので、ここには絶対に届かない。
 */
export const THROUGH_PERP = -(PIT_DEPTH + COIN_R);

export function binAt(lane: Lane, u: number): Bin {
  for (const b of lane.bins) if (u < b.to) return b;
  return lane.bins[lane.bins.length - 1]!;
}

/** 落とし穴のまん中 */
export function holeMidU(lane: Lane): number {
  const good = lane.bins[1]!;
  return (good.from + good.to) / 2;
}

/** 穴から落ちたコインが 1 段下のレーンに着く位置(穴のまん中を通ったとき) */
export function landingU(lane: Lane): number {
  return LANE_LENGTH - holeMidU(lane);
}

/**
 * あたりの口。最下段の落とし穴の真下に置く。
 */
export const POCKET_W = 236;
export const POCKET_H = 76;

export function buildWinPocket(lanes: Lane[]): WinPocket {
  const last = lanes[lanes.length - 1]!;
  const drop = laneP(last, holeMidU(last));
  const half = POCKET_W / 2;
  const x = Math.min(Math.max(drop.x, BOARD_LEFT + half), BOARD_RIGHT - half);
  return {
    center: { x, y: BOARD_BOTTOM - 10 - POCKET_H / 2 },
    w: POCKET_W,
    h: POCKET_H,
  };
}

/**
 * 段 i のレーン面と、1 段下のレーン面との垂直の空き(同じ x で測る)。
 *
 * 2 本のレーンは互い違いに傾いているので、空きは u とともに広がる。
 * いちばん狭いのは窪みの手前の端、つまり u = RAIL_RUN のところ。
 */
export function rowClearanceAt(u: number): number {
  return ROW_GAP + LANE_RISE * ((2 * u) / LANE_LENGTH - 1);
}

/** 窪みがぶら下がっている深さ */
export const MOUTH_HANG = PIT_DEPTH + FLOOR_T;

/** 落ちたコインが上の段の窪みの下を通れるか(検算 §1 が固定する) */
export const ROW_CLEARANCE = rowClearanceAt(RAIL_RUN);
export const ROW_CLEARANCE_NEEDED = MOUTH_HANG + 2 * COIN_R;

/** 手前のポケットと落とし穴で、コインが通れる正味の幅 */
export function clearWidth(span: number): number {
  return span - FIN_T;
}

/** 投入されたコインが 1 段目に出てくる位置 */
export const ENTRY_U = RAIL_RUN * 0.45;

/** レール下の背板の上端(レール面からの深さ) */
export const BACKSTOP_TOP = LANE_THICK + 4;
