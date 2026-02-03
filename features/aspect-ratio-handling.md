# Aspect Ratio Handling

## Status
- [ ] Not implemented
- [x] Partially implemented
- [ ] Fully implemented

**Implementation Coverage:**
| Feature | Status | Location |
|---------|--------|----------|
| Display aspect ratio overlays | Implemented | SafeAreasOverlay.ts |
| Letterboxing/pillarboxing visualization | Implemented | SafeAreasOverlay.ts |
| Common aspect ratio presets | Implemented | SafeAreasOverlay.ts, CropControl.ts |
| Fit/zoom viewing modes | Implemented | Viewer.ts, ViewerRenderingUtils.ts |
| Aspect-constrained crop | Implemented | CropControl.ts, Viewer.ts |
| Pixel aspect ratio (PAR) support | Not implemented | - |
| Anamorphic format support | Not implemented | - |
| Mixed aspect ratio comparison | Not implemented | - |

## Original OpenRV Implementation
OpenRV properly handles various aspect ratios common in VFX and film:

**Pixel Aspect Ratio (PAR)**:
- Per-source pixel aspect ratio setting (-pa flag)
- Automatic detection from file metadata
- Support for anamorphic formats (2:1 squeeze)
- Correct display of non-square pixels

**Display Aspect Ratio**:
- Proper scaling to maintain aspect ratio
- Fit vs fill modes
- Letterboxing/pillarboxing as needed

**Common Formats**:
- 16:9 HD (1920x1080)
- 2.39:1 Cinemascope
- 4:3 Standard
- 1:1 Square
- Various film formats

**Mixed Aspect Handling**:
- Compare images of different aspects
- Layout/grid view with mixed aspects
- Automatic letterboxing in comparisons

**Resolution Independence**:
- Handle different resolutions together
- Scale to fit while preserving aspect
- Uncrop for positioning different sizes

## Requirements
- [x] Display aspect ratio preservation
- [x] Letterbox/pillarbox visualization guides
- [x] Fit/fill viewing modes
- [x] Common aspect ratio presets
- [x] Aspect-constrained cropping
- [ ] Pixel aspect ratio support
- [ ] Automatic aspect detection from metadata
- [ ] Manual aspect ratio override per source
- [ ] Mixed aspect ratio comparison
- [ ] Anamorphic format support (2:1 squeeze)

---

## Current Implementation

### 1. SafeAreasOverlay (Aspect Ratio Guides)
**File:** `/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts`

Provides visual aspect ratio overlay guides with letterbox/pillarbox visualization:

```typescript
export type AspectRatioGuide =
  | '16:9'
  | '4:3'
  | '1:1'
  | '2.39:1'
  | '2.35:1'
  | '1.85:1'
  | '9:16'
  | 'custom';

export const ASPECT_RATIOS: Record<AspectRatioGuide, AspectRatioDefinition> = {
  '16:9': { label: '16:9 (HD)', ratio: 16 / 9 },
  '4:3': { label: '4:3 (SD)', ratio: 4 / 3 },
  '1:1': { label: '1:1 (Square)', ratio: 1 },
  '2.39:1': { label: '2.39:1 (Scope)', ratio: 2.39 },
  '2.35:1': { label: '2.35:1 (Cinemascope)', ratio: 2.35 },
  '1.85:1': { label: '1.85:1 (Flat)', ratio: 1.85 },
  '9:16': { label: '9:16 (Vertical)', ratio: 9 / 16 },
  custom: { label: 'Custom', ratio: 1 },
};
```

**Features:**
- Letterbox bars (horizontal bars for wider target ratios)
- Pillarbox bars (vertical bars for narrower target ratios)
- Aspect ratio labels displayed on canvas
- Custom aspect ratio support
- Configurable guide color and opacity

### 2. SafeAreasControl (UI Component)
**File:** `/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts`

Dropdown control in View tab for managing guides:
- Enable/disable guides toggle
- Aspect ratio dropdown selection
- Safe areas toggle (title safe 80%, action safe 90%)
- Composition guides (rule of thirds, center crosshair)

### 3. CropControl (Aspect-Constrained Cropping)
**File:** `/Users/lifeart/Repos/openrv-web/src/ui/components/CropControl.ts`

Supports aspect-ratio-constrained crop regions:

```typescript
export const ASPECT_RATIOS: { label: string; value: string | null; ratio: number | null }[] = [
  { label: 'Free', value: null, ratio: null },
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '1:1', value: '1:1', ratio: 1 },
  { label: '9:16', value: '9:16', ratio: 9 / 16 },
  { label: '2.35:1', value: '2.35:1', ratio: 2.35 },
];
```

### 4. Viewer Display Dimensions
**File:** `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts`

Calculates display dimensions preserving aspect ratio:

