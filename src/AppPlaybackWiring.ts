/**
 * AppPlaybackWiring - Wire playback-related controls (volume, export, headerbar).
 *
 * Handles:
 * - HeaderBar events (shortcuts, custom bindings, save/open project, fullscreen, presentation)
 * - Volume control <-> session (bidirectional)
 * - Export control -> viewer
 * - AutoSave indicator
 * - Snapshot panel restore
 * - Playlist panel events
 */

import type { AppWiringContext } from './AppWiringContext';
import type { AppKeyboardHandler } from './AppKeyboardHandler';
import type { FullscreenManager } from './utils/ui/FullscreenManager';
import type { AudioMixer } from './audio/AudioMixer';
import type { Session } from './core/session/Session';
import type { LoopMode } from './core/types/session';
import type { PlaylistClip } from './core/session/PlaylistManager';
import { exportSequence } from './utils/export/SequenceExporter';
import {
  VideoExporter,
  ExportCancelledError,
  isVideoEncoderSupported,
  isCodecSupported,
  type VideoCodec,
} from './export/VideoExporter';
import { muxToMP4Blob } from './export/MP4Muxer';
import { ExportProgressDialog } from './ui/components/ExportProgress';
import { showAlert } from './ui/components/shared/Modal';
import { generateSlateFrame } from './export/SlateRenderer';

/**
 * External references that the playback wiring needs but are not part of
 * the standard AppWiringContext (they are initialized at different times).
 */
export interface PlaybackWiringDeps {
  getKeyboardHandler: () => AppKeyboardHandler;
  getFullscreenManager: () => FullscreenManager | undefined;
  getAudioMixer?: () => AudioMixer;
}

/**
 * Wire all playback-related controls (headerbar, volume, export, snapshots, playlists).
 */
export function wirePlaybackControls(ctx: AppWiringContext, deps: PlaybackWiringDeps): void {
  const { session, viewer, headerBar, controls, persistenceManager } = ctx;
  let videoExportInProgress = false;

  // HeaderBar events
  headerBar.on('showShortcuts', () => deps.getKeyboardHandler().showShortcutsDialog());
  headerBar.on('showCustomKeyBindings', () => deps.getKeyboardHandler().showCustomBindingsDialog());
  headerBar.on('saveProject', () => persistenceManager.saveProject());
  headerBar.on('openProject', (file) => persistenceManager.openProject(file));

  // AutoSave Indicator
  controls.autoSaveIndicator.connect(controls.autoSaveManager);
  controls.autoSaveIndicator.setRetryCallback(() => persistenceManager.retryAutoSave());
  headerBar.setAutoSaveIndicator(controls.autoSaveIndicator.render());

  // Wire up fullscreen and presentation toggle from HeaderBar
  headerBar.on('fullscreenToggle', () => {
    deps.getFullscreenManager()?.toggle();
  });
  headerBar.on('presentationToggle', () => {
    controls.presentationMode.toggle();
  });

  // Volume control (from HeaderBar) <-> session (bidirectional)
  const volumeControl = headerBar.getVolumeControl();
  volumeControl.on('volumeChanged', (volume) => {
    session.volume = volume;
    deps.getAudioMixer?.()?.setMasterVolume(volume);
  });
  volumeControl.on('mutedChanged', (muted) => {
    session.muted = muted;
    deps.getAudioMixer?.()?.setMasterMuted(muted);
  });
  // Sync back from Session to VolumeControl (for external changes)
  session.on('volumeChanged', (volume) => {
    volumeControl.syncVolume(volume);
    deps.getAudioMixer?.()?.setMasterVolume(volume);
  });
  session.on('mutedChanged', (muted) => {
    volumeControl.syncMuted(muted);
    deps.getAudioMixer?.()?.setMasterMuted(muted);
  });

  // Export control (from HeaderBar) -> viewer
  const exportControl = headerBar.getExportControl();
  exportControl.on('exportRequested', ({ format, includeAnnotations, quality }) => {
    viewer.exportFrame(format, includeAnnotations, quality);
  });
  exportControl.on('sourceExportRequested', ({ format, quality }) => {
    viewer.exportSourceFrame(format, quality);
  });
  exportControl.on('copyRequested', () => {
    viewer.copyFrameToClipboard(true);
  });
  exportControl.on('sequenceExportRequested', (request) => {
    handleSequenceExport(session, viewer, request);
  });
  exportControl.on('videoExportRequested', (request) => {
    if (videoExportInProgress) {
      showAlert('A video export is already in progress', { type: 'warning', title: 'Export Busy' });
      return;
    }
    videoExportInProgress = true;
    void handleVideoExport(session, viewer, request, controls).finally(() => {
      videoExportInProgress = false;
    });
  });
  exportControl.on('rvSessionExportRequested', ({ format }) => {
    persistenceManager.saveRvSession(format);
  });

  // Snapshot panel restore
  controls.snapshotPanel.on('restoreRequested', ({ id }) => persistenceManager.restoreSnapshot(id));

  // Note panel events
  controls.notePanel.on('noteSelected', ({ frame }) => {
    session.goToFrame(frame);
  });

  // Playlist panel events
  controls.playlistPanel.on('addCurrentSource', () => addCurrentSourceToPlaylist(session, controls));
  controls.playlistPanel.on('clipSelected', ({ sourceIndex, frame }) => {
    jumpToPlaylistClip(session, controls, sourceIndex, frame);
  });

  // Set initial fps and keep playlist panel in sync with session fps
  controls.playlistPanel.setFps(session.fps || 24);
  session.on('fpsChanged', (fps) => controls.playlistPanel.setFps(fps));

  // Playlist runtime integration (playback/loop/source switching while enabled)
  wirePlaylistRuntime(session, controls);
}

