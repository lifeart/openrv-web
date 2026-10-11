import { describe, it, expect } from 'vitest';
import { RenderStateEncoder, RenderStateDecoder } from './renderStateTransport';
import type { RenderState } from './RenderState';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../core/types/color';
import { DEFAULT_TONE_MAPPING_STATE } from '../core/types/effects';

function baseState(overrides: Partial<RenderState> = {}): RenderState {
  return {
    colorAdjustments: { ...DEFAULT_COLOR_ADJUSTMENTS },
    colorInversion: false,
    toneMappingState: { ...DEFAULT_TONE_MAPPING_STATE },
    backgroundPattern: {} as RenderState['backgroundPattern'],
    cdl: {} as RenderState['cdl'],
    curvesLUT: null,
    colorWheels: {} as RenderState['colorWheels'],
    falseColor: { enabled: false, lut: null },
    zebraStripes: {} as RenderState['zebraStripes'],
    channelMode: 'rgb',
    lut: { data: null, size: 0, intensity: 0 },
    displayColor: { transferFunction: 0, displayGamma: 1, displayBrightness: 1, customGamma: 2.2 },
    highlightsShadows: { highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    vibrance: { amount: 0, skinProtection: false },
    clarity: 0,
    sharpen: 0,
    hslQualifier: {} as RenderState['hslQualifier'],
    ...overrides,
  };
}

/** Simulate postMessage: arrays arrive as fresh copies. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('renderStateTransport', () => {
  it('RST-001: first encode sends every array', () => {
    const lut = new Float32Array(24);
    const wire = new RenderStateEncoder().encode(baseState({ lut: { data: lut, size: 2, intensity: 1 } }));
    expect(wire.reused).toEqual([]);
    expect(wire.state.lut.data).toBe(lut);
  });

  it('RST-002: unchanged arrays are omitted and restored with the same worker-side object', () => {
    const encoder = new RenderStateEncoder();
    const decoder = new RenderStateDecoder();
    const lut = new Float32Array(24).fill(0.5);
    const fileLUT = new Float32Array(24).fill(0.25);
    const falseColorLUT = new Uint8Array(256 * 3);
    const state = baseState({
      lut: { data: lut, size: 2, intensity: 1 },
      fileLUT: { data: fileLUT, size: 2, intensity: 1, domainMin: [0, 0, 0], domainMax: [1, 1, 1] },
      falseColor: { enabled: true, lut: falseColorLUT },
    });

    const first = decoder.decode(clone(encoder.encode(state)));
    const secondWire = encoder.encode({ ...state });
    expect(secondWire.reused.sort()).toEqual(['falseColorLUT', 'fileLUT', 'lut']);
    expect(secondWire.state.lut.data).toBeNull();

    const second = decoder.decode(clone(secondWire));
    expect(second.lut.data).toBe(first.lut.data);
    expect(second.fileLUT?.data).toBe(first.fileLUT?.data);
    expect(second.falseColor.lut).toBe(first.falseColor.lut);
    expect(Array.from(second.lut.data!.slice(0, 2))).toEqual([0.5, 0.5]);
  });

  it('RST-003: a new array is sent again', () => {
    const encoder = new RenderStateEncoder();
    encoder.encode(baseState({ lut: { data: new Float32Array(24), size: 2, intensity: 1 } }));
    const next = new Float32Array(24);
    const wire = encoder.encode(baseState({ lut: { data: next, size: 2, intensity: 1 } }));
    expect(wire.reused).toEqual([]);
    expect(wire.state.lut.data).toBe(next);
  });

  it('RST-004: clearing a LUT is sent as null and not treated as reuse', () => {
    const encoder = new RenderStateEncoder();
    const decoder = new RenderStateDecoder();
    const lut = new Float32Array(24);
    decoder.decode(clone(encoder.encode(baseState({ lut: { data: lut, size: 2, intensity: 1 } }))));
    const cleared = decoder.decode(clone(encoder.encode(baseState())));
    expect(cleared.lut.data).toBeNull();
    // Re-applying the old array after a clear sends it again.
    const wire = encoder.encode(baseState({ lut: { data: lut, size: 2, intensity: 1 } }));
    expect(wire.reused).toEqual([]);
  });

  it('RST-005: encode does not mutate the caller state', () => {
    const encoder = new RenderStateEncoder();
    const inlineLUT = new Float32Array(8);
    const state = baseState({ colorAdjustments: { ...DEFAULT_COLOR_ADJUSTMENTS, inlineLUT } });
    encoder.encode(state);
    const wire = encoder.encode(state);
    expect(wire.reused).toEqual(['inlineLUT']);
    expect(wire.state.colorAdjustments.inlineLUT).toBeUndefined();
    expect(state.colorAdjustments.inlineLUT).toBe(inlineLUT);
  });
});
