# OpenColorIO Integration

## Original OpenRV Implementation
OpenRV provides comprehensive OpenColorIO (OCIO) integration for industry-standard color management:

**OCIO Features**:
- OCIO configuration file support
- Color space transformations
- Display and viewing pipeline modifications
- Dynamic LUT generation from OCIO
- Auto-detection of input color space from file metadata (EXR headers, OIIO metadata)
- Per-source input color space assignment
- Creative look transforms (film emulation, shot-specific grades)
- Custom OCIO config loading at runtime from studio pipelines

**OCIO Node Types**:
- Color space conversion nodes
- Display transform nodes
- Look transform nodes

**Configuration**:
- Environment variable support (OCIO)
- Per-session OCIO config override
- Color space auto-detection from file metadata

**Workflow Integration**:
- VFX Reference Platform compliance
- Studio pipeline compatibility
- ACES workflow support
- Custom OCIO configs

**Color Space Recognition**:
- Automatic detection from file attributes:
  - Transfer function
  - Primaries
  - Gamma values
  - LogC parameters (black signal, encoding offset/gain, gray signal, cut point)

## Status
- [ ] Not implemented
- [x] Partially implemented
- [ ] Fully implemented

### What Exists Today

1. **OCIOConfig.ts** (`src/color/OCIOConfig.ts`):
   - `OCIOState` interface with full pipeline state
   - Built-in ACES 1.2 and sRGB Studio configs
   - Color space, display, view, and look definitions
   - `getBuiltinConfig()`, `getAvailableConfigs()`, `getInputColorSpaces()`, etc.
   - State serialization/persistence

2. **OCIOProcessor.ts** (`src/color/OCIOProcessor.ts`):
   - Transform chain building from OCIOState
   - `bakeTo3DLUT()` - bakes transform into 33x33x33 3D LUT
   - Uses OCIOTransform for mathematical color space conversions

3. **OCIOControl.ts** (`src/ui/components/OCIOControl.ts`):
   - Full UI panel with config selection, input/working/display/view dropdowns
   - Enable/disable toggle
   - State persistence to localStorage
   - Event emission on state changes

4. **OCIOTransform.ts** (`src/color/OCIOTransform.ts`):
   - Matrix-based color space transforms
   - Transfer functions (sRGB, Rec.709)
   - ACES tone mapping
   - Bradford chromatic adaptation

5. **Rendering Pipeline Integration** (`src/App.ts`, `src/ui/components/Viewer.ts`):
   - OCIO baked LUT applied via WebGLLUTProcessor
   - GPU-accelerated 3D LUT application in render pipeline
   - Position: after user LUT, before CDL/curves

6. **Tests**:
   - Unit tests: `OCIOConfig.test.ts`, `OCIOTransform.test.ts`, `OCIOProcessor.test.ts`, `OCIOControl.test.ts`
   - E2E tests: `e2e/ocio-color-management.spec.ts` (33 tests including visual verification)

### Implementation Progress

| Component | Status | Details |
|-----------|--------|---------|
| GTO RVOCIO Parsing | Done | `src/core/session/GTOGraphLoader.ts` - Full parsing of RVOCIO nodes |
| GTO RVOCIO Export | Done | `src/core/session/SessionGTOExporter.ts` - Full export with `buildOCIOObject()` |
| OCIO Config Loading | Not Started | No runtime OCIO config file support |
| Color Space Transforms | Not Started | No actual transform processing |
| Display Transforms | Not Started | No display/view transforms |
| Look Transforms | Not Started | No look application |
| WebGL Shader Generation | Not Started | No GPU-accelerated OCIO transforms |
| UI Controls | Not Started | No OCIO control panel |

### Existing Related Implementation

The following related functionality exists and could be integrated:

1. **LUT Support** (`src/color/LUTLoader.ts`, `src/color/WebGLLUT.ts`)
   - 1D and 3D .cube LUT parsing
   - WebGL GPU-accelerated LUT application
   - Trilinear interpolation

2. **Log Curves** (`src/color/LogCurves.ts`)
   - Cineon, ARRI LogC3/LogC4, Sony S-Log3, RED Log3G10
   - Log-to-linear and linear-to-log conversion functions
   - GLSL shader generation for GPU processing

3. **CDL Support** (`src/color/CDL.ts`)
   - ASC CDL (Slope, Offset, Power, Saturation)
   - Per-channel and combined color decision list

4. **Color Curves** (`src/color/ColorCurves.ts`)
   - RGB and individual channel curves
   - Spline-based curve editing

### What Needs to Be Implemented

#### 1. Custom OCIO Config Loading
- Parse `.ocio` config file format
- Extract color spaces, displays, views, looks from custom configs
- Validate config before applying
- Support config file references (LUT files referenced within configs)

#### 2. Per-Source Input Color Space
- Track input color space per media source (not globally)
- Switch input space when switching between sources
- Store in session/project data

