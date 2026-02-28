import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import { wireStackControls, type StackWiringState } from './AppStackWiring';
import type { AppWiringContext } from './AppWiringContext';

/**
 * Creates a mock AppWiringContext with an EventEmitter-based stackControl
 * and vi.fn() stubs for all methods read by wireStackControls.
 */
function createMockContext() {
  const viewer = {
    setStackLayers: vi.fn(),
  };

  const session = {
    currentSourceIndex: 0,
  };

  const sessionBridge = {
    scheduleUpdateScopes: vi.fn(),
  };

  const stackControl = Object.assign(new EventEmitter(), {
    updateLayerSource: vi.fn(),
    updateLayerName: vi.fn(),
    getLayers: vi.fn(() => []),
  });

  const controls = {
    stackControl,
  };

  const ctx = {
    session,
    viewer,
    controls,
    sessionBridge,
    // Unused by wireStackControls but present on the interface
    paintEngine: {},
    headerBar: {},
    tabBar: {},
    persistenceManager: {},
  } as unknown as AppWiringContext;

  return { ctx, viewer, session, sessionBridge, controls, stackControl };
}

describe('wireStackControls', () => {
  let ctx: AppWiringContext;
  let viewer: ReturnType<typeof createMockContext>['viewer'];
  let session: ReturnType<typeof createMockContext>['session'];
  let sessionBridge: ReturnType<typeof createMockContext>['sessionBridge'];
  let stackControl: ReturnType<typeof createMockContext>['stackControl'];
  let state: StackWiringState;

  beforeEach(() => {
    const mock = createMockContext();
    ctx = mock.ctx;
    viewer = mock.viewer;
    session = mock.session;
    sessionBridge = mock.sessionBridge;
    stackControl = mock.stackControl;

    state = wireStackControls(ctx);
  });

  // SW-001
  it('SW-001: layerAdded sets layer.sourceIndex, name, calls viewer.setStackLayers() + scheduleUpdateScopes()', () => {
    const layer = { id: 'layer-1', sourceIndex: -1, name: '' };
    session.currentSourceIndex = 3;

    (stackControl as EventEmitter).emit('layerAdded', layer);

    expect(layer.sourceIndex).toBe(3);
    expect(layer.name).toBe('Layer 1');
    expect(stackControl.updateLayerSource).toHaveBeenCalledWith('layer-1', 3);
    expect(stackControl.updateLayerName).toHaveBeenCalledWith('layer-1', 'Layer 1');
    expect(viewer.setStackLayers).toHaveBeenCalledOnce();
    expect(sessionBridge.scheduleUpdateScopes).toHaveBeenCalledOnce();
  });

  // SW-002
  it('SW-002: layerChanged calls viewer.setStackLayers() + scheduleUpdateScopes()', () => {
    (stackControl as EventEmitter).emit('layerChanged', undefined);

    expect(viewer.setStackLayers).toHaveBeenCalledOnce();
    expect(sessionBridge.scheduleUpdateScopes).toHaveBeenCalledOnce();
  });

  // SW-003
  it('SW-003: layerRemoved calls viewer.setStackLayers() + scheduleUpdateScopes()', () => {
    (stackControl as EventEmitter).emit('layerRemoved', undefined);

    expect(viewer.setStackLayers).toHaveBeenCalledOnce();
    expect(sessionBridge.scheduleUpdateScopes).toHaveBeenCalledOnce();
  });

  // SW-004
  it('SW-004: layerReordered calls viewer.setStackLayers() + scheduleUpdateScopes()', () => {
    (stackControl as EventEmitter).emit('layerReordered', undefined);

    expect(viewer.setStackLayers).toHaveBeenCalledOnce();
    expect(sessionBridge.scheduleUpdateScopes).toHaveBeenCalledOnce();
  });

  // SW-005
  it('SW-005: layerAdded increments layer numbers correctly (Layer 1, Layer 2)', () => {
    const layer1 = { id: 'layer-1', sourceIndex: -1, name: '' };
    const layer2 = { id: 'layer-2', sourceIndex: -1, name: '' };

    (stackControl as EventEmitter).emit('layerAdded', layer1);
    (stackControl as EventEmitter).emit('layerAdded', layer2);

    expect(layer1.name).toBe('Layer 1');
    expect(layer2.name).toBe('Layer 2');
    expect(state.nextLayerNumber).toBe(3);
  });

  describe('disposal', () => {
    it('SW-DISP-001: callbacks fire before dispose', () => {
      (stackControl as EventEmitter).emit('layerChanged', undefined);
      expect(viewer.setStackLayers).toHaveBeenCalledOnce();
    });

    it('SW-DISP-002: callbacks do not fire after dispose', () => {
      state.subscriptions.dispose();

      viewer.setStackLayers.mockClear();
      (stackControl as EventEmitter).emit('layerChanged', undefined);
      expect(viewer.setStackLayers).not.toHaveBeenCalled();
    });
  });
});
