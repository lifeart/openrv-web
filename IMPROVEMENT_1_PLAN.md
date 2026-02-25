# Improvement Plan 1: Refactor the Session God Object

## Problem Statement

`Session.ts` (2,450 lines) serves as the central god object for the entire application. While partial decomposition has already occurred (PlaybackEngine, MediaManager, MarkerManager, NoteManager, VersionManager, StatusManager, VolumeManager, ABCompareManager, AnnotationStore), Session still:

1. **Acts as a pass-through facade for 100+ public methods** -- most methods on Session simply delegate to an internal manager (e.g., `toggleMark()` calls `this._markerManager.toggleMark()`). This creates a massive surface area that every consumer must import Session to access.

2. **Duplicates code between Session and MediaManager** -- Media loading methods (`loadFile`, `loadImage`, `loadVideo`, `loadVideoFile`, `loadImageFile`, `loadEXRFile`, `loadSequence`) exist in both Session.ts and MediaManager.ts with near-identical implementations but subtle differences (Session versions include `this._gtoData = null`, `this._audioCoordinator.loadFromVideo()`, and direct state mutations).

3. **Owns too many unrelated concerns** -- Session directly manages: playback delegation, media sources, GTO parsing/loading, EDL loading, node graph, property resolution, A/B compare, video frame caching, audio coordination, metadata, uncrop state, and backward-compatibility shims.

4. **Backward-compatibility shims pollute the class** -- ~70 lines of protected getters/setters exist solely to proxy `(session as any)._currentFrame` patterns in tests. Private delegate methods for `parseColorAdjustments`, `parsePenStroke`, etc. exist only because tests access them via `(session as any)`.

5. **Event bus coupling** -- Session extends `EventEmitter<SessionEvents>` with 25+ event types. The constructor has ~80 lines of wiring that forward PlaybackEngine events to Session events and connect manager callbacks to Session emitters.

### Quantitative Summary

| Metric | Value |
|--------|-------|
| Session.ts lines | 2,450 |
| Total session directory (54 files) | ~40,800 lines |
| Public/protected methods on Session | ~160 |
| SessionEvents event types | 25 |
| Internal managers wired in constructor | 8 |
| Backward-compat proxy accessors | ~35 |
| Files that import Session | 58 |
| Files that access media source methods | 35 |
| Files that access frame cache methods | 12 |

## Current Architecture

```
Session (extends EventEmitter<SessionEvents>)
  |
  +-- _playbackEngine: PlaybackEngine     (play/pause/seek/timing)
  +-- _markerManager: MarkerManager       (marks/markers)
  +-- _noteManager: NoteManager           (notes/comments)
  +-- _versionManager: VersionManager     (shot versioning)
  +-- _statusManager: StatusManager       (review workflow)
  +-- _volumeManager: VolumeManager       (volume/mute/pitch)
  +-- _abCompareManager: ABCompareManager (A/B source compare)
  +-- _annotationStore: AnnotationStore   (paint/matte/GTO annotations)
  +-- _audioCoordinator: AudioCoordinator (Web Audio routing)
  |
  +-- sources: MediaSource[]              (owned directly)
  +-- _graph: Graph | null                (owned directly)
  +-- _gtoData: GTOData | null            (owned directly)
  +-- _metadata: SessionMetadata          (owned directly)
  +-- _edlEntries: RVEDLEntry[]           (owned directly)
  +-- _uncropState: UncropState | null    (owned directly)
  +-- _hdrResizeTier: HDRResizeTier       (owned directly)
```

### Communication Pattern

Managers use a **callback interface pattern** (e.g., `MarkerManagerCallbacks`, `VolumeManagerCallbacks`) to communicate back to Session without circular imports. Session wires these in its constructor and re-emits events through its own `EventEmitter`. PlaybackEngine and MediaManager use a **host interface pattern** (`PlaybackEngineHost`, `MediaManagerHost`) that Session implements.

## Proposed Solution

Break Session into **four focused facade services** that group related responsibilities. Session itself becomes a thin composition root that wires services together but exposes consumers to focused interfaces.

### Service Decomposition

```
Session (thin composition root, ~400 lines)
  |
  +-- SessionPlayback    (playback + timing + audio)
  +-- SessionMedia       (sources + loading + caching)
  +-- SessionAnnotations (markers + notes + paint + versions + statuses)
  +-- SessionGraph       (GTO + node graph + property resolution + EDL)
```

### Service 1: `SessionPlayback`

**Responsibility:** Playback control, timing, volume, A/B compare, audio coordination.

**Owns:**
- `PlaybackEngine` (play/pause/seek/timing/interpolation)
- `VolumeManager` (volume/mute/pitch)
- `ABCompareManager` (A/B source compare)
- `AudioCoordinator` (Web Audio routing)

**File:** `src/core/session/SessionPlayback.ts`

```typescript
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { PlaybackEngine } from './PlaybackEngine';
import { VolumeManager } from './VolumeManager';
import { ABCompareManager } from './ABCompareManager';
import { AudioCoordinator } from '../../audio/AudioCoordinator';
import type { LoopMode, MediaType } from '../types/session';
import type { MediaSource } from './SessionMedia';
import type { SubFramePosition } from '../../utils/media/FrameInterpolator';
import type { Marker, MarkerColor } from './MarkerManager';

export interface SessionPlaybackEvents extends EventMap {
  frameChanged: number;
  playbackChanged: boolean;
  playDirectionChanged: number;
  playbackSpeedChanged: number;
  preservesPitchChanged: boolean;
  loopModeChanged: LoopMode;
  fpsChanged: number;
  frameIncrementChanged: number;
  inOutChanged: { inPoint: number; outPoint: number };
  interpolationEnabledChanged: boolean;
  subFramePositionChanged: SubFramePosition | null;
  buffering: boolean;
  volumeChanged: number;
  mutedChanged: boolean;
  abSourceChanged: { current: 'A' | 'B'; sourceIndex: number };
  audioError: import('./Session').AudioPlaybackError;
}

export interface SessionPlaybackHost {
  /** Resolve current media source for playback engine */
  getCurrentSource(): MediaSource | null;
  /** Resolve source B for split screen */
  getSourceB(): MediaSource | null;
  /** Get all sources (for A/B index validation) */
  getSourceCount(): number;
  /** Get sources array for A/B index lookup */
  getSourceByIndex(index: number): MediaSource | null;
}

export class SessionPlayback extends EventEmitter<SessionPlaybackEvents> {
  private _engine = new PlaybackEngine();
  private _volume = new VolumeManager();
  private _abCompare = new ABCompareManager();
  private _audio = new AudioCoordinator();
  private _host: SessionPlaybackHost | null = null;

  // --- Public sub-manager access ---
  get engine(): PlaybackEngine { return this._engine; }
  get volumeManager(): VolumeManager { return this._volume; }
  get abCompareManager(): ABCompareManager { return this._abCompare; }
  get audioCoordinator(): AudioCoordinator { return this._audio; }

  setHost(host: SessionPlaybackHost): void { ... }

  // --- Playback delegations (typed, no pass-through bloat) ---
  get currentFrame(): number { ... }
  set currentFrame(frame: number) { ... }
  get isPlaying(): boolean { ... }
  play(): void { ... }
  pause(): void { ... }
  // ... (all playback methods move here)

  // --- Volume delegations ---
  get volume(): number { ... }
  set volume(v: number) { ... }
  get muted(): boolean { ... }
  // ...

  // --- A/B delegations ---
  toggleAB(): void { ... }
  // ...

  dispose(): void { ... }
}
```

