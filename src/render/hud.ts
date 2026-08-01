/**
 * 操作部の表示。プランジャー、パワーメーター、あきらめるボタン、操作ガイド。
 *
 * パワーメーターには**直前までのショットの跡**が残る。
 * 弱すぎ・ちょうど・強すぎのどれだったかを引き量の位置に色で刻むので、
 * 「さっきより少し弱く」を狙って詰めていける。当たりの範囲そのものは
 * 見せないので、答えを配ることにはならない。
 */

import {
  COLORS,
  GIVEUP_CENTER,
  GIVEUP_R,
  KNOB_R,
  KNOB_REST,
  METER,
  STROKE_KNOB,
  type Vec2,
} from '../config.ts';
import {
  alpha,
  circle,
  clamp01,
  lGrad,
  paint,
  rGrad,
  roundRect,
  text,
  vGrad,
  type Ctx,
} from './shapes.ts';

/** 操作部の天面の y。ガイド文字はここより下に置く */
const DECK_TOP = 1018;

export type ShotKind = 'weak' | 'good' | 'strong';

export interface ShotMark {
  /** 引き量 0..1 */
  pull: number;
  kind: ShotKind;
}

const KIND_COLOR: Record<ShotKind, string> = {
  weak: COLORS.weak,
  good: COLORS.good,
  strong: COLORS.strong,
};

const KIND_LABEL: Record<ShotKind, string> = {
  weak: 'よわい',
  good: 'ちょうど',
  strong: 'つよい',
};

// ---------------------------------------------------------------- メーター

/** メーターの内側の溝 */
function trackRect(): { x: number; y: number; w: number; h: number } {
  return { x: METER.x + 20, y: METER.y + 30, w: METER.w - 40, h: METER.h - 54 };
}

/** メーターの枠・溝・目盛り。動かないのでキャッシュ側で 1 度だけ描く */
export function drawMeterFrame(ctx: Ctx): void {
  const t = trackRect();

  roundRect(ctx, METER.x, METER.y, METER.w, METER.h, 14);
  paint(ctx, alpha('#000000', 0.35), alpha('#FFFFFF', 0.06), 2);

  text(ctx, 'POWER', METER.x + METER.w / 2, METER.y + 16, {
    size: 12,
    color: COLORS.textDim,
    weight: '700',
    tracking: 2,
  });

  // 溝
  roundRect(ctx, t.x, t.y, t.w, t.h, t.w / 2);
  ctx.fillStyle = vGrad(ctx, t.y, t.y + t.h, [
    [0, alpha('#000000', 0.7)],
    [1, alpha('#000000', 0.45)],
  ]);
  ctx.fill();
  paint(ctx, null, alpha('#000000', 0.6), 1.5);

  // 目盛り
  for (let i = 0; i <= 10; i++) {
    const y = t.y + t.h * (1 - i / 10);
    const long = i % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(t.x - 5, y);
    ctx.lineTo(t.x - (long ? 13 : 9), y);
    ctx.strokeStyle = alpha(COLORS.textDim, long ? 0.8 : 0.4);
    ctx.lineWidth = long ? 2 : 1;
    ctx.stroke();
  }
}

