/**
 * どうぶつ 10 種。円・楕円・角丸矩形と ink 色の輪郭線だけで描く。
 * 外部画像は一切使わない(詳細設計書 §9.5)。
 */

import { COLORS, type AnimalKind } from '../config.ts';
import { circle, ellipse, paint, polygon, type Ctx } from './shapes.ts';

interface Palette {
  body: string;
  inner: string;
  accent: string;
}

const PALETTE: Record<AnimalKind, Palette> = {
  usagi: { body: '#FFF6F2', inner: '#FFC2D1', accent: '#FFC2D1' },
  kuma: { body: '#C58B54', inner: '#E7C39B', accent: '#8B5E34' },
  panda: { body: '#FFFFFF', inner: '#F0F0F0', accent: '#3B2A1A' },
  risu: { body: '#E8873A', inner: '#FFD9AE', accent: '#B85F1E' },
  neko: { body: '#F5D06B', inner: '#FFEBB8', accent: '#C79A34' },
  inu: { body: '#E0B183', inner: '#FFF0DA', accent: '#A87545' },
  zou: { body: '#B9C4D0', inner: '#DDE5EC', accent: '#8A97A6' },
  kirin: { body: '#F7D96B', inner: '#FFF1BE', accent: '#C08A2E' },
  pengin: { body: '#3F4A57', inner: '#FFFFFF', accent: '#F5A623' },
  raion: { body: '#F2C14E', inner: '#FFE9AE', accent: '#D98324' },
};

export function animalPalette(kind: AnimalKind): Palette {
  return PALETTE[kind];
}

/**
 * どうぶつの顔。(cx, cy) が中心、r が顔の半径。
 * blink は 0..1 で、1 に近いほど目を閉じる。
 */
