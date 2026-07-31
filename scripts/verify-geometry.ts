/**
 * レーンの幾何と「遊べるかどうか」の検算。
 *
 *     npm run verify
 *
 * 座標や物理定数を変えたら必ず実行すること(CI でも実行している)。
 *
 * このスクリプトは式だけで判断しない。実際の物理(src/game/coin.ts)を回して測る。
 * 以前、計算上は正しいのに遊べない不具合を何度も作り込んだため。
 * 閉じた式(successPowerBand)と実測を突き合わせるのは §3 で行う。
 */

import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  DIFFICULTIES,
  FIXED_DT,
  GAP_END_U,
  GRAVITY,
  HOLE_CATCH_SPEED,
  HOLE_NEAR_U,
  KNOB_R,
  KNOB_REST,
  LANE_RISE,
  LANE_W,
  LOGICAL_H,
  P_MAX,
  P_MIN,
  PULL_DEADZONE,
  ROW_COUNT,
  STROKE_FINGER,
  STROKE_KNOB,
  type DifficultyConfig,
} from '../src/config.ts';
import {
  buildLanes,
  buildWinPocket,
  landingURange,
  posOnLane,
  successPowerBand,
} from '../src/game/board.ts';
import {
  ENTRY_U,
  canFlick,
  createCoin,
  flickCoin,
  placeAtLever,
  placeAtStart,
  stepCoin,
} from '../src/game/coin.ts';

const failures: string[] = [];

