import { test, expect, SAMPLE_IMAGE, loadImageFile, getSessionState, waitForTestHelper } from './fixtures';
import path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Session Recovery E2E Tests
 *
 * Tests the session save/load flow and file reload dialog for blob URLs.
 * Uses real app flow: load file -> save project -> load project -> file reload dialog
 */

/** Track temp files created during tests for cleanup */
const tempFiles: string[] = [];

/**
 * Creates a test project state with sensible defaults.
 * Override specific properties as needed for each test.
 */
function createTestProjectState(overrides: {
  name?: string;
  mediaName?: string;
  mediaType?: 'image' | 'video';
  requiresReload?: boolean;
} = {}) {
  const {
    name = 'Test Project',
    mediaName = 'test_image.png',
    mediaType = 'image',
    requiresReload = true,
  } = overrides;

  return {
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    media: [{
      path: '',
      name: mediaName,
      type: mediaType,
      width: mediaType === 'video' ? 1920 : 100,
      height: mediaType === 'video' ? 1080 : 100,
      duration: mediaType === 'video' ? 100 : 1,
      fps: mediaType === 'video' ? 24 : 1,
      requiresReload,
    }],
    playback: {
      currentFrame: 1,
      inPoint: 1,
      outPoint: 1,
      fps: 24,
      loopMode: 'loop',
      volume: 0.7,
      muted: false,
      marks: [],
      currentSourceIndex: 0,
    },
    paint: { nextId: 0, show: true, frames: {}, effects: {} },
    view: { zoom: 1, panX: 0, panY: 0 },
    color: {},
    cdl: {},
    filters: {},
    transform: {},
    crop: {},
    lens: {},
    wipe: {},
    stack: [],
    lutIntensity: 1.0,
  };
}

/**
 * Saves a project state to a temp file and tracks it for cleanup.
 */
function saveTempProject(projectState: ReturnType<typeof createTestProjectState>, filename: string): string {
  const projectPath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(projectPath, JSON.stringify(projectState));
  tempFiles.push(projectPath);
  return projectPath;
}

