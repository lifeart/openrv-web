# 06 - Timeline Magnifier

## Overview

The Timeline Magnifier adds an expandable, zoomed-in sub-view of the timeline that provides frame-accurate navigation with an audio waveform overlay. It is toggled via the **F3** key (or a magnifying glass icon button on the main timeline) and appears as a new region inserted between the existing 80px timeline and the cache indicator in the bottom slot. When active, it shows a configurable time window centered on the playhead, rendered on a canvas with per-frame fidelity, audio waveform overlay, in/out nudge buttons, scroll/drag panning, and a zoom slider.

> **Design Note:** Desktop OpenRV's timeline magnifier ("Timeline Magnifier" or "Mini-Timeline") zooms the main timeline in-place rather than adding a second component. This plan deliberately uses a dual-view (overview + detail) pattern -- similar to Nuke Studio or Flame -- because it is a better fit for a web context where maximizing viewer area is critical and users benefit from never losing the global context. This is an intentional adaptation, not a faithful reproduction of the desktop paradigm.

### Goals

- Provide a magnified view of a narrow time window around the playhead for precise scrubbing.
- Overlay the audio waveform at the same zoomed scale so users can align edits to audio cues.
- Allow nudging the in/out points by single frames with dedicated buttons visible in the magnifier toolbar.
- Support scroll-wheel zoom, drag-to-pan, and a zoom slider for adjusting the visible time range.
- Follow the existing canvas-based, theme-aware, DPR-scaled rendering patterns used by `Timeline.ts`.
- Register F3 as a toggleable keyboard shortcut using the `DEFAULT_KEY_BINDINGS` + `KeyboardActionMap` system.
- Provide a UI affordance (magnifying glass icon on the main timeline) for non-keyboard users to toggle the magnifier.

---

## Current State

### Timeline (`src/ui/components/Timeline.ts`)
- Canvas-based, 80px tall, full-width.
- Renders track background, thumbnails, waveform (via `WaveformRenderer`), in/out markers, playhead, annotation markers, marks, transition overlays, and bottom info text.
- Uses `scheduleDraw()` pattern with `requestAnimationFrame` batching.
- Has access to `Session`, `PaintEngine`, `WaveformRenderer`, `ThumbnailManager`, `NoteOverlay`, `PlaylistManager`, `TransitionManager`.
- Theme colors resolved from `getThemeManager()` and cached until `themeChanged`.
- Subscriptions managed via `DisposableSubscriptionManager`.
- 60px left/right padding; track region is `[padding, padding + trackWidth] x [0, 42]`.
- Frame mapping: `frameToX(frame) = padding + ((frame - 1) / (duration - 1)) * trackWidth`.
- Creates its own `WaveformRenderer` in the constructor; waveform loading is triggered by `Timeline.loadWaveform()` on `sourceLoaded`.

### WaveformRenderer (`src/audio/WaveformRenderer.ts`)
- `WaveformRenderer` class wraps `WaveformData` (peaks Float32Array, duration, sampleRate).
- `render(ctx, x, y, width, height, startTime, endTime, color)` delegates to the standalone `renderWaveformRegion()` function.
- `renderWaveformRegion()` handles both zoomed-in (individual bars) and zoomed-out (sampled peaks) rendering automatically based on peaks-per-pixel ratio.
- The class does not have an event/notification system (no `on('loaded', ...)` mechanism).
- The magnifier can reuse the existing `WaveformRenderer` instance owned by the `Timeline` or receive the same `WaveformData` reference.
- **Ownership rule:** Only one owner (the `Timeline` or a shared app-level service) is responsible for the `loadFromVideo()`/`loadFromBlob()`/`clear()` lifecycle. The magnifier is a read-only consumer that checks `hasData()` before rendering.

