# Mark-to-Mark Range Shifting

## Overview

Desktop OpenRV supports **Ctrl+Arrow** shortcuts to shift the in/out playback range to the next or previous mark pair, enabling reviewers to quickly loop through individual shots or marked segments without manually resetting in/out points. The web version of OpenRV already has marks (with notes, colors, and duration markers), in/out points, keyboard shortcuts, and loop modes fully implemented, but lacks the range-shifting workflow that ties these features together.

This feature adds **Shift+Up** and **Shift+Down** keyboard shortcuts (plus **Ctrl+Right** and **Ctrl+Left** as secondary bindings) that snap the in/out range to adjacent mark pairs (or source boundaries in playlists), providing instant looping through marked sections. When combined with the existing loop modes (`loop`, `once`, `pingpong`), this creates a professional shot-review workflow where reviewers can mark points of interest and rapidly cycle between them.

> **Note on shortcut choice**: Ctrl+Left/Right are intercepted by macOS at the OS level for switching between Spaces (virtual desktops). Users with multiple Spaces enabled would never receive these keypresses. Shift+Up/Down are unbound on all platforms and have no OS-level conflicts. The vertical arrows also suggest "level jumping" which maps well to the concept of jumping between range segments. Ctrl+Right/Left are retained as secondary bindings for users on platforms without this conflict.

## Current State

### Marks System (`MarkerManager`)

**File**: `/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts`

The `MarkerManager` class manages all marker state:

- **Data structure**: `Map<number, Marker>` keyed by frame number.
- **Marker interface**: `{ frame: number; note: string; color: string; endFrame?: number }`.
- **Point markers**: Standard markers at a single frame.
- **Duration markers**: Markers with `endFrame` defining a range span.
- **Navigation**: `findNextMarkerFrame(currentFrame)` and `findPreviousMarkerFrame(currentFrame)` return the next/previous marker frame with wrap-around.
- **Bulk operations**: `replaceAll()`, `setFromFrameNumbers()`, `setFromArray()`, `toArray()` for serialization.

Markers are exposed to the rest of the application through `SessionAnnotations` (which owns `MarkerManager`) and then through `Session`.

### In/Out Points (`PlaybackEngine`)

**File**: `/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts`

- `_inPoint` / `_outPoint`: Define the playback range (1-based frame numbers).
- `setInPoint(frame?)`: Clamps to `[1, outPoint]`, emits `inOutChanged`.
- `setOutPoint(frame?)`: Clamps to `[inPoint, duration]`, emits `inOutChanged`.
- `resetInOutPoints()`: Resets to `[1, duration]`.
- The `advanceFrame()` method respects in/out bounds for all loop modes.
- `SessionPlayback` delegates to `PlaybackEngine` for all in/out operations.
- `Session` exposes `setInPoint()`, `setOutPoint()`, `resetInOutPoints()` publicly.

**Important**: `setInPoint` clamps to `[1, current outPoint]` and `setOutPoint` clamps to `[current inPoint, duration]`. This cross-clamping means calling them sequentially can produce incorrect results when the new range does not overlap the old range. See the `setInOutRange()` method introduced below to solve this.

### Keyboard Shortcuts

**File**: `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts`

Existing related bindings:
- `timeline.setInPoint` (I key): Set in point at current frame.
- `timeline.setOutPoint` (O key): Set out point at current frame.
- `timeline.resetInOut` (R key): Reset in/out to full range.
- `timeline.nextMarkOrBoundary` (Alt+Right): Navigate to next mark or playlist clip boundary.
- `timeline.previousMarkOrBoundary` (Alt+Left): Navigate to previous mark or playlist clip boundary.
- `timeline.nextShot` (PageDown): Jump to next playlist clip.
- `timeline.previousShot` (PageUp): Jump to previous playlist clip.

**Shift+Up, Shift+Down, Ctrl+Right, and Ctrl+Left are currently unbound.**

### Frame Navigation Service

**File**: `/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.ts`

The `FrameNavigationService` handles navigation across marks and playlist boundaries:
- `goToNextMarkOrBoundary()`: First tries marker navigation via `session.goToNextMarker()`, then falls back to playlist clip boundaries.
- `goToPreviousMarkOrBoundary()`: Same pattern in reverse.
- `goToNextShot()` / `goToPreviousShot()`: Direct playlist clip navigation.
- `jumpToPlaylistGlobalFrame()`: Maps global frame to source/local frame, switches sources, and updates in/out points for the target clip.