#### 3. Auto-Detection of Input Color Space
- Read EXR header metadata for color space info
- Parse OIIO metadata for color space hints
- Detect from file extension/codec (e.g., `.dpx` -> Cineon Log)
- Fallback to "Auto" which maps to config default

#### 4. Look Transform Pipeline
- Implement look transform application in the transform chain
- Forward and inverse direction support
- Multiple look stacking
- Creative look preview

#### 5. Working Space Grading
- Apply color corrections in working space (not display space)
- Convert: Input -> Working -> [Grade] -> Display
- CDL corrections applied in working space

#### 6. Config Comparison / A-B
- Side-by-side comparison of different OCIO configurations
- Wipe between two different transform chains

## Requirements

### Core OCIO Functionality
- [ ] OCIO config file parsing (.ocio)
- [ ] Color space transformation (input -> working -> display)
- [ ] Display transform application (display + view)
- [ ] Look transform support
- [ ] Built-in ACES color space support
- [ ] Color space auto-detection from file metadata

### WebGL Integration
- [ ] WebGL shader generation from OCIO transforms
- [ ] GPU-accelerated color space conversion
- [ ] 3D LUT baking from OCIO transforms
- [ ] Efficient pipeline for real-time playback

### Configuration Presets
- [ ] sRGB (default web/monitor)
- [ ] Rec. 709 (HD video)
- [ ] ACES (ACEScg, ACES2065-1)
- [ ] DCI-P3 (digital cinema)
- [ ] Custom OCIO config files

### Session Integration
- [ ] Per-source color space assignment
- [ ] Session-wide display LUT
- [ ] RVOCIO node state preservation (round-trip)
- [ ] Color space metadata in session files

## UI/UX Specification

### Location
Color Tab > OCIO Panel (new dropdown/panel button alongside CDL and LUT)

### Panel Layout
```
┌──────────────────────────────────────────────────────────────┐
│ OCIO Color Management                                    [X] │
├──────────────────────────────────────────────────────────────┤
│ Config: [Built-in ACES ▼] [Load Custom...]                   │
│                                                              │
│ ─── Input ─────────────────────────────────────────────────  │
│ Color Space: [Auto-detect ▼]  Detected: "ARRI LogC3 (EI800)" │
│                                                              │
│ ─── Working ───────────────────────────────────────────────  │
│ Working Space: [ACEScg ▼]                                    │
│                                                              │
│ ─── Display ───────────────────────────────────────────────  │
│ Display: [sRGB ▼]  View: [ACES 1.0 SDR-video ▼]              │
│                                                              │
│ ─── Look ──────────────────────────────────────────────────  │
│ Look: [None ▼]  Direction: [Forward ▼]                       │
│                                                              │
│ [Reset All]                         [x] Enable OCIO Pipeline │
└──────────────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Shift+O` | Toggle OCIO panel |
| `Ctrl+Shift+O` | Reset OCIO to defaults |

### Toolbar Integration
- Add "OCIO" button to Color tab context toolbar
- Show active state when OCIO pipeline is enabled
- Display current config name in button tooltip

### Data Attributes for Testing
```typescript
// Panel
[data-testid="ocio-panel"]
[data-testid="ocio-panel-close"]

// Config controls
[data-testid="ocio-config-select"]
[data-testid="ocio-config-load-button"]

// Color space dropdowns
[data-testid="ocio-input-colorspace"]
[data-testid="ocio-working-colorspace"]
[data-testid="ocio-display-select"]
[data-testid="ocio-view-select"]
[data-testid="ocio-look-select"]
[data-testid="ocio-look-direction"]

// Toggle and reset
[data-testid="ocio-enable-toggle"]
[data-testid="ocio-reset-button"]
```

## Technical Notes

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OCIO Pipeline                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Source Image                                                    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────┐                                             │
│  │ Input Transform │  (Source color space → Working space)       │
│  │  - Log curves   │                                             │
│  │  - Matrix/LUT   │                                             │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │  Color Grading  │  (CDL, Curves, Exposure, etc.)              │
│  │  in Working     │                                             │
│  │  Color Space    │                                             │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │ Look Transform  │  (Optional creative look)                   │
│  │  - ACES looks   │                                             │
│  │  - Custom LUTs  │                                             │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │Display Transform│  (Working space → Display)                  │
│  │  - Tone mapping │                                             │
│  │  - Gamut comp.  │                                             │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│      Display Output                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Approach

1. **Phase 1: Built-in Transforms (No ocio.js dependency)**
   - Implement common transforms using existing LogCurves + LUT infrastructure
   - sRGB, Rec.709, ARRI LogC3/C4, Sony S-Log3, RED Log3G10
   - Matrix-based primaries conversion
   - Simple tone mapping (Reinhard, ACES filmic)

2. **Phase 2: OCIO Config Parsing**
   - Parse .ocio config files (YAML-based)
   - Extract color spaces, displays, views, looks
   - Build transform chains

