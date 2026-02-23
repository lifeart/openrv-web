/**
 * Decoder Registry
 *
 * Central registry for image format decoders.
 * Provides format detection by magic number and decoder dispatch.
 *
 * Detection functions (magic byte checks) are inlined here to avoid
 * statically importing heavy decoder modules. Full decoder modules are
 * lazy-loaded via dynamic import() on first use, so they don't contribute
 * to initial bundle cost.
 */

export type FormatName = 'exr' | 'dpx' | 'cineon' | 'tiff' | 'jpeg-gainmap' | 'heic-gainmap' | 'avif-gainmap' | 'raw-preview' | 'hdr' | 'jxl' | 'jp2' | 'mxf' | null;

/** Result returned by FormatDecoder.decode() and detectAndDecode() */
export interface DecodeResult {
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
  colorSpace: string;
  metadata: Record<string, unknown>;
}

export interface FormatDecoder {
  formatName: string;
  canDecode(buffer: ArrayBuffer): boolean;
  decode(
    buffer: ArrayBuffer,
    options?: Record<string, unknown>
  ): Promise<DecodeResult>;
}

// =============================================================================
// Inline detection helpers
//
// These are inlined to avoid static imports of heavy decoder modules,
// enabling Vite/Rollup to code-split them into lazy chunks.
// =============================================================================

// --- ISOBMFF box helpers (shared by HEIC, JXL, JP2 detection) ---

function readBoxTypeAt(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function findBoxInRange(
  view: DataView,
  type: string,
  start: number,
  end: number,
  isFullBox = false
): { dataStart: number; dataEnd: number } | null {
  let offset = start;
  while (offset + 8 <= end) {
    const boxSize = view.getUint32(offset);
    if (boxSize < 8 || offset + boxSize > end) break;
    if (readBoxTypeAt(view, offset + 4) === type) {
      const headerSize = isFullBox ? 12 : 8;
      return { dataStart: offset + headerSize, dataEnd: offset + boxSize };
    }
    offset += boxSize;
  }
  return null;
}

// --- EXR detection ---

const EXR_MAGIC = 0x01312f76;

function isEXRFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  return new DataView(buffer).getUint32(0, true) === EXR_MAGIC;
}

// --- DPX detection ---

const DPX_MAGIC_BE = 0x53445058; // "SDPX"
const DPX_MAGIC_LE = 0x58504453; // "XPDS"

function isDPXFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const magic = new DataView(buffer).getUint32(0, false);
  return magic === DPX_MAGIC_BE || magic === DPX_MAGIC_LE;
}

// --- Cineon detection ---

const CINEON_MAGIC = 0x802a5fd7;

function isCineonFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  return new DataView(buffer).getUint32(0, false) === CINEON_MAGIC;
}

// --- TIFF / Float TIFF detection ---

const TIFF_LE_MARK = 0x4949; // "II"
const TIFF_BE_MARK = 0x4d4d; // "MM"
const TIFF_MAGIC_42 = 42;
const TAG_ID_BITS_PER_SAMPLE = 258;
const TAG_ID_SAMPLE_FORMAT = 339;
const SAMPLE_FMT_FLOAT = 3;

function isTIFFAndFloat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const view = new DataView(buffer);
  const byteOrder = view.getUint16(0, false);
  if (byteOrder !== TIFF_LE_MARK && byteOrder !== TIFF_BE_MARK) return false;
  const le = byteOrder === TIFF_LE_MARK;
  if (view.getUint16(2, le) !== TIFF_MAGIC_42) return false;

  // Parse first IFD to check SampleFormat and BitsPerSample
  const ifdOffset = view.getUint32(4, le);
  if (ifdOffset + 2 > buffer.byteLength) return false;
  const numEntries = view.getUint16(ifdOffset, le);

  let bitsPerSample = 8;
  let sampleFormat = 1; // uint default

  for (let i = 0; i < numEntries; i++) {
    const pos = ifdOffset + 2 + i * 12;
    if (pos + 12 > buffer.byteLength) break;
    const tagId = view.getUint16(pos, le);
    const tagType = view.getUint16(pos + 2, le);

    if (tagId === TAG_ID_BITS_PER_SAMPLE || tagId === TAG_ID_SAMPLE_FORMAT) {
      let val: number;
      if (tagType === 3) { // SHORT
        val = view.getUint16(pos + 8, le);
      } else if (tagType === 4) { // LONG
        val = view.getUint32(pos + 8, le);
      } else {
        continue;
      }
      if (tagId === TAG_ID_BITS_PER_SAMPLE) bitsPerSample = val;
      if (tagId === TAG_ID_SAMPLE_FORMAT) sampleFormat = val;
    }
  }

  return sampleFormat === SAMPLE_FMT_FLOAT && bitsPerSample === 32;
}

