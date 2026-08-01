/**
 * タイトルとリザルトで共有する大物の描画。
 * ロゴ、難易度カード、スタンプ棚、到達段数のはしご。
 */

import {
  ANIMALS,
  COLORS,
  LOGICAL_W,
  P_MIN,
  ROW_COUNT,
  type DifficultyConfig,
  type Rect,
} from '../config.ts';
import { drawAnimalFace } from './animals.ts';
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
  withClip,
  type Ctx,
} from './shapes.ts';
import { stampIndexFor } from '../save.ts';

/**
 * 1 段目の成功域 (px/s)。難易度カードの帯を描くためだけの表示用の値で、
 * 判定には使わない。`npm run verify` の掃引結果と合わせて更新すること。
 */
const ROW1_GOOD_FROM = 523;
const ROW1_GOOD_TO = 1091;

export const LOGO_W = 560;
export const LOGO_H = 168;

/** タイトルロゴの板と文字。動かないのでキャッシュ側で 1 度だけ描く */
export function drawLogo(ctx: Ctx, cx: number, cy: number): void {
  const w = LOGO_W;
  const h = LOGO_H;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 20);
  ctx.fillStyle = vGrad(ctx, cy - h / 2, cy + h / 2, [
    [0, alpha(COLORS.shellHi, 0.9)],
    [1, alpha(COLORS.shellLo, 0.9)],
  ]);
  ctx.fill();
  paint(ctx, null, alpha(COLORS.bezel, 0.55), 2.5);

  const grad = lGrad(ctx, { x: cx - 260, y: cy - 40 }, { x: cx + 260, y: cy + 40 }, [
    [0, COLORS.bezelLo],
    [0.35, COLORS.bezelHi],
    [0.5, '#FFFFFF'],
    [0.65, COLORS.bezelHi],
    [1, COLORS.bezelLo],
  ]);

  text(ctx, 'どうぶつの', cx, cy - 38, { size: 40, fill: grad, weight: '900' });
  text(ctx, 'やまくだり', cx, cy + 18, { size: 66, fill: grad, weight: '900' });
  text(ctx, 'COIN  DESCENT', cx, cy + 62, {
    size: 13,
    color: alpha(COLORS.bezelHi, 0.6),
    weight: '700',
    tracking: 8,
  });
}

/** ロゴの上を走る光沢。ここだけ毎フレーム描く */
export function drawLogoShine(ctx: Ctx, cx: number, cy: number, t: number): void {
  withClip(
    ctx,
    () => roundRect(ctx, cx - LOGO_W / 2, cy - LOGO_H / 2, LOGO_W, LOGO_H, 20),
    () => {
      const p = ((t * 0.22) % 1.6) - 0.3;
      ctx.save();
      ctx.translate(cx - LOGO_W / 2 + p * LOGO_W, cy);
      ctx.rotate(-0.35);
      ctx.fillStyle = lGrad(ctx, { x: -60, y: 0 }, { x: 60, y: 0 }, [
        [0, alpha('#FFFFFF', 0)],
        [0.5, alpha('#FFFFFF', 0.14)],
        [1, alpha('#FFFFFF', 0)],
      ]);
      ctx.fillRect(-60, -220, 120, 440);
      ctx.restore();
    },
  );
}

/**
 * 難易度カード。手前の穴の広さをそのまま図で見せるので、
 * どちらがどれだけ難しいかが数字なしで分かる。
 */
