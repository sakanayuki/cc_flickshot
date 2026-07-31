/**
 * レーンの幾何と「遊べるかどうか」の検算。
 *
 *     npm run verify
 *
 * 座標や物理定数を変えたら必ず実行すること(CI でも実行している)。
 *
 * このスクリプトは式を解かない。実際の物理(src/game/coin.ts)を回して測る。
 * 以前、計算上は正しいのに遊べない不具合を何度も作り込んだため。
 *
 * とくに §3 は、5 回の操作すべてが**完全に同じ条件**であることを実測で確かめる。
 * レーンの形をいじると、ここが真っ先に崩れる。
 */

import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  DIFFICULTIES,
  ENTRY_SPEED,
  FIXED_DT,
  HOLE_CATCH_SPEED,
  KNOB_R,
  KNOB_REST,
  LANE_ASSIST,
  LANE_CREEP,
  LANE_DRAG,
  LANE_W,
  LOGICAL_H,
  P_MAX,
  P_MIN,
  PULL_DEADZONE,
  ROW_COUNT,
  STOP_HOLD_SPEED,
  STROKE_FINGER,
  STROKE_KNOB,
  type DifficultyConfig,
} from '../src/config.ts';
import { buildLane, posAt, runUpLength, turnOuterMargin, type Lane } from '../src/game/board.ts';
import { canFlick, createCoin, flickCoin, placeAtStart, placeAtStop, stepCoin } from '../src/game/coin.ts';

const failures: string[] = [];

