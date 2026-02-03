/**
 * OCIOConfig - OpenColorIO configuration management
 *
 * Provides built-in OCIO configurations and color space definitions
 * for common VFX workflows (ACES, sRGB, Rec.709).
 */

/**
 * OCIO pipeline state interface
 */
export interface OCIOState {
  /** Whether OCIO pipeline is enabled */
  enabled: boolean;
  /** Active configuration name */
  configName: string;
  /** Path to custom config file (if loaded) */
  customConfigPath: string | null;

  /** Input color space (source media) */
  inputColorSpace: string;
  /** Auto-detected color space from metadata */
  detectedColorSpace: string | null;

  /** Working color space (where grading happens) */
  workingColorSpace: string;

  /** Display device color space */
  display: string;
  /** View transform (tone mapping / creative look) */
  view: string;

  /** Optional look transform */
  look: string;
  /** Look transform direction */
  lookDirection: 'forward' | 'inverse';
}

/**
 * Default OCIO state
 */
export const DEFAULT_OCIO_STATE: OCIOState = {
  enabled: false,
  configName: 'aces_1.2',
  customConfigPath: null,
  inputColorSpace: 'Auto',
  detectedColorSpace: null,
  workingColorSpace: 'ACEScg',
  display: 'sRGB',
  view: 'ACES 1.0 SDR-video',
  look: 'None',
  lookDirection: 'forward',
};

/**
 * Color space definition
 */
export interface ColorSpaceDefinition {
  /** Color space name (identifier) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Color space family/category */
  family: string;
  /** Encoding type */
  encoding: 'scene-linear' | 'log' | 'sdr-video' | 'data';
  /** Whether this is a working space */
  isWorkingSpace?: boolean;
  /** Whether this is a display space */
  isDisplaySpace?: boolean;
}

/**
 * Display definition
 */
export interface DisplayDefinition {
  /** Display name */
  name: string;
  /** Available views for this display */
  views: string[];
}

/**
 * Look definition
 */
export interface LookDefinition {
  /** Look name */
  name: string;
  /** Description */
  description: string;
}

/**
 * OCIO configuration definition
 */
export interface OCIOConfigDefinition {
  /** Config name */
  name: string;
  /** Config version */
  version: string;
  /** Description */
  description: string;
  /** Available color spaces */
  colorSpaces: ColorSpaceDefinition[];
  /** Available displays */
  displays: DisplayDefinition[];
  /** Available looks */
  looks: LookDefinition[];
  /** Default roles */
  roles: {
    default: string;
    reference: string;
    colorPicking: string;
    data: string;
  };
}

/**
 * Built-in ACES 1.2 configuration
 */
