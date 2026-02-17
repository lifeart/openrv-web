/**
 * Pure parsing functions for extracting typed settings from GTO DTOs.
 *
 * These functions are stateless — they take a GTO DTO and return typed settings
 * objects without any side effects or class instance dependencies.
 */
import type { GTODTO } from 'gto-js';
import {
  getNumberValue,
  getNumberArray,
  getStringValue,
} from './AnnotationStore';
import type { ColorAdjustments, ChannelMode, LinearizeState } from '../../core/types/color';
import { DEFAULT_LINEARIZE_STATE } from '../../core/types/color';
import type { Transform2D, CropState } from '../../core/types/transform';
import type { ScopesState } from '../../core/types/scopes';
import type { CDLValues } from '../../color/CDL';
import type { LensDistortionParams } from '../../transform/LensDistortion';
import type { StereoState } from '../types/stereo';
import type { GTOViewSettings } from './Session';

/**
 * Orchestrate parsing of all view settings from a GTO DTO.
 * Returns a GTOViewSettings object, or null if no settings were found.
 */
export function parseInitialSettings(
  dto: GTODTO,
  sourceInfo: { width: number; height: number },
): GTOViewSettings | null {
  const settings: GTOViewSettings = {};

  const colorAdjustments = parseColorAdjustments(dto);
  if (colorAdjustments && Object.keys(colorAdjustments).length > 0) {
    settings.colorAdjustments = colorAdjustments;
  }

  const cdl = parseCDL(dto);
  if (cdl) {
    settings.cdl = cdl;
  }

  const transform = parseTransform(dto);
  if (transform) {
    settings.transform = transform;
  }

  const lens = parseLens(dto);
  if (lens) {
    settings.lens = lens;
  }

  const crop = parseCrop(dto, sourceInfo);
  if (crop) {
    settings.crop = crop;
  }

  const channelMode = parseChannelMode(dto);
  if (channelMode) {
    settings.channelMode = channelMode;
  }

  const stereo = parseStereo(dto);
  if (stereo) {
    settings.stereo = stereo;
  }

  const scopes = parseScopes(dto);
  if (scopes) {
    settings.scopes = scopes;
  }

  const linearize = parseLinearize(dto);
  if (linearize) {
    settings.linearize = linearize;
  }

  return Object.keys(settings).length > 0 ? settings : null;
}

/**
 * Parse linearization settings from RVLinearize protocol nodes.
 *
 * Maps the OpenRV logtype integer to our LogCurveId system:
 *   0 = none, 1 = Cineon, 2 = Viper (treated as Cineon with console warning), 3 = ARRI LogC3
 *
 * Also extracts sRGB2linear, Rec709ToLinear, fileGamma, and alphaType.
 * Returns null when no RVLinearize node exists or all values are at defaults.
 */
export function parseLinearize(dto: GTODTO): LinearizeState | null {
  const nodes = dto.byProtocol('RVLinearize');
  if (nodes.length === 0) return null;

  const node = nodes.first();

  // Check node-level active flag
  const nodeComp = node.component('node');
  if (nodeComp?.exists()) {
    const active = getNumberValue(nodeComp.property('active').value());
    if (active !== undefined && active === 0) return null;
  }

  const colorComp = node.component('color');
  if (!colorComp?.exists()) return null;

  // Check color-level active flag
  const colorActive = getNumberValue(colorComp.property('active').value());
  if (colorActive !== undefined && colorActive === 0) return null;

  const rawLogType = getNumberValue(colorComp.property('logtype').value()) ?? 0;
  const sRGB2linear = getNumberValue(colorComp.property('sRGB2linear').value());
  const rec709ToLinear = getNumberValue(colorComp.property('Rec709ToLinear').value());
  const fileGamma = getNumberValue(colorComp.property('fileGamma').value());
  const alphaType = getNumberValue(colorComp.property('alphaType').value());

  // Map logtype: 0=none, 1=cineon, 2=viper (fallback to cineon), 3=logc3
  let logType: 0 | 1 | 2 | 3 = 0;
  if (rawLogType === 1) {
    logType = 1;
  } else if (rawLogType === 2) {
    console.warn('RVLinearize: Viper log type (2) is not natively supported; falling back to Cineon.');
    logType = 2;
  } else if (rawLogType === 3) {
    logType = 3;
  }

  const result: LinearizeState = {
    logType,
    sRGB2linear: sRGB2linear === 1,
    rec709ToLinear: rec709ToLinear === 1,
    fileGamma: typeof fileGamma === 'number' && Number.isFinite(fileGamma) ? fileGamma : 1.0,
    alphaType: typeof alphaType === 'number' ? alphaType : 0,
  };

  // Return null if all values are at defaults (no actual linearize settings)
  if (
    result.logType === DEFAULT_LINEARIZE_STATE.logType &&
    result.sRGB2linear === DEFAULT_LINEARIZE_STATE.sRGB2linear &&
    result.rec709ToLinear === DEFAULT_LINEARIZE_STATE.rec709ToLinear &&
    result.fileGamma === DEFAULT_LINEARIZE_STATE.fileGamma &&
    result.alphaType === DEFAULT_LINEARIZE_STATE.alphaType
  ) {
    return null;
  }

  return result;
}

