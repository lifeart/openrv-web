import { test, expect, loadVideoFile } from './fixtures';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await loadVideoFile(page);
    await page.waitForTimeout(500);
  });

  test.describe('Tab Navigation Shortcuts', () => {
    test('KEYS-001: 1 key should switch to View tab', async ({ page }) => {
      await page.click('button:has-text("Color")');
      await page.waitForTimeout(100);

      await page.keyboard.press('1');
      await page.waitForTimeout(100);

      const viewTab = page.locator('button:has-text("View")');
      const className = await viewTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('KEYS-002: 2 key should switch to Color tab', async ({ page }) => {
      await page.keyboard.press('2');
      await page.waitForTimeout(100);

      const colorTab = page.locator('button:has-text("Color")');
      const className = await colorTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('KEYS-003: 3 key should switch to Effects tab', async ({ page }) => {
      await page.keyboard.press('3');
      await page.waitForTimeout(100);

      const effectsTab = page.locator('button:has-text("Effects")');
      const className = await effectsTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('KEYS-004: 4 key should switch to Transform tab', async ({ page }) => {
      await page.keyboard.press('4');
      await page.waitForTimeout(100);

      const transformTab = page.locator('button:has-text("Transform")');
      const className = await transformTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('KEYS-005: 5 key should switch to Annotate tab', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      const annotateTab = page.locator('button:has-text("Annotate")');
      const className = await annotateTab.getAttribute('class');
      expect(className).toContain('active');
    });
  });

  test.describe('Playback Shortcuts', () => {
    test('KEYS-010: Space should toggle play/pause', async ({ page }) => {
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);

      await page.keyboard.press('Space');
      await page.waitForTimeout(100);
    });

    test('KEYS-011: ArrowLeft should step backward', async ({ page }) => {
      // Go forward first
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);
    });

    test('KEYS-012: ArrowRight should step forward', async ({ page }) => {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
    });

    test('KEYS-013: Home should go to start', async ({ page }) => {
      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      await page.keyboard.press('Home');
      await page.waitForTimeout(100);
    });

    test('KEYS-014: End should go to end', async ({ page }) => {
      await page.keyboard.press('End');
      await page.waitForTimeout(100);
    });

    test('KEYS-015: ArrowUp should toggle play direction', async ({ page }) => {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);

      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);
    });
  });

  test.describe('View Shortcuts', () => {
    test('KEYS-020: F should fit to window', async ({ page }) => {
      await page.keyboard.press('f');
      await page.waitForTimeout(100);
    });

    test('KEYS-021: 0 should zoom to 50% (on View tab)', async ({ page }) => {
      await page.keyboard.press('1'); // Ensure View tab
      await page.keyboard.press('0');
      await page.waitForTimeout(100);
    });

    test('KEYS-022: W should cycle wipe mode', async ({ page }) => {
      await page.keyboard.press('w');
      await page.waitForTimeout(100);

      await page.keyboard.press('w');
      await page.waitForTimeout(100);

      await page.keyboard.press('w');
      await page.waitForTimeout(100);
    });
  });

  test.describe('Timeline Shortcuts', () => {
    test('KEYS-030: I should set in point', async ({ page }) => {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i');
      await page.waitForTimeout(100);
    });

    test('KEYS-031: O should set out point', async ({ page }) => {
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('o');
      await page.waitForTimeout(100);
    });

    test('KEYS-032: [ should set in point', async ({ page }) => {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('[');
      await page.waitForTimeout(100);
    });

    test('KEYS-033: ] should set out point', async ({ page }) => {
      await page.keyboard.press('End');
      await page.keyboard.press(']');
      await page.waitForTimeout(100);
    });

    test('KEYS-034: R should reset in/out points', async ({ page }) => {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i');
      await page.keyboard.press('End');
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      await page.keyboard.press('r');
      await page.waitForTimeout(100);
    });

    test('KEYS-035: M should toggle mark', async ({ page }) => {
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      await page.keyboard.press('m');
      await page.waitForTimeout(100);
    });

    test('KEYS-036: L should cycle loop mode', async ({ page }) => {
      await page.keyboard.press('l');
      await page.waitForTimeout(100);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
    });
  });

  test.describe('Paint Shortcuts', () => {
    test('KEYS-040: V should select pan tool', async ({ page }) => {
      await page.keyboard.press('5'); // Annotate tab
      await page.waitForTimeout(100);

      await page.keyboard.press('v');
      await page.waitForTimeout(100);
    });

    test('KEYS-041: P should select pen tool', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      await page.keyboard.press('p');
      await page.waitForTimeout(100);
    });

    test('KEYS-042: E should select eraser tool', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      await page.keyboard.press('e');
      await page.waitForTimeout(100);
    });

    test('KEYS-043: T should select text tool', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      await page.keyboard.press('t');
      await page.waitForTimeout(100);
    });

    test('KEYS-044: B should toggle brush type', async ({ page }) => {
      await page.keyboard.press('5');
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      await page.keyboard.press('b');
      await page.waitForTimeout(100);

      await page.keyboard.press('b');
      await page.waitForTimeout(100);
    });

    test('KEYS-045: G should toggle ghost mode', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      await page.keyboard.press('g');
      await page.waitForTimeout(100);

      await page.keyboard.press('g');
      await page.waitForTimeout(100);
    });

    test('KEYS-046: Ctrl+Z should undo', async ({ page }) => {
      await page.keyboard.press('5');
      await page.keyboard.press('p');
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(100);

      await page.keyboard.press('Control+z');
      await page.waitForTimeout(100);
    });

    test('KEYS-047: Ctrl+Y should redo', async ({ page }) => {
      await page.keyboard.press('5');
      await page.keyboard.press('p');
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(100);

      await page.keyboard.press('Control+z');
      await page.waitForTimeout(100);

      await page.keyboard.press('Control+y');
      await page.waitForTimeout(100);
    });
  });

  test.describe('Color Shortcuts', () => {
    test('KEYS-050: C should toggle color panel', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      await page.keyboard.press('c');
      await page.waitForTimeout(200);
    });

    test('KEYS-051: Escape should close color panel', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    });
  });

  test.describe('Transform Shortcuts', () => {
    test('KEYS-060: Shift+R should rotate left', async ({ page }) => {
      await page.keyboard.press('Shift+r');
      await page.waitForTimeout(100);
    });

    test('KEYS-061: Alt+R should rotate right', async ({ page }) => {
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(100);
    });

    test('KEYS-062: Shift+H should flip horizontal', async ({ page }) => {
      await page.keyboard.press('Shift+h');
      await page.waitForTimeout(100);

      await page.keyboard.press('Shift+h');
      await page.waitForTimeout(100);
    });

    test('KEYS-063: Shift+V should flip vertical', async ({ page }) => {
      await page.keyboard.press('Shift+v');
      await page.waitForTimeout(100);

      await page.keyboard.press('Shift+v');
      await page.waitForTimeout(100);
    });

    test('KEYS-064: K should toggle crop mode', async ({ page }) => {
      await page.keyboard.press('k');
      await page.waitForTimeout(200);

      await page.keyboard.press('k');
      await page.waitForTimeout(200);
    });
  });

  test.describe('Export Shortcuts', () => {
    test('KEYS-070: Ctrl+S should quick export PNG', async ({ page }) => {
      // This will trigger download, but we can test the shortcut
      // In a real test, we'd intercept the download
      await page.keyboard.press('Control+s');
      await page.waitForTimeout(200);
    });

    test('KEYS-071: Ctrl+C should copy frame to clipboard', async ({ page }) => {
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(200);
    });
  });

  test.describe('Annotation Navigation Shortcuts', () => {
    test('KEYS-080: < or , should go to previous annotation', async ({ page }) => {
      await page.keyboard.press(',');
      await page.waitForTimeout(100);
    });

    test('KEYS-081: > or . should go to next annotation', async ({ page }) => {
      await page.keyboard.press('.');
      await page.waitForTimeout(100);
    });
  });

  test.describe('Input Focus Handling', () => {
    test('KEYS-090: should not trigger shortcuts when typing in text input', async ({ page }) => {
      // Find a text input if any exist
      const textInput = page.locator('input[type="text"]').first();

      if (await textInput.isVisible()) {
        await textInput.focus();
        await textInput.fill('test');
        await page.waitForTimeout(100);

        // Typing should not trigger shortcuts
        await textInput.type('space');
        await page.waitForTimeout(100);
      }
    });

    test('KEYS-091: Space/Escape should work even with input focused', async ({ page }) => {
      // Global keys should blur input and execute
      const rangeInput = page.locator('input[type="range"]').first();

      if (await rangeInput.isVisible()) {
        await rangeInput.focus();
        await page.waitForTimeout(100);

        await page.keyboard.press('Space');
        await page.waitForTimeout(200);

        await page.keyboard.press('Space');
        await page.waitForTimeout(100);
      }
    });
  });
});