### Layout (`src/ui/layout/LayoutManager.ts`, `src/services/LayoutOrchestrator.ts`)
- `LayoutManager.getBottomSlot()` returns a `<div class="layout-bottom">` with `flex-shrink: 0; overflow: hidden`.
- The `LayoutOrchestrator.createLayout()` method appends children in order: `cacheIndicatorEl`, `timelineEl`.
- The bottom panel height is stored in `LayoutStore` (default 120px) with a min of 80px and max of 40% viewport.
- The magnifier will be inserted between the cache indicator and the timeline (or after the timeline), and the bottom panel height will need to accommodate it when active.
- `LayoutOrchestrator` sets `presentationMode.setElementsToHide()` with `cacheIndicatorEl` and `timelineEl`. The magnifier element must be included in this list.
- `LayoutOrchestrator` hides the timeline via DOM style manipulation (opacity fade, then `display: none`) for single-image sources. The magnifier must participate in the same `updateImageMode` logic, including the fade transition.

### Keyboard Shortcuts (`src/utils/input/KeyBindings.ts`, `src/services/KeyboardActionMap.ts`)
- `DEFAULT_KEY_BINDINGS` is a flat `{ [action: string]: KeyBindingEntry }` map.
- Each entry has `code`, optional modifier flags (`ctrl`, `shift`, `alt`), `description`, and optional `context`.
- F3 is currently unused (F6 is used for focus zones, F11 for fullscreen).
- `KeyboardActionMap.buildActionHandlers()` returns `Record<string, () => void>` mapping action names to handlers.
- `AppKeyboardHandler` registers all bindings from `DEFAULT_KEY_BINDINGS` onto the `KeyboardManager`.

### Session API
- `session.inPoint` / `session.outPoint` -- current in/out frame numbers.
- `session.setInPoint(frame?)` / `session.setOutPoint(frame?)` -- set to given frame or current frame.
- `session.currentFrame` -- current playhead position (1-based).
- `session.currentSource?.duration` -- total frames.
- `session.fps` -- frames per second.
- `session.goToFrame(frame)` -- seek to a specific frame.
- Events: `frameChanged`, `inOutChanged`, `sourceLoaded`, `durationChanged`, `playbackChanged`, `marksChanged`.

---

## Proposed Architecture

### New Class: `TimelineMagnifier`

**File:** `src/ui/components/TimelineMagnifier.ts`

A self-contained canvas-based component (similar pattern to `Timeline.ts`) that renders a zoomed-in portion of the timeline.

```
TimelineMagnifier
  +-- toolbar (HTML div)
  |     +-- zoom slider (log-scale)
  |     +-- visible range label ("Frames 120-180 of 500")
  |     +-- [<<] In nudge-left button
  |     +-- [>>] In nudge-right button
  |     +-- [<<] Out nudge-left button
  |     +-- [>>] Out nudge-right button
  |     +-- follow toggle button
  |     +-- close button (X)
  +-- canvas (magnified timeline region)
```

#### State

| Field | Type | Description |
|-------|------|-------------|
| `centerFrame` | `number` | Frame at the horizontal center of the view. Follows playhead by default. |
| `visibleFrames` | `number` | Number of frames visible in the viewport (controlled by zoom). |
| `followPlayhead` | `boolean` | When true, `centerFrame` tracks `session.currentFrame`. Disabled on manual pan, re-enabled on playhead click. |
| `isDragging` | `boolean` | True during drag-to-pan. |
| `isVisible` | `boolean` | Whether the magnifier is currently shown. |
| `dragStartX` | `number` | Pointer X at drag start, used for drag-distance threshold. |
| `dragThresholdMet` | `boolean` | Whether the minimum drag distance (5px) has been exceeded. |

#### Key Behaviors

