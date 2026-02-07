/**
 * ImageLimits config - Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { IMAGE_LIMITS } from './ImageLimits';

describe('IMAGE_LIMITS', () => {
  it('IL-U001: MAX_DIMENSION should be 65536', () => {
    expect(IMAGE_LIMITS.MAX_DIMENSION).toBe(65536);
  });

  it('IL-U002: MAX_PIXELS should be 268435456 (256 megapixels)', () => {
    expect(IMAGE_LIMITS.MAX_PIXELS).toBe(268435456);
  });

  it('IL-U003: should be immutable (as const)', () => {
    // TypeScript enforces this at compile time, but verify at runtime
    // that the values are what we expect and haven't been accidentally changed
    expect(typeof IMAGE_LIMITS.MAX_DIMENSION).toBe('number');
    expect(typeof IMAGE_LIMITS.MAX_PIXELS).toBe('number');
    expect(IMAGE_LIMITS.MAX_PIXELS).toBeGreaterThan(IMAGE_LIMITS.MAX_DIMENSION);
  });
});
