import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { WaveformRenderer } from '../../audio/WaveformRenderer';
import { ThumbnailManager } from './ThumbnailManager';
import { formatTimecode, formatFrameDisplay, TimecodeDisplayMode } from '../../utils/media/Timecode';

export class Timeline {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private session: Session;
  private paintEngine: PaintEngine | null = null;
  private waveformRenderer: WaveformRenderer;
  private waveformLoaded = false;
  private thumbnailManager: ThumbnailManager;
  private thumbnailsEnabled = true;
  private _timecodeDisplayMode: TimecodeDisplayMode = 'frames';

  protected isDragging = false;
  protected width = 0;
  protected height = 0;

  // Bound event handlers for proper cleanup
  private boundHandleResize: () => void;
  private paintEngineSubscribed = false;
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private initialRenderFrameId: number | null = null;
  private disposed = false;

  // Colors are resolved at render time from CSS variables
  private getColors() {
    const style = getComputedStyle(document.documentElement);
    const accentRgb = style.getPropertyValue('--accent-primary-rgb').trim() || '74, 158, 255';
    return {
      background: style.getPropertyValue('--bg-secondary').trim() || '#252525',
      track: style.getPropertyValue('--bg-hover').trim() || '#333',
      played: `rgba(${accentRgb}, 0.2)`,
      playhead: style.getPropertyValue('--accent-primary').trim() || '#4a9eff',
      playheadShadow: `rgba(${accentRgb}, 0.27)`,
      inOutRange: `rgba(${accentRgb}, 0.13)`,
      mark: style.getPropertyValue('--error').trim() || '#ff6b6b',
      annotation: style.getPropertyValue('--warning').trim() || '#ffcc00',
      waveform: `rgba(${accentRgb}, 0.4)`,
      text: style.getPropertyValue('--text-primary').trim() || '#ccc',
      textDim: style.getPropertyValue('--text-muted').trim() || '#666',
      border: style.getPropertyValue('--border-primary').trim() || '#444',
    };
  }

  constructor(session: Session, paintEngine?: PaintEngine) {
    this.session = session;
    this.paintEngine = paintEngine ?? null;
    this.waveformRenderer = new WaveformRenderer();
    this.thumbnailManager = new ThumbnailManager(session);

    // Set up thumbnail ready callback to trigger redraw
    this.thumbnailManager.setOnThumbnailReady(() => {
      this.draw();
    });

    this.boundHandleResize = () => {
      // Debounce resize to avoid recalculating thumbnails too frequently
      if (this.resizeDebounceTimer) {
        clearTimeout(this.resizeDebounceTimer);
      }
      this.resizeDebounceTimer = setTimeout(() => {
        this.resize();
        this.recalculateThumbnails();
        this.draw();
      }, 150);
    };

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'timeline-container';
    this.container.style.cssText = `
      height: 80px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-primary);
      user-select: none;
      flex-shrink: 0;
    `;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.dataset.testid = 'timeline-canvas';
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
    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);

    // Listen to session changes
    this.session.on('frameChanged', () => this.draw());
    this.session.on('playbackChanged', (isPlaying) => {
      if (isPlaying) {
        this.thumbnailManager.pauseLoading();
      } else {
        this.thumbnailManager.resumeLoading();
      }
      this.draw();
    });
    this.session.on('durationChanged', () => {
      this.recalculateThumbnails();
      this.draw();
    });
    this.session.on('sourceLoaded', () => {
      this.loadWaveform().catch((err) => console.warn('Failed to load waveform:', err));
      this.loadThumbnails();
      this.draw();
    });
    this.session.on('inOutChanged', () => this.draw());
    this.session.on('loopModeChanged', () => this.draw());
    this.session.on('marksChanged', () => this.draw());

