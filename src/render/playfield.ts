/**
 * 盤面の中身。レール、落とし口、レバー、コイン、あたりの口。
 *
 * レーンの上のものはすべて「レーン座標」で描く。
 *   原点 = 低い端、+x = 高い端の向き(= u)、+y = レール面の下(= -perp)
 * こうすると段ごとの左右反転を気にせず、1 本ぶんの絵を書くだけで済む。
 */

import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  COLORS,
  FIN_T,
  FLOOR_T,
  LANE_THICK,
  PIT_DEPTH,
  type AnimalKind,
  type Vec2,
} from '../config.ts';
import { laneP, type Lane, type WinPocket } from '../game/board.ts';
import { drawAnimalFace } from './animals.ts';
import { BOARD_H, BOARD_W } from './cabinet.ts';
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

/** レバー(キッカー)の見た目 */
const KICK_W = 30;
const KICK_H = 30;

function clipField(ctx: Ctx, body: () => void): void {
  withClip(ctx, () => roundRect(ctx, BOARD_LEFT, BOARD_TOP, BOARD_W, BOARD_H, 12), body);
}

/**
 * レーン座標系に入る。
 *
 * `rotate(angle)` だけだと、低い端が右の段ではローカルの +y が
 * 画面の**上**を向く(dir が左向きなので 90 度回した先が反転する)。
 * そのままだとレールも落とし口も矢羽根も上下が裏返るので、
 * y を反転して「+y = レール面の下」に揃える。
 */
function inLane(ctx: Ctx, lane: Lane, body: () => void): void {
  ctx.save();
  ctx.translate(lane.low.x, lane.low.y);
  ctx.rotate(lane.angle);
  if (lane.side === 'right') ctx.scale(1, -1);
  body();
  ctx.restore();
}

// ---------------------------------------------------------------- 背景

/** ガラスの中の化粧板。動かないのでキャッシュ側で 1 度だけ描く */
export function drawField(ctx: Ctx): void {
  clipField(ctx, () => {
    ctx.fillStyle = vGrad(ctx, BOARD_TOP, BOARD_BOTTOM, [
      [0, COLORS.fieldDeep],
      [0.45, COLORS.field],
      [1, COLORS.fieldDeep],
    ]);
    ctx.fillRect(BOARD_LEFT, BOARD_TOP, BOARD_W, BOARD_H);

    // 印刷のグリッド
    ctx.strokeStyle = alpha(COLORS.fieldPrint, 0.55);
    ctx.lineWidth = 1;
    for (let x = BOARD_LEFT; x <= BOARD_RIGHT; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, BOARD_TOP);
      ctx.lineTo(x, BOARD_BOTTOM);
      ctx.stroke();
    }
    for (let y = BOARD_TOP; y <= BOARD_BOTTOM; y += 40) {
      ctx.beginPath();
      ctx.moveTo(BOARD_LEFT, y);
      ctx.lineTo(BOARD_RIGHT, y);
      ctx.stroke();
    }

    // 奥のほうのぼんやりした光
    ctx.fillStyle = rGrad(
      ctx,
      BOARD_LEFT + BOARD_W / 2,
      BOARD_TOP + BOARD_H * 0.2,
      10,
      BOARD_W * 0.9,
      [
        [0, alpha(COLORS.fieldGlow, 0.33)],
        [1, alpha(COLORS.fieldGlow, 0)],
      ],
    );
    ctx.fillRect(BOARD_LEFT, BOARD_TOP, BOARD_W, BOARD_H);
  });
}

// ---------------------------------------------------------------- レーン

/**
 * 窪み。レールが切れたところから高い端まで、床の無い区間を見せる。
 *
 * 実体とまったく同じ形で描く。手前と奥にはポケットの底があり、
 * まん中(落とし穴)だけ底が無い。3 つを分けているのは 2 枚のフィンで、
 * その頂点の深さ `lane.rim` が「どれだけ沈まずに飛べば抜けられるか」
 * そのものなので、段が下るほどフィンが低く(深く)見える。
 *
 * ここは動かないのでキャッシュ側で 1 度だけ描く。
 * 流れる矢羽根だけ `drawGapChevrons` で毎フレーム重ねる。
 */
