/**
 * レーンと物理のテスト。
 *
 * このゲームは「適切な力で弾いたときだけ隙間から落ちて次の段へ進める」ことが
 * すべてなので、成功域の広さと、強すぎ・弱すぎの両方で落ちることを直接テストしている。
 *
 * 摩擦を入れていないので、成功する初速は閉じた式で書ける(`successPowerBand`)。
 * その式と実物理が一致していることも突き合わせる。片方だけ壊れても気づけるように。
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
  HOLE_NEAR_U,
  LANE_W,
  P_MAX,
  P_MIN,
  PULL_DEADZONE,
  ROW_COUNT,
  type DifficultyConfig,
} from '../config.ts';
import {
  buildLanes,
  buildWinPocket,
  landingURange,
  posOnLane,
  successPowerBand,
} from './board.ts';
import {
  ENTRY_U,
  canFlick,
  createCoin,
  depthOf,
  flickCoin,
  placeAtLever,
  placeAtStart,
  stepCoin,
  type Coin,
} from './coin.ts';

const EASY = DIFFICULTIES.easy;
const NORMAL = DIFFICULTIES.normal;

type Outcome = 'win' | 'next' | 'weak' | 'strong' | 'back' | 'stuck';

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
    if (r.heldOnLane === laneIndex) return 'back';
    if (r.heldOnLane !== null) return 'next';
  }
  return 'stuck';
}

function scanBand(d: DifficultyConfig, laneIndex: number) {
  const ok: number[] = [];
  let total = 0;
  let weak = 0;
  let strong = 0;
  let back = 0;
  const step = 0.005;
  for (let pull = PULL_DEADZONE; pull <= 1.0001; pull += step) {
    total++;
    const out = simulate(d, laneIndex, P_MIN + (P_MAX - P_MIN) * pull);
    if (out === 'win' || out === 'next') ok.push(pull);
    else if (out === 'weak') weak++;
    else if (out === 'strong') strong++;
    else back++;
  }
  let gaps = 0;
  for (let i = 1; i < ok.length; i++) if (ok[i]! - ok[i - 1]! > step * 1.5) gaps++;
  return { frac: ok.length / total, gaps, weak, strong, back };
}

const LANES = [0, 1, 2, 3, 4];

/** 成功域のまんなかの弾き力。定数を動かしても常に成功する */
function midPower(d: DifficultyConfig): number {
  const b = successPowerBand(d, HOLE_CATCH_SPEED);
  return (b.from + b.to) / 2;
}

// ---------------------------------------------------------------- レーン

