# EDL and Playlist Support

## Original OpenRV Implementation
OpenRV supports Edit Decision Lists for sequencing multiple sources:

**EDL Format (.rvedl)**:
- Simple ASCII format for sequencing
- Define source files with in/out points
- Frame range specifications
- Relative timing between clips

**Playlist Features**:
- Sequence multiple sources in order
- Define per-clip in/out points
- Retime/speed adjustment per clip
- Gap/black frame insertion

**Sequence View**:
- Linear playback of multiple sources
- Automatic transition between clips
- Timeline markers at clip boundaries
- Quick navigation between clips

**Source Management**:
- Add/remove sources from sequence
- Reorder clips
- Duplicate clips
- Copy/paste source settings

**Per-Clip Settings**:
- In point (-in flag)
- Out point (-out flag)
- Frame rate override
- Audio offset
- Color corrections

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Requirements
- [x] Create/edit playlists
- [x] Add/remove/reorder clips
- [x] Per-clip in/out points
- [x] Timeline visualization of sequence
- [x] Save/load playlist files (via state serialization)
- [x] EDL import/export (CMX 3600 format)
- [x] Clip duration display
- [ ] Gap insertion between clips (not implemented)
- [x] Quick clip navigation

---

## Implementation Documentation

### Core Components

#### PlaylistManager (`src/core/session/PlaylistManager.ts`)
Central manager for multi-clip playlist functionality.

**Key Interfaces:**
```typescript
interface PlaylistClip {
  id: string;              // Unique clip identifier
  sourceIndex: number;     // Source index in session
  sourceName: string;      // Display name
  inPoint: number;         // Start frame within source
  outPoint: number;        // End frame within source
  globalStartFrame: number;// Position in playlist timeline
  duration: number;        // Computed duration in frames
}

interface PlaylistState {
  clips: PlaylistClip[];
  enabled: boolean;
  currentFrame: number;
  loopMode: 'none' | 'single' | 'all';
}
```

**Key Methods:**
- `addClip(sourceIndex, sourceName, inPoint, outPoint)` - Add clip to playlist
- `removeClip(clipId)` - Remove clip by ID
- `moveClip(clipId, newIndex)` - Reorder clips via drag-and-drop
- `updateClipPoints(clipId, inPoint, outPoint)` - Update in/out points
- `getClipAtFrame(globalFrame)` - Map global frame to source/local frame
- `getNextFrame() / getPreviousFrame()` - Handle clip transitions and loops
- `toEDL(title)` - Export to CMX 3600 EDL format
- `fromEDL(edl, sourceResolver)` - Import from EDL format
- `getState() / setState()` - Serialization for session persistence

**Events:**
- `clipsChanged` - Clips added/removed/reordered
- `enabledChanged` - Playlist mode toggled
- `clipChanged` - Current clip changed during playback
- `loopModeChanged` - Loop mode changed
- `playlistEnded` - Reached end of playlist (no loop)

#### PlaylistPanel (`src/ui/components/PlaylistPanel.ts`)
UI panel for managing playlists with drag-and-drop reordering.

**Features:**
- Header with enable/disable toggle and close button
- "Add Current" button to add current source as clip
- Loop mode selector (No Loop / Loop Clip / Loop All)
- Draggable clip list showing name, in/out points, duration
- Remove button per clip
- Footer with clip count and total duration
- EDL export button

**Keyboard Shortcut:** `Shift+Alt+P` - Toggle playlist panel

#### TimelineEditor (`src/ui/components/TimelineEditor.ts`)
Visual timeline editor for sequence/EDL editing.

**Features:**
- Visual cut representation as colored blocks
- Drag handles for trimming in/out points
- Drag to reorder cuts
- Zoom controls (0.5x to 10x pixels per frame)
- Frame ruler with markers
- Context menu for delete operations
- Selection highlighting

