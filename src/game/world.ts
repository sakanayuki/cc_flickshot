/**
 * Matter.js の世界。盤面を剛体で組み、コインを 1 個だけ置く。
 *
 * 判定のための特別なルールはここには無い。レールは実体、穴と隙間は
 * **床が無い区間**として表現してあるので、落ちるか渡りきるかは
 * 剛体シミュレーションがそのまま決める。
 *
 * Canvas も DOM も参照しない(Node でそのまま回して検算できる)。
 *
 * ── 単位について ──────────────────────────────────────────────
 * Matter.js 0.20 の `body.velocity` は 1/60 秒あたりの移動量に正規化されている。
 * 一方このゲームは px/s で数値を持つので、境界で必ず 60 倍・1/60 倍する。
 * 重力は `加速度[px/s^2] = gravity.y * gravity.scale * 1e6` になるので、
 * `scale = GRAVITY / 1e6` を入れれば px/s^2 がそのまま効く。
 */

import Matter from 'matter-js';
import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_DENSITY,
  COIN_FRICTION,
  COIN_FRICTION_STATIC,
  COIN_LOCK_SPIN,
  COIN_R,
  COIN_RESTITUTION,
  COIN_SIDES,
  FIN_T,
  FIXED_DT,
  FLOOR_T,
  GRAVITY,
  LANE_THICK,
  PHYS_SUBSTEPS,
  PIT_DEPTH,
  type Vec2,
} from '../config.ts';
import { BACKSTOP_TOP, laneP, type Lane, type WinPocket } from './board.ts';

const { Bodies, Body, Composite, Engine, Sleeping } = Matter;

/** 1 サブステップの長さ (ms)。Matter へはこの値だけを渡す */
export const SUB_MS = (FIXED_DT * 1000) / PHYS_SUBSTEPS;

/** px/s → Matter の速度 (1/60 秒あたりの移動量) */
const TO_MATTER_V = FIXED_DT;
/** Matter の速度 → px/s */
const TO_PX_S = 1 / FIXED_DT;

/** 壁の厚み。すり抜け防止のため十分に厚く取る */
const WALL_T = 120;
/** レール端の丸め。角が立っているとコインが引っかかる */
const RAIL_CHAMFER = 6;


export interface PhysWorld {
  engine: Matter.Engine;
  coin: Matter.Body;
  lanes: Lane[];
  pocket: WinPocket;
}

function staticBox(
  x: number,
  y: number,
  w: number,
  h: number,
  angle = 0,
  chamfer?: number,
  friction = 0,
): Matter.Body {
  const body = Bodies.rectangle(x, y, w, h, {
    isStatic: true,
    angle,
    restitution: 0,
    ...(chamfer !== undefined ? { chamfer: { radius: chamfer } } : {}),
  });
  return setFriction(body, friction);
}

/**
 * 静的ボディの摩擦は**生成後に入れ直す**。
 * Matter の `Body.setStatic(body, true)` は friction を 1 に上書きするので、
 * `Bodies.rectangle` のオプションに書いても消される。
 * これに気づかず、レールにも摩擦が乗って
 * 700 px/s のコインが 15px 進んで止まっていた。
 */
function setFriction(body: Matter.Body, friction: number): Matter.Body {
  body.friction = friction;
  body.frictionStatic = friction;
  return body;
}

/**
 * レーン 1 本ぶんの実体。
 *
 *   ・レール(床)
 *   ・レールの下の背板
 *   ・手前のポケットの底 / 奥のポケットの底(落とし穴のところだけ底が無い)
 *   ・ポケットを分ける薄いフィン 2 枚
 *
 * 低い端も高い端も画面の壁に接しているので、ストッパーは要らない。
 * 傾いた面はレーンそのもの以外に 1 つも無い。上を向いた角が飛行経路の
 * 近くにあると、かすめたコインを上へ跳ね上げてしまうため(`config.ts` 参照)。
 */
