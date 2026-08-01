/** 1 発ぶんの軌跡。チューニング用。 */
import { RAIL_RUN } from '../src/config.ts';
import { buildLanes, buildWinPocket, laneProject } from '../src/game/board.ts';
import { createCoin, flickCoin, placeReady, stepCoin } from '../src/game/coin.ts';

const power = Number(process.argv[2] ?? 962);
const li = Number(process.argv[3] ?? 2);
const lanes = buildLanes();
const lane = lanes[li]!;
console.log(
  `段${li + 1} レール 0..${RAIL_RUN} / 受け皿 ` +
    lane.bins.map((b) => `${b.kind}:${b.from.toFixed(0)}..${b.to.toFixed(0)}`).join(' '),
);
const coin = createCoin(lanes, buildWinPocket(lanes));
placeReady(coin, li);
flickCoin(coin, power);
for (let i = 0; i < 60 * 6; i++) {
  const r = stepCoin(coin, 1 / 60);
  const pr = laneProject(lane, coin.pos);
  if (pr.u > RAIL_RUN - 40 || i % 4 === 0) {
    const vAl = coin.vel.x * lane.dir.x + coin.vel.y * lane.dir.y;
    const vPe = coin.vel.x * lane.norm.x + coin.vel.y * lane.norm.y;
    console.log(
      `${String(i).padStart(3)} ${coin.phase.padEnd(7)} u=${pr.u.toFixed(1).padStart(6)} perp=${pr.perp.toFixed(1).padStart(7)} v∥=${vAl.toFixed(0).padStart(5)} v⊥=${vPe.toFixed(0).padStart(5)}`,
    );
  }
  if (r.enteredBin) { console.log('→', r.enteredBin); break; }
  if (r.becameReady) { console.log('→ idle'); break; }
}
