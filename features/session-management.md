# Session Management

## Original OpenRV Implementation
OpenRV provides comprehensive session management through .rv session files that preserve the complete state of a review session:

**Session Components**:
- Sources (individual sequences/movies added to session)
- Layers (associated media like audio with image sequences)
- Views (custom arrangements and comparisons)
- Color corrections and LUT assignments
- Compositing setups
- Playback settings

**View Types**:
- **Source View**: Individual media sources
- **Sequence View**: Linear playback of multiple sources (default)
- **Stack View**: Layered viewing with compositing
- **Layout View**: Grid/spatial arrangement
- **Switch View**: Quick switching between sources
- **Retime View**: Speed-adjusted playback

**Session Manager Interface**:
- Hierarchical tree view of all session components
- Folder organization for grouping related content
- Navigation between views
- Source management (add, remove, reorder)

Sessions can be saved to disk and reopened later, preserving all viewing state and corrections.

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Implementation Summary

The session management feature is **fully implemented** with comprehensive functionality across multiple modules:

### Core Components Implemented

| Component | File | Description |
|-----------|------|-------------|
| **Session** | `src/core/session/Session.ts` | Main session class with playback control, source management, A/B compare, markers, volume, and event system |
| **SessionState** | `src/core/session/SessionState.ts` | Type definitions for serializable state (media, playback, paint, view, color, CDL, filters, transform, crop, lens, wipe, stack, LUT) |
| **SessionSerializer** | `src/core/session/SessionSerializer.ts` | Save/load `.orvproject` files with migration support, blob URL handling, and file reload prompts |
| **SnapshotManager** | `src/core/session/SnapshotManager.ts` | IndexedDB-based versioned snapshots (manual + auto-checkpoints) with preview, export/import |
| **AutoSaveManager** | `src/core/session/AutoSaveManager.ts` | Automatic IndexedDB persistence with configurable intervals, crash recovery detection, debouncing |
| **PlaylistManager** | `src/core/session/PlaylistManager.ts` | Multi-clip playlist with EDL import/export, loop modes, frame mapping |

### UI Components Implemented

| Component | File | Description |
|-----------|------|-------------|
| **SnapshotPanel** | `src/ui/components/SnapshotPanel.ts` | Full-featured panel for viewing, searching, filtering, restoring, renaming, exporting, and deleting snapshots |
| **AutoSaveIndicator** | `src/ui/components/AutoSaveIndicator.ts` | Visual status indicator (saving, saved, error, disabled) with relative time display |

## Requirements

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Save/load session files | Implemented | `SessionSerializer.saveToFile()`, `loadFromFile()` with `.orvproject` format |
| Preserve source references and relative paths | Implemented | `MediaReference` with path, name, type, dimensions, duration, fps |
| Store color correction settings | Implemented | `SessionState.color`, `SessionState.cdl`, `SessionState.lutPath`, `SessionState.lutIntensity` |
| Store view configurations | Implemented | `SessionState.view` (zoom, panX, panY), `SessionState.wipe`, `SessionState.transform` |
| Store playback position and in/out points | Implemented | `SessionState.playback` (currentFrame, inPoint, outPoint, fps, loopMode, volume, muted) |
| Store markers and annotations | Implemented | `SessionState.playback.marks`, `SessionState.paint` (frames with annotations, effects) |
| Session auto-save functionality | Implemented | `AutoSaveManager` with configurable intervals (1-30 min), debouncing, crash recovery |
| Recent sessions list | Implemented | `AutoSaveManager.listAutoSaves()`, `SnapshotManager.listSnapshots()` |
| Session export/sharing capability | Implemented | `SnapshotManager.exportSnapshot()`, `SessionSerializer.saveToFile()` |
| Folder organization within sessions | Partially Implemented | `PlaylistManager` for clip organization; full folder hierarchy not yet implemented |

## UI/UX Specification

### Save Project Flow
1. User clicks "Save" button in header bar or presses `Ctrl+S`
2. `SessionSerializer.toJSON()` captures current state from all components
3. For blob URLs (local files), sets `requiresReload: true` and clears path
4. Downloads `.orvproject` JSON file with project name

### Load Project Flow
1. User selects `.orvproject` file via file input
2. `SessionSerializer.loadFromFile()` validates and parses JSON
3. For media with `requiresReload: true`, shows file reload dialog (`showFileReloadPrompt`)
4. User can select file, skip, or cancel for each media reference
5. Restores all viewer state (color, CDL, filters, transform, crop, lens, wipe, stack)
6. Loads annotations into paint engine

