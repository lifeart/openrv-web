# Plan 15: Timeline Context Menu

## Overview

Desktop OpenRV provides a right-click context menu on the timeline that displays frame number, source information, and offers actions such as setting in/out points, placing marks, and jumping to a specific frame. The openrv-web `Timeline` component (the main canvas-based 80px bar at the bottom of the viewer) currently has no right-click behavior -- clicking and dragging seek, double-click navigates to the nearest annotated frame, and clicking the bottom info area cycles the timecode display mode. This plan adds a native-feeling custom context menu to the main `Timeline` component that surfaces frame-contextual information and actions.

> **Scope note:** This plan targets the main `Timeline` canvas component (`src/ui/components/Timeline.ts`), not the `TimelineEditor` EDL editing component (which already has its own cut-oriented context menu).

## Current State

### Timeline component (`src/ui/components/Timeline.ts`)

- Canvas-based rendering at 80px height.
- Pointer events: `pointerdown` (seek / timecode-mode toggle), `pointermove` (scrub), `pointerup` (end drag), `dblclick` (nearest annotation).
- No `contextmenu` event listener registered.
- The `draw()` method already computes `frameToX` and renders in/out brackets, marks, and source info, so coordinate-to-frame math is established.
- Has access to `Session` (in/out points, marks, `goToFrame`, `currentSource`, `fps`) and optional `PaintEngine` (annotations).

### Session APIs available for context menu actions

| API | Purpose |
|-----|---------|
| `session.setInPoint(frame)` | Set in point to a specific frame |
| `session.setOutPoint(frame)` | Set out point to a specific frame |
| `session.resetInOutPoints()` | Clear in/out to full range |
| `session.toggleMark(frame)` | Add or remove a mark at a frame |
| `session.hasMarker(frame)` | Check if a marker exists at a frame |
| `session.goToFrame(frame)` | Navigate to a frame |
| `session.currentSource` | Current `MediaSource` with `.name`, `.width`, `.height`, `.type`, `.duration` |
| `session.currentFrame` | Current playhead frame |
| `session.fps` | Frames per second |
| `session.inPoint` / `session.outPoint` | Current in/out range |
| `session.marks` | `ReadonlyMap<number, Marker>` of all markers |

### Timecode utilities (`src/utils/media/Timecode.ts`)

- `formatFrameDisplay(frame, fps, mode)` -- formats in the current display mode (frames / timecode / seconds / footage).
- `formatTimecode(frame, fps)` -- always SMPTE.

### Existing context menu patterns in the codebase

1. **`TimelineEditor.showContextMenu`** -- Creates a `position: fixed` div with class `timeline-context-menu`, items styled with `var(--bg-secondary)` background, `var(--text-primary)` text, hover highlight via `var(--bg-hover)`. Closed via a deferred `document.addEventListener('click', ...)`.
2. **`HeaderBar.showSpeedMenu`** -- Similar fixed-position menu with `role="menu"`, styled with shared theme constants (`SHADOWS.dropdown`, `Z_INDEX.dropdown`). Uses a more robust auto-close pattern including Escape key handling.
3. **`CurveEditor.handleContextMenu`** -- Simple `e.preventDefault()` followed by a direct action (remove point); no popup menu.

The HeaderBar pattern is the most complete and should be used as the reference for the new context menu.

## Proposed Architecture

### New file: `src/ui/components/TimelineContextMenu.ts`

A standalone class that encapsulates the context menu DOM, positioning logic, action callbacks, and auto-dismiss behavior. This keeps the `Timeline` class focused on canvas rendering and delegates menu concerns to a dedicated component.

```
TimelineContextMenu
  +-- show(options: TimelineContextMenuOptions): void
  +-- hide(): void
  +-- isVisible(): boolean
  +-- dispose(): void
```

Where `TimelineContextMenuOptions` contains:

```typescript
interface TimelineContextMenuOptions {
  /** Client coordinates for menu placement */
  x: number;
  y: number;
  /** The frame number at the right-click position */
  frame: number;
  /** Formatted frame display string (respects current display mode) */
  frameLabel: string;
  /** Timecode string (always SMPTE, for secondary display) */
  timecode: string;
  /** Source info */
  sourceName: string | null;
  sourceResolution: string | null; // e.g. "1920x1080"
  sourceType: string | null;       // "video" | "image" | null
  /** Current state for conditional items */
  hasMarkerAtFrame: boolean;
  hasCustomInOut: boolean;
  inPoint: number;
  outPoint: number;
  /** Callbacks for menu actions */
  onGoToFrame: (frame: number) => void;
  onSetInPoint: (frame: number) => void;
  onSetOutPoint: (frame: number) => void;
  onResetInOutPoints: () => void;
  onToggleMark: (frame: number) => void;
}
```

### Integration in `Timeline.ts`

- A new `contextmenu` event listener on the canvas calls `e.preventDefault()`, computes the frame at the click position (reusing the existing `seekToPosition` coordinate math), gathers session state, and calls `TimelineContextMenu.show(...)`.
- The `Timeline.dispose()` method calls `TimelineContextMenu.dispose()`.

### No changes to Session or other core modules

All needed APIs already exist on `Session`. The context menu is purely a UI concern.

## UI Design

### Menu structure

```
+--------------------------------------------+
|  Frame 42  |  00:00:01:18                   |   <-- info header (non-interactive, dimmed)
|  [VID] clip_001.mp4  (1920x1080)            |   <-- source info (non-interactive, dimmed)
+--------------------------------------------+
|  Go to Frame 42                             |   <-- action
+--------------------------------------------+
|  Set In Point Here                      I   |   <-- action with shortcut hint
|  Set Out Point Here                     O   |   <-- action with shortcut hint
|  Clear In/Out Range                     R   |   <-- conditional: only when custom range active
+--------------------------------------------+
|  Add Mark at Frame 42                   M   |   <-- or "Remove Mark" if marker exists
+--------------------------------------------+
```

### Visual design

- **Background:** `var(--bg-secondary)` with `1px solid var(--border-primary)` border.
- **Border radius:** 6px.
- **Shadow:** `SHADOWS.dropdown` from shared theme.
- **Z-index:** `Z_INDEX.dropdown` (9999).
- **Min-width:** 240px.
- **Font:** System font stack, 12px for items, 11px for header info.
- **Info header rows:** `var(--text-muted)` color, no hover highlight, `padding: 6px 12px`.
- **Action items:** `var(--text-primary)` color, `padding: 8px 12px`, hover background `var(--bg-hover)`.
- **Shortcut hints:** Right-aligned, `var(--text-muted)`, 11px font.
- **Separators:** 1px `var(--border-primary)` horizontal lines with 4px vertical margin.
- **Conditional items:** "Clear In/Out Range" only shown when `hasCustomInOut` is true. "Add Mark" / "Remove Mark" label toggles based on `hasMarkerAtFrame`.

### Positioning

- Default placement: top-left corner of the menu at `(clientX, clientY)`.
- Viewport clamping: if the menu would overflow the right edge, flip to open leftward. If it would overflow the bottom, flip upward. Uses `getBoundingClientRect()` after initial render to measure actual menu dimensions.

### Dismissal

- Click anywhere outside the menu.
- Escape key.
- Scroll on the timeline.
- Window blur.
- Any action item click (action executes, then menu hides).

### Accessibility

- Menu element: `role="menu"`, `aria-label="Timeline context menu"`.
- Action items: `role="menuitem"`, `tabindex="-1"`.
- Info rows: `role="presentation"`.
- Focus trap: first action item receives focus on open. Arrow Up/Down moves focus between items. Enter/Space activates.
- The menu is fully keyboard-navigable after opening.

## Implementation Steps

### Step 1: Create `TimelineContextMenu` class

Create `src/ui/components/TimelineContextMenu.ts` with:

1. The `TimelineContextMenuOptions` interface.
2. A `TimelineContextMenu` class that:
   - Creates the menu DOM lazily on first `show()` call (or removes/rebuilds on each `show()`).
   - Builds info header rows (frame + timecode, source info).
   - Builds action items with labels, shortcut hints, and click handlers.
   - Handles viewport clamping after rendering.
   - Sets up auto-dismiss listeners (outside click, Escape, blur).
   - Cleans up listeners on `hide()` and `dispose()`.
