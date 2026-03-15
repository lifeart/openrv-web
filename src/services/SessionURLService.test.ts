import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionURLService, type SessionURLDeps } from './SessionURLService';
import type { SessionURLState } from '../core/session/SessionURLManager';
import { encodeSessionState, decodeSessionState } from '../core/session/SessionURLManager';
import { createMockSession, createMockViewer } from '../../test/mocks';
import { encodeWebRTCURLSignal, WEBRTC_URL_SIGNAL_PARAM } from '../network/WebRTCURLSignaling';
import type { WebRTCURLOfferSignal, WebRTCURLAnswerSignal } from '../network/WebRTCURLSignaling';

// ---------------------------------------------------------------------------
// Lightweight test doubles
// ---------------------------------------------------------------------------

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
    it('SU-006: applies frame and source', async () => {
      const state: SessionURLState = {
        frame: 50,
        fps: 30,
        sourceIndex: 1,
      };

      await service.applySessionURLState(state);

      expect(deps.session.setCurrentSource).toHaveBeenCalledWith(1);
      expect(deps.session.goToFrame).toHaveBeenCalledWith(50);
      expect(deps.networkSyncManager._syncStateManager.beginApplyRemote).toHaveBeenCalled();
      expect(deps.networkSyncManager._syncStateManager.endApplyRemote).toHaveBeenCalled();
    });

    it('SU-007: applies viewer settings (transform, wipe)', async () => {
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

      await service.applySessionURLState(state);

      expect(deps.viewer.setTransform).toHaveBeenCalledWith(transform);
      expect(deps.compareControl.setWipeMode).toHaveBeenCalledWith('vertical');
      expect(deps.compareControl.setWipePosition).toHaveBeenCalledWith(0.7);
    });

    it('SU-008: applies A/B source settings', async () => {
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 0,
        sourceBIndex: 1,
        currentAB: 'B',
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceA).toHaveBeenCalledWith(0);
      expect(deps.session.setSourceB).toHaveBeenCalledWith(1);
      expect(deps.session.setCurrentAB).toHaveBeenCalledWith('B');
    });

    it('SU-009: applies OCIO state', async () => {
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

      await service.applySessionURLState(state);

      expect(deps.ocioControl.setState).toHaveBeenCalledWith({
        enabled: true,
        configName: 'aces_1.2',
        inputColorSpace: 'ACEScg',
        display: 'Rec.709',
        view: 'Output - sRGB',
        look: 'Neutral',
      });
    });

    it('SU-010: clamps sourceIndex to valid range', async () => {
      deps.session.sourceCount = 2;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 99,
      };

      await service.applySessionURLState(state);

      expect(deps.session.setCurrentSource).toHaveBeenCalledWith(1); // clamped to sourceCount-1
    });

    it('SU-011: skips source switch when sourceCount is 0', async () => {
      deps.session.sourceCount = 0;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
      };

      await service.applySessionURLState(state);

      expect(deps.session.setCurrentSource).not.toHaveBeenCalled();
    });

    it('SU-012: applies in/out points and fps', async () => {
      const state: SessionURLState = {
        frame: 1,
        fps: 30,
        sourceIndex: 0,
        inPoint: 10,
        outPoint: 90,
      };

      await service.applySessionURLState(state);

      expect(deps.session.setInPoint).toHaveBeenCalledWith(10);
      expect(deps.session.setOutPoint).toHaveBeenCalledWith(90);
    });

    it('SU-013: always calls endApplyRemote even if an error occurs', async () => {
      deps.session.setCurrentSource = vi.fn().mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(
        service.applySessionURLState({
          frame: 1,
          fps: 24,
          sourceIndex: 0,
        }),
      ).rejects.toThrow('boom');

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

    it('SU-017: auto-joins room when only room code is present (no pin)', async () => {
      deps = createDeps({
        getLocationSearch: () => '?room=ABCD',
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.setJoinRoomCodeFromLink).toHaveBeenCalledWith('ABCD');
      expect(deps.networkSyncManager.joinRoom).toHaveBeenCalledWith('ABCD', 'User', undefined);
    });

    it('SU-040: auto-joins room with PIN when both room and pin are present', async () => {
      deps = createDeps({
        getLocationSearch: () => '?room=WXYZ&pin=5678',
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.setJoinRoomCodeFromLink).toHaveBeenCalledWith('WXYZ');
      expect(deps.networkControl.setPinCode).toHaveBeenCalledWith('5678');
      expect(deps.networkSyncManager.setPinCode).toHaveBeenCalledWith('5678');
      expect(deps.networkSyncManager.joinRoom).toHaveBeenCalledWith('WXYZ', 'User', '5678');
    });

    it('SU-041: does not auto-join when no room code is present', async () => {
      deps = createDeps({
        getLocationSearch: () => '?pin=9999',
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.setJoinRoomCodeFromLink).not.toHaveBeenCalled();
      expect(deps.networkSyncManager.joinRoom).not.toHaveBeenCalled();
    });

    it('SU-018: handles invalid hash gracefully (no crash) and shows info', async () => {
      deps = createDeps({
        getLocationSearch: () => '',
        getLocationHash: () => '#s=not-valid-base64!!!',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      // Should not throw, and should not apply any state
      expect(deps.session.goToFrame).not.toHaveBeenCalled();
      // Should notify the user about the malformed link
      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'Could not restore shared session state: the link may be corrupted or incomplete.',
      );
    });

    it('SU-018b: no hash at all does not show info (normal startup)', async () => {
      deps = createDeps({
        getLocationSearch: () => '',
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.showInfo).not.toHaveBeenCalled();
    });

    it('SU-018c: valid hash does not show info (successful decode)', async () => {
      const state: SessionURLState = { frame: 10, fps: 24, sourceIndex: 0 };
      const encoded = encodeSessionState(state);
      deps = createDeps({
        getLocationSearch: () => '',
        getLocationHash: () => `#s=${encoded}`,
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.session.goToFrame).toHaveBeenCalledWith(10);
      expect(deps.networkControl.showInfo).not.toHaveBeenCalled();
    });

    it('SU-018d: truncated base64 in #s= shows info', async () => {
      deps = createDeps({
        getLocationSearch: () => '',
        getLocationHash: () => '#s=eyJmIjox',  // truncated JSON
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'Could not restore shared session state: the link may be corrupted or incomplete.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('SU-019: applySessionURLState resets omitted fields to defaults', async () => {
      const state: SessionURLState = {
        frame: 5,
        fps: 24,
        sourceIndex: 0,
      };

      await service.applySessionURLState(state);

      expect(deps.session.goToFrame).toHaveBeenCalledWith(5);
      // Omitted fields should be reset to defaults
      expect(deps.viewer.setTransform).toHaveBeenCalledWith({
        rotation: 0,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      });
      expect(deps.compareControl.setWipeMode).toHaveBeenCalledWith('off');
      expect(deps.compareControl.setWipePosition).toHaveBeenCalledWith(0.5);
      expect(deps.session.setCurrentAB).toHaveBeenCalledWith('A');
      // OCIO not reset when already disabled
      expect(deps.ocioControl.setState).not.toHaveBeenCalled();
      expect(deps.session.setSourceA).not.toHaveBeenCalled();
      expect(deps.session.setSourceB).not.toHaveBeenCalled();
    });

    it('SU-020: captureSessionURLState works with null currentSource', () => {
      deps.session.currentSource = null;

      const state = service.captureSessionURLState();

      expect(state.sourceUrl).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // sourceUrl consumption (Issue #149)
  // -----------------------------------------------------------------------

  describe('sourceUrl consumption', () => {
    it('SU-023: loads media from sourceUrl when session is empty', async () => {
      const loadSourceFromUrl = vi.fn().mockResolvedValue(undefined);
      deps.session.sourceCount = 0;
      (deps.session as any).loadSourceFromUrl = loadSourceFromUrl;

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/image.png',
      };

      await service.applySessionURLState(state);

      expect(loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/image.png');
    });

    it('SU-024: skips sourceUrl when session already has media loaded', async () => {
      const loadSourceFromUrl = vi.fn().mockResolvedValue(undefined);
      deps.session.sourceCount = 2;
      (deps.session as any).loadSourceFromUrl = loadSourceFromUrl;

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/image.png',
      };

      await service.applySessionURLState(state);

      expect(loadSourceFromUrl).not.toHaveBeenCalled();
    });

    it('SU-025: handles sourceUrl load failure gracefully', async () => {
      const loadSourceFromUrl = vi.fn().mockRejectedValue(new Error('network error'));
      deps.session.sourceCount = 0;
      (deps.session as any).loadSourceFromUrl = loadSourceFromUrl;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const state: SessionURLState = {
        frame: 10,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/missing.png',
      };

      // Should not throw
      await service.applySessionURLState(state);

      expect(loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/missing.png');
      expect(warnSpy).toHaveBeenCalled();
      // View state should still be applied despite load failure
      expect(deps.session.goToFrame).toHaveBeenCalledWith(10);

      warnSpy.mockRestore();
    });

    it('SU-054: shows user-facing notification when sourceUrl load fails', async () => {
      const loadSourceFromUrl = vi.fn().mockRejectedValue(new Error('Expired signed URL'));
      deps.session.sourceCount = 0;
      (deps.session as any).loadSourceFromUrl = loadSourceFromUrl;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const state: SessionURLState = {
        frame: 10,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/expired.png',
      };

      await service.applySessionURLState(state);

      // User-facing notification should be shown
      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'Failed to load shared media: Expired signed URL',
      );
      // Console warning should still be present for debugging
      expect(warnSpy).toHaveBeenCalled();
      // View state should still be applied despite load failure
      expect(deps.session.goToFrame).toHaveBeenCalledWith(10);

      warnSpy.mockRestore();
    });

    it('SU-055: shows user-facing notification with stringified non-Error rejection', async () => {
      const loadSourceFromUrl = vi.fn().mockRejectedValue('network timeout');
      deps.session.sourceCount = 0;
      (deps.session as any).loadSourceFromUrl = loadSourceFromUrl;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const state: SessionURLState = {
        frame: 5,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/timeout.png',
      };

      await service.applySessionURLState(state);

      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'Failed to load shared media: network timeout',
      );

      warnSpy.mockRestore();
    });

    it('SU-056: does not show error notification when sourceUrl loads successfully', async () => {
      const loadSourceFromUrl = vi.fn().mockResolvedValue(undefined);
      deps.session.sourceCount = 0;
      (deps.session as any).loadSourceFromUrl = loadSourceFromUrl;

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/image.png',
      };

      await service.applySessionURLState(state);

      expect(loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/image.png');
      expect(deps.networkControl.showInfo).not.toHaveBeenCalled();
    });

    it('SU-026: skips sourceUrl when it is empty string', async () => {
      const loadSourceFromUrl = vi.fn().mockResolvedValue(undefined);
      deps.session.sourceCount = 0;
      (deps.session as any).loadSourceFromUrl = loadSourceFromUrl;

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: '',
      };

      await service.applySessionURLState(state);

      expect(loadSourceFromUrl).not.toHaveBeenCalled();
    });

    it('SU-027: skips sourceUrl when it is undefined', async () => {
      const loadSourceFromUrl = vi.fn().mockResolvedValue(undefined);
      deps.session.sourceCount = 0;
      (deps.session as any).loadSourceFromUrl = loadSourceFromUrl;

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
      };

      await service.applySessionURLState(state);

      expect(loadSourceFromUrl).not.toHaveBeenCalled();
    });

    it('SU-030: rejects javascript: URL scheme gracefully', async () => {
      const loadSourceFromUrl = vi.fn().mockRejectedValue(new Error('Unsupported URL scheme: javascript:'));
      deps.session.sourceCount = 0;
      (deps.session as any).loadSourceFromUrl = loadSourceFromUrl;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const state: SessionURLState = {
        frame: 5,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'javascript:alert(1)',
      };

      // Should not throw — the try/catch logs a warning and continues
      await service.applySessionURLState(state);

      expect(loadSourceFromUrl).toHaveBeenCalledWith('javascript:alert(1)');
      expect(warnSpy).toHaveBeenCalled();
      // View state should still be applied despite the rejected URL
      expect(deps.session.goToFrame).toHaveBeenCalledWith(5);

      warnSpy.mockRestore();
    });

    it('SU-031: rejects data: URL scheme gracefully', async () => {
      const loadSourceFromUrl = vi.fn().mockRejectedValue(new Error('Unsupported URL scheme: data:'));
      deps.session.sourceCount = 0;
      (deps.session as any).loadSourceFromUrl = loadSourceFromUrl;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const state: SessionURLState = {
        frame: 3,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'data:text/html,<h1>hello</h1>',
      };

      await service.applySessionURLState(state);

      expect(loadSourceFromUrl).toHaveBeenCalledWith('data:text/html,<h1>hello</h1>');
      expect(warnSpy).toHaveBeenCalled();
      // View state should still be applied
      expect(deps.session.goToFrame).toHaveBeenCalledWith(3);

      warnSpy.mockRestore();
    });

    it('SU-028: skips sourceUrl when loadSourceFromUrl is not available', async () => {
      deps.session.sourceCount = 0;
      // No loadSourceFromUrl on session

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/image.png',
      };

      // Should not throw
      await service.applySessionURLState(state);
    });

    it('SU-029: handleURLBootstrap loads from sourceUrl in hash', async () => {
      const loadSourceFromUrl = vi.fn().mockResolvedValue(undefined);
      const state: SessionURLState = {
        frame: 42,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/review.png',
      };
      const encoded = encodeSessionState(state);

      deps = createDeps({
        session: createMockSession({
          sourceCount: 0,
          loadSourceFromUrl,
        }) as any,
        getLocationSearch: () => '',
        getLocationHash: () => `#s=${encoded}`,
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/review.png');
    });
  });

  // -----------------------------------------------------------------------
  // Issue #150: Absent fields reset to defaults
  // -----------------------------------------------------------------------

  describe('issue #150: absent URL state fields reset to defaults', () => {
    it('SU-032: absent transform resets to default (0,0,1)', async () => {
      // Simulate recipient with non-default transform
      deps.viewer.getTransform.mockReturnValue({
        rotation: 90,
        flipH: true,
        flipV: false,
        scale: { x: 2, y: 2 },
        translate: { x: 100, y: -50 },
      });

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        // transform intentionally omitted
      };

      await service.applySessionURLState(state);

      expect(deps.viewer.setTransform).toHaveBeenCalledWith({
        rotation: 0,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      });
    });

    it('SU-033: absent wipeMode resets to off', async () => {
      deps.compareControl.getWipeMode.mockReturnValue('horizontal');

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        // wipeMode intentionally omitted
      };

      await service.applySessionURLState(state);

      expect(deps.compareControl.setWipeMode).toHaveBeenCalledWith('off');
    });

    it('SU-034: absent currentAB resets to A', async () => {
      deps.session.currentAB = 'B';

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        // currentAB intentionally omitted
      };

      await service.applySessionURLState(state);

      expect(deps.session.setCurrentAB).toHaveBeenCalledWith('A');
    });

    it('SU-035: absent OCIO resets to disabled', async () => {
      deps.ocioControl.getState.mockReturnValue({
        enabled: true,
        configName: 'aces_1.2',
        inputColorSpace: 'ACEScg',
        display: 'Rec.709',
        view: 'Output - sRGB',
        look: 'Neutral',
      });

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        // ocio intentionally omitted
      };

      await service.applySessionURLState(state);

      expect(deps.ocioControl.setState).toHaveBeenCalledWith({
        enabled: false,
        configName: 'aces_1.2',
        inputColorSpace: 'ACEScg',
        display: 'Rec.709',
        view: 'Output - sRGB',
        look: 'Neutral',
      });
    });

    it('SU-036: absent OCIO does not call setState when already disabled', async () => {
      deps.ocioControl.getState.mockReturnValue({
        enabled: false,
        configName: 'default',
        inputColorSpace: 'sRGB',
        display: 'sRGB',
        view: 'ACES 1.0',
        look: 'None',
      });

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
      };

      await service.applySessionURLState(state);

      expect(deps.ocioControl.setState).not.toHaveBeenCalled();
    });

    it('SU-037: present non-default values still applied correctly (no regression)', async () => {
      const transform = {
        rotation: 45,
        flipH: true,
        flipV: false,
        scale: { x: 3, y: 3 },
        translate: { x: 50, y: -25 },
      };
      const state: SessionURLState = {
        frame: 10,
        fps: 30,
        sourceIndex: 1,
        currentAB: 'B',
        transform,
        wipeMode: 'horizontal',
        wipePosition: 0.3,
        ocio: {
          enabled: true,
          configName: 'aces_1.2',
          inputColorSpace: 'ACEScg',
          display: 'Rec.709',
          view: 'Output - sRGB',
          look: 'Neutral',
        },
      };

      await service.applySessionURLState(state);

      expect(deps.viewer.setTransform).toHaveBeenCalledWith(transform);
      expect(deps.compareControl.setWipeMode).toHaveBeenCalledWith('horizontal');
      expect(deps.compareControl.setWipePosition).toHaveBeenCalledWith(0.3);
      expect(deps.session.setCurrentAB).toHaveBeenCalledWith('B');
      expect(deps.ocioControl.setState).toHaveBeenCalledWith({
        enabled: true,
        configName: 'aces_1.2',
        inputColorSpace: 'ACEScg',
        display: 'Rec.709',
        view: 'Output - sRGB',
        look: 'Neutral',
      });
    });

    it('SU-038: full round-trip: encode default state → decode → apply resets all to defaults', async () => {
      // Encode a state with all defaults
      const defaultState: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        currentAB: 'A',
        transform: {
          rotation: 0,
          flipH: false,
          flipV: false,
          scale: { x: 1, y: 1 },
          translate: { x: 0, y: 0 },
        },
        wipeMode: 'off',
        ocio: { enabled: false },
      };

      // Encode strips defaults, decode gives minimal state
      const encoded = encodeSessionState(defaultState);
      const decoded = decodeSessionState(encoded);
      expect(decoded).not.toBeNull();

      // Simulate recipient with non-default state
      deps.viewer.getTransform.mockReturnValue({
        rotation: 180,
        flipH: true,
        flipV: true,
        scale: { x: 5, y: 5 },
        translate: { x: 200, y: -200 },
      });
      deps.compareControl.getWipeMode.mockReturnValue('vertical');
      deps.session.currentAB = 'B';
      deps.ocioControl.getState.mockReturnValue({
        enabled: true,
        configName: 'aces_1.2',
        inputColorSpace: 'ACEScg',
        display: 'Rec.709',
        view: 'Output - sRGB',
        look: 'Neutral',
      });

      await service.applySessionURLState(decoded!);

      // All should be reset to defaults
      expect(deps.viewer.setTransform).toHaveBeenCalledWith({
        rotation: 0,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      });
      expect(deps.compareControl.setWipeMode).toHaveBeenCalledWith('off');
      expect(deps.compareControl.setWipePosition).toHaveBeenCalledWith(0.5);
      expect(deps.session.setCurrentAB).toHaveBeenCalledWith('A');
      expect(deps.ocioControl.setState).toHaveBeenCalledWith({
        enabled: false,
        configName: 'aces_1.2',
        inputColorSpace: 'ACEScg',
        display: 'Rec.709',
        view: 'Output - sRGB',
        look: 'Neutral',
      });
    });

    it('SU-039: absent wipeMode and wipePosition resets wipePosition to 0.5', async () => {
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
      };

      await service.applySessionURLState(state);

      expect(deps.compareControl.setWipeMode).toHaveBeenCalledWith('off');
      expect(deps.compareControl.setWipePosition).toHaveBeenCalledWith(0.5);
    });
  });

  // -----------------------------------------------------------------------
  // Issue #197: Malformed WebRTC share links surface errors
  // -----------------------------------------------------------------------

  describe('issue #197: malformed WebRTC share links surface errors', () => {
    const validOfferSignal: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-123',
      roomCode: 'ABCD',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#ff0000',
      createdAt: Date.now(),
      sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n',
    };

    const validAnswerSignal: WebRTCURLAnswerSignal = {
      version: 1,
      type: 'answer',
      roomId: 'room-123',
      roomCode: 'ABCD',
      hostUserId: 'host-1',
      guestUserId: 'guest-1',
      guestUserName: 'Guest',
      guestColor: '#00ff00',
      createdAt: Date.now(),
      sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n',
    };

    it('SU-042: shows error when webrtc token is completely malformed', async () => {
      deps = createDeps({
        getLocationSearch: () => `?${WEBRTC_URL_SIGNAL_PARAM}=not-valid-base64!!!`,
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'The WebRTC link is malformed or corrupted and could not be processed.',
      );
    });

    it('SU-043: shows error when webrtc token decodes but is not offer or answer', async () => {
      // Encode a token that is valid base64/JSON but has no valid signal type
      const garbageToken = btoa(JSON.stringify({ version: 1, type: 'unknown' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

      deps = createDeps({
        getLocationSearch: () => `?${WEBRTC_URL_SIGNAL_PARAM}=${garbageToken}`,
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'The WebRTC link is malformed or corrupted and could not be processed.',
      );
    });

    it('SU-044: shows error when offer token is valid but joinServerlessRoomFromOfferToken returns null', async () => {
      const token = encodeWebRTCURLSignal(validOfferSignal);

      deps = createDeps({
        getLocationSearch: () => `?${WEBRTC_URL_SIGNAL_PARAM}=${token}`,
        getLocationHash: () => '',
        getLocationHref: () => 'http://localhost/',
      });
      deps.networkSyncManager.joinServerlessRoomFromOfferToken.mockResolvedValue(null);
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkSyncManager.joinServerlessRoomFromOfferToken).toHaveBeenCalled();
      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'The WebRTC invite link could not be processed. It may be malformed, expired, or the connection is already in use.',
      );
    });

    it('SU-045: does NOT show error when offer token succeeds (answer token returned)', async () => {
      const token = encodeWebRTCURLSignal(validOfferSignal);
      const answerToken = encodeWebRTCURLSignal(validAnswerSignal);

      deps = createDeps({
        getLocationSearch: () => `?${WEBRTC_URL_SIGNAL_PARAM}=${token}`,
        getLocationHash: () => '',
        getLocationHref: () => 'http://localhost/',
      });
      deps.networkSyncManager.joinServerlessRoomFromOfferToken.mockResolvedValue(answerToken);
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'Connected as guest via WebRTC. Copy the response token (or response URL) and send it to the host.',
      );
      // Should NOT have the error message
      expect(deps.networkControl.showInfo).not.toHaveBeenCalledWith(
        expect.stringContaining('could not be processed'),
      );
    });

    it('SU-046: answer link still shows guidance message', async () => {
      const token = encodeWebRTCURLSignal(validAnswerSignal);

      deps = createDeps({
        getLocationSearch: () => `?${WEBRTC_URL_SIGNAL_PARAM}=${token}`,
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'This is a WebRTC response link. Paste it into the host Network Sync panel and click Apply.',
      );
    });

    it('SU-047: malformed webrtc token prevents room auto-join', async () => {
      deps = createDeps({
        getLocationSearch: () => `?room=ABCD&${WEBRTC_URL_SIGNAL_PARAM}=garbage!!!`,
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      // handledServerlessOffer should be true, so room auto-join is skipped
      expect(deps.networkSyncManager.joinRoom).not.toHaveBeenCalled();
      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'The WebRTC link is malformed or corrupted and could not be processed.',
      );
    });

    it('SU-048: empty webrtc token does not trigger error (no token present)', async () => {
      deps = createDeps({
        getLocationSearch: () => '',
        getLocationHash: () => '',
      });
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      expect(deps.networkControl.showInfo).not.toHaveBeenCalled();
    });

    it('SU-049: offer link failure still allows shared state from hash to apply', async () => {
      const token = encodeWebRTCURLSignal(validOfferSignal);
      const state: SessionURLState = { frame: 77, fps: 24, sourceIndex: 0 };
      const encoded = encodeSessionState(state);

      deps = createDeps({
        getLocationSearch: () => `?${WEBRTC_URL_SIGNAL_PARAM}=${token}`,
        getLocationHash: () => `#s=${encoded}`,
        getLocationHref: () => 'http://localhost/',
      });
      deps.networkSyncManager.joinServerlessRoomFromOfferToken.mockResolvedValue(null);
      service = new SessionURLService(deps);

      await service.handleURLBootstrap();

      // Error shown for the failed WebRTC link
      expect(deps.networkControl.showInfo).toHaveBeenCalledWith(
        'The WebRTC invite link could not be processed. It may be malformed, expired, or the connection is already in use.',
      );
      // Shared state from hash should still be applied
      expect(deps.session.goToFrame).toHaveBeenCalledWith(77);
    });
  });

  // -----------------------------------------------------------------------
  // Issue #428: Share-link compare state cannot explicitly clear B source
  // -----------------------------------------------------------------------

  describe('issue #428: share-link clears stale B source', () => {
    it('SU-050: share link with sourceAIndex but no sourceBIndex calls clearSourceB()', async () => {
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 0,
        // sourceBIndex intentionally absent — sender had no B assigned
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceA).toHaveBeenCalledWith(0);
      expect(deps.session.clearSourceB).toHaveBeenCalled();
      expect(deps.session.setSourceB).not.toHaveBeenCalled();
    });

    it('SU-051: share link with sourceBIndex present calls setSourceB (existing behavior)', async () => {
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 0,
        sourceBIndex: 1,
        currentAB: 'B',
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceA).toHaveBeenCalledWith(0);
      expect(deps.session.setSourceB).toHaveBeenCalledWith(1);
      expect(deps.session.clearSourceB).not.toHaveBeenCalled();
    });

    it('SU-052: share link with no compare state at all does not touch B (backward compat)', async () => {
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        // No sourceAIndex, no sourceBIndex — old-format link
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceA).not.toHaveBeenCalled();
      expect(deps.session.setSourceB).not.toHaveBeenCalled();
      expect(deps.session.clearSourceB).not.toHaveBeenCalled();
    });

    it('SU-053: round-trip encode/decode with no B → apply clears B on recipient', async () => {
      // Simulate captured state from a sender with no B assigned
      const senderState: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 0,
        // sourceBIndex intentionally absent (sender had no B)
        currentAB: 'A',
      };

      expect(senderState.sourceBIndex).toBeUndefined();

      // Encode → decode round-trip
      const encoded = encodeSessionState(senderState);
      const decoded = decodeSessionState(encoded)!;
      expect(decoded).not.toBeNull();
      expect(decoded.sourceAIndex).toBe(0);
      expect(decoded.sourceBIndex).toBeUndefined();

      // Apply to a fresh recipient
      const recipientDeps = createDeps();
      const recipientService = new SessionURLService(recipientDeps);
      await recipientService.applySessionURLState(decoded);

      expect(recipientDeps.session.setSourceA).toHaveBeenCalledWith(0);
      expect(recipientDeps.session.clearSourceB).toHaveBeenCalled();
      expect(recipientDeps.session.setSourceB).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Issue #432: Share-link A/B compare indices not validated
  // -----------------------------------------------------------------------

  describe('issue #432: validate A/B compare indices against sourceCount', () => {
    it('SU-057: sourceAIndex out of range gets clamped to sourceCount-1', async () => {
      deps.session.sourceCount = 3;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 99, // way out of range
        sourceBIndex: 1,
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceA).toHaveBeenCalledWith(2); // clamped to sourceCount-1
      expect(deps.session.setSourceB).toHaveBeenCalledWith(1);
    });

    it('SU-058: sourceBIndex out of range triggers clearSourceB()', async () => {
      deps.session.sourceCount = 3;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 0,
        sourceBIndex: 99, // way out of range
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceA).toHaveBeenCalledWith(0);
      expect(deps.session.setSourceB).not.toHaveBeenCalled();
      expect(deps.session.clearSourceB).toHaveBeenCalled();
    });

    it('SU-059: valid A/B indices within range are applied normally', async () => {
      deps.session.sourceCount = 5;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 2,
        sourceBIndex: 4,
        currentAB: 'B',
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceA).toHaveBeenCalledWith(2);
      expect(deps.session.setSourceB).toHaveBeenCalledWith(4);
      expect(deps.session.clearSourceB).not.toHaveBeenCalled();
      expect(deps.session.setCurrentAB).toHaveBeenCalledWith('B');
    });

    it('SU-060: negative sourceAIndex gets clamped to 0', async () => {
      deps.session.sourceCount = 3;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: -5,
        sourceBIndex: 1,
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceA).toHaveBeenCalledWith(0); // clamped to 0
      expect(deps.session.setSourceB).toHaveBeenCalledWith(1);
    });

    it('SU-061: negative sourceBIndex triggers clearSourceB()', async () => {
      deps.session.sourceCount = 3;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 0,
        sourceBIndex: -1,
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceA).toHaveBeenCalledWith(0);
      expect(deps.session.setSourceB).not.toHaveBeenCalled();
      expect(deps.session.clearSourceB).toHaveBeenCalled();
    });

    it('SU-062: sourceBIndex equal to sourceCount triggers clearSourceB()', async () => {
      deps.session.sourceCount = 3;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 0,
        sourceBIndex: 3, // exactly at sourceCount boundary
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceB).not.toHaveBeenCalled();
      expect(deps.session.clearSourceB).toHaveBeenCalled();
    });

    it('SU-063: sourceAIndex clamped when sourceCount is 0', async () => {
      deps.session.sourceCount = 0;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 5,
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceA).toHaveBeenCalledWith(0);
      expect(deps.session.clearSourceB).toHaveBeenCalled();
    });

    it('SU-064: sourceBIndex with sourceCount 0 triggers clearSourceB()', async () => {
      deps.session.sourceCount = 0;
      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceAIndex: 0,
        sourceBIndex: 0,
      };

      await service.applySessionURLState(state);

      expect(deps.session.setSourceB).not.toHaveBeenCalled();
      expect(deps.session.clearSourceB).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Issue #431 regression: share links load media regardless of session state
  // -----------------------------------------------------------------------

  describe('share link media loading (issue #431)', () => {
    it('SU-023: loads media on empty session via session.loadSourceFromUrl', async () => {
      deps.session.sourceCount = 0;
      deps.session.loadSourceFromUrl = vi.fn(async () => {
        deps.session.sourceCount = 1;
      });
      deps.session.allSources = [];

      const state: SessionURLState = {
        frame: 10,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/media.mp4',
      };

      await service.applySessionURLState(state);
      expect(deps.session.loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/media.mp4');
    });

    it('SU-024: loads media when session already has other media (non-empty)', async () => {
      deps.session.sourceCount = 1;
      deps.session.allSources = [{ url: 'https://example.com/existing.mp4' }];
      const loadSourceFromUrl = vi.fn(async () => {
        deps.session.sourceCount = 2;
        return 1; // new source at index 1
      });

      const depsWithLoader = createDeps({
        ...deps,
        loadSourceFromUrl,
      });
      const svc = new SessionURLService(depsWithLoader);

      const state: SessionURLState = {
        frame: 5,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/shared.mp4',
      };

      await svc.applySessionURLState(state);
      expect(loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/shared.mp4');
      // Should navigate to the newly loaded source (index 1)
      expect(depsWithLoader.session.setCurrentSource).toHaveBeenCalledWith(1);
    });

    it('SU-025: navigates to existing source instead of duplicating', async () => {
      deps.session.sourceCount = 2;
      deps.session.allSources = [
        { url: 'https://example.com/a.mp4' },
        { url: 'https://example.com/shared.mp4' },
      ];

      const state: SessionURLState = {
        frame: 5,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/shared.mp4',
      };

      await service.applySessionURLState(state);
      // Should navigate to index 1 where the URL already exists
      expect(deps.session.setCurrentSource).toHaveBeenCalledWith(1);
    });

    it('SU-026: falls through gracefully when no loadSourceFromUrl callback', async () => {
      deps.session.sourceCount = 1;
      deps.session.allSources = [{ url: 'https://example.com/existing.mp4' }];
      // No loadSourceFromUrl on deps

      const state: SessionURLState = {
        frame: 5,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/shared.mp4',
      };

      await service.applySessionURLState(state);
      // Should use original sourceIndex since it can't load
      expect(deps.session.setCurrentSource).toHaveBeenCalledWith(0);
    });

    it('SU-027: loadSourceFromUrl failure falls back to original sourceIndex', async () => {
      deps.session.sourceCount = 1;
      deps.session.allSources = [];
      const loadSourceFromUrl = vi.fn(async () => -1);

      const depsWithLoader = createDeps({
        ...deps,
        loadSourceFromUrl,
      });
      const svc = new SessionURLService(depsWithLoader);

      const state: SessionURLState = {
        frame: 5,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/shared.mp4',
      };

      await svc.applySessionURLState(state);
      expect(loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/shared.mp4');
      // Should fall back to original sourceIndex
      expect(depsWithLoader.session.setCurrentSource).toHaveBeenCalledWith(0);
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

  // -----------------------------------------------------------------------
  // Multi-source A/B compare (issue #429)
  // -----------------------------------------------------------------------

  describe('multi-source A/B compare', () => {
    it('SU-023: capture includes sourceUrls when multiple sources have URLs', () => {
      deps.session.allSources = [
        { url: 'https://example.com/shot_a.exr' },
        { url: 'https://example.com/shot_b.exr' },
      ];
      deps.session.currentSource = { url: 'https://example.com/shot_a.exr' };
      deps.session.sourceBIndex = 1;

      const state = service.captureSessionURLState();

      expect(state.sourceUrls).toEqual([
        'https://example.com/shot_a.exr',
        'https://example.com/shot_b.exr',
      ]);
      // sourceUrl is still set for backward compat
      expect(state.sourceUrl).toBe('https://example.com/shot_a.exr');
    });

    it('SU-024: capture omits sourceUrls when only one source loaded', () => {
      deps.session.allSources = [
        { url: 'https://example.com/shot_a.exr' },
      ];
      deps.session.currentSource = { url: 'https://example.com/shot_a.exr' };

      const state = service.captureSessionURLState();

      expect(state.sourceUrls).toBeUndefined();
      expect(state.sourceUrl).toBe('https://example.com/shot_a.exr');
    });

    it('SU-025: capture omits sourceUrls when sources have no URLs', () => {
      deps.session.allSources = [{}, {}];
      deps.session.currentSource = {};

      const state = service.captureSessionURLState();

      expect(state.sourceUrls).toBeUndefined();
    });

    it('SU-026: apply with sourceUrls loads all sources on empty session', async () => {
      let loadCount = 0;
      deps.session.sourceCount = 0;
      // Both session.loadSourceFromUrl and deps.loadSourceFromUrl are used
      // depending on whether session is empty or not at the time of each call
      deps.session.loadSourceFromUrl = vi.fn().mockImplementation(async () => {
        loadCount++;
        deps.session.sourceCount = loadCount;
      });
      const depsLoadSourceFromUrl = vi.fn().mockImplementation(async () => {
        loadCount++;
        deps.session.sourceCount = loadCount;
        return loadCount - 1;
      });

      deps = createDeps({
        session: deps.session,
        loadSourceFromUrl: depsLoadSourceFromUrl,
      });
      service = new SessionURLService(deps);

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceUrls: [
          'https://example.com/shot_a.exr',
          'https://example.com/shot_b.exr',
        ],
        sourceAIndex: 0,
        sourceBIndex: 1,
      };

      await service.applySessionURLState(state);

      // First source loaded via session.loadSourceFromUrl (empty session),
      // second via deps.loadSourceFromUrl (non-empty session)
      expect(deps.session.loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/shot_a.exr');
      expect(depsLoadSourceFromUrl).toHaveBeenCalledWith('https://example.com/shot_b.exr');
      expect(deps.session.setSourceA).toHaveBeenCalledWith(0);
      expect(deps.session.setSourceB).toHaveBeenCalledWith(1);
    });

    it('SU-027: apply with sourceUrls uses deps.loadSourceFromUrl for non-empty session', async () => {
      let loadCount = 1;
      deps.session.sourceCount = 1;
      deps.session.allSources = [{ url: 'https://example.com/existing.exr' }];

      const loadSourceFromUrl = vi.fn().mockImplementation(async () => {
        loadCount++;
        deps.session.sourceCount = loadCount;
        return loadCount - 1;
      });

      deps = createDeps({ loadSourceFromUrl });
      service = new SessionURLService(deps);

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceUrls: [
          'https://example.com/shot_a.exr',
          'https://example.com/shot_b.exr',
        ],
        sourceAIndex: 0,
        sourceBIndex: 1,
      };

      await service.applySessionURLState(state);

      expect(loadSourceFromUrl).toHaveBeenCalledTimes(2);
    });

    it('SU-028: apply with sourceUrls skips already-loaded sources', async () => {
      deps.session.sourceCount = 1;
      deps.session.allSources = [{ url: 'https://example.com/shot_a.exr' }];

      const loadSourceFromUrl = vi.fn().mockImplementation(async () => {
        deps.session.sourceCount = 2;
        deps.session.allSources.push({ url: 'https://example.com/shot_b.exr' });
        return 1;
      });

      deps = createDeps({
        loadSourceFromUrl,
        session: deps.session,
      });
      service = new SessionURLService(deps);

      const state: SessionURLState = {
        frame: 1,
        fps: 24,
        sourceIndex: 0,
        sourceUrls: [
          'https://example.com/shot_a.exr',
          'https://example.com/shot_b.exr',
        ],
        sourceAIndex: 0,
        sourceBIndex: 1,
      };

      await service.applySessionURLState(state);

      // shot_a.exr was already loaded, only shot_b.exr should be loaded
      expect(loadSourceFromUrl).toHaveBeenCalledTimes(1);
      expect(loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/shot_b.exr');
    });

    it('SU-029: backward compat — old single-sourceUrl links still work', async () => {
      deps.session.sourceCount = 0;
      deps.session.loadSourceFromUrl = vi.fn().mockImplementation(async () => {
        deps.session.sourceCount = 1;
      });

      const state: SessionURLState = {
        frame: 10,
        fps: 24,
        sourceIndex: 0,
        sourceUrl: 'https://example.com/legacy.exr',
        // no sourceUrls — old format
      };

      await service.applySessionURLState(state);

      expect(deps.session.loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/legacy.exr');
    });

    it('SU-030: round-trip capture → encode → decode → apply reconstructs A/B compare', async () => {
      // Set up a session with two sources in A/B compare mode
      deps.session.allSources = [
        { url: 'https://example.com/shot_a.exr' },
        { url: 'https://example.com/shot_b.exr' },
      ];
      deps.session.currentSource = { url: 'https://example.com/shot_a.exr' };
      deps.session.sourceAIndex = 0;
      deps.session.sourceBIndex = 1;
      deps.session.currentAB = 'B';
      deps.compareControl.getWipeMode.mockReturnValue('horizontal');
      deps.compareControl.getWipePosition.mockReturnValue(0.4);
      deps.viewer.getTransform.mockReturnValue({
        rotation: 0, flipH: false, flipV: false,
        scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 },
      });

      // Capture
      const captured = service.captureSessionURLState();
      expect(captured.sourceUrls).toHaveLength(2);

      // Encode → Decode
      const encoded = encodeSessionState(captured);
      const decoded = decodeSessionState(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.sourceUrls).toEqual([
        'https://example.com/shot_a.exr',
        'https://example.com/shot_b.exr',
      ]);

      // Apply on a fresh session
      let loadCount = 0;
      const freshSession = createMockSession();
      freshSession.sourceCount = 0;
      (freshSession as any).loadSourceFromUrl = vi.fn().mockImplementation(async () => {
        loadCount++;
        freshSession.sourceCount = loadCount;
      });
      const freshDepsLoadSource = vi.fn().mockImplementation(async () => {
        loadCount++;
        freshSession.sourceCount = loadCount;
        return loadCount - 1;
      });
      const freshDeps = createDeps({
        session: freshSession,
        loadSourceFromUrl: freshDepsLoadSource,
      });
      const freshService = new SessionURLService(freshDeps);
      await freshService.applySessionURLState(decoded!);

      // First source loaded via session.loadSourceFromUrl, second via deps.loadSourceFromUrl
      expect((freshSession as any).loadSourceFromUrl).toHaveBeenCalledTimes(1);
      expect(freshDepsLoadSource).toHaveBeenCalledTimes(1);
      // A/B compare state should be restored
      expect(freshSession.setSourceA).toHaveBeenCalledWith(0);
      expect(freshSession.setSourceB).toHaveBeenCalledWith(1);
      expect(freshSession.setCurrentAB).toHaveBeenCalledWith('B');
      expect(freshDeps.compareControl.setWipeMode).toHaveBeenCalledWith('horizontal');
      expect(freshDeps.compareControl.setWipePosition).toHaveBeenCalledWith(0.4);
    });
  });
});
