# Arbitrary Angle Rotation

## Overview

Desktop OpenRV supports continuous mouse-scrubbed rotation to any angle. The web version currently limits rotation to discrete 90-degree steps (0, 90, 180, 270). This plan adds free rotation from 0 to 360 degrees with mouse-scrub interaction, precise angle input, snapping to common angles, a reset shortcut, and fit-to-window that respects the rotated bounding box.

The change touches the core type system, the vertex shader, the 2D canvas fallback path, the transform UI control, the fit-to-window calculation, session serialization, and export. It is a cross-cutting feature that must be coordinated across all rendering pipelines (WebGL HDR, WebGL SDR, Canvas 2D) and all consumers of the `Transform2D` type.

---

## Current State

### Type System

`Transform2D.rotation` is typed as the union literal `0 | 90 | 180 | 270` in `/src/core/types/transform.ts`:

```typescript
export interface Transform2D {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  scale: { x: number; y: number };
  translate: { x: number; y: number };
}
```

Every consumer that pattern-matches on rotation values (e.g., `if (rotation === 90 || rotation === 270)`) will need updating.

### Vertex Shader (WebGL Path)

`/src/render/shaders/viewer.vert.glsl` handles rotation via a `u_texRotation` integer uniform (0-3) with four hard-coded `if/else` branches that permute texture coordinates for 0, 90, 180, 270 degrees. No matrix math or arbitrary angle support exists.

```glsl
uniform int u_texRotation; // 0=0deg, 1=90degCW, 2=180deg, 3=270degCW
// ... four discrete if branches ...
```

### Renderer (`/src/render/Renderer.ts`)

- `_userRotation` is typed `0 | 90 | 180 | 270`.
- `setUserTransform(rotation, flipH, flipV)` accepts the same type.
- `renderImage()` combines video metadata rotation with user rotation via integer division by 90 and modular arithmetic: `(Math.round(videoRotation / 90) + Math.round(this._userRotation / 90)) % 4`.
- The quad is a full-screen clip-space quad with `u_offset` and `u_scale` uniforms controlling position, drawn via `gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)`.

### Canvas 2D Fallback (`/src/ui/components/ViewerRenderingUtils.ts`)

`drawWithTransform()` and `drawWithTransformFill()` use `ctx.rotate((rotation * Math.PI) / 180)` which already works for any angle. However, they special-case 90/270 to swap draw dimensions:

```typescript
if (rotation === 90 || rotation === 270) {
  drawWidth = displayHeight;
  drawHeight = displayWidth;
}
```

This must be generalized to arbitrary-angle bounding box computation.

### Effective Dimensions (`getEffectiveDimensions()`)

Only handles 90/270 dimension swapping. For arbitrary angles, the rotated bounding box is: `w' = |w*cos(theta)| + |h*sin(theta)|`, `h' = |w*sin(theta)| + |h*cos(theta)|`.

### UI Control (`/src/ui/components/TransformControl.ts`)

- `rotateRight()` and `rotateLeft()` cycle through a 4-element array `[0, 90, 180, 270]`.
- A text indicator shows the current angle with a degree symbol.
- No input field or mouse-drag rotation UI exists.

### Session Persistence (`/src/core/session/SessionGTOStore.ts`)

Stores rotation as a float in the GTO `transform.rotate` property. The GTO format already supports arbitrary float values, so serialization is already compatible. The restriction is only in the TypeScript type and UI.

### GTOSettingsParser (`/src/core/session/GTOSettingsParser.ts`)

Currently clamps the loaded rotation value to the nearest 90-degree multiple (lines ~403-411):

```typescript
const rotationOptions: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
let rotation: 0 | 90 | 180 | 270 = 0;
if (typeof rotationValue === 'number') {
  const snapped = Math.round(rotationValue / 90) * 90;
  if (rotationOptions.includes(snapped as 0 | 90 | 180 | 270)) {
    rotation = snapped as 0 | 90 | 180 | 270;
  }
}
```

This **must** be updated to accept arbitrary float values. Without this change, loading a session with `rotate: 37.5` would snap it to 0 and lose the saved rotation (data loss bug).

### ViewerInputHandler (`/src/ui/components/ViewerInputHandler.ts`)

Pan mode is triggered on single-pointer down when no paint/shape tool is active. There is no rotation gesture or modifier-key rotation mode.

