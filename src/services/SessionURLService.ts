/**
 * SessionURLService - Manages session state capture/apply for URL sharing
 * and URL bootstrap on app startup.
 *
 * Extracted from App.ts to isolate URL state management from the
 * top-level orchestrator.
 */

import {
  decodeSessionState,
  type SessionURLState,
} from '../core/session/SessionURLManager';
import {
  decodeWebRTCURLSignal,
  WEBRTC_URL_SIGNAL_PARAM,
} from '../network/WebRTCURLSignaling';
import type { Transform2D } from '../core/types/transform';

// ---------------------------------------------------------------------------
// Dependency interfaces (structural typing)
// ---------------------------------------------------------------------------

/** Subset of Session used by URL state management. */
export interface URLSession {
  readonly currentFrame: number;
  fps: number;
  readonly inPoint: number;
  readonly outPoint: number;
  readonly currentSourceIndex: number;
  readonly currentSource: { url?: string } | null;
  readonly sourceAIndex: number;
  readonly sourceBIndex: number;
  readonly currentAB: 'A' | 'B';
  readonly sourceCount: number;
  goToFrame(frame: number): void;
  setCurrentSource(index: number): void;
  setInPoint(frame: number): void;
  setOutPoint(frame: number): void;
  setSourceA(index: number): void;
  setSourceB(index: number): void;
  setCurrentAB(ab: 'A' | 'B'): void;
}

/** Subset of Viewer used by URL state management. */
export interface URLViewer {
  getTransform(): Transform2D;
  setTransform(transform: Transform2D): void;
}

/** Subset of CompareControl used by URL state management. */
export interface URLCompareControl {
  getWipeMode(): string;
  getWipePosition(): number;
  setWipeMode(mode: string): void;
  setWipePosition(position: number): void;
}

/** OCIO state subset used by URL state management. */
export interface URLOCIOState {
  enabled: boolean;
  configName: string;
  inputColorSpace: string;
  display: string;
  view: string;
  look: string;
}

/** Subset of OCIOControl used by URL state management. */
export interface URLOCIOControl {
  getState(): URLOCIOState;
  setState(state: URLOCIOState): void;
}

/** Subset of NetworkSyncManager used by URL state management. */
export interface URLNetworkSyncManager {
  getSyncStateManager(): {
    beginApplyRemote(): void;
    endApplyRemote(): void;
  };
  setPinCode(pin: string): void;
  joinRoom(roomCode: string, userName: string, pin?: string): void;
  joinServerlessRoomFromOfferToken(
    token: string,
    userName: string,
    pin?: string
  ): Promise<string | null>;
}

/** Subset of NetworkControl used by URL state management. */
export interface URLNetworkControl {
  setJoinRoomCodeFromLink(code: string): void;
  setPinCode(pin: string): void;
  setShareLink(url: string): void;
  setShareLinkKind(kind: 'invite' | 'response' | 'generic'): void;
  setResponseToken(token: string): void;
  showInfo(message: string): void;
}

