# OpenRV Web - Feature Parity TODO

This document tracks features from [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV) that need to be implemented for feature parity. Features are categorized by priority and feasibility for web implementation.

---

## Completed Features ✅

### 1. Channel Select / Channel Map ✅

**Status:** COMPLETED

**Implementation:**
- Channel select buttons in View tab (RGB / R / G / B / A / Luminance)
- Real-time channel isolation via canvas rendering
- Keyboard shortcuts: Shift+G (Green), Shift+B (Blue), Shift+A (Alpha), Shift+L (Luminance), Shift+N (Normal/RGB)
- Rec.709 luminance calculation

**Files:**
- `src/ui/components/ChannelSelect.ts`
- `src/ui/components/Viewer.ts`
- `src/App.ts`

---

### 2. Histogram Display ✅

**Status:** COMPLETED

**Implementation:**
- Real-time histogram computed from canvas ImageData
- RGB mode (overlaid), Luminance mode, Separate channels mode
- Logarithmic scale toggle
- Draggable floating panel with mode cycling and close button
- Keyboard shortcut: `h` to toggle

**Files:**
- `src/ui/components/Histogram.ts`
- `src/App.ts`

---

### 3. Waveform Monitor ✅

**Status:** COMPLETED

**Implementation:**
- Professional waveform scope plotting pixel values vs horizontal position
- Luma, RGB, and Parade modes
- Reference lines at 0% and 100%
- Draggable floating panel with mode cycling
- Keyboard shortcut: `w` to toggle

**Files:**
- `src/ui/components/Waveform.ts`
- `src/App.ts`

---

### 4. Vectorscope ✅

**Status:** COMPLETED

**Implementation:**
- Circular display showing color distribution (hue = angle, saturation = radius)
- Rec.709 color targets (R, G, B, Cy, Mg, Yl)
- Skin tone indicator line
- Adjustable zoom levels (1x, 2x, 4x)
- Draggable floating panel
- Keyboard shortcut: `y` to toggle

**Files:**
- `src/ui/components/Vectorscope.ts`
- `src/App.ts`

---

### 5. A/B Source Compare ✅

**Status:** COMPLETED