export function drawAnimalFace(
  ctx: Ctx,
  kind: AnimalKind,
  cx: number,
  cy: number,
  r: number,
  blink = 0,
): void {
  const p = PALETTE[kind];
  const lw = Math.max(2, r * 0.13);

  ctx.save();

  // ---- 耳・角など、顔より後ろに描くもの
  switch (kind) {
    case 'usagi': {
      for (const s of [-1, 1]) {
        ellipse(ctx, cx + s * r * 0.42, cy - r * 1.02, r * 0.24, r * 0.62, s * 0.18);
        paint(ctx, p.body, COLORS.ink, lw);
        ellipse(ctx, cx + s * r * 0.42, cy - r * 1.02, r * 0.11, r * 0.4, s * 0.18);
        paint(ctx, p.inner, null, 0);
      }
      break;
    }
    case 'kuma':
    case 'panda': {
      for (const s of [-1, 1]) {
        circle(ctx, cx + s * r * 0.72, cy - r * 0.68, r * 0.34);
        paint(ctx, kind === 'panda' ? p.accent : p.body, COLORS.ink, lw);
      }
      break;
    }
    case 'risu': {
      for (const s of [-1, 1]) {
        polygon(ctx, [
          { x: cx + s * r * 0.55, y: cy - r * 0.5 },
          { x: cx + s * r * 0.9, y: cy - r * 1.25 },
          { x: cx + s * r * 0.95, y: cy - r * 0.45 },
        ]);
        paint(ctx, p.body, COLORS.ink, lw);
      }
      break;
    }
    case 'neko': {
      for (const s of [-1, 1]) {
        polygon(ctx, [
          { x: cx + s * r * 0.4, y: cy - r * 0.72 },
          { x: cx + s * r * 0.82, y: cy - r * 1.28 },
          { x: cx + s * r * 0.95, y: cy - r * 0.55 },
        ]);
        paint(ctx, p.body, COLORS.ink, lw);
      }
      break;
    }
    case 'inu': {
      for (const s of [-1, 1]) {
        ellipse(ctx, cx + s * r * 0.92, cy - r * 0.12, r * 0.26, r * 0.52, s * 0.25);
        paint(ctx, p.accent, COLORS.ink, lw);
      }
      break;
    }
    case 'zou': {
      for (const s of [-1, 1]) {
        ellipse(ctx, cx + s * r * 0.95, cy - r * 0.1, r * 0.45, r * 0.55);
        paint(ctx, p.inner, COLORS.ink, lw);
      }
      break;
    }
    case 'kirin': {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * r * 0.34, cy - r * 0.78);
        ctx.lineTo(cx + s * r * 0.44, cy - r * 1.28);
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.stroke();
        circle(ctx, cx + s * r * 0.46, cy - r * 1.34, r * 0.14);
        paint(ctx, p.accent, COLORS.ink, lw);
      }
      break;
    }
    case 'raion': {
      // たてがみ
      const petals = 11;
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2;
        circle(ctx, cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, r * 0.36);
        paint(ctx, p.accent, COLORS.ink, lw);
      }
      break;
    }
    case 'pengin':
      break;
  }

  // ---- 顔
  circle(ctx, cx, cy, r);
  paint(ctx, p.body, COLORS.ink, lw);

  // ペンギンは顔の白い部分
  if (kind === 'pengin') {
    ellipse(ctx, cx, cy + r * 0.12, r * 0.66, r * 0.74);
    paint(ctx, p.inner, null, 0);
  }
  // パンダの目のまわり
  if (kind === 'panda') {
    for (const s of [-1, 1]) {
      ellipse(ctx, cx + s * r * 0.34, cy - r * 0.05, r * 0.26, r * 0.32, s * 0.3);
      paint(ctx, p.accent, null, 0);
    }
  }
  // キリンの模様
  if (kind === 'kirin') {
    ctx.save();
    circle(ctx, cx, cy, r);
    ctx.clip();
    for (const [dx, dy, rr] of [
      [-0.62, -0.4, 0.2],
      [0.6, -0.5, 0.17],
      [-0.7, 0.45, 0.18],
      [0.66, 0.4, 0.16],
    ] as const) {
      circle(ctx, cx + dx * r, cy + dy * r, rr * r);
      paint(ctx, p.accent, null, 0);
    }
    ctx.restore();
  }
  // 口まわりの明るい部分
  if (kind !== 'pengin' && kind !== 'panda') {
    ellipse(ctx, cx, cy + r * 0.34, r * 0.44, r * 0.32);
    paint(ctx, p.inner, null, 0);
  }

  // ---- 目
  const eyeY = cy - r * 0.08;
  const eyeX = r * 0.34;
  for (const s of [-1, 1]) {
    if (blink > 0.6) {
      ctx.beginPath();
      ctx.moveTo(cx + s * eyeX - r * 0.14, eyeY);
      ctx.quadraticCurveTo(cx + s * eyeX, eyeY + r * 0.12, cx + s * eyeX + r * 0.14, eyeY);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();
    } else {
      circle(ctx, cx + s * eyeX, eyeY, r * 0.13);
      paint(ctx, COLORS.ink, null, 0);
      circle(ctx, cx + s * eyeX + r * 0.05, eyeY - r * 0.05, r * 0.045);
      paint(ctx, '#FFFFFF', null, 0);
    }
  }

  // ---- 鼻と口
  if (kind === 'zou') {
    // 鼻(トランク)
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.16, cy + r * 0.2);
    ctx.quadraticCurveTo(cx - r * 0.05, cy + r * 0.95, cx + r * 0.3, cy + r * 0.95);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = lw * 2.6;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = p.body;
    ctx.lineWidth = lw * 1.6;
    ctx.stroke();
  } else if (kind === 'pengin') {
    polygon(ctx, [
      { x: cx - r * 0.2, y: cy + r * 0.24 },
      { x: cx + r * 0.2, y: cy + r * 0.24 },
      { x: cx, y: cy + r * 0.56 },
    ]);
    paint(ctx, p.accent, COLORS.ink, lw);
  } else {
    ellipse(ctx, cx, cy + r * 0.24, r * 0.13, r * 0.1);
    paint(ctx, COLORS.ink, null, 0);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy + r * 0.42);
    ctx.quadraticCurveTo(cx, cy + r * 0.56, cx + r * 0.2, cy + r * 0.42);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = lw * 0.8;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // ---- ひげ
  if (kind === 'neko') {
    for (const s of [-1, 1]) {
      for (const dy of [-0.06, 0.08]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * r * 0.36, cy + r * (0.26 + dy));
        ctx.lineTo(cx + s * r * 0.95, cy + r * (0.2 + dy * 1.6));
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = lw * 0.55;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/**
 * 応援するどうぶつ。顔に加えて小さな体と手を描く。
 * cheer は 0..1 で、1 のとき万歳する。
 */
export function drawCheerAnimal(
  ctx: Ctx,
  kind: AnimalKind,
  cx: number,
  cy: number,
  size: number,
  cheer = 0,
): void {
  const p = PALETTE[kind];
  const r = size * 0.5;
  const lw = Math.max(2, r * 0.13);

  ctx.save();
  // 体
  ellipse(ctx, cx, cy + r * 1.15, r * 0.72, r * 0.62);
  paint(ctx, p.body, COLORS.ink, lw);
  // 腕と手。万歳すると顔の横まで上がる
  for (const sgn of [-1, 1]) {
    const sx = cx + sgn * r * 0.58;
    const sy = cy + r * 1.02;
    const hx = cx + sgn * r * (0.95 + cheer * 0.35);
    const hy = cy + r * (0.92 - cheer * 1.5);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx + sgn * r * 1.05, (sy + hy) / 2, hx, hy);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = lw * 3.4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = p.body;
    ctx.lineWidth = lw * 2.2;
    ctx.stroke();
    circle(ctx, hx, hy, r * 0.22);
    paint(ctx, p.body, COLORS.ink, lw);
  }
  drawAnimalFace(ctx, kind, cx, cy, r);
  ctx.restore();
}
