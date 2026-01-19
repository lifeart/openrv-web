import { Session } from './core/session/Session';
import { Viewer } from './ui/components/Viewer';
import { Timeline } from './ui/components/Timeline';
import { HeaderBar } from './ui/components/layout/HeaderBar';
import { TabBar, TabId } from './ui/components/layout/TabBar';
import { ContextToolbar } from './ui/components/layout/ContextToolbar';
import { PaintEngine } from './paint/PaintEngine';
import { PaintToolbar } from './ui/components/PaintToolbar';
import { ColorControls } from './ui/components/ColorControls';
import { TransformControl } from './ui/components/TransformControl';
import { FilterControl } from './ui/components/FilterControl';
import { CropControl } from './ui/components/CropControl';
import { CDLControl } from './ui/components/CDLControl';
import { CurvesControl } from './ui/components/CurvesControl';
import { LensControl } from './ui/components/LensControl';
import { StackControl } from './ui/components/StackControl';
import { ChannelSelect } from './ui/components/ChannelSelect';
import { StereoControl } from './ui/components/StereoControl';
import { Histogram } from './ui/components/Histogram';
import { Waveform } from './ui/components/Waveform';
import { Vectorscope } from './ui/components/Vectorscope';
import { ZoomControl } from './ui/components/ZoomControl';
import { ScopesControl } from './ui/components/ScopesControl';
import { CompareControl } from './ui/components/CompareControl';
import { SafeAreasControl } from './ui/components/SafeAreasControl';
import { FalseColorControl } from './ui/components/FalseColorControl';
import { exportSequence } from './utils/SequenceExporter';
import { showAlert, showModal, closeModal } from './ui/components/shared/Modal';
import { SessionSerializer } from './core/session/SessionSerializer';
import { SessionGTOExporter } from './core/session/SessionGTOExporter';
import { SessionGTOStore } from './core/session/SessionGTOStore';
import { KeyboardManager, KeyCombination } from './utils/KeyboardManager';
import { DEFAULT_KEY_BINDINGS, describeKeyCombo } from './utils/KeyBindings';
import { CustomKeyBindingsManager } from './utils/CustomKeyBindingsManager';

export class App {
  private container: HTMLElement | null = null;
  private session: Session;
  private viewer: Viewer;
  private timeline: Timeline;
  private headerBar: HeaderBar;
  private tabBar: TabBar;
  private contextToolbar: ContextToolbar;
  private paintEngine: PaintEngine;
  private paintToolbar: PaintToolbar;
  private colorControls: ColorControls;
  private gtoStore: SessionGTOStore | null = null;
  private transformControl: TransformControl;
  private filterControl: FilterControl;
  private cropControl: CropControl;
  private cdlControl: CDLControl;
  private curvesControl: CurvesControl;
  private lensControl: LensControl;
  private stackControl: StackControl;
  private channelSelect: ChannelSelect;
  private stereoControl: StereoControl;
  private histogram: Histogram;
  private waveform: Waveform;
  private vectorscope: Vectorscope;
  private zoomControl: ZoomControl;
  private scopesControl: ScopesControl;
  private compareControl: CompareControl;
  private safeAreasControl: SafeAreasControl;
  private falseColorControl: FalseColorControl;
  private animationId: number | null = null;
  private boundHandleResize: () => void;
  private keyboardManager: KeyboardManager;
  private customKeyBindingsManager: CustomKeyBindingsManager;

