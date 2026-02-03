/**
 * Decoder Registry
 *
 * Central registry for image format decoders.
 * Provides format detection by magic number and decoder dispatch.
 */

import { isEXRFile, decodeEXR } from './EXRDecoder';
import { isDPXFile, decodeDPX } from './DPXDecoder';
import { isCineonFile, decodeCineon } from './CineonDecoder';
import { isTIFFFile, isFloatTIFF, decodeTIFFFloat } from './TIFFFloatDecoder';

export type FormatName = 'exr' | 'dpx' | 'cineon' | 'tiff' | null;

export interface FormatDecoder {
  formatName: string;
  canDecode(buffer: ArrayBuffer): boolean;
  decode(
    buffer: ArrayBuffer,
    options?: Record<string, unknown>
  ): Promise<{
    width: number;
    height: number;
    data: Float32Array;
    channels: number;
    colorSpace: string;
    metadata: Record<string, unknown>;
  }>;
}

/**
 * EXR format decoder adapter
 */
const exrDecoder: FormatDecoder = {
  formatName: 'exr',
  canDecode: isEXRFile,
  async decode(buffer: ArrayBuffer) {
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
  canDecode(buffer: ArrayBuffer): boolean {
    return isTIFFFile(buffer) && isFloatTIFF(buffer);
  },
  async decode(buffer: ArrayBuffer) {
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
 * Registry for image format decoders.
 * Detects format by magic number and dispatches to the appropriate decoder.
 */
export class DecoderRegistry {
  private decoders: FormatDecoder[] = [];

  constructor() {
    // Register built-in decoders in detection order
    // EXR first (most common in VFX), then DPX, Cineon, TIFF
    this.decoders.push(exrDecoder);
    this.decoders.push(dpxDecoder);
    this.decoders.push(cineonDecoder);
    this.decoders.push(tiffDecoder);
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
