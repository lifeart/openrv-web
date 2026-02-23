# Implementation Plan: Viewer Compositing Overhead (Item 2)

**Priority Score: 15/25** | Risk: LOW-MEDIUM | Effort: M

## Summary

The Viewer stacks up to 14 canvas/div layers in `canvasContainer`. On every frame, the
`render()` method (line 1178 of `Viewer.ts`) calls `renderWatermarkOverlayCanvas()` which
unconditionally `clearRect`s the watermark canvas, and `renderPaint()` which unconditionally
`clearRect`s the paint canvas. Every `CanvasOverlay` subclass (SafeAreas, Matte, Spotlight,
Bug, EXRWindow) creates an `alpha:true` 2D canvas at construction time
(`CanvasOverlay.ts` line 41-54) and registers it in the DOM via `OverlayManager`
(`OverlayManager.ts` lines 62-86). These canvases participate in GPU compositing
even when completely transparent and invisible.

### DOM Layer Stack (Viewer.ts constructor, lines 462-538 + OverlayManager lines 62-86)

From bottom to top (z-order):

| Layer | Type | Z-index | Created | Always in DOM? |
|-------|------|---------|---------|----------------|
| imageCanvas | `<canvas>` | auto (base) | Viewer L473 | Yes |
| glCanvas | `<canvas>` | 5 | ViewerGLRenderer | Yes |
| _referenceCanvas | `<canvas>` | 35 | Lazy (Viewer L4271) | No |
| matteOverlay | `<canvas>` | 40 | OverlayManager L69 | Yes |
| exrWindowOverlay | `<canvas>` | 42 | OverlayManager L85 | Yes |
| spotlightOverlay | `<canvas>` | 44 | OverlayManager L77 | Yes |
| safeAreasOverlay | `<canvas>` | 45 | OverlayManager L65 | Yes |
| timecodeOverlay | `<div>` | 50 | OverlayManager L73 | Yes |
| bugOverlay | `<canvas>` | 55 | OverlayManager L81 | Yes |
| watermarkCanvas | `<canvas>` | auto | Viewer L514 | Yes |
| paintCanvas | `<canvas>` | auto | Viewer L525 | Yes |
| perspectiveGridOverlay | `<div>+<canvas>` | auto | Viewer L536 | Yes |
| cropOverlay | `<canvas>` | auto | CropManager | Yes |

**Key observations from code review:**

1. **Watermark canvas is cleared+redrawn every frame** (`Viewer.ts` lines 2158-2167), even
   when the watermark overlay is disabled or WebGL is inactive. The `clearRect` at line 2160
   runs unconditionally.
2. **Paint canvas is cleared every frame** (`Viewer.ts` lines 2125-2128). The early return
   at line 2135 happens *after* the `clearRect`, so the canvas is cleared even when there
   are zero annotations.
3. **WatermarkOverlay is NOT a CanvasOverlay subclass** -- it extends `EventEmitter` directly
   (`WatermarkOverlay.ts` line 51). It has no own canvas; it renders into either the
   `imageCtx` (2D path, line 1908) or `watermarkCtx` (WebGL path, line 2166).
4. **TimecodeOverlay is NOT a CanvasOverlay subclass** -- it is a DOM `<div>` element
   (`TimecodeOverlay.ts` line 44). It already manages its own `display:none` via
   `updateStyles()` (line 180).
5. **CanvasOverlay subclasses** that ARE in the DOM and always composited:
   SafeAreasOverlay, MatteOverlay, SpotlightOverlay, BugOverlay, EXRWindowOverlay.
6. **PerspectiveGridOverlay** already manages `display:none` via `updateVisibility()`
   (line 143-145). Not a CanvasOverlay subclass.
7. **ReferenceCanvas** is already lazy-created (`Viewer.ts` line 4271) and has
   `display:none` toggling (lines 4264, 4286).
8. **Watermark and paint canvases are created with default `alpha:true`** (via
   `safeCanvasContext2D` with `{}` as options -- `Viewer.ts` lines 604, 607). The browser
   default for canvas `getContext('2d')` is `{ alpha: true }`.

---

## Implementation Order

### Task 2.1: Dirty-Flag Watermark Rendering (HIGH IMPACT)
**Complexity:** small
**Files:** `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`
**Dependencies:** none

#### Current Code Analysis

`renderWatermarkOverlayCanvas()` at lines 2158-2167:
```typescript
private renderWatermarkOverlayCanvas(): void {
  this.watermarkCtx.setTransform(1, 0, 0, 1, 0, 0);
  this.watermarkCtx.clearRect(0, 0, this.watermarkCanvas.width, this.watermarkCanvas.height);

  const isWebGLActive = this.glRendererManager.hdrRenderActive || this.glRendererManager.sdrWebGLRenderActive;
  if (!isWebGLActive) return;
  if (!this.watermarkOverlay.isEnabled() || !this.watermarkOverlay.hasImage()) return;

  this.watermarkOverlay.render(this.watermarkCtx, this.displayWidth, this.displayHeight);
}
```

This method is called every frame from `render()` at line 1193. The `clearRect` + `setTransform`
execute unconditionally even when: (a) watermark is disabled, (b) no image is loaded,
(c) WebGL is not active, (d) nothing has changed since last frame.

The `WatermarkOverlay` emits `stateChanged` on every mutation (position, scale, opacity, margin,
enabled, image load/remove). The Viewer already listens to this event at line 560:
```typescript
this.watermarkOverlay.on('stateChanged', () => {
  this.scheduleRender();
});
```

Canvas resize is handled in `setCanvasSize()` at line 776:
```typescript
resetCanvasFromHiDPI(this.watermarkCanvas, this.watermarkCtx, width, height);
```

#### Implementation Steps

1. Add private field at ~line 150 (near `watermarkCanvas` declaration):
   ```typescript
   private watermarkDirty = true;
   ```