---

## Proposed Architecture

### Design Principles

1. **Backward compatible** -- 90-degree step buttons remain; arbitrary angle is additive.
2. **Shader-based rotation** -- Rotate in the vertex shader via a 2x2 rotation matrix uniform, eliminating the 4-branch integer dispatch.
3. **Bounding-box aware layout** -- `getEffectiveDimensions()` computes the axis-aligned bounding box of the rotated image for fit-to-window and display layout.
4. **Snap-on-release** -- During mouse-scrub rotation, snapping to 0/45/90/135/180/225/270/315 degrees is applied only when the angle is within a configurable threshold (default 5 degrees), and only on pointer-up.
5. **Precision input** -- A numeric input field in the Transform panel allows typing an exact angle.
6. **Reset** -- The existing reset button already zeroes all transform state. Additionally, a double-click on the rotation scrub widget resets to 0.
7. **Out-of-bounds handling** -- Fragment shader discards or zeroes pixels for texture coordinates outside [0, 1] to prevent edge smearing or tiling artifacts at non-cardinal angles.

### Rotation Value Normalization

All internal rotation values are stored as a `number` in degrees, normalized to `[0, 360)`. Normalization helper:

```typescript
function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}
```

---

## Transform Pipeline

### Current Pipeline

```
Source image
  --> [Uncrop padding]
  --> [PAR correction]
  --> getEffectiveDimensions(w, h, rotation)  // swaps for 90/270 only
  --> calculateDisplayDimensions(effectiveW, effectiveH, container, zoom)
  --> Canvas 2D drawWithTransform() OR WebGL vertex shader u_texRotation
  --> Pixel effects (CPU or GPU)
  --> Overlays (crop, paint, watermark, safe areas)
```

### Proposed Pipeline

```
Source image
  --> [Uncrop padding]
  --> [PAR correction]
  --> getEffectiveDimensions(w, h, rotationDegrees)  // AABB of rotated rect
  --> calculateDisplayDimensions(effectiveW, effectiveH, container, zoom)
  --> WebGL: vertex shader with u_texRotationMatrix (mat2) + u_texFlip
            + fragment shader out-of-bounds discard for non-cardinal angles
      Canvas2D: ctx.rotate(radians) with AABB-based draw dimensions
  --> Pixel effects (CPU or GPU)
  --> Overlays (crop, paint, watermark, safe areas)
```

### Bounding Box Calculation

Replace the current 90/270 swap with a general AABB, including epsilon snapping for cardinal angles to avoid floating-point off-by-one pixel dimensions:

```typescript
export function getEffectiveDimensions(
  width: number,
  height: number,
  rotationDegrees: number
): { width: number; height: number } {
  const rad = (rotationDegrees * Math.PI) / 180;
  let absCos = Math.abs(Math.cos(rad));
  let absSin = Math.abs(Math.sin(rad));

  // Epsilon snap for cardinal angles: Math.cos(PI/2) is ~6.12e-17, not 0.
  // Without this, ceil() can produce off-by-one dimensions at 90/180/270.
  const EPSILON = 1e-10;
  if (absCos < EPSILON) absCos = 0;
  if (absSin < EPSILON) absSin = 0;
  if (Math.abs(absCos - 1) < EPSILON) absCos = 1;
  if (Math.abs(absSin - 1) < EPSILON) absSin = 1;

  return {
    width:  Math.ceil(width * absCos + height * absSin),
    height: Math.ceil(width * absSin + height * absCos),
  };
}
```

For exact 90-degree multiples, this yields the same results as the current implementation. The epsilon guard prevents `Math.ceil(1080 + 1.18e-13)` from incorrectly rounding up to 1081.

### Vertex Shader Changes

Replace the integer `u_texRotation` uniform with a `mat2` rotation matrix and keep the flip uniforms:

```glsl
// BEFORE:
uniform int u_texRotation;

// AFTER:
uniform mat2 u_texRotationMatrix; // 2x2 rotation matrix
```

The rotation is applied to texture coordinates centered at (0.5, 0.5):

```glsl
// Step 2: Apply rotation via matrix (replaces 4-branch if/else)
vec2 centered = tc - 0.5;
tc = u_texRotationMatrix * centered + 0.5;
```

### Fragment Shader Out-of-Bounds Check

