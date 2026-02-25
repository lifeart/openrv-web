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

2. **`getActionHandlers()` is a 300-line method**: Lines 1137-1451 define a monolithic map of ~80 keyboard action handlers that reference virtually every control via `this.controls.*`, `this.session`, `this.viewer`, `this.paintEngine`, `this.tabBar`, `this.activeContextManager`, etc. This method alone creates coupling to every subsystem.

3. **`createLayout()` is a 300-line method**: Lines 722-1033 builds the DOM tree, appends overlays to the viewer container, wires session announcements, configures accessibility, creates fullscreen manager, sets up image mode transitions, and binds session events. It mixes DOM construction with event wiring.

4. **Playlist/timeline logic embedded in App**: ~200 lines of playlist navigation (lines 1462-1771) including `goToPlaylistStart`, `goToPlaylistEnd`, `goToNextMarkOrBoundary`, `goToPreviousMarkOrBoundary`, `goToNextShot`, `goToPreviousShot`, `jumpToPlaylistGlobalFrame`, timeline EDL normalization, and sequence group node management. This is pure business logic that belongs in its own module.

5. **Session URL state capture/apply in App**: ~100 lines of `captureSessionURLState` and `applySessionURLState` (lines 575-660) which duplicate similar logic in `AppNetworkBridge`. The `handleURLBootstrap` method adds another 60 lines.

6. **No circular dependencies, but high coupling**: While Session does not import from App (confirmed by grep), App reaches into virtually every subsystem, making it the hub of a star topology. Testing any behavior requires mocking the entire `App` instance.

7. **`AppControlRegistry` is itself a god object**: 1,520 lines, 71 `readonly` control properties, a 170-line constructor, and a 1,000-line `setupTabContents` method that builds raw DOM with inline styles and event handlers.

---

## 2. Proposed Solution

### Architecture: Composition Root with Service Modules

Transform `App` from a god object into a thin **Composition Root** that only:
1. Creates a **ServiceContainer** (DI container)
2. Registers services in the container
3. Calls `container.boot()` to initialize everything
4. Delegates `dispose()` to the container

All current logic moves into focused **service modules** that declare their dependencies via interfaces and receive them from the container.

### Key Principles

- **No framework DI library** -- use a simple typed service registry (Map-based) to avoid adding dependencies.
- **Interface-driven** -- every service depends on interfaces, never on concrete classes.
- **Lazy initialization** -- services are created on first access, avoiding order-of-creation issues.
- **Testable in isolation** -- each service can be instantiated with mock dependencies.
- **Incremental migration** -- extract one service at a time; App delegates to it while tests are green.

---

## 3. Detailed Steps

### Phase 1: Extract the Service Container (Est. 2-3 days)

#### Step 1.1: Create `ServiceContainer`

Create `/Users/lifeart/Repos/openrv-web/src/services/ServiceContainer.ts`:

```typescript
/**
 * Lightweight typed service container.
 * Services are registered as factory functions and lazily instantiated.
 */
export class ServiceContainer {
  private factories = new Map<string, () => unknown>();
  private instances = new Map<string, unknown>();
  private disposables: Array<{ dispose(): void }> = [];

  /**
   * Register a factory for a named service.
   * The factory receives the container so it can resolve dependencies.
   */
  register<T>(name: string, factory: (container: ServiceContainer) => T): void {
    this.factories.set(name, () => factory(this));
  }

  /**
   * Resolve a service by name. Lazily creates it on first access.
   */
  get<T>(name: string): T {
    if (this.instances.has(name)) {
      return this.instances.get(name) as T;
    }
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Service not registered: ${name}`);
    }
    const instance = factory() as T;
    this.instances.set(name, instance);

    // Track disposables
    if (instance && typeof (instance as any).dispose === 'function') {
      this.disposables.push(instance as { dispose(): void });
    }
    return instance;
  }

  /**
   * Dispose all services in reverse registration order.
   */
  dispose(): void {
    for (let i = this.disposables.length - 1; i >= 0; i--) {
      this.disposables[i]!.dispose();
    }
    this.disposables = [];
    this.instances.clear();
  }
}
```

#### Step 1.2: Create typed service keys

Create `/Users/lifeart/Repos/openrv-web/src/services/ServiceKeys.ts`:

```typescript
/**
 * Typed service key constants.
 * Using const strings avoids magic string coupling.
 */
