/**
 * AppStackWiring - Wire stack/composite control to viewer/session.
 *
 * Handles:
 * - Layer added/changed/removed/reordered -> viewer
 * - Layer source changed -> viewer
 */

import type { AppWiringContext } from './AppWiringContext';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';

/**
 * Mutable state for the stack wiring (layer counter).
 */
export interface StackWiringState {
  nextLayerNumber: number;
  subscriptions: DisposableSubscriptionManager;
}

/**
 * Wire the stack/composite control to the viewer and session bridge.
 * Returns mutable state that tracks the next layer number.
 */
export function wireStackControls(ctx: AppWiringContext): StackWiringState {
  const { session, viewer, controls, sessionBridge } = ctx;

  const subs = new DisposableSubscriptionManager();

  const state: StackWiringState = {
    nextLayerNumber: 1,
    subscriptions: subs,
  };

  subs.add(controls.stackControl.on('layerAdded', (layer) => {
    // When adding a layer, use the current source index
    layer.sourceIndex = session.currentSourceIndex;
    // Use incrementing layer number that never decreases (even when layers are removed)
    layer.name = `Layer ${state.nextLayerNumber++}`;
    controls.stackControl.updateLayerSource(layer.id, layer.sourceIndex);
    controls.stackControl.updateLayerName(layer.id, layer.name);
    viewer.setStackLayers(controls.stackControl.getLayers());
    sessionBridge.scheduleUpdateScopes();
  }));

  subs.add(controls.stackControl.on('layerChanged', () => {
    viewer.setStackLayers(controls.stackControl.getLayers());
    sessionBridge.scheduleUpdateScopes();
  }));

  subs.add(controls.stackControl.on('layerRemoved', () => {
    viewer.setStackLayers(controls.stackControl.getLayers());
    sessionBridge.scheduleUpdateScopes();
  }));

  subs.add(controls.stackControl.on('layerReordered', () => {
    viewer.setStackLayers(controls.stackControl.getLayers());
    sessionBridge.scheduleUpdateScopes();
  }));

  subs.add(controls.stackControl.on('layerSourceChanged', ({ layerId, sourceIndex }) => {
    controls.stackControl.updateLayerSource(layerId, sourceIndex);
    // Don't update layer name - keep the original "Layer N" name
    viewer.setStackLayers(controls.stackControl.getLayers());
    sessionBridge.scheduleUpdateScopes();
  }));

  return state;
}