/**
 * Sanitize a number: replace NaN and Infinity with a fallback value.
 */
function sanitizeNumber(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return value;
}

/**
 * Extract a scalar value and optional per-channel RGB triple from a GTO property.
 *
 * If the property value is a number array with >= 3 elements, the first 3 are
 * used as the per-channel triple. The scalar is still set from the first element
 * to maintain backward compatibility. Arrays with 1 or 2 elements use the first
 * element as the scalar. Empty arrays return undefined for both.
 */
function extractScalarAndRGB(
  rawValue: unknown,
  defaultScalar: number,
): { scalar: number | undefined; rgb: [number, number, number] | undefined } {
  const arr = getNumberArray(rawValue);
  if (arr && arr.length >= 3) {
    const r = sanitizeNumber(arr[0]!, defaultScalar);
    const g = sanitizeNumber(arr[1]!, defaultScalar);
    const b = sanitizeNumber(arr[2]!, defaultScalar);
    return { scalar: r, rgb: [r, g, b] };
  }
  if (arr && arr.length >= 1) {
    const scalar = sanitizeNumber(arr[0]!, defaultScalar);
    return { scalar, rgb: undefined };
  }
  // Not an array — try as scalar
  const scalar = getNumberValue(rawValue);
  if (typeof scalar === 'number') {
    return { scalar: sanitizeNumber(scalar, defaultScalar), rgb: undefined };
  }
  return { scalar: undefined, rgb: undefined };
}

/**
 * Parse color adjustments from RVColor and RVDisplayColor protocol nodes.
 */
export function parseColorAdjustments(dto: GTODTO): Partial<ColorAdjustments> | null {
  const adjustments: Partial<ColorAdjustments> = {};
  const colorNodes = dto.byProtocol('RVColor');

  if (colorNodes.length > 0) {
    const rvColorNode = colorNodes.first();
    const colorComp = rvColorNode.component('color');
    if (colorComp?.exists()) {
      // Exposure: default 0 (stops)
      const exposureResult = extractScalarAndRGB(colorComp.property('exposure').value(), 0);
      if (typeof exposureResult.scalar === 'number') adjustments.exposure = exposureResult.scalar;
      if (exposureResult.rgb) adjustments.exposureRGB = exposureResult.rgb;

      // Gamma: default 1
      const gammaResult = extractScalarAndRGB(colorComp.property('gamma').value(), 1);
      if (typeof gammaResult.scalar === 'number') adjustments.gamma = gammaResult.scalar;
      if (gammaResult.rgb) adjustments.gammaRGB = gammaResult.rgb;

      // Contrast: default 1 (0 means identity in OpenRV, map to 1)
      const contrastResult = extractScalarAndRGB(colorComp.property('contrast').value(), 1);
      if (typeof contrastResult.scalar === 'number') {
        adjustments.contrast = contrastResult.scalar === 0 ? 1 : contrastResult.scalar;
      }
      if (contrastResult.rgb) {
        adjustments.contrastRGB = [
          contrastResult.rgb[0] === 0 ? 1 : contrastResult.rgb[0],
          contrastResult.rgb[1] === 0 ? 1 : contrastResult.rgb[1],
          contrastResult.rgb[2] === 0 ? 1 : contrastResult.rgb[2],
        ];
      }

      const saturation = getNumberValue(colorComp.property('saturation').value());
      const offset = getNumberValue(colorComp.property('offset').value());

      if (typeof saturation === 'number') adjustments.saturation = saturation;
      if (typeof offset === 'number' && adjustments.brightness === undefined) {
        adjustments.brightness = offset;
      }
    }

    // Extract luminanceLUT component (separate from 'color' component on RVColor node)
    const lumLutComp = rvColorNode.component('luminanceLUT');
    if (lumLutComp?.exists()) {
      const active = getNumberValue(lumLutComp.property('active').value());
      if (active != null && active !== 0) {
        const lutArray = getNumberArray(lumLutComp.property('lut').value());
        if (lutArray && lutArray.length > 0) {
          const channels: 1 | 3 = (lutArray.length % 3 === 0) ? 3 : 1;
          adjustments.inlineLUT = new Float32Array(lutArray);
          adjustments.lutChannels = channels;
        }
      }
    }
  }

  const displayColorNodes = dto.byProtocol('RVDisplayColor');
  if (displayColorNodes.length > 0) {
    const displayComp = displayColorNodes.first().component('color');
    if (displayComp?.exists()) {
      const brightness = getNumberValue(displayComp.property('brightness').value());
      const gamma = getNumberValue(displayComp.property('gamma').value());
      if (typeof brightness === 'number') adjustments.brightness = brightness;
      if (typeof gamma === 'number' && adjustments.gamma === undefined) adjustments.gamma = gamma;
    }
  }

  return Object.keys(adjustments).length > 0 ? adjustments : null;
}