export const ServiceKeys = {
  // Core
  Session: 'core.session',
  Viewer: 'core.viewer',
  PaintEngine: 'core.paintEngine',
  DisplayCapabilities: 'core.displayCapabilities',

  // Orchestrators (new)
  LayoutOrchestrator: 'orchestrator.layout',
  PlaybackOrchestrator: 'orchestrator.playback',
  KeyboardOrchestrator: 'orchestrator.keyboard',
  NavigationOrchestrator: 'orchestrator.navigation',
  AudioOrchestrator: 'orchestrator.audio',
  A11yOrchestrator: 'orchestrator.a11y',
  RenderLoopService: 'service.renderLoop',
  URLBootstrapService: 'service.urlBootstrap',

  // Existing bridges (moved)
  SessionBridge: 'bridge.session',
  NetworkBridge: 'bridge.network',
  PersistenceManager: 'bridge.persistence',
  DCCBridge: 'bridge.dcc',

  // UI registries (split from AppControlRegistry)
  ColorControls: 'controls.color',
  ViewControls: 'controls.view',
  EffectsControls: 'controls.effects',
  TransformControls: 'controls.transform',
  AnnotateControls: 'controls.annotate',
  AnalysisControls: 'controls.analysis',
  PlaybackControls: 'controls.playback',
  NetworkControls: 'controls.network',

  // Layout components
  HeaderBar: 'layout.headerBar',
  TabBar: 'layout.tabBar',
  ContextToolbar: 'layout.contextToolbar',
  Timeline: 'layout.timeline',
  LayoutStore: 'layout.store',
  LayoutManager: 'layout.manager',
} as const;
```

#### Step 1.3: Create `ServiceContainer.test.ts`

Create `/Users/lifeart/Repos/openrv-web/src/services/ServiceContainer.test.ts` with tests for:
- Lazy instantiation
- Singleton behavior (same instance on repeated `get()`)
- Dispose in reverse order
- Missing service throws
- Circular dependency detection (optional)

---

### Phase 2: Extract Focused Orchestrators from App (Est. 5-7 days)

#### Step 2.1: Extract `PlaylistNavigationService`

**Source**: Lines 1462-1771 in `App.ts` (playlist/timeline/annotation navigation)

Create `/Users/lifeart/Repos/openrv-web/src/services/PlaylistNavigationService.ts`:

```typescript
export interface PlaylistNavigationDeps {
  session: Session;
  playlistManager: PlaylistManager;
  playlistPanel: PlaylistPanel;
  paintEngine: PaintEngine;
  timelineEditor: TimelineEditor;
  timeline: Timeline;
  persistenceManager: AppPersistenceManager;
}

export class PlaylistNavigationService {
  constructor(private deps: PlaylistNavigationDeps) {}

  goToPlaylistStart(): void { /* move from App */ }
  goToPlaylistEnd(): void { /* move from App */ }
  goToNextMarkOrBoundary(): void { /* move from App */ }
  goToPreviousMarkOrBoundary(): void { /* move from App */ }
  goToNextShot(): void { /* move from App */ }
  goToPreviousShot(): void { /* move from App */ }
  goToNextAnnotation(): void { /* move from App */ }
  goToPreviousAnnotation(): void { /* move from App */ }
  jumpToPlaylistGlobalFrame(globalFrame: number): void { /* move from App */ }

  // Timeline editor logic
  handleTimelineEditorCutSelected(cutIndex: number): void { /* move from App */ }
  applyTimelineEditorEdits(): void { /* move from App */ }
  syncTimelineEditorFromGraph(): void { /* move from App */ }

  // Wire timeline editor events
  bindTimelineEditorEvents(): void { /* move from App constructor */ }

  dispose(): void {}
}
```

**Files to modify**:
- `/Users/lifeart/Repos/openrv-web/src/App.ts` -- remove ~310 lines, delegate to service
- Create `/Users/lifeart/Repos/openrv-web/src/services/PlaylistNavigationService.ts` (~310 lines)
- Create `/Users/lifeart/Repos/openrv-web/src/services/PlaylistNavigationService.test.ts`

#### Step 2.2: Extract `KeyboardActionMap`

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
  playlistNavigation: PlaylistNavigationService;
}

export function buildActionHandlers(deps: KeyboardActionDeps): Record<string, () => void> {
  const { session, viewer, paintEngine, controls, ... } = deps;
  return {
    'playback.toggle': () => session.togglePlayback(),
    'playback.stepForward': () => session.stepForward(),
    // ... all 80 handlers moved here
  };
}
```

**Files to modify**:
- `/Users/lifeart/Repos/openrv-web/src/App.ts` -- remove ~315 lines
- Create `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts` (~320 lines)
- Create `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.test.ts`

#### Step 2.3: Extract `LayoutOrchestrator`

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
- Create `/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.test.ts`

