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
