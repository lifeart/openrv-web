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
    this.session.on('loopModeChanged', () => this.draw());
    this.session.on('marksChanged', () => this.draw());
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

    // Seek within full source duration, not just in/out range
    const source = this.session.currentSource;
    const duration = source?.duration ?? 1;
    const frame = Math.round(1 + progress * (duration - 1));
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

    // Get source info for full duration
    const source = this.session.currentSource;
    const duration = source?.duration ?? 1;
    const inPoint = this.session.inPoint;
    const outPoint = this.session.outPoint;
    const currentFrame = this.session.currentFrame;

    // Draw track background (full duration)
    ctx.fillStyle = this.colors.track;
    ctx.beginPath();
    ctx.roundRect(padding, trackY, trackWidth, trackHeight, 4);
    ctx.fill();

    // Calculate positions based on full duration
    const frameToX = (frame: number) => padding + ((frame - 1) / Math.max(1, duration - 1)) * trackWidth;

    // Check if custom in/out range is set
    const hasCustomRange = inPoint !== 1 || outPoint !== duration;

    if (duration > 1) {
      if (hasCustomRange) {
        const inX = frameToX(inPoint);
        const outX = frameToX(outPoint);
        const rangeWidth = outX - inX;

        // Draw in/out range highlight
        ctx.fillStyle = this.colors.inOutRange;
        ctx.fillRect(inX, trackY, rangeWidth, trackHeight);

        // Draw played portion within range (from in point to current frame)
        if (currentFrame >= inPoint && currentFrame <= outPoint) {
          const playedWidth = frameToX(currentFrame) - inX;
          if (playedWidth > 0) {
            ctx.fillStyle = this.colors.played;
            ctx.fillRect(inX, trackY, playedWidth, trackHeight);
          }
        }

        // Draw in point marker (left bracket)
        ctx.fillStyle = '#4a9eff';
        ctx.fillRect(inX - 2, trackY - 4, 4, trackHeight + 8);
        ctx.fillRect(inX - 2, trackY - 4, 8, 3);
        ctx.fillRect(inX - 2, trackY + trackHeight + 1, 8, 3);

        // Draw out point marker (right bracket)
        ctx.fillRect(outX - 2, trackY - 4, 4, trackHeight + 8);
        ctx.fillRect(outX - 6, trackY - 4, 8, 3);
        ctx.fillRect(outX - 6, trackY + trackHeight + 1, 8, 3);
      } else {
        // No custom range - draw played portion from start to current frame
        const playedWidth = frameToX(currentFrame) - padding;
        if (playedWidth > 0) {
          ctx.fillStyle = this.colors.played;
          ctx.fillRect(padding, trackY, playedWidth, trackHeight);
        }
      }
    }

    // Draw marks (within full duration)
    ctx.fillStyle = this.colors.mark;
    for (const mark of this.session.marks) {
      if (mark >= 1 && mark <= duration) {
        const markX = frameToX(mark);
        ctx.fillRect(markX - 1, trackY, 2, trackHeight);
      }
    }

    // Draw playhead
    const playheadX = duration > 1 ? frameToX(currentFrame) : padding + trackWidth / 2;

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

    // Left frame number (always 1)
    ctx.fillStyle = this.colors.textDim;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', padding - 10, trackY + trackHeight / 2);

    // Right frame number (full duration)
    ctx.textAlign = 'left';
    ctx.fillText(String(duration), width - padding + 10, trackY + trackHeight / 2);

    // Current frame and in/out info (top center)
    ctx.fillStyle = this.colors.text;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, monospace';
    const inOutInfo = inPoint !== 1 || outPoint !== duration ? ` [${inPoint}-${outPoint}]` : '';
    ctx.fillText(`Frame ${currentFrame}${inOutInfo}`, width / 2, 18);

    // Info text (bottom)
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = this.colors.textDim;

    // Source info
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
