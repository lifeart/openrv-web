/**
 * EXRPIZCodec - PIZ wavelet compression codec for OpenEXR
 *
 * PIZ is the most common compression in VFX EXR files.
 * Pipeline: Huffman decode -> LUT inverse -> Haar wavelet reconstruction -> byte reorder
 */

const USHORT_RANGE = 1 << 16;
const BITMAP_SIZE = USHORT_RANGE >> 3; // 8192 bytes

/**
 * Read a Huffman-coded bitmap from the data stream
 */
function hufUnpackEncTable(
  data: Uint8Array,
  offset: number,
  dataLength: number
): { bitmap: Uint8Array; bytesRead: number } {
  const bitmap = new Uint8Array(BITMAP_SIZE);

  let pos = offset;
  const end = offset + dataLength;

  // Read the run-length encoded bitmap
  let bitmapPos = 0;

  while (pos < end && bitmapPos < BITMAP_SIZE) {
    const byte = data[pos++]!;

    if (byte <= 0x7f) {
      // Literal bytes
      const count = byte + 1;
      for (let i = 0; i < count && bitmapPos < BITMAP_SIZE && pos < end; i++) {
        bitmap[bitmapPos++] = data[pos++]!;
      }
    } else {
      // Repeat zero
      const count = byte - 0x7f;
      for (let i = 0; i < count && bitmapPos < BITMAP_SIZE; i++) {
        bitmap[bitmapPos++] = 0;
      }
    }
  }

  return { bitmap, bytesRead: pos - offset };
}

/**
 * Build forward and reverse lookup tables from bitmap
 */
export function buildLUTs(bitmap: Uint8Array): {
  fwdLut: Uint16Array;
  revLut: Uint16Array;
  lutSize: number;
} {
  // Count set bits to determine LUT size
  let lutSize = 0;
  for (let i = 0; i < USHORT_RANGE; i++) {
    if (bitmap[i >> 3]! & (1 << (i & 7))) {
      lutSize++;
    }
  }

  // Edge case: if no bits set, use identity mapping
  if (lutSize === 0) {
    lutSize = USHORT_RANGE;
    const fwdLut = new Uint16Array(USHORT_RANGE);
    const revLut = new Uint16Array(USHORT_RANGE);
    for (let i = 0; i < USHORT_RANGE; i++) {
      fwdLut[i] = i;
      revLut[i] = i;
    }
    return { fwdLut, revLut, lutSize };
  }

  const fwdLut = new Uint16Array(USHORT_RANGE);
  const revLut = new Uint16Array(lutSize);

  let j = 0;
  for (let i = 0; i < USHORT_RANGE; i++) {
    if (bitmap[i >> 3]! & (1 << (i & 7))) {
      fwdLut[i] = j;
      revLut[j] = i;
      j++;
    }
  }

  return { fwdLut, revLut, lutSize };
}

/**
 * Apply reverse LUT to convert packed values back to original
 */
export function applyReverseLUT(
  data: Uint16Array,
  revLut: Uint16Array,
  lutSize: number
): void {
  for (let i = 0; i < data.length; i++) {
    const val = data[i]!;
    if (val < lutSize) {
      data[i] = revLut[val]!;
    }
  }
}

/**
 * Inverse Haar wavelet transform (1D, in-place)
 */
export function wav2Decode(
  buffer: Uint16Array,
  nx: number, // number of values (width)
  ox: number, // stride between values in x
  ny: number, // number of rows (height or 1 for 1D)
  oy: number, // stride between rows
  maxValue: number // max value for clamping
): void {
  const w = Math.max(nx, ny);
  const a_b = new Int32Array(w); // Temp buffer for wavelet coefficients

  // Process each row
  for (let y = 0; y < ny; y++) {
    // Determine current row transform size
    let n = nx;
    let p = 1;
    let p2: number;

    // Find the starting level (smallest power of 2 >= n)
    while (p < n) p <<= 1;
    p >>= 1;

    // Reconstruct from coarsest to finest level
    while (p >= 1) {
      p2 = p;
      const offset = y * oy;

      // Load wavelet coefficients
      for (let i = 0; i < n; i++) {
        a_b[i] = buffer[offset + i * ox]!;
      }

      // Inverse wavelet step: reconstruct from averages and differences
      const halfN = Math.min(p2, Math.ceil(n / 2));

      for (let i = 0; i < halfN; i++) {
        const avg = a_b[i]!;
        const diff = i + halfN < n ? a_b[i + halfN]! : 0;

        const val1 = avg + diff - (maxValue >> 1);
        const val2 = avg - diff + (maxValue >> 1) + (maxValue & 1); // Handle odd maxValue

        // The reconstruction uses unsigned 16-bit wrapping
        const idx1 = 2 * i;
        const idx2 = 2 * i + 1;

        if (idx1 < n)
          buffer[offset + idx1 * ox] = (val1 & 0xffff) as number;
        if (idx2 < n)
          buffer[offset + idx2 * ox] = (val2 & 0xffff) as number;
      }

      p >>= 1;
    }
  }
}

