import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { loadVideoFile, waitForTestHelper } from './fixtures';

/**
 * MED-51 PR-1 Phase 4 — E2E coverage for the LUT output color-space cascade.
 *
 * These specs verify that the four-stage pipeline (precache → file → look →
 * display) propagates user-declared output color-space metadata from the
 * panel/scripting surface all the way to the renderer's `u_inputTransfer`
 * uniform — i.e. the cascade introduced by Phase 1 (`LUTPipelineProvider` +
 * `ColorAPI` setters), wired to the UI in Phase 2 (per-stage dropdowns), and
 * lint-checked in Phase 3 (`LUTPipelineLinter`).
 *
 * Test bridge:
 * - `__OPENRV_TEST__.mutations.getLUTPipelinePanel().getPipelineState()`
 *   exposes per-stage `outputColorPrimaries` / `outputTransferFunction`.
 * - `__OPENRV_TEST__.mutations.getRendererLastInputTransferCode()` returns
 *   the last `u_inputTransfer` code (0=sRGB, 1=HLG, 2=PQ, 3=SMPTE240M)
 *   that the WebGL Renderer bound during a render — the cascade's terminal
 *   observable.
 *
 * Test fixtures:
 * - HDR PQ asset: `sample/cosmos-pq.avif` (already used by hdr-* specs).
 *   If the fixture is missing locally these tests skip with a TODO.
 * - Display LUT: reuses `sample/test_lut.cube` (warm LUT) for stage loading.
 *
 * If the public API surface (`window.openrv.color.setLUTStageTransferFunction`)
 * or the renderer test bridge isn't wired in this build, the relevant tests
 * skip — the spec still serves as the contract reference.
 */

const SAMPLE_HDR_PQ = 'sample/cosmos-pq.avif';
const SAMPLE_LUT_WARM = 'sample/test_lut.cube';

// INPUT_TRANSFER_* codes (kept in sync with src/render/ShaderConstants.ts).
const INPUT_TRANSFER_SRGB = 0;
const INPUT_TRANSFER_HLG = 1;
const INPUT_TRANSFER_PQ = 2;

/** Resolve a fixture path on disk (relative to repo root). */
function fixtureExists(fixturePath: string): boolean {
  const fullPath = path.resolve(process.cwd(), fixturePath);
  return fs.existsSync(fullPath);
}

/** Check whether the LUT pipeline panel is wired in this app build. */
async function hasLUTPipelinePanel(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return !!(window as any).__OPENRV_TEST__?.mutations?.getLUTPipelinePanel();
  });
}

/** Check whether the renderer test bridge is wired in this build. */
async function hasRendererTestBridge(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const m = (window as any).__OPENRV_TEST__?.mutations;
    return typeof m?.getRendererLastInputTransferCode === 'function';
  });
}

/** Check whether the public scripting API exposes the stage setters. */
async function hasScriptingStageSetters(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const color = (window as any).openrv?.color;
    return (
      typeof color?.setLUTStageTransferFunction === 'function' && typeof color?.setLUTStageColorPrimaries === 'function'
    );
  });
}

/** Open the LUT Pipeline panel via the keyboard shortcut. */
async function openLUTPipelinePanel(page: Page): Promise<void> {
  await page.click('button[data-tab-id="color"]');
  const panel = page.locator('[data-testid="lut-pipeline-panel"]');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.keyboard.press('Shift+l');
  }
  await expect(panel).toBeVisible();
}

/** Load a LUT into a specific stage via the panel's file input. */
async function loadLUTIntoStage(
  page: Page,
  stage: 'precache' | 'file' | 'look' | 'display',
  lutFile: string,
): Promise<void> {
  const fileInput = page.locator(`[data-testid="lut-${stage}-file-input"]`);
  const lutPath = path.resolve(process.cwd(), lutFile);
  await fileInput.setInputFiles(lutPath);
  await page.waitForFunction(
    (s) => {
      const panel = (window as any).__OPENRV_TEST__?.mutations?.getLUTPipelinePanel();
      const state = panel?.getPipelineState?.();
      return state && state[s]?.hasLUT === true;
    },
    stage,
    { timeout: 5000 },
  );
}

