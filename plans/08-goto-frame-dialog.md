# 08 - Goto Frame Dialog

## Overview

Desktop OpenRV provides a `G` key shortcut that opens a text entry field allowing the user to jump directly to a specific frame by typing a frame number, SMPTE timecode, or seconds value. The web version of OpenRV currently has no equivalent -- users can only navigate by timeline scrubbing, arrow-key stepping, or Home/End. This plan describes an inline overlay text entry that auto-detects the input format and navigates to the target frame on confirmation.

## Current State

### Keyboard Shortcut System

The keyboard system is built on three layers:

1. **KeyboardManager** (`src/utils/input/KeyboardManager.ts`) -- listens for `keydown` events, matches them against registered `KeyCombination` entries, and dispatches handlers. It skips events when the target is a text input, textarea, contenteditable, or select element (see `shouldSkipEvent()`).
2. **KeyBindings** (`src/utils/input/KeyBindings.ts`) -- declares `DEFAULT_KEY_BINDINGS`, a flat `Record<actionName, KeyBindingEntry>` where each entry has `code`, optional modifiers (`ctrl`, `shift`, `alt`), `description`, and optional `context`.
3. **KeyboardActionMap** (`src/services/KeyboardActionMap.ts`) -- the pure function `buildActionHandlers(deps)` maps each action name to a handler closure, wired in `App.ts` via `getActionHandlers()`.

Custom bindings are managed by `CustomKeyBindingsManager` (`src/utils/input/CustomKeyBindingsManager.ts`) and persisted in localStorage. `AppKeyboardHandler` (`src/AppKeyboardHandler.ts`) orchestrates registration, refresh, and the shortcuts/custom-bindings dialogs.

Context scoping is handled by `ActiveContextManager` (`src/utils/input/ActiveContextManager.ts`) with `BindingContext` values: `'global' | 'timeline' | 'paint' | 'viewer' | 'panel' | 'channel' | 'transform'`. The `ContextualKeyboardManager` resolves bindings in the active context first, falling back to global.

### Current `G` Key Usage

The `G` key (`KeyG`) is currently bound to three context-scoped actions:

| Action | Context | Modifiers | Description |
|--------|---------|-----------|-------------|
| `panel.gamutDiagram` | `panel` | none | Toggle CIE gamut diagram |
| `paint.toggleGhost` | `paint` | none | Toggle ghost mode |
| `channel.green` | `channel` | Shift | Select green channel |
| `view.toggleGhostFrames` | global | Ctrl | Toggle ghost frames (onion skin) |

The bare `G` key at the **global** context level is unbound, which means a new `navigation.gotoFrame` action on bare `G` with `context: 'global'` is feasible without conflicts, as long as the contextual resolution order is respected (paint and panel contexts take priority when active).

### Frame Navigation

- **Session.goToFrame(frame)** delegates to `SessionPlayback.goToFrame(frame)` which calls `PlaybackEngine.goToFrame(frame)`. Inside `PlaybackEngine`, the setter `set currentFrame(frame)` clamps the value to `[inPoint, outPoint]` and emits `frameChanged`.
- **FrameNavigationService** (`src/services/FrameNavigationService.ts`) handles playlist-aware navigation (annotation jumping, mark/boundary navigation, shot navigation). For the goto-frame dialog, the simpler `session.goToFrame()` is sufficient for single-source playback; playlist-aware jumping would use `FrameNavigationService.jumpToPlaylistGlobalFrame()`.
- Frame numbering is **1-based** throughout the application.

### Timecode Utilities

Two timecode modules exist:

1. **`src/utils/media/Timecode.ts`** -- Lightweight formatter used by the Timeline component. Provides `formatTimecode(frame, fps)`, `formatSeconds(frame, fps)`, `formatFootage(frame, fps)`, `formatFrameDisplay(frame, fps, mode)`. Uses 1-based frame numbers and non-drop-frame only. **No parsing (string-to-frame) functions exist here.**

2. **`src/ui/components/TimecodeDisplay.ts`** -- Display component with `frameToTimecode()` that supports drop-frame timecode (29.97, 59.94 fps). Also includes `formatTimecode()` for the `{hours, minutes, seconds, frames, dropFrame}` object.

Neither module provides a **parse** function (timecode string to frame number). This is a gap that must be filled.

