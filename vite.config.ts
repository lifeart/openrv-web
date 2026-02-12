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
  },
  server: {
    port: 5173,
    open: true,
  },
});
