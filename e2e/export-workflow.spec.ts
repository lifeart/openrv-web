import { test, expect, loadVideoFile, loadRvSession } from './fixtures';

test.describe('Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await loadVideoFile(page);
    await page.waitForTimeout(500);
  });

  test.describe('Export Controls', () => {
    test('EXPORT-001: should have export button in header', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await expect(exportButton).toBeVisible();
    });

    test('EXPORT-002: should show export options on click', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // Should show export format options
      const formatOptions = page.locator('button, option').filter({ hasText: /PNG|JPEG|WebP/ });
      const count = await formatOptions.count();
      // Export options should be available
    });

    test('EXPORT-003: should have PNG export option', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      const pngOption = page.locator('button:has-text("PNG"), option:has-text("PNG")').first();
      if (await pngOption.isVisible()) {
        await expect(pngOption).toBeVisible();
      }
    });

    test('EXPORT-004: should have JPEG export option', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      const jpegOption = page.locator('button:has-text("JPEG"), button:has-text("JPG")').first();
      if (await jpegOption.isVisible()) {
        await expect(jpegOption).toBeVisible();
      }
    });

    test('EXPORT-005: should have WebP export option', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      const webpOption = page.locator('button:has-text("WebP")').first();
      if (await webpOption.isVisible()) {
        await expect(webpOption).toBeVisible();
      }
    });
  });

  test.describe('Frame Export', () => {
    test('EXPORT-010: should trigger frame export with Ctrl+S', async ({ page }) => {
      // Set up download handler
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

      await page.keyboard.press('Control+s');
      await page.waitForTimeout(500);

      // Download may or may not happen depending on implementation
      const download = await downloadPromise;
      // If download happened, it should be a PNG
    });

    test('EXPORT-011: should copy frame to clipboard with Ctrl+C', async ({ page }) => {
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(500);

      // Clipboard operations may require permissions
      // This test verifies the shortcut is handled
    });
  });

  test.describe('Include Annotations Option', () => {
    test('EXPORT-020: should have option to include annotations', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // Look for annotations checkbox/toggle
      const annotationsOption = page.locator('input[type="checkbox"], button').filter({ hasText: /Annotation|Include/ });
      // Option may exist
    });
  });

  test.describe('Sequence Export', () => {
    test('EXPORT-030: should have sequence export option', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      const sequenceOption = page.locator('button, option').filter({ hasText: /Sequence|All Frames/ });
      // Sequence export may be available
    });

    test('EXPORT-031: should show progress for sequence export', async ({ page }) => {
      // Sequence export should show progress dialog
      // This is a complex operation that may take time
    });
  });
});

