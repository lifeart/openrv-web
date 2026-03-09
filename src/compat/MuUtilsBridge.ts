/**
 * MuUtilsBridge — Timer, file kind detection, URL handling, cursor, and misc utilities
 *
 * Implements Mu utility commands using browser APIs:
 * - Timers via performance.now()
 * - File kind detection via extension matching
 * - URL handling via window.open / clipboard API
 * - Cursor via CSS cursor property
 * - Command-line flags via URL search params
 */

import { FileKind, MuCursor } from './types';
import type { FileKindValue } from './types';

export class MuUtilsBridge {
  // ── Timer State ──
  private timerStartTime: number | null = null;
  private timerRunning = false;
  private timerElapsed = 0;

  // ── Progressive Loading ──
  private _progressiveSourceLoading = true;
  private _loadTotal = 0;
  private _loadCount = 0;

  // ── Timer Commands ──

  /**
   * Start the global timer.
   * Mu signature: startTimer(void;)
   */
  startTimer(): void {
    this.timerStartTime = performance.now();
    this.timerRunning = true;
    this.timerElapsed = 0;
  }

  /**
   * Stop the global timer.
   * Mu signature: stopTimer(void;)
   */
  stopTimer(): void {
    if (this.timerRunning && this.timerStartTime !== null) {
      this.timerElapsed = (performance.now() - this.timerStartTime) / 1000;
    }
    this.timerRunning = false;
  }

  /**
   * Get elapsed time in seconds since startTimer was called.
   * Mu signature: elapsedTime(float;)
   */
  elapsedTime(): number {
    if (this.timerRunning && this.timerStartTime !== null) {
      return (performance.now() - this.timerStartTime) / 1000;
    }
    return this.timerElapsed;
  }

  /**
   * Get current time as seconds since epoch.
   * Mu signature: theTime(float;)
   */
  theTime(): number {
    return Date.now() / 1000;
  }

  /**
   * Check if the global timer is currently running.
   * Mu signature: isTimerRunning(bool;)
   */
  isTimerRunning(): boolean {
    return this.timerRunning;
  }

  // ── File Kind Detection ──

  /**
   * Detect file kind by extension.
   * Mu signature: fileKind(int; string)
   * Returns a FileKind constant.
   */
  fileKind(path: string): FileKindValue {
    const ext = this.getExtension(path).toLowerCase();

    // Image formats
    if (
      [
        'exr',
        'dpx',
        'cin',
        'tif',
        'tiff',
        'png',
        'jpg',
        'jpeg',
        'bmp',
        'tga',
        'hdr',
        'sgi',
        'rgb',
        'psd',
        'webp',
        'avif',
      ].includes(ext)
    ) {
      return FileKind.ImageFile;
    }

    // Movie formats
    if (
      ['mov', 'mp4', 'avi', 'mkv', 'webm', 'mxf', 'r3d', 'ari', 'braw', 'dng'].includes(ext)
    ) {
      return FileKind.MovieFile;
    }

    // Audio formats
    if (['wav', 'mp3', 'aac', 'flac', 'ogg', 'aiff', 'aif', 'm4a'].includes(ext)) {
      return FileKind.AudioFile;
    }

    // CDL
    if (['cdl', 'cc', 'ccc'].includes(ext)) {
      return FileKind.CDLFile;
    }

    // LUT formats
    if (['cube', '3dl', 'lut', 'csp', 'spi1d', 'spi3d'].includes(ext)) {
      return FileKind.LUTFile;
    }

    // RV session files
    if (['rv', 'rvs'].includes(ext)) {
      return FileKind.RVFile;
    }

    // Profile
    if (['rvprofile'].includes(ext)) {
      return FileKind.ProfileFile;
    }

    return FileKind.UnknownFile;
  }

  // ── URL / Clipboard ──