### Playlist System

**File**: `/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts`

- Each `PlaylistClip` has `{ sourceIndex, sourceName, inPoint, outPoint, globalStartFrame, duration }`.
- `getClipAtFrame()` maps global frame to clip + local frame.
- `goToNextClip()` / `goToPreviousClip()` navigate between clips.
- Clips inherently define source boundaries that should act as implicit marks for range shifting.

### Loop Modes

**File**: `/Users/lifeart/Repos/openrv-web/src/core/types/session.ts`

```typescript
type LoopMode = 'once' | 'loop' | 'pingpong';
```

All three modes are fully implemented in `PlaybackEngine.advanceFrame()` and respect in/out points. Range shifting must work correctly with all loop modes:
- **loop**: After shifting, playback loops within the new range.
- **once**: After shifting, playback plays through the new range once.
- **pingpong**: After shifting, playback bounces within the new range.

### Timeline Rendering

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts`

The timeline already renders:
- In/out range highlight with bracket markers (filled rect + bracket shapes).
- User marks as colored vertical lines (with optional duration spans).
- Annotation markers as triangles below the track.
- Played portion within the range.

Any visual feedback for range shifting can leverage the existing `inOutChanged` event that triggers a timeline redraw.

### Accessibility

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/a11y/AriaAnnouncer.ts`

The `AriaAnnouncer` provides screen reader announcements. Range shifts should announce the new range for accessibility.

## Proposed Architecture

### Design Principles

1. **Mark pairs as range segments**: Two consecutive marks define a range segment. The first mark is the in point, the second is the out point. With N marks, there are N-1 segments between them, plus two edge segments (start-to-first-mark, last-mark-to-end).
2. **Auto-marks at source boundaries**: When a playlist is active, clip boundaries are treated as implicit marks. These merge with user marks to form the complete set of range boundaries.
3. **Duration markers as single units**: A duration marker (with `endFrame`) defines its own range segment. When encountered, the entire duration marker span becomes the in/out range. Note: if a point marker falls inside a duration marker range, it creates sub-segments within the duration range. This is an intentional deviation from desktop OpenRV, which treats duration markers as atomic units. The rationale is that point markers placed inside a duration marker range indicate intentional sub-division by the reviewer.
4. **Wrap-around support**: Shifting past the last segment wraps to the first (and vice versa) when loop mode is `loop` or `pingpong`. In `once` mode, shifting stops at the first/last segment. This is an intentional deviation from desktop OpenRV, which wraps in all loop modes. The `once` mode boundary prevents accidental wrap-around in the web environment.
5. **Playhead follows range**: After shifting, the playhead moves to the in point of the new range.
6. **No playback interruption**: Range shifting does NOT pause playback. The in/out range is updated live and the playhead continues in the new range. This matches desktop OpenRV behavior.
7. **Atomic range update**: In/out points are set via a single `setInOutRange()` method to avoid cross-clamping bugs and double event emission.
8. **Coordinate space correctness**: User marks (local frame numbers) must be converted to global frame numbers when in playlist mode before merging with playlist clip boundaries.

### Component Responsibilities

```
KeyBindings.ts          -- Define Shift+Up/Down and Ctrl+Right/Left bindings
       |
       v
KeyboardActionMap.ts    -- Map bindings to FrameNavigationService methods
       |                   + announce range via AriaAnnouncer
       v
FrameNavigationService  -- New methods: shiftRangeToNext() / shiftRangeToPrevious()
       |
       v
MarkerManager           -- New method: getMarkBoundaries() -> sorted frame numbers
       |
       v
Session / PlaybackEngine -- New method: setInOutRange(in, out) + goToFrame()
       |
       v
Session event            -- Emits 'rangeShifted' event (new)
       |
       v
Timeline.ts             -- Subscribes to 'rangeShifted', triggers flash animation
       |
       v
AriaAnnouncer           -- Announces new range (called from KeyboardActionMap)
```

### Data Flow

