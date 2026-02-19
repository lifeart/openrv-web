/**
 * GTO persistence and session settings handlers: annotations, paint effects,
 * matte settings, metadata, settings restoration, and GTO sync.
 */

import type { Session } from '../core/session/Session';
import type { SessionEvents } from '../core/session/Session';
import { SessionGTOStore } from '../core/session/SessionGTOStore';
import type { SessionBridgeContext } from '../AppSessionBridge';

/**
 * Bind all GTO persistence and session settings event handlers.
 * Returns an array of unsubscribe functions for cleanup.
 */
export function bindPersistenceHandlers(
  context: SessionBridgeContext,
  session: Session,
  on: <K extends keyof SessionEvents>(
    session: Session,
    event: K,
    handler: (data: SessionEvents[K]) => void
  ) => void,
  updateHistogram: () => void,
  updateWaveform: () => void,
  updateVectorscope: () => void,
  updateGamutDiagram?: () => void
): void {
  // Load annotations from GTO files
  on(session, 'annotationsLoaded', ({ annotations, effects }) => {
    context.getPaintEngine().loadFromAnnotations(annotations, effects);
    context.getPersistenceManager().syncGTOStore();
  });

  on(session, 'sessionLoaded', () => {
    if (session.gtoData) {
      context.getPersistenceManager().setGTOStore(new SessionGTOStore(session.gtoData));
      context.getPersistenceManager().syncGTOStore();
    }
  });

  on(session, 'frameChanged', () => context.getPersistenceManager().syncGTOStore());
  on(session, 'inOutChanged', () => context.getPersistenceManager().syncGTOStore());
  on(session, 'marksChanged', () => context.getPersistenceManager().syncGTOStore());
  on(session, 'fpsChanged', () => context.getPersistenceManager().syncGTOStore());

  // Apply paint effects from GTO session to PaintEngine
  on(session, 'paintEffectsLoaded', (effects) => {
    if (effects.ghost !== undefined) {
      context.getPaintEngine().setGhostMode(
        effects.ghost,
        effects.ghostBefore ?? 3,
        effects.ghostAfter ?? 3
      );
    }
    if (effects.hold !== undefined) {
      context.getPaintEngine().setHoldMode(effects.hold);
    }
  });

  // Apply matte settings from GTO session to MatteOverlay
  on(session, 'matteChanged', (settings) => {
    context.getViewer().getMatteOverlay().setSettings(settings);
  });

  // Handle metadata changes (for future UI display)
  on(session, 'metadataChanged', (metadata) => {
    // Could update title bar, info panel, etc.
    console.debug('Session metadata loaded:', metadata.displayName || 'Untitled');
  });

  // Settings loaded from GTO session
  on(session, 'settingsLoaded', (settings) => {
    handleSettingsLoaded(context, settings, updateHistogram, updateWaveform, updateVectorscope, updateGamutDiagram);
  });
}

/**
 * Handle settingsLoaded event: restore all control states from GTO session.
 */
function handleSettingsLoaded(
  context: SessionBridgeContext,
  settings: SessionEvents['settingsLoaded'],
  updateHistogram: () => void,
  updateWaveform: () => void,
  updateVectorscope: () => void,
  updateGamutDiagram?: () => void
): void {
  if (settings.colorAdjustments) {
    context.getColorControls().setAdjustments(settings.colorAdjustments);
  }
  if (settings.filterSettings) {
    context.getFilterControl().setSettings(settings.filterSettings);
  }
  if (settings.noiseReduction) {
    context.getViewer().setNoiseReductionParams(settings.noiseReduction);
    context.getNoiseReductionControl?.()?.setParams(settings.noiseReduction);
  }
  if (settings.cdl) {
    context.getCDLControl().setCDL(settings.cdl);
  }
  if (settings.transform) {
    context.getTransformControl().setTransform(settings.transform);
    context.getViewer().setTransform(settings.transform);
  }
  if (settings.lens) {
    context.getLensControl().setParams(settings.lens);
  }
  if (settings.crop) {
    context.getCropControl().setState(settings.crop);
  }
  if (settings.uncrop && settings.uncrop.active) {
    const source = context.getSession().currentSource;
    const sourceWidth = source?.width ?? 0;
    const sourceHeight = source?.height ?? 0;
    if (sourceWidth > 0 && sourceHeight > 0) {
      const paddingLeft = settings.uncrop.x;
      const paddingTop = settings.uncrop.y;
      const paddingRight = Math.max(0, settings.uncrop.width - sourceWidth - settings.uncrop.x);
      const paddingBottom = Math.max(0, settings.uncrop.height - sourceHeight - settings.uncrop.y);
      context.getCropControl().setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 0,
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
      });
    }
  }
  if (settings.channelMode) {
    context.getChannelSelect().setChannel(settings.channelMode);
  }
  if (settings.stereo) {
    context.getStereoControl().setState(settings.stereo);
  }
  if (settings.stereoEyeTransform) {
    context.getStereoEyeTransformControl().setState(settings.stereoEyeTransform);
  }
  if (settings.stereoAlignMode) {
    context.getStereoAlignControl().setMode(settings.stereoAlignMode);
  }
  if (settings.scopes) {
    const applyScope = (scope: 'histogram' | 'waveform' | 'vectorscope' | 'gamutDiagram', visible: boolean): void => {
      if (scope === 'histogram') {
        if (visible) {
          context.getHistogram().show();
          updateHistogram();
        } else {
          context.getHistogram().hide();
        }
      } else if (scope === 'waveform') {
        if (visible) {
          context.getWaveform().show();
          updateWaveform();
        } else {
          context.getWaveform().hide();
        }
      } else if (scope === 'vectorscope') {
        if (visible) {
          context.getVectorscope().show();
          updateVectorscope();
        } else {
          context.getVectorscope().hide();
        }
      } else if (scope === 'gamutDiagram') {
        if (visible) {
          context.getGamutDiagram().show();
          updateGamutDiagram?.();
        } else {
          context.getGamutDiagram().hide();
        }
      }
      context.getScopesControl().setScopeVisible(scope, visible);
    };

    applyScope('histogram', settings.scopes.histogram);
    applyScope('waveform', settings.scopes.waveform);
    applyScope('vectorscope', settings.scopes.vectorscope);
    applyScope('gamutDiagram', settings.scopes.gamutDiagram);
  }

  context.getPersistenceManager().syncGTOStore();
}
