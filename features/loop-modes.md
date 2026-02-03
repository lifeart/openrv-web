# Loop and Playback Modes

## Original OpenRV Implementation
OpenRV supports various playback loop modes for review workflows:

**Loop Modes**:
- **Loop**: Continuous loop from out point back to in point
- **Once**: Play through once and stop
- **Ping-Pong**: Play forward then backward continuously

**In/Out Points**:
- Set in point to define loop start
- Set out point to define loop end
- Loop only within marked region
- Quick set via keyboard ([ and ])

**Playback Direction**:
- Forward playback
- Reverse playback
- Bidirectional (ping-pong)

**Frame Range**:
- Play entire sequence
- Play marked region only
- Play from current position to end

**Realtime vs All Frames**:
- Realtime: Maintain frame rate, skip frames if needed
- All frames: Show every frame, adjust timing

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Requirements
- [x] Loop mode (continuous)
- [x] Play once mode
- [x] Ping-pong mode
- [x] In/out point looping
- [x] Quick in/out point setting
- [x] Loop mode indicator
- [x] Keyboard shortcuts for mode switching
- [x] Seamless loop transition

## Implementation Details

### Core Implementation

**Session Class** (`/src/core/session/Session.ts`):
- `LoopMode` type: `'once' | 'loop' | 'pingpong'`
- `loopMode` getter/setter with `loopModeChanged` event emission
- Default loop mode: `'loop'`
- Loop handling in `advanceFrame()` method (lines 1219-1267)
- Ping-pong direction reversal with `playDirectionChanged` event
- In/Out point clamping and looping support

**Loop Mode Behaviors**:
1. **Loop Mode (`'loop'`)**: When reaching outPoint, jumps back to inPoint; when reaching inPoint (reverse), jumps to outPoint
2. **Once Mode (`'once'`)**: Stops playback and pauses when reaching boundary
3. **Ping-Pong Mode (`'pingpong'`)**: Reverses playDirection at boundaries, emits `playDirectionChanged` event

**Key Code Sections**:
```typescript
// Session.ts - Loop mode type definition (line 148)
export type LoopMode = 'once' | 'loop' | 'pingpong';

// Session.ts - Loop mode property (lines 442-450)
get loopMode(): LoopMode { return this._loopMode; }
set loopMode(mode: LoopMode) {
  if (mode !== this._loopMode) {
    this._loopMode = mode;
    this.emit('loopModeChanged', mode);
  }
}

// Session.ts - Frame advance with loop handling (lines 1234-1264)
// Handles boundary conditions for each loop mode
```

### UI Components

**HeaderBar** (`/src/ui/components/layout/HeaderBar.ts`):
- Loop mode button with icon and label display
- `cycleLoopMode()`: Cycles through `once -> loop -> pingpong -> once`
- Icons: `repeat-once` (once), `repeat` (loop), `shuffle` (pingpong)
- Labels: "Once", "Loop", "Ping"
- Visual feedback with accent color highlighting
- Event binding: `session.on('loopModeChanged', () => this.updateLoopButton())`

**Timeline** (`/src/ui/components/Timeline.ts`):
- Displays current loop mode in status bar (line 510)
- Format: `"Playing | 24/24 fps | loop"`
- Redraws on `loopModeChanged` event

### Keyboard Shortcuts

| Shortcut | Action | Binding Key |
|----------|--------|-------------|
| `L` | Cycle loop mode | `timeline.cycleLoopMode` (Ctrl+L in KeyBindings.ts, but L in practice via App.ts) |
| `I` or `[` | Set in point | `timeline.setInPoint` / `timeline.setInPointAlt` |
| `O` or `]` | Set out point | `timeline.setOutPoint` / `timeline.setOutPointAlt` |
| `R` | Reset in/out points | `timeline.resetInOut` |

**App.ts Keyboard Handler** (lines 1261-1265):
```typescript
'timeline.cycleLoopMode': () => {
  const modes: Array<'once' | 'loop' | 'pingpong'> = ['once', 'loop', 'pingpong'];
  const currentIndex = modes.indexOf(this.session.loopMode);
  this.session.loopMode = modes[(currentIndex + 1) % modes.length]!;
}
```

### State Serialization

**SessionState** (`/src/core/session/SessionState.ts`):
- `PlaybackState.loopMode`: Persisted in session state
- Default: `'loop'`
- Included in `DEFAULT_PLAYBACK_STATE`

**Session State Methods**:
- `getPlaybackState()`: Returns current loop mode
- `setPlaybackState()`: Restores loop mode and emits event

### In/Out Point Integration

**Session Methods**:
- `setInPoint(frame?)`: Sets loop start point
- `setOutPoint(frame?)`: Sets loop end point
- `resetInOut()`: Resets to full duration
- `goToInPoint()`: Seeks to in point
- `goToOutPoint()`: Seeks to out point

Loop playback respects in/out points, only playing within the defined range.

## UI/UX Specification

### Loop Mode Button (HeaderBar)
- Location: Playback controls group, after step forward button
- Minimum width: 70px
- Shows icon + label (e.g., repeat icon + "Loop")
- Click to cycle through modes
- Tooltip: "Cycle loop mode (L)"

