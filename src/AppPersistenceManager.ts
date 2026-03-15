/**
 * AppPersistenceManager - Extracts session save/load, auto-save, snapshot,
 * and GTO sync logic from App.
 *
 * Manages all persistence-related operations including auto-save,
 * snapshots, project save/load, and GTO store synchronization.
 */

import type { Session } from './core/session/Session';
import type { Viewer } from './ui/components/Viewer';
import type { PaintEngine } from './paint/PaintEngine';
import { SessionSerializer } from './core/session/SessionSerializer';
import { SessionGTOExporter } from './core/session/SessionGTOExporter';
import type { SessionGTOStore } from './core/session/SessionGTOStore';
import type { AutoSaveManager } from './core/session/AutoSaveManager';
import type { AutoSaveIndicator } from './ui/components/AutoSaveIndicator';
import type { SnapshotManager } from './core/session/SnapshotManager';
import type { SnapshotPanel } from './ui/components/SnapshotPanel';
import type { ScopesControl } from './ui/components/ScopesControl';
import type { ColorControls } from './ui/components/ColorControls';
import type { CDLControl } from './ui/components/CDLControl';
import type { FilterControl } from './ui/components/FilterControl';
import type { TransformControl } from './ui/components/TransformControl';
import type { CropControl } from './ui/components/CropControl';
import type { LensControl } from './ui/components/LensControl';
import type { NoiseReductionControl } from './ui/components/NoiseReductionControl';
import type { WatermarkControl } from './ui/components/WatermarkControl';
import type { PlaylistManager } from './core/session/PlaylistManager';
import type { MediaCacheManager } from './cache/MediaCacheManager';
import { showAlert, showConfirm } from './ui/components/shared/Modal';

/**
 * Context interface for dependencies needed by the persistence manager.
 */
export interface PersistenceManagerContext {
  session: Session;
  viewer: Viewer;
  paintEngine: PaintEngine;
  autoSaveManager: AutoSaveManager;
  autoSaveIndicator: AutoSaveIndicator;
  snapshotManager: SnapshotManager;
  snapshotPanel: SnapshotPanel;
  scopesControl: ScopesControl;
  colorControls: ColorControls;
  cdlControl: CDLControl;
  filterControl: FilterControl;
  transformControl: TransformControl;
  cropControl: CropControl;
  lensControl: LensControl;
  noiseReductionControl?: NoiseReductionControl;
  watermarkControl?: WatermarkControl;
  playlistManager?: PlaylistManager;
  cacheManager?: MediaCacheManager;
  parControl?: { setState: (state: any) => void };
  backgroundPatternControl?: { setState: (state: any) => void };
}

export class AppPersistenceManager {
  private ctx: PersistenceManagerContext;
  private gtoStore: SessionGTOStore | null = null;

  constructor(ctx: PersistenceManagerContext) {
    this.ctx = ctx;
  }

  /**
   * Get the current GTO store (may be null)
   */
  getGTOStore(): SessionGTOStore | null {
    return this.gtoStore;
  }

  /**
   * Set the GTO store (called when session loads GTO data)
   */
  setGTOStore(store: SessionGTOStore | null): void {
    this.gtoStore = store;
  }

  /**
   * Initialize auto-save and snapshots.
   * Should be called after mount.
   */
  async init(): Promise<void> {
    await this.initAutoSave();
    await this.initSnapshots();
  }

  /**
   * Sync the GTO store with current application state
   */
  syncGTOStore(): void {
    if (!this.gtoStore) return;
    this.gtoStore.updateFromState({
      session: this.ctx.session,
      viewer: this.ctx.viewer,
      paintEngine: this.ctx.paintEngine,
      scopesState: this.ctx.scopesControl.getState(),
    });

    // Mark session as dirty for auto-save
    this.markAutoSaveDirty();
  }

  /**
   * Derive a session label from displayName, source name, or 'Untitled'.
   */
  private getSessionLabel(): string {
    const { session } = this.ctx;
    const displayName = (session as any).metadata?.displayName;
    if (displayName) return displayName;
    return session.currentSource?.name || 'Untitled';
  }

  /**
   * Mark the session as having unsaved changes for auto-save.
   * Uses lazy evaluation - state is only serialized when actually saving.
   */
  markAutoSaveDirty(): void {
    const { session, paintEngine, viewer, autoSaveManager, autoSaveIndicator } = this.ctx;
    // Pass a getter function for lazy evaluation - serialization only happens when saving
    autoSaveManager.markDirty(() =>
      SessionSerializer.toJSON(
        {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        },
        this.getSessionLabel(),
      ),
    );
    autoSaveIndicator.markUnsaved();
  }