2. In `renderWatermarkOverlayCanvas()` (line 2158), add early return:
   ```typescript
   private renderWatermarkOverlayCanvas(): void {
     if (!this.watermarkDirty) return;
     this.watermarkDirty = false;

     this.watermarkCtx.setTransform(1, 0, 0, 1, 0, 0);
     this.watermarkCtx.clearRect(0, 0, this.watermarkCanvas.width, this.watermarkCanvas.height);
     // ... rest unchanged
   }
   ```

3. Set `watermarkDirty = true` in the `stateChanged` handler (line 560):
   ```typescript
   this.watermarkOverlay.on('stateChanged', () => {
     this.watermarkDirty = true;
     this.scheduleRender();
   });
   ```

4. Set `watermarkDirty = true` in `setCanvasSize()` after `resetCanvasFromHiDPI` at line 776
   (canvas resize clears pixel content and changes dimensions).

5. Set `watermarkDirty = true` whenever GL active state changes. This requires marking dirty
   when `hdrRenderActive` or `sdrWebGLRenderActive` change. The simplest approach:
   also mark dirty when `renderImage()` is called, since GL-active can change between frames.
   Actually, the safer approach is to track the last-known `isWebGLActive` value and mark dirty
   on transition. Alternatively, since the GL active check is cheap and the main cost is
   `clearRect`, we can restructure to only skip when watermark is disabled AND canvas is already clean.

   **Refined approach:** Track `watermarkCanvasClean` (was last render a no-op?) and `watermarkDirty`:
   ```typescript
   private watermarkDirty = true;
   ```
   Set `watermarkDirty = true` on: stateChanged, canvas resize, and GL state change. For GL state
   change, the simplest correct approach is: always set dirty when the GL render path is entered
   or exited. Since this is tied to source loading, just mark dirty on `sourceLoaded` event too.

#### Edge Cases & Risks

- **2D path watermark**: In the 2D render path (non-GL), the watermark is rendered directly into
  `imageCanvas` at line 1908 (`this.watermarkOverlay.render(this.imageCtx, ...)`). This call is
  NOT guarded by the dirty flag and should NOT be -- it renders into the main image canvas which
  is fully repainted each frame anyway. The dirty flag only applies to `renderWatermarkOverlayCanvas`.
- **GL state transitions**: If the viewer switches from GL to 2D or vice versa, the watermark
  overlay canvas may need clearing. Setting `watermarkDirty = true` on `sourceLoaded` covers this.
- **Export path**: `applyWatermarkToCanvas` (line 3835) and `createExportCanvas` (line 3846) render
  watermark directly, not through the overlay canvas -- these are unaffected.
- **Race with `renderDirect`**: Both `scheduleRender` and `renderDirect` call `render()`. The
  dirty flag is frame-level, so no race exists -- it just means the next render redraws.

#### Test Specifications
**File:** `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.test.ts`

Add to the existing Viewer test file (which already has `TestableViewer` interface, canvas mocks,
and Viewer construction helpers).

```typescript
describe('Task 2.1: Dirty-Flag Watermark Rendering', () => {
  // Need to extend TestableViewer interface with:
  // watermarkDirty: boolean;
  // watermarkCtx: { clearRect: vi.Mock; setTransform: vi.Mock; };
  // renderWatermarkOverlayCanvas(): void;

  it('VWR-WM-001: watermark canvas not cleared when nothing changed', () => {
    // Setup: create viewer, trigger initial render to clear dirty flag
    // Action: call render() a second time
    // Assertion: watermarkCtx.clearRect called only during first render
    const tv = viewer as unknown as TestableViewer;
    tv.watermarkDirty = false;
    const clearSpy = vi.spyOn(tv.watermarkCtx, 'clearRect');
    tv.renderWatermarkOverlayCanvas();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('VWR-WM-002: watermark redrawn after stateChanged event', () => {
    // Setup: render once to clear dirty flag
    // Action: emit stateChanged on watermarkOverlay
    // Assertion: watermarkDirty is true, next render calls clearRect
    const tv = viewer as unknown as TestableViewer;
    tv.watermarkDirty = false;
    tv.watermarkOverlay.emit('stateChanged', { ...DEFAULT_WATERMARK_STATE });
    expect(tv.watermarkDirty).toBe(true);
  });

  it('VWR-WM-003: watermark redrawn after canvas resize', () => {
    // Setup: render once to clear dirty flag
    // Action: call setCanvasSize(800, 600)
    // Assertion: watermarkDirty is true
    const tv = viewer as unknown as TestableViewer;
    tv.watermarkDirty = false;
    tv.setCanvasSize(800, 600);
    expect(tv.watermarkDirty).toBe(true);
  });

  it('VWR-WM-004: watermarkDirty starts as true', () => {
    const tv = viewer as unknown as TestableViewer;
    expect(tv.watermarkDirty).toBe(true);
  });
});
```

---

### Task 2.2: Skip Paint Canvas Clear When Empty (MEDIUM IMPACT)
**Complexity:** small
**Files:** `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`
**Dependencies:** none

#### Current Code Analysis

`renderPaint()` at lines 2117-2152:
```typescript
private renderPaint(): void {
  if (this.displayWidth === 0 || this.displayHeight === 0) return;

  const containerRect = this.getContainerRect();
  this.updatePaintCanvasSize(this.displayWidth, this.displayHeight, containerRect.width, containerRect.height);

  const ctx = this.paintCtx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);  // <-- Always runs

  const version = this.paintEngine.annotationVersion;
  const versionFilter = (version === 'all') ? undefined : version;
  const annotations = this.paintEngine.getAnnotationsWithGhost(this.session.currentFrame, versionFilter);

  if (annotations.length === 0) return;  // <-- Early return AFTER clearRect
  // ... render annotations
}
```

The `clearRect` at line 2128 runs every frame even when there are no annotations. Also,
`updatePaintCanvasSize` (line 2123) does layout work every frame.

The `renderPaint()` is called from:
1. `render()` at line 1204 (every frame, unless actively drawing)
2. `this.paintEngine.on('annotationsChanged', () => this.renderPaint())` at line 912

#### Implementation Steps

