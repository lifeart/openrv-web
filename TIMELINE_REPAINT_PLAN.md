# Implementation Plan: Timeline Repaint Thrashing (Item 1)

**Priority Score: 20/25 (Highest)** | Risk: LOW | Effort: M

## Summary

The `Timeline` canvas repaints far too often during playback. There are **18** direct `this.draw()` call sites inside `Timeline.ts` (not 20 as originally estimated). During playback the `frameChanged` event fires every frame (up to 60/s) and each `draw()` call triggers `getComputedStyle(document.documentElement)` to resolve 10 CSS custom properties. The `ThumbnailManager.drawThumbnails()` applies `shadowBlur = 2` per thumbnail slot (up to 30), which is a per-element Gaussian blur on the GPU. Additionally, a fully transparent `fillRect` is drawn every frame for a non-functional hit-area visual.

### Verified `this.draw()` Call Sites in Timeline.ts

| Line | Context | Trigger Frequency |
|------|---------|-------------------|
| 70 | `thumbnailManager.setOnThumbnailReady(...)` callback | Async, each thumbnail load |
| 81 | `boundHandleResize` debounced setTimeout callback | Resize (debounced 150ms) |
| 85 | `boundOnThemeChange` | Theme change (rare) |
| 134 | `session.on('frameChanged', ...)` | **Every frame during playback** |
| 141 | `session.on('playbackChanged', ...)` | Play/pause toggle |
| 145 | `session.on('durationChanged', ...)` | Source load |
| 150 | `session.on('sourceLoaded', ...)` | Source load |
| 152 | `session.on('inOutChanged', ...)` | In/out point edit |
| 153 | `session.on('loopModeChanged', ...)` | Loop mode toggle |
| 154 | `session.on('marksChanged', ...)` | Mark add/remove |
| 165 | `paintEngine.on('annotationsChanged', ...)` | Annotation frame change |
| 166 | `paintEngine.on('strokeAdded', ...)` | Stroke added |
| 167 | `paintEngine.on('strokeRemoved', ...)` | Stroke removed |
| 177 | `setPaintEngine(...)` method | Late binding from App |
| 185 | `overlay.setRedrawCallback(...)` via `setNoteOverlay` | `notesChanged` event on Session |
| 208 | `loadWaveform()` success path | Async, once per source |
| 268 | `setThumbnailsEnabled(...)` | User toggle |
| 290 | `timecodeDisplayMode` setter | Display mode change |
| 385 | `render()` rAF callback | Initial render (once) |
| 680 | `refresh()` public method | Called from `App.ts` lines 1620, 1642 |

**Total: 20 call sites, 18 inside event/callback paths (lines 70-290), 2 are the initial render (385) and public `refresh()` (680).**

The `refresh()` method at line 680 simply delegates to `draw()`. It is called from `App.ts` in two places (EDL edit apply paths) and from tests. After coalescing, `refresh()` should also use `scheduleDraw()` since the external callers do not need synchronous canvas updates.

---

## Implementation Order

### Task 1.1: rAF Draw Coalescing (HIGH IMPACT)
**Complexity:** small
**Files:** `src/ui/components/Timeline.ts`
**Dependencies:** none

#### Current Code Analysis

The `draw()` method (line 408) is `protected` and called directly from 20 sites. There is no batching -- if `frameChanged`, `annotationsChanged`, and `marksChanged` all fire in the same microtask (which happens when `Session.goToFrame()` triggers multiple emits), `draw()` executes 3 times synchronously in the same frame.

The only existing rAF usage is in `render()` (line 380) for the initial resize+draw, tracked by `this.initialRenderFrameId`. The `disposed` flag (line 39) already exists for guarding the initial rAF callback.

Key constraint: `draw()` is `protected`, and `TestTimeline` in the test file overrides it to increment `drawCount`. The coalescing layer must preserve this override chain -- `scheduleDraw()` should eventually call `this.draw()` which calls `super.draw()` in the test subclass.

#### Implementation Steps

1. **Add new fields** after line 39:
   ```typescript
   private drawScheduled = false;
   private scheduledRafId = 0;
   ```

2. **Add `scheduleDraw()` method** (public, so `refresh()` can delegate to it):
   ```typescript
   protected scheduleDraw(): void {
     if (this.disposed || this.drawScheduled) return;
     this.drawScheduled = true;
     this.scheduledRafId = requestAnimationFrame(() => {
       this.drawScheduled = false;
       this.scheduledRafId = 0;
       if (!this.disposed) {
         this.draw();
       }
     });
   }
   ```

