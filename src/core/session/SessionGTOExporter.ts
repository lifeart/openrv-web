import { GTOBuilder, SimpleWriter } from 'gto-js';
import type { GTOData, ObjectData } from 'gto-js';
import type { Session, MediaSource } from './Session';
import type { PaintEngine } from '../../paint/PaintEngine';
import type { Annotation, PaintEffects, PenStroke, TextAnnotation } from '../../paint/types';
import { BrushType, LineCap, LineJoin, RV_PEN_WIDTH_SCALE, RV_TEXT_SIZE_SCALE } from '../../paint/types';

interface PaintSnapshot {
  nextId: number;
  show: boolean;
  frames: Record<number, Annotation[]>;
  effects: PaintEffects;
}

/**
 * Options for session export
 */
export interface SessionExportOptions {
  /** Session name (defaults to 'rv') */
  name?: string;
  /** Session comment/notes */
  comment?: string;
  /** Whether to include source groups (default: true) */
  includeSources?: boolean;
}

/**
 * Generates a zero-padded source group name (e.g., 'sourceGroup000000')
 */
export function generateSourceGroupName(index: number): string {
  return `sourceGroup${index.toString().padStart(6, '0')}`;
}

/**
 * EDL (Edit Decision List) data for sequence export
 */
export interface EDLData {
  /** Global frame numbers where each cut starts */
  frames: number[];
  /** Source index for each cut */
  sources: number[];
  /** Source in-points for each cut */
  inPoints: number[];
  /** Source out-points for each cut */
  outPoints: number[];
}

/**
 * Stack group settings for export
 */
export interface StackGroupSettings {
  /** Global composite type (replace, over, add, etc.) */
  compositeType?: string;
  /** Stack mode (replace, wipe, etc.) */
  mode?: string;
  /** Wipe X position (0-1) */
  wipeX?: number;
  /** Wipe Y position (0-1) */
  wipeY?: number;
  /** Wipe angle in degrees */
  wipeAngle?: number;
  /** Index of input to use for audio */
  chosenAudioInput?: number;
  /** Policy when frame is out of range: 'hold', 'black', 'error' */
  outOfRangePolicy?: string;
  /** Whether to align start frames of all inputs */
  alignStartFrames?: boolean;
  /** Whether to use strict frame range checking */
  strictFrameRanges?: boolean;
  /** Per-layer blend modes (indexed by input) */
  layerBlendModes?: string[];
  /** Per-layer opacities (indexed by input, 0-1) */
  layerOpacities?: number[];
}

/**
 * Layout group settings for visual arrangement
 */
export interface LayoutGroupSettings {
  /** Display name */
  name?: string;
  /** Layout algorithm: 'packed', 'packed2', 'row', 'column', 'grid' */
  mode?: string;
  /** Spacing multiplier */
  spacing?: number;
  /** Grid rows (0 = auto) */
  gridRows?: number;
  /** Grid columns (0 = auto) */
  gridColumns?: number;
  /** Auto-retime to match FPS */
  retimeInputs?: boolean;
}

/**
 * Retime group settings
 */
export interface RetimeGroupSettings {
  /** Display name */
  name?: string;
  /** Visual scale (speed factor) */
  visualScale?: number;
  /** Visual offset (frame shift) */
  visualOffset?: number;
  /** Audio scale (speed factor) */
  audioScale?: number;
  /** Audio offset (frame shift) */
  audioOffset?: number;
  /** Output FPS */
  outputFps?: number;
}

/**
 * Switch group settings for single input selection
 */
export interface SwitchGroupSettings {
  /** Display name */
  name?: string;
  /** Output FPS (0 = use source fps) */
  fps?: number;
  /** Output dimensions [width, height] */
  size?: [number, number];
  /** Selected input node name */
  input?: string;
  /** Auto-calculate size */
  autoSize?: boolean;
  /** Use source cut points */
  useCutInfo?: boolean;
  /** Auto-generate EDL */
  autoEDL?: boolean;
  /** Align start frames */
  alignStartFrames?: boolean;
}

/**
 * Folder group settings for multi-purpose collection
 */
export interface FolderGroupSettings {
  /** Display name */
  name?: string;
  /** View mode type: 'switch', 'layout', 'stack', 'sequence' */
  viewType?: string;
}

/**
 * Sound track settings for audio handling
 */
export interface SoundTrackSettings {
  /** Audio volume (0-1) */
  volume?: number;
  /** Stereo balance (-1 to 1) */
  balance?: number;
  /** Audio offset in seconds */
  offset?: number;
  /** Internal offset */
  internalOffset?: number;
  /** Mute audio */
  mute?: boolean;
  /** Enable soft clamp */
  softClamp?: boolean;
  /** Waveform width */
  waveformWidth?: number;
  /** Waveform height */
  waveformHeight?: number;
}

/**
 * Waveform settings for audio visualization
 */
