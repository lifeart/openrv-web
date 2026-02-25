# Improvement Plan 3: Refactoring the App God Object

> **Date**: 2026-02-25
> **Scope**: `src/App.ts` and surrounding orchestration layer
> **Status**: Proposed

---

## 1. Problem Statement

### Current State

The `App` class in `src/App.ts` (1,875 lines) acts as the **composition root** for the entire application. While prior refactoring has already extracted significant chunks into satellite modules, the class still carries too many responsibilities:

| File | Lines | Role |
|------|-------|------|
| `src/App.ts` | 1,875 | Constructor, mount, layout, render loop, keyboard actions, playlist/timeline logic, dispose |
| `src/AppControlRegistry.ts` | 1,520 | Instantiates ~71 `readonly` controls, builds tab DOM |
| `src/AppNetworkBridge.ts` | 1,046 | Network sync wiring |
| `src/AppPlaybackWiring.ts` | 885 | Playback, export, volume, playlist wiring |
| `src/AppKeyboardHandler.ts` | 730 | Keyboard shortcut registration and dialogs |
| `src/AppPersistenceManager.ts` | 441 | Save/load, auto-save, snapshots |
| `src/AppSessionBridge.ts` | 323 | Session event -> scope/info updates |
| `src/AppViewWiring.ts` | 215 | View/zoom/stereo wiring |
| `src/AppColorWiring.ts` | 205 | Color/CDL/OCIO wiring |
| `src/AppDCCWiring.ts` | 137 | DCC bridge wiring |
| `src/AppEffectsWiring.ts` | 112 | Filter/crop/lens wiring |
| `src/AppTransformWiring.ts` | 80 | Transform wiring |
| `src/AppStackWiring.ts` | 63 | Stack/composite wiring |
| `src/AppWiringContext.ts` | 32 | Shared interface for wiring |
| **Total** | **~7,664** | |

### Specific Problems

1. **Constructor does too much**: The `App` constructor (lines 122-522, ~400 lines) creates the session, viewer, timeline, 71+ controls via `AppControlRegistry`, initializes keyboard managers, creates persistence/session/network bridges, wires DCC integration, registers contextual keyboard bindings, sets up all wiring modules, and wires timeline editor events. This is impossible to unit-test without standing up the entire application.

2. **`getActionHandlers()` is a 300-line method**: Lines 1137-1451 define a monolithic map of 117 keyboard action handler entries that reference virtually every control via `this.controls.*`, `this.session`, `this.viewer`, `this.paintEngine`, `this.tabBar`, `this.activeContextManager`, etc. This method alone creates coupling to every subsystem.

3. **`createLayout()` is a 300-line method**: Lines 722-1033 builds the DOM tree, appends overlays to the viewer container, wires session announcements, configures accessibility, creates fullscreen manager, sets up image mode transitions, and binds session events. It mixes DOM construction with event wiring.

4. **Playlist/timeline logic embedded in App**: ~200 lines of playlist navigation (lines 1462-1771) including `goToPlaylistStart`, `goToPlaylistEnd`, `goToNextMarkOrBoundary`, `goToPreviousMarkOrBoundary`, `goToNextShot`, `goToPreviousShot`, `jumpToPlaylistGlobalFrame`, timeline EDL normalization, and sequence group node management. This is pure business logic that belongs in its own module.

5. **Session URL state capture/apply in App**: ~100 lines of `captureSessionURLState` and `applySessionURLState` (lines 575-660) which duplicate similar logic in `AppNetworkBridge`. The `handleURLBootstrap` method adds another 60 lines.

6. **No circular dependencies, but high coupling**: While Session does not import from App (confirmed by grep), App reaches into virtually every subsystem, making it the hub of a star topology. Testing any behavior requires mocking the entire `App` instance.

7. **`AppControlRegistry` is itself a god object**: 1,520 lines, 71 `readonly` control properties, a 170-line constructor, and a 1,000-line `setupTabContents` method that builds raw DOM with inline styles and event handlers.

---

## 2. Proposed Solution

### Architecture: Composition Root with Direct Composition

Transform `App` from a god object into a thin **Composition Root** that only:
1. Directly instantiates services via constructor arguments (no DI container)
2. Passes dependencies explicitly between services
3. Calls `mount()` to initialize layout and render loop
4. Disposes services in explicit, hand-ordered sequence in `dispose()`

All current logic moves into focused **service modules** that declare their dependencies via typed interfaces and receive them as constructor parameters.

### Key Principles

- **No DI container or service locator** -- use direct composition in the App constructor. The codebase already has three proven dependency-passing patterns (`AppWiringContext`, `SessionBridgeContext`, `PersistenceManagerContext`); a service locator would be a pattern inconsistency with no concrete benefit.
- **Interface-driven** -- every service depends on interfaces, never on concrete classes.
- **Explicit initialization order** -- services are created in a deterministic sequence in the constructor, preserving the current ordering guarantees.
- **Testable in isolation** -- each service can be instantiated with mock dependencies.
- **Incremental migration** -- extract one service at a time; App delegates to it while tests are green.

---

## 3. Detailed Steps

### Phase 0: Baseline Unit Tests for Untested Dependencies (Est. 1-2 days)

Before any refactoring begins, add unit test coverage for two critical modules that currently have zero direct tests but are deeply wired into the services being extracted.

#### Step 0.1: Create `AppSessionBridge.test.ts`

Create `/Users/lifeart/Repos/openrv-web/src/AppSessionBridge.test.ts` with at least 10 tests covering:
- `bindSessionEvents()` scope scheduling and throttling behavior
- `updateInfoPanel()` data formatting for various source types
- Histogram callback forwarding to the histogram control
- `dispose()` cleanup -- all event listeners are unsubscribed
- Event unsubscription tracking (no leaked listeners after dispose)

#### Step 0.2: Create `AppPersistenceManager.test.ts`

Create `/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.test.ts` with at least 8 tests covering:
- `init()` auto-save timer setup
- `syncGTOStore()` serialization of session state
- `createQuickSnapshot()` snapshot creation and storage
- `dispose()` timer cleanup (no leaked timers)
- OPFS cache integration (mock OPFS API)

Record the exact test count after Phase 0 merges. This is the regression baseline for all subsequent phases.

---

### Phase 1: Extract Focused Orchestrators from App (Est. 5-7 days)

#### Step 1.1a: Extract `FrameNavigationService`

**Source**: Lines 1462-1650 in `App.ts` (playlist/annotation frame navigation -- 9 methods)

Create `/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.ts`:

```typescript
export interface FrameNavigationDeps {
  session: Session;
  playlistManager: PlaylistManager;
  playlistPanel: PlaylistPanel;
  paintEngine: PaintEngine;
}

export class FrameNavigationService {
  constructor(private deps: FrameNavigationDeps) {}

  goToPlaylistStart(): void { /* move from App */ }
  goToPlaylistEnd(): void { /* move from App */ }
  goToNextMarkOrBoundary(): void { /* move from App */ }
  goToPreviousMarkOrBoundary(): void { /* move from App */ }
  goToNextShot(): void { /* move from App */ }
  goToPreviousShot(): void { /* move from App */ }
  goToNextAnnotation(): void { /* move from App */ }
  goToPreviousAnnotation(): void { /* move from App */ }
  jumpToPlaylistGlobalFrame(globalFrame: number): void { /* move from App */ }

  dispose(): void {}
}
```

**Files to modify**:
- `/Users/lifeart/Repos/openrv-web/src/App.ts` -- remove ~190 lines, delegate to service
- Create `/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.ts` (~190 lines)
- Create `/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.test.ts` (min 15 tests)

#### Step 1.1b: Extract `TimelineEditorService`

**Source**: Lines 1650-1771 in `App.ts` (timeline EDL/sequence integration -- 7 methods)

Create `/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts`:

```typescript
export interface TimelineEditorServiceDeps {
  session: Session;
  playlistManager: PlaylistManager;
  playlistPanel: PlaylistPanel;
  timelineEditor: TimelineEditor;
  timeline: Timeline;
  persistenceManager: AppPersistenceManager;
}

export class TimelineEditorService {
  constructor(private deps: TimelineEditorServiceDeps) {}

  handleTimelineEditorCutSelected(cutIndex: number): void { /* move from App */ }
  applyTimelineEditorEdits(): void { /* move from App */ }
  applyTimelineEditorEditsToPlaylist(): void { /* move from App */ }
  syncTimelineEditorFromGraph(): void { /* move from App */ }
  normalizeTimelineEditorEDL(): void { /* move from App */ }
  buildFallbackTimelineEDLFromSources(): void { /* move from App */ }

  // Wire timeline editor events
  bindTimelineEditorEvents(): void { /* move from App constructor */ }

  dispose(): void {}
}
```

**Files to modify**:
- `/Users/lifeart/Repos/openrv-web/src/App.ts` -- remove ~120 lines, delegate to service
- Create `/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts` (~120 lines)
- Create `/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.test.ts` (min 12 tests)

#### Step 1.2: Extract `KeyboardActionMap`

**Source**: Lines 1137-1451 in `App.ts` (`getActionHandlers()`)

Create `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts`:

```typescript
/**
 * Builds the keyboard action -> handler map.
 * Decouples action definitions from the App class.
 */
export interface KeyboardActionDeps {
  session: Session;
  viewer: Viewer;
  paintEngine: PaintEngine;
  tabBar: TabBar;
  controls: AppControlRegistry;
  activeContextManager: ActiveContextManager;
  fullscreenManager: FullscreenManager;
  focusManager: FocusManager;
  shortcutCheatSheet: ShortcutCheatSheet;
  persistenceManager: AppPersistenceManager;
  sessionBridge: AppSessionBridge;
  layoutStore: LayoutStore;
  externalPresentation: ExternalPresentation;
  headerBar: HeaderBar;
  frameNavigation: FrameNavigationService;
}

export function buildActionHandlers(deps: KeyboardActionDeps): Record<string, () => void> {
  const { session, viewer, paintEngine, controls, ... } = deps;
  return {
    'playback.toggle': () => session.togglePlayback(),
    'playback.stepForward': () => session.stepForward(),
    // ... all 117 handler entries moved here
  };
}
```

**Files to modify**:
- `/Users/lifeart/Repos/openrv-web/src/App.ts` -- remove ~315 lines
- Create `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts` (~320 lines)
- Create `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.test.ts` (min 20 tests)

#### Step 1.3: Extract `LayoutOrchestrator`

**Source**: Lines 722-1033 in `App.ts` (`createLayout()`)

Create `/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts`:

```typescript
export interface LayoutOrchestratorDeps {
  container: HTMLElement;
  session: Session;
  viewer: Viewer;
  headerBar: HeaderBar;
  tabBar: TabBar;
  contextToolbar: ContextToolbar;
  timeline: Timeline;
  controls: AppControlRegistry;
  sessionBridge: AppSessionBridge;
  layoutStore: LayoutStore;
  layoutManager: LayoutManager;
  clientMode: ClientMode;
  paintEngine: PaintEngine;
}

export class LayoutOrchestrator {
  private fullscreenManager!: FullscreenManager;
  private focusManager!: FocusManager;
  private ariaAnnouncer!: AriaAnnouncer;
  private shortcutCheatSheet!: ShortcutCheatSheet;

  constructor(private deps: LayoutOrchestratorDeps) {}

  /**
   * Build the DOM layout, wire overlays, configure a11y, bind session
   * events for layout updates (image mode, announcements, etc.).
   */
  createLayout(): void { /* moved from App.createLayout() */ }

  getFullscreenManager(): FullscreenManager { return this.fullscreenManager; }
  getFocusManager(): FocusManager { return this.focusManager; }
  getShortcutCheatSheet(): ShortcutCheatSheet { return this.shortcutCheatSheet; }

  dispose(): void {
    this.fullscreenManager?.dispose();
    this.focusManager?.dispose();
    this.ariaAnnouncer?.dispose();
    this.shortcutCheatSheet?.dispose();
  }
}
```

**Files to modify**:
- `/Users/lifeart/Repos/openrv-web/src/App.ts` -- remove ~310 lines from `createLayout()` + `applyClientModeRestrictions()`
- Create `/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts` (~330 lines)
- Create `/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.test.ts` (min 10 tests)

#### Step 1.4: Extract `RenderLoopService`

**Source**: Lines 1773-1813 in `App.ts` (`start()` + `tick()`)

