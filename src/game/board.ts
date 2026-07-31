/**
 * 盤面の幾何。左右の端を行き来するレール(板)と、丸い落とし穴と、あたりの口。
 *
 * レイアウト(上から見て。実機の写真と同じ並び):
 *
 *                                      [投入口]
 *   段1:            ○ ○      ====レール====●|  ← 先端は右端。左へ弾く
 *   段2:  |●====レール====      ○ ○           ← 先端は左端。右へ弾く
 *   段3:            ○ ○      ====レール====●|
 *   段4:  |●====レール====      ○ ○
 *   段5:            ○ ○      ====レール====●|
 *   口 :  |==あたりの口==
 *
 *   ● = 溝(コインが止まる先端)。すぐ横の壁にレバーが付く
 *   ○ = 丸い落とし穴(アウト)
 *   |  = 先端と壁の隙間(TIP_INSET)。ここも丸い落とし穴になっている
 *
 * コインは先端で止まり、**盤面の内側へ**弾かれる。自分のレールを飛び越して
 * 中央の穴の上を飛び、反対側の端にある 1 段下のレールに着地する。
 * 弱すぎれば中央の穴、強すぎれば飛び越した先の壁ぎわの穴に落ちる。
 *
 * このモジュールは Canvas も DOM も参照しない。
 */

import {
  BOARD_LEFT,
  BOARD_RIGHT,
  COIN_R,
  PLANK_DROP,
  ROW_COUNT,
  ROW_GAP,
  ROW_TOP_Y,
  TIP_LEFT_X,
  TIP_RIGHT_X,
  type DifficultyConfig,
  type GrooveSide,
  type Row,
  type Vec2,
  type WinPocket,
} from '../config.ts';

/** 段 index の先端(溝)が左右どちらの端に来るか。偶数段=右端、奇数段=左端 */
function sideOf(index: number): GrooveSide {
  return index % 2 === 0 ? 'right' : 'left';
}

/**
 * 段のレールを作る。
 *
 * 偶数段(index 0,2,4)は先端が右端(x=TIP_RIGHT_X)でレールは左へ伸び、左へ弾く。
 * 奇数段(index 1,3)は先端が左端(x=TIP_LEFT_X)でレールは右へ伸び、右へ弾く。
 * どの遷移も「自分のレールを飛び越し、中央の穴を越えて、反対側の端の
 * レールに乗る」で同一条件になる。
 */
export function buildRows(d: DifficultyConfig): Row[] {
  const w = d.plankWidth;
  return Array.from({ length: ROW_COUNT }, (_, i): Row => {
    const side = sideOf(i);
    const [left, right] =
      side === 'right' ? [TIP_RIGHT_X - w, TIP_RIGHT_X] : [TIP_LEFT_X, TIP_LEFT_X + w];
    const grooveY = ROW_TOP_Y + i * ROW_GAP;
    return { index: i, left, right, grooveSide: side, grooveY, highY: grooveY - PLANK_DROP };
  });
}

/**
 * あたりの口。最下段からの 1 回ぶんの遷移がそのまま「あがり」になるよう、
 * 位置も幅も 1 段ぶん下のレールとまったく同じに置く。
 */
export function buildWinPocket(d: DifficultyConfig): WinPocket {
  const w = d.plankWidth;
  const side = sideOf(ROW_COUNT);
  const [left, right] =
    side === 'right' ? [TIP_RIGHT_X - w, TIP_RIGHT_X] : [TIP_LEFT_X, TIP_LEFT_X + w];
  return { left, right, y: ROW_TOP_Y + ROW_COUNT * ROW_GAP };
}

// ---------------------------------------------------------------- 板の上の幾何

/** 溝(コインが止まってレバーにもたれる位置)。コインの中心が来る位置 */
export function groovePos(row: Row): Vec2 {
  const x = row.grooveSide === 'left' ? row.left : row.right;
  return { x, y: row.grooveY - COIN_R };
}

/**
 * 弾き出す向き。先端は壁ぎわにあるので、弾く向きはつねに盤面の内側
 * (= 自分のレールを飛び越す向き)。
 */
export function flickDirX(row: Row): number {
  return row.grooveSide === 'left' ? 1 : -1;
}

/** 板が下り坂になる向き(先端へ向かう向き)。弾く向きとは逆 */
export function downhillDirX(row: Row): number {
  return -flickDirX(row);
}

/** 板の高い端の x(先端の反対側 = 盤面の内側の端) */
export function highEndX(row: Row): number {
  return row.grooveSide === 'left' ? row.right : row.left;
}

