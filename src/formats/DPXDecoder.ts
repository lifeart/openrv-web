/**
 * DPX (Digital Picture Exchange) File Format Decoder
 *
 * Supports:
 * - 8-bit, 10-bit and 12-bit (filled Method A/B or bit-packed), and 16-bit data
 * - Big-endian and little-endian byte order (file-wide, from the magic number)
 * - Image element data offset and end-of-line padding
 *
 * Not supported: run-length encoded image data (encoding = 1). No common
 * implementation (libdpx/OIIO, FFmpeg) decodes it, and such files are
 * rejected with a clear error instead of being decoded as garbage.
 * - RGB, RGBA, and Luma (grayscale) images
 * - Linear and logarithmic transfer functions
 * - Optional log-to-linear conversion
 *
 * Based on SMPTE 268M specification.
 */

import { dpxLogToLinear as _dpxLogToLinear, type LogLinearOptions } from './LogLinear';
import { validateImageDimensions, toRGBA, applyLogToLinearRGBA as sharedApplyLogToLinearRGBA } from './shared';
import { DecoderError } from '../core/errors';
import { IMAGE_LIMITS } from '../config/ImageLimits';

// Re-export for backwards compatibility
export { dpxLogToLinear } from './LogLinear';

// DPX magic numbers
const DPX_MAGIC_BE = 0x53445058; // "SDPX" - big endian
const DPX_MAGIC_LE = 0x58504453; // "XPDS" - little endian

export enum DPXTransferFunction {
  LINEAR = 0,
  LOGARITHMIC = 3,
}

export interface DPXInfo {
  width: number;
  height: number;
  bitDepth: number;
  bigEndian: boolean;
  transfer: string; // 'linear' | 'logarithmic'
  channels: number;
  dataOffset: number;
  descriptor: number;
  /** Image element packing (0 = packed, 1 = filled Method A, 2 = filled Method B) */
  packing: number;
  /** Image element encoding (0 = none, 1 = run-length encoded) */
  encoding: number;
  /** End-of-line padding in bytes (undefined when the header leaves it undefined) */
  eolPadding?: number;
}

/** DPX "undefined" marker for 32-bit unsigned header fields */
const DPX_UNDEFINED_U32 = 0xffffffff;

export interface DPXDecodeOptions {
  /** Whether to convert log data to linear (default: false for DPX) */
  applyLogToLinear?: boolean;
  /** Custom log-to-linear conversion parameters */
  logLinearOptions?: LogLinearOptions;
}

export interface DPXDecodeResult {
  width: number;
  height: number;
  data: Float32Array; // RGBA interleaved
  channels: number; // always 4
  colorSpace: 'linear' | 'log';
  metadata: Record<string, unknown>;
}

/**
 * Check if a buffer contains a DPX file by checking magic number
 */
export function isDPXFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) {
    return false;
  }
  const view = new DataView(buffer);
  const magic = view.getUint32(0, false); // read as big-endian
  return magic === DPX_MAGIC_BE || magic === DPX_MAGIC_LE;
}

/**
 * Get basic info from DPX header without fully decoding
 */