For non-cardinal rotations, texture coordinates will exceed [0, 1]. Without handling this, `GL_CLAMP_TO_EDGE` will smear edge pixels into rotated corners, and `GL_REPEAT` will tile the image. Add a boundary check in the fragment shader:

```glsl
// After computing final texture coordinates (post-rotation):
if (v_texCoord.x < 0.0 || v_texCoord.x > 1.0 || v_texCoord.y < 0.0 || v_texCoord.y > 1.0) {
  fragColor = vec4(0.0); // transparent / background color
  return;
}
```

This ensures clean transparent (or background-colored) corners at non-cardinal angles.

### CPU-Side Matrix Construction

On the CPU side, the Renderer builds the matrix:

```typescript
const rad = -(rotationDegrees * Math.PI) / 180; // negative for CW in tex space
const cos = Math.cos(rad);
const sin = Math.sin(rad);
// mat2 is column-major in WebGL: [col0.x, col0.y, col1.x, col1.y]
this.displayShader.setUniformMatrix2fv('u_texRotationMatrix', [cos, sin, -sin, cos]);
```

**Important**: `ShaderProgram.ts` does not currently have a `setUniformMatrix2fv()` method. The generic `setUniform()` dispatches a length-4 `Float32Array` to `gl.uniform4fv()`, **not** `gl.uniformMatrix2fv()`. A dedicated `setUniformMatrix2fv()` method must be added, following the pattern of the existing `setUniformMatrix3()` and `setUniformMatrix4()` methods.

Video metadata rotation (integer multiples of 90) is combined additively with the user rotation before building the matrix.

### Canvas 2D Path Changes

`drawWithTransform()` in `ViewerRenderingUtils.ts` already calls `ctx.rotate()` with any angle. The dimension-swap logic changes from:

```typescript
if (rotation === 90 || rotation === 270) {
  drawWidth = displayHeight;
  drawHeight = displayWidth;
}
```

to drawing the source at its original dimensions (`sourceW x sourceH`) centered on the canvas, with `ctx.rotate()` handling the rotation, and the canvas sized to the AABB dimensions. The key is to scale so that the rotated result fits within the AABB-sized canvas:

```typescript
const { width: bbW, height: bbH } = getEffectiveDimensions(sourceW, sourceH, rotation);
// Scale source so rotated bounding box fits the display
const scaleX = displayWidth / bbW;
const scaleY = displayHeight / bbH;
const scale = Math.min(scaleX, scaleY);
// Draw source centered at origin (after translate + rotate), at its native aspect
const drawWidth = sourceW * scale;
const drawHeight = sourceH * scale;
```

For cardinal angles (0, 90, 180, 270) the result is identical to the current behavior. This formula is simpler and more correct than the nested ratio approach -- it computes the scale that maps the AABB to the display and then draws the un-rotated source at that scale, letting `ctx.rotate()` produce the correctly sized rotated output.

---

## UI Design

### Transform Panel Layout (updated)

```
[ Rotate CCW ] [ Rotate CW ] [ Flip H ] [ Flip V ] [ Reset ]  127.5deg
                              [ Angle Input: _____ ]
```

1. **Rotate CCW / CW buttons** -- Unchanged. Step by 90 degrees as before.
2. **Rotation indicator** -- Shows the current angle (already exists, just needs to update for non-cardinal values). Consider making the indicator clickable to activate the angle input field for better discoverability.
3. **Angle input field** -- A small numeric text input (50px wide) next to or below the rotation indicator. Accepts any number, normalizes to [0, 360). Enter or blur commits the value. Suffix label "deg" or degree symbol. Use `step="0.1"` (not `step="1"`) to support sub-degree precision needed for camera tilt correction (the most common VFX use case for arbitrary rotation).
4. **Mouse-scrub mode** -- Activated by holding **Ctrl+Shift** and dragging on the canvas. The angle is computed from the drag vector relative to the image center. Visual feedback: a faint radial guideline from image center to cursor.

### Mouse-Scrub Interaction

