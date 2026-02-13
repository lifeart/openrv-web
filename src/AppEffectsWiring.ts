/**
 * AppEffectsWiring - Wire effect controls to viewer/bridges.
 *
 * Handles:
 * - Filter control -> viewer
 * - Crop control -> viewer (bidirectional)
 * - Lens distortion control -> viewer
 */

import type { AppWiringContext } from './AppWiringContext';

/**
 * Wire all effect-related controls to the viewer and bridges.
 */
export function wireEffectsControls(ctx: AppWiringContext): void {
  const { viewer, controls, sessionBridge, persistenceManager } = ctx;

  // Filter control -> viewer
  controls.filterControl.on('filtersChanged', (settings) => {
    viewer.setFilterSettings(settings);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  });

  // Crop control -> viewer
  controls.cropControl.on('cropStateChanged', (state) => {
    viewer.setCropState(state);
    persistenceManager.syncGTOStore();
  });
  controls.cropControl.on('cropModeToggled', (enabled) => {
    viewer.setCropEnabled(enabled);
  });
  controls.cropControl.on('panelToggled', (isOpen) => {
    viewer.setCropPanelOpen(isOpen);
  });
  controls.cropControl.on('uncropStateChanged', (state) => {
    viewer.setUncropState(state);
    persistenceManager.syncGTOStore();
  });

  // Handle crop region changes from Viewer (when user drags crop handles)
  viewer.setOnCropRegionChanged((region) => {
    controls.cropControl.setCropRegion(region);
    persistenceManager.syncGTOStore();
  });

  // Lens distortion control -> viewer
  controls.lensControl.on('lensChanged', (params) => {
    viewer.setLensParams(params);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  });

  // Deinterlace control -> viewer
  controls.deinterlaceControl.on('deinterlaceChanged', (params) => {
    viewer.setDeinterlaceParams(params);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  });

  // Film emulation control -> viewer
  controls.filmEmulationControl.on('filmEmulationChanged', (params) => {
    viewer.setFilmEmulationParams(params);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  });
}
