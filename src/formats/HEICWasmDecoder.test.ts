/**
 * HEICWasmDecoder Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('HEICWasmDecoder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('decodeHEICToImageData', () => {
    it('should decode to correct width and height', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 4,
            get_height: () => 3,
            is_primary: () => true,
            display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
              for (let i = 0; i < imageData.data.length; i += 4) {
                imageData.data[i] = 100;
                imageData.data[i + 1] = 150;
                imageData.data[i + 2] = 200;
                imageData.data[i + 3] = 255;
              }
              setTimeout(() => callback(imageData), 0);
            },
            free: vi.fn(),
          }]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      expect(result.width).toBe(4);
      expect(result.height).toBe(3);

      vi.doUnmock('libheif-js');
    });

    it('should return Uint8ClampedArray data', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 2,
            get_height: () => 2,
            is_primary: () => true,
            display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
              imageData.data.fill(128);
              setTimeout(() => callback(imageData), 0);
            },
            free: vi.fn(),
          }]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      expect(result.data).toBeInstanceOf(Uint8ClampedArray);
      expect(result.data.length).toBe(2 * 2 * 4);

      vi.doUnmock('libheif-js');
    });

    it('should return correct RGBA pixel values', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 2,
            get_height: () => 2,
            is_primary: () => true,
            display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
              for (let i = 0; i < imageData.data.length; i += 4) {
                imageData.data[i] = 128;
                imageData.data[i + 1] = 64;
                imageData.data[i + 2] = 32;
                imageData.data[i + 3] = 255;
              }
              setTimeout(() => callback(imageData), 0);
            },
            free: vi.fn(),
          }]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      // First pixel
      expect(result.data[0]).toBe(128); // R
      expect(result.data[1]).toBe(64);  // G
      expect(result.data[2]).toBe(32);  // B
      expect(result.data[3]).toBe(255); // A

      vi.doUnmock('libheif-js');
    });

    it('should call image.free() for cleanup', async () => {
      const freeFn = vi.fn();

      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 1,
            get_height: () => 1,
            is_primary: () => true,
            display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
              imageData.data.fill(0);
              setTimeout(() => callback(imageData), 0);
            },
            free: freeFn,
          }]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICToImageData(new ArrayBuffer(16));

      expect(freeFn).toHaveBeenCalledOnce();

      vi.doUnmock('libheif-js');
    });

    it('should reject when decode returns empty array', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow(
        'libheif decoded no images'
      );

      vi.doUnmock('libheif-js');
    });

    it('should reject when decode returns null', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue(null),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow(
        'libheif decoded no images'
      );

      vi.doUnmock('libheif-js');
    });

    it('should reject when display() callback returns null', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 2,
            get_height: () => 2,
            is_primary: () => true,
            display: (_imageData: unknown, callback: (r: null) => void) => {
              setTimeout(() => callback(null), 0);
            },
            free: vi.fn(),
          }]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow(
        'display() callback returned null'
      );

      vi.doUnmock('libheif-js');
    });

    it('should lazy-load libheif-js module', async () => {
      const decodeMock = vi.fn().mockReturnValue([{
        get_width: () => 1,
        get_height: () => 1,
        is_primary: () => true,
        display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
          imageData.data.fill(0);
          setTimeout(() => callback(imageData), 0);
        },
        free: vi.fn(),
      }]);

      const HeifDecoderMock = vi.fn().mockImplementation(() => ({
        decode: decodeMock,
      }));

      vi.doMock('libheif-js', () => ({
        HeifDecoder: HeifDecoderMock,
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICToImageData(new ArrayBuffer(16));

      expect(HeifDecoderMock).toHaveBeenCalledOnce();
      expect(decodeMock).toHaveBeenCalledOnce();

      vi.doUnmock('libheif-js');
    });

    it('should propagate errors from libheif-js decode()', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockImplementation(() => {
            throw new Error('Corrupt HEIC bitstream');
          }),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow(
        'Corrupt HEIC bitstream'
      );

      vi.doUnmock('libheif-js');
    });

    it('should allocate correct buffer size for pixel data', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 10,
            get_height: () => 5,
            is_primary: () => true,
            display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
              imageData.data.fill(255);
              setTimeout(() => callback(imageData), 0);
            },
            free: vi.fn(),
          }]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      // 10 * 5 * 4 (RGBA) = 200
      expect(result.data.length).toBe(200);

      vi.doUnmock('libheif-js');
    });

    it('should handle 1x1 image', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 1,
            get_height: () => 1,
            is_primary: () => true,
            display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
              imageData.data[0] = 255;
              imageData.data[1] = 0;
              imageData.data[2] = 128;
              imageData.data[3] = 255;
              setTimeout(() => callback(imageData), 0);
            },
            free: vi.fn(),
          }]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data.length).toBe(4);
      expect(result.data[0]).toBe(255);
      expect(result.data[2]).toBe(128);

      vi.doUnmock('libheif-js');
    });
  });

  describe('decodeHEICItemToImageData', () => {
    it('should pick correct image by index', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([
            {
              get_width: () => 2,
              get_height: () => 2,
              is_primary: () => true,
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(10);
                setTimeout(() => callback(imageData), 0);
              },
              free: vi.fn(),
            },
            {
              get_width: () => 4,
              get_height: () => 4,
              is_primary: () => false,
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(200);
                setTimeout(() => callback(imageData), 0);
              },
              free: vi.fn(),
            },
          ]),
        })),
      }));

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      // Index 0 (primary)
      const result0 = await decodeHEICItemToImageData(new ArrayBuffer(16), 0);
      expect(result0.width).toBe(2);
      expect(result0.height).toBe(2);
      expect(result0.data[0]).toBe(10);

      vi.doUnmock('libheif-js');
    });

    it('should pick second image by index', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([
            {
              get_width: () => 2,
              get_height: () => 2,
              is_primary: () => true,
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(10);
                setTimeout(() => callback(imageData), 0);
              },
              free: vi.fn(),
            },
            {
              get_width: () => 4,
              get_height: () => 4,
              is_primary: () => false,
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(200);
                setTimeout(() => callback(imageData), 0);
              },
              free: vi.fn(),
            },
          ]),
        })),
      }));

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      // Index 1 (secondary)
      const result1 = await decodeHEICItemToImageData(new ArrayBuffer(16), 1);
      expect(result1.width).toBe(4);
      expect(result1.height).toBe(4);
      expect(result1.data[0]).toBe(200);

      vi.doUnmock('libheif-js');
    });

    it('should reject for out-of-range index', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 1,
            get_height: () => 1,
            is_primary: () => true,
            display: vi.fn(),
            free: vi.fn(),
          }]),
        })),
      }));

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICItemToImageData(new ArrayBuffer(16), 5)).rejects.toThrow(
        'out of range'
      );

      vi.doUnmock('libheif-js');
    });

    it('should reject for negative index', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 1,
            get_height: () => 1,
            is_primary: () => true,
            display: vi.fn(),
            free: vi.fn(),
          }]),
        })),
      }));

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICItemToImageData(new ArrayBuffer(16), -1)).rejects.toThrow(
        'out of range'
      );

      vi.doUnmock('libheif-js');
    });

    it('should free image even for first item (index 0)', async () => {
      const freeFn = vi.fn();

      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 1,
            get_height: () => 1,
            is_primary: () => true,
            display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
              imageData.data.fill(0);
              setTimeout(() => callback(imageData), 0);
            },
            free: freeFn,
          }]),
        })),
      }));

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICItemToImageData(new ArrayBuffer(16), 0);

      expect(freeFn).toHaveBeenCalledOnce();

      vi.doUnmock('libheif-js');
    });

    it('should pass Uint8Array to decoder.decode()', async () => {
      const decodeFn = vi.fn().mockReturnValue([{
        get_width: () => 1,
        get_height: () => 1,
        is_primary: () => true,
        display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
          imageData.data.fill(0);
          setTimeout(() => callback(imageData), 0);
        },
        free: vi.fn(),
      }]);

      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: decodeFn,
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const buf = new ArrayBuffer(16);
      await decodeHEICToImageData(buf);

      expect(decodeFn).toHaveBeenCalledWith(expect.any(Uint8Array));

      vi.doUnmock('libheif-js');
    });

    it('should handle synchronous display callback', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 2,
            get_height: () => 1,
            is_primary: () => true,
            display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
              imageData.data[0] = 42;
              imageData.data[1] = 43;
              imageData.data[2] = 44;
              imageData.data[3] = 255;
              imageData.data[4] = 10;
              imageData.data[5] = 20;
              imageData.data[6] = 30;
              imageData.data[7] = 255;
              // Synchronous callback (some libheif versions call synchronously)
              callback(imageData);
            },
            free: vi.fn(),
          }]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      expect(result.width).toBe(2);
      expect(result.height).toBe(1);
      expect(result.data[0]).toBe(42);
      expect(result.data[4]).toBe(10);

      vi.doUnmock('libheif-js');
    });

    it('should work with decodeHEICToImageData (defaults to index 0)', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([
            {
              get_width: () => 3,
              get_height: () => 3,
              is_primary: () => true,
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(77);
                setTimeout(() => callback(imageData), 0);
              },
              free: vi.fn(),
            },
            {
              get_width: () => 1,
              get_height: () => 1,
              is_primary: () => false,
              display: vi.fn(),
              free: vi.fn(),
            },
          ]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      // Should pick index 0 (the 3x3 image)
      expect(result.width).toBe(3);
      expect(result.height).toBe(3);
      expect(result.data[0]).toBe(77);

      vi.doUnmock('libheif-js');
    });
  });

  describe('resource cleanup', () => {
    it('should call free() even when display() rejects', async () => {
      const freeFn = vi.fn();

      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 2,
            get_height: () => 2,
            is_primary: () => true,
            display: (_imageData: unknown, callback: (r: null) => void) => {
              setTimeout(() => callback(null), 0);
            },
            free: freeFn,
          }]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow(
        'display() callback returned null'
      );

      expect(freeFn).toHaveBeenCalledOnce();

      vi.doUnmock('libheif-js');
    });

    it('should free all sibling images in multi-image decode', async () => {
      const freeFns = [vi.fn(), vi.fn(), vi.fn()];

      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([
            {
              get_width: () => 1,
              get_height: () => 1,
              is_primary: () => true,
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(10);
                setTimeout(() => callback(imageData), 0);
              },
              free: freeFns[0],
            },
            {
              get_width: () => 2,
              get_height: () => 2,
              is_primary: () => false,
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(20);
                setTimeout(() => callback(imageData), 0);
              },
              free: freeFns[1],
            },
            {
              get_width: () => 3,
              get_height: () => 3,
              is_primary: () => false,
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(30);
                setTimeout(() => callback(imageData), 0);
              },
              free: freeFns[2],
            },
          ]),
        })),
      }));

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');
      await decodeHEICItemToImageData(new ArrayBuffer(16), 1);

      // All three images should have been freed
      expect(freeFns[0]).toHaveBeenCalledOnce();
      expect(freeFns[1]).toHaveBeenCalledOnce();
      expect(freeFns[2]).toHaveBeenCalledOnce();

      vi.doUnmock('libheif-js');
    });

    it('should use is_primary() to select primary image', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([
            {
              get_width: () => 2,
              get_height: () => 2,
              is_primary: () => false,
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(10);
                setTimeout(() => callback(imageData), 0);
              },
              free: vi.fn(),
            },
            {
              get_width: () => 4,
              get_height: () => 4,
              is_primary: () => true,
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(99);
                setTimeout(() => callback(imageData), 0);
              },
              free: vi.fn(),
            },
          ]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      // Should pick the primary image at index 1, not index 0
      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.data[0]).toBe(99);

      vi.doUnmock('libheif-js');
    });

    it('should reject when image dimensions are invalid (zero width)', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([{
            get_width: () => 0,
            get_height: () => 10,
            is_primary: () => true,
            display: vi.fn(),
            free: vi.fn(),
          }]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICToImageData(new ArrayBuffer(16))).rejects.toThrow();

      vi.doUnmock('libheif-js');
    });

    it('should fall back to index 0 when is_primary() throws', async () => {
      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([
            {
              get_width: () => 3,
              get_height: () => 3,
              is_primary: () => { throw new ReferenceError('heif_image_handle_is_primary_image is not defined'); },
              display: (imageData: { data: Uint8ClampedArray }, callback: (r: unknown) => void) => {
                imageData.data.fill(55);
                setTimeout(() => callback(imageData), 0);
              },
              free: vi.fn(),
            },
            {
              get_width: () => 1,
              get_height: () => 1,
              is_primary: () => { throw new ReferenceError('heif_image_handle_is_primary_image is not defined'); },
              display: vi.fn(),
              free: vi.fn(),
            },
          ]),
        })),
      }));

      const { decodeHEICToImageData } = await import('./HEICWasmDecoder');
      const result = await decodeHEICToImageData(new ArrayBuffer(16));

      // Should fall back to index 0
      expect(result.width).toBe(3);
      expect(result.height).toBe(3);
      expect(result.data[0]).toBe(55);

      vi.doUnmock('libheif-js');
    });

    it('should free all images when index is out of range', async () => {
      const freeFns = [vi.fn(), vi.fn()];

      vi.doMock('libheif-js', () => ({
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockReturnValue([
            {
              get_width: () => 1,
              get_height: () => 1,
              is_primary: () => true,
              display: vi.fn(),
              free: freeFns[0],
            },
            {
              get_width: () => 1,
              get_height: () => 1,
              is_primary: () => false,
              display: vi.fn(),
              free: freeFns[1],
            },
          ]),
        })),
      }));

      const { decodeHEICItemToImageData } = await import('./HEICWasmDecoder');

      await expect(decodeHEICItemToImageData(new ArrayBuffer(16), 5)).rejects.toThrow(
        'out of range'
      );

      // Both images should have been freed
      expect(freeFns[0]).toHaveBeenCalledOnce();
      expect(freeFns[1]).toHaveBeenCalledOnce();

      vi.doUnmock('libheif-js');
    });
  });
});