- **Activation**: Ctrl+Shift + pointer-down on the viewer canvas.
- **Angle computation**: `atan2(dy, dx)` from the image center to the current pointer position, converted to degrees.
- **Delta mode**: The initial pointer-down records the starting angle and the current rotation. Pointer-move adds the angular delta to the starting rotation, so the image follows the pointer direction.
- **Snapping**: Hold **Alt** in addition to Ctrl+Shift during drag to snap to 15-degree increments (`Ctrl+Shift+Alt+drag` = snapped, `Ctrl+Shift+drag` = free rotation). On release, snap to nearest common angle (0/45/90/135/180/225/270/315) if within 5 degrees.
- **Cursor**: `crosshair` or a custom rotation cursor during scrub.
- **Quality tiering**: During mouse-scrub rotation, enable interaction quality reduction (lower resolution) for smooth 60fps, same as pan/zoom. Call `onInteractionStart()` on pointer-down and `onInteractionEnd()` on pointer-up.
- **History recording**: During scrub, call `viewer.setTransform()` directly on each `pointermove` for visual feedback. Emit `transformChanged` on the `TransformControl` **only on pointer-up** so that undo history records a single entry for the entire drag gesture (not one per pointermove). This follows the same debounce pattern used in `AppColorWiring.ts` for color adjustments.

### Keyboard Shortcuts

| Action | Shortcut | Description |
|--------|----------|-------------|
| Rotate left 90 | Shift+R | Unchanged |
| Rotate right 90 | Alt+R | Unchanged |
| Reset rotation to 0 | Ctrl+0 | New -- resets rotation only (not flip) |

Note: `Ctrl+Shift+R` was originally considered for reset-rotation but is **already bound** to "Toggle reference comparison" (see `buildViewTab.ts` line 90). `Ctrl+0` is used instead (common for "reset view" in many tools). Alternatively, double-click on the rotation indicator can serve as the reset gesture.

### Snap Angles

Default snap targets: `[0, 45, 90, 135, 180, 225, 270, 315]` with a 5-degree threshold. Configurable in a future settings panel.

### Fit-to-Window

When `fitToWindow()` or `smoothFitToWindow()` is called (F key), the zoom level is calculated against the rotated bounding box dimensions, not the source dimensions. This is already the case since `renderImage()` uses `getEffectiveDimensions()` before `calculateDisplayDimensions()`. The only change is that `getEffectiveDimensions()` now works for arbitrary angles.

### Export Corner Fill Policy

When exporting at non-cardinal angles, the rotated image will have triangular transparent corners:
- **PNG export**: Transparent (alpha=0) corners. This is the expected behavior.
- **JPEG export**: JPEG does not support alpha. Fill corners with black (default) before encoding. This should be handled in `ViewerExport.ts` during export canvas preparation.

---

## Implementation Steps

### Phase 1: Core Type and Pipeline (breaking change, touches everything)

1. **Widen `Transform2D.rotation` type** from `0 | 90 | 180 | 270` to `number` in `/src/core/types/transform.ts`.
2. **Update `getEffectiveDimensions()`** in `/src/ui/components/ViewerRenderingUtils.ts` to use AABB math with epsilon snapping for cardinal angles. Keep the function signature: `(width, height, rotation) => { width, height }` but change the rotation parameter type from `0 | 90 | 180 | 270` to `number`.
3. **Update `drawWithTransform()` and `drawWithTransformFill()`** to compute draw dimensions from AABB instead of the 90/270 swap. Use the simplified scale computation (see Canvas 2D Path Changes above).
4. **Update `Renderer.setUserTransform()`** to accept `number` for rotation.
5. **Fix all TypeScript compilation errors** caused by the type widening. Key locations:
   - `TransformControl.ts` -- rotateLeft/rotateRight still step by 90 but store as number.
   - `TransformManager.ts` -- type updated.
   - `ViewerExport.ts` -- remove the valid-rotation clamp or broaden it.
   - `Viewer.ts` -- anywhere that pattern-matches on rotation values.
   - `AppTransformWiring.ts` -- history description string.
   - `SessionGTOStore.ts` -- already stores as float, but verify type change.
   - `GTOGraphLoader.ts` -- already reads as `number`, no change needed.
   - **`GTOSettingsParser.ts`** -- **Must update**: Remove the 90-degree snapping/clamping logic. Accept any float value and normalize to [0, 360). Without this change, loading sessions with arbitrary rotation will silently lose the saved angle.

### Phase 2: Vertex Shader Rotation Matrix

