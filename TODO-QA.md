# OpenRV Web - QA Test Plan

This document describes all features in the application with their test cases for both unit testing (Jest) and integration/E2E testing (Playwright).

---

## Test Environment Setup

### Jest (Unit Tests)
```bash
npm install --save-dev jest @types/jest ts-jest jest-environment-jsdom
```

### Playwright (Integration/E2E Tests)
```bash
npm install --save-dev @playwright/test
npx playwright install
```

### Test File Conventions
- Unit tests: `src/**/*.test.ts` or `src/**/*.spec.ts`
- Integration tests: `e2e/**/*.spec.ts`
- Test utilities: `test/utils/`

---

## 1. Session Management

### Feature Description
The `Session` class (`src/core/session/Session.ts`) manages media playback state including current frame, in/out points, loop modes, volume, and media sources.

### Unit Tests (Jest)

#### File: `src/core/session/Session.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| SES-001 | `currentFrame` setter clamps values within valid range | Frame clamped between 1 and source duration |
| SES-002 | `currentFrame` setter rounds fractional values | `session.currentFrame = 5.7` results in frame 6 |
| SES-003 | Setting `currentFrame` emits `frameChanged` event | Event fired with new frame number |
| SES-004 | `inPoint` cannot exceed `outPoint` | Setting invalid in point is rejected or clamped |
| SES-005 | `outPoint` cannot be less than `inPoint` | Setting invalid out point is rejected or clamped |
| SES-006 | `fps` is clamped between 1 and 120 | `session.fps = 999` results in fps = 120 |
| SES-007 | `loopMode` cycles through 'once', 'loop', 'pingpong' | Each mode is settable and emits event |
| SES-008 | `volume` is clamped between 0 and 1 | `session.volume = 1.5` results in volume = 1 |
| SES-009 | `toggleMute()` toggles muted state | `muted` flips between true/false |
| SES-010 | `play()` sets `isPlaying` to true | `session.isPlaying === true` after play() |
| SES-011 | `pause()` sets `isPlaying` to false | `session.isPlaying === false` after pause() |
| SES-012 | `togglePlayback()` toggles play/pause state | State alternates on each call |
| SES-013 | `goToFrame()` updates currentFrame | Frame changes to specified value |
| SES-014 | `stepForward()` advances by 1 frame and pauses | Frame increments, isPlaying = false |
| SES-015 | `stepBackward()` decreases by 1 frame and pauses | Frame decrements, isPlaying = false |
| SES-016 | `goToStart()` sets frame to inPoint | currentFrame equals inPoint |
| SES-017 | `goToEnd()` sets frame to outPoint | currentFrame equals outPoint |
| SES-018 | `setInPoint()` updates inPoint and emits event | inPoint changes, event fired |
| SES-019 | `setOutPoint()` updates outPoint and emits event | outPoint changes, event fired |
| SES-020 | `clearInOut()` resets to full duration | inPoint = 1, outPoint = duration |
| SES-021 | `addMark()` adds frame to marks set | marks.has(frame) === true |
| SES-022 | `removeMark()` removes frame from marks set | marks.has(frame) === false |
| SES-023 | `toggleMark()` toggles mark presence | Mark added if absent, removed if present |
| SES-024 | `clearMarks()` empties all marks | marks.size === 0 |
| SES-025 | Loop mode 'loop' wraps at outPoint to inPoint | Frame loops correctly |
| SES-026 | Loop mode 'pingpong' reverses direction at bounds | Direction changes at in/out points |
| SES-027 | Loop mode 'once' stops at outPoint | isPlaying = false at end |
| SES-028 | `advanceFrame()` respects playDirection | Negative direction moves backward |

### Integration Tests (Playwright)

#### File: `e2e/session.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| SES-E01 | Load image and verify frame count | 1. Drop image file 2. Check timeline | Duration = 1, frame = 1 |
| SES-E02 | Load video and verify duration | 1. Drop MP4 file 2. Check timeline | Duration matches video length |
| SES-E03 | Playback starts and stops | 1. Load video 2. Click play 3. Click pause | Video plays then pauses |
| SES-E04 | Timeline scrubbing updates frame | 1. Load video 2. Drag timeline scrubber | Frame number updates in real-time |
| SES-E05 | Volume slider changes audio | 1. Load video with audio 2. Drag volume slider | Audio volume changes |
| SES-E06 | Mute button toggles audio | 1. Load video 2. Click mute | Audio mutes/unmutes |

