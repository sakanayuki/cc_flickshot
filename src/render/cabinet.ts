/**
 * 筐体。据置アーケードの箱と、真鍮のベゼル、その内側のガラス窓。
 *
 * 盤面の中身(レール・落とし口・コイン)は playfield.ts が描く。
 * ここはその外側だけを受け持つ。
 */

import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COLORS,
  LOGICAL_H,
  LOGICAL_W,
  ROW_COUNT,
  ROW_GAP,
  ROW_TOP_Y,
} from '../config.ts';
import {
  alpha,
  circle,
  lGrad,
  paint,
  rGrad,
  roundRect,
  screw,
  text,
  vGrad,
  withClip,
  type Ctx,
} from './shapes.ts';

export const BOARD_W = BOARD_RIGHT - BOARD_LEFT;
export const BOARD_H = BOARD_BOTTOM - BOARD_TOP;
/** ベゼルの太さ */
const BEZEL = 18;

/** 部屋の暗がり。レターボックスの余白と同じ色で始める */
export function drawRoom(ctx: Ctx): void {
  ctx.fillStyle = COLORS.room;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  ctx.fillStyle = rGrad(ctx, LOGICAL_W / 2, LOGICAL_H * 0.34, 40, LOGICAL_H * 0.8, [
    [0, alpha(COLORS.roomGlow, 0.95)],
    [1, alpha(COLORS.room, 0)],
  ]);
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

/** 筐体の箱。画面いっぱいの金属パネル */
export function drawShell(ctx: Ctx): void {
  roundRect(ctx, 8, 8, LOGICAL_W - 16, LOGICAL_H - 16, 34);
  ctx.fillStyle = vGrad(ctx, 0, LOGICAL_H, [
    [0, COLORS.shellHi],
    [0.16, COLORS.shell],
    [0.72, COLORS.shell],
    [1, COLORS.shellLo],
  ]);
  ctx.fill();
  paint(ctx, null, alpha('#FFFFFF', 0.06), 2);

  // 上下のふちに入るハイライト。金属らしさを出す
  ctx.save();
  roundRect(ctx, 8, 8, LOGICAL_W - 16, LOGICAL_H - 16, 34);
  ctx.clip();
  ctx.fillStyle = alpha('#FFFFFF', 0.05);
  ctx.fillRect(8, 8, LOGICAL_W - 16, 3);
  ctx.fillStyle = alpha('#000000', 0.35);
  ctx.fillRect(8, LOGICAL_H - 14, LOGICAL_W - 16, 6);
  ctx.restore();

  for (const [x, y] of [
    [30, 30],
    [LOGICAL_W - 30, 30],
    [30, LOGICAL_H - 30],
    [LOGICAL_W - 30, LOGICAL_H - 30],
  ] as const) {
    screw(ctx, x, y, 7);
  }
}

/** ガラス窓のまわりの真鍮ベゼル */
export function drawBezel(ctx: Ctx): void {
  const x = BOARD_LEFT - BEZEL;
  const y = BOARD_TOP - BEZEL;
  const w = BOARD_W + BEZEL * 2;
  const h = BOARD_H + BEZEL * 2;

  // 額縁として塗る。内側をくり抜かないと盤面をまるごと覆ってしまう
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, 26);
  roundRectPath(ctx, BOARD_LEFT, BOARD_TOP, BOARD_W, BOARD_H, 12, true);
  ctx.fillStyle = lGrad(ctx, { x, y }, { x: x + w, y: y + h }, [
    [0, COLORS.bezelHi],
    [0.22, COLORS.bezel],
    [0.5, COLORS.bezelLo],
    [0.78, COLORS.bezel],
    [1, COLORS.bezelHi],
  ]);
  ctx.fill('evenodd');
  ctx.restore();

  // 内側と外側の落ち込み
  roundRect(ctx, BOARD_LEFT - 2, BOARD_TOP - 2, BOARD_W + 4, BOARD_H + 4, 13);
  paint(ctx, null, alpha('#000000', 0.55), 4);
  roundRect(ctx, x, y, w, h, 26);
  paint(ctx, null, alpha('#000000', 0.4), 2);

  for (const [sx, sy] of [
    [x + 14, y + 14],
    [x + w - 14, y + 14],
    [x + 14, y + h - 14],
    [x + w - 14, y + h - 14],
  ] as const) {
    screw(ctx, sx, sy, 5);
  }
}

/**
 * 角丸矩形のパスだけを足す(beginPath を呼ばない)。
 * 逆回りで足すと evenodd 塗りでくり抜きになる。
 */
function roundRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  reverse = false,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  if (!reverse) {
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
  } else {
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x, y, x, y + h, rr);
    ctx.arcTo(x, y + h, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x + w, y, rr);
    ctx.arcTo(x + w, y, x, y, rr);
  }
  ctx.closePath();
}

