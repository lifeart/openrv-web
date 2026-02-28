# Plan 19: Info Strip Overlay

## Overview

Desktop OpenRV provides a minimal bottom-of-viewer info strip (toggled with F7) that unobtrusively shows the current source filename. The web version of OpenRV currently offers a floating `InfoPanel` (positioned in a corner, toggled via `Shift+Alt+I`) and a rich side-panel ecosystem, but has no equivalent of this lightweight, always-on-bottom strip.

This plan introduces an **InfoStripOverlay** -- a semi-transparent horizontal bar fixed to the bottom edge of the viewer canvas that displays the source filename. It is designed to be non-intrusive, work in fullscreen and presentation mode, and follow the existing overlay patterns already established in the codebase.

Key behaviors:
- Semi-transparent strip pinned to the bottom of the viewer area.
- Shows the source filename (basename by default, full path on right-click toggle).
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

3. **KeyboardActionMap** -- Add `'view.toggleInfoStrip'` action that calls `viewer.getInfoStripOverlay().toggle()`.

4. **KeyBindings** -- Add `'view.toggleInfoStrip'` entry with `code: 'F7'`, `description: 'Toggle info strip overlay'`.

5. **AppKeyboardHandler** -- Add `'view.toggleInfoStrip'` to the `'VIEW'` category in `showShortcutsDialog()`.

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
| shot_0042_comp_v03.exr                                    |  <-- Info Strip
+-----------------------------------------------------------+
```

- **Position**: Bottom edge of the viewer canvas container, full width.
- **Height**: ~28px (single line of text + padding).
- **Background**: `rgba(0, 0, 0, 0.5)` -- semi-transparent black (configurable opacity).
- **Text color**: White (`#fff`) with subtle text shadow for readability.
- **Font**: Monospace, 12px (`'SF Mono', 'Fira Code', 'Consolas', monospace`), consistent with `TimecodeOverlay`.
- **Text alignment**: Left-aligned with 12px horizontal padding.
- **Truncation**: Ellipsis truncation from the left when the path is too long to fit (CSS `direction: rtl; text-overflow: ellipsis` trick for path truncation, keeping the most informative tail visible).
- **Z-index**: 48 -- above SafeAreasOverlay (45) but below TimecodeOverlay (50), so it sits at the bottom without obscuring corner overlays.
- **Pointer events**: `pointer-events: none` -- clicks pass through to the viewer.
- **Right-click toggle**: A small region or the entire strip itself will listen for `contextmenu` events (with `pointer-events: auto` on that element only) to toggle between basename and full path display. The default browser context menu is suppressed via `preventDefault()`.

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
  - White monospace text.
  - `pointer-events: none` (strip itself is non-interactive).
  - `z-index: 48`.
  - `display: none` initially.
- Inner text element for the filename.
- The strip has a transparent "hit area" `<div>` with `pointer-events: auto` to capture `contextmenu` events for toggling path/name display.
- Accept a `Session` reference for subscribing to `sourceLoaded` events.
- Methods: `toggle()`, `enable()`, `disable()`, `isVisible()`, `setState()`, `getState()`, `getElement()`, `dispose()`, `setShowFullPath(boolean)`, `update()`.
- `update()` reads `session.currentSource.name` and `session.currentSource.url`, applying truncation based on `showFullPath` state.
- On `contextmenu` event: toggle `showFullPath`, call `update()`, emit `stateChanged`.

### Step 2: Create unit tests

Create `src/ui/components/InfoStripOverlay.test.ts`:

- Test initial state (hidden, basename mode).
- Test `toggle()` / `enable()` / `disable()`.
- Test filename display with basename vs. full path.
- Test truncation behavior for long filenames.
- Test `contextmenu` event toggles path mode.
- Test `sourceLoaded` event triggers update.
- Test `stateChanged` event emission.
- Test `dispose()` cleanup.
- Test that element has correct z-index and `pointer-events: none`.
- Test `getElement()` returns the container.

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