6. **Replace `u_texRotation` (int) with `u_texRotationMatrix` (mat2)** in `viewer.vert.glsl`.
7. **Add out-of-bounds texture coordinate check** in the fragment shader (`viewer.frag.glsl` or equivalent). Discard or output transparent black for coordinates outside [0, 1] after rotation. This prevents edge pixel smearing (`GL_CLAMP_TO_EDGE`) or tiling (`GL_REPEAT`) artifacts at non-cardinal angles.
8. **Update `Renderer.renderImage()`** to build and upload the rotation matrix instead of the integer uniform. Combine video rotation metadata with user rotation additively in degrees, then build one matrix.
9. **Update `Renderer.renderSDRFrame()`** (the SDR WebGL path) similarly. This is a **separate code path** (line ~2169 of `Renderer.ts`) that independently sets `u_texRotation` and must also be updated to use the mat2 uniform.
10. **Add `setUniformMatrix2fv()` to `ShaderProgram`**. This method **must** be added as a dedicated method. The existing `setUniform()` dispatches length-4 arrays to `gl.uniform4fv()`, which is incorrect for mat2. Follow the pattern of existing `setUniformMatrix3()` and `setUniformMatrix4()` methods.
11. **Update `ShaderPipeline` tests** for the new uniform. Note: `ShaderPipeline.ts` itself may not contain `u_texRotation` references (verify first; remove from files-to-modify if no code changes are needed). The test file comments should still be updated for accuracy.

### Phase 3: TransformControl UI

12. **Add angle input field** to `TransformControl.ts`:
    - Small `<input type="number" min="0" max="360" step="0.1">` element (use `step="0.1"` for sub-degree VFX precision).
    - On change/blur, normalize and emit `transformChanged`.
    - On Enter key, commit value.
13. **Update `rotateRight()` and `rotateLeft()`** to add/subtract 90 from the current numeric angle (no longer cycling through an array).
14. **Update `updateRotationIndicator()`** to show any angle, not just non-zero cardinals.
15. **Update `setTransform()`** to populate the angle input field value.
16. **Update Rotate CW/CCW button tooltips** to mention the angle input field for discoverability.

### Phase 4: Mouse-Scrub Rotation

17. **Add rotation scrub state** to `ViewerInputHandler.ts`:
    - `isRotationScrubbing: boolean`
    - `rotationScrubStartAngle: number`
    - `rotationScrubStartRotation: number`
18. **Detect Ctrl+Shift+pointerdown** on the canvas to enter rotation scrub mode.
19. **Compute angle delta** on `pointermove` using `atan2` from image center.
20. **During drag, update transform directly** via `viewer.setTransform()` for visual feedback (do **not** emit `transformChanged` per pointermove).
21. **On pointer-up**: Apply snap logic (snap to nearest common angle if within threshold), then emit a single `transformChanged` event on the `TransformControl` so exactly one undo history entry is recorded for the entire drag gesture.
22. **Snap modifier**: Hold **Alt** in addition to Ctrl+Shift during drag for 15-degree snap increments.
23. **Set cursor** to `crosshair` during rotation scrub.
24. **Wire interaction quality** start/end for smooth performance.

### Phase 5: Fit-to-Window and Layout

25. **Verify `calculateDisplayDimensions()`** works correctly with AABB dimensions. Since it already receives effective dimensions, no change should be needed.
26. **Update `prerenderBuffer` target size logic** in `Viewer.ts` -- currently uses `rotation === 90 || rotation === 270` to swap targets; replace with `getEffectiveDimensions()`-based computation. Note: the prerender buffer stores pre-effects frames at display resolution in source orientation, so care must be taken that the AABB sizing accounts for the direction of the transform correctly.
27. **Update pixel coordinate mapping** in `getPixelCoordinates()` and `getCanvasPoint()` if rotation affects the mapping (currently rotation is applied in the shader/draw call, not in coordinate space, so these may not need changes for visual rotation).

### Phase 6: Export

28. **Update `ViewerExport.ts`** `createExportParams()`:
    - Remove the 4-value rotation clamp.
    - Use `getEffectiveDimensions()` with arbitrary angle for output canvas sizing.
    - For JPEG export: fill the output canvas with black before drawing the rotated image, so transparent corners become black instead of undefined.
    - For PNG export: transparent corners are acceptable (alpha=0).
29. **Update `drawWithTransformFill()`** for arbitrary-angle export rendering.

### Phase 7: Serialization and Session Compatibility