/** 引き量とショットの跡。毎フレーム変わるぶんだけ */
export function drawPowerMeter(ctx: Ctx, pull: number, marks: readonly ShotMark[]): void {
  const t = trackRect();

  // 過去のショットの跡。新しいものほど濃い
  marks.forEach((m, i) => {
    const y = t.y + t.h * (1 - clamp01(m.pull));
    const age = (i + 1) / marks.length;
    ctx.beginPath();
    ctx.moveTo(t.x + t.w + 4, y);
    ctx.lineTo(t.x + t.w + 15, y);
    ctx.strokeStyle = alpha(KIND_COLOR[m.kind], 0.25 + age * 0.7);
    ctx.lineWidth = m.kind === 'good' ? 4 : 3;
    ctx.lineCap = 'round';
    ctx.stroke();
  });

  // いまの引き量
  const h = t.h * clamp01(pull);
  if (h > 2) {
    ctx.save();
    roundRect(ctx, t.x, t.y, t.w, t.h, t.w / 2);
    ctx.clip();
    ctx.fillStyle = lGrad(ctx, { x: 0, y: t.y + t.h }, { x: 0, y: t.y }, [
      [0, COLORS.good],
      [0.55, COLORS.weak],
      [1, COLORS.strong],
    ]);
    ctx.fillRect(t.x, t.y + t.h - h, t.w, h);
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(t.x - 2, t.y + t.h - h);
    ctx.lineTo(t.x + t.w + 2, t.y + t.h - h);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  text(ctx, `${Math.round(pull * 100)}`, METER.x + METER.w / 2, METER.y + METER.h - 12, {
    size: 18,
    color: pull > 0 ? COLORS.text : COLORS.textDim,
    weight: '800',
  });
}

/** 直前のショットの判定を出す小さな札 */
export function drawLastShot(ctx: Ctx, mark: ShotMark | null, at: Vec2): void {
  if (!mark) return;
  const c = KIND_COLOR[mark.kind];
  const w = 128;
  roundRect(ctx, at.x - w / 2, at.y - 17, w, 34, 17);
  paint(ctx, alpha(c, 0.16), alpha(c, 0.7), 2);
  text(ctx, KIND_LABEL[mark.kind], at.x, at.y + 1, { size: 17, color: c, weight: '800' });
}

// ---------------------------------------------------------------- プランジャー

export function drawPlunger(ctx: Ctx, knobY: number, cooldown: number): void {
  const x = KNOB_REST.x;
  const top = KNOB_REST.y - 46;

  // ガイドレール
  roundRect(ctx, x - 9, top, 18, STROKE_KNOB + 92, 9);
  paint(ctx, alpha('#000000', 0.4), alpha('#FFFFFF', 0.05), 2);

  // バネ
  const coils = 9;
  const springTop = top + 8;
  const springBottom = knobY - KNOB_R * 0.5;
  ctx.beginPath();
  for (let i = 0; i <= coils * 12; i++) {
    const p = i / (coils * 12);
    const y = springTop + (springBottom - springTop) * p;
    const dx = Math.sin(p * Math.PI * 2 * coils) * 17;
    if (i === 0) ctx.moveTo(x + dx, y);
    else ctx.lineTo(x + dx, y);
  }
  ctx.strokeStyle = alpha(COLORS.leverLo, 0.9);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.strokeStyle = alpha('#FFFFFF', 0.25);
  ctx.lineWidth = 2;
  ctx.stroke();

  // シャフト
  roundRect(ctx, x - 6, springBottom - 10, 12, 26, 6);
  paint(ctx, COLORS.lever, alpha('#000000', 0.5), 1.5);

  // ノブ。影は半透明の楕円で代用する(shadowBlur はラスタライズが重い)
  ctx.beginPath();
  ctx.ellipse(x + 1, knobY + KNOB_R * 0.18, KNOB_R * 0.98, KNOB_R * 0.94, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();

  circle(ctx, x, knobY, KNOB_R);
  ctx.fillStyle = rGrad(ctx, x - KNOB_R * 0.35, knobY - KNOB_R * 0.4, 2, KNOB_R * 1.6, [
    [0, '#FF8F7A'],
    [0.45, COLORS.strong],
    [1, '#7E2A12'],
  ]);
  ctx.fill();
  paint(ctx, null, alpha('#000000', 0.6), 2.5);

  ctx.beginPath();
  ctx.ellipse(x - KNOB_R * 0.3, knobY - KNOB_R * 0.42, KNOB_R * 0.38, KNOB_R * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = alpha('#FFFFFF', 0.4);
  ctx.fill();

  if (cooldown > 0) {
    circle(ctx, x, knobY, KNOB_R + 6);
    paint(ctx, null, alpha(COLORS.textDim, 0.5 * cooldown), 3);
  }
}

/** 未操作が続いたときの操作ガイド。指がノブを下へ引く */
export function drawPullGuide(ctx: Ctx, knobY: number, t: number): void {
  const x = KNOB_REST.x + KNOB_R + 46;
  const p = (t % 1.8) / 1.8;
  const ease = p < 0.65 ? p / 0.65 : 1 - (p - 0.65) / 0.35;
  const y = knobY + ease * 96;

  ctx.save();
  ctx.globalAlpha = 0.85;
  // 矢印
  ctx.beginPath();
  ctx.moveTo(x, knobY + 6);
  ctx.lineTo(x, knobY + 104);
  ctx.strokeStyle = alpha(COLORS.accent, 0.35);
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 7]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 指
  roundRect(ctx, x - 13, y - 12, 26, 34, 13);
  paint(ctx, COLORS.accent, alpha('#000000', 0.5), 2);
  circle(ctx, x, y - 12, 9);
  paint(ctx, COLORS.accent, alpha('#000000', 0.5), 2);
  ctx.restore();

  // 盤面(ガラスの中)に文字を出さないよう、操作部の天面に置く
  text(ctx, 'ひっぱって はなす', KNOB_REST.x, DECK_TOP + 26, {
    size: 17,
    color: COLORS.textDim,
    weight: '700',
  });
}

// ---------------------------------------------------------------- あきらめる

export function drawGiveUp(ctx: Ctx, progress: number): void {
  const { x, y } = GIVEUP_CENTER;
  circle(ctx, x, y, GIVEUP_R);
  paint(ctx, alpha('#000000', 0.45), alpha(COLORS.textDim, 0.5), 2);

  // × のしるし
  const s = GIVEUP_R * 0.42;
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.strokeStyle = alpha(COLORS.textDim, 0.9);
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  if (progress > 0) {
    ctx.beginPath();
    ctx.arc(x, y, GIVEUP_R + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = COLORS.strong;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    text(ctx, 'やめる', x, y + GIVEUP_R + 22, { size: 13, color: COLORS.strong, weight: '700' });
  }
}

// ---------------------------------------------------------------- 共通ボタン

export interface ButtonStyle {
  fill: string;
  edge: string;
  label: string;
  size: number;
}

export function drawButton(
  ctx: Ctx,
  r: { x: number; y: number; w: number; h: number },
  st: ButtonStyle,
  pressed = false,
): void {
  const dy = pressed ? 3 : 0;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = pressed ? 6 : 16;
  ctx.shadowOffsetY = pressed ? 2 : 7;
  roundRect(ctx, r.x, r.y + dy, r.w, r.h, r.h / 2);
  ctx.fillStyle = vGrad(ctx, r.y + dy, r.y + r.h + dy, [
    [0, alpha(st.fill, 0.9)],
    [1, alpha(st.fill, 0.55)],
  ]);
  ctx.fill();
  ctx.restore();
  roundRect(ctx, r.x, r.y + dy, r.w, r.h, r.h / 2);
  paint(ctx, null, st.edge, 2.5);
  text(ctx, st.label, r.x + r.w / 2, r.y + r.h / 2 + dy, {
    size: st.size,
    color: COLORS.text,
    weight: '800',
  });
}