Create `/Users/lifeart/Repos/openrv-web/src/services/RenderLoopService.ts`:

```typescript
export interface RenderLoopDeps {
  session: Session;
  viewer: Viewer;
}

export class RenderLoopService {
  private animationId: number | null = null;

  constructor(private deps: RenderLoopDeps) {}

  start(): void {
    this.tick();
  }

  private tick = (): void => {
    // Move tick logic from App
    PerfTrace.begin('tick');
    const frameBefore = this.deps.session.currentFrame;
    PerfTrace.begin('session.update');
    this.deps.session.update();
    PerfTrace.end('session.update');

    const source = this.deps.session.currentSource;
    if (source?.type === 'video' && this.deps.session.isPlaying) {
      if (this.deps.session.currentFrame !== frameBefore) {
        PerfTrace.begin('viewer.renderDirect');
        this.deps.viewer.renderDirect();
        PerfTrace.end('viewer.renderDirect');
        PerfTrace.frame();
      } else {
        PerfTrace.count('tick.noFrameAdvance');
      }
    }

    PerfTrace.end('tick');
    this.animationId = requestAnimationFrame(this.tick);
  };

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  dispose(): void {
    this.stop();
  }
}
```

**Files to modify**:
- `/Users/lifeart/Repos/openrv-web/src/App.ts` -- remove ~40 lines
- Create `/Users/lifeart/Repos/openrv-web/src/services/RenderLoopService.ts` (~60 lines)
- Create `/Users/lifeart/Repos/openrv-web/src/services/RenderLoopService.test.ts` (min 6 tests)

#### Step 1.5: Extract `SessionURLService`

**Source**: Lines 575-720 in `App.ts` (`captureSessionURLState`, `applySessionURLState`, `handleURLBootstrap`)

Create `/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts`:

```typescript
export interface SessionURLDeps {
  session: Session;
  viewer: Viewer;
  controls: AppControlRegistry;
}

export class SessionURLService {
  constructor(private deps: SessionURLDeps) {}

  captureState(): SessionURLState { /* move from App */ }
  applyState(state: SessionURLState): void { /* move from App */ }
  async handleURLBootstrap(): Promise<void> { /* move from App */ }

  dispose(): void {}
}
```

**Files to modify**:
- `/Users/lifeart/Repos/openrv-web/src/App.ts` -- remove ~145 lines
- Create `/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts` (~150 lines)
- Create `/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.test.ts` (min 8 tests)

**Note**: After `SessionURLService` is extracted, `AppNetworkBridge` should delegate to it for `captureState`/`applyState` rather than maintaining parallel URL state logic. This deduplication should be addressed as a follow-up within this phase.

#### Step 1.6: Extract `AudioOrchestrator`

**Source**: Lines 414-465 in `App.ts` (audio mixer wiring, audio track loading)

Create `/Users/lifeart/Repos/openrv-web/src/services/AudioOrchestrator.ts`:

```typescript
export interface AudioOrchestratorDeps {
  session: Session;
  audioMixer: AudioMixer;
}

export class AudioOrchestrator {
  private audioInitialized = false;
  private unsubscribers: (() => void)[] = [];

  constructor(private deps: AudioOrchestratorDeps) {}

  /**
   * Bind session events for audio playback sync and track loading.
   */
  bindEvents(): void { /* move audio wiring from App constructor */ }

  /**
   * Lazy-init AudioContext on first user interaction.
   */
  setupLazyInit(): void { /* move from App.mount() */ }

  get isInitialized(): boolean { return this.audioInitialized; }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.deps.audioMixer.dispose();
  }
}
```

**Files to modify**:
- `/Users/lifeart/Repos/openrv-web/src/App.ts` -- remove ~60 lines
- Create `/Users/lifeart/Repos/openrv-web/src/services/AudioOrchestrator.ts` (~80 lines)
- Create `/Users/lifeart/Repos/openrv-web/src/services/AudioOrchestrator.test.ts` (min 6 tests)

---

### Phase 2: Split `AppControlRegistry` (Est. 3-4 days)

The 1,520-line `AppControlRegistry` with 65 readonly properties should be split into **domain-specific control groups**. Each group owns the controls for one tab/domain. `AppControlRegistry` remains as a **permanent facade** over the groups -- wiring modules continue to access `controls.colorControls` etc. through compatibility getters. This facade is the intended final state, not a migration artifact, because the wiring modules cut across the proposed control groups and need a unified access point.

#### Step 2.1: Define control group interfaces

Create `/Users/lifeart/Repos/openrv-web/src/services/controls/ControlGroups.ts`:

```typescript
/** Controls for the Color tab */
export interface ColorControlGroup {
  colorControls: ColorControls;
  colorInversionToggle: ColorInversionToggle;
  premultControl: PremultControl;
  cdlControl: CDLControl;
  curvesControl: CurvesControl;
  ocioControl: OCIOControl;
  lutPipelinePanel: LUTPipelinePanel;
  displayProfileControl: DisplayProfileControl;
  gamutMappingControl: GamutMappingControl;
}

/** Controls for the View tab */
export interface ViewControlGroup {
  zoomControl: ZoomControl;
  channelSelect: ChannelSelect;
  compareControl: CompareControl;
  referenceManager: ReferenceManager;
  stereoControl: StereoControl;
  stereoEyeTransformControl: StereoEyeTransformControl;
  stereoAlignControl: StereoAlignControl;
  ghostFrameControl: GhostFrameControl;
  convergenceMeasure: ConvergenceMeasure;
  floatingWindowControl: FloatingWindowControl;
  sphericalProjection: SphericalProjection;
  stackControl: StackControl;
  parControl: PARControl;
  backgroundPatternControl: BackgroundPatternControl;
}

/** Controls for the Effects tab */
export interface EffectsControlGroup {
  filterControl: FilterControl;
  lensControl: LensControl;
  deinterlaceControl: DeinterlaceControl;
  filmEmulationControl: FilmEmulationControl;
  perspectiveCorrectionControl: PerspectiveCorrectionControl;
  stabilizationControl: StabilizationControl;
  noiseReductionControl: NoiseReductionControl;
  watermarkControl: WatermarkControl;
  slateEditor: SlateEditor;
  timelineEditor: TimelineEditor;
}

/** Controls for the Transform tab */
export interface TransformControlGroup {
  transformControl: TransformControl;
  cropControl: CropControl;
}

/** Controls for the Annotate tab */
export interface AnnotateControlGroup {
  paintToolbar: PaintToolbar;
  textFormattingToolbar: TextFormattingToolbar;
}

/** Analysis/monitoring scopes */
export interface AnalysisControlGroup {
  scopesControl: ScopesControl;
  histogram: Histogram;
  waveform: Waveform;
  vectorscope: Vectorscope;
  gamutDiagram: GamutDiagram;
  safeAreasControl: SafeAreasControl;
  falseColorControl: FalseColorControl;
  luminanceVisControl: LuminanceVisualizationControl;
  toneMappingControl: ToneMappingControl;
  zebraControl: ZebraControl;
  hslQualifierControl: HSLQualifierControl;
}

/** Panels and persistence controls */
export interface PanelControlGroup {
  historyPanel: HistoryPanel;
  infoPanel: InfoPanel;
  markerListPanel: MarkerListPanel;
  notePanel: NotePanel;
  snapshotPanel: SnapshotPanel;
  playlistPanel: PlaylistPanel;
  shotGridPanel: ShotGridPanel;
  conformPanel: ConformPanel;
  rightPanelContent: RightPanelContent;
  leftPanelContent: LeftPanelContent;
  cacheIndicator: CacheIndicator;
}

/** Playback/session management controls */
export interface PlaybackControlGroup {
  autoSaveManager: AutoSaveManager;
  autoSaveIndicator: AutoSaveIndicator;
  snapshotManager: SnapshotManager;
  playlistManager: PlaylistManager;
  transitionManager: TransitionManager;
  presentationMode: PresentationMode;
  networkSyncManager: NetworkSyncManager;
  networkControl: NetworkControl;
}
```

#### Step 2.2: Create control group factory functions

Create one factory per group under `/Users/lifeart/Repos/openrv-web/src/services/controls/`:

```
src/services/controls/
  ControlGroups.ts         -- interfaces (above)
  createColorControls.ts   -- factory for ColorControlGroup
  createViewControls.ts    -- factory for ViewControlGroup
  createEffectsControls.ts -- factory for EffectsControlGroup
  createTransformControls.ts
  createAnnotateControls.ts
  createAnalysisControls.ts
  createPanelControls.ts
  createPlaybackControls.ts
```

Each factory takes `ControlRegistryDeps` (session, viewer, paintEngine, displayCapabilities) and returns the group interface:

```typescript
// Example: src/services/controls/createColorControls.ts
export function createColorControls(deps: ControlRegistryDeps): ColorControlGroup {
  return {
    colorControls: new ColorControls(),
    colorInversionToggle: new ColorInversionToggle(),
    premultControl: new PremultControl(),
    cdlControl: new CDLControl(),
    curvesControl: new CurvesControl(),
    ocioControl: new OCIOControl(),
    lutPipelinePanel: new LUTPipelinePanel(deps.viewer.getLUTPipeline()),
    displayProfileControl: new DisplayProfileControl(),
    gamutMappingControl: new GamutMappingControl(),
  };
}
```

#### Step 2.3: Refactor `AppControlRegistry` to compose groups (permanent facade)

```typescript
// Refactored AppControlRegistry
export class AppControlRegistry {
  readonly color: ColorControlGroup;
  readonly view: ViewControlGroup;
  readonly effects: EffectsControlGroup;
  readonly transform: TransformControlGroup;
  readonly annotate: AnnotateControlGroup;
  readonly analysis: AnalysisControlGroup;
  readonly panels: PanelControlGroup;
  readonly playback: PlaybackControlGroup;

  constructor(deps: ControlRegistryDeps) {
    this.color = createColorControls(deps);
    this.view = createViewControls(deps);
    this.effects = createEffectsControls(deps);
    this.transform = createTransformControls(deps);
    this.annotate = createAnnotateControls(deps);
    this.analysis = createAnalysisControls(deps);
    this.panels = createPanelControls(deps);
    this.playback = createPlaybackControls(deps);
  }
  // ...
}
```

**Note**: The internal organization uses `controls.color.colorControls`, but `AppControlRegistry` provides **permanent compatibility getters** (`get colorControls() { return this.color.colorControls; }`) so that wiring modules continue using `controls.colorControls` unchanged. This facade is the intended final state -- wiring modules cut across the proposed control groups and need the unified access point. A "shim completeness" assertion must be added to `AppControlRegistry.test.ts` to verify that every original property name resolves to a non-undefined value through the facade (see Testing Strategy).

#### Step 2.4: Extract `setupTabContents()` into per-tab builder functions

The 1,000-line `setupTabContents()` method should be split into:

```
src/services/tabContent/
  buildViewTab.ts       -- ~300 lines (currently the longest section)
  buildColorTab.ts      -- ~50 lines
  buildEffectsTab.ts    -- ~100 lines
  buildTransformTab.ts  -- ~30 lines
  buildAnnotateTab.ts   -- ~40 lines
  buildQCTab.ts         -- ~50 lines
```

Each function takes the relevant control group + viewer + session and returns an HTMLElement.

---

### Phase 3: Slim Down App Constructor (Est. 1 day)

After Phases 0-2, rewrite `App.ts` to be a thin Composition Root using **direct composition** -- no DI container, no service locator. The App constructor directly instantiates services and passes them to each other via constructor arguments, preserving full type safety and explicit initialization/disposal ordering:

