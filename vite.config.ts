import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages のサブパス。外すとアセットが 404 になる(詳細設計書 §14.2)
  base: '/cc_flickshot/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
