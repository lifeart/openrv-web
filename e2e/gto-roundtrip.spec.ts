/**
 * GTO Round-Trip Verification E2E Tests
 *
 * Comprehensive tests verifying all session state survives save/load cycle.
 */

import { test, expect } from './fixtures';
import * as fs from 'fs';
import * as path from 'path';

test.describe('GTO Round-Trip Verification', () => {
  /**
   * Helper to create a session file, load it, export it, and verify contents
   */
  async function createAndVerifyRoundTrip(
    page: any,
    appPage: any,
    testInfo: any,
    sessionContent: string,
    verifyFn: (exportedContent: string) => void
  ) {
    const rvFileName = 'roundtrip_test.rv';
    const rvFilePath = path.join(testInfo.outputDir, rvFileName);

    // Ensure output dir exists
    if (!fs.existsSync(testInfo.outputDir)) {
      fs.mkdirSync(testInfo.outputDir, { recursive: true });
    }

    // Write the .rv file
    fs.writeFileSync(rvFilePath, sessionContent);

    // Create a dummy image file (1x1 transparent png)
    const imageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    const mediaFilePath = path.join(testInfo.outputDir, 'test_media.png');
    fs.writeFileSync(mediaFilePath, imageBuffer);

    // Load the app and upload files
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([rvFilePath, mediaFilePath]);

    // Wait for loading to complete
    await page.waitForTimeout(1500);

    // Verify loading worked
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Trigger Export
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });

    const exportButton = page.locator('button[title*="Export"]').first();
    await exportButton.click();
    await page.waitForTimeout(200);

    const saveButton = page.locator('text=Save RV Session (.rv)');
    await saveButton.click();

    const download = await downloadPromise;
    const downloadPath = path.join(testInfo.outputDir, 'exported_session.rv');
    await download.saveAs(downloadPath);

    // Read and verify exported content
    const exportedContent = fs.readFileSync(downloadPath, 'utf-8');
    verifyFn(exportedContent);
  }

  test('GTO-RT-001: marker frames preserved through round-trip', async ({ page, appPage }) => {
    const sessionContent = `GTOa (4)

rv : RVSession (4)
{
    session
    {
        string viewNode = "defaultSequence"
        int frame = 1
        int[2] range = [ [ 1 100 ] ]
        float fps = 24.0
        int marks = [ 10 25 50 75 ]
    }
}

source : RVFileSource (1)
{
    media
    {
        string movie = "/path/to/test_media.png"
    }
}
`;

    await createAndVerifyRoundTrip(
      page,
      appPage,
      test.info(),
      sessionContent,
      (exportedContent) => {
        // Verify markers are preserved
        expect(exportedContent).toContain('marks');
        // Note: exact format may vary, but marker values should be present
        expect(exportedContent).toMatch(/10/);
        expect(exportedContent).toMatch(/25/);
        expect(exportedContent).toMatch(/50/);
        expect(exportedContent).toMatch(/75/);
      }
    );
  });

  test('GTO-RT-002: frame range (in/out points) preserved', async ({ page, appPage }) => {
    const sessionContent = `GTOa (4)

rv : RVSession (4)
{
    session
    {
        string viewNode = "defaultSequence"
        int frame = 42
        int[2] range = [ [ 15 85 ] ]
        int[2] region = [ [ 15 85 ] ]
        float fps = 30.0
    }
}

source : RVFileSource (1)
{
    media
    {
        string movie = "/path/to/test_media.png"
    }
}
`;

    await createAndVerifyRoundTrip(
      page,
      appPage,
      test.info(),
      sessionContent,
      (exportedContent) => {
        // Verify frame range is preserved
        expect(exportedContent).toContain('range');
        expect(exportedContent).toContain('region');
        expect(exportedContent).toMatch(/15/);
        expect(exportedContent).toMatch(/85/);
      }
    );
  });

  test('GTO-RT-003: matte settings preserved', async ({ page, appPage }) => {
    const sessionContent = `GTOa (4)

rv : RVSession (4)
{
    session
    {
        string viewNode = "defaultSequence"
        int frame = 1
        int[2] range = [ [ 1 100 ] ]
        float fps = 24.0
    }
    matte
    {
        int show = 1
        float aspect = 2.39
        float opacity = 0.75
        float heightVisible = 0.8
        float[2] centerPoint = [ [ 0.5 0.5 ] ]
    }
}

source : RVFileSource (1)
{
    media
    {
        string movie = "/path/to/test_media.png"
    }
}
`;

    await createAndVerifyRoundTrip(
      page,
      appPage,
      test.info(),
      sessionContent,
      (exportedContent) => {
        // Verify matte settings are preserved
        expect(exportedContent).toContain('matte');
        expect(exportedContent).toContain('aspect');
        expect(exportedContent).toMatch(/2\.39/);
        expect(exportedContent).toContain('opacity');
        expect(exportedContent).toMatch(/0\.75/);
      }
    );
  });

  test('GTO-RT-004: paint effects settings preserved', async ({ page, appPage }) => {
    const sessionContent = `GTOa (4)

rv : RVSession (4)
{
    session
    {
        string viewNode = "defaultSequence"
        int frame = 1
        int[2] range = [ [ 1 100 ] ]
        float fps = 24.0
    }
    paintEffects
    {
        int hold = 1
        int ghost = 1
        int ghostBefore = 7
        int ghostAfter = 3
    }
}

source : RVFileSource (1)
{
    media
    {
        string movie = "/path/to/test_media.png"
    }
}
`;

    await createAndVerifyRoundTrip(
      page,
      appPage,
      test.info(),
      sessionContent,
      (exportedContent) => {
        // Verify paint effects are preserved
        expect(exportedContent).toContain('paintEffects');
        expect(exportedContent).toContain('ghostBefore');
        expect(exportedContent).toContain('ghostAfter');
      }
    );
  });

  test('GTO-RT-005: session metadata preserved', async ({ page, appPage }) => {
    const sessionContent = `GTOa (4)

rv : RVSession (4)
{
    session
    {
        string viewNode = "defaultSequence"
        int frame = 1
        int[2] range = [ [ 1 100 ] ]
        float fps = 24.0
        int version = 42
    }
    root
    {
        string name = "My Test Session"
        string comment = "This is a test comment"
    }
    node
    {
        string origin = "test-origin"
    }
}

source : RVFileSource (1)
{
    media
    {
        string movie = "/path/to/test_media.png"
    }
}
`;

    await createAndVerifyRoundTrip(
      page,
      appPage,
      test.info(),
      sessionContent,
      (exportedContent) => {
        // Verify metadata is preserved
        expect(exportedContent).toContain('root');
        expect(exportedContent).toContain('name');
        expect(exportedContent).toContain('comment');
      }
    );
  });

  test('GTO-RT-006: source file paths preserved (not converted to blob)', async ({ page, appPage }) => {
    const originalPath = '/original/absolute/path/to/video.mp4';
    const sessionContent = `GTOa (4)

rv : RVSession (4)
{
    session
    {
        string viewNode = "defaultSequence"
        int frame = 1
        int[2] range = [ [ 1 100 ] ]
        float fps = 24.0
    }
}

source : RVFileSource (1)
{
    media
    {
        string movie = "${originalPath}"
    }
    group
    {
        string ui_name = "Test Video"
    }
}
`;

    await createAndVerifyRoundTrip(
      page,
      appPage,
      test.info(),
      sessionContent,
      (exportedContent) => {
        // Verify original path is preserved, not blob URL
        expect(exportedContent).toContain(originalPath);
        expect(exportedContent).not.toContain('blob:');
      }
    );
  });

  test('GTO-RT-007: unknown/custom nodes preserved', async ({ page, appPage }) => {
    const sessionContent = `GTOa (4)

rv : RVSession (4)
{
    session
    {
        string viewNode = "defaultSequence"
        int frame = 1
        int[2] range = [ [ 1 100 ] ]
        float fps = 24.0
    }
}

source : RVFileSource (1)
{
    media
    {
        string movie = "/path/to/test_media.png"
    }
}

customPlugin : RVCustomPlugin (1)
{
    customSettings
    {
        string pluginName = "MyCustomPlugin"
        float customValue = 3.14159
        int customFlag = 1
    }
}
`;

    await createAndVerifyRoundTrip(
      page,
      appPage,
      test.info(),
      sessionContent,
      (exportedContent) => {
        // Verify custom/unknown nodes are preserved
        expect(exportedContent).toContain('RVCustomPlugin');
        expect(exportedContent).toContain('customSettings');
        expect(exportedContent).toContain('pluginName');
        expect(exportedContent).toContain('MyCustomPlugin');
      }
    );
  });

  test('GTO-RT-008: FPS and playback settings preserved', async ({ page, appPage }) => {
    const sessionContent = `GTOa (4)

rv : RVSession (4)
{
    session
    {
        string viewNode = "defaultSequence"
        int frame = 50
        int currentFrame = 50
        int[2] range = [ [ 1 100 ] ]
        float fps = 29.97
        int realtime = 0
        int inc = 2
    }
}

source : RVFileSource (1)
{
    media
    {
        string movie = "/path/to/test_media.png"
    }
}
`;

    await createAndVerifyRoundTrip(
      page,
      appPage,
      test.info(),
      sessionContent,
      (exportedContent) => {
        // Verify playback settings are preserved
        expect(exportedContent).toContain('fps');
        expect(exportedContent).toContain('inc');
        expect(exportedContent).toContain('frame');
      }
    );
  });
});
