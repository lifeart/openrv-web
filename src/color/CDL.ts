/**
 * ASC CDL (Color Decision List) Types and Utilities
 *
 * CDL is an industry standard for color correction interchange.
 * The formula is: out = clamp((in * slope + offset) ^ power)
 * Then saturation is applied.
 */

export interface CDLValues {
  // Slope (multiplier) - default 1.0 for each channel
  slope: { r: number; g: number; b: number };
  // Offset (addition) - default 0.0 for each channel
  offset: { r: number; g: number; b: number };
  // Power (gamma) - default 1.0 for each channel
  power: { r: number; g: number; b: number };
  // Saturation - default 1.0 (applied after SOP)
  saturation: number;
}

export const DEFAULT_CDL: CDLValues = {
  slope: { r: 1.0, g: 1.0, b: 1.0 },
  offset: { r: 0.0, g: 0.0, b: 0.0 },
  power: { r: 1.0, g: 1.0, b: 1.0 },
  saturation: 1.0,
};

/**
 * Check if CDL values are at defaults (no correction applied)
 */
export function isDefaultCDL(cdl: CDLValues): boolean {
  return (
    cdl.slope.r === 1.0 && cdl.slope.g === 1.0 && cdl.slope.b === 1.0 &&
    cdl.offset.r === 0.0 && cdl.offset.g === 0.0 && cdl.offset.b === 0.0 &&
    cdl.power.r === 1.0 && cdl.power.g === 1.0 && cdl.power.b === 1.0 &&
    cdl.saturation === 1.0
  );
}

/**
 * Apply CDL to a single color value (0-255 range)
 */
export function applyCDLToValue(
  value: number,
  slope: number,
  offset: number,
  power: number
): number {
  // Normalize to 0-1
  let v = value / 255;

  // Apply slope and offset
  v = v * slope + offset;

  // Clamp before power to avoid NaN from negative values
  v = Math.max(0, Math.min(1, v));

  // Apply power (gamma)
  if (power !== 1.0 && v > 0) {
    v = Math.pow(v, power);
  }

  // Clamp final result
  v = Math.max(0, Math.min(1, v));

  // Return to 0-255 range
  return v * 255;
}

/**
 * Apply saturation adjustment
 * Uses Rec. 709 luminance weights
 */
export function applySaturation(
  r: number,
  g: number,
  b: number,
  saturation: number
): { r: number; g: number; b: number } {
  if (saturation === 1.0) {
    return { r, g, b };
  }

  // Calculate luminance using Rec. 709 weights
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Interpolate between grayscale and color
  return {
    r: Math.max(0, Math.min(255, luma + (r - luma) * saturation)),
    g: Math.max(0, Math.min(255, luma + (g - luma) * saturation)),
    b: Math.max(0, Math.min(255, luma + (b - luma) * saturation)),
  };
}

/**
 * Apply full CDL transform to RGB values (0-255 range)
 */
export function applyCDL(
  r: number,
  g: number,
  b: number,
  cdl: CDLValues
): { r: number; g: number; b: number } {
  // Apply SOP (Slope, Offset, Power) per channel
  let outR = applyCDLToValue(r, cdl.slope.r, cdl.offset.r, cdl.power.r);
  let outG = applyCDLToValue(g, cdl.slope.g, cdl.offset.g, cdl.power.g);
  let outB = applyCDLToValue(b, cdl.slope.b, cdl.offset.b, cdl.power.b);

  // Apply saturation
  if (cdl.saturation !== 1.0) {
    const sat = applySaturation(outR, outG, outB, cdl.saturation);
    outR = sat.r;
    outG = sat.g;
    outB = sat.b;
  }

  return { r: outR, g: outG, b: outB };
}

/**
 * Apply CDL to ImageData (in-place modification)
 */
export function applyCDLToImageData(imageData: ImageData, cdl: CDLValues): void {
  if (isDefaultCDL(cdl)) return;

  const data = imageData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const result = applyCDL(data[i]!, data[i + 1]!, data[i + 2]!, cdl);
    data[i] = Math.round(result.r);
    data[i + 1] = Math.round(result.g);
    data[i + 2] = Math.round(result.b);
    // Alpha unchanged
  }
}

/**
 * Parse CDL from .cdl XML format (simplified)
 */
export function parseCDLXML(xml: string): CDLValues | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // Look for SOPNode and SatNode
    const sopNode = doc.querySelector('SOPNode');
    const satNode = doc.querySelector('SatNode');

    const cdl: CDLValues = { ...DEFAULT_CDL };

    if (sopNode) {
      const slope = sopNode.querySelector('Slope')?.textContent;
      const offset = sopNode.querySelector('Offset')?.textContent;
      const power = sopNode.querySelector('Power')?.textContent;

      if (slope) {
        const [r, g, b] = slope.trim().split(/\s+/).map(Number);
        if (r !== undefined && g !== undefined && b !== undefined) {
          cdl.slope = { r, g, b };
        }
      }

      if (offset) {
        const [r, g, b] = offset.trim().split(/\s+/).map(Number);
        if (r !== undefined && g !== undefined && b !== undefined) {
          cdl.offset = { r, g, b };
        }
      }

      if (power) {
        const [r, g, b] = power.trim().split(/\s+/).map(Number);
        if (r !== undefined && g !== undefined && b !== undefined) {
          cdl.power = { r, g, b };
        }
      }
    }

    if (satNode) {
      const sat = satNode.querySelector('Saturation')?.textContent;
      if (sat) {
        cdl.saturation = parseFloat(sat);
      }
    }

    return cdl;
  } catch (e) {
    console.warn('Failed to parse CDL XML:', e);
    return null;
  }
}

/**
 * Export CDL to .cdl XML format
 */
export function exportCDLXML(cdl: CDLValues, id = 'grade_001'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ColorDecisionList xmlns="urn:ASC:CDL:v1.2">
  <ColorDecision>
    <ColorCorrection id="${id}">
      <SOPNode>
        <Slope>${cdl.slope.r.toFixed(6)} ${cdl.slope.g.toFixed(6)} ${cdl.slope.b.toFixed(6)}</Slope>
        <Offset>${cdl.offset.r.toFixed(6)} ${cdl.offset.g.toFixed(6)} ${cdl.offset.b.toFixed(6)}</Offset>
        <Power>${cdl.power.r.toFixed(6)} ${cdl.power.g.toFixed(6)} ${cdl.power.b.toFixed(6)}</Power>
      </SOPNode>
      <SatNode>
        <Saturation>${cdl.saturation.toFixed(6)}</Saturation>
      </SatNode>
    </ColorCorrection>
  </ColorDecision>
</ColorDecisionList>`;
}
