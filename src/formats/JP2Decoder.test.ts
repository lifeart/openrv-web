/**
 * JP2Decoder Unit Tests
 *
 * Tests cover:
 * - JP2-DET: File detection (magic bytes, full signature validation)
 * - JP2-HDR: Header parsing (JP2 ihdr box, J2K SIZ marker, colr box)
 * - JP2-WASM: WASM decoder lifecycle (init, decode, dispose, events)
 * - JP2-OPT: Decode option handling
 * - JP2-ERR: Error handling (corrupt data, truncated codestream)
 * - JP2-SIGN: Signed component support
 * - JP2-COLR: Colour specification box parsing
 * - JP2-INIT: Init re-entrancy and idempotency
 * - JP2-DIM: Dimension validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isJP2File,
  parseJP2Header,
  parseColrBox,
  decodeJP2,
  JP2WasmDecoder,
  setJP2WasmDecoder,
  getJP2WasmDecoder,
  type JP2DecodeResult,
  type JP2DecodeOptions,
} from './JP2Decoder';

// ---------------------------------------------------------------------------
// Testable subclass for WASM mocking (JP2-QA-003)
// ---------------------------------------------------------------------------

class TestableJP2WasmDecoder extends JP2WasmDecoder {
  private _mockModule: unknown = null;
  private _shouldFail = false;
  private _failMessage = 'WASM module not available';

  setMockModule(module: unknown): void {
    this._mockModule = module;
  }

  setFailOnLoad(fail: boolean, message?: string): void {
    this._shouldFail = fail;
    if (message) this._failMessage = message;
  }

  protected override async _loadWasmModule(_url: string): Promise<unknown> {
    if (this._shouldFail) {
      throw new Error(this._failMessage);
    }
    if (this._mockModule) {
      return this._mockModule;
    }
    throw new Error('WASM module not available');
  }
}

// ---------------------------------------------------------------------------
// Helpers: build synthetic JP2 / J2K buffers
// ---------------------------------------------------------------------------

/** Create a minimal JP2 box-format buffer with signature, ftyp, jp2h/ihdr, and jp2c boxes. */
function makeJP2Buffer(opts: {
  width: number;
  height: number;
  numComponents: number;
  bitsPerComponent: number;
  isSigned?: boolean;
  includeCodestream?: boolean;
  htj2k?: boolean;
  includeColrBox?: boolean;
  colrMeth?: number;
  colrEnumCS?: number;
  profile?: number;
  tileWidth?: number;
  tileHeight?: number;
}): ArrayBuffer {
  const {
    width, height, numComponents, bitsPerComponent,
    isSigned = false,
    includeCodestream = true, htj2k = false,
    includeColrBox = false, colrMeth = 1, colrEnumCS = 16,
    profile = 0,
    tileWidth,
    tileHeight,
  } = opts;

  // Build boxes
  const boxes: Uint8Array[] = [];

  // 1. JP2 Signature box (12 bytes): length(4) + "jP  "(4) + 0x0D0A870A(4)
  const sigBox = new ArrayBuffer(12);
  const sigView = new DataView(sigBox);
  sigView.setUint32(0, 12, false);
  sigView.setUint8(4, 0x6a); // 'j'
  sigView.setUint8(5, 0x50); // 'P'
  sigView.setUint8(6, 0x20); // ' '
  sigView.setUint8(7, 0x20); // ' '
  sigView.setUint32(8, 0x0d0a870a, false);
  boxes.push(new Uint8Array(sigBox));

  // 2. File Type box (20 bytes): length(4) + "ftyp"(4) + brand(4) + version(4) + compat(4)
  const ftypBox = new ArrayBuffer(20);
  const ftypView = new DataView(ftypBox);
  ftypView.setUint32(0, 20, false);
  const ftypStr = 'ftyp';
  for (let i = 0; i < 4; i++) ftypView.setUint8(4 + i, ftypStr.charCodeAt(i));
  const brand = 'jp2 ';
  for (let i = 0; i < 4; i++) ftypView.setUint8(8 + i, brand.charCodeAt(i));
  ftypView.setUint32(12, 0, false); // minor version
  for (let i = 0; i < 4; i++) ftypView.setUint8(16 + i, brand.charCodeAt(i)); // compat
  boxes.push(new Uint8Array(ftypBox));

  // 3. JP2 Header superbox containing ihdr (and optionally colr)
  // ihdr box: length(4) + "ihdr"(4) + height(4) + width(4) + nc(2) + bpc(1) + c(1) + unkC(1) + ipr(1) = 22 bytes
  const ihdrBox = new ArrayBuffer(22);
  const ihdrView = new DataView(ihdrBox);
  ihdrView.setUint32(0, 22, false);
  const ihdrStr = 'ihdr';
  for (let i = 0; i < 4; i++) ihdrView.setUint8(4 + i, ihdrStr.charCodeAt(i));
  ihdrView.setUint32(8, height, false);
  ihdrView.setUint32(12, width, false);
  ihdrView.setUint16(16, numComponents, false);
  // bpc: bit 7 = signed flag, bits 0-6 = (bitsPerComponent - 1)
  const bpc = ((bitsPerComponent - 1) & 0x7f) | (isSigned ? 0x80 : 0);
  ihdrView.setUint8(18, bpc);
  ihdrView.setUint8(19, 7); // compression type (7 = JPEG 2000)
  ihdrView.setUint8(20, 0); // unknownC
  ihdrView.setUint8(21, 0); // IPR

  // Optional colr box
  let colrBox: ArrayBuffer | null = null;
  if (includeColrBox) {
    if (colrMeth === 1) {
      // Enumerated colr box: length(4) + "colr"(4) + METH(1) + PREC(1) + APPROX(1) + EnumCS(4) = 15 bytes
      colrBox = new ArrayBuffer(15);
      const colrView = new DataView(colrBox);
      colrView.setUint32(0, 15, false);
      const colrStr = 'colr';
      for (let i = 0; i < 4; i++) colrView.setUint8(4 + i, colrStr.charCodeAt(i));
      colrView.setUint8(8, 1);  // METH = 1 (enumerated)
      colrView.setUint8(9, 0);  // PREC
      colrView.setUint8(10, 0); // APPROX
      colrView.setUint32(11, colrEnumCS, false);
    } else if (colrMeth === 2) {
      // ICC profile colr box: length(4) + "colr"(4) + METH(1) + PREC(1) + APPROX(1) + dummy ICC(4) = 15 bytes
      colrBox = new ArrayBuffer(15);
      const colrView = new DataView(colrBox);
      colrView.setUint32(0, 15, false);
      const colrStr = 'colr';
      for (let i = 0; i < 4; i++) colrView.setUint8(4 + i, colrStr.charCodeAt(i));
      colrView.setUint8(8, 2);  // METH = 2 (ICC)
      colrView.setUint8(9, 0);  // PREC
      colrView.setUint8(10, 0); // APPROX
      colrView.setUint32(11, 0, false); // Dummy ICC data
    }
  }

  // Wrap ihdr (+ colr) in jp2h superbox
  const innerLen = ihdrBox.byteLength + (colrBox ? colrBox.byteLength : 0);
  const jp2hLen = 8 + innerLen;
  const jp2hBox = new ArrayBuffer(jp2hLen);
  const jp2hView = new DataView(jp2hBox);
  jp2hView.setUint32(0, jp2hLen, false);
  const jp2hStr = 'jp2h';
  for (let i = 0; i < 4; i++) jp2hView.setUint8(4 + i, jp2hStr.charCodeAt(i));
  new Uint8Array(jp2hBox).set(new Uint8Array(ihdrBox), 8);
  if (colrBox) {
    new Uint8Array(jp2hBox).set(new Uint8Array(colrBox), 8 + ihdrBox.byteLength);
  }
  boxes.push(new Uint8Array(jp2hBox));

  // 4. Codestream box (jp2c) with a minimal J2K codestream
  if (includeCodestream) {
    const csBytes = makeJ2KCodestream({
      width,
      height,
      numComponents,
      bitsPerComponent,
      isSigned,
      htj2k,
      profile,
      tileWidth: tileWidth ?? width,
      tileHeight: tileHeight ?? height,
    });
    const jp2cLen = 8 + csBytes.byteLength;
    const jp2cBox = new ArrayBuffer(jp2cLen);
    const jp2cView = new DataView(jp2cBox);
    jp2cView.setUint32(0, jp2cLen, false);
    const jp2cStr = 'jp2c';
    for (let i = 0; i < 4; i++) jp2cView.setUint8(4 + i, jp2cStr.charCodeAt(i));
    new Uint8Array(jp2cBox).set(new Uint8Array(csBytes), 8);
    boxes.push(new Uint8Array(jp2cBox));
  }

  // Concatenate all boxes
  const totalLen = boxes.reduce((sum, b) => sum + b.byteLength, 0);
  const result = new Uint8Array(totalLen);
  let off = 0;
  for (const box of boxes) {
    result.set(box, off);
    off += box.byteLength;
  }
  return result.buffer as ArrayBuffer;
}

