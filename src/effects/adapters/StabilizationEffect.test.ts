/**
 * StabilizationEffect Adapter Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { stabilizationEffect, StabilizationAdapter } from './StabilizationEffect';
import { EffectRegistry } from '../EffectRegistry';

function createTestImageData(width: number, height: number, fill?: number[]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0] ?? 128;
      data[i + 1] = fill[1] ?? 128;
      data[i + 2] = fill[2] ?? 128;
      data[i + 3] = fill[3] ?? 255;
    }
  }
  return new ImageData(data, width, height);
}

describe('StabilizationEffect', () => {
  it('has correct name, label, and category', () => {
    expect(stabilizationEffect.name).toBe('stabilization');
    expect(stabilizationEffect.label).toBe('Stabilization');
    expect(stabilizationEffect.category).toBe('spatial');
  });

  describe('isActive', () => {
    it('returns false when not enabled', () => {
      expect(stabilizationEffect.isActive({})).toBe(false);
      expect(stabilizationEffect.isActive({ stabilizationEnabled: false })).toBe(false);
    });

    it('returns false when enabled but no motion and no crop', () => {
      expect(stabilizationEffect.isActive({
        stabilizationEnabled: true,
        stabilizationDx: 0,
        stabilizationDy: 0,
        stabilizationCropAmount: 0,
      })).toBe(false);
    });

    it('returns true when enabled with non-zero dx', () => {
      expect(stabilizationEffect.isActive({
        stabilizationEnabled: true,
        stabilizationDx: 5,
        stabilizationDy: 0,
        stabilizationCropAmount: 0,
      })).toBe(true);
    });

    it('returns true when enabled with non-zero dy', () => {
      expect(stabilizationEffect.isActive({
        stabilizationEnabled: true,
        stabilizationDx: 0,
        stabilizationDy: -3,
        stabilizationCropAmount: 0,
      })).toBe(true);
    });

    it('returns true when enabled with cropAmount only', () => {
      expect(stabilizationEffect.isActive({
        stabilizationEnabled: true,
        stabilizationDx: 0,
        stabilizationDy: 0,
        stabilizationCropAmount: 4,
      })).toBe(true);
    });
  });

  describe('apply', () => {
    it('modifies pixel data when shift is applied', () => {
      const img = createTestImageData(16, 16, [128, 128, 128, 255]);
      const originalData = new Uint8ClampedArray(img.data);

      stabilizationEffect.apply(img, {
        stabilizationEnabled: true,
        stabilizationDx: 5,
        stabilizationDy: 3,
        stabilizationCropAmount: 0,
      });

      let changed = false;
      for (let i = 0; i < originalData.length; i++) {
        if (img.data[i] !== originalData[i]) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it('leaves pixel data unchanged with zero params', () => {
      const img = createTestImageData(16, 16, [128, 128, 128, 255]);
      const originalData = new Uint8ClampedArray(img.data);

      stabilizationEffect.apply(img, {
        stabilizationEnabled: false,
        stabilizationDx: 0,
        stabilizationDy: 0,
        stabilizationCropAmount: 0,
      });

      expect(img.data).toEqual(originalData);
    });

    it('applies crop when enabled with crop only', () => {
      const img = createTestImageData(16, 16, [200, 200, 200, 255]);

      stabilizationEffect.apply(img, {
        stabilizationEnabled: true,
        stabilizationDx: 0,
        stabilizationDy: 0,
        stabilizationCropAmount: 2,
      });

      // Corner pixel should be black (cropped)
      expect(img.data[0]).toBe(0);
      expect(img.data[1]).toBe(0);
      expect(img.data[2]).toBe(0);

      // Center pixel should be unchanged
      const center = (8 * 16 + 8) * 4;
      expect(img.data[center]).toBe(200);
    });

    it('handles missing params gracefully (defaults to zero)', () => {
      const img = createTestImageData(8, 8, [128, 128, 128, 255]);
      const originalData = new Uint8ClampedArray(img.data);

      // Call with empty params — should not crash
      stabilizationEffect.apply(img, {});
      expect(img.data).toEqual(originalData);
    });
  });

  describe('registry integration', () => {
    let registry: EffectRegistry;

    beforeEach(() => {
      registry = new EffectRegistry();
      registry.register(stabilizationEffect);
    });

    it('can be registered in EffectRegistry', () => {
      expect(registry.get('stabilization')).toBe(stabilizationEffect);
    });

    it('applies through applyAll', () => {
      const img = createTestImageData(16, 16, [128, 128, 128, 255]);
      const originalData = new Uint8ClampedArray(img.data);

      registry.applyAll(img, {
        stabilizationEnabled: true,
        stabilizationDx: 3,
        stabilizationDy: 0,
        stabilizationCropAmount: 0,
      });

      let changed = false;
      for (let i = 0; i < originalData.length; i++) {
        if (img.data[i] !== originalData[i]) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it('skips when inactive through applyAll', () => {
      const img = createTestImageData(16, 16, [128, 128, 128, 255]);
      const originalData = new Uint8ClampedArray(img.data);

      registry.applyAll(img, {
        stabilizationEnabled: false,
      });

      expect(img.data).toEqual(originalData);
    });
  });
});

// ===========================================================================
// StabilizationAdapter (stateful, motion estimation + smoothing)
// ===========================================================================

describe('StabilizationAdapter', () => {
  let adapter: StabilizationAdapter;

  beforeEach(() => {
    adapter = new StabilizationAdapter();
  });

  it('has correct name, label, and category', () => {
    expect(adapter.name).toBe('stabilization');
    expect(adapter.label).toBe('Stabilization');
    expect(adapter.category).toBe('spatial');
  });

  describe('isActive', () => {
    it('returns false when not enabled', () => {
      expect(adapter.isActive({})).toBe(false);
      expect(adapter.isActive({ stabilizationEnabled: false })).toBe(false);
    });

    it('returns true when enabled with autoMotion', () => {
      expect(adapter.isActive({
        stabilizationEnabled: true,
        stabilizationAutoMotion: true,
      })).toBe(true);
    });

    it('returns true when enabled with manual dx/dy', () => {
      expect(adapter.isActive({
        stabilizationEnabled: true,
        stabilizationDx: 5,
      })).toBe(true);
    });

    it('returns false when enabled without autoMotion and zero manual params', () => {
      expect(adapter.isActive({
        stabilizationEnabled: true,
        stabilizationAutoMotion: false,
        stabilizationDx: 0,
        stabilizationDy: 0,
        stabilizationCropAmount: 0,
      })).toBe(false);
    });
  });

  describe('manual mode (backward compatible)', () => {
    it('applies manual dx/dy shift', () => {
      const img = createTestImageData(16, 16, [128, 128, 128, 255]);
      const originalData = new Uint8ClampedArray(img.data);

      adapter.apply(img, {
        stabilizationEnabled: true,
        stabilizationDx: 5,
        stabilizationDy: 3,
        stabilizationCropAmount: 0,
      });

      let changed = false;
      for (let i = 0; i < originalData.length; i++) {
        if (img.data[i] !== originalData[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });

    it('leaves data unchanged with zero manual params', () => {
      const img = createTestImageData(16, 16, [128, 128, 128, 255]);
      const originalData = new Uint8ClampedArray(img.data);

      adapter.apply(img, {});
      expect(img.data).toEqual(originalData);
    });
  });

  describe('auto motion mode', () => {
    it('does not crash on first frame (no reference)', () => {
      const img = createTestImageData(64, 64, [128, 128, 128, 255]);

      expect(() => {
        adapter.apply(img, {
          stabilizationEnabled: true,
          stabilizationAutoMotion: true,
          stabilizationSmoothingStrength: 50,
          stabilizationCropAmount: 0,
        });
      }).not.toThrow();
    });

    it('increments frame index after each apply in auto mode', () => {
      expect(adapter.getFrameIndex()).toBe(0);

      const img1 = createTestImageData(64, 64, [128, 128, 128, 255]);
      adapter.apply(img1, {
        stabilizationEnabled: true,
        stabilizationAutoMotion: true,
      });
      expect(adapter.getFrameIndex()).toBe(1);

      const img2 = createTestImageData(64, 64, [130, 130, 130, 255]);
      adapter.apply(img2, {
        stabilizationEnabled: true,
        stabilizationAutoMotion: true,
      });
      expect(adapter.getFrameIndex()).toBe(2);
    });

    it('accumulates raw motion vectors', () => {
      expect(adapter.getRawVectors().length).toBe(0);

      const img1 = createTestImageData(64, 64, [128, 128, 128, 255]);
      adapter.apply(img1, {
        stabilizationEnabled: true,
        stabilizationAutoMotion: true,
      });
      expect(adapter.getRawVectors().length).toBe(1);
      // First frame with no reference should have confidence 0
      expect(adapter.getRawVectors()[0]!.confidence).toBe(0);

      const img2 = createTestImageData(64, 64, [128, 128, 128, 255]);
      adapter.apply(img2, {
        stabilizationEnabled: true,
        stabilizationAutoMotion: true,
      });
      expect(adapter.getRawVectors().length).toBe(2);
    });

    it('processes multiple frames without error', () => {
      for (let i = 0; i < 5; i++) {
        const val = 100 + i * 10;
        const img = createTestImageData(64, 64, [val, val, val, 255]);
        expect(() => {
          adapter.apply(img, {
            stabilizationEnabled: true,
            stabilizationAutoMotion: true,
            stabilizationSmoothingStrength: 50,
            stabilizationCropAmount: 4,
          });
        }).not.toThrow();
      }

      expect(adapter.getFrameIndex()).toBe(5);
      expect(adapter.getRawVectors().length).toBe(5);
    });
  });

  describe('reset', () => {
    it('resets frame index and vectors', () => {
      const img = createTestImageData(64, 64, [128, 128, 128, 255]);
      adapter.apply(img, {
        stabilizationEnabled: true,
        stabilizationAutoMotion: true,
      });

      expect(adapter.getFrameIndex()).toBe(1);
      expect(adapter.getRawVectors().length).toBe(1);

      adapter.reset();

      expect(adapter.getFrameIndex()).toBe(0);
      expect(adapter.getRawVectors().length).toBe(0);
    });

    it('can process new frames after reset', () => {
      const img1 = createTestImageData(64, 64, [128, 128, 128, 255]);
      adapter.apply(img1, {
        stabilizationEnabled: true,
        stabilizationAutoMotion: true,
      });

      adapter.reset();

      const img2 = createTestImageData(64, 64, [200, 200, 200, 255]);
      expect(() => {
        adapter.apply(img2, {
          stabilizationEnabled: true,
          stabilizationAutoMotion: true,
        });
      }).not.toThrow();

      expect(adapter.getFrameIndex()).toBe(1);
    });
  });

  describe('registry integration', () => {
    it('can be registered in EffectRegistry', () => {
      const registry = new EffectRegistry();
      registry.register(adapter);
      expect(registry.get('stabilization')).toBe(adapter);
    });
  });
});
