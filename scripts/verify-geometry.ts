/**
 * 盤面の幾何と物理定数の検算。詳細設計書 §3.6 / §13.5。
 *
 *     npm run verify
 *
 * 座標・GRAVITY・FLICK_ANGLE_DEG・P_MIN/P_MAX・難易度パラメータのいずれかを
 * 変更したら必ず実行し、失敗した項目があれば詳細設計書 §3.6 の表を更新するか、
 * 変更を取り消すこと。
 *
 * docs/verify-geometry.py と同じ検算を、実際の src/config.ts の値に対して行う。
 */

import {
  COIN_R,
  DIFFICULTIES,
  FLICK_ANGLE,
  FLICK_ZONE_S,
  GOAL_LIP_TOP,
  GOAL_LIP_X,
  GRAVITY,
  KNOB_R,
  KNOB_REST,
  LANES,
  LANE_ANGLE,
  LANE_COUNT,
  LANE_LEN,
  LANE_SPAN,
  FIXED_DT,
  LOGICAL_H,
  P_MAX,
  P_MIN,
  ROLL_DAMPING,
  SHAFT_W,
  STROKE_FINGER,
  STROKE_KNOB,
  BOARD_BOTTOM,
  LANE_END_LEFT,
  LANE_END_RIGHT,
  type DifficultyConfig,
} from '../src/config.ts';
import { normalAt } from '../src/game/board.ts';
import {
  createCoin,
  flickCoin,
  placeOnLane,
  placeOnLaneStart,
  stepCoin,
} from '../src/game/coin.ts';

const SIN = Math.sin(FLICK_ANGLE);
const COS = Math.cos(FLICK_ANGLE);

const failures: string[] = [];

