/**
 * JPEG 2000 / HTJ2K File Format Decoder
 *
 * Supports:
 * - JP2 box format (.jp2) -- ISO 15444-1 container
 * - J2K/J2C codestream (.j2k, .j2c) -- raw JPEG 2000 codestream
 * - JPH/JHC files (.jph, .jhc) -- HTJ2K (Part-15) variant
 *
 * Detection:
 * - JP2 signature box: bytes 0-3 == 0x0000000C, bytes 4-7 == "jP  ",
 *   bytes 8-11 == 0x0D0A870A
 * - J2K codestream: starts with SOC marker (0xFF4F)
 *
 * Decoding is delegated to an openjph-based WASM module (loaded lazily).
 * When WASM is not available, functions throw a clear error to allow
 * graceful fallback in the application layer.
 *
 * Based on ISO/IEC 15444-1 (JPEG 2000 Part 1) and
 * ISO/IEC 15444-15 (HTJ2K / High-Throughput JPEG 2000).
 */

import { DecoderError } from '../core/errors';
import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import { validateImageDimensions } from './shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** JP2 signature box type bytes: "jP  " (0x6A, 0x50, 0x20, 0x20) */
const JP2_SIGNATURE = [0x6a, 0x50, 0x20, 0x20] as const;

/** Full JP2 signature box: bytes 0-3 must be 0x0000000C */
const JP2_SIG_BOX_LENGTH = 0x0000000c;

/** Full JP2 signature box: bytes 8-11 must be 0x0D0A870A */
const JP2_SIG_BOX_CONTENT = 0x0d0a870a;

/** J2K codestream Start-of-Codestream marker */
const J2K_SOC_MARKER = 0xff4f;

/** J2K SIZ marker (follows SOC) */
const J2K_SIZ_MARKER = 0xff51;

/** J2K CAP marker (HTJ2K indicator) */
const J2K_CAP_MARKER = 0xff50;

/** J2K SOT marker (Start of Tile-part) -- stop scanning here */
const J2K_SOT_MARKER = 0xff93;

/** JP2 Image Header box type "ihdr" */
const JP2_IHDR_TYPE = 'ihdr';

/** JP2 Colour Specification box type "colr" (0x636F6C72) */
const JP2_COLR_TYPE = 'colr';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Basic metadata extracted from a JP2/J2K file header. */
export interface JP2FileInfo {
  width: number;
  height: number;
  numComponents: number;
  bitsPerComponent: number;
  isSigned: boolean;
  isHTJ2K: boolean;
  colorSpace: string;
  profile: number;
  tileWidth: number;
  tileHeight: number;
}

/** Options controlling the JPEG 2000 decode. */
export interface JP2DecodeOptions {
  /** Maximum resolution level to decode (0 = full resolution). */
  maxResolutionLevel?: number;
  /** Sub-region to decode. */
  region?: { x: number; y: number; w: number; h: number };
}

/** Result of a successful JPEG 2000 decode. */
export interface JP2DecodeResult {
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
  bitsPerComponent: number;
  isSigned: boolean;
  colorSpace: string;
}

// ---------------------------------------------------------------------------
// EventEmitter events for JP2WasmDecoder
// ---------------------------------------------------------------------------

