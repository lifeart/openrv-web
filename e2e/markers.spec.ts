import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getSessionState,
  waitForTestHelper,
} from './fixtures';

/**
 * Marker List Panel Feature Tests
 *
 * These tests verify the markers panel functionality,
 * including visibility toggle, marker management, and note editing.
 */

test.describe('Marker List Panel Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('MKR-E001: marker panel is hidden by default', async ({ page }) => {
    const markerPanel = page.locator('[data-testid="marker-list-panel"]');
    await expect(markerPanel).toBeHidden();
  });

  test('MKR-E002: pressing Shift+Alt+M toggles marker panel visibility', async ({ page }) => {
    const markerPanel = page.locator('[data-testid="marker-list-panel"]');
    await expect(markerPanel).toBeHidden();

    await page.keyboard.press('Shift+Alt+KeyM');
    await page.waitForTimeout(100);

    await expect(markerPanel).toBeVisible();

    await page.keyboard.press('Shift+Alt+KeyM');
    await page.waitForTimeout(100);

    await expect(markerPanel).toBeHidden();
  });

  test('MKR-E003: clicking close button hides marker panel', async ({ page }) => {
    // Show panel
    await page.keyboard.press('Shift+Alt+KeyM');
    await page.waitForTimeout(100);

    const markerPanel = page.locator('[data-testid="marker-list-panel"]');
    await expect(markerPanel).toBeVisible();

    // Click close button
    const closeButton = page.locator('[data-testid="marker-close-btn"]');
    await closeButton.click();
    await page.waitForTimeout(100);

    await expect(markerPanel).toBeHidden();
  });
});

test.describe('Marker Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show marker panel
    await page.keyboard.press('Shift+Alt+KeyM');
    await page.waitForTimeout(100);
  });

  test('MKR-E010: empty state message shown when no markers', async ({ page }) => {
    const entriesContainer = page.locator('[data-testid="marker-entries"]');
    await expect(entriesContainer).toContainText('No markers yet');
  });

  test('MKR-E011: pressing M adds marker at current frame', async ({ page }) => {
    // Initially no markers
    let state = await getSessionState(page);
    expect(state.markers.length).toBe(0);

    // Add marker with M key
    await page.keyboard.press('m');
    await page.waitForTimeout(100);

    state = await getSessionState(page);
    expect(state.markers.length).toBe(1);
    expect(state.markers[0]?.frame).toBe(state.currentFrame);
  });

  test('MKR-E012: clicking Add button adds marker at current frame', async ({ page }) => {
    const addButton = page.locator('[data-testid="marker-add-btn"]');
    await addButton.click();
    await page.waitForTimeout(100);

    const state = await getSessionState(page);
    expect(state.markers.length).toBe(1);
  });

  test('MKR-E013: marker entry appears in panel after adding', async ({ page }) => {
    await page.keyboard.press('m');
    await page.waitForTimeout(100);

    const state = await getSessionState(page);
    const markerEntry = page.locator(`[data-testid="marker-entry-${state.currentFrame}"]`);
    await expect(markerEntry).toBeVisible();
  });

  test('MKR-E014: clicking Clear All removes all markers', async ({ page }) => {
    // Add multiple markers
    await page.keyboard.press('m');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);
    await page.keyboard.press('m');
    await page.waitForTimeout(100);

    let state = await getSessionState(page);
    expect(state.markers.length).toBe(2);

    // Clear all
    const clearButton = page.locator('[data-testid="marker-clear-btn"]');
    await clearButton.click();
    await page.waitForTimeout(100);

    state = await getSessionState(page);
    expect(state.markers.length).toBe(0);
  });
});

test.describe('Marker Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show marker panel
    await page.keyboard.press('Shift+Alt+KeyM');
    await page.waitForTimeout(100);
  });

  test('MKR-E020: clicking marker entry navigates to that frame', async ({ page }) => {
    // Add marker at frame 1
    await page.keyboard.press('m');
    await page.waitForTimeout(50);

    // Move to frame 5
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(30);
    }

    const stateBefore = await getSessionState(page);
    expect(stateBefore.currentFrame).toBeGreaterThan(1);

    // Click on the marker entry (the frame info span)
    const markerEntry = page.locator('[data-testid^="marker-entry-"]').first();
    const frameInfo = markerEntry.locator('span').first();
    await frameInfo.click();
    await page.waitForTimeout(100);

    const stateAfter = await getSessionState(page);
    expect(stateAfter.currentFrame).toBe(stateBefore.markers[0]?.frame);
  });

  test('MKR-E021: current frame marker is highlighted', async ({ page }) => {
    // Add marker at current frame
    await page.keyboard.press('m');
    await page.waitForTimeout(100);

    const state = await getSessionState(page);
    const markerEntry = page.locator(`[data-testid="marker-entry-${state.currentFrame}"]`);

    // Should have highlight background
    const bgColor = await markerEntry.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bgColor).toContain('100'); // rgba(100, 150, 255, 0.15)
  });
});

