import { GTOBuilder } from 'gto-js';
import type { ObjectData } from 'gto-js';

/**
 * Flattens a 2D matrix to a 1D array for GTO serialization
 */
function flattenMatrix(matrix: number[][]): number[] {
  return matrix.flat();
}

/**
 * Color exposure settings
 */
export interface ColorExposureSettings {
  /** Enable effect */
  active?: boolean;
  /** Exposure stops */
  exposure?: number;
}

/**
 * Color curve (contrast) settings
 */
export interface ColorCurveSettings {
  /** Enable effect */
  active?: boolean;
  /** Contrast amount */
  contrast?: number;
}

/**
 * Color temperature settings
 */
export interface ColorTemperatureSettings {
  /** Enable effect */
  active?: boolean;
  /** Input white point [x, y] */
  inWhitePrimary?: [number, number];
  /** Input temperature in Kelvin */
  inTemperature?: number;
  /** Output temperature in Kelvin */
  outTemperature?: number;
  /** Adaptation method (0=Bradford, 1=Von Kries, 2=XYZ Scaling) */
  method?: number;
}

/**
 * Color saturation settings
 */
export interface ColorSaturationSettings {
  /** Enable effect */
  active?: boolean;
  /** Saturation multiplier */
  saturation?: number;
}

/**
 * Color vibrance settings
 */
export interface ColorVibranceSettings {
  /** Enable effect */
  active?: boolean;
  /** Vibrance amount */
  vibrance?: number;
}

/**
 * Color shadow settings
 */
export interface ColorShadowSettings {
  /** Enable effect */
  active?: boolean;
  /** Shadow adjustment */
  shadow?: number;
}

/**
 * Color highlight settings
 */
export interface ColorHighlightSettings {
  /** Enable effect */
  active?: boolean;
  /** Highlight adjustment */
  highlight?: number;
}

/**
 * Color grayscale settings
 */
export interface ColorGrayScaleSettings {
  /** Enable effect */
  active?: boolean;
}

/**
 * Standalone CDL node settings
 */
export interface ColorCDLSettings {
  /** Enable effect */
  active?: boolean;
  /** CDL file path */
  file?: string;
  /** Working colorspace */
  colorspace?: string;
  /** CDL slope [R, G, B] */
  slope?: [number, number, number];
  /** CDL offset [R, G, B] */
  offset?: [number, number, number];
  /** CDL power [R, G, B] */
  power?: [number, number, number];
  /** CDL saturation */
  saturation?: number;
  /** Disable value clamping */
  noClamp?: boolean;
}

/**
 * Linear to sRGB conversion settings
 */
export interface ColorLinearToSRGBSettings {
  /** Enable effect */
  active?: boolean;
}

/**
 * sRGB to linear conversion settings
 */
export interface ColorSRGBToLinearSettings {
  /** Enable effect */
  active?: boolean;
}

/**
 * Primary color conversion settings
 */
export interface PrimaryConvertSettings {
  /** Enable conversion */
  active?: boolean;
  /** Input primaries (e.g., 'sRGB', 'AdobeRGB', 'P3', 'Rec709', 'Rec2020') */
  inPrimaries?: string;
  /** Output primaries */
  outPrimaries?: string;
  /** Chromatic adaptation method */
  adaptationMethod?: number;
}

/**
 * OCIO (OpenColorIO) settings for color management
 */
export interface OCIOSettings {
  /** OCIO function type */
  function?: string;
  /** Enable OCIO */
  active?: boolean;
  /** Input colorspace */
  inColorSpace?: string;
  /** Output colorspace */
  outColorSpace?: string;
  /** 3D LUT resolution */
  lut3DSize?: number;
  /** Look name */
  look?: string;
  /** Look direction (0 = forward, 1 = inverse) */
  lookDirection?: number;
  /** Display name */
  display?: string;
  /** View transform name */
  view?: string;
  /** Enable dithering */
  dither?: boolean;
  /** Channel order (e.g., 'RGBA') */
  channelOrder?: string;
  /** Input transform URL */
  inTransformUrl?: string;
  /** Output transform URL */
  outTransformUrl?: string;
  /** Config description */
  configDescription?: string;
  /** Working directory */
  workingDir?: string;
}

