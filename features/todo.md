# OpenRV Web - Feature Implementation TODO

## Agent Instructions

This document contains self-contained task definitions for implementing features. Each task includes all context needed for a fresh agent to complete it without prior conversation history.

### Workflow Protocol

1. **Pick ONE task** from the priority list below
2. **Read the linked feature file** for full specification
3. **Implement** following the guidelines in this document
4. **Log completion** by updating the task status in this file
5. **Hand off** - spawn new agent for next task to avoid context pollution

### Completion Logging Format

When completing a task, update its entry:
```markdown
| ~~Task Name~~ | ~~Description~~ | ~~Done~~ | Completed: YYYY-MM-DD, Files: list.ts, test.ts |
```

---

## Quick Context (Read First)

**Project**: OpenRV Web - VFX image/video viewer (TypeScript, Vite, Vitest, Playwright)

**Key Files**:
- `/UI.md` - UI patterns, CSS variables, component guidelines
- `/README.md` - Architecture overview, keyboard shortcuts
- `/src/App.ts` - Main application entry
- `/src/ui/components/Viewer.ts` - Main viewer component
- `/src/core/session/Session.ts` - Playback/media state

**Test Commands**:
```bash
pnpm test              # Unit tests
pnpm dev && npx playwright test  # E2E tests
```

**Style Rules**:
- Use CSS variables: `var(--bg-primary)`, `var(--accent-primary)`, etc.
- Add `data-testid="feature-name"` to all interactive elements
- Extend `EventEmitter` for stateful components
- No emojis in UI - use `getIconSvg()` from `/src/ui/components/shared/Icons.ts`

---

## Priority 1: Partially Implemented (Complete These First)

### 1.1 EXR Format Support

| Field | Value |
|-------|-------|
| **Feature File** | `/features/image-format-support.md` |
| **Status** | Not Started |
| **What Exists** | PNG/JPEG/WebP loading via HTMLImageElement |
| **What To Build** | WebAssembly EXR decoder, float texture support |
| **Key Files** | `/src/nodes/sources/FileSourceNode.ts`, `/src/core/image/Image.ts` |
| **Tests Needed** | Unit: EXR parsing, float data. E2E: Load EXR, verify HDR values |
| **Acceptance** | Can load .exr files, display HDR content with exposure control |

**Implementation Steps**:
1. Add WebAssembly EXR decoder (consider openexr.js or similar)
2. Update `FileSourceNode` to detect and decode EXR
3. Update `IPImage` to handle float32 data
4. Update WebGL renderer for float textures
5. Add unit tests for EXR parsing
6. Add E2E tests for EXR loading

---

### 1.2 OCIO Runtime Processing

| Field | Value |
|-------|-------|
| **Feature File** | `/features/opencolorio-integration.md` |
| **Status** | Not Started |
| **What Exists** | GTO RVOCIO node parsing/export, LUT support, log curves |
| **What To Build** | OCIO config loading, color space transforms, UI controls |
| **Key Files** | `/src/color/`, `/src/ui/components/ColorControls.ts` |
| **Tests Needed** | Unit: Transform matrices, config parsing. E2E: Color space selection |
| **Acceptance** | Load OCIO config, apply input/output transforms |

**Implementation Steps**:
1. Create `/src/color/OCIOConfig.ts` for config parsing
2. Create `/src/color/OCIOTransform.ts` for matrix transforms
3. Build transform matrices for common spaces (sRGB, Rec.709, ACEScg)
4. Add OCIOControl UI component
5. Integrate with render pipeline
6. Add tests

---

### 1.3 Tone Mapping for HDR

| Field | Value |
|-------|-------|
| **Feature File** | `/features/hdr-display.md` |
| **Status** | Not Started |
| **What Exists** | Exposure control (±5 stops), clipping indicators, false color |
| **What To Build** | Tone mapping operators (Filmic, ACES, Reinhard) |
| **Key Files** | `/src/render/Renderer.ts`, `/src/ui/components/ColorControls.ts` |
| **Tests Needed** | Unit: Tone map formulas. E2E: HDR image with tone mapping |
| **Acceptance** | HDR content displays correctly with selectable tone mapping |

**Implementation Steps**:
1. Add tone mapping shader code to `/src/render/shaders/`
2. Create `ToneMappingControl` UI component
3. Add tone map selection dropdown (Off, Reinhard, Filmic, ACES)
4. Integrate with WebGL render pipeline
5. Add tests

---

### ~~1.4 ProRes/DNxHD Codec Support~~

