/**
 * 盤面の定数の総当たり探索(チューニング用。CI には入れない)。
 *
 * 手計算のモデルでは当たりが付かないので、候補ごとに**本物の物理を回して**
 *   ・どの段も 弱すぎ → ちょうど → 強すぎ の 1 区間か(飛び地が無いか)
 *   ・段ごとの成功域が下の段ほど狭いか
 *   ・5 段ぜんぶに通る「1 つの引き量」が残っていないか
 * を測り、良い順に並べる。
 *
 * `Lane` は素のデータなので、候補ごとに bins / rim / rail を差し替えるだけで
 * 物理も描画もその形になる。config.ts は書き換えない。
 */

import { COIN_R, FIN_T, FLOOR_T, LANE_RISE, P_MIN, PIT_DEPTH, ROW_COUNT, ROW_GAP } from '../src/config.ts';
import { buildLanes, buildWinPocket, LANE_LENGTH, type Lane } from '../src/game/board.ts';
import { createCoin, flickCoin, placeReady, stepCoin, type CoinState } from '../src/game/coin.ts';

const N = 33;
const POWER_MAX = 1550;

interface Cand {
  rail: number;
  rimBase: number;
  rimStep: number;
  from: number;
  fromStep: number;
  span: number;
  spanStep: number;
}

const rimAt = (c: Cand, i: number) => c.rimBase + c.rimStep * i;
const fromAt = (c: Cand, i: number) => c.from + c.fromStep * i;
const spanAt = (c: Cand, i: number) => c.span - c.spanStep * i;

function tuned(c: Cand): Lane[] {
  const lanes = buildLanes();
  for (const l of lanes) {
    const f = c.rail + fromAt(c, l.index);
    const t = f + spanAt(c, l.index);
    l.rail = { from: 0, to: c.rail };
    l.bins = [
      { kind: 'weak', from: c.rail, to: f },
      { kind: 'good', from: f, to: t },
      { kind: 'strong', from: t, to: LANE_LENGTH },
    ];
    l.rim = rimAt(c, l.index);
  }
  return lanes;
}

type Outcome = 'w' | 'g' | 's' | 'i' | 'h';

function shot(coin: CoinState, lane: number, power: number): Outcome {
  placeReady(coin, lane);
  flickCoin(coin, power);
  for (let i = 0; i < 60 * 12; i++) {
    const r = stepCoin(coin, 1 / 60);
    if (r.enteredBin) return r.enteredBin[0] as Outcome;
    if (r.becameReady) return 'i';
  }
  return 'h';
}

interface Result {
  clean: boolean;
  rates: number[];
  /** 5 段ぜんぶに通る引き量の幅 (%) */
  shared: number;
  c: Cand;
}

function evaluate(c: Cand): Result {
  const lanes = tuned(c);
  const coin = createCoin(lanes, buildWinPocket(lanes));
  const rates: number[] = [];
  const bandLo: number[] = [];
  const bandHi: number[] = [];
  let clean = true;

  for (let i = 0; i < ROW_COUNT; i++) {
    const seq: Outcome[] = [];
    for (let k = 0; k <= N; k++) seq.push(shot(coin, i, P_MIN + (POWER_MAX - P_MIN) * (k / N)));
    const runs: Outcome[] = [];
    for (const o of seq) if (o !== runs[runs.length - 1]) runs.push(o);
    if (!(runs.length === 3 && runs[0] === 'w' && runs[1] === 'g' && runs[2] === 's')) clean = false;
    const first = seq.indexOf('g');
    if (first < 0) return { clean: false, rates: [], shared: 100, c };
    bandLo.push((first / N) * 100);
    bandHi.push((seq.lastIndexOf('g') / N) * 100);
    rates.push((seq.filter((o) => o === 'g').length / (N + 1)) * 100);
  }

  return { clean, rates, shared: Math.max(0, Math.min(...bandHi) - Math.max(...bandLo)), c };
}

/** 幾何として成り立つ候補だけに絞る(物理を回す前の足切り) */
function feasible(c: Cand): boolean {
  const mouth = LANE_LENGTH - c.rail;
  const rims = Array.from({ length: ROW_COUNT }, (_, i) => rimAt(c, i));
  if (Math.min(...rims) < 16) return false;
  if (PIT_DEPTH - COIN_R - 6 <= Math.max(...rims)) return false;
  for (let i = 0; i < ROW_COUNT; i++) {
    const from = fromAt(c, i);
    const span = spanAt(c, i);
    if (from - FIN_T <= 2 * COIN_R) return false;
    if (span - FIN_T <= 2 * COIN_R) return false;
    if (mouth - (from + span) - FIN_T <= 2 * COIN_R) return false;
  }
  const clearance = ROW_GAP + LANE_RISE * ((2 * c.rail) / LANE_LENGTH - 1);
  return clearance > PIT_DEPTH + FLOOR_T + 2 * COIN_R;
}

function score(r: Result): number {
  const ramp = r.rates[0]! - r.rates[ROW_COUNT - 1]!;
  const monotone = r.rates.every((v, i) => i === 0 || v <= r.rates[i - 1]! + 1);
  return (monotone ? 40 : 0) + ramp - r.shared * 2.2;
}

const grid: Cand[] = [];
for (const rail of [240, 255, 270])
  for (const rimBase of [34, 40, 46])
    for (const rimStep of [5, 7, 9])
      for (const from of [70, 78])
        for (const fromStep of [22, 26, 30])
          for (const span of [150, 165, 180])
            for (const spanStep of [8, 12, 16, 20])
              grid.push({ rail, rimBase, rimStep, from, fromStep, span, spanStep });

const cands = grid.filter(feasible);
console.log(`候補 ${grid.length} 件中 ${cands.length} 件が幾何の制約を満たす`);

const results = cands.map((c, n) => {
  if (n % 25 === 0) process.stderr.write(`  ${n}/${cands.length}\r`);
  return evaluate(c);
});

const good = results.filter((r) => r.clean).sort((a, b) => score(b) - score(a));
console.log(`飛び地の無い候補 ${good.length} / ${results.length}\n`);
for (const r of good.slice(0, 18)) {
  const c = r.c;
  console.log(
    `${score(r).toFixed(0).padStart(4)}  共通 ${r.shared.toFixed(0).padStart(3)}%  ` +
      `域 ${r.rates.map((v) => v.toFixed(0).padStart(3)).join(' ')}   ` +
      `rail${c.rail} rim${c.rimBase}${c.rimStep >= 0 ? '+' : ''}${c.rimStep} ` +
      `from${c.from}+${c.fromStep} span${c.span}-${c.spanStep}`,
  );
}