function laneBodies(lane: Lane): Matter.Body[] {
  const out: Matter.Body[] = [];

  // レール
  const railLen = lane.rail.to - lane.rail.from;
  const rc = laneP(lane, railLen / 2, -LANE_THICK / 2);
  out.push(staticBox(rc.x, rc.y, railLen, LANE_THICK, lane.angle, RAIL_CHAMFER));

  const weak = lane.bins[0]!;
  const good = lane.bins[1]!;
  const strong = lane.bins[2]!;

  /*
   * レールの下の背板。ポケットの底はレーンと平行なので、落ちたコインは
   * 坂を下って低い端の側へ滑る。これが無いと窪みの手前端から抜け落ちて、
   * 穴を通ったのと同じ深さまで行ってしまう(実測で「弱すぎ」が
   * 「ちょうど」と判定された)。レールの真下なので飛ぶコインには当たらない。
   */
  out.push(fin(lane, weak.from, BACKSTOP_TOP));
  out.push(floor(lane, weak.from, weak.to));

  // 窪みを 3 つに分ける 2 枚のフィン。ここだけが上を向いた面
  out.push(fin(lane, good.from, lane.rim));
  out.push(fin(lane, good.to, lane.rim));

  // 落とし穴 [good.from, good.to] には底を置かない。そのまま 1 段下へ抜ける
  out.push(floor(lane, strong.from, strong.to));

  return out;
}

/** ポケットの底。レーンと平行 */
function floor(lane: Lane, from: number, to: number): Matter.Body {
  const c = laneP(lane, (from + to) / 2, -(PIT_DEPTH + FLOOR_T / 2));
  return staticBox(c.x, c.y, to - from, FLOOR_T, lane.angle);
}

/** 底から立つ薄い仕切り。top = 頂点の深さ */
function fin(lane: Lane, u: number, top: number): Matter.Body {
  const c = laneP(lane, u, -(top + PIT_DEPTH) / 2);
  return staticBox(c.x, c.y, FIN_T, PIT_DEPTH - top, lane.angle);
}

/** あたりの口。落ちてきたコインを受け止めるカップ(壁ぎわの床) */
function pocketBodies(p: WinPocket): Matter.Body[] {
  const t = 16;
  const half = p.w / 2;
  return [
    staticBox(p.center.x, p.center.y + p.h / 2 + t / 2, p.w + t * 2, t),
    staticBox(p.center.x - half - t / 2, p.center.y, t, p.h),
    staticBox(p.center.x + half + t / 2, p.center.y, t, p.h),
  ];
}

export function createWorld(lanes: Lane[], pocket: WinPocket): PhysWorld {
  const engine = Engine.create({
    gravity: { x: 0, y: 1, scale: GRAVITY / 1e6 },
    positionIterations: 8,
    velocityIterations: 6,
    constraintIterations: 2,
    enableSleeping: false,
  });
  engine.timing.lastDelta = SUB_MS;

  const midX = (BOARD_LEFT + BOARD_RIGHT) / 2;
  const midY = (BOARD_TOP + BOARD_BOTTOM) / 2;
  const h = BOARD_BOTTOM - BOARD_TOP;
  const w = BOARD_RIGHT - BOARD_LEFT;

  const statics: Matter.Body[] = [
    staticBox(BOARD_LEFT - WALL_T / 2, midY, WALL_T, h + WALL_T * 2),
    staticBox(BOARD_RIGHT + WALL_T / 2, midY, WALL_T, h + WALL_T * 2),
    staticBox(midX, BOARD_TOP - WALL_T / 2, w + WALL_T * 2, WALL_T),
    staticBox(midX, BOARD_BOTTOM + WALL_T / 2, w + WALL_T * 2, WALL_T),
    ...pocketBodies(pocket),
  ];
  for (const lane of lanes) statics.push(...laneBodies(lane));

  /*
   * Matter に真円は無く、円は多角形で近似される。`Bodies.circle` は
   * 半径から辺の数を決めるので 25(奇数)になり、**左右対称でない**
   * 当たり判定になってしまう。段ごとに左右が反転するこのゲームでは、
   * それがそのまま「奇数段と偶数段で成功域が違う」として出る。
   * 辺の数を偶数で固定して、左右対称を保証する。
   */
  const coin = Bodies.polygon(midX, BOARD_TOP + 100, COIN_SIDES, COIN_R, {
    density: COIN_DENSITY,
    friction: COIN_FRICTION,
    frictionStatic: COIN_FRICTION_STATIC,
    frictionAir: 0,
    restitution: COIN_RESTITUTION,
    slop: 0.02,
  });
  coin.circleRadius = COIN_R;
  if (COIN_LOCK_SPIN) Body.setInertia(coin, Infinity);
  /*
   * Body.setVelocity は body.deltaTime を基準に px/step へ換算する。
   * 既定値は 1/60 秒ぶんなので、そのままだと最初の 1 歩だけ
   * サブステップ幅とのずれで速度が跳ねる。先に入れておく。
   * (型定義に無い内部プロパティなのでキャストして触る)
   */
  (coin as unknown as { deltaTime: number }).deltaTime = SUB_MS;

  Composite.add(engine.world, [...statics, coin]);

  return { engine, coin, lanes, pocket };
}