1. **Zoom**: Mouse wheel over canvas adjusts `visibleFrames` (min 10, max `duration`). Zoom slider mirrors this. Zoom is frame-centered (the frame under the cursor stays under the cursor). The wheel handler must call `e.preventDefault()` with `{ passive: false }` listener option to prevent page scrolling (critical for macOS trackpad).
2. **Pan**: Click-and-drag on the canvas background pans `centerFrame`, but only after a **minimum drag distance threshold of 5 pixels** is exceeded. Before the threshold is met, the interaction is treated as a potential click-to-seek. While dragging, `followPlayhead` is set to false. A "re-center" button or double-click re-enables follow.
3. **Seek**: Single click on canvas (i.e., pointerup without exceeding the drag threshold) seeks playhead to the clicked frame (same as main timeline).
4. **In/Out nudge**: Four small buttons: `[< In]` `[In >]` `[< Out]` `[Out >]`. Each click adjusts the respective point by +/- 1 frame, clamped to valid range.
5. **Waveform overlay**: Renders `renderWaveformRegion()` for the visible time window at the magnified scale. The magnifier checks `waveformRenderer.hasData()` before rendering (polling pattern, consistent with `Timeline.ts`).
6. **Playhead**: Vertical line + circle matching the main timeline style.
7. **In/Out markers**: Bracket markers matching the main timeline style, rendered at magnified scale.
8. **Marks**: Vertical lines for marks within the visible range.
9. **Frame tick marks**: Graduated ruler at the top of the canvas showing individual frame numbers when zoomed in enough.
10. **Out-of-range rendering**: When the visible range extends beyond frame 1 or the last frame (common with short clips), render the out-of-range area as a visually distinct dimmed/hatched region to clearly indicate "no content here."

#### Rendering

- Canvas height: fills remaining space after the toolbar (using flexbox layout).
- Canvas width: fills the bottom slot width.
- DPR scaling via the same `window.devicePixelRatio` pattern as `Timeline.ts`.
- `scheduleDraw()` with `requestAnimationFrame` batching.
- Colors from `getThemeManager()` consistent with the main timeline palette.
- Track region uses 40px left/right padding.
- Frame-to-X mapping: `frameToX(frame) = padding + ((frame - startFrame) / visibleFrames) * trackWidth` where `startFrame = centerFrame - visibleFrames / 2`.
- **Container layout:** The magnifier container uses `display: flex; flex-direction: column`. The toolbar has `flex-shrink: 0` and the canvas fills the remaining space with `flex: 1`. This naturally handles toolbar height variations (e.g., wrapping on narrow viewports) without hardcoding pixel values.

### Shared Rendering Helpers

To avoid duplicating 200+ lines of canvas drawing code between `Timeline.ts` and `TimelineMagnifier.ts`, extract the common rendering primitives into shared helper functions:

**File:** `src/ui/components/timelineRenderHelpers.ts`

Functions to extract:
- `drawPlayhead(ctx, x, height, color, circleRadius)` -- playhead line + circle
- `drawInOutBrackets(ctx, inX, outX, height, color)` -- in/out bracket markers
- `drawMarkLines(ctx, marks, frameToX, height, color)` -- mark vertical lines
- `drawAnnotationTriangles(ctx, annotations, frameToX, y, color)` -- annotation markers
- `drawInOutRange(ctx, inX, outX, y, height, color)` -- in/out range highlight
- `drawPlayedRegion(ctx, startX, endX, y, height, color)` -- played region fill

Both `Timeline.ts` and `TimelineMagnifier.ts` call these helpers with their respective coordinate mappings. This ensures visual consistency and reduces maintenance burden.

### Toolbar

An HTML `<div>` row above the canvas with:

- **Zoom slider**: `<input type="range">` controlling `visibleFrames`. Range: `[10, duration]`, **log-scale** (mandatory for usability with clips longer than a few hundred frames -- a linear slider is unusable for e.g., 100,000-frame clips).
- **Range label**: `<span>` showing "Frames N-M / D" (where N = first visible, M = last visible, D = duration).
- **In-point nudge**: Two `<button>` elements: `[<]` decrements `session.inPoint` by 1, `[>]` increments by 1. Disabled when at boundary.
- **Out-point nudge**: Two `<button>` elements: `[<]` decrements `session.outPoint` by 1, `[>]` increments by 1. Disabled when at boundary.
- **Follow toggle**: Small button or indicator showing whether `followPlayhead` is active. Clicking it re-enables following.
- **Close button**: Hides the magnifier (same as pressing F3).

