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
  PLANK_LIP,
  PLANK_THICK,
  ROW_COUNT,
  type AnimalKind,
  type Rect,
  type Row,
  type Vec2,
  type WinPocket,
} from '../config.ts';
import {
  downhillDirX,
  flickDirX,
  groovePos,
  highEndX,
  plankCoinY,
  plankSurfaceY,
  type Hole,
} from '../game/board.ts';
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
 * 盤面の背景(化粧板)。クリーム色の板に、絵本調の飾りと
 * 「どっちへ弾くか」を示す矢印(3歳児向けの唯一のコース案内)を印刷する。
 */
export function drawBoardFace(ctx: Ctx, rows: readonly Row[], pocket: WinPocket): void {
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
  circle(ctx, BOARD_LEFT + 92, BOARD_TOP + 88, 46);
  paint(ctx, COLORS.sun, null, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    line(
      ctx,
      { x: BOARD_LEFT + 92 + Math.cos(a) * 58, y: BOARD_TOP + 88 + Math.sin(a) * 58 },
      { x: BOARD_LEFT + 92 + Math.cos(a) * 72, y: BOARD_TOP + 88 + Math.sin(a) * 72 },
      COLORS.sun,
      6,
    );
  }
  ctx.globalAlpha = 0.35;
  for (const [cx, cy, s] of [
    [BOARD_LEFT + 320, BOARD_TOP + 64, 0.9],
    [BOARD_LEFT + 180, BOARD_TOP + 350, 0.6],
    [BOARD_RIGHT - 120, BOARD_TOP + 470, 0.7],
  ] as const) {
    circle(ctx, cx, cy, 30 * s);
    paint(ctx, '#FFFFFF', null, 0);
    circle(ctx, cx + 28 * s, cy + 6 * s, 22 * s);
    paint(ctx, '#FFFFFF', null, 0);
    circle(ctx, cx - 26 * s, cy + 8 * s, 19 * s);
    paint(ctx, '#FFFFFF', null, 0);
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

  // 印刷された草木。棒の高い端の外側(コインが通らない側)にだけ置いて、
  // 実機のような賑やかさを出しつつ、落下地点の見通しは損なわない
  rows.forEach((row, i) => {
    const toRight = row.grooveSide === 'left';
    const bx = toRight ? row.right + 36 : row.left - 36;
    const by = row.grooveY - 46;
    ctx.globalAlpha = 0.32;
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
    // 小さな花
    if (i % 2 === 0) {
      ctx.globalAlpha = 0.4;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        circle(ctx, bx + 16 + Math.cos(a) * 6, by - 2 + Math.sin(a) * 6, 4.5);
        paint(ctx, '#FF9BB5', null, 0);
      }
      circle(ctx, bx + 16, by - 2, 3.5);
      paint(ctx, COLORS.sun, null, 0);
    }
    ctx.globalAlpha = 1;
  });

  // コース案内の矢印。溝から 1 段下の板へ、弾く向きに 3 つ並べる
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const gPos = groovePos(row);
    const dir = flickDirX(row);
    for (let k = 0; k < 3; k++) {
      const t = (k + 1) / 4;
      const x = gPos.x + dir * (24 + t * 74);
      const y = row.grooveY + 26 + t * 62;
      const s = 11;
      ctx.globalAlpha = 0.4 - k * 0.08;
      polygon(ctx, [
        { x: x - dir * s * 0.7, y: y - s },
        { x: x + dir * s * 0.6, y: y },
        { x: x - dir * s * 0.7, y: y + s },
      ]);
      paint(ctx, COLORS.accent, null, 0);
    }
    ctx.globalAlpha = 1;
  }
  void pocket;
  ctx.restore();
}

// ---------------------------------------------------------------- 丸穴

/**
 * 丸い落とし穴。実機と同じ、オレンジのリムが付いたこげ茶の穴。
 * 楕円(少し上から見た遠近)で描く。
 */