3. **Phase 3: Full OCIO Integration**
   - Consider ocio.js WebAssembly port
   - Or implement subset of OCIO transforms in WebGL
   - GPU-accelerated LUT baking

### Implementation Plan: Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/color/OCIOConfigParser.ts` | Create | Parse .ocio config file format |
| `src/color/OCIOConfigParser.test.ts` | Create | Tests for config parsing |
| `src/color/OCIOProcessor.ts` | Modify | Add look transforms, per-source state |
| `src/color/OCIOTransform.ts` | Modify | Add look transform step type |
| `src/ui/components/OCIOControl.ts` | Modify | Add custom config loading UI |
| `src/App.ts` | Modify | Wire per-source input space switching |
| `e2e/ocio-color-management.spec.ts` | Modify | Add tests for new features |

### OCIO Config File Format

The `.ocio` format is YAML-based:
```yaml
ocio_profile_version: 2
search_path: luts
roles:
  default: raw
  scene_linear: ACEScg
  color_timing: ACEScct
displays:
  sRGB:
    - !<View> {name: ACES 1.0 SDR-video, colorspace: Output - sRGB}
colorspaces:
  - !<ColorSpace>
    name: ACEScg
    family: ACES
    encoding: scene-linear
    to_scene_reference: !<MatrixTransform> {matrix: [...]}
```

### Per-Source State Model

```typescript
interface PerSourceOCIOState {
  sourceId: string;
  inputColorSpace: string;  // Override or 'Auto'
  detectedColorSpace: string | null;
}
```

### File Structure
```
src/color/
├── ocio/
│   ├── OCIOConfig.ts       # Config file parsing
│   ├── OCIOTransform.ts    # Transform chain builder
│   ├── OCIOProcessor.ts    # WebGL processing
│   ├── BuiltinConfigs.ts   # Preset configs (ACES, sRGB, etc.)
│   └── colorspaces/
│       ├── ACEScg.ts
│       ├── Rec709.ts
│       ├── sRGB.ts
│       └── matrices.ts     # Color space matrices
├── LUTLoader.ts            # (existing)
├── WebGLLUT.ts             # (existing)
├── LogCurves.ts            # (existing)
└── CDL.ts                  # (existing)

src/ui/components/
└── OCIOControl.ts          # OCIO panel UI
```

### Color Space Matrices

Standard color space conversion matrices (XYZ-based):

```typescript
// sRGB to XYZ (D65)
const SRGB_TO_XYZ = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.0721750,
  0.0193339, 0.1191920, 0.9503041
];

// ACEScg to XYZ (D60)
const ACESCG_TO_XYZ = [
  0.6624542, 0.1340042, 0.1561877,
  0.2722287, 0.6740818, 0.0536895,
 -0.0055746, 0.0040607, 1.0103391
];

// Rec.709 to XYZ (D65) - same primaries as sRGB, different transfer
const REC709_TO_XYZ = SRGB_TO_XYZ;
```

### State Interface

```typescript
interface OCIOState {
  enabled: boolean;
  configName: string;                    // "aces_1.2", "srgb", "custom"
  customConfigPath: string | null;

  inputColorSpace: string;               // "Auto", "ACEScg", "sRGB", etc.
  detectedColorSpace: string | null;     // Auto-detected from metadata

  workingColorSpace: string;             // "ACEScg", "Rec.709", etc.

  display: string;                       // "sRGB", "Rec.709", "DCI-P3"
  view: string;                          // "ACES 1.0 SDR-video", "Raw"

  look: string;                          // "None", "ACES 1.0 - Filmic", etc.
  lookDirection: 'forward' | 'inverse';
}

const DEFAULT_OCIO_STATE: OCIOState = {
  enabled: false,
  configName: 'aces_1.2',
  customConfigPath: null,
  inputColorSpace: 'Auto',
  detectedColorSpace: null,
  workingColorSpace: 'ACEScg',
  display: 'sRGB',
  view: 'ACES 1.0 SDR-video',
  look: 'None',
  lookDirection: 'forward',
};
```

### Integration with Existing LUT System

OCIO transforms can be baked into 3D LUTs for efficient GPU processing:

```typescript
function bakeOCIOToLUT(
  transform: OCIOTransform,
  size: number = 33
): LUT3D {
  const data = new Float32Array(size * size * size * 3);

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const idx = (r * size * size + g * size + b) * 3;
        const inR = r / (size - 1);
        const inG = g / (size - 1);
        const inB = b / (size - 1);

        const [outR, outG, outB] = transform.apply(inR, inG, inB);

        data[idx] = outR;
        data[idx + 1] = outG;
        data[idx + 2] = outB;
      }
    }
  }

  return { title: 'OCIO Baked', size, domainMin: [0,0,0], domainMax: [1,1,1], data };
}
```

## E2E Test Cases

### OCIO Panel Tests

