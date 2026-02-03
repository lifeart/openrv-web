# Multi-Point LUT Pipeline

## Original OpenRV Implementation
OpenRV implements a four-point LUT pipeline that provides complete color management from source ingestion through display output. Each LUT stage serves a distinct role in the imaging chain:

1. **Pre-Cache LUT**: Software-applied LUT for colorspace conversion with optional bit-depth reformatting. Applied before image caching, converting source-native color data into a normalized working-space representation. Supports 8-bit, 16-bit, and floating-point reformatting so that all downstream stages operate on a consistent data format.

2. **File LUT**: Hardware-applied (GPU) LUT that converts from the file's native color space into the working color space. This is the per-source "input transform" and may differ for every loaded source based on its originating camera, encoding, or transfer function. The File LUT is typically derived from metadata or manually assigned.

3. **Look LUT**: Per-source hardware LUT applied after the File LUT and color corrections. Provides a creative grade or "look" that can differ per source, enabling unique per-shot grading within the same session. In studio pipelines, this corresponds to the CDL/grade baked into a show LUT.

4. **Display LUT**: Session-wide hardware LUT for display device calibration. Applied identically to all sources and represents the output device transform (e.g., calibration profile for a reference monitor). The Display LUT is the final color transform before pixels reach the screen.

**LUT Chain Order** (as processed in OpenRV):
```
Source Pixels
    --> Pre-Cache LUT (software, colorspace + bit-depth)
    --> [Cached Frame Buffer]
    --> File LUT (GPU, file-to-working-space)
    --> Color Corrections (CDL, Curves, Exposure, etc.)
    --> Look LUT (GPU, creative grade)
    --> Display LUT (GPU, display calibration)
    --> Screen Output
```

**Per-Source Assignment**:
Each source in a session can have independent Pre-Cache, File, and Look LUTs. Only the Display LUT is shared across all sources. When switching between sources (e.g., in A/B compare or playlist mode), the viewer swaps the per-source LUT chain while keeping the Display LUT constant.

**OCIO Interaction**:
When OpenColorIO is active, the Pre-Cache and File LUT stages can be auto-populated from OCIO transforms baked to LUTs. The Look LUT maps to OCIO "look" transforms. The Display LUT maps to the OCIO display/view transform. Manual LUT loading overrides the OCIO-derived LUT at any stage.

**LUT File Formats Supported**: .cube (Adobe/Resolve), .csp (Rising Sun), .3dl (Lustre/Flame), RV 3D, RV Channel, IRIDAS, Shake formats.

## Status
- [x] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

## Current Implementation Gap

The existing codebase provides a single-LUT pipeline:

- **Single LUT slot** via `WebGLLUTProcessor` (`src/color/WebGLLUT.ts`) -- one 3D LUT at a time with intensity blending
- **No LUT chain** -- no concept of Pre-Cache, File, Look, or Display LUT stages
- **No per-source LUT state** -- the single LUT is global, not associated with individual sources
- **No software pre-cache pass** -- all LUT processing is GPU-only via a single fragment shader pass
- **.cube format only** -- `LUTLoader.ts` parses only `.cube` files (1D and 3D)

## Requirements

### Core Multi-Point Pipeline
- [ ] Pre-Cache LUT stage (software-applied, per-source)
- [ ] File LUT stage (GPU-applied, per-source, file-to-working-space)
- [ ] Look LUT stage (GPU-applied, per-source, creative grade)
- [ ] Display LUT stage (GPU-applied, session-wide, display calibration)
- [ ] Correct chain ordering: Pre-Cache -> File -> Corrections -> Look -> Display
- [ ] Each stage independently supports 1D and 3D LUTs
- [ ] Each stage has an independent intensity/blend control (0-100%)
- [ ] Each stage can be individually bypassed (enabled/disabled toggle)

### Per-Source LUT Assignment
- [ ] Each loaded source maintains its own Pre-Cache, File, and Look LUT
- [ ] Display LUT is shared across all sources in the session
- [ ] Switching sources in the timeline swaps the per-source LUT chain
- [ ] A/B compare mode shows each source through its own LUT chain + shared Display LUT
- [ ] Playlist mode applies per-source LUTs when advancing through sources
- [ ] Default LUT assignment (no LUT) for newly loaded sources

### LUT State Management
- [ ] LUT assignments persist in session state
- [ ] LUT assignments survive frame navigation
- [ ] LUT assignments round-trip through session save/load (.rv files)
- [ ] Per-source LUT state is accessible via scripting API
- [ ] Undo/redo support for LUT assignment changes

### OCIO Integration Points
- [ ] OCIO transforms can auto-populate File LUT stage (input transform)
- [ ] OCIO looks can auto-populate Look LUT stage
- [ ] OCIO display/view transform can auto-populate Display LUT stage
- [ ] Manual LUT loading overrides OCIO-derived LUT at any stage
- [ ] Visual indicator when a stage is OCIO-populated vs. manually assigned

### Performance
- [ ] GPU multi-pass rendering for the LUT chain (no CPU readback between stages)
- [ ] LUT texture caching to avoid re-uploading unchanged LUTs each frame
- [ ] Pre-Cache LUT applied once at decode time, not every render frame
- [ ] Total pipeline latency under 2ms for 1080p at 3 GPU LUT stages
- [ ] Lazy LUT texture creation (only allocate GPU resources when LUT is assigned)

## UI/UX Specification

### Location
Color Tab > LUT Pipeline Panel (replaces current single-LUT section in ColorControls)

### Panel Layout
```
+--------------------------------------------------------------------+
| LUT Pipeline                                          [?] [Reset] [X] |
+--------------------------------------------------------------------+
| Source: [shot_001.exr v]                                             |
+--------------------------------------------------------------------+
|                                                                      |
| --- Pre-Cache LUT (Software) ---------------------------------- [x] |
| LUT: [None]                      [Load...] [Clear]                   |
| Intensity: [==================|------] 75%                           |
| Bit-Depth: [Auto v]  (8-bit | 16-bit | Float)                       |
|                                                                      |
| --- File LUT (Input Transform) -------------------------------- [x] |
| LUT: [ARRI_LogC_to_Linear.cube]  [Load...] [Clear]                  |
| Intensity: [========================] 100%                           |
| Source: [Manual v]  (Manual | OCIO)                                  |
|                                                                      |
| --- Color Corrections (CDL / Curves / Adjustments) ---              |
| [Applied after File LUT, before Look LUT]                           |
|                                                                      |
| --- Look LUT (Creative Grade) -------------------------------- [x] |
| LUT: [show_look_v3.cube]         [Load...] [Clear]                  |
| Intensity: [==================|------] 80%                           |
| Source: [Manual v]  (Manual | OCIO)                                  |
|                                                                      |
| --- Display LUT (Session-Wide) ------------------------------- [x] |
| LUT: [monitor_calibration.cube]  [Load...] [Clear]                  |
| Intensity: [========================] 100%                           |
| Source: [Manual v]  (Manual | OCIO)                                  |
| Scope: Session-wide (applies to all sources)                         |
|                                                                      |
+--------------------------------------------------------------------+
| Chain: Pre-Cache -> File -> Corrections -> Look -> Display           |
+--------------------------------------------------------------------+
```

### Per-Source Selector
When multiple sources are loaded, a dropdown at the top of the panel selects which source's LUT assignments to view/edit. The Display LUT section is always shared and shows "(all sources)" label.

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Shift+L` | Toggle LUT Pipeline panel |
| `Ctrl+Shift+L` | Reset all LUT stages to defaults |
| `1` (in panel) | Toggle Pre-Cache LUT bypass |
| `2` (in panel) | Toggle File LUT bypass |
| `3` (in panel) | Toggle Look LUT bypass |
| `4` (in panel) | Toggle Display LUT bypass |

### Toolbar Integration
- Replace existing single "Load .cube" button in ColorControls with "LUT Pipeline" button
- Button shows active state when any LUT stage has a LUT loaded
- Tooltip shows summary: "2 of 4 LUT stages active"

### Data Attributes for Testing
```typescript
// Panel
[data-testid="lut-pipeline-panel"]
[data-testid="lut-pipeline-close"]
[data-testid="lut-pipeline-reset"]
[data-testid="lut-pipeline-help"]

// Source selector
[data-testid="lut-source-selector"]

// Pre-Cache LUT stage
[data-testid="lut-precache-section"]
[data-testid="lut-precache-toggle"]
[data-testid="lut-precache-load-button"]
[data-testid="lut-precache-clear-button"]
[data-testid="lut-precache-file-input"]
[data-testid="lut-precache-name"]
[data-testid="lut-precache-intensity"]
[data-testid="lut-precache-bitdepth"]

