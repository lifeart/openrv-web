/**
 * JXLDecoder Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isJXLFile, isJXLContainer, decodeJXL, parseJXLColorSpace, mapCICPToColorSpace } from './JXLDecoder';

// ---------------------------------------------------------------------------
// Helpers for building synthetic JXL buffers
// ---------------------------------------------------------------------------

/** Minimal bit writer (LSB-first within each byte, matching JXL encoding). */
class BitWriter {
  private bytes: number[] = [];
  private currentByte = 0;
  private bitPos = 0;

  writeBits(value: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if ((value >>> i) & 1) {
        this.currentByte |= 1 << this.bitPos;
      }
      this.bitPos++;
      if (this.bitPos === 8) {
        this.bytes.push(this.currentByte);
        this.currentByte = 0;
        this.bitPos = 0;
      }
    }
  }

  writeBool(v: boolean): void {
    this.writeBits(v ? 1 : 0, 1);
  }

  /** Write a JXL Enum value using the standard U32 enum distribution. */
  writeEnum(value: number): void {
    // Enum distribution: [0,0], [1,0], [2,4], [18,6]
    if (value === 0) {
      this.writeBits(0, 2); // selector 0
    } else if (value === 1) {
      this.writeBits(1, 2); // selector 1
    } else if (value >= 2 && value < 18) {
      this.writeBits(2, 2); // selector 2
      this.writeBits(value - 2, 4);
    } else {
      this.writeBits(3, 2); // selector 3
      this.writeBits(value - 18, 6);
    }
  }

  toUint8Array(): Uint8Array {
    const result = [...this.bytes];
    if (this.bitPos > 0) {
      result.push(this.currentByte);
    }
    return new Uint8Array(result);
  }
}

/**
 * Build a bare JXL codestream with specific colour_encoding fields.
 *
 * @param opts.allDefault - If true, ImageMetadata.all_default = true (→ sRGB)
 * @param opts.ceAllDefault - If true, colour_encoding.all_default = true (→ sRGB)
 * @param opts.wantICC - If true, colour_encoding.want_icc = true (→ ICC profile)
 * @param opts.colourSpace - 0=RGB, 1=Grey, 2=XYB, 3=Unknown (default 0)
 * @param opts.primaries - JXL primaries enum (1=sRGB, 3=BT.2020, 4=P3)
 * @param opts.transfer - JXL transfer enum (1=709, 3=linear, 8=sRGB, 13=PQ, 17=HLG)
 */
