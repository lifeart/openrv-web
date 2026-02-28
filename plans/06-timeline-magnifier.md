# 06 - Timeline Magnifier

## Overview

The Timeline Magnifier adds an expandable, zoomed-in sub-view of the timeline that provides frame-accurate navigation with an audio waveform overlay. It is toggled via the **F3** key and appears as a new region inserted between the existing 80px timeline and the cache indicator in the bottom slot. When active, it shows a configurable time window centered on the playhead, rendered on a canvas with per-frame fidelity, audio waveform overlay, in/out nudge buttons, scroll/drag panning, and a zoom slider.

### Goals

- Provide a magnified view of a narrow time window around the playhead for precise scrubbing.
- Overlay the audio waveform at the same zoomed scale so users can align edits to audio cues.
- Allow nudging the in/out points by single frames with dedicated buttons visible in the magnifier toolbar.
- Support scroll-wheel zoom, drag-to-pan, and a zoom slider for adjusting the visible time range.
- Follow the existing canvas-based, theme-aware, DPR-scaled rendering patterns used by `Timeline.ts`.
- Register F3 as a toggleable keyboard shortcut using the `DEFAULT_KEY_BINDINGS` + `KeyboardActionMap` system.

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

### WaveformRenderer (`src/audio/WaveformRenderer.ts`)
- `WaveformRenderer` class wraps `WaveformData` (peaks Float32Array, duration, sampleRate).
- `render(ctx, x, y, width, height, startTime, endTime, color)` delegates to the standalone `renderWaveformRegion()` function.
- `renderWaveformRegion()` handles both zoomed-in (individual bars) and zoomed-out (sampled peaks) rendering automatically based on peaks-per-pixel ratio.
- The magnifier can reuse the existing `WaveformRenderer` instance owned by the `Timeline` or receive the same `WaveformData` reference.

### Layout (`src/ui/layout/LayoutManager.ts`, `src/services/LayoutOrchestrator.ts`)
- `LayoutManager.getBottomSlot()` returns a `<div class="layout-bottom">` with `flex-shrink: 0; overflow: hidden`.
- The `LayoutOrchestrator.createLayout()` method appends children in order: `cacheIndicatorEl`, `timelineEl`.
- The bottom panel height is stored in `LayoutStore` (default 120px) with a min of 80px and max of 40% viewport.
- The magnifier will be inserted between the cache indicator and the timeline (or after the timeline), and the bottom panel height will need to accommodate it when active.

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
  |     +-- zoom slider
  |     +-- visible range label ("Frames 120-180 of 500")
  |     +-- [<<] In nudge-left button
  |     +-- [>>] In nudge-right button
  |     +-- [<<] Out nudge-left button
  |     +-- [>>] Out nudge-right button
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

#### Key Behaviors

1. **Zoom**: Mouse wheel over canvas adjusts `visibleFrames` (min 10, max `duration`). Zoom slider mirrors this. Zoom is frame-centered (the frame under the cursor stays under the cursor).
2. **Pan**: Click-and-drag on the canvas background pans `centerFrame`. While dragging, `followPlayhead` is set to false. A "re-center" button or double-click re-enables follow.
3. **Seek**: Single click on canvas seeks playhead to the clicked frame (same as main timeline).
4. **In/Out nudge**: Four small buttons: `[< In]` `[In >]` `[< Out]` `[Out >]`. Each click adjusts the respective point by +/- 1 frame, clamped to valid range.
5. **Waveform overlay**: Renders `renderWaveformRegion()` for the visible time window at the magnified scale.
6. **Playhead**: Vertical line + circle matching the main timeline style.
7. **In/Out markers**: Bracket markers matching the main timeline style, rendered at magnified scale.
8. **Marks**: Vertical lines for marks within the visible range.
9. **Frame tick marks**: Graduated ruler at the top of the canvas showing individual frame numbers when zoomed in enough.

#### Rendering

