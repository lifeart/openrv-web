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
  type RepresentationURLState,
} from '../core/session/SessionURLManager';
import { decodeWebRTCURLSignal, WEBRTC_URL_SIGNAL_PARAM } from '../network/WebRTCURLSignaling';
import type { Transform2D } from '../core/types/transform';
import { DEFAULT_TRANSFORM } from '../core/types/transform';
import type { AddRepresentationConfig, MediaRepresentation } from '../core/types/representation';

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
  readonly allSources: ReadonlyArray<{ url?: string }>;
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
  clearSourceB(): void;
  setCurrentAB(ab: 'A' | 'B'): void;
  /** Load media from a URL. Used to reconstruct shared media on a clean session. */
  loadSourceFromUrl?(url: string): Promise<void>;
  /** Get the active representation for a source. Returns null if none. */
  getActiveRepresentation?(sourceIndex: number): MediaRepresentation | null;
  /** Add a representation to a source. Returns the created representation or null. */
  addRepresentationToSource?(sourceIndex: number, config: AddRepresentationConfig): MediaRepresentation | null;
  /** Switch the active representation for a source. Returns true on success. */
  activateRepresentation?(sourceIndex: number, repId: string): Promise<boolean>;
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
  joinServerlessRoomFromOfferToken(token: string, userName: string, pin?: string): Promise<string | null>;
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
  /**
   * Optional callback to load a source from URL into the session,
   * returning the new source index (or -1 on failure).
   * Used when the session already has media loaded.
   */
  loadSourceFromUrl?: (url: string) => Promise<number>;
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

    // Collect all source URLs when multiple sources are loaded
    // (enables multi-source A/B compare reconstruction on the receiving end)
    let sourceUrls: string[] | undefined;
    if (session.allSources.length > 1) {
      const urls = session.allSources
        .map((s) => s.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0);
      if (urls.length > 1) {
        sourceUrls = urls;
      }
    }

    // Collect active representations for each source
    let representations: RepresentationURLState[] | undefined;
    if (session.getActiveRepresentation) {
      const reps: RepresentationURLState[] = [];
      for (let i = 0; i < session.allSources.length; i++) {
        const rep = session.getActiveRepresentation(i);
        if (rep) {
          const { file: _file, files: _files, ...serializableConfig } = rep.loaderConfig;
          reps.push({
            sourceIndex: i,
            id: rep.id,
            label: rep.label,
            kind: rep.kind,
            resolution: { ...rep.resolution },
            loaderConfig: { ...serializableConfig },
          });
        }
      }
      if (reps.length > 0) {
        representations = reps;
      }
    }

    return {
      frame: session.currentFrame,
      fps: session.fps,
      inPoint: session.inPoint,
      outPoint: session.outPoint,
      sourceIndex: session.currentSourceIndex,
      sourceUrl: source?.url,
      sourceUrls,
      sourceAIndex: session.sourceAIndex,
      sourceBIndex: session.sourceBIndex >= 0 ? session.sourceBIndex : undefined,
      currentAB: session.currentAB,
      transform: viewer.getTransform(),
      wipeMode: compareControl.getWipeMode(),
      wipePosition: compareControl.getWipePosition(),
      ocio: ocioState.enabled
        ? {
            enabled: ocioState.enabled,
            configName: ocioState.configName,
            inputColorSpace: ocioState.inputColorSpace,
            display: ocioState.display,
            view: ocioState.view,
            look: ocioState.look,
          }
        : undefined,
      representations,
    };
  }

  /**
   * Find the index of an already-loaded source by URL match.
   * Returns -1 if no match found.
   */
  private findSourceIndexByUrl(url: string): number {
    const { session } = this.deps;
    for (let i = 0; i < session.allSources.length; i++) {
      if (session.allSources[i]?.url === url) return i;
    }
    return -1;
  }

  /**
   * Load multiple source URLs in order, skipping any that are already loaded.
   * Used to reconstruct multi-source A/B compare sessions from share links.
   */
  private async loadMultipleSources(urls: string[]): Promise<void> {
    const { session } = this.deps;

    for (const url of urls) {
      // Skip if already loaded
      if (this.findSourceIndexByUrl(url) >= 0) {
        console.info(`[SessionURLService] Source already loaded, skipping: ${url}`);
        continue;
      }

      try {
        console.info(`[SessionURLService] Loading source from share link: ${url}`);
        if (session.sourceCount === 0 && session.loadSourceFromUrl) {
          await session.loadSourceFromUrl(url);
        } else if (this.deps.loadSourceFromUrl) {
          await this.deps.loadSourceFromUrl(url);
        } else {
          console.warn(`[SessionURLService] No loader available for source: ${url}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[SessionURLService] Failed to load source: ${url}`, err);
        this.deps.networkControl.showInfo(`Failed to load shared media: ${reason}`);
      }
    }
  }

  /** Apply a decoded session state to the session/viewer. */
  async applySessionURLState(state: SessionURLState): Promise<void> {
    const { session, viewer, compareControl, ocioControl, networkSyncManager } = this.deps;

    // Phase 1: Resolve shared media (always, regardless of session state)
    // If sourceUrls (multi-source) or sourceUrl (single-source) is present,
    // ensure that media is available in the session before applying view/compare state.
    let resolvedSourceIndex = state.sourceIndex;

    if (state.sourceUrls && state.sourceUrls.length > 0) {
      // Multi-source share link: load all source URLs in order
      await this.loadMultipleSources(state.sourceUrls);
      // resolvedSourceIndex stays as state.sourceIndex — the indices should
      // match because we loaded sources in the same order they were captured.
      resolvedSourceIndex = Math.min(state.sourceIndex, Math.max(0, session.sourceCount - 1));
    } else if (state.sourceUrl) {
      // Legacy single-source share link
      // First, check if the URL is already loaded
      const existingIndex = this.findSourceIndexByUrl(state.sourceUrl);
      if (existingIndex >= 0) {
        // Already loaded — just navigate to it
        resolvedSourceIndex = existingIndex;
        console.info(`[SessionURLService] Shared media already loaded at index ${existingIndex}`);
      } else {
        // Not loaded yet — attempt to load it
        try {
          console.info(`[SessionURLService] Loading media from share link: ${state.sourceUrl}`);
          if (session.sourceCount === 0 && session.loadSourceFromUrl) {
            // Empty session: use session's own loadSourceFromUrl
            await session.loadSourceFromUrl(state.sourceUrl);
            // After loading, the new source should be the last one
            resolvedSourceIndex = Math.max(0, session.sourceCount - 1);
          } else if (this.deps.loadSourceFromUrl) {
            // Non-empty session: use the deps callback to add a new source
            const newIndex = await this.deps.loadSourceFromUrl(state.sourceUrl);
            if (newIndex >= 0) {
              resolvedSourceIndex = newIndex;
            } else {
              console.warn('[SessionURLService] loadSourceFromUrl returned -1, using original sourceIndex');
            }
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(
            '[SessionURLService] Failed to load media from share link sourceUrl, continuing with view state:',
            err,
          );
          this.deps.networkControl.showInfo(`Failed to load shared media: ${reason}`);
        }
      }
    }

    const syncStateManager = networkSyncManager.getSyncStateManager();
    syncStateManager.beginApplyRemote();
    try {
      if (session.sourceCount > 0) {
        const sourceIndex = Math.max(0, Math.min(session.sourceCount - 1, resolvedSourceIndex));
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
        // Clamp sourceAIndex to valid range (0 to sourceCount-1)
        const clampedA =
          session.sourceCount > 0 ? Math.max(0, Math.min(session.sourceCount - 1, state.sourceAIndex)) : 0;
        session.setSourceA(clampedA);

        // When the share link is compare-aware (sourceAIndex present) but has
        // no B assignment, explicitly clear the recipient's B source so it
        // matches the sender's "no B" state.  Links without any compare state
        // (older versions) leave B untouched for backward compat.
        if (typeof state.sourceBIndex !== 'number') {
          session.clearSourceB();
        }
      }
      if (typeof state.sourceBIndex === 'number') {
        // Validate sourceBIndex: if out of range, clear B instead of setting invalid index
        if (session.sourceCount > 0 && state.sourceBIndex >= 0 && state.sourceBIndex < session.sourceCount) {
          session.setSourceB(state.sourceBIndex);
        } else {
          session.clearSourceB();
        }
      }
      if (state.currentAB === 'A' || state.currentAB === 'B') {
        session.setCurrentAB(state.currentAB);
      }

      if (typeof state.frame === 'number') {
        session.goToFrame(state.frame);
      }

      if (state.transform) {
        viewer.setTransform(state.transform);
      } else {
        // Reset transform to default when omitted (compact encoding strips defaults)
        viewer.setTransform({
          ...DEFAULT_TRANSFORM,
          scale: { ...DEFAULT_TRANSFORM.scale },
          translate: { ...DEFAULT_TRANSFORM.translate },
        });
      }

      if (typeof state.wipeMode === 'string') {
        compareControl.setWipeMode(state.wipeMode);
      } else {
        // Reset wipe to 'off' when omitted (compact encoding strips 'off')
        compareControl.setWipeMode('off');
      }
      if (typeof state.wipePosition === 'number') {
        compareControl.setWipePosition(state.wipePosition);
      } else {
        // Reset wipe position to center when omitted (compact encoding strips 0.5)
        compareControl.setWipePosition(0.5);
      }

      if (state.currentAB == null) {
        // Reset to 'A' when omitted (compact encoding strips 'A')
        session.setCurrentAB('A');
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
      } else {
        // Reset OCIO to disabled when omitted (compact encoding strips disabled OCIO)
        const currentOcio = ocioControl.getState();
        if (currentOcio.enabled) {
          ocioControl.setState({ ...currentOcio, enabled: false });
        }
      }

      // Restore active representations
      if (
        state.representations &&
        state.representations.length > 0 &&
        session.addRepresentationToSource &&
        session.activateRepresentation
      ) {
        for (const repState of state.representations) {
          try {
            const rep = session.addRepresentationToSource(repState.sourceIndex, {
              id: repState.id,
              label: repState.label,
              kind: repState.kind,
              resolution: repState.resolution,
              loaderConfig: repState.loaderConfig,
            });
            if (rep) {
              await session.activateRepresentation(repState.sourceIndex, rep.id);
            }
          } catch (err) {
            console.warn(
              `[SessionURLService] Failed to restore representation "${repState.label}" for source ${repState.sourceIndex}:`,
              err,
            );
          }
        }
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
          pinCode ?? signal.pinCode,
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
            'Connected as guest via WebRTC. Copy the response token (or response URL) and send it to the host.',
          );
        } else {
          networkControl.showInfo(
            'The WebRTC invite link could not be processed. It may be malformed, expired, or the connection is already in use.',
          );
        }
      } else if (signal?.type === 'answer') {
        handledServerlessOffer = true;
        networkControl.showInfo(
          'This is a WebRTC response link. Paste it into the host Network Sync panel and click Apply.',
        );
      } else {
        // signal is null (malformed/corrupt token) or has an unrecognized type
        handledServerlessOffer = true;
        networkControl.showInfo('The WebRTC link is malformed or corrupted and could not be processed.');
      }
    }

    if (!handledServerlessOffer && roomCode) {
      networkSyncManager.joinRoom(roomCode.toUpperCase(), 'User', pinCode ?? undefined);
    }

    const locationHash = this.deps.getLocationHash();
    const sharedState = decodeSessionState(locationHash);
    if (sharedState) {
      await this.applySessionURLState(sharedState);
    } else if (this.hashContainsSessionParam(locationHash)) {
      networkControl.showInfo('Could not restore shared session state: the link may be corrupted or incomplete.');
    }
  }

  /** Check whether the hash fragment contains a `s=` session parameter. */
  private hashContainsSessionParam(hash: string): boolean {
    const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!cleaned) return false;
    return cleaned.startsWith('s=') || cleaned.includes('&s=');
  }

  /** Release references. */
  dispose(): void {
    // Currently no subscriptions to clean up.
    // Exists for lifecycle consistency with other services.
  }
}