1. User presses **Shift+Down** (or **Ctrl+Right**).
2. `KeyboardManager` matches binding `timeline.shiftRangeNext`, calls handler.
3. Handler calls `frameNavigationService.shiftRangeToNext()`.
4. `shiftRangeToNext()`:
   a. Collects all range boundary frames (user marks converted to global frame space + auto-marks from playlist clips).
   b. Sorts boundaries ascending.
   c. Identifies the current segment (which segment contains the current in point or current frame).
   d. Selects the next segment.
   e. Calls `session.setInOutRange(nextIn, nextOut)` (atomic, single event emission).
   f. Calls `session.goToFrame(nextIn)` to move the playhead.
   g. Returns the new range info to the caller.
5. Handler (in `KeyboardActionMap`) announces new range via `AriaAnnouncer`.
6. `PlaybackEngine` emits `inOutChanged` (once, from `setInOutRange`), causing `Timeline` to redraw with the new brackets.
7. `Session` emits `rangeShifted` event, causing `Timeline` to trigger flash animation.

## Algorithm

### Building the Boundary List

```typescript
function collectRangeBoundaries(
  markers: ReadonlyMap<number, Marker>,
  playlistClips: PlaylistClip[] | null,
  sourceDuration: number,
  currentClip: PlaylistClip | null // needed for local-to-global conversion
): number[] {
  const boundaries = new Set<number>();

  // Always include start and end of the source
  boundaries.add(1);
  boundaries.add(sourceDuration);

  // Add all user marks, converting to global frame space if in playlist mode
  for (const marker of markers.values()) {
    let frame = marker.frame;
    let endFrame = marker.endFrame;

    // Convert local frame numbers to global when in playlist mode
    if (currentClip) {
      frame = currentClip.globalStartFrame + frame - 1;
      if (endFrame !== undefined) {
        endFrame = currentClip.globalStartFrame + endFrame - 1;
      }
    }

    boundaries.add(frame);
    // Duration markers: add end frame as a boundary too, clamped to source duration
    if (endFrame !== undefined) {
      boundaries.add(Math.min(endFrame, sourceDuration));
    }
  }

  // Add playlist clip boundaries (auto-marks, already in global frame space)
  if (playlistClips) {
    for (const clip of playlistClips) {
      boundaries.add(clip.globalStartFrame);
      boundaries.add(clip.globalStartFrame + clip.duration - 1);
    }
  }

  return Array.from(boundaries).sort((a, b) => a - b);
}
```

### Building Range Segments from Boundaries

```typescript
interface RangeSegment {
  inPoint: number;
  outPoint: number;
}

function buildSegments(boundaries: number[]): RangeSegment[] {
  if (boundaries.length < 2) return [];

  const segments: RangeSegment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    segments.push({
      inPoint: boundaries[i],
      outPoint: boundaries[i + 1],
    });
  }
  return segments;
}
```

### Finding Current Segment

```typescript
function findCurrentSegmentIndex(
  segments: RangeSegment[],
  currentInPoint: number,
  currentFrame: number
): number {
  // First, try to find a segment matching the current in point exactly
  const exactMatch = segments.findIndex(s => s.inPoint === currentInPoint);
  if (exactMatch !== -1) return exactMatch;

  // Fall back to finding which segment contains the current frame
  for (let i = segments.length - 1; i >= 0; i--) {
    if (currentFrame >= segments[i].inPoint && currentFrame <= segments[i].outPoint) {
      return i;
    }
  }

  // Default to first segment
  return 0;
}
```

Note: When two consecutive segments share a boundary frame (e.g., segments [1-50] and [50-100] both include frame 50), `findCurrentSegmentIndex` uses a reverse search and returns the later segment. This means pressing Shift+Up from frame 50 goes to segment [1-50], which also includes frame 50. This is acceptable behavior: boundary frames belong to both adjacent segments, and the reverse search provides consistent directionality.

### Shifting Logic