  constructor() {
    // Bind event handlers for proper cleanup
    this.boundHandleResize = () => this.viewer.resize();

    this.session = new Session();
    this.paintEngine = new PaintEngine();
    this.viewer = new Viewer(this.session, this.paintEngine);
    this.timeline = new Timeline(this.session, this.paintEngine);

    // Create HeaderBar (contains file ops, playback, volume, export, help)
    this.headerBar = new HeaderBar(this.session);
    this.headerBar.on('showShortcuts', () => this.showShortcuts());
    this.headerBar.on('showCustomKeyBindings', () => this.showCustomKeyBindings());
    this.headerBar.on('saveProject', () => this.saveProject());
    this.headerBar.on('openProject', (file) => this.openProject(file));

    // Create TabBar and ContextToolbar
    this.tabBar = new TabBar();
    this.contextToolbar = new ContextToolbar();
    this.tabBar.on('tabChanged', (tabId: TabId) => {
      this.contextToolbar.setActiveTab(tabId);
      this.onTabChanged(tabId);
    });

    this.paintToolbar = new PaintToolbar(this.paintEngine);
    this.colorControls = new ColorControls();

    // Connect color controls to viewer
    this.colorControls.on('adjustmentsChanged', (adjustments) => {
      this.viewer.setColorAdjustments(adjustments);
      this.scheduleUpdateScopes();
      this.syncGTOStore();
    });

    // Connect LUT events
    this.colorControls.on('lutLoaded', (lut) => {
      this.viewer.setLUT(lut);
      this.scheduleUpdateScopes();
    });
    this.colorControls.on('lutIntensityChanged', (intensity) => {
      this.viewer.setLUTIntensity(intensity);
      this.scheduleUpdateScopes();
    });

    // Initialize new grouped View tab controls
    this.zoomControl = new ZoomControl();
    this.zoomControl.on('zoomChanged', (zoom) => {
      if (zoom === 'fit') {
        this.viewer.fitToWindow();
      } else {
        this.viewer.setZoom(zoom);
      }
    });

    this.scopesControl = new ScopesControl();
    this.scopesControl.on('scopeToggled', ({ scope, visible }) => {
      if (scope === 'histogram') {
        if (visible) {
          this.histogram.show();
          this.updateHistogram();
        } else {
          this.histogram.hide();
        }
      } else if (scope === 'waveform') {
        if (visible) {
          this.waveform.show();
          this.updateWaveform();
        } else {
          this.waveform.hide();
        }
      } else if (scope === 'vectorscope') {
        if (visible) {
          this.vectorscope.show();
          this.updateVectorscope();
        } else {
          this.vectorscope.hide();
        }
      }
      this.syncGTOStore();
    });

    this.compareControl = new CompareControl();
    this.compareControl.on('wipeModeChanged', (mode) => {
      this.viewer.setWipeState({
        mode,
        position: this.compareControl.getWipePosition(),
        showOriginal: mode === 'horizontal' ? 'left' : 'top',
      });
    });
    this.compareControl.on('wipePositionChanged', (position) => {
      const mode = this.compareControl.getWipeMode();
      this.viewer.setWipeState({
        mode,
        position,
        showOriginal: mode === 'horizontal' ? 'left' : 'top',
      });
    });
    this.compareControl.on('abSourceChanged', (source) => {
      this.session.setCurrentAB(source);
    });
    this.compareControl.on('abToggled', () => {
      this.session.toggleAB();
    });

    // Safe Areas control
    this.safeAreasControl = new SafeAreasControl(this.viewer.getSafeAreasOverlay());
    this.falseColorControl = new FalseColorControl(this.viewer.getFalseColor());

    // Connect volume control (from HeaderBar) to session (bidirectional)
    const volumeControl = this.headerBar.getVolumeControl();
    volumeControl.on('volumeChanged', (volume) => {
      this.session.volume = volume;
    });
    volumeControl.on('mutedChanged', (muted) => {
      this.session.muted = muted;
    });
    // Sync back from Session to VolumeControl (for external changes)
    this.session.on('volumeChanged', (volume) => {
      volumeControl.syncVolume(volume);
    });
    this.session.on('mutedChanged', (muted) => {
      volumeControl.syncMuted(muted);
    });

    // Connect export control (from HeaderBar) to viewer
    const exportControl = this.headerBar.getExportControl();
    exportControl.on('exportRequested', ({ format, includeAnnotations, quality }) => {
      this.viewer.exportFrame(format, includeAnnotations, quality);
    });
    exportControl.on('copyRequested', () => {
      this.viewer.copyFrameToClipboard(true);
    });
    exportControl.on('sequenceExportRequested', (request) => {
      this.handleSequenceExport(request);
    });
    exportControl.on('rvSessionExportRequested', ({ format }) => {
      this.saveRvSession(format);
    });

    // Initialize transform control
    this.transformControl = new TransformControl();
    this.transformControl.on('transformChanged', (transform) => {
      this.viewer.setTransform(transform);
      this.syncGTOStore();
    });

    // Initialize filter control
    this.filterControl = new FilterControl();
    this.filterControl.on('filtersChanged', (settings) => {
      this.viewer.setFilterSettings(settings);
      this.scheduleUpdateScopes();
      this.syncGTOStore();
    });

    // Initialize crop control
    this.cropControl = new CropControl();
    this.cropControl.on('cropStateChanged', (state) => {
      this.viewer.setCropState(state);
      this.syncGTOStore();
    });
    this.cropControl.on('cropModeToggled', (enabled) => {
      this.viewer.setCropEnabled(enabled);
    });

    // Initialize CDL control
    this.cdlControl = new CDLControl();
    this.cdlControl.on('cdlChanged', (cdl) => {
      this.viewer.setCDL(cdl);
      this.scheduleUpdateScopes();
    });

    // Initialize curves control
    this.curvesControl = new CurvesControl();
    this.curvesControl.on('curvesChanged', (curves) => {
      this.viewer.setCurves(curves);
      this.scheduleUpdateScopes();
    });

    // Initialize lens distortion control
    this.lensControl = new LensControl();
    this.lensControl.on('lensChanged', (params) => {
      this.viewer.setLensParams(params);
      this.scheduleUpdateScopes();
      this.syncGTOStore();
    });

    // Initialize stack/composite control
    this.stackControl = new StackControl();
    this.stackControl.on('layerAdded', (layer) => {
      // When adding a layer, use the current source index
      layer.sourceIndex = this.session.currentSourceIndex;
      layer.name = this.session.currentSource?.name ?? `Layer ${layer.sourceIndex + 1}`;
      this.stackControl.updateLayerSource(layer.id, layer.sourceIndex);
      this.stackControl.updateLayerName(layer.id, layer.name);
      this.viewer.setStackLayers(this.stackControl.getLayers());
      this.scheduleUpdateScopes();
    });
    this.stackControl.on('layerChanged', () => {
      this.viewer.setStackLayers(this.stackControl.getLayers());
      this.scheduleUpdateScopes();
    });
    this.stackControl.on('layerRemoved', () => {
      this.viewer.setStackLayers(this.stackControl.getLayers());
      this.scheduleUpdateScopes();
    });
    this.stackControl.on('layerReordered', () => {
      this.viewer.setStackLayers(this.stackControl.getLayers());
      this.scheduleUpdateScopes();
    });

    // Initialize channel select control
    this.channelSelect = new ChannelSelect();
    this.channelSelect.on('channelChanged', (channel) => {
      this.viewer.setChannelMode(channel);
      this.scheduleUpdateScopes();
      this.syncGTOStore();
    });

    // Initialize stereo control
    this.stereoControl = new StereoControl();
    this.stereoControl.on('stateChanged', (state) => {
      this.viewer.setStereoState(state);
      this.scheduleUpdateScopes();
      this.syncGTOStore();
    });

    // Initialize histogram
    this.histogram = new Histogram();

    // Initialize waveform
    this.waveform = new Waveform();

    // Initialize vectorscope
    this.vectorscope = new Vectorscope();

    // Initialize keyboard manager
    this.keyboardManager = new KeyboardManager();
    this.setupKeyboardShortcuts();

    // Initialize custom key bindings manager
    this.customKeyBindingsManager = new CustomKeyBindingsManager(() => {
      this.refreshKeyboardShortcuts();
    });

    // Apply any stored custom bindings to the keyboard shortcuts
    this.refreshKeyboardShortcuts();
  }

  mount(selector: string): void {
    this.container = document.querySelector(selector);
    if (!this.container) {
      throw new Error(`Container not found: ${selector}`);
    }

    this.createLayout();
    this.bindEvents();
    this.start();
  }

