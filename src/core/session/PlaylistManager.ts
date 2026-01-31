/**
 * PlaylistManager - Manages multiple clips in sequence.
 *
 * Features:
 * - Add, remove, reorder clips
 * - Map global frames to source/local frames
 * - EDL import/export
 * - Loop and auto-advance options
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

/** Represents a single clip in the playlist */
export interface PlaylistClip {
  /** Unique ID for the clip */
  id: string;
  /** Index of the source in session's sources array */
  sourceIndex: number;
  /** Source name for display */
  sourceName: string;
  /** In point (start frame) within the source */
  inPoint: number;
  /** Out point (end frame) within the source */
  outPoint: number;
  /** Global start frame in the playlist timeline */
  globalStartFrame: number;
  /** Duration in frames */
  duration: number;
}

/** Playlist state for serialization */
export interface PlaylistState {
  /** List of clips */
  clips: PlaylistClip[];
  /** Whether playlist mode is active */
  enabled: boolean;
  /** Current playhead position (global frame) */
  currentFrame: number;
  /** Loop mode: none, single (current clip), all */
  loopMode: 'none' | 'single' | 'all';
}

/** Default playlist state */
export const DEFAULT_PLAYLIST_STATE: PlaylistState = {
  clips: [],
  enabled: false,
  currentFrame: 1,
  loopMode: 'none',
};

/** Events emitted by PlaylistManager */
export interface PlaylistManagerEvents extends EventMap {
  /** Emitted when clips change */
  clipsChanged: { clips: PlaylistClip[] };
  /** Emitted when enabled state changes */
  enabledChanged: { enabled: boolean };
  /** Emitted when current clip changes */
  clipChanged: { clip: PlaylistClip | null; index: number };
  /** Emitted when loop mode changes */
  loopModeChanged: { mode: 'none' | 'single' | 'all' };
  /** Emitted when playhead reaches end */
  playlistEnded: void;
}

/** Result of mapping a global frame to source */
export interface FrameMapping {
  clip: PlaylistClip;
  clipIndex: number;
  sourceIndex: number;
  localFrame: number;
}

/**
 * PlaylistManager handles multi-clip playlist functionality
 */
export class PlaylistManager extends EventEmitter<PlaylistManagerEvents> {
  private clips: PlaylistClip[] = [];
  private enabled = false;
  private currentFrame = 1;
  private loopMode: 'none' | 'single' | 'all' = 'none';
  private nextClipId = 1;

  constructor() {
    super();
  }

  /**
   * Add a clip to the playlist
   */
  addClip(
    sourceIndex: number,
    sourceName: string,
    inPoint: number,
    outPoint: number
  ): PlaylistClip {
    const duration = outPoint - inPoint + 1;
    const globalStartFrame = this.getTotalDuration() + 1;

    const clip: PlaylistClip = {
      id: `clip-${this.nextClipId++}`,
      sourceIndex,
      sourceName,
      inPoint,
      outPoint,
      globalStartFrame,
      duration,
    };

    this.clips.push(clip);
    this.emit('clipsChanged', { clips: [...this.clips] });
    return clip;
  }

  /**
   * Remove a clip by ID
   */
  removeClip(clipId: string): boolean {
    const index = this.clips.findIndex(c => c.id === clipId);
    if (index === -1) return false;

    this.clips.splice(index, 1);
    this.recalculateGlobalFrames();
    this.emit('clipsChanged', { clips: [...this.clips] });
    return true;
  }

  /**
   * Move a clip to a new position
   */
  moveClip(clipId: string, newIndex: number): boolean {
    const currentIndex = this.clips.findIndex(c => c.id === clipId);
    if (currentIndex === -1) return false;

    newIndex = Math.max(0, Math.min(newIndex, this.clips.length - 1));
    if (currentIndex === newIndex) return false;

    const removed = this.clips.splice(currentIndex, 1);
    const clip = removed[0];
    if (clip) {
      this.clips.splice(newIndex, 0, clip);
    } else {
      console.warn(`PlaylistManager.moveClip: Failed to remove clip at index ${currentIndex}`);
      return false;
    }
    this.recalculateGlobalFrames();
    this.emit('clipsChanged', { clips: [...this.clips] });
    return true;
  }

  /**
   * Update clip in/out points
   */
  updateClipPoints(clipId: string, inPoint: number, outPoint: number): boolean {
    const clip = this.clips.find(c => c.id === clipId);
    if (!clip) return false;

    clip.inPoint = inPoint;
    clip.outPoint = outPoint;
    clip.duration = outPoint - inPoint + 1;
    this.recalculateGlobalFrames();
    this.emit('clipsChanged', { clips: [...this.clips] });
    return true;
  }

