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

import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';
import { getGlobalHistoryManager } from './utils/HistoryManager';
import { withSideEffects, type WiringSideEffects } from './utils/WiringHelpers';
import type { AppWiringContext, StatefulWiringResult } from './AppWiringContext';
import type { OCIOState } from './color/OCIOConfig';
import type { ColorControls } from './ui/components/ColorControls';

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
}

/**
 * Wire all color-related controls to the viewer and bridges.
 * Returns mutable state that the caller must clean up on dispose.
 */
export function wireColorControls(ctx: AppWiringContext): StatefulWiringResult<ColorWiringState> {
  const { viewer, controls, sessionBridge, persistenceManager } = ctx;

  const subs = new DisposableSubscriptionManager();
  const fx: WiringSideEffects = {
    scheduleUpdateScopes: () => sessionBridge.scheduleUpdateScopes(),
    syncGTOStore: () => persistenceManager.syncGTOStore(),
  };

  const state: ColorWiringState = {
    colorHistoryTimer: null,
    colorHistoryPrevious: controls.colorControls.getAdjustments(),
  };

  // Color inversion toggle -> viewer
  subs.add(
    controls.colorInversionToggle.on(
      'inversionChanged',
      withSideEffects(fx, (enabled) => viewer.setColorInversion(enabled), { scopes: true }),
    ),
  );

  // Premult control -> viewer
  subs.add(
    controls.premultControl.on(
      'premultChanged',
      withSideEffects(fx, (mode) => viewer.setPremultMode(mode), { scopes: true }),
    ),
  );

  // Color controls adjustments -> viewer with debounced history recording
  subs.add(
    controls.colorControls.on('adjustmentsChanged', (adjustments) => {
      viewer.setColorAdjustments(adjustments);
      sessionBridge.scheduleUpdateScopes();
      persistenceManager.syncGTOStore();

      // Debounced history recording - records after user stops adjusting for 500ms.
      // Skip history recording when an external system (e.g., virtual slider) is
      // managing its own history entries via the suppressHistory flag.
      if (controls.colorControls.suppressHistory) {
        // Still update the previous snapshot so the next non-suppressed change
        // has a correct baseline.
        state.colorHistoryPrevious = controls.colorControls.getAdjustments();
        return;
      }

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
          const description = changes.length === 1 ? `Adjust ${changes[0]}` : `Adjust ${changes.length} color settings`;

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
            },
          );
        }

        state.colorHistoryPrevious = currentSnapshot;
        state.colorHistoryTimer = null;
      }, 500);
    }),
  );

  // LUT events -> viewer
  subs.add(
    controls.colorControls.on(
      'lutLoaded',
      withSideEffects(fx, (lut) => viewer.setLUT(lut), { scopes: true }),
    ),
  );
  subs.add(
    controls.colorControls.on(
      'lutIntensityChanged',
      withSideEffects(fx, (intensity) => viewer.setLUTIntensity(intensity), { scopes: true }),
    ),
  );

  // CDL control -> viewer
  subs.add(
    controls.cdlControl.on(
      'cdlChanged',
      withSideEffects(fx, (cdl) => viewer.setCDL(cdl), { scopes: true }),
    ),
  );

  // Curves control -> viewer
  subs.add(
    controls.curvesControl.on(
      'curvesChanged',
      withSideEffects(fx, (curves) => viewer.setCurves(curves), { scopes: true }),
    ),
  );

  // OCIO control -> viewer (baked 3D LUT)
  subs.add(
    controls.ocioControl.on('stateChanged', (state) => {
      updateOCIOPipeline(ctx, state);
      // Update gamut diagram triangles with current OCIO color spaces
      controls.gamutDiagram.setColorSpaces(
        state.inputColorSpace === 'Auto' ? (state.detectedColorSpace ?? 'sRGB') : state.inputColorSpace,
        state.workingColorSpace,
        state.display,
      );
      sessionBridge.scheduleUpdateScopes();
      persistenceManager.syncGTOStore();
    }),
  );

  // Display profile control -> viewer
  subs.add(
    controls.displayProfileControl.on(
      'stateChanged',
      withSideEffects(fx, (state) => viewer.setDisplayColorState(state), { scopes: true }),
    ),
  );

  // Gamut mapping control -> viewer
  subs.add(
    controls.gamutMappingControl.on(
      'gamutMappingChanged',
      withSideEffects(fx, (state) => viewer.setGamutMappingState(state), { scopes: true, gto: true }),
    ),
  );

  // LUT pipeline panel -> viewer
  subs.add(
    controls.lutPipelinePanel.on(
      'pipelineChanged',
      withSideEffects(fx, () => viewer.syncLUTPipeline(), { scopes: true, gto: true }),
    ),
  );

  // Ensure GPU LUT chain state matches panel defaults at startup
  viewer.syncLUTPipeline();

  return { subscriptions: subs, state };
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