```typescript
test.describe('OpenColorIO Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(200);
  });

  // OCIO-001: Panel visibility
  test('OCIO-001: OCIO panel opens via button click', async ({ page }) => {
    const ocioButton = page.locator('[data-testid="ocio-panel-button"]');
    await expect(ocioButton).toBeVisible();

    await ocioButton.click();
    await page.waitForTimeout(100);

    const panel = page.locator('[data-testid="ocio-panel"]');
    await expect(panel).toBeVisible();
  });

  // OCIO-002: Panel toggle via keyboard
  test('OCIO-002: Shift+O toggles OCIO panel', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.waitForTimeout(100);

    const panel = page.locator('[data-testid="ocio-panel"]');
    await expect(panel).toBeVisible();

    await page.keyboard.press('Shift+o');
    await page.waitForTimeout(100);

    await expect(panel).not.toBeVisible();
  });

  // OCIO-003: Default state
  test('OCIO-003: OCIO disabled by default with correct initial state', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.waitForTimeout(100);

    const state = await getOCIOState(page);
    expect(state.enabled).toBe(false);
    expect(state.configName).toBe('aces_1.2');
    expect(state.inputColorSpace).toBe('Auto');
  });

  // OCIO-004: Enable OCIO pipeline
  test('OCIO-004: Enable toggle activates OCIO pipeline', async ({ page }) => {
    const screenshotBefore = await captureViewerScreenshot(page);

    await page.keyboard.press('Shift+o');
    await page.waitForTimeout(100);

    await page.click('[data-testid="ocio-enable-toggle"]');
    await page.waitForTimeout(200);

    const state = await getOCIOState(page);
    expect(state.enabled).toBe(true);

    const screenshotAfter = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
  });

  // OCIO-005: Input color space selection
  test('OCIO-005: Input color space dropdown shows available options', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.waitForTimeout(100);

    await page.click('[data-testid="ocio-input-colorspace"]');
    await page.waitForTimeout(100);

    // Check for expected color spaces
    await expect(page.locator('[role="option"]:has-text("Auto")')).toBeVisible();
    await expect(page.locator('[role="option"]:has-text("sRGB")')).toBeVisible();
    await expect(page.locator('[role="option"]:has-text("ACEScg")')).toBeVisible();
    await expect(page.locator('[role="option"]:has-text("ARRI LogC3")')).toBeVisible();
  });

  // OCIO-006: Display/View selection
  test('OCIO-006: Display and view selection affects output', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.click('[data-testid="ocio-enable-toggle"]');
    await page.waitForTimeout(200);

    const screenshotDefault = await captureViewerScreenshot(page);

    // Change display
    await page.click('[data-testid="ocio-display-select"]');
    await page.click('[role="option"]:has-text("Rec.709")');
    await page.waitForTimeout(200);

    const screenshotRec709 = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(screenshotDefault, screenshotRec709)).toBe(true);
  });

  // OCIO-007: Look transform application
  test('OCIO-007: Look transform changes image appearance', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.click('[data-testid="ocio-enable-toggle"]');
    await page.waitForTimeout(200);

    const screenshotNoLook = await captureViewerScreenshot(page);

    await page.click('[data-testid="ocio-look-select"]');
    await page.click('[role="option"]:has-text("ACES 1.0")');
    await page.waitForTimeout(200);

    const screenshotWithLook = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(screenshotNoLook, screenshotWithLook)).toBe(true);
  });

  // OCIO-008: Reset restores defaults
  test('OCIO-008: Reset button restores default OCIO state', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.click('[data-testid="ocio-enable-toggle"]');

    // Change some settings
    await page.click('[data-testid="ocio-display-select"]');
    await page.click('[role="option"]:has-text("DCI-P3")');
    await page.waitForTimeout(100);

    // Reset
    await page.click('[data-testid="ocio-reset-button"]');
    await page.waitForTimeout(200);

    const state = await getOCIOState(page);
    expect(state.enabled).toBe(false);
    expect(state.display).toBe('sRGB');
  });

  // OCIO-009: OCIO state persists across frames
  test('OCIO-009: OCIO settings persist when navigating frames', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.click('[data-testid="ocio-enable-toggle"]');
    await page.click('[data-testid="ocio-display-select"]');
    await page.click('[role="option"]:has-text("Rec.709")');
    await page.waitForTimeout(200);

    let state = await getOCIOState(page);
    expect(state.enabled).toBe(true);
    expect(state.display).toBe('Rec.709');

    // Navigate frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getOCIOState(page);
    expect(state.enabled).toBe(true);
    expect(state.display).toBe('Rec.709');
  });

  // OCIO-010: OCIO works with LUT
  test('OCIO-010: OCIO pipeline combines correctly with loaded LUT', async ({ page }) => {
    // Load LUT first
    const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
    if (await fileInput.count()) {
      const lutPath = path.resolve(process.cwd(), 'sample/test_lut.cube');
      await fileInput.setInputFiles(lutPath);
      await page.waitForTimeout(500);
    }

    const screenshotLUTOnly = await captureViewerScreenshot(page);

    // Enable OCIO
    await page.keyboard.press('Shift+o');
    await page.click('[data-testid="ocio-enable-toggle"]');
    await page.waitForTimeout(200);

    const screenshotLUTPlusOCIO = await captureViewerScreenshot(page);

    // Combined effect should be different from LUT alone
    expect(imagesAreDifferent(screenshotLUTOnly, screenshotLUTPlusOCIO)).toBe(true);
  });

  // OCIO-011: Auto-detect color space from metadata
  test('OCIO-011: Input color space auto-detection shows detected value', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.waitForTimeout(100);

    const detectedLabel = page.locator('[data-testid="ocio-detected-colorspace"]');
    // If video has color space metadata, it should be displayed
    await expect(detectedLabel).toBeVisible();
  });

  // OCIO-012: Custom config file loading
  test('OCIO-012: Load custom OCIO config button triggers file dialog', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.waitForTimeout(100);

    const loadButton = page.locator('[data-testid="ocio-config-load-button"]');
    await expect(loadButton).toBeVisible();

    // Verify file input exists
    const fileInput = page.locator('[data-testid="ocio-config-file-input"]');
    await expect(fileInput).toHaveCount(1);
  });

  // OCIO-013: Panel close button
  test('OCIO-013: Close button dismisses OCIO panel', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.waitForTimeout(100);

    const panel = page.locator('[data-testid="ocio-panel"]');
    await expect(panel).toBeVisible();

    await page.click('[data-testid="ocio-panel-close"]');
    await page.waitForTimeout(100);

    await expect(panel).not.toBeVisible();
  });

  // OCIO-014: Working color space affects grading
  test('OCIO-014: Working color space change affects color grading', async ({ page }) => {
    await page.keyboard.press('Shift+o');
    await page.click('[data-testid="ocio-enable-toggle"]');

    // Apply some color grading
    await page.keyboard.press('c'); // Open color controls
    const exposureSlider = page.locator('[data-testid="slider-exposure"]');
    if (await exposureSlider.isVisible()) {
      await exposureSlider.fill('1.5');
      await exposureSlider.dispatchEvent('input');
    }
    await page.waitForTimeout(200);

    const screenshotACEScg = await captureViewerScreenshot(page);

    // Change working space
    await page.click('[data-testid="ocio-working-colorspace"]');
    await page.click('[role="option"]:has-text("Rec.709")');
    await page.waitForTimeout(200);

    const screenshotRec709 = await captureViewerScreenshot(page);

    // Same exposure in different working spaces should look different
    expect(imagesAreDifferent(screenshotACEScg, screenshotRec709)).toBe(true);
  });

  // OCIO-015: Histogram reflects OCIO transform
  test('OCIO-015: Histogram updates when OCIO is enabled', async ({ page }) => {
    await page.keyboard.press('h'); // Enable histogram
    await page.waitForTimeout(300);

    const screenshotNoOCIO = await captureViewerScreenshot(page);

    await page.keyboard.press('Shift+o');
    await page.click('[data-testid="ocio-enable-toggle"]');
    await page.waitForTimeout(300);

    const screenshotWithOCIO = await captureViewerScreenshot(page);

    // Histogram should show different distribution
    expect(imagesAreDifferent(screenshotNoOCIO, screenshotWithOCIO)).toBe(true);
  });
});
```

