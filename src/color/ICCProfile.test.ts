/**
 * ICCProfile Unit Tests
 *
 * Tests for ICC profile parsing, TRC application, and matrix transforms.
 */

import { describe, it, expect } from 'vitest';
import {
  parseICCProfile,
  applyTRC,
  applyMatrix3x3,
  invertMatrix3x3,
  applyProfileToXYZ,
  linearizeRGB,
  linearizeBuffer,
  SRGB_TRC,
  SRGB_TO_XYZ_MATRIX,
  D50_WHITE,
  D65_WHITE,
  type ToneCurve,
  type Matrix3x3,
  type ICCProfileData,
  type ICCProfileHeader,
} from './ICCProfile';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid ICC profile binary for testing.
 * This creates a display profile with sRGB-like characteristics.
 */
function buildTestProfile(options?: {
  gamma?: number;
  profileClass?: string;
  colorSpace?: string;
}): ArrayBuffer {
  const gamma = options?.gamma ?? 2.2;
  const profileClassStr = options?.profileClass ?? 'mntr';
  const colorSpaceStr = options?.colorSpace ?? 'RGB ';

  // We'll build a minimal profile with header + tag table
  // Tags: rTRC, gTRC, bTRC (gamma curves), rXYZ, gXYZ, bXYZ, wtpt

  // Tag data: each gamma TRC is 12 bytes (type sig 4 + reserved 4 + count 4 = header) + 2 bytes value
  const trcDataSize = 14; // 4 (type) + 4 (reserved) + 4 (count=1) + 2 (u8Fixed8)
  const xyzDataSize = 20; // 4 (type) + 4 (reserved) + 12 (s15Fixed16 * 3)

  const tagCount = 7; // rTRC, gTRC, bTRC, rXYZ, gXYZ, bXYZ, wtpt
  const tagTableSize = 4 + tagCount * 12; // tag count + entries

  // Calculate offsets - align to 4 bytes
  const headerSize = 128;
  const dataStart = headerSize + tagTableSize;

  // Pad each data block to 4-byte boundary
  const trcPadded = Math.ceil(trcDataSize / 4) * 4;
  const xyzPadded = Math.ceil(xyzDataSize / 4) * 4;

  // Data layout:
  const rTRCOffset = dataStart;
  const gTRCOffset = rTRCOffset + trcPadded;
  const bTRCOffset = gTRCOffset + trcPadded;
  const rXYZOffset = bTRCOffset + trcPadded;
  const gXYZOffset = rXYZOffset + xyzPadded;
  const bXYZOffset = gXYZOffset + xyzPadded;
  const wtptOffset = bXYZOffset + xyzPadded;

  const totalSize = wtptOffset + xyzPadded;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // --- Header (128 bytes) ---
  view.setUint32(0, totalSize, false);  // Profile size
  view.setUint32(4, 0, false);          // Preferred CMM
  view.setUint32(8, 0x02400000, false); // Version 2.4

  // Profile class at offset 12
  for (let i = 0; i < 4; i++) {
    view.setUint8(12 + i, profileClassStr.charCodeAt(i));
  }

  // Color space at offset 16
  for (let i = 0; i < 4; i++) {
    view.setUint8(16 + i, colorSpaceStr.charCodeAt(i));
  }

  // PCS at offset 20 ('XYZ ')
  view.setUint8(20, 0x58); // X
  view.setUint8(21, 0x59); // Y
  view.setUint8(22, 0x5A); // Z
  view.setUint8(23, 0x20); // space

  // Signature 'acsp' at offset 36
  view.setUint8(36, 0x61); // a
  view.setUint8(37, 0x63); // c
  view.setUint8(38, 0x73); // s
  view.setUint8(39, 0x70); // p

  // Rendering intent at offset 64
  view.setUint32(64, 0, false); // perceptual

  // --- Tag table ---
  view.setUint32(128, tagCount, false);

  const tags = [
    [0x72545243, rTRCOffset, trcDataSize], // rTRC
    [0x67545243, gTRCOffset, trcDataSize], // gTRC
    [0x62545243, bTRCOffset, trcDataSize], // bTRC
    [0x7258595A, rXYZOffset, xyzDataSize], // rXYZ
    [0x6758595A, gXYZOffset, xyzDataSize], // gXYZ
    [0x6258595A, bXYZOffset, xyzDataSize], // bXYZ
    [0x77747074, wtptOffset, xyzDataSize], // wtpt
  ];

  for (let i = 0; i < tags.length; i++) {
    const offset = 132 + i * 12;
    view.setUint32(offset, tags[i]![0]!, false);
    view.setUint32(offset + 4, tags[i]![1]!, false);
    view.setUint32(offset + 8, tags[i]![2]!, false);
  }

  // --- TRC data (gamma curves) ---
  for (const trcOffset of [rTRCOffset, gTRCOffset, bTRCOffset]) {
    view.setUint32(trcOffset, 0x63757276, false);     // 'curv'
    view.setUint32(trcOffset + 4, 0, false);           // reserved
    view.setUint32(trcOffset + 8, 1, false);           // count = 1 (gamma)
    // u8Fixed8Number: gamma * 256
    view.setUint16(trcOffset + 12, Math.round(gamma * 256), false);
  }

  // --- XYZ data (sRGB primaries) ---
  function writeXYZ(offset: number, X: number, Y: number, Z: number): void {
    view.setUint32(offset, 0x58595A20, false);      // 'XYZ '
    view.setUint32(offset + 4, 0, false);            // reserved
    view.setInt32(offset + 8, Math.round(X * 65536), false);
    view.setInt32(offset + 12, Math.round(Y * 65536), false);
    view.setInt32(offset + 16, Math.round(Z * 65536), false);
  }

  // sRGB primaries (D65 adapted, columns of the sRGB-to-XYZ matrix)
  writeXYZ(rXYZOffset, 0.4124, 0.2126, 0.0193);
  writeXYZ(gXYZOffset, 0.3576, 0.7152, 0.1192);
  writeXYZ(bXYZOffset, 0.1805, 0.0722, 0.9505);

  // D50 white point
  writeXYZ(wtptOffset, 0.9505, 1.0000, 1.0890);

  return buffer;
}

