/**
 * 盤面と物理のテスト。
 *
 * このゲームは「適度な強さでだけ 1 段下の板に乗れる」ことがすべてなので、
 * 成功域の広さと、強すぎ・弱すぎの両方で落ちることを直接テストしている。
 * ここが壊れると盤面の数字が正しくても遊べなくなる。
 *
 * 加えて「コインが板を貫通しない」ことをテストする。旧設計は
 * 弾いたコインが自分の板を横切る幾何で、どんな弾道でも板にめり込んで
 * 見える欠陥があった(改訂履歴(4))。
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
  GROOVE_GAP,
  P_MAX,
  P_MIN,
  PLANK_THICK,
  PULL_DEADZONE,
  ROW_COUNT,
  type DifficultyConfig,
  type Row,
} from '../config.ts';
import {
  buildHoles,
  buildRows,
  buildWinPocket,
  flickDirX,
  groovePos,
  onPlank,
  plankSurfaceY,
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
  placeOnRow(coin, rows, rowIndex, groovePos(rows[rowIndex]!).x);
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

/** ストローク中央の弾き力。定数を動かしても常に成功域の内側に入る */
const midPower = () => P_MIN + (P_MAX - P_MIN) * 0.45;

// ---------------------------------------------------------------- 盤面

describe('盤面の幾何', () => {
  it.each([EASY, NORMAL])('$label: 板が盤面に収まる', (d) => {
    for (const r of buildRows(d)) {
      expect(r.left).toBeGreaterThanOrEqual(BOARD_LEFT);
      expect(r.right).toBeLessThanOrEqual(BOARD_RIGHT);
    }
  });

  it.each([EASY, NORMAL])('$label: 溝の端が左→右と交互になる', (d) => {
    const sides = buildRows(d).map((r) => r.grooveSide);
    expect(sides).toEqual(['left', 'right', 'left', 'right', 'left']);
  });

  it.each([EASY, NORMAL])('$label: 弾く向きは板から離れる向き(外向き)', (d) => {
    for (const row of buildRows(d)) {
      const g = groovePos(row);
      const dir = flickDirX(row);
      // 溝から弾く向きへ進むと、すぐ板の外に出る
      expect(onPlank(row, g.x + dir * (COIN_R + 1))).toBe(false);
      // 反対へ進むと板の上(=自分の板を横切って飛ぶことはない)
      expect(onPlank(row, g.x - dir * (COIN_R + 1))).toBe(true);
    }
  });

  it.each([EASY, NORMAL])('$label: 5つの遷移がすべて同じ横距離・落差', (d) => {
    const rows = buildRows(d);
    const pocket = buildWinPocket(d);
    const jumps = rows.map((row, i) => {
      const dir = flickDirX(row);
      const t =
        i + 1 < ROW_COUNT
          ? { near: dir < 0 ? rows[i + 1]!.right : rows[i + 1]!.left, y: rows[i + 1]!.grooveY }
          : { near: dir < 0 ? pocket.right : pocket.left, y: pocket.y };
      return [Math.abs(groovePos(row).x - t.near), t.y - row.grooveY];
    });
    for (const j of jumps) {
      expect(j[0]).toBeCloseTo(jumps[0]![0]!, 6);
      expect(j[1]).toBeCloseTo(jumps[0]![1]!, 6);
    }
  });

  // 手前の穴が無いと「弱すぎ」で落ちる余地が消える
  it.each([EASY, NORMAL])('$label: 溝と 1 段下の板の間に手前の穴がある', (d) => {
    const rows = buildRows(d);
    const gap = Math.abs(groovePos(rows[0]!).x - rows[1]!.right);
    expect(gap).toBeCloseTo(GROOVE_GAP, 6);
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

  it.each([EASY, NORMAL])('$label: 穴の見た目が落下範囲に収まる', (d) => {
    for (const h of buildHoles(d)) {
      expect(h.cx - h.rx).toBeGreaterThanOrEqual(h.left - 1);
      expect(h.cx + h.rx).toBeLessThanOrEqual(h.right + 1);
      expect(h.rx).toBeGreaterThan(0);
      expect(h.ry).toBeGreaterThan(0);
    }
  });

  // 棒と棒の間はまるごと開口している。見た目より広い範囲で落ちると
  // 「板の上に乗ったのに落ちた」ように見えてしまう
  it.each([EASY, NORMAL])('$label: 間の穴は隙間をほぼ埋めている', (d) => {
    for (const h of buildHoles(d).filter((x) => x.kind === 'near')) {
      expect(h.rx * 2).toBeGreaterThan((h.right - h.left) * 0.85);
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
    placeOnRow(c, rows, 0, groovePos(rows[0]!).x);
    expect(canFlick(c, rows)).toBe(true);
  });

  it('溝から離れていると弾けない', () => {
    const rows = buildRows(EASY);
    const c = createCoin();
    const g = groovePos(rows[0]!);
    placeOnRow(c, rows, 0, g.x - flickDirX(rows[0]!) * (FLICK_ZONE_PX + 10));
    expect(canFlick(c, rows)).toBe(false);
    expect(flickCoin(c, rows, 600)).toBe(false);
    expect(c.state).toBe('onPlank');
  });

  it('空中のコインは弾けない', () => {
    const rows = buildRows(EASY);
    const c = createCoin();
    placeOnRow(c, rows, 0, groovePos(rows[0]!).x);
    flickCoin(c, rows, 600);
    expect(c.state).toBe('airborne');
    expect(canFlick(c, rows)).toBe(false);
  });

  it('弾く向きが段ごとに左右交互になる', () => {
    const rows = buildRows(EASY);
    const dirs: number[] = [];
    for (const row of rows) {
      const c = createCoin();
      placeOnRow(c, rows, row.index, groovePos(row).x);
      flickCoin(c, rows, 600);
      expect(Math.sign(c.vel.x)).toBe(flickDirX(row));
      dirs.push(Math.sign(c.vel.x));
    }
    expect(dirs).toEqual([-1, 1, -1, 1, -1]);
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
    expect(c.x).toBeCloseTo(groovePos(rows[0]!).x, 6);
    expect(canFlick(c, rows)).toBe(true);
  });

  it('着地したコインは最終的に溝で止まる', () => {
    const rows = buildRows(EASY);
    const pocket = buildWinPocket(EASY);
    const holes = buildHoles(EASY);
    const c = createCoin();
    placeOnRow(c, rows, 0, groovePos(rows[0]!).x);
    flickCoin(c, rows, midPower());
    let landed = false;
    for (let i = 0; i < 900 && !landed; i++) {
      landed = stepCoin(c, FIXED_DT, rows, pocket, holes).landedOnRow !== null;
    }
    expect(landed).toBe(true);
    for (let i = 0; i < 900; i++) stepCoin(c, FIXED_DT, rows, pocket, holes);
    expect(c.x).toBeCloseTo(groovePos(rows[1]!).x, 6);
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

// ---------------------------------------------------------------- 貫通しないこと

/** コインの円が板の実体(上面〜底面の帯)にどれだけ食い込んでいるか */
function penetrationDepth(rows: readonly Row[], x: number, y: number): number {
  let worst = 0;
  for (const row of rows) {
    if (!onPlank(row, x)) continue;
    const top = plankSurfaceY(row, x);
    const bottom = top + PLANK_THICK;
    if (y > top - COIN_R + 1 && y < bottom + COIN_R - 1) {
      worst = Math.max(worst, Math.min(y - (top - COIN_R + 1), bottom + COIN_R - 1 - y));
    }
  }
  return worst;
}

describe('板を貫通しない', () => {
  it.each([EASY, NORMAL])('$label: どのパワーでも飛行中に板にめり込まない', (d) => {
    const rows = buildRows(d);
    const pocket = buildWinPocket(d);
    const holes = buildHoles(d);
    for (let row = 0; row < ROW_COUNT; row++) {
      for (let power = P_MIN; power <= P_MAX; power += 25) {
        const c = createCoin();
        placeOnRow(c, rows, row, groovePos(rows[row]!).x);
        flickCoin(c, rows, power);
        for (let i = 0; i < 300; i++) {
          stepCoin(c, FIXED_DT, rows, pocket, holes);
          if (c.state !== 'airborne') break;
          expect(
            penetrationDepth(rows, c.pos.x, c.pos.y),
            `段${row + 1} power=${power}`,
          ).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it('板の先端に横からぶつかったコインは止まって下に落ちる(すり抜けない)', () => {
    const rows = buildRows(EASY);
    const pocket = buildWinPocket(EASY);
    const holes = buildHoles(EASY);
    const target = rows[1]!; // 板は左へ伸び、右端が溝の先端
    const c = createCoin();
    // 先端のすぐ右、板面すれすれの高さから水平に打ち込む
    c.state = 'airborne';
    c.rowIndex = 0;
    c.pos = { x: target.right + COIN_R + 40, y: target.grooveY + PLANK_THICK / 2 };
    c.vel = { x: -900, y: 0 };
    let outcome: 'through' | 'stopped' = 'through';
    for (let i = 0; i < 300; i++) {
      const r = stepCoin(c, FIXED_DT, rows, pocket, holes);
      // 板の内部側に抜けたら貫通
      expect(c.pos.x).toBeGreaterThanOrEqual(target.right - 1);
      if (r.fellInHole) {
        outcome = 'stopped';
        expect(r.fellInHole.kind).toBe('near');
        break;
      }
    }
    expect(outcome).toBe('stopped');
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
        placeOnRow(c, rows, row, groovePos(rows[row]!).x);
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
      placeOnRow(c, rows, 0, groovePos(rows[0]!).x);
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
