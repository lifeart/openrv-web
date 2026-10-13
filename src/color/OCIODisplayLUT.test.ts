import { describe, it, expect } from 'vitest';
import {
  OCIO_HDR_SHAPER,
  bakeOCIOLinearDisplayLUT,
  chainLinearToRendererLinear,
  decodeDisplaySignal,
  describeOCIODisplay,
  displayPrimariesToBT709,
  sdrDisplayTransferFor,
  shaperForward,
  shaperInverse,
  shaperScale,
  type OCIOLinearDisplayLUT,
  type SplittableOCIOTransform,
} from './OCIODisplayLUT';
import { OCIOProcessor } from './OCIOProcessor';
import { OCIOTransform, multiplyMatrixVector, srgbEncode, rec709Encode, type RGB } from './OCIOTransform';
import { pqEncode, hlgEncode, gamma22Encode, logC3Encode } from './TransferFunctions';
import { applyOCIOLUT3D, linearToHLG, linearToPQ } from '../render/__tests__/shaderMathReference';

/** Sample a bake the way the shader does (shaper + trilinear, RGBA texels). */
function sample(bake: OCIOLinearDisplayLUT, rgb: RGB): RGB {
  const { size, data } = bake.lut;
  const rgba = new Float32Array(size * size * size * 4);
  for (let i = 0; i < size * size * size; i++) {
    rgba[i * 4] = data[i * 3]!;
    rgba[i * 4 + 1] = data[i * 3 + 1]!;
    rgba[i * 4 + 2] = data[i * 3 + 2]!;
    rgba[i * 4 + 3] = 1;
  }
  return applyOCIOLUT3D(rgb[0], rgb[1], rgb[2], rgba, size, [bake.shaper.epsilon, shaperScale(bake.shaper)]);
}

/** Synthetic chain: scene-linear (1.0 = 203 cd/m²) → a PQ or HLG display signal. */
function syntheticHDRView(transfer: 'pq' | 'hlg'): SplittableOCIOTransform & { signal(rgb: RGB): RGB } {
  // PQ: put scene 1.0 at 203 cd/m² of the 10 000 cd/m² PQ range.
  // HLG: scene light relative to the 1000 cd/m² nominal peak (OOTF in the display).
  const scale = transfer === 'pq' ? 203 / 10000 : 0.2;
  const core = { apply: (r: number, g: number, b: number): RGB => [r * scale, g * scale, b * scale] };
  const encode = transfer === 'pq' ? pqEncode : hlgEncode;
  return {
    splitLinearCore: () => ({ inputDecode: null, outputEncode: transfer, core }),
    signal: (rgb) => {
      const lin = core.apply(rgb[0], rgb[1], rgb[2]);
      return [encode(lin[0]), encode(lin[1]), encode(lin[2])];
    },
  };
}