/** ガラスの映り込み。盤面の中身をすべて描いたあとに重ねる */
export function drawGlass(ctx: Ctx, t: number): void {
  withClip(
    ctx,
    () => roundRect(ctx, BOARD_LEFT, BOARD_TOP, BOARD_W, BOARD_H, 12),
    () => {
      // ななめの光の帯 2 本
      ctx.save();
      ctx.translate(BOARD_LEFT, BOARD_TOP);
      ctx.rotate(-0.32);
      const drift = Math.sin(t * 0.25) * 26;
      ctx.fillStyle = lGrad(ctx, { x: -200, y: 0 }, { x: 320, y: 0 }, [
        [0, alpha('#FFFFFF', 0)],
        [0.5, alpha('#FFFFFF', 0.055)],
        [1, alpha('#FFFFFF', 0)],
      ]);
      ctx.fillRect(-260 + drift, -420, 520, 1900);
      ctx.fillStyle = lGrad(ctx, { x: 380, y: 0 }, { x: 520, y: 0 }, [
        [0, alpha('#FFFFFF', 0)],
        [0.5, alpha('#FFFFFF', 0.035)],
        [1, alpha('#FFFFFF', 0)],
      ]);
      ctx.fillRect(360 + drift, -420, 160, 1900);
      ctx.restore();

      // 四隅の落ち込み
      ctx.fillStyle = rGrad(
        ctx,
        BOARD_LEFT + BOARD_W / 2,
        BOARD_TOP + BOARD_H / 2,
        BOARD_H * 0.3,
        BOARD_H * 0.72,
        [
          [0, alpha('#000000', 0)],
          [1, alpha('#000000', 0.42)],
        ],
      );
      ctx.fillRect(BOARD_LEFT, BOARD_TOP, BOARD_W, BOARD_H);
    },
  );
}

/**
 * ベゼルの左端に刻んだ段の目盛り。いま何段目まで降りたかを示す。
 * 数字を読ませずに位置で分かるので、盤面を邪魔しない。
 */
export function drawDepthMarks(ctx: Ctx, depth: number): void {
  for (let i = 0; i < ROW_COUNT; i++) {
    const y = ROW_TOP_Y + i * ROW_GAP - 12;
    const lit = i < depth;
    const x = BOARD_LEFT - BEZEL / 2 - 1;
    roundRect(ctx, x - 4, y - 9, 8, 18, 4);
    paint(ctx, lit ? COLORS.gap : alpha('#000000', 0.45), alpha('#000000', 0.5), 1.5);
    if (lit) {
      ctx.save();
      ctx.shadowColor = COLORS.gap;
      ctx.shadowBlur = 10;
      roundRect(ctx, x - 4, y - 9, 8, 18, 4);
      paint(ctx, COLORS.gap, null, 0);
      ctx.restore();
    }
  }
}

/** 右上のコイン投入口 */
export function drawCoinSlot(ctx: Ctx, center: { x: number; y: number }, w: number, h: number): void {
  roundRect(ctx, center.x - w / 2, center.y - h / 2, w, h, 12);
  ctx.fillStyle = vGrad(ctx, center.y - h / 2, center.y + h / 2, [
    [0, alpha(COLORS.bezel, 0.5)],
    [1, alpha(COLORS.bezelLo, 0.35)],
  ]);
  ctx.fill();
  paint(ctx, null, alpha(COLORS.bezelHi, 0.5), 2);

  // 投入スリット
  roundRect(ctx, center.x - 8, center.y - h * 0.28, 16, h * 0.56, 8);
  paint(ctx, COLORS.ink, alpha('#000000', 0.8), 2);
  text(ctx, 'INSERT', center.x, center.y + h * 0.42, {
    size: 12,
    color: alpha(COLORS.bezelHi, 0.75),
    weight: '700',
    tracking: 2,
  });
}

/** 下段(操作部)の台。プランジャーとメーターが乗る */
export function drawControlDeck(ctx: Ctx): void {
  const y = BOARD_BOTTOM + BEZEL + 6;
  roundRect(ctx, 24, y, LOGICAL_W - 48, LOGICAL_H - y - 20, 22);
  ctx.fillStyle = vGrad(ctx, y, LOGICAL_H, [
    [0, COLORS.shellHi],
    [1, COLORS.shellLo],
  ]);
  ctx.fill();
  paint(ctx, null, alpha('#000000', 0.45), 2);

  // 天面のヘアライン
  ctx.save();
  roundRect(ctx, 24, y, LOGICAL_W - 48, LOGICAL_H - y - 20, 22);
  ctx.clip();
  ctx.strokeStyle = alpha('#FFFFFF', 0.04);
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.moveTo(24, y + i * 7 + 3);
    ctx.lineTo(LOGICAL_W - 24, y + i * 7 + 3);
    ctx.stroke();
  }
  ctx.restore();

  circle(ctx, 0, 0, 0); // パスをリセットしておく
}
