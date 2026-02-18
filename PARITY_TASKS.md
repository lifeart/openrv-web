# OpenRV-Web Feature Parity — Implementation Tasks

> **Generated**: 2026-02-18 | **Revised**: 2026-02-18 (added .rv format compatibility)
> **Source**: `PARITY_PLAN.md` Revision 3
> **Method**: Code-level analysis of existing interfaces, types, patterns, and test conventions + OpenRV .rv/GTO format analysis

---

## RV Format Compatibility Requirements

All new features MUST serialize to/from the `.rv` (GTO) file format for interoperability with desktop OpenRV. The `.rv` file is a GTO text file with this hierarchy:

```
GTOa (3)
Object : Protocol (version) {
  component {
    type propertyName = value
  }
}
```

### Key GTO Conventions
- **Node naming**: `sourceGroup000000` (6-digit zero-padded), `sourceGroup000000_source`, `sourceGroup000000_RVColor`
- **Custom components**: New data (notes, versions, status) stored as custom components on `RVSession` or `RVSourceGroup` — OpenRV ignores unknown components gracefully
- **Property types**: `int`, `float`, `string`, `int[]`, `string[]`, `float[3]`, `float[2][]`
- **Round-trip preservation**: `SessionGTOExporter.updateGTOData()` deep-clones original GTO and updates known nodes in-place — unknown nodes survive automatically

### Critical Files for GTO Integration
| File | Role |
|------|------|
| `src/core/session/SessionGTOExporter.ts` | Main GTO writer — `buildSessionObject()` (line 1420), `buildSourceGroupObjects()` (line 505) |
| `src/core/session/SessionGTOStore.ts` | Updates existing GTO data in-place — `updateFromState()` (line 28) |
| `src/core/session/GTOGraphLoader.ts` | GTO reader — `loadGTOGraph()`, parses all node types (1599+ lines) |
| `src/core/session/GTOSettingsParser.ts` | Extracts typed settings from GTO properties (782 lines) |
| `src/core/session/serializers/PaintSerializer.ts` | Annotation read/write — `buildPaintObject()` (line 327) |
| `src/core/session/serializers/ColorSerializer.ts` | Color/CDL node serialization |

### Current Round-Trip Gaps (Properties Read But NOT Written Back)
| Property | Read Location | Impact | Fix Priority |
|----------|---------------|--------|-------------|
| `RVColor.color.hue` | GTOSettingsParser:283 | Hue rotation lost on re-save | P1 |
| `RVColor.color.invert` | GTOSettingsParser:274 | Color inversion lost | P1 |
| `RVLinearize.*` (logtype, sRGB2linear, fileGamma, cineon) | GTOSettingsParser:105-161 | Linearization settings lost | P1 |
| `RVDisplayColor.chromaticities.*` | GTOGraphLoader:1205-1254 | Display color space lost | P2 |
| `RVTransform2D.visibleBox`, `stencil` | GTOGraphLoader:729-776 | Crop box and masking lost | P2 |
| `RVSourceStereo.*` | GTOGraphLoader:1273-1298 | Per-source stereo lost | P2 |
| `RVOverlay.*` (rect, text, window) | GTOGraphLoader:1301-1442 | Overlay markers lost | P2 |
| `RVRetime.*` (warp, explicit) | GTOGraphLoader:1013-1067 | Time remapping lost | P2 |
| `RVSequence.edl.*` | GTOGraphLoader:1156-1190 | EDL cut data lost | P2 |
| Stack wipe/layer settings | GTOGraphLoader:1094-1152 | Compositing state lost | P2 |

---

## Table of Contents

