/**
 * シーンの共通インターフェース。詳細設計書 §8.1。
 */

import type { DifficultyConfig, Vec2 } from '../config.ts';
import type { SaveData } from '../save.ts';

export type SceneId = 'title' | 'game' | 'result';

export type Outcome = 'goal' | 'hole' | 'giveup';

export interface ResultParams {
  outcome: Outcome;
  /** 1..5。到達した最高の段 */
  reachedLane: number;
  difficulty: DifficultyConfig;
  /** ゴール時のみ、獲得したスタンプの ANIMALS 上の index */
  newStampIndex: number | null;
}

export interface GameParams {
  difficulty: DifficultyConfig;
}

export interface SceneContext {
  canvas: HTMLCanvasElement;
  save: SaveData;
  /** セーブして永続化する */
  commitSave(next: Partial<SaveData>): void;
  goTo(id: SceneId, params?: unknown): void;
}

export type PointerPhase = 'down' | 'move' | 'up' | 'cancel';

export interface Scene {
  enter(params: unknown): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  onPointer(phase: PointerPhase, p: Vec2, pointerId: number, ev: PointerEvent): void;
  exit(): void;
}