  private createLayout(): void {
    if (!this.container) return;

    // === HEADER BAR (file ops, playback, volume, help) ===
    const headerBarEl = this.headerBar.render();

    // === TAB BAR (View | Color | Effects | Transform | Annotate) ===
    const tabBarEl = this.tabBar.render();

    // === CONTEXT TOOLBAR (changes based on active tab) ===
    const contextToolbarEl = this.contextToolbar.render();

    // Setup tab contents
    this.setupTabContents();

    const viewerEl = this.viewer.getElement();
    const timelineEl = this.timeline.render();

    this.container.appendChild(headerBarEl);
    this.container.appendChild(tabBarEl);
    this.container.appendChild(contextToolbarEl);
    this.container.appendChild(viewerEl);
    this.container.appendChild(timelineEl);

    // Add histogram overlay to viewer container
    this.viewer.getContainer().appendChild(this.histogram.render());

    // Add waveform overlay to viewer container
    this.viewer.getContainer().appendChild(this.waveform.render());

    // Add curves control overlay to viewer container
    this.viewer.getContainer().appendChild(this.curvesControl.render());

    // Add vectorscope overlay to viewer container
    this.viewer.getContainer().appendChild(this.vectorscope.render());

    // Update histogram, waveform, and vectorscope when frame changes or media loads
    this.session.on('frameChanged', () => {
      this.updateHistogram();
      this.updateWaveform();
      this.updateVectorscope();
    });
    this.session.on('sourceChanged', () => {
      // Small delay to allow canvas to render
      setTimeout(() => {
        this.updateHistogram();
        this.updateWaveform();
        this.updateVectorscope();
      }, 100);
    });

    // Optimize scopes for playback: use aggressive subsampling during playback,
    // full quality when paused
    this.session.on('playbackChanged', (isPlaying) => {
      this.histogram.setPlaybackMode(isPlaying);
      this.waveform.setPlaybackMode(isPlaying);
      this.vectorscope.setPlaybackMode(isPlaying);

      // Playback preload state management:
      // - START: Handled in Session.play() which calls videoSourceNode.startPlaybackPreload()
      //   This is done there because Session has immediate access to playback direction and
      //   needs to initiate preloading before the first update() call for seamless playback.
      // - STOP: Handled here via the event because App needs to coordinate with scope updates.
      //   When playback stops, we switch to scrub mode (symmetric preloading) and refresh
      //   scopes at full quality - both actions are App-level concerns.
      const source = this.session.currentSource;
      if (!isPlaying && source?.videoSourceNode) {
        source.videoSourceNode.stopPlaybackPreload();
      }

      // When playback stops, update scopes with full quality
      if (!isPlaying) {
        this.updateHistogram();
        this.updateWaveform();
        this.updateVectorscope();
      }
    });

    // Handle clear frame event from paint toolbar
    const paintToolbarEl = this.paintToolbar.render();
    paintToolbarEl.addEventListener('clearFrame', () => {
      this.paintEngine.clearFrame(this.session.currentFrame);
    });
  }