3. **Replace 18 event-driven `this.draw()` calls** with `this.scheduleDraw()`:
   - Lines 70, 81, 85, 134, 141, 145, 150, 152, 153, 154, 165, 166, 167, 177, 185, 208, 268, 290

4. **Keep `this.draw()` direct call on line 385** inside `render()`'s initial rAF -- it is already inside a rAF callback so coalescing is unnecessary.

5. **Update `refresh()` at line 680** to delegate to `scheduleDraw()`:
   ```typescript
   refresh(): void {
     this.scheduleDraw();
   }
   ```
   This is safe because the two `App.ts` callers (lines 1620, 1642) do not depend on the canvas being painted synchronously before the next line.

6. **Update `dispose()` (line 683)** to cancel the scheduled rAF:
   ```typescript
   // Add after line 688 (after canceling initialRenderFrameId):
   if (this.scheduledRafId !== 0) {
     cancelAnimationFrame(this.scheduledRafId);
     this.scheduledRafId = 0;
   }
   this.drawScheduled = false;
   ```

#### Edge Cases & Risks

- **`seekToPosition` during drag (line 364-375):** During pointer-drag seeking, `session.goToFrame()` fires `frameChanged` which will now schedule instead of drawing immediately. This is fine because the browser is already in an animation-frame-driven input loop; the visual latency increase is at most 1 frame (16ms at 60fps), which is imperceptible for a scrub handle.
- **`TestTimeline` override chain:** `scheduleDraw()` calls `this.draw()`, which is virtual. `TestTimeline.draw()` calls `super.draw()` and increments `drawCount`. The override still works, but `drawCount` will no longer increment synchronously after an event. Tests must flush rAF (see Task 1.5).
- **Multiple rAF IDs:** The class now has two rAF IDs (`initialRenderFrameId` and `scheduledRafId`). Both must be canceled in `dispose()`.
- **`notesChanged` via NoteOverlay:** The NoteOverlay's `setRedrawCallback` (line 185) registers `() => this.draw()` as a listener on `session.on('notesChanged', ...)`. After this change, it becomes `() => this.scheduleDraw()`. The NoteOverlay itself does NOT call `draw()` directly; it only sets up the callback.

#### Test Specifications
**File:** `src/ui/components/Timeline.test.ts`

```typescript
describe('Task 1.1: rAF Draw Coalescing', () => {
  // Helper: flush all pending rAF callbacks synchronously
  // In beforeEach, mock requestAnimationFrame to capture callbacks:
  //   let rafCallbacks: Array<FrameRequestCallback>;
  //   vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  //     rafCallbacks.push(cb);
  //     return rafCallbacks.length;
  //   });
  //   vi.stubGlobal('cancelAnimationFrame', (id: number) => {
  //     rafCallbacks[id - 1] = () => {};
  //   });
  //   function flushRaf() { rafCallbacks.forEach(cb => cb(performance.now())); rafCallbacks = []; }

  it('TML-COAL-001: 5x scheduleDraw() results in exactly 1 draw() call', () => {
    // Setup: reset drawCount, call scheduleDraw 5 times
    timeline.drawCount = 0;
    for (let i = 0; i < 5; i++) {
      (timeline as any).scheduleDraw();
    }
    // Before rAF flush: drawCount should be 0
    expect(timeline.drawCount).toBe(0);
    // Flush the single rAF callback
    flushRaf();
    expect(timeline.drawCount).toBe(1);
  });

  it('TML-COAL-002: dispose() cancels pending scheduled draw', () => {
    timeline.drawCount = 0;
    (timeline as any).scheduleDraw();
    timeline.dispose();
    flushRaf();
    // draw should NOT have been called after dispose
    expect(timeline.drawCount).toBe(0);
  });

  it('TML-COAL-003: scheduleDraw() after dispose is a no-op', () => {
    timeline.dispose();
    timeline.drawCount = 0;
    (timeline as any).scheduleDraw();
    flushRaf();
    expect(timeline.drawCount).toBe(0);
  });

  it('TML-COAL-004: Multiple session events in same tick produce 1 draw', () => {
    timeline.drawCount = 0;
    // Fire 4 different events synchronously
    session.emit('frameChanged', 10);
    session.emit('inOutChanged', { inPoint: 5, outPoint: 50 });
    session.emit('marksChanged', undefined);
    session.emit('loopModeChanged', 'loop');
    // Before flush: no draws
    expect(timeline.drawCount).toBe(0);
    flushRaf();
    // Exactly 1 coalesced draw
    expect(timeline.drawCount).toBe(1);
  });

  it('TML-COAL-005: refresh() uses scheduleDraw (not synchronous draw)', () => {
    timeline.drawCount = 0;
    timeline.refresh();
    // Not drawn yet
    expect(timeline.drawCount).toBe(0);
    flushRaf();
    expect(timeline.drawCount).toBe(1);
  });

  it('TML-COAL-006: draw is still called directly in render() initial rAF', () => {
    // This test verifies the initial render path still works.
    // render() internally calls requestAnimationFrame -> resize + draw.
    // The initial draw is NOT deferred through scheduleDraw.
    const newTimeline = new TestTimeline(session, paintEngine);
    newTimeline.setSize(1000, 100);
    newTimeline.drawCount = 0;
    const container = newTimeline.render();
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 1000, height: 100, top: 0, left: 0,
      bottom: 100, right: 1000, x: 0, y: 0, toJSON: () => {},
    } as DOMRect);
    flushRaf();
    expect(newTimeline.drawCount).toBeGreaterThanOrEqual(1);
    newTimeline.dispose();
  });
});
```