describe('レーンの形', () => {
  it.each([EASY, NORMAL])('$label: レーンがななめ上向き', (d) => {
    for (const lane of buildLanes(d)) {
      // 高い端の方が画面の上にある = 登り坂
      expect(lane.high.y).toBeLessThan(lane.low.y);
      expect(lane.dir.y).toBeLessThan(0);
      // 斜面に沿った減速は重力の斜面成分
      expect(lane.decel).toBeGreaterThan(0);
    }
  });

  it.each([EASY, NORMAL])('$label: レーンが盤面に収まる', (d) => {
    for (const lane of buildLanes(d)) {
      for (let u = 0; u <= lane.length; u += 4) {
        const p = posOnLane(lane, u);
        expect(p.x).toBeGreaterThanOrEqual(BOARD_LEFT + COIN_R);
        expect(p.x).toBeLessThanOrEqual(BOARD_RIGHT - COIN_R);
        expect(p.y).toBeGreaterThanOrEqual(BOARD_TOP + COIN_R);
        expect(p.y).toBeLessThanOrEqual(BOARD_BOTTOM - COIN_R);
      }
    }
  });

  // 発注者の要望:弾く点は画面中央ではなく左右の画面端にあること
  it.each([EASY, NORMAL])('$label: レバー(低い端)が画面の端にあり左右交互', (d) => {
    const lanes = buildLanes(d);
    const boardW = BOARD_RIGHT - BOARD_LEFT;
    expect(lanes.map((l) => l.side)).toEqual(['right', 'left', 'right', 'left', 'right']);
    for (const lane of lanes) {
      const toWall = lane.side === 'left' ? lane.low.x - BOARD_LEFT : BOARD_RIGHT - lane.low.x;
      expect(toWall).toBeLessThanOrEqual(boardW * 0.2);
    }
  });

  it.each([EASY, NORMAL])('$label: 手前の穴・隙間・奥の穴がこの順に並ぶ', (d) => {
    for (const lane of buildLanes(d)) {
      expect(lane.nearHole.from).toBeGreaterThan(0);
      expect(lane.nearHole.to).toBeLessThan(lane.gap.from);
      expect(lane.gap.to).toBeLessThanOrEqual(lane.farHole.from);
      expect(lane.farHole.to).toBeCloseTo(lane.length, 6);
    }
  });

  it.each([EASY, NORMAL])('$label: 5つの操作の条件が完全に同じ', (d) => {
    const lanes = buildLanes(d);
    for (const lane of lanes) {
      expect(lane.length).toBeCloseTo(lanes[0]!.length, 6);
      expect(lane.decel).toBeCloseTo(lanes[0]!.decel, 6);
      expect(lane.nearHole).toEqual(lanes[0]!.nearHole);
      expect(lane.gap).toEqual(lanes[0]!.gap);
    }
  });

  // 落ちた先が手前の穴より奥だと、着地したコインが滑り降りる途中で自分から落ちる
  it.each([EASY, NORMAL])('$label: 隙間から落ちた先が手前の穴より低い側', (d) => {
    expect(landingURange(d).to).toBeLessThan(HOLE_NEAR_U);
    expect(ENTRY_U).toBeLessThan(HOLE_NEAR_U);
  });

  it.each([EASY, NORMAL])('$label: 穴も隙間もコインより広い', (d) => {
    const lane = buildLanes(d)[0]!;
    expect(d.nearHoleSpan).toBeGreaterThanOrEqual(COIN_R * 2);
    expect(lane.gap.to - lane.gap.from).toBeGreaterThanOrEqual(COIN_R * 2);
    expect(lane.farHole.to - lane.farHole.from).toBeGreaterThanOrEqual(COIN_R * 2);
  });

  it('やさしいの手前の穴はふつうより短い', () => {
    expect(EASY.nearHoleSpan).toBeLessThan(NORMAL.nearHoleSpan);
  });

  it('レーンはコインより広い', () => {
    expect(LANE_W).toBeGreaterThan(COIN_R * 2);
  });
});

// ---------------------------------------------------------------- 弾く

describe('弾く', () => {
  it('レバーで止まっているコインは弾ける', () => {
    const lanes = buildLanes(EASY);
    const c = createCoin();
    placeAtLever(c, lanes, 0);
    expect(canFlick(c)).toBe(true);
  });

  it('動いている最中のコインは弾けない', () => {
    const lanes = buildLanes(EASY);
    const c = createCoin();
    placeAtLever(c, lanes, 0);
    flickCoin(c, midPower(EASY));
    expect(canFlick(c)).toBe(false);
    expect(flickCoin(c, 400)).toBe(false);
  });

  it('弾くと斜面に沿った初速になり、レーンを登る', () => {
    const lanes = buildLanes(EASY);
    const pocket = buildWinPocket(EASY);
    const c = createCoin();
    placeAtLever(c, lanes, 0);
    flickCoin(c, 420);
    expect(c.v).toBe(420);
    expect(c.state).toBe('onLane');
    // 登る = u が増え、画面上では上へ進む
    const y0 = c.pos.y;
    for (let i = 0; i < 10; i++) stepCoin(c, FIXED_DT, lanes, pocket);
    expect(c.u).toBeGreaterThan(0);
    expect(c.pos.y).toBeLessThan(y0);
  });

  it('重力の斜面成分で減速する', () => {
    const lanes = buildLanes(EASY);
    const pocket = buildWinPocket(EASY);
    const c = createCoin();
    placeAtLever(c, lanes, 0);
    flickCoin(c, 460);
    let prev = c.v;
    for (let i = 0; i < 20; i++) {
      stepCoin(c, FIXED_DT, lanes, pocket);
      expect(c.v).toBeLessThan(prev);
      prev = c.v;
    }
  });

  it('登っているあいだコインはレーンの上から離れない', () => {
    const lanes = buildLanes(EASY);
    const pocket = buildWinPocket(EASY);
    const c = createCoin();
    placeAtLever(c, lanes, 0);
    flickCoin(c, midPower(EASY));
    for (let i = 0; i < 200; i++) {
      stepCoin(c, FIXED_DT, lanes, pocket);
      if (c.state !== 'onLane') break;
      const on = posOnLane(lanes[c.laneIndex]!, c.u);
      expect(Math.hypot(c.pos.x - on.x, c.pos.y - on.y)).toBeLessThan(0.001);
    }
  });
});

