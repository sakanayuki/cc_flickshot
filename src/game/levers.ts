/**
 * レバー群。全段が 1 つのプランジャーで連動して動く。
 *
 * レバーは壁から突き出すキッカーで、発射すると伸びて、レーンの低い端で
 * 構えているコインを斜面に沿って蹴り出す。引いている間は引き量に応じて
 * 全レバーが壁の中へ引っ込む(タメの視覚フィードバック)。
 */

import { LEVER_SWING_TIME, ROW_COUNT } from '../config.ts';

export interface LeverState {
  /**
   * 見た目の姿勢。
   *   -1..0 = 引いて溜めている(-1 が最大のタメ)
   *    0    = 静止
   *    0..1 = 打撃(1 が伸びきった位置)
   */
  swing: number;
  /** はたきアニメの残り時間 */
  timer: number;
  /** 打撃直後の光 (0..1)。星やフラッシュの描画に使う */
  flash: number;
}

export function createLevers(): LeverState[] {
  return Array.from({ length: ROW_COUNT }, () => ({ swing: 0, timer: 0, flash: 0 }));
}

/** 発射。全段同時に蹴る */
export function triggerLevers(levers: LeverState[]): void {
  for (const l of levers) {
    l.timer = LEVER_SWING_TIME;
    l.flash = 1;
  }
}

/**
 * 引いている間は pull に応じて全レバーがタメの姿勢をとり、
 * 発射後は timer をもとにはたきアニメを進める。
 */
export function updateLevers(levers: LeverState[], dt: number, pull: number): void {
  for (const l of levers) {
    l.flash = Math.max(0, l.flash - dt * 5);
    if (l.timer > 0) {
      l.timer = Math.max(0, l.timer - dt);
      const t = 1 - l.timer / LEVER_SWING_TIME;
      // 一気に伸びて、少し行き過ぎてから戻る
      l.swing = t < 0.35 ? t / 0.35 : 1 - ((t - 0.35) / 0.65) * 1.0 + Math.sin(t * Math.PI) * 0.08;
    } else {
      l.swing = -pull;
    }
  }
}