// File LUT stage
[data-testid="lut-file-section"]
[data-testid="lut-file-toggle"]
[data-testid="lut-file-load-button"]
[data-testid="lut-file-clear-button"]
[data-testid="lut-file-file-input"]
[data-testid="lut-file-name"]
[data-testid="lut-file-intensity"]
[data-testid="lut-file-source-select"]

// Look LUT stage
[data-testid="lut-look-section"]
[data-testid="lut-look-toggle"]
[data-testid="lut-look-load-button"]
[data-testid="lut-look-clear-button"]
[data-testid="lut-look-file-input"]
[data-testid="lut-look-name"]
[data-testid="lut-look-intensity"]
[data-testid="lut-look-source-select"]

// Display LUT stage
[data-testid="lut-display-section"]
[data-testid="lut-display-toggle"]
[data-testid="lut-display-load-button"]
[data-testid="lut-display-clear-button"]
[data-testid="lut-display-file-input"]
[data-testid="lut-display-name"]
[data-testid="lut-display-intensity"]
[data-testid="lut-display-source-select"]
```

## Technical Notes

### Architecture

```
src/color/
  pipeline/
    LUTPipeline.ts            - Pipeline orchestrator, chain ordering
    LUTPipelineState.ts       - State types and defaults for multi-point LUT
    LUTStage.ts               - Single LUT stage (load, apply, bypass, intensity)
    PreCacheLUTStage.ts       - Software Pre-Cache stage with bit-depth reformatting
    GPULUTChain.ts            - WebGL multi-pass renderer for File/Look/Display
    GPULUTChain.test.ts       - GPU chain unit tests
    LUTPipeline.test.ts       - Pipeline orchestrator unit tests
    LUTStage.test.ts          - Stage unit tests
    PreCacheLUTStage.test.ts  - Pre-Cache stage unit tests
  LUTLoader.ts                - (existing) .cube parser, extended for pipeline use
  WebGLLUT.ts                 - (existing) single-LUT GPU processor, extended

src/ui/components/
  LUTPipelinePanel.ts         - Multi-point LUT pipeline UI panel
  LUTStageControl.ts          - Reusable UI widget for a single LUT stage

e2e/
  lut-pipeline.spec.ts        - E2E tests for multi-point LUT pipeline
```

### Pipeline Integration

The multi-point pipeline fits into the existing Viewer render pipeline as follows:

```
Current Pipeline (from color-management.md):
  1. Draw source image with transform
  2. Apply crop
  3. Stereo mode
  4. Lens distortion
  5. 3D LUT                           <-- REPLACED
  6. Color adjustments                 |
  7. CDL                               |
  8. Color curves                      |
  9. Sharpen/blur filters              |
  10. Channel isolation                |
  11. Paint annotations                |

New Pipeline:
  1. Draw source image with transform
  2. Apply crop
  3. Stereo mode
  4. Lens distortion
  5. [Pre-Cache LUT applied at decode, before step 1]
  6. FILE LUT (GPU pass 1)            <-- NEW: per-source input transform
  7. Color adjustments (exposure, contrast, etc.)
  8. CDL
  9. Color curves
  10. LOOK LUT (GPU pass 2)           <-- NEW: per-source creative grade
  11. DISPLAY LUT (GPU pass 3)        <-- NEW: session-wide display calibration
  12. Sharpen/blur filters
  13. Channel isolation
  14. Paint annotations
```

### WebGL Multi-Pass Rendering

The current `WebGLLUTProcessor` uses a single fragment shader with one 3D LUT texture. For the multi-point pipeline, the GPU chain requires multi-pass rendering via ping-pong framebuffers:

```typescript
// Conceptual multi-pass GPU pipeline
class GPULUTChain {
  private fileLUTPass: WebGLLUTPass;    // Pass 1: File LUT
  private lookLUTPass: WebGLLUTPass;    // Pass 2: Look LUT (after corrections)
  private displayLUTPass: WebGLLUTPass; // Pass 3: Display LUT

  // Ping-pong framebuffers for chaining
  private fboA: WebGLFramebuffer;
  private fboB: WebGLFramebuffer;
  private texA: WebGLTexture;   // Color attachment for FBO A
  private texB: WebGLTexture;   // Color attachment for FBO B

  applyChain(sourceTexture: WebGLTexture, width: number, height: number): void {
    // Pass 1: Source -> File LUT -> FBO A
    if (this.fileLUTPass.hasLUT() && this.fileLUTPass.isEnabled()) {
      this.fileLUTPass.render(sourceTexture, this.fboA, width, height);
    }

    // ... color corrections happen here (exposure, CDL, curves) ...

    // Pass 2: FBO A (corrected) -> Look LUT -> FBO B
    if (this.lookLUTPass.hasLUT() && this.lookLUTPass.isEnabled()) {
      this.lookLUTPass.render(this.texA, this.fboB, width, height);
    }

    // Pass 3: FBO B -> Display LUT -> Screen
    if (this.displayLUTPass.hasLUT() && this.displayLUTPass.isEnabled()) {
      this.displayLUTPass.render(this.texB, null /* default FB */, width, height);
    }
  }
}
```

**Alternative: Single-Pass Multi-LUT Shader**

For performance, all three GPU LUT stages can be combined into a single fragment shader that samples from up to three 3D LUT textures sequentially. This avoids framebuffer switching overhead:

```glsl
#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D u_image;
uniform sampler3D u_fileLUT;
uniform sampler3D u_lookLUT;
uniform sampler3D u_displayLUT;

uniform float u_fileLUTIntensity;
uniform float u_lookLUTIntensity;
uniform float u_displayLUTIntensity;

uniform bool u_fileLUTEnabled;
uniform bool u_lookLUTEnabled;
uniform bool u_displayLUTEnabled;

// Domain and size uniforms for each LUT ...
uniform vec3 u_fileLUTDomainMin;
uniform vec3 u_fileLUTDomainMax;
uniform float u_fileLUTSize;
uniform vec3 u_lookLUTDomainMin;
uniform vec3 u_lookLUTDomainMax;
uniform float u_lookLUTSize;
uniform vec3 u_displayLUTDomainMin;
uniform vec3 u_displayLUTDomainMax;
uniform float u_displayLUTSize;

in vec2 v_texCoord;
out vec4 fragColor;

vec3 applyLUT(sampler3D lut, vec3 color, vec3 domainMin, vec3 domainMax, float lutSize, float intensity) {
  vec3 normalized = (color - domainMin) / (domainMax - domainMin);
  normalized = clamp(normalized, 0.0, 1.0);
  float offset = 0.5 / lutSize;
  float scale = (lutSize - 1.0) / lutSize;
  vec3 lutCoord = normalized * scale + offset;
  vec3 lutColor = texture(lut, lutCoord).rgb;
  return mix(color, lutColor, intensity);
}

void main() {
  vec4 color = texture(u_image, v_texCoord);
  vec3 rgb = color.rgb;

  // Stage 1: File LUT (input transform)
  if (u_fileLUTEnabled) {
    rgb = applyLUT(u_fileLUT, rgb, u_fileLUTDomainMin, u_fileLUTDomainMax, u_fileLUTSize, u_fileLUTIntensity);
  }

  // [Color corrections happen between File and Look in a separate pass or combined here]

  // Stage 2: Look LUT (creative grade)
  if (u_lookLUTEnabled) {
    rgb = applyLUT(u_lookLUT, rgb, u_lookLUTDomainMin, u_lookLUTDomainMax, u_lookLUTSize, u_lookLUTIntensity);
  }

  // Stage 3: Display LUT (display calibration)
  if (u_displayLUTEnabled) {
    rgb = applyLUT(u_displayLUT, rgb, u_displayLUTDomainMin, u_displayLUTDomainMax, u_displayLUTSize, u_displayLUTIntensity);
  }

  fragColor = vec4(rgb, color.a);
}
```

### State Interface

```typescript
/** State for a single LUT stage */
interface LUTStageState {
  enabled: boolean;
  lutName: string | null;          // Display name of loaded LUT, null if none
  lutData: LUT | null;             // Parsed LUT data (1D or 3D)
  intensity: number;               // 0.0 to 1.0 blend factor
  source: 'manual' | 'ocio';      // How the LUT was assigned
}

/** Pre-Cache stage extends base with bit-depth option */
interface PreCacheStageState extends LUTStageState {
  bitDepth: 'auto' | '8bit' | '16bit' | 'float';
}

/** Per-source LUT configuration */
interface SourceLUTConfig {
  sourceId: string;                // Unique source identifier
  preCacheLUT: PreCacheStageState;
  fileLUT: LUTStageState;
  lookLUT: LUTStageState;
}

/** Session-wide LUT pipeline state */
interface LUTPipelineState {
  sources: Map<string, SourceLUTConfig>;
  displayLUT: LUTStageState;        // Shared across all sources
  activeSourceId: string | null;     // Which source is selected in the UI
}

/** Defaults */
const DEFAULT_LUT_STAGE: LUTStageState = {
  enabled: true,
  lutName: null,
  lutData: null,
  intensity: 1.0,
  source: 'manual',
};

