import { test, expect } from '@playwright/test';
import { loadVideoFile, waitForTestHelper, getSessionState, openKeyboardShortcutsDialog, openCustomKeyBindingsDialog } from './fixtures';

/**
 * Custom Keybindings Tests
 *
 * Tests for the custom keybindings dialog: opening, rebinding keys,
 * conflict detection, reset, persistence, and cancel behavior.
 */

test.describe('Custom Keybindings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('CKB-001: open custom keybindings dialog via header menu', async ({ page }) => {
    await openCustomKeyBindingsDialog(page);

    // The custom keybindings dialog should be visible
    const dialog = page.locator('[data-testid="custom-keybindings-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Verify dialog has binding rows
    const rows = dialog.locator('[data-testid="binding-row"]');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('CKB-002: rebind an action to a new key', async ({ page }) => {
    await openCustomKeyBindingsDialog(page);

    const dialog = page.locator('[data-testid="custom-keybindings-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Click the first binding row's rebind button
    const firstRow = dialog.locator('[data-testid="binding-row"]').first();
    const rebindButton = firstRow.locator('[data-testid="rebind-button"], button:has-text("Rebind"), button:has-text("Edit")').first();
    await rebindButton.click();
    await page.waitForTimeout(200);

    // A "press a key" prompt should appear
    const prompt = page.locator('[data-testid="key-capture-prompt"], .key-capture-prompt');
    await expect(prompt).toBeVisible({ timeout: 2000 });

    // Press a new key combination
    await page.keyboard.press('Shift+X');
    await page.waitForTimeout(300);

    // Confirm the binding was captured - the row should now show "Shift+X" or similar
    const bindingText = await firstRow.locator('[data-testid="binding-key"], .binding-key').first().textContent();
    expect(bindingText).toContain('Shift');
    expect(bindingText).toContain('X');
  });

  test('CKB-003: rebound key executes the correct action', async ({ page }) => {
    await openCustomKeyBindingsDialog(page);

    const dialog = page.locator('[data-testid="custom-keybindings-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Find the "Play/Pause" action row and rebind it
    const playRow = dialog.locator('[data-testid="binding-row"]').filter({ hasText: /Play|play/ }).first();
    const rebindButton = playRow.locator('[data-testid="rebind-button"], button:has-text("Rebind"), button:has-text("Edit")').first();
    await rebindButton.click();
    await page.waitForTimeout(200);

    // Bind to Shift+P
    await page.keyboard.press('Shift+P');
    await page.waitForTimeout(300);

    // Save / close dialog
    const saveButton = dialog.locator('button:has-text("Save"), button:has-text("Apply"), button:has-text("Done")').first();
    if (await saveButton.isVisible().catch(() => false)) {
      await saveButton.click();
      await page.waitForTimeout(200);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // Verify the app is not playing
    let state = await getSessionState(page);
    expect(state.isPlaying).toBe(false);

    // Press the newly bound key
    await page.keyboard.press('Shift+P');
    await page.waitForTimeout(200);

    // Verify playback toggled
    state = await getSessionState(page);
    expect(state.isPlaying).toBe(true);

    // Press again to pause
    await page.keyboard.press('Shift+P');
    await page.waitForTimeout(200);

    state = await getSessionState(page);
    expect(state.isPlaying).toBe(false);
  });

  test('CKB-004: conflict detection when assigning duplicate key combo', async ({ page }) => {
    await openCustomKeyBindingsDialog(page);

    const dialog = page.locator('[data-testid="custom-keybindings-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Get all binding rows
    const rows = dialog.locator('[data-testid="binding-row"]');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);

    // Read the current key of the second action
    const secondRowKey = await rows.nth(1).locator('[data-testid="binding-key"], .binding-key').first().textContent();

    // Try to rebind the first action to the same key as the second action
    const firstRebind = rows.first().locator('[data-testid="rebind-button"], button:has-text("Rebind"), button:has-text("Edit")').first();
    await firstRebind.click();
    await page.waitForTimeout(200);

    // Type the key that is already used by the second action
    // We need to simulate the exact key combo from secondRowKey
    // For this test, we press Space (which is commonly bound to Play/Pause)
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    // A conflict warning should appear
    const conflictWarning = page.locator(
      '[data-testid="binding-conflict-warning"], .conflict-warning, .binding-conflict, [role="alert"]:has-text("conflict"), [role="alert"]:has-text("already")'
    ).first();
    const hasConflict = await conflictWarning.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasConflict).toBe(true);
  });

  test('CKB-005: reset a single binding to its default', async ({ page }) => {
    await openCustomKeyBindingsDialog(page);

    const dialog = page.locator('[data-testid="custom-keybindings-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Get the first row's original key display
    const firstRow = dialog.locator('[data-testid="binding-row"]').first();
    const originalKey = await firstRow.locator('[data-testid="binding-key"], .binding-key').first().textContent();

    // Rebind it to something else
    const rebindButton = firstRow.locator('[data-testid="rebind-button"], button:has-text("Rebind"), button:has-text("Edit")').first();
    await rebindButton.click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Shift+F12');
    await page.waitForTimeout(300);

    // Verify binding changed
    const modifiedKey = await firstRow.locator('[data-testid="binding-key"], .binding-key').first().textContent();
    expect(modifiedKey).not.toBe(originalKey);

    // Click the reset button for this specific binding
    const resetButton = firstRow.locator('[data-testid="reset-binding-button"], button:has-text("Reset"), button[title*="Reset"]').first();
    await resetButton.click();
    await page.waitForTimeout(200);

    // Verify the key was restored to the original
    const restoredKey = await firstRow.locator('[data-testid="binding-key"], .binding-key').first().textContent();
    expect(restoredKey).toBe(originalKey);
  });

  test('CKB-006: reset all bindings to defaults', async ({ page }) => {
    await openCustomKeyBindingsDialog(page);

    const dialog = page.locator('[data-testid="custom-keybindings-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Modify the first two bindings
    for (let i = 0; i < 2; i++) {
      const row = dialog.locator('[data-testid="binding-row"]').nth(i);
      const rebindButton = row.locator('[data-testid="rebind-button"], button:has-text("Rebind"), button:has-text("Edit")').first();
      await rebindButton.click();
      await page.waitForTimeout(200);
      // Assign a unique unlikely key
      await page.keyboard.press(i === 0 ? 'Shift+F11' : 'Shift+F10');
      await page.waitForTimeout(300);
    }

    // Click "Reset All" button
    const resetAllButton = dialog.locator('[data-testid="reset-all-bindings-button"], button:has-text("Reset All"), button:has-text("Restore Defaults")').first();
    await resetAllButton.click();
    await page.waitForTimeout(300);

    // If there is a confirmation dialog, accept it
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("OK")').first();
    if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmButton.click();
      await page.waitForTimeout(200);
    }

    // Verify that neither row shows the custom keys we assigned
    for (let i = 0; i < 2; i++) {
      const row = dialog.locator('[data-testid="binding-row"]').nth(i);
      const keyText = await row.locator('[data-testid="binding-key"], .binding-key').first().textContent();
      expect(keyText).not.toContain('F11');
      expect(keyText).not.toContain('F10');
    }
  });

  test('CKB-007: custom keybindings persist across page reload', async ({ page }) => {
    await openCustomKeyBindingsDialog(page);

    const dialog = page.locator('[data-testid="custom-keybindings-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Rebind the first action to Shift+F9
    const firstRow = dialog.locator('[data-testid="binding-row"]').first();
    const rebindButton = firstRow.locator('[data-testid="rebind-button"], button:has-text("Rebind"), button:has-text("Edit")').first();
    await rebindButton.click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Shift+F9');
    await page.waitForTimeout(300);

    // Save and close
    const saveButton = dialog.locator('button:has-text("Save"), button:has-text("Apply"), button:has-text("Done")').first();
    if (await saveButton.isVisible().catch(() => false)) {
      await saveButton.click();
      await page.waitForTimeout(200);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // Reload the page
    await page.reload();
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    // Re-open keybindings dialog
    await openCustomKeyBindingsDialog(page);

    const dialog2 = page.locator('[data-testid="custom-keybindings-dialog"]');
    await expect(dialog2).toBeVisible({ timeout: 3000 });

    // Verify the first row still shows Shift+F9
    const firstRow2 = dialog2.locator('[data-testid="binding-row"]').first();
    const keyText = await firstRow2.locator('[data-testid="binding-key"], .binding-key').first().textContent();
    expect(keyText).toContain('F9');
  });

  test('CKB-008: cancel rebind dialog without saving changes', async ({ page }) => {
    await openCustomKeyBindingsDialog(page);

    const dialog = page.locator('[data-testid="custom-keybindings-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Remember the original key for the first binding
    const firstRow = dialog.locator('[data-testid="binding-row"]').first();
    const originalKey = await firstRow.locator('[data-testid="binding-key"], .binding-key').first().textContent();

    // Start rebinding
    const rebindButton = firstRow.locator('[data-testid="rebind-button"], button:has-text("Rebind"), button:has-text("Edit")').first();
    await rebindButton.click();
    await page.waitForTimeout(200);

    // The key capture prompt should be visible
    const prompt = page.locator('[data-testid="key-capture-prompt"], .key-capture-prompt');
    await expect(prompt).toBeVisible({ timeout: 2000 });

    // Cancel by pressing Escape instead of a new key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // The prompt should be dismissed
    await expect(prompt).not.toBeVisible({ timeout: 2000 });

    // The binding should remain unchanged
    const currentKey = await firstRow.locator('[data-testid="binding-key"], .binding-key').first().textContent();
    expect(currentKey).toBe(originalKey);
  });
});
