import { describe, it, expect } from 'vitest';
import { selectHDRSourceRoute } from './hdrOCIORoute';

describe('selectHDRSourceRoute', () => {
  it('HDR without OCIO renders through the GL float pipeline', () => {
    expect(selectHDRSourceRoute({ ocioActive: false, ocioFloatStage: false })).toBe('gl');
  });

  it('HDR + OCIO with a float bake stays in the GL float pipeline (never the 8-bit canvas)', () => {
    expect(selectHDRSourceRoute({ ocioActive: true, ocioFloatStage: true })).toBe('gl');
  });

  it('HDR + OCIO without a float bake applies OCIO on the canvas rather than skipping it', () => {
    expect(selectHDRSourceRoute({ ocioActive: true, ocioFloatStage: false })).toBe('canvas-ocio');
  });
});