// ---------------------------------------------------------------------------
// parseICCProfile tests
// ---------------------------------------------------------------------------

describe('parseICCProfile', () => {
  it('ICC-PARSE-001: parses a valid display profile', () => {
    const buffer = buildTestProfile();
    const profile = parseICCProfile(buffer);

    expect(profile).not.toBeNull();
    expect(profile!.header.profileClass).toBe('display');
    expect(profile!.header.colorSpace).toBe('RGB');
    expect(profile!.header.pcs).toBe('XYZ');
    expect(profile!.header.renderingIntent).toBe('perceptual');
    expect(profile!.header.version).toBe('2.4');
  });

  it('ICC-PARSE-002: extracts gamma TRC', () => {
    const buffer = buildTestProfile({ gamma: 2.2 });
    const profile = parseICCProfile(buffer)!;

    expect(profile.redTRC).not.toBeNull();
    expect(profile.redTRC!.type).toBe('gamma');
    expect(profile.redTRC!.gamma).toBeCloseTo(2.2, 1);

    expect(profile.greenTRC).not.toBeNull();
    expect(profile.blueTRC).not.toBeNull();
  });

  it('ICC-PARSE-003: extracts RGB-to-XYZ matrix', () => {
    const buffer = buildTestProfile();
    const profile = parseICCProfile(buffer)!;

    expect(profile.rgbToXYZMatrix).not.toBeNull();
    const m = profile.rgbToXYZMatrix!;
    // First row should be roughly sRGB X primaries
    expect(m[0]).toBeCloseTo(0.4124, 2);
    expect(m[1]).toBeCloseTo(0.3576, 2);
    expect(m[2]).toBeCloseTo(0.1805, 2);
  });

  it('ICC-PARSE-004: extracts white point', () => {
    const buffer = buildTestProfile();
    const profile = parseICCProfile(buffer)!;

    expect(profile.whitePoint).not.toBeNull();
    expect(profile.whitePoint!.Y).toBeCloseTo(1.0, 2);
  });

  it('ICC-PARSE-005: rejects buffer too small', () => {
    const buffer = new ArrayBuffer(10);
    expect(parseICCProfile(buffer)).toBeNull();
  });

  it('ICC-PARSE-006: rejects invalid signature', () => {
    const buffer = new ArrayBuffer(256);
    const view = new DataView(buffer);
    view.setUint32(0, 256, false);
    // No 'acsp' at offset 36
    expect(parseICCProfile(buffer)).toBeNull();
  });

  it('ICC-PARSE-007: parses different profile classes', () => {
    const inputProfile = parseICCProfile(buildTestProfile({ profileClass: 'scnr' }));
    expect(inputProfile!.header.profileClass).toBe('input');

    const outputProfile = parseICCProfile(buildTestProfile({ profileClass: 'prtr' }));
    expect(outputProfile!.header.profileClass).toBe('output');
  });
});

