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

/**
 * Wire all view-related controls to the viewer and bridges.
 */
export function wireViewControls(ctx: AppWiringContext): void {
  const { session, viewer, controls, sessionBridge, persistenceManager } = ctx;

  // Zoom control -> viewer
  controls.zoomControl.on('zoomChanged', (zoom) => {
    if (zoom === 'fit') {
      viewer.smoothFitToWindow();
    } else {
      viewer.smoothSetZoom(zoom);
    }
  });

  // Scopes control (histogram/waveform/vectorscope visibility toggle)
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
  });

  // Compare/wipe control -> viewer
  controls.compareControl.on('wipeModeChanged', (mode) => {
    viewer.setWipeState({
      mode,
      position: controls.compareControl.getWipePosition(),
      showOriginal: mode === 'horizontal' ? 'left' : 'top',
    });
  });
  controls.compareControl.on('wipePositionChanged', (position) => {
    const mode = controls.compareControl.getWipeMode();
    viewer.setWipeState({
      mode,
      position,
      showOriginal: mode === 'horizontal' ? 'left' : 'top',
    });
  });
  controls.compareControl.on('abSourceChanged', (source) => {
    if (source === 'A' || source === 'B') {
      session.setCurrentAB(source);
    }
  });
  // Note: abToggled is fired after setABSource already emitted abSourceChanged,
  // so the toggle has already happened via session.setCurrentAB(). This event
  // is just for notification/analytics purposes - do not call session.toggleAB()
  // again or it will double-toggle.
  controls.compareControl.on('abToggled', () => {
    // Toggle already handled via abSourceChanged -> session.setCurrentAB()
  });
  controls.compareControl.on('differenceMatteChanged', (state) => {
    viewer.setDifferenceMatteState(state);
  });
  controls.compareControl.on('blendModeChanged', (state) => {
    viewer.setBlendModeState({
      ...state,
      flickerFrame: controls.compareControl.getFlickerFrame(),
    });
  });

  // Tone mapping control -> viewer
  controls.toneMappingControl.on('stateChanged', (state) => {
    viewer.setToneMappingState(state);
    sessionBridge.scheduleUpdateScopes();
  });
  controls.toneMappingControl.on('hdrModeChanged', (mode) => {
    viewer.setHDROutputMode(mode);
  });

  // Ghost frame control -> viewer
  controls.ghostFrameControl.on('stateChanged', (state) => {
    viewer.setGhostFrameState(state);
  });

  // PAR control -> viewer
  controls.parControl.on('stateChanged', (state) => {
    viewer.setPARState(state);
  });

  // Background pattern control -> viewer
  controls.backgroundPatternControl.on('stateChanged', (state) => {
    viewer.setBackgroundPatternState(state);
  });

  // Channel select -> viewer
  controls.channelSelect.on('channelChanged', (channel) => {
    viewer.setChannelMode(channel);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  });
  controls.channelSelect.on('layerChanged', async (event) => {
    // Handle EXR layer change
    await sessionBridge.handleEXRLayerChange(event.layer, event.remapping);
  });

  // Stereo control -> viewer
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
  });

  // Stereo eye transform control -> viewer
  controls.stereoEyeTransformControl.on('transformChanged', (state) => {
    viewer.setStereoEyeTransforms(state);
    sessionBridge.scheduleUpdateScopes();
    persistenceManager.syncGTOStore();
  });

  // Stereo alignment control -> viewer
  controls.stereoAlignControl.on('alignModeChanged', (mode) => {
    viewer.setStereoAlignMode(mode);
    sessionBridge.scheduleUpdateScopes();
  });

  // Presentation mode -> headerBar
  controls.presentationMode.on('stateChanged', (state) => {
    ctx.headerBar.setPresentationState(state.enabled);
  });
}