  private setupTabContents(): void {
    // === VIEW TAB ===
    // Reorganized into grouped dropdowns to reduce button count and scroll issues
    const viewContent = document.createElement('div');
    viewContent.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;';

    // Zoom dropdown (replaces 5 separate buttons)
    viewContent.appendChild(this.zoomControl.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Channel select dropdown
    viewContent.appendChild(this.channelSelect.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Compare dropdown (Wipe + A/B)
    viewContent.appendChild(this.compareControl.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Stereo control (already a dropdown)
    viewContent.appendChild(this.stereoControl.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Scopes dropdown (Histogram + Waveform + Vectorscope)
    viewContent.appendChild(this.scopesControl.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Stack control (opens panel)
    viewContent.appendChild(this.stackControl.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Safe Areas / Guides control
    viewContent.appendChild(this.safeAreasControl.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Pixel Probe / Color Sampler toggle
    const pixelProbeButton = ContextToolbar.createButton('Probe', () => {
      this.viewer.getPixelProbe().toggle();
    }, { title: 'Toggle pixel color probe (Shift+I)', icon: 'eyedropper' });
    pixelProbeButton.dataset.testid = 'pixel-probe-toggle';
    viewContent.appendChild(pixelProbeButton);

    // Update pixel probe button state
    this.viewer.getPixelProbe().on('stateChanged', (state) => {
      if (state.enabled) {
        pixelProbeButton.style.background = 'rgba(74, 158, 255, 0.15)';
        pixelProbeButton.style.borderColor = '#4a9eff';
        pixelProbeButton.style.color = '#4a9eff';
      } else {
        pixelProbeButton.style.background = 'transparent';
        pixelProbeButton.style.borderColor = 'transparent';
        pixelProbeButton.style.color = '#999';
      }
    });

    viewContent.appendChild(ContextToolbar.createDivider());

    // False Color control (with preset selector and legend)
    viewContent.appendChild(this.falseColorControl.render());

    // Trigger re-render when false color state changes
    this.viewer.getFalseColor().on('stateChanged', () => {
      this.viewer.refresh();
    });

    // Sync scope visibility with ScopesControl
    this.histogram.on('visibilityChanged', (visible) => {
      this.scopesControl.setScopeVisible('histogram', visible);
    });
    this.waveform.on('visibilityChanged', (visible) => {
      this.scopesControl.setScopeVisible('waveform', visible);
    });
    this.vectorscope.on('visibilityChanged', (visible) => {
      this.scopesControl.setScopeVisible('vectorscope', visible);
    });

    // Sync A/B availability with CompareControl
    const updateABAvailability = () => {
      this.compareControl.setABAvailable(this.session.abCompareAvailable);
    };
    updateABAvailability();
    this.session.on('sourceLoaded', updateABAvailability);
    this.session.on('abSourceChanged', () => {
      const current = this.session.currentAB;
      this.compareControl.setABSource(current);
    });

    this.contextToolbar.setTabContent('view', viewContent);

    // === COLOR TAB ===
    const colorContent = document.createElement('div');
    colorContent.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    colorContent.appendChild(this.colorControls.render());
    colorContent.appendChild(ContextToolbar.createDivider());
    colorContent.appendChild(this.cdlControl.render());
    colorContent.appendChild(ContextToolbar.createDivider());

    // Curves toggle button
    const curvesButton = ContextToolbar.createButton('Curves', () => {
      this.curvesControl.toggle();
    }, { title: 'Toggle color curves panel (U)', icon: 'curves' });
    curvesButton.dataset.testid = 'curves-toggle-button';
    colorContent.appendChild(curvesButton);

    // Update button state when visibility changes
    this.curvesControl.on('visibilityChanged', (visible) => {
      if (visible) {
        curvesButton.style.background = 'rgba(74, 158, 255, 0.15)';
        curvesButton.style.borderColor = '#4a9eff';
      } else {
        curvesButton.style.background = '';
        curvesButton.style.borderColor = '';
      }
    });

    this.contextToolbar.setTabContent('color', colorContent);

    // === EFFECTS TAB ===
    const effectsContent = document.createElement('div');
    effectsContent.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    effectsContent.appendChild(this.filterControl.render());
    effectsContent.appendChild(ContextToolbar.createDivider());
    effectsContent.appendChild(this.lensControl.render());
    this.contextToolbar.setTabContent('effects', effectsContent);

    // === TRANSFORM TAB ===
    const transformContent = document.createElement('div');
    transformContent.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    transformContent.appendChild(this.transformControl.render());
    transformContent.appendChild(ContextToolbar.createDivider());
    transformContent.appendChild(this.cropControl.render());
    this.contextToolbar.setTabContent('transform', transformContent);

    // === ANNOTATE TAB ===
    const annotateContent = document.createElement('div');
    annotateContent.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    annotateContent.appendChild(this.paintToolbar.render());
    this.contextToolbar.setTabContent('annotate', annotateContent);
  }

  private onTabChanged(_tabId: TabId): void {
    // Handle tab-specific logic
    // For example, could show/hide certain viewer overlays based on tab
  }

  private bindEvents(): void {
    // Handle window resize
    window.addEventListener('resize', this.boundHandleResize);

    // Initialize keyboard shortcuts
    this.keyboardManager.attach();

    // Load annotations from GTO files
    this.session.on('annotationsLoaded', ({ annotations, effects }) => {
      this.paintEngine.loadFromAnnotations(annotations, effects);
      this.syncGTOStore();
    });

    this.session.on('sessionLoaded', () => {
      if (this.session.gtoData) {
        this.gtoStore = new SessionGTOStore(this.session.gtoData);
        this.syncGTOStore();
      }
    });

    this.session.on('sourceLoaded', () => {
      if (!this.session.gtoData) {
        this.gtoStore = null;
      }
    });

    this.session.on('frameChanged', () => this.syncGTOStore());
    this.session.on('inOutChanged', () => this.syncGTOStore());
    this.session.on('marksChanged', () => this.syncGTOStore());
    this.session.on('fpsChanged', () => this.syncGTOStore());

    this.paintEngine.on('annotationsChanged', () => this.syncGTOStore());
    this.paintEngine.on('effectsChanged', () => this.syncGTOStore());

    this.session.on('settingsLoaded', (settings) => {
      if (settings.colorAdjustments) {
        this.colorControls.setAdjustments(settings.colorAdjustments);
      }
      if (settings.filterSettings) {
        this.filterControl.setSettings(settings.filterSettings);
      }
      if (settings.cdl) {
        this.cdlControl.setCDL(settings.cdl);
      }
      if (settings.transform) {
        this.transformControl.setTransform(settings.transform);
        this.viewer.setTransform(settings.transform);
      }
      if (settings.lens) {
        this.lensControl.setParams(settings.lens);
      }
      if (settings.crop) {
        this.cropControl.setState(settings.crop);
      }
      if (settings.channelMode) {
        this.channelSelect.setChannel(settings.channelMode);
      }
      if (settings.stereo) {
        this.stereoControl.setState(settings.stereo);
      }
      if (settings.scopes) {
        const applyScope = (scope: 'histogram' | 'waveform' | 'vectorscope', visible: boolean): void => {
          if (scope === 'histogram') {
            if (visible) {
              this.histogram.show();
              this.updateHistogram();
            } else {
              this.histogram.hide();
            }
          } else if (scope === 'waveform') {
            if (visible) {
              this.waveform.show();
              this.updateWaveform();
            } else {
              this.waveform.hide();
            }
          } else if (scope === 'vectorscope') {
            if (visible) {
              this.vectorscope.show();
              this.updateVectorscope();
            } else {
              this.vectorscope.hide();
            }
          }
          this.scopesControl.setScopeVisible(scope, visible);
        };

        applyScope('histogram', settings.scopes.histogram);
        applyScope('waveform', settings.scopes.waveform);
        applyScope('vectorscope', settings.scopes.vectorscope);
      }

      this.syncGTOStore();
    });
  }

  private setupKeyboardShortcuts(): void {
    this.registerKeyboardShortcuts();
  }

  private refreshKeyboardShortcuts(): void {
    // Clear existing bindings to prevent duplicates and memory leaks
    this.keyboardManager.clearAll();
    // Re-register all shortcuts with updated combos
    this.registerKeyboardShortcuts();
  }

  private registerKeyboardShortcuts(): void {
    // Create a map of action names to handler functions
    const actionHandlers: Record<string, () => void> = {
      'playback.toggle': () => this.session.togglePlayback(),
      'playback.stepForward': () => this.session.stepForward(),
      'playback.stepBackward': () => this.session.stepBackward(),
      'playback.toggleDirection': () => this.session.togglePlayDirection(),
      'playback.goToStart': () => this.session.goToStart(),
      'playback.goToEnd': () => this.session.goToEnd(),
      'timeline.setInPoint': () => this.session.setInPoint(),
      'timeline.setInPointAlt': () => this.session.setInPoint(),
      'timeline.setOutPoint': () => this.session.setOutPoint(),
      'timeline.setOutPointAlt': () => this.session.setOutPoint(),
      'timeline.toggleMark': () => this.session.toggleMark(),
      'timeline.resetInOut': () => this.session.resetInOutPoints(),
      'timeline.cycleLoopMode': () => {
        const modes: Array<'once' | 'loop' | 'pingpong'> = ['once', 'loop', 'pingpong'];
        const currentIndex = modes.indexOf(this.session.loopMode);
        this.session.loopMode = modes[(currentIndex + 1) % modes.length]!;
      },
      'view.fitToWindow': () => this.viewer.fitToWindow(),
      'view.fitToWindowAlt': () => this.viewer.fitToWindow(),
      'view.zoom50': () => {
        if (this.tabBar.activeTab === 'view') {
          this.viewer.setZoom(0.5);
        }
      },
      'view.cycleWipeMode': () => this.compareControl.cycleWipeMode(),
      'view.toggleWaveform': () => this.scopesControl.toggleScope('waveform'),
      'view.toggleAB': () => this.session.toggleAB(),
      'view.toggleABAlt': () => this.session.toggleAB(),
      'panel.color': () => this.colorControls.toggle(),
      'panel.effects': () => this.filterControl.toggle(),
      'panel.curves': () => this.curvesControl.toggle(),
      'panel.crop': () => this.cropControl.toggle(),
      'panel.waveform': () => this.scopesControl.toggleScope('waveform'),
      'panel.vectorscope': () => this.scopesControl.toggleScope('vectorscope'),
      'panel.histogram': () => this.scopesControl.toggleScope('histogram'),
      'transform.rotateLeft': () => this.transformControl.rotateLeft(),
      'transform.rotateRight': () => this.transformControl.rotateRight(),
      'transform.flipHorizontal': () => this.transformControl.toggleFlipH(),
      'transform.flipVertical': () => this.transformControl.toggleFlipV(),
      'export.quickExport': () => this.headerBar.getExportControl().quickExport('png'),
      'export.copyFrame': () => this.viewer.copyFrameToClipboard(true),
      'edit.undo': () => this.paintEngine.undo(),
      'edit.redo': () => this.paintEngine.redo(),
      'annotation.previous': () => this.goToPreviousAnnotation(),
      'annotation.next': () => this.goToNextAnnotation(),
      'tab.view': () => this.tabBar.handleKeyboard('1'),
      'tab.color': () => this.tabBar.handleKeyboard('2'),
      'tab.effects': () => this.tabBar.handleKeyboard('3'),
      'tab.transform': () => this.tabBar.handleKeyboard('4'),
      'tab.annotate': () => this.tabBar.handleKeyboard('5'),
      'paint.pan': () => this.paintToolbar.handleKeyboard('v'),
      'paint.pen': () => this.paintToolbar.handleKeyboard('p'),
      'paint.eraser': () => this.paintToolbar.handleKeyboard('e'),
      'paint.text': () => this.paintToolbar.handleKeyboard('t'),
      'paint.toggleBrush': () => this.paintToolbar.handleKeyboard('b'),
      'paint.toggleGhost': () => this.paintToolbar.handleKeyboard('g'),
      'channel.red': () => this.channelSelect.handleKeyboard('R', true),
      'channel.green': () => this.channelSelect.handleKeyboard('G', true),
      'channel.blue': () => this.channelSelect.handleKeyboard('B', true),
      'channel.alpha': () => this.channelSelect.handleKeyboard('A', true),
      'channel.luminance': () => this.channelSelect.handleKeyboard('L', true),
      'channel.none': () => this.channelSelect.handleKeyboard('N', true),
      'stereo.toggle': () => this.stereoControl.handleKeyboard('3', true),
      'view.toggleGuides': () => this.safeAreasControl.getOverlay().toggle(),
      'view.togglePixelProbe': () => this.viewer.getPixelProbe().toggle(),
      'view.toggleFalseColor': () => this.viewer.getFalseColor().toggle(),
      'view.toggleTimecodeOverlay': () => this.viewer.getTimecodeOverlay().toggle(),
      'panel.close': () => {
        if (this.colorControls) {
          this.colorControls.hide();
        }
      },
    };

    // Register all keyboard shortcuts using effective combos (custom or default)
    for (const [action, defaultBinding] of Object.entries(DEFAULT_KEY_BINDINGS)) {
      const handler = actionHandlers[action];
      if (handler) {
        // Use effective combo if custom key bindings manager is available, otherwise use default
        const effectiveCombo = this.customKeyBindingsManager
          ? this.customKeyBindingsManager.getEffectiveCombo(action)
          : (() => {
              // Extract KeyCombination from default binding (remove description)
              const { description: _, ...combo } = defaultBinding;
              return combo as KeyCombination;
            })();
        this.keyboardManager.register(effectiveCombo, handler, defaultBinding.description);
      }
    }
  }

  private goToNextAnnotation(): void {
    const annotatedFrames = this.paintEngine.getAnnotatedFrames();
    if (annotatedFrames.size === 0) return;

    const currentFrame = this.session.currentFrame;
    const sortedFrames = Array.from(annotatedFrames).sort((a, b) => a - b);

    // Find next frame after current
    for (const frame of sortedFrames) {
      if (frame > currentFrame) {
        this.session.goToFrame(frame);
        return;
      }
    }

    // Wrap to first annotated frame
    if (sortedFrames[0] !== undefined) {
      this.session.goToFrame(sortedFrames[0]);
    }
  }

  private goToPreviousAnnotation(): void {
    const annotatedFrames = this.paintEngine.getAnnotatedFrames();
    if (annotatedFrames.size === 0) return;

    const currentFrame = this.session.currentFrame;
    const sortedFrames = Array.from(annotatedFrames).sort((a, b) => b - a); // Descending

    // Find previous frame before current
    for (const frame of sortedFrames) {
      if (frame < currentFrame) {
        this.session.goToFrame(frame);
        return;
      }
    }

    // Wrap to last annotated frame
    if (sortedFrames[0] !== undefined) {
      this.session.goToFrame(sortedFrames[0]);
    }
  }

  private start(): void {
    this.tick();
  }

  private tick = (): void => {
    this.session.update();

    // Only render on every frame during video playback
    // Static images and drawing are handled by event-driven updates
    const source = this.session.currentSource;
    if (source?.type === 'video' && this.session.isPlaying) {
      this.viewer.refresh();
    }

    this.animationId = requestAnimationFrame(this.tick);
  };

  private async handleSequenceExport(request: {
    format: 'png' | 'jpeg' | 'webp';
    includeAnnotations: boolean;
    quality: number;
    useInOutRange: boolean;
  }): Promise<void> {
    const source = this.session.currentSource;
    if (!source) {
      showAlert('No media loaded to export', { type: 'warning', title: 'Export' });
      return;
    }

    // Determine frame range
    let startFrame: number;
    let endFrame: number;

    if (request.useInOutRange) {
      startFrame = this.session.inPoint;
      endFrame = this.session.outPoint;
    } else {
      startFrame = 0;
      endFrame = this.session.frameCount - 1;
    }

    const totalFrames = endFrame - startFrame + 1;
    if (totalFrames <= 0) {
      showAlert('Invalid frame range', { type: 'warning', title: 'Export' });
      return;
    }

    // Generate filename pattern based on source
    const sourceName = source.name?.replace(/\.[^/.]+$/, '') || 'frame';
    const padLength = String(endFrame).length < 4 ? 4 : String(endFrame).length;

    // Create progress dialog
    const progressDialog = document.createElement('div');
    progressDialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 24px;
      z-index: 10000;
      min-width: 300px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;

    const progressText = document.createElement('div');
    progressText.style.cssText = 'color: #ddd; margin-bottom: 12px; font-size: 14px;';
    progressText.textContent = `Exporting frames 0/${totalFrames}...`;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      height: 8px;
      background: #444;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 16px;
    `;

    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
      height: 100%;
      background: #4a9eff;
      width: 0%;
      transition: width 0.1s ease;
    `;
    progressBar.appendChild(progressFill);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
      background: #555;
      border: 1px solid #666;
      color: #ddd;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      width: 100%;
    `;

    const cancellationToken = { cancelled: false };
    cancelButton.addEventListener('click', () => {
      cancellationToken.cancelled = true;
      cancelButton.textContent = 'Cancelling...';
      cancelButton.disabled = true;
    });

    progressDialog.appendChild(progressText);
    progressDialog.appendChild(progressBar);
    progressDialog.appendChild(cancelButton);
    document.body.appendChild(progressDialog);

    // Store current frame to restore later
    const originalFrame = this.session.currentFrame;

    try {
      const result = await exportSequence(
        {
          format: request.format,
          quality: request.quality,
          startFrame,
          endFrame,
          includeAnnotations: request.includeAnnotations,
          filenamePattern: `${sourceName}_####`,
          padLength,
        },
        async (frame: number) => {
          // Navigate to frame and render
          this.session.goToFrame(frame);
          // Small delay to allow frame to load
          await new Promise(resolve => setTimeout(resolve, 50));
          const canvas = await this.viewer.renderFrameToCanvas(frame, request.includeAnnotations);
          if (!canvas) {
            throw new Error(`Failed to render frame ${frame}`);
          }
          return canvas;
        },
        (progress) => {
          progressText.textContent = `Exporting frames ${progress.currentFrame - startFrame + 1}/${totalFrames}...`;
          progressFill.style.width = `${progress.percent}%`;
        },
        cancellationToken
      );

      // Restore original frame
      this.session.goToFrame(originalFrame);

      // Remove progress dialog
      document.body.removeChild(progressDialog);

      // Show result
      if (result.success) {
        showAlert(`Successfully exported ${result.exportedFrames} frames`, { type: 'success', title: 'Export Complete' });
      } else if (result.error?.includes('cancelled')) {
        showAlert('Export cancelled', { type: 'info', title: 'Export' });
      } else {
        showAlert(`Export failed: ${result.error}`, { type: 'error', title: 'Export Error' });
      }
    } catch (err) {
      // Restore original frame
      this.session.goToFrame(originalFrame);

      // Remove progress dialog
      if (document.body.contains(progressDialog)) {
        document.body.removeChild(progressDialog);
      }

      showAlert(`Export error: ${err}`, { type: 'error', title: 'Export Error' });
    }
  }

  /**
   * Schedule scope updates after the viewer has rendered.
   * Uses requestAnimationFrame to ensure updates happen after the render cycle.
   */
  private pendingScopeUpdate = false;
  private scheduleUpdateScopes(): void {
    if (this.pendingScopeUpdate) return;
    this.pendingScopeUpdate = true;

    // Use double requestAnimationFrame to ensure we run after the viewer's render
    // First RAF puts us in the same frame as the render, second RAF ensures render completed
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.pendingScopeUpdate = false;
        this.updateHistogram();
        this.updateWaveform();
        this.updateVectorscope();
      });
    });
  }