### Step 5: Add keyboard shortcut

Modify `src/utils/input/KeyBindings.ts`:

- Add entry to `DEFAULT_KEY_BINDINGS`:
  ```typescript
  'view.toggleInfoStrip': {
    code: 'F7',
    description: 'Toggle info strip overlay',
  },
  ```

Modify `src/services/KeyboardActionMap.ts`:

- Add `getInfoStripOverlay(): { toggle(): void }` to `ActionViewer` interface.
- Add handler in `buildActionHandlers()`:
  ```typescript
  'view.toggleInfoStrip': () => viewer.getInfoStripOverlay().toggle(),
  ```

### Step 6: Add to shortcut dialog categories

Modify `src/AppKeyboardHandler.ts`:

- Add `'view.toggleInfoStrip'` to the `'VIEW'` array in the `categories` object within `showShortcutsDialog()`.

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
| `src/utils/input/KeyBindings.ts` | Add `'view.toggleInfoStrip'` binding (F7) |
| `src/services/KeyboardActionMap.ts` | Add `getInfoStripOverlay` to `ActionViewer`, add handler |
| `src/AppKeyboardHandler.ts` | Add `'view.toggleInfoStrip'` to VIEW category |
| `src/ui/components/OverlayManager.test.ts` | Add tests for info strip overlay lifecycle |

## Risks

### 1. F7 Key Conflict
**Risk**: The F7 key may be intercepted by the browser or OS (e.g., macOS uses F-keys for system functions by default).
**Mitigation**: F7 is not currently used by any binding in `DEFAULT_KEY_BINDINGS`. Browsers generally allow F7 interception (Firefox uses it for "caret browsing" but this can be overridden with `preventDefault()`). The binding is customizable via the existing `CustomKeyBindingsManager`, so users can rebind if needed.

### 2. Overlap with Bottom-Positioned Overlays
**Risk**: The info strip at the bottom could visually conflict with other bottom-positioned elements (MatteOverlay, TimecodeOverlay in `bottom-left`/`bottom-right` position, BugOverlay in `bottom-*` position).
**Mitigation**: The strip uses z-index 48, placing it in the middle of the overlay stack. It is a thin 28px bar, and other overlays position themselves with margins that keep them above the strip. If needed, the strip's position can be adjusted to account for the matte overlay height.

### 3. Long Filenames / Paths
**Risk**: Very long filenames or deep directory paths may not fit in the strip, especially on narrow viewports.
**Mitigation**: CSS `text-overflow: ellipsis` with `overflow: hidden` and `white-space: nowrap` ensures clean truncation. The RTL direction trick preserves the tail (most informative part) of the path. Right-click toggle between basename and full path gives users control.

### 4. Context Menu Suppression
**Risk**: Suppressing the browser's native right-click context menu on the strip may surprise users or conflict with browser extensions.
**Mitigation**: The `pointer-events: auto` region is limited to the strip's text area only. The rest of the viewer retains normal context menu behavior. The strip is a thin bar, so the suppression surface is small. Additionally, the toggle can be made accessible through the existing overlay state API, not solely through right-click.

### 5. Presentation Mode Interaction
**Risk**: The info strip might be considered UI clutter that should be hidden in presentation mode.
**Mitigation**: The strip lives inside `canvasContainer`, which is preserved during presentation mode (only `elementsToHide` elements are hidden). This is intentional -- the strip is a viewer overlay like timecode or safe areas, which also persist in presentation mode. If users want it hidden, they can toggle it off with F7 before or during presentation.

### 6. Source Name Availability
**Risk**: `session.currentSource` may be `null` when no source is loaded, and `name` may be empty or a URL blob reference.
**Mitigation**: The `update()` method will check for `null` source and empty names, displaying a fallback like "(no source)" or hiding the strip content. For blob URLs, the basename extraction will show the last URL segment. The existing `InfoPanel.truncateFilename()` logic provides a reference implementation.
