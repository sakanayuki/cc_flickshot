/**
 * 盤面の幾何。ここには物理も描画も無い。純粋な座標計算だけ。
 *
 * 5 段のレーンはすべて合同(左右反転のみ)で、低い端が右・左・右…と交互に
 * 入れ替わる。低い端は壁ぎわにあり、その横からレバーが生えている。
 */

import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  COIN_R,
  LANE_LEFT_X,
  LANE_RIGHT_X,
  LANE_RISE,
  LANE_SPAN_X,
  LANE_THICK,
  MAX_REACH,
  ROW_COUNT,
  ROW_GAP,
  ROW_TOP_Y,
  SOLID_RUN,
  type DifficultyConfig,
  type LaneSide,
  type Span,
  type Vec2,
} from '../config.ts';

export interface Lane {
  index: number;
  /** 低い端(ストッパー・レバー)がどちらの壁か */
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
  nearHole: Span;
  gap: Span;
  farHole: Span;
  /** 床のある区間。Matter.js の静的剛体はここにだけ置く */
  solids: Span[];
}

export interface WinPocket {
  /** 開口の中心 */
  center: Vec2;
  w: number;
  h: number;
}

function sideOf(index: number): LaneSide {
  return index % 2 === 0 ? 'right' : 'left';
}

/** レーン 1 本ぶんの長さ。全段共通 */
export const LANE_LENGTH = Math.hypot(LANE_SPAN_X, LANE_RISE);

/** 隙間の終わり。ここから先は奥の穴 = 強すぎ。難易度によらず固定 */
export const GAP_END_U = SOLID_RUN + MAX_REACH;

export function buildLanes(d: DifficultyConfig): Lane[] {
  const nearHole: Span = { from: SOLID_RUN, to: SOLID_RUN + d.nearHoleSpan };
  const gap: Span = { from: nearHole.to, to: GAP_END_U };
  const farHole: Span = { from: GAP_END_U, to: LANE_LENGTH };

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
      nearHole,
      gap,
      farHole,
      // 床はレールの 1 本だけ。ここから先はすべて落とし口
      solids: [{ from: 0, to: SOLID_RUN }],
    };
  });
}

/** レーン上の点。u = 低い端からの距離、perp = レーン面からの高さ */
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
 * コインが構えるときの中心位置。ストッパーとレール面の両方にちょうど接する。
 *
 * ここが 1px でも浮いていると、弾いた直後にコインが落ちて跳ね、
 * その跳ねの位相がレールの端に届くタイミング次第で落下位置を変えてしまう。
 * 弾く力に対して結果が単調でなくなるので、厳密に接地させること。
 */
export function restPoint(lane: Lane): Vec2 {
  return laneP(lane, COIN_R, COIN_R);
}

export function inSpan(s: Span, u: number): boolean {
  return u >= s.from && u <= s.to;
}

/**
 * 隙間から落ちたコインが 1 段下のレーンに着く位置(そのレーンの u')の上限。
 *
 * 段は左右反転なので、真下に落ちれば u' = レーン長 - u。実際には
 * 落ちるときの水平速度でもっと低い端の側へ寄るので、これが最悪値になる。
 * ここが手前の穴に掛かると、着地したコインが滑り降りる途中で
 * 自分から落ちてしまう(検算 §1 が数値で固定している)。
 */
export function maxLandingU(d: DifficultyConfig): number {
  return LANE_LENGTH - (SOLID_RUN + d.nearHoleSpan);
}

/**
 * あたりの口。最下段の隙間から落ちたコインは、勢いを持ったまま
 * 高い端の側の壁へ飛んでいく。受け口はその壁ぎわの床に置く。
 */
export const POCKET_W = 236;
export const POCKET_H = 96;

export function buildWinPocket(lanes: Lane[]): WinPocket {
  const last = lanes[lanes.length - 1]!;
  const toLeft = last.high.x < last.low.x;
  const x = toLeft ? BOARD_LEFT + POCKET_W / 2 : BOARD_RIGHT - POCKET_W / 2;
  return {
    center: { x, y: BOARD_BOTTOM - 18 - POCKET_H / 2 },
    w: POCKET_W,
    h: POCKET_H,
  };
}

/** ある段の低い端と、1 段下の高い端とのあいだの垂直の空き */
export const ROW_CLEARANCE = ROW_GAP - LANE_RISE;

/** 落ちたコインとレールの厚みが通れるか(検算 §1 が固定する) */
export const ROW_CLEARANCE_NEEDED = 2 * COIN_R + LANE_THICK;

/** 投入されたコインが 1 段目に出てくる位置 */
export const ENTRY_U = SOLID_RUN * 0.45;
