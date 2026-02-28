/**
 * AppColorWiring - Wire color controls to session/viewer/bridges.
 *
 * Handles:
 * - Color inversion toggle -> viewer
 * - Color controls adjustments -> viewer (with debounced history recording)
 * - LUT loaded/intensity -> viewer
 * - CDL control -> viewer
 * - Curves control -> viewer
 * - OCIO control -> viewer (baked 3D LUT pipeline)
 * - Display profile control -> viewer
 */

import type { AppWiringContext } from './AppWiringContext';
import type { ColorControls } from './ui/components/ColorControls';
import type { OCIOState } from './color/OCIOConfig';
import { getGlobalHistoryManager } from './utils/HistoryManager';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';

export const DEFAULT_OCIO_BAKE_SIZE = 33;
export const ACES_OCIO_BAKE_SIZE = 65;

/**
 * Choose baked OCIO LUT resolution.
 * ACES workflows benefit from 65^3 precision to reduce interpolation artifacts.
 */
export function resolveOCIOBakeSize(state: OCIOState): number {
  const acesPattern = /\baces\b/i;
  const candidates = [
    state.configName,
    state.inputColorSpace,
    state.detectedColorSpace,
    state.workingColorSpace,
    state.view,
    state.look,
  ];
  const isACESWorkflow = candidates.some((value) => typeof value === 'string' && acesPattern.test(value));
  return isACESWorkflow ? ACES_OCIO_BAKE_SIZE : DEFAULT_OCIO_BAKE_SIZE;
}

/**
 * Mutable state for debounced color history recording.
 * Returned so that App can clean up the timer on dispose.
 */
export interface ColorWiringState {
  colorHistoryTimer: ReturnType<typeof setTimeout> | null;
  colorHistoryPrevious: ReturnType<ColorControls['getAdjustments']> | null;
  subscriptions: DisposableSubscriptionManager;
}

/**
 * Wire all color-related controls to the viewer and bridges.
 * Returns mutable state that the caller must clean up on dispose.
 */
export function wireColorControls(ctx: AppWiringContext): ColorWiringState {
  const { viewer, controls, sessionBridge, persistenceManager } = ctx;

  const subs = new DisposableSubscriptionManager();

  const state: ColorWiringState = {
    colorHistoryTimer: null,
    colorHistoryPrevious: controls.colorControls.getAdjustments(),
    subscriptions: subs,
  };

  // Color inversion toggle -> viewer
  subs.add(controls.colorInversionToggle.on('inversionChanged', (enabled) => {
    viewer.setColorInversion(enabled);
    sessionBridge.scheduleUpdateScopes();
  }));

  // Premult control -> viewer
  subs.add(controls.premultControl.on('premultChanged', (mode) => {
    viewer.setPremultMode(mode);
    sessionBridge.scheduleUpdateScopes();
  }));

  // Color controls adjustments -> viewer with debounced history recording
  subs.add(controls.colorControls.on('adjustmentsChanged', (adjustments) => {
    viewer.setColorAdjustments(adjustments);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();

    // Debounced history recording - records after user stops adjusting for 500ms
    if (state.colorHistoryTimer) {
      clearTimeout(state.colorHistoryTimer);
    }

    const previousSnapshot = { ...state.colorHistoryPrevious! };
    state.colorHistoryTimer = setTimeout(() => {
      const currentSnapshot = controls.colorControls.getAdjustments();

      // Find what changed for the description
      const changes: string[] = [];
      for (const key of Object.keys(currentSnapshot) as Array<keyof typeof currentSnapshot>) {
        if (previousSnapshot[key] !== currentSnapshot[key]) {
          changes.push(key);
        }
      }

      if (changes.length > 0) {
        const description = changes.length === 1
          ? `Adjust ${changes[0]}`
          : `Adjust ${changes.length} color settings`;

        const historyManager = getGlobalHistoryManager();
        historyManager.recordAction(
          description,
          'color',
          () => {
            // Restore previous state
            controls.colorControls.setAdjustments(previousSnapshot);
            viewer.setColorAdjustments(previousSnapshot);
            sessionBridge.scheduleUpdateScopes();
          },
          () => {
            // Redo to current state
            controls.colorControls.setAdjustments(currentSnapshot);
            viewer.setColorAdjustments(currentSnapshot);
            sessionBridge.scheduleUpdateScopes();
          }
        );
      }

      state.colorHistoryPrevious = currentSnapshot;
      state.colorHistoryTimer = null;
    }, 500);
  }));

  // LUT events -> viewer
  subs.add(controls.colorControls.on('lutLoaded', (lut) => {
    viewer.setLUT(lut);
    sessionBridge.scheduleUpdateScopes();
  }));
  subs.add(controls.colorControls.on('lutIntensityChanged', (intensity) => {
    viewer.setLUTIntensity(intensity);
    sessionBridge.scheduleUpdateScopes();
  }));

  // CDL control -> viewer
  subs.add(controls.cdlControl.on('cdlChanged', (cdl) => {
    viewer.setCDL(cdl);
    sessionBridge.scheduleUpdateScopes();
  }));

  // Curves control -> viewer
  subs.add(controls.curvesControl.on('curvesChanged', (curves) => {
    viewer.setCurves(curves);
    sessionBridge.scheduleUpdateScopes();
  }));

  // OCIO control -> viewer (baked 3D LUT)
  subs.add(controls.ocioControl.on('stateChanged', (state) => {
    updateOCIOPipeline(ctx, state);
    // Update gamut diagram triangles with current OCIO color spaces
    controls.gamutDiagram.setColorSpaces(
      state.inputColorSpace === 'Auto' ? (state.detectedColorSpace ?? 'sRGB') : state.inputColorSpace,
      state.workingColorSpace,
      state.display
    );
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Display profile control -> viewer
  subs.add(controls.displayProfileControl.on('stateChanged', (state) => {
    viewer.setDisplayColorState(state);
    sessionBridge.scheduleUpdateScopes();
  }));

  // Gamut mapping control -> viewer
  subs.add(controls.gamutMappingControl.on('gamutMappingChanged', (state) => {
    viewer.setGamutMappingState(state);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // LUT pipeline panel -> viewer
  subs.add(controls.lutPipelinePanel.on('pipelineChanged', () => {
    viewer.syncLUTPipeline();
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Ensure GPU LUT chain state matches panel defaults at startup
  viewer.syncLUTPipeline();

  return state;
}

/**
 * Update the OCIO rendering pipeline when OCIO state changes.
 *
 * Bakes the current OCIO transform chain into a 3D LUT for GPU-accelerated
 * processing and sends it to the Viewer for real-time display.
 */
export function updateOCIOPipeline(ctx: AppWiringContext, state: OCIOState): void {
  const processor = ctx.controls.ocioControl.getProcessor();

  if (state.enabled) {
    // Bake the OCIO transform chain into a 3D LUT for GPU acceleration
    // ACES transforms use 65^3 for better precision; others use 33^3.
    const bakeSize = resolveOCIOBakeSize(state);
    const bakedLUT = processor.bakeTo3DLUT(bakeSize);
    ctx.viewer.setOCIOBakedLUT(bakedLUT, true);
  } else {
    // Disable OCIO - clear the baked LUT
    ctx.viewer.setOCIOBakedLUT(null, false);
  }
}
