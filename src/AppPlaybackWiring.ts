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

import type { AppWiringContext, WiringResult } from './AppWiringContext';
import type { AppKeyboardHandler } from './AppKeyboardHandler';
import type { FullscreenManager } from './utils/ui/FullscreenManager';
import type { Session } from './core/session/Session';
import type { LoopMode } from './core/types/session';
import type { PlaylistClip } from './core/session/PlaylistManager';
import type { PlaylistTransitionFrame } from './core/types/transition';
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
import { showAlert, showAnnotationImportDialog, showModal } from './ui/components/shared/Modal';
import { showToast } from './ui/components/shared/Toast';
import { createButton } from './ui/components/shared/Button';
import { PANEL_WIDTHS } from './ui/components/shared/theme';
import { generateSlateFrame } from './export/SlateRenderer';
import { generateReport } from './export/ReportExporter';
import {
  downloadAnnotationsJSON,
  parseAnnotationsJSON,
  applyAnnotationsJSON,
} from './utils/export/AnnotationJSONExporter';
import { exportAnnotationsPDF } from './utils/export/AnnotationPDFExporter';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';
import { isAudioScrubAvailable } from './utils/media/SourceUIState';

/**
 * External references that the playback wiring needs but are not part of
 * the standard AppWiringContext (they are initialized at different times).
 */
export interface PlaybackWiringDeps {
  getKeyboardHandler: () => AppKeyboardHandler;
  getFullscreenManager: () => FullscreenManager | undefined;
  /** Read-only shortcut cheat sheet overlay (Help > Keyboard Shortcuts). */
  getShortcutCheatSheet?: () => { show(): void } | null;
}

/**
 * Wire all playback-related controls (headerbar, volume, export, snapshots, playlists).
 */