  /**
   * Update histogram with current frame data
   */
  private updateHistogram(): void {
    if (!this.histogram.isVisible()) return;

    const imageData = this.viewer.getImageData();
    if (imageData) {
      this.histogram.update(imageData);
    }
  }

  /**
   * Update waveform with current frame data
   */
  private updateWaveform(): void {
    if (!this.waveform.isVisible()) return;

    const imageData = this.viewer.getImageData();
    if (imageData) {
      this.waveform.update(imageData);
    }
  }

  /**
   * Update vectorscope with current frame data
   */
  private updateVectorscope(): void {
    if (!this.vectorscope.isVisible()) return;

    const imageData = this.viewer.getImageData();
    if (imageData) {
      this.vectorscope.update(imageData);
    }
  }

  private showShortcuts(): void {
    const content = document.createElement('div');
    content.style.cssText = `
      max-height: 70vh;
      overflow-y: auto;
      padding: 8px;
      font-family: monospace;
      font-size: 12px;
      color: #ccc;
      line-height: 1.6;
    `;

    // Group shortcuts by category
    const categories = {
      'TABS': ['tab.view', 'tab.color', 'tab.effects', 'tab.transform', 'tab.annotate'],
      'PLAYBACK': ['playback.toggle', 'playback.stepBackward', 'playback.stepForward', 'playback.goToStart', 'playback.goToEnd', 'playback.toggleDirection'],
      'VIEW': ['view.fitToWindow', 'view.fitToWindowAlt', 'view.zoom50', 'view.toggleAB', 'view.toggleABAlt'],
      'MOUSE CONTROLS': [], // Special case - not in DEFAULT_KEY_BINDINGS
      'CHANNEL ISOLATION': ['channel.red', 'channel.green', 'channel.blue', 'channel.alpha', 'channel.luminance', 'channel.none'],
      'SCOPES': ['panel.histogram', 'panel.waveform', 'panel.vectorscope'],
      'TIMELINE': ['timeline.setInPoint', 'timeline.setInPointAlt', 'timeline.setOutPoint', 'timeline.setOutPointAlt', 'timeline.resetInOut', 'timeline.toggleMark', 'timeline.cycleLoopMode'],
      'PAINT (Annotate tab)': ['paint.pan', 'paint.pen', 'paint.eraser', 'paint.text', 'paint.toggleBrush', 'paint.toggleGhost', 'edit.undo', 'edit.redo'],
      'COLOR': ['panel.color', 'panel.curves'],
      'WIPE COMPARISON': ['view.cycleWipeMode'],
      'AUDIO (Video only)': [], // Special case - not in DEFAULT_KEY_BINDINGS
      'EXPORT': ['export.quickExport', 'export.copyFrame'],
      'ANNOTATIONS': ['annotation.previous', 'annotation.next'],
      'TRANSFORM': ['transform.rotateLeft', 'transform.rotateRight', 'transform.flipHorizontal', 'transform.flipVertical'],
      'PANELS': ['panel.effects', 'panel.crop', 'panel.close'],
      'STEREO': ['stereo.toggle']
    };

    // Add special audio shortcuts
    const audioShortcuts = [
      { key: 'Hover vol', desc: 'Show volume slider' },
      { key: 'Click icon', desc: 'Toggle mute' }
    ];

    // Generate content for each category
    for (const [categoryName, actionKeys] of Object.entries(categories)) {
      if (actionKeys.length === 0 && categoryName !== 'AUDIO (Video only)') continue;

      const categoryDiv = document.createElement('div');
      categoryDiv.style.cssText = 'margin-bottom: 16px;';

      const categoryHeader = document.createElement('div');
      categoryHeader.style.cssText = 'font-weight: bold; color: #4a9eff; margin-bottom: 4px;';
      categoryHeader.textContent = categoryName;
      categoryDiv.appendChild(categoryHeader);

      // Special handling for audio category
      if (categoryName === 'AUDIO (Video only)') {
        for (const shortcut of audioShortcuts) {
          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';

          const keySpan = document.createElement('span');
          keySpan.textContent = shortcut.key;
          keySpan.style.cssText = 'color: #888; min-width: 120px;';

          const descSpan = document.createElement('span');
          descSpan.textContent = shortcut.desc;
          descSpan.style.cssText = 'color: #ccc; flex: 1;';

          shortcutDiv.appendChild(keySpan);
          shortcutDiv.appendChild(descSpan);
          categoryDiv.appendChild(shortcutDiv);
        }
      } else if (categoryName === 'MOUSE CONTROLS') {
        const mouseShortcuts = [
          { key: 'Drag', desc: 'Pan image' },
          { key: 'Scroll', desc: 'Zoom in/out' },
          { key: 'Dbl-click', desc: 'Reset individual slider (color panel)' },
          { key: 'Dbl-click', desc: 'Jump to nearest annotation (timeline)' },
          { key: 'Drag line', desc: 'Adjust wipe position' }
        ];

        for (const shortcut of mouseShortcuts) {
          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';

          const keySpan = document.createElement('span');
          keySpan.textContent = shortcut.key;
          keySpan.style.cssText = 'color: #888; min-width: 120px;';

          const descSpan = document.createElement('span');
          descSpan.textContent = shortcut.desc;
          descSpan.style.cssText = 'color: #ccc; flex: 1;';

          shortcutDiv.appendChild(keySpan);
          shortcutDiv.appendChild(descSpan);
          categoryDiv.appendChild(shortcutDiv);
        }
      } else {
        // Regular shortcuts from DEFAULT_KEY_BINDINGS
        for (const actionKey of actionKeys) {
          const defaultBinding = DEFAULT_KEY_BINDINGS[actionKey as keyof typeof DEFAULT_KEY_BINDINGS];
          if (!defaultBinding) continue;

          const effectiveCombo = this.customKeyBindingsManager.getEffectiveCombo(actionKey);
          const isCustom = this.customKeyBindingsManager.hasCustomBinding(actionKey);

          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';

          const keySpan = document.createElement('span');
          keySpan.textContent = describeKeyCombo(effectiveCombo);
          keySpan.style.cssText = `min-width: 120px; ${isCustom ? 'color: #4a9eff; font-weight: bold;' : 'color: #888;'}`;

          const descSpan = document.createElement('span');
          descSpan.textContent = defaultBinding.description;
          descSpan.style.cssText = 'color: #ccc; flex: 1;';

          const actionsDiv = document.createElement('div');
          actionsDiv.style.cssText = 'display: flex; gap: 4px;';

          // Reset button (only show if custom binding exists)
          if (isCustom) {
            const resetButton = document.createElement('button');
            resetButton.textContent = 'Reset';
            resetButton.style.cssText = `
              background: #666;
              border: none;
              color: white;
              padding: 2px 6px;
              border-radius: 3px;
              cursor: pointer;
              font-size: 10px;
            `;
            resetButton.onclick = () => {
              this.customKeyBindingsManager.removeCustomBinding(actionKey);
              this.refreshKeyboardShortcuts();
              this.showShortcuts(); // Refresh the display
            };
            actionsDiv.appendChild(resetButton);
          }

          shortcutDiv.appendChild(keySpan);
          shortcutDiv.appendChild(descSpan);
          shortcutDiv.appendChild(actionsDiv);
          categoryDiv.appendChild(shortcutDiv);
        }
      }

      content.appendChild(categoryDiv);
    }

    // Reset all button at bottom
    const resetAllContainer = document.createElement('div');
    resetAllContainer.style.cssText = `
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #444;
      text-align: center;
    `;

    const resetAllButton = document.createElement('button');
    resetAllButton.textContent = 'Reset All Shortcuts to Defaults';
    resetAllButton.style.cssText = `
      background: #d9534f;
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    resetAllButton.onclick = () => {
      if (confirm('Reset all keyboard shortcuts to defaults?')) {
        this.customKeyBindingsManager.resetAll();
        this.refreshKeyboardShortcuts();
        this.showShortcuts(); // Refresh the display
      }
    };
    resetAllContainer.appendChild(resetAllButton);
    content.appendChild(resetAllContainer);

    showModal(content, { title: 'Keyboard Shortcuts', width: '700px' });
  }

  private showCustomKeyBindings(): void {
    const content = document.createElement('div');
    content.style.cssText = `
      max-height: 70vh;
      overflow-y: auto;
      padding: 8px;
    `;

    const actions = this.customKeyBindingsManager.getAvailableActions();

    // Create table header
    const header = document.createElement('div');
    header.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 120px 80px;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid #444;
      font-weight: bold;
      color: #ccc;
      font-size: 12px;
    `;
    header.innerHTML = `
      <div>Action</div>
      <div>Current Key</div>
      <div>Actions</div>
    `;
    content.appendChild(header);

    // Create rows for each action
    for (const action of actions) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 120px 80px;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 1px solid #333;
        align-items: center;
      `;

      // Action description
      const descCell = document.createElement('div');
      descCell.style.cssText = `
        color: #eee;
        font-size: 13px;
      `;
      descCell.textContent = action.description;
      row.appendChild(descCell);

      // Current key combination
      const keyCell = document.createElement('div');
      keyCell.style.cssText = `
        background: #333;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 4px 8px;
        color: #ccc;
        font-family: monospace;
        font-size: 12px;
        text-align: center;
      `;
      keyCell.textContent = this.formatKeyCombo(action.currentCombo);
      row.appendChild(keyCell);

      // Action buttons
      const buttonCell = document.createElement('div');
      buttonCell.style.cssText = `
        display: flex;
        gap: 4px;
      `;

      // Set custom binding button
      const setButton = document.createElement('button');
      setButton.textContent = 'Set';
      setButton.style.cssText = `
        background: #4a9eff;
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
      `;
      setButton.onclick = () => this.promptForKeyBinding(action.action, keyCell);
      buttonCell.appendChild(setButton);

      // Reset to default button (only if custom binding exists)
      if (this.customKeyBindingsManager.hasCustomBinding(action.action)) {
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset';
        resetButton.style.cssText = `
          background: #666;
          border: none;
          color: white;
          padding: 4px 6px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 11px;
        `;
        resetButton.onclick = () => {
          this.customKeyBindingsManager.removeCustomBinding(action.action);
          keyCell.textContent = this.formatKeyCombo(this.customKeyBindingsManager.getEffectiveCombo(action.action));
          this.refreshKeyboardShortcuts(); // Update keyboard shortcuts immediately
          resetButton.remove(); // Remove reset button after resetting
        };
        buttonCell.appendChild(resetButton);
      }

      row.appendChild(buttonCell);
      content.appendChild(row);
    }

    // Reset all button at bottom
    const resetAllContainer = document.createElement('div');
    resetAllContainer.style.cssText = `
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #444;
      text-align: center;
    `;

    const resetAllButton = document.createElement('button');
    resetAllButton.textContent = 'Reset All to Defaults';
    resetAllButton.style.cssText = `
      background: #d9534f;
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    resetAllButton.onclick = () => {
      if (confirm('Reset all custom key bindings to defaults?')) {
        this.customKeyBindingsManager.resetAll();
        this.refreshKeyboardShortcuts(); // Update keyboard shortcuts immediately
        // Close and reopen modal to refresh the list
        closeModal();
        setTimeout(() => this.showCustomKeyBindings(), 100);
      }
    };
    resetAllContainer.appendChild(resetAllButton);
    content.appendChild(resetAllContainer);

    showModal(content, { title: 'Custom Key Bindings', width: '700px' });
  }

