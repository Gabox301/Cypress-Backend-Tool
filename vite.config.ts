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
        runes: true,
      },
    }),
    dts({
      insertTypesEntry: true,
      // Emit sibling declarations (support/* + lib types/config) so the
      // entry d.ts imports resolve for consumers instead of dangling.
      // clearPureImport is off so the side-effect import of the Cypress
      // global augmentation survives in the emitted entry types.
      clearPureImport: false,
      include: ['src/index.ts', 'src/node/tasks.ts', 'src/support/*.ts', 'src/lib/config.ts', 'src/lib/types/index.ts'],
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
        // Solo externaliza 'pg' cuando se importa desde el entry de tasks (Node-only)
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