---

## 2. Color Adjustments

### Feature Description
Color controls (`src/ui/components/ColorControls.ts`) provide exposure, gamma, saturation, contrast, brightness, and color temperature adjustments.

### Unit Tests (Jest)

#### File: `src/color/ColorAdjustments.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| COL-001 | Exposure adjustment scales pixel values | exposure=1 doubles brightness |
| COL-002 | Gamma adjustment applies power curve | gamma=2.2 applies correct curve |
| COL-003 | Saturation=0 produces grayscale | All pixels have equal R, G, B |
| COL-004 | Saturation=2 increases color intensity | Colors more vibrant |
| COL-005 | Contrast increases difference from midpoint | Darks darker, lights lighter |
| COL-006 | Brightness adds offset to all channels | All values shifted by amount |
| COL-007 | Temperature shift toward warm (positive) | Image tinted orange/yellow |
| COL-008 | Temperature shift toward cool (negative) | Image tinted blue |
| COL-009 | Tint shift toward magenta (positive) | Image has magenta cast |
| COL-010 | Tint shift toward green (negative) | Image has green cast |
| COL-011 | Reset returns all values to defaults | All adjustments = neutral values |
| COL-012 | Adjustments clamp output to 0-255 | No overflow or underflow |

### Integration Tests (Playwright)

#### File: `e2e/color-controls.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| COL-E01 | Exposure slider updates image | 1. Load image 2. Drag exposure slider | Image brightness changes visually |
| COL-E02 | Reset button restores defaults | 1. Adjust multiple controls 2. Click reset | All sliders return to center |
| COL-E03 | Color tab activates controls | 1. Click Color tab | Color controls panel visible |

---

## 3. ASC CDL (Color Decision List)

### Feature Description
CDL implementation (`src/color/CDL.ts`) provides industry-standard slope, offset, power, and saturation controls per RGB channel.

### Unit Tests (Jest)

#### File: `src/color/CDL.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| CDL-001 | Default CDL values produce no change | `isDefaultCDL(DEFAULT_CDL) === true` |
| CDL-002 | Slope multiplies input value | slope=2, input=128 → output=255 (clamped) |
| CDL-003 | Offset adds to input value | offset=0.1, input=0 → output≈25 |
| CDL-004 | Power applies gamma curve | power=0.5 brightens midtones |
| CDL-005 | Saturation=0 desaturates completely | Output is grayscale |
| CDL-006 | Per-channel slope affects only that channel | Red slope only affects red |
| CDL-007 | `applyCDL()` combines all operations | Full SOP+Sat pipeline works |
| CDL-008 | `applyCDLToImageData()` processes all pixels | All pixels transformed |
| CDL-009 | CDL order is Slope→Offset→Power→Saturation | Order matches ASC spec |
| CDL-010 | `parseCDLXML()` parses valid .cdl file | Returns correct CDLValues |
| CDL-011 | `parseCDLXML()` returns null for invalid XML | Handles malformed input |
| CDL-012 | `exportCDLXML()` produces valid XML | Output parseable by parseCDLXML |
| CDL-013 | Round-trip: export then parse returns same values | Values match within tolerance |
| CDL-014 | Negative values clamp to 0 before power | No NaN from negative^fractional |
| CDL-015 | Rec.709 luminance weights used for saturation | Luma = 0.2126R + 0.7152G + 0.0722B |

### Integration Tests (Playwright)

#### File: `e2e/cdl.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| CDL-E01 | Slope slider changes image | 1. Open Color tab 2. Drag red slope | Red channel intensity changes |
| CDL-E02 | Import .cdl file applies values | 1. Click import 2. Select .cdl file | Sliders update, image changes |
| CDL-E03 | Export .cdl file downloads | 1. Adjust CDL 2. Click export | File downloads with correct values |
| CDL-E04 | Link RGB toggle affects all channels | 1. Enable link 2. Drag one slider | All three channels change together |

---

## 4. 3D LUT Support

### Feature Description
LUT loader (`src/color/LUTLoader.ts`) and WebGL processor (`src/color/WebGLLUT.ts`) apply .cube format 3D lookup tables.

### Unit Tests (Jest)

