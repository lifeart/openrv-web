# Multiple Media Representations (MMR)

## Overview

Desktop OpenRV supports per-source switching between multiple media representations -- typically a full-resolution EXR sequence, a proxy movie file, and a streaming preview -- with automatic fallback when a preferred representation is unavailable. The web version currently treats each loaded media as an independent source with no concept of alternative representations for the same shot.

This plan introduces a **per-source representation registry** that lets a single logical source carry multiple alternative media (e.g. full-res frames, proxy video, streaming URL). The user can switch representations on-the-fly, the system falls back automatically when a representation fails to load, and the toolbar displays the active representation and resolution.

### Goals

1. A source can hold 1-N representations, each with a type, priority, resolution, and loader.
2. The viewer renders whichever representation is currently active, transparently.
3. When the active representation fails (decode error, network timeout), the system auto-falls back to the next lower-priority representation.
4. A toolbar indicator shows the active representation type and resolution badge.
5. The representation choice persists across project save/load.
6. The architecture is extensible for future streaming (HLS/DASH) representations.

---

## Current State

### Source Data Model

The `MediaSource` interface (`src/core/session/Session.ts:194-212`) is a flat bag of fields:

```ts
interface MediaSource {
  type: MediaType;           // 'image' | 'video' | 'sequence'
  name: string;
  url: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  element?: HTMLImageElement | HTMLVideoElement | ImageBitmap;
  sequenceInfo?: SequenceInfo;
  sequenceFrames?: SequenceFrame[];
  videoSourceNode?: VideoSourceNode;
  fileSourceNode?: FileSourceNode;
  opfsCacheKey?: string;
}
```

There is no concept of "the same shot with multiple media options." Each file the user loads becomes a separate entry in `SessionMedia._sources[]`.

### Source Management

`SessionMedia` (`src/core/session/SessionMedia.ts`) owns the `_sources` array and provides `loadFile()`, `loadVideoFile()`, `loadImageFile()`, `loadSequence()`. Each method creates exactly one `MediaSource` and calls `addSource()` which appends it to `_sources`.

`Session` (`src/core/session/Session.ts`) delegates to `SessionMedia` and exposes `allSources`, `currentSource`, `setCurrentSource(index)`.

### Node Hierarchy

- `BaseSourceNode` (`src/nodes/sources/BaseSourceNode.ts`) -- abstract base with `SourceMetadata`, `isReady()`, `getElement()`, `toJSON()`.
- `FileSourceNode` -- single-image loader (EXR, DPX, TIFF, JPEG gainmap, etc.)
- `VideoSourceNode` -- video loader with mediabunny + HTML video fallback.
- `SequenceSourceNode` -- image sequence with FramePreloadManager.

Each source node is a standalone entity. There is no indirection layer that wraps multiple nodes as alternatives for one logical source.

### Rendering Pipeline

The `Viewer.render()` method (`src/ui/components/Viewer.ts:1221`) calls `renderImage()` which reads the current `MediaSource` from `session.currentSource` and renders its element/canvas/IPImage via the WebGL pipeline. It reads `source.videoSourceNode`, `source.fileSourceNode`, or `source.element` directly.

### Serialization

`SessionSerializer` (`src/core/session/SessionSerializer.ts`) saves each source as a `MediaReference` (`src/core/session/SessionState.ts:31-54`) with `path`, `name`, `type`, `width`, `height`, `duration`, `fps`. There is no field for alternative representations.

### Version Manager

`VersionManager` (`src/core/session/VersionManager.ts`) groups multiple sources by shot name for version comparison (v1, v2, v3). This operates at the source-index level and is orthogonal to representations within a single source. Representations are about different quality levels of the same content; versions are different takes/renders of the same shot.

### Existing Fallback Pattern

`VideoSourceNode` already has an internal fallback: it tries mediabunny (WebCodecs) first, then falls back to `HTMLVideoElement` rendering (`processHtmlVideo()`). This is a 2-tier internal strategy but it is hardcoded rather than configurable and does not extend to entirely different media files.

---

## Proposed Architecture

### Core Concept: `MediaRepresentation`

Each `MediaSource` gains a `representations` array of `MediaRepresentation` objects. One is marked `active`. The `MediaRepresentationManager` handles switching, fallback, and lifecycle.

