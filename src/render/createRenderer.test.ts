/**
 * createRenderer - silent-catch fix verification (MED-55 Phase 4-pre, sub-step P-pre-4)
 * + feature-flag wiring tests (MED-55 P-pre-5).
 *
 * Test ID prefixes: CR-, CR-FLAG-
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_CAPABILITIES } from '../color/DisplayCapabilities';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';

// vi.mock factories are hoisted above all `let` / `const` declarations, so
// shared mock state must live in `vi.hoisted()` to be accessible from both
// the factory and the test bodies.
const mockState = vi.hoisted(() => ({
  shouldThrow: true,
  callCount: 0,
}));

// Mock WebGPUBackend so we can force the constructor to throw and exercise
// the catch branch in createRenderer. Tests that need a successful WebGPU
// construction toggle `mockState.shouldThrow = false` first.
vi.mock('./WebGPUBackend', () => ({
  WebGPUBackend: class {
    constructor() {
      mockState.callCount += 1;
      if (mockState.shouldThrow) {
        throw new Error('Simulated WebGPU construction failure');
      }
    }
  },
}));

// Import AFTER vi.mock so the mock is in effect.
import { createRenderer } from './createRenderer';
import { Renderer } from './Renderer';
import { setWebGPUBackendModeForTest } from './webgpu/featureFlag';

const FF_STORAGE_KEY = 'openrv:webgpu-stages-flag';

function makeCaps(overrides: Partial<DisplayCapabilities> = {}): DisplayCapabilities {
  return { ...DEFAULT_CAPABILITIES, ...overrides };
}

/** Reset URL search to '' between tests so the feature flag default applies. */
function clearLocationSearch(): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search: '' },
  });
}

describe('createRenderer silent-catch fix', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let originalLocation: Location;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    originalLocation = window.location;
    clearLocationSearch();
    try {
      window.localStorage.removeItem(FF_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    mockState.shouldThrow = true;
    mockState.callCount = 0;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    try {
      window.localStorage.removeItem(FF_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  });

  it('CR-SILENT-001: console.warn is called when WebGPU construction throws, and falls back to WebGL2', () => {
    // The flag must be enabled for capability-based selection to even attempt
    // WebGPU; otherwise the early-return in createRenderer skips the catch
    // branch entirely.
    setWebGPUBackendModeForTest('enabled-no-stages');

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

  // ------------------------------------------------------------------
  // MED-55 P-pre-5: feature-flag + backendOverride wiring
  // ------------------------------------------------------------------

  it('CR-FLAG-001: with default flag (disabled), returns Renderer even if webgpuAvailable && webgpuHDR', () => {
    // No URL override, no localStorage override → default = 'disabled'.
    const caps = makeCaps({ webgpuAvailable: true, webgpuHDR: true });

    const backend = createRenderer(caps);

    expect(backend).toBeInstanceOf(Renderer);
    // WebGPUBackend constructor must NOT have been called when the flag is off.
    expect(mockState.callCount).toBe(0);
  });

  it("CR-FLAG-002: with caps.backendOverride='webgl2', returns Renderer even if webgpuAvailable", () => {
    // Set the flag to enabled so capability-based selection would otherwise pick WebGPU.
    setWebGPUBackendModeForTest('enabled-no-stages');

    const caps = makeCaps({
      webgpuAvailable: true,
      webgpuHDR: true,
      backendOverride: 'webgl2',
    });

    const backend = createRenderer(caps);

    expect(backend).toBeInstanceOf(Renderer);
    // Override skips the WebGPU path entirely.
    expect(mockState.callCount).toBe(0);
  });

  it("CR-FLAG-003: with caps.backendOverride='webgpu' + WebGPU construction failure, falls back to Renderer and warns", () => {
    mockState.shouldThrow = true;

    const caps = makeCaps({ backendOverride: 'webgpu' });

    const backend = createRenderer(caps);

    expect(backend).toBeInstanceOf(Renderer);
    expect(mockState.callCount).toBe(1);

    const matchingCall = warnSpy.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('WebGPU forced via backendOverride'),
    );
    expect(matchingCall).toBeDefined();
    expect(matchingCall![0]).toContain('[createRenderer]');
    expect(matchingCall![0]).toContain('falling back to WebGL2');
  });

  it('CR-FLAG-004: with flag enabled + webgpu capable, attempts WebGPUBackend construction', () => {
    // Allow the WebGPU constructor to succeed for this test.
    mockState.shouldThrow = false;
    setWebGPUBackendModeForTest('enabled-no-stages');

    const caps = makeCaps({ webgpuAvailable: true, webgpuHDR: true });

    const backend = createRenderer(caps);

    // The mock WebGPUBackend has no methods, but it's not a Renderer instance —
    // and importantly the constructor was invoked exactly once.
    expect(backend).not.toBeInstanceOf(Renderer);
    expect(mockState.callCount).toBe(1);
  });

  it("CR-FLAG-005: backendOverride='webgpu' is honored even when caps.webgpuAvailable=false (success path)", () => {
    // Override forces the attempt regardless of capability flags.
    mockState.shouldThrow = false;

    const caps = makeCaps({
      webgpuAvailable: false,
      webgpuHDR: false,
      backendOverride: 'webgpu',
    });

    const backend = createRenderer(caps);

    expect(backend).not.toBeInstanceOf(Renderer);
    expect(mockState.callCount).toBe(1);
  });

  it('CR-FLAG-006: with flag enabled but caps lacking WebGPU support, returns Renderer without attempting WebGPU', () => {
    setWebGPUBackendModeForTest('enabled-with-stages');

    // Flag is on, but the display does not advertise WebGPU HDR support.
    const caps = makeCaps({ webgpuAvailable: false, webgpuHDR: false });

    const backend = createRenderer(caps);

    expect(backend).toBeInstanceOf(Renderer);
    expect(mockState.callCount).toBe(0);
  });
});
