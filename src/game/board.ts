/**
 * 盤面の幾何。実機の写真と同じ、**ななめ上向きのレーン**が段になって並ぶ。
 *
 * レーン 1 本を低い端(u=0)から見た並び:
 *
 *   レバー
 *     ●━━━━━━━○○━━━━┈┈┈┈┈┈┈┈━━●●●
 *     0      手前の穴  隙間          奥の穴   高い端
 *            (弱すぎ) (ここから落ちる) (強すぎ)
 *
 * 盤面全体(段ごとに低い端が右・左・右…と入れ替わる):
 *
 *              [投入口]
 *   段1:  ●●●━┈┈┈━○○━━━━━━━━●   ← 低い端は右。左上へ登る
 *              ↓ 隙間から落ちる
 *   段2:  ●━━━━━━━━○○━┈┈┈━●●●   ← 低い端は左。右上へ登る
 *                        ↓
 *   段3:  ●●●━┈┈┈━○○━━━━━━━━●
 *              ↓
 *   ...
 *   あたりの口は最下段の隙間の真下に置く。
 *
 * 隙間から落ちたコインは 1 段下のレーンの**低い端寄り**に着地し、
 * そのまま滑り降りてレバーで止まる。だから手前の穴は着地点より奥に置く。
 *
 * このモジュールは Canvas も DOM も参照しない。
 */

import {
  BOARD_LEFT,
  BOARD_RIGHT,
  COIN_R,
  GAP_END_U,
  GAP_LEAD_U,
  GRAVITY,
  HOLE_NEAR_U,
  LANE_LEFT_X,
  LANE_RIGHT_X,
  LANE_RISE,
  LANE_SPAN_X,
  ROW_COUNT,
  ROW_GAP,
  ROW_TOP_Y,
  type DifficultyConfig,
  type LaneSide,
  type Vec2,
} from '../config.ts';

/** レーンに沿った区間 */
export interface Span {
  from: number;
  to: number;
}

/** ななめ上向きのレーン 1 本 */
export interface Lane {
  index: number;
  /** 低い端がどちらの壁ぎわか。ここにレバーが立つ */
  side: LaneSide;
  /** 低い端(u=0)。コインが止まる位置 */
  low: Vec2;
  /** 高い端(u=length) */
  high: Vec2;
  /** 斜面の長さ */
  length: number;
  /** 低い端→高い端の単位ベクトル */
  dir: Vec2;
  /** 斜面に沿った重力の減速 = GRAVITY * sinθ。全段で同じ */
  decel: number;
  /** 手前の穴(弱すぎ) */
  nearHole: Span;
  /** 進める隙間。ここから落ちると 1 段下へ */
  gap: Span;
  /** 奥の穴(強すぎ)。高い端まで */
  farHole: Span;
}

/** あたりの口。最下段の隙間の真下に置く */
export interface WinPocket {
  left: number;
  right: number;
  /** 受け口の高さ。コイン中心がこの y に達したら判定する */
  y: number;
}

/** 段 index の低い端がどちらの壁か。1 段目は右(投入口の側) */
function sideOf(index: number): LaneSide {
  return index % 2 === 0 ? 'right' : 'left';
}

/**
 * レーンを作る。全段まったく同じ形(左右反転のみ)なので、
 * 5 回の操作の条件は構造的に完全一致する。
 */
export function buildLanes(d: DifficultyConfig): Lane[] {
  const length = Math.hypot(LANE_SPAN_X, LANE_RISE);
  const decel = (GRAVITY * LANE_RISE) / length; // GRAVITY * sinθ
  const nearFrom = HOLE_NEAR_U;
  const nearTo = nearFrom + d.nearHoleSpan;
  const gapFrom = nearTo + GAP_LEAD_U;

  return Array.from({ length: ROW_COUNT }, (_, i): Lane => {
    const side = sideOf(i);
    const y = ROW_TOP_Y + i * ROW_GAP;
    const low: Vec2 = { x: side === 'right' ? LANE_RIGHT_X : LANE_LEFT_X, y };
    const high: Vec2 = {
      x: side === 'right' ? LANE_LEFT_X : LANE_RIGHT_X,
      y: y - LANE_RISE,
    };
    return {
      index: i,
      side,
      low,
      high,
      length,
      dir: { x: (high.x - low.x) / length, y: (high.y - low.y) / length },
      decel,
      nearHole: { from: nearFrom, to: nearTo },
      gap: { from: gapFrom, to: GAP_END_U },
      farHole: { from: GAP_END_U, to: length },
    };
  });
}