// --- JPEG Gainmap detection ---

function isGainmapJPEG(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const view = new DataView(buffer);
  if (view.getUint16(0) !== 0xFFD8) return false;
  // Scan for MPF APP2 marker
  return findMPFMarker(view) !== -1;
}

function findMPFMarker(view: DataView): number {
  let offset = 2; // Skip SOI
  const length = view.byteLength;

  while (offset < length - 4) {
    if (view.getUint8(offset) !== 0xFF) { offset++; continue; }
    const marker = view.getUint8(offset + 1);
    if (marker === 0xDA || marker === 0xD9) break; // SOS or EOI
    if (marker === 0xFF) { offset++; continue; } // padding
    if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0xD8 || marker === 0x01) {
      offset += 2; continue; // standalone markers
    }
    if (offset + 3 >= length) break;
    const segLen = view.getUint16(offset + 2);
    if (segLen < 2) break;
    // APP2 (0xE2) with 'MPF\0'
    if (marker === 0xE2 && offset + 7 < length &&
        view.getUint8(offset + 4) === 0x4D &&
        view.getUint8(offset + 5) === 0x50 &&
        view.getUint8(offset + 6) === 0x46 &&
        view.getUint8(offset + 7) === 0x00) {
      return offset;
    }
    offset += 2 + segLen;
  }
  return -1;
}

// --- AVIF Gainmap detection ---

function isGainmapAVIF(buffer: ArrayBuffer): boolean {
  // Check AVIF file (ftyp with AVIF brands, excluding HEIC)
  if (buffer.byteLength < 16) return false;
  const view = new DataView(buffer);
  if (readBoxTypeAt(view, 4) !== 'ftyp') return false;
  const ftypSize = view.getUint32(0);
  if (ftypSize < 16 || ftypSize > buffer.byteLength) return false;

  const majorBrand = readBoxTypeAt(view, 8);
  if (HEIC_BRANDS.has(majorBrand)) return false;

  let isAVIF = AVIF_BRANDS.has(majorBrand);
  if (!isAVIF && majorBrand === 'mif1') {
    for (let offset = 16; offset + 4 <= ftypSize; offset += 4) {
      const compat = readBoxTypeAt(view, offset);
      if (HEIC_BRANDS.has(compat)) return false;
      if (AVIF_BRANDS.has(compat)) { isAVIF = true; break; }
    }
  }
  if (!isAVIF) return false;

  // Look for gainmap auxC in meta -> iprp -> ipco
  const meta = findBoxInRange(view, 'meta', ftypSize, buffer.byteLength, true);
  if (!meta) return false;
  const iprp = findBoxInRange(view, 'iprp', meta.dataStart, meta.dataEnd);
  if (!iprp) return false;
  const ipco = findBoxInRange(view, 'ipco', iprp.dataStart, iprp.dataEnd);
  if (!ipco) return false;

  // Scan ipco for auxC box with gainmap URN
  let offset = ipco.dataStart;
  while (offset + 8 <= ipco.dataEnd) {
    const boxSize = view.getUint32(offset);
    if (boxSize < 8 || offset + boxSize > ipco.dataEnd) break;
    if (readBoxTypeAt(view, offset + 4) === 'auxC') {
      // auxC is FullBox: header(8) + version+flags(4) then null-terminated URN
      const urnStart = offset + 12;
      const urnEnd = offset + boxSize;
      if (urnStart < urnEnd) {
        const chars: string[] = [];
        for (let i = urnStart; i < urnEnd; i++) {
          const c = view.getUint8(i);
          if (c === 0) break;
          chars.push(String.fromCharCode(c));
        }
        const urn = chars.join('');
        if (urn === APPLE_GAINMAP_URN || urn === ISO_GAINMAP_URN) return true;
      }
    }
    offset += boxSize;
  }
  return false;
}

// --- RAW Preview detection ---

const RAW_TIFF_LE = 0x4949;
const RAW_TIFF_BE = 0x4d4d;