### Service 2: `SessionMedia`

**Responsibility:** Media source management, file loading, frame caching, sequence handling.

**Owns:**
- `sources: MediaSource[]`
- `MediaManager` (or absorbs it fully)
- Media loading methods (`loadFile`, `loadImage`, `loadVideo`, etc.)
- Frame cache access methods
- HDR resize tier

**File:** `src/core/session/SessionMedia.ts`

```typescript
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { MediaType } from '../types/session';
import type { HDRResizeTier } from '../../utils/media/HDRFrameResizer';
import type { UnsupportedCodecInfo } from './Session';

export interface SessionMediaEvents extends EventMap {
  sourceLoaded: MediaSource;
  durationChanged: number;
  unsupportedCodec: UnsupportedCodecInfo;
}

export interface SessionMediaHost {
  /** Get current fps from playback */
  getFps(): number;
  /** Get current frame from playback */
  getCurrentFrame(): number;
  /** Notify playback of fps/duration changes */
  setFps(fps: number): void;
  setInPoint(value: number): void;
  setOutPoint(value: number): void;
  setCurrentFrame(value: number): void;
  /** Pause playback (when adding source) */
  pause(): void;
  getIsPlaying(): boolean;
  /** Volume state for video element init */
  getMuted(): boolean;
  getEffectiveVolume(): number;
  initVideoPreservesPitch(video: HTMLVideoElement): void;
  /** A/B auto-assign callback */
  onSourceAdded(count: number): { currentSourceIndex: number; emitEvent: boolean };
  emitABChanged(idx: number): void;
}

export class SessionMedia extends EventEmitter<SessionMediaEvents> {
  private _sources: MediaSource[] = [];
  private _currentSourceIndex = 0;
  private _hdrResizeTier: HDRResizeTier = 'none';
  private _host: SessionMediaHost | null = null;

  setHost(host: SessionMediaHost): void { ... }

  // --- Source accessors ---
  get currentSource(): MediaSource | null { ... }
  get allSources(): MediaSource[] { ... }
  get sourceCount(): number { ... }
  getSourceByIndex(index: number): MediaSource | null { ... }
  get currentSourceIndex(): number { ... }

  // --- Loading ---
  async loadFile(file: File): Promise<void> { ... }
  async loadImage(name: string, url: string): Promise<void> { ... }
  async loadVideo(name: string, url: string): Promise<void> { ... }
  async loadVideoFile(file: File): Promise<void> { ... }
  async loadImageFile(file: File): Promise<void> { ... }
  async loadEXRFile(file: File): Promise<void> { ... }
  async loadSequence(files: File[], fps?: number): Promise<void> { ... }

  // --- Frame cache ---
  getVideoFrameCanvas(frameIndex?: number): ... { ... }
  hasVideoFrameCached(frameIndex?: number): boolean { ... }
  isUsingMediabunny(): boolean { ... }
  // ... all frame cache methods

  // --- Source switching ---
  setCurrentSource(index: number): void { ... }

  setHDRResizeTier(tier: HDRResizeTier): void { ... }

  dispose(): void { ... }
}
```

### Service 3: `SessionAnnotations`

**Responsibility:** All annotation-related data: markers, notes, paint annotations, version groups, shot statuses.

**Owns:**
- `MarkerManager`
- `NoteManager`
- `VersionManager`
- `StatusManager`
- `AnnotationStore`

**File:** `src/core/session/SessionAnnotations.ts`

```typescript
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { MarkerManager } from './MarkerManager';
import { NoteManager } from './NoteManager';
import { VersionManager } from './VersionManager';
import { StatusManager } from './StatusManager';
import { AnnotationStore } from './AnnotationStore';
import type { Marker } from './MarkerManager';
import type { ParsedAnnotations, MatteSettings } from './Session';
import type { PaintEffects } from '../../paint/types';

export interface SessionAnnotationEvents extends EventMap {
  marksChanged: ReadonlyMap<number, Marker>;
  annotationsLoaded: ParsedAnnotations;
  paintEffectsLoaded: Partial<PaintEffects>;
  matteChanged: MatteSettings;
  notesChanged: void;
  versionsChanged: void;
  statusChanged: { sourceIndex: number; status: string; previous: string };
  statusesChanged: void;
}

export class SessionAnnotations extends EventEmitter<SessionAnnotationEvents> {
  private _markers = new MarkerManager();
  private _notes = new NoteManager();
  private _versions = new VersionManager();
  private _statuses = new StatusManager();
  private _store = new AnnotationStore();

  constructor() {
    super();
    // Wire all callbacks to re-emit on this emitter
    this._markers.setCallbacks({ onMarksChanged: (m) => this.emit('marksChanged', m) });
    this._notes.setCallbacks({ onNotesChanged: () => this.emit('notesChanged', undefined) });
    // ...
  }

  // --- Direct sub-manager access (for SessionSerializer, etc.) ---
  get markerManager(): MarkerManager { return this._markers; }
  get noteManager(): NoteManager { return this._notes; }
  get versionManager(): VersionManager { return this._versions; }
  get statusManager(): StatusManager { return this._statuses; }
  get annotationStore(): AnnotationStore { return this._store; }

  // --- Convenience delegations for common operations ---
  toggleMark(frame: number): void { this._markers.toggleMark(frame); }
  getMarker(frame: number): Marker | undefined { return this._markers.getMarker(frame); }
  // ...

  dispose(): void { ... }
}
```