**Events:**
- `cutTrimmed` - In/out points changed
- `cutMoved` - Cut repositioned
- `cutDeleted` - Cut removed
- `cutInserted` - New cut added
- `cutSelected` / `selectionCleared` - Selection state

---

## UI/UX Specification

### Playlist Panel Layout
```
┌─────────────────────────────────────────┐
│ [layers icon] Playlist    [On/Off][X]   │  <- Header with enable toggle
├─────────────────────────────────────────┤
│ [+ Add Current]       [Loop Mode ▾]     │  <- Toolbar
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ [1] SourceA.mov              [x]    │ │  <- Draggable clip item
│ │     In: 1 • Out: 100   100 frames   │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ [2] SourceB.mov              [x]    │ │
│ │     In: 25 • Out: 75    51 frames   │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ 2 clips • 6s           [download] EDL  │  <- Footer with info/export
└─────────────────────────────────────────┘
```

### Timeline Editor Layout
```
┌─────────────────────────────────────────────────────────────┐
│ Zoom: [━━━●━━━━]                                             │  <- Controls
├─────────────────────────────────────────────────────────────┤
│ |0   |25   |50   |75   |100   |125   |150                   │  <- Ruler
├─────────────────────────────────────────────────────────────┤
│ [■■■■■ Source 1 ■■■■■][■■■ Source 2 ■■■][■■■ Source 3 ■■■]  │  <- Cuts
└─────────────────────────────────────────────────────────────┘
```

### Styling (per UI.md guidelines)
- Panel uses `--bg-secondary` background
- Borders use `--border-primary`
- Active states use `rgba(var(--accent-primary-rgb), 0.15)` background
- Icons from centralized icon system (`getIconSvg`)
- Buttons follow flat design pattern with A11Y focus handling

---

## Technical Notes

### EDL Format Support
The implementation uses CMX 3600 EDL format:

**Export Format:**
```
TITLE: OpenRV Playlist
FCM: NON-DROP FRAME

001  SourceA  V     C        00:00:00:01 00:00:04:01 00:00:00:01 00:00:04:01
* FROM CLIP NAME: SourceA

002  SourceB  V     C        00:00:00:01 00:00:02:01 00:00:04:01 00:00:06:01
* FROM CLIP NAME: SourceB
```

**Timecode Format:** HH:MM:SS:FF at 24fps (configurable)

### Frame Mapping
The `getClipAtFrame()` method maps global playlist frames to source-local frames:
- Global frame 25 in a 50-frame first clip = local frame 25 in source
- Global frame 60 (in second clip starting at 51) = local frame 10 if source inPoint is 1

### Loop Mode Behavior
- **none**: Stop at playlist end, emit `playlistEnded` event
- **single**: Loop current clip (stays within same clip)
- **all**: Loop entire playlist (jump from end to frame 1)

### State Persistence
Playlist state is preserved via `getState()`/`setState()` methods:
- Included in session state serialization
- Clip IDs are regenerated correctly on restore (nextClipId tracking)

---

## E2E Test Cases

Implementation: `e2e/playlist.spec.ts`

### Playlist Panel Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PLAY-E001 | Toggle playlist panel via keyboard (Shift+Alt+P) | Implemented |
| PLAY-E002 | Playlist panel shows title | Implemented |
| PLAY-E003 | Playlist panel shows Add Current button | Implemented |
| PLAY-E004 | Playlist panel shows loop mode selector | Implemented |
| PLAY-E005 | Playlist panel shows enable toggle | Implemented |
| PLAY-E006 | Playlist panel shows EDL export button | Implemented |
| PLAY-E007 | Close button hides playlist panel | Implemented |

### Add Clips Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PLAY-E008 | Clicking Add Current adds a clip to playlist | Implemented |
| PLAY-E009 | Added clip shows source name | Implemented |
| PLAY-E010 | Added clip shows in/out points | Implemented |
| PLAY-E011 | Can add multiple clips | Implemented |

