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
import type { Session } from './core/session/Session';
import { exportSequence } from './utils/export/SequenceExporter';
import { showAlert } from './ui/components/shared/Modal';

/**
 * External references that the playback wiring needs but are not part of
 * the standard AppWiringContext (they are initialized at different times).
 */
export interface PlaybackWiringDeps {
  getKeyboardHandler: () => AppKeyboardHandler;
  getFullscreenManager: () => FullscreenManager | undefined;
}

/**
 * Wire all playback-related controls (headerbar, volume, export, snapshots, playlists).
 */
export function wirePlaybackControls(ctx: AppWiringContext, deps: PlaybackWiringDeps): void {
  const { session, viewer, headerBar, controls, persistenceManager } = ctx;

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
  });
  volumeControl.on('mutedChanged', (muted) => {
    session.muted = muted;
  });
  // Sync back from Session to VolumeControl (for external changes)
  session.on('volumeChanged', (volume) => {
    volumeControl.syncVolume(volume);
  });
  session.on('mutedChanged', (muted) => {
    volumeControl.syncMuted(muted);
  });

  // Export control (from HeaderBar) -> viewer
  const exportControl = headerBar.getExportControl();
  exportControl.on('exportRequested', ({ format, includeAnnotations, quality }) => {
    viewer.exportFrame(format, includeAnnotations, quality);
  });
  exportControl.on('copyRequested', () => {
    viewer.copyFrameToClipboard(true);
  });
  exportControl.on('sequenceExportRequested', (request) => {
    handleSequenceExport(session, viewer, request);
  });
  exportControl.on('rvSessionExportRequested', ({ format }) => {
    persistenceManager.saveRvSession(format);
  });

  // Snapshot panel restore
  controls.snapshotPanel.on('restoreRequested', ({ id }) => persistenceManager.restoreSnapshot(id));

  // Playlist panel events
  controls.playlistPanel.on('addCurrentSource', () => addCurrentSourceToPlaylist(session, controls));
  controls.playlistPanel.on('clipSelected', ({ sourceIndex, frame }) => {
    jumpToPlaylistClip(session, controls, sourceIndex, frame);
  });
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
    startFrame = 0;
    endFrame = session.frameCount - 1;
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

  // If playlist mode is enabled, use global frame
  if (controls.playlistManager.isEnabled()) {
    controls.playlistManager.setCurrentFrame(frame);
    const mapping = controls.playlistManager.getClipAtFrame(frame);
    if (mapping) {
      session.currentFrame = mapping.localFrame;
    }
  }
}