```typescript
export class App {
  private displayCapabilities: DisplayCapabilities;
  private session: Session;
  private viewer: Viewer;
  private paintEngine: PaintEngine;
  private controls: AppControlRegistry;
  private renderLoop: RenderLoopService;
  private frameNavigation: FrameNavigationService;
  private timelineEditorService: TimelineEditorService;
  private layout: LayoutOrchestrator;
  private audio: AudioOrchestrator;
  private sessionURL: SessionURLService;
  private sessionBridge: AppSessionBridge;
  private networkBridge: AppNetworkBridge;
  private persistenceManager: AppPersistenceManager;
  private keyboardHandler: AppKeyboardHandler;

  constructor() {
    // Core objects
    this.displayCapabilities = detectDisplayCapabilities();
    this.session = new Session();
    this.session.setHDRResizeTier(this.displayCapabilities.canvasHDRResizeTier);
    this.paintEngine = new PaintEngine();
    this.viewer = new Viewer({
      session: this.session,
      paintEngine: this.paintEngine,
      capabilities: this.displayCapabilities,
    });

    // Controls (grouped internally, facade provides flat access)
    this.controls = new AppControlRegistry({ ... });

    // Services with explicit dependencies
    this.renderLoop = new RenderLoopService({
      session: this.session,
      viewer: this.viewer,
    });
    this.frameNavigation = new FrameNavigationService({
      session: this.session,
      playlistManager: this.controls.playlistManager,
      playlistPanel: this.controls.playlistPanel,
      paintEngine: this.paintEngine,
    });
    this.timelineEditorService = new TimelineEditorService({
      session: this.session,
      playlistManager: this.controls.playlistManager,
      playlistPanel: this.controls.playlistPanel,
      timelineEditor: this.controls.timelineEditor,
      timeline: this.timeline,
      persistenceManager: this.persistenceManager,
    });
    this.audio = new AudioOrchestrator({
      session: this.session,
      audioMixer: new AudioMixer(),
    });
    this.sessionURL = new SessionURLService({
      session: this.session,
      viewer: this.viewer,
      controls: this.controls,
    });

    // Action handlers (pure function)
    const actionHandlers = buildActionHandlers({
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      controls: this.controls,
      frameNavigation: this.frameNavigation,
      // ... other deps
    });

    // Keyboard handler
    this.keyboardHandler = new AppKeyboardHandler(
      new KeyboardManager(),
      new CustomKeyBindingsManager(() => this.keyboardHandler.refresh()),
      { getActionHandlers: () => actionHandlers },
    );

    // Bridges (using existing typed context patterns)
    this.sessionBridge = new AppSessionBridge({ ... });
    this.networkBridge = new AppNetworkBridge({ ... });
    this.persistenceManager = new AppPersistenceManager({ ... });

    // Layout
    this.layout = new LayoutOrchestrator({ ... });

    // Wiring modules (unchanged -- receive AppWiringContext)
    const ctx: AppWiringContext = {
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      headerBar: this.headerBar,
      tabBar: this.tabBar,
      controls: this.controls,
      sessionBridge: this.sessionBridge,
      persistenceManager: this.persistenceManager,
    };
    wireColorControls(ctx);
    wireViewControls(ctx);
    wireEffectsControls(ctx);
    wireTransformControls(ctx);
    wireStackControls(ctx);
    wirePlaybackControls(ctx, {
      getKeyboardHandler: () => this.keyboardHandler,
      getFullscreenManager: () => this.layout.getFullscreenManager(),
      getAudioMixer: () => this.audio.getAudioMixer(),
    });

    // Timeline editor event binding
    this.timelineEditorService.bindTimelineEditorEvents();
  }

  async mount(selector: string): Promise<void> {
    const container = document.querySelector(selector);
    if (!container) throw new Error(`Container not found: ${selector}`);

    this.layout.createLayout();
    this.renderLoop.start();
    this.audio.setupLazyInit();
    await this.sessionURL.handleURLBootstrap();
  }

  getAPIConfig(): OpenRVAPIConfig {
    return {
      session: this.session,
      viewer: this.viewer,
      colorControls: this.controls.colorControls,
      cdlControl: this.controls.cdlControl,
      curvesControl: this.controls.curvesControl,
    };
  }

  dispose(): void {
    // Explicit, hand-ordered disposal (matching current App.dispose() semantics)
    this.renderLoop.dispose();
    this.audio.dispose();
    this.networkBridge.dispose();
    this.persistenceManager.dispose();
    this.sessionBridge.dispose();
    this.keyboardHandler.dispose();
    this.layout.dispose();
    this.timelineEditorService.dispose();
    this.frameNavigation.dispose();
    this.viewer.dispose();
    this.controls.dispose();
    this.session.dispose();
  }
}
```

**Target**: App.ts shrinks from ~1,875 lines to ~200 lines.

**Note on `wirePlaybackControls`**: Unlike other wiring functions, `wirePlaybackControls(ctx, extraDeps)` takes an additional `{ getKeyboardHandler, getFullscreenManager, getAudioMixer }` parameter (confirmed at line 499-503 of `App.ts`). The Phase 3 code sample above explicitly wires these extra deps.

---

### Phase 4: Migration Strategy (Incremental, Non-Breaking)

The refactoring must be done incrementally because:
- All existing tests must stay green at every step (run `npx vitest run` for exact baseline count before starting)
- The wiring modules (`AppColorWiring.ts`, `AppViewWiring.ts`, etc.) reference `controls.colorControls` -- the permanent facade preserves this API
- Multiple files depend on the `AppWiringContext` interface, which remains unchanged

#### Migration Order

1. **Phase 0** (Baseline tests): Create `AppSessionBridge.test.ts` and `AppPersistenceManager.test.ts`. Purely additive.
2. **Phase 1.1a** (FrameNavigationService): Extract frame navigation methods from App, delegate via thin wrappers. Remove wrappers once all callers updated.
3. **Phase 1.1b** (TimelineEditorService): Extract timeline editor integration. App delegates.
4. **Phase 1.2** (KeyboardActionMap): Extract `getActionHandlers()` to pure function. App calls it.
5. **Phase 1.3** (LayoutOrchestrator): Extract `createLayout()`. App calls it.
6. **Phase 1.4** (RenderLoopService): Extract `tick()`. Smallest change.
7. **Phase 1.5** (SessionURLService): Extract URL methods. App delegates. Follow up with `AppNetworkBridge` deduplication.
8. **Phase 1.6** (AudioOrchestrator): Extract audio wiring.
9. **Phase 2.1-2.2** (Control groups): Create group interfaces and factories alongside existing registry.
10. **Phase 2.3** (Refactor registry): Add permanent compatibility getters that proxy `controls.colorControls` to `controls.color.colorControls` so wiring modules work unchanged:

```typescript
// Permanent facade getters in AppControlRegistry
get colorControls(): ColorControls { return this.color.colorControls; }
get cdlControl(): CDLControl { return this.color.cdlControl; }
// ... etc for all 65 properties
```

11. **Phase 2.4** (Tab builders): Extract `setupTabContents()` sections.
12. **Phase 3** (Composition root): Slim down App constructor using direct composition. Disposal remains explicit and hand-ordered.

#### Compatibility Layer

The `AppWiringContext` interface remains stable throughout the refactoring:

```typescript
// AppWiringContext.ts -- unchanged
export interface AppWiringContext {
  session: Session;
  viewer: Viewer;
  paintEngine: PaintEngine;
  headerBar: HeaderBar;
  tabBar: TabBar;
  controls: AppControlRegistry; // permanent facade with compatibility getters
  sessionBridge: AppSessionBridge;
  persistenceManager: AppPersistenceManager;
}
```

Wiring modules (`AppColorWiring.ts`, etc.) continue to reference `ctx.controls.colorControls` unchanged permanently. The `AppControlRegistry` facade is the intended final state, not a migration artifact -- wiring modules cut across the proposed control groups and need the unified access point.

---

## 4. New Files Created

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/AppSessionBridge.test.ts` | 150 | Phase 0: Baseline tests for AppSessionBridge (min 10 tests) |
| `src/AppPersistenceManager.test.ts` | 120 | Phase 0: Baseline tests for AppPersistenceManager (min 8 tests) |
| `src/services/FrameNavigationService.ts` | 190 | Frame/playlist/annotation navigation from App |
| `src/services/FrameNavigationService.test.ts` | 300 | Unit tests (min 15 tests) |
| `src/services/TimelineEditorService.ts` | 120 | Timeline EDL/sequence integration from App |
| `src/services/TimelineEditorService.test.ts` | 250 | Unit tests (min 12 tests) |
| `src/services/KeyboardActionMap.ts` | 320 | 117 action handler entries from App |
| `src/services/KeyboardActionMap.test.ts` | 400 | Unit tests (min 20 tests) |
| `src/services/LayoutOrchestrator.ts` | 330 | Layout/DOM/a11y from App |
| `src/services/LayoutOrchestrator.test.ts` | 250 | Unit tests (min 10 tests) |
| `src/services/RenderLoopService.ts` | 60 | Render loop from App |
| `src/services/RenderLoopService.test.ts` | 100 | Unit tests (min 6 tests) |
| `src/services/SessionURLService.ts` | 150 | URL state capture/apply/bootstrap |
| `src/services/SessionURLService.test.ts` | 150 | Unit tests (min 8 tests) |
| `src/services/AudioOrchestrator.ts` | 80 | Audio wiring from App |
| `src/services/AudioOrchestrator.test.ts` | 100 | Unit tests (min 6 tests) |
| `src/services/controls/ControlGroups.ts` | 120 | Control group interfaces |
| `src/services/controls/createColorControls.ts` | 30 | Color factory |
| `src/services/controls/createViewControls.ts` | 40 | View factory |
| `src/services/controls/createEffectsControls.ts` | 35 | Effects factory |
| `src/services/controls/createTransformControls.ts` | 15 | Transform factory |
| `src/services/controls/createAnnotateControls.ts` | 15 | Annotate factory |
| `src/services/controls/createAnalysisControls.ts` | 30 | Analysis factory |
| `src/services/controls/createPanelControls.ts` | 40 | Panel factory |
| `src/services/controls/createPlaybackControls.ts` | 30 | Playback factory |
| `src/services/tabContent/buildViewTab.ts` | 300 | View tab DOM builder |
| `src/services/tabContent/buildColorTab.ts` | 50 | Color tab DOM builder |
| `src/services/tabContent/buildEffectsTab.ts` | 100 | Effects tab DOM builder |
| `src/services/tabContent/buildTransformTab.ts` | 30 | Transform tab DOM builder |
| `src/services/tabContent/buildAnnotateTab.ts` | 40 | Annotate tab DOM builder |
| `src/services/tabContent/buildQCTab.ts` | 50 | QC tab DOM builder |

**Total new files**: ~31
**Total new lines**: ~4,000 (including tests)

---

## 5. Files Modified

| File | Change |
|------|--------|
| `src/App.ts` | Shrinks from 1,875 to ~200 lines (direct composition, no container) |
| `src/AppControlRegistry.ts` | Refactored to compose control groups with permanent facade; shrinks from 1,520 to ~300 lines |
| `src/AppControlRegistry.test.ts` | Add shim completeness assertion (verify all 65 original properties resolve through facade) |
| `src/AppWiringContext.ts` | Unchanged -- keeps typed contract as-is |
| `src/AppColorWiring.ts` | Unchanged -- facade provides compatibility |
| `src/AppViewWiring.ts` | Unchanged -- facade provides compatibility |
| `src/AppEffectsWiring.ts` | Unchanged -- facade provides compatibility |
| `src/AppTransformWiring.ts` | Unchanged -- facade provides compatibility |
| `src/AppPlaybackWiring.ts` | Unchanged -- facade provides compatibility |
| `src/AppStackWiring.ts` | Unchanged -- facade provides compatibility |
| `src/AppNetworkBridge.ts` | Updated to delegate to `SessionURLService` for URL state (Phase 1.5 follow-up) |
| `src/main.ts` | No change needed (App public API unchanged) |

---

## 6. Risk Assessment

### Low Risk
- **Phase 0 (Baseline tests)**: Purely additive, no existing code modified.
- **Phase 1.4 (RenderLoopService)**: Small, self-contained extraction (40 lines).
- **Phase 1.6 (AudioOrchestrator)**: Isolated audio logic, no cross-cutting concerns.

### Medium Risk
- **Phase 1.1a (FrameNavigationService)**: ~190 lines of navigation logic; must carefully preserve the bidirectional interaction between `PlaylistManager` and `Session`.
- **Phase 1.1b (TimelineEditorService)**: ~120 lines with broader dependencies including persistence and graph traversal. Must preserve `SequenceGroupNode` resolution and EDL normalization behavior.
- **Phase 1.2 (KeyboardActionMap)**: Pure function extraction, but 117 handler entries contain context-sensitive logic (3 `activeContextManager` guards, 2 `tabBar.activeTab` checks). Must ensure `activeContextManager` state is correctly passed.
- **Phase 1.3 (LayoutOrchestrator)**: DOM construction + event binding is fragile. Integration tests needed.

### Higher Risk
- **Phase 2 (Control group split)**: The biggest risk is the transition from `controls.filterControl` to `controls.effects.filterControl`. The permanent compatibility facade mitigates this, but there are ~12 files (wiring modules + bridges) that reference controls directly. The "shim completeness" assertion in `AppControlRegistry.test.ts` catches missing getters that would produce runtime `undefined` errors.
- **Phase 3 (Composition root rewire)**: Final integration of all changes. The App constructor's implicit initialization ordering (400 lines, carefully sequenced) must be preserved in the new direct-composition form. The boot sequence smoke test is the primary safety net.

### Mitigations
1. Each phase is a separate PR with full CI green.
2. Permanent compatibility facade in Phase 2 ensures zero breakage for wiring modules.
3. TypeScript compiler will catch missing/wrong property references.
4. Existing test suite (407 test files) provides strong regression coverage.
5. Phase 0 baseline tests ensure `AppSessionBridge` and `AppPersistenceManager` behavior is captured before refactoring begins.
6. Direct composition (no service locator) preserves full type safety and eliminates lazy-initialization ordering risk.

---

## 7. Testing Strategy

### Minimum New Tests Per Phase

A total of **>= 113 new tests** are required across all phases. This is the minimum to achieve adequate coverage of the extracted services.

| Phase | New tests (minimum) | Test file |
|-------|-------------------|-----------|
| Phase 0 | 18 | `AppSessionBridge.test.ts` (10), `AppPersistenceManager.test.ts` (8) |
| Phase 1.1a | 15 | `FrameNavigationService.test.ts` |
| Phase 1.1b | 12 | `TimelineEditorService.test.ts` |
| Phase 1.2 | 20 | `KeyboardActionMap.test.ts` |
| Phase 1.3 | 10 | `LayoutOrchestrator.test.ts` |
| Phase 1.4 | 6 | `RenderLoopService.test.ts` |
| Phase 1.5 | 8 | `SessionURLService.test.ts` |
| Phase 1.6 | 6 | `AudioOrchestrator.test.ts` |
| Phase 2.1-2.3 | 9 | Shim completeness (1), per-group factory (8) |
| Phase 2.4 | 6 | Per-tab builder tests (6) |
| Phase 3 | 3 | Boot smoke (1), dispose smoke (1), `getAPIConfig()` shape (1) |
| **Total** | **113** | |

### Unit Tests (per extracted service)
Each new service gets its own `.test.ts` file. Mock dependencies via simple objects implementing the dependency interface. Example:

```typescript
// FrameNavigationService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { FrameNavigationService } from './FrameNavigationService';