// ---------------------------------------------------------------- 進む

describe('隙間から落ちて次の段へ', () => {
  it.each([EASY, NORMAL])('$label: 投入後は 1 段目のレバーまで滑って止まる', (d) => {
    const lanes = buildLanes(d);
    const pocket = buildWinPocket(d);
    const c = createCoin();
    placeAtStart(c, lanes);
    for (let i = 0; i < 900; i++) {
      expect(stepCoin(c, FIXED_DT, lanes, pocket).lost).toBeNull();
    }
    expect(c.state).toBe('onLane');
    expect(c.held).toBe(true);
    expect(c.laneIndex).toBe(0);
    expect(c.u).toBe(0);
    expect(canFlick(c)).toBe(true);
  });

  it('適切な力で弾くと隙間から落ちて 1 段下のレバーで止まる', () => {
    const lanes = buildLanes(EASY);
    const pocket = buildWinPocket(EASY);
    const c = createCoin();
    placeAtLever(c, lanes, 0);
    flickCoin(c, midPower(EASY));

    let dropped = false;
    let landed = false;
    let held = false;
    for (let i = 0; i < 900; i++) {
      const r = stepCoin(c, FIXED_DT, lanes, pocket);
      expect(r.lost).toBeNull();
      if (r.droppedThrough) dropped = true;
      if (r.landedOnLane !== null) landed = true;
      if (r.heldOnLane !== null) {
        held = true;
        break;
      }
    }
    expect(dropped).toBe(true); // 隙間から落ちた
    expect(landed).toBe(true); // 1 段下のレーンに乗った
    expect(held).toBe(true); // 滑り降りてレバーで止まった
    expect(c.laneIndex).toBe(1);
    expect(c.u).toBe(0);
    expect(depthOf(c)).toBe(2);
  });

  it('落ちているあいだは画面下向きの重力で落ちる', () => {
    const lanes = buildLanes(EASY);
    const pocket = buildWinPocket(EASY);
    const c = createCoin();
    placeAtLever(c, lanes, 0);
    flickCoin(c, midPower(EASY));
    let sawDrop = false;
    for (let i = 0; i < 900; i++) {
      const wasDropping = c.state === 'dropping';
      const before = c.pos.y;
      stepCoin(c, FIXED_DT, lanes, pocket);
      if (wasDropping && c.state === 'dropping') {
        sawDrop = true;
        expect(c.pos.y).toBeGreaterThan(before); // 下へ落ちている
        expect(c.vel.y).toBeGreaterThan(0);
      }
      if (c.state === 'onLane' && sawDrop) break;
    }
    expect(sawDrop).toBe(true);
  });
});

// ---------------------------------------------------------------- 成功域