### Service 4: `SessionGraph`

**Responsibility:** GTO file loading/parsing, node graph ownership, property resolution, EDL, session metadata, GTO export.

**Owns:**
- `_graph: Graph | null`
- `_gtoData: GTOData | null`
- `_graphParseResult: GTOParseResult | null`
- `_metadata: SessionMetadata`
- `_edlEntries: RVEDLEntry[]`
- `_uncropState: UncropState | null`
- GTO parsing logic (`parseSession`, `parseInitialSettings`)
- Property resolution (`resolveProperty`)

**File:** `src/core/session/SessionGraph.ts`

```typescript
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { Graph } from '../graph/Graph';
import type { GTOData } from 'gto-js';
import type { GTOParseResult } from './GTOGraphLoader';
import type { GTOViewSettings, SessionMetadata } from './Session';
import type { RVEDLEntry } from '../../formats/RVEDLParser';
import type { UncropState } from '../../core/types/transform';

export interface SessionGraphEvents extends EventMap {
  graphLoaded: GTOParseResult;
  settingsLoaded: GTOViewSettings;
  sessionLoaded: void;
  edlLoaded: RVEDLEntry[];
  metadataChanged: SessionMetadata;
}

export interface SessionGraphHost {
  /** Access to playback for applying GTO session info */
  setFps(fps: number): void;
  setCurrentFrame(frame: number): void;
  setInPoint(value: number): void;
  setOutPoint(value: number): void;
  /** Access to annotations for applying GTO paint/markers */
  getAnnotations(): import('./SessionAnnotations').SessionAnnotations;
  /** Access to media for loading video sources from graph */
  loadVideoSourcesFromGraph(result: GTOParseResult): Promise<void>;
}

export class SessionGraph extends EventEmitter<SessionGraphEvents> {
  private _graph: Graph | null = null;
  private _gtoData: GTOData | null = null;
  private _graphParseResult: GTOParseResult | null = null;
  private _metadata: SessionMetadata = { ... };
  private _edlEntries: RVEDLEntry[] = [];
  private _uncropState: UncropState | null = null;
  private _host: SessionGraphHost | null = null;

  setHost(host: SessionGraphHost): void { ... }

  // --- GTO loading ---
  async loadFromGTO(data: ArrayBuffer | string, availableFiles?: Map<string, File>): Promise<void> { ... }

  // --- EDL ---
  loadEDL(text: string): RVEDLEntry[] { ... }

  // --- Property resolution ---
  resolveProperty(address: string): ... { ... }

  // --- Accessors ---
  get graph(): Graph | null { ... }
  get graphParseResult(): GTOParseResult | null { ... }
  get gtoData(): GTOData | null { ... }
  get metadata(): SessionMetadata { ... }
  get edlEntries(): readonly RVEDLEntry[] { ... }
  get uncropState(): UncropState | null { ... }

  updateMetadata(patch: Partial<SessionMetadata>): void { ... }

  dispose(): void { ... }
}
```

### Revised Session (Thin Composition Root)

After the refactor, Session becomes a ~400-line composition root:

```typescript
// src/core/session/Session.ts (after refactor)

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { SessionPlayback } from './SessionPlayback';
import { SessionMedia } from './SessionMedia';
import { SessionAnnotations } from './SessionAnnotations';
import { SessionGraph } from './SessionGraph';

/** Union of all sub-service events for backward-compatible .on() usage */
export interface SessionEvents extends
  SessionPlaybackEvents,
  SessionMediaEvents,
  SessionAnnotationEvents,
  SessionGraphEvents {}

export class Session extends EventEmitter<SessionEvents> {
  readonly playback = new SessionPlayback();
  readonly media = new SessionMedia();
  readonly annotations = new SessionAnnotations();
  readonly graph = new SessionGraph();

  constructor() {
    super();
    this.wireServices();
  }

  /** Wire host interfaces so services can communicate */
  private wireServices(): void {
    // SessionPlayback needs media sources
    this.playback.setHost({
      getCurrentSource: () => this.media.currentSource,
      getSourceB: () => this.media.getSourceByIndex(this.playback.abCompareManager.sourceBIndex),
      getSourceCount: () => this.media.sourceCount,
      getSourceByIndex: (i) => this.media.getSourceByIndex(i),
    });

    // SessionMedia needs playback state
    this.media.setHost({
      getFps: () => this.playback.engine.fps,
      getCurrentFrame: () => this.playback.currentFrame,
      setFps: (fps) => { this.playback.engine.fps = fps; },
      setInPoint: (v) => this.playback.engine.setInPointInternal(v),
      setOutPoint: (v) => this.playback.engine.setOutPointInternal(v),
      setCurrentFrame: (v) => this.playback.engine.setCurrentFrameInternal(v),
      pause: () => this.playback.pause(),
      getIsPlaying: () => this.playback.isPlaying,
      getMuted: () => this.playback.volumeManager.muted,
      getEffectiveVolume: () => this.playback.volumeManager.getEffectiveVolume(),
      initVideoPreservesPitch: (v) => this.playback.volumeManager.initVideoPreservesPitch(v),
      onSourceAdded: (c) => this.playback.abCompareManager.onSourceAdded(c),
      emitABChanged: (i) => this.playback.abCompareManager.emitChanged(i),
    });

    // SessionGraph needs playback + annotations + media
    this.graph.setHost({
      setFps: (fps) => { this.playback.engine.fps = fps; },
      setCurrentFrame: (f) => this.playback.engine.setCurrentFrameInternal(f),
      setInPoint: (v) => this.playback.engine.setInPointInternal(v),
      setOutPoint: (v) => this.playback.engine.setOutPointInternal(v),
      getAnnotations: () => this.annotations,
      loadVideoSourcesFromGraph: (r) => this.media.loadVideoSourcesFromGraph(r),
    });

    // Forward all sub-service events to Session EventEmitter
    this.forwardEvents(this.playback);
    this.forwardEvents(this.media);
    this.forwardEvents(this.annotations);
    this.forwardEvents(this.graph);
  }

  private forwardEvents(source: EventEmitter<any>): void {
    // Use a generic event forwarding mechanism
    // Each sub-service event is re-emitted on Session
  }

  // --- Backward-compatible convenience accessors ---
  // These will be deprecated in favor of session.playback.currentFrame etc.
  /** @deprecated Use session.playback.currentFrame */
  get currentFrame(): number { return this.playback.currentFrame; }
  set currentFrame(v: number) { this.playback.currentFrame = v; }

  /** @deprecated Use session.media.currentSource */
  get currentSource() { return this.media.currentSource; }

  /** @deprecated Use session.media.loadFile() */
  async loadFile(file: File) { return this.media.loadFile(file); }

  // ... minimal set of deprecation shims

  dispose(): void {
    this.playback.dispose();
    this.media.dispose();
    this.annotations.dispose();
    this.graph.dispose();
  }
}
```

