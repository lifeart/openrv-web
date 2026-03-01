# Plan 19: Info Strip Overlay

## Overview

Desktop OpenRV provides a minimal bottom-of-viewer info strip (toggled with F7) that unobtrusively shows the current source filename. The web version of OpenRV currently offers a floating `InfoPanel` (positioned in a corner, toggled via `Shift+Alt+I`) and a rich side-panel ecosystem, but has no equivalent of this lightweight, always-on-bottom strip.

This plan introduces an **InfoStripOverlay** -- a semi-transparent horizontal bar fixed to the bottom edge of the viewer canvas that displays the source filename. It is designed to be non-intrusive, work in fullscreen and presentation mode, and follow the existing overlay patterns already established in the codebase.

**Scoping note**: Desktop OpenRV's info strip shows additional metadata (frame number, resolution, FPS, pixel format, color space) alongside the filename. This plan deliberately covers filename only as a v1 implementation, since the web version already has the richer InfoPanel for detailed metadata. Additional fields can be added in a future iteration (see Review Notes at the end).

Key behaviors:
- Semi-transparent strip pinned to the bottom of the viewer area.
- Shows the source filename (basename by default, full path on toggle via icon button or `Shift+F7`).
- Keyboard shortcut to toggle visibility (F7, matching desktop OpenRV).
- Works correctly in fullscreen and presentation mode.
- Does not interfere with pointer events on the viewer canvas.

## Current State

### Existing Overlay Architecture

The codebase has a well-established overlay system managed by `OverlayManager` (`src/ui/components/OverlayManager.ts`). Two categories of overlays exist:

1. **Canvas-based overlays** -- Extend `CanvasOverlay` (`src/ui/components/CanvasOverlay.ts`), which provides an HTML `<canvas>` element with HiDPI support, `setViewerDimensions()`, lazy creation, and lifecycle management. Used by: `SafeAreasOverlay` (z-index 45), `MatteOverlay` (z-index 40), `SpotlightOverlay` (z-index 44), `BugOverlay` (z-index 55), `EXRWindowOverlay` (z-index 42).

2. **DOM-based overlays** -- Create their own `<div>` containers with absolute positioning. Used by: `TimecodeOverlay` (z-index 50), `MissingFrameOverlay` (z-index 100), `InfoPanel` (z-index 500).