test.describe('Session Recovery - Blob URL Handling', () => {

  // Clean up any temp files after each test (even on failure)
  test.afterEach(() => {
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    tempFiles.length = 0; // Clear the array
  });

  test('RECOVERY-E001: loaded local files have blob URLs', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);

    // Load an image file (creates blob URL)
    await loadImageFile(page);

    // Verify media was loaded
    const sessionState = await getSessionState(page);
    expect(sessionState.hasMedia).toBe(true);
    expect(sessionState.mediaName).toBe('test_image.png');
  });

  test('RECOVERY-E002: save and load project shows file reload dialog for blob URL files', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Load an image file (creates blob URL)
    await loadImageFile(page);

    // Wait for media to be fully loaded
    await expect(page.locator('[data-testid="viewer-image-canvas"]')).toBeVisible({ timeout: 5000 });

    // Set up download handler to capture the saved project file
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

    // Click Save button using data-testid (more reliable than title attribute)
    const saveButton = page.locator('[data-testid="save-button"], button[title*="Save"]');
    await saveButton.click();

    // Get the downloaded file
    const download = await downloadPromise;
    const downloadPath = path.join(os.tmpdir(), download.suggestedFilename());
    await download.saveAs(downloadPath);
    tempFiles.push(downloadPath); // Track for cleanup

    // Read the saved project to verify blob URLs are handled correctly
    const projectContent = fs.readFileSync(downloadPath, 'utf-8');
    const projectState = JSON.parse(projectContent);

    // Verify the media reference has requiresReload flag (blob URL was detected)
    expect(projectState.media).toHaveLength(1);
    expect(projectState.media[0].requiresReload).toBe(true);
    expect(projectState.media[0].path).toBe(''); // Blob URL not saved
    expect(projectState.media[0].name).toBe('test_image.png');
    // Cleanup handled by afterEach
  });

  test('RECOVERY-E003: loading project with requiresReload media shows file reload dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Create and save a project file with requiresReload media
    const projectState = createTestProjectState({ name: 'Test Project' });
    const projectPath = saveTempProject(projectState, 'test-recovery.orvproject');

    // Open the project file using the project input
    const projectInput = page.locator('input[accept=".orvproject"]');
    await projectInput.setInputFiles(projectPath);

    // Wait for file reload dialog to appear (using data-testid for reliability)
    const fileReloadDialog = page.locator('[data-testid="file-reload-dialog"]');
    await expect(fileReloadDialog).toBeVisible({ timeout: 5000 });

    // Verify expected filename is shown
    await expect(fileReloadDialog.locator('text=test_image.png')).toBeVisible();
    // Cleanup handled by afterEach
  });

  test('RECOVERY-E004: skip file reload shows warning', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Create and save a project file with requiresReload media
    const projectState = createTestProjectState({
      name: 'Skip Test Project',
      mediaName: 'skipped_file.png',
    });
    const projectPath = saveTempProject(projectState, 'test-skip.orvproject');

    // Open the project file
    const projectInput = page.locator('input[accept=".orvproject"]');
    await projectInput.setInputFiles(projectPath);

    // Wait for file reload dialog (using data-testid for reliability)
    const fileReloadDialog = page.locator('[data-testid="file-reload-dialog"]');
    await expect(fileReloadDialog).toBeVisible({ timeout: 5000 });

    // Click skip using data-testid
    await page.locator('[data-testid="file-reload-skip"]').click();

    // Dialog should close
    await expect(fileReloadDialog).not.toBeVisible({ timeout: 3000 });

    // Warning alert should appear mentioning skipped file
    const warningAlert = page.locator('.modal:has-text("Skipped")');
    await expect(warningAlert).toBeVisible({ timeout: 5000 });
    // Cleanup handled by afterEach
  });

  test('RECOVERY-E005: filename mismatch shows warning in dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Create project expecting a different filename than SAMPLE_IMAGE
    const projectState = createTestProjectState({
      name: 'Mismatch Test Project',
      mediaName: 'different_filename.png',
    });
    const projectPath = saveTempProject(projectState, 'test-mismatch.orvproject');

    // Open the project file
    const projectInput = page.locator('input[accept=".orvproject"]');
    await projectInput.setInputFiles(projectPath);

    // Wait for file reload dialog (using data-testid for reliability)
    const fileReloadDialog = page.locator('[data-testid="file-reload-dialog"]');
    await expect(fileReloadDialog).toBeVisible({ timeout: 5000 });

    // Expected filename should be shown
    await expect(fileReloadDialog.locator('text=different_filename.png')).toBeVisible();

    // Select a different file (sample image has different name)
    const filePath = path.resolve(process.cwd(), SAMPLE_IMAGE);
    const fileInput = fileReloadDialog.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Warning should appear about filename mismatch (using data-testid)
    const warning = page.locator('[data-testid="filename-mismatch-warning"]');
    await expect(warning).toBeVisible({ timeout: 3000 });
    // Cleanup handled by afterEach
  });

  test('RECOVERY-E006: correct filename shows no warning', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Create project expecting test_image.png (same as SAMPLE_IMAGE)
    const projectState = createTestProjectState({
      name: 'Match Test Project',
      mediaName: 'test_image.png', // Matches SAMPLE_IMAGE filename
    });
    const projectPath = saveTempProject(projectState, 'test-match.orvproject');

    // Open the project file
    const projectInput = page.locator('input[accept=".orvproject"]');
    await projectInput.setInputFiles(projectPath);

    // Wait for file reload dialog (using data-testid for reliability)
    const fileReloadDialog = page.locator('[data-testid="file-reload-dialog"]');
    await expect(fileReloadDialog).toBeVisible({ timeout: 5000 });

    // Select the matching file
    const filePath = path.resolve(process.cwd(), SAMPLE_IMAGE);
    const fileInput = fileReloadDialog.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Should show selected filename
    await expect(fileReloadDialog.locator('text=Selected:')).toBeVisible({ timeout: 3000 });

    // Warning should NOT be visible (using data-testid)
    const warning = page.locator('[data-testid="filename-mismatch-warning"]');
    await expect(warning).not.toBeVisible();
    // Cleanup handled by afterEach
  });

  test('RECOVERY-E007: load button disabled until file selected', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Create project file
    const projectState = createTestProjectState({
      name: 'Button Test Project',
      mediaName: 'test_file.png',
    });
    const projectPath = saveTempProject(projectState, 'test-button.orvproject');

    // Open the project file
    const projectInput = page.locator('input[accept=".orvproject"]');
    await projectInput.setInputFiles(projectPath);

    // Wait for file reload dialog (using data-testid for reliability)
    const fileReloadDialog = page.locator('[data-testid="file-reload-dialog"]');
    await expect(fileReloadDialog).toBeVisible({ timeout: 5000 });

    // Load button should be disabled initially (using data-testid)
    const loadButton = page.locator('[data-testid="file-reload-load"]');
    await expect(loadButton).toBeDisabled();

    // Select a file
    const filePath = path.resolve(process.cwd(), SAMPLE_IMAGE);
    const fileInput = fileReloadDialog.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Load button should now be enabled
    await expect(loadButton).toBeEnabled();
    // Cleanup handled by afterEach
  });

  test('RECOVERY-E008: successfully reload file loads media', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);

    // Create project file
    const projectState = createTestProjectState({
      name: 'Load Test Project',
      mediaName: 'test_image.png', // Matches SAMPLE_IMAGE
    });
    const projectPath = saveTempProject(projectState, 'test-load.orvproject');

    // Open the project file
    const projectInput = page.locator('input[accept=".orvproject"]');
    await projectInput.setInputFiles(projectPath);

    // Wait for file reload dialog (using data-testid for reliability)
    const fileReloadDialog = page.locator('[data-testid="file-reload-dialog"]');
    await expect(fileReloadDialog).toBeVisible({ timeout: 5000 });

    // Select the file
    const filePath = path.resolve(process.cwd(), SAMPLE_IMAGE);
    const fileInput = fileReloadDialog.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Click Load button (using data-testid)
    const loadButton = page.locator('[data-testid="file-reload-load"]');
    await loadButton.click();

    // Dialog should close
    await expect(fileReloadDialog).not.toBeVisible({ timeout: 3000 });

    // Wait for media to be loaded and rendered
    await expect(page.locator('[data-testid="viewer-image-canvas"]')).toBeVisible({ timeout: 5000 });

    // Verify media was loaded
    const sessionState = await getSessionState(page);
    expect(sessionState.hasMedia).toBe(true);
    // Cleanup handled by afterEach
  });
});
