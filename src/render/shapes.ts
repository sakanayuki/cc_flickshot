/**
 * 描画のプリミティブ。外部素材(画像・音・フォント・CDN)を一切使わず、
 * すべてコードで描く。
 */

import { COLORS, LINE_W, type Rect, type Vec2 } from '../config.ts';

export type Ctx = CanvasRenderingContext2D;

/** 文字。日本語と英数字が混ざるので、和文の入るシステムフォントを並べる */
export const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif';

export function circle(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

export function ellipse(
  ctx: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 塗って、輪郭線を引く。輪郭は常に ink 色・太さ LINE_W で統一する */
export function paint(
  ctx: Ctx,
  fill: string | null,
  stroke: string | null = COLORS.ink,
  width = LINE_W,
): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && width > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

export function line(
  ctx: Ctx,
  a: Vec2,
  b: Vec2,
  color: string = COLORS.ink,
  width = LINE_W,
): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}

export function polygon(ctx: Ctx, pts: readonly Vec2[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

export interface TextOptions {
  size: number;
  color?: string;
  /** グラデーションなどを直接指定したいとき。color より優先する */
  fill?: string | CanvasGradient;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: string;
  /** フチをつけて背景から浮かせる */
  outline?: number;
  outlineColor?: string;
  /** 字間 (px)。英字の見出しを締めるのに使う */
  tracking?: number;
}

export function text(ctx: Ctx, s: string, x: number, y: number, o: TextOptions): void {
  ctx.save();
  ctx.font = `${o.weight ?? '800'} ${o.size}px ${FONT_STACK}`;
  if (o.tracking) {
    // letterSpacing はまだ全ブラウザには無いので、あれば使う程度に留める
    (ctx as unknown as { letterSpacing?: string }).letterSpacing = `${o.tracking}px`;
  }
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.baseline ?? 'middle';
  if (o.outline && o.outline > 0) {
    ctx.strokeStyle = o.outlineColor ?? '#FFFFFF';
    ctx.lineWidth = o.outline;
    ctx.lineJoin = 'round';
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.fill ?? o.color ?? COLORS.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function rectContains(r: Rect, p: Vec2, pad = 0): boolean {
  return (
    p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad
  );
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** 0→1 を滑らかに */
export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

/** ぽよんと弾む(1 を少し超えてから戻る) */
export function easeBack(t: number): number {
  const c = 1.70158;
  const u = t - 1;
  return u * u * ((c + 1) * u + c) + 1;
}

/** 上から下へのグラデーション */
export function vGrad(ctx: Ctx, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

/** 任意方向のグラデーション */
export function lGrad(
  ctx: Ctx,
  a: Vec2,
  b: Vec2,
  stops: [number, string][],
): CanvasGradient {
  const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

export function rGrad(
  ctx: Ctx,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  stops: [number, string][],
): CanvasGradient {
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

/** #RRGGBB と透明度から rgba() を作る */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 影を落として中身を描く */
export function withShadow(
  ctx: Ctx,
  color: string,
  blur: number,
  dy: number,
  body: () => void,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
  body();
  ctx.restore();
}

/** 直前に作ったパスで切り抜いて中身を描く */
export function withClip(ctx: Ctx, path: () => void, body: () => void): void {
  ctx.save();
  path();
  ctx.clip();
  body();
  ctx.restore();
}

/** 小さなネジ。筐体の質感づけに使う */
export function screw(ctx: Ctx, x: number, y: number, r: number): void {
  circle(ctx, x, y, r);
  paint(ctx, COLORS.screw, alpha(COLORS.ink, 0.6), 1.5);
  circle(ctx, x, y, r * 0.55);
  paint(ctx, alpha('#FFFFFF', 0.16), null, 0);
  line(ctx, { x: x - r * 0.6, y: y - r * 0.2 }, { x: x + r * 0.6, y: y + r * 0.2 }, alpha(COLORS.ink, 0.7), 1.6);
}

export function pingpong(t: number): number {
  const u = t % 2;
  return u < 1 ? u : 2 - u;
}