### Existing Overlay / Inline UI Patterns

- **TimecodeOverlay** (`src/ui/components/TimecodeOverlay.ts`) -- A DOM overlay positioned absolutely inside the canvas container. Follows the lazy-creation pattern from `OverlayManager`. It creates its own DOM elements, is toggled with `toggle()`, and provides `getElement()` for mounting.
- **PixelProbe** -- Another overlay with its own floating panel.
- **Modal** (`src/ui/components/shared/Modal.ts`) -- Full modal dialogs (`showModal`, `showPrompt`, `showAlert`, `showConfirm`). The `showPrompt` function creates a modal with a text input, Enter to confirm, Escape to cancel. However, the goto-frame dialog should be a **lightweight inline overlay**, not a heavy modal -- matching the desktop OpenRV UX where a small text entry appears near the timeline/viewer area.

## Proposed Architecture

### Design Principles

1. **Inline overlay, not a modal** -- The goto-frame entry should appear as a small floating text input anchored to the bottom-center of the viewer (near the timeline), not as a centered modal dialog. This matches the desktop OpenRV pattern where it is a quick, low-friction interaction.
2. **Auto-detect input format** -- Users can type:
   - A plain integer: interpreted as a 1-based frame number (e.g., `42`)
   - SMPTE timecode: `HH:MM:SS:FF` or `HH:MM:SS;FF` (drop-frame) (e.g., `00:01:02:15`)
   - Seconds: a decimal number followed by `s` (e.g., `3.5s`)
   - Relative offset: `+10` or `-10` to step forward/back by N frames
3. **Valid range feedback** -- Show the valid frame range (`inPoint` to `outPoint`) as a hint below the input.
4. **Keyboard-driven** -- `G` opens the overlay, `Enter` confirms, `Escape` dismisses. No mouse interaction required.
5. **Pause playback** -- Opening the dialog pauses playback to avoid confusing frame changes during entry.

### Component: `GotoFrameOverlay`

A new class in `src/ui/components/GotoFrameOverlay.ts` that follows the existing overlay pattern (similar to `TimecodeOverlay`):

```
GotoFrameOverlay
  - container: HTMLElement (position: absolute, bottom-center, z-index: 60)
  - input: HTMLInputElement (monospace, styled to match theme)
  - hintLabel: HTMLElement (shows valid range and detected format)
  - errorLabel: HTMLElement (shows validation error)
  - state: { visible: boolean }
  - session: Session (for fps, inPoint, outPoint, goToFrame)

  + show(): void     -- creates/shows overlay, focuses input, pauses playback
  + hide(): void     -- hides overlay, restores focus
  + toggle(): void
  + getElement(): HTMLElement
  + dispose(): void
```

### Utility: `parseFrameInput()`

A new pure function in `src/utils/media/FrameInputParser.ts`:

```typescript
export type FrameInputFormat = 'frame' | 'timecode' | 'seconds' | 'relative';

export interface FrameInputResult {
  frame: number;          // 1-based absolute frame number
  format: FrameInputFormat;
  valid: boolean;
  error?: string;
}

/**
 * Parse user input and resolve to a 1-based frame number.
 *
 * @param input     Raw user input string
 * @param fps       Current session FPS
 * @param current   Current frame number (for relative offsets)
 * @param minFrame  Minimum valid frame (inPoint)
 * @param maxFrame  Maximum valid frame (outPoint)
 */
export function parseFrameInput(
  input: string,
  fps: number,
  current: number,
  minFrame: number,
  maxFrame: number,
): FrameInputResult;
```

Auto-detection logic:
1. If input matches `/^[+-]\d+$/` -- relative offset from current frame.
2. If input matches `/^\d+(\.\d+)?s$/i` -- seconds, convert via `Math.round(seconds * fps) + 1`.
3. If input matches `/^\d{1,2}:\d{2}:\d{2}[:;]\d{1,2}$/` -- SMPTE timecode, parse and convert.
4. If input matches `/^\d+$/` -- plain frame number.
5. Otherwise -- invalid, return error.

### Integration Points

```
KeyBindings.ts         -- Add 'navigation.gotoFrame' binding (KeyG, global context)
KeyboardActionMap.ts   -- Add handler that calls gotoFrameOverlay.toggle()
App.ts                 -- Wire GotoFrameOverlay into the action handlers via controls
OverlayManager.ts      -- Add lazy accessor getGotoFrameOverlay() (optional; could also be managed directly by App)
AppKeyboardHandler.ts  -- Automatically picks up the new binding from DEFAULT_KEY_BINDINGS
```