function check(label: string, cond: boolean, detail = ''): void {
  console.log(`  ${cond ? 'OK  ' : 'NG  '}${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures.push(label);
}

type Outcome = 'win' | 'held' | 'weak' | 'strong' | 'stuck';

/** 止まり木 stopIndex から power で弾いた結果 */
function simulate(d: DifficultyConfig, stopIndex: number, power: number): Outcome {
  const lane = buildLane(d);
  const coin = createCoin();
  placeAtStop(coin, lane, stopIndex);
  if (!flickCoin(coin, power)) return 'stuck';

  for (let i = 0; i < 2400; i++) {
    const r = stepCoin(coin, FIXED_DT, lane);
    if (r.reachedWin) return 'win';
    if (r.heldAtStop !== null) return 'held';
    if (r.fellInHole) return r.fellKind === 'weak' ? 'weak' : 'strong';
  }
  return 'stuck';
}

interface Band {
  frac: number;
  minPull: number;
  maxPull: number;
  gaps: number;
  weakFails: number;
  strongFails: number;
}

/** 成功する pull の割合と、その連続性・失敗のしかたを測る */
function measure(d: DifficultyConfig, stopIndex: number): Band {
  const okPulls: number[] = [];
  let total = 0;
  let weakFails = 0;
  let strongFails = 0;
  const step = 0.005;

  for (let pull = PULL_DEADZONE; pull <= 1.0001; pull += step) {
    total++;
    const out = simulate(d, stopIndex, P_MIN + (P_MAX - P_MIN) * pull);
    if (out === 'win' || out === 'held') okPulls.push(pull);
    else if (out === 'weak') weakFails++;
    else if (out === 'strong') strongFails++;
  }

  let gaps = 0;
  for (let i = 1; i < okPulls.length; i++) {
    if (okPulls[i]! - okPulls[i - 1]! > step * 1.5) gaps++;
  }
  return {
    frac: okPulls.length / total,
    minPull: okPulls[0] ?? 0,
    maxPull: okPulls[okPulls.length - 1] ?? 0,
    gaps,
    weakFails,
    strongFails,
  };
}

/** レーン上の全点が盤面に収まっているか */
function laneInsideBoard(lane: Lane): string {
  for (let s = 0; s <= lane.length; s += 4) {
    const p = posAt(lane, s);
    if (
      p.x < BOARD_LEFT + COIN_R ||
      p.x > BOARD_RIGHT - COIN_R ||
      p.y < BOARD_TOP + COIN_R ||
      p.y > BOARD_BOTTOM - COIN_R
    ) {
      return `s=${s.toFixed(0)} (${p.x.toFixed(0)},${p.y.toFixed(0)})`;
    }
  }
  return '';
}

// ---------------------------------------------------------------- 1
console.log('=== 1. レーンの形 ===');
for (const d of Object.values(DIFFICULTIES)) {
  const lane = buildLane(d);
  console.log(`  --- ${d.label}(穴の長さ ${d.holeSpan}）---`);
  console.log(`    レーン全長 ${lane.length.toFixed(0)}px  走路 ${lane.runs.length} 本`);
  console.log(`    止まり木 s = ${lane.stops.map((s) => s.s.toFixed(0)).join(', ')}`);
  console.log(`    穴       s = ${lane.holes.map((h) => `${h.s0.toFixed(0)}..${h.s1.toFixed(0)}`).join('  ')}`);
  console.log(`    あたりの口 s = ${lane.goalS.toFixed(0)}`);

  check(`${d.label}: レーンが盤面からはみ出さない`, laneInsideBoard(lane) === '', laneInsideBoard(lane));
  check(`${d.label}: 止まり木が ${ROW_COUNT} 個ある`, lane.stops.length === ROW_COUNT);
  // 止まり木は走路の端 = 画面の左右の端にある(実機のレバーの位置)
  const boardW = BOARD_RIGHT - BOARD_LEFT;
  for (const stop of lane.stops) {
    const toWall = stop.side === 'left' ? stop.pos.x - BOARD_LEFT : BOARD_RIGHT - stop.pos.x;
    check(
      `${d.label} 止まり木${stop.index + 1}: 画面の端にある`,
      toWall <= boardW * 0.2,
      `壁まで ${toWall.toFixed(0)}px`,
    );
  }
  // 左右交互に並んでいる(写真と同じジグザグ)
  const sides = lane.stops.map((s) => s.side).join(',');
  check(`${d.label}: 止まり木が左右交互`, sides === 'left,right,left,right,left', sides);
  check(`${d.label}: U ターンが壁に食い込まない`, turnOuterMargin() >= 0, `余裕 ${turnOuterMargin().toFixed(0)}px`);
  check(`${d.label}: 穴がコインより長い`, d.holeSpan > COIN_R * 2, `${d.holeSpan}px`);
}

// ---------------------------------------------------------------- 2
console.log('\n=== 2. 5つの操作の均一性 ===');
for (const d of Object.values(DIFFICULTIES)) {
  const lane = buildLane(d);
  // 止まり木 k から見た「U ターン+穴までの距離」「穴の長さ」「穴から次の止まり木までの助走」
  const shape: Array<[number, number, number]> = [];
  for (let k = 0; k < ROW_COUNT; k++) {
    const from = lane.stops[k]!.s;
    const hole = lane.holes[k]!;
    const to = k + 1 < ROW_COUNT ? lane.stops[k + 1]!.s : lane.goalS;
    shape.push([hole.s0 - from, hole.s1 - hole.s0, to - hole.s1]);
  }
  const uniform = shape.every((x) => x.every((v, i) => Math.abs(v - shape[0]![i]!) < 0.5));
  console.log(
    `  ${d.label}: 助走まで ${shape[0]![0].toFixed(0)}  穴 ${shape[0]![1].toFixed(0)}  ` +
      `穴のあと ${shape[0]![2].toFixed(0)}`,
  );
  check(`${d.label}: 全操作が同一条件`, uniform);
  check(
    `${d.label}: 穴のあとに助走がある`,
    runUpLength(lane, 1) > COIN_R * 2,
    `${runUpLength(lane, 1).toFixed(0)}px`,
  );
}

// ---------------------------------------------------------------- 3
console.log('\n=== 3. 各操作の成功域(実シミュレーション)===');
const fracs: Record<string, number> = {};
for (const d of Object.values(DIFFICULTIES)) {
  console.log(`  --- ${d.label} ---`);
  let worst = 1;
  for (let k = 0; k < ROW_COUNT; k++) {
    const b = measure(d, k);
    worst = Math.min(worst, b.frac);
    const label = k + 1 < ROW_COUNT ? `${k + 1}回目→止まり木${k + 2}` : `${k + 1}回目→あたりの口`;
    console.log(
      `    ${label}: 成功 ${(b.frac * 100).toFixed(0)}%  ` +
        `pull ${b.minPull.toFixed(2)}〜${b.maxPull.toFixed(2)}` +
        (b.gaps ? `  途切れ ${b.gaps}` : '') +
        `  弱すぎ失敗 ${b.weakFails} / 強すぎ失敗 ${b.strongFails}`,
    );
    check(`${d.label} ${label}: 成功域が連続している`, b.gaps === 0);
    check(`${d.label} ${label}: 弱すぎでも強すぎでも落ちる`, b.weakFails > 0 && b.strongFails > 0);
  }
  fracs[d.id] = worst;
  const target = d.id === 'easy' ? [0.6, 1.0] : [0.3, 0.5];
  check(
    `${d.label}: 全操作の成功域が ${(target[0]! * 100).toFixed(0)}〜${(target[1]! * 100).toFixed(0)}%`,
    worst >= target[0]! && worst <= target[1]!,
    `最小 ${(worst * 100).toFixed(0)}%`,
  );
}
check(
  'やさしいの方がふつうより易しい',
  fracs['easy']! > fracs['normal']!,
  `${(fracs['easy']! * 100).toFixed(0)}% > ${(fracs['normal']! * 100).toFixed(0)}%`,
);

// ---------------------------------------------------------------- 4
console.log('\n=== 4. 投入直後の安全性 ===');
for (const d of Object.values(DIFFICULTIES)) {
  const lane = buildLane(d);
  const coin = createCoin();
  placeAtStart(coin, lane);
  let fell = false;
  for (let i = 0; i < 900; i++) {
    if (stepCoin(coin, FIXED_DT, lane).fellInHole) fell = true;
  }
  check(`${d.label}: 投入後に放置しても落ちない`, !fell);
  check(
    `${d.label}: 放置すると 1 つ目の止まり木で止まって弾ける`,
    canFlick(coin) && coin.stopIndex === 0,
  );
}

// ---------------------------------------------------------------- 5
console.log('\n=== 5. 途中で詰まないこと ===');
/**
 * レーンの途中で永久に止まると、弾くこともできず結果も出ない = 詰み。
 * LANE_ASSIST がこれを防いでいるので、全パワーで「必ず決着する」ことを見る。
 */
for (const d of Object.values(DIFFICULTIES)) {
  let stuck = '';
  for (let k = 0; k < ROW_COUNT && !stuck; k++) {
    for (let power = P_MIN; power <= P_MAX && !stuck; power += 5) {
      if (simulate(d, k, power) === 'stuck') stuck = `止まり木${k + 1} power=${power}`;
    }
  }
  check(`${d.label}: どのパワーでも必ず決着する`, stuck === '', stuck);
  check(`${d.label}: 止まりかけの速さが穴に必ず捕まる`, LANE_CREEP < HOLE_CATCH_SPEED,
    `${LANE_CREEP.toFixed(0)} < ${HOLE_CATCH_SPEED}`);
}

// ---------------------------------------------------------------- 6
console.log('\n=== 6. レイアウト ===');
const bandH = LOGICAL_H - BOARD_BOTTOM;
console.log(
  `  盤面 ${BOARD_TOP}..${BOARD_BOTTOM} (${(((BOARD_BOTTOM - BOARD_TOP) / LOGICAL_H) * 100).toFixed(0)}%)  ` +
    `プランジャー帯 ${bandH}px (${((bandH / LOGICAL_H) * 100).toFixed(0)}%)`,
);
check('プランジャー帯が画面の 25% 以下', bandH / LOGICAL_H <= 0.25);
check('盤面とノブが重ならない', KNOB_REST.y - KNOB_R >= BOARD_BOTTOM);
check('指のストロークが画面内に収まる', LOGICAL_H - KNOB_REST.y >= STROKE_FINGER);
check('引ききってもノブが画面内に残る', KNOB_REST.y + STROKE_KNOB + KNOB_R <= LOGICAL_H);
check('レーンがコインより広い', LANE_W > COIN_R * 2, `${LANE_W} > ${COIN_R * 2}`);
console.log(
  `  減速=${LANE_DRAG} 傾き=${LANE_ASSIST} 止まり木=${STOP_HOLD_SPEED} 穴=${HOLE_CATCH_SPEED} ` +
    `投入=${ENTRY_SPEED} 弾き力=${P_MIN}..${P_MAX}`,
);

// ---------------------------------------------------------------- 7
console.log('\n=== 7. コインがレーンから外れないこと(全パワー掃引)===');
/**
 * コインはレーンに沿った 1 次元でしか動かないので、原理的に外れようがない。
 * それでも s が負や NaN になっていないか、必ず前へ進んでいるかは見ておく。
 */
for (const d of Object.values(DIFFICULTIES)) {
  const lane = buildLane(d);
  let bad = '';
  for (let k = 0; k < ROW_COUNT && !bad; k++) {
    for (let power = P_MIN; power <= P_MAX && !bad; power += 10) {
      const coin = createCoin();
      placeAtStop(coin, lane, k);
      flickCoin(coin, power);
      let prev = coin.s;
      for (let i = 0; i < 600; i++) {
        stepCoin(coin, FIXED_DT, lane);
        if (coin.state !== 'onLane') break;
        if (!Number.isFinite(coin.s) || !Number.isFinite(coin.v)) bad = `NaN 止まり木${k + 1}`;
        else if (coin.s < prev - 0.001) bad = `後戻り 止まり木${k + 1} power=${power}`;
        else if (coin.s < 0 || coin.s > lane.length) bad = `範囲外 s=${coin.s.toFixed(0)}`;
        if (bad) break;
        prev = coin.s;
      }
    }
  }
  check(`${d.label}: どのパワーでもコインがレーンから外れない`, bad === '', bad);
}

// ---------------------------------------------------------------- 結果
console.log('\n' + '='.repeat(52));
if (failures.length > 0) {
  console.log(`NG: ${failures.length} 件の不整合があります`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('すべての検算に成功しました。');