export function drawRoundHole(ctx: Ctx, hole: Hole): void {
  const { cx, cy, rx, ry } = hole;

  // 影(穴の下に落ちる淡い影)
  ellipse(ctx, cx, cy + 6, rx + 12, ry + 8);
  paint(ctx, 'rgba(0,0,0,0.10)', null, 0);

  // オレンジのリム
  ellipse(ctx, cx, cy, rx + 10, ry + 7);
  paint(ctx, COLORS.holeRing, COLORS.ink, LINE_W);
  // リムの立体感(下半分を暗く)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 7, ry + 4.5, 0, Math.PI * 0.08, Math.PI * 0.92);
  ctx.strokeStyle = COLORS.holeRingDark;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();

  // 穴の中(奥へ行くほど暗い)
  const g = ctx.createRadialGradient(cx, cy + ry * 0.35, ry * 0.15, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, COLORS.holePit);
  g.addColorStop(1, COLORS.hole);
  ellipse(ctx, cx, cy, rx, ry);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  ctx.stroke();

  // 奥の壁(上側の内壁が少し見える)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy - 1.5, rx * 0.9, ry * 0.8, 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = 'rgba(90,60,30,0.55)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

/**
 * 穴の手前側のリム。落ちるコインの上に重ねて描き、
 * コインが「穴の中へ入っていく」ように見せる。
 */
export function drawRoundHoleFront(ctx: Ctx, hole: Hole): void {
  const { cx, cy, rx, ry } = hole;
  ctx.save();
  // 手前半分のリング(外楕円の下半分 − 内楕円の下半分)
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 10, ry + 7, 0, 0, Math.PI);
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = COLORS.holeRing;
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  ctx.stroke();
  // 手前の内壁
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, rx * 0.97, ry * 0.9, 0, 0, Math.PI);
  ctx.strokeStyle = COLORS.hole;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- レール(板)

/** 1 段ぶんのレール。溝(先端)へ向かって下る木の板 */
export function drawPlank(ctx: Ctx, row: Row): void {
  const yL = plankSurfaceY(row, row.left);
  const yR = plankSurfaceY(row, row.right);
  const gPos = groovePos(row);
  const hiX = highEndX(row);
  const hiY = plankSurfaceY(row, hiX);

  // 落ちる影
  ctx.globalAlpha = 0.12;
  polygon(ctx, [
    { x: row.left + 6, y: yL + PLANK_THICK + 4 },
    { x: row.right + 6, y: yR + PLANK_THICK + 4 },
    { x: row.right + 6, y: yR + PLANK_THICK + 12 },
    { x: row.left + 6, y: yL + PLANK_THICK + 12 },
  ]);
  paint(ctx, '#000000', null, 0);
  ctx.globalAlpha = 1;

  // 板の胴体(厚み)
  polygon(ctx, [
    { x: row.left, y: yL },
    { x: row.right, y: yR },
    { x: row.right, y: yR + PLANK_THICK },
    { x: row.left, y: yL + PLANK_THICK },
  ]);
  paint(ctx, COLORS.plankSide, COLORS.ink, LINE_W);

  // 上面(明るい帯)
  polygon(ctx, [
    { x: row.left, y: yL },
    { x: row.right, y: yR },
    { x: row.right, y: yR + 8 },
    { x: row.left, y: yL + 8 },
  ]);
  paint(ctx, COLORS.plankTop, null, 0);

  // 木目
  ctx.globalAlpha = 0.22;
  const midY = (x: number) => plankSurfaceY(row, x) + PLANK_THICK * 0.62;
  ctx.beginPath();
  ctx.moveTo(row.left + 12, midY(row.left + 12));
  ctx.lineTo(row.right - 12, midY(row.right - 12));
  ctx.strokeStyle = COLORS.plankEdge;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 溝(先端のくぼみ)。コインはここに座ってレバーにもたれる
  ellipse(ctx, gPos.x - flickDirX(row) * 6, row.grooveY + 2.5, 17, 5);
  paint(ctx, 'rgba(0,0,0,0.28)', null, 0);

  // 先端の丸い角
  circle(ctx, gPos.x, row.grooveY + PLANK_THICK / 2, PLANK_THICK / 2);
  paint(ctx, COLORS.plankSide, COLORS.ink, LINE_W);

  // 高い端の返し(ストッパー)
  const dirIn = downhillDirX(row);
  roundRect(ctx, hiX - 9, hiY - PLANK_LIP - 4, 18, PLANK_LIP + PLANK_THICK + 4, 6);
  paint(ctx, COLORS.plankEdge, COLORS.ink, LINE_W);
  void dirIn;

  // ネジ
  screw(ctx, hiX + downhillDirX(row) * 30, plankSurfaceY(row, hiX + downhillDirX(row) * 30) + PLANK_THICK * 0.55, 5);
  screw(
    ctx,
    gPos.x + downhillDirX(row) * -34 + downhillDirX(row) * 0,
    plankSurfaceY(row, gPos.x - downhillDirX(row) * 34) + PLANK_THICK * 0.55,
    5,
  );
}

// ---------------------------------------------------------------- レバー(ハンマー)

/**
 * レバー。板の先端の下にぶら下がるハンマーで、発射すると
 * 外向きに振り上がって溝のコインを下からはたき出す。
 */
