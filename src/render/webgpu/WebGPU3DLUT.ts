/**
 * WebGPU3DLUT - 3D LUT texture management for WebGPU.
 *
 * Manages three LUT slots (File, Look, Display) backed by `texture_3d<f32>`
 * GPU textures with `rgba32float` format. Each slot supports variable LUT
 * sizes (commonly 17x17x17, 33x33x33, 65x65x65) and hardware trilinear
 * interpolation via a linear filtering sampler.
 *
 * Usage:
 *   1. upload(slot, data, size) — create/resize 3D texture and upload
 *   2. setEnabled(slot, enabled, intensity) — toggle slot and set blend
 *   3. setDomain(slot, min, max) — set domain mapping range
 *   4. getBindGroupEntries(slot) — return sampler + texture view for bind groups
 *   5. dispose() — release all GPU resources
 */

import type { WGPUDevice, WGPUSampler, WGPUTexture, WGPUTextureView, WGPUBindGroupEntry } from './WebGPUTypes';
import { GPUTextureUsage } from './WebGPUTypes';

// ---------------------------------------------------------------------------
// LUT slot identifiers
// ---------------------------------------------------------------------------

export type LUTSlot = 'file' | 'look' | 'display';

// ---------------------------------------------------------------------------
// Per-slot state
// ---------------------------------------------------------------------------

export interface LUTSlotState {
  /** Whether this LUT slot is active in the shader pipeline. */
  enabled: boolean;
  /** Current LUT cube size (e.g. 17, 33, 65). */
  size: number;
  /** Blend intensity (0 = bypass, 1 = full LUT). */
  intensity: number;
  /** Domain minimum (per-channel). */
  domainMin: [number, number, number];
  /** Domain maximum (per-channel). */
  domainMax: [number, number, number];
  /** Whether state has changed since last upload/bind group creation. */
  dirty: boolean;
  /** GPU 3D texture (null until first upload). */
  texture: WGPUTexture | null;
  /** Cached texture view (null until first upload). */
  textureView: WGPUTextureView | null;
}

// ---------------------------------------------------------------------------
// WebGPU3DLUT
// ---------------------------------------------------------------------------

export class WebGPU3DLUT {
  private slots: Map<LUTSlot, LUTSlotState> = new Map();
  private sampler: WGPUSampler | null = null;

  constructor() {
    // Initialize all three slots with defaults
    for (const slot of ['file', 'look', 'display'] as LUTSlot[]) {
      this.slots.set(slot, {
        enabled: false,
        size: 0,
        intensity: 1.0,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        dirty: false,
        texture: null,
        textureView: null,
      });
    }
  }

  /**
   * Upload Float32Array LUT data to a `rgba32float` `texture_3d`.
   *
   * @param device - GPU device
   * @param slot - Which LUT slot to upload to
   * @param data - RGBA float data, length must be size^3 * 4
   * @param size - Cube dimension (e.g. 17 for a 17x17x17 LUT)
   */
  upload(device: WGPUDevice, slot: LUTSlot, data: Float32Array, size: number): void {
    const state = this.slots.get(slot)!;

    // Validate data length
    const expectedLength = size * size * size * 4;
    if (data.length !== expectedLength) {
      throw new Error(`LUT data length mismatch for slot '${slot}': expected ${expectedLength}, got ${data.length}`);
    }

    // Ensure sampler exists (created once, shared across all slots)
    if (!this.sampler) {
      this.sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });
    }

    // Destroy existing texture if size changed
    if (state.texture && state.size !== size) {
      state.texture.destroy();
      state.texture = null;
      state.textureView = null;
    }

    // Create texture if needed
    if (!state.texture) {
      state.texture = device.createTexture({
        size: { width: size, height: size, depthOrArrayLayers: size },
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        dimension: '3d',
      });
      state.textureView = state.texture.createView();
    }

    // Upload data
    const bytesPerRow = size * 4 * 4; // size texels * 4 channels * 4 bytes/float
    device.queue.writeTexture(
      { texture: state.texture },
      data,
      { bytesPerRow, rowsPerImage: size },
      { width: size, height: size, depthOrArrayLayers: size },
    );

    state.size = size;
    state.dirty = true;
  }

  /**
   * Set the enabled state and intensity for a LUT slot.
   */
  setEnabled(slot: LUTSlot, enabled: boolean, intensity: number = 1.0): void {
    const state = this.slots.get(slot)!;
    if (state.enabled !== enabled || state.intensity !== intensity) {
      state.enabled = enabled;
      state.intensity = intensity;
      state.dirty = true;
    }
  }

  /**
   * Set the domain range for a LUT slot.
   */
  setDomain(slot: LUTSlot, domainMin: [number, number, number], domainMax: [number, number, number]): void {
    const state = this.slots.get(slot)!;
    state.domainMin = [...domainMin];
    state.domainMax = [...domainMax];
    state.dirty = true;
  }

  /**
   * Get the current state for a LUT slot (read-only snapshot).
   */
  getSlotState(slot: LUTSlot): Readonly<LUTSlotState> {
    return this.slots.get(slot)!;
  }

  /**
   * Return bind group entries (sampler + texture view) for the given slot.
   *
   * @param slot - Which LUT slot
   * @param samplerBinding - Binding index for the sampler
   * @param textureBinding - Binding index for the texture view
   * @returns Array of bind group entries, or null if the slot has no texture
   */
  getBindGroupEntries(slot: LUTSlot, samplerBinding: number, textureBinding: number): WGPUBindGroupEntry[] | null {
    const state = this.slots.get(slot)!;
    if (!state.textureView || !this.sampler) {
      return null;
    }

    return [
      { binding: samplerBinding, resource: this.sampler },
      { binding: textureBinding, resource: state.textureView },
    ];
  }

  /**
   * Check whether a slot has a texture uploaded and is enabled.
   */
  isSlotActive(slot: LUTSlot): boolean {
    const state = this.slots.get(slot)!;
    return state.enabled && state.texture !== null;
  }

  /**
   * Clear the dirty flag for a slot (call after consuming the state).
   */
  clearDirty(slot: LUTSlot): void {
    this.slots.get(slot)!.dirty = false;
  }

  /**
   * Check if any slot has pending changes.
   */
  hasDirtySlots(): boolean {
    for (const state of this.slots.values()) {
      if (state.dirty) return true;
    }
    return false;
  }

  /**
   * Remove LUT data from a slot (disables and destroys the texture).
   */
  clear(slot: LUTSlot): void {
    const state = this.slots.get(slot)!;
    if (state.texture) {
      state.texture.destroy();
    }
    state.texture = null;
    state.textureView = null;
    state.enabled = false;
    state.size = 0;
    state.intensity = 1.0;
    state.domainMin = [0, 0, 0];
    state.domainMax = [1, 1, 1];
    state.dirty = true;
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    for (const state of this.slots.values()) {
      if (state.texture) {
        state.texture.destroy();
      }
      state.texture = null;
      state.textureView = null;
      state.enabled = false;
      state.size = 0;
      state.dirty = false;
    }
    this.sampler = null;
  }
}
