/**
 * createRenderer - Factory function for selecting the appropriate rendering backend
 *
 * Phase 4: Selects WebGPUBackend when the display supports WebGPU with HDR,
 * otherwise falls back to WebGL2Backend (the original Renderer).
 *
 * MED-55 Phase 4-pre: Backend selection is now gated by:
 *   1. `caps.backendOverride` (explicit force; wins over everything)
 *   2. The WebGPU stage pipeline feature flag (see ./webgpu/featureFlag.ts).
 *      Default is `'disabled'` so production sees zero behavior change —
 *      the legacy WebGL2 `Renderer()` path is always selected unless the
 *      flag is explicitly enabled (URL or localStorage opt-in).
 */

import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { RendererBackend } from './RendererBackend';
import { Renderer } from './Renderer';
import { WebGPUBackend } from './WebGPUBackend';
import { isWebGPUEnabled } from './webgpu/featureFlag';

/**
 * Create the best available rendering backend based on display capabilities
 * and the WebGPU stage pipeline feature flag.
 *
 * Selection logic (first match wins):
 *   1. Explicit `caps.backendOverride === 'webgl2'` → return Renderer.
 *   2. Explicit `caps.backendOverride === 'webgpu'` → try WebGPUBackend
 *      (with WebGL2 fallback on construction failure).
 *   3. If the WebGPU stage pipeline feature flag is enabled AND
 *      `caps.webgpuAvailable && caps.webgpuHDR`, try WebGPUBackend
 *      (with WebGL2 fallback on construction failure).
 *   4. Otherwise, return a WebGL2Backend (Renderer).
 *
 * After calling this function, the caller must:
 *   1. `backend.initialize(canvas, caps)`
 *   2. `await backend.initAsync()` (no-op for WebGL2, required for WebGPU)
 *
 * @param caps - Display capabilities detected at startup
 * @returns A RendererBackend instance ready for initialize()
 */
export function createRenderer(caps: DisplayCapabilities): RendererBackend {
  // 1. Explicit override wins over everything (capabilities + feature flag).
  if (caps.backendOverride === 'webgl2') {
    return new Renderer();
  }
  if (caps.backendOverride === 'webgpu') {
    try {
      return new WebGPUBackend();
    } catch (err) {
      console.warn(
        '[createRenderer] WebGPU forced via backendOverride but construction failed; falling back to WebGL2:',
        err,
      );
      return new Renderer();
    }
  }

  // 2. Capability + feature-flag-based selection.
  //    Default flag state is 'disabled', so this branch is skipped in production
  //    until the WebGPU stage pipeline opt-in is set.
  if (isWebGPUEnabled() && caps.webgpuAvailable && caps.webgpuHDR) {
    try {
      return new WebGPUBackend();
    } catch (err) {
      console.warn('[createRenderer] WebGPU construction failed, falling back to WebGL2:', err);
    }
  }

  // 3. Fallback.
  return new Renderer();
}
