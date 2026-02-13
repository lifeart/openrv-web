import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import type { TransformControlEvents } from './ui/components/TransformControl';
import type { AppWiringContext } from './AppWiringContext';

const DEFAULT_TRANSFORM = { rotation: 0 as const, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

const mockRecordAction = vi.fn();

vi.mock('./utils/HistoryManager', () => ({
  getGlobalHistoryManager: () => ({
    recordAction: mockRecordAction,
  }),
}));

import { wireTransformControls } from './AppTransformWiring';

function createMockContext() {
  const transformControl = new EventEmitter<TransformControlEvents>() as EventEmitter<TransformControlEvents> & {
    setTransform: ReturnType<typeof vi.fn>;
    getTransform: ReturnType<typeof vi.fn>;
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
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(state).toEqual({ transformHistoryPrevious: null });
  });

  it('TW-003: rotation change records history action via historyManager.recordAction', () => {
    const { ctx, transformControl } = createMockContext();
    wireTransformControls(ctx);

    const transform = { ...DEFAULT_TRANSFORM, rotation: 90 as const };
    transformControl.emit('transformChanged', transform);

    expect(mockRecordAction).toHaveBeenCalledTimes(1);
    expect(mockRecordAction).toHaveBeenCalledWith(
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
    const undoFn = mockRecordAction.mock.calls[0]![2] as () => void;

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
    const redoFn = mockRecordAction.mock.calls[0]![3] as () => void;

    viewer.setTransform.mockClear();
    transformControl.setTransform.mockClear();

    redoFn();

    // Current transform should be the spread copy of the emitted transform
    expect(transformControl.setTransform).toHaveBeenCalledWith(expect.objectContaining({ rotation: 90 }));
    expect(viewer.setTransform).toHaveBeenCalledWith(expect.objectContaining({ rotation: 90 }));
  });
});
