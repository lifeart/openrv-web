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
import { LensControl } from './ui/components/LensControl';
import { StackControl } from './ui/components/StackControl';
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
  private lensControl: LensControl;
  private stackControl: StackControl;
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

    // Connect volume control (from HeaderBar) to session
    const volumeControl = this.headerBar.getVolumeControl();
    volumeControl.on('volumeChanged', (volume) => {
      this.session.volume = volume;
    });
    volumeControl.on('mutedChanged', (muted) => {
      this.session.muted = muted;
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

    // Wipe control
    viewContent.appendChild(this.wipeControl.render());

    viewContent.appendChild(ContextToolbar.createDivider());

    // Stack control
    viewContent.appendChild(this.stackControl.render());

    this.contextToolbar.setTabContent('view', viewContent);

    // === COLOR TAB ===
    const colorContent = document.createElement('div');
    colorContent.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    colorContent.appendChild(this.colorControls.render());
    colorContent.appendChild(ContextToolbar.createDivider());
    colorContent.appendChild(this.cdlControl.render());
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
      case 'w':
      case 'W':
        // Cycle wipe mode
        this.wipeControl.cycleMode();
        break;
      case 'g':
      case 'G':
        // Toggle filter effects panel
        this.filterControl.toggle();
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
    this.lensControl.dispose();
    this.stackControl.dispose();
  }
}