function check(label: string, cond: boolean, detail = ''): void {
  console.log(`  ${cond ? 'OK  ' : 'NG  '}${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures.push(label);
}

/** 初速 v で弾いたコインが横に d px 流れた時点での上昇量 */
function riseAtDrift(v: number, d: number): number {
  const t = d / (v * SIN);
  return v * COS * t - 0.5 * GRAVITY * t * t;
}

function minLaunchSpeed(riseNeeded: number, drift: number, margin = 8): number {
  let lo = 200;
  let hi = 4000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (riseAtDrift(mid, drift) >= riseNeeded + margin) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * コインがレバー端に静止しているときの中心座標。
 * レーンが傾いているぶん、法線方向に COIN_R 押し出した位置になる。
 */
function launchCenter(lane: (typeof LANES)[number]) {
  const n = normalAt(lane);
  return { x: lane.lo.x + n.x * COIN_R, y: lane.lo.y + n.y * COIN_R };
}

/** レーン上を dist px 転がったあとの速度(減衰込み) */
function rollSpeed(v0: number, dist: number, dt = 1 / 600): number {
  const a0 = GRAVITY * Math.sin(LANE_ANGLE);
  let v = v0;
  let x = 0;
  while (x < dist) {
    v += (a0 - ROLL_DAMPING * v) * dt;
    x += v * dt;
  }
  return v;
}

// ---------------------------------------------------------------- 1
console.log('=== 1. レーン座標(設計書 §3.2)===');
const EXPECTED: ReadonlyArray<[string, [number, number], [number, number]]> = [
  ['right', [210, 702], [660, 742]],
  ['left', [510, 597], [60, 637]],
  ['right', [210, 492], [660, 532]],
  ['left', [510, 387], [60, 427]],
  ['right', [210, 282], [660, 322]],
];
let coordsOk = true;
LANES.forEach((ln, i) => {
  const e = EXPECTED[i]!;
  const ok =
    ln.leverSide === e[0] &&
    ln.hi.x === e[1][0] &&
    ln.hi.y === e[1][1] &&
    ln.lo.x === e[2][0] &&
    ln.lo.y === e[2][1];
  coordsOk &&= ok;
  console.log(
    `  段${i + 1}: レバー${ln.leverSide.padEnd(5)} ` +
      `高い端=(${ln.hi.x}, ${ln.hi.y})  レバー端=(${ln.lo.x}, ${ln.lo.y})` +
      (ok ? '' : '  <- MISMATCH'),
  );
});
check('§12 の導出式が §3.2 の表と一致', coordsOk);
check('レーン長 == LANE_LEN', LANE_END_RIGHT - (LANE_END_LEFT + SHAFT_W) === LANE_LEN);
console.log(`  傾き = ${((LANE_ANGLE * 180) / Math.PI).toFixed(2)} 度`);

// ---------------------------------------------------------------- 2
console.log('\n=== 2. 5つの跳躍の均一性(設計書 §3.1。ゲームの手触りの根幹)===');
console.log('  (レバー端に静止したコインの中心から、次の先端を越えるまで)');
/** 先端を越えるのに必要なコイン中心の高さ。レーン先端は面なので法線距離で測る */
const TIP_CLEAR_DY = COIN_R / Math.cos(LANE_ANGLE);
const jumps: Array<[number, number]> = [];
LANES.forEach((ln, i) => {
  const c0 = launchCenter(ln);
  const tip =
    i < LANE_COUNT - 1
      ? { x: LANES[i + 1]!.hi.x, clearY: LANES[i + 1]!.hi.y - TIP_CLEAR_DY }
      : // ゴールのリップは垂直な壁なので、そのまま COIN_R でよい
        { x: GOAL_LIP_X, clearY: GOAL_LIP_TOP - COIN_R };
  const label = i < LANE_COUNT - 1 ? `段${i + 1} → 段${i + 2}` : `段${i + 1} → ゴール`;
  const across = Math.abs(c0.x - tip.x);
  const up = c0.y - tip.clearY;
  jumps.push([across, up]);
  console.log(`  ${label}: 横=${across.toFixed(1).padStart(5)}  上=${up.toFixed(1).padStart(5)}`);
});
const uniform = jumps.every(
  (j) => Math.abs(j[0] - jumps[0]![0]) < 0.5 && Math.abs(j[1] - jumps[0]![1]) < 0.5,
);
check(
  '5つの跳躍がすべて同一条件(誤差 0.5px 未満)',
  uniform,
  `(${jumps[0]![0].toFixed(1)}, ${jumps[0]![1].toFixed(1)})`,
);

// ---------------------------------------------------------------- 3
// 5つのうち最も厳しいものを必要初速とする(放物線だけを見た理論値)
const vMinTheory = Math.max(...jumps.map(([across, up]) => minLaunchSpeed(up, across)));
console.log('\n=== 3. 必要初速(理論値。参考)===');
console.log(`  放物線だけで見た v_min = ${vMinTheory.toFixed(0)} px/s`);
console.log('  ※ この理論値はシャフトの天井を考慮していない。実際の成功域は項目4を見ること。');

// ---------------------------------------------------------------- 4
/**
 * ここからは実際の物理(src/game/coin.ts)を回して測る。
 *
 * 理論値だけでは足りない理由: シャフトの上は「2段上のレーンの裏面」で塞がれている。
 * 弾き角が浅いとコインは次の段の先端を越える前にこの天井にぶつかって戻され、
 * 放物線の計算では見えない失敗が起きる。実測が唯一の正解。
 */
console.log('\n=== 4. 各段の成功域(実シミュレーション。設計書 §3.6)===');
console.log('  「前進」= 上の段に着地する、またはゴールする');

interface Band {
  minPower: number;
  frac: number;
  runLo: number;
  runHi: number;
  gaps: number;
}

function measureBand(laneIndex: number, d: DifficultyConfig): Band {
  const holes: never[] = [];
  const flat: DifficultyConfig = { ...d, holeS: [[], [], [], [], []], lipEscapeSpeed: null };
  const ok: number[] = [];
  let total = 0;
  for (let p = P_MIN; p <= P_MAX; p += 5) {
    total++;
    const c = createCoin();
    placeOnLane(c, laneIndex, 1);
    flickCoin(c, p);
    let progressed = false;
    for (let i = 0; i < 900; i++) {
      const r = stepCoin(c, FIXED_DT, flat, holes);
      if (r.reachedGoal) {
        progressed = true;
        break;
      }
      if (r.landedOnLane !== null) {
        progressed = r.landedOnLane > laneIndex;
        break;
      }
    }
    if (progressed) ok.push(p);
  }
  let runLo = 0;
  let runHi = 0;
  let bestLen = 0;
  let lo = -1;
  let prev = -1;
  let gaps = 0;
  for (const p of ok) {
    if (lo < 0) lo = p;
    else if (p - prev > 5) {
      gaps++;
      if (prev - lo > bestLen) {
        bestLen = prev - lo;
        runLo = lo;
        runHi = prev;
      }
      lo = p;
    }
    prev = p;
  }
  if (lo >= 0 && prev - lo >= bestLen) {
    runLo = lo;
    runHi = prev;
  }
  return { minPower: ok[0] ?? 0, frac: ok.length / total, runLo, runHi, gaps };
}

for (const d of Object.values(DIFFICULTIES)) {
  console.log(`  --- ${d.label} ---`);
  for (let i = 0; i < LANE_COUNT; i++) {
    const b = measureBand(i, d);
    const label = i < LANE_COUNT - 1 ? `段${i + 1}→段${i + 2}` : `段${i + 1}→ゴール`;
    const pull = (b.minPower - P_MIN) / (P_MAX - P_MIN);
    console.log(
      `    ${label}: 成功 ${(b.frac * 100).toFixed(0)}%  ` +
        `最小 power=${b.minPower} (pull ${pull.toFixed(2)})  ` +
        `連続区間 ${b.runLo}-${b.runHi}` +
        (b.gaps > 0 ? `  途切れ ${b.gaps} 箇所` : ''),
    );
    check(`${d.label} ${label}: 成功域が 40% 以上`, b.frac >= 0.4, `${(b.frac * 100).toFixed(0)}%`);
    check(
      `${d.label} ${label}: pull 0.35 以下で前進できる`,
      pull <= 0.35 && b.minPower > 0,
      `pull=${pull.toFixed(2)}`,
    );
  }
}

{
  const e = measureBand(LANE_COUNT - 1, DIFFICULTIES.easy);
  const n = measureBand(LANE_COUNT - 1, DIFFICULTIES.normal);
  check('やさしいの方がゴールしやすい', e.frac > n.frac, `${(e.frac * 100).toFixed(0)}% > ${(n.frac * 100).toFixed(0)}%`);
  check('ふつうはゴールを外すことがある', n.frac < 0.9, `${(n.frac * 100).toFixed(0)}%`);
}

// ---------------------------------------------------------------- 4.5
/**
 * 実プレイで必ず起きる場面を、そのまま物理で再現して確かめる。
 * ここは「盤面の数字」ではなく「遊べるかどうか」を守る検算。
 */
console.log('\n=== 5. 実プレイの安全性(設計書 §5.1 / §7.2)===');

function rollSpeedAtHoles(
  setup: (c: ReturnType<typeof createCoin>) => void,
  d: DifficultyConfig,
): number {
  const flat: DifficultyConfig = { ...d, holeS: [[], [], [], [], []], lipEscapeSpeed: null };
  const c = createCoin();
  setup(c);
  let slowest = Infinity;
  const holeS = d.holeS.flat();
  for (let i = 0; i < 900; i++) {
    stepCoin(c, FIXED_DT, flat, []);
    if (c.state !== 'onLane') continue;
    for (const hs of holeS) {
      if (Math.abs(c.s - hs) < 0.02) slowest = Math.min(slowest, Math.abs(c.vs));
    }
  }
  return slowest;
}

function fellALevel(power: number, d: DifficultyConfig): boolean {
  const flat: DifficultyConfig = { ...d, holeS: [[], [], [], [], []] };
  const c = createCoin();
  placeOnLane(c, 1, 1);
  flickCoin(c, power);
  for (let i = 0; i < 900; i++) {
    if (stepCoin(c, FIXED_DT, flat, []).fellToLane !== null) return true;
  }
  return false;
}

for (const d of Object.values(DIFFICULTIES)) {
  const onInsert = rollSpeedAtHoles((c) => placeOnLaneStart(c), d);
  const weakReturn = rollSpeedAtHoles((c) => {
    placeOnLane(c, 0, 1);
    flickCoin(c, 800);
  }, d);
  const afterFlick = rollSpeedAtHoles((c) => {
    placeOnLane(c, 0, 1);
    flickCoin(c, 1100);
  }, d);
  console.log(
    `  ${d.label}: 落下閾値=${d.fallSpeed}  投入直後=${onInsert.toFixed(0)}  ` +
      `弱い戻り=${weakReturn.toFixed(0)}  弾き成功後=${afterFlick.toFixed(0)} px/s`,
  );
  // 一度も弾く前に落ちるのは論外
  // 余裕を持たせる。ぎりぎりだと少しの調整で「弾く前に落ちる」に戻ってしまう
  check(
    `${d.label}: 投入直後に穴へ落ちない(1割以上の余裕)`,
    onInsert > d.fallSpeed * 1.1,
    `${onInsert.toFixed(0)} > ${(d.fallSpeed * 1.1).toFixed(0)}`,
  );
  check(`${d.label}: 弾きに成功したコインは穴を通過する`, afterFlick > d.fallSpeed);
  if (d.id === 'normal') {
    check('ふつう: 弱い弾きで戻ったコインは穴に落ちる', weakReturn < d.fallSpeed);
    check('ふつう: ほどほどの弾きでは転落しない', !fellALevel(1200, d));
    check('ふつう: 引きすぎると転落する', fellALevel(P_MAX, d));
  } else {
    check('やさしい: 弱い弾きで戻っても穴を通過する', weakReturn > d.fallSpeed);
    check('やさしい: 最大パワーでも転落しない', !fellALevel(P_MAX, d));
  }
}

// ---------------------------------------------------------------- 5
console.log('\n=== 6. 転がり速度の目安(参考)===');
const weakReturn = rollSpeed(0, 225);
const fullRoll = rollSpeed(0, LANE_SPAN);
const afterLand = rollSpeed(480, 250);
console.log(
  `  終端速度                       = ${((GRAVITY * Math.sin(LANE_ANGLE)) / ROLL_DAMPING).toFixed(0)} px/s`,
);
console.log(`  弱い弾きで戻ったコイン(225px) = ${weakReturn.toFixed(0)} px/s`);
console.log(`  静止から全長(${LANE_SPAN.toFixed(0)}px)     = ${fullRoll.toFixed(0)} px/s`);
console.log(`  成功した弾きの着地後(250px)   = ${afterLand.toFixed(0)} px/s`);
check(
  '両難易度: 成功した弾きは穴を通過する',
  afterLand > Math.max(DIFFICULTIES.easy.fallSpeed, DIFFICULTIES.normal.fallSpeed),
);

// ---------------------------------------------------------------- 6
console.log('\n=== 7. 弾きゾーンとシャフト(設計書 §6.5)===');
const xZone = LANE_END_RIGHT - (1 - FLICK_ZONE_S.min) * LANE_LEN;
console.log(`  s=${FLICK_ZONE_S.min} -> x=${xZone.toFixed(0)}  (シャフトは x >= ${LANE_END_RIGHT - SHAFT_W})`);
check('弾きゾーンがシャフトの内側に収まっている', xZone >= LANE_END_RIGHT - SHAFT_W);

// ---------------------------------------------------------------- 7
console.log('\n=== 8. レイアウト(設計書 §2.3 / §6.3)===');
check('盤面とノブが重ならない', KNOB_REST.y - KNOB_R >= BOARD_BOTTOM, `隙間 ${KNOB_REST.y - KNOB_R - BOARD_BOTTOM}px`);
check('指のストロークが画面内に収まる', LOGICAL_H - KNOB_REST.y === STROKE_FINGER, `${LOGICAL_H - KNOB_REST.y}px`);
check(
  '引ききってもノブが画面内に残る',
  KNOB_REST.y + STROKE_KNOB + KNOB_R <= LOGICAL_H,
  `下端 ${KNOB_REST.y + STROKE_KNOB + KNOB_R}`,
);

// ---------------------------------------------------------------- 結果
console.log('\n' + '='.repeat(50));
if (failures.length > 0) {
  console.log(`NG: ${failures.length} 件の不整合があります`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('すべての検算に成功しました。設計書 §3.6 の表と一致しています。');
