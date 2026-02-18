/**
 * Decoder Registry
 *
 * Central registry for image format decoders.
 * Provides format detection by magic number and decoder dispatch.
 *
 * Detection functions (magic byte checks) are eagerly imported since they
 * are lightweight. Full decoder modules are lazy-loaded via dynamic import()
 * on first use, so they don't contribute to initial bundle cost.
 */

import { isEXRFile } from './EXRDecoder';
import { isDPXFile } from './DPXDecoder';
import { isCineonFile } from './CineonDecoder';
import { isTIFFFile, isFloatTIFF } from './TIFFFloatDecoder';
import { isGainmapJPEG } from './JPEGGainmapDecoder';
import { isHDRFile } from './HDRDecoder';
import { isJXLFile } from './JXLDecoder';
import { isGainmapHEIC } from './HEICGainmapDecoder';
import { isJP2File } from './JP2Decoder';
import { isMXFFile } from './MXFDemuxer';

export type FormatName = 'exr' | 'dpx' | 'cineon' | 'tiff' | 'jpeg-gainmap' | 'heic-gainmap' | 'hdr' | 'jxl' | 'jp2' | 'mxf' | null;

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

/**
 * EXR format decoder adapter
 * Detection is sync (magic byte check); decoding lazy-loads the full module.
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
 * Detection is sync (magic byte check); decoding lazy-loads the full module.
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
 * Detection is sync (magic byte check); decoding lazy-loads the full module.
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
 * Detection is sync (magic byte + header parse); decoding lazy-loads the full module.
 */
const tiffDecoder: FormatDecoder = {
  formatName: 'tiff',
  canDecode(buffer: ArrayBuffer): boolean {
    return isTIFFFile(buffer) && isFloatTIFF(buffer);
  },
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
 * Detection is sync (JPEG SOI + MPF APP2 marker check); decoding lazy-loads the full module.
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
 * Detection is sync (ftyp brand + auxC check); decoding lazy-loads the full module.
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
 * Radiance HDR format decoder adapter
 * Detection is sync (magic byte check); decoding lazy-loads the full module.
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
 * Detection is sync (magic byte check); decoding lazy-loads the full module.
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
 * Detection is sync (magic byte check); decoding lazy-loads the full module.
 * Uses the module-level WASM decoder set via setJP2WasmDecoder().
 * Note: actual decoding requires a WASM module (openjph). Without it,
 * decode() throws a descriptive error for graceful fallback.
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
 * MXF container format adapter
 * Detection is sync (SMPTE UL prefix check). MXF is a container, not a single
 * image format, so "decoding" extracts the first video essence descriptor's
 * metadata and returns a 1x1 diagnostic pixel. This allows the registry to
 * identify MXF files and report their contents.
 */
const mxfDecoder: FormatDecoder = {
  formatName: 'mxf',
  canDecode: isMXFFile,
  async decode(buffer: ArrayBuffer) {
    const { parseMXFHeader } = await import('./MXFDemuxer');
    const meta = parseMXFHeader(buffer);
    const videoDesc = meta.essenceDescriptors.find(d => d.type === 'video');
    return {
      width: 1,
      height: 1,
      data: new Float32Array(4),
      channels: 4,
      colorSpace: videoDesc?.colorSpace ?? 'unknown',
      metadata: {
        format: 'mxf',
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
    // Register built-in decoders in detection order
    // EXR first (most common in VFX), then DPX, Cineon, TIFF, JPEG Gainmap, HDR
    this.decoders.push(exrDecoder);
    this.decoders.push(dpxDecoder);
    this.decoders.push(cineonDecoder);
    this.decoders.push(tiffDecoder);
    this.decoders.push(jpegGainmapDecoder);
    this.decoders.push(heicGainmapDecoder);
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
