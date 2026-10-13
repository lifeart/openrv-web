/**
 * ISO 21496-1 / Adobe gain map application: weighting, baseRenditionIsHDR,
 * per-channel maps, gamma, offsets, and the ISO binary metadata parser.
 *
 * Expected values are worked out by hand in the comments next to each check
 * (log2 gain G = min*(1-r) + max*r with r = v^(1/gamma)).
 */

import { describe, it, expect } from 'vitest';
import {
  applyGainMap,
  computeGainMapWeight,
  parseGainMapMetadataFromXMP,
  parseISO21496Metadata,
  parseTmapItemPayload,
  reconstructHDR,
  tmapToGainMapMetadata,
  type GainMapMetadata,
  type TmapMetadata,
} from './GainMapMetadata';
import { parseTmapBox } from './AVIFGainmapDecoder';

function meta(overrides: Partial<GainMapMetadata> = {}): GainMapMetadata {
  return {
    channelCount: 1,
    gainMapMin: [0],
    gainMapMax: [2],
    gamma: [1],
    offsetSDR: [0],
    offsetHDR: [0],
    hdrCapacityMin: 0,
    hdrCapacityMax: 2,
    baseRenditionIsHDR: false,
    ...overrides,
  };
}

/** Linear RGBA base pixels from RGB triples. */
function base(...pixels: Array<[number, number, number]>): Float32Array {
  const out = new Float32Array(pixels.length * 4);
  pixels.forEach((p, i) => out.set([p[0], p[1], p[2], 1], i * 4));
  return out;
}

/** uint8 RGBA gain map pixels from RGB triples. */
function gain(...pixels: Array<[number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => out.set([p[0], p[1], p[2], 255], i * 4));
  return out;
}

function rgb(data: Float32Array, pixel: number): number[] {
  return [data[pixel * 4]!, data[pixel * 4 + 1]!, data[pixel * 4 + 2]!];
}

describe('computeGainMapWeight', () => {
  const m = meta({ hdrCapacityMin: 1, hdrCapacityMax: 3 });

  it('GMISO-001: no display headroom given means the full HDR rendition (W = 1)', () => {
    expect(computeGainMapWeight(m)).toBe(1);
  });

  it('GMISO-002: W = clamp((log2 H - capMin) / (capMax - capMin), 0, 1)', () => {
    expect(computeGainMapWeight(m, 1)).toBe(0); // log2 1 = 0 < capMin
    expect(computeGainMapWeight(m, 2)).toBe(0); // (1 - 1) / 2
    expect(computeGainMapWeight(m, 4)).toBeCloseTo(0.5, 10); // (2 - 1) / 2
    expect(computeGainMapWeight(m, 8)).toBe(1); // (3 - 1) / 2
    expect(computeGainMapWeight(m, 64)).toBe(1); // clamped
  });

  it('GMISO-003: degenerate capacity range steps at capMax', () => {
    const flat = meta({ hdrCapacityMin: 2, hdrCapacityMax: 2 });
    expect(computeGainMapWeight(flat, 2)).toBe(0);
    expect(computeGainMapWeight(flat, 4)).toBe(1);
  });
});

