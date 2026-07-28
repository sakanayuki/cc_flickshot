/**
 * 盤面・コイン・プランジャー・UI の描画。
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
  KNOB_R,
  KNOB_REST,
  LINE_W,
  LOGICAL_H,
  LOGICAL_W,
  ROW_COUNT,
  type AnimalKind,
  type Rect,
  type Row,
  type Vec2,
  type WinPocket,
} from '../config.ts';
import { downhillDirX, notchPos, plankSurfaceY, type Hole } from '../game/board.ts';
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

const PLANK_THICK = 18;

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

/** 盤面の背景。上が明るく下へ行くほど深い、降りていく山肌 */
export function drawBoardBackground(ctx: Ctx): void {
  ctx.save();
  roundRect(ctx, BOARD_LEFT, BOARD_TOP, BOARD_RIGHT - BOARD_LEFT, BOARD_BOTTOM - BOARD_TOP, 18);
  ctx.clip();

  const g = ctx.createLinearGradient(0, BOARD_TOP, 0, BOARD_BOTTOM);
  g.addColorStop(0, '#DCF3FF');
  g.addColorStop(0.45, '#CFEBD2');
  g.addColorStop(1, '#A9CE86');
  ctx.fillStyle = g;
  ctx.fillRect(BOARD_LEFT, BOARD_TOP, BOARD_RIGHT - BOARD_LEFT, BOARD_BOTTOM - BOARD_TOP);

  // 左右の山肌。降りていく谷に見せる
  polygon(ctx, [
    { x: BOARD_LEFT, y: BOARD_TOP },
    { x: BOARD_LEFT + 150, y: BOARD_TOP },
    { x: BOARD_LEFT, y: BOARD_BOTTOM },
  ]);
  paint(ctx, 'rgba(140,198,63,0.35)', null, 0);
  polygon(ctx, [
    { x: BOARD_RIGHT, y: BOARD_TOP },
    { x: BOARD_RIGHT - 150, y: BOARD_TOP },
    { x: BOARD_RIGHT, y: BOARD_BOTTOM },
  ]);
  paint(ctx, 'rgba(140,198,63,0.35)', null, 0);

  ctx.restore();
}

/**
 * 盤面より下の筐体。実機の赤いキャビネットを模した面で、
 * ここが指を動かすための操作エリアになる。
 */
export function drawCabinet(ctx: Ctx): void {
  const top = BOARD_BOTTOM + 4;
  ctx.fillStyle = '#D64B3A';
  ctx.fillRect(0, top, LOGICAL_W, LOGICAL_H - top);
  ctx.fillStyle = '#C9A227';
  ctx.fillRect(0, top, 18, LOGICAL_H - top);
  ctx.fillRect(LOGICAL_W - 18, top, 18, LOGICAL_H - top);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(0, top, LOGICAL_W, 8);

  // コインの受け皿。ここにあたりのコインが出てくる
  roundRect(ctx, 60, LOGICAL_H - 108, 210, 74, 14);
  paint(ctx, '#8E8A82', 'rgba(0,0,0,0.35)', 4);
  roundRect(ctx, 74, LOGICAL_H - 94, 182, 46, 10);
  paint(ctx, '#5F5C56', null, 0);
  text(ctx, 'あたり', 165, LOGICAL_H - 122, { size: 24, color: '#FFFFFF', outline: 0 });
}

export function drawBoardFrame(ctx: Ctx): void {
  roundRect(ctx, BOARD_LEFT, BOARD_TOP, BOARD_RIGHT - BOARD_LEFT, BOARD_BOTTOM - BOARD_TOP, 18);
  paint(ctx, null, COLORS.ink, 10);
}

// ---------------------------------------------------------------- 段(板と穴)

/** 板の左右にある穴。落ちたら没収 */
export function drawHole(ctx: Ctx, hole: Hole): void {
  const w = hole.right - hole.left;
  if (w < 8) return;
  const cx = (hole.left + hole.right) / 2;
  ellipse(ctx, cx, hole.y + 2, w / 2 - 2, 15);
  paint(ctx, COLORS.holeRim, null, 0);
  ellipse(ctx, cx, hole.y, w / 2 - 4, 12);
  paint(ctx, COLORS.hole, null, 0);
  // 下側だけ濃くして、落ち込んでいる形が分かるようにする
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, hole.y, w / 2 - 4, 12, 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
}

