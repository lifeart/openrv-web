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

## High Priority - Core Features

### 6. Color Curves

**OpenRV Reference:** `src/lib/ip/IPBaseNodes/ColorCurveIPNode.cpp`

**Description:**
Bezier curve-based color correction for RGB channels. Industry standard tool for precise tonal adjustments.

**Requirements:**
- [ ] Create curve editor UI component with draggable control points
- [ ] Support Master (RGB), Red, Green, Blue curves
- [ ] Cubic bezier interpolation between points
- [ ] Preset curves (S-curve, lift shadows, etc.)
- [ ] Real-time preview
- [ ] Import/export curve presets

**Files to create:**
- `src/color/ColorCurves.ts` - Curve evaluation logic
- `src/ui/components/CurveEditor.ts` - Interactive curve UI
- `src/ui/components/CurvesControl.ts` - Panel wrapper

**Files to modify:**
- `src/ui/components/Viewer.ts` - Apply curves in render pipeline

---

### 7. Stereo Viewing Modes

**OpenRV Reference:** `src/plugins/rv-packages/stereo_autoload`, `stereo_disassembly`
**Nodes:** `StereoIPNode.cpp`

**Description:**
Support for stereoscopic 3D content viewing with multiple display modes.

**Requirements:**
- [ ] Side-by-side mode (left/right)
- [ ] Over/under mode (top/bottom)
- [ ] Anaglyph mode (red/cyan glasses)
- [ ] Checkerboard mode
- [ ] Mirror mode (flip one eye)
- [ ] Eye swap option
- [ ] Stereo convergence adjustment

**Files to create:**
- `src/stereo/StereoRenderer.ts`
- `src/ui/components/StereoControl.ts`

**Files to modify:**
- `src/ui/components/Viewer.ts` - Add stereo rendering modes

---

## Medium Priority - Professional Features

### 8. Highlight / Shadow Adjustment

**OpenRV Reference:** `src/lib/ip/IPBaseNodes/ColorHighlightIPNode.cpp`, `ColorShadowIPNode.cpp`

**Description:**
Separate controls for adjusting highlight and shadow regions independently.

**Requirements:**
- [ ] Highlight lift/gain controls
- [ ] Shadow lift/gain controls
- [ ] Adjustable threshold between shadows/midtones/highlights
- [ ] Soft rolloff between regions

**Files to modify:**
- `src/ui/components/ColorControls.ts` - Add highlight/shadow sliders
- `src/ui/components/Viewer.ts` - Implement in shader/canvas

---

### 9. Vibrance Control

**OpenRV Reference:** `src/lib/ip/IPBaseNodes/ColorVibranceIPNode.cpp`

**Description:**
Intelligent saturation that protects skin tones and already-saturated colors.

**Requirements:**
- [ ] Vibrance slider (-100 to +100)
- [ ] Protect skin tones option
- [ ] Different algorithm than basic saturation

**Files to modify:**
- `src/ui/components/ColorControls.ts` - Add vibrance slider
- `src/ui/components/Viewer.ts` - Implement vibrance algorithm

---

### 10. Clarity / Local Contrast

**OpenRV Reference:** `src/lib/ip/IPBaseNodes/ClarityIPNode.cpp`

**Description:**
Midtone contrast enhancement that adds punch without affecting highlights/shadows.

**Requirements:**
- [ ] Clarity slider (-100 to +100)
- [ ] Implement as unsharp mask on midtones only
- [ ] Adjustable radius

**Files to modify:**
- `src/ui/components/FilterControl.ts` - Add clarity slider
- `src/ui/components/Viewer.ts` - Implement clarity filter

---

### 11. Custom Mattes / Safe Areas

**OpenRV Reference:** `src/plugins/rv-packages/custom_mattes`

**Description:**
Overlay guides showing safe areas, aspect ratio masks, and custom frame guides.

**Requirements:**
- [ ] Title safe (90%) and action safe (93%) overlays
- [ ] Aspect ratio mattes: 16:9, 2.39:1, 1.85:1, 4:3, 1:1
- [ ] Custom aspect ratio input
- [ ] Adjustable matte opacity and color
- [ ] Center crosshair option
- [ ] Grid overlay option (rule of thirds, etc.)

**Files to create:**
- `src/ui/components/MatteOverlay.ts`
- `src/ui/components/MatteControl.ts`

**Files to modify:**
- `src/ui/components/Viewer.ts` - Render matte overlays

---

### 12. Missing Frame Indicator