## Detailed Migration Steps

### Phase 1: Extract SessionAnnotations (Low Risk, High Value)

**Why first:** Annotations (markers, notes, versions, statuses, paint) are the most self-contained domain. They have no bidirectional dependencies with playback or media loading. The existing managers already own their state.

**Steps:**

1. **Create `src/core/session/SessionAnnotations.ts`**
   - Move MarkerManager, NoteManager, VersionManager, StatusManager, AnnotationStore instantiation and wiring
   - Define `SessionAnnotationEvents` (subset of current SessionEvents)
   - Wire manager callbacks to emit on SessionAnnotations

2. **Update Session.ts**
   - Replace 5 individual manager fields with `_annotations = new SessionAnnotations()`
   - Replace ~30 marker delegation methods with `this._annotations.markerManager.xxx`
   - Forward SessionAnnotationEvents to Session EventEmitter
   - Add `get annotations(): SessionAnnotations` accessor

3. **Update consumers incrementally**
   - `SessionSerializer.ts`: Change `session.noteManager` to `session.annotations.noteManager`
   - `SessionGTOExporter.ts`: Same pattern
   - `AppSessionBridge.ts`: Forward annotation events
   - Tests: Update `(session as any)._markerManager` to `session.annotations.markerManager`

4. **Add deprecation JSDoc** on Session pass-through methods

**Files to create:**
- `src/core/session/SessionAnnotations.ts` (~200 lines)

**Files to modify:**
- `src/core/session/Session.ts` (remove ~150 lines of delegation methods)
- `src/core/session/SessionSerializer.ts` (update 3 access paths)
- `src/core/session/SessionGTOExporter.ts` (update access paths)
- `src/core/session/SessionGTOStore.ts` (update access paths)
- `src/core/session/Session.state.test.ts` (update test access)

**Estimated effort:** 1 day

### Phase 2: Extract SessionGraph (Medium Risk, High Value)

**Why second:** GTO loading/parsing is complex but isolated. It reads from file input and writes to Session state (playback, annotations). The communication is one-directional during loading, then read-only after.

**Steps:**

1. **Create `src/core/session/SessionGraph.ts`**
   - Move `loadFromGTO()`, `loadEDL()`, `parseSession()`, `resolveProperty()`
   - Move `_graph`, `_gtoData`, `_graphParseResult`, `_metadata`, `_edlEntries`, `_uncropState`
   - Move `updateMetadata()`, `setDisplayName()`
   - Move GTO value extraction helpers and settings parser delegations
   - Define `SessionGraphHost` interface for communicating with playback/annotations/media

2. **Move type definitions**
   - Move `GTOViewSettings`, `MatteSettings`, `SessionMetadata`, `GTOComponentDTO`, `ParsedAnnotations` to `src/core/session/types.ts` (shared types file)
   - Keep re-exports in `Session.ts` for backward compatibility

3. **Update Session.ts**
   - Replace graph-related fields with `_graph = new SessionGraph()`
   - Wire SessionGraphHost in constructor
   - Forward SessionGraphEvents
   - Add backward-compat accessors: `get graph()`, `get gtoData()`, etc.

4. **Update consumers**
   - `SessionGTOStore.ts`: Accept `SessionGraph` or keep accessing via `Session`
   - `SessionGTOExporter.ts`: Same
   - `AppSessionBridge.ts`: Update event subscriptions

**Files to create:**
- `src/core/session/SessionGraph.ts` (~500 lines)
- `src/core/session/types.ts` (~100 lines, shared type definitions)

**Files to modify:**
- `src/core/session/Session.ts` (remove ~400 lines)
- `src/core/session/SessionGTOStore.ts`
- `src/core/session/SessionGTOExporter.ts`
- `src/core/session/Session.graph.test.ts`
- `src/core/session/Session.state.test.ts`

**Estimated effort:** 2 days

### Phase 3: Extract SessionMedia (Medium Risk, Medium Value)

**Why third:** Media loading has complex bidirectional dependencies with playback (fps/duration detection, A/B auto-assign, pause-on-load). The existing `MediaManager` class already exists but Session duplicates its methods. This phase unifies them.

**Steps:**

1. **Create `src/core/session/SessionMedia.ts`**
   - Absorb `MediaManager.ts` (or wrap it) -- the existing MediaManager is already well-structured
   - Move all media loading methods from Session.ts (`loadFile`, `loadImage`, `loadVideo`, `loadVideoFile`, `loadImageFile`, `loadEXRFile`, `loadSequence`)
   - Move all frame cache access methods (`getVideoFrameCanvas`, `hasVideoFrameCached`, etc.)
   - Move `loadVideoSourcesFromGraph()`
   - Move `_hdrResizeTier` and `setHDRResizeTier()`
   - Move `sources` array and `_currentSourceIndex`
   - Define `SessionMediaHost` interface

2. **Unify Session/MediaManager duplication**
   - Session's `loadVideoFile()` adds `this._gtoData = null` and `this._audioCoordinator.loadFromVideo()` -- these cross-cutting concerns become callbacks in the host interface
   - Session's `loadVideoSourcesFromGraph()` becomes a method on SessionMedia with graph result passed in

3. **Update Session.ts**
   - Replace `sources`, `_currentSourceIndex`, and ~40 media methods with `_media = new SessionMedia()`
   - Add backward-compat accessors

4. **Update consumers (35 files)**
   - Prioritize high-traffic consumers: `Viewer.ts`, `ViewerPrerender.ts`, `ViewerExport.ts`, `ThumbnailManager.ts`, `Timeline.ts`, `CacheIndicator.ts`
   - Use `session.media.currentSource` instead of `session.currentSource`
   - Incremental: Keep deprecated accessors on Session during migration

**Files to create:**
- `src/core/session/SessionMedia.ts` (~600 lines)