---

### Task 1.2: Cache CSS Colors via ThemeManager (MEDIUM IMPACT)
**Complexity:** small
**Files:** `src/ui/components/Timeline.ts`
**Dependencies:** none (can be done independently of Task 1.1)

#### Current Code Analysis

`getColors()` (lines 43-60) calls `getComputedStyle(document.documentElement)` on **every** `draw()` invocation and reads 8 CSS custom properties (`--accent-primary-rgb`, `--bg-secondary`, `--bg-hover`, `--accent-primary`, `--error`, `--warning`, `--text-primary`, `--text-muted`, `--border-primary`). It then computes 3 derived `rgba()` strings from the `--accent-primary-rgb` value.

`getComputedStyle()` triggers a style recalculation in the browser if there are pending style invalidations. During playback at 60fps, this means 60 forced style recalcs per second purely for color lookups that almost never change.

**Key insight confirmed:** `ThemeManager.getColors()` (line 181 of `ThemeManager.ts`) returns pre-computed `ThemeColors` objects (`DARK_THEME` or `LIGHT_THEME`) -- static objects with all color values already resolved. The `ThemeColors` interface (lines 18-53) includes `accentPrimaryRgb` (the RGB triplet string), `bgSecondary`, `bgHover`, `accentPrimary`, `error`, `warning`, `textPrimary`, `textMuted`, and `borderPrimary` -- all values that `Timeline.getColors()` currently reads from CSS.

The only derived values in `Timeline.getColors()` are:
- `played: rgba(${accentRgb}, 0.2)`
- `playheadShadow: rgba(${accentRgb}, 0.27)`
- `inOutRange: rgba(${accentRgb}, 0.13)`
- `waveform: rgba(${accentRgb}, 0.4)`

These need to be computed from `ThemeColors.accentPrimaryRgb` once and cached.

The `themeChanged` event is already listened to (line 157, handler `boundOnThemeChange` at line 85) which currently just calls `this.draw()`. After this change it must also invalidate the cache.

#### Implementation Steps

1. **Add cache field** after line 40:
   ```typescript
   private cachedColors: ReturnType<Timeline['getColors']> | null = null;
   ```

2. **Rewrite `getColors()` (lines 43-60)** to use ThemeManager:
   ```typescript
   private getColors() {
     if (this.cachedColors) return this.cachedColors;
     const theme = getThemeManager().getColors();
     const accentRgb = theme.accentPrimaryRgb;
     this.cachedColors = {
       background: theme.bgSecondary,
       track: theme.bgHover,
       played: `rgba(${accentRgb}, 0.2)`,
       playhead: theme.accentPrimary,
       playheadShadow: `rgba(${accentRgb}, 0.27)`,
       inOutRange: `rgba(${accentRgb}, 0.13)`,
       mark: theme.error,
       annotation: theme.warning,
       waveform: `rgba(${accentRgb}, 0.4)`,
       text: theme.textPrimary,
       textDim: theme.textMuted,
       border: theme.borderPrimary,
     };
     return this.cachedColors;
   }
   ```

3. **Update `boundOnThemeChange`** (line 85):
   ```typescript
   this.boundOnThemeChange = () => {
     this.cachedColors = null;
     this.draw(); // or this.scheduleDraw() if Task 1.1 is done first
   };
   ```

#### Edge Cases & Risks