describe('applyGainMap (SDR base)', () => {
  it('GMISO-010: W = 1 applies the full map, W = 0 returns the base', () => {
    // G(255) = 2 -> x4; G(0) = 0 -> x1
    const full = applyGainMap(base([0.25, 0.25, 0.25], [0.25, 0.5, 1]), gain([255, 255, 255], [0, 0, 0]), 2, meta());
    expect(rgb(full, 0)).toEqual([1, 1, 1]);
    expect(rgb(full, 1)).toEqual([0.25, 0.5, 1]);

    const sdr = applyGainMap(base([0.25, 0.25, 0.25]), gain([255, 255, 255]), 1, meta(), 0);
    expect(rgb(sdr, 0)).toEqual([0.25, 0.25, 0.25]);
  });

  it('GMISO-011: partial weight scales the log gain', () => {
    // display headroom 2 -> log2 = 1 -> W = (1 - 0) / (2 - 0) = 0.5; 0.25 * 2^(2 * 0.5) = 0.5
    const m = meta();
    const w = computeGainMapWeight(m, 2);
    expect(w).toBe(0.5);
    const out = applyGainMap(base([0.25, 0.25, 0.25]), gain([255, 255, 255]), 1, m, w);
    expect(rgb(out, 0)[0]).toBeCloseTo(0.5, 6);
  });

  it('GMISO-012: gamma != 1 and a negative gainMapMin', () => {
    // v = 64/255, gamma 2: r = sqrt(64/255) = 0.500979; G = -1*(1-r) + 3*r = 1.003918
    // 0.25 * 2^1.003918 = 0.501360
    const out = applyGainMap(
      base([0.25, 0.25, 0.25]),
      gain([64, 64, 64]),
      1,
      meta({ gainMapMin: [-1], gainMapMax: [3], gamma: [2] }),
    );
    expect(rgb(out, 0)[0]).toBeCloseTo(0.50136, 5);
    // v = 0: r = 0, G = gainMapMin = -1 -> 0.125
    const low = applyGainMap(
      base([0.25, 0.25, 0.25]),
      gain([0, 0, 0]),
      1,
      meta({ gainMapMin: [-1], gainMapMax: [3], gamma: [2] }),
    );
    expect(rgb(low, 0)[0]).toBeCloseTo(0.125, 6);
  });

  it('GMISO-013: offsets: (base + offsetSDR) * 2^G - offsetHDR', () => {
    // (0.5 + 1/64) * 2^1 - 1/32 = 1.03125 - 0.03125 = 1.0
    const m = meta({ gainMapMax: [1], offsetSDR: [1 / 64], offsetHDR: [1 / 32], hdrCapacityMax: 1 });
    const out = applyGainMap(base([0.5, 0.5, 0.5]), gain([255, 255, 255]), 1, m);
    expect(rgb(out, 0)[0]).toBeCloseTo(1.0, 6);
    // W = 0: (0.5 + 1/64) * 1 - 1/32 = 0.484375
    const sdr = applyGainMap(base([0.5, 0.5, 0.5]), gain([255, 255, 255]), 1, m, 0);
    expect(rgb(sdr, 0)[0]).toBeCloseTo(0.484375, 6);
  });

  it('GMISO-014: a 3-channel map drives each colour channel from its own sample and parameters', () => {
    // R: v=255, max 1 -> x2; G: v=128, max 2 -> 2^(2*128/255) = 2.005444; B: v=0 -> x1
    const m = meta({
      channelCount: 3,
      gainMapMin: [0, 0, 0],
      gainMapMax: [1, 2, 3],
      gamma: [1, 1, 1],
      offsetSDR: [0, 0, 0],
      offsetHDR: [0, 0, 0],
      hdrCapacityMax: 3,
    });
    const out = applyGainMap(base([0.5, 0.5, 0.5]), gain([255, 128, 0]), 1, m);
    const [r, g, b] = rgb(out, 0);
    expect(r).toBeCloseTo(1.0, 6);
    expect(g).toBeCloseTo(0.5 * 2.005444, 5);
    expect(b).toBeCloseTo(0.5, 6);
  });

  it('GMISO-015: a 1-channel map reads only the first sample for all colour channels', () => {
    const out = applyGainMap(base([0.25, 0.5, 0.125]), gain([255, 0, 0]), 1, meta());
    expect(rgb(out, 0)).toEqual([1, 2, 0.5]);
  });

  it('GMISO-016: per-channel offsets apply per colour channel', () => {
    // R: (0.5 + 0) * 2 - 0 = 1; G: (0.5 + 0.5) * 2 - 0.5 = 1.5; B: (0.5 + 0.25) * 2 - 1 = 0.5
    const m = meta({
      channelCount: 3,
      gainMapMin: [0, 0, 0],
      gainMapMax: [1, 1, 1],
      gamma: [1, 1, 1],
      offsetSDR: [0, 0.5, 0.25],
      offsetHDR: [0, 0.5, 1],
      hdrCapacityMax: 1,
    });
    const out = applyGainMap(base([0.5, 0.5, 0.5]), gain([255, 255, 255]), 1, m);
    expect(rgb(out, 0)).toEqual([1, 1.5, 0.5]);
  });

  it('GMISO-017: alpha is left untouched', () => {
    const b = base([0.5, 0.5, 0.5]);
    b[3] = 0.25;
    applyGainMap(b, gain([255, 255, 255]), 1, meta());
    expect(b[3]).toBe(0.25);
  });
});

