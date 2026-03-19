import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebGPUStateUploader, STAGE_FIELDS, DIRTY_FLAG_TO_STAGES } from './WebGPUStateUploader';
import { GPUBufferUsage, GPUTextureUsage } from './WebGPUTypes';
import { createDefaultInternalState } from '../ShaderStateTypes';
import type { InternalShaderState } from '../ShaderStateTypes';
import type { StageId } from '../ShaderStage';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockBuffer() {
  return {
    getMappedRange: vi.fn().mockReturnValue(new ArrayBuffer(16)),
    unmap: vi.fn(),
    destroy: vi.fn(),
    mapAsync: vi.fn(),
  };
}

function createMockTexture() {
  return {
    createView: vi.fn().mockReturnValue({}),
    destroy: vi.fn(),
  };
}

function createMockDevice() {
  return {
    createShaderModule: vi.fn().mockReturnValue({}),
    createRenderPipeline: vi.fn().mockReturnValue({ getBindGroupLayout: vi.fn() }),
    createSampler: vi.fn().mockReturnValue({}),
    createTexture: vi.fn().mockImplementation(() => createMockTexture()),
    createBindGroup: vi.fn().mockReturnValue({}),
    createBuffer: vi.fn().mockImplementation(() => createMockBuffer()),
    createCommandEncoder: vi.fn().mockReturnValue({
      beginRenderPass: vi
        .fn()
        .mockReturnValue({ setPipeline: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn(), end: vi.fn() }),
      finish: vi.fn().mockReturnValue({}),
    }),
    queue: {
      writeTexture: vi.fn(),
      writeBuffer: vi.fn(),
      submit: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
    },
    destroy: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Helper: create a DataView from the uploaded buffer data
// ---------------------------------------------------------------------------

/**
 * Extract the raw buffer data from a writeBuffer mock call and return a DataView
 * for reading both float and integer fields with correct types.
 */
function getUploadedView(device: ReturnType<typeof createMockDevice>, callIndex = 0): DataView {
  const rawData = device.queue.writeBuffer.mock.calls[callIndex]![2] as Uint8Array;
  return new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
}

/** Read a float at the given 4-byte slot index from a DataView. */
function readFloat(view: DataView, slotIndex: number): number {
  return view.getFloat32(slotIndex * 4, true);
}

/** Read a signed int32 at the given 4-byte slot index from a DataView. */
function readI32(view: DataView, slotIndex: number): number {
  return view.getInt32(slotIndex * 4, true);
}

/** Read an unsigned int32 at the given 4-byte slot index from a DataView. */
function readU32(view: DataView, slotIndex: number): number {
  return view.getUint32(slotIndex * 4, true);
}

// ---------------------------------------------------------------------------
// All 11 stage IDs
// ---------------------------------------------------------------------------

const ALL_STAGES: StageId[] = [
  'inputDecode',
  'linearize',
  'primaryGrade',
  'secondaryGrade',
  'spatialEffects',
  'colorPipeline',
  'sceneAnalysis',
  'spatialEffectsPost',
  'displayOutput',
  'diagnostics',
  'compositing',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPUStateUploader', () => {
  let uploader: WebGPUStateUploader;
  let device: ReturnType<typeof createMockDevice>;
  let state: InternalShaderState;

  beforeEach(() => {
    uploader = new WebGPUStateUploader();
    device = createMockDevice();
    state = createDefaultInternalState();
  });

  // ─── Construction ────────────────────────────────────────────────────

  describe('construction', () => {
    it('WGPU-SU-001: can be instantiated', () => {
      expect(uploader).toBeInstanceOf(WebGPUStateUploader);
    });

    it('WGPU-SU-002: getLUTTexture returns null when no textures uploaded', () => {
      expect(uploader.getLUTTexture('nonexistent')).toBeNull();
    });
  });

  // ─── STAGE_FIELDS export ─────────────────────────────────────────────

  describe('STAGE_FIELDS', () => {
    it('WGPU-SU-010: defines fields for all 11 stages', () => {
      for (const stageId of ALL_STAGES) {
        expect(STAGE_FIELDS[stageId]).toBeDefined();
        expect(Array.isArray(STAGE_FIELDS[stageId])).toBe(true);
        expect(STAGE_FIELDS[stageId].length).toBeGreaterThan(0);
      }
    });

    it('WGPU-SU-011: inputDecode includes deinterlace and perspective fields', () => {
      expect(STAGE_FIELDS.inputDecode).toContain('deinterlaceEnabled');
      expect(STAGE_FIELDS.inputDecode).toContain('perspectiveEnabled');
      expect(STAGE_FIELDS.inputDecode).toContain('channelSwizzle');
    });

    it('WGPU-SU-012: colorPipeline has the most fields', () => {
      const maxLen = Math.max(...ALL_STAGES.map((s) => STAGE_FIELDS[s].length));
      expect(STAGE_FIELDS.colorPipeline.length).toBe(maxLen);
    });
  });

  // ─── DIRTY_FLAG_TO_STAGES export ─────────────────────────────────────

  describe('DIRTY_FLAG_TO_STAGES', () => {
    it('WGPU-SU-020: maps color flag to primaryGrade and secondaryGrade', () => {
      expect(DIRTY_FLAG_TO_STAGES['color']).toEqual(['primaryGrade', 'secondaryGrade']);
    });

    it('WGPU-SU-021: maps premult flag to inputDecode and compositing', () => {
      expect(DIRTY_FLAG_TO_STAGES['premult']).toEqual(['inputDecode', 'compositing']);
    });

    it('WGPU-SU-022: maps colorPrimaries to linearize and displayOutput', () => {
      expect(DIRTY_FLAG_TO_STAGES['colorPrimaries']).toEqual(['linearize', 'displayOutput']);
    });

    it('WGPU-SU-023: all mapped stages are valid StageId values', () => {
      const validStages = new Set(ALL_STAGES);
      for (const stages of Object.values(DIRTY_FLAG_TO_STAGES)) {
        for (const s of stages) {
          expect(validStages.has(s)).toBe(true);
        }
      }
    });
  });

  // ─── uploadStageUniforms ─────────────────────────────────────────────

  describe('uploadStageUniforms', () => {
    it('WGPU-SU-100: creates a GPU buffer on first call', () => {
      uploader.uploadStageUniforms(device, 'primaryGrade', state);

      expect(device.createBuffer).toHaveBeenCalledTimes(1);
      expect(device.createBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          size: 512,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      );
    });

    it('WGPU-SU-101: writes data to the GPU queue', () => {
      uploader.uploadStageUniforms(device, 'primaryGrade', state);

      expect(device.queue.writeBuffer).toHaveBeenCalledTimes(1);
      const [buffer, offset, data] = device.queue.writeBuffer.mock.calls[0]!;
      expect(buffer).toBeDefined();
      expect(offset).toBe(0);
      expect(data).toBeInstanceOf(Uint8Array);
    });

    it('WGPU-SU-102: returns the created GPU buffer', () => {
      const result = uploader.uploadStageUniforms(device, 'primaryGrade', state);
      expect(result).toBeDefined();
      expect(result.destroy).toBeDefined();
    });

    it('WGPU-SU-103: uploads data for each of the 11 stages without error', () => {
      for (const stageId of ALL_STAGES) {
        expect(() => {
          uploader.uploadStageUniforms(device, stageId, state);
        }).not.toThrow();
      }

      // 11 stages = 11 buffer creates
      expect(device.createBuffer).toHaveBeenCalledTimes(11);
      expect(device.queue.writeBuffer).toHaveBeenCalledTimes(11);
    });
  });

  // ─── Buffer reuse ────────────────────────────────────────────────────

  describe('buffer reuse', () => {
    it('WGPU-SU-110: reuses the GPU buffer on second call for the same stage', () => {
      const buf1 = uploader.uploadStageUniforms(device, 'primaryGrade', state);
      const buf2 = uploader.uploadStageUniforms(device, 'primaryGrade', state);

      expect(device.createBuffer).toHaveBeenCalledTimes(1);
      expect(buf1).toBe(buf2);
    });

    it('WGPU-SU-111: creates separate buffers for different stages', () => {
      const buf1 = uploader.uploadStageUniforms(device, 'primaryGrade', state);
      const buf2 = uploader.uploadStageUniforms(device, 'displayOutput', state);

      expect(device.createBuffer).toHaveBeenCalledTimes(2);
      // They are different mock instances
      expect(buf1).not.toBe(buf2);
    });

    it('WGPU-SU-112: reuses CPU staging buffer on subsequent calls', () => {
      uploader.uploadStageUniforms(device, 'primaryGrade', state);
      uploader.uploadStageUniforms(device, 'primaryGrade', state);

      // writeBuffer called twice with same buffer reference
      expect(device.queue.writeBuffer).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Buffer size ─────────────────────────────────────────────────────

  describe('buffer size', () => {
    it('WGPU-SU-120: all stages use the same MAX_STAGE_BUFFER_SIZE (512)', () => {
      for (const stageId of ALL_STAGES) {
        uploader.uploadStageUniforms(device, stageId, state);
      }

      for (const call of device.createBuffer.mock.calls) {
        expect(call[0].size).toBe(512);
      }
    });

    it('WGPU-SU-121: uploaded Uint8Array length matches buffer size', () => {
      uploader.uploadStageUniforms(device, 'compositing', state);

      const data = device.queue.writeBuffer.mock.calls[0]![2] as Uint8Array;
      expect(data.length).toBe(512);
    });
  });

  // ─── Data packing correctness ────────────────────────────────────────

  describe('data packing', () => {
    it('WGPU-SU-130: compositing packs premultMode (u32), bgPatternCode (u32), bgCheckerSize (f32)', () => {
      state.premultMode = 2;
      state.bgPatternCode = 3;
      state.bgCheckerSize = 16;

      uploader.uploadStageUniforms(device, 'compositing', state);

      const view = getUploadedView(device);
      expect(readU32(view, 0)).toBe(2); // premultMode as u32
      expect(readU32(view, 1)).toBe(3); // bgPatternCode as u32
      expect(readFloat(view, 2)).toBe(16); // bgCheckerSize as f32
    });

    it('WGPU-SU-131: spatialEffects packs clarityEnabled (u32) and clarityValue (f32)', () => {
      state.clarityEnabled = true;
      state.clarityValue = 0.75;

      uploader.uploadStageUniforms(device, 'spatialEffects', state);

      const view = getUploadedView(device);
      expect(readU32(view, 0)).toBe(1); // clarityEnabled as u32
      expect(readFloat(view, 1)).toBeCloseTo(0.75);
    });

    it('WGPU-SU-132: spatialEffectsPost packs sharpenEnabled (u32) and sharpenAmount (f32)', () => {
      state.sharpenEnabled = true;
      state.sharpenAmount = 0.5;

      uploader.uploadStageUniforms(device, 'spatialEffectsPost', state);

      const view = getUploadedView(device);
      expect(readU32(view, 0)).toBe(1); // sharpenEnabled as u32
      expect(readFloat(view, 1)).toBeCloseTo(0.5);
    });

    it('WGPU-SU-133: boolean fields are packed as i32 0 or 1', () => {
      state.deinterlaceEnabled = false;
      uploader.uploadStageUniforms(device, 'inputDecode', state);

      const view1 = getUploadedView(device, 0);
      expect(readI32(view1, 0)).toBe(0); // deinterlaceEnabled = false -> 0

      state.deinterlaceEnabled = true;
      uploader.uploadStageUniforms(device, 'inputDecode', state);

      const view2 = getUploadedView(device, 1);
      expect(readI32(view2, 0)).toBe(1); // deinterlaceEnabled = true -> 1
    });

    it('WGPU-SU-134: primaryGrade packs colorAdjustments fields as f32', () => {
      state.colorAdjustments.exposure = 2.0;
      state.colorAdjustments.gamma = 1.5;
      state.colorAdjustments.contrast = 0.8;

      uploader.uploadStageUniforms(device, 'primaryGrade', state);

      const view = getUploadedView(device);
      expect(readFloat(view, 0)).toBeCloseTo(2.0); // exposure
      expect(readFloat(view, 1)).toBeCloseTo(1.5); // gamma
      expect(readFloat(view, 2)).toBeCloseTo(0.8); // contrast
    });

    it('WGPU-SU-135: diagnostics packs channelModeCode (i32) and falseColorEnabled (i32)', () => {
      state.channelModeCode = 5;
      state.falseColorEnabled = true;

      uploader.uploadStageUniforms(device, 'diagnostics', state);

      const view = getUploadedView(device);
      expect(readI32(view, 0)).toBe(5); // channelModeCode as i32
      expect(readI32(view, 1)).toBe(1); // falseColorEnabled as i32
    });

    it('WGPU-SU-136: linearize packs logType (i32) and sRGB2linear (i32)', () => {
      state.linearizeLogType = 3;
      state.linearizeSRGB2linear = true;

      uploader.uploadStageUniforms(device, 'linearize', state);

      const view = getUploadedView(device);
      expect(readI32(view, 0)).toBe(3); // linearizeLogType as i32
      expect(readI32(view, 1)).toBe(1); // linearizeSRGB2linear as i32
    });

    it('WGPU-SU-137: sceneAnalysis packs outOfRange (i32) and toneMappingState (i32)', () => {
      state.outOfRange = 2;
      state.toneMappingState.enabled = true;
      state.gamutMappingEnabled = true;
      state.gamutMappingModeCode = 1;

      uploader.uploadStageUniforms(device, 'sceneAnalysis', state);

      const view = getUploadedView(device);
      expect(readI32(view, 0)).toBe(2); // outOfRange as i32
      expect(readI32(view, 1)).toBe(1); // toneMappingState.enabled as i32
      expect(readI32(view, 2)).toBe(1); // gamutMappingEnabled as i32
      expect(readI32(view, 3)).toBe(1); // gamutMappingModeCode as i32
    });
  });

  // ─── Default/zero state values ───────────────────────────────────────

  describe('default state values', () => {
    it('WGPU-SU-140: default state produces zeroed/default data for compositing', () => {
      uploader.uploadStageUniforms(device, 'compositing', state);

      const view = getUploadedView(device);
      expect(readU32(view, 0)).toBe(0); // premultMode default is 0
      // bgPatternCode default = BG_PATTERN_NONE
    });

    it('WGPU-SU-141: default state produces identity matrix for inputDecode perspectiveInvH', () => {
      uploader.uploadStageUniforms(device, 'inputDecode', state);

      const view = getUploadedView(device);
      // perspectiveInvH is packed as mat3 starting at offset 16 (after 4 i32s: deinterlace fields)
      // deinterlaceEnabled(0), deinterlaceMethod(4), deinterlaceFieldOrder(8), perspectiveEnabled(12)
      // then mat3 at align(16, 16) = 16
      expect(readFloat(view, 4)).toBe(1); // mat[0] = 1 (identity)
      expect(readFloat(view, 5)).toBe(0); // mat[1] = 0
      expect(readFloat(view, 6)).toBe(0); // mat[2] = 0
      // pad at slot 7
      expect(readFloat(view, 8)).toBe(0); // mat[3] = 0
      expect(readFloat(view, 9)).toBe(1); // mat[4] = 1 (identity)
    });

    it('WGPU-SU-142: default state has all boolean-enabled flags as 0', () => {
      uploader.uploadStageUniforms(device, 'spatialEffects', state);

      const view = getUploadedView(device);
      expect(readU32(view, 0)).toBe(0); // clarityEnabled = false -> 0
    });
  });

  // ─── Buffer zeroing ──────────────────────────────────────────────────

  describe('buffer zeroing', () => {
    it('WGPU-SU-150: packing zeroes the buffer before writing data', () => {
      // First upload with non-default values
      state.clarityEnabled = true;
      state.clarityValue = 1.0;
      uploader.uploadStageUniforms(device, 'spatialEffects', state);

      // Second upload with defaults (values should be cleared)
      const defaultState = createDefaultInternalState();
      uploader.uploadStageUniforms(device, 'spatialEffects', defaultState);

      const view = getUploadedView(device, 1);
      expect(readU32(view, 0)).toBe(0); // clarityEnabled zeroed
      expect(readFloat(view, 1)).toBe(0); // clarityValue zeroed
    });
  });

  // ─── uploadLUT1D ─────────────────────────────────────────────────────

  describe('uploadLUT1D', () => {
    it('WGPU-SU-200: creates a texture with correct dimensions for Uint8Array', () => {
      const data = new Uint8Array(256 * 4);
      uploader.uploadLUT1D(device, 'curves', data, 256, 4);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          size: { width: 256, height: 1 },
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        }),
      );
    });

    it('WGPU-SU-201: creates a texture with rgba32float for Float32Array', () => {
      const data = new Float32Array(64 * 4);
      uploader.uploadLUT1D(device, 'inline', data, 64, 4);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'rgba32float',
        }),
      );
    });

    it('WGPU-SU-202: writes texture data to the queue', () => {
      const data = new Uint8Array(128 * 4);
      uploader.uploadLUT1D(device, 'falseColor', data, 128, 4);

      expect(device.queue.writeTexture).toHaveBeenCalledTimes(1);
    });

    it('WGPU-SU-203: returns the created texture', () => {
      const data = new Uint8Array(64 * 4);
      const tex = uploader.uploadLUT1D(device, 'curves', data, 64, 4);
      expect(tex).toBeDefined();
      expect(tex.destroy).toBeDefined();
    });

    it('WGPU-SU-204: caches texture and returns via getLUTTexture', () => {
      const data = new Uint8Array(64 * 4);
      const tex = uploader.uploadLUT1D(device, 'curves', data, 64, 4);

      expect(uploader.getLUTTexture('curves')).toBe(tex);
    });

    it('WGPU-SU-205: destroys old texture when re-uploading with same key', () => {
      const data = new Uint8Array(64 * 4);
      const tex1 = uploader.uploadLUT1D(device, 'curves', data, 64, 4);
      uploader.uploadLUT1D(device, 'curves', data, 64, 4);

      expect(tex1.destroy).toHaveBeenCalledTimes(1);
    });

    it('WGPU-SU-206: pads RGB data to RGBA for Uint8Array (channels < 4)', () => {
      const data = new Uint8Array([255, 128, 64]); // 1 pixel, 3 channels
      uploader.uploadLUT1D(device, 'test', data, 1, 3);

      const writeCall = device.queue.writeTexture.mock.calls[0]!;
      const uploadedData = writeCall[1] as Uint8Array;
      expect(uploadedData[0]).toBe(255);
      expect(uploadedData[1]).toBe(128);
      expect(uploadedData[2]).toBe(64);
      expect(uploadedData[3]).toBe(255); // alpha padded to 255
    });

    it('WGPU-SU-207: pads RGB data to RGBA for Float32Array (channels < 4)', () => {
      const data = new Float32Array([0.5, 0.3, 0.1]); // 1 pixel, 3 channels
      uploader.uploadLUT1D(device, 'test', data, 1, 3);

      const writeCall = device.queue.writeTexture.mock.calls[0]!;
      const uploadedData = writeCall[1] as Float32Array;
      expect(uploadedData[0]).toBeCloseTo(0.5);
      expect(uploadedData[1]).toBeCloseTo(0.3);
      expect(uploadedData[2]).toBeCloseTo(0.1);
      expect(uploadedData[3]).toBeCloseTo(1.0); // alpha padded to 1.0
    });

    it('WGPU-SU-208: uses correct bytesPerRow for Uint8Array', () => {
      const data = new Uint8Array(32 * 4);
      uploader.uploadLUT1D(device, 'test', data, 32, 4);

      const writeCall = device.queue.writeTexture.mock.calls[0]!;
      expect(writeCall[2]).toEqual({ bytesPerRow: 32 * 4, rowsPerImage: 1 });
    });

    it('WGPU-SU-209: uses correct bytesPerRow for Float32Array', () => {
      const data = new Float32Array(32 * 4);
      uploader.uploadLUT1D(device, 'test', data, 32, 4);

      const writeCall = device.queue.writeTexture.mock.calls[0]!;
      expect(writeCall[2]).toEqual({ bytesPerRow: 32 * 16, rowsPerImage: 1 });
    });
  });

  // ─── uploadLUT3D ─────────────────────────────────────────────────────

  describe('uploadLUT3D', () => {
    it('WGPU-SU-300: creates a 2D atlas texture with size*size x size', () => {
      const lutSize = 4;
      const data = new Float32Array(lutSize * lutSize * lutSize * 3);
      uploader.uploadLUT3D(device, 'look3d', data, lutSize);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          size: { width: 16, height: 4 },
          format: 'rgba32float',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        }),
      );
    });

    it('WGPU-SU-301: packs RGB triplets into RGBA with alpha=1.0', () => {
      const data = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
      uploader.uploadLUT3D(device, 'look3d', data, 1);

      const writeCall = device.queue.writeTexture.mock.calls[0]!;
      const uploadedData = writeCall[1] as Float32Array;
      // First pixel
      expect(uploadedData[0]).toBeCloseTo(0.1);
      expect(uploadedData[1]).toBeCloseTo(0.2);
      expect(uploadedData[2]).toBeCloseTo(0.3);
      expect(uploadedData[3]).toBeCloseTo(1.0);
    });

    it('WGPU-SU-302: destroys previous texture with same key', () => {
      const data = new Float32Array(8 * 8 * 8 * 3);
      const tex1 = uploader.uploadLUT3D(device, 'look3d', data, 8);
      uploader.uploadLUT3D(device, 'look3d', data, 8);

      expect(tex1.destroy).toHaveBeenCalledTimes(1);
    });

    it('WGPU-SU-303: caches 3D LUT texture by key', () => {
      const data = new Float32Array(4 * 4 * 4 * 3);
      const tex = uploader.uploadLUT3D(device, 'look3d', data, 4);

      expect(uploader.getLUTTexture('look3d')).toBe(tex);
    });

    it('WGPU-SU-304: uses correct bytesPerRow for 3D LUT atlas', () => {
      const lutSize = 4;
      const data = new Float32Array(lutSize * lutSize * lutSize * 3);
      uploader.uploadLUT3D(device, 'look3d', data, lutSize);

      const writeCall = device.queue.writeTexture.mock.calls[0]!;
      // bytesPerRow = size * size * 16 (rgba32float = 16 bytes/pixel)
      expect(writeCall[2]).toEqual({ bytesPerRow: 4 * 4 * 16, rowsPerImage: 4 });
    });
  });

  // ─── getLUTTexture ───────────────────────────────────────────────────

  describe('getLUTTexture', () => {
    it('WGPU-SU-400: returns null for unknown key', () => {
      expect(uploader.getLUTTexture('unknown')).toBeNull();
    });

    it('WGPU-SU-401: returns cached texture after upload', () => {
      const data = new Uint8Array(16 * 4);
      const tex = uploader.uploadLUT1D(device, 'myLUT', data, 16, 4);
      expect(uploader.getLUTTexture('myLUT')).toBe(tex);
    });

    it('WGPU-SU-402: returns updated texture after re-upload', () => {
      const data = new Uint8Array(16 * 4);
      uploader.uploadLUT1D(device, 'myLUT', data, 16, 4);
      const tex2 = uploader.uploadLUT1D(device, 'myLUT', data, 16, 4);
      expect(uploader.getLUTTexture('myLUT')).toBe(tex2);
    });
  });

  // ─── dispose ─────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('WGPU-SU-500: destroys all uniform buffers', () => {
      uploader.uploadStageUniforms(device, 'primaryGrade', state);
      uploader.uploadStageUniforms(device, 'displayOutput', state);

      const buffers = device.createBuffer.mock.results.map(
        (r: { value: unknown }) => r.value as ReturnType<typeof createMockBuffer>,
      );

      uploader.dispose();

      for (const buf of buffers) {
        expect(buf.destroy).toHaveBeenCalledTimes(1);
      }
    });

    it('WGPU-SU-501: destroys all LUT textures', () => {
      const data = new Uint8Array(16 * 4);
      const tex1 = uploader.uploadLUT1D(device, 'curves', data, 16, 4);
      const tex2 = uploader.uploadLUT1D(device, 'falseColor', data, 16, 4);

      uploader.dispose();

      expect(tex1.destroy).toHaveBeenCalledTimes(1);
      expect(tex2.destroy).toHaveBeenCalledTimes(1);
    });

    it('WGPU-SU-502: getLUTTexture returns null after dispose', () => {
      const data = new Uint8Array(16 * 4);
      uploader.uploadLUT1D(device, 'curves', data, 16, 4);

      uploader.dispose();

      expect(uploader.getLUTTexture('curves')).toBeNull();
    });

    it('WGPU-SU-503: after dispose, new uploads create fresh buffers', () => {
      uploader.uploadStageUniforms(device, 'primaryGrade', state);
      uploader.dispose();

      uploader.uploadStageUniforms(device, 'primaryGrade', state);

      // Should have created 2 total buffers (one before dispose, one after)
      expect(device.createBuffer).toHaveBeenCalledTimes(2);
    });

    it('WGPU-SU-504: does not throw when called on fresh instance', () => {
      expect(() => uploader.dispose()).not.toThrow();
    });

    it('WGPU-SU-505: does not throw when called twice', () => {
      uploader.uploadStageUniforms(device, 'primaryGrade', state);
      uploader.dispose();
      expect(() => uploader.dispose()).not.toThrow();
    });
  });

  // ─── vec/mat alignment packing ───────────────────────────────────────

  describe('alignment packing', () => {
    it('WGPU-SU-600: vec2 texelSize is correctly packed in spatialEffects', () => {
      state.clarityEnabled = true;
      state.clarityValue = 0.5;
      state.texelSize = [1 / 1920, 1 / 1080];

      uploader.uploadStageUniforms(device, 'spatialEffects', state);

      const view = getUploadedView(device);
      // packU32(clarityEnabled) @ 0 -> next = 4
      // packFloat(clarityValue) @ 4 -> next = 8
      // packVec2(texelSize) @ align(8, 8) = 8 -> slot 2, slot 3
      expect(readFloat(view, 2)).toBeCloseTo(1 / 1920);
      expect(readFloat(view, 3)).toBeCloseTo(1 / 1080);
    });

    it('WGPU-SU-601: vec3 bgColor is correctly aligned to 16 bytes in compositing', () => {
      state.bgColor1 = [0.2, 0.4, 0.6];

      uploader.uploadStageUniforms(device, 'compositing', state);

      const view = getUploadedView(device);
      // packU32(premultMode) @ 0 -> 4
      // packU32(bgPatternCode) @ 4 -> 8
      // packFloat(bgCheckerSize) @ 8 -> 12
      // packFloat(0 padding) @ 12 -> 16
      // packVec3(bgColor1) @ align(16, 16) = 16 -> slot 4, 5, 6
      expect(readFloat(view, 4)).toBeCloseTo(0.2);
      expect(readFloat(view, 5)).toBeCloseTo(0.4);
      expect(readFloat(view, 6)).toBeCloseTo(0.6);
    });

    it('WGPU-SU-602: mat3 perspectiveInvH packs 3 columns with padding', () => {
      const mat = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      state.perspectiveInvH = mat;

      uploader.uploadStageUniforms(device, 'inputDecode', state);

      const view = getUploadedView(device);
      // After 4 i32s (deinterlace*3 + perspEnabled), mat3 starts at align(16, 16) = 16
      // Column 0: slot 4=1, slot 5=2, slot 6=3, slot 7=0(pad)
      // Column 1: slot 8=4, slot 9=5, slot 10=6, slot 11=0(pad)
      // Column 2: slot 12=7, slot 13=8, slot 14=9, slot 15=0(pad)
      expect(readFloat(view, 4)).toBe(1);
      expect(readFloat(view, 5)).toBe(2);
      expect(readFloat(view, 6)).toBe(3);
      expect(readFloat(view, 7)).toBe(0); // padding
      expect(readFloat(view, 8)).toBe(4);
      expect(readFloat(view, 9)).toBe(5);
      expect(readFloat(view, 10)).toBe(6);
      expect(readFloat(view, 11)).toBe(0); // padding
      expect(readFloat(view, 12)).toBe(7);
      expect(readFloat(view, 13)).toBe(8);
      expect(readFloat(view, 14)).toBe(9);
      expect(readFloat(view, 15)).toBe(0); // padding
    });

    it('WGPU-SU-603: vec4i channelSwizzle is aligned to 16 bytes', () => {
      state.channelSwizzle = [3, 2, 1, 0];

      uploader.uploadStageUniforms(device, 'inputDecode', state);

      const view = getUploadedView(device);
      // After mat3 (ends at byte 64 = slot 16), then perspectiveQuality at 64 -> 68
      // sphericalEnabled at 68 -> 72, sphericalFov at 72 -> 76, sphericalAspect 76 -> 80,
      // sphericalYaw 80 -> 84, sphericalPitch 84 -> 88
      // vec4i at align(88, 16) = 96 -> slot 24
      expect(readI32(view, 24)).toBe(3);
      expect(readI32(view, 25)).toBe(2);
      expect(readI32(view, 26)).toBe(1);
      expect(readI32(view, 27)).toBe(0);
    });
  });

  // ─── colorPipeline packing (complex stage) ──────────────────────────

  describe('colorPipeline packing', () => {
    it('WGPU-SU-700: packs colorWheelsEnabled (i32) at offset 0', () => {
      state.colorWheelsEnabled = true;
      uploader.uploadStageUniforms(device, 'colorPipeline', state);

      const view = getUploadedView(device);
      expect(readI32(view, 0)).toBe(1);
    });

    it('WGPU-SU-701: packs wheelLift as vec4f at offset 16', () => {
      state.wheelLift = [0.1, 0.2, 0.3, 0.4];
      uploader.uploadStageUniforms(device, 'colorPipeline', state);

      const view = getUploadedView(device);
      // 4 i32s (colorWheelsEnabled + 3 padding) = 16 bytes
      // vec4 wheelLift at align(16, 16) = 16 -> slot 4
      expect(readFloat(view, 4)).toBeCloseTo(0.1);
      expect(readFloat(view, 5)).toBeCloseTo(0.2);
      expect(readFloat(view, 6)).toBeCloseTo(0.3);
      expect(readFloat(view, 7)).toBeCloseTo(0.4);
    });

    it('WGPU-SU-702: packs cdlEnabled (i32) after wheel vec4s', () => {
      state.cdlEnabled = true;
      state.cdlSaturation = 1.2;
      uploader.uploadStageUniforms(device, 'colorPipeline', state);

      const view = getUploadedView(device);
      // 4 i32s + 3 vec4s = 4 + 12 = 16 slots -> slot 16
      expect(readI32(view, 16)).toBe(1); // cdlEnabled as i32
      expect(readFloat(view, 17)).toBeCloseTo(1.2); // cdlSaturation as f32
    });
  });

  // ─── displayOutput packing ───────────────────────────────────────────

  describe('displayOutput packing', () => {
    it('WGPU-SU-800: packs outputPrimariesEnabled (i32) at offset 0', () => {
      state.outputPrimariesEnabled = true;
      uploader.uploadStageUniforms(device, 'displayOutput', state);

      const view = getUploadedView(device);
      expect(readI32(view, 0)).toBe(1);
    });

    it('WGPU-SU-801: packs display transfer fields', () => {
      state.displayTransferCode = 2;
      state.displayGammaOverride = 2.4;
      state.displayBrightnessMultiplier = 1.5;

      uploader.uploadStageUniforms(device, 'displayOutput', state);

      const view = getUploadedView(device);
      expect(readI32(view, 1)).toBe(2); // displayTransferCode as i32
      expect(readFloat(view, 2)).toBeCloseTo(2.4); // displayGammaOverride as f32
      expect(readFloat(view, 3)).toBeCloseTo(1.5); // displayBrightnessMultiplier as f32
    });
  });

  // ─── secondaryGrade packing ──────────────────────────────────────────

  describe('secondaryGrade packing', () => {
    it('WGPU-SU-900: packs highlights/shadows values', () => {
      state.hsEnabled = true;
      state.highlightsValue = 0.3;
      state.shadowsValue = -0.2;
      state.whitesValue = 0.1;
      state.blacksValue = -0.1;

      uploader.uploadStageUniforms(device, 'secondaryGrade', state);

      const view = getUploadedView(device);
      expect(readI32(view, 0)).toBe(1); // hsEnabled as i32
      expect(readFloat(view, 1)).toBeCloseTo(0.3); // highlightsValue
      expect(readFloat(view, 2)).toBeCloseTo(-0.2); // shadowsValue
      expect(readFloat(view, 3)).toBeCloseTo(0.1); // whitesValue
      expect(readFloat(view, 4)).toBeCloseTo(-0.1); // blacksValue
    });

    it('WGPU-SU-901: packs vibrance and hueRotation', () => {
      state.vibranceEnabled = true;
      state.vibranceValue = 0.5;
      state.vibranceSkinProtection = false;
      state.colorAdjustments.hueRotation = 45;

      uploader.uploadStageUniforms(device, 'secondaryGrade', state);

      const view = getUploadedView(device);
      expect(readI32(view, 5)).toBe(1); // vibranceEnabled as i32
      expect(readFloat(view, 6)).toBeCloseTo(0.5); // vibranceValue
      expect(readI32(view, 7)).toBe(0); // vibranceSkinProtection = false as i32
      expect(readFloat(view, 8)).toBeCloseTo(45); // hueRotation
    });
  });
});
