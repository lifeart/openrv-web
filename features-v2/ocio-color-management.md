# OCIO Color Management (v2 Enhancements)

## Original OpenRV Implementation

OpenRV integrates OpenColorIO for industry-standard color management:

- **Full OCIO Config Support**: Load `.ocio` config files from studio pipelines
- **Transform Chain**: Input -> Working -> Look -> Display/View
- **GPU Acceleration**: All transforms run as GPU shader operations
- **Per-Source Input Space**: Each media source can have its own input color space
- **Auto-Detection**: Detect input color space from file metadata (EXR headers, OIIO metadata)
- **Look Transforms**: Apply creative looks (film emulation, shot-specific grades)
- **Custom Config Loading**: Load studio-specific OCIO configurations at runtime

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

## Implementation Plan

### Files to Create/Modify

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

## Unit Test Cases

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

## E2E Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| OCIO-V2-E001 | Load custom config file | Click load config, select .ocio | Config name appears in dropdown |
| OCIO-V2-E002 | Custom config color spaces available | Load config, open input dropdown | Custom spaces listed |
| OCIO-V2-E003 | Per-source input preserved | Set input on source A, switch to B, back to A | A retains its input space |
| OCIO-V2-E004 | Look selection changes canvas | Enable OCIO, select a look | Canvas visually different |
| OCIO-V2-E005 | Config switch updates all dropdowns | Switch from ACES to sRGB Studio | Dropdowns repopulate correctly |

## Dependencies
- Feature: CIE XYZ Color Space Matrices (for additional transfer functions/matrices)
- Feature: HDR Image Formats (for EXR metadata auto-detection)
