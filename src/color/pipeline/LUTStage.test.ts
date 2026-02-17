import { describe, it, expect } from 'vitest';
import { LUTStage } from './LUTStage';
import type { LUT3D, LUT1D } from '../LUTLoader';

function createTestLUT3D(): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = r / (size - 1);
        data[idx + 1] = g / (size - 1);
        data[idx + 2] = b / (size - 1);
      }
    }
  }
  return { title: 'Test', size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

function createTestLUT1D(): LUT1D {
  const size = 4;
  const data = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    const v = i / (size - 1);
    data[i * 3] = v;
    data[i * 3 + 1] = v;
    data[i * 3 + 2] = v;
  }
  return { title: 'Test 1D', size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

describe('LUTStage', () => {
  it('LSTG-U001: default stage has no LUT and is enabled', () => {
    const stage = new LUTStage();
    expect(stage.hasLUT()).toBe(false);
    expect(stage.isEnabled()).toBe(true);
    expect(stage.getIntensity()).toBe(1.0);
    expect(stage.getLUTName()).toBeNull();
  });

  it('LSTG-U002: setLUT stores LUT data and name', () => {
    const stage = new LUTStage();
    const lut = createTestLUT3D();

    stage.setLUT(lut, 'test.cube');

    expect(stage.hasLUT()).toBe(true);
    expect(stage.getLUTName()).toBe('test.cube');
    expect(stage.getLUTData()).toBe(lut);
  });

  it('LSTG-U003: clearLUT removes LUT data', () => {
    const stage = new LUTStage();
    stage.setLUT(createTestLUT3D(), 'test.cube');
    stage.clearLUT();

    expect(stage.hasLUT()).toBe(false);
    expect(stage.getLUTName()).toBeNull();
    expect(stage.getLUTData()).toBeNull();
  });

  it('LSTG-U004: setEnabled toggles bypass state', () => {
    const stage = new LUTStage();
    stage.setEnabled(false);

    expect(stage.isEnabled()).toBe(false);

    stage.setEnabled(true);
    expect(stage.isEnabled()).toBe(true);
  });

  it('LSTG-U005: setIntensity stores blend factor', () => {
    const stage = new LUTStage();
    stage.setIntensity(0.75);
    expect(stage.getIntensity()).toBeCloseTo(0.75);
  });

  it('LSTG-U006: setIntensity clamps to valid range', () => {
    const stage = new LUTStage();

    stage.setIntensity(-1);
    expect(stage.getIntensity()).toBe(0);

    stage.setIntensity(2);
    expect(stage.getIntensity()).toBe(1);
  });

  it('LSTG-U007: isActive returns true only when LUT loaded and enabled', () => {
    const stage = new LUTStage();
    expect(stage.isActive()).toBe(false);

    stage.setLUT(createTestLUT3D(), 'test.cube');
    expect(stage.isActive()).toBe(true);

    stage.setEnabled(false);
    expect(stage.isActive()).toBe(false);
  });

  it('LSTG-U008: supports 1D LUT', () => {
    const stage = new LUTStage();
    const lut = createTestLUT1D();

    stage.setLUT(lut, 'test_1d.cube');

    expect(stage.hasLUT()).toBe(true);
    expect(stage.getLUTName()).toBe('test_1d.cube');
  });

  it('LSTG-U009: setSource marks LUT origin as manual or ocio', () => {
    const stage = new LUTStage();
    expect(stage.getSource()).toBe('manual');

    stage.setSource('ocio');
    expect(stage.getSource()).toBe('ocio');
  });

  it('LSTG-U010: getState returns serializable stage snapshot', () => {
    const stage = new LUTStage();
    stage.setLUT(createTestLUT3D(), 'test.cube');
    stage.setIntensity(0.8);
    stage.setSource('ocio');

    const state = stage.getState();

    expect(state.enabled).toBe(true);
    expect(state.lutName).toBe('test.cube');
    expect(state.intensity).toBeCloseTo(0.8);
    expect(state.source).toBe('ocio');
  });

  it('LSTG-U011: reset restores defaults', () => {
    const stage = new LUTStage();
    stage.setLUT(createTestLUT3D(), 'test.cube');
    stage.setIntensity(0.5);
    stage.setEnabled(false);
    stage.setSource('ocio');
    stage.setInMatrix(new Float32Array([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]));
    stage.setOutMatrix(new Float32Array([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1]));

    stage.reset();

    expect(stage.hasLUT()).toBe(false);
    expect(stage.isEnabled()).toBe(true);
    expect(stage.getIntensity()).toBe(1.0);
    expect(stage.getSource()).toBe('manual');
    expect(stage.getInMatrix()).toBeNull();
    expect(stage.getOutMatrix()).toBeNull();
  });

  it('LSTG-U012: setInMatrix stores non-identity matrix', () => {
    const stage = new LUTStage();
    const matrix = new Float32Array([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]);
    stage.setInMatrix(matrix);

    expect(stage.getInMatrix()).not.toBeNull();
    expect(stage.getInMatrix()![0]).toBe(2);
  });

  it('LSTG-U013: setOutMatrix stores non-identity matrix', () => {
    const stage = new LUTStage();
    const matrix = new Float32Array([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1]);
    stage.setOutMatrix(matrix);

    expect(stage.getOutMatrix()).not.toBeNull();
    expect(stage.getOutMatrix()![0]).toBe(0.5);
  });

  it('LSTG-U014: identity matrix is optimized to null', () => {
    const stage = new LUTStage();
    stage.setInMatrix(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    expect(stage.getInMatrix()).toBeNull();
  });

  it('LSTG-U015: NaN matrix entries sanitized to identity', () => {
    const stage = new LUTStage();
    stage.setInMatrix(new Float32Array([NaN, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));

    // NaN causes sanitization to identity, which is then stored as non-null identity copy
    const m = stage.getInMatrix();
    expect(m).not.toBeNull();
    // The sanitized matrix should be identity
    expect(m![0]).toBe(1);
    expect(m![5]).toBe(1);
    expect(m![10]).toBe(1);
    expect(m![15]).toBe(1);
  });

  it('LSTG-U016: setInMatrix accepts plain number array', () => {
    const stage = new LUTStage();
    stage.setInMatrix([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]);

    expect(stage.getInMatrix()).not.toBeNull();
    expect(stage.getInMatrix()![0]).toBe(2);
  });

  it('LSTG-U017: clearing matrix with null', () => {
    const stage = new LUTStage();
    stage.setInMatrix([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]);
    stage.setInMatrix(null);
    expect(stage.getInMatrix()).toBeNull();
  });

  it('LSTG-U018: getState includes matrix fields', () => {
    const stage = new LUTStage();
    stage.setLUT(createTestLUT3D(), 'test.cube');
    stage.setInMatrix([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]);

    const state = stage.getState();
    expect(state.inMatrix).not.toBeNull();
    expect(state.inMatrix![0]).toBe(2);
    expect(state.outMatrix).toBeNull();
  });
});
