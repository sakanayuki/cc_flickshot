/**
 * レーンと物理のテスト。
 *
 * このゲームは「適度な強さでだけ次の止まり木にたどり着ける」ことがすべてなので、
 * 成功域の広さと、強すぎ・弱すぎの両方で落ちることを直接テストしている。
 * ここが壊れると座標が正しくても遊べなくなる。
 *
 * コインはレーンに沿った 1 次元でしか動かないので、
 * 「板を貫通する」「盤面の外に出る」といった旧設計の不具合は原理的に起きない。
 * 代わりに「レーンの途中で永久に止まって詰む」ことがないかを見る。
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  DIFFICULTIES,
  FIXED_DT,
  HOLE_CATCH_SPEED,
  LANE_CREEP,
  LANE_W,
  P_MAX,
  P_MIN,
  PULL_DEADZONE,
  ROW_COUNT,
  STOP_HOLD_SPEED,
  type DifficultyConfig,
} from '../config.ts';
import { buildLane, holeAt, posAt, runUpLength, turnOuterMargin } from './board.ts';
import {
  canFlick,
  createCoin,
  flickCoin,
  placeAtStart,
  placeAtStop,
  runIndexOf,
  stepCoin,
  type Coin,
} from './coin.ts';

const EASY = DIFFICULTIES.easy;
const NORMAL = DIFFICULTIES.normal;

type Outcome = 'win' | 'held' | 'weak' | 'strong' | 'stuck';

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

function scanBand(d: DifficultyConfig, stopIndex: number) {
  const ok: number[] = [];
  let total = 0;
  let weak = 0;
  let strong = 0;
  const step = 0.005;
  for (let pull = PULL_DEADZONE; pull <= 1.0001; pull += step) {
    total++;
    const out = simulate(d, stopIndex, P_MIN + (P_MAX - P_MIN) * pull);
    if (out === 'win' || out === 'held') ok.push(pull);
    else if (out === 'weak') weak++;
    else if (out === 'strong') strong++;
  }
  let gaps = 0;
  for (let i = 1; i < ok.length; i++) if (ok[i]! - ok[i - 1]! > step * 1.5) gaps++;
  return { frac: ok.length / total, gaps, weak, strong };
}

const STOPS = [0, 1, 2, 3, 4];

/** ストローク中央の弾き力。定数を動かしても常に成功域の内側に入る */
const midPower = () => P_MIN + (P_MAX - P_MIN) * 0.55;

// ---------------------------------------------------------------- レーン

describe('レーンの形', () => {
  it.each([EASY, NORMAL])('$label: レーン全体が盤面に収まる', (d) => {
    const lane = buildLane(d);
    for (let s = 0; s <= lane.length; s += 4) {
      const p = posAt(lane, s);
      expect(p.x).toBeGreaterThanOrEqual(BOARD_LEFT + COIN_R);
      expect(p.x).toBeLessThanOrEqual(BOARD_RIGHT - COIN_R);
      expect(p.y).toBeGreaterThanOrEqual(BOARD_TOP + COIN_R);
      expect(p.y).toBeLessThanOrEqual(BOARD_BOTTOM - COIN_R);
    }
  });

  it.each([EASY, NORMAL])('$label: レーンは 1 本につながっている', (d) => {
    const lane = buildLane(d);
    // 折れ線の頂点どうしが飛んでいない = 経路として連続している
    for (let i = 1; i < lane.pts.length; i++) {
      const gap = Math.hypot(
        lane.pts[i]!.x - lane.pts[i - 1]!.x,
        lane.pts[i]!.y - lane.pts[i - 1]!.y,
      );
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(BOARD_RIGHT - BOARD_LEFT);
    }
    expect(lane.cum).toHaveLength(lane.pts.length);
    expect(lane.length).toBeCloseTo(lane.cum[lane.cum.length - 1]!, 6);
  });

  // 発注者の要望:弾く点は画面中央ではなく左右の画面端にあること
  it.each([EASY, NORMAL])('$label: 止まり木が画面の左右の端にある', (d) => {
    const lane = buildLane(d);
    const boardW = BOARD_RIGHT - BOARD_LEFT;
    expect(lane.stops).toHaveLength(ROW_COUNT);
    for (const stop of lane.stops) {
      const toWall =
        stop.side === 'left' ? stop.pos.x - BOARD_LEFT : BOARD_RIGHT - stop.pos.x;
      expect(toWall).toBeLessThanOrEqual(boardW * 0.2);
    }
  });

  it.each([EASY, NORMAL])('$label: 止まり木が左右交互に並ぶ', (d) => {
    expect(buildLane(d).stops.map((s) => s.side)).toEqual([
      'left',
      'right',
      'left',
      'right',
      'left',
    ]);
  });

  it.each([EASY, NORMAL])('$label: U ターンが壁に食い込まない', () => {
    expect(turnOuterMargin()).toBeGreaterThanOrEqual(0);
  });

  it.each([EASY, NORMAL])('$label: 5つの操作がすべて同じ条件', (d) => {
    const lane = buildLane(d);
    const shape = STOPS.map((k) => {
      const from = lane.stops[k]!.s;
      const hole = lane.holes[k]!;
      const to = k + 1 < ROW_COUNT ? lane.stops[k + 1]!.s : lane.goalS;
      return [hole.s0 - from, hole.s1 - hole.s0, to - hole.s1];
    });
    for (const x of shape) {
      expect(x[0]).toBeCloseTo(shape[0]![0]!, 6);
      expect(x[1]).toBeCloseTo(shape[0]![1]!, 6);
      expect(x[2]).toBeCloseTo(shape[0]![2]!, 6);
    }
  });

  // 1 本目の走路に穴があると、投入しただけで没収されてしまう
  it.each([EASY, NORMAL])('$label: 1 つ目の止まり木より手前に穴が無い', (d) => {
    const lane = buildLane(d);
    for (const h of lane.holes) expect(h.s0).toBeGreaterThan(lane.stops[0]!.s);
  });

  it.each([EASY, NORMAL])('$label: 穴のあとに助走がある', (d) => {
    const lane = buildLane(d);
    for (const k of STOPS) expect(runUpLength(lane, k)).toBeGreaterThan(COIN_R * 2);
  });

  it.each([EASY, NORMAL])('$label: 穴の丸が区間を隙間なく埋めている', (d) => {
    for (const h of buildLane(d).holes) {
      const covered = h.circles.reduce((a, c) => a + c.r * 2, 0);
      expect(covered).toBeGreaterThanOrEqual((h.s1 - h.s0) * 0.98);
      for (const c of h.circles) expect(c.r).toBeGreaterThan(0);
    }
  });

  it.each([EASY, NORMAL])('$label: あたりの口の先にも穴がある(乗り越え用)', (d) => {
    const lane = buildLane(d);
    expect(lane.holes.some((h) => h.s0 > lane.goalS)).toBe(true);
  });

  it('やさしいの穴はふつうより短い', () => {
    expect(EASY.holeSpan).toBeLessThan(NORMAL.holeSpan);
  });

  it('レーンはコインより広い', () => {
    expect(LANE_W).toBeGreaterThan(COIN_R * 2);
  });
});