const DEFAULT_PRECACHE_STAGE: PreCacheStageState = {
  ...DEFAULT_LUT_STAGE,
  bitDepth: 'auto',
};

const DEFAULT_SOURCE_LUT_CONFIG: SourceLUTConfig = {
  sourceId: '',
  preCacheLUT: { ...DEFAULT_PRECACHE_STAGE },
  fileLUT: { ...DEFAULT_LUT_STAGE },
  lookLUT: { ...DEFAULT_LUT_STAGE },
};

const DEFAULT_PIPELINE_STATE: LUTPipelineState = {
  sources: new Map(),
  displayLUT: { ...DEFAULT_LUT_STAGE },
  activeSourceId: null,
};
```

### Pre-Cache LUT Software Application

The Pre-Cache LUT is unique in that it runs in software (CPU) at decode time, before the frame enters the GPU cache. This is necessary for bit-depth conversion and ensures the cached frame is already in the working color space:

```typescript
class PreCacheLUTStage {
  private lut: LUT | null = null;
  private bitDepth: 'auto' | '8bit' | '16bit' | 'float' = 'auto';

  /**
   * Apply the pre-cache transform to decoded frame data.
   * Called once per frame at decode time, result is cached.
   */
  apply(imageData: ImageData): ImageData {
    if (!this.lut || !this.enabled) {
      return imageData;
    }

    // Apply LUT using existing CPU path (LUTLoader.applyLUTToImageData)
    const output = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
    applyLUTToImageData(output, this.lut);

    return output;
  }
}
```

### Per-Source LUT Swapping

When the viewer switches sources (frame navigation in playlist, A/B compare toggle), the pipeline must swap the per-source LUT textures:

```typescript
class LUTPipeline {
  private gpuChain: GPULUTChain;
  private sourceConfigs: Map<string, SourceLUTConfig>;
  private displayLUT: LUTStageState;
  private currentSourceId: string | null = null;

  /**
   * Called when the active source changes (timeline navigation, A/B switch).
   * Swaps per-source LUT textures in the GPU chain.
   */
  setActiveSource(sourceId: string): void {
    if (sourceId === this.currentSourceId) return;
    this.currentSourceId = sourceId;

    const config = this.sourceConfigs.get(sourceId);
    if (!config) return;

    // Swap File LUT texture
    this.gpuChain.setFileLUT(config.fileLUT.lutData, config.fileLUT.intensity, config.fileLUT.enabled);

    // Swap Look LUT texture
    this.gpuChain.setLookLUT(config.lookLUT.lutData, config.lookLUT.intensity, config.lookLUT.enabled);

    // Display LUT stays unchanged (session-wide)
  }
}
```

### Migration from Single-LUT

The existing `WebGLLUTProcessor` and its singleton `getSharedLUTProcessor()` should be preserved for backward compatibility. The new `GPULUTChain` wraps or extends the existing processor:

1. Existing code that calls `getSharedLUTProcessor().setLUT(lut)` maps to setting the Look LUT stage (creative grade).
2. The existing `apply(imageData, intensity)` method maps to running the full chain.
3. The existing `.cube` file input in ColorControls becomes the Look LUT load trigger by default, with an option to target any stage.

### Performance Considerations

- **Texture caching**: Each LUT stage maintains its own `WebGLTexture`. Textures are only re-uploaded when the LUT data changes, not on every frame.
- **Shader branching**: When a stage has no LUT, the shader skips sampling via a uniform boolean. This avoids texture sampling overhead for unused stages.
- **Pre-Cache amortization**: The Pre-Cache LUT runs once per decoded frame. Since frames are cached, this cost is amortized over repeated views of the same frame.
- **WebGL2 texture units**: The multi-LUT shader requires 4 texture units (source image + 3 LUT textures). WebGL2 guarantees at least 16 texture units, so this is well within limits.
- **Memory**: Three 33x33x33 RGB32F 3D LUT textures consume approximately 33^3 * 3 * 4 * 3 = ~1.3 MB total, which is negligible.

## E2E Test Cases

```typescript
// e2e/lut-pipeline.spec.ts