export interface JP2WasmDecoderEvents extends EventMap {
  loading: void;
  ready: void;
  error: string;
  disposed: void;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a buffer contains a JPEG 2000 file.
 *
 * Checks for:
 * 1. JP2 box format -- bytes 0-3 == 0x0000000C, bytes 4-7 == "jP  ",
 *    bytes 8-11 == 0x0D0A870A (full signature validation, JP2-R06).
 * 2. Raw J2K codestream -- first two bytes are SOC (0xFF4F).
 */
export function isJP2File(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false;

  const bytes = new Uint8Array(buffer);

  // Check raw J2K codestream SOC marker (0xFF 0x4F)
  if (bytes[0] === 0xff && bytes[1] === 0x4f) {
    return true;
  }

  // Check JP2 box format: full signature validation (JP2-R06)
  if (buffer.byteLength >= 12) {
    const view = new DataView(buffer);
    const boxLength = view.getUint32(0, false);
    const sigContent = view.getUint32(8, false);

    if (
      boxLength === JP2_SIG_BOX_LENGTH &&
      bytes[4] === JP2_SIGNATURE[0] &&
      bytes[5] === JP2_SIGNATURE[1] &&
      bytes[6] === JP2_SIGNATURE[2] &&
      bytes[7] === JP2_SIGNATURE[3] &&
      sigContent === JP2_SIG_BOX_CONTENT
    ) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Header parsing helpers
// ---------------------------------------------------------------------------

/**
 * Try to find the start of the J2K codestream inside a JP2 box container.
 * Returns the byte offset of the SOC marker, or -1 if not found.
 */
function findCodestreamOffset(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  let offset = 0;

  while (offset + 8 <= buffer.byteLength) {
    let boxLen = view.getUint32(offset, false); // big-endian
    const boxType = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );

    // Handle extended box length (boxLen == 1 means 8-byte length follows)
    let headerSize = 8;
    if (boxLen === 1) {
      if (offset + 16 > buffer.byteLength) break;
      // Use lower 32 bits only (safe for files < 4 GB)
      const hiLen = view.getUint32(offset + 8, false);
      const loLen = view.getUint32(offset + 12, false);
      if (hiLen !== 0) break; // > 4 GB not supported in this parser
      boxLen = loLen;
      headerSize = 16;
    }

    // boxLen === 0 means "box extends to end of file"
    if (boxLen === 0) {
      boxLen = buffer.byteLength - offset;
    }

    if (boxType === 'jp2c') {
      const codestreamStart = offset + headerSize;
      if (codestreamStart + 2 <= buffer.byteLength) {
        return codestreamStart;
      }
    }

    if (boxLen < headerSize) break; // invalid box
    offset += boxLen;
  }

  return -1;
}

/**
 * Parse SIZ marker from a J2K codestream.
 * The reader position should be at the start of the codestream (SOC marker).
 * Returns basic image metadata or null if parsing fails.
 */
function parseSIZMarker(
  view: DataView,
  offset: number,
  byteLength: number,
): {
  width: number;
  height: number;
  numComponents: number;
  bitsPerComponent: number;
  isSigned: boolean;
  profile: number;
  tileWidth: number;
  tileHeight: number;
} | null {
  // SOC marker: 0xFF4F (2 bytes)
  if (offset + 2 > byteLength) return null;
  const soc = view.getUint16(offset, false);
  if (soc !== J2K_SOC_MARKER) return null;
  offset += 2;

  // Next marker should be SIZ (0xFF51)
  if (offset + 2 > byteLength) return null;
  const sizMarker = view.getUint16(offset, false);
  if (sizMarker !== J2K_SIZ_MARKER) return null;
  offset += 2;

  // SIZ marker segment: Lsiz (2 bytes) + Rsiz (2 bytes) + Xsiz (4) + Ysiz (4) + XOsiz (4) + YOsiz (4) + ...
  if (offset + 2 > byteLength) return null;
  const lsiz = view.getUint16(offset, false);
  if (lsiz < 41) return null; // Minimum SIZ length
  offset += 2;

  if (offset + 36 > byteLength) return null;

  // Rsiz (profile) -- JP2-R05
  const profile = view.getUint16(offset, false);
  offset += 2;

  const xsiz = view.getUint32(offset, false); // Reference grid width
  offset += 4;
  const ysiz = view.getUint32(offset, false); // Reference grid height
  offset += 4;
  const xosiz = view.getUint32(offset, false); // Horizontal image offset
  offset += 4;
  const yosiz = view.getUint32(offset, false); // Vertical image offset
  offset += 4;

  // Tile sizes -- JP2-R05
  const tileWidth = view.getUint32(offset, false);  // XTsiz
  offset += 4;
  const tileHeight = view.getUint32(offset, false); // YTsiz
  offset += 4;

  // Skip XTOsiz, YTOsiz (4 bytes each)
  offset += 8;

  if (offset + 2 > byteLength) return null;
  const csiz = view.getUint16(offset, false); // Number of components
  offset += 2;

  // Read first component's bit depth (Ssiz)
  if (offset + 1 > byteLength) return null;
  const ssiz = view.getUint8(offset);
  // Bit depth = (ssiz & 0x7F) + 1. Bit 7 indicates signed (JP2-R01).
  const isSigned = (ssiz & 0x80) !== 0;
  const bitsPerComponent = (ssiz & 0x7f) + 1;

  const width = xsiz - xosiz;
  const height = ysiz - yosiz;

  return { width, height, numComponents: csiz, bitsPerComponent, isSigned, profile, tileWidth, tileHeight };
}

/**
 * Parse JP2 Image Header (ihdr) box for dimensions and component info.
 * Returns null if the box is not found.
 */
function parseIHDRBox(
  buffer: ArrayBuffer,
): { height: number; width: number; numComponents: number; bitsPerComponent: number; isSigned: boolean } | null {
  const view = new DataView(buffer);
  let offset = 0;

  while (offset + 8 <= buffer.byteLength) {
    let boxLen = view.getUint32(offset, false);
    const boxType = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );

    let headerSize = 8;
    if (boxLen === 1) {
      if (offset + 16 > buffer.byteLength) break;
      const hiLen = view.getUint32(offset + 8, false);
      const loLen = view.getUint32(offset + 12, false);
      if (hiLen !== 0) break;
      boxLen = loLen;
      headerSize = 16;
    }
    if (boxLen === 0) boxLen = buffer.byteLength - offset;

    if (boxType === JP2_IHDR_TYPE) {
      const dataStart = offset + headerSize;
      if (dataStart + 14 > buffer.byteLength) return null;

      const height = view.getUint32(dataStart, false);
      const width = view.getUint32(dataStart + 4, false);
      const numComponents = view.getUint16(dataStart + 8, false);
      const bpc = view.getUint8(dataStart + 10);
      // Bit 7 of bpc indicates signed (JP2-R01)
      const isSigned = (bpc & 0x80) !== 0;
      const bitsPerComponent = (bpc & 0x7f) + 1;

      return { height, width, numComponents, bitsPerComponent, isSigned };
    }

    // Recurse into superboxes (jp2h contains ihdr)
    if (boxType === 'jp2h') {
      const innerBuf = buffer.slice(offset + headerSize, offset + boxLen);
      const inner = parseIHDRBox(innerBuf);
      if (inner) return inner;
    }

    if (boxLen < headerSize) break;
    offset += boxLen;
  }

  return null;
}

/**
 * Parse JP2 Colour Specification (colr) box for color space info (JP2-R02).
 *
 * Walks JP2 boxes to find "colr" box (0x636F6C72).
 * - If METH=1 (enumerated): read EnumCS: 16=sRGB, 17=greyscale, 18=sYCC
 * - If METH=2 (ICC profile): return 'icc-embedded'
 * - Returns null if no colr box found.
 */
export function parseColrBox(buffer: ArrayBuffer): string | null {
  const view = new DataView(buffer);
  let offset = 0;

  while (offset + 8 <= buffer.byteLength) {
    let boxLen = view.getUint32(offset, false);
    const boxType = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );

    let headerSize = 8;
    if (boxLen === 1) {
      if (offset + 16 > buffer.byteLength) break;
      const hiLen = view.getUint32(offset + 8, false);
      const loLen = view.getUint32(offset + 12, false);
      if (hiLen !== 0) break;
      boxLen = loLen;
      headerSize = 16;
    }
    if (boxLen === 0) boxLen = buffer.byteLength - offset;

    if (boxType === JP2_COLR_TYPE) {
      const dataStart = offset + headerSize;
      // colr box: METH (1 byte) + PREC (1 byte) + APPROX (1 byte) + then EnumCS (4 bytes) or ICC profile
      if (dataStart + 3 > buffer.byteLength) return null;
      const meth = view.getUint8(dataStart);

      if (meth === 1) {
        // Enumerated colour space
        if (dataStart + 7 > buffer.byteLength) return null;
        const enumCS = view.getUint32(dataStart + 3, false);
        switch (enumCS) {
          case 16:
            return 'sRGB';
          case 17:
            return 'greyscale';
          case 18:
            return 'sYCC';
          default:
            return `enumCS-${enumCS}`;
        }
      } else if (meth === 2) {
        return 'icc-embedded';
      }

      return null;
    }

    // Recurse into jp2h superbox
    if (boxType === 'jp2h') {
      const innerBuf = buffer.slice(offset + headerSize, offset + boxLen);
      const inner = parseColrBox(innerBuf);
      if (inner) return inner;
    }

    if (boxLen < headerSize) break;
    offset += boxLen;
  }