export function drawPits(ctx: Ctx, lane: Lane): void {
  const weak = lane.bins[0]!;
  const good = lane.bins[1]!;
  const strong = lane.bins[2]!;

  inLane(ctx, lane, () => {
    const left = weak.from;
    const right = strong.to;

    // 窪み全体の内側。奥へ行くほど暗い
    roundRect(ctx, left, -2, right - left, PIT_DEPTH + 2, 8);
    ctx.fillStyle = vGrad(ctx, -2, PIT_DEPTH, [
      [0, alpha(COLORS.fieldDeep, 0.9)],
      [0.35, alpha(COLORS.hole, 0.92)],
      [1, COLORS.hole],
    ]);
    ctx.fill();

    // 落とし穴だけは底が抜けている。下まで black + 進める色の光
    ctx.save();
    roundRect(ctx, left, -2, right - left, PIT_DEPTH + 2, 8);
    ctx.clip();
    ctx.fillStyle = vGrad(ctx, -2, PIT_DEPTH + 20, [
      [0, alpha(COLORS.gap, 0.16)],
      [0.5, alpha(COLORS.hole, 0.9)],
      [1, COLORS.hole],
    ]);
    ctx.fillRect(good.from, -2, good.to - good.from, PIT_DEPTH + 22);
    ctx.restore();

    // 手前と奥のポケットの底(= コインが乗る棚)
    for (const b of [weak, strong]) {
      roundRect(ctx, b.from, PIT_DEPTH, b.to - b.from, FLOOR_T, 3);
      ctx.fillStyle = vGrad(ctx, PIT_DEPTH, PIT_DEPTH + FLOOR_T, [
        [0, alpha(COLORS.railLo, 0.95)],
        [1, alpha(COLORS.railEdge, 0.95)],
      ]);
      ctx.fill();
      paint(ctx, null, alpha('#000000', 0.6), 1);

      // 色に頼らず形でも「行き止まり」と分かるよう、底に斜線を敷く
      ctx.save();
      roundRect(ctx, b.from, PIT_DEPTH - 16, b.to - b.from, 16, 2);
      ctx.clip();
      for (let x = b.from - 16; x < b.to + 16; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, PIT_DEPTH);
        ctx.lineTo(x + 12, PIT_DEPTH - 16);
        ctx.strokeStyle = alpha(COLORS.holeRim, 0.28);
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();
    }

    // フィン 2 枚。頂点の高さがそのまま難しさ
    for (const u of [good.from, good.to]) {
      roundRect(ctx, u - FIN_T / 2, lane.rim, FIN_T, PIT_DEPTH - lane.rim, FIN_T / 2);
      ctx.fillStyle = vGrad(ctx, lane.rim, PIT_DEPTH, [
        [0, COLORS.railHi],
        [0.3, COLORS.rail],
        [1, COLORS.railLo],
      ]);
      ctx.fill();
      paint(ctx, null, alpha(COLORS.railEdge, 0.9), 1.2);
    }

    // 窪みの上端。レール面の高さに 1 本通しておくと縁が読める
    ctx.beginPath();
    ctx.moveTo(left, -1);
    ctx.lineTo(right, -1);
    ctx.strokeStyle = alpha(COLORS.railLo, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();

    // 進める口の縁だけ光らせる
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(good.from, lane.rim);
    ctx.lineTo(good.to, lane.rim);
    ctx.strokeStyle = COLORS.gap;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = COLORS.gap;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();
  });
}

/** 進める隙間を流れる下向きの矢羽根。ここだけ毎フレーム描く */
export function drawGapChevrons(ctx: Ctx, lane: Lane, t: number): void {
  const good = lane.bins[1]!;
  inLane(ctx, lane, () => {
    const cx = (good.from + good.to) / 2;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.9 + i * 0.33) % 1;
      const y = lane.rim + 8 + p * (PIT_DEPTH - lane.rim - 10);
      ctx.beginPath();
      ctx.moveTo(cx - 10, y);
      ctx.lineTo(cx, y + 9);
      ctx.lineTo(cx + 10, y);
      ctx.strokeStyle = alpha(COLORS.gap, 0.8 * (1 - p));
      ctx.stroke();
    }
  });
}

/** レール。コインが走る唯一の床 */
export function drawRail(ctx: Ctx, lane: Lane): void {
  inLane(ctx, lane, () => {
    const len = lane.rail.to;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    roundRect(ctx, -2, 0, len + 2, LANE_THICK, LANE_THICK / 2);
    ctx.fillStyle = vGrad(ctx, 0, LANE_THICK, [
      [0, COLORS.railHi],
      [0.3, COLORS.rail],
      [1, COLORS.railLo],
    ]);
    ctx.fill();
    ctx.restore();
    paint(ctx, null, alpha(COLORS.railEdge, 0.85), 1.5);

    // 天面の光
    ctx.beginPath();
    ctx.moveTo(6, 2.5);
    ctx.lineTo(len - 8, 2.5);
    ctx.strokeStyle = alpha('#FFFFFF', 0.5);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 登る向きの刻み
    ctx.save();
    roundRect(ctx, -2, 0, len + 2, LANE_THICK, LANE_THICK / 2);
    ctx.clip();
    for (let x = 26; x < len - 10; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, LANE_THICK * 0.72);
      ctx.lineTo(x + 7, LANE_THICK * 0.42);
      ctx.lineTo(x + 14, LANE_THICK * 0.72);
      ctx.strokeStyle = alpha(COLORS.railEdge, 0.4);
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
  });
}

