import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
    alias: {
      $lib: resolve(import.meta.dirname, 'src/lib'),
    },
  },
  test: {
    environment: 'jsdom',
    pool: 'vmThreads',
    globals: true,
    testTimeout: 15000,
    hookTimeout: 30000,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['src/lib/types/**', 'src/lib/__mocks__/**'],
    },
  },
});
