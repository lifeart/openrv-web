/**
 * AppEffectsWiring - Wire effect controls to viewer/bridges.
 *
 * Handles:
 * - Filter control -> viewer
 * - Crop control -> viewer (bidirectional)
 * - Lens distortion control -> viewer
 */

import { effectRegistry, noiseReductionEffect } from './effects';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';
import { withSideEffects, type WiringSideEffects } from './utils/WiringHelpers';
import type { AppWiringContext, WiringResult } from './AppWiringContext';

/**
 * Wire all effect-related controls to the viewer and bridges.
 */
export function wireEffectsControls(ctx: AppWiringContext): WiringResult {
  const { viewer, controls, sessionBridge, persistenceManager } = ctx;
  const subs = new DisposableSubscriptionManager();
  const fx: WiringSideEffects = {
    scheduleUpdateScopes: () => sessionBridge.scheduleUpdateScopes(),
    syncGTOStore: () => persistenceManager.syncGTOStore(),
  };

  // Filter control -> viewer
  subs.add(
    controls.filterControl.on(
      'filtersChanged',
      withSideEffects(fx, (settings) => viewer.setFilterSettings(settings), { scopes: true, gto: true }),
    ),
  );

  // Crop control -> viewer
  subs.add(
    controls.cropControl.on(
      'cropStateChanged',
      withSideEffects(fx, (state) => viewer.setCropState(state), { scopes: false, gto: true }),
    ),
  );
  subs.add(
    controls.cropControl.on('cropModeToggled', (enabled) => {
      viewer.setCropEnabled(enabled);
    }),
  );
  subs.add(
    controls.cropControl.on('panelToggled', (isOpen) => {
      viewer.setCropPanelOpen(isOpen);
    }),
  );
  subs.add(
    controls.cropControl.on(
      'uncropStateChanged',
      withSideEffects(fx, (state) => viewer.setUncropState(state), { scopes: false, gto: true }),
    ),
  );

  // Handle crop region changes from Viewer (when user drags crop handles)
  viewer.setOnCropRegionChanged((region) => {
    controls.cropControl.setCropRegion(region);
    persistenceManager.syncGTOStore();
  });
  subs.add(() => viewer.setOnCropRegionChanged(null));

  // Lens distortion control -> viewer
  subs.add(
    controls.lensControl.on(
      'lensChanged',
      withSideEffects(fx, (params) => viewer.setLensParams(params), { scopes: true, gto: true }),
    ),
  );

  // Deinterlace control -> viewer
  subs.add(
    controls.deinterlaceControl.on(
      'deinterlaceChanged',
      withSideEffects(fx, (params) => viewer.setDeinterlaceParams(params), { scopes: true, gto: true }),
    ),
  );

  // Film emulation control -> viewer
  subs.add(
    controls.filmEmulationControl.on(
      'filmEmulationChanged',
      withSideEffects(fx, (params) => viewer.setFilmEmulationParams(params), { scopes: true, gto: true }),
    ),
  );

  // Perspective correction control -> viewer + overlay
  subs.add(
    controls.perspectiveCorrectionControl.on(
      'perspectiveChanged',
      withSideEffects(fx, (params) => viewer.setPerspectiveParams(params), { scopes: true, gto: true }),
    ),
  );

  // Stabilization control -> viewer
  subs.add(
    controls.stabilizationControl.on(
      'stabilizationChanged',
      withSideEffects(fx, (params) => viewer.setStabilizationParams(params), { scopes: true, gto: true }),
    ),
  );

  // Noise reduction control -> viewer
  subs.add(
    controls.noiseReductionControl.on(
      'paramsChanged',
      withSideEffects(fx, (params) => viewer.setNoiseReductionParams(params), { scopes: true, gto: true }),
    ),
  );

  // Watermark control -> viewer
  subs.add(
    controls.watermarkControl.on(
      'stateChanged',
      withSideEffects(fx, (state) => viewer.setWatermarkState(state), { scopes: false, gto: true }),
    ),
  );

  // Perspective grid overlay -> control + viewer (bidirectional)
  subs.add(
    viewer.getPerspectiveGridOverlay().on('cornersChanged', (params) => {
      controls.perspectiveCorrectionControl.setParams(params);
      viewer.setPerspectiveParams(params);
      sessionBridge.scheduleUpdateScopes();
      persistenceManager.syncGTOStore();
    }),
  );

  // Register noise reduction in the unified effect registry
  if (!effectRegistry.get('noiseReduction')) {
    effectRegistry.register(noiseReductionEffect);
  }

  // Ensure viewer state matches control defaults on startup.
  viewer.setNoiseReductionParams(controls.noiseReductionControl.getParams());
  viewer.setWatermarkState(controls.watermarkControl.getState());

  return { subscriptions: subs };
}
