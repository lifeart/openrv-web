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
7. Per-representation OCIO color space resolution ensures correct color management when switching between HDR and SDR representations.
8. Audio is properly torn down and re-initialized when switching between representations with and without audio tracks.
9. Timecode/start-frame offsets are respected so switching between representations lands on the correct content frame.

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

**Note on `MediaManager.ts`:** The codebase also contains `src/core/session/MediaManager.ts`, which has overlapping responsibilities with `SessionMedia.ts` (it also imports `VideoSourceNode`, `FileSourceNode`, and defines a `MediaManagerHost` interface). Before implementation, clarify whether `MediaManager.ts` is deprecated or actively used alongside `SessionMedia.ts`. The shim layer (described below) must be applied consistently to whichever module is the authoritative source manager. If both are active, both must be updated.

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

### OCIO Color Space Detection

The `sourceLoadedHandlers.ts` file performs per-source OCIO color space detection using `source.name` as the source ID:

```typescript
const sourceId = source.name || `source_${session.currentSourceIndex}`;
const persistedColorSpace = processor.getSourceInputColorSpace(sourceId);
processor.setActiveSource(sourceId);
```

This means all representations sharing the same `MediaSource.name` would currently share the same OCIO input color space assignment. However, an EXR (ACEScg/scene-linear) and a proxy MOV (Rec.709) need DIFFERENT input color spaces. The implementation must use a per-representation OCIO source ID (e.g., `${source.name}::${representation.id}`) to avoid applying the wrong input transform.

---

## Proposed Architecture

### Core Concept: `MediaRepresentation`

Each `MediaSource` gains a `representations` array of `MediaRepresentation` objects. One is marked `active`. The `MediaRepresentationManager` handles switching, fallback, and lifecycle.

Note: A `MediaSource` with representations is architecturally equivalent to desktop OpenRV's "SourceGroup" concept. Each `MediaSource` acts as a source group containing multiple source nodes as alternative representations.

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
  +-- par?: number                    // pixel aspect ratio (1.0 = square pixels)
  +-- sourceNode: BaseSourceNode | null
  +-- loader: RepresentationLoader    // strategy object
  +-- errorInfo?: string
  +-- colorSpace?: { transferFunction, colorPrimaries }
  +-- audioTrackPresent: boolean      // whether this representation has audio
  +-- startFrame: number              // timecode offset (e.g. 1001 for EXR, 0 for proxy)
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

**User-initiated vs. system-initiated fallback:** When the user explicitly clicks a representation in the dropdown and it fails to load, the system must NOT silently fall back to a lower-priority representation. Instead, it should show an error notification with a "Retry" button and keep the current representation active. Silent auto-fallback is only used for system-initiated switches (initial load, auto-switch-on-pause).

### Class Diagram

```
Session
  +-- SessionMedia
        +-- _sources: MediaSource[]
              +-- representations: MediaRepresentation[]
              +-- activeRepresentationIndex: number
        +-- representationManager: MediaRepresentationManager  (one per session)

MediaRepresentationManager
  +-- switchRepresentation(sourceIndex, repId, options?: { userInitiated: boolean })
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
  /** Pixel aspect ratio (1.0 = square pixels; != 1.0 for anamorphic) */
  par: number;
  /** The loaded source node (null until status === 'ready') */
  sourceNode: import('../../nodes/sources/BaseSourceNode').BaseSourceNode | null;
  /** Error message if status === 'error' */
  errorInfo?: string;
  /** Loader configuration for lazy/re-loading */
  loaderConfig: RepresentationLoaderConfig;
  /** Whether this representation has an audio track */
  audioTrackPresent: boolean;
  /**
   * Start frame / timecode offset for this representation.
   * EXR sequences often start at frame 1001 (editorial convention)
   * while proxy MOVs start at frame 0. Used for frame-accurate switching.
   */
  startFrame: number;
  /**
   * Color space metadata for this representation.
   * Avoids re-detection on switch and enables correct OCIO input transform.
   */
  colorSpace?: {
    /** e.g. 'sRGB', 'PQ', 'HLG', 'linear' */
    transferFunction?: string;
    /** e.g. 'bt709', 'bt2020', 'aces' */
    colorPrimaries?: string;
  };
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
  /** OPFS cache key for resilience against File reference invalidation */
  opfsCacheKey?: string;
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
  par: number;
  audioTrackPresent: boolean;
  startFrame: number;
  colorSpace?: {
    transferFunction?: string;
    colorPrimaries?: string;
  };
  loaderConfig: Omit<RepresentationLoaderConfig, 'file' | 'files'> & {
    /** Path replaces File objects for serialization */
    path?: string;
    pattern?: string;
    opfsCacheKey?: string;
  };
}
```