  /**
   * Get clip at a global frame position
   */
  getClipAtFrame(globalFrame: number): FrameMapping | null {
    for (let i = 0; i < this.clips.length; i++) {
      const clip = this.clips[i];
      if (!clip) continue;

      const clipEnd = clip.globalStartFrame + clip.duration - 1;

      if (globalFrame >= clip.globalStartFrame && globalFrame <= clipEnd) {
        const localOffset = globalFrame - clip.globalStartFrame;
        const localFrame = clip.inPoint + localOffset;

        return {
          clip,
          clipIndex: i,
          sourceIndex: clip.sourceIndex,
          localFrame,
        };
      }
    }
    return null;
  }

  /**
   * Get the next frame, handling clip transitions and loop modes
   */
  getNextFrame(currentGlobal: number): { frame: number; clipChanged: boolean } {
    const totalDuration = this.getTotalDuration();
    if (totalDuration === 0) return { frame: currentGlobal, clipChanged: false };

    const currentMapping = this.getClipAtFrame(currentGlobal);
    const nextGlobal = currentGlobal + 1;

    // Check if we're at the end of current clip
    if (currentMapping) {
      const clipEnd = currentMapping.clip.globalStartFrame + currentMapping.clip.duration - 1;

      if (currentGlobal >= clipEnd) {
        // At end of clip
        if (this.loopMode === 'single') {
          // Loop current clip
          return { frame: currentMapping.clip.globalStartFrame, clipChanged: false };
        }

        // Move to next clip or handle playlist end
        const nextClipIndex = currentMapping.clipIndex + 1;
        const nextClip = this.clips[nextClipIndex];
        if (nextClip) {
          return { frame: nextClip.globalStartFrame, clipChanged: true };
        }

        // At end of playlist
        if (this.loopMode === 'all') {
          return { frame: 1, clipChanged: true };
        }

        // End of playlist, no loop
        this.emit('playlistEnded', undefined);
        return { frame: currentGlobal, clipChanged: false };
      }
    }

    // Normal frame advance
    const nextMapping = this.getClipAtFrame(nextGlobal);
    const clipChanged = currentMapping && nextMapping &&
      currentMapping.clipIndex !== nextMapping.clipIndex;

    return { frame: nextGlobal, clipChanged: !!clipChanged };
  }

  /**
   * Get the previous frame, handling clip transitions
   */
  getPreviousFrame(currentGlobal: number): { frame: number; clipChanged: boolean } {
    if (currentGlobal <= 1) {
      if (this.loopMode === 'all' && this.clips.length > 0) {
        const totalDuration = this.getTotalDuration();
        return { frame: totalDuration, clipChanged: true };
      }
      return { frame: 1, clipChanged: false };
    }

    const currentMapping = this.getClipAtFrame(currentGlobal);
    const prevGlobal = currentGlobal - 1;
    const prevMapping = this.getClipAtFrame(prevGlobal);

    if (currentMapping && prevMapping) {
      const clipChanged = currentMapping.clipIndex !== prevMapping.clipIndex;
      return { frame: prevGlobal, clipChanged };
    }

    return { frame: prevGlobal, clipChanged: false };
  }

  /**
   * Recalculate global start frames after clip changes
   */
  private recalculateGlobalFrames(): void {
    let globalStart = 1;
    for (const clip of this.clips) {
      clip.globalStartFrame = globalStart;
      globalStart += clip.duration;
    }
  }

  /**
   * Get total playlist duration in frames
   */
  getTotalDuration(): number {
    return this.clips.reduce((sum, clip) => sum + clip.duration, 0);
  }

  /**
   * Get all clips
   */
  getClips(): PlaylistClip[] {
    return [...this.clips];
  }

  /**
   * Get clip by ID
   */
  getClip(clipId: string): PlaylistClip | undefined {
    return this.clips.find(c => c.id === clipId);
  }

  /**
   * Get clip by index
   */
  getClipByIndex(index: number): PlaylistClip | undefined {
    return this.clips[index];
  }

  /**
   * Get clip count
   */
  getClipCount(): number {
    return this.clips.length;
  }

  /**
   * Enable/disable playlist mode
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.emit('enabledChanged', { enabled });
    }
  }

  /**
   * Check if playlist mode is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set loop mode
   */
  setLoopMode(mode: 'none' | 'single' | 'all'): void {
    if (this.loopMode !== mode) {
      this.loopMode = mode;
      this.emit('loopModeChanged', { mode });
    }
  }

  /**
   * Get current loop mode
   */
  getLoopMode(): 'none' | 'single' | 'all' {
    return this.loopMode;
  }