1. Add a `paintDirty` flag:
   ```typescript
   private paintDirty = true;
   ```

2. Track whether the paint canvas has any content drawn on it:
   ```typescript
   private paintHasContent = false;
   ```

3. In `renderPaint()`, add early return before the clear:
   ```typescript
   private renderPaint(): void {
     if (this.displayWidth === 0 || this.displayHeight === 0) return;

     if (!this.paintDirty && !this.paintHasContent) return;

     const containerRect = this.getContainerRect();
     this.updatePaintCanvasSize(this.displayWidth, this.displayHeight, containerRect.width, containerRect.height);

     const ctx = this.paintCtx;
     const version = this.paintEngine.annotationVersion;
     const versionFilter = (version === 'all') ? undefined : version;
     const annotations = this.paintEngine.getAnnotationsWithGhost(this.session.currentFrame, versionFilter);

     if (annotations.length === 0) {
       // Only clear if we previously had content
       if (this.paintHasContent) {
         ctx.setTransform(1, 0, 0, 1, 0, 0);
         ctx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
         this.paintHasContent = false;
       }
       this.paintDirty = false;
       return;
     }

     ctx.setTransform(1, 0, 0, 1, 0, 0);
     ctx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
     // ... render annotations
     this.paintHasContent = true;
     this.paintDirty = false;
   }
   ```

4. Set `paintDirty = true` on:
   - `annotationsChanged` event (line 912)
   - `frameChanged` (because annotations are per-frame, different frame may have different annotations)
   - Canvas resize (`setCanvasSize`)

5. Note: `frameChanged` already triggers `scheduleRender()` (line 908), and `render()` calls
   `renderPaint()`. The `paintDirty` flag ensures we don't skip when we need to check for
   frame-specific annotations. Actually, since `render()` already calls `renderPaint()` on
   every frame and annotations are frame-dependent, the smarter approach is:

   **Simpler alternative:** Just move the `clearRect` after the annotation check:
   ```typescript
   const annotations = ...;
   if (annotations.length === 0 && !this.paintHasContent) return;
   // Now clear and render
   ```
   This avoids the dirty flag complexity entirely while still saving the `clearRect` in the
   common case (no annotations on any frame).

#### Edge Cases & Risks

- **Frame change with annotations on previous frame**: When the user scrubs from a frame
  with annotations to one without, `paintHasContent` will be true, so we correctly clear.
- **Live stroke rendering**: Lines 1197-1201 handle live strokes via `inputHandler.renderLiveStroke()`
  and `inputHandler.renderLiveShape()`. These bypass `renderPaint()` entirely. When the user
  finishes a stroke, `annotationsChanged` fires, which triggers `renderPaint()` with the new
  annotation. This path is safe.
- **Advanced tool strokes**: Line 1201-1203 skips `renderPaint` during advanced drawing.
  Not affected by this change.
- **`updatePaintCanvasSize` cost**: This method (lines ~795-851) has an early-return if
  dimensions haven't changed (lines 830-835), so calling it when no paint is needed is cheap
  but not free. Moving it inside the "has annotations" path would also save the
  `getContainerRect()` call.

#### Test Specifications
**File:** `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.test.ts`

```typescript
describe('Task 2.2: Skip Paint Canvas Clear When Empty', () => {
  it('VWR-PT-001: paint canvas not cleared when no annotations and no prior content', () => {
    // Setup: viewer with no annotations, paintHasContent = false
    const tv = viewer as unknown as TestableViewer;
    const clearSpy = vi.spyOn(tv.paintCtx, 'clearRect');
    // Ensure paintEngine returns empty annotations
    vi.spyOn(tv.paintEngine, 'getAnnotationsWithGhost').mockReturnValue([]);
    tv.paintHasContent = false;

    tv.renderPaint();

    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('VWR-PT-002: paint canvas cleared when switching from frame with annotations to frame without', () => {
    // Setup: paintHasContent = true (previous frame had annotations)
    const tv = viewer as unknown as TestableViewer;
    tv.paintHasContent = true;
    const clearSpy = vi.spyOn(tv.paintCtx, 'clearRect');
    vi.spyOn(tv.paintEngine, 'getAnnotationsWithGhost').mockReturnValue([]);

    tv.renderPaint();

    expect(clearSpy).toHaveBeenCalled();
    expect(tv.paintHasContent).toBe(false);
  });

  it('VWR-PT-003: paint canvas rendered and paintHasContent set when annotations exist', () => {
    // Setup: annotations present
    const tv = viewer as unknown as TestableViewer;
    const mockAnnotation = { /* minimal annotation mock */ };
    vi.spyOn(tv.paintEngine, 'getAnnotationsWithGhost').mockReturnValue([mockAnnotation]);
    vi.spyOn(tv.paintRenderer, 'renderAnnotations').mockImplementation(() => {});

    tv.renderPaint();

    expect(tv.paintHasContent).toBe(true);
  });
});
```

---

### Task 2.3: `display:none` for Inactive Watermark Canvas
**Complexity:** trivial
**Files:** `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`
**Dependencies:** none (can be combined with Task 2.1)

#### Current Code Analysis

The watermark canvas is created at line 514 and appended at line 522. It has no `display:none`
management. When the watermark is disabled (which is the default state -- `DEFAULT_WATERMARK_STATE.enabled = false`),
the canvas still participates in the compositor as a fully transparent layer.

The canvas context is created with default `alpha:true` (line 604), meaning the browser
composites this transparent canvas on every frame.

#### Implementation Steps

1. After canvas creation (line 522), set initial display to none:
   ```typescript
   this.watermarkCanvas.style.display = 'none';
   ```
   (Since `DEFAULT_WATERMARK_STATE.enabled = false`, the canvas starts hidden.)

2. In the `stateChanged` handler (line 560), update display:
   ```typescript
   this.watermarkOverlay.on('stateChanged', () => {
     this.watermarkDirty = true;
     const isActive = this.watermarkOverlay.isEnabled() && this.watermarkOverlay.hasImage();
     this.watermarkCanvas.style.display = isActive ? '' : 'none';
     this.scheduleRender();
   });
   ```