---

## UI Design

### 1. Representation Switcher (Toolbar)

A new `RepresentationControl` component in the context toolbar (visible in the "View" tab).

**Collapsed state**: A small badge showing the active representation kind + resolution.

```
[ EXR 4096x2160 ]   -- when active representation is frames at 4096x2160
[ MOV 1920x1080 ]    -- when active representation is movie at 1920x1080
[ PROXY 960x540 ]    -- when proxy is active
[ STREAM ]           -- when streaming proxy is active
```

The badge includes a tooltip with the full label (e.g. "EXR Full Resolution - 4096x2160 - ACEScg/linear"). Badge color encodes status:
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
| [ ] Auto-switch to full-res on pause     |
+------------------------------------------+
| + Add representation...                  |
+------------------------------------------+
```

Each row shows: radio selector, label, resolution, status icon. Clicking a row switches the active representation.

The "Auto-switch to full-res on pause" toggle enables the workflow where the viewer plays back using the proxy representation and automatically switches to full-res when playback pauses (for pixel inspection). This is a core VFX review workflow.

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

Triggered from the dropdown or from the file menu. To stay consistent with the existing drag-and-drop loading flow and the pattern used by `CompareControl`/`ChannelSelect` (which operate within dropdowns without modal dialogs), prefer a lightweight approach:

1. Clicking "Add representation..." opens a file picker directly.
2. The system auto-detects the kind from file type (video file = `movie`, single image = `frames`, image sequence = `frames`).
3. The label is auto-generated from filename and resolution.
4. A confirmation toast appears: "Added representation: MOV 1920x1080".

If the auto-detected kind is ambiguous or the user needs to override it (e.g., marking a low-res video as `proxy` rather than `movie`), a brief inline UI within the dropdown can offer a kind override before confirming.

### 4. Fallback Notification

When auto-fallback occurs (system-initiated), a transient toast notification appears:

```
"Full-res frames unavailable. Switched to proxy (960x540)."
```

When a user-initiated switch fails, an error notification with a "Retry" button appears:

```
"Failed to load EXR Full (4096x2160): decode error. [Retry] [Dismiss]"
```

This reuses the existing toast pattern (similar to unsupported codec modal in `src/handlers/unsupportedCodecModal.ts`).

### 5. Viewer Loading State During Representation Switch

When the user switches representations and the new one enters `status: 'loading'`, the Viewer must:
1. **Hold the last rendered frame** from the previous representation (do NOT blank the canvas).
2. Display a **small spinner overlay** in the corner (not a full-screen overlay) to indicate loading.
3. Once the new representation reaches `status: 'ready'`, render its first frame and remove the spinner.

This ensures the "scrub in proxy, spot-check in full-res" workflow is visually seamless.

---

## Implementation Steps

### Phase 1: Core Data Model and Manager (no UI)

**Step 1.1: Define types**
- Create `src/core/types/representation.ts` with all type definitions.
- Include `par`, `audioTrackPresent`, `startFrame`, and `colorSpace` fields in `MediaRepresentation`.

**Step 1.2: Create `MediaRepresentationManager`**
- Create `src/core/session/MediaRepresentationManager.ts`.
- Implements: `addRepresentation()`, `removeRepresentation()`, `switchRepresentation(sourceIndex, repId, options?)`, `handleRepresentationError()`, `getActiveRepresentation()`.
- `switchRepresentation` accepts an `options` parameter with `userInitiated: boolean` to distinguish user-initiated switches from system-initiated fallback. When `userInitiated: true` and loading fails, show an error and stay on the current representation rather than auto-falling back.
- Extends `EventEmitter` with events: `representationChanged`, `representationError`, `fallbackActivated`.
- Holds no state itself -- operates on `MediaSource.representations` passed by reference.
- Frame mapping logic: when switching representations, convert the current frame position using `startFrame` offsets. For example, if the current representation is at frame 50 with `startFrame: 1001` (absolute frame 1051), and the target representation has `startFrame: 0`, the target frame is `1051 - 0 = 1051` or clamped if out of range.

**Step 1.3: Create `RepresentationLoader` interface and implementations**
- Create `src/core/session/loaders/RepresentationLoader.ts` (interface).
- Create `src/core/session/loaders/FileRepresentationLoader.ts` (wraps `FileSourceNode.loadFile()`).
- Create `src/core/session/loaders/VideoRepresentationLoader.ts` (wraps `VideoSourceNode.loadFile()`).
- Create `src/core/session/loaders/SequenceRepresentationLoader.ts` (wraps `SequenceSourceNode.loadFiles()`).
- Create `src/core/session/loaders/RepresentationLoaderFactory.ts` (factory function: `kind` -> loader).
- Each loader should populate `audioTrackPresent`, `colorSpace`, `par`, and `startFrame` on the representation after loading completes.

**Step 1.4: Extend `MediaSource`**
- Add `representations: MediaRepresentation[]` and `activeRepresentationIndex: number` fields to the `MediaSource` interface.
- Default: `representations = []`, `activeRepresentationIndex = -1` (legacy mode).
- Existing code that reads `source.videoSourceNode`, `source.fileSourceNode`, etc. continues to work in legacy mode.

**Step 1.5: Integrate into `SessionMedia` (and `MediaManager` if applicable)**
- Investigate `MediaManager.ts` vs. `SessionMedia.ts` to determine which is authoritative. Apply changes to the correct module (or both if both are active).
- Instantiate `MediaRepresentationManager` in `SessionMedia`.
- Add `addRepresentationToSource(sourceIndex, config)` and `switchRepresentation(sourceIndex, repId)` public methods.
- When a representation becomes active, update the `MediaSource`'s top-level `videoSourceNode`/`fileSourceNode`/`element`/`width`/`height` fields so all existing rendering code (Viewer, FramePreloadManager, etc.) keeps working without changes. This is the **shim layer** that avoids modifying every consumer.
- The shim must also update `parState` (pixel aspect ratio) when switching between representations with different PAR values (e.g., anamorphic full-res vs. square-pixel proxy).
- Wire `handleRepresentationError` to trigger fallback.
- **Guard against playback timing races**: `PlaybackEngine.ts` and `SessionPlayback.ts` read `source.videoSourceNode` on timer callbacks, not just on events. The shim update must be atomic with respect to the playback tick -- pause playback before switching, update the shim, then resume. Alternatively, add a null-check guard in the playback engine's timer callback.

**Step 1.6: Unit tests**
- Test `MediaRepresentationManager` in isolation: add/remove/switch/fallback.
- Test `RepresentationLoader` implementations with mock source nodes.
- Test backward compatibility: sources without representations behave identically.
- Test frame mapping with different `startFrame` offsets.
- Test user-initiated vs. system-initiated fallback behavior.

### Phase 2: Viewer Integration

**Step 2.1: Representation-aware source switching**
- When `switchRepresentation()` changes the active node, it calls `source.videoSourceNode?.dispose()` on the old node (if different) and installs the new node. Then calls `session.emit('sourceLoaded', source)` to trigger the full re-initialization pipeline (`handleSourceLoaded` in `src/handlers/sourceLoadedHandlers.ts`).
- **During loading**: The Viewer must hold the last rendered frame from the previous representation. Display a small spinner overlay in the corner. Do NOT blank the canvas.
- **Audio coordination**: When switching from a video representation (has audio, `audioTrackPresent: true`) to a frames representation (no audio), explicitly call `AudioCoordinator.stop()` or equivalent to tear down the audio pipeline. When switching to a different video representation, re-initialize audio from the new video element. Check `representation.audioTrackPresent` before attempting audio setup.

**Step 2.2: Per-representation OCIO source ID**
- Modify `sourceLoadedHandlers.ts` to use a per-representation OCIO source ID: `${source.name}::${representation.id}` instead of just `source.name`.
- When OCIO is active and the user switches representations, the input color space must be resolved for the new representation independently.
- If the representation carries `colorSpace` metadata, use it to set the OCIO input transform directly (avoiding re-detection overhead).

**Step 2.3: Automatic fallback on error**
- In `VideoSourceNode.loadFile()` and `FileSourceNode.loadFile()`, catch errors and propagate to `MediaRepresentationManager.handleRepresentationError()`.
- In `Viewer.renderImage()`, detect null/error frames and trigger fallback via `session._media.representationManager`.
- Guard against fallback loops: if all representations are in error, stop and show the missing-frame overlay.

**Step 2.4: Cache and preload coordination**
- When switching representations, clear the frame cache (`VideoSourceNode.clearCache()`) and prerender buffer (`Viewer.initPrerenderBuffer()`).
- If the new representation is a `VideoSourceNode`, start preloading (`preloadFrames(currentFrame)`).
- Maintain the frame position across switches using `startFrame` offsets (the content-relative frame does not change, but the media-relative frame may differ).

**Step 2.5: Auto-switch on pause**
- Implement a "auto-switch on pause" mode: when enabled, the system plays back using the lowest-priority ready representation (typically the proxy) and automatically switches to the highest-priority representation (full-res) when playback pauses.
- This is controlled by a per-source toggle, stored on the `MediaSource` and exposed in the `RepresentationControl` dropdown.
- Listen for the playback `pause` event in `SessionPlayback` or `PlaybackEngine`. On pause, if auto-switch is enabled and the active representation is not the highest-priority, trigger `switchRepresentation()` to the highest-priority ready representation.
- On play resume, switch back to the proxy representation for smooth real-time playback.

### Phase 3: UI Components

**Step 3.1: Create `RepresentationControl`**
- Create `src/ui/components/RepresentationControl.ts`.
- Badge + dropdown pattern (similar to `CompareControl` or `StackControl`).
- Badge shows: kind icon + full resolution (e.g. "EXR 4096x2160") + status color. Include tooltip with full label.
- Dropdown lists all representations with radio selection.
- "Auto-switch to full-res on pause" toggle in the dropdown.
- "Add representation..." button at the bottom opens the file picker.
- Events: `representationSelected`, `addRequested`.

**Step 3.2: Wire "Add Representation" flow**
- Clicking "Add representation..." opens a file picker directly (no modal dialog).
- Auto-detect the kind from file type (video = `movie`, single image = `frames`, image sequence = `frames`).
- Auto-generate the label from filename and detected resolution.
- Show a confirmation toast on success.
- If kind override is needed, offer a brief inline selector within the dropdown before confirming.

**Step 3.3: Wire into `AppControlRegistry`**
- Add `RepresentationControl` to the `ViewControlGroup` in `src/AppControlRegistry.ts`.
- Add it to the "View" tab content in `setupTabContents()`.

**Step 3.4: Wire into `AppSessionBridge`**
- Listen for `representationChanged` events from `SessionMedia`.
- Update `RepresentationControl` badge when the active representation changes.
- Show toast notification on system-initiated fallback events.
- Show error notification with "Retry" button on user-initiated switch failures.

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
- Include `par`, `audioTrackPresent`, `startFrame`, and `colorSpace` in `SerializedRepresentation`.
- Bump `SESSION_STATE_VERSION` to 2 and add migration logic in `SessionSerializer.fromJSON()`.

**Step 4.2: Save representations**
- In `SessionSerializer.toJSON()`, serialize each source's representations (excluding `File` objects; use paths, `opfsCacheKey`, and `pattern` instead).

**Step 4.3: Load representations**
- In `SessionSerializer.fromJSON()`, reconstruct representations from the saved config.
- For each representation, create the `RepresentationLoaderConfig` and add to the source.
- Representations with `requiresReload: true` start in `status: 'idle'` and load on-demand when activated.

**Step 4.4: Undo/redo integration**
- Adding, removing, and switching representations are user actions that should be recorded in the `HistoryManager` (referenced in `KeyboardActionMap.ts` via `getGlobalHistoryManager`).
- Each operation creates an undoable history entry so the user can undo/redo representation changes.

### Phase 5: Keyboard Shortcuts and Polish

**Step 5.1: Keyboard shortcuts**
- `Shift+1` through `Shift+4`: Switch to representation 1-4 (if they exist).
- Register in `KeyboardActionMap` (`src/services/KeyboardActionMap.ts`).
- **Important**: Use `event.code` (`Digit1`-`Digit4`) rather than `event.key` to avoid locale-dependent issues (`Shift+1` produces `!` on US keyboards, different characters on other layouts). Verify this is consistent with the existing key registration pattern.

**Step 5.2: OPFS cache integration**
- When a representation loads from a `File`, cache it in OPFS via `MediaCacheManager`.
- On re-open, check OPFS cache before prompting for file reload.
- The `RepresentationLoaderConfig` should always carry `opfsCacheKey` alongside `file` for resilience against `File` reference invalidation or blob URL revocation within a session.

**Step 5.3: Network sync**
- Include `activeRepresentationId` in the network sync state (`SessionURLService`).
- When a peer switches representation, propagate to connected peers.

### Phase 6: Future Extensions (out of scope for v1)

**Step 6.1: GTO session file integration**
- Desktop `.rv` session files (GTO format) can contain source groups with multiple media. The existing `GTOGraphLoader` and `SessionGraph` modules should be extended to map GTO source groups to the `MediaSource.representations` array when loading `.rv` files.

**Step 6.2: Per-representation "look" / LUT overrides**
- In some pipelines, a representation carries not just different media but also a different color pipeline (e.g., a "dailies look" LUT baked into the proxy). Desktop OpenRV allows per-representation OCIO config overrides. A future iteration could add per-representation LUT metadata.

**Step 6.3: Shot management system integration**
- Integration with ShotGrid, ftrack, Kitsu, or similar systems to auto-populate representations from a shot's published outputs. Also, batch-add from file-system naming conventions (e.g., `/full/SHOT_0010.####.exr` paired with `/proxy/SHOT_0010_proxy.mov`).

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

