/**
 * Tests for the WebGPU stage pipeline feature flag (MED-55 Phase 4-pre).
 *
 * Test ID prefix: FF-
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWebGPUBackendMode,
  isWebGPUEnabled,
  isWebGPUStagesEnabled,
  setWebGPUBackendModeForTest,
} from './featureFlag';

const STORAGE_KEY = 'openrv:webgpu-stages-flag';

/**
 * Stub `window.location` for the duration of a test by replacing the
 * `location.search` getter. Vitest's jsdom env gives us a real Location
 * object that can be reconfigured per-test.
 */
function setLocationSearch(search: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search },
  });
}

describe('WebGPU stage pipeline feature flag', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // Always start each test with no URL search and a clean localStorage entry.
    setLocationSearch('');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  it("FF-001: default mode is 'disabled' when no URL or localStorage override is present", () => {
    expect(getWebGPUBackendMode()).toBe('disabled');
    expect(isWebGPUEnabled()).toBe(false);
    expect(isWebGPUStagesEnabled()).toBe(false);
  });

  it("FF-002: URL '?webgpu=stages' resolves to 'enabled-with-stages'", () => {
    setLocationSearch('?webgpu=stages');
    expect(getWebGPUBackendMode()).toBe('enabled-with-stages');
    expect(isWebGPUEnabled()).toBe(true);
    expect(isWebGPUStagesEnabled()).toBe(true);
  });

  it("FF-002b: URL '?webgpu=enabled-with-stages' (long form) resolves to 'enabled-with-stages'", () => {
    setLocationSearch('?webgpu=enabled-with-stages');
    expect(getWebGPUBackendMode()).toBe('enabled-with-stages');
  });

  it("FF-003: URL '?webgpu=no-stages' resolves to 'enabled-no-stages'", () => {
    setLocationSearch('?webgpu=no-stages');
    expect(getWebGPUBackendMode()).toBe('enabled-no-stages');
    expect(isWebGPUEnabled()).toBe(true);
    expect(isWebGPUStagesEnabled()).toBe(false);
  });

  it("FF-003b: URL '?webgpu=enabled-no-stages' (long form) resolves to 'enabled-no-stages'", () => {
    setLocationSearch('?webgpu=enabled-no-stages');
    expect(getWebGPUBackendMode()).toBe('enabled-no-stages');
  });

  it.each(['off', 'disabled', '0'])("FF-004: URL '?webgpu=%s' resolves to 'disabled'", (value) => {
    setLocationSearch(`?webgpu=${value}`);
    expect(getWebGPUBackendMode()).toBe('disabled');
    expect(isWebGPUEnabled()).toBe(false);
  });

  it('FF-005: localStorage value persists across reads when no URL override is present', () => {
    setWebGPUBackendModeForTest('enabled-no-stages');
    expect(getWebGPUBackendMode()).toBe('enabled-no-stages');
    // Second call reads the same stored value.
    expect(getWebGPUBackendMode()).toBe('enabled-no-stages');

    setWebGPUBackendModeForTest('enabled-with-stages');
    expect(getWebGPUBackendMode()).toBe('enabled-with-stages');
    expect(isWebGPUStagesEnabled()).toBe(true);
  });

  it('FF-006: URL beats localStorage when both are set', () => {
    // Pre-set localStorage to enabled-with-stages...
    setWebGPUBackendModeForTest('enabled-with-stages');
    // ...then a URL parameter saying "off" must take precedence.
    setLocationSearch('?webgpu=off');
    expect(getWebGPUBackendMode()).toBe('disabled');
    expect(isWebGPUEnabled()).toBe(false);
  });

  it('FF-006b: URL beats localStorage in the opposite direction (URL=stages, ls=disabled)', () => {
    setWebGPUBackendModeForTest('disabled');
    setLocationSearch('?webgpu=stages');
    expect(getWebGPUBackendMode()).toBe('enabled-with-stages');
  });

  it('FF-007: malformed URL value falls through to localStorage / default', () => {
    setLocationSearch('?webgpu=notavalue');
    // No localStorage set → default.
    expect(getWebGPUBackendMode()).toBe('disabled');

    // With localStorage set → URL is ignored, localStorage wins (since URL is malformed).
    setWebGPUBackendModeForTest('enabled-no-stages');
    expect(getWebGPUBackendMode()).toBe('enabled-no-stages');
  });

  it('FF-007b: malformed localStorage value also falls through to default', () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'garbage-value');
    } catch {
      // ignore
    }
    expect(getWebGPUBackendMode()).toBe('disabled');
  });

  it('FF-008: setWebGPUBackendModeForTest(null) clears localStorage', () => {
    setWebGPUBackendModeForTest('enabled-with-stages');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('enabled-with-stages');

    setWebGPUBackendModeForTest(null);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getWebGPUBackendMode()).toBe('disabled');
  });

  it('FF-009: localStorage read failure does not throw (sandboxed-context safety)', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage access denied');
    });
    expect(() => getWebGPUBackendMode()).not.toThrow();
    expect(getWebGPUBackendMode()).toBe('disabled');
    getItemSpy.mockRestore();
  });
});
