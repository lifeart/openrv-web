/**
 * RenderState transport for the render worker.
 *
 * The worker owns a real Renderer, so the cheapest way to keep it in step
 * with the main-thread pipeline is to send it the same RenderState the sync
 * Renderer receives and let `Renderer.applyRenderState()` diff it there.
 *
 * Structured clone gives the worker a fresh copy of every typed array on
 * every message. ShaderBatchApplicator compares LUT arrays by reference, so
 * a fresh copy each frame would re-upload every 3D LUT texture on every
 * frame. To avoid that, the encoder drops large arrays whose reference has
 * not changed since the last message and lists them in `reused`; the decoder
 * puts back the array object it received earlier, so reference equality
 * holds on the worker side too.
 */

import type { RenderState } from './RenderState';

type ReusableArray = Float32Array | Uint8Array;

/** Large typed-array slots in RenderState that are deduplicated across messages. */
export type RenderStateArraySlot =
  | 'lut'
  | 'lookLUT'
  | 'fileLUT'
  | 'displayLUT'
  | 'inlineLUT'
  | 'falseColorLUT'
  | 'filmLUT';

interface SlotAccessor {
  key: RenderStateArraySlot;
  get(state: RenderState): ReusableArray | null | undefined;
  /** Return a shallow copy of `state` with the slot replaced (never mutates `state`). */
  with(state: RenderState, value: ReusableArray | null): RenderState;
}

const SLOTS: readonly SlotAccessor[] = [
  {
    key: 'lut',
    get: (s) => s.lut.data,
    with: (s, v) => ({ ...s, lut: { ...s.lut, data: v as Float32Array | null } }),
  },
  {
    key: 'lookLUT',
    get: (s) => s.lookLUT?.data,
    with: (s, v) => (s.lookLUT ? { ...s, lookLUT: { ...s.lookLUT, data: v as Float32Array | null } } : s),
  },
  {
    key: 'fileLUT',
    get: (s) => s.fileLUT?.data,
    with: (s, v) => (s.fileLUT ? { ...s, fileLUT: { ...s.fileLUT, data: v as Float32Array | null } } : s),
  },
  {
    key: 'displayLUT',
    get: (s) => s.displayLUT?.data,
    with: (s, v) => (s.displayLUT ? { ...s, displayLUT: { ...s.displayLUT, data: v as Float32Array | null } } : s),
  },
  {
    key: 'inlineLUT',
    get: (s) => s.colorAdjustments.inlineLUT,
    with: (s, v) => {
      const colorAdjustments = { ...s.colorAdjustments };
      if (v) {
        colorAdjustments.inlineLUT = v as Float32Array;
      } else {
        delete colorAdjustments.inlineLUT;
      }
      return { ...s, colorAdjustments };
    },
  },
  {
    key: 'falseColorLUT',
    get: (s) => s.falseColor.lut,
    with: (s, v) => ({ ...s, falseColor: { ...s.falseColor, lut: v as Uint8Array | null } }),
  },
  {
    key: 'filmLUT',
    get: (s) => s.filmEmulation?.lutData,
    with: (s, v) =>
      s.filmEmulation ? { ...s, filmEmulation: { ...s.filmEmulation, lutData: v as Uint8Array | null } } : s,
  },
];

/** RenderState as sent to the worker. */
export interface WireRenderState {
  state: RenderState;
  /** Slots whose array was omitted because it is the same object as last time. */
  reused: RenderStateArraySlot[];
}

/** Main-thread side: drops unchanged large arrays from outgoing RenderStates. */
export class RenderStateEncoder {
  private lastSent = new Map<RenderStateArraySlot, ReusableArray | null>();

  encode(state: RenderState): WireRenderState {
    let out = state;
    const reused: RenderStateArraySlot[] = [];
    for (const slot of SLOTS) {
      const value = slot.get(state) ?? null;
      if (value !== null && this.lastSent.get(slot.key) === value) {
        reused.push(slot.key);
        out = slot.with(out, null);
      } else {
        this.lastSent.set(slot.key, value);
      }
    }
    return { state: out, reused };
  }

  /** Forget what was sent, so the next encode sends every array again. */
  reset(): void {
    this.lastSent.clear();
  }
}

/** Worker side: restores omitted arrays from the previously received ones. */
export class RenderStateDecoder {
  private lastReceived = new Map<RenderStateArraySlot, ReusableArray | null>();

  decode(wire: WireRenderState): RenderState {
    let out = wire.state;
    const reused = new Set(wire.reused);
    for (const slot of SLOTS) {
      if (reused.has(slot.key)) {
        out = slot.with(out, this.lastReceived.get(slot.key) ?? null);
      } else {
        this.lastReceived.set(slot.key, slot.get(wire.state) ?? null);
      }
    }
    return out;
  }
}
