/**
 * AVIF Image Decoder
 *
 * Detects and decodes plain AVIF image files (non-gainmap).
 * Uses the browser's built-in AVIF decoder via createImageBitmap.
 *
 * Detection: ISOBMFF ftyp box with AVIF brands ('avif', 'avis', 'mif1')
 * that do NOT contain a gainmap auxiliary image.
 */

/**
 * Check if a buffer contains a plain AVIF file (ftyp box with AVIF brand).
 * Returns true for any AVIF file, including gainmap AVIFs.
 * The DecoderRegistry ordering ensures gainmap AVIFs are matched first.
 */
export function isAvifFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  // Box type at offset 4..7 must be 'ftyp'
  const type = String.fromCharCode(
    view.getUint8(4),
    view.getUint8(5),
    view.getUint8(6),
    view.getUint8(7)
  );
  if (type !== 'ftyp') return false;
  // Major brand at offset 8..11
  const brand = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11)
  );
  return brand === 'avif' || brand === 'avis' || brand === 'mif1';
}

/**
 * Decode a plain AVIF file to Float32Array RGBA pixel data.
 * Uses the browser's built-in AVIF support via createImageBitmap.
 */
export async function decodeAvif(buffer: ArrayBuffer): Promise<{
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
}> {
  const blob = new Blob([buffer], { type: 'image/avif' });
  const bitmap = await createImageBitmap(blob);

  const width = bitmap.width;
  const height = bitmap.height;

  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : (() => {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        return c;
      })();

  const ctx = canvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const float32 = new Float32Array(width * height * 4);
  const scale = 1.0 / 255.0;
  for (let i = 0; i < pixels.length; i++) {
    float32[i] = (pixels[i] ?? 0) * scale;
  }

  return { width, height, data: float32, channels: 4 };
}
