import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioOrchestrator, type AudioOrchestratorDeps, type AudioOrchestratorSource } from './AudioOrchestrator';
import { AudioMixer } from '../audio/AudioMixer';

// ---------------------------------------------------------------------------
// Lightweight test doubles
// ---------------------------------------------------------------------------

type EventHandler = (...args: unknown[]) => void;

function createMockSession() {
  const handlers = new Map<string, EventHandler[]>();
  return {
    currentFrame: 0,
    fps: 24,
    on: vi.fn().mockImplementation((event: string, handler: EventHandler) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    off: vi.fn().mockImplementation((event: string, handler: EventHandler) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    }),
    _emit(event: string, ...args: unknown[]) {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h(...args);
      }
    },
    _handlers: handlers,
  };
}

function createMockAudioMixer() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
    getTrack: vi.fn().mockReturnValue(undefined),
    removeTrack: vi.fn(),
    addTrack: vi.fn(),
    loadTrackBuffer: vi.fn(),
  } as unknown as AudioMixer;
}

function createDeps() {
  return {
    session: createMockSession(),
    audioMixer: createMockAudioMixer(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioOrchestrator', () => {
  let deps: ReturnType<typeof createDeps>;
  let orchestrator: AudioOrchestrator;

  beforeEach(() => {
    deps = createDeps();
    orchestrator = new AudioOrchestrator(deps as unknown as AudioOrchestratorDeps);
  });

  afterEach(() => {
    orchestrator.dispose();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // AO-001: Constructor stores dependencies
  // -------------------------------------------------------------------------
  it('AO-001: constructor stores the audio mixer', () => {
    expect(orchestrator.getAudioMixer()).toBe(deps.audioMixer);
  });

  it('AO-002: constructor creates a default AudioMixer if none provided', () => {
    const session = createMockSession();
    const orch = new AudioOrchestrator({ session } as unknown as AudioOrchestratorDeps);
    expect(orch.getAudioMixer()).toBeInstanceOf(AudioMixer);
    orch.dispose();
  });

  // -------------------------------------------------------------------------
  // AO-003: bindEvents wires session events
  // -------------------------------------------------------------------------
  it('AO-003: bindEvents registers playbackChanged and sourceLoaded handlers', () => {
    orchestrator.bindEvents();

    expect(deps.session.on).toHaveBeenCalledWith('playbackChanged', expect.any(Function));
    expect(deps.session.on).toHaveBeenCalledWith('sourceLoaded', expect.any(Function));
  });

  // -------------------------------------------------------------------------
  // AO-004: playbackChanged handler syncs audio playback
  // -------------------------------------------------------------------------
  it('AO-004: playbackChanged plays audio when initialized and playing', () => {
    orchestrator.bindEvents();

    // Trigger audio initialization through the public API (setupLazyInit + user gesture)
    orchestrator.setupLazyInit();
    document.dispatchEvent(new Event('click'));

    deps.session.currentFrame = 48;
    deps.session.fps = 24;

    deps.session._emit('playbackChanged', true);

    // frameTime = 48 / 24 = 2
    expect(deps.audioMixer.play).toHaveBeenCalledWith(2);
  });

  it('AO-005: playbackChanged stops audio when not playing', () => {
    orchestrator.bindEvents();
    // Trigger audio initialization through the public API (setupLazyInit + user gesture)
    orchestrator.setupLazyInit();
    document.dispatchEvent(new Event('click'));

    deps.session._emit('playbackChanged', false);

    expect(deps.audioMixer.stop).toHaveBeenCalled();
  });

  it('AO-006: playbackChanged does nothing when not initialized', () => {
    orchestrator.bindEvents();
    // audioInitialized is false by default

    deps.session._emit('playbackChanged', true);

    expect(deps.audioMixer.play).not.toHaveBeenCalled();
    expect(deps.audioMixer.stop).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // AO-007: setupLazyInit sets up user interaction listeners
  // -------------------------------------------------------------------------
  it('AO-007: setupLazyInit registers click and keydown listeners on document', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');

    orchestrator.setupLazyInit();

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), { once: true });
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), { once: true });

    addSpy.mockRestore();
  });

  it('AO-008: setupLazyInit initializes AudioMixer on first click', () => {
    orchestrator.setupLazyInit();

    expect(orchestrator.isInitialized).toBe(false);

    // Simulate a click event
    document.dispatchEvent(new Event('click'));

    expect(orchestrator.isInitialized).toBe(true);
    expect(deps.audioMixer.initialize).toHaveBeenCalledTimes(1);
  });

  it('AO-009: setupLazyInit initializes AudioMixer on first keydown', () => {
    orchestrator.setupLazyInit();

    expect(orchestrator.isInitialized).toBe(false);

    // Simulate a keydown event
    document.dispatchEvent(new Event('keydown'));

    expect(orchestrator.isInitialized).toBe(true);
    expect(deps.audioMixer.initialize).toHaveBeenCalledTimes(1);
  });

  it('AO-010: setupLazyInit only initializes once', () => {
    orchestrator.setupLazyInit();

    document.dispatchEvent(new Event('click'));
    document.dispatchEvent(new Event('keydown'));
    document.dispatchEvent(new Event('click'));

    expect(deps.audioMixer.initialize).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // AO-011: dispose cleans up subscriptions
  // -------------------------------------------------------------------------
  it('AO-011: dispose removes session event handlers', () => {
    orchestrator.bindEvents();
    orchestrator.dispose();

    expect(deps.session.off).toHaveBeenCalledWith('playbackChanged', expect.any(Function));
    expect(deps.session.off).toHaveBeenCalledWith('sourceLoaded', expect.any(Function));
  });

  it('AO-012: dispose calls audioMixer.dispose()', () => {
    orchestrator.dispose();

    expect(deps.audioMixer.dispose).toHaveBeenCalledTimes(1);
  });

  it('AO-013: dispose removes document event listeners from setupLazyInit', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    orchestrator.setupLazyInit();
    orchestrator.dispose();

    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    removeSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // AO-014: getAudioMixer returns the mixer
  // -------------------------------------------------------------------------
  it('AO-014: getAudioMixer returns the mixer instance', () => {
    const mixer = orchestrator.getAudioMixer();
    expect(mixer).toBe(deps.audioMixer);
  });

  // -------------------------------------------------------------------------
  // AO-015: sourceLoaded handler extracts audio from video sources
  // -------------------------------------------------------------------------
  it('AO-015: sourceLoaded ignores non-video sources', () => {
    orchestrator.bindEvents();
    // Trigger audio initialization through the public API (setupLazyInit + user gesture)
    orchestrator.setupLazyInit();
    document.dispatchEvent(new Event('click'));

    const source: AudioOrchestratorSource = {
      type: 'image',
      name: 'test.png',
      url: 'http://example.com/test.png',
    };

    deps.session._emit('sourceLoaded', source);

    // fetch should not be called for non-video sources
    expect(deps.audioMixer.addTrack).not.toHaveBeenCalled();
  });

  it('AO-016: sourceLoaded does nothing when not initialized', () => {
    orchestrator.bindEvents();
    // audioInitialized is false by default

    const source: AudioOrchestratorSource = {
      type: 'video',
      name: 'test.mp4',
      url: 'http://example.com/test.mp4',
    };

    deps.session._emit('sourceLoaded', source);

    expect(deps.audioMixer.addTrack).not.toHaveBeenCalled();
  });

  it('AO-017: sourceLoaded removes existing track before re-adding', () => {
    orchestrator.bindEvents();
    // Trigger audio initialization through the public API (setupLazyInit + user gesture)
    orchestrator.setupLazyInit();
    document.dispatchEvent(new Event('click'));

    // Mock getTrack to return a truthy value (track exists)
    (deps.audioMixer.getTrack as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'source-test.mp4' });

    // We need to mock fetch to prevent actual network calls
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    const source: AudioOrchestratorSource = {
      type: 'video',
      name: 'test.mp4',
      url: 'http://example.com/test.mp4',
    };

    deps.session._emit('sourceLoaded', source);

    expect(deps.audioMixer.removeTrack).toHaveBeenCalledWith('source-test.mp4');

    fetchSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // AO-018: Audio initialization lifecycle
  // -------------------------------------------------------------------------
  it('AO-018: isInitialized is false by default', () => {
    expect(orchestrator.isInitialized).toBe(false);
  });

  it('AO-019a: dispose() is idempotent -- calling it twice does not throw', () => {
    orchestrator.bindEvents();
    orchestrator.setupLazyInit();

    expect(() => {
      orchestrator.dispose();
      orchestrator.dispose();
    }).not.toThrow();
  });

  it('AO-019: playbackChanged uses fps fallback of 24 when fps is 0', () => {
    orchestrator.bindEvents();
    // Trigger audio initialization through the public API (setupLazyInit + user gesture)
    orchestrator.setupLazyInit();
    document.dispatchEvent(new Event('click'));

    deps.session.currentFrame = 48;
    deps.session.fps = 0;

    deps.session._emit('playbackChanged', true);

    // frameTime = 48 / 24 = 2 (fallback to 24)
    expect(deps.audioMixer.play).toHaveBeenCalledWith(2);
  });
});
