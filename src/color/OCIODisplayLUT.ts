/**
 * OCIODisplayLUT - bakes the OCIO display transform for the WebGL float pipeline.
 *
 * The SDR canvas path applies OCIO as a post-process on 8-bit, display-encoded
 * pixels (OCIOProcessor.bakeTo3DLUT, domain [0, 1]). That cannot carry HDR or
 * float sources: everything above 1.0 is clamped and the input is already
 * gamma-encoded. For those sources the transform runs inside the shader
 * instead (viewer.frag.glsl, stage 7b'), as a float 3D LUT with a log2 shaper:
 *
 *   source values (OCIO input primaries, after grading and tone mapping)
 *     → shaper  s = log2(1 + x / epsilon) / log2(1 + maxValue / epsilon)
 *     → 3D LUT  (OCIO chain minus its display encode)
 *     → display-linear light in BT.709 primaries, 1.0 = reference white
 *
 * "Source values" are what the OCIO input space describes: the file's own
 * values for float sources (linear EXR, or a log-encoded float plate, whose
 * decode stays in the LUT), or scene-linear light when the shader has already
 * decoded the source (PQ / HLG / sRGB-curve input), in which case the chain's
 * input decode is dropped as well (stripInputDecode).
 *
 * Input primaries normalization (stage 0e) is off while this stage is active:
 * the OCIO input space defines the source primaries.
 *
 * The renderer then converts to the surface primaries (stage 7c) and applies
 * exactly one output encoding (stage 8a), so an OCIO view's own encoding is
 * never applied on top of ours:
 *   - SDR surface: the display transfer is set to the OCIO display's transfer
 *     (sRGB, Rec.709, gamma 2.2/2.4/2.6), which reproduces the view's signal.
 *   - HDR surface (extended sRGB, PQ, HLG, linear blit): the surface encoding
 *     is applied to display-linear light, SDR views landing at reference white
 *     (BT.2408). For a PQ view on a PQ surface (or HLG on HLG) the decode in
 *     the bake and the encode in the shader are exact inverses, so the view's
 *     signal passes through unchanged.
 *
 * Generating GLSL from the OCIO WASM module is not possible in this build:
 * no OCIO WASM binary is bundled and no OCIOWasmPipeline is ever constructed,
 * so the baked LUT is the GPU path for every OCIO config.
 */

import type { LUT3D } from './LUTLoader';
import {
  type Matrix3x3,
  type RGB,
  type TransferFunctionName,
  DCIP3_TO_XYZ,
  REC2020_TO_XYZ,
  XYZ_TO_SRGB,
  IDENTITY,
  composeMatrices,
  multiplyMatrixVector,
  srgbDecode,
  rec709Decode,
} from './OCIOTransform';
import { gamma22Decode, gamma24Decode, gamma26Decode, hlgDecode, pqDecode } from './TransferFunctions';
import type { DisplayTransferFunction } from './DisplayTransfer';

/** Log2 shaper that maps scene-linear [0, maxValue] onto the LUT's [0, 1] axis. */
export interface OCIOShaper {
  /** Linear toe: below about this value the shaper is linear (keeps blacks exact). */
  epsilon: number;
  /** Largest linear value the LUT covers; brighter input is clamped. */
  maxValue: number;
}

/**
 * Default shaper: linear below 2^-8, log above, up to 2^7 = 128 × reference
 * white (about 26 000 cd/m² at 203 cd/m², above the PQ ceiling of 10 000).
 * That is about 15 stops over the LUT axis (0.23 stops per cell at 65³).
 */
export const OCIO_HDR_SHAPER: Readonly<OCIOShaper> = Object.freeze({ epsilon: 1 / 256, maxValue: 128 });

/** Shaper scale: 1 / log2(1 + maxValue / epsilon). */
export function shaperScale(shaper: OCIOShaper): number {
  return 1 / Math.log2(1 + shaper.maxValue / shaper.epsilon);
}

/** Linear value → shaped LUT coordinate in [0, 1] (mirrors applyOCIOLUT3D in viewer.frag.glsl). */
export function shaperForward(x: number, shaper: OCIOShaper): number {
  const v = Math.log2(1 + Math.max(x, 0) / shaper.epsilon) * shaperScale(shaper);
  return Math.min(Math.max(v, 0), 1);
}

/** Shaped LUT coordinate in [0, 1] → linear value. */
export function shaperInverse(s: number, shaper: OCIOShaper): number {
  return shaper.epsilon * (Math.pow(2, s / shaperScale(shaper)) - 1);
}

export type OCIODisplayPrimaries = 'bt709' | 'p3' | 'bt2020';

/** Kind of signal an OCIO display produces. */
export type OCIODisplaySignal = 'sdr' | 'pq' | 'hlg';

