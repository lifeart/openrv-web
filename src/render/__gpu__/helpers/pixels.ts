/// <reference types="@webgpu/types" />

/**
 * Read pixels from a WebGL2 context (RGBA, unsigned byte).
 */
export function readPixelsGL(gl: WebGL2RenderingContext, x = 0, y = 0, width?: number, height?: number): Uint8Array {
  const w = width ?? gl.drawingBufferWidth;
  const h = height ?? gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
}

/**
 * Read float pixels from a WebGL2 FBO (RGBA32F or RGBA16F).
 */
export function readPixelsGLFloat(
  gl: WebGL2RenderingContext,
  fbo: WebGLFramebuffer,
  width: number,
  height: number,
): Float32Array {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const buf = new Float32Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return buf;
}

/**
 * Read pixels from a WebGPU render texture.
 *
 * NOTE: This assumes the texture uses `rgba32float` format (16 bytes per pixel).
 * It will not produce correct results for other texture formats.
 */
export async function readPixelsGPU(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
): Promise<Float32Array> {
  const bytesPerRow = Math.ceil((width * 16) / 256) * 256;
  const bufferSize = bytesPerRow * height;
  const readBuffer = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture }, { buffer: readBuffer, bytesPerRow }, { width, height });
  device.queue.submit([encoder.finish()]);
  await readBuffer.mapAsync(GPUMapMode.READ);
  const mapped = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();
  readBuffer.destroy();
  const result = new Float32Array(width * height * 4);
  const floatsPerRow = bytesPerRow / 4;
  for (let row = 0; row < height; row++) {
    result.set(mapped.subarray(row * floatsPerRow, row * floatsPerRow + width * 4), row * width * 4);
  }
  return result;
}

/** RGBA pixel value. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Assert that a pixel at (x, y) matches expected RGBA within tolerance.
 */
export function expectPixel(
  pixels: Uint8Array | Float32Array,
  width: number,
  x: number,
  y: number,
  expected: RGBA,
  epsilon: number,
): void {
  const idx = (y * width + x) * 4;
  const actual: RGBA = {
    r: pixels[idx]!,
    g: pixels[idx + 1]!,
    b: pixels[idx + 2]!,
    a: pixels[idx + 3]!,
  };
  const diffs = {
    r: Math.abs(actual.r - expected.r),
    g: Math.abs(actual.g - expected.g),
    b: Math.abs(actual.b - expected.b),
    a: Math.abs(actual.a - expected.a),
  };
  const maxDiff = Math.max(diffs.r, diffs.g, diffs.b, diffs.a);
  if (maxDiff > epsilon) {
    throw new Error(
      `Pixel (${x},${y}) mismatch: expected RGBA(${expected.r},${expected.g},${expected.b},${expected.a}) ` +
        `got RGBA(${actual.r.toFixed(4)},${actual.g.toFixed(4)},${actual.b.toFixed(4)},${actual.a.toFixed(4)}), max diff=${maxDiff.toFixed(6)}, epsilon=${epsilon}`,
    );
  }
}

/**
 * Compare two pixel arrays element-wise with tolerance.
 */
export function comparePixelArrays(a: Uint8Array | Float32Array, b: Uint8Array | Float32Array, epsilon: number): void {
  if (a.length !== b.length) {
    throw new Error(`Pixel array length mismatch: ${a.length} vs ${b.length}`);
  }
  let maxDiff = 0;
  let maxDiffIdx = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = Math.abs(a[i]! - b[i]!);
    if (diff > maxDiff) {
      maxDiff = diff;
      maxDiffIdx = i;
    }
  }
  if (maxDiff > epsilon) {
    const px = Math.floor(maxDiffIdx / 4);
    const ch = maxDiffIdx % 4;
    const chName = ['R', 'G', 'B', 'A'][ch];
    throw new Error(
      `Pixel arrays differ: max diff=${maxDiff.toFixed(6)} at pixel ${px} channel ${chName}, ` +
        `a=${a[maxDiffIdx]!.toFixed(4)}, b=${b[maxDiffIdx]!.toFixed(4)}, epsilon=${epsilon}`,
    );
  }
}