export function getDPXInfo(buffer: ArrayBuffer): DPXInfo | null {
  try {
    if (buffer.byteLength < 1664) {
      return null;
    }

    const view = new DataView(buffer);
    const magic = view.getUint32(0, false);

    let bigEndian: boolean;
    if (magic === DPX_MAGIC_BE) {
      bigEndian = true;
    } else if (magic === DPX_MAGIC_LE) {
      bigEndian = false;
    } else {
      return null;
    }

    const le = !bigEndian;

    // Prefer the image element's own data offset (808); fall back to the file header's (4)
    const fileDataOffset = view.getUint32(4, le);
    const elementDataOffset = view.getUint32(808, le);
    const dataOffset =
      elementDataOffset !== 0 && elementDataOffset !== DPX_UNDEFINED_U32 && elementDataOffset < buffer.byteLength
        ? elementDataOffset
        : fileDataOffset;
    // DPX stores width/height as uint32 — getUint32 ensures unsigned interpretation
    const width = view.getUint32(772, le);
    const height = view.getUint32(776, le);

    // Validate dimensions early: reject zero or unreasonably large values
    if (width === 0 || height === 0) {
      throw new DecoderError('DPX', `Invalid DPX dimensions: ${width}x${height}`);
    }
    if (width > IMAGE_LIMITS.MAX_DIMENSION || height > IMAGE_LIMITS.MAX_DIMENSION) {
      throw new DecoderError(
        'DPX',
        `DPX dimensions ${width}x${height} exceed maximum of ${IMAGE_LIMITS.MAX_DIMENSION}x${IMAGE_LIMITS.MAX_DIMENSION}`,
      );
    }
    const totalPixels = width * height;
    if (totalPixels > IMAGE_LIMITS.MAX_PIXELS) {
      throw new DecoderError(
        'DPX',
        `DPX image has ${totalPixels} pixels, exceeding maximum of ${IMAGE_LIMITS.MAX_PIXELS}`,
      );
    }

    const transferByte = view.getUint8(801);
    const bitDepth = view.getUint8(803);
    const packing = view.getUint16(804, le);
    const encoding = view.getUint16(806, le);
    const rawEol = view.getUint32(812, le);
    const eolPadding = rawEol === DPX_UNDEFINED_U32 ? undefined : rawEol;

    // Determine transfer function
    let transfer: string;
    if (transferByte === DPXTransferFunction.LOGARITHMIC) {
      transfer = 'logarithmic';
    } else {
      transfer = 'linear';
    }

    // Determine number of channels based on descriptor
    // Descriptor byte is at offset 800
    const descriptor = view.getUint8(800);
    let channels: number;
    switch (descriptor) {
      case 6: // Luma (grayscale)
        channels = 1;
        break;
      case 50: // RGB
        channels = 3;
        break;
      case 51: // RGBA
        channels = 4;
        break;
      case 52: // ABGR
        channels = 4;
        break;
      default:
        throw new DecoderError('DPX', `Unsupported DPX descriptor: ${descriptor}`);
    }

    return {
      width,
      height,
      bitDepth,
      bigEndian,
      transfer,
      channels,
      dataOffset,
      descriptor,
      packing,
      encoding,
      eolPadding,
    };
  } catch (e) {
    if (e instanceof DecoderError) {
      throw e;
    }
    return null;
  }
}

/** DPX image element packing (SMPTE 268M, image element "packing" field at offset 804). */
export enum DPXPacking {
  /** Bits packed tightly into 32-bit words (data may span word boundaries) */
  PACKED = 0,
  /** Filled to 32-bit words, Method A: padding in the least significant bits */
  FILLED_METHOD_A = 1,
  /** Filled to 32-bit words, Method B: padding in the most significant bits */
  FILLED_METHOD_B = 2,
}

/**
 * Unpack 10-bit "filled" data (3 components per 32-bit word).
 *
 * Method A (packing 1) puts the 2 padding bits at the LSB:
 *   c0 = (word >> 22), c1 = (word >> 12), c2 = (word >> 2)
 * Method B (packing 2) puts them at the MSB:
 *   c0 = (word >> 20), c1 = (word >> 10), c2 = word
 *
 * Each row starts on a 32-bit word boundary; `rowStrideBytes` overrides the
 * default stride (e.g. to honour end-of-line padding).
 *
 * Returns normalized float values in [0, 1].
 */
export function unpackDPX10bit(
  packedData: DataView,
  width: number,
  height: number,
  numChannels: number,
  bigEndian: boolean,
  packing: DPXPacking = DPXPacking.FILLED_METHOD_A,
  rowStrideBytes?: number,
): Float32Array {
  const totalComponents = width * height * numChannels;
  const result = new Float32Array(totalComponents);
  const le = !bigEndian;
  const pad = packing === DPXPacking.FILLED_METHOD_B ? 0 : 2;
  const shifts = [20 + pad, 10 + pad, pad];

  const componentsPerRow = width * numChannels;
  const wordsPerRow = Math.ceil(componentsPerRow / 3);
  const stride = rowStrideBytes ?? wordsPerRow * 4;
  let componentIndex = 0;

  for (let row = 0; row < height; row++) {
    const rowOffset = row * stride;
    for (let i = 0; i < componentsPerRow; i++) {
      const byteOffset = rowOffset + Math.floor(i / 3) * 4;
      if (byteOffset + 4 > packedData.byteLength) return result;
      const word = packedData.getUint32(byteOffset, le);
      result[componentIndex++] = ((word >>> (shifts[i % 3] ?? 0)) & 0x3ff) / 1023;
    }
  }

  return result;
}

/**
 * Unpack bit-packed data (packing 0): components are a continuous bitstream
 * filling 32-bit words (in file byte order) from the least significant bit,
 * so a component may span two words. Each row starts on a word boundary.
 * Matches libdpx / FFmpeg.
 */
