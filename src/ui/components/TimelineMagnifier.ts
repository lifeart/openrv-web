/**
 * TimelineMagnifier - A zoomed-in sub-view of the timeline providing
 * frame-accurate navigation with audio waveform overlay.
 *
 * Toggled via the F3 key or a magnifying glass icon on the main timeline.
 * Renders a configurable time window centered on the playhead.
 */

import { getThemeManager } from '../../utils/ui/ThemeManager';
import { DisposableSubscriptionManager } from '../../utils/DisposableSubscriptionManager';
import { createIconButton } from './shared/Button';
import { getIconSvg } from './shared/Icons';
import {
  drawPlayhead,
  drawInOutBrackets,
  drawInOutRange,
  drawPlayedRegion,
  drawMarkLines,
  drawAnnotationTriangles,
} from './timelineRenderHelpers';
import type { WaveformRenderer } from '../../audio/WaveformRenderer';
import type { PaintEngine } from '../../paint/PaintEngine';

// ---------------------------------------------------------------------------
// Dependency interfaces (structural typing)
// ---------------------------------------------------------------------------

export interface MagnifierSession {
  readonly currentFrame: number;
  readonly inPoint: number;
  readonly outPoint: number;
  readonly fps: number;
  readonly isPlaying: boolean;
  readonly currentSource: {
    readonly duration?: number;
  } | null;
  readonly marks: ReadonlyMap<
    number,
    {
      frame: number;
      color?: string;
      endFrame?: number;
      note?: string;
    }
  >;
  goToFrame(frame: number): void;
  setInPoint(frame?: number): void;
  setOutPoint(frame?: number): void;
  on(event: string, handler: (...args: unknown[]) => void): () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PADDING = 40;
const MIN_VISIBLE_FRAMES = 10;
const DRAG_THRESHOLD = 5;
const TICK_HEIGHT = 16;
const MAGNIFIER_HEIGHT_DELTA = 160;

// ---------------------------------------------------------------------------
// TimelineMagnifier
// ---------------------------------------------------------------------------

export class TimelineMagnifier {
  private container: HTMLElement;
  private toolbar: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private session: MagnifierSession;
  private waveformRenderer: WaveformRenderer;
  private paintEngine: PaintEngine | null = null;

  // State
  private _centerFrame = 1;
  private _visibleFrames = 60;
  private _followPlayhead = true;
  private _isDragging = false;
  private _isVisible = false;
  private _dragStartX = 0;
  private _dragThresholdMet = false;
  private _dragStartCenterFrame = 0;

  private width = 0;
  private height = 0;
  private disposed = false;
  private drawScheduled = false;
  private scheduledRafId = 0;

  private subs = new DisposableSubscriptionManager();
  private paintEngineSubscribed = false;
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private boundHandleResize: () => void;

  // Toolbar elements
  private zoomSlider!: HTMLInputElement;
  private rangeLabel!: HTMLSpanElement;
  private inNudgeLeftBtn!: HTMLButtonElement;
  private inNudgeRightBtn!: HTMLButtonElement;
  private outNudgeLeftBtn!: HTMLButtonElement;
  private outNudgeRightBtn!: HTMLButtonElement;
  private followBtn!: HTMLButtonElement;
  private closeBtn!: HTMLButtonElement;

  // Color cache
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

  // Callback for visibility change (used by LayoutOrchestrator for bottom panel height)
  private onVisibilityChange: ((visible: boolean) => void) | null = null;

  constructor(session: MagnifierSession, waveformRenderer: WaveformRenderer, paintEngine?: PaintEngine) {
    this.session = session;
    this.waveformRenderer = waveformRenderer;
    this.paintEngine = paintEngine ?? null;

    // Build container (flex column: toolbar + canvas)
    this.container = document.createElement('div');
    this.container.className = 'timeline-magnifier-container';
    this.container.dataset.testid = 'timeline-magnifier';
    this.container.style.cssText = `
      display: none;
      flex-direction: column;
      flex-shrink: 0;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-primary);
      user-select: none;
      overflow: hidden;
      height: ${MAGNIFIER_HEIGHT_DELTA}px;
    `;

    // Build toolbar
    this.toolbar = this.createToolbar();
    this.container.appendChild(this.toolbar);

    // Build canvas
    this.canvas = document.createElement('canvas');
    this.canvas.dataset.testid = 'magnifier-canvas';
    this.canvas.style.cssText = `
      flex: 1;
      width: 100%;
      display: block;
      cursor: pointer;
      touch-action: none;
      min-height: 0;
    `;
    this.container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for magnifier');
    this.ctx = ctx;

    this.boundHandleResize = () => {
      if (this.resizeDebounceTimer) {
        clearTimeout(this.resizeDebounceTimer);
      }
      this.resizeDebounceTimer = setTimeout(() => {
        this.resize();
        this.scheduleDraw();
      }, 150);
    };

    this.bindEvents();
  }