  return null;
}

/**
 * Detect whether the codestream uses HTJ2K (Part-15) markers (JP2-R04).
 * Walks markers properly (read marker + segment length) instead of raw byte scan.
 * Looks for CAP marker (0xFF50). Stops at SOT (0xFF93).
 */
function detectHTJ2K(view: DataView, csOffset: number, byteLength: number): boolean {
  let offset = csOffset;

  // Skip SOC marker (2 bytes)
  if (offset + 2 > byteLength) return false;
  const soc = view.getUint16(offset, false);
  if (soc !== J2K_SOC_MARKER) return false;
  offset += 2;

  // Walk markers until SOT or end of data
  while (offset + 2 <= byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    // CAP marker found -> HTJ2K
    if (marker === J2K_CAP_MARKER) {
      return true;
    }

    // SOT marker -> stop scanning main header
    if (marker === J2K_SOT_MARKER) {
      return false;
    }

    // For markers with segments, read the segment length and skip
    // Markers 0xFF30-0xFF3F are zero-length markers in JPEG 2000
    if (marker >= 0xff30 && marker <= 0xff3f) {
      continue;
    }

    // All other markers have a length field
    if (offset + 2 > byteLength) break;
    const segLen = view.getUint16(offset, false);
    offset += segLen; // segLen includes itself
  }

  return false;
}