**OpenRV Reference:** `src/plugins/rv-packages/missing_frame_bling`, `collapse_missing_frames`

**Description:**
Visual indication when frames are missing from a sequence, with options to skip or hold on missing frames.

**Requirements:**
- [ ] Detect gaps in frame sequences
- [ ] Visual indicator on timeline for missing frames
- [ ] Viewer overlay showing "MISSING FRAME" warning
- [ ] Option: hold previous frame vs show placeholder
- [ ] Option: skip missing frames during playback
- [ ] List missing frames in info panel

**Files to modify:**
- `src/ui/components/Timeline.ts` - Show missing frame markers
- `src/ui/components/Viewer.ts` - Show missing frame overlay
- `src/core/session/Session.ts` - Track missing frames
- `src/utils/SequenceLoader.ts` - Detect missing frames

---

### 13. Timeline Markers with Notes

**OpenRV Reference:** Session marker system in `src/lib/app/RvSession/`

**Description:**
Enhanced markers that support text notes, colors, and categories for review workflows.

**Requirements:**
- [ ] Add note text to markers
- [ ] Color-coded marker categories (note, issue, approved, etc.)
- [ ] Marker list panel showing all markers
- [ ] Jump to marker by clicking in list
- [ ] Export markers to CSV/JSON
- [ ] Import markers from CSV/JSON

**Files to create:**
- `src/ui/components/MarkerPanel.ts`

**Files to modify:**
- `src/core/session/Session.ts` - Extend marker data structure
- `src/ui/components/Timeline.ts` - Render colored markers with tooltips

---

### 14. Frame Info Overlay (Data Display)

**OpenRV Reference:** `src/plugins/rv-packages/data_display_indicators`

**Description:**
On-screen display of frame metadata: frame number, timecode, filename, color space, etc.

**Requirements:**
- [ ] Toggleable info overlay on viewer
- [ ] Show: frame number, timecode, filename, resolution, fps
- [ ] Show: color space, bit depth (when available)
- [ ] Customizable position (corners)
- [ ] Customizable fields to display
- [ ] Burn-in option for export

**Files to create:**
- `src/ui/components/InfoOverlay.ts`

**Files to modify:**
- `src/ui/components/Viewer.ts` - Render info overlay

---

### 15. Pixel Probe / Color Picker

**OpenRV Reference:** Color inspection tools in RV UI

**Description:**
Click on image to see exact pixel values at that location.

**Requirements:**
- [ ] Click to sample pixel color
- [ ] Show RGB values (0-255 and 0.0-1.0)
- [ ] Show HSL/HSV values
- [ ] Show hex color code
- [ ] Continuous probe mode (show values under cursor)
- [ ] Copy color value to clipboard

**Files to create:**
- `src/ui/components/PixelProbe.ts`

**Files to modify:**
- `src/ui/components/Viewer.ts` - Add probe mode and cursor tracking

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

### 17. EXR Support via WebAssembly

**OpenRV Reference:** Native OpenEXR support throughout

**Description:**
Load OpenEXR files using WebAssembly-compiled OpenEXR library.

**Requirements:**
- [ ] Compile OpenEXR to WASM or find existing port
- [ ] Support multi-layer EXR
- [ ] Support half-float and float data
- [ ] HDR tone mapping for display
- [ ] Layer/channel selection