/** 1 段ぶんの板。溝(コインが止まる端)には縁を立てる */
export function drawPlank(ctx: Ctx, row: Row): void {
  const yL = plankSurfaceY(row, row.left);
  const yR = plankSurfaceY(row, row.right);

  // 厚み
  polygon(ctx, [
    { x: row.left, y: yL },
    { x: row.right, y: yR },
    { x: row.right, y: yR + PLANK_THICK },
    { x: row.left, y: yL + PLANK_THICK },
  ]);
  paint(ctx, COLORS.plankSide, COLORS.ink, LINE_W);

  // 上面
  ctx.beginPath();
  ctx.moveTo(row.left, yL);
  ctx.lineTo(row.right, yR);
  ctx.strokeStyle = COLORS.plankTop;
  ctx.lineWidth = 7;
  ctx.lineCap = 'butt';
  ctx.stroke();

  // 溝(低い側)の縁。コインはここで止まる
  const notch = notchPos(row);
  const notchTopY = row.notchY;
  line(
    ctx,
    { x: notch.x, y: notchTopY + 2 },
    { x: notch.x, y: notchTopY - 26 },
    COLORS.plankEdge,
    10,
  );
  // 高い側の縁。転がり出ないための小さな壁
  const highX = row.notchSide === 'right' ? row.left : row.right;
  line(
    ctx,
    { x: highX, y: row.highY + 2 },
    { x: highX, y: row.highY - 18 },
    COLORS.plankEdge,
    8,
  );
}

/** レバー。溝の外側に立ち、コインをはたき出す */
export function drawLever(ctx: Ctx, row: Row, swing: number): void {
  const notch = notchPos(row);
  const outward = -downhillDirX(row);
  const bx = notch.x + -outward * 4;
  const by = row.notchY + 4;

  // 水平からの角度。静止時は寝ていて、はたくと立つ
  const deg = 58 - swing * 50;
  const rad = (deg * Math.PI) / 180;
  const len = 58;
  const ex = bx - outward * Math.cos(rad) * len;
  const ey = by - Math.sin(rad) * len;

  line(ctx, { x: bx, y: by }, { x: ex, y: ey }, COLORS.ink, 13);
  line(ctx, { x: bx, y: by }, { x: ex, y: ey }, COLORS.lever, 8);
  circle(ctx, ex, ey, 11);
  paint(ctx, COLORS.lever, COLORS.ink, 3);
  circle(ctx, bx, by, 8);
  paint(ctx, COLORS.leverDark, COLORS.ink, 3);
}

// ---------------------------------------------------------------- あたりの口

export function drawWinPocket(ctx: Ctx, pocket: WinPocket, wave: number): void {
  const w = pocket.right - pocket.left;
  const cx = (pocket.left + pocket.right) / 2;
  const top = pocket.y;

  // 受け口
  ctx.beginPath();
  ctx.moveTo(pocket.left, top);
  ctx.lineTo(pocket.right, top);
  ctx.lineTo(pocket.right - 18, top + 46);
  ctx.lineTo(pocket.left + 18, top + 46);
  ctx.closePath();
  paint(ctx, COLORS.pocket, COLORS.ink, LINE_W);

  // 両端の縁
  for (const x of [pocket.left, pocket.right]) {
    roundRect(ctx, x - 9, top - 26, 18, 34, 8);
    paint(ctx, COLORS.plankEdge, COLORS.ink, LINE_W);
  }

  // 旗
  const poleX = cx;
  const poleTop = top - 84;
  line(ctx, { x: poleX, y: top - 6 }, { x: poleX, y: poleTop }, COLORS.ink, 6);
  const wv = Math.sin(wave * 4) * 5;
  polygon(ctx, [
    { x: poleX, y: poleTop },
    { x: poleX + 60, y: poleTop + 15 + wv },
    { x: poleX, y: poleTop + 31 },
  ]);
  paint(ctx, COLORS.flagRed, COLORS.ink, LINE_W);

  text(ctx, 'あたり', cx, top + 24, { size: Math.min(34, w * 0.22), color: COLORS.accent, outline: 7 });
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

// ---------------------------------------------------------------- 投入口(右上)

export function drawCoinSlot(ctx: Ctx): void {
  const c = COIN_SLOT_CENTER;
  roundRect(
    ctx,
    c.x - COIN_SLOT_SIZE.w / 2,
    c.y - COIN_SLOT_SIZE.h / 2,
    COIN_SLOT_SIZE.w,
    COIN_SLOT_SIZE.h,
    14,
  );
  paint(ctx, COLORS.panel, COLORS.ink, LINE_W);
  roundRect(ctx, c.x - 11, c.y - 24, 22, 48, 10);
  paint(ctx, COLORS.ink, null, 0);
  text(ctx, 'コイン', c.x, c.y + 54, { size: 22, color: COLORS.ink, outline: 5 });
}

/** 投入口から 1 段目の板へ落ちるシュート */
export function entryChute(rows: readonly Row[]): { from: Vec2; to: Vec2 } {
  const row = rows[0]!;
  const notch = notchPos(row);
  return {
    from: { x: COIN_SLOT_CENTER.x, y: COIN_SLOT_CENTER.y + 46 },
    to: { x: notch.x - downhillDirX(row) * 70, y: row.highY - COIN_R },
  };
}

export function drawEntryChute(ctx: Ctx, rows: readonly Row[]): void {
  const { from, to } = entryChute(rows);
  line(ctx, from, { x: to.x, y: to.y }, COLORS.ink, 18);
  line(ctx, from, { x: to.x, y: to.y }, '#C8D4DE', 12);
}

/**
 * 投入アニメのコイン。t は 0..1。
 * 0.00-0.35 投入口へ落ちる / 0.35-0.55 機械の中 / 0.55-1.0 シュートを滑る
 */
export function drawInsertCoin(ctx: Ctx, rows: readonly Row[], t: number): void {
  const u = clamp01(t);
  if (u < 0.35) {
    const k = u / 0.35;
    const y = lerp(COIN_SLOT_CENTER.y - 150, COIN_SLOT_CENTER.y - 4, easeOut(k));
    ctx.save();
    ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    drawCoin(ctx, { x: COIN_SLOT_CENTER.x, y }, COIN_R, 0, k * 5);
    ctx.restore();
    return;
  }
  if (u < 0.55) return;
  const k = (u - 0.55) / 0.45;
  const { from, to } = entryChute(rows);
  drawCoin(ctx, { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) }, COIN_R, 0, k * 6);
}