### V2 Enhancement E2E Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| OCIO-V2-E001 | Load custom config file | Click load config, select .ocio | Config name appears in dropdown |
| OCIO-V2-E002 | Custom config color spaces available | Load config, open input dropdown | Custom spaces listed |
| OCIO-V2-E003 | Per-source input preserved | Set input on source A, switch to B, back to A | A retains its input space |
| OCIO-V2-E004 | Look selection changes canvas | Enable OCIO, select a look | Canvas visually different |
| OCIO-V2-E005 | Config switch updates all dropdowns | Switch from ACES to sRGB Studio | Dropdowns repopulate correctly |

## Unit Test Cases

### OCIOConfig Tests

```typescript
// src/color/ocio/OCIOConfig.test.ts

describe('OCIOConfig', () => {
  describe('parseOCIOConfig', () => {
    it('parses valid OCIO config YAML', () => {
      const configYaml = `
ocio_profile_version: 2
search_path: luts
strictparsing: true
luma: [0.2126, 0.7152, 0.0722]

roles:
  color_picking: sRGB
  color_timing: ACEScg
  default: sRGB

displays:
  sRGB:
    - !<View> {name: Standard, colorspace: sRGB}
  Rec.709:
    - !<View> {name: Standard, colorspace: Rec.709}

colorspaces:
  - !<ColorSpace>
    name: ACEScg
    family: ACES
    encoding: scene-linear
  - !<ColorSpace>
    name: sRGB
    family: Display
    encoding: sdr-video
