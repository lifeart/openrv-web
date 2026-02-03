# Playback Speed Control

## Original OpenRV Implementation
OpenRV provides comprehensive playback speed controls:

**Speed Options**:
- Normal speed (1x)
- Fast forward (2x, 4x, 8x, etc.)
- Slow motion (0.5x, 0.25x, etc.)
- Reverse playback at various speeds
- Frame-by-frame stepping

**J/K/L Controls**:
- Professional editing standard
- J: Reverse playback (multiple presses increase speed)
- K: Pause
- L: Forward playback (multiple presses increase speed)

**Speed Display**:
- Current playback speed indicator
- Target FPS vs actual FPS display
- Speed shown in timeline widget

**Retime View**:
- Speed-adjusted playback view
- Per-source speed modifications
- Automatic retiming for conflicting FPS sources

**Audio Handling**:
- Audio pitch adjustment with speed (optional)
- Mute audio at high speeds
- Audio sync at non-standard speeds

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Requirements
- [x] Variable playback speed (0.25x to 8x+)
- [x] Reverse playback
- [x] Frame-by-frame stepping (forward/backward)
- [x] J/K/L keyboard controls
- [x] Speed indicator display
- [x] Audio pitch correction (optional) - `preservesPitch` toggle in speed context menu (default: on)
- [x] Smooth speed transitions
- [ ] Per-source speed override - Not yet implemented
- [x] Speed presets

## Implementation Details

### Core Session Speed Control (`src/core/session/Session.ts`)

The Session class manages playback speed with the following key components:

**Speed Presets**:
```typescript
export const PLAYBACK_SPEED_PRESETS = [0.1, 0.25, 0.5, 1, 2, 4, 8] as const;
```

**Properties**:
- `_playbackSpeed: number` - Current playback speed (default: 1)
- Speed clamped between 0.1 and 8

**Methods**:
- `get/set playbackSpeed(value: number)` - Get/set with clamping and event emission
- `increaseSpeed(): void` - Jump to next preset
- `decreaseSpeed(): void` - Jump to previous preset
- `resetSpeed(): void` - Reset to 1x

**Events**:
- `playbackSpeedChanged: number` - Emitted when speed changes

**Speed Constraints**:
- Reverse playback limited to `MAX_REVERSE_SPEED = 4` to prevent frame extraction issues
- Frame accumulator reset on speed change to prevent timing discontinuity
- Video element `playbackRate` synced for native video sources

### UI Components

#### Speed Button (`src/ui/components/layout/HeaderBar.ts`)

**Location**: Header bar, after direction button

**Features**:
- Displays current speed (e.g., "1x", "2x", "0.5x")
- Click: Cycle through forward presets (1 -> 2 -> 4 -> 8 -> 1)
- Shift+Click: Cycle backwards (decrease speed)
- Right-click: Context menu with all speed presets
- Visual highlighting when not at 1x (accent color)

**Test ID**: `[data-testid="playback-speed-button"]`

**Styling**:
- Monospace font for consistent width
- Transparent background at 1x
- Accent color (blue) background when speed != 1x

### Keyboard Shortcuts (`src/utils/KeyBindings.ts`)

**J/K/L Speed Controls** (Professional editing standard):
| Key | Action | Binding Name |
|-----|--------|--------------|
| J | Decrease playback speed | `playback.slower` |
| K | Stop playback (pause) | `playback.stop` |
| L | Increase playback speed | `playback.faster` |

**Note**: L key alone triggers `playback.faster`. `Ctrl+L` is used for `timeline.cycleLoopMode`.

### Audio Handling

- Audio plays at 1x speed only for forward playback
- Audio is muted during:
  - Reverse playback (`_playDirection < 0`)
  - Non-1x speeds (via video element pause)
- Volume state preserved when muting for speed changes

## UI/UX Specification

### Speed Button Appearance
```
┌─────────────────────────────────────────────────────────┐
│ Header Bar                                              │
│ ... [▶][▷][▶▶] [Loop] [↔] [1x] ...                     │
│                              ▲                          │
│                        Speed Button                     │
└─────────────────────────────────────────────────────────┘
```

### Speed Button States
| State | Background | Border | Text Color |
|-------|------------|--------|------------|
| Normal (1x) | transparent | transparent | `--text-secondary` |
| Hover | `--bg-hover` | `--border-secondary` | `--text-primary` |
| Active (not 1x) | `rgba(accent, 0.15)` | `--accent-primary` | `--accent-primary` |

### Speed Context Menu
Right-click on speed button shows:
```
┌──────────┐
│ 0.1x     │
│ 0.25x    │
│ 0.5x     │
│ ● 1x     │  ← Current speed highlighted
│ 2x       │
│ 4x       │
│ 8x       │
└──────────┘
```

