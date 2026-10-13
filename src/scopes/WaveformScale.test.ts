import { describe, it, expect } from 'vitest';
import {
  linearToNits,
  linearToPQCode,
  nitsAxisMax,
  waveformScalePosition,
  waveformScaleTicks,
  waveformScaleUnit,
} from './WaveformScale';
import { pqInverseEOTF } from '../render/__tests__/shaderMathReference';

describe('WaveformScale', () => {
  it('WFS-001: linear scope values convert to cd/m² with 1.0 = 203 (4.0 -> 812)', () => {
    expect(linearToNits(1.0)).toBe(203);
    expect(linearToNits(4.0)).toBe(812);
    expect(linearToNits(1000 / 203)).toBeCloseTo(1000, 9);
  });

  it('WFS-002: PQ codes match the ST 2084 reference', () => {
    for (const v of [0.01, 0.18, 1, 4, 1000 / 203, 10000 / 203]) {
      expect(linearToPQCode(v)).toBeCloseTo(pqInverseEOTF((v * 203) / 10000), 6);
    }
    // Landmarks: 100 cd/m² ~ 0.508, 203 cd/m² ~ 0.58, 1000 cd/m² ~ 0.752, 10000 cd/m² = 1
    expect(linearToPQCode(100 / 203)).toBeCloseTo(0.508, 3);
    expect(linearToPQCode(1)).toBeCloseTo(0.58, 2);
    expect(linearToPQCode(1000 / 203)).toBeCloseTo(0.752, 3);
    expect(linearToPQCode(10000 / 203)).toBeCloseTo(1, 6);
  });

  it('WFS-003: PQ codes saturate past 10000 cd/m² and clamp negatives to 0', () => {
    expect(linearToPQCode(100)).toBeCloseTo(1, 6);
    expect(linearToPQCode(-1)).toBeCloseTo(0, 5);
  });

  it('WFS-004: the nits axis top rounds the frame peak up to a cd/m² step', () => {
    expect(nitsAxisMax(0.5) * 203).toBeCloseTo(203);
    expect(nitsAxisMax(1.0) * 203).toBeCloseTo(203);
    expect(nitsAxisMax(1.5) * 203).toBeCloseTo(400);
    expect(nitsAxisMax(4.0) * 203).toBeCloseTo(1000);
    expect(nitsAxisMax(1000 / 203) * 203).toBeCloseTo(1000);
    expect(nitsAxisMax(10) * 203).toBeCloseTo(4000);
    expect(nitsAxisMax(1000) * 203).toBeCloseTo(10000);
    expect(nitsAxisMax(Number.NaN) * 203).toBeCloseTo(203);
  });

  it('WFS-005: linear scales position values against the axis top; PQ ignores it', () => {
    expect(waveformScalePosition(0.5, 'ire', 1)).toBe(0.5);
    expect(waveformScalePosition(2, 'ire', 4)).toBe(0.5);
    expect(waveformScalePosition(2, 'nits', 4)).toBe(0.5);
    expect(waveformScalePosition(2, 'ire', 0)).toBe(2);
    expect(waveformScalePosition(4, 'pq', 1)).toBeCloseTo(linearToPQCode(4), 9);
    expect(waveformScalePosition(4, 'pq', 50)).toBeCloseTo(linearToPQCode(4), 9);
  });

  it('WFS-006: IRE ticks keep the SDR 25/50/75/100 graticule and extend for HDR', () => {
    expect(waveformScaleTicks('ire', 1).map((t) => t.label)).toEqual(['25', '50', '75', '100']);
    expect(waveformScaleTicks('ire', 4).map((t) => t.label)).toEqual(['100', '200', '300', '400']);
    expect(waveformScaleTicks('ire', 1).map((t) => t.position)).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('WFS-007: nits ticks are labelled in cd/m²', () => {
    expect(waveformScaleTicks('nits', 4).map((t) => t.label)).toEqual(['203', '406', '609', '812']);
    expect(waveformScaleTicks('nits', 10000 / 203).map((t) => t.label)).toEqual(['2500', '5000', '7500', '10k']);
  });

  it('WFS-008: PQ ticks sit at the PQ codes of 100, 203, 1000, 4000 and 10000 cd/m²', () => {
    const ticks = waveformScaleTicks('pq', 1);
    expect(ticks.map((t) => t.label)).toEqual(['100', '203', '1000', '4000', '10k']);
    expect(ticks[2]!.position).toBeCloseTo(0.752, 3);
    expect(ticks[4]!.position).toBeCloseTo(1, 6);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!.position).toBeGreaterThan(ticks[i - 1]!.position);
    }
  });

  it('WFS-009: unit captions', () => {
    expect(waveformScaleUnit('ire')).toBe('IRE %');
    expect(waveformScaleUnit('nits')).toBe('cd/m²');
    expect(waveformScaleUnit('pq')).toBe('cd/m² (PQ)');
  });
});