All buttons use the existing `createIconButton` from `src/ui/components/shared/Button.ts` for consistency.

### Integration Points

1. **F3 key binding**: New entry `'timeline.toggleMagnifier'` in `DEFAULT_KEY_BINDINGS` with `code: 'F3'`.
2. **UI toggle button**: A small magnifying glass icon button in the main timeline's left padding area that toggles the magnifier. This provides a visual affordance for non-keyboard users (tablets, casual users) and follows the pattern used in Flame's mini-timeline zoom toggle.
3. **Action handler**: New entry in `buildActionHandlers()` that calls a toggle method on the magnifier.
4. **Bottom slot**: The magnifier element is inserted into the bottom slot between cache indicator and timeline. Its `display` toggles between `none` and `block`.
5. **Session wiring**: The magnifier listens to `frameChanged`, `inOutChanged`, `durationChanged`, `sourceLoaded`, `marksChanged`, `playbackChanged`, and `themeChanged` to schedule redraws.
6. **Waveform data**: The `WaveformRenderer` instance is passed from app-level wiring to both `Timeline` and `TimelineMagnifier` (preferred approach to avoid coupling). The magnifier is a read-only consumer: it checks `waveformRenderer.hasData()` in `draw()` before rendering waveform content. Only the `Timeline` (or a shared app-level service) owns the `loadFromVideo()`/`loadFromBlob()`/`clear()` lifecycle.
7. **Layout height**: When the magnifier is shown, the bottom panel grows. The magnifier tracks the **delta** it adds to the bottom panel size (not an absolute "previous size"). On hide, the delta is subtracted from the current panel size. This correctly handles cases where the user manually resizes the bottom panel while the magnifier is visible. The `MAX_BOTTOM_PANEL_RATIO` (40%) ceiling is respected.
8. **Presentation mode**: The magnifier element is added to `presentationMode.setElementsToHide()` in `LayoutOrchestrator` so it is hidden during presentation mode.
9. **Image mode**: The magnifier participates in the same `updateImageMode` logic as the timeline, including the opacity fade transition, so it is hidden for single-image sources.

---

## UI Design

### Visual Layout (bottom slot, magnifier active)

```
+----------------------------------------------------------------------+
| Cache Indicator (thin bar)                                           |
+----------------------------------------------------------------------+
| Magnifier Toolbar                                                    |
| [Zoom: ====o====] Frames 120-180 / 500  [<In] [In>] [<Out] [Out>]  |
| [Follow] [X]                                                        |
+----------------------------------------------------------------------+
| Magnifier Canvas (flex: fills remaining space, ~120px)               |
| |  tick marks: 120 121 122 ... 179 180                             |  |
| |  ~~waveform overlay~~                                            |  |
| |  [=====played=====|==in/out range===]                            |  |
| |                    ^ playhead                                    |  |
| |  marks: | | |                                                    |  |
+----------------------------------------------------------------------+
| Main Timeline (80px)  [magnifying glass icon in left padding]        |
+----------------------------------------------------------------------+
```

### Canvas Drawing Order (back to front)

1. Background fill (`colors.background`)
2. Track background rounded rect
3. Out-of-range hatched/dimmed regions (if visible range extends beyond clip boundaries)
4. Frame tick ruler (top 16px of canvas)
5. Waveform overlay (via `renderWaveformRegion`)
6. In/out range highlight
7. Played region
8. Mark lines
9. Annotation triangles
10. In/out bracket markers
11. Playhead line + circle

### Theme Integration

Reuses the same `cachedColors` pattern from `Timeline.ts`:
- `colors.background`, `colors.track`, `colors.played`, `colors.playhead`, `colors.inOutRange`, `colors.mark`, `colors.annotation`, `colors.waveform`, `colors.text`, `colors.textDim`, `colors.border`.
- Subscribes to `themeChanged` to invalidate cached colors.

### Responsive Behavior