export function drawDifficultyCard(
  ctx: Ctx,
  r: Rect,
  d: DifficultyConfig,
  selected: boolean,
  pressed: boolean,
): void {
  const dy = pressed ? 3 : 0;
  const accent = selected ? COLORS.gap : COLORS.bezel;

  ctx.save();
  ctx.shadowColor = selected ? alpha(COLORS.gap, 0.35) : 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = pressed ? 8 : 22;
  ctx.shadowOffsetY = pressed ? 2 : 8;
  roundRect(ctx, r.x, r.y + dy, r.w, r.h, 20);
  ctx.fillStyle = vGrad(ctx, r.y + dy, r.y + r.h + dy, [
    [0, alpha(COLORS.shellHi, 0.95)],
    [1, alpha(COLORS.shellLo, 0.95)],
  ]);
  ctx.fill();
  ctx.restore();
  roundRect(ctx, r.x, r.y + dy, r.w, r.h, 20);
  paint(ctx, null, alpha(accent, selected ? 0.9 : 0.45), selected ? 3 : 2);

  text(ctx, d.label, r.x + 34, r.y + dy + 44, {
    size: 32,
    color: COLORS.text,
    weight: '900',
    align: 'left',
  });
  text(ctx, d.tag, r.x + 34, r.y + dy + 74, {
    size: 12,
    color: alpha(accent, 0.8),
    weight: '700',
    align: 'left',
    tracking: 5,
  });

  /*
   * 力の目盛り。盤面は難易度によらず同じで、変わるのは
   * **同じ引き量に載る力**だけ。目盛りを P_MIN..上限で描いて、
   * 「1 段目で当たる引き量」がどこに来るかを帯で示す。
   */
  const gx = r.x + 34;
  const gy = r.y + dy + r.h - 34;
  const gw = r.w - 68;
  const span = d.powerMax - P_MIN;
  const at = (power: number) => gx + ((power - P_MIN) / span) * gw;

  roundRect(ctx, gx, gy - 6, gw, 12, 6);
  paint(ctx, alpha(COLORS.shellLo, 0.9), null, 0);

  // 1 段目の成功域(検算 §2 が固定する実測値)
  const lo = at(ROW1_GOOD_FROM);
  const hi = at(ROW1_GOOD_TO);
  roundRect(ctx, lo, gy - 6, Math.max(4, hi - lo), 12, 6);
  ctx.save();
  ctx.shadowColor = COLORS.gap;
  ctx.shadowBlur = 10;
  paint(ctx, COLORS.gap, null, 0);
  ctx.restore();

  roundRect(ctx, gx, gy - 6, gw, 12, 6);
  paint(ctx, null, alpha(COLORS.rail, 0.5), 1.5);

  text(ctx, 'よわく', gx, gy - 20, {
    size: 11,
    color: alpha(COLORS.textDim, 0.9),
    weight: '700',
    align: 'left',
  });
  text(ctx, 'つよく', gx + gw, gy - 20, {
    size: 11,
    color: alpha(COLORS.textDim, 0.9),
    weight: '700',
    align: 'right',
  });
  text(ctx, '1 だんめが 当たる引き', (lo + hi) / 2, gy + 26, {
    size: 11,
    color: alpha(COLORS.gap, 0.85),
    weight: '700',
  });
}

/** スタンプ棚。集めたどうぶつメダルを並べる */
export function drawStampShelf(ctx: Ctx, count: number, x: number, y: number, w: number): void {
  const cols = ANIMALS.length;
  const gapX = w / cols;
  const r = Math.min(26, gapX * 0.42);

  text(ctx, 'あつめたメダル', x, y - 30, {
    size: 14,
    color: COLORS.textDim,
    weight: '700',
    align: 'left',
  });
  text(ctx, `${count}`, x + w, y - 30, {
    size: 20,
    color: COLORS.accent,
    weight: '900',
    align: 'right',
  });

  for (let i = 0; i < cols; i++) {
    const cx = x + gapX * (i + 0.5);
    // i 番目のどうぶつを何枚持っているか。10 種を順に配って周回する
    const laps = Math.floor(count / cols) + (count % cols > i ? 1 : 0);
    circle(ctx, cx, y, r);
    if (laps > 0) {
      ctx.fillStyle = rGrad(ctx, cx - r * 0.3, y - r * 0.35, 1, r * 1.6, [
        [0, COLORS.coinHi],
        [0.5, COLORS.coinMid],
        [1, COLORS.coinLo],
      ]);
      ctx.fill();
      paint(ctx, null, COLORS.coinEdge, 2);
      ctx.save();
      circle(ctx, cx, y, r * 0.82);
      ctx.clip();
      drawAnimalFace(ctx, ANIMALS[i]!, cx, y + r * 0.06, r * 0.6);
      ctx.restore();
      if (laps > 1) {
        text(ctx, `×${laps}`, cx + r * 0.9, y + r * 0.9, {
          size: 12,
          color: COLORS.accent,
          weight: '800',
        });
      }
    } else {
      paint(ctx, alpha('#000000', 0.4), alpha(COLORS.textDim, 0.28), 2);
    }
  }
}

