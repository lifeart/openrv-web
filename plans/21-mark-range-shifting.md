# Mark-to-Mark Range Shifting

## Overview

Desktop OpenRV supports **Ctrl+Arrow** shortcuts to shift the in/out playback range to the next or previous mark pair, enabling reviewers to quickly loop through individual shots or marked segments without manually resetting in/out points. The web version of OpenRV already has marks (with notes, colors, and duration markers), in/out points, keyboard shortcuts, and loop modes fully implemented, but lacks the range-shifting workflow that ties these features together.

This feature adds **Ctrl+Right** and **Ctrl+Left** keyboard shortcuts that snap the in/out range to adjacent mark pairs (or source boundaries in playlists), providing instant looping through marked sections. When combined with the existing loop modes (`loop`, `once`, `pingpong`), this creates a professional shot-review workflow where reviewers can mark points of interest and rapidly cycle between them.

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

**Ctrl+Right and Ctrl+Left are currently unbound.** No conflict with existing shortcuts.

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
3. **Duration markers as single units**: A duration marker (with `endFrame`) defines its own range segment. When encountered, the entire duration marker span becomes the in/out range.
4. **Wrap-around support**: Shifting past the last segment wraps to the first (and vice versa) when loop mode is `loop`.
5. **Playhead follows range**: After shifting, the playhead moves to the in point of the new range.

### Component Responsibilities

```
KeyBindings.ts          -- Define Ctrl+Right / Ctrl+Left bindings
       |
       v
KeyboardActionMap.ts    -- Map bindings to FrameNavigationService methods
       |
       v
FrameNavigationService  -- New methods: shiftRangeToNext() / shiftRangeToPrevious()
       |
       v
MarkerManager           -- New method: getMarkPairs(currentFrame) -> range boundaries
       |
       v
Session / PlaybackEngine -- setInPoint() / setOutPoint() / goToFrame()
       |
       v
Timeline.ts             -- Redraws via existing inOutChanged event
       |
       v
AriaAnnouncer           -- Announces new range for screen readers
```

### Data Flow

1. User presses **Ctrl+Right**.
2. `KeyboardManager` matches binding `timeline.shiftRangeNext`, calls handler.
3. Handler calls `frameNavigationService.shiftRangeToNext()`.
4. `shiftRangeToNext()`:
   a. Collects all range boundary frames (user marks + auto-marks from playlist clips).
   b. Sorts boundaries ascending.
   c. Identifies the current segment (which segment contains the current in point or current frame).
   d. Selects the next segment.
   e. Calls `session.setInPoint(nextIn)` and `session.setOutPoint(nextOut)`.
   f. Calls `session.goToFrame(nextIn)` to move the playhead.
   g. Triggers visual feedback (timeline flash animation).
   h. Announces new range via `AriaAnnouncer`.
5. `PlaybackEngine` emits `inOutChanged`, causing `Timeline` to redraw with the new brackets.

## Algorithm

### Building the Boundary List