  private formatKeyCombo(combo: KeyCombination): string {
    return describeKeyCombo(combo);
  }

  private promptForKeyBinding(action: string, keyCell: HTMLElement): void {
    const promptContent = document.createElement('div');
    promptContent.style.cssText = `
      text-align: center;
      padding: 20px;
    `;

    const instruction = document.createElement('div');
    instruction.style.cssText = `
      color: #ccc;
      margin-bottom: 16px;
      font-size: 14px;
    `;
    instruction.textContent = 'Press the key combination you want to use for this action:';
    promptContent.appendChild(instruction);

    const keyDisplay = document.createElement('div');
    keyDisplay.style.cssText = `
      background: #333;
      border: 2px solid #4a9eff;
      border-radius: 8px;
      padding: 16px;
      color: #4a9eff;
      font-family: monospace;
      font-size: 18px;
      font-weight: bold;
      margin: 16px 0;
      min-height: 24px;
    `;
    keyDisplay.textContent = 'Waiting for key press...';
    promptContent.appendChild(keyDisplay);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
      background: #666;
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 16px;
    `;
    // Show the prompt modal
    const { close } = showModal(promptContent, { title: 'Set Key Binding', width: '400px' });

    // Listen for key presses
    let listening = true;

    // Cleanup function to ensure event listener is always removed
    const cleanup = () => {
      listening = false;
      document.removeEventListener('keydown', handleKeyDown);
    };

    // Set up cancel button to properly clean up
    cancelButton.onclick = () => {
      cleanup();
      close();
    };
    promptContent.appendChild(cancelButton);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!listening) return;

      e.preventDefault();
      e.stopPropagation();

      // Ignore modifier-only presses
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      // Create key combination
      const combo: KeyCombination = {
        code: e.code,
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey && !e.ctrlKey
      };

      // Display the combination
      keyDisplay.textContent = this.formatKeyCombo(combo);

      // Confirm button
      const confirmButton = document.createElement('button');
      confirmButton.textContent = 'Confirm';
      confirmButton.style.cssText = `
        background: #4a9eff;
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        margin-left: 8px;
      `;
      confirmButton.onclick = () => {
        try {
          this.customKeyBindingsManager.setCustomBinding(action, combo);
          keyCell.textContent = this.formatKeyCombo(combo);
          this.refreshKeyboardShortcuts(); // Update keyboard shortcuts immediately
          cleanup();
          close();
        } catch (err) {
          alert(`Error setting key binding: ${err}`);
        }
      };

      // Replace cancel button with confirm + cancel
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        margin-top: 16px;
        display: flex;
        justify-content: center;
        gap: 8px;
      `;
      buttonContainer.appendChild(confirmButton);

      const newCancelButton = document.createElement('button');
      newCancelButton.textContent = 'Cancel';
      newCancelButton.style.cssText = `
        background: #666;
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      `;
      newCancelButton.onclick = () => {
        cleanup();
        close();
      };
      buttonContainer.appendChild(newCancelButton);

      // Replace the old cancel button
      cancelButton.replaceWith(buttonContainer);
    };