export function drawLever(ctx: Ctx, row: Row, lever: LeverState): void {
  const gPos = groovePos(row);
  const out = flickDirX(row);
  const pivot: Vec2 = { x: gPos.x - out * 2, y: row.grooveY + PLANK_THICK + 20 };
  const len = 44;

  // 姿勢: swing<0 はタメ(内側へ巻き上げ)、swing>0 は打撃(外向きに振り上げ)
  const deg = -10 + (lever.swing < 0 ? lever.swing * 34 : lever.swing * 58);
  const rad = (deg * Math.PI) / 180;
  const head: Vec2 = {
    x: pivot.x + out * Math.sin(rad) * len,
    y: pivot.y - Math.cos(rad) * len,
  };

  // 打撃の残像(扇)
  if (lever.swing > 0.12 && lever.flash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.28 * lever.flash;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    const a0 = -Math.PI / 2 + out * ((-44 * Math.PI) / 180);
    const a1 = -Math.PI / 2 + out * rad;
    ctx.arc(pivot.x, pivot.y, len + 8, a0, a1, out < 0);
    ctx.closePath();
    ctx.fillStyle = COLORS.accent;
    ctx.fill();
    ctx.restore();
  }

  // 台座
  roundRect(ctx, pivot.x - 16, pivot.y - 6, 32, 22, 7);
  paint(ctx, '#8E8A82', COLORS.ink, 3.5);

  // 腕
  line(ctx, pivot, head, COLORS.ink, 13);
  line(ctx, pivot, head, COLORS.lever, 8);
  // ハンマーの頭
  circle(ctx, head.x, head.y, 13);
  paint(ctx, COLORS.lever, COLORS.ink, 3.5);
  circle(ctx, head.x - 3 * out, head.y - 3, 4.5);
  paint(ctx, 'rgba(255,255,255,0.55)', null, 0);
  // 軸
  circle(ctx, pivot.x, pivot.y, 7);
  paint(ctx, COLORS.leverDark, COLORS.ink, 3);
}

/**
 * 筐体の左右の縁に並ぶレバーのノブ。
 *
 * 実機では、各段のレバーの軸が筐体の側面を貫いて丸いノブになっている。
 * 板は溝の反対側の壁へ向かって伸びているので、ノブはその壁側に付く。
 * 結果として段ごとに左・右・左…と交互に並ぶ(実機の写真と同じ)。
 */
export function drawSideKnobs(ctx: Ctx, rows: readonly Row[], levers: readonly LeverState[]): void {
  rows.forEach((row) => {
    const lever = levers[row.index];
    if (!lever) return;
    // 板が伸びていく側の壁にノブが付く
    const toRight = row.grooveSide === 'left';
    const wallX = toRight ? BOARD_RIGHT + 22 : BOARD_LEFT - 22;
    const y = row.grooveY + PLANK_THICK + 20;
    const dirIn = toRight ? -1 : 1; // 盤面の内側へ向かう向き

    // 引くとノブが外へ出て、はたくと戻る
    const out = lever.swing < 0 ? -lever.swing * 9 : (1 - lever.swing) * 2;
    const kx = wallX - dirIn * out;

    // 軸(盤面の内側へ伸びる)
    line(ctx, { x: kx, y }, { x: kx + dirIn * 30, y }, '#8E8A82', 8);
    // 台座
    roundRect(ctx, kx - 11, y - 15, 22, 30, 7);
    paint(ctx, COLORS.cabinetTrimDark, COLORS.ink, 3);
    // ノブ本体
    circle(ctx, kx, y, 16);
    paint(ctx, '#E3DDCE', COLORS.ink, LINE_W);
    circle(ctx, kx, y, 10);
    paint(ctx, '#A9B2BC', COLORS.ink, 3);
    circle(ctx, kx - 5, y - 6, 4.5);
    paint(ctx, 'rgba(255,255,255,0.8)', null, 0);
  });
}