// ---------------------------------------------------------------- プランジャー

export function drawPlunger(ctx: Ctx, knobY: number, pull: number): void {
  const x = KNOB_REST.x;
  const anchorY = KNOB_REST.y - 40;

  roundRect(ctx, x - 78, anchorY - 20, 156, 26, 12);
  paint(ctx, COLORS.panel, COLORS.ink, LINE_W);

  const coils = 6;
  const span = knobY - anchorY;
  ctx.beginPath();
  ctx.moveTo(x, anchorY);
  for (let i = 0; i <= coils * 2; i++) {
    const u = i / (coils * 2);
    const wob = (i % 2 === 0 ? -1 : 1) * (20 - pull * 5);
    ctx.lineTo(x + wob, anchorY + span * u);
  }
  ctx.lineTo(x, knobY);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.strokeStyle = '#9AA5B1';
  ctx.lineWidth = 5;
  ctx.stroke();

  circle(ctx, x, knobY, KNOB_R);
  paint(ctx, COLORS.lever, COLORS.ink, 6);
  circle(ctx, x - KNOB_R * 0.28, knobY - KNOB_R * 0.3, KNOB_R * 0.26);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
  circle(ctx, x, knobY, KNOB_R * 0.52);
  paint(ctx, null, COLORS.leverDark, 5);
}

/** 未操作が続いたときに出す指のガイド */
export function drawHandGuide(ctx: Ctx, knobY: number, phase: number): void {
  let t = 0;
  let alpha = 1;
  if (phase < 0.55) t = easeOut(phase / 0.55);
  else if (phase < 0.8) {
    t = 1;
    alpha = 1 - (phase - 0.55) / 0.25;
  } else {
    t = 0;
    alpha = (phase - 0.8) / 0.2;
  }

  const x = KNOB_REST.x + KNOB_R * 0.6;
  const y = knobY + KNOB_R * 0.5 + t * 110;

  ctx.save();
  ctx.globalAlpha = alpha * 0.5;
  for (let i = 0; i < 3; i++) {
    const ay = KNOB_REST.y + KNOB_R + 18 + i * 28;
    polygon(ctx, [
      { x: KNOB_REST.x - 17, y: ay },
      { x: KNOB_REST.x + 17, y: ay },
      { x: KNOB_REST.x, y: ay + 20 },
    ]);
    paint(ctx, '#FFFFFF', COLORS.ink, 3);
  }
  ctx.globalAlpha = alpha * 0.95;
  ctx.translate(x, y);
  roundRect(ctx, -14, 4, 38, 46, 16);
  paint(ctx, '#FFE0C2', COLORS.ink, 4);
  roundRect(ctx, -12, -30, 18, 44, 9);
  paint(ctx, '#FFE0C2', COLORS.ink, 4);
  ctx.restore();
}