function isRAWPreviewFile(buffer: ArrayBuffer): boolean {
  // RAW files use TIFF as container but are NOT float TIFFs.
  // Check for TIFF header (II or MM + magic 42) and exclude float TIFFs.
  if (buffer.byteLength < 8) return false;
  const view = new DataView(buffer);
  const byteOrder = view.getUint16(0, false);
  if (byteOrder !== RAW_TIFF_LE && byteOrder !== RAW_TIFF_BE) return false;
  const le = byteOrder === RAW_TIFF_LE;
  if (view.getUint16(2, le) !== 42) return false;

  // Exclude float TIFFs (already handled by tiffDecoder above in the chain)
  if (isTIFFAndFloat(buffer)) return false;

  return true;
}

// --- Radiance HDR detection ---

function isHDRFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 6) return false;
  const len = Math.min(buffer.byteLength, 10);
  const bytes = new Uint8Array(buffer, 0, len);
  const header = String.fromCharCode(...bytes);
  return header.startsWith('#?RADIANCE') || header.startsWith('#?RGBE');
}

// --- JPEG XL detection ---

function isJXLFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false;
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 12));
  // Bare codestream magic
  if (bytes[0] === 0xFF && bytes[1] === 0x0A) return true;
  // ISOBMFF container: ftyp box with 'jxl ' brand
  if (buffer.byteLength >= 12) {
    const view = new DataView(buffer);
    if (readBoxTypeAt(view, 4) === 'ftyp' && readBoxTypeAt(view, 8) === 'jxl ') return true;
  }
  return false;
}

// --- HEIC Gainmap detection ---

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevx']);
const AVIF_BRANDS = new Set(['avif', 'avis']);
const APPLE_GAINMAP_URN = 'urn:com:apple:photo:2020:aux:hdrgainmap';
const ISO_GAINMAP_URN = 'urn:com:photo:aux:hdrgainmap';

function isGainmapHEIC(buffer: ArrayBuffer): boolean {
  // Check HEIC file (ftyp with HEIC brands, excluding AVIF)
  if (buffer.byteLength < 16) return false;
  const view = new DataView(buffer);
  if (readBoxTypeAt(view, 4) !== 'ftyp') return false;
  const ftypSize = view.getUint32(0);
  if (ftypSize < 16 || ftypSize > buffer.byteLength) return false;

  const majorBrand = readBoxTypeAt(view, 8);
  if (AVIF_BRANDS.has(majorBrand)) return false;

  let isHEIC = HEIC_BRANDS.has(majorBrand);
  if (!isHEIC && majorBrand === 'mif1') {
    for (let offset = 16; offset + 4 <= ftypSize; offset += 4) {
      const compat = readBoxTypeAt(view, offset);
      if (AVIF_BRANDS.has(compat)) return false;
      if (HEIC_BRANDS.has(compat)) { isHEIC = true; break; }
    }
  }
  if (!isHEIC) return false;

  // Look for gainmap auxC in meta → iprp → ipco
  const meta = findBoxInRange(view, 'meta', ftypSize, buffer.byteLength, true);
  if (!meta) return false;
  const iprp = findBoxInRange(view, 'iprp', meta.dataStart, meta.dataEnd);
  if (!iprp) return false;
  const ipco = findBoxInRange(view, 'ipco', iprp.dataStart, iprp.dataEnd);
  if (!ipco) return false;

  // Scan ipco for auxC box with gainmap URN
  let offset = ipco.dataStart;
  while (offset + 8 <= ipco.dataEnd) {
    const boxSize = view.getUint32(offset);
    if (boxSize < 8 || offset + boxSize > ipco.dataEnd) break;
    if (readBoxTypeAt(view, offset + 4) === 'auxC') {
      // auxC is FullBox: header(8) + version+flags(4) then null-terminated URN
      const urnStart = offset + 12;
      const urnEnd = offset + boxSize;
      if (urnStart < urnEnd) {
        const chars: string[] = [];
        for (let i = urnStart; i < urnEnd; i++) {
          const c = view.getUint8(i);
          if (c === 0) break;
          chars.push(String.fromCharCode(c));
        }
        const urn = chars.join('');
        if (urn === APPLE_GAINMAP_URN || urn === ISO_GAINMAP_URN) return true;
      }
    }
    offset += boxSize;
  }
  return false;
}

