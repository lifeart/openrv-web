import { test, expect } from './fixtures';
import * as fs from 'fs';
import * as path from 'path';

test.describe('GTO Export Preservation', () => {
  test('should preserve original file paths and unmatched nodes on export', async ({ page, appPage }) => {
    // 1. Prepare test files
    const testFileName = 'preservation_test_media.png';
    const originalPath = '/absolute/path/to/preservation_test_media.png';
    
    // Create a minimal valid GTO/RV session file
    const rvContent = `GTOa (4)

rv : RVSession (4)
{
    session
    {
        string viewNode = "defaultSequence"
        int frame = 1
        int[2] range = [ [ 1 10 ] ]
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
        string ui_name = "Test Source"
    }
}

customNode : RVUnknownNode (1)
{
    customComponent
    {
        string someProperty = "should be preserved"
    }
}
`;

    const rvFileName = 'preservation_test.rv';
    const rvFilePath = path.join(test.info().outputDir, rvFileName);
    const mediaFilePath = path.join(test.info().outputDir, testFileName);

    // Ensure output dir exists
    if (!fs.existsSync(test.info().outputDir)) {
      fs.mkdirSync(test.info().outputDir, { recursive: true });
    }

    // Write the .rv file
    fs.writeFileSync(rvFilePath, rvContent);

    // Create a dummy image file (1x1 transparent png)
    const imageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    fs.writeFileSync(mediaFilePath, imageBuffer);

    // 2. Load the app and upload files
    // The app handles multiple file uploads by matching names
    // We select both the .rv file and the media file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([rvFilePath, mediaFilePath]);

    // Wait for loading to complete
    await page.waitForTimeout(1000);

    // Verify loading worked (canvas visible)
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // 3. Trigger Export
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    
    // Click Export -> Save RV Session
    const exportButton = page.locator('button[title*="Export"]').first();
    await exportButton.click();
    await page.waitForTimeout(200);
    
    const saveButton = page.locator('text=Save RV Session (.rv)');
    if (await saveButton.isVisible()) {
        await saveButton.click();
    } else {
        // Fallback or if direct button
        await page.keyboard.press('Control+s'); // ctrl+s might be frame export default?
        // Let's rely on the button menu if possible
        // If "Save RV Session" isn't visible, maybe check ExportControl implementation
        // But assumed from export-workflow.spec.ts it exists
    }

    const download = await downloadPromise;
    const downloadPath = path.join(test.info().outputDir, 'exported_session.rv');
    await download.saveAs(downloadPath);

    // 4. Verify Export Content
    const exportedContent = fs.readFileSync(downloadPath, 'utf-8');

    // A. Verify Original Path is preserved (NOT blob url)
    expect(exportedContent).toContain(`string movie = "${originalPath}"`);
    expect(exportedContent).not.toContain('blob:');

    // B. Verify unsupported node is preserved
    expect(exportedContent).toContain('customNode : RVUnknownNode');
    expect(exportedContent).toContain('string someProperty = "should be preserved"');
    
    // C. Verify RVSession info
    expect(exportedContent).toContain('string viewNode = "defaultSequence"');
  });
});