// ---------------------------------------------------------------------------
// Header parsing (public API)
// ---------------------------------------------------------------------------

/**
 * Parse JPEG 2000 file headers and extract image metadata without full decode.
 *
 * Supports both JP2 container and raw J2K codestream formats.
 *
 * @throws DecoderError if the buffer is too small, not a JP2/J2K file,
 *         or the header is corrupt / truncated.
 */
export function parseJP2Header(buffer: ArrayBuffer): JP2FileInfo {
  if (buffer.byteLength < 2) {
    throw new DecoderError('JP2', 'Buffer too small to be a JPEG 2000 file');
  }

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // --- Raw J2K codestream ---
  if (bytes[0] === 0xff && bytes[1] === 0x4f) {
    const siz = parseSIZMarker(view, 0, buffer.byteLength);
    if (!siz) {
      throw new DecoderError('JP2', 'Failed to parse J2K SIZ marker');
    }
    const isHTJ2K = detectHTJ2K(view, 0, buffer.byteLength);
    // Fallback color space heuristic for raw J2K (no colr box)
    const colorSpace = siz.numComponents >= 3 ? 'sRGB' : 'grayscale';
    return {
      width: siz.width,
      height: siz.height,
      numComponents: siz.numComponents,
      bitsPerComponent: siz.bitsPerComponent,
      isSigned: siz.isSigned,
      isHTJ2K,
      colorSpace,
      profile: siz.profile,
      tileWidth: siz.tileWidth,
      tileHeight: siz.tileHeight,
    };
  }

  // --- JP2 container (full signature validation) ---
  if (buffer.byteLength >= 12) {
    const boxLength = view.getUint32(0, false);
    const sigContent = view.getUint32(8, false);

    if (
      boxLength === JP2_SIG_BOX_LENGTH &&
      bytes[4] === JP2_SIGNATURE[0] &&
      bytes[5] === JP2_SIGNATURE[1] &&
      bytes[6] === JP2_SIGNATURE[2] &&
      bytes[7] === JP2_SIGNATURE[3] &&
      sigContent === JP2_SIG_BOX_CONTENT
    ) {
      // Parse colr box for color space (JP2-R02)
      const parsedColorSpace = parseColrBox(buffer);

      // Try ihdr box first (faster, no codestream parsing needed)
      const ihdr = parseIHDRBox(buffer);

      // Also try to get SIZ info for profile/tile metadata
      const csOff = findCodestreamOffset(buffer);
      const sizInfo = csOff >= 0 ? parseSIZMarker(view, csOff, buffer.byteLength) : null;

      if (ihdr) {
        const isHTJ2K = csOff >= 0 ? detectHTJ2K(view, csOff, buffer.byteLength) : false;

        // Use parsed colr box, or fallback to component count heuristic
        const colorSpace = parsedColorSpace ?? (ihdr.numComponents >= 3 ? 'sRGB' : 'grayscale');

        return {
          width: ihdr.width,
          height: ihdr.height,
          numComponents: ihdr.numComponents,
          bitsPerComponent: ihdr.bitsPerComponent,
          isSigned: ihdr.isSigned,
          isHTJ2K,
          colorSpace,
          profile: sizInfo?.profile ?? 0,
          tileWidth: sizInfo?.tileWidth ?? ihdr.width,
          tileHeight: sizInfo?.tileHeight ?? ihdr.height,
        };
      }

      // Fallback: parse the codestream SIZ marker
      if (csOff >= 0 && sizInfo) {
        const isHTJ2K = detectHTJ2K(view, csOff, buffer.byteLength);
        const colorSpace = parsedColorSpace ?? (sizInfo.numComponents >= 3 ? 'sRGB' : 'grayscale');
        return {
          width: sizInfo.width,
          height: sizInfo.height,
          numComponents: sizInfo.numComponents,
          bitsPerComponent: sizInfo.bitsPerComponent,
          isSigned: sizInfo.isSigned,
          isHTJ2K,
          colorSpace,
          profile: sizInfo.profile,
          tileWidth: sizInfo.tileWidth,
          tileHeight: sizInfo.tileHeight,
        };
      }

      throw new DecoderError('JP2', 'Failed to parse JP2 header: no ihdr box or valid codestream found');
    }
  }

  throw new DecoderError('JP2', 'Not a JPEG 2000 file: unrecognised signature');
}

