/**
 * レバー群。全段が1つのプランジャーで連動して動く。詳細設計書 §6.5。
 */

import { LANE_COUNT, LEVER_SWING_TIME } from '../config.ts';

export interface LeverState {
  /**
   * -1 = 引き切って下がっている、0 = 静止、+1 = はたき上げの頂点。
   * 描画側はこの値でレバーの角度を決める。
   */
  swing: number;
  /** はたき上げアニメの残り秒。0 なら通常状態 */
  timer: number;
}

export function createLevers(): LeverState[] {
  return Array.from({ length: LANE_COUNT }, () => ({ swing: 0, timer: 0 }));
}

/** 発射。全段同時にはたき上げる。 */
export function triggerLevers(levers: LeverState[]): void {
  for (const l of levers) l.timer = LEVER_SWING_TIME;
}

/**
 * 引いている間は pull に応じて全レバーがわずかに下がる(タメの視覚フィードバック)。
 * 発射後は timer をもとにはたき上げアニメを進める。
 */
export function updateLevers(levers: LeverState[], dt: number, pull: number): void {
  for (const l of levers) {
    if (l.timer > 0) {
      l.timer = Math.max(0, l.timer - dt);
      // 0 → 1 → 0 の山なりに振る
      const t = 1 - l.timer / LEVER_SWING_TIME;
      l.swing = Math.sin(t * Math.PI);
    } else {
      l.swing = -pull * 0.35;
    }
  }
}
