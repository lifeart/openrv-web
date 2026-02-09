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
import type { ColorAdjustments, ChannelMode } from '../../core/types/color';
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

  return Object.keys(settings).length > 0 ? settings : null;
}

/**
 * Parse color adjustments from RVColor and RVDisplayColor protocol nodes.
 */
export function parseColorAdjustments(dto: GTODTO): Partial<ColorAdjustments> | null {
  const adjustments: Partial<ColorAdjustments> = {};
  const colorNodes = dto.byProtocol('RVColor');

  if (colorNodes.length > 0) {
    const colorComp = colorNodes.first().component('color');
    if (colorComp?.exists()) {
      const exposure = getNumberValue(colorComp.property('exposure').value());
      const gamma = getNumberValue(colorComp.property('gamma').value());
      const contrast = getNumberValue(colorComp.property('contrast').value());
      const saturation = getNumberValue(colorComp.property('saturation').value());
      const offset = getNumberValue(colorComp.property('offset').value());

      if (typeof exposure === 'number') adjustments.exposure = exposure;
      if (typeof gamma === 'number') adjustments.gamma = gamma;
      if (typeof contrast === 'number') adjustments.contrast = contrast === 0 ? 1 : contrast;
      if (typeof saturation === 'number') adjustments.saturation = saturation;
      if (typeof offset === 'number' && adjustments.brightness === undefined) {
        adjustments.brightness = offset;
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

  if (scopes.histogram || scopes.waveform || scopes.vectorscope) {
    return scopes;
  }

  return null;
}
