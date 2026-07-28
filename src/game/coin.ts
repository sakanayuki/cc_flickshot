/**
 * コインの状態機械と物理。
 *
 * ルールは単純で、コインは次の 3 つのことしかしない。
 *   1. 板の上を溝に向かって転がり、溝で止まる
 *   2. 溝から横に弾かれ、放物線を描いて落ちる
 *   3. 1 段下の板に乗る(成功)か、板を外して穴に落ちる(没収)
 *
 * Canvas も DOM も参照しない純粋なロジック。Vitest でそのままテストできる。
 */

import {
  BOARD_LEFT,
  BOARD_RIGHT,
  COIN_R,
  FLICK_RISE,
  FLICK_ZONE_PX,
  GRAVITY,
  PLANK_DROP,
  ROLL_DAMPING,
  ROW_COUNT,
  type Row,
  type Vec2,
  type WinPocket,
} from '../config.ts';
import {
  downhillDirX,
  flickDirX,
  inWinPocket,
  notchPos,
  onPlank,
  plankCoinY,
  type Hole,
} from './board.ts';

export type CoinState = 'onPlank' | 'airborne' | 'falling' | 'win';

export interface Coin {
  state: CoinState;
  /** onPlank: 乗っている段。airborne: 弾き出された元の段 */
  rowIndex: number;
  /** onPlank のときの水平位置 */
  x: number;
  /** onPlank のときの水平速度 */
  vx: number;
  /** コインの中心。常に有効 */
  pos: Vec2;
  /** airborne のときの速度 */
  vel: Vec2;
  /** falling / win の演出経過秒 */
  timer: number;
  /** falling のとき、落ちた穴 */
  hole: Hole | null;
  /** 見た目の回転 */
  spin: number;
}

export interface StepResult {
  /** このステップで着地した段 */
  landedOnRow: number | null;
  /** 穴に落ちた */
  fellInHole: Hole | null;
  /** あたりの口に入った */
  reachedWin: boolean;
}

const EMPTY = (): StepResult => ({
  landedOnRow: null,
  fellInHole: null,
  reachedWin: false,
});

export function createCoin(): Coin {
  return {
    state: 'onPlank',
    rowIndex: 0,
    x: 0,
    vx: 0,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    timer: 0,
    hole: null,
    spin: 0,
  };
}

/** 板の傾き (tanθ)。溝へ向かう加速度の元になる */
function slopeOf(row: Row): number {
  return PLANK_DROP / (row.right - row.left);
}

function syncPos(coin: Coin, rows: readonly Row[]): void {
  const row = rows[coin.rowIndex]!;
  coin.pos = { x: coin.x, y: plankCoinY(row, coin.x) };
}

/** 指定した段の指定した x に静止させる */
export function placeOnRow(coin: Coin, rows: readonly Row[], rowIndex: number, x: number): void {
  coin.state = 'onPlank';
  coin.rowIndex = rowIndex;
  coin.x = x;
  coin.vx = 0;
  coin.vel = { x: 0, y: 0 };
  coin.timer = 0;
  coin.hole = null;
  syncPos(coin, rows);
}

/**
 * 投入されたコインの初期位置。
 * 1 段目の板の、溝から少し離れたところに置く。転がって溝に収まる。
 */
export function placeAtStart(coin: Coin, rows: readonly Row[]): void {
  const row = rows[0]!;
  const notch = notchPos(row);
  placeOnRow(coin, rows, 0, notch.x - downhillDirX(row) * 70);
  coin.spin = 0;
}

// ---------------------------------------------------------------- 弾く

/** 溝の近くにいる onPlank のコインだけが弾ける */
export function canFlick(coin: Coin, rows: readonly Row[]): boolean {
  if (coin.state !== 'onPlank') return false;
  const notch = notchPos(rows[coin.rowIndex]!);
  return Math.abs(coin.x - notch.x) <= FLICK_ZONE_PX;
}

/** 弾けたら true。power は px/s */
export function flickCoin(coin: Coin, rows: readonly Row[], power: number): boolean {
  if (!canFlick(coin, rows)) return false;
  const row = rows[coin.rowIndex]!;
  const dir = flickDirX(row);
  syncPos(coin, rows);
  coin.state = 'airborne';
  coin.vel = {
    x: dir * power * Math.cos(FLICK_RISE),
    y: -power * Math.sin(FLICK_RISE),
  };
  return true;
}

