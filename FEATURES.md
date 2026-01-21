# OpenRV Web - Feature Roadmap

Professional feature proposals for video playback, color grading, and review workflows.

---

## Table of Contents

1. [Color Grading](#1-color-grading)
2. [Scopes & Analysis](#2-scopes--analysis)
3. [Comparison Tools](#3-comparison-tools)
4. [Timeline & Playback](#4-timeline--playback)
5. [Annotation & Review](#5-annotation--review)
6. [Transform & Correction](#6-transform--correction)
7. [File Format Support](#7-file-format-support)
8. [Session & Project Management](#8-session--project-management)
9. [Performance & Technical](#9-performance--technical)
10. [UI/UX Improvements](#10-uiux-improvements)

---

## 1. Color Grading

### 1.1 Lift/Gamma/Gain Color Wheels

**Priority:** HIGH
**Complexity:** Medium
**Reference:** DaVinci Resolve Primary Wheels, Baselight Base Grade

#### Description
Three-way color correction using intuitive circular wheels for shadows (Lift), midtones (Gamma), and highlights (Gain). Industry standard for primary color correction.

#### Requirements
- Three circular wheel controls with center point for color balance
- Vertical slider on each wheel for luminance adjustment
- Master wheel affecting all tones simultaneously
- Numeric input fields for precise values
- Reset button per wheel and global reset
- Link/unlink wheels option for gang adjustments

#### UI/UX Specifications
- Wheel diameter: 120px minimum
- Center point drag for color shift (x = red/cyan, y = green/magenta)
- Visual indicator showing offset from center
- Color preview ring around wheel showing current bias
- Luminance slider: -1.0 to +1.0 range
- Color range: circular coordinates mapped to -1.0 to +1.0 per channel

#### Technical Notes
- Formula: `output = (input * gain) + offset` applied per luminance zone
- Luminance zones defined by smooth falloff curves (not hard boundaries)
- Zone definitions:
  - Lift: affects pixels where luma < 0.33 (soft falloff to 0.5)
  - Gamma: affects pixels where 0.25 < luma < 0.75 (bell curve)
  - Gain: affects pixels where luma > 0.67 (soft falloff from 0.5)

#### Test Cases
- [x] WHEEL-001: Dragging wheel center shifts color balance ✓
- [x] WHEEL-002: Luminance slider adjusts brightness in target zone ✓
- [x] WHEEL-003: Reset returns wheel to neutral ✓
- [x] WHEEL-004: Numeric input matches wheel position ✓
- [x] WHEEL-005: Changes reflect in real-time on viewer ✓
- [x] WHEEL-006: Scopes update when wheels adjusted ✓
- [x] WHEEL-007: Undo/redo works for wheel changes ✓
- [x] WHEEL-008: Wheel state saves/loads with session ✓
- [x] WHEEL-U001-U033: 33 comprehensive unit tests in ColorWheels.test.ts covering initialization, visibility, state management, reset, undo/redo, and lift/gamma/gain zone curves ✓

#### Corner Cases
- Very dark images (lift has minimal effect)
- Very bright images (gain causes clipping)
- High contrast images (zone overlap visible)
- Grayscale images (color shift still applies)

---

### 1.2 Highlight/Shadow Recovery

**Priority:** HIGH
**Complexity:** Low-Medium
**Reference:** Lightroom Highlights/Shadows, DaVinci Resolve HDR Wheels

#### Description
Dedicated controls for recovering detail in blown highlights and crushed shadows without affecting midtones.

#### Requirements
- Highlights slider: -100 to +100 (negative = recover, positive = boost)
- Shadows slider: -100 to +100 (negative = crush, positive = recover)
- Whites slider: sets white point clipping level
- Blacks slider: sets black point clipping level
- Soft knee options for highlight/shadow rolloff

#### UI/UX Specifications
- Horizontal sliders with center detent at 0
- Real-time histogram showing clipping zones
- Visual highlight/shadow clipping warnings (zebras)
- Slider width: 200px minimum
- Numeric input with 0.1 precision

#### Technical Notes
- Highlight recovery: compress values above threshold using soft knee
- Shadow recovery: expand values below threshold with toe curve
- Use luminance-based masking to isolate zones
- Preserve color ratios during recovery (maintain hue)
- Formula approach:
  ```
  highlight_mask = smoothstep(0.7, 1.0, luma)
  recovered = mix(original, compressed, highlight_mask * amount)
  ```

#### Test Cases
- [x] HL-001: Highlight slider recovers blown-out areas ✓
- [x] HL-002: Shadow slider reveals shadow detail ✓
- [x] HL-003: Whites slider clips white point ✓
- [x] HL-004: Blacks slider clips black point ✓
- [x] HL-005: Recovery preserves color hue ✓
- [ ] HL-006: Works correctly with HDR content (requires HDR test content)
- [x] HL-007: Scopes reflect highlight/shadow changes ✓

#### Corner Cases
- Already clipped source (no data to recover)
- 8-bit vs 10-bit vs float source differences
- Log-encoded footage (different luminance distribution)
- HDR content with values > 1.0

---

### 1.3 Vibrance Control

**Priority:** MEDIUM
**Complexity:** Low
**Reference:** Photoshop/Lightroom Vibrance

#### Description
Intelligent saturation that boosts less-saturated colors more than already-saturated ones, protecting skin tones.

#### Requirements
- Vibrance slider: -100 to +100
- Skin tone protection option (on by default)
- Affects less-saturated pixels more than saturated ones
- Prevents clipping of already-saturated colors

#### UI/UX Specifications
- Single horizontal slider
- Toggle for skin protection mode
- Visual indicator when skin protection active

#### Technical Notes
- Calculate per-pixel saturation
- Apply variable saturation boost inversely proportional to existing saturation
- Skin tone detection: hue range ~20-50 degrees (orange-yellow), low saturation
- Formula:
  ```
  sat_factor = 1.0 - (current_saturation * 0.5)
  new_saturation = current_saturation + (vibrance * sat_factor)
  ```

#### Test Cases
- [x] VIB-001: Vibrance boosts low-saturation areas more ✓
- [x] VIB-002: High-saturation areas less affected ✓
- [x] VIB-003: Skin tones protected when enabled ✓
- [x] VIB-004: Negative vibrance desaturates uniformly ✓
- [x] VIB-005: Works with existing saturation control ✓

#### Corner Cases
- Already fully saturated image
- Monochrome/grayscale image
- Skin tones at edge of detection range
- Mixed lighting (warm/cool areas)

---

### 1.4 Clarity/Local Contrast

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** Lightroom Clarity, DaVinci Resolve Midtone Detail

#### Description
Enhances local contrast in midtones without affecting global contrast, adding punch and definition.

#### Requirements
- Clarity slider: -100 to +100
- Affects midtone frequencies primarily
- Does not clip highlights or shadows
- Radius control for effect size (optional advanced)

#### UI/UX Specifications
- Horizontal slider with center at 0
- Optional advanced panel with radius control
- Preview toggle to see before/after

#### Technical Notes
- Implementation: high-pass filter blended with midtone mask
- Steps:
  1. Apply Gaussian blur to create low-frequency layer
  2. Subtract low-frequency from original = high-frequency
  3. Create midtone mask from luminance
  4. Add masked high-frequency back scaled by clarity amount
- Radius affects Gaussian blur size (larger = more global effect)

#### Test Cases
- [x] CLAR-001: Positive clarity enhances edge definition
- [x] CLAR-002: Negative clarity softens midtone detail
- [x] CLAR-003: Highlights and shadows preserved (midtone mask fades at extremes)
- [x] CLAR-004: No halo artifacts at reasonable settings (effect scale limited to 0.7)
- [x] CLAR-005: Works with other color corrections
- [x] CLAR-006: Clarity state resets correctly
- [x] CLAR-007: Reset returns clarity to 0

#### Corner Cases
- High contrast edges (may produce halos)
- Noise in shadows (clarity can amplify noise)
- Large smooth gradients (banding risk)
- Very soft/blurry source images

---

### 1.5 HSL Qualifier / Secondary Color Correction

**Priority:** HIGH
**Complexity:** High
**Reference:** DaVinci Resolve Qualifier, Baselight Inside/Outside

#### Description
Select specific colors by Hue, Saturation, and Luminance ranges, then apply corrections only to selected regions.

#### Requirements
- HSL range sliders with soft falloff
- Hue: 0-360 degrees with wrap-around support
- Saturation: 0-100% range selection
- Luminance: 0-100% range selection
- Softness/falloff control for each parameter
- Matte preview mode (show selection as grayscale mask)
- Invert selection option
- Apply any color correction to selected region only

#### UI/UX Specifications
- Color wheel for quick hue selection
- Range sliders with min/max handles and softness control
- Matte view toggle button
- Visual preview of selected color in small swatch
- Eyedropper tool to sample color from image

#### Technical Notes
- Convert RGB to HSL for qualification
- Create soft matte from HSL distance
- Handle hue wrap-around (red spans 350-10 degrees)
- Falloff formula:
  ```
  distance = abs(pixel_hue - center_hue)
  if distance > 180: distance = 360 - distance
  matte = smoothstep(outer_range, inner_range, distance)
  ```

#### Test Cases
- [x] HSL-001: Hue selection isolates specific color ✓
- [x] HSL-002: Saturation range filters by color intensity ✓
- [x] HSL-003: Luminance range filters by brightness ✓
- [x] HSL-004: Soft falloff creates smooth matte edges ✓
- [x] HSL-005: Matte preview shows selection accurately ✓
- [x] HSL-006: Invert selection works correctly ✓
- [x] HSL-007: Corrections apply only to selected region ✓
- [x] HSL-008: Hue wrap-around handles red correctly ✓
- [x] HSL-U001-U057: 57 comprehensive unit tests in HSLQualifier.test.ts covering initialization, enable/disable, hue/saturation/luminance ranges, corrections, invert, matte preview, pickColor, and apply functionality ✓

#### Corner Cases
- Selecting red (hue wraps around 0/360)
- Very narrow selection (noisy matte)
- Selecting near-black or near-white (HSL conversion issues)
- Multiple distinct color ranges needed

---

### 1.6 Color Space Conversion

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** DaVinci Resolve Color Management, ACES

#### Description
Convert between color spaces and gamma curves for proper handling of different camera sources.

#### Requirements
- Input color space selection (sRGB, Rec.709, Rec.2020, DCI-P3, ACES)
- Input gamma/transfer function (Linear, sRGB, Rec.709, Log variants)
- Output color space selection
- Output gamma selection
- Working space option for internal processing

#### UI/UX Specifications
- Dropdown menus for input/output selection
- Common presets (e.g., "ARRI LogC to Rec.709")
- Visual gamut diagram showing conversion
- Warning when gamut clipping may occur

#### Technical Notes
- Use 3x3 matrix for primaries conversion
- 1D LUT or formula for transfer function
- Common matrices available in ITU standards
- ACES requires specific transforms (IDT/ODT)
- Linear working space recommended for accurate compositing

#### Test Cases
- [ ] CS-001: sRGB to Rec.709 conversion accurate
- [ ] CS-002: Log to linear conversion correct
- [ ] CS-003: Wide gamut (P3) clips to Rec.709 properly
- [ ] CS-004: Round-trip conversion preserves values
- [ ] CS-005: Scopes display in output color space

#### Corner Cases
- Out-of-gamut colors (negative RGB values)
- HDR content (values > 1.0)
- Mixed sources with different color spaces
- Log footage with incorrect input setting

---

### 1.7 3D LUT Support

**Priority:** HIGH
**Complexity:** Medium
**Reference:** DaVinci Resolve LUT support, Nuke

#### Description
Load and apply 3D Look-Up Tables (.cube, .3dl) for color transforms and creative looks.

#### Requirements
- Load .cube format (Adobe/Resolve standard)
- Load .3dl format (Lustre/Flame)
- Preview LUT effect in real-time
- LUT intensity/mix control (0-100%)
- LUT library browser
- Apply before or after other corrections

#### UI/UX Specifications
- LUT browser panel with thumbnails
- Drag-and-drop LUT files
- Intensity slider
- Position in pipeline selector (input/output)
- Recent LUTs list

#### Technical Notes
- Parse .cube text format (size, domain, data)
- Store as 3D texture for GPU interpolation
- Trilinear interpolation for smooth results
- Support common sizes: 17x17x17, 33x33x33, 65x65x65

#### Test Cases
- [ ] LUT-001: .cube file loads correctly
- [ ] LUT-002: .3dl file loads correctly
- [ ] LUT-003: LUT applies to viewer in real-time
- [ ] LUT-004: Intensity slider blends LUT effect
- [ ] LUT-005: Multiple LUTs can be stacked
- [ ] LUT-006: LUT state saves with session

#### Corner Cases
- Invalid LUT file format
- Very large LUTs (65^3 = 274K entries)
- LUTs with extended range (values outside 0-1)
- 1D LUTs vs 3D LUTs

---

### 1.8 Film Emulation / Print Film LUT

**Priority:** LOW
**Complexity:** Low
**Reference:** FilmConvert, VSCO

#### Description
Built-in film stock emulation presets mimicking classic film stocks.

#### Requirements
- Preset library of film stocks (Kodak, Fuji, etc.)
- Film grain overlay option
- Print/projection simulation
- Intensity control per preset

#### UI/UX Specifications
- Visual preset browser with thumbnails
- Intensity slider (0-100%)
- Grain on/off toggle
- Favorite/recent presets section

#### Technical Notes
- Implement as 3D LUTs with grain texture overlay
- Grain should be frame-varying (animated)
- Include color shift, contrast curve, and saturation changes

#### Test Cases
- [ ] FILM-001: Preset applies characteristic look
- [ ] FILM-002: Intensity scales effect properly
- [ ] FILM-003: Grain animates over frames
- [ ] FILM-004: Multiple presets can be compared

#### Corner Cases
- Grain on static images (no animation)
- Very dark scenes (grain more visible)
- Already graded footage (double-processing)

---

## 2. Scopes & Analysis

### 2.1 Parade Scope (RGB Parade)

**Priority:** HIGH
**Complexity:** Medium
**Reference:** DaVinci Resolve RGB Parade

#### Description
Side-by-side waveform display of Red, Green, and Blue channels for easy color balance analysis.

#### Requirements
- Three separate waveforms (R, G, B) arranged horizontally
- Each channel in its respective color
- Synchronized horizontal position across all three
- 0-100 IRE scale with reference lines
- Optional YCbCr mode (Y, Cb, Cr channels)

#### UI/UX Specifications
- Equal width for each channel (1/3 of scope width)
- Subtle separator lines between channels
- Channel labels (R, G, B) at top
- Same vertical scale as standard waveform
- Toggle between RGB and YCbCr modes

#### Technical Notes
- Similar to waveform but plot each channel separately
- X position divided into three regions
- Each pixel's x-position mapped to corresponding region
- GPU acceleration essential for performance

#### Test Cases
- [x] PARADE-001: RGB channels display separately ✓
- [x] PARADE-002: Horizontal position corresponds to image ✓
- [x] PARADE-003: Channel colors are correct ✓
- [x] PARADE-004: Scale matches 0-255 range ✓
- [x] PARADE-005: Updates in real-time during playback ✓
- [ ] PARADE-006: YCbCr mode shows correct channels (optional, not yet implemented)

#### Corner Cases
- Monochrome image (all channels identical)
- Extreme color cast (one channel clipped)
- HDR content (values > 100%)

---

### 2.2 RGB Overlay Waveform

**Priority:** MEDIUM
**Complexity:** Low
**Reference:** Standard RGB Waveform overlay

#### Description
Single waveform with all RGB channels overlaid, showing where colors align (white) and diverge.

#### Requirements
- Red, Green, Blue traces overlaid on same graph
- White/gray where all channels align
- Distinct colors where channels differ
- Additive blending mode

#### UI/UX Specifications
- Already partially implemented - enhance with better blending
- Option to toggle individual channels on/off
- Brightness control for trace intensity

#### Technical Notes
- Use additive blending: R+G=Yellow, G+B=Cyan, R+B=Magenta, R+G+B=White
- Adjustable trace intensity to prevent washout

#### Test Cases
- [x] RGBW-001: Overlapping channels show combined color (additive blending)
- [x] RGBW-002: Individual channels distinguishable (R/G/B toggle buttons)
- [x] RGBW-003: Toggle channels on/off works (25 tests in Waveform.test.ts)

---

### 2.3 False Color Display

**Priority:** HIGH
**Complexity:** Medium
**Reference:** ARRI False Color, Camera false color modes

#### Description
Map luminance values to a rainbow color scale for quick exposure evaluation.

#### Requirements
- Map IRE levels to specific colors:
  - 0-5 IRE: Purple (black crush warning)
  - 5-20 IRE: Blue (shadows)
  - 20-40 IRE: Cyan/Teal (lower midtones)
  - 40-50 IRE: Green (18% gray target)
  - 50-60 IRE: Light green (midtones)
  - 60-70 IRE: Yellow (upper midtones)
  - 70-85 IRE: Orange (highlights)
  - 85-95 IRE: Pink (near clipping)
  - 95-100+ IRE: Red (clipping warning)
- Optional skin tone indicator overlay
- Toggle on/off easily

#### UI/UX Specifications
- Apply as full-screen overlay on viewer
- Legend showing color-to-IRE mapping
- Keyboard shortcut for quick toggle
- Option to show skin tone band (around 70 IRE)

#### Technical Notes
- Calculate luminance: Y = 0.2126R + 0.7152G + 0.0722B
- Map Y to color lookup table
- Apply as post-process (after all color corrections)
- Can be implemented as 1D LUT application

#### Test Cases
- [x] FC-001: Black areas show purple ✓
- [x] FC-002: Midtones show green/yellow ✓
- [x] FC-003: Highlights show orange/red ✓
- [x] FC-004: Clipped areas clearly red ✓
- [x] FC-005: Toggle enables/disables overlay ✓
- [x] FC-006: Legend displays correctly ✓
- [x] FC-U001-U030: 30 comprehensive unit tests in FalseColor.test.ts covering IRE mapping, preset switching, color mapping, and state management ✓

#### Corner Cases
- Log-encoded footage (different IRE mapping)
- HDR content (values above 100 IRE)
- Already color-graded footage

---

### 2.4 Zebra Stripes (Exposure Warning)

**Priority:** MEDIUM
**Complexity:** Low
**Reference:** Camera zebra patterns

#### Description
Animated diagonal stripes overlaid on areas exceeding or below threshold IRE levels.

#### Requirements
- High zebra: areas above configurable threshold (default 95%)
- Low zebra: areas below configurable threshold (default 5%)
- Different stripe patterns for high/low
- Adjustable threshold values
- Animated stripes (diagonal movement)

#### UI/UX Specifications
- High zebras: right-leaning stripes, red tinted
- Low zebras: left-leaning stripes, blue tinted
- Threshold sliders in settings
- Quick toggle button

#### Technical Notes
- Generate stripe pattern using fragment shader
- Animate using time uniform
- Mask by luminance threshold
- Stripe formula: `(x + y + time) mod period < width`

#### Test Cases
- [x] ZEB-001: High zebras appear on bright areas ✓
- [x] ZEB-002: Low zebras appear on dark areas ✓
- [x] ZEB-003: Threshold adjustment works ✓
- [x] ZEB-004: Stripes animate smoothly ✓
- [x] ZEB-005: Toggle enables/disables ✓
- [x] ZEB-U001-U113: 49 comprehensive unit tests in ZebraStripes.test.ts covering luminance calculation (Rec. 709), threshold clamping, stripe pattern generation, color blending, animation, state management, and UI ✓

#### Corner Cases
- Full-screen bright/dark areas
- Rapidly changing exposure
- Thin bright/dark lines

---

### 2.5 Pixel Probe / Color Sampler

**Priority:** HIGH
**Complexity:** Low
**Reference:** Photoshop color sampler, DaVinci Resolve Picker

#### Description
Click anywhere on image to see RGB/HSL values at that pixel, with optional persistent sample points.

#### Requirements
- Click to sample single pixel
- Display RGB values (0-255 and 0.0-1.0)
- Display HSL values
- Display luminance (IRE)
- Optional: place up to 4 persistent sample points
- Sample point values update in real-time during grading

#### UI/UX Specifications
- Crosshair cursor when probe active
- Info panel showing sampled values
- Persistent points shown as small numbered markers
- Values update live as image changes

#### Technical Notes
- Read pixel from rendered canvas
- Convert RGB to HSL for display
- Calculate luminance using Rec.709 coefficients
- Store persistent point coordinates (normalized 0-1)

#### Test Cases
- [x] PROBE-001: Click shows pixel RGB values ✓
- [x] PROBE-002: HSL values calculated correctly ✓
- [x] PROBE-003: IRE value displayed ✓
- [x] PROBE-004: Persistent points remain across frames ✓
- [x] PROBE-005: Values update during color correction ✓
- [x] PROBE-006: Probe works at all zoom levels ✓
- [x] PROBE-U001-U045: 45 comprehensive unit tests in PixelProbe.test.ts covering RGB, HSL, IRE calculations, lock functionality, sample points, and state management ✓

#### Corner Cases
- Clicking outside image bounds
- Transparent pixels (alpha < 1)
- Zoomed in/out view
- During playback (moving target)

---

### 2.6 Histogram Clipping Indicators

**Priority:** LOW
**Complexity:** Low
**Reference:** Lightroom histogram warnings

#### Description
Visual indicators on histogram showing percentage of pixels clipped in shadows and highlights.

#### Requirements
- Highlight clipping indicator (pixels at 255/1.0)
- Shadow clipping indicator (pixels at 0)
- Show percentage or pixel count
- Optional colored overlay on image showing clipped areas

#### UI/UX Specifications
- Small triangular indicators at histogram ends
- Click to toggle clipping overlay on viewer
- Percentage display in corner of histogram

#### Technical Notes
- Count pixels at 0 and 255 during histogram calculation
- Store as percentage of total pixels
- Clipping overlay: red for highlights, blue for shadows

#### Test Cases
- [x] CLIP-001: Highlight indicator shows clipped percentage ✓
- [x] CLIP-002: Shadow indicator shows crushed percentage ✓
- [x] CLIP-003: Click toggles overlay on viewer ✓
- [x] CLIP-004: Overlay updates during grading ✓

---

## 3. Comparison Tools

### 3.1 Split Screen Compare

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** DaVinci Resolve Split Screen

#### Description
Display multiple versions/grades side-by-side in a grid for comparison.

#### Requirements
- 2x1, 1x2, 2x2, 3x2 grid layouts
- Each cell can show different grade version
- Sync playback across all cells
- Option to show same frame or sequential frames
- Labels for each cell

#### UI/UX Specifications
- Layout selector dropdown
- Drag-and-drop versions to cells
- Click cell to make it "active" for editing
- Sync/unsync playhead option
- Version labels with customizable names

#### Technical Notes
- Render each version to separate viewport region
- Share frame data, apply different color pipelines
- Optional: render to single canvas with viewport scissoring

#### Test Cases
- [ ] SPLIT-001: 2x2 grid displays correctly
- [ ] SPLIT-002: Each cell shows different grade
- [ ] SPLIT-003: Playback syncs across cells
- [ ] SPLIT-004: Clicking cell activates it
- [ ] SPLIT-005: Labels display correctly

#### Corner Cases
- Different aspect ratios per version
- Odd window sizes (cell sizing)
- Very wide/tall images

---

### 3.2 Onion Skin / Ghost Frames

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** Animation onion skinning

#### Description
Overlay previous/next frames with adjustable opacity for motion analysis and animation reference.

#### Requirements
- Show N frames before current (configurable, 1-5)
- Show N frames after current (configurable, 1-5)
- Adjustable opacity per ghost frame
- Color tinting for before (red) and after (green) frames
- Frame step interval (every frame, every 2nd, etc.)

#### UI/UX Specifications
- Enable/disable toggle
- Slider for number of ghost frames
- Opacity control
- Color tint toggles
- Frame step selector

#### Technical Notes
- Render additional frames to textures
- Composite with decreasing opacity
- Tint using multiply blend
- Cache ghost frames for performance

#### Test Cases
- [ ] GHOST-001: Previous frames visible with opacity
- [ ] GHOST-002: Next frames visible with opacity
- [ ] GHOST-003: Color tinting distinguishes before/after
- [ ] GHOST-004: Frame count adjustable
- [ ] GHOST-005: Works during playback (performance)

#### Corner Cases
- First/last frames (fewer ghosts available)
- Missing frames in sequence
- High frame count (memory pressure)

---

### 3.3 A/B Wipe Compare

**Priority:** HIGH
**Complexity:** Medium
**Reference:** RV A/B compare, Nuke wipe

#### Description
Interactive wipe between two sources or grade versions with draggable split line.

#### Requirements
- Vertical or horizontal split line
- Draggable split position
- Swap A/B sources
- Show source labels
- Keyboard shortcut to toggle wipe mode

#### UI/UX Specifications
- Click and drag split line
- Double-click to center split
- Labels showing A/B source names
- Toggle between vertical/horizontal split

#### Technical Notes
- Render both sources to same canvas
- Use clip regions or stencil buffer
- Split line follows mouse during drag
- Store split position as 0-1 normalized value

#### Test Cases
- [x] WIPE-001: Wipe mode can be enabled (Viewer.test.ts WIPE-001)
- [x] WIPE-002: Split line is draggable (Viewer.ts handleWipePointerDown/Move/Up)
- [x] WIPE-003: Vertical/horizontal toggle works (Viewer.test.ts WIPE-003)
- [x] WIPE-004: A/B sources can be swapped (CompareControl toggleAB, 53 tests)
- [x] WIPE-005: Source labels display correctly (Viewer.test.ts WIPE-005, WIPE-005b/c/d)
- [x] WIPE-006: Keyboard shortcut toggles wipe (KeyBindings 'view.cycleWipeMode')

#### Corner Cases
- Different resolution sources
- Different aspect ratio sources
- Split at extreme positions (0%, 100%)

---

### 3.4 Difference Matte (Previously 3.3)

**Priority:** LOW
**Complexity:** Low
**Reference:** After Effects Difference blend mode

#### Description
Show absolute difference between two versions, highlighting changes.

#### Requirements
- Select two versions to compare
- Display pixel difference as grayscale
- Option to amplify difference (gain)
- Option to show difference as heatmap

#### UI/UX Specifications
- A/B source selector
- Difference mode toggle
- Gain slider (1x to 10x)
- Heatmap toggle

#### Technical Notes
- `diff = abs(A - B)` per channel
- Grayscale: average of RGB differences
- Heatmap: map difference magnitude to color ramp
- Gain: multiply difference before display

#### Test Cases
- [x] DIFF-001: Difference matte disabled by default ✅
- [x] DIFF-002: Toggle button visible in Compare dropdown ✅
- [x] DIFF-003: Clicking toggle enables difference matte ✅
- [x] DIFF-004: Enabling changes canvas appearance ✅
- [x] DIFF-005: Gain slider changes gain value ✅
- [x] DIFF-006: Heatmap toggle enables heatmap mode ✅
- [x] DIFF-007: Keyboard shortcut Shift+D toggles ✅
- [x] DIFF-008: Heatmap mode changes appearance ✅

#### Corner Cases
- Very similar images (need gain to see difference)
- Different resolutions (need alignment)
- Alpha channel differences

---

## 4. Timeline & Playback

### 4.1 Timecode Display

**Priority:** HIGH
**Complexity:** Low
**Reference:** Standard timecode overlay

#### Description
Display current timecode (HH:MM:SS:FF) based on frame rate and optional start timecode.

#### Requirements
- Calculate timecode from frame number and FPS
- Support drop-frame timecode (29.97, 59.94 fps)
- Configurable start timecode
- Display in timeline and overlay options
- Support for various frame rates (23.976, 24, 25, 29.97, 30, 50, 59.94, 60)

#### UI/UX Specifications
- Timecode display in header bar
- Optional overlay position (corner selection)
- Font size options for overlay
- Background opacity for readability

#### Technical Notes
- Non-drop-frame: `frame / fps = seconds`
- Drop-frame (29.97): skip frame numbers 0,1 at each minute except every 10th minute
- Start timecode offset added to calculated value

#### Test Cases
- [x] TC-001: Timecode calculates correctly for 24fps ✓
- [x] TC-002: Drop-frame timecode correct for 29.97fps ✓
- [x] TC-003: Start timecode offset works ✓
- [x] TC-004: Display updates during playback ✓
- [x] TC-005: Overlay position configurable ✓
- [x] TC-U001-U050: 50 comprehensive unit tests in TimecodeOverlay.test.ts covering SMPTE timecode, drop-frame (29.97fps, 59.94fps), frame rates, and overlay positioning ✓

#### Corner Cases
- Frame rates with decimals (23.976)
- Very long sequences (hours of footage)
- Negative start timecode

---

### 4.2 Timeline Thumbnails

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** Premiere Pro timeline thumbnails

#### Description
Show frame thumbnails along timeline for visual navigation.

#### Requirements
- Generate thumbnails at regular intervals
- Display in timeline track
- Update on scroll/zoom
- Configurable thumbnail density
- Async generation (non-blocking)

#### UI/UX Specifications
- Thumbnails sized to fit timeline height
- Smooth loading (fade in as generated)
- Click thumbnail to jump to frame
- Hover shows larger preview

#### Technical Notes
- Generate thumbnails in web worker
- Cache generated thumbnails
- Dynamic resolution based on timeline zoom
- Use canvas thumbnailing for efficiency

#### Test Cases
- [ ] THUMB-001: Thumbnails generate for sequence
- [ ] THUMB-002: Click thumbnail navigates to frame
- [ ] THUMB-003: Thumbnails update on zoom
- [ ] THUMB-004: Generation doesn't block playback
- [ ] THUMB-005: Memory usage reasonable for long sequences

#### Corner Cases
- Very long sequences (thousands of frames)
- Sequence with missing frames
- Rapid timeline scrolling

---

### 4.3 Markers with Notes

**Priority:** MEDIUM
**Complexity:** Low
**Reference:** DaVinci Resolve markers, RV annotations

#### Description
Enhanced markers with attached text notes and colors.

#### Requirements
- Add marker at current frame
- Attach text note to marker
- Color coding for marker types
- Duration markers (span multiple frames)
- Marker list panel for navigation
- Import/export markers

#### UI/UX Specifications
- Click marker to edit note
- Right-click for marker options
- Color palette for marker types
- List view showing all markers with notes
- Double-click in list to navigate

#### Technical Notes
- Store: frame, color, note text, duration
- Export as JSON or EDL comments
- Import from common formats

#### Test Cases
- [x] MARK-001: Default marker has red color
- [x] MARK-002: Markers store frame, note, and color data
- [x] MARK-003: toggleMark toggles marker on and off
- [x] MARK-004: Markers array matches marked frames
- [x] MARK-005: setMarker creates marker with note and color via API
- [x] MARK-006: setMarkerNote updates marker note via API
- [x] MARK-007: setMarkerColor updates marker color via API
- [ ] MARK-008: UI for editing marker note (pending)
- [ ] MARK-009: Marker list panel for navigation (pending)
- [ ] MARK-010: Duration marker spans frames (pending)
- [ ] MARK-011: Export/import markers (pending)

#### Corner Cases
- Very long notes (truncation display)
- Many markers (performance)
- Overlapping duration markers

---

### 4.4 Playback Speed Control

**Priority:** MEDIUM
**Complexity:** Low
**Reference:** VLC speed control

#### Description
Variable playback speed from slow motion to fast forward.

#### Requirements
- Speed range: 0.1x to 4x (or higher)
- Common presets: 0.25x, 0.5x, 1x, 2x, 4x
- Audio pitch correction at different speeds (optional)
- Frame blending for slow motion (optional)

#### UI/UX Specifications
- Speed dropdown or slider
- Display current speed
- Keyboard shortcuts: J (slower), K (pause), L (faster)
- Double-tap L for faster, J for slower

#### Technical Notes
- Adjust frame interval: `interval = (1000/fps) / speed`
- Audio playback rate modification
- For slow motion below 0.5x, consider frame interpolation

#### Test Cases
- [x] SPEED-001: Default playback speed is 1x
- [x] SPEED-002: Speed button visible and shows current speed
- [x] SPEED-003: Clicking button cycles through speed presets
- [x] SPEED-004: J key decreases speed
- [x] SPEED-005: L key increases speed
- [x] SPEED-006: K key stops playback
- [x] SPEED-007: Speed button highlights when not 1x

#### Corner Cases
- Very slow speeds (frame timing precision)
- Very fast speeds (frame skipping)
- Audio sync at non-1x speeds

---

### 4.5 Audio Waveform Display

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** Premiere Pro, DaVinci Resolve audio tracks

#### Description
Display audio waveform visualization in timeline for audio sync and editing reference.

#### Requirements
- Generate waveform from audio track
- Display in timeline below video track
- Zoom with timeline
- Show stereo channels (L/R)
- Color coding for channels
- Peak indicators

#### UI/UX Specifications
- Waveform height adjustable
- Toggle visibility
- Color options for L/R channels
- Peak clipping indicators (red)

#### Technical Notes
- Decode audio using Web Audio API
- Generate waveform data in web worker
- Cache waveform data for performance
- Downsample for zoomed out view

#### Test Cases
- [ ] AUDIO-001: Waveform generates for video with audio
- [ ] AUDIO-002: Stereo channels display separately
- [ ] AUDIO-003: Waveform scales with timeline zoom
- [ ] AUDIO-004: Peak clipping indicated
- [ ] AUDIO-005: Waveform cached for performance

#### Corner Cases
- Video without audio track
- Very long audio (memory management)
- Multi-channel audio (5.1, 7.1)
- Variable sample rates

---

### 4.6 Frame Caching Visualization

**Priority:** LOW
**Complexity:** Low
**Reference:** RV cache indicator

#### Description
Visual indicator showing which frames are cached in memory for smooth playback.

#### Requirements
- Timeline bar showing cached frame ranges
- Color coding: cached (green), loading (yellow), uncached (gray)
- Cache size display (MB/GB used)
- Manual cache clear option

#### UI/UX Specifications
- Thin bar above or below timeline
- Real-time update as frames cache
- Cache status in info panel

#### Technical Notes
- Track frame cache state
- Update visualization on cache changes
- Respect memory limits

#### Test Cases
- [x] CACHE-001: Cache indicator visible for mediabunny video ✅
- [x] CACHE-002: Cache indicator shows cached frames count ✅
- [x] CACHE-003: Cache indicator DOM element present ✅
- [x] CACHE-004: Clear cache button exists ✅
- [x] CACHE-005: Clear button clears cache ✅
- [x] CACHE-006: Cache stats display present ✅

---

## 5. Annotation & Review

### 5.1 Shape Tools

**Priority:** HIGH
**Complexity:** Medium
**Reference:** FrameIO annotations, SyncSketch

#### Description
Add geometric shapes (rectangles, circles, arrows, lines) for clear review feedback.

#### Requirements
- Rectangle tool (with optional rounded corners)
- Ellipse/Circle tool
- Line tool
- Arrow tool (with arrowhead)
- Polygon tool (click to add points)
- Fill and stroke color options
- Stroke width control

#### UI/UX Specifications
- Tool palette in annotation toolbar
- Click-drag to create shape
- Handles for resizing after creation
- Color picker for fill/stroke
- Fill opacity control

#### Technical Notes
- Store as vector data (coordinates, colors, style)
- Render using Canvas2D paths
- Support rotation handles
- Export coordinates normalized (0-1)

#### Test Cases
- [x] SHAPE-001: Can create rectangle shape via API ✓
- [x] SHAPE-002: Can create ellipse shape via API ✓
- [x] SHAPE-003: Can create arrow shape via API ✓
- [x] SHAPE-004: Can create line shape via API ✓
- [x] SHAPE-005: Rectangle with fill color renders correctly ✓
- [x] SHAPE-006: Rounded rectangle renders correctly ✓
- [x] SHAPE-007: Can update shape properties via API ✓
- [x] SHAPE-008: Ellipse with fill renders correctly ✓
- [x] SHAPE-009: Multiple shapes on same frame ✓
- [x] SHAPE-010: Arrow with custom arrowhead size ✓
- [x] SHAPE-011: Polygon tool creates polygon with multiple points ✓
- [x] SHAPE-012: Polygon renders on canvas ✓
- [x] SHAPE-013: Polygon with fill color ✓
- [x] SHAPE-014: Rectangle tool button exists and is clickable ✓
- [x] SHAPE-015: Ellipse tool button exists and is clickable ✓
- [x] SHAPE-016: Line tool button exists and is clickable ✓
- [x] SHAPE-017: Arrow tool button exists and is clickable ✓
- [x] SHAPE-018: Shape tool buttons switch correctly ✓

#### Corner Cases
- Very small shapes (minimum size)
- Shapes extending beyond frame
- Many shapes (performance)
- Shape selection overlap

---

### 5.2 Spotlight / Focus Tool

**Priority:** MEDIUM
**Complexity:** Low
**Reference:** Presentation spotlight tools

#### Description
Dim everything except a highlighted region to draw attention.

#### Requirements
- Circular or rectangular spotlight
- Adjustable size
- Adjustable dim amount (how dark the rest)
- Feathered edge option
- Can be animated/keyframed per frame

#### UI/UX Specifications
- Click and drag to position
- Handles to resize
- Slider for dimness level
- Toggle feathered edge

#### Technical Notes
- Render dimming layer with cutout
- Use mask/composite for spotlight effect
- Feather using gradient at edges

#### Test Cases
- [x] SPOT-001: Spotlight should be disabled by default ✓
- [x] SPOT-002: Shift+Q should toggle spotlight on/off ✓
- [x] SPOT-003: Spotlight should have default values when enabled ✓
- [x] SPOT-004: Enabling spotlight should visually change canvas ✓
- [x] SPOT-005: Spotlight shape can be changed via API ✓
- [x] SPOT-006: Spotlight position can be changed via API ✓
- [x] SPOT-007: Spotlight size can be changed via API ✓
- [x] SPOT-008: Spotlight dim amount can be changed via API ✓
- [x] SPOT-009: Spotlight feather can be changed via API ✓
- [x] SPOT-010: Changing spotlight parameters should visually update canvas ✓

---

### 5.3 Text Annotations Enhancement

**Priority:** MEDIUM
**Complexity:** Low
**Reference:** Professional annotation tools

#### Description
Enhance existing text tool with more formatting options.

#### Requirements
- Font selection (system fonts or web-safe set)
- Bold, italic, underline styles
- Text background/highlight option
- Auto-sizing text boxes
- Callout style (text with leader line to point)
- Numbered/bulleted lists

#### UI/UX Specifications
- Text formatting toolbar when text selected
- Font family dropdown
- Style buttons (B, I, U)
- Background color toggle
- Callout mode button

#### Technical Notes
- Use Canvas2D text rendering with styling
- Store formatting per text annotation
- Callout stores text position + point position

#### Test Cases
- [x] TEXT-001: Can create text annotation with bold style via API ✓
- [x] TEXT-002: Can create text annotation with italic style via API ✓
- [x] TEXT-003: Can create text annotation with underline style via API ✓
- [x] TEXT-004: Can create text annotation with background color via API ✓
- [x] TEXT-005: Can create callout annotation with leader line via API ✓
- [x] TEXT-006: Can update text annotation with multiple styles via API ✓
- [x] TEXT-007: Can set different font family via API ✓
- [x] TEXT-008: Combined bold italic underline with callout renders correctly ✓

---

### 5.4 Annotation Export

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** Frame.io PDF export, SyncSketch

#### Description
Export annotations and review notes to various formats for sharing with team members.

#### Requirements
- Export to PDF with frame thumbnails and notes
- Export to image (PNG/JPEG) with annotations burned in
- Export to JSON for data interchange
- Export to CSV for spreadsheet review
- Include timecode and frame numbers

#### UI/UX Specifications
- Export dialog with format selection
- Options for thumbnail size
- Include/exclude options per annotation type
- Filename template

#### Technical Notes
- Use canvas to render annotations on frames
- PDF generation via jsPDF or similar
- JSON schema for annotations interchange
- Batch export for multiple frames

#### Test Cases
- [ ] EXPORT-001: PDF export generates valid file
- [ ] EXPORT-002: PNG export includes annotations
- [ ] EXPORT-003: JSON export contains all annotation data
- [ ] EXPORT-004: CSV export readable in spreadsheet
- [ ] EXPORT-005: Timecode included in exports

#### Corner Cases
- Very many annotations (large PDF)
- Annotations outside frame bounds
- Unicode text in annotations
- Very long annotation text

---

### 5.5 Comparison Annotations (Previously 5.4)

**Priority:** LOW
**Complexity:** Medium
**Reference:** Review collaboration tools

#### Description
Annotations that reference two different states (before/after, A/B).

#### Requirements
- Link annotation to specific grade version
- Show/hide annotations per version
- "Applies to all versions" option
- Visual indicator of version-specific annotations

#### UI/UX Specifications
- Version badge on each annotation
- Filter annotations by version
- Toggle "show all" vs "show current version only"

#### Technical Notes
- Store version ID with annotation
- Filter display based on active version
- Support wildcard "all versions" flag

#### Test Cases
- [ ] COMP-001: Annotation attached to specific version
- [ ] COMP-002: Switching versions shows/hides annotations
- [ ] COMP-003: "All versions" annotation always visible
- [ ] COMP-004: Filter by version works

---

## 6. Transform & Correction

### 6.1 Perspective Correction

**Priority:** MEDIUM
**Complexity:** High
**Reference:** Photoshop Perspective Warp, DaVinci Resolve Perspective

#### Description
Correct or adjust perspective distortion using four corner points.

#### Requirements
- Four corner point handles
- Adjust each corner independently
- Grid overlay option for alignment
- Numeric input for precise values
- Bilinear/bicubic interpolation quality option

#### UI/UX Specifications
- Enable perspective mode
- Drag corners to adjust
- Grid overlay toggle
- Reset button

#### Technical Notes
- Compute perspective transform matrix from 4 points
- Use WebGL for GPU-accelerated warping
- Perspective matrix: 3x3 homography
- Inverse mapping for correct interpolation

#### Test Cases
- [ ] PERSP-001: Dragging corner warps image
- [ ] PERSP-002: Grid overlay aligns with edges
- [ ] PERSP-003: Reset returns to original
- [ ] PERSP-004: Numeric input precise values
- [ ] PERSP-005: Quality options affect output

#### Corner Cases
- Extreme perspective (nearly degenerate)
- Non-convex resulting shape
- Very wide angle (large warp)

---

### 6.2 Stabilization Preview

**Priority:** LOW
**Complexity:** High
**Reference:** After Effects Warp Stabilizer

#### Description
Basic 2D motion stabilization for shaky footage analysis.

#### Requirements
- Track motion between frames
- Apply inverse transform to stabilize
- Crop to remove black edges
- Smoothing amount control
- Preview only (not for production stabilization)

#### UI/UX Specifications
- Analyze button to track motion
- Progress indicator during analysis
- Smoothing slider
- Crop toggle
- Reset button

#### Technical Notes
- Use optical flow or feature tracking
- Calculate frame-to-frame motion vectors
- Apply smoothed inverse transforms
- This is a preview tool, not production stabilizer

#### Test Cases
- [ ] STAB-001: Analysis completes on sequence
- [ ] STAB-002: Stabilized preview reduces shake
- [ ] STAB-003: Smoothing affects result
- [ ] STAB-004: Crop removes edges

#### Corner Cases
- Very shaky footage
- Motion blur (tracking difficulty)
- Scene cuts (reset tracking)

---

### 6.3 Safe Areas / Guides

**Priority:** HIGH
**Complexity:** Low
**Reference:** Broadcast safe area guides

#### Description
Overlay guide lines for title safe, action safe, and custom aspect ratios.

#### Requirements
- Title safe (80% center)
- Action safe (90% center)
- Custom aspect ratio overlays (16:9, 2.39:1, 4:3, 1:1)
- Center crosshair
- Rule of thirds grid
- Custom guide lines

#### UI/UX Specifications
- Toggle each overlay type
- Opacity control for guides
- Color selection for guides
- Quick presets (broadcast, cinema, social)

#### Technical Notes
- Render as overlay layer
- Calculate positions based on current frame size
- Store guide preferences in session

#### Test Cases
- [x] SAFE-001: Title safe area 80% of frame ✓
- [x] SAFE-002: Action safe area 90% of frame ✓
- [x] SAFE-003: Aspect ratio shows letterbox ✓
- [x] SAFE-004: Guides toggle on/off ✓
- [x] SAFE-005: Colors customizable ✓
- [x] SAFE-U001-U038: 38 comprehensive unit tests in SafeAreasOverlay.test.ts covering title safe (80%), action safe (90%), aspect ratios (16:9, 2.39:1, 4:3, 1:1), center crosshair, and rule of thirds grid ✓

#### Corner Cases
- Non-standard aspect ratios
- Very small viewer size
- Guides overlapping

---

### 6.4 Deinterlace Preview

**Priority:** LOW
**Complexity:** Medium
**Reference:** Interlaced footage handling

#### Description
Preview deinterlacing for interlaced sources.

#### Requirements
- Auto-detect interlaced content
- Deinterlace methods: bob, weave, blend
- Field order selection (upper first, lower first)
- Preview toggle

#### UI/UX Specifications
- Auto-detect indicator
- Method dropdown
- Field order toggle
- Enable/disable preview

#### Technical Notes
- Bob: double frame rate, each field becomes frame
- Weave: combine fields (for still frames)
- Blend: interpolate between fields
- GPU shader for field separation

#### Test Cases
- [ ] DEINT-001: Bob creates smooth motion
- [ ] DEINT-002: Weave combines fields
- [ ] DEINT-003: Field order selection works
- [ ] DEINT-004: Auto-detect identifies interlaced

#### Corner Cases
- Progressive content misdetected
- Mixed interlaced/progressive
- Telecined content (3:2 pulldown)

---

## 7. File Format Support

### 7.1 EXR Support

**Priority:** HIGH
**Complexity:** High
**Reference:** OpenEXR standard

#### Description
Full support for OpenEXR format including multi-layer and HDR.

#### Requirements
- Load single-layer EXR files
- Load multi-layer EXR (access individual layers)
- Support half-float and full-float
- Display HDR content with tone mapping
- Access EXR metadata (camera, lens, etc.)
- Support common compression (ZIP, PIZ, DWAA)

#### UI/UX Specifications
- Layer selector for multi-layer files
- HDR exposure control
- Tone mapping curve selection
- Metadata panel

#### Technical Notes
- Use WebAssembly EXR decoder (e.g., OpenEXR.js)
- Convert half-float to float for processing
- Implement basic tone mapping operators
- Layer names from EXR headers

#### Test Cases
- [ ] EXR-001: Single layer EXR loads correctly
- [ ] EXR-002: Multi-layer shows layer selector
- [ ] EXR-003: Half-float values preserved
- [ ] EXR-004: HDR content tone-mapped for display
- [ ] EXR-005: Metadata accessible
- [ ] EXR-006: All compression types supported

#### Corner Cases
- Deep EXR (not supported initially)
- Tiled EXR (vs scanline)
- Very large EXR files (memory)
- Unusual channel configurations

---

### 7.2 DPX Support

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** SMPTE DPX standard

#### Description
Support for DPX (Digital Picture Exchange) format common in film post.

#### Requirements
- Load 10-bit DPX files
- Support various bit depths (8, 10, 12, 16)
- Handle log-encoded DPX (Cineon log)
- Read DPX metadata (film info, timecode)
- Support RGB and YCbCr formats

#### UI/UX Specifications
- Auto-detect log encoding
- Gamma/log conversion options
- Metadata display

#### Technical Notes
- Parse DPX header structure
- Handle bit packing (10-bit in 32-bit words)
- Apply log-to-linear conversion if needed

#### Test Cases
- [ ] DPX-001: 10-bit DPX loads correctly
- [ ] DPX-002: Various bit depths supported
- [ ] DPX-003: Log encoding detected
- [ ] DPX-004: Metadata readable
- [ ] DPX-005: RGB and YCbCr handled

#### Corner Cases
- Non-standard DPX variations
- Big-endian vs little-endian
- Unusual image orientations

---

### 7.3 RAW Image Preview

**Priority:** LOW
**Complexity:** High
**Reference:** Camera RAW formats

#### Description
Basic preview support for camera RAW formats (CR2, NEF, ARW, etc.)

#### Requirements
- Extract embedded preview/thumbnail
- Display preview (not full RAW processing)
- Show EXIF metadata
- Support common RAW formats

#### UI/UX Specifications
- Auto-detect RAW files
- Show "preview only" indicator
- Display camera info from EXIF

#### Technical Notes
- Use library like LibRaw via WebAssembly
- Extract embedded JPEG preview initially
- Full RAW decode as advanced feature

#### Test Cases
- [ ] RAW-001: Preview extracts from CR2
- [ ] RAW-002: EXIF metadata displayed
- [ ] RAW-003: Preview indicator visible
- [ ] RAW-004: Multiple RAW formats supported

#### Corner Cases
- RAW files without embedded preview
- Proprietary/new RAW formats
- Very large RAW files

---

### 7.4 OpenTimelineIO Import

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** OTIO standard

#### Description
Import timeline/edit data from OpenTimelineIO format.

#### Requirements
- Parse OTIO JSON format
- Import clips with timing
- Import markers and annotations
- Support basic effects references
- Handle offline media gracefully

#### UI/UX Specifications
- Open OTIO file dialog
- Display timeline structure
- Offline media indicators
- Relink media option

#### Technical Notes
- Parse OTIO JSON schema
- Map OTIO clips to internal timeline
- Handle nested timelines
- Support OTIO adapters for other formats

#### Test Cases
- [ ] OTIO-001: Basic timeline imports
- [ ] OTIO-002: Clip timing correct
- [ ] OTIO-003: Markers import
- [ ] OTIO-004: Offline media indicated
- [ ] OTIO-005: Nested timelines handled

#### Corner Cases
- Complex nested structures
- Non-standard OTIO extensions
- Missing referenced media

---

## 8. Session & Project Management

### 8.1 Session Auto-Save

**Priority:** HIGH
**Complexity:** Low
**Reference:** Professional NLE auto-save

#### Description
Automatically save session state at regular intervals to prevent data loss.

#### Requirements
- Configurable auto-save interval (1-30 minutes)
- Save to browser storage (IndexedDB)
- Recovery prompt on app reload after crash
- Manual save trigger
- Save indicator in UI

#### UI/UX Specifications
- Auto-save indicator (subtle pulse when saving)
- Recovery dialog on startup if unsaved state found
- Settings for auto-save interval
- "Last saved" timestamp display

#### Technical Notes
- Use IndexedDB for large session storage
- Debounce saves during rapid changes
- Store session as GTO format internally
- Version recovery sessions

#### Test Cases
- [x] AUTOSAVE-001: Session auto-saves at interval
- [x] AUTOSAVE-002: Recovery prompt appears after crash
- [x] AUTOSAVE-003: Manual save works
- [x] AUTOSAVE-004: Save indicator visible during save
- [ ] AUTOSAVE-005: Auto-save interval configurable (UI settings pending)

#### Corner Cases
- Very large sessions (storage limits)
- Rapid changes (debouncing)
- Browser storage disabled
- Multiple tabs open

---

### 8.2 Session Version History

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** Google Docs version history

#### Description
Maintain version history of session saves for rollback capability.

#### Requirements
- Store multiple session versions
- Named versions (manual snapshots)
- Auto-versioned saves with timestamps
- Compare versions
- Restore to previous version

#### UI/UX Specifications
- Version history panel
- Create named snapshot button
- Version list with timestamps
- Preview version before restore
- Delete old versions

#### Technical Notes
- Store versions in IndexedDB
- Limit version count (configurable)
- Delta storage for efficiency (optional)
- Export version as .rv file

#### Test Cases
- [ ] VERSION-001: Named version creates snapshot
- [ ] VERSION-002: Auto-versions created on save
- [ ] VERSION-003: Version list displays correctly
- [ ] VERSION-004: Restore to version works
- [ ] VERSION-005: Old versions can be deleted

#### Corner Cases
- Many versions (storage management)
- Corrupted version data
- Restore during playback

---

### 8.3 Multi-Clip Playlist

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** RV session manager, playlist functionality

#### Description
Manage multiple clips in a playlist/sequence for batch review.

#### Requirements
- Add multiple clips to playlist
- Reorder clips via drag-and-drop
- Play through all clips sequentially
- Jump to specific clip
- Remove clips from playlist
- Save/load playlists

#### UI/UX Specifications
- Playlist panel (collapsible)
- Drag-and-drop reordering
- Thumbnail per clip
- Current clip highlight
- Add/remove buttons

#### Technical Notes
- Store clip references and order
- Preload next clip during playback
- Handle different frame rates/resolutions
- Playlist as part of session state

#### Test Cases
- [ ] PLAYLIST-001: Add clip to playlist
- [ ] PLAYLIST-002: Remove clip from playlist
- [ ] PLAYLIST-003: Reorder clips via drag-and-drop
- [ ] PLAYLIST-004: Play through clips sequentially
- [ ] PLAYLIST-005: Jump to specific clip
- [ ] PLAYLIST-006: Playlist saves with session

#### Corner Cases
- Clips with different frame rates
- Missing/offline clips
- Very long playlists
- Playlist loop mode

---

## 9. Performance & Technical

### 9.1 Web Worker Frame Decoding

**Priority:** HIGH
**Complexity:** Medium
**Reference:** Efficient video processing

#### Description
Decode video frames in Web Workers to prevent UI blocking.

#### Requirements
- Dedicated worker(s) for frame decoding
- Queue system for frame requests
- Memory management for decoded frames
- Cancellation support for seek operations
- Multiple worker pool for parallel decoding

#### UI/UX Specifications
- Invisible to user (background improvement)
- Loading indicator if decode behind playback
- Memory usage indicator (optional)

#### Technical Notes
- Use transferable objects for frame data
- Implement producer-consumer queue
- Worker pool size based on hardware
- Priority queue for visible frames

#### Test Cases
- [ ] WORKER-001: Frames decode in worker
- [ ] WORKER-002: Main thread remains responsive
- [ ] WORKER-003: Seek cancels pending decodes
- [ ] WORKER-004: Memory stays bounded
- [ ] WORKER-005: Multiple workers parallelize

#### Corner Cases
- Worker crashes (graceful recovery)
- Very high frame rate playback
- Low memory situations
- Single-threaded environments

---

### 9.2 GPU Texture Caching

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** GPU-accelerated playback

#### Description
Cache decoded frames as GPU textures for faster rendering.

#### Requirements
- Upload decoded frames to GPU textures
- LRU cache for texture management
- Configurable cache size
- Texture reuse to avoid allocation

#### UI/UX Specifications
- Cache size setting in preferences
- GPU memory usage display (optional)

#### Technical Notes
- Use WebGL texture objects
- Texture pool with reuse
- LRU eviction when full
- Handle context loss gracefully

#### Test Cases
- [ ] GPU-001: Frames cached as textures
- [ ] GPU-002: LRU eviction works
- [ ] GPU-003: Texture reuse reduces allocation
- [ ] GPU-004: Context loss recovers cache
- [ ] GPU-005: Cache size respected

#### Corner Cases
- GPU memory limits
- Context loss during playback
- Very large frames (4K+)

---

### 9.3 Lazy Loading for Long Sequences

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** Efficient sequence handling

#### Description
Load frames on-demand for very long sequences instead of all at once.

#### Requirements
- Only load frames near current position
- Preload frames in playback direction
- Unload distant frames to save memory
- Background loading with priority queue

#### UI/UX Specifications
- Invisible to user (seamless playback)
- Loading indicator for distant jumps
- Cache status in timeline (optional)

#### Technical Notes
- Define "active range" around playhead
- Preload window size configurable
- Priority: current > soon > far
- Cancel loads outside active range on seek

#### Test Cases
- [ ] LAZY-001: Only nearby frames in memory
- [ ] LAZY-002: Preloading in play direction
- [ ] LAZY-003: Distant frames unloaded
- [ ] LAZY-004: Seek cancels irrelevant loads
- [ ] LAZY-005: Memory usage bounded

#### Corner Cases
- Very fast seeking
- Slow storage/network
- Random access patterns

---

## 10. UI/UX Improvements

### 10.1 Customizable Layout

**Priority:** MEDIUM
**Complexity:** High
**Reference:** Dockable panels (DaVinci, Nuke)

#### Description
Allow users to arrange panels and create custom workspace layouts.

#### Requirements
- Panels can be docked, floated, or tabbed
- Save/load workspace layouts
- Preset workspaces (Color, Review, Editorial)
- Resize panel boundaries

#### UI/UX Specifications
- Drag panel headers to rearrange
- Drop zones highlight when dragging
- Tab groups for multiple panels in same area
- Layout menu for presets

#### Technical Notes
- Panel state: docked position, size, visibility
- Serialize layout to JSON
- Handle window resize gracefully
- Support multiple monitors (future)

#### Test Cases
- [ ] LAYOUT-001: Panels dock to edges
- [ ] LAYOUT-002: Tab groups work
- [ ] LAYOUT-003: Layouts save/load
- [ ] LAYOUT-004: Presets switch layout
- [ ] LAYOUT-005: Window resize adjusts panels

#### Corner Cases
- Very small window (minimum sizes)
- Missing panels on load
- Corrupted layout data

---

### 10.2 Dark/Light Theme Options

**Priority:** LOW
**Complexity:** Low
**Reference:** System theme support

#### Description
Support for dark and light color themes with system preference detection.

#### Requirements
- Dark theme (current default)
- Light theme option
- Follow system preference option
- Consistent styling across all components

#### UI/UX Specifications
- Theme selector in settings
- "Auto" option for system preference
- Smooth transition between themes
- Consistent contrast ratios

#### Technical Notes
- CSS custom properties for theme colors
- Detect prefers-color-scheme
- Store preference in localStorage
- Update all component colors

#### Test Cases
- [x] THEME-001: Theme control button visible in header bar
- [x] THEME-002: Clicking theme button opens dropdown
- [x] THEME-003: Theme dropdown has auto, dark, and light options
- [x] THEME-004: Selecting light theme changes resolved theme
- [x] THEME-005: Selecting dark theme changes resolved theme
- [x] THEME-006: Theme CSS custom properties update on theme change
- [x] THEME-007: Closing dropdown by clicking outside works
- [x] THEME-008: Theme selection persists button label
- [x] THEME-009: Shift+T keyboard shortcut cycles theme ✓
- [x] THEME-010: Shift+T cycles through all theme modes ✓

#### Corner Cases
- System preference changes during session
- Components with inline styles
- Images/icons in wrong theme

---

### 10.3 Full Keyboard Navigation

**Priority:** MEDIUM
**Complexity:** Medium
**Reference:** Accessibility standards

#### Description
Full keyboard navigation support for all UI elements.

#### Requirements
- Tab navigation between controls
- Arrow keys within control groups
- Enter/Space to activate
- Escape to close/cancel
- Focus indicators visible

#### UI/UX Specifications
- Clear focus outlines
- Logical tab order
- Skip links for main areas
- Screen reader labels

#### Technical Notes
- tabindex on interactive elements
- aria-label for non-text controls
- Focus management for modals
- Keyboard trap prevention

#### Test Cases
- [ ] KEY-001: Tab moves through controls
- [ ] KEY-002: Enter activates buttons
- [ ] KEY-003: Escape closes modals
- [ ] KEY-004: Focus visible at all times
- [ ] KEY-005: Screen reader accessible

#### Corner Cases
- Custom controls (sliders, wheels)
- Canvas-based UI elements
- Dynamic content updates

---

### 10.4 Undo/Redo History Panel

**Priority:** MEDIUM
**Complexity:** Low
**Reference:** Photoshop History panel

#### Description
Visual panel showing undo/redo history with ability to jump to any state.

#### Requirements
- List of all actions with timestamps
- Click to revert to any state
- Current state highlighted
- Clear history option
- Branch handling (optional)

#### UI/UX Specifications
- Collapsible panel
- Action names (e.g., "Adjust Exposure")
- Time since action
- Current state marker
- Dimmed future states

#### Technical Notes
- Hook into existing undo system
- Store action descriptions
- Snapshot or command pattern
- Limit history length to prevent memory issues

#### Test Cases
- [x] HIST-001: History panel hidden by default ✅
- [x] HIST-002: Toggle button shows/hides panel ✅
- [x] HIST-003: Keyboard shortcut toggles panel ✅
- [x] HIST-004: Entries appear after actions ✅
- [x] HIST-005: Clear history removes entries ✅
- [x] HIST-006: Close button hides panel ✅
- [x] HIST-007: Undo updates current index ✅
- [x] HIST-008: Jump navigates to specific entry ✅

#### Corner Cases
- Very long editing sessions
- Actions that can't be undone
- Memory pressure from snapshots

---

### 10.5 Floating Info Panel

**Priority:** LOW
**Complexity:** Low
**Reference:** Metadata overlays

#### Description
Configurable info overlay showing file metadata, frame info, and color values.

#### Requirements
- Display filename, resolution, bit depth
- Frame number, timecode, duration
- Color values at cursor position
- Configurable fields
- Multiple positions (corners)

#### UI/UX Specifications
- Semi-transparent background
- Configurable position
- Toggle visibility
- Choose which fields to show

#### Technical Notes
- Render as overlay on viewer
- Update on frame change
- Cursor position tracking for color values

#### Test Cases
- [x] INFO-001: Panel disabled by default ✅
- [x] INFO-002: Toggle button shows/hides panel ✅
- [x] INFO-003: Keyboard shortcut toggles panel ✅
- [x] INFO-004: Filename displays when enabled ✅
- [x] INFO-005: Resolution displays correctly ✅
- [x] INFO-006: Frame info displays ✅
- [x] INFO-007: FPS displays ✅
- [x] INFO-008: Updates on frame change ✅
- [x] INFO-009: DOM element visible when enabled ✅
- [x] INFO-010: Default position top-left ✅
- [x] INFO-011: Shows cursor color when hovering over viewer ✅
- [x] INFO-012: Cursor color updates when mouse moves over viewer ✅
- [x] INFO-013: Cursor color clears when mouse leaves viewer ✅

---

## Implementation Priority Summary

### Phase 1 - High Priority (Foundation)
1. ✅ Lift/Gamma/Gain Color Wheels (1.1)
2. ✅ Highlight/Shadow Recovery (1.2)
3. ✅ HSL Qualifier (1.5)
4. ✅ False Color Display (2.3)
5. ✅ Pixel Probe (2.5)
6. ✅ Shape Tools (5.1)
7. ✅ Safe Areas / Guides (6.3)
8. ✅ Timecode Display (4.1)
9. 3D LUT Support (1.7) - NEW
10. ✅ A/B Wipe Compare (3.3)
11. EXR Support (7.1)
12. Web Worker Frame Decoding (9.1)
13. ✅ Session Auto-Save (8.1)

### Phase 2 - Medium Priority (Enhancement)
1. ✅ Vibrance Control (1.3)
2. ✅ Clarity/Local Contrast (1.4)
3. Color Space Conversion (1.6)
4. ✅ Parade Scope (2.1)
5. ✅ Zebra Stripes (2.4)
6. Split Screen Compare (3.1)
7. Onion Skin (3.2)
8. Timeline Thumbnails (4.2)
9. Markers with Notes UI (4.3) - partial, API done
10. ✅ Playback Speed Control (4.4)
11. Audio Waveform Display (4.5) - NEW
12. Annotation Export (5.4) - NEW
13. Perspective Correction (6.1)
14. DPX Support (7.2)
15. OTIO Import (7.4)
16. Session Version History (8.2) - NEW
17. Multi-Clip Playlist (8.3) - NEW
18. GPU Texture Caching (9.2)
19. Lazy Loading (9.3)
20. Customizable Layout (10.1)
21. Full Keyboard Navigation (10.3)
22. ✅ Undo/Redo History Panel (10.4)

### Phase 3 - Lower Priority (Polish)
1. Film Emulation (1.8)
2. ✅ RGB Overlay Waveform (2.2)
3. ✅ Histogram Clipping Indicators (2.6)
4. ✅ Difference Matte (3.4)
5. ✅ Frame Caching Visualization (4.6)
6. ✅ Spotlight Tool (5.2)
7. ✅ Text Annotations Enhancement (5.3)
8. Comparison Annotations (5.5)
9. Stabilization Preview (6.2)
10. Deinterlace Preview (6.4)
11. RAW Image Preview (7.3)
12. ✅ Dark/Light Theme (10.2)
13. ✅ Floating Info Panel (10.5)

---

## Contributing

When implementing features from this list:

1. **Create a branch** named `feature/{feature-id}` (e.g., `feature/color-wheels`)
2. **Follow existing patterns** in the codebase
3. **Add unit tests** for core logic
4. **Add e2e tests** following the test cases listed
5. **Update documentation** including this file
6. **Consider accessibility** for all UI components
7. **Optimize for performance** especially for real-time features

---

*Last updated: 2026-01-21*
