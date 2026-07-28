/**
 * 盤面・コイン・プランジャー・UI の描画。詳細設計書 §9。
 * すべてコード描画で、外部画像・音声・フォントを一切使わない。
 */

import {
  ANIMALS,
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  COIN_SLOT_CENTER,
  COIN_SLOT_SIZE,
  COLORS,
  GIVEUP_CENTER,
  GIVEUP_R,
  GOAL_FLOOR_Y,
  GOAL_LIP_TOP,
  GOAL_LIP_X,
  KNOB_R,
  KNOB_REST,
  LANES,
  LINE_W,
  LOGICAL_H,
  LOGICAL_W,
  type AnimalKind,
  type DifficultyConfig,
  type Hole,
  type Lane,
  type Rect,
  type Vec2,
} from '../config.ts';
import { normalAt, pointAt, tangentAt } from '../game/board.ts';
import { drawAnimalFace, drawCheerAnimal } from './animals.ts';
import {
  circle,
  clamp01,
  easeOut,
  ellipse,
  lerp,
  line,
  paint,
  polygon,
  roundRect,
  text,
  type Ctx,
} from './shapes.ts';

const LANE_THICK = 16;

// ---------------------------------------------------------------- 背景

export function drawSky(ctx: Ctx): void {
  const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(0.55, COLORS.sky);
  g.addColorStop(1, '#B8E6C8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

export function drawSunAndClouds(ctx: Ctx, t: number): void {
  circle(ctx, 630, 90, 52);
  paint(ctx, COLORS.sun, null, 0);

  const clouds: Array<[number, number, number]> = [
    [120, 120, 1],
    [520, 210, 0.75],
    [260, 60, 0.6],
  ];
  ctx.globalAlpha = 0.9;
  for (const [bx, by, s] of clouds) {
    const x = ((bx + t * 6) % (LOGICAL_W + 240)) - 120;
    circle(ctx, x, by, 34 * s);
    paint(ctx, COLORS.cloud, null, 0);
    circle(ctx, x + 34 * s, by + 6 * s, 26 * s);
    paint(ctx, COLORS.cloud, null, 0);
    circle(ctx, x - 32 * s, by + 8 * s, 22 * s);
    paint(ctx, COLORS.cloud, null, 0);
  }
  ctx.globalAlpha = 1;
}

/** 盤面の背景になる山。盤面の内側に描く */
export function drawMountain(ctx: Ctx): void {
  ctx.save();
  roundRect(ctx, BOARD_LEFT, BOARD_TOP, BOARD_RIGHT - BOARD_LEFT, BOARD_BOTTOM - BOARD_TOP, 18);
  ctx.clip();

  const g = ctx.createLinearGradient(0, BOARD_TOP, 0, BOARD_BOTTOM);
  g.addColorStop(0, '#CFEEFF');
  g.addColorStop(1, '#E9F7D9');
  ctx.fillStyle = g;
  ctx.fillRect(BOARD_LEFT, BOARD_TOP, BOARD_RIGHT - BOARD_LEFT, BOARD_BOTTOM - BOARD_TOP);

  // 奥の山
  polygon(ctx, [
    { x: BOARD_LEFT - 20, y: BOARD_BOTTOM },
    { x: 200, y: 250 },
    { x: 380, y: BOARD_BOTTOM },
  ]);
  paint(ctx, COLORS.mountainHi, null, 0);
  polygon(ctx, [
    { x: 330, y: BOARD_BOTTOM },
    { x: 540, y: 300 },
    { x: BOARD_RIGHT + 20, y: BOARD_BOTTOM },
  ]);
  paint(ctx, COLORS.mountainHi, null, 0);

  // 主役の山
  polygon(ctx, [
    { x: BOARD_LEFT - 20, y: BOARD_BOTTOM + 10 },
    { x: 360, y: 120 },
    { x: BOARD_RIGHT + 20, y: BOARD_BOTTOM + 10 },
  ]);
  paint(ctx, COLORS.mountain, null, 0);
  polygon(ctx, [
    { x: 360, y: 120 },
    { x: 250, y: 320 },
    { x: 360, y: 320 },
  ]);
  paint(ctx, COLORS.mountainSh, null, 0);

  ctx.restore();
}

/**
 * 盤面より下の筐体。実機の赤いキャビネットを模した面で、
 * ここが指を大きく動かすための操作エリアになる。
 */
export function drawCabinet(ctx: Ctx): void {
  const top = BOARD_BOTTOM + 4;
  ctx.fillStyle = '#D64B3A';
  ctx.fillRect(0, top, LOGICAL_W, LOGICAL_H - top);

  // 木枠
  ctx.fillStyle = '#C9A227';
  ctx.fillRect(0, top, 22, LOGICAL_H - top);
  ctx.fillRect(LOGICAL_W - 22, top, 22, LOGICAL_H - top);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(0, top, LOGICAL_W, 10);

  // 金属の扉
  roundRect(ctx, 62, top + 46, LOGICAL_W - 124, LOGICAL_H - top - 70, 16);
  paint(ctx, '#E4E1DA', 'rgba(0,0,0,0.35)', 5);
  for (const y of [top + 92, LOGICAL_H - 84]) {
    roundRect(ctx, 74, y, 34, 62, 8);
    paint(ctx, '#B9B4AA', 'rgba(0,0,0,0.3)', 4);
  }
  // 受け皿
  roundRect(ctx, LOGICAL_W / 2 - 90, LOGICAL_H - 78, 180, 46, 12);
  paint(ctx, '#8E8A82', 'rgba(0,0,0,0.35)', 4);
}

export function drawBoardFrame(ctx: Ctx): void {
  roundRect(ctx, BOARD_LEFT, BOARD_TOP, BOARD_RIGHT - BOARD_LEFT, BOARD_BOTTOM - BOARD_TOP, 18);
  paint(ctx, null, COLORS.ink, 10);
}

// ---------------------------------------------------------------- レーン

export function drawLane(ctx: Ctx, lane: Lane): void {
  const n = normalAt(lane);
  const t = tangentAt(lane);
  const a = lane.hi;
  const b = lane.lo;

  // 板
  polygon(ctx, [
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
    { x: b.x - n.x * LANE_THICK, y: b.y - n.y * LANE_THICK },
    { x: a.x - n.x * LANE_THICK, y: a.y - n.y * LANE_THICK },
  ]);
  // 法線は上向きなので、-n が下側 = 板の厚み
  ctx.save();
  polygon(ctx, [
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
    { x: b.x + n.x * -LANE_THICK, y: b.y - n.y * -LANE_THICK },
  ]);
  ctx.restore();

  // 上面と側面をまとめて 1 本の太い線で表現する
  ctx.beginPath();
  ctx.moveTo(a.x, a.y + LANE_THICK * 0.5);
  ctx.lineTo(b.x, b.y + LANE_THICK * 0.5);
  ctx.strokeStyle = COLORS.laneSide;
  ctx.lineWidth = LANE_THICK;
  ctx.lineCap = 'butt';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = COLORS.laneTop;
  ctx.lineWidth = LANE_THICK * 0.55;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(a.x, a.y - LANE_THICK * 0.28);
  ctx.lineTo(b.x, b.y - LANE_THICK * 0.28);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  ctx.stroke();

  // 高い端の小さなリップ(コインが飛び出さない根拠を見た目でも示す)
  const lipH = 18;
  line(
    ctx,
    { x: a.x, y: a.y },
    { x: a.x + n.x * lipH, y: a.y + n.y * lipH },
    COLORS.laneEdge,
    9,
  );

  // レバー端のリップ
  line(
    ctx,
    { x: b.x - t.x * 6, y: b.y - t.y * 6 },
    { x: b.x - t.x * 6 + n.x * lipH, y: b.y - t.y * 6 + n.y * lipH },
    COLORS.laneEdge,
    9,
  );
}

export function drawHole(ctx: Ctx, hole: Hole, moleT: number): void {
  const c = hole.center;
  const rx = hole.radius;
  const ry = rx * 0.58;

  // 穴の中(奥)
  ellipse(ctx, c.x, c.y + 1, rx, ry);
  paint(ctx, COLORS.hole, null, 0);

  // モグラ。穴の内側だけに見えるようクリップしてから描く
  if (moleT > 0.02) {
    const up = easeOut(moleT) * rx * 1.15;
    ctx.save();
    ctx.beginPath();
    ctx.rect(c.x - rx, c.y - rx * 2.4, rx * 2, rx * 2.4 + ry);
    ctx.clip();
    const my = c.y - up;
    circle(ctx, c.x, my, rx * 0.5);
    paint(ctx, '#9B7B5B', COLORS.ink, 3);
    for (const sgn of [-1, 1]) {
      circle(ctx, c.x + sgn * rx * 0.17, my - rx * 0.06, rx * 0.06);
      paint(ctx, COLORS.ink, null, 0);
    }
    ellipse(ctx, c.x, my + rx * 0.16, rx * 0.11, rx * 0.08);
    paint(ctx, '#E8A0A0', null, 0);
    ctx.restore();
  }

  // 縁。色だけでなく形(落ち込む影)でも穴だと分かるようにする
  ellipse(ctx, c.x, c.y, rx, ry);
  paint(ctx, null, COLORS.holeRim, 5);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- ゴール

export function drawGoalBasket(ctx: Ctx, d: DifficultyConfig, flagWave: number): void {
  const left = d.goalBasketLeft;
  const right = GOAL_LIP_X;
  const floor = GOAL_FLOOR_Y;
  const topLane = LANES[LANES.length - 1]!;
  const baseY =
    topLane.hi.y + ((GOAL_LIP_X - topLane.hi.x) / (topLane.lo.x - topLane.hi.x)) * 40;
  const mid = (left + right) / 2;
  const top = GOAL_LIP_TOP;

  // 山頂の岩(細い台座)
  polygon(ctx, [
    { x: mid - 40, y: floor },
    { x: mid + 42, y: floor },
    { x: mid + 26, y: baseY + 2 },
    { x: mid - 24, y: baseY + 2 },
  ]);
  paint(ctx, COLORS.mountainSh, COLORS.ink, LINE_W);

  // 旗は受け皿の後ろに立てる
  const poleX = left + 34;
  const poleTop = top - 78;
  line(ctx, { x: poleX, y: floor - 10 }, { x: poleX, y: poleTop }, COLORS.ink, 7);
  const w = Math.sin(flagWave * 4) * 6;
  polygon(ctx, [
    { x: poleX, y: poleTop },
    { x: poleX + 72, y: poleTop + 17 + w },
    { x: poleX, y: poleTop + 36 },
  ]);
  paint(ctx, COLORS.flagRed, COLORS.ink, LINE_W);

  // 受け皿の内側(奥の壁)
  ctx.beginPath();
  ctx.moveTo(left + 6, top + 6);
  ctx.lineTo(right - 6, top + 6);
  ctx.lineTo(right - 12, floor - 2);
  ctx.lineTo(left + 12, floor - 2);
  ctx.closePath();
  paint(ctx, '#DCCFB4', COLORS.ink, 3);

  text(ctx, 'ゴール', mid, top + 34, { size: 34, color: COLORS.accent, outline: 8 });

  // 受け皿の底
  ctx.beginPath();
  ctx.moveTo(left, floor - 30);
  ctx.quadraticCurveTo(mid, floor + 26, right, floor - 30);
  ctx.lineTo(right, floor - 34);
  ctx.quadraticCurveTo(mid, floor + 16, left, floor - 34);
  ctx.closePath();
  paint(ctx, COLORS.goalPocket, COLORS.ink, LINE_W);

  // 右のリップ。これを越えられないとゴールできない
  roundRect(ctx, right - 10, top, 20, floor - top + 2, 8);
  paint(ctx, COLORS.laneEdge, COLORS.ink, LINE_W);
  // 左の縁
  roundRect(ctx, left - 10, floor - 48, 20, 52, 8);
  paint(ctx, COLORS.laneEdge, COLORS.ink, LINE_W);
}

// ---------------------------------------------------------------- レバー

export function drawLever(ctx: Ctx, lane: Lane, swing: number): void {
  const n = normalAt(lane);
  const inward = lane.leverSide === 'right' ? -1 : 1;
  const base = pointAt(lane, 0.965);
  const bx = base.x + n.x * 5;
  const by = base.y + n.y * 5;

  // 鉛直からの角度。静止時は寝ていて、はたき上げると立つ
  const deg = 62 - swing * 56;
  const rad = (deg * Math.PI) / 180;
  const len = 66;
  const ex = bx + inward * Math.sin(rad) * len;
  const ey = by - Math.cos(rad) * len;

  line(ctx, { x: bx, y: by }, { x: ex, y: ey }, COLORS.ink, 14);
  line(ctx, { x: bx, y: by }, { x: ex, y: ey }, COLORS.lever, 9);
  circle(ctx, ex, ey, 12);
  paint(ctx, COLORS.lever, COLORS.ink, 3);
  circle(ctx, bx, by, 9);
  paint(ctx, COLORS.leverDark, COLORS.ink, 3);
}

// ---------------------------------------------------------------- コイン

export function drawCoin(
  ctx: Ctx,
  center: Vec2,
  radius: number,
  animalIndex: number,
  spin: number,
): void {
  const kind: AnimalKind = ANIMALS[animalIndex % ANIMALS.length]!;
  ctx.save();
  ctx.translate(center.x, center.y);
  // 転がっている感じ。顔は起こしたまま縁だけ回す
  circle(ctx, 0, 0, radius);
  paint(ctx, COLORS.coinRim, COLORS.ink, LINE_W);
  ctx.save();
  ctx.rotate(spin);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    line(
      ctx,
      { x: Math.cos(a) * radius * 0.82, y: Math.sin(a) * radius * 0.82 },
      { x: Math.cos(a) * radius * 0.97, y: Math.sin(a) * radius * 0.97 },
      '#D9A227',
      3,
    );
  }
  ctx.restore();
  circle(ctx, 0, 0, radius * 0.72);
  paint(ctx, COLORS.coinFace, COLORS.ink, 3);
  drawAnimalFace(ctx, kind, 0, 0, radius * 0.5);
  ctx.restore();
}

// ---------------------------------------------------------------- 投入口

export function drawCoinSlot(ctx: Ctx): void {
  const c = COIN_SLOT_CENTER;
  roundRect(ctx, c.x - COIN_SLOT_SIZE.w / 2, c.y - COIN_SLOT_SIZE.h / 2, COIN_SLOT_SIZE.w, COIN_SLOT_SIZE.h, 14);
  paint(ctx, COLORS.panel, COLORS.ink, LINE_W);
  roundRect(ctx, c.x - 12, c.y - 26, 24, 52, 10);
  paint(ctx, COLORS.ink, null, 0);
  text(ctx, 'コイン', c.x, c.y + 56, { size: 22, color: COLORS.ink, outline: 5 });
}

/** 投入口から段1へ入る短いシュート。始点と終点 */
export function entryChute(): { from: Vec2; to: Vec2 } {
  const lane = LANES[0]!;
  const n = normalAt(lane);
  return {
    from: { x: BOARD_LEFT + 16, y: lane.hi.y - 78 },
    to: { x: lane.hi.x + n.x * COIN_R, y: lane.hi.y + n.y * COIN_R },
  };
}

export function drawEntryChute(ctx: Ctx): void {
  const { from, to } = entryChute();
  const a = { x: from.x, y: from.y + COIN_R };
  const b = { x: to.x, y: to.y + COIN_R };
  line(ctx, a, b, COLORS.ink, 18);
  line(ctx, a, b, '#C8D4DE', 12);
}

/**
 * 投入アニメのコイン。t は 0..1。
 * 0.00-0.33 投入口へ落ちる / 0.33-0.55 機械の中(見えない) / 0.55-1.0 シュートを滑る
 */
export function drawInsertCoin(ctx: Ctx, t: number): void {
  const u = clamp01(t);
  if (u < 0.33) {
    const k = u / 0.33;
    const y = lerp(COIN_SLOT_CENTER.y - 190, COIN_SLOT_CENTER.y - 6, easeOut(k));
    ctx.save();
    ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    drawCoin(ctx, { x: COIN_SLOT_CENTER.x, y }, COIN_R, 0, k * 5);
    ctx.restore();
    return;
  }
  if (u < 0.55) return;

  const k = (u - 0.55) / 0.45;
  const { from, to } = entryChute();
  drawCoin(
    ctx,
    { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) },
    COIN_R,
    0,
    k * 6,
  );
}

// ---------------------------------------------------------------- プランジャー

export function drawPlunger(ctx: Ctx, knobY: number, pull: number): void {
  const x = KNOB_REST.x;
  const anchorY = KNOB_REST.y - 44;

  // 台座
  roundRect(ctx, x - 96, anchorY - 22, 192, 30, 14);
  paint(ctx, COLORS.panel, COLORS.ink, LINE_W);

  // バネ
  const coils = 7;
  const span = knobY - anchorY;
  ctx.beginPath();
  ctx.moveTo(x, anchorY);
  for (let i = 0; i <= coils * 2; i++) {
    const u = i / (coils * 2);
    const wob = (i % 2 === 0 ? -1 : 1) * (26 - pull * 6);
    ctx.lineTo(x + wob, anchorY + span * u);
  }
  ctx.lineTo(x, knobY);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 11;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.strokeStyle = '#9AA5B1';
  ctx.lineWidth = 6;
  ctx.stroke();

  // ノブ
  circle(ctx, x, knobY, KNOB_R);
  paint(ctx, COLORS.lever, COLORS.ink, 6);
  circle(ctx, x - KNOB_R * 0.28, knobY - KNOB_R * 0.3, KNOB_R * 0.26);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
  circle(ctx, x, knobY, KNOB_R * 0.52);
  paint(ctx, null, COLORS.leverDark, 5);
}

/** 未操作が続いたときに出す指のガイド。phase は 0..1 のループ位相 */
export function drawHandGuide(ctx: Ctx, knobY: number, phase: number): void {
  // 0..0.55 で引き下げ、0.55..0.8 で消え、0.8..1 で戻る
  let t = 0;
  let alpha = 1;
  if (phase < 0.55) {
    t = easeOut(phase / 0.55);
  } else if (phase < 0.8) {
    t = 1;
    alpha = 1 - (phase - 0.55) / 0.25;
  } else {
    t = 0;
    alpha = (phase - 0.8) / 0.2;
  }

  const x = KNOB_REST.x + KNOB_R * 0.55;
  const y = knobY + KNOB_R * 0.5 + t * 160;

  ctx.save();
  ctx.globalAlpha = alpha * 0.95;

  // 下向きの矢印
  ctx.globalAlpha = alpha * 0.5;
  for (let i = 0; i < 3; i++) {
    const ay = KNOB_REST.y + KNOB_R + 26 + i * 34;
    polygon(ctx, [
      { x: KNOB_REST.x - 20, y: ay },
      { x: KNOB_REST.x + 20, y: ay },
      { x: KNOB_REST.x, y: ay + 24 },
    ]);
    paint(ctx, '#FFFFFF', COLORS.ink, 3);
  }
  ctx.globalAlpha = alpha * 0.95;

  // 手
  ctx.translate(x, y);
  roundRect(ctx, -16, 4, 44, 52, 18);
  paint(ctx, '#FFE0C2', COLORS.ink, 4);
  roundRect(ctx, -14, -34, 20, 50, 10);
  paint(ctx, '#FFE0C2', COLORS.ink, 4);
  ctx.restore();
}

// ---------------------------------------------------------------- UI 部品

export function drawGiveUpButton(ctx: Ctx, holdProgress: number): void {
  const c = GIVEUP_CENTER;
  circle(ctx, c.x, c.y, GIVEUP_R);
  paint(ctx, 'rgba(255,248,236,0.88)', COLORS.ink, LINE_W);
  text(ctx, 'やめる', c.x, c.y, { size: 21, color: COLORS.ink });

  if (holdProgress > 0) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, GIVEUP_R + 9, -Math.PI / 2, -Math.PI / 2 + holdProgress * Math.PI * 2);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

export function drawButton(
  ctx: Ctx,
  rect: Rect,
  label: string,
  emphasized: boolean,
  pressed = false,
): void {
  const off = pressed ? 4 : 0;
  // 影
  roundRect(ctx, rect.x, rect.y + 8, rect.w, rect.h, 24);
  paint(ctx, COLORS.ink, null, 0);
  roundRect(ctx, rect.x, rect.y + off, rect.w, rect.h, 24);
  paint(ctx, emphasized ? COLORS.accent : COLORS.panel, COLORS.ink, LINE_W + 1);
  text(ctx, label, rect.x + rect.w / 2, rect.y + rect.h / 2 + off, {
    size: Math.min(56, rect.h * 0.46),
    color: emphasized ? '#FFFFFF' : COLORS.ink,
    outline: emphasized ? 0 : 0,
  });
}

export function drawStamp(ctx: Ctx, index: number, center: Vec2, size: number, scale = 1): void {
  const kind = ANIMALS[index % ANIMALS.length]!;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(scale, scale);
  ctx.rotate(((index % 5) - 2) * 0.06);
  circle(ctx, 0, 0, size * 0.5);
  paint(ctx, '#FFFFFF', COLORS.accent, 5);
  drawAnimalFace(ctx, kind, 0, 0, size * 0.33);
  ctx.restore();
}

export function drawStampBook(ctx: Ctx, count: number, origin: Vec2, width: number): void {
  const cols = 5;
  const rows = 2;
  const cell = width / cols;
  const size = cell * 0.78;

  roundRect(ctx, origin.x - 16, origin.y - 58, width + 32, cell * rows + 74, 22);
  paint(ctx, 'rgba(255,248,236,0.92)', COLORS.ink, LINE_W);

  text(ctx, `スタンプ ${count}こ`, origin.x + width / 2, origin.y - 26, {
    size: 32,
    color: COLORS.ink,
  });

  for (let i = 0; i < cols * rows; i++) {
    const cx = origin.x + (i % cols) * cell + cell / 2;
    const cy = origin.y + Math.floor(i / cols) * cell + cell / 2;
    const owned = i < Math.min(count, cols * rows);
    if (owned) {
      drawStamp(ctx, i, { x: cx, y: cy }, size);
    } else {
      ctx.save();
      ctx.setLineDash([9, 8]);
      circle(ctx, cx, cy, size * 0.5);
      paint(ctx, 'rgba(0,0,0,0.03)', COLORS.disabled, 4);
      ctx.restore();
    }
  }

  // 2 周目以降のバッジ
  const extra = Math.floor(count / (cols * rows));
  if (extra >= 1) {
    const bx = origin.x + width - 6;
    const by = origin.y + cell * rows - 4;
    circle(ctx, bx, by, 30);
    paint(ctx, COLORS.accent, COLORS.ink, LINE_W);
    text(ctx, `×${extra + 1}`, bx, by, { size: 26, color: '#FFFFFF' });
  }
}

// ---------------------------------------------------------------- タイトル / リザルト

export function drawTitleLogo(ctx: Ctx, center: Vec2, t: number): void {
  ctx.save();
  ctx.translate(center.x, center.y);

  // 山
  polygon(ctx, [
    { x: -150, y: 66 },
    { x: 0, y: -58 },
    { x: 150, y: 66 },
  ]);
  paint(ctx, COLORS.mountain, COLORS.ink, LINE_W + 1);
  polygon(ctx, [
    { x: 0, y: -58 },
    { x: -42, y: -12 },
    { x: 42, y: -12 },
  ]);
  paint(ctx, '#FFFFFF', null, 0);

  // 旗
  const w = Math.sin(t * 3) * 5;
  line(ctx, { x: 0, y: -58 }, { x: 0, y: -108 }, COLORS.ink, 6);
  polygon(ctx, [
    { x: 0, y: -108 },
    { x: 52, y: -95 + w },
    { x: 0, y: -80 },
  ]);
  paint(ctx, COLORS.flagRed, COLORS.ink, LINE_W);

  // 登っているどうぶつ
  drawCheerAnimal(ctx, 'usagi', -78, 26, 54, 0.25 + Math.sin(t * 2.4) * 0.2);
  drawCheerAnimal(ctx, 'kuma', 84, 34, 50, 0.25 + Math.sin(t * 2.4 + 1.6) * 0.2);

  ctx.restore();

  text(ctx, 'どうぶつの', center.x, center.y + 118, {
    size: 44,
    color: COLORS.ink,
    outline: 10,
  });
  text(ctx, 'やまのぼり', center.x, center.y + 178, {
    size: 66,
    color: COLORS.accent,
    outline: 12,
  });
}

/** 到達段数を山の絵で示す */
export function drawResultMountain(ctx: Ctx, center: Vec2, reachedLane: number, goal: boolean): void {
  const w = 320;
  const h = 200;
  ctx.save();
  ctx.translate(center.x, center.y);

  polygon(ctx, [
    { x: -w / 2, y: h / 2 },
    { x: 0, y: -h / 2 },
    { x: w / 2, y: h / 2 },
  ]);
  paint(ctx, COLORS.mountain, COLORS.ink, LINE_W + 1);

  // 5 段の目盛りと旗
  for (let i = 0; i < 5; i++) {
    const u = (i + 1) / 6;
    const y = h / 2 - u * h;
    const halfW = (w / 2) * (1 - u);
    const reached = i < reachedLane;
    line(ctx, { x: -halfW, y }, { x: halfW, y }, 'rgba(59,42,26,0.28)', 3);
    circle(ctx, 0, y, 13);
    paint(ctx, reached ? COLORS.accent : '#FFFFFF', COLORS.ink, 4);
  }

  // 山頂の旗
  line(ctx, { x: 0, y: -h / 2 }, { x: 0, y: -h / 2 - 46 }, COLORS.ink, 6);
  polygon(ctx, [
    { x: 0, y: -h / 2 - 46 },
    { x: 46, y: -h / 2 - 34 },
    { x: 0, y: -h / 2 - 20 },
  ]);
  paint(ctx, goal ? COLORS.flagRed : COLORS.disabled, COLORS.ink, LINE_W);

  ctx.restore();
}

// ---------------------------------------------------------------- 応援どうぶつ

export interface SideAnimal {
  kind: AnimalKind;
  pos: Vec2;
  size: number;
}

/** レーン脇に置く応援どうぶつ。盤面の空きスペースに配置する */
export function sideAnimals(): SideAnimal[] {
  // 各レーンの手前寄りに立たせる。レーンより先に描くので、
  // 柵の向こうから見ている観客のように腰から下が隠れる。
  const spots: Array<[AnimalKind, number, number, number]> = [
    ['risu', 0, 320, 50],
    ['neko', 1, 380, 48],
    ['panda', 2, 300, 50],
    ['inu', 3, 400, 48],
    ['pengin', 4, 250, 46],
  ];
  return spots.map(([kind, laneIndex, x, size]) => {
    const lane = LANES[laneIndex]!;
    const u = (x - lane.hi.x) / (lane.lo.x - lane.hi.x);
    const y = lane.hi.y + (lane.lo.y - lane.hi.y) * u;
    return { kind, pos: { x, y: y - size * 0.52 }, size };
  });
}

export function drawSideAnimals(ctx: Ctx, t: number): void {
  sideAnimals().forEach((a, i) => {
    const cheer = 0.2 + Math.sin(t * 2.2 + i * 1.3) * 0.18;
    drawCheerAnimal(ctx, a.kind, a.pos.x, a.pos.y, a.size, cheer);
  });
}