/**
 * Handle sequence export with progress dialog.
 */
async function handleSequenceExport(
  session: Session,
  viewer: import('./ui/components/Viewer').Viewer,
  request: {
    format: 'png' | 'jpeg' | 'webp';
    includeAnnotations: boolean;
    quality: number;
    useInOutRange: boolean;
  }
): Promise<void> {
  const source = session.currentSource;
  if (!source) {
    showAlert('No media loaded to export', { type: 'warning', title: 'Export' });
    return;
  }

  // Determine frame range
  let startFrame: number;
  let endFrame: number;

  if (request.useInOutRange) {
    startFrame = session.inPoint;
    endFrame = session.outPoint;
  } else {
    startFrame = 1;
    endFrame = session.frameCount;
  }

  const totalFrames = endFrame - startFrame + 1;
  if (totalFrames <= 0) {
    showAlert('Invalid frame range', { type: 'warning', title: 'Export' });
    return;
  }

  // Generate filename pattern based on source
  const sourceName = source.name?.replace(/\.[^/.]+$/, '') || 'frame';
  const padLength = String(endFrame).length < 4 ? 4 : String(endFrame).length;

  // Create progress dialog
  const progressDialog = document.createElement('div');
  progressDialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    padding: 24px;
    z-index: 10000;
    min-width: 300px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;

  const progressText = document.createElement('div');
  progressText.style.cssText = 'color: var(--text-primary); margin-bottom: 12px; font-size: 14px;';
  progressText.textContent = `Exporting frames 0/${totalFrames}...`;

  const progressBar = document.createElement('div');
  progressBar.style.cssText = `
    height: 8px;
    background: var(--border-primary);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 16px;
  `;

  const progressFill = document.createElement('div');
  progressFill.style.cssText = `
    height: 100%;
    background: var(--accent-primary);
    width: 0%;
    transition: width 0.1s ease;
  `;
  progressBar.appendChild(progressFill);

  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.cssText = `
    background: var(--bg-active);
    border: 1px solid var(--border-primary);
    color: var(--text-primary);
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
  `;

  const cancellationToken = { cancelled: false };
  cancelButton.addEventListener('click', () => {
    cancellationToken.cancelled = true;
    cancelButton.textContent = 'Cancelling...';
    cancelButton.disabled = true;
  });

  progressDialog.appendChild(progressText);
  progressDialog.appendChild(progressBar);
  progressDialog.appendChild(cancelButton);
  document.body.appendChild(progressDialog);

  // Store current frame to restore later
  const originalFrame = session.currentFrame;

  try {
    const result = await exportSequence(
      {
        format: request.format,
        quality: request.quality,
        startFrame,
        endFrame,
        includeAnnotations: request.includeAnnotations,
        filenamePattern: `${sourceName}_####`,
        padLength,
      },
      async (frame: number) => {
        // Navigate to frame and render
        session.goToFrame(frame);
        // Small delay to allow frame to load
        await new Promise(resolve => setTimeout(resolve, 50));
        const canvas = await viewer.renderFrameToCanvas(frame, request.includeAnnotations);
        if (!canvas) {
          throw new Error(`Failed to render frame ${frame}`);
        }
        return canvas;
      },
      (progress) => {
        progressText.textContent = `Exporting frames ${progress.currentFrame - startFrame + 1}/${totalFrames}...`;
        progressFill.style.width = `${progress.percent}%`;
      },
      cancellationToken
    );

    // Restore original frame
    session.goToFrame(originalFrame);

    // Remove progress dialog
    document.body.removeChild(progressDialog);

    // Show result
    if (result.success) {
      showAlert(`Successfully exported ${result.exportedFrames} frames`, { type: 'success', title: 'Export Complete' });
    } else if (result.error?.includes('cancelled')) {
      showAlert('Export cancelled', { type: 'info', title: 'Export' });
    } else {
      showAlert(`Export failed: ${result.error}`, { type: 'error', title: 'Export Error' });
    }
  } catch (err) {
    // Restore original frame
    session.goToFrame(originalFrame);

    // Remove progress dialog
    if (document.body.contains(progressDialog)) {
      document.body.removeChild(progressDialog);
    }

    showAlert(`Export error: ${err}`, { type: 'error', title: 'Export Error' });
  }
}

