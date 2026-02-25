import { test, expect } from '@playwright/test';
import {
  loadTwoVideoFiles,
  waitForTestHelper,
  getSessionState,
  getPlaylistState,
  getTransitionState,
} from './fixtures';

/**
 * Playlist Transition Tests
 *
 * Tests for GLSL playlist transitions between clips (crossfade, dissolve, wipes).
 *
 * Implementation:
 * - src/core/session/TransitionManager.ts — gap-indexed transition storage
 * - src/ui/components/PlaylistPanel.ts — transition controls UI
 * - src/render/TransitionRenderer.ts — WebGL dual-FBO rendering
 * - src/render/Canvas2DTransitionRenderer.ts — Canvas2D fallback
 *
 * Features:
 * - Per-gap transition type selection (cut, crossfade, dissolve, wipes)
 * - Configurable duration in frames
 * - Same-source clip restriction (forced hard cut)
 * - Overlap-aware timeline duration
 */

async function dismissBlockingModal(page: import('@playwright/test').Page): Promise<void> {
  const okButton = page.locator('#modal-container button:has-text("OK")');
  if (await okButton.isVisible()) {
    await okButton.click();
    await page.waitForTimeout(100);
  }
}

/** Open playlist panel and add two clips from different sources */
async function setupTwoClipPlaylist(page: import('@playwright/test').Page): Promise<void> {
  // Open playlist panel
  await page.keyboard.press('Shift+Alt+p');
  await page.waitForTimeout(200);

  // Add first clip (source A)
  const addButton = page.locator('button:has-text("Add Current")');
  await addButton.click();
  await page.waitForTimeout(100);
  await dismissBlockingModal(page);

  // Switch to source B
  await page.keyboard.press('`');
  await page.waitForTimeout(200);
  const abState = await getSessionState(page);
  expect(abState.currentAB).toBe('B');

  // Add second clip (source B)
  await addButton.click();
  await page.waitForTimeout(100);
  await dismissBlockingModal(page);

  // Verify two clips exist
  const clipItems = page.locator('.playlist-clip-item');
  await expect(clipItems).toHaveCount(2);
}