30. **Update `GTOSettingsParser.ts`**: Remove the 90-degree clamping logic. Accept any float rotation value and normalize to [0, 360):
    ```typescript
    let rotation = 0;
    if (typeof rotationValue === 'number') {
      rotation = ((rotationValue % 360) + 360) % 360;
    }
    ```
31. **Verify GTO round-trip**: `SessionGTOStore.updateTransform()` already writes rotation as `float`. `GTOGraphLoader` already reads it as `number`. Confirm that loading a session with `rotate: 45.0` correctly populates `Transform2D.rotation = 45`.
32. **Update `TransformSerializer.buildRotateCanvasObject()`** -- already accepts `degrees?: number`, no change.
33. **Verify `AppPersistenceManager`** state restoration for non-cardinal angles.

### Phase 8: Tests

34. **Update unit tests** in `TransformControl.test.ts`:
    - Test `rotateRight()` from 45 goes to 135.
    - Test `rotateLeft()` from 45 goes to 315.
    - Test arbitrary angle via `setTransform({ rotation: 37.5, ... })`.
    - Test normalization: setting 400 becomes 40, setting -90 becomes 270.
35. **Update unit tests** in `ViewerRenderingUtils.test.ts`:
    - Test `getEffectiveDimensions()` for 0, 45, 90, 135, 180, arbitrary angles.
    - Test that cardinal angles produce exact integer dimensions (epsilon guard verification).
    - Test `drawWithTransform()` for non-cardinal angles.
36. **Update unit tests** in `Renderer.test.ts`:
    - Test `setUserTransform()` with arbitrary angle.
    - Test that the rotation matrix uniform is set correctly via `setUniformMatrix2fv`.
    - Test out-of-bounds discard behavior for non-cardinal angles.
37. **Update unit tests** in `TransformManager.test.ts`:
    - Test `setTransform()` with arbitrary angle.
38. **Update unit tests** in `AppTransformWiring.test.ts`:
    - Test history description for arbitrary angle changes.
    - Test that mouse-scrub drag produces exactly one history entry (not one per pointermove).
39. **Add unit tests** for snap logic (new utility function).
40. **Add unit tests** for angle normalization.
41. **Update e2e tests** in `e2e/transform-controls.spec.ts`:
    - Add test for angle input field.
    - Add test for mouse-scrub rotation (Ctrl+Shift+drag).
    - Add test for snap behavior.
42. **Update `ShaderPipeline.test.ts`** for the `u_texRotationMatrix` uniform.
43. **Add unit test for `GTOSettingsParser`** to verify arbitrary float rotation values are preserved on load (not clamped to 90-degree multiples).

### Phase 9: Cleanup and Polish

44. **Add rotation guideline overlay** -- Optional: draw a faint line from image center to cursor during scrub on the crop/overlay canvas.
45. **Keyboard shortcut for reset-rotation-only** -- Register `Ctrl+0` in `KeyBindings.ts` and `KeyboardActionMap.ts`. (Changed from `Ctrl+Shift+R` which conflicts with "Toggle reference comparison".)
46. **Update `features/pan-zoom-rotate.md`** to reflect arbitrary rotation support.

---

## Files to Create/Modify

### Files to Modify

