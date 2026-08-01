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
  LANE_THICK,
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

/** 落とし口の見た目の深さ */
const MOUTH_H = 46;
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

/** ガラスの中の化粧板 */
export function drawField(ctx: Ctx, t: number): void {
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
    const glow = 0.5 + 0.5 * Math.sin(t * 0.6);
    ctx.fillStyle = rGrad(
      ctx,
      BOARD_LEFT + BOARD_W / 2,
      BOARD_TOP + BOARD_H * 0.2,
      10,
      BOARD_W * 0.9,
      [
        [0, alpha(COLORS.fieldGlow, 0.3 + glow * 0.06)],
        [1, alpha(COLORS.fieldGlow, 0)],
      ],
    );
    ctx.fillRect(BOARD_LEFT, BOARD_TOP, BOARD_W, BOARD_H);
  });
}

// ---------------------------------------------------------------- レーン

interface Zone {
  from: number;
  to: number;
  color: string;
  /** 進める口かどうか */
  good: boolean;
}

function zonesOf(lane: Lane): Zone[] {
  return [
    { from: lane.nearHole.from, to: lane.nearHole.to, color: COLORS.holeRim, good: false },
    { from: lane.gap.from, to: lane.gap.to, color: COLORS.gap, good: true },
    { from: lane.farHole.from, to: lane.farHole.to, color: COLORS.holeRim, good: false },
  ];
}

/**
 * 落とし口。レールが切れたところから高い端まで、床が無いことを見せる。
 * 3 つの区間を色と縁取りで描き分ける(アウト / 進める / アウト)。
 */
export function drawPits(ctx: Ctx, lane: Lane, t: number): void {
  inLane(ctx, lane, () => {
    for (const z of zonesOf(lane)) {
      const w = z.to - z.from;

      // 口の中。ほとんど黒く落とし、縁のところだけ色を乗せる
      roundRect(ctx, z.from, -2, w, MOUTH_H, 8);
      ctx.fillStyle = vGrad(ctx, -2, MOUTH_H - 2, [
        [0, alpha(z.color, 0.3)],
        [0.16, alpha(COLORS.hole, 0.86)],
        [1, COLORS.hole],
      ]);
      ctx.fill();

      // 口の内側に落ちる影。奥行きが出て「開いている」と分かる
      ctx.beginPath();
      ctx.moveTo(z.from + 3, 3);
      ctx.lineTo(z.to - 3, 3);
      ctx.strokeStyle = alpha('#000000', 0.75);
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 縁
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(z.from + 2, -2);
      ctx.lineTo(z.to - 2, -2);
      ctx.strokeStyle = z.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.shadowColor = z.color;
      ctx.shadowBlur = z.good ? 16 : 7;
      ctx.stroke();
      ctx.restore();

      if (z.good) {
        // 下向きの矢羽根。ここから下の段へ進めることを示す
        const cx = (z.from + z.to) / 2;
        for (let i = 0; i < 3; i++) {
          const p = (t * 0.9 + i * 0.33) % 1;
          const y = 6 + p * (MOUTH_H - 18);
          ctx.beginPath();
          ctx.moveTo(cx - 10, y);
          ctx.lineTo(cx, y + 9);
          ctx.lineTo(cx + 10, y);
          ctx.strokeStyle = alpha(COLORS.gap, 0.8 * (1 - p));
          ctx.lineWidth = 3;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      } else {
        // アウトの口は斜線で塞ぐ。色に頼らず形でも見分けられるようにする
        ctx.save();
        roundRect(ctx, z.from, -2, w, MOUTH_H, 8);
        ctx.clip();
        for (let x = z.from - MOUTH_H; x < z.to + MOUTH_H; x += 18) {
          ctx.beginPath();
          ctx.moveTo(x, MOUTH_H);
          ctx.lineTo(x + MOUTH_H * 0.7, 0);
          ctx.strokeStyle = alpha(z.color, 0.16);
          ctx.lineWidth = 4;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 区間の境目の仕切り。奥の壁に立つリブとして描く(床ではない)
    for (const u of [lane.nearHole.to, lane.gap.to]) {
      roundRect(ctx, u - 3, 0, 6, MOUTH_H - 6, 3);
      paint(ctx, alpha(COLORS.railLo, 0.7), alpha('#000000', 0.7), 1);
    }
  });
}

/** レール。コインが走る唯一の床 */
export function drawRail(ctx: Ctx, lane: Lane): void {
  inLane(ctx, lane, () => {
    const len = lane.solids[0]!.to;

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
export function drawChute(ctx: Ctx, lane: Lane, drop: number, t: number): void {
  const a = laneP(lane, lane.gap.from);
  const b = laneP(lane, lane.gap.to);
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + lane.index);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x, b.y + drop);
  ctx.lineTo(a.x, a.y + drop);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, a, { x: a.x, y: a.y + drop }, [
    [0, alpha(COLORS.gap, 0.16 + pulse * 0.05)],
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

export function drawWinPocket(ctx: Ctx, p: WinPocket, t: number): void {
  const x = p.center.x - p.w / 2;
  const y = p.center.y - p.h / 2;
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);

  ctx.save();
  ctx.shadowColor = alpha(COLORS.pocket, 0.5 + pulse * 0.3);
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

  // 本体
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  circle(ctx, 0, 0, r);
  ctx.fillStyle = rGrad(ctx, -r * 0.32, -r * 0.36, r * 0.1, r * 1.5, [
    [0, COLORS.coinHi],
    [0.45, COLORS.coinMid],
    [1, COLORS.coinLo],
  ]);
  ctx.fill();
  ctx.restore();
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