export interface OCIODisplayDescriptor {
  primaries: OCIODisplayPrimaries;
  /** Encoding the display expects (what OCIOTransform encodes with for it). */
  transfer: TransferFunctionName;
}

/**
 * Describe an OCIO display by name. The built-in configs only ship SDR
 * displays (sRGB, Rec.709, DCI-P3, Rec.2020); PQ / HLG displays (as in
 * "Rec.2100-PQ" or "ST2084-P3-D65") are recognised by name so a custom config
 * that offers them is handled.
 */
export function describeOCIODisplay(display: string): OCIODisplayDescriptor {
  const name = display.toLowerCase();
  const wide2020 = name.includes('2020') || name.includes('2100');
  if (name.includes('pq') || name.includes('st2084') || name.includes('st-2084')) {
    return { primaries: name.includes('p3') && !wide2020 ? 'p3' : 'bt2020', transfer: 'pq' };
  }
  if (name.includes('hlg')) {
    return { primaries: 'bt2020', transfer: 'hlg' };
  }
  if (wide2020) return { primaries: 'bt2020', transfer: 'gamma22' };
  if (name.includes('p3')) return { primaries: 'p3', transfer: 'gamma26' };
  if (name.includes('709')) return { primaries: 'bt709', transfer: 'rec709' };
  return { primaries: 'bt709', transfer: 'srgb' };
}

/** Signal kind for a display transfer function. */
export function displaySignalForTransfer(transfer: TransferFunctionName): OCIODisplaySignal {
  if (transfer === 'pq') return 'pq';
  if (transfer === 'hlg') return 'hlg';
  return 'sdr';
}

/** Display primaries → BT.709 (the renderer's working primaries before stage 7c). */
export function displayPrimariesToBT709(primaries: OCIODisplayPrimaries): Matrix3x3 {
  if (primaries === 'p3') return composeMatrices(DCIP3_TO_XYZ, XYZ_TO_SRGB);
  if (primaries === 'bt2020') return composeMatrices(REC2020_TO_XYZ, XYZ_TO_SRGB);
  return IDENTITY;
}

// HDR reference levels, matching viewer.frag.glsl (HDR_REFERENCE_WHITE_NITS etc.).
const REFERENCE_WHITE_NITS = 203;
const PQ_PEAK_NITS = 10000;
const HLG_NOMINAL_PEAK_NITS = 1000;
const HLG_OOTF_THRESH = 0.01;
const HLG_OOTF_SLOPE = 39.810717;

/**
 * Convert the linear output of an OCIO chain whose display encode was removed
 * to renderer display-linear units (1.0 = reference white, 203 cd/m²).
 *
 * - SDR transfers: already relative display light (1.0 = SDR white).
 * - PQ: OCIO's PQ encode takes 1.0 = 10 000 cd/m².
 * - HLG: OCIO's HLG encode takes scene light; apply the BT.2100 OOTF
 *   (gamma 1.2 at 1000 cd/m², BT.2020 luma) exactly as hlgToLinear() does.
 */
export function chainLinearToRendererLinear(rgb: RGB, transfer: TransferFunctionName): RGB {
  if (transfer === 'pq') {
    const k = PQ_PEAK_NITS / REFERENCE_WHITE_NITS;
    return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
  }
  if (transfer === 'hlg') {
    const r = Math.max(rgb[0], 0);
    const g = Math.max(rgb[1], 0);
    const b = Math.max(rgb[2], 0);
    const ys = 0.2627 * r + 0.678 * g + 0.0593 * b;
    const gain =
      (ys < HLG_OOTF_THRESH ? ys * HLG_OOTF_SLOPE : Math.pow(ys, 0.2)) * (HLG_NOMINAL_PEAK_NITS / REFERENCE_WHITE_NITS);
    return [r * gain, g * gain, b * gain];
  }
  return rgb;
}

/**
 * Decode a display signal (as an OCIO view would emit it) to renderer
 * display-linear units. Used when a chain has no separable display encode
 * step and by tests as the reference for the bake.
 */
export function decodeDisplaySignal(rgb: RGB, transfer: TransferFunctionName): RGB {
  const decode = (fn: (v: number) => number): RGB => [fn(rgb[0]), fn(rgb[1]), fn(rgb[2])];
  switch (transfer) {
    case 'srgb':
      return decode(srgbDecode);
    case 'rec709':
      return decode(rec709Decode);
    case 'gamma22':
      return decode(gamma22Decode);
    case 'gamma24':
      return decode(gamma24Decode);
    case 'gamma26':
      return decode(gamma26Decode);
    case 'pq':
      return chainLinearToRendererLinear(decode(pqDecode), 'pq');
    case 'hlg':
      return chainLinearToRendererLinear(decode(hlgDecode), 'hlg');
    default:
      return rgb;
  }
}