#### File: `src/color/LUTLoader.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| LUT-001 | Parse valid .cube file | Returns LUT3D with correct size |
| LUT-002 | Parse .cube with TITLE | Title extracted correctly |
| LUT-003 | Parse .cube with DOMAIN_MIN/MAX | Domain values parsed |
| LUT-004 | Parse .cube with comments | Comments ignored |
| LUT-005 | Parse .cube with Windows line endings | Handles \r\n correctly |
| LUT-006 | Reject .cube without LUT_3D_SIZE | Throws descriptive error |
| LUT-007 | Reject .cube with wrong data count | Throws error with expected vs actual |
| LUT-008 | `isLUT3D()` identifies 3D LUTs | Returns true for valid LUT3D |
| LUT-009 | `applyLUT3D()` interpolates correctly | Trilinear interpolation accurate |
| LUT-010 | `applyLUT3D()` clamps out-of-domain inputs | Values outside 0-1 handled |
| LUT-011 | Identity LUT produces no change | Output equals input |
| LUT-012 | `createLUTTexture()` creates WebGL texture | Returns valid WebGLTexture |

### Integration Tests (Playwright)

#### File: `e2e/lut.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| LUT-E01 | Load .cube file via UI | 1. Click LUT button 2. Select .cube file | Image color transforms |
| LUT-E02 | LUT intensity slider works | 1. Load LUT 2. Adjust intensity | Effect strength changes |
| LUT-E03 | Clear LUT removes effect | 1. Load LUT 2. Click clear | Image returns to original |

---

## 5. Blend Modes & Compositing

### Feature Description
Blend modes (`src/composite/BlendModes.ts`) implement standard compositing operations for layered images.

### Unit Tests (Jest)

#### File: `src/composite/BlendModes.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| BLD-001 | Normal mode replaces base with top | Output equals top layer |
| BLD-002 | Add mode sums values (clamped) | 128+128=255 (clamped) |
| BLD-003 | Multiply mode darkens | 128*128/255≈64 |
| BLD-004 | Screen mode lightens | 1-(1-a)(1-b) formula |
| BLD-005 | Overlay combines multiply/screen | Dark areas multiply, light screen |
| BLD-006 | Difference shows absolute difference | \|a-b\| for each channel |
| BLD-007 | Exclusion similar to difference, softer | a+b-2ab formula |
| BLD-008 | Opacity=0 shows only base | Top layer invisible |
| BLD-009 | Opacity=0.5 blends 50/50 | Half transparency |
| BLD-010 | Alpha compositing (Porter-Duff over) | Correct alpha math |
| BLD-011 | `compositeImageData()` requires same dimensions | Throws if sizes differ |
| BLD-012 | `compositeMultipleLayers()` stacks correctly | Bottom to top order |
| BLD-013 | Invisible layers skipped | visible=false has no effect |
| BLD-014 | `resizeImageData()` scales correctly | Nearest-neighbor resize works |

### Integration Tests (Playwright)

#### File: `e2e/blend-modes.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| BLD-E01 | Stack mode dropdown changes composite | 1. Load 2 images as stack 2. Change blend mode | Visual difference in composite |
| BLD-E02 | Layer opacity slider works | 1. Stack images 2. Adjust layer opacity | Transparency changes |

---

## 6. Lens Distortion

### Feature Description
Lens distortion correction (`src/transform/LensDistortion.ts`) implements Brown-Conrady model for barrel/pincushion correction.

### Unit Tests (Jest)

#### File: `src/transform/LensDistortion.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| LNS-001 | Default params produce no change | `isDefaultLensParams()` returns true |
| LNS-002 | k1 negative creates barrel distortion | Center magnified, edges compressed |
| LNS-003 | k1 positive creates pincushion distortion | Center compressed, edges magnified |
| LNS-004 | k2 adds higher-order correction | Secondary radial effect applied |
| LNS-005 | centerX/Y offset shifts distortion center | Distortion not centered on image |
| LNS-006 | scale zooms to hide black edges | Output cropped/scaled |
| LNS-007 | Bilinear interpolation smooths output | No pixelation artifacts |
| LNS-008 | Out-of-bounds pixels are black | Edge pixels handled |
| LNS-009 | `generateDistortionGrid()` creates preview lines | Lines array populated |
| LNS-010 | `applyLensDistortionToCanvas()` modifies canvas | Canvas content changes |

### Integration Tests (Playwright)

