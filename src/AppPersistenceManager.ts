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
import type { CompareControl } from './ui/components/CompareControl';
import type { StackControl } from './ui/components/StackControl';
import type { PARControl } from './ui/components/PARControl';
import type { BackgroundPatternControl } from './ui/components/BackgroundPatternControl';
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
  compareControl?: CompareControl;
  stackControl?: StackControl;
  parControl?: PARControl;
  backgroundPatternControl?: BackgroundPatternControl;
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
   *
   * TODO(#138): Auto-save uses the same lossy SessionSerializer.toJSON() as
   * project save. Viewer states tracked by getSerializationGaps() are lost.
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
        session.currentSource?.name || 'Untitled',
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
        session.currentSource?.name || 'Untitled',
      );
      autoSaveManager.saveNow(state);
    } catch (err) {
      console.error('Failed to retry auto-save:', err);
    }
  }

  /**
   * Create a quick snapshot with auto-generated name
   *
   * TODO(#138): Snapshots use the same lossy SessionSerializer.toJSON() as
   * project save. Viewer states tracked by getSerializationGaps() (tone mapping,
   * stereo, channel isolation, etc.) are silently lost in the snapshot.
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
        session.currentSource?.name || 'Untitled',
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
   *
   * TODO(#138): Auto-checkpoints use the same lossy SessionSerializer.toJSON()
   * as project save. Viewer states tracked by getSerializationGaps() are lost.
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
        session.currentSource?.name || 'Untitled',
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
    const { session, paintEngine, viewer, snapshotManager, snapshotPanel } = this.ctx;
    try {
      const state = await snapshotManager.getSnapshot(id);
      if (!state) {
        showAlert('Snapshot not found', { type: 'error', title: 'Restore Error' });
        return;
      }

      // Create auto-checkpoint before restore
      await this.createAutoCheckpoint('Before Restore');

      // Clear existing session before restore so we replace rather than
      // append onto the current session (fix #139).
      session.clearSources();

      // Restore the session state
      const result = await SessionSerializer.fromJSON(state, {
        session,
        paintEngine,
        viewer,
        playlistManager: this.ctx.playlistManager,
        cacheManager: this.ctx.cacheManager,
      });

      // Update all UI controls with restored state
      this.syncControlsFromState(state);

      // Close the panel
      snapshotPanel.hide();

      const metadata = await snapshotManager.getSnapshotMetadata(id);
      const snapName = metadata?.name || 'snapshot';

      // Surface warnings from restore rather than always reporting success (fix #140).
      if (result.warnings.length > 0) {
        showAlert(
          `Restored "${snapName}" with ${result.warnings.length} warning(s):\n${result.warnings.join('\n')}`,
          { type: 'warning', title: 'Snapshot Restored' },
        );
      } else if (result.loadedMedia === 0) {
        showAlert(`Restored "${snapName}" (no media files — state only)`, {
          type: 'info',
          title: 'Snapshot Restored',
        });
      } else {
        showAlert(`Restored "${snapName}"`, { type: 'success', title: 'Snapshot Restored' });
      }
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
      // Fix #127: Use session display name instead of hardcoded 'project'
      const displayName = session.metadata?.displayName?.trim() || 'project';
      const state = SessionSerializer.toJSON(
        {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        },
        displayName,
      );

      // Surface serialization gaps to the user (fix #119).
      // SessionSerializer.toJSON() logs active gaps to the console, but the user
      // never sees them. Match the load path which already surfaces warnings.
      const gaps = SessionSerializer.getSerializationGaps(viewer);
      const activeGaps = gaps.filter((g) => g.isActive);
      if (activeGaps.length > 0) {
        const details = activeGaps.map((g) => `• ${g.name}: ${g.impact}`).join('\n');
        showAlert(
          `The following active states are NOT saved in the project file and will revert to defaults on reload:\n\n${details}`,
          { type: 'warning', title: 'Save Warning' },
        );
      }

      await SessionSerializer.saveToFile(state, `${displayName}.orvproject`);
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
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    try {
      // Create auto-checkpoint before loading new project
      await this.createAutoCheckpoint('Before Project Load');

      if (ext === 'orvproject') {
        const state = await SessionSerializer.loadFromFile(file);
        const result = await SessionSerializer.fromJSON(state, {
          session,
          paintEngine,
          viewer,
          playlistManager: this.ctx.playlistManager,
          cacheManager: this.ctx.cacheManager,
        });

        // Update all UI controls with restored state
        this.syncControlsFromState(state);

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
        await session.loadFromGTO(content);

        // Sync UI controls that the settingsLoaded event handler does NOT cover (fix #160).
        // GTO loading fires settingsLoaded which already syncs color, CDL, filter,
        // transform, crop, lens, and noiseReduction controls. We only need to sync
        // wipe/compare, stack, PAR, backgroundPattern, and watermark here.
        const wipeState = viewer.getWipeState();
        this.syncControlsFromState({
          watermark: viewer.getWatermarkState(),
          wipe: { mode: wipeState.mode, position: wipeState.position },
          par: viewer.getPARState(),
          backgroundPattern: viewer.getBackgroundPatternState(),
        });
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
    const { autoSaveManager } = this.ctx;
    try {
      // Listen for storage warnings
      autoSaveManager.on('storageWarning', (info) => {
        showAlert(
          `Storage space is running low (${info.percentUsed}% used). Consider clearing old auto-saves or freeing up browser storage.`,
          { type: 'warning', title: 'Storage Warning' },
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
    }
  }

  /**
   * Recover session from auto-save
   */
  private async recoverAutoSave(id: string): Promise<void> {
    const { autoSaveManager, session, paintEngine, viewer } = this.ctx;
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

        // Update all UI controls with restored state
        this.syncControlsFromState(state);

        if (warnings.length > 0) {
          // Keep the auto-save entry when recovery has warnings so the user
          // can attempt recovery again if needed (fix #141).
          showAlert(
            `Session recovered with ${warnings.length} warning(s):\n${warnings.join('\n')}\n\n` +
              `The auto-save entry has been preserved in case you need to retry recovery.`,
            {
              title: 'Recovery Warnings',
              type: 'warning',
            },
          );
        } else {
          // Only delete the entry when recovery completes cleanly (fix #141).
          await autoSaveManager.deleteAutoSave(id);

          if (loadedMedia > 0) {
            showAlert(`Session recovered successfully with ${loadedMedia} media file(s).`, {
              title: 'Recovery Complete',
              type: 'success',
            });
          }
        }
      }
    } catch (err) {
      showAlert(`Failed to recover session: ${err}`, {
        title: 'Recovery Failed',
        type: 'error',
      });
    }
  }

  /**
   * Synchronize all UI controls with the given restored session state.
   *
   * SessionSerializer.fromJSON pushes state into the Viewer (the rendering backend),
   * but UI controls (sliders, panels, dropdowns) maintain their own copies of state.
   * This method bridges that gap so controls reflect the restored values.
   */
  private syncControlsFromState(state: {
    color?: any;
    cdl?: any;
    filters?: any;
    transform?: any;
    crop?: any;
    lens?: any;
    noiseReduction?: any;
    watermark?: any;
    wipe?: any;
    stack?: any;
    par?: any;
    backgroundPattern?: any;
  }): void {
    const {
      colorControls,
      cdlControl,
      filterControl,
      transformControl,
      cropControl,
      lensControl,
      noiseReductionControl,
      watermarkControl,
      compareControl,
      stackControl,
      parControl,
      backgroundPatternControl,
    } = this.ctx;

    // Color / grading controls
    if (state.color) colorControls.setAdjustments(state.color);
    if (state.cdl) cdlControl.setCDL(state.cdl);
    if (state.filters) filterControl.setSettings(state.filters);
    if (state.transform) transformControl.setTransform(state.transform);
    if (state.crop) cropControl.setState(state.crop);
    if (state.lens) lensControl.setParams(state.lens);
    if (state.noiseReduction && noiseReductionControl) noiseReductionControl.setParams(state.noiseReduction);
    if (state.watermark && watermarkControl) watermarkControl.setState(state.watermark);

    // Compare / wipe controls
    if (state.wipe && compareControl) {
      compareControl.setWipeMode(state.wipe.mode);
      compareControl.setWipePosition(state.wipe.position);
    }

    // Stack layer control
    if (stackControl) {
      if (state.stack && state.stack.length > 0) {
        stackControl.setLayers(state.stack);
      } else {
        stackControl.clearLayers();
      }
    }

    // PAR control (fix #120)
    if (state.par && parControl) {
      parControl.setState(state.par);
    }

    // Background pattern control (fix #120)
    if (state.backgroundPattern && backgroundPatternControl) {
      backgroundPatternControl.setState(state.backgroundPattern);
    }
  }

  dispose(): void {
    // AutoSaveManager and SnapshotManager are disposed by App directly
    // This class orchestrates persistence operations; no exclusive resources to clean up
  }
}
