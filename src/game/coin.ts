/**
 * コインの状態機械と物理。
 *
 * ルールは単純で、コインは次の 3 つのことしかしない。
 *   1. 板の上を溝に向かって転がり、先端でレバーにもたれて止まる
 *   2. レバーに外向きへ弾かれ、放物線を描いて落ちる
 *   3. 1 段下の板に乗る(成功)か、板を外して丸穴に落ちる(没収)
 *
 * 空中の運動は 1 サブステップの移動量が MAX_SUBSTEP_MOVE を超えないよう
 * 分割して積分し、**すべての板を実体(上面+厚み+端面)として衝突させる**。
 * どんな速度でもコインが板を貫通しないことは `npm run verify` が
 * 全パワー掃引で機械的に確認する。
 *
 * Canvas も DOM も参照しない純粋なロジック。Vitest でそのままテストできる。
 */

import {
  BOARD_LEFT,
  BOARD_RIGHT,
  CAPTURE_BELOW,
  COIN_R,
  FLICK_RISE,
  FLICK_ZONE_PX,
  GRAVITY,
  MAX_SUBSTEP_MOVE,
  PLANK_LIP,
  PLANK_THICK,
  ROLL_DAMPING,
  ROW_COUNT,
  type Row,
  type Vec2,
  type WinPocket,
} from '../config.ts';
import {
  downhillDirX,
  flickDirX,
  groovePos,
  highEndX,
  inWinPocket,
  onPlank,
  plankCoinY,
  plankSurfaceY,
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
  /** falling に入った瞬間の位置(落下演出の始点) */
  fallFrom: Vec2;
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
  /** 板の端にぶつかって止まった位置(火花演出用)。無ければ null */
  bonk: Vec2 | null;
}

const EMPTY = (): StepResult => ({
  landedOnRow: null,
  fellInHole: null,
  reachedWin: false,
  bonk: null,
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
    fallFrom: { x: 0, y: 0 },
    spin: 0,
  };
}