#### File: `e2e/lens-distortion.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| LNS-E01 | K1 slider curves image | 1. Load image 2. Adjust K1 slider | Visible barrel/pincushion effect |
| LNS-E02 | Grid preview shows distortion | 1. Enable grid overlay 2. Adjust params | Grid lines curve accordingly |
| LNS-E03 | Reset restores original | 1. Apply distortion 2. Click reset | Image returns to original |

---

## 7. Crop Tool

### Feature Description
Crop control (`src/ui/components/CropControl.ts`) provides region selection with aspect ratio constraints.

### Unit Tests (Jest)

#### File: `src/ui/components/CropControl.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| CRP-001 | Free crop allows any aspect ratio | No constraint on dimensions |
| CRP-002 | 16:9 aspect ratio maintains proportion | Width/height ratio = 16/9 |
| CRP-003 | 1:1 aspect ratio creates square | Width equals height |
| CRP-004 | Custom aspect ratio applied correctly | User-defined ratio enforced |
| CRP-005 | Crop region clamps to image bounds | Cannot exceed image dimensions |
| CRP-006 | Crop enabled state toggles | enabled flag flips |
| CRP-007 | Rule of thirds guide positions correct | Lines at 1/3 and 2/3 positions |

### Integration Tests (Playwright)

#### File: `e2e/crop.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| CRP-E01 | Drag crop handles resizes region | 1. Enable crop 2. Drag corner handle | Crop region changes size |
| CRP-E02 | Aspect ratio dropdown constrains crop | 1. Select 16:9 2. Resize crop | Ratio maintained |
| CRP-E03 | Apply crop updates image | 1. Set crop region 2. Export | Exported image is cropped |

---

## 8. Transform (Rotation/Flip)

### Feature Description
Transform control (`src/ui/components/TransformControl.ts`) provides rotation and flip operations.

### Unit Tests (Jest)

#### File: `src/ui/components/TransformControl.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| TRN-001 | Rotation 0° produces no change | Image unchanged |
| TRN-002 | Rotation 90° rotates clockwise | Width/height swapped, pixels rotated |
| TRN-003 | Rotation 180° inverts image | Upside down |
| TRN-004 | Rotation 270° rotates counter-clockwise | Equivalent to -90° |
| TRN-005 | Flip horizontal mirrors X axis | Left becomes right |
| TRN-006 | Flip vertical mirrors Y axis | Top becomes bottom |
| TRN-007 | Combined rotation + flip applies both | Operations compose correctly |
| TRN-008 | Reset clears all transforms | Rotation=0, flip=false |

### Integration Tests (Playwright)

#### File: `e2e/transform.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| TRN-E01 | Rotate button rotates image | 1. Load image 2. Click rotate | Image rotates 90° |
| TRN-E02 | Flip H button mirrors horizontally | 1. Load image 2. Click flip H | Image mirrored |
| TRN-E03 | Multiple transforms combine | 1. Rotate 2. Flip | Both effects visible |

---

## 9. Filters (Blur/Sharpen)

### Feature Description
Filter control (`src/ui/components/FilterControl.ts`) provides blur and sharpen image filters.

### Unit Tests (Jest)

#### File: `src/filters/Filters.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| FLT-001 | Blur radius 0 produces no change | Image unchanged |
| FLT-002 | Blur radius increases smoothing | Higher radius = more blur |
| FLT-003 | Sharpen amount 0 produces no change | Image unchanged |
| FLT-004 | Sharpen enhances edges | Edge contrast increased |
| FLT-005 | Over-sharpening creates halos | Expected artifact at extreme values |
| FLT-006 | Blur preserves image dimensions | Output size equals input size |

### Integration Tests (Playwright)

#### File: `e2e/filters.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| FLT-E01 | Blur slider softens image | 1. Load image 2. Increase blur | Image becomes softer |
| FLT-E02 | Sharpen slider enhances detail | 1. Load image 2. Increase sharpen | Details more pronounced |

---

## 10. Wipe Comparison

### Feature Description
Wipe control (`src/ui/components/WipeControl.ts`) provides split-screen comparison between sources.

### Unit Tests (Jest)

#### File: `src/ui/components/WipeControl.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| WPE-001 | Wipe mode 'none' shows full image | No split |
| WPE-002 | Wipe mode 'horizontal' splits left/right | Vertical line divides |
| WPE-003 | Wipe mode 'vertical' splits top/bottom | Horizontal line divides |
| WPE-004 | Wipe position 0.5 splits in middle | 50/50 split |
| WPE-005 | Wipe position 0 shows only B side | Full second image |
| WPE-006 | Wipe position 1 shows only A side | Full first image |
| WPE-007 | Swap A/B switches sources | Sources reversed |

