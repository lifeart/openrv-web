import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SessionURLService,
  type SessionURLDeps,
} from './SessionURLService';
import type { SessionURLState } from '../core/session/SessionURLManager';
import { encodeSessionState } from '../core/session/SessionURLManager';
import { DEFAULT_TRANSFORM } from '../core/types/transform';

// ---------------------------------------------------------------------------
// Lightweight test doubles
// ---------------------------------------------------------------------------

function createMockSession() {
  return {
    currentFrame: 10,
    fps: 24,
    inPoint: 1,
    outPoint: 100,
    currentSourceIndex: 0,
    currentSource: { url: 'https://example.com/media.exr' } as { url?: string } | null,
    sourceAIndex: 0,
    sourceBIndex: -1,
    currentAB: 'A' as 'A' | 'B',
    sourceCount: 2,
    goToFrame: vi.fn(),
    setCurrentSource: vi.fn(),
    setInPoint: vi.fn(),
    setOutPoint: vi.fn(),
    setSourceA: vi.fn(),
    setSourceB: vi.fn(),
    setCurrentAB: vi.fn(),
  };
}

function createMockViewer() {
  return {
    getTransform: vi.fn().mockReturnValue({ ...DEFAULT_TRANSFORM }),
    setTransform: vi.fn(),
  };
}

function createMockCompareControl() {
  return {
    getWipeMode: vi.fn().mockReturnValue('off'),
    getWipePosition: vi.fn().mockReturnValue(0.5),
    setWipeMode: vi.fn(),
    setWipePosition: vi.fn(),
  };
}

function createMockOCIOControl() {
  return {
    getState: vi.fn().mockReturnValue({
      enabled: false,
      configName: 'default',
      inputColorSpace: 'sRGB',
      display: 'sRGB',
      view: 'ACES 1.0',
      look: 'None',
    }),
    setState: vi.fn(),
  };
}

function createMockNetworkSyncManager() {
  const syncStateManager = {
    beginApplyRemote: vi.fn(),
    endApplyRemote: vi.fn(),
  };
  return {
    getSyncStateManager: vi.fn().mockReturnValue(syncStateManager),
    setPinCode: vi.fn(),
    joinRoom: vi.fn(),
    joinServerlessRoomFromOfferToken: vi.fn().mockResolvedValue(null),
    _syncStateManager: syncStateManager,
  };
}

function createMockNetworkControl() {
  return {
    setJoinRoomCodeFromLink: vi.fn(),
    setPinCode: vi.fn(),
    setShareLink: vi.fn(),
    setShareLinkKind: vi.fn(),
    setResponseToken: vi.fn(),
    showInfo: vi.fn(),
  };
}