/** All dependencies for SessionURLService. */
export interface SessionURLDeps {
  session: URLSession;
  viewer: URLViewer;
  compareControl: URLCompareControl;
  ocioControl: URLOCIOControl;
  networkSyncManager: URLNetworkSyncManager;
  networkControl: URLNetworkControl;
  getLocationSearch: () => string;
  getLocationHash: () => string;
  getLocationHref: () => string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SessionURLService {
  private readonly deps: SessionURLDeps;

  constructor(deps: SessionURLDeps) {
    this.deps = deps;
  }

  /** Capture current session state for URL sharing. */
  captureSessionURLState(): SessionURLState {
    const { session, viewer, compareControl, ocioControl } = this.deps;
    const ocioState = ocioControl.getState();
    const source = session.currentSource;

    return {
      frame: session.currentFrame,
      fps: session.fps,
      inPoint: session.inPoint,
      outPoint: session.outPoint,
      sourceIndex: session.currentSourceIndex,
      sourceUrl: source?.url,
      sourceAIndex: session.sourceAIndex,
      sourceBIndex: session.sourceBIndex >= 0 ? session.sourceBIndex : undefined,
      currentAB: session.currentAB,
      transform: viewer.getTransform(),
      wipeMode: compareControl.getWipeMode(),
      wipePosition: compareControl.getWipePosition(),
      ocio: ocioState.enabled ? {
        enabled: ocioState.enabled,
        configName: ocioState.configName,
        inputColorSpace: ocioState.inputColorSpace,
        display: ocioState.display,
        view: ocioState.view,
        look: ocioState.look,
      } : undefined,
    };
  }

  /** Apply a decoded session state to the session/viewer. */
  applySessionURLState(state: SessionURLState): void {
    const { session, viewer, compareControl, ocioControl, networkSyncManager } = this.deps;
    const syncStateManager = networkSyncManager.getSyncStateManager();
    syncStateManager.beginApplyRemote();
    try {
      if (session.sourceCount > 0) {
        const sourceIndex = Math.max(0, Math.min(session.sourceCount - 1, state.sourceIndex));
        session.setCurrentSource(sourceIndex);
      }

      if (typeof state.fps === 'number' && state.fps > 0) {
        session.fps = state.fps;
      }
      if (typeof state.inPoint === 'number') {
        session.setInPoint(state.inPoint);
      }
      if (typeof state.outPoint === 'number') {
        session.setOutPoint(state.outPoint);
      }

      if (typeof state.sourceAIndex === 'number') {
        session.setSourceA(state.sourceAIndex);
      }
      if (typeof state.sourceBIndex === 'number') {
        session.setSourceB(state.sourceBIndex);
      }
      if (state.currentAB === 'A' || state.currentAB === 'B') {
        session.setCurrentAB(state.currentAB);
      }

      if (typeof state.frame === 'number') {
        session.goToFrame(state.frame);
      }

      if (state.transform) {
        viewer.setTransform(state.transform);
      }

      if (typeof state.wipeMode === 'string') {
        compareControl.setWipeMode(state.wipeMode);
      }
      if (typeof state.wipePosition === 'number') {
        compareControl.setWipePosition(state.wipePosition);
      }

      if (state.ocio) {
        const currentOcio = ocioControl.getState();
        ocioControl.setState({
          enabled: state.ocio.enabled ?? true,
          configName: state.ocio.configName ?? currentOcio.configName,
          inputColorSpace: state.ocio.inputColorSpace ?? currentOcio.inputColorSpace,
          display: state.ocio.display ?? currentOcio.display,
          view: state.ocio.view ?? currentOcio.view,
          look: state.ocio.look ?? currentOcio.look,
        });
      }
    } finally {
      syncStateManager.endApplyRemote();
    }
  }

  /** Handle URL parameters on app startup (room, pin, WebRTC, shared state). */
  async handleURLBootstrap(): Promise<void> {
    const { networkControl, networkSyncManager } = this.deps;

    const params = new URLSearchParams(this.deps.getLocationSearch());
    const roomCode = params.get('room');
    const pinCode = params.get('pin');
    const webrtcSignalToken = params.get(WEBRTC_URL_SIGNAL_PARAM);

    if (roomCode) {
      networkControl.setJoinRoomCodeFromLink(roomCode.toUpperCase());
    }

    if (pinCode) {
      networkControl.setPinCode(pinCode);
      networkSyncManager.setPinCode(pinCode);
    }

    let handledServerlessOffer = false;
    if (webrtcSignalToken) {
      const signal = decodeWebRTCURLSignal(webrtcSignalToken);
      if (signal?.type === 'offer') {
        handledServerlessOffer = true;
        const answerToken = await networkSyncManager.joinServerlessRoomFromOfferToken(
          webrtcSignalToken,
          'User',
          pinCode ?? signal.pinCode
        );
        if (answerToken) {
          const responseURL = new URL(this.deps.getLocationHref());
          responseURL.search = '';
          responseURL.hash = '';
          responseURL.searchParams.set('room', signal.roomCode);
          const activePin = pinCode ?? signal.pinCode;
          if (activePin) {
            responseURL.searchParams.set('pin', activePin);
          }
          responseURL.searchParams.set(WEBRTC_URL_SIGNAL_PARAM, answerToken);
          networkControl.setShareLink(responseURL.toString());
          networkControl.setShareLinkKind('response');
          networkControl.setResponseToken(answerToken);
          networkControl.showInfo(
            'Connected as guest via WebRTC. Copy the response token (or response URL) and send it to the host.'
          );
        }
      } else if (signal?.type === 'answer') {
        handledServerlessOffer = true;
        networkControl.showInfo(
          'This is a WebRTC response link. Paste it into the host Network Sync panel and click Apply.'
        );
      }
    }

    if (!handledServerlessOffer && roomCode && pinCode) {
      networkSyncManager.joinRoom(roomCode.toUpperCase(), 'User', pinCode);
    }

    const sharedState = decodeSessionState(this.deps.getLocationHash());
    if (sharedState) {
      this.applySessionURLState(sharedState);
    }
  }

  /** Release references. */
  dispose(): void {
    // Currently no subscriptions to clean up.
    // Exists for lifecycle consistency with other services.
  }
}
