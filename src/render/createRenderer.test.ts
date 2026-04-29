/**
 * createRenderer - silent-catch fix verification (MED-55 Phase 4-pre, sub-step P-pre-4).
 *
 * Test ID prefix: CR-
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_CAPABILITIES } from '../color/DisplayCapabilities';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';

// Mock WebGPUBackend so we can force the constructor to throw and exercise
// the catch branch in createRenderer.
vi.mock('./WebGPUBackend', () => ({
  WebGPUBackend: class {
    constructor() {
      throw new Error('Simulated WebGPU construction failure');
    }
  },
}));

// Import AFTER vi.mock so the mock is in effect.
import { createRenderer } from './createRenderer';
import { Renderer } from './Renderer';

function makeCaps(overrides: Partial<DisplayCapabilities> = {}): DisplayCapabilities {
  return { ...DEFAULT_CAPABILITIES, ...overrides };
}

describe('createRenderer silent-catch fix', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('CR-SILENT-001: console.warn is called when WebGPU construction throws, and falls back to WebGL2', () => {
    const caps = makeCaps({ webgpuAvailable: true, webgpuHDR: true });

    const backend = createRenderer(caps);

    // Fall-back must yield a WebGL2 Renderer instance.
    expect(backend).toBeInstanceOf(Renderer);

    // The catch branch must surface the failure via console.warn (no silent swallow).
    // Other constructors (e.g. Renderer with a mock GL) may also emit warnings,
    // so search the call list for our specific message rather than asserting an exact count.
    const matchingCall = warnSpy.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('WebGPU construction failed'),
    );
    expect(matchingCall).toBeDefined();
    expect(matchingCall![0]).toContain('[createRenderer]');
    expect(matchingCall![0]).toContain('falling back to WebGL2');
    const errArg = matchingCall![1];
    expect(errArg).toBeInstanceOf(Error);
    expect((errArg as Error).message).toBe('Simulated WebGPU construction failure');
  });
});