```typescript
function collectRangeBoundaries(
  markers: ReadonlyMap<number, Marker>,
  playlistClips: PlaylistClip[] | null,
  sourceDuration: number
): number[] {
  const boundaries = new Set<number>();

  // Always include start and end of the source
  boundaries.add(1);
  boundaries.add(sourceDuration);

  // Add all user marks
  for (const marker of markers.values()) {
    boundaries.add(marker.frame);
    // Duration markers: add end frame as a boundary too
    if (marker.endFrame !== undefined) {
      boundaries.add(marker.endFrame);
    }
  }

  // Add playlist clip boundaries (auto-marks)
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

### Duration Marker Handling

When a duration marker is encountered, the segment that contains the duration marker's full range (`frame` to `endFrame`) should be treated as a single unit. Rather than splitting a duration marker across segments, the `collectRangeBoundaries` function places both `frame` and `endFrame` as boundaries. This naturally creates a segment that spans exactly the duration marker's range.

### Edge Cases

1. **No marks**: The entire source duration is a single segment. Shifting does nothing.
2. **Single mark**: Creates two segments: `[1, mark]` and `[mark, duration]`.
3. **Adjacent marks on same frame**: Deduplicated by the `Set` in `collectRangeBoundaries`.
4. **Playlist with marks**: Clip boundaries and user marks merge. If a mark falls on a clip boundary, it is deduplicated.
5. **Current range matches no segment**: Falls back to finding which segment contains the current frame.
6. **Playback in progress**: Shifting pauses playback, sets the new range, then optionally resumes. This matches desktop OpenRV behavior.

## UI Design

### Visual Feedback Animation

When the range shifts, the timeline should provide brief visual feedback:

1. **In/out bracket flash**: The existing bracket markers momentarily glow brighter (using a brief CSS transition or canvas animation) for 300ms to draw attention to the range change.
2. **Range highlight pulse**: The in/out range background color (`inOutRange`) briefly pulses to a higher opacity (from 0.13 to 0.3) and fades back over 400ms.

Implementation approach: Add a `_rangeShiftFlashUntil` timestamp to `Timeline`. During `draw()`, if `Date.now() < _rangeShiftFlashUntil`, use the brighter colors. `scheduleDraw()` is called with a delayed callback to clear the flash.

### Screen Reader Announcement

After each shift, announce:
```
"Range shifted to frames {inPoint} - {outPoint}"
```
or in timecode mode:
```
"Range shifted to {inTimecode} - {outTimecode}"
```

### Playhead Behavior

- After range shift, the playhead always moves to the new in point.
- If playback was active before the shift, playback continues from the new in point.
- This ensures the reviewer immediately sees the start of the new section.

### Keyboard Shortcut Labels

| Shortcut | Action | Description |
|----------|--------|-------------|
| Ctrl+Right | `timeline.shiftRangeNext` | Shift in/out range to next mark pair |
| Ctrl+Left | `timeline.shiftRangePrevious` | Shift in/out range to previous mark pair |

These appear in the keyboard shortcuts cheat sheet (toggled by `Shift+?`).

## Implementation Steps

### Step 1: Add Key Bindings

Add two new entries to `DEFAULT_KEY_BINDINGS` in `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts`:

```typescript
'timeline.shiftRangeNext': {
  code: 'ArrowRight',
  ctrl: true,
  description: 'Shift in/out range to next mark pair'
},
'timeline.shiftRangePrevious': {
  code: 'ArrowLeft',
  ctrl: true,
  description: 'Shift in/out range to previous mark pair'
},
```

### Step 2: Add `getMarkBoundaries()` to MarkerManager

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

### Step 3: Add Range Shifting to FrameNavigationService

Add the following to `FrameNavigationService`:

1. Extend `NavSession` interface with `inPoint`, `outPoint`, `loopMode`, and `sourceDuration` accessors.
2. Add `shiftRangeToNext()` and `shiftRangeToPrevious()` methods.
3. Add private helper `collectRangeBoundaries()` that merges user marks with playlist clip boundaries.
4. Add private helper `buildSegments()` and `findCurrentSegmentIndex()`.

The `FrameNavigationDeps` interface gains:
```typescript
export interface NavSession {
  // ... existing fields ...
  readonly inPoint: number;
  readonly outPoint: number;
  readonly loopMode: 'once' | 'loop' | 'pingpong';
  readonly marks: ReadonlyMap<number, { frame: number; endFrame?: number }>;
  readonly currentSource: { duration: number } | null;
}
```

### Step 4: Wire into KeyboardActionMap

Add handlers to the action map in `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts`:

```typescript
'timeline.shiftRangeNext': () => frameNavigation.shiftRangeToNext(),
'timeline.shiftRangePrevious': () => frameNavigation.shiftRangeToPrevious(),
```

### Step 5: Register in AppKeyboardHandler

Add `'timeline.shiftRangeNext'` and `'timeline.shiftRangePrevious'` to the action registration list in `/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts` (they follow the standard flow through `DEFAULT_KEY_BINDINGS` + `getActionHandlers()`, so they should register automatically).

### Step 6: Add Visual Feedback to Timeline

In `/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts`:

1. Add a `_rangeShiftFlashUntil: number = 0` field.
2. Add a `flashRangeShift()` method that sets `_rangeShiftFlashUntil = Date.now() + 400` and schedules draws.
3. In `draw()`, when rendering the in/out range highlight and brackets, check if `Date.now() < _rangeShiftFlashUntil` and use brighter colors if so.
4. Subscribe to a new `rangeShifted` event (or call `flashRangeShift()` directly from the navigation service callback).

### Step 7: Add Accessibility Announcements

In `shiftRangeToNext()` and `shiftRangeToPrevious()`, call `AriaAnnouncer.announce()` with the new range information.

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
| RS-010 | Playlist boundaries merge with user marks |
| RS-011 | Playhead moves to in point of new range |
| RS-012 | Range shift works with pingpong loop mode |
| RS-013 | Adjacent marks on same frame are deduplicated |
| RS-014 | Multiple duration markers create correct segments |

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
| KB-U070 | defines timeline.shiftRangeNext with Ctrl+ArrowRight |
| KB-U071 | defines timeline.shiftRangePrevious with Ctrl+ArrowLeft |

### Step 9: Add E2E Tests

Add to `/Users/lifeart/Repos/openrv-web/e2e/keyboard-shortcuts.spec.ts` or create `/Users/lifeart/Repos/openrv-web/e2e/mark-range-shifting.spec.ts`:

| Test ID | Description |
|---------|-------------|
| MRS-E001 | Ctrl+Right shifts range to next mark pair |
| MRS-E002 | Ctrl+Left shifts range to previous mark pair |
| MRS-E003 | Range shift updates timeline in/out indicators |
| MRS-E004 | Range shift wraps around with loop mode |
| MRS-E005 | Range shift with no marks does nothing |
| MRS-E006 | Range shift with single mark creates two segments |
| MRS-E007 | Playback continues in new range after shift |
| MRS-E008 | Range shift works during active playback |

### Step 10: Update Documentation

Update `/Users/lifeart/Repos/openrv-web/features/keyboard-shortcuts.md` with the new shortcuts.
Update `/Users/lifeart/Repos/openrv-web/features/markers-annotations.md` with range shifting behavior.
Update `/Users/lifeart/Repos/openrv-web/features/loop-modes.md` with range shifting integration.

## Files to Create/Modify

### Files to Modify

| File | Change |
|------|--------|
| `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts` | Add `timeline.shiftRangeNext` and `timeline.shiftRangePrevious` entries |
| `/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts` | Add `getMarkBoundaries()` method |
| `/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.ts` | Add `shiftRangeToNext()`, `shiftRangeToPrevious()`, and range-building helpers. Extend `NavSession` interface with `inPoint`, `outPoint`, `loopMode`, `marks`, `currentSource` |
| `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts` | Add `timeline.shiftRangeNext` and `timeline.shiftRangePrevious` action handlers. Extend `ActionSession` interface with `inPoint`, `outPoint`, `loopMode`, `marks`, `currentSource` |
| `/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts` | Add new actions to the registration list (if not auto-registered through the existing loop over `DEFAULT_KEY_BINDINGS`) |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts` | Add `_rangeShiftFlashUntil` field, `flashRangeShift()` method, and enhanced draw logic for the flash effect |
| `/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.test.ts` | Add tests for `getMarkBoundaries()` |
| `/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.test.ts` | Add tests for range shifting |
| `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.test.ts` | Add tests for new bindings |
| `/Users/lifeart/Repos/openrv-web/features/keyboard-shortcuts.md` | Document new Ctrl+Arrow shortcuts |
| `/Users/lifeart/Repos/openrv-web/features/markers-annotations.md` | Document range shifting feature |