**Implementation:**
- A/B buttons in View tab with visual state indication
- Auto-assignment of source B when loading second file
- Keyboard shortcut: backtick (`) or tilde (~) to toggle A/B
- A/B indicator badge on viewer showing current source
- Sync playhead option between sources

**Files:**
- `src/core/session/Session.ts` - A/B source management
- `src/ui/components/Viewer.ts` - A/B indicator
- `src/App.ts` - A/B buttons and keyboard shortcuts

---

### 6. Color Curves ✅

**Status:** COMPLETED

**OpenRV Reference:** `src/lib/ip/IPBaseNodes/ColorCurveIPNode.cpp`

**Description:**
Bezier curve-based color correction for RGB channels. Industry standard tool for precise tonal adjustments.

**Implementation:**
- Canvas-based interactive curve editor with draggable control points
- Support for Master (RGB), Red, Green, Blue channels
- Catmull-Rom spline interpolation for smooth curves
- 8 preset curves (Linear, S-Curve Mild/Strong, Lift Shadows, Crush Blacks, Lower Highlights, Film Look, Cross Process)
- Real-time preview with lookup table (LUT) generation
- Import/export curve presets as JSON
- Keyboard shortcut: `U` to toggle curves panel

**Files:**
- `src/color/ColorCurves.ts` - Curve evaluation and LUT generation
- `src/ui/components/CurveEditor.ts` - Interactive canvas-based curve UI
- `src/ui/components/CurvesControl.ts` - Panel wrapper with presets
- `src/ui/components/Viewer.ts` - Curves applied in render pipeline
- `src/App.ts` - Integration and keyboard shortcuts

---

### 7. Stereo Viewing Modes ✅

**Status:** COMPLETED

**OpenRV Reference:** `src/plugins/rv-packages/stereo_autoload`, `stereo_disassembly`, `StereoIPNode.cpp`

**Description:**
Support for stereoscopic 3D content viewing with multiple display modes.

**Implementation:**
- Side-by-side mode (left/right eyes horizontally adjacent)
- Over/under mode (left eye top, right eye bottom)
- Mirror mode (side-by-side with right eye horizontally flipped)
- Anaglyph mode (red channel from left eye, cyan from right eye)
- Luminance anaglyph mode (grayscale anaglyph for reduced color fringing)
- Checkerboard mode (alternating pixels for DLP projectors with shutter glasses)
- Scanline mode (alternating lines for line-blanking displays)
- Eye swap control (swap left/right eyes)
- Convergence offset adjustment (-20 to +20 range)
- Keyboard shortcut: `Shift+3` to cycle modes
- Dropdown UI with all modes in View tab
- Proper handling of odd dimensions (no black stripes)

**Files:**
- `src/stereo/StereoRenderer.ts` - Core stereo rendering logic with all modes
- `src/stereo/StereoRenderer.test.ts` - Unit tests (17 tests)
- `src/ui/components/StereoControl.ts` - UI component with dropdown, eye swap, offset slider
- `src/ui/components/Viewer.ts` - Integrated into render pipeline
- `src/App.ts` - Control wiring and keyboard shortcuts
- `src/test-helper.ts` - Test state exposure
- `e2e/fixtures.ts` - E2E test fixtures
- `e2e/stereo-viewing.spec.ts` - E2E tests (23 tests)

---

## High Priority - Core Features

## Medium Priority - Professional Features

### 8. Highlight / Shadow Adjustment ✅

**Status:** COMPLETED

**Implementation:**
- Highlight/shadow recovery sliders in Color tab
- Whites/blacks clipping controls
- Soft knee rolloff for smooth transitions
- GPU-accelerated via EffectProcessor

**Files:**
- `src/utils/EffectProcessor.ts` - Highlight/shadow algorithms
- `src/ui/components/ColorControls.ts` - Sliders

---

### 9. Vibrance Control ✅

**Status:** COMPLETED

**Implementation:**
- Vibrance slider (-100 to +100)
- Skin tone protection (hue 20-50° range)
- Inversely proportional saturation boost

**Files:**
- `src/utils/EffectProcessor.ts` - Vibrance algorithm

---

### 10. Clarity / Local Contrast ✅

**Status:** COMPLETED

**Implementation:**
- Clarity slider (-100 to +100)
- High-pass filter blended with midtone mask
- Adjustable effect scale

**Files:**
- `src/utils/EffectProcessor.ts` - Clarity filter

---

### 11. Custom Mattes / Safe Areas ✅

**Status:** COMPLETED

**Implementation:**
- Title safe (80%) and action safe (90%) overlays
- Aspect ratio overlays (16:9, 2.39:1, 4:3, 1:1)
- Center crosshair and rule of thirds grid
- Keyboard shortcut: `;` to toggle
- 46 unit tests in SafeAreasOverlay.test.ts

**Files:**
- `src/ui/components/SafeAreasOverlay.ts`
- `src/ui/components/SafeAreasControl.ts`

---

### 12. Missing Frame Indicator ✅

**Status:** COMPLETED

**Implementation:**
- Gap detection in frame sequences
- Visual overlay showing "MISSING FRAME" warning
- Timeline indicators for missing frames
- 16 unit tests in MissingFrameOverlay.test.ts

**Files:**
- `src/ui/components/MissingFrameOverlay.ts`
- `src/utils/SequenceLoader.ts` - Detect missing frames

---

### 13. Timeline Markers with Notes ✅

**Status:** COMPLETED

**Implementation:**
- Markers with text notes and color coding
- Duration markers spanning frame ranges
- Marker management via API (add, remove, getAll, clear)
- GTO round-trip preserves marker data
- Markers panel with keyboard shortcut Shift+Alt+M

**Files:**
- `src/core/session/Session.ts` - Marker data structure
- `src/ui/components/Timeline.ts` - Render colored markers
- `src/api/MarkersAPI.ts` - Public API

---

### 14. Frame Info Overlay (Data Display) ✅

**Status:** COMPLETED

**Implementation:**
- Floating info panel with filename, resolution, frame, FPS
- Cursor color readout (RGB values under mouse)
- Keyboard shortcut: Shift+Alt+I

**Files:**
- `src/ui/components/InfoPanel.ts`

---

### 15. Pixel Probe / Color Picker ✅

**Status:** COMPLETED

**Implementation:**
- Click to sample pixel color (RGB, HSL, IRE)
- Area averaging (1x1, 3x3, 5x5, 9x9)
- Source vs rendered toggle
- Lock functionality for persistent samples
- 45+ unit tests in PixelProbe.test.ts

**Files:**
- `src/ui/components/PixelProbe.ts`

---

## Low Priority - Advanced Features

### 16. OTIO (OpenTimelineIO) Import

**OpenRV Reference:** `src/plugins/rv-packages/otio_reader`

**Description:**
Import OpenTimelineIO files for timeline interchange with editorial systems.

**Requirements:**
- [ ] Parse OTIO JSON format
- [ ] Create sequence from OTIO clips
- [ ] Support transitions (dissolves)
- [ ] Support markers
- [ ] Handle missing media gracefully

**Dependencies:**
- Consider using [opentimelineio-js](https://github.com/OpenTimelineIO/OpenTimelineIO) if available, or implement subset

**Files to create:**
- `src/formats/OTIOLoader.ts`

---

### 17. EXR Support via WebAssembly ✅

**Status:** COMPLETED

**Implementation:**
- WebAssembly EXR decoder with multi-layer support
- Half-float and full-float data
- HDR tone mapping (Reinhard, Filmic, ACES)
- Layer/channel selection UI (ChannelSelect with AOV selection)
- Channel remapping (custom channel-to-RGBA mapping)

**Files:**
- `src/formats/EXRDecoder.ts`
- `src/ui/components/ChannelSelect.ts`

---

### 18. Grayscale Mode ✅

**Status:** COMPLETED

**Implementation:**
- Luminance channel in ChannelSelect (Shift+L / Shift+Y)
- Rec.709 luminance weights

**Files:**
- `src/ui/components/ChannelSelect.ts`

---

### 19. Linear/Log Conversion ✅

**Status:** COMPLETED

**Implementation:**
- Camera-specific log curve presets
- Cineon Film Log (10-bit), ARRI LogC3/LogC4, Sony S-Log3, RED Log3G10
- GLSL shader generation for GPU processing
- 27 unit tests in LogCurves.test.ts

**Files:**
- `src/color/LogCurves.ts`

---

### 20. Primary Color Correction (Lift/Gamma/Gain) ✅

**Status:** COMPLETED

**Implementation:**
- Three circular wheel controls (120px) for Lift, Gamma, Gain
- Master wheel for overall adjustments
- Numeric input fields, reset buttons
- Link/unlink for gang adjustments
- Color preview ring, undo/redo support
- 46 unit tests in ColorWheels.test.ts

**Files:**
- `src/ui/components/ColorWheels.ts`

---

### 21. Noise Reduction ✅

**Status:** COMPLETED

**Implementation:**
- Edge-preserving bilateral filter
- GPU-accelerated with WebGL2 (WebGLNoiseReduction)
- CPU fallback (NoiseReduction)
- Adjustable strength and radius (1-5)
- 18 unit tests

**Files:**
- `src/filters/NoiseReduction.ts`
- `src/filters/WebGLNoiseReduction.ts`

---

### 22. Overlay/Watermark ✅

**Status:** COMPLETED

**Implementation:**
- Watermark overlay with 9 preset positions (3x3 grid)
- Adjustable scale (10-200%), opacity, and margin
- Supports PNG, JPEG, WebP, and SVG
- Custom positioning

**Files:**
- `src/ui/components/WatermarkOverlay.ts`
- `src/ui/components/WatermarkControl.ts`

---

### 23. Compare Mode (Difference/Blend) ✅

**Status:** COMPLETED

**Implementation:**
- Difference matte with gain and heatmap modes
- Onion skin mode with adjustable opacity
- Flicker mode (1-30 Hz configurable rate)
- Blend mode with adjustable ratio
- Split screen A/B comparison
- CompareControl dropdown with 53 tests

**Files:**
- `src/ui/components/CompareControl.ts`
- `src/ui/components/ViewerSplitScreen.ts`

---

### 24. Flipbook Cache ✅

**Status:** COMPLETED

**Implementation:**
- Frame cache with visual indicator on timeline
- Cache ahead of playhead
- Clear cache button
- Memory usage display
- Smart cache management with LRU eviction
- PrerenderBufferManager for smooth playback

**Files:**
- `src/utils/PrerenderBufferManager.ts`
- `src/ui/components/Timeline.ts` - Cache status display

---

## Not Feasible for Web (Reference Only)

These features require native system access and cannot be implemented in a web browser:

| Feature | OpenRV Reference | Reason |
|---------|------------------|--------|
| Hardware SDI Output | Blackmagic/AJA integration | Requires native drivers |
| ~~GPU LUT acceleration~~ | ~~CUDA/Metal compute~~ | ✅ Done via WebGL2 3D textures |
| ~~DPX/Cineon native decode~~ | ~~Native codec~~ | ✅ Done via JS decoder |
| RAW camera formats | LibRaw, etc. | No browser decoder |
| Maya/Nuke plugin | Application plugins | Desktop integration |
| Multi-GPU rendering | Native GPU access | Browser sandbox |
| ~~System color management~~ | ~~OS color profiles~~ | ✅ Partial via OCIO integration |
| ~~Network sync playback~~ | ~~Low-latency networking~~ | ✅ Done via WebSocket infrastructure |

---

## Implementation Notes

### Architecture Guidelines

1. **Keep existing patterns** - Follow the established component structure in `src/ui/components/`
2. **Use TypeScript strictly** - Maintain type safety throughout
3. **WebGL for performance** - Use `WebGLLUT.ts` pattern for GPU-accelerated processing
4. **Canvas fallback** - Always provide Canvas2D fallback for compatibility
5. **Lazy loading** - Load analysis tools (histogram, scopes) only when needed

### File Organization

```
src/
├── ui/components/      # 146 component files - scopes, controls, overlays
│   ├── Histogram.ts, Waveform.ts, Vectorscope.ts  # ✅ Scopes
│   ├── ChannelSelect.ts, CurveEditor.ts           # ✅ Color tools
│   ├── CompareControl.ts, ViewerSplitScreen.ts     # ✅ Comparison
│   ├── SafeAreasOverlay.ts, PixelProbe.ts          # ✅ Analysis
│   ├── ColorWheels.ts, HSLQualifierControl.ts      # ✅ Color grading
│   ├── SnapshotPanel.ts, PlaylistPanel.ts          # ✅ Session management
│   └── shared/         # Reusable: Button, Modal, Panel, DropdownMenu, Icons
├── color/              # Color processing
│   ├── ColorCurves.ts, CDL.ts, LogCurves.ts        # ✅ Color tools
│   ├── LUTLoader.ts, WebGLLUT.ts                   # ✅ LUT pipeline
│   └── ocio/           # ✅ OCIO color management
├── stereo/StereoRenderer.ts    # ✅ 8 stereo modes
├── formats/            # Format decoders
│   ├── EXRDecoder.ts   # ✅ WebAssembly EXR
│   ├── DPXDecoder.ts   # ✅ DPX support
│   └── index.ts        # Decoder registry
├── filters/            # Image filters
│   ├── NoiseReduction.ts       # ✅ CPU bilateral filter
│   └── WebGLNoiseReduction.ts  # ✅ GPU bilateral filter
├── api/                # ✅ Public scripting API (window.openrv)
├── network/            # ✅ WebSocket sync infrastructure
├── audio/              # ✅ Audio playback and waveform
└── workers/            # ✅ Web Workers for background processing
```

### Testing Checklist

For each feature, ensure:
- [ ] Works with images (PNG, JPEG, WebP)
- [ ] Works with video (MP4, WebM)
- [ ] Works with image sequences
- [ ] Keyboard shortcuts functional
- [ ] State saved in session (.orvproject)
- [ ] No memory leaks
- [ ] Mobile/touch support where applicable

---

## References

- [OpenRV GitHub Repository](https://github.com/AcademySoftwareFoundation/OpenRV)
- [OpenRV Documentation](https://aswf-openrv.readthedocs.io/)
- [OpenRV IPBaseNodes](https://github.com/AcademySoftwareFoundation/OpenRV/tree/main/src/lib/ip/IPBaseNodes)
- [OpenRV Plugins](https://github.com/AcademySoftwareFoundation/OpenRV/tree/main/src/plugins/rv-packages)
- [ASWF OpenRV Project Page](https://aswf.io/projects/openrv/)