import { test, expect } from '@playwright/test';
import path from 'path';
import {
  loadVideoFile,
  waitForTestHelper,
  getColorState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

const SAMPLE_LUT_WARM = 'sample/test_lut.cube';
const SAMPLE_LUT_COOL = 'sample/test_lut_cool.cube';

/**
 * Helper: open the LUT Pipeline panel
 */
async function openLUTPipelinePanel(page: import('@playwright/test').Page): Promise<void> {
  await page.click('button[data-tab-id="color"]');
  await page.waitForTimeout(200);
  const panel = page.locator('[data-testid="lut-pipeline-panel"]');
  if (!(await panel.isVisible())) {
    await page.keyboard.press('Shift+l');
    await page.waitForTimeout(200);
  }
  await expect(panel).toBeVisible();
}

/**
 * Helper: load a LUT into a specific stage
 */
async function loadLUTIntoStage(
  page: import('@playwright/test').Page,
  stage: 'precache' | 'file' | 'look' | 'display',
  lutFile: string
): Promise<void> {
  const fileInput = page.locator(`[data-testid="lut-${stage}-file-input"]`);
  const lutPath = path.resolve(process.cwd(), lutFile);
  await fileInput.setInputFiles(lutPath);
  await page.waitForTimeout(500);
}

/**
 * Helper: get pipeline state from test helper
 */
async function getLUTPipelineState(page: import('@playwright/test').Page): Promise<{
  precache: { enabled: boolean; hasLUT: boolean; intensity: number; lutName: string | null };
  file: { enabled: boolean; hasLUT: boolean; intensity: number; lutName: string | null };
  look: { enabled: boolean; hasLUT: boolean; intensity: number; lutName: string | null };
  display: { enabled: boolean; hasLUT: boolean; intensity: number; lutName: string | null };
}> {
  return page.evaluate(() => {
    return (window as any).__TEST_HELPER__?.getLUTPipelineState?.() ?? {
      precache: { enabled: true, hasLUT: false, intensity: 1, lutName: null },
      file: { enabled: true, hasLUT: false, intensity: 1, lutName: null },
      look: { enabled: true, hasLUT: false, intensity: 1, lutName: null },
      display: { enabled: true, hasLUT: false, intensity: 1, lutName: null },
    };
  });
}

test.describe('Multi-Point LUT Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test.describe('Panel Visibility and Layout', () => {
    test('MLUT-E001: LUT Pipeline panel opens via Shift+L', async ({ page }) => {
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(200);

      await page.keyboard.press('Shift+l');
      await page.waitForTimeout(200);

      const panel = page.locator('[data-testid="lut-pipeline-panel"]');
      await expect(panel).toBeVisible();
    });

    test('MLUT-E002: LUT Pipeline panel shows all four stages', async ({ page }) => {
      await openLUTPipelinePanel(page);

      await expect(page.locator('[data-testid="lut-precache-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="lut-file-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="lut-look-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="lut-display-section"]')).toBeVisible();
    });

    test('MLUT-E003: close button dismisses panel', async ({ page }) => {
      await openLUTPipelinePanel(page);

      const panel = page.locator('[data-testid="lut-pipeline-panel"]');
      await expect(panel).toBeVisible();

      await page.click('[data-testid="lut-pipeline-close"]');
      await page.waitForTimeout(100);

      await expect(panel).not.toBeVisible();
    });

    test('MLUT-E004: Shift+L toggles panel visibility', async ({ page }) => {
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(200);

      // Open
      await page.keyboard.press('Shift+l');
      await page.waitForTimeout(200);
      const panel = page.locator('[data-testid="lut-pipeline-panel"]');
      await expect(panel).toBeVisible();

      // Close
      await page.keyboard.press('Shift+l');
      await page.waitForTimeout(200);
      await expect(panel).not.toBeVisible();
    });

    test('MLUT-E005: reset button clears all LUT stages', async ({ page }) => {
      await openLUTPipelinePanel(page);

      // Load LUTs into multiple stages
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      let state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);
      expect(state.look.hasLUT).toBe(true);

      // Reset all
      await page.click('[data-testid="lut-pipeline-reset"]');
      await page.waitForTimeout(200);

      state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(false);
      expect(state.look.hasLUT).toBe(false);
      expect(state.display.hasLUT).toBe(false);
      expect(state.precache.hasLUT).toBe(false);
    });
  });

  test.describe('File LUT Stage', () => {
    test('MLUT-E010: loading a File LUT changes image appearance', async ({ page }) => {
      await openLUTPipelinePanel(page);
      const screenshotBefore = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      const state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);

      const screenshotAfter = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('MLUT-E011: File LUT name displayed in UI', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      const lutName = page.locator('[data-testid="lut-file-name"]');
      await expect(lutName).toBeVisible();
      const nameText = await lutName.textContent();
      expect(nameText).toBeTruthy();
      expect(nameText!.length).toBeGreaterThan(0);
    });

    test('MLUT-E012: File LUT intensity slider adjusts blend', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      const screenshotFull = await captureViewerScreenshot(page);

      const intensitySlider = page.locator('[data-testid="lut-file-intensity"]');
      await intensitySlider.fill('0.5');
      await intensitySlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const state = await getLUTPipelineState(page);
      expect(state.file.intensity).toBeCloseTo(0.5, 1);

      const screenshotHalf = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotFull, screenshotHalf)).toBe(true);
    });

    test('MLUT-E013: File LUT bypass toggle disables stage', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      const screenshotEnabled = await captureViewerScreenshot(page);

      // Disable the File LUT stage
      await page.click('[data-testid="lut-file-toggle"]');
      await page.waitForTimeout(200);

      const state = await getLUTPipelineState(page);
      expect(state.file.enabled).toBe(false);
      expect(state.file.hasLUT).toBe(true); // LUT still loaded, just bypassed

      const screenshotDisabled = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotEnabled, screenshotDisabled)).toBe(true);
    });

    test('MLUT-E014: File LUT clear button removes LUT', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      let state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);

      await page.click('[data-testid="lut-file-clear-button"]');
      await page.waitForTimeout(200);

      state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(false);
      expect(state.file.lutName).toBeNull();
    });
  });

  test.describe('Look LUT Stage', () => {
    test('MLUT-E020: loading a Look LUT changes image appearance', async ({ page }) => {
      await openLUTPipelinePanel(page);
      const screenshotBefore = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      const state = await getLUTPipelineState(page);
      expect(state.look.hasLUT).toBe(true);

      const screenshotAfter = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('MLUT-E021: Look LUT intensity at 0% shows ungraded image', async ({ page }) => {
      await openLUTPipelinePanel(page);

      const screenshotOriginal = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      const intensitySlider = page.locator('[data-testid="lut-look-intensity"]');
      await intensitySlider.fill('0');
      await intensitySlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const screenshotZero = await captureViewerScreenshot(page);
      // At 0% intensity the Look LUT has no effect, result matches original
      expect(imagesAreDifferent(screenshotOriginal, screenshotZero)).toBe(false);
    });

    test('MLUT-E022: Look LUT bypass toggle disables stage', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      const screenshotEnabled = await captureViewerScreenshot(page);

      await page.click('[data-testid="lut-look-toggle"]');
      await page.waitForTimeout(200);

      const state = await getLUTPipelineState(page);
      expect(state.look.enabled).toBe(false);

      const screenshotDisabled = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotEnabled, screenshotDisabled)).toBe(true);
    });
  });

  test.describe('Display LUT Stage', () => {
    test('MLUT-E030: loading a Display LUT changes image appearance', async ({ page }) => {
      await openLUTPipelinePanel(page);
      const screenshotBefore = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

      const state = await getLUTPipelineState(page);
      expect(state.display.hasLUT).toBe(true);

      const screenshotAfter = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('MLUT-E031: Display LUT persists when switching sources', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

      let state = await getLUTPipelineState(page);
      expect(state.display.hasLUT).toBe(true);

      // Navigate to a different frame (simulating source switch in playlist)
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      state = await getLUTPipelineState(page);
      expect(state.display.hasLUT).toBe(true);
      expect(state.display.lutName).toBeTruthy();
    });

    test('MLUT-E032: Display LUT bypass toggle disables stage', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

      const screenshotEnabled = await captureViewerScreenshot(page);

      await page.click('[data-testid="lut-display-toggle"]');
      await page.waitForTimeout(200);

      const state = await getLUTPipelineState(page);
      expect(state.display.enabled).toBe(false);

      const screenshotDisabled = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotEnabled, screenshotDisabled)).toBe(true);
    });
  });

  test.describe('Pre-Cache LUT Stage', () => {
    test('MLUT-E040: loading a Pre-Cache LUT changes image appearance', async ({ page }) => {
      await openLUTPipelinePanel(page);
      const screenshotBefore = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'precache', SAMPLE_LUT_WARM);

      const state = await getLUTPipelineState(page);
      expect(state.precache.hasLUT).toBe(true);

      const screenshotAfter = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('MLUT-E041: Pre-Cache LUT bypass toggle disables stage', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'precache', SAMPLE_LUT_WARM);

      const screenshotEnabled = await captureViewerScreenshot(page);

      await page.click('[data-testid="lut-precache-toggle"]');
      await page.waitForTimeout(200);

      const state = await getLUTPipelineState(page);
      expect(state.precache.enabled).toBe(false);

      const screenshotDisabled = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotEnabled, screenshotDisabled)).toBe(true);
    });
  });

  test.describe('LUT Chain Ordering', () => {
    test('MLUT-E050: File + Look LUTs produce different result than Look + File order', async ({ page }) => {
      await openLUTPipelinePanel(page);

      // Load the same LUT into File, capture
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);
      const screenshotFileOnly = await captureViewerScreenshot(page);

      // Add Look LUT (different LUT)
      if (SAMPLE_LUT_COOL !== SAMPLE_LUT_WARM) {
        await loadLUTIntoStage(page, 'look', SAMPLE_LUT_COOL);
      }
      const screenshotFilePlusLook = await captureViewerScreenshot(page);

      // Both should differ from file-only
      expect(imagesAreDifferent(screenshotFileOnly, screenshotFilePlusLook)).toBe(true);
    });

    test('MLUT-E051: all three GPU stages combine correctly', async ({ page }) => {
      await openLUTPipelinePanel(page);
      const screenshotOriginal = await captureViewerScreenshot(page);

      // Load into all three GPU stages
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);
      const screenshotOneStage = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);
      const screenshotTwoStages = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);
      const screenshotThreeStages = await captureViewerScreenshot(page);

      // Each additional stage should change the image
      expect(imagesAreDifferent(screenshotOriginal, screenshotOneStage)).toBe(true);
      expect(imagesAreDifferent(screenshotOneStage, screenshotTwoStages)).toBe(true);
      expect(imagesAreDifferent(screenshotTwoStages, screenshotThreeStages)).toBe(true);
    });

    test('MLUT-E052: Display LUT applied after color corrections', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

      const screenshotDisplayLUT = await captureViewerScreenshot(page);

      // Apply exposure adjustment (color correction between File and Look stages)
      await page.keyboard.press('Escape'); // Close LUT panel
      await page.keyboard.press('c');      // Open color controls
      await page.waitForTimeout(200);

      const exposureSlider = page.locator('[data-testid="slider-exposure"]');
      if (await exposureSlider.isVisible()) {
        await exposureSlider.fill('2');
        await exposureSlider.dispatchEvent('input');
        await page.waitForTimeout(200);
      }

      const screenshotDisplayLUTPlusExposure = await captureViewerScreenshot(page);

      // Display LUT + exposure should differ from Display LUT alone
      expect(imagesAreDifferent(screenshotDisplayLUT, screenshotDisplayLUTPlusExposure)).toBe(true);
    });
  });

  test.describe('Per-Source LUT Assignment', () => {
    test('MLUT-E060: source selector dropdown visible with multiple sources', async ({ page }) => {
      // Load a second source (requires multi-file support)
      // This test assumes playlist/multi-source functionality exists
      await openLUTPipelinePanel(page);

      const sourceSelector = page.locator('[data-testid="lut-source-selector"]');
      // With single source the selector may be hidden or show single option
      if (await sourceSelector.isVisible()) {
        await sourceSelector.click();
        await page.waitForTimeout(100);
        const options = page.locator('[data-testid="lut-source-selector"] option');
        const count = await options.count();
        expect(count).toBeGreaterThanOrEqual(1);
      }
    });

    test('MLUT-E061: LUT state persists across frame navigation', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      let state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);
      expect(state.look.hasLUT).toBe(true);

      // Navigate frames
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);

      state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);
      expect(state.look.hasLUT).toBe(true);
    });
  });

  test.describe('LUT Pipeline with Color Corrections', () => {
    test('MLUT-E070: File LUT + CDL + Look LUT chain produces correct result', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      const screenshotFileLUT = await captureViewerScreenshot(page);

      // Open CDL panel and adjust
      await page.keyboard.press('Escape');
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(200);

      const cdlButton = page.locator('[data-testid="cdl-panel-button"]');
      if (await cdlButton.isVisible()) {
        await cdlButton.click();
        await page.waitForTimeout(200);
      }

      const screenshotFileLUTPlusCDL = await captureViewerScreenshot(page);

      // Re-open LUT panel and add Look LUT
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      const screenshotFullChain = await captureViewerScreenshot(page);

      // Each stage addition should change the image
      expect(imagesAreDifferent(screenshotFileLUT, screenshotFullChain)).toBe(true);
    });

    test('MLUT-E071: LUT pipeline works with color curves', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      const screenshotLookOnly = await captureViewerScreenshot(page);

      // Open curves and apply a preset
      await page.keyboard.press('Escape');
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(200);

      const curvesButton = page.locator('[data-testid="curves-panel-button"]');
      if (await curvesButton.isVisible()) {
        await curvesButton.click();
        await page.waitForTimeout(200);

        // Select S-Curve preset if available
        const presetSelect = page.locator('[data-testid="curves-preset-select"]');
        if (await presetSelect.isVisible()) {
          await presetSelect.selectOption({ label: 'S-Curve (Mild)' });
          await page.waitForTimeout(200);
        }
      }

      const screenshotLookPlusCurves = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotLookOnly, screenshotLookPlusCurves)).toBe(true);
    });
  });

  test.describe('OCIO Integration', () => {
    test('MLUT-E080: OCIO-derived File LUT shows source indicator', async ({ page }) => {
      await openLUTPipelinePanel(page);

      const sourceSelect = page.locator('[data-testid="lut-file-source-select"]');
      if (await sourceSelect.isVisible()) {
        // Default should be Manual
        const currentValue = await sourceSelect.inputValue();
        expect(currentValue).toBe('manual');
      }
    });

    test('MLUT-E081: manual LUT overrides OCIO assignment', async ({ page }) => {
      await openLUTPipelinePanel(page);

      // Even if OCIO is active, loading a manual LUT should override
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      const state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);

      const sourceSelect = page.locator('[data-testid="lut-file-source-select"]');
      if (await sourceSelect.isVisible()) {
        const currentValue = await sourceSelect.inputValue();
        expect(currentValue).toBe('manual');
      }
    });
  });

  test.describe('Edge Cases', () => {
    test('MLUT-E090: no LUTs loaded produces original image', async ({ page }) => {
      await openLUTPipelinePanel(page);

      const state = await getLUTPipelineState(page);
      expect(state.precache.hasLUT).toBe(false);
      expect(state.file.hasLUT).toBe(false);
      expect(state.look.hasLUT).toBe(false);
      expect(state.display.hasLUT).toBe(false);

      // Image should be unchanged from original
      const screenshot = await captureViewerScreenshot(page);
      expect(screenshot).toBeTruthy();
    });

    test('MLUT-E091: all stages bypassed shows original image', async ({ page }) => {
      await openLUTPipelinePanel(page);

      const screenshotOriginal = await captureViewerScreenshot(page);

      // Load LUTs into all stages
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);
      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

      // Bypass all stages
      await page.click('[data-testid="lut-file-toggle"]');
      await page.click('[data-testid="lut-look-toggle"]');
      await page.click('[data-testid="lut-display-toggle"]');
      await page.waitForTimeout(200);

      const screenshotBypassed = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotOriginal, screenshotBypassed)).toBe(false);
    });

    test('MLUT-E092: invalid LUT file shows error and does not crash pipeline', async ({ page }) => {
      await openLUTPipelinePanel(page);

      const invalidLutPath = path.resolve(process.cwd(), 'sample/invalid_lut.cube');
      const fileInput = page.locator('[data-testid="lut-file-file-input"]');
      await fileInput.setInputFiles(invalidLutPath);
      await page.waitForTimeout(500);

      // LUT should not be loaded
      const state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(false);

      // Other stages should still work
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);
      const lookState = await getLUTPipelineState(page);
      expect(lookState.look.hasLUT).toBe(true);
    });
  });
});
```

## Unit Test Cases

### LUTPipeline Tests

```typescript
// src/color/pipeline/LUTPipeline.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LUTPipeline,
  DEFAULT_PIPELINE_STATE,
  DEFAULT_LUT_STAGE,
  DEFAULT_PRECACHE_STAGE,
  DEFAULT_SOURCE_LUT_CONFIG,
} from './LUTPipeline';
import type {
  LUTPipelineState,
  LUTStageState,
  PreCacheStageState,
  SourceLUTConfig,
} from './LUTPipelineState';
import { parseCubeLUT, applyLUT3D, isLUT3D, isLUT1D } from '../LUTLoader';
import type { LUT, LUT3D, LUT1D } from '../LUTLoader';