### Integration Tests (Playwright)

#### File: `e2e/wipe.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| WPE-E01 | Enable wipe shows split view | 1. Load 2 sources 2. Enable wipe | Split visible |
| WPE-E02 | Drag wipe line moves position | 1. Enable wipe 2. Drag divider | Split position changes |
| WPE-E03 | Keyboard W cycles wipe modes | 1. Press W repeatedly | Mode cycles none→h→v→none |

---

## 11. Paint/Annotation System

### Feature Description
Paint engine (`src/paint/PaintEngine.ts`) and renderer (`src/paint/PaintRenderer.ts`) provide frame-accurate drawing annotations.

### Unit Tests (Jest)

#### File: `src/paint/PaintEngine.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| PNT-001 | `beginStroke()` creates new stroke | currentStroke not null |
| PNT-002 | `continueStroke()` adds points | points array grows |
| PNT-003 | `endStroke()` finalizes and stores | Stroke added to annotations |
| PNT-004 | `endStroke()` returns null if no stroke | Handles edge case |
| PNT-005 | `addText()` creates text annotation | TextAnnotation stored |
| PNT-006 | `removeAnnotation()` deletes by ID | Annotation removed from map |
| PNT-007 | `clearFrame()` removes all on frame | Frame's annotations empty |
| PNT-008 | `clearAll()` empties everything | All annotations cleared |
| PNT-009 | `undo()` reverses last action | Annotation removed |
| PNT-010 | `redo()` restores undone action | Annotation restored |
| PNT-011 | Undo stack respects max depth | Old items dropped |
| PNT-012 | `getAnnotationsForFrame()` returns correct frame | Only matching frame |
| PNT-013 | Ghost mode shows nearby frames | Adjacent frames visible |
| PNT-014 | Ghost opacity decreases with distance | Farther frames more transparent |
| PNT-015 | `toJSON()` serializes state | Valid JSON output |
| PNT-016 | `loadFromAnnotations()` restores state | Annotations restored correctly |
| PNT-017 | Eraser mode sets StrokeMode.Erase | Mode set correctly |
| PNT-018 | Pen tool sets StrokeMode.Draw | Mode set correctly |
| PNT-019 | Color setter stores RGBA array | Color stored correctly |
| PNT-020 | Width clamped between 1 and 100 | Bounds enforced |

#### File: `src/paint/PaintRenderer.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| RND-001 | Pen stroke renders as path | Canvas path drawn |
| RND-002 | Text annotation renders text | Text visible on canvas |
| RND-003 | Brush types render differently | Visual distinction |
| RND-004 | Pressure affects stroke width | Variable width along stroke |
| RND-005 | Opacity affects stroke transparency | Alpha applied |

### Integration Tests (Playwright)

#### File: `e2e/paint.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| PNT-E01 | Draw stroke on image | 1. Select pen 2. Draw on viewer | Stroke visible |
| PNT-E02 | Undo removes last stroke | 1. Draw stroke 2. Press Z | Stroke disappears |
| PNT-E03 | Redo restores stroke | 1. Undo 2. Press Shift+Z | Stroke reappears |
| PNT-E04 | Change color affects new strokes | 1. Pick color 2. Draw | New stroke uses new color |
| PNT-E05 | Annotations persist per frame | 1. Draw on frame 1 2. Go to frame 2 3. Return | Annotation still on frame 1 |
| PNT-E06 | Eraser removes parts of strokes | 1. Draw stroke 2. Erase over it | Stroke partially removed |
| PNT-E07 | Text tool adds text | 1. Select text tool 2. Click and type | Text appears |

---

## 12. Timeline

### Feature Description
Timeline component (`src/ui/components/Timeline.ts`) displays frame position, in/out points, markers, and annotations.

### Unit Tests (Jest)

#### File: `src/ui/components/Timeline.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| TML-001 | Timeline renders without errors | No exceptions thrown |
| TML-002 | Frame numbers display correctly | 1 to duration shown |
| TML-003 | Playhead position matches currentFrame | Visual position correct |
| TML-004 | In/out range highlighted | Range visually distinct |
| TML-005 | Markers render at correct positions | Markers visible at frame |
| TML-006 | Annotation indicators show | Yellow markers for annotated frames |
| TML-007 | Resize updates canvas dimensions | Canvas scales with container |
| TML-008 | DPR scaling applied correctly | High-DPI displays sharp |