  /**
   * Set current frame (global)
   */
  setCurrentFrame(frame: number): void {
    this.currentFrame = Math.max(1, Math.min(frame, this.getTotalDuration() || 1));
  }

  /**
   * Get current frame (global)
   */
  getCurrentFrame(): number {
    return this.currentFrame;
  }

  /**
   * Clear all clips
   */
  clear(): void {
    this.clips = [];
    this.currentFrame = 1;
    this.emit('clipsChanged', { clips: [] });
  }

  /**
   * Get state for serialization
   */
  getState(): PlaylistState {
    return {
      clips: [...this.clips],
      enabled: this.enabled,
      currentFrame: this.currentFrame,
      loopMode: this.loopMode,
    };
  }

  /**
   * Restore state from serialization
   */
  setState(state: Partial<PlaylistState>): void {
    if (state.clips) {
      this.clips = [...state.clips];
      // Ensure nextClipId is higher than any existing clip
      for (const clip of this.clips) {
        const match = clip.id.match(/clip-(\d+)/);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num >= this.nextClipId) {
            this.nextClipId = num + 1;
          }
        }
      }
      this.emit('clipsChanged', { clips: [...this.clips] });
    }
    if (state.enabled !== undefined) {
      this.setEnabled(state.enabled);
    }
    if (state.currentFrame !== undefined) {
      this.currentFrame = state.currentFrame;
    }
    if (state.loopMode !== undefined) {
      this.setLoopMode(state.loopMode);
    }
  }

  /**
   * Export as EDL (Edit Decision List) format
   */
  toEDL(title = 'OpenRV Playlist'): string {
    const lines: string[] = [
      'TITLE: ' + title,
      'FCM: NON-DROP FRAME',
      '',
    ];

    let editNum = 1;
    for (const clip of this.clips) {
      // Format: EDIT# SOURCE TRACK TYPE START END RECORD_START RECORD_END
      // Simplified EDL format for basic compatibility
      const sourceIn = this.framesToTimecode(clip.inPoint);
      const sourceOut = this.framesToTimecode(clip.outPoint + 1);
      const recordIn = this.framesToTimecode(clip.globalStartFrame);
      const recordOut = this.framesToTimecode(clip.globalStartFrame + clip.duration);

      lines.push(
        `${String(editNum).padStart(3, '0')}  ${clip.sourceName.padEnd(8).slice(0, 8)} V     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`
      );
      lines.push(`* FROM CLIP NAME: ${clip.sourceName}`);
      lines.push('');
      editNum++;
    }

    return lines.join('\n');
  }

  /**
   * Convert frame number to timecode string (HH:MM:SS:FF at 24fps)
   */
  private framesToTimecode(frame: number, fps = 24): string {
    const totalSeconds = Math.floor(frame / fps);
    const frames = frame % fps;
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);

    return [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
      String(frames).padStart(2, '0'),
    ].join(':');
  }

  /**
   * Parse timecode string to frame number
   */
  private timecodeToFrames(timecode: string, fps = 24): number {
    const parts = timecode.split(':').map(Number);
    if (parts.length !== 4) return 0;
    const hours = parts[0] ?? 0;
    const minutes = parts[1] ?? 0;
    const seconds = parts[2] ?? 0;
    const frames = parts[3] ?? 0;
    return (hours * 3600 + minutes * 60 + seconds) * fps + frames;
  }

  /**
   * Import from EDL format (basic parsing)
   */
  fromEDL(edl: string, sourceResolver: (name: string) => { index: number; frameCount: number } | null): number {
    const lines = edl.split('\n');
    let importedCount = 0;

    // Simple regex to match EDL edit lines
    const editRegex = /^\d{3}\s+(\S+)\s+V\s+C\s+(\d{2}:\d{2}:\d{2}:\d{2})\s+(\d{2}:\d{2}:\d{2}:\d{2})/;

    for (const line of lines) {
      const match = line.match(editRegex);
      if (match) {
        const sourceName = match[1];
        const sourceInTC = match[2];
        const sourceOutTC = match[3];
        if (!sourceName || !sourceInTC || !sourceOutTC) continue;

        const resolved = sourceResolver(sourceName);

        if (resolved) {
          const inPoint = this.timecodeToFrames(sourceInTC);
          const outPoint = this.timecodeToFrames(sourceOutTC) - 1; // EDL out is exclusive

          this.addClip(resolved.index, sourceName, inPoint, outPoint);
          importedCount++;
        }
      }
    }

    return importedCount;
  }

  dispose(): void {
    this.clips = [];
  }
}
