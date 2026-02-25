# Improvement Plan 1: Refactor the Session God Object

## Problem Statement

`Session.ts` (2,450 lines) serves as the central god object for the entire application. While partial decomposition has already occurred (PlaybackEngine, MediaManager, MarkerManager, NoteManager, VersionManager, StatusManager, VolumeManager, ABCompareManager, AnnotationStore), Session still:

1. **Acts as a pass-through facade for 100+ public methods** -- most methods on Session simply delegate to an internal manager (e.g., `toggleMark()` calls `this._markerManager.toggleMark()`). This creates a massive surface area that every consumer must import Session to access.

2. **Duplicates code between Session and MediaManager** -- Media loading methods (`loadFile`, `loadImage`, `loadVideo`, `loadVideoFile`, `loadImageFile`, `loadEXRFile`, `loadSequence`) exist in both Session.ts and MediaManager.ts with near-identical implementations but subtle differences (Session versions include `this._gtoData = null`, `this._audioCoordinator.loadFromVideo()`, and direct state mutations).

3. **Owns too many unrelated concerns** -- Session directly manages: playback delegation, media sources, GTO parsing/loading, EDL loading, node graph, property resolution, A/B compare, video frame caching, audio coordination, metadata, uncrop state, and backward-compatibility shims.

4. **Backward-compatibility shims pollute the class** -- ~70 lines of protected getters/setters exist solely to proxy `(session as any)._currentFrame` patterns in tests. Private delegate methods for `parseColorAdjustments`, `parsePenStroke`, etc. exist only because tests access them via `(session as any)`.

5. **Event bus coupling** -- Session extends `EventEmitter<SessionEvents>` with 31+ event types (including the undeclared `buffering` event). The constructor has ~80 lines of wiring that forward PlaybackEngine events to Session events and connect manager callbacks to Session emitters.

### Quantitative Summary

