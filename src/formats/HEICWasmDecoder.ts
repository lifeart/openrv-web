/**
 * HEICWasmDecoder - HEIC WASM fallback decoder using libheif-js
 *
 * Provides cross-browser HEIC decoding for Chrome/Firefox/Edge which lack
 * native HEIC support. Safari decodes HEIC natively via createImageBitmap.
 *
 * Uses the same lazy-loading pattern as JXLDecoder.ts.
 */

import { validateImageDimensions } from './shared';
import { DecoderError } from '../core/errors';
import { readBoxType, findBox, parsePitm, parseIinf } from './AVIFGainmapDecoder';

const HEIC_TOP_LEVEL_IMAGE_TYPES = new Set(['hvc1', 'grid', 'iden', 'iovl']);

function inferPrimaryIndexFromMetadata(buffer: ArrayBuffer, decodedImageCount: number): number | null {
  if (decodedImageCount <= 0 || buffer.byteLength < 16) return null;

  const view = new DataView(buffer);
  if (readBoxType(view, 4) !== 'ftyp') return null;

  const ftypSize = view.getUint32(0);
  if (ftypSize < 8 || ftypSize > buffer.byteLength) return null;

  const meta = findBox(view, 'meta', ftypSize, buffer.byteLength, true);
  if (!meta) return null;

  const primaryItemId = parsePitm(view, meta.dataStart, meta.dataEnd);
  if (primaryItemId === null) return null;

  const imageItems = parseIinf(view, meta.dataStart, meta.dataEnd).filter((item) =>
    HEIC_TOP_LEVEL_IMAGE_TYPES.has(item.type),
  );
  const primaryIndex = imageItems.findIndex((item) => item.id === primaryItemId);

  if (primaryIndex < 0 || primaryIndex >= decodedImageCount) return null;
  return primaryIndex;
}

function resolvePrimaryImageIndex(buffer: ArrayBuffer, images: import('libheif-js').HeifImage[]): number {
  let primaryUnavailable = false;

  try {
    const primaryIndex = images.findIndex((img) => img.is_primary());
    if (primaryIndex >= 0) return primaryIndex;
  } catch {
    primaryUnavailable = true;
  }

  const metadataIndex = inferPrimaryIndexFromMetadata(buffer, images.length);
  if (metadataIndex !== null) return metadataIndex;

  if (primaryUnavailable) {
    console.warn(
      '[HEICWasmDecoder] is_primary() unavailable in this libheif-js build, and HEIC metadata did not identify a primary image — ' +
        'falling back to image index 0 which may not be the primary image.',
    );
  }

  return 0;
}

/**
 * Shared internal function to decode a specific image from the decoded array.
 * Frees ALL images (both the target and siblings) to prevent WASM memory leaks.
 */
async function decodeHEICItemAtIndex(
  images: import('libheif-js').HeifImage[],
  itemIndex: number,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  if (itemIndex < 0 || itemIndex >= images.length) {
    // Free all images before throwing
    for (const img of images) img.free();
    throw new DecoderError('HEIC', `Item index ${itemIndex} out of range (file has ${images.length} images)`);
  }

  const image = images[itemIndex]!;

  // Free all other images immediately — they won't be used
  for (let i = 0; i < images.length; i++) {
    if (i !== itemIndex) images[i]!.free();
  }

  try {
    const w = image.get_width();
    const h = image.get_height();
    validateImageDimensions(w, h, 'HEIC');

    const imageData = {
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    };

    await new Promise<void>((resolve, reject) => {
      image.display(imageData, (result: unknown) => {
        if (!result) {
          reject(new DecoderError('HEIC', 'libheif display() callback returned null'));
        } else {
          resolve();
        }
      });
    });

    return { width: w, height: h, data: imageData.data };
  } finally {
    image.free();
  }
}

/**
 * Decode a HEIC buffer to RGBA pixel data using libheif-js WASM.
 * Returns the primary image, preferring libheif's is_primary() and otherwise
 * inferring the item from HEIC container metadata before falling back to index 0.
 */
export async function decodeHEICToImageData(
  buffer: ArrayBuffer,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const libheif = await import('libheif-js');
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(buffer));

  if (!images || images.length === 0) {
    throw new DecoderError('HEIC', 'libheif decoded no images from buffer');
  }

  return decodeHEICItemAtIndex(images, resolvePrimaryImageIndex(buffer, images));
}

/**
 * Decode a specific image item from a HEIC buffer by index.
 * HEIC files can contain multiple top-level images; this picks one by index.
 */
export async function decodeHEICItemToImageData(
  buffer: ArrayBuffer,
  itemIndex: number,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const libheif = await import('libheif-js');
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(buffer));

  if (!images || images.length === 0) {
    throw new DecoderError('HEIC', 'libheif decoded no images from buffer');
  }

  return decodeHEICItemAtIndex(images, itemIndex);
}

/**
 * Decode the first non-primary (auxiliary) image from a HEIC buffer.
 * Used for gainmap extraction: libheif decodes all top-level images from the
 * full container, and we pick the first one that isn't the primary.
 */
export async function decodeHEICAuxImageData(
  buffer: ArrayBuffer,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const libheif = await import('libheif-js');
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(buffer));

  if (!images || images.length < 2) {
    if (images) for (const img of images) img.free();
    throw new DecoderError('HEIC', 'No auxiliary image found (need at least 2 top-level images)');
  }

  // Pick first non-primary image
  const primaryIndex = resolvePrimaryImageIndex(buffer, images);
  const auxIndex = primaryIndex === 0 ? 1 : 0;

  return decodeHEICItemAtIndex(images, auxIndex);
}
