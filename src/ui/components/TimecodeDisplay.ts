/**
 * TimecodeDisplay - Shows current timecode (HH:MM:SS:FF) and frame info
 *
 * Features:
 * - Timecode display in SMPTE format
 * - Support for drop-frame timecode (29.97, 59.94 fps)
 * - Frame counter display (current / total)
 * - Configurable start timecode offset
 */

import { Session } from '../../core/session/Session';

export interface TimecodeOptions {
  /** Start timecode offset in frames (default: 0) */
  startFrame?: number;
  /** Show frame counter alongside timecode (default: true) */
  showFrameCounter?: boolean;
}

// Frame rates that use drop-frame timecode
const DROP_FRAME_RATES = [29.97, 59.94];
const DROP_FRAME_EPSILON = 0.01;

/**
 * Check if a frame rate should use drop-frame timecode
 */
function isDropFrame(fps: number): boolean {
  return DROP_FRAME_RATES.some(df => Math.abs(fps - df) < DROP_FRAME_EPSILON);
}

/**
 * Calculate timecode from frame number
 * Supports both non-drop-frame and drop-frame timecode
 */
export function frameToTimecode(
  frame: number,
  fps: number,
  startFrame: number = 0
): { hours: number; minutes: number; seconds: number; frames: number; dropFrame: boolean } {
  const totalFrame = frame + startFrame - 1; // Convert to 0-based
  const dropFrame = isDropFrame(fps);

  if (dropFrame) {
    // Drop-frame timecode calculation
    // For 29.97 fps: drop frames 0 and 1 at each minute except every 10th minute
    // For 59.94 fps: drop frames 0, 1, 2, 3 at each minute except every 10th minute
    const dropFrames = fps > 30 ? 4 : 2;
    const framesPerMinute = Math.round(fps * 60);
    const framesPer10Min = framesPerMinute * 10 - dropFrames * 9;

    const d = Math.floor(totalFrame / framesPer10Min);
    const m = totalFrame % framesPer10Min;

    let adjustedFrame: number;
    if (m < dropFrames) {
      adjustedFrame = totalFrame + dropFrames * 9 * d;
    } else {
      adjustedFrame = totalFrame + dropFrames * 9 * d + dropFrames * Math.floor((m - dropFrames) / (framesPerMinute - dropFrames));
    }

    const framesPerHour = Math.round(fps * 3600);
    const roundedFps = Math.round(fps);

    const hours = Math.floor(adjustedFrame / framesPerHour);
    const remainingAfterHours = adjustedFrame % framesPerHour;
    const minutes = Math.floor(remainingAfterHours / (roundedFps * 60));
    const remainingAfterMinutes = remainingAfterHours % (roundedFps * 60);
    const seconds = Math.floor(remainingAfterMinutes / roundedFps);
    const frames = remainingAfterMinutes % roundedFps;

    return { hours, minutes, seconds, frames, dropFrame: true };
  } else {
    // Non-drop-frame timecode (simpler calculation)
    const roundedFps = Math.round(fps);
    const totalSeconds = Math.floor(totalFrame / roundedFps);
    const frames = totalFrame % roundedFps;

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return { hours, minutes, seconds, frames, dropFrame: false };
  }
}

/**
 * Format timecode as string (HH:MM:SS:FF or HH:MM:SS;FF for drop-frame)
 */
export function formatTimecode(
  tc: { hours: number; minutes: number; seconds: number; frames: number; dropFrame: boolean }
): string {
  const pad = (n: number, width: number = 2) => n.toString().padStart(width, '0');
  const separator = tc.dropFrame ? ';' : ':';
  return `${pad(tc.hours)}:${pad(tc.minutes)}:${pad(tc.seconds)}${separator}${pad(tc.frames)}`;
}

export class TimecodeDisplay {
  private container: HTMLElement;
  private timecodeElement: HTMLElement;
  private frameCounterElement: HTMLElement;
  private session: Session;
  private options: Required<TimecodeOptions>;

  constructor(session: Session, options: TimecodeOptions = {}) {
    this.session = session;
    this.options = {
      startFrame: options.startFrame ?? 0,
      showFrameCounter: options.showFrameCounter ?? true,
    };

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'timecode-display';
    this.container.dataset.testid = 'timecode-display';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      color: var(--text-primary);
      padding: 0 8px;
      user-select: none;
    `;

    // Timecode display (HH:MM:SS:FF)
    this.timecodeElement = document.createElement('div');
    this.timecodeElement.className = 'timecode-value';
    this.timecodeElement.dataset.testid = 'timecode-value';
    this.timecodeElement.style.cssText = `
      background: rgba(0, 0, 0, 0.3);
      padding: 4px 8px;
      border-radius: 3px;
      border: 1px solid var(--bg-secondary);
      min-width: 90px;
      text-align: center;
      letter-spacing: 0.5px;
    `;
    this.container.appendChild(this.timecodeElement);

    // Frame counter (current / total)
    this.frameCounterElement = document.createElement('div');
    this.frameCounterElement.className = 'frame-counter';
    this.frameCounterElement.dataset.testid = 'frame-counter';
    this.frameCounterElement.style.cssText = `
      color: var(--text-secondary);
      font-size: 11px;
      min-width: 70px;
      text-align: right;
    `;
    if (this.options.showFrameCounter) {
      this.container.appendChild(this.frameCounterElement);
    }

    // Bind events
    this.session.on('frameChanged', () => this.update());
    this.session.on('sourceLoaded', () => this.update());
    this.session.on('durationChanged', () => this.update());

    // Initial update
    this.update();
  }

  /**
   * Update the timecode display
   */
  private update(): void {
    const frame = this.session.currentFrame;
    const fps = this.session.fps;
    const totalFrames = this.session.frameCount;

    // Calculate and display timecode
    const tc = frameToTimecode(frame, fps, this.options.startFrame);
    this.timecodeElement.textContent = formatTimecode(tc);

    // Update frame counter
    if (this.options.showFrameCounter) {
      this.frameCounterElement.textContent = `${frame} / ${totalFrames}`;
    }

    // Update tooltip with fps info
    const dropFrameIndicator = tc.dropFrame ? ' (DF)' : '';
    this.timecodeElement.title = `${fps} fps${dropFrameIndicator}`;
  }

  /**
   * Set start timecode offset
   */
  setStartFrame(frame: number): void {
    this.options.startFrame = frame;
    this.update();
  }

  /**
   * Get start timecode offset
   */
  getStartFrame(): number {
    return this.options.startFrame;
  }

  /**
   * Toggle frame counter visibility
   */
  setShowFrameCounter(show: boolean): void {
    this.options.showFrameCounter = show;
    if (show && !this.container.contains(this.frameCounterElement)) {
      this.container.appendChild(this.frameCounterElement);
    } else if (!show && this.container.contains(this.frameCounterElement)) {
      this.container.removeChild(this.frameCounterElement);
    }
    this.update();
  }

  /**
   * Get current timecode as string
   */
  getTimecode(): string {
    const frame = this.session.currentFrame;
    const fps = this.session.fps;
    const tc = frameToTimecode(frame, fps, this.options.startFrame);
    return formatTimecode(tc);
  }

  /**
   * Render the component
   */
  render(): HTMLElement {
    return this.container;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    // Event listeners are automatically cleaned up when session is disposed
  }
}