describe('FrameNavigationService', () => {
  function createMockDeps() {
    return {
      session: {
        currentFrame: 10,
        goToFrame: vi.fn(),
        currentSourceIndex: 0,
        setCurrentSource: vi.fn(),
        setInPoint: vi.fn(),
        setOutPoint: vi.fn(),
        goToNextMarker: vi.fn().mockReturnValue(null),
        goToPreviousMarker: vi.fn().mockReturnValue(null),
        // ...
      },
      playlistManager: {
        isEnabled: vi.fn().mockReturnValue(true),
        getCurrentFrame: vi.fn().mockReturnValue(1),
        getClipByIndex: vi.fn(),
        getClipAtFrame: vi.fn(),
        // ...
      },
      // ... minimal mocks for other deps
    };
  }

  it('goToNextAnnotation wraps to first frame when at end', () => {
    const deps = createMockDeps();
    deps.paintEngine = {
      getAnnotatedFrames: vi.fn().mockReturnValue(new Set([5, 15, 25])),
    };
    deps.session.currentFrame = 30;
    const service = new FrameNavigationService(deps as any);

    service.goToNextAnnotation();

    expect(deps.session.goToFrame).toHaveBeenCalledWith(5);
  });
});
```

### Shim Completeness Assertion (Phase 2.3)

Add to `AppControlRegistry.test.ts` during Phase 2.3:

```typescript
it('all original readonly properties resolve through the facade', () => {
  // Enumerate all 65 readonly properties from the pre-refactoring registry
  const originalKeys = [
    'colorControls', 'colorInversionToggle', 'premultControl', 'cdlControl',
    'curvesControl', 'ocioControl', 'lutPipelinePanel', 'displayProfileControl',
    // ... all 65 property names
  ];

  const registry = new AppControlRegistry(deps);
  for (const key of originalKeys) {
    expect((registry as any)[key], `Missing facade getter: ${key}`).toBeDefined();
    expect((registry as any)[key], `Facade getter returns null: ${key}`).not.toBeNull();
  }
});
```

### Integration Tests
- Verify that the refactored `App` still passes all existing tests in:
  - `src/AppColorWiring.test.ts` (425 lines)
  - `src/AppViewWiring.test.ts` (302 lines)
  - `src/AppEffectsWiring.test.ts` (291 lines)
  - `src/AppPlaybackWiring.test.ts` (767 lines)
  - `src/AppTransformWiring.test.ts` (169 lines)
  - `src/AppNetworkBridge.test.ts` (1,159 lines)
  - `src/AppControlRegistry.test.ts` (502 lines)
  - `src/AppKeyboardHandler.test.ts` (134 lines)
  - `src/AppWiringFixes.test.ts` (603 lines)
  - `src/AppStackWiring.test.ts` (118 lines)

### Regression Gate
Every PR must pass: `npx vitest run` (all tests, count >= Phase 0 baseline) and `npx tsc --noEmit` (zero type errors). Record the exact test count after Phase 0 merges and assert count >= baseline at every subsequent phase.

---

## 8. Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| `App.ts` line count | 1,875 | ~200 | < 250 |
| `AppControlRegistry.ts` line count | 1,520 | ~300 | < 400 |
| Largest method in App | ~400 (constructor) | ~30 | < 50 |
| Number of `this.*` references in App | ~250 | ~20 | < 30 |
| Services testable in isolation | 0 | 7+ | All new services |
| New test files | 0 | 10+ | 1 per service + Phase 0 baseline files |
| Total new tests | 0 | >= 113 | Net positive |
| TypeScript errors | 0 | 0 | 0 at every phase |

---

## 9. Estimated Effort

| Phase | Description | Estimated Days | PRs |
|-------|-------------|---------------|-----|
| 0 | Baseline tests for AppSessionBridge + AppPersistenceManager | 1-2 | 1 |
| 1.1a | FrameNavigationService (frame navigation only) | 1.5 | 1 |
| 1.1b | TimelineEditorService (EDL/sequence integration) | 1.5 | 1 |
| 1.2 | KeyboardActionMap | 1 | 1 |
| 1.3 | LayoutOrchestrator | 2-3 | 1 |
| 1.4 | RenderLoopService | 0.5 | 1 |
| 1.5 | SessionURLService | 1 | 1 |
| 1.6 | AudioOrchestrator | 0.5 | 1 |
| 2.1-2.2 | Control group interfaces + factories | 2 | 1 |
| 2.3 | Refactor AppControlRegistry with permanent facade | 1.5 | 1 |
| 2.4 | Extract tab builders | 2 | 1 |
| 3 | Slim down App constructor (direct composition, no container) | 1 | 1 |
| **Total** | | **14-18 days** | **12 PRs** |

Note: The original Phase 1 (ServiceContainer) is eliminated entirely, saving 2-3 days. Phase 0 adds 1-2 days for baseline tests. Phase 3 is simplified from 2-3 days to 1 day because there is no container to wire -- it is just removing the now-delegated code from App and using direct composition. Net savings: ~3-4 days off the original estimate.

---

## 10. Resolved Decisions

The following were originally open questions. They are now resolved as firm decisions based on the Round 1 and Round 2 review feedback.

1. **No DI container -- use direct composition.** The ServiceContainer has been dropped entirely. The codebase already has three proven dependency-passing patterns (`AppWiringContext`, `SessionBridgeContext`, `PersistenceManagerContext`), and a string-keyed service locator would be a type-safety regression with no concrete benefit. The App constructor uses direct composition: explicitly instantiating services and passing them to each other via constructor arguments.

2. **Keep wiring modules as pure functions.** The current `wireColorControls(ctx)` function pattern is already clean and testable. Converting to service classes (`ColorWiringService` with `bind()`/`dispose()`) would add unnecessary ceremony without benefit. Both Round 1 reviews concur.

3. **Keep `AppControlRegistry` as a permanent facade.** After Phase 2, `AppControlRegistry` becomes a facade over control groups with permanent compatibility getters. It is NOT eliminated, because wiring modules cut across the proposed control groups (e.g., `AppViewWiring` accesses View, Analysis, and Playback groups; `AppPlaybackWiring` spans Panels, Playback, and Network groups). The facade provides the unified access point these modules need. The compatibility getters are the intended final state, not a migration artifact.

4. **Keep `AppWiringContext` as a typed contract.** The `AppWiringContext` is NOT replaced by any container or passed-through service reference. The typed context pattern is superior for wiring modules because it provides explicit typing of dependencies and does not couple wiring modules to any infrastructure API.

---

## QA Review -- Round 1

### Verdict: APPROVE WITH CHANGES

The plan is well-structured with a sound incremental migration strategy. The phased approach with per-PR CI gates is the right choice. However, several testing gaps need to be addressed before or during execution to ensure regression safety throughout the refactoring.

### Test Coverage Assessment

**Existing App-level test coverage is strong for wiring modules but has gaps at the orchestration level:**

- **Well-covered areas** (existing tests validated in codebase):
  - `AppColorWiring.test.ts` (425 lines) -- full event wiring verification with EventEmitter-based stubs
  - `AppViewWiring.test.ts` (302 lines) -- comprehensive control-to-viewer event wiring
  - `AppEffectsWiring.test.ts` (291 lines) -- filter/crop/lens wiring coverage
  - `AppPlaybackWiring.test.ts` (767 lines) -- volume, export, playback control wiring with deep mock pipelines
  - `AppTransformWiring.test.ts` (169 lines) -- transform + history manager integration
  - `AppNetworkBridge.test.ts` (1,159 lines) -- extensive sync, state transfer, and round-trip tests
  - `AppControlRegistry.test.ts` (502 lines) -- construction, disposal of all 71 controls, tab content creation
  - `AppKeyboardHandler.test.ts` (134 lines) -- shortcut dialog search/filter
  - `AppWiringFixes.test.ts` (603 lines) -- DCCBridge, ContextualKeyboardManager, AudioMixer wiring regressions
  - `AppStackWiring.test.ts` (118 lines) -- layer event wiring

- **Not covered by any existing tests** (gaps confirmed by file search):
  - `AppSessionBridge` -- no `AppSessionBridge.test.ts` exists. This bridge is a dependency of multiple new services (`PlaylistNavigationService`, `KeyboardActionMap`, `LayoutOrchestrator`). Its behavior is only tested indirectly through e2e tests.
  - `AppPersistenceManager` -- no `AppPersistenceManager.test.ts` exists. Save/load, auto-save, snapshot, and GTO sync logic has zero direct unit test coverage.
  - `App.constructor` / `App.mount` / `App.dispose` -- no tests instantiate the `App` class itself. The constructor's 400 lines of service wiring and initialization ordering are untested.
  - `App.getActionHandlers()` -- the 80-handler map with context-sensitive logic (paint vs global context switching on R, O, L keys) has no unit tests. Only the `ActiveContextManager.e2e.test.ts` documents the wiring gap but does not test the actual handler map.
  - Playlist navigation methods (`goToPlaylistStart`, `goToPlaylistEnd`, `goToNextMarkOrBoundary`, etc.) -- ~310 lines of business logic with no direct test coverage.
  - `captureSessionURLState` / `applySessionURLState` / `handleURLBootstrap` -- ~145 lines with no direct tests. Only exercised indirectly through `AppNetworkBridge.test.ts`.
  - Render loop (`tick()`) -- no tests.
  - Audio mixer wiring in App constructor -- partially covered by `AudioMixer.e2e.test.ts` which reproduces the wiring pattern, but `sourceLoaded -> fetch -> decode -> addTrack` path is explicitly noted as untested.

**Plan's testing strategy assessment:**

The plan proposes `~910 lines` of new tests across 8 test files (ServiceContainer: 80, PlaylistNavigation: 200, KeyboardActionMap: 150, LayoutOrchestrator: 200, RenderLoopService: 80, SessionURLService: 120, AudioOrchestrator: 80). The estimated `~60 net new tests` is reasonable for the unit-level scope, but the plan **does not include any new integration tests** that verify the services compose correctly when wired together through the `ServiceContainer`.

### Risk Assessment

**1. Initialization Order Regression (HIGH RISK)**

The current `App` constructor has an implicit initialization order spanning 400 lines. The order matters: for example, `KeyboardManager` must exist before `AppKeyboardHandler`, which must exist before `keyboardHandler.refresh()`. `AppControlRegistry` must be constructed before `AppSessionBridge` (which references controls). The `ServiceContainer` uses lazy instantiation, which means the initialization order becomes determined by the first `get()` call chain rather than explicit sequencing. There are no tests for this ordering today, and the plan does not propose adding any.

**Recommendation:** Before Phase 4 (Composition Root Rewire), create a "boot sequence" integration test that calls `container.boot()` (or resolves all services) and verifies that no service factory throws and all cross-service references are valid. This test should be created during Phase 1 alongside the container itself.

**2. Dispose Order Regression (MEDIUM RISK)**

`App.dispose()` (lines 1828-1875) disposes components in a specific order. The `ServiceContainer.dispose()` proposes reverse-registration-order disposal, but this may not match the current order. For example, `viewer.dispose()` is called before `controls.dispose()` today, and `sessionBridge.dispose()` comes after `persistenceManager.dispose()`. The plan's `disposables` array tracks instantiation order (first `get()` call), not registration order, which may diverge.

**Recommendation:** Add a dispose-order integration test that captures the actual disposal sequence and asserts it matches the expected order. The `ServiceContainer.dispose()` implementation should use the `disposables` array (which tracks instantiation order), and the test should verify that this order matches the current `App.dispose()` semantics.

**3. `AppControlRegistry` Compatibility Shim Coverage (HIGH RISK)**

Phase 3.3 introduces proxy getters (`get colorControls() { return this.color.colorControls; }`) as a compatibility shim. There are 262 occurrences of `this.controls.*` in `App.ts` alone, plus ~470 across the wiring modules. The plan relies on the TypeScript compiler to catch missing references, but the proxy getters must be exhaustive. A single missing getter produces a runtime `undefined` error that TypeScript cannot catch (because the old property still exists on the type, just returning `undefined` at runtime if the getter is missing).

**Recommendation:** Extend `AppControlRegistry.test.ts` with a "shim completeness" test: iterate all keys of the original registry instance and verify each one returns a non-undefined value after the refactoring. This can be done by comparing `Object.keys(oldRegistry)` against `Object.keys(newRegistry)`.

**4. `getActionHandlers()` Context-Sensitive Logic (MEDIUM RISK)**

The `getActionHandlers()` method contains 11 handlers with `activeContextManager.isContextActive('paint')` guards and 4 handlers with `tabBar.activeTab` checks. Extracting this to a pure `buildActionHandlers()` function requires passing `activeContextManager` and `tabBar` as dependencies. If the closure behavior changes (e.g., stale references due to incorrect dependency passing), context-sensitive shortcuts will break silently since there are no tests for them.

**Recommendation:** The `KeyboardActionMap.test.ts` should include specific tests for every context-sensitive handler:
- R key: paint context -> rectangle tool; global context -> resetInOut
- O key: paint context -> ellipse tool; global context -> setOutPoint
- L key: paint context -> line tool; global context -> increaseSpeed
- Shift+R: channel context -> red channel; global context -> rotateLeft
- All 11 `isContextActive('paint')` guards and 4 `tabBar.activeTab` checks

### Recommended Test Additions

1. **`ServiceContainer` circular dependency detection test (Phase 1):** The plan lists this as "optional" but it should be required. Lazy instantiation means a circular `A -> B -> A` resolution will stack-overflow silently in production. Add a test and a runtime guard (track resolving-in-progress services).

2. **Boot sequence integration test (Phase 1, extended in Phase 4):** Create `src/services/AppBootSequence.test.ts` that registers all services with minimal mocks and calls `get()` on every service key, verifying no exceptions and no `undefined` values. This catches wiring bugs before Phase 4.

3. **Dispose order regression test (Phase 1):** Record the dispose call sequence and assert it matches the current `App.dispose()` order. This is critical because the container's reverse-instantiation-order may not match the hand-tuned order in the current App.

4. **Playlist navigation unit tests (Phase 2.1):** The plan correctly identifies these. Ensure coverage of:
   - `goToNextMarkOrBoundary` with no marks (should go to outPoint boundary)
   - `goToNextShot` with playlist disabled vs enabled
   - `jumpToPlaylistGlobalFrame` with out-of-range frame numbers
   - `handleTimelineEditorCutSelected` with SequenceGroupNode present vs absent
   - `syncTimelineEditorFromGraph` with empty source list
   - `normalizeTimelineEditorEDL` with overlapping/unsorted entries

5. **`captureSessionURLState` / `applySessionURLState` round-trip test (Phase 2.5):** Capture state, serialize, deserialize, apply, and verify all fields are restored. This currently has zero test coverage.

6. **`AppSessionBridge` unit test (not in plan, should be added):** This module (323 lines) has no tests and is a dependency of multiple planned services. Its scope update scheduling and info panel update logic should be tested before being wired into the new container.

7. **`AppPersistenceManager` unit test (not in plan, should be added):** 441 lines with no direct tests. At minimum, test `init()`, `syncGTOStore()`, auto-save trigger, and `dispose()`.

8. **Control group factory return-shape tests (Phase 3.1-3.2):** Each `createXxxControls()` factory should have a test that verifies the returned object has all expected keys and all values are non-null instances. This catches constructor signature changes.

9. **`LayoutOrchestrator` DOM structure smoke test (Phase 2.3):** The current `createLayout()` builds the DOM tree including accessibility setup, overlays, and session event bindings. The test should verify:
   - Expected DOM structure (header, tabs, viewer container, timeline)
   - ARIA announcer injection
   - Focus manager initialization
   - Fullscreen manager availability

10. **Tab content builder tests (Phase 3.4):** Each `buildXxxTab.ts` function should have a test verifying it returns an `HTMLElement` with the expected control elements attached. The current `AppControlRegistry.test.ts` has `ACR-003` through `ACR-011` covering `setupTabContents()` tab content structure -- these tests must be migrated or duplicated.

### Migration Safety

**Positive aspects:**
- The incremental per-PR migration with full CI green is the correct approach.
- TypeScript strict mode (`tsc --noEmit`) as a gate catches property access errors at compile time.
- The compatibility shim strategy (Phase 3.3) avoids a big-bang rename.
- Existing wiring test patterns (EventEmitter stubs + `vi.fn()` mocks) are clean and easily adaptable to the new service structure.

**Concerns:**

1. **No "before snapshot" test baseline:** Before starting the refactoring, run the full test suite and record the exact test count and pass/fail results. Every phase PR should assert the count is >= the baseline. The plan mentions "15,018 tests" but this number appears to be stale -- the codebase has 407 test files, and the actual count should be verified.

2. **Wiring module signature stability:** The plan assumes `AppWiringContext` stays stable during Phases 1-3, which is correct. However, Phase 4 changes the `AppWiringContext` to reference control groups instead of flat properties. All 8 wiring test files create mock `AppWiringContext` objects with flat `controls.*` properties. These all need updating in Phase 4, and the plan does not mention this as explicit work.

3. **`wirePlaybackControls` has extra deps:** Unlike other wiring functions, `wirePlaybackControls(ctx, extraDeps)` takes an additional `{ getKeyboardHandler, getFullscreenManager, getAudioMixer }` parameter (confirmed in `App.ts` line 499-503). The plan's `PlaybackWiringDeps` type in the test file already accounts for this, but the `ServiceContainer` registration must wire these extra deps through -- this is not explicitly addressed in the Phase 4 code sample.

4. **External integration surfaces:** `getAPIConfig()` (line 1818-1826) returns `session`, `viewer`, `colorControls`, `cdlControl`, `curvesControl` as a public API contract. After Phase 3, these must still be reachable. The plan shows this in Phase 4 code, but there should be a test that the API shape is preserved.

### Concerns

1. **String-keyed container loses type safety.** The plan acknowledges this in Open Question 1. I strongly recommend the branded-key approach (`createKey<T>()`) from the start. The plan estimates ~20 extra lines. Without it, every `container.get<T>(name)` is an unchecked cast -- a category of bug that neither TypeScript nor tests can catch if the wrong type parameter is used. Deferring this decision to after Phase 1 means potentially rewriting all call sites.

2. **Estimated test line counts are optimistic.** The plan estimates 910 total new test lines for 8 files. Based on the existing wiring test patterns in this codebase (which average 50-100 lines of mock setup per test file), and considering the playlist navigation service alone has ~310 lines of business logic with multiple code paths, 200 lines of tests may be insufficient. Budget 400+ lines for `PlaylistNavigationService.test.ts` and 250+ for `KeyboardActionMap.test.ts`.

3. **`AppSessionBridge` and `AppPersistenceManager` have zero tests.** These are not being refactored in this plan but become dependencies of the new service container. If their behavior is subtly wrong today, the refactoring could mask or surface those bugs in confusing ways. Adding baseline tests for these two modules before starting Phase 1 would significantly de-risk the migration.

4. **No performance regression test for the render loop.** The `RenderLoopService` extraction is small but performance-critical. The current `tick()` uses `PerfTrace` for instrumentation. Consider adding a test that verifies `requestAnimationFrame` is called exactly once per tick and that `renderDirect()` is only called when the frame actually advances (the existing `PerfTrace.count('tick.noFrameAdvance')` logic).

5. **Missing explicit unsubscription tracking.** Several services (`AudioOrchestrator`, `PlaylistNavigationService`) will hold event subscriptions. The plan's `dispose()` methods mention cleaning up, but the current `App` does not track individual `session.on()` unsubscribers -- it relies on the fact that `session` itself is disposed. In the new architecture, if services are disposed independently, leaked subscriptions could cause use-after-dispose bugs. Each new service should track its own unsubscribers and tests should verify `dispose()` removes all listeners.

---

## Expert Review -- Round 1

### Verdict: APPROVE WITH CHANGES

### Accuracy Check

The plan's factual claims were validated against the actual source code. Key findings:

1. **Line counts are accurate.** `App.ts` is exactly 1,875 lines. `AppControlRegistry.ts` is exactly 1,520 lines. The full table of wiring modules totals 7,663 lines (the plan says ~7,664). This is precise.

2. **Constructor scope is accurate.** The constructor spans lines 122-522 (~400 lines) and performs every responsibility the plan lists: display capability detection, client mode, active context management, session/viewer/paint engine creation, control registry instantiation, keyboard manager setup, contextual key binding registration, preferences wiring, persistence manager creation, session bridge setup, network bridge setup, ShotGrid bridge, external presentation, audio mixer event wiring, DCC bridge, wiring module execution, and timeline editor event binding.

3. **`getActionHandlers()` is accurate.** Lines 1137-1451 (~314 lines) containing approximately 90 action handler entries (not 80 as stated -- the returned object has closer to 90 distinct keys).

4. **`createLayout()` is accurate.** Lines 722-1033 (~311 lines) mixing DOM construction, overlay attachment, ARIA setup, focus zone registration, fullscreen manager creation, image mode transitions, session event wiring, and client mode restrictions.

5. **Playlist/timeline logic is accurate.** Lines 1453-1771 contain all the methods the plan identifies. This is approximately 320 lines, matching the plan's estimate.

6. **Readonly control count: the plan says ~71; actual count is 65 `readonly` properties.** The discrepancy is minor and does not affect the plan's conclusions.

7. **Test count discrepancy.** The plan references 15,018 tests across 359 files. The current suite reports **17,236 tests across 407 files** (verified by running `npx vitest run`). The plan should be updated with the current numbers.

8. **`AppSessionBridge` already uses getter-function indirection** (`getSession()`, `getHistogram()`, etc.) rather than direct property access via its `SessionBridgeContext` interface. This is a more decoupled pattern than the `AppWiringContext` flat-property approach. The plan does not call this out, but it demonstrates that the codebase already has a proven pattern for dependency inversion without a container.

### Strengths

1. **Correct identification of extraction boundaries.** The six proposed service extractions (PlaylistNavigationService, KeyboardActionMap, LayoutOrchestrator, RenderLoopService, SessionURLService, AudioOrchestrator) correspond to genuinely separable concerns. Each maps to a contiguous block of code in `App.ts` with clear input/output boundaries.

2. **Incremental migration with compatibility shims.** The Phase 5 strategy of adding proxy getters during the control group split is essential. The existing wiring modules and the `AppSessionBridge` all reference flat `controls.*` properties. A big-bang rename across 14+ consumer files would be high risk.

3. **Wiring modules remain as pure functions.** The plan correctly recommends keeping the current `wireColorControls(ctx)` function pattern rather than converting to service classes. The existing pattern is already clean and testable.

4. **`KeyboardActionMap` as a pure function.** The `buildActionHandlers(deps)` approach is correct. The current `getActionHandlers()` is already a pure mapping with the wrong `this` binding. Extracting it as a standalone function with explicit deps eliminates the coupling without adding unnecessary class ceremony.

5. **Phase ordering is well sequenced.** Starting with the additive ServiceContainer, then extracting the simplest services first (RenderLoop, Audio), followed by the more complex ones (Playlist, Keyboard, Layout), and deferring the riskiest phase (control group split) to last, is a sound risk management strategy.

### Concerns

1. **The `ServiceContainer` is a string-keyed service locator, not a DI container.** The proposed design uses `container.get<T>('core.session')` with string keys and explicit type casts. This is the Service Locator anti-pattern -- it trades compile-time type safety for runtime string lookups. The plan acknowledges this in Open Question 1 but keeps the simpler version as the default.

   **Why this matters in this codebase:** The existing `AppWiringContext` interface and `SessionBridgeContext` interface already provide fully typed dependency declarations. The proposed container would be a step backward in type safety. A service that accidentally calls `container.get<Viewer>('core.session')` would compile without errors but crash at runtime.

   **Recommendation:** If a container is used at all, implement the branded-key variant from Open Question 1 as the mandatory default, not an alternative. However, see Concern 3 below -- a container may not be needed at all.

2. **Cross-domain control access in wiring modules breaks the proposed group boundaries.** `AppViewWiring.ts` accesses controls from at least three of the proposed groups:
   - View controls: `zoomControl`, `channelSelect`, `compareControl`, `stereoControl`, `ghostFrameControl`, `parControl`, `backgroundPatternControl`
   - Analysis controls: `scopesControl`, `histogram`, `waveform`, `vectorscope`, `gamutDiagram`, `toneMappingControl`
   - Playback controls: `presentationMode`

   Similarly, `AppPlaybackWiring.ts` accesses `autoSaveIndicator`, `autoSaveManager`, `snapshotPanel`, `notePanel`, `playlistPanel`, `playlistManager`, `slateEditor`, and `networkSyncManager` -- spanning Panels, Playback, and Network groups.

   This means that after shim removal, wiring modules would need to receive 2-3 control groups instead of a single `controls` object, making their parameter surfaces more complex. The group boundaries as drawn do not align with the access patterns of the existing wiring modules.

3. **The `ServiceContainer` adds indirection without clear benefit for this codebase.** The App constructor currently follows a straightforward sequential initialization pattern: create core objects, create controls, create bridges, wire events. This is a classic Composition Root. The proposed `ServiceContainer` adds lazy initialization and string-key lookups, but the actual initialization order is fixed and deterministic -- there is no need for lazy creation or dynamic service resolution.

   The real problem is not that App lacks a DI container; it is that App has too many responsibilities. The proposed service extractions (Phases 2.1-2.6) solve this problem directly by moving logic into focused classes/functions. The container is optional scaffolding around that extraction.

   **Recommendation:** Extract the services (Phase 2) and split the control groups (Phase 3) without introducing a `ServiceContainer`. Instead, keep `App` as a thin Composition Root that directly instantiates services and passes them to each other via constructor arguments. This preserves full type safety, eliminates the string-key anti-pattern, and still achieves the target of reducing `App.ts` to ~200-250 lines. The `App` constructor would read as a straightforward recipe:

   ```typescript
   constructor() {
     this.session = new Session();
     this.viewer = new Viewer({ session: this.session, ... });
     this.renderLoop = new RenderLoopService({ session: this.session, viewer: this.viewer });
     this.playlistNav = new PlaylistNavigationService({ session: this.session, ... });
     this.actionMap = buildActionHandlers({ session: this.session, ... });
     // etc.
   }
   ```

   This is essentially what the plan calls the "Composition Root" pattern, just without the container indirection layer. The services still receive their dependencies via interfaces, remain testable in isolation, and can be disposed in explicit order.

4. **The `PlaylistNavigationService` dependency interface is broader than it needs to be.** The proposed `PlaylistNavigationDeps` includes `persistenceManager`, `playlistPanel`, `timeline`, and `timelineEditor`, but most navigation methods only need `session` and `playlistManager`. The `applyTimelineEditorEdits()` and `syncTimelineEditorFromGraph()` methods have the broadest dependency footprint. These timeline editor integration methods are a distinct concern from frame navigation and should be a separate extraction.

5. **The `LayoutOrchestrator` conflates two distinct concerns.** The proposed class handles both (a) DOM tree construction (placing elements into slots, appending overlays) and (b) event wiring (ARIA announcements, image mode transitions, focus zone registration, source-loaded handling for 360 detection, presentation mode re-assertions). A cleaner split would be a `LayoutBuilder` for DOM assembly and separate event binding that either remains in the orchestrator or moves to dedicated handlers. The current 311-line `createLayout()` method demonstrates exactly this conflation -- lines 722-812 are pure DOM construction, while lines 813-1033 are event wiring.

6. **Disposal ordering in the `ServiceContainer` is fragile.** The proposed container disposes in reverse registration order. But the actual disposal order matters: `viewer` must be disposed before `session` (viewer holds session references), `networkBridge` must be disposed before `networkSyncManager`, etc. The current `App.dispose()` (lines 1828-1875) has a carefully ordered sequence. A reverse-registration-order container could break this if services are registered in a different order than their disposal dependencies require.

   The container's `disposables` array actually tracks instantiation order (first `get()` call), not registration order, which could diverge further. The current manual `dispose()` method is explicit and correct. If the container approach is kept, it should support explicit disposal ordering or a dependency-aware topological dispose.

### Recommended Changes

1. **Drop the `ServiceContainer` in favor of direct composition.** Keep `App` as a thin Composition Root with explicit constructor wiring. This achieves the same architectural goal (App becomes ~200 lines of service creation and delegation) without introducing a service locator. If a container is desired for future extensibility (e.g., plugin systems), defer it to a later plan when there is a concrete use case for dynamic service resolution.

2. **Use branded type-safe keys if you keep the container.** If the team still prefers a container approach, implement the typed variant from Open Question 1 as the mandatory default, not an alternative.

3. **Split `PlaylistNavigationService` into two modules.** Extract playlist/annotation navigation methods (`goToPlaylistStart`, `goToPlaylistEnd`, `goToNextAnnotation`, etc.) into `PlaylistNavigationService`. Extract timeline editor integration (`syncTimelineEditorFromGraph`, `applyTimelineEditorEdits`, `handleTimelineEditorCutSelected`, `normalizeTimelineEditorEDL`, `buildFallbackTimelineEDLFromSources`) into `TimelineEditorService`. These have different dependency profiles and different rates of change.

4. **Update test counts.** Replace "15,018 tests" and "359 files" with the current numbers (17,236 tests, 407 files) throughout the plan.

5. **Reconsider the control group boundaries for wiring compatibility.** Since wiring modules access controls across multiple proposed groups, the final-state wiring signatures should receive individual controls (or a cherry-picked deps interface) rather than group objects. For example, `wireViewControls` could receive a `ViewWiringDeps` interface that cherry-picks the specific controls it needs from any group, rather than receiving multiple group references. This pattern is already proven by `AppSessionBridge` (via its `SessionBridgeContext` getter-function interface).

6. **Add a phase for extracting contextual keyboard registration.** Lines 211-300 of the App constructor register contextual key bindings (paint vs. global context conflicts for R, O, L, Shift+R, Shift+B, Shift+N). This is a distinct concern from the rest of constructor initialization and could be extracted as a `registerContextualKeyBindings(contextualKeyboardManager, controls, session)` function. The plan does not call this out, but it would further reduce the constructor by ~90 lines.

7. **Address the `setupTabContents` inline style problem explicitly.** The plan mentions splitting `setupTabContents` into per-tab builder functions (Phase 3.4), but the deeper problem is the hundreds of lines of inline CSS styles, inline event handlers, and imperative DOM construction. The per-tab split will help, but the plan should note this as a candidate for a component abstraction pattern to reduce the raw DOM manipulation boilerplate.

### Missing Considerations

1. **No plan for testing the refactored `App` constructor.** The plan provides detailed test strategies for each extracted service, but does not address how the Composition Root itself will be tested. After refactoring, the thin `App` should have at least smoke tests verifying that `mount()` and `dispose()` succeed and that service wiring is correct.

2. **No consideration of the `AppNetworkBridge` URL state duplication.** The plan identifies the URL state capture/apply duplication between `App` and `AppNetworkBridge` (Section 1, Problem 5) but the proposed `SessionURLService` extraction does not address the duplication in `AppNetworkBridge`. After extraction, `AppNetworkBridge` should delegate to `SessionURLService` rather than maintaining its own parallel implementation.

3. **No discussion of the `AppControlRegistry.setupTabContents` parameter coupling.** This method takes `(contextToolbar, viewer, sessionBridge, headerBar)` -- four parameters that come from outside the registry. If the control groups are split into factories, these external dependencies would need to be threaded through to the tab builder functions. The plan should address whether tab builders receive a context object or individual parameters.

4. **The `ExternalPresentation` wiring in the constructor (lines 384-412) is not covered by any proposed extraction.** These ~30 lines wire session events to an external BroadcastChannel. They do not fit neatly into any of the proposed services. They should either become a small `ExternalPresentationWiring` module (following the existing wiring pattern) or be explicitly noted as remaining in the Composition Root.

5. **Open Question 3 should be answered definitively.** After Phase 3, `AppControlRegistry` becomes a thin facade over control groups with compatibility shims. The plan leaves it as an open question whether to eliminate it. The recommendation is: keep it as the single access point for controls, but refactor it to compose groups (as proposed in Phase 3.3). Eliminating it entirely would force every consumer to know which group holds which control, which is an unnecessary cognitive burden. The facade pattern is appropriate here.

6. **Open Question 4 should also be answered definitively.** The `AppWiringContext` should NOT be replaced by the `ServiceContainer` (or by direct container access). The existing typed context pattern is superior for wiring modules. This is correctly identified in the plan's recommendation, but it should be promoted from "recommendation" to "decision" to prevent future debates.

---

## Expert Review — Round 2 (Final)

### Final Verdict: APPROVE WITH CHANGES

This plan correctly identifies the core problem (App as a god object with 1,875 lines and a 400-line constructor), proposes a sound decomposition strategy, and sequences the work in a risk-minimizing order. The two Round 1 reviews are thorough and complement each other well -- the QA review identified concrete testing gaps and the Expert review challenged a fundamental architectural decision (ServiceContainer vs. direct composition). After reviewing the source code and both prior assessments, the plan is implementable but requires the changes outlined below to be production-ready.

### Round 1 Feedback Assessment

**QA Review -- Round 1:** High quality. Identified real, verified testing gaps (AppSessionBridge, AppPersistenceManager, playlist navigation, action handlers all lack unit tests). The specific test recommendations (items 1-10) are actionable and correctly prioritized. The initialization order concern is the most critical risk flagged by either review. The test count discrepancy (15,018 claimed vs. 17,236+ actual) was correctly caught.

**Expert Review -- Round 1:** Provided the strongest architectural insight of both reviews: the ServiceContainer is a service locator anti-pattern that adds indirection without a concrete use case for dynamic resolution. The recommendation to use direct composition instead is well-reasoned and aligns with the codebase's existing patterns (AppSessionBridge already uses a getter-function context interface; AppPersistenceManager uses a flat typed context). The cross-domain control access analysis (AppViewWiring touching View, Analysis, and Playback groups) is a genuine boundary-alignment problem that would surface during Phase 3.

**Where the reviews agree (high-confidence findings):**
1. The ServiceContainer's string-keyed lookup is a type-safety regression compared to the existing typed context pattern.
2. AppSessionBridge and AppPersistenceManager need unit tests before they become service container dependencies.
3. Dispose ordering must be explicit, not implicit via container reverse-order.
4. The control group boundaries do not cleanly align with wiring module access patterns.
5. The plan's test line estimates are optimistic.

**Where the reviews diverge:**
The QA review treats the ServiceContainer as a given and focuses on mitigating its risks (circular dependency detection, boot sequence tests). The Expert review questions whether the container should exist at all. I side with the Expert review on this point -- see Consolidated Required Changes below.

### Consolidated Required Changes (before implementation)

**1. Drop the ServiceContainer; use direct composition in the App constructor.**

Both reviews note the type-safety problem. The Expert review's argument is decisive: the codebase already has three proven dependency-passing patterns (AppWiringContext for wiring modules, SessionBridgeContext for AppSessionBridge, PersistenceManagerContext for AppPersistenceManager), and none of them use a service locator. Introducing one is a pattern inconsistency that provides no concrete benefit.

After the service extractions (Phase 2), the App constructor should read as a direct recipe:

```typescript
constructor() {
  this.displayCapabilities = detectDisplayCapabilities();
  this.session = new Session();
  this.viewer = new Viewer({ session: this.session, ... });
  this.renderLoop = new RenderLoopService({ session: this.session, viewer: this.viewer });
  this.playlistNav = new PlaylistNavigationService({ session: this.session, ... });
  this.layout = new LayoutOrchestrator({ ... });
  // ... ~30 lines of service creation
}
```

This eliminates Phase 1 entirely (saving 2-3 days) and removes the disposal-ordering risk. Disposal remains explicit and hand-ordered in `dispose()`, matching the current pattern. The total effort estimate drops accordingly.

**2. Split PlaylistNavigationService into two modules.**

The Expert review correctly identified that `PlaylistNavigationService` as proposed conflates two concerns with different dependency profiles:
- **Frame navigation** (`goToPlaylistStart`, `goToPlaylistEnd`, `goToNextShot`, `goToPreviousShot`, `goToNextMarkOrBoundary`, `goToPreviousMarkOrBoundary`, `goToNextAnnotation`, `goToPreviousAnnotation`, `jumpToPlaylistGlobalFrame`): depends only on `session`, `playlistManager`, `playlistPanel`, and `paintEngine`.
- **Timeline editor integration** (`handleTimelineEditorCutSelected`, `applyTimelineEditorEdits`, `syncTimelineEditorFromGraph`, `normalizeTimelineEditorEDL`, `buildFallbackTimelineEDLFromSources`, `applyTimelineEditorEditsToPlaylist`, `bindTimelineEditorEvents`): additionally depends on `timelineEditor`, `timeline`, `persistenceManager`, and `SequenceGroupNode` graph traversal.

Splitting these yields smaller, more focused modules that are independently testable without over-broad mock surfaces.

**3. Add baseline unit tests for AppSessionBridge and AppPersistenceManager before starting Phase 2.**

Both reviews flag these as untested dependencies. The plan currently proposes no tests for them. Adding baseline coverage (even 50-100 lines each) before the refactoring begins ensures that any behavioral changes caused by the extraction are detected. This should be Phase 0, estimated at 1-2 days.

**4. Add a "shim completeness" assertion to AppControlRegistry.test.ts during Phase 3.**

The QA review's recommendation is critical. After the control group split, every property of the original flat API (`controls.colorControls`, `controls.cdlControl`, etc.) must still resolve to a non-undefined value through the compatibility shim. A dynamic check (`for (const key of Object.keys(originalRegistry)) { expect(newRegistry[key]).toBeDefined(); }`) is essential because TypeScript cannot catch a missing getter when the property name still exists on the type.

**5. Resolve all four Open Questions in the plan before implementation begins.**

- **OQ1 (Typed container?):** Moot if the container is dropped per Required Change 1.
- **OQ2 (Wiring modules as service classes?):** Answer: No. The current pure-function pattern is already clean and testable. Both reviews agree.
- **OQ3 (Eliminate AppControlRegistry?):** Answer: No. Keep it as a facade that composes groups. The Expert review's reasoning is sound -- eliminating it forces every consumer to know which group holds which control.
- **OQ4 (Replace AppWiringContext with ServiceContainer?):** Answer: No. The typed context pattern is superior for wiring modules.

These should be recorded as decisions, not open questions.

**6. Address the control group boundary mismatch with wiring modules.**

The Expert review's analysis shows that `AppViewWiring` accesses controls from at least View, Analysis, and Playback groups, while `AppPlaybackWiring` spans Panels, Playback, and Network groups. The plan's proposed group boundaries are organized by UI tab, but the wiring modules cut across tabs.

Resolution: After the Phase 3 split, wiring modules should continue to receive the full `AppControlRegistry` facade (which composes all groups). The group split is an internal organization concern of the registry, not a change to the wiring module API. The compatibility shim must remain permanent (not "removed in Phase 4") for exactly this reason. The facade is not a migration artifact -- it is the correct abstraction.

**7. Update the plan's test count references.**

Replace "15,018 tests" and "359 files" with the verified current numbers (407 test files; run `npx vitest run` for exact test count before starting work).

### Consolidated Nice-to-Haves

1. **Extract contextual keyboard registration (lines 211-300) as a standalone function.** The Expert review suggests `registerContextualKeyBindings(contextualKeyboardManager, controls, session)`. This is a clean ~90-line extraction that further reduces the constructor. Low risk, high clarity improvement.

2. **Extract ExternalPresentation wiring (lines 384-412) as a small wiring module.** Follows the existing `wireXxxControls()` pattern. ~30 lines. Makes the constructor more consistent.

3. **Add a render loop invariant test.** Verify that `requestAnimationFrame` is called exactly once per tick and that `renderDirect()` is only invoked when the frame advances. Small effort, validates the performance-critical path.

4. **Circular dependency detection in service creation.** Even without a ServiceContainer, if services are constructed inline in the App constructor, a circular construction dependency would manifest as a stack overflow or `undefined` reference. A comment documenting the dependency DAG (or a simple ASCII diagram) would help future maintainers avoid introducing cycles.

5. **Address inline styles in setupTabContents.** The Expert review correctly notes that the per-tab split (Phase 3.4) does not address the underlying problem of hundreds of lines of inline CSS and imperative DOM construction. This is out of scope for this plan but should be flagged as a follow-up improvement.

6. **Test the refactored App's mount/dispose lifecycle.** After Phase 4, create a minimal smoke test that calls `new App()`, `mount()`, and `dispose()` with mocked DOM, verifying no exceptions and that the dispose sequence completes without errors.

### Final Risk Rating: MEDIUM

The core service extractions (Phase 2) are well-bounded and individually low-risk. The control group split (Phase 3) carries the highest risk due to the shim completeness requirement and cross-cutting access patterns. Dropping the ServiceContainer reduces overall risk by eliminating the disposal ordering and type-safety concerns. The primary remaining risk is initialization order in the App constructor, which is already manually managed today and will remain so.

### Final Effort Estimate: 14-18 days

| Phase | Description | Days |
|-------|-------------|------|
| 0 (new) | Baseline tests for AppSessionBridge + AppPersistenceManager | 1-2 |
| 2.1a | PlaylistNavigationService (frame navigation only) | 1.5 |
| 2.1b | TimelineEditorService (EDL/sequence integration) | 1.5 |
| 2.2 | KeyboardActionMap | 1 |
| 2.3 | LayoutOrchestrator | 2-3 |
| 2.4 | RenderLoopService | 0.5 |
| 2.5 | SessionURLService | 1 |
| 2.6 | AudioOrchestrator | 0.5 |
| 3.1-3.2 | Control group interfaces + factories | 2 |
| 3.3 | Refactor AppControlRegistry with permanent facade | 1.5 |
| 3.4 | Extract tab builders | 2 |
| 4 | Slim down App constructor (direct composition, no container) | 1 |
| **Total** | | **15.5-17.5 days** |

Note: Phase 1 (ServiceContainer) is eliminated entirely, saving 2-3 days. Phase 0 adds 1-2 days for baseline tests. Phase 4 is simplified from 2-3 days to 1 day because there is no container to wire -- it is just removing the now-delegated code from App. Net savings: ~2-3 days off the original estimate.

### Implementation Readiness: READY

The plan is ready for implementation once the Required Changes above are incorporated. The key decisions are:
1. No ServiceContainer -- direct composition in App constructor.
2. Split PlaylistNavigationService into two modules.
3. Phase 0: baseline tests for AppSessionBridge and AppPersistenceManager.
4. Control group facade (AppControlRegistry) is permanent, not a migration artifact.
5. All four Open Questions answered as decisions.

The existing test suite (407 files) provides strong regression coverage, TypeScript strict mode catches property access errors at compile time, and the incremental per-PR approach with full CI gates is the right execution strategy.

---

## QA Review -- Round 2 (Final)

### Final Verdict: APPROVE WITH CHANGES

The plan is well-structured, addresses a genuine maintainability problem, and has received thorough scrutiny from two independent Round 1 reviewers plus an Expert Round 2 consolidation. The fundamental extraction strategy (moving contiguous blocks of logic from a 1,875-line god object into focused service modules) is sound and well-sequenced. The Round 1 and Expert Round 2 feedback has converged on the correct set of required changes. This final QA assessment validates the consolidated recommendations and adds specific, measurable test gates that must be met before each phase can merge.

### Round 1 Feedback Assessment

**Both Round 1 reviews and the Expert Round 2 consolidation are high quality and mutually reinforcing.** The key conclusions are:

1. **ServiceContainer removal (Expert Round 1 + Expert Round 2):** I concur. The string-keyed service locator is a type-safety regression with no compensating benefit. The codebase already has three typed dependency-passing patterns (`AppWiringContext`, `SessionBridgeContext`, `PersistenceManagerContext`). Direct composition in the App constructor preserves full type safety, keeps disposal ordering explicit, and eliminates the lazy-initialization ordering risk. The Expert Round 2's decision to drop Phase 1 entirely is correct.

2. **PlaylistNavigationService split (Expert Round 1 + Expert Round 2):** I concur. The dependency profiles are genuinely different. Frame navigation needs `session` + `playlistManager` + `playlistPanel` + `paintEngine`. Timeline editor integration adds `timelineEditor`, `timeline`, `persistenceManager`, and graph traversal. Splitting produces smaller test surfaces and more focused modules.

3. **Phase 0 prerequisite tests (QA Round 1 + Expert Round 2):** I concur and I am formalizing the specific test requirements below. The 764 combined lines of `AppSessionBridge` (323 lines) and `AppPersistenceManager` (441 lines) with zero direct test coverage represent the largest source of residual risk. Both modules are deeply wired into the refactored services. Without baseline tests, behavioral regressions introduced by the architectural change would be invisible.

4. **Shim completeness test (QA Round 1 + Expert Round 2):** I concur. The Expert Round 2 goes further by recommending the facade be permanent rather than transitional. This is the correct decision -- the control groups are an internal organization concern, and the facade is the right abstraction layer for wiring modules.

5. **Action handler count correction:** The plan states "~80 handlers," Expert Round 1 states "~90 distinct keys." I have verified the actual source code: there are **117 distinct action handler entries** in `getActionHandlers()` (lines 1137-1451). Within those, exactly 3 reference `this.activeContextManager.isContextActive('paint')` and 2 reference `this.tabBar.activeTab`. The 6 pairs of contextual keyboard registrations (R, O, L, Shift+R, Shift+B, Shift+N) are in the constructor at lines 211-300 via `contextualKeyboardManager.register()`, not inside `getActionHandlers()`. The QA Round 1 claim of "11 handlers with `isContextActive('paint')` guards" conflated these two locations. The plan and all reviews should be updated to use the correct count of 117.

**One point where I diverge from the Expert Round 2:**

The Expert Round 2 sets Implementation Readiness to "READY." I set it to **NEEDS WORK**. The reason: the required changes (drop ServiceContainer, split PlaylistNavigationService, add Phase 0, resolve open questions, update counts) have not yet been incorporated into the plan document itself. The reviews describe what needs to change, but the plan's Sections 3-9 still reference the ServiceContainer, still show `PlaylistNavigationService` as a single module, still list Phase 1 as ServiceContainer creation, and still carry the stale test counts. Until the plan document is updated to reflect the agreed-upon changes, the plan is not implementation-ready -- an implementer reading only Sections 1-9 would build the wrong thing.

### Minimum Test Requirements (before merging each phase)

All phases share a universal gate: `npx vitest run` (all tests pass, count >= baseline) and `npx tsc --noEmit` (zero type errors).

**Phase 0 -- Prerequisite baseline tests (NEW, must be completed first):**

| Test file | Min tests | Coverage scope |
|-----------|-----------|---------------|
| `AppSessionBridge.test.ts` | 10 | `bindSessionEvents()` scope scheduling, `updateInfoPanel()` data formatting, histogram callback forwarding, `dispose()` cleanup, event unsubscription |
| `AppPersistenceManager.test.ts` | 8 | `init()` auto-save timer setup, `syncGTOStore()` serialization, `createQuickSnapshot()`, `dispose()` timer cleanup, OPFS cache integration |

Record the exact test count after Phase 0 merges. This is the regression baseline for all subsequent phases.

**Phase 2.1a -- PlaylistNavigationService (frame navigation):**

| Test file | Min tests | Must-cover scenarios |
|-----------|-----------|---------------------|
| `PlaylistNavigationService.test.ts` | 15 | `goToPlaylistStart` with empty playlist; `goToPlaylistEnd` with single-clip playlist; `goToNextAnnotation` wrap-around when current frame > last annotated frame; `goToPreviousAnnotation` wrap-around when current frame < first annotated frame; `goToNextMarkOrBoundary` with no marks (falls through to playlist boundary); `goToPreviousMarkOrBoundary` at clip start vs mid-clip; `goToNextShot` / `goToPreviousShot` with playlist disabled (no-op); `jumpToPlaylistGlobalFrame` with out-of-range frame (mapping returns null); `jumpToPlaylistGlobalFrame` verifies source switch, in/out point set, panel highlight |

**Phase 2.1b -- TimelineEditorService (EDL/sequence integration):**

| Test file | Min tests | Must-cover scenarios |
|-----------|-----------|---------------------|
| `TimelineEditorService.test.ts` | 12 | `syncTimelineEditorFromGraph` with SequenceGroupNode present; same with SequenceGroupNode absent + playlist clips present; same with no clips + fallback from sources; same with empty source list; `handleTimelineEditorCutSelected` SequenceGroupNode path, playlist clip path, and EDL-entry path; `applyTimelineEditorEdits` single-cut (disables playlist, sets in/out on session), multi-cut (enables playlist), empty-cut (disables playlist); `normalizeTimelineEditorEDL` with unsorted entries, with non-finite source values, with overlapping entries; `buildFallbackTimelineEDLFromSources` with zero-duration source |

**Phase 2.2 -- KeyboardActionMap:**

| Test file | Min tests | Must-cover scenarios |
|-----------|-----------|---------------------|
| `KeyboardActionMap.test.ts` | 20 | All 3 `activeContextManager` guards: `playback.faster` in paint context -> `paintToolbar.handleKeyboard('l')`, `timeline.setOutPoint` in paint context -> `paintToolbar.handleKeyboard('o')`, `timeline.resetInOut` in paint context -> `paintToolbar.handleKeyboard('r')`; Both `tabBar.activeTab` guards: `view.zoom50` only fires when tab is 'view', `channel.luminance` redirects to `lutPipelinePanel.toggle()` when tab is 'color'; Playlist-enabled branching in `playback.goToStart` and `playback.goToEnd`; `panel.close` cascade: cheat sheet visible -> hides cheat sheet; presentation mode active -> toggles presentation; neither active -> closes individual panels; At least 1 representative test per category: playback (6 actions), timeline (8), view (15), panel (10), transform (4), export (2), edit (2), annotation (2), tab (6), paint (11), channel (7), stereo (3), layout (4), notes (3), focus (2), network (2), help (1), audio (1), display (1), color toggle (3) |

**Phase 2.3 -- LayoutOrchestrator:**

| Test file | Min tests | Must-cover scenarios |
|-----------|-----------|---------------------|
| `LayoutOrchestrator.test.ts` | 10 | DOM structure: header, tabs, context toolbar, viewer slot, timeline placed in correct parent elements; ARIA announcer instantiation and tab change announcement; 5 focus zones registered (headerBar, tabBar, contextToolbar, viewer, timeline); fullscreen manager created with correct container; image mode: `sourceLoaded` with `isSingleImage=true` hides timeline; image mode: `sourceLoaded` with `isSingleImage=false` shows timeline; presentation mode exit re-asserts image mode; 360 content auto-detection on `sourceLoaded`; overlay elements (histogram, waveform, vectorscope, gamut diagram, curves, history, info, markers, notes) appended to viewer container; `dispose()` cleans up fullscreen, focus, ARIA, shortcut cheat sheet |

**Phase 2.4 -- RenderLoopService:**

| Test file | Min tests | Must-cover scenarios |
|-----------|-----------|---------------------|
| `RenderLoopService.test.ts` | 6 | `start()` schedules `requestAnimationFrame`; `stop()` calls `cancelAnimationFrame`; `tick()` calls `session.update()` on every frame; `renderDirect()` called only when frame advances AND source is video AND session is playing; `renderDirect()` NOT called when frame does not advance (no-frame-advance path); `dispose()` stops the loop |

**Phase 2.5 -- SessionURLService:**

| Test file | Min tests | Must-cover scenarios |
|-----------|-----------|---------------------|
| `SessionURLService.test.ts` | 8 | Round-trip: `captureState()` -> `applyState()` restores frame, fps, inPoint, outPoint, sourceIndex, sourceA/B, currentAB, transform, wipeMode, wipePosition; `applyState` with partial state (missing optional fields like OCIO, sourceB); OCIO state capture and apply; `handleURLBootstrap` with `?room=ABC` sets join code; `handleURLBootstrap` with WebRTC offer token; `handleURLBootstrap` with answer token (shows info); `handleURLBootstrap` with `?room=ABC&pin=123` auto-joins; `handleURLBootstrap` with `#` hash shared state applies it |

