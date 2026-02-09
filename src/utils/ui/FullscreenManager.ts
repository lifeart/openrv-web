/**
 * FullscreenManager - Manages browser Fullscreen API interactions
 *
 * Provides a clean interface for entering/exiting fullscreen mode,
 * with event emission for state changes and proper cleanup.
 */

import { EventEmitter, EventMap } from '../EventEmitter';

/**
 * Safari vendor-prefixed fullscreen API on HTMLElement.
 */
interface WebkitHTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

/**
 * Safari vendor-prefixed fullscreen API on Document.
 */
interface WebkitDocument {
  webkitExitFullscreen?: () => Promise<void>;
  webkitFullscreenElement?: Element | null;
}

export interface FullscreenEvents extends EventMap {
  fullscreenChanged: boolean;
}

export class FullscreenManager extends EventEmitter<FullscreenEvents> {
  private container: HTMLElement;
  private _isFullscreen: boolean = false;
  private boundHandleFullscreenChange: () => void;

  constructor(container: HTMLElement) {
    super();
    this.container = container;
    this.boundHandleFullscreenChange = this.handleFullscreenChange.bind(this);
    this.setupEventListeners();
  }

  /**
   * Whether the app is currently in fullscreen mode
   */
  get isFullscreen(): boolean {
    return this._isFullscreen;
  }

  /**
   * Toggle fullscreen mode
   */
  async toggle(): Promise<void> {
    if (this._isFullscreen) {
      await this.exit();
    } else {
      await this.enter();
    }
  }

  /**
   * Enter fullscreen mode
   */
  async enter(): Promise<void> {
    try {
      if (this.container.requestFullscreen) {
        await this.container.requestFullscreen();
      } else if ((this.container as unknown as WebkitHTMLElement).webkitRequestFullscreen) {
        // Safari support
        await (this.container as unknown as WebkitHTMLElement).webkitRequestFullscreen!();
      }
    } catch (err) {
      console.warn('Failed to enter fullscreen:', err);
    }
  }

  /**
   * Exit fullscreen mode
   */
  async exit(): Promise<void> {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as unknown as WebkitDocument).webkitExitFullscreen) {
        // Safari support
        await (document as unknown as WebkitDocument).webkitExitFullscreen!();
      }
    } catch (err) {
      console.warn('Failed to exit fullscreen:', err);
    }
  }

  private setupEventListeners(): void {
    document.addEventListener('fullscreenchange', this.boundHandleFullscreenChange);
    // Safari support
    document.addEventListener('webkitfullscreenchange', this.boundHandleFullscreenChange);
  }

  private handleFullscreenChange(): void {
    const fullscreenElement = document.fullscreenElement || (document as unknown as WebkitDocument).webkitFullscreenElement;
    this._isFullscreen = !!fullscreenElement;
    this.emit('fullscreenChanged', this._isFullscreen);
  }

  /**
   * Check if fullscreen is supported by the browser
   */
  static isSupported(): boolean {
    return !!(
      document.documentElement.requestFullscreen ||
      (document.documentElement as unknown as WebkitHTMLElement).webkitRequestFullscreen
    );
  }

  dispose(): void {
    document.removeEventListener('fullscreenchange', this.boundHandleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this.boundHandleFullscreenChange);
    this.removeAllListeners();
  }
}