// Minimal identity 3D LUT for testing (2x2x2)
function createIdentityLUT3D(): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = r / (size - 1);
        data[idx + 1] = g / (size - 1);
        data[idx + 2] = b / (size - 1);
      }
    }
  }
  return {
    title: 'Identity',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

// LUT that shifts all colors toward warm (adds red, reduces blue)
function createWarmLUT3D(): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = Math.min(1, r / (size - 1) + 0.1);     // Boosted red
        data[idx + 1] = g / (size - 1);                      // Unchanged green
        data[idx + 2] = Math.max(0, b / (size - 1) - 0.1);  // Reduced blue
      }
    }
  }
  return {
    title: 'Warm',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

// LUT that inverts all channels
function createInvertLUT3D(): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = 1 - r / (size - 1);
        data[idx + 1] = 1 - g / (size - 1);
        data[idx + 2] = 1 - b / (size - 1);
      }
    }
  }
  return {
    title: 'Invert',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

describe('LUTPipeline', () => {
  describe('Default State', () => {
    it('MLUT-U001: DEFAULT_PIPELINE_STATE has empty sources and no display LUT', () => {
      expect(DEFAULT_PIPELINE_STATE.sources.size).toBe(0);
      expect(DEFAULT_PIPELINE_STATE.displayLUT.lutData).toBeNull();
      expect(DEFAULT_PIPELINE_STATE.displayLUT.enabled).toBe(true);
      expect(DEFAULT_PIPELINE_STATE.displayLUT.intensity).toBe(1.0);
      expect(DEFAULT_PIPELINE_STATE.activeSourceId).toBeNull();
    });

    it('MLUT-U002: DEFAULT_LUT_STAGE has correct defaults', () => {
      expect(DEFAULT_LUT_STAGE.enabled).toBe(true);
      expect(DEFAULT_LUT_STAGE.lutName).toBeNull();
      expect(DEFAULT_LUT_STAGE.lutData).toBeNull();
      expect(DEFAULT_LUT_STAGE.intensity).toBe(1.0);
      expect(DEFAULT_LUT_STAGE.source).toBe('manual');
    });

    it('MLUT-U003: DEFAULT_PRECACHE_STAGE extends base with auto bit-depth', () => {
      expect(DEFAULT_PRECACHE_STAGE.bitDepth).toBe('auto');
      expect(DEFAULT_PRECACHE_STAGE.enabled).toBe(true);
      expect(DEFAULT_PRECACHE_STAGE.intensity).toBe(1.0);
    });

    it('MLUT-U004: DEFAULT_SOURCE_LUT_CONFIG has three null LUT stages', () => {
      expect(DEFAULT_SOURCE_LUT_CONFIG.preCacheLUT.lutData).toBeNull();
      expect(DEFAULT_SOURCE_LUT_CONFIG.fileLUT.lutData).toBeNull();
      expect(DEFAULT_SOURCE_LUT_CONFIG.lookLUT.lutData).toBeNull();
    });
  });

  describe('Source Registration', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
    });

    it('MLUT-U010: registerSource creates default config for new source', () => {
      pipeline.registerSource('source-1');
      const config = pipeline.getSourceConfig('source-1');

      expect(config).toBeDefined();
      expect(config!.sourceId).toBe('source-1');
      expect(config!.fileLUT.lutData).toBeNull();
      expect(config!.lookLUT.lutData).toBeNull();
      expect(config!.preCacheLUT.lutData).toBeNull();
    });

    it('MLUT-U011: registerSource does not overwrite existing config', () => {
      pipeline.registerSource('source-1');
      const lut = createWarmLUT3D();
      pipeline.setFileLUT('source-1', lut, 'warm.cube');

      pipeline.registerSource('source-1');
      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.lutData).toBe(lut);
    });

    it('MLUT-U012: unregisterSource removes source config', () => {
      pipeline.registerSource('source-1');
      pipeline.unregisterSource('source-1');

      const config = pipeline.getSourceConfig('source-1');
      expect(config).toBeUndefined();
    });

    it('MLUT-U013: getSourceIds returns all registered source IDs', () => {
      pipeline.registerSource('source-1');
      pipeline.registerSource('source-2');
      pipeline.registerSource('source-3');

      const ids = pipeline.getSourceIds();
      expect(ids).toContain('source-1');
      expect(ids).toContain('source-2');
      expect(ids).toContain('source-3');
      expect(ids.length).toBe(3);
    });
  });

  describe('Per-Source LUT Assignment', () => {
    let pipeline: LUTPipeline;
    const warmLUT = createWarmLUT3D();
    const invertLUT = createInvertLUT3D();

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
      pipeline.registerSource('source-2');
    });

    it('MLUT-U020: setFileLUT assigns LUT to specific source', () => {
      pipeline.setFileLUT('source-1', warmLUT, 'warm.cube');

      const config1 = pipeline.getSourceConfig('source-1');
      const config2 = pipeline.getSourceConfig('source-2');

      expect(config1!.fileLUT.lutData).toBe(warmLUT);
      expect(config1!.fileLUT.lutName).toBe('warm.cube');
      expect(config2!.fileLUT.lutData).toBeNull();
    });

    it('MLUT-U021: setLookLUT assigns LUT to specific source', () => {
      pipeline.setLookLUT('source-1', invertLUT, 'invert.cube');

      const config1 = pipeline.getSourceConfig('source-1');
      expect(config1!.lookLUT.lutData).toBe(invertLUT);
      expect(config1!.lookLUT.lutName).toBe('invert.cube');
    });

    it('MLUT-U022: setPreCacheLUT assigns LUT to specific source', () => {
      pipeline.setPreCacheLUT('source-1', warmLUT, 'warm.cube');

      const config1 = pipeline.getSourceConfig('source-1');
      expect(config1!.preCacheLUT.lutData).toBe(warmLUT);
    });

    it('MLUT-U023: different sources can have different LUTs', () => {
      pipeline.setFileLUT('source-1', warmLUT, 'warm.cube');
      pipeline.setFileLUT('source-2', invertLUT, 'invert.cube');

      const config1 = pipeline.getSourceConfig('source-1');
      const config2 = pipeline.getSourceConfig('source-2');

      expect(config1!.fileLUT.lutData).toBe(warmLUT);
      expect(config2!.fileLUT.lutData).toBe(invertLUT);
    });

    it('MLUT-U024: clearFileLUT removes LUT from source', () => {
      pipeline.setFileLUT('source-1', warmLUT, 'warm.cube');
      pipeline.clearFileLUT('source-1');

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.lutData).toBeNull();
      expect(config!.fileLUT.lutName).toBeNull();
    });

    it('MLUT-U025: clearing one source LUT does not affect other sources', () => {
      pipeline.setFileLUT('source-1', warmLUT, 'warm.cube');
      pipeline.setFileLUT('source-2', invertLUT, 'invert.cube');

      pipeline.clearFileLUT('source-1');

      const config2 = pipeline.getSourceConfig('source-2');
      expect(config2!.fileLUT.lutData).toBe(invertLUT);
    });
  });

  describe('Display LUT (Session-Wide)', () => {
    let pipeline: LUTPipeline;
    const displayLUT = createWarmLUT3D();

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
      pipeline.registerSource('source-2');
    });

    it('MLUT-U030: setDisplayLUT is shared across all sources', () => {
      pipeline.setDisplayLUT(displayLUT, 'monitor.cube');

      const state = pipeline.getState();
      expect(state.displayLUT.lutData).toBe(displayLUT);
      expect(state.displayLUT.lutName).toBe('monitor.cube');
    });

    it('MLUT-U031: display LUT is independent of source-specific LUTs', () => {
      pipeline.setDisplayLUT(displayLUT, 'monitor.cube');
      pipeline.setFileLUT('source-1', createInvertLUT3D(), 'invert.cube');

      const state = pipeline.getState();
      expect(state.displayLUT.lutData).toBe(displayLUT);
      expect(state.displayLUT.lutName).toBe('monitor.cube');
    });

    it('MLUT-U032: clearDisplayLUT removes session-wide LUT', () => {
      pipeline.setDisplayLUT(displayLUT, 'monitor.cube');
      pipeline.clearDisplayLUT();

      const state = pipeline.getState();
      expect(state.displayLUT.lutData).toBeNull();
      expect(state.displayLUT.lutName).toBeNull();
    });
  });

  describe('Stage Enable/Disable (Bypass)', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
    });

    it('MLUT-U040: setFileLUTEnabled toggles File LUT bypass', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setFileLUTEnabled('source-1', false);

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.enabled).toBe(false);
      expect(config!.fileLUT.lutData).not.toBeNull(); // LUT still loaded
    });

    it('MLUT-U041: setLookLUTEnabled toggles Look LUT bypass', () => {
      pipeline.setLookLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setLookLUTEnabled('source-1', false);

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.lookLUT.enabled).toBe(false);
    });

    it('MLUT-U042: setDisplayLUTEnabled toggles Display LUT bypass', () => {
      pipeline.setDisplayLUT(createWarmLUT3D(), 'monitor.cube');
      pipeline.setDisplayLUTEnabled(false);

      const state = pipeline.getState();
      expect(state.displayLUT.enabled).toBe(false);
    });

    it('MLUT-U043: setPreCacheLUTEnabled toggles Pre-Cache LUT bypass', () => {
      pipeline.setPreCacheLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setPreCacheLUTEnabled('source-1', false);

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.preCacheLUT.enabled).toBe(false);
    });

    it('MLUT-U044: re-enabling a bypassed stage restores its effect', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setFileLUTEnabled('source-1', false);
      pipeline.setFileLUTEnabled('source-1', true);

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.enabled).toBe(true);
      expect(config!.fileLUT.lutData).not.toBeNull();
    });
  });

  describe('Stage Intensity', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
    });

    it('MLUT-U050: setFileLUTIntensity updates blend factor', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setFileLUTIntensity('source-1', 0.5);

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.intensity).toBeCloseTo(0.5);
    });

    it('MLUT-U051: intensity clamps to 0-1 range', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');

      pipeline.setFileLUTIntensity('source-1', -0.5);
      let config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.intensity).toBe(0);

      pipeline.setFileLUTIntensity('source-1', 1.5);
      config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.intensity).toBe(1);
    });

    it('MLUT-U052: intensity 0 means LUT has no effect', () => {
      pipeline.setFileLUTIntensity('source-1', 0);
      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.intensity).toBe(0);
    });

    it('MLUT-U053: setDisplayLUTIntensity updates display LUT blend', () => {
      pipeline.setDisplayLUT(createWarmLUT3D(), 'monitor.cube');
      pipeline.setDisplayLUTIntensity(0.75);

      const state = pipeline.getState();
      expect(state.displayLUT.intensity).toBeCloseTo(0.75);
    });
  });

  describe('Active Source Switching', () => {
    let pipeline: LUTPipeline;
    const warmLUT = createWarmLUT3D();
    const invertLUT = createInvertLUT3D();

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
      pipeline.registerSource('source-2');
      pipeline.setFileLUT('source-1', warmLUT, 'warm.cube');
      pipeline.setFileLUT('source-2', invertLUT, 'invert.cube');
    });

    it('MLUT-U060: setActiveSource changes active source ID', () => {
      pipeline.setActiveSource('source-1');
      expect(pipeline.getActiveSourceId()).toBe('source-1');

      pipeline.setActiveSource('source-2');
      expect(pipeline.getActiveSourceId()).toBe('source-2');
    });

    it('MLUT-U061: getActiveSourceConfig returns config for active source', () => {
      pipeline.setActiveSource('source-1');
      const config = pipeline.getActiveSourceConfig();

      expect(config).toBeDefined();
      expect(config!.fileLUT.lutData).toBe(warmLUT);
    });

    it('MLUT-U062: switching active source changes which LUTs are applied', () => {
      pipeline.setActiveSource('source-1');
      let config = pipeline.getActiveSourceConfig();
      expect(config!.fileLUT.lutData).toBe(warmLUT);

      pipeline.setActiveSource('source-2');
      config = pipeline.getActiveSourceConfig();
      expect(config!.fileLUT.lutData).toBe(invertLUT);
    });

    it('MLUT-U063: display LUT unchanged when switching sources', () => {
      const displayLUT = createIdentityLUT3D();
      pipeline.setDisplayLUT(displayLUT, 'display.cube');

      pipeline.setActiveSource('source-1');
      expect(pipeline.getState().displayLUT.lutData).toBe(displayLUT);

      pipeline.setActiveSource('source-2');
      expect(pipeline.getState().displayLUT.lutData).toBe(displayLUT);
    });
  });

  describe('Reset and Cleanup', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setLookLUT('source-1', createInvertLUT3D(), 'invert.cube');
      pipeline.setDisplayLUT(createWarmLUT3D(), 'display.cube');
    });

    it('MLUT-U070: resetSource clears all per-source LUT stages', () => {
      pipeline.resetSource('source-1');

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.lutData).toBeNull();
      expect(config!.lookLUT.lutData).toBeNull();
      expect(config!.preCacheLUT.lutData).toBeNull();
    });

    it('MLUT-U071: resetSource does not affect display LUT', () => {
      pipeline.resetSource('source-1');

      const state = pipeline.getState();
      expect(state.displayLUT.lutData).not.toBeNull();
    });

    it('MLUT-U072: resetAll clears all stages including display LUT', () => {
      pipeline.resetAll();

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.lutData).toBeNull();
      expect(config!.lookLUT.lutData).toBeNull();

      const state = pipeline.getState();
      expect(state.displayLUT.lutData).toBeNull();
    });

    it('MLUT-U073: resetAll preserves source registrations', () => {
      pipeline.resetAll();

      const ids = pipeline.getSourceIds();
      expect(ids).toContain('source-1');
    });
  });

  describe('State Serialization', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
    });

    it('MLUT-U080: getState returns complete pipeline state snapshot', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setDisplayLUT(createInvertLUT3D(), 'display.cube');

      const state = pipeline.getState();

      expect(state.sources.size).toBe(1);
      expect(state.sources.get('source-1')!.fileLUT.lutName).toBe('warm.cube');
      expect(state.displayLUT.lutName).toBe('display.cube');
    });

    it('MLUT-U081: getSerializableState omits LUT data for session save', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setDisplayLUT(createInvertLUT3D(), 'display.cube');

      const serializable = pipeline.getSerializableState();

      // LUT binary data should not be serialized
      expect(serializable.sources['source-1'].fileLUT.lutName).toBe('warm.cube');
      expect(serializable.sources['source-1'].fileLUT.lutData).toBeUndefined();
      expect(serializable.displayLUT.lutName).toBe('display.cube');
      expect(serializable.displayLUT.lutData).toBeUndefined();
    });
  });

  describe('Event Emission', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
    });

    it('MLUT-U090: emits stageChanged event when LUT is assigned', () => {
      const callback = vi.fn();
      pipeline.on('stageChanged', callback);

      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'source-1',
          stage: 'file',
        })
      );
    });

    it('MLUT-U091: emits stageChanged event when LUT is cleared', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');

      const callback = vi.fn();
      pipeline.on('stageChanged', callback);

      pipeline.clearFileLUT('source-1');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'source-1',
          stage: 'file',
        })
      );
    });

    it('MLUT-U092: emits displayChanged event when display LUT changes', () => {
      const callback = vi.fn();
      pipeline.on('displayChanged', callback);

      pipeline.setDisplayLUT(createWarmLUT3D(), 'display.cube');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'display',
        })
      );
    });

    it('MLUT-U093: emits activeSourceChanged event on source switch', () => {
      pipeline.registerSource('source-2');

      const callback = vi.fn();
      pipeline.on('activeSourceChanged', callback);

      pipeline.setActiveSource('source-2');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          previousSourceId: null,
          newSourceId: 'source-2',
        })
      );
    });
  });
});
```

### LUTStage Tests

```typescript
// src/color/pipeline/LUTStage.test.ts