    document.addEventListener('keydown', handleKeyDown);
  }

  private syncGTOStore(): void {
    if (!this.gtoStore) return;
    this.gtoStore.updateFromState({
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      scopesState: this.scopesControl.getState(),
    });
  }

  private async saveProject(): Promise<void> {
    try {
      const state = SessionSerializer.toJSON(
        {
          session: this.session,
          paintEngine: this.paintEngine,
          viewer: this.viewer,
        },
        'project'
      );
      await SessionSerializer.saveToFile(state, 'project.orvproject');
    } catch (err) {
      showAlert(`Failed to save project: ${err}`, { type: 'error', title: 'Save Error' });
    }
  }

  private async saveRvSession(format: 'rv' | 'gto'): Promise<void> {
    try {
      const sourceName = this.session.currentSource?.name;
      const base = sourceName ? sourceName : 'session';
      const filename = `${base}.${format}`;

      if (this.gtoStore) {
        await this.gtoStore.saveToFile(filename, { binary: format === 'gto' });
      } else {
        await SessionGTOExporter.saveToFile(this.session, this.paintEngine, filename, { binary: format === 'gto' });
      }
    } catch (err) {
      showAlert(`Failed to save RV session: ${err}`, { type: 'error', title: 'Save Error' });
    }
  }

  private async openProject(file: File): Promise<void> {
    try {
      const state = await SessionSerializer.loadFromFile(file);
      const result = await SessionSerializer.fromJSON(
        state,
        {
          session: this.session,
          paintEngine: this.paintEngine,
          viewer: this.viewer,
        }
      );

      if (result.warnings.length > 0) {
        showAlert(`Project loaded with warnings:\n${result.warnings.join('\n')}`, {
          type: 'warning',
          title: 'Project Loaded',
        });
      } else if (result.loadedMedia > 0) {
        showAlert(`Project loaded successfully (${result.loadedMedia} media files)`, {
          type: 'success',
          title: 'Project Loaded',
        });
      } else {
        showAlert('Project loaded (no media files - state only)', {
          type: 'info',
          title: 'Project Loaded',
        });
      }
    } catch (err) {
      showAlert(`Failed to load project: ${err}`, { type: 'error', title: 'Load Error' });
    }
  }

  dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }

    // Remove global event listeners
    window.removeEventListener('resize', this.boundHandleResize);

    this.viewer.dispose();
    this.timeline.dispose();
    this.headerBar.dispose();
    this.tabBar.dispose();
    this.contextToolbar.dispose();
    this.paintToolbar.dispose();
    this.colorControls.dispose();
    this.zoomControl.dispose();
    this.scopesControl.dispose();
    this.compareControl.dispose();
    this.transformControl.dispose();
    this.filterControl.dispose();
    this.cropControl.dispose();
    this.cdlControl.dispose();
    this.curvesControl.dispose();
    this.lensControl.dispose();
    this.stackControl.dispose();
    this.channelSelect.dispose();
    this.stereoControl.dispose();
    this.histogram.dispose();
    this.waveform.dispose();
    this.vectorscope.dispose();
  }
}