```typescript
export function calculateDisplayDimensions(
  sourceWidth: number,
  sourceHeight: number,
  containerWidth: number,
  containerHeight: number,
  zoom: number
): { width: number; height: number }
```

- Fits source to container while preserving aspect ratio
- Never upscales beyond source resolution (at 100% zoom)
- Supports zoom levels for detailed inspection

---

## UI/UX Specification

### Aspect Ratio Guide Control (Implemented)
Located in **View Tab** as the "Guides" dropdown:

```
[Guides (N)] - Dropdown button showing count of active guides
  Dropdown Contents:
  - Enable Guides [checkbox]
  ---
  Safe Areas:
  - Action Safe (90%) [checkbox]
  - Title Safe (80%) [checkbox]
  ---
  Composition:
  - Center Crosshair [checkbox]
  - Rule of Thirds [checkbox]
  ---
  Aspect Ratio:
  [Select: None | 16:9 (HD) | 4:3 (SD) | 1:1 (Square) | 2.39:1 (Scope) | ...]
```

### Keyboard Shortcuts (Implemented)
| Shortcut | Action |
|----------|--------|
| `;` | Toggle safe areas overlay |
| `G` | Toggle guides (alternate) |
| `F` | Fit to window |
| `K` | Toggle crop mode |

### Visual Behavior
- **Letterbox**: Dark semi-transparent bars at top/bottom for wider target ratios
- **Pillarbox**: Dark semi-transparent bars at left/right for narrower target ratios
- **Border lines**: White guide lines at the boundary of the viewing area
- **Aspect label**: Shows selected ratio (e.g., "2.39:1 (Scope)") in bottom-right

---

## Technical Notes

### Display Scaling Algorithm
The viewer uses a "fit" algorithm that preserves aspect ratio:

1. Calculate scale to fit source in container: `min(containerW/sourceW, containerH/sourceH, 1.0)`
2. Apply zoom multiplier: `scale * zoom`
3. Calculate final dimensions: `sourceW * scale`, `sourceH * scale`

This ensures images are never stretched/distorted and appear at native resolution when possible.

### Aspect Ratio Constraint in Crop
When cropping with an aspect ratio constraint:
1. User drags a handle
2. The opposite dimension is automatically adjusted to maintain ratio
3. Constraint respects source pixel dimensions for accurate ratio calculation
4. Minimum crop size enforced (5% of each dimension)

### HiDPI Support
All overlays use `setupHiDPICanvas()` for crisp rendering on Retina displays:
- Physical dimensions: `logicalSize * devicePixelRatio`
- CSS dimensions: `logicalSize`
- Context transform: `scale(devicePixelRatio, devicePixelRatio)`

---

## E2E Test Cases

### Existing Tests (e2e/safe-areas.spec.ts)

| Test ID | Description | Status |
|---------|-------------|--------|
| SA-E001 | Safe areas are disabled by default | Passing |
| SA-E002 | Pressing semicolon toggles safe areas | Passing |
| SA-E003 | Safe areas overlay is visible when enabled | Passing |
| SA-E010 | Title safe is enabled by default | Passing |
| SA-E011 | Action safe is enabled by default | Passing |
| SA-E012 | Center crosshair is disabled by default | Passing |
| SA-E013 | Rule of thirds is disabled by default | Passing |
| SA-E014 | Toggling title safe updates state | Passing |
| SA-E015 | Toggling action safe updates state | Passing |
| SA-E016 | Toggling center crosshair updates state | Passing |
| SA-E017 | Toggling rule of thirds updates state | Passing |
| SA-E020 | No aspect ratio overlay by default | Passing |
| SA-E021 | Setting 16:9 aspect ratio updates state | Passing |
| SA-E022 | Setting 2.39:1 aspect ratio updates state | Passing |
| SA-E023 | Clearing aspect ratio updates state | Passing |
| SA-E030 | Safe areas control exists in View tab | Passing |
| SA-E040 | Safe areas state persists when changing frames | Passing |
| SA-E041 | Safe areas guide settings persist when changing frames | Passing |
| SA-E042 | Safe areas state persists when changing tabs | Passing |
| SA-E050 | Safe areas overlay canvas has correct CSS dimensions for HiDPI | Passing |
| SA-E051 | Safe areas overlay is not oversized (HiDPI regression test) | Passing |

### Additional E2E Tests Needed (for full coverage)

| Test ID | Description | Priority |
|---------|-------------|----------|
| AR-001 | Letterbox bars appear when selecting wider aspect ratio | High |
| AR-002 | Pillarbox bars appear when selecting narrower aspect ratio | High |
| AR-003 | Aspect ratio label displays in overlay | Medium |
| AR-004 | Custom aspect ratio value can be set | Medium |
| AR-005 | Aspect-constrained crop maintains ratio during resize | High |
| AR-006 | Crop ratio constraint switches correctly between presets | Medium |
| AR-007 | Fit to window maintains aspect ratio | High |
| AR-008 | Zoom preserves aspect ratio | High |
| AR-009 | Portrait (9:16) source displays correctly | Medium |
| AR-010 | Square (1:1) source displays correctly | Medium |