## Files to Modify

| File | Changes |
|------|---------|
| `src/core/session/Session.ts` | Expose representation APIs (`addRepresentationToSource`, `switchRepresentation`, forward events) |
| `src/core/session/SessionMedia.ts` | Instantiate `MediaRepresentationManager`, add `addRepresentationToSource()`, `switchRepresentation()`, shim active node onto `MediaSource` fields including PAR |
| `src/core/session/MediaManager.ts` | Apply shim layer if this module is actively used alongside `SessionMedia.ts` |
| `src/core/session/Session.ts` (MediaSource interface) | Add `representations`, `activeRepresentationIndex` fields |
| `src/core/session/SessionState.ts` | Add `SerializedRepresentation`, extend `MediaReference` |
| `src/core/session/SessionSerializer.ts` | Serialize/deserialize representations, version migration |
| `src/core/types/session.ts` | (Potentially) no changes needed if types live in `representation.ts` |
| `src/handlers/sourceLoadedHandlers.ts` | Handle representation changes (HDR auto-config, scopes, OCIO); use per-representation OCIO source ID (`${source.name}::${rep.id}`) |
| `src/ui/components/InfoPanel.ts` | Show representation label + fallback status |
| `src/AppControlRegistry.ts` | Register `RepresentationControl` |
| `src/AppSessionBridge.ts` | Wire `representationChanged` events, toast notifications, error notifications with retry |
| `src/services/KeyboardActionMap.ts` | Add Shift+1..4 shortcuts for representation switching (use `event.code`) |
| `src/services/SessionURLService.ts` | Include `activeRepresentationId` in URL state |
| `src/AppNetworkBridge.ts` | Sync representation changes across peers |
| `src/nodes/sources/BaseSourceNode.ts` | (No changes -- representations wrap existing nodes) |
| `src/ui/components/layout/HeaderBar.ts` | Add "Representations" menu items |
| `src/ui/components/Viewer.ts` | Hold last frame during representation loading; show spinner overlay |
| `src/core/session/SessionPlayback.ts` | Auto-switch on pause logic; guard against null sourceNode during switch |
| `src/core/session/PlaybackEngine.ts` | Null-check guard for `source.videoSourceNode` on timer callbacks during representation switch |
| `src/audio/AudioOrchestrator.ts` | Handle audio teardown when switching from video to non-video representation |