  /**
   * Retry auto-save after a failure
   */
  retryAutoSave(): void {
    const { session, paintEngine, viewer, autoSaveManager } = this.ctx;
    try {
      const state = SessionSerializer.toJSON(
        {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        },
        this.getSessionLabel(),
      );
      autoSaveManager.saveNow(state);
    } catch (err) {
      console.error('Failed to retry auto-save:', err);
    }
  }

  /**
   * Create a snapshot with an optional user-provided name and description.
   * Falls back to an auto-generated timestamp name when no name is given.
   */
  async createSnapshot(name?: string, description?: string): Promise<void> {
    const { session, paintEngine, viewer, snapshotManager } = this.ctx;
    try {
      const state = SessionSerializer.toJSON(
        {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        },
        this.getSessionLabel(),
      );
      const resolvedName = name || `Snapshot ${new Date().toLocaleTimeString()}`;
      await snapshotManager.createSnapshot(resolvedName, state, description);
      showAlert(`Snapshot "${resolvedName}" created`, { type: 'success', title: 'Snapshot Created' });
    } catch (err) {
      console.error('Failed to create snapshot:', err);
      showAlert(`Failed to create snapshot: ${err}`, { type: 'error', title: 'Snapshot Error' });
    }
  }

  /**
   * Create a quick snapshot with auto-generated name (keyboard shortcut convenience)
   */
  async createQuickSnapshot(): Promise<void> {
    return this.createSnapshot();
  }

  /**
   * Create an auto-checkpoint before major operations.
   * Returns true on success, false on failure.
   */
  async createAutoCheckpoint(event: string): Promise<boolean> {
    const { session, paintEngine, viewer, snapshotManager } = this.ctx;
    try {
      const state = SessionSerializer.toJSON(
        {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        },
        this.getSessionLabel(),
      );
      await snapshotManager.createAutoCheckpoint(event, state);
      return true;
    } catch (err) {
      console.error('Failed to create auto-checkpoint:', err);
      return false;
    }
  }

  /**
   * Sync UI controls from a restored session state.
   * Handles PAR and background pattern controls in addition to
   * the standard color/CDL/filter/transform/crop/lens controls.
   */
  private syncControlsFromState(state: any): void {
    const {
      colorControls,
      cdlControl,
      filterControl,
      transformControl,
      cropControl,
      lensControl,
      noiseReductionControl,
      watermarkControl,
      parControl,
      backgroundPatternControl,
    } = this.ctx;

    if (state.color) colorControls.setAdjustments(state.color);
    if (state.cdl) cdlControl.setCDL(state.cdl);
    if (state.filters) filterControl.setSettings(state.filters);
    if (state.transform) transformControl.setTransform(state.transform);
    if (state.crop) cropControl.setState(state.crop);
    if (state.lens) lensControl.setParams(state.lens);
    if (state.noiseReduction && noiseReductionControl) noiseReductionControl.setParams(state.noiseReduction);
    if (state.watermark && watermarkControl) watermarkControl.setState(state.watermark);
    if (state.par && parControl) parControl.setState(state.par);
    if (state.backgroundPattern && backgroundPatternControl) backgroundPatternControl.setState(state.backgroundPattern);
  }

  /**
   * Restore a snapshot by ID
   */
  async restoreSnapshot(id: string): Promise<void> {
    const {
      session,
      paintEngine,
      viewer,
      snapshotManager,
      snapshotPanel,
    } = this.ctx;
    try {
      const state = await snapshotManager.getSnapshot(id);
      if (!state) {
        showAlert('Snapshot not found', { type: 'error', title: 'Restore Error' });
        return;
      }

      // Create auto-checkpoint before restore
      const checkpointOk = await this.createAutoCheckpoint('Before Restore');
      if (!checkpointOk) {
        showAlert(
          'No rollback checkpoint could be created. The restore will proceed, but you will not be able to undo it.',
          { type: 'warning', title: 'Checkpoint Warning' },
        );
      }

      // Restore the session state
      await SessionSerializer.fromJSON(state, {
        session,
        paintEngine,
        viewer,
        playlistManager: this.ctx.playlistManager,
        cacheManager: this.ctx.cacheManager,
      });

      // Update UI controls with restored state
      this.syncControlsFromState(state);

      // Close the panel
      snapshotPanel.hide();

      const metadata = await snapshotManager.getSnapshotMetadata(id);
      showAlert(`Restored "${metadata?.name || 'snapshot'}"`, { type: 'success', title: 'Snapshot Restored' });
    } catch (err) {
      console.error('Failed to restore snapshot:', err);
      showAlert(`Failed to restore snapshot: ${err}`, { type: 'error', title: 'Restore Error' });
    }
  }