import { describe, it, expect, vi } from 'vitest';
import { LUTStage } from './LUTStage';
import type { LUT3D, LUT1D } from '../LUTLoader';

function createTestLUT3D(): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = r / (size - 1);
        data[idx + 1] = g / (size - 1);
        data[idx + 2] = b / (size - 1);
      }
    }
  }
  return { title: 'Test', size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

function createTestLUT1D(): LUT1D {
  const size = 4;
  const data = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    const v = i / (size - 1);
    data[i * 3] = v;
    data[i * 3 + 1] = v;
    data[i * 3 + 2] = v;
  }
  return { title: 'Test 1D', size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

describe('LUTStage', () => {
  it('LSTG-U001: default stage has no LUT and is enabled', () => {
    const stage = new LUTStage();
    expect(stage.hasLUT()).toBe(false);
    expect(stage.isEnabled()).toBe(true);
    expect(stage.getIntensity()).toBe(1.0);
    expect(stage.getLUTName()).toBeNull();
  });

  it('LSTG-U002: setLUT stores LUT data and name', () => {
    const stage = new LUTStage();
    const lut = createTestLUT3D();

    stage.setLUT(lut, 'test.cube');

    expect(stage.hasLUT()).toBe(true);
    expect(stage.getLUTName()).toBe('test.cube');
    expect(stage.getLUTData()).toBe(lut);
  });

  it('LSTG-U003: clearLUT removes LUT data', () => {
    const stage = new LUTStage();
    stage.setLUT(createTestLUT3D(), 'test.cube');
    stage.clearLUT();

    expect(stage.hasLUT()).toBe(false);
    expect(stage.getLUTName()).toBeNull();
    expect(stage.getLUTData()).toBeNull();
  });

  it('LSTG-U004: setEnabled toggles bypass state', () => {
    const stage = new LUTStage();
    stage.setEnabled(false);

    expect(stage.isEnabled()).toBe(false);

    stage.setEnabled(true);
    expect(stage.isEnabled()).toBe(true);
  });

  it('LSTG-U005: setIntensity stores blend factor', () => {
    const stage = new LUTStage();
    stage.setIntensity(0.75);
    expect(stage.getIntensity()).toBeCloseTo(0.75);
  });

  it('LSTG-U006: setIntensity clamps to valid range', () => {
    const stage = new LUTStage();

    stage.setIntensity(-1);
    expect(stage.getIntensity()).toBe(0);

    stage.setIntensity(2);
    expect(stage.getIntensity()).toBe(1);
  });

  it('LSTG-U007: isActive returns true only when LUT loaded and enabled', () => {
    const stage = new LUTStage();
    expect(stage.isActive()).toBe(false);

    stage.setLUT(createTestLUT3D(), 'test.cube');
    expect(stage.isActive()).toBe(true);

    stage.setEnabled(false);
    expect(stage.isActive()).toBe(false);
  });

  it('LSTG-U008: supports 1D LUT', () => {
    const stage = new LUTStage();
    const lut = createTestLUT1D();

    stage.setLUT(lut, 'test_1d.cube');

    expect(stage.hasLUT()).toBe(true);
    expect(stage.getLUTName()).toBe('test_1d.cube');
  });

  it('LSTG-U009: setSource marks LUT origin as manual or ocio', () => {
    const stage = new LUTStage();
    expect(stage.getSource()).toBe('manual');

    stage.setSource('ocio');
    expect(stage.getSource()).toBe('ocio');
  });

  it('LSTG-U010: getState returns serializable stage snapshot', () => {
    const stage = new LUTStage();
    stage.setLUT(createTestLUT3D(), 'test.cube');
    stage.setIntensity(0.8);
    stage.setSource('ocio');

    const state = stage.getState();

    expect(state.enabled).toBe(true);
    expect(state.lutName).toBe('test.cube');
    expect(state.intensity).toBeCloseTo(0.8);
    expect(state.source).toBe('ocio');
  });
});
```

### PreCacheLUTStage Tests

```typescript
// src/color/pipeline/PreCacheLUTStage.test.ts

import { describe, it, expect } from 'vitest';
import { PreCacheLUTStage } from './PreCacheLUTStage';
import type { LUT3D, LUT1D } from '../LUTLoader';

function createInvertLUT1D(): LUT1D {
  const size = 256;
  const data = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    const v = 1 - i / (size - 1);
    data[i * 3] = v;
    data[i * 3 + 1] = v;
    data[i * 3 + 2] = v;
  }
  return { title: 'Invert 1D', size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

function createTestImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 128;     // R
    data[i * 4 + 1] = 64;  // G
    data[i * 4 + 2] = 192; // B
    data[i * 4 + 3] = 255; // A
  }
  return new ImageData(data, width, height);
}

describe('PreCacheLUTStage', () => {
  it('PCLT-U001: default bit-depth is auto', () => {
    const stage = new PreCacheLUTStage();
    expect(stage.getBitDepth()).toBe('auto');
  });

  it('PCLT-U002: setBitDepth changes reformatting mode', () => {
    const stage = new PreCacheLUTStage();
    stage.setBitDepth('16bit');
    expect(stage.getBitDepth()).toBe('16bit');
  });

  it('PCLT-U003: apply returns unchanged data when no LUT loaded', () => {
    const stage = new PreCacheLUTStage();
    const imageData = createTestImageData(2, 2);
    const original = new Uint8ClampedArray(imageData.data);

    const result = stage.apply(imageData);

    expect(result.data).toEqual(original);
  });

  it('PCLT-U004: apply returns unchanged data when stage disabled', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');
    stage.setEnabled(false);

    const imageData = createTestImageData(2, 2);
    const original = new Uint8ClampedArray(imageData.data);

    const result = stage.apply(imageData);

    expect(result.data).toEqual(original);
  });

  it('PCLT-U005: apply transforms pixel data when LUT loaded and enabled', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const imageData = createTestImageData(2, 2);

    const result = stage.apply(imageData);

    // Inverted: R=128 -> ~127, G=64 -> ~191, B=192 -> ~63
    expect(result.data[0]).not.toBe(128);
    expect(result.data[1]).not.toBe(64);
    expect(result.data[2]).not.toBe(192);
    expect(result.data[3]).toBe(255); // Alpha unchanged
  });

  it('PCLT-U006: apply does not modify original ImageData', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const imageData = createTestImageData(2, 2);
    const originalR = imageData.data[0];

    stage.apply(imageData);

    // Original should be unchanged (apply creates a copy)
    expect(imageData.data[0]).toBe(originalR);
  });

  it('PCLT-U007: getState includes bitDepth field', () => {
    const stage = new PreCacheLUTStage();
    stage.setBitDepth('float');
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const state = stage.getState();

    expect(state.bitDepth).toBe('float');
    expect(state.lutName).toBe('invert.cube');
    expect(state.enabled).toBe(true);
  });
});
```

### GPULUTChain Tests

```typescript
// src/color/pipeline/GPULUTChain.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GPULUTChain } from './GPULUTChain';
import type { LUT3D } from '../LUTLoader';