/** 板の傾き (tanθ)。溝へ向かう加速度の元になる */
function slopeOf(row: Row): number {
  return (row.grooveY - row.highY) / (row.right - row.left);
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
 * 1 段目の板の高い端(投入シュートの出口)に置く。傾斜で溝まで転がる。
 */
export function placeAtStart(coin: Coin, rows: readonly Row[]): void {
  const row = rows[0]!;
  placeOnRow(coin, rows, 0, highEndX(row) + downhillDirX(row) * (COIN_R - 8));
  coin.spin = 0;
}

// ---------------------------------------------------------------- 弾く

/** 溝の近くにいる onPlank のコインだけが弾ける */
export function canFlick(coin: Coin, rows: readonly Row[]): boolean {
  if (coin.state !== 'onPlank') return false;
  const groove = groovePos(rows[coin.rowIndex]!);
  return Math.abs(coin.x - groove.x) <= FLICK_ZONE_PX;
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
  const groove = groovePos(row);
  const dir = downhillDirX(row);

  const a = GRAVITY * slopeOf(row) * dir - ROLL_DAMPING * coin.vx;
  coin.vx += a * dt;
  coin.x += coin.vx * dt;
  coin.spin += (coin.vx * dt) / COIN_R;

  // 溝の先端で止まる(レバーにもたれる)
  if ((dir > 0 && coin.x >= groove.x) || (dir < 0 && coin.x <= groove.x)) {
    coin.x = groove.x;
    coin.vx = 0;
  }
  // 高い端の返し(ストッパー)。勢いよく戻ってもここで止まり、転がり出ない
  const stop = highEndX(row) + dir * (COIN_R - 8);
  if ((dir > 0 && coin.x < stop) || (dir < 0 && coin.x > stop)) {
    coin.x = stop;
    coin.vx = 0;
  }

  syncPos(coin, rows);
  return EMPTY();
}

/**
 * 板の端面(+高い端の返し)との衝突。
 * コインの円と、板の端の縦の線分との最近接距離で判定し、
 * めり込みぶんだけ水平に押し出して水平速度を殺す(跳ね返さない)。
 */
function collidePlankEnd(coin: Coin, row: Row, endX: number, outward: number): boolean {
  const p = coin.pos;
  // 端面の縦の範囲。高い端は返しのぶん上まで伸びる
  const isHighEnd = endX === highEndX(row);
  const surface = plankSurfaceY(row, endX);
  const top = surface - (isHighEnd ? PLANK_LIP : 0);
  const bottom = surface + PLANK_THICK;

  // コインの下端が板面より上にあるなら、まだ触れていない。
  // ここを緩めて「上面判定に任せる」ことはできない。上面判定は板の範囲内
  // (onPlank)でしか働かないので、範囲外から角に食い込むコインが
  // どちらの判定にも拾われず、そのまま板にめり込む。
  if (p.y + COIN_R < top) return false;

  const nearY = Math.max(top, Math.min(bottom, p.y));
  const dx = p.x - endX;
  const dy = p.y - nearY;
  const d2 = dx * dx + dy * dy;
  if (d2 >= COIN_R * COIN_R) return false;
  // 外側から当たった場合だけ押し出す(板の上のコインが誤検出されないように)
  if (dx * outward < 0) return false;

  const push = Math.sqrt(Math.max(COIN_R * COIN_R - dy * dy, COIN_R * COIN_R * 0.25));
  coin.pos.x = endX + outward * push;
  if (coin.vel.x * outward < 0) coin.vel.x = 0;
  return true;
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
  const captureY = (isPocket ? pocket.y : rows[targetIndex]!.grooveY) + CAPTURE_BELOW - COIN_R;

  // 1 サブステップの移動量が MAX_SUBSTEP_MOVE を超えないよう分割する
  const speed = Math.hypot(coin.vel.x, coin.vel.y + GRAVITY * dt);
  const steps = Math.min(12, Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP_MOVE)));
  const h = dt / steps;

  for (let s = 0; s < steps; s++) {
    const prev = { x: coin.pos.x, y: coin.pos.y };
    coin.vel.y += GRAVITY * h;
    coin.pos.x += coin.vel.x * h;
    coin.pos.y += coin.vel.y * h;
    coin.spin += (coin.vel.x * h) / COIN_R;

    // 壁。跳ね返らずに滑り落ちる。
    // 跳ね返らせると「強すぎたのに壁のおかげで板に戻る」ことが起きて、
    // 強すぎ = 失敗というルールが崩れる
    if (coin.pos.x - COIN_R < BOARD_LEFT) {
      coin.pos.x = BOARD_LEFT + COIN_R;
      if (coin.vel.x < 0) coin.vel.x = 0;
    } else if (coin.pos.x + COIN_R > BOARD_RIGHT) {
      coin.pos.x = BOARD_RIGHT - COIN_R;
      if (coin.vel.x > 0) coin.vel.x = 0;
    }

    // すべての板と衝突する。上面に乗るか、端面で止まる
    for (const row of rows) {
      // 上面への着地。下向きに面を横切った瞬間だけ乗せる(跳ねさせない)
      if (
        coin.vel.y >= 0 &&
        onPlank(row, coin.pos.x) &&
        prev.y <= plankCoinY(row, prev.x) + 1 &&
        coin.pos.y >= plankCoinY(row, coin.pos.x)
      ) {
        coin.state = 'onPlank';
        coin.rowIndex = row.index;
        coin.x = coin.pos.x;
        // 着地したら横向きの勢いだけを引き継ぐ
        coin.vx = coin.vel.x;
        coin.vel = { x: 0, y: 0 };
        syncPos(coin, rows);
        res.landedOnRow = row.index;
        return res;
      }
      // 端面(溝側の先端・高い端の返し)。ぶつかると水平の勢いを失って落ちる
      for (const [endX, outward] of [
        [row.left, -1],
        [row.right, 1],
      ] as const) {
        if (collidePlankEnd(coin, row, endX, outward)) {
          res.bonk = { x: endX, y: plankSurfaceY(row, endX) };
        }
      }
    }

    // あたりの口。口の高さを下向きに横切った瞬間に判定する
    if (isPocket && coin.vel.y > 0 && coin.pos.y >= pocket.y - COIN_R) {
      if (inWinPocket(pocket, coin.pos.x)) {
        coin.state = 'win';
        coin.timer = 0;
        coin.pos.y = pocket.y - COIN_R;
        coin.vel = { x: 0, y: 0 };
        res.reachedWin = true;
        return res;
      }
    }

    // 落下確定。1 段下の板面レベルを下回ったら、その x の下にある穴へ
    if (coin.pos.y > captureY) {
      coin.state = 'falling';
      coin.timer = 0;
      coin.hole = findHole(holes, targetIndex, coin.pos.x);
      coin.fallFrom = { x: coin.pos.x, y: coin.pos.y };
      res.fellInHole = coin.hole;
      return res;
    }
  }
  return res;
}

function findHole(holes: readonly Hole[], rowIndex: number, x: number): Hole | null {
  let best: Hole | null = null;
  let bestDist = Infinity;
  for (const h of holes) {
    if (h.rowIndex !== rowIndex) continue;
    if (x >= h.left - 1 && x <= h.right + 1) return h;
    const d = Math.min(Math.abs(x - h.left), Math.abs(x - h.right));
    if (d < bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
}