  /**
   * Detect active serialization gaps and return warning messages.
   */
  private getSerializationGapWarnings(): string[] {
    const { viewer } = this.ctx;
    const warnings: string[] = [];

    try {
      const toneMapping = (viewer as any).getToneMappingState?.();
      if (toneMapping && toneMapping.enabled && toneMapping.operator !== 'off') {
        warnings.push('Tone mapping settings are active but may not be fully preserved in the saved project.');
      }
    } catch {
      // ignore
    }

    try {
      const ocio = (viewer as any).isOCIOEnabled?.();
      if (ocio) {
        warnings.push('OCIO color management is active but cannot be serialized.');
      }
    } catch {
      // ignore
    }

    try {
      const displayColor = (viewer as any).getDisplayColorState?.();
      if (displayColor && displayColor.transferFunction && displayColor.transferFunction !== 'srgb' && displayColor.transferFunction !== 'sRGB') {
        warnings.push('Custom display color settings may not be fully preserved.');
      }
    } catch {
      // ignore
    }

    return warnings;
  }

  /**
   * Save project to file
   */
  async saveProject(): Promise<void> {
    const { session, paintEngine, viewer } = this.ctx;
    try {
      const displayName = (session as any).metadata?.displayName;
      const name = displayName || 'project';
      const state = SessionSerializer.toJSON(
        {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        },
        name,
      );

      // Check for serialization gaps and warn
      const gapWarnings = this.getSerializationGapWarnings();
      if (gapWarnings.length > 0) {
        showAlert(
          `The following settings are active but may not be fully saved:\n\n${gapWarnings.join('\n')}`,
          { type: 'warning', title: 'Save Warning' },
        );
      }

      await SessionSerializer.saveToFile(state, `${name}.orvproject`);
    } catch (err) {
      showAlert(`Failed to save project: ${err}`, { type: 'error', title: 'Save Error' });
    }
  }

  /**
   * Save RV session file
   */
  async saveRvSession(format: 'rv' | 'gto'): Promise<void> {
    const { session, paintEngine } = this.ctx;
    try {
      const displayName = (session as any).metadata?.displayName;
      const sourceName = session.currentSource?.name;
      const base = displayName || sourceName || 'session';
      const filename = `${base}.${format}`;

      if (this.gtoStore) {
        await this.gtoStore.saveToFile(filename, { binary: format === 'gto' });
      } else {
        await SessionGTOExporter.saveToFile(session, paintEngine, filename, { binary: format === 'gto' });
      }
    } catch (err) {
      showAlert(`Failed to save RV session: ${err}`, { type: 'error', title: 'Save Error' });
    }
  }

  /**
   * Open project from file
   */
  async openProject(file: File, availableFiles?: Map<string, File>): Promise<void> {
    const { session, paintEngine, viewer } = this.ctx;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    try {
      // Create auto-checkpoint before loading new project
      const checkpointOk = await this.createAutoCheckpoint('Before Project Load');
      if (!checkpointOk) {
        showAlert(
          'No rollback checkpoint could be created. The load will proceed, but you will not be able to undo it.',
          { type: 'warning', title: 'Checkpoint Warning' },
        );
      }

      if (ext === 'orvproject') {
        const state = await SessionSerializer.loadFromFile(file);
        const result = await SessionSerializer.fromJSON(state, {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        });

        if (result.warnings.length > 0) {
          showAlert(`Project loaded with warnings:\n${result.warnings.join('\n')}`, {
            type: 'warning',
            title: 'Project Loaded',
          });
        } else if (result.loadedMedia > 0) {
          showAlert(`Project loaded successfully (${result.loadedMedia} media files)`, {
            type: 'success',
            title: 'Project Loaded',
          });
        } else {
          showAlert('Project loaded (no media files - state only)', {
            type: 'info',
            title: 'Project Loaded',
          });
        }
      } else if (ext === 'rv' || ext === 'gto') {
        const content = await file.arrayBuffer();
        await session.loadFromGTO(content, availableFiles);
      } else if (ext === 'rvedl') {
        const text = await file.text();
        session.loadEDL(text);
        showAlert(`EDL loaded from ${file.name}`, { type: 'success', title: 'EDL Loaded' });
      } else {
        showAlert(
          `Unable to open as project. Expected .orvproject, .rv, .gto, or .rvedl but got .${ext}. Use the Open Media button to load media files.`,
          { type: 'warning', title: 'Unsupported File' },
        );
      }
    } catch (err) {
      showAlert(`Failed to load project: ${err}`, { type: 'error', title: 'Load Error' });
    }
  }