test.describe('Marker Color Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show marker panel
    await page.keyboard.press('Shift+Alt+KeyM');
    await page.waitForTimeout(100);
    // Add a marker
    await page.keyboard.press('m');
    await page.waitForTimeout(100);
  });

  test('MKR-E030: marker has default color', async ({ page }) => {
    const state = await getSessionState(page);
    expect(state.markers[0]?.color).toBeDefined();
  });

  test('MKR-E031: clicking color button cycles marker color', async ({ page }) => {
    const state = await getSessionState(page);
    const initialColor = state.markers[0]?.color;

    const colorButton = page.locator(`[data-testid="marker-color-${state.currentFrame}"]`);
    await colorButton.click();
    await page.waitForTimeout(100);

    const newState = await getSessionState(page);
    expect(newState.markers[0]?.color).not.toBe(initialColor);
  });
});

test.describe('Marker Note Editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show marker panel
    await page.keyboard.press('Shift+Alt+KeyM');
    await page.waitForTimeout(100);
    // Add a marker
    await page.keyboard.press('m');
    await page.waitForTimeout(100);
  });

  test('MKR-E040: clicking edit button shows note input', async ({ page }) => {
    const state = await getSessionState(page);
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await expect(noteInput).toBeVisible();
  });

  test('MKR-E041: entering text and clicking save updates note', async ({ page }) => {
    const state = await getSessionState(page);

    // Click edit
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Type note
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.fill('Test note content');

    // Save
    const saveButton = page.locator(`[data-testid="marker-save-${state.currentFrame}"]`);
    await saveButton.click();
    await page.waitForTimeout(100);

    // Verify note saved
    const newState = await getSessionState(page);
    expect(newState.markers[0]?.note).toBe('Test note content');
  });

  test('MKR-E042: Ctrl+Enter saves note', async ({ page }) => {
    const state = await getSessionState(page);

    // Click edit
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Type note and Ctrl+Enter
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.fill('Keyboard saved note');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);

    // Verify note saved
    const newState = await getSessionState(page);
    expect(newState.markers[0]?.note).toBe('Keyboard saved note');
  });

  test('MKR-E043: Escape cancels note editing', async ({ page }) => {
    const state = await getSessionState(page);

    // Click edit
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Type note and escape
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.fill('This should not be saved');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Verify note not saved
    const newState = await getSessionState(page);
    expect(newState.markers[0]?.note).toBe('');
  });
});

test.describe('Marker Deletion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show marker panel
    await page.keyboard.press('Shift+Alt+KeyM');
    await page.waitForTimeout(100);
    // Add a marker
    await page.keyboard.press('m');
    await page.waitForTimeout(100);
  });

  test('MKR-E050: clicking delete button removes marker', async ({ page }) => {
    const state = await getSessionState(page);
    expect(state.markers.length).toBe(1);

    const deleteButton = page.locator(`[data-testid="marker-delete-${state.currentFrame}"]`);
    await deleteButton.click();
    await page.waitForTimeout(100);

    const newState = await getSessionState(page);
    expect(newState.markers.length).toBe(0);
  });
});

/**
 * Keyboard Input Isolation Tests
 *
 * These tests verify that when typing in input fields (like marker notes),
 * keyboard shortcuts don't interfere with text input.
 * This is a regression test for the bug where Space would toggle playback
 * instead of inserting a space character.
 */