#### Step 2.4: Extract `RenderLoopService`

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
- Create `/Users/lifeart/Repos/openrv-web/src/services/RenderLoopService.test.ts`

#### Step 2.5: Extract `SessionURLService`

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
- Create `/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.test.ts`

#### Step 2.6: Extract `AudioOrchestrator`

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
- Create `/Users/lifeart/Repos/openrv-web/src/services/AudioOrchestrator.test.ts`

---

### Phase 3: Split `AppControlRegistry` (Est. 3-4 days)

The 1,520-line `AppControlRegistry` with 71 readonly properties should be split into **domain-specific control groups**. Each group owns the controls for one tab/domain:

#### Step 3.1: Define control group interfaces

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

#### Step 3.2: Create control group factory functions

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

#### Step 3.3: Refactor `AppControlRegistry` to compose groups

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

**Note**: This is a breaking change to `controls.colorControls` -> `controls.color.colorControls`. Use a compatibility shim during migration (see Phase 5).

#### Step 3.4: Extract `setupTabContents()` into per-tab builder functions

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

### Phase 4: Rewire App as Thin Composition Root (Est. 2-3 days)

After Phases 1-3, rewrite `App.ts` to be approximately:

```typescript
export class App {
  private container: ServiceContainer;

  constructor() {
    this.container = new ServiceContainer();
    this.registerServices();
  }

  private registerServices(): void {
    const c = this.container;

    // Core
    c.register(SK.DisplayCapabilities, () => detectDisplayCapabilities());
    c.register(SK.Session, () => {
      const session = new Session();
      session.setHDRResizeTier(c.get<DisplayCapabilities>(SK.DisplayCapabilities).canvasHDRResizeTier);
      return session;
    });
    c.register(SK.PaintEngine, () => new PaintEngine());
    c.register(SK.Viewer, () => new Viewer({
      session: c.get(SK.Session),
      paintEngine: c.get(SK.PaintEngine),
      capabilities: c.get(SK.DisplayCapabilities),
    }));

    // Controls (grouped)
    c.register(SK.ColorControls, () => createColorControls({ ... }));
    c.register(SK.ViewControls, () => createViewControls({ ... }));
    // ... etc

    // Orchestrators
    c.register(SK.PlaybackOrchestrator, () => new PlaylistNavigationService({ ... }));
    c.register(SK.KeyboardOrchestrator, (c) => new AppKeyboardHandler(
      new KeyboardManager(),
      new CustomKeyBindingsManager(() => c.get<AppKeyboardHandler>(SK.KeyboardOrchestrator).refresh()),
      { getActionHandlers: () => buildActionHandlers({ ... }) },
    ));
    c.register(SK.LayoutOrchestrator, () => new LayoutOrchestrator({ ... }));
    c.register(SK.RenderLoopService, () => new RenderLoopService({ ... }));
    c.register(SK.SessionBridge, () => new AppSessionBridge({ ... }));
    c.register(SK.NetworkBridge, () => new AppNetworkBridge({ ... }));
    c.register(SK.PersistenceManager, () => new AppPersistenceManager({ ... }));
  }

  async mount(selector: string): Promise<void> {
    const container = document.querySelector(selector);
    if (!container) throw new Error(`Container not found: ${selector}`);

    const layout = this.container.get<LayoutOrchestrator>(SK.LayoutOrchestrator);
    layout.createLayout();

    const renderLoop = this.container.get<RenderLoopService>(SK.RenderLoopService);
    renderLoop.start();

    // ... minimal bootstrap (audio lazy init, OCIO pipeline, URL bootstrap)
  }

  getAPIConfig(): OpenRVAPIConfig {
    return {
      session: this.container.get(SK.Session),
      viewer: this.container.get(SK.Viewer),
      colorControls: this.container.get<ColorControlGroup>(SK.ColorControls).colorControls,
      cdlControl: this.container.get<ColorControlGroup>(SK.ColorControls).cdlControl,
      curvesControl: this.container.get<ColorControlGroup>(SK.ColorControls).curvesControl,
    };
  }

  dispose(): void {
    this.container.dispose();
  }
}
```

**Target**: App.ts shrinks from ~1,875 lines to ~200 lines.

---

### Phase 5: Migration Strategy (Incremental, Non-Breaking)

The refactoring must be done incrementally because:
- 15,018 tests must stay green at every step
- The wiring modules (`AppColorWiring.ts`, `AppViewWiring.ts`, etc.) reference `controls.colorControls`, not `controls.color.colorControls`
- Multiple files depend on the `AppWiringContext` interface

#### Migration Order

