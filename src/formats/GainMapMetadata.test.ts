/**
 * GainMapMetadata Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseGainMapMetadataFromXMP,
  tmapToGainMapMetadata,
  defaultGainMapMetadata,
  isSimpleGainMap,
  reconstructHDR,
  srgbToLinear,
  type GainMapMetadata,
} from './GainMapMetadata';
import type { TmapMetadata } from './AVIFGainmapDecoder';

// =============================================================================
// srgbToLinear
// =============================================================================

describe('srgbToLinear', () => {
  it('should return 0 for 0', () => {
    expect(srgbToLinear(0)).toBe(0);
  });

  it('should return 1 for 1', () => {
    expect(srgbToLinear(1)).toBeCloseTo(1, 6);
  });

  it('should use linear segment for values <= 0.04045', () => {
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 6);
  });

  it('should use gamma segment for values > 0.04045', () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(Math.pow((0.5 + 0.055) / 1.055, 2.4), 6);
  });
});

// =============================================================================
// parseGainMapMetadataFromXMP
// =============================================================================

describe('parseGainMapMetadataFromXMP', () => {
  it('should parse Apple headroom', () => {
    const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
    <x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:apple="http://ns.apple.com/">
        <rdf:Description apple:hdrgainmapheadroom="3.5"/>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.channelCount).toBe(1);
    expect(result!.gainMapMax).toEqual([3.5]);
    expect(result!.hdrCapacityMax).toBe(3.5);
    expect(result!.gainMapMin).toEqual([0]);
    expect(result!.gamma).toEqual([1]);
    expect(result!.offsetSDR).toEqual([0]);
    expect(result!.offsetHDR).toEqual([0]);
  });

  it('should parse hdrgm scalar GainMapMax', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">
        <rdf:Description hdrgm:GainMapMax="4.2"/>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.channelCount).toBe(1);
    expect(result!.gainMapMax).toEqual([4.2]);
    expect(result!.hdrCapacityMax).toBe(4.2);
  });

  it('should parse hdrgm per-channel GainMapMax via rdf:Seq', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">
        <rdf:Description>
          <hdrgm:GainMapMax>
            <rdf:Seq>
              <rdf:li>3.0</rdf:li>
              <rdf:li>4.0</rdf:li>
              <rdf:li>5.0</rdf:li>
            </rdf:Seq>
          </hdrgm:GainMapMax>
        </rdf:Description>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.channelCount).toBe(3);
    expect(result!.gainMapMax).toEqual([3.0, 4.0, 5.0]);
    expect(result!.hdrCapacityMax).toBe(3.0); // first channel
  });

  it('should parse negative GainMapMin', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">
        <rdf:Description hdrgm:GainMapMax="4.0" hdrgm:GainMapMin="-1.5"/>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.gainMapMin).toEqual([-1.5]);
  });

  it('should parse Gamma != 1', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">
        <rdf:Description hdrgm:GainMapMax="4.0" hdrgm:Gamma="2.2"/>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.gamma).toEqual([2.2]);
  });

  it('should parse OffsetSDR and OffsetHDR', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">
        <rdf:Description hdrgm:GainMapMax="4.0" hdrgm:OffsetSDR="0.015625" hdrgm:OffsetHDR="0.015625"/>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.offsetSDR).toEqual([0.015625]);
    expect(result!.offsetHDR).toEqual([0.015625]);
  });

  it('should parse HDRCapacityMin and HDRCapacityMax', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">
        <rdf:Description hdrgm:GainMapMax="6.0" hdrgm:HDRCapacityMin="1.0" hdrgm:HDRCapacityMax="5.0"/>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.hdrCapacityMin).toBe(1.0);
    expect(result!.hdrCapacityMax).toBe(5.0);
  });

  it('should parse BaseRenditionIsHDR', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">
        <rdf:Description hdrgm:GainMapMax="4.0" hdrgm:BaseRenditionIsHDR="true"/>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.baseRenditionIsHDR).toBe(true);
  });

  it('should default missing fields to zero/false', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">
        <rdf:Description hdrgm:GainMapMax="4.0"/>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.gainMapMin).toEqual([0]);
    expect(result!.gamma).toEqual([1]);
    expect(result!.offsetSDR).toEqual([0]);
    expect(result!.offsetHDR).toEqual([0]);
    expect(result!.hdrCapacityMin).toBe(0);
    expect(result!.baseRenditionIsHDR).toBe(false);
  });

  it('should return null for non-HDR XMP', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
        <rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"/>
      </rdf:RDF>
    </x:xmpmeta>`;
    expect(parseGainMapMetadataFromXMP(xmp)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseGainMapMetadataFromXMP('')).toBeNull();
  });

  it('should parse per-channel GainMapMin via rdf:Seq', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">
        <rdf:Description>
          <hdrgm:GainMapMax>
            <rdf:Seq><rdf:li>3</rdf:li><rdf:li>4</rdf:li><rdf:li>5</rdf:li></rdf:Seq>
          </hdrgm:GainMapMax>
          <hdrgm:GainMapMin>
            <rdf:Seq><rdf:li>-0.5</rdf:li><rdf:li>-0.3</rdf:li><rdf:li>-0.1</rdf:li></rdf:Seq>
          </hdrgm:GainMapMin>
        </rdf:Description>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.channelCount).toBe(3);
    expect(result!.gainMapMin).toEqual([-0.5, -0.3, -0.1]);
  });

  it('should expand scalar values to match channelCount', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">
        <rdf:Description>
          <hdrgm:GainMapMax>
            <rdf:Seq><rdf:li>3</rdf:li><rdf:li>4</rdf:li><rdf:li>5</rdf:li></rdf:Seq>
          </hdrgm:GainMapMax>
        </rdf:Description>
        <rdf:Description hdrgm:Gamma="2.0"/>
      </rdf:RDF>
    </x:xmpmeta>`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.channelCount).toBe(3);
    // Gamma scalar should be expanded to 3 channels
    expect(result!.gamma).toEqual([2.0, 2.0, 2.0]);
  });

  it('should handle Apple headroom with no hdrgm namespace', () => {
    const xmp = `xmlns:apple="http://ns.apple.com/" apple:hdrgainmapheadroom="2.8"`;
    const result = parseGainMapMetadataFromXMP(xmp);
    expect(result).not.toBeNull();
    expect(result!.hdrCapacityMax).toBe(2.8);
    expect(result!.channelCount).toBe(1);
  });
});

// =============================================================================
// tmapToGainMapMetadata
// =============================================================================

describe('tmapToGainMapMetadata', () => {
  it('should convert 1-channel tmap', () => {
    const tmap: TmapMetadata = {
      channelCount: 1,
      gainMapMin: [0],
      gainMapMax: [4.0],
      gainMapGamma: [1.0],
      baseOffset: [0],
      alternateOffset: [0],
      baseHdrHeadroom: 0,
      alternateHdrHeadroom: 4.0,
    };
    const result = tmapToGainMapMetadata(tmap);
    expect(result.channelCount).toBe(1);
    expect(result.gainMapMax).toEqual([4.0]);
    expect(result.hdrCapacityMax).toBe(4.0);
    expect(result.gamma).toEqual([1.0]);
    expect(result.offsetSDR).toEqual([0]);
    expect(result.offsetHDR).toEqual([0]);
  });

  it('should convert 3-channel tmap', () => {
    const tmap: TmapMetadata = {
      channelCount: 3,
      gainMapMin: [-0.5, -0.3, -0.1],
      gainMapMax: [3.0, 4.0, 5.0],
      gainMapGamma: [2.2, 2.2, 2.2],
      baseOffset: [0.015625, 0.015625, 0.015625],
      alternateOffset: [0.015625, 0.015625, 0.015625],
      baseHdrHeadroom: 0,
      alternateHdrHeadroom: 5.0,
    };
    const result = tmapToGainMapMetadata(tmap);
    expect(result.channelCount).toBe(3);
    expect(result.gainMapMax).toEqual([3.0, 4.0, 5.0]);
    expect(result.gainMapMin).toEqual([-0.5, -0.3, -0.1]);
    expect(result.gamma).toEqual([2.2, 2.2, 2.2]);
    expect(result.hdrCapacityMax).toBe(5.0);
    expect(result.offsetSDR).toEqual([0.015625, 0.015625, 0.015625]);
    expect(result.offsetHDR).toEqual([0.015625, 0.015625, 0.015625]);
  });

  it('should fall back to gainMapMax[0] when alternateHdrHeadroom is zero', () => {
    const tmap: TmapMetadata = {
      channelCount: 1,
      gainMapMin: [0],
      gainMapMax: [3.5],
      gainMapGamma: [1.0],
      baseOffset: [0],
      alternateOffset: [0],
      baseHdrHeadroom: 0,
      alternateHdrHeadroom: 0,
    };
    const result = tmapToGainMapMetadata(tmap);
    expect(result.hdrCapacityMax).toBe(3.5);
  });

  it('should fall back to 2.0 when both alternateHdrHeadroom and gainMapMax are zero', () => {
    const tmap: TmapMetadata = {
      channelCount: 1,
      gainMapMin: [0],
      gainMapMax: [0],
      gainMapGamma: [1.0],
      baseOffset: [0],
      alternateOffset: [0],
      baseHdrHeadroom: 0,
      alternateHdrHeadroom: 0,
    };
    const result = tmapToGainMapMetadata(tmap);
    expect(result.hdrCapacityMax).toBe(2.0);
  });

  it('should set baseRenditionIsHDR to false', () => {
    const tmap: TmapMetadata = {
      channelCount: 1,
      gainMapMin: [0],
      gainMapMax: [4.0],
      gainMapGamma: [1.0],
      baseOffset: [0],
      alternateOffset: [0],
      baseHdrHeadroom: 0,
      alternateHdrHeadroom: 4.0,
    };
    const result = tmapToGainMapMetadata(tmap);
    expect(result.baseRenditionIsHDR).toBe(false);
  });
});

// =============================================================================
// isSimpleGainMap
// =============================================================================

describe('isSimpleGainMap', () => {
  it('should return true for simple Apple-style metadata', () => {
    expect(isSimpleGainMap(defaultGainMapMetadata(3.0))).toBe(true);
  });

  it('should return false for 3-channel metadata', () => {
    const meta: GainMapMetadata = {
      channelCount: 3,
      gainMapMin: [0, 0, 0],
      gainMapMax: [4, 4, 4],
      gamma: [1, 1, 1],
      offsetSDR: [0, 0, 0],
      offsetHDR: [0, 0, 0],
      hdrCapacityMin: 0,
      hdrCapacityMax: 4,
      baseRenditionIsHDR: false,
    };
    expect(isSimpleGainMap(meta)).toBe(false);
  });

  it('should return false when gamma != 1', () => {
    const meta: GainMapMetadata = {
      channelCount: 1,
      gainMapMin: [0],
      gainMapMax: [4],
      gamma: [2.2],
      offsetSDR: [0],
      offsetHDR: [0],
      hdrCapacityMin: 0,
      hdrCapacityMax: 4,
      baseRenditionIsHDR: false,
    };
    expect(isSimpleGainMap(meta)).toBe(false);
  });

  it('should return false when gainMapMin != 0', () => {
    const meta: GainMapMetadata = {
      channelCount: 1,
      gainMapMin: [-1],
      gainMapMax: [4],
      gamma: [1],
      offsetSDR: [0],
      offsetHDR: [0],
      hdrCapacityMin: 0,
      hdrCapacityMax: 4,
      baseRenditionIsHDR: false,
    };
    expect(isSimpleGainMap(meta)).toBe(false);
  });

  it('should return false when offsetSDR != 0', () => {
    const meta: GainMapMetadata = {
      channelCount: 1,
      gainMapMin: [0],
      gainMapMax: [4],
      gamma: [1],
      offsetSDR: [0.015625],
      offsetHDR: [0],
      hdrCapacityMin: 0,
      hdrCapacityMax: 4,
      baseRenditionIsHDR: false,
    };
    expect(isSimpleGainMap(meta)).toBe(false);
  });

  it('should return false when baseRenditionIsHDR is true', () => {
    const meta: GainMapMetadata = {
      channelCount: 1,
      gainMapMin: [0],
      gainMapMax: [4],
      gamma: [1],
      offsetSDR: [0],
      offsetHDR: [0],
      hdrCapacityMin: 0,
      hdrCapacityMax: 4,
      baseRenditionIsHDR: true,
    };
    expect(isSimpleGainMap(meta)).toBe(false);
  });
});

// =============================================================================
// reconstructHDR
// =============================================================================

describe('reconstructHDR', () => {
  // Helper: create test pixel data
  function makePixels(values: number[][]): Uint8ClampedArray {
    const data = new Uint8ClampedArray(values.length * 4);
    for (let i = 0; i < values.length; i++) {
      data[i * 4] = values[i]![0]!;
      data[i * 4 + 1] = values[i]![1]!;
      data[i * 4 + 2] = values[i]![2]!;
      data[i * 4 + 3] = 255;
    }
    return data;
  }

  it('should produce identity for zero headroom (fast path)', () => {
    const base = makePixels([[128, 128, 128]]);
    const gain = makePixels([[0, 0, 0]]); // gain=0 → exp2(0*0)=1
    const meta = defaultGainMapMetadata(0); // headroom=0

    const result = reconstructHDR(base, gain, 1, meta);

    // With headroom=0, gain = 2^(0) = 1 for any gainmap value
    const expected = srgbToLinear(128 / 255);
    expect(result[0]).toBeCloseTo(expected, 4);
    expect(result[1]).toBeCloseTo(expected, 4);
    expect(result[2]).toBeCloseTo(expected, 4);
    expect(result[3]).toBe(1.0);
  });

  it('fast path: should match old LUT-based reconstruction', () => {
    const base = makePixels([[200, 100, 50]]);
    const gain = makePixels([[128, 128, 128]]); // mid-gray gainmap
    const headroom = 3.0;
    const meta = defaultGainMapMetadata(headroom);

    const result = reconstructHDR(base, gain, 1, meta);

    // Manual calculation
    const gainValue = Math.pow(2, (128 / 255) * headroom);
    expect(result[0]).toBeCloseTo(srgbToLinear(200 / 255) * gainValue, 4);
    expect(result[1]).toBeCloseTo(srgbToLinear(100 / 255) * gainValue, 4);
    expect(result[2]).toBeCloseTo(srgbToLinear(50 / 255) * gainValue, 4);
  });

  it('full path: should apply gamma correction', () => {
    const base = makePixels([[128, 128, 128]]);
    const gain = makePixels([[128, 128, 128]]);
    const meta: GainMapMetadata = {
      channelCount: 1,
      gainMapMin: [0],
      gainMapMax: [4.0],
      gamma: [2.2],
      offsetSDR: [0],
      offsetHDR: [0],
      hdrCapacityMin: 0,
      hdrCapacityMax: 4.0,
      baseRenditionIsHDR: false,
    };

    const result = reconstructHDR(base, gain, 1, meta);

    // Manual: log_recovery = pow(128/255, 1/2.2)
    const logRecovery = Math.pow(128 / 255, 1 / 2.2);
    const logBoost = 0 * (1 - logRecovery) + 4.0 * logRecovery;
    const expected = srgbToLinear(128 / 255) * Math.pow(2, logBoost);
    expect(result[0]).toBeCloseTo(expected, 4);
  });

  it('full path: should apply offsets', () => {
    const base = makePixels([[128, 128, 128]]);
    const gain = makePixels([[255, 255, 255]]); // max gain
    const offsetSDR = 0.015625;
    const offsetHDR = 0.015625;
    const meta: GainMapMetadata = {
      channelCount: 1,
      gainMapMin: [0],
      gainMapMax: [4.0],
      gamma: [1],
      offsetSDR: [offsetSDR],
      offsetHDR: [offsetHDR],
      hdrCapacityMin: 0,
      hdrCapacityMax: 4.0,
      baseRenditionIsHDR: false,
    };

    const result = reconstructHDR(base, gain, 1, meta);

    // Manual: logRecovery=pow(255/255, 1/1)=1, logBoost=0*(1-1)+4*1=4
    // HDR = (sdr + offsetSDR) * 2^4 - offsetHDR
    const expected = (srgbToLinear(128 / 255) + offsetSDR) * Math.pow(2, 4.0) - offsetHDR;
    expect(result[0]).toBeCloseTo(expected, 4);
  });

  it('full path: should handle negative GainMapMin', () => {
    const base = makePixels([[128, 128, 128]]);
    const gain = makePixels([[0, 0, 0]]); // min gain → logRecovery=0 → logBoost=GainMapMin
    const meta: GainMapMetadata = {
      channelCount: 1,
      gainMapMin: [-1.5],
      gainMapMax: [4.0],
      gamma: [1],
      offsetSDR: [0],
      offsetHDR: [0],
      hdrCapacityMin: 0,
      hdrCapacityMax: 4.0,
      baseRenditionIsHDR: false,
    };

    const result = reconstructHDR(base, gain, 1, meta);

    // logRecovery=pow(0/255,1)=0, logBoost=(-1.5)*(1-0)+(4)*(0)=-1.5
    // HDR = sdr * 2^(-1.5) — darker than SDR
    const expected = srgbToLinear(128 / 255) * Math.pow(2, -1.5);
    expect(result[0]).toBeCloseTo(expected, 4);
  });

  it('full path: should handle per-channel gain map (3 channels)', () => {
    const base = makePixels([[200, 150, 100]]);
    // Each channel has a different gainmap value
    const gain = makePixels([[50, 128, 200]]);
    const meta: GainMapMetadata = {
      channelCount: 3,
      gainMapMin: [0, 0, 0],
      gainMapMax: [3.0, 4.0, 5.0],
      gamma: [1, 1, 1],
      offsetSDR: [0, 0, 0],
      offsetHDR: [0, 0, 0],
      hdrCapacityMin: 0,
      hdrCapacityMax: 3.0,
      baseRenditionIsHDR: false,
    };

    const result = reconstructHDR(base, gain, 1, meta);

    // Channel 0: logRecovery=50/255, logBoost=3.0*(50/255)
    const lr0 = 50 / 255;
    const boost0 = 3.0 * lr0;
    expect(result[0]).toBeCloseTo(srgbToLinear(200 / 255) * Math.pow(2, boost0), 4);

    // Channel 1: logRecovery=128/255, logBoost=4.0*(128/255)
    const lr1 = 128 / 255;
    const boost1 = 4.0 * lr1;
    expect(result[1]).toBeCloseTo(srgbToLinear(150 / 255) * Math.pow(2, boost1), 4);

    // Channel 2: logRecovery=200/255, logBoost=5.0*(200/255)
    const lr2 = 200 / 255;
    const boost2 = 5.0 * lr2;
    expect(result[2]).toBeCloseTo(srgbToLinear(100 / 255) * Math.pow(2, boost2), 4);
  });

  it('should produce alpha = 1.0 for all pixels', () => {
    const base = makePixels([[128, 128, 128], [200, 200, 200]]);
    const gain = makePixels([[64, 64, 64], [192, 192, 192]]);
    const meta = defaultGainMapMetadata(3.0);

    const result = reconstructHDR(base, gain, 2, meta);
    expect(result[3]).toBe(1.0);
    expect(result[7]).toBe(1.0);
  });

  it('should handle multiple pixels correctly', () => {
    const base = makePixels([[0, 0, 0], [255, 255, 255]]);
    const gain = makePixels([[0, 0, 0], [255, 255, 255]]);
    const meta = defaultGainMapMetadata(3.0);

    const result = reconstructHDR(base, gain, 2, meta);

    // Pixel 0: black base, zero gain → 0
    expect(result[0]).toBeCloseTo(0, 4);
    expect(result[1]).toBeCloseTo(0, 4);
    expect(result[2]).toBeCloseTo(0, 4);

    // Pixel 1: white base, max gain
    const whiteLinear = srgbToLinear(1.0);
    const maxGain = Math.pow(2, 3.0);
    expect(result[4]).toBeCloseTo(whiteLinear * maxGain, 4);
  });
});
