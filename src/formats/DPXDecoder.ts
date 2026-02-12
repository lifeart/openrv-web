/**
 * DPX (Digital Picture Exchange) File Format Decoder
 *
 * Supports:
 * - 8-bit, 10-bit (Method A packed), 12-bit (in 16-bit container), and 16-bit data
 * - Big-endian and little-endian byte order
 * - RGB and RGBA images
 * - Linear and logarithmic transfer functions
 * - Optional log-to-linear conversion
 *
 * Based on SMPTE 268M specification.
 */

import { dpxLogToLinear as _dpxLogToLinear, type LogLinearOptions } from './LogLinear';
import { validateImageDimensions, toRGBA, applyLogToLinearRGBA as sharedApplyLogToLinearRGBA } from './shared';
import { DecoderError } from '../core/errors';

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
}

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

    const dataOffset = view.getUint32(4, le);
    const width = view.getUint32(772, le);
    const height = view.getUint32(776, le);
    const transferByte = view.getUint8(801);
    const bitDepth = view.getUint8(803);

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
        channels = 3; // Default to RGB
        break;
    }

    return {
      width,
      height,
      bitDepth,
      bigEndian,
      transfer,
      channels,
      dataOffset,
    };
  } catch {
    return null;
  }
}

/**
 * Unpack 10-bit Method A data from DPX/Cineon packed format.
 *
 * Each 32-bit word contains 3 x 10-bit components + 2 padding bits at LSB:
 *   c0 = (word >> 22) & 0x3FF
 *   c1 = (word >> 12) & 0x3FF
 *   c2 = (word >> 2)  & 0x3FF
 *
 * Returns normalized float values in [0, 1].
 */
export function unpackDPX10bit(
  packedData: DataView,
  width: number,
  height: number,
  numChannels: number,
  bigEndian: boolean
): Float32Array {
  const totalPixels = width * height;
  const totalComponents = totalPixels * numChannels;
  const result = new Float32Array(totalComponents);
  const le = !bigEndian;

  // 10-bit Method A: 3 components per 32-bit word, with row-level alignment
  // Each row's packed data starts at a 32-bit word boundary
  const componentsPerRow = width * numChannels;
  const wordsPerRow = Math.ceil(componentsPerRow / 3);
  let componentIndex = 0;

  for (let row = 0; row < height; row++) {
    const rowWordOffset = row * wordsPerRow;
    let rowComponentIndex = 0;

    for (let w = 0; w < wordsPerRow && rowComponentIndex < componentsPerRow; w++) {
      const byteOffset = (rowWordOffset + w) * 4;
      if (byteOffset + 4 > packedData.byteLength) break;

      const word = packedData.getUint32(byteOffset, le);
      const c0 = (word >>> 22) & 0x3ff;
      const c1 = (word >>> 12) & 0x3ff;
      const c2 = (word >>> 2) & 0x3ff;

      if (rowComponentIndex < componentsPerRow && componentIndex < totalComponents) {
        result[componentIndex++] = c0 / 1023;
        rowComponentIndex++;
      }
      if (rowComponentIndex < componentsPerRow && componentIndex < totalComponents) {
        result[componentIndex++] = c1 / 1023;
        rowComponentIndex++;
      }
      if (rowComponentIndex < componentsPerRow && componentIndex < totalComponents) {
        result[componentIndex++] = c2 / 1023;
        rowComponentIndex++;
      }
    }
  }

  return result;
}

/**
 * Unpack 8-bit data from DPX
 */
function unpack8bit(
  view: DataView,
  width: number,
  height: number,
  numChannels: number
): Float32Array {
  const totalComponents = width * height * numChannels;
  const result = new Float32Array(totalComponents);

  for (let i = 0; i < totalComponents && i < view.byteLength; i++) {
    result[i] = view.getUint8(i) / 255;
  }

  return result;
}

/**
 * Unpack 16-bit data from DPX
 */
function unpack16bit(
  view: DataView,
  width: number,
  height: number,
  numChannels: number,
  bigEndian: boolean
): Float32Array {
  const totalComponents = width * height * numChannels;
  const result = new Float32Array(totalComponents);
  const le = !bigEndian;

  for (let i = 0; i < totalComponents; i++) {
    const byteOffset = i * 2;
    if (byteOffset + 2 > view.byteLength) break;
    result[i] = view.getUint16(byteOffset, le) / 65535;
  }

  return result;
}

/**
 * Unpack 12-bit data from DPX (stored in 16-bit container, upper 12 bits)
 */
function unpack12bit(
  view: DataView,
  width: number,
  height: number,
  numChannels: number,
  bigEndian: boolean
): Float32Array {
  const totalComponents = width * height * numChannels;
  const result = new Float32Array(totalComponents);
  const le = !bigEndian;

  for (let i = 0; i < totalComponents; i++) {
    const byteOffset = i * 2;
    if (byteOffset + 2 > view.byteLength) break;
    const value16 = view.getUint16(byteOffset, le);
    // 12-bit data is in the upper 12 bits of the 16-bit container
    const value12 = value16 >>> 4;
    result[i] = value12 / 4095;
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
  options?: LogLinearOptions
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
export async function decodeDPX(
  buffer: ArrayBuffer,
  options?: DPXDecodeOptions
): Promise<DPXDecodeResult> {
  const info = getDPXInfo(buffer);
  if (!info) {
    throw new DecoderError('DPX', 'Invalid DPX file');
  }

  const { width, height, bitDepth, bigEndian, transfer, channels: inputChannels, dataOffset } = info;

  // Validate dimensions
  validateImageDimensions(width, height, 'DPX');

  // Validate data offset
  if (dataOffset >= buffer.byteLength) {
    throw new DecoderError('DPX', `Invalid DPX file: data offset ${dataOffset} exceeds file size ${buffer.byteLength}`);
  }

  // Create DataView for pixel data
  const pixelDataView = new DataView(buffer, dataOffset);

  // Unpack pixel data based on bit depth
  let componentData: Float32Array;
  switch (bitDepth) {
    case 8:
      componentData = unpack8bit(pixelDataView, width, height, inputChannels);
      break;
    case 10:
      componentData = unpackDPX10bit(pixelDataView, width, height, inputChannels, bigEndian);
      break;
    case 12:
      componentData = unpack12bit(pixelDataView, width, height, inputChannels, bigEndian);
      break;
    case 16:
      componentData = unpack16bit(pixelDataView, width, height, inputChannels, bigEndian);
      break;
    default:
      throw new DecoderError('DPX', `Unsupported DPX bit depth: ${bitDepth}`);
  }

  // Convert to RGBA
  let rgbaData = toRGBA(componentData, width, height, inputChannels);

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
    },
  };
}
