/**
 * Render Worker Message Protocol Tests
 *
 * Tests for message type definitions and data conversion helpers.
 */

import { describe, it, expect } from 'vitest';

// Mock OffscreenCanvas for jsdom
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  (globalThis as any).OffscreenCanvas = class MockOffscreenCanvas {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext() { return null; }
    addEventListener() {}
    removeEventListener() {}
  };
}

import {
  DATA_TYPE_CODES,
  DATA_TYPE_FROM_CODE,
  TRANSFER_FUNCTION_CODES,
  TRANSFER_FUNCTION_FROM_CODE,
  COLOR_PRIMARIES_CODES,
  COLOR_PRIMARIES_FROM_CODE,
} from './renderWorker.messages';
import type {
  RenderWorkerMessage,
  RenderWorkerResult,
  InitMessage,
  RenderSDRMessage,
  RenderHDRMessage,
  ReadPixelMessage,
  DisposeMessage,
  SetColorAdjustmentsMessage,
  SyncStateMessage,
  RendererSyncState,
  ReadyResult,
  InitResult,
  RenderDoneResult,
  RenderErrorResult,
  PixelDataResult,
  ContextLostResult,
  ContextRestoredResult,
} from './renderWorker.messages';

describe('renderWorker.messages', () => {
  // ==========================================================================
  // Data type conversion helpers
  // ==========================================================================

  describe('DATA_TYPE_CODES', () => {
    it('RWM-001: maps uint8 to 0', () => {
      expect(DATA_TYPE_CODES.uint8).toBe(0);
    });

    it('RWM-002: maps uint16 to 1', () => {
      expect(DATA_TYPE_CODES.uint16).toBe(1);
    });

    it('RWM-003: maps float32 to 2', () => {
      expect(DATA_TYPE_CODES.float32).toBe(2);
    });
  });

  describe('DATA_TYPE_FROM_CODE', () => {
    it('RWM-004: maps 0 to uint8', () => {
      expect(DATA_TYPE_FROM_CODE[0]).toBe('uint8');
    });

    it('RWM-005: maps 1 to uint16', () => {
      expect(DATA_TYPE_FROM_CODE[1]).toBe('uint16');
    });

    it('RWM-006: maps 2 to float32', () => {
      expect(DATA_TYPE_FROM_CODE[2]).toBe('float32');
    });

    it('RWM-007: roundtrip conversion for all data types', () => {
      for (const [name, code] of Object.entries(DATA_TYPE_CODES)) {
        expect(DATA_TYPE_FROM_CODE[code]).toBe(name);
      }
    });
  });

  describe('TRANSFER_FUNCTION_CODES', () => {
    it('RWM-008: maps srgb to 0', () => {
      expect(TRANSFER_FUNCTION_CODES.srgb).toBe(0);
    });

    it('RWM-009: maps hlg to 1', () => {
      expect(TRANSFER_FUNCTION_CODES.hlg).toBe(1);
    });

    it('RWM-010: maps pq to 2', () => {
      expect(TRANSFER_FUNCTION_CODES.pq).toBe(2);
    });

    it('RWM-011: roundtrip conversion for all transfer functions', () => {
      for (const [name, code] of Object.entries(TRANSFER_FUNCTION_CODES)) {
        expect(TRANSFER_FUNCTION_FROM_CODE[code]).toBe(name);
      }
    });
  });

  describe('COLOR_PRIMARIES_CODES', () => {
    it('RWM-012: maps bt709 to 0', () => {
      expect(COLOR_PRIMARIES_CODES.bt709).toBe(0);
    });

    it('RWM-013: maps bt2020 to 1', () => {
      expect(COLOR_PRIMARIES_CODES.bt2020).toBe(1);
    });

    it('RWM-014: roundtrip conversion for all color primaries', () => {
      for (const [name, code] of Object.entries(COLOR_PRIMARIES_CODES)) {
        expect(COLOR_PRIMARIES_FROM_CODE[code]).toBe(name);
      }
    });
  });

  // ==========================================================================
  // Message type structure validation
  // ==========================================================================

  describe('Main thread -> Worker message types', () => {
    it('RWM-015: init message has correct structure', () => {
      const canvas = new OffscreenCanvas(100, 100);
      const msg: InitMessage = {
        type: 'init',
        canvas,
      };
      expect(msg.type).toBe('init');
      expect(msg.canvas).toBe(canvas);
      expect(msg.capabilities).toBeUndefined();
    });

    it('RWM-016: renderSDR message has correct structure', () => {
      // Create a minimal bitmap-like object for testing
      const msg: RenderSDRMessage = {
        type: 'renderSDR',
        id: 1,
        bitmap: {} as ImageBitmap,
        width: 1920,
        height: 1080,
      };
      expect(msg.type).toBe('renderSDR');
      expect(msg.id).toBe(1);
      expect(msg.width).toBe(1920);
      expect(msg.height).toBe(1080);
    });

    it('RWM-017: renderHDR message has correct structure', () => {
      const msg: RenderHDRMessage = {
        type: 'renderHDR',
        id: 2,
        imageData: new ArrayBuffer(100),
        width: 1920,
        height: 1080,
        dataType: DATA_TYPE_CODES.float32,
        channels: 4,
        transferFunction: TRANSFER_FUNCTION_CODES.hlg,
        colorPrimaries: COLOR_PRIMARIES_CODES.bt2020,
      };
      expect(msg.type).toBe('renderHDR');
      expect(msg.dataType).toBe(2);
      expect(msg.transferFunction).toBe(1);
      expect(msg.colorPrimaries).toBe(1);
    });

    it('RWM-018: readPixel message has correct structure', () => {
      const msg: ReadPixelMessage = {
        type: 'readPixel',
        id: 3,
        x: 100,
        y: 200,
        width: 1,
        height: 1,
      };
      expect(msg.type).toBe('readPixel');
      expect(msg.id).toBe(3);
    });

    it('RWM-019: dispose message has correct structure', () => {
      const msg: DisposeMessage = { type: 'dispose' };
      expect(msg.type).toBe('dispose');
    });

    it('RWM-020: syncState message has correct structure', () => {
      const msg: SyncStateMessage = {
        type: 'syncState',
        state: {
          clarity: 50,
          sharpen: 25,
        },
      };
      expect(msg.type).toBe('syncState');
      expect(msg.state.clarity).toBe(50);
      expect(msg.state.sharpen).toBe(25);
      // Other fields should be undefined (partial)
      expect(msg.state.colorAdjustments).toBeUndefined();
    });

    it('RWM-021: all message types are distinguishable by type field', () => {
      const types = new Set<string>();
      const messages: RenderWorkerMessage[] = [
        { type: 'init', canvas: new OffscreenCanvas(1, 1) },
        { type: 'resize', width: 100, height: 100 },
        { type: 'clear', r: 0, g: 0, b: 0, a: 1 },
        { type: 'renderSDR', id: 1, bitmap: {} as ImageBitmap, width: 100, height: 100 },
        { type: 'renderHDR', id: 1, imageData: new ArrayBuffer(0), width: 100, height: 100, dataType: 0, channels: 4 },
        { type: 'setColorAdjustments', adjustments: {} as SetColorAdjustmentsMessage['adjustments'] },
        { type: 'setToneMappingState', state: {} as any },
        { type: 'setCDL', cdl: {} as any },
        { type: 'setCurvesLUT', luts: null },
        { type: 'setColorWheels', state: {} as any },
        { type: 'setHighlightsShadows', highlights: 0, shadows: 0, whites: 0, blacks: 0 },
        { type: 'setVibrance', vibrance: 0, skinProtection: false },
        { type: 'setClarity', clarity: 0 },
        { type: 'setSharpen', amount: 0 },
        { type: 'setHSLQualifier', state: {} as any },
        { type: 'setColorInversion', enabled: false },
        { type: 'setChannelMode', mode: 'rgb' },
        { type: 'setFalseColor', enabled: false, lut: null },
        { type: 'setZebraStripes', state: {} as any },
        { type: 'setLUT', lutData: null, lutSize: 0, intensity: 0 },
        { type: 'setDisplayColorState', state: { transferFunction: 0, displayGamma: 1, displayBrightness: 1, customGamma: 2.2 } },
        { type: 'setBackgroundPattern', state: {} as any },
        { type: 'setHDROutputMode', mode: 'sdr', capabilities: {} as any },
        { type: 'readPixel', id: 1, x: 0, y: 0, width: 1, height: 1 },
        { type: 'syncState', state: {} },
        { type: 'dispose' },
      ];

      for (const msg of messages) {
        types.add(msg.type);
      }

      // All types are unique
      expect(types.size).toBe(messages.length);
    });
  });

  describe('Worker -> Main thread message types', () => {
    it('RWM-022: ready result has correct structure', () => {
      const msg: ReadyResult = { type: 'ready' };
      expect(msg.type).toBe('ready');
    });

    it('RWM-023: initResult success has correct structure', () => {
      const msg: InitResult = { type: 'initResult', success: true, hdrMode: 'hlg' };
      expect(msg.success).toBe(true);
      expect(msg.hdrMode).toBe('hlg');
    });

    it('RWM-024: initResult failure has correct structure', () => {
      const msg: InitResult = { type: 'initResult', success: false, error: 'WebGL2 not supported' };
      expect(msg.success).toBe(false);
      expect(msg.error).toBe('WebGL2 not supported');
    });

    it('RWM-025: renderDone has correct structure', () => {
      const msg: RenderDoneResult = { type: 'renderDone', id: 42 };
      expect(msg.id).toBe(42);
    });

    it('RWM-026: renderError has correct structure', () => {
      const msg: RenderErrorResult = { type: 'renderError', id: 42, error: 'Context lost' };
      expect(msg.id).toBe(42);
      expect(msg.error).toBe('Context lost');
    });

    it('RWM-027: pixelData result with data has correct structure', () => {
      const data = new Float32Array([1.0, 0.5, 0.0, 1.0]);
      const msg: PixelDataResult = { type: 'pixelData', id: 5, data };
      expect(msg.id).toBe(5);
      expect(msg.data).toBe(data);
    });

    it('RWM-028: pixelData result with null has correct structure', () => {
      const msg: PixelDataResult = { type: 'pixelData', id: 5, data: null };
      expect(msg.data).toBeNull();
    });

    it('RWM-029: contextLost and contextRestored have correct structure', () => {
      const lost: ContextLostResult = { type: 'contextLost' };
      const restored: ContextRestoredResult = { type: 'contextRestored' };
      expect(lost.type).toBe('contextLost');
      expect(restored.type).toBe('contextRestored');
    });

    it('RWM-030: all result types are distinguishable by type field', () => {
      const types = new Set<string>();
      const results: RenderWorkerResult[] = [
        { type: 'ready' },
        { type: 'initResult', success: true },
        { type: 'renderDone', id: 1 },
        { type: 'renderError', id: 1, error: '' },
        { type: 'pixelData', id: 1, data: null },
        { type: 'contextLost' },
        { type: 'contextRestored' },
      ];

      for (const msg of results) {
        types.add(msg.type);
      }

      expect(types.size).toBe(results.length);
    });
  });

  // ==========================================================================
  // RendererSyncState
  // ==========================================================================

  describe('RendererSyncState', () => {
    it('RWM-031: partial sync state only includes dirty fields', () => {
      const state: Partial<RendererSyncState> = {
        clarity: 50,
        sharpen: 25,
      };
      expect(Object.keys(state)).toEqual(['clarity', 'sharpen']);
    });

    it('RWM-032: full sync state includes all fields', () => {
      const state: RendererSyncState = {
        colorAdjustments: {} as any,
        toneMappingState: {} as any,
        colorInversion: false,
        cdl: {} as any,
        curvesLUT: null,
        colorWheels: {} as any,
        highlightsShadows: { highlights: 0, shadows: 0, whites: 0, blacks: 0 },
        vibrance: { vibrance: 0, skinProtection: false },
        clarity: 0,
        sharpen: 0,
        hslQualifier: {} as any,
        channelMode: 'rgb',
        falseColor: { enabled: false, lut: null },
        zebraStripes: {} as any,
        lut: { lutData: null, lutSize: 0, intensity: 0 },
        displayColorState: { transferFunction: 0, displayGamma: 1, displayBrightness: 1, customGamma: 2.2 },
        backgroundPattern: {} as any,
        hdrOutputMode: { mode: 'sdr', capabilities: {} as any },
      };
      expect(Object.keys(state).length).toBeGreaterThan(10);
    });
  });
});