export function wirePlaybackControls(ctx: AppWiringContext, deps: PlaybackWiringDeps): WiringResult {
  const { session, viewer, headerBar, controls, persistenceManager } = ctx;
  const subs = new DisposableSubscriptionManager();
  let videoExportInProgress = false;

  // HeaderBar events
  // Help > Keyboard Shortcuts opens the read-only cheat sheet (same as `?`);
  // Help > Custom Key Bindings opens the rebinding editor. Fall back to the
  // editor only when the cheat sheet is not available (e.g. before layout).
  subs.add(
    headerBar.on('showShortcuts', () => {
      const sheet = deps.getShortcutCheatSheet?.() ?? null;
      if (sheet) {
        sheet.show();
      } else {
        deps.getKeyboardHandler().showCustomBindingsDialog();
      }
    }),
  );
  subs.add(headerBar.on('showCustomKeyBindings', () => deps.getKeyboardHandler().showCustomBindingsDialog()));
  subs.add(headerBar.on('saveProject', () => persistenceManager.saveProject()));
  subs.add(
    headerBar.on('openProject', ({ file, availableFiles }) => persistenceManager.openProject(file, availableFiles)),
  );

  // Wire auto-checkpoint before media file drops (only fires when sources already exist)
  viewer.setOnBeforeMediaLoad(() => persistenceManager.checkpointBeforeMediaLoad());

  // AutoSave Indicator
  controls.autoSaveIndicator.connect(controls.autoSaveManager);
  controls.autoSaveIndicator.setRetryCallback(() => persistenceManager.retryAutoSave());
  headerBar.setAutoSaveIndicator(controls.autoSaveIndicator.render());

  // Wire up fullscreen and presentation toggle from HeaderBar
  subs.add(
    headerBar.on('fullscreenToggle', () => {
      deps.getFullscreenManager()?.toggle();
    }),
  );
  subs.add(
    headerBar.on('presentationToggle', () => {
      controls.presentationMode.toggle();
    }),
  );

  // Volume control (from HeaderBar) <-> session (bidirectional)
  const volumeControl = headerBar.getVolumeControl();
  subs.add(
    volumeControl.on('volumeChanged', (volume) => {
      session.volume = volume;
    }),
  );
  subs.add(
    volumeControl.on('mutedChanged', (muted) => {
      session.muted = muted;
    }),
  );
  // Audio scrub toggle
  subs.add(
    volumeControl.on('audioScrubChanged', (enabled) => {
      session.audioScrubEnabled = enabled;
    }),
  );
  // Sync back from Session to VolumeControl (for external changes)
  subs.add(
    session.on('volumeChanged', (volume) => {
      volumeControl.syncVolume(volume);
    }),
  );
  subs.add(
    session.on('mutedChanged', (muted) => {
      volumeControl.syncMuted(muted);
    }),
  );
  subs.add(
    session.on('audioScrubEnabledChanged', (enabled) => {
      volumeControl.syncAudioScrub(enabled);
    }),
  );

  const syncAudioScrubAvailability = () => {
    volumeControl.setScrubAudioAvailable(isAudioScrubAvailable(session.currentSource, session.audioPlaybackManager));
  };
  syncAudioScrubAvailability();
  subs.add(session.on('sourceLoaded', syncAudioScrubAvailability));
  subs.add(session.on('durationChanged', syncAudioScrubAvailability));
  subs.add(session.on('representationChanged', syncAudioScrubAvailability));
  subs.add(session.on('audioScrubAvailabilityChanged', syncAudioScrubAvailability));

  // Surface representation errors and fallback activations to the user
  subs.add(
    session.on('representationError', ({ error, userInitiated }) => {
      showAlert(`Representation failed: ${error}`, {
        type: userInitiated ? 'error' : 'warning',
        title: 'Representation Error',
      });
    }),
  );
  subs.add(
    session.on('fallbackActivated', ({ fallbackRepresentation }) => {
      showToast(`Switched to fallback representation: ${fallbackRepresentation.label}`, { type: 'info' });
    }),
  );

  // Export control (from HeaderBar) -> viewer
  const exportControl = headerBar.getExportControl();
  subs.add(
    exportControl.on('exportRequested', ({ format, includeAnnotations, quality }) => {
      viewer.exportFrame(format, includeAnnotations, quality);
    }),
  );
  subs.add(
    exportControl.on('sourceExportRequested', ({ format, quality }) => {
      viewer.exportSourceFrame(format, quality);
    }),
  );
  subs.add(
    exportControl.on('copyRequested', () => {
      viewer.copyFrameToClipboard(true);
    }),
  );
  subs.add(
    exportControl.on('sequenceExportRequested', (request) => {
      handleSequenceExport(session, viewer, request);
    }),
  );
  subs.add(
    exportControl.on('videoExportRequested', (request) => {
      if (videoExportInProgress) {
        showAlert('A video export is already in progress', { type: 'warning', title: 'Export Busy' });
        return;
      }
      videoExportInProgress = true;
      void handleVideoExport(session, viewer, request, controls).finally(() => {
        videoExportInProgress = false;
      });
    }),
  );
  subs.add(
    exportControl.on('rvSessionExportRequested', ({ format }) => {
      persistenceManager.saveRvSession(format);
    }),
  );
  subs.add(
    exportControl.on('annotationsJSONExportRequested', () => {
      const sourceName = session.currentSource?.name?.replace(/\.[^/.]+$/, '') ?? 'annotations';
      downloadAnnotationsJSON(ctx.paintEngine, sourceName);
    }),
  );
  subs.add(
    exportControl.on('annotationsJSONImportRequested', () => {
      void handleAnnotationImport(ctx.paintEngine, persistenceManager);
    }),
  );
  subs.add(
    exportControl.on('annotationsPDFExportRequested', () => {
      void exportAnnotationsPDF(
        ctx.paintEngine,
        session,
        async (frame: number) => {
          const canvas = await viewer.renderFrameToCanvas(frame, true);
          if (!canvas) {
            throw new Error(`Failed to render frame ${frame}`);
          }
          return canvas;
        },
        { title: session.metadata?.displayName || 'Annotation Report' },
      );
    }),
  );
  subs.add(
    exportControl.on('reportExportRequested', ({ format }) => {
      // When a playlist is active with clips, scope the report to the playlist
      const playlistManager = controls.playlistManager;
      const playlist =
        playlistManager.isEnabled() && playlistManager.getClipCount() > 0
          ? { clips: playlistManager.getClips().map((c) => ({ sourceIndex: c.sourceIndex, sourceName: c.sourceName })) }
          : undefined;

      generateReport(
        session,
        session.noteManager,
        session.statusManager,
        session.versionManager,
        {
          format,
          includeNotes: true,
          includeTimecodes: true,
          includeVersions: true,
          title: session.metadata.displayName || 'Dailies Report',
          sessionDate: new Date().toISOString(),
          projectId: session.metadata?.displayName || undefined,
        },
        playlist,
      );
    }),
  );

  // Snapshot panel create + restore
  subs.add(
    controls.snapshotPanel.on('createRequested', ({ name, description }) => {
      void persistenceManager.createSnapshot(name, description);
    }),
  );
  subs.add(controls.snapshotPanel.on('restoreRequested', ({ id }) => persistenceManager.restoreSnapshot(id)));
  subs.add(
    controls.snapshotPanel.on('descriptionUpdated', ({ snapshotId, description }) =>
      controls.snapshotManager.updateDescription(snapshotId, description),
    ),
  );

  // Note panel events
  subs.add(
    controls.notePanel.on('noteSelected', ({ frame }) => {
      session.goToFrame(frame);
    }),
  );

  // Playlist panel events
  subs.add(controls.playlistPanel.on('addCurrentSource', () => addCurrentSourceToPlaylist(session, controls)));
  subs.add(
    controls.playlistPanel.on('clipSelected', ({ sourceIndex, frame }) => {
      jumpToPlaylistClip(session, controls, sourceIndex, frame);
    }),
  );

  // Editorial import: report clips that could not be matched to loaded media.
  subs.add(
    controls.playlistPanel.on('imported', (result) => {
      void reportPlaylistImport(result);
    }),
  );

  // Route .otio files from the header file picker / viewer drop to the playlist import,
  // and the Export menu's EDL/OTIO items to the playlist exporters.
  headerBar.onOTIOFileOpen = (file) => controls.playlistPanel.importOTIOFile(file);
  viewer.setOnOTIOFileDrop((file) => controls.playlistPanel.importOTIOFile(file));
  subs.add(exportControl.on('edlExportRequested', () => controls.playlistPanel.triggerEDLExport()));
  subs.add(exportControl.on('otioExportRequested', () => controls.playlistPanel.triggerOTIOExport()));

  // Set initial fps and keep playlist panel in sync with session fps
  controls.playlistPanel.setFps(session.fps || 24);
  subs.add(session.on('fpsChanged', (fps) => controls.playlistPanel.setFps(fps)));

  // Playlist runtime integration (playback/loop/source switching while enabled)
  wirePlaylistRuntime(session, controls, subs, viewer);

  return { subscriptions: subs };
}

