/**
 * Render Worker Tests
 *
 * Tests for the worker message handling logic.
 * Uses the exported __test__ helpers to test worker internals
 * without actually running in a Worker context.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { __test__ } from './renderWorker.worker';
import { Renderer } from '../render/Renderer';
import {
  DATA_TYPE_CODES,
  TRANSFER_FUNCTION_CODES,
  COLOR_PRIMARIES_CODES,
  RENDER_WORKER_PROTOCOL_VERSION,
} from '../render/renderWorker.messages';
import type { RenderHDRMessage, RenderWorkerMessage } from '../render/renderWorker.messages';

const {
  reconstructIPImage,
  applySyncState,
  handleMessage,
  isArrayBufferDetached,
  validateHDRImageData,
  validateSDRBitmap,
  safeCloseBitmap,
} = __test__;

describe('renderWorker', () => {
  afterEach(() => {
    __test__.setRenderer(null);
  });

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
      expect(() =>
        applySyncState({
          type: 'syncState',
          state: { clarity: 50, sharpen: 25 },
        }),
      ).not.toThrow();
    });

    it('RW-021: handles syncState with gamutMapping field', () => {
      expect(() =>
        applySyncState({
          type: 'syncState',
          state: { gamutMapping: { mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' } },
        }),
      ).not.toThrow();
    });

    it('RW-022: handles syncState with premultMode field', () => {
      expect(() =>
        applySyncState({
          type: 'syncState',
          state: { premultMode: 1 },
        }),
      ).not.toThrow();
    });

    it('RW-023: handles syncState with ditherMode field', () => {
      expect(() =>
        applySyncState({
          type: 'syncState',
          state: { ditherMode: 1 },
        }),
      ).not.toThrow();
    });

    it('RW-024: handles syncState with quantizeBits field', () => {
      expect(() =>
        applySyncState({
          type: 'syncState',
          state: { quantizeBits: 8 },
        }),
      ).not.toThrow();
    });

    it('RW-025: handles syncState with hdrHeadroom field', () => {
      expect(() =>
        applySyncState({
          type: 'syncState',
          state: { hdrHeadroom: 3.0 },
        }),
      ).not.toThrow();
    });

    it('RW-026: handles syncState with all five new fields at once', () => {
      expect(() =>
        applySyncState({
          type: 'syncState',
          state: {
            gamutMapping: { mode: 'compress', sourceGamut: 'rec2020', targetGamut: 'display-p3' },
            premultMode: 2,
            ditherMode: 1,
            quantizeBits: 10,
            hdrHeadroom: 5.0,
          },
        }),
      ).not.toThrow();
    });

    it('RW-027: handles syncState with premultMode=0 (off) and ditherMode=0 (off)', () => {
      expect(() =>
        applySyncState({
          type: 'syncState',
          state: { premultMode: 0, ditherMode: 0, quantizeBits: 0 },
        }),
      ).not.toThrow();
    });

    it('RW-028: syncState forwards look LUT payload to renderer.setLookLUT', () => {
      const setLookLUT = vi.fn();
      __test__.setRenderer({ setLookLUT } as any);

      applySyncState({
        type: 'syncState',
        state: {
          lookLUT: {
            lutData: new Float32Array(64),
            lutSize: 4,
            intensity: 0.85,
            domainMin: [-0.1, 0, 0.1],
            domainMax: [1.1, 1.2, 1.3],
          },
        },
      });

      expect(setLookLUT).toHaveBeenCalledWith(expect.any(Float32Array), 4, 0.85, [-0.1, 0, 0.1], [1.1, 1.2, 1.3]);
    });

    it('RW-029: syncState forwards file LUT payload to renderer.setFileLUT', () => {
      const setFileLUT = vi.fn();
      __test__.setRenderer({ setFileLUT } as any);

      applySyncState({
        type: 'syncState',
        state: {
          fileLUT: {
            lutData: new Float32Array(64),
            lutSize: 4,
            intensity: 0.5,
            domainMin: [0, 0, 0],
            domainMax: [1.5, 1.5, 1.5],
          },
        },
      });

      expect(setFileLUT).toHaveBeenCalledWith(expect.any(Float32Array), 4, 0.5, [0, 0, 0], [1.5, 1.5, 1.5]);
    });

    it('RW-030: syncState forwards display LUT payload to renderer.setDisplayLUT', () => {
      const setDisplayLUT = vi.fn();
      __test__.setRenderer({ setDisplayLUT } as any);

      applySyncState({
        type: 'syncState',
        state: {
          displayLUT: {
            lutData: null,
            lutSize: 0,
            intensity: 0,
          },
        },
      });

      expect(setDisplayLUT).toHaveBeenCalledWith(null, 0, 0, undefined, undefined);
    });

    it('RW-031: syncState prefers lookLUT over legacy lut when both are present', () => {
      const setLUT = vi.fn();
      const setLookLUT = vi.fn();
      __test__.setRenderer({ setLUT, setLookLUT } as any);

      applySyncState({
        type: 'syncState',
        state: {
          lut: { lutData: new Float32Array(64), lutSize: 4, intensity: 0.2 },
          lookLUT: { lutData: new Float32Array(64), lutSize: 4, intensity: 0.9 },
        },
      });

      expect(setLookLUT).toHaveBeenCalledOnce();
      expect(setLUT).not.toHaveBeenCalled();
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
      expect(__test__.setRenderer).toBeDefined();
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

  // ==========================================================================
  // Protocol version mismatch handling
  // ==========================================================================

  describe('Protocol version checking', () => {
    let postMessageSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      postMessageSpy = vi.spyOn(self, 'postMessage').mockImplementation(() => {});
    });

    afterEach(() => {
      postMessageSpy.mockRestore();
    });

    it('RW-032: matching protocol version allows message processing', () => {
      const setColorInversion = vi.fn();
      __test__.setRenderer({ setColorInversion } as any);

      handleMessage({
        type: 'setColorInversion',
        enabled: true,
        protocolVersion: RENDER_WORKER_PROTOCOL_VERSION,
      });

      expect(setColorInversion).toHaveBeenCalledWith(true);
      // Should not send a protocolMismatch error
      const mismatchCalls = postMessageSpy.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.type === 'protocolMismatch',
      );
      expect(mismatchCalls).toHaveLength(0);
    });

    it('RW-033: mismatched protocol version sends error response and does not process', () => {
      const setColorInversion = vi.fn();
      __test__.setRenderer({ setColorInversion } as any);

      handleMessage({
        type: 'setColorInversion',
        enabled: true,
        protocolVersion: RENDER_WORKER_PROTOCOL_VERSION + 1,
      } as RenderWorkerMessage);

      // Should NOT have processed the message
      expect(setColorInversion).not.toHaveBeenCalled();

      // Should have sent a protocolMismatch error
      expect(postMessageSpy).toHaveBeenCalled();
      const sentMsg = postMessageSpy.mock.calls[0][0] as any;
      expect(sentMsg.type).toBe('protocolMismatch');
    });

    it('RW-034: missing protocol version (backward compat) allows message processing', () => {
      const setColorInversion = vi.fn();
      __test__.setRenderer({ setColorInversion } as any);

      // Simulate an older main thread that does not send protocolVersion
      handleMessage({
        type: 'setColorInversion',
        enabled: false,
      } as RenderWorkerMessage);

      expect(setColorInversion).toHaveBeenCalledWith(false);
      // Should not send a protocolMismatch error
      const mismatchCalls = postMessageSpy.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.type === 'protocolMismatch',
      );
      expect(mismatchCalls).toHaveLength(0);
    });

    it('RW-035: error response includes expected and actual versions', () => {
      const wrongVersion = RENDER_WORKER_PROTOCOL_VERSION + 5;

      handleMessage({
        type: 'dispose',
        protocolVersion: wrongVersion,
      } as RenderWorkerMessage);

      expect(postMessageSpy).toHaveBeenCalled();
      const sentMsg = postMessageSpy.mock.calls[0][0] as any;
      expect(sentMsg.type).toBe('protocolMismatch');
      expect(sentMsg.expectedVersion).toBe(RENDER_WORKER_PROTOCOL_VERSION);
      expect(sentMsg.actualVersion).toBe(wrongVersion);
      expect(sentMsg.error).toContain(`v${wrongVersion}`);
      expect(sentMsg.error).toContain(`v${RENDER_WORKER_PROTOCOL_VERSION}`);
    });

    it('RW-036: protocol mismatch response itself carries the current protocol version', () => {
      handleMessage({
        type: 'dispose',
        protocolVersion: 999,
      } as RenderWorkerMessage);

      const sentMsg = postMessageSpy.mock.calls[0][0] as any;
      expect(sentMsg.protocolVersion).toBe(RENDER_WORKER_PROTOCOL_VERSION);
    });
  });

  // ==========================================================================
  // Transferable validation (MED-44)
  // ==========================================================================

  describe('Transferable validation', () => {
    // --- isArrayBufferDetached ---

    describe('isArrayBufferDetached', () => {
      it('RW-037: returns false for a normal ArrayBuffer', () => {
        const buf = new ArrayBuffer(16);
        expect(isArrayBufferDetached(buf)).toBe(false);
      });

      it('RW-038: returns true for a zero-length ArrayBuffer (treated as detached)', () => {
        const buf = new ArrayBuffer(0);
        expect(isArrayBufferDetached(buf)).toBe(true);
      });

      it('RW-039: returns true for a structurally detached buffer', () => {
        const buf = new ArrayBuffer(16);
        // Simulate transfer by structuredClone with transfer
        // After transfer, the original buffer becomes detached
        try {
          structuredClone(buf, { transfer: [buf] });
        } catch {
          // structuredClone may not be available in all test environments
        }
        // After transfer, buf.byteLength should be 0 and/or .detached should be true
        expect(isArrayBufferDetached(buf)).toBe(true);
      });
    });

    // --- validateHDRImageData ---

    describe('validateHDRImageData', () => {
      it('RW-040: returns null for valid HDR message', () => {
        const msg: RenderHDRMessage = {
          type: 'renderHDR',
          id: 40,
          imageData: new Float32Array(4).buffer,
          width: 1,
          height: 1,
          dataType: DATA_TYPE_CODES.float32,
          channels: 4,
        };
        expect(validateHDRImageData(msg)).toBeNull();
      });

      it('RW-041: returns error for non-ArrayBuffer imageData', () => {
        const msg = {
          type: 'renderHDR',
          id: 41,
          imageData: 'not a buffer' as any,
          width: 1,
          height: 1,
          dataType: DATA_TYPE_CODES.float32,
          channels: 4,
        } as RenderHDRMessage;
        const err = validateHDRImageData(msg);
        expect(err).not.toBeNull();
        expect(err).toContain('not an ArrayBuffer');
      });

      it('RW-042: returns error for detached ArrayBuffer', () => {
        const buf = new ArrayBuffer(16);
        try {
          structuredClone(buf, { transfer: [buf] });
        } catch {
          // fallback: can't transfer in this environment
        }
        // If transfer worked, buf is detached. If not, use a zero-length buffer.
        const testBuf = buf.byteLength === 0 ? buf : new ArrayBuffer(0);
        const msg: RenderHDRMessage = {
          type: 'renderHDR',
          id: 42,
          imageData: testBuf,
          width: 1,
          height: 1,
          dataType: DATA_TYPE_CODES.float32,
          channels: 4,
        };
        const err = validateHDRImageData(msg);
        expect(err).not.toBeNull();
        expect(err).toContain('detached');
      });

      it('RW-043: returns error for zero or negative width', () => {
        const msg: RenderHDRMessage = {
          type: 'renderHDR',
          id: 43,
          imageData: new Float32Array(4).buffer,
          width: 0,
          height: 1,
          dataType: DATA_TYPE_CODES.float32,
          channels: 4,
        };
        const err = validateHDRImageData(msg);
        expect(err).not.toBeNull();
        expect(err).toContain('invalid dimensions');
      });

      it('RW-044: returns error for negative height', () => {
        const msg: RenderHDRMessage = {
          type: 'renderHDR',
          id: 44,
          imageData: new Float32Array(4).buffer,
          width: 1,
          height: -5,
          dataType: DATA_TYPE_CODES.float32,
          channels: 4,
        };
        const err = validateHDRImageData(msg);
        expect(err).not.toBeNull();
        expect(err).toContain('invalid dimensions');
      });

      it('RW-045: returns error for unsupported channel count', () => {
        const msg: RenderHDRMessage = {
          type: 'renderHDR',
          id: 45,
          imageData: new Float32Array(4).buffer,
          width: 1,
          height: 1,
          dataType: DATA_TYPE_CODES.float32,
          channels: 2,
        };
        const err = validateHDRImageData(msg);
        expect(err).not.toBeNull();
        expect(err).toContain('unsupported channel count');
      });

      it('RW-046: accepts 3-channel images', () => {
        const msg: RenderHDRMessage = {
          type: 'renderHDR',
          id: 46,
          imageData: new Float32Array(3).buffer,
          width: 1,
          height: 1,
          dataType: DATA_TYPE_CODES.float32,
          channels: 3,
        };
        expect(validateHDRImageData(msg)).toBeNull();
      });

      it('RW-047: returns error for NaN dimensions', () => {
        const msg: RenderHDRMessage = {
          type: 'renderHDR',
          id: 47,
          imageData: new Float32Array(4).buffer,
          width: NaN,
          height: 100,
          dataType: DATA_TYPE_CODES.float32,
          channels: 4,
        };
        const err = validateHDRImageData(msg);
        expect(err).not.toBeNull();
        expect(err).toContain('invalid dimensions');
      });
    });

    // --- validateSDRBitmap ---

    describe('validateSDRBitmap', () => {
      it('RW-048: returns error for closed/zero-size bitmap', () => {
        const fakeBitmap = { width: 0, height: 0, close: vi.fn() };
        // Make it look like an ImageBitmap to pass type check in test env
        const err = validateSDRBitmap({
          bitmap: fakeBitmap as unknown as ImageBitmap,
          width: 100,
          height: 100,
        });
        expect(err).not.toBeNull();
        expect(err).toContain('closed');
      });

      it('RW-049: returns error for invalid dimensions', () => {
        const fakeBitmap = { width: 100, height: 100, close: vi.fn() };
        const err = validateSDRBitmap({
          bitmap: fakeBitmap as unknown as ImageBitmap,
          width: 0,
          height: 100,
        });
        expect(err).not.toBeNull();
        expect(err).toContain('invalid dimensions');
      });

      it('RW-050: returns null for valid bitmap-like object', () => {
        const fakeBitmap = { width: 100, height: 100, close: vi.fn() };
        const err = validateSDRBitmap({
          bitmap: fakeBitmap as unknown as ImageBitmap,
          width: 100,
          height: 100,
        });
        expect(err).toBeNull();
      });
    });

    // --- Integration: handleMessage with invalid transferables ---

    describe('handleMessage with invalid transferables', () => {
      let postMessageSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        postMessageSpy = vi.spyOn(self, 'postMessage').mockImplementation(() => {});
        // Set up a mock renderer so the "renderer not available" check passes
        __test__.setRenderer({
          renderImage: vi.fn(),
          renderSDRFrame: vi.fn(),
        } as any);
      });

      afterEach(() => {
        postMessageSpy.mockRestore();
        __test__.setRenderer(null);
      });

      it('RW-051: renderHDR with detached buffer sends renderError', () => {
        const detachedBuf = new ArrayBuffer(0); // zero-length = treated as detached
        handleMessage({
          type: 'renderHDR',
          id: 51,
          imageData: detachedBuf,
          width: 1,
          height: 1,
          dataType: DATA_TYPE_CODES.float32,
          channels: 4,
        });

        expect(postMessageSpy).toHaveBeenCalled();
        const sentMsg = postMessageSpy.mock.calls[0][0] as any;
        expect(sentMsg.type).toBe('renderError');
        expect(sentMsg.id).toBe(51);
        expect(sentMsg.error).toContain('detached');
      });

      it('RW-052: renderHDR with non-ArrayBuffer sends renderError', () => {
        handleMessage({
          type: 'renderHDR',
          id: 52,
          imageData: 'this is not a buffer' as any,
          width: 1,
          height: 1,
          dataType: DATA_TYPE_CODES.float32,
          channels: 4,
        } as any);

        expect(postMessageSpy).toHaveBeenCalled();
        const sentMsg = postMessageSpy.mock.calls[0][0] as any;
        expect(sentMsg.type).toBe('renderError');
        expect(sentMsg.id).toBe(52);
        expect(sentMsg.error).toContain('not an ArrayBuffer');
      });

      it('RW-053: renderHDR with invalid dimensions sends renderError', () => {
        handleMessage({
          type: 'renderHDR',
          id: 53,
          imageData: new Float32Array(4).buffer,
          width: -1,
          height: 100,
          dataType: DATA_TYPE_CODES.float32,
          channels: 4,
        });

        expect(postMessageSpy).toHaveBeenCalled();
        const sentMsg = postMessageSpy.mock.calls[0][0] as any;
        expect(sentMsg.type).toBe('renderError');
        expect(sentMsg.id).toBe(53);
        expect(sentMsg.error).toContain('invalid dimensions');
      });

      it('RW-054: renderSDR with closed bitmap sends renderError', () => {
        const closedBitmap = { width: 0, height: 0, close: vi.fn() };
        handleMessage({
          type: 'renderSDR',
          id: 54,
          bitmap: closedBitmap as unknown as ImageBitmap,
          width: 100,
          height: 100,
        });

        expect(postMessageSpy).toHaveBeenCalled();
        const sentMsg = postMessageSpy.mock.calls[0][0] as any;
        expect(sentMsg.type).toBe('renderError');
        expect(sentMsg.id).toBe(54);
        expect(sentMsg.error).toContain('closed');
      });

      it('RW-055: renderHDR with valid data does not produce renderError', () => {
        handleMessage({
          type: 'renderHDR',
          id: 55,
          imageData: new Float32Array(4).buffer,
          width: 1,
          height: 1,
          dataType: DATA_TYPE_CODES.float32,
          channels: 4,
        });

        expect(postMessageSpy).toHaveBeenCalled();
        const sentMsg = postMessageSpy.mock.calls[0][0] as any;
        // Should be renderDone, not renderError
        expect(sentMsg.type).toBe('renderDone');
        expect(sentMsg.id).toBe(55);
      });

      it('RW-056: renderSDR with valid bitmap does not produce renderError', () => {
        const validBitmap = { width: 100, height: 100, close: vi.fn() };
        handleMessage({
          type: 'renderSDR',
          id: 56,
          bitmap: validBitmap as unknown as ImageBitmap,
          width: 100,
          height: 100,
        });

        expect(postMessageSpy).toHaveBeenCalled();
        const sentMsg = postMessageSpy.mock.calls[0][0] as any;
        expect(sentMsg.type).toBe('renderDone');
        expect(sentMsg.id).toBe(56);
      });

      it('RW-057: renderHDR with unsupported channel count sends renderError', () => {
        handleMessage({
          type: 'renderHDR',
          id: 57,
          imageData: new Float32Array(4).buffer,
          width: 1,
          height: 1,
          dataType: DATA_TYPE_CODES.float32,
          channels: 1,
        });

        expect(postMessageSpy).toHaveBeenCalled();
        const sentMsg = postMessageSpy.mock.calls[0][0] as any;
        expect(sentMsg.type).toBe('renderError');
        expect(sentMsg.id).toBe(57);
        expect(sentMsg.error).toContain('unsupported channel count');
      });
    });
  });

  // ==========================================================================
  // safeCloseBitmap (LOW-22)
  // ==========================================================================

  describe('safeCloseBitmap', () => {
    function makeMockBitmap(opts?: { width?: number; height?: number; closeThrows?: boolean }): ImageBitmap {
      const w = opts?.width ?? 100;
      const h = opts?.height ?? 100;
      let closed = false;
      return {
        get width() {
          return closed ? 0 : w;
        },
        get height() {
          return closed ? 0 : h;
        },
        close() {
          if (opts?.closeThrows) {
            throw new DOMException('ImageBitmap is detached', 'InvalidStateError');
          }
          closed = true;
        },
      } as unknown as ImageBitmap;
    }

    it('RW-SCB-001: closes a normal bitmap without error', () => {
      const bitmap = makeMockBitmap();
      expect(() => safeCloseBitmap(bitmap)).not.toThrow();
      // After close, width/height should be 0
      expect(bitmap.width).toBe(0);
      expect(bitmap.height).toBe(0);
    });

    it('RW-SCB-002: does not throw on already-closed bitmap (width/height 0)', () => {
      const bitmap = makeMockBitmap();
      // Close it first
      bitmap.close();
      expect(bitmap.width).toBe(0);
      expect(bitmap.height).toBe(0);
      // Second close via safeCloseBitmap should not throw
      expect(() => safeCloseBitmap(bitmap)).not.toThrow();
    });

    it('RW-SCB-003: does not throw when close() itself throws (transferred bitmap)', () => {
      const bitmap = makeMockBitmap({ closeThrows: true });
      // close() will throw, but safeCloseBitmap catches it
      expect(() => safeCloseBitmap(bitmap)).not.toThrow();
    });

    it('RW-SCB-004: multiple sequential close calls do not throw', () => {
      const bitmap = makeMockBitmap();
      expect(() => {
        safeCloseBitmap(bitmap);
        safeCloseBitmap(bitmap);
        safeCloseBitmap(bitmap);
      }).not.toThrow();
    });

    it('RW-SCB-005: skips close on zero-dimension bitmap and logs debug', () => {
      // Bitmap that already has 0x0 dimensions (simulates transferred/closed state)
      const bitmap = makeMockBitmap({ width: 0, height: 0 });
      const closeSpy = vi.spyOn(bitmap, 'close');
      expect(() => safeCloseBitmap(bitmap)).not.toThrow();
      // Should not call close() since dimensions are 0
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('RW-SCB-006: partial zero dimension (width=0, height=100) still calls close()', () => {
      // Only one dimension is zero — does NOT match the `width === 0 && height === 0` guard,
      // so close() should still be called.
      const bitmap = makeMockBitmap({ width: 0, height: 100 });
      const closeSpy = vi.spyOn(bitmap, 'close');
      expect(() => safeCloseBitmap(bitmap)).not.toThrow();
      expect(closeSpy).toHaveBeenCalledOnce();
    });

    it('RW-SCB-007: error path integration — renderSDR exception triggers safeCloseBitmap and renderError', () => {
      const postMessageSpy = vi.spyOn(self, 'postMessage').mockImplementation(() => {});
      const renderError = new Error('GL context lost');
      __test__.setRenderer({
        renderSDRFrame: vi.fn().mockImplementation(() => {
          throw renderError;
        }),
      } as any);

      const bitmap = makeMockBitmap();
      const closeSpy = vi.spyOn(bitmap, 'close');

      handleMessage({
        type: 'renderSDR',
        id: 700,
        bitmap: bitmap as unknown as ImageBitmap,
        width: 100,
        height: 100,
      });

      // Bitmap should have been closed in the catch path (not leaked)
      expect(closeSpy).toHaveBeenCalled();
      expect(bitmap.width).toBe(0);

      // A renderError message should have been sent back
      expect(postMessageSpy).toHaveBeenCalled();
      const sentMsg = postMessageSpy.mock.calls[0]![0] as any;
      expect(sentMsg.type).toBe('renderError');
      expect(sentMsg.id).toBe(700);
      expect(sentMsg.error).toBe('GL context lost');

      postMessageSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Async init flow (MED-55 P-pre-2)
  // ==========================================================================

  describe('async init via createRenderer', () => {
    let postMessageSpy: ReturnType<typeof vi.spyOn>;
    let initializeSpy: ReturnType<typeof vi.spyOn>;
    let initAsyncSpy: ReturnType<typeof vi.spyOn>;
    let getHDROutputModeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      postMessageSpy = vi.spyOn(self, 'postMessage').mockImplementation(() => {});
      // Stub Renderer methods so the test does not require a real WebGL2 context.
      initializeSpy = vi.spyOn(Renderer.prototype, 'initialize').mockImplementation(() => {});
      getHDROutputModeSpy = vi.spyOn(Renderer.prototype, 'getHDROutputMode').mockReturnValue('sdr');
    });

    afterEach(() => {
      postMessageSpy.mockRestore();
      initializeSpy.mockRestore();
      initAsyncSpy?.mockRestore();
      getHDROutputModeSpy.mockRestore();
      __test__.setRenderer(null);
    });

    it('RW-INIT-ASYNC-001: init handler awaits initAsync before posting initResult', async () => {
      // Build a Promise we control to gate initAsync resolution.
      let resolveInit: () => void = () => {};
      const initAsyncGate = new Promise<void>((r) => {
        resolveInit = r;
      });
      initAsyncSpy = vi.spyOn(Renderer.prototype, 'initAsync').mockImplementation(() => initAsyncGate);

      // A minimal OffscreenCanvas-like stub: only addEventListener is invoked
      // before initResult is posted, and only after a successful await.
      const fakeCanvas = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as OffscreenCanvas;

      // Trigger the init message — this kicks off the async IIFE inside the
      // worker but does NOT block this test thread.
      handleMessage({
        type: 'init',
        canvas: fakeCanvas,
        capabilities: undefined,
      } as RenderWorkerMessage);

      // Allow microtasks to drain. initAsync has not resolved yet, so
      // initResult MUST NOT have been posted.
      await Promise.resolve();
      await Promise.resolve();
      const initResultsBefore = postMessageSpy.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.type === 'initResult',
      );
      expect(initResultsBefore).toHaveLength(0);
      // Async listeners on the canvas should also not yet be wired (those are
      // attached after the await in the handler).
      expect(
        (fakeCanvas as unknown as { addEventListener: ReturnType<typeof vi.fn> }).addEventListener,
      ).not.toHaveBeenCalled();

      // Resolve initAsync; now the handler should proceed and post initResult.
      resolveInit();
      // Wait for the IIFE to settle.
      await initAsyncGate;
      await Promise.resolve();
      await Promise.resolve();

      const initResultsAfter = postMessageSpy.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.type === 'initResult',
      );
      expect(initResultsAfter).toHaveLength(1);
      const sentMsg = initResultsAfter[0]![0] as { success: boolean; hdrMode?: string };
      expect(sentMsg.success).toBe(true);
      expect(sentMsg.hdrMode).toBe('sdr');
      // Context-loss listeners should now be wired.
      expect(
        (fakeCanvas as unknown as { addEventListener: ReturnType<typeof vi.fn> }).addEventListener,
      ).toHaveBeenCalled();
      // The renderer should now be assigned.
      expect(__test__.getRenderer()).not.toBeNull();
    });

    it('RW-INIT-ASYNC-002: initAsync rejection produces success:false initResult', async () => {
      const initError = new Error('shader compilation timed out');
      initAsyncSpy = vi.spyOn(Renderer.prototype, 'initAsync').mockRejectedValue(initError);

      const fakeCanvas = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as OffscreenCanvas;

      handleMessage({
        type: 'init',
        canvas: fakeCanvas,
        capabilities: undefined,
      } as RenderWorkerMessage);

      // Drain microtasks so the rejection propagates through the IIFE.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const initResults = postMessageSpy.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.type === 'initResult',
      );
      expect(initResults).toHaveLength(1);
      const sentMsg = initResults[0]![0] as { success: boolean; error?: string };
      expect(sentMsg.success).toBe(false);
      expect(sentMsg.error).toBe('shader compilation timed out');
      // Renderer should NOT have been assigned on the failure path.
      expect(__test__.getRenderer()).toBeNull();
    });
  });
});
