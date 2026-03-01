# Plan 15: Timeline Context Menu

## Overview

Desktop OpenRV provides a right-click context menu on the timeline that displays frame number, source information, and offers actions such as setting in/out points, placing marks, copying timecode, and jumping to a specific frame. The openrv-web `Timeline` component (the main canvas-based 80px bar at the bottom of the viewer) currently has no right-click behavior -- clicking and dragging seek, double-click navigates to the nearest annotated frame, and clicking the bottom info area cycles the timecode display mode. This plan adds a native-feeling custom context menu to the main `Timeline` component that surfaces frame-contextual information and actions.

> **Scope note:** This plan targets the main `Timeline` canvas component (`src/ui/components/Timeline.ts`), not the `TimelineEditor` EDL editing component (which already has its own cut-oriented context menu).

## Current State

### Timeline component (`src/ui/components/Timeline.ts`)

- Canvas-based rendering at 80px height.
- Pointer events: `pointerdown` (seek / timecode-mode toggle), `pointermove` (scrub), `pointerup` (end drag), `dblclick` (nearest annotation).
- No `contextmenu` event listener registered.
- The `draw()` method already computes `frameToX` and renders in/out brackets, marks, and source info, so coordinate-to-frame math is established.
- Has access to `Session` (in/out points, marks, `goToFrame`, `currentSource`, `fps`) and optional `PaintEngine` (annotations).
- **Important:** `onPointerDown` currently has no `e.button` check, meaning right-clicks will trigger seeking. This must be fixed as part of this plan.

### Session APIs available for context menu actions

