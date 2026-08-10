import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  resolve: {
    alias: {
      $lib: resolve(import.meta.dirname, 'src/lib'),
    },
  },
  plugins: [
    svelte({
      compilerOptions: {
        css: 'injected',
      },
    }),
    dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.svelte'],
    }),
  ],
  build: {
    lib: {
      entry: [resolve(import.meta.dirname, 'src/index.ts'), resolve(import.meta.dirname, 'src/node/tasks.ts')],
      formats: ['es'],
      fileName: (_format: string, entryName: string) => `${entryName === 'index' ? 'index' : 'tasks'}.js`,
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: (source: string, importer: string | undefined) => {
        if (source === 'cypress') return true;
        // Solo externaliza 'pg' cuando se importa desde el entry de tasks
        if (source === 'pg' && importer?.includes('src/node/tasks.ts')) return true;
        return false;
      },
      output: {
        assetFileNames: 'index.[ext]',
      },
    },
    minify: false,
  },
});