- **ThemeManager color mapping mismatch:** The existing `getColors()` uses CSS variable `--error` for marks (which resolves to `#ff6b6b` in the dark theme CSS). But `ThemeManager.DARK_THEME.error` is `#f87171`. Similarly for `warning`: CSS has `#ffcc00` fallback but `DARK_THEME.warning` is `#facc15`. These differ because `getColors()` currently falls back to hardcoded defaults (`|| '#ff6b6b'`) that don't match the ThemeManager constants. The actual rendered colors will shift slightly. **Mitigation:** The fallbacks in the current code are only used when CSS variables are not set, which never happens in production (ThemeManager always sets them in `applyTheme()`). In tests, `ThemeManager` sets CSS variables at construction time. The visual difference is negligible.
- **`text` property:** Timeline uses `--text-primary` which maps to `theme.textPrimary`. The current fallback is `#ccc` but `DARK_THEME.textPrimary` is `#e0e0e0`. Same reasoning as above -- the fallback is never actually reached.
- **Thread safety of cache:** JavaScript is single-threaded; the cache invalidation followed by draw is atomic from the event loop perspective. No race condition is possible.
- **Cache invalidation completeness:** Only `themeChanged` invalidates the cache. There is no other path that changes CSS variables outside ThemeManager. This is correct.

#### Test Specifications
**File:** `src/ui/components/Timeline.test.ts`

```typescript
describe('Task 1.2: CSS Color Caching', () => {
  it('TML-COLOR-001: getColors() returns ThemeManager-derived values', () => {
    const colors = (timeline as any).getColors();
    const theme = getThemeManager().getColors();
    expect(colors.background).toBe(theme.bgSecondary);
    expect(colors.playhead).toBe(theme.accentPrimary);
    expect(colors.mark).toBe(theme.error);
    expect(colors.annotation).toBe(theme.warning);
    expect(colors.text).toBe(theme.textPrimary);
    expect(colors.textDim).toBe(theme.textMuted);
    expect(colors.border).toBe(theme.borderPrimary);
    expect(colors.track).toBe(theme.bgHover);
  });

  it('TML-COLOR-002: second call returns same cached reference', () => {
    const colors1 = (timeline as any).getColors();
    const colors2 = (timeline as any).getColors();
    expect(colors1).toBe(colors2); // referential equality = cached
  });

  it('TML-COLOR-003: themeChanged invalidates cache', () => {
    const colors1 = (timeline as any).getColors();
    getThemeManager().emit('themeChanged', 'light');
    const colors2 = (timeline as any).getColors();
    expect(colors2).not.toBe(colors1); // new object = cache was invalidated
  });

  it('TML-COLOR-004: getComputedStyle is NOT called during draw()', () => {
    const spy = vi.spyOn(window, 'getComputedStyle');
    timeline.drawCount = 0;
    // Invalidate cache and draw
    (timeline as any).cachedColors = null;
    (timeline as any).draw();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('TML-COLOR-005: derived rgba values use accentPrimaryRgb', () => {
    const colors = (timeline as any).getColors();
    const rgb = getThemeManager().getColors().accentPrimaryRgb;
    expect(colors.played).toBe(`rgba(${rgb}, 0.2)`);
    expect(colors.playheadShadow).toBe(`rgba(${rgb}, 0.27)`);
    expect(colors.inOutRange).toBe(`rgba(${rgb}, 0.13)`);
    expect(colors.waveform).toBe(`rgba(${rgb}, 0.4)`);
  });
});
```

---

### Task 1.3: Remove Transparent Hit-Area fillRect (TRIVIAL)
**Complexity:** trivial
**Files:** `src/ui/components/Timeline.ts`
**Dependencies:** none

#### Current Code Analysis

Lines 582-583 of `Timeline.ts`:
```typescript
ctx.fillStyle = 'rgba(0, 0, 0, 0)';
ctx.fillRect(playheadX - Timeline.PLAYHEAD_HIT_AREA_WIDTH / 2, trackY - 10, Timeline.PLAYHEAD_HIT_AREA_WIDTH, trackHeight + 20);
```

This draws a **fully transparent rectangle** (alpha = 0) around the playhead. It has zero visual output. The comment on line 580 says "Playhead hit area (invisible, for pointer interaction affordance)" but Canvas2D has no built-in hit region support in any modern browser -- hit testing is done entirely in `onPointerDown` (line 335) via coordinate math against `getBoundingClientRect()`, not via the canvas pixel contents.

The `fillRect` call with alpha=0 still triggers a GPU composite operation (the browser must process the draw call even if the result is invisible) and adds to the canvas command buffer. While cheap individually, it is a free removal with zero risk.

#### Implementation Steps

