/**
 * Color Inversion (Negation)
 *
 * Applies a simple negation to each RGB channel: output = 255 - input
 * Alpha channel is preserved unchanged.
 *
 * Equivalent to the negation matrix:
 * | -1  0  0  0 |   | r |   | 1 |
 * |  0 -1  0  0 | x | g | + | 1 |
 * |  0  0 -1  0 |   | b |   | 1 |
 * |  0  0  0  1 |   | a |   | 0 |
 */

/**
 * Apply color inversion to ImageData in-place.
 * Inverts RGB channels (output = 255 - input), preserves alpha.
 */
export function applyColorInversion(imageData: ImageData): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = 255 - data[i]!;     // R
    data[i + 1] = 255 - data[i + 1]!; // G
    data[i + 2] = 255 - data[i + 2]!; // B
    // data[i + 3] unchanged (alpha preserved)
  }
}

/**
 * Check if a pixel is correctly inverted.
 * Useful for test assertions.
 */
export function isInvertedPixel(
  original: [number, number, number, number],
  inverted: [number, number, number, number]
): boolean {
  return (
    inverted[0] === 255 - original[0] &&
    inverted[1] === 255 - original[1] &&
    inverted[2] === 255 - original[2] &&
    inverted[3] === original[3]
  );
}
