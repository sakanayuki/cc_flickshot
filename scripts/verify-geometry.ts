/**
 * 盤面の幾何と「遊べるかどうか」の検算。
 *
 *     npm run verify
 *
 * 座標や物理定数を変えたら必ず実行すること(CI でも実行している)。
 *
 * このスクリプトは放物線を解かない。実際の物理(src/game/coin.ts)を回して測る。
 * 以前、計算上は正しいのに遊べない不具合を何度も作り込んだため。
 *
 * §7 の貫通チェックは「棒(板)をコインがすり抜けて見える」という
 * 発注者からの不具合報告(改訂履歴(4))の再発防止。全パワーを掃引し、
 * 飛行中の全サブフレームでコインの円が板の実体に食い込んでいないことを見る。
 */

import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  DIFFICULTIES,
  FIXED_DT,
  FLICK_ZONE_PX,
  GRAVITY,
  GROOVE_GAP,
  KNOB_R,
  KNOB_REST,
  LOGICAL_H,
  P_MAX,
  P_MIN,
  PLANK_THICK,
  PULL_DEADZONE,
  ROW_COUNT,
  ROW_GAP,
  STROKE_FINGER,
  STROKE_KNOB,
  type DifficultyConfig,
  type Row,
} from '../src/config.ts';
import {
  buildHoles,
  buildRows,
  buildWinPocket,
  flickDirX,
  groovePos,
  onPlank,
  plankSurfaceY,
} from '../src/game/board.ts';
import { canFlick, createCoin, flickCoin, placeAtStart, placeOnRow, stepCoin } from '../src/game/coin.ts';

const failures: string[] = [];