const ACES_1_2_CONFIG: OCIOConfigDefinition = {
  name: 'aces_1.2',
  version: '1.2',
  description: 'Academy Color Encoding System 1.2',
  colorSpaces: [
    {
      name: 'ACES2065-1',
      description: 'Academy Color Encoding Specification (linear)',
      family: 'ACES',
      encoding: 'scene-linear',
      isWorkingSpace: true,
    },
    {
      name: 'ACEScg',
      description: 'ACES CG working space (linear, AP1 primaries)',
      family: 'ACES',
      encoding: 'scene-linear',
      isWorkingSpace: true,
    },
    {
      name: 'ACEScct',
      description: 'ACES camera log (contrast-controlled)',
      family: 'ACES',
      encoding: 'log',
    },
    {
      name: 'ACEScc',
      description: 'ACES color correction space (log)',
      family: 'ACES',
      encoding: 'log',
    },
    {
      name: 'Linear sRGB',
      description: 'Linear sRGB (BT.709 primaries)',
      family: 'Utility',
      encoding: 'scene-linear',
      isWorkingSpace: true,
    },
    {
      name: 'sRGB',
      description: 'sRGB display space (with gamma)',
      family: 'Display',
      encoding: 'sdr-video',
      isDisplaySpace: true,
    },
    {
      name: 'Rec.709',
      description: 'ITU-R BT.709 (HD video)',
      family: 'Display',
      encoding: 'sdr-video',
      isDisplaySpace: true,
    },
    {
      name: 'ARRI LogC3 (EI 800)',
      description: 'ARRI ALEXA LogC3 at EI 800',
      family: 'Camera',
      encoding: 'log',
    },
    {
      name: 'ARRI LogC4',
      description: 'ARRI ALEXA 35 LogC4',
      family: 'Camera',
      encoding: 'log',
    },
    {
      name: 'Sony S-Log3',
      description: 'Sony S-Log3 / S-Gamut3.Cine',
      family: 'Camera',
      encoding: 'log',
    },
    {
      name: 'RED Log3G10',
      description: 'RED Log3G10 / REDWideGamutRGB',
      family: 'Camera',
      encoding: 'log',
    },
    {
      name: 'DCI-P3',
      description: 'DCI-P3 display space',
      family: 'Display',
      encoding: 'sdr-video',
      isDisplaySpace: true,
    },
    {
      name: 'Rec.2020',
      description: 'ITU-R BT.2020 wide gamut HDR broadcast',
      family: 'Display',
      encoding: 'sdr-video',
      isDisplaySpace: true,
    },
    {
      name: 'Adobe RGB',
      description: 'Adobe RGB (1998) photography workflow',
      family: 'Utility',
      encoding: 'sdr-video',
    },
    {
      name: 'ProPhoto RGB',
      description: 'ProPhoto RGB (ROMM RGB) wide gamut photography',
      family: 'Utility',
      encoding: 'scene-linear',
      isWorkingSpace: true,
    },
    {
      name: 'Raw',
      description: 'Pass-through (no transform)',
      family: 'Utility',
      encoding: 'data',
    },
  ],
  displays: [
    {
      name: 'sRGB',
      views: ['ACES 1.0 SDR-video', 'Raw', 'Log'],
    },
    {
      name: 'Rec.709',
      views: ['ACES 1.0 SDR-video', 'Raw', 'Log'],
    },
    {
      name: 'DCI-P3',
      views: ['ACES 1.0 SDR-video', 'Raw'],
    },
    {
      name: 'Rec.2020',
      views: ['ACES 1.0 SDR-video', 'Raw'],
    },
  ],
  looks: [
    {
      name: 'None',
      description: 'No look applied',
    },
    {
      name: 'ACES 1.0',
      description: 'ACES 1.0 reference rendering',
    },
    {
      name: 'Filmic',
      description: 'Filmic contrast look',
    },
  ],
  roles: {
    default: 'sRGB',
    reference: 'ACES2065-1',
    colorPicking: 'sRGB',
    data: 'Raw',
  },
};

/**
 * Built-in simple sRGB configuration
 */
const SRGB_CONFIG: OCIOConfigDefinition = {
  name: 'srgb',
  version: '1.0',
  description: 'Simple sRGB workflow',
  colorSpaces: [
    {
      name: 'Linear sRGB',
      description: 'Linear sRGB (BT.709 primaries)',
      family: 'Utility',
      encoding: 'scene-linear',
      isWorkingSpace: true,
    },
    {
      name: 'sRGB',
      description: 'sRGB display space (with gamma)',
      family: 'Display',
      encoding: 'sdr-video',
      isDisplaySpace: true,
    },
    {
      name: 'Rec.709',
      description: 'ITU-R BT.709 (HD video)',
      family: 'Display',
      encoding: 'sdr-video',
      isDisplaySpace: true,
    },
    {
      name: 'Raw',
      description: 'Pass-through (no transform)',
      family: 'Utility',
      encoding: 'data',
    },
  ],
  displays: [
    {
      name: 'sRGB',
      views: ['Standard', 'Raw'],
    },
    {
      name: 'Rec.709',
      views: ['Standard', 'Raw'],
    },
  ],
  looks: [
    {
      name: 'None',
      description: 'No look applied',
    },
  ],
  roles: {
    default: 'sRGB',
    reference: 'Linear sRGB',
    colorPicking: 'sRGB',
    data: 'Raw',
  },
};

/**
 * All built-in configurations
 */
const BUILTIN_CONFIGS: Record<string, OCIOConfigDefinition> = {
  aces_1_2: ACES_1_2_CONFIG,
  srgb: SRGB_CONFIG,
};

/**
 * Custom (user-loaded) configurations
 */