function buildCodestream(opts: {
  allDefault?: boolean;
  ceAllDefault?: boolean;
  wantICC?: boolean;
  colourSpace?: number;
  primaries?: number;
  transfer?: number;
  /** Extra channels to include. Each entry is { type: number } where type is the JXL enum value (0=kAlpha, 1=kDepth, etc.). */
  extraChannels?: Array<{ type: number }>;
} = {}): ArrayBuffer {
  const w = new BitWriter();

  // Signature: 0xFF 0x0A
  w.writeBits(0xff, 8);
  w.writeBits(0x0a, 8);

  // SizeHeader — use "small" form: 8×8 image, ratio=1 (1:1 square)
  w.writeBool(true); // small = true
  w.writeBits(7, 5); // height_m1 = 7 → height = 8 (shifted by +1 per spec)
  w.writeBits(1, 3); // ratio = 1 (width = height)

  // ImageMetadata
  if (opts.allDefault) {
    w.writeBool(true); // all_default
    return w.toUint8Array().buffer as ArrayBuffer;
  }

  w.writeBool(false); // all_default = false

  // extra_fields = false (no orientation, animation, preview, etc.)
  w.writeBool(false);

  // BitDepth: float_sample = false, bits_per_sample = 8 (selector 0)
  w.writeBool(false); // float_sample
  w.writeBits(0, 2); // selector 0 → 8 bps

  // num_extra_channels: U32(0,1,2+u(4),12+u(8))
  const extraChannels = opts.extraChannels ?? [];
  if (extraChannels.length === 0) {
    w.writeBits(0, 2); // selector 0 → 0 extra channels
  } else if (extraChannels.length === 1) {
    w.writeBits(1, 2); // selector 1 → 1 extra channel
  } else {
    w.writeBits(2, 2); // selector 2 → 2+u(4)
    w.writeBits(extraChannels.length - 2, 4);
  }

  // Write ExtraChannelInfo for each extra channel
  for (const ec of extraChannels) {
    if (ec.type === 0) {
      // kAlpha with default settings: d_alpha = true (all-default alpha channel)
      w.writeBool(true); // d_alpha = true
    } else {
      // Non-alpha: d_alpha = false, write full ExtraChannelInfo
      w.writeBool(false); // d_alpha = false
      w.writeEnum(ec.type); // type enum
      // bit_depth: float_sample = false, bps = 8 (selector 0)
      w.writeBool(false);
      w.writeBits(0, 2); // selector 0 → 8 bps
      // dim_shift: U32(0, 3, 4, 1+u(3)) — selector 0 → 0
      w.writeBits(0, 2);
      // name_len: U32(0, u(4), 16+u(5), 48+u(10)) — selector 0 → 0
      w.writeBits(0, 2);
      // No alpha_associated for non-alpha types (no more fields to write)
    }
  }

  // colour_encoding
  if (opts.ceAllDefault) {
    w.writeBool(true); // all_default → sRGB
    return w.toUint8Array().buffer as ArrayBuffer;
  }

  w.writeBool(false); // all_default = false

  if (opts.wantICC) {
    w.writeBool(true); // want_icc
    return w.toUint8Array().buffer as ArrayBuffer;
  }

  w.writeBool(false); // want_icc = false

  // colour_space enum (default RGB=0)
  const colourSpace = opts.colourSpace ?? 0;
  w.writeEnum(colourSpace);

  // white_point enum: 0 = D65 (default)
  w.writeEnum(0);

  // primaries enum (only for RGB, colourSpace==0)
  if (colourSpace === 0) {
    const primaries = opts.primaries ?? 1;
    w.writeEnum(primaries);
  }

  // transfer function
  const transfer = opts.transfer ?? 8; // default sRGB
  w.writeBool(false); // use_gamma = false
  w.writeEnum(transfer);

  // rendering_intent enum: 0 = Relative
  w.writeEnum(0);

  return w.toUint8Array().buffer as ArrayBuffer;
}

/**
 * Build an ISOBMFF container with a colr(nclx) box.
 */
