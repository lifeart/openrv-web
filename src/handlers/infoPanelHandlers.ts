/**
 * Info panel update handlers including timecode and duration formatting.
 */

import type { SessionBridgeContext } from '../AppSessionBridge';

/**
 * Format frame number as timecode (HH:MM:SS:FF).
 */
export function formatTimecode(frame: number, fps: number): string {
  if (fps <= 0) return '00:00:00:00';

  const totalSeconds = frame / fps;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor(frame % fps);

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
    frames.toString().padStart(2, '0'),
  ].join(':');
}

/**
 * Format duration as HH:MM:SS.
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Update info panel with current session data.
 */
export function updateInfoPanel(context: SessionBridgeContext): void {
  const session = context.getSession();
  const source = session.currentSource;
  const fps = session.fps;
  const currentFrame = session.currentFrame;
  const totalFrames = source?.duration ?? 0;

  // Calculate timecode
  const timecode = formatTimecode(currentFrame, fps);

  // Calculate duration
  const durationSeconds = totalFrames / fps;
  const duration = formatDuration(durationSeconds);

  context.getInfoPanel().update({
    filename: source?.name ?? undefined,
    width: source?.width ?? undefined,
    height: source?.height ?? undefined,
    currentFrame,
    totalFrames,
    timecode,
    duration,
    fps,
  });
}