- Canvas height: 120px (the magnifier region).
- Canvas width: fills the bottom slot width.
- DPR scaling via the same `window.devicePixelRatio` pattern as `Timeline.ts`.
- `scheduleDraw()` with `requestAnimationFrame` batching.
- Colors from `getThemeManager()` consistent with the main timeline palette.
- Track region uses 40px left/right padding.
- Frame-to-X mapping: `frameToX(frame) = padding + ((frame - startFrame) / visibleFrames) * trackWidth` where `startFrame = centerFrame - visibleFrames / 2`.

### Toolbar

An HTML `<div>` row above the canvas with:

- **Zoom slider**: `<input type="range">` controlling `visibleFrames`. Range: `[10, duration]`, log-scale or linear depending on feel.
- **Range label**: `<span>` showing "Frames N-M / D" (where N = first visible, M = last visible, D = duration).
- **In-point nudge**: Two `<button>` elements: `[<]` decrements `session.inPoint` by 1, `[>]` increments by 1. Disabled when at boundary.
- **Out-point nudge**: Two `<button>` elements: `[<]` decrements `session.outPoint` by 1, `[>]` increments by 1. Disabled when at boundary.
- **Follow toggle**: Small button or indicator showing whether `followPlayhead` is active. Clicking it re-enables following.
- **Close button**: Hides the magnifier (same as pressing F3).

All buttons use the existing `createIconButton` from `src/ui/components/shared/Button.ts` for consistency.

### Integration Points