/**
 * Create a minimal raw J2K codestream with SOC + SIZ + (optional CAP) + EOC markers.
 */
function makeJ2KCodestream(opts: {
  width: number;
  height: number;
  numComponents: number;
  bitsPerComponent: number;
  isSigned?: boolean;
  htj2k?: boolean;
  profile?: number;
  tileWidth?: number;
  tileHeight?: number;
}): ArrayBuffer {
  const {
    width, height, numComponents, bitsPerComponent,
    isSigned = false, htj2k = false,
    profile = 0,
    tileWidth = width,
    tileHeight = height,
  } = opts;

  // SIZ marker segment:
  //   Marker (2) + Lsiz (2) + Rsiz (2) + Xsiz (4) + Ysiz (4) + XOsiz (4) + YOsiz (4)
  //   + XTsiz (4) + YTsiz (4) + XTOsiz (4) + YTOsiz (4) + Csiz (2)
  //   + per-component: Ssiz (1) + XRsiz (1) + YRsiz (1)
  // Total fixed = 38, per-component = 3 each
  const lsiz = 38 + numComponents * 3;
  const sizSegmentLen = 2 + lsiz; // marker(2) + Lsiz includes itself

  // Optional CAP marker for HTJ2K: marker(2) + Lcap(2) + Pcap(4) + Ccap(2) = 10
  const capLen = htj2k ? 10 : 0;

  // SOC(2) + SIZ segment + CAP (optional) + EOC(2)
  const totalLen = 2 + sizSegmentLen + capLen + 2;
  const buf = new ArrayBuffer(totalLen);
  const view = new DataView(buf);
  let pos = 0;

  // SOC
  view.setUint16(pos, 0xff4f, false);
  pos += 2;

  // SIZ marker
  view.setUint16(pos, 0xff51, false);
  pos += 2;

  // Lsiz (includes itself but not the marker bytes)
  view.setUint16(pos, lsiz, false);
  pos += 2;

  // Rsiz (profile)
  view.setUint16(pos, profile, false);
  pos += 2;

  // Xsiz, Ysiz (reference grid = image size when offsets are 0)
  view.setUint32(pos, width, false);
  pos += 4;
  view.setUint32(pos, height, false);
  pos += 4;

  // XOsiz, YOsiz = 0
  view.setUint32(pos, 0, false);
  pos += 4;
  view.setUint32(pos, 0, false);
  pos += 4;

  // XTsiz, YTsiz
  view.setUint32(pos, tileWidth, false);
  pos += 4;
  view.setUint32(pos, tileHeight, false);
  pos += 4;

  // XTOsiz, YTOsiz = 0
  view.setUint32(pos, 0, false);
  pos += 4;
  view.setUint32(pos, 0, false);
  pos += 4;

  // Csiz (number of components)
  view.setUint16(pos, numComponents, false);
  pos += 2;

  // Per-component info
  for (let c = 0; c < numComponents; c++) {
    // Ssiz: (bitsPerComponent - 1) & 0x7F, bit 7 = signed
    const ssiz = ((bitsPerComponent - 1) & 0x7f) | (isSigned ? 0x80 : 0);
    view.setUint8(pos, ssiz);
    pos += 1;
    // XRsiz
    view.setUint8(pos, 1);
    pos += 1;
    // YRsiz
    view.setUint8(pos, 1);
    pos += 1;
  }

  // Optional CAP marker (HTJ2K indicator)
  if (htj2k) {
    view.setUint16(pos, 0xff50, false); // CAP marker
    pos += 2;
    view.setUint16(pos, 8, false); // Lcap
    pos += 2;
    view.setUint32(pos, 0x00020000, false); // Pcap with Part-15 bit set
    pos += 4;
    view.setUint16(pos, 0x4000, false); // Ccap[15]
    pos += 2;
  }

  // EOC
  view.setUint16(pos, 0xffd9, false);

  return buf;
}