// ---------------------------------------------------------------- 更新

export function stepCoin(
  coin: Coin,
  dt: number,
  rows: readonly Row[],
  pocket: WinPocket,
  holes: readonly Hole[],
): StepResult {
  switch (coin.state) {
    case 'onPlank':
      return stepOnPlank(coin, dt, rows);
    case 'airborne':
      return stepAirborne(coin, dt, rows, pocket, holes);
    case 'falling':
    case 'win':
      coin.timer += dt;
      return EMPTY();
  }
}

function stepOnPlank(coin: Coin, dt: number, rows: readonly Row[]): StepResult {
  const row = rows[coin.rowIndex]!;
  const notch = notchPos(row);
  const dir = downhillDirX(row);

  const a = GRAVITY * slopeOf(row) * dir - ROLL_DAMPING * coin.vx;
  coin.vx += a * dt;
  coin.x += coin.vx * dt;
  coin.spin += (coin.vx * dt) / COIN_R;

  // 溝で止まる
  if ((dir > 0 && coin.x >= notch.x) || (dir < 0 && coin.x <= notch.x)) {
    coin.x = notch.x;
    coin.vx = 0;
  }
  // 板の高い側にも縁があり、転がり出ることはない
  const highX = row.notchSide === 'right' ? row.left : row.right;
  if ((dir > 0 && coin.x < highX) || (dir < 0 && coin.x > highX)) {
    coin.x = highX;
    coin.vx = 0;
  }

  syncPos(coin, rows);
  return EMPTY();
}

function stepAirborne(
  coin: Coin,
  dt: number,
  rows: readonly Row[],
  pocket: WinPocket,
  holes: readonly Hole[],
): StepResult {
  const res = EMPTY();
  const targetIndex = coin.rowIndex + 1;
  const isPocket = targetIndex >= ROW_COUNT;

  const prevY = coin.pos.y;
  coin.vel.y += GRAVITY * dt;
  coin.pos.x += coin.vel.x * dt;
  coin.pos.y += coin.vel.y * dt;
  coin.spin += (coin.vel.x * dt) / COIN_R;

  // 壁。跳ね返らずに滑り落ちる。
  // 跳ね返らせると「強すぎたのに壁のおかげで板に戻る」ことが起きて、
  // 強すぎ = 失敗というルールが崩れる
  if (coin.pos.x - COIN_R < BOARD_LEFT) {
    coin.pos.x = BOARD_LEFT + COIN_R;
    coin.vel.x = 0;
  } else if (coin.pos.x + COIN_R > BOARD_RIGHT) {
    coin.pos.x = BOARD_RIGHT - COIN_R;
    coin.vel.x = 0;
  }

  // 着地面。1 段下の板(最後はあたりの口)だけを見る。
  // 発射した段の高さは飛び越える途中なので判定しない
  const planeY = isPocket ? pocket.y - COIN_R : plankCoinY(rows[targetIndex]!, coin.pos.x);
  if (coin.vel.y <= 0 || prevY > planeY || coin.pos.y < planeY) return res;

  const landedX = coin.pos.x;
  const success = isPocket
    ? inWinPocket(pocket, landedX)
    : onPlank(rows[targetIndex]!, landedX);

  if (success) {
    if (isPocket) {
      coin.state = 'win';
      coin.timer = 0;
      coin.pos.y = planeY;
      coin.vel = { x: 0, y: 0 };
      res.reachedWin = true;
    } else {
      coin.state = 'onPlank';
      coin.rowIndex = targetIndex;
      coin.x = landedX;
      // 着地したら横向きの勢いだけを引き継ぐ。跳ねさせない
      coin.vx = coin.vel.x;
      coin.vel = { x: 0, y: 0 };
      syncPos(coin, rows);
      res.landedOnRow = targetIndex;
    }
    return res;
  }

  // 板を外した = 穴に落ちる
  coin.state = 'falling';
  coin.timer = 0;
  coin.hole = findHole(holes, targetIndex, landedX);
  res.fellInHole = coin.hole;
  return res;
}

function findHole(holes: readonly Hole[], rowIndex: number, x: number): Hole | null {
  for (const h of holes) {
    if (h.rowIndex === rowIndex && x >= h.left - 1 && x <= h.right + 1) return h;
  }
  return holes.find((h) => h.rowIndex === rowIndex) ?? null;
}