describe('OCIODisplayLUT', () => {
  describe('shaper', () => {
    it('maps [0, maxValue] onto [0, 1] and inverts exactly', () => {
      expect(shaperForward(0, OCIO_HDR_SHAPER)).toBe(0);
      expect(shaperForward(OCIO_HDR_SHAPER.maxValue, OCIO_HDR_SHAPER)).toBeCloseTo(1, 12);
      for (const x of [0.001, 0.18, 1, 4, 49.26, 100]) {
        expect(shaperInverse(shaperForward(x, OCIO_HDR_SHAPER), OCIO_HDR_SHAPER)).toBeCloseTo(x, 9);
      }
    });

    it('clamps negative input to 0 and input above the maximum to 1', () => {
      expect(shaperForward(-1, OCIO_HDR_SHAPER)).toBe(0);
      expect(shaperForward(1e6, OCIO_HDR_SHAPER)).toBe(1);
    });
  });

  describe('OCIOTransform.splitLinearCore', () => {
    it('removes the input decode and the display encode', () => {
      const t = OCIOTransform.createDisplayTransform('sRGB', 'ACEScg', 'Rec.709', 'ACES 1.0 SDR-video');
      const { inputDecode, outputEncode, core } = t.splitLinearCore();
      expect(inputDecode).toBe('srgb');
      expect(outputEncode).toBe('rec709');
      // core(linear) re-encoded equals the full chain on the encoded input
      for (const x of [0.05, 0.18, 0.6]) {
        const full = t.apply(srgbEncode(x), srgbEncode(x), srgbEncode(x));
        const viaCore = core.apply(x, x, x).map(rec709Encode);
        expect(viaCore[0]).toBeCloseTo(full[0], 6);
        expect(viaCore[2]).toBeCloseTo(full[2], 6);
      }
    });

    it('an identity chain (input space = display) splits into an identity core', () => {
      const { inputDecode, outputEncode, core } = new OCIOTransform('sRGB', 'sRGB').splitLinearCore();
      expect(inputDecode).toBeNull();
      expect(outputEncode).toBeNull();
      expect(core.apply(0.3, 2, 0.1)).toEqual([0.3, 2, 0.1]);
    });

    it('leaves a scene-linear input chain without an input decode', () => {
      const t = OCIOTransform.createDisplayTransform('Linear sRGB', 'ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(t.splitLinearCore().inputDecode).toBeNull();
    });
  });

  describe('bake (default ACES config, Linear sRGB → sRGB display)', () => {
    const processor = new OCIOProcessor();
    processor.setState({ enabled: true, inputColorSpace: 'Linear sRGB', display: 'sRGB' });
    const bake = processor.bakeLinearDisplayLUT(65);

    it('reproduces the OCIO view signal after the sRGB display transfer', () => {
      expect(bake.displayTransfer).toBe('srgb');
      expect(bake.signal).toBe('sdr');
      for (const rgb of [
        [0.18, 0.18, 0.18],
        [0.5, 0.25, 0.1],
        [1, 1, 1],
      ] as RGB[]) {
        const expected = processor.transformColor(rgb[0], rgb[1], rgb[2]);
        const got = sample(bake, rgb).map(srgbEncode);
        for (let c = 0; c < 3; c++) expect(got[c]).toBeCloseTo(expected[c]!, 2);
      }
    });

    it('keeps HDR input above 1.0 distinct instead of clamping it', () => {
      const at1 = sample(bake, [1, 1, 1]);
      const at4 = sample(bake, [4, 4, 4]);
      const at16 = sample(bake, [16, 16, 16]);
      expect(at4[0]).toBeGreaterThan(at1[0] + 0.01);
      expect(at16[0]).toBeGreaterThan(at4[0]);
      const expected4 = processor.transformColor(4, 4, 4);
      expect(srgbEncode(at4[0])).toBeCloseTo(expected4[0], 2);
    });

    it('is cached until the OCIO state changes', () => {
      expect(processor.bakeLinearDisplayLUT(65)).toBe(bake);
      processor.setState({ display: 'Rec.709' });
      const next = processor.bakeLinearDisplayLUT(65);
      expect(next).not.toBe(bake);
      expect(next.displayTransfer).toBe('rec709');
    });
  });

  describe('input decode (log-encoded input space)', () => {
    const processor = new OCIOProcessor();
    processor.setState({
      enabled: true,
      inputColorSpace: 'ARRI LogC3 (EI 800)',
      workingColorSpace: 'ACEScg',
      display: 'sRGB',
    });

    it('keeps the decode for float sources whose values are the file code values', () => {
      const bake = processor.bakeLinearDisplayLUT(65);
      expect(bake.stripInputDecode).toBe(false);
      expect(bake.inputDecode).toBeNull();
      for (const code of [0.2, 0.39, 0.6]) {
        const expected = processor.transformColor(code, code, code);
        const got = sample(bake, [code, code, code]).map(srgbEncode);
        // The log2 shaper is laid out for scene-linear input, so log code
        // values in [0, 1] get fewer cells: allow ~2.5 8-bit codes.
        expect(Math.abs(got[1]! - expected[1]!)).toBeLessThan(0.01);
      }
    });

    it('drops the decode when the shader has already linearised the source', () => {
      const bake = processor.bakeLinearDisplayLUT(65, { stripInputDecode: true });
      expect(bake.stripInputDecode).toBe(true);
      expect(bake.inputDecode).toBe('logC3');
      for (const lin of [0.05, 0.18, 2]) {
        const code = logC3Encode(lin);
        const expected = processor.transformColor(code, code, code);
        const got = sample(bake, [lin, lin, lin]).map(srgbEncode);
        expect(got[1]).toBeCloseTo(expected[1], 2);
      }
      // Both variants are cached side by side
      expect(processor.bakeLinearDisplayLUT(65)).not.toBe(bake);
      expect(processor.bakeLinearDisplayLUT(65, { stripInputDecode: true })).toBe(bake);
    });
  });

  it('converts a wide-gamut display to BT.709 so the renderer can retarget it', () => {
    const processor = new OCIOProcessor();
    processor.setState({ enabled: true, inputColorSpace: 'ACEScg', workingColorSpace: 'ACEScg', display: 'Rec.2020' });
    const bake = processor.bakeLinearDisplayLUT(65);
    expect(bake.displayTransfer).toBe('gamma22');
    const rgb: RGB = [0.3, 0.2, 0.1];
    // Expected: decode the Rec.2020 signal, then 2020 → 709
    const signal = processor.transformColor(rgb[0], rgb[1], rgb[2]);
    const lin2020 = decodeDisplaySignal(signal, 'gamma22');
    const expected = multiplyMatrixVector(displayPrimariesToBT709('bt2020'), lin2020);
    const got = sample(bake, rgb);
    for (let c = 0; c < 3; c++) expect(got[c]).toBeCloseTo(expected[c]!, 2);
    // The SDR surface then encodes with the display's own transfer (gamma 2.2)
    expect(sdrDisplayTransferFor('gamma22')).toEqual({ transferFunction: 'gamma2.2' });
    expect(gamma22Encode(lin2020[0])).toBeCloseTo(signal[0], 6);
  });

  describe('PQ / HLG views (synthetic: the built-in configs ship none)', () => {
    it('PQ view: display-linear output re-encodes to the exact view signal on a PQ surface', () => {
      const view = syntheticHDRView('pq');
      const bake = bakeOCIOLinearDisplayLUT(view, 'Rec.2100-PQ', 65);
      expect(bake.signal).toBe('pq');
      for (const x of [0.18, 1, 4, 20]) {
        // Grey stays grey through 2020 → 709 → 2020, so the surface's PQ
        // encode (shader linearToPQ) is the only encode applied.
        const lin = sample(bake, [x, x, x]);
        expect(linearToPQ(lin[1])).toBeCloseTo(view.signal([x, x, x])[1], 3);
      }
    });

    it('HLG view: the surface HLG encode inverts the bake decode (signal passes through)', () => {
      const view = syntheticHDRView('hlg');
      const bake = bakeOCIOLinearDisplayLUT(view, 'Rec.2100-HLG', 65);
      expect(bake.signal).toBe('hlg');
      for (const x of [0.5, 1, 3]) {
        const lin = sample(bake, [x, x, x]);
        const [e] = linearToHLG(lin[0], lin[1], lin[2]);
        expect(e).toBeCloseTo(view.signal([x, x, x])[0], 3);
      }
    });

    it('chainLinearToRendererLinear places PQ 203 cd/m² at reference white', () => {
      expect(chainLinearToRendererLinear([203 / 10000, 0, 0], 'pq')[0]).toBeCloseTo(1, 9);
    });
  });

  describe('describeOCIODisplay', () => {
    it('recognises the built-in SDR displays', () => {
      expect(describeOCIODisplay('sRGB')).toEqual({ primaries: 'bt709', transfer: 'srgb' });
      expect(describeOCIODisplay('Rec.709')).toEqual({ primaries: 'bt709', transfer: 'rec709' });
      expect(describeOCIODisplay('DCI-P3')).toEqual({ primaries: 'p3', transfer: 'gamma26' });
      expect(describeOCIODisplay('Rec.2020')).toEqual({ primaries: 'bt2020', transfer: 'gamma22' });
    });

    it('recognises PQ and HLG displays by name', () => {
      expect(describeOCIODisplay('Rec.2100-PQ')).toEqual({ primaries: 'bt2020', transfer: 'pq' });
      expect(describeOCIODisplay('ST2084-P3-D65')).toEqual({ primaries: 'p3', transfer: 'pq' });
      expect(describeOCIODisplay('Rec.2100-HLG')).toEqual({ primaries: 'bt2020', transfer: 'hlg' });
    });
  });

  it('sdrDisplayTransferFor maps OCIO transfers to the renderer display transfer', () => {
    expect(sdrDisplayTransferFor('srgb')).toEqual({ transferFunction: 'srgb' });
    expect(sdrDisplayTransferFor('rec709')).toEqual({ transferFunction: 'rec709' });
    expect(sdrDisplayTransferFor('gamma26')).toEqual({ transferFunction: 'custom', customGamma: 2.6 });
    expect(sdrDisplayTransferFor('pq')).toEqual({ transferFunction: 'srgb' });
  });

  it('rejects invalid sizes', () => {
    const t = new OCIOTransform('sRGB', 'sRGB');
    expect(() => bakeOCIOLinearDisplayLUT(t, 'sRGB', 1)).toThrow();
    expect(() => bakeOCIOLinearDisplayLUT(t, 'sRGB', 130)).toThrow();
  });
});
