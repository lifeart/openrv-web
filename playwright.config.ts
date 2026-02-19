import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

const SMOKE_SPECS = [
  'app-initialization.spec.ts',
  'media-loading.spec.ts',
  'playback-controls.spec.ts',
  'exr-loading.spec.ts',
  'color-controls.spec.ts',
  'ab-compare.spec.ts',
  'export-workflow.spec.ts',
  'pixel-probe.spec.ts',
  'channel-select.spec.ts',
  'image-sequence.spec.ts',
  'keyboard-shortcuts.spec.ts',
  'histogram.spec.ts',
];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : '50%',
  reporter: isCI ? [['html'], ['json', { outputFile: 'results.json' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(isCI
      ? []
      : [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
          },
        ]),
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
      testMatch: SMOKE_SPECS,
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !isCI,
    timeout: 120000,
  },
  // SwiftShader in CI is 10-100x slower — increase timeouts
  timeout: isCI ? 90000 : 30000,
  expect: {
    timeout: isCI ? 30000 : 10000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.3,
    },
  },
});