`;

      const config = parseOCIOConfig(configYaml);

      expect(config.version).toBe(2);
      expect(config.colorspaces).toContain('ACEScg');
      expect(config.colorspaces).toContain('sRGB');
      expect(config.displays).toHaveProperty('sRGB');
      expect(config.roles.default).toBe('sRGB');
    });

    it('throws on invalid config format', () => {
      expect(() => parseOCIOConfig('invalid yaml {')).toThrow();
    });

    it('handles missing optional fields gracefully', () => {
      const minimalConfig = `
ocio_profile_version: 2
colorspaces:
  - !<ColorSpace>
    name: default
`;

      const config = parseOCIOConfig(minimalConfig);
      expect(config.colorspaces).toContain('default');
      expect(config.looks).toEqual([]);
    });
  });

  describe('getBuiltinConfig', () => {
    it('returns ACES 1.2 config', () => {
      const config = getBuiltinConfig('aces_1.2');

      expect(config.colorspaces).toContain('ACEScg');
      expect(config.colorspaces).toContain('ACES2065-1');
      expect(config.displays).toHaveProperty('sRGB');
    });

    it('returns sRGB config for simple workflows', () => {
      const config = getBuiltinConfig('srgb');

      expect(config.colorspaces).toContain('sRGB');
      expect(config.colorspaces).toContain('Linear sRGB');
    });

    it('throws for unknown config name', () => {
      expect(() => getBuiltinConfig('unknown')).toThrow();
    });
  });
});
```

### OCIOTransform Tests

```typescript
// src/color/ocio/OCIOTransform.test.ts

describe('OCIOTransform', () => {
  describe('color space conversion', () => {
    it('converts sRGB to linear sRGB', () => {
      const transform = new OCIOTransform('sRGB', 'Linear sRGB');

      // Mid-gray sRGB
      const [r, g, b] = transform.apply(0.5, 0.5, 0.5);

      // Should be darker in linear (gamma expansion)
      expect(r).toBeCloseTo(0.214, 2);
      expect(g).toBeCloseTo(0.214, 2);
      expect(b).toBeCloseTo(0.214, 2);
    });

    it('converts linear sRGB to sRGB', () => {
      const transform = new OCIOTransform('Linear sRGB', 'sRGB');

      const [r, g, b] = transform.apply(0.214, 0.214, 0.214);

      expect(r).toBeCloseTo(0.5, 2);
      expect(g).toBeCloseTo(0.5, 2);
      expect(b).toBeCloseTo(0.5, 2);
    });

    it('converts ACEScg to sRGB display', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');

      // 18% gray in ACEScg
      const [r, g, b] = transform.apply(0.18, 0.18, 0.18);

      // Should map to mid-gray in sRGB
      expect(r).toBeGreaterThan(0.4);
      expect(r).toBeLessThan(0.6);
    });

    it('preserves white point during conversion', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');

      // Reference white
      const [r, g, b] = transform.apply(1.0, 1.0, 1.0);

      // Should stay close to 1.0 (clamped)
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(1.0);
    });
  });

  describe('log curve transforms', () => {
    it('converts ARRI LogC3 to linear', () => {
      const transform = new OCIOTransform('ARRI LogC3 (EI 800)', 'Linear');

      // LogC mid-gray (~0.391)
      const [r, g, b] = transform.apply(0.391, 0.391, 0.391);

      // Should map to 18% linear
      expect(r).toBeCloseTo(0.18, 2);
    });

    it('converts Sony S-Log3 to linear', () => {
      const transform = new OCIOTransform('Sony S-Log3', 'Linear');

      // S-Log3 mid-gray
      const [r, g, b] = transform.apply(0.420, 0.420, 0.420);

      expect(r).toBeCloseTo(0.18, 2);
    });
  });

  describe('display transforms', () => {
    it('applies display + view transform', () => {
      const transform = OCIOTransform.createDisplayTransform(
        'ACEScg',
        'sRGB',
        'ACES 1.0 SDR-video'
      );

      // High dynamic range value
      const [r, g, b] = transform.apply(5.0, 5.0, 5.0);

      // Should be tone-mapped to displayable range
      expect(r).toBeLessThanOrEqual(1.0);
      expect(r).toBeGreaterThan(0.9);
    });
  });

  describe('look transforms', () => {
    it('applies forward look transform', () => {
      const transform = OCIOTransform.createWithLook(
        'ACEScg',
        'sRGB',
        'ACES 1.0 SDR-video',
        'Film Look',
        'forward'
      );

      const result = transform.apply(0.5, 0.5, 0.5);
      expect(result).toBeDefined();
    });

    it('applies inverse look transform', () => {
      const forward = OCIOTransform.createWithLook(
        'ACEScg', 'sRGB', 'Standard', 'Film Look', 'forward'
      );
      const inverse = OCIOTransform.createWithLook(
        'ACEScg', 'sRGB', 'Standard', 'Film Look', 'inverse'
      );

      const original = [0.5, 0.5, 0.5];
      const transformed = forward.apply(...original);
      const restored = inverse.apply(...transformed);

      expect(restored[0]).toBeCloseTo(original[0], 2);
      expect(restored[1]).toBeCloseTo(original[1], 2);
      expect(restored[2]).toBeCloseTo(original[2], 2);
    });
  });
});
```