## UI Design

### Visual Layout

```
+--------------------------------------------------+
|                                                    |
|                   Viewer Area                      |
|                                                    |
|            +---------------------------+           |
|            |  Go to frame              |           |
|            |  +-----------------------+|           |
|            |  | 00:01:02:15           ||           |
|            |  +-----------------------+|           |
|            |  Range: 1 - 240 | TC fmt  |           |
|            +---------------------------+           |
|                                                    |
|  [=========|=====o==================] Timeline     |
+--------------------------------------------------+
```

### Styling

- Container: `position: absolute; bottom: 90px; left: 50%; transform: translateX(-50%); z-index: 60`
- Background: `var(--bg-secondary)` with `border: 1px solid var(--accent-primary)` and `border-radius: 8px`
- Input: monospace font, `font-size: 16px`, full width within the container, `background: var(--bg-hover)`, `border: 1px solid var(--bg-active)`, themed focus ring
- Hint text below input: `font-size: 11px`, `color: var(--text-muted)`, shows range and auto-detected format
- Error text: `color: var(--error)`, replaces hint when validation fails
- Shadow: `box-shadow: 0 4px 12px rgba(0,0,0,0.4)`
- Animation: fade-in on show (CSS transition on opacity)
- Container width: ~260px

### Interaction Flow

1. User presses `G` (when not in paint or panel context, and not in a text input).
2. Playback pauses if playing.
3. Overlay appears at bottom-center of viewer. Input is auto-focused.
4. Input shows placeholder: current frame number in the active display mode.
5. Hint shows: `Range: {inPoint} - {outPoint} | Press Enter to go`.
6. As user types, auto-detection runs:
   - Hint updates to show detected format: `Frame number`, `SMPTE Timecode`, `Seconds`, or `Relative (+/-)`.
   - If the resolved frame is out of range, hint turns to error color with a message like `Frame 999 is outside range 1-240`.
7. User presses `Enter`:
   - If valid, `session.goToFrame(resolvedFrame)` is called, overlay hides.
   - If invalid, input border briefly flashes red (CSS animation), overlay stays open.
8. User presses `Escape`: overlay hides without navigating.
9. Clicking outside the overlay also dismisses it.

### Accessibility

- The overlay container has `role="dialog"` and `aria-label="Go to frame"`.
- The input has `aria-describedby` pointing to the hint/error element.
- Focus is trapped in the input while the overlay is visible.
- Screen readers announce the hint text on input changes via `aria-live="polite"`.

## Implementation Steps

### Step 1: Frame Input Parser (Pure Logic)

Create `src/utils/media/FrameInputParser.ts` with the `parseFrameInput()` function and all format detection logic. This is a pure function with no DOM dependencies, making it straightforward to test.

Create `src/utils/media/FrameInputParser.test.ts` with comprehensive tests:
- Plain frame numbers: `"1"`, `"42"`, `"240"`, `"0"`, `"-5"`, `"999"` (out of range)
- SMPTE timecode: `"00:00:00:00"`, `"00:01:02:15"`, `"01:00:00:00"`, `"00:00:01;15"` (drop-frame)
- Seconds: `"0s"`, `"1.5s"`, `"3.75S"` (case-insensitive), `"100s"` (out of range)
- Relative: `"+1"`, `"-10"`, `"+0"`, `"+999"` (out of range)
- Invalid: `"abc"`, `""`, `"12:34"`, `"--5"`, `"1.5"` (without `s` suffix)
- Edge cases: whitespace trimming, leading zeros

### Step 2: GotoFrameOverlay Component

Create `src/ui/components/GotoFrameOverlay.ts`:
- Constructor takes `Session` (for `fps`, `inPoint`, `outPoint`, `currentFrame`, `goToFrame`, `pause`).
- Creates DOM structure (container, title, input, hint, error).
- `show()` method: sets `display: flex`, focuses input, sets placeholder to current frame, updates hint with range, pauses playback if playing, registers document-level click handler for click-outside dismissal.
- `hide()` method: sets `display: none`, clears input, removes click handler.
- Input `keydown` handler:
  - `Enter`: parse input, validate, navigate if valid, flash error if invalid.
  - `Escape`: call `hide()`.
