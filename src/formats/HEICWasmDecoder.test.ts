/**
 * HEICWasmDecoder Unit Tests
 *
 * Since libheif-js (WASM) cannot run in the Node/jsdom test environment,
 * we mock it. However, each test verifies REAL glue logic in the decoder:
 *   - Buffer allocation (width * height * 4)
 *   - ArrayBuffer -> Uint8Array conversion before passing to libheif
 *   - Error handling / error message dispatch
 *   - Resource cleanup (free() calls on all images)
 *   - Primary image selection via is_primary()
 *   - Index-based image selection with bounds checking
 *   - Sync vs async display() callback handling
 *
 * Tests that merely assert mock values back (e.g., "mock returns width=4,
 * assert width===4") have been removed as they test nothing real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  // A. decodeHEICToImageData — real glue logic
  // =========================================================================

  describe('decodeHEICToImageData', () => {
    it('allocates an RGBA buffer of exactly width * height * 4 bytes', async () => {
      // The production code creates `new Uint8ClampedArray(w * h * 4)`.
      // This test verifies the allocation formula, not the mock's pixel values.
      const img = createMockImage({ width: 7, height: 3 });
      mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      expect(result.data).toBeInstanceOf(Uint8ClampedArray);
      expect(result.data.length).toBe(7 * 3 * 4); // 84

      unmockLibheif();
    });

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

    it('selects the primary image when it is not at index 0', async () => {
      // Production code uses findIndex(img => img.is_primary()).
      // Put the primary at index 1 to verify selection logic.
      const secondary = createMockImage({ width: 2, height: 2, primary: false, fillValue: 10 });
      const primary = createMockImage({ width: 5, height: 5, primary: true, fillValue: 99 });
      mockLibheif([secondary, primary]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      // Should have picked the 5x5 primary, not the 2x2 secondary
      expect(result.width).toBe(5);
      expect(result.height).toBe(5);
      expect(result.data.length).toBe(5 * 5 * 4);

      unmockLibheif();
    });

    it('falls back to index 0 when is_primary() throws', async () => {
      const first = createMockImage({ width: 3, height: 3, isPrimaryThrows: true });
      const second = createMockImage({ width: 1, height: 1, isPrimaryThrows: true });
      mockLibheif([first, second]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      // Should fall back to index 0 (the 3x3 image)
      expect(result.width).toBe(3);
      expect(result.height).toBe(3);
      expect(result.data.length).toBe(3 * 3 * 4);

      unmockLibheif();
    });

    it('handles synchronous display() callback', async () => {
      // Some libheif-js builds call the callback synchronously.
      // The production code wraps it in a Promise — verify it resolves.
      const img = createMockImage({ width: 2, height: 1, sync: true });
      mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      expect(result.width).toBe(2);
      expect(result.height).toBe(1);
      expect(result.data.length).toBe(2 * 1 * 4);

      unmockLibheif();
    });
  });

  // =========================================================================
  // B. Error handling — real rejection logic
  // =========================================================================

  describe('error handling', () => {
    it('rejects when decode() returns an empty array', async () => {
      mockLibheif([]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow(
        'libheif decoded no images'
      );

      unmockLibheif();
    });

    it('rejects when decode() returns null', async () => {
      mockLibheif(null);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow(
        'libheif decoded no images'
      );

      unmockLibheif();
    });

    it('rejects when display() callback returns null', async () => {
      const img = createMockImage({ displayReturnsNull: true });
      mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow(
        'display() callback returned null'
      );

      unmockLibheif();
    });

    it('propagates errors thrown by decode()', async () => {
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

    it('rejects with validation error for zero-width image', async () => {
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
  // C. decodeHEICItemToImageData — index-based selection
  // =========================================================================

  describe('decodeHEICItemToImageData', () => {
    it('picks the image at the specified index', async () => {
      const img0 = createMockImage({ width: 2, height: 2, primary: true, fillValue: 10 });
      const img1 = createMockImage({ width: 6, height: 4, primary: false, fillValue: 200 });
      mockLibheif([img0, img1]);

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      // Pick index 1 — verify we get the 6x4 buffer, not the 2x2 one
      const result = await decodeHEICItemToImageData(new ArrayBuffer(16), 1);
      expect(result.width).toBe(6);
      expect(result.height).toBe(4);
      expect(result.data.length).toBe(6 * 4 * 4);

      unmockLibheif();
    });

    it('rejects for out-of-range index', async () => {
      const img = createMockImage();
      mockLibheif([img]);

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICItemToImageData(new ArrayBuffer(16), 5)).rejects.toThrow(
        'out of range'
      );

      unmockLibheif();
    });

    it('rejects for negative index', async () => {
      const img = createMockImage();
      mockLibheif([img]);

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICItemToImageData(new ArrayBuffer(16), -1)).rejects.toThrow(
        'out of range'
      );

      unmockLibheif();
    });
  });

  // =========================================================================
  // D. Resource cleanup — free() contract
  // =========================================================================

  describe('resource cleanup', () => {
    it('calls free() on the decoded image after success', async () => {
      const img = createMockImage();
      mockLibheif([img]);

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICToImageData(new ArrayBuffer(16));

      expect(img.free).toHaveBeenCalledOnce();

      unmockLibheif();
    });

    it('calls free() even when display() callback returns null', async () => {
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