/**
 * ICC (ICC Profile) settings for color profile transforms
 */
export interface ICCSettings {
  /** Enable ICC */
  active?: boolean;
  /** 2D LUT samples */
  samples2D?: number;
  /** 3D LUT samples */
  samples3D?: number;
  /** Input profile URL */
  inProfileUrl?: string;
  /** Input profile description */
  inProfileDescription?: string;
  /** Output profile URL */
  outProfileUrl?: string;
  /** Output profile description */
  outProfileDescription?: string;
}

/**
 * Cineon log settings
 */
export interface CineonSettings {
  /** White code value (default: 685) */
  whiteCodeValue?: number;
  /** Black code value (default: 95) */
  blackCodeValue?: number;
  /** Soft clip break point (default: 685) */
  breakPointValue?: number;
}

/**
 * LUT settings for linearization
 */
export interface LinearizeLUTSettings {
  /** LUT is active */
  active?: boolean;
  /** LUT file path */
  file?: string;
  /** LUT name */
  name?: string;
  /** LUT type (Luminance, RGB, etc.) */
  type?: string;
  /** Scale factor */
  scale?: number;
  /** Offset value */
  offset?: number;
  /** LUT dimensions [x, y, z] */
  size?: number[];
  /** Input transformation matrix (4x4) */
  inMatrix?: number[][];
  /** Output transformation matrix (4x4) */
  outMatrix?: number[][];
}

/**
 * Linearization settings for RVLinearize export
 */
export interface LinearizeSettings {
  /** Node is active */
  active?: boolean;

  // Color component settings
  /** Color processing active */
  colorActive?: boolean;
  /** LUT selection string */
  lut?: string;
  /** Alpha handling mode (0=none, 1=premult, 2=unpremult) */
  alphaType?: number;
  /** Log curve type (0=none, 1=cineon, 2=viper, etc.) */
  logtype?: number;
  /** YUV conversion enabled */
  yuv?: boolean;
  /** Invert linearization */
  invert?: boolean;
  /** Apply sRGB to linear conversion */
  sRGB2linear?: boolean;
  /** Apply Rec709 to linear conversion */
  rec709ToLinear?: boolean;
  /** File gamma value */
  fileGamma?: number;
  /** Ignore file chromaticities */
  ignoreChromaticities?: boolean;

  /** Cineon settings */
  cineon?: CineonSettings;
  /** LUT settings */
  lutSettings?: LinearizeLUTSettings;
  /** CDL settings for linearization */
  cdl?: {
    /** CDL is active */
    active?: boolean;
    /** Slope RGB values [r, g, b] */
    slope?: number[];
    /** Offset RGB values [r, g, b] */
    offset?: number[];
    /** Power RGB values [r, g, b] */
    power?: number[];
    /** Saturation value */
    saturation?: number;
    /** Disable clamping */
    noClamp?: boolean;
  };
}

/**
 * Luminance LUT settings for RVColor
 */
export interface LuminanceLUTSettings {
  /** LUT is active */
  active?: boolean;
  /** LUT data (float array) */
  lut?: number[];
  /** Maximum range */
  max?: number;
  /** Input LUT size */
  size?: number;
  /** LUT identifier */
  name?: string;
}

/**
 * RVColor settings for color correction export
 */