```typescript
function shiftRangeToNext(
  segments: RangeSegment[],
  currentIndex: number,
  loopMode: LoopMode
): RangeSegment | null {
  if (segments.length === 0) return null;

  const nextIndex = currentIndex + 1;
  if (nextIndex < segments.length) {
    return segments[nextIndex];
  }

  // At end: wrap if looping, otherwise stay
  if (loopMode === 'loop' || loopMode === 'pingpong') {
    return segments[0];
  }
  return null;
}

function shiftRangeToPrevious(
  segments: RangeSegment[],
  currentIndex: number,
  loopMode: LoopMode
): RangeSegment | null {
  if (segments.length === 0) return null;

  const prevIndex = currentIndex - 1;
  if (prevIndex >= 0) {
    return segments[prevIndex];
  }

  // At start: wrap if looping, otherwise stay
  if (loopMode === 'loop' || loopMode === 'pingpong') {
    return segments[segments.length - 1];
  }
  return null;
}
```

### Atomic Range Setting (New Method)

To avoid the cross-clamping bug when calling `setInPoint()` then `setOutPoint()` sequentially, a new atomic method is added to `PlaybackEngine`:

```typescript
setInOutRange(newIn: number, newOut: number): void {
  const duration = this._host?.getCurrentSource()?.duration ?? 1;
  this._inPoint = clamp(newIn, 1, duration);
  this._outPoint = clamp(newOut, this._inPoint, duration);
  this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
}
```

**Why this is necessary**: `setInPoint()` clamps to `[1, current outPoint]` and `setOutPoint()` clamps to `[current inPoint, duration]`. When shifting forward (e.g., from range [10, 20] to [30, 40]), calling `setInPoint(30)` first clamps it to `min(30, outPoint=20) = 20`, producing the wrong range [20, 40]. The atomic method avoids this by setting both values together without cross-referencing the old values.

### Duration Marker Handling

When a duration marker is encountered, the segment that contains the duration marker's full range (`frame` to `endFrame`) should be treated as a single unit. Rather than splitting a duration marker across segments, the `collectRangeBoundaries` function places both `frame` and `endFrame` as boundaries. This naturally creates a segment that spans exactly the duration marker's range.

If a point marker falls inside a duration marker's span, it creates sub-segments within that range. This is intentional: point markers inside a duration range indicate the reviewer wants finer-grained navigation within that span. This differs from desktop OpenRV, which treats duration markers as atomic units.

### Edge Cases

1. **No marks**: The entire source duration is a single segment. Shifting does nothing.
2. **Single mark**: Creates two segments: `[1, mark]` and `[mark, duration]`. Both segments include the mark frame. This is a valid single-frame overlap at the boundary.
3. **Adjacent marks on same frame**: Deduplicated by the `Set` in `collectRangeBoundaries`.
4. **Playlist with marks**: Clip boundaries and user marks merge. User marks are converted from local frame numbers to global frame numbers before merging. If a mark falls on a clip boundary, it is deduplicated.
5. **Current range matches no segment**: Falls back to finding which segment contains the current frame.
6. **Playback in progress**: Shifting does NOT pause playback. The in/out range is updated live via `setInOutRange()` and the playhead moves to the new in point. Playback continues from there. This matches desktop OpenRV behavior.
7. **Zero-length segments**: If two consecutive boundaries are at the same frame (after deduplication, this should not happen), it would create a segment where `inPoint === outPoint`. This is treated as a valid single-frame range (useful for freeze-frame review).
8. **Duration marker beyond source duration**: `marker.endFrame` is clamped to `sourceDuration` in `collectRangeBoundaries` to avoid segments referencing invalid frames.
9. **Marks outside current source duration**: Marks with frame numbers exceeding the source duration are clamped to `sourceDuration`. Marks at frame 0 or below are clamped to 1.

## UI Design

### Visual Feedback Animation

When the range shifts, the timeline should provide brief visual feedback:

1. **In/out bracket flash**: The existing bracket markers momentarily glow brighter (using a brief CSS transition or canvas animation) for 300ms to draw attention to the range change.
2. **Range highlight pulse**: The in/out range background color (`inOutRange`) briefly pulses to a higher opacity (from 0.13 to 0.3) and fades back over 400ms.

Implementation approach: Add a `_rangeShiftFlashUntil` timestamp to `Timeline`. During `draw()`, if `Date.now() < _rangeShiftFlashUntil`, use the brighter colors. `scheduleDraw()` is called with a delayed callback to clear the flash.

The flash is triggered by subscribing to the `rangeShifted` event emitted by `Session`, keeping `FrameNavigationService` free of UI dependencies.

