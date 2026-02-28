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
      Canvas2D: ctx.rotate(radians) with AABB-based draw dimensions
  --> Pixel effects (CPU or GPU)
  --> Overlays (crop, paint, watermark, safe areas)
```

### Bounding Box Calculation

Replace the current 90/270 swap with a general AABB:

```typescript
export function getEffectiveDimensions(
  width: number,
  height: number,
  rotationDegrees: number
): { width: number; height: number } {
  const rad = (rotationDegrees * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(rad));
  const absSin = Math.abs(Math.sin(rad));
  return {
    width:  Math.ceil(width * absCos + height * absSin),
    height: Math.ceil(width * absSin + height * absCos),
  };
}
```

For exact 90-degree multiples, this yields the same results as the current implementation (within floating-point precision). A small epsilon check can be added to preserve exact integer dimensions at cardinal angles.

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

On the CPU side, the Renderer builds the matrix:

```typescript
const rad = -(rotationDegrees * Math.PI) / 180; // negative for CW in tex space
const cos = Math.cos(rad);
const sin = Math.sin(rad);
// mat2 is column-major in WebGL
this.displayShader.setUniformMatrix2fv('u_texRotationMatrix', [cos, sin, -sin, cos]);
```

Video metadata rotation (integer multiples of 90) is combined additively with the user rotation before building the matrix.

### Canvas 2D Path Changes

`drawWithTransform()` in `ViewerRenderingUtils.ts` already calls `ctx.rotate()` with any angle. The dimension-swap logic changes from:

```typescript
if (rotation === 90 || rotation === 270) {
  drawWidth = displayHeight;
  drawHeight = displayWidth;
}
```

to computing the scale needed so that the rotated source fills the display AABB:

```typescript
const { width: bbW, height: bbH } = getEffectiveDimensions(sourceW, sourceH, rotation);
const scaleToFit = Math.min(displayWidth / bbW, displayHeight / bbH);
const drawWidth = sourceW * scaleToFit * (displayWidth / (bbW * scaleToFit));
const drawHeight = sourceH * scaleToFit * (displayHeight / (bbH * scaleToFit));
```

For cardinal angles (0, 90, 180, 270) the result is identical to the current behavior.

---

## UI Design

### Transform Panel Layout (updated)

```
[ Rotate CCW ] [ Rotate CW ] [ Flip H ] [ Flip V ] [ Reset ]  127.5deg
                              [ Angle Input: _____ ]
