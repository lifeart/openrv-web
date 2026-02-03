/**
 * Additional LUT Format Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parse3DLLUT,
  parseCSPLUT,
  parseITXLUT,
  parseLookLUT,
  parseHoudiniLUT,
  parseNukeLUT,
  parseMGALUT,
  parseRV3DLUT,
  parseRVChannelLUT,
} from './LUTFormats';
import { isLUT3D, isLUT1D, applyLUT3D, applyLUT1D } from './LUTLoader';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Generate an identity 3D .3dl with given size (R-fastest order) */
function createIdentity3DL3D(size: number): string {
  const maxOut = 4095; // 12-bit
  const lines: string[] = [];
  // Header line: input range
  const rangeEntries: number[] = [];
  for (let i = 0; i < size; i++) {
    rangeEntries.push(Math.round((i / (size - 1)) * 1023));
  }
  lines.push(rangeEntries.join(' '));
  // Data: R varies fastest
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rv = Math.round((r / (size - 1)) * maxOut);
        const gv = Math.round((g / (size - 1)) * maxOut);
        const bv = Math.round((b / (size - 1)) * maxOut);
        lines.push(`${rv} ${gv} ${bv}`);
      }
    }
  }
  return lines.join('\n');
}

/** Generate identity 1D .3dl */
function createIdentity3DL1D(size: number): string {
  const maxOut = 4095;
  const lines: string[] = [];
  const rangeEntries: number[] = [];
  for (let i = 0; i < size; i++) {
    rangeEntries.push(Math.round((i / (size - 1)) * 1023));
  }
  lines.push(rangeEntries.join(' '));
  for (let i = 0; i < size; i++) {
    const v = Math.round((i / (size - 1)) * maxOut);
    lines.push(`${v} ${v} ${v}`);
  }
  return lines.join('\n');
}

/** Generate identity CSP 3D LUT */
function createIdentityCSP(size: number): string {
  const lines: string[] = [
    'CSPLUTV100',
    '3D',
    '',
    'BEGIN METADATA',
    '"title" "Test CSP LUT"',
    'END METADATA',
    '',
    // Identity pre-LUT for R
    '2', '0.0 1.0', '0.0 1.0',
    // Identity pre-LUT for G
    '2', '0.0 1.0', '0.0 1.0',
    // Identity pre-LUT for B
    '2', '0.0 1.0', '0.0 1.0',
    '',
    `${size} ${size} ${size}`,
  ];
  // Data: R varies fastest
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rv = r / (size - 1);
        const gv = g / (size - 1);
        const bv = b / (size - 1);
        lines.push(`${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)}`);
      }
    }
  }
  return lines.join('\n');
}

/** Generate identity ITX LUT */
function createIdentityITX(size: number): string {
  const lines: string[] = [
    '# IRIDAS text LUT',
    `LUT_3D_SIZE ${size}`,
    'LUT_3D_INPUT_RANGE 0.0 1.0',
  ];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rv = r / (size - 1);
        const gv = g / (size - 1);
        const bv = b / (size - 1);
        lines.push(`${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)}`);
      }
    }
  }
  return lines.join('\n');
}