/**
 * Parse CDL values from RVColor or RVLinearize protocol nodes.
 */
export function parseCDL(dto: GTODTO): CDLValues | null {
  const buildCDL = (values: { slope?: number[]; offset?: number[]; power?: number[]; saturation?: number }): CDLValues | null => {
    const slope = values.slope ?? [];
    const offset = values.offset ?? [];
    const power = values.power ?? [];
    const saturation = values.saturation;

    if (slope.length < 3 || offset.length < 3 || power.length < 3 || typeof saturation !== 'number') {
      return null;
    }

    return {
      slope: { r: slope[0]!, g: slope[1]!, b: slope[2]! },
      offset: { r: offset[0]!, g: offset[1]!, b: offset[2]! },
      power: { r: power[0]!, g: power[1]!, b: power[2]! },
      saturation,
    };
  };

  const readCDLFromNodes = (nodes: ReturnType<GTODTO['byProtocol']>): CDLValues | null => {
    for (const node of nodes) {
      const cdlComp = node.component('CDL');
      if (!cdlComp?.exists()) continue;

      const active = getNumberValue(cdlComp.property('active').value());
      if (active !== undefined && active === 0) {
        continue;
      }

      const slope = getNumberArray(cdlComp.property('slope').value());
      const offset = getNumberArray(cdlComp.property('offset').value());
      const power = getNumberArray(cdlComp.property('power').value());
      const saturation = getNumberValue(cdlComp.property('saturation').value());
      const cdl = buildCDL({ slope, offset, power, saturation });
      if (cdl) return cdl;
    }
    return null;
  };

  return readCDLFromNodes(dto.byProtocol('RVColor')) ?? readCDLFromNodes(dto.byProtocol('RVLinearize'));
}

/**
 * Parse 2D transform settings from RVTransform2D protocol nodes.
 */
export function parseTransform(dto: GTODTO): Transform2D | null {
  const nodes = dto.byProtocol('RVTransform2D');
  if (nodes.length === 0) return null;

  const transformComp = nodes.first().component('transform');
  if (!transformComp?.exists()) return null;

  const active = getNumberValue(transformComp.property('active').value());
  if (active !== undefined && active === 0) return null;

  const rotationValue = getNumberValue(transformComp.property('rotate').value());
  const flipValue = getNumberValue(transformComp.property('flip').value());
  const flopValue = getNumberValue(transformComp.property('flop').value());

  const rotationOptions: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  let rotation: 0 | 90 | 180 | 270 = 0;

  if (typeof rotationValue === 'number') {
    const snapped = Math.round(rotationValue / 90) * 90;
    if (rotationOptions.includes(snapped as 0 | 90 | 180 | 270)) {
      rotation = snapped as 0 | 90 | 180 | 270;
    }
  }

  // Parse scale and translate if available
  const scaleValue = transformComp.property('scale').value();
  const translateValue = transformComp.property('translate').value();

  let scale = { x: 1, y: 1 };
  let translate = { x: 0, y: 0 };

  if (Array.isArray(scaleValue) && scaleValue.length >= 2) {
    const sx = typeof scaleValue[0] === 'number' ? scaleValue[0] : 1;
    const sy = typeof scaleValue[1] === 'number' ? scaleValue[1] : 1;
    scale = { x: sx, y: sy };
  }

  if (Array.isArray(translateValue) && translateValue.length >= 2) {
    const tx = typeof translateValue[0] === 'number' ? translateValue[0] : 0;
    const ty = typeof translateValue[1] === 'number' ? translateValue[1] : 0;
    translate = { x: tx, y: ty };
  }

  return {
    rotation,
    flipH: flopValue === 1,
    flipV: flipValue === 1,
    scale,
    translate,
  };
}