```

1. **Rotate CCW / CW buttons** -- Unchanged. Step by 90 degrees as before.
2. **Rotation indicator** -- Shows the current angle (already exists, just needs to update for non-cardinal values).
3. **Angle input field** -- A small numeric text input (50px wide) next to or below the rotation indicator. Accepts any number, normalizes to [0, 360). Enter or blur commits the value. Suffix label "deg" or degree symbol.
4. **Mouse-scrub mode** -- Activated by holding **Ctrl+Shift** and dragging on the canvas. The angle is computed from the drag vector relative to the image center. Visual feedback: a faint radial guideline from image center to cursor.

### Mouse-Scrub Interaction

- **Activation**: Ctrl+Shift + pointer-down on the viewer canvas.
- **Angle computation**: `atan2(dy, dx)` from the image center to the current pointer position, converted to degrees.
- **Delta mode**: The initial pointer-down records the starting angle and the current rotation. Pointer-move adds the angular delta to the starting rotation, so the image follows the pointer direction.
- **Snapping**: While dragging, if Shift is also held (Ctrl+Shift is already held), snap to 15-degree increments. On release, snap to nearest common angle (0/45/90/135/180/225/270/315) if within 5 degrees.
- **Cursor**: `crosshair` or a custom rotation cursor during scrub.
- **Quality tiering**: During mouse-scrub rotation, enable interaction quality reduction (lower resolution) for smooth 60fps, same as pan/zoom. Call `onInteractionStart()` on pointer-down and `onInteractionEnd()` on pointer-up.

### Keyboard Shortcuts

| Action | Shortcut | Description |
|--------|----------|-------------|
| Rotate left 90 | Shift+R | Unchanged |
| Rotate right 90 | Alt+R | Unchanged |
| Reset rotation to 0 | Ctrl+Shift+R | New -- resets rotation only (not flip) |

### Snap Angles

Default snap targets: `[0, 45, 90, 135, 180, 225, 270, 315]` with a 5-degree threshold. Configurable in a future settings panel.

### Fit-to-Window

When `fitToWindow()` or `smoothFitToWindow()` is called (F key), the zoom level is calculated against the rotated bounding box dimensions, not the source dimensions. This is already the case since `renderImage()` uses `getEffectiveDimensions()` before `calculateDisplayDimensions()`. The only change is that `getEffectiveDimensions()` now works for arbitrary angles.

---

## Implementation Steps

### Phase 1: Core Type and Pipeline (breaking change, touches everything)

1. **Widen `Transform2D.rotation` type** from `0 | 90 | 180 | 270` to `number` in `/src/core/types/transform.ts`.
2. **Update `getEffectiveDimensions()`** in `/src/ui/components/ViewerRenderingUtils.ts` to use AABB math. Keep the function signature: `(width, height, rotation) => { width, height }` but change the rotation parameter type from `0 | 90 | 180 | 270` to `number`.
3. **Update `drawWithTransform()` and `drawWithTransformFill()`** to compute draw dimensions from AABB instead of the 90/270 swap.
4. **Update `Renderer.setUserTransform()`** to accept `number` for rotation.
5. **Fix all TypeScript compilation errors** caused by the type widening. Key locations:
   - `TransformControl.ts` -- rotateLeft/rotateRight still step by 90 but store as number.
   - `TransformManager.ts` -- type updated.
   - `ViewerExport.ts` -- remove the valid-rotation clamp or broaden it.
   - `Viewer.ts` -- anywhere that pattern-matches on rotation values.
   - `AppTransformWiring.ts` -- history description string.
   - `SessionGTOStore.ts` -- already stores as float, minimal change.
   - `GTOGraphLoader.ts` -- already reads as `number`, no change needed.

### Phase 2: Vertex Shader Rotation Matrix

6. **Replace `u_texRotation` (int) with `u_texRotationMatrix` (mat2)** in `viewer.vert.glsl`.
7. **Update `Renderer.renderImage()`** to build and upload the rotation matrix instead of the integer uniform. Combine video rotation metadata with user rotation additively in degrees, then build one matrix.
8. **Update `Renderer.renderSDRFrame()`** (the SDR WebGL path) similarly.
9. **Add `setUniformMatrix2fv()` to `ShaderProgram`** if it does not already exist.
10. **Update `ShaderPipeline` tests** for the new uniform.

### Phase 3: TransformControl UI

11. **Add angle input field** to `TransformControl.ts`:
    - Small `<input type="number" min="0" max="360" step="1">` element.
    - On change/blur, normalize and emit `transformChanged`.
    - On Enter key, commit value.
12. **Update `rotateRight()` and `rotateLeft()`** to add/subtract 90 from the current numeric angle (no longer cycling through an array).
13. **Update `updateRotationIndicator()`** to show any angle, not just non-zero cardinals.
14. **Update `setTransform()`** to populate the angle input field value.

### Phase 4: Mouse-Scrub Rotation

15. **Add rotation scrub state** to `ViewerInputHandler.ts`:
    - `isRotationScrubbing: boolean`
    - `rotationScrubStartAngle: number`
    - `rotationScrubStartRotation: number`
16. **Detect Ctrl+Shift+pointerdown** on the canvas to enter rotation scrub mode.
17. **Compute angle delta** on `pointermove` using `atan2` from image center.
18. **Apply snap logic** on `pointerup`: snap to nearest common angle if within threshold.
19. **Emit `transformChanged`** through the `TransformControl` so undo/redo history is recorded.
20. **Set cursor** to `crosshair` during rotation scrub.
21. **Wire interaction quality** start/end for smooth performance.

### Phase 5: Fit-to-Window and Layout

22. **Verify `calculateDisplayDimensions()`** works correctly with AABB dimensions. Since it already receives effective dimensions, no change should be needed.
23. **Update `prerenderBuffer` target size logic** in `Viewer.ts` -- currently uses `rotation === 90 || rotation === 270` to swap targets; replace with AABB-based computation.
24. **Update pixel coordinate mapping** in `getPixelCoordinates()` and `getCanvasPoint()` if rotation affects the mapping (currently rotation is applied in the shader/draw call, not in coordinate space, so these may not need changes for visual rotation).

### Phase 6: Export

25. **Update `ViewerExport.ts`** `createExportParams()`:
    - Remove the 4-value rotation clamp.
    - Use `getEffectiveDimensions()` with arbitrary angle for output canvas sizing.
26. **Update `drawWithTransformFill()`** for arbitrary-angle export rendering.

### Phase 7: Serialization and Session Compatibility

27. **Verify GTO round-trip**: `SessionGTOStore.updateTransform()` already writes rotation as `float`. `GTOGraphLoader` already reads it as `number`. Confirm that loading a session with `rotate: 45.0` correctly populates `Transform2D.rotation = 45`.
28. **Update `TransformSerializer.buildRotateCanvasObject()`** -- already accepts `degrees?: number`, no change.
29. **Verify `AppPersistenceManager`** state restoration for non-cardinal angles.

### Phase 8: Tests

30. **Update unit tests** in `TransformControl.test.ts`:
    - Test `rotateRight()` from 45 goes to 135.
    - Test `rotateLeft()` from 45 goes to 315.
    - Test arbitrary angle via `setTransform({ rotation: 37.5, ... })`.
    - Test normalization: setting 400 becomes 40, setting -90 becomes 270.
31. **Update unit tests** in `ViewerRenderingUtils.test.ts`:
    - Test `getEffectiveDimensions()` for 0, 45, 90, 135, 180, arbitrary angles.
    - Test `drawWithTransform()` for non-cardinal angles.
32. **Update unit tests** in `Renderer.test.ts`:
    - Test `setUserTransform()` with arbitrary angle.
    - Test that the rotation matrix uniform is set correctly.
33. **Update unit tests** in `TransformManager.test.ts`:
    - Test `setTransform()` with arbitrary angle.
34. **Update unit tests** in `AppTransformWiring.test.ts`:
    - Test history description for arbitrary angle changes.
35. **Add unit tests** for snap logic (new utility function).
36. **Add unit tests** for angle normalization.
37. **Update e2e tests** in `e2e/transform-controls.spec.ts`:
    - Add test for angle input field.
    - Add test for mouse-scrub rotation (Ctrl+Shift+drag).
    - Add test for snap behavior.
38. **Update `ShaderPipeline.test.ts`** for the `u_texRotationMatrix` uniform.

### Phase 9: Cleanup and Polish

39. **Add rotation guideline overlay** -- Optional: draw a faint line from image center to cursor during scrub on the crop/overlay canvas.
40. **Keyboard shortcut for reset-rotation-only** -- Register `Ctrl+Shift+R` in `KeyBindings.ts` and `KeyboardActionMap.ts`.
41. **Update `features/pan-zoom-rotate.md`** to reflect arbitrary rotation support.

---

## Files to Create/Modify

### Files to Modify

| File | Change |
|------|--------|
| `src/core/types/transform.ts` | Widen `rotation` from `0\|90\|180\|270` to `number` |
| `src/render/shaders/viewer.vert.glsl` | Replace `u_texRotation` int with `u_texRotationMatrix` mat2 |
| `src/render/Renderer.ts` | Change `_userRotation` to `number`, build rotation matrix, add `setUniformMatrix2fv` call |
| `src/render/ShaderProgram.ts` | Add `setUniformMatrix2fv()` method if missing |
| `src/render/ShaderPipeline.ts` | Update uniform references from `u_texRotation` to `u_texRotationMatrix` |
| `src/ui/components/TransformControl.ts` | Add angle input, change rotate methods to numeric, update indicator |
| `src/ui/components/TransformManager.ts` | Type change propagation (Transform2D.rotation is now number) |
| `src/ui/components/ViewerRenderingUtils.ts` | Generalize `getEffectiveDimensions()`, `drawWithTransform()`, `drawWithTransformFill()` |
| `src/ui/components/ViewerInputHandler.ts` | Add Ctrl+Shift+drag rotation scrub mode |
| `src/ui/components/ViewerGLRenderer.ts` | Update `applyUserTransformToRenderer()` for new `setUserTransform()` signature |
| `src/ui/components/ViewerExport.ts` | Remove 4-value rotation clamp, use AABB export sizing |
| `src/ui/components/Viewer.ts` | Update rotation references from union type to number, AABB for prerender target |
| `src/AppTransformWiring.ts` | Update history description for arbitrary angle |
| `src/core/session/SessionGTOStore.ts` | Minimal -- already stores float, but verify type change |
| `src/core/session/SessionState.ts` | Type change propagation |
| `src/core/session/GTOGraphLoader.ts` | Verify existing float parsing works (likely no change) |
| `src/core/session/serializers/TransformSerializer.ts` | Verify `RotateCanvasSettings.degrees` is already `number` (no change) |
| `src/services/KeyboardActionMap.ts` | Add `transform.resetRotation` action |
| `src/utils/input/KeyBindings.ts` | Add `Ctrl+Shift+R` binding for reset-rotation |
| `src/AppKeyboardHandler.ts` | Register new shortcut handler |
| `features/pan-zoom-rotate.md` | Update feature documentation |
| `src/ui/components/TransformControl.test.ts` | Update and add tests for arbitrary angles |
| `src/ui/components/ViewerRenderingUtils.test.ts` | Update bounding box tests |
| `src/render/Renderer.test.ts` | Update rotation matrix tests |
| `src/render/__tests__/ShaderPipeline.test.ts` | Update uniform tests |
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

### 2. Shader Uniform Rename

Changing from `u_texRotation` (int) to `u_texRotationMatrix` (mat2) affects the shader pipeline and all tests that assert on uniform names. If the `ShaderProgram` does not have a `setUniformMatrix2fv()` method, one must be added. **Mitigation**: Check `ShaderProgram.ts` first; the method likely needs to be added but is straightforward.

### 3. Pixel-Level Effect Coordinate Space

CPU pixel effects (`applyBatchedEffects`) operate on ImageData after the shader has rendered (including rotation). If overlays (crop, paint, safe areas) assume axis-aligned image coordinates, arbitrary rotation could cause misalignment. **Mitigation**: Since rotation is applied in the shader/draw call and overlays are drawn on separate canvas layers positioned by CSS, they should not be affected. Verify with manual testing.

### 4. Export Quality at Non-Cardinal Angles

When exporting at arbitrary angles, the output canvas must be sized to the AABB, and bilinear interpolation of the rotated source may introduce slight softening at the edges. **Mitigation**: Use `imageSmoothingQuality: 'high'` (already set). For WebGL exports, the shader handles interpolation natively.

### 5. Performance During Mouse-Scrub

Continuous rotation during mouse-scrub triggers a full re-render every frame. For large images or complex shader pipelines, this could drop below 60fps. **Mitigation**: Use interaction quality tiering (already implemented for pan/zoom) to reduce resolution during scrub. Call `onInteractionStart()`/`onInteractionEnd()` on the interaction quality manager.

### 6. Session Compatibility

Existing `.rv` session files store rotation as a float. Sessions saved with the current code store values like `0.0`, `90.0`, `180.0`, `270.0`. Loading these will work fine. Sessions saved with the new code may store values like `37.5`. Loading these in the old code would truncate or clamp the value. **Mitigation**: This is acceptable -- forward compatibility is not a goal for a web-only tool, and the GTO format already supports the float values.

### 7. Crop Interaction with Arbitrary Rotation

The crop overlay is drawn in axis-aligned screen space. If the image is rotated by a non-cardinal angle, the crop region (defined in normalized image space) would need to be transformed to screen space. Currently, crop is disabled or operates in screen-aligned coordinates. **Mitigation**: For the initial implementation, document that crop operates on the un-rotated image. A future enhancement could add rotated crop support.

### 8. Paint Annotation Coordinate Mapping

Paint strokes are stored in normalized image coordinates (0-1). When the image is rotated, the mapping from screen pointer position to image coordinates must account for the rotation. Currently, `getCanvasPoint()` does not account for rotation. **Mitigation**: For the initial implementation, disable rotation scrub when a paint tool is active (the same way pan is already the default non-paint interaction). Coordinate mapping fixes can follow in a later iteration.

### 9. Video Rotation Metadata Combination

The current code combines video metadata rotation (from container headers) with user rotation via integer modular arithmetic. With arbitrary user rotation, the combination becomes simple addition: `totalAngle = normalizeAngle(videoRotation + userRotation)`. This is straightforward but must be verified for edge cases with videos that have 90/180/270 metadata rotation. **Mitigation**: Add unit tests for combined rotation values.
