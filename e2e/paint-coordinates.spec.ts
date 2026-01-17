import { test, expect } from './fixtures';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Paint Coordinate System', () => {
  test('should correctly map High Aspect Ratio coordinates (Unit Height assumption)', async ({ page, appPage }) => {
    // 1. Build GTO using GTOBuilder
    const testFileName = 'coord_test_media.png';
    const mediaFilePath = path.join(test.info().outputDir, testFileName);

    if (!fs.existsSync(test.info().outputDir)) {
      fs.mkdirSync(test.info().outputDir, { recursive: true });
    }

    // Create a 1x1 image (Aspect Ratio 1.0)
    const imageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    fs.writeFileSync(mediaFilePath, imageBuffer);

    // Build GTO using gto-js builder
    const { GTOBuilder, SimpleWriter } = await import('gto-js');
    const builder = new GTOBuilder();
    
    // Build RVSession object
    builder
      .object('rv', 'RVSession', 4)
      .component('session')
      .string('viewNode', 'defaultSequence')
      .int2('range', [[1, 10]])
      .int2('region', [[1, 10]])
      .float('fps', 24.0)
      .int('realtime', 0)
      .int('inc', 1)
      .int('frame', 1)
      .int('currentFrame', 1)
      .int('marks', [])
      .int('version', 2)
      .end()
      .end();
    
    // Build RVFileSource object
    builder
      .object('source', 'RVFileSource', 1)
      .component('media')
      .string('movie', testFileName)
      .end()
      .end();
    
    // Build RVPaint object with test coordinates
    // We'll use Unit Height coordinates directly:
    // Pen at (1.0, 0.5) → Normalized (1.0, 1.0) after import
    // Text at (-1.0, -0.5) → Normalized (0.0, 0.0) after import
    const aspectRatio = 1.0; // For 1x1 image
    
    const paintObject = builder.object('paint', 'RVPaint', 3);
    paintObject
      .component('paint')
      .int('nextId', 2)
      .int('nextAnnotationId', 0)
      .int('show', 1)
      .int('ghost', 0)
      .int('hold', 0)
      .int('ghostBefore', 3)
      .int('ghostAfter', 3)
      .string('exclude', [])
      .string('include', [])
      .end();
    
    // Pen stroke component
    paintObject
      .component('pen:pen_test:1:user')
      .float4('color', [[1, 0, 0, 1]])
      .float('width', [0.002])  // 1 / RV_PEN_WIDTH_SCALE (500)
      .string('brush', 'circle')
      .float2('points', [[0.5, 0.5]])  // Array of [x, y] pairs
      .int('join', 3)  // Round
      .int('cap', 2)   // Round
      .int('splat', 0)
      .end();
    
    // Text annotation component
    paintObject
      .component('text:text_test:1:user')
      .float2('position', [[-0.5, -0.5]])  // Unit Height: (-0.5, -0.5)
      .float4('color', [[1, 1, 1, 1]])
      .string('text', 'Corner')
      .float('size', 0.012)  // 24 / RV_TEXT_SIZE_SCALE (2000)
      .float('scale', 1)
      .float('rotation', 0)
      .float('spacing', 0)
      .string('font', 'sans-serif')
      .end();
    
    // Frame order
    paintObject
      .component('frame:1')
      .string('order', ['pen:pen_test:1:user', 'text:text_test:1:user'])
      .end();
    
    paintObject.end();
    
    // Write GTO to file
    const gtoData = builder.build();
    const rvContent = SimpleWriter.write(gtoData);
    const rvFileName = 'coord_test.rv';
    const rvFilePath = path.join(test.info().outputDir, rvFileName);
    fs.writeFileSync(rvFilePath, rvContent);

    // 2. Load the RV file
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([rvFilePath, mediaFilePath]);
    await page.waitForTimeout(1000);
    
    // 3. Verify Internal State (Import Logic)
    const result = await page.evaluate(() => {
        const app = (window as any).__OPENRV_TEST__.app;
        const annotations = app.paintEngine.getAnnotationsForFrame(1);
        return annotations.map((a: any) => ({
             type: a.type,
             points: a.points ? a.points[0] : null,
             position: a.position
        }));
    });

    const pen = result.find((r: any) => r.type === 'pen');
    const text = result.find((r: any) => r.type === 'text');

    // Verify pen coordinates (Unit Height (0.5, 0.5) → Normalized (1.0, 1.0))
    expect(pen, 'Pen stroke not found').toBeDefined();
    expect(pen.points.x).toBeCloseTo(1.0, 1);
    expect(pen.points.y).toBeCloseTo(1.0, 1);

    // Verify text coordinates (Unit Height (-0.5, -0.5) → Normalized (0.0, 0.0))
    expect(text, 'Text annotation not found').toBeDefined();
    expect(text.position.x).toBeCloseTo(0.0, 1);
    expect(text.position.y).toBeCloseTo(0.0, 1);
    
    // 4. Trigger Export and verify round-trip
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    
    const exportButton = page.locator('button[title*="Export"]').first();
    await exportButton.click();
    await page.waitForTimeout(200);
    
    const saveButton = page.locator('text=Save RV Session (.rv)');
    if (await saveButton.isVisible()) {
        await saveButton.click();
    } else {
        throw new Error('Save RV Session button not visible');
    }

    const download = await downloadPromise;
    const downloadPath = path.join(test.info().outputDir, 'coord_export.rv');
    await download.saveAs(downloadPath);
    
    // 5. Verify exported coordinates match input (round-trip)
    const exportedContent = fs.readFileSync(downloadPath, 'utf-8');
    
    // Should export back to Unit Height coordinates
    // Pen: (1.0, 1.0) → (0.5, 0.5)
    // Text: (0.0, 0.0) → (-0.5, -0.5)
    expect(exportedContent).toMatch(/0\.5\s+0\.5/);
    expect(exportedContent).toMatch(/-0\.5\s+-0\.5/);
  });
});