describe('applyGainMap (baseRenditionIsHDR)', () => {
  // Map goes HDR -> SDR: out = (base + offsetHDR) * 2^(G * (W - 1)) - offsetSDR
  const hdrBase = meta({ baseRenditionIsHDR: true, offsetSDR: [1 / 64], offsetHDR: [1 / 32] });

  it('GMISO-020: W = 1 keeps the HDR base (offsets only)', () => {
    // (1 + 1/32) * 2^0 - 1/64 = 1.015625
    const out = applyGainMap(base([1, 1, 1]), gain([255, 255, 255]), 1, hdrBase, 1);
    expect(rgb(out, 0)[0]).toBeCloseTo(1.015625, 6);
  });

  it('GMISO-021: W = 0 tone-maps fully down to SDR', () => {
    // G(255) = 2: (1 + 1/32) * 2^-2 - 1/64 = 0.2578125 - 0.015625 = 0.2421875
    const out = applyGainMap(base([1, 1, 1]), gain([255, 255, 255]), 1, hdrBase, 0);
    expect(rgb(out, 0)[0]).toBeCloseTo(0.2421875, 6);
  });

  it('GMISO-022: partial W', () => {
    // W = 0.5: (1 + 1/32) * 2^(2 * -0.5) - 1/64 = 0.515625 - 0.015625 = 0.5
    const out = applyGainMap(base([1, 1, 1]), gain([255, 255, 255]), 1, hdrBase, 0.5);
    expect(rgb(out, 0)[0]).toBeCloseTo(0.5, 6);
  });

  it('GMISO-023: the direction is inverted relative to an SDR base', () => {
    const sdr = applyGainMap(base([0.25, 0.25, 0.25]), gain([255, 255, 255]), 1, meta(), 1);
    const hdr = applyGainMap(base([1, 1, 1]), gain([255, 255, 255]), 1, meta({ baseRenditionIsHDR: true }), 0);
    // SDR 0.25 boosted to 1.0; HDR 1.0 reduced to 0.25
    expect(rgb(sdr, 0)[0]).toBeCloseTo(1, 6);
    expect(rgb(hdr, 0)[0]).toBeCloseTo(0.25, 6);
  });

  it('GMISO-024: reconstructHDR honours baseRenditionIsHDR (W = 1 -> base)', () => {
    const baseData = new Uint8ClampedArray([255, 255, 255, 255]);
    const gainData = new Uint8ClampedArray([255, 255, 255, 255]);
    const out = reconstructHDR(baseData, gainData, 1, meta({ baseRenditionIsHDR: true }));
    expect(out[0]).toBeCloseTo(1, 6); // previously boosted to 4
    const sdrView = reconstructHDR(baseData, gainData, 1, meta({ baseRenditionIsHDR: true }), { weight: 0 });
    expect(sdrView[0]).toBeCloseTo(0.25, 6);
  });

  it('GMISO-025: XMP BaseRenditionIsHDR (element form) is parsed', () => {
    const xmp =
      '<x:xmpmeta xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"><rdf:Description>' +
      '<hdrgm:GainMapMax>2</hdrgm:GainMapMax><hdrgm:BaseRenditionIsHDR>True</hdrgm:BaseRenditionIsHDR>' +
      '</rdf:Description></x:xmpmeta>';
    expect(parseGainMapMetadataFromXMP(xmp)!.baseRenditionIsHDR).toBe(true);
  });
});

