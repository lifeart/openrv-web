/**
 * BrowserColorSpace - Browser display color space detection utilities
 *
 * Detects the browser's display capabilities including:
 * - Color space (sRGB, display-p3)
 * - Color gamut (sRGB, P3, Rec.2020)
 * - HDR support
 * - Estimated bit depth
 */

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
 * Detect the browser's display color space capabilities
 */
export function detectBrowserColorSpace(): BrowserColorSpaceInfo {
  const info: BrowserColorSpaceInfo = {
    colorSpace: 'unknown',
    gamut: 'unknown',
    hdr: false,
    bitDepth: 8,
  };

  // 1. Check screen.colorSpace (Chrome 100+, Edge 100+)
  if (typeof screen !== 'undefined' && 'colorSpace' in screen) {
    info.colorSpace = (screen as { colorSpace: string }).colorSpace || 'srgb';
  }

  // 2. Check color gamut via matchMedia
  if (typeof matchMedia !== 'undefined') {
    if (matchMedia('(color-gamut: rec2020)').matches) {
      info.gamut = 'rec2020';
    } else if (matchMedia('(color-gamut: p3)').matches) {
      info.gamut = 'p3';
    } else if (matchMedia('(color-gamut: srgb)').matches) {
      info.gamut = 'srgb';
    }

    // 3. Check HDR support
    if (matchMedia('(dynamic-range: high)').matches) {
      info.hdr = true;
    }

    // 4. Estimate bit depth from gamut
    if (info.gamut === 'rec2020') {
      info.bitDepth = 12;
    } else if (info.gamut === 'p3') {
      info.bitDepth = 10;
    }
  }

  return info;
}

/**
 * Check if canvas supports display-p3 color space
 */
export function canvasSupportsDisplayP3(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 1;
    testCanvas.height = 1;
    const ctx = testCanvas.getContext('2d', { colorSpace: 'display-p3' } as CanvasRenderingContext2DSettings);
    return ctx !== null;
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