/** Maximum number of unresolved clip names listed in the import report. */
const MAX_UNRESOLVED_LISTED = 15;

/**
 * Tell the user which imported clips could not be matched to loaded media.
 * Exported for tests.
 */
export async function reportPlaylistImport(result: {
  format: string;
  importedCount: number;
  unresolvedCount: number;
  unresolvedNames?: string[];
}): Promise<void> {
  if (result.unresolvedCount <= 0 && result.importedCount > 0) return;
  const format = result.format.toUpperCase();
  if (result.unresolvedCount <= 0) {
    await showAlert(`No clips were imported from the ${format} file.`, {
      type: 'warning',
      title: 'Playlist Import',
    });
    return;
  }
  const names = result.unresolvedNames ?? [];
  const listed = names.slice(0, MAX_UNRESOLVED_LISTED).map((n) => `\u2022 ${n}`);
  if (names.length > MAX_UNRESOLVED_LISTED) listed.push(`\u2026 and ${names.length - MAX_UNRESOLVED_LISTED} more`);
  const message =
    `Imported ${result.importedCount} clip(s) from the ${format} file. ` +
    `${result.unresolvedCount} clip(s) could not be matched to loaded media` +
    (listed.length > 0 ? `:\n${listed.join('\n')}` : '.') +
    `\n\nLoad the missing media and import again, or re-link the clips in the Conform panel.`;
  await showAlert(message, { type: 'warning', title: 'Unresolved Clips' });
}

/**
 * Handle annotation JSON import with options dialog (mode and frame offset).
 */