3. In `renderWatermarkOverlayCanvas()`, update display based on whether anything was actually
   rendered. After the early returns at lines 2163-2164, set `display:none`. After the
   `render()` call at line 2166, set `display:''`.

   **Alternative (simpler, recommended):** Just manage display in the stateChanged handler.
   The `renderWatermarkOverlayCanvas` method handles clearing correctly, so even if the canvas
   is visible but empty, it just shows a transparent layer -- which we want to avoid. The
   stateChanged handler covers all mutation paths.

   However, the WebGL active state also affects whether the watermark overlay canvas is used
   (line 2162-2163). The 2D path renders watermark into imageCanvas directly (line 1908),
   so the overlay canvas should be hidden when not in GL mode. This can be handled by also
   toggling display in `renderWatermarkOverlayCanvas`:
   ```typescript
   private renderWatermarkOverlayCanvas(): void {
     const isWebGLActive = this.glRendererManager.hdrRenderActive || this.glRendererManager.sdrWebGLRenderActive;
     const shouldRender = isWebGLActive && this.watermarkOverlay.isEnabled() && this.watermarkOverlay.hasImage();
     this.watermarkCanvas.style.display = shouldRender ? '' : 'none';
     if (!shouldRender) return;
     // ... render
   }
   ```

#### Edge Cases & Risks

- **Setting `style.display` every frame**: Setting a CSS property to the same value does NOT
  trigger layout/reflow. Browsers optimize this as a no-op. However, for cleanliness, we could
  track the current display state. Given the trivial cost, direct assignment is fine.
- **Export path**: `applyWatermarkToCanvas` (line 3835) renders directly, unaffected.
- **Interaction with Task 2.1 dirty flag**: `display:none` makes the dirty flag slightly less
  critical (hidden canvas is already excluded from compositing), but the dirty flag still saves
  the `clearRect` + `setTransform` CPU work, so both optimizations are complementary.

#### Test Specifications
**File:** `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.test.ts`

```typescript
describe('Task 2.3: display:none for Inactive Watermark Canvas', () => {
  it('VWR-WM-DISP-001: watermark canvas display is none on construction', () => {
    const tv = viewer as unknown as TestableViewer;
    // Watermark is disabled by default (DEFAULT_WATERMARK_STATE.enabled = false)
    expect(tv.watermarkCanvas.style.display).toBe('none');
  });

  it('VWR-WM-DISP-002: watermark canvas shown when enabled with image', () => {
    const tv = viewer as unknown as TestableViewer;
    // Simulate watermark being enabled with an image loaded
    // This would happen through stateChanged event
    vi.spyOn(tv.watermarkOverlay, 'isEnabled').mockReturnValue(true);
    vi.spyOn(tv.watermarkOverlay, 'hasImage').mockReturnValue(true);
    tv.watermarkOverlay.emit('stateChanged', {
      ...DEFAULT_WATERMARK_STATE,
      enabled: true,
    });
    // After GL render would show it; verify display is updated
  });

  it('VWR-WM-DISP-003: watermark canvas hidden when disabled', () => {
    const tv = viewer as unknown as TestableViewer;
    tv.watermarkCanvas.style.display = '';
    vi.spyOn(tv.watermarkOverlay, 'isEnabled').mockReturnValue(false);
    tv.watermarkOverlay.emit('stateChanged', {
      ...DEFAULT_WATERMARK_STATE,
      enabled: false,
    });
    expect(tv.watermarkCanvas.style.display).toBe('none');
  });
});
```

---

### Task 2.4: `display:none` for Inactive Paint Canvas
**Complexity:** small
**Files:** `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`
**Dependencies:** Task 2.2 (uses `paintHasContent` tracking)

#### Current Code Analysis

The paint canvas is created at line 525 and appended at line 533 with `pointer-events:none`.
It has no display management. In the common case (no annotations), this transparent canvas
is composited on every frame.

The paint canvas serves double duty:
1. Static annotation display (via `renderPaint()`)
2. Live stroke rendering target (via `inputHandler.renderLiveStroke()` / `renderLiveShape()`)

The live drawing paths need the paint canvas visible even when there are no committed annotations.

#### Implementation Steps

1. After paint canvas creation (line 533), set initial display to none:
   ```typescript
   this.paintCanvas.style.display = 'none';
   ```

2. In `renderPaint()`, toggle display based on content:
   ```typescript
   // After determining annotations.length === 0 and clearing:
   if (this.paintHasContent) {
     ctx.clearRect(...);
     this.paintHasContent = false;
     this.paintCanvas.style.display = 'none';
   }
   // After rendering annotations:
   this.paintHasContent = true;
   this.paintCanvas.style.display = '';
   ```

3. Before live stroke rendering (lines 1197-1200), ensure paint canvas is visible:
   ```typescript
   if (this.inputHandler.drawing && this.inputHandler.currentLivePoints.length > 0) {
     this.paintCanvas.style.display = '';
     this.inputHandler.renderLiveStroke();
   } else if (this.inputHandler.drawingShape && ...) {
     this.paintCanvas.style.display = '';
     this.inputHandler.renderLiveShape();
   }
   ```

4. When a paint tool is activated (tool selection), show the canvas preemptively to avoid
   a flash of missing canvas on first stroke.

#### Edge Cases & Risks

- **Pointer events**: The paint canvas has `pointer-events:none` (line 531), so hiding it
  does not affect mouse interaction. The `ViewerInputHandler` captures events on the
  `canvasContainer`, not on `paintCanvas` directly.