/**
 * dt 秒ぶん進める。`onSubstep` はサブステップごとに呼ばれ、
 * true を返すと残りのサブステップを打ち切る(判定が確定したとき用)。
 */
export function stepWorld(w: PhysWorld, dt: number, onSubstep?: () => boolean): void {
  const n = PHYS_SUBSTEPS;
  const ms = (dt * 1000) / n;
  for (let i = 0; i < n; i++) {
    Engine.update(w.engine, ms);
    if (onSubstep && onSubstep()) return;
  }
}

export function coinPos(w: PhysWorld): Vec2 {
  return { x: w.coin.position.x, y: w.coin.position.y };
}

/** px/s */
export function coinVel(w: PhysWorld): Vec2 {
  return { x: w.coin.velocity.x * TO_PX_S, y: w.coin.velocity.y * TO_PX_S };
}

/** px/s */
export function coinSpeed(w: PhysWorld): number {
  return w.coin.speed * TO_PX_S;
}



/**
 * 位置と速度 (px/s) を直接置く。
 *
 * 角速度は必ず 0 にする。Matter の円は多角形なので、回すと平らな床の上で
 * 「角ばった車輪」になって上下に細かく跳ねる。振幅は 0.14px しかないが、
 * 900px/s では毎秒 160 回の振動になり、レールの端を離れる瞬間の
 * 上下方向の速度が -5..-120 px/s のあいだでばらついた。落下位置が
 * それだけで数十 px 動くので、同じ力でも結果が変わってしまう。
 * 見た目の回転は進んだ距離から描画側で作る(`spinOf`)。
 */
export function placeCoin(w: PhysWorld, p: Vec2, vel: Vec2 = { x: 0, y: 0 }): void {
  Sleeping.set(w.coin, false);
  Body.setPosition(w.coin, { x: p.x, y: p.y });
  Body.setAngle(w.coin, 0);
  Body.setVelocity(w.coin, { x: vel.x * TO_MATTER_V, y: vel.y * TO_MATTER_V });
  Body.setAngularVelocity(w.coin, 0);
}

/**
 * 構え。**その場で**速度を殺して眠らせる。
 *
 * 理想の座標へスナップしてはいけない。多角形近似のぶん理想値と実際の
 * 接地点は数十分の 1 px ずれていて、スナップするとそのぶん浮く。
 * 弾いた直後にコインが落ちて跳ね、跳ねの位相がレール端に届く
 * タイミングを変えるので、同じ力でも結果が変わってしまう。
 */
export function freezeCoin(w: PhysWorld): void {
  Body.setVelocity(w.coin, { x: 0, y: 0 });
  Body.setAngularVelocity(w.coin, 0);
  Sleeping.set(w.coin, true);
}

export function wakeCoin(w: PhysWorld): void {
  Sleeping.set(w.coin, false);
}

export function isCoinFrozen(w: PhysWorld): boolean {
  return w.coin.isSleeping;
}

export function destroyWorld(w: PhysWorld): void {
  Composite.clear(w.engine.world, false, true);
  Engine.clear(w.engine);
}