/** 隙間から 1 段下へ落ちる道筋。奥に伸びる光の柱 */
export function drawChute(ctx: Ctx, lane: Lane, drop: number): void {
  const good = lane.bins[1]!;
  const a = laneP(lane, good.from, -PIT_DEPTH);
  const b = laneP(lane, good.to, -PIT_DEPTH);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x, b.y + drop);
  ctx.lineTo(a.x, a.y + drop);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, a, { x: a.x, y: a.y + drop }, [
    [0, alpha(COLORS.gap, 0.18)],
    [1, alpha(COLORS.gap, 0)],
  ]);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- レバー

/**
 * レバー。壁から突き出すキッカーで、構えているコインを斜面に沿って蹴り出す。
 * swing は -1(引いて溜め)〜 0(静止)〜 1(打撃)。
 */
export function drawLever(ctx: Ctx, lane: Lane, swing: number, flash: number): void {
  inLane(ctx, lane, () => {
    const push = swing >= 0 ? swing * 26 : swing * 10;
    const y = LANE_THICK / 2;

    // 壁の中のケース
    roundRect(ctx, -34, y - KICK_H / 2 - 5, 34, KICK_H + 10, 6);
    paint(ctx, alpha(COLORS.shellLo, 0.95), alpha('#000000', 0.6), 2);

    // ロッド
    roundRect(ctx, -30, y - 5, 30 + push, 10, 5);
    ctx.fillStyle = vGrad(ctx, y - 5, y + 5, [
      [0, COLORS.lever],
      [1, COLORS.leverLo],
    ]);
    ctx.fill();

    // 打撃面
    roundRect(ctx, push - 4, y - KICK_H / 2, KICK_W * 0.42, KICK_H, 5);
    ctx.fillStyle = vGrad(ctx, y - KICK_H / 2, y + KICK_H / 2, [
      [0, '#FFFFFF'],
      [0.4, COLORS.lever],
      [1, COLORS.leverLo],
    ]);
    ctx.fill();
    paint(ctx, null, alpha('#000000', 0.55), 1.5);

    if (flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = flash;
      circle(ctx, push + 8, y, 20 + flash * 12);
      ctx.fillStyle = rGrad(ctx, push + 8, y, 0, 32, [
        [0, alpha('#FFFFFF', 0.6)],
        [1, alpha('#FFFFFF', 0)],
      ]);
      ctx.fill();
      ctx.restore();
    }
  });
}

/**
 * 筐体の外側、ベゼルの上に出ているレバーのノブ。
 * 軸が壁を貫いて中のキッカーにつながっている、という見立て。
 */
export function drawLeverKnob(ctx: Ctx, lane: Lane, swing: number): void {
  const out = lane.side === 'right' ? 1 : -1;
  const push = swing >= 0 ? swing * 9 : swing * 4;
  const y = lane.low.y + 8;
  const base = lane.low.x;
  const tip = base + out * (20 - push);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(base, y);
  ctx.lineTo(tip, y);
  ctx.strokeStyle = COLORS.leverLo;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke();

  circle(ctx, tip, y, 10);
  ctx.fillStyle = rGrad(ctx, tip - 3, y - 4, 1, 13, [
    [0, COLORS.bezelHi],
    [1, COLORS.bezelLo],
  ]);
  ctx.fill();
  paint(ctx, null, alpha('#000000', 0.55), 2);
  ctx.restore();
}

// ---------------------------------------------------------------- あたりの口

export function drawWinPocket(ctx: Ctx, p: WinPocket): void {
  const x = p.center.x - p.w / 2;
  const y = p.center.y - p.h / 2;

  ctx.save();
  ctx.shadowColor = alpha(COLORS.pocket, 0.65);
  ctx.shadowBlur = 26;
  roundRect(ctx, x, y, p.w, p.h, 12);
  ctx.fillStyle = vGrad(ctx, y, y + p.h, [
    [0, alpha(COLORS.pocket, 0.3)],
    [1, alpha(COLORS.pocketLo, 0.55)],
  ]);
  ctx.fill();
  ctx.restore();

  roundRect(ctx, x, y, p.w, p.h, 12);
  paint(ctx, null, COLORS.pocket, 3);

  text(ctx, 'あたり', p.center.x, p.center.y + p.h * 0.16, {
    size: 30,
    color: alpha(COLORS.pocket, 0.9),
    weight: '900',
  });
  text(ctx, 'WIN', p.center.x, p.center.y - p.h * 0.26, {
    size: 14,
    color: alpha(COLORS.pocket, 0.6),
    weight: '700',
    tracking: 6,
  });
}

// ---------------------------------------------------------------- コイン