export interface ColorSettings {
  /** Node is active */
  active?: boolean;
  /** Invert colors */
  invert?: boolean;
  /** Per-channel gamma [r, g, b] or single value */
  gamma?: number | number[];
  /** LUT selection */
  lut?: string;
  /** RGB offset [r, g, b] or single value */
  offset?: number | number[];
  /** RGB scale [r, g, b] */
  scale?: number[];
  /** Per-channel exposure [r, g, b] or single value */
  exposure?: number | number[];
  /** Contrast adjustment [r, g, b] or single value */
  contrast?: number | number[];
  /** Saturation control */
  saturation?: number;
  /** Normalize color bounds */
  normalize?: boolean;
  /** Hue rotation */
  hue?: number;
  /** Unpremultiply alpha */
  unpremult?: boolean;

  /** CDL settings */
  cdl?: {
    /** CDL is active */
    active?: boolean;
    /** Colorspace (rec709, aceslog, aces) */
    colorspace?: string;
    /** CDL slope [r, g, b] */
    slope?: number[];
    /** CDL offset [r, g, b] */
    offset?: number[];
    /** CDL power [r, g, b] */
    power?: number[];
    /** CDL saturation */
    saturation?: number;
    /** Disable clamping */
    noClamp?: boolean;
  };

  /** Luminance LUT settings */
  luminanceLUT?: LuminanceLUTSettings;

  /** Output matrix for channel remapping (4x4 or flat 16-element array) */
  outputMatrix?: number[][] | number[];
}

/**
 * LookLUT settings for RVLookLUT/RVCacheLUT export
 */
export interface LookLUTSettings {
  /** Node is active */
  active?: boolean;
  /** LUT is active (component level) */
  lutActive?: boolean;
  /** LUT file path */
  file?: string;
  /** LUT name */
  name?: string;
  /** LUT type (Luminance, RGB, etc.) */
  type?: string;
  /** Scale factor */
  scale?: number;
  /** Offset value */
  offset?: number;
  /** Conditioning gamma */
  conditioningGamma?: number;
  /** LUT dimensions [x, y, z] */
  size?: number[];
  /** Pre-LUT size */
  preLUTSize?: number;
  /** Input transformation matrix (4x4) */
  inMatrix?: number[][];
  /** Output transformation matrix (4x4) */
  outMatrix?: number[][];
  /** Pre-compiled LUT data (for RVCacheLUT) */
  lutData?: number[];
  /** Pre-compiled pre-LUT data */
  prelutData?: number[];
}

/**
 * RVDisplayColor settings for display output color processing
 */
export interface DisplayColorSettings {
  /** Node is active */
  active?: boolean;
  /** Channel reordering (e.g., 'RGBA', 'BGRA') */
  channelOrder?: string;
  /** Channel flood mode */
  channelFlood?: number;
  /** Premultiplication */
  premult?: boolean;
  /** Display gamma */
  gamma?: number;
  /** sRGB output conversion */
  sRGB?: boolean;
  /** Rec709 output conversion */
  Rec709?: boolean;
  /** Brightness adjustment */
  brightness?: number;
  /** Out-of-range handling */
  outOfRange?: number;
  /** Dithering mode */
  dither?: number;
  /** Dither application order */
  ditherLast?: boolean;
  /** Custom matrix (4x4) */
  matrix?: number[][];
  /** Override colorspace */
  overrideColorspace?: string;
  /** Chromaticity settings */
  chromaticities?: {
    active?: boolean;
    adoptedNeutral?: boolean;
    white?: [number, number];
    red?: [number, number];
    green?: [number, number];
    blue?: [number, number];
    neutral?: [number, number];
  };
}

/**
 * Color serialization functions for GTO export.
 * Handles all color-related node building: exposure, curves, temperature,
 * saturation, vibrance, shadows, highlights, grayscale, CDL, linearize,
 * LUTs, OCIO, ICC, display color, and primary convert.
 */