// --- JPEG 2000 / HTJ2K detection ---

function isJP2File(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false;
  const bytes = new Uint8Array(buffer);
  // Raw J2K codestream SOC marker
  if (bytes[0] === 0xFF && bytes[1] === 0x4F) return true;
  // JP2 box format signature
  if (buffer.byteLength >= 12) {
    const view = new DataView(buffer);
    if (view.getUint32(0, false) === 0x0000000C &&
        bytes[4] === 0x6A && bytes[5] === 0x50 && bytes[6] === 0x20 && bytes[7] === 0x20 &&
        view.getUint32(8, false) === 0x0D0A870A) {
      return true;
    }
  }
  return false;
}

// --- MXF detection ---

function isMXFFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const bytes = new Uint8Array(buffer, 0, 8);
  // SMPTE UL prefix for partition pack
  return bytes[0] === 0x06 && bytes[1] === 0x0E && bytes[2] === 0x2B && bytes[3] === 0x34 &&
         bytes[4] === 0x02 && bytes[5] === 0x05 && bytes[6] === 0x01 && bytes[7] === 0x01;
}

// =============================================================================
// Decoder adapters (lazy-load full modules via dynamic import)
// =============================================================================

/**
 * EXR format decoder adapter
 */
const exrDecoder: FormatDecoder = {
  formatName: 'exr',
  canDecode: isEXRFile,
  async decode(buffer: ArrayBuffer) {
    const { decodeEXR } = await import('./EXRDecoder');
    const result = await decodeEXR(buffer);
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: 'linear',
      metadata: {
        format: 'exr',
        compression: result.header.compression,
      },
    };
  },
};

/**
 * DPX format decoder adapter
 */
const dpxDecoder: FormatDecoder = {
  formatName: 'dpx',
  canDecode: isDPXFile,
  async decode(buffer: ArrayBuffer, options?: Record<string, unknown>) {
    const { decodeDPX } = await import('./DPXDecoder');
    const result = await decodeDPX(buffer, {
      applyLogToLinear: (options?.applyLogToLinear as boolean) ?? false,
    });
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: result.colorSpace,
      metadata: result.metadata,
    };
  },
};

/**
 * Cineon format decoder adapter
 */
const cineonDecoder: FormatDecoder = {
  formatName: 'cineon',
  canDecode: isCineonFile,
  async decode(buffer: ArrayBuffer, options?: Record<string, unknown>) {
    const { decodeCineon } = await import('./CineonDecoder');
    const result = await decodeCineon(buffer, {
      applyLogToLinear: (options?.applyLogToLinear as boolean) ?? true,
    });
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: result.colorSpace,
      metadata: result.metadata,
    };
  },
};

/**
 * TIFF float format decoder adapter
 */
const tiffDecoder: FormatDecoder = {
  formatName: 'tiff',
  canDecode: isTIFFAndFloat,
  async decode(buffer: ArrayBuffer) {
    const { decodeTIFFFloat } = await import('./TIFFFloatDecoder');
    const result = await decodeTIFFFloat(buffer);
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: result.colorSpace,
      metadata: result.metadata,
    };
  },
};

/**
 * JPEG Gainmap format decoder adapter
 */
const jpegGainmapDecoder: FormatDecoder = {
  formatName: 'jpeg-gainmap',
  canDecode: isGainmapJPEG,
  async decode(buffer: ArrayBuffer) {
    const { parseGainmapJPEG, decodeGainmapToFloat32 } = await import('./JPEGGainmapDecoder');
    const info = parseGainmapJPEG(buffer);
    if (!info) {
      throw new Error('Failed to parse JPEG gainmap metadata');
    }
    const result = await decodeGainmapToFloat32(buffer, info);
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: 'linear',
      metadata: {
        formatName: 'jpeg-gainmap',
        headroom: info.headroom,
      },
    };
  },
};

/**
 * HEIC Gainmap format decoder adapter
 */
const heicGainmapDecoder: FormatDecoder = {
  formatName: 'heic-gainmap',
  canDecode: isGainmapHEIC,
  async decode(buffer: ArrayBuffer) {
    const { parseHEICGainmapInfo, decodeHEICGainmapToFloat32 } = await import('./HEICGainmapDecoder');
    const info = parseHEICGainmapInfo(buffer);
    if (!info) {
      throw new Error('Failed to parse HEIC gainmap metadata');
    }
    const result = await decodeHEICGainmapToFloat32(buffer, info);
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: 'linear',
      metadata: {
        formatName: 'heic-gainmap',
        headroom: info.headroom,
      },
    };
  },
};