```
MediaSource
  +-- representations: MediaRepresentation[]
  +-- activeRepresentationIndex: number
  +-- representationManager: MediaRepresentationManager
```

A representation encapsulates everything needed to load and render one version of the content:

```
MediaRepresentation
  +-- id: string
  +-- kind: RepresentationKind        // 'frames' | 'movie' | 'proxy' | 'streaming'
  +-- priority: number                // lower = preferred (0 = full-res)
  +-- label: string                   // "EXR Full (4096x2160)"
  +-- status: RepresentationStatus    // 'idle' | 'loading' | 'ready' | 'error'
  +-- resolution: { width, height }
  +-- sourceNode: BaseSourceNode | null
  +-- loader: RepresentationLoader    // strategy object
  +-- errorInfo?: string
```

### Representation Kinds

| Kind        | Typical Content                | Priority | Source Node Type       |
|-------------|-------------------------------|----------|------------------------|
| `frames`    | EXR/DPX sequence on disk      | 0        | SequenceSourceNode     |
| `movie`     | Full-res MOV/MP4 file         | 1        | VideoSourceNode        |
| `proxy`     | Half/quarter-res proxy video   | 2        | VideoSourceNode        |
| `streaming` | HLS/DASH adaptive URL          | 3        | (future) StreamSourceNode |

### Fallback Hierarchy

When the active representation enters `status: 'error'`, the `MediaRepresentationManager` walks the representations array in ascending priority order and activates the next one with `status !== 'error'`. If all fail, the source is marked degraded and the Viewer shows a missing-frame overlay (reusing `MissingFrameOverlay`).

### Class Diagram

```
Session
  +-- SessionMedia
        +-- _sources: MediaSource[]
              +-- representations: MediaRepresentation[]
              +-- activeRepresentationIndex: number
        +-- representationManager: MediaRepresentationManager  (one per session)

MediaRepresentationManager
  +-- switchRepresentation(sourceIndex, repId)
  +-- addRepresentation(sourceIndex, config)
  +-- removeRepresentation(sourceIndex, repId)
  +-- handleError(sourceIndex, repId) -> triggers fallback
  +-- getActiveRepresentation(sourceIndex) -> MediaRepresentation
  +-- events: representationChanged, representationError, fallbackActivated

RepresentationLoader (interface)
  +-- load(): Promise<BaseSourceNode>
  +-- dispose(): void

FileRepresentationLoader implements RepresentationLoader
VideoRepresentationLoader implements RepresentationLoader
SequenceRepresentationLoader implements RepresentationLoader
StreamRepresentationLoader implements RepresentationLoader  (future)
```

---

## Data Model

### New Types (`src/core/types/representation.ts`)

```ts
export type RepresentationKind = 'frames' | 'movie' | 'proxy' | 'streaming';
export type RepresentationStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RepresentationResolution {
  width: number;
  height: number;
}

export interface MediaRepresentation {
  /** Unique ID within the source (crypto.randomUUID()) */
  id: string;
  /** Human-readable label, e.g. "EXR Full (4096x2160)" */
  label: string;
  /** Kind determines loader strategy and UI icon */
  kind: RepresentationKind;
  /** Lower number = higher preference. 0 = full-res. */
  priority: number;
  /** Current lifecycle status */
  status: RepresentationStatus;
  /** Native resolution of this representation */
  resolution: RepresentationResolution;
  /** The loaded source node (null until status === 'ready') */
  sourceNode: import('../../nodes/sources/BaseSourceNode').BaseSourceNode | null;
  /** Error message if status === 'error' */
  errorInfo?: string;
  /** Loader configuration for lazy/re-loading */
  loaderConfig: RepresentationLoaderConfig;
}

/**
 * Serializable loader configuration.
 * The loader factory uses `kind` + these fields to construct the right loader.
 */
export interface RepresentationLoaderConfig {
  /** For file-based: the File object or path */
  file?: File;
  path?: string;
  /** For URL-based: the URL */
  url?: string;
  /** For sequences: the file list or glob pattern */
  files?: File[];
  pattern?: string;
  frameRange?: { start: number; end: number };
  /** FPS override */
  fps?: number;
}
```

### Extended `MediaSource`

The existing `MediaSource` interface gains three new fields:

