import { describe, it, expect, vi } from 'vitest';
import { WebGPU3DLUT } from './WebGPU3DLUT';
import type { LUTSlot } from './WebGPU3DLUT';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockTextureView() {
  return {};
}

function createMockTexture() {
  return {
    createView: vi.fn().mockReturnValue(createMockTextureView()),
    destroy: vi.fn(),
  };
}

function createMockDevice() {
  return {
    createShaderModule: vi.fn().mockReturnValue({}),
    createRenderPipeline: vi.fn().mockReturnValue({ getBindGroupLayout: vi.fn().mockReturnValue({}) }),
    createSampler: vi.fn().mockReturnValue({}),
    createTexture: vi.fn().mockImplementation(() => createMockTexture()),
    createBindGroup: vi.fn().mockReturnValue({}),
    createBuffer: vi.fn().mockReturnValue({
      getMappedRange: vi.fn().mockReturnValue(new ArrayBuffer(16)),
      unmap: vi.fn(),
      destroy: vi.fn(),
      mapAsync: vi.fn().mockResolvedValue(undefined),
    }),
    createCommandEncoder: vi.fn(),
    queue: {
      writeTexture: vi.fn(),
      writeBuffer: vi.fn(),
      submit: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
    },
    destroy: vi.fn(),
  };
}

