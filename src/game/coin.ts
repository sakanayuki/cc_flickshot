/**
 * コインの状態機械と物理。詳細設計書 §4, §5。
 *
 * Canvas も DOM も参照しない純粋なロジック。Vitest でそのままテストできる。
 */

import {
  BOARD_BOTTOM,
  BOARD_TOP,
  COIN_R,
  FLICK_ANGLE,
  FLICK_ZONE_S,
  GRAVITY,
  INSERT_ENTRY_SPEED,
  LANES,
  LANE_ANGLE,
  LANE_SPAN,
  ROLL_DAMPING,
  WALL_RESTITUTION,
  type DifficultyConfig,
  type Hole,
  type Lane,
  type Vec2,
} from '../config.ts';
import {
  downhillSignX,
  goalFloor,
  goalLip,
  inwardSignX,
  laneCoversX,
  normalAt,
  pointAt,
  sAtPoint,
  signedDistanceToLane,
  tangentAt,
  WALL_LEFT_X,
  WALL_RIGHT_X,
} from './board.ts';

export type CoinState = 'onLane' | 'airborne' | 'falling' | 'goal';

export interface Coin {
  state: CoinState;
  /** onLane のとき有効 */
  laneIndex: number;
  /** onLane のとき有効。0 = 高い端、1 = レバー端 */
  s: number;
  /** onLane: レーン接線方向の速度 (+ = 下り方向) */
  vs: number;
  /** コインの中心。常に有効 */
  pos: Vec2;
  /** airborne のとき有効 */
  vel: Vec2;
  /** falling / goal の演出経過秒 */
  timer: number;
  /** falling のとき、吸い込まれる先 */
  holeCenter: Vec2 | null;
  /** 見た目の回転 */
  spin: number;
}

export interface StepResult {
  /** このステップで着地した段(演出用)。着地していなければ null */
  landedOnLane: number | null;
  hitHole: Hole | null;
  reachedGoal: boolean;
  /** 転落した先の段 */
  fellToLane: number | null;
  /** ゴールを外してレーンに戻った */
  missedGoal: boolean;
}

const EMPTY_RESULT = (): StepResult => ({
  landedOnLane: null,
  hitHole: null,
  reachedGoal: false,
  fellToLane: null,
  missedGoal: false,
});

export function createCoin(): Coin {
  return {
    state: 'onLane',
    laneIndex: 0,
    s: 0,
    vs: 0,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    timer: 0,
    holeCenter: null,
    spin: 0,
  };
}

/** 投入アニメ直後の配置。段1の高い端に静止させる。 */
export function placeOnLaneStart(coin: Coin): void {
  coin.state = 'onLane';
  coin.laneIndex = 0;
  coin.s = 0;
  // シュートを滑り降りてきた勢いを引き継ぐ。詳細設計書 §8.4
  coin.vs = INSERT_ENTRY_SPEED;
  coin.timer = 0;
  coin.holeCenter = null;
  coin.spin = 0;
  syncPosFromLane(coin);
}

/** 指定した段の指定した位置に静止させる。テストと転落処理で使う。 */
export function placeOnLane(coin: Coin, laneIndex: number, s: number): void {
  coin.state = 'onLane';
  coin.laneIndex = laneIndex;
  coin.s = s;
  coin.vs = 0;
  coin.vel = { x: 0, y: 0 };
  coin.timer = 0;
  coin.holeCenter = null;
  syncPosFromLane(coin);
}

function laneOf(coin: Coin): Lane {
  return LANES[coin.laneIndex]!;
}

function syncPosFromLane(coin: Coin): void {
  const lane = laneOf(coin);
  const surf = pointAt(lane, coin.s);
  const n = normalAt(lane);
  coin.pos = { x: surf.x + n.x * COIN_R, y: surf.y + n.y * COIN_R };
}

