/** チューニング用の掃引。CI には入れない(`npm run verify` が本番の検算)。 */
import { DIFFICULTIES, P_MIN, ROW_COUNT } from '../src/config.ts';
import { buildLanes, buildWinPocket, LANE_LENGTH, landingU, MOUTH_LENGTH, holeFrom, holeTo } from '../src/game/board.ts';
import { createCoin, flickCoin, placeReady, pullToPower, stepCoin, type CoinState } from '../src/game/coin.ts';

const DT = 1 / 60;
type Outcome = 'weak' | 'good' | 'strong' | 'idle' | 'hung';

function shot(coin: CoinState, lane: number, power: number): Outcome {
  placeReady(coin, lane);
  flickCoin(coin, power);
  for (let i = 0; i < 60 * 14; i++) {
    const r = stepCoin(coin, DT);
    if (r.enteredBin) return r.enteredBin;
    if (r.becameReady) return 'idle';
  }
  return 'hung';
}

function edge(coin: CoinState, lane: number, lo: number, hi: number, isLow: (o: Outcome) => boolean) {
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (isLow(shot(coin, lane, m))) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

const lanes = buildLanes();
const coin = createCoin(lanes, buildWinPocket(lanes));
console.log(`レーン長 ${LANE_LENGTH.toFixed(1)} / 受け皿の並び ${MOUTH_LENGTH.toFixed(1)}`);
for (let i = 0; i < ROW_COUNT; i++) {
  const l = lanes[i]!;
  console.log(
    `段${i + 1}: 手前 ${(l.bins[0]!.to - l.bins[0]!.from).toFixed(0)} / ` +
      `穴 ${holeFrom(i).toFixed(0)}..${holeTo(i).toFixed(0)} (${(holeTo(i) - holeFrom(i)).toFixed(0)}) / ` +
      `奥 ${(l.bins[2]!.to - l.bins[2]!.from).toFixed(0)}  ` +
      `フィン ${l.rim.toFixed(1)}  着地 u'=${landingU(l).toFixed(0)}`,
  );
}

for (const d of Object.values(DIFFICULTIES)) {
  console.log(`\n=== ${d.label}  力 ${P_MIN}..${d.powerMax}`);
  for (let i = 0; i < ROW_COUNT; i++) {
    const lo = edge(coin, i, 100, 2600, (o) => o === 'weak' || o === 'idle');
    const hi = edge(coin, i, lo, 2600, (o) => o === 'good');
    const seq: string[] = [];
    const N = 60;
    for (let k = 0; k <= N; k++) seq.push(shot(coin, i, pullToPower(k / N, d.powerMax))[0]!);
    const runs: string[] = [];
    for (const o of seq) if (o !== runs[runs.length - 1]) runs.push(o);
    const rate = (seq.filter((o) => o === 'g').length / (N + 1)) * 100;
    const pct = (p: number) => (((p - P_MIN) / (d.powerMax - P_MIN)) * 100).toFixed(0);
    console.log(
      `  段${i + 1}: 成功 ${lo.toFixed(0)}..${hi.toFixed(0)} (引き ${pct(lo)}..${pct(hi)}%)  ` +
        `域 ${rate.toFixed(0)}%  [${runs.join('')}]  ${seq.join('')}`,
    );
  }
}