export function unpackDPXPacked(
  view: DataView,
  width: number,
  height: number,
  numChannels: number,
  bitDepth: number,
  bigEndian: boolean,
  rowStrideBytes?: number,
): Float32Array {
  const componentsPerRow = width * numChannels;
  const result = new Float32Array(componentsPerRow * height);
  const le = !bigEndian;
  const mask = 2 ** bitDepth - 1;
  const stride = rowStrideBytes ?? Math.ceil((componentsPerRow * bitDepth) / 32) * 4;
  let o = 0;

  for (let row = 0; row < height; row++) {
    const rowOffset = row * stride;
    for (let i = 0; i < componentsPerRow; i++) {
      const bitPos = i * bitDepth;
      const wordOffset = rowOffset + Math.floor(bitPos / 32) * 4;
      const shift = bitPos % 32;
      if (wordOffset + 4 > view.byteLength) return result;
      let value = view.getUint32(wordOffset, le) >>> shift;
      if (shift + bitDepth > 32) {
        if (wordOffset + 8 > view.byteLength) return result;
        value = (value | (view.getUint32(wordOffset + 4, le) << (32 - shift))) >>> 0;
      }
      result[o++] = (value & mask) / mask;
    }
  }

  return result;
}

/**
 * Unpack 8-bit data from DPX
 */
function unpack8bit(view: DataView, width: number, height: number, numChannels: number, stride: number): Float32Array {
  const componentsPerRow = width * numChannels;
  const result = new Float32Array(componentsPerRow * height);
  let o = 0;
  for (let row = 0; row < height; row++) {
    const rowOffset = row * stride;
    for (let i = 0; i < componentsPerRow; i++) {
      if (rowOffset + i >= view.byteLength) return result;
      result[o++] = view.getUint8(rowOffset + i) / 255;
    }
  }
  return result;
}

/**
 * Unpack 12-bit (filled into 16-bit containers) or 16-bit data from DPX.
 * 12-bit Method A stores the value in the upper 12 bits, Method B in the lower 12.
 */
function unpack16bitContainer(
  view: DataView,
  width: number,
  height: number,
  numChannels: number,
  bigEndian: boolean,
  bitDepth: 12 | 16,
  packing: DPXPacking,
  stride: number,
): Float32Array {
  const componentsPerRow = width * numChannels;
  const result = new Float32Array(componentsPerRow * height);
  const le = !bigEndian;
  let o = 0;

  for (let row = 0; row < height; row++) {
    const rowOffset = row * stride;
    for (let i = 0; i < componentsPerRow; i++) {
      const byteOffset = rowOffset + i * 2;
      if (byteOffset + 2 > view.byteLength) return result;
      const v = view.getUint16(byteOffset, le);
      if (bitDepth === 16) {
        result[o++] = v / 65535;
      } else {
        result[o++] = (packing === DPXPacking.FILLED_METHOD_B ? v & 0xfff : v >>> 4) / 4095;
      }
    }
  }

  return result;
}

/**
 * Apply log-to-linear conversion on RGBA data (only on RGB, leave alpha).
 * Wraps shared utility with DPX-specific log-to-linear function.
 */
function applyLogToLinearRGBA(
  data: Float32Array,
  width: number,
  height: number,
  bitDepth: number,
  options?: LogLinearOptions,
): void {
  sharedApplyLogToLinearRGBA(data, width, height, bitDepth, (codeValue) => _dpxLogToLinear(codeValue, options));
}

/**
 * Decode a DPX file from an ArrayBuffer
 *
 * @param buffer - The DPX file data
 * @param options - Decode options
 * @param options.applyLogToLinear - Whether to convert log data to linear (default: false for DPX)
 */