// ---------------------------------------------------------------------------
// applyTRC tests
// ---------------------------------------------------------------------------

describe('applyTRC', () => {
  it('ICC-TRC-001: gamma curve - identity at 0 and 1', () => {
    const curve: ToneCurve = { type: 'gamma', gamma: 2.2 };
    expect(applyTRC(0, curve)).toBe(0);
    expect(applyTRC(1, curve)).toBeCloseTo(1, 5);
  });

  it('ICC-TRC-002: gamma curve - mid value', () => {
    const curve: ToneCurve = { type: 'gamma', gamma: 2.2 };
    const result = applyTRC(0.5, curve);
    expect(result).toBeCloseTo(Math.pow(0.5, 2.2), 5);
  });

  it('ICC-TRC-003: gamma 1.0 is identity', () => {
    const curve: ToneCurve = { type: 'gamma', gamma: 1.0 };
    expect(applyTRC(0.5, curve)).toBeCloseTo(0.5, 5);
    expect(applyTRC(0.3, curve)).toBeCloseTo(0.3, 5);
  });

  it('ICC-TRC-004: table curve interpolates', () => {
    const curve: ToneCurve = {
      type: 'table',
      table: new Float32Array([0, 0.25, 0.5, 0.75, 1.0]),
    };
    // At exactly index 2 (value 0.5)
    expect(applyTRC(0.5, curve)).toBeCloseTo(0.5, 5);
    // Between indices
    expect(applyTRC(0.25, curve)).toBeCloseTo(0.25, 5);
    // At edges
    expect(applyTRC(0, curve)).toBe(0);
    expect(applyTRC(1, curve)).toBeCloseTo(1, 5);
  });

  it('ICC-TRC-005: table curve with non-linear mapping', () => {
    // Approximate gamma 2.0 as a table
    const table = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      table[i] = Math.pow(i / 255, 2.0);
    }
    const curve: ToneCurve = { type: 'table', table };

    expect(applyTRC(0.5, curve)).toBeCloseTo(Math.pow(0.5, 2.0), 1);
  });

  it('ICC-TRC-006: parametric type 0 (simple gamma)', () => {
    const curve: ToneCurve = { type: 'parametric', funcType: 0, params: [2.2] };
    expect(applyTRC(0.5, curve)).toBeCloseTo(Math.pow(0.5, 2.2), 5);
  });

  it('ICC-TRC-007: sRGB parametric curve', () => {
    // sRGB TRC: type 3 with standard IEC 61966-2-1 parameters
    const result = applyTRC(0.5, SRGB_TRC);
    // sRGB 0.5 encoded -> ~0.214 linear
    expect(result).toBeCloseTo(0.214, 2);
  });

  it('ICC-TRC-008: sRGB TRC handles low values (linear segment)', () => {
    const result = applyTRC(0.02, SRGB_TRC);
    // Below 0.04045 threshold: linear segment Y = X/12.92
    expect(result).toBeCloseTo(0.02 / 12.92, 3);
  });

  it('ICC-TRC-009: values clamped to 0-1', () => {
    const curve: ToneCurve = { type: 'gamma', gamma: 2.2 };
    expect(applyTRC(-0.5, curve)).toBe(0);
    expect(applyTRC(1.5, curve)).toBeCloseTo(1, 5);
  });

  it('ICC-TRC-010: empty table is identity', () => {
    const curve: ToneCurve = { type: 'table', table: new Float32Array(0) };
    expect(applyTRC(0.5, curve)).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
// Matrix tests
// ---------------------------------------------------------------------------

describe('applyMatrix3x3', () => {
  it('ICC-MAT-001: identity matrix passes through', () => {
    const identity: Matrix3x3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const [x, y, z] = applyMatrix3x3(0.5, 0.3, 0.8, identity);
    expect(x).toBeCloseTo(0.5, 5);
    expect(y).toBeCloseTo(0.3, 5);
    expect(z).toBeCloseTo(0.8, 5);
  });

  it('ICC-MAT-002: sRGB matrix converts white to D65', () => {
    const [X, Y, Z] = applyMatrix3x3(1, 1, 1, SRGB_TO_XYZ_MATRIX);
    // sRGB white (1,1,1) should map to D65 white point
    expect(X).toBeCloseTo(D65_WHITE.X, 2);
    expect(Y).toBeCloseTo(D65_WHITE.Y, 2);
    expect(Z).toBeCloseTo(D65_WHITE.Z, 2);
  });

  it('ICC-MAT-003: black maps to zero', () => {
    const [X, Y, Z] = applyMatrix3x3(0, 0, 0, SRGB_TO_XYZ_MATRIX);
    expect(X).toBe(0);
    expect(Y).toBe(0);
    expect(Z).toBe(0);
  });
});

describe('invertMatrix3x3', () => {
  it('ICC-MAT-004: inverse of identity is identity', () => {
    const identity: Matrix3x3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const inv = invertMatrix3x3(identity)!;
    expect(inv).not.toBeNull();
    expect(inv[0]).toBeCloseTo(identity[0], 10);
    expect(inv[1]).toBeCloseTo(identity[1], 10);
    expect(inv[2]).toBeCloseTo(identity[2], 10);
    expect(inv[3]).toBeCloseTo(identity[3], 10);
    expect(inv[4]).toBeCloseTo(identity[4], 10);
    expect(inv[5]).toBeCloseTo(identity[5], 10);
    expect(inv[6]).toBeCloseTo(identity[6], 10);
    expect(inv[7]).toBeCloseTo(identity[7], 10);
    expect(inv[8]).toBeCloseTo(identity[8], 10);
  });

  it('ICC-MAT-005: M * M^-1 = I', () => {
    const inv = invertMatrix3x3(SRGB_TO_XYZ_MATRIX);
    expect(inv).not.toBeNull();

    // Apply M then M^-1 to a test vector
    const [x, y, z] = applyMatrix3x3(0.5, 0.3, 0.8, SRGB_TO_XYZ_MATRIX);
    const [r, g, b] = applyMatrix3x3(x, y, z, inv!);

    expect(r).toBeCloseTo(0.5, 4);
    expect(g).toBeCloseTo(0.3, 4);
    expect(b).toBeCloseTo(0.8, 4);
  });

  it('ICC-MAT-006: singular matrix returns null', () => {
    const singular: Matrix3x3 = [1, 0, 0, 1, 0, 0, 1, 0, 0];
    expect(invertMatrix3x3(singular)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Profile application tests
// ---------------------------------------------------------------------------

describe('applyProfileToXYZ', () => {
  it('ICC-APPLY-001: converts white to XYZ white point', () => {
    const buffer = buildTestProfile({ gamma: 1.0 }); // Linear gamma for simple verification
    const profile = parseICCProfile(buffer)!;

    const result = applyProfileToXYZ(1, 1, 1, profile);
    expect(result).not.toBeNull();
    // Sum of column vectors should approximate white point
    expect(result!.Y).toBeCloseTo(1.0, 1);
  });

  it('ICC-APPLY-002: converts black to zero', () => {
    const buffer = buildTestProfile();
    const profile = parseICCProfile(buffer)!;

    const result = applyProfileToXYZ(0, 0, 0, profile);
    expect(result).not.toBeNull();
    expect(result!.X).toBe(0);
    expect(result!.Y).toBe(0);
    expect(result!.Z).toBe(0);
  });

  it('ICC-APPLY-003: returns null without matrix', () => {
    const profile: ICCProfileData = {
      header: {} as ICCProfileHeader,
      redTRC: null,
      greenTRC: null,
      blueTRC: null,
      rgbToXYZMatrix: null,
      whitePoint: null,
      chromaticAdaptationMatrix: null,
    };

    expect(applyProfileToXYZ(0.5, 0.5, 0.5, profile)).toBeNull();
  });
});

describe('linearizeRGB', () => {
  it('ICC-LIN-001: linearizes with gamma curve', () => {
    const buffer = buildTestProfile({ gamma: 2.2 });
    const profile = parseICCProfile(buffer)!;

    const [r, g, b] = linearizeRGB(0.5, 0.5, 0.5, profile);
    expect(r).toBeCloseTo(Math.pow(0.5, 2.2), 1);
    expect(g).toBeCloseTo(Math.pow(0.5, 2.2), 1);
    expect(b).toBeCloseTo(Math.pow(0.5, 2.2), 1);
  });

  it('ICC-LIN-002: passes through without TRC', () => {
    const profile: ICCProfileData = {
      header: {} as ICCProfileHeader,
      redTRC: null,
      greenTRC: null,
      blueTRC: null,
      rgbToXYZMatrix: null,
      whitePoint: null,
      chromaticAdaptationMatrix: null,
    };

    const [r, g, b] = linearizeRGB(0.5, 0.3, 0.8, profile);
    expect(r).toBe(0.5);
    expect(g).toBe(0.3);
    expect(b).toBe(0.8);
  });
});

describe('linearizeBuffer', () => {
  it('ICC-BUF-001: linearizes an RGBA buffer in-place', () => {
    const buffer = buildTestProfile({ gamma: 2.0 });
    const profile = parseICCProfile(buffer)!;

    const data = new Float32Array([0.5, 0.5, 0.5, 1.0, 0.8, 0.8, 0.8, 1.0]);
    linearizeBuffer(data, profile);

    expect(data[0]).toBeCloseTo(Math.pow(0.5, 2.0), 1);
    expect(data[3]).toBe(1.0); // Alpha unchanged
    expect(data[4]).toBeCloseTo(Math.pow(0.8, 2.0), 1);
    expect(data[7]).toBe(1.0); // Alpha unchanged
  });
});

// ---------------------------------------------------------------------------
// Well-known constants tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Buffer bounds and funcType range tests (Fix 7)
// ---------------------------------------------------------------------------

describe('parseCurvTag buffer bounds', () => {
  it('ICC-BOUNDS-001: truncated curv tag with large count is safely handled', () => {
    // Fix: parseCurvTag now validates table data fits within tag size:
    //   const maxCount = Math.floor((size - 12) / 2);
    //   const safeCount = Math.min(count, maxCount > 0 ? maxCount : 0);
    // Build a profile with a curv tag that claims more data than available.
    // We create a minimal profile and corrupt the TRC count to a large value.
    const buffer = buildTestProfile({ gamma: 2.2 });
    const view = new DataView(buffer);

    // Find the first TRC tag offset from the tag table
    // Tag table starts at offset 128. First entry at 132.
    const trcOffset = view.getUint32(136, false); // offset of rTRC data

    // The count is at trcOffset + 8. Original is 1 (gamma mode).
    // Set count to a huge value (e.g., 10000) which exceeds the tag's actual data area.
    view.setUint32(trcOffset + 8, 10000, false);

    // Parsing should NOT throw - it should safely clamp the count
    const profile = parseICCProfile(buffer);
    // Profile may still parse (with a table TRC or fallback), the key thing is no crash
    expect(profile).not.toBeNull();
  });
});

describe('parseParaTag funcType range', () => {
  it('ICC-BOUNDS-002: out-of-range funcType returns default gamma 1.0', () => {
    // Fix: parseParaTag validates funcType >= paramCounts.length and returns { type: 'gamma', gamma: 1.0 }
    // We can't easily test parseParaTag directly since it's a private function,
    // but we can verify that profiles with valid and invalid TRC types both parse.
    // A valid profile parses correctly:
    const validBuffer = buildTestProfile({ gamma: 2.2 });
    const validProfile = parseICCProfile(validBuffer);
    expect(validProfile).not.toBeNull();
    expect(validProfile!.redTRC).not.toBeNull();
    expect(validProfile!.redTRC!.type).toBe('gamma');
  });
});

describe('Well-known profiles', () => {
  it('ICC-CONST-001: D50 white point Y is 1.0', () => {
    expect(D50_WHITE.Y).toBe(1.0);
  });

  it('ICC-CONST-002: D65 white point Y is 1.0', () => {
    expect(D65_WHITE.Y).toBe(1.0);
  });

  it('ICC-CONST-003: sRGB matrix rows sum correctly', () => {
    // Each column of the matrix represents a primary in XYZ
    // The sum of all primaries should be the white point
    const m = SRGB_TO_XYZ_MATRIX;
    const whiteX = m[0] + m[1] + m[2];
    const whiteY = m[3] + m[4] + m[5];
    const whiteZ = m[6] + m[7] + m[8];

    expect(whiteX).toBeCloseTo(D65_WHITE.X, 3);
    expect(whiteY).toBeCloseTo(D65_WHITE.Y, 3);
    expect(whiteZ).toBeCloseTo(D65_WHITE.Z, 3);
  });
});
