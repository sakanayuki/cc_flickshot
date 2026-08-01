/**
 * コインと盤面のテスト。描画はテストしない。
 *
 * 物理は Matter.js に任せているので、ここで見るのは
 * 「ゲームのルールが物理の結果として本当に成立しているか」。
 * 数式のつじつまではなく、実際に回した結果を見る。
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  COIN_SIDES,
  DIFFICULTIES,
  FIN_T,
  P_MIN,
  PIT_DEPTH,
  RAIL_RUN,
  ROW_COUNT,
} from '../config.ts';
import {
  buildLanes,
  buildWinPocket,
  clearWidth,
  ENTRY_U,
  LANE_LENGTH,
  landingU,
  laneProject,
  ROW_CLEARANCE,
  ROW_CLEARANCE_NEEDED,
} from './board.ts';
import {
  canFlick,
  createCoin,
  depthOf,
  flickCoin,
  placeReady,
  pullToPower,
  resetToEntry,
  stepCoin,
  type CoinState,
} from './coin.ts';

const DT = 1 / 60;

type Outcome = 'weak' | 'good' | 'strong' | 'idle' | 'hung';

function makeCoin(): CoinState {
  const lanes = buildLanes();
  return createCoin(lanes, buildWinPocket(lanes));
}

function fire(coin: CoinState, lane: number, power: number): Outcome {
  placeReady(coin, lane);
  flickCoin(coin, power);
  for (let i = 0; i < 60 * 15; i++) {
    const r = stepCoin(coin, DT);
    if (r.enteredBin) return r.enteredBin;
    if (r.becameReady) return 'idle';
  }
  return 'hung';
}

/** 段 lane の成功域の下端・上端を二分探索する */
function band(coin: CoinState, lane: number): { from: number; to: number } {
  const edge = (lo: number, hi: number, isLow: (o: Outcome) => boolean) => {
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (isLow(fire(coin, lane, mid))) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const from = edge(120, 2600, (o) => o === 'weak' || o === 'idle');
  const to = edge(from, 2600, (o) => o === 'good');
  return { from, to };
}

const mid = (b: { from: number; to: number }) => (b.from + b.to) / 2;

// ---------------------------------------------------------------- 盤面

describe('盤面の幾何', () => {
  const lanes = buildLanes();

  it('レーンが 5 段ある', () => {
    expect(lanes).toHaveLength(ROW_COUNT);
  });

  it('低い端が右・左・右…と交互に入れ替わる', () => {
    expect(lanes.map((l) => l.side)).toEqual(['right', 'left', 'right', 'left', 'right']);
  });

  it('レーンは画面の左右の端まで伸びている', () => {
    for (const l of lanes) {
      expect(Math.min(l.low.x, l.high.x)).toBe(BOARD_LEFT);
      expect(Math.max(l.low.x, l.high.x)).toBe(BOARD_RIGHT);
    }
  });

  it('高い端は低い端より上にある(ななめ上向き)', () => {
    for (const l of lanes) expect(l.high.y).toBeLessThan(l.low.y);
  });

  it('レーンの長さと傾きは全段そろっている', () => {
    const b = lanes[0]!;
    for (const l of lanes.slice(1)) {
      expect(l.length).toBeCloseTo(b.length, 9);
      expect(l.slope).toBeCloseTo(b.slope, 9);
      expect(l.rail).toEqual(b.rail);
    }
  });

  it('床はレール 1 本だけで、その先は窪み', () => {
    for (const l of lanes) {
      expect(l.rail).toEqual({ from: 0, to: RAIL_RUN });
      expect(l.bins.map((b) => b.kind)).toEqual(['weak', 'good', 'strong']);
      expect(l.bins[0]!.from).toBe(RAIL_RUN);
      expect(l.bins[2]!.to).toBeCloseTo(LANE_LENGTH, 9);
    }
  });

  it('下の段ほど穴が遠く、狭く、フィンが深い', () => {
    for (let i = 1; i < ROW_COUNT; i++) {
      const a = lanes[i - 1]!;
      const b = lanes[i]!;
      expect(b.bins[1]!.from).toBeGreaterThan(a.bins[1]!.from);
      expect(b.bins[1]!.to - b.bins[1]!.from).toBeLessThan(a.bins[1]!.to - a.bins[1]!.from);
      expect(b.rim).toBeGreaterThan(a.rim);
    }
  });

  it('どのポケットにもコインが 1 枚収まる', () => {
    for (const l of lanes) {
      for (const b of l.bins) {
        expect(clearWidth(b.to - b.from)).toBeGreaterThan(2 * COIN_R);
      }
    }
  });

  it('ポケットで止まったコインはフィンを越えられない', () => {
    // 底に乗ったコインの中心より、フィンの頂点が上にあること
    for (const l of lanes) expect(PIT_DEPTH - COIN_R).toBeGreaterThan(l.rim);
  });

  it('落ちたコインが段のあいだを通れるだけの空きがある', () => {
    expect(ROW_CLEARANCE).toBeGreaterThan(ROW_CLEARANCE_NEEDED);
  });

  it('コインの多角形の辺の数が偶数(当たり判定が左右対称)', () => {
    expect(COIN_SIDES % 2).toBe(0);
  });

  it('投入位置と着地点はどちらもレールの上', () => {
    expect(ENTRY_U).toBeLessThan(RAIL_RUN - COIN_R);
    for (const l of lanes.slice(0, -1)) {
      expect(landingU(l)).toBeGreaterThan(COIN_R);
      expect(landingU(l)).toBeLessThan(RAIL_RUN - COIN_R);
    }
  });

  it('難易度で盤面は変わらない(変わるのは弾く力の上限だけ)', () => {
    expect(DIFFICULTIES.normal.powerMax).toBeGreaterThan(DIFFICULTIES.easy.powerMax);
    expect(buildLanes()).toEqual(lanes);
  });

  it('フィンは薄い(上を向いた面をできるだけ小さくする)', () => {
    expect(FIN_T).toBeLessThan(COIN_R / 2);
  });
});

// ---------------------------------------------------------------- 弾く

describe('弾く', () => {
  it('構えているコインだけ弾ける', () => {
    const coin = makeCoin();
    resetToEntry(coin);
    expect(canFlick(coin)).toBe(false);
    expect(flickCoin(coin, 800)).toBe(false);
    placeReady(coin, 0);
    expect(canFlick(coin)).toBe(true);
    expect(flickCoin(coin, 800)).toBe(true);
  });

  it('弾くと斜面に沿った初速になり、レーンを登る', () => {
    const coin = makeCoin();
    placeReady(coin, 0);
    const u0 = coin.u;
    flickCoin(coin, 800);
    const lane = coin.lanes[0]!;
    const along = coin.vel.x * lane.dir.x + coin.vel.y * lane.dir.y;
    expect(along).toBeCloseTo(800, 0);
    stepCoin(coin, DT);
    expect(coin.u).toBeGreaterThan(u0);
    expect(coin.pos.y).toBeLessThan(lane.low.y);
  });

  it('重力の斜面成分で減速する', () => {
    const coin = makeCoin();
    placeReady(coin, 0);
    flickCoin(coin, 700);
    const lane = coin.lanes[0]!;
    const speedAlong = () => coin.vel.x * lane.dir.x + coin.vel.y * lane.dir.y;
    let prev = speedAlong();
    for (let i = 0; i < 8; i++) {
      stepCoin(coin, DT);
      const v = speedAlong();
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });

  it('引き量 0..1 が P_MIN..難易度の上限に対応する', () => {
    for (const d of Object.values(DIFFICULTIES)) {
      expect(pullToPower(0, d.powerMax)).toBe(P_MIN);
      expect(pullToPower(1, d.powerMax)).toBe(d.powerMax);
      expect(pullToPower(0.5, d.powerMax)).toBeCloseTo((P_MIN + d.powerMax) / 2, 6);
    }
  });
});

// ---------------------------------------------------------------- 成功域

describe('弾く力と結果の対応', () => {
  const coin = makeCoin();
  const bands = Array.from({ length: ROW_COUNT }, (_, i) => band(coin, i));

  for (let i = 0; i < ROW_COUNT; i++) {
    describe(`段${i + 1}`, () => {
      const b = bands[i]!;

      it('弱すぎると手前のポケットで止まる', () => {
        expect(fire(coin, i, b.from - 30)).toBe('weak');
        expect(fire(coin, i, P_MIN)).toBe('weak');
      });

      it('ちょうどだと穴を抜ける', () => {
        expect(fire(coin, i, mid(b))).toBe('good');
      });

      it('強すぎると奥のポケットで止まる', () => {
        expect(fire(coin, i, b.to + 30)).toBe('strong');
      });

      it('成功域がどの難易度のストロークにも収まる', () => {
        expect(b.from).toBeGreaterThan(P_MIN);
        for (const d of Object.values(DIFFICULTIES)) {
          expect(b.to).toBeLessThan(d.powerMax);
        }
      });

      /*
       * このゲームが成立する条件。ここが割れていると
       * 「弱く弾いたほうが遠くに入る」飛び地ができ、狙って当てられなくなる。
       */
      it('弱すぎ → ちょうど → 強すぎ が 1 区間ずつ並ぶ(飛び地が無い)', () => {
        const runs: Outcome[] = [];
        for (let k = 0; k <= 80; k++) {
          const o = fire(coin, i, pullToPower(k / 80, DIFFICULTIES.easy.powerMax));
          if (o !== runs[runs.length - 1]) runs.push(o);
        }
        expect(runs).toEqual(['weak', 'good', 'strong']);
      });
    });
  }

  it('下の段ほど強く弾く必要がある', () => {
    for (let i = 1; i < ROW_COUNT; i++) {
      expect(bands[i]!.from).toBeGreaterThan(bands[i - 1]!.from);
    }
  });

  it('下の段ほど成功域が狭い', () => {
    for (let i = 1; i < ROW_COUNT; i++) {
      const wide = bands[i - 1]!.to - bands[i - 1]!.from;
      const narrow = bands[i]!.to - bands[i]!.from;
      expect(narrow).toBeLessThan(wide);
    }
  });

  it('1 段目と最下段で成功域の広さが 2 倍以上ちがう', () => {
    const first = bands[0]!.to - bands[0]!.from;
    const last = bands[ROW_COUNT - 1]!.to - bands[ROW_COUNT - 1]!.from;
    expect(first / last).toBeGreaterThan(2);
  });

  /*
   * 1 段目の狙いをそのまま 5 段に使い回せないこと。
   * 使えてしまうと、段ごとに難しさを付けた意味が無い。
   */
  it('1 段目の真ん中の力では最下段を抜けられない', () => {
    expect(fire(coin, ROW_COUNT - 1, mid(bands[0]!))).not.toBe('good');
  });
});

// ---------------------------------------------------------------- 段の移り

describe('穴を抜けて 1 段下へ', () => {
  const coin = makeCoin();
  const bands = Array.from({ length: ROW_COUNT }, (_, i) => band(coin, i));

  it('落ちたあと 1 段下のレーンに乗り、レバーで構える', () => {
    placeReady(coin, 0);
    flickCoin(coin, mid(bands[0]!));
    let landed = false;
    for (let i = 0; i < 60 * 10; i++) {
      const r = stepCoin(coin, DT);
      if (r.landed) landed = true;
      if (r.becameReady) break;
    }
    expect(landed).toBe(true);
    expect(coin.laneIndex).toBe(1);
    expect(coin.phase).toBe('ready');
    expect(canFlick(coin)).toBe(true);
  });

  it('着地するのはレールの上(自分から窪みに落ちない)', () => {
    placeReady(coin, 0);
    flickCoin(coin, mid(bands[0]!));
    for (let i = 0; i < 60 * 10; i++) {
      const r = stepCoin(coin, DT);
      if (r.landed) {
        const u = laneProject(coin.lanes[1]!, coin.pos).u;
        expect(u).toBeLessThan(RAIL_RUN - COIN_R);
        return;
      }
    }
    throw new Error('着地しなかった');
  });

  it('落ちているあいだは画面の下向きに落ちる', () => {
    placeReady(coin, 0);
    flickCoin(coin, mid(bands[0]!));
    let wasFalling = false;
    for (let i = 0; i < 60 * 10; i++) {
      const prevY = coin.pos.y;
      const r = stepCoin(coin, DT);
      if (wasFalling && coin.phase === 'falling') expect(coin.pos.y).toBeGreaterThan(prevY);
      if (coin.phase === 'falling') wasFalling = true;
      if (r.landed) break;
    }
    expect(wasFalling).toBe(true);
  });

  it('最下段の穴はあたりになる', () => {
    placeReady(coin, ROW_COUNT - 1);
    flickCoin(coin, mid(bands[ROW_COUNT - 1]!));
    let won = false;
    for (let i = 0; i < 60 * 10; i++) {
      const r = stepCoin(coin, DT);
      if (r.won) won = true;
      if (r.finished) break;
    }
    expect(won).toBe(true);
    expect(coin.phase).toBe('win');
    expect(depthOf(coin)).toBe(ROW_COUNT);
  });

  it('段ごとに狙いを変えて 5 回弾くとあたりまで行ける', () => {
    const run = makeCoin();
    resetToEntry(run);
    let flicks = 0;
    let won = false;
    for (let i = 0; i < 60 * 120; i++) {
      if (run.phase === 'ready' && flicks < ROW_COUNT) {
        flickCoin(run, mid(bands[run.laneIndex]!));
        flicks++;
        continue;
      }
      const r = stepCoin(run, DT);
      if (r.won) {
        won = true;
        break;
      }
      if (r.lost) break;
    }
    expect(flicks).toBe(ROW_COUNT);
    expect(won).toBe(true);
  });
});

// ---------------------------------------------------------------- 安全性

describe('安全性', () => {
  /** 多角形近似なので、面で接するときの実効半径は内接円 */
  const HIT_R = COIN_R * Math.cos(Math.PI / COIN_SIDES);

  it('投入しただけでは落ちず、必ずレバーで構える', () => {
    const coin = makeCoin();
    resetToEntry(coin);
    let ready = false;
    for (let i = 0; i < 60 * 8; i++) {
      const r = stepCoin(coin, DT);
      expect(r.enteredBin).toBeNull();
      if (r.becameReady) {
        ready = true;
        break;
      }
    }
    expect(ready).toBe(true);
    expect(depthOf(coin)).toBe(1);
  });

  it('どの引き量でもコインが盤面から出ず、座標が壊れない', () => {
    const coin = makeCoin();
    for (const d of Object.values(DIFFICULTIES)) {
      for (let i = 0; i <= 12; i++) {
        for (let lane = 0; lane < ROW_COUNT; lane++) {
          placeReady(coin, lane);
          flickCoin(coin, pullToPower(i / 12, d.powerMax));
          for (let f = 0; f < 60 * 12; f++) {
            const r = stepCoin(coin, DT);
            expect(Number.isFinite(coin.pos.x)).toBe(true);
            expect(Number.isFinite(coin.pos.y)).toBe(true);
            expect(coin.pos.x - HIT_R).toBeGreaterThanOrEqual(BOARD_LEFT - 0.1);
            expect(coin.pos.x + HIT_R).toBeLessThanOrEqual(BOARD_RIGHT + 0.1);
            expect(coin.pos.y - HIT_R).toBeGreaterThanOrEqual(BOARD_TOP - 0.1);
            expect(coin.pos.y + HIT_R).toBeLessThanOrEqual(BOARD_BOTTOM + 0.1);
            if (r.enteredBin || r.becameReady) break;
          }
        }
      }
    }
  });
});