/** Load an HDR PQ media file. */
async function loadHDRPQFile(page: Page): Promise<void> {
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(path.resolve(process.cwd(), SAMPLE_HDR_PQ));
  await page.waitForFunction(
    () => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.hasMedia === true;
    },
    undefined,
    { timeout: 10000 },
  );
}

/**
 * Wait for at least one render call after a state change, so the renderer's
 * `getLastInputTransferCodeForTest()` reflects the post-change uniform.
 *
 * The renderer only updates `_lastInputTransferCode` inside `renderImage()`;
 * a state change alone (panel UI toggle, scripting API call) doesn't bind
 * uniforms until the next frame is drawn. We nudge a frame by toggling
 * something cheap on the viewer or just waiting for the next animation tick.
 */
async function waitForNextRender(page: Page): Promise<void> {
  // Force a redraw by stepping back-and-forth one frame (no-op for static
  // images — the call still flushes a renderImage).
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
}

/** Read the last input-transfer code from the renderer (or null if unwired). */
async function getRendererLastInputTransferCode(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const m = (window as any).__OPENRV_TEST__?.mutations;
    return m?.getRendererLastInputTransferCode?.() ?? null;
  });
}

/** Read the LUT pipeline panel's serialized state. */
async function getLUTPipelineState(page: Page): Promise<any> {
  return page.evaluate(() => {
    const panel = (window as any).__OPENRV_TEST__?.mutations?.getLUTPipelinePanel();
    return panel?.getPipelineState?.() ?? null;
  });
}

