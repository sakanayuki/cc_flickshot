/**
 * 盤面・コイン・プランジャー・UI の描画。
 * すべてコード描画で、外部画像・音声・フォントを一切使わない。
 *
 * 見た目は実機の 10 円ゲーム筐体(赤いキャビネット+化粧板+
 * オレンジのリムが付いた丸い落とし穴)を絵本調に寄せたもの。
 */

import {
  ANIMALS,
  BOARD_BOTTOM,
  BOARD_CENTER_X,
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
  LANE_RAIL,
  LANE_W,
  LINE_W,
  LOGICAL_H,
  LOGICAL_W,
  ROW_COUNT,
  ROW_GAP,
  type AnimalKind,
  type Rect,
  type Vec2,
} from '../config.ts';
import { posOnLane, type Lane, type WinPocket } from '../game/board.ts';
import type { LeverState } from '../game/levers.ts';
import { drawAnimalFace, drawCheerAnimal } from './animals.ts';
import {
  circle,
  clamp,
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

// ---------------------------------------------------------------- 空(タイトル用)

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

// ---------------------------------------------------------------- 筐体

/** ネジ。筐体のあちこちに打って実機らしくする */
function screw(ctx: Ctx, x: number, y: number, r = 7): void {
  circle(ctx, x, y, r);
  paint(ctx, '#E9E2D2', COLORS.ink, 3);
  line(ctx, { x: x - r * 0.5, y }, { x: x + r * 0.5, y }, COLORS.ink, 2);
}

/**
 * 画面全体の赤いキャビネット。盤面の窓より先に描く。
 * 実機と同じく、赤い胴体+金の縁飾りで構成する。
 */
export function drawCabinetBase(ctx: Ctx): void {
  const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  g.addColorStop(0, '#E25640');
  g.addColorStop(0.5, COLORS.cabinet);
  g.addColorStop(1, COLORS.cabinetDark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  // 左右の金の帯
  for (const x of [0, LOGICAL_W - 16]) {
    ctx.fillStyle = COLORS.cabinetTrim;
    ctx.fillRect(x, 0, 16, LOGICAL_H);
    ctx.fillStyle = COLORS.cabinetTrimDark;
    ctx.fillRect(x + (x === 0 ? 12 : 0), 0, 4, LOGICAL_H);
  }
}

/** 盤面より下の操作エリア(プランジャー帯)の装飾 */
export function drawCabinetLower(ctx: Ctx): void {
  const top = BOARD_BOTTOM + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(16, top, LOGICAL_W - 32, 10);

  // コインの受け皿。ここにあたりのコインが出てくる
  roundRect(ctx, 56, LOGICAL_H - 116, 214, 82, 16);
  paint(ctx, COLORS.cabinetDark, COLORS.ink, LINE_W);
  roundRect(ctx, 70, LOGICAL_H - 102, 186, 54, 12);
  const g = ctx.createLinearGradient(0, LOGICAL_H - 102, 0, LOGICAL_H - 48);
  g.addColorStop(0, '#4A423A');
  g.addColorStop(1, '#6B6158');
  paint(ctx, '#5F5C56', null, 0);
  ctx.fillStyle = g;
  ctx.fill();
  text(ctx, 'あたり ⭐', 163, LOGICAL_H - 130, { size: 22, color: '#FFE9B8', outline: 0 });

  screw(ctx, 36, top + 24);
  screw(ctx, LOGICAL_W - 36, top + 24);
  screw(ctx, 36, LOGICAL_H - 30);
  screw(ctx, LOGICAL_W - 36, LOGICAL_H - 30);
}

/** 盤面の窓枠。中身をすべて描いた後、最後に重ねる */
export function drawBoardFrame(ctx: Ctx): void {
  const w = BOARD_RIGHT - BOARD_LEFT;
  const h = BOARD_BOTTOM - BOARD_TOP;
  // 外側の太い枠(ガラス窓の押さえ)
  roundRect(ctx, BOARD_LEFT - 8, BOARD_TOP - 8, w + 16, h + 16, 24);
  paint(ctx, null, COLORS.cabinetDark, 16);
  roundRect(ctx, BOARD_LEFT, BOARD_TOP, w, h, 18);
  paint(ctx, null, COLORS.ink, 8);
  // 内側の金のライン
  roundRect(ctx, BOARD_LEFT + 6, BOARD_TOP + 6, w - 12, h - 12, 14);
  paint(ctx, null, 'rgba(242,179,61,0.85)', 4);

  screw(ctx, BOARD_LEFT - 14, BOARD_TOP - 14);
  screw(ctx, BOARD_RIGHT + 14, BOARD_TOP - 14);
  screw(ctx, BOARD_LEFT - 14, BOARD_BOTTOM + 14);
  screw(ctx, BOARD_RIGHT + 14, BOARD_BOTTOM + 14);

  // ガラスの反射(左上から斜めの淡い帯)
  ctx.save();
  roundRect(ctx, BOARD_LEFT, BOARD_TOP, w, h, 18);
  ctx.clip();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#FFFFFF';
  polygon(ctx, [
    { x: BOARD_LEFT + 30, y: BOARD_TOP },
    { x: BOARD_LEFT + 170, y: BOARD_TOP },
    { x: BOARD_LEFT + 60, y: BOARD_BOTTOM },
    { x: BOARD_LEFT - 50, y: BOARD_BOTTOM },
  ]);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- 盤面の化粧板

/**
 * 盤面の背景(化粧板)。クリーム色の板に、絵本調の飾りを印刷する。
 * コースの案内はレーンそのものが担うので、矢印は最小限にとどめる。
 */
export function drawBoardFace(ctx: Ctx, lanes: readonly Lane[]): void {
  const w = BOARD_RIGHT - BOARD_LEFT;
  const h = BOARD_BOTTOM - BOARD_TOP;
  ctx.save();
  roundRect(ctx, BOARD_LEFT, BOARD_TOP, w, h, 18);
  ctx.clip();

  const g = ctx.createLinearGradient(0, BOARD_TOP, 0, BOARD_BOTTOM);
  g.addColorStop(0, '#FFF8DF');
  g.addColorStop(0.6, COLORS.boardFace);
  g.addColorStop(1, COLORS.boardFaceDeep);
  ctx.fillStyle = g;
  ctx.fillRect(BOARD_LEFT, BOARD_TOP, w, h);

  // 印刷されたおひさまと雲(淡く)
  ctx.globalAlpha = 0.4;
  circle(ctx, BOARD_LEFT + 92, BOARD_TOP + 74, 42);
  paint(ctx, COLORS.sun, null, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    line(
      ctx,
      { x: BOARD_LEFT + 92 + Math.cos(a) * 54, y: BOARD_TOP + 74 + Math.sin(a) * 54 },
      { x: BOARD_LEFT + 92 + Math.cos(a) * 66, y: BOARD_TOP + 74 + Math.sin(a) * 66 },
      COLORS.sun,
      6,
    );
  }
  ctx.globalAlpha = 1;

  // 草むら(下辺)
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 9; i++) {
    const bx = BOARD_LEFT + 20 + i * (w / 8);
    circle(ctx, bx, BOARD_BOTTOM + 16, 34 + (i % 3) * 10);
    paint(ctx, '#A8D77E', null, 0);
  }
  ctx.globalAlpha = 1;

  // 印刷された草木。レーンとレーンのあいだ、中央付近の余白に置く
  lanes.forEach((lane, i) => {
    if (i === 0) return;
    const bx = BOARD_CENTER_X + (i % 2 === 0 ? -1 : 1) * 130;
    const by = lane.low.y - ROW_GAP / 2 - 10;
    ctx.globalAlpha = 0.3;
    for (let k = 0; k < 3; k++) {
      const gx = bx + (k - 1) * 13;
      const gh = 20 + ((i + k) % 3) * 9;
      ctx.beginPath();
      ctx.moveTo(gx, by + 16);
      ctx.quadraticCurveTo(gx + (k - 1) * 7, by + 16 - gh * 0.7, gx + (k - 1) * 11, by + 16 - gh);
      ctx.strokeStyle = '#6FAE3F';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    if (i % 2 === 0) {
      ctx.globalAlpha = 0.38;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        circle(ctx, bx + 40 + Math.cos(a) * 6, by - 2 + Math.sin(a) * 6, 4.5);
        paint(ctx, '#FF9BB5', null, 0);
      }
      circle(ctx, bx + 40, by - 2, 3.5);
      paint(ctx, COLORS.sun, null, 0);
    }
    ctx.globalAlpha = 1;
  });

  ctx.restore();
}

// ---------------------------------------------------------------- レーン

/** レーン上の 2 点を結ぶ帯を描く。太さと色を変えて重ねるための下請け */
function laneBand(ctx: Ctx, lane: Lane, from: number, to: number, color: string, w: number): void {
  const a = posOnLane(lane, from);
  const b = posOnLane(lane, to);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** レーンのうち、実線(コインが乗れる)部分の区間 */
function solidSpans(lane: Lane): Array<[number, number]> {
  return [
    [0, lane.nearHole.from],
    [lane.nearHole.to, lane.gap.from],
  ];
}

/**
 * ななめ上向きのレーン 1 本。
 * 実機の写真と同じく、低い端(レバー側)から高い端へ向かって登る棒。
 * 手前の穴・隙間・奥の穴のところは棒が途切れる。
 */
export function drawLane(ctx: Ctx, lane: Lane): void {
  ctx.save();
  const spans = solidSpans(lane);
  const outer = LANE_W + LANE_RAIL * 2;

  // 影
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.translate(3, 7);
  for (const [a, b] of spans) laneBand(ctx, lane, a, b, '#000000', outer);
  ctx.restore();

  // 穴のところは、レーンの床が抜けて奥が見えている帯として描く。
  // こうすると丸穴が「レーンに開いた口」に見える
  for (const h of [lane.nearHole, lane.farHole]) {
    laneBand(ctx, lane, h.from - 6, h.to + 6, COLORS.ink, outer);
    laneBand(ctx, lane, h.from - 4, h.to + 4, COLORS.laneEdge, outer - 8);
  }

  for (const [a, b] of spans) {
    laneBand(ctx, lane, a, b, COLORS.ink, outer);
    laneBand(ctx, lane, a, b, COLORS.laneRail, outer - 6);
    laneBand(ctx, lane, a, b, COLORS.laneFloor, LANE_W);
  }
  ctx.restore();
}

/**
 * 登る向きの目印。レーンの床に薄く並べる。
 * 3歳児にとって「どっちへ登るか」を示す唯一のコース案内。
 */
export function drawLaneArrows(ctx: Ctx, lane: Lane): void {
  ctx.save();
  ctx.globalAlpha = 0.3;
  const d = lane.dir;
  const n = { x: -d.y, y: d.x };
  for (const [a, b] of solidSpans(lane)) {
    for (let u = a + 52; u < b - 26; u += 76) {
      const p = posOnLane(lane, u);
      const t = 11;
      polygon(ctx, [
        { x: p.x - d.x * t + n.x * t * 0.8, y: p.y - d.y * t + n.y * t * 0.8 },
        { x: p.x + d.x * t, y: p.y + d.y * t },
        { x: p.x - d.x * t - n.x * t * 0.8, y: p.y - d.y * t - n.y * t * 0.8 },
      ]);
      paint(ctx, COLORS.accent, null, 0);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------- 穴と隙間

/** 区間を丸で埋めて、こげ茶の落とし穴として描く */
function holeCircles(lane: Lane, span: { from: number; to: number }): Array<{ cx: number; cy: number; r: number }> {
  const len = span.to - span.from;
  const n = Math.max(1, Math.round(len / 72));
  const step = len / n;
  return Array.from({ length: n }, (_, k) => {
    const c = posOnLane(lane, span.from + step * (k + 0.5));
    return { cx: c.x, cy: c.y, r: Math.min(step / 2, LANE_W / 2) };
  });
}

/**
 * アウトの穴。実機と同じ、オレンジのリムが付いたこげ茶の穴。
 * レーンが途切れているところに開いている。
 */
export function drawOutHoles(ctx: Ctx, lane: Lane): void {
  for (const span of [lane.nearHole, lane.farHole]) {
    for (const c of holeCircles(lane, span)) {
      circle(ctx, c.cx, c.cy, c.r + 8);
      paint(ctx, COLORS.holeRing, COLORS.ink, LINE_W);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.cx, c.cy, c.r + 5, Math.PI * 0.08, Math.PI * 0.92);
      ctx.strokeStyle = COLORS.holeRingDark;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();

      const g = ctx.createRadialGradient(c.cx, c.cy + c.r * 0.35, c.r * 0.15, c.cx, c.cy, c.r);
      g.addColorStop(0, COLORS.holePit);
      g.addColorStop(1, COLORS.hole);
      circle(ctx, c.cx, c.cy, c.r);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

/**
 * 進める隙間。ここから落ちると 1 段下へ行けるので、
 * アウトの穴とはっきり違う見た目(緑の口+下向きの矢印)にする。
 */
export function drawGap(ctx: Ctx, lane: Lane, wave: number): void {
  const a = posOnLane(lane, lane.gap.from);
  const b = posOnLane(lane, lane.gap.to);
  const half = LANE_W / 2;

  ctx.save();
  // 落ちていく先を示す淡い筒。ここから 1 段下へ抜けることを見せる
  ctx.globalAlpha = 0.16;
  polygon(ctx, [
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
    { x: b.x, y: b.y + ROW_GAP },
    { x: a.x, y: a.y + ROW_GAP },
  ]);
  paint(ctx, COLORS.gapRing, null, 0);
  ctx.globalAlpha = 1;

  // 口の左右の柱。レーンが途切れていることをはっきり見せる
  for (const e of [a, b]) {
    const n = { x: -lane.dir.y, y: lane.dir.x };
    line(
      ctx,
      { x: e.x + n.x * (half + LANE_RAIL), y: e.y + n.y * (half + LANE_RAIL) },
      { x: e.x - n.x * (half + LANE_RAIL), y: e.y - n.y * (half + LANE_RAIL) },
      COLORS.ink,
      10,
    );
    line(
      ctx,
      { x: e.x + n.x * (half + LANE_RAIL), y: e.y + n.y * (half + LANE_RAIL) },
      { x: e.x - n.x * (half + LANE_RAIL), y: e.y - n.y * (half + LANE_RAIL) },
      COLORS.gapRing,
      5,
    );
  }

  // 下へ落ちる合図。ゆっくり上下する矢印を口の下に並べる
  const bob = Math.sin(wave * 2.4) * 5;
  ctx.globalAlpha = 0.9;
  for (const k of [0.22, 0.5, 0.78]) {
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k + half + 20 + bob;
    polygon(ctx, [
      { x: x - 12, y: y - 10 },
      { x: x + 12, y: y - 10 },
      { x, y: y + 11 },
    ]);
    paint(ctx, COLORS.gapRing, COLORS.ink, 3);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * 穴の手前側のリム。沈むコインの上に重ねて描き、
 * コインが「穴の中へ入っていく」ように見せる。
 */
export function drawHoleFront(ctx: Ctx, at: Vec2, r: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(at.x, at.y, r + 8, 0, Math.PI);
  ctx.arc(at.x, at.y, r, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = COLORS.holeRing;
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(at.x, at.y, r * 0.97, 0, Math.PI);
  ctx.strokeStyle = COLORS.hole;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- レバー

/**
 * レバー。レーンの低い端(壁ぎわ)に立ち、コインを斜面の上へはたき出す。
 * 軸は筐体の側面を貫いて丸いノブになる。
 */
export function drawLever(ctx: Ctx, lane: Lane, lever: LeverState): void {
  const d = lane.dir;
  const outward = lane.side === 'left' ? -1 : 1;
  const root = { x: lane.low.x + outward * 34, y: lane.low.y + LANE_W / 2 + 12 };
  const len = 54;

  // 姿勢。swing<0 はタメ、swing>0 は斜面の上へはたく
  const base = Math.atan2(-d.y, -d.x); // 斜面の下向き
  const swing = lever.swing < 0 ? lever.swing * 0.3 : lever.swing * 1.5;
  const ang = base + outward * swing;
  const tip = { x: root.x + Math.cos(ang) * len, y: root.y + Math.sin(ang) * len };

  if (lever.flash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.3 * lever.flash;
    line(ctx, root, tip, COLORS.accent, 22);
    ctx.restore();
  }

  line(ctx, root, tip, COLORS.ink, 15);
  line(ctx, root, tip, COLORS.lever, 9);
  circle(ctx, tip.x, tip.y, 12);
  paint(ctx, COLORS.lever, COLORS.ink, 3.5);
  circle(ctx, tip.x - 3, tip.y - 3, 4.5);
  paint(ctx, 'rgba(255,255,255,0.55)', null, 0);
  circle(ctx, root.x, root.y, 8);
  paint(ctx, COLORS.leverDark, COLORS.ink, 3);
}

/**
 * 筐体の左右の縁に並ぶレバーのノブ。
 * レーンの低い端が右・左・右…と交互なので、ノブも交互に並ぶ(実機の写真と同じ)。
 */
export function drawSideKnobs(ctx: Ctx, lanes: readonly Lane[], levers: readonly LeverState[]): void {
  lanes.forEach((lane) => {
    const lever = levers[lane.index];
    if (!lever) return;
    const atRight = lane.side === 'right';
    const wallX = atRight ? BOARD_RIGHT + 22 : BOARD_LEFT - 22;
    const y = lane.low.y + LANE_W / 2 + 12;
    const dirIn = atRight ? -1 : 1;

    const out = lever.swing < 0 ? -lever.swing * 9 : (1 - lever.swing) * 2;
    const kx = wallX - dirIn * out;

    line(ctx, { x: kx, y }, { x: kx + dirIn * 30, y }, '#8E8A82', 8);
    roundRect(ctx, kx - 11, y - 15, 22, 30, 7);
    paint(ctx, COLORS.cabinetTrimDark, COLORS.ink, 3);
    circle(ctx, kx, y, 16);
    paint(ctx, '#E3DDCE', COLORS.ink, LINE_W);
    circle(ctx, kx, y, 10);
    paint(ctx, '#A9B2BC', COLORS.ink, 3);
    circle(ctx, kx - 5, y - 6, 4.5);
    paint(ctx, 'rgba(255,255,255,0.8)', null, 0);
  });
}

/** ノブとレバーの軸をつなぐロッド。レーンより先(奥)に描く */
export function drawLeverRods(ctx: Ctx, lanes: readonly Lane[]): void {
  lanes.forEach((lane) => {
    const atRight = lane.side === 'right';
    const wallX = atRight ? BOARD_RIGHT : BOARD_LEFT;
    const y = lane.low.y + LANE_W / 2 + 12;
    const rootX = lane.low.x + (atRight ? 34 : -34);
    ctx.globalAlpha = 0.55;
    line(ctx, { x: wallX, y }, { x: rootX, y }, '#8E8A82', 6);
    ctx.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------- あたりの口

/**
 * あたりの口。レーンの終点に置いた金の受け皿。
 * 止まり木と同じで、ちょうどよい勢いで来たコインだけが受け止められる。
 */
export function drawWinPocket(ctx: Ctx, pocket: WinPocket, wave: number): void {
  const cx = (pocket.left + pocket.right) / 2;
  const w = pocket.right - pocket.left;
  const top = pocket.y;

  // 受け口の金のカップ
  polygon(ctx, [
    { x: pocket.left, y: top },
    { x: pocket.right, y: top },
    { x: pocket.right - 16, y: top + 52 },
    { x: pocket.left + 16, y: top + 52 },
  ]);
  paint(ctx, COLORS.pocket, COLORS.ink, LINE_W);
  polygon(ctx, [
    { x: pocket.left + 9, y: top + 9 },
    { x: pocket.right - 9, y: top + 9 },
    { x: pocket.right - 21, y: top + 43 },
    { x: pocket.left + 21, y: top + 43 },
  ]);
  paint(ctx, COLORS.pocketDark, null, 0);
  ellipse(ctx, cx, top + 5, w / 2 - 10, 9);
  paint(ctx, COLORS.hole, COLORS.ink, 3);

  // 両端の柱
  for (const x of [pocket.left, pocket.right]) {
    roundRect(ctx, x - 9, top - 26, 18, 36, 8);
    paint(ctx, COLORS.flagRed, COLORS.ink, LINE_W);
    circle(ctx, x, top - 28, 8);
    paint(ctx, COLORS.pocket, COLORS.ink, 3);
  }

  // きらきら
  const tw = (Math.sin(wave * 3) + 1) / 2;
  ctx.globalAlpha = 0.5 + tw * 0.5;
  for (const [sx, sy, sz] of [
    [cx - w * 0.3, top + 20, 5],
    [cx + w * 0.28, top + 28, 4],
  ] as const) {
    line(ctx, { x: sx - sz, y: sy }, { x: sx + sz, y: sy }, '#FFFFFF', 3);
    line(ctx, { x: sx, y: sy - sz }, { x: sx, y: sy + sz }, '#FFFFFF', 3);
  }
  ctx.globalAlpha = 1;

  text(ctx, 'あたり', cx, top + 32, {
    size: Math.min(30, w * 0.22),
    color: '#FFFFFF',
    outline: 6,
    outlineColor: COLORS.ink,
  });
}

// ---------------------------------------------------------------- コイン

export function drawCoin(
  ctx: Ctx,
  center: Vec2,
  radius: number,
  animalIndex: number,
  spin: number,
  squash = 0,
): void {
  const kind: AnimalKind = ANIMALS[animalIndex % ANIMALS.length]!;
  ctx.save();
  ctx.translate(center.x, center.y);
  if (squash > 0) {
    ctx.translate(0, radius * squash * 0.3);
    ctx.scale(1 + squash * 0.18, 1 - squash * 0.3);
  }
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
  // つや
  ctx.beginPath();
  ctx.arc(-radius * 0.42, -radius * 0.42, radius * 0.5, Math.PI * 0.95, Math.PI * 1.45);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.stroke();
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
  paint(ctx, COLORS.cabinet, COLORS.ink, LINE_W);
  roundRect(
    ctx,
    c.x - COIN_SLOT_SIZE.w / 2 + 7,
    c.y - COIN_SLOT_SIZE.h / 2 + 7,
    COIN_SLOT_SIZE.w - 14,
    COIN_SLOT_SIZE.h - 14,
    10,
  );
  paint(ctx, null, 'rgba(242,179,61,0.9)', 3);
  roundRect(ctx, c.x - 11, c.y - 30, 22, 42, 10);
  paint(ctx, COLORS.ink, null, 0);
  text(ctx, 'コイン', c.x, c.y + 26, { size: 17, color: '#FFF8EC', outline: 0 });
}

/**
 * 投入口からレーンの入口(1 本目の走路の始点)へ落とすシュートの経路。
 * 入口は右上なので、投入口からすぐ下へつながる短い滑り台になる。
 */
export function entryChute(lanes: readonly Lane[], entryU: number): { from: Vec2; ctrl: Vec2; to: Vec2 } {
  const to: Vec2 = posOnLane(lanes[0]!, entryU);
  const from: Vec2 = { x: COIN_SLOT_CENTER.x, y: COIN_SLOT_CENTER.y + 40 };
  return { from, ctrl: { x: to.x + (from.x - to.x) * 0.4, y: from.y + 10 }, to };
}

function chutePoint(lanes: readonly Lane[], entryU: number, u: number): Vec2 {
  const { from, ctrl, to } = entryChute(lanes, entryU);
  const a = 1 - u;
  return {
    x: a * a * from.x + 2 * a * u * ctrl.x + u * u * to.x,
    y: a * a * from.y + 2 * a * u * ctrl.y + u * u * to.y,
  };
}

export function drawEntryChute(ctx: Ctx, lanes: readonly Lane[], entryU: number): void {
  const { from, ctrl, to } = entryChute(lanes, entryU);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y - 6);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.strokeStyle = '#C8D4DE';
  ctx.lineWidth = 11;
  ctx.stroke();
}

/**
 * 投入アニメのコイン。t は 0..1。
 * 0.00-0.32 投入口へ落ちる / 0.32-0.5 機械の中 / 0.5-1.0 シュートを滑る
 */
export function drawInsertCoin(ctx: Ctx, lanes: readonly Lane[], entryU: number, t: number): void {
  const u = clamp01(t);
  if (u < 0.32) {
    const k = u / 0.32;
    const y = lerp(COIN_SLOT_CENTER.y - 150, COIN_SLOT_CENTER.y - 4, easeOut(k));
    ctx.save();
    ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    drawCoin(ctx, { x: COIN_SLOT_CENTER.x, y }, COIN_R, 0, k * 5);
    ctx.restore();
    return;
  }
  if (u < 0.5) return;
  const k = (u - 0.5) / 0.5;
  drawCoin(ctx, chutePoint(lanes, entryU, k), COIN_R, 0, k * 6);
}

// ---------------------------------------------------------------- プランジャー

export function drawPlunger(ctx: Ctx, knobY: number, pull: number): void {
  const x = KNOB_REST.x;
  const anchorY = KNOB_REST.y - 40;

  roundRect(ctx, x - 78, anchorY - 20, 156, 26, 12);
  paint(ctx, COLORS.cabinetTrim, COLORS.ink, LINE_W);
  screw(ctx, x - 62, anchorY - 7, 5);
  screw(ctx, x + 62, anchorY - 7, 5);

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
  paint(ctx, 'rgba(255,248,236,0.92)', COLORS.ink, LINE_W);
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

  // ジグザグに降りるレールの絵
  const bars: Array<[number, number, number]> = [
    [-20, -66, 150],
    [-150, -28, 150],
    [-20, 10, 150],
    [-150, 48, 150],
  ];
  bars.forEach(([bx, by, bw], i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    ctx.save();
    ctx.translate(bx + bw / 2, by);
    ctx.rotate(dir * -0.09);
    roundRect(ctx, -bw / 2, -8, bw, 16, 8);
    paint(ctx, COLORS.laneRail, COLORS.ink, LINE_W);
    ctx.restore();
    // 穴
    ellipse(ctx, bx + (dir > 0 ? -34 : bw + 34), by + 4, 15, 9);
    paint(ctx, COLORS.hole, COLORS.holeRing, 4);
  });

  // 転がり降りるコイン
  const k = (t * 0.55) % 1;
  const path: Array<[number, number]> = [
    [116, -80],
    [-24, -70],
    [-150, -40],
    [-24, -14],
    [116, 20],
    [-24, 40],
    [-120, 68],
  ];
  const seg = Math.min(path.length - 2, Math.floor(k * (path.length - 1)));
  const su = k * (path.length - 1) - seg;
  const px = lerp(path[seg]![0], path[seg + 1]![0], su);
  const py = lerp(path[seg]![1], path[seg + 1]![1], su) - Math.sin(su * Math.PI) * 20;
  drawCoin(ctx, { x: px, y: py }, 24, 0, t * 6);

  drawCheerAnimal(ctx, 'usagi', -128, 108, 50, 0.3 + Math.sin(t * 2.4) * 0.2);
  drawCheerAnimal(ctx, 'kuma', 128, 108, 48, 0.3 + Math.sin(t * 2.4 + 1.6) * 0.2);
  ctx.restore();

  text(ctx, 'どうぶつの', center.x, center.y + 158, { size: 44, color: COLORS.ink, outline: 10 });
  text(ctx, 'やまくだり', center.x, center.y + 218, {
    size: 66,
    color: COLORS.accent,
    outline: 12,
  });
}

/** 何段目まで降りたかを、ジグザグに並ぶ段で示す */
export function drawResultSteps(ctx: Ctx, center: Vec2, reachedDepth: number, won: boolean): void {
  const h = 210;
  ctx.save();
  ctx.translate(center.x, center.y);

  for (let i = 0; i < ROW_COUNT; i++) {
    const y = -h / 2 + (i * h) / ROW_COUNT;
    const pw = 120;
    const x = i % 2 === 0 ? 24 : -pw - 24;
    const done = i < reachedDepth;
    roundRect(ctx, x, y, pw, 16, 8);
    paint(ctx, done ? COLORS.laneRail : '#FFFFFF', COLORS.ink, LINE_W);
    if (done) {
      circle(ctx, x + (i % 2 === 0 ? 10 : pw - 10), y + 8, 9);
      paint(ctx, COLORS.coinRim, COLORS.ink, 3);
    }
  }

  // あたりの口
  const py = h / 2 + 8;
  roundRect(ctx, -140, py, 116, 30, 10);
  paint(ctx, won ? COLORS.pocket : '#FFFFFF', COLORS.ink, LINE_W);
  if (won) text(ctx, 'あたり', -82, py + 15, { size: 20, color: COLORS.ink });

  ctx.restore();
}

// ---------------------------------------------------------------- 応援どうぶつ

/**
 * 走路と走路のあいだの余白で応援させる。
 * レーンの上にも穴の上にも重ならない位置なので、コースの見通しを損なわない。
 */
export function drawSideAnimals(ctx: Ctx, lanes: readonly Lane[], t: number): void {
  const kinds: AnimalKind[] = ['risu', 'neko', 'panda', 'inu', 'pengin'];
  lanes.forEach((lane, i) => {
    if (i === 0) return;
    const kind = kinds[(i - 1) % kinds.length]!;
    const x = BOARD_CENTER_X + (i % 2 === 0 ? 1 : -1) * 128;
    const y = lane.low.y - ROW_GAP / 2 + 26;
    drawCheerAnimal(ctx, kind, x, y, 44, 0.2 + Math.sin(t * 2.2 + i * 1.3) * 0.18);
  });
}

export { clamp };