| File | Change |
|------|--------|
| `src/core/types/transform.ts` | Widen `rotation` from `0\|90\|180\|270` to `number` |
| `src/render/shaders/viewer.vert.glsl` | Replace `u_texRotation` int with `u_texRotationMatrix` mat2 |
| `src/render/shaders/viewer.frag.glsl` | Add out-of-bounds texture coordinate check (discard/transparent for coords outside [0,1]) |
| `src/render/Renderer.ts` | Change `_userRotation` to `number`, build rotation matrix, add `setUniformMatrix2fv` call. Update both `renderImage()` and `renderSDRFrame()` paths. |
| `src/render/ShaderProgram.ts` | Add dedicated `setUniformMatrix2fv()` method (generic `setUniform()` misroutes length-4 arrays to `uniform4fv`) |
| `src/ui/components/TransformControl.ts` | Add angle input (`step="0.1"`), change rotate methods to numeric, update indicator, update tooltips |
| `src/ui/components/TransformManager.ts` | Type change propagation (Transform2D.rotation is now number) |
| `src/ui/components/ViewerRenderingUtils.ts` | Generalize `getEffectiveDimensions()` with epsilon guard, `drawWithTransform()`, `drawWithTransformFill()` |
| `src/ui/components/ViewerInputHandler.ts` | Add Ctrl+Shift+drag rotation scrub mode; emit `transformChanged` only on pointer-up to avoid history flood |
| `src/ui/components/ViewerGLRenderer.ts` | Update `applyUserTransformToRenderer()` for new `setUserTransform()` signature |
| `src/ui/components/ViewerExport.ts` | Remove 4-value rotation clamp, use AABB export sizing, add black fill for JPEG corners |
| `src/ui/components/Viewer.ts` | Update rotation references from union type to number, AABB for prerender target |
| `src/AppTransformWiring.ts` | Update history description for arbitrary angle |
| `src/core/session/SessionGTOStore.ts` | Minimal -- already stores float, but verify type change |
| `src/core/session/SessionState.ts` | Type change propagation |
| `src/core/session/GTOGraphLoader.ts` | Verify existing float parsing works (likely no change) |
| `src/core/session/GTOSettingsParser.ts` | **Critical**: Remove 90-degree clamping, accept arbitrary float, normalize to [0, 360) |
| `src/core/session/serializers/TransformSerializer.ts` | Verify `RotateCanvasSettings.degrees` is already `number` (no change) |
| `src/services/KeyboardActionMap.ts` | Add `transform.resetRotation` action |
| `src/utils/input/KeyBindings.ts` | Add `Ctrl+0` binding for reset-rotation (not `Ctrl+Shift+R` -- conflicts with reference comparison toggle) |
| `src/AppKeyboardHandler.ts` | Register new shortcut handler |
| `features/pan-zoom-rotate.md` | Update feature documentation |
| `src/ui/components/TransformControl.test.ts` | Update and add tests for arbitrary angles |
| `src/ui/components/ViewerRenderingUtils.test.ts` | Update bounding box tests, add epsilon guard tests |
| `src/render/Renderer.test.ts` | Update rotation matrix tests |
| `src/render/__tests__/ShaderPipeline.test.ts` | Update uniform tests (comments/assertions only if ShaderPipeline.ts itself has no u_texRotation references) |
| `src/ui/components/TransformManager.test.ts` | Update type tests |
| `src/AppTransformWiring.test.ts` | Update history tests |
| `e2e/transform-controls.spec.ts` | Add arbitrary rotation e2e tests |

### Files to Create

| File | Purpose |
|------|---------|
| `src/utils/rotation.ts` | `normalizeAngle()`, `snapAngle()`, `getRotationMatrix2x2()` utility functions |
| `src/utils/rotation.test.ts` | Unit tests for rotation utilities |

---

## Risks

### 1. Widespread Type Change

Widening `Transform2D.rotation` from a 4-value union to `number` is a breaking type change that will cause TypeScript errors in every file that uses the union type. This is the largest risk. **Mitigation**: Run `npx tsc --noEmit` after the type change and fix all errors before proceeding. The change is mechanical -- most sites just need their type annotations updated.

### 2. Shader Uniform Rename and Missing Method

Changing from `u_texRotation` (int) to `u_texRotationMatrix` (mat2) affects the shader pipeline and all tests that assert on uniform names. `ShaderProgram.ts` does not have a `setUniformMatrix2fv()` method, and the generic `setUniform()` would misroute a length-4 `Float32Array` to `gl.uniform4fv()`. **Mitigation**: Add a dedicated `setUniformMatrix2fv()` method following the existing `setUniformMatrix3()`/`setUniformMatrix4()` pattern.

### 3. Out-of-Bounds Texture Sampling

For non-cardinal rotations, rotated texture coordinates exceed [0, 1]. Without handling, `GL_CLAMP_TO_EDGE` smears edge pixels into corners, producing visible artifacts. **Mitigation**: Add a fragment shader discard/alpha-zero check for coordinates outside [0, 1]. This is a required addition, not optional.

### 4. History Flood During Mouse-Scrub Drag

Every `pointermove` during rotation scrub triggers `transformChanged`, and `AppTransformWiring.ts` records a history entry for each event. This creates hundreds of undo entries for a single drag gesture. **Mitigation**: During scrub, update the transform directly via `viewer.setTransform()` for visual feedback on each pointermove, and emit `transformChanged` only once on pointer-up. This follows the debounce pattern used in `AppColorWiring.ts`.