| API | Purpose |
|-----|---------|
| `session.setInPoint(frame)` | Set in point to a specific frame |
| `session.setOutPoint(frame)` | Set out point to a specific frame |
| `session.resetInOutPoints()` | Clear in/out to full range |
| `session.toggleMark(frame)` | Add or remove a mark at a frame |
| `session.getMarkerAtFrame(frame)` | Check if a marker exists at a frame (handles both exact and duration marker range containment) |
| `session.removeMark(frame)` | Remove a marker by its start frame |
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
  /** Timecode string (always SMPTE, for secondary display and clipboard copy) */
  timecode: string;
  /** Source info */
  sourceName: string | null;
  sourceResolution: string | null; // e.g. "1920x1080"
  sourceType: string | null;       // "video" | "image" | null
  /** Current state for conditional items */
  markerAtFrame: { frame: number } | null; // null if no marker, otherwise the marker's start frame for correct removal
  hasCustomInOut: boolean;
  inPoint: number;
  outPoint: number;
  /** Callbacks for menu actions */
  onGoToFrame: (frame: number) => void;
  onSetInPoint: (frame: number) => void;
  onSetOutPoint: (frame: number) => void;
  onResetInOutPoints: () => void;
  onToggleMark: (frame: number) => void;
  onRemoveMark: (markerStartFrame: number) => void;
  onCopyTimecode: (timecode: string) => void;
}
```

**Key design decisions in the options interface:**

- `markerAtFrame` replaces the earlier `hasMarkerAtFrame` boolean. It carries the marker's actual start frame so that the "Remove Mark" action can correctly target the marker even when the user right-clicks in the middle of a duration marker (e.g., clicking frame 50 when the marker spans frames 40-60). This prevents calling `toggleMark(50)` which would incorrectly create a new marker instead of removing the existing one.
- `onRemoveMark` is separate from `onToggleMark` to make the intent explicit: adding uses the clicked frame, removing uses the marker's start frame.
- `onCopyTimecode` supports the "Copy Timecode" action, a high-frequency production workflow action for VFX dailies review.
- Callbacks are closures that close over the right-clicked frame number, not the playhead position. The `Timeline` handler is responsible for capturing the correct frame at event time.

### Integration in `Timeline.ts`

- A new `contextmenu` event listener on the canvas calls `e.preventDefault()`, computes the frame at the click position (reusing the existing `seekToPosition` coordinate math), gathers session state, and calls `TimelineContextMenu.show(...)`.
- The `contextmenu` handler early-returns when `session.currentSource` is null (no media loaded), suppressing the menu entirely since frame numbers would be meaningless and all actions would be no-ops.
- The `contextmenu` handler cancels any in-progress drag (`this.isDragging = false`) to prevent stuck drag state.
- The `Timeline.dispose()` method calls `TimelineContextMenu.dispose()`.

### Required change in `Timeline.onPointerDown`

Add `if (e.button !== 0) return;` at the top of `onPointerDown` to ensure only left-clicks trigger seeking. Without this guard, every right-click fires `pointerdown` with `button === 2` before the `contextmenu` event, which would seek the playhead and destroy the user's intent. This is a critical correctness fix.

### No changes to Session or other core modules

All needed APIs already exist on `Session`. The context menu is purely a UI concern.

## UI Design

### Menu structure

```
+--------------------------------------------+
|  Frame 42  |  00:00:01:18                   |   <-- info header (non-interactive, dimmed)
|  [VID] clip_001.mp4  (1920x1080)            |   <-- source info (non-interactive, dimmed)
+--------------------------------------------+
|  Copy Timecode                     Ctrl+C   |   <-- clipboard action
+--------------------------------------------+
|  Go to Frame 42                             |   <-- navigation action
+--------------------------------------------+
|  Set In Point Here                      I   |   <-- action with shortcut hint
|  Set Out Point Here                     O   |   <-- action with shortcut hint
|  Clear In/Out Range                     R   |   <-- conditional: only when custom range active
+--------------------------------------------+
|  Add Mark at Frame 42                   M   |   <-- or "Remove Mark" if marker exists
+--------------------------------------------+
```

"Copy Timecode" is placed immediately after the info header because it is an information action (copying what the header shows) rather than a navigation or range action. This mirrors the pattern in desktop OpenRV and other NLEs where copy actions sit near the information they reference.

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
- **Conditional items:** "Clear In/Out Range" only shown when `hasCustomInOut` is true. "Add Mark" / "Remove Mark" label toggles based on `markerAtFrame`.

### Positioning

- Default placement: top-left corner of the menu at `(clientX, clientY)`.
- **Render with `visibility: hidden` first**, measure dimensions with `getBoundingClientRect()`, compute the clamped position, then set `visibility: visible`. This avoids a one-frame visual flash that would otherwise occur when the menu is repositioned after clamping. Since the timeline sits at the bottom of the viewport, the menu will almost always need upward clamping (the default opens downward from the click point, but there is typically only ~80px of timeline below the click and menus are taller than that), making flash avoidance essential.
- Viewport clamping: if the menu would overflow the right edge, flip to open leftward. If it would overflow the bottom, flip upward. Keep an 8px margin from viewport edges.

### Dismissal

- Click anywhere outside the menu.
- Escape key.
- Scroll on the timeline.
- Window blur.
- Any action item click (action executes, then menu hides).

### Accessibility

- Menu element: `role="menu"`, `aria-label="Timeline context menu"`.
- Action items: `role="menuitem"`, `tabindex="-1"`.
- Info rows: `role="none"` (preferred over `role="presentation"` per ARIA 1.2; both work identically in current browsers, but `none` more clearly communicates intent).
- Focus trap: first action item receives focus on open. Arrow Up/Down moves focus between items. Enter/Space activates.
- The menu is fully keyboard-navigable after opening.

> **Review Note (Nice to Have):** Add `Home`/`End` key support to jump to first/last menu item for full WAI-ARIA menu compliance. The existing HeaderBar menus also lack this, so omitting it is consistent with the codebase, but it would be a quality improvement for a short menu (6-7 items). Consider adding in a follow-up.

## Implementation Steps

### Step 1: Create `TimelineContextMenu` class

Create `src/ui/components/TimelineContextMenu.ts` with:

1. The `TimelineContextMenuOptions` interface.
2. A `TimelineContextMenu` class that:
   - Creates the menu DOM lazily on first `show()` call (or removes/rebuilds on each `show()`).
   - **Renders with `visibility: hidden`** initially, measures dimensions, computes clamped position, then sets `visibility: visible`.
   - Builds info header rows (frame + timecode, source info).
   - Builds "Copy Timecode" action that calls `navigator.clipboard.writeText(timecode)`.
   - Builds action items with labels, shortcut hints, and click handlers.
   - Uses `markerAtFrame` to determine "Add Mark" vs "Remove Mark" label, and routes removal through `onRemoveMark(marker.frame)` rather than `onToggleMark(clickedFrame)`.
   - Handles viewport clamping after rendering.
   - Sets up auto-dismiss listeners (outside click, Escape, blur).
   - On `show()`, also removes any existing `.timeline-context-menu` element (from the `TimelineEditor`) to prevent two context menus from being visible simultaneously.
   - Cleans up listeners on `hide()` and `dispose()`.
3. Uses shared theme constants (`SHADOWS`, `Z_INDEX`, `COLORS`) from `src/ui/components/shared/theme.ts`.

### Step 2: Create unit tests for `TimelineContextMenu`

Create `src/ui/components/TimelineContextMenu.test.ts` with tests covering:

- Menu appears at specified coordinates on `show()`.
- Menu renders with `visibility: hidden` before clamping, then `visibility: visible` after.
- Info header displays frame number and timecode correctly.
- Source info displays correctly (and is hidden when no source).
- "Copy Timecode" action calls `navigator.clipboard.writeText` with the correct timecode string.
- All action items are present with correct labels.
- "Clear In/Out Range" is hidden when `hasCustomInOut` is false and shown when true.
- "Add Mark" vs "Remove Mark" label toggles correctly based on `markerAtFrame`.
- "Remove Mark" calls `onRemoveMark` with the marker's start frame (not the clicked frame).
- "Add Mark" calls `onToggleMark` with the clicked frame.
- Clicking an action item calls the corresponding callback and hides the menu.
- Clicking outside the menu hides it.
- Pressing Escape hides the menu.
- Calling `show()` a second time replaces the previous menu.
- `dispose()` removes the menu and all listeners.
- Keyboard navigation (Arrow Down/Up, Enter) works.
- Viewport clamping works when menu would overflow.
- Uses `role="none"` for info header rows.

### Step 3: Integrate context menu into `Timeline`

Modify `src/ui/components/Timeline.ts`:

1. Import `TimelineContextMenu`.
2. Add a `private contextMenu: TimelineContextMenu` field, constructed in `constructor`.
3. **Add `if (e.button !== 0) return;` guard at the top of `onPointerDown`** to prevent right-clicks from triggering seek behavior. This is critical: without it, every right-click seeks the playhead before the context menu appears, destroying the user's intent.
4. Add a `contextmenu` event listener on the canvas in `bindEvents()`.
5. In the `contextmenu` handler:
   - Call `e.preventDefault()`.
   - **Early-return if `!this.session.currentSource`** -- suppress the menu when no source is loaded since frame numbers would be meaningless and all actions would be no-ops.
   - **Cancel any in-progress drag:** set `this.isDragging = false` and release pointer capture if held. This prevents stuck drag state if a user somehow right-clicks mid-drag.
   - Compute the frame at the click position using the new `frameAtClientX()` helper.
   - Gather session state: use `session.getMarkerAtFrame(frame)` (not `hasMarker(frame)`) to correctly detect both exact and duration markers.
   - Format frame display using `formatFrameDisplay` and `formatTimecode`.
   - Call `this.contextMenu.show({ ... })` with:
     - `markerAtFrame` set to the result of `getMarkerAtFrame(frame)` (includes the marker's start frame for correct removal).
     - `onToggleMark` callback that calls `session.toggleMark(clickedFrame)` for adding a new mark.
     - `onRemoveMark` callback that calls `session.removeMark(marker.frame)` using the marker's actual start frame (not the clicked frame), so duration markers are correctly removed.
     - `onCopyTimecode` callback that calls `navigator.clipboard.writeText(timecode)`.
     - Other action callbacks that delegate to `session.goToFrame()`, `session.setInPoint()`, `session.setOutPoint()`, `session.resetInOutPoints()`.
6. In `dispose()`, call `this.contextMenu.dispose()`.
7. Remove the `contextmenu` event listener in `dispose()`.

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
- Right-click on the canvas when no source is loaded does **not** create a context menu.
- The context menu shows the correct frame number for the click position.
- Clicking "Go to Frame" calls `session.goToFrame` with the correct frame.
- Clicking "Set In Point Here" calls `session.setInPoint` with the correct frame.
- Clicking "Set Out Point Here" calls `session.setOutPoint` with the correct frame.
- Clicking "Clear In/Out Range" calls `session.resetInOutPoints`.
- Clicking "Copy Timecode" copies the timecode string to the clipboard.
- Clicking "Add Mark" calls `session.toggleMark` with the correct frame.
- Clicking "Remove Mark" on a duration marker calls `session.removeMark` with the marker's start frame.
- Context menu is removed on `dispose()`.
- Right-click does not trigger seeking (the `e.button !== 0` guard works).
- Right-click during an active drag cancels the drag and shows the menu.
- Right-click does not interfere with left-click seeking (no `isDragging` side effects).

### Step 6: Add e2e tests

Create or extend `e2e/timeline.spec.ts` with tests:

- Right-clicking the timeline canvas shows a context menu popup.
- Right-clicking when no source is loaded does not show a context menu.
- The context menu shows the correct frame and source info.
- Clicking "Set In Point Here" updates the session in point.
- Clicking "Set Out Point Here" updates the session out point.
- Clicking "Go to Frame" navigates the playhead.
- Clicking "Copy Timecode" copies the timecode to the clipboard.
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
| `src/ui/components/Timeline.ts` | Add `e.button !== 0` guard in `onPointerDown`, add `contextmenu` listener with no-source suppression and drag cancellation, instantiate `TimelineContextMenu`, extract `frameAtClientX` helper, update `dispose()` |
| `src/ui/components/Timeline.test.ts` | Add context menu integration tests including no-source suppression, button guard, and duration marker tests |
| `e2e/timeline.spec.ts` | Add e2e tests for context menu behavior |

### Files NOT Modified

| File | Reason |
|------|--------|
| `src/core/session/Session.ts` | All needed APIs already exist |
| `src/core/session/MarkerManager.ts` | No changes needed; `getMarkerAtFrame` already handles duration markers |
| `src/ui/components/TimelineEditor.ts` | Separate component with its own context menu |
| `src/services/TimelineEditorService.ts` | No involvement |
| `src/ui/components/shared/theme.ts` | Existing constants (`SHADOWS`, `Z_INDEX`, `COLORS`) are sufficient |

## Review Notes (Nice to Have)

The following items were identified during expert review as quality improvements that are not required for the initial implementation. They can be addressed in follow-up work.

1. **`Home`/`End` key navigation** in the menu for full WAI-ARIA menu compliance. Low priority since the menu is short (6-7 items) and the existing HeaderBar menus also lack this.

2. **"Go to Next Marker" / "Go to Previous Marker" actions** when markers exist. The Session already has `goToNextMarker()` and `goToPreviousMarker()`. These would be conditionally shown only when `session.marks.size > 0`. Useful for review workflows with many flagged frames.

3. **Shared `ContextMenuBase` class** that encapsulates common patterns (positioning, clamping, auto-dismiss, keyboard navigation, role attributes) used by both `TimelineContextMenu` and the existing `TimelineEditor.showContextMenu`. The `TimelineEditor.showContextMenu` currently lacks Escape handling, keyboard navigation, and viewport clamping -- a shared base would allow backporting these improvements. This is a refactoring opportunity, not a blocker.

4. **Window blur dismiss handler for HeaderBar menus.** This plan adds window blur dismissal for the new context menu, but `HeaderBar.showSpeedMenu` lacks it. For consistency, this should eventually be a shared pattern.

## Risks

### 1. Canvas coordinate mapping on HiDPI displays

**Risk:** The canvas uses `devicePixelRatio` scaling. The `getBoundingClientRect()` returns CSS pixels while canvas dimensions are in physical pixels. Frame-at-position calculation must use CSS coordinates consistently.

**Mitigation:** The existing `seekToPosition` method already uses `getBoundingClientRect()` correctly and operates in CSS pixel space. The new `frameAtClientX` helper extracts the same logic and is equally correct. The context menu positioning uses `clientX`/`clientY` for `position: fixed`, which is also CSS pixel space. No DPR correction is needed for menu placement.

### 2. Context menu positioning near viewport edges

**Risk:** If the user right-clicks near the bottom-right of the screen, the menu could overflow the viewport. Since the timeline sits at the bottom of the viewport, the menu will almost always need upward clamping.

**Mitigation:** Render the menu with `visibility: hidden` first, measure its dimensions with `getBoundingClientRect()`, compute the clamped position, then set `visibility: visible`. This avoids the one-frame visual flash. Keep an 8px margin from viewport edges. This approach is strictly better than the existing HeaderBar pattern which does not handle viewport overflow at all.

### 3. Interaction with timeline drag/seek behavior

**Risk:** A `contextmenu` event on the canvas also fires `pointerdown` with `button === 2`, which without a guard would seek the playhead before the menu appears.

**Mitigation (required change):** Add `if (e.button !== 0) return;` at the top of `onPointerDown` so only left-clicks trigger seeking. Additionally, the `contextmenu` handler cancels any in-progress drag by setting `this.isDragging = false` and releasing pointer capture. This prevents stuck drag state if a user right-clicks mid-drag.

### 4. Mobile/touch devices

**Risk:** Touch devices do not have a native right-click. Long-press may or may not trigger a `contextmenu` event depending on the browser.

**Mitigation:** For now, the context menu is desktop-only (triggered by `contextmenu` event). Long-press support can be added as a future enhancement if needed. The timeline's primary touch interaction (tap-to-seek, drag-to-scrub) remains unchanged.

### 5. Multiple context menus on the page

**Risk:** If the `TimelineEditor` component is also visible, both components could have open context menus simultaneously, or one could interfere with the other.

**Mitigation:** The `TimelineContextMenu` uses a unique CSS class (`timeline-main-context-menu`) distinct from the `TimelineEditor`'s `timeline-context-menu`. On `show()`, the new menu also removes any existing `.timeline-context-menu` element to prevent two context menus from being visible simultaneously. Since the two timelines are separate DOM regions, their context menus will not overlap in practice.

### 6. Stale session state in the menu

**Risk:** If the session state changes while the context menu is open (e.g., marks change due to keyboard shortcut), the menu labels could be stale.

**Mitigation:** The menu is ephemeral and typically dismissed within a second. This is the same behavior as desktop OpenRV and is acceptable. Since the menu sets up a focus trap and captures Arrow/Escape/Enter keystrokes, other keyboard shortcuts should not reach the application while the menu is open. If needed in the future, the menu could subscribe to session events and re-render, but this adds complexity for minimal benefit.

### 7. Testing canvas-based interactions

**Risk:** Canvas element context menu testing in jsdom requires manual `contextmenu` event dispatch and mock `getBoundingClientRect`, which may be fragile.

**Mitigation:** The existing `Timeline.test.ts` already mocks `getBoundingClientRect` and dispatches pointer events. The same pattern applies to `contextmenu` events. The `TimelineContextMenu` class itself is DOM-based (not canvas) and is fully testable in jsdom.

### 8. Duration markers and the "Remove Mark" action

**Risk:** If the user right-clicks on frame 50 and there is a duration marker spanning frames 40-60, a naive `toggleMark(50)` call would create a new point marker at frame 50 instead of removing the existing duration marker.

**Mitigation:** Use `session.getMarkerAtFrame(frame)` (which checks both exact matches and range containment via MarkerManager lines 95-107) instead of `hasMarker(frame)` (which only checks exact frame matches). When removing, call `session.removeMark(marker.frame)` using the marker's actual start frame. The `TimelineContextMenuOptions` carries the full `markerAtFrame` object so the menu can route the removal correctly.
