import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RenderLoopService, type RenderLoopDeps } from './RenderLoopService';

// ---------------------------------------------------------------------------
// Lightweight test doubles
// ---------------------------------------------------------------------------

function createMockSession() {
  return {
    isPlaying: false,
    currentFrame: 0,
    currentSource: null as { type: string } | null,
    update: vi.fn(),
  };
}

function createMockViewer() {
  return {
    renderDirect: vi.fn(),
  };
}

function createDeps() {
  const session = createMockSession();
  const viewer = createMockViewer();
  return { session, viewer };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RenderLoopService', () => {
  let deps: ReturnType<typeof createDeps>;
  let service: RenderLoopService;
  let rafCallback: FrameRequestCallback | null;
  let rafId: number;

  beforeEach(() => {
    rafId = 0;
    rafCallback = null;

    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return ++rafId;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    deps = createDeps();
    service = new RenderLoopService(deps as RenderLoopDeps);
  });

  afterEach(() => {
    service.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('RL-001: start() calls requestAnimationFrame', () => {
    service.start();

    // tick() runs synchronously, then schedules the next frame
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).toHaveBeenCalledWith(expect.any(Function));
  });

  it('RL-002: tick() calls session.update()', () => {
    service.start();

    expect(deps.session.update).toHaveBeenCalledTimes(1);
  });

  it('RL-003: tick() calls viewer.renderDirect() when playing video and frame changed', () => {
    deps.session.isPlaying = true;
    deps.session.currentSource = { type: 'video' };
    deps.session.currentFrame = 0;

    // Simulate frame advancing inside session.update()
    deps.session.update.mockImplementation(() => {
      deps.session.currentFrame = 1;
    });

    service.start();

    expect(deps.viewer.renderDirect).toHaveBeenCalledTimes(1);
  });

  it('RL-004: tick() does not call renderDirect when frame has not changed', () => {
    deps.session.isPlaying = true;
    deps.session.currentSource = { type: 'video' };
    deps.session.currentFrame = 5;

    // update() does not change currentFrame
    service.start();

    expect(deps.viewer.renderDirect).not.toHaveBeenCalled();
  });

  it('RL-005: stop() cancels the animation frame', () => {
    service.start();

    const id = rafId;
    service.stop();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(id);
  });

  it('RL-006: dispose() stops the loop', () => {
    service.start();

    const id = rafId;
    service.dispose();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(id);
  });

  it('RL-007: tick() does not call renderDirect for non-video sources', () => {
    deps.session.isPlaying = true;
    deps.session.currentSource = { type: 'image' };
    deps.session.currentFrame = 0;

    deps.session.update.mockImplementation(() => {
      deps.session.currentFrame = 1;
    });

    service.start();

    expect(deps.viewer.renderDirect).not.toHaveBeenCalled();
  });

  it('RL-008: tick() does not call renderDirect when not playing', () => {
    deps.session.isPlaying = false;
    deps.session.currentSource = { type: 'video' };
    deps.session.currentFrame = 0;

    deps.session.update.mockImplementation(() => {
      deps.session.currentFrame = 1;
    });

    service.start();

    expect(deps.viewer.renderDirect).not.toHaveBeenCalled();
  });

  it('RL-009: stop() is idempotent when not running', () => {
    // Should not throw
    service.stop();
    service.stop();

    expect(cancelAnimationFrame).not.toHaveBeenCalled();
  });

  it('RL-010: subsequent ticks continue via rAF chain', () => {
    service.start();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    // Simulate the browser calling the rAF callback
    rafCallback!(performance.now());

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(deps.session.update).toHaveBeenCalledTimes(2);
  });
});