async function handleAnnotationImport(
  paintEngine: import('./paint/PaintEngine').PaintEngine,
  persistenceManager?: import('./AppPersistenceManager').AppPersistenceManager,
): Promise<void> {
  // Show import options dialog first
  const importOptions = await showAnnotationImportDialog({ title: 'Import Annotations' });
  if (!importOptions) return; // User cancelled

  // Create file input and trigger file selection
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';

  const file = await new Promise<File | null>((resolve) => {
    fileInput.addEventListener('change', () => {
      resolve(fileInput.files?.[0] ?? null);
    });
    // Handle cancel (focus returns to window without a change event)
    window.addEventListener(
      'focus',
      () => {
        // Delay to let the change event fire first if a file was selected
        setTimeout(() => {
          if (!fileInput.files?.length) resolve(null);
        }, 300);
      },
      { once: true },
    );
    fileInput.click();
  });

  if (!file) return; // User cancelled file selection

  try {
    const jsonString = await file.text();
    const data = parseAnnotationsJSON(jsonString);
    if (!data) {
      showAlert('Invalid annotation file. The file must be a valid OpenRV annotation JSON export.', {
        type: 'error',
        title: 'Import Error',
      });
      return;
    }

    // Create auto-checkpoint before replacing annotations (destructive)
    if (importOptions.mode === 'replace' && persistenceManager) {
      await persistenceManager.checkpointBeforeClearAnnotations();
    }

    const count = applyAnnotationsJSON(paintEngine, data, {
      mode: importOptions.mode,
      frameOffset: importOptions.frameOffset,
    });

    const modeVerb = importOptions.mode === 'merge' ? 'merged' : 'replaced';
    const offsetNote = importOptions.frameOffset !== 0 ? ` (frame offset: ${importOptions.frameOffset})` : '';
    showToast(`Successfully ${modeVerb} annotations. ${count} annotation(s) imported${offsetNote}.`, {
      type: 'success',
    });
  } catch {
    showAlert('Failed to read the annotation file.', {
      type: 'error',
      title: 'Import Error',
    });
  }
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
  },
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

  // Build progress dialog body. The Modal wrapper owns the backdrop, focus
  // trap, ARIA attributes, and z-index — we only supply the content.
  const cancellationToken = { cancelled: false };

  const progressBody = document.createElement('div');
  progressBody.style.cssText = `min-width: ${PANEL_WIDTHS.panel};`;

  const progressText = document.createElement('div');
  progressText.setAttribute('role', 'status');
  progressText.setAttribute('aria-live', 'polite');
  progressText.style.cssText = 'color: var(--text-primary); margin-bottom: 12px; font-size: 14px;';
  progressText.textContent = `Exporting frames 0/${totalFrames}...`;

  const progressBar = document.createElement('div');
  progressBar.setAttribute('role', 'progressbar');
  progressBar.setAttribute('aria-valuemin', '0');
  progressBar.setAttribute('aria-valuemax', '100');
  progressBar.setAttribute('aria-valuenow', '0');
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

  const cancelButton = createButton(
    'Cancel',
    () => {
      cancellationToken.cancelled = true;
      cancelButton.textContent = 'Cancelling...';
      cancelButton.disabled = true;
    },
    { variant: 'default', minWidth: '100%' },
  );
  cancelButton.style.width = '100%';

  progressBody.appendChild(progressText);
  progressBody.appendChild(progressBar);
  progressBody.appendChild(cancelButton);

  // closable: false — only the Cancel button can dismiss the dialog. This
  // preserves the legacy behavior where Escape did nothing during export and
  // ensures the export task can drive teardown explicitly when it finishes.
  const modalHandle = showModal(progressBody, {
    title: 'Export Frames',
    closable: false,
    width: PANEL_WIDTHS.wideMedium,
  });

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
        await new Promise((resolve) => setTimeout(resolve, 50));
        const canvas = await viewer.renderFrameToCanvas(frame, request.includeAnnotations);
        if (!canvas) {
          throw new Error(`Failed to render frame ${frame}`);
        }
        return canvas;
      },
      (progress) => {
        progressText.textContent = `Exporting frames ${progress.currentFrame - startFrame + 1}/${totalFrames}...`;
        progressFill.style.width = `${progress.percent}%`;
        progressBar.setAttribute('aria-valuenow', String(Math.round(progress.percent)));
      },
      cancellationToken,
    );

    // Restore original frame
    session.goToFrame(originalFrame);

    // Close progress dialog
    modalHandle.close();

    // Show result
    if (result.success) {
      showToast(`Successfully exported ${result.exportedFrames} frames`, { type: 'success' });
    } else if (result.error?.includes('cancelled')) {
      showToast('Export cancelled', { type: 'info' });
    } else {
      showAlert(`Export failed: ${result.error}`, { type: 'error', title: 'Export Error' });
    }
  } catch (err) {
    // Restore original frame
    session.goToFrame(originalFrame);

    // Close progress dialog
    modalHandle.close();

    showAlert(`Export error: ${err}`, { type: 'error', title: 'Export Error' });
  }
}

