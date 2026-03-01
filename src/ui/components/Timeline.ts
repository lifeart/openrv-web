import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { WaveformRenderer } from '../../audio/WaveformRenderer';
import { ThumbnailManager } from './ThumbnailManager';
import { TimelineContextMenu } from './TimelineContextMenu';
import { formatTimecode, formatFrameDisplay, TimecodeDisplayMode, getNextDisplayMode, getDisplayModeLabel } from '../../utils/media/Timecode';
import { getThemeManager } from '../../utils/ui/ThemeManager';
import { DisposableSubscriptionManager } from '../../utils/DisposableSubscriptionManager';
import {
  drawPlayhead,
  drawInOutBrackets,
  drawInOutRange,
  drawPlayedRegion,
  drawMarkLines,
  drawAnnotationTriangles,
} from './timelineRenderHelpers';
import type { NoteOverlay } from './NoteOverlay';
import type { PlaylistManager } from '../../core/session/PlaylistManager';
import type { TransitionManager } from '../../core/session/TransitionManager';

export class Timeline {
  /** Radius of the playhead drag handle circle in pixels */
  static readonly PLAYHEAD_CIRCLE_RADIUS = 9;
  /** Width of the invisible hit area around the playhead in pixels */
  static readonly PLAYHEAD_HIT_AREA_WIDTH = 20;