  /**
   * Initialize snapshot system
   */
  private async initSnapshots(): Promise<void> {
    try {
      await this.ctx.snapshotManager.initialize();
    } catch (err) {
      console.error('Snapshot manager initialization failed:', err);
    }
  }

  /**
   * Initialize auto-save system and handle crash recovery
   */
  private async initAutoSave(): Promise<void> {
    const { autoSaveManager, autoSaveIndicator } = this.ctx;
    try {
      // Listen for storage warnings
      autoSaveManager.on('storageWarning', (info) => {
        showAlert(
          `Storage space is running low (${info.percentUsed}% used). Consider clearing old auto-saves or freeing up browser storage.`,
          { type: 'warning', title: 'Storage Warning' },
        );
      });

      // Subscribe to recoveryAvailable event before calling initialize
      autoSaveManager.on('recoveryAvailable', async (data: { entries: any[] }) => {
        const mostRecent = data.entries[0];
        if (!mostRecent) return;

        const savedTime = new Date(mostRecent.savedAt).toLocaleString();

        const recover = await showConfirm(
          `A previous session "${mostRecent.name}" was found from ${savedTime}. Would you like to recover it?`,
          {
            title: 'Recover Session',
            confirmText: 'Recover',
            cancelText: 'Discard',
          },
        );

        if (recover) {
          await this.recoverAutoSave(mostRecent.id);
        } else {
          await autoSaveManager.clearAll();
        }
      });

      const hasRecovery = await autoSaveManager.initialize();

      if (hasRecovery) {
        // Show recovery prompt via the legacy path (for AutoSaveManagers
        // that don't use the recoveryAvailable event)
        const entries = await autoSaveManager.listAutoSaves();
        const mostRecent = entries[0];
        if (mostRecent) {
          const savedTime = new Date(mostRecent.savedAt).toLocaleString();

          const recover = await showConfirm(
            `A previous session "${mostRecent.name}" was found from ${savedTime}. Would you like to recover it?`,
            {
              title: 'Recover Session',
              confirmText: 'Recover',
              cancelText: 'Discard',
            },
          );

          if (recover) {
            await this.recoverAutoSave(mostRecent.id);
          } else {
            // Clear old auto-saves if user discards
            await autoSaveManager.clearAll();
          }
        }
      }
    } catch (err) {
      console.error('Auto-save initialization failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      showAlert(
        `Auto-save could not be initialized: ${errorMessage}. Your work will not be automatically saved. Use the Save button in the toolbar to save manually.`,
        { type: 'warning', title: 'Auto-Save Unavailable' },
      );
      if (typeof (autoSaveIndicator as any).setStatus === 'function') {
        (autoSaveIndicator as any).setStatus('disabled');
      }
    }
  }

  /**
   * Recover session from auto-save
   */
  private async recoverAutoSave(id: string): Promise<void> {
    const {
      autoSaveManager,
      session,
      paintEngine,
      viewer,
      colorControls,
      cdlControl,
      filterControl,
      transformControl,
      cropControl,
      lensControl,
      noiseReductionControl,
      watermarkControl,
    } = this.ctx;
    try {
      const state = await autoSaveManager.getAutoSave(id);
      if (state) {
        const { loadedMedia, warnings } = await SessionSerializer.fromJSON(state, {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        });

        // Update UI controls with restored state
        colorControls.setAdjustments(state.color);
        cdlControl.setCDL(state.cdl);
        filterControl.setSettings(state.filters);
        transformControl.setTransform(state.transform);
        cropControl.setState(state.crop);
        lensControl.setParams(state.lens);
        if (state.noiseReduction && noiseReductionControl) noiseReductionControl.setParams(state.noiseReduction);
        if (state.watermark && watermarkControl) watermarkControl.setState(state.watermark);
        // Note: wipe state is restored via viewer.setWipeState in SessionSerializer.fromJSON

        if (warnings.length > 0) {
          showAlert(`Session recovered with ${warnings.length} warning(s):\n${warnings.join('\n')}`, {
            title: 'Recovery Warnings',
            type: 'warning',
          });
        } else if (loadedMedia > 0) {
          showAlert(`Session recovered successfully with ${loadedMedia} media file(s).`, {
            title: 'Recovery Complete',
            type: 'success',
          });
        }

        // Clear the recovered entry
        await autoSaveManager.deleteAutoSave(id);
      }
    } catch (err) {
      showAlert(`Failed to recover session: ${err}`, {
        title: 'Recovery Failed',
        type: 'error',
      });
    }
  }

  dispose(): void {
    // AutoSaveManager and SnapshotManager are disposed by App directly
    // This class orchestrates persistence operations; no exclusive resources to clean up
  }
}