**Files to modify/remove:**
- `src/core/session/MediaManager.ts` (may be absorbed into SessionMedia)
- `src/core/session/Session.ts` (remove ~500 lines)
- 35 consumer files (incremental, one at a time)

**Estimated effort:** 3 days

### Phase 4: Extract SessionPlayback (High Risk, High Value)

**Why last:** Playback has the most complex bidirectional dependencies and the most consumers. PlaybackEngine already exists as a well-structured class; the main work is extracting the volume/audio/A/B coordination from Session.

**Steps:**

1. **Create `src/core/session/SessionPlayback.ts`**
   - Move `PlaybackEngine` ownership and event forwarding
   - Move `VolumeManager` and audio-related methods (`applyVolumeToVideo`, `safeVideoPlay`, `initVideoPreservesPitch`)
   - Move `ABCompareManager` and A/B source methods (`toggleAB`, `setSourceA`, `setSourceB`, etc.)
   - Move `AudioCoordinator` ownership
   - Move `switchToSource()`
   - Move `getPlaybackState()` and `setPlaybackState()`
   - Define `SessionPlaybackHost` interface

2. **Remove backward-compat proxy accessors**
   - The ~35 protected getters that proxy `_currentFrame`, `_inPoint`, etc. can be removed
   - Tests updated to use `session.playback.engine.currentFrame` or `session.playback.currentFrame`

3. **Update Session.ts**
   - Replace playback-related fields with `_playback = new SessionPlayback()`
   - Forward SessionPlaybackEvents
   - Add backward-compat accessors (deprecated)

4. **Update consumers**
   - `AppPlaybackWiring.ts`: Use `session.playback.xxx`
   - `AppSessionBridge.ts`: Subscribe to `session.playback.on('frameChanged', ...)`
   - `Viewer.ts`, `Timeline.ts`: Use `session.playback.currentFrame`
   - API modules (`PlaybackAPI.ts`, `AudioAPI.ts`, etc.): Use `session.playback`

**Files to create:**
- `src/core/session/SessionPlayback.ts` (~500 lines)

**Files to modify:**
- `src/core/session/Session.ts` (reduce to ~400 lines)
- `src/core/session/Session.playback.test.ts` (update test access patterns)
- ~20 consumer files

**Estimated effort:** 3 days

### Phase 5: Cleanup and Finalization

1. **Remove deprecated accessors** from Session.ts after all consumers are migrated
2. **Remove MediaManager.ts** if fully absorbed into SessionMedia
3. **Update `src/core/session/index.ts`** exports
4. **Update `SessionEvents`** to be a union type of sub-service events
5. **Update AppSessionBridge** to optionally subscribe to focused services
6. **Run full test suite** and fix any remaining breaks

**Estimated effort:** 1 day

## How to Maintain Backward Compatibility During Migration

The key strategy is **deprecation shims on Session**. At each phase:

1. New service is created and tested independently
2. Session instantiates the service and wires it
3. Session keeps its existing public methods but marks them `@deprecated` and delegates to the service
4. Consumers are updated incrementally over subsequent PRs
5. Once no consumer uses the deprecated Session method, it is removed

Example:

```typescript
// During migration (Phase 3)
export class Session extends EventEmitter<SessionEvents> {
  readonly media = new SessionMedia();

  /**
   * @deprecated Use session.media.loadFile() instead.
   * Will be removed in v2.0.
   */
  async loadFile(file: File): Promise<void> {
    return this.media.loadFile(file);
  }

  /**
   * @deprecated Use session.media.currentSource instead.
   */
  get currentSource(): MediaSource | null {
    return this.media.currentSource;
  }
}
```

This means **zero breaking changes** at each phase. Consumers can migrate at their own pace.

## Event Forwarding Strategy

To preserve backward compatibility of `session.on('frameChanged', ...)`:

```typescript
// Session constructor
private wireEventForwarding(): void {
  // Forward all playback events
  const playbackEvents: (keyof SessionPlaybackEvents)[] = [
    'frameChanged', 'playbackChanged', 'playDirectionChanged',
    'playbackSpeedChanged', 'loopModeChanged', 'fpsChanged',
    'volumeChanged', 'mutedChanged', 'abSourceChanged',
    // ...
  ];
  for (const event of playbackEvents) {
    this.playback.on(event, (data: any) => this.emit(event, data));
  }

  // Forward all media events
  const mediaEvents: (keyof SessionMediaEvents)[] = [
    'sourceLoaded', 'durationChanged', 'unsupportedCodec',
  ];
  for (const event of mediaEvents) {
    this.media.on(event, (data: any) => this.emit(event, data));
  }

  // ... same for annotations and graph
}
```