**Phase 2.6 -- AudioOrchestrator:**

| Test file | Min tests | Must-cover scenarios |
|-----------|-----------|---------------------|
| `AudioOrchestrator.test.ts` | 6 | Playback start -> `audioMixer.play(frameTime)` with correct time; Playback stop -> `audioMixer.stop()`; `sourceLoaded` with video source triggers audio extraction (mock fetch); `sourceLoaded` with non-video source is ignored; Lazy AudioContext initialization respects `audioInitialized` flag; `dispose()` unsubscribes all event listeners and calls `audioMixer.dispose()` |

**Phase 3.1-3.3 -- Control group split:**

| Test | Min tests | Must-cover scenarios |
|------|-----------|---------------------|
| Shim completeness assertion | 1 (iterative) | Enumerate all 65 `readonly` properties of the pre-refactoring `AppControlRegistry`. After refactoring, verify each property name resolves to a non-undefined, non-null value through the compatibility facade |
| Per-group factory tests (8 factories) | 8 (1 per factory) | Each `createXxxControls()` returns an object with all expected keys, all values are non-null instances |
| Existing `AppControlRegistry.test.ts` | unchanged | All 502 lines of existing tests continue to pass |

**Phase 3.4 -- Tab content builders:**

| Test | Min tests | Must-cover scenarios |
|------|-----------|---------------------|
| Per-tab builder tests (6 builders) | 6 | Each `buildXxxTab()` returns an `HTMLElement` with the expected control elements attached |
| Existing ACR-003 through ACR-011 tests | migrated or preserved | Tab content structure assertions from `AppControlRegistry.test.ts` must remain green |