- [Phase 1: Review Workflow Essentials (4-6 weeks)](#phase-1-review-workflow-essentials)
  - [T1.0 GTO Round-Trip Fixes](#t10-gto-round-trip-fixes-critical-for-rv-compatibility)
  - [T1.1 Note/Comment System](#t11-notecomment-system)
  - [T1.2 Version Management](#t12-version-management)
  - [T1.3 CDL CPU Clamp Bug Fix](#t13-cdl-cpu-clamp-bug-fix)
  - [T1.4 Shot Status Tracking](#t14-shot-status-tracking)
  - [T1.5 OCIO Display/View Menus](#t15-ocio-displayview-menus)
  - [T1.6 Frameburn Export Compositing](#t16-frameburn-export-compositing)
  - [T1.7 Shot-to-Shot Navigation](#t17-shot-to-shot-navigation)
  - [T1.8 EXR DWAB Compression](#t18-exr-dwab-compression)
  - [T1.9 Dailies Report Export](#t19-dailies-report-export)
  - [T1.10 Unified Preferences API](#t110-unified-preferences-api)
- [Phase 2: Professional Pipeline Integration (6-8 weeks)](#phase-2-professional-pipeline-integration)
  - [T2.1 Video Encode (WebCodecs)](#t21-video-encode-webcodecs)
  - [T2.2 OTIO Export](#t22-otio-export)
  - [T2.3 ShotGrid API Integration](#t23-shotgrid-api-integration)
  - [T2.4 Session URL Sharing](#t24-session-url-sharing)
  - [T2.5 Quad View Comparison](#t25-quad-view-comparison)
  - [T2.6 Shortcut Editor UI](#t26-shortcut-editor-ui)
  - [T2.7 OTIO Transitions + Multi-track](#t27-otio-transitions--multi-track)
  - [T2.8 Conform/Re-link UI](#t28-conformre-link-ui)
  - [T2.9 Slate/Leader for Export](#t29-slateleader-for-export)
  - [T2.10 Collaboration Enhancements](#t210-collaboration-enhancements)
  - [T2.11 Pressure Opacity/Saturation Mapping](#t211-pressure-opacitysaturation-mapping)
  - [T2.12 Stereo Convergence Tools](#t212-stereo-convergence-tools)
  - [T2.13 OCIO WASM Full Integration](#t213-ocio-wasm-full-integration)
- [Phase 3: Polish & Full Parity (4-6 weeks)](#phase-3-polish--full-parity)
  - [T3.1–T3.14 Summary Table](#phase-3-tasks-summary)

---

## Phase 1: Review Workflow Essentials

### T1.0 GTO Round-Trip Fixes (Critical for .rv Compatibility)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 2-3 days |
| **Dependencies** | None |
| **Blocks** | All other tasks (ensures .rv files don't lose data) |

#### Description

Fix properties that are **read from .rv files but NOT written back**, causing data loss on re-save. These are existing regressions in the GTO exporter that must be fixed before adding new features.

#### Files to Modify

| File | Changes |
|------|---------|
| `src/core/session/SessionGTOStore.ts` | Add missing property writes to `updateColorAdjustments()` and add `updateLinearize()` method |
| `src/core/session/SessionGTOExporter.ts` | Add missing node builders for linearize, display color |
| `src/core/session/serializers/ColorSerializer.ts` | Write hue, invert, unpremult properties |

#### Properties to Fix

**Priority 1 — Color properties (SessionGTOStore.updateColorAdjustments):**
```typescript
// Currently written (lines 88-104):
//   exposure, gamma, contrast, saturation, offset, scale, CDL

// MISSING — add these writes:
colorComp.float('hue', adjustments.hue);
colorComp.int('invert', adjustments.invert ? 1 : 0);
colorComp.int('unpremult', adjustments.unpremult ? 1 : 0);
```

**Priority 1 — Linearize settings (new method `updateLinearize()`):**
```typescript
updateLinearize(linearize: LinearizeState): void {
  const node = this.findNode('RVLinearize');
  if (!node) return;
  const colorComp = node.component('color');
  colorComp.int('logtype', linearize.logType);
  colorComp.int('sRGB2linear', linearize.sRGB2linear ? 1 : 0);
  colorComp.int('Rec709ToLinear', linearize.rec709ToLinear ? 1 : 0);
  colorComp.float('fileGamma', linearize.fileGamma);
  colorComp.int('alphaType', linearize.alphaType);
}
```

**Priority 2 — Additional missing writes (can be done incrementally):**
- `RVTransform2D.visibleBox` — crop/visible region
- `RVTransform2D.stencil` — masking parameters
- `RVDisplayColor.chromaticities` — display color primaries
- `RVSequence.edl` — cut list data (frame, source, in, out arrays)
- Stack composite/wipe settings

#### Tests

```
GTO-RT-001: hue value survives .rv round-trip (write → read → compare)
GTO-RT-002: invert flag survives .rv round-trip
GTO-RT-003: linearize.logtype survives .rv round-trip
GTO-RT-004: linearize.sRGB2linear survives .rv round-trip
GTO-RT-005: linearize.fileGamma survives .rv round-trip
GTO-RT-006: CDL.noClamp property written in GTO export
GTO-RT-007: unknown nodes still survive round-trip (regression test)
GTO-RT-008: existing tests still pass (no regression)
```

#### Acceptance Criteria

- [ ] All color adjustments (including hue, invert) survive .rv save/load
- [ ] Linearize settings survive .rv save/load
- [ ] CDL noClamp flag written to GTO
- [ ] No regression in existing GTO round-trip behavior
- [ ] Unknown/custom GTO nodes still preserved

---

### T1.1 Note/Comment System

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Effort** | 2 weeks |
| **Dependencies** | None |
| **Blocks** | T1.4 (Shot Status), T1.9 (Dailies Report) |

#### Description

Build a per-source, per-frame-range text note/comment system with threads, statuses, and export. This is the single most important feature for transforming the app from "viewer" into "review tool."

#### Data Model

```typescript
// New file: src/core/session/NoteManager.ts

interface Note {
  id: string;                            // crypto.randomUUID()
  sourceIndex: number;                   // Which media source (index into Session.sources[])
  frameStart: number;                    // Start frame (inclusive)
  frameEnd: number;                      // End frame (inclusive, same as start for single-frame notes)
  text: string;                          // Note body (plain text, may contain @mentions)
  author: string;                        // Display name (from PreferencesManager or NetworkSync userName)
  createdAt: string;                     // ISO 8601
  modifiedAt: string;                    // ISO 8601
  status: NoteStatus;                    // 'open' | 'resolved' | 'wontfix'
  parentId: string | null;              // null = top-level note, string = reply to another note
  color: string;                         // Hex color for frame indicator (default '#fbbf24')
}

type NoteStatus = 'open' | 'resolved' | 'wontfix';

interface NoteManagerEvents extends EventMap {
  noteAdded: { note: Note };
  noteUpdated: { note: Note };
  noteRemoved: { noteId: string };
  notesChanged: void;                    // Bulk change signal for UI re-render
}
```

#### Files to Create

| File | Purpose |
|------|---------|
| `src/core/session/NoteManager.ts` | Core note CRUD, queries, events. Extends `EventEmitter<NoteManagerEvents>`. Stores notes in `Map<string, Note>`. |
| `src/ui/components/NotePanel.ts` | Right-panel note list UI. Filterable by source/status/frame range. Inline editing. Reply threading. Follows `MarkerListPanel.ts` pattern (events: `visibilityChanged`, `noteSelected`). |
| `src/ui/components/NoteOverlay.ts` | Frame-range indicators on timeline showing where notes exist. Follows `TimecodeOverlay.ts` DOM pattern. Renders colored bars on timeline track. |
| `src/ui/components/NoteInput.ts` | Floating text input for creating notes (similar to `ViewerInputHandler.showTextInputOverlay()` pattern). Triggered by keyboard shortcut or toolbar button. |
| `test/core/session/NoteManager.test.ts` | Unit tests |
| `test/ui/components/NotePanel.test.ts` | UI tests |

#### Files to Modify

| File | Changes |
|------|---------|
| `src/core/session/SessionState.ts` | Add `notes?: NoteState[]` to `SessionState` interface (line ~122). Bump `SESSION_STATE_VERSION` to 2. Add migration function `migrateV1toV2()`. |
| `src/core/session/Session.ts` | Add `private _noteManager = new NoteManager()` (near line 210). Add `get noteManager()` accessor. Add `noteAdded`/`noteRemoved` to `SessionEvents`. |
| `src/core/session/SessionGTOExporter.ts` | In `buildSessionObject()` (line ~1420): add `notes` component with per-note properties. See GTO format below. |
| `src/core/session/GTOGraphLoader.ts` | In session parsing (line ~305): parse `notes` component from RVSession, extract note properties into `GTOParseResult.sessionInfo.notes`. |
| `src/AppControlRegistry.ts` | Add `notePanel: NotePanel` creation (near line 262). Add to right panel tab content. |
| `src/AppPlaybackWiring.ts` | Wire NotePanel `noteSelected` → `session.goToFrame()`. |
| `src/utils/input/KeyBindings.ts` | Add `notes.addNote` → `KeyN`, `notes.togglePanel` → `Shift+KeyN`. |
| `src/core/session/AutoSaveManager.ts` | `markDirty()` call chain must include notes in serialized `SessionState`. No code change needed if `SessionState` already flows through — just verify. |

#### GTO (.rv) Format — Notes Storage

Notes are stored as a custom `notes` component on the `RVSession` object. OpenRV will ignore this component gracefully (unknown components survive round-trip).

```gto
RVSession : rv (1)
{
    session { ... }
    root { ... }

    notes
    {
        int totalNotes = 2

        string note_001_id = "550e8400-e29b-41d4-a716-446655440000"
        int note_001_sourceIndex = 0
        int note_001_frameStart = 100
        int note_001_frameEnd = 150
        string note_001_text = "Fix the edge artifact on the left side"
        string note_001_author = "Alice"
        string note_001_createdAt = "2026-02-18T10:30:00Z"
        string note_001_modifiedAt = "2026-02-18T10:30:00Z"
        string note_001_status = "open"
        string note_001_parentId = ""
        string note_001_color = "#fbbf24"

        string note_002_id = "550e8400-e29b-41d4-a716-446655440001"
        int note_002_sourceIndex = 0
        int note_002_frameStart = 100
        int note_002_frameEnd = 100
        string note_002_text = "Agree, will fix in v3"
        string note_002_author = "Bob"
        string note_002_createdAt = "2026-02-18T11:00:00Z"
        string note_002_modifiedAt = "2026-02-18T11:00:00Z"
        string note_002_status = "open"
        string note_002_parentId = "550e8400-e29b-41d4-a716-446655440000"
        string note_002_color = "#fbbf24"
    }
}
```

**Serialization** (add to `SessionGTOExporter.buildSessionObject()`):
```typescript
const notes = session.noteManager.getNotes();
if (notes.length > 0) {
  const notesComp = sessionObject.component('notes');
  notesComp.int('totalNotes', notes.length);
  notes.forEach((note, idx) => {
    const p = `note_${String(idx + 1).padStart(3, '0')}`;
    notesComp.string(`${p}_id`, note.id);
    notesComp.int(`${p}_sourceIndex`, note.sourceIndex);
    notesComp.int(`${p}_frameStart`, note.frameStart);
    notesComp.int(`${p}_frameEnd`, note.frameEnd);
    notesComp.string(`${p}_text`, note.text);
    notesComp.string(`${p}_author`, note.author);
    notesComp.string(`${p}_createdAt`, note.createdAt);
    notesComp.string(`${p}_modifiedAt`, note.modifiedAt);
    notesComp.string(`${p}_status`, note.status);
    notesComp.string(`${p}_parentId`, note.parentId || '');
    notesComp.string(`${p}_color`, note.color);
  });
}
```

**Deserialization** (add to `GTOGraphLoader` session parsing):
```typescript
const notesComp = sessionObj.component('notes');
if (notesComp?.exists()) {
  const total = getNumberValue(notesComp.property('totalNotes').value()) ?? 0;
  const notes: NoteState[] = [];
  for (let i = 1; i <= total; i++) {
    const p = `note_${String(i).padStart(3, '0')}`;
    notes.push({
      id: getStringValue(notesComp.property(`${p}_id`).value()) ?? '',
      sourceIndex: getNumberValue(notesComp.property(`${p}_sourceIndex`).value()) ?? 0,
      frameStart: getNumberValue(notesComp.property(`${p}_frameStart`).value()) ?? 0,
      frameEnd: getNumberValue(notesComp.property(`${p}_frameEnd`).value()) ?? 0,
      text: getStringValue(notesComp.property(`${p}_text`).value()) ?? '',
      author: getStringValue(notesComp.property(`${p}_author`).value()) ?? '',
      createdAt: getStringValue(notesComp.property(`${p}_createdAt`).value()) ?? '',
      modifiedAt: getStringValue(notesComp.property(`${p}_modifiedAt`).value()) ?? '',
      status: getStringValue(notesComp.property(`${p}_status`).value()) as NoteStatus ?? 'open',
      parentId: getStringValue(notesComp.property(`${p}_parentId`).value()) || null,
      color: getStringValue(notesComp.property(`${p}_color`).value()) ?? '#fbbf24',
    });
  }
  sessionInfo.notes = notes;
}
```

#### Algorithm Details

**NoteManager core logic:**
```
addNote(sourceIndex, frameStart, frameEnd, text, author):
  1. Create Note with crypto.randomUUID(), timestamps, status='open'
  2. Store in internal Map<id, Note>
  3. Emit 'noteAdded'
  4. Return note

getNotesForFrame(sourceIndex, frame):
  1. Filter notes where sourceIndex matches AND frame >= frameStart AND frame <= frameEnd
  2. Sort by createdAt ascending
  3. Return flat list (top-level + replies interleaved by parentId)

getNotesForSource(sourceIndex):
  1. Filter notes where sourceIndex matches
  2. Group by parentId (top-level first, then replies)
  3. Return array

resolveNote(noteId):
  1. Find note, set status = 'resolved', update modifiedAt
  2. Emit 'noteUpdated'

toSerializable(): NoteState[]
  1. Convert Map values to plain array
  2. Strip any transient fields

fromSerializable(notes: NoteState[]):
  1. Clear existing Map
  2. Populate from array
  3. Emit 'notesChanged'
```

**SessionState v2 migration:**
```
migrateV1toV2(state):
  1. If state.version === 1:
     state.notes = []
     state.version = 2
  2. Return state
```

#### Tests

```
NoteManager.test.ts:
  NOTE-001: addNote() creates note with correct fields and UUID
  NOTE-002: addNote() emits 'noteAdded' event with note payload
  NOTE-003: getNotesForFrame() returns notes overlapping given frame
  NOTE-004: getNotesForFrame() excludes notes for different sourceIndex
  NOTE-005: getNotesForSource() returns all notes for source
  NOTE-006: updateNote() changes text and modifiedAt
  NOTE-007: resolveNote() sets status to 'resolved'
  NOTE-008: removeNote() deletes note and emits 'noteRemoved'
  NOTE-009: removeNote() cascades to replies (removes children)
  NOTE-010: addNote() with parentId creates threaded reply
  NOTE-011: getThreadedNotes() returns tree structure (parent + children)
  NOTE-012: toSerializable() produces JSON-safe array
  NOTE-013: fromSerializable() restores notes from array
  NOTE-014: fromSerializable() emits 'notesChanged'
  NOTE-015: notes survive SessionState round-trip (serialize → deserialize)
  NOTE-016: notes survive GTO round-trip (export .rv → load .rv)
  NOTE-017: GTO notes component uses correct property naming (note_001_*)
  NOTE-018: notes loaded from .rv file populate NoteManager
  NOTE-019: reply threading preserved through GTO round-trip (parentId)

NotePanel.test.ts:
  NOTE-U001: renders empty state message when no notes
  NOTE-U002: renders note list with author, text, timestamp
  NOTE-U003: clicking note emits 'noteSelected' with frame
  NOTE-U004: filter by status shows only matching notes
  NOTE-U005: inline edit updates note text
  NOTE-U006: resolve button calls noteManager.resolveNote()
  NOTE-U007: reply button opens reply input
  NOTE-U008: dispose() cleans up event listeners

SessionState migration:
  MIGRATE-001: v1 state migrates to v2 with empty notes array
  MIGRATE-002: v2 state passes through unchanged
  MIGRATE-003: AutoSaveManager saves/loads notes correctly
```

#### Acceptance Criteria

- [ ] User can press `N` to open note input at current frame
- [ ] Notes appear as colored bars on timeline at their frame range
- [ ] Note panel shows threaded notes filterable by status (open/resolved/all)
- [ ] Notes persist across browser refresh (via AutoSave/SessionState)
- [ ] Notes serialize into .orvproject files
- [ ] 100+ notes on a 40-shot playlist renders without lag

---

### T1.2 Version Management

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Effort** | 1.5 weeks |
| **Dependencies** | None |
| **Blocks** | T1.9 (Dailies Report) |

#### Description

Add a "version" concept — associate multiple media files as versions of the same shot. Navigate between versions. Carry annotations forward.

#### Data Model

```typescript
// New file: src/core/session/VersionManager.ts

interface VersionGroup {
  id: string;                            // crypto.randomUUID()
  shotName: string;                      // e.g., 'ABC_0010'
  versions: VersionEntry[];              // Ordered by versionNumber ascending
  activeVersionIndex: number;            // Currently displayed version
}

interface VersionEntry {
  versionNumber: number;                 // 1, 2, 3...
  sourceIndex: number;                   // Index into Session.sources[]
  label: string;                         // e.g., 'v3 - artist_name - 2026-02-15'
  addedAt: string;                       // ISO 8601
  metadata?: Record<string, string>;     // Arbitrary key-value (artist, date, description)
}

interface VersionManagerEvents extends EventMap {
  groupAdded: { group: VersionGroup };
  groupRemoved: { groupId: string };
  activeVersionChanged: { groupId: string; versionEntry: VersionEntry };
  versionsChanged: void;
}
```

#### Files to Create

| File | Purpose |
|------|---------|
| `src/core/session/VersionManager.ts` | Core version group CRUD, navigation. Extends `EventEmitter<VersionManagerEvents>`. |
| `src/ui/components/VersionNavigator.ts` | UI widget showing version list for current shot. Version number badges. Click to switch. Arrow keys to cycle. Follows `ChannelSelect.ts` dropdown pattern. |
| `test/core/session/VersionManager.test.ts` | Unit tests |
| `test/ui/components/VersionNavigator.test.ts` | UI tests |

#### Files to Modify

| File | Changes |
|------|---------|
| `src/core/session/SessionState.ts` | Add `versionGroups?: VersionGroupState[]` to `SessionState`. Include in v2 migration. |
| `src/core/session/Session.ts` | Add `private _versionManager = new VersionManager()` (near line 210). Add `get versionManager()`. Wire `activeVersionChanged` → source switch. |
| `src/core/session/PlaylistManager.ts` | Add `getClipForSource(sourceIndex): PlaylistClip | null` helper for version → clip lookup. |
| `src/AppControlRegistry.ts` | Add `versionNavigator: VersionNavigator`. Place in header bar or right panel. |
| `src/utils/input/KeyBindings.ts` | Add `version.next` → `BracketRight` (]) , `version.previous` → `BracketLeft` ([). |
| `src/core/session/SessionGTOExporter.ts` | In `buildSessionObject()`: add `versions` component with group/version properties. |
| `src/core/session/GTOGraphLoader.ts` | Parse `versions` component from RVSession into `GTOParseResult.sessionInfo.versionGroups`. |

#### GTO (.rv) Format — Version Storage

Version groups stored as custom `versions` component on RVSession. Maps to OpenRV's `RVSwitchGroup` concept (multiple sources as versions of same shot).

```gto
RVSession : rv (1)
{
    session { ... }

    versions
    {
        int groupCount = 1

        string group_000_id = "uuid-for-group"
        string group_000_shotName = "ABC_0010"
        int group_000_activeVersionIndex = 2
        int group_000_versionCount = 3

        int group_000_v001_versionNumber = 1
        int group_000_v001_sourceIndex = 0
        string group_000_v001_label = "v1 - Initial comp"
        string group_000_v001_addedAt = "2026-02-10T09:00:00Z"

        int group_000_v002_versionNumber = 2
        int group_000_v002_sourceIndex = 1
        string group_000_v002_label = "v2 - Revised colors"
        string group_000_v002_addedAt = "2026-02-12T14:30:00Z"

        int group_000_v003_versionNumber = 3
        int group_000_v003_sourceIndex = 2
        string group_000_v003_label = "v3 - Final"
        string group_000_v003_addedAt = "2026-02-15T10:00:00Z"
    }
}
```

**Note**: In native OpenRV, versions use `RVSwitchGroup` nodes in the graph topology. openrv-web's approach stores version metadata declaratively rather than as graph topology — simpler and forward-compatible. When loading native OpenRV files with `RVSwitchGroup`, detect the pattern and create VersionGroups accordingly.

#### Algorithm Details

**Version grouping strategy:**
```
createGroup(shotName, sourceIndices[]):
  1. Create VersionGroup with UUID
  2. For each sourceIndex, create VersionEntry with auto-numbered version (1, 2, 3...)
  3. Label derived from source name or user-provided
  4. activeVersionIndex = last (most recent)
  5. Emit 'groupAdded'

autoDetectGroups(sources: MediaSource[]):
  1. Parse shot names from filenames: extract base name minus version suffix
     Patterns: "shot_v001.exr" → "shot", "ABC_0010_v3.mov" → "ABC_0010"
     Regex: /^(.+?)_?v?(\d+)\.\w+$/i
  2. Group sources with same base name
  3. Sort within group by version number
  4. Create VersionGroup for each group with 2+ sources

nextVersion(groupId):
  1. Find group, increment activeVersionIndex (wrap or clamp)
  2. Get new VersionEntry.sourceIndex
  3. Call session.setCurrentSource(sourceIndex)
  4. Emit 'activeVersionChanged'

carryAnnotationsForward(fromVersionEntry, toVersionEntry):
  1. Get annotations from NoteManager for fromVersionEntry.sourceIndex
  2. Clone notes with new sourceIndex = toVersionEntry.sourceIndex
  3. Mark cloned notes as "carried from v{N}"
  4. Add to NoteManager
```

**Shot name parsing regex:**
```typescript
const VERSION_PATTERN = /^(.+?)[\._-]?v?(\d{1,4})(?:\.\w+)?$/i;
// Matches: "shot_v001.exr", "ABC-0010_v3.mov", "comp.v12.exr", "plate_002.dpx"
```

#### Tests

```
VersionManager.test.ts:
  VER-001: createGroup() creates group with correct entries
  VER-002: createGroup() emits 'groupAdded'
  VER-003: autoDetectGroups() groups sources by shot name
  VER-004: autoDetectGroups() handles various naming conventions
  VER-005: autoDetectGroups() skips ungrouped single sources
  VER-006: nextVersion() advances activeVersionIndex and emits event
  VER-007: previousVersion() decrements activeVersionIndex
  VER-008: nextVersion() wraps around at end
  VER-009: addVersionToGroup() appends and auto-numbers
  VER-010: removeVersionFromGroup() updates indices correctly
  VER-011: getGroupForSource() returns correct group
  VER-012: toSerializable()/fromSerializable() round-trips correctly
  VER-013: carryAnnotationsForward() clones notes to new sourceIndex
  VER-014: version groups survive GTO round-trip (export .rv → load .rv)
  VER-015: GTO versions component uses correct property naming (group_NNN_vMMM_*)
  VER-016: loading .rv with RVSwitchGroup creates VersionGroups

VersionNavigator.test.ts:
  VER-U001: renders version badges for active group
  VER-U002: clicking badge switches active version
  VER-U003: shows "no versions" when single source
  VER-U004: keyboard ] advances version, [ goes back
  VER-U005: displays version label and metadata
  VER-U006: dispose() cleans up listeners
```

#### Acceptance Criteria

- [ ] Loading multiple versions of the same shot auto-groups them
- [ ] Version navigator shows v1/v2/v3 badges with click-to-switch
- [ ] `[` and `]` keys cycle through versions of current shot
- [ ] Version groups persist in .orvproject files
- [ ] "Carry annotations forward" copies notes from previous version

---

### T1.3 CDL CPU Clamp Bug Fix

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 1-2 days |
| **Dependencies** | None |
| **Blocks** | None |

#### Description

Fix the CPU-side CDL implementation that incorrectly clamps to [0,1] before the power operation, destroying HDR super-whites. The GPU shader path is already correct. Also fix the saturation `applySaturation()` clamping.

#### Files to Modify

| File | Line | Change |
|------|------|--------|
| `src/color/CDL.ts` | 64 | Already fixed to `Math.max(v, 0)` — **verify this is the current state** |
| `src/color/CDL.ts` | 72 | Already uses `Math.max(v, 0)` — **verify** |
| `src/color/CDL.ts` | 97-99 | `applySaturation()`: Change per-channel clamping from hard clamp to `Math.max(0, val)` to preserve HDR headroom |
| `src/core/session/serializers/ColorSerializer.ts` | CDL section | Ensure `CDL.noClamp` property is written (maps to OpenRV's `RVColor.CDL.noClamp`) |

#### GTO (.rv) Format — CDL Properties

OpenRV stores CDL in `RVColor` nodes. The `noClamp` property controls whether clamping is applied:

```gto
RVColor : sourceGroup000000_RVColor (1)
{
    CDL
    {
        int active = 1
        string colorspace = "rec709"
        float[3] slope = [1.0, 1.0, 1.0]
        float[3] offset = [0.0, 0.0, 0.0]
        float[3] power = [1.0, 1.0, 1.0]
        float saturation = 1.0
        int noClamp = 1                    // 1 = HDR-safe (no [0,1] clamp)
    }
}
```

**Verify**: `SessionGTOStore.updateCDL()` (line ~106-115) writes slope/offset/power/saturation but must also write `noClamp = 1` to preserve HDR behavior when the file is reopened in OpenRV.

#### Algorithm Details

**Current (buggy) applySaturation (lines 82-101):**
```typescript
applySaturation(r, g, b, saturation) {
  const luma = r * LUMA_R + g * LUMA_G + b * LUMA_B;
  r = luma + (r - luma) * saturation;
  g = luma + (g - luma) * saturation;
  b = luma + (b - luma) * saturation;
  // BUG: These clamp to [0, 255] range — incorrect for float/HDR data
  r = Math.max(0, Math.min(255, r));  // line 97
  g = Math.max(0, Math.min(255, g));  // line 98
  b = Math.max(0, Math.min(255, b));  // line 99
  return { r, g, b };
}
```

**Fixed applySaturation:**
```typescript
applySaturation(r, g, b, saturation) {
  const luma = r * LUMA_R + g * LUMA_G + b * LUMA_B;
  r = luma + (r - luma) * saturation;
  g = luma + (g - luma) * saturation;
  b = luma + (b - luma) * saturation;
  // Only clamp negatives, preserve HDR headroom (values > 1.0)
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  return { r, g, b };
}
```

**Verification — GPU shader is correct (viewer.frag.glsl line 1054):**
```glsl
color.rgb = pow(max(color.rgb * u_cdlSlope + u_cdlOffset, vec3(0.0)), u_cdlPower);
// Uses max(…, 0.0) = clamp to [0, ∞) — correct per ASC CDL spec
```

#### Tests

```
CDL.test.ts (existing file — add/modify tests):
  CDL-HDR-001: applyCDL() preserves values > 1.0 (HDR super-whites)
  CDL-HDR-002: applyCDL() with slope=2.0 on input 0.8 produces 1.6 (not clamped to 1.0)
  CDL-HDR-003: applyCDL() with negative after SOP is clamped to 0 (not NaN from pow)
  CDL-HDR-004: applySaturation() preserves values > 1.0
  CDL-HDR-005: applySaturation() does NOT clamp to 255
  CDL-HDR-006: applySaturation() clamps negatives to 0
  CDL-HDR-007: CPU CDL matches GPU CDL for standard range [0,1] inputs
  CDL-HDR-008: CPU CDL matches GPU CDL for HDR inputs [0, 4.0]
  CDL-ROUND-001: exportCDLXML() → parseCDLXML() round-trip preserves values
```

#### Acceptance Criteria

- [ ] `applyCDL()` with slope=2.0, input=0.8 returns ~1.6 (not 1.0)
- [ ] `applySaturation()` with input=2.0 returns >=1.0 (not clamped to 255)
- [ ] CPU path and GPU path produce matching results for HDR test vectors
- [ ] All existing CDL tests still pass

---

### T1.4 Shot Status Tracking

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 1 week |
| **Dependencies** | T1.1 (Note/Comment System) |
| **Blocks** | T1.9 (Dailies Report) |

#### Description

Add per-shot status tracking (approved / needs-work / CBB / pending). Status shows in playlist panel, can be set via keyboard shortcuts, and exports in reports.

#### Data Model

```typescript
// New file: src/core/session/StatusManager.ts

type ShotStatus = 'pending' | 'approved' | 'needs-work' | 'cbb' | 'omit';

interface StatusEntry {
  sourceIndex: number;
  status: ShotStatus;
  setBy: string;                         // Author
  setAt: string;                         // ISO 8601
}

interface StatusManagerEvents extends EventMap {
  statusChanged: { sourceIndex: number; status: ShotStatus; previous: ShotStatus };
  statusesChanged: void;
}

const STATUS_COLORS: Record<ShotStatus, string> = {
  pending: '#94a3b8',    // slate-400
  approved: '#22c55e',   // green-500
  'needs-work': '#f97316', // orange-500
  cbb: '#eab308',        // yellow-500
  omit: '#ef4444',       // red-500
};

const STATUS_SHORTCUTS: Record<string, ShotStatus> = {
  '1': 'approved',
  '2': 'needs-work',
  '3': 'cbb',
  '4': 'omit',
  '0': 'pending',
};
```

#### Files to Create

| File | Purpose |
|------|---------|
| `src/core/session/StatusManager.ts` | Status CRUD, per-source status Map, events. |
| `src/ui/components/StatusBadge.ts` | Small colored badge component (reusable). |
| `test/core/session/StatusManager.test.ts` | Unit tests |

#### Files to Modify

| File | Changes |
|------|---------|
| `src/core/session/SessionState.ts` | Add `statuses?: StatusEntry[]` to `SessionState` (in v2 migration). |
| `src/core/session/Session.ts` | Add `private _statusManager = new StatusManager()`. Add `get statusManager()`. |
| `src/ui/components/PlaylistPanel.ts` | Add `StatusBadge` to each clip row (after clip name, before duration). Update on `statusChanged`. |
| `src/utils/input/KeyBindings.ts` | Add `status.approved` → `Numpad1` or `Alt+Digit1`, `status.needsWork` → `Alt+Digit2`, `status.cbb` → `Alt+Digit3`, `status.omit` → `Alt+Digit4`, `status.pending` → `Alt+Digit0`. |
| `src/AppControlRegistry.ts` | Create `StatusManager` instance, pass to `PlaylistPanel`. |
| `src/core/session/SessionGTOExporter.ts` | In `buildSourceGroupObjects()` (line ~505): add `review` component per source group with status properties. |
| `src/core/session/GTOGraphLoader.ts` | Parse `review` component from each `RVSourceGroup` into status data. |

#### GTO (.rv) Format — Status Storage

Status stored per-source as a custom `review` component on `RVSourceGroup` (maps to ShotGrid review workflow):

```gto
RVSourceGroup : sourceGroup000000 (1)
{
    ui
    {
        string name = "ABC_0010"
    }

    review
    {
        string status = "approved"
        string statusColor = "#22c55e"
        string setBy = "Supervisor Name"
        string setAt = "2026-02-18T16:45:00Z"
    }
}
```

#### Algorithm Details

```
setStatus(sourceIndex, status, author):
  1. Get previous status (or 'pending' if not set)
  2. Store in Map<number, StatusEntry>
  3. Emit 'statusChanged' with { sourceIndex, status, previous }

getStatus(sourceIndex): ShotStatus
  1. Return entry?.status ?? 'pending'

getStatusCounts(): Record<ShotStatus, number>
  1. Count entries by status
  2. Include 'pending' count = totalSources - explicitlySetCount

toSerializable(): StatusEntry[]
fromSerializable(entries: StatusEntry[]): void
```

#### Tests

```
StatusManager.test.ts:
  STATUS-001: setStatus() stores status for sourceIndex
  STATUS-002: setStatus() emits 'statusChanged' with previous status
  STATUS-003: getStatus() returns 'pending' for unset sources
  STATUS-004: getStatusCounts() returns correct counts
  STATUS-005: toSerializable()/fromSerializable() round-trips
  STATUS-006: setStatus() overwrites previous status
  STATUS-007: clearStatus() resets to 'pending'
  STATUS-008: multiple sources can have independent statuses
  STATUS-009: statuses survive GTO round-trip (export .rv → load .rv)
  STATUS-010: GTO review component uses correct property naming per source group

PlaylistPanel integration:
  STATUS-U001: clip rows show colored status badge
  STATUS-U002: status badge updates when statusChanged fires
  STATUS-U003: keyboard shortcut Alt+1 sets current clip to 'approved'
```

#### Acceptance Criteria

- [ ] Each shot in playlist panel shows a colored status badge
- [ ] Alt+1/2/3/4/0 sets status for current shot
- [ ] Status persists across browser refresh
- [ ] Status counts visible in panel header ("8 approved, 4 needs-work, 8 pending")
- [ ] Status exports in dailies report (T1.9)

---

### T1.5 OCIO Display/View Menus

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 1 week |
| **Dependencies** | None |
| **Blocks** | None |

#### Description

Add functional display/view dropdown menus populated from OCIO config, using the existing baked LUT approach with 65^3 resolution for ACES transforms.

#### Files to Modify

| File | Changes |
|------|---------|
| `src/color/OCIOProcessor.ts` | Change default LUT size from 33 to 65 in `bakeTo3DLUT()` (line ~597). Add `getDisplayViewPairs(): Array<{display, view}>` method. |
| `src/color/OCIOTransform.ts` | Add `getAvailableDisplays()` and `getViewsForDisplay()` static methods that return the display/view pairs from the hardcoded transform chain (lines 864-1257). |
| `src/ui/components/OCIOControl.ts` | Wire display/view dropdowns to actually call `setDisplay()`/`setView()` and trigger LUT rebake. Currently dropdowns exist but may not rebake correctly. Verify end-to-end flow. |
| `src/render/Renderer.ts` | Verify `setLUT()` method (line ~1642) accepts 65^3 LUT data. Current `ensureLUT3DTexture()` should handle variable sizes — verify `TEXTURE_3D` upload works for 65^3. |
| `src/core/session/SessionGTOExporter.ts` | Write `RVOCIO` node with `ocio_display.display`, `ocio_display.view`, `ocio_color.inColorSpace` properties. |
| `src/core/session/GTOGraphLoader.ts` | Already parses RVOCIO (line ~1541-1598). Ensure parsed display/view values flow to OCIOProcessor. |

#### GTO (.rv) Format — OCIO Storage

OpenRV stores OCIO state in an `RVOCIO` node. openrv-web currently parses this but does NOT write it back — this task must fix that.

```gto
RVOCIO : display_ocio (1)
{
    ocio
    {
        int active = 1
        string function = "displayTransform"
        string inColorSpace = "ACES - ACEScg"
        int lut3DSize = 65
    }

    ocio_display
    {
        string display = "sRGB"
        string view = "ACES 1.0 - SDR Video"
    }

    ocio_color
    {
        string outColorSpace = "Output - sRGB"
    }

    ocio_look
    {
        string look = "None"
        string direction = "forward"
    }
}
```

**Property Paths**:
- `display_ocio.ocio.active` → OCIO enabled
- `display_ocio.ocio.function` → 'displayTransform' | 'colorTransform' | 'look'
- `display_ocio.ocio_display.display` → selected display device
- `display_ocio.ocio_display.view` → selected view transform
- `display_ocio.ocio_color.inColorSpace` → input working space
- `display_ocio.ocio_look.look` → selected look name
- `display_ocio.ocio_look.direction` → 'forward' | 'inverse'

#### Algorithm Details

**Display/View enumeration from transform chains:**
```
getAvailableDisplays():
  Extract unique display names from OCIOTransform.createDisplayTransform() coverage:
  - 'sRGB' (maps to sRGB gamma encode)
  - 'Rec.709' (maps to Rec.709 transfer)
  - 'Display P3' (maps to P3 gamut + sRGB gamma)
  - 'Rec.2020' (maps to BT.2020 gamut)
  - 'ACES' (maps to ACES output)

getViewsForDisplay(display):
  For each display, return available views:
  - sRGB: ['Raw', 'Log', 'ACES Tone Map', 'Filmic']
  - Rec.709: ['Raw', 'ACES Tone Map']
  - etc.
```

**LUT rebake flow on display/view change:**
```
1. User selects new display/view in OCIOControl dropdown
2. OCIOControl calls ocioProcessor.setDisplay(display) + setView(view)
3. OCIOProcessor.setState() marks lutDirty = true
4. OCIOProcessor.bakeTo3DLUT(65) generates new Float32Array[65³ × 3]
5. Viewer calls renderer.setLUT(lutData, 65, intensity)
6. Renderer uploads 65³ texture to TEXTURE_3D
7. Shader samples u_lut3D with trilinear interpolation
```

**65^3 memory analysis:**
```
65 × 65 × 65 × 3 × 4 bytes = 3,290,625 bytes ≈ 3.3 MB (Float32 RGB)
65 × 65 × 65 × 4 × 4 bytes = 4,387,500 bytes ≈ 4.4 MB (Float32 RGBA, GPU upload)
Acceptable for modern browsers.
```

#### Tests

```
OCIOProcessor.test.ts:
  OCIO-LUT-001: bakeTo3DLUT(65) returns LUT3D with size=65 and data.length=65³×3
  OCIO-LUT-002: bakeTo3DLUT() with ACES transform produces different values than identity
  OCIO-LUT-003: changing display/view marks LUT dirty
  OCIO-LUT-004: getDisplayViewPairs() returns non-empty list for each config
  OCIO-LUT-005: setDisplay() updates available views list

Renderer.test.ts:
  RENDER-LUT-001: setLUT() with 65³ data uploads correctly
  RENDER-LUT-002: ensureLUT3DTexture() creates RGBA texture from RGB input
  RENDER-LUT-003: LUT shader sampling produces expected output for known input
```

#### Acceptance Criteria

- [ ] Display dropdown shows available displays (sRGB, Rec.709, Display P3, etc.)
- [ ] View dropdown updates when display changes
- [ ] Selecting display/view triggers LUT rebake and visible image change
- [ ] ACES transforms use 65^3 LUT (not 33^3)
- [ ] LUT rebake completes in <500ms for 65^3

---

### T1.6 Frameburn Export Compositing

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 3-5 days |
| **Dependencies** | None |
| **Blocks** | T2.1 (Video Encode) |

#### Description

Composite text overlays (timecode, frame number, shot name, custom fields) onto exported frames. Display-time overlay already exists via `TimecodeOverlay.ts`. This task adds export-time compositing onto the pixel buffer.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/export/FrameburnCompositor.ts` | Renders text overlays onto a canvas context for export. Configurable fields, positions, fonts. |
| `test/export/FrameburnCompositor.test.ts` | Unit tests |

#### Data Model

```typescript
// In FrameburnCompositor.ts

interface FrameburnConfig {
  enabled: boolean;
  fields: FrameburnField[];
  font: string;                          // e.g., 'monospace'
  fontSize: number;                      // pixels
  fontColor: string;                     // hex
  backgroundColor: string;              // hex with alpha
  backgroundPadding: number;            // pixels
  position: 'top-left' | 'top-center' | 'top-right' |
            'bottom-left' | 'bottom-center' | 'bottom-right';
}

interface FrameburnField {
  type: 'timecode' | 'frame' | 'shotName' | 'date' | 'custom' | 'resolution' |
        'fps' | 'colorspace' | 'codec';
  label?: string;                        // Custom label prefix
  value?: string;                        // For 'custom' type
}

interface FrameburnContext {
  currentFrame: number;
  totalFrames: number;
  fps: number;
  shotName: string;
  width: number;
  height: number;
  colorSpace?: string;
  date?: string;
}
```

#### Algorithm Details

```
compositeFrameburn(ctx: CanvasRenderingContext2D, config, context):
  1. Build text lines from config.fields:
     - 'timecode' → formatTimecode(context.currentFrame, context.fps)
       (reuse frameToTimecode() from TimecodeDisplay module)
     - 'frame' → `${context.currentFrame} / ${context.totalFrames}`
     - 'shotName' → context.shotName
     - 'date' → new Date().toISOString().split('T')[0]
     - 'resolution' → `${context.width}x${context.height}`
     - 'custom' → field.value
  2. Measure text dimensions using ctx.measureText()
  3. Calculate position based on config.position + padding
  4. Draw background rectangle with backgroundColor
  5. Draw text with fontColor
  6. Restore ctx state (save/restore pattern)
```

**Integration with frame export:**
```
In ExportControl or FrameExporter:
  1. Render frame to offscreen canvas (existing flow)
  2. If frameburn enabled:
     a. Create 2D context on top of rendered frame
     b. Call compositeFrameburn(ctx, config, frameContext)
  3. Export composited canvas to blob/dataURL
```

#### Files to Modify

| File | Changes |
|------|---------|
| `src/ui/components/ExportControl.ts` | Add frameburn toggle + config UI. Pass `FrameburnConfig` in export events. |
| `src/ui/components/TimecodeOverlay.ts` | Extract `frameToTimecode()` logic into shared utility if not already shared. |

#### Tests

```
FrameburnCompositor.test.ts:
  BURN-001: compositeFrameburn() renders timecode text on canvas
  BURN-002: compositeFrameburn() positions text correctly for each position option
  BURN-003: compositeFrameburn() renders multiple fields as separate lines
  BURN-004: compositeFrameburn() draws background rectangle behind text
  BURN-005: compositeFrameburn() handles missing optional fields gracefully
  BURN-006: buildTextLines() formats each field type correctly
  BURN-007: custom field type uses provided label and value
```

#### Acceptance Criteria

- [ ] Exported PNG/JPEG includes burned-in timecode overlay
- [ ] Configurable: position, font size, which fields to include
- [ ] Timecode format matches display overlay (SMPTE HH:MM:SS:FF)
- [ ] Background provides readability over any image content
- [ ] Compositing adds <10ms per frame

---

### T1.7 Shot-to-Shot Navigation

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 2-3 days |
| **Dependencies** | None |
| **Blocks** | None |

#### Description

Add keyboard shortcuts for jumping between clips in a playlist (shot-to-shot), distinct from frame-by-frame stepping. VFX supervisors reviewing 40 shots need PageUp/PageDown to jump between shots.

#### Files to Modify

| File | Changes |
|------|---------|
| `src/core/session/PlaylistManager.ts` | Add `goToNextClip(currentGlobalFrame): { frame: number; clip: PlaylistClip } | null` and `goToPreviousClip(currentGlobalFrame): { frame: number; clip: PlaylistClip } | null` methods. |
| `src/utils/input/KeyBindings.ts` | Add `playlist.nextClip` → `PageDown`, `playlist.previousClip` → `PageUp`. |
| `src/AppKeyboardHandler.ts` | Wire PageUp/PageDown to `playlistManager.goToNextClip()`/`goToPreviousClip()`. |
| `src/ui/components/PlaylistPanel.ts` | Highlight current clip row. Auto-scroll to keep active clip visible. |

#### Algorithm Details

```
goToNextClip(currentGlobalFrame):
  1. Get current clip via getClipAtFrame(currentGlobalFrame)
  2. If current clip exists:
     a. Find index of current clip in clips array
     b. If index < clips.length - 1:
        Return { frame: clips[index + 1].globalStartFrame, clip: clips[index + 1] }
     c. If loop mode is 'all':
        Return { frame: clips[0].globalStartFrame, clip: clips[0] }
  3. Return null (no next clip)

goToPreviousClip(currentGlobalFrame):
  1. Get current clip via getClipAtFrame(currentGlobalFrame)
  2. If current clip exists:
     a. Find index of current clip
     b. If currentGlobalFrame > clip.globalStartFrame + 1:
        // Already partway through clip — go to start of current clip
        Return { frame: clip.globalStartFrame, clip }
     c. If index > 0:
        Return { frame: clips[index - 1].globalStartFrame, clip: clips[index - 1] }
     d. If loop mode is 'all':
        Return { frame: clips[clips.length - 1].globalStartFrame, clip: clips.last }
  3. Return null
```

#### Tests

```
PlaylistManager.test.ts (add to existing):
  NAV-001: goToNextClip() returns next clip start frame
  NAV-002: goToNextClip() wraps to first clip when loopMode='all'
  NAV-003: goToNextClip() returns null at end when loopMode='none'
  NAV-004: goToPreviousClip() returns current clip start when mid-clip
  NAV-005: goToPreviousClip() returns previous clip when at start of clip
  NAV-006: goToPreviousClip() wraps to last clip when loopMode='all'
  NAV-007: goToNextClip() works with single clip (no-op or wrap)
  NAV-008: goToNextClip() works with empty playlist (returns null)
```

#### Acceptance Criteria

- [ ] PageDown jumps to start of next shot in playlist
- [ ] PageUp jumps to start of current shot (if mid-shot) or previous shot
- [ ] Current clip highlighted in PlaylistPanel
- [ ] Works with all loop modes (none, single, all)

---

### T1.8 EXR DWAB Compression

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 1 week |
| **Dependencies** | None |
| **Blocks** | None |

#### Description

Add DWAB (DWA adaptive block) decompression support to the EXR decoder. DWAB is a lossy wavelet-based compression used by ILM, Weta, and major studios for cached renders and plate delivery (10-20x compression ratios).

#### Algorithm Details

**DWAB compression format:**
```
DWAB block structure:
  1. Read block header: uncompressed size, compressed size
  2. Read Huffman-encoded data block
  3. Decompress via:
     a. Huffman decode → run-length packed data
     b. Un-zigzag reorder (DCT coefficient ordering)
     c. Inverse DCT (8x8 blocks for half-float channels)
     d. Dequantize based on compression level
     e. Convert from half-float to target format
```

**Implementation approach options:**

**Option A: WASM blosc/dwa decoder (recommended)**
```
1. Compile OpenEXR's DwaCompressor to WASM via Emscripten
2. Export: decompressDWAB(compressedData: Uint8Array, outputSize: number): Uint8Array
3. Load WASM module lazily on first DWAB EXR file
4. ~200KB WASM binary (blosc + DWA subset)
```

**Option B: Pure JS port**
```
1. Port DwaCompressor.cpp from OpenEXR to TypeScript
2. Key functions: Classifier, DctCoderCompressor, HufCompress/Decompress
3. ~1000-2000 lines of TS
4. Slower but no WASM dependency
```

#### Files to Create

| File | Purpose |
|------|---------|
| `src/formats/exr/DWABDecoder.ts` | DWAB decompression implementation (WASM wrapper or pure JS). |
| `src/formats/exr/dwab.wasm` | (If WASM approach) Compiled DWA decompressor. |
| `test/formats/exr/DWABDecoder.test.ts` | Unit tests with known DWAB test data. |

#### Files to Modify

| File | Changes |
|------|---------|
| `src/formats/EXRDecoder.ts` | Add case `EXRCompression.DWAB` (enum value 9) to the decompression dispatch. Import and call `decompressDWAB()`. Also handle `DWAA` (enum value 8) similarly. Update `SUPPORTED_COMPRESSION` list. |

#### Integration Point in EXRDecoder.ts

```typescript
// In the decompression switch (approximate location — find the switch on compression type):
case EXRCompression.DWAB:  // 9
  decompressedData = decompressDWAB(compressedBlock, expectedSize, channelInfo);
  break;
case EXRCompression.DWAA:  // 8
  decompressedData = decompressDWAA(compressedBlock, expectedSize, channelInfo);
  break;
```

#### Tests

```
DWABDecoder.test.ts:
  DWAB-001: decompressDWAB() decompresses known test block correctly
  DWAB-002: decompressDWAB() handles single-channel half-float
  DWAB-003: decompressDWAB() handles multi-channel (RGB half-float)
  DWAB-004: decompressDWAB() handles RGBA half-float
  DWAB-005: decompressDWAB() produces output matching uncompressed reference (within lossy tolerance)
  DWAB-006: Integration: EXRDecoder loads DWAB-compressed file
  DWAB-007: Integration: Decoded pixel values within epsilon of reference
  DWAB-008: Performance: 4K DWAB frame decompresses in <500ms
```

#### Acceptance Criteria

- [ ] EXR files with DWAB compression load and display correctly
- [ ] Pixel values match reference within lossy compression tolerance (PSNR > 40dB)
- [ ] 4K DWAB EXR decompresses in <500ms
- [ ] DWAA also supported (single-scanline variant)
- [ ] Non-DWAB EXR files continue to work (no regression)

---

### T1.9 Dailies Report Export

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 3-5 days |
| **Dependencies** | T1.1 (Notes), T1.4 (Status) |
| **Blocks** | None |

#### Description

Export a structured report from a dailies session: CSV (and optionally PDF) with shot name, status, notes, timecodes, version info.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/export/ReportExporter.ts` | Generate CSV and optional HTML/PDF reports from session data. |
| `test/export/ReportExporter.test.ts` | Unit tests |

#### Data Model

```typescript
interface ReportRow {
  shotName: string;
  versionLabel: string;
  status: ShotStatus;
  notes: string[];                       // Concatenated note texts
  frameRange: string;                    // e.g., "1001-1048"
  timecodeIn: string;                    // SMPTE
  timecodeOut: string;
  duration: string;                      // frames or seconds
  setBy: string;                         // Who set the status
}

interface ReportOptions {
  format: 'csv' | 'html';
  includeNotes: boolean;
  includeTimecodes: boolean;
  includeVersions: boolean;
  title: string;
  dateRange?: string;
}
```

#### Algorithm Details

```
generateReport(session, noteManager, statusManager, versionManager, options):
  1. Iterate playlist clips (or all sources if no playlist)
  2. For each source:
     a. Get shotName from source name (or version group name)
     b. Get status from statusManager
     c. Get notes from noteManager
     d. Get version label from versionManager
     e. Calculate frame range and timecodes
  3. Format as CSV:
     Header: Shot,Version,Status,Notes,Frame In,Frame Out,TC In,TC Out,Duration,Reviewed By
     Rows: One per source
  4. Trigger browser download via Blob + URL.createObjectURL()

generateCSV(rows: ReportRow[]): string
  1. Escape fields with commas/quotes (RFC 4180)
  2. Join with newlines

generateHTML(rows: ReportRow[], options): string
  1. Build HTML table with styled headers
  2. Color-code status cells
  3. Include title, date, summary counts
  4. Suitable for print (CSS @media print)
```

#### Tests

```
ReportExporter.test.ts:
  REPORT-001: generateCSV() produces valid CSV with header row
  REPORT-002: generateCSV() escapes commas and quotes in notes
  REPORT-003: generateCSV() includes all fields per row
  REPORT-004: generateHTML() produces valid HTML table
  REPORT-005: generateHTML() color-codes status cells
  REPORT-006: report includes notes when includeNotes=true
  REPORT-007: report excludes notes when includeNotes=false
  REPORT-008: report handles empty playlist (header only)
  REPORT-009: report handles sources with no notes/status
  REPORT-010: generateReport() creates downloadable blob
```

#### Acceptance Criteria

- [ ] Export CSV report with one row per shot
- [ ] CSV includes: shot name, version, status, notes, frame range, timecodes
- [ ] CSV properly escaped (RFC 4180)
- [ ] HTML report with colored status badges, suitable for print
- [ ] Download triggers browser save dialog

---

### T1.10 Unified Preferences API

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 2 days |
| **Dependencies** | None |
| **Blocks** | None |

#### Description

Create a unified preferences manager that wraps existing localStorage subsystems and adds missing persistence for color defaults and export settings.

#### Existing localStorage Subsystems (already working)

| Subsystem | Storage Key | What It Stores |
|-----------|------------|----------------|
| `CustomKeyBindingsManager` | `openrv-custom-keybindings` | Custom keyboard shortcuts |
| `LayoutStore` | `openrv-layout` | Panel sizes, collapsed state, active tabs |
| `ThemeManager` | `openrv-theme-mode` | dark/light/auto |
| `OCIOStateManager` | `openrv-ocio-state` | OCIO config, display, view, look |
| `OCIOStateManager` | `openrv-ocio-per-source` | Per-source input color spaces |
| `AutoSaveIndicator` | `openrv-autosave-config` | Auto-save interval, enabled |

#### Files to Create

| File | Purpose |
|------|---------|
| `src/core/PreferencesManager.ts` | Unified API wrapping existing subsystems + new preference categories. |
| `test/core/PreferencesManager.test.ts` | Unit tests |

#### Data Model

```typescript
interface PreferencesManager {
  // Facade over existing subsystems (delegates, does not duplicate)
  get theme(): ThemeManager;
  get layout(): LayoutStore;
  get keyBindings(): CustomKeyBindingsManager;
  get ocio(): OCIOStateManager;

  // NEW: Color defaults (not yet persisted)
  getColorDefaults(): ColorDefaults;
  setColorDefaults(defaults: Partial<ColorDefaults>): void;

  // NEW: Export defaults
  getExportDefaults(): ExportDefaults;
  setExportDefaults(defaults: Partial<ExportDefaults>): void;

  // NEW: General preferences
  getGeneralPrefs(): GeneralPrefs;
  setGeneralPrefs(prefs: Partial<GeneralPrefs>): void;

  // Bulk operations
  exportAll(): string;                   // JSON string of all prefs
  importAll(json: string): void;         // Restore from export
  resetAll(): void;                      // Reset everything to defaults
}

interface ColorDefaults {
  defaultInputColorSpace: string;
  defaultExposure: number;
  defaultGamma: number;
  defaultCDLPreset: string | null;
}

interface ExportDefaults {
  defaultFormat: 'png' | 'jpeg' | 'webp';
  defaultQuality: number;
  includeAnnotations: boolean;
  frameburnEnabled: boolean;
  frameburnConfig: FrameburnConfig | null;
}

interface GeneralPrefs {
  userName: string;
  defaultFps: number;
  autoPlayOnLoad: boolean;
  showWelcome: boolean;
}
```

#### Storage Keys (new)

```
'openrv-prefs-color'   → ColorDefaults
'openrv-prefs-export'  → ExportDefaults
'openrv-prefs-general' → GeneralPrefs
```

#### Algorithm Details

```
PreferencesManager constructor:
  1. Accept existing manager references (theme, layout, keyBindings, ocio)
  2. Load new preference categories from localStorage
  3. Apply validation + defaults pattern (same as existing subsystems)

setColorDefaults(partial):
  1. Merge with existing: { ...current, ...partial }
  2. Validate ranges
  3. Save to localStorage['openrv-prefs-color']
  4. Emit 'colorDefaultsChanged'

exportAll():
  1. Collect state from each subsystem:
     - theme.getMode()
     - layout.getLayout()
     - keyBindings.getCustomBindings()
     - ocio.getState()
     - this.getColorDefaults()
     - this.getExportDefaults()
     - this.getGeneralPrefs()
  2. Return JSON.stringify(collected)

importAll(json):
  1. Parse JSON, validate structure
  2. Apply to each subsystem via their setState() methods
  3. Save all
```

#### Tests

```
PreferencesManager.test.ts:
  PREFS-001: getColorDefaults() returns defaults when nothing stored
  PREFS-002: setColorDefaults() persists to localStorage
  PREFS-003: setColorDefaults() emits 'colorDefaultsChanged'
  PREFS-004: getExportDefaults() returns defaults
  PREFS-005: setExportDefaults() persists and emits
  PREFS-006: exportAll() produces valid JSON with all subsystems
  PREFS-007: importAll() restores all subsystems
  PREFS-008: resetAll() clears all preferences
  PREFS-009: handles missing localStorage gracefully (no throw)
  PREFS-010: validates input ranges (e.g., quality 0-1)
```

#### Acceptance Criteria

- [ ] Color defaults (input color space, exposure, gamma) persist across sessions
- [ ] Export defaults (format, quality, frameburn) persist across sessions
- [ ] General preferences (userName, fps, autoPlay) persist
- [ ] Export/import all preferences as JSON file
- [ ] Reset all preferences to defaults

---

## Phase 2: Professional Pipeline Integration

### T2.1 Video Encode (WebCodecs)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 2 weeks |
| **Dependencies** | T1.6 (Frameburn Compositor) |
| **Blocks** | None |

#### Description

Encode frame sequences to H.264/VP9/AV1 video using WebCodecs VideoEncoder. Include frameburn compositing, progress reporting, and cancellation.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/export/VideoExporter.ts` | Core encode pipeline: frame → canvas → VideoFrame → VideoEncoder → MP4 muxer. |
| `src/export/MP4Muxer.ts` | MP4 container muxer (use `mp4-muxer` npm package or minimal ISO BMFF writer). |
| `src/ui/components/ExportProgress.ts` | Progress bar dialog with cancel button, ETA display. |
| `src/ui/components/ExportVideoControl.ts` | UI for codec selection, quality, frame range. |
| `test/export/VideoExporter.test.ts` | Unit tests |

#### Data Model

```typescript
interface VideoExportConfig {
  codec: 'avc1.42001f' | 'vp09.00.10.08' | 'av01.0.04M.08'; // H.264 | VP9 | AV1
  width: number;
  height: number;
  fps: number;
  bitrate: number;                       // bps
  frameRange: { start: number; end: number };
  includeAudio: boolean;
  frameburn: FrameburnConfig | null;
}

interface ExportProgress {
  currentFrame: number;
  totalFrames: number;
  percentage: number;                    // 0-100
  elapsedMs: number;
  estimatedRemainingMs: number;
  status: 'encoding' | 'muxing' | 'complete' | 'cancelled' | 'error';
}
```

#### Algorithm Details

```
exportVideo(config, session, renderer, frameburnCompositor):
  1. Create offscreen canvas at config.width × config.height
  2. Initialize VideoEncoder with config.codec, config.bitrate
  3. Initialize MP4Muxer with codec info
  4. For each frame in range:
     a. Seek session to frame
     b. Render frame via renderer to offscreen canvas
     c. If frameburn: compositeFrameburn(ctx, frameburnConfig, frameContext)
     d. Create VideoFrame from canvas: new VideoFrame(canvas, { timestamp: frame/fps * 1e6 })
     e. Encode: encoder.encode(videoFrame, { keyFrame: frame % gopSize === 0 })
     f. videoFrame.close()  // Release GPU memory
     g. Emit progress event
     h. Check cancel flag
     i. yield to main thread every N frames: await new Promise(r => setTimeout(r, 0))
  5. Flush encoder: await encoder.flush()
  6. Finalize MP4: muxer.finalize() → Blob
  7. Trigger download via URL.createObjectURL(blob)

Cancel flow:
  1. Set cancelFlag = true
  2. In encode loop, check flag and break
  3. Encoder.close()
  4. Emit 'cancelled' progress
```

#### Tests

```
VideoExporter.test.ts:
  VIDEO-001: encode produces valid VideoEncoder output chunks
  VIDEO-002: progress events fire with correct percentage
  VIDEO-003: cancel stops encoding mid-stream
  VIDEO-004: frameburn is composited onto encoded frames
  VIDEO-005: handles encoder error gracefully
  VIDEO-006: keyframes placed at GOP boundaries
  VIDEO-007: output timestamps are monotonically increasing
```

#### Acceptance Criteria

- [ ] Export H.264 MP4 video from frame sequence
- [ ] Progress bar shows percentage and ETA
- [ ] Cancel button stops encoding cleanly
- [ ] Frameburn overlays included in video
- [ ] Output plays in standard video players (VLC, QuickTime)

---

### T2.2 OTIO Export

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 1 week |
| **Dependencies** | None |

#### Description

Export playlist/timeline as OpenTimelineIO JSON. The import path already exists (`OTIOParser.ts` + `PlaylistManager.fromOTIO()`).

#### Files to Create

| File | Purpose |
|------|---------|
| `src/utils/media/OTIOWriter.ts` | Generate OTIO JSON from playlist state. |
| `test/utils/media/OTIOWriter.test.ts` | Unit tests |

#### Algorithm Details

```
exportOTIO(playlistManager, session): string
  1. Create root Timeline.1 object:
     { OTIO_SCHEMA: "Timeline.1", name: session.name, tracks: { ... } }
  2. Create Stack.1 with single Track.1 (video track)
  3. For each PlaylistClip:
     a. Create Clip.1:
        - name: clip.sourceName
        - source_range: { start: { value: clip.inPoint, rate: session.fps },
                          duration: { value: clip.duration, rate: session.fps } }
        - media_reference: ExternalReference.1 with target_url
     b. If gap between clips: insert Gap.1
  4. Return JSON.stringify(timeline, null, 2)
```

**OTIO Schema compatibility (match existing parser):**
```json
{
  "OTIO_SCHEMA": "Timeline.1",
  "name": "Dailies Session 2026-02-18",
  "global_start_time": { "OTIO_SCHEMA": "RationalTime.1", "value": 0, "rate": 24.0 },
  "tracks": {
    "OTIO_SCHEMA": "Stack.1",
    "children": [{
      "OTIO_SCHEMA": "Track.1",
      "kind": "Video",
      "children": [
        {
          "OTIO_SCHEMA": "Clip.1",
          "name": "shot_ABC_0010_v3",
          "source_range": {
            "OTIO_SCHEMA": "TimeRange.1",
            "start_time": { "OTIO_SCHEMA": "RationalTime.1", "value": 1001, "rate": 24.0 },
            "duration": { "OTIO_SCHEMA": "RationalTime.1", "value": 48, "rate": 24.0 }
          },
          "media_reference": {
            "OTIO_SCHEMA": "ExternalReference.1",
            "target_url": "file:///path/to/shot.exr"
          }
        }
      ]
    }]
  }
}
```

#### Tests

```
OTIOWriter.test.ts:
  OTIO-W001: exportOTIO() produces valid JSON with Timeline.1 schema
  OTIO-W002: clips map to Clip.1 with correct source_range
  OTIO-W003: gaps between clips produce Gap.1 entries
  OTIO-W004: round-trip: export → import produces equivalent playlist
  OTIO-W005: handles empty playlist
  OTIO-W006: handles single clip
  OTIO-W007: frame rates preserved correctly
  OTIO-W008: media_reference uses source URL
```

#### Acceptance Criteria

- [ ] Export produces valid OTIO JSON that opens in OpenTimelineIO viewer
- [ ] Round-trip (export → import) preserves clip order, in/out points, timing
- [ ] Works with variable-FPS playlists (each clip has own rate)

---

### T2.3 ShotGrid API Integration

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 2 weeks |
| **Dependencies** | T1.1 (Notes), T1.4 (Status) |

#### Description

Integration with Autodesk ShotGrid (formerly Shotgun) REST API for loading versions, pushing notes/status, and syncing review data.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/integrations/ShotGridBridge.ts` | REST API client for ShotGrid. Auth, version loading, note push, status sync. |
| `src/integrations/ShotGridConfig.ts` | Configuration UI for server URL, API key, project selection. |
| `src/ui/components/ShotGridPanel.ts` | Panel showing ShotGrid entities, version loading, sync status. |
| `test/integrations/ShotGridBridge.test.ts` | Unit tests (mock fetch) |

#### Data Model

```typescript
interface ShotGridConfig {
  serverUrl: string;                     // e.g., 'https://studio.shotgrid.autodesk.com'
  scriptName: string;                    // API script name
  apiKey: string;                        // API key (stored securely)
  projectId: number;
}

interface ShotGridVersion {
  id: number;
  code: string;                          // Version name
  entity: { type: 'Shot'; id: number; name: string };
  sg_status_list: string;                // 'rev' | 'apr' | 'fin' | etc.
  sg_path_to_movie: string;
  sg_path_to_frames: string;
  created_at: string;
  user: { type: 'HumanUser'; id: number; name: string };
}

interface ShotGridNote {
  id: number;
  subject: string;
  content: string;
  note_links: Array<{ type: string; id: number }>;
  created_at: string;
  user: { type: 'HumanUser'; id: number; name: string };
}
```

#### Algorithm Details

```
ShotGridBridge:
  authenticate():
    POST /api/v1/auth/access_token with script credentials
    Store bearer token

  getVersionsForPlaylist(playlistId):
    GET /api/v1/entity/playlists/{id}/versions
    Return ShotGridVersion[]

  getVersionsForShot(shotId):
    GET /api/v1/entity/shots/{id}/versions
    Return ShotGridVersion[]

  pushNote(versionId, note):
    POST /api/v1/entity/notes
    Body: { subject, content, note_links: [{ type: 'Version', id: versionId }] }

  pushStatus(versionId, status):
    PUT /api/v1/entity/versions/{id}
    Body: { sg_status_list: mapStatus(status) }

  mapStatus(localStatus: ShotStatus): string
    'approved' → 'apr'
    'needs-work' → 'rev'
    'cbb' → 'cbb'
    'pending' → 'pnd'
    'omit' → 'omt'
```

#### Tests

```
ShotGridBridge.test.ts:
  SG-001: authenticate() obtains bearer token
  SG-002: getVersionsForPlaylist() parses version list
  SG-003: pushNote() sends correct POST body
  SG-004: pushStatus() maps local status to ShotGrid codes
  SG-005: handles 401 (re-authenticate)
  SG-006: handles network errors gracefully
  SG-007: handles rate limiting (429)
```

#### Acceptance Criteria

- [ ] Connect to ShotGrid with API credentials
- [ ] Load playlist of versions from ShotGrid
- [ ] Push notes from NoteManager to ShotGrid
- [ ] Push status from StatusManager to ShotGrid
- [ ] Status mapping between local and ShotGrid codes

---

### T2.4 Session URL Sharing

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 1 week |
| **Dependencies** | None |

#### Description

Generate shareable URLs that encode session state (media source, frame, display settings) for async review sharing. Natural web capability that desktop OpenRV cannot replicate.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/core/session/SessionURLManager.ts` | Encode/decode session state to/from URL hash parameters. |
| `test/core/session/SessionURLManager.test.ts` | Unit tests |

#### Algorithm Details

```
encodeToURL(session):
  1. Build state object: { source, frame, zoom, pan, ocio, wipe, cdl }
  2. JSON.stringify → compress with btoa() or lz-string
  3. Set window.location.hash = encoded
  4. Copy URL to clipboard

decodeFromURL():
  1. Read window.location.hash
  2. Decode: atob() or lz-string → JSON.parse
  3. Apply state to session
  4. Load referenced media source

URL format:
  https://app.example.com/#s=BASE64_STATE
  or
  https://app.example.com/?source=URL&frame=42&zoom=1.5&ocio=aces
```

#### Tests

```
SessionURLManager.test.ts:
  URL-001: encodeToURL() produces valid URL hash
  URL-002: decodeFromURL() restores frame number
  URL-003: round-trip encode → decode preserves all state fields
  URL-004: handles missing optional fields
  URL-005: handles invalid/corrupted URL gracefully
```

---

### T2.5 Quad View Comparison ✅

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 1 week |
| **Dependencies** | None |
| **Status** | DONE |

#### Description

Simultaneous A/B/C/D comparison in a 2x2 grid, all locked to the same frame and zoom.

#### Files to Modify

| File | Changes |
|------|---------|
| `src/ui/components/ComparisonManager.ts` | Extend `ABSource` type from `'A' | 'B'` to `'A' | 'B' | 'C' | 'D'`. Add `quadViewEnabled: boolean`. Add source assignment for C and D. |
| `src/render/Renderer.ts` | Add quad-view rendering: 4 viewports, each rendering a different source with same transform. Use `gl.viewport()` to subdivide. |
| `src/ui/components/CompareControl.ts` | Add "Quad View" toggle button. Source assignment dropdowns for C and D. |

#### Algorithm Details

```
Quad view rendering:
  1. Subdivide canvas into 4 equal viewports
  2. For each quadrant (A, B, C, D):
     a. Set gl.viewport(x, y, w/2, h/2)
     b. Bind source texture for that quadrant's source
     c. Apply same color/transform uniforms
     d. Draw quad
  3. Draw divider lines between quadrants
  4. Draw source labels (A, B, C, D) in corners
```

#### Tests

```
ComparisonManager.test.ts (extend existing):
  QUAD-001: setQuadViewEnabled(true) activates quad mode
  QUAD-002: source C and D can be assigned
  QUAD-003: quad view disables wipe mode
  QUAD-004: all 4 viewports render at same zoom/pan
```

---

### T2.6 Shortcut Editor UI

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 2-3 days |
| **Dependencies** | None |

#### Description

UI panel for viewing and customizing keyboard shortcuts. Backend (`CustomKeyBindingsManager.ts`) already exists with localStorage persistence, conflict detection, and migration support.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/ui/components/ShortcutEditor.ts` | Scrollable list of all actions with current key combo. Click to rebind (capture next keystroke). Conflict warnings. Reset button. |
| `test/ui/components/ShortcutEditor.test.ts` | UI tests |

#### Algorithm Details

```
ShortcutEditor panel:
  1. Get all actions from customKeyBindingsManager.getAvailableActions()
  2. Group by category (playback, view, panel, paint, channel, transform, export, etc.)
  3. For each action:
     a. Show description + current key combo (getEffectiveCombo(action))
     b. If customized: show "modified" indicator + reset button
  4. Click on combo → enter "listening" mode:
     a. Show "Press new key combo..." overlay
     b. Capture next keydown event
     c. Check conflicts: findConflictingAction(newCombo, action)
     d. If conflict: show warning "Already used by {conflictAction}. Override?"
     e. If confirmed: setCustomBinding(action, newCombo, force=true)
  5. "Reset All" button calls resetAll()
  6. "Export" button exports bindings as JSON
  7. "Import" button loads bindings from JSON file
```

#### Tests

```
ShortcutEditor.test.ts:
  SHORTCUT-U001: renders all actions grouped by category
  SHORTCUT-U002: shows current key combo for each action
  SHORTCUT-U003: click enters listening mode
  SHORTCUT-U004: captures keystroke and updates binding
  SHORTCUT-U005: shows conflict warning when combo already used
  SHORTCUT-U006: reset button restores default combo
  SHORTCUT-U007: "Reset All" calls manager.resetAll()
  SHORTCUT-U008: shows "modified" indicator for customized bindings
```

---

### T2.7 OTIO Transitions + Multi-track

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 2 weeks |
| **Dependencies** | T2.2 (OTIO Export) |

#### Description

Extend OTIO support with transition rendering (dissolves, wipes) and multi-track parsing.

#### Files to Modify

| File | Changes |
|------|---------|
| `src/utils/media/OTIOParser.ts` | Parse `Transition.1` with `transition_type` and `in_offset`/`out_offset`. Parse multiple `Track.1` children in `Stack.1`. |
| `src/nodes/groups/SequenceGroupNode.ts` | Add transition blending: during transition duration, blend outgoing and incoming clips. |
| `src/utils/media/OTIOWriter.ts` | Export transitions and multiple tracks. |

#### Algorithm Details

```
Transition rendering:
  1. During transition overlap region (frame in transition duration):
     a. Calculate blend factor: t = (frame - transitionStart) / transitionDuration
     b. Render outgoing clip at frame
     c. Render incoming clip at frame
     d. Blend: output = outgoing * (1-t) + incoming * t (dissolve)
     e. For wipe: use wipe position = t

Multi-track:
  1. Parse all Track.1 children (not just first)
  2. Map tracks to StackGroupNode layers
  3. Video tracks compose with blend modes
  4. Audio tracks route to AudioPlaybackManager
```

---

### T2.8 Conform/Re-link UI

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 1 week |

#### Description

When importing OTIO/EDL with unresolvable media references, show a panel for manually re-linking clips to available files.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/ui/components/ConformPanel.ts` | Table showing unresolved clips with "Browse" button per clip. Batch re-link by folder. |
| `test/ui/components/ConformPanel.test.ts` | UI tests |

---

### T2.9 Slate/Leader for Export

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 1-2 weeks |

#### Description

Generate slate/leader frames prepended to video exports with show info, shot info, date, custom fields.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/export/SlateRenderer.ts` | Render slate frames (1-3 second leader) with configurable layout and fields. |
| `src/ui/components/SlateEditor.ts` | UI for editing slate template: field arrangement, logos, colors. |

#### Algorithm Details

```
Slate frame rendering:
  1. Create canvas at export resolution
  2. Draw background (black or custom color)
  3. Render field layout:
     - Title (show/project name) - large centered
     - Shot name - large centered below title
     - Version, artist, date - medium
     - TC In/Out, duration - medium
     - Resolution, codec, color space - small
     - Studio logo (if provided) - corner position
  4. Generate N frames at export FPS (e.g., 2 seconds = 48 frames at 24fps)
  5. Prepend to encode sequence
```

---

### T2.10 Collaboration Enhancements

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 2 weeks |
| **Dependencies** | None |

#### Description

Enhance `NetworkSyncManager` with cursor sharing, real-time annotation sync, conflict resolution, and participant permissions.

#### Files to Modify

| File | Changes |
|------|---------|
| `src/network/NetworkSyncManager.ts` | Add message types: `CursorSyncPayload`, `AnnotationSyncPayload`. Add `sendCursorPosition()`, `sendAnnotationUpdate()`. |
| `src/network/types.ts` | Add new payload types and events: `syncCursor`, `syncAnnotation`, `participantPermissionChanged`. |

#### New Payload Types

```typescript
interface CursorSyncPayload {
  userId: string;
  x: number;                             // Normalized 0-1
  y: number;                             // Normalized 0-1
  timestamp: number;
}

interface AnnotationSyncPayload {
  type: 'add' | 'remove' | 'update';
  annotation: SerializedAnnotation;
  frame: number;
  timestamp: number;
}

interface ParticipantPermission {
  userId: string;
  role: 'host' | 'reviewer' | 'viewer'; // viewer = read-only
}
```

---

### T2.11 Pressure Opacity/Saturation Mapping

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 1 day |
| **Dependencies** | None |

#### Description

Extend existing pressure sensitivity (width modulation) to also modulate opacity and saturation.

#### Files to Modify

| File | Line | Change |
|------|------|--------|
| `src/paint/PaintRenderer.ts` | ~198 | Add opacity modulation: `globalAlpha = baseOpacity * (p.pressure ?? 1)` in addition to width. |
| `src/paint/types.ts` | | Add `pressureMapping: { width: boolean; opacity: boolean; saturation: boolean }` to `BrushSettings`. |
| `src/ui/components/PaintToolbar.ts` | | Add pressure mapping toggles (width/opacity/saturation checkboxes). |

#### Algorithm Details

```
In renderGaussianStroke():
  Current: w = getWidth(i) * (p.pressure ?? 1)
  Add:     opacity = baseOpacity * (pressureMapping.opacity ? (p.pressure ?? 1) : 1)
           saturation = baseSaturation * (pressureMapping.saturation ? (p.pressure ?? 1) : 1)
  Apply:   ctx.globalAlpha = opacity
           color = adjustSaturation(strokeColor, saturation)
```

---

### T2.12 Stereo Convergence Tools

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 1 week |

#### Description

Add quantitative stereo QC tools: pixel disparity readout at cursor, min/max disparity display, convergence guide overlay.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/ui/components/ConvergenceMeasure.ts` | Compute pixel disparity between L/R frames at cursor. Display min/max/avg stats. |
| `test/ui/components/ConvergenceMeasure.test.ts` | Unit tests |

---

### T2.13 OCIO WASM Full Integration

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | 6-10 weeks |
| **Dependencies** | T1.5 (OCIO Display/View Menus) |

#### Description

Compile OpenColorIO to WASM, generate GLSL at runtime for full live GPU pipeline. This replaces the baked LUT approach with native OCIO processing.

**This is the largest and riskiest task. Detailed sub-task breakdown recommended before starting.**

#### High-Level Steps

1. **WASM Build** (2-3 weeks): Compile OpenColorIO C++ with Emscripten. Handle dependencies (yaml-cpp, expat, pystring, minizip-ng, Imath). Export: `ocioLoadConfig()`, `ocioGetDisplays()`, `ocioGetViews()`, `ocioGetProcessor()`, `ocioGenerateShaderCode()`.

2. **Virtual Filesystem** (1 week): OCIO configs reference external LUT files (.spi3d, .cube, .clf). Implement WASM virtual FS or URL-based file loading.

3. **Shader Integration** (2-3 weeks): Generated GLSL from OCIO uses GLSL 1.x syntax; WebGL2 needs GLSL ES 300. Build translation layer. Inject into monolithic shader or use multi-pass approach.

4. **UI Integration** (1 week): Replace baked LUT dropdowns with live OCIO-driven menus. Config file upload/drag-drop (already exists in OCIOControl).

5. **Testing & Validation** (1-2 weeks): Compare pixel-level output against reference OCIO output. Test with studio OCIO configs (ACES, Sony Pictures, etc.).

---

## Phase 3: Polish & Full Parity

### Phase 3 Tasks Summary

| ID | Feature | Effort | Key Files | Notes |
|----|---------|--------|-----------|-------|
| T3.1 | EXR tiled image support | 1 week | `EXRDecoder.ts` | Add tiled reading mode alongside scanline. Tile sizes typically 32x32 or 64x64. |
| T3.2 | TIFF LZW/ZIP compression | 1 week | New: `TIFFDecoder.ts` enhancements | Add LZW (Lempel-Ziv-Welch) and Deflate decompression. |
| T3.3 | JPEG 2000 (HTJ2K via WASM) | 1 week | New: `JP2Decoder.ts` + `openjph.wasm` | High-Throughput JPEG 2000 via OpenJPH WASM build. |
| T3.4 | MXF container support | 1 week | New: `MXFDemuxer.ts` | Parse MXF OP1a container, extract video/audio essence. |
| T3.5 | Multi-view EXR (stereo) | 5 days | `EXRDecoder.ts` | Parse `multiView` attribute, extract left/right views. |
| T3.6 | Premult/Unpremult control | 2 days | `Renderer.ts`, New: `PremultControl.ts` | Add shader uniform `u_premult` (0=off, 1=premult, 2=unpremult). |
| T3.7 | Retime warp curves | 1 week | `RetimeGroupNode.ts` | Add keyframe-based time warping with bezier interpolation. |
| T3.8 | Negative display | 2 days | `viewer.frag.glsl` | Add `u_negativeDisplay` uniform. Invert RGB, apply Cineon log curve. |
| T3.9 | Dither + quantize visualization | 3 days | `viewer.frag.glsl` | Add ordered dither (Bayer 8x8) and quantize visualization (posterize). |
| T3.10 | Shortcut cheat sheet overlay | 2 days | New: `ShortcutCheatSheet.ts` | Overlay showing available shortcuts for current context. Toggle with `?` key. |
| T3.11 | Client-safe locked UI mode | 3 days | New: `ClientMode.ts` | Hide editing controls, show only playback/navigation. Lock via URL param or toggle. |
| T3.12 | Reference image workflow | 1 week | New: `ReferenceManager.ts` | Persistent reference that survives shot changes. Split view: reference + current. |
| T3.13 | Annotated frame/PDF export | 3 days | `FrameExporter.ts` | Export composited frame (image + annotations + notes) as PNG. Annotations rendered via PaintRenderer. |
| T3.14 | EDL export | 3 days | New: `EDLWriter.ts` | CMX3600-format EDL export. Reuse PlaylistManager.toEDL() structure, add file writing. |

---

## Appendix A: Test Naming Convention

All new tests follow the existing pattern discovered in the codebase:

```
{CATEGORY}-{TYPE}{NUMBER}: {description}

CATEGORY: Feature area (NOTE, VER, CDL, STATUS, OCIO, BURN, NAV, DWAB, etc.)
TYPE: blank for unit, U for UI, I for integration
NUMBER: 3-digit sequential (001, 002, ...)

Examples:
  NOTE-001: addNote() creates note with correct fields
  NOTE-U001: renders empty state message
  CDL-HDR-001: applyCDL() preserves values > 1.0
```

## Appendix B: File Organization

New files follow existing codebase conventions:

```
src/
  core/session/
    NoteManager.ts          (T1.1)
    VersionManager.ts       (T1.2)
    StatusManager.ts        (T1.4)
    SessionURLManager.ts    (T2.4)
  core/
    PreferencesManager.ts   (T1.10)
  ui/components/
    NotePanel.ts            (T1.1)
    NoteOverlay.ts          (T1.1)
    NoteInput.ts            (T1.1)
    VersionNavigator.ts     (T1.2)
    StatusBadge.ts          (T1.4)
    ExportProgress.ts       (T2.1)
    ExportVideoControl.ts   (T2.1)
    ShortcutEditor.ts       (T2.6)
    ConformPanel.ts         (T2.8)
    SlateEditor.ts          (T2.9)
    ShortcutCheatSheet.ts   (T3.10)
  export/
    FrameburnCompositor.ts  (T1.6)
    ReportExporter.ts       (T1.9)
    VideoExporter.ts        (T2.1)
    MP4Muxer.ts             (T2.1)
    SlateRenderer.ts        (T2.9)
    EDLWriter.ts            (T3.14)
  integrations/
    ShotGridBridge.ts       (T2.3)
    ShotGridConfig.ts       (T2.3)
  formats/exr/
    DWABDecoder.ts          (T1.8)
  utils/media/
    OTIOWriter.ts           (T2.2)
```

## Appendix C: Dependency Graph

```
T1.0 GTO Round-Trip Fixes ─────────▶ ALL TASKS (ensures .rv files don't lose data)

T1.1 Note/Comment System ──────────┐
                                    ├──▶ T1.4 Shot Status ──┐
T1.2 Version Management ───────────┤                        ├──▶ T1.9 Dailies Report
                                    │                        │
T1.3 CDL Bug Fix (independent)     │                        │
T1.5 OCIO Menus (independent) ─────┤                        │
T1.6 Frameburn (independent) ──────┼──▶ T2.1 Video Encode   │
T1.7 Shot Navigation (independent) │                        │
T1.8 EXR DWAB (independent)        │                        │
T1.10 Preferences (independent)    │                        │

T2.2 OTIO Export (independent) ────▶ T2.7 OTIO Transitions
T2.3 ShotGrid ─────────────────────┤
T2.4 Session URL (independent)     │
T2.5 Quad View (independent)       │
T2.6 Shortcut Editor (independent) │
T2.8 Conform UI (independent)      │
T2.9 Slate (independent)           │
T2.10 Collaboration (independent)  │
T2.11 Pressure (independent)       │
T2.12 Stereo (independent)         │
T1.5 OCIO Menus ───────────────────▶ T2.13 OCIO WASM
```

---

## Appendix D: GTO Property Path Reference

Quick reference for all custom GTO properties introduced by new features:

```
RVSession : rv
├── notes.totalNotes                         (T1.1)
├── notes.note_NNN_id                        (T1.1)
├── notes.note_NNN_sourceIndex               (T1.1)
├── notes.note_NNN_frameStart                (T1.1)
├── notes.note_NNN_frameEnd                  (T1.1)
├── notes.note_NNN_text                      (T1.1)
├── notes.note_NNN_author                    (T1.1)
├── notes.note_NNN_createdAt                 (T1.1)
├── notes.note_NNN_modifiedAt                (T1.1)
├── notes.note_NNN_status                    (T1.1)
├── notes.note_NNN_parentId                  (T1.1)
├── notes.note_NNN_color                     (T1.1)
├── versions.groupCount                      (T1.2)
├── versions.group_NNN_id                    (T1.2)
├── versions.group_NNN_shotName              (T1.2)
├── versions.group_NNN_activeVersionIndex    (T1.2)
├── versions.group_NNN_versionCount          (T1.2)
├── versions.group_NNN_vMMM_versionNumber    (T1.2)
├── versions.group_NNN_vMMM_sourceIndex      (T1.2)
├── versions.group_NNN_vMMM_label            (T1.2)
└── versions.group_NNN_vMMM_addedAt          (T1.2)

RVSourceGroup : sourceGroupNNNNNN
└── review.status                            (T1.4)
└── review.statusColor                       (T1.4)
└── review.setBy                             (T1.4)
└── review.setAt                             (T1.4)

RVColor : sourceGroupNNNNNN_RVColor
└── CDL.noClamp                              (T1.3)

RVOCIO : display_ocio
├── ocio.active                              (T1.5)
├── ocio.function                            (T1.5)
├── ocio.lut3DSize                           (T1.5)
├── ocio_display.display                     (T1.5)
├── ocio_display.view                        (T1.5)
├── ocio_color.inColorSpace                  (T1.5)
├── ocio_color.outColorSpace                 (T1.5)
├── ocio_look.look                           (T1.5)
└── ocio_look.direction                      (T1.5)

Properties fixed in T1.0 (already defined by OpenRV, now written back):
├── RVColor.color.hue                        (T1.0)
├── RVColor.color.invert                     (T1.0)
├── RVColor.color.unpremult                  (T1.0)
├── RVLinearize.color.logtype                (T1.0)
├── RVLinearize.color.sRGB2linear            (T1.0)
├── RVLinearize.color.Rec709ToLinear         (T1.0)
├── RVLinearize.color.fileGamma              (T1.0)
└── RVLinearize.color.alphaType              (T1.0)
```

---

*This document provides implementation-ready task specifications derived from PARITY_PLAN.md Revision 3, code-level analysis of the openrv-web codebase, and OpenRV .rv/GTO format analysis. Each task includes precise file locations, data models, algorithms, GTO serialization requirements, and test specifications.*
