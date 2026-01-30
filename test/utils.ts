/**
 * Test utilities and helpers
 */

/**
 * Create a test ImageData with specified dimensions and optional fill color
 */
export function createTestImageData(
  width: number,
  height: number,
  fill?: { r: number; g: number; b: number; a?: number }
): ImageData {
  const imageData = new ImageData(width, height);
  if (fill) {
    const { r, g, b, a = 255 } = fill;
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = r;
      imageData.data[i + 1] = g;
      imageData.data[i + 2] = b;
      imageData.data[i + 3] = a;
    }
  }
  return imageData;
}

/**
 * Create a gradient test image (useful for color tests)
 */
export function createGradientImageData(width: number, height: number): ImageData {
  const imageData = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      imageData.data[i] = Math.round((x / width) * 255); // R increases left to right
      imageData.data[i + 1] = Math.round((y / height) * 255); // G increases top to bottom
      imageData.data[i + 2] = 128; // B constant
      imageData.data[i + 3] = 255; // A opaque
    }
  }
  return imageData;
}

/**
 * Compare two ImageData objects within a tolerance
 */
export function compareImageData(
  a: ImageData,
  b: ImageData,
  tolerance: number = 1
): boolean {
  if (a.width !== b.width || a.height !== b.height) {
    return false;
  }
  for (let i = 0; i < a.data.length; i++) {
    if (Math.abs(a.data[i]! - b.data[i]!) > tolerance) {
      return false;
    }
  }
  return true;
}

/**
 * Get average color of an ImageData
 */
export function getAverageColor(imageData: ImageData): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0;
  const pixelCount = imageData.width * imageData.height;

  for (let i = 0; i < imageData.data.length; i += 4) {
    r += imageData.data[i]!;
    g += imageData.data[i + 1]!;
    b += imageData.data[i + 2]!;
  }

  return {
    r: r / pixelCount,
    g: g / pixelCount,
    b: b / pixelCount,
  };
}

/**
 * Check if an image is grayscale (R === G === B for all pixels)
 */
export function isGrayscale(imageData: ImageData, tolerance: number = 1): boolean {
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i]!;
    const g = imageData.data[i + 1]!;
    const b = imageData.data[i + 2]!;
    if (Math.abs(r - g) > tolerance || Math.abs(g - b) > tolerance || Math.abs(r - b) > tolerance) {
      return false;
    }
  }
  return true;
}

/**
 * Wait for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for next animation frame
 */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Create a mock File object
 */
export function createMockFile(
  name: string,
  content: string = '',
  type: string = 'image/png'
): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

/**
 * Create sample .cube LUT content
 */
export function createSampleCubeLUT(size: number = 2): string {
  const lines = [
    `TITLE "Test LUT"`,
    `LUT_3D_SIZE ${size}`,
    `DOMAIN_MIN 0.0 0.0 0.0`,
    `DOMAIN_MAX 1.0 1.0 1.0`,
  ];

  // Generate identity LUT data
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const rVal = r / (size - 1);
        const gVal = g / (size - 1);
        const bVal = b / (size - 1);
        lines.push(`${rVal.toFixed(6)} ${gVal.toFixed(6)} ${bVal.toFixed(6)}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Create sample 1D .cube LUT content
 */
export function createSample1DLUT(size: number = 16): string {
  const lines = [
    `TITLE "Test 1D LUT"`,
    `LUT_1D_SIZE ${size}`,
    `DOMAIN_MIN 0.0 0.0 0.0`,
    `DOMAIN_MAX 1.0 1.0 1.0`,
  ];

  // Generate identity 1D LUT data (each channel maps input to same output)
  for (let i = 0; i < size; i++) {
    const val = i / (size - 1);
    lines.push(`${val.toFixed(6)} ${val.toFixed(6)} ${val.toFixed(6)}`);
  }

  return lines.join('\n');
}

/**
 * Create sample CDL XML content
 */
export function createSampleCDL(
  slope = { r: 1, g: 1, b: 1 },
  offset = { r: 0, g: 0, b: 0 },
  power = { r: 1, g: 1, b: 1 },
  saturation = 1
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ColorDecisionList xmlns="urn:ASC:CDL:v1.2">
  <ColorDecision>
    <ColorCorrection id="test">
      <SOPNode>
        <Slope>${slope.r} ${slope.g} ${slope.b}</Slope>
        <Offset>${offset.r} ${offset.g} ${offset.b}</Offset>
        <Power>${power.r} ${power.g} ${power.b}</Power>
      </SOPNode>
      <SatNode>
        <Saturation>${saturation}</Saturation>
      </SatNode>
    </ColorCorrection>
  </ColorDecision>
</ColorDecisionList>`;
}

/**
 * Assert that a value is within a range
 */
export function assertInRange(
  value: number,
  min: number,
  max: number,
  message?: string
): void {
  if (value < min || value > max) {
    throw new Error(
      message || `Expected ${value} to be between ${min} and ${max}`
    );
  }
}

/**
 * Assert that two numbers are approximately equal
 */
export function assertApproxEqual(
  actual: number,
  expected: number,
  tolerance: number = 0.001,
  message?: string
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      message || `Expected ${actual} to be approximately ${expected} (tolerance: ${tolerance})`
    );
  }
}