/** Generate identity Look XML LUT */
function createIdentityLook(size: number): string {
  const dataLines: string[] = [];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rv = r / (size - 1);
        const gv = g / (size - 1);
        const bv = b / (size - 1);
        dataLines.push(`      ${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)}`);
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<look>
  <LUT>
    <title>Test Look</title>
    <size>${size}</size>
    <inputRange>0.0 1.0</inputRange>
    <data>
${dataLines.join('\n')}
    </data>
  </LUT>
</look>`;
}

/** Generate identity Houdini 1D LUT */
function createIdentityHoudini1D(size: number): string {
  const values: string[] = [];
  for (let i = 0; i < size; i++) {
    values.push((i / (size - 1)).toFixed(6));
  }
  const channelData = values.join(' ');
  return [
    'Version\t\t3',
    'Format\t\tany',
    'Type\t\tC',
    'From\t\t0.000000 1.000000',
    'To\t\t0.000000 1.000000',
    'Black\t\t0.000000',
    'White\t\t1.000000',
    `Length\t\t${size}`,
    'LUT:',
    `R { ${channelData} }`,
    `G { ${channelData} }`,
    `B { ${channelData} }`,
  ].join('\n');
}

/** Generate identity Houdini 3D LUT */
function createIdentityHoudini3D(size: number): string {
  const triplets: string[] = [];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rv = r / (size - 1);
        const gv = g / (size - 1);
        const bv = b / (size - 1);
        triplets.push(`{ ${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)} }`);
      }
    }
  }
  return [
    'Version\t\t3',
    'Format\t\tany',
    'Type\t\t3D',
    'From\t\t0.000000 1.000000',
    'To\t\t0.000000 1.000000',
    'Black\t\t0.000000',
    'White\t\t1.000000',
    `Length\t\t${size}`,
    'LUT:',
    triplets.join(' '),
  ].join('\n');
}

/** Generate identity Nuke exported format */
function createIdentityNukeExported(size: number): string {
  const lines: string[] = [
    '# Nuke CMSTestPattern Vectorfield export',
    `# cube_size ${size}`,
    '# input_min 0.0 0.0 0.0',
    '# input_max 1.0 1.0 1.0',
    '',
  ];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rv = r / (size - 1);
        const gv = g / (size - 1);
        const bv = b / (size - 1);
        lines.push(`${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)}`);
      }
    }
  }
  return lines.join('\n');
}

/** Generate identity Nuke Vectorfield node format */
function createIdentityNukeVectorfield(size: number): string {
  const dataLines: string[] = [];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rv = r / (size - 1);
        const gv = g / (size - 1);
        const bv = b / (size - 1);
        dataLines.push(`   ${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)}`);
      }
    }
  }
  return `Vectorfield {
 file_type "3D"
 label "Test"
 lut3d {
  cube_size ${size}
  data "
${dataLines.join('\n')}
  "
 }
}`;
}

/** Generate identity MGA LUT */
function createIdentityMGA(size: number): string {
  const maxOut = 4095;
  const lines: string[] = [
    'MGA',
    'LUT_TYPE 3D',
    `LUT_SIZE ${size}`,
    'LUT_IN_BITDEPTH 10',
    'LUT_OUT_BITDEPTH 12',
  ];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rv = Math.round((r / (size - 1)) * maxOut);
        const gv = Math.round((g / (size - 1)) * maxOut);
        const bv = Math.round((b / (size - 1)) * maxOut);
        lines.push(`${rv} ${gv} ${bv}`);
      }
    }
  }
  return lines.join('\n');
}

/** Generate identity RV3DLUT */
function createIdentityRV3D(size: number): string {
  const lines: string[] = [
    'RV3DLUT',
    `size ${size}`,
    'domain_min 0.0 0.0 0.0',
    'domain_max 1.0 1.0 1.0',
    'data:',
  ];
  // B-fastest order (same as internal format)
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const rv = r / (size - 1);
        const gv = g / (size - 1);
        const bv = b / (size - 1);
        lines.push(`${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)}`);
      }
    }
  }
  return lines.join('\n');
}

/** Generate identity RV Channel LUT (interleaved) */
function createIdentityRVChannel(size: number): string {
  const lines: string[] = [
    'RVCHANNELLUT',
    `size ${size}`,
    'channels 3',
    'domain_min 0.0 0.0 0.0',
    'domain_max 1.0 1.0 1.0',
    'data:',
  ];
  for (let i = 0; i < size; i++) {
    const v = i / (size - 1);
    lines.push(`${v.toFixed(6)} ${v.toFixed(6)} ${v.toFixed(6)}`);
  }
  return lines.join('\n');
}

/** Generate identity RV Channel LUT (per-channel) */
function createIdentityRVChannelPerChannel(size: number): string {
  const values: string[] = [];
  for (let i = 0; i < size; i++) {
    values.push((i / (size - 1)).toFixed(6));
  }
  const channelData = values.join(' ');
  return [
    'RVCHANNELLUT',
    `size ${size}`,
    'channels 3',
    'domain_min 0.0 0.0 0.0',
    'domain_max 1.0 1.0 1.0',
    `red:`,
    channelData,
    `green:`,
    channelData,
    `blue:`,
    channelData,
  ].join('\n');
}