### Integration Tests (Playwright)

#### File: `e2e/timeline.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| TML-E01 | Click timeline seeks to frame | 1. Load video 2. Click on timeline | Frame jumps to click position |
| TML-E02 | Drag timeline scrubs playback | 1. Load video 2. Drag on timeline | Frame updates during drag |
| TML-E03 | Double-click jumps to nearest annotation | 1. Add annotation 2. Double-click | Frame jumps to annotated frame |

---

## 13. Keyboard Shortcuts

### Feature Description
Keyboard handling in `App.ts` provides shortcuts for all major functions.

### Integration Tests (Playwright)

#### File: `e2e/keyboard.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| KEY-E01 | Space toggles playback | 1. Load video 2. Press Space | Play/pause toggles |
| KEY-E02 | Left arrow steps backward | 1. Load media 2. Press Left | Frame decrements |
| KEY-E03 | Right arrow steps forward | 1. Load media 2. Press Right | Frame increments |
| KEY-E04 | Home goes to start | 1. Load media 2. Press Home | Frame = inPoint |
| KEY-E05 | End goes to end | 1. Load media 2. Press End | Frame = outPoint |
| KEY-E06 | I sets in point | 1. Navigate to frame 2. Press I | inPoint = currentFrame |
| KEY-E07 | O sets out point | 1. Navigate to frame 2. Press O | outPoint = currentFrame |
| KEY-E08 | L cycles loop mode | 1. Press L repeatedly | Mode cycles |
| KEY-E09 | F fits to window | 1. Zoom in 2. Press F | Zoom reset to fit |
| KEY-E10 | Z triggers undo | 1. Make change 2. Press Z | Change undone |
| KEY-E11 | Shift+Z triggers redo | 1. Undo 2. Press Shift+Z | Change restored |
| KEY-E12 | 1-5 switch tabs | 1. Press 1-5 | Corresponding tab activates |
| KEY-E13 | P toggles paint mode | 1. Press P | Paint tool activates |
| KEY-E14 | V selects pan tool | 1. Press V | Pan/view tool selected |
| KEY-E15 | Escape exits current mode | 1. Enter paint mode 2. Press Escape | Mode exits |

---

## 14. File Operations

### Feature Description
File loading via drag-and-drop and file picker, supporting images, videos, and sequences.

### Integration Tests (Playwright)

#### File: `e2e/file-operations.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| FIL-E01 | Drag-drop single image | 1. Drag PNG onto viewer | Image displays |
| FIL-E02 | Drag-drop video file | 1. Drag MP4 onto viewer | Video loads, timeline shows duration |
| FIL-E03 | Drag-drop image sequence | 1. Drag numbered files | Sequence loads with all frames |
| FIL-E04 | File picker opens and loads | 1. Click folder icon 2. Select file | File loads |
| FIL-E05 | Invalid file shows error | 1. Drop unsupported file | Error message displayed |
| FIL-E06 | Load .rv session file | 1. Drop .rv file | Session reconstructed |

---

## 15. Export Functions

### Feature Description
Export controls (`src/ui/components/ExportControl.ts`) for frame and sequence export.

### Unit Tests (Jest)

#### File: `src/utils/FrameExporter.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| EXP-001 | Export PNG produces valid PNG | File has PNG magic bytes |
| EXP-002 | Export JPEG produces valid JPEG | File has JPEG magic bytes |
| EXP-003 | Export WebP produces valid WebP | File has WebP signature |
| EXP-004 | Quality setting affects file size | Higher quality = larger file |
| EXP-005 | Include annotations burns in strokes | Strokes visible in export |

### Integration Tests (Playwright)

#### File: `e2e/export.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| EXP-E01 | Export current frame | 1. Load image 2. Click export | File downloads |
| EXP-E02 | Copy to clipboard | 1. Load image 2. Click copy | Image in clipboard |
| EXP-E03 | Export sequence shows progress | 1. Load sequence 2. Export all | Progress indicator, files download |

---

## 16. Session Save/Load

### Feature Description
Session serialization (`src/core/session/SessionSerializer.ts`) saves and loads .orvproject files.

### Unit Tests (Jest)

