import { describe, it, expect, vi, beforeEach, type Mock, type MockInstance } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import type { TransformControlEvents } from './ui/components/TransformControl';
import type { AppWiringContext } from './AppWiringContext';
import { DEFAULT_TRANSFORM, type Transform2D } from './core/types/transform';
import { wireTransformControls, TRANSFORM_EPSILON, hasSignificantChange } from './AppTransformWiring';
import { getGlobalHistoryManager, type HistoryEntry } from './utils/HistoryManager';

function createMockContext() {
  const transformControl = new EventEmitter<TransformControlEvents>() as EventEmitter<TransformControlEvents> & {
    setTransform: Mock<(t: Transform2D) => void>;
    getTransform: Mock<() => Transform2D>;
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
  let recordActionSpy: MockInstance<
    (label: string, category: HistoryEntry['category'], redo: () => void, undo?: () => void) => HistoryEntry
  >;

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

    expect(state.state.transformHistoryPrevious).toBeNull();
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

  describe('float precision — no spurious history entries', () => {
    it('TW-FP-001: scale change below epsilon does NOT record history', () => {
      const { ctx, transformControl } = createMockContext();
      wireTransformControls(ctx);

      // Emit a transform where scale differs by less than TRANSFORM_EPSILON
      const transform = {
        ...DEFAULT_TRANSFORM,
        scale: { x: 1 + TRANSFORM_EPSILON * 0.1, y: 1 - TRANSFORM_EPSILON * 0.5 },
        translate: { ...DEFAULT_TRANSFORM.translate },
      };
      transformControl.emit('transformChanged', transform);

      expect(recordActionSpy).not.toHaveBeenCalled();
    });

    it('TW-FP-002: translate change below epsilon does NOT record history', () => {
      const { ctx, transformControl } = createMockContext();
      wireTransformControls(ctx);

      const transform = {
        ...DEFAULT_TRANSFORM,
        scale: { ...DEFAULT_TRANSFORM.scale },
        translate: { x: TRANSFORM_EPSILON * 0.1, y: -TRANSFORM_EPSILON * 0.5 },
      };
      transformControl.emit('transformChanged', transform);

      expect(recordActionSpy).not.toHaveBeenCalled();
    });

    it('TW-FP-003: rotation change below epsilon does NOT record history', () => {
      const { ctx, transformControl } = createMockContext();
      wireTransformControls(ctx);

      const transform = {
        ...DEFAULT_TRANSFORM,
        rotation: (0 + TRANSFORM_EPSILON * 0.1) as 0,
      };
      transformControl.emit('transformChanged', transform);

      expect(recordActionSpy).not.toHaveBeenCalled();
    });

    it('TW-FP-004: scale change above epsilon DOES record history', () => {
      const { ctx, transformControl } = createMockContext();
      wireTransformControls(ctx);

      const transform = {
        ...DEFAULT_TRANSFORM,
        scale: { x: 1 + TRANSFORM_EPSILON * 10, y: 1 },
        translate: { ...DEFAULT_TRANSFORM.translate },
      };
      transformControl.emit('transformChanged', transform);

      expect(recordActionSpy).toHaveBeenCalledTimes(1);
    });

    it('TW-FP-005: translate change above epsilon DOES record history', () => {
      const { ctx, transformControl } = createMockContext();
      wireTransformControls(ctx);

      const transform = {
        ...DEFAULT_TRANSFORM,
        scale: { ...DEFAULT_TRANSFORM.scale },
        translate: { x: TRANSFORM_EPSILON * 10, y: 0 },
      };
      transformControl.emit('transformChanged', transform);

      expect(recordActionSpy).toHaveBeenCalledTimes(1);
    });

    it('TW-FP-006: meaningful changes still record correctly after sub-epsilon event', () => {
      const { ctx, transformControl } = createMockContext();
      wireTransformControls(ctx);

      // First: sub-epsilon change — no history
      const subEpsilon = {
        ...DEFAULT_TRANSFORM,
        scale: { x: 1 + TRANSFORM_EPSILON * 0.01, y: 1 },
        translate: { ...DEFAULT_TRANSFORM.translate },
      };
      transformControl.emit('transformChanged', subEpsilon);
      expect(recordActionSpy).not.toHaveBeenCalled();

      // Second: real change — should record
      const realChange = {
        ...DEFAULT_TRANSFORM,
        scale: { x: 2, y: 2 },
        translate: { ...DEFAULT_TRANSFORM.translate },
      };
      transformControl.emit('transformChanged', realChange);
      expect(recordActionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasSignificantChange', () => {
    it('TW-HSC-001: returns false for identical values', () => {
      expect(hasSignificantChange(1.0, 1.0)).toBe(false);
    });

    it('TW-HSC-002: returns false for difference at epsilon boundary', () => {
      expect(hasSignificantChange(1.0, 1.0 + TRANSFORM_EPSILON)).toBe(false);
    });

    it('TW-HSC-003: returns true for difference above epsilon', () => {
      expect(hasSignificantChange(1.0, 1.0 + TRANSFORM_EPSILON * 2)).toBe(true);
    });

    it('TW-HSC-004: handles negative differences', () => {
      expect(hasSignificantChange(0, -TRANSFORM_EPSILON * 0.5)).toBe(false);
      expect(hasSignificantChange(0, -TRANSFORM_EPSILON * 2)).toBe(true);
    });

    it('TW-HSC-005: epsilon is reasonable (1e-6)', () => {
      // Not too large: 0.001 pixel difference should be significant
      expect(TRANSFORM_EPSILON).toBeLessThan(0.001);
      // Not too small: smaller than typical float noise
      expect(TRANSFORM_EPSILON).toBeGreaterThan(1e-15);
    });
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
