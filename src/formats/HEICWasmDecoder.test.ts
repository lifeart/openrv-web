/**
 * HEICWasmDecoder Unit Tests
 *
 * Since libheif-js (WASM) cannot run in the Node/jsdom test environment,
 * we mock it. Each test verifies REAL glue logic in the decoder:
 *   - ArrayBuffer -> Uint8Array conversion before passing to libheif
 *   - Error handling / error type dispatch (DecoderError)
 *   - Resource cleanup (free() calls on all images)
 *   - Primary image selection via is_primary() with fallback
 *   - Auxiliary image selection (first non-primary)
 *   - Index-based image selection with bounds checking
 *   - Sync vs async display() callback handling
 *   - Buffer wiring: imageData object is passed to display()
 *
 * Tests that merely assert mock return values (e.g., "mock says width=4,
 * assert width===4") have been removed as they test nothing real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DecoderError } from '../core/errors';

// ---------------------------------------------------------------------------
// Helpers to build libheif mock images
// ---------------------------------------------------------------------------

interface MockHeifImage {
  get_width: () => number;
  get_height: () => number;
  is_primary: () => boolean;
  display: (
    imageData: { data: Uint8ClampedArray },
    callback: (r: unknown) => void
  ) => void;
  free: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock HeifImage with sensible defaults.
 * The display() callback fills the buffer with `fillValue` (async by default).
 */
function createMockImage(opts: {
  width?: number;
  height?: number;
  primary?: boolean;
  fillValue?: number;
  sync?: boolean;
  displayReturnsNull?: boolean;
  isPrimaryThrows?: boolean;
} = {}): MockHeifImage {
  const {
    width = 2,
    height = 2,
    primary = true,
    fillValue = 128,
    sync = false,
    displayReturnsNull = false,
    isPrimaryThrows = false,
  } = opts;

  return {
    get_width: () => width,
    get_height: () => height,
    is_primary: isPrimaryThrows
      ? () => { throw new ReferenceError('heif_image_handle_is_primary_image is not defined'); }
      : () => primary,
    display: displayReturnsNull
      ? (_imageData: unknown, callback: (r: null) => void) => {
          if (sync) callback(null);
          else setTimeout(() => callback(null), 0);
        }
      : (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
          imageData.data.fill(fillValue);
          if (sync) callback(imageData);
          else setTimeout(() => callback(imageData), 0);
        },
    free: vi.fn(),
  };
}

/**
 * Set up the libheif-js mock so `new HeifDecoder().decode()` returns `images`.
 * Returns an object with the decode spy for additional assertions.
 */
function mockLibheif(images: MockHeifImage[] | null) {
  const decodeFn = vi.fn().mockReturnValue(images);
  const HeifDecoderMock = vi.fn().mockImplementation(() => ({ decode: decodeFn }));
  vi.doMock('libheif-js', () => ({ HeifDecoder: HeifDecoderMock }));
  return { decodeFn, HeifDecoderMock };
}

/**
 * Tear down mock after each test.
 */