// ---------------------------------------------------------------- 弾く

describe('弾く', () => {
  it('止まり木のコインは弾ける', () => {
    const lane = buildLane(EASY);
    const c = createCoin();
    placeAtStop(c, lane, 0);
    expect(canFlick(c)).toBe(true);
  });

  it('走っている最中のコインは弾けない', () => {
    const lane = buildLane(EASY);
    const c = createCoin();
    placeAtStop(c, lane, 0);
    flickCoin(c, midPower());
    expect(canFlick(c)).toBe(false);
    expect(flickCoin(c, 600)).toBe(false);
  });

  it('弾くとレーンに沿った速さになる(飛ばない)', () => {
    const lane = buildLane(EASY);
    const c = createCoin();
    placeAtStop(c, lane, 0);
    flickCoin(c, 800);
    expect(c.v).toBe(800);
    expect(c.held).toBe(false);
    // 状態は onLane のまま。空中状態は存在しない
    expect(c.state).toBe('onLane');
  });

  it('走り出したコインはレーンの上から離れない', () => {
    const lane = buildLane(EASY);
    const c = createCoin();
    placeAtStop(c, lane, 0);
    flickCoin(c, P_MAX);
    for (let i = 0; i < 400; i++) {
      stepCoin(c, FIXED_DT, lane);
      if (c.state !== 'onLane') break;
      const onPath = posAt(lane, c.s);
      expect(Math.hypot(c.pos.x - onPath.x, c.pos.y - onPath.y)).toBeLessThan(0.001);
    }
  });

  it('コインは後戻りしない', () => {
    const lane = buildLane(NORMAL);
    const c = createCoin();
    placeAtStop(c, lane, 0);
    flickCoin(c, midPower());
    let prev = c.s;
    for (let i = 0; i < 600; i++) {
      stepCoin(c, FIXED_DT, lane);
      expect(c.s).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = c.s;
    }
  });
});

// ---------------------------------------------------------------- 走り