// ---------------------------------------------------------------------------
// WASM Decoder class
// ---------------------------------------------------------------------------

/**
 * JP2WasmDecoder manages the lifecycle of an openjph-based WASM module
 * for high-performance JPEG 2000 / HTJ2K decoding.
 *
 * Extends EventEmitter<JP2WasmDecoderEvents> for standard event pattern (JP2-QA-001).
 *
 * Usage:
 * ```ts
 * const decoder = new JP2WasmDecoder();
 * await decoder.init('/openjph.wasm');
 * const result = await decoder.decode(buffer);
 * decoder.dispose();
 * ```
 *
 * When no WASM module is loaded, `decode()` throws a clear error so callers
 * can fall back to a different strategy.
 */
export class JP2WasmDecoder extends EventEmitter<JP2WasmDecoderEvents> {
  private _ready = false;
  private _wasmModule: unknown = null;
  private _initPromise: Promise<void> | null = null;

  // -- Lifecycle --

  /** Returns true when the WASM module has been loaded and is ready. */
  isReady(): boolean {
    return this._ready;
  }

  /**
   * Initialise the WASM decoder module.
   *
   * Has re-entrancy guard (JP2-R08/QA-002): concurrent callers share the
   * same init promise. Only retries after error (clears promise on error).
   *
   * @param wasmUrl - URL or path to the openjph WASM binary.
   *                  When omitted, uses the default bundled path.
   * @throws DecoderError if loading fails.
   */
  async init(wasmUrl?: string): Promise<void> {
    if (this._ready) return;

    // Re-entrancy guard: return pending promise for concurrent callers
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._doInit(wasmUrl);
    try {
      await this._initPromise;
    } catch (err) {
      // Clear promise on error to allow retry
      this._initPromise = null;
      throw err;
    }
  }