1. **Phase 1** (ServiceContainer): No existing code changes. Purely additive.
2. **Phase 2.1** (PlaylistNavigationService): Extract methods from App, delegate via thin wrappers. Remove wrappers once all callers updated.
3. **Phase 2.2** (KeyboardActionMap): Extract `getActionHandlers()` to pure function. App calls it.
4. **Phase 2.3** (LayoutOrchestrator): Extract `createLayout()`. App calls it.
5. **Phase 2.4** (RenderLoopService): Extract `tick()`. Smallest change.
6. **Phase 2.5** (SessionURLService): Extract URL methods. App delegates.
7. **Phase 2.6** (AudioOrchestrator): Extract audio wiring.
8. **Phase 3.1-3.2** (Control groups): Create group interfaces and factories alongside existing registry.
9. **Phase 3.3** (Refactor registry): Add compatibility getters that proxy `controls.colorControls` to `controls.color.colorControls` so existing wiring modules keep working:

```typescript
// Compatibility shim in AppControlRegistry during migration
get colorControls(): ColorControls { return this.color.colorControls; }
get cdlControl(): CDLControl { return this.color.cdlControl; }
// ... etc
```

10. **Phase 3.4** (Tab builders): Extract `setupTabContents()` sections.
11. **Phase 4** (Composition root): Rewire App. Remove compatibility shims. Update `AppWiringContext` to reference control groups.

#### Compatibility Layer

During migration, maintain backward compatibility:

```typescript
// AppWiringContext.ts -- expanded during migration
export interface AppWiringContext {
  session: Session;
  viewer: Viewer;
  paintEngine: PaintEngine;
  headerBar: HeaderBar;
  tabBar: TabBar;
  controls: AppControlRegistry; // keeps working via proxy getters
  sessionBridge: AppSessionBridge;
  persistenceManager: AppPersistenceManager;
}
```

Wiring modules (`AppColorWiring.ts`, etc.) continue to reference `ctx.controls.colorControls` unchanged until the final phase when they are updated to `ctx.controls.color.colorControls`.

---

## 4. New Files Created

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/services/ServiceContainer.ts` | 60 | Typed DI container |
| `src/services/ServiceContainer.test.ts` | 80 | Container tests |
| `src/services/ServiceKeys.ts` | 40 | Typed service key constants |
| `src/services/PlaylistNavigationService.ts` | 310 | Playlist/timeline logic from App |
| `src/services/PlaylistNavigationService.test.ts` | 200 | Unit tests |
| `src/services/KeyboardActionMap.ts` | 320 | Action handler map from App |
| `src/services/KeyboardActionMap.test.ts` | 150 | Unit tests |
| `src/services/LayoutOrchestrator.ts` | 330 | Layout/DOM/a11y from App |
| `src/services/LayoutOrchestrator.test.ts` | 200 | Unit tests |
| `src/services/RenderLoopService.ts` | 60 | Render loop from App |
| `src/services/RenderLoopService.test.ts` | 80 | Unit tests |
| `src/services/SessionURLService.ts` | 150 | URL state capture/apply/bootstrap |
| `src/services/SessionURLService.test.ts` | 120 | Unit tests |
| `src/services/AudioOrchestrator.ts` | 80 | Audio wiring from App |
| `src/services/AudioOrchestrator.test.ts` | 80 | Unit tests |
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

**Total new files**: ~30
**Total new lines**: ~3,300 (including tests)

---

## 5. Files Modified

| File | Change |
|------|--------|
| `src/App.ts` | Shrinks from 1,875 to ~200 lines |
| `src/AppControlRegistry.ts` | Refactored to compose control groups; shrinks from 1,520 to ~300 lines |
| `src/AppWiringContext.ts` | May expand to reference control groups (final phase) |
| `src/AppColorWiring.ts` | Updated references (final phase only) |
| `src/AppViewWiring.ts` | Updated references (final phase only) |
| `src/AppEffectsWiring.ts` | Updated references (final phase only) |
| `src/AppTransformWiring.ts` | Updated references (final phase only) |
| `src/AppPlaybackWiring.ts` | Updated references (final phase only) |
| `src/AppStackWiring.ts` | Updated references (final phase only) |
| `src/main.ts` | No change needed (App public API unchanged) |

---

## 6. Risk Assessment

### Low Risk
- **Phase 1 (ServiceContainer)**: Purely additive, no existing code modified.
- **Phase 2.4 (RenderLoopService)**: Small, self-contained extraction (40 lines).
- **Phase 2.6 (AudioOrchestrator)**: Isolated audio logic, no cross-cutting concerns.

### Medium Risk
- **Phase 2.1 (PlaylistNavigationService)**: 310 lines of interleaved logic; must carefully preserve the bidirectional interaction between `PlaylistManager`, `Session`, and `TimelineEditor`.
- **Phase 2.2 (KeyboardActionMap)**: Pure function extraction, but many handlers contain context-sensitive logic (e.g., "if in paint context, do X instead of Y"). Must ensure `activeContextManager` state is correctly passed.
- **Phase 2.3 (LayoutOrchestrator)**: DOM construction + event binding is fragile. Integration tests needed.

### Higher Risk
- **Phase 3 (Control group split)**: The biggest risk is the transition from `controls.filterControl` to `controls.effects.filterControl`. The compatibility shim mitigates this, but there are ~12 files (wiring modules + bridges) that reference controls directly. A missed reference causes a runtime `undefined` error.
- **Phase 4 (Composition root rewire)**: Final integration of all changes. Requires careful testing of initialization order, since the service container lazily creates instances.

### Mitigations
1. Each phase is a separate PR with full CI green.
2. Compatibility shims in Phase 3 ensure zero breakage during transition.
3. TypeScript compiler will catch missing/wrong property references.
4. Existing test suite (15,018 tests, 359 files) provides strong regression coverage.

---

## 7. Testing Strategy

### Unit Tests (per extracted service)
Each new service gets its own `.test.ts` file. Mock dependencies via simple objects implementing the dependency interface. Example:

```typescript
// PlaylistNavigationService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PlaylistNavigationService } from './PlaylistNavigationService';

