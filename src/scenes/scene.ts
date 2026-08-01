/**
 * シーンの共通インターフェース。
 */

import type { DifficultyConfig, Vec2 } from '../config.ts';
import type { SaveData } from '../save.ts';

export type SceneId = 'title' | 'game' | 'result';

export type Outcome = 'win' | 'hole' | 'giveup';

export interface ResultParams {
  outcome: Outcome;
  /** 1..ROW_COUNT。降りた最深の段 */
  reachedDepth: number;
  difficulty: DifficultyConfig;
  /** あたり時のみ、獲得したスタンプの ANIMALS 上の index */
  newStampIndex: number | null;
  /** 最後のショットの判定。'weak' | 'strong' | 'good' */
  lastShot: string | null;
  /** そのときの引き量 0..1。次に何%狙えばいいかの手がかりになる */
  lastPull: number | null;
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