### Screen Reader Announcement

After each shift, announce:
```
"Range shifted to frames {inPoint} - {outPoint}"
```
or in timecode mode:
```
"Range shifted to {inTimecode} - {outTimecode}"
```

The announcement is made from `KeyboardActionMap` (not from `FrameNavigationService`) to keep the service layer free of UI concerns.

### Playhead Behavior

- After range shift, the playhead always moves to the new in point.
- If playback was active before the shift, playback continues from the new in point (no pause/resume cycle).
- This ensures the reviewer immediately sees the start of the new section.

### Keyboard Shortcut Labels

| Shortcut | Action | Description |
|----------|--------|-------------|
| Shift+Down | `timeline.shiftRangeNext` | Shift in/out range to next mark pair |
| Shift+Up | `timeline.shiftRangePrevious` | Shift in/out range to previous mark pair |
| Ctrl+Right | `timeline.shiftRangeNext` | Shift in/out range to next mark pair (secondary) |
| Ctrl+Left | `timeline.shiftRangePrevious` | Shift in/out range to previous mark pair (secondary) |

These appear in the keyboard shortcuts cheat sheet (toggled by `Shift+?`).

## Implementation Steps

### Step 1: Add `setInOutRange()` to PlaybackEngine and Session

Add a new atomic method to `PlaybackEngine` in `/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts`:

```typescript
setInOutRange(newIn: number, newOut: number): void {
  const duration = this._host?.getCurrentSource()?.duration ?? 1;
  this._inPoint = clamp(newIn, 1, duration);
  this._outPoint = clamp(newOut, this._inPoint, duration);
  this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
}
```

Expose through `SessionPlayback` and `Session`:

```typescript
// Session.ts
setInOutRange(inPoint: number, outPoint: number): void {
  this._playback.setInOutRange(inPoint, outPoint);
}
```

This method emits `inOutChanged` exactly once, solving both the cross-clamping ordering bug and the double event emission problem.

### Step 2: Add Key Bindings

Add entries to `DEFAULT_KEY_BINDINGS` in `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts`:

```typescript
// Primary bindings (no OS-level conflicts)
'timeline.shiftRangeNext': {
  code: 'ArrowDown',
  shift: true,
  description: 'Shift in/out range to next mark pair'
},
'timeline.shiftRangePrevious': {
  code: 'ArrowUp',
  shift: true,
  description: 'Shift in/out range to previous mark pair'
},
// Secondary bindings (note: conflicts with macOS Spaces)
'timeline.shiftRangeNextAlt': {
  code: 'ArrowRight',
  ctrl: true,
  description: 'Shift in/out range to next mark pair'
},
'timeline.shiftRangePreviousAlt': {
  code: 'ArrowLeft',
  ctrl: true,
  description: 'Shift in/out range to previous mark pair'
},
```

### Step 3: Add `getMarkBoundaries()` to MarkerManager

Add a method to `MarkerManager` that returns all mark frame numbers sorted, including duration marker end frames:

```typescript
getMarkBoundaries(): number[] {
  const boundaries = new Set<number>();
  for (const marker of this._marks.values()) {
    boundaries.add(marker.frame);
    if (marker.endFrame !== undefined) {
      boundaries.add(marker.endFrame);
    }
  }
  return Array.from(boundaries).sort((a, b) => a - b);
}
```

### Step 4: Add Range Shifting to FrameNavigationService

Add the following to `FrameNavigationService`:

1. Extend `NavSession` interface with `inPoint`, `outPoint`, `loopMode`, `marks`, `currentSource`, and `setInOutRange()`.
2. Add `shiftRangeToNext()` and `shiftRangeToPrevious()` methods.
3. Add private helper `collectRangeBoundaries()` that merges user marks with playlist clip boundaries, converting user marks from local to global frame space.
4. Add private helpers `buildSegments()` and `findCurrentSegmentIndex()`.

The `NavSession` interface gains:
```typescript
export interface NavSession {
  // ... existing fields ...
  readonly inPoint: number;
  readonly outPoint: number;
  readonly loopMode: 'once' | 'loop' | 'pingpong';
  readonly marks: ReadonlyMap<number, { frame: number; endFrame?: number }>;
  readonly currentSource: { duration: number } | null;
  setInOutRange(inPoint: number, outPoint: number): void;
}
```