---

## Risks

### 1. Shim Layer Fragility

**Risk**: The shim that copies the active representation's `sourceNode` onto `MediaSource.videoSourceNode`/`fileSourceNode`/`element` is the critical backward-compatibility bridge. If any consumer reads a field before the shim updates it, stale state could cause rendering glitches.

**Mitigation**: The shim update is synchronous and happens inside `switchRepresentation()` before emitting `sourceLoaded`. All consumers react to `sourceLoaded`, so they will see the updated fields. However, `PlaybackEngine` and `SessionPlayback` also read the source on timer callbacks (not just on events). Pause playback before switching, update the shim, then resume -- or add null-check guards in the playback engine's timer callback. Add integration tests that switch representations mid-playback and verify frame output.

### 2. Memory Pressure from Multiple Loaded Representations

**Risk**: If all representations are loaded simultaneously (e.g. a 4K EXR sequence + a 1080p proxy video), memory usage doubles.

**Mitigation**: Only the active representation's source node is loaded. Idle representations stay in `status: 'idle'` with `sourceNode: null`. When switching, the old representation is disposed (unless it is the primary/fallback). A user preference can control whether the fallback representation stays warm.

### 3. Frame Position Drift and Timecode Offsets

**Risk**: Different representations may have different frame counts, timing (e.g. 23.976 fps vs. 24 fps), or starting frame numbers (EXR at frame 1001 vs. proxy at frame 0). Switching could land on the wrong frame.