#### File: `src/core/session/SessionSerializer.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| SER-001 | `toJSON()` includes all state | All properties serialized |
| SER-002 | `fromJSON()` restores all state | All properties restored |
| SER-003 | Round-trip preserves data | Save then load matches |
| SER-004 | Invalid JSON throws error | Proper error handling |
| SER-005 | Missing fields use defaults | Graceful degradation |
| SER-006 | Version mismatch handled | Migration or warning |

### Integration Tests (Playwright)

#### File: `e2e/session.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| SER-E01 | Save project downloads file | 1. Load media 2. Make adjustments 3. Save | .orvproject downloads |
| SER-E02 | Load project restores state | 1. Save project 2. Reload page 3. Load project | State fully restored |
| SER-E03 | Drag-drop .orvproject loads | 1. Drag .orvproject file | Project loaded |

---

## 17. GTO/RV Session Loading

### Feature Description
GTO graph loader (`src/core/session/GTOGraphLoader.ts`) reconstructs node graphs from RV session files.

### Unit Tests (Jest)

#### File: `src/core/session/GTOGraphLoader.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| GTO-001 | Parse valid GTO returns graph | Graph with nodes created |
| GTO-002 | Session info extracted | Name, fps, frame parsed |
| GTO-003 | RVFileSource nodes created | FileSourceNode in graph |
| GTO-004 | RVSequenceGroup creates sequence | SequenceGroupNode in graph |
| GTO-005 | Node connections established | Inputs/outputs connected |
| GTO-006 | Unknown protocols skipped silently | No error, node omitted |
| GTO-007 | Root/view node identified | rootNode set correctly |
| GTO-008 | CDL properties loaded | CDL values in node properties |
| GTO-009 | Transform properties loaded | Rotation, flip values |
| GTO-010 | Error handling for invalid GTO | Throws with message |

---

## 18. Node Graph System

### Feature Description
Core graph system (`src/core/graph/Graph.ts`) manages node connections and evaluation.

### Unit Tests (Jest)

#### File: `src/core/graph/Graph.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| GRP-001 | `addNode()` adds to graph | Node in graph.nodes |
| GRP-002 | `removeNode()` removes from graph | Node not in graph.nodes |
| GRP-003 | `connect()` establishes connection | Input/output linked |
| GRP-004 | `disconnect()` removes connection | Link removed |
| GRP-005 | Cycle detection prevents loops | Error thrown on cycle |
| GRP-006 | `evaluate()` processes DAG | Output computed |
| GRP-007 | Dirty propagation marks dependents | Downstream nodes dirty |
| GRP-008 | `setOutputNode()` sets root | outputNode set |

#### File: `src/core/graph/Property.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| PRP-001 | Property stores default value | defaultValue accessible |
| PRP-002 | `setValue()` updates value | getValue returns new value |
| PRP-003 | `reset()` restores default | Value equals defaultValue |
| PRP-004 | Property change emits signal | Signal fired on change |

---

## 19. Source Nodes

### Feature Description
Source nodes (`src/nodes/sources/`) load and provide media data.

### Unit Tests (Jest)

#### File: `src/nodes/sources/FileSourceNode.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| FSN-001 | `load()` loads image from URL | isReady() returns true |
| FSN-002 | `loadFile()` loads from File object | Image loaded |
| FSN-003 | `getElement()` returns image element | HTMLImageElement returned |
| FSN-004 | `process()` creates IPImage | IPImage with pixel data |
| FSN-005 | `dispose()` revokes blob URL | URL.revokeObjectURL called |
| FSN-006 | Metadata populated correctly | width, height, name set |

#### File: `src/nodes/sources/SequenceSourceNode.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| SSN-001 | `loadFiles()` creates sequence | frames array populated |
| SSN-002 | `getElement()` returns frame image | Correct frame returned |
| SSN-003 | `getFrameImage()` loads async | Promise resolves with image |
| SSN-004 | Preloading loads adjacent frames | Nearby frames cached |
| SSN-005 | `dispose()` releases all frames | Blob URLs revoked |

---

## 20. Group Nodes

### Feature Description
Group nodes (`src/nodes/groups/`) organize and composite multiple inputs.

### Unit Tests (Jest)

#### File: `src/nodes/groups/SequenceGroupNode.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| SGN-001 | `getActiveInputIndex()` returns correct index | Frame maps to input |
| SGN-002 | `getTotalDuration()` sums all inputs | Total equals sum |
| SGN-003 | Durations default to 1 if not set | 1 frame per input |
| SGN-004 | `getLocalFrame()` computes offset | Local frame correct |
| SGN-005 | Frame wrapping at sequence end | Loops correctly |
| SGN-006 | Division by zero handled | No NaN returned |