/** 到達段数のはしご。降りた段だけ光る */
export function drawDepthLadder(ctx: Ctx, cx: number, cy: number, depth: number, win: boolean): void {
  const w = 300;
  const stepH = 30;
  for (let i = 0; i < ROW_COUNT; i++) {
    const y = cy + i * (stepH + 8);
    const reached = i < depth;
    const left = i % 2 === 0;
    const x = cx - w / 2 + (left ? 0 : w * 0.26);
    roundRect(ctx, x, y, w * 0.74, stepH, stepH / 2);
    paint(
      ctx,
      reached ? alpha(COLORS.rail, 0.85) : alpha('#000000', 0.35),
      reached ? alpha(COLORS.railHi, 0.7) : alpha(COLORS.textDim, 0.25),
      2,
    );
    text(ctx, `${i + 1}`, x + w * 0.37, y + stepH / 2, {
      size: 15,
      color: reached ? COLORS.ink : COLORS.textDim,
      weight: '800',
    });
  }
  const y = cy + ROW_COUNT * (stepH + 8) + 6;
  roundRect(ctx, cx - 70, y, 140, stepH + 4, (stepH + 4) / 2);
  paint(
    ctx,
    win ? alpha(COLORS.pocket, 0.35) : alpha('#000000', 0.35),
    win ? COLORS.pocket : alpha(COLORS.textDim, 0.25),
    win ? 3 : 2,
  );
  text(ctx, 'あたり', cx, y + (stepH + 4) / 2, {
    size: 17,
    color: win ? COLORS.pocket : COLORS.textDim,
    weight: '900',
  });
}

/** 獲得したメダルが「ぺたん」と押される演出 */
export function drawStampPress(ctx: Ctx, cx: number, cy: number, index: number, t01: number): void {
  const t = clamp01(t01);
  const scale = t < 0.7 ? 2.6 - 1.6 * (t / 0.7) : 1 + Math.sin((t - 0.7) * 12) * 0.06 * (1 - t);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.globalAlpha = Math.min(1, t * 3);
  const r = 44;
  circle(ctx, 0, 0, r);
  ctx.fillStyle = rGrad(ctx, -r * 0.3, -r * 0.35, 1, r * 1.6, [
    [0, COLORS.coinHi],
    [0.5, COLORS.coinMid],
    [1, COLORS.coinLo],
  ]);
  ctx.fill();
  paint(ctx, null, COLORS.coinEdge, 3);
  ctx.save();
  circle(ctx, 0, 0, r * 0.82);
  ctx.clip();
  drawAnimalFace(ctx, ANIMALS[index % ANIMALS.length]!, 0, r * 0.06, r * 0.6);
  ctx.restore();
  ctx.restore();
}

/** 画面上部のマーキー(筐体の看板) */
export function drawMarquee(ctx: Ctx, y: number, label: string): void {
  roundRect(ctx, 40, y, LOGICAL_W - 80, 44, 22);
  ctx.fillStyle = vGrad(ctx, y, y + 44, [
    [0, alpha(COLORS.bezel, 0.35)],
    [1, alpha(COLORS.bezelLo, 0.2)],
  ]);
  ctx.fill();
  paint(ctx, null, alpha(COLORS.bezel, 0.4), 2);
  text(ctx, label, LOGICAL_W / 2, y + 23, {
    size: 14,
    color: alpha(COLORS.bezelHi, 0.75),
    weight: '700',
    tracking: 5,
  });
}

export { stampIndexFor };
