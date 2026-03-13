import { describe, it, expect, vi } from 'vitest';
import { fetchAndApplyLUT, type DCCWiringState, type DCCWiringColorControls, type DCCWiringViewer } from './AppDCCWiring';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';

/**
 * Create a deferred fetch that can be resolved/rejected manually.
 * Returns { fetchFn, resolve, reject } where fetchFn is a mock fetch.
 */
function createDeferredFetch() {
  let resolveFn!: (value: Response) => void;
  let rejectFn!: (reason: any) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  const fetchFn = vi.fn().mockReturnValue(promise);
  return { fetchFn, resolve: resolveFn, reject: rejectFn };
}

function makeOkResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(content),
  } as Response;
}

function makeState(): DCCWiringState {
  return {
    suppressFrameSync: false,
    subscriptions: new DisposableSubscriptionManager(),
    lutGeneration: 0,
  };
}

function makeControls() {
  return {
    setAdjustments: vi.fn(),
    getAdjustments: vi.fn(),
    setLUT: vi.fn(),
    on: vi.fn(),
  } as unknown as DCCWiringColorControls & { setLUT: ReturnType<typeof vi.fn> };
}

function makeViewer() {
  return {
    setColorAdjustments: vi.fn(),
    setLUT: vi.fn(),
  } as unknown as DCCWiringViewer & { setLUT: ReturnType<typeof vi.fn> };
}

// Minimal .cube LUT content for parseLUT to succeed
const CUBE_LUT_A = `TITLE "LUT_A"
LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0`;

const CUBE_LUT_B = `TITLE "LUT_B"
LUT_3D_SIZE 2
0.1 0.1 0.1
0.9 0.1 0.1
0.1 0.9 0.1
0.9 0.9 0.1
0.1 0.1 0.9
0.9 0.1 0.9
0.1 0.9 0.9
0.9 0.9 0.9`;

describe('fetchAndApplyLUT — latest-request-wins (#439)', () => {
  it('DCCL-001: single request applies LUT normally', async () => {
    const state = makeState();
    const controls = makeControls();
    const viewer = makeViewer();
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(CUBE_LUT_A));

    await fetchAndApplyLUT('lut_a.cube', fetchFn, controls, viewer, state);

    expect(controls.setLUT).toHaveBeenCalledTimes(1);
    expect(viewer.setLUT).toHaveBeenCalledTimes(1);
    expect(state.lutGeneration).toBe(1);
  });

  it('DCCL-002: slow first request is discarded when fast second completes first', async () => {
    const state = makeState();
    const controls = makeControls();
    const viewer = makeViewer();

    const slow = createDeferredFetch();
    const fast = createDeferredFetch();

    // Start slow request (generation becomes 1)
    const p1 = fetchAndApplyLUT('slow.cube', slow.fetchFn, controls, viewer, state);
    expect(state.lutGeneration).toBe(1);

    // Start fast request (generation becomes 2)
    const p2 = fetchAndApplyLUT('fast.cube', fast.fetchFn, controls, viewer, state);
    expect(state.lutGeneration).toBe(2);

    // Fast completes first
    fast.resolve(makeOkResponse(CUBE_LUT_B));
    await p2;

    expect(controls.setLUT).toHaveBeenCalledTimes(1);
    expect(viewer.setLUT).toHaveBeenCalledTimes(1);
    const appliedLut = viewer.setLUT.mock.calls[0]![0];
    expect(appliedLut.title).toBe('LUT_B');

    // Now slow completes — should be discarded
    slow.resolve(makeOkResponse(CUBE_LUT_A));
    await p1;

    // Still only 1 call — slow result was discarded
    expect(controls.setLUT).toHaveBeenCalledTimes(1);
    expect(viewer.setLUT).toHaveBeenCalledTimes(1);
  });

  it('DCCL-003: three rapid requests — only last applies', async () => {
    const state = makeState();
    const controls = makeControls();
    const viewer = makeViewer();

    const d1 = createDeferredFetch();
    const d2 = createDeferredFetch();
    const d3 = createDeferredFetch();

    const p1 = fetchAndApplyLUT('a.cube', d1.fetchFn, controls, viewer, state);
    const p2 = fetchAndApplyLUT('b.cube', d2.fetchFn, controls, viewer, state);
    const p3 = fetchAndApplyLUT('c.cube', d3.fetchFn, controls, viewer, state);

    expect(state.lutGeneration).toBe(3);

    // Resolve in reverse order
    d3.resolve(makeOkResponse(CUBE_LUT_B));
    await p3;
    d2.resolve(makeOkResponse(CUBE_LUT_A));
    await p2;
    d1.resolve(makeOkResponse(CUBE_LUT_A));
    await p1;

    expect(controls.setLUT).toHaveBeenCalledTimes(1);
    expect(viewer.setLUT).toHaveBeenCalledTimes(1);
    expect(viewer.setLUT.mock.calls[0]![0].title).toBe('LUT_B');
  });

  it('DCCL-004: fetch failure does not apply LUT', async () => {
    const state = makeState();
    const controls = makeControls();
    const viewer = makeViewer();
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));

    await fetchAndApplyLUT('bad.cube', fetchFn, controls, viewer, state);

    expect(controls.setLUT).not.toHaveBeenCalled();
    expect(viewer.setLUT).not.toHaveBeenCalled();
  });

  it('DCCL-005: HTTP error response does not apply LUT', async () => {
    const state = makeState();
    const controls = makeControls();
    const viewer = makeViewer();
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('') });

    await fetchAndApplyLUT('missing.cube', fetchFn, controls, viewer, state);

    expect(controls.setLUT).not.toHaveBeenCalled();
    expect(viewer.setLUT).not.toHaveBeenCalled();
  });

  it('DCCL-006: generation counter starts at 0', () => {
    const state = makeState();
    expect(state.lutGeneration).toBe(0);
  });
});