**Phase 4 -- Composition root rewire:**

| Test | Min tests | Must-cover scenarios |
|------|-----------|---------------------|
| Boot sequence smoke test | 1 | Construct refactored `App`, call `mount()` on a DOM container, verify no exceptions |
| Dispose smoke test | 1 | After `mount()`, call `dispose()`, verify no exceptions and no leaked timers/listeners |
| `getAPIConfig()` shape test | 1 | Returned object has `session`, `viewer`, `colorControls`, `cdlControl`, `curvesControl` -- all non-undefined |
| All 10 existing `App*.test.ts` files | unchanged | All existing wiring, control registry, and keyboard handler tests pass |
| Test count assertion | 1 | Total test count >= Phase 0 baseline + sum of all new tests |

**Summary of minimum new tests across all phases:**

| Phase | New tests (minimum) |
|-------|-------------------|
| Phase 0 | 18 |
| Phase 2.1a | 15 |
| Phase 2.1b | 12 |
| Phase 2.2 | 20 |
| Phase 2.3 | 10 |
| Phase 2.4 | 6 |
| Phase 2.5 | 8 |
| Phase 2.6 | 6 |
| Phase 3.1-3.3 | 9 |
| Phase 3.4 | 6 |
| Phase 4 | 3 |
| **Total** | **113** |

