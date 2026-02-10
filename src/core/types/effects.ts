export type ToneMappingOperator = 'off' | 'reinhard' | 'filmic' | 'aces' | 'agx' | 'pbrNeutral' | 'gt' | 'acesHill';

export interface ToneMappingState {
  enabled: boolean;
  operator: ToneMappingOperator;
  reinhardWhitePoint?: number;
  filmicExposureBias?: number;
  filmicWhitePoint?: number;
}

export const DEFAULT_TONE_MAPPING_STATE: ToneMappingState = {
  enabled: false,
  operator: 'off',
  reinhardWhitePoint: 4.0,
  filmicExposureBias: 2.0,
  filmicWhitePoint: 11.2,
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
];

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