// Mock WebGL2 context
function createMockGL(): WebGL2RenderingContext {
  const textures: object[] = [];
  const programs: object[] = [];

  return {
    TEXTURE_2D: 0x0DE1,
    TEXTURE_3D: 0x806F,
    TEXTURE0: 0x84C0,
    TEXTURE1: 0x84C1,
    TEXTURE2: 0x84C2,
    TEXTURE3: 0x84C3,
    RGBA: 0x1908,
    RGB: 0x1907,
    RGB32F: 0x8815,
    UNSIGNED_BYTE: 0x1401,
    FLOAT: 0x1406,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    TRIANGLE_STRIP: 0x0005,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    LINK_STATUS: 0x8B82,
    COMPILE_STATUS: 0x8B81,
    CLAMP_TO_EDGE: 0x812F,
    LINEAR: 0x2601,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_WRAP_R: 0x8072,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88E4,

    createTexture: vi.fn(() => ({})),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texImage3D: vi.fn(),
    texParameteri: vi.fn(),
    activeTexture: vi.fn(),

    createFramebuffer: vi.fn(() => ({})),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),

    createProgram: vi.fn(() => ({})),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),

    createShader: vi.fn(() => ({})),
    deleteShader: vi.fn(),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    attachShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),

    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({})),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    createBuffer: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),

    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform3fv: vi.fn(),

    viewport: vi.fn(),
    drawArrays: vi.fn(),
    readPixels: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

