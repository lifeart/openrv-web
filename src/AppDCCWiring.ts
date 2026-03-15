/**
 * AppDCCWiring - Wire DCCBridge events to session/viewer/controls.
 *
 * Handles:
 * - Inbound syncFrame with loop-protection flag
 * - Inbound loadMedia (dispatches to session.loadImage or session.loadVideo)
 * - Inbound syncColor (applies exposure/gamma/temperature/tint + LUT loading)
 * - Outbound frameChanged (suppressed during inbound sync)
 * - Outbound colorChanged (forwards color adjustments to DCC bridge)
 */

import type { DCCBridge, SyncColorMessage } from './integrations/DCCBridge';
import type { ColorAdjustments } from './core/types/color';
import type { LUT } from './color/LUTLoader';
import { isLUT3D } from './color/LUTLoader';
import { parseLUT } from './color/LUTFormatDetect';
import type { Annotation } from './paint/types';
import { Logger } from './utils/Logger';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';
<<<<<<< ours
import { basename } from './utils/path';
import { isVideoExtension } from './utils/media/SupportedMediaFormats';
import { showAlert } from './ui/components/shared/Modal';
=======
import { detectMediaTypeFromUrl } from './utils/media/SupportedMediaFormats';
>>>>>>> theirs

const log = new Logger('AppDCCWiring');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal session surface needed by DCC wiring. */
export interface DCCWiringSession {
  goToFrame(frame: number): void;
  loadImage(name: string, url: string): Promise<void>;
  loadVideo(name: string, url: string): Promise<void>;
  readonly currentFrame: number;
  readonly frameCount: number;
  on(event: string, handler: (...args: any[]) => void): any;
}

/** Minimal viewer surface needed by DCC wiring. */
export interface DCCWiringViewer {
  setColorAdjustments(adjustments: ColorAdjustments): void;
  setLUT(lut: LUT | null): void;
}

/** Minimal colorControls surface needed by DCC wiring. */
export interface DCCWiringColorControls {
  setAdjustments(adjustments: Partial<ColorAdjustments>): void;
  getAdjustments(): ColorAdjustments;
  setLUT(lut: LUT | null): void;
  on(event: string, handler: (...args: any[]) => void): any;
}

/** Minimal paintEngine surface needed by DCC wiring. */
export interface DCCWiringPaintEngine {
  on(event: string, handler: (...args: any[]) => void): any;
}

/**
 * Dependencies that the DCC wiring needs. These come from App-level
 * objects that are not part of AppWiringContext.
 */
export interface DCCWiringDeps {
  dccBridge: DCCBridge;
  session: DCCWiringSession;
  viewer: DCCWiringViewer;
  colorControls: DCCWiringColorControls;
  /** Optional paint engine for forwarding annotation events to the DCC bridge. */
  paintEngine?: DCCWiringPaintEngine;
  /** Optional fetch implementation for loading LUT files (defaults to globalThis.fetch). */
  fetchFn?: typeof globalThis.fetch;
  /** Optional alert function for surfacing errors to the user (defaults to showAlert). */
  showAlertFn?: (message: string, options?: { type?: string; title?: string }) => void;
}

/** Mutable state owned by the DCC wiring (exposed for loop-protection tests). */
export interface DCCWiringState {
  suppressFrameSync: boolean;
  subscriptions: DisposableSubscriptionManager;
  /** Generation counter for "latest LUT request wins" ordering. */
  lutGeneration: number;
}

// ---------------------------------------------------------------------------
// LUT loading helper
// ---------------------------------------------------------------------------

/**
 * Fetch a LUT file from a URL/path, parse it, and apply it to the viewer.
 * Uses a generation counter from `state` to implement "latest request wins":
 * if a newer request starts before this one completes, the stale result is discarded.
 * Failures are logged as warnings and never propagate to break the sync handler.
 */
export async function fetchAndApplyLUT(
  lutPath: string,
  fetchFn: typeof globalThis.fetch,
  colorControls: DCCWiringColorControls,
  viewer: DCCWiringViewer,
  state: DCCWiringState,
): Promise<void> {
  const generation = ++state.lutGeneration;

  try {
    const response = await fetchFn(lutPath);

    // Discard stale result if a newer request has started
    if (state.lutGeneration !== generation) {
      log.info(`Discarding stale LUT response for "${lutPath}" (generation ${generation}, current ${state.lutGeneration})`);
      return;
    }

    if (!response.ok) {
      log.warn(`Failed to fetch LUT from "${lutPath}": HTTP ${response.status}`);
      return;
    }

    const content = await response.text();

    // Check again after second await
    if (state.lutGeneration !== generation) {
      log.info(`Discarding stale LUT response for "${lutPath}" (generation ${generation}, current ${state.lutGeneration})`);
      return;
    }

    const filename = basename(lutPath);
    const lut = parseLUT(filename, content);

    colorControls.setLUT(lut);
    viewer.setLUT(lut);
    log.info(`Applied LUT from DCC: "${lutPath}" (${lut.title}, size ${lut.size}${isLUT3D(lut) ? '^3' : ''})`);
  } catch (err) {
    log.warn(`Failed to load LUT from "${lutPath}":`, err);
  }
}

// ---------------------------------------------------------------------------
// Annotation type mapping
// ---------------------------------------------------------------------------

/**
 * Map an Annotation's `type` field to the DCC protocol annotation type.
 * PaintEngine uses 'pen' | 'text' | 'shape'; the DCC protocol expects the same.
 */
export function mapAnnotationType(annotation: Annotation): 'pen' | 'text' | 'shape' {
  return annotation.type;
}

// ---------------------------------------------------------------------------
// Wiring function
// ---------------------------------------------------------------------------