export interface WaveformSettings {
  /** Active state */
  active?: boolean;
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
 * Gaussian blur filter settings
 */
export interface FilterGaussianSettings {
  /** Gaussian sigma (r²/3) */
  sigma?: number;
  /** Filter radius */
  radius?: number;
}

/**
 * Unsharp mask filter settings
 */
export interface UnsharpMaskSettings {
  /** Enable effect */
  active?: boolean;
  /** Sharpening amount */
  amount?: number;
  /** Edge threshold */
  threshold?: number;
  /** Blur radius */
  unsharpRadius?: number;
}

/**
 * Noise reduction filter settings
 */
export interface NoiseReductionSettings {
  /** Enable effect */
  active?: boolean;
  /** Reduction amount */
  amount?: number;
  /** Filter radius */
  radius?: number;
  /** Noise threshold */
  threshold?: number;
}

/**
 * Clarity (local contrast) filter settings
 */
export interface ClaritySettings {
  /** Enable effect */
  active?: boolean;
  /** Clarity amount */
  amount?: number;
  /** Effect radius */
  radius?: number;
}

/**
 * Canvas rotation settings
 */
export interface RotateCanvasSettings {
  /** Enable rotation */
  active?: boolean;
  /** Rotation angle in degrees */
  degrees?: number;
  /** Flip horizontal */
  flipH?: boolean;
  /** Flip vertical */
  flipV?: boolean;
}

/**
 * Resize settings
 */
export interface ResizeSettings {
  /** Enable resize */
  active?: boolean;
  /** Target width */
  width?: number;
  /** Target height */
  height?: number;
  /** Resize mode (0=fit, 1=fill, 2=stretch) */
  mode?: number;
  /** Filter type (0=nearest, 1=bilinear, 2=bicubic, 3=lanczos) */
  filter?: number;
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
 * Display 2D transform settings
 */
export interface DispTransform2DSettings {
  /** Enable transform */
  active?: boolean;
  /** Translation X */
  translateX?: number;
  /** Translation Y */
  translateY?: number;
  /** Scale X */
  scaleX?: number;
  /** Scale Y */
  scaleY?: number;
  /** Rotation in degrees */
  rotate?: number;
}

/**
 * 2D transform settings for RVTransform2D
 */
export interface Transform2DSettings {
  /** Rotation in degrees */
  rotate?: number;
  /** Horizontal flip */
  flip?: boolean;
  /** Vertical flip (flop) */
  flop?: boolean;
  /** Scale [x, y] */
  scale?: number[];
  /** Translation [x, y] */
  translate?: number[];
  /** Visible box/crop region settings */
  visibleBox?: {
    /** Enable visible box */
    active?: boolean;
    /** Min X coordinate */
    minX?: number;
    /** Min Y coordinate */
    minY?: number;
    /** Max X coordinate */
    maxX?: number;
    /** Max Y coordinate */
    maxY?: number;
  };
  /** Stencil/mask settings */
  stencil?: {
    /** Enable stencil */
    active?: boolean;
    /** Invert stencil */
    inverted?: boolean;
    /** Aspect ratio */
    aspect?: number;
    /** Soft edge amount */
    softEdge?: number;
    /** Ratio value */
    ratio?: number;
  };
}

/**
 * Lens warp settings for RVLensWarp
 */
export interface LensWarpSettings {
  /** Node is active */
  active?: boolean;
  /** Distortion model (e.g., 'brown', 'opencv', '3de4_radial', '3de4_anamorphic') */
  model?: string;
  /** K1 radial distortion coefficient */
  k1?: number;
  /** K2 radial distortion coefficient */
  k2?: number;
  /** K3 radial distortion coefficient */
  k3?: number;
  /** P1 tangential distortion */
  p1?: number;
  /** P2 tangential distortion */
  p2?: number;
  /** Distortion scale factor */
  d?: number;
  /** Center point [x, y] */
  center?: number[];
  /** Offset [x, y] */
  offset?: number[];
  /** Pixel aspect ratio */
  pixelAspectRatio?: number;
  /** Focal length X */
  fx?: number;
  /** Focal length Y */
  fy?: number;
  /** Crop ratio X */
  cropRatioX?: number;
  /** Crop ratio Y */
  cropRatioY?: number;
  /** 3DE4 anamorphic settings */
  anamorphic?: {
    /** Anamorphic squeeze */
    squeeze?: number;
    /** Squeeze in X direction */
    squeezeX?: number;
    /** Squeeze in Y direction */
    squeezeY?: number;
    /** Anamorphic rotation angle */
    anamorphicRotation?: number;
    /** Physical lens rotation */
    lensRotation?: number;
    /** 3DE4 polynomial coefficients */
    cx02?: number;
    cy02?: number;
    cx22?: number;
    cy22?: number;
    cx04?: number;
    cy04?: number;
    cx24?: number;
    cy24?: number;
    cx44?: number;
    cy44?: number;
  };
}

/**
 * Paint settings for RVPaint
 */
export interface PaintSettings {
  /** Node is active */
  active?: boolean;
  /** Show paint on frame */
  show?: boolean;
  /** Next stroke ID */
  nextId?: number;
  /** Frames to exclude from paint display */
  exclude?: number[];
  /** Frames to include for paint display */
  include?: number[];
}

/**
 * Image source settings for RVImageSource
 */
export interface ImageSourceSettings {
  /** Display name */
  name?: string;
  /** Source identifier/path */
  movie?: string;
  /** Source location type */
  location?: string;
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
  /** Uncropped width */
  uncropWidth?: number;
  /** Uncropped height */
  uncropHeight?: number;
  /** Uncrop X offset */
  uncropX?: number;
  /** Uncrop Y offset */
  uncropY?: number;
  /** Pixel aspect ratio */
  pixelAspect?: number;
  /** Frames per second */
  fps?: number;
  /** Start frame */
  start?: number;
  /** End frame */
  end?: number;
  /** Frame increment */
  inc?: number;
  /** Encoding type */
  encoding?: string;
  /** Channel layout (e.g., 'RGBA') */
  channels?: string;
  /** Bits per channel */
  bitsPerChannel?: number;
  /** Is floating point */
  isFloat?: boolean;
  /** Cut in point */
  cutIn?: number;
  /** Cut out point */
  cutOut?: number;
}

/**
 * Movie source settings for RVMovieSource
 */
export interface MovieSourceSettings {
  /** Display name */
  name?: string;
  /** Movie file path */
  movie?: string;
  /** Source FPS (0 = derive from media) */
  fps?: number;
  /** Audio volume */
  volume?: number;
  /** Audio offset in seconds */
  audioOffset?: number;
  /** Stereo balance */
  balance?: number;
  /** Ignore embedded audio */
  noMovieAudio?: boolean;
  /** Range offset */
  rangeOffset?: number;
  /** Explicit start frame */
  rangeStart?: number;
  /** Cut in point */
  cutIn?: number;
  /** Cut out point */
  cutOut?: number;
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
 * RVDisplayStereo settings for stereo display mode
 */
export interface DisplayStereoSettings {
  /** Stereo display mode (off, left, right, pair, mirror, etc.) */
  type?: string;
  /** Swap left/right eyes */
  swap?: boolean;
  /** Relative offset between eyes */
  relativeOffset?: number;
  /** Right eye offset */
  rightOffset?: [number, number];
}

/**
 * RVSourceStereo settings for per-source stereo configuration
 */
export interface SourceStereoSettings {
  /** Swap left/right eyes */
  swap?: boolean;
  /** Relative offset between eyes */
  relativeOffset?: number;
  /** Right eye offset */
  rightOffset?: number;
  /** Right eye transform */
  rightTransform?: {
    /** Vertical flip (right eye) */
    flip?: boolean;
    /** Horizontal flip (right eye) */
    flop?: boolean;
    /** Rotation in degrees (right eye) */
    rotate?: number;
    /** Translation [x, y] (right eye) */
    translate?: [number, number];
  };
}

/**
 * RVRetime settings for time remapping
 */
export interface RetimeSettings {
  /** Visual scale (speed factor) */
  visualScale?: number;
  /** Visual offset (frame shift) */
  visualOffset?: number;
  /** Audio scale (speed factor) */
  audioScale?: number;
  /** Audio offset (frame shift) */
  audioOffset?: number;
  /** Output FPS */
  outputFps?: number;
  /** Warp mode settings */
  warp?: {
    /** Warp is active */
    active?: boolean;
    /** Interpolation style (0=linear, 1=smooth) */
    style?: number;
    /** Keyframe positions */
    keyFrames?: number[];
    /** Rate at each keyframe */
    keyRates?: number[];
  };
  /** Explicit frame mapping */
  explicit?: {
    /** Explicit mapping is active */
    active?: boolean;
    /** First output frame */
    firstOutputFrame?: number;
    /** Input frame for each output frame */
    inputFrames?: number[];
  };
}

/**
 * RVFormat settings for crop and channel mapping
 */
export interface FormatSettings {
  /** Crop settings */
  crop?: {
    /** Crop is active */
    active?: boolean;
    /** Left edge (in pixels) */
    xmin?: number;
    /** Top edge (in pixels) */
    ymin?: number;
    /** Right edge (in pixels) */
    xmax?: number;
    /** Bottom edge (in pixels) */
    ymax?: number;
  };
  /** Channel mapping names */
  channels?: string[];
}

/**
 * Rectangle overlay element for RVOverlay
 */
export interface OverlayRect {
  /** Unique ID for the rectangle */
  id: number;
  /** Rectangle width (normalized 0-1) */
  width?: number;
  /** Rectangle height (normalized 0-1) */
  height?: number;
  /** RGBA color [r, g, b, a] */
  color?: [number, number, number, number];
  /** Position [x, y] (normalized 0-1) */
  position?: [number, number];
  /** Eye assignment (0=both, 1=left, 2=right) */
  eye?: number;
  /** Whether this rectangle is active */
  active?: boolean;
}

/**
 * Text overlay element for RVOverlay
 */
export interface OverlayText {
  /** Unique ID for the text */
  id: number;
  /** Position [x, y] (normalized 0-1) */
  position?: [number, number];
  /** RGBA color [r, g, b, a] */
  color?: [number, number, number, number];
  /** Font size */
  size?: number;
  /** Text scale */
  scale?: number;
  /** Rotation angle in degrees */
  rotation?: number;
  /** Character spacing */
  spacing?: number;
  /** Font name */
  font?: string;
  /** Text content */
  text?: string;
  /** Anchor point origin */
  origin?: string;
  /** Debug mode */
  debug?: boolean;
  /** Eye assignment (0=both, 1=left, 2=right) */
  eye?: number;
  /** Whether this text is active */
  active?: boolean;
  /** Pixel scaling factor */
  pixelScale?: number;
  /** First frame to display */
  firstFrame?: number;
}

/**
 * Window overlay element for RVOverlay
 */
export interface OverlayWindow {
  /** Unique ID for the window */
  id: number;
  /** Eye assignment (0=both, 1=left, 2=right) */
  eye?: number;
  /** Window is active */
  windowActive?: boolean;
  /** Outline is active */
  outlineActive?: boolean;
  /** Outline width */
  outlineWidth?: number;
  /** Outline RGBA color */
  outlineColor?: [number, number, number, number];
  /** Brush style */
  outlineBrush?: string;
  /** Window fill RGBA color */
  windowColor?: [number, number, number, number];
  /** Image aspect ratio */
  imageAspect?: number;
  /** Pixel scaling factor */
  pixelScale?: number;
  /** First frame to display */
  firstFrame?: number;
  /** Upper-left corner [x, y] */
  upperLeft?: [number, number];
  /** Upper-right corner [x, y] */
  upperRight?: [number, number];
  /** Lower-left corner [x, y] */
  lowerLeft?: [number, number];
  /** Lower-right corner [x, y] */
  lowerRight?: [number, number];
  /** Enable antialiasing */
  antialias?: boolean;
}

/**
 * RVOverlay settings for text, rectangle, and window overlays
 */
export interface OverlaySettings {
  /** Show overlays */
  show?: boolean;
  /** Rectangle overlays */
  rectangles?: OverlayRect[];
  /** Text overlays */
  texts?: OverlayText[];
  /** Window overlays */
  windows?: OverlayWindow[];
  /** Matte settings */
  matte?: {
    /** Show matte */
    show?: boolean;
    /** Matte opacity (0-1) */
    opacity?: number;
    /** Matte aspect ratio */
    aspect?: number;
    /** Visible height fraction */
    heightVisible?: number;
    /** Matte center [x, y] (normalized 0-1) */
    centerPoint?: [number, number];
  };
}

/**
 * RVChannelMap settings for channel remapping
 */
export interface ChannelMapSettings {
  /** Channel name mapping (e.g., ['R', 'G', 'B', 'A']) */
  channels?: string[];
}

export interface GTOComponentDTO {
  property(name: string): {
    value(): unknown;
  };
}

export interface GTOProperty {
  name: string;
  value: unknown;
}

export interface GTOComponent {
  name: string;
  properties: GTOProperty[];
}

export class SessionGTOExporter {
  /**
   * Generate complete GTO data for a new session export
   * Creates RVSession, source groups, sequence, connections, and paint objects
   */
  static toGTOData(
    session: Session,
    paintEngine: PaintEngine,
    options: SessionExportOptions = {}
  ): GTOData {
    const { name = 'rv', comment = '', includeSources = true } = options;
    const viewNode = 'defaultSequence';

    const objects: ObjectData[] = [];
    const sourceGroupNames: string[] = [];

    // 1. Build RVSession object
    const sessionObject = this.buildSessionObject(session, name, viewNode, comment);
    objects.push(sessionObject);

    // 2. Build source groups for each media source
    if (includeSources && session.allSources.length > 0) {
      for (let i = 0; i < session.allSources.length; i++) {
        const source = session.allSources[i];
        if (!source) continue;

        const groupName = generateSourceGroupName(i);
        sourceGroupNames.push(groupName);

        const sourceObjects = this.buildSourceGroupObjects(source, groupName);
        objects.push(...sourceObjects);
      }
    }

    // 3. Build default sequence group
    const sequenceObjects = this.buildSequenceGroupObjects('defaultSequence', session);
    objects.push(...sequenceObjects);

    // 4. Build connection object
    const connectionObject = this.buildConnectionObject(sourceGroupNames, viewNode);
    objects.push(connectionObject);

    // 5. Build paint/annotations object
    const paintObject = this.buildPaintObject(session, paintEngine, 'annotations');
    objects.push(paintObject);

    return {
      version: 4,
      objects,
    };
  }