### Files to Create

| File | Purpose |
|------|---------|
| `/Users/lifeart/Repos/openrv-web/e2e/mark-range-shifting.spec.ts` | E2E tests for mark-to-mark range shifting |

### Files Not Changed (Reference Only)

| File | Reason |
|------|--------|
| `/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts` | No changes needed; `setInPoint()`, `setOutPoint()`, `goToFrame()` already exist and are sufficient |
| `/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts` | No changes needed; in/out point logic already supports range updates |
| `/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts` | No changes needed; `getClips()` and `getClipAtFrame()` already provide needed data |
| `/Users/lifeart/Repos/openrv-web/src/api/MarkersAPI.ts` | No changes needed unless public API exposure is desired (phase 2) |

## Risks

### 1. Ctrl+Arrow Browser Conflicts

**Risk**: On some platforms, Ctrl+Arrow has default browser behavior (e.g., word-by-word text cursor movement, or browser tab navigation).

**Mitigation**: The existing `KeyboardManager` calls `event.preventDefault()` when a binding matches. The input-field isolation logic already skips shortcuts in text inputs, so Ctrl+Arrow will only be intercepted when focus is not in a text field. Verify this does not conflict with browser-level shortcuts (e.g., Ctrl+Left/Right for word navigation in macOS is handled at the input field level, which is already excluded).