---

## Unit Test Cases

### Existing Tests

#### SafeAreasOverlay.test.ts
| Test ID | Description | Status |
|---------|-------------|--------|
| SAFE-001 | Starts disabled | Passing |
| SAFE-002 | Default state matches specification | Passing |
| SAFE-003 | Provides canvas element | Passing |
| SAFE-004 | Toggle enables/disables | Passing |
| SAFE-010 | Enable shows overlay | Passing |
| SAFE-011 | Disable hides overlay | Passing |
| SAFE-020-021 | Title safe toggle and event emission | Passing |
| SAFE-030-031 | Action safe toggle and event emission | Passing |
| SAFE-040-045 | Aspect ratio setting and presets | Passing |
| SAFE-050-052 | Center crosshair toggle | Passing |
| SAFE-060-062 | Rule of thirds toggle | Passing |
| SAFE-070-073 | Guide color and opacity customization | Passing |
| SAFE-080-082 | setState updates multiple properties | Passing |
| SAFE-090-091 | getState returns copy with all properties | Passing |
| SAFE-100-101 | setViewerDimensions updates canvas | Passing |
| SAFE-110-112 | Render handles various states | Passing |
| SAFE-130-133 | HiDPI scaling support | Passing |

#### SafeAreasControl.test.ts
| Test ID | Description | Status |
|---------|-------------|--------|
| SAFE-U001-U002 | Instance creation and overlay access | Passing |
| SAFE-U010-U015 | Render returns correct elements | Passing |
| SAFE-U020-U024 | Button styling states | Passing |
| SAFE-U030-U032 | Button label updates with active count | Passing |
| SAFE-U040-U047 | Dropdown behavior and contents | Passing |
| SAFE-U050-U054 | Checkbox interactions | Passing |
| SAFE-U060-U064 | Aspect ratio select | Passing |
| SAFE-U070-U072 | Keyboard handling | Passing |
| SAFE-U080-U081 | Event emission | Passing |
| SAFE-U090-U091 | Dropdown item hover | Passing |
| SAFE-U100-U102 | Dispose cleanup | Passing |
| SAFE-U110-U112 | Positioning | Passing |

### Additional Unit Tests Needed (for PAR support)

| Test ID | Description | Priority |
|---------|-------------|----------|
| PAR-U001 | Pixel aspect ratio default is 1:1 (square pixels) | High |
| PAR-U002 | setPixelAspectRatio updates display dimensions | High |
| PAR-U003 | Anamorphic 2:1 squeeze displays correctly | High |
| PAR-U004 | PAR persists across frame changes | Medium |
| PAR-U005 | PAR can be set per-source | Medium |
| PAR-U006 | PAR resets when changing sources | Medium |

---

## Future Implementation: Pixel Aspect Ratio (PAR)

### Proposed API

```typescript
// In Session or Source
interface SourceMetadata {
  pixelAspectRatio: number;  // e.g., 1.0 for square, 2.0 for 2:1 anamorphic
  displayAspectRatio?: number;  // Calculated from resolution + PAR
}

// In Viewer
setPixelAspectRatio(par: number): void;
getEffectiveDisplayDimensions(): { width: number; height: number };
```

### Implementation Notes
1. **Metadata detection**: Read PAR from video/image container metadata when available
2. **Manual override**: Allow user to set PAR via UI control
3. **Display adjustment**: Scale horizontal dimension by PAR before calculating display dimensions
4. **Export handling**: Option to export with PAR baked in or preserved in metadata

### Common PAR Values
| Format | PAR | Notes |
|--------|-----|-------|
| Square pixels | 1.0 | HD, 4K, most modern formats |
| NTSC DV | 0.9091 | 720x480 displayed as 4:3 |
| PAL DV | 1.0926 | 720x576 displayed as 4:3 |
| NTSC DV Widescreen | 1.2121 | 720x480 displayed as 16:9 |
| Anamorphic 2x | 2.0 | 2:1 squeeze |

---

## Related Files

- `/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts` - Aspect ratio guide rendering
- `/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts` - UI control component
- `/Users/lifeart/Repos/openrv-web/src/ui/components/CropControl.ts` - Aspect-constrained crop
- `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts` - Display dimension calculation
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts` - calculateDisplayDimensions
- `/Users/lifeart/Repos/openrv-web/e2e/safe-areas.spec.ts` - E2E tests
- `/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.test.ts` - Unit tests
- `/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.test.ts` - Unit tests
