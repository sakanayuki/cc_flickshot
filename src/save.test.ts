/**
 * セーブデータのテスト。詳細設計書 §12.2。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANIMALS } from './config.ts';
import {
  DEFAULT_SAVE,
  loadSave,
  resetMemoryFallback,
  SAVE_KEY,
  saveSave,
  stampIndexFor,
  type SaveData,
} from './save.ts';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
  key(): string | null {
    return null;
  }
  get length(): number {
    return this.map.size;
  }
}

function useStorage(s: unknown): void {
  vi.stubGlobal('localStorage', s);
  resetMemoryFallback();
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetMemoryFallback();
});

describe('保存と読込 (§13.6)', () => {
  it('保存した値がそのまま読み出せる', () => {
    useStorage(new MemoryStorage());
    const data: SaveData = { stampCount: 7, lastDifficulty: 'normal' };
    saveSave(data);
    expect(loadSave()).toEqual(data);
  });

  it('未保存なら既定値', () => {
    useStorage(new MemoryStorage());
    expect(loadSave()).toEqual(DEFAULT_SAVE);
  });
});

describe('壊れたデータへの耐性 (§13.6)', () => {
  it('不正な JSON なら既定値', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY, '{壊れている');
    useStorage(s);
    expect(loadSave()).toEqual(DEFAULT_SAVE);
  });

  it.each([
    ['文字列', '"abc"'],
    ['stampCount が文字列', '{"stampCount":"5"}'],
    ['stampCount が負', '{"stampCount":-3}'],
    ['stampCount が NaN 相当', '{"stampCount":null}'],
    ['null', 'null'],
  ])('%s なら既定値にフォールバック', (_label, json) => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY, json);
    useStorage(s);
    expect(loadSave().stampCount).toBe(DEFAULT_SAVE.stampCount);
  });

  it('未知の難易度は easy に落とす', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY, '{"stampCount":2,"lastDifficulty":"impossible"}');
    useStorage(s);
    expect(loadSave()).toEqual({ stampCount: 2, lastDifficulty: 'easy' });
  });
});

describe('localStorage が使えない環境 (§13.6)', () => {
  it('localStorage が undefined でもクラッシュしない', () => {
    useStorage(undefined);
    expect(() => saveSave({ stampCount: 3, lastDifficulty: 'normal' })).not.toThrow();
    expect(loadSave().stampCount).toBe(3); // メモリ上では保持される
  });

  it('setItem が例外を投げてもクラッシュせず、セッション内では保持される', () => {
    useStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    expect(() => saveSave({ stampCount: 4, lastDifficulty: 'easy' })).not.toThrow();
    expect(loadSave().stampCount).toBe(4);
  });

  it('getItem が例外を投げても既定値を返す', () => {
    useStorage({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(() => loadSave()).not.toThrow();
    expect(loadSave()).toEqual(DEFAULT_SAVE);
  });
});

describe('スタンプの種類 (§6)', () => {
  it('1 個目は 0 番、10 個目は 9 番、11 個目で 1 周する', () => {
    expect(stampIndexFor(1)).toBe(0);
    expect(stampIndexFor(10)).toBe(ANIMALS.length - 1);
    expect(stampIndexFor(11)).toBe(0);
  });

  it('常に ANIMALS の範囲に収まる', () => {
    for (let n = 1; n <= 100; n++) {
      const i = stampIndexFor(n);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(ANIMALS.length);
    }
  });
});