### Visual Indicators
- Timeline status bar shows current loop mode
- Direction button updates when ping-pong reverses
- Button icon changes per mode:
  - Once: `repeat-once` (single arrow)
  - Loop: `repeat` (continuous arrows)
  - Ping-pong: `shuffle` (bidirectional arrows)

### Interaction Flow
1. Default state is "Loop" mode
2. Press L to cycle: Loop -> Ping-pong -> Once -> Loop
3. During playback, boundaries trigger mode-specific behavior
4. Ping-pong mode visually shows direction changes

## Technical Notes

### Event Flow
```
User clicks L -> cycleLoopMode() -> session.loopMode setter
  -> emit('loopModeChanged') -> HeaderBar.updateLoopButton()
                             -> Timeline.draw()
```

### Ping-Pong Direction Change
```
advanceFrame() detects boundary -> _playDirection *= -1
  -> emit('playDirectionChanged') -> HeaderBar.updateDirectionButton()
```

### Video vs Frame-Based Loop Handling
- Video forward playback: Uses HTMLVideoElement loop detection (line 1155)
- All other cases: Frame-based timing with `advanceFrame()` (line 1178)

### PlaylistManager Loop Modes
Separate loop mode system for playlist (`/src/core/session/PlaylistManager.ts`):
- `'none'`: No looping
- `'single'`: Loop current clip
- `'all'`: Loop entire playlist

## E2E Test Cases

### Existing Tests

| Test ID | File | Description |
|---------|------|-------------|
| PLAY-030 | `e2e/playback-controls.spec.ts` | Cycle loop mode with L key |
| PLAY-031 | `e2e/playback-controls.spec.ts` | Loop mode repeats from start |
| PLAY-032 | `e2e/playback-controls.spec.ts` | Once mode stops at end |
| PLAY-033 | `e2e/playback-controls.spec.ts` | Ping-pong reverses at boundaries |
| PLAY-034 | `e2e/playback-controls.spec.ts` | Ping-pong updates direction button |
| TIMELINE-060 | `e2e/timeline.spec.ts` | Loop mode cycle reflected in state |
| KEYS-036 | `e2e/keyboard-shortcuts.spec.ts` | L should cycle loop mode |
| BIZ-004 | `e2e/business-logic.spec.ts` | Loop mode cycles through all modes |
| UF-040 | `e2e/user-flows.spec.ts` | Set in/out points and review loop |
| EDGE-011 | `e2e/playback-edge-cases.spec.ts` | Reverse playback loops correctly |
| EDGE-012 | `e2e/playback-edge-cases.spec.ts` | Ping-pong reverses at in-point |
| TL-EDIT-E014 | `e2e/timeline-editing.spec.ts` | Cycle loop mode with Ctrl+L |
| TL-EDIT-E015 | `e2e/timeline-editing.spec.ts` | Support once, loop, pingpong modes |
| AUDIO-022 | `e2e/audio-playback.spec.ts` | Looping should not cause audio glitches |
| WORKFLOW-006 | `e2e/export-workflow.spec.ts` | In/out points and playback loop |

### Test Coverage Summary
- **Loop Mode Cycling**: 5+ tests
- **Loop Behavior**: 3+ tests
- **Once Mode**: 2+ tests
- **Ping-Pong Mode**: 4+ tests
- **In/Out Point Integration**: 3+ tests
- **State Persistence**: Covered in session recovery tests

## Unit Test Cases

### Existing Tests

**File**: `/src/core/session/Session.test.ts`

| Test ID | Description |
|---------|-------------|
| SES-007 | Cycles through loop modes |
| SES-007b | Does not emit if same mode |
| SES-029 | Reverse playback stops at inPoint with once mode |
| SES-030 | Reverse playback wraps to outPoint with loop mode |
| SES-031 | Ping-pong emits playDirectionChanged at outPoint |
| SES-032 | Ping-pong emits playDirectionChanged at inPoint |

**File**: `/src/ui/components/layout/HeaderBar.test.ts`

| Test | Description |
|------|-------------|
| Line 226-235 | Loop button cycles through modes |
| Line 509-510 | Loop button updates on mode change event |

### Test Implementation Details

```typescript
// Session.test.ts - Loop mode tests
describe('loopMode', () => {
  it('SES-007: cycles through loop modes', () => {
    session.loopMode = 'once';
    expect(session.loopMode).toBe('once');

    session.loopMode = 'pingpong';
    expect(session.loopMode).toBe('pingpong');

    session.loopMode = 'loop';
    expect(session.loopMode).toBe('loop');
  });

  it('does not emit if same mode', () => {
    session.loopMode = 'loop';
    const listener = vi.fn();
    session.on('loopModeChanged', listener);
    session.loopMode = 'loop';
    expect(listener).not.toHaveBeenCalled();
  });
});
```

## Related Files

| File | Purpose |
|------|---------|
| `/src/core/session/Session.ts` | Core loop mode logic |
| `/src/core/session/SessionState.ts` | State type definitions |
| `/src/ui/components/layout/HeaderBar.ts` | Loop mode UI button |
| `/src/ui/components/Timeline.ts` | Loop mode display |
| `/src/utils/KeyBindings.ts` | Keyboard shortcut definitions |
| `/src/App.ts` | Keyboard handler registration |
| `/src/test-helper.ts` | Test state exposure (loopMode) |
| `/e2e/fixtures.ts` | E2E test utilities (loopMode in state) |
