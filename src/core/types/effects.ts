export type ToneMappingOperator = 'off' | 'reinhard' | 'filmic' | 'aces' | 'agx' | 'pbrNeutral' | 'gt' | 'acesHill' | 'drago';

export interface ToneMappingState {
  enabled: boolean;
  operator: ToneMappingOperator;
  reinhardWhitePoint?: number;
  filmicExposureBias?: number;
  filmicWhitePoint?: number;
  dragoBias?: number;        // default 0.85 (range 0.5-1.0)
  dragoLwa?: number;         // scene average luminance (from LuminanceAnalyzer)
  dragoLmax?: number;        // estimated scene max luminance (linearAvg * dynamic range multiplier)
  dragoBrightness?: number;  // post-Drago brightness multiplier (default 2.0, range 0.5-5.0)
}

export const DEFAULT_TONE_MAPPING_STATE: ToneMappingState = {
  enabled: false,
  operator: 'off',
  reinhardWhitePoint: 4.0,
  filmicExposureBias: 2.0,
  filmicWhitePoint: 11.2,
  dragoBias: 0.85,
  dragoLwa: 0.2,
  dragoLmax: 1.5,
  dragoBrightness: 2.0,
};

export interface ToneMappingOperatorInfo {
  key: ToneMappingOperator;
  label: string;
  description: string;
}

export const TONE_MAPPING_OPERATORS: ToneMappingOperatorInfo[] = [
  { key: 'off', label: 'Off', description: 'No tone mapping (linear)' },
  { key: 'reinhard', label: 'Reinhard', description: 'Simple global operator' },
  { key: 'filmic', label: 'Filmic', description: 'Film-like S-curve response' },
  { key: 'aces', label: 'ACES', description: 'Academy Color Encoding System' },
  { key: 'agx', label: 'AgX', description: 'Best hue preservation in saturated highlights' },
  { key: 'pbrNeutral', label: 'PBR Neutral', description: 'Minimal hue/saturation shift' },
  { key: 'gt', label: 'GT', description: 'Gran Turismo smooth highlight rolloff' },
  { key: 'acesHill', label: 'ACES Hill', description: 'Accurate RRT+ODT fit by Stephen Hill' },
  { key: 'drago', label: 'Drago', description: 'Adaptive logarithmic (requires scene analysis)' },
];

// --- Gamut Mapping ---

export type GamutMappingMode = 'off' | 'clip' | 'compress';
export type GamutIdentifier = 'srgb' | 'rec2020' | 'display-p3';

export interface GamutMappingState {
  mode: GamutMappingMode;
  sourceGamut: GamutIdentifier;
  targetGamut: GamutIdentifier;
  highlightOutOfGamut?: boolean;
}

export const DEFAULT_GAMUT_MAPPING_STATE: GamutMappingState = {
  mode: 'off',
  sourceGamut: 'srgb',
  targetGamut: 'srgb',
};

// --- Auto-Exposure ---

export interface AutoExposureState {
  enabled: boolean;
  targetKey: number;       // default 0.18 (mid-gray)
  adaptationSpeed: number; // 0.0-1.0 EMA alpha per update step
  minExposure: number;     // floor in stops
  maxExposure: number;     // ceiling in stops
}

export const DEFAULT_AUTO_EXPOSURE_STATE: AutoExposureState = {
  enabled: false,
  targetKey: 0.18,
  adaptationSpeed: 0.05,
  minExposure: -5.0,
  maxExposure: 5.0,
};

export type HDROutputMode = 'sdr' | 'hlg' | 'pq' | 'extended';

export interface ZebraState {
  enabled: boolean;
  highEnabled: boolean;
  lowEnabled: boolean;
  highThreshold: number;
  lowThreshold: number;
}

export const DEFAULT_ZEBRA_STATE: ZebraState = {
  enabled: false,
  highEnabled: true,
  lowEnabled: false,
  highThreshold: 95,
  lowThreshold: 5,
};

export interface HighlightsShadowsState {
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

export interface VibranceState {
  vibrance: number;
  skinProtection: boolean;
}

export interface ClarityState {
  clarity: number;
}

export interface SharpenState {
  amount: number;
}

export interface FalseColorState {
  enabled: boolean;
  lut: Uint8Array | null;
}
