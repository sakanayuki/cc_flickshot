/**
 * プランジャーのテスト。詳細設計書 §13.1。
 */

import { describe, expect, it } from 'vitest';
import { FIXED_DT, GRAB_ZONE, KNOB_REST, P_MAX, P_MIN, STROKE_FINGER, STROKE_KNOB } from '../config.ts';
import {
  createPlunger,
  plungerPointerDown,
  plungerPointerMove,
  plungerPointerUp,
  pullToPower,
  updatePlunger,
} from './plunger.ts';

const INSIDE = { x: GRAB_ZONE.x + 10, y: GRAB_ZONE.y + 10 };

describe('pull → power (§13.1)', () => {
  it('pull = 0 で P_MIN', () => expect(pullToPower(0)).toBe(P_MIN));
  it('pull = 1 で P_MAX', () => expect(pullToPower(1)).toBe(P_MAX));
  it('pull = 0.5 で中間', () => expect(pullToPower(0.5)).toBe((P_MIN + P_MAX) / 2));
});

describe('プランジャーの入力', () => {
  it('掴み領域の外では掴めない', () => {
    const st = createPlunger();
    expect(plungerPointerDown(st, { x: 10, y: 10 }, 1)).toBe(false);
    expect(st.grabbed).toBe(false);
  });

  it('掴み領域の中なら掴める', () => {
    const st = createPlunger();
    expect(plungerPointerDown(st, INSIDE, 1)).toBe(true);
    expect(st.grabbed).toBe(true);
  });

  it('指を 450px 下げると pull が 1 になる', () => {
    const st = createPlunger();
    plungerPointerDown(st, INSIDE, 1);
    plungerPointerMove(st, { x: INSIDE.x, y: INSIDE.y + STROKE_FINGER });
    expect(st.pull).toBe(1);
  });

  it('450px を超えて引いても pull は 1 で頭打ち', () => {
    const st = createPlunger();
    plungerPointerDown(st, INSIDE, 1);
    plungerPointerMove(st, { x: INSIDE.x, y: INSIDE.y + STROKE_FINGER * 2 });
    expect(st.pull).toBe(1);
  });

  it('上に動かしても pull は負にならない', () => {
    const st = createPlunger();
    plungerPointerDown(st, INSIDE, 1);
    plungerPointerMove(st, { x: INSIDE.x, y: INSIDE.y - 200 });
    expect(st.pull).toBe(0);
  });

  // 3歳児のドラッグは必ず蛇行する。横ブレを無視することが要件のひとつ
  it('横に大きくブレても pull は縦の変位だけで決まる', () => {
    const st = createPlunger();
    plungerPointerDown(st, INSIDE, 1);
    plungerPointerMove(st, { x: INSIDE.x - 400, y: INSIDE.y + STROKE_FINGER / 2 });
    expect(st.pull).toBeCloseTo(0.5, 6);
  });

  it('引き量が極小なら発射しない(誤タップ対策)', () => {
    const st = createPlunger();
    plungerPointerDown(st, INSIDE, 1);
    plungerPointerMove(st, { x: INSIDE.x, y: INSIDE.y + STROKE_FINGER * 0.04 });
    expect(plungerPointerUp(st)).toBeNull();
  });

  it('デッドゾーンぎりぎりなら発射する', () => {
    const st = createPlunger();
    plungerPointerDown(st, INSIDE, 1);
    plungerPointerMove(st, { x: INSIDE.x, y: INSIDE.y + STROKE_FINGER * 0.05 });
    const power = plungerPointerUp(st);
    expect(power).not.toBeNull();
    expect(power!).toBeGreaterThan(P_MIN);
  });

  it('掴んでいなければ発射しない', () => {
    expect(plungerPointerUp(createPlunger())).toBeNull();
  });

  it('発射後はクールダウン中に掴めない', () => {
    const st = createPlunger();
    plungerPointerDown(st, INSIDE, 1);
    plungerPointerMove(st, { x: INSIDE.x, y: INSIDE.y + STROKE_FINGER });
    plungerPointerUp(st);
    expect(plungerPointerDown(st, INSIDE, 2)).toBe(false);
    for (let i = 0; i < 30; i++) updatePlunger(st, FIXED_DT);
    expect(plungerPointerDown(st, INSIDE, 3)).toBe(true);
  });
});

describe('ノブの表示位置 (§6.3)', () => {
  it('指 450px に対してノブは 380px しか動かない', () => {
    const st = createPlunger();
    plungerPointerDown(st, INSIDE, 1);
    plungerPointerMove(st, { x: INSIDE.x, y: INSIDE.y + STROKE_FINGER });
    updatePlunger(st, FIXED_DT);
    expect(st.knobY).toBeCloseTo(KNOB_REST.y + STROKE_KNOB, 6);
  });

  it('引ききってもノブは画面内(y <= 1280)に収まる', () => {
    const st = createPlunger();
    plungerPointerDown(st, INSIDE, 1);
    plungerPointerMove(st, { x: INSIDE.x, y: INSIDE.y + STROKE_FINGER });
    updatePlunger(st, FIXED_DT);
    expect(st.knobY).toBeLessThanOrEqual(1280);
  });

  it('離すとバネで静止位置に戻る', () => {
    const st = createPlunger();
    plungerPointerDown(st, INSIDE, 1);
    plungerPointerMove(st, { x: INSIDE.x, y: INSIDE.y + STROKE_FINGER });
    updatePlunger(st, FIXED_DT);
    plungerPointerUp(st);
    for (let i = 0; i < 30; i++) updatePlunger(st, FIXED_DT);
    expect(st.knobY).toBeCloseTo(KNOB_REST.y, 6);
  });
});

describe('操作ガイド用の idleTime (§8.5)', () => {
  it('放置すると増える', () => {
    const st = createPlunger();
    for (let i = 0; i < 120; i++) updatePlunger(st, FIXED_DT);
    expect(st.idleTime).toBeCloseTo(2, 1);
  });

  it('触れるとリセットされる', () => {
    const st = createPlunger();
    for (let i = 0; i < 120; i++) updatePlunger(st, FIXED_DT);
    plungerPointerDown(st, INSIDE, 1);
    expect(st.idleTime).toBe(0);
  });

  it('掴み領域の外を触ってもリセットされる', () => {
    const st = createPlunger();
    for (let i = 0; i < 120; i++) updatePlunger(st, FIXED_DT);
    plungerPointerDown(st, { x: 10, y: 10 }, 1);
    expect(st.idleTime).toBe(0);
  });
});
