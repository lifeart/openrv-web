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

import type { AppWiringContext } from './AppWiringContext';
import { detectFloatingWindowViolations } from './stereo/FloatingWindowDetector';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';

/**
 * Wire all view-related controls to the viewer and bridges.
 */
export function wireViewControls(ctx: AppWiringContext): DisposableSubscriptionManager {
  const { session, viewer, controls, sessionBridge, persistenceManager } = ctx;
  const subs = new DisposableSubscriptionManager();

  // Zoom control -> viewer
  subs.add(controls.zoomControl.on('zoomChanged', (zoom) => {
    if (zoom === 'fit') {
      viewer.smoothFitToWindow();
    } else {
      viewer.smoothSetZoom(zoom);
    }
  }));

  // Scopes control (histogram/waveform/vectorscope visibility toggle)
  subs.add(controls.scopesControl.on('scopeToggled', ({ scope, visible }) => {
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
  }));

  // Compare/wipe control -> viewer
  subs.add(controls.compareControl.on('wipeModeChanged', (mode) => {
    viewer.setWipeState({
      mode,
      position: controls.compareControl.getWipePosition(),
      showOriginal: mode === 'horizontal' ? 'left' : 'top',
    });
  }));
  subs.add(controls.compareControl.on('wipePositionChanged', (position) => {
    const mode = controls.compareControl.getWipeMode();
    viewer.setWipeState({
      mode,
      position,
      showOriginal: mode === 'horizontal' ? 'left' : 'top',
    });
  }));
  subs.add(controls.compareControl.on('abSourceChanged', (source) => {
    if (source === 'A' || source === 'B') {
      session.setCurrentAB(source);
    }
  }));
  // Note: abToggled is fired after setABSource already emitted abSourceChanged,
  // so the toggle has already happened via session.setCurrentAB(). This event
  // is just for notification/analytics purposes - do not call session.toggleAB()
  // again or it will double-toggle.
  subs.add(controls.compareControl.on('abToggled', () => {
    // Toggle already handled via abSourceChanged -> session.setCurrentAB()
  }));
  subs.add(controls.compareControl.on('differenceMatteChanged', (state) => {
    viewer.setDifferenceMatteState(state);
  }));
  subs.add(controls.compareControl.on('blendModeChanged', (state) => {
    viewer.setBlendModeState({
      ...state,
      flickerFrame: controls.compareControl.getFlickerFrame(),
    });
  }));

  // Tone mapping control -> viewer
  subs.add(controls.toneMappingControl.on('stateChanged', (state) => {
    viewer.setToneMappingState(state);
    sessionBridge.scheduleUpdateScopes();
  }));
  subs.add(controls.toneMappingControl.on('hdrModeChanged', (mode) => {
    viewer.setHDROutputMode(mode);
  }));

  // Ghost frame control -> viewer
  subs.add(controls.ghostFrameControl.on('stateChanged', (state) => {
    viewer.setGhostFrameState(state);
  }));

  // PAR control -> viewer
  subs.add(controls.parControl.on('stateChanged', (state) => {
    viewer.setPARState(state);
  }));

  // Background pattern control -> viewer
  subs.add(controls.backgroundPatternControl.on('stateChanged', (state) => {
    viewer.setBackgroundPatternState(state);
  }));

  // Channel select -> viewer
  subs.add(controls.channelSelect.on('channelChanged', (channel) => {
    viewer.setChannelMode(channel);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));
  subs.add(controls.channelSelect.on('layerChanged', async (event) => {
    // Handle EXR layer change
    await sessionBridge.handleEXRLayerChange(event.layer, event.remapping);
  }));

  // Stereo control -> viewer
  subs.add(controls.stereoControl.on('stateChanged', (state) => {
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
  }));

  // Stereo eye transform control -> viewer
  subs.add(controls.stereoEyeTransformControl.on('transformChanged', (state) => {
    viewer.setStereoEyeTransforms(state);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  }));

  // Stereo alignment control -> viewer
  subs.add(controls.stereoAlignControl.on('alignModeChanged', (mode) => {
    viewer.setStereoAlignMode(mode);
    sessionBridge.scheduleUpdateScopes();
  }));

  // Convergence measurement: wire viewer mousemove -> convergence cursor + disparity
  const viewerContainer = viewer.getContainer();
  subs.addDOMListener(viewerContainer, 'mousemove', (e: Event) => {
    const mouseEvent = e as MouseEvent;
    if (!controls.convergenceMeasure.isEnabled()) return;
    const stereoState = viewer.getStereoState();
    if (stereoState.mode === 'off') return;

    const rect = viewerContainer.getBoundingClientRect();
    const canvas = viewerContainer.querySelector('canvas');
    if (!canvas) return;

    const imageData = viewer.getImageData();
    if (!imageData) return;

    const scaleX = imageData.width / canvas.clientWidth;
    const scaleY = imageData.height / canvas.clientHeight;
    const x = (mouseEvent.clientX - rect.left) * scaleX;
    const y = (mouseEvent.clientY - rect.top) * scaleY;

    controls.convergenceMeasure.setCursorPosition(x, y);

    const pair = viewer.getStereoPair();
    if (pair) {
      controls.convergenceMeasure.measureAtCursor(pair.left, pair.right);
    }
  });

  // Floating window detection: run on frame change when stereo is active
  subs.add(session.on('frameChanged', () => {
    const stereoState = viewer.getStereoState();
    if (stereoState.mode === 'off') return;

    const pair = viewer.getStereoPair();
    if (!pair) return;

    const result = detectFloatingWindowViolations(pair.left, pair.right);
    controls.convergenceMeasure.emit('floatingWindowViolation' as never, result as never);
  }));

  // Presentation mode -> headerBar
  subs.add(controls.presentationMode.on('stateChanged', (state) => {
    ctx.headerBar.setPresentationState(state.enabled);
  }));

  return subs;
}