test.describe('Keyboard Input Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show marker panel
    await page.keyboard.press('Shift+Alt+KeyM');
    await page.waitForTimeout(100);
    // Add a marker
    await page.keyboard.press('m');
    await page.waitForTimeout(100);
  });

  test('MKR-R001: Space key inserts space in note input instead of toggling playback', async ({ page }) => {
    const state = await getSessionState(page);

    // Click edit to open note input
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Verify not playing initially
    let sessionState = await getSessionState(page);
    expect(sessionState.isPlaying).toBe(false);

    // Focus and type in the input including spaces
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.focus();
    await page.keyboard.type('Hello World');
    await page.waitForTimeout(100);

    // Verify playback was NOT triggered by space key
    sessionState = await getSessionState(page);
    expect(sessionState.isPlaying).toBe(false);

    // Verify the text was entered correctly with space
    const inputValue = await noteInput.inputValue();
    expect(inputValue).toBe('Hello World');
  });

  test('MKR-R002: Home/End keys move cursor in note input instead of navigating timeline', async ({ page }) => {
    const state = await getSessionState(page);

    // Click edit to open note input
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Get current frame
    const initialFrame = state.currentFrame;

    // Focus and type text
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.focus();
    await noteInput.fill('Test content');

    // Press Home and End keys
    await page.keyboard.press('Home');
    await page.waitForTimeout(50);
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    // Verify frame did NOT change (Home/End didn't navigate timeline)
    const newState = await getSessionState(page);
    expect(newState.currentFrame).toBe(initialFrame);
  });

  test('MKR-R003: Arrow keys work for text selection in note input', async ({ page }) => {
    const state = await getSessionState(page);
    const initialFrame = state.currentFrame;

    // Click edit to open note input
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Focus and type text
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.focus();
    await noteInput.fill('Test');

    // Press arrow keys (normally these navigate frames)
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Verify frame did NOT change
    const newState = await getSessionState(page);
    expect(newState.currentFrame).toBe(initialFrame);
  });

  test('MKR-R004: letter keys type in note input instead of triggering shortcuts', async ({ page }) => {
    const state = await getSessionState(page);

    // Click edit to open note input
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Focus the input
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.focus();

    // Type letters that are normally shortcuts (M = add marker, C = color panel, etc.)
    await page.keyboard.type('mcr');
    await page.waitForTimeout(100);

    // Verify text was entered
    const inputValue = await noteInput.inputValue();
    expect(inputValue).toBe('mcr');

    // Verify no new markers were added (M key didn't trigger)
    const newState = await getSessionState(page);
    expect(newState.markers.length).toBe(1); // Only the original marker
  });

  test('MKR-R005: keyboard shortcuts work normally when input is not focused', async ({ page }) => {
    const state = await getSessionState(page);
    const initialFrame = state.currentFrame;

    // Click somewhere outside the input to ensure it's not focused
    await page.click('body');
    await page.waitForTimeout(100);

    // Press ArrowRight - should navigate frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Verify frame changed
    const newState = await getSessionState(page);
    expect(newState.currentFrame).toBe(initialFrame + 1);
  });

  test('MKR-R006: Escape in note input cancels editing without other side effects', async ({ page }) => {
    const state = await getSessionState(page);

    // Click edit to open note input
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Focus and type text
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.focus();
    await noteInput.fill('Unsaved content');

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Verify the input is hidden (editing cancelled)
    await expect(noteInput).toBeHidden();

    // Verify the note was NOT saved
    const newState = await getSessionState(page);
    expect(newState.markers[0]?.note).toBe('');
  });

  test('MKR-R007: number keys type in note input instead of switching tabs', async ({ page }) => {
    const state = await getSessionState(page);

    // Click edit to open note input
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Focus the input
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.focus();

    // Type numbers (1-5 are normally tab shortcuts)
    await page.keyboard.type('12345');
    await page.waitForTimeout(100);

    // Verify text was entered
    const inputValue = await noteInput.inputValue();
    expect(inputValue).toBe('12345');
  });

  test('MKR-R008: Ctrl+Enter saves note from input field', async ({ page }) => {
    const state = await getSessionState(page);

    // Click edit to open note input
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Focus and type text
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.focus();
    await noteInput.fill('Note saved with keyboard');

    // Press Ctrl+Enter to save
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);

    // Verify the input is hidden (editing complete)
    await expect(noteInput).toBeHidden();

    // Verify the note was saved
    const newState = await getSessionState(page);
    expect(newState.markers[0]?.note).toBe('Note saved with keyboard');
  });

  test('MKR-R009: Enter key alone allows multiline input in note', async ({ page }) => {
    const state = await getSessionState(page);

    // Click edit to open note input (textarea supports multiline)
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    await editButton.click();
    await page.waitForTimeout(100);

    // Focus and type text with Enter for new line
    const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
    await noteInput.focus();
    await page.keyboard.type('Line 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 2');
    await page.waitForTimeout(100);

    // Verify the input still contains the text (Enter didn't submit)
    const inputValue = await noteInput.inputValue();
    expect(inputValue).toContain('Line 1');
    expect(inputValue).toContain('Line 2');

    // Verify editing is still active (not submitted)
    await expect(noteInput).toBeVisible();
  });
});

test.describe('Marker Panel Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show marker panel
    await page.keyboard.press('Shift+Alt+KeyM');
    await page.waitForTimeout(100);
    // Add a marker
    await page.keyboard.press('m');
    await page.waitForTimeout(100);
  });

  test('MKR-E060: edit button has aria-label', async ({ page }) => {
    const state = await getSessionState(page);
    const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
    const ariaLabel = await editButton.getAttribute('aria-label');
    expect(ariaLabel).toBe('Edit marker note');
  });

  test('MKR-E061: delete button has aria-label', async ({ page }) => {
    const state = await getSessionState(page);
    const deleteButton = page.locator(`[data-testid="marker-delete-${state.currentFrame}"]`);
    const ariaLabel = await deleteButton.getAttribute('aria-label');
    expect(ariaLabel).toBe('Delete marker');
  });
});
