import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages のサブパス。外すとアセットが 404 になる(詳細設計書 §14.2)
  base: '/cc_flickshot/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    // 単一バンドルで動的 import がないため不要。
    // 入れておくと fetch() を含むポリフィルが混ざり、
    // 「初回ロード以外ネットワーク不要」という要件が読み取りにくくなる
    modulePreload: false,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
