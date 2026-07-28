/**
 * 描画のプリミティブ。外部素材を一切使わず、すべてコードで描く。
 */

import { COLORS, LINE_W, type Rect, type Vec2 } from '../config.ts';

export type Ctx = CanvasRenderingContext2D;

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
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: string;
  /** 白フチをつけて背景から浮かせる */
  outline?: number;
  outlineColor?: string;
}

export function text(ctx: Ctx, s: string, x: number, y: number, o: TextOptions): void {
  ctx.save();
  ctx.font = `${o.weight ?? '800'} ${o.size}px system-ui, -apple-system, "Hiragino Maru Gothic ProN", sans-serif`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.baseline ?? 'middle';
  if (o.outline && o.outline > 0) {
    ctx.strokeStyle = o.outlineColor ?? '#FFFFFF';
    ctx.lineWidth = o.outline;
    ctx.lineJoin = 'round';
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.color ?? COLORS.ink;
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
