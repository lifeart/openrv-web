/**
 * AppViewWiring - Wire view/navigation controls to viewer/session/bridges.
 *
 * Handles:
 * - Zoom control -> viewer
 * - Scopes control (histogram/waveform/vectorscope visibility)
 * - Compare/wipe control -> viewer
 * - Tone mapping control -> viewer
 * - Ghost frame control -> viewer
 * - PAR control -> viewer
 * - Background pattern control -> viewer
 * - Channel select -> viewer
 * - Stereo controls -> viewer
 * - Presentation mode -> headerBar
 */

import type { AppWiringContext, WiringResult } from './AppWiringContext';
import { detectFloatingWindowViolations } from './stereo/FloatingWindowDetector';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';
import { withSideEffects, type WiringSideEffects } from './utils/WiringHelpers';

/**
 * Wire all view-related controls to the viewer and bridges.
 */
export function wireViewControls(ctx: AppWiringContext): WiringResult {
  const { session, viewer, controls, sessionBridge, persistenceManager } = ctx;
  const subs = new DisposableSubscriptionManager();
  const fx: WiringSideEffects = {
    scheduleUpdateScopes: () => sessionBridge.scheduleUpdateScopes(),
    syncGTOStore: () => persistenceManager.syncGTOStore(),
  };

  // Zoom control -> viewer
  // ZoomControl now emits pixel ratio values (industry standard: 100% = 1:1).
  // 'fit' is a special zoom mode; numeric values are pixel ratios.
  subs.add(
    controls.zoomControl.on('zoomChanged', (zoom) => {
      if (zoom === 'fit') {
        viewer.smoothFitToWindow();
      } else if (zoom === 'fit-width') {
        viewer.smoothFitToWidth();
      } else if (zoom === 'fit-height') {
        viewer.smoothFitToHeight();
      } else {
        // zoom is a pixel ratio (e.g. 1 = 1:1, 2 = 2:1, 0.25 = 1:4)
        viewer.smoothSetPixelRatio(zoom);
      }
    }),
  );

  // Scopes control (histogram/waveform/vectorscope visibility toggle)
  subs.add(
    controls.scopesControl.on('scopeToggled', ({ scope, visible }) => {
      if (scope === 'histogram') {
        if (visible) {
          controls.histogram.show();
          sessionBridge.updateHistogram();
        } else {
          controls.histogram.hide();
        }
      } else if (scope === 'waveform') {
        if (visible) {
          controls.waveform.show();
          sessionBridge.updateWaveform();
        } else {
          controls.waveform.hide();
        }
      } else if (scope === 'vectorscope') {
        if (visible) {
          controls.vectorscope.show();
          sessionBridge.updateVectorscope();
        } else {
          controls.vectorscope.hide();
        }
      } else if (scope === 'gamutDiagram') {
        if (visible) {
          controls.gamutDiagram.show();
          sessionBridge.updateGamutDiagram();
        } else {
          controls.gamutDiagram.hide();
        }
      }
      persistenceManager.syncGTOStore();
    }),
  );

  // Compare/wipe control -> viewer
  subs.add(
    controls.compareControl.on('wipeModeChanged', (mode) => {
      viewer.setWipeState({
        mode,
        position: controls.compareControl.getWipePosition(),
        showOriginal: mode === 'horizontal' ? 'left' : 'top',
      });
    }),
  );
  subs.add(
    controls.compareControl.on('wipePositionChanged', (position) => {
      const mode = controls.compareControl.getWipeMode();
      viewer.setWipeState({
        mode,
        position,
        showOriginal: mode === 'horizontal' ? 'left' : 'top',
      });
    }),
  );
  subs.add(
    controls.compareControl.on('abSourceChanged', (source) => {
      if (source === 'A' || source === 'B') {
        session.setCurrentAB(source);
      }
    }),
  );
  // Note: abToggled is fired after setABSource already emitted abSourceChanged,
  // so the toggle has already happened via session.setCurrentAB(). This event
  // is just for notification/analytics purposes - do not call session.toggleAB()
  // again or it will double-toggle.
  subs.add(
    controls.compareControl.on('abToggled', () => {
      // Toggle already handled via abSourceChanged -> session.setCurrentAB()
    }),
  );
  subs.add(
    controls.compareControl.on('differenceMatteChanged', (state) => {
      viewer.setDifferenceMatteState(state);
    }),
  );
  subs.add(
    controls.compareControl.on('blendModeChanged', (state) => {
      viewer.setBlendModeState({
        ...state,
        flickerFrame: controls.compareControl.getFlickerFrame(),
      });
    }),
  );
  subs.add(
    controls.compareControl.on('quadViewChanged', (state) => {
      if (state.enabled) {
        console.warn(
          '[OpenRV] Quad View is not yet connected to the viewer. ' +
            'The UI reflects the selected state but the viewer will not render a quad layout.',
        );
      }
    }),
  );

  // Layout control -> viewer (mutual exclusion with compare)
  const layoutManager = controls.layoutControl.getManager();

  // Wire mutual exclusion: when layout is enabled, deactivate compare modes
  layoutManager.setDeactivateCompareCallback(() => {
    const cc = controls.compareControl;
    if (cc.getWipeMode() !== 'off') cc.setWipeMode('off');
    if (cc.isDifferenceMatteEnabled()) cc.setDifferenceMatteEnabled(false);
    if (cc.getBlendMode() !== 'off') cc.setBlendMode('off');
    if (cc.isQuadViewEnabled()) cc.setQuadViewEnabled(false);
  });

  // Wire layout control source tracking from session
  controls.layoutControl.setSourceCount(session.sourceCount);
  controls.layoutControl.setCurrentSourceIndex(session.currentSourceIndex);
  subs.add(
    session.on('sourceLoaded', () => {
      controls.layoutControl.setSourceCount(session.sourceCount);
      controls.layoutControl.setCurrentSourceIndex(session.currentSourceIndex);
    }),
  );

  // Wire mutual exclusion: when a compare mode is activated, deactivate layout
  subs.add(
    controls.compareControl.on('wipeModeChanged', (mode) => {
      if (mode !== 'off' && layoutManager.enabled) {
        layoutManager.disable();
      }
    }),
  );
  subs.add(
    controls.compareControl.on('differenceMatteChanged', (state) => {
      if (state.enabled && layoutManager.enabled) {
        layoutManager.disable();
      }
    }),
  );
  subs.add(
    controls.compareControl.on('blendModeChanged', (state) => {
      if (state.mode !== 'off' && layoutManager.enabled) {
        layoutManager.disable();
      }
    }),
  );
  subs.add(
    controls.compareControl.on('quadViewChanged', (state) => {
      if (state.enabled && layoutManager.enabled) {
        layoutManager.disable();
      }
    }),
  );

  // Tone mapping control -> viewer
  subs.add(
    controls.toneMappingControl.on(
      'stateChanged',
      withSideEffects(fx, (state) => viewer.setToneMappingState(state), { scopes: true }),
    ),
  );
  subs.add(
    controls.toneMappingControl.on('hdrModeChanged', (mode) => {
      viewer.setHDROutputMode(mode);
    }),
  );

  // Ghost frame control -> viewer
  subs.add(
    controls.ghostFrameControl.on('stateChanged', (state) => {
      viewer.setGhostFrameState(state);
    }),
  );

  // PAR control -> viewer
  subs.add(
    controls.parControl.on('stateChanged', (state) => {
      viewer.setPARState(state);
    }),
  );

  // Background pattern control -> viewer
  subs.add(
    controls.backgroundPatternControl.on('stateChanged', (state) => {
      viewer.setBackgroundPatternState(state);
    }),
  );

  // Channel select -> viewer
  subs.add(
    controls.channelSelect.on(
      'channelChanged',
      withSideEffects(fx, (channel) => viewer.setChannelMode(channel), { scopes: true, gto: true }),
    ),
  );
  subs.add(
    controls.channelSelect.on('layerChanged', async (event) => {
      // Handle EXR layer change
      await sessionBridge.handleEXRLayerChange(event.layer, event.remapping);
    }),
  );

  // Stereo control -> viewer
  subs.add(
    controls.stereoControl.on('stateChanged', (state) => {
      viewer.setStereoState(state);
      sessionBridge.scheduleUpdateScopes();
      persistenceManager.syncGTOStore();
      // Hide per-eye controls when stereo is turned off
      if (state.mode === 'off') {
        controls.stereoEyeTransformControl.hidePanel();
        controls.stereoEyeTransformControl.reset();
        controls.stereoAlignControl.reset();
        viewer.resetStereoEyeTransforms();
        viewer.resetStereoAlignMode();
      }
      // Update visibility of per-eye controls
      controls.updateStereoEyeControlsVisibility();
    }),
  );

  // Stereo eye transform control -> viewer
  subs.add(
    controls.stereoEyeTransformControl.on(
      'transformChanged',
      withSideEffects(fx, (state) => viewer.setStereoEyeTransforms(state), { scopes: true, gto: true }),
    ),
  );

  // Stereo alignment control -> viewer
  subs.add(
    controls.stereoAlignControl.on(
      'alignModeChanged',
      withSideEffects(fx, (mode) => viewer.setStereoAlignMode(mode), { scopes: true }),
    ),
  );

  // Convergence measurement: wire viewer mousemove -> convergence cursor + disparity
  const viewerContainer = viewer.getContainer();
  subs.addDOMListener(viewerContainer, 'mousemove', (e: Event) => {
    const mouseEvent = e as MouseEvent;
    if (!controls.convergenceMeasure.isEnabled()) return;
    const stereoState = viewer.getStereoState();
    if (stereoState.mode === 'off') return;

    const position = viewer.getPixelCoordinatesFromClient(mouseEvent.clientX, mouseEvent.clientY);
    if (!position) return;

    controls.convergenceMeasure.setCursorPosition(position.x, position.y);

    const pair = viewer.getStereoPair();
    if (pair) {
      controls.convergenceMeasure.measureAtCursor(pair.left, pair.right);
    }
  });

  // Floating window detection: run on frame change when stereo is active
  subs.add(
    session.on('frameChanged', () => {
      const stereoState = viewer.getStereoState();
      if (stereoState.mode === 'off') return;

      const pair = viewer.getStereoPair();
      if (!pair) return;

      const result = detectFloatingWindowViolations(pair.left, pair.right);
      controls.convergenceMeasure.emit('floatingWindowViolation' as never, result as never);
    }),
  );

  // Clear floating window QC result when source changes to avoid stale state
  subs.add(
    session.on('currentSourceChanged', () => {
      controls.floatingWindowControl.clearResult();
    }),
  );

  // Presentation mode -> headerBar
  subs.add(
    controls.presentationMode.on('stateChanged', (state) => {
      ctx.headerBar.setPresentationState(state.enabled);
    }),
  );

  return { subscriptions: subs };
}