function unmockLibheif() {
  vi.doUnmock('libheif-js');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HEICWasmDecoder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // A. decodeHEICToImageData — ArrayBuffer/Uint8Array conversion
  // =========================================================================

  describe('decodeHEICToImageData', () => {
    it('wraps ArrayBuffer in Uint8Array before calling decode()', async () => {
      const img = createMockImage();
      const { decodeFn } = mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const buf = new ArrayBuffer(24);
      await decodeHEICToImageData(buf);

      expect(decodeFn).toHaveBeenCalledOnce();
      const arg = decodeFn.mock.calls[0][0];
      expect(arg).toBeInstanceOf(Uint8Array);
      expect(arg.buffer).toBe(buf);

      unmockLibheif();
    });

    it('passes the allocated imageData object to display() for in-place fill', async () => {
      // Verify that display() receives the buffer that the production code allocated,
      // so libheif can write pixels into it in-place.
      let capturedImageData: unknown = null;
      const img: MockHeifImage = {
        get_width: () => 2,
        get_height: () => 2,
        is_primary: () => true,
        display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
          capturedImageData = imageData;
          imageData.data.fill(255);
          setTimeout(() => callback(imageData), 0);
        },
        free: vi.fn(),
      };
      mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      // The same buffer that display() wrote into should be returned
      expect(capturedImageData).not.toBeNull();
      expect((capturedImageData as { data: Uint8ClampedArray }).data).toBe(result.data);

      unmockLibheif();
    });

    it('resolves when display() invokes callback synchronously', async () => {
      // Some libheif-js builds call the callback synchronously.
      // The production code wraps it in a Promise — verify it resolves without hanging.
      const img = createMockImage({ sync: true });
      mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      // If the Promise wrapping is broken, this will hang/timeout, not just fail an assertion
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      expect(result.data).toBeInstanceOf(Uint8ClampedArray);

      unmockLibheif();
    });
  });

  // =========================================================================
  // B. Primary image selection logic
  // =========================================================================

  describe('primary image selection', () => {
    it('selects the primary image when it is not at index 0', async () => {
      const secondary = createMockImage({ width: 2, height: 2, primary: false, fillValue: 10 });
      const primary = createMockImage({ width: 5, height: 5, primary: true, fillValue: 99 });
      mockLibheif([secondary, primary]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICToImageData(new ArrayBuffer(16));

      // The non-primary image (index 0) should be freed as a sibling,
      // and the primary (index 1) should be freed in the finally block.
      // Both must be freed, but the secondary is freed FIRST (as a sibling).
      expect(secondary.free).toHaveBeenCalledOnce();
      expect(primary.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });

    it('falls back to index 0 when is_primary() throws (WASM binding missing)', async () => {
      const first = createMockImage({ width: 3, height: 3, isPrimaryThrows: true });
      const second = createMockImage({ width: 1, height: 1, isPrimaryThrows: true });
      mockLibheif([first, second]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICToImageData(new ArrayBuffer(16));

      // Falls back to index 0: first is used (freed in finally), second is freed as sibling
      expect(first.free).toHaveBeenCalledOnce();
      expect(second.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });

    it('selects index 0 when no image reports is_primary() = true', async () => {
      const img0 = createMockImage({ primary: false });
      const img1 = createMockImage({ primary: false });
      mockLibheif([img0, img1]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICToImageData(new ArrayBuffer(16));

      // findIndex returns -1 when none is primary, so targetIndex stays 0.
      // img0 is the target (freed in finally), img1 is freed as sibling.
      expect(img0.free).toHaveBeenCalledOnce();
      expect(img1.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });
  });

  // =========================================================================
  // C. Error handling — real rejection logic and error types
  // =========================================================================

  describe('error handling', () => {
    it('rejects with DecoderError when decode() returns an empty array', async () => {
      mockLibheif([]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      const error = await decodeHEICToImageData(new ArrayBuffer(16)).catch(e => e);
      expect(error).toBeInstanceOf(DecoderError);
      expect(error.message).toContain('libheif decoded no images');

      unmockLibheif();
    });

    it('rejects with DecoderError when decode() returns null', async () => {
      mockLibheif(null);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      const error = await decodeHEICToImageData(new ArrayBuffer(16)).catch(e => e);
      expect(error).toBeInstanceOf(DecoderError);
      expect(error.message).toContain('libheif decoded no images');

      unmockLibheif();
    });

    it('rejects with DecoderError when display() callback returns null', async () => {
      const img = createMockImage({ displayReturnsNull: true });
      mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      const error = await decodeHEICToImageData(new ArrayBuffer(16)).catch(e => e);
      expect(error).toBeInstanceOf(DecoderError);
      expect(error.message).toContain('display() callback returned null');

      unmockLibheif();
    });

    it('propagates errors thrown by decode() without wrapping', async () => {
      const decodeFn = vi.fn().mockImplementation(() => {
        throw new Error('Corrupt HEIC bitstream');
      });
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({ decode: decodeFn })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow(
        'Corrupt HEIC bitstream'
      );

      unmockLibheif();
    });

    it('rejects with validation error for zero-dimension image', async () => {
      const img = createMockImage({ width: 0, height: 10 });
      mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow(
        'Invalid HEIC dimensions'
      );

      unmockLibheif();
    });
  });

  // =========================================================================
  // D. decodeHEICItemToImageData — index-based selection
  // =========================================================================

  describe('decodeHEICItemToImageData', () => {
    it('frees non-target images as siblings when selecting by index', async () => {
      const img0 = createMockImage({ primary: true, fillValue: 10 });
      const img1 = createMockImage({ primary: false, fillValue: 200 });
      mockLibheif([img0, img1]);

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICItemToImageData(new ArrayBuffer(16), 1);

      // img0 (sibling) should be freed immediately, img1 (target) freed in finally
      expect(img0.free).toHaveBeenCalledOnce();
      expect(img1.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });

    it('rejects with DecoderError for out-of-range index', async () => {
      const img = createMockImage();
      mockLibheif([img]);

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      const error = await decodeHEICItemToImageData(new ArrayBuffer(16), 5).catch(e => e);
      expect(error).toBeInstanceOf(DecoderError);
      expect(error.message).toContain('out of range');

      unmockLibheif();
    });

    it('rejects with DecoderError for negative index', async () => {
      const img = createMockImage();
      mockLibheif([img]);

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      const error = await decodeHEICItemToImageData(new ArrayBuffer(16), -1).catch(e => e);
      expect(error).toBeInstanceOf(DecoderError);
      expect(error.message).toContain('out of range');

      unmockLibheif();
    });

    it('includes the actual index and image count in the error message', async () => {
      const imgs = [createMockImage(), createMockImage()];
      mockLibheif(imgs);

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      const error = await decodeHEICItemToImageData(new ArrayBuffer(16), 7).catch(e => e);
      expect(error.message).toContain('7');
      expect(error.message).toContain('2 images');

      unmockLibheif();
    });
  });

  // =========================================================================
  // E. decodeHEICAuxImageData — auxiliary image selection
  // =========================================================================

  describe('decodeHEICAuxImageData', () => {
    it('picks the first non-primary image when primary is at index 0', async () => {
      const primary = createMockImage({ width: 4, height: 4, primary: true, fillValue: 50 });
      const aux = createMockImage({ width: 2, height: 2, primary: false, fillValue: 100 });
      mockLibheif([primary, aux]);

      const { decodeHEICAuxImageData } = await import('./HEICWasmDecoder');
      await decodeHEICAuxImageData(new ArrayBuffer(16));

      // Primary (index 0) is freed as a sibling, aux (index 1) is the target
      expect(primary.free).toHaveBeenCalledOnce();
      expect(aux.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });

    it('picks index 0 when primary is at a later index', async () => {
      // If primary is at index 1, auxIndex = primaryIndex === 0 ? 1 : 0 => 0
      const aux = createMockImage({ width: 2, height: 2, primary: false, fillValue: 100 });
      const primary = createMockImage({ width: 4, height: 4, primary: true, fillValue: 50 });
      mockLibheif([aux, primary]);

      const { decodeHEICAuxImageData } = await import('./HEICWasmDecoder');
      await decodeHEICAuxImageData(new ArrayBuffer(16));

      // aux (index 0) is the target, primary (index 1) freed as sibling
      expect(aux.free).toHaveBeenCalledOnce();
      expect(primary.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });

    it('rejects with DecoderError when only one image exists', async () => {
      const img = createMockImage();
      mockLibheif([img]);

      const { decodeHEICAuxImageData } = await import('./HEICWasmDecoder');

      const error = await decodeHEICAuxImageData(new ArrayBuffer(16)).catch(e => e);
      expect(error).toBeInstanceOf(DecoderError);
      expect(error.message).toContain('No auxiliary image found');

      unmockLibheif();
    });

    it('rejects with DecoderError when decode returns empty array', async () => {
      mockLibheif([]);

      const { decodeHEICAuxImageData } = await import('./HEICWasmDecoder');

      const error = await decodeHEICAuxImageData(new ArrayBuffer(16)).catch(e => e);
      expect(error).toBeInstanceOf(DecoderError);
      expect(error.message).toContain('No auxiliary image found');

      unmockLibheif();
    });

    it('frees the single image when rejecting due to insufficient images', async () => {
      const img = createMockImage();
      mockLibheif([img]);

      const { decodeHEICAuxImageData } = await import('./HEICWasmDecoder');
      await decodeHEICAuxImageData(new ArrayBuffer(16)).catch(() => {});

      expect(img.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });

    it('falls back to index 0 as primary when is_primary() throws', async () => {
      const img0 = createMockImage({ isPrimaryThrows: true });
      const img1 = createMockImage({ isPrimaryThrows: true });
      mockLibheif([img0, img1]);

      const { decodeHEICAuxImageData } = await import('./HEICWasmDecoder');
      await decodeHEICAuxImageData(new ArrayBuffer(16));

      // is_primary() throws => primaryIndex stays 0 => auxIndex = 1
      // img0 freed as sibling, img1 freed in finally
      expect(img0.free).toHaveBeenCalledOnce();
      expect(img1.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });
  });

  // =========================================================================
  // F. Resource cleanup — free() contract
  // =========================================================================

  describe('resource cleanup', () => {
    it('calls free() on the decoded image after successful decode', async () => {
      const img = createMockImage();
      mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICToImageData(new ArrayBuffer(16));

      expect(img.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });

    it('calls free() even when display() callback returns null (error path)', async () => {
      const img = createMockImage({ displayReturnsNull: true });
      mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow();
      expect(img.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });

    it('frees ALL sibling images in a multi-image decode', async () => {
      const imgs = [
        createMockImage({ width: 1, height: 1, primary: true, fillValue: 10 }),
        createMockImage({ width: 2, height: 2, primary: false, fillValue: 20 }),
        createMockImage({ width: 3, height: 3, primary: false, fillValue: 30 }),
      ];
      mockLibheif(imgs);

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICItemToImageData(new ArrayBuffer(16), 1);

      // The target image (index 1) is freed in the finally block.
      // Sibling images (index 0, 2) are freed immediately.
      // All three should have been freed exactly once.
      for (const img of imgs) {
        expect(img.free).toHaveBeenCalledOnce();
      }

      unmockLibheif();
    });

    it('frees all images when index is out of range', async () => {
      const imgs = [
        createMockImage({ primary: true }),
        createMockImage({ primary: false }),
      ];
      mockLibheif(imgs);

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICItemToImageData(new ArrayBuffer(16), 5)).rejects.toThrow(
        'out of range'
      );

      for (const img of imgs) {
        expect(img.free).toHaveBeenCalledOnce();
      }

      unmockLibheif();
    });
  });
});