  /**
   * Open a URL in a new browser tab.
   * Mu signature: openUrl(void; string)
   */
  openUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Copy a URL to the clipboard.
   * Mu signature: putUrlOnClipboard(void; string)
   */
  async putUrlOnClipboard(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      console.warn('[MuUtilsBridge] Failed to write to clipboard (requires secure context)');
    }
  }

  // ── Command-line Flags (URL params) ──

  /**
   * Get a command-line flag value from URL search params.
   * Mu signature: commandLineFlag(string; string)
   */
  commandLineFlag(flagName: string): string {
    const params = new URLSearchParams(window.location.search);
    return params.get(flagName) ?? '';
  }

  /**
   * Check if autoplay was requested via URL params.
   * Mu signature: optionsPlay(int;)
   */
  optionsPlay(): number {
    return this.commandLineFlag('autoplay') === '1' ? 1 : 0;
  }

  /**
   * Check if packages should be disabled via URL params.
   * Mu signature: optionsNoPackages(int;)
   */
  optionsNoPackages(): number {
    return this.commandLineFlag('nopackages') === '1' ? 1 : 0;
  }

  /**
   * Reset the autoplay option.
   */
  optionsPlayReset(): void {
    // Remove autoplay from URL without reload
    const url = new URL(window.location.href);
    url.searchParams.delete('autoplay');
    window.history.replaceState({}, '', url.toString());
  }

  // ── Cursor ──

  /**
   * Set the cursor style.
   * Mu signature: setCursor(void; int)
   */
  setCursor(cursorId: number): void {
    const cursorName = MuCursor[cursorId] ?? 'default';
    document.body.style.cursor = cursorName;
  }

  // ── Network Host ──

  /**
   * Get the local network hostname.
   * Mu signature: myNetworkHost(string;)
   */
  myNetworkHost(): string {
    return window.location.hostname;
  }

  // ── Progressive Loading ──

  /**
   * Get the total number of sources queued for loading.
   */
  loadTotal(): number {
    return this._loadTotal;
  }

  /**
   * Get the number of sources that have finished loading.
   */
  loadCount(): number {
    return this._loadCount;
  }

  /**
   * Enable/disable progressive source loading.
   */
  setProgressiveSourceLoading(enabled: boolean): void {
    this._progressiveSourceLoading = enabled;
  }

  /**
   * Check if progressive source loading is enabled.
   */
  progressiveSourceLoading(): boolean {
    return this._progressiveSourceLoading;
  }

  /**
   * Wait for all progressive loading to complete.
   * Returns a promise that resolves when loadCount >= loadTotal.
   */
  async waitForProgressiveLoading(): Promise<void> {
    if (this._loadCount >= this._loadTotal) return;

    return new Promise<void>((resolve) => {
      const check = () => {
        if (this._loadCount >= this._loadTotal) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Prefetch a media URL.
   */
  startPreloadingMedia(url: string): void {
    this._loadTotal++;
    fetch(url, { mode: 'cors' })
      .then(() => {
        this._loadCount++;
      })
      .catch(() => {
        this._loadCount++;
      });
  }

  /**
   * Update load counters (for internal use by source management).
   */
  setLoadCounters(total: number, count: number): void {
    this._loadTotal = total;
    this._loadCount = count;
  }

  // ── Window Title ──

  /**
   * Set the browser tab title.
   * Mu signature: setWindowTitle(void; string)
   */
  setWindowTitle(title: string): void {
    document.title = title;
  }

  // ── Fullscreen ──

  /**
   * Enter or exit fullscreen mode.
   * Mu signature: fullScreenMode(void; bool)
   */
  fullScreenMode(enter: boolean): void {
    if (enter) {
      document.documentElement.requestFullscreen?.().catch(() => {
        console.warn('[MuUtilsBridge] Fullscreen request denied');
      });
    } else {
      document.exitFullscreen?.().catch(() => {
        // May already be out of fullscreen
      });
    }
  }

  /**
   * Check if currently in fullscreen mode.
   * Mu signature: isFullScreen(bool;)
   */
  isFullScreen(): boolean {
    return document.fullscreenElement !== null;
  }

  /**
   * Toggle fullscreen mode.
   */
  toggleFullScreen(): void {
    this.fullScreenMode(!this.isFullScreen());
  }

  // ── Device Pixel Ratio ──

  /**
   * Get device pixel ratio.
   * Mu signature: devicePixelRatio(float;)
   */
  devicePixelRatio(): number {
    return window.devicePixelRatio ?? 1;
  }

  // ── Private Helpers ──

  private getExtension(path: string): string {
    const lastDot = path.lastIndexOf('.');
    if (lastDot === -1) return '';
    return path.slice(lastDot + 1);
  }
}
