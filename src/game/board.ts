/**
 * 盤面の幾何。段(板)と、その左右にある穴と、最下段の下のあたりの口。
 *
 * このモジュールは Canvas も DOM も参照しない。
 */

import {
  BOARD_CENTER_X,
  BOARD_LEFT,
  BOARD_RIGHT,
  COIN_R,
  PLANK_DROP,
  ROW_COUNT,
  ROW_GAP,
  ROW_TOP_Y,
  notchOffset,
  type DifficultyConfig,
  type NotchSide,
  type Row,
  type Vec2,
  type WinPocket,
} from '../config.ts';

/**
 * 段の板を作る。
 *
 * 溝は右→左→右…と交互。右の溝からは左へ、左の溝からは右へ弾く。
 * 溝の x は板幅から導かれ(`notchOffset`)、どの遷移でも
 * 「横に飛ぶ距離」が同じになるようになっている。
 */
export function buildRows(d: DifficultyConfig): Row[] {
  const w = d.plankWidth;
  const off = notchOffset(w);
  const notchRight = BOARD_CENTER_X + off;
  const notchLeft = BOARD_CENTER_X - off;

  return Array.from({ length: ROW_COUNT }, (_, i): Row => {
    const side: NotchSide = i % 2 === 0 ? 'right' : 'left';
    const notchY = ROW_TOP_Y + i * ROW_GAP;
    const [left, right] =
      side === 'right' ? [notchRight - w, notchRight] : [notchLeft, notchLeft + w];
    return { index: i, left, right, notchSide: side, notchY, highY: notchY - PLANK_DROP };
  });
}

/** 最下段(溝は右)から左へ弾いて入れる、あたりの口 */
export function buildWinPocket(d: DifficultyConfig): WinPocket {
  const w = d.plankWidth;
  const off = notchOffset(w);
  const left = BOARD_CENTER_X - off;
  return {
    left,
    right: left + w,
    y: ROW_TOP_Y + ROW_COUNT * ROW_GAP,
  };
}

// ---------------------------------------------------------------- 板の上の幾何

/** 溝(コインが止まる位置)の座標。コインの中心が来る位置 */
export function notchPos(row: Row): Vec2 {
  const x = row.notchSide === 'right' ? row.right : row.left;
  return { x, y: row.notchY - COIN_R };
}

/** 弾き出す向き。溝が右なら左へ (-1) */
export function flickDirX(row: Row): number {
  return row.notchSide === 'right' ? -1 : 1;
}

/** 板が下り坂になる向き(溝へ向かう向き) */
export function downhillDirX(row: Row): number {
  return row.notchSide === 'right' ? 1 : -1;
}

/** 板の表面の y。x が板の範囲外でも直線を延長して返す */
export function plankSurfaceY(row: Row, x: number): number {
  const u = (x - row.left) / (row.right - row.left);
  // 溝が右なら右へ下る
  return row.notchSide === 'right'
    ? row.highY + (row.notchY - row.highY) * u
    : row.notchY + (row.highY - row.notchY) * u;
}

/** コインの中心がこの x で板に乗っているときの y */
export function plankCoinY(row: Row, x: number): number {
  return plankSurfaceY(row, x) - COIN_R;
}

/** x が板の上か。コインの中心で判定する */
export function onPlank(row: Row, x: number): boolean {
  return x >= row.left && x <= row.right;
}

/** あたりの口の範囲に入っているか */
export function inWinPocket(pocket: WinPocket, x: number): boolean {
  return x >= pocket.left && x <= pocket.right;
}

// ---------------------------------------------------------------- 穴

/** 板の左右にある穴。着地に失敗するとここへ落ちる */
export interface Hole {
  /** どの段の高さにある穴か。ROW_COUNT ならあたりの口の高さ */
  rowIndex: number;
  left: number;
  right: number;
  y: number;
  /** 溝から見て手前(弱すぎ)側か、奥(強すぎ)側か */
  kind: 'near' | 'far';
}

/**
 * すべての穴を作る。穴は「板でないところ」。
 *
 * 弱すぎたときに落ちる手前の穴と、強すぎたときに落ちる奥の穴の
 * 両方が必ず存在する(片方しか無いと片側だけのゲームになる)。
 */
export function buildHoles(d: DifficultyConfig): Hole[] {
  const rows = buildRows(d);
  const pocket = buildWinPocket(d);
  const holes: Hole[] = [];

  // 2 段目以降と、あたりの口の高さ。1 段目は投入されるだけなので穴は要らない
  for (let i = 1; i <= ROW_COUNT; i++) {
    const isPocket = i === ROW_COUNT;
    const target = isPocket
      ? { left: pocket.left, right: pocket.right, y: pocket.y }
      : { left: rows[i]!.left, right: rows[i]!.right, y: rows[i]!.notchY };
    // 1 つ上の段の溝がどちら側か = どちらへ弾かれてくるか
    const from = rows[i - 1]!;
    const goingLeft = flickDirX(from) < 0;

    // 手前(発射側)の穴と奥の穴
    const nearSide = goingLeft
      ? { left: target.right, right: BOARD_RIGHT, kind: 'near' as const }
      : { left: BOARD_LEFT, right: target.left, kind: 'near' as const };
    const farSide = goingLeft
      ? { left: BOARD_LEFT, right: target.left, kind: 'far' as const }
      : { left: target.right, right: BOARD_RIGHT, kind: 'far' as const };

    for (const s of [nearSide, farSide]) {
      if (s.right - s.left > 1) {
        holes.push({ rowIndex: i, left: s.left, right: s.right, y: target.y, kind: s.kind });
      }
    }
  }
  return holes;
}

export const WALL_LEFT_X = BOARD_LEFT;
export const WALL_RIGHT_X = BOARD_RIGHT;