/**
 * Parse lens distortion parameters from RVLensWarp protocol nodes.
 */
export function parseLens(dto: GTODTO): LensDistortionParams | null {
  const nodes = dto.byProtocol('RVLensWarp');
  if (nodes.length === 0) return null;

  const node = nodes.first();
  const nodeComp = node.component('node');
  if (nodeComp?.exists()) {
    const active = getNumberValue(nodeComp.property('active').value());
    if (active !== undefined && active === 0) return null;
  }

  const warpComp = node.component('warp');
  if (!warpComp?.exists()) return null;

  const k1 = getNumberValue(warpComp.property('k1').value());
  const k2 = getNumberValue(warpComp.property('k2').value());
  const center = getNumberArray(warpComp.property('center').value());

  if (k1 === undefined && k2 === undefined && !center) return null;

  // Read additional properties if available
  const k3 = getNumberValue(warpComp.property('k3').value());
  const p1 = getNumberValue(warpComp.property('p1').value());
  const p2 = getNumberValue(warpComp.property('p2').value());
  const scaleValue = getNumberValue(warpComp.property('scale').value());
  const model = warpComp.property('model').value() as string | undefined;
  const pixelAspectRatio = getNumberValue(warpComp.property('pixelAspectRatio').value());
  const fx = getNumberValue(warpComp.property('fx').value());
  const fy = getNumberValue(warpComp.property('fy').value());
  const cropRatioX = getNumberValue(warpComp.property('cropRatioX').value());
  const cropRatioY = getNumberValue(warpComp.property('cropRatioY').value());

  const validModels = ['brown', 'opencv', 'pfbarrel', '3de4_radial_standard', '3de4_anamorphic'] as const;
  const parsedModel = validModels.includes(model as typeof validModels[number])
    ? (model as typeof validModels[number])
    : 'brown';

  const params: LensDistortionParams = {
    k1: k1 ?? 0,
    k2: k2 ?? 0,
    k3: k3 ?? 0,
    p1: p1 ?? 0,
    p2: p2 ?? 0,
    centerX: 0,
    centerY: 0,
    scale: scaleValue ?? 1,
    model: parsedModel,
    pixelAspectRatio: pixelAspectRatio ?? 1,
    fx: fx ?? 1,
    fy: fy ?? 1,
    cropRatioX: cropRatioX ?? 1,
    cropRatioY: cropRatioY ?? 1,
  };

  if (center && center.length >= 2) {
    params.centerX = center[0]! - 0.5;
    params.centerY = center[1]! - 0.5;
  }

  return params;
}

/**
 * Parse crop state from RVFormat protocol nodes.
 */
export function parseCrop(
  dto: GTODTO,
  sourceInfo: { width: number; height: number },
): CropState | null {
  const nodes = dto.byProtocol('RVFormat');
  if (nodes.length === 0) return null;

  const cropComp = nodes.first().component('crop');
  if (!cropComp?.exists()) return null;

  const active = getNumberValue(cropComp.property('active').value());
  const xmin = getNumberValue(cropComp.property('xmin').value());
  const ymin = getNumberValue(cropComp.property('ymin').value());
  const xmax = getNumberValue(cropComp.property('xmax').value());
  const ymax = getNumberValue(cropComp.property('ymax').value());

  const enabled = active === 1;
  if (!enabled && xmin === undefined && ymin === undefined && xmax === undefined && ymax === undefined) {
    return null;
  }

  const { width, height } = sourceInfo;
  let region = { x: 0, y: 0, width: 1, height: 1 };

  if (width > 0 && height > 0 && xmin !== undefined && ymin !== undefined && xmax !== undefined && ymax !== undefined) {
    const cropWidth = Math.max(0, xmax - xmin);
    const cropHeight = Math.max(0, ymax - ymin);
    region = {
      x: Math.max(0, Math.min(1, xmin / width)),
      y: Math.max(0, Math.min(1, ymin / height)),
      width: Math.max(0, Math.min(1, cropWidth / width)),
      height: Math.max(0, Math.min(1, cropHeight / height)),
    };
  }

  return {
    enabled,
    region,
    aspectRatio: null,
  };
}

