import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  plugins: [svelte()],
  define: { __TOOL_VERSION__: JSON.stringify(pkg.version) },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: {
    include: ['tests/engine/**/*.test.ts', 'tests/io/**/*.test.ts'],
    testTimeout: 60000,
    coverage: { provider: 'v8', include: ['src/engine/**/*.ts', 'src/io/**/*.ts'], exclude: ['src/io/storage.ts'], reporter: ['text', 'html'] },
  },
});