  private async _doInit(wasmUrl?: string): Promise<void> {
    this.emit('loading', undefined as unknown as void);

    try {
      // In a real implementation, this would fetch and instantiate the WASM module.
      // The mock / test environment can replace this with a stub via subclass.
      const url = wasmUrl ?? '/openjph.wasm';
      const module = await this._loadWasmModule(url);
      this._wasmModule = module;
      this._ready = true;
      this.emit('ready', undefined as unknown as void);
    } catch (err) {
      this.emit('error', err instanceof Error ? err.message : String(err));
      throw new DecoderError('JP2', `Failed to load WASM module: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Decode a JPEG 2000 buffer using the loaded WASM module.
   *
   * @throws DecoderError if WASM is not loaded or decoding fails.
   */
  async decode(buffer: ArrayBuffer, options?: JP2DecodeOptions): Promise<JP2DecodeResult> {
    if (!this._ready || !this._wasmModule) {
      throw new DecoderError('JP2', 'JP2 WASM module not loaded');
    }

    // In a real implementation, this would call into the WASM module.
    // The test environment replaces _wasmModule with a mock that exposes decode().
    const mod = this._wasmModule as {
      decode: (
        buf: ArrayBuffer,
        opts?: JP2DecodeOptions,
      ) => JP2DecodeResult | Promise<JP2DecodeResult>;
    };

    const result = await mod.decode(buffer, options);
    return result;
  }

  /**
   * Release WASM resources. Safe to call multiple times (JP2-R09, JP2-QA-009).
   * Calls destroy() on WASM module if available, and removes all listeners.
   */
  dispose(): void {
    if (this._wasmModule) {
      // Call destroy() on WASM module if available (JP2-R09)
      const mod = this._wasmModule as { destroy?: () => void };
      if (typeof mod.destroy === 'function') {
        mod.destroy();
      }
      this._wasmModule = null;
      this._ready = false;
      this._initPromise = null;
      this.emit('disposed', undefined as unknown as void);
      // Clear all listeners (JP2-QA-009)
      this.removeAllListeners();
    }
  }

  // -- Internal --

  /**
   * Load the WASM module. Separated for testability (JP2-QA-003).
   * In production this would use WebAssembly.instantiateStreaming.
   * Tests can override this via subclass.
   *
   * @internal
   */
  protected async _loadWasmModule(_url: string): Promise<unknown> {
    // Default implementation throws -- real WASM binary must be provided.
    throw new Error('WASM module not available');
  }
}

// ---------------------------------------------------------------------------
// Output normalization helper (JP2-R07)
// ---------------------------------------------------------------------------

/**
 * Normalize integer decode output to [0,1] Float32Array.
 * - Unsigned: value / (2^bpc - 1)
 * - Signed: (value + 2^(bpc-1)) / (2^bpc - 1)
 */
function normalizeToFloat32(
  data: Float32Array,
  bitsPerComponent: number,
  isSigned: boolean,
): Float32Array {
  if (bitsPerComponent < 1 || bitsPerComponent > 16) {
    return data; // Only normalize for supported bit depths (1–16)
  }

  // Use Math.pow to avoid 32-bit shift overflow for bpc > 30
  const maxVal = Math.pow(2, bitsPerComponent) - 1;
  const result = new Float32Array(data.length);

  if (isSigned) {
    const offset = Math.pow(2, bitsPerComponent - 1);
    for (let i = 0; i < data.length; i++) {
      result[i] = (data[i]! + offset) / maxVal;
    }
  } else {
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i]! / maxVal;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Module-level WASM decoder for registry adapter (JP2-R03)
// ---------------------------------------------------------------------------

let _jp2WasmDecoder: JP2WasmDecoder | null = null;

/**
 * Set the module-level JP2 WASM decoder instance for use by the registry adapter.
 * Call this after initializing a JP2WasmDecoder to enable JP2 decoding via the registry.
 */
export function setJP2WasmDecoder(decoder: JP2WasmDecoder | null): void {
  _jp2WasmDecoder = decoder;
}

/**
 * Get the module-level JP2 WASM decoder instance.
 * Returns null if none has been set.
 */
export function getJP2WasmDecoder(): JP2WasmDecoder | null {
  return _jp2WasmDecoder;
}

// ---------------------------------------------------------------------------
// High-level decode function
// ---------------------------------------------------------------------------

/**
 * Decode a JPEG 2000 file.
 *
 * Tries the WASM decoder first if a module instance is provided.
 * Falls back to the module-level decoder, then throws a descriptive error.
 *
 * Includes dimension validation (JP2-QA-004) and output normalization (JP2-R07).
 *
 * @param buffer - The JP2/J2K file data.
 * @param options - Decode options.
 * @param wasmDecoder - Optional pre-initialised WASM decoder instance.
 * @throws DecoderError when the file is not a valid JP2/J2K or WASM is unavailable.
 */
export async function decodeJP2(
  buffer: ArrayBuffer,
  options?: JP2DecodeOptions,
  wasmDecoder?: JP2WasmDecoder,
): Promise<JP2DecodeResult> {
  if (!isJP2File(buffer)) {
    throw new DecoderError('JP2', 'Invalid JPEG 2000 file: wrong magic signature');
  }

  // Parse header for dimension validation and metadata
  const info = parseJP2Header(buffer);

  // Validate dimensions (JP2-QA-004)
  validateImageDimensions(info.width, info.height, 'JP2');

  // Select decoder: explicit argument > module-level > error
  const decoder = wasmDecoder ?? _jp2WasmDecoder;

  if (decoder && decoder.isReady()) {
    const result = await decoder.decode(buffer, options);

    // Normalize integer data to [0,1] float (JP2-R07)
    // Only normalize for standard bit depths (1–16). Higher bit depths or
    // float-native WASM output are assumed to be pre-normalized.
    if (result.bitsPerComponent >= 1 && result.bitsPerComponent <= 16) {
      return {
        ...result,
        data: normalizeToFloat32(result.data, result.bitsPerComponent, result.isSigned),
      };
    }

    return result;
  }

  // No WASM available -- throw helpful error
  throw new DecoderError('JP2', 'JP2 WASM module not loaded. Call JP2WasmDecoder.init() first or provide a loaded decoder instance.');
}