- The magnifier canvas fills the full width of the bottom slot.
- On window resize, the magnifier recalculates its canvas dimensions and redraws.
- The frame ruler tick spacing adapts to the zoom level: at high zoom, every frame gets a tick; at lower zoom, every 5th or 10th frame.

---

## Implementation Steps

### Step 1: Extract shared rendering helpers

**File:** `src/ui/components/timelineRenderHelpers.ts`

1. Extract the common rendering primitives from `Timeline.ts` into standalone functions: `drawPlayhead`, `drawInOutBrackets`, `drawMarkLines`, `drawAnnotationTriangles`, `drawInOutRange`, `drawPlayedRegion`.
2. Refactor `Timeline.ts` to call these shared helpers instead of inline drawing code.
3. Verify existing tests still pass after the refactor.

### Step 2: Create `TimelineMagnifier` class

**File:** `src/ui/components/TimelineMagnifier.ts`

1. Define the class with constructor accepting `Session`, `WaveformRenderer`, and optional `PaintEngine`.
2. Implement `render()` returning the container `HTMLElement` (toolbar + canvas). Use flexbox layout: toolbar as `flex-shrink: 0`, canvas as `flex: 1`.
3. Implement `show()`, `hide()`, `toggle()`, `isVisible()`.
4. Implement `resize()` and `draw()` methods following the `Timeline.ts` pattern.
5. Implement `scheduleDraw()` with rAF batching.
6. Implement `bindEvents()` subscribing to session events, theme changes, and canvas pointer events.
7. Implement `dispose()` for cleanup.

### Step 3: Implement canvas rendering

1. Draw background and track.
2. Draw out-of-range hatched/dimmed regions for areas beyond frame 1 or the last frame.
3. Draw frame tick ruler at the top 16px of the canvas.
4. Calculate visible frame range from `centerFrame` and `visibleFrames`.
5. Draw waveform overlay using `WaveformRenderer.render()` with the magnified time window, after checking `hasData()`.
6. Draw in/out range, played region, marks, annotation markers using shared helpers from `timelineRenderHelpers.ts`.
7. Draw in/out bracket markers using shared helpers.
8. Draw playhead using shared helpers.

### Step 4: Implement interaction handlers

1. **Click-to-seek vs. drag-to-pan disambiguation**: On `pointerdown`, record `dragStartX` and set `dragThresholdMet = false`. On `pointermove`, calculate distance from `dragStartX`; only enter pan mode if distance exceeds **5 pixels**. On `pointerup`, if `dragThresholdMet` is false, treat as a click-to-seek: convert x-position to frame and call `session.goToFrame()`.
2. **Drag-to-pan**: Once the drag threshold is met, adjust `centerFrame` based on pointer delta. Set `followPlayhead = false`.
3. **Scroll-to-zoom**: On `wheel` event (registered with `{ passive: false }`), call `e.preventDefault()`, then adjust `visibleFrames` centered on cursor position.
4. **Double-click**: Re-enable `followPlayhead`.

### Step 5: Implement toolbar

1. Create toolbar HTML container with zoom slider, range label, nudge buttons, follow toggle, close button.
2. Wire zoom slider `input` event to update `visibleFrames`. Slider uses **log-scale** mapping: slider position maps linearly to `log(visibleFrames)`.
3. Wire in-point nudge buttons: `[<]` calls `session.setInPoint(session.inPoint - 1)`, `[>]` calls `session.setInPoint(session.inPoint + 1)`, clamped.
4. Wire out-point nudge buttons: `[<]` calls `session.setOutPoint(session.outPoint - 1)`, `[>]` calls `session.setOutPoint(session.outPoint + 1)`, clamped.
5. Wire follow toggle button.
6. Wire close button to `hide()`.

### Step 6: Add magnifying glass toggle button to main Timeline

1. In `Timeline.ts`, add a small magnifying glass icon button in the left padding area of the timeline canvas (or as an HTML overlay).
2. Wire the button to call `timelineMagnifier.toggle()`.
3. This provides a visual, mouse-accessible affordance for toggling the magnifier without relying on the F3 keyboard shortcut.

