import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ReferenceManager,
  ReferenceImage,
  ReferenceState,
  ReferenceViewMode,
} from './ReferenceManager';

describe('ReferenceManager', () => {
  let mgr: ReferenceManager;

  /** Helper: create a small test image payload */
  function makeImage(channels = 4) {
    return {
      width: 2,
      height: 2,
      data: new Float32Array(2 * 2 * channels),
      channels,
    };
  }

  beforeEach(() => {
    mgr = new ReferenceManager();
  });

  // ===========================================================================
  // 1. Construction & defaults
  // ===========================================================================

  it('REF-001: constructor creates instance with default state', () => {
    const state = mgr.getState();
    expect(state.enabled).toBe(false);
    expect(state.referenceImage).toBeNull();
    expect(state.viewMode).toBe('split-h');
    expect(state.opacity).toBe(0.5);
    expect(state.wipePosition).toBe(0.5);
  });

  // ===========================================================================
  // 2. captureReference
  // ===========================================================================

  it('REF-002: captureReference stores image data as copy', () => {
    const img = makeImage();
    img.data[0] = 1.0;

    mgr.captureReference(img);

    const ref = mgr.getReference()!;
    expect(ref).not.toBeNull();
    expect(ref.width).toBe(2);
    expect(ref.height).toBe(2);
    expect(ref.channels).toBe(4);
    expect(ref.data[0]).toBe(1.0);

    // Mutate the original — reference should be independent
    img.data[0] = 999;
    expect(ref.data[0]).toBe(1.0);
  });

  it('REF-003: captureReference emits referenceCaptured event', () => {
    const spy = vi.fn();
    mgr.on('referenceCaptured', spy);

    mgr.captureReference(makeImage());

    expect(spy).toHaveBeenCalledTimes(1);
    const captured: ReferenceImage = spy.mock.calls[0][0];
    expect(captured.width).toBe(2);
    expect(captured.height).toBe(2);
  });

  it('REF-018: captureReference with label stores label', () => {
    mgr.captureReference(makeImage(), 'hero-shot');

    const ref = mgr.getReference()!;
    expect(ref.label).toBe('hero-shot');
  });

  it('REF-019: captureReference records capturedAt timestamp', () => {
    const before = Date.now();
    mgr.captureReference(makeImage());
    const after = Date.now();

    const ref = mgr.getReference()!;
    expect(ref.capturedAt).toBeGreaterThanOrEqual(before);
    expect(ref.capturedAt).toBeLessThanOrEqual(after);
  });

  it('REF-002b: captureReference copies Uint8ClampedArray data', () => {
    const img = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(2 * 2 * 4),
      channels: 4,
    };
    img.data[0] = 128;

    mgr.captureReference(img);

    const ref = mgr.getReference()!;
    expect(ref.data[0]).toBe(128);
    expect(ref.data).toBeInstanceOf(Uint8ClampedArray);

    // Mutate original
    img.data[0] = 0;
    expect(ref.data[0]).toBe(128);
  });

  // ===========================================================================
  // 3. clearReference
  // ===========================================================================

  it('REF-004: clearReference removes stored reference', () => {
    mgr.captureReference(makeImage());
    expect(mgr.hasReference()).toBe(true);

    mgr.clearReference();
    expect(mgr.hasReference()).toBe(false);
    expect(mgr.getReference()).toBeNull();
  });

  it('REF-005: clearReference emits referenceCleared event', () => {
    mgr.captureReference(makeImage());

    const spy = vi.fn();
    mgr.on('referenceCleared', spy);

    mgr.clearReference();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('REF-020: clearReference when no reference is a no-op (no event)', () => {
    const spy = vi.fn();
    mgr.on('referenceCleared', spy);

    mgr.clearReference();
    expect(spy).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // 4. hasReference / getReference
  // ===========================================================================

  it('REF-006: hasReference returns correct boolean', () => {
    expect(mgr.hasReference()).toBe(false);
    mgr.captureReference(makeImage());
    expect(mgr.hasReference()).toBe(true);
    mgr.clearReference();
    expect(mgr.hasReference()).toBe(false);
  });

  it('REF-007: getReference returns null when no reference', () => {
    expect(mgr.getReference()).toBeNull();
  });

  // ===========================================================================
  // 5. enable / disable / toggle / isEnabled
  // ===========================================================================

  it('REF-008: enable/disable/toggle/isEnabled work correctly', () => {
    expect(mgr.isEnabled()).toBe(false);

    mgr.enable();
    expect(mgr.isEnabled()).toBe(true);

    mgr.disable();
    expect(mgr.isEnabled()).toBe(false);

    mgr.toggle();
    expect(mgr.isEnabled()).toBe(true);

    mgr.toggle();
    expect(mgr.isEnabled()).toBe(false);
  });

  it('REF-009: enable emits stateChanged', () => {
    const spy = vi.fn();
    mgr.on('stateChanged', spy);

    mgr.enable();
    expect(spy).toHaveBeenCalledTimes(1);
    const emitted: ReferenceState = spy.mock.calls[0][0];
    expect(emitted.enabled).toBe(true);
  });

  it('REF-009b: disable emits stateChanged', () => {
    mgr.enable();

    const spy = vi.fn();
    mgr.on('stateChanged', spy);

    mgr.disable();
    expect(spy).toHaveBeenCalledTimes(1);
    const emitted: ReferenceState = spy.mock.calls[0][0];
    expect(emitted.enabled).toBe(false);
  });

  it('REF-009c: enable when already enabled is a no-op', () => {
    mgr.enable();

    const spy = vi.fn();
    mgr.on('stateChanged', spy);

    mgr.enable(); // no change
    expect(spy).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // 6. View mode
  // ===========================================================================

  it('REF-010: setViewMode changes mode and emits viewModeChanged', () => {
    const modeSpy = vi.fn();
    const stateSpy = vi.fn();
    mgr.on('viewModeChanged', modeSpy);
    mgr.on('stateChanged', stateSpy);

    mgr.setViewMode('overlay');

    expect(mgr.getViewMode()).toBe('overlay');
    expect(modeSpy).toHaveBeenCalledWith('overlay');
    expect(stateSpy).toHaveBeenCalledTimes(1);
  });

  it('REF-011: setViewMode validates input (rejects invalid modes)', () => {
    mgr.setViewMode('not-a-mode' as ReferenceViewMode);
    expect(mgr.getViewMode()).toBe('split-h'); // unchanged
  });

  it('REF-010b: setViewMode no-ops on same mode', () => {
    const spy = vi.fn();
    mgr.on('viewModeChanged', spy);

    mgr.setViewMode('split-h'); // already default
    expect(spy).not.toHaveBeenCalled();
  });

  it('REF-010c: all valid view modes are accepted', () => {
    const modes: ReferenceViewMode[] = ['split-h', 'split-v', 'overlay', 'side-by-side', 'toggle'];
    for (const mode of modes) {
      mgr.setViewMode(mode);
      expect(mgr.getViewMode()).toBe(mode);
    }
  });

  // ===========================================================================
  // 7. Opacity
  // ===========================================================================

  it('REF-012: setOpacity clamps to 0-1 range', () => {
    mgr.setOpacity(-0.5);
    expect(mgr.getOpacity()).toBe(0);

    mgr.setOpacity(1.5);
    expect(mgr.getOpacity()).toBe(1);

    mgr.setOpacity(0.75);
    expect(mgr.getOpacity()).toBe(0.75);
  });

  it('REF-021: setOpacity NaN guard defaults to current value', () => {
    mgr.setOpacity(0.8);
    mgr.setOpacity(NaN);
    expect(mgr.getOpacity()).toBe(0.8);
  });

  // ===========================================================================
  // 8. Wipe position
  // ===========================================================================

  it('REF-013: setWipePosition clamps to 0-1 range', () => {
    mgr.setWipePosition(-1);
    expect(mgr.getWipePosition()).toBe(0);

    mgr.setWipePosition(2);
    expect(mgr.getWipePosition()).toBe(1);

    mgr.setWipePosition(0.3);
    expect(mgr.getWipePosition()).toBe(0.3);
  });

  it('REF-013b: setWipePosition NaN guard', () => {
    mgr.setWipePosition(0.6);
    mgr.setWipePosition(NaN);
    expect(mgr.getWipePosition()).toBe(0.6);
  });

  // ===========================================================================
  // 9. getState
  // ===========================================================================

  it('REF-014: getState returns complete state snapshot', () => {
    mgr.captureReference(makeImage(), 'test');
    mgr.enable();
    mgr.setViewMode('overlay');
    mgr.setOpacity(0.7);
    mgr.setWipePosition(0.3);

    const state = mgr.getState();
    expect(state.enabled).toBe(true);
    expect(state.referenceImage).not.toBeNull();
    expect(state.referenceImage!.label).toBe('test');
    expect(state.viewMode).toBe('overlay');
    expect(state.opacity).toBe(0.7);
    expect(state.wipePosition).toBe(0.3);
  });

  it('REF-014b: getState returns a shallow copy (not internal reference)', () => {
    const s1 = mgr.getState();
    const s2 = mgr.getState();
    expect(s1).not.toBe(s2);
    expect(s1).toEqual(s2);
  });

  // ===========================================================================
  // 10. Reference persistence across enable/disable
  // ===========================================================================

  it('REF-015: reference survives enable/disable toggle (persists)', () => {
    mgr.captureReference(makeImage(), 'keeper');
    mgr.enable();
    mgr.disable();
    mgr.enable();

    expect(mgr.hasReference()).toBe(true);
    expect(mgr.getReference()!.label).toBe('keeper');
  });

  // ===========================================================================
  // 11. Dispose
  // ===========================================================================

  it('REF-016: dispose clears reference and listeners', () => {
    mgr.captureReference(makeImage());
    const spy = vi.fn();
    mgr.on('stateChanged', spy);

    mgr.dispose();

    // Reference cleared
    expect(mgr.hasReference()).toBe(false);
    expect(mgr.getReference()).toBeNull();

    // Listeners removed — emitting should not call spy
    mgr.emit('stateChanged', mgr.getState());
    expect(spy).not.toHaveBeenCalled();
  });

  it('REF-017: methods are no-ops after dispose', () => {
    mgr.dispose();

    // All mutating methods should be silent no-ops
    mgr.captureReference(makeImage());
    expect(mgr.hasReference()).toBe(false);

    mgr.enable();
    expect(mgr.isEnabled()).toBe(false);

    mgr.setViewMode('overlay');
    expect(mgr.getViewMode()).toBe('split-h');

    mgr.setOpacity(0.9);
    // opacity getter returns internal state which is still default after dispose
    expect(mgr.getOpacity()).toBe(0.5);

    mgr.setWipePosition(0.9);
    expect(mgr.getWipePosition()).toBe(0.5);

    mgr.clearReference(); // should not throw
    mgr.toggle(); // should not throw
  });

  it('REF-022: double dispose is safe', () => {
    mgr.dispose();
    expect(() => mgr.dispose()).not.toThrow();
  });

  // ===========================================================================
  // 13. Replace existing reference
  // ===========================================================================

  it('REF-023: captureReference replaces existing reference', () => {
    const img1 = makeImage();
    img1.data[0] = 1.0;
    mgr.captureReference(img1, 'first');

    const img2 = makeImage();
    img2.data[0] = 2.0;
    mgr.captureReference(img2, 'second');

    const ref = mgr.getReference()!;
    expect(ref.label).toBe('second');
    expect(ref.data[0]).toBe(2.0);
  });

  // ===========================================================================
  // 14. setOpacity / setWipePosition no-op on same value
  // ===========================================================================

  it('REF-024: setOpacity does not emit when value unchanged', () => {
    mgr.setOpacity(0.75);

    const spy = vi.fn();
    mgr.on('stateChanged', spy);

    mgr.setOpacity(0.75); // same value
    expect(spy).not.toHaveBeenCalled();
  });

  it('REF-025: setWipePosition does not emit when value unchanged', () => {
    mgr.setWipePosition(0.3);

    const spy = vi.fn();
    mgr.on('stateChanged', spy);

    mgr.setWipePosition(0.3); // same value
    expect(spy).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // 15. Disposed getters return defaults
  // ===========================================================================

  it('REF-026: getViewMode returns default after dispose', () => {
    mgr.setViewMode('overlay');
    mgr.dispose();
    expect(mgr.getViewMode()).toBe('split-h');
  });

  it('REF-027: getOpacity returns default after dispose', () => {
    mgr.setOpacity(0.9);
    mgr.dispose();
    expect(mgr.getOpacity()).toBe(0.5);
  });

  it('REF-028: getWipePosition returns default after dispose', () => {
    mgr.setWipePosition(0.8);
    mgr.dispose();
    expect(mgr.getWipePosition()).toBe(0.5);
  });

  it('REF-029: getState returns defaults after dispose', () => {
    mgr.captureReference(makeImage(), 'test');
    mgr.enable();
    mgr.setViewMode('overlay');
    mgr.setOpacity(0.9);
    mgr.setWipePosition(0.2);

    mgr.dispose();

    const state = mgr.getState();
    expect(state.enabled).toBe(false);
    expect(state.referenceImage).toBeNull();
    expect(state.viewMode).toBe('split-h');
    expect(state.opacity).toBe(0.5);
    expect(state.wipePosition).toBe(0.5);
  });

  it('REF-009d: disable when already disabled is a no-op', () => {
    const spy = vi.fn();
    mgr.on('stateChanged', spy);

    mgr.disable(); // already disabled by default
    expect(spy).not.toHaveBeenCalled();
  });

  it('REF-024b: setOpacity does not emit when out-of-range clamps to current value', () => {
    mgr.setOpacity(0);

    const spy = vi.fn();
    mgr.on('stateChanged', spy);

    mgr.setOpacity(-10); // clamps to 0, same as current
    expect(spy).not.toHaveBeenCalled();
  });

  it('REF-025b: setWipePosition does not emit when out-of-range clamps to current value', () => {
    mgr.setWipePosition(1);

    const spy = vi.fn();
    mgr.on('stateChanged', spy);

    mgr.setWipePosition(5); // clamps to 1, same as current
    expect(spy).not.toHaveBeenCalled();
  });
});