/**
 * AVIF Gainmap format decoder adapter
 */
const avifGainmapDecoder: FormatDecoder = {
  formatName: 'avif-gainmap',
  canDecode: isGainmapAVIF,
  async decode(buffer: ArrayBuffer) {
    const { parseGainmapAVIF, decodeAVIFGainmapToFloat32 } = await import('./AVIFGainmapDecoder');
    const info = parseGainmapAVIF(buffer);
    if (!info) {
      throw new Error('Failed to parse AVIF gainmap metadata');
    }
    const result = await decodeAVIFGainmapToFloat32(buffer, info);
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: 'linear',
      metadata: {
        formatName: 'avif-gainmap',
        headroom: info.headroom,
      },
    };
  },
};

/**
 * RAW Preview format decoder adapter.
 * Extracts the largest embedded JPEG preview from camera RAW files
 * (CR2, NEF, ARW, DNG, etc.) without decoding RAW sensor data.
 * The returned image is the SDR JPEG preview decoded to float32.
 */
const rawPreviewDecoder: FormatDecoder = {
  formatName: 'raw-preview',
  canDecode: isRAWPreviewFile,
  async decode(buffer: ArrayBuffer) {
    const { extractRAWPreview } = await import('./RAWPreviewDecoder');
    const preview = extractRAWPreview(buffer);
    if (!preview) {
      throw new Error('Failed to extract RAW preview JPEG');
    }
    // Decode the embedded JPEG preview to pixel data via createImageBitmap
    const bitmap = await createImageBitmap(preview.jpegBlob);
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : (() => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; })();
    const ctx = canvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const float32 = new Float32Array(width * height * 4);
    const scale = 1.0 / 255.0;
    for (let i = 0; i < pixels.length; i++) {
      float32[i] = (pixels[i] ?? 0) * scale;
    }
    return {
      width,
      height,
      data: float32,
      channels: 4,
      colorSpace: 'srgb',
      metadata: {
        formatName: 'raw-preview',
        make: preview.exif.make,
        model: preview.exif.model,
        iso: preview.exif.iso,
        orientation: preview.exif.orientation,
      },
    };
  },
};

/**
 * Radiance HDR format decoder adapter
 */
const hdrDecoder: FormatDecoder = {
  formatName: 'hdr',
  canDecode: isHDRFile,
  async decode(buffer: ArrayBuffer) {
    const { decodeHDR } = await import('./HDRDecoder');
    const result = await decodeHDR(buffer);
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: result.colorSpace,
      metadata: result.metadata,
    };
  },
};

/**
 * JPEG XL format decoder adapter
 */
const jxlDecoder: FormatDecoder = {
  formatName: 'jxl',
  canDecode: isJXLFile,
  async decode(buffer: ArrayBuffer) {
    const { decodeJXL } = await import('./JXLDecoder');
    const result = await decodeJXL(buffer);
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: result.colorSpace,
      metadata: result.metadata,
    };
  },
};

/**
 * JPEG 2000 / HTJ2K format decoder adapter
 */
const jp2Decoder: FormatDecoder = {
  formatName: 'jp2',
  canDecode: isJP2File,
  async decode(buffer: ArrayBuffer) {
    const { decodeJP2, getJP2WasmDecoder } = await import('./JP2Decoder');
    const wasmDecoder = getJP2WasmDecoder() ?? undefined;
    const result = await decodeJP2(buffer, undefined, wasmDecoder);
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: result.colorSpace,
      metadata: {
        format: 'jp2',
        bitsPerComponent: result.bitsPerComponent,
        isSigned: result.isSigned,
      },
    };
  },
};

/**
 * MXF container format adapter — METADATA-ONLY.
 *
 * MXF is a professional media container (SMPTE 377M) that wraps encoded video/audio
 * essence. This adapter only parses the MXF header partition to extract structural
 * metadata (codec, resolution, edit rate, duration, etc.). It does NOT decode video
 * frames — the returned pixel data is a dummy 1x1 RGBA image.
 *
 * OpenRV compatibility: OpenRV CAN decode and display MXF frames via its FFmpeg
 * backend (MovieFFMpeg.cpp registers MXF with full video capabilities). Our web
 * implementation is metadata-only because WebCodecs does not directly support MXF
 * containers — the essence must be extracted and re-wrapped or decoded separately.
 *
 * Consumers should inspect `metadata.mxfWidth` / `metadata.mxfHeight` for the actual
 * frame dimensions and use a dedicated MXF essence decoder for pixel access.
 */