- Input `input` handler: run `parseFrameInput()` on each keystroke to update hint with detected format and validity.
- `getElement()` returns the container for mounting.
- `dispose()` cleans up event listeners.

Create `src/ui/components/GotoFrameOverlay.test.ts`:
- Tests for show/hide toggle
- Tests for input parsing feedback (hint text updates)
- Tests for Enter key navigation
- Tests for Escape key dismissal
- Tests for out-of-range validation
- Tests for click-outside dismissal
- Tests for pausing playback on show

### Step 3: Register Keyboard Binding

In `src/utils/input/KeyBindings.ts`, add:

```typescript
'navigation.gotoFrame': {
  code: 'KeyG',
  description: 'Go to frame (open frame entry)',
},
```

This registers a bare `G` key at global context. The existing `G` bindings (`panel.gamutDiagram` at `panel` context, `paint.toggleGhost` at `paint` context) will take priority when those contexts are active, thanks to the `ContextualKeyboardManager` resolution order. The `channel.green` uses `Shift+G`, which is a different combo entirely.

### Step 4: Wire Into KeyboardActionMap

In `src/services/KeyboardActionMap.ts`:

1. Add to the `ActionControls` interface:
   ```typescript
   gotoFrameOverlay: { toggle(): void };
   ```

2. Add to `buildActionHandlers()`:
   ```typescript
   'navigation.gotoFrame': () => controls.gotoFrameOverlay.toggle(),
   ```

### Step 5: Wire Into App.ts

In `App.ts`:

1. Create the `GotoFrameOverlay` instance during initialization (lazy or eager, matching the pattern used by other overlays).
2. Mount its element into the viewer's canvas container (or the app container, positioned above the timeline).
3. Expose it through the controls object passed to `buildActionHandlers()`.

### Step 6: Add to OverlayManager (Optional)

If the overlay should be managed alongside other viewer overlays in `OverlayManager.ts`:

1. Add a `_gotoFrameOverlay: GotoFrameOverlay | null = null` field.
2. Add a lazy accessor `getGotoFrameOverlay()` that creates the instance and appends it to the canvas container.
3. Add disposal in `dispose()`.

Alternatively, the overlay can be managed directly by `App.ts` since it is more of a global navigation tool than a viewer-specific overlay.

### Step 7: Update Shortcuts Dialog

In `AppKeyboardHandler.ts`, add `'navigation.gotoFrame'` to the `PLAYBACK` category in the shortcuts dialog (or create a new `NAVIGATION` category):

```typescript
'NAVIGATION': ['navigation.gotoFrame'],
```

Update the `showShortcutsDialog()` method's `categories` object to include the new category.

### Step 8: Integration with Playlist Mode

When a playlist is active (`playlistManager.isEnabled()`), the goto-frame overlay should:

1. Show the **global** frame range (across all clips), not just the current clip's range.
2. Use `FrameNavigationService.jumpToPlaylistGlobalFrame()` instead of `session.goToFrame()` for global frame numbers.
3. Optionally show the current clip name and local frame range as additional context.

This can be deferred to a follow-up if playlist mode adds complexity.

### Step 9: E2E Tests

Create `e2e/goto-frame.spec.ts`:
- Test G key opens the overlay
- Test typing a frame number and pressing Enter navigates
- Test Escape closes without navigation
- Test SMPTE timecode input
- Test seconds input
- Test relative offset input
- Test out-of-range rejection
- Test that G key does nothing when in paint context (paint.toggleGhost takes over)

## Files to Create/Modify

### Files to Create

| File | Purpose |
|------|---------|
| `src/utils/media/FrameInputParser.ts` | Pure parser: string input to frame number with auto-format detection |
| `src/utils/media/FrameInputParser.test.ts` | Unit tests for the parser (~30-40 test cases) |
| `src/ui/components/GotoFrameOverlay.ts` | Inline overlay component with text input, hint, validation |
| `src/ui/components/GotoFrameOverlay.test.ts` | Unit tests for the overlay component |
| `e2e/goto-frame.spec.ts` | End-to-end Playwright tests |

### Files to Modify