/**
 * Display transfer state that reproduces an OCIO display's encoding on an SDR
 * surface (u_outputEncoding = display transfer). PQ / HLG displays have no SDR
 * equivalent: their display-linear output is shown with sRGB and clips above
 * reference white, like any HDR source on an SDR surface.
 */
export function sdrDisplayTransferFor(transfer: TransferFunctionName): {
  transferFunction: DisplayTransferFunction;
  customGamma?: number;
} {
  switch (transfer) {
    case 'rec709':
      return { transferFunction: 'rec709' };
    case 'gamma22':
      return { transferFunction: 'gamma2.2' };
    case 'gamma24':
      return { transferFunction: 'gamma2.4' };
    case 'gamma26':
      return { transferFunction: 'custom', customGamma: 2.6 };
    default:
      return { transferFunction: 'srgb' };
  }
}

/**
 * The part of OCIOTransform the bake needs. Kept structural so a synthetic
 * chain (e.g. a PQ view, which the built-in configs do not ship) can be baked.
 */
export interface SplittableOCIOTransform {
  splitLinearCore(stripInputDecode: boolean): {
    inputDecode: TransferFunctionName | null;
    outputEncode: TransferFunctionName | null;
    core: { apply(r: number, g: number, b: number): RGB };
  };
}

/** OCIO display transform baked for the float GL pipeline. */
export interface OCIOLinearDisplayLUT {
  /** RGB float cube in the layout of OCIOProcessor.bakeTo3DLUT (red index fastest), indexed by shaped coordinates. */
  lut: LUT3D;
  shaper: Readonly<OCIOShaper>;
  /** The OCIO display's transfer function (used for the SDR display transfer). */
  displayTransfer: TransferFunctionName;
  /** Signal kind the OCIO view produces. */
  signal: OCIODisplaySignal;
  /** Input transfer function removed from the front of the chain, if any. */
  inputDecode: TransferFunctionName | null;
  /** Whether the bake expects input the renderer has already linearised. */
  stripInputDecode: boolean;
}

export interface BakeOCIOLinearDisplayLUTOptions {
  /** LUT title for diagnostics. */
  title?: string;
  /** Input shaper, OCIO_HDR_SHAPER by default. */
  shaper?: OCIOShaper;
  /**
   * True when the renderer has already decoded the source's transfer function
   * (PQ, HLG, sRGB-curve VideoFrames): the OCIO input decode is then dropped
   * and the LUT takes scene-linear input. False for float sources whose values
   * are the file's own code values (linear EXR, or a log-encoded float plate),
   * which the OCIO input space describes as they are.
   */
  stripInputDecode?: boolean;
}

/**
 * Bake an OCIO display transform for the GL float pipeline.
 *
 * @param transform  Full OCIO chain (input → working → look → display/view)
 * @param display    OCIO display name (selects primaries and transfer)
 * @param size       Cube size (2..129)
 */
export function bakeOCIOLinearDisplayLUT(
  transform: SplittableOCIOTransform,
  display: string,
  size: number,
  options: BakeOCIOLinearDisplayLUTOptions = {},
): OCIOLinearDisplayLUT {
  const title = options.title ?? 'OCIO (linear)';
  const shaper = options.shaper ?? OCIO_HDR_SHAPER;
  const stripInputDecode = options.stripInputDecode ?? false;
  if (!Number.isInteger(size) || size < 2 || size > 129) {
    throw new Error(`Invalid OCIO LUT size: ${size}. Must be an integer in [2, 129].`);
  }
  const descriptor = describeOCIODisplay(display);
  const { inputDecode, outputEncode, core } = transform.splitLinearCore(stripInputDecode);
  // The encode actually removed from the chain wins over the name-based guess;
  // a chain without one (identity, linear display) is already display-linear.
  const displayTransfer = outputEncode ?? descriptor.transfer;
  const toBT709 = displayPrimariesToBT709(descriptor.primaries);
  const identityMatrix = toBT709 === IDENTITY;

  // Shaped axis → linear sample positions (shared by all three axes).
  const axis = new Float64Array(size);
  for (let i = 0; i < size; i++) axis[i] = shaperInverse(i / (size - 1), shaper);

  const data = new Float32Array(size * size * size * 3);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        let rgb = core.apply(axis[r] ?? 0, axis[g] ?? 0, axis[b] ?? 0);
        if (outputEncode) rgb = chainLinearToRendererLinear(rgb, outputEncode);
        if (!identityMatrix) rgb = multiplyMatrixVector(toBT709, rgb);
        const idx = (b * size * size + g * size + r) * 3;
        data[idx] = rgb[0];
        data[idx + 1] = rgb[1];
        data[idx + 2] = rgb[2];
      }
    }
  }

  return {
    lut: { type: '3d', title, size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data },
    shaper,
    displayTransfer,
    signal: displaySignalForTransfer(displayTransfer),
    inputDecode,
    stripInputDecode,
  };
}