### 5. Pixel-Level Effect Coordinate Space

CPU pixel effects (`applyBatchedEffects`) operate on ImageData after the shader has rendered (including rotation). If overlays (crop, paint, safe areas) assume axis-aligned image coordinates, arbitrary rotation could cause misalignment. **Mitigation**: Since rotation is applied in the shader/draw call and overlays are drawn on separate canvas layers positioned by CSS, they should not be affected. Verify with manual testing.

### 6. Export Quality at Non-Cardinal Angles

When exporting at arbitrary angles, the output canvas must be sized to the AABB, and bilinear interpolation of the rotated source may introduce slight softening at the edges. Transparent corners appear in the rotated output. **Mitigation**: Use `imageSmoothingQuality: 'high'` (already set). For JPEG export, fill the canvas with black before drawing the rotated image. For WebGL exports, the shader handles interpolation natively.

### 7. Performance During Mouse-Scrub

Continuous rotation during mouse-scrub triggers a full re-render every frame. For large images or complex shader pipelines, this could drop below 60fps. **Mitigation**: Use interaction quality tiering (already implemented for pan/zoom) to reduce resolution during scrub. Call `onInteractionStart()`/`onInteractionEnd()` on the interaction quality manager.

### 8. Session Compatibility and GTOSettingsParser

Existing `.rv` session files store rotation as a float. Sessions saved with the current code store values like `0.0`, `90.0`, `180.0`, `270.0`. Loading these will work fine. Sessions saved with the new code may store values like `37.5`. Loading these in the old code would truncate or clamp the value. Additionally, `GTOSettingsParser.ts` currently clamps loaded values to 90-degree multiples, which must be updated to preserve arbitrary angles. **Mitigation**: Update `GTOSettingsParser.ts` to accept arbitrary float values. Forward compatibility is not a goal for a web-only tool, and the GTO format already supports the float values.

### 9. Crop Interaction with Arbitrary Rotation

The crop overlay is drawn in axis-aligned screen space. If the image is rotated by a non-cardinal angle, the crop region (defined in normalized image space) would need to be transformed to screen space. Currently, crop is disabled or operates in screen-aligned coordinates. For export, the AABB is larger than the source, so exported crop may include transparent/undefined pixels from the padding area. **Mitigation**: For the initial implementation, document that crop operates on the un-rotated image. A future enhancement could add rotated crop support.

### 10. Paint Annotation Coordinate Mapping

Paint strokes are stored in normalized image coordinates (0-1). When the image is rotated, the mapping from screen pointer position to image coordinates must account for the rotation. Currently, `getCanvasPoint()` does not account for rotation. **Mitigation**: For the initial implementation, disable rotation scrub when a paint tool is active (the same way pan is already the default non-paint interaction). Coordinate mapping fixes can follow in a later iteration.

### 11. Video Rotation Metadata Combination

The current code combines video metadata rotation (from container headers) with user rotation via integer modular arithmetic. With arbitrary user rotation, the combination becomes simple addition: `totalAngle = normalizeAngle(videoRotation + userRotation)`. This is straightforward but must be verified for edge cases with videos that have 90/180/270 metadata rotation. **Mitigation**: Add unit tests for combined rotation values.

---

## Review Notes (Future Enhancements)

The following items were identified during expert review as "nice to have" improvements that are not required for the initial implementation:

1. **Clickable rotation indicator**: Make the rotation indicator (`<span>`) clickable to activate the angle input field. This improves discoverability without adding UI complexity.
2. **Rotation guideline overlay during scrub**: Draw a faint radial line from image center to cursor during rotation scrub. Already mentioned as optional in Phase 9.
3. **Dedicated rotation mode toggle button**: Consider replacing or supplementing Ctrl+Shift+drag with a toolbar button that enters rotation mode. This follows the Nuke/DaVinci Resolve pattern of explicit mode selection and improves discoverability. The numeric input field should remain the primary interface for precise rotation (the most common VFX use case).
4. **Rotation-aware crop region**: Allow cropping in rotated image space rather than axis-aligned screen space. Correctly deferred to a future iteration.
5. **Rotation-aware paint coordinate mapping**: Transform paint stroke coordinates through the rotation for accurate annotation at non-cardinal angles. Correctly deferred to a future iteration.