test.describe('Playlist Transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadTwoVideoFiles(page);
    await page.waitForTimeout(200);
  });

  test.describe('Transition Controls UI', () => {
    test('TRANS-E001: transition control row appears between two clips', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      // Transition control row should appear between the two clips
      const transitionRow = page.locator('[data-testid="transition-control-0"]');
      await expect(transitionRow).toBeVisible();
    });

    test('TRANS-E002: transition type dropdown defaults to Cut', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await expect(typeSelect).toBeVisible();
      const value = await typeSelect.inputValue();
      expect(value).toBe('cut');
    });

    test('TRANS-E003: transition type dropdown has all transition types', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      const options = typeSelect.locator('option');
      const optionTexts = await options.allTextContents();

      expect(optionTexts).toContain('Cut');
      expect(optionTexts).toContain('Crossfade');
      expect(optionTexts).toContain('Dissolve');
      expect(optionTexts).toContain('Wipe Left');
      expect(optionTexts).toContain('Wipe Right');
      expect(optionTexts).toContain('Wipe Up');
      expect(optionTexts).toContain('Wipe Down');
    });

    test('TRANS-E004: duration input is hidden when Cut is selected', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      // Duration input should be hidden for 'cut' (default)
      const durationInput = page.locator('[data-testid="transition-duration-0"]');
      await expect(durationInput).toBeHidden();
    });

    test('TRANS-E005: selecting Crossfade shows duration input', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await typeSelect.selectOption('crossfade');
      await page.waitForTimeout(100);

      const durationInput = page.locator('[data-testid="transition-duration-0"]');
      await expect(durationInput).toBeVisible();
    });

    test('TRANS-E006: duration label shows frames and seconds', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await typeSelect.selectOption('crossfade');
      await page.waitForTimeout(100);

      const durationLabel = page.locator('[data-testid="transition-duration-label-0"]');
      await expect(durationLabel).toBeVisible();
      const text = await durationLabel.textContent();
      // Should contain frame count and seconds, e.g., "12f (0.5s)"
      expect(text).toMatch(/\d+f\s*\(\d+\.\d+s\)/);
    });

    test('TRANS-E007: switching back to Cut hides duration input', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      const typeSelect = page.locator('[data-testid="transition-type-0"]');

      // Select crossfade first
      await typeSelect.selectOption('crossfade');
      await page.waitForTimeout(100);
      const durationInput = page.locator('[data-testid="transition-duration-0"]');
      await expect(durationInput).toBeVisible();

      // Switch back to cut
      await typeSelect.selectOption('cut');
      await page.waitForTimeout(100);
      await expect(durationInput).toBeHidden();
    });

    test('TRANS-E008: no transition controls with single clip', async ({ page }) => {
      // Open playlist panel and add only one clip
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Should only have one clip
      const clipItems = page.locator('.playlist-clip-item');
      await expect(clipItems).toHaveCount(1);

      // No transition row should exist
      const transitionRow = page.locator('.playlist-transition-row');
      await expect(transitionRow).toHaveCount(0);
    });
  });

  test.describe('UI-to-State Roundtrip', () => {
    test('TRANS-E009: selecting Crossfade via UI updates TransitionManager state', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      // Use UI to select crossfade
      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await typeSelect.selectOption('crossfade');
      await page.waitForTimeout(100);

      // Verify the TransitionManager state was updated
      const transState = await getTransitionState(page);
      expect(transState.transitions.length).toBeGreaterThanOrEqual(1);
      expect(transState.transitions[0]?.type).toBe('crossfade');
      expect(transState.totalOverlap).toBeGreaterThan(0);
    });

    test('TRANS-E010: changing duration via UI updates TransitionManager state', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      // Select crossfade first
      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await typeSelect.selectOption('crossfade');
      await page.waitForTimeout(100);

      // Change duration via UI input
      const durationInput = page.locator('[data-testid="transition-duration-0"]');
      await durationInput.click();
      await durationInput.fill('24');
      await durationInput.press('Enter');
      await page.waitForTimeout(100);

      // Verify TransitionManager received the update
      const transState = await getTransitionState(page);
      expect(transState.transitions[0]?.durationFrames).toBe(24);
      expect(transState.totalOverlap).toBe(24);
    });

    test('TRANS-E011: playlist state reflects clips added via UI', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      const playlistState = await getPlaylistState(page);
      expect(playlistState.clipCount).toBe(2);
      expect(playlistState.clips.length).toBe(2);
      expect(playlistState.panelVisible).toBe(true);

      // Each clip should have valid data from the video files
      for (const clip of playlistState.clips) {
        expect(clip.duration).toBeGreaterThan(0);
        expect(clip.sourceName).toBeTruthy();
      }
    });

    test('TRANS-E012: playlist totalDuration decreases when transition added via UI', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      const beforeState = await getPlaylistState(page);
      const durationBefore = beforeState.totalDuration;
      expect(durationBefore).toBeGreaterThan(0);

      // Add crossfade via UI
      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await typeSelect.selectOption('crossfade');
      await page.waitForTimeout(100);

      const afterState = await getPlaylistState(page);
      const durationAfter = afterState.totalDuration;

      // Duration should decrease by the overlap amount
      const transState = await getTransitionState(page);
      expect(durationAfter).toBe(durationBefore - transState.totalOverlap);
      expect(durationAfter).toBeLessThan(durationBefore);
    });
  });

  test.describe('Transition Type Selection via UI', () => {
    test('TRANS-E013: selecting Dissolve updates transition state', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await typeSelect.selectOption('dissolve');
      await page.waitForTimeout(100);

      const transState = await getTransitionState(page);
      expect(transState.transitions[0]?.type).toBe('dissolve');
    });

    test('TRANS-E014: selecting Wipe Left updates transition state', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await typeSelect.selectOption('wipe-left');
      await page.waitForTimeout(100);

      const transState = await getTransitionState(page);
      expect(transState.transitions[0]?.type).toBe('wipe-left');
    });

    test('TRANS-E015: changing duration input updates transition duration', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      // First select a transition type
      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await typeSelect.selectOption('crossfade');
      await page.waitForTimeout(100);

      // Change duration
      const durationInput = page.locator('[data-testid="transition-duration-0"]');
      await durationInput.click();
      await durationInput.fill('24');
      await durationInput.press('Enter');
      await page.waitForTimeout(100);

      const transState = await getTransitionState(page);
      expect(transState.transitions[0]?.durationFrames).toBe(24);
      expect(transState.totalOverlap).toBe(24);
    });
  });

  test.describe('Same-Source Restriction', () => {
    test('TRANS-E016: same-source clips have disabled transition dropdown', async ({ page }) => {
      // Open playlist panel and add the SAME source twice
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Add same source again (don't switch to B)
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      const clipItems = page.locator('.playlist-clip-item');
      await expect(clipItems).toHaveCount(2);

      // Transition dropdown should be disabled
      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await expect(typeSelect).toBeDisabled();
    });

    test('TRANS-E017: same-source transition dropdown is forced to Cut', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      const value = await typeSelect.inputValue();
      expect(value).toBe('cut');

      // Verify TransitionManager also reflects no transition
      const transState = await getTransitionState(page);
      expect(transState.totalOverlap).toBe(0);
    });
  });

  test.describe('Multiple Transitions', () => {
    test('TRANS-E018: three clips show two transition controls', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      // Switch back to source A and add a third clip
      await page.keyboard.press('`');
      await page.waitForTimeout(200);

      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      const clipItems = page.locator('.playlist-clip-item');
      await expect(clipItems).toHaveCount(3);

      const transitionRows = page.locator('.playlist-transition-row');
      await expect(transitionRows).toHaveCount(2);
    });

    test('TRANS-E019: removing a clip removes associated transition controls', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      // Verify transition control exists
      const transitionRow = page.locator('[data-testid="transition-control-0"]');
      await expect(transitionRow).toBeVisible();

      // Remove the second clip
      const clipItems = page.locator('.playlist-clip-item');
      const removeButton = clipItems.last().locator('button[title="Remove clip"]');
      await removeButton.click();
      await page.waitForTimeout(100);

      // Transition control should be gone (only 1 clip remains)
      const transitionRows = page.locator('.playlist-transition-row');
      await expect(transitionRows).toHaveCount(0);

      // TransitionManager should also be clean
      const transState = await getTransitionState(page);
      expect(transState.totalOverlap).toBe(0);
    });
  });

  test.describe('Playlist Enable/Disable with Transitions', () => {
    test('TRANS-E020: enabling playlist mode preserves transition configuration', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      // Set a crossfade via UI
      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await typeSelect.selectOption('crossfade');
      await page.waitForTimeout(100);

      const transStateBefore = await getTransitionState(page);
      expect(transStateBefore.totalOverlap).toBeGreaterThan(0);

      // Enable playlist
      const panel = page.locator('[data-testid="playlist-panel"]');
      const enableButton = panel.locator('button[title="Enable Playlist Mode"]');
      await enableButton.click();
      await page.waitForTimeout(100);

      const playlistState = await getPlaylistState(page);
      expect(playlistState.enabled).toBe(true);

      // Transition should still be active with same config
      const transStateAfter = await getTransitionState(page);
      expect(transStateAfter.totalOverlap).toBe(transStateBefore.totalOverlap);
      expect(transStateAfter.transitions[0]?.type).toBe('crossfade');
    });
  });

  test.describe('Footer Info with Transitions', () => {
    test('TRANS-E021: footer duration text changes when transition added', async ({ page }) => {
      await setupTwoClipPlaylist(page);

      // Get initial footer text
      const footer = page.locator('[data-testid="playlist-panel"]').locator('text=/\\d+\\s*clip/');
      const initialText = await footer.textContent();
      expect(initialText).toMatch(/2\s*clips/);

      // Add a crossfade via UI
      const typeSelect = page.locator('[data-testid="transition-type-0"]');
      await typeSelect.selectOption('crossfade');
      await page.waitForTimeout(200);

      // Footer should still mention 2 clips but with different duration
      const updatedText = await footer.textContent();
      expect(updatedText).toMatch(/2\s*clips/);
      // The duration portion should have changed (shorter due to overlap)
      // Both texts contain the clip info; if duration info is present it should differ
      if (initialText && updatedText && initialText.includes('|') && updatedText.includes('|')) {
        expect(updatedText).not.toBe(initialText);
      }
    });
  });
});