**Mitigation**: Each representation carries a `startFrame` offset. The manager converts between representations using absolute frame numbers: `absoluteFrame = currentFrame + activeRep.startFrame`, then `targetFrame = absoluteFrame - targetRep.startFrame`. If the target frame is out of range, clamp to the valid range. On representation switch, the session fps policy is: keep the session fps unchanged (set by the first source loaded), and map frames accordingly. Document the limitation: sub-frame drift is possible when representations have different fps, but frame content alignment is maintained via `startFrame` offsets.

### 4. Streaming Representation Complexity

**Risk**: The plan includes a `streaming` kind as a future extension. HLS/DASH adaptive streaming requires an entirely different loading pipeline (MSE, adaptive bitrate logic). Building the interface too early may constrain the design.

**Mitigation**: The `streaming` kind is defined in the enum but no loader is implemented in this plan. The `RepresentationLoader` interface is intentionally minimal (`load(): Promise<BaseSourceNode>`, `dispose(): void`) so it can accommodate a future `StreamSourceNode` without breaking changes.

### 5. Serialization Forward-Compatibility

**Risk**: Adding `representations` to `MediaReference` changes the project file format. Older versions of openrv-web cannot open projects saved with representations.

**Mitigation**: Representations are stored in an optional field. Older versions that do not recognize the field will ignore it and load the primary source normally. The `SESSION_STATE_VERSION` bump enables explicit migration. Add a version check warning in the loader.