function resolveFrameRange(
  session: Session,
  useInOutRange: boolean,
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

function normalizeCanvasSize(canvas: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement | null {
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
      },
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
    showToast(`Exported ${result.totalFrames} frames to ${filename}`, { type: 'success' });
  } catch (err) {
    if (err instanceof ExportCancelledError) {
      showToast('Video export cancelled', { type: 'info' });
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
  controls: import('./AppControlRegistry').AppControlRegistry,
): void {
  const source = session.currentSource;
  if (!source) {
    showAlert('No source loaded', { type: 'warning', title: 'Cannot Add Clip' });
    return;
  }

  const sourceIndex = session.currentSourceIndex;
  const inPoint = session.inPoint;
  const outPoint = session.outPoint;

  controls.playlistManager.addClip(sourceIndex, source.name || `Source ${sourceIndex + 1}`, inPoint, outPoint);

  showToast(`Added "${source.name}" to playlist`, { type: 'success' });
}

/**
 * Jump to a playlist clip
 */
function jumpToPlaylistClip(
  session: Session,
  controls: import('./AppControlRegistry').AppControlRegistry,
  sourceIndex: number,
  frame: number,
): void {
  // Switch to the source if different
  if (session.currentSourceIndex !== sourceIndex) {
    session.setCurrentSource(sourceIndex);
  }

  const mapping = controls.playlistManager.getClipAtFrame(frame);
  if (!mapping) return;

  // In playlist mode, lock playback range to the selected clip's in/out.
  if (controls.playlistManager.isEnabled()) {
    session.setInOutRange(mapping.clip.inPoint, mapping.clip.outPoint);
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
  subs: DisposableSubscriptionManager,
  viewer: Pick<import('./ui/components/Viewer').Viewer, 'setPlaylistTransitionProvider'>,
): void {
  const runtime: PlaylistRuntimeState = {
    syncing: false,
    activeClipId: null,
    lastFrame: session.currentFrame,
    lastSourceIndex: session.currentSourceIndex,
    previousLoopMode: null,
  };

  // Let the viewer blend the outgoing clip under the incoming one while the
  // playhead is inside a transition overlap.
  viewer.setPlaylistTransitionProvider(() => resolvePlaylistTransitionFrame(session, controls, runtime));
  subs.add(() => viewer.setPlaylistTransitionProvider(null));

  subs.add(
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
    }),
  );

  subs.add(
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
    }),
  );

  subs.add(
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
      const wrappedForward =
        direction > 0 &&
        runtime.lastSourceIndex === active.clip.sourceIndex &&
        runtime.lastFrame === active.clip.outPoint &&
        frame === active.clip.inPoint;
      const wrappedBackward =
        direction < 0 &&
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

      // Entering a transition overlap: the incoming clip owns the overlap, so
      // hand playback over to it here (before the outgoing clip reaches its
      // out point). The outgoing clip keeps contributing through the viewer's
      // transition blend.
      // In 'single' loop mode the active clip keeps playback (no hand-over).
      const owner =
        controls.playlistManager.getLoopMode() === 'single'
          ? null
          : controls.playlistManager.getClipAtFrame(globalFrame);
      if (owner && owner.clip.id !== active.clip.id) {
        runtime.syncing = true;
        syncSessionToPlaylistFrame(session, controls, globalFrame, runtime);
        runtime.syncing = false;
        runtime.lastFrame = session.currentFrame;
        runtime.lastSourceIndex = session.currentSourceIndex;
        return;
      }

      controls.playlistManager.setCurrentFrame(globalFrame);

      runtime.lastFrame = frame;
      runtime.lastSourceIndex = session.currentSourceIndex;
    }),
  );
}