| Field | Value |
|-------|-------|
| **Feature File** | `/features/video-codec-support.md` |
| **Status** | ~~Done~~ Completed: 2026-02-03 |
| **What Exists** | H.264, VP8/VP9, AV1 via WebCodecs |
| **What Built** | Codec detection, error modal with transcoding guidance |
| **Key Files** | `/src/utils/CodecUtils.ts`, `/src/nodes/sources/VideoSourceNode.ts`, `/src/utils/MediabunnyFrameExtractor.ts` |
| **Tests** | Unit: CodecUtils.test.ts, E2E: unsupported-codec.spec.ts |
| **Acceptance** | Clear error messages with FFmpeg transcoding commands provided |

**Implementation Summary**:
- Created `CodecUtils.ts` for codec detection (ProRes, DNxHD variants)
- Added `UnsupportedCodecException` in MediabunnyFrameExtractor
- VideoSourceNode returns `VideoLoadResult` with codec info
- Session emits `unsupportedCodec` event
- App shows modal with transcoding guidance
- Browser limitations documented in feature spec

---

### ~~1.5 Channel Remapping / EXR AOV~~

| Field | Value |
|-------|-------|
| **Feature File** | `/features/channel-isolation.md` |
| **Status** | ~~Done~~ Completed: 2026-02-03 |
| **What Exists** | RGB/R/G/B/A/Luma isolation working |
| **What Built** | EXR layer selection UI, channel remapping, multi-layer support |
| **Key Files** | `/src/ui/components/ChannelSelect.ts`, `/src/formats/EXRDecoder.ts`, `/src/nodes/sources/FileSourceNode.ts` |
| **Tests** | Unit: EXRDecoder.test.ts (layer extraction, channel remapping), ChannelSelect.test.ts (EXR layer UI). E2E: exr-layers.spec.ts |
| **Acceptance** | Can select different layers from multi-layer EXR |

**Implementation Summary**:
- Extended `EXRDecoder.ts` with `extractLayerInfo()` to parse multi-layer channels
- Added `resolveChannelMapping()` for custom channel-to-RGBA mapping
- Updated `FileSourceNode.ts` with `getEXRLayers()` and `setEXRLayer()` methods
- Enhanced `ChannelSelect.ts` with layer dropdown UI (appears only for multi-layer EXR)
- Integrated layer selection with App.ts via `updateEXRLayers()` and `handleEXRLayerChange()`
- Created test multi-layer EXR generator script and sample file

---

### ~~1.6 Sequence Detection Improvements~~

| Field | Value |
|-------|-------|
| **Feature File** | `/features/image-sequence-detection.md` |
| **Status** | ~~Done~~ Completed: 2026-02-03 |
| **What Exists** | Multi-file sequence detection, pattern parsing |
| **What Built** | Single file inference, directory scanning, %04d/#### notation parsing |
| **Key Files** | `/src/utils/SequenceLoader.ts`, `/src/ui/components/layout/HeaderBar.ts` |
| **Tests** | Unit: SequenceLoader.test.ts (88 tests). E2E: image-sequence.spec.ts (11 tests) |
| **Acceptance** | Drop one frame, automatically detect full sequence

**Implementation Summary**:
- Added pattern notation parsing (`parsePrintfPattern`, `parseHashPattern`, `parseAtPattern`)
- Added pattern conversion (`toHashNotation`, `toPrintfNotation`, `generateFilename`)
- Added single file inference (`extractPatternFromFilename`, `inferSequenceFromSingleFile`)
- Added directory scanning (`discoverSequences`, `getBestSequence`, `findMatchingFiles`)
- Updated HeaderBar to use sequence inference when loading files
- Created test image sequence generator script
- Added 44 new unit tests for pattern parsing and sequence inference
- Added 11 E2E tests for sequence loading and playback

---

### ~~1.7 Pixel Inspector Enhancements~~

| Field | Value |
|-------|-------|
| **Feature File** | `/features/pixel-inspector.md` |
| **Status** | ~~Done~~ Completed: 2026-02-03 |
| **What Exists** | RGB/HSL/IRE display, click-to-lock |
| **What Built** | Area averaging (1x1, 3x3, 5x5, 9x9), source vs rendered toggle, alpha display |
| **Key Files** | `/src/ui/components/PixelProbe.ts`, `/src/ui/components/Viewer.ts` |
| **Tests** | Unit: PixelProbe.test.ts (area averaging, alpha, source mode). E2E: pixel-probe.spec.ts |
| **Acceptance** | Can sample area average, see pre/post color pipeline values |

