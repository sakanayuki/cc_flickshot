/**
 * 盤面の幾何。ジグザグに並ぶレール(板)と、丸い落とし穴と、あたりの口。
 *
 * レイアウト(上から見て):
 *
 *        [投入口]
 *   段1:        溝|=====板=====      ← 溝 x=420、板は右へ。左へ弾く
 *   段2:  ====板====|溝             ← 溝 x=300、板は左へ。右へ弾く
 *   段3:        溝|=====板=====
 *   段4:  ====板====|溝
 *   段5:        溝|=====板=====
 *   口 :  ==あたりの口==            ← 段5 から左へ弾いて入れる
 *
 * すべての溝は中央の隙間(GROOVE_GAP)を挟んで向かい合い、
 * 弾かれたコインはこの隙間(=手前の丸穴)を飛び越えて 1 段下の板に乗る。
 * 板を飛び越すと壁ぎわの奥の丸穴に落ちる。
 *
 * このモジュールは Canvas も DOM も参照しない。
 */

import {
  BOARD_LEFT,
  BOARD_RIGHT,
  COIN_R,
  GROOVE_EVEN_X,
  GROOVE_ODD_X,
  PLANK_DROP,
  ROW_COUNT,
  ROW_GAP,
  ROW_TOP_Y,
  type DifficultyConfig,
  type GrooveSide,
  type Row,
  type Vec2,
  type WinPocket,
} from '../config.ts';

/**
 * 段のレールを作る。
 *
 * 偶数段(index 0,2,4)は溝が板の左端(x=GROOVE_EVEN_X)で板は右へ伸び、左へ弾く。
 * 奇数段(index 1,3)は溝が板の右端(x=GROOVE_ODD_X)で板は左へ伸び、右へ弾く。
 * どの遷移も「隙間 GROOVE_GAP を飛び越えて幅 plankWidth の板に乗る」で同一条件になる。
 */
export function buildRows(d: DifficultyConfig): Row[] {
  const w = d.plankWidth;
  return Array.from({ length: ROW_COUNT }, (_, i): Row => {
    const even = i % 2 === 0;
    const side: GrooveSide = even ? 'left' : 'right';
    const grooveX = even ? GROOVE_EVEN_X : GROOVE_ODD_X;
    const [left, right] = even ? [grooveX, grooveX + w] : [grooveX - w, grooveX];
    const grooveY = ROW_TOP_Y + i * ROW_GAP;
    return { index: i, left, right, grooveSide: side, grooveY, highY: grooveY - PLANK_DROP };
  });
}

/**
 * あたりの口。段5(溝 x=GROOVE_EVEN_X)から左へ弾いて入れる。
 * 口の幅と位置は奇数段の板とまったく同じで、6 つ目の遷移も同一条件になる。
 */
export function buildWinPocket(d: DifficultyConfig): WinPocket {
  return {
    left: GROOVE_ODD_X - d.plankWidth,
    right: GROOVE_ODD_X,
    y: ROW_TOP_Y + ROW_COUNT * ROW_GAP,
  };
}

// ---------------------------------------------------------------- 板の上の幾何

/** 溝(コインが止まってレバーにもたれる位置)。コインの中心が来る位置 */
export function groovePos(row: Row): Vec2 {
  const x = row.grooveSide === 'left' ? row.left : row.right;
  return { x, y: row.grooveY - COIN_R };
}

/** 弾き出す向き。溝の端のさらに外へ = 板から離れる向き */
export function flickDirX(row: Row): number {
  return row.grooveSide === 'left' ? -1 : 1;
}

/** 板が下り坂になる向き(溝へ向かう向き)。弾く向きと同じ */
export function downhillDirX(row: Row): number {
  return flickDirX(row);
}

/** 板の高い端の x(溝の反対側) */
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
  /** 溝から見て手前(弱すぎ)側か、奥(強すぎ)側か */
  kind: 'near' | 'far';
  /** 穴の見た目の中心と半径。落下範囲いっぱいに開口させるので楕円になる */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * すべての穴を作る。
 *
 * 手前の穴: 中央の隙間(GROOVE_GAP)。弱すぎたコインが落ちる。全遷移で共通。
 * 奥の穴: 着地する板の高い端と壁の間。強すぎたコインが落ちる。
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
    // 1 つ上の段からどちらへ弾かれてくるか
    const goingLeft = flickDirX(rows[level - 1]!) < 0;

    const near = { left: GROOVE_ODD_X, right: GROOVE_EVEN_X, kind: 'near' as const };
    const far = goingLeft
      ? { left: BOARD_LEFT, right: target.left, kind: 'far' as const }
      : { left: target.right, right: BOARD_RIGHT, kind: 'far' as const };

    for (const s of [near, far]) {
      if (s.right - s.left <= 1) continue;
      const half = (s.right - s.left) / 2;
      let cx = (s.left + s.right) / 2;
      let rx: number;
      let ry: number;

      if (s.kind === 'near') {
        // 棒と棒の間はまるごと開口している。落ちる範囲と見た目を一致させる
        rx = half - 10;
        ry = 34;
      } else {
        // 奥の穴は「棒の端のすぐ先」に寄せた丸穴(実機と同じ)
        rx = Math.max(Math.min(half - 8, 46), 18);
        ry = rx * 0.66;
        cx = goingLeft ? Math.min(cx, s.right - rx - 6) : Math.max(cx, s.left + rx + 6);
      }

      holes.push({
        rowIndex: level,
        left: s.left,
        right: s.right,
        y: target.y,
        kind: s.kind,
        cx,
        cy: target.y + 4,
        rx,
        ry,
      });
    }
  }
  return holes;
}

export const WALL_LEFT_X = BOARD_LEFT;
export const WALL_RIGHT_X = BOARD_RIGHT;
