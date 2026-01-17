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
import { exportSequence } from './utils/SequenceExporter';
import { showAlert, showModal } from './ui/components/shared/Modal';
import { SessionSerializer } from './core/session/SessionSerializer';
import { SessionGTOExporter } from './core/session/SessionGTOExporter';
import { SessionGTOStore } from './core/session/SessionGTOStore';

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
  private animationId: number | null = null;
  private boundHandleKeydown: (e: KeyboardEvent) => void;
  private boundHandleResize: () => void;

  constructor() {
    // Bind event handlers for proper cleanup
    this.boundHandleKeydown = (e: KeyboardEvent) => this.handleKeydown(e);
    this.boundHandleResize = () => this.viewer.resize();

    this.session = new Session();
    this.paintEngine = new PaintEngine();
    this.viewer = new Viewer(this.session, this.paintEngine);
    this.timeline = new Timeline(this.session, this.paintEngine);

    // Create HeaderBar (contains file ops, playback, volume, export, help)
    this.headerBar = new HeaderBar(this.session);
    this.headerBar.on('showShortcuts', () => this.showShortcuts());
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
      this.syncGTOStore();
    });

    // Connect LUT events
    this.colorControls.on('lutLoaded', (lut) => {
      this.viewer.setLUT(lut);
    });
    this.colorControls.on('lutIntensityChanged', (intensity) => {
      this.viewer.setLUTIntensity(intensity);
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
    });

    // Initialize curves control
    this.curvesControl = new CurvesControl();
    this.curvesControl.on('curvesChanged', (curves) => {
      this.viewer.setCurves(curves);
    });

    // Initialize lens distortion control
    this.lensControl = new LensControl();
    this.lensControl.on('lensChanged', (params) => {
      this.viewer.setLensParams(params);
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
    });
    this.stackControl.on('layerChanged', () => {
      this.viewer.setStackLayers(this.stackControl.getLayers());
    });
    this.stackControl.on('layerRemoved', () => {
      this.viewer.setStackLayers(this.stackControl.getLayers());
    });
    this.stackControl.on('layerReordered', () => {
      this.viewer.setStackLayers(this.stackControl.getLayers());
    });

    // Initialize channel select control
    this.channelSelect = new ChannelSelect();
    this.channelSelect.on('channelChanged', (channel) => {
      this.viewer.setChannelMode(channel);
      this.syncGTOStore();
    });

    // Initialize stereo control
    this.stereoControl = new StereoControl();
    this.stereoControl.on('stateChanged', (state) => {
      this.viewer.setStereoState(state);
      this.syncGTOStore();
    });

    // Initialize histogram
    this.histogram = new Histogram();

    // Initialize waveform
    this.waveform = new Waveform();

    // Initialize vectorscope
    this.vectorscope = new Vectorscope();
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

    // Keyboard shortcuts
    document.addEventListener('keydown', this.boundHandleKeydown);

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

  private handleKeydown(e: KeyboardEvent): void {
    // For text inputs, only allow specific playback keys through
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      const input = e.target as HTMLInputElement;
      // Allow playback keys for non-text inputs (range, color, etc.)
      // For text inputs, block everything except specific global shortcuts
      const isTextInput = input.type === 'text' || input.type === 'search' || input.type === 'password' ||
                          input.type === 'email' || input.type === 'url' || input.type === 'tel' ||
                          e.target instanceof HTMLTextAreaElement;

      // Global playback keys that should always work (blur the input first)
      const globalKeys = [' ', 'Escape', 'Home', 'End'];
      if (globalKeys.includes(e.key)) {
        (e.target as HTMLElement).blur();
        // Continue to handle the key
      } else if (isTextInput) {
        // Block other keys for text inputs to allow typing
        return;
      }
      // For non-text inputs (range, color), allow keyboard shortcuts through
    }

    // Try paint toolbar shortcuts first (only if no modifier keys pressed)
    // Shift/Alt modifiers are used for transform shortcuts
    if (!e.shiftKey && !e.altKey && this.paintToolbar.handleKeyboard(e.key)) {
      e.preventDefault();
      return;
    }

    // Handle Ctrl+Z/Y for undo/redo, Ctrl+S for export, Ctrl+C for copy
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        this.paintEngine.undo();
        return;
      } else if (e.key === 'y') {
        e.preventDefault();
        this.paintEngine.redo();
        return;
      } else if (e.key === 's') {
        e.preventDefault();
        this.headerBar.getExportControl().quickExport('png');
        return;
      } else if (e.key === 'c') {
        e.preventDefault();
        this.viewer.copyFrameToClipboard(true);
        return;
      }
    }

    // Handle transform shortcuts (Shift/Alt + key)
    if (e.shiftKey || e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        if (e.shiftKey) {
          this.transformControl.rotateLeft();
        } else {
          this.transformControl.rotateRight();
        }
        return;
      } else if (key === 'h' && e.shiftKey) {
        e.preventDefault();
        this.transformControl.toggleFlipH();
        return;
      } else if (key === 'v' && e.shiftKey) {
        e.preventDefault();
        this.transformControl.toggleFlipV();
        return;
      }

      // Handle channel select shortcuts (Shift + G/B/A/L/N)
      // Note: Shift+R is used for rotation, so Red channel must be selected via UI
      if (e.shiftKey && this.channelSelect.handleKeyboard(e.key, e.shiftKey)) {
        e.preventDefault();
        return;
      }

      // Handle stereo control shortcuts (Shift + 3)
      if (e.shiftKey && this.stereoControl.handleKeyboard(e.key, e.shiftKey)) {
        e.preventDefault();
        return;
      }
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.session.togglePlayback();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.session.stepBackward();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.session.stepForward();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.session.togglePlayDirection();
        break;
      case 'Home':
        e.preventDefault();
        this.session.goToStart();
        break;
      case 'End':
        e.preventDefault();
        this.session.goToEnd();
        break;
      case 'f':
      case 'F':
        this.viewer.fitToWindow();
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        // Tab navigation (1-5)
        if (this.tabBar.handleKeyboard(e.key)) {
          e.preventDefault();
        }
        break;
      case '0':
        // Zoom 50% when on View tab
        if (this.tabBar.activeTab === 'view') {
          this.viewer.setZoom(0.5);
        }
        break;
      case '[':
        this.session.setInPoint();
        break;
      case ']':
        this.session.setOutPoint();
        break;
      case 'i':
      case 'I':
        this.session.setInPoint();
        break;
      case 'o':
      case 'O':
        this.session.setOutPoint();
        break;
      case 'm':
      case 'M':
        this.session.toggleMark();
        break;
      case 'l':
      case 'L':
        // Cycle loop mode
        const modes: Array<'once' | 'loop' | 'pingpong'> = ['once', 'loop', 'pingpong'];
        const currentIndex = modes.indexOf(this.session.loopMode);
        this.session.loopMode = modes[(currentIndex + 1) % modes.length]!;
        break;
      case 'r':
      case 'R':
        // Reset in/out points to full duration
        this.session.resetInOutPoints();
        break;
      case 'c':
      case 'C':
        // Toggle color controls panel
        this.colorControls.toggle();
        break;
      case 'W':
        // Cycle wipe mode (uppercase or Shift+w)
        this.compareControl.cycleWipeMode();
        break;
      case 'w':
        // Shift+w cycles wipe mode, plain w toggles waveform
        if (e.shiftKey) {
          this.compareControl.cycleWipeMode();
        } else {
          this.scopesControl.toggleScope('waveform');
        }
        break;
      case 'y':
        // Toggle vectorscope (lowercase only)
        this.scopesControl.toggleScope('vectorscope');
        break;
      case 'h':
        // Toggle histogram (lowercase only, Shift+H is for flip horizontal)
        this.scopesControl.toggleScope('histogram');
        break;
      case 'g':
      case 'G':
        // Toggle filter effects panel
        this.filterControl.toggle();
        break;
      case 'u':
      case 'U':
        // Toggle curves panel
        this.curvesControl.toggle();
        break;
      case 'k':
      case 'K':
        // Toggle crop mode
        this.cropControl.toggle();
        break;
      case 'Escape':
        // Reset color adjustments when Escape pressed while color panel is open
        if (this.colorControls) {
          this.colorControls.hide();
        }
        break;
      case '<':
      case ',':
        // Go to previous annotated frame
        e.preventDefault();
        this.goToPreviousAnnotation();
        break;
      case '>':
      case '.':
        // Go to next annotated frame
        e.preventDefault();
        this.goToNextAnnotation();
        break;
      case '`':
      case '~':
        // Toggle A/B source compare
        e.preventDefault();
        this.session.toggleAB();
        break;
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
      font-family: monospace;
      font-size: 12px;
      color: #ccc;
      line-height: 1.6;
    `;
    content.innerHTML = `<pre style="margin: 0; white-space: pre-wrap;">Keyboard Shortcuts:

TABS
1         - View tab
2         - Color tab
3         - Effects tab
4         - Transform tab
5         - Annotate tab

PLAYBACK
Space     - Play/Pause
\u2190 / \u2192     - Step frame
Home/End  - Go to start/end
\u2191         - Toggle direction

VIEW
F         - Fit to window
0         - Zoom 50%
Drag      - Pan image
Scroll    - Zoom

CHANNEL ISOLATION
Shift+G   - Green channel
Shift+B   - Blue channel
Shift+A   - Alpha channel
Shift+L   - Luminance
Shift+N   - RGB (all channels)

SCOPES
H         - Toggle histogram display
w         - Toggle waveform display
y         - Toggle vectorscope display

TIMELINE
I / [     - Set in point
O / ]     - Set out point
R         - Reset in/out points
M         - Toggle mark
L         - Cycle loop mode

PAINT (Annotate tab)
V         - Pan tool (no paint)
P         - Pen tool
E         - Eraser tool
T         - Text tool
B         - Toggle brush type
G         - Toggle ghost mode
Ctrl+Z    - Undo
Ctrl+Y    - Redo

COLOR
C         - Toggle color panel
U         - Toggle curves panel
Esc       - Close color panel
Dbl-click - Reset individual slider

WIPE COMPARISON
W         - Cycle wipe mode (off/horizontal/vertical)
Drag line - Adjust wipe position

AUDIO (Video only)
Hover vol - Show volume slider
Click icon- Toggle mute

EXPORT
Ctrl+S    - Quick export as PNG
Ctrl+C    - Copy frame to clipboard

ANNOTATIONS
< / ,     - Go to previous annotation
> / .     - Go to next annotation
Dbl-click - Jump to nearest annotation (timeline)

TRANSFORM
Shift+R   - Rotate left 90°
Alt+R     - Rotate right 90°
Shift+H   - Flip horizontal
Shift+V   - Flip vertical</pre>`;

    showModal(content, { title: 'Keyboard Shortcuts', width: '500px' });
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
    document.removeEventListener('keydown', this.boundHandleKeydown);

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
