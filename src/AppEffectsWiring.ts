/**
 * AppEffectsWiring - Wire effect controls to viewer/bridges.
 *
 * Handles:
 * - Filter control -> viewer
 * - Crop control -> viewer (bidirectional)
 * - Lens distortion control -> viewer
 */

import type { AppWiringContext } from './AppWiringContext';
import { effectRegistry, noiseReductionEffect } from './effects';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';

/**
 * Wire all effect-related controls to the viewer and bridges.
 */
export function wireEffectsControls(ctx: AppWiringContext): DisposableSubscriptionManager {
  const { viewer, controls, sessionBridge, persistenceManager } = ctx;
  const subs = new DisposableSubscriptionManager();

  // Filter control -> viewer
  subs.add(controls.filterControl.on('filtersChanged', (settings) => {
    viewer.setFilterSettings(settings);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Crop control -> viewer
  subs.add(controls.cropControl.on('cropStateChanged', (state) => {
    viewer.setCropState(state);
    persistenceManager.syncGTOStore();
  }));
  subs.add(controls.cropControl.on('cropModeToggled', (enabled) => {
    viewer.setCropEnabled(enabled);
  }));
  subs.add(controls.cropControl.on('panelToggled', (isOpen) => {
    viewer.setCropPanelOpen(isOpen);
  }));
  subs.add(controls.cropControl.on('uncropStateChanged', (state) => {
    viewer.setUncropState(state);
    persistenceManager.syncGTOStore();
  }));

  // Handle crop region changes from Viewer (when user drags crop handles)
  viewer.setOnCropRegionChanged((region) => {
    controls.cropControl.setCropRegion(region);
    persistenceManager.syncGTOStore();
  });
  subs.add(() => viewer.setOnCropRegionChanged(null));

  // Lens distortion control -> viewer
  subs.add(controls.lensControl.on('lensChanged', (params) => {
    viewer.setLensParams(params);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Deinterlace control -> viewer
  subs.add(controls.deinterlaceControl.on('deinterlaceChanged', (params) => {
    viewer.setDeinterlaceParams(params);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Film emulation control -> viewer
  subs.add(controls.filmEmulationControl.on('filmEmulationChanged', (params) => {
    viewer.setFilmEmulationParams(params);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Perspective correction control -> viewer + overlay
  subs.add(controls.perspectiveCorrectionControl.on('perspectiveChanged', (params) => {
    viewer.setPerspectiveParams(params);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Stabilization control -> viewer
  subs.add(controls.stabilizationControl.on('stabilizationChanged', (params) => {
    viewer.setStabilizationParams(params);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Noise reduction control -> viewer
  subs.add(controls.noiseReductionControl.on('paramsChanged', (params) => {
    viewer.setNoiseReductionParams(params);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Watermark control -> viewer
  subs.add(controls.watermarkControl.on('stateChanged', (state) => {
    viewer.setWatermarkState(state);
    persistenceManager.syncGTOStore();
  }));

  // Perspective grid overlay -> control + viewer (bidirectional)
  subs.add(viewer.getPerspectiveGridOverlay().on('cornersChanged', (params) => {
    controls.perspectiveCorrectionControl.setParams(params);
    viewer.setPerspectiveParams(params);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Register noise reduction in the unified effect registry
  if (!effectRegistry.get('noiseReduction')) {
    effectRegistry.register(noiseReductionEffect);
  }

  // Ensure viewer state matches control defaults on startup.
  viewer.setNoiseReductionParams(controls.noiseReductionControl.getParams());
  viewer.setWatermarkState(controls.watermarkControl.getState());

  return subs;
}