const CUSTOM_CONFIGS: Record<string, OCIOConfigDefinition> = {};

/**
 * Get a built-in OCIO configuration by name
 *
 * @param name - Configuration name ('aces_1.2', 'srgb')
 * @returns Configuration definition
 * @throws Error if configuration not found
 */
export function getBuiltinConfig(name: string): OCIOConfigDefinition {
  // Normalize name (allow both 'aces_1.2' and 'aces_1_2')
  const normalizedName = name.replace(/\./g, '_');

  // Check built-in configs first, then custom configs
  const config = BUILTIN_CONFIGS[normalizedName] ?? CUSTOM_CONFIGS[normalizedName] ?? CUSTOM_CONFIGS[name];

  if (!config) {
    const allKeys = [...Object.keys(BUILTIN_CONFIGS), ...Object.keys(CUSTOM_CONFIGS)];
    const available = allKeys.join(', ');
    throw new Error(`Unknown OCIO config: ${name}. Available: ${available}`);
  }

  return config;
}

/**
 * Get list of available built-in configurations
 */
export function getAvailableConfigs(): Array<{ name: string; description: string }> {
  const builtins = Object.values(BUILTIN_CONFIGS).map((config) => ({
    name: config.name,
    description: config.description,
  }));
  const customs = Object.values(CUSTOM_CONFIGS).map((config) => ({
    name: config.name,
    description: config.description,
  }));
  return [...builtins, ...customs];
}

/**
 * Get available input color spaces for a configuration
 * Includes 'Auto' as first option
 */
export function getInputColorSpaces(configName: string): string[] {
  const config = getBuiltinConfig(configName);
  return ['Auto', ...config.colorSpaces.map((cs) => cs.name)];
}

/**
 * Get available working color spaces for a configuration
 * Only returns spaces marked as working spaces
 */
export function getWorkingColorSpaces(configName: string): string[] {
  const config = getBuiltinConfig(configName);
  return config.colorSpaces.filter((cs) => cs.isWorkingSpace).map((cs) => cs.name);
}

/**
 * Get available displays for a configuration
 */
export function getDisplays(configName: string): string[] {
  const config = getBuiltinConfig(configName);
  return config.displays.map((d) => d.name);
}

/**
 * Get available views for a display
 */
export function getViewsForDisplay(configName: string, display: string): string[] {
  const config = getBuiltinConfig(configName);
  const displayDef = config.displays.find((d) => d.name === display);
  return displayDef?.views ?? [];
}

/**
 * Get available looks for a configuration
 */
export function getLooks(configName: string): string[] {
  const config = getBuiltinConfig(configName);
  return config.looks.map((l) => l.name);
}

/**
 * Check if a state is the default state
 */
export function isDefaultOCIOState(state: OCIOState): boolean {
  return (
    !state.enabled &&
    state.configName === DEFAULT_OCIO_STATE.configName &&
    state.inputColorSpace === DEFAULT_OCIO_STATE.inputColorSpace &&
    state.workingColorSpace === DEFAULT_OCIO_STATE.workingColorSpace &&
    state.display === DEFAULT_OCIO_STATE.display &&
    state.view === DEFAULT_OCIO_STATE.view &&
    state.look === DEFAULT_OCIO_STATE.look &&
    state.lookDirection === DEFAULT_OCIO_STATE.lookDirection
  );
}

/**
 * Register a custom OCIO configuration.
 * Custom configs are available alongside built-in configs.
 *
 * @param config - The configuration definition to register
 */
export function registerCustomConfig(config: OCIOConfigDefinition): void {
  const normalizedName = config.name.replace(/\./g, '_');
  CUSTOM_CONFIGS[normalizedName] = config;
  // Also store under original name for direct lookup
  if (normalizedName !== config.name) {
    CUSTOM_CONFIGS[config.name] = config;
  }
}

/**
 * Remove a custom OCIO configuration by name.
 *
 * @param name - The name of the custom config to remove
 */
export function removeCustomConfig(name: string): void {
  const normalizedName = name.replace(/\./g, '_');
  delete CUSTOM_CONFIGS[normalizedName];
  // Also try the original name in case it was stored without normalization
  delete CUSTOM_CONFIGS[name];
}