```ts
interface MediaSource {
  // ... existing fields unchanged ...

  /** All available representations for this source. Empty array = legacy mode. */
  representations: MediaRepresentation[];

  /** Index into `representations` for the currently active one. -1 = legacy mode. */
  activeRepresentationIndex: number;
}
```

When `representations.length === 0`, the source behaves exactly as today (backward-compatible). The system initializes in legacy mode for sources loaded via existing APIs and only uses the representations array when the user explicitly adds alternatives or when a multi-representation project is loaded.

### Extended `MediaReference` for Serialization

```ts
interface MediaReference {
  // ... existing fields ...

  /** Serialized representations (omits runtime-only fields like sourceNode) */
  representations?: SerializedRepresentation[];
  /** Active representation ID */
  activeRepresentationId?: string;
}

interface SerializedRepresentation {
  id: string;
  label: string;
  kind: RepresentationKind;
  priority: number;
  resolution: RepresentationResolution;
  loaderConfig: Omit<RepresentationLoaderConfig, 'file' | 'files'> & {
    /** Path replaces File objects for serialization */
    path?: string;
    pattern?: string;
  };
}
```

---

## UI Design

### 1. Representation Switcher (Toolbar)

A new `RepresentationControl` component in the context toolbar (visible in the "View" tab).

**Collapsed state**: A small badge showing the active representation kind + resolution.

```
[ EXR 4K ]       -- when active representation is frames at 4096x2160
[ MOV HD ]        -- when active representation is movie at 1920x1080
[ PROXY SD ]      -- when proxy is active
[ STREAM ]        -- when streaming proxy is active
```

The badge color encodes status:
- Green border: full-res active
- Yellow border: proxy/fallback active
- Red border: all representations failed

**Expanded dropdown**: Clicking the badge opens a dropdown listing all representations:

```
+------------------------------------------+
| Representations                          |
+------------------------------------------+
| * EXR Full         4096x2160   [ready]   |
|   MOV Movie        1920x1080   [ready]   |
|   Proxy            960x540     [loading]  |
|   Stream           adaptive    [idle]     |
+------------------------------------------+
| + Add representation...                  |
+------------------------------------------+
```

Each row shows: radio selector, label, resolution, status icon. Clicking a row switches the active representation.

### 2. Resolution Badge (InfoPanel)

The existing `InfoPanel` (`src/ui/components/InfoPanel.ts`) already shows resolution. When MMR is active, it appends the representation label:

```
Resolution: 4096 x 2160 (EXR Full)
```

When a fallback is active, it shows:

```
Resolution: 960 x 540 (Proxy - fallback)
```

### 3. "Add Representation" Dialog

Triggered from the dropdown or from the file menu. A modal dialog lets the user:
1. Pick representation kind (frames, movie, proxy).
2. Select files via file picker.
3. The system auto-detects resolution and creates the representation.

### 4. Fallback Notification

When auto-fallback occurs, a transient toast notification appears:

```
"Full-res frames unavailable. Switched to proxy (960x540)."
```

This reuses the existing toast pattern (similar to unsupported codec modal in `src/handlers/unsupportedCodecModal.ts`).

---

## Implementation Steps

### Phase 1: Core Data Model and Manager (no UI)

**Step 1.1: Define types**
- Create `src/core/types/representation.ts` with all type definitions.

**Step 1.2: Create `MediaRepresentationManager`**
- Create `src/core/session/MediaRepresentationManager.ts`.
- Implements: `addRepresentation()`, `removeRepresentation()`, `switchRepresentation()`, `handleRepresentationError()`, `getActiveRepresentation()`.
- Extends `EventEmitter` with events: `representationChanged`, `representationError`, `fallbackActivated`.
- Holds no state itself -- operates on `MediaSource.representations` passed by reference.

**Step 1.3: Create `RepresentationLoader` interface and implementations**
- Create `src/core/session/loaders/RepresentationLoader.ts` (interface).
- Create `src/core/session/loaders/FileRepresentationLoader.ts` (wraps `FileSourceNode.loadFile()`).
- Create `src/core/session/loaders/VideoRepresentationLoader.ts` (wraps `VideoSourceNode.loadFile()`).
- Create `src/core/session/loaders/SequenceRepresentationLoader.ts` (wraps `SequenceSourceNode.loadFiles()`).
- Create `src/core/session/loaders/RepresentationLoaderFactory.ts` (factory function: `kind` -> loader).