This represents a net increase of at least 113 tests. The plan's original estimate of "~60 net new tests" was significantly undercount. The actual minimum to achieve adequate coverage is nearly double.

### Final Risk Rating: MEDIUM

**Rationale:**

The service extraction phases (2.1-2.6) are individually LOW risk. Each extracts a contiguous block of code with well-defined boundaries. The functions/classes being created are pure delegations of existing logic -- no new behavior is being added, only relocated. TypeScript catches missing references at compile time, and the existing 407 test files provide strong regression coverage.

The `AppControlRegistry` split (Phase 3) is MEDIUM-HIGH risk. There are 473 `controls.*` references across 12 source files (262 in `App.ts`, 211 across wiring modules and test files). Every reference must continue to resolve after the group split. The compatibility facade and shim completeness test mitigate this, but the surface area is large.

Phase 4 (composition root rewire) is MEDIUM risk. The App constructor's implicit initialization ordering (400 lines, carefully sequenced) must be preserved in the new direct-composition form. The boot sequence smoke test is the primary safety net.

The decision to drop the `ServiceContainer` eliminates what would have been the highest-risk element (lazy initialization ordering, disposal ordering, type-safety loss).

**Residual risks not mitigated by the plan:**
- `AppSessionBridge` (323 lines) and `AppPersistenceManager` (441 lines) have subtle timing dependencies (e.g., scope scheduling throttling, auto-save debouncing) that may behave differently when wired through new service modules. Phase 0 baseline tests reduce but do not eliminate this risk.
- The 117 action handlers in `getActionHandlers()` reference virtually every subsystem. If the `buildActionHandlers()` pure function receives stale or incorrectly wired dependencies, the failure mode is a silent no-op on a keyboard shortcut, which is difficult to detect without explicit per-handler tests.

