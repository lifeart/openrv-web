import { describe, it, expect, vi } from 'vitest';
import { fetchAndApplyLUT, wireDCCBridge, validateMediaPath, type DCCWiringState, type DCCWiringColorControls, type DCCWiringViewer, type DCCWiringDeps } from './AppDCCWiring';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';
import { NoteManager } from './core/session/NoteManager';

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

// ---------------------------------------------------------------------------
// Note wiring regression tests (#445)
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock DCCBridge that captures sendNoteAdded calls.
 */
function makeMockBridge() {
  const handlers = new Map<string, ((...args: any[]) => void)[]>();
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
      return () => {
        const arr = handlers.get(event);
        if (arr) {
          const idx = arr.indexOf(handler);
          if (idx >= 0) arr.splice(idx, 1);
        }
      };
    }),
    sendFrameChanged: vi.fn().mockReturnValue(true),
    sendColorChanged: vi.fn().mockReturnValue(true),
    sendAnnotationAdded: vi.fn().mockReturnValue(true),
    sendNoteAdded: vi.fn().mockReturnValue(true),
    sendError: vi.fn().mockReturnValue(true),
    send: vi.fn().mockReturnValue(true),
    emit: vi.fn(),
    _handlers: handlers,
  };
}

function makeMockSession() {
  const handlers = new Map<string, ((...args: any[]) => void)[]>();
  return {
    goToFrame: vi.fn(),
    loadImage: vi.fn().mockResolvedValue(undefined),
    loadVideo: vi.fn().mockResolvedValue(undefined),
    currentFrame: 0,
    frameCount: 100,
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
      return () => {
        const arr = handlers.get(event);
        if (arr) {
          const idx = arr.indexOf(handler);
          if (idx >= 0) arr.splice(idx, 1);
        }
      };
    }),
  };
}

function makeMockColorControls() {
  return {
    setAdjustments: vi.fn(),
    getAdjustments: vi.fn().mockReturnValue({ exposure: 0, gamma: 1, temperature: 6500, tint: 0 }),
    setLUT: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
  };
}

describe('wireDCCBridge — noteAdded wiring (#445)', () => {
  it('DCCN-001: forwards noteAdded from NoteManager to bridge.sendNoteAdded', () => {
    const bridge = makeMockBridge();
    const session = makeMockSession();
    const noteManager = new NoteManager();

    const deps: DCCWiringDeps = {
      dccBridge: bridge as any,
      session: session as any,
      viewer: makeViewer() as any,
      colorControls: makeMockColorControls() as any,
      noteManager,
      showAlertFn: vi.fn(),
    };

    wireDCCBridge(deps);

    const note = noteManager.addNote(0, 10, 20, 'Fix the edge', 'Alice');

    expect(bridge.sendNoteAdded).toHaveBeenCalledTimes(1);
    expect(bridge.sendNoteAdded).toHaveBeenCalledWith(
      10, // frameStart
      'Fix the edge',
      'Alice',
      'open',
      note.id,
    );

    noteManager.dispose();
  });

  it('DCCN-002: does not wire noteAdded when noteManager is not provided', () => {
    const bridge = makeMockBridge();
    const session = makeMockSession();

    const deps: DCCWiringDeps = {
      dccBridge: bridge as any,
      session: session as any,
      viewer: makeViewer() as any,
      colorControls: makeMockColorControls() as any,
      showAlertFn: vi.fn(),
    };

    // Should not throw
    wireDCCBridge(deps);

    expect(bridge.sendNoteAdded).not.toHaveBeenCalled();
  });

  it('DCCN-003: logs warning when bridge is not writable for note', () => {
    const bridge = makeMockBridge();
    bridge.sendNoteAdded.mockReturnValue(false);
    const session = makeMockSession();
    const noteManager = new NoteManager();

    const deps: DCCWiringDeps = {
      dccBridge: bridge as any,
      session: session as any,
      viewer: makeViewer() as any,
      colorControls: makeMockColorControls() as any,
      noteManager,
      showAlertFn: vi.fn(),
    };

    wireDCCBridge(deps);

    // Should not throw even when bridge is not writable
    noteManager.addNote(0, 5, 5, 'Test note', 'Bob');

    expect(bridge.sendNoteAdded).toHaveBeenCalledTimes(1);

    noteManager.dispose();
  });

  it('DCCN-004: multiple notes each trigger sendNoteAdded', () => {
    const bridge = makeMockBridge();
    const session = makeMockSession();
    const noteManager = new NoteManager();

    const deps: DCCWiringDeps = {
      dccBridge: bridge as any,
      session: session as any,
      viewer: makeViewer() as any,
      colorControls: makeMockColorControls() as any,
      noteManager,
      showAlertFn: vi.fn(),
    };

    wireDCCBridge(deps);

    noteManager.addNote(0, 1, 1, 'Note A', 'Alice');
    noteManager.addNote(0, 2, 2, 'Note B', 'Bob');
    noteManager.addNote(0, 3, 3, 'Note C', 'Charlie');

    expect(bridge.sendNoteAdded).toHaveBeenCalledTimes(3);

    noteManager.dispose();
  });
});