  /**
   * Resolve a CSS variable at runtime, falling back to the given hex value.
   * Follows the CacheIndicator pattern for theme compatibility.
   */
  private static resolveCssColor(variable: string, fallback: string): string {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
      return value || fallback;
    } catch {
      return fallback;
    }
  }

  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private session: Session;
  private paintEngine: PaintEngine | null = null;
  private waveformRenderer: WaveformRenderer;
  private waveformLoaded = false;
  private thumbnailManager: ThumbnailManager;
  private thumbnailsEnabled = true;
  private static readonly DISPLAY_MODE_STORAGE_KEY = 'openrv.timeline.displayMode';
  private static readonly VALID_DISPLAY_MODES: readonly TimecodeDisplayMode[] = ['frames', 'timecode', 'seconds', 'footage'];

  private _timecodeDisplayMode: TimecodeDisplayMode = 'frames';

  protected isDragging = false;
  protected width = 0;
  protected height = 0;

  private magnifierToggleButton: HTMLButtonElement | null = null;
  private magnifierToggleCallback: (() => void) | null = null;

  // Bound event handlers for proper cleanup
  private boundHandleResize: () => void;
  private subs = new DisposableSubscriptionManager();
  private paintEngineSubscribed = false;
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private initialRenderFrameId: number | null = null;
  private disposed = false;
  private drawScheduled = false;
  private scheduledRafId = 0;
  private noteOverlay: NoteOverlay | null = null;
  private contextMenu: TimelineContextMenu;
  private playlistManager: PlaylistManager | null = null;
  private transitionManager: TransitionManager | null = null;
  private _rangeShiftFlashUntil = 0;
  private cachedColors: {
    background: string;
    track: string;
    played: string;
    playhead: string;
    playheadShadow: string;
    inOutRange: string;
    mark: string;
    annotation: string;
    waveform: string;
    text: string;
    textDim: string;
    border: string;
  } | null = null;

  // Colors are resolved from ThemeManager and cached until theme changes
  private getColors() {
    if (this.cachedColors) return this.cachedColors;
    const theme = getThemeManager().getColors();
    const accentRgb = theme.accentPrimaryRgb;
    this.cachedColors = {
      background: theme.bgSecondary,
      track: theme.bgHover,
      played: `rgba(${accentRgb}, 0.2)`,
      playhead: theme.accentPrimary,
      playheadShadow: `rgba(${accentRgb}, 0.27)`,
      inOutRange: `rgba(${accentRgb}, 0.13)`,
      mark: theme.error,
      annotation: theme.warning,
      waveform: `rgba(${accentRgb}, 0.4)`,
      text: theme.textPrimary,
      textDim: theme.textMuted,
      border: theme.borderPrimary,
    };
    return this.cachedColors;
  }

  constructor(session: Session, paintEngine?: PaintEngine) {
    this.session = session;
    this.paintEngine = paintEngine ?? null;
    this.waveformRenderer = new WaveformRenderer();
    this.thumbnailManager = new ThumbnailManager(session);

    // Set up thumbnail ready callback to trigger redraw
    this.thumbnailManager.setOnThumbnailReady(() => {
      this.scheduleDraw();
    });

    this.boundHandleResize = () => {
      // Debounce resize to avoid recalculating thumbnails too frequently
      if (this.resizeDebounceTimer) {
        clearTimeout(this.resizeDebounceTimer);
      }
      this.resizeDebounceTimer = setTimeout(() => {
        this.resize();
        this.recalculateThumbnails();
        this.scheduleDraw();
      }, 150);
    };

    // (theme change is handled via subs in bindEvents)

    // Restore persisted timecode display mode from localStorage
    try {
      const stored = localStorage.getItem(Timeline.DISPLAY_MODE_STORAGE_KEY);
      if (stored && (Timeline.VALID_DISPLAY_MODES as readonly string[]).includes(stored)) {
        this._timecodeDisplayMode = stored as TimecodeDisplayMode;
      }
    } catch {
      // localStorage may be unavailable (e.g. in tests or restricted contexts)
    }

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
      cursor: pointer;
      touch-action: none;
    `;
    this.container.appendChild(this.canvas);

    // Create magnifying glass toggle button (overlaid on left padding area)
    this.magnifierToggleButton = document.createElement('button');
    this.magnifierToggleButton.type = 'button';
    this.magnifierToggleButton.title = 'Toggle timeline magnifier (F3)';
    this.magnifierToggleButton.setAttribute('aria-label', 'Toggle timeline magnifier');
    this.magnifierToggleButton.dataset.testid = 'timeline-magnifier-toggle';
    this.magnifierToggleButton.innerHTML = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
    this.magnifierToggleButton.style.cssText = `
      position: absolute;
      left: 6px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
      transition: all 0.12s ease;
    `;
    this.magnifierToggleButton.addEventListener('pointerenter', () => {
      if (this.magnifierToggleButton) {
        this.magnifierToggleButton.style.background = 'var(--bg-hover)';
        this.magnifierToggleButton.style.borderColor = 'var(--border-secondary)';
        this.magnifierToggleButton.style.color = 'var(--text-primary)';
      }
    });
    this.magnifierToggleButton.addEventListener('pointerleave', () => {
      if (this.magnifierToggleButton) {
        this.magnifierToggleButton.style.background = 'transparent';
        this.magnifierToggleButton.style.borderColor = 'transparent';
        this.magnifierToggleButton.style.color = 'var(--text-muted)';
      }
    });
    this.magnifierToggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.magnifierToggleCallback?.();
    });
    this.container.style.position = 'relative';
    this.container.appendChild(this.magnifierToggleButton);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    this.contextMenu = new TimelineContextMenu();
    this.bindEvents();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);

    // Listen to session changes
    this.subs.add(this.session.on('frameChanged', () => this.scheduleDraw()));
    this.subs.add(this.session.on('playbackChanged', (isPlaying) => {
      if (isPlaying) {
        this.thumbnailManager.pauseLoading();
      } else {
        this.thumbnailManager.resumeLoading();
      }
      this.scheduleDraw();
    }));
    this.subs.add(this.session.on('durationChanged', () => {
      this.recalculateThumbnails();
      this.scheduleDraw();
    }));
    this.subs.add(this.session.on('sourceLoaded', () => {
      this.loadWaveform().catch((err) => console.warn('Failed to load waveform:', err));
      this.loadThumbnails();
      this.scheduleDraw();
    }));
    this.subs.add(this.session.on('inOutChanged', () => this.scheduleDraw()));
    this.subs.add(this.session.on('loopModeChanged', () => this.scheduleDraw()));
    this.subs.add(this.session.on('marksChanged', () => this.scheduleDraw()));
    this.subs.add(this.session.on('rangeShifted', () => this.flashRangeShift()));

    // Listen to theme changes so canvas redraws with new colors
    this.subs.add(getThemeManager().on('themeChanged', () => {
      this.cachedColors = null;
      this.scheduleDraw();
    }));

    // Listen to paint engine changes (only once)
    this.subscribeToPaintEngine();
  }

  /**
   * Trigger a brief visual flash on the timeline to indicate a range shift.
   * The flash persists for 400ms and is cleared on the next draw cycle.
   */
  private flashRangeShift(): void {
    this._rangeShiftFlashUntil = Date.now() + 400;
    this.scheduleDraw();
    // Schedule a cleanup draw after the flash duration
    setTimeout(() => {
      if (!this.disposed) {
        this.scheduleDraw();
      }
    }, 410);
  }

  private subscribeToPaintEngine(): void {
    if (this.paintEngineSubscribed || !this.paintEngine) return;
    this.subs.add(this.paintEngine.on('annotationsChanged', () => this.scheduleDraw()));
    this.subs.add(this.paintEngine.on('strokeAdded', () => this.scheduleDraw()));
    this.subs.add(this.paintEngine.on('strokeRemoved', () => this.scheduleDraw()));
    this.paintEngineSubscribed = true;
  }

  /**
   * Set paint engine reference (for late binding from App)
   */
  setPaintEngine(paintEngine: PaintEngine): void {
    this.paintEngine = paintEngine;
    this.subscribeToPaintEngine();
    this.scheduleDraw();
  }

  /**
   * Set the callback for the magnifier toggle button.
   */
  setMagnifierToggle(callback: () => void): void {
    this.magnifierToggleCallback = callback;
  }

  /**
   * Get the WaveformRenderer instance (for sharing with magnifier).
   */
  getWaveformRenderer(): WaveformRenderer {
    return this.waveformRenderer;
  }

  /**
   * Set note overlay for rendering note bars on timeline.
   */
  setNoteOverlay(overlay: NoteOverlay): void {
    this.noteOverlay = overlay;
    overlay.setRedrawCallback(() => this.scheduleDraw());
  }

  /**
   * Set playlist and transition managers for rendering transition overlays on the timeline.
   */
  setPlaylistManagers(playlistManager: PlaylistManager, transitionManager: TransitionManager): void {
    this.playlistManager = playlistManager;
    this.transitionManager = transitionManager;
    this.subs.add(transitionManager.on('transitionChanged', () => this.scheduleDraw()));
    this.subs.add(transitionManager.on('transitionsReset', () => this.scheduleDraw()));
    this.subs.add(playlistManager.on('clipsChanged', () => this.scheduleDraw()));
    this.subs.add(playlistManager.on('enabledChanged', () => this.scheduleDraw()));
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

    // Try to use the original File object directly (avoids redundant blob URL fetch)
    const file = source.videoSourceNode?.getFile();
    let success: boolean;
    if (file) {
      success = await this.waveformRenderer.loadFromBlob(file);
    } else {
      success = await this.waveformRenderer.loadFromVideo(element);
    }

    this.waveformLoaded = success;
    if (success) {
      this.scheduleDraw();
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
    const trackY = 0;
    const trackHeight = 42;
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
    this.scheduleDraw();
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
      // Persist choice to localStorage so it survives page reloads
      try {
        localStorage.setItem(Timeline.DISPLAY_MODE_STORAGE_KEY, mode);
      } catch {
        // localStorage may be unavailable
      }
      this.scheduleDraw();
    }
  }

  /**
   * Cycle through all available display modes (frames -> timecode -> seconds -> footage -> frames ...)
   */
  toggleTimecodeDisplay(): void {
    this.timecodeDisplayMode = getNextDisplayMode(this._timecodeDisplayMode);
  }

  /**
   * Double-click to navigate to nearest annotated frame
   */
  private onDoubleClick = (e: MouseEvent): void => {
    if (!this.paintEngine) return;

    const clickedFrame = this.frameAtClientX(e.clientX);

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

  private onPointerDown = (e: PointerEvent): void => {
    // Only left-clicks trigger seeking; right-clicks are handled by contextmenu
    if (e.button !== 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const x = e.clientX - rect.left;

    // Check if click is on the frame counter area (bottom info region)
    const bottomInfoY = this.height - 20;
    if (y > bottomInfoY - 10 && y < bottomInfoY + 10 && x > this.width * 0.25 && x < this.width * 0.75) {
      this.toggleTimecodeDisplay();
      return;
    }

    this.isDragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.seekToPosition(e.clientX);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    this.seekToPosition(e.clientX);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.isDragging) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.isDragging = false;
  };

  private seekToPosition(clientX: number): void {
    const frame = this.frameAtClientX(clientX);
    this.session.goToFrame(frame);
  }

  /**
   * Convert a clientX coordinate to a 1-based frame number.
   */
  private frameAtClientX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const padding = 60;
    const trackWidth = rect.width - padding * 2;
    const x = clientX - rect.left - padding;
    const progress = Math.max(0, Math.min(1, x / trackWidth));
    const source = this.session.currentSource;
    const duration = source?.duration ?? 1;
    return Math.round(1 + progress * (duration - 1));
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();

    // No menu when no source is loaded
    const source = this.session.currentSource;
    if (!source) return;

    // Cancel any in-progress drag
    if (this.isDragging) {
      this.isDragging = false;
    }

    const frame = this.frameAtClientX(e.clientX);
    const fps = this.session.fps;
    const frameLabel = formatFrameDisplay(frame, fps, this._timecodeDisplayMode);
    const timecode = formatTimecode(frame, fps);

    const markerAtFrame = this.session.getMarkerAtFrame(frame);
    const inPoint = this.session.inPoint;
    const outPoint = this.session.outPoint;
    const duration = source.duration ?? 1;
    const hasCustomInOut = inPoint !== 1 || outPoint !== duration;

    this.contextMenu.show({
      x: e.clientX,
      y: e.clientY,
      frame,
      frameLabel,
      timecode,
      sourceName: source.name ?? null,
      sourceResolution: source.width && source.height ? `${source.width}x${source.height}` : null,
      sourceType: source.type ?? null,
      markerAtFrame: markerAtFrame ? { frame: markerAtFrame.frame } : null,
      hasCustomInOut,
      inPoint,
      outPoint,
      onGoToFrame: (f) => this.session.goToFrame(f),
      onSetInPoint: (f) => this.session.setInPoint(f),
      onSetOutPoint: (f) => this.session.setOutPoint(f),
      onResetInOutPoints: () => this.session.resetInOutPoints(),
      onToggleMark: (f) => this.session.toggleMark(f),
      onRemoveMark: (f) => this.session.removeMark(f),
      onCopyTimecode: (tc) => {
        navigator.clipboard.writeText(tc).catch(() => {
          // clipboard may not be available
        });
      },
    });
  };

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

  protected scheduleDraw(): void {
    if (this.disposed || this.drawScheduled) return;
    this.drawScheduled = true;
    this.scheduledRafId = requestAnimationFrame(() => {
      this.drawScheduled = false;
      this.scheduledRafId = 0;
      if (!this.disposed) {
        this.draw();
      }
    });
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
    const trackY = 0;
    const trackHeight = 42;
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

    // Check if range shift flash is active
    const isFlashing = Date.now() < this._rangeShiftFlashUntil;
    const accentRgb = getThemeManager().getColors().accentPrimaryRgb;

    if (duration > 1) {
      if (hasCustomRange) {
        const inX = frameToX(inPoint);
        const outX = frameToX(outPoint);

        // Draw in/out range highlight (brighter during flash)
        if (isFlashing) {
          ctx.fillStyle = `rgba(${accentRgb}, 0.3)`;
          ctx.fillRect(inX, trackY, outX - inX, trackHeight);
        } else {
          drawInOutRange(ctx, inX, outX, trackY, trackHeight, colors.inOutRange);
        }

        // Draw played portion within range (from in point to current frame)
        if (currentFrame >= inPoint && currentFrame <= outPoint) {
          drawPlayedRegion(ctx, inX, frameToX(currentFrame), trackY, trackHeight, colors.played);
        }

        // Draw in/out bracket markers (with glow during flash)
        if (isFlashing) {
          ctx.fillStyle = colors.playhead;
          ctx.globalAlpha = 1.0;
          ctx.shadowColor = colors.playhead;
          ctx.shadowBlur = 6;
          ctx.fillRect(inX - 2, trackY - 4, 4, trackHeight + 8);
          ctx.fillRect(inX - 2, trackY - 4, 8, 3);
          ctx.fillRect(inX - 2, trackY + trackHeight + 1, 8, 3);
          ctx.fillRect(outX - 2, trackY - 4, 4, trackHeight + 8);
          ctx.fillRect(outX - 6, trackY - 4, 8, 3);
          ctx.fillRect(outX - 6, trackY + trackHeight + 1, 8, 3);
          ctx.shadowBlur = 0;
        } else {
          drawInOutBrackets(ctx, inX, outX, trackY, trackHeight, colors.playhead);
        }
      } else {
        // No custom range - draw played portion from start to current frame
        drawPlayedRegion(ctx, padding, frameToX(currentFrame), trackY, trackHeight, colors.played);
      }
    }

    // Draw annotation markers (small triangles below track)
    if (this.paintEngine) {
      const annotatedFrames = this.paintEngine.getAnnotatedFrames();
      drawAnnotationTriangles(ctx, annotatedFrames, frameToX, trackY, trackHeight, colors.annotation, duration);
    }

    // Draw marks (within full duration) - with custom colors from Marker data
    drawMarkLines(ctx, this.session.marks.values(), frameToX, trackY, trackHeight, colors.mark, duration);

    // Draw note overlay bars (between marks and playhead)
    if (this.noteOverlay) {
      this.noteOverlay.update(
        ctx, trackWidth, duration, padding,
        this.session.currentSourceIndex, trackY, trackHeight,
      );
    }

    // Draw transition overlays (if playlist mode is active)
    if (this.playlistManager?.isEnabled() && this.transitionManager) {
      const clips = this.playlistManager.getClips();
      const transitions = this.transitionManager.getTransitions();
      const adjustedClips = this.transitionManager.calculateOverlapAdjustedFrames(clips);
      const totalDuration = this.playlistManager.getTotalDuration();

      if (totalDuration > 1) {
        const transFrameToX = (frame: number) =>
          padding + ((frame - 1) / Math.max(1, totalDuration - 1)) * trackWidth;

        for (let i = 0; i < transitions.length; i++) {
          const transition = transitions[i];
          if (!transition || transition.type === 'cut') continue;

          const incomingClip = adjustedClips[i + 1];
          if (!incomingClip) continue;

          const transStart = incomingClip.globalStartFrame;
          const transEnd = transStart + transition.durationFrames - 1;
          const x1 = transFrameToX(transStart);
          const x2 = transFrameToX(transEnd);

          // Semi-transparent orange overlay
          ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
          ctx.fillRect(x1, trackY, x2 - x1, trackHeight);

          // Small label
          const labelWidth = x2 - x1;
          if (labelWidth > 30) {
            const abbrev = transition.type === 'crossfade' ? 'CF' :
              transition.type === 'dissolve' ? 'DS' :
              transition.type === 'wipe-left' ? 'WL' :
              transition.type === 'wipe-right' ? 'WR' :
              transition.type === 'wipe-up' ? 'WU' :
              'WD';
            ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
              `${abbrev} ${transition.durationFrames}f`,
              (x1 + x2) / 2,
              trackY + trackHeight / 2,
            );
          }
        }
      }
    }

    // Draw playhead
    const playheadX = duration > 1 ? frameToX(currentFrame) : padding + trackWidth / 2;
    drawPlayhead(ctx, playheadX, trackY, trackHeight, colors.playhead, colors.playheadShadow, Timeline.PLAYHEAD_CIRCLE_RADIUS);

    // Frame numbers / timecode
    const fps = this.session.fps;
    const currentMode = this._timecodeDisplayMode;
    const isTimecode = currentMode === 'timecode';
    const trackCenterY = trackY + trackHeight / 2;
    const bottomInfoY = height - 20;
    const safeMetric = (value: number | undefined, fallback: number): number => (
      typeof value === 'number' && Number.isFinite(value) ? value : fallback
    );
    const drawMiddleAlignedText = (text: string, x: number, yCenter: number): TextMetrics => {
      const metrics = ctx.measureText(text);
      const ascent = safeMetric(metrics.actualBoundingBoxAscent, 8);
      const descent = safeMetric(metrics.actualBoundingBoxDescent, 3);
      const baselineY = yCenter + (ascent - descent) / 2;
      if (!Number.isFinite(baselineY)) {
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, yCenter);
        return metrics;
      }
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, x, baselineY);
      return metrics;
    };
    ctx.font = '12px -apple-system, BlinkMacSystemFont, monospace';

    // Left frame number (always 1)
    ctx.fillStyle = colors.textDim;
    ctx.textAlign = 'right';
    const leftLabel = isTimecode ? formatTimecode(1, fps) : '1';
    drawMiddleAlignedText(leftLabel, padding - 10, trackCenterY);

    // Right frame number (full duration)
    ctx.textAlign = 'left';
    const rightLabel = isTimecode ? formatTimecode(duration, fps) : String(duration);
    drawMiddleAlignedText(rightLabel, width - padding + 10, trackCenterY);

    // Current frame and in/out info (bottom center)
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, monospace';
    const frameLabel = formatFrameDisplay(currentFrame, fps, this._timecodeDisplayMode);
    const inOutInfo = inPoint !== 1 || outPoint !== duration
      ? isTimecode
        ? ` [${formatTimecode(inPoint, fps)}-${formatTimecode(outPoint, fps)}]`
        : ` [${inPoint}-${outPoint}]`
      : '';
    const frameAndRangeLabel = `${frameLabel}${inOutInfo}`;
    const frameLabelMetrics = drawMiddleAlignedText(frameAndRangeLabel, width / 2, bottomInfoY);
    const frameLabelWidth = frameLabelMetrics.width;

    // Draw timecode mode indicator (small label showing current mode)
    const modeLabel = getDisplayModeLabel(currentMode);
    ctx.font = '9px -apple-system, BlinkMacSystemFont, monospace';
    ctx.fillStyle = colors.textDim;
    ctx.textAlign = 'left';
    drawMiddleAlignedText(modeLabel, width / 2 + frameLabelWidth / 2 + 6, bottomInfoY);

    // Info text (bottom line)
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = colors.textDim;
    const infoRowY = bottomInfoY;

    // Source info
    if (source) {
      ctx.textAlign = 'left';
      const typeLabel = source.type === 'video' ? '[VID]' : '[IMG]';
      drawMiddleAlignedText(`${typeLabel} ${source.name} (${source.width}×${source.height})`, padding, infoRowY);
    }

    // Playback info - draw with split coloring so only FPS portion gets colored
    ctx.textAlign = 'right';
    const status = this.session.isPlaying ? '▶ Playing' : '❚❚ Paused';
    const effectiveFps = this.session.effectiveFps;
    const playbackSpeed = this.session.playbackSpeed;
    const targetFps = this.session.fps;
    const effectiveTargetFps = targetFps * playbackSpeed;

    let fpsDisplay: string;
    let fpsColor: string | null = null;
    if (this.session.isPlaying && effectiveFps > 0) {
      if (playbackSpeed !== 1) {
        const speedStr = `${playbackSpeed}x`;
        fpsDisplay = `${effectiveFps.toFixed(1)}/${Math.round(effectiveTargetFps)} eff. fps (${speedStr})`;
      } else {
        fpsDisplay = `${effectiveFps.toFixed(1)}/${targetFps} fps`;
      }

      // Color-code actual FPS portion based on ratio (CSS variables with hex fallbacks)
      const ratio = effectiveTargetFps > 0
        ? Math.min(1, effectiveFps / effectiveTargetFps)
        : 0;
      const WARNING_THRESHOLD = 0.97;
      const CRITICAL_THRESHOLD = 0.85;
      if (ratio >= WARNING_THRESHOLD) {
        fpsColor = Timeline.resolveCssColor('--success', '#4ade80'); // green
      } else if (ratio >= CRITICAL_THRESHOLD) {
        fpsColor = Timeline.resolveCssColor('--warning', '#facc15'); // yellow
      } else {
        fpsColor = Timeline.resolveCssColor('--error', '#ef4444'); // red
      }

      // Append dropped frame count when > 0
      const droppedFrames = this.session.droppedFrameCount;
      if (droppedFrames > 0) {
        fpsDisplay += ` (${droppedFrames} skipped)`;
      }
    } else {
      fpsDisplay = `${targetFps} fps`;
    }
    // Playback mode indicator
    const playbackMode = this.session.playbackMode;
    const playbackModeLabel = playbackMode === 'playAllFrames' ? 'ALL' : 'RT';
    // Check if native video path is active (play-all-frames not fully effective)
    const isNativeVideo = this.session.currentSource?.type === 'video'
      && !this.session.isUsingMediabunny()
      && this.session.currentSource?.videoSourceNode === undefined;
    const isDimmed = playbackMode === 'playAllFrames' && isNativeVideo;

    // Draw status line with split coloring: only FPS portion gets the color
    const suffixStr = ` | ${this.session.loopMode} | `;
    const fpsStr = fpsDisplay;
    const prefixStr = `${status} | `;

    // Measure each part to position them right-to-left (right-aligned)
    const suffixWidth = ctx.measureText(suffixStr).width;
    const fpsWidth = ctx.measureText(fpsStr).width;
    const prefixWidth = ctx.measureText(prefixStr).width;
    const modeWidth = ctx.measureText(playbackModeLabel).width;
    const totalWidth = prefixWidth + fpsWidth + suffixWidth + modeWidth;

    // Draw from right to left: mode indicator, suffix, FPS, prefix
    const rightEdge = width - padding;

    // Mode indicator (rightmost, left-aligned at its position)
    const savedAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    const modeX = rightEdge - totalWidth;
    if (isDimmed) {
      ctx.fillStyle = 'rgba(128, 128, 128, 0.5)'; // dimmed gray
    } else if (playbackMode === 'playAllFrames') {
      ctx.fillStyle = '#f59e0b'; // amber/orange for ALL
    } else {
      ctx.fillStyle = colors.textDim; // standard color for RT
    }
    drawMiddleAlignedText(playbackModeLabel, modeX, infoRowY);

    // Suffix in dim color (loop mode + separator)
    ctx.fillStyle = colors.textDim;
    drawMiddleAlignedText(suffixStr, modeX + modeWidth, infoRowY);

    // FPS portion in its computed color (or dim if no color)
    if (fpsColor) {
      ctx.fillStyle = fpsColor;
    } else {
      ctx.fillStyle = colors.textDim;
    }
    drawMiddleAlignedText(fpsStr, modeX + modeWidth + suffixWidth, infoRowY);

    // Status prefix in dim color
    ctx.fillStyle = colors.textDim;
    drawMiddleAlignedText(prefixStr, modeX + modeWidth + suffixWidth + fpsWidth, infoRowY);

    ctx.textAlign = savedAlign;

    // Reset fill style to dim text
    ctx.fillStyle = colors.textDim;
  }

  refresh(): void {
    this.scheduleDraw();
  }

  dispose(): void {
    this.disposed = true;
    // Cancel pending animation frame to prevent callback after teardown
    if (this.initialRenderFrameId !== null) {
      cancelAnimationFrame(this.initialRenderFrameId);
      this.initialRenderFrameId = null;
    }
    if (this.scheduledRafId !== 0) {
      cancelAnimationFrame(this.scheduledRafId);
      this.scheduledRafId = 0;
    }
    this.drawScheduled = false;
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.boundHandleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.contextMenu.dispose();
    this.thumbnailManager.dispose();
    this.subs.dispose();
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }
  }
}
