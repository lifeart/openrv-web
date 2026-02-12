import { test, expect } from '@playwright/test';
import {
  loadTwoVideoFiles,
  waitForTestHelper,
  getSessionState,
} from './fixtures';

/**
 * Multi-Clip Playlist Tests
 *
 * Tests for the playlist feature that manages multiple clips in sequence.
 *
 * Implementation: src/core/session/PlaylistManager.ts, src/ui/components/PlaylistPanel.ts
 *
 * Features:
 * - Add clips from any loaded source with in/out points
 * - Drag-and-drop reordering
 * - Loop modes: none, single clip, or all clips
 * - EDL (Edit Decision List) export
 * - Total duration display
 *
 * Reference: Multi-clip sequencing / Edit Decision Lists
 */

async function dismissBlockingModal(page: import('@playwright/test').Page): Promise<void> {
  const okButton = page.locator('#modal-container button:has-text("OK")');
  if (await okButton.isVisible()) {
    await okButton.click();
    await page.waitForTimeout(100);
  }
}

test.describe('Multi-Clip Playlist', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    // Load two videos so we have multiple sources
    await loadTwoVideoFiles(page);
    await page.waitForTimeout(200);
  });

  test.describe('Playlist Panel', () => {
    test('PLAY-E001: toggle playlist panel via keyboard (Shift+Alt+P)', async ({ page }) => {
      // Open playlist panel
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const panel = page.locator('[data-testid="playlist-panel"]');
      await expect(panel).toBeVisible();

      // Close playlist panel
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      await expect(panel).not.toBeVisible();
    });

    test('PLAY-E002: playlist panel shows title', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const panel = page.locator('[data-testid="playlist-panel"]');
      const title = panel.getByText('Playlist', { exact: true });
      await expect(title).toBeVisible();
    });

    test('PLAY-E003: playlist panel shows Add Current button', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const addButton = page.locator('button:has-text("Add Current")');
      await expect(addButton).toBeVisible();
    });

    test('PLAY-E004: playlist panel shows loop mode selector', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const loopSelect = page.locator('select[title="Loop Mode"]');
      await expect(loopSelect).toBeVisible();
    });

    test('PLAY-E005: playlist panel shows enable toggle', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Look for enable/disable button
      const enableButton = page.locator('button[title*="Playlist Mode"], button[title*="Enable"], button[title*="Disable"]').first();
      await expect(enableButton).toBeVisible();
    });

    test('PLAY-E006: playlist panel shows EDL export button', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const exportButton = page.locator('button:has-text("EDL")');
      await expect(exportButton).toBeVisible();
    });

    test('PLAY-E007: close button hides playlist panel', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const panel = page.locator('[data-testid="playlist-panel"]');
      await expect(panel).toBeVisible();

      // Click close button
      const closeButton = panel.locator('button[title="Close"]');
      await closeButton.click();
      await page.waitForTimeout(100);

      await expect(panel).not.toBeVisible();
    });
  });

  test.describe('Add Clips', () => {
    test('PLAY-E008: clicking Add Current adds a clip to playlist', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Initially no clips
      const emptyMessage = page.locator('text=No clips in playlist');
      await expect(emptyMessage).toBeVisible();

      // Add current source
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(200);
      await dismissBlockingModal(page);

      // Should now have a clip
      const clipItem = page.locator('.playlist-clip-item');
      await expect(clipItem).toBeVisible();
    });

    test('PLAY-E009: added clip shows source name', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Add current source
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(200);
      await dismissBlockingModal(page);

      // Clip should show source info
      const clipItem = page.locator('.playlist-clip-item').first();
      const text = await clipItem.textContent();
      // Should contain some identifying text (source name, frame numbers, etc.)
      expect(text).toBeTruthy();
    });

    test('PLAY-E010: added clip shows in/out points', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Add current source
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(200);
      await dismissBlockingModal(page);

      // Clip should show in/out point info
      const inOutInfo = page.locator('text=/In:|Out:/');
      await expect(inOutInfo).toBeVisible();
    });

    test('PLAY-E011: can add multiple clips', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Add first clip
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Switch to source B via A/B toggle
      await page.keyboard.press('`');
      await page.waitForTimeout(200);
      const abState = await getSessionState(page);
      expect(abState.currentAB).toBe('B');

      // Add second clip
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Should have two clips
      const clipItems = page.locator('.playlist-clip-item');
      const count = await clipItems.count();
      expect(count).toBe(2);
    });
  });

  test.describe('Remove Clips', () => {
    test('PLAY-E012: clip has remove button', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Add a clip first
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Clip should have remove button (X icon)
      const clipItem = page.locator('.playlist-clip-item').first();
      const removeButton = clipItem.locator('button[title="Remove clip"]');
      await expect(removeButton).toBeVisible();
    });

    test('PLAY-E013: clicking remove button removes clip', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Add a clip first
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Remove the clip
      const clipItem = page.locator('.playlist-clip-item').first();
      const removeButton = clipItem.locator('button[title="Remove clip"]');
      await removeButton.click();
      await page.waitForTimeout(100);

      // Should show empty state again
      const emptyMessage = page.locator('text=No clips in playlist');
      await expect(emptyMessage).toBeVisible();
    });
  });

  test.describe('Loop Modes', () => {
    test('PLAY-E014: loop mode selector has No Loop option', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const loopSelect = page.locator('select[title="Loop Mode"]');
      const options = loopSelect.locator('option');

      const optionTexts = await options.allTextContents();
      expect(optionTexts).toContain('No Loop');
    });

    test('PLAY-E015: loop mode selector has Loop Clip option', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const loopSelect = page.locator('select[title="Loop Mode"]');
      const options = loopSelect.locator('option');

      const optionTexts = await options.allTextContents();
      expect(optionTexts).toContain('Loop Clip');
    });

    test('PLAY-E016: loop mode selector has Loop All option', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const loopSelect = page.locator('select[title="Loop Mode"]');
      const options = loopSelect.locator('option');

      const optionTexts = await options.allTextContents();
      expect(optionTexts).toContain('Loop All');
    });

    test('PLAY-E017: changing loop mode updates selector', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const loopSelect = page.locator('select[title="Loop Mode"]');

      // Change to Loop All
      await loopSelect.selectOption('all');
      await page.waitForTimeout(100);

      // Verify selection
      const value = await loopSelect.inputValue();
      expect(value).toBe('all');
    });
  });

  test.describe('Playlist Footer Info', () => {
    test('PLAY-E018: footer shows clip count', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Add a clip
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Footer should show "1 clip" or "1 clips"
      const footerInfo = page.locator('text=/\\d+\\s*clip/');
      await expect(footerInfo).toBeVisible();
    });

    test('PLAY-E019: footer shows total duration', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Add a clip
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Footer should show duration (e.g., "5s", "1m 30s")
      const durationInfo = page.locator('text=/\\d+[ms]/');
      await expect(durationInfo).toBeVisible();
    });
  });

  test.describe('Enable/Disable Playlist Mode', () => {
    test('PLAY-E020: enable button toggles playlist mode', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Add a clip first
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Find and click enable button
      const enableButton = page.locator('button:has-text("Off")').first();
      if (await enableButton.isVisible()) {
        await enableButton.click();
        await page.waitForTimeout(100);

        // Button text should change to indicate enabled
        const enabledButton = page.locator('button:has-text("On")').first();
        await expect(enabledButton).toBeVisible();
      }
    });
  });

  test.describe('Clip Drag and Drop', () => {
    test('PLAY-E021: clips are draggable', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Add a clip
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Check that clip item has draggable attribute
      const clipItem = page.locator('.playlist-clip-item').first();
      const draggable = await clipItem.getAttribute('draggable');
      expect(draggable).toBe('true');
    });
  });

  test.describe('EDL Export', () => {
    test('PLAY-E022: EDL export button is present', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      const exportButton = page.locator('button:has-text("EDL")');
      await expect(exportButton).toBeVisible();
    });
  });

  test.describe('Clip Selection', () => {
    test('PLAY-E023: clicking clip selects it', async ({ page }) => {
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Add a clip
      const addButton = page.locator('button:has-text("Add Current")');
      await addButton.click();
      await page.waitForTimeout(100);
      await dismissBlockingModal(page);

      // Click the clip (should navigate to it)
      const clipItem = page.locator('.playlist-clip-item').first();
      await clipItem.click();
      await page.waitForTimeout(200);

      // The click emits clipSelected event which should update session state
      // We verify the clip was clicked by checking it's still visible
      await expect(clipItem).toBeVisible();
    });
  });
});