function resolveFrameRange(
  session: Session,
  useInOutRange: boolean
): { startFrame: number; endFrame: number; totalFrames: number } | null {
  const frameCount = session.frameCount;
  if (frameCount <= 0) {
    return null;
  }

  const unclampedStart = useInOutRange ? session.inPoint : 1;
  const unclampedEnd = useInOutRange ? session.outPoint : frameCount;

  const startFrame = Math.max(1, Math.min(frameCount, unclampedStart));
  const endFrame = Math.max(1, Math.min(frameCount, unclampedEnd));

  if (endFrame < startFrame) {
    return null;
  }

  return {
    startFrame,
    endFrame,
    totalFrames: endFrame - startFrame + 1,
  };
}

async function pickSupportedH264Codec(): Promise<VideoCodec | null> {
  const codecCandidates: VideoCodec[] = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f'];
  for (const codec of codecCandidates) {
    if (await isCodecSupported(codec)) {
      return codec;
    }
  }
  return null;
}

function estimateVideoBitrate(width: number, height: number, fps: number): number {
  const bitsPerPixelPerFrame = 0.08;
  const estimated = Math.round(width * height * fps * bitsPerPixelPerFrame);
  return Math.max(1_000_000, Math.min(20_000_000, estimated));
}

function sanitizeFilenameBase(name: string): string {
  const noExt = name.replace(/\.[^.]+$/, '');
  const sanitized = noExt.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized.length > 0 ? sanitized : 'export';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function normalizeCanvasSize(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): HTMLCanvasElement | null {
  if (canvas.width === width && canvas.height === height) {
    return canvas;
  }
  const normalized = document.createElement('canvas');
  normalized.width = width;
  normalized.height = height;
  const ctx = normalized.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.drawImage(canvas, 0, 0, width, height);
  return normalized;
}

async function handleVideoExport(
  session: Session,
  viewer: import('./ui/components/Viewer').Viewer,
  request: {
    includeAnnotations: boolean;
    useInOutRange: boolean;
  },
  controls?: import('./AppControlRegistry').AppControlRegistry,
): Promise<void> {
  const source = session.currentSource;
  if (!source) {
    showAlert('No media loaded to export', { type: 'warning', title: 'Export' });
    return;
  }

  if (!isVideoEncoderSupported()) {
    showAlert('WebCodecs VideoEncoder is not available in this browser', {
      type: 'error',
      title: 'MP4 Export Unsupported',
    });
    return;
  }

  const frameRange = resolveFrameRange(session, request.useInOutRange);
  if (!frameRange) {
    showAlert('Invalid frame range', { type: 'warning', title: 'Export' });
    return;
  }

  const codec = await pickSupportedH264Codec();
  if (!codec) {
    showAlert('No supported H.264 encoder was found for MP4 export', {
      type: 'error',
      title: 'MP4 Export Unsupported',
    });
    return;
  }

  const progressDialog = new ExportProgressDialog(document.body);
  const exporter = new VideoExporter();
  const originalFrame = session.currentFrame;
  const disposeCancelListener = progressDialog.on('cancel', () => exporter.cancel());
  const disposeProgressListener = exporter.on('progress', (progress) => {
    progressDialog.updateProgress(progress);
  });
  progressDialog.show();

  try {
    let firstFrameCanvas = await viewer.renderFrameToCanvas(frameRange.startFrame, request.includeAnnotations);
    if (!firstFrameCanvas) {
      throw new Error(`Failed to render frame ${frameRange.startFrame}`);
    }

    const width = firstFrameCanvas.width;
    const height = firstFrameCanvas.height;
    if (width <= 0 || height <= 0) {
      throw new Error('Invalid output dimensions');
    }

    const fps = Math.max(1, Math.round(session.fps || 24));
    const bitrate = estimateVideoBitrate(width, height, fps);

    // Generate slate frames if configured
    let slateCanvas: HTMLCanvasElement | null = null;
    let slateDurationFrames = 0;
    if (controls) {
      const slateConfig = controls.slateEditor.generateConfig();
      // Only prepend if there are fields (i.e., the user configured metadata)
      if (slateConfig.fields.length > 0) {
        slateConfig.width = width;
        slateConfig.height = height;
        const slateFrame = generateSlateFrame(slateConfig);
        slateCanvas = document.createElement('canvas');
        slateCanvas.width = width;
        slateCanvas.height = height;
        const slateCtx = slateCanvas.getContext('2d');
        if (slateCtx) {
          const imgData = new ImageData(new Uint8ClampedArray(slateFrame.pixels), slateFrame.width, slateFrame.height);
          slateCtx.putImageData(imgData, 0, 0);
          // Prepend 2 seconds of slate
          slateDurationFrames = fps * 2;
        }
      }
    }

    const exportStartFrame = frameRange.startFrame - slateDurationFrames;

    const result = await exporter.encode(
      {
        codec,
        width,
        height,
        fps,
        bitrate,
        frameRange: {
          start: exportStartFrame,
          end: frameRange.endFrame,
        },
        gopSize: Math.max(1, Math.round(fps * 2)),
        latencyMode: 'quality',
        hardwareAcceleration: 'prefer-hardware',
      },
      async (frame) => {
        // Slate frames come before the real frame range
        if (slateCanvas && frame < frameRange.startFrame) {
          return slateCanvas;
        }

        let canvas: HTMLCanvasElement | null;
        if (firstFrameCanvas && frame === frameRange.startFrame) {
          canvas = firstFrameCanvas;
          firstFrameCanvas = null;
        } else {
          canvas = await viewer.renderFrameToCanvas(frame, request.includeAnnotations);
        }

        if (!canvas) {
          return null;
        }
        return normalizeCanvasSize(canvas, width, height);
      }
    );

    const mp4Blob = muxToMP4Blob(result.chunks, {
      codec: result.codec,
      width: result.width,
      height: result.height,
      fps: result.fps,
    });

    const name = sanitizeFilenameBase(source.name || 'video');
    const filename = `${name}_${frameRange.startFrame}-${frameRange.endFrame}.mp4`;
    downloadBlob(mp4Blob, filename);
    showAlert(`Exported ${result.totalFrames} frames to ${filename}`, {
      type: 'success',
      title: 'Export Complete',
    });
  } catch (err) {
    if (err instanceof ExportCancelledError) {
      showAlert('Video export cancelled', { type: 'info', title: 'Export' });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      showAlert(`MP4 export failed: ${message}`, { type: 'error', title: 'Export Error' });
    }
  } finally {
    disposeCancelListener();
    disposeProgressListener();
    progressDialog.hide();
    progressDialog.dispose();
    if (session.currentFrame !== originalFrame) {
      session.goToFrame(originalFrame);
    }
  }
}

/**
 * Add current source to playlist
 */
function addCurrentSourceToPlaylist(
  session: Session,
  controls: import('./AppControlRegistry').AppControlRegistry
): void {
  const source = session.currentSource;
  if (!source) {
    showAlert('No source loaded', { type: 'warning', title: 'Cannot Add Clip' });
    return;
  }

  const sourceIndex = session.currentSourceIndex;
  const inPoint = session.inPoint;
  const outPoint = session.outPoint;

  controls.playlistManager.addClip(
    sourceIndex,
    source.name || `Source ${sourceIndex + 1}`,
    inPoint,
    outPoint
  );

  showAlert(`Added "${source.name}" to playlist`, { type: 'success', title: 'Clip Added' });
}

/**
 * Jump to a playlist clip
 */
function jumpToPlaylistClip(
  session: Session,
  controls: import('./AppControlRegistry').AppControlRegistry,
  sourceIndex: number,
  frame: number
): void {
  // Switch to the source if different
  if (session.currentSourceIndex !== sourceIndex) {
    session.setCurrentSource(sourceIndex);
  }

  const mapping = controls.playlistManager.getClipAtFrame(frame);
  if (!mapping) return;

  // In playlist mode, lock playback range to the selected clip's in/out.
  if (controls.playlistManager.isEnabled()) {
    session.setInPoint(mapping.clip.inPoint);
    session.setOutPoint(mapping.clip.outPoint);
  }

  controls.playlistManager.setCurrentFrame(frame);
  session.goToFrame(mapping.localFrame);
}

interface PlaylistRuntimeState {
  syncing: boolean;
  activeClipId: string | null;
  lastFrame: number;
  lastSourceIndex: number;
  previousLoopMode: LoopMode | null;
}

function wirePlaylistRuntime(
  session: Session,
  controls: import('./AppControlRegistry').AppControlRegistry,
): void {
  const runtime: PlaylistRuntimeState = {
    syncing: false,
    activeClipId: null,
    lastFrame: session.currentFrame,
    lastSourceIndex: session.currentSourceIndex,
    previousLoopMode: null,
  };

  controls.playlistManager.on('enabledChanged', ({ enabled }) => {
    if (enabled) {
      if (controls.playlistManager.getClipCount() === 0) {
        controls.playlistManager.setEnabled(false);
        showAlert('Add at least one clip before enabling playlist mode', {
          type: 'warning',
          title: 'Playlist',
        });
        return;
      }

      if (runtime.previousLoopMode === null) {
        runtime.previousLoopMode = session.loopMode;
      }
      // Keep source playback looping at clip boundaries; PlaylistManager owns
      // cross-clip behavior while playlist mode is active.
      session.loopMode = 'loop';

      const currentClip = findClipForSourceFrame(
        controls.playlistManager.getClips(),
        session.currentSourceIndex,
        session.currentFrame,
      );
      const firstClip = controls.playlistManager.getClipByIndex(0);
      const targetGlobalFrame = currentClip
        ? currentClip.clip.globalStartFrame + (session.currentFrame - currentClip.clip.inPoint)
        : firstClip?.globalStartFrame;

      if (targetGlobalFrame !== undefined) {
        runtime.syncing = true;
        syncSessionToPlaylistFrame(session, controls, targetGlobalFrame, runtime);
        runtime.syncing = false;
      }
    } else {
      runtime.activeClipId = null;
      if (runtime.previousLoopMode !== null) {
        session.loopMode = runtime.previousLoopMode;
        runtime.previousLoopMode = null;
      }
      session.resetInOutPoints();
    }

    runtime.lastFrame = session.currentFrame;
    runtime.lastSourceIndex = session.currentSourceIndex;
  });

  controls.playlistManager.on('clipsChanged', () => {
    if (!controls.playlistManager.isEnabled()) return;

    if (controls.playlistManager.getClipCount() === 0) {
      controls.playlistManager.setEnabled(false);
      showAlert('Playlist is empty. Playlist mode was disabled.', {
        type: 'info',
        title: 'Playlist',
      });
      return;
    }

    const totalDuration = controls.playlistManager.getTotalDuration();
    const clampedFrame = Math.max(1, Math.min(controls.playlistManager.getCurrentFrame(), totalDuration));

    runtime.syncing = true;
    syncSessionToPlaylistFrame(session, controls, clampedFrame, runtime);
    runtime.syncing = false;
    runtime.lastFrame = session.currentFrame;
    runtime.lastSourceIndex = session.currentSourceIndex;
  });

  session.on('frameChanged', (frame) => {
    if (!controls.playlistManager.isEnabled() || runtime.syncing) {
      runtime.lastFrame = frame;
      runtime.lastSourceIndex = session.currentSourceIndex;
      return;
    }

    const active = resolveActiveClip(session, controls, runtime);
    if (!active) {
      runtime.lastFrame = frame;
      runtime.lastSourceIndex = session.currentSourceIndex;
      return;
    }

    const direction = session.playDirection >= 0 ? 1 : -1;
    const wrappedForward = direction > 0 &&
      runtime.lastSourceIndex === active.clip.sourceIndex &&
      runtime.lastFrame === active.clip.outPoint &&
      frame === active.clip.inPoint;
    const wrappedBackward = direction < 0 &&
      runtime.lastSourceIndex === active.clip.sourceIndex &&
      runtime.lastFrame === active.clip.inPoint &&
      frame === active.clip.outPoint;

    if (wrappedForward || wrappedBackward) {
      handlePlaylistBoundaryWrap(session, controls, runtime, active, direction);
      runtime.lastFrame = session.currentFrame;
      runtime.lastSourceIndex = session.currentSourceIndex;
      return;
    }

    // Normal in-clip frame advance
    const globalFrame = active.clip.globalStartFrame + (frame - active.clip.inPoint);
    controls.playlistManager.setCurrentFrame(globalFrame);

    runtime.lastFrame = frame;
    runtime.lastSourceIndex = session.currentSourceIndex;
  });
}

function handlePlaylistBoundaryWrap(
  session: Session,
  controls: import('./AppControlRegistry').AppControlRegistry,
  runtime: PlaylistRuntimeState,
  active: { clip: PlaylistClip; index: number },
  direction: 1 | -1,
): void {
  const clip = active.clip;
  const edgeGlobal = direction > 0
    ? clip.globalStartFrame + clip.duration - 1
    : clip.globalStartFrame;

  controls.playlistManager.setCurrentFrame(edgeGlobal);

  const loopMode = controls.playlistManager.getLoopMode();
  const atPlaylistEdge = direction > 0
    ? active.index === controls.playlistManager.getClipCount() - 1
    : active.index === 0;

  // No-loop edge: undo source-level wrap and stop on boundary.
  if (loopMode === 'none' && atPlaylistEdge) {
    runtime.syncing = true;
    if (direction > 0) {
      controls.playlistManager.getNextFrame(edgeGlobal); // Emits playlistEnded
      session.pause();
      session.goToFrame(clip.outPoint);
    } else {
      session.pause();
      session.goToFrame(clip.inPoint);
    }
    runtime.syncing = false;
    return;
  }

  const next = direction < 0 && loopMode === 'single'
    ? { frame: clip.globalStartFrame + clip.duration - 1, clipChanged: false }
    : (direction > 0
      ? controls.playlistManager.getNextFrame(edgeGlobal)
      : controls.playlistManager.getPreviousFrame(edgeGlobal));

  if (next.clipChanged) {
    runtime.syncing = true;
    syncSessionToPlaylistFrame(session, controls, next.frame, runtime);
    runtime.syncing = false;
  } else {
    controls.playlistManager.setCurrentFrame(next.frame);
  }
}

function resolveActiveClip(
  session: Session,
  controls: import('./AppControlRegistry').AppControlRegistry,
  runtime: PlaylistRuntimeState,
): { clip: PlaylistClip; index: number } | null {
  if (runtime.activeClipId) {
    const clip = controls.playlistManager.getClip(runtime.activeClipId);
    if (clip &&
        clip.sourceIndex === session.currentSourceIndex &&
        session.currentFrame >= clip.inPoint &&
        session.currentFrame <= clip.outPoint) {
      const index = controls.playlistManager.getClips().findIndex(c => c.id === clip.id);
      if (index >= 0) return { clip, index };
    }
  }

  const currentMapping = controls.playlistManager.getClipAtFrame(controls.playlistManager.getCurrentFrame());
  if (currentMapping &&
      currentMapping.sourceIndex === session.currentSourceIndex &&
      session.currentFrame >= currentMapping.clip.inPoint &&
      session.currentFrame <= currentMapping.clip.outPoint) {
    runtime.activeClipId = currentMapping.clip.id;
    return { clip: currentMapping.clip, index: currentMapping.clipIndex };
  }

  const resolved = findClipForSourceFrame(
    controls.playlistManager.getClips(),
    session.currentSourceIndex,
    session.currentFrame,
  );
  if (!resolved) return null;

  const globalFrame = resolved.clip.globalStartFrame + (session.currentFrame - resolved.clip.inPoint);
  controls.playlistManager.setCurrentFrame(globalFrame);
  runtime.activeClipId = resolved.clip.id;
  return resolved;
}

function findClipForSourceFrame(
  clips: PlaylistClip[],
  sourceIndex: number,
  localFrame: number,
): { clip: PlaylistClip; index: number } | null {
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (!clip) continue;
    if (clip.sourceIndex !== sourceIndex) continue;
    if (localFrame < clip.inPoint || localFrame > clip.outPoint) continue;
    return { clip, index: i };
  }
  return null;
}

function syncSessionToPlaylistFrame(
  session: Session,
  controls: import('./AppControlRegistry').AppControlRegistry,
  globalFrame: number,
  runtime: PlaylistRuntimeState,
): boolean {
  const mapping = controls.playlistManager.getClipAtFrame(globalFrame);
  if (!mapping) return false;

  if (session.currentSourceIndex !== mapping.sourceIndex) {
    session.setCurrentSource(mapping.sourceIndex);
  }
  session.setInPoint(mapping.clip.inPoint);
  session.setOutPoint(mapping.clip.outPoint);
  session.goToFrame(mapping.localFrame);

  controls.playlistManager.setCurrentFrame(globalFrame);
  runtime.activeClipId = mapping.clip.id;
  return true;
}