### Step 7: Register F3 keyboard shortcut

1. Add `'timeline.toggleMagnifier'` to `DEFAULT_KEY_BINDINGS` in `src/utils/input/KeyBindings.ts`:
   ```ts
   'timeline.toggleMagnifier': {
     code: 'F3',
     description: 'Toggle timeline magnifier'
   },
   ```
2. Add the action handler in `buildActionHandlers()` in `src/services/KeyboardActionMap.ts`.
3. Add `timelineMagnifier` to `ActionControls` interface and the `AppControlRegistry`.
4. Add the `'TIMELINE'` category entry in `AppKeyboardHandler.showShortcutsDialog()`.

### Step 8: Wire into layout

1. In `LayoutOrchestrator.createLayout()`, create the magnifier and insert its element into the bottom slot between `cacheIndicatorEl` and `timelineEl`.
2. Initially hidden (`display: none`).
3. Pass the `WaveformRenderer` from app-level wiring to both `Timeline` and the magnifier (avoiding coupling between the two components). The magnifier is a read-only consumer.
4. Register the magnifier's toggle method in the keyboard action map.
5. **Add the magnifier element to `presentationMode.setElementsToHide()`** so it is hidden during presentation mode.
6. **Add the magnifier element to the `updateImageMode` flow** so it participates in the same opacity fade transition and `display: none` logic used for the timeline when a single-image source is loaded.
7. **Bottom panel height management**: On `show()`, add the magnifier's height delta to the current `LayoutStore.panels.bottom.size`. On `hide()`, subtract the delta from the current panel size (not from a stale snapshot). Respect the `MAX_BOTTOM_PANEL_RATIO` (40%) ceiling; if there is not enough room, show a warning toast and keep the magnifier hidden.

### Step 9: Connect to App / AppControlRegistry

1. Add `timelineMagnifier` field to `AppControlRegistry` (or the controls subset interface).
2. Instantiate `TimelineMagnifier` during app initialization, passing `session` and the shared `WaveformRenderer`.
3. Call `timelineMagnifier.setPaintEngine(paintEngine)` after paint engine is ready.
4. Wire `session.on('sourceLoaded', ...)` to reset magnifier state (center, zoom).

### Step 10: Write tests

**File:** `src/ui/components/TimelineMagnifier.test.ts`

1. **Rendering tests**: Verify canvas draws correctly for various states (no source, with source, with waveform, with marks, with out-of-range regions for short clips).
2. **Visibility tests**: Verify `show()`, `hide()`, `toggle()` change display.
3. **Zoom tests**: Verify wheel events adjust `visibleFrames` within bounds. Verify `preventDefault()` is called on wheel events.
4. **Pan tests**: Verify drag adjusts `centerFrame` and disables follow. **Verify the 5px drag threshold**: pointer movement under 5px triggers seek, over 5px triggers pan.
5. **Seek tests**: Verify click (pointerdown + pointerup without exceeding drag threshold) maps to correct frame and calls `goToFrame`.
6. **Nudge tests**: Verify in/out nudge buttons adjust in/out points by 1 frame with clamping.
7. **Keyboard toggle test**: Verify F3 toggles visibility.
8. **Follow playhead tests**: Verify `centerFrame` tracks `currentFrame` when `followPlayhead` is true, and stops when false.
9. **Dispose tests**: Verify cleanup removes event listeners and cancels rAF.
10. **Bottom panel height tests**: Verify delta-based height management on show/hide, including the case where the user manually resizes while the magnifier is visible.

**File:** `src/ui/components/timelineRenderHelpers.test.ts`