describe('PlaylistNavigationService', () => {
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
    const service = new PlaylistNavigationService(deps as any);

    service.goToNextAnnotation();

    expect(deps.session.goToFrame).toHaveBeenCalledWith(5);
  });
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

### Regression Gate
Every PR must pass: `npx vitest run` (all 15,018+ tests) and `npx tsc --noEmit` (zero type errors).

---

## 8. Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| `App.ts` line count | 1,875 | ~200 | < 250 |
| `AppControlRegistry.ts` line count | 1,520 | ~300 | < 400 |
| Largest method in App | ~400 (constructor) | ~30 | < 50 |
| Number of `this.*` references in App | ~250 | ~20 | < 30 |
| Services testable in isolation | 0 | 6+ | All new services |
| New test files | 0 | 8+ | 1 per service |
| Total test count | 15,018 | 15,018 + ~60 | Net positive |
| TypeScript errors | 0 | 0 | 0 at every phase |

---

## 9. Estimated Effort

| Phase | Description | Estimated Days | PRs |
|-------|-------------|---------------|-----|
| 1 | ServiceContainer + keys | 2-3 | 1 |
| 2.1 | PlaylistNavigationService | 2 | 1 |
| 2.2 | KeyboardActionMap | 1 | 1 |
| 2.3 | LayoutOrchestrator | 2-3 | 1 |
| 2.4 | RenderLoopService | 0.5 | 1 |
| 2.5 | SessionURLService | 1 | 1 |
| 2.6 | AudioOrchestrator | 0.5 | 1 |
| 3.1-3.2 | Control group interfaces + factories | 2 | 1 |
| 3.3 | Refactor AppControlRegistry | 2 | 1 |
| 3.4 | Extract tab builders | 2 | 1 |
| 4 | Rewire App as composition root | 2-3 | 1 |
| **Total** | | **17-22 days** | **10 PRs** |

---

## 10. Open Questions

1. **Should we use a typed container with generics?** The proposed string-keyed container is simple but loses type safety at `get<T>()` call sites. An alternative is a `TypedServiceContainer` using branded keys:
   ```typescript
   const SessionKey = createKey<Session>('session');
   container.get(SessionKey); // returns Session, no cast needed
   ```
   This adds ~20 lines of infrastructure but eliminates all `as` casts.

2. **Should wiring modules be converted to service classes?** Currently `wireColorControls()` is a pure function. We could make it `ColorWiringService` with `bind()`/`dispose()` for consistent lifecycle management, but the current function pattern is already clean and testable.

3. **Should `AppControlRegistry` be eliminated entirely?** After Phase 3, it becomes a thin facade over control groups. We could remove it and have wiring modules reference groups directly from the container. This would eliminate one level of indirection but require updating all wiring module signatures.

4. **Should the `AppWiringContext` be replaced by the `ServiceContainer`?** Currently wiring modules receive a typed context. We could pass the container instead, but this would make wiring modules dependent on the container API and lose explicit typing of their dependencies. The recommendation is to keep `AppWiringContext` as the explicit contract.

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
