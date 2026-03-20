/**
 * MuCommands — Mu `commands` module compatibility layer (Phase 1)
 *
 * Provides Mu-compatible function names that delegate to the openrv-web
 * public API (`window.openrv.*`). Covers:
 *   - Playback & Transport (commands 1-26)
 *   - Audio (command 27; 28-29 are N/A)
 *   - View & Display (commands 30-48)
 *   - Frame Marks (commands 49-51)
 *
 * Access pattern: `window.rv.commands.play()`
 */

import { PLAY_MODE_TO_LOOP, LOOP_TO_PLAY_MODE, FilterNearest, FilterLinear } from './constants';
import type { BackgroundPatternState } from '../core/types/background';

/**
 * Lazily resolve the openrv API from the global scope.
 * This avoids hard coupling and lets the compat layer be instantiated
 * before or after the main API.
 */
/** Shape of the openrv API subset used by MuCommands. */
type OpenRVCompat = {
  playback: {
    play(): void;
    pause(): void;
    toggle(): void;
    isPlaying(): boolean;
    seek(frame: number): void;
    getCurrentFrame(): number;
    getTotalFrames(): number;
    setPlaybackMode(mode: 'realtime' | 'playAllFrames'): void;
    getPlaybackMode(): 'realtime' | 'playAllFrames';
    step(n?: number): void;
    getMeasuredFPS(): number;
    setPlayDirection(direction: number): void;
    getPlayDirection(): number;
    isBuffering(): boolean;
    getDroppedFrameCount(): number;
  };
  media: {
    getFPS(): number;
    getPlaybackFPS(): number;
    setPlaybackFPS(fps: number): void;
    getResolution(): { width: number; height: number };
    hasMedia(): boolean;
    getStartFrame(): number;
  };
  audio: {
    setAudioScrubEnabled(enabled: boolean): void;
    isAudioScrubEnabled(): boolean;
  };
  loop: {
    setMode(mode: string): void;
    getMode(): string;
    getInPoint(): number;
    getOutPoint(): number;
    setInPoint(frame: number): void;
    setOutPoint(frame: number): void;
  };
  view: {
    fitToWindow(): void;
    setZoom(level: number): void;
    getZoom(): number;
    setPan(x: number, y: number): void;
    getPan(): { x: number; y: number };
    setTextureFilterMode(mode: 'nearest' | 'linear'): void;
    getTextureFilterMode(): 'nearest' | 'linear';
    setBackgroundPattern(state: BackgroundPatternState): void;
    getBackgroundPattern(): BackgroundPatternState;
    getViewportSize(): { width: number; height: number };
  };
  markers: {
    add(frame: number, note?: string, color?: string): void;
    remove(frame: number): void;
    get(frame: number): { frame: number; note: string; color: string } | null;
    getAll(): Array<{ frame: number; note: string; color: string }>;
  };
};

function getOpenRV(): OpenRVCompat {
  const api = (globalThis as Record<string, unknown>).openrv;
  if (!api) {
    throw new Error('window.openrv is not available. Initialize OpenRVAPI first.');
  }
  return api as OpenRVCompat;
}

/**
 * Try to resolve the openrv API, returning null when unavailable.
 * Used by health commands that should degrade gracefully.
 */
function tryGetOpenRV(): OpenRVCompat | null {
  const api = (globalThis as Record<string, unknown>).openrv;
  return (api as OpenRVCompat) ?? null;
}