### OCIOProcessor Tests

```typescript
// src/color/ocio/OCIOProcessor.test.ts

describe('OCIOProcessor', () => {
  let processor: OCIOProcessor;

  beforeEach(() => {
    processor = new OCIOProcessor();
  });

  afterEach(() => {
    processor.dispose();
  });

  describe('initialization', () => {
    it('initializes with default config', () => {
      expect(processor.getConfigName()).toBe('aces_1.2');
      expect(processor.isEnabled()).toBe(false);
    });

    it('loads built-in ACES config', () => {
      processor.loadConfig('aces_1.2');

      const colorspaces = processor.getAvailableColorSpaces();
      expect(colorspaces).toContain('ACEScg');
      expect(colorspaces).toContain('sRGB');
    });
  });

  describe('transform baking', () => {
    it('bakes transform to 3D LUT', () => {
      processor.setInputColorSpace('sRGB');
      processor.setWorkingColorSpace('ACEScg');
      processor.setDisplay('sRGB');
      processor.setView('Standard');

      const lut = processor.bakeTo3DLUT(33);

      expect(lut.size).toBe(33);
      expect(lut.data.length).toBe(33 * 33 * 33 * 3);
    });

    it('baked LUT produces same result as direct transform', () => {
      processor.loadConfig('srgb');
      processor.setInputColorSpace('sRGB');
      processor.setWorkingColorSpace('Linear sRGB');
      processor.setDisplay('sRGB');

      const lut = processor.bakeTo3DLUT(33);

      // Apply via direct transform
      const direct = processor.transformColor(0.5, 0.5, 0.5);

      // Apply via LUT
      const lutResult = applyLUT3D(lut, 0.5, 0.5, 0.5);

      expect(lutResult[0]).toBeCloseTo(direct[0], 2);
      expect(lutResult[1]).toBeCloseTo(direct[1], 2);
      expect(lutResult[2]).toBeCloseTo(direct[2], 2);
    });
  });

  describe('ImageData processing', () => {
    it('processes ImageData through OCIO pipeline', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('sRGB');
      processor.setDisplay('Rec.709');

      const imageData = new ImageData(2, 2);
      imageData.data.set([128, 128, 128, 255, 200, 100, 50, 255, 50, 100, 200, 255, 255, 255, 255, 255]);

      const result = processor.apply(imageData);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      // Values should be modified
      expect(result.data[0]).not.toBe(128);
    });

    it('returns unchanged ImageData when disabled', () => {
      processor.setEnabled(false);

      const imageData = new ImageData(2, 2);
      imageData.data.set([128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255]);

      const result = processor.apply(imageData);

      expect(result.data[0]).toBe(128);
    });
  });

  describe('state management', () => {
    it('gets and sets full state', () => {
      const state: OCIOState = {
        enabled: true,
        configName: 'aces_1.2',
        customConfigPath: null,
        inputColorSpace: 'ACEScg',
        detectedColorSpace: null,
        workingColorSpace: 'ACEScg',
        display: 'Rec.709',
        view: 'Standard',
        look: 'Film Look',
        lookDirection: 'forward',
      };

      processor.setState(state);
      const retrieved = processor.getState();

      expect(retrieved).toEqual(state);
    });

    it('emits stateChanged event', () => {
      const callback = vi.fn();
      processor.on('stateChanged', callback);

      processor.setEnabled(true);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });
  });

  describe('color space auto-detection', () => {
    it('detects sRGB from standard video metadata', () => {
      const metadata = {
        colorPrimaries: 'bt709',
        transferCharacteristics: 'sRGB',
        matrixCoefficients: 'bt709',
      };

      const detected = processor.detectColorSpace(metadata);
      expect(detected).toBe('sRGB');
    });

    it('detects ARRI LogC3 from ARRIRAW metadata', () => {
      const metadata = {
        manufacturer: 'ARRI',
        camera: 'ALEXA Mini',
        transferCharacteristics: 'log',
        gammaProfile: 'LogC3',
      };

      const detected = processor.detectColorSpace(metadata);
      expect(detected).toBe('ARRI LogC3 (EI 800)');
    });

    it('returns null for unknown metadata', () => {
      const metadata = {};
      const detected = processor.detectColorSpace(metadata);
      expect(detected).toBeNull();
    });
  });
});
```

### Matrix Conversion Tests