**Step 1.4: Extend `MediaSource`**
- Add `representations: MediaRepresentation[]` and `activeRepresentationIndex: number` fields to the `MediaSource` interface.
- Default: `representations = []`, `activeRepresentationIndex = -1` (legacy mode).
- Existing code that reads `source.videoSourceNode`, `source.fileSourceNode`, etc. continues to work in legacy mode.

**Step 1.5: Integrate into `SessionMedia`**
- Instantiate `MediaRepresentationManager` in `SessionMedia`.
- Add `addRepresentationToSource(sourceIndex, config)` and `switchRepresentation(sourceIndex, repId)` public methods.
- When a representation becomes active, update the `MediaSource`'s top-level `videoSourceNode`/`fileSourceNode`/`element`/`width`/`height` fields so all existing rendering code (Viewer, FramePreloadManager, etc.) keeps working without changes. This is the **shim layer** that avoids modifying every consumer.
- Wire `handleRepresentationError` to trigger fallback.

**Step 1.6: Unit tests**
- Test `MediaRepresentationManager` in isolation: add/remove/switch/fallback.
- Test `RepresentationLoader` implementations with mock source nodes.
- Test backward compatibility: sources without representations behave identically.

### Phase 2: Viewer Integration

**Step 2.1: Representation-aware source switching**
- When `switchRepresentation()` changes the active node, it calls `source.videoSourceNode?.dispose()` on the old node (if different) and installs the new node. Then calls `session.emit('sourceLoaded', source)` to trigger the full re-initialization pipeline (`handleSourceLoaded` in `src/handlers/sourceLoadedHandlers.ts`).

**Step 2.2: Automatic fallback on error**
- In `VideoSourceNode.loadFile()` and `FileSourceNode.loadFile()`, catch errors and propagate to `MediaRepresentationManager.handleRepresentationError()`.
- In `Viewer.renderImage()`, detect null/error frames and trigger fallback via `session._media.representationManager`.
- Guard against fallback loops: if all representations are in error, stop and show the missing-frame overlay.

**Step 2.3: Cache and preload coordination**
- When switching representations, clear the frame cache (`VideoSourceNode.clearCache()`) and prerender buffer (`Viewer.initPrerenderBuffer()`).
- If the new representation is a `VideoSourceNode`, start preloading (`preloadFrames(currentFrame)`).
- Maintain the frame position across switches (the frame number does not reset).

### Phase 3: UI Components

**Step 3.1: Create `RepresentationControl`**
- Create `src/ui/components/RepresentationControl.ts`.
- Badge + dropdown pattern (similar to `CompareControl` or `StackControl`).
- Badge shows: kind icon + resolution shorthand + status color.
- Dropdown lists all representations with radio selection.
- "Add representation..." button at the bottom opens the add dialog.
- Events: `representationSelected`, `addRequested`.

**Step 3.2: Create `AddRepresentationDialog`**
- Create `src/ui/components/AddRepresentationDialog.ts`.
- Modal dialog (reuse `showPrompt`/`showAlert` pattern from `src/ui/components/shared/Modal.ts`).
- Fields: kind selector, file picker, optional label.
- On submit: calls `session.addRepresentationToSource(sourceIndex, config)`.

**Step 3.3: Wire into `AppControlRegistry`**
- Add `RepresentationControl` to the `ViewControlGroup` in `src/AppControlRegistry.ts`.
- Add it to the "View" tab content in `setupTabContents()`.

**Step 3.4: Wire into `AppSessionBridge`**
- Listen for `representationChanged` events from `SessionMedia`.
- Update `RepresentationControl` badge when the active representation changes.
- Show toast notification on fallback events.

**Step 3.5: Extend `InfoPanel`**
- When MMR is active, append the representation label to the resolution line.
- Show "(fallback)" suffix when a non-preferred representation is active.

**Step 3.6: HeaderBar integration**
- Add a "Representations" sub-menu under the file menu (or the "View" menu if one exists).
- Menu item: "Add Representation to Current Source..."
- Menu item: "Switch to Full-Res" / "Switch to Proxy" (shortcuts).

### Phase 4: Serialization

**Step 4.1: Extend `SessionState`**
- Add `representations` and `activeRepresentationId` to `MediaReference`.
- Bump `SESSION_STATE_VERSION` to 2 and add migration logic in `SessionSerializer.fromJSON()`.

