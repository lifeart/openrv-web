import { describe, it, expect, vi, beforeEach, type Mock, type MockInstance } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import type { TransformControlEvents } from './ui/components/TransformControl';
import type { AppWiringContext } from './AppWiringContext';
import { DEFAULT_TRANSFORM, type Transform2D } from './core/types/transform';
import { wireTransformControls } from './AppTransformWiring';
import { getGlobalHistoryManager, type HistoryEntry } from './utils/HistoryManager';

function createMockContext() {
  const transformControl = new EventEmitter<TransformControlEvents>() as EventEmitter<TransformControlEvents> & {
    setTransform: Mock<[Transform2D], void>;
    getTransform: Mock<[], Transform2D>;
  };
  transformControl.setTransform = vi.fn();
  transformControl.getTransform = vi.fn(() => ({ ...DEFAULT_TRANSFORM }));

  const viewer = {
    setTransform: vi.fn(),
  };

  const persistenceManager = {
    syncGTOStore: vi.fn(),
  };

  const controls = {
    transformControl,
  };

  const ctx = {
    viewer,
    controls,
    persistenceManager,
  } as unknown as AppWiringContext;

  return { ctx, viewer, controls, persistenceManager, transformControl };
}

describe('wireTransformControls', () => {
  const historyManager = getGlobalHistoryManager();
  let recordActionSpy: MockInstance<[string, HistoryEntry['category'], () => void, (() => void)?], HistoryEntry>;

  beforeEach(() => {
    vi.clearAllMocks();
    historyManager.clear();
    recordActionSpy = vi.spyOn(historyManager, 'recordAction');
  });

  it('TW-001: transformChanged calls viewer.setTransform and syncGTOStore', () => {
    const { ctx, viewer, persistenceManager, transformControl } = createMockContext();
    wireTransformControls(ctx);

    const transform = { ...DEFAULT_TRANSFORM, rotation: 90 as const };
    transformControl.emit('transformChanged', transform);

    expect(viewer.setTransform).toHaveBeenCalledWith(transform);
    expect(persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('TW-002: returns TransformWiringState with null transformHistoryPrevious initially', () => {
    const { ctx } = createMockContext();
    const state = wireTransformControls(ctx);

    expect(state.transformHistoryPrevious).toBeNull();
    expect(state.subscriptions).toBeDefined();
    expect(state.subscriptions.isDisposed).toBe(false);
  });

  it('TW-003: rotation change records history action via historyManager.recordAction', () => {
    const { ctx, transformControl } = createMockContext();
    wireTransformControls(ctx);

    const transform = { ...DEFAULT_TRANSFORM, rotation: 90 as const };
    transformControl.emit('transformChanged', transform);

    expect(recordActionSpy).toHaveBeenCalledTimes(1);
    expect(recordActionSpy).toHaveBeenCalledWith(
      'Rotation to 90°',
      'transform',
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('TW-004: history undo callback calls control.setTransform and viewer.setTransform with previous', () => {
    const { ctx, viewer, transformControl } = createMockContext();
    wireTransformControls(ctx);

    const transform = { ...DEFAULT_TRANSFORM, rotation: 90 as const };
    transformControl.emit('transformChanged', transform);

    // The undo callback is the 3rd argument (index 2)
    const undoFn = recordActionSpy.mock.calls[0]![2] as () => void;

    viewer.setTransform.mockClear();
    transformControl.setTransform.mockClear();

    undoFn();

    // Previous transform was DEFAULT_TRANSFORM (since state started as null)
    expect(transformControl.setTransform).toHaveBeenCalledWith(DEFAULT_TRANSFORM);
    expect(viewer.setTransform).toHaveBeenCalledWith(DEFAULT_TRANSFORM);
  });

  it('TW-005: history redo callback calls control.setTransform and viewer.setTransform with current', () => {
    const { ctx, viewer, transformControl } = createMockContext();
    wireTransformControls(ctx);

    const transform = { ...DEFAULT_TRANSFORM, rotation: 90 as const };
    transformControl.emit('transformChanged', transform);

    // The redo callback is the 4th argument (index 3)
    const redoFn = recordActionSpy.mock.calls[0]![3] as () => void;

    viewer.setTransform.mockClear();
    transformControl.setTransform.mockClear();

    redoFn();

    // Current transform should be the spread copy of the emitted transform
    expect(transformControl.setTransform).toHaveBeenCalledWith(expect.objectContaining({ rotation: 90 }));
    expect(viewer.setTransform).toHaveBeenCalledWith(expect.objectContaining({ rotation: 90 }));
  });

  it('TW-006: scale change records history action', () => {
    const { ctx, transformControl } = createMockContext();
    wireTransformControls(ctx);

    const transform = { ...DEFAULT_TRANSFORM, scale: { x: 2, y: 2 }, translate: { ...DEFAULT_TRANSFORM.translate } };
    transformControl.emit('transformChanged', transform);

    expect(recordActionSpy).toHaveBeenCalledTimes(1);
    expect(recordActionSpy).toHaveBeenCalledWith(
      'Scale to 2.00x2.00',
      'transform',
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('TW-007: translate change records history action', () => {
    const { ctx, transformControl } = createMockContext();
    wireTransformControls(ctx);

    const transform = { ...DEFAULT_TRANSFORM, scale: { ...DEFAULT_TRANSFORM.scale }, translate: { x: 10, y: -5 } };
    transformControl.emit('transformChanged', transform);

    expect(recordActionSpy).toHaveBeenCalledTimes(1);
    expect(recordActionSpy).toHaveBeenCalledWith(
      'Translate to (10.0, -5.0)',
      'transform',
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('TW-008: combined scale+translate records generic description', () => {
    const { ctx, transformControl } = createMockContext();
    wireTransformControls(ctx);

    const transform = { ...DEFAULT_TRANSFORM, scale: { x: 1.5, y: 1.5 }, translate: { x: 5, y: 5 } };
    transformControl.emit('transformChanged', transform);

    expect(recordActionSpy).toHaveBeenCalledTimes(1);
    expect(recordActionSpy).toHaveBeenCalledWith(
      'Transform image',
      'transform',
      expect.any(Function),
      expect.any(Function),
    );
  });

  describe('disposal', () => {
    it('TW-DISP-001: callbacks fire before dispose', () => {
      const { ctx, viewer, transformControl } = createMockContext();
      wireTransformControls(ctx);

      const transform = { ...DEFAULT_TRANSFORM, rotation: 90 as const };
      transformControl.emit('transformChanged', transform);
      expect(viewer.setTransform).toHaveBeenCalledWith(transform);
    });

    it('TW-DISP-002: callbacks do not fire after dispose', () => {
      const { ctx, viewer, transformControl } = createMockContext();
      const state = wireTransformControls(ctx);
      state.subscriptions.dispose();

      viewer.setTransform.mockClear();
      const transform = { ...DEFAULT_TRANSFORM, rotation: 180 as const };
      transformControl.emit('transformChanged', transform);
      expect(viewer.setTransform).not.toHaveBeenCalled();
    });
  });
});