### Auto-Save Indicator (Header Bar)
- **Location**: Right side of header bar
- **States**:
  - `idle`: Cloud icon, muted color, shows relative time since last save
  - `saving`: Cloud icon with pulse animation, accent color, "Saving..."
  - `saved`: Cloud-check icon, success color, "Saved" (3s then returns to idle)
  - `error`: Cloud-off icon, error color, "Save failed" (clickable for retry)
  - `disabled`: Cloud-off icon, muted color, "Auto-save off"

### Snapshot Panel
- **Trigger**: Button in header or keyboard shortcut
- **Position**: Fixed panel, right side, 320px wide
- **Features**:
  - Search input for filtering snapshots by name/description
  - Filter dropdown (All / Manual / Auto)
  - List view with cards showing:
    - Name and description
    - Badge (MANUAL blue / AUTO yellow)
    - Preview info (source, frame, annotations, color grade)
    - Timestamp and size
    - Action buttons (Restore, Rename, Export, Delete)
  - Clear All button in footer

### File Reload Dialog
- **Type**: Modal dialog
- **Elements**:
  - Expected filename display
  - File input for selecting replacement file
  - Filename mismatch warning (if selected file differs)
  - Selected file indicator
  - Load button (disabled until file selected)
  - Skip button (continues without loading media)

## Technical Notes

### Session State Schema (v1)
```typescript
interface SessionState {
  version: number;           // Schema version for migration
  name: string;              // Project name
  createdAt: string;         // ISO timestamp
  modifiedAt: string;        // ISO timestamp
  media: MediaReference[];   // Source files
  playback: PlaybackState;   // Frame, in/out, fps, loop, volume, marks
  paint: SerializedPaintState; // Annotations per frame + effects
  view: ViewState;           // Zoom, pan
  color: ColorAdjustments;   // Brightness, contrast, saturation, exposure, gamma
  cdl: CDLValues;            // Slope, offset, power, saturation
  filters: FilterSettings;   // Blur, sharpen
  transform: Transform2D;    // Rotation, flip, scale, translate
  crop: CropState;           // Enabled, region
  lens: LensDistortionParams; // K1, K2, center
  wipe: WipeState;           // Mode, position, angle
  stack: StackLayer[];       // Layer stack
  lutPath?: string;          // LUT file reference (not embedded)
  lutIntensity: number;      // LUT blend amount
  playlist?: PlaylistState;  // Optional playlist clips
}
```

### IndexedDB Databases
- **`openrv-web-autosave`**: Auto-save entries with session state
- **`openrv-web-snapshots`**: Manual snapshots and auto-checkpoints

### Blob URL Handling
Blob URLs (from `URL.createObjectURL()` for local files) are session-specific and invalid after browser close. The serializer:
1. Detects blob URLs during save
2. Sets `requiresReload: true` on the media reference
3. Clears the path to prevent saving invalid URLs
4. On load, prompts user to re-select the file

### Auto-Save Configuration
```typescript
interface AutoSaveConfig {
  interval: number;      // Minutes (1-30, default 5)
  enabled: boolean;      // Default true
  maxVersions: number;   // Max entries to keep (1-100, default 10)
}
```

### Snapshot Configuration
- Max manual snapshots: 50
- Max auto-checkpoints: 10
- Auto-pruning of oldest entries when limits exceeded

## E2E Test Cases

### Existing Tests (e2e/session-recovery.spec.ts)

| ID | Test Name | Status |
|----|-----------|--------|
| RECOVERY-E001 | loaded local files have blob URLs | Implemented |
| RECOVERY-E002 | save and load project shows file reload dialog for blob URL files | Implemented |
| RECOVERY-E003 | loading project with requiresReload media shows file reload dialog | Implemented |
| RECOVERY-E004 | skip file reload shows warning | Implemented |
| RECOVERY-E005 | filename mismatch shows warning in dialog | Implemented |
| RECOVERY-E006 | correct filename shows no warning | Implemented |
| RECOVERY-E007 | load button disabled until file selected | Implemented |
| RECOVERY-E008 | successfully reload file loads media | Implemented |

### Existing Tests (e2e/session-integration.spec.ts)