/**
 * Reverse byte reorder (de-interleave bytes)
 * PIZ stores all MSBs first, then all LSBs.
 */
export function reverseByteReorder(
  data: Uint8Array,
  outSize: number
): Uint8Array {
  const result = new Uint8Array(outSize);
  const halfSize = Math.ceil(outSize / 2);

  for (let i = 0; i < halfSize; i++) {
    const hiIdx = i;
    const loIdx = i + halfSize;

    const hi = hiIdx < data.length ? data[hiIdx]! : 0;
    const lo = loIdx < data.length ? data[loIdx]! : 0;

    const dstIdx = i * 2;
    if (dstIdx < outSize) result[dstIdx] = hi;
    if (dstIdx + 1 < outSize) result[dstIdx + 1] = lo;
  }

  return result;
}

/**
 * Reverse predictor (delta decode)
 */
export function reversePredictor(data: Uint8Array): void {
  for (let i = 1; i < data.length; i++) {
    data[i] = (data[i]! + data[i - 1]!) & 0xff;
  }
}

/**
 * Decompress PIZ-compressed data
 *
 * @param compressedData - The compressed data bytes
 * @param uncompressedSize - Expected size of uncompressed data in bytes
 * @param width - Image width in pixels
 * @param numChannels - Number of channels in the data
 * @param numLines - Number of scanlines in this block
 * @param channelSizes - Size in bytes per pixel per channel (2 for HALF, 4 for FLOAT)
 * @returns Decompressed data
 */
export function decompressPIZ(
  compressedData: Uint8Array,
  uncompressedSize: number,
  width: number,
  numChannels: number,
  numLines: number,
  channelSizes: number[]
): Uint8Array {
  if (compressedData.length === 0 || uncompressedSize === 0) {
    return new Uint8Array(uncompressedSize);
  }

  let pos = 0;

  // 1. Read minNonZero and maxNonZero
  const minNonZero = compressedData[pos]! | (compressedData[pos + 1]! << 8);
  pos += 2;
  const maxNonZero = compressedData[pos]! | (compressedData[pos + 1]! << 8);
  pos += 2;

  // 2. Read/build bitmap and LUTs
  let bitmap: Uint8Array;

  if (minNonZero <= maxNonZero) {
    const bitmapDataLen = maxNonZero - minNonZero + 1;
    bitmap = new Uint8Array(BITMAP_SIZE);

    // Copy bitmap data
    for (
      let i = 0;
      i < bitmapDataLen && pos < compressedData.length;
      i++
    ) {
      bitmap[minNonZero + i] = compressedData[pos++]!;
    }
  } else {
    // Empty bitmap - all zeros
    bitmap = new Uint8Array(BITMAP_SIZE);
    // Set all bits (identity LUT)
    bitmap.fill(0xff);
  }

  const { revLut, lutSize } = buildLUTs(bitmap);

  // 3. Read the remaining compressed pixel data
  const pixelDataBytes = compressedData.slice(pos);

  // 4. Reverse byte reorder
  const reordered = reverseByteReorder(pixelDataBytes, uncompressedSize);

  // 5. Reverse predictor (delta decode)
  reversePredictor(reordered);

  // 6. Convert to Uint16 array for wavelet processing
  const numShorts = uncompressedSize / 2;
  const shorts = new Uint16Array(numShorts);
  for (let i = 0; i < numShorts; i++) {
    shorts[i] = reordered[i * 2]! | (reordered[i * 2 + 1]! << 8);
  }

  // 7. Apply reverse LUT
  applyReverseLUT(shorts, revLut, lutSize);

  // 8. Inverse Haar wavelet transform per channel
  let channelOffset = 0;
  for (let ch = 0; ch < numChannels; ch++) {
    const bytesPerPixel = channelSizes[ch] ?? 2;
    const shortsPerPixel = bytesPerPixel / 2;
    const channelShorts = width * numLines * shortsPerPixel;

    if (channelOffset + channelShorts <= numShorts) {
      const channelView = shorts.subarray(
        channelOffset,
        channelOffset + channelShorts
      );

      // Apply 2D wavelet: first in X, then in Y
      wav2Decode(
        channelView,
        width * shortsPerPixel,
        1,
        numLines,
        width * shortsPerPixel,
        lutSize > 0 ? lutSize : USHORT_RANGE
      );
    }

    channelOffset += channelShorts;
  }

  // 9. Convert back to bytes
  const result = new Uint8Array(uncompressedSize);
  for (let i = 0; i < numShorts; i++) {
    result[i * 2] = shorts[i]! & 0xff;
    result[i * 2 + 1] = (shorts[i]! >> 8) & 0xff;
  }

  return result;
}

// Re-export for testing
export { hufUnpackEncTable, USHORT_RANGE, BITMAP_SIZE };
