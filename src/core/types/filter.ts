export interface FilterSettings {
  blur: number;
  sharpen: number;
}

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  blur: 0,
  sharpen: 0,
};

/** Texture filtering mode for the primary image texture. */
export type TextureFilterMode = 'nearest' | 'linear';