| Metric | Value |
|--------|-------|
| Session.ts lines | 2,450 |
| Total session directory (54 files) | ~40,800 lines |
| Public/protected methods on Session | ~160 |
| SessionEvents event types | 31 (+ 1 undeclared `buffering`) |
| Internal managers wired in constructor | 8 |
| Backward-compat proxy accessors | ~35 |
| Files that import Session | 102 |
| Files that access media source methods | 43 |
| Files that access frame cache methods | 12 |
| `(session as any)` casts in test files | ~71+ across ~23 files |
| TestSession subclasses in test files | 6 |

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
  audioError: import('./types').AudioPlaybackError;
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
import type { UnsupportedCodecInfo } from './types';

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
  /** Notify that a video was loaded and needs audio setup (called from 4 media loading paths) */
  loadAudioFromVideo(video: HTMLVideoElement, volume: number, muted: boolean): void;
  /** Clear stale graph data when new media is loaded (called from 7 media loading paths) */
  clearGraphData(): void;
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
import type { ParsedAnnotations, MatteSettings } from './types';
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
import type { GTOViewSettings, SessionMetadata } from './types';
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

  /** Clear stale graph data (called by SessionMediaHost.clearGraphData when new media is loaded) */
  clearData(): void {
    this._gtoData = null;
    this._graphParseResult = null;
  }

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

    // SessionMedia needs playback state + cross-service callbacks
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
      loadAudioFromVideo: (video, vol, muted) =>
        this.playback.audioCoordinator.loadFromVideo(video, vol, muted),
      clearGraphData: () => this.graph.clearData(),
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

    // Forward all sub-service events to Session EventEmitter.
    // NOTE: EventEmitter has no wildcard support, so we must use explicit
    // event enumeration per service (not a generic forwardEvents helper).
    // Each array must be kept in sync with the corresponding events interface.
    this.forwardEventsFrom(this.playback, [
      'frameChanged', 'playbackChanged', 'playDirectionChanged',
      'playbackSpeedChanged', 'preservesPitchChanged', 'loopModeChanged',
      'fpsChanged', 'frameIncrementChanged', 'inOutChanged',
      'interpolationEnabledChanged', 'subFramePositionChanged', 'buffering',
      'volumeChanged', 'mutedChanged', 'abSourceChanged', 'audioError',
    ] as const);
    this.forwardEventsFrom(this.media, [
      'sourceLoaded', 'durationChanged', 'unsupportedCodec',
    ] as const);
    this.forwardEventsFrom(this.annotations, [
      'marksChanged', 'annotationsLoaded', 'paintEffectsLoaded',
      'matteChanged', 'notesChanged', 'versionsChanged',
      'statusChanged', 'statusesChanged',
    ] as const);
    this.forwardEventsFrom(this.graph, [
      'graphLoaded', 'settingsLoaded', 'sessionLoaded',
      'edlLoaded', 'metadataChanged',
    ] as const);
  }

  private forwardEventsFrom<E extends EventMap>(
    source: EventEmitter<E>,
    events: readonly (keyof E)[],
  ): void {
    for (const event of events) {
      source.on(event, (data: any) => this.emit(event as any, data));
    }
  }

  // --- Composition-level methods (remain on Session, not delegated) ---
  // These methods cross multiple sub-service domains and must be orchestrated
  // at the composition root level.

  /**
   * Composition-level: crosses playback, annotations, and media domains.
   * Returns a serializable snapshot of session state for SnapshotManager persistence.
   * The output schema is frozen for backward compatibility with stored snapshots.
   */
  getPlaybackState(): PlaybackState {
    return {
      currentFrame: this.playback.currentFrame,
      inPoint: this.playback.engine.inPoint,
      outPoint: this.playback.engine.outPoint,
      fps: this.playback.engine.fps,
      loopMode: this.playback.engine.loopMode,
      volume: this.playback.volumeManager.volume,
      muted: this.playback.volumeManager.muted,
      preservesPitch: this.playback.volumeManager.preservesPitch,
      marks: this.annotations.markerManager.toArray(),
      currentSourceIndex: this.media.currentSourceIndex,
    };
  }

  /**
   * Composition-level: restores state across playback, annotations, and media.
   */
  setPlaybackState(state: PlaybackState): void {
    this.playback.engine.fps = state.fps;
    this.playback.engine.setInPointInternal(state.inPoint);
    this.playback.engine.setOutPointInternal(state.outPoint);
    this.playback.engine.loopMode = state.loopMode;
    this.playback.volumeManager.volume = state.volume;
    this.playback.volumeManager.muted = state.muted;
    this.playback.volumeManager.preservesPitch = state.preservesPitch;
    this.annotations.markerManager.restoreFromArray(state.marks);
    this.media.setCurrentSource(state.currentSourceIndex);
    this.playback.currentFrame = state.currentFrame;
  }

  /**
   * Composition-level: reads from annotations (marker query) and writes to
   * playback (seek). Must remain on Session because it crosses both domains.
   */
  goToNextMarker(): void {
    const frame = this.annotations.markerManager.findNextMarkerFrame(
      this.playback.currentFrame,
    );
    if (frame !== undefined) {
      this.playback.currentFrame = frame;
    }
  }

  /**
   * Composition-level: reads from annotations (marker query) and writes to
   * playback (seek). Must remain on Session because it crosses both domains.
   */
  goToPreviousMarker(): void {
    const frame = this.annotations.markerManager.findPreviousMarkerFrame(
      this.playback.currentFrame,
    );
    if (frame !== undefined) {
      this.playback.currentFrame = frame;
    }
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
    // Dispose audio before media to disconnect Web Audio nodes
    // before releasing video elements.
    this.playback.dispose();
    this.media.dispose();
    this.annotations.dispose();
    this.graph.dispose();
  }
}
```

## Detailed Migration Steps

### Phase 1: Extract SessionAnnotations + Shared Types (Low Risk, High Value)

**Why first:** Annotations (markers, notes, versions, statuses, paint) are the most self-contained domain. They have no bidirectional dependencies with playback or media loading. The existing managers already own their state. Shared types must also be extracted here because `SessionAnnotationEvents` already needs `ParsedAnnotations` and `MatteSettings`, and later phases (`SessionPlaybackEvents`) need `AudioPlaybackError`.

**Steps:**

1. **Create `src/core/session/types.ts`** (shared type definitions)
   - Move `AudioPlaybackError`, `UnsupportedCodecInfo`, `MatteSettings`, `ParsedAnnotations`, `SessionMetadata`, `GTOViewSettings`, `GTOComponentDTO`, `PlaybackState` from `Session.ts`
   - Keep re-exports in `Session.ts` for backward compatibility
   - This must happen first because `SessionAnnotationEvents` (this phase) needs `ParsedAnnotations` and `MatteSettings`

2. **Create `src/core/session/SessionAnnotations.ts`**
   - Move MarkerManager, NoteManager, VersionManager, StatusManager, AnnotationStore instantiation and wiring
   - Define `SessionAnnotationEvents` (subset of current SessionEvents, importing types from `types.ts`)
   - Wire manager callbacks to emit on SessionAnnotations
   - MarkerManager must expose `findNextMarkerFrame(currentFrame)` and `findPreviousMarkerFrame(currentFrame)` query methods (used by Session-level `goToNextMarker()`/`goToPreviousMarker()`)

3. **Update Session.ts**
   - Replace 5 individual manager fields with `_annotations = new SessionAnnotations()`
   - Replace ~30 marker delegation methods with `this._annotations.markerManager.xxx`
   - Forward SessionAnnotationEvents to Session EventEmitter (use explicit event enumeration)
   - Add `get annotations(): SessionAnnotations` accessor
   - Keep `goToNextMarker()` / `goToPreviousMarker()` on Session (these cross annotation and playback domains)

4. **Update consumers incrementally**
   - `SessionSerializer.ts`: Change `session.noteManager` to `session.annotations.noteManager`
   - `SessionGTOExporter.ts`: Same pattern
   - `AppSessionBridge.ts`: Forward annotation events
   - Tests: Update `(session as any)._markerManager` to `session.annotations.markerManager`

5. **Add deprecation JSDoc** on Session pass-through methods

**Files to create:**
- `src/core/session/types.ts` (~100 lines, shared type definitions)
- `src/core/session/SessionAnnotations.ts` (~200 lines)

**Files to modify:**
- `src/core/session/Session.ts` (remove ~150 lines of delegation methods; add re-exports from types.ts)
- `src/core/session/SessionSerializer.ts` (update 3 access paths)
- `src/core/session/SessionGTOExporter.ts` (update access paths)
- `src/core/session/SessionGTOStore.ts` (update access paths)
- `src/core/session/SessionGTOExporter.test.ts` (update TestSession annotation access paths)
- `src/core/session/SessionGTOStore.test.ts` (update access paths)
- `src/core/session/CoordinateParsing.test.ts` (update TestSession if it accesses annotation fields)
- `src/core/session/Session.state.test.ts` (update test access)

**Test gate criteria:**
- New `SessionAnnotations.test.ts`: standalone construction without Session, event wiring (toggleMark triggers marksChanged), all 5 sub-manager accessors, dispose verification
- Backward-compat: `session.toggleMark(5)` via deprecated shim works; `session.on('marksChanged', handler)` fires via event forwarding; `session.annotations.markerManager` accessible
- All existing tests pass (`npx vitest run`); type check passes (`npx tsc --noEmit`)
- No new `(session as any)` casts introduced

**Estimated effort:** 1.5 days

### Phase 2: Extract SessionGraph (Medium Risk, High Value)

**Why second:** GTO loading/parsing is complex but isolated. It reads from file input and writes to Session state (playback, annotations). The communication is one-directional during loading, then read-only after.

**Steps:**

1. **Create `src/core/session/SessionGraph.ts`**
   - Move `loadFromGTO()`, `loadEDL()`, `parseSession()`, `resolveProperty()`
   - Move `_graph`, `_gtoData`, `_graphParseResult`, `_metadata`, `_edlEntries`, `_uncropState`
   - Move `updateMetadata()`, `setDisplayName()`
   - Move GTO value extraction helpers and settings parser delegations
   - Define `SessionGraphHost` interface for communicating with playback/annotations/media
   - Add `clearData()` method (resets `_gtoData = null`, called via `SessionMediaHost.clearGraphData()` in Phase 3)

2. **Update Session.ts**
   - Replace graph-related fields with `_graph = new SessionGraph()`
   - Wire SessionGraphHost in constructor
   - Forward SessionGraphEvents (use explicit event enumeration)
   - Add backward-compat accessors: `get graph()`, `get gtoData()`, etc.
   - Note: shared types already extracted to `types.ts` in Phase 1

3. **Update consumers**
   - `SessionGTOStore.ts`: Accept `SessionGraph` or keep accessing via `Session`
   - `SessionGTOExporter.ts`: Same
   - `AppSessionBridge.ts`: Update event subscriptions

**Files to create:**
- `src/core/session/SessionGraph.ts` (~500 lines)

**Files to modify:**
- `src/core/session/Session.ts` (remove ~400 lines)
- `src/core/session/SessionGTOStore.ts`
- `src/core/session/SessionGTOExporter.ts`
- `src/core/session/SessionGTOExporter.test.ts` (update TestSession for moved `_graph` field)
- `src/core/session/SessionGTOStore.test.ts` (update access paths)
- `src/core/session/Session.graph.test.ts`
- `src/core/session/Session.state.test.ts`

**Test gate criteria:**
- New `SessionGraph.test.ts`: standalone construction without Session, `loadEDL()` populates entries and emits `edlLoaded`, `resolveProperty()` returns correct values, `updateMetadata()` emits `metadataChanged`, host interface calls verified via mock (`setFps`, `setCurrentFrame` called during load)
- `SessionGTOExporter.test.ts` TestSession: compiles and passes after `_graph` field move
- `SessionGTOSettings.test.ts`: updated and passing
- All existing tests pass (`npx vitest run`); type check passes (`npx tsc --noEmit`)
- No new `(session as any)` casts introduced

**Estimated effort:** 2.5 days

### Phase 3: Extract SessionMedia (Medium Risk, Medium Value)

**Why third:** Media loading has complex bidirectional dependencies with playback (fps/duration detection, A/B auto-assign, pause-on-load). The existing `MediaManager` class already exists but Session duplicates its methods. This phase unifies them.

**Steps:**

1. **Create `src/core/session/SessionMedia.ts`**
   - Consolidate Session's inline media methods into SessionMedia and delete the orphaned `MediaManager.ts` (note: `MediaManager.ts` is not currently used by `Session.ts` -- Session has its own parallel implementation; only `MediaManager.test.ts` imports it)
   - Move all media loading methods from Session.ts (`loadFile`, `loadImage`, `loadVideo`, `loadVideoFile`, `loadImageFile`, `loadEXRFile`, `loadSequence`)
   - Move all frame cache access methods (`getVideoFrameCanvas`, `hasVideoFrameCached`, etc.)
   - Move `loadVideoSourcesFromGraph()`
   - Move `_hdrResizeTier` and `setHDRResizeTier()`
   - Move `sources` array and `_currentSourceIndex`
   - Define `SessionMediaHost` interface

2. **Handle cross-cutting concerns via host callbacks**
   - Session's `loadVideoFile()` calls `this._gtoData = null` (7 occurrences) -- routed via `SessionMediaHost.clearGraphData()` callback
   - Session's `loadVideoFile()` calls `this._audioCoordinator.loadFromVideo()` (4 occurrences) -- routed via `SessionMediaHost.loadAudioFromVideo()` callback
   - Session's `loadVideoSourcesFromGraph()` becomes a method on SessionMedia with graph result passed in

3. **Update Session.ts**
   - Replace `sources`, `_currentSourceIndex`, and ~40 media methods with `_media = new SessionMedia()`
   - Add backward-compat accessors

4. **Update consumers (43 files)**
   - Prioritize high-traffic consumers: `Viewer.ts`, `ViewerPrerender.ts`, `ViewerExport.ts`, `ThumbnailManager.ts`, `Timeline.ts`, `CacheIndicator.ts`
   - Use `session.media.currentSource` instead of `session.currentSource`
   - Incremental: Keep deprecated accessors on Session during migration

**Files to create:**
- `src/core/session/SessionMedia.ts` (~600 lines)

**Files to modify/remove:**
- `src/core/session/MediaManager.ts` (delete -- orphaned code not used by Session.ts)
- `src/core/session/MediaManager.test.ts` (delete or merge relevant tests into SessionMedia.test.ts)
- `src/core/session/Session.ts` (remove ~500 lines)
- `src/core/session/Session.media.test.ts` (update TestSession access to moved `sources` field)
- `src/core/session/SnapshotManager.test.ts` (update source access patterns)
- 43 consumer files (incremental, one at a time)

**Test gate criteria:**
- New `SessionMedia.test.ts`: standalone construction, source management, host callback verification (`loadAudioFromVideo` invoked on video load, `clearGraphData` invoked on media load start)
- Integration test: load video file -> verify audio coordinator receives `loadFromVideo` call
- Integration test: load file after GTO session -> verify graph data is cleared
- `npx vitest run` passes all existing tests; `npx tsc --noEmit` passes
- No new `(session as any)` casts introduced

**Estimated effort:** 4 days

### Phase 4: Extract SessionPlayback (High Risk, High Value)

**Why last:** Playback has the most complex bidirectional dependencies and the most consumers. PlaybackEngine already exists as a well-structured class; the main work is extracting the volume/audio/A/B coordination from Session.

**Steps:**

1. **Create `src/core/session/SessionPlayback.ts`**
   - Move `PlaybackEngine` ownership and event forwarding
   - Move `VolumeManager` and audio-related methods (`applyVolumeToVideo`, `safeVideoPlay`, `initVideoPreservesPitch`)
   - Move `ABCompareManager` and A/B source methods (`toggleAB`, `setSourceA`, `setSourceB`, etc.)
   - Move `AudioCoordinator` ownership
   - Move `switchToSource()`
   - Define `SessionPlaybackHost` interface
   - NOTE: `getPlaybackState()` / `setPlaybackState()` remain on Session (composition-level, see below)
   - NOTE: `goToNextMarker()` / `goToPreviousMarker()` remain on Session (cross-domain, see below)

2. **Remove backward-compat proxy accessors**
   - The ~35 protected getters that proxy `_currentFrame`, `_inPoint`, etc. can be removed
   - Tests updated to use `session.playback.engine.currentFrame` or `session.playback.currentFrame`

3. **Update Session.ts**
   - Replace playback-related fields with `_playback = new SessionPlayback()`
   - Forward SessionPlaybackEvents (use explicit event enumeration)
   - Add backward-compat accessors (deprecated)
   - `getPlaybackState()` / `setPlaybackState()` remain on Session as composition-level methods (they aggregate state from `this.playback`, `this.annotations.markerManager`, and `this.media`)
   - `goToNextMarker()` / `goToPreviousMarker()` remain on Session (they read from annotations via `markerManager.findNextMarkerFrame()` and write to playback via `playback.currentFrame`)

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
- `src/core/session/Session.state.test.ts` (update AudioCoordinator wiring tests AC-WIRE-001 through AC-WIRE-010)
- `src/core/session/PlaylistManager.test.ts` (update Session access patterns)
- `src/core/session/TransitionManager.test.ts` (update Session access patterns)
- ~20 consumer files

**Test gate criteria:**
- New `SessionPlayback.test.ts`: standalone construction, play/pause/seek cycle, volume delegation, A/B compare, AudioCoordinator wiring (mirrors AC-WIRE-001 through AC-WIRE-010), all 16 events in `SessionPlaybackEvents` fire correctly (including `buffering`)
- `getPlaybackState()` / `setPlaybackState()` on Session: frozen schema conformance test (output has exactly `{ currentFrame, inPoint, outPoint, fps, loopMode, volume, muted, preservesPitch, marks, currentSourceIndex }`); round-trip idempotency test
- `goToNextMarker()` / `goToPreviousMarker()` on Session: existing behavior verified
- `Session.playback.test.ts` TestSession: all `(session as any)` usages updated
- `Session.state.test.ts` AudioCoordinator wiring tests: all pass
- `npx vitest run` passes all existing tests; `npx tsc --noEmit` passes
- No new `(session as any)` casts introduced

**Estimated effort:** 4 days

### Phase 5: Cleanup and Finalization

1. **Remove deprecated accessors** from Session.ts after all consumers are migrated
2. **Update `src/core/session/index.ts`** exports
3. **Update `SessionEvents`** to be a union type of sub-service events
4. **Update AppSessionBridge** to optionally subscribe to focused services
5. **Run full test suite** and fix any remaining breaks

**Test gate criteria:**
- Event forwarding completeness test: for each of the 31+ event types in `SessionEvents`, verify that subscribing via `session.on(eventName, handler)` fires when the corresponding sub-service emits
- Dispose ordering test: verify `playback.dispose()` is called before `media.dispose()` (mock dispose methods and check call order)
- No remaining `@deprecated` methods with active non-test callers
- Final full regression: `npx vitest run` passes all tests; `npx tsc --noEmit` passes

**Estimated effort:** 1.5 days

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
// Session constructor -- explicit event enumeration (no wildcard support in EventEmitter)
private wireEventForwarding(): void {
  // Forward all playback events (must match SessionPlaybackEvents interface)
  const playbackEvents: (keyof SessionPlaybackEvents)[] = [
    'frameChanged', 'playbackChanged', 'playDirectionChanged',
    'playbackSpeedChanged', 'preservesPitchChanged', 'loopModeChanged',
    'fpsChanged', 'frameIncrementChanged', 'inOutChanged',
    'interpolationEnabledChanged', 'subFramePositionChanged', 'buffering',
    'volumeChanged', 'mutedChanged', 'abSourceChanged', 'audioError',
  ];
  for (const event of playbackEvents) {
    this.playback.on(event, (data: any) => this.emit(event, data));
  }

  // Forward all media events (must match SessionMediaEvents interface)
  const mediaEvents: (keyof SessionMediaEvents)[] = [
    'sourceLoaded', 'durationChanged', 'unsupportedCodec',
  ];
  for (const event of mediaEvents) {
    this.media.on(event, (data: any) => this.emit(event, data));
  }

  // Forward all annotation events (must match SessionAnnotationEvents interface)
  const annotationEvents: (keyof SessionAnnotationEvents)[] = [
    'marksChanged', 'annotationsLoaded', 'paintEffectsLoaded',
    'matteChanged', 'notesChanged', 'versionsChanged',
    'statusChanged', 'statusesChanged',
  ];
  for (const event of annotationEvents) {
    this.annotations.on(event, (data: any) => this.emit(event, data));
  }

  // Forward all graph events (must match SessionGraphEvents interface)
  const graphEvents: (keyof SessionGraphEvents)[] = [
    'graphLoaded', 'settingsLoaded', 'sessionLoaded',
    'edlLoaded', 'metadataChanged',
  ];
  for (const event of graphEvents) {
    this.graph.on(event, (data: any) => this.emit(event, data));
  }
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

**Implementation note:** The `EventEmitter` class has no wildcard support and no way to enumerate registered event names generically. Event forwarding must use explicit event name arrays per service (as shown above), not a generic `forwardEvents(source: EventEmitter<any>)` helper. Each array must be kept in sync with the corresponding `*Events` interface definition. This is a maintenance burden but ensures type safety and avoids silent event loss.

## TestSession Migration Strategy

There are 6 `TestSession extends Session` subclasses across test files and ~71+ `(session as any)` casts across ~23 test files. After refactoring, protected fields like `this.sources`, `this._graph`, `this._metadata` move to sub-services, breaking every TestSession subclass. This migration work must be planned upfront because the strategy choice affects the API design of every new sub-service class.

### Recommended approach: Factory functions + protected test helpers on sub-services

**Strategy:** Replace `TestSession extends Session` subclasses with factory functions that construct a real `Session` and configure its sub-services via protected test helper methods. Sub-services expose `protected` setters for internal state that are only used in tests.

**Example (before -- current pattern):**

```typescript
class TestSession extends Session {
  constructor() {
    super();
    // Directly manipulate protected fields
    this.sources = [createMockSource()];
    this._graph = createMockGraph();
    this._metadata = { title: 'test' };
  }
}
```

**Example (after -- factory function pattern):**

```typescript
function createTestSession(options?: {
  sources?: MediaSource[];
  graph?: Graph;
  metadata?: Partial<SessionMetadata>;
}): Session {
  const session = new Session();
  if (options?.sources) {
    for (const source of options.sources) {
      session.media.addSourceForTest(source);  // protected test helper
    }
  }
  if (options?.graph) {
    session.graph.setGraphForTest(options.graph);  // protected test helper
  }
  if (options?.metadata) {
    session.graph.updateMetadata(options.metadata);  // public method
  }
  return session;
}
```

**Sub-service test helpers:** Each sub-service class exposes `protected` methods prefixed with `ForTest` for setting internal state:

```typescript
export class SessionMedia extends EventEmitter<SessionMediaEvents> {
  // ... production methods ...