**Step 4.2: Save representations**
- In `SessionSerializer.toJSON()`, serialize each source's representations (excluding `File` objects; use paths and `opfsCacheKey` instead).

**Step 4.3: Load representations**
- In `SessionSerializer.fromJSON()`, reconstruct representations from the saved config.
- For each representation, create the `RepresentationLoaderConfig` and add to the source.
- Representations with `requiresReload: true` start in `status: 'idle'` and load on-demand when activated.

### Phase 5: Keyboard Shortcuts and Polish

**Step 5.1: Keyboard shortcuts**
- `Shift+1` through `Shift+4`: Switch to representation 1-4 (if they exist).
- Register in `KeyboardActionMap` (`src/services/KeyboardActionMap.ts`).

**Step 5.2: OPFS cache integration**
- When a representation loads from a `File`, cache it in OPFS via `MediaCacheManager`.
- On re-open, check OPFS cache before prompting for file reload.

**Step 5.3: Network sync**
- Include `activeRepresentationId` in the network sync state (`SessionURLService`).
- When a peer switches representation, propagate to connected peers.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/core/types/representation.ts` | Type definitions for representations |
| `src/core/session/MediaRepresentationManager.ts` | Core manager: add/remove/switch/fallback |
| `src/core/session/MediaRepresentationManager.test.ts` | Unit tests for manager |
| `src/core/session/loaders/RepresentationLoader.ts` | Loader interface |
| `src/core/session/loaders/FileRepresentationLoader.ts` | FileSourceNode loader |
| `src/core/session/loaders/VideoRepresentationLoader.ts` | VideoSourceNode loader |
| `src/core/session/loaders/SequenceRepresentationLoader.ts` | SequenceSourceNode loader |
| `src/core/session/loaders/RepresentationLoaderFactory.ts` | Factory function |
| `src/core/session/loaders/RepresentationLoaderFactory.test.ts` | Loader factory tests |
| `src/ui/components/RepresentationControl.ts` | Toolbar badge + dropdown |
| `src/ui/components/RepresentationControl.test.ts` | UI component tests |
| `src/ui/components/AddRepresentationDialog.ts` | Modal dialog for adding representations |
| `src/ui/components/AddRepresentationDialog.test.ts` | Dialog tests |

## Files to Modify

| File | Changes |
|------|---------|
| `src/core/session/Session.ts` | Expose representation APIs (`addRepresentationToSource`, `switchRepresentation`, forward events) |
| `src/core/session/SessionMedia.ts` | Instantiate `MediaRepresentationManager`, add `addRepresentationToSource()`, `switchRepresentation()`, shim active node onto `MediaSource` fields |
| `src/core/session/Session.ts` (MediaSource interface) | Add `representations`, `activeRepresentationIndex` fields |
| `src/core/session/SessionState.ts` | Add `SerializedRepresentation`, extend `MediaReference` |
| `src/core/session/SessionSerializer.ts` | Serialize/deserialize representations, version migration |
| `src/core/types/session.ts` | (Potentially) no changes needed if types live in `representation.ts` |
| `src/handlers/sourceLoadedHandlers.ts` | Handle representation changes (HDR auto-config, scopes, OCIO) |
| `src/ui/components/InfoPanel.ts` | Show representation label + fallback status |
| `src/AppControlRegistry.ts` | Register `RepresentationControl` |
| `src/AppSessionBridge.ts` | Wire `representationChanged` events, toast notifications |
| `src/services/KeyboardActionMap.ts` | Add Shift+1..4 shortcuts for representation switching |
| `src/services/SessionURLService.ts` | Include `activeRepresentationId` in URL state |
| `src/AppNetworkBridge.ts` | Sync representation changes across peers |
| `src/nodes/sources/BaseSourceNode.ts` | (No changes -- representations wrap existing nodes) |
| `src/ui/components/layout/HeaderBar.ts` | Add "Representations" menu items |

---

## Risks

### 1. Shim Layer Fragility

**Risk**: The shim that copies the active representation's `sourceNode` onto `MediaSource.videoSourceNode`/`fileSourceNode`/`element` is the critical backward-compatibility bridge. If any consumer reads a field before the shim updates it, stale state could cause rendering glitches.

**Mitigation**: The shim update is synchronous and happens inside `switchRepresentation()` before emitting `sourceLoaded`. All consumers react to `sourceLoaded`, so they will see the updated fields. Add integration tests that switch representations mid-playback and verify frame output.

### 2. Memory Pressure from Multiple Loaded Representations

**Risk**: If all representations are loaded simultaneously (e.g. a 4K EXR sequence + a 1080p proxy video), memory usage doubles.

**Mitigation**: Only the active representation's source node is loaded. Idle representations stay in `status: 'idle'` with `sourceNode: null`. When switching, the old representation is disposed (unless it is the primary/fallback). A user preference can control whether the fallback representation stays warm.

### 3. Frame Position Drift

**Risk**: Different representations may have slightly different frame counts or timing (e.g. a video at 23.976 fps vs. frames at 24 fps). Switching could land on the wrong frame.

**Mitigation**: The manager preserves the current frame number. If the new representation has fewer frames, clamp to the last frame. If frame rates differ, use the session's fps (not the representation's internal fps) to maintain playback timing. Document the limitation: sub-frame drift is possible when representations have different fps.

### 4. Streaming Representation Complexity

**Risk**: The plan includes a `streaming` kind as a future extension. HLS/DASH adaptive streaming requires an entirely different loading pipeline (MSE, adaptive bitrate logic). Building the interface too early may constrain the design.

**Mitigation**: The `streaming` kind is defined in the enum but no loader is implemented in this plan. The `RepresentationLoader` interface is intentionally minimal (`load(): Promise<BaseSourceNode>`, `dispose(): void`) so it can accommodate a future `StreamSourceNode` without breaking changes.

### 5. Serialization Forward-Compatibility

**Risk**: Adding `representations` to `MediaReference` changes the project file format. Older versions of openrv-web cannot open projects saved with representations.

**Mitigation**: Representations are stored in an optional field. Older versions that do not recognize the field will ignore it and load the primary source normally. The `SESSION_STATE_VERSION` bump enables explicit migration. Add a version check warning in the loader.

### 6. UI Complexity for Single-Source Users

**Risk**: Most users load a single file and never need representations. The extra UI element adds visual clutter.

**Mitigation**: The `RepresentationControl` badge is hidden when the current source has zero or one representation. It only appears when the user explicitly adds a second representation or loads a multi-representation project. The feature is fully opt-in from the UI perspective.

### 7. HDR Pipeline Interaction

**Risk**: The HDR auto-configuration logic in `sourceLoadedHandlers.ts` makes decisions based on `source.fileSourceNode?.isHDR()` and `source.videoSourceNode?.isHDR()`. Switching from an HDR full-res representation to an SDR proxy must properly reset the tone mapping, gamma, and scopes state.

**Mitigation**: The shim layer ensures `handleSourceLoaded` is called after every representation switch, which already handles HDR/SDR transitions (the `maybeResetAutoHDROverridesForSDR` path). Add specific tests: switch from HDR EXR to SDR proxy, verify tone mapping is reset.

### 8. A/B Compare with Representations

**Risk**: The A/B compare feature (`ComparisonManager`, `ABCompareManager`) operates on source indices. When source A has multiple representations and source B has a different set, the user may want to compare A's full-res vs. B's proxy.

**Mitigation**: Representations are per-source. A/B compare continues to compare source A vs. source B at whatever representation each has active. Cross-source representation comparison is a future enhancement beyond this plan's scope.

---

## Testing Strategy

1. **Unit tests** for `MediaRepresentationManager`: add/remove/switch/fallback/error handling, event emission, priority ordering.
2. **Unit tests** for each `RepresentationLoader`: mock the underlying source node, verify load/dispose lifecycle.
3. **Integration tests** for `SessionMedia` with representations: load a source, add a representation, switch, verify `currentSource` fields are updated.
4. **Serialization round-trip tests**: save a session with representations, reload, verify all representations are restored.
5. **UI component tests** for `RepresentationControl`: rendering, click handling, badge updates.
6. **Backward compatibility tests**: load an existing project file (no representations), verify everything works unchanged.
7. **HDR transition tests**: switch between HDR and SDR representations, verify auto-config behavior.
8. **Playback continuity tests**: switch representations mid-playback, verify frame position is preserved and playback resumes.