#### File: `src/nodes/groups/SwitchGroupNode.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| SWN-001 | `setActiveInput()` changes index | outputIndex updated |
| SWN-002 | Index clamped to valid range | No out-of-bounds |
| SWN-003 | Empty inputs handled | Returns 0, no error |
| SWN-004 | `next()` advances index | Index increments |
| SWN-005 | `previous()` decrements index | Index decrements |

#### File: `src/nodes/groups/StackGroupNode.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| STN-001 | Stack composites all inputs | All layers visible |
| STN-002 | Blend mode applies | Mode affects output |
| STN-003 | Layer visibility respected | Hidden layers skipped |

---

## 21. Audio/Waveform

### Feature Description
Waveform renderer (`src/audio/WaveformRenderer.ts`) displays audio visualization.

### Unit Tests (Jest)

#### File: `src/audio/WaveformRenderer.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| WAV-001 | `loadFromVideo()` extracts audio | Waveform data populated |
| WAV-002 | `getData()` returns waveform data | Float array returned |
| WAV-003 | `hasData()` indicates loaded state | True after load |
| WAV-004 | `clear()` resets state | hasData() returns false |
| WAV-005 | `render()` draws waveform | Canvas has content |

---

## 22. Viewer Component

### Feature Description
Main viewer (`src/ui/components/Viewer.ts`) renders media with all effects applied.

### Unit Tests (Jest)

#### File: `src/ui/components/Viewer.test.ts`

| Test ID | Test Case | Expected Result |
|---------|-----------|-----------------|
| VWR-001 | `resize()` updates canvas size | Canvas dimensions change |
| VWR-002 | `setZoom()` changes zoom level | Zoom applied |
| VWR-003 | `setPan()` offsets view | Pan offset applied |
| VWR-004 | `fitToWindow()` calculates fit zoom | Image fits in viewport |
| VWR-005 | Color adjustments applied in render | Pixels transformed |
| VWR-006 | CDL applied in render | CDL affects output |
| VWR-007 | LUT applied in render | LUT transforms colors |
| VWR-008 | Transforms applied | Rotation/flip visible |
| VWR-009 | Crop region applied | Only region rendered |
| VWR-010 | Paint overlay rendered | Annotations visible |
| VWR-011 | Wipe mode renders split | Both sources shown |

### Integration Tests (Playwright)

#### File: `e2e/viewer.spec.ts`

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| VWR-E01 | Scroll wheel zooms | 1. Load image 2. Scroll wheel | Zoom changes |
| VWR-E02 | Drag pans image | 1. Zoom in 2. Drag image | Image pans |
| VWR-E03 | Double-click fits to window | 1. Zoom in 2. Double-click | Zoom reset to fit |

---

## Test Coverage Goals

| Category | Unit Test Coverage | Integration Coverage |
|----------|-------------------|---------------------|
| Core (Session, Graph) | 90%+ | 80%+ |
| Color (CDL, LUT, Adjustments) | 95%+ | 70%+ |
| Transform (Lens, Crop, Rotate) | 90%+ | 70%+ |
| Paint (Engine, Renderer) | 85%+ | 80%+ |
| UI Components | 70%+ | 90%+ |
| File Operations | 80%+ | 95%+ |
| Node System | 90%+ | 60%+ |

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Tests
on: [push, pull_request]
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:unit

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

---

## Test Data Requirements

### Test Assets Directory: `test/fixtures/`

| File | Purpose |
|------|---------|
| `test-image.png` | 100x100 solid color test image |
| `test-gradient.png` | Gradient for color testing |
| `test-video.mp4` | 3 second video with audio |
| `test-sequence/frame_001.png` - `frame_010.png` | 10-frame sequence |
| `test.cube` | Simple identity 3D LUT |
| `test.cdl` | Sample CDL file |
| `test.rv` | Sample RV session file |
| `test.orvproject` | Sample project file |

---

## Running Tests

```bash
# Run all unit tests
npm run test:unit

# Run unit tests with coverage
npm run test:unit -- --coverage

# Run specific test file
npm run test:unit -- src/color/CDL.test.ts

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e -- --ui

# Run E2E tests for specific browser
npm run test:e2e -- --project=chromium
```
