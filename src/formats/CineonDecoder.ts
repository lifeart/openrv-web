/**
 * Cineon File Format Decoder
 *
 * Supports:
 * - 10-bit packed data (Method A, same as DPX)
 * - Big-endian byte order (standard Cineon)
 * - RGB images (always 3 channels)
 * - Log-to-linear conversion (applied by default)
 *
 * Cineon was developed by Kodak for digital film scanning.
 * Data is stored in logarithmic (printing density) space.
 */

import { cineonLogToLinear as _cineonLogToLinear, type LogLinearOptions } from './LogLinear';
import { unpackDPX10bit } from './DPXDecoder';
import { validateImageDimensions, toRGBA as sharedToRGBA, applyLogToLinearRGBA as sharedApplyLogToLinearRGBA } from './shared';
import { DecoderError } from '../core/errors';

// Re-export for backwards compatibility
export { cineonLogToLinear } from './LogLinear';

// Cineon magic number
const CINEON_MAGIC = 0x802a5fd7;

export interface CineonInfo {
  width: number;
  height: number;
  bitDepth: number;
  channels: number;
  dataOffset: number;
}

export interface CineonDecodeOptions {
  /** Whether to convert log data to linear (default: true for Cineon) */
  applyLogToLinear?: boolean;
  /** Custom log-to-linear conversion parameters */
  logLinearOptions?: LogLinearOptions;
}

export interface CineonDecodeResult {
  width: number;
  height: number;
  data: Float32Array; // RGBA interleaved
  channels: number; // always 4
  colorSpace: 'linear' | 'log';
  metadata: Record<string, unknown>;
}

/**
 * Check if a buffer contains a Cineon file by checking magic number
 */
export function isCineonFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) {
    return false;
  }
  const view = new DataView(buffer);
  const magic = view.getUint32(0, false); // big-endian
  return magic === CINEON_MAGIC;
}

/**
 * Get basic info from Cineon header without fully decoding
 */
export function getCineonInfo(buffer: ArrayBuffer): CineonInfo | null {
  try {
    if (buffer.byteLength < 800) {
      return null;
    }

    const view = new DataView(buffer);
    const magic = view.getUint32(0, false);

    if (magic !== CINEON_MAGIC) {
      return null;
    }

    // Cineon header is always big-endian
    const dataOffset = view.getUint32(4, false);
    const width = view.getUint32(200, false);
    const height = view.getUint32(204, false);
    const bitDepth = view.getUint8(213);

    // Cineon is always 3 channels (RGB)
    const channels = 3;

    return {
      width,
      height,
      bitDepth,
      channels,
      dataOffset,
    };
  } catch {
    return null;
  }
}

/**
 * Convert component data to RGBA Float32Array.
 * Cineon is always 3-channel RGB; delegates to shared utility.
 */
function toRGBA(data: Float32Array, width: number, height: number): Float32Array {
  return sharedToRGBA(data, width, height, 3);
}

/**
 * Apply log-to-linear conversion on RGBA data (only on RGB, leave alpha).
 * Wraps shared utility with Cineon-specific log-to-linear function.
 */
function applyLogToLinearRGBA(
  data: Float32Array,
  width: number,
  height: number,
  bitDepth: number,
  options?: LogLinearOptions
): void {
  sharedApplyLogToLinearRGBA(data, width, height, bitDepth, (codeValue) => _cineonLogToLinear(codeValue, options));
}

/**
 * Decode a Cineon file from an ArrayBuffer
 *
 * @param buffer - The Cineon file data
 * @param options - Decode options
 * @param options.applyLogToLinear - Whether to convert log data to linear (default: true for Cineon)
 */
export async function decodeCineon(
  buffer: ArrayBuffer,
  options?: CineonDecodeOptions
): Promise<CineonDecodeResult> {
  const info = getCineonInfo(buffer);
  if (!info) {
    throw new DecoderError('Cineon', 'Invalid Cineon file');
  }

  const { width, height, bitDepth, channels, dataOffset } = info;

  // Validate dimensions
  validateImageDimensions(width, height, 'Cineon');

  // Cineon is always 10-bit packed
  if (bitDepth !== 10) {
    throw new DecoderError('Cineon', `Unsupported Cineon bit depth: ${bitDepth}. Only 10-bit is supported.`);
  }

  // Validate data offset
  if (dataOffset >= buffer.byteLength) {
    throw new DecoderError('Cineon', `Invalid Cineon file: data offset ${dataOffset} exceeds file size ${buffer.byteLength}`);
  }

  // Create DataView for pixel data
  const pixelDataView = new DataView(buffer, dataOffset);

  // Cineon is always big-endian, always 10-bit packed
  const componentData = unpackDPX10bit(pixelDataView, width, height, channels, true);

  // Convert to RGBA (Cineon is always RGB)
  const rgbaData = toRGBA(componentData, width, height);

  // Default: apply log-to-linear for Cineon (data is inherently log)
  const shouldApplyLogToLinear = options?.applyLogToLinear !== false;
  let colorSpace: 'linear' | 'log';

  if (shouldApplyLogToLinear) {
    applyLogToLinearRGBA(rgbaData, width, height, bitDepth, options?.logLinearOptions);
    colorSpace = 'linear';
  } else {
    colorSpace = 'log';
  }

  return {
    width,
    height,
    data: rgbaData,
    channels: 4,
    colorSpace,
    metadata: {
      format: 'cineon',
      bitDepth,
      originalChannels: channels,
    },
  };
}