The `shiftRangeToNext()` / `shiftRangeToPrevious()` methods return the new range (or null if no shift occurred) so the caller can use the result for accessibility announcements.

### Step 5: Wire into KeyboardActionMap

Add handlers to the action map in `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts`:

```typescript
'timeline.shiftRangeNext': () => {
  const result = frameNavigation.shiftRangeToNext();
  if (result) {
    ariaAnnouncer.announce(`Range shifted to frames ${result.inPoint} - ${result.outPoint}`);
  }
},
'timeline.shiftRangePrevious': () => {
  const result = frameNavigation.shiftRangeToPrevious();
  if (result) {
    ariaAnnouncer.announce(`Range shifted to frames ${result.inPoint} - ${result.outPoint}`);
  }
},
// Secondary bindings map to the same handlers
'timeline.shiftRangeNextAlt': () => { /* same as shiftRangeNext */ },
'timeline.shiftRangePreviousAlt': () => { /* same as shiftRangePrevious */ },
```

### Step 6: Register in AppKeyboardHandler

Add `'timeline.shiftRangeNext'` and `'timeline.shiftRangePrevious'` (and their Alt variants) to the action registration list in `/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts`. They should register automatically through the existing loop over `DEFAULT_KEY_BINDINGS` + `getActionHandlers()`.

Also update the `TIMELINE` category array in `AppKeyboardHandler.showShortcutsDialog()` to include the new actions, so they appear in the grouped cheat sheet.

### Step 7: Add `rangeShifted` Event and Visual Feedback to Timeline

In `Session`, emit a `rangeShifted` event after `setInOutRange()` is called from the range-shifting flow (not from every `setInOutRange` call -- only when triggered by the shift action).

In `/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts`:

1. Add a `_rangeShiftFlashUntil: number = 0` field.
2. Add a `flashRangeShift()` method that sets `_rangeShiftFlashUntil = Date.now() + 400` and schedules draws.
3. In `draw()`, when rendering the in/out range highlight and brackets, check if `Date.now() < _rangeShiftFlashUntil` and use brighter colors if so.
4. Subscribe to the `rangeShifted` event from `Session` to trigger `flashRangeShift()`. This keeps `FrameNavigationService` decoupled from UI.

### Step 8: Add Unit Tests

Create `/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.rangeShift.test.ts`:

| Test ID | Description |
|---------|-------------|
| RS-001 | shiftRangeToNext shifts to next mark pair |
| RS-002 | shiftRangeToNext wraps around in loop mode |
| RS-003 | shiftRangeToNext does not wrap in once mode |
| RS-004 | shiftRangeToPrevious shifts to previous mark pair |
| RS-005 | shiftRangeToPrevious wraps around in loop mode |
| RS-006 | shiftRangeToPrevious does not wrap in once mode |
| RS-007 | No marks: range covers full duration, shift is no-op |
| RS-008 | Single mark: creates two segments, shifts between them |
| RS-009 | Duration marker defines its own segment |
| RS-010 | Playlist boundaries merge with user marks (global frame space) |
| RS-011 | Playhead moves to in point of new range |
| RS-012 | Range shift works with pingpong loop mode |
| RS-013 | Adjacent marks on same frame are deduplicated |
| RS-014 | Multiple duration markers create correct segments |
| RS-015 | Forward shift uses atomic setInOutRange (no clamping bug) |
| RS-016 | User marks are converted to global frame numbers in playlist mode |
| RS-017 | Duration marker endFrame is clamped to source duration |
| RS-018 | Playback is not paused during range shift |

Add tests to `/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.test.ts`:

| Test ID | Description |
|---------|-------------|
| MKR-044 | getMarkBoundaries returns empty for no marks |
| MKR-045 | getMarkBoundaries returns sorted frame numbers |
| MKR-046 | getMarkBoundaries includes duration marker end frames |
| MKR-047 | getMarkBoundaries deduplicates overlapping boundaries |

Add tests to `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.test.ts`:

