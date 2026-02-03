/**
 * Viewer Prerender Module
 * Contains helper functions for prerender buffer management.
 */

import { Session } from '../../core/session/Session';
import { PrerenderBufferManager } from '../../utils/PrerenderBufferManager';
import { AllEffectsState } from '../../utils/EffectProcessor';
import { ColorAdjustments } from './ColorControls';
import { FilterSettings } from './FilterControl';
import { CDLValues } from '../../color/CDL';
import { ColorCurvesData } from '../../color/ColorCurves';
import { ChannelMode } from './ChannelSelect';
import { ColorWheels } from './ColorWheels';
import { HSLQualifier } from './HSLQualifier';
import { ToneMappingState } from './ToneMappingControl';

/**
 * Create a frame loader function for the prerender buffer.
 * This returns raw frames from the session for subsequent effect processing.
 */
export function createFrameLoader(
  session: Session
): (frame: number) => HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | null {
  return (frame: number) => {
    try {
      const source = session.currentSource;
      if (!source) return null;

      if (source.type === 'sequence') {
        // For sequences, get the frame image synchronously
        // Use the frame parameter directly to avoid modifying session.currentFrame
        // which would trigger syncVideoToFrame and emit events during playback
        if (typeof session.getSequenceFrameSync !== 'function') {
          return null;
        }
        return session.getSequenceFrameSync(frame) || null;
      } else if (source.type === 'video') {
        // For videos with mediabunny, get cached frame canvas
        if (typeof session.isUsingMediabunny === 'function' &&
            session.isUsingMediabunny() &&
            typeof session.getVideoFrameCanvas === 'function') {
          return session.getVideoFrameCanvas(frame) || null;
        }
      }

      return null;
    } catch (error) {
      // Silently handle errors - frame will be rendered live instead
      console.warn(`Prerender frame loader error for frame ${frame}:`, error);
      return null;
    }
  };
}

/**
 * Build the current effects state for prerender buffer.
 * Collects all active effect parameters into a single state object.
 */
export function buildEffectsState(
  colorAdjustments: ColorAdjustments,
  cdlValues: CDLValues,
  curvesData: ColorCurvesData,
  filterSettings: FilterSettings,
  channelMode: ChannelMode,
  colorWheels: ColorWheels,
  hslQualifier: HSLQualifier,
  toneMappingState: ToneMappingState,
  colorInversionEnabled = false
): AllEffectsState {
  return {
    colorAdjustments: { ...colorAdjustments },
    cdlValues: JSON.parse(JSON.stringify(cdlValues)),
    curvesData: {
      master: { ...curvesData.master, points: [...curvesData.master.points] },
      red: { ...curvesData.red, points: [...curvesData.red.points] },
      green: { ...curvesData.green, points: [...curvesData.green.points] },
      blue: { ...curvesData.blue, points: [...curvesData.blue.points] },
    },
    filterSettings: { ...filterSettings },
    channelMode: channelMode,
    colorWheelsState: colorWheels.getState(),
    hslQualifierState: hslQualifier.getState(),
    toneMappingState: { ...toneMappingState },
    colorInversionEnabled,
  };
}

export interface PrerenderStats {
  cacheSize: number;
  totalFrames: number;
  pendingRequests: number;
  activeRequests: number;
  memorySizeMB: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
}

/**
 * Get prerender buffer statistics for UI display.
 */
export function getPrerenderStats(
  prerenderBuffer: PrerenderBufferManager | null,
  totalFrames: number,
  sourceWidth: number,
  sourceHeight: number
): PrerenderStats | null {
  if (!prerenderBuffer) {
    return null;
  }

  const stats = prerenderBuffer.getStats();

  // Calculate memory size (each cached frame is a canvas with RGBA data)
  let memorySizeMB = 0;
  if (stats.cacheSize > 0 && sourceWidth > 0 && sourceHeight > 0) {
    const bytesPerPixel = 4; // RGBA
    const bytesPerFrame = sourceWidth * sourceHeight * bytesPerPixel;
    memorySizeMB = (bytesPerFrame * stats.cacheSize) / (1024 * 1024);
  }

  return {
    cacheSize: stats.cacheSize,
    totalFrames,
    pendingRequests: stats.pendingRequests,
    activeRequests: stats.activeRequests,
    memorySizeMB,
    cacheHits: stats.cacheHits,
    cacheMisses: stats.cacheMisses,
    hitRate: stats.hitRate,
  };
}

/**
 * Effects debounce management constants.
 */
export const EFFECTS_DEBOUNCE_MS = 50;