### Keyboard Reference
| Shortcut | Action |
|----------|--------|
| J | Decrease speed to previous preset |
| K | Stop/pause playback |
| L | Increase speed to next preset |
| Space | Toggle play/pause |
| ↑ | Toggle playback direction |
| ←/→ | Step backward/forward one frame |

## Technical Notes

### Speed Calculation in Playback Loop
From `Session.update()`:
```typescript
const effectiveSpeed = this._playDirection < 0
  ? Math.min(this._playbackSpeed, MAX_REVERSE_SPEED)
  : this._playbackSpeed;
const frameDuration = 1000 / (this._fps * effectiveSpeed);
```

### Integration Points
1. **HeaderBar**: Creates and manages speed button UI
2. **App.ts**: Registers JKL keyboard shortcuts via KeyboardManager
3. **Session.ts**: Manages speed state and emits events
4. **test-helper.ts**: Exposes `playbackSpeed` in `SessionState` for testing

### Files Modified for Implementation
- `src/core/session/Session.ts` - Core speed logic
- `src/ui/components/layout/HeaderBar.ts` - Speed button UI
- `src/utils/KeyBindings.ts` - JKL keyboard bindings
- `src/test-helper.ts` - Test state exposure
- `e2e/fixtures.ts` - E2E test fixtures

## E2E Test Cases

### Existing Tests (`e2e/new-features.spec.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| SPEED-001 | Default playback speed should be 1x | ✅ Implemented |
| SPEED-002 | Speed button should be visible in header bar | ✅ Implemented |
| SPEED-003 | Clicking speed button should cycle through speeds | ✅ Implemented |
| SPEED-004 | J key should decrease playback speed | ✅ Implemented |
| SPEED-005 | L key should increase playback speed | ✅ Implemented |
| SPEED-006 | K key should stop playback | ✅ Implemented |
| SPEED-007 | Speed button should highlight when not at 1x | ✅ Implemented |

### Additional Tests (`e2e/playback-edge-cases.spec.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| EDGE-080 | PLAYBACK_SPEED_PRESETS has expected values | ✅ Implemented |
| Various | Speed preset menu tests | ✅ Implemented |

### Additional Test Cases (Recommended)

| Test ID | Description | Priority |
|---------|-------------|----------|
| SPEED-008 | Shift+click on speed button should decrease speed | Medium |
| SPEED-009 | Right-click context menu should show all presets | Medium |
| SPEED-010 | Selecting preset from menu should change speed | Medium |
| SPEED-011 | Speed should persist across play/pause cycles | High |
| SPEED-012 | Speed indicator should update in real-time | Medium |
| SPEED-013 | Audio should mute at non-1x speeds | High |
| SPEED-014 | Reverse playback should respect MAX_REVERSE_SPEED limit | High |
| SPEED-015 | Frame timing should remain accurate at all speeds | High |

## Unit Test Cases

### Existing Tests

#### HeaderBar Tests (`src/ui/components/layout/HeaderBar.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| HDR-U037 | Has speed button | ✅ Implemented |
| HDR-U070 | Speed button shows current speed | ✅ Implemented |
| HDR-U071 | Clicking speed button cycles through presets | ✅ Implemented |
| HDR-U072 | Speed button has blue styling when not at 1x | ✅ Implemented |
| HDR-U122 | Updates speed button when speed changes | ✅ Implemented |
| HDR-U150 | Speed resets to 1x after reaching max preset | ✅ Implemented |
| HDR-U151 | PLAYBACK_SPEED_PRESETS are ordered ascending | ✅ Implemented |

#### KeyBindings Tests (`src/utils/KeyBindings.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| KB-U004 | Defines JKL speed controls | ✅ Implemented |

### Additional Unit Tests (Recommended)

| Test ID | Description | Priority |
|---------|-------------|----------|
| SESS-U001 | Session.increaseSpeed() jumps to next preset | High |
| SESS-U002 | Session.decreaseSpeed() jumps to previous preset | High |
| SESS-U003 | Session.resetSpeed() sets speed to 1x | High |
| SESS-U004 | playbackSpeed setter clamps values between 0.1 and 8 | High |
| SESS-U005 | playbackSpeedChanged event fires with correct value | High |
| SESS-U006 | Speed change resets frame accumulator during playback | Medium |
| SESS-U007 | Video playbackRate synced when speed changes | Medium |

## Related Features
- [Frame Accurate Playback](./frame-accurate-playback.md)
- [Keyboard Shortcuts](./keyboard-shortcuts.md)
- [Caching Performance](./caching-performance.md)