**Implementation Summary**:
- Added `SampleSize` type (1 | 3 | 5 | 9) for area averaging
- Added `SourceMode` type ('rendered' | 'source') for viewing pre/post color pipeline
- Added alpha channel display (0-255 and 0.0-1.0 formats)
- Created `calculateAreaAverage()` function for NxN pixel sampling
- Added UI controls for sample size selection and source mode toggle
- Added `getSourceImageData()` method to Viewer for source pixel access
- Extended test-helper.ts and fixtures.ts with new state fields

---

### ~~1.8 Crop Canvas Extension (Uncrop)~~

| Field | Value |
|-------|-------|
| **Feature File** | `/features/crop-uncrop.md` |
| **Status** | ~~Done~~ Completed: 2026-02-03 |
| **What Exists** | Full crop functionality with handles and presets |
| **What Built** | Uncrop/canvas extension with uniform and per-side padding modes |
| **Key Files** | `/src/ui/components/CropControl.ts`, `/src/ui/components/Viewer.ts` |
| **Tests** | Unit: CropControl.test.ts (29 new uncrop tests). E2E: uncrop.spec.ts (9 tests) |
| **Acceptance** | Can add padding around image for composition reference |

---

### ~~1.9 Pixel Aspect Ratio Support~~

| Field | Value |
|-------|-------|
| **Feature File** | `/features/aspect-ratio-handling.md` |
| **Status** | ~~Done~~ Completed: 2026-02-03 |
| **What Exists** | Display aspect overlays, letterbox/pillarbox |
| **What Built** | PAR detection from metadata, anamorphic squeeze correction, presets, keyboard shortcut |
| **Key Files** | `/src/utils/PixelAspectRatio.ts`, `/src/ui/components/PARControl.ts`, `/src/ui/components/Viewer.ts`, `/src/core/image/Image.ts` |
| **Tests** | Unit: PixelAspectRatio.test.ts (28 tests), PARControl.test.ts (13 tests). E2E: pixel-aspect-ratio.spec.ts (11 tests) |
| **Acceptance** | Anamorphic footage displays with correct squeeze |

---

## Priority 2: Not Implemented (New Features)

### ~~2.1 Fullscreen / Presentation Mode~~

| Field | Value |
|-------|-------|
| **Feature File** | `/features/fullscreen-presentation.md` |
| **Status** | ~~Done~~ Completed: 2026-02-03 |
| **What Exists** | FullscreenManager, PresentationMode, HeaderBar buttons |
| **What Built** | Fullscreen API toggle, presentation mode with UI hiding, cursor auto-hide, keyboard shortcuts |
| **Key Files** | `/src/utils/FullscreenManager.ts`, `/src/utils/PresentationMode.ts`, `/src/App.ts`, `/src/ui/components/layout/HeaderBar.ts` |
| **Tests** | Unit: FullscreenManager.test.ts (13 tests), PresentationMode.test.ts (20 tests). E2E: fullscreen-presentation.spec.ts |
| **Acceptance** | Press F11 or button to enter fullscreen, Ctrl+Shift+P for presentation mode with clean display |

**Implementation Steps**:
1. Create `FullscreenManager` class using Fullscreen API
2. Add fullscreen button to HeaderBar
3. Create `PresentationMode` class for UI hiding
4. Add cursor auto-hide on inactivity
5. Add keyboard shortcut (F11)
6. Add tests

---

### ~~2.2 Background Pattern Selector~~

| Field | Value |
|-------|-------|
| **Feature File** | `/features/background-pattern.md` |
| **Status** | ~~Done~~ Completed: 2026-02-03 |
| **What Exists** | Solid black viewer background |
| **What Built** | Checker, grey18, grey50, white, crosshatch, custom color backgrounds for alpha visualization |
| **Key Files** | `/src/ui/components/BackgroundPatternControl.ts`, `/src/ui/components/Viewer.ts`, `/src/App.ts` |
| **Tests** | Unit: BackgroundPatternControl.test.ts (32 tests). E2E: background-pattern.spec.ts (14 tests) |
| **Acceptance** | Can toggle background pattern from View tab, keyboard shortcuts Shift+B and Shift+Alt+B |

**Implementation Summary**:
- Created `BackgroundPatternControl.ts` with dropdown UI for pattern selection
- Added `drawBackgroundPattern()` function for rendering patterns on canvas
- Integrated into Viewer render pipeline (draws pattern before image for alpha transparency)
- Added keyboard shortcuts: Shift+B (cycle patterns), Shift+Alt+B (toggle checkerboard)
- Exposed state via test-helper for E2E testing
- Added 32 unit tests and 14 E2E tests