describe('レーンの上を走る', () => {
  it.each([EASY, NORMAL])('$label: 投入後は 1 つ目の止まり木まで走って止まる', (d) => {
    const lane = buildLane(d);
    const c = createCoin();
    placeAtStart(c, lane);
    for (let i = 0; i < 900; i++) {
      expect(stepCoin(c, FIXED_DT, lane).fellInHole).toBeNull();
    }
    expect(c.state).toBe('onLane');
    expect(c.held).toBe(true);
    expect(c.stopIndex).toBe(0);
    expect(c.s).toBeCloseTo(lane.stops[0]!.s, 6);
    expect(canFlick(c)).toBe(true);
  });

  it('ちょうどよい強さで弾くと次の止まり木で止まる', () => {
    const lane = buildLane(EASY);
    const c = createCoin();
    placeAtStop(c, lane, 0);
    flickCoin(c, midPower());
    let held = -1;
    for (let i = 0; i < 900 && held < 0; i++) {
      const r = stepCoin(c, FIXED_DT, lane);
      if (r.heldAtStop !== null) held = r.heldAtStop;
      expect(r.fellInHole).toBeNull();
    }
    expect(held).toBe(1);
    expect(c.s).toBeCloseTo(lane.stops[1]!.s, 6);
    expect(c.v).toBe(0);
  });

  it('止まりかけの速さは穴に必ず捕まる(レーン上で永久に止まらない)', () => {
    expect(LANE_CREEP).toBeLessThan(HOLE_CATCH_SPEED);
    expect(LANE_CREEP).toBeLessThan(STOP_HOLD_SPEED);
  });

  it.each([EASY, NORMAL])('$label: どのパワーでも必ず決着する(詰まない)', (d) => {
    for (const k of STOPS) {
      for (let power = P_MIN; power <= P_MAX; power += 25) {
        expect(simulate(d, k, power), `止まり木${k + 1} power=${power}`).not.toBe('stuck');
      }
    }
  });

  it('穴の上を通っても、勢いがあれば落ちない', () => {
    const lane = buildLane(EASY);
    const c = createCoin();
    placeAtStop(c, lane, 0);
    flickCoin(c, midPower());
    let crossedHole = false;
    for (let i = 0; i < 900; i++) {
      const r = stepCoin(c, FIXED_DT, lane);
      if (holeAt(lane, c.s)) crossedHole = true;
      if (r.heldAtStop !== null) break;
      expect(r.fellInHole).toBeNull();
    }
    expect(crossedHole).toBe(true);
  });
});

// ---------------------------------------------------------------- 成功域

describe('成功域(ゲームの根幹)', () => {
  it.each(STOPS)('やさしい %i回目: 成功域が 60% 以上で連続している', (k) => {
    const b = scanBand(EASY, k);
    expect(b.frac).toBeGreaterThanOrEqual(0.6);
    expect(b.gaps).toBe(0);
  });

  it.each(STOPS)('ふつう %i回目: 成功域が 30〜50%', (k) => {
    const b = scanBand(NORMAL, k);
    expect(b.frac).toBeGreaterThanOrEqual(0.3);
    expect(b.frac).toBeLessThanOrEqual(0.5);
    expect(b.gaps).toBe(0);
  });

  it.each([EASY, NORMAL])('$label: どの回でも強すぎ・弱すぎの両方で落ちる', (d) => {
    for (const k of STOPS) {
      const b = scanBand(d, k);
      expect(b.weak, `${k + 1}回目の弱すぎ失敗`).toBeGreaterThan(0);
      expect(b.strong, `${k + 1}回目の強すぎ失敗`).toBeGreaterThan(0);
    }
  });

  it('やさしいの方がふつうより成功域が広い', () => {
    for (const k of STOPS) {
      expect(scanBand(EASY, k).frac).toBeGreaterThan(scanBand(NORMAL, k).frac);
    }
  });

  it('弱く弾くと渡りきれずに穴、強く弾くと止まり木を越えて穴に落ちる', () => {
    expect(simulate(EASY, 0, P_MIN)).toBe('weak');
    expect(simulate(EASY, 0, P_MAX)).toBe('strong');
  });

  it('最後の止まり木から適度に弾くとあたりの口に入る', () => {
    expect(simulate(EASY, ROW_COUNT - 1, midPower())).toBe('win');
  });

  it('強すぎるとあたりの口も乗り越えてしまう', () => {
    expect(simulate(EASY, ROW_COUNT - 1, P_MAX)).toBe('strong');
  });
});

// ---------------------------------------------------------------- 頑健性

describe('頑健性', () => {
  it.each([EASY, NORMAL])('$label: s と v が壊れない', (d) => {
    const lane = buildLane(d);
    for (const k of STOPS) {
      for (let power = P_MIN; power <= P_MAX; power += 25) {
        const c = createCoin();
        placeAtStop(c, lane, k);
        flickCoin(c, power);
        for (let i = 0; i < 600; i++) {
          stepCoin(c, FIXED_DT, lane);
          expect(Number.isFinite(c.s) && Number.isFinite(c.v)).toBe(true);
          expect(c.s).toBeGreaterThanOrEqual(0);
          expect(c.s).toBeLessThanOrEqual(lane.length);
          if (c.state !== 'onLane') break;
        }
      }
    }
  });

  it('状態は常に 3 つのいずれか', () => {
    const lane = buildLane(NORMAL);
    const valid = new Set<Coin['state']>(['onLane', 'falling', 'win']);
    const c = createCoin();
    placeAtStart(c, lane);
    for (let i = 0; i < 2000; i++) {
      stepCoin(c, FIXED_DT, lane);
      expect(valid.has(c.state)).toBe(true);
    }
  });

  it('到達した走路の番号が前へしか進まない', () => {
    const lane = buildLane(EASY);
    const c = createCoin();
    placeAtStart(c, lane);
    let deepest = 0;
    for (let i = 0; i < 900; i++) {
      stepCoin(c, FIXED_DT, lane);
      const r = runIndexOf(lane, c.s);
      expect(r).toBeGreaterThanOrEqual(deepest);
      deepest = r;
    }
  });
});
