/**
 * IPImage Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IPImage } from './Image';
import type { DataType } from './Image';
import { ManagedVideoFrame } from './ManagedVideoFrame';

/** Create a mock VideoFrame with a working format property for ManagedVideoFrame compatibility */
function createMockVideoFrame(overrides?: Partial<{ close: () => void }>): VideoFrame {
  let closed = false;
  const closeFn = overrides?.close ?? (() => { closed = true; });
  return {
    get format() { return closed ? null : 'RGBA'; },
    close: closeFn,
    displayWidth: 1920,
    displayHeight: 1080,
    codedWidth: 1920,
    codedHeight: 1080,
    timestamp: 0,
    duration: null,
    colorSpace: {},
  } as unknown as VideoFrame;
}

describe('IPImage', () => {
  describe('constructor', () => {
    it('creates image with specified dimensions', () => {
      const image = new IPImage({
        width: 100,
        height: 50,
        channels: 4,
        dataType: 'uint8',
      });

      expect(image.width).toBe(100);
      expect(image.height).toBe(50);
      expect(image.channels).toBe(4);
      expect(image.dataType).toBe('uint8');
    });

    it('creates image with provided data', () => {
      const data = new ArrayBuffer(400); // 10x10x4 bytes
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
        data,
      });

      expect(image.data).toBe(data);
    });

    it('allocates buffer when no data provided', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
      });

      expect(image.data.byteLength).toBe(10 * 10 * 4 * 1); // width * height * channels * bytesPerComponent
    });

    it('stores metadata', () => {
      const image = new IPImage({
        width: 100,
        height: 100,
        channels: 4,
        dataType: 'uint8',
        metadata: {
          colorSpace: 'sRGB',
          frameNumber: 42,
          sourcePath: '/path/to/file.exr',
        },
      });

      expect(image.metadata.colorSpace).toBe('sRGB');
      expect(image.metadata.frameNumber).toBe(42);
      expect(image.metadata.sourcePath).toBe('/path/to/file.exr');
    });

    it('uses empty metadata when none provided', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
      });

      expect(image.metadata).toEqual({});
    });

    it('initializes texture state', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
      });

      expect(image.texture).toBeNull();
      expect(image.textureNeedsUpdate).toBe(true);
    });
  });

  describe('getBytesPerComponent', () => {
    it('returns 1 for uint8', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
      });

      expect(image.getBytesPerComponent()).toBe(1);
    });

    it('returns 2 for uint16', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint16',
      });

      expect(image.getBytesPerComponent()).toBe(2);
    });

    it('returns 4 for float32', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
      });

      expect(image.getBytesPerComponent()).toBe(4);
    });
  });

  describe('getTypedArray', () => {
    it('returns Uint8Array for uint8 data', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
      });

      const arr = image.getTypedArray();
      expect(arr).toBeInstanceOf(Uint8Array);
      expect(arr.length).toBe(10 * 10 * 4);
    });

    it('returns Uint16Array for uint16 data', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint16',
      });

      const arr = image.getTypedArray();
      expect(arr).toBeInstanceOf(Uint16Array);
      expect(arr.length).toBe(10 * 10 * 4);
    });

    it('returns Float32Array for float32 data', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
      });

      const arr = image.getTypedArray();
      expect(arr).toBeInstanceOf(Float32Array);
      expect(arr.length).toBe(10 * 10 * 4);
    });
  });

  describe('getPixel', () => {
    it('returns pixel values at given coordinates', () => {
      const data = new Uint8Array([
        255, 0, 0, 255,   // (0,0) red
        0, 255, 0, 255,   // (1,0) green
        0, 0, 255, 255,   // (0,1) blue
        255, 255, 0, 255, // (1,1) yellow
      ]);

      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'uint8',
        data: data.buffer,
      });

      expect(image.getPixel(0, 0)).toEqual([255, 0, 0, 255]);
      expect(image.getPixel(1, 0)).toEqual([0, 255, 0, 255]);
      expect(image.getPixel(0, 1)).toEqual([0, 0, 255, 255]);
      expect(image.getPixel(1, 1)).toEqual([255, 255, 0, 255]);
    });

    it('handles different channel counts', () => {
      const data = new Uint8Array([
        100, 150, 200,  // (0,0)
        50, 75, 100,    // (1,0)
      ]);

      const image = new IPImage({
        width: 2,
        height: 1,
        channels: 3,
        dataType: 'uint8',
        data: data.buffer,
      });

      expect(image.getPixel(0, 0)).toEqual([100, 150, 200]);
      expect(image.getPixel(1, 0)).toEqual([50, 75, 100]);
    });

    it('works with float32 data', () => {
      const data = new Float32Array([
        1.0, 0.5, 0.25, 1.0,
      ]);

      const image = new IPImage({
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'float32',
        data: data.buffer,
      });

      const pixel = image.getPixel(0, 0);
      expect(pixel[0]).toBeCloseTo(1.0);
      expect(pixel[1]).toBeCloseTo(0.5);
      expect(pixel[2]).toBeCloseTo(0.25);
      expect(pixel[3]).toBeCloseTo(1.0);
    });
  });

  describe('setPixel', () => {
    it('sets pixel values at given coordinates', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'uint8',
      });

      image.setPixel(0, 0, [255, 128, 64, 255]);
      image.setPixel(1, 1, [100, 200, 50, 128]);

      expect(image.getPixel(0, 0)).toEqual([255, 128, 64, 255]);
      expect(image.getPixel(1, 1)).toEqual([100, 200, 50, 128]);
    });

    it('marks texture as needing update', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'uint8',
      });

      image.textureNeedsUpdate = false;
      image.setPixel(0, 0, [255, 0, 0, 255]);

      expect(image.textureNeedsUpdate).toBe(true);
    });

    it('handles partial channel values', () => {
      const image = new IPImage({
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'uint8',
      });

      // Set only RGB, leave alpha
      image.setPixel(0, 0, [255, 128, 64]);

      const pixel = image.getPixel(0, 0);
      expect(pixel[0]).toBe(255);
      expect(pixel[1]).toBe(128);
      expect(pixel[2]).toBe(64);
      // Alpha remains 0 (initial value)
      expect(pixel[3]).toBe(0);
    });

    it('works with float32 data', () => {
      const image = new IPImage({
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'float32',
      });

      image.setPixel(0, 0, [1.5, 0.75, 0.25, 1.0]);

      const pixel = image.getPixel(0, 0);
      expect(pixel[0]).toBeCloseTo(1.5);
      expect(pixel[1]).toBeCloseTo(0.75);
      expect(pixel[2]).toBeCloseTo(0.25);
      expect(pixel[3]).toBeCloseTo(1.0);
    });
  });

  describe('clone', () => {
    it('creates a shallow copy sharing the same pixel data', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'uint8',
        metadata: { colorSpace: 'sRGB' },
      });

      image.setPixel(0, 0, [255, 0, 0, 255]);

      const clone = image.clone();

      expect(clone.width).toBe(image.width);
      expect(clone.height).toBe(image.height);
      expect(clone.channels).toBe(image.channels);
      expect(clone.dataType).toBe(image.dataType);
      expect(clone.metadata.colorSpace).toBe('sRGB');
      expect(clone.getPixel(0, 0)).toEqual([255, 0, 0, 255]);
    });

    it('shares the same underlying ArrayBuffer (no copy)', () => {
      const image = new IPImage({
        width: 4,
        height: 4,
        channels: 4,
        dataType: 'uint8',
      });

      image.setPixel(0, 0, [255, 0, 0, 255]);

      const clone = image.clone();

      // The ArrayBuffer reference must be identical (same object)
      expect(clone.data).toBe(image.data);
      // Pixel data is visible through both handles
      expect(clone.getPixel(0, 0)).toEqual([255, 0, 0, 255]);
    });

    it('cloned metadata is independent', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
        metadata: { attributes: { key: 'value' } },
      });

      const clone = image.clone();
      clone.metadata.colorSpace = 'ACEScg';

      expect(image.metadata.colorSpace).toBeUndefined();
      expect(clone.metadata.colorSpace).toBe('ACEScg');
    });
  });

  describe('deepClone', () => {
    it('creates a full copy of the image with independent pixel data', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'uint8',
        metadata: { colorSpace: 'sRGB' },
      });

      image.setPixel(0, 0, [255, 0, 0, 255]);

      const clone = image.deepClone();

      expect(clone.width).toBe(image.width);
      expect(clone.height).toBe(image.height);
      expect(clone.channels).toBe(image.channels);
      expect(clone.dataType).toBe(image.dataType);
      expect(clone.metadata.colorSpace).toBe('sRGB');
      expect(clone.getPixel(0, 0)).toEqual([255, 0, 0, 255]);
    });

    it('deep cloned data is independent', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'uint8',
      });

      image.setPixel(0, 0, [255, 0, 0, 255]);

      const clone = image.deepClone();
      clone.setPixel(0, 0, [0, 255, 0, 255]);

      // Original should be unchanged
      expect(image.getPixel(0, 0)).toEqual([255, 0, 0, 255]);
      expect(clone.getPixel(0, 0)).toEqual([0, 255, 0, 255]);
    });

    it('deep cloned data has a different ArrayBuffer', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'uint8',
      });

      const clone = image.deepClone();

      expect(clone.data).not.toBe(image.data);
    });

    it('deep cloned metadata is independent', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
        metadata: { attributes: { key: 'value' } },
      });

      const clone = image.deepClone();
      clone.metadata.colorSpace = 'ACEScg';

      expect(image.metadata.colorSpace).toBeUndefined();
      expect(clone.metadata.colorSpace).toBe('ACEScg');
    });

    it('does not copy videoFrame', () => {
      ManagedVideoFrame.resetForTesting();
      const mockVideoFrame = createMockVideoFrame();

      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
        videoFrame: mockVideoFrame,
      });

      const cloned = image.deepClone();
      expect(cloned.videoFrame).toBeNull();

      image.close();
    });
  });

  describe('cloneMetadataOnly', () => {
    it('shares the same underlying ArrayBuffer (no copy)', () => {
      const image = new IPImage({
        width: 4,
        height: 4,
        channels: 4,
        dataType: 'uint8',
      });

      image.setPixel(0, 0, [255, 0, 0, 255]);

      const shallow = image.cloneMetadataOnly();

      // The ArrayBuffer reference must be identical (same object)
      expect(shallow.data).toBe(image.data);
      // Pixel data is visible through both handles
      expect(shallow.getPixel(0, 0)).toEqual([255, 0, 0, 255]);
    });

    it('copies basic image properties', () => {
      const image = new IPImage({
        width: 20,
        height: 10,
        channels: 3,
        dataType: 'float32',
        metadata: { colorSpace: 'ACEScg', frameNumber: 7 },
      });

      const shallow = image.cloneMetadataOnly();

      expect(shallow.width).toBe(20);
      expect(shallow.height).toBe(10);
      expect(shallow.channels).toBe(3);
      expect(shallow.dataType).toBe('float32');
      expect(shallow.metadata.colorSpace).toBe('ACEScg');
      expect(shallow.metadata.frameNumber).toBe(7);
    });

    it('metadata is independent (changing clone does not affect original)', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'uint8',
        metadata: { colorSpace: 'sRGB', transferFunction: 'srgb' },
      });

      const shallow = image.cloneMetadataOnly();
      shallow.metadata.colorSpace = 'ACEScg';
      shallow.metadata.transferFunction = 'pq';
      shallow.metadata.frameNumber = 99;

      // Original metadata must be untouched
      expect(image.metadata.colorSpace).toBe('sRGB');
      expect(image.metadata.transferFunction).toBe('srgb');
      expect(image.metadata.frameNumber).toBeUndefined();
    });

    it('does not copy videoFrame', () => {
      ManagedVideoFrame.resetForTesting();
      const mockVideoFrame = createMockVideoFrame();

      const image = new IPImage({
        width: 1920,
        height: 1080,
        channels: 4,
        dataType: 'float32',
        videoFrame: mockVideoFrame,
      });

      const shallow = image.cloneMetadataOnly();

      expect(image.videoFrame).toBe(mockVideoFrame);
      expect(shallow.videoFrame).toBeNull();

      image.close();
    });

    it('does not copy texture or textureNeedsUpdate', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'uint8',
      });

      // Simulate renderer having set these
      image.texture = {} as WebGLTexture;
      image.textureNeedsUpdate = false;

      const shallow = image.cloneMetadataOnly();

      expect(shallow.texture).toBeNull();
      expect(shallow.textureNeedsUpdate).toBe(true);
    });
  });

  describe('fromImageData', () => {
    it('creates IPImage from ImageData', () => {
      const imageData = new ImageData(100, 50);

      const image = IPImage.fromImageData(imageData);

      expect(image.width).toBe(100);
      expect(image.height).toBe(50);
      expect(image.channels).toBe(4);
      expect(image.dataType).toBe('uint8');
    });

    it('preserves pixel data from ImageData', () => {
      const imageData = new ImageData(2, 1);
      imageData.data[0] = 255; // R
      imageData.data[1] = 128; // G
      imageData.data[2] = 64;  // B
      imageData.data[3] = 255; // A

      const image = IPImage.fromImageData(imageData);

      expect(image.getPixel(0, 0)).toEqual([255, 128, 64, 255]);
    });

    it('creates independent copy of data', () => {
      const imageData = new ImageData(1, 1);
      imageData.data[0] = 255;

      const image = IPImage.fromImageData(imageData);

      // Modify original ImageData
      imageData.data[0] = 0;

      // IPImage should have original value
      expect(image.getPixel(0, 0)[0]).toBe(255);
    });
  });

  describe('createEmpty', () => {
    it('creates empty image with default parameters', () => {
      const image = IPImage.createEmpty(800, 600);

      expect(image.width).toBe(800);
      expect(image.height).toBe(600);
      expect(image.channels).toBe(4);
      expect(image.dataType).toBe('uint8');
    });

    it('creates empty image with custom channels', () => {
      const image = IPImage.createEmpty(100, 100, 3);

      expect(image.channels).toBe(3);
    });

    it('creates empty image with custom data type', () => {
      const image = IPImage.createEmpty(100, 100, 4, 'float32');

      expect(image.dataType).toBe('float32');
      expect(image.data.byteLength).toBe(100 * 100 * 4 * 4); // 4 bytes per float32
    });

    it('initializes all pixels to zero', () => {
      const image = IPImage.createEmpty(10, 10);

      // All pixels should be zero
      const arr = image.getTypedArray();
      for (let i = 0; i < arr.length; i++) {
        expect(arr[i]).toBe(0);
      }
    });
  });

  describe('data type memory allocation', () => {
    const testCases: { dataType: DataType; bytesPerComponent: number }[] = [
      { dataType: 'uint8', bytesPerComponent: 1 },
      { dataType: 'uint16', bytesPerComponent: 2 },
      { dataType: 'float32', bytesPerComponent: 4 },
    ];

    testCases.forEach(({ dataType, bytesPerComponent }) => {
      it(`allocates correct buffer size for ${dataType}`, () => {
        const width = 100;
        const height = 50;
        const channels = 4;

        const image = new IPImage({
          width,
          height,
          channels,
          dataType,
        });

        const expectedSize = width * height * channels * bytesPerComponent;
        expect(image.data.byteLength).toBe(expectedSize);
      });
    });
  });

  describe('videoFrame support', () => {
    beforeEach(() => {
      ManagedVideoFrame.resetForTesting();
    });

    it('defaults videoFrame to null when not provided', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
      });

      expect(image.videoFrame).toBeNull();
      expect(image.managedVideoFrame).toBeNull();
    });

    it('stores videoFrame when provided (auto-wraps in ManagedVideoFrame)', () => {
      const mockVideoFrame = createMockVideoFrame();

      const image = new IPImage({
        width: 1920,
        height: 1080,
        channels: 4,
        dataType: 'float32',
        videoFrame: mockVideoFrame,
      });

      expect(image.videoFrame).toBe(mockVideoFrame);
      expect(image.managedVideoFrame).not.toBeNull();
      expect(ManagedVideoFrame.activeCount).toBe(1);

      image.close();
    });

    it('uses managedVideoFrame directly when provided', () => {
      const mockVideoFrame = createMockVideoFrame();
      const managed = ManagedVideoFrame.wrap(mockVideoFrame);

      const image = new IPImage({
        width: 1920,
        height: 1080,
        channels: 4,
        dataType: 'float32',
        managedVideoFrame: managed,
      });

      expect(image.videoFrame).toBe(mockVideoFrame);
      expect(image.managedVideoFrame).toBe(managed);
      // Should not double-wrap
      expect(ManagedVideoFrame.activeCount).toBe(1);

      image.close();
    });

    it('prefers managedVideoFrame over raw videoFrame', () => {
      const rawFrame = createMockVideoFrame();
      const managedFrame = createMockVideoFrame();
      const managed = ManagedVideoFrame.wrap(managedFrame);

      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
        videoFrame: rawFrame,
        managedVideoFrame: managed,
      });

      // managedVideoFrame takes priority
      expect(image.videoFrame).toBe(managedFrame);
      expect(image.managedVideoFrame).toBe(managed);

      image.close();
    });

    it('close() releases managedVideoFrame', () => {
      const mockVideoFrame = createMockVideoFrame();

      const image = new IPImage({
        width: 1920,
        height: 1080,
        channels: 4,
        dataType: 'float32',
        videoFrame: mockVideoFrame,
      });

      expect(image.videoFrame).not.toBeNull();
      expect(ManagedVideoFrame.activeCount).toBe(1);

      image.close();

      expect(image.videoFrame).toBeNull();
      expect(image.managedVideoFrame).toBeNull();
      expect(ManagedVideoFrame.activeCount).toBe(0);
    });

    it('close() is safe to call when no videoFrame', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
      });

      // Should not throw
      image.close();
      expect(image.videoFrame).toBeNull();
    });

    it('close() handles already-closed videoFrame gracefully', () => {
      const mockVideoFrame = createMockVideoFrame({
        close: () => { throw new Error('Already closed'); },
      });

      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
        videoFrame: mockVideoFrame,
      });

      // Should not throw (ManagedVideoFrame.release() catches the error)
      image.close();
      expect(image.videoFrame).toBeNull();
    });

    it('clone does not copy videoFrame (not cloneable)', () => {
      const mockVideoFrame = createMockVideoFrame();

      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
        videoFrame: mockVideoFrame,
      });

      const cloned = image.clone();
      // Clone should not carry the VideoFrame (it's a GPU resource)
      expect(cloned.videoFrame).toBeNull();

      image.close();
    });

    it('videoFrame setter auto-wraps raw VideoFrame', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
      });

      expect(image.videoFrame).toBeNull();

      const mockVideoFrame = createMockVideoFrame();
      image.videoFrame = mockVideoFrame;

      expect(image.videoFrame).toBe(mockVideoFrame);
      expect(image.managedVideoFrame).not.toBeNull();
      expect(ManagedVideoFrame.activeCount).toBe(1);

      image.close();
    });

    it('videoFrame setter releases previous managed frame', () => {
      const frame1 = createMockVideoFrame();
      const frame2 = createMockVideoFrame();

      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
        videoFrame: frame1,
      });

      expect(ManagedVideoFrame.activeCount).toBe(1);

      // Setting a new videoFrame should release the previous one
      image.videoFrame = frame2;
      expect(ManagedVideoFrame.activeCount).toBe(1); // old released, new created
      expect(image.videoFrame).toBe(frame2);

      image.close();
      expect(ManagedVideoFrame.activeCount).toBe(0);
    });

    it('videoFrame setter with null releases current frame', () => {
      const mockVideoFrame = createMockVideoFrame();

      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
        videoFrame: mockVideoFrame,
      });

      expect(ManagedVideoFrame.activeCount).toBe(1);

      image.videoFrame = null;
      expect(image.videoFrame).toBeNull();
      expect(image.managedVideoFrame).toBeNull();
      expect(ManagedVideoFrame.activeCount).toBe(0);
    });

    it('double close is safe (idempotent)', () => {
      const mockVideoFrame = createMockVideoFrame();

      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
        videoFrame: mockVideoFrame,
      });

      image.close();
      image.close(); // second close should not throw
      expect(image.videoFrame).toBeNull();
      expect(ManagedVideoFrame.activeCount).toBe(0);
    });

    it('videoFrame setter leaves consistent state if wrap() throws (closed frame)', () => {
      const frame1 = createMockVideoFrame();
      const closedFrame = createMockVideoFrame();
      closedFrame.close(); // make it closed so wrap() will throw

      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
        videoFrame: frame1,
      });

      expect(ManagedVideoFrame.activeCount).toBe(1);

      // Setting a closed frame should throw but leave consistent state
      expect(() => { image.videoFrame = closedFrame; }).toThrow('already-closed');

      // The old frame was released, managedVideoFrame should be null
      expect(image.managedVideoFrame).toBeNull();
      expect(image.videoFrame).toBeNull();
      expect(ManagedVideoFrame.activeCount).toBe(0);
    });
  });

  describe('HDR metadata', () => {
    it('stores transferFunction in metadata', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
        metadata: {
          transferFunction: 'hlg',
          colorPrimaries: 'bt2020',
        },
      });

      expect(image.metadata.transferFunction).toBe('hlg');
      expect(image.metadata.colorPrimaries).toBe('bt2020');
    });

    it('supports pq transfer function', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'float32',
        metadata: {
          transferFunction: 'pq',
          colorPrimaries: 'bt2020',
        },
      });

      expect(image.metadata.transferFunction).toBe('pq');
    });

    it('defaults to no transferFunction', () => {
      const image = new IPImage({
        width: 10,
        height: 10,
        channels: 4,
        dataType: 'uint8',
      });

      expect(image.metadata.transferFunction).toBeUndefined();
      expect(image.metadata.colorPrimaries).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles 1x1 image', () => {
      const image = new IPImage({
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'uint8',
      });

      image.setPixel(0, 0, [255, 255, 255, 255]);
      expect(image.getPixel(0, 0)).toEqual([255, 255, 255, 255]);
    });

    it('handles grayscale image (1 channel)', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 1,
        dataType: 'uint8',
      });

      image.setPixel(0, 0, [128]);
      expect(image.getPixel(0, 0)).toEqual([128]);
    });

    it('handles very large dimensions', () => {
      // 4K image
      const image = new IPImage({
        width: 3840,
        height: 2160,
        channels: 4,
        dataType: 'uint8',
      });

      expect(image.data.byteLength).toBe(3840 * 2160 * 4);
    });
  });

  describe('clone imageBitmap propagation (regression)', () => {
    it('IMG-R001: clone preserves imageBitmap reference', () => {
      const mockBitmap = {
        width: 100,
        height: 100,
        close: () => {},
      } as unknown as ImageBitmap;

      const original = new IPImage({
        width: 100,
        height: 100,
        channels: 4,
        dataType: 'uint8',
        imageBitmap: mockBitmap,
      });

      const cloned = original.clone();
      expect(cloned.imageBitmap).toBe(mockBitmap);
    });

    it('IMG-R002: clone does NOT copy videoFrame (GPU resource)', () => {
      ManagedVideoFrame.resetForTesting();
      const mockFrame = createMockVideoFrame();

      const original = new IPImage({
        width: 100,
        height: 100,
        channels: 4,
        dataType: 'uint8',
        videoFrame: mockFrame,
      });

      const cloned = original.clone();
      expect(cloned.videoFrame).toBeNull();

      original.close();
    });
  });
});