/** Generate a valid Float32Array for a given LUT size (size^3 * 4 RGBA floats). */
function createLUTData(size: number): Float32Array {
  return new Float32Array(size * size * size * 4);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPU3DLUT', () => {
  describe('initial state', () => {
    it('WGPU-LUT-001: all slots start disabled with no texture', () => {
      const lut = new WebGPU3DLUT();
      for (const slot of ['file', 'look', 'display'] as LUTSlot[]) {
        const state = lut.getSlotState(slot);
        expect(state.enabled).toBe(false);
        expect(state.size).toBe(0);
        expect(state.intensity).toBe(1.0);
        expect(state.texture).toBeNull();
        expect(state.textureView).toBeNull();
        expect(state.domainMin).toEqual([0, 0, 0]);
        expect(state.domainMax).toEqual([1, 1, 1]);
      }
    });

    it('WGPU-LUT-002: isSlotActive returns false for all slots initially', () => {
      const lut = new WebGPU3DLUT();
      expect(lut.isSlotActive('file')).toBe(false);
      expect(lut.isSlotActive('look')).toBe(false);
      expect(lut.isSlotActive('display')).toBe(false);
    });

    it('WGPU-LUT-003: getBindGroupEntries returns null when no texture uploaded', () => {
      const lut = new WebGPU3DLUT();
      expect(lut.getBindGroupEntries('file', 0, 1)).toBeNull();
    });
  });

  describe('upload', () => {
    it('WGPU-LUT-010: creates 3D texture with correct dimensions and format', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();
      const data = createLUTData(17);

      lut.upload(device, 'file', data, 17);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          size: { width: 17, height: 17, depthOrArrayLayers: 17 },
          format: 'rgba32float',
          dimension: '3d',
        }),
      );
    });

    it('WGPU-LUT-011: creates sampler with linear filtering on first upload', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();

      lut.upload(device, 'file', createLUTData(17), 17);

      expect(device.createSampler).toHaveBeenCalledWith({
        magFilter: 'linear',
        minFilter: 'linear',
      });
    });

    it('WGPU-LUT-012: reuses sampler across multiple slots', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();

      lut.upload(device, 'file', createLUTData(17), 17);
      lut.upload(device, 'look', createLUTData(33), 33);

      // Sampler created only once
      expect(device.createSampler).toHaveBeenCalledTimes(1);
    });

    it('WGPU-LUT-013: writes texture data with correct layout', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();
      const data = createLUTData(17);

      lut.upload(device, 'file', data, 17);

      expect(device.queue.writeTexture).toHaveBeenCalledWith(
        expect.objectContaining({ texture: expect.anything() }),
        data,
        { bytesPerRow: 17 * 4 * 4, rowsPerImage: 17 },
        { width: 17, height: 17, depthOrArrayLayers: 17 },
      );
    });

    it('WGPU-LUT-014: throws on data length mismatch', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();
      const badData = new Float32Array(10); // too small for any LUT

      expect(() => lut.upload(device, 'file', badData, 17)).toThrow(/length mismatch/);
    });

    it('WGPU-LUT-015: supports various LUT sizes (17, 33, 65)', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();

      for (const size of [17, 33, 65]) {
        lut.upload(device, 'file', createLUTData(size), size);
        expect(lut.getSlotState('file').size).toBe(size);
      }
    });

    it('WGPU-LUT-016: marks slot as dirty after upload', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();

      lut.upload(device, 'file', createLUTData(17), 17);

      expect(lut.getSlotState('file').dirty).toBe(true);
      expect(lut.hasDirtySlots()).toBe(true);
    });

    it('WGPU-LUT-017: destroys old texture when size changes', () => {
      const device = createMockDevice();
      const textures: ReturnType<typeof createMockTexture>[] = [];
      device.createTexture.mockImplementation(() => {
        const t = createMockTexture();
        textures.push(t);
        return t;
      });

      const lut = new WebGPU3DLUT();
      lut.upload(device, 'file', createLUTData(17), 17);
      const firstTexture = textures[0]!;

      lut.upload(device, 'file', createLUTData(33), 33);

      expect(firstTexture.destroy).toHaveBeenCalled();
      expect(device.createTexture).toHaveBeenCalledTimes(2);
    });

    it('WGPU-LUT-018: reuses texture when size matches', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();

      lut.upload(device, 'file', createLUTData(17), 17);
      lut.upload(device, 'file', createLUTData(17), 17);

      // Only one texture created (reused on second upload)
      expect(device.createTexture).toHaveBeenCalledTimes(1);
      // But writeTexture called twice
      expect(device.queue.writeTexture).toHaveBeenCalledTimes(2);
    });
  });

  describe('setEnabled / setDomain', () => {
    it('WGPU-LUT-020: setEnabled updates enabled and intensity', () => {
      const lut = new WebGPU3DLUT();
      lut.setEnabled('file', true, 0.75);

      const state = lut.getSlotState('file');
      expect(state.enabled).toBe(true);
      expect(state.intensity).toBe(0.75);
      expect(state.dirty).toBe(true);
    });

    it('WGPU-LUT-021: setEnabled no-op when values unchanged', () => {
      const lut = new WebGPU3DLUT();
      lut.setEnabled('file', false, 1.0); // same as default
      // dirty should be false since no actual change
      expect(lut.getSlotState('file').dirty).toBe(false);
    });

    it('WGPU-LUT-022: setDomain updates domain range', () => {
      const lut = new WebGPU3DLUT();
      lut.setDomain('look', [0.1, 0.2, 0.3], [0.9, 0.8, 0.7]);

      const state = lut.getSlotState('look');
      expect(state.domainMin).toEqual([0.1, 0.2, 0.3]);
      expect(state.domainMax).toEqual([0.9, 0.8, 0.7]);
      expect(state.dirty).toBe(true);
    });

    it('WGPU-LUT-023: isSlotActive requires both enabled and texture', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();

      // Enabled but no texture
      lut.setEnabled('file', true);
      expect(lut.isSlotActive('file')).toBe(false);

      // Upload texture -> now active
      lut.upload(device, 'file', createLUTData(17), 17);
      expect(lut.isSlotActive('file')).toBe(true);

      // Disable -> inactive
      lut.setEnabled('file', false);
      expect(lut.isSlotActive('file')).toBe(false);
    });
  });

  describe('getBindGroupEntries', () => {
    it('WGPU-LUT-030: returns sampler and texture view after upload', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();
      lut.upload(device, 'file', createLUTData(17), 17);

      const entries = lut.getBindGroupEntries('file', 3, 4);
      expect(entries).not.toBeNull();
      expect(entries).toHaveLength(2);
      expect(entries![0]!.binding).toBe(3);
      expect(entries![1]!.binding).toBe(4);
    });

    it('WGPU-LUT-031: returns null before any upload', () => {
      const lut = new WebGPU3DLUT();
      expect(lut.getBindGroupEntries('file', 0, 1)).toBeNull();
    });
  });

  describe('clearDirty', () => {
    it('WGPU-LUT-040: clears dirty flag for specific slot', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();
      lut.upload(device, 'file', createLUTData(17), 17);
      lut.upload(device, 'look', createLUTData(17), 17);

      lut.clearDirty('file');

      expect(lut.getSlotState('file').dirty).toBe(false);
      expect(lut.getSlotState('look').dirty).toBe(true);
      expect(lut.hasDirtySlots()).toBe(true);
    });
  });

  describe('clear slot', () => {
    it('WGPU-LUT-050: destroys texture and resets slot state', () => {
      const device = createMockDevice();
      const tex = createMockTexture();
      device.createTexture.mockReturnValue(tex);

      const lut = new WebGPU3DLUT();
      lut.upload(device, 'file', createLUTData(17), 17);
      lut.setEnabled('file', true, 0.5);
      lut.setDomain('file', [0.1, 0.1, 0.1], [0.9, 0.9, 0.9]);

      lut.clear('file');

      expect(tex.destroy).toHaveBeenCalled();
      const state = lut.getSlotState('file');
      expect(state.texture).toBeNull();
      expect(state.textureView).toBeNull();
      expect(state.enabled).toBe(false);
      expect(state.size).toBe(0);
      expect(state.intensity).toBe(1.0);
      expect(state.domainMin).toEqual([0, 0, 0]);
      expect(state.domainMax).toEqual([1, 1, 1]);
    });
  });

  describe('dispose', () => {
    it('WGPU-LUT-060: destroys all textures across all slots', () => {
      const device = createMockDevice();
      const textures: ReturnType<typeof createMockTexture>[] = [];
      device.createTexture.mockImplementation(() => {
        const t = createMockTexture();
        textures.push(t);
        return t;
      });

      const lut = new WebGPU3DLUT();
      lut.upload(device, 'file', createLUTData(17), 17);
      lut.upload(device, 'look', createLUTData(33), 33);
      lut.upload(device, 'display', createLUTData(17), 17);

      lut.dispose();

      for (const tex of textures) {
        expect(tex.destroy).toHaveBeenCalled();
      }
    });

    it('WGPU-LUT-061: resets all slot states after dispose', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();
      lut.upload(device, 'file', createLUTData(17), 17);
      lut.setEnabled('file', true);

      lut.dispose();

      const state = lut.getSlotState('file');
      expect(state.enabled).toBe(false);
      expect(state.size).toBe(0);
      expect(state.texture).toBeNull();
      expect(state.textureView).toBeNull();
    });

    it('WGPU-LUT-062: safe to call dispose when nothing uploaded', () => {
      const lut = new WebGPU3DLUT();
      expect(() => lut.dispose()).not.toThrow();
    });

    it('WGPU-LUT-063: safe to call dispose multiple times', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();
      lut.upload(device, 'file', createLUTData(17), 17);

      lut.dispose();
      expect(() => lut.dispose()).not.toThrow();
    });
  });

  describe('multi-slot independence', () => {
    it('WGPU-LUT-070: slots operate independently', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();

      lut.upload(device, 'file', createLUTData(17), 17);
      lut.upload(device, 'look', createLUTData(33), 33);

      lut.setEnabled('file', true, 0.5);
      lut.setEnabled('look', true, 0.8);

      expect(lut.getSlotState('file').size).toBe(17);
      expect(lut.getSlotState('file').intensity).toBe(0.5);
      expect(lut.getSlotState('look').size).toBe(33);
      expect(lut.getSlotState('look').intensity).toBe(0.8);
      expect(lut.getSlotState('display').enabled).toBe(false);
    });

    it('WGPU-LUT-071: clearing one slot does not affect others', () => {
      const device = createMockDevice();
      const lut = new WebGPU3DLUT();

      lut.upload(device, 'file', createLUTData(17), 17);
      lut.upload(device, 'look', createLUTData(33), 33);
      lut.setEnabled('file', true);
      lut.setEnabled('look', true);

      lut.clear('file');

      expect(lut.isSlotActive('file')).toBe(false);
      expect(lut.isSlotActive('look')).toBe(true);
    });
  });
});