### Remove Clips Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PLAY-E012 | Clip has remove button | Implemented |
| PLAY-E013 | Clicking remove button removes clip | Implemented |

### Loop Modes Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PLAY-E014 | Loop mode selector has No Loop option | Implemented |
| PLAY-E015 | Loop mode selector has Loop Clip option | Implemented |
| PLAY-E016 | Loop mode selector has Loop All option | Implemented |
| PLAY-E017 | Changing loop mode updates selector | Implemented |

### Footer Info Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PLAY-E018 | Footer shows clip count | Implemented |
| PLAY-E019 | Footer shows total duration | Implemented |

### Enable/Disable Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PLAY-E020 | Enable button toggles playlist mode | Implemented |

### Drag and Drop Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PLAY-E021 | Clips are draggable | Implemented |

### EDL Export Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PLAY-E022 | EDL export button is present | Implemented |

### Clip Selection Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PLAY-E023 | Clicking clip selects it | Implemented |

---

## Timeline Editing E2E Tests

Implementation: `e2e/timeline-editing.spec.ts`

### Timeline UI Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-E001 | Display timeline track when media is loaded | Implemented |
| TL-EDIT-E002 | Show frame ruler on timeline | Implemented |
| TL-EDIT-E003 | Allow scrubbing on timeline | Implemented |
| TL-EDIT-E004 | Display frame numbers on timeline | Implemented |

### Playhead Control Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-E005 | Move playhead with arrow keys | Implemented |
| TL-EDIT-E006 | Jump to start with Home key | Implemented |
| TL-EDIT-E007 | Jump to end with End key | Implemented |

