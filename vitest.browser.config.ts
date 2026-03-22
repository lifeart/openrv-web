import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { playwright } from '@vitest/browser-playwright';

const isCI = !!process.env.CI;

export default defineConfig({
  test: {
    name: 'gpu',
    include: ['src/**/*.gpu-test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        {
          browser: 'chromium',
          launch: {
            args: [
              '--enable-gpu',
              '--enable-webgl',
              '--enable-webgpu',
              '--disable-gpu-vsync',
              '--disable-frame-rate-limit',
              ...(isCI
                ? ['--use-gl=angle', '--use-angle=metal', '--enable-gpu-rasterization']
                : []),
            ],
          },
        },
      ],
    },
    setupFiles: ['./test/gpu-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
});