3. Uses shared theme constants (`SHADOWS`, `Z_INDEX`, `COLORS`) from `src/ui/components/shared/theme.ts`.

### Step 2: Create unit tests for `TimelineContextMenu`

Create `src/ui/components/TimelineContextMenu.test.ts` with tests covering:

- Menu appears at specified coordinates on `show()`.
- Info header displays frame number and timecode correctly.
- Source info displays correctly (and is hidden when no source).
- All action items are present with correct labels.
- "Clear In/Out Range" is hidden when `hasCustomInOut` is false and shown when true.
- "Add Mark" vs "Remove Mark" label toggles correctly.
- Clicking an action item calls the corresponding callback and hides the menu.
- Clicking outside the menu hides it.
- Pressing Escape hides the menu.
- Calling `show()` a second time replaces the previous menu.
- `dispose()` removes the menu and all listeners.
- Keyboard navigation (Arrow Down/Up, Enter) works.
- Viewport clamping works when menu would overflow.

### Step 3: Integrate context menu into `Timeline`

Modify `src/ui/components/Timeline.ts`:

1. Import `TimelineContextMenu`.
2. Add a `private contextMenu: TimelineContextMenu` field, constructed in `constructor`.
3. Add a `contextmenu` event listener on the canvas in `bindEvents()`.
4. In the handler:
   - Call `e.preventDefault()`.
   - Compute the frame at the click position using the same coordinate math as `seekToPosition()` (extract a helper method `frameAtClientX(clientX): number`).
   - Gather session state (`currentSource`, `inPoint`, `outPoint`, `hasMarker`, etc.).
   - Format frame display using `formatFrameDisplay` and `formatTimecode`.
   - Call `this.contextMenu.show({ ... })` with action callbacks that delegate to `session.goToFrame()`, `session.setInPoint()`, `session.setOutPoint()`, `session.resetInOutPoints()`, `session.toggleMark()`.
5. In `dispose()`, call `this.contextMenu.dispose()`.
6. Remove the `contextmenu` event listener in `dispose()`.

### Step 4: Extract `frameAtClientX` helper

Refactor `Timeline.ts` to extract the coordinate-to-frame conversion currently duplicated in `seekToPosition` and `onDoubleClick`:

```typescript
private frameAtClientX(clientX: number): number {
  const rect = this.canvas.getBoundingClientRect();
  const padding = 60;
  const trackWidth = rect.width - padding * 2;
  const x = clientX - rect.left - padding;
  const progress = Math.max(0, Math.min(1, x / trackWidth));
  const source = this.session.currentSource;
  const duration = source?.duration ?? 1;
  return Math.round(1 + progress * (duration - 1));
}
```

Update `seekToPosition`, `onDoubleClick`, and the new context menu handler to use this method.

### Step 5: Add unit tests for Timeline context menu integration

Add tests to `src/ui/components/Timeline.test.ts`:

- Right-click on the canvas creates a context menu.
- The context menu shows the correct frame number for the click position.
- Clicking "Go to Frame" calls `session.goToFrame` with the correct frame.
- Clicking "Set In Point Here" calls `session.setInPoint` with the correct frame.
- Clicking "Set Out Point Here" calls `session.setOutPoint` with the correct frame.
- Clicking "Clear In/Out Range" calls `session.resetInOutPoints`.
- Clicking "Add Mark" calls `session.toggleMark` with the correct frame.
- Context menu is removed on `dispose()`.
- Right-click does not interfere with left-click seeking (no `isDragging` side effects).

### Step 6: Add e2e tests

Create or extend `e2e/timeline.spec.ts` with tests:

- Right-clicking the timeline canvas shows a context menu popup.
- The context menu shows the correct frame and source info.
- Clicking "Set In Point Here" updates the session in point.
- Clicking "Set Out Point Here" updates the session out point.
- Clicking "Go to Frame" navigates the playhead.
- Clicking "Add Mark" adds a marker at the clicked position.
- Clicking outside the menu dismisses it.
- Right-clicking again at a different position shows updated frame info.

## Files to Create/Modify

### Files to Create

