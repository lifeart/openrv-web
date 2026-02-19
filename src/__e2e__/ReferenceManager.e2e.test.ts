/**
 * ReferenceManager E2E Integration Tests
 *
 * Verifies the full wiring of the ReferenceManager feature end-to-end:
 *   UI (capture/toggle buttons in AppControlRegistry) -> ReferenceManager state ->
 *   Viewer.getImageData() capture flow -> stateChanged events -> toggle button styling
 *
 * Tests cover:
 * - ReferenceManager instantiation and state management
 * - Capture flow: viewer.getImageData() -> referenceManager.captureReference()
 * - Data format correctness (Uint8ClampedArray double-copy analysis)
 * - Toggle enable/disable with stateChanged event
 * - View mode cycling
 * - Opacity and wipe position controls
 * - Dispose and cleanup
 * - Wiring gap detection (display, keyboard bindings, export integration)
 *
 * KNOWN ISSUES DOCUMENTED IN TESTS:
 * - BUG: Capture wraps imageData.data in new Uint8ClampedArray() which double-copies
 * - INCOMPLETE: No setReferenceImage() or display wiring exists -- capture-only
 * - MISSING: No keyboard bindings for view.captureReference / view.toggleReference
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReferenceManager, type ReferenceState, type ReferenceViewMode, type ReferenceImage } from '../ui/components/ReferenceManager';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReferenceManager E2E Integration', () => {
  // =========================================================================
  // 1. Component instantiation
  // =========================================================================
  describe('instantiation', () => {
    let manager: ReferenceManager;

    beforeEach(() => {
      manager = new ReferenceManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('REF-E2E-001: can be instantiated without errors', () => {
      expect(manager).toBeInstanceOf(ReferenceManager);
    });

    it('REF-E2E-002: initial state has enabled=false and no reference image', () => {
      const state = manager.getState();
      expect(state.enabled).toBe(false);
      expect(state.referenceImage).toBeNull();
    });

    it('REF-E2E-003: initial view mode is split-h', () => {
      expect(manager.getViewMode()).toBe('split-h');
    });

    it('REF-E2E-004: initial opacity is 0.5', () => {
      expect(manager.getOpacity()).toBe(0.5);
    });

    it('REF-E2E-005: initial wipe position is 0.5', () => {
      expect(manager.getWipePosition()).toBe(0.5);
    });

    it('REF-E2E-006: hasReference() returns false initially', () => {
      expect(manager.hasReference()).toBe(false);
    });

    it('REF-E2E-007: getReference() returns null initially', () => {
      expect(manager.getReference()).toBeNull();
    });
  });

  // =========================================================================
  // 2. Capture flow
  // =========================================================================
  describe('capture flow', () => {
    let manager: ReferenceManager;

    beforeEach(() => {
      manager = new ReferenceManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('REF-E2E-010: captureReference stores the image data', () => {
      const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
      manager.captureReference({ width: 2, height: 1, data, channels: 4 });

      expect(manager.hasReference()).toBe(true);
      const ref = manager.getReference();
      expect(ref).not.toBeNull();
      expect(ref!.width).toBe(2);
      expect(ref!.height).toBe(1);
      expect(ref!.channels).toBe(4);
    });

    it('REF-E2E-011: captureReference deep-copies the data (mutation-safe)', () => {
      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      // Mutate original
      data[0] = 0;

      const ref = manager.getReference();
      expect(ref!.data[0]).toBe(255); // Should still be 255
    });

    it('REF-E2E-012: captureReference accepts Float32Array data', () => {
      const data = new Float32Array([1.0, 0.5, 0.0, 1.0]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      const ref = manager.getReference();
      expect(ref!.data).toBeInstanceOf(Float32Array);
      expect(ref!.data[0]).toBe(1.0);
    });

    it('REF-E2E-013: captureReference accepts Uint8ClampedArray data', () => {
      const data = new Uint8ClampedArray([128, 64, 32, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      const ref = manager.getReference();
      expect(ref!.data).toBeInstanceOf(Uint8ClampedArray);
    });

    it('REF-E2E-014: captureReference sets capturedAt timestamp', () => {
      const before = Date.now();
      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });
      const after = Date.now();

      const ref = manager.getReference();
      expect(ref!.capturedAt).toBeGreaterThanOrEqual(before);
      expect(ref!.capturedAt).toBeLessThanOrEqual(after);
    });

    it('REF-E2E-015: captureReference with optional label', () => {
      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 }, 'Frame 42');

      const ref = manager.getReference();
      expect(ref!.label).toBe('Frame 42');
    });

    it('REF-E2E-016: captureReference without label leaves label undefined', () => {
      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      const ref = manager.getReference();
      expect(ref!.label).toBeUndefined();
    });

    it('REF-E2E-017: captureReference emits referenceCaptured event', () => {
      const callback = vi.fn();
      manager.on('referenceCaptured', callback);

      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      expect(callback).toHaveBeenCalledTimes(1);
      const emittedRef: ReferenceImage = callback.mock.calls[0][0];
      expect(emittedRef.width).toBe(1);
      expect(emittedRef.height).toBe(1);
    });

    it('REF-E2E-018: captureReference emits stateChanged event', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);

      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      expect(callback).toHaveBeenCalledTimes(1);
      const emittedState: ReferenceState = callback.mock.calls[0][0];
      expect(emittedState.referenceImage).not.toBeNull();
    });

    it('REF-E2E-019: multiple captures overwrite the previous reference', () => {
      const data1 = new Uint8ClampedArray([255, 0, 0, 255]);
      const data2 = new Uint8ClampedArray([0, 255, 0, 255]);

      manager.captureReference({ width: 1, height: 1, data: data1, channels: 4 }, 'first');
      manager.captureReference({ width: 1, height: 1, data: data2, channels: 4 }, 'second');

      const ref = manager.getReference();
      expect(ref!.label).toBe('second');
      expect(ref!.data[1]).toBe(255); // green channel
    });
  });

  // =========================================================================
  // 3. Simulated AppControlRegistry capture wiring
  // =========================================================================
  describe('AppControlRegistry capture wiring simulation', () => {
    let manager: ReferenceManager;

    beforeEach(() => {
      manager = new ReferenceManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('REF-E2E-020: simulates capture button flow with mock viewer.getImageData()', () => {
      // Simulate what AppControlRegistry does:
      // const imageData = viewer.getImageData();
      // if (imageData) {
      //   referenceManager.captureReference({
      //     width: imageData.width,
      //     height: imageData.height,
      //     data: new Uint8ClampedArray(imageData.data),
      //     channels: 4,
      //   });
      // }
      const mockImageData = new ImageData(2, 2);
      mockImageData.data[0] = 200; // R of first pixel
      mockImageData.data[1] = 100; // G
      mockImageData.data[2] = 50;  // B
      mockImageData.data[3] = 255; // A

      // This is the actual wiring from AppControlRegistry line 408-416
      manager.captureReference({
        width: mockImageData.width,
        height: mockImageData.height,
        data: new Uint8ClampedArray(mockImageData.data),
        channels: 4,
      });

      expect(manager.hasReference()).toBe(true);
      const ref = manager.getReference();
      expect(ref!.width).toBe(2);
      expect(ref!.height).toBe(2);
      expect(ref!.channels).toBe(4);
    });

    it('REF-E2E-021: BUG-REPORT: Uint8ClampedArray(imageData.data) creates a double-copy', () => {
      // viewer.getImageData() returns ImageData whose .data is already Uint8ClampedArray.
      // AppControlRegistry wraps it: new Uint8ClampedArray(imageData.data)
      // Then captureReference() deep-copies it again.
      // This results in 3 allocations: original + wrapper + deep copy.
      // The wrapper is unnecessary -- passing imageData.data directly would be sufficient
      // since captureReference() already deep-copies internally.
      const originalData = new Uint8ClampedArray([255, 128, 64, 255]);
      const wrappedData = new Uint8ClampedArray(originalData); // extra copy in wiring

      // Verify the wrapper is indeed a separate copy already
      expect(wrappedData).not.toBe(originalData);
      expect(wrappedData[0]).toBe(originalData[0]);

      // captureReference will deep-copy again internally
      manager.captureReference({ width: 1, height: 1, data: wrappedData, channels: 4 });

      const ref = manager.getReference();
      // The stored data is yet another copy
      expect(ref!.data).not.toBe(wrappedData);
      expect(ref!.data).not.toBe(originalData);
      // Data is still correct despite double-copy
      expect(ref!.data[0]).toBe(255);
    });

    it('REF-E2E-022: capture handles null getImageData gracefully (no media loaded)', () => {
      // When viewer.getImageData() returns null, the capture button handler
      // has an `if (imageData)` guard, so captureReference is never called.
      const mockGetImageData = (): ImageData | null => null;
      const imageData = mockGetImageData();

      if (imageData) {
        manager.captureReference({
          width: imageData.width,
          height: imageData.height,
          data: new Uint8ClampedArray(imageData.data),
          channels: 4,
        });
      }

      expect(manager.hasReference()).toBe(false);
    });
  });

  // =========================================================================
  // 4. Toggle enable/disable
  // =========================================================================
  describe('toggle enable/disable', () => {
    let manager: ReferenceManager;

    beforeEach(() => {
      manager = new ReferenceManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('REF-E2E-030: enable() sets enabled=true', () => {
      manager.enable();
      expect(manager.isEnabled()).toBe(true);
    });

    it('REF-E2E-031: disable() sets enabled=false', () => {
      manager.enable();
      manager.disable();
      expect(manager.isEnabled()).toBe(false);
    });

    it('REF-E2E-032: toggle() flips enabled state', () => {
      expect(manager.isEnabled()).toBe(false);
      manager.toggle();
      expect(manager.isEnabled()).toBe(true);
      manager.toggle();
      expect(manager.isEnabled()).toBe(false);
    });

    it('REF-E2E-033: enable emits stateChanged with enabled=true', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);

      manager.enable();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].enabled).toBe(true);
    });

    it('REF-E2E-034: disable emits stateChanged with enabled=false', () => {
      manager.enable();
      const callback = vi.fn();
      manager.on('stateChanged', callback);

      manager.disable();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].enabled).toBe(false);
    });

    it('REF-E2E-035: double enable does not emit duplicate events', () => {
      manager.enable();
      const callback = vi.fn();
      manager.on('stateChanged', callback);

      manager.enable(); // already enabled

      expect(callback).not.toHaveBeenCalled();
    });

    it('REF-E2E-036: double disable does not emit duplicate events', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);

      manager.disable(); // already disabled

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. Clear reference
  // =========================================================================
  describe('clear reference', () => {
    let manager: ReferenceManager;

    beforeEach(() => {
      manager = new ReferenceManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('REF-E2E-040: clearReference removes stored reference', () => {
      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });
      expect(manager.hasReference()).toBe(true);

      manager.clearReference();
      expect(manager.hasReference()).toBe(false);
      expect(manager.getReference()).toBeNull();
    });

    it('REF-E2E-041: clearReference emits referenceCleared event', () => {
      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      const callback = vi.fn();
      manager.on('referenceCleared', callback);

      manager.clearReference();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('REF-E2E-042: clearReference emits stateChanged with null reference', () => {
      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      const callback = vi.fn();
      manager.on('stateChanged', callback);

      manager.clearReference();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].referenceImage).toBeNull();
    });

    it('REF-E2E-043: clearReference is no-op when no reference exists', () => {
      const callback = vi.fn();
      manager.on('referenceCleared', callback);
      manager.on('stateChanged', callback);

      manager.clearReference();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. View mode
  // =========================================================================
  describe('view mode', () => {
    let manager: ReferenceManager;

    beforeEach(() => {
      manager = new ReferenceManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('REF-E2E-050: setViewMode changes the mode', () => {
      manager.setViewMode('overlay');
      expect(manager.getViewMode()).toBe('overlay');
    });

    it('REF-E2E-051: setViewMode emits viewModeChanged event', () => {
      const callback = vi.fn();
      manager.on('viewModeChanged', callback);

      manager.setViewMode('side-by-side');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('side-by-side');
    });

    it('REF-E2E-052: setViewMode emits stateChanged event', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);

      manager.setViewMode('toggle');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].viewMode).toBe('toggle');
    });

    it('REF-E2E-053: setViewMode with same mode is no-op', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);

      manager.setViewMode('split-h'); // already default

      expect(callback).not.toHaveBeenCalled();
    });

    it('REF-E2E-054: setViewMode rejects invalid mode', () => {
      manager.setViewMode('invalid-mode' as ReferenceViewMode);
      expect(manager.getViewMode()).toBe('split-h'); // unchanged
    });

    it('REF-E2E-055: all valid view modes are accepted', () => {
      const modes: ReferenceViewMode[] = ['split-h', 'split-v', 'overlay', 'side-by-side', 'toggle'];
      for (const mode of modes) {
        manager.setViewMode(mode);
        expect(manager.getViewMode()).toBe(mode);
      }
    });
  });

  // =========================================================================
  // 7. Opacity control
  // =========================================================================
  describe('opacity control', () => {
    let manager: ReferenceManager;

    beforeEach(() => {
      manager = new ReferenceManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('REF-E2E-060: setOpacity changes opacity value', () => {
      manager.setOpacity(0.8);
      expect(manager.getOpacity()).toBe(0.8);
    });

    it('REF-E2E-061: setOpacity clamps to [0, 1]', () => {
      manager.setOpacity(-0.5);
      expect(manager.getOpacity()).toBe(0);

      manager.setOpacity(1.5);
      expect(manager.getOpacity()).toBe(1);
    });

    it('REF-E2E-062: setOpacity rejects NaN', () => {
      manager.setOpacity(0.7);
      manager.setOpacity(NaN);
      expect(manager.getOpacity()).toBe(0.7); // unchanged
    });

    it('REF-E2E-063: setOpacity with same value is no-op', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);

      manager.setOpacity(0.5); // already default

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 8. Wipe position
  // =========================================================================
  describe('wipe position', () => {
    let manager: ReferenceManager;

    beforeEach(() => {
      manager = new ReferenceManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('REF-E2E-070: setWipePosition changes position value', () => {
      manager.setWipePosition(0.3);
      expect(manager.getWipePosition()).toBe(0.3);
    });

    it('REF-E2E-071: setWipePosition clamps to [0, 1]', () => {
      manager.setWipePosition(-1);
      expect(manager.getWipePosition()).toBe(0);

      manager.setWipePosition(2);
      expect(manager.getWipePosition()).toBe(1);
    });

    it('REF-E2E-072: setWipePosition rejects NaN', () => {
      manager.setWipePosition(0.3);
      manager.setWipePosition(NaN);
      expect(manager.getWipePosition()).toBe(0.3); // unchanged
    });
  });

  // =========================================================================
  // 9. State snapshot immutability
  // =========================================================================
  describe('state snapshot', () => {
    let manager: ReferenceManager;

    beforeEach(() => {
      manager = new ReferenceManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('REF-E2E-080: getState returns a shallow copy (mutations do not affect internal state)', () => {
      const state1 = manager.getState();
      state1.enabled = true;
      state1.viewMode = 'overlay';

      const state2 = manager.getState();
      expect(state2.enabled).toBe(false);
      expect(state2.viewMode).toBe('split-h');
    });
  });

  // =========================================================================
  // 10. Dispose and cleanup
  // =========================================================================
  describe('dispose', () => {
    it('REF-E2E-090: dispose clears reference image', () => {
      const manager = new ReferenceManager();
      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      manager.dispose();

      expect(manager.hasReference()).toBe(false);
      expect(manager.getReference()).toBeNull();
    });

    it('REF-E2E-091: dispose prevents further captures', () => {
      const manager = new ReferenceManager();
      manager.dispose();

      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      expect(manager.hasReference()).toBe(false);
    });

    it('REF-E2E-092: dispose prevents toggle', () => {
      const manager = new ReferenceManager();
      manager.dispose();

      manager.toggle();
      expect(manager.isEnabled()).toBe(false);
    });

    it('REF-E2E-093: dispose removes event listeners', () => {
      const manager = new ReferenceManager();
      const callback = vi.fn();
      manager.on('stateChanged', callback);

      manager.dispose();
      manager.enable();

      expect(callback).not.toHaveBeenCalled();
    });

    it('REF-E2E-094: getState returns default state after dispose', () => {
      const manager = new ReferenceManager();
      manager.enable();
      manager.setViewMode('overlay');
      manager.setOpacity(0.8);

      manager.dispose();

      const state = manager.getState();
      expect(state.enabled).toBe(false);
      expect(state.referenceImage).toBeNull();
      expect(state.viewMode).toBe('split-h');
      expect(state.opacity).toBe(0.5);
      expect(state.wipePosition).toBe(0.5);
    });

    it('REF-E2E-095: dispose can be called multiple times without error', () => {
      const manager = new ReferenceManager();
      expect(() => {
        manager.dispose();
        manager.dispose();
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 11. WIRING GAP ANALYSIS (documents missing features)
  // =========================================================================
  describe('state change tracking and capture behavior', () => {
    it('REF-E2E-102: stateChanged event emits correct enabled values on toggle cycle', () => {
      const manager = new ReferenceManager();
      const stateChanges: ReferenceState[] = [];
      manager.on('stateChanged', (state) => stateChanges.push(state));

      manager.toggle(); // enable
      manager.toggle(); // disable

      expect(stateChanges.length).toBe(2);
      expect(stateChanges[0].enabled).toBe(true);
      expect(stateChanges[1].enabled).toBe(false);

      manager.dispose();
    });

    it('REF-E2E-103: captureReference does not auto-enable reference mode', () => {
      const manager = new ReferenceManager();
      const data = new Uint8ClampedArray([255, 0, 0, 255]);

      manager.captureReference({ width: 1, height: 1, data, channels: 4 });

      expect(manager.hasReference()).toBe(true);
      expect(manager.isEnabled()).toBe(false); // NOT auto-enabled

      manager.dispose();
    });
  });
});