  /**
   * Build the connection object that defines graph topology
   * Connects sources -> sequence and lists top-level viewable nodes
   */
  static buildConnectionObject(sourceGroupNames: string[], viewNode: string): ObjectData {
    const builder = new GTOBuilder();

    builder
      .object('connections', 'connection', 1)
      .component('evaluation')
      // lhs -> rhs: each source connects to the sequence
      .string('lhs', sourceGroupNames)
      .string('rhs', sourceGroupNames.map(() => viewNode))
      .end()
      .component('top')
      .string('nodes', [viewNode])
      .end()
      .end();

    return builder.build().objects[0]!;
  }

  /**
   * Build source group objects (RVSourceGroup + RVFileSource)
   * Returns array of objects for a single source
   */
  static buildSourceGroupObjects(source: MediaSource, groupName: string): ObjectData[] {
    const objects: ObjectData[] = [];
    const sourceName = `${groupName}_source`;

    // 1. RVSourceGroup container
    const groupBuilder = new GTOBuilder();
    groupBuilder
      .object(groupName, 'RVSourceGroup', 1)
      .component('ui')
      .string('name', source.name || groupName)
      .end()
      .end();
    objects.push(groupBuilder.build().objects[0]!);

    // 2. RVFileSource (or RVImageSource based on type)
    const protocol = source.type === 'image' ? 'RVImageSource' : 'RVFileSource';
    const sourceBuilder = new GTOBuilder();

    // Build the source object - chain must be continuous
    const sourceObject = sourceBuilder.object(sourceName, protocol, 1);

    sourceObject
      .component('media')
      .string('movie', source.url)
      .string('name', source.name || '')
      .end();

    sourceObject
      .component('group')
      .float('fps', source.fps || 24.0)
      .float('volume', 1.0)
      .float('audioOffset', 0.0)
      .float('balance', 0.0)
      .float('crossover', 0.0)
      .int('noMovieAudio', 0)
      .int('rangeOffset', 0)
      .end();

    sourceObject
      .component('cut')
      // Use MIN_INT/MAX_INT to indicate full media range
      .int('in', -2147483648)
      .int('out', 2147483647)
      .end();

    sourceObject
      .component('request')
      .int('readAllChannels', 0)
      .end();

    // Add proxy/image dimensions if available
    if (source.width > 0 && source.height > 0) {
      sourceObject
        .component('proxy')
        .int2('size', [[source.width, source.height]])
        .end();
    }

    sourceObject.end();
    objects.push(sourceBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build sequence group objects (RVSequenceGroup + RVSequence)
   * @param groupName - Name for the sequence group
   * @param session - Session instance
   * @param edl - Optional EDL data (if not using auto-EDL)
   */
  static buildSequenceGroupObjects(
    groupName: string,
    session: Session,
    edl?: EDLData
  ): ObjectData[] {
    const objects: ObjectData[] = [];
    const sequenceName = `${groupName}_sequence`;

    // 1. RVSequenceGroup container
    const groupBuilder = new GTOBuilder();
    groupBuilder
      .object(groupName, 'RVSequenceGroup', 1)
      .component('ui')
      .string('name', 'Default Sequence')
      .end()
      .end();
    objects.push(groupBuilder.build().objects[0]!);

    // 2. RVSequence node
    const sequenceBuilder = new GTOBuilder();
    const playback = session.getPlaybackState();

    const sequenceObject = sequenceBuilder.object(sequenceName, 'RVSequence', 1);

    sequenceObject
      .component('output')
      .float('fps', playback.fps || 24.0)
      .int('autoSize', 1)
      .int('interactiveSize', 1)
      .end();

    sequenceObject
      .component('mode')
      .int('autoEDL', edl ? 0 : 1)
      .int('useCutInfo', 1)
      .int('supportReversedOrderBlending', 1)
      .end();

    // Add EDL component if provided
    if (edl && edl.frames.length > 0) {
      sequenceObject
        .component('edl')
        .int('frame', edl.frames)
        .int('source', edl.sources)
        .int('in', edl.inPoints)
        .int('out', edl.outPoints)
        .end();
    }

    sequenceObject.end();
    objects.push(sequenceBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build stack group objects (RVStackGroup + RVStack)
   * @param groupName - Name for the stack group
   * @param settings - Optional per-layer compositing settings
   */
  static buildStackGroupObjects(
    groupName: string,
    settings?: StackGroupSettings
  ): ObjectData[] {
    const objects: ObjectData[] = [];
    const stackName = `${groupName}_stack`;

    // 1. RVStackGroup container
    const groupBuilder = new GTOBuilder();
    groupBuilder
      .object(groupName, 'RVStackGroup', 1)
      .component('ui')
      .string('name', 'Stack')
      .end()
      .end();
    objects.push(groupBuilder.build().objects[0]!);

    // 2. RVStack node with compositing settings
    const stackBuilder = new GTOBuilder();
    const stackObject = stackBuilder.object(stackName, 'RVStack', 1);

    // Stack component (global composite mode)
    stackObject
      .component('stack')
      .string('composite', settings?.compositeType ?? 'replace')
      .string('mode', settings?.mode ?? 'replace')
      .end();

    // Wipe component
    stackObject
      .component('wipe')
      .float('x', settings?.wipeX ?? 0.5)
      .float('y', settings?.wipeY ?? 0.5)
      .float('angle', settings?.wipeAngle ?? 0)
      .end();

    // Output component
    stackObject
      .component('output')
      .int('chosenAudioInput', settings?.chosenAudioInput ?? 0)
      .string('outOfRangePolicy', settings?.outOfRangePolicy ?? 'hold')
      .end();

    // Mode component
    stackObject
      .component('mode')
      .int('alignStartFrames', settings?.alignStartFrames ? 1 : 0)
      .int('strictFrameRanges', settings?.strictFrameRanges ? 1 : 0)
      .end();

    // Per-layer composite settings (if provided)
    if (settings?.layerBlendModes && settings.layerBlendModes.length > 0) {
      stackObject
        .component('composite')
        .string('type', settings.layerBlendModes)
        .end();
    }

    if (settings?.layerOpacities && settings.layerOpacities.length > 0) {
      // Add opacities to output component - need to rebuild
      // For simplicity, we add it as a separate property
      const outputComp = stackObject.component('layerOutput');
      outputComp.float('opacity', settings.layerOpacities).end();
    }

    stackObject.end();
    objects.push(stackBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build layout group objects (RVLayoutGroup + RVLayout)
   * @param groupName - Name for the layout group
   * @param settings - Optional layout settings
   */
  static buildLayoutGroupObjects(
    groupName: string,
    settings?: LayoutGroupSettings
  ): ObjectData[] {
    const objects: ObjectData[] = [];
    const layoutName = `${groupName}_layout`;

    // 1. RVLayoutGroup container
    const groupBuilder = new GTOBuilder();
    groupBuilder
      .object(groupName, 'RVLayoutGroup', 1)
      .component('ui')
      .string('name', settings?.name ?? 'Layout')
      .end()
      .end();
    objects.push(groupBuilder.build().objects[0]!);

    // 2. RVLayout node with layout settings
    const layoutBuilder = new GTOBuilder();
    const layoutObject = layoutBuilder.object(layoutName, 'RVLayout', 1);

    // Layout component
    layoutObject
      .component('layout')
      .string('mode', settings?.mode ?? 'packed')
      .float('spacing', settings?.spacing ?? 1.0)
      .int('gridRows', settings?.gridRows ?? 0)
      .int('gridColumns', settings?.gridColumns ?? 0)
      .end();

    // Timing component
    layoutObject
      .component('timing')
      .int('retimeInputs', settings?.retimeInputs ? 1 : 0)
      .end();

    layoutObject.end();
    objects.push(layoutBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build retime group objects (RVRetimeGroup + RVRetime)
   * @param groupName - Name for the retime group
   * @param settings - Optional retime settings
   */
  static buildRetimeGroupObjects(
    groupName: string,
    settings?: RetimeGroupSettings
  ): ObjectData[] {
    const objects: ObjectData[] = [];
    const retimeName = `${groupName}_retime`;

    // 1. RVRetimeGroup container
    const groupBuilder = new GTOBuilder();
    groupBuilder
      .object(groupName, 'RVRetimeGroup', 1)
      .component('ui')
      .string('name', settings?.name ?? 'Retime')
      .end()
      .end();
    objects.push(groupBuilder.build().objects[0]!);

    // 2. RVRetime node with retime settings
    const retimeBuilder = new GTOBuilder();
    const retimeObject = retimeBuilder.object(retimeName, 'RVRetime', 1);

    // Visual component
    retimeObject
      .component('visual')
      .float('scale', settings?.visualScale ?? 1.0)
      .float('offset', settings?.visualOffset ?? 0.0)
      .end();

    // Audio component
    retimeObject
      .component('audio')
      .float('scale', settings?.audioScale ?? 1.0)
      .float('offset', settings?.audioOffset ?? 0.0)
      .end();

    // Output component
    if (settings?.outputFps !== undefined) {
      retimeObject
        .component('output')
        .float('fps', settings.outputFps)
        .end();
    }

    retimeObject.end();
    objects.push(retimeBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build switch group objects (RVSwitchGroup + RVSwitch)
   * @param groupName - Name for the switch group
   * @param settings - Optional switch settings
   */
  static buildSwitchGroupObjects(
    groupName: string,
    settings?: SwitchGroupSettings
  ): ObjectData[] {
    const objects: ObjectData[] = [];
    const switchName = `${groupName}_switch`;

    // 1. RVSwitchGroup container
    const groupBuilder = new GTOBuilder();
    groupBuilder
      .object(groupName, 'RVSwitchGroup', 1)
      .component('ui')
      .string('name', settings?.name ?? 'Switch')
      .end()
      .end();
    objects.push(groupBuilder.build().objects[0]!);

    // 2. RVSwitch node with settings
    const switchBuilder = new GTOBuilder();
    const switchObject = switchBuilder.object(switchName, 'RVSwitch', 1);

    // Output component
    const outputComp = switchObject.component('output');
    outputComp
      .float('fps', settings?.fps ?? 0.0)
      .int('autoSize', settings?.autoSize !== false ? 1 : 0);

    if (settings?.size) {
      outputComp.int2('size', [settings.size]);
    }
    if (settings?.input) {
      outputComp.string('input', settings.input);
    }
    outputComp.end();

    // Mode component
    switchObject
      .component('mode')
      .int('useCutInfo', settings?.useCutInfo !== false ? 1 : 0)
      .int('autoEDL', settings?.autoEDL !== false ? 1 : 0)
      .int('alignStartFrames', settings?.alignStartFrames ? 1 : 0)
      .end();

    switchObject.end();
    objects.push(switchBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build folder group objects (RVFolderGroup)
   * @param groupName - Name for the folder group
   * @param settings - Optional folder settings
   */
  static buildFolderGroupObjects(
    groupName: string,
    settings?: FolderGroupSettings
  ): ObjectData[] {
    const objects: ObjectData[] = [];

    // RVFolderGroup container
    const groupBuilder = new GTOBuilder();
    const folderObject = groupBuilder.object(groupName, 'RVFolderGroup', 1);

    folderObject
      .component('ui')
      .string('name', settings?.name ?? 'Folder')
      .end();

    folderObject
      .component('mode')
      .string('viewType', settings?.viewType ?? 'switch')
      .end();

    folderObject.end();
    objects.push(groupBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build a display group object (RVDisplayGroup)
   * @param groupName - Name for the display group (typically 'displayGroup')
   * @param displayName - Display name for UI
   */
  static buildDisplayGroupObject(
    groupName: string = 'displayGroup',
    displayName: string = 'Display'
  ): ObjectData {
    const builder = new GTOBuilder();

    builder
      .object(groupName, 'RVDisplayGroup', 1)
      .component('ui')
      .string('name', displayName)
      .end()
      .end();

    return builder.build().objects[0]!;
  }

  /**
   * Build an RVHistogram object for histogram display
   * @param name - Object name
   * @param active - Whether histogram is active
   */
  static buildHistogramObject(name: string, active: boolean = false): ObjectData {
    const builder = new GTOBuilder();

    builder
      .object(name, 'Histogram', 1)
      .component('node')
      .int('active', active ? 1 : 0)
      .end()
      .end();

    return builder.build().objects[0]!;
  }

  /**
   * Build a Waveform object for audio waveform display
   * @param name - Object name
   * @param active - Whether waveform display is active
   */
  static buildWaveformObject(name: string, active: boolean = false): ObjectData {
    const builder = new GTOBuilder();

    builder
      .object(name, 'Waveform', 1)
      .component('node')
      .int('active', active ? 1 : 0)
      .end()
      .end();

    return builder.build().objects[0]!;
  }

  /**
   * Build an RVViewGroup object (view transformation hub)
   * @param groupName - Name for the view group (typically 'viewGroup')
   * @param displayName - Display name for UI
   */
  static buildViewGroupObject(
    groupName: string = 'viewGroup',
    displayName: string = 'View'
  ): ObjectData {
    const builder = new GTOBuilder();

    builder
      .object(groupName, 'RVViewGroup', 1)
      .component('ui')
      .string('name', displayName)
      .end()
      .end();

    return builder.build().objects[0]!;
  }

  /**
   * Build an RVSoundTrack object for audio handling
   * @param name - Object name
   * @param settings - Sound track settings
   */
  static buildSoundTrackObject(name: string, settings: SoundTrackSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const soundTrackObject = builder.object(name, 'RVSoundTrack', 1);

    // Audio component
    soundTrackObject
      .component('audio')
      .float('volume', settings.volume ?? 1.0)
      .float('balance', settings.balance ?? 0.0)
      .float('offset', settings.offset ?? 0.0)
      .float('internalOffset', settings.internalOffset ?? 0.0)
      .int('mute', settings.mute ? 1 : 0)
      .int('softClamp', settings.softClamp ? 1 : 0)
      .end();

    // Visual component (waveform display)
    soundTrackObject
      .component('visual')
      .int('width', settings.waveformWidth ?? 0)
      .int('height', settings.waveformHeight ?? 0)
      .end();

    soundTrackObject.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVOCIO object for OpenColorIO color management
   * @param name - Object name
   * @param settings - OCIO settings
   */
  static buildOCIOObject(name: string, settings: OCIOSettings = {}): ObjectData {
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
  }

  /**
   * Build an RVICC object for ICC color profile transforms
   * @param name - Object name
   * @param settings - ICC settings
   */
  static buildICCObject(name: string, settings: ICCSettings = {}): ObjectData {
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
  }

  /**
   * Build an RVColorExposure object
   * @param name - Object name
   * @param settings - Exposure settings
   */
  static buildColorExposureObject(name: string, settings: ColorExposureSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorExposure', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('exposure', settings.exposure ?? 0.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVColorCurve object
   * @param name - Object name
   * @param settings - Curve settings
   */
  static buildColorCurveObject(name: string, settings: ColorCurveSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorCurve', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('contrast', settings.contrast ?? 0.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVColorTemperature object
   * @param name - Object name
   * @param settings - Temperature settings
   */
  static buildColorTemperatureObject(name: string, settings: ColorTemperatureSettings = {}): ObjectData {
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
  }

  /**
   * Build an RVColorSaturation object
   * @param name - Object name
   * @param settings - Saturation settings
   */
  static buildColorSaturationObject(name: string, settings: ColorSaturationSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorSaturation', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('saturation', settings.saturation ?? 1.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVColorVibrance object
   * @param name - Object name
   * @param settings - Vibrance settings
   */
  static buildColorVibranceObject(name: string, settings: ColorVibranceSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorVibrance', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('vibrance', settings.vibrance ?? 0.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVColorShadow object
   * @param name - Object name
   * @param settings - Shadow settings
   */
  static buildColorShadowObject(name: string, settings: ColorShadowSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorShadow', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('shadow', settings.shadow ?? 0.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVColorHighlight object
   * @param name - Object name
   * @param settings - Highlight settings
   */
  static buildColorHighlightObject(name: string, settings: ColorHighlightSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorHighlight', 1);
    obj.component('color')
      .int('active', settings.active !== false ? 1 : 0)
      .float('highlight', settings.highlight ?? 0.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVColorGrayScale object
   * @param name - Object name
   * @param settings - Grayscale settings
   */
  static buildColorGrayScaleObject(name: string, settings: ColorGrayScaleSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorGrayScale', 1);
    obj.component('node')
      .int('active', settings.active ? 1 : 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVColorCDL object (standalone CDL node)
   * @param name - Object name
   * @param settings - CDL settings
   */
  static buildColorCDLObject(name: string, settings: ColorCDLSettings = {}): ObjectData {
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
  }

  /**
   * Build an RVColorLinearToSRGB object
   * @param name - Object name
   * @param settings - Settings
   */
  static buildColorLinearToSRGBObject(name: string, settings: ColorLinearToSRGBSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorLinearToSRGB', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVColorSRGBToLinear object
   * @param name - Object name
   * @param settings - Settings
   */
  static buildColorSRGBToLinearObject(name: string, settings: ColorSRGBToLinearSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVColorSRGBToLinear', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVFilterGaussian object for Gaussian blur
   * @param name - Object name
   * @param settings - Gaussian filter settings
   */
  static buildFilterGaussianObject(name: string, settings: FilterGaussianSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVFilterGaussian', 1);
    obj.component('node')
      .float('sigma', settings.sigma ?? 0.03)
      .float('radius', settings.radius ?? 10.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVUnsharpMask object for sharpening
   * @param name - Object name
   * @param settings - Unsharp mask settings
   */
  static buildUnsharpMaskObject(name: string, settings: UnsharpMaskSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVUnsharpMask', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .float('amount', settings.amount ?? 1.0)
      .float('threshold', settings.threshold ?? 5.0)
      .float('unsharpRadius', settings.unsharpRadius ?? 5.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVNoiseReduction object
   * @param name - Object name
   * @param settings - Noise reduction settings
   */
  static buildNoiseReductionObject(name: string, settings: NoiseReductionSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVNoiseReduction', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .float('amount', settings.amount ?? 0.0)
      .float('radius', settings.radius ?? 0.0)
      .float('threshold', settings.threshold ?? 5.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVClarity object for local contrast enhancement
   * @param name - Object name
   * @param settings - Clarity settings
   */
  static buildClarityObject(name: string, settings: ClaritySettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVClarity', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .float('amount', settings.amount ?? 0.0)
      .float('radius', settings.radius ?? 20.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVRotateCanvas object
   * @param name - Object name
   * @param settings - Rotation settings
   */
  static buildRotateCanvasObject(name: string, settings: RotateCanvasSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVRotateCanvas', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .float('degrees', settings.degrees ?? 0.0)
      .int('flipH', settings.flipH ? 1 : 0)
      .int('flipV', settings.flipV ? 1 : 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVResize object
   * @param name - Object name
   * @param settings - Resize settings
   */
  static buildResizeObject(name: string, settings: ResizeSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVResize', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .int('width', settings.width ?? 0)
      .int('height', settings.height ?? 0)
      .int('mode', settings.mode ?? 0)
      .int('filter', settings.filter ?? 1)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVPrimaryConvert object for color primary conversion
   * @param name - Object name
   * @param settings - Primary conversion settings
   */
  static buildPrimaryConvertObject(name: string, settings: PrimaryConvertSettings = {}): ObjectData {
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
  }

  /**
   * Build an RVDispTransform2D object for display transforms
   * @param name - Object name
   * @param settings - Transform settings
   */
  static buildDispTransform2DObject(name: string, settings: DispTransform2DSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVDispTransform2D', 1);
    obj.component('transform')
      .int('active', settings.active !== false ? 1 : 0)
      .float('translate', [settings.translateX ?? 0, settings.translateY ?? 0])
      .float('scale', [settings.scaleX ?? 1, settings.scaleY ?? 1])
      .float('rotate', settings.rotate ?? 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVTransform2D object for source transforms
   * @param name - Object name (e.g., 'sourceGroup000000_RVTransform2D')
   * @param settings - Transform settings including visibleBox and stencil
   */
  static buildTransform2DObject(name: string, settings: Transform2DSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVTransform2D', 1);

    // Transform component
    obj.component('transform')
      .float('rotate', settings.rotate ?? 0)
      .int('flip', settings.flip ? 1 : 0)
      .int('flop', settings.flop ? 1 : 0)
      .float2('scale', [settings.scale ?? [1.0, 1.0]])
      .float2('translate', [settings.translate ?? [0.0, 0.0]])
      .end();

    // VisibleBox component (if provided)
    if (settings.visibleBox) {
      const vb = settings.visibleBox;
      obj.component('visibleBox')
        .int('active', vb.active ? 1 : 0)
        .float('minX', vb.minX ?? 0)
        .float('minY', vb.minY ?? 0)
        .float('maxX', vb.maxX ?? 1)
        .float('maxY', vb.maxY ?? 1)
        .end();
    }

    // Stencil component (if provided)
    if (settings.stencil) {
      const st = settings.stencil;
      obj.component('stencil')
        .int('active', st.active ? 1 : 0)
        .int('inverted', st.inverted ? 1 : 0)
        .float('aspect', st.aspect ?? 1.0)
        .float('softEdge', st.softEdge ?? 0)
        .float('ratio', st.ratio ?? 1.0)
        .end();
    }

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVLensWarp object for lens distortion correction
   * @param name - Object name (e.g., 'sourceGroup000000_RVLensWarp')
   * @param settings - Lens warp settings including 3DE4 anamorphic properties
   */
  static buildLensWarpObject(name: string, settings: LensWarpSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVLensWarp', 1);

    // Node component (active state)
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .end();

    // Warp component
    const warpComp = obj.component('warp');
    warpComp
      .string('model', settings.model ?? 'brown')
      .float('k1', settings.k1 ?? 0)
      .float('k2', settings.k2 ?? 0)
      .float('k3', settings.k3 ?? 0)
      .float('p1', settings.p1 ?? 0)
      .float('p2', settings.p2 ?? 0)
      .float('d', settings.d ?? 1.0)
      .float2('center', [settings.center ?? [0.5, 0.5]])
      .float2('offset', [settings.offset ?? [0, 0]])
      .float('pixelAspectRatio', settings.pixelAspectRatio ?? 1.0)
      .float('fx', settings.fx ?? 1.0)
      .float('fy', settings.fy ?? 1.0)
      .float('cropRatioX', settings.cropRatioX ?? 1.0)
      .float('cropRatioY', settings.cropRatioY ?? 1.0);

    // Add 3DE4 anamorphic properties if provided
    if (settings.anamorphic) {
      const ana = settings.anamorphic;
      if (ana.squeeze !== undefined) warpComp.float('squeeze', ana.squeeze);
      if (ana.squeezeX !== undefined) warpComp.float('squeezeX', ana.squeezeX);
      if (ana.squeezeY !== undefined) warpComp.float('squeezeY', ana.squeezeY);
      if (ana.anamorphicRotation !== undefined) warpComp.float('anamorphicRotation', ana.anamorphicRotation);
      if (ana.lensRotation !== undefined) warpComp.float('lensRotation', ana.lensRotation);
      // 3DE4 polynomial coefficients
      if (ana.cx02 !== undefined) warpComp.float('cx02', ana.cx02);
      if (ana.cy02 !== undefined) warpComp.float('cy02', ana.cy02);
      if (ana.cx22 !== undefined) warpComp.float('cx22', ana.cx22);
      if (ana.cy22 !== undefined) warpComp.float('cy22', ana.cy22);
      if (ana.cx04 !== undefined) warpComp.float('cx04', ana.cx04);
      if (ana.cy04 !== undefined) warpComp.float('cy04', ana.cy04);
      if (ana.cx24 !== undefined) warpComp.float('cx24', ana.cx24);
      if (ana.cy24 !== undefined) warpComp.float('cy24', ana.cy24);
      if (ana.cx44 !== undefined) warpComp.float('cx44', ana.cx44);
      if (ana.cy44 !== undefined) warpComp.float('cy44', ana.cy44);
    }

    warpComp.end();
    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build a basic RVPaint node object (without stroke data)
   * For creating standalone paint nodes with frame filters
   * @param name - Object name (e.g., 'sourceGroup000000_paint')
   * @param settings - Paint settings including frame filters
   */
  static buildPaintNodeObject(name: string, settings: PaintSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVPaint', 1);

    // Node component (active state)
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .end();

    // Paint component (frame filters)
    const paintComp = obj.component('paint');
    paintComp
      .int('show', settings.show !== false ? 1 : 0)
      .int('nextId', settings.nextId ?? 0);

    // Add exclude frames if provided
    if (settings.exclude && settings.exclude.length > 0) {
      paintComp.int('exclude', settings.exclude);
    }

    // Add include frames if provided
    if (settings.include && settings.include.length > 0) {
      paintComp.int('include', settings.include);
    }

    paintComp.end();
    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVImageSource object for programmatic image sources
   * @param name - Object name (e.g., 'sourceGroup000000_source')
   * @param settings - Image source settings
   */
  static buildImageSourceObject(name: string, settings: ImageSourceSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVImageSource', 1);

    // Media component
    const mediaComp = obj.component('media');
    if (settings.name) {
      mediaComp.string('name', settings.name);
    }
    if (settings.movie) {
      mediaComp.string('movie', settings.movie);
    }
    mediaComp.string('location', settings.location ?? 'image');
    mediaComp.end();

    // Image component
    obj.component('image')
      .int('width', settings.width ?? 640)
      .int('height', settings.height ?? 480)
      .int('uncropWidth', settings.uncropWidth ?? settings.width ?? 640)
      .int('uncropHeight', settings.uncropHeight ?? settings.height ?? 480)
      .int('uncropX', settings.uncropX ?? 0)
      .int('uncropY', settings.uncropY ?? 0)
      .float('pixelAspect', settings.pixelAspect ?? 1.0)
      .float('fps', settings.fps ?? 0.0)
      .int('start', settings.start ?? 1)
      .int('end', settings.end ?? 1)
      .int('inc', settings.inc ?? 1)
      .string('encoding', settings.encoding ?? 'None')
      .string('channels', settings.channels ?? 'RGBA')
      .int('bitsPerChannel', settings.bitsPerChannel ?? 0)
      .int('float', settings.isFloat ? 1 : 0)
      .end();

    // Cut component (optional)
    if (settings.cutIn !== undefined || settings.cutOut !== undefined) {
      obj.component('cut')
        .int('in', settings.cutIn ?? -2147483648)
        .int('out', settings.cutOut ?? 2147483647)
        .end();
    }

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVMovieSource object for video file sources
   * @param name - Object name (e.g., 'sourceGroup000000_source')
   * @param settings - Movie source settings
   */
  static buildMovieSourceObject(name: string, settings: MovieSourceSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVMovieSource', 1);

    // Media component
    const mediaComp = obj.component('media');
    if (settings.name) {
      mediaComp.string('name', settings.name);
    }
    if (settings.movie) {
      mediaComp.string('movie', settings.movie);
    }
    mediaComp.end();

    // Group component (playback settings)
    obj.component('group')
      .float('fps', settings.fps ?? 0.0)
      .float('volume', settings.volume ?? 1.0)
      .float('audioOffset', settings.audioOffset ?? 0.0)
      .float('balance', settings.balance ?? 0.0)
      .int('noMovieAudio', settings.noMovieAudio ? 1 : 0)
      .int('rangeOffset', settings.rangeOffset ?? 0)
      .end();

    // RangeStart (optional)
    if (settings.rangeStart !== undefined) {
      const groupComp = obj.component('group');
      groupComp.int('rangeStart', settings.rangeStart);
      groupComp.end();
    }

    // Cut component (optional)
    if (settings.cutIn !== undefined || settings.cutOut !== undefined) {
      obj.component('cut')
        .int('in', settings.cutIn ?? -2147483648)
        .int('out', settings.cutOut ?? 2147483647)
        .end();
    }

    obj.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVLinearize object for color space conversion
   * @param name - Object name (e.g., 'sourceGroup000000_RVLinearize')
   * @param settings - Linearization settings
   */
  static buildLinearizeObject(name: string, settings: LinearizeSettings = {}): ObjectData {
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

    // Add matrices if provided
    if (lut.inMatrix) {
      const lutComp = linearizeObject.component('lut');
      lutComp.float('inMatrix', lut.inMatrix).end();
    }
    if (lut.outMatrix) {
      const lutComp = linearizeObject.component('lut');
      lutComp.float('outMatrix', lut.outMatrix).end();
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
  }

  /**
   * Build an RVLookLUT or RVCacheLUT object for LUT application
   * @param name - Object name (e.g., 'sourceGroup000000_RVLookLUT')
   * @param settings - LookLUT settings
   * @param protocol - Protocol type ('RVLookLUT' or 'RVCacheLUT')
   */
  static buildLookLUTObject(
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

    // Add matrices if provided
    if (settings.inMatrix) {
      const lutComp = lutObject.component('lut');
      lutComp.float('inMatrix', settings.inMatrix).end();
    }
    if (settings.outMatrix) {
      const lutComp = lutObject.component('lut');
      lutComp.float('outMatrix', settings.outMatrix).end();
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
  }

  /**
   * Build an RVColor object for color correction
   * @param name - Object name (e.g., 'sourceGroup000000_RVColor')
   * @param settings - Color correction settings
   */
  static buildColorObject(name: string, settings: ColorSettings = {}): ObjectData {
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
  }

  /**
   * Build an RVRetime object for time remapping
   * @param name - Object name (e.g., 'sourceGroup000000_RVRetime')
   * @param settings - Retime settings
   */
  static buildRetimeObject(name: string, settings: RetimeSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const retimeObject = builder.object(name, 'RVRetime', 1);

    // Visual component (video time scaling)
    retimeObject
      .component('visual')
      .float('scale', settings.visualScale ?? 1.0)
      .float('offset', settings.visualOffset ?? 0.0)
      .end();

    // Audio component (audio time scaling)
    retimeObject
      .component('audio')
      .float('scale', settings.audioScale ?? 1.0)
      .float('offset', settings.audioOffset ?? 0.0)
      .end();

    // Output component
    if (settings.outputFps !== undefined) {
      retimeObject
        .component('output')
        .float('fps', settings.outputFps)
        .end();
    }

    // Warp component (variable speed)
    if (settings.warp) {
      const warp = settings.warp;
      retimeObject
        .component('warp')
        .int('active', warp.active ? 1 : 0)
        .int('style', warp.style ?? 0)
        .int('keyFrames', warp.keyFrames ?? [])
        .float('keyRates', warp.keyRates ?? [])
        .end();
    }

    // Explicit component (explicit frame mapping)
    if (settings.explicit) {
      const explicit = settings.explicit;
      retimeObject
        .component('explicit')
        .int('active', explicit.active ? 1 : 0)
        .int('firstOutputFrame', explicit.firstOutputFrame ?? 1)
        .int('inputFrames', explicit.inputFrames ?? [])
        .end();
    }

    retimeObject.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVDisplayColor object for display output color processing
   * @param name - Object name (e.g., 'displayColorNode')
   * @param settings - Display color settings
   */
  static buildDisplayColorObject(name: string, settings: DisplayColorSettings = {}): ObjectData {
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
      colorComp.float44('matrix', settings.matrix);
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
  }

  /**
   * Build an RVDisplayStereo object for stereo display configuration
   * @param name - Object name (e.g., 'displayStereoNode')
   * @param settings - Display stereo settings
   */
  static buildDisplayStereoObject(name: string, settings: DisplayStereoSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const displayStereoObject = builder.object(name, 'RVDisplayStereo', 1);

    // Stereo component
    displayStereoObject
      .component('stereo')
      .string('type', settings.type ?? 'off')
      .int('swap', settings.swap ? 1 : 0)
      .float('relativeOffset', settings.relativeOffset ?? 0.0)
      .float2('rightOffset', [settings.rightOffset ?? [0, 0]])
      .end();

    displayStereoObject.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVSourceStereo object for per-source stereo configuration
   * @param name - Object name (e.g., 'sourceGroup000000_RVSourceStereo')
   * @param settings - Source stereo settings
   */
  static buildSourceStereoObject(name: string, settings: SourceStereoSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const sourceStereoObject = builder.object(name, 'RVSourceStereo', 1);

    // Stereo component
    sourceStereoObject
      .component('stereo')
      .int('swap', settings.swap ? 1 : 0)
      .float('relativeOffset', settings.relativeOffset ?? 0.0)
      .float('rightOffset', settings.rightOffset ?? 0.0)
      .end();

    // Right eye transform (if settings provided)
    if (settings.rightTransform) {
      const rt = settings.rightTransform;
      sourceStereoObject
        .component('rightTransform')
        .int('flip', rt.flip ? 1 : 0)
        .int('flop', rt.flop ? 1 : 0)
        .float('rotate', rt.rotate ?? 0.0)
        .float2('translate', [rt.translate ?? [0, 0]])
        .end();
    }

    sourceStereoObject.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVFormat object for crop and channel mapping
   * @param name - Object name
   * @param settings - Format settings (crop, channels)
   */
  static buildFormatObject(name: string, settings: FormatSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const formatObject = builder.object(name, 'RVFormat', 1);

    // Crop component
    if (settings.crop) {
      const crop = settings.crop;
      formatObject
        .component('crop')
        .int('active', crop.active !== false ? 1 : 0)
        .float('xmin', crop.xmin ?? 0)
        .float('ymin', crop.ymin ?? 0)
        .float('xmax', crop.xmax ?? 0)
        .float('ymax', crop.ymax ?? 0)
        .end();
    }

    // Format component (channel mapping)
    if (settings.channels && settings.channels.length > 0) {
      formatObject
        .component('format')
        .string('channels', settings.channels)
        .end();
    }

    formatObject.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVOverlay object for text, rectangle, and window overlays
   * @param name - Object name
   * @param settings - Overlay settings
   */
  static buildOverlayObject(name: string, settings: OverlaySettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const overlayObject = builder.object(name, 'RVOverlay', 1);

    // Calculate next IDs based on provided elements
    const nextRectId = settings.rectangles?.length ?? 0;
    const nextTextId = settings.texts?.length ?? 0;

    // Overlay component (metadata)
    overlayObject
      .component('overlay')
      .int('nextRectId', nextRectId)
      .int('nextTextId', nextTextId)
      .int('show', settings.show !== false ? 1 : 0)
      .end();

    // Matte component (if provided)
    if (settings.matte) {
      const matte = settings.matte;
      overlayObject
        .component('matte')
        .int('show', matte.show ? 1 : 0)
        .float('opacity', matte.opacity ?? 1.0)
        .float('aspect', matte.aspect ?? 1.78)
        .float('heightVisible', matte.heightVisible ?? 1.0)
        .float2('centerPoint', [matte.centerPoint ?? [0.5, 0.5]])
        .end();
    }

    // Rectangle overlays
    if (settings.rectangles) {
      for (const rect of settings.rectangles) {
        overlayObject
          .component(`rect:${rect.id}`)
          .float('width', rect.width ?? 0.1)
          .float('height', rect.height ?? 0.1)
          .float4('color', [rect.color ?? [1, 1, 1, 1]])
          .float2('position', [rect.position ?? [0.5, 0.5]])
          .int('eye', rect.eye ?? 0)
          .int('active', rect.active !== false ? 1 : 0)
          .end();
      }
    }

    // Text overlays
    if (settings.texts) {
      for (const text of settings.texts) {
        const textComp = overlayObject.component(`text:${text.id}`);
        textComp
          .float2('position', [text.position ?? [0.5, 0.5]])
          .float4('color', [text.color ?? [1, 1, 1, 1]])
          .float('size', text.size ?? 24)
          .float('scale', text.scale ?? 1.0)
          .float('rotation', text.rotation ?? 0)
          .float('spacing', text.spacing ?? 0)
          .string('font', text.font ?? '')
          .string('text', text.text ?? '')
          .string('origin', text.origin ?? 'top-left')
          .int('debug', text.debug ? 1 : 0)
          .int('eye', text.eye ?? 0)
          .int('active', text.active !== false ? 1 : 0)
          .float('pixelScale', text.pixelScale ?? 1.0)
          .int('firstFrame', text.firstFrame ?? 1);
        textComp.end();
      }
    }

    // Window overlays
    if (settings.windows) {
      for (const win of settings.windows) {
        const winComp = overlayObject.component(`window:${win.id}`);
        winComp
          .int('eye', win.eye ?? 0)
          .int('windowActive', win.windowActive ? 1 : 0)
          .int('outlineActive', win.outlineActive ? 1 : 0)
          .float('outlineWidth', win.outlineWidth ?? 1.0)
          .float4('outlineColor', [win.outlineColor ?? [1, 1, 1, 1]])
          .string('outlineBrush', win.outlineBrush ?? 'solid')
          .float4('windowColor', [win.windowColor ?? [0, 0, 0, 0.5]])
          .float('imageAspect', win.imageAspect ?? 1.0)
          .float('pixelScale', win.pixelScale ?? 1.0)
          .int('firstFrame', win.firstFrame ?? 1)
          .float('windowULx', win.upperLeft?.[0] ?? 0)
          .float('windowULy', win.upperLeft?.[1] ?? 0)
          .float('windowURx', win.upperRight?.[0] ?? 1)
          .float('windowURy', win.upperRight?.[1] ?? 0)
          .float('windowLLx', win.lowerLeft?.[0] ?? 0)
          .float('windowLLy', win.lowerLeft?.[1] ?? 1)
          .float('windowLRx', win.lowerRight?.[0] ?? 1)
          .float('windowLRy', win.lowerRight?.[1] ?? 1)
          .int('antialias', win.antialias !== false ? 1 : 0);
        winComp.end();
      }
    }

    overlayObject.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build an RVChannelMap object for channel remapping
   * @param name - Object name
   * @param settings - Channel map settings
   */
  static buildChannelMapObject(name: string, settings: ChannelMapSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const channelMapObject = builder.object(name, 'RVChannelMap', 1);

    // Format component (channel mapping)
    if (settings.channels && settings.channels.length > 0) {
      channelMapObject
        .component('format')
        .string('channels', settings.channels)
        .end();
    }

    channelMapObject.end();
    return builder.build().objects[0]!;
  }

  /**
   * Build the RVSession object with all session properties
   * @param session - Session instance
   * @param name - Object name (typically 'rv' or session name)
   * @param viewNode - Name of the default view node
   * @param comment - Optional session comment/notes
   */
  static buildSessionObject(
    session: Session,
    name: string,
    viewNode: string,
    comment = ''
  ): ObjectData {
    const builder = new GTOBuilder();
    const playback = session.getPlaybackState();

    builder
      .object(name, 'RVSession', 1)
      .component('session')
      .string('viewNode', viewNode)
      .int2('range', [[playback.inPoint, playback.outPoint]])
      .int2('region', [[playback.inPoint, playback.outPoint]])
      .float('fps', playback.fps)
      .int('realtime', 0)
      .int('inc', 1)
      .int('frame', playback.currentFrame)
      .int('currentFrame', playback.currentFrame)
      .int('marks', playback.marks.map(m => m.frame))
      .int('version', 2)
      .end()
      .component('root')
      .string('name', name)
      .string('comment', comment)
      .end()
      .component('matte')
      .int('show', 0)
      .float('aspect', 1.78)
      .float('opacity', 0.66)
      .float('heightVisible', -1.0)
      .float2('centerPoint', [[0, 0]])
      .end()
      .component('paintEffects')
      .int('hold', 0)
      .int('ghost', 0)
      .int('ghostBefore', 5)
      .int('ghostAfter', 5)
      .end()
      .end();

    return builder.build().objects[0]!;
  }

  static buildPaintObject(session: Session, paintEngine: PaintEngine, name: string): ObjectData {
    const builder = new GTOBuilder();
    const aspectRatio = this.getAspectRatio(session);
    const paintJSON = paintEngine.toJSON() as PaintSnapshot;

    const paintObject = builder.object(name, 'RVPaint', 3);
    paintObject
      .component('paint')
      .int('nextId', paintJSON.nextId)
      .int('nextAnnotationId', 0)
      .int('show', paintJSON.show ? 1 : 0)
      .int('ghost', paintJSON.effects.ghost ? 1 : 0)
      .int('hold', paintJSON.effects.hold ? 1 : 0)
      .int('ghostBefore', paintJSON.effects.ghostBefore)
      .int('ghostAfter', paintJSON.effects.ghostAfter)
      .string('exclude', [])
      .string('include', [])
      .end();

    const frameOrder = new Map<number, string[]>();
    const frames = Object.entries(paintJSON.frames).sort(([a], [b]) => Number(a) - Number(b));

    for (const [frameKey, annotations] of frames) {
      const frame = Number(frameKey);
      for (const annotation of annotations) {
        const componentName = this.annotationComponentName(annotation, frame);
        if (!frameOrder.has(frame)) {
          frameOrder.set(frame, []);
        }
        frameOrder.get(frame)!.push(componentName);

        if (annotation.type === 'pen') {
          this.writePenComponent(paintObject, componentName, annotation, aspectRatio);
        } else {
          this.writeTextComponent(paintObject, componentName, annotation as TextAnnotation, aspectRatio);
        }
      }
    }

    for (const [frame, order] of frameOrder) {
      paintObject
        .component(`frame:${frame}`)
        .string('order', order)
        .end();
    }

    paintObject.end();

    return builder.build().objects[0]!;
  }

  static toText(
    session: Session,
    paintEngine: PaintEngine,
    options: SessionExportOptions = {}
  ): string {
    const data = this.toGTOData(session, paintEngine, options);
    return SimpleWriter.write(data) as string;
  }

  static toBinary(
    session: Session,
    paintEngine: PaintEngine,
    options: SessionExportOptions = {}
  ): ArrayBuffer {
    const data = this.toGTOData(session, paintEngine, options);
    return SimpleWriter.write(data, { binary: true }) as ArrayBuffer;
  }

  static async saveToFile(
    session: Session,
    paintEngine: PaintEngine,
    filename = 'session.rv',
    options: { binary?: boolean } = {}
  ): Promise<void> {
    const isBinary = options.binary ?? filename.endsWith('.gto');
    
    let data: GTOData;
    if (session.gtoData) {
        console.log('Patching existing GTO data for export');
        data = this.updateGTOData(session.gtoData, session, paintEngine);
    } else {
        console.log('Generating new GTO data for export');
        data = this.toGTOData(session, paintEngine);
    }

    const payload = isBinary
      ? SimpleWriter.write(data, { binary: true })
      : SimpleWriter.write(data);
    const blob = new Blob([payload], { type: isBinary ? 'application/octet-stream' : 'text/plain' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const extension = isBinary ? '.gto' : '.rv';
    link.download = filename.endsWith(extension) ? filename : `${filename.replace(/\.(rv|gto)$/i, '')}${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Update existing GTO data with current session state
   * (Preserves original file structure and unsupported nodes)
   */
  static updateGTOData(originalData: GTOData, session: Session, paintEngine: PaintEngine): GTOData {
    // Deep clone to avoid mutating original
    const data: GTOData = JSON.parse(JSON.stringify(originalData));
    
    // Create new paint object using current state
    const currentPaintObject = this.buildPaintObject(session, paintEngine, 'annotations');
    
    // Index objects by name/protocol for easier access
    for (const obj of data.objects) {
      // 1. Update RVSession info
      if (obj.protocol === 'RVSession') {
        const sessionComp = this.findOrAddComponent(obj, 'session');
        const playback = session.getPlaybackState();
        
        this.updateProperty(sessionComp, 'frame', playback.currentFrame);
        this.updateProperty(sessionComp, 'currentFrame', playback.currentFrame);
        this.updateProperty(sessionComp, 'range', [playback.inPoint, playback.outPoint]);
        this.updateProperty(sessionComp, 'region', [playback.inPoint, playback.outPoint]);
        this.updateProperty(sessionComp, 'fps', playback.fps);
        
        if (playback.marks.length > 0) {
           this.updateProperty(sessionComp, 'marks', playback.marks.map(m => m.frame));
        } else {
            // Remove marks property if empty? Or set to empty array?
             this.updateProperty(sessionComp, 'marks', []);
        }
      }
      
      // 2. Update RVFileSource paths
      if (obj.protocol === 'RVFileSource') {
        const node = session.graph?.getNode(obj.name);
        if (node && node.type === 'RVFileSource') {
          const originalUrl = node.properties.getValue<string>('originalUrl');
          if (originalUrl) {
             const mediaComp = this.findOrAddComponent(obj, 'media');
             this.updateProperty(mediaComp, 'movie', originalUrl);
          }
        }
      }
    }
    
    // 3. Replace RVPaint object
    // Find index of existing paint object
    const paintIndex = data.objects.findIndex(o => o.protocol === 'RVPaint');
    if (paintIndex !== -1) {
      data.objects[paintIndex] = currentPaintObject;
    } else {
      data.objects.push(currentPaintObject);
    }

    return data;
  }

  protected static findOrAddComponent(obj: ObjectData, name: string): GTOComponent {
    if (!obj.components) {
      obj.components = {};
    }
    const components = (obj.components as unknown) as Record<string, GTOComponent>;
    let comp = components[name];
    if (!comp) {
      comp = { name, properties: [] };
      components[name] = comp;
    }
    return comp;
  }

  protected static updateProperty(comp: GTOComponent, name: string, value: unknown): void {
    const prop = comp.properties.find(p => p.name === name);
    if (prop) {
      prop.value = value;
    } else {
      // Simple type inference for new properties (limited support)
      // Ideally we shouldn't be adding new properties to unknown components often
      // But for RVSession we know the types
      comp.properties.push({ name, value }); 
    }
  }
  private static getAspectRatio(session: Session): number {
    const source = session.allSources[0];
    if (!source || source.height === 0) {
      return 1;
    }
    return source.width / source.height;
  }

  private static annotationComponentName(annotation: Annotation, frame: number): string {
    const user = annotation.user?.replace(/:/g, '_') || 'user';
    const prefix = annotation.type === 'pen' ? 'pen' : 'text';
    return `${prefix}:${annotation.id}:${frame}:${user}`;
  }

  protected static writePenComponent(
    paintObject: ReturnType<GTOBuilder['object']>,
    componentName: string,
    annotation: PenStroke,
    aspectRatio: number
  ): void {
    const points = annotation.points.map((point) => [
      (point.x - 0.5) * aspectRatio,
      point.y - 0.5,
    ]);

    const widths = Array.isArray(annotation.width)
      ? annotation.width
      : [annotation.width];
    const normalizedWidths = widths.map((value) => value / RV_PEN_WIDTH_SCALE);

    paintObject
      .component(componentName)
      .float4('color', [annotation.color])
      .float('width', normalizedWidths)
      .string('brush', annotation.brush === BrushType.Gaussian ? 'gaussian' : 'circle')
      .float2('points', points)
      .int('join', this.mapLineJoin(annotation.join))
      .int('cap', this.mapLineCap(annotation.cap))
      .int('splat', annotation.splat ? 1 : 0)
      .end();
  }

  protected static writeTextComponent(
    paintObject: ReturnType<GTOBuilder['object']>,
    componentName: string,
    annotation: TextAnnotation,
    aspectRatio: number
  ): void {
    const position: [number, number] = [
      (annotation.position.x - 0.5) * aspectRatio,
      annotation.position.y - 0.5,
    ];

    paintObject
      .component(componentName)
      .float2('position', [position])
      .float4('color', [annotation.color])
      .string('text', annotation.text)
      .float('size', annotation.size / RV_TEXT_SIZE_SCALE)
      .float('scale', annotation.scale)
      .float('rotation', annotation.rotation)
      .float('spacing', annotation.spacing)
      .string('font', annotation.font)
      .end();
  }

  private static mapLineJoin(join: LineJoin): number {
    switch (join) {
      case LineJoin.Miter:
        return 0;
      case LineJoin.Bevel:
        return 2;
      default:
        return 3;
    }
  }

  private static mapLineCap(cap: LineCap): number {
    switch (cap) {
      case LineCap.NoCap:
        return 0;
      case LineCap.Square:
        return 2;
      default:
        return 1;
    }
  }
}