    // Listen to paint engine changes (only once)
    this.subscribeToPaintEngine();
  }

  private subscribeToPaintEngine(): void {
    if (this.paintEngineSubscribed || !this.paintEngine) return;
    this.paintEngine.on('annotationsChanged', () => this.draw());
    this.paintEngine.on('strokeAdded', () => this.draw());
    this.paintEngine.on('strokeRemoved', () => this.draw());
    this.paintEngineSubscribed = true;
  }

  /**
   * Set paint engine reference (for late binding from App)
   */
  setPaintEngine(paintEngine: PaintEngine): void {
    this.paintEngine = paintEngine;
    this.subscribeToPaintEngine();
    this.draw();
  }

  /**
   * Load waveform from current video source
   */
  private async loadWaveform(): Promise<void> {
    this.waveformLoaded = false;
    this.waveformRenderer.clear();

    const source = this.session.currentSource;
    if (!source || source.type !== 'video') {
      return;
    }

    const element = source.element;
    if (!(element instanceof HTMLVideoElement)) {
      return;
    }

    const success = await this.waveformRenderer.loadFromVideo(element);
    this.waveformLoaded = success;
    if (success) {
      this.draw();
    }
  }

  /**
   * Load thumbnails for the timeline
   */
  private loadThumbnails(): void {
    if (!this.thumbnailsEnabled) return;

    const source = this.session.currentSource;
    if (!source) {
      this.thumbnailManager.clear();
      return;
    }

    this.recalculateThumbnails();
  }

  /**
   * Recalculate thumbnail slots based on current dimensions
   */
  private recalculateThumbnails(): void {
    if (!this.thumbnailsEnabled) return;

    const source = this.session.currentSource;
    if (!source || this.width === 0) return;

    const padding = 60;
    const trackY = 35;
    const trackHeight = 24;
    const trackWidth = this.width - padding * 2;
    const duration = source.duration ?? 1;

    this.thumbnailManager.calculateSlots(
      padding,
      trackY,
      trackWidth,
      trackHeight,
      duration,
      source.width,
      source.height
    );

    // Start loading thumbnails asynchronously
    this.thumbnailManager.loadThumbnails().catch((err) => {
      console.warn('Failed to load thumbnails:', err);
    });
  }

  /**
   * Enable or disable thumbnail display
   */
  setThumbnailsEnabled(enabled: boolean): void {
    this.thumbnailsEnabled = enabled;
    if (enabled) {
      this.loadThumbnails();
    } else {
      this.thumbnailManager.clear();
    }
    this.draw();
  }

  /**
   * Get the current timecode display mode
   */
  get timecodeDisplayMode(): TimecodeDisplayMode {
    return this._timecodeDisplayMode;
  }

  /**
   * Set the timecode display mode
   */
  set timecodeDisplayMode(mode: TimecodeDisplayMode) {
    if (this._timecodeDisplayMode !== mode) {
      this._timecodeDisplayMode = mode;
      this.draw();
    }
  }

  /**
   * Toggle between frames and timecode display modes
   */
  toggleTimecodeDisplay(): void {
    this.timecodeDisplayMode = this._timecodeDisplayMode === 'frames' ? 'timecode' : 'frames';
  }

  /**
   * Double-click to navigate to nearest annotated frame
   */
  private onDoubleClick = (e: MouseEvent): void => {
    if (!this.paintEngine) return;

    const rect = this.canvas.getBoundingClientRect();
    const padding = 60;
    const trackWidth = rect.width - padding * 2;
    const x = e.clientX - rect.left - padding;
    const progress = Math.max(0, Math.min(1, x / trackWidth));

    const source = this.session.currentSource;
    const duration = source?.duration ?? 1;
    const clickedFrame = Math.round(1 + progress * (duration - 1));

    // Find nearest annotated frame
    const annotatedFrames = this.paintEngine.getAnnotatedFrames();
    if (annotatedFrames.size === 0) return;

    let nearestFrame = clickedFrame;
    let minDistance = Infinity;

    for (const frame of annotatedFrames) {
      const distance = Math.abs(frame - clickedFrame);
      if (distance < minDistance) {
        minDistance = distance;
        nearestFrame = frame;
      }
    }

    this.session.goToFrame(nearestFrame);
  }

  private onMouseDown = (e: MouseEvent): void => {
    // Check if click is on the frame counter area (top region above the track)
    const rect = this.canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const x = e.clientX - rect.left;
    const trackY = 35;

    if (y < trackY && x > this.width * 0.25 && x < this.width * 0.75) {
      // Click on frame counter area - toggle timecode display
      this.toggleTimecodeDisplay();
      return;
    }

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
    // Initial resize (store ID for cleanup)
    this.initialRenderFrameId = requestAnimationFrame(() => {
      this.initialRenderFrameId = null;
      // Guard against disposed state (test teardown)
      if (this.disposed) return;
      this.resize();
      this.draw();
    });

    window.addEventListener('resize', this.boundHandleResize);

    return this.container;
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    // Reset transform before applying new scale to prevent accumulation
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  protected draw(): void {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    if (width === 0 || height === 0) return;

    // Get current theme colors
    const colors = this.getColors();

    // Clear
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.background;
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
    ctx.fillStyle = colors.track;
    ctx.beginPath();
    ctx.roundRect(padding, trackY, trackWidth, trackHeight, 4);
    ctx.fill();

    // Draw thumbnails behind waveform and markers (if enabled)
    if (this.thumbnailsEnabled) {
      this.thumbnailManager.drawThumbnails(ctx);
    }

    // Draw waveform if available (for video sources)
    if (this.waveformLoaded && this.waveformRenderer.hasData()) {
      const waveformData = this.waveformRenderer.getData();
      if (waveformData) {
        // Render waveform across the track
        const audioDuration = waveformData.duration;
        this.waveformRenderer.render(
          ctx,
          padding + 2,           // x: slight inset
          trackY + 2,            // y: slight inset
          trackWidth - 4,        // width: with margin
          trackHeight - 4,       // height: with margin
          0,                     // startTime
          audioDuration,         // endTime
          colors.waveform
        );
      }
    }

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
        ctx.fillStyle = colors.inOutRange;
        ctx.fillRect(inX, trackY, rangeWidth, trackHeight);

        // Draw played portion within range (from in point to current frame)
        if (currentFrame >= inPoint && currentFrame <= outPoint) {
          const playedWidth = frameToX(currentFrame) - inX;
          if (playedWidth > 0) {
            ctx.fillStyle = colors.played;
            ctx.fillRect(inX, trackY, playedWidth, trackHeight);
          }
        }

        // Draw in point marker (left bracket)
        ctx.fillStyle = colors.playhead;
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
          ctx.fillStyle = colors.played;
          ctx.fillRect(padding, trackY, playedWidth, trackHeight);
        }
      }
    }

    // Draw annotation markers (small triangles below track)
    if (this.paintEngine) {
      const annotatedFrames = this.paintEngine.getAnnotatedFrames();
      ctx.fillStyle = colors.annotation;
      for (const frame of annotatedFrames) {
        if (frame >= 1 && frame <= duration) {
          const annotX = frameToX(frame);
          // Draw small triangle pointing up below track
          ctx.beginPath();
          ctx.moveTo(annotX, trackY + trackHeight + 8);
          ctx.lineTo(annotX - 4, trackY + trackHeight + 14);
          ctx.lineTo(annotX + 4, trackY + trackHeight + 14);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw marks (within full duration) - with custom colors from Marker data
    for (const marker of this.session.marks.values()) {
      if (marker.frame >= 1 && marker.frame <= duration) {
        const markX = frameToX(marker.frame);
        // Use marker's color if set, otherwise default to mark color
        const markerColor = marker.color || colors.mark;

        if (marker.endFrame !== undefined && marker.endFrame > marker.frame) {
          // Duration marker: draw colored span across the range
          const endX = frameToX(Math.min(marker.endFrame, duration));

          // Draw semi-transparent filled range
          ctx.fillStyle = markerColor;
          ctx.globalAlpha = 0.25;
          ctx.fillRect(markX, trackY, endX - markX, trackHeight);
          ctx.globalAlpha = 1.0;

          // Draw solid start and end lines
          ctx.fillStyle = markerColor;
          ctx.fillRect(markX - 1, trackY, 2, trackHeight);
          ctx.fillRect(endX - 1, trackY, 2, trackHeight);

          // Draw top and bottom borders of the range
          ctx.fillRect(markX, trackY, endX - markX, 1);
          ctx.fillRect(markX, trackY + trackHeight - 1, endX - markX, 1);
        } else {
          // Point marker: draw single vertical line
          ctx.fillStyle = markerColor;
          ctx.fillRect(markX - 1, trackY, 2, trackHeight);
        }

        // If marker has a note, draw a small indicator dot above
        if (marker.note) {
          ctx.fillStyle = markerColor;
          ctx.beginPath();
          ctx.arc(markX, trackY - 8, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw playhead
    const playheadX = duration > 1 ? frameToX(currentFrame) : padding + trackWidth / 2;

    // Playhead glow
    ctx.fillStyle = colors.playheadShadow;
    ctx.beginPath();
    ctx.arc(playheadX, trackY + trackHeight / 2, 12, 0, Math.PI * 2);
    ctx.fill();

    // Playhead line
    ctx.fillStyle = colors.playhead;
    ctx.fillRect(playheadX - 1.5, trackY - 6, 3, trackHeight + 12);

    // Playhead circle
    ctx.beginPath();
    ctx.arc(playheadX, trackY - 6, 5, 0, Math.PI * 2);
    ctx.fill();

    // Frame numbers / timecode
    const fps = this.session.fps;
    const isTimecode = this._timecodeDisplayMode === 'timecode';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, monospace';

    // Left frame number (always 1)
    ctx.fillStyle = colors.textDim;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const leftLabel = isTimecode ? formatTimecode(1, fps) : '1';
    ctx.fillText(leftLabel, padding - 10, trackY + trackHeight / 2);

    // Right frame number (full duration)
    ctx.textAlign = 'left';
    const rightLabel = isTimecode ? formatTimecode(duration, fps) : String(duration);
    ctx.fillText(rightLabel, width - padding + 10, trackY + trackHeight / 2);

    // Current frame and in/out info (top center)
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, monospace';
    const frameLabel = formatFrameDisplay(currentFrame, fps, this._timecodeDisplayMode);
    const inOutInfo = inPoint !== 1 || outPoint !== duration
      ? isTimecode
        ? ` [${formatTimecode(inPoint, fps)}-${formatTimecode(outPoint, fps)}]`
        : ` [${inPoint}-${outPoint}]`
      : '';
    ctx.fillText(`${frameLabel}${inOutInfo}`, width / 2, 18);

    // Draw timecode mode indicator (small label showing current mode)
    const modeLabel = isTimecode ? 'TC' : 'F#';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, monospace';
    ctx.fillStyle = colors.textDim;
    ctx.textAlign = 'left';
    // Position to the right of the frame display text
    const frameLabelWidth = ctx.measureText(`${frameLabel}${inOutInfo}`).width;
    ctx.fillText(modeLabel, width / 2 + frameLabelWidth / 2 + 6, 18);

    // Info text (bottom)
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = colors.textDim;

    // Source info
    if (source) {
      ctx.textAlign = 'left';
      const typeLabel = source.type === 'video' ? '[VID]' : '[IMG]';
      ctx.fillText(`${typeLabel} ${source.name} (${source.width}×${source.height})`, padding, height - 12);
    }

    // Playback info
    ctx.textAlign = 'right';
    const status = this.session.isPlaying ? '▶ Playing' : '❚❚ Paused';
    const effectiveFps = this.session.effectiveFps;
    const fpsDisplay = this.session.isPlaying && effectiveFps > 0
      ? `${effectiveFps.toFixed(1)}/${this.session.fps} fps`
      : `${this.session.fps} fps`;
    ctx.fillText(`${status} | ${fpsDisplay} | ${this.session.loopMode}`, width - padding, height - 12);
  }

  refresh(): void {
    this.draw();
  }

  dispose(): void {
    this.disposed = true;
    // Cancel pending animation frame to prevent callback after teardown
    if (this.initialRenderFrameId !== null) {
      cancelAnimationFrame(this.initialRenderFrameId);
      this.initialRenderFrameId = null;
    }
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('resize', this.boundHandleResize);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.thumbnailManager.dispose();
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }
  }
}