- **Live stroke rendering**: The `inputHandler.renderLiveStroke()` and `renderLiveShape()`
  methods render directly into `paintCanvas`/`paintCtx`. If the canvas is `display:none`,
  the browser may still allow 2D context operations (they just won't be visible). We must
  set `display:''` before these calls.
- **Advanced tool strokes**: Lines 1201-1203 skip `renderPaint` during advanced drawing.
  These tools modify `imageCanvas` directly. `paintCanvas` display state is irrelevant here.
- **Canvas resize during hidden state**: `updatePaintCanvasSize` (called at line 2123) sets
  `width`/`height` properties on the canvas. This works correctly even when `display:none`.

#### Test Specifications
**File:** `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.test.ts`

```typescript
describe('Task 2.4: display:none for Inactive Paint Canvas', () => {
  it('VWR-PT-DISP-001: paint canvas display is none on construction', () => {
    const tv = viewer as unknown as TestableViewer;
    expect(tv.paintCanvas.style.display).toBe('none');
  });

  it('VWR-PT-DISP-002: paint canvas shown when annotations rendered', () => {
    const tv = viewer as unknown as TestableViewer;
    const mockAnnotation = { /* mock */ };
    vi.spyOn(tv.paintEngine, 'getAnnotationsWithGhost').mockReturnValue([mockAnnotation]);
    vi.spyOn(tv.paintRenderer, 'renderAnnotations').mockImplementation(() => {});

    tv.renderPaint();

    expect(tv.paintCanvas.style.display).toBe('');
  });

  it('VWR-PT-DISP-003: paint canvas hidden when switching to frame with no annotations', () => {
    const tv = viewer as unknown as TestableViewer;
    tv.paintHasContent = true;
    tv.paintCanvas.style.display = '';
    vi.spyOn(tv.paintEngine, 'getAnnotationsWithGhost').mockReturnValue([]);

    tv.renderPaint();

    expect(tv.paintCanvas.style.display).toBe('none');
  });

  it('VWR-PT-DISP-004: paint canvas shown during live stroke', () => {
    // This tests the render() path where drawing is active
    const tv = viewer as unknown as TestableViewer;
    tv.paintCanvas.style.display = 'none';
    // Mock inputHandler.drawing = true with live points
    // Verify paintCanvas.style.display is '' before renderLiveStroke
  });
});
```

---

### Task 2.5: `display:none` for Inactive CanvasOverlay Subclasses
**Complexity:** small
**Files:**
- `/Users/lifeart/Repos/openrv-web/src/ui/components/CanvasOverlay.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/MatteOverlay.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/SpotlightOverlay.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/BugOverlay.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts`
**Dependencies:** none

#### Current Code Analysis

The `CanvasOverlay` base class (`CanvasOverlay.ts`) creates the canvas in the constructor
(lines 41-54) with `position:absolute`, `pointer-events:none`, and a z-index. There is no
`display:none` management at all.

Each subclass has an `isVisible()` method:
- **SafeAreasOverlay** (line 417): `return this.state.enabled;`
- **MatteOverlay** (line 217): `return this.settings.show;`
- **SpotlightOverlay** (line 539): `return this.state.enabled;`
- **BugOverlay** (line 313): `return this.state.enabled && this.bugImage !== null;`
- **EXRWindowOverlay** (line 281): `return this.state.enabled;`

All subclasses default to `enabled: false` / `show: false`, meaning they are invisible at
startup but their canvases participate in compositing.

The `setViewerDimensions()` method in the base class (line 84) calls `render()` only when
`isVisible()` returns true. But the canvas element remains in the DOM regardless.

**SpotlightOverlay special case**: This overlay toggles `pointer-events` between `auto` and
`none` in its `toggle()`/`enable()`/`disable()` methods (lines 302, 310, 318). When enabled,
it needs pointer events for drag interaction. Setting `display:none` would prevent pointer
events, which is correct -- the overlay should not receive events when hidden.

#### Implementation Steps

1. **In `CanvasOverlay` base class**, add display management in the constructor:
   ```typescript
   constructor(className: string, testId: string, zIndex: number) {
     // ... existing code ...
     // Start hidden; subclasses will show when they become visible
     this.canvas.style.display = 'none';
   }
   ```

2. **Add a protected method** `updateCanvasDisplay()` in the base class:
   ```typescript
   protected updateCanvasDisplay(): void {
     this.canvas.style.display = this.isVisible() ? '' : 'none';
   }
   ```

3. **In each subclass**, call `updateCanvasDisplay()` after state changes:

   - **SafeAreasOverlay**: In `setState()` (line 79), after `this.render()`:
     ```typescript
     setState(state: Partial<SafeAreasState>): void {
       this.state = { ...this.state, ...state };
       this.updateCanvasDisplay();
       this.render();
       this.emit('stateChanged', { ...this.state });
     }
     ```

   - **MatteOverlay**: In `setSettings()` (line 58), after `this.render()`:
     ```typescript
     setSettings(settings: Partial<MatteSettings>): void {
       this.settings = { ...this.settings, ...settings };
       this.updateCanvasDisplay();
       this.render();
       this.emit('settingsChanged', { ...this.settings });
     }
     ```

   - **SpotlightOverlay**: In `setState()` (line 283). Note: SpotlightOverlay already manages
     `pointer-events` in toggle/enable/disable. The `updateCanvasDisplay()` call should be
     placed so that `display:none` takes precedence over `pointer-events: auto`. The existing
     explicit `pointerEvents` assignments in toggle/enable/disable (lines 302, 310, 318) are
     redundant when `display:none` is active, but harmless.
     ```typescript
     setState(state: Partial<SpotlightState>): void {
       this.state = { ...this.state, ...state };
       this.updateCanvasDisplay();
       this.render();
       this.emit('stateChanged', { ...this.state });
     }
     ```

   - **BugOverlay**: In `setState()` (line 142). Note: `isVisible()` returns
     `this.state.enabled && this.bugImage !== null`, so the canvas is hidden until both
     enabled AND an image is loaded. The `loadImage()`/`setImage()`/`removeImage()` methods
     already call `this.render()` + `this.emit('stateChanged', ...)`. We need to add
     `updateCanvasDisplay()` in those paths too.
     ```typescript
     setState(partial: Partial<BugOverlayState>): void {
       // ... existing validation ...
       this.state = { ...this.state, ...validated };
       this.updateCanvasDisplay();
       this.render();
       this.emit('stateChanged', { ...this.state });
     }
     // Also in loadImage() onload callback and removeImage()
     ```

   - **EXRWindowOverlay**: In `setState()` (line 120) and in `setWindows()`/`clearWindows()`.
     Note: `isVisible()` only checks `enabled`, but `render()` also checks for
     `this.dataWindow` and `this.displayWindow` (lines 175-177). Setting display based on
     `isVisible()` alone means the canvas may be `display:''` but rendering nothing
     (transparent). This is correct for the compositing optimization -- a visible canvas
     that renders nothing still costs something, but the EXR window overlay is rarely enabled.
     For full optimization, override `isVisible()` to also check `hasWindows()`:
     ```typescript
     isVisible(): boolean {
       return this.state.enabled && this.dataWindow !== null && this.displayWindow !== null;
     }
     ```
     And call `updateCanvasDisplay()` in `setWindows()`, `clearWindows()`, and `setState()`.

4. **In `setViewerDimensions()`** (base class, line 84), also call `updateCanvasDisplay()`:
   ```typescript
   if (this.isVisible()) {
     try {
       this.render();
     } catch (err) { ... }
   }
   this.updateCanvasDisplay();
   ```
   This ensures display is updated when dimensions change (e.g., re-render might change visibility).

#### Edge Cases & Risks

- **SpotlightOverlay pointer events during drag**: If `display:none` is set while a drag
  is in progress, the `pointerup` handler listening on `window` (line 75) will still fire.
  The `onPointerUp` handler (line 210) resets drag state. Adding `display:none` mid-drag
  would cause the user to lose the drag, but this only happens if someone disables the
  spotlight while actively dragging it -- an edge case that is acceptable.
- **`render()` called on hidden canvas**: The `render()` method still runs drawing commands
  even when the canvas is `display:none`. This is intentional -- the canvas might be shown
  immediately after. The browser defers pixel work on hidden canvases. However, for a
  further optimization (out of scope), `render()` could check `isVisible()` before drawing.
  Actually, the base `setViewerDimensions()` already gates `render()` on `isVisible()` (line 84).
  But subclass `setState()` methods call `render()` unconditionally. This is a minor
  inefficiency -- the render computes drawing commands that are never composited.
- **CanvasOverlay subclasses that manage their own display**: None currently do, but any
  future subclass must be aware that the base class sets `display:none` in the constructor.

#### Test Specifications
**File:** `/Users/lifeart/Repos/openrv-web/src/ui/components/CanvasOverlay.test.ts` (new file,
or add to existing overlay test files)

Tests should be added to each overlay's existing test file:

**SafeAreasOverlay** (`/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.test.ts`):
```typescript
describe('Task 2.5: display:none for inactive overlay', () => {
  it('SA-DISP-001: canvas starts with display:none', () => {
    const overlay = new SafeAreasOverlay();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('SA-DISP-002: canvas shown when enabled', () => {
    const overlay = new SafeAreasOverlay();
    overlay.setState({ enabled: true });
    expect(overlay.getElement().style.display).toBe('');
    overlay.dispose();
  });

  it('SA-DISP-003: canvas hidden when disabled', () => {
    const overlay = new SafeAreasOverlay();
    overlay.setState({ enabled: true });
    overlay.setState({ enabled: false });
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });
});
```

**MatteOverlay** (`/Users/lifeart/Repos/openrv-web/src/ui/components/MatteOverlay.test.ts`):
```typescript
describe('Task 2.5: display:none for inactive overlay', () => {
  it('MATTE-DISP-001: canvas starts with display:none', () => {
    const overlay = new MatteOverlay();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('MATTE-DISP-002: canvas shown when show is true', () => {
    const overlay = new MatteOverlay();
    overlay.setSettings({ show: true });
    expect(overlay.getElement().style.display).toBe('');
    overlay.dispose();
  });

  it('MATTE-DISP-003: canvas hidden when show is false', () => {
    const overlay = new MatteOverlay();
    overlay.setSettings({ show: true });
    overlay.setSettings({ show: false });
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });
});
```

**SpotlightOverlay** (`/Users/lifeart/Repos/openrv-web/src/ui/components/SpotlightOverlay.test.ts`):
```typescript
describe('Task 2.5: display:none for inactive overlay', () => {
  it('SPOT-DISP-001: canvas starts with display:none', () => {
    const overlay = new SpotlightOverlay();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('SPOT-DISP-002: canvas shown when enabled', () => {
    const overlay = new SpotlightOverlay();
    overlay.enable();
    expect(overlay.getElement().style.display).toBe('');
    overlay.dispose();
  });

  it('SPOT-DISP-003: pointer-events and display both managed on toggle', () => {
    const overlay = new SpotlightOverlay();
    overlay.toggle(); // enables
    expect(overlay.getElement().style.display).toBe('');
    expect(overlay.getElement().style.pointerEvents).toBe('auto');
    overlay.toggle(); // disables
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });
});
```

**BugOverlay** (`/Users/lifeart/Repos/openrv-web/src/ui/components/BugOverlay.test.ts`):
```typescript
describe('Task 2.5: display:none for inactive overlay', () => {
  it('BUG-DISP-001: canvas starts with display:none', () => {
    const overlay = new BugOverlay();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('BUG-DISP-002: canvas remains hidden when enabled but no image', () => {
    const overlay = new BugOverlay();
    overlay.enable();
    // isVisible() = enabled && bugImage !== null => false
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('BUG-DISP-003: canvas shown when enabled AND image loaded', () => {
    const overlay = new BugOverlay();
    const img = new Image();
    img.width = 100;
    img.height = 50;
    overlay.setImage(img);
    // setImage() sets enabled=true and calls render()
    expect(overlay.getElement().style.display).toBe('');
    overlay.dispose();
  });

  it('BUG-DISP-004: canvas hidden after removeImage()', () => {
    const overlay = new BugOverlay();
    const img = new Image();
    img.width = 100;
    img.height = 50;
    overlay.setImage(img);
    overlay.removeImage();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });
});
```

**EXRWindowOverlay** (`/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.test.ts`):
```typescript
describe('Task 2.5: display:none for inactive overlay', () => {
  it('EXR-DISP-001: canvas starts with display:none', () => {
    const overlay = new EXRWindowOverlay();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('EXR-DISP-002: canvas shown when enabled with windows set', () => {
    const overlay = new EXRWindowOverlay();
    overlay.setWindows(
      { xMin: 0, yMin: 0, xMax: 99, yMax: 99 },
      { xMin: 0, yMin: 0, xMax: 199, yMax: 199 }
    );
    overlay.enable();
    expect(overlay.getElement().style.display).toBe('');
    overlay.dispose();
  });

  it('EXR-DISP-003: canvas hidden after clearWindows()', () => {
    const overlay = new EXRWindowOverlay();
    overlay.setWindows(
      { xMin: 0, yMin: 0, xMax: 99, yMax: 99 },
      { xMin: 0, yMin: 0, xMax: 199, yMax: 199 }
    );
    overlay.enable();
    overlay.clearWindows();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });
});
```

---

### Task 2.6: Lazy-Create DOM Overlay Canvases (LOW PRIORITY)
**Complexity:** medium
**Files:**
- `/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts`
**Dependencies:** Task 2.5 (display:none makes this less impactful)

#### Current Code Analysis

`OverlayManager` constructor (lines 57-123) eagerly creates all 6 DOM-based overlays and
immediately appends them to `canvasContainer`:
```typescript
this.safeAreasOverlay = new SafeAreasOverlay();
canvasContainer.appendChild(this.safeAreasOverlay.getElement());
// ... repeated for matteOverlay, timecodeOverlay, spotlightOverlay, bugOverlay, exrWindowOverlay
```

Each overlay constructor creates an `HTMLCanvasElement` (via `CanvasOverlay`) or `HTMLElement`
(TimecodeOverlay), gets a 2D context, and sets inline styles. This means at startup:
- 5 `<canvas>` elements created and appended (SafeAreas, Matte, Spotlight, Bug, EXRWindow)
- 5 `CanvasRenderingContext2D` objects allocated
- 1 `<div>` element with children created and appended (Timecode)

The `_referenceCanvas` in Viewer.ts (line 4271) already demonstrates the lazy-create pattern:
```typescript
if (!this._referenceCanvas) {
  this._referenceCanvas = document.createElement('canvas');
  // ... setup ...
  this.canvasContainer.appendChild(this._referenceCanvas);
}
```

#### Implementation Steps

1. Change overlay fields to nullable:
   ```typescript
   private safeAreasOverlay: SafeAreasOverlay | null = null;
   // ... etc for all DOM overlays
   ```

2. Add lazy getter/creator methods:
   ```typescript
   private getOrCreateSafeAreasOverlay(): SafeAreasOverlay {
     if (!this.safeAreasOverlay) {
       this.safeAreasOverlay = new SafeAreasOverlay();
       this.canvasContainer.appendChild(this.safeAreasOverlay.getElement());
       // Apply current dimensions if known
       if (this.lastWidth > 0) {
         this.safeAreasOverlay.setViewerDimensions(
           this.lastWidth, this.lastHeight, 0, 0, this.lastWidth, this.lastHeight
         );
       }
     }
     return this.safeAreasOverlay;
   }
   ```

3. Store `canvasContainer` and last dimensions as instance fields (currently they're only
   used in constructor and `updateDimensions`):
   ```typescript
   private canvasContainer: HTMLElement;
   private lastWidth = 0;
   private lastHeight = 0;
   ```

4. Update public accessors to use lazy getters:
   ```typescript
   getSafeAreasOverlay(): SafeAreasOverlay {
     return this.getOrCreateSafeAreasOverlay();
   }
   ```

5. Update `updateDimensions()` to use optional chaining for uncreated overlays:
   ```typescript
   updateDimensions(width: number, height: number): void {
     this.lastWidth = width;
     this.lastHeight = height;
     this.safeAreasOverlay?.setViewerDimensions(width, height, 0, 0, width, height);
     // ... etc
   }
   ```

6. Update `dispose()` to use optional chaining:
   ```typescript
   dispose(): void {
     this.safeAreasOverlay?.dispose();
     this.matteOverlay?.dispose();
     // ... etc
   }
   ```

#### Edge Cases & Risks

- **Z-index ordering**: All `CanvasOverlay` subclasses use explicit z-index values set in
  their constructors (SafeAreas: 45, Matte: 40, Spotlight: 44, Bug: 55, EXRWindow: 42).
  Since z-index is set inline, append order does not matter. This is safe for lazy creation.
- **TimecodeOverlay**: Uses a `<div>` with z-index 50, also safe for late append.
- **First-access latency**: Creating a canvas + getting a 2D context is fast (~0.1ms).
  The user action that triggers first access (e.g., clicking "Enable Safe Areas") is
  interactive, so sub-millisecond latency is acceptable.
- **Non-DOM overlays**: PixelProbe, FalseColor, LuminanceVisualization, ZebraStripes,
  ClippingOverlay are non-DOM (they operate on pixel data). These should remain eagerly
  created because they are wired up with event listeners at construction time (lines 92-122).
- **SpotlightOverlay event listeners**: SpotlightOverlay binds `window.addEventListener`
  in its constructor (line 74-75). If lazily created, these listeners are registered late,
  which is fine since they're only relevant when the spotlight is enabled.
- **Callbacks wiring**: Some overlays have event listeners set up in the OverlayManager
  constructor (e.g., LuminanceVisualization `stateChanged`, ZebraStripes `stateChanged`).
  Only DOM overlays are candidates for lazy creation; the pixel-effect overlays that have
  callbacks remain eagerly created.
- **Type narrowing burden**: Every external caller of `getSafeAreasOverlay()` etc. currently
  assumes a non-null return. The lazy getter returns the concrete type (not nullable), so
  this is transparent. However, if we change the field to nullable, internal code that
  accesses the field directly (rather than through the getter) needs updating. Currently all
  access goes through the public getters, so this is clean.

#### Test Specifications
**File:** `/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.test.ts` (new file)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { OverlayManager, OverlayManagerCallbacks } from './OverlayManager';
import { Session } from '../../core/session/Session';

function createMockCallbacks(): OverlayManagerCallbacks {
  return {
    refresh: vi.fn(),
    onProbeStateChanged: vi.fn(),
  };
}

describe('Task 2.6: Lazy-Create DOM Overlay Canvases', () => {
  it('OM-LAZY-001: DOM overlays not created at construction time', () => {
    const container = document.createElement('div');
    const session = new Session(); // or mock
    const callbacks = createMockCallbacks();
    const manager = new OverlayManager(container, session, callbacks);

    // Container should have fewer children than before (no overlay canvases)
    // Pixel-level overlays and non-DOM overlays are still created
    // Only TimecodeOverlay, MissingFrame, etc. may still be appended
    const canvasChildren = Array.from(container.children).filter(
      (el) => el instanceof HTMLCanvasElement
    );
    expect(canvasChildren.length).toBe(0);

    manager.dispose();
  });

  it('OM-LAZY-002: overlay created on first access', () => {
    const container = document.createElement('div');
    const session = new Session();
    const callbacks = createMockCallbacks();
    const manager = new OverlayManager(container, session, callbacks);

    const overlay = manager.getSafeAreasOverlay();
    expect(overlay).toBeTruthy();
    expect(container.contains(overlay.getElement())).toBe(true);

    manager.dispose();
  });

  it('OM-LAZY-003: second access returns same instance', () => {
    const container = document.createElement('div');
    const session = new Session();
    const callbacks = createMockCallbacks();
    const manager = new OverlayManager(container, session, callbacks);

    const overlay1 = manager.getSafeAreasOverlay();
    const overlay2 = manager.getSafeAreasOverlay();
    expect(overlay1).toBe(overlay2);

    manager.dispose();
  });

  it('OM-LAZY-004: updateDimensions is no-op for uncreated overlays', () => {
    const container = document.createElement('div');
    const session = new Session();
    const callbacks = createMockCallbacks();
    const manager = new OverlayManager(container, session, callbacks);

    // Should not throw
    expect(() => manager.updateDimensions(1920, 1080)).not.toThrow();

    manager.dispose();
  });

  it('OM-LAZY-005: lazy-created overlay receives stored dimensions', () => {
    const container = document.createElement('div');
    const session = new Session();
    const callbacks = createMockCallbacks();
    const manager = new OverlayManager(container, session, callbacks);

    manager.updateDimensions(1920, 1080);
    const overlay = manager.getSafeAreasOverlay();
    // Overlay should have received the 1920x1080 dimensions
    // (We'd need to check internal state or spy on setViewerDimensions)
    const spy = vi.spyOn(overlay, 'setViewerDimensions');
    // On creation, the lazy getter already called setViewerDimensions
    // Verify by checking the element dimensions or internal state

    manager.dispose();
  });

  it('OM-LAZY-006: dispose handles uncreated overlays gracefully', () => {
    const container = document.createElement('div');
    const session = new Session();
    const callbacks = createMockCallbacks();
    const manager = new OverlayManager(container, session, callbacks);

    // Don't access any overlay
    expect(() => manager.dispose()).not.toThrow();
  });
});
```

---

## Task Dependency Graph

```
Task 2.1 (watermark dirty flag)    ──> standalone
Task 2.2 (paint skip clear)         ──> standalone
Task 2.3 (watermark display:none)   ──> standalone (complements 2.1)
Task 2.4 (paint display:none)       ──> depends on 2.2 (paintHasContent)
Task 2.5 (overlay display:none)     ──> standalone
Task 2.6 (lazy overlay creation)    ──> after 2.5 (display:none reduces urgency)
```

Recommended implementation order: **2.5 -> 2.1 -> 2.3 -> 2.2 -> 2.4 -> 2.6**

Rationale: Task 2.5 is purely in the overlay classes (no Viewer.ts changes), making it the
safest starting point with the broadest impact (5 overlays). Tasks 2.1/2.3 and 2.2/2.4 are
natural pairs. Task 2.6 is the most invasive refactor with the lowest marginal benefit
(given Task 2.5 already removes compositing cost).

---

## Impact Analysis

### Before (common case: no watermark, no annotations, no overlays enabled)

Per frame, the browser composites:
- imageCanvas (opaque, base layer)
- glCanvas (transparent if not active, but present)
- matteOverlay canvas (transparent, composited)
- exrWindowOverlay canvas (transparent, composited)
- spotlightOverlay canvas (transparent, composited)
- safeAreasOverlay canvas (transparent, composited)
- bugOverlay canvas (transparent, composited)
- watermarkCanvas (transparent, cleared every frame via `clearRect`)
- paintCanvas (transparent, cleared every frame via `clearRect`)

Total: ~9 composited layers, 2 with per-frame CPU clear operations.

### After (all tasks implemented)

Per frame, the browser composites:
- imageCanvas (opaque, base layer)
- glCanvas (if active; already has own visibility logic)

All overlay canvases have `display:none` and are excluded from compositing.
Watermark and paint canvases skip `clearRect` entirely.

Total: ~1-2 composited layers, 0 unnecessary CPU clear operations.

**Estimated GPU compositing savings**: ~70-80% reduction in compositor work per frame.
**Estimated CPU savings**: ~0.1-0.2ms per frame from skipped `clearRect` calls.

## Rollback

Each task is independently revertible:
- Tasks 2.1/2.2: Remove dirty/hasContent flags and unconditionally clear+render.
- Tasks 2.3/2.4: Remove `style.display` assignments.
- Task 2.5: Remove `updateCanvasDisplay()` method and constructor `display:none`.
- Task 2.6: Revert nullable fields to eager construction in OverlayManager constructor.

No data migrations or API changes are involved. All changes are internal rendering optimizations.
