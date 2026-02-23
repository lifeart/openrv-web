import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: process.env.BASE_URL || '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
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
        // from libheif-js (emscripten-generated code that safely checks for Node.js modules)
        if (warning.code === 'PLUGIN_WARNING' &&
            warning.plugin === 'vite:resolve' &&
            warning.message?.includes('has been externalized for browser compatibility') &&
            warning.message?.includes('libheif-js')) {
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
