import { defineConfig } from 'vitest/config';

export default defineConfig({
  /*
   * 相対パスにしておく。
   *
   * '/cc_flickshot/' のように絶対パスで固定すると、配信されるパスが少しでも
   * 違っただけで JS が 404 になり、画面が背景色だけの真っ青になる(原因が
   * 何も表示されないので気づきにくい)。相対パスならどのパスに置いても動く。
   */
  base: './',
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
