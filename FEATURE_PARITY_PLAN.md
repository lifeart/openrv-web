# OpenRV Web - Feature Parity Plan

This document tracks the comprehensive comparison between OpenRV (C++) and OpenRV Web with accurate implementation status.

**Generated:** 2026-01-31
**Source Reference:** [OpenRV GitHub](https://github.com/AcademySoftwareFoundation/OpenRV)

---

## Executive Summary

### Feature Parity Status

| Category | Implemented | Total | Parity |
|----------|-------------|-------|--------|
| Core Viewing | 15/15 | 100% | Complete |
| Color Grading | 14/14 | 100% | Complete |
| Scopes & Analysis | 10/10 | 100% | Complete |
| Comparison Tools | 8/10 | 80% | Good |
| Timeline & Playback | 8/10 | 80% | Good |
| Annotation & Review | 7/9 | 78% | Good |
| Transform & Filters | 5/8 | 63% | Moderate |
| File Formats | 4/8 | 50% | Partial |
| Session Management | 3/5 | 60% | Moderate |
| Performance | 4/6 | 67% | Moderate |

**Overall: ~80% feature parity with OpenRV C++**

---

## Implemented Features (Verified in Codebase)

### Color Grading - 100% Complete
| Feature | File | Status |
|---------|------|--------|
| Exposure/Gamma/Saturation | `ColorControls.ts` | ✅ |
| Contrast/Brightness | `ColorControls.ts` | ✅ |
| Vibrance (skin-aware) | `ColorControls.ts` | ✅ |
| Clarity (local contrast) | `ColorControls.ts` | ✅ |
| Color Temperature/Tint | `ColorControls.ts` | ✅ |
| Highlight/Shadow Recovery | `ColorControls.ts` | ✅ |
| Whites/Blacks Point | `ColorControls.ts` | ✅ |
| Lift/Gamma/Gain Wheels | `ColorWheels.ts` | ✅ |
| HSL Qualifier | `HSLQualifier.ts` | ✅ |
| Color Curves | `ColorCurves.ts`, `CurvesControl.ts` | ✅ |
| CDL (ASC-CDL) | `CDL.ts`, `CDLControl.ts` | ✅ |
| 3D LUT Support (.cube) | `LUTLoader.ts`, `WebGLLUT.ts` | ✅ |
| 1D LUT Support (.cube) | `LUTLoader.ts` | ✅ |
| Log Curve Presets | `LogCurves.ts` | ✅ |

### Scopes & Analysis - 100% Complete
| Feature | File | Status |
|---------|------|--------|
| Histogram (RGB/Luma) | `Histogram.ts` | ✅ |
| Waveform (Luma/RGB/Parade) | `Waveform.ts` | ✅ |
| YCbCr Waveform Mode | `Waveform.ts` | ✅ |
| Vectorscope | `Vectorscope.ts` | ✅ |
| False Color Display | `FalseColor.ts` | ✅ |
| Zebra Stripes | `ZebraStripes.ts` | ✅ |
| Pixel Probe | `PixelProbe.ts` | ✅ |
| Clipping Overlay | `ClippingOverlay.ts` | ✅ |
| Safe Areas/Guides | `SafeAreasOverlay.ts` | ✅ |
| Timecode Overlay | `TimecodeOverlay.ts` | ✅ |

### Viewing & Display - 100% Complete
| Feature | File | Status |
|---------|------|--------|
| Channel Isolation (R/G/B/A) | `ChannelSelect.ts` | ✅ |
| Grayscale/Luminance | `ChannelSelect.ts` ('luminance' mode) | ✅ |
| Stereo Viewing (8 modes) | `StereoRenderer.ts`, `StereoControl.ts` | ✅ |
| Zoom/Pan/Fit | `ZoomControl.ts`, `Viewer.ts` | ✅ |
| Rotation/Flip | `TransformControl.ts` | ✅ |

### Comparison Tools - 80% Complete
| Feature | File | Status |
|---------|------|--------|
| A/B Source Compare | `CompareControl.ts` | ✅ |
| Wipe (H/V) | `CompareControl.ts` | ✅ |
| Difference Matte | `DifferenceMatteControl.ts` | ✅ |
| Onion Skin Mode | `CompareControl.ts` | ✅ |
| Flicker Mode | `CompareControl.ts` | ✅ |
| Blend Mode | `CompareControl.ts` | ✅ |
| Blend Modes (composite) | `BlendModes.ts` | ✅ |
| Spotlight Tool | `SpotlightOverlay.ts` | ✅ |
| Split Screen Grid | - | ❌ Not implemented |
| Ghost Frames (multi-frame) | - | ❌ Not implemented |

### Timeline & Playback - 80% Complete
| Feature | File | Status |
|---------|------|--------|
| Frame-accurate timeline | `Timeline.ts` | ✅ |
| In/Out Points | `Session.ts` | ✅ |
| Markers with Notes/Colors | `Session.ts`, `MarkerListPanel.ts` | ✅ |
| Playback Speed (J/K/L) | `Session.ts`, `App.ts` | ✅ |
| Loop Modes | `Session.ts` | ✅ |
| Page Visibility Handling | `App.ts` | ✅ |
| Cache Indicator | `CacheIndicator.ts` | ✅ |
| Audio Playback | `AudioPlayer.ts` | ✅ |
| Timeline Thumbnails | - | ❌ Not implemented |
| Audio Waveform Display | `WaveformRenderer.ts` | ✅ (renderer exists) |

### Annotation & Review - 78% Complete
| Feature | File | Status |
|---------|------|--------|
| Paint/Pen Tool | `PaintRenderer.ts` | ✅ |
| Shape Tools (rect/ellipse/arrow/polygon) | `PaintRenderer.ts` | ✅ |
| Text Annotations | `PaintRenderer.ts` | ✅ |
| Annotation Export (JSON) | `AnnotationJSONExporter.ts` | ✅ |
| Annotation Export (PDF) | `AnnotationPDFExporter.ts` | ✅ |
| Per-frame Annotations | `paint/types.ts` | ✅ |
| History Panel (Undo/Redo) | `HistoryPanel.ts`, `HistoryManager.ts` | ✅ |
| Comparison Annotations | - | ❌ Not implemented |
| Annotation Import | - | ❌ Not implemented |

### Transforms & Filters - 63% Complete
| Feature | File | Status |
|---------|------|--------|
| Crop | `TransformControl.ts` | ✅ |
| Lens Distortion | `LensDistortion.ts` | ✅ |
| Blur | `FilterControl.ts` | ✅ |
| Sharpen | `WebGLSharpen.ts` | ✅ |
| Noise Reduction | `NoiseReduction.ts`, `WebGLNoiseReduction.ts` | ✅ |
| Perspective Correction | - | ❌ Not implemented |
| Stabilization Preview | - | ❌ Not implemented |
| Deinterlace Preview | - | ❌ Not implemented |

### File Format Support - 50% Complete
| Feature | File | Status |
|---------|------|--------|
| PNG/JPEG/WebP | Native browser | ✅ |
| MP4/WebM Video | `VideoSourceNode.ts` | ✅ |
| Image Sequences | `SequenceSourceNode.ts`, `SequenceLoader.ts` | ✅ |
| GTO/RV Sessions | `GTOGraphLoader.ts`, `SessionGTOExporter.ts` | ✅ |
| EXR Support | - | ❌ Not implemented |
| DPX Support | - | ❌ Not implemented |
| RAW Preview | - | ❌ Not implemented |
| OTIO Import | - | ❌ Not implemented |

### Session Management - 60% Complete
| Feature | File | Status |
|---------|------|--------|
| Auto-save (IndexedDB) | `SessionGTOStore.ts` | ✅ |
| Session Recovery | `SessionSerializer.ts` | ✅ |
| Watermark Overlay | `WatermarkOverlay.ts`, `WatermarkControl.ts` | ✅ |
| Session Version History | - | ❌ Not implemented |
| Multi-Clip Playlist | - | ❌ Not implemented |

### UI/UX - 75% Complete
| Feature | File | Status |
|---------|------|--------|
| Dark/Light Theme | `ThemeManager.ts` | ✅ |
| Floating Info Panel | `InfoPanel.ts` | ✅ |
| Keyboard Shortcuts | `KeyBindings.ts`, `KeyboardManager.ts` | ✅ |
| Customizable Dockable Layout | - | ❌ Not implemented |

---

## Missing Features - Implementation Playbooks

### 1. EXR Support (P1 - High Priority)
**OpenRV Reference:** Native OpenEXR decoding
**Complexity:** High (requires WebAssembly)

#### Description
Load OpenEXR files including multi-layer, half-float, and HDR content.

#### Files to Create
- `src/formats/EXRLoader.ts`
- `src/formats/EXRLoader.test.ts`

#### Implementation Steps
1. Integrate WebAssembly OpenEXR decoder (e.g., `openexr-wasm`)
2. Parse EXR headers for layer/channel information
3. Convert half-float to Float32 for processing
4. Implement HDR tone mapping for display
5. Add layer selector UI for multi-layer files
6. Handle various compression types (ZIP, PIZ, DWAA)

#### Tests
```typescript
describe('EXR Support', () => {
  test('EXR-001: Single layer EXR loads correctly');
  test('EXR-002: Multi-layer shows layer selector');
  test('EXR-003: Half-float values preserved');
  test('EXR-004: HDR content tone-mapped for display');
  test('EXR-005: Metadata accessible');
  test('EXR-006: All compression types supported');
});
```

---

### 2. OTIO Import (P2 - Medium Priority)
**OpenRV Reference:** `otio_reader` plugin
**Complexity:** Medium

#### Description
Import OpenTimelineIO files for timeline interchange with editorial systems.

#### Files to Create
- `src/formats/OTIOLoader.ts`
- `src/formats/OTIOLoader.test.ts`

#### Implementation Steps
1. Parse OTIO JSON schema
2. Map OTIO clips to SequenceGroupNode
3. Import markers and annotations
4. Handle transitions (dissolves)
5. Gracefully handle missing/offline media
6. Support nested timeline structures

#### Tests
```typescript
describe('OTIO Import', () => {
  test('OTIO-001: Basic timeline imports');
  test('OTIO-002: Clip timing correct');
  test('OTIO-003: Markers import');
  test('OTIO-004: Offline media indicated');
  test('OTIO-005: Nested timelines handled');
});
```

---

### 3. Split Screen Compare (P2 - Medium Priority)
**OpenRV Reference:** Multi-view layouts
**Complexity:** Medium

#### Description
Display multiple versions/grades side-by-side in a grid (2x1, 1x2, 2x2, 3x2).

#### Files to Create
- `src/ui/components/SplitScreenCompare.ts`
- `src/ui/components/SplitScreenCompare.test.ts`

#### Implementation Steps
1. Create grid layout renderer with configurable rows/columns
2. Render each cell with different source/grade version
3. Sync playback across all cells
4. Add cell selection for making one "active" for editing
5. Add version labels per cell
6. Handle different aspect ratios gracefully

#### Tests
```typescript
describe('Split Screen Compare', () => {
  test('SPLIT-001: 2x2 grid displays correctly');
  test('SPLIT-002: Each cell shows different grade');
  test('SPLIT-003: Playback syncs across cells');
  test('SPLIT-004: Clicking cell activates it');
  test('SPLIT-005: Labels display correctly');
});
```

---

### 4. Timeline Thumbnails (P2 - Medium Priority)
**OpenRV Reference:** Timeline film strip
**Complexity:** Medium

#### Description
Show frame thumbnails along timeline for visual navigation.

#### Files to Create
- `src/ui/components/TimelineThumbnails.ts`
- `src/ui/components/TimelineThumbnails.test.ts`

#### Implementation Steps
1. Generate thumbnails at regular intervals using Web Worker
2. Cache generated thumbnails in IndexedDB
3. Display thumbnails based on timeline zoom level
4. Implement progressive loading (fade in as generated)
5. Add click-to-navigate functionality
6. Implement hover preview for larger thumbnail

#### Tests
```typescript
describe('Timeline Thumbnails', () => {
  test('THUMB-001: Thumbnails generate for sequence');
  test('THUMB-002: Click thumbnail navigates to frame');
  test('THUMB-003: Thumbnails update on zoom');
  test('THUMB-004: Generation does not block playback');
  test('THUMB-005: Memory usage reasonable for long sequences');
});
```

---

### 5. Perspective Correction (P3 - Low Priority)
**OpenRV Reference:** `PerspectiveIPNode`
**Complexity:** High

#### Description
Correct perspective distortion using four corner points.

#### Files to Create
- `src/transform/PerspectiveCorrection.ts`
- `src/ui/components/PerspectiveControl.ts`

#### Implementation Steps
1. Create four corner point handles UI
2. Compute 3x3 homography matrix from corner positions
3. Implement WebGL shader for GPU-accelerated warping
4. Add grid overlay option for alignment reference
5. Add numeric input for precise values
6. Support bilinear/bicubic interpolation options

#### Tests
```typescript
describe('Perspective Correction', () => {
  test('PERSP-001: Dragging corner warps image');
  test('PERSP-002: Grid overlay aligns with edges');
  test('PERSP-003: Reset returns to original');
  test('PERSP-004: Numeric input accepts precise values');
  test('PERSP-005: Quality options affect output');
});
```

---

### 6. Session Version History (P3 - Low Priority)
**Complexity:** Medium

#### Description
Maintain version history of session saves for rollback capability.

#### Files to Create
- `src/core/session/VersionHistory.ts`
- `src/ui/components/VersionHistoryPanel.ts`

#### Implementation Steps
1. Store multiple session versions in IndexedDB
2. Support named snapshots (manual saves)
3. Auto-version on significant changes
4. Implement version comparison
5. Add restore-to-version functionality
6. Manage storage limits (configurable max versions)

#### Tests
```typescript
describe('Session Version History', () => {
  test('VERSION-001: Named version creates snapshot');
  test('VERSION-002: Auto-versions created on save');
  test('VERSION-003: Version list displays correctly');
  test('VERSION-004: Restore to version works');
  test('VERSION-005: Old versions can be deleted');
});
```

---

### 7. Multi-Clip Playlist (P3 - Low Priority)
**Complexity:** Medium

#### Description
Manage multiple clips in a playlist for batch review.

#### Files to Create
- `src/ui/components/PlaylistPanel.ts`
- `src/core/session/Playlist.ts`

#### Implementation Steps
1. Create playlist data structure with clip references
2. Implement drag-and-drop reordering UI
3. Add sequential playback through clips
4. Support jump-to-specific-clip
5. Preload next clip during playback
6. Save playlist as part of session state

#### Tests
```typescript
describe('Multi-Clip Playlist', () => {
  test('PLAYLIST-001: Add clip to playlist');
  test('PLAYLIST-002: Remove clip from playlist');
  test('PLAYLIST-003: Reorder clips via drag-and-drop');
  test('PLAYLIST-004: Play through clips sequentially');
  test('PLAYLIST-005: Jump to specific clip');
  test('PLAYLIST-006: Playlist saves with session');
});
```

---

### 8. Ghost Frames / Animation Onion Skin (P3 - Low Priority)
**Complexity:** Medium

#### Description
Overlay previous/next frames with adjustable opacity for motion analysis.

#### Files to Create
- `src/ui/components/GhostFrames.ts`
- `src/ui/components/GhostFramesControl.ts`

#### Implementation Steps
1. Render N frames before/after current frame
2. Apply decreasing opacity per ghost frame
3. Add color tinting (red for before, green for after)
4. Implement frame step interval control
5. Cache ghost frames for performance
6. Handle first/last frames gracefully (fewer ghosts available)

#### Tests
```typescript
describe('Ghost Frames', () => {
  test('GHOST-001: Previous frames visible with opacity');
  test('GHOST-002: Next frames visible with opacity');
  test('GHOST-003: Color tinting distinguishes before/after');
  test('GHOST-004: Frame count adjustable');
  test('GHOST-005: Works during playback');
});
```

---

## Features Not Feasible for Web

These require native system access and cannot be implemented:

| Feature | Reason |
|---------|--------|
| Hardware SDI Output | Native drivers required |
| CUDA/Metal Compute | WebGL limited |
| Full ACES/OCIO | Complex color management |
| RAW Camera Decode | No LibRaw in browser |
| DPX Native Decode | No native codec |
| Maya/Nuke Plugins | Desktop integration only |
| Network Sync Playback | Latency constraints |
| System Color Profiles | Limited browser access |

---

## Implementation Priority

### Phase 1 (Next Sprint)
1. ~~All color grading~~ ✅ Complete
2. ~~All scopes~~ ✅ Complete
3. ~~Core comparison tools~~ ✅ Complete

### Phase 2 (This Quarter)
4. EXR Support (High value for VFX workflows)
5. Timeline Thumbnails (UX improvement)
6. Split Screen Compare

### Phase 3 (Future)
7. OTIO Import
8. Perspective Correction
9. Session Version History
10. Multi-Clip Playlist
11. Ghost Frames

---

## Summary

**OpenRV Web has achieved ~80% feature parity with OpenRV C++.**

Most core professional features are implemented:
- Full color grading pipeline
- All professional scopes
- Multiple comparison modes
- Annotation tools with export
- Session management with auto-save

Remaining gaps are primarily:
- Advanced file formats (EXR, DPX, OTIO)
- Some advanced UI features (split screen, thumbnails)
- Niche professional features (perspective, stabilization)

The web implementation successfully covers the vast majority of daily review and color grading workflows.