  // ── Getters for state (useful for testing) ──

  get centerFrame(): number {
    return this._centerFrame;
  }
  get visibleFrames(): number {
    return this._visibleFrames;
  }
  get followPlayhead(): boolean {
    return this._followPlayhead;
  }
  get isVisible(): boolean {
    return this._isVisible;
  }

  /** The height delta this component adds to the bottom panel. */
  get heightDelta(): number {
    return MAGNIFIER_HEIGHT_DELTA;
  }

  // ── Colors ──

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

  // ── Toolbar ──

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'magnifier-toolbar';
    toolbar.dataset.testid = 'magnifier-toolbar';
    toolbar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      flex-shrink: 0;
      flex-wrap: wrap;
      border-bottom: 1px solid var(--border-primary);
      font-size: 11px;
      color: var(--text-primary);
    `;

    // Zoom slider
    const zoomLabel = document.createElement('span');
    zoomLabel.textContent = 'Zoom:';
    zoomLabel.style.cssText = 'color: var(--text-muted); font-size: 10px;';
    toolbar.appendChild(zoomLabel);

    this.zoomSlider = document.createElement('input');
    this.zoomSlider.type = 'range';
    this.zoomSlider.min = '0';
    this.zoomSlider.max = '100';
    this.zoomSlider.value = '50';
    this.zoomSlider.dataset.testid = 'magnifier-zoom-slider';
    this.zoomSlider.style.cssText = 'width: 80px; cursor: pointer;';
    toolbar.appendChild(this.zoomSlider);

    // Range label
    this.rangeLabel = document.createElement('span');
    this.rangeLabel.dataset.testid = 'magnifier-range-label';
    this.rangeLabel.style.cssText = 'color: var(--text-muted); font-size: 10px; min-width: 100px;';
    toolbar.appendChild(this.rangeLabel);

    // Spacer
    const spacer = document.createElement('span');
    spacer.style.cssText = 'flex: 1;';
    toolbar.appendChild(spacer);

    // In-point nudge buttons
    const inLabel = document.createElement('span');
    inLabel.textContent = 'In:';
    inLabel.style.cssText = 'color: var(--text-muted); font-size: 10px;';
    toolbar.appendChild(inLabel);

    this.inNudgeLeftBtn = createIconButton(getIconSvg('chevron-left', 'sm'), () => this.nudgeInPoint(-1), {
      size: 'xs',
      title: 'Nudge in point left',
    });
    this.inNudgeLeftBtn.dataset.testid = 'magnifier-in-nudge-left';
    toolbar.appendChild(this.inNudgeLeftBtn);

    this.inNudgeRightBtn = createIconButton(getIconSvg('chevron-right', 'sm'), () => this.nudgeInPoint(1), {
      size: 'xs',
      title: 'Nudge in point right',
    });
    this.inNudgeRightBtn.dataset.testid = 'magnifier-in-nudge-right';
    toolbar.appendChild(this.inNudgeRightBtn);

    // Out-point nudge buttons
    const outLabel = document.createElement('span');
    outLabel.textContent = 'Out:';
    outLabel.style.cssText = 'color: var(--text-muted); font-size: 10px; margin-left: 4px;';
    toolbar.appendChild(outLabel);

    this.outNudgeLeftBtn = createIconButton(getIconSvg('chevron-left', 'sm'), () => this.nudgeOutPoint(-1), {
      size: 'xs',
      title: 'Nudge out point left',
    });
    this.outNudgeLeftBtn.dataset.testid = 'magnifier-out-nudge-left';
    toolbar.appendChild(this.outNudgeLeftBtn);

    this.outNudgeRightBtn = createIconButton(getIconSvg('chevron-right', 'sm'), () => this.nudgeOutPoint(1), {
      size: 'xs',
      title: 'Nudge out point right',
    });
    this.outNudgeRightBtn.dataset.testid = 'magnifier-out-nudge-right';
    toolbar.appendChild(this.outNudgeRightBtn);

    // Follow toggle button
    this.followBtn = createIconButton(getIconSvg('crosshair', 'sm'), () => this.toggleFollow(), {
      size: 'xs',
      title: 'Toggle follow playhead',
    });
    this.followBtn.dataset.testid = 'magnifier-follow-btn';
    this.followBtn.style.marginLeft = '4px';
    toolbar.appendChild(this.followBtn);

    // Close button
    this.closeBtn = createIconButton(getIconSvg('x', 'sm'), () => this.hide(), {
      size: 'xs',
      title: 'Close magnifier',
    });
    this.closeBtn.dataset.testid = 'magnifier-close-btn';
    toolbar.appendChild(this.closeBtn);

    return toolbar;
  }

  // ── Nudge helpers ──

  private nudgeInPoint(delta: number): void {
    const duration = this.getDuration();
    const newIn = this.session.inPoint + delta;
    const clamped = Math.max(1, Math.min(newIn, this.session.outPoint - 1));
    if (clamped !== this.session.inPoint && clamped >= 1 && clamped < duration) {
      this.session.setInPoint(clamped);
    }
  }

  private nudgeOutPoint(delta: number): void {
    const duration = this.getDuration();
    const newOut = this.session.outPoint + delta;
    const clamped = Math.max(this.session.inPoint + 1, Math.min(newOut, duration));
    if (clamped !== this.session.outPoint && clamped <= duration) {
      this.session.setOutPoint(clamped);
    }
  }

  private toggleFollow(): void {
    this._followPlayhead = !this._followPlayhead;
    if (this._followPlayhead) {
      this._centerFrame = this.session.currentFrame;
    }
    this.updateFollowButtonState();
    this.scheduleDraw();
  }

  private updateFollowButtonState(): void {
    if (this._followPlayhead) {
      this.followBtn.style.color = 'var(--accent-primary)';
      this.followBtn.title = 'Following playhead (click to disable)';
    } else {
      this.followBtn.style.color = 'var(--text-muted)';
      this.followBtn.title = 'Not following playhead (click to enable)';
    }
  }

  // ── Zoom slider log-scale mapping ──

  private sliderToVisibleFrames(sliderValue: number): number {
    // Log-scale: slider 0..100 maps linearly to log(minFrames)..log(maxFrames)
    const duration = this.getDuration();
    const maxFrames = Math.max(MIN_VISIBLE_FRAMES, duration);
    const logMin = Math.log(MIN_VISIBLE_FRAMES);
    const logMax = Math.log(maxFrames);
    const t = sliderValue / 100;
    // Invert: slider left = zoomed in (few frames), slider right = zoomed out (many frames)
    return Math.round(Math.exp(logMin + t * (logMax - logMin)));
  }

  private visibleFramesToSlider(visibleFrames: number): number {
    const duration = this.getDuration();
    const maxFrames = Math.max(MIN_VISIBLE_FRAMES, duration);
    const logMin = Math.log(MIN_VISIBLE_FRAMES);
    const logMax = Math.log(maxFrames);
    const logCur = Math.log(Math.max(MIN_VISIBLE_FRAMES, visibleFrames));
    const t = (logCur - logMin) / (logMax - logMin);
    return Math.round(t * 100);
  }

  private updateZoomSlider(): void {
    this.zoomSlider.value = String(this.visibleFramesToSlider(this._visibleFrames));
  }

  private updateRangeLabel(): void {
    const duration = this.getDuration();
    const half = this._visibleFrames / 2;
    const startFrame = Math.max(1, Math.round(this._centerFrame - half));
    const endFrame = Math.min(duration, Math.round(this._centerFrame + half));
    this.rangeLabel.textContent = `Frames ${startFrame}-${endFrame} / ${duration}`;
  }

  private updateNudgeButtons(): void {
    const duration = this.getDuration();
    const inPoint = this.session.inPoint;
    const outPoint = this.session.outPoint;

    this.inNudgeLeftBtn.disabled = inPoint <= 1;
    this.inNudgeRightBtn.disabled = inPoint >= outPoint - 1;
    this.outNudgeLeftBtn.disabled = outPoint <= inPoint + 1;
    this.outNudgeRightBtn.disabled = outPoint >= duration;
  }

  // ── Event binding ──

  private bindEvents(): void {
    // Canvas pointer events
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('dblclick', this.onDoubleClick);

    // Wheel for zoom (non-passive to allow preventDefault)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

    // Zoom slider
    this.zoomSlider.addEventListener('input', this.onZoomSliderInput);

    // Session events
    this.subs.add(
      this.session.on('frameChanged', () => {
        if (this._followPlayhead) {
          this._centerFrame = this.session.currentFrame;
        }
        this.scheduleDraw();
      }),
    );
    this.subs.add(
      this.session.on('inOutChanged', () => {
        this.updateNudgeButtons();
        this.scheduleDraw();
      }),
    );
    this.subs.add(
      this.session.on('durationChanged', () => {
        this.clampState();
        this.updateZoomSlider();
        this.scheduleDraw();
      }),
    );
    this.subs.add(
      this.session.on('sourceLoaded', () => {
        this.resetState();
        this.scheduleDraw();
      }),
    );
    this.subs.add(this.session.on('marksChanged', () => this.scheduleDraw()));
    this.subs.add(this.session.on('playbackChanged', () => this.scheduleDraw()));

    // Theme
    this.subs.add(
      getThemeManager().on('themeChanged', () => {
        this.cachedColors = null;
        this.scheduleDraw();
      }),
    );

    // Paint engine
    this.subscribeToPaintEngine();
  }

  private subscribeToPaintEngine(): void {
    if (this.paintEngineSubscribed || !this.paintEngine) return;
    this.subs.add(this.paintEngine.on('annotationsChanged', () => this.scheduleDraw()));
    this.subs.add(this.paintEngine.on('strokeAdded', () => this.scheduleDraw()));
    this.subs.add(this.paintEngine.on('strokeRemoved', () => this.scheduleDraw()));
    this.paintEngineSubscribed = true;
  }

  /**
   * Set paint engine reference (for late binding).
   */
  setPaintEngine(paintEngine: PaintEngine): void {
    this.paintEngine = paintEngine;
    this.subscribeToPaintEngine();
    this.scheduleDraw();
  }

  // ── Pointer event handlers ──

  private onPointerDown = (e: PointerEvent): void => {
    this._isDragging = true;
    this._dragStartX = e.clientX;
    this._dragThresholdMet = false;
    this._dragStartCenterFrame = this._centerFrame;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this._isDragging) return;
    const dx = e.clientX - this._dragStartX;
    if (!this._dragThresholdMet && Math.abs(dx) > DRAG_THRESHOLD) {
      this._dragThresholdMet = true;
      this._followPlayhead = false;
      this.updateFollowButtonState();
    }
    if (this._dragThresholdMet) {
      // Pan: convert pixel delta to frame delta
      const trackWidth = this.width - PADDING * 2;
      if (trackWidth > 0) {
        const framesPerPixel = this._visibleFrames / trackWidth;
        this._centerFrame = this._dragStartCenterFrame - dx * framesPerPixel;
        this.clampCenterFrame();
        this.scheduleDraw();
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this._isDragging) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    if (!this._dragThresholdMet && this._isDragging) {
      // Click-to-seek
      this.seekToPosition(e.clientX);
    }
    this._isDragging = false;
    this._dragThresholdMet = false;
  };

  private onDoubleClick = (): void => {
    // Re-enable follow on double-click
    this._followPlayhead = true;
    this._centerFrame = this.session.currentFrame;
    this.updateFollowButtonState();
    this.scheduleDraw();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const duration = this.getDuration();
    const maxFrames = Math.max(MIN_VISIBLE_FRAMES, duration);

    // Zoom centered on cursor position
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const trackWidth = this.width - PADDING * 2;
    if (trackWidth <= 0) return;

    const startFrame = this._centerFrame - this._visibleFrames / 2;
    const frameAtMouse = startFrame + ((mouseX - PADDING) / trackWidth) * this._visibleFrames;

    // Adjust visible frames
    const newVisibleFrames = Math.round(Math.max(MIN_VISIBLE_FRAMES, Math.min(maxFrames, this._visibleFrames * delta)));
    if (newVisibleFrames === this._visibleFrames) return;

    // Recalculate center so frame under cursor stays fixed
    const t = (mouseX - PADDING) / trackWidth;
    this._visibleFrames = newVisibleFrames;
    this._centerFrame = frameAtMouse + (0.5 - t) * this._visibleFrames;
    this.clampCenterFrame();

    this.updateZoomSlider();
    this.scheduleDraw();
  };

  private onZoomSliderInput = (): void => {
    this._visibleFrames = this.sliderToVisibleFrames(parseInt(this.zoomSlider.value, 10));
    this.clampState();
    this.scheduleDraw();
  };

  private seekToPosition(clientX: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const trackWidth = this.width - PADDING * 2;
    const x = clientX - rect.left - PADDING;
    const t = Math.max(0, Math.min(1, x / trackWidth));

    const startFrame = this._centerFrame - this._visibleFrames / 2;
    const frame = Math.round(startFrame + t * this._visibleFrames);

    const duration = this.getDuration();
    const clampedFrame = Math.max(1, Math.min(duration, frame));
    this.session.goToFrame(clampedFrame);
  }

  // ── State management ──

  private getDuration(): number {
    return this.session.currentSource?.duration ?? 1;
  }

  private clampCenterFrame(): void {
    const duration = this.getDuration();
    // Allow center to go slightly out of bounds so out-of-range regions are visible,
    // but keep at least some content visible.
    const half = this._visibleFrames / 2;
    this._centerFrame = Math.max(1 - half + 1, Math.min(duration + half - 1, this._centerFrame));
  }

  private clampState(): void {
    const duration = this.getDuration();
    const maxFrames = Math.max(MIN_VISIBLE_FRAMES, duration);
    this._visibleFrames = Math.max(MIN_VISIBLE_FRAMES, Math.min(maxFrames, this._visibleFrames));
    this.clampCenterFrame();
  }

  private resetState(): void {
    const duration = this.getDuration();
    this._centerFrame = Math.ceil(duration / 2);
    this._visibleFrames = Math.min(60, duration);
    this._followPlayhead = true;
    this._centerFrame = this.session.currentFrame;
    this.updateFollowButtonState();
    this.updateZoomSlider();
    this.updateNudgeButtons();
  }

  // ── Visibility ──

  show(): void {
    if (this._isVisible) return;
    this._isVisible = true;
    this.container.style.display = 'flex';
    this.resetState();
    requestAnimationFrame(() => {
      this.resize();
      this.draw();
    });
    window.addEventListener('resize', this.boundHandleResize);
    this.onVisibilityChange?.(true);
  }

  hide(): void {
    if (!this._isVisible) return;
    this._isVisible = false;
    this.container.style.display = 'none';
    window.removeEventListener('resize', this.boundHandleResize);
    this.onVisibilityChange?.(false);
  }

  toggle(): void {
    if (this._isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Set a callback to be invoked when visibility changes.
   * Used by LayoutOrchestrator for bottom panel height management.
   */
  setVisibilityCallback(callback: (visible: boolean) => void): void {
    this.onVisibilityChange = callback;
  }

  // ── Render ──

  render(): HTMLElement {
    return this.container;
  }

  getElement(): HTMLElement {
    return this.container;
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  scheduleDraw(): void {
    if (this.disposed || this.drawScheduled || !this._isVisible) return;
    this.drawScheduled = true;
    this.scheduledRafId = requestAnimationFrame(() => {
      this.drawScheduled = false;
      this.scheduledRafId = 0;
      if (!this.disposed && this._isVisible) {
        this.draw();
      }
    });
  }

  private draw(): void {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    if (width === 0 || height === 0) return;

    const colors = this.getColors();
    const duration = this.getDuration();
    const currentFrame = this.session.currentFrame;
    const inPoint = this.session.inPoint;
    const outPoint = this.session.outPoint;

    // Update toolbar state
    this.updateRangeLabel();
    this.updateNudgeButtons();

    // Clear
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    const trackWidth = width - PADDING * 2;
    const trackY = TICK_HEIGHT;
    const trackHeight = height - TICK_HEIGHT - 4;

    if (trackWidth <= 0 || trackHeight <= 0) return;

    const half = this._visibleFrames / 2;
    const startFrame = this._centerFrame - half;
    const endFrame = this._centerFrame + half;

    // Frame-to-X mapping for magnified view
    const frameToX = (frame: number): number => {
      return PADDING + ((frame - startFrame) / this._visibleFrames) * trackWidth;
    };

    // 1. Track background
    ctx.fillStyle = colors.track;
    ctx.beginPath();
    ctx.roundRect(PADDING, trackY, trackWidth, trackHeight, 4);
    ctx.fill();

    // 2. Out-of-range hatched/dimmed regions
    if (startFrame < 1) {
      const outOfRangeEndX = frameToX(1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(PADDING, trackY, Math.max(0, outOfRangeEndX - PADDING), trackHeight);
    }
    if (endFrame > duration) {
      const outOfRangeStartX = frameToX(duration);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(outOfRangeStartX, trackY, Math.max(0, PADDING + trackWidth - outOfRangeStartX), trackHeight);
    }

    // 3. Frame tick ruler (top 16px)
    this.drawFrameTicks(ctx, width, startFrame, endFrame, duration, trackWidth, colors);

    // 4. Waveform overlay
    if (this.waveformRenderer.hasData()) {
      const waveformData = this.waveformRenderer.getData();
      if (waveformData) {
        const fps = this.session.fps || 24;
        const startTime = Math.max(0, (startFrame - 1) / fps);
        const endTime = Math.min(waveformData.duration, (endFrame - 1) / fps);
        if (endTime > startTime) {
          this.waveformRenderer.render(
            ctx,
            PADDING + 2,
            trackY + 2,
            trackWidth - 4,
            trackHeight - 4,
            startTime,
            endTime,
            colors.waveform,
          );
        }
      }
    }

    // 5. In/out range highlight
    const hasCustomRange = inPoint !== 1 || outPoint !== duration;
    if (duration > 1 && hasCustomRange) {
      const inX = frameToX(inPoint);
      const outX = frameToX(outPoint);
      drawInOutRange(ctx, inX, outX, trackY, trackHeight, colors.inOutRange);

      // Played region within range
      if (currentFrame >= inPoint && currentFrame <= outPoint) {
        drawPlayedRegion(ctx, inX, frameToX(currentFrame), trackY, trackHeight, colors.played);
      }
    } else if (duration > 1) {
      // No custom range - played from frame 1 to current
      drawPlayedRegion(ctx, frameToX(1), frameToX(currentFrame), trackY, trackHeight, colors.played);
    }

    // 6. Mark lines
    drawMarkLines(ctx, this.session.marks.values(), frameToX, trackY, trackHeight, colors.mark, duration);

    // 7. Annotation triangles
    if (this.paintEngine) {
      const annotatedFrames = this.paintEngine.getAnnotatedFrames();
      drawAnnotationTriangles(ctx, annotatedFrames, frameToX, trackY, trackHeight, colors.annotation, duration);
    }

    // 8. In/out brackets
    if (duration > 1 && hasCustomRange) {
      drawInOutBrackets(ctx, frameToX(inPoint), frameToX(outPoint), trackY, trackHeight, colors.playhead);
    }

    // 9. Playhead
    if (currentFrame >= 1 && currentFrame <= duration) {
      const playheadX = frameToX(currentFrame);
      drawPlayhead(ctx, playheadX, trackY, trackHeight, colors.playhead, colors.playheadShadow, 7);
    }
  }

  private drawFrameTicks(
    ctx: CanvasRenderingContext2D,
    _width: number,
    startFrame: number,
    endFrame: number,
    duration: number,
    trackWidth: number,
    colors: { text: string; textDim: string; border: string },
  ): void {
    const visibleRange = endFrame - startFrame;
    if (visibleRange <= 0) return;

    // Determine tick spacing
    let tickStep = 1;
    const pixelsPerFrame = trackWidth / visibleRange;
    if (pixelsPerFrame < 5) tickStep = 100;
    else if (pixelsPerFrame < 10) tickStep = 50;
    else if (pixelsPerFrame < 20) tickStep = 10;
    else if (pixelsPerFrame < 40) tickStep = 5;

    ctx.fillStyle = colors.textDim;
    ctx.font = '9px -apple-system, BlinkMacSystemFont, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const firstTick = Math.ceil(Math.max(1, startFrame) / tickStep) * tickStep;
    const lastTick = Math.floor(Math.min(duration, endFrame));

    for (let frame = firstTick; frame <= lastTick; frame += tickStep) {
      const x = PADDING + ((frame - startFrame) / visibleRange) * trackWidth;
      if (x < PADDING - 5 || x > PADDING + trackWidth + 5) continue;

      // Tick line
      ctx.fillStyle = colors.border;
      const isMajor = frame % (tickStep * 5) === 0 || tickStep === 1;
      ctx.fillRect(x, isMajor ? 0 : 4, 1, isMajor ? TICK_HEIGHT : TICK_HEIGHT - 4);

      // Label (only for major ticks or when zoomed in enough)
      if (isMajor && pixelsPerFrame * tickStep > 20) {
        ctx.fillStyle = colors.textDim;
        ctx.fillText(String(frame), x, 1);
      }
    }
  }

  // ── Cleanup ──

  dispose(): void {
    this.disposed = true;

    if (this.scheduledRafId !== 0) {
      cancelAnimationFrame(this.scheduledRafId);
      this.scheduledRafId = 0;
    }
    this.drawScheduled = false;

    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.zoomSlider.removeEventListener('input', this.onZoomSliderInput);

    window.removeEventListener('resize', this.boundHandleResize);

    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }

    this.subs.dispose();
  }
}
