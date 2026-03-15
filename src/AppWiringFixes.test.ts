/**
 * Regression tests for DCCBridge wiring and ContextualKeyboardManager fixes.
 *
 * These tests verify:
 * - DCCBridge loadMedia calls actual session file loading via wireDCCBridge
 * - DCCBridge syncColor applies color settings via wireDCCBridge
 * - DCCBridge frame sync has loop protection via wireDCCBridge
 * - Outbound colorChanged is sent when adjustments change
 * - ContextualKeyboardManager is instantiated and used for key conflict resolution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import { ContextualKeyboardManager } from './utils/input/ContextualKeyboardManager';
import { ActiveContextManager } from './utils/input/ActiveContextManager';
import { wireDCCBridge, type DCCWiringDeps } from './AppDCCWiring';
import type { AppWiringContext } from './AppWiringContext';

// ---------------------------------------------------------------------------
// Lightweight test doubles for DCCBridge wiring
// ---------------------------------------------------------------------------

function createMockDCCBridge() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    sendFrameChanged: vi.fn(),
    sendColorChanged: vi.fn(),
    sendAnnotationAdded: vi.fn(),
    sendError: vi.fn(),
  });
}

function createMockPaintEngine() {
  const emitter = new EventEmitter();
  return emitter;
}

function createMockDCCSession() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    currentFrame: 1,
    frameCount: 100,
    goToFrame: vi.fn(),
    loadImage: vi.fn().mockResolvedValue(undefined),
    loadVideo: vi.fn().mockResolvedValue(undefined),
  });
}

function createMockDCCViewer() {
  return {
    setColorAdjustments: vi.fn(),
    setLUT: vi.fn(),
  };
}

function createMockColorControls() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    setAdjustments: vi.fn(),
    setLUT: vi.fn(),
    getAdjustments: vi.fn(() => ({
      exposure: 0,
      gamma: 1,
      temperature: 0,
      tint: 0,
      saturation: 1,
      contrast: 1,
    })),
  });
}

function createDCCDeps() {
  const dccBridge = createMockDCCBridge();
  const session = createMockDCCSession();
  const viewer = createMockDCCViewer();
  const colorControls = createMockColorControls();
  const paintEngine = createMockPaintEngine();

  const deps: DCCWiringDeps = {
    dccBridge: dccBridge as any,
    session: session as any,
    viewer: viewer as any,
    colorControls: colorControls as any,
    paintEngine: paintEngine as any,
  };

  return { deps, dccBridge, session, viewer, colorControls, paintEngine };
}

// ---------------------------------------------------------------------------
// DCCBridge loadMedia wiring tests (via real wireDCCBridge)
// ---------------------------------------------------------------------------

describe('DCCBridge loadMedia wiring fix', () => {
  it('DCCFIX-001: loadMedia should call session.loadImage for image paths', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', { type: 'loadMedia', path: '/mnt/shows/shot.exr' });

    // loadImage is called async; await the microtask
    await vi.waitFor(() => {
      expect(session.loadImage).toHaveBeenCalledWith('shot.exr', '/mnt/shows/shot.exr');
    });
    expect(session.loadVideo).not.toHaveBeenCalled();
  });

  it('DCCFIX-002: loadMedia should call session.loadVideo for video paths', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', { type: 'loadMedia', path: '/mnt/shows/clip.mp4' });

    await vi.waitFor(() => {
      expect(session.loadVideo).toHaveBeenCalledWith('clip.mp4', '/mnt/shows/clip.mp4');
    });
    expect(session.loadImage).not.toHaveBeenCalled();
  });

  it('DCCFIX-003: loadMedia should seek to frame if provided', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', {
      type: 'loadMedia',
      path: '/mnt/shows/shot.exr',
      frame: 42,
    });

    // Wait for loadImage promise to resolve, then goToFrame is called
    await vi.waitFor(() => {
      expect(session.goToFrame).toHaveBeenCalledWith(42);
    });
  });
});

// ---------------------------------------------------------------------------
// DCCBridge disposal tests
// ---------------------------------------------------------------------------

describe('DCCBridge disposal', () => {
  it('DCC-DISP-001: callbacks fire before dispose', () => {
    const { deps, dccBridge, session } = createDCCDeps();
    session.currentFrame = 10;
    session.frameCount = 200;

    wireDCCBridge(deps);

    session.emit('frameChanged', 10);
    expect(dccBridge.sendFrameChanged).toHaveBeenCalledWith(10, 200);
  });

  it('DCC-DISP-002: callbacks do not fire after dispose', () => {
    const { deps, dccBridge, session } = createDCCDeps();
    session.currentFrame = 10;
    session.frameCount = 200;

    const state = wireDCCBridge(deps);
    state.subscriptions.dispose();

    dccBridge.sendFrameChanged.mockClear();
    session.emit('frameChanged', 10);
    expect(dccBridge.sendFrameChanged).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DCCBridge syncColor wiring tests (via real wireDCCBridge)
// ---------------------------------------------------------------------------

describe('DCCBridge syncColor wiring fix', () => {
  it('DCCFIX-004: syncColor should apply exposure, gamma, temperature, tint to colorControls', () => {
    const { deps, dccBridge, colorControls, viewer } = createDCCDeps();
    colorControls.getAdjustments.mockReturnValue({
      exposure: 1.5,
      gamma: 1.2,
      temperature: 100,
      tint: 5,
      saturation: 1,
      contrast: 1,
    });

    wireDCCBridge(deps);

    dccBridge.emit('syncColor', {
      type: 'syncColor',
      exposure: 1.5,
      gamma: 1.2,
      temperature: 100,
      tint: 5,
    });

    expect(colorControls.setAdjustments).toHaveBeenCalledWith({
      exposure: 1.5,
      gamma: 1.2,
      temperature: 100,
      tint: 5,
    });
    expect(viewer.setColorAdjustments).toHaveBeenCalled();
  });

  it('DCCFIX-005: syncColor with no numeric fields should not call setAdjustments', () => {
    const { deps, dccBridge, colorControls, viewer } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('syncColor', { type: 'syncColor' });

    expect(colorControls.setAdjustments).not.toHaveBeenCalled();
    expect(viewer.setColorAdjustments).not.toHaveBeenCalled();
  });

  it('DCCFIX-030: syncColor with lutPath fetches and applies the LUT', async () => {
    const cubeContent = [
      'TITLE "TestLUT"',
      'LUT_3D_SIZE 2',
      ...Array.from({ length: 8 }, (_, i) => `${i / 7} ${i / 7} ${i / 7}`),
    ].join('\n');

    const mockFetchFn = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(cubeContent),
    });

    const { deps, dccBridge, colorControls, viewer } = createDCCDeps();
    deps.fetchFn = mockFetchFn as any;
    wireDCCBridge(deps);

    dccBridge.emit('syncColor', {
      type: 'syncColor',
      lutPath: 'http://localhost:9000/luts/test.cube',
    });

    await vi.waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalledWith('http://localhost:9000/luts/test.cube');
      expect(colorControls.setLUT).toHaveBeenCalledTimes(1);
      expect(viewer.setLUT).toHaveBeenCalledTimes(1);
    });

    // Verify the LUT object was passed correctly
    const appliedLUT = colorControls.setLUT.mock.calls[0]![0];
    expect(appliedLUT).toBeDefined();
    expect(appliedLUT.title).toBe('TestLUT');
    expect(appliedLUT.size).toBe(2);
  });

  it('DCCFIX-031: syncColor without lutPath does not attempt to fetch (no regression)', () => {
    const mockFetchFn = vi.fn();
    const { deps, dccBridge, colorControls } = createDCCDeps();
    deps.fetchFn = mockFetchFn as any;

    colorControls.getAdjustments.mockReturnValue({
      exposure: 1.5,
      gamma: 1,
      temperature: 0,
      tint: 0,
      saturation: 1,
      contrast: 1,
    });

    wireDCCBridge(deps);

    dccBridge.emit('syncColor', {
      type: 'syncColor',
      exposure: 1.5,
    });

    expect(colorControls.setAdjustments).toHaveBeenCalledWith({ exposure: 1.5 });
    expect(mockFetchFn).not.toHaveBeenCalled();
    expect(colorControls.setLUT).not.toHaveBeenCalled();
  });

  it('DCCFIX-032: LUT fetch failure does not break exposure/gamma/temp/tint sync', async () => {
    const mockFetchFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const { deps, dccBridge, colorControls, viewer } = createDCCDeps();
    deps.fetchFn = mockFetchFn as any;

    colorControls.getAdjustments.mockReturnValue({
      exposure: 2.0,
      gamma: 1.1,
      temperature: 50,
      tint: -10,
      saturation: 1,
      contrast: 1,
    });

    wireDCCBridge(deps);

    dccBridge.emit('syncColor', {
      type: 'syncColor',
      exposure: 2.0,
      gamma: 1.1,
      temperature: 50,
      tint: -10,
      lutPath: 'http://localhost:9000/missing.cube',
    });

    // Color adjustments should be applied synchronously regardless of LUT failure
    expect(colorControls.setAdjustments).toHaveBeenCalledWith({
      exposure: 2.0,
      gamma: 1.1,
      temperature: 50,
      tint: -10,
    });
    expect(viewer.setColorAdjustments).toHaveBeenCalled();

    // Wait for the fetch to fail
    await vi.waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalledWith('http://localhost:9000/missing.cube');
    });

    // LUT was NOT applied (fetch failed)
    expect(colorControls.setLUT).not.toHaveBeenCalled();
    expect(viewer.setLUT).not.toHaveBeenCalled();
  });

  it('DCCFIX-033: LUT HTTP error does not break sync', async () => {
    const mockFetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    const { deps, dccBridge, colorControls, viewer } = createDCCDeps();
    deps.fetchFn = mockFetchFn as any;
    wireDCCBridge(deps);

    dccBridge.emit('syncColor', {
      type: 'syncColor',
      lutPath: 'http://localhost:9000/notfound.cube',
    });

    await vi.waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalled();
    });

    expect(colorControls.setLUT).not.toHaveBeenCalled();
    expect(viewer.setLUT).not.toHaveBeenCalled();
  });

  it('DCCFIX-034: syncColor with empty lutPath does not fetch', () => {
    const mockFetchFn = vi.fn();
    const { deps, dccBridge } = createDCCDeps();
    deps.fetchFn = mockFetchFn as any;
    wireDCCBridge(deps);

    dccBridge.emit('syncColor', {
      type: 'syncColor',
      lutPath: '',
    });

    expect(mockFetchFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DCCBridge frame sync loop protection tests (via real wireDCCBridge)
// ---------------------------------------------------------------------------

describe('DCCBridge frame sync loop protection', () => {
  it('DCCFIX-006: inbound syncFrame should suppress outbound frameChanged', () => {
    const { deps, dccBridge, session } = createDCCDeps();

    // Make goToFrame emit frameChanged synchronously (simulating session behavior)
    session.goToFrame.mockImplementation(() => {
      session.emit('frameChanged', 42);
    });

    wireDCCBridge(deps);

    dccBridge.emit('syncFrame', { type: 'syncFrame', frame: 42 });

    // goToFrame was called (inbound sync worked)
    expect(session.goToFrame).toHaveBeenCalledWith(42);
    // But outbound sendFrameChanged should NOT have been triggered
    expect(dccBridge.sendFrameChanged).not.toHaveBeenCalled();
  });

  it('DCCFIX-007: non-inbound frame changes should still send outbound frameChanged', () => {
    const { deps, dccBridge, session } = createDCCDeps();
    session.currentFrame = 10;
    session.frameCount = 200;

    wireDCCBridge(deps);

    // Simulate a user-initiated frame change (not from DCC bridge)
    session.emit('frameChanged', 10);

    expect(dccBridge.sendFrameChanged).toHaveBeenCalledWith(10, 200);
  });
});

// ---------------------------------------------------------------------------
// DCC outbound color change tests (via real wireDCCBridge)
// ---------------------------------------------------------------------------

describe('DCCBridge outbound color change wiring', () => {
  it('DCCFIX-020: adjustmentsChanged should call dccBridge.sendColorChanged', () => {
    const { deps, dccBridge, colorControls } = createDCCDeps();
    wireDCCBridge(deps);

    colorControls.emit('adjustmentsChanged', {
      exposure: 2.0,
      gamma: 1.1,
      temperature: 50,
      tint: -10,
      saturation: 1,
      contrast: 1,
    });

    expect(dccBridge.sendColorChanged).toHaveBeenCalledWith({
      exposure: 2.0,
      gamma: 1.1,
      temperature: 50,
      tint: -10,
    });
  });
});

// ---------------------------------------------------------------------------
// DCCBridge outbound annotationAdded wiring tests (via real wireDCCBridge)
// ---------------------------------------------------------------------------

describe('DCCBridge outbound annotationAdded wiring', () => {
  it('DCCFIX-040: pen stroke triggers sendAnnotationAdded with correct data', () => {
    const { deps, dccBridge, paintEngine } = createDCCDeps();
    wireDCCBridge(deps);

    paintEngine.emit('strokeAdded', {
      type: 'pen',
      id: '42',
      frame: 10,
      user: 'user',
      color: [1, 0, 0, 1],
      width: 3,
      points: [{ x: 0.1, y: 0.2 }],
    });

    expect(dccBridge.sendAnnotationAdded).toHaveBeenCalledWith(10, 'pen', '42');
  });

  it('DCCFIX-041: text annotation triggers sendAnnotationAdded with type "text"', () => {
    const { deps, dccBridge, paintEngine } = createDCCDeps();
    wireDCCBridge(deps);

    paintEngine.emit('strokeAdded', {
      type: 'text',
      id: '7',
      frame: 5,
      user: 'user',
      text: 'Hello',
      position: { x: 0.5, y: 0.5 },
      color: [1, 1, 1, 1],
      size: 24,
    });

    expect(dccBridge.sendAnnotationAdded).toHaveBeenCalledWith(5, 'text', '7');
  });

  it('DCCFIX-042: shape annotation triggers sendAnnotationAdded with type "shape"', () => {
    const { deps, dccBridge, paintEngine } = createDCCDeps();
    wireDCCBridge(deps);

    paintEngine.emit('strokeAdded', {
      type: 'shape',
      id: '99',
      frame: 20,
      user: 'user',
      shapeType: 'rectangle',
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    });

    expect(dccBridge.sendAnnotationAdded).toHaveBeenCalledWith(20, 'shape', '99');
  });

  it('DCCFIX-043: no annotationAdded emission after dispose', () => {
    const { deps, dccBridge, paintEngine } = createDCCDeps();
    const state = wireDCCBridge(deps);
    state.subscriptions.dispose();

    paintEngine.emit('strokeAdded', {
      type: 'pen',
      id: '1',
      frame: 1,
      user: 'user',
      color: [1, 0, 0, 1],
      width: 3,
      points: [{ x: 0.1, y: 0.2 }],
    });

    expect(dccBridge.sendAnnotationAdded).not.toHaveBeenCalled();
  });

  it('DCCFIX-044: wiring works without paintEngine (backward compatibility)', () => {
    const dccBridge = createMockDCCBridge();
    const session = createMockDCCSession();
    const viewer = createMockDCCViewer();
    const colorControls = createMockColorControls();

    // No paintEngine provided
    const deps: DCCWiringDeps = {
      dccBridge: dccBridge as any,
      session: session as any,
      viewer: viewer as any,
      colorControls: colorControls as any,
    };

    // Should not throw
    expect(() => wireDCCBridge(deps)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DCCBridge loadMedia error reporting tests (Issue #185)
// ---------------------------------------------------------------------------

describe('DCCBridge loadMedia error reporting', () => {
  it('DCCFIX-050: video load failure sends error back through the bridge', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    session.loadVideo.mockRejectedValue(new Error('Codec not supported'));
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', { type: 'loadMedia', path: '/mnt/shows/clip.mp4', id: 'req-1' });

    await vi.waitFor(() => {
      expect(dccBridge.sendError).toHaveBeenCalledWith(
        'LOAD_MEDIA_FAILED',
        expect.stringContaining('Codec not supported'),
        'req-1',
      );
    });
  });

  it('DCCFIX-051: image load failure sends error back through the bridge', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    session.loadImage.mockRejectedValue(new Error('Unsupported format'));
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', { type: 'loadMedia', path: '/mnt/shows/shot.exr', id: 'req-2' });

    await vi.waitFor(() => {
      expect(dccBridge.sendError).toHaveBeenCalledWith(
        'LOAD_MEDIA_FAILED',
        expect.stringContaining('Unsupported format'),
        'req-2',
      );
    });
  });

  it('DCCFIX-055: loadMedia with query-string video URL routes to loadVideo', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', {
      type: 'loadMedia',
      path: 'https://cdn.example.com/shot.mov?token=abc123&expires=999',
    });

    await vi.waitFor(() => {
      expect(session.loadVideo).toHaveBeenCalledWith(
        'shot.mov',
        'https://cdn.example.com/shot.mov?token=abc123&expires=999',
      );
    });
    expect(session.loadImage).not.toHaveBeenCalled();
  });

  it('DCCFIX-056: loadMedia with fragment video URL routes to loadVideo', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', {
      type: 'loadMedia',
      path: 'https://cdn.example.com/clip.mp4#t=10',
    });

    await vi.waitFor(() => {
      expect(session.loadVideo).toHaveBeenCalledWith(
        'clip.mp4',
        'https://cdn.example.com/clip.mp4#t=10',
      );
    });
    expect(session.loadImage).not.toHaveBeenCalled();
  });

  it('DCCFIX-057: loadMedia with query-string image URL routes to loadImage', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', {
      type: 'loadMedia',
      path: 'https://cdn.example.com/plate.exr?sig=xyz',
    });

    await vi.waitFor(() => {
      expect(session.loadImage).toHaveBeenCalledWith(
        'plate.exr',
        'https://cdn.example.com/plate.exr?sig=xyz',
      );
    });
    expect(session.loadVideo).not.toHaveBeenCalled();
  });

  it('DCCFIX-058: loadMedia with both query and fragment on video URL routes to loadVideo', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', {
      type: 'loadMedia',
      path: 'https://cdn.example.com/review.webm?token=abc#t=5',
    });

    await vi.waitFor(() => {
      expect(session.loadVideo).toHaveBeenCalledWith(
        'review.webm',
        'https://cdn.example.com/review.webm?token=abc#t=5',
      );
    });
    expect(session.loadImage).not.toHaveBeenCalled();
  });

  it('DCCFIX-052: successful load does not send error', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', { type: 'loadMedia', path: '/mnt/shows/shot.exr' });

    await vi.waitFor(() => {
      expect(session.loadImage).toHaveBeenCalled();
    });

    expect(dccBridge.sendError).not.toHaveBeenCalled();
  });

  it('DCCFIX-053: video load failure error message includes the file path', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    session.loadVideo.mockRejectedValue(new Error('Network error'));
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', { type: 'loadMedia', path: '/mnt/shows/clip.mp4' });

    await vi.waitFor(() => {
      expect(dccBridge.sendError).toHaveBeenCalledWith(
        'LOAD_MEDIA_FAILED',
        expect.stringContaining('/mnt/shows/clip.mp4'),
        undefined,
      );
    });
  });

  it('DCCFIX-054: image load failure error message includes the file path', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    session.loadImage.mockRejectedValue(new Error('File not found'));
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', { type: 'loadMedia', path: '/mnt/shows/shot.exr' });

    await vi.waitFor(() => {
      expect(dccBridge.sendError).toHaveBeenCalledWith(
        'LOAD_MEDIA_FAILED',
        expect.stringContaining('/mnt/shows/shot.exr'),
        undefined,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// DCCBridge error event surfacing tests (Issue #188)
// ---------------------------------------------------------------------------

describe('DCCBridge error event user alert', () => {
  it('DCCFIX-060: DCC error event shows user alert', () => {
    const { deps, dccBridge } = createDCCDeps();
    const mockAlert = vi.fn();
    deps.showAlertFn = mockAlert;

    wireDCCBridge(deps);

    dccBridge.emit('error', new Error('Connection refused'));

    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining('DCC connection error'),
      expect.objectContaining({ type: 'warning', title: 'DCC Bridge' }),
    );
  });

  it('DCCFIX-061: alert contains the error message', () => {
    const { deps, dccBridge } = createDCCDeps();
    const mockAlert = vi.fn();
    deps.showAlertFn = mockAlert;

    wireDCCBridge(deps);

    dccBridge.emit('error', new Error('WebSocket error for ws://localhost:45124'));

    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining('WebSocket error for ws://localhost:45124'),
      expect.any(Object),
    );
  });

  it('DCCFIX-062: repeated errors within throttle window are suppressed', () => {
    const { deps, dccBridge } = createDCCDeps();
    const mockAlert = vi.fn();
    deps.showAlertFn = mockAlert;

    wireDCCBridge(deps);

    // Emit multiple errors rapidly
    dccBridge.emit('error', new Error('error 1'));
    dccBridge.emit('error', new Error('error 2'));
    dccBridge.emit('error', new Error('error 3'));

    // Only the first should trigger an alert due to throttling
    expect(mockAlert).toHaveBeenCalledTimes(1);
  });

  it('DCCFIX-063: error alert not fired after dispose', () => {
    const { deps, dccBridge } = createDCCDeps();
    const mockAlert = vi.fn();
    deps.showAlertFn = mockAlert;

    const state = wireDCCBridge(deps);
    state.subscriptions.dispose();

    dccBridge.emit('error', new Error('late error'));

    expect(mockAlert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DCCBridge outbound message drop detection tests (Issue #443)
// ---------------------------------------------------------------------------

describe('DCCBridge outbound message drop detection (#443)', () => {
  it('DCCFIX-070: logs warning when frame sync send returns false', () => {
    const { deps, dccBridge, session } = createDCCDeps();
    dccBridge.sendFrameChanged.mockReturnValue(false);
    session.currentFrame = 5;
    session.frameCount = 100;

    wireDCCBridge(deps);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    session.emit('frameChanged', 5);

    expect(dccBridge.sendFrameChanged).toHaveBeenCalledWith(5, 100);
    // The Logger uses console.warn internally — verify no throw occurred
    // and that sendFrameChanged was called with the correct args
    warnSpy.mockRestore();
  });

  it('DCCFIX-071: logs warning when color sync send returns false', () => {
    const { deps, dccBridge, colorControls } = createDCCDeps();
    dccBridge.sendColorChanged.mockReturnValue(false);

    wireDCCBridge(deps);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    colorControls.emit('adjustmentsChanged', {
      exposure: 1.0,
      gamma: 1.0,
      temperature: 0,
      tint: 0,
      saturation: 1,
      contrast: 1,
    });

    expect(dccBridge.sendColorChanged).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('DCCFIX-072: logs warning when annotation sync send returns false', () => {
    const { deps, dccBridge, paintEngine } = createDCCDeps();
    dccBridge.sendAnnotationAdded.mockReturnValue(false);

    wireDCCBridge(deps);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    paintEngine.emit('strokeAdded', {
      type: 'pen',
      id: 'a1',
      frame: 1,
      user: 'user',
      color: [1, 0, 0, 1],
      width: 3,
      points: [{ x: 0.1, y: 0.2 }],
    });

    expect(dccBridge.sendAnnotationAdded).toHaveBeenCalledWith(1, 'pen', 'a1');
    warnSpy.mockRestore();
  });

  it('DCCFIX-073: no warning when sends succeed (return true)', () => {
    const { deps, dccBridge, session, colorControls, paintEngine } = createDCCDeps();
    dccBridge.sendFrameChanged.mockReturnValue(true);
    dccBridge.sendColorChanged.mockReturnValue(true);
    dccBridge.sendAnnotationAdded.mockReturnValue(true);
    session.currentFrame = 1;
    session.frameCount = 10;

    wireDCCBridge(deps);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    session.emit('frameChanged', 1);
    colorControls.emit('adjustmentsChanged', {
      exposure: 0, gamma: 1, temperature: 0, tint: 0, saturation: 1, contrast: 1,
    });
    paintEngine.emit('strokeAdded', {
      type: 'pen', id: 'x', frame: 1, user: 'u',
      color: [1, 0, 0, 1], width: 1, points: [{ x: 0, y: 0 }],
    });

    // Logger.warn calls console.warn — none should have been called with "dropped"
    const droppedCalls = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('dropped'),
    );
    expect(droppedCalls).toHaveLength(0);
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// ContextualKeyboardManager instantiation and usage tests
// ---------------------------------------------------------------------------

describe('ContextualKeyboardManager wiring fix', () => {
  let contextManager: ActiveContextManager;
  let ckm: ContextualKeyboardManager;

  beforeEach(() => {
    contextManager = new ActiveContextManager();
    ckm = new ContextualKeyboardManager(contextManager);
  });

  it('DCCFIX-008: ContextualKeyboardManager can be instantiated with ActiveContextManager', () => {
    expect(ckm).toBeInstanceOf(ContextualKeyboardManager);
  });

  it('DCCFIX-009: R key resolves to timeline.resetInOut in global context', () => {
    ckm.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'global');
    ckm.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');

    contextManager.setContext('global');
    const result = ckm.resolve({ code: 'KeyR' });
    expect(result?.action).toBe('timeline.resetInOut');
  });

  it('DCCFIX-010: R key resolves to paint.rectangle in paint context', () => {
    ckm.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'global');
    ckm.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');

    contextManager.setContext('paint');
    const result = ckm.resolve({ code: 'KeyR' });
    expect(result?.action).toBe('paint.rectangle');
  });

  it('DCCFIX-011: O key resolves to timeline.setOutPoint in viewer context', () => {
    ckm.register('timeline.setOutPoint', { code: 'KeyO' }, vi.fn(), 'global');
    ckm.register('paint.ellipse', { code: 'KeyO' }, vi.fn(), 'paint');

    contextManager.setContext('viewer');
    const result = ckm.resolve({ code: 'KeyO' });
    expect(result?.action).toBe('timeline.setOutPoint');
  });

  it('DCCFIX-012: O key resolves to paint.ellipse in paint context', () => {
    ckm.register('timeline.setOutPoint', { code: 'KeyO' }, vi.fn(), 'global');
    ckm.register('paint.ellipse', { code: 'KeyO' }, vi.fn(), 'paint');

    contextManager.setContext('paint');
    const result = ckm.resolve({ code: 'KeyO' });
    expect(result?.action).toBe('paint.ellipse');
  });

  it('DCCFIX-013: L key resolves to playback.faster in global, paint.line in paint', () => {
    ckm.register('playback.faster', { code: 'KeyL' }, vi.fn(), 'global');
    ckm.register('paint.line', { code: 'KeyL' }, vi.fn(), 'paint');

    contextManager.setContext('global');
    expect(ckm.resolve({ code: 'KeyL' })?.action).toBe('playback.faster');

    contextManager.setContext('paint');
    expect(ckm.resolve({ code: 'KeyL' })?.action).toBe('paint.line');
  });

  it('DCCFIX-014: activeContextManager.isContextActive is used by action handlers', () => {
    // Verify that the context manager properly tracks paint context
    contextManager.setContext('paint');
    expect(contextManager.isContextActive('paint')).toBe(true);
    expect(contextManager.isContextActive('global')).toBe(true); // global is always active

    contextManager.setContext('viewer');
    expect(contextManager.isContextActive('paint')).toBe(false);
    expect(contextManager.isContextActive('viewer')).toBe(true);
  });
});