describe('tmapToGainMapMetadata direction', () => {
  it('GMISO-030: an HDR-base ISO tmap converts to baseRenditionIsHDR with negated map range', () => {
    const tmap: TmapMetadata = {
      channelCount: 1,
      gainMapMin: [-2],
      gainMapMax: [0],
      gainMapGamma: [1],
      baseOffset: [1 / 32],
      alternateOffset: [1 / 64],
      baseHdrHeadroom: 2,
      alternateHdrHeadroom: 0,
    };
    const m = tmapToGainMapMetadata(tmap);
    expect(m.baseRenditionIsHDR).toBe(true);
    expect(m.gainMapMin).toEqual([2]);
    expect(m.gainMapMax[0]).toBeCloseTo(0, 10);
    expect(m.offsetHDR).toEqual([1 / 32]);
    expect(m.offsetSDR).toEqual([1 / 64]);
    expect(m.hdrCapacityMin).toBe(0);
    expect(m.hdrCapacityMax).toBe(2);
  });

  it('GMISO-031: applying the converted metadata reproduces the ISO formula', () => {
    // ISO: W_iso = clamp((log2 H - baseH) / (altH - baseH)); out = (b + baseOff) * 2^(G_iso * W_iso) - altOff
    // G_iso(v=0) = -2. On an SDR display (H = 1): W_iso = (0 - 2) / (0 - 2) = 1
    //   -> (1 + 1/32) * 2^-2 - 1/64 = 0.2421875
    const tmap: TmapMetadata = {
      channelCount: 1,
      gainMapMin: [-2],
      gainMapMax: [0],
      gainMapGamma: [1],
      baseOffset: [1 / 32],
      alternateOffset: [1 / 64],
      baseHdrHeadroom: 2,
      alternateHdrHeadroom: 0,
    };
    const m = tmapToGainMapMetadata(tmap);
    const sdrDisplay = applyGainMap(base([1, 1, 1]), gain([0, 0, 0]), 1, m, computeGainMapWeight(m, 1));
    expect(rgb(sdrDisplay, 0)[0]).toBeCloseTo(0.2421875, 6);
    // H = 2 (1 stop): W_iso = (1 - 2) / (0 - 2) = 0.5 -> (1 + 1/32) * 2^-1 - 1/64 = 0.5
    const oneStop = applyGainMap(base([1, 1, 1]), gain([0, 0, 0]), 1, m, computeGainMapWeight(m, 2));
    expect(rgb(oneStop, 0)[0]).toBeCloseTo(0.5, 6);
    // Full HDR (W = 1): base + 1/32 - 1/64
    const full = applyGainMap(base([1, 1, 1]), gain([0, 0, 0]), 1, m);
    expect(rgb(full, 0)[0]).toBeCloseTo(1.015625, 6);
  });
});

// =============================================================================
// ISO 21496-1 binary metadata
// =============================================================================

interface ISOChannel {
  min: [number, number];
  max: [number, number];
  gamma: [number, number];
  baseOffset: [number, number];
  altOffset: [number, number];
}

/** Serialise ISO 21496-1 metadata (from minimum_version on), separate denominators. */
function buildISO(opts: {
  minimumVersion?: number;
  flags?: number;
  baseHeadroom: [number, number];
  altHeadroom: [number, number];
  channels: ISOChannel[];
}): Uint8Array {
  const words: Array<['u' | 'i', number]> = [
    ['u', opts.baseHeadroom[0]],
    ['u', opts.baseHeadroom[1]],
    ['u', opts.altHeadroom[0]],
    ['u', opts.altHeadroom[1]],
  ];
  for (const c of opts.channels) {
    words.push(['i', c.min[0]], ['u', c.min[1]], ['i', c.max[0]], ['u', c.max[1]]);
    words.push(['u', c.gamma[0]], ['u', c.gamma[1]]);
    words.push(['i', c.baseOffset[0]], ['u', c.baseOffset[1]], ['i', c.altOffset[0]], ['u', c.altOffset[1]]);
  }
  const out = new Uint8Array(5 + words.length * 4);
  const view = new DataView(out.buffer);
  view.setUint16(0, opts.minimumVersion ?? 0);
  view.setUint16(2, 0);
  view.setUint8(4, (opts.flags ?? 0) | (opts.channels.length === 3 ? 0x80 : 0));
  words.forEach(([kind, v], i) => (kind === 'i' ? view.setInt32(5 + i * 4, v) : view.setUint32(5 + i * 4, v)));
  return out;
}

const CH: ISOChannel = {
  min: [-1, 2],
  max: [3, 1],
  gamma: [1, 1],
  baseOffset: [1, 64],
  altOffset: [1, 64],
};