### 2. Playlist Source-Switching Complexity

**Risk**: When shifting ranges across playlist clip boundaries, source switching and in/out point updates must be coordinated. The existing `jumpToPlaylistGlobalFrame()` handles this, but the range shifting logic must correctly merge playlist boundaries with user marks across multiple sources.

**Mitigation**: In playlist mode, convert all playlist clip boundaries to global frame numbers before merging with user marks. Use `jumpToPlaylistGlobalFrame()` for the actual navigation, which already handles source switching and in/out point updates. Non-playlist mode (single source) is simpler and avoids this complexity.

### 3. Duration Marker Segment Ambiguity

**Risk**: A duration marker with `endFrame` could overlap with other marks, creating confusing segment boundaries.

**Mitigation**: Duration marker boundaries are treated the same as any other boundary. If a point marker falls inside a duration marker range, it creates sub-segments within the duration range. This is consistent with how marks work -- each mark is a boundary, and segments are defined by consecutive boundaries. Document this behavior clearly.

### 4. Performance with Many Marks

**Risk**: Collecting and sorting boundaries on every Ctrl+Arrow press could be slow with hundreds of marks.

**Mitigation**: The boundary collection is O(N) where N is the number of marks, and sorting is O(N log N). With the typical use case of 10-100 marks, this is negligible. If needed, boundaries can be cached and invalidated on `marksChanged` events.

### 5. Visual Feedback Timing

**Risk**: The canvas-based flash animation requires manual scheduling and could cause visual artifacts if the user rapidly shifts ranges.

**Mitigation**: Each shift resets the `_rangeShiftFlashUntil` timestamp, so rapid shifts extend the flash rather than creating overlapping animations. The draw scheduling already uses `requestAnimationFrame` debouncing via `scheduleDraw()`.

### 6. Interaction with Active Playback

**Risk**: Shifting ranges while playback is active could cause frame jumps, audio discontinuities, or race conditions with the timing controller.

**Mitigation**: The `setInPoint()` and `setOutPoint()` methods in `PlaybackEngine` already handle active playback correctly -- they clamp the current frame if it falls outside the new range and emit the appropriate events. If the playhead is outside the new range, it moves to the nearest boundary. To avoid audio glitches, the shift pauses playback briefly and resumes it (consistent with desktop OpenRV behavior), or alternatively, the shift can simply update the bounds and let the existing loop logic handle the playhead naturally.

### 7. State Serialization

**Risk**: Range-shifted in/out points should persist in session state so that reopening a session preserves the current range.

**Mitigation**: In/out points are already serialized as part of `PlaybackState` in `SessionState.ts`. No additional serialization work is needed. The marks themselves are also serialized. The combination of saved marks and saved in/out points means the exact range is preserved on session reload.
