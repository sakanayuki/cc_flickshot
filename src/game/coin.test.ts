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
  MAX_REACH,
  P_MAX,
  P_MIN,
  ROW_COUNT,
  SOLID_RUN,
  type DifficultyConfig,
} from '../config.ts';
import {
  buildLanes,
  buildWinPocket,
  ENTRY_U,
  GAP_END_U,
  LANE_LENGTH,
  laneProject,
  maxLandingU,
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

type Outcome = 'weak' | 'through' | 'strong' | 'idle' | 'hung';

function makeCoin(d: DifficultyConfig): CoinState {
  const lanes = buildLanes(d);
  return createCoin(lanes, buildWinPocket(lanes));
}

function fire(coin: CoinState, lane: number, power: number): Outcome {
  placeReady(coin, lane);
  flickCoin(coin, power);
  for (let i = 0; i < 60 * 15; i++) {
    const r = stepCoin(coin, DT);
    if (r.lost) return r.lost;
    if (r.droppedThrough) return 'through';
    if (r.becameReady) return 'idle';
  }
  return 'hung';
}

/** 成功域の下端・上端を二分探索する */
function band(coin: CoinState, lane: number): { from: number; to: number } {
  const edge = (lo: number, hi: number, isLow: (o: Outcome) => boolean) => {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (isLow(fire(coin, lane, mid))) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const from = edge(120, 1600, (o) => o !== 'through' && o !== 'strong');
  const to = edge(from, 1600, (o) => o === 'through');
  return { from, to };
}

// ---------------------------------------------------------------- 盤面

describe('盤面の幾何', () => {
  const lanes = buildLanes(DIFFICULTIES.easy);

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

  it('5 段が合同(長さ・傾き・穴の位置がすべて同じ)', () => {
    const b = lanes[0]!;
    for (const l of lanes.slice(1)) {
      expect(l.length).toBeCloseTo(b.length, 9);
      expect(l.slope).toBeCloseTo(b.slope, 9);
      expect(l.nearHole).toEqual(b.nearHole);
      expect(l.gap).toEqual(b.gap);
      expect(l.farHole).toEqual(b.farHole);
    }
  });

  it('床はレール 1 本だけで、その先は落とし口', () => {
    for (const l of lanes) {
      expect(l.solids).toHaveLength(1);
      expect(l.solids[0]).toEqual({ from: 0, to: SOLID_RUN });
      expect(l.nearHole.from).toBe(SOLID_RUN);
      expect(l.farHole.to).toBeCloseTo(LANE_LENGTH, 9);
    }
  });

  it('隙間の終わりはレールの端から MAX_REACH', () => {
    expect(GAP_END_U).toBe(SOLID_RUN + MAX_REACH);
  });

  it('落ちたコインが段のあいだを通れるだけの空きがある', () => {
    expect(ROW_CLEARANCE).toBeGreaterThan(ROW_CLEARANCE_NEEDED);
  });

  it('コインの多角形の辺の数が偶数(当たり判定が左右対称)', () => {
    expect(COIN_SIDES % 2).toBe(0);
  });

  it('投入位置と着地点はどちらもレールの上', () => {
    expect(ENTRY_U).toBeLessThan(SOLID_RUN - COIN_R);
    for (const d of Object.values(DIFFICULTIES)) {
      expect(maxLandingU(d)).toBeLessThan(SOLID_RUN - COIN_R);
    }
  });

  it('難易度は手前の穴の幅だけが違う', () => {
    const e = buildLanes(DIFFICULTIES.easy)[0]!;
    const n = buildLanes(DIFFICULTIES.normal)[0]!;
    expect(n.nearHole.to).toBeGreaterThan(e.nearHole.to);
    expect(n.gap.to).toBe(e.gap.to);
    expect(n.length).toBe(e.length);
  });
});

// ---------------------------------------------------------------- 弾く

describe('弾く', () => {
  it('構えているコインだけ弾ける', () => {
    const coin = makeCoin(DIFFICULTIES.easy);
    resetToEntry(coin);
    expect(canFlick(coin)).toBe(false);
    expect(flickCoin(coin, 800)).toBe(false);
    placeReady(coin, 0);
    expect(canFlick(coin)).toBe(true);
    expect(flickCoin(coin, 800)).toBe(true);
  });

  it('弾くと斜面に沿った初速になり、レーンを登る', () => {
    const coin = makeCoin(DIFFICULTIES.easy);
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
    const coin = makeCoin(DIFFICULTIES.easy);
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

  it('引き量 0..1 が P_MIN..P_MAX に対応する', () => {
    expect(pullToPower(0)).toBe(P_MIN);
    expect(pullToPower(1)).toBe(P_MAX);
    expect(pullToPower(0.5)).toBeCloseTo((P_MIN + P_MAX) / 2, 6);
  });
});

// ---------------------------------------------------------------- 成功域

describe('弾く力と結果の対応', () => {
  for (const d of Object.values(DIFFICULTIES)) {
    describe(d.label, () => {
      const coin = makeCoin(d);
      const b = band(coin, 0);

      it('弱すぎると手前の穴に落ちる', () => {
        expect(fire(coin, 0, b.from - 30)).toBe('weak');
        expect(fire(coin, 0, P_MIN)).toBe('weak');
      });

      it('ちょうどだと隙間から落ちる', () => {
        expect(fire(coin, 0, (b.from + b.to) / 2)).toBe('through');
      });

      it('強すぎると奥の穴に落ちる', () => {
        expect(fire(coin, 0, b.to + 30)).toBe('strong');
        expect(fire(coin, 0, P_MAX)).toBe('strong');
      });

      it('成功域がストロークの中にあり、両側に失敗が残っている', () => {
        expect(b.from).toBeGreaterThan(P_MIN);
        expect(b.to).toBeLessThan(P_MAX);
      });

      it('弾いても何も起きない「空振り」がストローク上に無い', () => {
        for (let i = 0; i <= 40; i++) {
          expect(fire(coin, 0, pullToPower(i / 40))).not.toBe('idle');
        }
      });

      it('どの引き量でも必ず決着する', () => {
        for (let i = 0; i <= 40; i++) {
          expect(fire(coin, 0, pullToPower(i / 40))).not.toBe('hung');
        }
      });

      it('弱すぎ → 成功 → 強すぎ が 1 区間ずつ並ぶ(飛び地が無い)', () => {
        const runs: Outcome[] = [];
        for (let i = 0; i <= 80; i++) {
          const o = fire(coin, 0, pullToPower(i / 80));
          if (o !== runs[runs.length - 1]) runs.push(o);
        }
        expect(runs).toEqual(['weak', 'through', 'strong']);
      });

      it('5 段とも同じ引き方で通る', () => {
        const mid = (b.from + b.to) / 2;
        for (let lane = 0; lane < ROW_COUNT; lane++) {
          expect(fire(coin, lane, mid)).toBe('through');
        }
      });
    });
  }

  it('やさしいの成功域は ほんき より広い', () => {
    const e = band(makeCoin(DIFFICULTIES.easy), 0);
    const n = band(makeCoin(DIFFICULTIES.normal), 0);
    expect(e.to - e.from).toBeGreaterThan(n.to - n.from);
  });
});

// ---------------------------------------------------------------- 段の移り

describe('隙間から落ちて 1 段下へ', () => {
  const coin = makeCoin(DIFFICULTIES.easy);
  const b = band(coin, 0);
  const mid = (b.from + b.to) / 2;

  it('落ちたあと 1 段下のレーンに乗り、レバーで構える', () => {
    placeReady(coin, 0);
    flickCoin(coin, mid);
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

  it('着地するのは手前の穴より低い側(自分から落ちない)', () => {
    placeReady(coin, 0);
    flickCoin(coin, mid);
    for (let i = 0; i < 60 * 10; i++) {
      const r = stepCoin(coin, DT);
      if (r.landed) {
        const u = laneProject(coin.lanes[1]!, coin.pos).u;
        expect(u).toBeLessThan(SOLID_RUN - COIN_R);
        return;
      }
    }
    throw new Error('着地しなかった');
  });

  it('落ちているあいだは画面の下向きに落ちる', () => {
    placeReady(coin, 0);
    flickCoin(coin, mid);
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

  it('最下段の隙間はあたりになる', () => {
    placeReady(coin, ROW_COUNT - 1);
    flickCoin(coin, mid);
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

  it('成功域の中央で 5 回弾くとあたりまで行ける', () => {
    const run = makeCoin(DIFFICULTIES.easy);
    resetToEntry(run);
    let flicks = 0;
    let won = false;
    for (let i = 0; i < 60 * 90; i++) {
      if (run.phase === 'ready' && flicks < ROW_COUNT) {
        flickCoin(run, mid);
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
  it('投入しただけでは落ちず、必ずレバーで構える', () => {
    for (const d of Object.values(DIFFICULTIES)) {
      const coin = makeCoin(d);
      resetToEntry(coin);
      let ready = false;
      for (let i = 0; i < 60 * 8; i++) {
        const r = stepCoin(coin, DT);
        expect(r.lost).toBeNull();
        expect(r.droppedThrough).toBe(false);
        if (r.becameReady) {
          ready = true;
          break;
        }
      }
      expect(ready).toBe(true);
      expect(depthOf(coin)).toBe(1);
    }
  });

  it('どの引き量でもコインが盤面から出ず、座標が壊れない', () => {
    for (const d of Object.values(DIFFICULTIES)) {
      const coin = makeCoin(d);
      for (let i = 0; i <= 20; i++) {
        for (let lane = 0; lane < ROW_COUNT; lane++) {
          placeReady(coin, lane);
          flickCoin(coin, pullToPower(i / 20));
          for (let f = 0; f < 60 * 12; f++) {
            const r = stepCoin(coin, DT);
            expect(Number.isFinite(coin.pos.x)).toBe(true);
            expect(Number.isFinite(coin.pos.y)).toBe(true);
            expect(coin.pos.x - COIN_R).toBeGreaterThanOrEqual(BOARD_LEFT - 0.5);
            expect(coin.pos.x + COIN_R).toBeLessThanOrEqual(BOARD_RIGHT + 0.5);
            expect(coin.pos.y - COIN_R).toBeGreaterThanOrEqual(BOARD_TOP - 0.5);
            expect(coin.pos.y - COIN_R).toBeLessThanOrEqual(BOARD_BOTTOM + 0.5);
            if (r.lost || r.droppedThrough || r.becameReady) break;
          }
        }
      }
    }
  });
});