### 6. UI Complexity for Single-Source Users

**Risk**: Most users load a single file and never need representations. The extra UI element adds visual clutter.

**Mitigation**: The `RepresentationControl` badge is hidden when the current source has zero or one representation. It only appears when the user explicitly adds a second representation or loads a multi-representation project. The feature is fully opt-in from the UI perspective.

### 7. HDR Pipeline and OCIO Interaction

**Risk**: The HDR auto-configuration logic in `sourceLoadedHandlers.ts` makes decisions based on `source.fileSourceNode?.isHDR()` and `source.videoSourceNode?.isHDR()`. Switching from an HDR full-res representation to an SDR proxy must properly reset the tone mapping, gamma, and scopes state. Furthermore, OCIO input color space is currently resolved per-source using `source.name`, meaning all representations would incorrectly share the same input transform.

**Mitigation**: The shim layer ensures `handleSourceLoaded` is called after every representation switch, which already handles HDR/SDR transitions (the `maybeResetAutoHDROverridesForSDR` path). The OCIO source ID is changed to `${source.name}::${representation.id}` so each representation gets its own input color space assignment. If the representation carries `colorSpace` metadata, use it to set the OCIO input transform directly. Add specific tests: switch from HDR EXR to SDR proxy, verify tone mapping is reset and OCIO input transform is correct.

### 8. A/B Compare with Representations

**Risk**: The A/B compare feature (`ComparisonManager`, `ABCompareManager`) operates on source indices. When source A has multiple representations and source B has a different set, the user may want to compare A's full-res vs. B's proxy.

**Mitigation**: Representations are per-source. A/B compare continues to compare source A vs. source B at whatever representation each has active. Cross-source representation comparison is a future enhancement beyond this plan's scope.

### 9. Audio Pipeline Disruption

**Risk**: Switching from a video representation (has audio) to a frames representation (no audio) without explicitly tearing down the audio pipeline will cause audible glitches or errors in `AudioOrchestrator.ts`, which reads the video element for audio synchronization.