/**
 * Wire all DCC bridge events. Returns mutable state so the caller
 * (App) can inspect or override the frame-sync suppression flag.
 */
export function wireDCCBridge(deps: DCCWiringDeps): DCCWiringState {
  const { dccBridge, session, viewer, colorControls, paintEngine } = deps;
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  const alertFn = deps.showAlertFn ?? ((msg: string, opts?: { type?: string; title?: string }) =>
    showAlert(msg, opts as any));

  const subs = new DisposableSubscriptionManager();

  const state: DCCWiringState = { suppressFrameSync: false, subscriptions: subs, lutGeneration: 0 };

  // Error event: surface DCC bridge errors to the user with throttling
  const ERROR_THROTTLE_MS = 5_000;
  let lastErrorAlertTime = 0;
  subs.add(
    dccBridge.on('error', (err: Error) => {
      const now = Date.now();
      if (now - lastErrorAlertTime >= ERROR_THROTTLE_MS) {
        lastErrorAlertTime = now;
        alertFn(`DCC connection error: ${err.message}`, {
          type: 'warning',
          title: 'DCC Bridge',
        });
      }
      log.warn('DCC bridge error:', err.message);
    }),
  );

  // Inbound: syncFrame with loop protection
  subs.add(
    dccBridge.on('syncFrame', (msg) => {
      state.suppressFrameSync = true;
      try {
        session.goToFrame(msg.frame);
      } finally {
        state.suppressFrameSync = false;
      }
    }),
  );

  // Inbound: loadMedia - dispatch to image or video loader
  subs.add(
    dccBridge.on('loadMedia', (msg) => {
      const path = msg.path;
<<<<<<< ours
      // Strip query strings and fragments before extracting the extension
      // so that URLs like "shot.mov?token=abc" or "clip.mp4#t=10" are
      // correctly recognised as video.
      const cleanPath = path.split('?')[0]!.split('#')[0]!;
      const ext = cleanPath.split('.').pop()?.toLowerCase() ?? '';
      const name = basename(cleanPath);
      if (isVideoExtension(ext)) {
        session
          .loadVideo(name, path)
          .then(() => {
            if (typeof msg.frame === 'number') {
              session.goToFrame(msg.frame);
            }
          })
          .catch((err) => {
            log.error('Failed to load video from DCC:', err);
            dccBridge.sendError(
              'LOAD_MEDIA_FAILED',
              `Failed to load video "${path}": ${err instanceof Error ? err.message : String(err)}`,
              msg.id,
            );
          });
      } else {
        session
          .loadImage(name, path)
          .then(() => {
            if (typeof msg.frame === 'number') {
              session.goToFrame(msg.frame);
            }
          })
          .catch((err) => {
            log.error('Failed to load image from DCC:', err);
            dccBridge.sendError(
              'LOAD_MEDIA_FAILED',
              `Failed to load image "${path}": ${err instanceof Error ? err.message : String(err)}`,
              msg.id,
            );
          });
      }
=======
      const name = path.split('/').pop() ?? path;
      detectMediaTypeFromUrl(path)
        .then((mediaType) => {
          if (mediaType === 'video') {
            return session.loadVideo(name, path);
          } else {
            return session.loadImage(name, path);
          }
        })
        .then(() => {
          if (typeof msg.frame === 'number') {
            session.goToFrame(msg.frame);
          }
        })
        .catch((err) => {
          log.error('Failed to load media from DCC:', err);
        });
>>>>>>> theirs
    }),
  );

  // Inbound: syncColor - apply color settings to viewer via controls
  subs.add(
    dccBridge.on('syncColor', (msg: SyncColorMessage) => {
      const adjustments: Partial<ColorAdjustments> = {};
      if (typeof msg.exposure === 'number') adjustments.exposure = msg.exposure;
      if (typeof msg.gamma === 'number') adjustments.gamma = msg.gamma;
      if (typeof msg.temperature === 'number') adjustments.temperature = msg.temperature;
      if (typeof msg.tint === 'number') adjustments.tint = msg.tint;
      if (Object.keys(adjustments).length > 0) {
        colorControls.setAdjustments(adjustments);
        viewer.setColorAdjustments(colorControls.getAdjustments());
      }

      // Handle LUT path: fetch, parse, and apply
      if (typeof msg.lutPath === 'string' && msg.lutPath.length > 0) {
        fetchAndApplyLUT(msg.lutPath, fetchFn, colorControls, viewer, state);
      }
    }),
  );

  // Outbound: frameChanged (with loop protection)
  subs.add(
    session.on('frameChanged', () => {
      if (!state.suppressFrameSync) {
        const sent = dccBridge.sendFrameChanged(session.currentFrame, session.frameCount);
        if (!sent) {
          log.warn('DCC frame sync dropped: bridge is not writable');
        }
      }
    }),
  );

  // Outbound: adjustmentsChanged -> send color to DCC bridge
  subs.add(
    colorControls.on('adjustmentsChanged', (adjustments: ColorAdjustments) => {
      const sent = dccBridge.sendColorChanged({
        exposure: adjustments.exposure,
        gamma: adjustments.gamma,
        temperature: adjustments.temperature,
        tint: adjustments.tint,
      });
      if (!sent) {
        log.warn('DCC color sync dropped: bridge is not writable');
      }
    }),
  );

  // Outbound: strokeAdded -> send annotationAdded to DCC bridge
  if (paintEngine) {
    subs.add(
      paintEngine.on('strokeAdded', (annotation: Annotation) => {
        const sent = dccBridge.sendAnnotationAdded(
          annotation.frame,
          mapAnnotationType(annotation),
          annotation.id,
        );
        if (!sent) {
          log.warn('DCC annotation sync dropped: bridge is not writable');
        }
      }),
    );
  }

  return state;
}