const mxfDecoder: FormatDecoder = {
  formatName: 'mxf',
  canDecode: isMXFFile,
  async decode(buffer: ArrayBuffer) {
    const { parseMXFHeader } = await import('./MXFDemuxer');
    const meta = parseMXFHeader(buffer);
    const videoDesc = meta.essenceDescriptors.find(d => d.type === 'video');
    return {
      // Dummy 1x1 pixel — MXF adapter is metadata-only, no pixel decoding is performed
      width: 1,
      height: 1,
      data: new Float32Array(4),
      channels: 4,
      colorSpace: videoDesc?.colorSpace ?? 'unknown',
      metadata: {
        format: 'mxf',
        /** True — this decode result contains only metadata, not real pixel data */
        metadataOnly: true,
        mxfWidth: videoDesc?.width,
        mxfHeight: videoDesc?.height,
        operationalPattern: meta.operationalPattern,
        codec: videoDesc?.codec ?? 'unknown',
        editRate: meta.editRate,
        duration: meta.duration,
        essenceDescriptors: meta.essenceDescriptors,
      },
    };
  },
};

/**
 * Registry for image format decoders.
 * Detects format by magic number and dispatches to the appropriate decoder.
 */
export class DecoderRegistry {
  private decoders: FormatDecoder[] = [];

  constructor() {
    // Register built-in decoders in detection order.
    // EXR first (most common in VFX), then DPX, Cineon, TIFF (float only),
    // RAW preview (TIFF-based but non-float), JPEG Gainmap, HEIC/AVIF Gainmap, HDR, etc.
    this.decoders.push(exrDecoder);
    this.decoders.push(dpxDecoder);
    this.decoders.push(cineonDecoder);
    this.decoders.push(tiffDecoder);
    this.decoders.push(rawPreviewDecoder);
    this.decoders.push(jpegGainmapDecoder);
    this.decoders.push(heicGainmapDecoder);
    this.decoders.push(avifGainmapDecoder);
    this.decoders.push(hdrDecoder);
    this.decoders.push(jxlDecoder);
    this.decoders.push(jp2Decoder);
    this.decoders.push(mxfDecoder);
  }

  /**
   * Detect the format of a buffer by checking magic numbers
   */
  detectFormat(buffer: ArrayBuffer): FormatName {
    for (const decoder of this.decoders) {
      if (decoder.canDecode(buffer)) {
        return decoder.formatName as FormatName;
      }
    }
    return null;
  }

  /**
   * Get the appropriate decoder for a buffer
   */
  getDecoder(buffer: ArrayBuffer): FormatDecoder | null {
    for (const decoder of this.decoders) {
      if (decoder.canDecode(buffer)) {
        return decoder;
      }
    }
    return null;
  }

  /**
   * Detect the format and decode in one step.
   * Iterates registered decoders, calls each decoder's canDecode() check,
   * and returns the first match's decode result.
   *
   * @param buffer - The raw file data
   * @param options - Decoder-specific options (passed through to the matched decoder)
   * @returns The decode result with format name, or null if no decoder matched
   */
  async detectAndDecode(
    buffer: ArrayBuffer,
    options?: Record<string, unknown>
  ): Promise<(DecodeResult & { formatName: string }) | null> {
    const decoder = this.getDecoder(buffer);
    if (!decoder) {
      return null;
    }
    const result = await decoder.decode(buffer, options);
    return { ...result, formatName: decoder.formatName };
  }

  /**
   * Register a new format decoder
   * New decoders are added to the end of the detection chain
   */
  registerDecoder(decoder: FormatDecoder): void {
    // Avoid duplicates
    const existing = this.decoders.findIndex(d => d.formatName === decoder.formatName);
    if (existing >= 0) {
      this.decoders[existing] = decoder;
    } else {
      this.decoders.push(decoder);
    }
  }
}

/** Pre-populated singleton registry with all built-in format decoders */
export const decoderRegistry = new DecoderRegistry();
