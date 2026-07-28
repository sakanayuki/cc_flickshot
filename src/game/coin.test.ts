/**
 * 盤面と物理のテスト。
 *
 * このゲームは「適度な強さでだけ 1 段下の板に乗れる」ことがすべてなので、
 * 成功域の広さと、強すぎ・弱すぎの両方で落ちることを直接テストしている。
 * ここが壊れると盤面の数字が正しくても遊べなくなる。
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  DIFFICULTIES,
  FIXED_DT,
  FLICK_ZONE_PX,
  NEAR_GAP,
  P_MAX,
  P_MIN,
  PULL_DEADZONE,
  ROW_COUNT,
  type DifficultyConfig,
} from '../config.ts';
import {
  buildHoles,
  buildRows,
  buildWinPocket,
  flickDirX,
  notchPos,
  onPlank,
} from './board.ts';
import {
  canFlick,
  createCoin,
  flickCoin,
  placeAtStart,
  placeOnRow,
  stepCoin,
  type Coin,
} from './coin.ts';

const EASY = DIFFICULTIES.easy;
const NORMAL = DIFFICULTIES.normal;

type Outcome = 'win' | 'landed' | 'nearHole' | 'farHole' | 'stuck';

function simulate(d: DifficultyConfig, rowIndex: number, power: number): Outcome {
  const rows = buildRows(d);
  const pocket = buildWinPocket(d);
  const holes = buildHoles(d);
  const coin = createCoin();
  placeOnRow(coin, rows, rowIndex, notchPos(rows[rowIndex]!).x);
  if (!flickCoin(coin, rows, power)) return 'stuck';
  for (let i = 0; i < 900; i++) {
    const r = stepCoin(coin, FIXED_DT, rows, pocket, holes);
    if (r.reachedWin) return 'win';
    if (r.landedOnRow !== null) return 'landed';
    if (r.fellInHole) return r.fellInHole.kind === 'near' ? 'nearHole' : 'farHole';
  }
  return 'stuck';
}

function scanBand(d: DifficultyConfig, rowIndex: number) {
  const ok: number[] = [];
  let total = 0;
  let weak = 0;
  let strong = 0;
  const step = 0.005;
  for (let pull = PULL_DEADZONE; pull <= 1.0001; pull += step) {
    total++;
    const out = simulate(d, rowIndex, P_MIN + (P_MAX - P_MIN) * pull);
    if (out === 'win' || out === 'landed') ok.push(pull);
    else if (out === 'nearHole') weak++;
    else if (out === 'farHole') strong++;
  }
  let gaps = 0;
  for (let i = 1; i < ok.length; i++) if (ok[i]! - ok[i - 1]! > step * 1.5) gaps++;
  return { frac: ok.length / total, gaps, weak, strong };
}

const ROWS = [0, 1, 2, 3, 4];

// ---------------------------------------------------------------- 盤面

describe('盤面の幾何', () => {
  it.each([EASY, NORMAL])('$label: 板が盤面に収まる', (d) => {
    for (const r of buildRows(d)) {
      expect(r.left).toBeGreaterThanOrEqual(BOARD_LEFT);
      expect(r.right).toBeLessThanOrEqual(BOARD_RIGHT);
    }
  });

  it.each([EASY, NORMAL])('$label: 溝が右→左と交互になる', (d) => {
    const sides = buildRows(d).map((r) => r.notchSide);
    expect(sides).toEqual(['right', 'left', 'right', 'left', 'right']);
  });

  it.each([EASY, NORMAL])('$label: 5つの遷移がすべて同じ横距離・落差', (d) => {
    const rows = buildRows(d);
    const pocket = buildWinPocket(d);
    const jumps = rows.map((row, i) => {
      const dir = flickDirX(row);
      const t =
        i + 1 < ROW_COUNT
          ? { near: dir < 0 ? rows[i + 1]!.right : rows[i + 1]!.left, y: rows[i + 1]!.notchY }
          : { near: dir < 0 ? pocket.right : pocket.left, y: pocket.y };
      return [Math.abs(notchPos(row).x - t.near), t.y - row.notchY];
    });
    for (const j of jumps) {
      expect(j[0]).toBeCloseTo(jumps[0]![0]!, 6);
      expect(j[1]).toBeCloseTo(jumps[0]![1]!, 6);
    }
  });

  // 手前の穴が無いと「弱すぎ」で落ちる余地が消える
  it.each([EASY, NORMAL])('$label: 溝と板の間に手前の穴がある', (d) => {
    const rows = buildRows(d);
    const gap = Math.abs(notchPos(rows[0]!).x - rows[1]!.right);
    expect(gap).toBeCloseTo(NEAR_GAP, 6);
    expect(gap).toBeGreaterThan(COIN_R);
  });

  it.each([EASY, NORMAL])('$label: 各段に手前と奥の両方の穴がある', (d) => {
    const holes = buildHoles(d);
    for (let i = 1; i <= ROW_COUNT; i++) {
      const at = holes.filter((h) => h.rowIndex === i);
      expect(at.some((h) => h.kind === 'near')).toBe(true);
      expect(at.some((h) => h.kind === 'far')).toBe(true);
    }
  });

  it('やさしいの板はふつうより広い', () => {
    expect(EASY.plankWidth).toBeGreaterThan(NORMAL.plankWidth);
  });
});

// ---------------------------------------------------------------- 弾く

describe('弾く', () => {
  it('溝にいるコインは弾ける', () => {
    const rows = buildRows(EASY);
    const c = createCoin();
    placeOnRow(c, rows, 0, notchPos(rows[0]!).x);
    expect(canFlick(c, rows)).toBe(true);
  });

  it('溝から離れていると弾けない', () => {
    const rows = buildRows(EASY);
    const c = createCoin();
    const notch = notchPos(rows[0]!);
    placeOnRow(c, rows, 0, notch.x - (FLICK_ZONE_PX + 10));
    expect(canFlick(c, rows)).toBe(false);
    expect(flickCoin(c, rows, 600)).toBe(false);
    expect(c.state).toBe('onPlank');
  });

  it('空中のコインは弾けない', () => {
    const rows = buildRows(EASY);
    const c = createCoin();
    placeOnRow(c, rows, 0, notchPos(rows[0]!).x);
    flickCoin(c, rows, 600);
    expect(c.state).toBe('airborne');
    expect(canFlick(c, rows)).toBe(false);
  });

  it('溝が右の段は左へ、左の段は右へ弾かれる', () => {
    const rows = buildRows(EASY);
    for (const row of rows) {
      const c = createCoin();
      placeOnRow(c, rows, row.index, notchPos(row).x);
      flickCoin(c, rows, 600);
      expect(Math.sign(c.vel.x)).toBe(flickDirX(row));
    }
  });
});

// ---------------------------------------------------------------- 転がり

describe('板の上の転がり', () => {
  it.each([EASY, NORMAL])('$label: 投入後は溝まで転がって止まり、弾ける', (d) => {
    const rows = buildRows(d);
    const pocket = buildWinPocket(d);
    const holes = buildHoles(d);
    const c = createCoin();
    placeAtStart(c, rows);
    for (let i = 0; i < 600; i++) {
      expect(stepCoin(c, FIXED_DT, rows, pocket, holes).fellInHole).toBeNull();
    }
    expect(c.state).toBe('onPlank');
    expect(c.vx).toBe(0);
    expect(c.x).toBeCloseTo(notchPos(rows[0]!).x, 6);
    expect(canFlick(c, rows)).toBe(true);
  });

  it('着地したコインは溝へ向かって転がる', () => {
    const rows = buildRows(EASY);
    const pocket = buildWinPocket(EASY);
    const holes = buildHoles(EASY);
    const c = createCoin();
    placeOnRow(c, rows, 0, notchPos(rows[0]!).x);
    flickCoin(c, rows, 600);
    let landed = false;
    for (let i = 0; i < 900 && !landed; i++) {
      landed = stepCoin(c, FIXED_DT, rows, pocket, holes).landedOnRow !== null;
    }
    expect(landed).toBe(true);
    for (let i = 0; i < 600; i++) stepCoin(c, FIXED_DT, rows, pocket, holes);
    expect(c.x).toBeCloseTo(notchPos(rows[1]!).x, 6);
  });
});

// ---------------------------------------------------------------- 成功域

describe('成功域(ゲームの根幹)', () => {
  it.each(ROWS)('やさしい 段%i: 成功域が 60% 以上で連続している', (row) => {
    const b = scanBand(EASY, row);
    expect(b.frac).toBeGreaterThanOrEqual(0.6);
    expect(b.gaps).toBe(0);
  });

  it.each(ROWS)('ふつう 段%i: 成功域が 30〜50%', (row) => {
    const b = scanBand(NORMAL, row);
    expect(b.frac).toBeGreaterThanOrEqual(0.3);
    expect(b.frac).toBeLessThanOrEqual(0.5);
    expect(b.gaps).toBe(0);
  });

  // 片側しか失敗しないなら板が壁に接していて設計が崩れている
  it.each([EASY, NORMAL])('$label: どの段でも強すぎ・弱すぎの両方で落ちる', (d) => {
    for (const row of ROWS) {
      const b = scanBand(d, row);
      expect(b.weak, `段${row + 1} の弱すぎ失敗`).toBeGreaterThan(0);
      expect(b.strong, `段${row + 1} の強すぎ失敗`).toBeGreaterThan(0);
    }
  });

  it('やさしいの方がふつうより成功域が広い', () => {
    for (const row of ROWS) {
      expect(scanBand(EASY, row).frac).toBeGreaterThan(scanBand(NORMAL, row).frac);
    }
  });

  it('弱く弾くと手前の穴、強く弾くと奥の穴に落ちる', () => {
    expect(simulate(EASY, 0, P_MIN + (P_MAX - P_MIN) * 0.06)).toBe('nearHole');
    expect(simulate(EASY, 0, P_MAX)).toBe('farHole');
  });

  it('最下段から適度に弾くとあたりの口に入る', () => {
    const mid = P_MIN + (P_MAX - P_MIN) * 0.4;
    expect(simulate(EASY, ROW_COUNT - 1, mid)).toBe('win');
  });
});

// ---------------------------------------------------------------- 頑健性

describe('頑健性', () => {
  it.each([EASY, NORMAL])('$label: どのパワーでもコインが盤面外に出ない', (d) => {
    const rows = buildRows(d);
    const pocket = buildWinPocket(d);
    const holes = buildHoles(d);
    for (let row = 0; row < ROW_COUNT; row++) {
      for (let power = P_MIN; power <= P_MAX; power += 25) {
        const c = createCoin();
        placeOnRow(c, rows, row, notchPos(rows[row]!).x);
        flickCoin(c, rows, power);
        for (let i = 0; i < 300; i++) {
          stepCoin(c, FIXED_DT, rows, pocket, holes);
          if (c.state === 'falling' || c.state === 'win') break;
          expect(Number.isFinite(c.pos.x) && Number.isFinite(c.pos.y)).toBe(true);
          expect(c.pos.x).toBeGreaterThanOrEqual(BOARD_LEFT + COIN_R - 1);
          expect(c.pos.x).toBeLessThanOrEqual(BOARD_RIGHT - COIN_R + 1);
          expect(c.pos.y).toBeGreaterThanOrEqual(BOARD_TOP - 1);
        }
      }
    }
  });

  it('状態は常に 4 つのいずれか', () => {
    const rows = buildRows(NORMAL);
    const pocket = buildWinPocket(NORMAL);
    const holes = buildHoles(NORMAL);
    const valid = new Set<Coin['state']>(['onPlank', 'airborne', 'falling', 'win']);
    const c = createCoin();
    placeAtStart(c, rows);
    flickCoin(c, rows, 600);
    for (let i = 0; i < 2000; i++) {
      stepCoin(c, FIXED_DT, rows, pocket, holes);
      expect(valid.has(c.state)).toBe(true);
    }
  });

  it('着地した位置は必ず板の上', () => {
    const rows = buildRows(EASY);
    const pocket = buildWinPocket(EASY);
    const holes = buildHoles(EASY);
    for (let power = P_MIN; power <= P_MAX; power += 10) {
      const c = createCoin();
      placeOnRow(c, rows, 0, notchPos(rows[0]!).x);
      flickCoin(c, rows, power);
      for (let i = 0; i < 900; i++) {
        const r = stepCoin(c, FIXED_DT, rows, pocket, holes);
        if (r.landedOnRow !== null) {
          expect(onPlank(rows[r.landedOnRow]!, c.x)).toBe(true);
          break;
        }
        if (r.fellInHole) break;
      }
    }
  });
});
