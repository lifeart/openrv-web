/**
 * Render Worker Tests
 *
 * Tests for the worker message handling logic.
 * Uses the exported __test__ helpers to test worker internals
 * without actually running in a Worker context.
 */

import { describe, it, expect } from 'vitest';
import { __test__ } from './renderWorker.worker';
import {
  DATA_TYPE_CODES,
  TRANSFER_FUNCTION_CODES,
  COLOR_PRIMARIES_CODES,
} from '../render/renderWorker.messages';
import type { RenderHDRMessage } from '../render/renderWorker.messages';

const { reconstructIPImage, applySyncState } = __test__;

describe('renderWorker', () => {
  // ==========================================================================
  // reconstructIPImage
  // ==========================================================================

  describe('reconstructIPImage', () => {
    it('RW-001: reconstructs float32 image correctly', () => {
      const data = new Float32Array([1.0, 0.5, 0.0, 1.0]).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 1,
        imageData: data,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.float32,
        channels: 4,
      };
      const image = reconstructIPImage(msg);
      expect(image.width).toBe(1);
      expect(image.height).toBe(1);
      expect(image.channels).toBe(4);
      expect(image.dataType).toBe('float32');
      expect(image.data).toBe(data);
    });

    it('RW-002: reconstructs uint8 image correctly', () => {
      const data = new Uint8Array([255, 128, 0, 255]).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 2,
        imageData: data,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.uint8,
        channels: 4,
      };
      const image = reconstructIPImage(msg);
      expect(image.dataType).toBe('uint8');
    });

    it('RW-003: reconstructs uint16 image correctly', () => {
      const data = new Uint16Array([65535, 32768, 0, 65535]).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 3,
        imageData: data,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.uint16,
        channels: 4,
      };
      const image = reconstructIPImage(msg);
      expect(image.dataType).toBe('uint16');
    });

    it('RW-004: reconstructs image with HLG transfer function', () => {
      const data = new Float32Array(4).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 4,
        imageData: data,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.float32,
        channels: 4,
        transferFunction: TRANSFER_FUNCTION_CODES.hlg,
      };
      const image = reconstructIPImage(msg);
      expect(image.metadata.transferFunction).toBe('hlg');
    });

    it('RW-005: reconstructs image with PQ transfer function', () => {
      const data = new Float32Array(4).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 5,
        imageData: data,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.float32,
        channels: 4,
        transferFunction: TRANSFER_FUNCTION_CODES.pq,
      };
      const image = reconstructIPImage(msg);
      expect(image.metadata.transferFunction).toBe('pq');
    });

    it('RW-006: reconstructs image with BT.2020 color primaries', () => {
      const data = new Float32Array(4).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 6,
        imageData: data,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.float32,
        channels: 4,
        colorPrimaries: COLOR_PRIMARIES_CODES.bt2020,
      };
      const image = reconstructIPImage(msg);
      expect(image.metadata.colorPrimaries).toBe('bt2020');
    });

    it('RW-007: reconstructs image without optional metadata', () => {
      const data = new Float32Array(4).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 7,
        imageData: data,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.float32,
        channels: 4,
      };
      const image = reconstructIPImage(msg);
      expect(image.metadata.transferFunction).toBeUndefined();
      expect(image.metadata.colorPrimaries).toBeUndefined();
    });

    it('RW-008: reconstructs image with correct dimensions', () => {
      const data = new Float32Array(1920 * 1080 * 4).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 8,
        imageData: data,
        width: 1920,
        height: 1080,
        dataType: DATA_TYPE_CODES.float32,
        channels: 4,
      };
      const image = reconstructIPImage(msg);
      expect(image.width).toBe(1920);
      expect(image.height).toBe(1080);
    });

    it('RW-009: reconstructs 3-channel image', () => {
      const data = new Float32Array(3).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 9,
        imageData: data,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.float32,
        channels: 3,
      };
      const image = reconstructIPImage(msg);
      expect(image.channels).toBe(3);
    });
  });

  // ==========================================================================
  // applySyncState
  // ==========================================================================

  describe('applySyncState', () => {
    it('RW-010: handles non-syncState message type gracefully', () => {
      // Should not throw
      expect(() => applySyncState({ type: 'dispose' } as any)).not.toThrow();
    });

    it('RW-011: handles syncState with empty state', () => {
      // Should not throw even without a renderer
      expect(() => applySyncState({ type: 'syncState', state: {} })).not.toThrow();
    });

    it('RW-012: handles syncState with partial state', () => {
      expect(() => applySyncState({
        type: 'syncState',
        state: { clarity: 50, sharpen: 25 },
      })).not.toThrow();
    });

    it('RW-021: handles syncState with gamutMapping field', () => {
      expect(() => applySyncState({
        type: 'syncState',
        state: { gamutMapping: { mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' } },
      })).not.toThrow();
    });

    it('RW-022: handles syncState with premultMode field', () => {
      expect(() => applySyncState({
        type: 'syncState',
        state: { premultMode: 1 },
      })).not.toThrow();
    });

    it('RW-023: handles syncState with ditherMode field', () => {
      expect(() => applySyncState({
        type: 'syncState',
        state: { ditherMode: 1 },
      })).not.toThrow();
    });

    it('RW-024: handles syncState with quantizeBits field', () => {
      expect(() => applySyncState({
        type: 'syncState',
        state: { quantizeBits: 8 },
      })).not.toThrow();
    });

    it('RW-025: handles syncState with hdrHeadroom field', () => {
      expect(() => applySyncState({
        type: 'syncState',
        state: { hdrHeadroom: 3.0 },
      })).not.toThrow();
    });

    it('RW-026: handles syncState with all five new fields at once', () => {
      expect(() => applySyncState({
        type: 'syncState',
        state: {
          gamutMapping: { mode: 'compress', sourceGamut: 'rec2020', targetGamut: 'display-p3' },
          premultMode: 2,
          ditherMode: 1,
          quantizeBits: 10,
          hdrHeadroom: 5.0,
        },
      })).not.toThrow();
    });

    it('RW-027: handles syncState with premultMode=0 (off) and ditherMode=0 (off)', () => {
      expect(() => applySyncState({
        type: 'syncState',
        state: { premultMode: 0, ditherMode: 0, quantizeBits: 0 },
      })).not.toThrow();
    });
  });

  // ==========================================================================
  // Worker exports
  // ==========================================================================

  describe('Worker state', () => {
    it('RW-013: getRenderer returns null initially', () => {
      // Worker not initialized with a canvas in test context
      expect(__test__.getRenderer()).toBeNull();
    });

    it('RW-014: getCanvas returns null initially', () => {
      expect(__test__.getCanvas()).toBeNull();
    });

    it('RW-015: isContextLost returns false initially', () => {
      expect(__test__.isContextLost()).toBe(false);
    });
  });

  // ==========================================================================
  // Data type mapping edge cases
  // ==========================================================================

  describe('Data type edge cases', () => {
    it('RW-016: unknown data type code defaults to float32', () => {
      const data = new Float32Array(4).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 16,
        imageData: data,
        width: 1,
        height: 1,
        dataType: 99, // Invalid code
        channels: 4,
      };
      const image = reconstructIPImage(msg);
      // Falls back to float32 due to ?? 'float32' default
      expect(image.dataType).toBe('float32');
    });

    it('RW-017: sRGB transfer function code maps correctly', () => {
      const data = new Float32Array(4).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 17,
        imageData: data,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.float32,
        channels: 4,
        transferFunction: TRANSFER_FUNCTION_CODES.srgb,
      };
      const image = reconstructIPImage(msg);
      expect(image.metadata.transferFunction).toBe('srgb');
    });

    it('RW-018: BT.709 color primaries code maps correctly', () => {
      const data = new Float32Array(4).buffer;
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 18,
        imageData: data,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.float32,
        channels: 4,
        colorPrimaries: COLOR_PRIMARIES_CODES.bt709,
      };
      const image = reconstructIPImage(msg);
      expect(image.metadata.colorPrimaries).toBe('bt709');
    });
  });

  // ==========================================================================
  // Message handling verification
  // ==========================================================================

  describe('Message handling structure', () => {
    it('RW-019: __test__ exports are defined', () => {
      expect(__test__).toBeDefined();
      expect(__test__.getRenderer).toBeDefined();
      expect(__test__.getCanvas).toBeDefined();
      expect(__test__.isContextLost).toBeDefined();
      expect(__test__.reconstructIPImage).toBeDefined();
      expect(__test__.applySyncState).toBeDefined();
    });

    it('RW-020: reconstructIPImage preserves ArrayBuffer reference', () => {
      const originalBuffer = new ArrayBuffer(16);
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 20,
        imageData: originalBuffer,
        width: 1,
        height: 1,
        dataType: DATA_TYPE_CODES.float32,
        channels: 4,
      };
      const image = reconstructIPImage(msg);
      // The IPImage should reference the same ArrayBuffer (zero-copy)
      expect(image.data).toBe(originalBuffer);
    });
  });
});