1. **F3 key binding**: New entry `'timeline.toggleMagnifier'` in `DEFAULT_KEY_BINDINGS` with `code: 'F3'`.
2. **Action handler**: New entry in `buildActionHandlers()` that calls a toggle method on the magnifier.
3. **Bottom slot**: The magnifier element is inserted into the bottom slot between cache indicator and timeline. Its `display` toggles between `none` and `block`.
4. **Session wiring**: The magnifier listens to `frameChanged`, `inOutChanged`, `durationChanged`, `sourceLoaded`, `marksChanged`, `playbackChanged`, and `themeChanged` to schedule redraws.
5. **Waveform data**: The magnifier receives the `WaveformRenderer` instance from the `Timeline` (or a shared reference). It calls `waveformRenderer.render(ctx, x, y, w, h, startTime, endTime, color)` with the magnified time range.
6. **Layout height**: When the magnifier is shown, the bottom panel effectively grows. The magnifier container has a fixed height (120px toolbar + canvas). The `LayoutStore` bottom panel min-height should accommodate this, or the magnifier can simply exist within the existing bottom slot alongside the timeline without changing the store's panel size.

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
| Magnifier Canvas (120px)                                             |
| |  tick marks: 120 121 122 ... 179 180                             |  |
| |  ~~waveform overlay~~                                            |  |
| |  [=====played=====|==in/out range===]                            |  |
| |                    ^ playhead                                    |  |
| |  marks: | | |                                                    |  |
+----------------------------------------------------------------------+
| Main Timeline (80px)                                                 |
+----------------------------------------------------------------------+
```

### Canvas Drawing Order (back to front)

1. Background fill (`colors.background`)
2. Track background rounded rect
3. Frame tick ruler (top 16px of canvas)
4. Waveform overlay (via `renderWaveformRegion`)
5. In/out range highlight
6. Played region
7. Mark lines
8. Annotation triangles
9. In/out bracket markers
10. Playhead line + circle

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

### Step 1: Create `TimelineMagnifier` class

**File:** `src/ui/components/TimelineMagnifier.ts`

1. Define the class with constructor accepting `Session`, `WaveformRenderer`, and optional `PaintEngine`.
2. Implement `render()` returning the container `HTMLElement` (toolbar + canvas).
3. Implement `show()`, `hide()`, `toggle()`, `isVisible()`.
4. Implement `resize()` and `draw()` methods following the `Timeline.ts` pattern.
5. Implement `scheduleDraw()` with rAF batching.
6. Implement `bindEvents()` subscribing to session events, theme changes, and canvas pointer events.
7. Implement `dispose()` for cleanup.

### Step 2: Implement canvas rendering

1. Draw background and track.
2. Draw frame tick ruler at the top 16px of the canvas.
3. Calculate visible frame range from `centerFrame` and `visibleFrames`.
4. Draw waveform overlay using `WaveformRenderer.render()` with the magnified time window.
5. Draw in/out range, played region, marks, annotation markers.
6. Draw in/out bracket markers.
7. Draw playhead.

### Step 3: Implement interaction handlers

1. **Click-to-seek**: On pointerdown, convert x-position to frame and call `session.goToFrame()`.
2. **Drag-to-pan**: On pointerdown + pointermove, adjust `centerFrame`. Set `followPlayhead = false`.
3. **Scroll-to-zoom**: On wheel event, adjust `visibleFrames` centered on cursor position.
4. **Double-click**: Re-enable `followPlayhead`.

### Step 4: Implement toolbar

1. Create toolbar HTML container with zoom slider, range label, nudge buttons, follow toggle, close button.
2. Wire zoom slider `input` event to update `visibleFrames`.
3. Wire in-point nudge buttons: `[<]` calls `session.setInPoint(session.inPoint - 1)`, `[>]` calls `session.setInPoint(session.inPoint + 1)`, clamped.
4. Wire out-point nudge buttons: `[<]` calls `session.setOutPoint(session.outPoint - 1)`, `[>]` calls `session.setOutPoint(session.outPoint + 1)`, clamped.
5. Wire follow toggle button.
6. Wire close button to `hide()`.

### Step 5: Register F3 keyboard shortcut

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

### Step 6: Wire into layout

1. In `LayoutOrchestrator.createLayout()`, create the magnifier and insert its element into the bottom slot between `cacheIndicatorEl` and `timelineEl`.
2. Initially hidden (`display: none`).
3. Pass the `WaveformRenderer` from `Timeline` to the magnifier (or share via a common reference).
4. Register the magnifier's toggle method in the keyboard action map.

### Step 7: Connect to App / AppControlRegistry

1. Add `timelineMagnifier` field to `AppControlRegistry` (or the controls subset interface).
2. Instantiate `TimelineMagnifier` during app initialization, passing `session` and the shared `WaveformRenderer`.
3. Call `timelineMagnifier.setPaintEngine(paintEngine)` after paint engine is ready.
4. Wire `session.on('sourceLoaded', ...)` to reset magnifier state (center, zoom).

### Step 8: Write tests

**File:** `src/ui/components/TimelineMagnifier.test.ts`

1. **Rendering tests**: Verify canvas draws correctly for various states (no source, with source, with waveform, with marks).
2. **Visibility tests**: Verify `show()`, `hide()`, `toggle()` change display.
3. **Zoom tests**: Verify wheel events adjust `visibleFrames` within bounds.
4. **Pan tests**: Verify drag adjusts `centerFrame` and disables follow.
5. **Seek tests**: Verify click maps to correct frame and calls `goToFrame`.
6. **Nudge tests**: Verify in/out nudge buttons adjust in/out points by 1 frame with clamping.
7. **Keyboard toggle test**: Verify F3 toggles visibility.
8. **Follow playhead tests**: Verify `centerFrame` tracks `currentFrame` when `followPlayhead` is true, and stops when false.
9. **Dispose tests**: Verify cleanup removes event listeners and cancels rAF.

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/ui/components/TimelineMagnifier.ts` | Main magnifier component class |
| `src/ui/components/TimelineMagnifier.test.ts` | Unit tests |

### Modified Files