// ─── Autodesk .3dl Parser Tests ───────────────────────────────────────

describe('Autodesk .3dl Parser', () => {
  it('L3DL-001: parses valid 3D .3dl with 12-bit output', () => {
    const content = createIdentity3DL3D(4);
    const lut = parse3DLLUT(content);

    expect(lut.size).toBe(4);
    expect(lut.data.length).toBe(4 * 4 * 4 * 3);
  });

  it('L3DL-002: normalizes integer values to 0.0-1.0 range', () => {
    const content = createIdentity3DL3D(2);
    const lut = parse3DLLUT(content);

    for (let i = 0; i < lut.data.length; i++) {
      expect(lut.data[i]).toBeGreaterThanOrEqual(0);
      expect(lut.data[i]).toBeLessThanOrEqual(1);
    }
  });

  it('L3DL-003: detects 3D LUT from cube data count', () => {
    const content = createIdentity3DL3D(4);
    const lut = parse3DLLUT(content);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('L3DL-004: detects 1D LUT from linear data count', () => {
    const content = createIdentity3DL1D(17);
    const lut = parse3DLLUT(content);
    expect(isLUT1D(lut)).toBe(true);
  });

  it('L3DL-005: ignores comment lines starting with #', () => {
    const content = '# This is a comment\n' + createIdentity3DL3D(2);
    const lut = parse3DLLUT(content);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('L3DL-006: handles 10-bit output range (0-1023)', () => {
    const size = 2;
    const maxOut = 1023;
    const lines: string[] = ['0 1023'];
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const rv = Math.round((r / (size - 1)) * maxOut);
          const gv = Math.round((g / (size - 1)) * maxOut);
          const bv = Math.round((b / (size - 1)) * maxOut);
          lines.push(`${rv} ${gv} ${bv}`);
        }
      }
    }
    const lut = parse3DLLUT(lines.join('\n'));

    // Values should be normalized
    for (let i = 0; i < lut.data.length; i++) {
      expect(lut.data[i]).toBeGreaterThanOrEqual(0);
      expect(lut.data[i]).toBeLessThanOrEqual(1);
    }
  });

  it('L3DL-007: reorders data from R-fastest to B-fastest', () => {
    const content = createIdentity3DL3D(4);
    const lut = parse3DLLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    // After reordering, applying the identity LUT should return the input
    const result = applyLUT3D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('L3DL-008: identity LUT produces no visible change via applyLUT3D', () => {
    const content = createIdentity3DL3D(4);
    const lut = parse3DLLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('L3DL-009: handles Windows line endings (CRLF)', () => {
    const content = createIdentity3DL3D(2).replace(/\n/g, '\r\n');
    const lut = parse3DLLUT(content);
    expect(lut.size).toBe(2);
  });

  it('L3DL-010: throws on empty file', () => {
    expect(() => parse3DLLUT('')).toThrow('3DL: Empty file');
  });

  it('L3DL-012: result has correct domain [0,0,0] to [1,1,1]', () => {
    const content = createIdentity3DL3D(2);
    const lut = parse3DLLUT(content);

    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([1, 1, 1]);
  });

  it('L3DL-013: result passes isLUT3D / isLUT1D check', () => {
    const content3D = createIdentity3DL3D(2);
    const lut3D = parse3DLLUT(content3D);
    expect(isLUT3D(lut3D)).toBe(true);
    expect(isLUT1D(lut3D)).toBe(false);

    const content1D = createIdentity3DL1D(17);
    const lut1D = parse3DLLUT(content1D);
    expect(isLUT1D(lut1D)).toBe(true);
    expect(isLUT3D(lut1D)).toBe(false);
  });
});

// ─── Rising Sun .csp Parser Tests ────────────────────────────────────

describe('Rising Sun .csp Parser', () => {
  it('LCSP-001: parses valid 3D .csp with identity pre-LUT', () => {
    const content = createIdentityCSP(4);
    const lut = parseCSPLUT(content);

    expect(lut.size).toBe(4);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('LCSP-002: verifies CSPLUTV100 magic header', () => {
    const content = createIdentityCSP(2);
    expect(() => parseCSPLUT(content)).not.toThrow();
  });

  it('LCSP-003: throws on missing magic header', () => {
    expect(() => parseCSPLUT('INVALID\n3D\n')).toThrow('CSP: Missing CSPLUTV100 magic header');
  });

  it('LCSP-004: parses metadata title', () => {
    const content = createIdentityCSP(2);
    const lut = parseCSPLUT(content);
    expect(lut.title).toBe('Test CSP LUT');
  });

  it('LCSP-005: handles identity pre-LUT shaper (pass-through)', () => {
    const content = createIdentityCSP(4);
    const lut = parseCSPLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    // Identity should pass through without change
    const result = applyLUT3D(lut, 0.25, 0.5, 0.75);
    expect(result[0]).toBeCloseTo(0.25, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.75, 1);
  });

  it('LCSP-008: reorders data from R-fastest to B-fastest', () => {
    const content = createIdentityCSP(4);
    const lut = parseCSPLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('LCSP-009: identity LUT produces no visible change', () => {
    const content = createIdentityCSP(4);
    const lut = parseCSPLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('LCSP-010: result passes isLUT3D check', () => {
    const content = createIdentityCSP(2);
    const lut = parseCSPLUT(content);
    expect(isLUT3D(lut)).toBe(true);
    expect(isLUT1D(lut)).toBe(false);
  });

  it('LCSP-011: parses 1D type correctly', () => {
    const content = [
      'CSPLUTV100',
      '1D',
      '',
      '4', '0.0 0.333 0.666 1.0', '0.0 0.333 0.666 1.0',
      '4', '0.0 0.333 0.666 1.0', '0.0 0.333 0.666 1.0',
      '4', '0.0 0.333 0.666 1.0', '0.0 0.333 0.666 1.0',
    ].join('\n');

    const lut = parseCSPLUT(content);
    expect(isLUT1D(lut)).toBe(true);
    expect(lut.size).toBe(4);
  });

  it('LCSP-012: throws on wrong data count', () => {
    const content = [
      'CSPLUTV100',
      '3D',
      '',
      '2', '0.0 1.0', '0.0 1.0',
      '2', '0.0 1.0', '0.0 1.0',
      '2', '0.0 1.0', '0.0 1.0',
      '',
      '2 2 2',
      '0.0 0.0 0.0',
      '1.0 1.0 1.0',
      // Missing 6 entries
    ].join('\n');

    expect(() => parseCSPLUT(content)).toThrow('Expected 8 data entries, got 2');
  });
});

// ─── IRIDAS .itx Parser Tests ────────────────────────────────────────

describe('IRIDAS .itx Parser', () => {
  it('LITX-001: parses valid .itx file with LUT_3D_SIZE', () => {
    const content = createIdentityITX(4);
    const lut = parseITXLUT(content);

    expect(lut.size).toBe(4);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('LITX-002: parses LUT_3D_INPUT_RANGE into domain', () => {
    const content = createIdentityITX(2).replace(
      'LUT_3D_INPUT_RANGE 0.0 1.0',
      'LUT_3D_INPUT_RANGE 0.1 0.9'
    );
    const lut = parseITXLUT(content);

    expect(lut.domainMin).toEqual([0.1, 0.1, 0.1]);
    expect(lut.domainMax).toEqual([0.9, 0.9, 0.9]);
  });

  it('LITX-003: ignores comment lines', () => {
    const content = '# Extra comment\n' + createIdentityITX(2);
    const lut = parseITXLUT(content);
    expect(lut.size).toBe(2);
  });

  it('LITX-004: reorders data from R-fastest to B-fastest', () => {
    const content = createIdentityITX(4);
    const lut = parseITXLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('LITX-005: identity LUT produces no visible change', () => {
    const content = createIdentityITX(4);
    const lut = parseITXLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.25, 0.5, 0.75);
    expect(result[0]).toBeCloseTo(0.25, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.75, 1);
  });

  it('LITX-006: throws on missing size', () => {
    expect(() => parseITXLUT('# Just a comment\n0.0 0.0 0.0')).toThrow('ITX: LUT_3D_SIZE not found');
  });
});

// ─── IRIDAS .look Parser Tests ───────────────────────────────────────

describe('IRIDAS .look Parser', () => {
  it('LLOOK-001: parses valid .look XML file', () => {
    const content = createIdentityLook(4);
    const lut = parseLookLUT(content);

    expect(lut.size).toBe(4);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('LLOOK-002: extracts title from XML', () => {
    const content = createIdentityLook(2);
    const lut = parseLookLUT(content);
    expect(lut.title).toBe('Test Look');
  });

  it('LLOOK-004: identity LUT produces no visible change', () => {
    const content = createIdentityLook(4);
    const lut = parseLookLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.25, 0.5, 0.75);
    expect(result[0]).toBeCloseTo(0.25, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.75, 1);
  });

  it('LLOOK-005: throws on invalid XML', () => {
    expect(() => parseLookLUT('not xml at all {')).toThrow();
  });
});

// ─── Houdini .lut Parser Tests ───────────────────────────────────────

describe('Houdini .lut Parser', () => {
  it('LHDN-001: parses valid 1D channel LUT (Type C)', () => {
    const content = createIdentityHoudini1D(256);
    const lut = parseHoudiniLUT(content);

    expect(lut.size).toBe(256);
    expect(isLUT1D(lut)).toBe(true);
  });

  it('LHDN-002: parses valid 3D LUT (Type 3D)', () => {
    const content = createIdentityHoudini3D(4);
    const lut = parseHoudiniLUT(content);

    expect(lut.size).toBe(4);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('LHDN-003: parses From/To range into domain', () => {
    const content = createIdentityHoudini1D(16).replace(
      'From\t\t0.000000 1.000000',
      'From\t\t0.100000 0.900000'
    );
    const lut = parseHoudiniLUT(content);

    expect(lut.domainMin[0]).toBeCloseTo(0.1);
    expect(lut.domainMax[0]).toBeCloseTo(0.9);
  });

  it('LHDN-004: extracts data from brace-delimited arrays', () => {
    const content = createIdentityHoudini1D(16);
    const lut = parseHoudiniLUT(content);
    expect(lut.data.length).toBe(16 * 3);
  });

  it('LHDN-005: parses per-channel R/G/B arrays for 1D type', () => {
    const content = createIdentityHoudini1D(8);
    const lut = parseHoudiniLUT(content);

    if (!isLUT1D(lut)) throw new Error('Expected 1D LUT');

    // First entry
    expect(lut.data[0]).toBeCloseTo(0.0);
    expect(lut.data[1]).toBeCloseTo(0.0);
    expect(lut.data[2]).toBeCloseTo(0.0);

    // Last entry
    const lastIdx = (lut.size - 1) * 3;
    expect(lut.data[lastIdx]).toBeCloseTo(1.0);
    expect(lut.data[lastIdx + 1]).toBeCloseTo(1.0);
    expect(lut.data[lastIdx + 2]).toBeCloseTo(1.0);
  });

  it('LHDN-006: parses triplet braces for 3D type', () => {
    const content = createIdentityHoudini3D(2);
    const lut = parseHoudiniLUT(content);
    expect(lut.data.length).toBe(2 * 2 * 2 * 3);
  });

  it('LHDN-007: identity 1D LUT produces no visible change', () => {
    const content = createIdentityHoudini1D(256);
    const lut = parseHoudiniLUT(content);

    if (!isLUT1D(lut)) throw new Error('Expected 1D LUT');

    const result = applyLUT1D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('LHDN-008: identity 3D LUT produces no visible change', () => {
    const content = createIdentityHoudini3D(4);
    const lut = parseHoudiniLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('LHDN-009: throws on missing LUT: marker', () => {
    const content = [
      'Version\t\t3',
      'Format\t\tany',
      'Type\t\tC',
      'Length\t\t4',
      // Missing LUT: marker
    ].join('\n');

    expect(() => parseHoudiniLUT(content)).toThrow('Missing "LUT:" marker');
  });
});

// ─── Nuke .nk Parser Tests ──────────────────────────────────────────

describe('Nuke .nk Parser', () => {
  it('LNUK-001: parses valid Vectorfield node format', () => {
    const content = createIdentityNukeVectorfield(4);
    const lut = parseNukeLUT(content);

    expect(lut.size).toBe(4);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('LNUK-002: parses exported plain text format with # comments', () => {
    const content = createIdentityNukeExported(4);
    const lut = parseNukeLUT(content);

    expect(lut.size).toBe(4);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('LNUK-003: extracts cube_size from node', () => {
    const content = createIdentityNukeVectorfield(8);
    const lut = parseNukeLUT(content);
    expect(lut.size).toBe(8);
  });

  it('LNUK-004: extracts input_min / input_max from comments', () => {
    const lines = [
      '# cube_size 2',
      '# input_min 0.1 0.2 0.3',
      '# input_max 0.9 0.8 0.7',
    ];
    // Add 8 data lines for size 2
    for (let i = 0; i < 8; i++) {
      lines.push('0.5 0.5 0.5');
    }
    const lut = parseNukeLUT(lines.join('\n'));

    expect(lut.domainMin[0]).toBeCloseTo(0.1);
    expect(lut.domainMin[1]).toBeCloseTo(0.2);
    expect(lut.domainMin[2]).toBeCloseTo(0.3);
    expect(lut.domainMax[0]).toBeCloseTo(0.9);
    expect(lut.domainMax[1]).toBeCloseTo(0.8);
    expect(lut.domainMax[2]).toBeCloseTo(0.7);
  });

  it('LNUK-005: reorders data from R-fastest to B-fastest', () => {
    const content = createIdentityNukeExported(4);
    const lut = parseNukeLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('LNUK-006: identity LUT produces no visible change', () => {
    const content = createIdentityNukeExported(4);
    const lut = parseNukeLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.25, 0.5, 0.75);
    expect(result[0]).toBeCloseTo(0.25, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.75, 1);
  });

  it('LNUK-007: throws on malformed Vectorfield syntax', () => {
    const content = 'Vectorfield {\n no cube_size here\n}';
    expect(() => parseNukeLUT(content)).toThrow();
  });
});

// ─── Pandora .mga Parser Tests ──────────────────────────────────────

describe('Pandora .mga Parser', () => {
  it('LMGA-001: parses valid .mga file with explicit headers', () => {
    const content = createIdentityMGA(4);
    const lut = parseMGALUT(content);

    expect(lut.size).toBe(4);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('LMGA-002: verifies MGA magic header', () => {
    const content = createIdentityMGA(2);
    expect(() => parseMGALUT(content)).not.toThrow();
  });

  it('LMGA-003: throws on missing magic header', () => {
    expect(() => parseMGALUT('INVALID\nLUT_TYPE 3D\n')).toThrow('MGA: Missing MGA magic header');
  });

  it('LMGA-004: normalizes integers by output bit depth', () => {
    const content = createIdentityMGA(2);
    const lut = parseMGALUT(content);

    for (let i = 0; i < lut.data.length; i++) {
      expect(lut.data[i]).toBeGreaterThanOrEqual(0);
      expect(lut.data[i]).toBeLessThanOrEqual(1);
    }
  });

  it('LMGA-006: reorders data from R-fastest to B-fastest', () => {
    const content = createIdentityMGA(4);
    const lut = parseMGALUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('LMGA-007: identity LUT produces no visible change', () => {
    const content = createIdentityMGA(4);
    const lut = parseMGALUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.25, 0.5, 0.75);
    expect(result[0]).toBeCloseTo(0.25, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.75, 1);
  });

  it('LMGA-008: handles 10-bit output depth', () => {
    const size = 2;
    const maxOut = 1023;
    const lines: string[] = [
      'MGA',
      'LUT_TYPE 3D',
      `LUT_SIZE ${size}`,
      'LUT_IN_BITDEPTH 10',
      'LUT_OUT_BITDEPTH 10',
    ];
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const rv = Math.round((r / (size - 1)) * maxOut);
          const gv = Math.round((g / (size - 1)) * maxOut);
          const bv = Math.round((b / (size - 1)) * maxOut);
          lines.push(`${rv} ${gv} ${bv}`);
        }
      }
    }
    const lut = parseMGALUT(lines.join('\n'));

    for (let i = 0; i < lut.data.length; i++) {
      expect(lut.data[i]).toBeGreaterThanOrEqual(0);
      expect(lut.data[i]).toBeLessThanOrEqual(1);
    }
  });
});

// ─── RV 3D LUT Parser Tests ────────────────────────────────────────

describe('RV 3D LUT Parser', () => {
  it('LRV3-001: parses valid RV3DLUT file', () => {
    const content = createIdentityRV3D(4);
    const lut = parseRV3DLUT(content);

    expect(lut.size).toBe(4);
    expect(lut.data.length).toBe(4 * 4 * 4 * 3);
  });

  it('LRV3-002: verifies RV3DLUT magic header', () => {
    const content = createIdentityRV3D(2);
    expect(() => parseRV3DLUT(content)).not.toThrow();
  });

  it('LRV3-003: throws on missing magic header', () => {
    expect(() => parseRV3DLUT('INVALID\nsize 2\n')).toThrow('RV3DLUT: Missing RV3DLUT magic header');
  });

  it('LRV3-004: parses domain_min / domain_max', () => {
    const content = createIdentityRV3D(2)
      .replace('domain_min 0.0 0.0 0.0', 'domain_min 0.1 0.2 0.3')
      .replace('domain_max 1.0 1.0 1.0', 'domain_max 0.9 0.8 0.7');

    const lut = parseRV3DLUT(content);

    expect(lut.domainMin[0]).toBeCloseTo(0.1);
    expect(lut.domainMin[1]).toBeCloseTo(0.2);
    expect(lut.domainMin[2]).toBeCloseTo(0.3);
    expect(lut.domainMax[0]).toBeCloseTo(0.9);
    expect(lut.domainMax[1]).toBeCloseTo(0.8);
    expect(lut.domainMax[2]).toBeCloseTo(0.7);
  });

  it('LRV3-005: uses default domain when not specified', () => {
    const lines: string[] = ['RV3DLUT', 'size 2', 'data:'];
    for (let r = 0; r < 2; r++) {
      for (let g = 0; g < 2; g++) {
        for (let b = 0; b < 2; b++) {
          lines.push(`${r.toFixed(1)} ${g.toFixed(1)} ${b.toFixed(1)}`);
        }
      }
    }
    const lut = parseRV3DLUT(lines.join('\n'));

    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([1, 1, 1]);
  });

  it('LRV3-006: does not reorder (already B-fastest)', () => {
    const content = createIdentityRV3D(4);
    const lut = parseRV3DLUT(content);

    // The data should directly correspond to B-fastest indexing
    // First entry: r=0, g=0, b=0 -> (0,0,0)
    expect(lut.data[0]).toBeCloseTo(0);
    expect(lut.data[1]).toBeCloseTo(0);
    expect(lut.data[2]).toBeCloseTo(0);
  });

  it('LRV3-007: identity LUT produces no visible change', () => {
    const content = createIdentityRV3D(4);
    const lut = parseRV3DLUT(content);

    const result = applyLUT3D(lut, 0.25, 0.5, 0.75);
    expect(result[0]).toBeCloseTo(0.25, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.75, 1);
  });

  it('LRV3-008: throws on wrong data count', () => {
    const content = [
      'RV3DLUT',
      'size 2',
      'data:',
      '0.0 0.0 0.0',
      '1.0 1.0 1.0',
      // Missing 6 entries
    ].join('\n');

    expect(() => parseRV3DLUT(content)).toThrow('Expected 8 data entries, got 2');
  });

  it('LRV3-009: result passes isLUT3D check', () => {
    const content = createIdentityRV3D(2);
    const lut = parseRV3DLUT(content);

    expect(isLUT3D(lut)).toBe(true);
    expect(isLUT1D(lut)).toBe(false);
  });
});

// ─── RV Channel LUT Parser Tests ───────────────────────────────────

describe('RV Channel LUT Parser', () => {
  it('LRVC-001: parses valid interleaved format', () => {
    const content = createIdentityRVChannel(256);
    const lut = parseRVChannelLUT(content);

    expect(lut.size).toBe(256);
    expect(isLUT1D(lut)).toBe(true);
  });

  it('LRVC-002: parses valid per-channel format (red:/green:/blue:)', () => {
    const content = createIdentityRVChannelPerChannel(64);
    const lut = parseRVChannelLUT(content);

    expect(lut.size).toBe(64);
    expect(isLUT1D(lut)).toBe(true);
  });

  it('LRVC-003: verifies RVCHANNELLUT magic header', () => {
    const content = createIdentityRVChannel(16);
    expect(() => parseRVChannelLUT(content)).not.toThrow();
  });

  it('LRVC-004: throws on missing magic header', () => {
    expect(() => parseRVChannelLUT('INVALID\nsize 16\n')).toThrow('RVCHANNELLUT: Missing RVCHANNELLUT magic header');
  });

  it('LRVC-005: parses domain_min / domain_max', () => {
    const content = createIdentityRVChannel(16)
      .replace('domain_min 0.0 0.0 0.0', 'domain_min 0.1 0.2 0.3')
      .replace('domain_max 1.0 1.0 1.0', 'domain_max 0.9 0.8 0.7');

    const lut = parseRVChannelLUT(content);

    expect(lut.domainMin[0]).toBeCloseTo(0.1);
    expect(lut.domainMin[1]).toBeCloseTo(0.2);
    expect(lut.domainMin[2]).toBeCloseTo(0.3);
    expect(lut.domainMax[0]).toBeCloseTo(0.9);
    expect(lut.domainMax[1]).toBeCloseTo(0.8);
    expect(lut.domainMax[2]).toBeCloseTo(0.7);
  });

  it('LRVC-006: uses default domain when not specified', () => {
    const lines = [
      'RVCHANNELLUT',
      'size 4',
      'channels 3',
      'data:',
      '0.0 0.0 0.0',
      '0.333 0.333 0.333',
      '0.666 0.666 0.666',
      '1.0 1.0 1.0',
    ];
    const lut = parseRVChannelLUT(lines.join('\n'));

    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([1, 1, 1]);
  });

  it('LRVC-007: identity LUT produces no visible change', () => {
    const content = createIdentityRVChannel(256);
    const lut = parseRVChannelLUT(content);

    const result = applyLUT1D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('LRVC-008: result passes isLUT1D check', () => {
    const content = createIdentityRVChannel(16);
    const lut = parseRVChannelLUT(content);

    expect(isLUT1D(lut)).toBe(true);
    expect(isLUT3D(lut)).toBe(false);
  });

  it('LRVC-009: each channel is processed independently', () => {
    // Create a channel LUT with different curves per channel
    const lines = [
      'RVCHANNELLUT',
      'size 4',
      'channels 3',
      'data:',
      '0.0 0.0 0.0',
      '0.5 0.25 0.75',
      '0.75 0.5 0.5',
      '1.0 1.0 1.0',
    ];
    const lut = parseRVChannelLUT(lines.join('\n'));

    // Verify that the data has different values per channel at index 1
    expect(lut.data[3]).toBeCloseTo(0.5);   // R at index 1
    expect(lut.data[4]).toBeCloseTo(0.25);  // G at index 1
    expect(lut.data[5]).toBeCloseTo(0.75);  // B at index 1
  });

  it('LRVC-010: throws on wrong data count', () => {
    const lines = [
      'RVCHANNELLUT',
      'size 8',
      'channels 3',
      'data:',
      '0.0 0.0 0.0',
      '1.0 1.0 1.0',
      // Missing 6 entries
    ];
    expect(() => parseRVChannelLUT(lines.join('\n'))).toThrow('Expected 8 data entries, got 2');
  });
});