/**
 * あたりの口。最下段の隙間の真下、落ちてきたコインをそのまま受ける位置に置く。
 * 幅も隙間と同じなので、6 回目の操作も他とまったく同じ条件になる。
 */
export function buildWinPocket(d: DifficultyConfig): WinPocket {
  const lanes = buildLanes(d);
  const last = lanes[ROW_COUNT - 1]!;
  const a = posOnLane(last, last.gap.from).x;
  const b = posOnLane(last, last.gap.to).x;
  return {
    left: Math.min(a, b),
    right: Math.max(a, b),
    y: last.low.y + ROW_GAP,
  };
}

// ---------------------------------------------------------------- 斜面の上の幾何

/** レーン上の距離 u の座標 */
export function posOnLane(lane: Lane, u: number): Vec2 {
  return { x: lane.low.x + lane.dir.x * u, y: lane.low.y + lane.dir.y * u };
}

/** この x はレーンの何 u か。x がレーンの範囲外なら範囲外の値を返す */
export function laneUAtX(lane: Lane, x: number): number {
  return (x - lane.low.x) / lane.dir.x;
}

/** レーンの上面の y(コインの中心が来る高さ)。x はレーンの範囲内であること */
export function laneYAtX(lane: Lane, x: number): number {
  return lane.low.y + lane.dir.y * laneUAtX(lane, x);
}

/** x がレーンの水平範囲に入っているか */
export function xOnLane(_lane: Lane, x: number): boolean {
  return x >= LANE_LEFT_X - 0.5 && x <= LANE_RIGHT_X + 0.5;
}

function inSpan(s: Span, u: number): boolean {
  return u >= s.from && u <= s.to;
}

/** u が手前の穴の上か */
export function inNearHole(lane: Lane, u: number): boolean {
  return inSpan(lane.nearHole, u);
}

/** u が隙間の上か */
export function inGap(lane: Lane, u: number): boolean {
  return inSpan(lane.gap, u);
}

/** u が奥の穴の上か */
export function inFarHole(lane: Lane, u: number): boolean {
  return inSpan(lane.farHole, u);
}

/**
 * 隙間から落ちたコインが 1 段下のレーンのどこに着くか(u の範囲)。
 *
 * 隙間は高い端の側にあるので、着地点は次のレーンの**低い端の側**になる。
 * この最大値が HOLE_NEAR_U より小さくないと、着地したコインが
 * 滑り降りる途中で自分から手前の穴に落ちてしまう(検算 §1)。
 */
export function landingURange(d: DifficultyConfig): Span {
  const lanes = buildLanes(d);
  const lane = lanes[0]!;
  // 隙間の x は、次のレーンでは低い端からこれだけ離れた位置にあたる
  const a = lane.length - lane.gap.from;
  const b = lane.length - lane.gap.to;
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/**
 * 成功する初速の範囲(px/s)。摩擦なしの等加速度なので閉じた式で出る。
 *
 *   手前の穴を渡りきる : v(nearHole.to) >= HOLE_CATCH_SPEED
 *   隙間で落ちる       : v(gap.to)      <  HOLE_CATCH_SPEED
 *
 * 検算とチューニングの両方で使う。実際の判定は物理を回して行う。
 */
export function successPowerBand(d: DifficultyConfig, catchSpeed: number): Span {
  const lane = buildLanes(d)[0]!;
  const c2 = catchSpeed * catchSpeed;
  return {
    from: Math.sqrt(c2 + 2 * lane.decel * lane.nearHole.to),
    to: Math.sqrt(c2 + 2 * lane.decel * lane.gap.to),
  };
}

export const WALL_LEFT_X = BOARD_LEFT;
export const WALL_RIGHT_X = BOARD_RIGHT;
export { COIN_R };
