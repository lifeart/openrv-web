import { Session } from './core/session/Session';
import { Viewer } from './ui/components/Viewer';
import { Timeline } from './ui/components/Timeline';
import { Toolbar } from './ui/components/Toolbar';
import { PaintEngine } from './paint/PaintEngine';
import { PaintToolbar } from './ui/components/PaintToolbar';

export class App {
  private container: HTMLElement | null = null;
  private session: Session;
  private viewer: Viewer;
  private timeline: Timeline;
  private toolbar: Toolbar;
  private paintEngine: PaintEngine;
  private paintToolbar: PaintToolbar;
  private animationId: number | null = null;

  constructor() {
    this.session = new Session();
    this.paintEngine = new PaintEngine();
    this.viewer = new Viewer(this.session, this.paintEngine);
    this.timeline = new Timeline(this.session);
    this.toolbar = new Toolbar(this.session);
    this.paintToolbar = new PaintToolbar(this.paintEngine);
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

    toolbarRow.appendChild(toolbarEl);
    toolbarRow.appendChild(paintToolbarEl);

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

    // Handle Ctrl+Z/Y for undo/redo
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        this.paintEngine.undo();
        return;
      } else if (e.key === 'y') {
        e.preventDefault();
        this.paintEngine.redo();
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
  }
}