describe('parseISO21496Metadata', () => {
  it('GMISO-040: parses single-channel metadata with signed numerators', () => {
    const bytes = buildISO({ baseHeadroom: [0, 1], altHeadroom: [3, 1], channels: [CH] });
    const t = parseISO21496Metadata(new DataView(bytes.buffer), 0, bytes.byteLength)!;
    expect(t.channelCount).toBe(1);
    expect(t.gainMapMin).toEqual([-0.5]);
    expect(t.gainMapMax).toEqual([3]);
    expect(t.gainMapGamma).toEqual([1]);
    expect(t.baseOffset).toEqual([1 / 64]);
    expect(t.alternateOffset).toEqual([1 / 64]);
    expect(t.baseHdrHeadroom).toBe(0);
    expect(t.alternateHdrHeadroom).toBe(3);
    expect(t.useBaseColorSpace).toBe(false);
  });

  it('GMISO-041: parses multichannel metadata and use_base_colour_space', () => {
    const chans: ISOChannel[] = [CH, { ...CH, max: [4, 1] }, { ...CH, max: [5, 1], gamma: [22, 10] }];
    const bytes = buildISO({ flags: 0x40, baseHeadroom: [0, 1], altHeadroom: [5, 1], channels: chans });
    const t = parseISO21496Metadata(new DataView(bytes.buffer), 0, bytes.byteLength)!;
    expect(t.channelCount).toBe(3);
    expect(t.gainMapMax).toEqual([3, 4, 5]);
    expect(t.gainMapGamma[2]).toBeCloseTo(2.2, 10);
    expect(t.useBaseColorSpace).toBe(true);
  });

  it('GMISO-042: parses the common-denominator form', () => {
    // d = 4: base 0/4, alt 12/4 = 3, min -2/4, max 12/4, gamma 4/4, offsets 1/4
    const words = [4, 0, 12, -2, 12, 4, 1, 1];
    const out = new Uint8Array(5 + words.length * 4);
    const view = new DataView(out.buffer);
    view.setUint8(4, 0x08);
    words.forEach((v, i) => view.setInt32(5 + i * 4, v));
    const t = parseISO21496Metadata(view, 0, out.byteLength)!;
    expect(t.alternateHdrHeadroom).toBe(3);
    expect(t.gainMapMin).toEqual([-0.5]);
    expect(t.gainMapMax).toEqual([3]);
    expect(t.gainMapGamma).toEqual([1]);
    expect(t.baseOffset).toEqual([0.25]);
  });

  it('GMISO-043: rejects truncation, newer minimum_version, zero denominators and zero gamma', () => {
    const ok = buildISO({ baseHeadroom: [0, 1], altHeadroom: [3, 1], channels: [CH] });
    const v = (b: Uint8Array) => new DataView(b.buffer);
    expect(parseISO21496Metadata(v(ok), 0, ok.byteLength - 1)).toBeNull();
    expect(parseISO21496Metadata(v(ok), 0, 4)).toBeNull(); // version stub only (JPEG primary)
    const newer = buildISO({ minimumVersion: 1, baseHeadroom: [0, 1], altHeadroom: [3, 1], channels: [CH] });
    expect(parseISO21496Metadata(v(newer), 0, newer.byteLength)).toBeNull();
    const zeroDen = buildISO({ baseHeadroom: [0, 0], altHeadroom: [3, 1], channels: [CH] });
    expect(parseISO21496Metadata(v(zeroDen), 0, zeroDen.byteLength)).toBeNull();
    const zeroGamma = buildISO({ baseHeadroom: [0, 1], altHeadroom: [3, 1], channels: [{ ...CH, gamma: [0, 1] }] });
    expect(parseISO21496Metadata(v(zeroGamma), 0, zeroGamma.byteLength)).toBeNull();
  });

  it('GMISO-044: tmap item payload = version byte + metadata; parseTmapBox accepts it too', () => {
    const iso = buildISO({ baseHeadroom: [0, 1], altHeadroom: [3, 1], channels: [CH] });
    const payload = new Uint8Array(iso.byteLength + 1);
    payload.set(iso, 1);
    const view = new DataView(payload.buffer);
    expect(parseTmapItemPayload(view, 0, payload.byteLength)!.alternateHdrHeadroom).toBe(3);
    expect(parseTmapBox(view, 0, payload.byteLength)!.gainMapMin).toEqual([-0.5]);
    payload[0] = 1;
    expect(parseTmapItemPayload(view, 0, payload.byteLength)).toBeNull();
  });
});
