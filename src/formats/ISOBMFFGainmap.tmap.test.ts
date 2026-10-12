/**
 * AVIF / HEIC gain maps: ISO 21496-1 'tmap' derived item metadata (stored in
 * idat, construction_method 1) and the base item's colr properties.
 * Containers are assembled in code.
 */

import { describe, it, expect } from 'vitest';
import { parseGainmapAVIF } from './AVIFGainmapDecoder';
import { parseHEICGainmapInfo } from './HEICGainmapDecoder';
import { buildICC, DISPLAY_P3_ICC } from './__tests__/iccFixtures';

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const box = (type: string, payload: number[]) => [...u32(8 + payload.length), ...ascii(type), ...payload];
const fullBox = (type: string, version: number, payload: number[]) => box(type, [version, 0, 0, 0, ...payload]);

/** tmap item payload: version 0 + ISO 21496-1 metadata, one channel. */
function tmapPayload(m: { baseH: number; altH: number; min: number; max: number }): number[] {
  const words = [m.baseH, 1, m.altH, 1, m.min, 1, m.max, 1, 1, 1, 1, 64, 1, 64];
  return [0, ...u16(0), ...u16(0), 0x00, ...words.flatMap((w) => u32(w >>> 0))];
}

function buildContainer(opts: {
  brand: 'avif' | 'heic';
  tmap?: number[];
  colr?: number[][]; // colr payloads associated with the primary item
}): ArrayBuffer {
  const codec = opts.brand === 'avif' ? 'av01' : 'hvc1';
  const infe = (id: number, type: string) => fullBox('infe', 2, [...u16(id), ...u16(0), ...ascii(type)]);
  const items = [infe(1, codec), infe(2, codec), ...(opts.tmap ? [infe(3, 'tmap')] : [])];
  const iinf = fullBox('iinf', 0, [...u16(items.length), ...items.flat()]);
  const pitm = fullBox('pitm', 0, u16(1));

  const props = [
    fullBox('auxC', 0, [...ascii('urn:com:photo:aux:hdrgainmap'), 0]),
    ...(opts.colr ?? []).map((p) => box('colr', p)),
  ];
  const ipco = box('ipco', props.flat());
  const primaryAssoc = (opts.colr ?? []).map((_, i) => 0x80 | (i + 2));
  const ipma = fullBox('ipma', 0, [...u32(2), ...u16(2), 1, 0x81, ...u16(1), primaryAssoc.length, ...primaryAssoc]);
  const iprp = box('iprp', [...ipco, ...ipma]);
  const idat = opts.tmap ? box('idat', opts.tmap) : [];

  const ilocFor = (mdatData: number) => {
    const entries: number[] = [];
    const item = (id: number, method: number, offset: number, length: number) =>
      entries.push(...u16(id), ...u16(method), ...u16(0), ...u16(1), ...u32(offset), ...u32(length));
    item(1, 0, mdatData, 16);
    item(2, 0, mdatData + 16, 8);
    if (opts.tmap) item(3, 1, 0, opts.tmap.length);
    return fullBox('iloc', 1, [0x44, 0x00, ...u16(opts.tmap ? 3 : 2), ...entries]);
  };

  const ftyp = box('ftyp', [...ascii(opts.brand), ...u32(0), ...ascii('mif1')]);
  const metaWithout = (iloc: number[]) => fullBox('meta', 0, [...pitm, ...iinf, ...iprp, ...iloc, ...idat]);
  const metaLen = metaWithout(ilocFor(0)).length;
  const mdatData = ftyp.length + metaLen + 8;
  const meta = metaWithout(ilocFor(mdatData));
  const mdat = box('mdat', new Array(24).fill(0xaa));
  return new Uint8Array([...ftyp, ...meta, ...mdat]).buffer;
}

const NCLX_P3_SRGB = [...ascii('nclx'), ...u16(12), ...u16(13), ...u16(6), 0x80];
const NCLX_2020_PQ = [...ascii('nclx'), ...u16(9), ...u16(16), ...u16(9), 0x80];

describe.each([['avif' as const], ['heic' as const]])('%s gain map container', (brand) => {
  const parse = (buf: ArrayBuffer) => (brand === 'avif' ? parseGainmapAVIF(buf) : parseHEICGainmapInfo(buf));

  it('ISOGM-001: reads ISO 21496-1 metadata from a tmap item stored in idat', () => {
    const info = parse(buildContainer({ brand, tmap: tmapPayload({ baseH: 0, altH: 3, min: -1, max: 3 }) }))!;
    expect(info).not.toBeNull();
    expect(info.headroom).toBe(3);
    expect(info.gainMapMetadata!.gainMapMin).toEqual([-1]);
    expect(info.gainMapMetadata!.offsetSDR).toEqual([1 / 64]);
    expect(info.gainMapMetadata!.baseRenditionIsHDR).toBe(false);
  });

  it('ISOGM-002: an HDR base (baseHdrHeadroom > alternate) sets baseRenditionIsHDR', () => {
    const info = parse(buildContainer({ brand, tmap: tmapPayload({ baseH: 3, altH: 0, min: -3, max: 0 }) }))!;
    expect(info.gainMapMetadata!.baseRenditionIsHDR).toBe(true);
    expect(info.gainMapMetadata!.hdrCapacityMax).toBe(3);
  });

  it('ISOGM-003: base colour comes from the primary item colr properties', () => {
    expect(parse(buildContainer({ brand, colr: [NCLX_P3_SRGB] }))!.baseColor).toEqual({
      primaries: 'p3',
      transfer: 'srgb',
    });
    expect(parse(buildContainer({ brand, colr: [NCLX_2020_PQ] }))!.baseColor).toEqual({
      primaries: 'bt2020',
      transfer: 'pq',
    });
    const prof = [...ascii('prof'), ...buildICC(DISPLAY_P3_ICC)];
    expect(parse(buildContainer({ brand, colr: [prof] }))!.baseColor).toEqual({ primaries: 'p3', transfer: null });
    expect(parse(buildContainer({ brand }))!.baseColor).toBeNull();
  });
});