export async function decodeDPX(buffer: ArrayBuffer, options?: DPXDecodeOptions): Promise<DPXDecodeResult> {
  const info = getDPXInfo(buffer);
  if (!info) {
    throw new DecoderError('DPX', 'Invalid DPX file');
  }

  const {
    width,
    height,
    bitDepth,
    bigEndian,
    transfer,
    channels: inputChannels,
    dataOffset,
    descriptor,
    encoding,
    eolPadding,
  } = info;

  // Validate dimensions
  validateImageDimensions(width, height, 'DPX');

  // Validate bit depth early so unsupported values are rejected before size calculations
  if (bitDepth !== 8 && bitDepth !== 10 && bitDepth !== 12 && bitDepth !== 16) {
    throw new DecoderError('DPX', `Unsupported DPX bit depth: ${bitDepth}`);
  }

  if (encoding !== 0) {
    throw new DecoderError(
      'DPX',
      `Unsupported DPX encoding: ${encoding} (run-length encoded image data is not supported)`,
    );
  }

  // Undefined/unknown packing values fall back to the most common layout (Method A)
  const packing: DPXPacking =
    info.packing === DPXPacking.PACKED || info.packing === DPXPacking.FILLED_METHOD_B
      ? info.packing
      : DPXPacking.FILLED_METHOD_A;

  // Validate data offset
  if (dataOffset >= buffer.byteLength) {
    throw new DecoderError('DPX', `Invalid DPX file: data offset ${dataOffset} exceeds file size ${buffer.byteLength}`);
  }

  // Row layout. Validate the expected pixel data size against the available
  // file data (MED-32) so malformed dimensions are rejected before unpacking.
  const availableData = buffer.byteLength - dataOffset;
  const componentsPerRow = width * inputChannels;
  const bitPacked = packing === DPXPacking.PACKED && (bitDepth === 10 || bitDepth === 12);
  let rowBytes: number;
  if (bitPacked) {
    rowBytes = Math.ceil((componentsPerRow * bitDepth) / 32) * 4;
  } else if (bitDepth === 10) {
    rowBytes = Math.ceil(componentsPerRow / 3) * 4;
  } else if (bitDepth === 8) {
    rowBytes = componentsPerRow;
  } else {
    // 12-bit (filled) and 16-bit use 2 bytes per component
    rowBytes = componentsPerRow * 2;
  }

  let stride = rowBytes + (eolPadding ?? 0);
  // 8/12/16-bit rows are commonly padded to a 4-byte boundary even when the
  // end-of-line padding field is 0 or undefined (FFmpeg writes them this way).
  // In that case use the aligned stride if the file is large enough to hold
  // it (same heuristic as FFmpeg's decoder).
  const alignedStride = Math.ceil(rowBytes / 4) * 4;
  if (!eolPadding && alignedStride !== stride && alignedStride * height <= availableData) {
    stride = alignedStride;
  }

  const expectedPixelDataSize = stride * (height - 1) + rowBytes;
  if (expectedPixelDataSize > availableData) {
    throw new DecoderError(
      'DPX',
      `DPX pixel data size (${expectedPixelDataSize} bytes) exceeds available file data (${availableData} bytes)`,
    );
  }

  // Create DataView for pixel data
  const pixelDataView = new DataView(buffer, dataOffset);

  // Unpack pixel data based on bit depth and packing
  let componentData: Float32Array;
  if (bitPacked) {
    componentData = unpackDPXPacked(pixelDataView, width, height, inputChannels, bitDepth, bigEndian, stride);
  } else if (bitDepth === 10) {
    componentData = unpackDPX10bit(pixelDataView, width, height, inputChannels, bigEndian, packing, stride);
  } else if (bitDepth === 8) {
    componentData = unpack8bit(pixelDataView, width, height, inputChannels, stride);
  } else {
    componentData = unpack16bitContainer(
      pixelDataView,
      width,
      height,
      inputChannels,
      bigEndian,
      bitDepth,
      packing,
      stride,
    );
  }

  // Convert to RGBA
  const rgbaData = toRGBA(componentData, width, height, inputChannels);

  // Swizzle ABGR → RGBA when descriptor is 52
  if (descriptor === 52) {
    const totalPixels = width * height;
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      const a = rgbaData[idx] ?? 0; // originally A
      const b = rgbaData[idx + 1] ?? 0; // originally B
      const g = rgbaData[idx + 2] ?? 0; // originally G
      const r = rgbaData[idx + 3] ?? 0; // originally R
      rgbaData[idx] = r;
      rgbaData[idx + 1] = g;
      rgbaData[idx + 2] = b;
      rgbaData[idx + 3] = a;
    }
  }

  // Determine color space
  const isLog = transfer === 'logarithmic';
  let colorSpace: 'linear' | 'log' = isLog ? 'log' : 'linear';

  // Apply log-to-linear conversion if requested
  if (options?.applyLogToLinear && isLog) {
    applyLogToLinearRGBA(rgbaData, width, height, bitDepth, options.logLinearOptions);
    colorSpace = 'linear';
  }

  return {
    width,
    height,
    data: rgbaData,
    channels: 4,
    colorSpace,
    metadata: {
      format: 'dpx',
      bitDepth,
      bigEndian,
      transfer,
      originalChannels: inputChannels,
      descriptor,
      packing,
    },
  };
}
