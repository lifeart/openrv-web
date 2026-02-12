/**
 * JPEG XL (.jxl) Format Decoder
 *
 * Supports:
 * - JXL codestream (bare, starts with 0xFF 0x0A)
 * - JXL ISOBMFF container (ftyp box with brand 'jxl ')
 * - SDR decode via @jsquash/jxl (libjxl WASM)
 *
 * HDR JXL files are handled separately via the VideoFrame path in
 * FileSourceNode (createImageBitmap + VideoFrame, same as AVIF HDR).
 * This decoder handles the SDR WASM fallback path.
 */

import { validateImageDimensions, toRGBA } from './shared';
import { DecoderError } from '../core/errors';

export interface JXLDecodeResult {
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
  colorSpace: string;
  metadata: Record<string, unknown>;
}

/**
 * JXL codestream magic: 0xFF 0x0A
 */
const JXL_CODESTREAM_MAGIC = [0xff, 0x0a] as const;

/**
 * Check if a buffer contains a JXL file.
 *
 * Detects two variants:
 * 1. Bare codestream: starts with [0xFF, 0x0A]
 * 2. ISOBMFF container: ftyp box with major brand 'jxl ' (0x6A786C20)
 */
export function isJXLFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false;

  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 12));

  // Check bare codestream magic
  if (bytes[0] === JXL_CODESTREAM_MAGIC[0] && bytes[1] === JXL_CODESTREAM_MAGIC[1]) {
    return true;
  }

  // Check ISOBMFF container: ftyp box with 'jxl ' brand
  if (buffer.byteLength >= 12) {
    const view = new DataView(buffer);
    const boxType = String.fromCharCode(
      view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
    );
    if (boxType === 'ftyp') {
      const brand = String.fromCharCode(
        view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
      );
      return brand === 'jxl ';
    }
  }

  return false;
}

/**
 * Check if a JXL file uses ISOBMFF container format.
 * Container format files may have colr(nclx) boxes for HDR metadata.
 */
export function isJXLContainer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  const boxType = String.fromCharCode(
    view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
  );
  if (boxType !== 'ftyp') return false;
  const brand = String.fromCharCode(
    view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
  );
  return brand === 'jxl ';
}

/**
 * Decode a JXL file to RGBA Float32Array using @jsquash/jxl (libjxl WASM).
 *
 * This is the SDR decode path. HDR JXL files should use the VideoFrame
 * path in FileSourceNode instead.
 */
export async function decodeJXL(buffer: ArrayBuffer): Promise<JXLDecodeResult> {
  if (!isJXLFile(buffer)) {
    throw new DecoderError('JXL', 'Invalid JXL file: wrong magic signature');
  }

  // Lazy-load the WASM decoder
  const { decode } = await import('@jsquash/jxl');
  const imageData: ImageData = await decode(buffer);

  const { width, height, data } = imageData;
  validateImageDimensions(width, height, 'JXL');

  // Convert Uint8ClampedArray RGBA to Float32Array RGBA (0-255 → 0.0-1.0)
  const totalPixels = width * height;
  const float32 = new Float32Array(totalPixels * 4);
  const scale = 1.0 / 255.0;
  for (let i = 0; i < totalPixels * 4; i++) {
    float32[i] = (data[i] ?? 0) * scale;
  }

  // Already RGBA, no channel conversion needed
  const rgbaData = toRGBA(float32, width, height, 4);

  return {
    width,
    height,
    data: rgbaData,
    channels: 4,
    colorSpace: 'srgb',
    metadata: {
      format: 'jxl',
      container: isJXLContainer(buffer) ? 'isobmff' : 'codestream',
    },
  };
}