function buildContainerWithNclx(primaries: number, transfer: number): ArrayBuffer {
  // ftyp box (12 bytes): size(4) + 'ftyp'(4) + 'jxl '(4)
  // colr box (15 bytes): size(4) + 'colr'(4) + 'nclx'(4) + primaries(2) + transfer(2) + padding
  // Total nclx data: 4 (type) + 2 (primaries) + 2 (transfer) + 1 (matrix) + 1 (full_range) = 10 bytes
  // So colr box = 8 + 10 = 18 bytes
  const ftypSize = 12;
  const colrSize = 8 + 4 + 2 + 2 + 1 + 1; // 18
  const totalSize = ftypSize + colrSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // ftyp box
  view.setUint32(0, ftypSize, false);
  const ftyp = 'ftyp';
  for (let i = 0; i < 4; i++) view.setUint8(4 + i, ftyp.charCodeAt(i));
  const brand = 'jxl ';
  for (let i = 0; i < 4; i++) view.setUint8(8 + i, brand.charCodeAt(i));

  // colr box
  view.setUint32(ftypSize, colrSize, false);
  const colr = 'colr';
  for (let i = 0; i < 4; i++) view.setUint8(ftypSize + 4 + i, colr.charCodeAt(i));
  const nclx = 'nclx';
  for (let i = 0; i < 4; i++) view.setUint8(ftypSize + 8 + i, nclx.charCodeAt(i));
  view.setUint16(ftypSize + 12, primaries, false);
  view.setUint16(ftypSize + 14, transfer, false);
  view.setUint8(ftypSize + 16, 0); // matrix_coefficients
  view.setUint8(ftypSize + 17, 0x80); // full_range_flag

  return buffer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JXLDecoder', () => {
  describe('isJXLFile', () => {
    it('should detect JXL codestream magic (0xFF 0x0A)', () => {
      const buffer = new ArrayBuffer(2);
      const view = new Uint8Array(buffer);
      view[0] = 0xff;
      view[1] = 0x0a;
      expect(isJXLFile(buffer)).toBe(true);
    });

    it('should detect JXL ISOBMFF container (ftyp + jxl brand)', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 12, false);
      view.setUint8(4, 'f'.charCodeAt(0));
      view.setUint8(5, 't'.charCodeAt(0));
      view.setUint8(6, 'y'.charCodeAt(0));
      view.setUint8(7, 'p'.charCodeAt(0));
      view.setUint8(8, 'j'.charCodeAt(0));
      view.setUint8(9, 'x'.charCodeAt(0));
      view.setUint8(10, 'l'.charCodeAt(0));
      view.setUint8(11, ' '.charCodeAt(0));
      expect(isJXLFile(buffer)).toBe(true);
    });

    it('should return false for non-JXL data', () => {
      const buffer = new ArrayBuffer(16);
      new Uint8Array(buffer).set([0x89, 0x50, 0x4e, 0x47]); // PNG
      expect(isJXLFile(buffer)).toBe(false);
    });

    it('should return false for empty buffer', () => {
      expect(isJXLFile(new ArrayBuffer(0))).toBe(false);
    });

    it('should return false for single byte buffer', () => {
      expect(isJXLFile(new ArrayBuffer(1))).toBe(false);
    });

    it('should return false for AVIF ftyp box', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 12, false);
      view.setUint8(4, 'f'.charCodeAt(0));
      view.setUint8(5, 't'.charCodeAt(0));
      view.setUint8(6, 'y'.charCodeAt(0));
      view.setUint8(7, 'p'.charCodeAt(0));
      view.setUint8(8, 'a'.charCodeAt(0));
      view.setUint8(9, 'v'.charCodeAt(0));
      view.setUint8(10, 'i'.charCodeAt(0));
      view.setUint8(11, 'f'.charCodeAt(0));
      expect(isJXLFile(buffer)).toBe(false);
    });
  });

  describe('isJXLContainer', () => {
    it('should return true for ISOBMFF container', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 12, false);
      view.setUint8(4, 0x66);
      view.setUint8(5, 0x74);
      view.setUint8(6, 0x79);
      view.setUint8(7, 0x70);
      view.setUint8(8, 0x6a);
      view.setUint8(9, 0x78);
      view.setUint8(10, 0x6c);
      view.setUint8(11, 0x20);
      expect(isJXLContainer(buffer)).toBe(true);
    });

    it('should return false for bare codestream', () => {
      const buffer = new ArrayBuffer(2);
      new Uint8Array(buffer).set([0xff, 0x0a]);
      expect(isJXLContainer(buffer)).toBe(false);
    });

    it('should return false for small buffer', () => {
      expect(isJXLContainer(new ArrayBuffer(8))).toBe(false);
    });
  });

  describe('mapCICPToColorSpace', () => {
    it('should map BT.709 + sRGB transfer to srgb', () => {
      expect(mapCICPToColorSpace(1, 13)).toBe('srgb');
    });

    it('should map BT.709 + BT.709 transfer to srgb', () => {
      expect(mapCICPToColorSpace(1, 1)).toBe('srgb');
    });

    it('should map BT.709 + linear transfer to linear', () => {
      expect(mapCICPToColorSpace(1, 8)).toBe('linear');
    });

    it('should map BT.2020 + sRGB transfer to rec2020', () => {
      expect(mapCICPToColorSpace(9, 13)).toBe('rec2020');
    });

    it('should map BT.2020 + linear transfer to rec2020-linear', () => {
      expect(mapCICPToColorSpace(9, 8)).toBe('rec2020-linear');
    });

    it('should map BT.2020 + PQ to rec2020-pq', () => {
      expect(mapCICPToColorSpace(9, 16)).toBe('rec2020-pq');
    });

    it('should map BT.2020 + HLG to rec2020-hlg', () => {
      expect(mapCICPToColorSpace(9, 18)).toBe('rec2020-hlg');
    });

    it('should map Display P3 + sRGB transfer to display-p3', () => {
      expect(mapCICPToColorSpace(12, 13)).toBe('display-p3');
    });

    it('should map Display P3 + linear transfer to display-p3-linear', () => {
      expect(mapCICPToColorSpace(12, 8)).toBe('display-p3-linear');
    });

    it('should map Display P3 + PQ to display-p3-pq', () => {
      expect(mapCICPToColorSpace(12, 16)).toBe('display-p3-pq');
    });

    it('should map Display P3 + HLG to display-p3-hlg', () => {
      expect(mapCICPToColorSpace(12, 18)).toBe('display-p3-hlg');
    });

    it('should default unknown primaries with sRGB transfer to srgb', () => {
      expect(mapCICPToColorSpace(99, 13)).toBe('srgb');
    });
  });

  describe('parseJXLColorSpace', () => {
    describe('bare codestream', () => {
      it('should return srgb for all-default ImageMetadata', () => {
        const buffer = buildCodestream({ allDefault: true });
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('srgb');
      });

      it('should return srgb for all-default colour_encoding', () => {
        const buffer = buildCodestream({ ceAllDefault: true });
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('srgb');
      });

      it('should return icc for want_icc colour_encoding', () => {
        const buffer = buildCodestream({ wantICC: true });
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('icc');
      });

      it('should detect sRGB primaries + sRGB transfer', () => {
        const buffer = buildCodestream({ primaries: 1, transfer: 8 });
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('srgb');
      });

      it('should detect BT.2020 primaries + linear transfer', () => {
        const buffer = buildCodestream({ primaries: 3, transfer: 3 });
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('rec2020-linear');
        expect(result!.primaries).toBe(9); // CICP BT.2020
        expect(result!.transfer).toBe(8); // CICP linear
      });

      it('should detect Display P3 primaries + sRGB transfer', () => {
        const buffer = buildCodestream({ primaries: 4, transfer: 8 });
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('display-p3');
        expect(result!.primaries).toBe(12); // CICP P3
      });

      it('should detect BT.2020 + PQ (HDR)', () => {
        const buffer = buildCodestream({ primaries: 3, transfer: 13 });
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('rec2020-pq');
      });

      it('should detect BT.2020 + HLG (HDR)', () => {
        const buffer = buildCodestream({ primaries: 3, transfer: 17 });
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('rec2020-hlg');
      });

      it('should detect linear transfer with BT.709 primaries', () => {
        const buffer = buildCodestream({ primaries: 1, transfer: 3 });
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('linear');
      });

      it('should parse correctly with an alpha extra channel', () => {
        const buffer = buildCodestream({
          primaries: 3,
          transfer: 13,
          extraChannels: [{ type: 0 }], // kAlpha
        });
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('rec2020-pq');
      });

      it('should return null for non-alpha extra channel (parser bails out safely)', () => {
        // type 1 = kDepth — non-alpha extra channel
        // The parser should bail out rather than corrupt the bit position
        const buffer = buildCodestream({
          primaries: 4,
          transfer: 8,
          extraChannels: [{ type: 1 }], // kDepth (non-alpha)
        });
        const result = parseJXLColorSpace(buffer);
        // Parser bails out for non-alpha extra channels to avoid bit corruption
        expect(result).toBeNull();
      });

      it('should return null for buffer too small', () => {
        const result = parseJXLColorSpace(new ArrayBuffer(2));
        expect(result).toBeNull();
      });

      it('should return null for non-JXL buffer', () => {
        const buffer = new ArrayBuffer(4);
        new Uint8Array(buffer).set([0x89, 0x50, 0x4e, 0x47]); // PNG
        const result = parseJXLColorSpace(buffer);
        expect(result).toBeNull();
      });
    });

    describe('ISOBMFF container with colr(nclx)', () => {
      it('should detect sRGB from nclx (primaries=1, transfer=13)', () => {
        const buffer = buildContainerWithNclx(1, 13);
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('srgb');
        expect(result!.primaries).toBe(1);
        expect(result!.transfer).toBe(13);
      });

      it('should detect Display P3 from nclx (primaries=12, transfer=13)', () => {
        const buffer = buildContainerWithNclx(12, 13);
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('display-p3');
      });

      it('should detect Rec.2020 from nclx (primaries=9, transfer=1)', () => {
        const buffer = buildContainerWithNclx(9, 1);
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('rec2020');
      });

      it('should detect PQ HDR from nclx (primaries=9, transfer=16)', () => {
        const buffer = buildContainerWithNclx(9, 16);
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('rec2020-pq');
      });

      it('should detect linear from nclx (primaries=1, transfer=8)', () => {
        const buffer = buildContainerWithNclx(1, 8);
        const result = parseJXLColorSpace(buffer);
        expect(result).not.toBeNull();
        expect(result!.colorSpace).toBe('linear');
      });

      it('should return null for container without colr box', () => {
        // Just ftyp, no colr box, no jxlc box
        const buffer = new ArrayBuffer(12);
        const view = new DataView(buffer);
        view.setUint32(0, 12, false);
        const ftyp = 'ftyp';
        for (let i = 0; i < 4; i++) view.setUint8(4 + i, ftyp.charCodeAt(i));
        const brand = 'jxl ';
        for (let i = 0; i < 4; i++) view.setUint8(8 + i, brand.charCodeAt(i));
        const result = parseJXLColorSpace(buffer);
        expect(result).toBeNull();
      });
    });
  });

  describe('decodeJXL', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should reject invalid JXL data', async () => {
      const buffer = new ArrayBuffer(16);
      await expect(decodeJXL(buffer)).rejects.toThrow('Invalid JXL file');
    });

    it('should decode JXL via @jsquash/jxl and return Float32Array RGBA', async () => {
      // Create a JXL codestream buffer (magic bytes only for detection)
      const buffer = new ArrayBuffer(4);
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0xff;
      bytes[1] = 0x0a;

      const mockImageData = {
        width: 2,
        height: 2,
        data: new Uint8ClampedArray([
          255, 0, 0, 255, // red
          0, 255, 0, 255, // green
          0, 0, 255, 255, // blue
          255, 255, 255, 255, // white
        ]),
      };

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockResolvedValue(mockImageData),
      }));

      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      const result = await mockedDecodeJXL(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(2 * 2 * 4);

      // Verify normalized values (255 -> 1.0, 0 -> 0.0)
      expect(result.data[0]).toBeCloseTo(1.0, 3); // R of red pixel
      expect(result.data[1]).toBeCloseTo(0.0, 3); // G of red pixel
      expect(result.data[3]).toBeCloseTo(1.0, 3); // A of red pixel

      // colorSpace should be present in metadata
      expect(result.metadata.format).toBe('jxl');
      expect(result.metadata.container).toBe('codestream');
      expect(result.metadata.colorSpace).toBeDefined();

      vi.doUnmock('@jsquash/jxl');
    });

    it('should include colorSpace in result and metadata for codestream', async () => {
      // Build a codestream with Display P3 color space
      const buffer = buildCodestream({ primaries: 4, transfer: 8 });

      const mockImageData = {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([128, 128, 128, 255]),
      };

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockResolvedValue(mockImageData),
      }));

      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      const result = await mockedDecodeJXL(buffer);

      expect(result.colorSpace).toBe('display-p3');
      expect(result.metadata.colorSpace).toBe('display-p3');
      expect(result.metadata.primaries).toBe(12);
      expect(result.metadata.transfer).toBe(13);

      vi.doUnmock('@jsquash/jxl');
    });

    it('should report srgb for default codestream', async () => {
      const buffer = buildCodestream({ allDefault: true });

      const mockImageData = {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([128, 128, 128, 255]),
      };

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockResolvedValue(mockImageData),
      }));

      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      const result = await mockedDecodeJXL(buffer);

      expect(result.colorSpace).toBe('srgb');
      expect(result.metadata.colorSpace).toBe('srgb');

      vi.doUnmock('@jsquash/jxl');
    });

    it('should include colorSpace in metadata for ISOBMFF container with nclx', async () => {
      const buffer = buildContainerWithNclx(12, 13); // Display P3 + sRGB transfer

      const mockImageData = {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([128, 128, 128, 255]),
      };

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockResolvedValue(mockImageData),
      }));

      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      const result = await mockedDecodeJXL(buffer);

      expect(result.colorSpace).toBe('display-p3');
      expect(result.metadata.format).toBe('jxl');
      expect(result.metadata.container).toBe('isobmff');
      expect(result.metadata.colorSpace).toBe('display-p3');
      expect(result.metadata.primaries).toBe(12);
      expect(result.metadata.transfer).toBe(13);

      vi.doUnmock('@jsquash/jxl');
    });

    it('should fall back to srgb when color space parsing fails', async () => {
      // Minimal bare codestream (just magic, no valid header)
      const buffer = new ArrayBuffer(4);
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0xff;
      bytes[1] = 0x0a;

      const mockImageData = {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([128, 128, 128, 255]),
      };

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockResolvedValue(mockImageData),
      }));

      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      const result = await mockedDecodeJXL(buffer);

      // Should gracefully fall back to srgb
      expect(result.colorSpace).toBe('srgb');

      vi.doUnmock('@jsquash/jxl');
    });

    it('should propagate decode errors from @jsquash/jxl', async () => {
      const buffer = new ArrayBuffer(4);
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0xff;
      bytes[1] = 0x0a;

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockRejectedValue(new Error('WASM decode failed: corrupt bitstream')),
      }));

      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      await expect(mockedDecodeJXL(buffer)).rejects.toThrow('WASM decode failed');

      vi.doUnmock('@jsquash/jxl');
    });

    it('should produce pixel values strictly in [0, 1] range for 8-bit input', async () => {
      const buffer = new ArrayBuffer(4);
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0xff;
      bytes[1] = 0x0a;

      const mockImageData = {
        width: 2,
        height: 1,
        data: new Uint8ClampedArray([
          0, 0, 0, 0,       // all zeros
          255, 255, 255, 255, // all max
        ]),
      };

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockResolvedValue(mockImageData),
      }));

      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      const result = await mockedDecodeJXL(buffer);

      // Black pixel
      expect(result.data[0]).toBe(0.0);
      expect(result.data[1]).toBe(0.0);
      expect(result.data[2]).toBe(0.0);
      expect(result.data[3]).toBe(0.0);

      // White pixel
      expect(result.data[4]).toBeCloseTo(1.0, 3);
      expect(result.data[5]).toBeCloseTo(1.0, 3);
      expect(result.data[6]).toBeCloseTo(1.0, 3);
      expect(result.data[7]).toBeCloseTo(1.0, 3);

      // No value should exceed [0,1]
      for (let i = 0; i < result.data.length; i++) {
        expect(result.data[i]).toBeGreaterThanOrEqual(0.0);
        expect(result.data[i]).toBeLessThanOrEqual(1.0);
      }

      vi.doUnmock('@jsquash/jxl');
    });
  });

  describe('edge cases', () => {
    it('should not match a buffer with only first magic byte', () => {
      const buffer = new ArrayBuffer(2);
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0xff;
      bytes[1] = 0x00; // Wrong second byte
      expect(isJXLFile(buffer)).toBe(false);
    });

    it('should not match ftyp box with truncated brand', () => {
      const buffer = new ArrayBuffer(11);
      const view = new DataView(buffer);
      view.setUint32(0, 11, false);
      view.setUint8(4, 'f'.charCodeAt(0));
      view.setUint8(5, 't'.charCodeAt(0));
      view.setUint8(6, 'y'.charCodeAt(0));
      view.setUint8(7, 'p'.charCodeAt(0));
      view.setUint8(8, 'j'.charCodeAt(0));
      view.setUint8(9, 'x'.charCodeAt(0));
      view.setUint8(10, 'l'.charCodeAt(0));
      expect(isJXLFile(buffer)).toBe(false);
    });

    it('should not match ftyp box with wrong brand', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 12, false);
      view.setUint8(4, 'f'.charCodeAt(0));
      view.setUint8(5, 't'.charCodeAt(0));
      view.setUint8(6, 'y'.charCodeAt(0));
      view.setUint8(7, 'p'.charCodeAt(0));
      view.setUint8(8, 'h'.charCodeAt(0));
      view.setUint8(9, 'e'.charCodeAt(0));
      view.setUint8(10, 'i'.charCodeAt(0));
      view.setUint8(11, 'c'.charCodeAt(0));
      expect(isJXLFile(buffer)).toBe(false);
    });
  });
});