| ID | Test Name | Status |
|----|-----------|--------|
| SI-E001 | matte overlay is hidden by default | Implemented |
| SI-E002 | matte overlay canvas element exists | Implemented |
| SI-E003 | matte overlay can be enabled via API | Implemented |
| SI-E004 | matte overlay can be toggled | Implemented |
| SI-E005 | matte aspect ratio can be changed | Implemented |
| SI-E006 | matte opacity can be changed | Implemented |
| SI-E007 | matte center point can be changed | Implemented |
| SI-E008 | matte settings persist when changing frames | Implemented |
| SI-E010 | session has default metadata values | Implemented |
| SI-E011 | session metadata displayName is accessible | Implemented |
| SI-E012 | session metadata comment is accessible | Implemented |
| SI-E020 | default frame increment is 1 | Implemented |
| SI-E021 | frame increment can be changed via API | Implemented |
| SI-E022 | step forward uses frame increment | Implemented |
| SI-E023 | step backward uses frame increment | Implemented |
| SI-E030 | paint effects ghost mode is accessible | Implemented |
| SI-E031 | paint effects hold mode is accessible | Implemented |
| SI-E032 | ghost mode can be enabled via session event | Implemented |
| SI-E033 | hold mode can be enabled via session event | Implemented |
| SI-E034 | ghost before/after values are configurable | Implemented |
| SI-E040 | session emits frameIncrementChanged event | Implemented |
| SI-E041 | matte overlay emits settingsChanged event | Implemented |
| SI-E050 | session name display element exists in header | Implemented |
| SI-E051 | session name display shows Untitled by default | Implemented |
| SI-E052 | session name display updates when metadata changes via API | Implemented |
| SI-E053 | session name display tooltip shows comment | Implemented |
| SI-E054 | session name display tooltip shows external origin | Implemented |
| SI-E055 | session metadata persists when changing frames | Implemented |

## Unit Test Cases

### Existing Tests (src/core/session/*.test.ts)

#### SessionSerializer.test.ts
| ID | Test Name | Status |
|----|-----------|--------|
| SER-001 | parses valid project file | Implemented |
| SER-003 | preserves data through save/load cycle | Implemented |
| SER-004 | throws error for invalid JSON | Implemented |
| SER-005 | handles missing fields with defaults | Implemented |
| SER-006 | serializes all components correctly | Implemented |
| SER-007 | serializes sequence info | Implemented |
| SER-008 | restores state correctly (video, image, sequence) | Implemented |
| SER-008b | warns on unexpected blob URL in saved project | Implemented |
| SER-008c | prompts user to reload requiresReload files | Implemented |
| SER-008d | adds warning when user skips file reload | Implemented |
| SER-008e | handles loadFile failure during reload gracefully | Implemented |
| SER-008f | handles multiple requiresReload files sequentially | Implemented |
| SER-009 | handles load failures | Implemented |
| SER-010 | handles older version migration | Implemented |
| SER-011 | warns about LUT path | Implemented |
| SER-012 | serializes LUT path | Implemented |
| SER-013 | marks blob URLs with requiresReload and clears path | Implemented |
| SER-014 | does not set requiresReload for non-blob URLs | Implemented |

#### AutoSaveManager.test.ts
| ID | Test Name | Status |
|----|-----------|--------|
| AUTOSAVE-U001 | initializes with default config | Implemented |
| AUTOSAVE-U002 | accepts custom config on construction | Implemented |
| AUTOSAVE-U003 | has no unsaved changes initially | Implemented |
| AUTOSAVE-U004 | last save time is null initially | Implemented |
| AUTOSAVE-U005 | setConfig updates interval | Implemented |
| AUTOSAVE-U006 | setConfig clamps interval to valid range | Implemented |
| AUTOSAVE-U007 | setConfig clamps maxVersions to valid range | Implemented |
| AUTOSAVE-U008 | setConfig emits configChanged event | Implemented |
| AUTOSAVE-U009 | enabling auto-save updates config | Implemented |
| AUTOSAVE-U010 | disabling auto-save updates config | Implemented |
| AUTOSAVE-U011 | markDirty sets unsaved changes flag | Implemented |
| AUTOSAVE-U012 | markDirty stores state getter (lazy evaluation) | Implemented |
| AUTOSAVE-U013 | multiple markDirty calls within debounce window are batched | Implemented |
| AUTOSAVE-U014 | save returns null when not initialized | Implemented |
| AUTOSAVE-U015 | save emits saving event when initialized | Implemented |
| AUTOSAVE-U019 | listAutoSaves returns empty array when not initialized | Implemented |
| AUTOSAVE-U020 | getAutoSave returns null when not initialized | Implemented |
| AUTOSAVE-U021 | getMostRecent returns null when no entries | Implemented |
| AUTOSAVE-U024 | dispose can be called multiple times | Implemented |
| AUTOSAVE-U025 | dispose clears pending state | Implemented |
| AUTOSAVE-U027 | entry contains required metadata | Implemented |
| AUTOSAVE-U028 | default interval is 5 minutes | Implemented |
| AUTOSAVE-U029 | auto-save is enabled by default | Implemented |
| AUTOSAVE-U030 | default maxVersions is 10 | Implemented |
| AUTOSAVE-U031 | checkStorageQuota returns null when Storage API unavailable | Implemented |
| AUTOSAVE-U032 | checkStorageQuota returns quota info when available | Implemented |
| AUTOSAVE-U033 | checkStorageQuota emits warning when storage is low | Implemented |
| AUTOSAVE-U034 | checkStorageQuota does not emit warning when storage is ok | Implemented |

