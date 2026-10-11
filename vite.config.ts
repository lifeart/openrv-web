import { defineConfig } from 'vite';
import { resolve } from 'path';
import { pluginHotReload } from './scripts/vite/pluginHotReload';

export default defineConfig({
  base: process.env.BASE_URL || '/',
  // `apply: 'serve'` on each plugin gates them out of production builds.
  // The matching production-safety test in `tests/build/no-dev-leak.test.ts`
  // verifies this stays true.
  plugins: [pluginHotReload()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  optimizeDeps: {
    exclude: ['@jsquash/jxl'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Suppress "Module has been externalized for browser compatibility" warnings
        // from libheif-js and the @cornerstonejs JPEG 2000 codecs (emscripten-generated
        // code that only requires fs/path when running under Node.js)
        if (
          warning.code === 'PLUGIN_WARNING' &&
          warning.plugin === 'vite:resolve' &&
          warning.message?.includes('has been externalized for browser compatibility') &&
          (warning.message?.includes('libheif-js') || warning.message?.includes('@cornerstonejs/codec-openjp'))
        ) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