1. **Shared helper tests**: Verify each extracted helper function renders correctly given mock canvas contexts.

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/ui/components/TimelineMagnifier.ts` | Main magnifier component class |
| `src/ui/components/TimelineMagnifier.test.ts` | Unit tests for magnifier |
| `src/ui/components/timelineRenderHelpers.ts` | Shared canvas rendering primitives |
| `src/ui/components/timelineRenderHelpers.test.ts` | Unit tests for shared helpers |

### Modified Files

| File | Change |
|------|--------|
| `src/utils/input/KeyBindings.ts` | Add `'timeline.toggleMagnifier'` entry with `code: 'F3'` |
| `src/services/KeyboardActionMap.ts` | Add `timelineMagnifier` to `ActionControls` interface; add `'timeline.toggleMagnifier'` handler in `buildActionHandlers()` |
| `src/AppControlRegistry.ts` | Add `timelineMagnifier` field/getter for the magnifier instance |
| `src/services/LayoutOrchestrator.ts` | Add magnifier element to bottom slot; add to `presentationMode.setElementsToHide()`; add to `updateImageMode` flow; add `timelineMagnifier` to `LayoutControlsSubset` interface |
| `src/AppKeyboardHandler.ts` | Add `'timeline.toggleMagnifier'` to the TIMELINE category in the shortcuts dialog |
| `src/ui/components/Timeline.ts` | Refactor to use shared rendering helpers from `timelineRenderHelpers.ts`; add magnifying glass toggle icon button in left padding area; expose waveform data access if the app-level wiring approach requires it |

### Optionally Modified

| File | Change |
|------|--------|
| `src/ui/components/ShortcutCheatSheet.ts` | If the cheat sheet auto-discovers entries, no change needed; otherwise add F3 to the timeline section |
| `src/ui/layout/LayoutStore.ts` | If the bottom panel needs a larger min-height when magnifier is active, adjust `MIN_BOTTOM_PANEL_HEIGHT`. Alternatively, the magnifier can resize the bottom panel programmatically via `LayoutStore.setPanelSize()` |

---

## Risks

### 1. Bottom Panel Height Management
**Risk:** The magnifier adds ~150px (toolbar + canvas) to the bottom slot. If the user has a small viewport, this could squeeze the viewer to an unusable size.
**Mitigation:** When the magnifier is shown, programmatically increase the bottom panel size by adding the magnifier's height as a **delta** to the current `LayoutStore.panels.bottom.size`. When hidden, subtract the delta from the *current* panel size (not a stale snapshot of the previous size). This correctly handles the case where the user manually resizes the panel via the drag handle while the magnifier is visible. Respect the `MAX_BOTTOM_PANEL_RATIO` (40%) ceiling. On a 900px viewport, the cap is 360px; the combined content (cache indicator ~4px + magnifier toolbar ~32px + magnifier canvas ~120px + timeline 80px = ~236px) fits with margin. If there is not enough room, show a warning toast and keep the magnifier hidden.

### 2. Performance During Playback
**Risk:** Drawing the magnifier canvas on every `frameChanged` event during playback could cause jank, especially with waveform rendering.
**Mitigation:** The `scheduleDraw()` rAF batching already naturally limits redraws to the display refresh rate. The waveform rendering cost is O(canvas_width) which is typically under 2000px and trivially fast. The magnifier canvas (120px height) is smaller than the main timeline and does not render thumbnails (the most expensive main timeline operation). Total additional CPU time per frame should be well under 1ms on modern hardware. As a safeguard, during active playback (`session.isPlaying === true`), waveform rendering can be skipped and only rendered when paused, but this is likely unnecessary given the low cost.

### 3. Waveform Data Sharing
**Risk:** The `WaveformRenderer` in `Timeline.ts` is a private field. Sharing it with the magnifier requires either making it accessible or loading waveform data independently (wasteful).
**Mitigation:** Pass the same `WaveformRenderer` instance to both `Timeline` and `TimelineMagnifier` from the app-level wiring (composition root). This avoids coupling the magnifier to the timeline. The `Timeline` (or a shared app-level service) remains the sole owner of the `loadFromVideo()`/`loadFromBlob()`/`clear()` lifecycle. The magnifier is a read-only consumer that checks `hasData()` in `draw()` before rendering -- this polling approach is simple and consistent with how `Timeline.ts` already works.

### 4. Zoom Precision at Extremes
**Risk:** At maximum zoom (10 visible frames), each frame occupies a very wide area. At minimum zoom (full duration), the magnifier becomes redundant with the main timeline.
**Mitigation:** Clamp `visibleFrames` to `[10, duration]`. The zoom slider uses log-scale mapping so that fine-grained zoom levels are easily reachable even for very long clips. When at minimum zoom, the magnifier still provides value via the frame tick ruler and larger waveform display.

### 5. In/Out Nudge Edge Cases
**Risk:** Nudging in-point past out-point (or vice versa) would create an invalid range.
**Mitigation:** Clamp in-point nudge to `[1, outPoint - 1]` and out-point nudge to `[inPoint + 1, duration]`. Disable the nudge button visually when at the boundary.

### 6. Image-Only Sources and Presentation Mode
**Risk:** For single images (`session.isSingleImage === true`), the entire timeline is hidden. The magnifier should follow the same behavior. Additionally, if the user enters presentation mode while the magnifier is visible, it would remain visible in an otherwise hidden bottom slot.
**Mitigation:** The magnifier element is added to `presentationMode.setElementsToHide()` in `LayoutOrchestrator`. The magnifier also participates in the `updateImageMode` flow, including the opacity fade transition, so it is hidden for single-image sources with the same visual treatment as the timeline.

### 7. Keyboard Shortcut Conflict
**Risk:** F3 might be intercepted by the browser (e.g., "Find" in some browsers on Windows).
**Mitigation:** F3 is used as "Find" only in some browsers on Windows. The existing `KeyboardManager` handles `e.preventDefault()` for registered shortcuts, which should suppress browser defaults. This is consistent with how F6 and F11 are already handled. If conflicts arise, F3 can be remapped via the custom key bindings system. Additionally, the magnifying glass toggle button on the main timeline provides an alternative activation method that does not depend on any keyboard shortcut.

### 8. Click-to-Seek vs. Drag-to-Pan Conflict
**Risk:** A single click on the magnifier canvas should seek the playhead, but a click is also the start of a drag-to-pan gesture. Without disambiguation, every pan attempt also seeks the playhead to the initial click position.
**Mitigation:** Use a minimum drag distance threshold of 5 pixels. On `pointerdown`, record the start position. On `pointermove`, only enter pan mode if the pointer has moved more than 5 pixels from the start. On `pointerup`, if the threshold was never exceeded, treat it as a click-to-seek. This is a standard interaction pattern; the existing `Timeline.ts` does not need this because it does not support panning.

---

## Review Notes (Nice to Have)

The following items are polish improvements that are not required for the initial implementation but would enhance the user experience:

- **Tooltip on Follow button:** When `followPlayhead` is disabled, show a tooltip on the Follow button: "Double-click canvas or click here to re-enable playhead tracking." This improves discoverability of the re-follow gesture.
- **Keyboard zoom in magnifier:** Consider supporting `+`/`-` keys for zooming when the magnifier has focus, in addition to the mouse wheel. This is standard in NLE timeline zoom interactions.
- **Magnifier visibility persistence:** Store the user's preferred magnifier visibility state in `localStorage` so it persists across page reloads. Currently treated as transient (off by default, toggled per session).
- **Frame number tooltip on hover:** When hovering over the magnifier canvas, show a small tooltip with the frame number under the cursor for immediate feedback without reading the frame ruler ticks.
- **Animated show/hide transition:** Add a CSS transition (height slide-down/slide-up) when the magnifier is toggled, rather than instant `display: none`/`display: block`. This is consistent with how the timeline itself uses opacity transitions in image mode.
- **Max visible frames cap:** The current design allows zooming out to the full duration. If this proves confusing, consider a soft cap like `min(duration, max(500, duration * 0.5))`, but the frame tick ruler and larger waveform still provide value at full-duration zoom, so a hard cap may not be necessary.