/** レーン上に着地させる。法線方向の速度は捨て、接線方向のみ残す(バウンドしない)。 */
function landOnLane(coin: Coin, lane: Lane, at: Vec2): void {
  const t = tangentAt(lane);
  coin.state = 'onLane';
  coin.laneIndex = lane.index;
  coin.s = clamp01(sAtPoint(lane, at));
  coin.vs = coin.vel.x * t.x + coin.vel.y * t.y;
  coin.vel = { x: 0, y: 0 };
  syncPosFromLane(coin);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------- 弾く

/** 弾きゾーン内の onLane のコインだけが対象。詳細設計書 §6.5 */
export function canFlick(coin: Coin, laneIndex: number): boolean {
  return (
    coin.state === 'onLane' &&
    coin.laneIndex === laneIndex &&
    coin.s >= FLICK_ZONE_S.min &&
    coin.s <= FLICK_ZONE_S.max
  );
}

/** 弾けたら true。power は px/s。 */
export function flickCoin(coin: Coin, power: number): boolean {
  if (coin.state !== 'onLane') return false;
  if (coin.s < FLICK_ZONE_S.min || coin.s > FLICK_ZONE_S.max) return false;

  const lane = laneOf(coin);
  const inward = inwardSignX(lane);
  syncPosFromLane(coin);
  coin.state = 'airborne';
  coin.vel = {
    x: inward * power * Math.sin(FLICK_ANGLE),
    y: -power * Math.cos(FLICK_ANGLE),
  };
  return true;
}

// ---------------------------------------------------------------- 穴の判定

/**
 * 穴の範囲内にいて、かつ転がる速度が fallSpeed 未満なら落ちる。
 * 速ければ勢いで飛び越える。詳細設計書 §5.1。
 */
export function checkHole(
  coin: Coin,
  holes: readonly Hole[],
  fallSpeed: number,
): Hole | null {
  if (coin.state !== 'onLane') return null;
  for (const h of holes) {
    if (h.laneIndex !== coin.laneIndex) continue;
    const dist = Math.abs(coin.s - h.s) * LANE_SPAN;
    if (dist <= h.radius && Math.abs(coin.vs) < fallSpeed) return h;
  }
  return null;
}

// ---------------------------------------------------------------- 更新

export function stepCoin(
  coin: Coin,
  dt: number,
  d: DifficultyConfig,
  holes: readonly Hole[],
): StepResult {
  switch (coin.state) {
    case 'onLane':
      return stepOnLane(coin, dt, d, holes);
    case 'airborne':
      return stepAirborne(coin, dt, d);
    case 'falling':
    case 'goal':
      coin.timer += dt;
      return EMPTY_RESULT();
  }
}

function stepOnLane(
  coin: Coin,
  dt: number,
  d: DifficultyConfig,
  holes: readonly Hole[],
): StepResult {
  const res = EMPTY_RESULT();
  const lane = laneOf(coin);

  const a = GRAVITY * Math.sin(LANE_ANGLE) - ROLL_DAMPING * coin.vs;
  coin.vs += a * dt;
  coin.s += (coin.vs * dt) / LANE_SPAN;
  coin.spin += (coin.vs * dt) / COIN_R;

  if (coin.s >= 1) {
    // レバー端の壁に到達
    if (d.lipEscapeSpeed !== null && coin.vs > d.lipEscapeSpeed && lane.index > 0) {
      // リップを飛び越えて下の段へ転落(ふつうのみ。詳細設計書 §5.4)
      coin.s = 1;
      syncPosFromLane(coin);
      coin.state = 'airborne';
      coin.vel = { x: -inwardSignX(lane) * 60, y: 0 };
      res.fellToLane = lane.index - 1;
      return res;
    }
    coin.s = 1;
    coin.vs = 0;
  } else if (coin.s < 0) {
    // 高い端にも小さなリップがあり、飛び出さずに止まる。
    // 3歳児向けに「盤面から消える」挙動を作らないための安全側の仕様。
    coin.s = 0;
    coin.vs = 0;
  }

  syncPosFromLane(coin);

  const hole = checkHole(coin, holes, d.fallSpeed);
  if (hole) {
    coin.state = 'falling';
    coin.timer = 0;
    coin.holeCenter = hole.center;
    res.hitHole = hole;
  }
  return res;
}

interface Collision {
  t: number;
  apply: (coin: Coin, at: Vec2, res: StepResult) => void;
}

function stepAirborne(coin: Coin, dt: number, d: DifficultyConfig): StepResult {
  const res = EMPTY_RESULT();

  const p0: Vec2 = { x: coin.pos.x, y: coin.pos.y };
  coin.vel.y += GRAVITY * dt;
  const p1: Vec2 = { x: p0.x + coin.vel.x * dt, y: p0.y + coin.vel.y * dt };
  coin.spin += (coin.vel.x * dt) / COIN_R;

  const hit = firstCollision(coin, p0, p1, d);
  if (!hit) {
    coin.pos = p1;
    return res;
  }

  const at: Vec2 = {
    x: p0.x + (p1.x - p0.x) * hit.t,
    y: p0.y + (p1.y - p0.y) * hit.t,
  };
  coin.pos = at;
  hit.apply(coin, at, res);
  return res;
}

/**
 * 詳細設計書 §4.3 の順で候補を集め、最も早く起きるものを返す。
 * (a) レーン着地 (b) レーン裏面 (c) 側壁 (d) 天井 (e) ゴールのリップ (f) ゴールの床
 */
function firstCollision(
  coin: Coin,
  p0: Vec2,
  p1: Vec2,
  d: DifficultyConfig,
): Collision | null {
  const cands: Collision[] = [];

  for (const lane of LANES) {
    const d0 = signedDistanceToLane(lane, p0);
    const d1 = signedDistanceToLane(lane, p1);

    // (a0) レーンの高い端の先端。シャフト側から入ってくるコインが、
    //      先端を越える高さに達していなければここで跳ね返る。
    //      これがないと、先端より外側で高さ判定を通過したコインが
    //      レーンをすり抜けてしまう。
    const tipDir = downhillSignX(lane);
    const crossedTip =
      tipDir > 0 ? p0.x < lane.hi.x && p1.x >= lane.hi.x : p0.x > lane.hi.x && p1.x <= lane.hi.x;
    if (crossedTip) {
      const t = safeT(lane.hi.x - p0.x, p1.x - p0.x);
      const dTip = d0 + (d1 - d0) * t;
      if (dTip < COIN_R && dTip > -COIN_R) {
        cands.push({
          t,
          apply: (c, _at, res) => {
            c.vel.x = -c.vel.x * WALL_RESTITUTION;
            c.pos.x = lane.hi.x - tipDir * 1;
            if (lane.index === LANES.length - 1) res.missedGoal = true;
          },
        });
      }
    }

    // (a) 上から交差 → 着地
    if (d0 >= COIN_R && d1 < COIN_R) {
      const t = safeT(d0 - COIN_R, d0 - d1);
      const x = p0.x + (p1.x - p0.x) * t;
      if (laneCoversX(lane, x)) {
        cands.push({
          t,
          apply: (c, at, res) => {
            landOnLane(c, lane, at);
            res.landedOnLane = lane.index;
          },
        });
      }
    }

    // (b) 下から突き上げ → 裏面衝突。垂直速度だけ殺す(詳細設計書 §4.3(b))
    if (coin.vel.y < 0 && d0 < -COIN_R && d1 >= -COIN_R) {
      const t = safeT(-COIN_R - d0, d1 - d0);
      const x = p0.x + (p1.x - p0.x) * t;
      if (laneCoversX(lane, x)) {
        cands.push({
          t,
          apply: (c) => {
            c.vel.y = 0;
          },
        });
      }
    }
  }

  // (c) 側壁
  if (p1.x - COIN_R <= WALL_LEFT_X && coin.vel.x < 0) {
    cands.push({
      t: safeT(p0.x - COIN_R - WALL_LEFT_X, p0.x - p1.x),
      apply: (c) => {
        c.vel.x = -c.vel.x * WALL_RESTITUTION;
        c.pos.x = WALL_LEFT_X + COIN_R;
      },
    });
  }
  if (p1.x + COIN_R >= WALL_RIGHT_X && coin.vel.x > 0) {
    cands.push({
      t: safeT(WALL_RIGHT_X - (p0.x + COIN_R), p1.x - p0.x),
      apply: (c) => {
        c.vel.x = -c.vel.x * WALL_RESTITUTION;
        c.pos.x = WALL_RIGHT_X - COIN_R;
      },
    });
  }

  // (d) 天井。裏面衝突と同じ扱い
  if (p1.y - COIN_R <= BOARD_TOP && coin.vel.y < 0) {
    cands.push({
      t: safeT(p0.y - COIN_R - BOARD_TOP, p0.y - p1.y),
      apply: (c) => {
        c.vel.y = 0;
        c.pos.y = BOARD_TOP + COIN_R;
      },
    });
  }

  // (e) ゴールのリップ。越えられなければ跳ね返って段5へ戻る
  const lip = goalLip();
  if (p0.x > lip.x && p1.x <= lip.x) {
    const t = safeT(p0.x - lip.x, p0.x - p1.x);
    const y = p0.y + (p1.y - p0.y) * t;
    if (y > lip.clearY && y < lip.bottom) {
      cands.push({
        t,
        apply: (c, _at, res) => {
          c.vel.x = -c.vel.x * WALL_RESTITUTION;
          c.pos.x = lip.x + 1;
          res.missedGoal = true;
        },
      });
    }
  }

  // (f) ゴールの床
  const floor = goalFloor(d);
  if (coin.vel.y > 0 && p0.y < floor.landY && p1.y >= floor.landY) {
    const t = safeT(floor.landY - p0.y, p1.y - p0.y);
    const x = p0.x + (p1.x - p0.x) * t;
    if (x >= floor.left && x <= floor.right) {
      cands.push({
        t,
        apply: (c, at, res) => {
          c.state = 'goal';
          c.timer = 0;
          c.pos = { x: at.x, y: floor.landY };
          c.vel = { x: 0, y: 0 };
          res.reachedGoal = true;
        },
      });
    }
  }

  // 盤面の底。通常は起きないが、落ちきってしまった場合の保険として
  // 段1の高い端に戻す(失敗にはしない)
  if (p1.y + COIN_R >= BOARD_BOTTOM && coin.vel.y > 0) {
    cands.push({
      t: safeT(BOARD_BOTTOM - (p0.y + COIN_R), p1.y - p0.y),
      apply: (c, _at, res) => {
        placeOnLaneStart(c);
        res.landedOnLane = 0;
      },
    });
  }

  if (cands.length === 0) return null;
  return cands.reduce((a, b) => (b.t < a.t ? b : a));
}

function safeT(num: number, den: number): number {
  if (den === 0) return 0;
  const t = num / den;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
