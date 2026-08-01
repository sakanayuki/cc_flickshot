/**
 * 盤面の検算。`npm run verify` で実行し、CI(デプロイ)の前段でも走らせる。
 *
 * **式だけで判断しない。実際に Matter.js を回して測る。**
 * 「計算上は正しいのに遊べない」不具合を何度も作り込んだので、
 * 成功域も安全性も、本番とまったく同じ物理を通した結果で見ている。
 */

import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  COIN_SIDES,
  DIFFICULTIES,
  GRAB_ZONE,
  LOGICAL_H,
  MAX_REACH,
  P_MAX,
  P_MIN,
  ROW_COUNT,
  SOLID_RUN,
} from '../src/config.ts';
import {
  buildLanes,
  buildWinPocket,
  ENTRY_U,
  GAP_END_U,
  LANE_LENGTH,
  laneP,
  maxLandingU,
  ROW_CLEARANCE,
  ROW_CLEARANCE_NEEDED,
} from '../src/game/board.ts';
import {
  createCoin,
  flickCoin,
  placeReady,
  pullToPower,
  resetToEntry,
  stepCoin,
  type CoinState,
} from '../src/game/coin.ts';

const DT = 1 / 60;
const MAX_FRAMES = 60 * 15;

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string, detail = ''): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  ✗ ${label}${detail ? `  ${detail}` : ''}`);
  }
}

function section(name: string): void {
  console.log(`\n§ ${name}`);
}

function info(line: string): void {
  console.log(`    ${line}`);
}

// ---------------------------------------------------------------- 掃引

type Outcome = 'weak' | 'through' | 'strong' | 'idle' | 'hung';

interface Shot {
  outcome: Outcome;
  /** 盤面の内側からいちばん外れた距離 (px)。負なら常に内側 */
  worstOut: number;
  frames: number;
  finite: boolean;
}

function fire(coin: CoinState, laneIndex: number, power: number): Shot {
  placeReady(coin, laneIndex);
  flickCoin(coin, power);
  let worstOut = -Infinity;
  let finite = true;
  for (let f = 1; f <= MAX_FRAMES; f++) {
    const r = stepCoin(coin, DT);
    const { x, y } = coin.pos;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(coin.speed)) finite = false;
    worstOut = Math.max(
      worstOut,
      BOARD_LEFT - (x - COIN_R),
      x + COIN_R - BOARD_RIGHT,
      BOARD_TOP - (y - COIN_R),
      y - COIN_R - BOARD_BOTTOM,
    );
    if (r.lost) return { outcome: r.lost, worstOut, frames: f, finite };
    if (r.droppedThrough) return { outcome: 'through', worstOut, frames: f, finite };
    if (r.becameReady) return { outcome: 'idle', worstOut, frames: f, finite };
  }
  return { outcome: 'hung', worstOut, frames: MAX_FRAMES, finite };
}

/** 結果が from → to に変わる境目の power を二分探索する */
function edge(
  coin: CoinState,
  laneIndex: number,
  lo: number,
  hi: number,
  isLow: (o: Outcome) => boolean,
): number {
  for (let i = 0; i < 34; i++) {
    const mid = (lo + hi) / 2;
    if (isLow(fire(coin, laneIndex, mid).outcome)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

interface Band {
  /** 成功する初速の下端・上端 */
  from: number;
  to: number;
  /** 何もせずレバーに戻る「空振り」が起きる上限の初速 */
  idleTo: number;
}

const SWEEP_LO = 120;
const SWEEP_HI = 1600;

function measureBand(coin: CoinState, laneIndex: number): Band {
  const idleTo = edge(coin, laneIndex, SWEEP_LO, SWEEP_HI, (o) => o === 'idle');
  const from = edge(coin, laneIndex, SWEEP_LO, SWEEP_HI, (o) => o !== 'through' && o !== 'strong');
  const to = edge(coin, laneIndex, from, SWEEP_HI, (o) => o === 'through');
  return { from, to, idleTo };
}

function pct(power: number): number {
  return ((power - P_MIN) / (P_MAX - P_MIN)) * 100;
}

// ================================================================ §1 幾何

section('1. レーンの幾何');
{
  const lanes = buildLanes(DIFFICULTIES.easy);
  ok(lanes.length === ROW_COUNT, '段数が ROW_COUNT');

  for (const lane of lanes) {
    const expect = lane.index % 2 === 0 ? 'right' : 'left';
    ok(lane.side === expect, `段${lane.index + 1}: 低い端の側が交互`);
    ok(lane.high.y < lane.low.y, `段${lane.index + 1}: 高い端が上にある`);
    const wall = lane.side === 'right' ? BOARD_RIGHT - lane.low.x : lane.low.x - BOARD_LEFT;
    ok(
      wall <= (BOARD_RIGHT - BOARD_LEFT) * 0.2,
      `段${lane.index + 1}: 低い端(レバー)が画面の端`,
      `壁から ${wall.toFixed(0)}px`,
    );
    for (const u of [0, LANE_LENGTH]) {
      const p = laneP(lane, u);
      ok(
        p.x >= BOARD_LEFT && p.x <= BOARD_RIGHT && p.y >= BOARD_TOP && p.y <= BOARD_BOTTOM,
        `段${lane.index + 1}: レーンの端が盤内`,
      );
    }
  }

  ok(
    ROW_CLEARANCE > ROW_CLEARANCE_NEEDED,
    '段の低い端と 1 段下の高い端のあいだをコインが通れる',
    `空き ${ROW_CLEARANCE} / 必要 ${ROW_CLEARANCE_NEEDED}`,
  );
  ok(COIN_SIDES % 2 === 0, 'コインの多角形の辺の数が偶数(左右対称)', `${COIN_SIDES}`);
  ok(GAP_END_U < LANE_LENGTH, '隙間の終わりより先に奥の穴の余地がある');
  ok(ENTRY_U < SOLID_RUN - COIN_R, '投入位置がレールの上');

  for (const d of Object.values(DIFFICULTIES)) {
    ok(
      maxLandingU(d) < SOLID_RUN - COIN_R,
      `${d.label}: 隙間から落ちた着地点がレールの上(手前の穴に掛からない)`,
      `着地の上限 ${maxLandingU(d).toFixed(0)} / レール端 ${SOLID_RUN}`,
    );
    ok(
      d.nearHoleSpan < MAX_REACH,
      `${d.label}: 手前の穴の先に隙間が残っている`,
      `${d.nearHoleSpan} < ${MAX_REACH}`,
    );
    ok(d.nearHoleSpan > 2 * COIN_R, `${d.label}: 手前の穴がコインより広い`);
  }
  info(`レーン長 ${LANE_LENGTH.toFixed(1)}px / 傾き ${((Math.asin(60 / LANE_LENGTH) * 180) / Math.PI).toFixed(1)}°`);
  info(`レール 0..${SOLID_RUN} / 落とし口 ${SOLID_RUN}..${LANE_LENGTH.toFixed(0)}`);
}

// ================================================================ §2 合同

section('2. 5 段が合同であること');
{
  const lanes = buildLanes(DIFFICULTIES.easy);
  const base = lanes[0]!;
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  for (const lane of lanes.slice(1)) {
    ok(same(lane.length, base.length), `段${lane.index + 1}: 長さが同じ`);
    ok(same(lane.slope, base.slope), `段${lane.index + 1}: 傾きが同じ`);
    ok(same(lane.nearHole.from, base.nearHole.from), `段${lane.index + 1}: 手前の穴の位置が同じ`);
    ok(same(lane.nearHole.to, base.nearHole.to), `段${lane.index + 1}: 手前の穴の幅が同じ`);
    ok(same(lane.gap.to, base.gap.to), `段${lane.index + 1}: 隙間の終わりが同じ`);
  }
}

// ================================================================ §3 成功域

section('3. 成功域(実物理の掃引)');
const bands: Record<string, Band[]> = {};
for (const d of Object.values(DIFFICULTIES)) {
  const lanes = buildLanes(d);
  const coin = createCoin(lanes, buildWinPocket(lanes));
  const list: Band[] = [];
  for (let i = 0; i < ROW_COUNT; i++) list.push(measureBand(coin, i));
  bands[d.id] = list;

  const b0 = list[0]!;
  for (const [i, b] of list.entries()) {
    // 完全一致は求めない。Matter の当たり判定は左右で解く順が変わるため、
    // 低い端が右の段と左の段でごくわずかに差が出る。帯の 3% を許容幅にする。
    const tol = (b0.to - b0.from) * 0.03;
    ok(Math.abs(b.from - b0.from) < tol, `${d.label} 段${i + 1}: 成功域の下端が全段一致`, `${b.from.toFixed(0)} vs ${b0.from.toFixed(0)}`);
    ok(Math.abs(b.to - b0.to) < tol, `${d.label} 段${i + 1}: 成功域の上端が全段一致`, `${b.to.toFixed(0)} vs ${b0.to.toFixed(0)}`);
  }

  ok(b0.from > P_MIN, `${d.label}: 最弱で弾くと弱すぎで落ちる`, `帯の下端 ${b0.from.toFixed(0)} / P_MIN ${P_MIN}`);
  ok(b0.to < P_MAX, `${d.label}: 最強で弾くと強すぎで落ちる`, `帯の上端 ${b0.to.toFixed(0)} / P_MAX ${P_MAX}`);
  ok(
    b0.idleTo < P_MIN,
    `${d.label}: 空振り(弾いても何も起きない)が起きない`,
    `空振りの上限 ${b0.idleTo.toFixed(0)} / P_MIN ${P_MIN}`,
  );

  // 帯が 1 区間であること。ストローク全体を細かく掃いて確認する
  const lanesFine = buildLanes(d);
  const coin2 = createCoin(lanesFine, buildWinPocket(lanesFine));
  const seq: Outcome[] = [];
  const N = 160;
  for (let i = 0; i <= N; i++) seq.push(fire(coin2, 0, pullToPower(i / N)).outcome);
  const runs: Outcome[] = [];
  for (const o of seq) if (o !== runs[runs.length - 1]) runs.push(o);
  ok(
    runs.length === 3 && runs[0] === 'weak' && runs[1] === 'through' && runs[2] === 'strong',
    `${d.label}: 弱すぎ → 成功 → 強すぎ の 3 区間だけ`,
    `実際 ${runs.join(' → ')}`,
  );
  ok(!seq.includes('idle'), `${d.label}: ストローク上に空振りが無い`);
  ok(!seq.includes('hung'), `${d.label}: ストローク上に決着しないパワーが無い`);

  const rate = (seq.filter((o) => o === 'through').length / (N + 1)) * 100;
  const weak = (seq.filter((o) => o === 'weak').length / (N + 1)) * 100;
  const strong = (seq.filter((o) => o === 'strong').length / (N + 1)) * 100;
  const target = d.id === 'easy' ? [50, 65] : [25, 40];
  ok(
    rate >= target[0]! && rate <= target[1]!,
    `${d.label}: 成功域が ${target[0]}〜${target[1]}%`,
    `実際 ${rate.toFixed(1)}%`,
  );
  info(
    `${d.label}: 弱すぎ ${weak.toFixed(1)}% / 成功 ${rate.toFixed(1)}% / 強すぎ ${strong.toFixed(1)}%` +
      `  (引き量 ${pct(b0.from).toFixed(1)}%..${pct(b0.to).toFixed(1)}%)`,
  );
}

// ================================================================ §4 投入直後

section('4. 投入直後の安全性');
for (const d of Object.values(DIFFICULTIES)) {
  const lanes = buildLanes(d);
  const coin = createCoin(lanes, buildWinPocket(lanes));
  resetToEntry(coin);
  let ready = false;
  let bad = false;
  for (let f = 0; f < 60 * 6; f++) {
    const r = stepCoin(coin, DT);
    if (r.lost || r.droppedThrough) bad = true;
    if (r.becameReady) {
      ready = true;
      break;
    }
  }
  ok(!bad, `${d.label}: 投入しただけでは落ちない`);
  ok(ready, `${d.label}: 投入したコインが必ずレバーで構える`);
}

// ================================================================ §5 頑健性

section('5. 頑健性(全パワー掃引)');
for (const d of Object.values(DIFFICULTIES)) {
  const lanes = buildLanes(d);
  const coin = createCoin(lanes, buildWinPocket(lanes));
  let worstOut = -Infinity;
  let hung = 0;
  let nonFinite = 0;
  for (let i = 0; i <= 100; i++) {
    for (let lane = 0; lane < ROW_COUNT; lane++) {
      const s = fire(coin, lane, pullToPower(i / 100));
      worstOut = Math.max(worstOut, s.worstOut);
      if (s.outcome === 'hung') hung++;
      if (!s.finite) nonFinite++;
    }
  }
  ok(hung === 0, `${d.label}: どの引き量でも必ず決着する`, `未決着 ${hung} 件`);
  ok(nonFinite === 0, `${d.label}: 座標と速度が NaN にならない`);
  ok(worstOut <= 0, `${d.label}: コインが盤面から出ない`, `最悪 ${worstOut.toFixed(2)}px`);
}

// ================================================================ §6 あたりの口

section('6. あたりの口');
for (const d of Object.values(DIFFICULTIES)) {
  const lanes = buildLanes(d);
  const pocket = buildWinPocket(lanes);
  const coin = createCoin(lanes, pocket);
  const last = lanes[ROW_COUNT - 1]!;
  ok(
    pocket.center.y + pocket.h / 2 <= BOARD_BOTTOM,
    `${d.label}: あたりの口が盤内に収まる`,
    `下端 ${(pocket.center.y + pocket.h / 2).toFixed(0)} / 盤面 ${BOARD_BOTTOM}`,
  );
  ok(pocket.center.y - pocket.h / 2 > laneP(last, last.gap.to).y, `${d.label}: あたりの口が最下段より下`);

  // 成功域のど真ん中で最下段を弾くと、あたりになること
  const b = bands[d.id]![0]!;
  const shot = fire(coin, ROW_COUNT - 1, (b.from + b.to) / 2);
  ok(shot.outcome === 'through', `${d.label}: 最下段の成功が「あたり」として確定する`);
  ok(coin.phase === 'win', `${d.label}: 最下段の隙間はあたり扱いになる`, `phase=${coin.phase}`);
}

// ================================================================ §7 5 段通し

section('7. 5 段を通してあたりまで行けること');
for (const d of Object.values(DIFFICULTIES)) {
  const lanes = buildLanes(d);
  const coin = createCoin(lanes, buildWinPocket(lanes));
  const b = bands[d.id]![0]!;
  const power = (b.from + b.to) / 2;

  resetToEntry(coin);
  let won = false;
  let flicks = 0;
  let guard = 0;
  while (guard++ < 60 * 60) {
    if (coin.phase === 'ready') {
      if (flicks >= ROW_COUNT) break;
      flickCoin(coin, power);
      flicks++;
      continue;
    }
    const r = stepCoin(coin, DT);
    if (r.won) {
      won = true;
      break;
    }
    if (r.lost) break;
  }
  ok(won, `${d.label}: 成功域の中央で 5 回弾くとあたりになる`, `弾いた回数 ${flicks}`);
}

// ================================================================ §8 レイアウト

section('8. レイアウト');
{
  const board = (BOARD_BOTTOM - BOARD_TOP) / LOGICAL_H;
  const plunger = (LOGICAL_H - BOARD_BOTTOM) / LOGICAL_H;
  ok(board >= 0.72, '盤面が画面の 72% 以上', `${(board * 100).toFixed(1)}%`);
  ok(plunger <= 0.24, 'プランジャー帯が画面の 24% 以下', `${(plunger * 100).toFixed(1)}%`);
  ok(GRAB_ZONE.y >= BOARD_BOTTOM, '掴み領域が盤面に重ならない');
  ok(GRAB_ZONE.y + GRAB_ZONE.h <= LOGICAL_H, '掴み領域が画面内');
  info(`盤面 ${(board * 100).toFixed(1)}% / プランジャー帯 ${(plunger * 100).toFixed(1)}%`);
  info(`弾く力 ${P_MIN}..${P_MAX} px/s`);
}

// ================================================================

console.log('');
if (failures === 0) {
  console.log(`すべての検算に成功しました (${checks} 項目)`);
} else {
  console.log(`${failures} 件の検算に失敗しました (${checks} 項目中)`);
  process.exit(1);
}