**Dependencies:**
- [openexr-wasm](https://github.com/nicholasbishop/openexr-wasm) or similar

**Files to create:**
- `src/formats/EXRLoader.ts`

---

### 18. Grayscale Mode

**OpenRV Reference:** `src/lib/ip/IPBaseNodes/ColorGrayScaleIPNode.cpp`

**Description:**
Quick toggle to view image in grayscale for luminance evaluation.

**Requirements:**
- [ ] Toggle button in View tab
- [ ] Keyboard shortcut: `Shift+G`
- [ ] Use Rec.709 luminance weights

**Files to modify:**
- `src/ui/components/Viewer.ts` - Add grayscale filter
- `src/ui/components/layout/ContextToolbar.ts` - Add toggle button

---

### 19. Linear/Log Conversion

**OpenRV Reference:** `src/lib/ip/IPBaseNodes/LinearizeIPNode.cpp`, `LogLinIPNode.cpp`

**Description:**
Convert between linear and logarithmic color spaces for proper viewing of log-encoded footage.

**Requirements:**
- [ ] Cineon/DPX log to linear
- [ ] ARRI LogC to linear
- [ ] Sony S-Log to linear
- [ ] RED Log3G10 to linear
- [ ] Custom log parameters

**Files to create:**
- `src/color/LogLinear.ts`
- `src/ui/components/LogLinControl.ts`

---

### 20. Primary Color Correction (Lift/Gamma/Gain)

**OpenRV Reference:** `src/lib/ip/IPBaseNodes/PrimaryConvertIPNode.cpp`

**Description:**
Professional 3-way color correction with lift (shadows), gamma (midtones), and gain (highlights) for each RGB channel.

**Requirements:**
- [ ] Color wheels UI for Lift, Gamma, Gain
- [ ] Per-channel RGB controls
- [ ] Master controls
- [ ] Reset buttons per wheel
- [ ] Link/unlink RGB channels

**Files to create:**
- `src/color/LiftGammaGain.ts`
- `src/ui/components/ColorWheels.ts`

---

### 21. Noise Reduction

**OpenRV Reference:** `src/lib/ip/IPBaseNodes/NoiseReductionIPNode.cpp`

**Description:**
Basic noise reduction filter for cleaning up noisy footage.

**Requirements:**
- [ ] Spatial noise reduction (blur-based)
- [ ] Luminance vs Chroma noise reduction
- [ ] Strength control
- [ ] Preserve detail option

**Files to create:**
- `src/filters/NoiseReduction.ts`

**Files to modify:**
- `src/ui/components/FilterControl.ts` - Add noise reduction controls

---

### 22. Overlay/Watermark

**OpenRV Reference:** `src/lib/ip/IPBaseNodes/OverlayIPNode.cpp`

**Description:**
Add image overlays like logos or watermarks to the viewer.

**Requirements:**
- [ ] Load PNG/SVG overlay
- [ ] Position: corners, center, custom
- [ ] Opacity control
- [ ] Scale control
- [ ] Burn-in option for export

**Files to create:**
- `src/ui/components/OverlayControl.ts`

**Files to modify:**
- `src/ui/components/Viewer.ts` - Render overlays

---

### 23. Compare Mode (Difference/Blend)

**OpenRV Reference:** Stack composite modes

**Description:**
Advanced comparison modes beyond wipe: difference, blend, overlay.

**Requirements:**
- [ ] Difference mode (shows pixel differences)
- [ ] Blend mode (50/50 mix)
- [ ] Onion skin mode (semi-transparent overlay)
- [ ] Flicker mode (alternate frames rapidly)

**Files to modify:**
- `src/ui/components/WipeControl.ts` - Extend to compare control
- `src/composite/BlendModes.ts` - Add difference mode

---

### 24. Flipbook Cache

**OpenRV Reference:** Frame caching system in `src/lib/ip/IPCore/`

**Description:**
Pre-cache frames to RAM for smooth real-time playback.

**Requirements:**
- [ ] Cache frames to memory (limited by available RAM)
- [ ] Visual indicator of cached frames on timeline
- [ ] Cache ahead of playhead
- [ ] Clear cache button
- [ ] Memory usage display

**Files to create:**
- `src/cache/FrameCache.ts`

**Files to modify:**
- `src/core/session/Session.ts` - Integrate cache
- `src/ui/components/Timeline.ts` - Show cache status

---

## Not Feasible for Web (Reference Only)

These features require native system access and cannot be implemented in a web browser:

| Feature | OpenRV Reference | Reason |
|---------|------------------|--------|
| Hardware SDI Output | Blackmagic/AJA integration | Requires native drivers |
| GPU LUT acceleration | CUDA/Metal compute | Limited WebGL compute |
| DPX/Cineon native decode | Native codec | No browser support |
| RAW camera formats | LibRaw, etc. | No browser decoder |
| Maya/Nuke plugin | Application plugins | Desktop integration |
| Multi-GPU rendering | Native GPU access | Browser sandbox |
| System color management | OS color profiles | Limited browser access |
| Network sync playback | Low-latency networking | WebSocket latency |

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
├── ui/components/      # Scopes implemented here
│   ├── Histogram.ts    # ✅ Implemented
│   ├── Waveform.ts     # ✅ Implemented
│   ├── Vectorscope.ts  # ✅ Implemented
│   └── ChannelSelect.ts # ✅ Implemented
├── stereo/             # NEW: Stereo viewing modes
│   └── StereoRenderer.ts
├── formats/            # NEW: Additional format loaders
│   ├── OTIOLoader.ts
│   └── EXRLoader.ts
├── cache/              # NEW: Frame caching
│   └── FrameCache.ts
└── filters/            # NEW: Additional filters
    └── NoiseReduction.ts
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