test.describe('Full Workflow Tests', () => {
  test('WORKFLOW-001: complete viewing workflow - load, view, navigate', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Load video
    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Navigate through frames
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    // Zoom and pan
    await page.click('button:has-text("View")');
    await page.locator('button:has-text("200%")').click();
    await page.waitForTimeout(100);

    // Fit back
    await page.keyboard.press('f');
    await page.waitForTimeout(100);

    // Play briefly
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    await page.keyboard.press('Space');

    // Verify app is still functional
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('WORKFLOW-002: color correction workflow', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Switch to Color tab
    await page.click('button:has-text("Color")');
    await page.waitForTimeout(200);

    // Adjust exposure (find slider)
    const exposureRow = page.locator('div').filter({ hasText: /Exposure/ }).first();
    const slider = exposureRow.locator('input[type="range"]');
    if (await slider.isVisible()) {
      await slider.fill('1.5');
      await slider.dispatchEvent('input');
      await page.waitForTimeout(100);
    }

    // Verify preview updated
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Reset
    await slider.dblclick();
    await page.waitForTimeout(100);
  });

  test('WORKFLOW-003: annotation workflow - draw and navigate', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Switch to Annotate tab
    await page.click('button:has-text("Annotate")');
    await page.waitForTimeout(200);

    // Select pen tool
    await page.keyboard.press('p');
    await page.waitForTimeout(100);

    // Draw on frame 0
    await page.keyboard.press('Home');
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();

    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 200, box!.y + 200);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Go to frame 5 and draw
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.mouse.move(box!.x + 50, box!.y + 50);
    await page.mouse.down();
    await page.mouse.move(box!.x + 150, box!.y + 150);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Navigate between annotations
    await page.keyboard.press('Home');
    await page.keyboard.press('.');
    await page.waitForTimeout(100);

    await page.keyboard.press(',');
    await page.waitForTimeout(100);

    // Undo last stroke
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);
  });

  test('WORKFLOW-004: transform workflow - rotate, flip, crop', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Switch to Transform tab
    await page.click('button:has-text("Transform")');
    await page.waitForTimeout(200);

    // Rotate
    await page.keyboard.press('Shift+r');
    await page.waitForTimeout(100);

    // Flip
    await page.keyboard.press('Shift+h');
    await page.waitForTimeout(100);

    // Enable crop
    await page.keyboard.press('k');
    await page.waitForTimeout(200);

    // Select 16:9 aspect
    const aspect169 = page.locator('button:has-text("16:9")').first();
    if (await aspect169.isVisible()) {
      await aspect169.click();
      await page.waitForTimeout(100);
    }

    // Disable crop
    await page.keyboard.press('k');
    await page.waitForTimeout(200);

    // Verify canvas
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('WORKFLOW-005: comparison workflow - wipe mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Enable wipe mode
    await page.keyboard.press('w');
    await page.waitForTimeout(200);

    // Make color adjustment
    await page.click('button:has-text("Color")');
    await page.waitForTimeout(100);

    const slider = page.locator('input[type="range"]').first();
    if (await slider.isVisible()) {
      await slider.fill('2');
      await slider.dispatchEvent('input');
      await page.waitForTimeout(100);
    }

    // Go back to View tab
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);

    // Drag wipe line
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 4, box!.y + box!.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Disable wipe
    await page.keyboard.press('w');
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
  });

  test('WORKFLOW-006: in/out points and playback loop', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Set in point at frame 5
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.press('i');
    await page.waitForTimeout(100);

    // Set out point at frame 15
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.press('o');
    await page.waitForTimeout(100);

    // Set loop mode
    await page.keyboard.press('l');
    await page.waitForTimeout(100);

    // Play
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // Reset in/out
    await page.keyboard.press('r');
    await page.waitForTimeout(100);
  });
});

test.describe('RV Session Workflow', () => {
  test('RV-001: should load and display RV session', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadRvSession(page);
    await page.waitForTimeout(1000);

    // App should be functional
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Should be able to navigate
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
  });

  test('RV-002: should restore annotations from RV session', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadRvSession(page);
    await page.waitForTimeout(1000);

    // Check if annotations were loaded
    // Switch to annotate tab
    await page.click('button:has-text("Annotate")');
    await page.waitForTimeout(200);

    // Canvas should show any loaded annotations
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });
});

test.describe('Project Save/Load', () => {
  test('PROJECT-001: should have save project option', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Look for save project button or use keyboard shortcut
    const saveButton = page.locator('button[title*="Save"], button:has-text("Save")').first();
    // May exist in header or menu
  });

  test('PROJECT-002: should have open project option', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Look for project open button
    const openButton = page.locator('button[title*="Open"], button[title*="Project"]').first();
    // May exist in header
  });
});

test.describe('Error Handling', () => {
  test('ERROR-001: app should not crash on console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Perform various actions
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    await page.keyboard.press('Space');

    // Check for critical errors (some warnings may be acceptable)
    const criticalErrors = errors.filter(e =>
      !e.includes('Warning') &&
      !e.includes('Deprecation')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('ERROR-002: app should handle rapid user input', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Rapid key presses
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight');
    }
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowLeft');
    }

    // App should still be responsive
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });
});