All overlays follow the pattern:
- Created lazily on first access.
- Appended to `canvasContainer` (the viewer's inner positioning container).
- Tracked and disposed by `OverlayManager`.
- Emit `stateChanged` events via `EventEmitter`.
- Implement `getElement()` / `dispose()` from `UIControl`.

### Keyboard Shortcut System

Shortcuts are defined in `src/utils/input/KeyBindings.ts` as `DEFAULT_KEY_BINDINGS` entries mapping action names to `KeyCombination` objects. Action handlers are wired in `src/services/KeyboardActionMap.ts` via `buildActionHandlers()`. The `AppKeyboardHandler` class (`src/AppKeyboardHandler.ts`) connects the two.

The shortcut dialog categories are defined in `AppKeyboardHandler.showShortcutsDialog()`.

### Source Metadata Access

`Session.currentSource` returns a `MediaSource` object (or `null`) with properties including `name` (string -- the filename), `url` (string -- full path/URL), `width`, `height`, `duration`, `fps`, `type`. The `InfoPanel` already accesses `source?.name` via the `infoPanelHandlers.ts` bridge.

Session events relevant to the info strip:
- `sourceLoaded` -- fired when a new source is loaded.
- `frameChanged` -- fired on frame navigation (relevant if showing frame-specific metadata).

### Z-Index Layering (viewer overlays)

| Overlay             | Z-Index |
|---------------------|---------|
| MatteOverlay        | 40      |
| EXRWindowOverlay    | 42      |
| SpotlightOverlay    | 44      |
| SafeAreasOverlay    | 45      |
| **InfoStripOverlay**| **48**  |
| TimecodeOverlay     | 50      |
| BugOverlay          | 55      |
| MissingFrameOverlay | 100     |
| InfoPanel           | 500     |

## Proposed Architecture

### Component: InfoStripOverlay

A new DOM-based overlay class (`InfoStripOverlay`) following the `TimecodeOverlay` pattern (extends `EventEmitter`, creates a `<div>` container, implements `UIControl`). DOM-based is preferred over canvas-based because the overlay is pure text with no graphical rendering, making HTML/CSS the simpler and more accessible approach.

```
src/ui/components/InfoStripOverlay.ts       -- Main overlay class
src/ui/components/InfoStripOverlay.test.ts  -- Unit tests
```

### State Interface

```typescript
export interface InfoStripOverlayState {
  enabled: boolean;
  showFullPath: boolean;  // false = basename only, true = full path/URL
  backgroundOpacity: number; // 0-1, default 0.5
}
```

### Integration Points

1. **OverlayManager** -- Add `_infoStripOverlay` field + `getInfoStripOverlay()` lazy accessor, following the exact pattern of `getTimecodeOverlay()`. Include in `dispose()`.

2. **Viewer** -- Add `getInfoStripOverlay()` pass-through accessor (like `getTimecodeOverlay()`). Wire session events (`sourceLoaded`) to update the strip text.

3. **KeyboardActionMap** -- Add `'view.toggleInfoStrip'` action that calls `viewer.getInfoStripOverlay().toggle()`. Add `'view.toggleInfoStripPath'` action that calls `viewer.getInfoStripOverlay().togglePathMode()`. Add `getInfoStripOverlay(): { toggle(): void; togglePathMode(): void }` to the `ActionViewer` interface.

4. **KeyBindings** -- Add `'view.toggleInfoStrip'` entry with `code: 'F7'`, `description: 'Toggle info strip overlay'`. Add `'view.toggleInfoStripPath'` entry with `code: 'F7'`, `shift: true`, `description: 'Toggle info strip full path'`.

5. **AppKeyboardHandler** -- Add `'view.toggleInfoStrip'` and `'view.toggleInfoStripPath'` to the `'VIEW'` category in `showShortcutsDialog()`.

6. **AppSessionBridge** -- On `sourceLoaded`, update the info strip text with the new source name/path.

## UI Design

### Visual Specification

```
+-----------------------------------------------------------+
|                                                           |
|                     Viewer Canvas                         |
|                                                           |
|                                                           |
|                                                           |
+-----------------------------------------------------------+
| shot_0042_comp_v03.exr                              [...]  |  <-- Info Strip
+-----------------------------------------------------------+
```

- **Position**: Bottom edge of the viewer canvas container, full width.
- **Height**: Auto, defined by padding (`padding: 6px 12px`) producing approximately 30-32px.
- **Background**: `rgba(0, 0, 0, 0.5)` -- semi-transparent black (configurable opacity).
- **Text color**: White (`#fff`) with text shadow `text-shadow: 0 1px 2px rgba(0,0,0,0.8)` for readability (matching TimecodeOverlay).
- **Font**: Monospace, 12px (`'SF Mono', 'Fira Code', 'Consolas', monospace, system-ui`), consistent with `TimecodeOverlay`. The `system-ui` fallback ensures CJK character coverage.
- **Text alignment**: Left-aligned with 12px horizontal padding.
- **Truncation**: Mode-dependent truncation strategy:
  - **Basename mode (default)**: Standard LTR `direction: ltr; text-overflow: ellipsis; overflow: hidden; white-space: nowrap` -- truncates from the right, preserving the beginning of the filename.
  - **Full-path mode**: RTL direction trick (`direction: rtl; text-overflow: ellipsis`) to preserve the tail (most informative part) of the path. A `<bdi>` wrapper or `unicode-bidi: plaintext` is used on the text element to prevent RTL direction from reversing the visual order of the actual text content.
- **Z-index**: 48 -- above SafeAreasOverlay (45) but below TimecodeOverlay (50), so it sits at the bottom without obscuring corner overlays.
- **Pointer events**: `pointer-events: none` on the strip container -- clicks pass through to the viewer.
- **Toggle icon button**: A small icon button (folder/ellipsis icon, approximately 20x20px) at the right edge of the strip with `pointer-events: auto` and a `click` handler to toggle between basename and full path display. This provides a visible, discoverable affordance for the toggle. Additionally, `Shift+F7` serves as a keyboard shortcut for the same toggle.
- **Show/hide transition**: Uses `opacity: 0/1` with `transition: opacity 150ms ease` instead of instant `display` toggling. When hidden, `pointer-events: none` is applied to prevent interaction. When shown, the container gets `opacity: 1`.
- **Test ID**: `data-testid='info-strip-overlay'` on the container element for E2E test targeting.

### TimecodeOverlay Overlap Handling

When both the InfoStripOverlay and TimecodeOverlay are visible, and the TimecodeOverlay is positioned at `bottom-left` or `bottom-right`, the two overlays can visually overlap (the strip occupies 0-32px from bottom; the timecode sits at ~16px from bottom). To address this:

- The InfoStripOverlay exposes a method `getHeight(): number` that returns the current height of the strip element.
- When the InfoStripOverlay becomes visible, it emits a `stateChanged` event. The OverlayManager (or Viewer) listens for this and, if the TimecodeOverlay is in a bottom position, adjusts the TimecodeOverlay's bottom margin by the strip height.
- Alternatively, the TimecodeOverlay can observe the InfoStripOverlay's visibility state and self-adjust. The simpler approach is to handle this in the OverlayManager's coordination logic.
- If implementing dynamic coordination is too complex for v1, document the overlap as a known limitation and use a static CSS rule: when the info strip is visible, bottom-positioned TimecodeOverlay elements get an additional `bottom` offset of 36px.

### Fullscreen / Presentation Mode

- The strip is inside the `canvasContainer`, which is preserved in both fullscreen and presentation mode. No special handling is needed -- the overlay will naturally remain visible.
- In presentation mode, UI elements listed in `PresentationMode.elementsToHide` are hidden, but `canvasContainer` children (overlays) are not in that list, so the info strip persists as expected.

### Accessibility

- `aria-label` on the container for screen reader identification.
- `role="status"` so screen readers can announce source changes.

## Implementation Steps

### Step 1: Create InfoStripOverlay class

Create `src/ui/components/InfoStripOverlay.ts`:

- Extend `EventEmitter<InfoStripOverlayEvents>`.
- Constructor creates a `<div>` container with:
  - `position: absolute; bottom: 0; left: 0; right: 0;`
  - Semi-transparent black background.
  - White monospace text with `text-shadow: 0 1px 2px rgba(0,0,0,0.8)`.
  - `pointer-events: none` (strip itself is non-interactive).
  - `z-index: 48`.
  - `opacity: 0` initially (hidden), with `transition: opacity 150ms ease`.
  - `padding: 6px 12px` (height determined by content + padding).
  - `data-testid='info-strip-overlay'`.
  - `aria-label='Source info strip'` and `role='status'`.
- Inner text element for the filename, with truncation CSS that switches between LTR (basename) and RTL (full path) modes.
- A toggle icon button element (`<button>`) at the right edge with:
  - `pointer-events: auto` to capture clicks.
  - A folder/ellipsis icon (inline SVG or text character).
  - `click` handler to toggle `showFullPath`, call `update()`, emit `stateChanged`.
  - Styled to be subtle (semi-transparent, small) so it does not dominate the strip.
- Accept a `Session` reference for subscribing to `sourceLoaded` events.
- Methods: `toggle()`, `enable()`, `disable()`, `isVisible()`, `setState()`, `getState()`, `getElement()`, `dispose()`, `setShowFullPath(boolean)`, `togglePathMode()`, `update()`, `getHeight()`.
- `update()` reads `session.currentSource`:
  - If `currentSource` is `null`, display "(no source)".
  - If `showFullPath` is false, extract the basename:
    - Try parsing `currentSource.url` with `new URL()` in a try/catch.
    - If it parses as a URL, extract the pathname and take the last segment.
    - If it does not parse, fall back to splitting on `/` and taking the last segment.
    - If `currentSource.name` is available and non-empty, prefer it over URL-derived name.
  - If `showFullPath` is true, display `currentSource.url` (or `currentSource.name` if URL is unavailable).
  - Apply the appropriate truncation CSS direction based on mode.
- On toggle icon click: toggle `showFullPath`, call `update()`, emit `stateChanged`.
- Event handler for `contextmenu` on the toggle icon: call `e.preventDefault()` and `e.stopPropagation()` to prevent the browser context menu and prevent bubbling to `ViewerInputHandler.onContextMenu`.

### Step 2: Create unit tests

Create `src/ui/components/InfoStripOverlay.test.ts`:

- Test initial state (hidden via opacity 0, basename mode).
- Test `toggle()` / `enable()` / `disable()`.
- Test filename display with basename vs. full path.
- Test basename extraction from various URL formats (`https://...`, `blob:...`, `file:///...`, plain paths).
- Test truncation CSS: verify LTR direction in basename mode, RTL direction in full-path mode.
- Test toggle icon click toggles path mode.
- Test `contextmenu` event on toggle icon calls `stopPropagation()`.
- Test `sourceLoaded` event triggers update.
- Test `stateChanged` event emission.
- Test `dispose()` cleanup.
- Test that element has correct z-index and `pointer-events: none`.
- Test `getElement()` returns the container.
- Test `data-testid` attribute is `'info-strip-overlay'`.
- Test "(no source)" display when `currentSource` is null.
- Test `getHeight()` returns the element height.
- Test opacity transition class is applied correctly.
- Test `togglePathMode()` method works correctly.

### Step 3: Register in OverlayManager

Modify `src/ui/components/OverlayManager.ts`:

- Add `import { InfoStripOverlay } from './InfoStripOverlay';`.
- Add private field `_infoStripOverlay: InfoStripOverlay | null = null;`.
- Add lazy accessor `getInfoStripOverlay()`:
  ```typescript
  getInfoStripOverlay(): InfoStripOverlay {
    if (!this._infoStripOverlay) {
      this._infoStripOverlay = new InfoStripOverlay(this.session);
      this.canvasContainer.appendChild(this._infoStripOverlay.getElement());
    }
    return this._infoStripOverlay;
  }
  ```
- Add `this._infoStripOverlay?.dispose();` in `dispose()`.

### Step 4: Expose from Viewer

Modify `src/ui/components/Viewer.ts`:

- Add `import type { InfoStripOverlay } from './InfoStripOverlay';` at the top.
- Add pass-through accessor:
  ```typescript
  getInfoStripOverlay(): InfoStripOverlay {
    return this.overlayManager.getInfoStripOverlay();
  }
  ```

### Step 5: Add keyboard shortcuts

Modify `src/utils/input/KeyBindings.ts`:

- Add entries to `DEFAULT_KEY_BINDINGS`:
  ```typescript
  'view.toggleInfoStrip': {
    code: 'F7',
    description: 'Toggle info strip overlay',
  },
  'view.toggleInfoStripPath': {
    code: 'F7',
    shift: true,
    description: 'Toggle info strip full path',
  },
  ```

Modify `src/services/KeyboardActionMap.ts`:

- Add `getInfoStripOverlay(): { toggle(): void; togglePathMode(): void }` to `ActionViewer` interface.
- Add handlers in `buildActionHandlers()`:
  ```typescript
  'view.toggleInfoStrip': () => viewer.getInfoStripOverlay().toggle(),
  'view.toggleInfoStripPath': () => viewer.getInfoStripOverlay().togglePathMode(),
  ```

### Step 6: Add to shortcut dialog categories

Modify `src/AppKeyboardHandler.ts`:

- Add `'view.toggleInfoStrip'` and `'view.toggleInfoStripPath'` to the `'VIEW'` array in the `categories` object within `showShortcutsDialog()`. Verify that the entry is added to the correct array (the `VIEW` array at approximately line 140).

### Step 7: Wire source updates in AppSessionBridge

Modify `src/AppSessionBridge.ts` (or the relevant handler in `src/handlers/`):

- On `sourceLoaded`, call `viewer.getInfoStripOverlay().update()` so the strip reflects the newly loaded source. This can be added to the existing `handleSourceLoaded` flow or directly in the session event subscription.

Note: The `InfoStripOverlay` itself subscribes to `session.on('sourceLoaded')` in its constructor, so this step may be unnecessary if the overlay self-updates. However, listing it here for completeness in case a bridge-level call is preferred for consistency with the `InfoPanel` pattern.

### Step 8: Update OverlayManager tests

Modify `src/ui/components/OverlayManager.test.ts`:

- Add test for `getInfoStripOverlay()` lazy creation.
- Add test that `dispose()` disposes the info strip overlay.
- Add test that the overlay element is appended to canvasContainer.

## Files to Create/Modify

### Files to Create

| File | Description |
|------|-------------|
| `src/ui/components/InfoStripOverlay.ts` | Main overlay class |
| `src/ui/components/InfoStripOverlay.test.ts` | Unit tests |

### Files to Modify

| File | Change |
|------|--------|
| `src/ui/components/OverlayManager.ts` | Add `_infoStripOverlay` field, `getInfoStripOverlay()` accessor, dispose call |
| `src/ui/components/Viewer.ts` | Add `getInfoStripOverlay()` pass-through, import type |
| `src/utils/input/KeyBindings.ts` | Add `'view.toggleInfoStrip'` (F7) and `'view.toggleInfoStripPath'` (Shift+F7) bindings |
| `src/services/KeyboardActionMap.ts` | Add `getInfoStripOverlay` to `ActionViewer` with `toggle()` and `togglePathMode()`, add handlers |
| `src/AppKeyboardHandler.ts` | Add `'view.toggleInfoStrip'` and `'view.toggleInfoStripPath'` to VIEW category |
| `src/ui/components/OverlayManager.test.ts` | Add tests for info strip overlay lifecycle |

## Risks

### 1. F7 Key Conflict
**Risk**: The F7 key may be intercepted by the browser or OS (e.g., macOS uses F-keys for system functions by default; Firefox uses F7 for caret browsing).
**Mitigation**: F7 is not currently used by any binding in `DEFAULT_KEY_BINDINGS`. Browsers generally allow F7 interception. Firefox shows a "Caret Browsing" confirmation dialog the first time F7 is pressed; calling `preventDefault()` on the keydown event in the capture phase (which `KeyboardManager` uses) should preempt this. The binding is customizable via the existing `CustomKeyBindingsManager`, so users can rebind if needed. The `codeToKey` function in `KeyBindings.ts` does not have a case for `F7`, but it will display the raw code `F7` in the shortcut dialog, which is readable and acceptable.

### 2. Overlap with Bottom-Positioned Overlays
**Risk**: The info strip at the bottom could visually conflict with TimecodeOverlay when it is positioned at `bottom-left` or `bottom-right` (the strip occupies 0-32px from bottom; the timecode sits at ~16px from bottom).
**Mitigation**: When both overlays are visible and TimecodeOverlay is in a bottom position, the TimecodeOverlay's bottom offset should be increased by the strip height (~36px). This is handled via coordination in the OverlayManager or via a static CSS adjustment. See the "TimecodeOverlay Overlap Handling" section above for details. If dynamic coordination is deferred, this is documented as a known limitation.

### 3. Long Filenames / Paths
**Risk**: Very long filenames or deep directory paths may not fit in the strip, especially on narrow viewports.
**Mitigation**: Mode-dependent truncation strategy prevents visual confusion:
- **Basename mode**: Standard LTR `text-overflow: ellipsis` truncates from the right, keeping the beginning of the filename visible (e.g., `shot_0042_comp_beauty_p...`).
- **Full-path mode**: RTL direction trick preserves the tail of the path (most informative part). A `<bdi>` wrapper or `unicode-bidi: plaintext` prevents the RTL direction from reversing the actual text content.

### 4. Pointer Events and Event Propagation
**Risk**: The toggle icon button uses `pointer-events: auto` inside a `pointer-events: none` container. Click and contextmenu events on the button will bubble up to `canvasContainer`, where `ViewerInputHandler.onContextMenu` may intercept them.
**Mitigation**: The toggle icon's event handlers call `e.stopPropagation()` in addition to `e.preventDefault()` to prevent events from bubbling to the viewer's input handler. This ensures the toggle interaction is fully contained within the strip.

### 5. Presentation Mode Interaction
**Risk**: The info strip might be considered UI clutter that should be hidden in presentation mode.
**Mitigation**: The strip lives inside `canvasContainer`, which is preserved during presentation mode (only `elementsToHide` elements are hidden). This is intentional -- the strip is a viewer overlay like timecode or safe areas, which also persist in presentation mode. If users want it hidden, they can toggle it off with F7 before or during presentation.

### 6. Source Name Availability
**Risk**: `session.currentSource` may be `null` when no source is loaded, and `name` may be empty or a URL blob reference.
**Mitigation**: The `update()` method checks for `null` source and empty names, displaying "(no source)" as a fallback. For URL-based sources (`blob:`, `https:`, `file:` URLs), the basename extraction uses `new URL()` parsing in a try/catch to correctly extract the filename component from the URL path, falling back to `/`-split for non-URL strings.

## Review Notes

The following items were identified during expert review as beneficial future enhancements. They are not required for the v1 implementation but should be considered for follow-up work:

1. **Persist strip state across page reloads** using `PreferencesManager` (enabled flag and `showFullPath` preference). The TimecodeOverlay does not persist state either, so this is consistent for v1, but would improve UX.

2. **Optionally show frame number in the strip** (e.g., `shot_0042_comp_v03.exr  [Frame 1042/2400]`). This would reduce the need to have TimecodeOverlay visible simultaneously and more closely match desktop OpenRV's info strip behavior. Could be gated behind a `showFrameNumber` field in the state interface.

3. **Show resolution and FPS** in the strip to more closely match desktop OpenRV's info strip. This could be an opt-in field similar to InfoPanel's configurable fields.

4. **CJK font fallback**: The font stack now includes `system-ui` as a fallback, but VFX pipelines with Japanese/Korean filenames may benefit from explicit CJK font testing.

5. **InfoPanel overlap**: Both the InfoStripOverlay and InfoPanel display the filename. They serve complementary purposes (strip = persistent at-a-glance identification; panel = detailed inspection). Having both enabled simultaneously is not a bug, but users should be aware that the filename appears in two places.

6. **Sequence source display**: When viewing an image sequence (`shot_0042.####.exr`), the `name` field on `MediaSource` may reflect the pattern or the first frame's name. A future enhancement could show the sequence pattern or the current frame's actual filename, which matters for multi-shot playlists.