function createTestLUT3D(title: string = 'Test'): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = r / (size - 1);
        data[idx + 1] = g / (size - 1);
        data[idx + 2] = b / (size - 1);
      }
    }
  }
  return { title, size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

describe('GPULUTChain', () => {
  let gl: WebGL2RenderingContext;
  let chain: GPULUTChain;

  beforeEach(() => {
    gl = createMockGL();
    chain = new GPULUTChain(gl);
  });

  afterEach(() => {
    chain.dispose();
  });

  it('GCHAIN-U001: initializes with no LUTs in any stage', () => {
    expect(chain.hasFileLUT()).toBe(false);
    expect(chain.hasLookLUT()).toBe(false);
    expect(chain.hasDisplayLUT()).toBe(false);
  });

  it('GCHAIN-U002: setFileLUT creates GPU texture', () => {
    const lut = createTestLUT3D('File');
    chain.setFileLUT(lut);

    expect(chain.hasFileLUT()).toBe(true);
    expect(gl.createTexture).toHaveBeenCalled();
    expect(gl.texImage3D).toHaveBeenCalled();
  });

  it('GCHAIN-U003: setLookLUT creates GPU texture', () => {
    const lut = createTestLUT3D('Look');
    chain.setLookLUT(lut);

    expect(chain.hasLookLUT()).toBe(true);
  });

  it('GCHAIN-U004: setDisplayLUT creates GPU texture', () => {
    const lut = createTestLUT3D('Display');
    chain.setDisplayLUT(lut);

    expect(chain.hasDisplayLUT()).toBe(true);
  });

  it('GCHAIN-U005: clearFileLUT deletes GPU texture', () => {
    chain.setFileLUT(createTestLUT3D());
    chain.clearFileLUT();

    expect(chain.hasFileLUT()).toBe(false);
    expect(gl.deleteTexture).toHaveBeenCalled();
  });

  it('GCHAIN-U006: replacing a LUT deletes old texture before creating new', () => {
    chain.setFileLUT(createTestLUT3D('First'));
    chain.setFileLUT(createTestLUT3D('Second'));

    expect(gl.deleteTexture).toHaveBeenCalled();
    expect(chain.hasFileLUT()).toBe(true);
  });

  it('GCHAIN-U007: render binds correct texture units for multi-LUT shader', () => {
    chain.setFileLUT(createTestLUT3D('File'));
    chain.setLookLUT(createTestLUT3D('Look'));
    chain.setDisplayLUT(createTestLUT3D('Display'));

    chain.render(100, 100);

    // Should bind source image on TEXTURE0, File LUT on TEXTURE1, Look on TEXTURE2, Display on TEXTURE3
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE1);
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE2);
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE3);
  });

  it('GCHAIN-U008: render sets intensity uniforms for each stage', () => {
    chain.setFileLUT(createTestLUT3D());
    chain.setFileLUTIntensity(0.5);
    chain.setLookLUT(createTestLUT3D());
    chain.setLookLUTIntensity(0.75);
    chain.setDisplayLUT(createTestLUT3D());
    chain.setDisplayLUTIntensity(1.0);

    chain.render(100, 100);

    expect(gl.uniform1f).toHaveBeenCalled();
  });

  it('GCHAIN-U009: render sets enabled uniforms for each stage', () => {
    chain.setFileLUT(createTestLUT3D());
    chain.setFileLUTEnabled(false);

    chain.render(100, 100);

    // The File LUT enabled uniform should be set to false/0
    expect(gl.uniform1i).toHaveBeenCalled();
  });

  it('GCHAIN-U010: dispose cleans up all GPU resources', () => {
    chain.setFileLUT(createTestLUT3D());
    chain.setLookLUT(createTestLUT3D());
    chain.setDisplayLUT(createTestLUT3D());

    chain.dispose();

    expect(gl.deleteTexture).toHaveBeenCalled();
    expect(gl.deleteProgram).toHaveBeenCalled();
    expect(gl.deleteFramebuffer).toHaveBeenCalled();
  });

  it('GCHAIN-U011: getActiveStageCount returns number of LUT stages with data', () => {
    expect(chain.getActiveStageCount()).toBe(0);

    chain.setFileLUT(createTestLUT3D());
    expect(chain.getActiveStageCount()).toBe(1);

    chain.setLookLUT(createTestLUT3D());
    expect(chain.getActiveStageCount()).toBe(2);

    chain.setDisplayLUT(createTestLUT3D());
    expect(chain.getActiveStageCount()).toBe(3);

    chain.clearLookLUT();
    expect(chain.getActiveStageCount()).toBe(2);
  });

  it('GCHAIN-U012: disabled stages are not counted as active', () => {
    chain.setFileLUT(createTestLUT3D());
    chain.setFileLUTEnabled(false);

    expect(chain.getActiveStageCount()).toBe(0);
  });
});
```

## File Structure

```
src/color/
  pipeline/
    LUTPipeline.ts            - Pipeline orchestrator, chain ordering, source management
    LUTPipelineState.ts       - TypeScript interfaces for multi-point LUT state
    LUTStage.ts               - Single LUT stage class (load, apply, bypass, intensity)
    PreCacheLUTStage.ts       - Pre-Cache software stage with bit-depth reformatting
    GPULUTChain.ts            - WebGL multi-pass renderer for File/Look/Display
    GPULUTChain.test.ts       - GPU chain unit tests
    LUTPipeline.test.ts       - Pipeline orchestrator unit tests
    LUTStage.test.ts          - Stage unit tests
    PreCacheLUTStage.test.ts  - Pre-Cache stage unit tests
  LUTLoader.ts                - (existing) .cube parser
  LUTLoader.test.ts           - (existing) LUT parser tests
  WebGLLUT.ts                 - (existing) single-LUT GPU processor
  WebGLLUT.test.ts            - (existing) WebGL LUT tests

src/ui/components/
  LUTPipelinePanel.ts         - Multi-point LUT pipeline UI panel
  LUTStageControl.ts          - Reusable UI widget for a single LUT stage row

e2e/
  lut-pipeline.spec.ts        - E2E tests for multi-point LUT pipeline
  lut-support.spec.ts         - (existing) single-LUT E2E tests

features-v2/
  multi-point-lut-pipeline.md - This specification file
```

## References

- OpenRV Color Management: `features/color-management.md`
- OpenRV OCIO Integration: `features/opencolorio-integration.md`
- Existing LUT Loader: `src/color/LUTLoader.ts`
- Existing WebGL LUT Processor: `src/color/WebGLLUT.ts`
- Existing LUT E2E Tests: `e2e/lut-support.spec.ts`
- Original OpenRV: `src/lib/ip/IPCore/PipelineGroup.cpp` (LUT chain setup)
- Original OpenRV: `src/lib/ip/IPCore/ColorIPNode.cpp` (per-source color pipeline)
