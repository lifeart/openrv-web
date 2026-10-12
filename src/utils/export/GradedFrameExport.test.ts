import { describe, it, expect } from 'vitest';
import { floatFrameToRGBA8, decodeSRGBToLinearInPlace, floatFrameToEXR } from './GradedFrameExport';
import { decodeEXR } from '../../formats/EXRDecoder';
import { CHROMATICITIES_REC2020 } from '../../export/EXRWriter';

describe('GradedFrameExport', () => {
  it('GFE-001: quantizes display-encoded floats to 8-bit with rounding and clamping', () => {
    const data = new Float32Array([0, 0.5, 1, 1, 1.2, -0.1, 127.4 / 255, 0.25]);
    const out = floatFrameToRGBA8({ data, width: 2, height: 1 });
    expect(Array.from(out)).toEqual([0, 128, 255, 255, 255, 0, 127, 64]);
  });

  it('GFE-002: sRGB decode applies the EOTF to RGB only', () => {
    const data = new Float32Array([0, 0.04045, 0.5, 0.5, 1, 1, 1, 1]);
    decodeSRGBToLinearInPlace(data);
    expect(data[0]).toBe(0);
    expect(data[1]).toBeCloseTo(0.04045 / 12.92, 6);
    expect(data[2]).toBeCloseTo(0.214, 3);
    expect(data[3]).toBe(0.5); // alpha untouched
    expect(data[4]).toBeCloseTo(1, 6);
  });

  it('GFE-003: EXR file carries the frame color space as chromaticities', async () => {
    const data = new Float32Array([4, 2, 0.5, 1]);
    const decoded = await decodeEXR(floatFrameToEXR({ data, width: 1, height: 1, colorSpace: 'rec2020' }));
    expect(Array.from(decoded.header.chromaticities!)).toEqual(CHROMATICITIES_REC2020.map((v) => Math.fround(v)));
    expect(decoded.data[0]).toBeCloseTo(4, 3);
    expect(decoded.data[3]).toBe(1);
  });
});
