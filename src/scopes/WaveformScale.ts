/**
 * Waveform vertical scales.
 *
 * Scope data is linear with 1.0 = HDR reference white (203 cd/m², BT.2408),
 * see Renderer.renderForScopes. The waveform can show it as:
 * - 'ire':  percent of reference white on a linear axis (100 = 1.0). The
 *           default; for SDR content this is the classic 0-100 IRE scale.
 * - 'nits': cd/m² on a linear axis (value × 203). The axis top follows the
 *           frame peak in steps (203, 400, 1000, 2000, 4000, 10000 cd/m²).
 * - 'pq':   cd/m² on an SMPTE ST 2084 (PQ) coded axis, 0-10000 cd/m², so
 *           shadows and 1000-10000 cd/m² highlights are readable at once.
 */

import { HDR_REFERENCE_WHITE_NITS } from '../config/RenderConfig';
import { pqEncode } from '../color/TransferFunctions';

export type WaveformScale = 'ire' | 'nits' | 'pq';

export const WAVEFORM_SCALES: readonly WaveformScale[] = ['ire', 'nits', 'pq'];

export const WAVEFORM_SCALE_LABELS: Record<WaveformScale, string> = {
  ire: 'IRE',
  nits: 'Nits',
  pq: 'PQ',
};

/** Peak luminance of the PQ signal range, in cd/m². */
export const PQ_PEAK_NITS = 10000;

/** Axis tops offered by the 'nits' scale, in cd/m². */
const NITS_AXIS_STEPS = [HDR_REFERENCE_WHITE_NITS, 400, 1000, 2000, 4000, PQ_PEAK_NITS];

/** Luminance in cd/m² of a linear scope value (1.0 = 203 cd/m²). */
export function linearToNits(value: number): number {
  return value * HDR_REFERENCE_WHITE_NITS;
}

/** PQ code value (0-1) of a linear scope value. Values past 10000 cd/m² saturate at 1. */
export function linearToPQCode(value: number): number {
  return pqEncode(Math.min(linearToNits(Math.max(value, 0)) / PQ_PEAK_NITS, 1));
}

/**
 * Axis top, as a linear scope value, for the 'nits' scale: the smallest step
 * that holds the frame's signal peak.
 */
export function nitsAxisMax(signalPeak: number): number {
  const peakNits = Number.isFinite(signalPeak) ? linearToNits(Math.max(signalPeak, 0)) : 0;
  const top = NITS_AXIS_STEPS.find((n) => peakNits <= n) ?? PQ_PEAK_NITS;
  return top / HDR_REFERENCE_WHITE_NITS;
}

/**
 * Vertical position (0 = bottom, 1 = top) of a linear scope value.
 * `axisMax` is the linear value at the top of a linear ('ire' / 'nits') axis.
 */
export function waveformScalePosition(value: number, scale: WaveformScale, axisMax: number): number {
  if (scale === 'pq') return linearToPQCode(value);
  return value / (axisMax > 0 ? axisMax : 1);
}

export interface WaveformTick {
  /** Vertical position, 0 = bottom, 1 = top. */
  position: number;
  label: string;
}

function formatNits(nits: number): string {
  return nits >= 10000 ? `${Math.round(nits / 1000)}k` : String(Math.round(nits));
}

/** Graticule lines and labels for a scale. */
export function waveformScaleTicks(scale: WaveformScale, axisMax: number): WaveformTick[] {
  if (scale === 'pq') {
    return [100, HDR_REFERENCE_WHITE_NITS, 1000, 4000, PQ_PEAK_NITS].map((nits) => ({
      position: pqEncode(nits / PQ_PEAK_NITS),
      label: formatNits(nits),
    }));
  }
  const max = axisMax > 0 ? axisMax : 1;
  return [0.25, 0.5, 0.75, 1].map((f) => ({
    position: f,
    label: scale === 'nits' ? formatNits(linearToNits(f * max)) : String(Math.round(f * max * 100)),
  }));
}

/** Unit caption for a scale. */
export function waveformScaleUnit(scale: WaveformScale): string {
  if (scale === 'ire') return 'IRE %';
  return scale === 'pq' ? 'cd/m² (PQ)' : 'cd/m²';
}
