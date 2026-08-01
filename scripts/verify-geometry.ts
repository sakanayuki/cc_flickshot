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
  FIN_T,
  GRAB_ZONE,
  LOGICAL_H,
  P_MIN,
  PIT_DEPTH,
  RAIL_RUN,
  ROW_COUNT,
  type DifficultyConfig,
} from '../src/config.ts';
import {
  buildLanes,
  buildWinPocket,
  clearWidth,
  ENTRY_U,
  holeMidU,
  LANE_LENGTH,
  landingU,
  laneP,
  MOUTH_HANG,
  MOUTH_LENGTH,
  ROW_CLEARANCE,
  ROW_CLEARANCE_NEEDED,
  rowClearanceAt,
  type Lane,
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

/**
 * 当たり判定の実効半径。Matter のコインは正 COIN_SIDES 角形なので、
 * 面で接するときの半径は外接円ではなく**内接円**になる。
 * 外接円で見ると壁ぎわで 0.13px はみ出して見えるが、それは絵の話で、
 * 実体が壁を抜けているわけではない。
 */
const HIT_R = COIN_R * Math.cos(Math.PI / COIN_SIDES);
/** Matter が許すめり込み量 (`Bodies.polygon` に渡した slop) */
const SLOP = 0.02;

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

type Outcome = 'weak' | 'good' | 'strong' | 'idle' | 'hung';

interface Shot {
  outcome: Outcome;
  /** 盤面の内側からいちばん外れた距離 (px)。負なら常に内側 */
  worstOut: number;
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
      BOARD_LEFT - (x - HIT_R),
      x + HIT_R - BOARD_RIGHT,
      BOARD_TOP - (y - HIT_R),
      y - HIT_R - BOARD_BOTTOM,
    );
    if (r.enteredBin) return { outcome: r.enteredBin, worstOut, finite };
    if (r.becameReady) return { outcome: 'idle', worstOut, finite };
  }
  return { outcome: 'hung', worstOut, finite };
}