/** Supported commands and their support status */
const SUPPORT_MAP: Record<string, true | false | 'partial'> = {
  // Playback - DIRECT
  play: true,
  stop: true,
  isPlaying: true,
  setFrame: true,
  frame: true,
  frameEnd: true,
  fps: true,
  setRealtime: true,
  isRealtime: true,
  setPlayMode: true,
  playMode: true,
  inPoint: true,
  outPoint: true,
  setInPoint: true,
  setOutPoint: true,
  // Playback - ADD
  frameStart: true,
  setFPS: true,
  realFPS: true,
  setInc: true,
  inc: true,
  skipped: true,
  isCurrentFrameIncomplete: false,
  isCurrentFrameError: false,
  isBuffering: true,
  mbps: false,
  resetMbps: false,
  // Audio
  scrubAudio: 'partial',
  // View & Display
  redraw: true,
  viewSize: true,
  setViewSize: 'partial',
  resizeFit: true,
  fullScreenMode: true,
  isFullScreen: true,
  setWindowTitle: true,
  setFiltering: true,
  getFiltering: true,
  setBGMethod: true,
  bgMethod: true,
  setMargins: 'partial',
  margins: 'partial',
  contentAspect: 'partial',
  devicePixelRatio: true,
  // Frame Marks
  markFrame: true,
  isMarked: true,
  markedFrames: true,
};

/** Commands that return Promises */
const ASYNC_COMMANDS = new Set<string>(['fullScreenMode']);

export class MuCommands {
  // --- Internal state for ADD commands ---
  private _margins: number[] = [0, 0, 0, 0];

  // =====================================================================
  // Introspection
  // =====================================================================

  /**
   * Check whether a command is supported.
   * @returns `true`, `false`, or `'partial'`
   */
  isSupported(name: string): boolean | 'partial' {
    return SUPPORT_MAP[name] ?? false;
  }

  /**
   * Check whether a command is async (returns a Promise).
   */
  isAsync(name: string): boolean {
    return ASYNC_COMMANDS.has(name);
  }

  // =====================================================================
  // Playback & Transport (commands 1-26)
  // =====================================================================

  /** Start playback. (Mu #1) */
  play(): void {
    getOpenRV().playback.play();
  }

  /** Stop playback (pause). (Mu #2) */
  stop(): void {
    getOpenRV().playback.pause();
  }

  /** Check if playing. (Mu #3) */
  isPlaying(): boolean {
    return getOpenRV().playback.isPlaying();
  }

