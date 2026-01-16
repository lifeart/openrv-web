import { Session } from '../../core/session/Session';

export class Timeline {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private session: Session;

  private isDragging = false;
  private width = 0;
  private height = 0;

  private colors = {
    background: '#252525',
    track: '#333',
    played: '#4a9eff33',
    playhead: '#4a9eff',
    playheadShadow: '#4a9eff44',
    inOutRange: '#4a9eff22',
    mark: '#ff6b6b',
    text: '#ccc',
    textDim: '#666',
    border: '#444',
  };

  constructor(session: Session) {
    this.session = session;

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'timeline-container';
    this.container.style.cssText = `
      height: 80px;
      background: ${this.colors.background};
      border-top: 1px solid ${this.colors.border};
      user-select: none;
      flex-shrink: 0;
    `;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      width: 100%;
      height: 100%;
      display: block;
    `;
    this.container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);

    // Listen to session changes
    this.session.on('frameChanged', () => this.draw());
    this.session.on('playbackChanged', () => this.draw());
    this.session.on('durationChanged', () => this.draw());
    this.session.on('sourceLoaded', () => this.draw());
    this.session.on('inOutChanged', () => this.draw());
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.seekToPosition(e.clientX);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    this.seekToPosition(e.clientX);
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
  };

  private seekToPosition(clientX: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const padding = 60;
    const trackWidth = rect.width - padding * 2;
    const x = clientX - rect.left - padding;
    const progress = Math.max(0, Math.min(1, x / trackWidth));

    const inPoint = this.session.inPoint;
    const outPoint = this.session.outPoint;
    const frame = Math.round(inPoint + progress * (outPoint - inPoint));
    this.session.goToFrame(frame);
  }

  render(): HTMLElement {
    // Initial resize
    requestAnimationFrame(() => {
      this.resize();
      this.draw();
    });

    window.addEventListener('resize', () => {
      this.resize();
      this.draw();
    });

    return this.container;
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  private draw(): void {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    if (width === 0 || height === 0) return;

    // Clear
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    const padding = 60;
    const trackY = 35;
    const trackHeight = 24;
    const trackWidth = width - padding * 2;

    // Draw track background
    ctx.fillStyle = this.colors.track;
    ctx.beginPath();
    ctx.roundRect(padding, trackY, trackWidth, trackHeight, 4);
    ctx.fill();

    const inPoint = this.session.inPoint;
    const outPoint = this.session.outPoint;
    const currentFrame = this.session.currentFrame;
    const totalFrames = outPoint - inPoint;

    if (totalFrames > 0) {
      // Draw in/out range
      ctx.fillStyle = this.colors.inOutRange;
      ctx.beginPath();
      ctx.roundRect(padding, trackY, trackWidth, trackHeight, 4);
      ctx.fill();

      // Draw played portion
      const playedProgress = (currentFrame - inPoint) / totalFrames;
      const playedWidth = Math.max(0, playedProgress * trackWidth);
      ctx.fillStyle = this.colors.played;
      ctx.beginPath();
      ctx.roundRect(padding, trackY, playedWidth, trackHeight, 4);
      ctx.fill();
    }

    // Draw marks
    ctx.fillStyle = this.colors.mark;
    for (const mark of this.session.marks) {
      if (mark >= inPoint && mark <= outPoint) {
        const markProgress = (mark - inPoint) / Math.max(1, totalFrames);
        const markX = padding + markProgress * trackWidth;
        ctx.fillRect(markX - 1, trackY, 2, trackHeight);
      }
    }

    // Draw playhead
    const playheadProgress = totalFrames > 0 ? (currentFrame - inPoint) / totalFrames : 0;
    const playheadX = padding + playheadProgress * trackWidth;

    // Playhead glow
    ctx.fillStyle = this.colors.playheadShadow;
    ctx.beginPath();
    ctx.arc(playheadX, trackY + trackHeight / 2, 12, 0, Math.PI * 2);
    ctx.fill();

    // Playhead line
    ctx.fillStyle = this.colors.playhead;
    ctx.fillRect(playheadX - 1.5, trackY - 6, 3, trackHeight + 12);

    // Playhead circle
    ctx.beginPath();
    ctx.arc(playheadX, trackY - 6, 5, 0, Math.PI * 2);
    ctx.fill();

    // Frame numbers
    ctx.font = '12px -apple-system, BlinkMacSystemFont, monospace';

    // Left frame number
    ctx.fillStyle = this.colors.textDim;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(inPoint), padding - 10, trackY + trackHeight / 2);

    // Right frame number
    ctx.textAlign = 'left';
    ctx.fillText(String(outPoint), width - padding + 10, trackY + trackHeight / 2);

    // Current frame (top center)
    ctx.fillStyle = this.colors.text;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, monospace';
    ctx.fillText(`Frame ${currentFrame}`, width / 2, 18);

    // Info text (bottom)
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = this.colors.textDim;

    // Source info
    const source = this.session.currentSource;
    if (source) {
      ctx.textAlign = 'left';
      const typeIcon = source.type === 'video' ? '🎬' : '🖼';
      ctx.fillText(`${typeIcon} ${source.name} (${source.width}×${source.height})`, padding, height - 12);
    }

    // Playback info
    ctx.textAlign = 'right';
    const status = this.session.isPlaying ? '▶ Playing' : '⏸ Paused';
    const loopIcon = this.session.loopMode === 'loop' ? '🔁' : this.session.loopMode === 'pingpong' ? '🔀' : '➡';
    ctx.fillText(`${status} | ${this.session.fps} fps | ${loopIcon} ${this.session.loopMode}`, width - padding, height - 12);
  }

  refresh(): void {
    this.draw();
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
  }
}