| File | Change |
|------|--------|
| `src/utils/input/KeyBindings.ts` | Add `'timeline.toggleMagnifier'` entry with `code: 'F3'` |
| `src/services/KeyboardActionMap.ts` | Add `timelineMagnifier` to `ActionControls` interface; add `'timeline.toggleMagnifier'` handler in `buildActionHandlers()` |
| `src/AppControlRegistry.ts` | Add `timelineMagnifier` field/getter for the magnifier instance |
| `src/services/LayoutOrchestrator.ts` | Add magnifier element to bottom slot; add `timelineMagnifier` to `LayoutControlsSubset` interface |
| `src/AppKeyboardHandler.ts` | Add `'timeline.toggleMagnifier'` to the TIMELINE category in the shortcuts dialog |
| `src/ui/components/Timeline.ts` | Expose `getWaveformRenderer(): WaveformRenderer` (or `getWaveformData(): WaveformData | null`) so the magnifier can access waveform data without duplicating extraction |

### Optionally Modified

| File | Change |
|------|--------|
| `src/ui/components/ShortcutCheatSheet.ts` | If the cheat sheet auto-discovers entries, no change needed; otherwise add F3 to the timeline section |
| `src/ui/layout/LayoutStore.ts` | If the bottom panel needs a larger min-height when magnifier is active, adjust `MIN_BOTTOM_PANEL_HEIGHT`. Alternatively, the magnifier can resize the bottom panel programmatically via `LayoutStore.setPanelSize()` |

---

## Risks

### 1. Bottom Panel Height Management
**Risk:** The magnifier adds ~150px (toolbar + canvas) to the bottom slot. If the user has a small viewport, this could squeeze the viewer to an unusable size.
**Mitigation:** When the magnifier is shown, programmatically increase the bottom panel size via `LayoutStore.setPanelSize('bottom', currentSize + magnifierHeight)`. When hidden, restore the previous size. Respect the `MAX_BOTTOM_PANEL_RATIO` (40%) ceiling. If there is not enough room, show a warning toast and keep the magnifier hidden.

### 2. Performance During Playback
**Risk:** Drawing the magnifier canvas on every `frameChanged` event during playback could cause jank, especially with waveform rendering.
**Mitigation:** During active playback (`session.isPlaying === true`), throttle magnifier redraws to every 2nd or 3rd frame, or skip waveform rendering during playback and only render it when paused. The main timeline already handles this gracefully with its `scheduleDraw()` batching.

### 3. Waveform Data Sharing
**Risk:** The `WaveformRenderer` in `Timeline.ts` is a private field. Sharing it with the magnifier requires either making it accessible or loading waveform data independently (wasteful).
**Mitigation:** Add a public `getWaveformRenderer()` method to `Timeline`, or pass the `WaveformRenderer` instance to both `Timeline` and `TimelineMagnifier` from the app-level wiring (preferred approach to avoid coupling).

### 4. Zoom Precision at Extremes
**Risk:** At maximum zoom (10 visible frames), each frame occupies a very wide area. At minimum zoom (full duration), the magnifier becomes redundant with the main timeline.
**Mitigation:** Clamp `visibleFrames` to `[10, min(duration, 500)]`. When at minimum zoom, show an indicator suggesting the user use the main timeline. The 500-frame cap ensures the magnifier always provides some magnification benefit.

### 5. In/Out Nudge Edge Cases
**Risk:** Nudging in-point past out-point (or vice versa) would create an invalid range.
**Mitigation:** Clamp in-point nudge to `[1, outPoint - 1]` and out-point nudge to `[inPoint + 1, duration]`. Disable the nudge button visually when at the boundary.

### 6. Image-Only Sources
**Risk:** For single images (`session.isSingleImage === true`), the entire timeline is hidden. The magnifier should follow the same behavior.
**Mitigation:** The `LayoutOrchestrator` already hides `timelineEl` for single images. The magnifier element should be included in the same hide/show logic, or the magnifier should check `session.isSingleImage` and auto-hide.

### 7. Keyboard Shortcut Conflict
**Risk:** F3 might be intercepted by the browser (e.g., "Find" in some browsers on Windows).
**Mitigation:** F3 is used as "Find" only in some browsers on Windows. The existing `KeyboardManager` handles `e.preventDefault()` for registered shortcuts, which should suppress browser defaults. This is consistent with how F6 and F11 are already handled. If conflicts arise, F3 can be remapped via the custom key bindings system.