/**
 * Parse channel mode from ChannelSelect protocol nodes.
 */
export function parseChannelMode(dto: GTODTO): ChannelMode | null {
  const nodes = dto.byProtocol('ChannelSelect');
  if (nodes.length === 0) return null;

  const channelMap: Record<number, ChannelMode> = {
    0: 'red',
    1: 'green',
    2: 'blue',
    3: 'alpha',
    4: 'rgb',
    5: 'luminance',
  };

  for (const node of nodes) {
    const nodeComp = node.component('node');
    const active = nodeComp?.exists() ? getNumberValue(nodeComp.property('active').value()) : undefined;
    if (active !== undefined && active === 0) {
      continue;
    }

    const parametersComp = node.component('parameters');
    const channelValue = parametersComp?.exists()
      ? getNumberValue(parametersComp.property('channel').value())
      : undefined;
    if (channelValue !== undefined) {
      return channelMap[channelValue] ?? 'rgb';
    }
  }

  return null;
}

/**
 * Parse stereo display settings from RVDisplayStereo protocol nodes.
 */
export function parseStereo(dto: GTODTO): StereoState | null {
  const nodes = dto.byProtocol('RVDisplayStereo');
  if (nodes.length === 0) return null;

  const stereoComp = nodes.first().component('stereo');
  if (!stereoComp?.exists()) return null;

  const typeValue = getStringValue(stereoComp.property('type').value()) ?? 'off';
  const swapValue = getNumberValue(stereoComp.property('swap').value());
  const offsetValue = getNumberValue(stereoComp.property('relativeOffset').value());

  const typeMap: Record<string, StereoState['mode']> = {
    off: 'off',
    mono: 'off',
    pair: 'side-by-side',
    mirror: 'mirror',
    hsqueezed: 'side-by-side',
    vsqueezed: 'over-under',
    anaglyph: 'anaglyph',
    lumanaglyph: 'anaglyph-luminance',
    checker: 'checkerboard',
    scanline: 'scanline',
  };

  const mode = typeMap[typeValue] ?? 'off';
  const offset = typeof offsetValue === 'number' ? offsetValue * 100 : 0;
  const clampedOffset = Math.max(-20, Math.min(20, offset));

  return {
    mode,
    eyeSwap: swapValue === 1,
    offset: clampedOffset,
  };
}

/**
 * Parse scope visibility states from Histogram, Waveform, and Vectorscope protocol nodes.
 */
export function parseScopes(dto: GTODTO): ScopesState | null {
  const scopes: ScopesState = {
    histogram: false,
    waveform: false,
    vectorscope: false,
    gamutDiagram: false,
  };

  const applyScope = (protocol: string, key: keyof ScopesState): void => {
    const nodes = dto.byProtocol(protocol);
    if (nodes.length === 0) return;
    const node = nodes.first();
    const nodeComp = node.component('node');
    const active = nodeComp?.exists() ? getNumberValue(nodeComp.property('active').value()) : undefined;
    if (active !== undefined) {
      scopes[key] = active !== 0;
    }
  };

  applyScope('Histogram', 'histogram');
  applyScope('RVHistogram', 'histogram');
  applyScope('Waveform', 'waveform');
  applyScope('RVWaveform', 'waveform');
  applyScope('Vectorscope', 'vectorscope');
  applyScope('RVVectorscope', 'vectorscope');
  applyScope('GamutDiagram', 'gamutDiagram');
  applyScope('RVGamutDiagram', 'gamutDiagram');

  if (scopes.histogram || scopes.waveform || scopes.vectorscope || scopes.gamutDiagram) {
    return scopes;
  }

  return null;
}
