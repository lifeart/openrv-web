import { Session } from './core/session/Session';
import { Viewer } from './ui/components/Viewer';
import { Timeline } from './ui/components/Timeline';
import { Toolbar } from './ui/components/Toolbar';
import { PaintEngine } from './paint/PaintEngine';
import { PaintToolbar } from './ui/components/PaintToolbar';
import { ColorControls } from './ui/components/ColorControls';
import { WipeControl } from './ui/components/WipeControl';
import { VolumeControl } from './ui/components/VolumeControl';
import { ExportControl } from './ui/components/ExportControl';

export class App {
  private container: HTMLElement | null = null;
  private session: Session;
  private viewer: Viewer;
  private timeline: Timeline;
  private toolbar: Toolbar;
  private paintEngine: PaintEngine;
  private paintToolbar: PaintToolbar;
  private colorControls: ColorControls;
  private wipeControl: WipeControl;
  private volumeControl: VolumeControl;
  private exportControl: ExportControl;
  private animationId: number | null = null;

  constructor() {
    this.session = new Session();
    this.paintEngine = new PaintEngine();
    this.viewer = new Viewer(this.session, this.paintEngine);
    this.timeline = new Timeline(this.session);
    this.toolbar = new Toolbar(this.session, {
      fitToWindow: () => this.viewer.fitToWindow(),
      setZoom: (level: number) => this.viewer.setZoom(level),
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

    // Initialize volume control and connect to session
    this.volumeControl = new VolumeControl();
    this.volumeControl.on('volumeChanged', (volume) => {
      this.session.volume = volume;
    });
    this.volumeControl.on('mutedChanged', (muted) => {
      this.session.muted = muted;
    });

    // Initialize export control
    this.exportControl = new ExportControl();
    this.exportControl.on('exportRequested', ({ format, includeAnnotations, quality }) => {
      this.viewer.exportFrame(format, includeAnnotations, quality);
    });
    this.exportControl.on('copyRequested', () => {
      this.viewer.copyFrameToClipboard(true);
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

    // Create toolbar row with main toolbar and paint toolbar
    const toolbarRow = document.createElement('div');
    toolbarRow.style.cssText = `
      display: flex;
      background: linear-gradient(180deg, #333 0%, #2a2a2a 100%);
      border-bottom: 1px solid #444;
      flex-shrink: 0;
    `;

    const toolbarEl = this.toolbar.render();
    toolbarEl.style.borderBottom = 'none';
    const paintToolbarEl = this.paintToolbar.render();
    const colorControlsEl = this.colorControls.render();
    const wipeControlEl = this.wipeControl.render();
    const volumeControlEl = this.volumeControl.render();
    const exportControlEl = this.exportControl.render();

    toolbarRow.appendChild(toolbarEl);
    toolbarRow.appendChild(paintToolbarEl);
    toolbarRow.appendChild(colorControlsEl);
    toolbarRow.appendChild(wipeControlEl);
    toolbarRow.appendChild(volumeControlEl);
    toolbarRow.appendChild(exportControlEl);

    const viewerEl = this.viewer.getElement();
    const timelineEl = this.timeline.render();

    this.container.appendChild(toolbarRow);
    this.container.appendChild(viewerEl);
    this.container.appendChild(timelineEl);

    // Handle clear frame event from paint toolbar
    paintToolbarEl.addEventListener('clearFrame', () => {
      this.paintEngine.clearFrame(this.session.currentFrame);
    });
  }

  private bindEvents(): void {
    // Handle window resize
    window.addEventListener('resize', () => {
      this.viewer.resize();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    // Load annotations from GTO files
    this.session.on('annotationsLoaded', ({ annotations, effects }) => {
      this.paintEngine.loadFromAnnotations(annotations, effects);
    });
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Ignore if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Try paint toolbar shortcuts first
    if (this.paintToolbar.handleKeyboard(e.key)) {
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
        this.exportControl.quickExport('png');
        return;
      } else if (e.key === 'c') {
        e.preventDefault();
        this.viewer.copyFrameToClipboard(true);
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
        this.viewer.setZoom(1);
        break;
      case '2':
        this.viewer.setZoom(2);
        break;
      case '4':
        this.viewer.setZoom(4);
        break;
      case '0':
        this.viewer.setZoom(0.5);
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
      case 'Escape':
        // Reset color adjustments when Escape pressed while color panel is open
        if (this.colorControls) {
          this.colorControls.hide();
        }
        break;
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

  dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    this.viewer.dispose();
    this.timeline.dispose();
    this.toolbar.dispose();
    this.paintToolbar.dispose();
    this.colorControls.dispose();
    this.wipeControl.dispose();
    this.volumeControl.dispose();
    this.exportControl.dispose();
  }
}
