/**
 * スタンプの永続化。詳細設計書 §9。
 *
 * localStorage が使えない環境(プライベートブラウズ、ストレージ無効)でも
 * 絶対にクラッシュさせない。失敗したらメモリ上だけで動作を続ける。
 */

import { ANIMALS, type DifficultyId } from './config.ts';

export interface SaveData {
  /** 累計あたり回数 = 集めたスタンプの数 */
  stampCount: number;
  lastDifficulty: DifficultyId;
}

export const SAVE_KEY = 'flickshot.save.v1';

export const DEFAULT_SAVE: SaveData = {
  stampCount: 0,
  lastDifficulty: 'easy',
};

/** localStorage が使えないときのフォールバック */
let memory: SaveData = { ...DEFAULT_SAVE };

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    // Safari のプライベートモードは getItem は通るのに setItem で例外を投げる
    const probe = '__flickshot_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function sanitize(raw: unknown): SaveData {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SAVE };
  const o = raw as Record<string, unknown>;
  const count = o['stampCount'];
  const diff = o['lastDifficulty'];
  return {
    stampCount:
      typeof count === 'number' && Number.isFinite(count) && count >= 0
        ? Math.floor(count)
        : DEFAULT_SAVE.stampCount,
    lastDifficulty: diff === 'easy' || diff === 'normal' ? diff : DEFAULT_SAVE.lastDifficulty,
  };
}

export function loadSave(): SaveData {
  const s = storage();
  if (!s) return { ...memory };
  try {
    const text = s.getItem(SAVE_KEY);
    if (text === null) return { ...memory };
    return sanitize(JSON.parse(text));
  } catch {
    return { ...memory };
  }
}

export function saveSave(data: SaveData): void {
  memory = { ...data };
  const s = storage();
  if (!s) return;
  try {
    s.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // 容量超過などは黙って無視する。メモリ上の値は更新済み
  }
}

/** テスト用。メモリ上のフォールバックを初期化する */
export function resetMemoryFallback(): void {
  memory = { ...DEFAULT_SAVE };
}

/** n 個目 (1 始まり) のスタンプが ANIMALS の何番目か */
export function stampIndexFor(nth: number): number {
  return (Math.max(1, Math.floor(nth)) - 1) % ANIMALS.length;
}
