/**
 * Property Animation & Flags Unit Tests
 *
 * Tests the persistent/animatable flags and keyframe animation support
 * added to the Property system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Property, PropertyContainer, interpolateKeyframes, type Keyframe } from './Property';

describe('Property flags', () => {
  describe('persistent flag', () => {
    it('PAF-001: defaults to false', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 0,
      });
      expect(prop.persistent).toBe(false);
    });

    it('PAF-002: can be set to true', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 0,
        persistent: true,
      });
      expect(prop.persistent).toBe(true);
    });

    it('PAF-003: toJSON includes persistent flag when true', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 42,
        persistent: true,
      });
      const json = prop.toJSON();
      expect(json.persistent).toBe(true);
    });

    it('PAF-004: toJSON omits persistent flag when false', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 42,
      });
      const json = prop.toJSON();
      expect(json.persistent).toBeUndefined();
    });
  });

  describe('animatable flag', () => {
    it('PAF-010: defaults to false', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 0,
      });
      expect(prop.animatable).toBe(false);
    });

    it('PAF-011: can be set to true', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 0,
        animatable: true,
      });
      expect(prop.animatable).toBe(true);
    });

    it('PAF-012: toJSON includes animatable flag when true', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 0,
        animatable: true,
      });
      const json = prop.toJSON();
      expect(json.animatable).toBe(true);
    });
  });

  describe('both flags together', () => {
    it('PAF-020: supports both persistent and animatable', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 0,
        persistent: true,
        animatable: true,
      });
      expect(prop.persistent).toBe(true);
      expect(prop.animatable).toBe(true);
    });
  });
});

describe('Property keyframe animation', () => {
  let prop: Property<number>;

  beforeEach(() => {
    prop = new Property<number>({
      name: 'opacity',
      defaultValue: 1,
      min: 0,
      max: 1,
      animatable: true,
    });
  });

  describe('addKeyframe', () => {
    it('PKA-001: adds a keyframe', () => {
      prop.addKeyframe({ frame: 10, value: 0.5, interpolation: 'linear' });
      expect(prop.keyframes).toHaveLength(1);
      expect(prop.keyframes[0]!.frame).toBe(10);
      expect(prop.keyframes[0]!.value).toBe(0.5);
    });

    it('PKA-002: maintains sorted order by frame', () => {
      prop.addKeyframe({ frame: 30, value: 0, interpolation: 'linear' });
      prop.addKeyframe({ frame: 10, value: 1, interpolation: 'linear' });
      prop.addKeyframe({ frame: 20, value: 0.5, interpolation: 'linear' });

      expect(prop.keyframes[0]!.frame).toBe(10);
      expect(prop.keyframes[1]!.frame).toBe(20);
      expect(prop.keyframes[2]!.frame).toBe(30);
    });

    it('PKA-003: replaces existing keyframe at same frame', () => {
      prop.addKeyframe({ frame: 10, value: 0.5, interpolation: 'linear' });
      prop.addKeyframe({ frame: 10, value: 0.8, interpolation: 'step' });

      expect(prop.keyframes).toHaveLength(1);
      expect(prop.keyframes[0]!.value).toBe(0.8);
      expect(prop.keyframes[0]!.interpolation).toBe('step');
    });

    it('PKA-004: throws if property is not animatable', () => {
      const nonAnimatable = new Property<number>({
        name: 'test',
        defaultValue: 0,
        animatable: false,
      });

      expect(() => {
        nonAnimatable.addKeyframe({ frame: 1, value: 0, interpolation: 'linear' });
      }).toThrow('not animatable');
    });
  });

  describe('removeKeyframe', () => {
    it('PKA-010: removes keyframe at specified frame', () => {
      prop.addKeyframe({ frame: 10, value: 0.5, interpolation: 'linear' });
      prop.addKeyframe({ frame: 20, value: 0.8, interpolation: 'linear' });

      const removed = prop.removeKeyframe(10);
      expect(removed).toBe(true);
      expect(prop.keyframes).toHaveLength(1);
      expect(prop.keyframes[0]!.frame).toBe(20);
    });

    it('PKA-011: returns false when keyframe not found', () => {
      prop.addKeyframe({ frame: 10, value: 0.5, interpolation: 'linear' });

      const removed = prop.removeKeyframe(20);
      expect(removed).toBe(false);
      expect(prop.keyframes).toHaveLength(1);
    });
  });

  describe('clearKeyframes', () => {
    it('PKA-015: removes all keyframes', () => {
      prop.addKeyframe({ frame: 10, value: 0.5, interpolation: 'linear' });
      prop.addKeyframe({ frame: 20, value: 0.8, interpolation: 'linear' });
      prop.addKeyframe({ frame: 30, value: 0, interpolation: 'linear' });

      prop.clearKeyframes();
      expect(prop.keyframes).toHaveLength(0);
      expect(prop.hasKeyframes()).toBe(false);
    });
  });

  describe('hasKeyframes', () => {
    it('PKA-020: returns false when no keyframes', () => {
      expect(prop.hasKeyframes()).toBe(false);
    });

    it('PKA-021: returns true when keyframes exist', () => {
      prop.addKeyframe({ frame: 10, value: 0.5, interpolation: 'linear' });
      expect(prop.hasKeyframes()).toBe(true);
    });
  });

  describe('getAnimatedValue - linear interpolation', () => {
    beforeEach(() => {
      prop.addKeyframe({ frame: 0, value: 0, interpolation: 'linear' });
      prop.addKeyframe({ frame: 100, value: 1, interpolation: 'linear' });
    });

    it('PKA-030: returns value at first keyframe', () => {
      expect(prop.getAnimatedValue(0)).toBeCloseTo(0, 5);
    });

    it('PKA-031: returns value at last keyframe', () => {
      expect(prop.getAnimatedValue(100)).toBeCloseTo(1, 5);
    });

    it('PKA-032: interpolates linearly at midpoint', () => {
      expect(prop.getAnimatedValue(50)).toBeCloseTo(0.5, 5);
    });

    it('PKA-033: interpolates at quarter point', () => {
      expect(prop.getAnimatedValue(25)).toBeCloseTo(0.25, 5);
    });

    it('PKA-034: interpolates at three-quarter point', () => {
      expect(prop.getAnimatedValue(75)).toBeCloseTo(0.75, 5);
    });

    it('PKA-035: holds first value before first keyframe', () => {
      expect(prop.getAnimatedValue(-10)).toBeCloseTo(0, 5);
    });

    it('PKA-036: holds last value after last keyframe', () => {
      expect(prop.getAnimatedValue(200)).toBeCloseTo(1, 5);
    });
  });

  describe('getAnimatedValue - step interpolation', () => {
    beforeEach(() => {
      prop.addKeyframe({ frame: 0, value: 0, interpolation: 'step' });
      prop.addKeyframe({ frame: 100, value: 1, interpolation: 'step' });
    });

    it('PKA-040: holds value until next keyframe', () => {
      expect(prop.getAnimatedValue(0)).toBeCloseTo(0, 5);
      expect(prop.getAnimatedValue(50)).toBeCloseTo(0, 5);
      expect(prop.getAnimatedValue(99)).toBeCloseTo(0, 5);
    });

    it('PKA-041: jumps to next value at keyframe', () => {
      expect(prop.getAnimatedValue(100)).toBeCloseTo(1, 5);
    });
  });

  describe('getAnimatedValue - smooth interpolation', () => {
    beforeEach(() => {
      prop.addKeyframe({ frame: 0, value: 0, interpolation: 'smooth' });
      prop.addKeyframe({ frame: 100, value: 1, interpolation: 'smooth' });
    });

    it('PKA-050: returns exact values at keyframes', () => {
      expect(prop.getAnimatedValue(0)).toBeCloseTo(0, 5);
      expect(prop.getAnimatedValue(100)).toBeCloseTo(1, 5);
    });

    it('PKA-051: smoothstep at midpoint is 0.5', () => {
      // smoothstep(0.5) = 0.5^2 * (3 - 2*0.5) = 0.25 * 2 = 0.5
      expect(prop.getAnimatedValue(50)).toBeCloseTo(0.5, 5);
    });

    it('PKA-052: smooth interpolation differs from linear at quarter points', () => {
      const smoothVal = prop.getAnimatedValue(25);
      // smoothstep(0.25) = 0.0625 * 2.5 = 0.15625
      expect(smoothVal).toBeCloseTo(0.15625, 3);
      // Should be less than linear (0.25) at this point
      expect(smoothVal).toBeLessThan(0.25);
    });
  });

  describe('getAnimatedValue - multiple segments', () => {
    it('PKA-060: interpolates across multiple keyframes', () => {
      prop.addKeyframe({ frame: 0, value: 0, interpolation: 'linear' });
      prop.addKeyframe({ frame: 50, value: 1, interpolation: 'linear' });
      prop.addKeyframe({ frame: 100, value: 0, interpolation: 'linear' });

      expect(prop.getAnimatedValue(0)).toBeCloseTo(0, 5);
      expect(prop.getAnimatedValue(25)).toBeCloseTo(0.5, 5);
      expect(prop.getAnimatedValue(50)).toBeCloseTo(1, 5);
      expect(prop.getAnimatedValue(75)).toBeCloseTo(0.5, 5);
      expect(prop.getAnimatedValue(100)).toBeCloseTo(0, 5);
    });

    it('PKA-061: mixed interpolation modes between segments', () => {
      prop.addKeyframe({ frame: 0, value: 0, interpolation: 'linear' });
      prop.addKeyframe({ frame: 50, value: 1, interpolation: 'step' });
      prop.addKeyframe({ frame: 100, value: 0, interpolation: 'linear' });

      // First segment: linear 0->1
      expect(prop.getAnimatedValue(25)).toBeCloseTo(0.5, 5);

      // Second segment: step holds at 1
      expect(prop.getAnimatedValue(75)).toBeCloseTo(1, 5);
    });
  });

  describe('getAnimatedValue - no animation', () => {
    it('PKA-070: returns static value when no keyframes', () => {
      prop.value = 0.7;
      expect(prop.getAnimatedValue(50)).toBe(0.7);
    });

    it('PKA-071: returns static value when not animatable', () => {
      const nonAnimatable = new Property<number>({
        name: 'test',
        defaultValue: 42,
      });
      expect(nonAnimatable.getAnimatedValue(50)).toBe(42);
    });

    it('PKA-072: returns single keyframe value', () => {
      prop.addKeyframe({ frame: 50, value: 0.8, interpolation: 'linear' });

      // Before: returns first keyframe value
      expect(prop.getAnimatedValue(0)).toBeCloseTo(0.8, 5);
      // At: returns keyframe value
      expect(prop.getAnimatedValue(50)).toBeCloseTo(0.8, 5);
      // After: returns last keyframe value
      expect(prop.getAnimatedValue(100)).toBeCloseTo(0.8, 5);
    });
  });

  describe('toJSON with keyframes', () => {
    it('PKA-080: includes keyframes in serialization', () => {
      prop.addKeyframe({ frame: 0, value: 0, interpolation: 'linear' });
      prop.addKeyframe({ frame: 100, value: 1, interpolation: 'smooth' });

      const json = prop.toJSON();
      expect(json.animatable).toBe(true);
      expect(json.keyframes).toBeDefined();
      expect(json.keyframes).toHaveLength(2);
      expect(json.keyframes![0]).toEqual({ frame: 0, value: 0, interpolation: 'linear' });
      expect(json.keyframes![1]).toEqual({ frame: 100, value: 1, interpolation: 'smooth' });
    });

    it('PKA-081: omits keyframes when empty', () => {
      const json = prop.toJSON();
      expect(json.animatable).toBe(true);
      expect(json.keyframes).toBeUndefined();
    });
  });
});

describe('interpolateKeyframes', () => {
  it('IKF-001: linear interpolation at midpoint', () => {
    const prev: Keyframe = { frame: 0, value: 0, interpolation: 'linear' };
    const next: Keyframe = { frame: 100, value: 10, interpolation: 'linear' };

    expect(interpolateKeyframes(prev, next, 50)).toBeCloseTo(5, 5);
  });

  it('IKF-002: step interpolation holds previous value', () => {
    const prev: Keyframe = { frame: 0, value: 0, interpolation: 'step' };
    const next: Keyframe = { frame: 100, value: 10, interpolation: 'linear' };

    expect(interpolateKeyframes(prev, next, 50)).toBeCloseTo(0, 5);
    expect(interpolateKeyframes(prev, next, 99)).toBeCloseTo(0, 5);
  });

  it('IKF-003: smooth interpolation uses smoothstep', () => {
    const prev: Keyframe = { frame: 0, value: 0, interpolation: 'smooth' };
    const next: Keyframe = { frame: 100, value: 1, interpolation: 'linear' };

    const val = interpolateKeyframes(prev, next, 25);
    // smoothstep(0.25) = 0.15625
    expect(val).toBeCloseTo(0.15625, 3);
  });

  it('IKF-004: handles zero duration', () => {
    const prev: Keyframe = { frame: 10, value: 5, interpolation: 'linear' };
    const next: Keyframe = { frame: 10, value: 10, interpolation: 'linear' };

    expect(interpolateKeyframes(prev, next, 10)).toBe(5);
  });

  it('IKF-005: linear interpolation at boundaries', () => {
    const prev: Keyframe = { frame: 0, value: 0, interpolation: 'linear' };
    const next: Keyframe = { frame: 100, value: 100, interpolation: 'linear' };

    expect(interpolateKeyframes(prev, next, 0)).toBeCloseTo(0, 5);
    expect(interpolateKeyframes(prev, next, 100)).toBeCloseTo(100, 5);
  });

  it('IKF-006: negative values work correctly', () => {
    const prev: Keyframe = { frame: 0, value: -10, interpolation: 'linear' };
    const next: Keyframe = { frame: 100, value: 10, interpolation: 'linear' };

    expect(interpolateKeyframes(prev, next, 50)).toBeCloseTo(0, 5);
  });
});

describe('PropertyContainer animation helpers', () => {
  let container: PropertyContainer;

  beforeEach(() => {
    container = new PropertyContainer();
  });

  describe('toPersistentJSON', () => {
    it('PCA-001: only serializes persistent properties', () => {
      container.add({ name: 'persistent1', defaultValue: 10, persistent: true });
      container.add({ name: 'persistent2', defaultValue: 'hello', persistent: true });
      container.add({ name: 'transient', defaultValue: 42 });

      const json = container.toPersistentJSON();
      expect(json).toHaveProperty('persistent1', 10);
      expect(json).toHaveProperty('persistent2', 'hello');
      expect(json).not.toHaveProperty('transient');
    });

    it('PCA-002: returns empty object when no persistent properties', () => {
      container.add({ name: 'a', defaultValue: 1 });
      container.add({ name: 'b', defaultValue: 2 });

      const json = container.toPersistentJSON();
      expect(Object.keys(json)).toHaveLength(0);
    });
  });

  describe('getAnimatableProperties', () => {
    it('PCA-010: returns only animatable properties', () => {
      container.add({ name: 'animated1', defaultValue: 0, animatable: true });
      container.add({ name: 'animated2', defaultValue: 0, animatable: true });
      container.add({ name: 'static', defaultValue: 0 });

      const animatable = container.getAnimatableProperties();
      expect(animatable).toHaveLength(2);
      expect(animatable.map(p => p.name)).toContain('animated1');
      expect(animatable.map(p => p.name)).toContain('animated2');
    });

    it('PCA-011: returns empty array when no animatable properties', () => {
      container.add({ name: 'a', defaultValue: 0 });
      expect(container.getAnimatableProperties()).toHaveLength(0);
    });
  });

  describe('getPersistentProperties', () => {
    it('PCA-020: returns only persistent properties', () => {
      container.add({ name: 'saved', defaultValue: 0, persistent: true });
      container.add({ name: 'temp', defaultValue: 0 });

      const persistent = container.getPersistentProperties();
      expect(persistent).toHaveLength(1);
      expect(persistent[0]!.name).toBe('saved');
    });
  });

  describe('backward compatibility', () => {
    it('PCA-030: toJSON still works as before (includes all properties)', () => {
      container.add({ name: 'a', defaultValue: 1, persistent: true });
      container.add({ name: 'b', defaultValue: 2 });
      container.add({ name: 'c', defaultValue: 3, animatable: true });

      const json = container.toJSON();
      expect(json).toHaveProperty('a', 1);
      expect(json).toHaveProperty('b', 2);
      expect(json).toHaveProperty('c', 3);
    });

    it('PCA-031: fromJSON still works as before', () => {
      container.add({ name: 'a', defaultValue: 0, persistent: true });
      container.add({ name: 'b', defaultValue: 0 });

      container.fromJSON({ a: 10, b: 20 });
      expect(container.getValue('a')).toBe(10);
      expect(container.getValue('b')).toBe(20);
    });

    it('PCA-032: existing Property behavior is unchanged', () => {
      const prop = container.add({ name: 'test', defaultValue: 5 });

      // Value get/set
      expect(prop.value).toBe(5);
      prop.value = 10;
      expect(prop.value).toBe(10);

      // Reset
      prop.reset();
      expect(prop.value).toBe(5);

      // Signal emission
      const listener = vi.fn();
      prop.changed.connect(listener);
      prop.value = 20;
      expect(listener).toHaveBeenCalledWith(20, 5);
    });

    it('PCA-033: min/max clamping still works', () => {
      const prop = container.add({
        name: 'clamped',
        defaultValue: 50,
        min: 0,
        max: 100,
      });

      prop.value = 150;
      expect(prop.value).toBe(100);

      prop.value = -50;
      expect(prop.value).toBe(0);
    });
  });
});