  /** Seek to a specific frame. (Mu #4) */
  setFrame(frame: number): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new TypeError('setFrame() requires a valid frame number');
    }
    getOpenRV().playback.seek(Math.round(frame));
  }

  /** Get current frame number. (Mu #5) */
  frame(): number {
    return getOpenRV().playback.getCurrentFrame();
  }

  /** Get frame range start. (Mu #6) */
  frameStart(): number {
    return getOpenRV().media.getStartFrame();
  }

  /** Get frame range end (total frames). (Mu #7) */
  frameEnd(): number {
    return getOpenRV().playback.getTotalFrames();
  }

  /** Set playback FPS override. (Mu #8) */
  setFPS(fps: number): void {
    if (typeof fps !== 'number' || isNaN(fps) || fps <= 0) {
      throw new TypeError('setFPS() requires a positive number');
    }
    getOpenRV().media.setPlaybackFPS(fps);
  }

  /** Get effective FPS. (Mu #9) */
  fps(): number {
    return getOpenRV().media.getPlaybackFPS();
  }

  /** Get measured (real) playback FPS. (Mu #10) */
  realFPS(): number {
    return getOpenRV().playback.getMeasuredFPS();
  }

  /** Set realtime mode. (Mu #11) */
  setRealtime(realtime: boolean): void {
    getOpenRV().playback.setPlaybackMode(realtime ? 'realtime' : 'playAllFrames');
  }

  /** Check if realtime mode is active. (Mu #12) */
  isRealtime(): boolean {
    return getOpenRV().playback.getPlaybackMode() === 'realtime';
  }

  /** Set playback increment (1=forward, -1=reverse). (Mu #13) */
  setInc(inc: number): void {
    if (typeof inc !== 'number' || isNaN(inc)) {
      throw new TypeError('setInc() requires a valid number');
    }
    getOpenRV().playback.setPlayDirection(inc);
  }

  /** Get playback increment. (Mu #14) */
  inc(): number {
    return getOpenRV().playback.getPlayDirection();
  }

  /** Set play mode using Mu integer constants. (Mu #15) */
  setPlayMode(mode: number): void {
    const loopMode = PLAY_MODE_TO_LOOP[mode];
    if (!loopMode) {
      throw new TypeError(`setPlayMode() invalid mode: ${mode}. Use PlayLoop(0), PlayOnce(1), or PlayPingPong(2)`);
    }
    getOpenRV().loop.setMode(loopMode);
  }

  /** Get play mode as Mu integer constant. (Mu #16) */
  playMode(): number {
    const mode = getOpenRV().loop.getMode();
    return LOOP_TO_PLAY_MODE[mode] ?? 0;
  }

  /** Get in point frame. (Mu #17) */
  inPoint(): number {
    return getOpenRV().loop.getInPoint();
  }

  /** Get out point frame. (Mu #18) */
  outPoint(): number {
    return getOpenRV().loop.getOutPoint();
  }

  /** Set in point frame. (Mu #19) */
  setInPoint(frame: number): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new TypeError('setInPoint() requires a valid frame number');
    }
    getOpenRV().loop.setInPoint(Math.round(frame));
  }

  /** Set out point frame. (Mu #20) */
  setOutPoint(frame: number): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new TypeError('setOutPoint() requires a valid frame number');
    }
    getOpenRV().loop.setOutPoint(Math.round(frame));
  }

  /** Get count of skipped (dropped) frames since last play() started. (Mu #21) */
  skipped(): number {
    return tryGetOpenRV()?.playback.getDroppedFrameCount() ?? 0;
  }

  /**
   * Check if current frame decode is incomplete. (Mu #22)
   * Not supported — no per-frame decode state is tracked by the web engine.
   */
  isCurrentFrameIncomplete(): boolean {
    return false;
  }

  /**
   * Check if current frame has a decode error. (Mu #23)
   * Not supported — no per-frame decode error state is tracked by the web engine.
   */
  isCurrentFrameError(): boolean {
    return false;
  }

  /** Check if media is buffering. (Mu #24) */
  isBuffering(): boolean {
    return tryGetOpenRV()?.playback.isBuffering() ?? false;
  }

  /**
   * Get I/O throughput in megabits per second. (Mu #25)
   * Not supported — the web engine does not track I/O throughput.
   * Always returns 0.
   */
  mbps(): number {
    return 0;
  }

  /**
   * Reset mbps counter. (Mu #26)
   * Not supported — no-op since mbps is not tracked.
   */
  resetMbps(): void {
    // no-op: mbps tracking is not supported in the web engine
  }

  // =====================================================================
  // Audio (commands 27-29)
  // =====================================================================

  /**
   * Enable/disable audio scrubbing. (Mu #27)
   * Mu signature: scrubAudio(bool, float chunkDuration, int loopCount)
   * Web layer only supports the enable boolean; chunkDuration and loopCount are ignored.
   */
  scrubAudio(enable: boolean, _chunkDuration?: number, _loopCount?: number): void {
    getOpenRV().audio.setAudioScrubEnabled(Boolean(enable));
  }

  // Note: setAudioCacheMode (#28) and audioCacheMode (#29) are N/A in web.
  // They will be added as stubs in Phase 8.

  // =====================================================================
  // View & Display (commands 30-48)
  // =====================================================================

  /** Request a redraw of the viewport. (Mu #30) */
  redraw(): void {
    // In the web renderer, requestAnimationFrame is the standard mechanism.
    // If a canvas is available, we can trigger through it; otherwise no-op.
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        /* renderer will pick up the next paint */
      });
    }
  }

  /** Get viewer viewport size as [width, height]. (Mu #31) */
  viewSize(): [number, number] {
    const { width, height } = getOpenRV().view.getViewportSize();
    return [width, height];
  }

  /**
   * Set viewport size. (Mu #32)
   *
   * Stub — in the web app the viewport is sized by the layout container,
   * not by explicit pixel dimensions. Validates arguments but performs no
   * actual resize.
   */
  setViewSize(width: number, height: number): void {
    if (typeof width !== 'number' || typeof height !== 'number' || isNaN(width) || isNaN(height)) {
      throw new TypeError('setViewSize() requires valid width and height numbers');
    }
    // Stub: web viewport is managed by the layout, not settable directly.
  }

  /** Fit image to viewport. (Mu #33) */
  resizeFit(): void {
    getOpenRV().view.fitToWindow();
  }

  /** Enter or exit fullscreen mode. (Mu #34) */
  async fullScreenMode(enable: boolean): Promise<void> {
    if (typeof document === 'undefined') return;
    try {
      if (enable) {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as any).webkitRequestFullscreen) {
          await (el as any).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch {
      // Contain rejected fullscreen promises (e.g. user gesture requirement,
      // already in/out of fullscreen, or browser policy denial).
    }
  }

  /** Check if fullscreen is active. (Mu #35) */
  isFullScreen(): boolean {
    if (typeof document === 'undefined') return false;
    return !!(document.fullscreenElement ?? (document as any).webkitFullscreenElement);
  }

  // Note: center (#36) and close (#37) are N/A in browser -- Phase 8 stubs.

  /** Set the browser tab/window title. (Mu #38) */
  setWindowTitle(title: string): void {
    if (typeof title !== 'string') {
      throw new TypeError('setWindowTitle() requires a string');
    }
    if (typeof document !== 'undefined') {
      document.title = title;
    }
  }

  /** Set texture filtering mode. (Mu #39) */
  setFiltering(mode: number): void {
    if (mode !== FilterNearest && mode !== FilterLinear) {
      throw new TypeError(`setFiltering() invalid mode: ${mode}. Use FilterNearest(0) or FilterLinear(1)`);
    }
    getOpenRV().view.setTextureFilterMode(mode === FilterNearest ? 'nearest' : 'linear');
  }

  /** Get current texture filtering mode. (Mu #40) */
  getFiltering(): number {
    const mode = getOpenRV().view.getTextureFilterMode();
    return mode === 'nearest' ? FilterNearest : FilterLinear;
  }

  /** Set background method. (Mu #41) */
  setBGMethod(method: string): void {
    if (typeof method !== 'string') {
      throw new TypeError('setBGMethod() requires a string');
    }
    const current = getOpenRV().view.getBackgroundPattern();
    getOpenRV().view.setBackgroundPattern({
      ...current,
      pattern: method as BackgroundPatternState['pattern'],
    });
  }

  /** Get current background method. (Mu #42) */
  bgMethod(): string {
    return getOpenRV().view.getBackgroundPattern().pattern;
  }

  /** Set viewport margins. (Mu #43) */
  setMargins(margins: number[], _relative: boolean): void {
    if (!Array.isArray(margins)) {
      throw new TypeError('setMargins() requires a number array');
    }
    this._margins = margins.map(Number);
  }

  /** Get current viewport margins. (Mu #44) */
  margins(): number[] {
    return [...this._margins];
  }

  // Note: setHardwareStereoMode (#45) and stereoSupported (#46) are N/A -- Phase 8 stubs.

  /** Get content aspect ratio. (Mu #47) */
  contentAspect(): number {
    const { width, height } = getOpenRV().media.getResolution();
    if (height === 0) return 1;
    return width / height;
  }

  /** Get device pixel ratio. (Mu #48) */
  devicePixelRatio(): number {
    if (typeof window !== 'undefined') {
      return window.devicePixelRatio ?? 1;
    }
    return 1;
  }

  // =====================================================================
  // Frame Marks (commands 49-51)
  // =====================================================================

  /** Mark or unmark a frame. (Mu #49) */
  markFrame(frame: number, marked: boolean): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new TypeError('markFrame() requires a valid frame number');
    }
    const api = getOpenRV();
    if (marked) {
      api.markers.add(frame);
    } else {
      api.markers.remove(frame);
    }
  }

  /** Check if a frame is marked. (Mu #50) */
  isMarked(frame: number): boolean {
    return getOpenRV().markers.get(frame) !== null;
  }

  /** Get all marked frames as an integer array. (Mu #51) */
  markedFrames(): number[] {
    return getOpenRV()
      .markers.getAll()
      .map((m: { frame: number }) => m.frame);
  }
}