// ---------------------------------------------------------------- UI 部品

export function drawGiveUpButton(ctx: Ctx, holdProgress: number): void {
  const c = GIVEUP_CENTER;
  circle(ctx, c.x, c.y, GIVEUP_R);
  paint(ctx, 'rgba(255,248,236,0.9)', COLORS.ink, LINE_W);
  text(ctx, 'やめる', c.x, c.y, { size: 20, color: COLORS.ink });
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
  roundRect(ctx, rect.x, rect.y + 8, rect.w, rect.h, 24);
  paint(ctx, COLORS.ink, null, 0);
  roundRect(ctx, rect.x, rect.y + off, rect.w, rect.h, 24);
  paint(ctx, emphasized ? COLORS.accent : COLORS.panel, COLORS.ink, LINE_W + 1);
  text(ctx, label, rect.x + rect.w / 2, rect.y + rect.h / 2 + off, {
    size: Math.min(56, rect.h * 0.46),
    color: emphasized ? '#FFFFFF' : COLORS.ink,
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
    if (i < Math.min(count, cols * rows)) {
      drawStamp(ctx, i, { x: cx, y: cy }, size);
    } else {
      ctx.save();
      ctx.setLineDash([9, 8]);
      circle(ctx, cx, cy, size * 0.5);
      paint(ctx, 'rgba(0,0,0,0.03)', COLORS.disabled, 4);
      ctx.restore();
    }
  }

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

  // 降りていく段々の絵
  for (let i = 0; i < 4; i++) {
    const y = -50 + i * 34;
    const w = 150 - i * 6;
    const x = i % 2 === 0 ? -w : 0;
    roundRect(ctx, x, y, w, 15, 7);
    paint(ctx, COLORS.plankTop, COLORS.ink, LINE_W);
  }
  // 転がり降りるコイン
  const k = (t * 0.6) % 1;
  drawCoin(ctx, { x: lerp(-120, 110, k), y: lerp(-58, 44, k) }, 24, 0, k * 10);

  drawCheerAnimal(ctx, 'usagi', -128, 74, 50, 0.3 + Math.sin(t * 2.4) * 0.2);
  drawCheerAnimal(ctx, 'kuma', 128, 74, 48, 0.3 + Math.sin(t * 2.4 + 1.6) * 0.2);
  ctx.restore();

  text(ctx, 'どうぶつの', center.x, center.y + 128, { size: 44, color: COLORS.ink, outline: 10 });
  text(ctx, 'やまくだり', center.x, center.y + 188, {
    size: 66,
    color: COLORS.accent,
    outline: 12,
  });
}

/** 何段目まで降りたかを、上から下へ並ぶ段で示す */
export function drawResultSteps(ctx: Ctx, center: Vec2, reachedDepth: number, won: boolean): void {
  const w = 300;
  const h = 210;
  ctx.save();
  ctx.translate(center.x, center.y);

  for (let i = 0; i < ROW_COUNT; i++) {
    const y = -h / 2 + (i * h) / ROW_COUNT;
    const pw = w * 0.42;
    const x = i % 2 === 0 ? 8 : -pw - 8;
    const done = i < reachedDepth;
    roundRect(ctx, x, y, pw, 16, 8);
    paint(ctx, done ? COLORS.plankTop : '#FFFFFF', COLORS.ink, LINE_W);
  }

  // あたりの口
  const py = h / 2 + 6;
  roundRect(ctx, -60, py, 120, 30, 10);
  paint(ctx, won ? COLORS.accent : '#FFFFFF', COLORS.ink, LINE_W);
  if (won) text(ctx, 'あたり', 0, py + 15, { size: 22, color: '#FFFFFF' });

  ctx.restore();
}

// ---------------------------------------------------------------- 応援どうぶつ

/** 各段の板の上に立たせる。板より先に描くので腰から下が隠れる */
export function drawSideAnimals(ctx: Ctx, rows: readonly Row[], t: number): void {
  const kinds: AnimalKind[] = ['risu', 'neko', 'panda', 'inu', 'pengin'];
  rows.forEach((row, i) => {
    const kind = kinds[i % kinds.length]!;
    // 溝と反対側(高い側)に寄せて、コインの通り道を避ける
    const x = row.notchSide === 'right' ? row.left + 54 : row.right - 54;
    const size = 46;
    const y = plankSurfaceY(row, x) - size * 0.52;
    drawCheerAnimal(ctx, kind, x, y, size, 0.2 + Math.sin(t * 2.2 + i * 1.3) * 0.18);
  });
}