function handlePlaylistBoundaryWrap(
  session: Session,
  controls: import('./AppControlRegistry').AppControlRegistry,
  runtime: PlaylistRuntimeState,
  active: { clip: PlaylistClip; index: number },
  direction: 1 | -1,
): void {
  const clip = active.clip;
  const edgeGlobal = direction > 0 ? clip.globalStartFrame + clip.duration - 1 : clip.globalStartFrame;

  controls.playlistManager.setCurrentFrame(edgeGlobal);

  // Transition overlaps need no special casing here: forward playback hands
  // over to the incoming clip when it enters the overlap (see the
  // frameChanged handler), and backward playback out of the incoming clip's
  // first frame lands in the outgoing clip via getPreviousFrame().
  const loopMode = controls.playlistManager.getLoopMode();
  const atPlaylistEdge =
    direction > 0 ? active.index === controls.playlistManager.getClipCount() - 1 : active.index === 0;

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

  // 'single' loops the active clip in both directions. Resolve it from the
  // clip itself rather than getNextFrame(): with a transition the clip's last
  // frame is owned by the incoming clip, so a global lookup would leave it.
  const next =
    loopMode === 'single'
      ? {
          frame: direction > 0 ? clip.globalStartFrame : clip.globalStartFrame + clip.duration - 1,
          clipChanged: false,
        }
      : direction > 0
        ? controls.playlistManager.getNextFrame(edgeGlobal)
        : controls.playlistManager.getPreviousFrame(edgeGlobal);

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
    if (
      clip &&
      clip.sourceIndex === session.currentSourceIndex &&
      session.currentFrame >= clip.inPoint &&
      session.currentFrame <= clip.outPoint
    ) {
      const index = controls.playlistManager.getClips().findIndex((c) => c.id === clip.id);
      if (index >= 0) return { clip, index };
    }
  }

  const currentMapping = controls.playlistManager.getClipAtFrame(controls.playlistManager.getCurrentFrame());
  if (
    currentMapping &&
    currentMapping.sourceIndex === session.currentSourceIndex &&
    session.currentFrame >= currentMapping.clip.inPoint &&
    session.currentFrame <= currentMapping.clip.outPoint
  ) {
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

/**
 * Describe the transition blend for the frame the session is showing, or
 * null when no blend is needed. Only blends while the session is on the
 * incoming clip of a transition overlap (the clip that owns playback there).
 */
export function resolvePlaylistTransitionFrame(
  session: Pick<Session, 'currentSourceIndex' | 'currentFrame'>,
  controls: Pick<import('./AppControlRegistry').AppControlRegistry, 'playlistManager'>,
  runtime: Pick<PlaylistRuntimeState, 'activeClipId'>,
): PlaylistTransitionFrame | null {
  const pm = controls.playlistManager;
  if (!pm.isEnabled() || pm.getLoopMode() === 'single' || !runtime.activeClipId) return null;

  const active = pm.getClip(runtime.activeClipId);
  if (!active || active.sourceIndex !== session.currentSourceIndex) return null;
  const localFrame = session.currentFrame;
  if (localFrame < active.inPoint || localFrame > active.outPoint) return null;

  const globalFrame = active.globalStartFrame + (localFrame - active.inPoint);
  const info = pm.getTransitionAtFrame(globalFrame);
  if (!info || !info.isInTransition || info.transitionType === 'cut') return null;

  const incoming = pm.getClipByIndex(info.incomingClipIndex);
  const outgoing = pm.getClipByIndex(info.outgoingClipIndex);
  if (!incoming || !outgoing || incoming.id !== active.id) return null;

  return {
    transitionType: info.transitionType,
    progress: info.progress,
    outgoingSourceIndex: outgoing.sourceIndex,
    outgoingFrame: info.outgoingLocalFrame,
  };
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
  session.setInOutRange(mapping.clip.inPoint, mapping.clip.outPoint);
  session.goToFrame(mapping.localFrame);

  controls.playlistManager.setCurrentFrame(globalFrame);
  runtime.activeClipId = mapping.clip.id;
  return true;
}