describe('成功域(ゲームの根幹)', () => {
  it.each([EASY, NORMAL])('$label: 閉じた式と実物理が一致する', (d) => {
    const b = successPowerBand(d, HOLE_CATCH_SPEED);
    expect(simulate(d, 0, b.from - 4)).toBe('weak');
    expect(simulate(d, 0, b.from + 4)).not.toBe('weak');
    expect(simulate(d, 0, b.to - 4)).not.toBe('strong');
    expect(simulate(d, 0, b.to + 4)).toBe('strong');
  });

  it.each(LANES)('やさしい 段%i: 成功域が 60% 以上で連続している', (i) => {
    const b = scanBand(EASY, i);
    expect(b.frac).toBeGreaterThanOrEqual(0.6);
    expect(b.gaps).toBe(0);
  });

  it.each(LANES)('ふつう 段%i: 成功域が 30〜50%', (i) => {
    const b = scanBand(NORMAL, i);
    expect(b.frac).toBeGreaterThanOrEqual(0.3);
    expect(b.frac).toBeLessThanOrEqual(0.5);
    expect(b.gaps).toBe(0);
  });

  it.each([EASY, NORMAL])('$label: どの段でも強すぎ・弱すぎの両方で落ちる', (d) => {
    for (const i of LANES) {
      const b = scanBand(d, i);
      expect(b.weak, `段${i + 1} の弱すぎ`).toBeGreaterThan(0);
      expect(b.strong, `段${i + 1} の強すぎ`).toBeGreaterThan(0);
    }
  });

  // 「弾いたのに何も起きずレバーに戻る」は3歳児には理由が分からない
  it.each([EASY, NORMAL])('$label: 空振りするパワーが無い', (d) => {
    for (const i of LANES) expect(scanBand(d, i).back).toBe(0);
  });

  it('やさしいの方がふつうより成功域が広い', () => {
    for (const i of LANES) {
      expect(scanBand(EASY, i).frac).toBeGreaterThan(scanBand(NORMAL, i).frac);
    }
  });

  it('弱く弾くと手前の穴、強く弾くと奥の穴に落ちる', () => {
    expect(simulate(EASY, 0, P_MIN)).toBe('weak');
    expect(simulate(EASY, 0, P_MAX)).toBe('strong');
  });

  it('最下段から適切に弾くとあたりの口に入る', () => {
    expect(simulate(EASY, ROW_COUNT - 1, midPower(EASY))).toBe('win');
  });
});

// ---------------------------------------------------------------- 頑健性

describe('頑健性', () => {
  it.each([EASY, NORMAL])('$label: u と v が壊れない', (d) => {
    const lanes = buildLanes(d);
    const pocket = buildWinPocket(d);
    for (const i of LANES) {
      for (let power = P_MIN; power <= P_MAX; power += 10) {
        const c = createCoin();
        placeAtLever(c, lanes, i);
        flickCoin(c, power);
        for (let k = 0; k < 900; k++) {
          stepCoin(c, FIXED_DT, lanes, pocket);
          expect(Number.isFinite(c.u) && Number.isFinite(c.v)).toBe(true);
          expect(c.pos.x).toBeGreaterThanOrEqual(BOARD_LEFT);
          expect(c.pos.x).toBeLessThanOrEqual(BOARD_RIGHT);
          if (c.state === 'lost' || c.state === 'win') break;
        }
      }
    }
  });

  it('状態は常に 4 つのいずれか', () => {
    const lanes = buildLanes(NORMAL);
    const pocket = buildWinPocket(NORMAL);
    const valid = new Set<Coin['state']>(['onLane', 'dropping', 'lost', 'win']);
    const c = createCoin();
    placeAtStart(c, lanes);
    for (let i = 0; i < 2000; i++) {
      stepCoin(c, FIXED_DT, lanes, pocket);
      expect(valid.has(c.state)).toBe(true);
    }
  });

  it('到達段数は前へしか進まない', () => {
    const lanes = buildLanes(EASY);
    const pocket = buildWinPocket(EASY);
    const c = createCoin();
    placeAtStart(c, lanes);
    let deepest = 1;
    for (let i = 0; i < 900; i++) {
      stepCoin(c, FIXED_DT, lanes, pocket);
      expect(depthOf(c)).toBeGreaterThanOrEqual(deepest);
      deepest = depthOf(c);
    }
  });
});