**Mitigation**: Each representation carries an `audioTrackPresent` flag. When switching representations, the manager checks this flag. If switching away from a representation with audio, explicitly call `AudioCoordinator.stop()` before disposing the old node. If switching to a representation with audio, re-initialize audio from the new video element after the source node is ready. This is handled as part of the `handleSourceLoaded` pipeline.

### 10. Aspect Ratio / PAR Changes

**Risk**: A full-res anamorphic EXR at 4096x1716 with PAR != 1.0 paired with a square-pixel proxy at 1920x1080 has different pixel aspect ratios. Switching representations would cause framing jumps if PAR state is not updated.

**Mitigation**: Each representation carries a `par` field. The shim layer updates `parState` on the `MediaSource` when switching representations. Crop regions and uncrop padding are re-evaluated as part of the `handleSourceLoaded` pipeline.

---

## Testing Strategy

1. **Unit tests** for `MediaRepresentationManager`: add/remove/switch/fallback/error handling, event emission, priority ordering, user-initiated vs. system-initiated fallback distinction.
2. **Unit tests** for each `RepresentationLoader`: mock the underlying source node, verify load/dispose lifecycle, verify metadata population (`audioTrackPresent`, `colorSpace`, `par`, `startFrame`).
3. **Integration tests** for `SessionMedia` with representations: load a source, add a representation, switch, verify `currentSource` fields are updated (including PAR).
4. **Serialization round-trip tests**: save a session with representations, reload, verify all representations are restored including new fields (`par`, `startFrame`, `colorSpace`, `audioTrackPresent`).
5. **UI component tests** for `RepresentationControl`: rendering, click handling, badge updates, auto-switch toggle.
6. **Backward compatibility tests**: load an existing project file (no representations), verify everything works unchanged.
7. **HDR transition tests**: switch between HDR and SDR representations, verify auto-config behavior and OCIO input transform correctness.
8. **Playback continuity tests**: switch representations mid-playback, verify frame position is preserved (accounting for `startFrame` offsets) and playback resumes.
9. **Audio transition tests**: switch from video representation (with audio) to frames representation (no audio), verify audio is cleanly torn down. Switch back, verify audio is re-initialized.
10. **Frame mapping tests**: switch between representations with different `startFrame` offsets (e.g., 1001 vs. 0), verify correct content frame is displayed.
11. **Playback engine safety tests**: verify that timer callbacks in `PlaybackEngine` and `SessionPlayback` handle null/changing `videoSourceNode` gracefully during a representation switch.

---

## Review Notes

The following items from the expert review are deferred as "nice to have" polish and future-proofing improvements. They are not required for the initial implementation but should be considered for subsequent iterations.

1. **Auto-detect representation pairing from filenames.** When a user drops multiple files, auto-detect if they are different representations of the same shot (e.g., `shot_0010.####.exr` and `shot_0010_proxy.mov`). This can use the existing `parseShotVersion()` logic from `VersionManager.ts` as a starting point, extended for proxy naming conventions.

2. **Cache eviction policy for representations.** Specify that proxy representations have lower OPFS cache priority than full-res representations, since proxies are cheaper to re-generate. The current `MediaCacheManager` caches entire files keyed by content hash; representations for the same shot are different files, so OPFS storage could grow significantly.

3. **"Warm standby" for fallback representation.** Instead of fully disposing the previous representation's source node on switch, keep the fallback representation's decoder initialized (but release its frame cache). This reduces switch-back latency from hundreds of milliseconds to near-instant, which matters for the "scrub in proxy, check in full-res, back to proxy" workflow. Note: `VideoSourceNode` disposal (clearing mediabunny frame extractor, preload manager, HDR frame cache, resizer) is expensive, and WebCodecs decoder initialization alone takes 50-200ms.

4. **Per-representation annotations.** Desktop OpenRV allows annotations to be tied to specific representations (e.g., "this note applies to the full-res render"). Annotation scoping is out of scope for v1 but should be noted for the future.

5. **Drag-and-drop representation detection.** When a user drags and drops a second file onto the Viewer, the system could detect whether it should be added as a new source or as a representation for the existing source (by matching shot name). This requires heuristics and is deferred.

6. **First-encounter onboarding.** When a user adds a second representation for the first time, a brief contextual tooltip or onboarding hint could explain what representations are and how switching works.

7. **Right-click context menu entry.** The right-click context menu on the Viewer (if one exists) would be a natural additional entry point for "Add Representation" for advanced users.