### In/Out Points Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-E008 | Set in point with I key | Implemented |
| TL-EDIT-E009 | Set out point with ] key | Implemented |
| TL-EDIT-E010 | Set in point with [ key (alternative) | Implemented |

### Markers Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-E011 | Add marker with M key | Implemented |
| TL-EDIT-E012 | Toggle marker off with M key | Implemented |
| TL-EDIT-E013 | Markers have notes and colors | Implemented |

### Loop Modes Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-E014 | Cycle loop mode with Ctrl+L | Implemented |
| TL-EDIT-E015 | Support once, loop, and pingpong modes | Implemented |

### Multiple Sources Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-E016 | Display A/B sources when two files loaded | Implemented |
| TL-EDIT-E017 | Toggle between sources with backtick | Implemented |

### Zoom Controls Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-E018 | Viewer zoom with mouse wheel | Implemented |
| TL-EDIT-E019 | Viewer fit-to-window zoom | Implemented |
| TL-EDIT-E020 | Viewer 100% zoom | Implemented |

---

## Unit Test Cases

### PlaylistManager Unit Tests

Implementation: `src/core/session/PlaylistManager.test.ts`

#### addClip Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PM-U001 | Add clip with correct properties | Implemented |
| PM-U002 | Calculate globalStartFrame based on existing clips | Implemented |
| PM-U003 | Emit clipsChanged event | Implemented |

#### removeClip Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PM-U004 | Remove clip by ID | Implemented |
| PM-U005 | Return false for non-existent clip | Implemented |
| PM-U006 | Recalculate global frames after removal | Implemented |

#### moveClip Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PM-U007 | Move clip to new position | Implemented |
| PM-U008 | Return false for non-existent clip | Implemented |
| PM-U009 | Clamp new index to valid range | Implemented |

#### getClipAtFrame Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PM-U010 | Return correct clip and local frame | Implemented |
| PM-U011 | Return null for frame outside playlist | Implemented |

#### getNextFrame Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PM-U012 | Advance within a clip | Implemented |
| PM-U013 | Transition to next clip at boundary | Implemented |
| PM-U014 | Loop single clip when loopMode is single | Implemented |
| PM-U015 | Loop all clips when loopMode is all | Implemented |
| PM-U016 | Emit playlistEnded when reaching end with no loop | Implemented |

#### getPreviousFrame Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PM-U017 | Go back within a clip | Implemented |
| PM-U018 | Transition to previous clip at boundary | Implemented |
| PM-U019 | Stay at frame 1 at beginning with no loop | Implemented |
| PM-U020 | Loop to end when at frame 1 with loop all | Implemented |

#### EDL Import/Export Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PM-U021 | Export empty EDL for empty playlist | Implemented |
| PM-U022 | Export clips in EDL format | Implemented |
| PM-U023 | Format timecodes correctly | Implemented |
| PM-U024 | Parse EDL format | Implemented |
| PM-U025 | Skip unresolved sources on import | Implemented |

#### State Management Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| PM-U026 | Get current state | Implemented |
| PM-U027 | Restore state | Implemented |
| PM-U028 | Toggle enabled state | Implemented |
| PM-U029 | Set and get loop mode | Implemented |
| PM-U030 | Clear all clips | Implemented |

---

### TimelineEditor Unit Tests

Implementation: `src/ui/components/TimelineEditor.test.ts`

#### Initialization Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-U001 | Create UI structure | Implemented |
| TL-EDIT-U002 | Create zoom controls | Implemented |

#### Load Sequence Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-U003 | Load EDL data from sequence node | Implemented |
| TL-EDIT-U004 | Handle empty EDL | Implemented |

#### Insert Cut Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-U005 | Insert cut at specified position | Implemented |
| TL-EDIT-U006 | Emit cutInserted event | Implemented |
| TL-EDIT-U007 | Shift subsequent cuts when inserting | Implemented |

#### Delete Cut Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-U008 | Delete cut at specified index | Implemented |
| TL-EDIT-U009 | Emit cutDeleted event | Implemented |
| TL-EDIT-U010 | Shift subsequent cuts after deletion | Implemented |
| TL-EDIT-U011 | Handle invalid index | Implemented |

#### Trim Cut Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-U012 | Update in/out points | Implemented |
| TL-EDIT-U013 | Emit cutTrimmed event | Implemented |
| TL-EDIT-U014 | Adjust subsequent cuts when duration changes | Implemented |

#### Move Cut Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-U015 | Move cut to new position | Implemented |
| TL-EDIT-U016 | Emit cutMoved event | Implemented |
| TL-EDIT-U017 | Clamp position to valid range | Implemented |

#### Selection Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-U018 | Emit cutSelected event | Implemented |
| TL-EDIT-U019 | Emit selectionCleared when clicking empty space | Implemented |

#### Zoom Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-U020 | setZoom updates pixel density | Implemented |
| TL-EDIT-U021 | Clamp zoom to valid range | Implemented |

#### Render Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-U022 | Render cut elements | Implemented |
| TL-EDIT-U023 | Render ruler markers | Implemented |

#### Dispose Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| TL-EDIT-U024 | Clear container | Implemented |
| TL-EDIT-U025 | Remove document event listeners | Implemented |
| TL-EDIT-U026 | Remove zoom slider event listener | Implemented |
| TL-EDIT-U027 | Remove open context menu on dispose | Implemented |

---

## Test Coverage Summary

| Component | E2E Tests | Unit Tests | Total |
|-----------|-----------|------------|-------|
| PlaylistManager | - | 30 | 30 |
| PlaylistPanel | 23 | - | 23 |
| TimelineEditor | 20 | 27 | 47 |
| **Total** | **43** | **57** | **100** |

---

## Related Files

### Implementation
- `/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineEditor.ts`
- `/Users/lifeart/Repos/openrv-web/src/nodes/groups/SequenceGroupNode.ts`

### Tests
- `/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.test.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineEditor.test.ts`
- `/Users/lifeart/Repos/openrv-web/e2e/playlist.spec.ts`
- `/Users/lifeart/Repos/openrv-web/e2e/timeline-editing.spec.ts`

### Related
- `/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts` (integrates PlaylistManager)
- `/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts` (state serialization)