| File | Change |
|------|--------|
| `src/utils/input/KeyBindings.ts` | Add `'navigation.gotoFrame'` binding (`KeyG`, global context) |
| `src/services/KeyboardActionMap.ts` | Add `gotoFrameOverlay` to `ActionControls` interface; add handler in `buildActionHandlers()` |
| `src/App.ts` | Create `GotoFrameOverlay`, mount it, expose via controls |
| `src/AppKeyboardHandler.ts` | Add `'navigation.gotoFrame'` to the shortcuts dialog categories |
| `src/ui/components/OverlayManager.ts` | (Optional) Add lazy accessor for `GotoFrameOverlay` |
| `features/keyboard-shortcuts.md` | Document the new `G` shortcut |
| `features/timeline-navigation.md` | Document goto-frame capability |

## Risks

### 1. G Key Context Conflicts

**Risk**: The `G` key is already used for `panel.gamutDiagram` (panel context) and `paint.toggleGhost` (paint context). If context resolution does not work correctly, the goto-frame action might fire when it should not, or vice versa.

**Mitigation**: The `ContextualKeyboardManager` already handles context-scoped resolution -- bindings in the active context take priority. Adding `navigation.gotoFrame` at global scope means it only fires when neither paint nor panel context is active. The existing test suite for `ContextualKeyboardManager` and `ActiveContextManager` provides confidence. Add explicit tests for the G key in different contexts to verify.

### 2. Input Focus Capture

**Risk**: When the goto-frame input is focused, the `KeyboardManager.shouldSkipEvent()` method returns `true` for all keys in text inputs. This means all keyboard shortcuts are correctly suppressed. However, when the overlay is dismissed, focus must be properly restored so shortcuts resume working.

**Mitigation**: On `hide()`, explicitly call `document.body.focus()` or restore focus to the previously focused element (save `document.activeElement` on `show()`). The existing `Modal` component follows a similar pattern with `preTrapFocus`.

### 3. Timecode Parsing Ambiguity

**Risk**: Some inputs could be ambiguous. For example, `"100"` could be frame 100 or the number 100 with no format context. The string `"1:02:03"` is not valid SMPTE (which requires exactly 4 colon-separated groups) but a user might expect it to work.

**Mitigation**: The parser uses strict format matching: SMPTE requires exactly `HH:MM:SS:FF` (or `HH:MM:SS;FF`). A bare integer is always interpreted as a frame number. Partial timecodes (e.g., `MM:SS:FF`) could be supported as a stretch goal by zero-padding the missing higher components, but the initial implementation should use strict matching and display a clear error for unrecognized formats.

### 4. Drop-Frame Timecode Accuracy

**Risk**: Converting drop-frame timecode (`HH:MM:SS;FF`) back to a frame number requires the inverse of the drop-frame calculation in `TimecodeDisplay.frameToTimecode()`. Getting this wrong would cause off-by-one or off-by-two errors at minute boundaries.

**Mitigation**: Implement the standard SMPTE drop-frame-to-frame formula. Validate against `frameToTimecode()` by round-tripping: `parse(format(frame)) === frame` for all frames in a test range. Use the existing test data from `TimecodeDisplay.test.ts` as a reference.

### 5. Playlist Frame Numbering

**Risk**: In playlist mode, the global frame space is different from individual clip frame spaces. The user might expect to enter a clip-local frame number rather than a global one.

**Mitigation**: Defer full playlist integration to a follow-up. In the initial implementation, `goToFrame` operates on the current source's frame range (inPoint to outPoint). The hint text shows the current source's range, making the behavior clear. Playlist-global navigation can be added later with a prefix convention (e.g., `g42` for global frame 42).

### 6. Performance During Input

**Risk**: Running `parseFrameInput()` on every keystroke could be a concern if the parser does complex work.

**Mitigation**: The parser is a simple regex-match-and-arithmetic function with no DOM access, async calls, or heavy computation. It will complete in microseconds. No debouncing is needed.

### 7. Mobile / Touch Devices

**Risk**: Physical keyboards are uncommon on mobile devices. The `G` key shortcut will not be discoverable.

**Mitigation**: The goto-frame feature is a power-user shortcut. Mobile users can still navigate via timeline scrubbing. A future enhancement could add a clickable frame counter on the timeline that opens the goto-frame overlay, providing a non-keyboard entry point. This is out of scope for the initial implementation.