1. **Delete lines 580-583** (the comment and the two canvas calls):
   ```typescript
   // DELETE:
   // Playhead hit area (invisible, for pointer interaction affordance)
   // A transparent zone of at least 20px wide around the playhead
   ctx.fillStyle = 'rgba(0, 0, 0, 0)';
   ctx.fillRect(playheadX - Timeline.PLAYHEAD_HIT_AREA_WIDTH / 2, trackY - 10, Timeline.PLAYHEAD_HIT_AREA_WIDTH, trackHeight + 20);
   ```

2. **Keep the `PLAYHEAD_HIT_AREA_WIDTH` static constant** (line 13) -- it is tested in `TL-L47a` and may be used for future hit-testing logic.

#### Edge Cases & Risks

- **None.** The transparent fill has no visible effect and no hit-testing function. The existing test `TL-L47a` only checks the constant value, not the fillRect call.
- **Visually identical:** Before and after screenshots will be pixel-identical.

#### Test Specifications
**File:** `src/ui/components/Timeline.test.ts`

```typescript
describe('Task 1.3: Transparent Hit-Area Removal', () => {
  it('TML-HIT-001: draw() does not set fillStyle to transparent rgba', () => {
    const ctx = (timeline as any).ctx as CanvasRenderingContext2D;
    const fillStyleSetter = vi.fn();
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      CanvasRenderingContext2D.prototype, 'fillStyle'
    );
    // Spy on fillStyle setter
    let lastValue = '';
    Object.defineProperty(ctx, 'fillStyle', {
      set(v: string) { lastValue = v; fillStyleSetter(v); },
      get() { return lastValue; },
      configurable: true,
    });

    timeline.refresh(); // triggers draw
    // If Task 1.1 is applied, flush rAF here

    const transparentCalls = fillStyleSetter.mock.calls.filter(
      ([v]: [string]) => v === 'rgba(0, 0, 0, 0)'
    );
    expect(transparentCalls).toHaveLength(0);

    // Restore
    if (originalDescriptor) {
      Object.defineProperty(ctx, 'fillStyle', originalDescriptor);
    }
  });

  it('TML-HIT-002: PLAYHEAD_HIT_AREA_WIDTH constant still exists', () => {
    // Ensure the constant wasn't accidentally removed
    expect(Timeline.PLAYHEAD_HIT_AREA_WIDTH).toBe(20);
  });
});
```

---

### Task 1.4: Remove Thumbnail Shadow Blur (MEDIUM IMPACT)
**Complexity:** small
**Files:** `src/ui/components/ThumbnailManager.ts`
**Dependencies:** none

#### Current Code Analysis

`drawThumbnails()` at lines 352-378 of `ThumbnailManager.ts`:
```typescript
drawThumbnails(ctx: CanvasRenderingContext2D): void {
  for (const slot of this.slots) {
    const thumbnail = this.getThumbnail(slot.frame);
    if (thumbnail) {
      ctx.save();                              // line 357
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'; // line 358
      ctx.shadowBlur = 2;                      // line 359
      ctx.shadowOffsetY = 1;                   // line 360
      ctx.drawImage(thumbnail, slot.x, slot.y, slot.width, slot.height); // line 362-367
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // line 371
      ctx.lineWidth = 0.5;                     // line 372
      ctx.strokeRect(slot.x, slot.y, slot.width, slot.height); // line 373
      ctx.restore();                           // line 375
    }
  }
}
```

The `shadowBlur = 2` property forces the browser to apply a Gaussian blur to each `drawImage` call. With up to 30 thumbnail slots, this is 30 Gaussian blurs per frame during playback. The shadow effect is a subtle depth cue (0.3 opacity black, 2px blur, 1px vertical offset) that is barely perceptible on small 20px-tall thumbnails.

