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
import { SessionGTOStore } from './core/session/SessionGTOStore';
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
        session.currentSource?.name || 'Untitled'
      )
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
        session.currentSource?.name || 'Untitled'
      );
      autoSaveManager.saveNow(state);
    } catch (err) {
      console.error('Failed to retry auto-save:', err);
    }
  }

  /**
   * Create a quick snapshot with auto-generated name
   */
  async createQuickSnapshot(): Promise<void> {
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
        session.currentSource?.name || 'Untitled'
      );
      const now = new Date();
      const name = `Snapshot ${now.toLocaleTimeString()}`;
      await snapshotManager.createSnapshot(name, state);
      showAlert(`Snapshot "${name}" created`, { type: 'success', title: 'Snapshot Created' });
    } catch (err) {
      console.error('Failed to create snapshot:', err);
      showAlert(`Failed to create snapshot: ${err}`, { type: 'error', title: 'Snapshot Error' });
    }
  }

  /**
   * Create an auto-checkpoint before major operations
   */
  async createAutoCheckpoint(event: string): Promise<void> {
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
        session.currentSource?.name || 'Untitled'
      );
      await snapshotManager.createAutoCheckpoint(event, state);
    } catch (err) {
      console.error('Failed to create auto-checkpoint:', err);
    }
  }

  /**
   * Restore a snapshot by ID
   */
  async restoreSnapshot(id: string): Promise<void> {
    const { session, paintEngine, viewer, snapshotManager, snapshotPanel,
            colorControls, cdlControl, filterControl, transformControl, cropControl, lensControl,
            noiseReductionControl, watermarkControl } = this.ctx;
    try {
      const state = await snapshotManager.getSnapshot(id);
      if (!state) {
        showAlert('Snapshot not found', { type: 'error', title: 'Restore Error' });
        return;
      }

      // Create auto-checkpoint before restore
      await this.createAutoCheckpoint('Before Restore');

      // Restore the session state
      await SessionSerializer.fromJSON(
        state,
        {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        }
      );

      // Update UI controls with restored state
      if (state.color) colorControls.setAdjustments(state.color);
      if (state.cdl) cdlControl.setCDL(state.cdl);
      if (state.filters) filterControl.setSettings(state.filters);
      if (state.transform) transformControl.setTransform(state.transform);
      if (state.crop) cropControl.setState(state.crop);
      if (state.lens) lensControl.setParams(state.lens);
      if (state.noiseReduction && noiseReductionControl) noiseReductionControl.setParams(state.noiseReduction);
      if (state.watermark && watermarkControl) watermarkControl.setState(state.watermark);

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
   * Save project to file
   */
  async saveProject(): Promise<void> {
    const { session, paintEngine, viewer } = this.ctx;
    try {
      const state = SessionSerializer.toJSON(
        {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        },
        'project'
      );
      await SessionSerializer.saveToFile(state, 'project.orvproject');
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
      const sourceName = session.currentSource?.name;
      const base = sourceName ? sourceName : 'session';
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
  async openProject(file: File): Promise<void> {
    const { session, paintEngine, viewer } = this.ctx;
    try {
      // Create auto-checkpoint before loading new project
      await this.createAutoCheckpoint('Before Project Load');

      const state = await SessionSerializer.loadFromFile(file);
      const result = await SessionSerializer.fromJSON(
        state,
        {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        }
      );

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
    const { autoSaveManager } = this.ctx;
    try {
      // Listen for storage warnings
      autoSaveManager.on('storageWarning', (info) => {
        showAlert(
          `Storage space is running low (${info.percentUsed}% used). Consider clearing old auto-saves or freeing up browser storage.`,
          { type: 'warning', title: 'Storage Warning' }
        );
      });

      const hasRecovery = await autoSaveManager.initialize();

      if (hasRecovery) {
        // Show recovery prompt
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
            }
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
    }
  }

  /**
   * Recover session from auto-save
   */
  private async recoverAutoSave(id: string): Promise<void> {
    const { autoSaveManager, session, paintEngine, viewer,
            colorControls, cdlControl, filterControl, transformControl, cropControl, lensControl,
            noiseReductionControl, watermarkControl } = this.ctx;
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