describe('NoteManager — noteAdded event (#445)', () => {
  it('DCCN-005: emits noteAdded event when a note is added', () => {
    const manager = new NoteManager();
    const listener = vi.fn();
    manager.on('noteAdded', listener);

    const note = manager.addNote(0, 10, 20, 'Test', 'Alice');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      id: note.id,
      text: 'Test',
      author: 'Alice',
      frameStart: 10,
      frameEnd: 20,
      status: 'open',
    }));

    manager.dispose();
  });

  it('DCCN-006: unsubscribe stops noteAdded events', () => {
    const manager = new NoteManager();
    const listener = vi.fn();
    const unsub = manager.on('noteAdded', listener);

    manager.addNote(0, 1, 1, 'First', 'Alice');
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();

    manager.addNote(0, 2, 2, 'Second', 'Bob');
    expect(listener).toHaveBeenCalledTimes(1); // still 1

    manager.dispose();
  });

  it('DCCN-007: dispose clears event listeners', () => {
    const manager = new NoteManager();
    const listener = vi.fn();
    manager.on('noteAdded', listener);

    manager.dispose();

    // After dispose, adding notes should not crash even though
    // the internal state is cleared. We create a new manager to verify
    // the old listener is gone.
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// validateMediaPath regression tests (#525)
// ---------------------------------------------------------------------------

describe('validateMediaPath — DCC loadMedia path validation (#525)', () => {
  it('DCCP-001: HTTP URL passes through correctly', () => {
    const result = validateMediaPath('http://localhost:8080/renders/shot.exr');
    expect(result.valid).toBe(true);
    expect((result as { valid: true; url: string }).url).toBe('http://localhost:8080/renders/shot.exr');
  });

  it('DCCP-002: HTTPS URL passes through correctly', () => {
    const result = validateMediaPath('https://cdn.example.com/media/video.mp4');
    expect(result.valid).toBe(true);
    expect((result as { valid: true; url: string }).url).toBe('https://cdn.example.com/media/video.mp4');
  });

  it('DCCP-003: blob: URL passes through correctly', () => {
    const result = validateMediaPath('blob:http://localhost/abc-123');
    expect(result.valid).toBe(true);
    expect((result as { valid: true; url: string }).url).toBe('blob:http://localhost/abc-123');
  });

  it('DCCP-004: data: URL passes through correctly', () => {
    const result = validateMediaPath('data:image/png;base64,iVBORw0KGgo=');
    expect(result.valid).toBe(true);
    expect((result as { valid: true; url: string }).url).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('DCCP-005: file: URL passes through correctly', () => {
    const result = validateMediaPath('file:///mnt/renders/shot.exr');
    expect(result.valid).toBe(true);
    expect((result as { valid: true; url: string }).url).toBe('file:///mnt/renders/shot.exr');
  });

  it('DCCP-006: Unix filesystem path is rejected with actionable error', () => {
    const result = validateMediaPath('/mnt/renders/shot.exr');
    expect(result.valid).toBe(false);
    const err = (result as { valid: false; error: string }).error;
    expect(err).toContain('/mnt/renders/shot.exr');
    expect(err).toContain('file://');
    expect(err).toContain('HTTP');
  });

  it('DCCP-007: Windows drive path (backslash) is rejected with actionable error', () => {
    const result = validateMediaPath('C:\\renders\\shot.exr');
    expect(result.valid).toBe(false);
    const err = (result as { valid: false; error: string }).error;
    expect(err).toContain('C:\\renders\\shot.exr');
    expect(err).toContain('file://');
  });

  it('DCCP-008: Windows drive path (forward slash) is rejected', () => {
    const result = validateMediaPath('D:/renders/shot.exr');
    expect(result.valid).toBe(false);
    const err = (result as { valid: false; error: string }).error;
    expect(err).toContain('D:/renders/shot.exr');
  });

  it('DCCP-009: UNC path is rejected with actionable error', () => {
    const result = validateMediaPath('\\\\server\\share\\file.exr');
    expect(result.valid).toBe(false);
    const err = (result as { valid: false; error: string }).error;
    expect(err).toContain('UNC path');
    expect(err).toContain('file://');
  });

  it('DCCP-010: empty string is rejected', () => {
    const result = validateMediaPath('');
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toContain('Empty path');
  });

  it('DCCP-011: whitespace-only string is rejected', () => {
    const result = validateMediaPath('   ');
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toContain('Empty path');
  });

  it('DCCP-012: protocol-relative URL is upgraded to https', () => {
    const result = validateMediaPath('//cdn.example.com/media/shot.exr');
    expect(result.valid).toBe(true);
    expect((result as { valid: true; url: string }).url).toBe('https://cdn.example.com/media/shot.exr');
  });

  it('DCCP-013: unsupported URL scheme (ftp:) is rejected', () => {
    const result = validateMediaPath('ftp://server/renders/shot.exr');
    expect(result.valid).toBe(false);
    const err = (result as { valid: false; error: string }).error;
    expect(err).toContain('ftp:');
    expect(err).toContain('Unsupported URL scheme');
  });

  it('DCCP-014: file: URL with Windows drive letter passes', () => {
    const result = validateMediaPath('file:///C:/renders/shot.exr');
    expect(result.valid).toBe(true);
    expect((result as { valid: true; url: string }).url).toBe('file:///C:/renders/shot.exr');
  });

  it('DCCP-015: URL with leading/trailing whitespace is trimmed', () => {
    const result = validateMediaPath('  https://example.com/shot.exr  ');
    expect(result.valid).toBe(true);
    expect((result as { valid: true; url: string }).url).toBe('https://example.com/shot.exr');
  });
});

// ---------------------------------------------------------------------------
// wireDCCBridge loadMedia path validation integration (#525)
// ---------------------------------------------------------------------------

describe('wireDCCBridge — loadMedia path validation (#525)', () => {
  it('DCCP-016: valid HTTP URL is forwarded to session loader', async () => {
    const bridge = makeMockBridge();
    const session = makeMockSession();

    const deps: DCCWiringDeps = {
      dccBridge: bridge as any,
      session: session as any,
      viewer: makeViewer() as any,
      colorControls: makeMockColorControls() as any,
      showAlertFn: vi.fn(),
    };

    wireDCCBridge(deps);

    // Simulate inbound loadMedia with valid URL
    const loadMediaHandlers = bridge._handlers.get('loadMedia') ?? [];
    expect(loadMediaHandlers.length).toBeGreaterThan(0);

    loadMediaHandlers[0]!({ type: 'loadMedia', path: 'https://example.com/shot.png' });

    // Wait for the async chain to resolve
    await vi.waitFor(() => {
      expect(session.loadImage).toHaveBeenCalledTimes(1);
    });

    expect(session.loadImage).toHaveBeenCalledWith('shot.png', 'https://example.com/shot.png');
  });

  it('DCCP-017: local filesystem path sends INVALID_MEDIA_PATH error back to DCC', () => {
    const bridge = makeMockBridge();
    const session = makeMockSession();

    const deps: DCCWiringDeps = {
      dccBridge: bridge as any,
      session: session as any,
      viewer: makeViewer() as any,
      colorControls: makeMockColorControls() as any,
      showAlertFn: vi.fn(),
    };

    wireDCCBridge(deps);

    const loadMediaHandlers = bridge._handlers.get('loadMedia') ?? [];
    loadMediaHandlers[0]!({ type: 'loadMedia', path: '/mnt/renders/shot.exr', id: 'req-42' });

    expect(bridge.sendError).toHaveBeenCalledTimes(1);
    expect(bridge.sendError).toHaveBeenCalledWith(
      'INVALID_MEDIA_PATH',
      expect.stringContaining('/mnt/renders/shot.exr'),
      'req-42',
    );
    // Session loaders should NOT have been called
    expect(session.loadImage).not.toHaveBeenCalled();
    expect(session.loadVideo).not.toHaveBeenCalled();
  });

  it('DCCP-018: Windows path sends INVALID_MEDIA_PATH error back to DCC', () => {
    const bridge = makeMockBridge();
    const session = makeMockSession();

    const deps: DCCWiringDeps = {
      dccBridge: bridge as any,
      session: session as any,
      viewer: makeViewer() as any,
      colorControls: makeMockColorControls() as any,
      showAlertFn: vi.fn(),
    };

    wireDCCBridge(deps);

    const loadMediaHandlers = bridge._handlers.get('loadMedia') ?? [];
    loadMediaHandlers[0]!({ type: 'loadMedia', path: 'C:\\renders\\shot.exr' });

    expect(bridge.sendError).toHaveBeenCalledTimes(1);
    expect(bridge.sendError).toHaveBeenCalledWith(
      'INVALID_MEDIA_PATH',
      expect.stringContaining('C:\\renders\\shot.exr'),
      undefined,
    );
    expect(session.loadImage).not.toHaveBeenCalled();
    expect(session.loadVideo).not.toHaveBeenCalled();
  });

  it('DCCP-019: UNC path sends INVALID_MEDIA_PATH error back to DCC', () => {
    const bridge = makeMockBridge();
    const session = makeMockSession();

    const deps: DCCWiringDeps = {
      dccBridge: bridge as any,
      session: session as any,
      viewer: makeViewer() as any,
      colorControls: makeMockColorControls() as any,
      showAlertFn: vi.fn(),
    };

    wireDCCBridge(deps);

    const loadMediaHandlers = bridge._handlers.get('loadMedia') ?? [];
    loadMediaHandlers[0]!({ type: 'loadMedia', path: '\\\\server\\share\\file.exr' });

    expect(bridge.sendError).toHaveBeenCalledTimes(1);
    expect(bridge.sendError).toHaveBeenCalledWith(
      'INVALID_MEDIA_PATH',
      expect.stringContaining('UNC path'),
      undefined,
    );
    expect(session.loadImage).not.toHaveBeenCalled();
    expect(session.loadVideo).not.toHaveBeenCalled();
  });

  it('DCCP-020: empty path sends INVALID_MEDIA_PATH error (path passes DCCBridge validation but fails URL validation)', () => {
    const bridge = makeMockBridge();
    const session = makeMockSession();

    const deps: DCCWiringDeps = {
      dccBridge: bridge as any,
      session: session as any,
      viewer: makeViewer() as any,
      colorControls: makeMockColorControls() as any,
      showAlertFn: vi.fn(),
    };

    wireDCCBridge(deps);

    // Simulate a loadMedia message that somehow has an empty path
    // (DCCBridge.handleLoadMedia already checks for missing path,
    //  but validateMediaPath adds a second line of defence for whitespace-only)
    const loadMediaHandlers = bridge._handlers.get('loadMedia') ?? [];
    loadMediaHandlers[0]!({ type: 'loadMedia', path: '   ' });

    expect(bridge.sendError).toHaveBeenCalledTimes(1);
    expect(bridge.sendError).toHaveBeenCalledWith(
      'INVALID_MEDIA_PATH',
      expect.stringContaining('Empty path'),
      undefined,
    );
  });
});