function check(label: string, cond: boolean, detail = ''): void {
  console.log(`  ${cond ? 'OK  ' : 'NG  '}${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures.push(label);
}

type Outcome = 'win' | 'next' | 'weak' | 'strong' | 'back' | 'stuck';

/** 段 laneIndex のレバーから power で弾いた結果 */
function simulate(d: DifficultyConfig, laneIndex: number, power: number): Outcome {
  const lanes = buildLanes(d);
  const pocket = buildWinPocket(d);
  const coin = createCoin();
  placeAtLever(coin, lanes, laneIndex);
  if (!flickCoin(coin, power)) return 'stuck';

  for (let i = 0; i < 3000; i++) {
    const r = stepCoin(coin, FIXED_DT, lanes, pocket);
    if (r.reachedWin) return 'win';
    if (r.lost) return r.lost;
    // 同じ段のレバーに戻ってきた = 何も起きていない(設計上あってはならない)
    if (r.heldOnLane === laneIndex) return 'back';
    if (r.heldOnLane !== null) return 'next';
  }
  return 'stuck';
}

interface Band {
  frac: number;
  minPull: number;
  maxPull: number;
  gaps: number;
  weak: number;
  strong: number;
  back: number;
}

/** 成功する pull の割合と、その連続性・失敗のしかたを測る */
function measure(d: DifficultyConfig, laneIndex: number): Band {
  const okPulls: number[] = [];
  let total = 0;
  let weak = 0;
  let strong = 0;
  let back = 0;
  const step = 0.005;

  for (let pull = PULL_DEADZONE; pull <= 1.0001; pull += step) {
    total++;
    const out = simulate(d, laneIndex, P_MIN + (P_MAX - P_MIN) * pull);
    if (out === 'win' || out === 'next') okPulls.push(pull);
    else if (out === 'weak') weak++;
    else if (out === 'strong') strong++;
    else back++;
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
    weak,
    strong,
    back,
  };
}

// ---------------------------------------------------------------- 1
console.log('=== 1. レーンの形 ===');
for (const d of Object.values(DIFFICULTIES)) {
  const lanes = buildLanes(d);
  const pocket = buildWinPocket(d);
  const lane = lanes[0]!;
  console.log(`  --- ${d.label}(手前の穴 ${d.nearHoleSpan}）---`);
  console.log(
    `    斜面 長さ ${lane.length.toFixed(0)}  高低差 ${LANE_RISE}  ` +
      `減速 = GRAVITY*sinθ = ${lane.decel.toFixed(0)} px/s²`,
  );
  console.log(
    `    手前の穴 ${lane.nearHole.from}..${lane.nearHole.to}  ` +
      `隙間 ${lane.gap.from}..${lane.gap.to}  奥の穴 ${lane.farHole.from}..${lane.farHole.to.toFixed(0)}`,
  );
  console.log(`    あたりの口 x=${pocket.left.toFixed(0)}..${pocket.right.toFixed(0)} y=${pocket.y}`);

  // レーンが盤面に収まる
  let inside = true;
  for (const l of lanes) {
    for (let u = 0; u <= l.length; u += 4) {
      const p = posOnLane(l, u);
      if (
        p.x < BOARD_LEFT + COIN_R ||
        p.x > BOARD_RIGHT - COIN_R ||
        p.y < BOARD_TOP + COIN_R ||
        p.y > BOARD_BOTTOM - COIN_R
      ) {
        inside = false;
      }
    }
  }
  check(`${d.label}: レーンが盤面に収まっている`, inside);
  check(
    `${d.label}: あたりの口が盤面に収まっている`,
    pocket.left >= BOARD_LEFT && pocket.right <= BOARD_RIGHT && pocket.y + 52 <= BOARD_BOTTOM,
  );

  // レーンはななめ上向き(高い端の方が上)
  check(
    `${d.label}: レーンがななめ上向き`,
    lanes.every((l) => l.high.y < l.low.y && l.dir.y < 0),
    `高低差 ${LANE_RISE}px`,
  );

  // レバー(低い端)は画面の左右の端で、交互に並ぶ
  const boardW = BOARD_RIGHT - BOARD_LEFT;
  for (const l of lanes) {
    const toWall = l.side === 'left' ? l.low.x - BOARD_LEFT : BOARD_RIGHT - l.low.x;
    check(
      `${d.label} 段${l.index + 1}: レバーが画面の端にある`,
      toWall <= boardW * 0.2,
      `壁まで ${toWall.toFixed(0)}px`,
    );
  }
  check(
    `${d.label}: レバーが左右交互`,
    lanes.map((l) => l.side).join(',') === 'right,left,right,left,right',
  );

  // 隙間から落ちた先は、手前の穴より低い側でなければならない。
  // でないと着地したコインが滑り降りる途中で自分から穴に落ちる
  const land = landingURange(d);
  check(
    `${d.label}: 落ちた先が手前の穴より低い側`,
    land.to < HOLE_NEAR_U,
    `着地 u ${land.from.toFixed(0)}..${land.to.toFixed(0)} < ${HOLE_NEAR_U}`,
  );
  check(`${d.label}: 投入位置も手前の穴より低い側`, ENTRY_U < HOLE_NEAR_U, `${ENTRY_U} < ${HOLE_NEAR_U}`);

  // 穴と隙間がコインより広い(狭いと落ちる余地がない)
  check(`${d.label}: 手前の穴がコインより広い`, d.nearHoleSpan >= COIN_R * 2, `${d.nearHoleSpan}px`);
  check(
    `${d.label}: 隙間がコインより広い`,
    lane.gap.to - lane.gap.from >= COIN_R * 2,
    `${(lane.gap.to - lane.gap.from).toFixed(0)}px`,
  );
  check(
    `${d.label}: 奥の穴がコインより広い`,
    lane.farHole.to - lane.farHole.from >= COIN_R * 2,
    `${(lane.farHole.to - lane.farHole.from).toFixed(0)}px`,
  );
}

// ---------------------------------------------------------------- 2
console.log('\n=== 2. 5つの操作の均一性 ===');
for (const d of Object.values(DIFFICULTIES)) {
  const lanes = buildLanes(d);
  const same = lanes.every(
    (l) =>
      Math.abs(l.length - lanes[0]!.length) < 1e-6 &&
      Math.abs(l.decel - lanes[0]!.decel) < 1e-6 &&
      l.nearHole.from === lanes[0]!.nearHole.from &&
      l.nearHole.to === lanes[0]!.nearHole.to &&
      l.gap.from === lanes[0]!.gap.from &&
      l.gap.to === lanes[0]!.gap.to,
  );
  check(`${d.label}: 全段のレーンが同じ形`, same);
}

// ---------------------------------------------------------------- 3
console.log('\n=== 3. 各操作の成功域(実シミュレーション)===');
const fracs: Record<string, number> = {};
for (const d of Object.values(DIFFICULTIES)) {
  console.log(`  --- ${d.label} ---`);
  const theory = successPowerBand(d, HOLE_CATCH_SPEED);
  console.log(`    理論の成功域 ${theory.from.toFixed(0)}〜${theory.to.toFixed(0)} px/s`);
  // 閉じた式と実物理が一致していること。ずれていたらどちらかが壊れている
  check(
    `${d.label}: 理論の下限で実際に成功する`,
    simulate(d, 0, theory.from + 2) !== 'weak',
    `${(theory.from + 2).toFixed(0)}`,
  );
  check(
    `${d.label}: 理論の下限のすぐ下は弱すぎになる`,
    simulate(d, 0, theory.from - 4) === 'weak',
  );
  check(`${d.label}: 理論の上限のすぐ上は強すぎになる`, simulate(d, 0, theory.to + 4) === 'strong');

  let worst = 1;
  for (let i = 0; i < ROW_COUNT; i++) {
    const b = measure(d, i);
    worst = Math.min(worst, b.frac);
    const label = i + 1 < ROW_COUNT ? `段${i + 1}→段${i + 2}` : `段${i + 1}→あたりの口`;
    console.log(
      `    ${label}: 成功 ${(b.frac * 100).toFixed(0)}%  ` +
        `pull ${b.minPull.toFixed(2)}〜${b.maxPull.toFixed(2)}` +
        (b.gaps ? `  途切れ ${b.gaps}` : '') +
        `  弱すぎ ${b.weak} / 強すぎ ${b.strong}` +
        (b.back ? `  空振り ${b.back}` : ''),
    );
    check(`${d.label} ${label}: 成功域が連続している`, b.gaps === 0);
    check(`${d.label} ${label}: 弱すぎでも強すぎでも落ちる`, b.weak > 0 && b.strong > 0);
    // 「弾いたのに何も起きずレバーに戻る」は、3歳児には理由が分からない
    check(`${d.label} ${label}: 空振りが無い`, b.back === 0);
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
  const lanes = buildLanes(d);
  const pocket = buildWinPocket(d);
  const coin = createCoin();
  placeAtStart(coin, lanes);
  let lost = false;
  for (let i = 0; i < 900; i++) {
    if (stepCoin(coin, FIXED_DT, lanes, pocket).lost) lost = true;
  }
  check(`${d.label}: 投入後に放置しても落ちない`, !lost);
  check(
    `${d.label}: 放置すると 1 段目のレバーで止まって弾ける`,
    canFlick(coin) && coin.laneIndex === 0 && coin.u === 0,
  );
}

// ---------------------------------------------------------------- 5
console.log('\n=== 5. 途中で止まらないこと ===');
/**
 * 斜面は摩擦なしなので、登りきれなかったコインは必ず滑り降りてくる。
 * 「レーンの途中で永久に止まる」は起こらないが、全パワーで決着することは見ておく。
 */
for (const d of Object.values(DIFFICULTIES)) {
  let stuck = '';
  for (let i = 0; i < ROW_COUNT && !stuck; i++) {
    for (let power = P_MIN; power <= P_MAX && !stuck; power += 4) {
      const out = simulate(d, i, power);
      if (out === 'stuck' || out === 'back') stuck = `段${i + 1} power=${power} → ${out}`;
    }
  }
  check(`${d.label}: どのパワーでも必ず決着する`, stuck === '', stuck);
}
// 弾いたコインが手前の穴に届かず戻ってくるパワーが、操作範囲に入っていないこと
{
  const lane = buildLanes(DIFFICULTIES.easy)[0]!;
  const reachNear = Math.sqrt(2 * lane.decel * lane.nearHole.from);
  const minUsed = P_MIN + (P_MAX - P_MIN) * PULL_DEADZONE;
  check(
    '最弱でも手前の穴までは必ず届く',
    minUsed > reachNear,
    `${minUsed.toFixed(0)} > ${reachNear.toFixed(0)}`,
  );
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
  `  重力=${GRAVITY} 高低差=${LANE_RISE} 隙間の終わり=${GAP_END_U} ` +
    `落ちる速さ=${HOLE_CATCH_SPEED} 弾き力=${P_MIN}..${P_MAX}`,
);

// ---------------------------------------------------------------- 7
console.log('\n=== 7. コインがレーンから外れないこと(全パワー掃引)===');
for (const d of Object.values(DIFFICULTIES)) {
  const lanes = buildLanes(d);
  const pocket = buildWinPocket(d);
  let bad = '';
  for (let i = 0; i < ROW_COUNT && !bad; i++) {
    for (let power = P_MIN; power <= P_MAX && !bad; power += 8) {
      const coin = createCoin();
      placeAtLever(coin, lanes, i);
      flickCoin(coin, power);
      for (let k = 0; k < 900; k++) {
        stepCoin(coin, FIXED_DT, lanes, pocket);
        if (!Number.isFinite(coin.u) || !Number.isFinite(coin.v)) bad = `NaN 段${i + 1}`;
        else if (coin.pos.x < BOARD_LEFT || coin.pos.x > BOARD_RIGHT) bad = `場外 段${i + 1}`;
        else if (coin.state === 'onLane' && (coin.u < -1 || coin.u > lanes[0]!.length + 1))
          bad = `u 範囲外 ${coin.u.toFixed(0)} 段${i + 1}`;
        if (bad || coin.state === 'lost' || coin.state === 'win') break;
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