| Test ID | Description |
|---------|-------------|
| KB-U070 | defines timeline.shiftRangeNext with Shift+ArrowDown |
| KB-U071 | defines timeline.shiftRangePrevious with Shift+ArrowUp |
| KB-U072 | defines timeline.shiftRangeNextAlt with Ctrl+ArrowRight |
| KB-U073 | defines timeline.shiftRangePreviousAlt with Ctrl+ArrowLeft |

Add tests to `/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.test.ts`:

| Test ID | Description |
|---------|-------------|
| PE-XXX | setInOutRange sets both points atomically |
| PE-XXX | setInOutRange clamps to valid range |
| PE-XXX | setInOutRange emits inOutChanged exactly once |
| PE-XXX | setInOutRange handles forward shift (newIn > current outPoint) |

### Step 9: Add E2E Tests

Add to `/Users/lifeart/Repos/openrv-web/e2e/keyboard-shortcuts.spec.ts` or create `/Users/lifeart/Repos/openrv-web/e2e/mark-range-shifting.spec.ts`:

| Test ID | Description |
|---------|-------------|
| MRS-E001 | Shift+Down shifts range to next mark pair |
| MRS-E002 | Shift+Up shifts range to previous mark pair |
| MRS-E003 | Range shift updates timeline in/out indicators |
| MRS-E004 | Range shift wraps around with loop mode |
| MRS-E005 | Range shift with no marks does nothing |
| MRS-E006 | Range shift with single mark creates two segments |
| MRS-E007 | Playback continues in new range after shift |
| MRS-E008 | Range shift works during active playback |
| MRS-E009 | Ctrl+Right/Left also trigger range shift (secondary bindings) |

### Step 10: Update Documentation

Update `/Users/lifeart/Repos/openrv-web/features/keyboard-shortcuts.md` with the new shortcuts.
Update `/Users/lifeart/Repos/openrv-web/features/markers-annotations.md` with range shifting behavior.
Update `/Users/lifeart/Repos/openrv-web/features/loop-modes.md` with range shifting integration.

## Files to Create/Modify

### Files to Modify

