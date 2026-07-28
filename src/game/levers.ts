/**
 * レバー群。全段が 1 つのプランジャーで連動して動く。
 */

import { LEVER_SWING_TIME, ROW_COUNT } from '../config.ts';

export interface LeverState {
  /** -1 = 引いて溜めている, 0 = 静止, +1 = はたいた頂点 */
  swing: number;
  timer: number;
}

export function createLevers(): LeverState[] {
  return Array.from({ length: ROW_COUNT }, () => ({ swing: 0, timer: 0 }));
}

/** 発射。全段同時にはたく */
export function triggerLevers(levers: LeverState[]): void {
  for (const l of levers) l.timer = LEVER_SWING_TIME;
}

/**
 * 引いている間は pull に応じて全レバーがわずかに引き戻り(タメ)、
 * 発射後は timer をもとにはたきアニメを進める。
 */
export function updateLevers(levers: LeverState[], dt: number, pull: number): void {
  for (const l of levers) {
    if (l.timer > 0) {
      l.timer = Math.max(0, l.timer - dt);
      const t = 1 - l.timer / LEVER_SWING_TIME;
      l.swing = Math.sin(t * Math.PI);
    } else {
      l.swing = -pull * 0.4;
    }
  }
}