  /** @internal Test helper -- adds a source without triggering load flow */
  addSourceForTest(source: MediaSource): void {
    this._sources.push(source);
  }
}

export class SessionGraph extends EventEmitter<SessionGraphEvents> {
  // ... production methods ...

  /** @internal Test helper -- sets graph without triggering parse flow */
  setGraphForTest(graph: Graph): void {
    this._graph = graph;
  }
}
```

**Migration plan per phase:**
- Phase 1: Migrate TestSession subclasses in `Session.state.test.ts` and `SessionGTOExporter.test.ts` as proof-of-concept. Validate the factory function approach works.
- Phase 2: Migrate TestSession in `Session.graph.test.ts` and `CoordinateParsing.test.ts`.
- Phase 3: Migrate TestSession in `Session.media.test.ts`. Batch-update `(session as any)` casts for media field access.
- Phase 4: Migrate TestSession in `Session.playback.test.ts`. Batch-update remaining `(session as any)` casts.

**Affected test files (6 TestSession subclasses):**
- `src/core/session/Session.state.test.ts`
- `src/core/session/Session.media.test.ts`
- `src/core/session/Session.playback.test.ts`
- `src/core/session/SessionGTOExporter.test.ts`
- `src/core/session/CoordinateParsing.test.ts`
- `src/core/session/ViewerIntegration.test.ts` (if it exists)

**`(session as any)` patterns:** The ~71+ casts across test files should be incrementally replaced with either:
1. Direct access to the sub-service (e.g., `session.media.currentSource` instead of `(session as any)._currentSource`)
2. Test helper methods (e.g., `session.media.addSourceForTest(...)` instead of `(session as any).sources.push(...)`)
3. Public API access where possible

The goal is to reduce `(session as any)` casts to zero over the course of Phases 1-4, with no new casts introduced.

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
| 1 | Extract SessionAnnotations + shared types | 1.5 days | Low |
| 2 | Extract SessionGraph | 2.5 days | Medium |
| 3 | Extract SessionMedia | 4 days | Medium |
| 4 | Extract SessionPlayback | 4 days | High |
| 5 | Cleanup and finalization | 1.5 days | Low |
| **Total** | | **~14 days** | |

The effort increase from the original 10-day estimate reflects: corrected consumer counts (102 files importing Session, not 58), 43 files accessing media methods (not 35), ~71+ `(session as any)` casts requiring migration, 6 TestSession subclass migrations, shared type extraction moved to Phase 1, and the `loadAudioFromVideo`/`clearGraphData` host callback design work.

Each phase is independently shippable and produces a working codebase. The phases can be delivered as separate PRs with focused review scope.

## File Summary

### Files to Create

| File | Lines (est.) | Phase |
|------|-------------|-------|
| `src/core/session/types.ts` | ~100 | 1 |
| `src/core/session/SessionAnnotations.ts` | ~200 | 1 |
| `src/core/session/SessionAnnotations.test.ts` | ~200 | 1 |
| `src/core/session/SessionGraph.ts` | ~500 | 2 |
| `src/core/session/SessionGraph.test.ts` | ~300 | 2 |
| `src/core/session/SessionMedia.ts` | ~600 | 3 |
| `src/core/session/SessionMedia.test.ts` | ~300 | 3 |
| `src/core/session/SessionPlayback.ts` | ~500 | 4 |
| `src/core/session/SessionPlayback.test.ts` | ~400 | 4 |

### Files to Modify (Primary)

| File | Changes | Phase |
|------|---------|-------|
| `src/core/session/Session.ts` | Reduce from 2,450 to ~400 lines | 1-5 |
| `src/core/session/index.ts` | Add new exports | 1-5 |
| `src/core/session/SessionSerializer.ts` | Update access paths | 1,2 |
| `src/core/session/SessionGTOExporter.ts` | Update access paths | 1,2 |
| `src/core/session/SessionGTOStore.ts` | Update access paths | 1,2 |
| `src/core/session/SessionGTOExporter.test.ts` | Update TestSession, annotation access paths | 1,2 |
| `src/core/session/SessionGTOStore.test.ts` | Update access paths | 1,2 |
| `src/core/session/CoordinateParsing.test.ts` | Update TestSession | 1,2 |
| `src/AppSessionBridge.ts` | Update event subscriptions | 1-4 |
| `src/core/session/Session.playback.test.ts` | Update TestSession, test access | 4 |
| `src/core/session/Session.media.test.ts` | Update TestSession, test access | 3 |
| `src/core/session/Session.state.test.ts` | Update test access, AC-WIRE tests | 1,2,4 |
| `src/core/session/Session.graph.test.ts` | Update test access | 2 |
| `src/core/session/PlaylistManager.test.ts` | Update Session access patterns | 4 |
| `src/core/session/TransitionManager.test.ts` | Update Session access patterns | 4 |
| `src/core/session/SnapshotManager.test.ts` | Update source access patterns | 3 |

### Files Potentially Removed

| File | Reason | Phase |
|------|--------|-------|
| `src/core/session/MediaManager.ts` | Orphaned code (not used by Session.ts); delete after consolidating into SessionMedia | 3 |
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

---

## Expert Review — Round 2 (Final)

### Final Verdict: APPROVE WITH CHANGES

### Round 1 Feedback Assessment

The Expert Review -- Round 1 is the only Round 1 review present (no separate QA review was appended). It is comprehensive, well-researched, and independently verified against the codebase. My own verification confirms its findings. Here is the assessment of each concern:

**Valid and Critical (must address before implementation):**

1. **AudioCoordinator cross-service gap (Concern #1).** Verified: `_audioCoordinator.loadFromVideo()` is called 4 times from media loading methods (lines 1305, 1364, 1767, 1855). The proposed `SessionMediaHost` interface has no `loadAudioFromVideo` callback. This is a real design gap that would cause a compile error or silent audio regression during Phase 3. **Critical -- must be modeled in the host interface.**

2. **`getPlaybackState()` / `setPlaybackState()` cross-service placement (Concern #2, Missing Consideration #9).** Verified: these methods at lines 2378-2433 span playback engine state, volume manager state, marker manager state, and source index. The SnapshotManager (567 lines) depends on the output format. The plan provides no placement for these methods. **Critical -- must specify that these remain on Session as composition-level methods.**

3. **`goToNextMarker()` / `goToPreviousMarker()` cross-domain placement (Concern #3, Missing Consideration #10).** Verified at lines 1040-1056: these read from `_markerManager` (annotations) and write to `currentFrame` (playback). The plan implicitly puts them in SessionAnnotations as marker delegation methods, but they need playback write access. The Expert Review's recommendation to keep them on Session or split into `findNextMarkerFrame()` (pure query on annotations) + seek (on playback) is the correct approach. **Critical -- incorrect placement would create a circular dependency.**

4. **`_gtoData = null` cross-cutting concern (Concern #4).** Verified: 7 occurrences across media loading methods. This is a SessionGraph state mutation triggered by SessionMedia operations. Without modeling it in the host interface, GTO data would go stale after media reloads. **Critical -- must be modeled as a callback or composition root hook.**

5. **Consumer count underestimates (Concern #5).** Verified: 102 files import Session (not 58 or even 84 -- the grep shows 102 unique files with 133 total occurrences). The Expert Review's count of 84 was itself an undercount. Additionally, 173 occurrences of `(session as any)` across 23 test files each represent a potential breakage point. **Critical -- effort estimates must be recalibrated.**

6. **TestSession subclass pattern breakage (Missing Consideration #11).** Verified: at least 6 distinct `TestSession extends Session` subclasses in test files (`CoordinateParsing.test.ts`, `SessionGTOExporter.test.ts`, `ViewerIntegration.test.ts`, `Session.media.test.ts`, `Session.playback.test.ts`, `Session.state.test.ts`). These subclasses directly manipulate protected fields like `this.sources`, `this._graph`, `this._metadata`. After refactoring, these fields move to sub-services, breaking every TestSession subclass. This is unmentioned migration work that affects Phase 1 onward. **Critical -- the plan must specify a TestSession migration strategy (e.g., provide a `TestSessionHelper` factory or expose protected setters on sub-services for testing).**

7. **`buffering` event not in SessionEvents (Concern, Accuracy section).** Verified: `buffering` is forwarded on line 402 but absent from the `SessionEvents` interface at lines 165-203. It works only due to `EventMap`'s loose index signature. This is a pre-existing bug, but the refactor must not carry it forward. **Critical -- add `buffering: boolean` to `SessionPlaybackEvents`.**

**Valid but Minor (can be addressed during implementation):**

8. **`forwardEvents` generic approach (Concern #6).** The plan shows both a generic `forwardEvents(source)` sketch and an explicit event list approach. The explicit approach is correct and already shown. This is an implementation detail, not a design gap. **Minor -- just use the explicit approach.**

9. **`AppSessionBridge` type compatibility with union events (Concern #7).** TypeScript interface extension handles this correctly. No event name collisions exist across the proposed sub-service event interfaces (I verified the event name sets are disjoint). **Minor -- no action needed, but worth a compile check during Phase 1.**

10. **`safeVideoPlay()` placement (Concern #8).** This method is called from the PlaybackEngineHost callback (line 363) and touches volume, media, pause, and audioError events. It naturally belongs in SessionPlayback since it is invoked by the playback engine and primarily manages playback error recovery. The media access (`applyVolumeToVideo` accesses `currentSource`) can be routed through `SessionPlaybackHost.getCurrentSource()`. **Minor -- already solvable with the proposed host interface pattern.**

11. **Session-adjacent managers not listed (Missing Consideration #1).** SnapshotManager, AutoSaveManager, PlaylistManager, TransitionManager, SessionURLManager accept Session as a parameter. They should be listed as secondary consumer files but are not blockers since they use the public Session API that will have deprecation shims. **Minor -- add to "Files to Modify" lists for completeness.**

12. **`AppPlaybackWiring.ts` and `App.ts` not listed as files to modify (Missing Considerations #2, #3).** These subscribe to multiple session events and should be listed. Not blockers due to backward-compat shims but should be tracked. **Minor.**

13. **UI component event subscribers not listed (Missing Consideration #4).** Timeline.ts, HeaderBar.ts, CacheIndicator.ts, etc. are not broken by shims but should be eventual migration targets. **Minor -- list as Phase 5 cleanup targets.**

14. **`isSingleImage` property (Missing Consideration #6).** Verified at line 849. Accesses `currentSource`. Should become a deprecated shim delegating to `session.media.isSingleImage`. **Minor -- straightforward to handle.**

15. **Dispose ordering (Missing Consideration #7).** Verified: current order is sources -> audio -> notes -> versions -> statuses. The new architecture must dispose audio before media. **Minor -- straightforward to specify in composition root.**

16. **Circular type references in `import('./Session')` (Missing Consideration #8).** The `audioError` type in `SessionPlaybackEvents` references `import('./Session').AudioPlaybackError`. Moving shared types to `types.ts` (planned for Phase 2) resolves this, but Phase 4 needs it. **Minor -- pull shared type extraction into Phase 1.**

17. **Metadata ownership (Missing Consideration #14).** Verified: `updateMetadata()` and `setDisplayName()` are called from `HeaderBar.ts` (UI) and `AppControlRegistry.ts` for user-facing operations unrelated to GTO. Placing metadata in SessionGraph is questionable. **Minor but worth reconsidering -- metadata could stay on Session or be a trivial standalone manager.**

18. **Missing test file entries in "Files to Create" table (Missing Consideration #12).** `SessionMedia.test.ts` and `SessionPlayback.test.ts` are mentioned in the Testing Strategy but not in the Files to Create table. **Minor -- editorial fix.**

**No conflicts between reviewers** since only one Round 1 review exists.

### Consolidated Required Changes (before implementation)

1. **Add `loadAudioFromVideo(video: HTMLVideoElement, volume: number, muted: boolean): void` to `SessionMediaHost` interface.** This is needed for the 4 `_audioCoordinator.loadFromVideo()` calls in media loading methods. The composition root wires this to `session.playback.audioCoordinator.loadFromVideo()`.

2. **Add `clearGraphData(): void` to `SessionMediaHost` interface** (or add an `onMediaLoadStarted` hook at the composition root). This handles the 7 `this._gtoData = null` mutations during media loading.

3. **Explicitly specify that `getPlaybackState()` / `setPlaybackState()` remain on Session as composition-level methods.** Show the post-refactor implementation in the plan that composes state from `this.playback`, `this.annotations.markerManager`, and `this.media`.

4. **Explicitly specify that `goToNextMarker()` / `goToPreviousMarker()` remain on Session** (or are refactored into `annotations.markerManager.findNextMarkerFrame(currentFrame)` + `playback.currentFrame = frame` at the Session level). They must NOT be placed in SessionAnnotations.

5. **Define a TestSession migration strategy.** Options: (a) Sub-services expose protected test helpers for setting internal state, (b) A `createTestSession()` factory function replaces TestSession subclasses, (c) Sub-services accept initial state in their constructors. The plan must pick one and show an example. This affects all 6 TestSession subclasses and approximately 173 `(session as any)` patterns across 23 test files.

6. **Add `buffering: boolean` to `SessionPlaybackEvents`.** Fix the pre-existing gap where `buffering` is forwarded but undeclared in the events interface.

7. **Correct consumer count estimates.** Update to 102 files importing Session (not 58), and acknowledge the 173 `(session as any)` occurrences across 23 test files as migration work. Adjust effort table accordingly.

8. **Move shared type extraction (AudioPlaybackError, UnsupportedCodecInfo, MatteSettings, ParsedAnnotations, SessionMetadata, GTOViewSettings) to `types.ts` in Phase 1**, not Phase 2. These types are needed by `SessionPlaybackEvents` (Phase 4) and `SessionAnnotationEvents` (Phase 1), so they must be available from the start.

### Consolidated Nice-to-Haves (can address during implementation)

1. **List `AppPlaybackWiring.ts`, `App.ts`, `SnapshotManager.ts`, `AutoSaveManager.ts`, `PlaylistManager.ts`, `TransitionManager.ts`, `SessionURLManager.ts`, `SessionGTOSettings.test.ts` as secondary consumer files** in the Files to Modify tables for the relevant phases.

2. **Reconsider metadata ownership.** `SessionMetadata` + `updateMetadata()` + `setDisplayName()` could stay on Session itself (they are 30 lines of trivial state) rather than being pushed into SessionGraph where they create an unintuitive coupling between user-facing metadata and GTO parsing. This is a design taste decision, not a blocker.

3. **Add `SessionMedia.test.ts` and `SessionPlayback.test.ts` to the Files to Create table** for consistency with the Testing Strategy section.

4. **Document dispose ordering requirements** in the plan: audio must be disposed before media (to disconnect Web Audio nodes before releasing video elements).

5. **Use explicit event forwarding arrays** (as already shown in the "Event Forwarding Strategy" section) rather than the generic `forwardEvents(source: EventEmitter<any>)` sketch. Remove or replace the generic sketch to avoid confusion.

6. **Add `isSingleImage` to the list of backward-compat shims** that Session retains during migration.

7. **Acknowledge that MediaManager.ts is orphaned code** (not currently used by Session.ts) and reframe Phase 3 as "consolidate Session's inline media methods into SessionMedia and delete the orphaned MediaManager.ts."

### Final Risk Rating: MEDIUM

The plan is fundamentally sound -- the phased approach, host interface pattern, and deprecation shim strategy are all correct architectural choices proven in this codebase. The MEDIUM rating reflects: (a) the 8 required changes above represent real design gaps, not merely editorial issues; (b) the consumer migration surface is 75% larger than estimated (102 files vs. 58); (c) the TestSession subclass breakage is unplanned work that touches 6 test files and ~173 cast patterns. None of these are showstoppers, but they require design decisions before implementation begins.

### Final Effort Estimate: 14 days

Breakdown:

| Phase | Adjusted Estimate | Rationale |
|-------|-------------------|-----------|
| 0 (prep) | 0.5 days | Extract shared types to `types.ts`, design TestSession migration strategy |
| 1 | 1.5 days | SessionAnnotations extraction + proof-of-concept TestSession migration |
| 2 | 2.5 days | SessionGraph extraction + metadata placement decision |
| 3 | 4 days | SessionMedia extraction; 102 importing files (not 58); audio coordinator host callbacks |
| 4 | 4 days | SessionPlayback extraction; cross-service method placement; heaviest consumer migration |
| 5 | 1.5 days | Cleanup, dispose ordering, event forwarding completeness, final test sweep |
| **Total** | **14 days** | |

The Expert Review's 13.5-day estimate is reasonable. I add 0.5 days for the shared types / TestSession prep work that should happen before Phase 1.

### Implementation Readiness: NEEDS WORK

The plan's architecture and phasing are correct, but it cannot be implemented as-is due to 8 required changes that represent real design gaps (host interface completions, cross-service method placement, TestSession migration, type extraction timing). These are all solvable within the existing architectural framework -- none require rethinking the overall approach. Once the 8 required changes are incorporated into the plan document, this is READY for implementation.

---

## QA Review -- Round 2 (Final)

### Final Verdict: APPROVE WITH CHANGES

### Round 1 Feedback Assessment

Both Round 1 reviews (Expert Round 1 and the Expert Round 2, which also served as the consolidated review since no separate QA Round 1 was filed) are thorough and independently verified against the codebase. My own verification confirms their findings. Below is my assessment of which concerns are critical and which can be deferred.

**Critical testing concerns (must resolve before implementation begins):**

1. **AudioCoordinator host interface gap.** Both reviews correctly identify that `_audioCoordinator.loadFromVideo()` is called 4 times from media loading paths (Session.ts lines 1305, 1364, 1767, 1855) but `SessionMediaHost` has no callback for it. I verified this independently. Without this callback, Phase 3 produces a codebase where loading a video silently fails to set up Web Audio routing. This is not merely a design omission -- it is a functional regression that no existing test would catch because the audio coordinator tests (AC-WIRE-001 through AC-WIRE-010 in Session.state.test.ts lines 1646-1765) test wiring, not the load path. A new integration test must verify that `loadVideoFile()` triggers audio coordinator setup end-to-end.

2. **TestSession subclass migration strategy is unspecified.** I verified 5 `class TestSession extends Session` subclasses across test files, plus 71 `(session as any)` casts in 7 session test files. The Expert Round 2 review counts 173 occurrences across 23 files (a broader search scope that includes non-session tests). Either count represents significant unplanned migration work. The plan must specify a concrete strategy before Phase 1 begins, because the strategy choice (factory functions vs. protected test helpers vs. constructor injection) affects the API design of every new sub-service class. Deferring this decision to implementation time risks inconsistent approaches across phases.

3. **Cross-service method placement for `getPlaybackState()` / `setPlaybackState()`.** I verified these methods (Session.ts lines 2378-2433) aggregate state from 4 different domains. 15 files reference them, including `SnapshotManager.ts` which persists state to browser storage. The serialization format must remain stable or existing user snapshots break silently. Both reviews correctly recommend keeping these on Session. A frozen schema conformance test is mandatory.

4. **`goToNextMarker()` / `goToPreviousMarker()` placement.** I verified (Session.ts lines 1040-1056) these cross annotations and playback. Both reviews agree they must not go into SessionAnnotations. The plan must be updated to explicitly keep them on Session or use the query+orchestration pattern.

5. **`_gtoData = null` in 7 media loading methods.** I verified 7 occurrences (lines 1595, 1617, 1658, 1701, 1737, 1794, 1926). This cross-service state mutation between media and graph is unmodeled. Without a host callback or composition-root hook, loading new media after a GTO session leaves stale graph data that could produce incorrect property resolution results.

6. **Shared type extraction timing.** The Expert Round 2 review correctly identifies that `AudioPlaybackError` (referenced in `SessionPlaybackEvents`) and `ParsedAnnotations`, `MatteSettings` (referenced in `SessionAnnotationEvents`) are currently defined in Session.ts. These types must be extracted to `types.ts` before Phase 1 -- not Phase 2 as the plan states -- because Phase 1's `SessionAnnotationEvents` needs `ParsedAnnotations` and `MatteSettings`. I verified these types are defined at Session.ts lines 128-163.

**Concerns that can be deferred to implementation time:**

- **`buffering` event not in SessionEvents:** Pre-existing latent bug. Fix opportunistically during Phase 4 by adding `buffering: boolean` to `SessionPlaybackEvents`. Does not block Phase 1-3.
- **Consumer count corrections (94-102 files vs. 58):** Important for effort estimation accuracy but does not change the architectural approach. The deprecation shim strategy handles any count.
- **Metadata ownership in SessionGraph:** A design taste question. SessionGraph is a defensible home since metadata is primarily populated during GTO parsing. Can be reconsidered during Phase 2 if it creates awkward test dependencies.
- **Dispose ordering:** Straightforward to implement correctly at the composition root. Document it but no design decision needed.
- **`forwardEvents` generic vs. explicit approach:** Implementation detail. The explicit approach shown in the plan is correct.
- **Missing files in Files to Create/Modify tables:** Editorial fixes, not design gaps.
- **`isSingleImage`, `safeVideoPlay()`, AppPlaybackWiring.ts, session-adjacent managers:** All handled by deprecation shims or straightforward host interface routing.

### Minimum Test Requirements (before merging each phase)

**Gate criteria for ALL phases:**
- `npx vitest run` passes all 7,600+ existing tests (zero regressions)
- `npx tsc --noEmit` passes (no type errors)
- No new `(session as any)` casts introduced (only existing ones migrated or explicitly kept)

**Phase 1 -- SessionAnnotations:**
- New `SessionAnnotations.test.ts` with minimum coverage:
  - Standalone construction without Session (validates the service is independently testable)
  - Event wiring: `toggleMark()` on SessionAnnotations triggers `marksChanged` event
  - All 5 sub-manager accessors return correct instances
  - `dispose()` calls dispose on NoteManager, VersionManager, StatusManager
- Backward-compat verification:
  - `session.toggleMark(5)` via deprecated shim still works
  - `session.on('marksChanged', handler)` fires via event forwarding
  - `session.annotations.markerManager` is accessible
- `Session.state.test.ts` (30 `(session as any)` usages): all pass, either by keeping shims or updating access paths
- `SessionGTOExporter.test.ts` TestSession: compiles and passes after annotation access path changes

**Phase 2 -- SessionGraph:**
- New `SessionGraph.test.ts` with minimum coverage:
  - Standalone construction without Session
  - `loadEDL()` populates `edlEntries` and emits `edlLoaded`
  - `resolveProperty()` returns correct values when graph is set
  - `updateMetadata()` emits `metadataChanged`
  - Host interface calls verified via mock host (setFps, setCurrentFrame called during load)
- `SessionGTOExporter.test.ts` TestSession: updated for moved `_graph` field
- `SessionGTOSettings.test.ts`: updated and passing
- `Session.graph.test.ts` (3 `(session as any)` usages): updated

**Phase 3 -- SessionMedia:**
- New `SessionMedia.test.ts` with minimum coverage:
  - Standalone construction without Session
  - Source management: add source, get source by index, source count
  - `setCurrentSource()` updates index correctly
  - `setHDRResizeTier()` stores tier
  - Host interface calls verified: `loadAudioFromVideo` callback invoked on video load
  - Host interface calls verified: `clearGraphData` (or equivalent) invoked on media load start
  - `dispose()` disposes all sources
- Integration test: load video file -> verify audio coordinator receives `loadFromVideo` call (end-to-end through composition root)
- Integration test: load file after GTO session -> verify `_gtoData` is cleared
- `Session.media.test.ts` TestSession: updated for moved `sources` and `addSource()`
- MediaManager.ts: verify zero remaining imports (safe to delete)

**Phase 4 -- SessionPlayback:**
- New `SessionPlayback.test.ts` with minimum coverage:
  - Standalone construction without Session
  - Play/pause/seek cycle
  - Volume delegation: `volume`, `muted`, `preservesPitch` forward to VolumeManager
  - A/B compare: `toggleAB()` forwards to ABCompareManager
  - AudioCoordinator wiring: frameChanged, playbackChanged, speedChanged, directionChanged forwarding (mirrors AC-WIRE-001 through AC-WIRE-010)
  - All 14+ events in `SessionPlaybackEvents` fire correctly (including `buffering`)
  - Host interface calls verified: `getCurrentSource()`, `getSourceB()`, `getSourceCount()`
- `getPlaybackState()` / `setPlaybackState()` on Session:
  - Frozen schema conformance test: `getPlaybackState()` output has exactly `{ currentFrame, inPoint, outPoint, fps, loopMode, volume, muted, preservesPitch, marks, currentSourceIndex }`
  - Round-trip idempotency: `setPlaybackState(getPlaybackState())` produces identical state
- `goToNextMarker()` / `goToPreviousMarker()` on Session: existing behavior verified
- `Session.playback.test.ts` (10 `(session as any)` usages): all updated
- `Session.state.test.ts` AudioCoordinator wiring tests (AC-WIRE-001 through AC-WIRE-010): all pass

**Phase 5 -- Cleanup:**
- Event forwarding completeness test: for each of the 31+ event types in `SessionEvents`, verify that subscribing on `session.on(eventName, handler)` fires when the corresponding sub-service emits
- Dispose ordering test: verify `playback.dispose()` is called before `media.dispose()` (mock dispose methods and check call order)
- No remaining `@deprecated` methods with active non-test callers
- Final full regression: `npx vitest run` passes all tests

### Final Risk Rating: MEDIUM

The architectural approach is sound and proven in this codebase. The MEDIUM rating reflects:
- The 8 required design changes identified by both reviews represent real gaps, not editorial issues
- The consumer migration surface is 60-75% larger than estimated (94-102 files vs. 58)
- 5 TestSession subclasses and 71+ `(session as any)` casts create a fragile test migration path
- Cross-service methods (`getPlaybackState`, `goToNextMarker`, audio coordinator wiring) require careful routing that is not yet specified in the plan
- The deprecation shim strategy effectively mitigates runtime risk, keeping the blast radius of each phase manageable

The risk is NOT HIGH because: (a) each phase is independently shippable, (b) backward-compat shims provide a safety net, (c) the full 7,600+ test suite catches most regressions, (d) the host interface pattern is already proven in this codebase.

### Implementation Readiness: READY (after incorporating required changes)

The plan is architecturally correct and the phasing is sound. It requires incorporating the 8 changes identified by the Expert Round 2 review (which I endorse fully) before implementation begins:

1. Add `loadAudioFromVideo` callback to `SessionMediaHost`
2. Add `clearGraphData` callback to `SessionMediaHost`
3. Keep `getPlaybackState()` / `setPlaybackState()` on Session with frozen schema test
4. Keep `goToNextMarker()` / `goToPreviousMarker()` on Session
5. Define TestSession migration strategy (recommend: factory functions + protected test helpers on sub-services)
6. Add `buffering: boolean` to `SessionPlaybackEvents`
7. Correct consumer counts and adjust effort to ~14 days
8. Move shared type extraction to Phase 1 (not Phase 2)

Once these changes are incorporated into the plan document, **implementation can begin with Phase 1**. No fundamental rethinking of the architecture is needed.