/** ノブと弾き部をつなぐロッド。板より先(奥)に描く */
export function drawLeverRods(ctx: Ctx, rows: readonly Row[]): void {
  rows.forEach((row) => {
    const toRight = row.grooveSide === 'left';
    const wallX = toRight ? BOARD_RIGHT : BOARD_LEFT;
    const gPos = groovePos(row);
    const y = row.grooveY + PLANK_THICK + 20;
    ctx.globalAlpha = 0.55;
    line(ctx, { x: wallX, y }, { x: gPos.x, y }, '#8E8A82', 6);
    ctx.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------- あたりの口

export function drawWinPocket(ctx: Ctx, pocket: WinPocket, wave: number): void {
  const w = pocket.right - pocket.left;
  const cx = (pocket.left + pocket.right) / 2;
  const top = pocket.y;

  // 受け口の金のカップ
  polygon(ctx, [
    { x: pocket.left, y: top },
    { x: pocket.right, y: top },
    { x: pocket.right - 14, y: top + 52 },
    { x: pocket.left + 14, y: top + 52 },
  ]);
  paint(ctx, COLORS.pocket, COLORS.ink, LINE_W);
  polygon(ctx, [
    { x: pocket.left + 8, y: top + 8 },
    { x: pocket.right - 8, y: top + 8 },
    { x: pocket.right - 18, y: top + 44 },
    { x: pocket.left + 18, y: top + 44 },
  ]);
  paint(ctx, COLORS.pocketDark, null, 0);
  // 口の中
  ellipse(ctx, cx, top + 6, w / 2 - 10, 9);
  paint(ctx, COLORS.hole, COLORS.ink, 3);

  // 両端の柱
  for (const x of [pocket.left, pocket.right]) {
    roundRect(ctx, x - 9, top - 30, 18, 40, 8);
    paint(ctx, COLORS.flagRed, COLORS.ink, LINE_W);
    circle(ctx, x, top - 32, 8);
    paint(ctx, COLORS.pocket, COLORS.ink, 3);
  }

  // きらきら
  const tw = (Math.sin(wave * 3) + 1) / 2;
  ctx.globalAlpha = 0.5 + tw * 0.5;
  for (const [sx, sy, s] of [
    [cx - w * 0.34, top + 18, 5],
    [cx + w * 0.3, top + 26, 4],
  ] as const) {
    line(ctx, { x: sx - s, y: sy }, { x: sx + s, y: sy }, '#FFFFFF', 3);
    line(ctx, { x: sx, y: sy - s }, { x: sx, y: sy + s }, '#FFFFFF', 3);
  }
  ctx.globalAlpha = 1;

  // 旗
  const poleX = cx;
  const poleTop = top - 96;
  line(ctx, { x: poleX, y: top - 2 }, { x: poleX, y: poleTop }, COLORS.ink, 6);
  const wv = Math.sin(wave * 4) * 6;
  polygon(ctx, [
    { x: poleX, y: poleTop },
    { x: poleX + 64, y: poleTop + 16 + wv },
    { x: poleX, y: poleTop + 34 },
  ]);
  paint(ctx, COLORS.flagRed, COLORS.ink, LINE_W);
  circle(ctx, poleX, poleTop, 6);
  paint(ctx, COLORS.pocket, COLORS.ink, 3);

  text(ctx, 'あたり', cx, top + 27, {
    size: Math.min(30, w * 0.24),
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

/**
 * 空中のコインの影。どこに落ちるかの手がかりになる。
 * height は着地面までの距離。
 */
export function drawCoinShadow(ctx: Ctx, x: number, surfaceY: number, height: number): void {
  const k = clamp01(1 - height / 620);
  ctx.save();
  ctx.globalAlpha = 0.1 + k * 0.16;
  ellipse(ctx, x, surfaceY - 3, 12 + k * 14, 4 + k * 3.5);
  paint(ctx, '#000000', null, 0);
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

/** 投入口から 1 段目の板の高い端へ降りるシュートの経路 */
export function entryChute(rows: readonly Row[]): { from: Vec2; ctrl: Vec2; to: Vec2 } {
  const row = rows[0]!;
  const exitX = highEndX(row) + downhillDirX(row) * (COIN_R - 8);
  const to: Vec2 = { x: exitX, y: plankCoinY(row, exitX) };
  return {
    from: { x: COIN_SLOT_CENTER.x, y: COIN_SLOT_CENTER.y + 40 },
    ctrl: { x: COIN_SLOT_CENTER.x + 6, y: to.y - 92 },
    to,
  };
}

function chutePoint(rows: readonly Row[], u: number): Vec2 {
  const { from, ctrl, to } = entryChute(rows);
  const a = 1 - u;
  return {
    x: a * a * from.x + 2 * a * u * ctrl.x + u * u * to.x,
    y: a * a * from.y + 2 * a * u * ctrl.y + u * u * to.y,
  };
}

export function drawEntryChute(ctx: Ctx, rows: readonly Row[]): void {
  const { from, ctrl, to } = entryChute(rows);
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
export function drawInsertCoin(ctx: Ctx, rows: readonly Row[], t: number): void {
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
  drawCoin(ctx, chutePoint(rows, k), COIN_R, 0, k * 6);
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
    paint(ctx, COLORS.plankTop, COLORS.ink, LINE_W);
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
    paint(ctx, done ? COLORS.plankTop : '#FFFFFF', COLORS.ink, LINE_W);
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

/** 各段の板の上、高い端の近くに立たせる。コインの通り道(溝側)を避ける */
export function drawSideAnimals(ctx: Ctx, rows: readonly Row[], t: number): void {
  const kinds: AnimalKind[] = ['risu', 'neko', 'panda', 'inu', 'pengin'];
  rows.forEach((row, i) => {
    const kind = kinds[i % kinds.length]!;
    const x = highEndX(row) + downhillDirX(row) * 44;
    const size = 44;
    const y = plankSurfaceY(row, x) - size * 0.52;
    drawCheerAnimal(ctx, kind, x, y, size, 0.2 + Math.sin(t * 2.2 + i * 1.3) * 0.18);
  });
}

export { clamp };
