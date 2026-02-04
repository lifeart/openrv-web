/**
 * createRenderer - Factory function for selecting the appropriate rendering backend
 *
 * Phase 4: Selects WebGPUBackend when the display supports WebGPU with HDR,
 * otherwise falls back to WebGL2Backend (the original Renderer).
 */

import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { RendererBackend } from './RendererBackend';
import { Renderer } from './Renderer';
import { WebGPUBackend } from './WebGPUBackend';

/**
 * Create the best available rendering backend based on display capabilities.
 *
 * Selection logic:
 * 1. If `caps.webgpuAvailable && caps.webgpuHDR`, try to construct a WebGPUBackend.
 * 2. If WebGPUBackend construction throws, fall through to WebGL2.
 * 3. Otherwise, return a WebGL2Backend (Renderer).
 *
 * After calling this function, the caller must:
 *   1. `backend.initialize(canvas, caps)`
 *   2. `await backend.initAsync()` (no-op for WebGL2, required for WebGPU)
 *
 * @param caps - Display capabilities detected at startup
 * @returns A RendererBackend instance ready for initialize()
 */
export function createRenderer(caps: DisplayCapabilities): RendererBackend {
  if (caps.webgpuAvailable && caps.webgpuHDR) {
    try {
      return new WebGPUBackend();
    } catch {
      // WebGPU construction failed; fall through to WebGL2
    }
  }
  return new Renderer();
}