export const ColorSerializer = {
  /**
   * Build an RVColorExposure object
   */
  buildColorExposureObject(name: string, settings: ColorExposureSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorExposure', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('exposure', settings.exposure ?? 0.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColorCurve object
   */
  buildColorCurveObject(name: string, settings: ColorCurveSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorCurve', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('contrast', settings.contrast ?? 0.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColorTemperature object
   */
  buildColorTemperatureObject(name: string, settings: ColorTemperatureSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorTemperature', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('inWhitePrimary', settings.inWhitePrimary ?? [0.3457, 0.3585])
      .float('inTemperature', settings.inTemperature ?? 6500.0)
      .float('outTemperature', settings.outTemperature ?? 6500.0)
      .int('method', settings.method ?? 2)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColorSaturation object
   */
  buildColorSaturationObject(name: string, settings: ColorSaturationSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorSaturation', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('saturation', settings.saturation ?? 1.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColorVibrance object
   */
  buildColorVibranceObject(name: string, settings: ColorVibranceSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorVibrance', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('vibrance', settings.vibrance ?? 0.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColorShadow object
   */
  buildColorShadowObject(name: string, settings: ColorShadowSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorShadow', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('shadow', settings.shadow ?? 0.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColorHighlight object
   */
  buildColorHighlightObject(name: string, settings: ColorHighlightSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorHighlight', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('highlight', settings.highlight ?? 0.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColorGrayScale object
   */
  buildColorGrayScaleObject(name: string, settings: ColorGrayScaleSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorGrayScale', 1);
    obj.component('node')
      .int('active', settings.active ? 1 : 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColorCDL object (standalone CDL node)
   */
  buildColorCDLObject(name: string, settings: ColorCDLSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorCDL', 1);
    const nodeComp = obj.component('node');
    nodeComp
      .int('active', settings.active !== false ? 1 : 0)
      .string('colorspace', settings.colorspace ?? 'rec709')
      .float('slope', settings.slope ?? [1, 1, 1])
      .float('offset', settings.offset ?? [0, 0, 0])
      .float('power', settings.power ?? [1, 1, 1])
      .float('saturation', settings.saturation ?? 1.0)
      .int('noClamp', settings.noClamp ? 1 : 0);

    if (settings.file) {
      nodeComp.string('file', settings.file);
    }

    nodeComp.end();
    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColorLinearToSRGB object
   */
  buildColorLinearToSRGBObject(name: string, settings: ColorLinearToSRGBSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorLinearToSRGB', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColorSRGBToLinear object
   */
  buildColorSRGBToLinearObject(name: string, settings: ColorSRGBToLinearSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorSRGBToLinear', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVPrimaryConvert object for color primary conversion
   */
  buildPrimaryConvertObject(name: string, settings: PrimaryConvertSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVPrimaryConvert', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .string('inPrimaries', settings.inPrimaries ?? 'sRGB')
      .string('outPrimaries', settings.outPrimaries ?? 'sRGB')
      .int('adaptationMethod', settings.adaptationMethod ?? 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVOCIO object for OpenColorIO color management
   */
  buildOCIOObject(name: string, settings: OCIOSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const ocioObject = builder.object(name, 'RVOCIO', 1);

    // Main OCIO component
    const ocioComp = ocioObject.component('ocio');
    ocioComp
      .int('active', settings.active !== false ? 1 : 0);
    if (settings.function) {
      ocioComp.string('function', settings.function);
    }
    if (settings.inColorSpace) {
      ocioComp.string('inColorSpace', settings.inColorSpace);
    }
    if (settings.lut3DSize !== undefined) {
      ocioComp.int('lut3DSize', settings.lut3DSize);
    }
    ocioComp.end();

    // Color output component
    if (settings.outColorSpace) {
      ocioObject
        .component('ocio_color')
        .string('outColorSpace', settings.outColorSpace)
        .end();
    }

    // Look component
    if (settings.look || settings.lookDirection !== undefined) {
      const lookComp = ocioObject.component('ocio_look');
      if (settings.look) {
        lookComp.string('look', settings.look);
      }
      lookComp.int('direction', settings.lookDirection ?? 0);
      if (settings.outColorSpace) {
        lookComp.string('outColorSpace', settings.outColorSpace);
      }
      lookComp.end();
    }

    // Display component
    if (settings.display || settings.view) {
      const displayComp = ocioObject.component('ocio_display');
      if (settings.display) {
        displayComp.string('display', settings.display);
      }
      if (settings.view) {
        displayComp.string('view', settings.view);
      }
      displayComp.end();
    }

    // Color settings component
    ocioObject
      .component('color')
      .int('dither', settings.dither ? 1 : 0)
      .string('channelOrder', settings.channelOrder ?? 'RGBA')
      .end();

    // Input transform component
    if (settings.inTransformUrl) {
      ocioObject
        .component('inTransform')
        .string('url', settings.inTransformUrl)
        .end();
    }

    // Output transform component
    if (settings.outTransformUrl) {
      ocioObject
        .component('outTransform')
        .string('url', settings.outTransformUrl)
        .end();
    }

    // Config component
    if (settings.configDescription || settings.workingDir) {
      const configComp = ocioObject.component('config');
      if (settings.configDescription) {
        configComp.string('description', settings.configDescription);
      }
      if (settings.workingDir) {
        configComp.string('workingDir', settings.workingDir);
      }
      configComp.end();
    }

    ocioObject.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVICC object for ICC color profile transforms
   */
  buildICCObject(name: string, settings: ICCSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const iccObject = builder.object(name, 'RVICCTransform', 1);

    // Node component
    iccObject
      .component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .int('samples2D', settings.samples2D ?? 256)
      .int('samples3D', settings.samples3D ?? 32)
      .end();

    // Input profile component
    if (settings.inProfileUrl || settings.inProfileDescription) {
      const inProfileComp = iccObject.component('inProfile');
      if (settings.inProfileUrl) {
        inProfileComp.string('url', settings.inProfileUrl);
      }
      if (settings.inProfileDescription) {
        inProfileComp.string('description', settings.inProfileDescription);
      }
      inProfileComp.end();
    }

    // Output profile component
    if (settings.outProfileUrl || settings.outProfileDescription) {
      const outProfileComp = iccObject.component('outProfile');
      if (settings.outProfileUrl) {
        outProfileComp.string('url', settings.outProfileUrl);
      }
      if (settings.outProfileDescription) {
        outProfileComp.string('description', settings.outProfileDescription);
      }
      outProfileComp.end();
    }

    iccObject.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVLinearize object for color space conversion
   */
  buildLinearizeObject(name: string, settings: LinearizeSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const linearizeObject = builder.object(name, 'RVLinearize', 1);

    // Node component (active state)
    linearizeObject
      .component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .end();

    // Color component (transfer functions)
    linearizeObject
      .component('color')
      .int('active', settings.colorActive !== false ? 1 : 0)
      .string('lut', settings.lut ?? '')
      .int('alphaType', settings.alphaType ?? 0)
      .int('logtype', settings.logtype ?? 0)
      .int('YUV', settings.yuv ? 1 : 0)
      .int('invert', settings.invert ? 1 : 0)
      .int('sRGB2linear', settings.sRGB2linear ? 1 : 0)
      .int('Rec709ToLinear', settings.rec709ToLinear ? 1 : 0)
      .float('fileGamma', settings.fileGamma ?? 1.0)
      .int('ignoreChromaticities', settings.ignoreChromaticities ? 1 : 0)
      .end();

    // Cineon component (if provided or use defaults)
    const cineon = settings.cineon ?? {};
    linearizeObject
      .component('cineon')
      .int('whiteCodeValue', cineon.whiteCodeValue ?? 685)
      .int('blackCodeValue', cineon.blackCodeValue ?? 95)
      .int('breakPointValue', cineon.breakPointValue ?? 685)
      .end();

    // LUT component (if settings provided)
    const lut = settings.lutSettings ?? {};
    linearizeObject
      .component('lut')
      .int('active', lut.active ? 1 : 0)
      .string('file', lut.file ?? '')
      .string('name', lut.name ?? '')
      .string('type', lut.type ?? 'Luminance')
      .float('scale', lut.scale ?? 1.0)
      .float('offset', lut.offset ?? 0.0)
      .int('size', lut.size ?? [0, 0, 0])
      .end();

    // Add matrices if provided (flatten 2D matrices to 1D arrays for GTO)
    if (lut.inMatrix) {
      const lutComp = linearizeObject.component('lut');
      lutComp.float('inMatrix', flattenMatrix(lut.inMatrix)).end();
    }
    if (lut.outMatrix) {
      const lutComp = linearizeObject.component('lut');
      lutComp.float('outMatrix', flattenMatrix(lut.outMatrix)).end();
    }

    // CDL component (if settings provided)
    if (settings.cdl) {
      const cdl = settings.cdl;
      linearizeObject
        .component('CDL')
        .int('active', cdl.active ? 1 : 0)
        .float3('slope', [cdl.slope ?? [1.0, 1.0, 1.0]])
        .float3('offset', [cdl.offset ?? [0.0, 0.0, 0.0]])
        .float3('power', [cdl.power ?? [1.0, 1.0, 1.0]])
        .float('saturation', cdl.saturation ?? 1.0)
        .int('noClamp', cdl.noClamp ? 1 : 0)
        .end();
    }

    linearizeObject.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVLookLUT or RVCacheLUT object for LUT application
   */
  buildLookLUTObject(
    name: string,
    settings: LookLUTSettings = {},
    protocol: 'RVLookLUT' | 'RVCacheLUT' = 'RVLookLUT'
  ): ObjectData {
    const builder = new GTOBuilder();

    const lutObject = builder.object(name, protocol, 1);

    // Node component (active state)
    lutObject
      .component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .end();

    // LUT component
    lutObject
      .component('lut')
      .int('active', settings.lutActive ? 1 : 0)
      .string('file', settings.file ?? '')
      .string('name', settings.name ?? '')
      .string('type', settings.type ?? 'Luminance')
      .float('scale', settings.scale ?? 1.0)
      .float('offset', settings.offset ?? 0.0)
      .float('conditioningGamma', settings.conditioningGamma ?? 1.0)
      .int('size', settings.size ?? [0, 0, 0])
      .int('preLUTSize', settings.preLUTSize ?? 0)
      .end();

    // Add matrices if provided (flatten 2D matrices to 1D arrays for GTO)
    if (settings.inMatrix) {
      const lutComp = lutObject.component('lut');
      lutComp.float('inMatrix', flattenMatrix(settings.inMatrix)).end();
    }
    if (settings.outMatrix) {
      const lutComp = lutObject.component('lut');
      lutComp.float('outMatrix', flattenMatrix(settings.outMatrix)).end();
    }

    // Add output component for cached LUT data (RVCacheLUT)
    if (protocol === 'RVCacheLUT' && (settings.lutData || settings.prelutData)) {
      const outputComp = lutObject.component('lut:output');
      if (settings.lutData) {
        outputComp.float('lut', settings.lutData);
      }
      if (settings.prelutData) {
        outputComp.float('prelut', settings.prelutData);
      }
      outputComp.end();
    }

    lutObject.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVColor object for color correction
   */
  buildColorObject(name: string, settings: ColorSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const colorObject = builder.object(name, 'RVColor', 1);

    // Helper to convert single value to array or use array directly
    const toFloatArray = (value: number | number[] | undefined, defaultVal: number[]): number[] => {
      if (value === undefined) return defaultVal;
      if (Array.isArray(value)) return value;
      return [value, value, value];
    };

    // Color component
    colorObject
      .component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .int('invert', settings.invert ? 1 : 0)
      .float('gamma', toFloatArray(settings.gamma, [1, 1, 1]))
      .string('lut', settings.lut ?? 'default')
      .float('offset', toFloatArray(settings.offset, [0, 0, 0]))
      .float('scale', settings.scale ?? [1, 1, 1])
      .float('exposure', toFloatArray(settings.exposure, [0, 0, 0]))
      .float('contrast', toFloatArray(settings.contrast, [0, 0, 0]))
      .float('saturation', settings.saturation ?? 1.0)
      .int('normalize', settings.normalize ? 1 : 0)
      .float('hue', settings.hue ?? 0.0)
      .int('unpremult', settings.unpremult ? 1 : 0)
      .end();

    // CDL component (if settings provided)
    if (settings.cdl) {
      const cdl = settings.cdl;
      colorObject
        .component('CDL')
        .int('active', cdl.active !== false ? 1 : 0)
        .string('colorspace', cdl.colorspace ?? 'rec709')
        .float('slope', cdl.slope ?? [1, 1, 1])
        .float('offset', cdl.offset ?? [0, 0, 0])
        .float('power', cdl.power ?? [1, 1, 1])
        .float('saturation', cdl.saturation ?? 1.0)
        .int('noClamp', cdl.noClamp ? 1 : 0)
        .end();
    }

    // Luminance LUT component (if settings provided)
    if (settings.luminanceLUT) {
      const lum = settings.luminanceLUT;
      colorObject
        .component('luminanceLUT')
        .int('active', lum.active ? 1 : 0)
        .float('lut', lum.lut ?? [])
        .float('max', lum.max ?? 1.0)
        .int('size', lum.size ?? 0)
        .string('name', lum.name ?? '')
        .end();
    }

    // Output matrix component (channel remapping)
    if (settings.outputMatrix) {
      // Flatten to 16-element array if needed
      const matrixData = Array.isArray(settings.outputMatrix[0])
        ? (settings.outputMatrix as number[][]).flat()
        : (settings.outputMatrix as number[]);

      colorObject
        .component('matrix:output')
        .float('RGBA', matrixData)
        .end();
    }

    colorObject.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVDisplayColor object for display output color processing
   */
  buildDisplayColorObject(name: string, settings: DisplayColorSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const displayColorObject = builder.object(name, 'RVDisplayColor', 1);

    // Color component
    const colorComp = displayColorObject.component('color');
    colorComp
      .int('active', settings.active !== false ? 1 : 0)
      .string('channelOrder', settings.channelOrder ?? 'RGBA')
      .int('channelFlood', settings.channelFlood ?? 0)
      .int('premult', settings.premult ? 1 : 0)
      .float('gamma', settings.gamma ?? 1.0)
      .int('sRGB', settings.sRGB ? 1 : 0)
      .int('Rec709', settings.Rec709 ? 1 : 0)
      .float('brightness', settings.brightness ?? 0.0)
      .int('outOfRange', settings.outOfRange ?? 0)
      .int('dither', settings.dither ?? 0)
      .int('ditherLast', settings.ditherLast !== false ? 1 : 0);

    if (settings.matrix) {
      colorComp.float('matrix', flattenMatrix(settings.matrix));
    }
    if (settings.overrideColorspace) {
      colorComp.string('overrideColorspace', settings.overrideColorspace);
    }
    colorComp.end();

    // Chromaticities component (if settings provided)
    if (settings.chromaticities) {
      const chrom = settings.chromaticities;
      displayColorObject
        .component('chromaticities')
        .int('active', chrom.active ? 1 : 0)
        .int('adoptedNeutral', chrom.adoptedNeutral !== false ? 1 : 0)
        .float2('white', [chrom.white ?? [0.3127, 0.329]])
        .float2('red', [chrom.red ?? [0.64, 0.33]])
        .float2('green', [chrom.green ?? [0.3, 0.6]])
        .float2('blue', [chrom.blue ?? [0.15, 0.06]])
        .float2('neutral', [chrom.neutral ?? [0.3127, 0.329]])
        .end();
    }

    displayColorObject.end();
    return builder.build().objects[0]!;
  },
};