Consumers can then progressively migrate from:
```typescript
session.on('frameChanged', handler);
```
to:
```typescript
session.playback.on('frameChanged', handler);
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking test backward-compat shims | High | Medium | Keep `(session as any)` proxies during migration; batch-update tests per phase |
| Event ordering changes | Medium | High | Forward events synchronously; add integration tests for event ordering |
| Cross-service state consistency | Medium | High | Use host interfaces (already proven pattern); add invariant assertions |
| Circular dependency between services | Low | High | Host interfaces break cycles; services never import each other directly |
| Performance regression from indirection | Low | Low | Hot path (PlaybackEngine.update) is unchanged; one extra property access per frame is negligible |
| Consumer migration takes too long | Medium | Low | Deprecation shims mean no urgency; consumers can migrate over weeks |

## Testing Strategy

### Unit Tests

1. **New service-level tests:**
   - `SessionAnnotations.test.ts` -- verify event wiring, delegation to managers
   - `SessionGraph.test.ts` -- verify GTO loading, property resolution, metadata
   - `SessionMedia.test.ts` -- verify loading, frame cache, source switching
   - `SessionPlayback.test.ts` -- verify playback, volume, A/B compare

2. **Backward-compat tests:**
   - Verify `session.currentFrame` still works (deprecation shim)
   - Verify `session.on('frameChanged', ...)` still fires
   - Verify `(session as any)._currentFrame` still works during migration

3. **Existing tests:**
   - `Session.playback.test.ts` (2,878 lines) -- update access patterns per phase
   - `Session.media.test.ts` (553 lines) -- update to use `session.media.xxx`
   - `Session.state.test.ts` (1,767 lines) -- update serialization paths
   - `Session.graph.test.ts` -- update graph access

### Integration Tests

- Verify GTO load -> playback state applied -> annotations parsed -> media loaded (end-to-end flow)
- Verify A/B compare toggle -> source switch -> frame sync (cross-service coordination)
- Verify snapshot save -> restore cycle still works

### Regression Tests

- Run full test suite (`npx vitest run`) after each phase
- TypeScript check (`npx tsc --noEmit`) after each phase
- Ensure all 7,600+ existing tests pass

## Success Metrics

| Metric | Before | After (Target) |
|--------|--------|----------------|
| Session.ts line count | 2,450 | ~400 |
| Public methods on Session class | ~160 | ~30 (deprecated shims) |
| Max single-responsibility violations | 6 domains in one class | 1 domain per class |
| New file to modify for "add marker feature" | Session.ts + MarkerManager.ts | SessionAnnotations.ts + MarkerManager.ts (Session untouched) |
| Test isolation | Tests must construct full Session | Tests can construct SessionAnnotations alone |
| Import weight for "just need playback" | All of Session + 8 managers | SessionPlayback + PlaybackEngine |

## Estimated Total Effort

| Phase | Description | Effort | Risk |
|-------|-------------|--------|------|
| 1 | Extract SessionAnnotations | 1 day | Low |
| 2 | Extract SessionGraph | 2 days | Medium |
| 3 | Extract SessionMedia | 3 days | Medium |
| 4 | Extract SessionPlayback | 3 days | High |
| 5 | Cleanup and finalization | 1 day | Low |
| **Total** | | **10 days** | |

Each phase is independently shippable and produces a working codebase. The phases can be delivered as separate PRs with focused review scope.

## File Summary

### Files to Create

| File | Lines (est.) | Phase |
|------|-------------|-------|
| `src/core/session/SessionAnnotations.ts` | ~200 | 1 |
| `src/core/session/SessionGraph.ts` | ~500 | 2 |
| `src/core/session/types.ts` | ~100 | 2 |
| `src/core/session/SessionMedia.ts` | ~600 | 3 |
| `src/core/session/SessionPlayback.ts` | ~500 | 4 |
| `src/core/session/SessionAnnotations.test.ts` | ~200 | 1 |
| `src/core/session/SessionGraph.test.ts` | ~300 | 2 |

### Files to Modify (Primary)

| File | Changes | Phase |
|------|---------|-------|
| `src/core/session/Session.ts` | Reduce from 2,450 to ~400 lines | 1-5 |
| `src/core/session/index.ts` | Add new exports | 1-5 |
| `src/core/session/SessionSerializer.ts` | Update access paths | 1,2 |
| `src/core/session/SessionGTOExporter.ts` | Update access paths | 1,2 |
| `src/core/session/SessionGTOStore.ts` | Update access paths | 1,2 |
| `src/AppSessionBridge.ts` | Update event subscriptions | 1-4 |
| `src/core/session/Session.playback.test.ts` | Update test access | 4 |
| `src/core/session/Session.media.test.ts` | Update test access | 3 |
| `src/core/session/Session.state.test.ts` | Update test access | 1,2 |
| `src/core/session/Session.graph.test.ts` | Update test access | 2 |

### Files Potentially Removed

| File | Reason | Phase |
|------|--------|-------|
| `src/core/session/MediaManager.ts` | Absorbed into SessionMedia | 3 |
| `src/core/session/MediaManager.test.ts` | Merged into SessionMedia tests | 3 |

---

## Expert Review -- Round 1

### Verdict: APPROVE WITH CHANGES

### Accuracy Check

**Accurate claims:**
- Session.ts is exactly 2,450 lines (verified).
- Session directory has 57 files (plan says 54, close but see inaccuracy below).
- Total session directory lines: ~43,768 (plan says ~40,800 -- reasonable approximation).
- Session extends `EventEmitter<SessionEvents>` (confirmed).
- 9 internal managers are wired in the constructor (8 private + 1 protected `_playbackEngine`; the plan says "8 internal managers" which is defensible if counting only private managers, but imprecise).
- Session has ~164 member declarations (methods, getters, setters) via `grep` count. The plan's "~160 public/protected methods" is a close approximation, though many are private.
- The backward-compat proxy accessor count: 21 protected get/set declarations plus 14 `@ts-ignore` private method shims = 35 total. The plan's "~35 backward-compat proxy accessors" is accurate.
- The communication pattern description (callback interfaces for managers, host interfaces for PlaybackEngine/MediaManager) is accurate.
- The plan correctly identifies that `loadFromGTO` touches playback state, annotations, markers, notes, versions, statuses, and metadata.
- The existing `MediaManager.ts` (977 lines) has near-identical implementations of media loading methods. The duplication claim is accurate.
- `getPlaybackState()`/`setPlaybackState()` exist and cross playback, volume, markers, and source index as the plan implies.
- Test file line counts: Session.playback.test.ts (2,878), Session.media.test.ts (553), Session.state.test.ts (1,767), Session.graph.test.ts (142). The plan's listed counts are accurate.
- 84 files import from Session (plan says 58 "import Session" -- the plan undercounts).

**Inaccurate or outdated claims:**
- **SessionEvents has 31 event types, not 25.** The `SessionEvents` interface has 31 typed members: `frameChanged`, `playbackChanged`, `sourceLoaded`, `sessionLoaded`, `durationChanged`, `inOutChanged`, `loopModeChanged`, `playDirectionChanged`, `playbackSpeedChanged`, `preservesPitchChanged`, `marksChanged`, `annotationsLoaded`, `settingsLoaded`, `volumeChanged`, `mutedChanged`, `graphLoaded`, `fpsChanged`, `abSourceChanged`, `paintEffectsLoaded`, `matteChanged`, `metadataChanged`, `frameIncrementChanged`, `audioError`, `unsupportedCodec`, `interpolationEnabledChanged`, `subFramePositionChanged`, `edlLoaded`, `notesChanged`, `versionsChanged`, `statusChanged`, `statusesChanged`. Additionally, `buffering` is forwarded from PlaybackEngine (line 402) but is NOT declared in `SessionEvents` -- this is either a latent bug or relies on `EventMap`'s loose index signature.
- **Files that import Session: 84, not 58.** The `grep` for `import.*Session.*from` across `src/` finds 84 files. This is a significant undercount that affects migration effort estimation.
- **Files that access media source methods: 43, not 35.** Verified via grep for media-related session method calls.
- **Files that access frame cache methods: 12, confirmed accurate.**
- **Session directory has 57 files, not 54.** Minor discrepancy.
- **MediaManager.ts is NOT used by Session.ts at all.** Session.ts has zero imports of or references to `MediaManager`. Only `MediaManager.test.ts` imports it. The plan describes "Media loading methods exist in both Session.ts and MediaManager.ts with near-identical implementations" -- this is accurate as a description of code duplication, but the plan's Phase 3 framing of "Absorb `MediaManager.ts` (or wrap it)" implies Session currently delegates to it. In reality, Session has its own parallel implementation and MediaManager is a standalone unused class (except by its own test).
- **The plan's `SessionPlaybackEvents` includes `buffering: boolean`** but this event is not declared in the current `SessionEvents` interface. The forwarding on line 402 works only because `EventMap` has a string index signature. This should be noted.

### Strengths

1. **The phased approach is sound.** Starting with SessionAnnotations (lowest coupling) and ending with SessionPlayback (highest coupling) correctly orders by risk. Each phase is independently shippable.

2. **The host interface pattern is the right solution for cross-service communication.** It is already proven in the codebase (PlaybackEngineHost, MediaManagerHost) and avoids circular imports.

3. **The backward-compatibility strategy via deprecation shims is pragmatic.** Zero breaking changes at each phase, with consumers migrating at their own pace, is the safest path for a codebase with 84 importing files and 7,600+ tests.

4. **The event forwarding strategy preserves the existing consumer contract.** `session.on('frameChanged', ...)` continues working while enabling `session.playback.on('frameChanged', ...)` for new code.

5. **The plan correctly identifies `loadFromGTO` as the most complex cross-cutting method.** It touches playback, markers, notes, versions, statuses, metadata, annotation store, graph, and media loading. Placing it in SessionGraph with a host interface is the right decomposition.

6. **The identification of the AnnotationStore/MarkerManager/NoteManager/VersionManager/StatusManager cluster as the most self-contained domain is correct.** These managers have no dependencies on media or frame cache state.

### Concerns

1. **AudioCoordinator placement creates a hidden cross-service dependency.** The plan places `AudioCoordinator` in `SessionPlayback`, but `_audioCoordinator.loadFromVideo()` is called 4 times from within media loading methods (lines 1305, 1364, 1767, 1855 in Session.ts). In the proposed architecture, `SessionMedia` would need to invoke audio loading on `SessionPlayback`, which is not modeled in the `SessionMediaHost` interface. The current `SessionMediaHost` proposal has no `loadFromVideo` callback. This is a significant gap that must be addressed in the host interface design or by moving audio loading to the composition root.

2. **`getPlaybackState()` / `setPlaybackState()` are inherently cross-service.** These methods read/write playback engine state, volume manager state, marker manager state, and source index. After the refactor, they would span SessionPlayback (frame, fps, loopMode, volume, muted, preservesPitch), SessionAnnotations (marks), and SessionMedia (currentSourceIndex). The plan does not specify where these methods live. They likely must remain on Session itself as composition-level methods, or be split into per-service `getState()`/`setState()` methods composed at the Session level.

3. **`goToNextMarker()` / `goToPreviousMarker()` are cross-domain methods.** They read from `_markerManager` (annotations) and write to `currentFrame` (playback). The plan proposes these as marker delegation methods on SessionAnnotations, but they need playback state. These should either remain on Session or be implemented differently (e.g., SessionAnnotations provides `findNextMarkerFrame(currentFrame)` and Session or SessionPlayback calls it).

4. **`_gtoData = null` is set in 7 media loading methods.** This is a cross-cutting concern between SessionMedia and SessionGraph. The plan mentions it as a "callback in the host interface" but does not model it. The `SessionMediaHost` needs a `clearGTOData()` or similar callback, or this logic should be handled at the composition root level.

5. **Consumer migration is larger than estimated.** With 84 files importing Session (not 58) and 43 files accessing media methods (not 35), the Phase 3 and 4 consumer update effort is ~25% larger than planned. The 3-day estimate for Phase 3 may need 4 days, and Phase 4 may need an additional day.

6. **The `forwardEvents` generic approach needs concrete implementation.** The `EventEmitter` class has no built-in event forwarding. The plan shows a `private forwardEvents(source: EventEmitter<any>): void` method but the actual EventEmitter has no way to enumerate registered event names generically. The forwarding must be done by explicitly listing events (as shown in the `wireEventForwarding` code block), which means it must be maintained in sync with the event interface definitions. This is a maintenance burden that should be acknowledged.

7. **The `AppSessionBridge` uses a typed `on` helper with `keyof SessionEvents`.** If `SessionEvents` becomes a union of sub-service event interfaces, the type compatibility needs verification. TypeScript interface extension (`extends`) should work for this, but event name collisions between services (if any arise) could cause type conflicts.

8. **`safeVideoPlay()` is tightly coupled to both playback and media.** It accesses `this._volumeManager.muted` (playback/volume), `this.currentSource` (media), `this.pause()` (playback), and `this._pendingPlayPromise` (playback engine). The plan places it in SessionPlayback via the PlaybackEngineHost, but the current implementation is on Session. This method needs careful routing -- it's called from the PlaybackEngine host callback, so it naturally belongs in the playback domain, but it also emits `audioError` events and touches volume state.

### Recommended Changes

1. **Add `loadAudioFromVideo` callback to `SessionMediaHost` (or add it to the composition root wiring).** When `SessionMedia` loads a video, it must notify the composition root to wire audio. Example addition to `SessionMediaHost`:
   ```typescript
   /** Notify that a video was loaded and needs audio setup */
   loadAudioFromVideo(video: HTMLVideoElement, volume: number, muted: boolean): void;
   ```

2. **Keep `getPlaybackState()` / `setPlaybackState()` on Session (composition root).** These are inherently cross-service and should not be pushed into a single sub-service. They can be implemented as:
   ```typescript
   getPlaybackState() {
     return {
       ...this.playback.getState(),
       marks: this.annotations.markerManager.toArray(),
       currentSourceIndex: this.media.currentSourceIndex,
     };
   }
   ```

3. **Reframe `goToNextMarker()` / `goToPreviousMarker()` as Session-level methods (not annotation methods).** These orchestrate across annotation and playback domains. They belong on Session or as a standalone utility that takes both services.

4. **Add `clearGTOData` callback or handle `_gtoData = null` at the composition root.** The 7 occurrences of `this._gtoData = null` in media loading methods represent a cross-service concern between media and graph. Either add `onMediaLoadStarted()` callback to `SessionMediaHost` that triggers `this.graph.clearData()`, or move this responsibility to the composition root's event wiring.

5. **Update the consumer count estimates.** Change "58 files that import Session" to 84, "35 files that access media source methods" to 43, and "25 event types" to 31. Adjust effort estimates by +1-2 days total.

6. **Use explicit event forwarding, not generic.** Implement `wireEventForwarding` with explicit event name arrays per service (as already shown in the plan's "Event Forwarding Strategy" section). Do not rely on a generic `forwardEvents()` method. The explicit approach is shown correctly later in the plan but contradicts the earlier `forwardEvents(source: EventEmitter<any>)` sketch.

7. **Address the `buffering` event gap.** Either add `buffering: boolean` to `SessionEvents` (it is currently forwarded but undeclared), or document that it should be added to `SessionPlaybackEvents` and then to the `SessionEvents` union.

8. **Acknowledge that MediaManager.ts is orphaned code, not an active delegation target.** Phase 3 should frame the work as "consolidate Session's inline media methods into SessionMedia, and delete the unused MediaManager.ts." The plan's current framing of "absorb MediaManager" is misleading because Session does not currently use MediaManager.

### Missing Considerations

1. **The `SnapshotManager`, `AutoSaveManager`, `PlaylistManager`, `TransitionManager`, and `SessionURLManager` are not mentioned.** These are session-adjacent managers totaling 2,534 lines that exist in the session directory. While they are not instantiated by Session.ts directly, they accept Session as a parameter. If the Session API surface changes, these will need updating. They should at least be listed as secondary consumer files.

2. **The `AppPlaybackWiring.ts` has significant interaction with session events** (subscribes to `volumeChanged`, `mutedChanged`, `fpsChanged`, `frameChanged`). It is not listed in the plan's "Files to Modify" for Phase 4.

3. **The `App.ts` file subscribes to at least 10 session events directly** (`frameChanged`, `playbackChanged`, `sourceLoaded`, `graphLoaded`, `durationChanged`, `playbackSpeedChanged`, `abSourceChanged`). It is not mentioned in the plan's files-to-modify lists.

4. **Several UI components subscribe to session events directly** (`Timeline.ts`, `HeaderBar.ts`, `CacheIndicator.ts`, `TimecodeDisplay.ts`, `TimecodeOverlay.ts`, `MarkerListPanel.ts`, `NotePanel.ts`, `NoteOverlay.ts`, `Viewer.ts`, `TimelineEditor.ts`). These are not broken by the backward-compat shims but should be listed as eventual migration targets.

5. **The `SessionGTOSettings.test.ts` file** accesses Session directly and subscribes to `settingsLoaded`. It is not listed in the plan.

6. **No mention of the `isSingleImage` property.** This getter on Session accesses `currentSource` (media domain). It is a convenience property that must either become a deprecated shim or move to SessionMedia.

7. **No mention of how `dispose()` ordering works.** The current `Session.dispose()` cleans up sources, audio coordinator, notes, versions, and statuses. In the new architecture, the composition root must call dispose on all four sub-services in the correct order. Audio coordinator disposal should happen before media disposal (to properly disconnect Web Audio nodes before releasing video elements).

8. **The `import('...')` type references in the proposed `SessionPlaybackEvents` interface** (`audioError: import('./Session').AudioPlaybackError`) create a circular reference back to Session.ts. These types need to be moved to the shared `types.ts` file first, which is planned for Phase 2 but needed by Phase 4's events interface. Consider moving shared types earlier (Phase 1) or adjusting the dependency.

9. **`getPlaybackState()` / `setPlaybackState()` placement is unspecified.** These cross-domain methods aggregate state from PlaybackEngine, VolumeManager, MarkerManager, and source index. They must remain on Session as composition-level methods. The plan does not discuss their post-refactor location. The SnapshotManager (567 lines) saves and restores session state via `getPlaybackState()`, and if its output format changes, existing snapshots in user browsers could become incompatible.

10. **`goToNextMarker()` / `goToPreviousMarker()` need careful placement.** These read from `_markerManager` (annotations domain) and write to `currentFrame` (playback domain). They should remain on Session or be composed there, not placed in SessionAnnotations.

11. **Test files using `TestSession extends Session` subclass pattern (at least in `SessionGTOExporter.test.ts`, `CoordinateParsing.test.ts`) directly manipulate protected fields** (`this.sources`, `this._graph`, `this._metadata`, `this.addSource()`). After refactoring, these fields move to sub-services, breaking all TestSession subclasses. This migration work is not called out in the plan. There are approximately 50 instances of `(session as any)` across test files that each represent a potential test failure to address.

12. **The plan's "Files to Create" table omits `SessionMedia.test.ts` and `SessionPlayback.test.ts`** even though the Testing Strategy section mentions creating tests for all four services. This is inconsistent.

13. **Event ordering risk with AudioCoordinator.** The current Session constructor wires `frameChanged` to call both `this.emit('frameChanged', frame)` AND `this._audioCoordinator.onFrameChanged(...)`. After refactoring, if SessionPlayback emits `frameChanged` and Session forwards it, the AudioCoordinator call must still happen in the correct relative order. Tests in `Session.state.test.ts` lines 1646-1765 explicitly verify this ordering and will need updating.

14. **Metadata ownership in `SessionGraph` may be the wrong abstraction.** `updateMetadata()` / `setDisplayName()` are called from consumer code for user-facing metadata operations unrelated to GTO. Coupling metadata to `SessionGraph` means metadata tests require GTO dependencies to exist. Consider keeping metadata on Session itself or creating a lightweight `SessionMetadataManager`.

### Adjusted Effort Estimate

Given the corrected consumer counts (84 files importing Session, 43 accessing media methods vs. the plan's 58 and 35), the additional test migration work for `TestSession` subclasses and `(session as any)` patterns, and the unaddressed cross-service method placement, the total effort should be adjusted:

| Phase | Plan Estimate | Adjusted Estimate | Delta Reason |
|-------|---------------|-------------------|--------------|
| 1 | 1 day | 1.5 days | TestSession subclass migration proof-of-concept |
| 2 | 2 days | 2.5 days | Metadata ownership question; more test files affected |
| 3 | 3 days | 4 days | 43 consumer files (not 35); audio coordinator gap |
| 4 | 3 days | 4 days | ~84 importing files; cross-service method placement |
| 5 | 1 day | 1.5 days | Event forwarding completeness test; dispose ordering |
| **Total** | **10 days** | **13.5 days** | |