function check(label: string, cond: boolean, detail = ''): void {
  console.log(`  ${cond ? 'OK  ' : 'NG  '}${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures.push(label);
}

type Outcome = 'win' | 'landed' | 'nearHole' | 'farHole' | 'stuck';

/** 段 rowIndex の溝から power で弾いた結果 */
function simulate(d: DifficultyConfig, rowIndex: number, power: number): Outcome {
  const rows = buildRows(d);
  const pocket = buildWinPocket(d);
  const holes = buildHoles(d);
  const coin = createCoin();
  placeOnRow(coin, rows, rowIndex, groovePos(rows[rowIndex]!).x);
  if (!flickCoin(coin, rows, power)) return 'stuck';

  for (let i = 0; i < 900; i++) {
    const r = stepCoin(coin, FIXED_DT, rows, pocket, holes);
    if (r.reachedWin) return 'win';
    if (r.landedOnRow !== null) return 'landed';
    if (r.fellInHole) return r.fellInHole.kind === 'near' ? 'nearHole' : 'farHole';
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
function measure(d: DifficultyConfig, rowIndex: number): Band {
  const okPulls: number[] = [];
  let total = 0;
  let weakFails = 0;
  let strongFails = 0;
  const step = 0.005;

  for (let pull = PULL_DEADZONE; pull <= 1.0001; pull += step) {
    total++;
    const power = P_MIN + (P_MAX - P_MIN) * pull;
    const out = simulate(d, rowIndex, power);
    if (out === 'win' || out === 'landed') okPulls.push(pull);
    else if (out === 'nearHole') weakFails++;
    else if (out === 'farHole') strongFails++;
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

// ---------------------------------------------------------------- 1
console.log('=== 1. 段の座標 ===');
for (const d of Object.values(DIFFICULTIES)) {
  const rows = buildRows(d);
  const pocket = buildWinPocket(d);
  console.log(`  --- ${d.label}(板幅 ${d.plankWidth}）---`);
  for (const r of rows) {
    console.log(
      `    段${r.index + 1}: 板 x=${r.left.toFixed(0)}..${r.right.toFixed(0)}  ` +
        `溝=${r.grooveSide === 'left' ? '左端' : '右端'}  y=${r.grooveY}`,
    );
  }
  console.log(`    あたりの口: x=${pocket.left.toFixed(0)}..${pocket.right.toFixed(0)}  y=${pocket.y}`);

  const inside = rows.every((r) => r.left >= BOARD_LEFT && r.right <= BOARD_RIGHT);
  check(`${d.label}: 板が盤面に収まっている`, inside);
  check(
    `${d.label}: あたりの口が盤面に収まっている`,
    pocket.left >= BOARD_LEFT && pocket.right <= BOARD_RIGHT && pocket.y < BOARD_BOTTOM,
  );
  // 奥の穴が存在する = 板の高い端と壁の間に、丸穴を描けるだけの隙間がある
  for (const r of rows) {
    const gapToWall =
      r.grooveSide === 'left' ? BOARD_RIGHT - r.right : r.left - BOARD_LEFT;
    check(
      `${d.label} 段${r.index + 1}: 高い端と壁の間に奥の穴がある`,
      gapToWall >= COIN_R * 2,
      `${gapToWall.toFixed(0)}px`,
    );
  }
}

// ---------------------------------------------------------------- 2
console.log('\n=== 2. 6つの遷移の均一性 ===');
for (const d of Object.values(DIFFICULTIES)) {
  const rows = buildRows(d);
  const pocket = buildWinPocket(d);
  const jumps: Array<[number, number]> = [];
  for (let i = 0; i < ROW_COUNT; i++) {
    const from = groovePos(rows[i]!);
    const dir = flickDirX(rows[i]!);
    const target =
      i + 1 < ROW_COUNT
        ? { near: dir < 0 ? rows[i + 1]!.right : rows[i + 1]!.left, y: rows[i + 1]!.grooveY }
        : { near: dir < 0 ? pocket.right : pocket.left, y: pocket.y };
    jumps.push([Math.abs(from.x - target.near), target.y - rows[i]!.grooveY]);
  }
  const uniform = jumps.every(
    (j) => Math.abs(j[0] - jumps[0]![0]) < 0.5 && Math.abs(j[1] - jumps[0]![1]) < 0.5,
  );
  console.log(
    `  ${d.label}: 手前の穴を飛び越す横距離=${jumps[0]![0].toFixed(0)}  落差=${jumps[0]![1].toFixed(0)}`,
  );
  check(`${d.label}: 全遷移が同一条件`, uniform);
  check(`${d.label}: 手前の穴が存在する`, jumps[0]![0] > COIN_R, `${jumps[0]![0].toFixed(0)}px`);
}

// ---------------------------------------------------------------- 3
console.log('\n=== 3. 各遷移の成功域(実シミュレーション)===');
const fracs: Record<string, number> = {};
for (const d of Object.values(DIFFICULTIES)) {
  console.log(`  --- ${d.label} ---`);
  let worst = 1;
  for (let i = 0; i < ROW_COUNT; i++) {
    const b = measure(d, i);
    worst = Math.min(worst, b.frac);
    const label = i + 1 < ROW_COUNT ? `段${i + 1}→段${i + 2}` : `段${i + 1}→あたりの口`;
    console.log(
      `    ${label}: 成功 ${(b.frac * 100).toFixed(0)}%  ` +
        `pull ${b.minPull.toFixed(2)}〜${b.maxPull.toFixed(2)}` +
        (b.gaps ? `  途切れ ${b.gaps}` : '') +
        `  弱すぎ失敗 ${b.weakFails} / 強すぎ失敗 ${b.strongFails}`,
    );
    check(`${d.label} ${label}: 成功域が連続している`, b.gaps === 0);
    // 片側しか失敗しないなら板が壁に接していて設計が崩れている
    check(`${d.label} ${label}: 弱すぎでも強すぎでも落ちる`, b.weakFails > 0 && b.strongFails > 0);
  }
  fracs[d.id] = worst;
  const target = d.id === 'easy' ? [0.6, 1.0] : [0.3, 0.5];
  check(
    `${d.label}: 全遷移の成功域が ${(target[0]! * 100).toFixed(0)}〜${(target[1]! * 100).toFixed(0)}%`,
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
  const rows = buildRows(d);
  const pocket = buildWinPocket(d);
  const holes = buildHoles(d);
  const coin = createCoin();
  // 投入位置から放置しても落ちず、溝で止まって弾ける状態になること
  placeAtStart(coin, rows);
  let fell = false;
  for (let i = 0; i < 600; i++) {
    if (stepCoin(coin, FIXED_DT, rows, pocket, holes).fellInHole) fell = true;
  }
  check(`${d.label}: 投入後に放置しても落ちない`, !fell);
  check(`${d.label}: 放置すると溝で止まって弾ける`, canFlick(coin, rows) && coin.vx === 0);
}

// ---------------------------------------------------------------- 5
console.log('\n=== 5. 盤面の外に出ないこと ===');
for (const d of Object.values(DIFFICULTIES)) {
  const rows = buildRows(d);
  const pocket = buildWinPocket(d);
  const holes = buildHoles(d);
  let escaped = '';
  for (let row = 0; row < ROW_COUNT && !escaped; row++) {
    for (let power = P_MIN; power <= P_MAX && !escaped; power += 25) {
      const coin = createCoin();
      placeOnRow(coin, rows, row, groovePos(rows[row]!).x);
      flickCoin(coin, rows, power);
      for (let i = 0; i < 300; i++) {
        stepCoin(coin, FIXED_DT, rows, pocket, holes);
        if (coin.state === 'falling' || coin.state === 'win') break;
        const p = coin.pos;
        if (
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < BOARD_LEFT + COIN_R - 1 ||
          p.x > BOARD_RIGHT - COIN_R + 1 ||
          p.y < BOARD_TOP - 1
        ) {
          escaped = `段${row + 1} power=${power} pos=(${p.x.toFixed(0)},${p.y.toFixed(0)})`;
          break;
        }
      }
    }
  }
  check(`${d.label}: どのパワーでもコインが盤面外に出ない`, escaped === '', escaped);
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
check('弾きゾーンが手前の穴より狭い', FLICK_ZONE_PX < GROOVE_GAP);
console.log(`  重力=${GRAVITY} 段間=${ROW_GAP} 弾き力=${P_MIN}..${P_MAX}`);

// ---------------------------------------------------------------- 7
console.log('\n=== 7. 板を貫通しないこと(全パワー掃引)===');

/** コインの円が板の実体(上面から厚みぶんの台形)に食い込んでいるか */
function penetrationDepth(rows: readonly Row[], x: number, y: number): number {
  let worst = 0;
  for (const row of rows) {
    if (!onPlank(row, x)) continue;
    const top = plankSurfaceY(row, x);
    const bottom = top + PLANK_THICK;
    // コイン中心が板の内部帯(上面より下、底面+半径より上)にどれだけ入ったか
    if (y > top - COIN_R + 1 && y < bottom + COIN_R - 1) {
      const depth = Math.min(y - (top - COIN_R + 1), bottom + COIN_R - 1 - y);
      worst = Math.max(worst, depth);
    }
  }
  return worst;
}

for (const d of Object.values(DIFFICULTIES)) {
  const rows = buildRows(d);
  const pocket = buildWinPocket(d);
  const holes = buildHoles(d);
  let worstDepth = 0;
  let worstAt = '';
  for (let row = 0; row < ROW_COUNT; row++) {
    for (let power = P_MIN; power <= P_MAX; power += 10) {
      const coin = createCoin();
      placeOnRow(coin, rows, row, groovePos(rows[row]!).x);
      flickCoin(coin, rows, power);
      for (let i = 0; i < 300; i++) {
        stepCoin(coin, FIXED_DT, rows, pocket, holes);
        if (coin.state !== 'airborne') break;
        const depth = penetrationDepth(rows, coin.pos.x, coin.pos.y);
        if (depth > worstDepth) {
          worstDepth = depth;
          worstAt = `段${row + 1} power=${power} pos=(${coin.pos.x.toFixed(0)},${coin.pos.y.toFixed(0)})`;
        }
      }
    }
  }
  // フレーム間の押し出し誤差として数 px までは許す(見た目には分からない)
  check(
    `${d.label}: 飛行中のコインが板にめり込まない(最大 ${worstDepth.toFixed(1)}px)`,
    worstDepth <= 4,
    worstAt,
  );
}

// ---------------------------------------------------------------- 結果
console.log('\n' + '='.repeat(52));
if (failures.length > 0) {
  console.log(`NG: ${failures.length} 件の不整合があります`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('すべての検算に成功しました。');