### Implementation Readiness: NEEDS WORK

The plan requires the following updates to its body (Sections 1-9) before an implementer can begin:

1. **Remove Phase 1 (ServiceContainer) from Section 3, Section 4, Section 9.** Replace with the direct composition approach in Phase 4. Remove `ServiceContainer.ts`, `ServiceContainer.test.ts`, and `ServiceKeys.ts` from the new files table.

2. **Split Phase 2.1 into 2.1a (PlaylistNavigationService) and 2.1b (TimelineEditorService)** in Section 3. Update the new files table in Section 4, the effort estimate in Section 9, and the migration order in Phase 5.

3. **Add Phase 0 to Sections 3 and 9.** Define `AppSessionBridge.test.ts` and `AppPersistenceManager.test.ts` creation as a prerequisite phase.

4. **Update Section 1 (Problem Statement):** Change "~80 keyboard action handlers" to "117 action handler entries."

5. **Update Section 7 (Testing Strategy):** Replace "~60 net new tests" with ">= 113 net new tests" and incorporate the minimum test requirements table from this review.

6. **Update Sections 6 and 8 (Risk Assessment and Success Metrics):** Replace "15,018 tests" with the actual current count. Update the success metrics table to show 113+ new tests, not ~60.

7. **Resolve Open Questions 1-4 in Section 10** as definitive decisions, not open questions. Mark the section as "Resolved Decisions."

8. **Update Phase 3 to make the facade permanent.** Remove language about "removing compatibility shims" in Phase 4. The `AppControlRegistry` facade over control groups is the intended final state, not a transitional artifact.

9. **Add the `wirePlaybackControls` extra-deps wiring** to the Phase 4 code sample. The current Phase 4 sample omits the `{ getKeyboardHandler, getFullscreenManager, getAudioMixer }` second argument that `wirePlaybackControls` requires (confirmed at line 499-503 of `App.ts`).

10. **Add consideration for `AppNetworkBridge` URL state deduplication** (flagged in Expert Round 1, Missing Consideration 2). After `SessionURLService` is extracted, `AppNetworkBridge` should delegate to it for `captureState`/`applyState` rather than maintaining parallel logic. This should be noted as a follow-up action item in Phase 2.5.

Once these 10 updates are incorporated into the plan document, the plan will be fully implementation-ready.