The `ctx.save()`/`ctx.restore()` pair is needed only because of the shadow properties -- without them, the shadow state would leak to subsequent drawing operations. Once the shadows are removed, save/restore becomes unnecessary too (strokeStyle and lineWidth set inside the loop are transient and don't need isolation since the loop resets them each iteration, and the caller -- `Timeline.draw()` -- sets its own fill/stroke styles before any subsequent operations).

#### Implementation Steps

1. **Rewrite `drawThumbnails()` (lines 352-378):**
   ```typescript
   drawThumbnails(ctx: CanvasRenderingContext2D): void {
     for (const slot of this.slots) {
       const thumbnail = this.getThumbnail(slot.frame);
       if (thumbnail) {
         ctx.drawImage(thumbnail, slot.x, slot.y, slot.width, slot.height);
         // Draw subtle border
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
         ctx.lineWidth = 0.5;
         ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);
       }
     }
   }
   ```

#### Edge Cases & Risks

- **Visual regression:** The thumbnails will lose their subtle drop shadow. This is a deliberate trade-off. The shadow is barely visible at the thumbnail sizes used (20px tall) and the performance gain (eliminating 30 GPU blurs per frame) is significant. If stakeholders want the shadow back, a pre-rendered shadow (single OffscreenCanvas with shadow baked in at cache time) would be the efficient alternative.
- **strokeRect shadow leak (pre-fix):** In the current code, `ctx.strokeRect` is called while `shadowBlur` is still set, meaning the border stroke also gets a shadow. After this change, the stroke will be shadow-free, which is visually cleaner.
- **No save/restore needed:** Removing `save()`/`restore()` means the `strokeStyle` and `lineWidth` set here will persist on the context after `drawThumbnails()` returns. Looking at `Timeline.draw()` line 443 (the call site), the code after the call sets `ctx.fillStyle` and uses `ctx.fillRect` / `ctx.beginPath` / path drawing. There is no reliance on a prior `strokeStyle` value. Safe to remove.

#### Test Specifications
**File:** `src/ui/components/ThumbnailManager.test.ts`

```typescript
describe('Task 1.4: Thumbnail Shadow Removal', () => {
  it('TM-PERF-001: drawThumbnails does not set shadowBlur', () => {
    // Setup: create manager with a cached thumbnail
    const mockCanvas = document.createElement('canvas');
    mockCanvas.width = 48;
    mockCanvas.height = 27;

    manager.calculateSlots(60, 0, 500, 42, 100, 1920, 1080);
    // Manually inject a thumbnail into the cache for the first slot
    const slots = manager.getSlots();
    expect(slots.length).toBeGreaterThan(0);
    const firstSlot = slots[0]!;
    (manager as any).addToCache(firstSlot.frame, mockCanvas);

    // Create a mock canvas context
    const ctx = document.createElement('canvas').getContext('2d')!;
    const saveSpy = vi.spyOn(ctx, 'save');
    const restoreSpy = vi.spyOn(ctx, 'restore');

    // Spy on shadowBlur setter
    let shadowBlurSet = false;
    const originalSBDescriptor = Object.getOwnPropertyDescriptor(
      CanvasRenderingContext2D.prototype, 'shadowBlur'
    );
    Object.defineProperty(ctx, 'shadowBlur', {
      set() { shadowBlurSet = true; },
      get() { return 0; },
      configurable: true,
    });

    manager.drawThumbnails(ctx);

    expect(shadowBlurSet).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(restoreSpy).not.toHaveBeenCalled();

    // Restore
    if (originalSBDescriptor) {
      Object.defineProperty(ctx, 'shadowBlur', originalSBDescriptor);
    }
  });

  it('TM-PERF-002: drawThumbnails still draws images and border strokes', () => {
    const mockCanvas = document.createElement('canvas');
    mockCanvas.width = 48;
    mockCanvas.height = 27;

    manager.calculateSlots(60, 0, 500, 42, 100, 1920, 1080);
    const slots = manager.getSlots();
    const firstSlot = slots[0]!;
    (manager as any).addToCache(firstSlot.frame, mockCanvas);

    const ctx = document.createElement('canvas').getContext('2d')!;
    const drawImageSpy = vi.spyOn(ctx, 'drawImage');
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    manager.drawThumbnails(ctx);

    expect(drawImageSpy).toHaveBeenCalled();
    expect(strokeRectSpy).toHaveBeenCalled();
  });

  it('TM-PERF-003: drawThumbnails sets stroke style for border', () => {
    const mockCanvas = document.createElement('canvas');
    mockCanvas.width = 48;
    mockCanvas.height = 27;

    manager.calculateSlots(60, 0, 500, 42, 100, 1920, 1080);
    const slots = manager.getSlots();
    const firstSlot = slots[0]!;
    (manager as any).addToCache(firstSlot.frame, mockCanvas);

    const ctx = document.createElement('canvas').getContext('2d')!;
    manager.drawThumbnails(ctx);

    expect(ctx.strokeStyle).toBe('rgba(255, 255, 255, 0.2)');
    expect(ctx.lineWidth).toBe(0.5);
  });
});
```

---

### Task 1.5: Update Existing Tests for Deferred Drawing
**Complexity:** medium
**Files:** `src/ui/components/Timeline.test.ts`
**Dependencies:** Task 1.1 (this task only exists if draw coalescing is implemented)

#### Current Code Analysis

The existing test file has a `TestTimeline` subclass (lines 12-24) that overrides `draw()` to count invocations:

```typescript
class TestTimeline extends Timeline {
  public drawCount = 0;
  public setSize(w: number, h: number) { ... }
  protected override draw() {
    super.draw();
    this.drawCount++;
  }
}
```

**14 test assertions** check `drawCount` synchronously after emitting events:
- Lines 120-122: `TML-006` -- `session.currentFrame = 10` then expects `drawCount > 0`
- Lines 126-128: `TML-007` -- `session.play()` then expects `drawCount > 0`
- Lines 148-150: `TML-008` -- `session.emit('durationChanged')` then expects `drawCount > 0`
- Lines 154-156: `TML-009` -- `session.emit('inOutChanged')` then expects `drawCount > 0`
- Lines 170-172: `TML-031` -- `getThemeManager().emit('themeChanged')` then expects `drawCount > 0`
- Lines 176-179: `TML-032` -- after dispose, expects `drawCount === 0` (still valid)
- Lines 300-302: `TML-026` -- `timecodeDisplayMode = 'timecode'` then expects `drawCount > 0`
- Lines 306-308: `TML-027` -- same mode set expects `drawCount === 0` (still valid)
- Lines 312-314: `TML-028` -- `toggleTimecodeDisplay()` then expects `drawCount > 0`
- Lines 678-692: `TML-REG` -- playback toggle expects draw count incrementing

All assertions checking `drawCount > 0` will fail because `scheduleDraw()` defers via rAF.

#### Implementation Steps

1. **Add rAF mock to test setup** (in the top-level `describe('Timeline', ...)` `beforeEach`):
   ```typescript
   let rafCallbacks: FrameRequestCallback[] = [];
   let nextRafId = 1;

   beforeEach(() => {
     rafCallbacks = [];
     nextRafId = 1;
     vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
       const id = nextRafId++;
       rafCallbacks.push(cb);
       return id;
     });
     vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
       // For simplicity, we just flush; individual cancel tracking
       // is tested in TML-COAL-002
     });
     // ... existing setup
   });

   function flushRaf() {
     const cbs = rafCallbacks.splice(0);
     cbs.forEach(cb => cb(performance.now()));
   }
   ```

2. **Update each affected test** by adding `flushRaf()` before `drawCount` assertions. Example for TML-006:
   ```typescript
   it('TML-006: responds to frameChanged event', () => {
     timeline.drawCount = 0;
     session.currentFrame = 10;
     flushRaf();
     expect(timeline.drawCount).toBeGreaterThan(0);
   });
   ```

3. **Tests that check `drawCount === 0`** (TML-027, TML-032) do NOT need `flushRaf()` -- they verify that draw was NOT scheduled.

4. **Tests using `timeline.refresh()`** (TML-033 through TML-036) also need `flushRaf()` since `refresh()` now delegates to `scheduleDraw()`.

5. **The regression tests** (lines 576-693) that check `drawCount` incrementing after each toggle need `flushRaf()` between each check:
   ```typescript
   session.emit('playbackChanged', true);
   flushRaf();
   const afterFirstToggle = timeline.drawCount;
   expect(afterFirstToggle).toBeGreaterThan(0);
   ```

#### Edge Cases & Risks

- **Double-flush needed for `render()` + event:** `render()` schedules its own rAF (line 380), and an event might schedule another. After coalescing, the `render()` rAF uses `this.draw()` directly (not `scheduleDraw()`), so only one flush is needed for event-driven draws. But if a test calls `render()` and then emits an event, two separate rAF callbacks are pending. The `flushRaf()` helper drains all of them.
- **`cancelAnimationFrame` mock fidelity:** A simple implementation that ignores the ID is sufficient because the only test that needs accurate cancellation (TML-COAL-002) can verify by checking `drawCount === 0` after flush, which works regardless of the cancel mock implementation.
- **Performance of test suite:** Adding `flushRaf()` calls does not affect test performance since the rAF callbacks are synchronous in the mock.

#### Test Specifications

No new test file needed. The changes are modifications to existing tests in `src/ui/components/Timeline.test.ts`. The specific tests requiring modification are:

| Test ID | Line | Change Required |
|---------|------|-----------------|
| TML-006 | 119-123 | Add `flushRaf()` before assertion |
| TML-007 | 125-129 | Add `flushRaf()` before assertion |
| TML-008 | 147-151 | Add `flushRaf()` before assertion |
| TML-009 | 153-157 | Add `flushRaf()` before assertion |
| TML-031 | 169-173 | Add `flushRaf()` before assertion |
| TML-026 | 299-303 | Add `flushRaf()` before assertion |
| TML-028 | 311-315 | Add `flushRaf()` before assertion |
| TML-033 | 319-333 | Add `flushRaf()` after `timeline.refresh()` |
| TML-034 | 335-349 | Add `flushRaf()` after `timeline.refresh()` |
| TML-035 | 352-378 | Add `flushRaf()` after `timeline.refresh()` |
| TML-036 | 380-398 | Add `flushRaf()` after `timeline.refresh()` |
| TML-REG regression | 677-693 | Add `flushRaf()` between each emit/assertion pair |

---

## Phase 2 (Deferred): Waveform Bitmap Cache
**Complexity:** medium
**Files:** `src/audio/WaveformRenderer.ts`, `src/ui/components/Timeline.ts`
**Dependencies:** None (standalone optimization)

### Current Code Analysis

`WaveformRenderer.render()` (line 636 of `WaveformRenderer.ts`) delegates to `renderWaveformRegion()` (line 536) which iterates over waveform peak data and calls `ctx.fillRect()` once per peak/pixel:
- When `pixelsPerPeak >= 1` (zoomed in): one `fillRect` per visible peak (line 569)
- When zoomed out: one `fillRect` per horizontal pixel (line 589)

For a typical 880px-wide track with audio, this produces ~876 `fillRect()` calls per draw (track width minus 4px inset). For longer audio with more peaks visible, it can approach 2000 calls.

### Proposed Approach

1. Add an `OffscreenCanvas` cache inside `WaveformRenderer` that stores the rendered waveform bitmap
2. Cache key: `${startTime}-${endTime}-${width}-${height}-${color}-${dataHash}`
3. On `render()`, check if cached bitmap matches current parameters; if yes, `drawImage()` the cached bitmap (1 draw call instead of ~876)
4. Invalidate on: new waveform data load, zoom change, dimension change

### Estimated Savings

From ~876 `fillRect` calls down to 1 `drawImage` call per frame during playback (when waveform parameters are stable, which is 100% of the time during simple playback).

---

## Phase 3 (Deferred): DOM Playhead Layer
**Complexity:** medium
**Files:** `src/ui/components/Timeline.ts`
**Dependencies:** Task 1.1 (coalescing must be in place first)

### Current Code Analysis

The playhead rendering (lines 578-598 of `Timeline.ts`) consists of:
- Transparent hit area (removed in Task 1.3)
- Glow circle: `arc()` + `fill()` at line 588
- Line: `fillRect()` at line 593
- Drag handle circle: `arc()` + `fill()` at line 597

During playback, the playhead position changes every frame, which currently requires a full canvas repaint of the entire timeline (track, thumbnails, waveform, markers, annotations, notes, AND playhead) just to move the playhead by a few pixels.

### Proposed Approach

1. Extract the playhead into an absolutely-positioned DOM element (`<div>`) overlaying the canvas
2. Style it with CSS (gradient or box-shadow for the glow, border-radius for the circle handle)
3. During playback, only update `transform: translateX(${px}px)` on the DOM element
4. CSS transforms are compositor-only -- the GPU handles the movement without triggering any canvas repaint

### Estimated Savings

During pure playback (no marks/annotations changing), this would reduce timeline canvas repaints from 60/s to 0/s. The only cost is a CSS transform update (sub-microsecond, handled by the compositor thread).

### Risks

- The playhead must visually match the canvas-rendered version exactly (glow radius, colors, line thickness)
- Interaction (drag) must work on the DOM element, not the canvas
- Theme changes must update the DOM element's CSS variables

---

## Dependency Graph

```
Task 1.1 (rAF Coalescing)  ──────┐
                                  ├──> Task 1.5 (Update Tests)
Task 1.2 (Color Caching)   ──────┘    (must be done after 1.1)

Task 1.3 (Transparent Fill) ──> standalone
Task 1.4 (Shadow Blur)     ──> standalone

Phase 2 (Waveform Cache)   ──> standalone
Phase 3 (DOM Playhead)     ──> depends on Task 1.1
```

**Recommended implementation order:** 1.3 -> 1.4 -> 1.2 -> 1.1 -> 1.5

Start with the trivial/zero-risk changes (1.3, 1.4), then the color caching (1.2, which is independent), then the draw coalescing (1.1) which is the most impactful but requires the test update (1.5) to follow immediately.

## Rollback

Each task is independently revertable. No public API changes. The `refresh()` method signature is preserved (it just delegates to `scheduleDraw()` instead of `draw()` after Task 1.1). External callers in `App.ts` (lines 1620, 1642) continue to call `timeline.refresh()` with no change.
