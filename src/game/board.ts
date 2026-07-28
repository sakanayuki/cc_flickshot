/**
 * レーン・穴・ゴール・壁の定義と幾何計算。詳細設計書 §3。
 *
 * このモジュールは Canvas も DOM も参照しない。
 */

import {
  BOARD_LEFT,
  BOARD_RIGHT,
  COIN_R,
  DIFFICULTIES,
  GOAL_FLOOR_Y,
  GOAL_LIP_TOP,
  GOAL_LIP_X,
  LANES,
  LANE_SPAN,
  type DifficultyConfig,
  type Hole,
  type Lane,
  type Vec2,
} from '../config.ts';

/** レーン上の位置 s (0 = 高い端、1 = レバー端) → 座標 */
export function pointAt(lane: Lane, s: number): Vec2 {
  return {
    x: lane.hi.x + (lane.lo.x - lane.hi.x) * s,
    y: lane.hi.y + (lane.lo.y - lane.hi.y) * s,
  };
}

/** s が増える向き(= 下り坂の向き)の単位接線 */
export function tangentAt(lane: Lane): Vec2 {
  const dx = lane.lo.x - lane.hi.x;
  const dy = lane.lo.y - lane.hi.y;
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
}

/** 上向き(y が小さくなる向き)の単位法線 */
export function normalAt(lane: Lane): Vec2 {
  const t = tangentAt(lane);
  const n = { x: t.y, y: -t.x };
  return n.y > 0 ? { x: -n.x, y: -n.y } : n;
}

/** レーン表面からの符号付き距離。正 = レーンより上 */
export function signedDistanceToLane(lane: Lane, p: Vec2): number {
  const n = normalAt(lane);
  return (p.x - lane.hi.x) * n.x + (p.y - lane.hi.y) * n.y;
}

/** x 座標 → レーン上の s。レーンの範囲外なら [0,1] の外の値を返す */
export function sAtX(lane: Lane, x: number): number {
  return (x - lane.hi.x) / (lane.lo.x - lane.hi.x);
}

/** 点をレーン上に射影したときの s */
export function sAtPoint(lane: Lane, p: Vec2): number {
  const dx = lane.lo.x - lane.hi.x;
  const dy = lane.lo.y - lane.hi.y;
  const len2 = dx * dx + dy * dy;
  return ((p.x - lane.hi.x) * dx + (p.y - lane.hi.y) * dy) / len2;
}

/** レーン表面の y 座標(x がレーンの範囲内であること) */
export function laneSurfaceY(lane: Lane, x: number): number {
  const s = sAtX(lane, x);
  return lane.hi.y + (lane.lo.y - lane.hi.y) * s;
}

/** レーンが x をカバーしているか */
export function laneCoversX(lane: Lane, x: number): boolean {
  const lo = Math.min(lane.hi.x, lane.lo.x);
  const hi = Math.max(lane.hi.x, lane.lo.x);
  return x >= lo && x <= hi;
}

/** レバー端の向き。右レバーなら +1(x が増える向きが下り) */
export function downhillSignX(lane: Lane): number {
  return lane.lo.x > lane.hi.x ? 1 : -1;
}

/** 弾く向き(盤面内側)。右レバーなら -1(左向き) */
export function inwardSignX(lane: Lane): number {
  return -downhillSignX(lane);
}

// ---------------------------------------------------------------- 穴

export function buildHoles(d: DifficultyConfig): Hole[] {
  const holes: Hole[] = [];
  for (const lane of LANES) {
    const list = d.holeS[lane.index] ?? [];
    for (const s of list) {
      holes.push({
        laneIndex: lane.index,
        s,
        radius: d.holeRadius,
        center: pointAt(lane, s),
      });
    }
  }
  return holes;
}

export function holesOnLane(holes: readonly Hole[], laneIndex: number): Hole[] {
  return holes.filter((h) => h.laneIndex === laneIndex);
}

// ---------------------------------------------------------------- ゴール

export interface GoalLip {
  x: number;
  top: number;
  bottom: number;
  /** コイン中心がこの y 以下ならリップを越えられる */
  clearY: number;
}

export function goalLip(): GoalLip {
  const topLane = LANES[LANES.length - 1]!;
  return {
    x: GOAL_LIP_X,
    top: GOAL_LIP_TOP,
    bottom: laneSurfaceY(topLane, GOAL_LIP_X),
    clearY: GOAL_LIP_TOP - COIN_R,
  };
}

export interface GoalFloor {
  y: number;
  left: number;
  right: number;
  /** コイン中心がこの y に達したら着地 */
  landY: number;
}

export function goalFloor(d: DifficultyConfig): GoalFloor {
  return {
    y: GOAL_FLOOR_Y,
    left: d.goalBasketLeft,
    right: GOAL_LIP_X,
    landY: GOAL_FLOOR_Y - COIN_R,
  };
}

// ---------------------------------------------------------------- 壁

export const WALL_LEFT_X = BOARD_LEFT;
export const WALL_RIGHT_X = BOARD_RIGHT;

/** レーン上の距離 (px) → s の差 */
export function pxToS(px: number): number {
  return px / LANE_SPAN;
}

/** s の差 → レーン上の距離 (px) */
export function sToPx(s: number): number {
  return s * LANE_SPAN;
}

export const DEFAULT_DIFFICULTY = DIFFICULTIES.easy;