function createDeps(overrides?: Partial<SessionURLDeps>): SessionURLDeps & {
  session: ReturnType<typeof createMockSession>;
  viewer: ReturnType<typeof createMockViewer>;
  compareControl: ReturnType<typeof createMockCompareControl>;
  ocioControl: ReturnType<typeof createMockOCIOControl>;
  networkSyncManager: ReturnType<typeof createMockNetworkSyncManager>;
  networkControl: ReturnType<typeof createMockNetworkControl>;
} {
  return {
    session: createMockSession(),
    viewer: createMockViewer(),
    compareControl: createMockCompareControl(),
    ocioControl: createMockOCIOControl(),
    networkSyncManager: createMockNetworkSyncManager(),
    networkControl: createMockNetworkControl(),
    getLocationSearch: () => '',
    getLocationHash: () => '',
    getLocationHref: () => 'http://localhost/',
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionURLService', () => {
  let deps: ReturnType<typeof createDeps>;
  let service: SessionURLService;

  beforeEach(() => {
    deps = createDeps();
    service = new SessionURLService(deps);
  });

  // -----------------------------------------------------------------------
  // captureSessionURLState
  // -----------------------------------------------------------------------

  describe('captureSessionURLState', () => {
    it('SU-001: captures frame, source index, and viewer state', () => {
      deps.session.currentFrame = 42;
      deps.session.currentSourceIndex = 1;
      deps.viewer.getTransform.mockReturnValue({
        rotation: 90,
        flipH: true,
        flipV: false,
        scale: { x: 2, y: 2 },
        translate: { x: 10, y: 20 },
      });

      const state = service.captureSessionURLState();

      expect(state.frame).toBe(42);
      expect(state.sourceIndex).toBe(1);
      expect(state.transform).toEqual({
        rotation: 90,
        flipH: true,
        flipV: false,
        scale: { x: 2, y: 2 },
        translate: { x: 10, y: 20 },
      });
    });

    it('SU-002: captures color/display settings (OCIO, wipe)', () => {
      deps.ocioControl.getState.mockReturnValue({
        enabled: true,
        configName: 'aces_1.2',
        inputColorSpace: 'ACEScg',
        display: 'Rec.709',
        view: 'Output - sRGB',
        look: 'Neutral',
      });
      deps.compareControl.getWipeMode.mockReturnValue('horizontal');
      deps.compareControl.getWipePosition.mockReturnValue(0.3);

      const state = service.captureSessionURLState();

      expect(state.wipeMode).toBe('horizontal');
      expect(state.wipePosition).toBe(0.3);
      expect(state.ocio).toEqual({
        enabled: true,
        configName: 'aces_1.2',
        inputColorSpace: 'ACEScg',
        display: 'Rec.709',
        view: 'Output - sRGB',
        look: 'Neutral',
      });
    });

    it('SU-003: excludes OCIO when disabled', () => {
      deps.ocioControl.getState.mockReturnValue({
        enabled: false,
        configName: 'default',
        inputColorSpace: 'sRGB',
        display: 'sRGB',
        view: 'ACES 1.0',
        look: 'None',
      });

      const state = service.captureSessionURLState();

      expect(state.ocio).toBeUndefined();
    });

    it('SU-004: excludes sourceBIndex when negative', () => {
      deps.session.sourceBIndex = -1;

      const state = service.captureSessionURLState();

      expect(state.sourceBIndex).toBeUndefined();
    });

    it('SU-005: includes sourceBIndex when non-negative', () => {
      deps.session.sourceBIndex = 1;

      const state = service.captureSessionURLState();

      expect(state.sourceBIndex).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // applySessionURLState
  // -----------------------------------------------------------------------

  describe('applySessionURLState', () => {
    it('SU-006: applies frame and source', () => {
      const state: SessionURLState = {
        frame: 50,
        fps: 30,
        sourceIndex: 1,
      };

      service.applySessionURLState(state);

      expect(deps.session.setCurrentSource).toHaveBeenCalledWith(1);
      expect(deps.session.goToFrame).toHaveBeenCalledWith(50);
      expect(deps.networkSyncManager._syncStateManager.beginApplyRemote).toHaveBeenCalled();
      expect(deps.networkSyncManager._syncStateManager.endApplyRemote).toHaveBeenCalled();
    });

    it('SU-007: applies viewer settings (transform, wipe)', () => {
      const transform = {
        rotation: 180 as const,
        flipH: false,
        flipV: true,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        transform,
        wipeMode: 'vertical',
        wipePosition: 0.7,
      };

      service.applySessionURLState(state);

      expect(deps.viewer.setTransform).toHaveBeenCalledWith(transform);
      expect(deps.compareControl.setWipeMode).toHaveBeenCalledWith('vertical');
      expect(deps.compareControl.setWipePosition).toHaveBeenCalledWith(0.7);
    });

    it('SU-008: applies A/B source settings', () => {
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 0,
        sourceBIndex: 1,
        currentAB: 'B',
      };

      service.applySessionURLState(state);

      expect(deps.session.setSourceA).toHaveBeenCalledWith(0);
      expect(deps.session.setSourceB).toHaveBeenCalledWith(1);
      expect(deps.session.setCurrentAB).toHaveBeenCalledWith('B');
    });

    it('SU-009: applies OCIO state', () => {
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        ocio: {
          enabled: true,
          configName: 'aces_1.2',
          inputColorSpace: 'ACEScg',
          display: 'Rec.709',
          view: 'Output - sRGB',
          look: 'Neutral',
        },
      };

      service.applySessionURLState(state);

      expect(deps.ocioControl.setState).toHaveBeenCalledWith({
        enabled: true,
        configName: 'aces_1.2',
        inputColorSpace: 'ACEScg',
        display: 'Rec.709',
        view: 'Output - sRGB',
        look: 'Neutral',
      });
    });

    it('SU-010: clamps sourceIndex to valid range', () => {
      deps.session.sourceCount = 2;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 99,
      };

      service.applySessionURLState(state);

      expect(deps.session.setCurrentSource).toHaveBeenCalledWith(1); // clamped to sourceCount-1
    });

    it('SU-011: skips source switch when sourceCount is 0', () => {
      deps.session.sourceCount = 0;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
      };

      service.applySessionURLState(state);

      expect(deps.session.setCurrentSource).not.toHaveBeenCalled();
    });

    it('SU-012: applies in/out points and fps', () => {
      const state: SessionURLState = {
        frame: 1,
        fps: 30,
        sourceIndex: 0,
        inPoint: 10,
        outPoint: 90,
      };

      service.applySessionURLState(state);

      expect(deps.session.setInPoint).toHaveBeenCalledWith(10);
      expect(deps.session.setOutPoint).toHaveBeenCalledWith(90);
    });

    it('SU-013: always calls endApplyRemote even if an error occurs', () => {
      deps.session.setCurrentSource = vi.fn().mockImplementation(() => { throw new Error('boom'); });

      expect(() => {
        service.applySessionURLState({
          frame: 1,
          fps: 24,
          sourceIndex: 0,
        });
      }).toThrow('boom');

      expect(deps.networkSyncManager._syncStateManager.endApplyRemote).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // handleURLBootstrap
  // -----------------------------------------------------------------------

  describe('handleURLBootstrap', () => {
    it('SU-014: parses URL and applies shared state from hash', async () => {
      const state: SessionURLState = {
        frame: 42,
        fps: 24,
        sourceIndex: 0,
      };
      const encoded = encodeSessionState(state);

      deps = createDeps({
        getLocationSearch: () => '',
        getLocationHash: () => `#s=${encoded}`,
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.session.goToFrame).toHaveBeenCalledWith(42);
    });

    it('SU-015: handles missing URL params gracefully', async () => {
      deps = createDeps({
        getLocationSearch: () => '',
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.setJoinRoomCodeFromLink).not.toHaveBeenCalled();
      expect(deps.networkControl.setPinCode).not.toHaveBeenCalled();
      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });

    it('SU-016: sets room code and pin from URL params', async () => {
      deps = createDeps({
        getLocationSearch: () => '?room=ABCD&pin=1234',
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.setJoinRoomCodeFromLink).toHaveBeenCalledWith('ABCD');
      expect(deps.networkControl.setPinCode).toHaveBeenCalledWith('1234');
      expect(deps.networkSyncManager.setPinCode).toHaveBeenCalledWith('1234');
      expect(deps.networkSyncManager.joinRoom).toHaveBeenCalledWith('ABCD', 'User', '1234');
    });

    it('SU-017: does not join room when only room code is present (no pin)', async () => {
      deps = createDeps({
        getLocationSearch: () => '?room=ABCD',
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.setJoinRoomCodeFromLink).toHaveBeenCalledWith('ABCD');
      expect(deps.networkSyncManager.joinRoom).not.toHaveBeenCalled();
    });

    it('SU-018: handles invalid hash gracefully (no crash)', async () => {
      deps = createDeps({
        getLocationSearch: () => '',
        getLocationHash: () => '#s=not-valid-base64!!!',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      // Should not throw, and should not apply any state
      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('SU-019: applySessionURLState handles partial state (only required fields)', () => {
      const state: SessionURLState = {
        frame: 5,
        fps: 24,
        sourceIndex: 0,
      };

      service.applySessionURLState(state);

      expect(deps.session.goToFrame).toHaveBeenCalledWith(5);
      expect(deps.viewer.setTransform).not.toHaveBeenCalled();
      expect(deps.compareControl.setWipeMode).not.toHaveBeenCalled();
      expect(deps.compareControl.setWipePosition).not.toHaveBeenCalled();
      expect(deps.ocioControl.setState).not.toHaveBeenCalled();
      expect(deps.session.setSourceA).not.toHaveBeenCalled();
      expect(deps.session.setSourceB).not.toHaveBeenCalled();
      expect(deps.session.setCurrentAB).not.toHaveBeenCalled();
    });

    it('SU-020: captureSessionURLState works with null currentSource', () => {
      deps.session.currentSource = null;

      const state = service.captureSessionURLState();

      expect(state.sourceUrl).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------

  describe('dispose', () => {
    it('SU-021: can be called without error', () => {
      expect(() => service.dispose()).not.toThrow();
    });

    it('SU-022: can be called multiple times safely', () => {
      expect(() => {
        service.dispose();
        service.dispose();
      }).not.toThrow();
    });
  });
});