| File | Purpose |
|------|---------|
| `src/ui/components/TimelineContextMenu.ts` | Context menu component class |
| `src/ui/components/TimelineContextMenu.test.ts` | Unit tests for context menu |

### Files to Modify

| File | Change |
|------|--------|
| `src/ui/components/Timeline.ts` | Add `contextmenu` listener, instantiate `TimelineContextMenu`, extract `frameAtClientX` helper, update `dispose()` |
| `src/ui/components/Timeline.test.ts` | Add context menu integration tests |
| `e2e/timeline.spec.ts` | Add e2e tests for context menu behavior |

### Files NOT Modified

| File | Reason |
|------|--------|
| `src/core/session/Session.ts` | All needed APIs already exist |
| `src/core/session/MarkerManager.ts` | No changes needed |
| `src/ui/components/TimelineEditor.ts` | Separate component with its own context menu |
| `src/services/TimelineEditorService.ts` | No involvement |
| `src/ui/components/shared/theme.ts` | Existing constants (`SHADOWS`, `Z_INDEX`, `COLORS`) are sufficient |

## Risks

### 1. Canvas coordinate mapping on HiDPI displays

**Risk:** The canvas uses `devicePixelRatio` scaling. The `getBoundingClientRect()` returns CSS pixels while canvas dimensions are in physical pixels. Frame-at-position calculation must use CSS coordinates consistently.

**Mitigation:** The existing `seekToPosition` method already uses `getBoundingClientRect()` correctly and operates in CSS pixel space. The new `frameAtClientX` helper extracts the same logic and is equally correct.

### 2. Context menu positioning near viewport edges

**Risk:** If the user right-clicks near the bottom-right of the screen, the menu could overflow the viewport.

**Mitigation:** After rendering the menu off-screen (or at the click position), immediately measure its dimensions with `getBoundingClientRect()` and adjust `left`/`top` to keep it within `window.innerWidth` / `window.innerHeight` with a small margin (8px). This is a standard pattern used by the `HeaderBar` speed menu.

### 3. Interaction with timeline drag/seek behavior

**Risk:** A `contextmenu` event on the canvas may also fire `pointerdown`, causing an unintended seek before the menu appears.

**Mitigation:** Check `e.button === 2` (right-click) in the `pointerdown` handler and skip seeking. Alternatively, rely on the fact that `contextmenu` fires after `pointerdown` and the menu prevents further pointer events from reaching the canvas. The safest approach is to add a `button` check in `onPointerDown`: `if (e.button !== 0) return;` (only left-click seeks). This is a common pattern and does not affect existing left-click behavior.

### 4. Mobile/touch devices

**Risk:** Touch devices do not have a native right-click. Long-press may or may not trigger a `contextmenu` event depending on the browser.

**Mitigation:** For now, the context menu is desktop-only (triggered by `contextmenu` event). Long-press support can be added as a future enhancement if needed. The timeline's primary touch interaction (tap-to-seek, drag-to-scrub) remains unchanged.

### 5. Multiple context menus on the page

**Risk:** If the `TimelineEditor` component is also visible, both components could have open context menus simultaneously, or one could interfere with the other.

**Mitigation:** The `TimelineContextMenu` uses a unique CSS class (`timeline-main-context-menu`) distinct from the `TimelineEditor`'s `timeline-context-menu`. On `show()`, any existing instance of the same menu is removed first. Since the two timelines are separate DOM regions, their context menus will not overlap in practice.

### 6. Stale session state in the menu

**Risk:** If the session state changes while the context menu is open (e.g., marks change due to keyboard shortcut), the menu labels could be stale.

**Mitigation:** The menu is ephemeral and typically dismissed within a second. This is the same behavior as desktop OpenRV and is acceptable. If needed in the future, the menu could subscribe to session events and re-render, but this adds complexity for minimal benefit.

### 7. Testing canvas-based interactions

**Risk:** Canvas element context menu testing in jsdom requires manual `contextmenu` event dispatch and mock `getBoundingClientRect`, which may be fragile.

**Mitigation:** The existing `Timeline.test.ts` already mocks `getBoundingClientRect` and dispatches pointer events. The same pattern applies to `contextmenu` events. The `TimelineContextMenu` class itself is DOM-based (not canvas) and is fully testable in jsdom.
