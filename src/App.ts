import { Session } from './core/session/Session';
import { Viewer } from './ui/components/Viewer';
import { Timeline } from './ui/components/Timeline';
import { HeaderBar } from './ui/components/layout/HeaderBar';
import { TabBar, TabId } from './ui/components/layout/TabBar';
import { ContextToolbar } from './ui/components/layout/ContextToolbar';
import { PaintEngine } from './paint/PaintEngine';
import { PaintToolbar } from './ui/components/PaintToolbar';
import { ColorControls } from './ui/components/ColorControls';
import { WipeControl } from './ui/components/WipeControl';
import { TransformControl } from './ui/components/TransformControl';
import { FilterControl } from './ui/components/FilterControl';
import { CropControl } from './ui/components/CropControl';
import { CDLControl } from './ui/components/CDLControl';
import { CurvesControl } from './ui/components/CurvesControl';
import { LensControl } from './ui/components/LensControl';
import { StackControl } from './ui/components/StackControl';
import { ChannelSelect } from './ui/components/ChannelSelect';
import { Histogram } from './ui/components/Histogram';
import { Waveform } from './ui/components/Waveform';
import { Vectorscope } from './ui/components/Vectorscope';
import { exportSequence } from './utils/SequenceExporter';
import { showAlert, showModal } from './ui/components/shared/Modal';
import { SessionSerializer } from './core/session/SessionSerializer';

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
  private wipeControl: WipeControl;
  private transformControl: TransformControl;
  private filterControl: FilterControl;
  private cropControl: CropControl;
  private cdlControl: CDLControl;
  private curvesControl: CurvesControl;
  private lensControl: LensControl;
  private stackControl: StackControl;
  private channelSelect: ChannelSelect;
  private histogram: Histogram;
  private waveform: Waveform;
  private vectorscope: Vectorscope;
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
    this.wipeControl = new WipeControl();

    // Connect color controls to viewer
    this.colorControls.on('adjustmentsChanged', (adjustments) => {
      this.viewer.setColorAdjustments(adjustments);
    });

    // Connect LUT events
    this.colorControls.on('lutLoaded', (lut) => {
      this.viewer.setLUT(lut);
    });
    this.colorControls.on('lutIntensityChanged', (intensity) => {
      this.viewer.setLUTIntensity(intensity);
    });

    // Connect wipe control to viewer
    this.wipeControl.on('stateChanged', (state) => {
      this.viewer.setWipeState(state);
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

    // Initialize transform control
    this.transformControl = new TransformControl();
    this.transformControl.on('transformChanged', (transform) => {
      this.viewer.setTransform(transform);
    });

    // Initialize filter control
    this.filterControl = new FilterControl();
    this.filterControl.on('filtersChanged', (settings) => {
      this.viewer.setFilterSettings(settings);
    });

    // Initialize crop control
    this.cropControl = new CropControl();
    this.cropControl.on('cropStateChanged', (state) => {
      this.viewer.setCropState(state);
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
    const viewContent = document.createElement('div');
    viewContent.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    // Zoom controls
    const zoomLabel = document.createElement('span');
    zoomLabel.textContent = 'Zoom:';
    zoomLabel.style.cssText = 'color: #888; font-size: 11px;';
    viewContent.appendChild(zoomLabel);

    viewContent.appendChild(ContextToolbar.createButton('Fit', () => this.viewer.fitToWindow(), { title: 'Fit to window (F)' }));
    viewContent.appendChild(ContextToolbar.createButton('50%', () => this.viewer.setZoom(0.5), { title: 'Zoom 50% (0)' }));
    viewContent.appendChild(ContextToolbar.createButton('100%', () => this.viewer.setZoom(1), { title: 'Zoom 100% (1)' }));
    viewContent.appendChild(ContextToolbar.createButton('200%', () => this.viewer.setZoom(2), { title: 'Zoom 200% (2)' }));
    viewContent.appendChild(ContextToolbar.createButton('400%', () => this.viewer.setZoom(4), { title: 'Zoom 400% (4)' }));

    viewContent.appendChild(ContextToolbar.createDivider());

    // Channel select
    viewContent.appendChild(this.channelSelect.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Wipe control
    viewContent.appendChild(this.wipeControl.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Stack control
    viewContent.appendChild(this.stackControl.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Histogram toggle button
    const histogramButton = ContextToolbar.createButton('Histogram', () => {
      this.histogram.toggle();
      if (this.histogram.isVisible()) {
        this.updateHistogram();
        histogramButton.style.background = 'rgba(74, 158, 255, 0.15)';
        histogramButton.style.borderColor = '#4a9eff';
      } else {
        histogramButton.style.background = '';
        histogramButton.style.borderColor = '';
      }
    }, { title: 'Toggle histogram display (H)' });
    viewContent.appendChild(histogramButton);

    // Update histogram button state when visibility changes
    this.histogram.on('visibilityChanged', (visible) => {
      if (visible) {
        histogramButton.style.background = 'rgba(74, 158, 255, 0.15)';
        histogramButton.style.borderColor = '#4a9eff';
      } else {
        histogramButton.style.background = '';
        histogramButton.style.borderColor = '';
      }
    });

    // Waveform toggle button
    const waveformButton = ContextToolbar.createButton('Waveform', () => {
      this.waveform.toggle();
      if (this.waveform.isVisible()) {
        this.updateWaveform();
        waveformButton.style.background = 'rgba(74, 158, 255, 0.15)';
        waveformButton.style.borderColor = '#4a9eff';
      } else {
        waveformButton.style.background = '';
        waveformButton.style.borderColor = '';
      }
    }, { title: 'Toggle waveform display (W)' });
    viewContent.appendChild(waveformButton);

    // Update waveform button state when visibility changes
    this.waveform.on('visibilityChanged', (visible) => {
      if (visible) {
        waveformButton.style.background = 'rgba(74, 158, 255, 0.15)';
        waveformButton.style.borderColor = '#4a9eff';
      } else {
        waveformButton.style.background = '';
        waveformButton.style.borderColor = '';
      }
    });

    // Vectorscope toggle button
    const vectorscopeButton = ContextToolbar.createButton('Vectorscope', () => {
      this.vectorscope.toggle();
      if (this.vectorscope.isVisible()) {
        this.updateVectorscope();
        vectorscopeButton.style.background = 'rgba(74, 158, 255, 0.15)';
        vectorscopeButton.style.borderColor = '#4a9eff';
      } else {
        vectorscopeButton.style.background = '';
        vectorscopeButton.style.borderColor = '';
      }
    }, { title: 'Toggle vectorscope display (Y)' });
    viewContent.appendChild(vectorscopeButton);

    // Update vectorscope button state when visibility changes
    this.vectorscope.on('visibilityChanged', (visible) => {
      if (visible) {
        vectorscopeButton.style.background = 'rgba(74, 158, 255, 0.15)';
        vectorscopeButton.style.borderColor = '#4a9eff';
      } else {
        vectorscopeButton.style.background = '';
        vectorscopeButton.style.borderColor = '';
      }
    });

    viewContent.appendChild(ContextToolbar.createDivider());

    // A/B Compare controls
    const abLabel = document.createElement('span');
    abLabel.textContent = 'A/B:';
    abLabel.style.cssText = 'color: #888; font-size: 11px;';
    viewContent.appendChild(abLabel);

    const abButtonA = ContextToolbar.createButton('A', () => {
      this.session.setCurrentAB('A');
    }, { title: 'Show source A' });
    abButtonA.style.minWidth = '28px';
    abButtonA.dataset.testid = 'ab-button-a';
    viewContent.appendChild(abButtonA);

    const abButtonB = ContextToolbar.createButton('B', () => {
      this.session.setCurrentAB('B');
    }, { title: 'Show source B' });
    abButtonB.style.minWidth = '28px';
    abButtonB.dataset.testid = 'ab-button-b';
    viewContent.appendChild(abButtonB);

    const abToggleButton = ContextToolbar.createButton('⇄', () => {
      this.session.toggleAB();
    }, { title: 'Toggle A/B (`)' });
    abToggleButton.dataset.testid = 'ab-toggle-button';
    viewContent.appendChild(abToggleButton);

    // Helper to update A/B button states
    const updateABButtonStates = () => {
      const current = this.session.currentAB;
      const available = this.session.abCompareAvailable;

      if (current === 'A') {
        abButtonA.style.background = 'rgba(74, 158, 255, 0.15)';
        abButtonA.style.borderColor = '#4a9eff';
        abButtonB.style.background = '';
        abButtonB.style.borderColor = '';
      } else {
        abButtonA.style.background = '';
        abButtonA.style.borderColor = '';
        abButtonB.style.background = 'rgba(74, 158, 255, 0.15)';
        abButtonB.style.borderColor = '#4a9eff';
      }

      // Disable B button and toggle if B source not assigned
      abButtonB.disabled = !available;
      abToggleButton.disabled = !available;
      abButtonB.style.opacity = available ? '1' : '0.5';
      abToggleButton.style.opacity = available ? '1' : '0.5';
    };

    // Initial state
    updateABButtonStates();

    // Listen for A/B changes
    this.session.on('abSourceChanged', () => {
      updateABButtonStates();
    });

    // Listen for source changes that might affect A/B availability
    this.session.on('sourceLoaded', () => {
      updateABButtonStates();
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
      if (this.curvesControl.isVisible()) {
        curvesButton.style.background = 'rgba(74, 158, 255, 0.15)';
        curvesButton.style.borderColor = '#4a9eff';
      } else {
        curvesButton.style.background = '';
        curvesButton.style.borderColor = '';
      }
    }, { title: 'Toggle color curves panel (U)' });
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
        this.wipeControl.cycleMode();
        break;
      case 'w':
        // Shift+w cycles wipe mode, plain w toggles waveform
        if (e.shiftKey) {
          this.wipeControl.cycleMode();
        } else {
          this.waveform.toggle();
          if (this.waveform.isVisible()) {
            this.updateWaveform();
          }
        }
        break;
      case 'y':
        // Toggle vectorscope (lowercase only)
        this.vectorscope.toggle();
        if (this.vectorscope.isVisible()) {
          this.updateVectorscope();
        }
        break;
      case 'h':
        // Toggle histogram (lowercase only, Shift+H is for flip horizontal)
        this.histogram.toggle();
        if (this.histogram.isVisible()) {
          this.updateHistogram();
        }
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
    this.wipeControl.dispose();
    this.transformControl.dispose();
    this.filterControl.dispose();
    this.cropControl.dispose();
    this.cdlControl.dispose();
    this.curvesControl.dispose();
    this.lensControl.dispose();
    this.stackControl.dispose();
    this.channelSelect.dispose();
    this.histogram.dispose();
    this.waveform.dispose();
    this.vectorscope.dispose();
  }
}