#### SnapshotManager.test.ts
| ID | Test Name | Status |
|----|-----------|--------|
| - | should reject invalid data types | Implemented |
| - | should reject missing metadata | Implemented |
| - | should reject missing state | Implemented |
| - | should reject invalid metadata fields | Implemented |
| - | should accept valid data | Implemented |
| - | should extract preview from state with no annotations | Implemented |
| - | should count annotations from paint frames | Implemented |
| - | should detect color grade from brightness | Implemented |
| - | should detect no color grade for default values | Implemented |
| - | should detect color grade from CDL slope | Implemented |
| - | should include source name in preview | Implemented |
| - | should reject invalid JSON | Implemented |
| - | should reject invalid snapshot format | Implemented |
| - | should reject newer version snapshots | Implemented |
| - | should measure size in bytes correctly | Implemented |
| - | should close database connection | Implemented |

#### Session.test.ts
| ID | Test Name | Status |
|----|-----------|--------|
| SES-001 | initializes with default values | Implemented |
| SES-002 | rounds fractional values | Implemented |
| SES-003 | emits frameChanged event | Implemented |
| SES-006 | clamps fps between 1 and 120 | Implemented |
| SES-007 | cycles through loop modes | Implemented |
| SES-008 | clamps volume between 0 and 1 | Implemented |
| SES-009 | toggleMute toggles muted state | Implemented |

#### PlaylistManager.test.ts
| ID | Test Name | Status |
|----|-----------|--------|
| - | should add a clip with correct properties | Implemented |
| - | should calculate globalStartFrame based on existing clips | Implemented |
| - | should emit clipsChanged event | Implemented |
| - | should remove a clip by ID | Implemented |
| - | should return false for non-existent clip | Implemented |
| - | should recalculate global frames after removal | Implemented |
| - | should move a clip to a new position | Implemented |
| - | should clamp new index to valid range | Implemented |
| - | should return correct clip and local frame | Implemented |
| - | should return null for frame outside playlist | Implemented |
| - | should advance within a clip | Implemented |
| - | should transition to next clip at boundary | Implemented |
| - | should loop single clip when loopMode is single | Implemented |
| - | should loop all clips when loopMode is all | Implemented |
| - | should emit playlistEnded when reaching end with no loop | Implemented |
| - | should go back within a clip | Implemented |
| - | should transition to previous clip at boundary | Implemented |
| - | should stay at frame 1 at beginning with no loop | Implemented |
| - | should loop to end when at frame 1 with loop all | Implemented |

## User Flow Verification

### Save Project Flow
1. User clicks Save button or presses Ctrl+S
2. `SessionSerializer.toJSON()` collects state from session, paintEngine, viewer
3. File downloads as `.orvproject` JSON
4. Blob URLs are handled with `requiresReload` flag

### Load Project Flow
1. User selects `.orvproject` file
2. `SessionSerializer.loadFromFile()` validates structure
3. `SessionSerializer.fromJSON()` restores state:
   - For `requiresReload` media, shows file reload dialog
   - Loads accessible media via `session.loadImage/loadVideo`
   - Restores playback state
   - Loads annotations into paint engine
   - Restores all viewer settings

### Auto-Save Recovery Flow
1. On app start, `AutoSaveManager.initialize()` checks for clean shutdown
2. If crash detected (no clean shutdown flag), emits `recoveryAvailable` event
3. UI can offer recovery from most recent auto-save
4. During normal operation, saves to IndexedDB on dirty state after debounce

### Snapshot Workflow
1. User opens Snapshot Panel
2. Creates manual snapshot with name/description
3. Auto-checkpoints created before major operations
4. User can browse, search, filter snapshots
5. Restore replaces current session state
6. Export creates portable JSON file