/** 結果が変わる境目の power を二分探索する */
function edge(
  coin: CoinState,
  laneIndex: number,
  lo: number,
  hi: number,
  isLow: (o: Outcome) => boolean,
): number {
  for (let i = 0; i < 32; i++) {
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
}

const SWEEP_LO = 120;
const SWEEP_HI = 2600;

function measureBand(coin: CoinState, laneIndex: number): Band {
  const from = edge(coin, laneIndex, SWEEP_LO, SWEEP_HI, (o) => o === 'weak' || o === 'idle');
  const to = edge(coin, laneIndex, from, SWEEP_HI, (o) => o === 'good');
  return { from, to };
}

/** 引き量 0..1 のうち成功する割合 */
function sweepStroke(coin: CoinState, laneIndex: number, d: DifficultyConfig, n: number) {
  const seq: Outcome[] = [];
  for (let i = 0; i <= n; i++) seq.push(fire(coin, laneIndex, pullToPower(i / n, d.powerMax)).outcome);
  const runs: Outcome[] = [];
  for (const o of seq) if (o !== runs[runs.length - 1]) runs.push(o);
  return {
    seq,
    runs,
    rate: (seq.filter((o) => o === 'good').length / (n + 1)) * 100,
  };
}

function pctOf(power: number, d: DifficultyConfig): number {
  return ((power - P_MIN) / (d.powerMax - P_MIN)) * 100;
}

// ================================================================ §1 幾何

section('1. レーンの幾何');
const lanes = buildLanes();
{
  ok(lanes.length === ROW_COUNT, '段数が ROW_COUNT');

  for (const lane of lanes) {
    const n = lane.index + 1;
    const expect = lane.index % 2 === 0 ? 'right' : 'left';
    ok(lane.side === expect, `段${n}: 低い端の側が交互`);
    ok(lane.high.y < lane.low.y, `段${n}: 高い端が上にある`);
    const wall = lane.side === 'right' ? BOARD_RIGHT - lane.low.x : lane.low.x - BOARD_LEFT;
    ok(wall === 0, `段${n}: 低い端(レバー)が画面の端`, `壁から ${wall.toFixed(0)}px`);
    for (const u of [0, LANE_LENGTH]) {
      const p = laneP(lane, u);
      ok(
        p.x >= BOARD_LEFT && p.x <= BOARD_RIGHT && p.y >= BOARD_TOP && p.y <= BOARD_BOTTOM,
        `段${n}: レーンの端が盤内`,
      );
    }

    const [weak, good, strong] = lane.bins as [Lane['bins'][0], Lane['bins'][0], Lane['bins'][0]];
    /*
     * どのポケットもコイン 1 枚が入るだけの正味の幅が要る。狭いと
     * フィンと背板のあいだで挟まって詰む(弾くこともできず結果も出ない)。
     */
    for (const [b, name] of [
      [weak, '手前のポケット'],
      [good, '落とし穴'],
      [strong, '奥のポケット'],
    ] as const) {
      const w = clearWidth(b.to - b.from);
      ok(w > 2 * COIN_R, `段${n}: ${name}にコインが入る`, `正味 ${w.toFixed(0)} / 直径 ${2 * COIN_R}`);
    }
    /*
     * ポケットの底で止まったコインの中心より、フィンの頂点が上にあること。
     * 下だと、坂を下る勢いのままフィンを越えて穴へ入り直してしまう。
     */
    ok(
      PIT_DEPTH - COIN_R > lane.rim,
      `段${n}: 止まったコインがフィンを越えられない`,
      `底のコイン中心 ${(PIT_DEPTH - COIN_R).toFixed(0)} / フィンの頂点 ${lane.rim.toFixed(1)}`,
    );
    // 穴から落ちたコインは 1 段下のレールの上に着くこと(窪みに掛からない)
    if (lane.index < ROW_COUNT - 1) {
      ok(
        landingU(lane) > COIN_R && landingU(lane) < RAIL_RUN - COIN_R,
        `段${n}: 穴から落ちたコインが 1 段下のレールに着く`,
        `着地 u=${landingU(lane).toFixed(0)} / レール 0..${RAIL_RUN}`,
      );
    }
  }

  /*
   * 上の段の窪みは MOUTH_HANG ぶらさがっている。その下を 1 段下のコインが
   * 通るので、窪みのある範囲すべてで空きが足りていること。
   * いちばん狭いのは窪みの手前の端(u = RAIL_RUN)。
   */
  let worst = Infinity;
  for (let u = RAIL_RUN; u <= LANE_LENGTH; u += 4) {
    worst = Math.min(worst, rowClearanceAt(u) - ROW_CLEARANCE_NEEDED);
  }
  ok(
    worst > 0,
    '窪みの下を 1 段下のコインが通れる',
    `いちばん狭いところで ${worst.toFixed(1)}px 余る(空き ${ROW_CLEARANCE.toFixed(1)} / 必要 ${ROW_CLEARANCE_NEEDED}）`,
  );

  ok(COIN_SIDES % 2 === 0, 'コインの多角形の辺の数が偶数(左右対称)', `${COIN_SIDES}`);
  ok(ENTRY_U < RAIL_RUN - COIN_R, '投入位置がレールの上');
  info(
    `レーン長 ${LANE_LENGTH.toFixed(1)}px / 傾き ${((Math.asin(60 / LANE_LENGTH) * 180) / Math.PI).toFixed(1)}°`,
  );
  info(`レール 0..${RAIL_RUN} / 窪み ${MOUTH_LENGTH.toFixed(0)} (深さ ${PIT_DEPTH}, 厚み ${FIN_T} のフィン 2 枚)`);
}

// ================================================================ §2 段ごとの難しさ

section('2. 下の段ほど難しいこと');
{
  for (let i = 1; i < ROW_COUNT; i++) {
    const a = lanes[i - 1]!;
    const b = lanes[i]!;
    ok(b.bins[1]!.from > a.bins[1]!.from, `段${i + 1}: 穴が 1 段上より遠い`);
    ok(
      b.bins[1]!.to - b.bins[1]!.from < a.bins[1]!.to - a.bins[1]!.from,
      `段${i + 1}: 穴が 1 段上より狭い`,
    );
    ok(b.rim > a.rim, `段${i + 1}: フィンが 1 段上より深い`);
  }
  info(
    lanes
      .map((l) => `段${l.index + 1} 穴 ${(l.bins[1]!.from - RAIL_RUN).toFixed(0)}..${(l.bins[1]!.to - RAIL_RUN).toFixed(0)} 縁 ${l.rim.toFixed(1)}`)
      .join(' / '),
  );
}

// ================================================================ §3 成功域

section('3. 成功域(実物理の掃引)');
const bands: Record<string, Band[]> = {};
for (const d of Object.values(DIFFICULTIES)) {
  const coin = createCoin(lanes, buildWinPocket(lanes));
  const list: Band[] = [];
  const rates: number[] = [];

  for (let i = 0; i < ROW_COUNT; i++) {
    const b = measureBand(coin, i);
    list.push(b);

    /*
     * 帯が 1 区間であること。これがこのゲームの成立条件で、
     * ここが割れていると「弱く弾いたほうが遠くに入る」飛び地ができる。
     * ストローク全体を細かく掃いて確かめる。
     */
    const { seq, runs, rate } = sweepStroke(coin, i, d, 90);
    rates.push(rate);
    ok(
      runs.length === 3 && runs[0] === 'weak' && runs[1] === 'good' && runs[2] === 'strong',
      `${d.label} 段${i + 1}: 弱すぎ → ちょうど → 強すぎ の 3 区間だけ`,
      `実際 ${runs.join(' → ')}`,
    );
    ok(!seq.includes('idle'), `${d.label} 段${i + 1}: ストローク上に空振りが無い`);
    ok(!seq.includes('hung'), `${d.label} 段${i + 1}: 決着しない引き量が無い`);
    ok(
      b.from > P_MIN && b.to < d.powerMax,
      `${d.label} 段${i + 1}: 成功域がストロークの内側に収まる`,
      `${b.from.toFixed(0)}..${b.to.toFixed(0)} / ${P_MIN}..${d.powerMax}`,
    );
  }
  bands[d.id] = list;

  // 下の段ほど「要る引き量が大きく」「成功域が狭い」こと
  for (let i = 1; i < ROW_COUNT; i++) {
    ok(list[i]!.from > list[i - 1]!.from, `${d.label} 段${i + 1}: 要る力が 1 段上より大きい`);
    ok(rates[i]! < rates[i - 1]!, `${d.label} 段${i + 1}: 成功域が 1 段上より狭い`, `${rates[i]!.toFixed(0)}% < ${rates[i - 1]!.toFixed(0)}%`);
  }
  ok(
    rates[0]! - rates[ROW_COUNT - 1]! >= 15,
    `${d.label}: 1 段目と 5 段目で成功域が 15 ポイント以上ちがう`,
    `${rates[0]!.toFixed(0)}% → ${rates[ROW_COUNT - 1]!.toFixed(0)}%`,
  );

  info(
    `${d.label}: ` +
      lanes
        .map(
          (_, i) =>
            `段${i + 1} ${pctOf(list[i]!.from, d).toFixed(0)}..${pctOf(list[i]!.to, d).toFixed(0)}% (域 ${rates[i]!.toFixed(0)}%)`,
        )
        .join(' / '),
  );
}

// ================================================================ §4 投入直後

section('4. 投入直後の安全性');
{
  const coin = createCoin(lanes, buildWinPocket(lanes));
  resetToEntry(coin);
  let ready = false;
  let bad = false;
  for (let f = 0; f < 60 * 6; f++) {
    const r = stepCoin(coin, DT);
    if (r.enteredBin) bad = true;
    if (r.becameReady) {
      ready = true;
      break;
    }
  }
  ok(!bad, '投入しただけでは落ちない');
  ok(ready, '投入したコインが必ずレバーで構える');
}

// ================================================================ §5 頑健性

section('5. 頑健性(全パワー掃引)');
for (const d of Object.values(DIFFICULTIES)) {
  const coin = createCoin(lanes, buildWinPocket(lanes));
  let worstOut = -Infinity;
  let hung = 0;
  let nonFinite = 0;
  for (let i = 0; i <= 60; i++) {
    for (let lane = 0; lane < ROW_COUNT; lane++) {
      const s = fire(coin, lane, pullToPower(i / 60, d.powerMax));
      worstOut = Math.max(worstOut, s.worstOut);
      if (s.outcome === 'hung') hung++;
      if (!s.finite) nonFinite++;
    }
  }
  ok(hung === 0, `${d.label}: どの引き量でも必ず決着する`, `未決着 ${hung} 件`);
  ok(nonFinite === 0, `${d.label}: 座標と速度が NaN にならない`);
  /*
   * Matter は接触をわずかにめり込ませて解く(`slop`)。その 1 回ぶんまでは
   * 許す。それを超えたら本当に壁を抜けている。
   */
  ok(worstOut <= SLOP, `${d.label}: コインが盤面から出ない`, `最悪 ${worstOut.toFixed(3)}px`);
}

// ================================================================ §6 あたりの口

section('6. あたりの口');
{
  const pocket = buildWinPocket(lanes);
  const last = lanes[ROW_COUNT - 1]!;
  ok(
    pocket.center.y + pocket.h / 2 <= BOARD_BOTTOM,
    'あたりの口が盤内に収まる',
    `下端 ${(pocket.center.y + pocket.h / 2).toFixed(0)} / 盤面 ${BOARD_BOTTOM}`,
  );
  const drop = laneP(last, holeMidU(last), -MOUTH_HANG);
  ok(pocket.center.y - pocket.h / 2 > drop.y, 'あたりの口が最下段の窪みより下');
  ok(
    Math.abs(pocket.center.x - drop.x) < pocket.w / 2 - COIN_R,
    'あたりの口が最下段の穴の真下にある',
    `ずれ ${Math.abs(pocket.center.x - drop.x).toFixed(0)}px`,
  );

  for (const d of Object.values(DIFFICULTIES)) {
    const coin = createCoin(lanes, pocket);
    const b = bands[d.id]![ROW_COUNT - 1]!;
    const shot = fire(coin, ROW_COUNT - 1, (b.from + b.to) / 2);
    ok(shot.outcome === 'good', `${d.label}: 最下段の成功が確定する`);
    ok(coin.phase === 'win', `${d.label}: 最下段の穴はあたり扱いになる`, `phase=${coin.phase}`);
  }
}

// ================================================================ §7 5 段通し

section('7. 5 段を通してあたりまで行けること');
for (const d of Object.values(DIFFICULTIES)) {
  const coin = createCoin(lanes, buildWinPocket(lanes));
  // 段ごとに成功域のまん中を狙う。全段で同じ力ではもう通らない
  const powers = bands[d.id]!.map((b) => (b.from + b.to) / 2);

  resetToEntry(coin);
  let won = false;
  let flicks = 0;
  let guard = 0;
  while (guard++ < 60 * 90) {
    if (coin.phase === 'ready') {
      if (flicks >= ROW_COUNT) break;
      flickCoin(coin, powers[coin.laneIndex]!);
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
  ok(won, `${d.label}: 段ごとに狙いを変えて 5 回弾くとあたりになる`, `弾いた回数 ${flicks}`);

}

/*
 * 「1 つの引き量を 5 段そのまま使い回す」余地がどれだけ残っているか。
 *
 * 全段の成功域の共通部分がそれ。ここが広いと、どの段も同じ引きで抜けられて
 * しまい、段ごとに難しさを付けた意味が無くなる(作り直し前は 80% 以上あった)。
 * 盤面の長さが有限なので 0 にはできない。成功域がいちばん狭い段の幅と
 * 一致するところまでは詰められる、というのが上限。
 */
for (const d of Object.values(DIFFICULTIES)) {
  const list = bands[d.id]!;
  const lo = Math.max(...list.map((b) => pctOf(b.from, d)));
  const hi = Math.min(...list.map((b) => pctOf(b.to, d)));
  const shared = Math.max(0, hi - lo);
  const narrowest = Math.min(...list.map((b) => pctOf(b.to, d) - pctOf(b.from, d)));
  ok(
    shared <= narrowest + 1,
    `${d.label}: 使い回せる引き量が、いちばん狭い段の幅より広くない`,
    `共通 ${shared.toFixed(0)}% / 最狭 ${narrowest.toFixed(0)}%`,
  );
  ok(
    shared <= 25,
    `${d.label}: 使い回せる引き量がストロークの 25% 以下`,
    `${shared.toFixed(0)}%`,
  );
  info(`${d.label}: 5 段に共通で通る引き量は ${lo.toFixed(0)}..${hi.toFixed(0)}% (幅 ${shared.toFixed(0)}%)`);
}

// ================================================================ §8 レイアウト

section('8. レイアウト');
{
  const board = (BOARD_BOTTOM - BOARD_TOP) / LOGICAL_H;
  const deck = (LOGICAL_H - BOARD_BOTTOM) / LOGICAL_H;
  ok(board >= 0.78, '盤面が画面の 78% 以上', `${(board * 100).toFixed(1)}%`);
  ok(deck <= 0.18, '操作部が画面の 18% 以下', `${(deck * 100).toFixed(1)}%`);
  ok(GRAB_ZONE.y >= BOARD_BOTTOM, '掴み領域が盤面に重ならない');
  ok(GRAB_ZONE.y + GRAB_ZONE.h <= LOGICAL_H, '掴み領域が画面内');
  info(`盤面 ${(board * 100).toFixed(1)}% / 操作部 ${(deck * 100).toFixed(1)}%`);
  info(
    `弾く力 ${P_MIN}..${Object.values(DIFFICULTIES)
      .map((d) => d.powerMax)
      .join('/')} px/s`,
  );
}

// ================================================================

console.log('');
if (failures === 0) {
  console.log(`すべての検算に成功しました (${checks} 項目)`);
} else {
  console.log(`${failures} 件の検算に失敗しました (${checks} 項目中)`);
  process.exit(1);
}