```typescript
// src/color/ocio/colorspaces/matrices.test.ts

describe('Color Space Matrices', () => {
  describe('sRGB <-> XYZ', () => {
    it('converts D65 white to XYZ', () => {
      const [x, y, z] = sRGBToXYZ(1, 1, 1);

      // D65 white point
      expect(x).toBeCloseTo(0.95047, 3);
      expect(y).toBeCloseTo(1.0, 3);
      expect(z).toBeCloseTo(1.08883, 3);
    });

    it('round-trips RGB through XYZ', () => {
      const original = [0.5, 0.3, 0.8];
      const xyz = sRGBToXYZ(...original);
      const back = XYZToSRGB(...xyz);

      expect(back[0]).toBeCloseTo(original[0], 5);
      expect(back[1]).toBeCloseTo(original[1], 5);
      expect(back[2]).toBeCloseTo(original[2], 5);
    });
  });

  describe('ACEScg <-> XYZ', () => {
    it('converts ACEScg white to XYZ D60', () => {
      const [x, y, z] = ACEScgToXYZ(1, 1, 1);

      // D60 white point (approximately)
      expect(y).toBeCloseTo(1.0, 2);
    });

    it('converts between ACEScg and sRGB', () => {
      // ACEScg mid-gray
      const acesGray = [0.18, 0.18, 0.18];
      const xyz = ACEScgToXYZ(...acesGray);
      const srgb = XYZToSRGB(...xyz);

      // Should be roughly similar gray in sRGB
      expect(srgb[0]).toBeCloseTo(srgb[1], 2);
      expect(srgb[1]).toBeCloseTo(srgb[2], 2);
    });
  });

  describe('chromatic adaptation', () => {
    it('adapts D60 to D65 using Bradford', () => {
      const d60White = [0.952646, 1.0, 1.008825];
      const d65White = adaptD60ToD65(...d60White);

      expect(d65White[0]).toBeCloseTo(0.95047, 3);
      expect(d65White[1]).toBeCloseTo(1.0, 3);
      expect(d65White[2]).toBeCloseTo(1.08883, 3);
    });
  });
});
```

### WebGL Shader Tests

```typescript
// src/color/ocio/OCIOProcessor.webgl.test.ts

describe('OCIOProcessor WebGL', () => {
  let canvas: HTMLCanvasElement;
  let gl: WebGL2RenderingContext;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2')!;
  });

  describe('shader generation', () => {
    it('generates valid GLSL for sRGB gamma', () => {
      const shader = generateOCIOShader('sRGB', 'Linear sRGB');

      expect(shader).toContain('srgbToLinear');
      expect(shader).toMatch(/pow\s*\(/);

      // Should compile
      const program = compileShader(gl, shader);
      expect(program).not.toBeNull();
    });

    it('generates valid GLSL for ARRI LogC3', () => {
      const shader = generateOCIOShader('ARRI LogC3 (EI 800)', 'ACEScg');

      expect(shader).toContain('logToLinear');

      const program = compileShader(gl, shader);
      expect(program).not.toBeNull();
    });

    it('generates matrix multiply for primaries conversion', () => {
      const shader = generateOCIOShader('ACEScg', 'sRGB');

      expect(shader).toContain('mat3');

      const program = compileShader(gl, shader);
      expect(program).not.toBeNull();
    });
  });

  describe('3D LUT texture', () => {
    it('creates 3D texture from baked LUT', () => {
      const processor = new OCIOProcessor();
      processor.setInputColorSpace('sRGB');
      processor.setDisplay('sRGB');

      const lut = processor.bakeTo3DLUT(17);
      const texture = create3DLUTTexture(gl, lut);

      expect(texture).not.toBeNull();
      expect(gl.isTexture(texture)).toBe(true);
    });
  });
});
```

### V2 Enhancement Unit Test Cases

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| OCIO-V2-001 | Parse minimal .ocio config | Extract color spaces and displays |
| OCIO-V2-002 | Parse ACES studio config | All ACES spaces available |
| OCIO-V2-003 | Invalid config rejected gracefully | Error returned, state unchanged |
| OCIO-V2-004 | Per-source input space stored | Different sources have different inputs |
| OCIO-V2-005 | Source switch updates pipeline | Transform chain rebuilds on source change |
| OCIO-V2-006 | Look transform applied in chain | Visual difference when look enabled |
| OCIO-V2-007 | Inverse look direction works | Inverse produces different result |
| OCIO-V2-008 | Working space grading order correct | Grade applied before display transform |
| OCIO-V2-009 | Config with LUT references resolves | Referenced LUT files loaded |
| OCIO-V2-010 | Auto-detect from EXR metadata | Correct color space detected |

## Dependencies

### Required
- None (use existing infrastructure)

### Optional (for full OCIO support)
- `js-yaml` - OCIO config file parsing
- `ocio.js` - WebAssembly port of OpenColorIO (if available)

### Feature Dependencies
- Feature: CIE XYZ Color Space Matrices (for additional transfer functions/matrices)
- Feature: HDR Image Formats (for EXR metadata auto-detection)

## References

- [OpenColorIO Documentation](https://opencolorio.readthedocs.io/)
- [ACES Central](https://acescentral.com/)
- [Academy Color Encoding System](https://www.oscars.org/science-technology/sci-tech-projects/aces)
- Original OpenRV: `src/lib/ip/OCIONodes/OCIOIPNode.cpp`
- GTO Spec: `spec/spec.md` - RVOCIO section