/** 板の表面の y。x が板の範囲外でも直線を延長して返す */
export function plankSurfaceY(row: Row, x: number): number {
  const u = (x - row.left) / (row.right - row.left);
  // 溝側の端が低い(grooveY)、反対の端が高い(highY)
  return row.grooveSide === 'left'
    ? row.grooveY + (row.highY - row.grooveY) * u
    : row.highY + (row.grooveY - row.highY) * u;
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
  return x >= pocket.left + 4 && x <= pocket.right - 4;
}

/**
 * 中央の穴(手前の穴)の幅。
 * 自分のレールの高い端から、着地するレールの高い端までの距離。
 */
export function nearGapWidth(d: DifficultyConfig): number {
  const rows = buildRows(d);
  return Math.abs(highEndX(rows[0]!) - highEndX(rows[1]!));
}

// ---------------------------------------------------------------- 穴

/** 丸い落とし穴。着地に失敗するとここへ落ちる */
export interface Hole {
  /** どの段の高さにある穴か(1..ROW_COUNT)。ROW_COUNT はあたりの口の高さ */
  rowIndex: number;
  /** 落下として扱う x 範囲(板でも口でもない区間) */
  left: number;
  right: number;
  /** 落下レベルの y(その段の板面の高さ) */
  y: number;
  /** 弾いた先端から見て手前(弱すぎ)側か、飛び越した先(強すぎ)側か */
  kind: 'near' | 'far';
  /** 穴の見た目の中心と半径 */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * 中央の穴は実機の写真と同じく「丸い穴が並んでいる」見た目にする。
 * 落ちる範囲は隙間まるごとなので、丸を並べて隙間を隙間なく埋める。
 * 1 つあたりがこの幅に近くなるよう個数を決めると、どの難易度でも丸く見える。
 */
const NEAR_HOLE_PITCH = 72;

/**
 * すべての穴を作る。
 *
 * 手前の穴: 自分のレールの高い端と、着地するレールの高い端の間。
 *           弱すぎたコインが落ちる。盤面の中央にあり、全遷移で共通。
 * 奥の穴  : 着地するレールの先端と、その先の壁の間(TIP_INSET)。
 *           強すぎて飛び越しすぎたコインが落ちる。
 * 両方が必ず存在する(片方しか無いと片側だけのゲームになる)。
 */
export function buildHoles(d: DifficultyConfig): Hole[] {
  const rows = buildRows(d);
  const pocket = buildWinPocket(d);
  const holes: Hole[] = [];

  for (let level = 1; level <= ROW_COUNT; level++) {
    const isPocket = level === ROW_COUNT;
    const target = isPocket
      ? { left: pocket.left, right: pocket.right, y: pocket.y }
      : { left: rows[level]!.left, right: rows[level]!.right, y: rows[level]!.grooveY };
    const source = rows[level - 1]!;
    // 1 つ上の段からどちらへ弾かれてくるか
    const goingLeft = flickDirX(source) < 0;

    // 手前(中央)の穴: 弾いた側のレールの高い端 〜 着地するレールの高い端
    const near = goingLeft
      ? { left: target.right, right: source.left }
      : { left: source.right, right: target.left };
    // 奥の穴: 着地するレールの先端の先、壁との隙間
    const far = goingLeft
      ? { left: BOARD_LEFT, right: target.left }
      : { left: target.right, right: BOARD_RIGHT };

    // 中央の穴は丸を並べて開口を埋める。写真と同じ見た目になる
    const span = near.right - near.left;
    const count = Math.max(2, Math.round(span / NEAR_HOLE_PITCH));
    const step = span / count;
    for (let k = 0; k < count; k++) {
      const l = near.left + step * k;
      const rx = step / 2;
      holes.push({
        rowIndex: level,
        left: l,
        right: l + step,
        y: target.y,
        kind: 'near',
        cx: l + rx,
        cy: target.y + 4,
        rx,
        ry: Math.min(30, rx * 0.8),
      });
    }

    const farHalf = (far.right - far.left) / 2;
    holes.push({
      rowIndex: level,
      left: far.left,
      right: far.right,
      y: target.y,
      kind: 'far',
      cx: (far.left + far.right) / 2,
      cy: target.y + 4,
      rx: farHalf,
      ry: Math.min(30, farHalf * 0.72),
    });
  }
  return holes;
}

export const WALL_LEFT_X = BOARD_LEFT;
export const WALL_RIGHT_X = BOARD_RIGHT;
