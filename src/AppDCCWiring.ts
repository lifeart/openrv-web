/**
 * AppDCCWiring - Wire DCCBridge events to session/viewer/controls.
 *
 * Handles:
 * - Inbound syncFrame with loop-protection flag
 * - Inbound loadMedia (dispatches to session.loadImage or session.loadVideo)
 * - Inbound syncColor (applies exposure/gamma/temperature/tint)
 * - Outbound frameChanged (suppressed during inbound sync)
 * - Outbound colorChanged (forwards color adjustments to DCC bridge)
 */

import type { DCCBridge, SyncColorMessage } from './integrations/DCCBridge';
import type { ColorAdjustments } from './core/types/color';
import { Logger } from './utils/Logger';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';

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
}

/** Minimal colorControls surface needed by DCC wiring. */
export interface DCCWiringColorControls {
  setAdjustments(adjustments: Partial<ColorAdjustments>): void;
  getAdjustments(): ColorAdjustments;
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
}

/** Mutable state owned by the DCC wiring (exposed for loop-protection tests). */
export interface DCCWiringState {
  suppressFrameSync: boolean;
  subscriptions: DisposableSubscriptionManager;
}

// ---------------------------------------------------------------------------
// Video extension list (shared constant)
// ---------------------------------------------------------------------------

export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv'];

// ---------------------------------------------------------------------------
// Wiring function
// ---------------------------------------------------------------------------

/**
 * Wire all DCC bridge events. Returns mutable state so the caller
 * (App) can inspect or override the frame-sync suppression flag.
 */
export function wireDCCBridge(deps: DCCWiringDeps): DCCWiringState {
  const { dccBridge, session, viewer, colorControls } = deps;

  const subs = new DisposableSubscriptionManager();

  const state: DCCWiringState = { suppressFrameSync: false, subscriptions: subs };

  // Inbound: syncFrame with loop protection
  subs.add(dccBridge.on('syncFrame', (msg) => {
    state.suppressFrameSync = true;
    try {
      session.goToFrame(msg.frame);
    } finally {
      state.suppressFrameSync = false;
    }
  }));

  // Inbound: loadMedia - dispatch to image or video loader
  subs.add(dccBridge.on('loadMedia', (msg) => {
    const path = msg.path;
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const name = path.split('/').pop() ?? path;
    if (VIDEO_EXTENSIONS.includes(ext)) {
      session.loadVideo(name, path).then(() => {
        if (typeof msg.frame === 'number') {
          session.goToFrame(msg.frame);
        }
      }).catch((err) => { log.error('Failed to load video from DCC:', err); });
    } else {
      session.loadImage(name, path).then(() => {
        if (typeof msg.frame === 'number') {
          session.goToFrame(msg.frame);
        }
      }).catch((err) => { log.error('Failed to load image from DCC:', err); });
    }
  }));

  // Inbound: syncColor - apply color settings to viewer via controls
  subs.add(dccBridge.on('syncColor', (msg: SyncColorMessage) => {
    const adjustments: Partial<ColorAdjustments> = {};
    if (typeof msg.exposure === 'number') adjustments.exposure = msg.exposure;
    if (typeof msg.gamma === 'number') adjustments.gamma = msg.gamma;
    if (typeof msg.temperature === 'number') adjustments.temperature = msg.temperature;
    if (typeof msg.tint === 'number') adjustments.tint = msg.tint;
    if (Object.keys(adjustments).length > 0) {
      colorControls.setAdjustments(adjustments);
      viewer.setColorAdjustments(colorControls.getAdjustments());
    }
  }));

  // Outbound: frameChanged (with loop protection)
  subs.add(session.on('frameChanged', () => {
    if (!state.suppressFrameSync) {
      dccBridge.sendFrameChanged(session.currentFrame, session.frameCount);
    }
  }));

  // Outbound: adjustmentsChanged -> send color to DCC bridge
  subs.add(colorControls.on('adjustmentsChanged', (adjustments: ColorAdjustments) => {
    dccBridge.sendColorChanged({
      exposure: adjustments.exposure,
      gamma: adjustments.gamma,
      temperature: adjustments.temperature,
      tint: adjustments.tint,
    });
  }));

  return state;
}