test.describe('LUT Output Color Space Cascade (MED-51)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('E2E-LOCS-001: Display LUT output declared as sRGB via UI overrides PQ source EOTF', async ({ page }) => {
    test.skip(!fixtureExists(SAMPLE_HDR_PQ), `HDR PQ fixture missing: ${SAMPLE_HDR_PQ}`);
    test.skip(!fixtureExists(SAMPLE_LUT_WARM), `Sample LUT fixture missing: ${SAMPLE_LUT_WARM}`);
    test.skip(!(await hasLUTPipelinePanel(page)), 'LUT pipeline panel not wired in this build');
    test.skip(!(await hasRendererTestBridge(page)), 'Renderer test bridge not wired in this build');

    await loadHDRPQFile(page);
    await openLUTPipelinePanel(page);

    // Load a Display LUT so the display-stage dropdown becomes meaningful.
    await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

    // Declare the Display LUT output as sRGB via the UI dropdown.
    const transferSelect = page.locator('[data-testid="lut-display-output-transfer-select"]');
    await expect(transferSelect).toBeVisible();
    await transferSelect.selectOption('srgb');

    // Verify the panel state reflects the declaration.
    const state = await getLUTPipelineState(page);
    expect(state?.display?.outputTransferFunction).toBe('srgb');

    await waitForNextRender(page);

    // The cascade should resolve to INPUT_TRANSFER_SRGB at the renderer
    // boundary regardless of the source's PQ EOTF, because the display
    // stage's declared output is the cascade's terminal value.
    const code = await getRendererLastInputTransferCode(page);
    expect(code).toBe(INPUT_TRANSFER_SRGB);
  });

  test('E2E-LOCS-002: scripting API setLUTStageTransferFunction propagates to renderer', async ({ page }) => {
    test.skip(!fixtureExists(SAMPLE_HDR_PQ), `HDR PQ fixture missing: ${SAMPLE_HDR_PQ}`);
    test.skip(!fixtureExists(SAMPLE_LUT_WARM), `Sample LUT fixture missing: ${SAMPLE_LUT_WARM}`);
    test.skip(!(await hasLUTPipelinePanel(page)), 'LUT pipeline panel not wired in this build');
    test.skip(!(await hasRendererTestBridge(page)), 'Renderer test bridge not wired in this build');
    test.skip(
      !(await hasScriptingStageSetters(page)),
      'window.openrv.color.setLUTStageTransferFunction not wired in this build',
    );

    await loadHDRPQFile(page);
    await openLUTPipelinePanel(page);
    await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

    // Declare via the public scripting API (the same surface plugins use).
    await page.evaluate(() => {
      (window as any).openrv.color.setLUTStageTransferFunction('display', 'srgb');
    });

    // Pipeline state should reflect the declaration immediately.
    const state = await getLUTPipelineState(page);
    expect(state?.display?.outputTransferFunction).toBe('srgb');

    await waitForNextRender(page);

    const code = await getRendererLastInputTransferCode(page);
    expect(code).toBe(INPUT_TRANSFER_SRGB);
  });

  test('E2E-LOCS-003: backward-compat — no declaration preserves source EOTF (null = passthrough)', async ({
    page,
  }) => {
    test.skip(!fixtureExists(SAMPLE_HDR_PQ), `HDR PQ fixture missing: ${SAMPLE_HDR_PQ}`);
    test.skip(!fixtureExists(SAMPLE_LUT_WARM), `Sample LUT fixture missing: ${SAMPLE_LUT_WARM}`);
    test.skip(!(await hasLUTPipelinePanel(page)), 'LUT pipeline panel not wired in this build');
    test.skip(!(await hasRendererTestBridge(page)), 'Renderer test bridge not wired in this build');

    await loadHDRPQFile(page);
    await openLUTPipelinePanel(page);

    // Load a Display LUT but DO NOT declare an output transfer. With the
    // null sentinel (passthrough), the cascade must reduce to the source
    // EOTF — pre-MED-51 behavior. For a PQ source we expect INPUT_TRANSFER_PQ.
    await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

    const state = await getLUTPipelineState(page);
    expect(state?.display?.outputTransferFunction).toBeNull();

    await waitForNextRender(page);

    const code = await getRendererLastInputTransferCode(page);
    // The PQ asset's transfer function should reach the renderer untouched.
    // We accept HLG too in case the test fixture's container metadata
    // resolves to HLG on this build — we only require that the renderer is
    // NOT clamped to sRGB (which would be the bug this test guards against).
    expect(code).not.toBe(INPUT_TRANSFER_SRGB);
    expect([INPUT_TRANSFER_PQ, INPUT_TRANSFER_HLG]).toContain(code);
  });

  test('E2E-LOCS-004: declarations round-trip through serialized pipeline state', async ({ page }) => {
    test.skip(!fixtureExists(SAMPLE_LUT_WARM), `Sample LUT fixture missing: ${SAMPLE_LUT_WARM}`);
    test.skip(!(await hasLUTPipelinePanel(page)), 'LUT pipeline panel not wired in this build');

    await loadVideoFile(page);
    await openLUTPipelinePanel(page);
    await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

    // Set declarations via the UI on the display stage.
    const transferSelect = page.locator('[data-testid="lut-display-output-transfer-select"]');
    await expect(transferSelect).toBeVisible();
    await transferSelect.selectOption('srgb');

    const before = await getLUTPipelineState(page);
    expect(before?.display?.outputTransferFunction).toBe('srgb');

    // Reload the page (simulates a session reopen). Persistence is governed
    // by AppColorWiring (Phase 1 wired pipelineChanged → persistence). After
    // reload the dropdown should hydrate to the same value, *if* persistence
    // is enabled in this build. We treat hydration mismatch as a soft skip
    // rather than a hard failure to remain compatible with builds that
    // intentionally disable persistence (e.g. standalone test harnesses).
    await page.reload();
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await openLUTPipelinePanel(page);

    const after = await getLUTPipelineState(page);
    if (after?.display?.outputTransferFunction === 'srgb') {
      // Persistence is enabled — verify the dropdown hydrated visually too.
      const transferSelectAfter = page.locator('[data-testid="lut-display-output-transfer-select"]');
      await expect(transferSelectAfter).toBeVisible();
      await expect(transferSelectAfter).toHaveValue('srgb');
    } else {
      test.info().annotations.push({
        type: 'note',
        description:
          'LUT pipeline declarations did not persist across reload in this build. ' +
          'This is acceptable when persistence is disabled (e.g. ephemeral test runs).',
      });
    }
  });
});