---

### 2.3 Network Sync (Advanced)

| Field | Value |
|-------|-------|
| **Feature File** | `/features/network-sync.md` |
| **Status** | Not Started |
| **What Exists** | Nothing |
| **What To Build** | WebSocket sync, room management, user presence |
| **Key Files** | Create `/src/network/` directory |
| **Tests Needed** | Unit: Message protocol. E2E: Two-client sync |
| **Acceptance** | Two users can sync playback in real-time |
| **Note** | Requires server infrastructure - may defer |

---

### ~~2.4 Scripting API (Advanced)~~

| Field | Value |
|-------|-------|
| **Feature File** | `/features/scripting-api.md` |
| **Status** | ~~Done~~ Completed: 2026-02-03 |
| **What Exists** | Internal test helper only |
| **What Built** | Public `window.openrv` API with modular sub-APIs (playback, media, audio, loop, view, color, markers, events), event bridging, input validation |
| **Key Files** | `/src/api/OpenRVAPI.ts`, `/src/api/PlaybackAPI.ts`, `/src/api/MediaAPI.ts`, `/src/api/AudioAPI.ts`, `/src/api/LoopAPI.ts`, `/src/api/ViewAPI.ts`, `/src/api/ColorAPI.ts`, `/src/api/MarkersAPI.ts`, `/src/api/EventsAPI.ts`, `/src/api/index.ts`, `/src/App.ts`, `/src/main.ts` |
| **Tests** | Unit: OpenRVAPI.test.ts (80+ tests). E2E: scripting-api.spec.ts |
| **Acceptance** | Can control playback from browser console via `window.openrv` |

---

## Priority 3: Minor Improvements (Enhancements)

These are lower priority - implement after Priority 1 & 2.

| Task | Feature File | What To Add | Effort |
|------|--------------|-------------|--------|
| ~~Audio pitch correction~~ | ~~`playback-speed-control.md`~~ | ~~Pitch preservation at non-1x speeds~~ | ~~Done~~ |
| SMPTE timecode display | `timeline-navigation.md` | HH:MM:SS:FF format option | Low |
| Hue rotation control | `color-correction.md` | Global hue shift slider | Low |
| ~~Smooth zoom animation~~ | ~~`pan-zoom-rotate.md`~~ | ~~requestAnimationFrame + ease-out cubic~~ | ~~Done~~ |
| Duration markers | `markers-annotations.md` | Markers spanning frame ranges | Medium |
| WebXR stereo support | `stereo-3d-viewing.md` | VR headset viewing | High |
| ~~Sub-frame interpolation~~ | ~~`frame-accurate-playback.md`~~ | ~~Alpha blending for slow-mo~~ | ~~Done~~ |

---

## Reference: Key Patterns

### Creating a UI Control

```typescript
// /src/ui/components/MyControl.ts
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';

interface MyControlEvents extends EventMap {
  stateChanged: MyState;
}

interface MyState {
  enabled: boolean;
  value: number;
}

export class MyControl extends EventEmitter<MyControlEvents> {
  private container: HTMLElement;
  private state: MyState = { enabled: false, value: 0 };

  constructor() {
    super();
    this.container = document.createElement('div');
    this.container.dataset.testid = 'my-control';
    this.buildUI();
  }

  private buildUI(): void {
    // Use CSS variables
    this.container.style.cssText = `
      display: flex;
      gap: 4px;
      background: var(--bg-secondary);
    `;
    // Use icon system
    const btn = document.createElement('button');
    btn.innerHTML = getIconSvg('settings', 'sm');
    btn.dataset.testid = 'my-control-button';
    this.container.appendChild(btn);
  }

  setState(state: MyState): void {
    this.state = { ...state };
    this.emit('stateChanged', this.state);
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.container.remove();
  }
}
```

### Writing Unit Tests

```typescript
// /src/ui/components/MyControl.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MyControl } from './MyControl';

describe('MyControl', () => {
  let control: MyControl;

  beforeEach(() => {
    control = new MyControl();
  });

  it('MY-U001: should have correct initial state', () => {
    expect(control.getState().enabled).toBe(false);
  });

  it('MY-U002: should emit stateChanged on setState', () => {
    const handler = vi.fn();
    control.on('stateChanged', handler);
    control.setState({ enabled: true, value: 50 });
    expect(handler).toHaveBeenCalledWith({ enabled: true, value: 50 });
  });
});
```