export interface CoinLook {
  pos: Vec2;
  spin: number;
  animal: AnimalKind;
  /** 0..1。落ちた穴に沈むほど 1 */
  sink: number;
  /** 速度 (px/s)。残像の向きと長さに使う */
  vel: Vec2;
}

export function drawCoin(ctx: Ctx, look: CoinLook): void {
  const { pos } = look;
  const r = COIN_R * (1 - look.sink * 0.55);
  if (r < 1) return;

  // 速いときだけ残像
  const sp = Math.hypot(look.vel.x, look.vel.y);
  if (sp > 260) {
    const n = 3;
    for (let i = 1; i <= n; i++) {
      const k = (i / n) * 0.05;
      circle(ctx, pos.x - look.vel.x * k, pos.y - look.vel.y * k, r * (1 - i * 0.12));
      paint(ctx, alpha(COLORS.coinMid, 0.1 * (1 - i / (n + 1))), null, 0);
    }
  }

  ctx.save();
  ctx.globalAlpha = 1 - look.sink * 0.4;
  ctx.translate(pos.x, pos.y);

  // 影。shadowBlur はラスタライズが重いので、半透明の楕円で代用する
  ctx.beginPath();
  ctx.ellipse(1, r * 0.34, r * 0.92, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();

  // 本体
  circle(ctx, 0, 0, r);
  ctx.fillStyle = rGrad(ctx, -r * 0.32, -r * 0.36, r * 0.1, r * 1.5, [
    [0, COLORS.coinHi],
    [0.45, COLORS.coinMid],
    [1, COLORS.coinLo],
  ]);
  ctx.fill();
  paint(ctx, null, COLORS.coinEdge, 2.5);

  // 縁の刻み。回転が見えるようにする
  ctx.save();
  ctx.rotate(look.spin);
  const ticks = 24;
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.87, Math.sin(a) * r * 0.87);
    ctx.lineTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98);
    ctx.strokeStyle = alpha(COLORS.coinEdge, 0.45);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();

  // 内円とどうぶつの顔
  circle(ctx, 0, 0, r * 0.78);
  paint(ctx, null, alpha(COLORS.coinEdge, 0.4), 1.5);
  ctx.save();
  circle(ctx, 0, 0, r * 0.74);
  ctx.clip();
  drawAnimalFace(ctx, look.animal, 0, r * 0.06, r * 0.56);
  ctx.restore();

  // ハイライト
  ctx.beginPath();
  ctx.ellipse(-r * 0.34, -r * 0.42, r * 0.34, r * 0.18, -0.7, 0, Math.PI * 2);
  ctx.fillStyle = alpha('#FFFFFF', 0.35);
  ctx.fill();

  ctx.restore();
}

/** 穴に沈んだコインの手前に重ねる縁。穴の中に入っていくように見せる */
export function drawPitLip(ctx: Ctx, at: Vec2, color: string): void {
  ctx.beginPath();
  ctx.ellipse(at.x, at.y + 6, COIN_R * 1.25, COIN_R * 0.42, 0, Math.PI, Math.PI * 2, true);
  ctx.fillStyle = alpha(COLORS.hole, 0.95);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(at.x, at.y + 6, COIN_R * 1.25, COIN_R * 0.42, 0, 0, Math.PI);
  ctx.strokeStyle = alpha(color, 0.8);
  ctx.lineWidth = 3;
  ctx.stroke();
}

// ---------------------------------------------------------------- 投入

/** 投入口から 1 段目へつながるシュート */
export function drawEntryChute(ctx: Ctx, lane: Lane, entryU: number, slot: Vec2): void {
  const out = laneP(lane, entryU, COIN_R + 6);
  const half = COIN_R + 8;
  const midY = (slot.y + out.y) / 2;
  ctx.beginPath();
  ctx.moveTo(slot.x - half, slot.y + 24);
  ctx.bezierCurveTo(slot.x - half, midY, out.x - half, midY, out.x - half, out.y);
  ctx.lineTo(out.x + half, out.y);
  ctx.bezierCurveTo(out.x + half, midY, slot.x + half, midY, slot.x + half, slot.y + 24);
  ctx.closePath();
  ctx.fillStyle = alpha(COLORS.fieldPrint, 0.55);
  ctx.fill();
  paint(ctx, null, alpha(COLORS.railLo, 0.18), 1.5);
}

/** 弾く力の目安を、いま構えているレーンの上に薄く重ねる補助線 */
export function drawAimHint(ctx: Ctx, lane: Lane, pull: number): void {
  if (pull <= 0) return;
  inLane(ctx, lane, () => {
    const reach = lane.length * clamp01(pull) * 0.9;
    ctx.beginPath();
    ctx.moveTo(COIN_R, -COIN_R - 12);
    ctx.lineTo(COIN_R + reach, -COIN_R - 12);
    ctx.strokeStyle = alpha(COLORS.accent, 0.35);
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}
