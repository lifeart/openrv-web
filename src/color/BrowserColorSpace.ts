/**
 * BrowserColorSpace - Browser display color space detection utilities
 *
 * Detects the browser's display capabilities including:
 * - Color space (sRGB, display-p3)
 * - Color gamut (sRGB, P3, Rec.2020)
 * - HDR support
 * - Estimated bit depth
 */

import type { DisplayCapabilities } from './DisplayCapabilities';

/**
 * Browser color space detection result
 */
export interface BrowserColorSpaceInfo {
  colorSpace: string;       // 'srgb' | 'display-p3' | 'unknown'
  gamut: 'srgb' | 'p3' | 'rec2020' | 'unknown';
  hdr: boolean;
  bitDepth: number;         // estimated: 8, 10, 12
}

/**
 * Detect the browser's display color space capabilities.
 *
 * Detection strategy (layered, most to least reliable):
 * 1. matchMedia('(color-gamut: ...)') for display gamut (Chrome 58+, Safari 10+; broken in Firefox for p3/rec2020)
 * 2. Canvas 2D getContextAttributes().colorSpace for rendering capability (Chrome 104+, Safari 15+)
 * 3. matchMedia('(dynamic-range: high)') for HDR (Chrome 98+, Safari 13.1+)
 *
 * Note: screen.colorSpace does not exist in any browser — the previous check was based on
 * a misidentification of ImageData.colorSpace / CanvasRenderingContext2DSettings.colorSpace.
 */
export function detectBrowserColorSpace(): BrowserColorSpaceInfo {
  const info: BrowserColorSpaceInfo = {
    colorSpace: 'unknown',
    gamut: 'unknown',
    hdr: false,
    bitDepth: 8,
  };

  // 1. Check color gamut via matchMedia (Chrome 58+, Safari 10+; Firefox always reports srgb)
  if (typeof matchMedia !== 'undefined') {
    if (matchMedia('(color-gamut: rec2020)').matches) {
      info.gamut = 'rec2020';
    } else if (matchMedia('(color-gamut: p3)').matches) {
      info.gamut = 'p3';
    } else if (matchMedia('(color-gamut: srgb)').matches) {
      info.gamut = 'srgb';
    }

    // 2. Check HDR support
    if (matchMedia('(dynamic-range: high)').matches) {
      info.hdr = true;
    }

    // 3. Estimate bit depth from gamut
    if (info.gamut === 'rec2020') {
      info.bitDepth = 12;
    } else if (info.gamut === 'p3') {
      info.bitDepth = 10;
    }
  }

  // 4. Infer colorSpace from gamut detection and canvas capability
  if (info.gamut === 'p3' || info.gamut === 'rec2020') {
    // Display supports wide gamut — check if canvas can actually render P3
    info.colorSpace = canvasSupportsDisplayP3() ? 'display-p3' : 'srgb';
  } else if (info.gamut === 'srgb') {
    info.colorSpace = 'srgb';
  }
  // If gamut is 'unknown' (e.g. matchMedia unavailable), colorSpace stays 'unknown'

  return info;
}

/**
 * Check if canvas supports display-p3 color space.
 *
 * Uses getContextAttributes() for a strict check — Firefox returns a non-null
 * context but silently ignores the colorSpace option, so ctx !== null alone
 * gives false positives there.
 */
export function canvasSupportsDisplayP3(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 1;
    testCanvas.height = 1;
    const ctx = testCanvas.getContext('2d', { colorSpace: 'display-p3' } as CanvasRenderingContext2DSettings);
    if (!ctx) return false;
    const attrs = ctx.getContextAttributes();
    return attrs?.colorSpace === 'display-p3';
  } catch {
    return false;
  }
}

/**
 * Human-readable label for detected gamut
 */
export function gamutLabel(gamut: BrowserColorSpaceInfo['gamut']): string {
  switch (gamut) {
    case 'srgb': return 'sRGB gamut';
    case 'p3': return 'P3 gamut';
    case 'rec2020': return 'Rec.2020 gamut';
    default: return 'Unknown gamut';
  }
}

/**
 * Human-readable label for detected color space
 */
export function colorSpaceLabel(colorSpace: string): string {
  switch (colorSpace) {
    case 'srgb': return 'sRGB';
    case 'display-p3': return 'Display P3';
    default: return colorSpace || 'Unknown';
  }
}

/**
 * Get the active output color space label based on display capabilities.
 */
export function getActiveOutputColorSpace(caps: DisplayCapabilities): string {
  return caps.webglP3 ? 'display-p3' : 'srgb';
}