/** Create a mock decode result */
function makeMockResult(overrides?: Partial<JP2DecodeResult>): JP2DecodeResult {
  return {
    width: 2,
    height: 2,
    data: new Float32Array(2 * 2 * 4),
    channels: 4,
    bitsPerComponent: 8,
    isSigned: false,
    colorSpace: 'sRGB',
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('JP2Decoder', () => {
  // -----------------------------------------------------------------------
  // Detection tests
  // -----------------------------------------------------------------------
  describe('isJP2File -- detection', () => {
    it('JP2-DET-001: should detect JP2 box format by full signature (bytes 0-3, 4-7, 8-11)', () => {
      const buffer = makeJP2Buffer({ width: 64, height: 64, numComponents: 3, bitsPerComponent: 8 });
      expect(isJP2File(buffer)).toBe(true);
    });

    it('JP2-DET-002: should detect raw J2K codestream by SOC marker (0xFF4F)', () => {
      const buffer = makeJ2KCodestream({ width: 32, height: 32, numComponents: 3, bitsPerComponent: 8 });
      expect(isJP2File(buffer)).toBe(true);
    });

    it('JP2-DET-003: should reject non-JP2 data (PNG header)', () => {
      const buffer = new ArrayBuffer(16);
      new Uint8Array(buffer).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(isJP2File(buffer)).toBe(false);
    });

    it('JP2-DET-004: should return false for empty buffer', () => {
      expect(isJP2File(new ArrayBuffer(0))).toBe(false);
    });

    it('JP2-DET-005: should return false for single-byte (truncated) buffer', () => {
      expect(isJP2File(new ArrayBuffer(1))).toBe(false);
    });

    it('JP2-DET-006: should reject JP2 with wrong box length (bytes 0-3 != 0x0000000C)', () => {
      // Create a buffer that has correct bytes 4-7 but wrong box length
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 0x0000000d, false); // Wrong length (should be 0x0C)
      view.setUint8(4, 0x6a); // 'j'
      view.setUint8(5, 0x50); // 'P'
      view.setUint8(6, 0x20); // ' '
      view.setUint8(7, 0x20); // ' '
      view.setUint32(8, 0x0d0a870a, false);
      expect(isJP2File(buffer)).toBe(false);
    });

    it('JP2-DET-007: should reject JP2 with wrong content at bytes 8-11', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 12, false); // Correct length
      view.setUint8(4, 0x6a);
      view.setUint8(5, 0x50);
      view.setUint8(6, 0x20);
      view.setUint8(7, 0x20);
      view.setUint32(8, 0x00000000, false); // Wrong content
      expect(isJP2File(buffer)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Header parsing tests
  // -----------------------------------------------------------------------
  describe('parseJP2Header -- header parsing', () => {
    it('JP2-HDR-001: should parse JP2 ihdr box for dimensions', () => {
      const buffer = makeJP2Buffer({ width: 1920, height: 1080, numComponents: 3, bitsPerComponent: 12 });
      const info = parseJP2Header(buffer);
      expect(info.width).toBe(1920);
      expect(info.height).toBe(1080);
    });

    it('JP2-HDR-002: should parse raw J2K SIZ marker for dimensions', () => {
      const buffer = makeJ2KCodestream({ width: 4096, height: 2160, numComponents: 3, bitsPerComponent: 10 });
      const info = parseJP2Header(buffer);
      expect(info.width).toBe(4096);
      expect(info.height).toBe(2160);
    });

    it('JP2-HDR-003: should report correct component count', () => {
      const buf3 = makeJ2KCodestream({ width: 100, height: 100, numComponents: 3, bitsPerComponent: 8 });
      expect(parseJP2Header(buf3).numComponents).toBe(3);

      const buf1 = makeJ2KCodestream({ width: 100, height: 100, numComponents: 1, bitsPerComponent: 16 });
      expect(parseJP2Header(buf1).numComponents).toBe(1);

      const buf4 = makeJP2Buffer({ width: 100, height: 100, numComponents: 4, bitsPerComponent: 8 });
      expect(parseJP2Header(buf4).numComponents).toBe(4);
    });

    it('JP2-HDR-004: should report correct bit depth', () => {
      const buf8 = makeJ2KCodestream({ width: 64, height: 64, numComponents: 3, bitsPerComponent: 8 });
      expect(parseJP2Header(buf8).bitsPerComponent).toBe(8);

      const buf12 = makeJ2KCodestream({ width: 64, height: 64, numComponents: 3, bitsPerComponent: 12 });
      expect(parseJP2Header(buf12).bitsPerComponent).toBe(12);

      const buf16 = makeJP2Buffer({ width: 64, height: 64, numComponents: 3, bitsPerComponent: 16 });
      expect(parseJP2Header(buf16).bitsPerComponent).toBe(16);
    });

    it('JP2-HDR-005: should detect HTJ2K when CAP marker is present', () => {
      const htj2kCs = makeJ2KCodestream({ width: 64, height: 64, numComponents: 3, bitsPerComponent: 8, htj2k: true });
      expect(parseJP2Header(htj2kCs).isHTJ2K).toBe(true);

      const j2kCs = makeJ2KCodestream({ width: 64, height: 64, numComponents: 3, bitsPerComponent: 8, htj2k: false });
      expect(parseJP2Header(j2kCs).isHTJ2K).toBe(false);
    });

    it('JP2-HDR-006: should report grayscale for single-component images', () => {
      const buf = makeJ2KCodestream({ width: 64, height: 64, numComponents: 1, bitsPerComponent: 8 });
      expect(parseJP2Header(buf).colorSpace).toBe('grayscale');
    });

    it('JP2-HDR-007: should report sRGB for multi-component images', () => {
      const buf = makeJ2KCodestream({ width: 64, height: 64, numComponents: 3, bitsPerComponent: 8 });
      expect(parseJP2Header(buf).colorSpace).toBe('sRGB');
    });

    it('JP2-HDR-008: should parse profile from Rsiz in SIZ marker', () => {
      const buf = makeJ2KCodestream({ width: 64, height: 64, numComponents: 3, bitsPerComponent: 8, profile: 2 });
      const info = parseJP2Header(buf);
      expect(info.profile).toBe(2);
    });

    it('JP2-HDR-009: should parse tile dimensions from SIZ marker', () => {
      const buf = makeJ2KCodestream({
        width: 4096, height: 2160, numComponents: 3, bitsPerComponent: 12,
        tileWidth: 1024, tileHeight: 1024,
      });
      const info = parseJP2Header(buf);
      expect(info.tileWidth).toBe(1024);
      expect(info.tileHeight).toBe(1024);
    });

    it('JP2-HDR-010: should parse DCI 4K dimensions (4096x2160)', () => {
      const buf = makeJ2KCodestream({ width: 4096, height: 2160, numComponents: 3, bitsPerComponent: 12 });
      const info = parseJP2Header(buf);
      expect(info.width).toBe(4096);
      expect(info.height).toBe(2160);
    });

    it('JP2-HDR-011: should parse isSigned from SIZ Ssiz byte in J2K codestream', () => {
      const signedBuf = makeJ2KCodestream({
        width: 64, height: 64, numComponents: 3, bitsPerComponent: 16, isSigned: true,
      });
      const signedInfo = parseJP2Header(signedBuf);
      expect(signedInfo.isSigned).toBe(true);
      expect(signedInfo.bitsPerComponent).toBe(16);

      const unsignedBuf = makeJ2KCodestream({
        width: 64, height: 64, numComponents: 3, bitsPerComponent: 16, isSigned: false,
      });
      const unsignedInfo = parseJP2Header(unsignedBuf);
      expect(unsignedInfo.isSigned).toBe(false);
    });

    it('JP2-HDR-012: should parse isSigned from ihdr bpc byte in JP2 container', () => {
      const signedBuf = makeJP2Buffer({
        width: 256, height: 256, numComponents: 3, bitsPerComponent: 12, isSigned: true,
      });
      const signedInfo = parseJP2Header(signedBuf);
      expect(signedInfo.isSigned).toBe(true);
      expect(signedInfo.bitsPerComponent).toBe(12);
    });
  });

  // -----------------------------------------------------------------------
  // Colour specification box parsing tests (JP2-R02)
  // -----------------------------------------------------------------------
  describe('parseColrBox -- colour specification box', () => {
    it('JP2-COLR-001: should parse sRGB from colr box (EnumCS=16)', () => {
      const buf = makeJP2Buffer({
        width: 64, height: 64, numComponents: 3, bitsPerComponent: 8,
        includeColrBox: true, colrMeth: 1, colrEnumCS: 16,
      });
      const info = parseJP2Header(buf);
      expect(info.colorSpace).toBe('sRGB');
    });

    it('JP2-COLR-002: should parse greyscale from colr box (EnumCS=17)', () => {
      const buf = makeJP2Buffer({
        width: 64, height: 64, numComponents: 1, bitsPerComponent: 8,
        includeColrBox: true, colrMeth: 1, colrEnumCS: 17,
      });
      const info = parseJP2Header(buf);
      expect(info.colorSpace).toBe('greyscale');
    });

    it('JP2-COLR-003: should parse sYCC from colr box (EnumCS=18)', () => {
      const buf = makeJP2Buffer({
        width: 64, height: 64, numComponents: 3, bitsPerComponent: 8,
        includeColrBox: true, colrMeth: 1, colrEnumCS: 18,
      });
      const info = parseJP2Header(buf);
      expect(info.colorSpace).toBe('sYCC');
    });

    it('JP2-COLR-004: should detect ICC profile (METH=2)', () => {
      const buf = makeJP2Buffer({
        width: 64, height: 64, numComponents: 3, bitsPerComponent: 8,
        includeColrBox: true, colrMeth: 2,
      });
      const info = parseJP2Header(buf);
      expect(info.colorSpace).toBe('icc-embedded');
    });

    it('JP2-COLR-005: should fall back to component count heuristic when no colr box', () => {
      const buf3 = makeJP2Buffer({
        width: 64, height: 64, numComponents: 3, bitsPerComponent: 8,
        includeColrBox: false,
      });
      expect(parseJP2Header(buf3).colorSpace).toBe('sRGB');

      const buf1 = makeJP2Buffer({
        width: 64, height: 64, numComponents: 1, bitsPerComponent: 8,
        includeColrBox: false,
      });
      expect(parseJP2Header(buf1).colorSpace).toBe('grayscale');
    });

    it('JP2-COLR-006: parseColrBox should return null for buffer without colr box', () => {
      const buf = makeJP2Buffer({
        width: 64, height: 64, numComponents: 3, bitsPerComponent: 8,
        includeColrBox: false,
      });
      expect(parseColrBox(buf)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // WASM decoder lifecycle tests (using subclass pattern)
  // -----------------------------------------------------------------------
  describe('JP2WasmDecoder -- lifecycle', () => {
    let decoder: TestableJP2WasmDecoder;

    beforeEach(() => {
      decoder = new TestableJP2WasmDecoder();
    });

    it('JP2-WASM-001: should start not ready', () => {
      expect(decoder.isReady()).toBe(false);
    });

    it('JP2-WASM-002: should become ready after init with mock module', async () => {
      const mockModule = {
        decode: (): JP2DecodeResult => makeMockResult(),
      };
      decoder.setMockModule(mockModule);

      await decoder.init('/mock.wasm');
      expect(decoder.isReady()).toBe(true);
    });

    it('JP2-WASM-003: should decode and return result when ready', async () => {
      const expectedData = new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]);
      const mockModule = {
        decode: (): JP2DecodeResult => makeMockResult({
          data: expectedData,
        }),
      };
      decoder.setMockModule(mockModule);
      await decoder.init();

      const buffer = makeJ2KCodestream({ width: 2, height: 2, numComponents: 3, bitsPerComponent: 8 });
      const result = await decoder.decode(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.data).toBe(expectedData);
    });

    it('JP2-WASM-004: should throw when decode called without init', async () => {
      const buffer = makeJ2KCodestream({ width: 2, height: 2, numComponents: 3, bitsPerComponent: 8 });
      await expect(decoder.decode(buffer)).rejects.toThrow('JP2 WASM module not loaded');
    });

    it('JP2-WASM-005: dispose should clean up and mark not ready', async () => {
      const mockModule = {
        decode: (): JP2DecodeResult => makeMockResult({ width: 1, height: 1, data: new Float32Array(4) }),
      };
      decoder.setMockModule(mockModule);
      await decoder.init();
      expect(decoder.isReady()).toBe(true);

      decoder.dispose();
      expect(decoder.isReady()).toBe(false);

      // Decode should fail after dispose
      const buffer = makeJ2KCodestream({ width: 1, height: 1, numComponents: 3, bitsPerComponent: 8 });
      await expect(decoder.decode(buffer)).rejects.toThrow('JP2 WASM module not loaded');
    });

    it('JP2-WASM-006: double dispose should be safe (no throw)', async () => {
      const mockModule = {
        decode: (): JP2DecodeResult => makeMockResult({ width: 1, height: 1, data: new Float32Array(4) }),
      };
      decoder.setMockModule(mockModule);
      await decoder.init();

      decoder.dispose();
      expect(() => decoder.dispose()).not.toThrow();
      expect(decoder.isReady()).toBe(false);
    });

    it('JP2-WASM-007: should emit status events in correct order via EventEmitter', async () => {
      const events: string[] = [];
      decoder.on('loading', () => events.push('loading'));
      decoder.on('ready', () => events.push('ready'));
      decoder.on('disposed', () => events.push('disposed'));

      const mockModule = {
        decode: (): JP2DecodeResult => makeMockResult({ width: 1, height: 1, data: new Float32Array(4) }),
      };
      decoder.setMockModule(mockModule);

      await decoder.init();
      decoder.dispose();

      expect(events).toEqual(['loading', 'ready', 'disposed']);
    });

    it('JP2-WASM-008: should emit error event when init fails', async () => {
      const errors: string[] = [];
      decoder.on('error', (msg) => errors.push(msg));
      decoder.on('loading', () => {}); // ensure loading is captured

      decoder.setFailOnLoad(true, 'WASM module not available');

      await expect(decoder.init('/missing.wasm')).rejects.toThrow('Failed to load WASM module');

      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('WASM module not available');
    });

    it('JP2-WASM-009: should allow removing event listeners via off()', async () => {
      const events: string[] = [];
      const loadingListener = () => events.push('loading');
      const readyListener = () => events.push('ready');

      decoder.on('loading', loadingListener);
      decoder.on('ready', readyListener);
      decoder.off('loading', loadingListener);
      decoder.off('ready', readyListener);

      const mockModule = {
        decode: (): JP2DecodeResult => makeMockResult({ width: 1, height: 1, data: new Float32Array(4) }),
      };
      decoder.setMockModule(mockModule);
      await decoder.init();

      expect(events).toEqual([]); // No events received after removal
    });

    it('JP2-WASM-010: dispose should call destroy() on WASM module if available', async () => {
      let destroyCalled = false;
      const mockModule = {
        decode: (): JP2DecodeResult => makeMockResult({ width: 1, height: 1, data: new Float32Array(4) }),
        destroy: () => { destroyCalled = true; },
      };
      decoder.setMockModule(mockModule);
      await decoder.init();

      decoder.dispose();
      expect(destroyCalled).toBe(true);
    });

    it('JP2-WASM-011: dispose should remove all listeners', async () => {
      const events: string[] = [];
      const mockModule = {
        decode: (): JP2DecodeResult => makeMockResult({ width: 1, height: 1, data: new Float32Array(4) }),
      };
      decoder.setMockModule(mockModule);
      await decoder.init();

      // Add listener after init (before dispose)
      decoder.on('loading', () => events.push('loading'));
      decoder.dispose();

      // Re-init -- the old listener should not fire
      decoder.setMockModule(mockModule);
      await decoder.init();
      expect(events).toEqual([]); // Listener was removed by dispose
    });
  });

  // -----------------------------------------------------------------------
  // Init re-entrancy and idempotency tests (JP2-R08/QA-002)
  // -----------------------------------------------------------------------
  describe('JP2WasmDecoder -- init re-entrancy', () => {
    it('JP2-INIT-001: init should be idempotent (calling after ready is a no-op)', async () => {
      let loadCount = 0;
      const mockModule = {
        decode: (): JP2DecodeResult => makeMockResult(),
      };
      // Use a custom subclass that counts loads
      class CountingDecoder extends JP2WasmDecoder {
        protected override async _loadWasmModule(_url: string): Promise<unknown> {
          loadCount++;
          return mockModule;
        }
      }
      const countDecoder = new CountingDecoder();

      await countDecoder.init();
      expect(countDecoder.isReady()).toBe(true);
      expect(loadCount).toBe(1);

      await countDecoder.init(); // Should be no-op
      expect(loadCount).toBe(1); // Not loaded again
    });

    it('JP2-INIT-002: concurrent init calls should share the same promise', async () => {
      let resolveLoad: (() => void) | null = null;
      let loadCount = 0;
      const mockModule = {
        decode: (): JP2DecodeResult => makeMockResult(),
      };

      class DelayedDecoder extends JP2WasmDecoder {
        protected override async _loadWasmModule(_url: string): Promise<unknown> {
          loadCount++;
          return new Promise<unknown>((resolve) => {
            resolveLoad = () => resolve(mockModule);
          });
        }
      }

      const decoder = new DelayedDecoder();
      const p1 = decoder.init();
      const p2 = decoder.init();

      // Both should be waiting for the same load
      expect(loadCount).toBe(1);

      // Resolve the load
      resolveLoad!();
      await p1;
      await p2;

      expect(decoder.isReady()).toBe(true);
      expect(loadCount).toBe(1);
    });

    it('JP2-INIT-003: should allow retry after init error', async () => {
      const decoder = new TestableJP2WasmDecoder();
      decoder.setFailOnLoad(true);

      await expect(decoder.init()).rejects.toThrow('Failed to load WASM module');
      expect(decoder.isReady()).toBe(false);

      // Now set mock and retry
      decoder.setFailOnLoad(false);
      decoder.setMockModule({
        decode: (): JP2DecodeResult => makeMockResult(),
      });

      await decoder.init();
      expect(decoder.isReady()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Options handling tests
  // -----------------------------------------------------------------------
  describe('decodeJP2 -- options handling', () => {
    let decoder: TestableJP2WasmDecoder;
    let receivedOptions: JP2DecodeOptions | undefined;

    beforeEach(async () => {
      decoder = new TestableJP2WasmDecoder();
      receivedOptions = undefined;
      const mockModule = {
        decode: (_buf: ArrayBuffer, opts?: JP2DecodeOptions): JP2DecodeResult => {
          receivedOptions = opts;
          return makeMockResult({
            width: 64, height: 64,
            data: new Float32Array(64 * 64 * 4),
          });
        },
      };
      decoder.setMockModule(mockModule);
      await decoder.init();
    });

    it('JP2-OPT-001: should forward maxResolutionLevel to WASM decoder', async () => {
      const buffer = makeJ2KCodestream({ width: 64, height: 64, numComponents: 3, bitsPerComponent: 8 });
      await decodeJP2(buffer, { maxResolutionLevel: 2 }, decoder);
      expect(receivedOptions?.maxResolutionLevel).toBe(2);
    });

    it('JP2-OPT-002: should forward region decode option to WASM decoder', async () => {
      const buffer = makeJ2KCodestream({ width: 64, height: 64, numComponents: 3, bitsPerComponent: 8 });
      const region = { x: 10, y: 20, w: 32, h: 16 };
      await decodeJP2(buffer, { region }, decoder);
      expect(receivedOptions?.region).toEqual(region);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling tests
  // -----------------------------------------------------------------------
  describe('decodeJP2 / parseJP2Header -- error handling', () => {
    it('JP2-ERR-001: should throw for corrupt data (not JP2/J2K)', async () => {
      const buffer = new ArrayBuffer(64);
      new Uint8Array(buffer).fill(0xaa);
      await expect(decodeJP2(buffer)).rejects.toThrow('Invalid JPEG 2000 file');
    });

    it('JP2-ERR-002: should throw for truncated J2K codestream (SOC but no SIZ)', () => {
      // Just SOC marker, no SIZ following
      const buffer = new ArrayBuffer(2);
      const view = new DataView(buffer);
      view.setUint16(0, 0xff4f, false);

      expect(() => parseJP2Header(buffer)).toThrow('Failed to parse J2K SIZ marker');
    });

    it('JP2-ERR-003: should throw for JP2 container with invalid/missing ihdr and no codestream', () => {
      // Signature box only, no jp2h or jp2c
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 12, false);
      view.setUint8(4, 0x6a);
      view.setUint8(5, 0x50);
      view.setUint8(6, 0x20);
      view.setUint8(7, 0x20);
      view.setUint32(8, 0x0d0a870a, false);

      expect(() => parseJP2Header(buffer)).toThrow('Failed to parse JP2 header');
    });

    it('JP2-ERR-004: should throw when decoding without WASM and no decoder provided', async () => {
      // Make sure module-level decoder is not set
      setJP2WasmDecoder(null);
      const buffer = makeJ2KCodestream({ width: 32, height: 32, numComponents: 3, bitsPerComponent: 8 });
      await expect(decodeJP2(buffer)).rejects.toThrow('JP2 WASM module not loaded');
    });

    it('JP2-ERR-005: parseJP2Header should throw for empty buffer', () => {
      expect(() => parseJP2Header(new ArrayBuffer(0))).toThrow('Buffer too small');
    });

    it('JP2-ERR-006: should throw for J2K codestream with truncated SIZ marker', () => {
      // SOC + SIZ marker but truncated (only 10 bytes total instead of the needed ~50+)
      const buffer = new ArrayBuffer(10);
      const view = new DataView(buffer);
      view.setUint16(0, 0xff4f, false); // SOC
      view.setUint16(2, 0xff51, false); // SIZ
      view.setUint16(4, 41, false);     // Lsiz (correct minimum)
      // But buffer is too short to contain all SIZ fields

      expect(() => parseJP2Header(buffer)).toThrow('Failed to parse J2K SIZ marker');
    });
  });

  // -----------------------------------------------------------------------
  // Module-level WASM decoder (JP2-R03)
  // -----------------------------------------------------------------------
  describe('setJP2WasmDecoder / getJP2WasmDecoder', () => {
    beforeEach(() => {
      setJP2WasmDecoder(null); // Clean up
    });

    it('should return null when no decoder is set', () => {
      expect(getJP2WasmDecoder()).toBeNull();
    });

    it('should return the decoder after setting it', () => {
      const decoder = new TestableJP2WasmDecoder();
      setJP2WasmDecoder(decoder);
      expect(getJP2WasmDecoder()).toBe(decoder);
    });

    it('should allow clearing the decoder with null', () => {
      const decoder = new TestableJP2WasmDecoder();
      setJP2WasmDecoder(decoder);
      setJP2WasmDecoder(null);
      expect(getJP2WasmDecoder()).toBeNull();
    });

    it('decodeJP2 should use module-level decoder when no explicit decoder provided', async () => {
      const decoder = new TestableJP2WasmDecoder();
      decoder.setMockModule({
        decode: (): JP2DecodeResult => makeMockResult({ width: 128, height: 128, data: new Float32Array(128 * 128 * 4) }),
      });
      await decoder.init();
      setJP2WasmDecoder(decoder);

      const buffer = makeJ2KCodestream({ width: 128, height: 128, numComponents: 3, bitsPerComponent: 8 });
      const result = await decodeJP2(buffer);
      expect(result.width).toBe(128);
      expect(result.height).toBe(128);
    });
  });

  // -----------------------------------------------------------------------
  // Integration with decodeJP2 high-level function
  // -----------------------------------------------------------------------
  describe('decodeJP2 -- integration', () => {
    beforeEach(() => {
      setJP2WasmDecoder(null);
    });

    it('should reject non-JP2 files before trying WASM', async () => {
      const pngHeader = new ArrayBuffer(8);
      new Uint8Array(pngHeader).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      // Even with a valid decoder, non-JP2 should fail at detection
      const decoder = new TestableJP2WasmDecoder();
      decoder.setMockModule({
        decode: (): JP2DecodeResult => makeMockResult(),
      });
      await decoder.init();

      await expect(decodeJP2(pngHeader, undefined, decoder)).rejects.toThrow('Invalid JPEG 2000 file');
    });

    it('should successfully decode a valid JP2 file with WASM decoder', async () => {
      const decoder = new TestableJP2WasmDecoder();
      decoder.setMockModule({
        decode: (): JP2DecodeResult => makeMockResult({
          width: 256, height: 256,
          data: new Float32Array(256 * 256 * 3),
          channels: 3,
          bitsPerComponent: 10,
          colorSpace: 'sRGB',
        }),
      });
      await decoder.init();

      const buffer = makeJP2Buffer({ width: 256, height: 256, numComponents: 3, bitsPerComponent: 10 });
      const result = await decodeJP2(buffer, undefined, decoder);

      expect(result.width).toBe(256);
      expect(result.height).toBe(256);
      expect(result.channels).toBe(3);
      expect(result.bitsPerComponent).toBe(10);
    });

    it('JP2-NORM-001: should normalize 8-bit integer data to [0,1] float', async () => {
      // Simulate WASM returning raw 8-bit integer values (0-255)
      const rawData = new Float32Array([0, 128, 255, 0, 64, 192]);
      const decoder = new TestableJP2WasmDecoder();
      decoder.setMockModule({
        decode: (): JP2DecodeResult => makeMockResult({
          width: 2, height: 1,
          data: rawData,
          channels: 3,
          bitsPerComponent: 8,
          colorSpace: 'sRGB',
          isSigned: false,
        }),
      });
      await decoder.init();

      const buffer = makeJP2Buffer({ width: 2, height: 1, numComponents: 3, bitsPerComponent: 8 });
      const result = await decodeJP2(buffer, undefined, decoder);

      // Values should be normalized: 0/255=0, 128/255≈0.502, 255/255=1
      expect(result.data[0]).toBeCloseTo(0, 5);
      expect(result.data[1]).toBeCloseTo(128 / 255, 3);
      expect(result.data[2]).toBeCloseTo(1.0, 5);
      expect(result.data[3]).toBeCloseTo(0, 5);
      expect(result.data[4]).toBeCloseTo(64 / 255, 3);
      expect(result.data[5]).toBeCloseTo(192 / 255, 3);
    });

    it('JP2-NORM-002: should normalize signed 12-bit data correctly', async () => {
      // Signed 12-bit: range [-2048, 2047], normalize with offset
      const rawData = new Float32Array([-2048, 0, 2047]);
      const decoder = new TestableJP2WasmDecoder();
      decoder.setMockModule({
        decode: (): JP2DecodeResult => makeMockResult({
          width: 1, height: 1,
          data: rawData,
          channels: 3,
          bitsPerComponent: 12,
          colorSpace: 'sRGB',
          isSigned: true,
        }),
      });
      await decoder.init();

      const buffer = makeJP2Buffer({ width: 1, height: 1, numComponents: 3, bitsPerComponent: 12 });
      const result = await decodeJP2(buffer, undefined, decoder);

      // Signed 12-bit: (val + 2048) / 4095
      expect(result.data[0]).toBeCloseTo(0, 5); // (-2048 + 2048) / 4095 = 0
      expect(result.data[1]).toBeCloseTo(2048 / 4095, 3); // (0 + 2048) / 4095 ≈ 0.5
      expect(result.data[2]).toBeCloseTo(4095 / 4095, 3); // (2047 + 2048) / 4095 ≈ 1.0
    });

    it('should validate dimensions and reject oversized images', async () => {
      // Create a J2K codestream with dimensions that exceed limits
      // validateImageDimensions will reject > 65536 in either dimension
      const buffer = makeJ2KCodestream({
        width: 70000, height: 100, numComponents: 3, bitsPerComponent: 8,
      });

      const decoder = new TestableJP2WasmDecoder();
      decoder.setMockModule({
        decode: (): JP2DecodeResult => makeMockResult(),
      });
      await decoder.init();

      await expect(decodeJP2(buffer, undefined, decoder)).rejects.toThrow(/dimensions.*exceed/i);
    });
  });
});