### Writing E2E Tests

```typescript
// /e2e/my-feature.spec.ts
import { test, expect } from '@playwright/test';
import { loadVideoFile, getViewerState, waitForTestHelper } from './fixtures';

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('MY-001: control should be visible', async ({ page }) => {
    const control = page.locator('[data-testid="my-control"]');
    await expect(control).toBeVisible();
  });

  test('MY-002: clicking should change state', async ({ page }) => {
    await page.click('[data-testid="my-control-button"]');
    await page.waitForTimeout(100);
    const state = await getViewerState(page);
    expect(state.myFeatureEnabled).toBe(true);
  });
});
```

### Exposing State for E2E Tests

```typescript
// Update /src/test-helper.ts
export interface ViewerState {
  // ... existing
  myFeatureEnabled: boolean;
  myFeatureValue: number;
}

// In getViewerState():
myFeatureEnabled: viewer.myControl?.getState().enabled ?? false,
myFeatureValue: viewer.myControl?.getState().value ?? 0,
```

---

## Completed Tasks Log

| Task | Completed | Files Changed |
|------|-----------|---------------|
| 1.4 ProRes/DNxHD Codec Support | 2026-02-03 | CodecUtils.ts, MediabunnyFrameExtractor.ts, VideoSourceNode.ts, Session.ts, App.ts, CodecUtils.test.ts, unsupported-codec.spec.ts |
| 1.5 Channel Remapping / EXR AOV | 2026-02-03 | EXRDecoder.ts, ChannelSelect.ts, FileSourceNode.ts, App.ts, fixtures.ts, EXRDecoder.test.ts, ChannelSelect.test.ts, exr-layers.spec.ts |
| 1.6 Sequence Detection Improvements | 2026-02-03 | SequenceLoader.ts, HeaderBar.ts, SequenceLoader.test.ts, image-sequence.spec.ts, fixtures.ts, generate-test-sequence.cjs |
| 1.7 Pixel Inspector Enhancements | 2026-02-03 | PixelProbe.ts, Viewer.ts, test-helper.ts, fixtures.ts, PixelProbe.test.ts, pixel-probe.spec.ts |
| 1.8 Crop Canvas Extension (Uncrop) | 2026-02-03 | CropControl.ts, Viewer.ts, App.ts, test-helper.ts, fixtures.ts, CropControl.test.ts, uncrop.spec.ts |
| 1.9 Pixel Aspect Ratio Support | 2026-02-03 | PixelAspectRatio.ts, PARControl.ts, Viewer.ts, Image.ts, App.ts, Icons.ts, KeyBindings.ts, test-helper.ts, fixtures.ts, PixelAspectRatio.test.ts, PARControl.test.ts, pixel-aspect-ratio.spec.ts |
| 2.1 Fullscreen / Presentation Mode | 2026-02-03 | FullscreenManager.ts, PresentationMode.ts, App.ts, HeaderBar.ts, KeyBindings.ts, test-helper.ts, fixtures.ts, FullscreenManager.test.ts, PresentationMode.test.ts, fullscreen-presentation.spec.ts |
| 2.2 Background Pattern Selector | 2026-02-03 | BackgroundPatternControl.ts, Viewer.ts, App.ts, KeyBindings.ts, test-helper.ts, fixtures.ts, BackgroundPatternControl.test.ts, background-pattern.spec.ts |
| 2.4 Scripting API | 2026-02-03 | OpenRVAPI.ts, PlaybackAPI.ts, MediaAPI.ts, AudioAPI.ts, LoopAPI.ts, ViewAPI.ts, ColorAPI.ts, MarkersAPI.ts, EventsAPI.ts, index.ts, App.ts, main.ts, OpenRVAPI.test.ts, scripting-api.spec.ts |
| 3.4 Smooth zoom animation | 2026-02-03 | ViewerInteraction.ts, Viewer.ts, App.ts, ViewerInteraction.test.ts, pan-zoom-rotate.md |
| 3.1 Audio pitch correction | 2026-02-03 | Session.ts, HeaderBar.ts, AudioAPI.ts, test-helper.ts, Session.test.ts, HeaderBar.test.ts, OpenRVAPI.test.ts |
| 3.7 Sub-frame interpolation | 2026-02-03 | FrameInterpolator.ts, Session.ts, Viewer.ts, FrameInterpolator.test.ts, Session.test.ts |

---

*Last Updated: 2026-02-03*
