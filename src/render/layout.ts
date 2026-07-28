/**
 * 720x1280 論理座標 → 実画面へのフィットと DPR 対応。詳細設計書 §2.2。
 */

import { LOGICAL_H, LOGICAL_W, MAX_DPR, type Vec2 } from '../config.ts';

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
  dpr: number;
  cssW: number;
  cssH: number;
}

export function computeViewport(cssW: number, cssH: number, dpr: number): Viewport {
  const scale = Math.min(cssW / LOGICAL_W, cssH / LOGICAL_H);
  return {
    scale,
    offsetX: (cssW - LOGICAL_W * scale) / 2,
    offsetY: (cssH - LOGICAL_H * scale) / 2,
    dpr,
    cssW,
    cssH,
  };
}

/**
 * Canvas の実ピクセルサイズを設定し、以降論理座標で描けるように変換を適用する。
 * リサイズ・orientationchange のたびに呼ぶ。
 */
export function resizeCanvas(canvas: HTMLCanvasElement): Viewport {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  return computeViewport(cssW, cssH, dpr);
}

/** 描画開始時に1回だけ適用する。以降は論理座標のまま描ける。 */
export function applyTransform(ctx: CanvasRenderingContext2D, vp: Viewport): void {
  ctx.setTransform(
    vp.dpr * vp.scale,
    0,
    0,
    vp.dpr * vp.scale,
    vp.dpr * vp.offsetX,
    vp.dpr * vp.offsetY,
  );
}

/** レターボックスの余白を含めた画面全体を塗る。 */
export function clearFull(ctx: CanvasRenderingContext2D, vp: Viewport, color: string): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, vp.cssW * vp.dpr, vp.cssH * vp.dpr);
}

/** ポインタ座標 → 論理座標。全入力処理で使用する。 */
export function toLogical(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  vp: Viewport,
): Vec2 {
  const r = canvas.getBoundingClientRect();
  return {
    x: (clientX - r.left - vp.offsetX) / vp.scale,
    y: (clientY - r.top - vp.offsetY) / vp.scale,
  };
}