| File | Change |
|------|--------|
| `/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts` | Add `setInOutRange(inPoint, outPoint)` method |
| `/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts` | Expose `setInOutRange()` publicly, emit `rangeShifted` event |
| `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts` | Add `timeline.shiftRangeNext`, `timeline.shiftRangePrevious`, and Alt variants |
| `/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts` | Add `getMarkBoundaries()` method |
| `/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.ts` | Add `shiftRangeToNext()`, `shiftRangeToPrevious()`, and range-building helpers. Extend `NavSession` interface with `inPoint`, `outPoint`, `loopMode`, `marks`, `currentSource`, `setInOutRange` |
| `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts` | Add `timeline.shiftRangeNext`, `timeline.shiftRangePrevious`, and Alt variant action handlers. Add AriaAnnouncer announcement calls |
| `/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts` | Add new actions to the TIMELINE category in `showShortcutsDialog()` |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts` | Add `_rangeShiftFlashUntil` field, `flashRangeShift()` method, subscribe to `rangeShifted` event, and enhanced draw logic for the flash effect |
| `/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.test.ts` | Add tests for `getMarkBoundaries()` |
| `/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.test.ts` | Add tests for `setInOutRange()` |
| `/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.test.ts` | Add tests for range shifting |
| `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.test.ts` | Add tests for new bindings |
| `/Users/lifeart/Repos/openrv-web/features/keyboard-shortcuts.md` | Document new Shift+Up/Down and Ctrl+Arrow shortcuts |
| `/Users/lifeart/Repos/openrv-web/features/markers-annotations.md` | Document range shifting feature |

### Files to Create

| File | Purpose |
|------|---------|
| `/Users/lifeart/Repos/openrv-web/e2e/mark-range-shifting.spec.ts` | E2E tests for mark-to-mark range shifting |

### Files Not Changed (Reference Only)

| File | Reason |
|------|--------|
| `/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts` | No changes needed; `getClips()` and `getClipAtFrame()` already provide needed data |
| `/Users/lifeart/Repos/openrv-web/src/api/MarkersAPI.ts` | No changes needed unless public API exposure is desired (phase 2) |

## Risks

### 1. macOS Ctrl+Arrow Spaces Conflict

**Risk**: On macOS, Ctrl+Left and Ctrl+Right are system-level shortcuts for switching between Spaces (virtual desktops). The OS intercepts these before the browser, making Ctrl+Arrow unreachable for users with multiple Spaces.

**Mitigation**: Shift+Up/Down are the primary bindings and have no OS-level conflicts on any platform. Ctrl+Right/Left are retained as secondary bindings for Windows/Linux users who may find them more intuitive. The cheat sheet displays both options. The macOS limitation of the Ctrl+Arrow bindings should be noted in the keyboard shortcuts documentation.

### 2. Playlist Source-Switching Complexity

**Risk**: When shifting ranges across playlist clip boundaries, source switching and in/out point updates must be coordinated. The existing `jumpToPlaylistGlobalFrame()` handles this, but the range shifting logic must correctly merge playlist boundaries with user marks across multiple sources.

**Mitigation**: In playlist mode, convert all user marks from local frame numbers to global frame numbers before merging with playlist clip boundaries. Use `jumpToPlaylistGlobalFrame()` for the actual navigation, which already handles source switching and in/out point updates. Non-playlist mode (single source) is simpler and avoids this complexity.

### 3. Duration Marker Segment Ambiguity

**Risk**: A duration marker with `endFrame` could overlap with other marks, creating confusing segment boundaries.

**Mitigation**: Duration marker boundaries are treated the same as any other boundary. If a point marker falls inside a duration marker range, it creates sub-segments within the duration range. This is an intentional deviation from desktop OpenRV (which treats duration markers as atomic units) and is documented in the Design Principles section. The rationale is that explicit point markers inside a duration range indicate the reviewer wants sub-division.

### 4. Performance with Many Marks

**Risk**: Collecting and sorting boundaries on every shift keypress could be slow with hundreds of marks.

**Mitigation**: The boundary collection is O(N) where N is the number of marks, and sorting is O(N log N). With the typical use case of 10-100 marks, this is negligible. If needed, boundaries can be cached and invalidated on `marksChanged` events.

### 5. Visual Feedback Timing

**Risk**: The canvas-based flash animation requires manual scheduling and could cause visual artifacts if the user rapidly shifts ranges.

**Mitigation**: Each shift resets the `_rangeShiftFlashUntil` timestamp, so rapid shifts extend the flash rather than creating overlapping animations. The draw scheduling already uses `requestAnimationFrame` debouncing via `scheduleDraw()`.

### 6. Interaction with Active Playback

**Risk**: Shifting ranges while playback is active could cause frame jumps or race conditions with the timing controller.

**Mitigation**: The atomic `setInOutRange()` method updates both in and out points in a single call, emitting one `inOutChanged` event. The playhead is then moved to the new in point via `goToFrame()`. Playback continues from there without pause/resume. This matches desktop OpenRV behavior and avoids audio discontinuities from pause/resume cycles.

### 7. State Serialization

**Risk**: Range-shifted in/out points should persist in session state so that reopening a session preserves the current range.

**Mitigation**: In/out points are already serialized as part of `PlaybackState` in `SessionState.ts`. No additional serialization work is needed. The marks themselves are also serialized. The combination of saved marks and saved in/out points means the exact range is preserved on session reload.

## Review Notes (Future Iterations)

The following items were identified during expert review as valuable enhancements but not required for the initial implementation:

1. **Segment index indicator**: Show "Segment 3/7" on the timeline or in the info row to give users positional context when cycling through segments.
2. **Undo support**: Register in/out point changes with `HistoryManager` so Ctrl+Z reverts range shifts. Not required for v1 but expected by power users.
3. **Mark-from-selection shortcut**: Add a shortcut to create two marks at the current in/out points, enabling a bidirectional workflow (marks-to-range and range-to-marks).
4. **Viewer HUD flash**: Add brief visual feedback on the viewer's frame counter or HUD display on range shift, in addition to the timeline flash.
5. **Expand range to next mark**: Add a shortcut to grow the current range to the next/previous mark without shifting, complementing the shift operation.
6. **Scrollable timeline support**: If a scrollable/zoomable timeline is added in the future, range shifting must ensure the new range is visible (auto-scroll).
7. **Network sync implications**: If two reviewers are connected via network sync, range shifting via in/out points may be synchronized since in/out points are part of session state. This should be evaluated when network sync is implemented.
