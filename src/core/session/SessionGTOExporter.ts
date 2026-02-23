import { GTOBuilder, SimpleWriter } from 'gto-js';
import type { GTOData, ObjectData } from 'gto-js';
import type { Session, MediaSource } from './Session';
import type { PaintEngine } from '../../paint/PaintEngine';
import type { PaintEffects } from '../../paint/types';

// Import serializers
import { ColorSerializer } from './serializers/ColorSerializer';
import { TransformSerializer } from './serializers/TransformSerializer';
import { PaintSerializer } from './serializers/PaintSerializer';
import { FilterSerializer } from './serializers/FilterSerializer';
import { STATUS_COLORS } from './StatusManager';

// Re-export all settings interfaces for backward compatibility
export type {
  ColorExposureSettings,
  ColorCurveSettings,
  ColorTemperatureSettings,
  ColorSaturationSettings,
  ColorVibranceSettings,
  ColorShadowSettings,
  ColorHighlightSettings,
  ColorGrayScaleSettings,
  ColorCDLSettings,
  ColorLinearToSRGBSettings,
  ColorSRGBToLinearSettings,
  PrimaryConvertSettings,
  OCIOSettings,
  ICCSettings,
  CineonSettings,
  LinearizeLUTSettings,
  LinearizeSettings,
  LuminanceLUTSettings,
  ColorSettings,
  LookLUTSettings,
  DisplayColorSettings,
} from './serializers/ColorSerializer';

export type {
  DispTransform2DSettings,
  Transform2DSettings,
  LensWarpSettings,
  RotateCanvasSettings,
  ResizeSettings,
  FormatSettings,
} from './serializers/TransformSerializer';

export type {
  PaintSettings,
  OverlayRect,
  OverlayText,
  OverlayWindow,
  OverlaySettings,
  ChannelMapSettings,
} from './serializers/PaintSerializer';

export type {
  FilterGaussianSettings,
  UnsharpMaskSettings,
  NoiseReductionSettings,
  ClaritySettings,
} from './serializers/FilterSerializer';

// Import settings types needed by method signatures in this file
import type {
  ColorExposureSettings, ColorCurveSettings, ColorTemperatureSettings,
  ColorSaturationSettings, ColorVibranceSettings, ColorShadowSettings,
  ColorHighlightSettings, ColorGrayScaleSettings, ColorCDLSettings,
  ColorLinearToSRGBSettings, ColorSRGBToLinearSettings, PrimaryConvertSettings,
  OCIOSettings, ICCSettings, LinearizeSettings, ColorSettings,
  LookLUTSettings, DisplayColorSettings,
} from './serializers/ColorSerializer';
import type {
  DispTransform2DSettings, Transform2DSettings, LensWarpSettings,
  RotateCanvasSettings, ResizeSettings, FormatSettings,
} from './serializers/TransformSerializer';
import type {
  PaintSettings, OverlaySettings, OverlayRect, OverlayText, OverlayWindow,
  ChannelMapSettings,
} from './serializers/PaintSerializer';
import type {
  FilterGaussianSettings, UnsharpMaskSettings, NoiseReductionSettings, ClaritySettings,
} from './serializers/FilterSerializer';

interface PaintSnapshot {
  nextId: number;
  show: boolean;
  frames: Record<number, unknown[]>;
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
  /** OCIO settings to write as RVOCIO node (if provided) */
  ocioSettings?: OCIOSettings;
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
    const { name = 'rv', comment = '', includeSources = true, ocioSettings } = options;
    const viewNode = 'defaultSequence';

    const objects: ObjectData[] = [];
    const sourceGroupNames: string[] = [];

    // 1. Build RVSession object
    const sessionObject = this.buildSessionObject(session, paintEngine, name, viewNode, comment);
    objects.push(sessionObject);

    // 2. Build source groups for each media source
    if (includeSources && session.allSources.length > 0) {
      for (let i = 0; i < session.allSources.length; i++) {
        const source = session.allSources[i];
        if (!source) continue;

        const groupName = generateSourceGroupName(i);
        sourceGroupNames.push(groupName);

        const sourceObjects = this.buildSourceGroupObjects(source, groupName);

        // Add review status component to source group if status is set
        const statusEntry = session.statusManager.getStatusEntry(i);
        if (statusEntry) {
          const groupObj = sourceObjects[0]!;
          const reviewBuilder = new GTOBuilder();
          reviewBuilder
            .object('_temp', 'RVSourceGroup', 1)
            .component('review')
            .string('status', statusEntry.status)
            .string('statusColor', STATUS_COLORS[statusEntry.status] ?? '#94a3b8')
            .string('setBy', statusEntry.setBy)
            .string('setAt', statusEntry.setAt)
            .end()
            .end();
          const reviewComp = reviewBuilder.build().objects[0]!.components['review'];
          if (reviewComp) {
            (groupObj.components as Record<string, unknown>)['review'] = reviewComp;
          }
        }

        objects.push(...sourceObjects);
      }
    }

    // 2b. Build RVFormat object for uncrop if session has uncrop state
    if (session.uncropState && session.uncropState.active && sourceGroupNames.length > 0) {
      const formatName = `${sourceGroupNames[0]}_format`;
      const formatObject = this.buildFormatObject(formatName, {
        uncrop: {
          active: session.uncropState.active,
          x: session.uncropState.x,
          y: session.uncropState.y,
          width: session.uncropState.width,
          height: session.uncropState.height,
        },
      });
      objects.push(formatObject);
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

    // 6. Build RVOCIO object if OCIO settings provided
    if (ocioSettings) {
      const ocioObject = this.buildOCIOObject('display_ocio', ocioSettings);
      objects.push(ocioObject);
    }

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
      const outputComp = stackObject.component('layerOutput');
      outputComp.float('opacity', settings.layerOpacities).end();
    }

    stackObject.end();
    objects.push(stackBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build layout group objects (RVLayoutGroup + RVLayout)
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

  // --- Color serializer delegates ---

  /**
   * Build an RVOCIO object for OpenColorIO color management
   */
  static buildOCIOObject(name: string, settings: OCIOSettings = {}): ObjectData {
    return ColorSerializer.buildOCIOObject(name, settings);
  }

  /**
   * Build an RVICC object for ICC color profile transforms
   */
  static buildICCObject(name: string, settings: ICCSettings = {}): ObjectData {
    return ColorSerializer.buildICCObject(name, settings);
  }

  /**
   * Build an RVColorExposure object
   */
  static buildColorExposureObject(name: string, settings: ColorExposureSettings = {}): ObjectData {
    return ColorSerializer.buildColorExposureObject(name, settings);
  }

  /**
   * Build an RVColorCurve object
   */
  static buildColorCurveObject(name: string, settings: ColorCurveSettings = {}): ObjectData {
    return ColorSerializer.buildColorCurveObject(name, settings);
  }

  /**
   * Build an RVColorTemperature object
   */
  static buildColorTemperatureObject(name: string, settings: ColorTemperatureSettings = {}): ObjectData {
    return ColorSerializer.buildColorTemperatureObject(name, settings);
  }

  /**
   * Build an RVColorSaturation object
   */
  static buildColorSaturationObject(name: string, settings: ColorSaturationSettings = {}): ObjectData {
    return ColorSerializer.buildColorSaturationObject(name, settings);
  }

  /**
   * Build an RVColorVibrance object
   */
  static buildColorVibranceObject(name: string, settings: ColorVibranceSettings = {}): ObjectData {
    return ColorSerializer.buildColorVibranceObject(name, settings);
  }

  /**
   * Build an RVColorShadow object
   */
  static buildColorShadowObject(name: string, settings: ColorShadowSettings = {}): ObjectData {
    return ColorSerializer.buildColorShadowObject(name, settings);
  }

  /**
   * Build an RVColorHighlight object
   */
  static buildColorHighlightObject(name: string, settings: ColorHighlightSettings = {}): ObjectData {
    return ColorSerializer.buildColorHighlightObject(name, settings);
  }

  /**
   * Build an RVColorGrayScale object
   */
  static buildColorGrayScaleObject(name: string, settings: ColorGrayScaleSettings = {}): ObjectData {
    return ColorSerializer.buildColorGrayScaleObject(name, settings);
  }

  /**
   * Build an RVColorCDL object (standalone CDL node)
   */
  static buildColorCDLObject(name: string, settings: ColorCDLSettings = {}): ObjectData {
    return ColorSerializer.buildColorCDLObject(name, settings);
  }

  /**
   * Build an RVColorLinearToSRGB object
   */
  static buildColorLinearToSRGBObject(name: string, settings: ColorLinearToSRGBSettings = {}): ObjectData {
    return ColorSerializer.buildColorLinearToSRGBObject(name, settings);
  }

  /**
   * Build an RVColorSRGBToLinear object
   */
  static buildColorSRGBToLinearObject(name: string, settings: ColorSRGBToLinearSettings = {}): ObjectData {
    return ColorSerializer.buildColorSRGBToLinearObject(name, settings);
  }

  /**
   * Build an RVPrimaryConvert object for color primary conversion
   */
  static buildPrimaryConvertObject(name: string, settings: PrimaryConvertSettings = {}): ObjectData {
    return ColorSerializer.buildPrimaryConvertObject(name, settings);
  }

  /**
   * Build an RVLinearize object for color space conversion
   */
  static buildLinearizeObject(name: string, settings: LinearizeSettings = {}): ObjectData {
    return ColorSerializer.buildLinearizeObject(name, settings);
  }

  /**
   * Build an RVLookLUT or RVCacheLUT object for LUT application
   */
  static buildLookLUTObject(
    name: string,
    settings: LookLUTSettings = {},
    protocol: 'RVLookLUT' | 'RVCacheLUT' = 'RVLookLUT'
  ): ObjectData {
    return ColorSerializer.buildLookLUTObject(name, settings, protocol);
  }

  /**
   * Build an RVColor object for color correction
   */
  static buildColorObject(name: string, settings: ColorSettings = {}): ObjectData {
    return ColorSerializer.buildColorObject(name, settings);
  }

  /**
   * Build an RVDisplayColor object for display output color processing
   */
  static buildDisplayColorObject(name: string, settings: DisplayColorSettings = {}): ObjectData {
    return ColorSerializer.buildDisplayColorObject(name, settings);
  }

  // --- Filter serializer delegates ---

  /**
   * Build an RVFilterGaussian object for Gaussian blur
   */
  static buildFilterGaussianObject(name: string, settings: FilterGaussianSettings = {}): ObjectData {
    return FilterSerializer.buildFilterGaussianObject(name, settings);
  }

  /**
   * Build an RVUnsharpMask object for sharpening
   */
  static buildUnsharpMaskObject(name: string, settings: UnsharpMaskSettings = {}): ObjectData {
    return FilterSerializer.buildUnsharpMaskObject(name, settings);
  }

  /**
   * Build an RVNoiseReduction object
   */
  static buildNoiseReductionObject(name: string, settings: NoiseReductionSettings = {}): ObjectData {
    return FilterSerializer.buildNoiseReductionObject(name, settings);
  }

  /**
   * Build an RVClarity object for local contrast enhancement
   */
  static buildClarityObject(name: string, settings: ClaritySettings = {}): ObjectData {
    return FilterSerializer.buildClarityObject(name, settings);
  }

  // --- Transform serializer delegates ---

  /**
   * Build an RVDispTransform2D object for display transforms
   */
  static buildDispTransform2DObject(name: string, settings: DispTransform2DSettings = {}): ObjectData {
    return TransformSerializer.buildDispTransform2DObject(name, settings);
  }

  /**
   * Build an RVTransform2D object for source transforms
   */
  static buildTransform2DObject(name: string, settings: Transform2DSettings = {}): ObjectData {
    return TransformSerializer.buildTransform2DObject(name, settings);
  }

  /**
   * Build an RVLensWarp object for lens distortion correction
   */
  static buildLensWarpObject(name: string, settings: LensWarpSettings = {}): ObjectData {
    return TransformSerializer.buildLensWarpObject(name, settings);
  }

  /**
   * Build an RVRotateCanvas object
   */
  static buildRotateCanvasObject(name: string, settings: RotateCanvasSettings = {}): ObjectData {
    return TransformSerializer.buildRotateCanvasObject(name, settings);
  }

  /**
   * Build an RVResize object
   */
  static buildResizeObject(name: string, settings: ResizeSettings = {}): ObjectData {
    return TransformSerializer.buildResizeObject(name, settings);
  }

  /**
   * Build an RVFormat object for crop and channel mapping
   */
  static buildFormatObject(name: string, settings: FormatSettings = {}): ObjectData {
    return TransformSerializer.buildFormatObject(name, settings);
  }

  // --- Paint serializer delegates ---

  /**
   * Build a basic RVPaint node object (without stroke data)
   */
  static buildPaintNodeObject(name: string, settings: PaintSettings = {}): ObjectData {
    return PaintSerializer.buildPaintNodeObject(name, settings);
  }

  /**
   * Build an RVOverlay object for text, rectangle, and window overlays
   */
  static buildOverlayObject(name: string, settings: OverlaySettings = {}): ObjectData {
    return PaintSerializer.buildOverlayObject(name, settings);
  }

  /**
   * Build an RVChannelMap object for channel remapping
   */
  static buildChannelMapObject(name: string, settings: ChannelMapSettings = {}): ObjectData {
    return PaintSerializer.buildChannelMapObject(name, settings);
  }

  // --- Stereo, retime, source objects (remain in orchestrator) ---

  /**
   * Build an RVDisplayStereo object for stereo display configuration
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
   * Build an RVRetime object for time remapping
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
   * Build an RVImageSource object for programmatic image sources
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

  // --- Session & orchestration methods ---

  /**
   * Build the RVSession object with all session properties
   */
  static buildSessionObject(
    session: Session,
    paintEngine: PaintEngine,
    name: string,
    viewNode: string,
    comment = ''
  ): ObjectData {
    const builder = new GTOBuilder();
    const playback = session.getPlaybackState();
    const metadata = session.metadata;
    const matteSettings = session.matteSettings;
    // Use current paint engine state, not stale session state
    const paintState = paintEngine.toJSON() as PaintSnapshot;
    const paintEffects = paintState.effects;

    const obj = builder
      .object(name, 'RVSession', 1);

    obj
      .component('session')
      .string('viewNode', viewNode)
      .int2('range', [[playback.inPoint, playback.outPoint]])
      .int2('region', [[playback.inPoint, playback.outPoint]])
      .float('fps', playback.fps)
      .float('realtime', metadata.realtime || 0)
      .int('inc', session.frameIncrement)
      .int('frame', playback.currentFrame)
      .int('currentFrame', playback.currentFrame)
      .int('marks', playback.marks.map(m => m.frame))
      .string('markerNotes', playback.marks.map(m => m.note || ''))
      .string('markerColors', playback.marks.map(m => m.color || '#ff4444'))
      .int('version', metadata.version)
      .int('clipboard', metadata.clipboard)
      .float4('bgColor', [metadata.bgColor ?? [0.18, 0.18, 0.18, 1.0]])
      .end();

    obj
      .component('root')
      .string('name', metadata.displayName || name)
      .string('comment', metadata.comment || comment)
      .end();

    obj
      .component('matte')
      .int('show', matteSettings?.show ? 1 : 0)
      .float('aspect', matteSettings?.aspect ?? 1.78)
      .float('opacity', matteSettings?.opacity ?? 0.66)
      .float('heightVisible', matteSettings?.heightVisible ?? -1.0)
      .float2('centerPoint', [[matteSettings?.centerPoint?.[0] ?? 0, matteSettings?.centerPoint?.[1] ?? 0]])
      .end();

    obj
      .component('paintEffects')
      .int('hold', paintEffects.hold ? 1 : 0)
      .int('ghost', paintEffects.ghost ? 1 : 0)
      .int('ghostBefore', paintEffects.ghostBefore)
      .int('ghostAfter', paintEffects.ghostAfter)
      .end();

    obj
      .component('internal')
      .int('creationContext', metadata.creationContext)
      .end();

    obj
      .component('node')
      .string('origin', metadata.origin)
      .end();

    obj
      .component('membership')
      .string('contains', metadata.membershipContains)
      .end();

    // Notes component
    const notes = session.noteManager.getNotes();
    if (notes.length > 0) {
      const notesComp = obj
        .component('notes')
        .int('totalNotes', notes.length);
      notes.forEach((note, idx) => {
        const p = `note_${String(idx + 1).padStart(3, '0')}`;
        notesComp.string(`${p}_id`, note.id);
        notesComp.int(`${p}_sourceIndex`, note.sourceIndex);
        notesComp.int(`${p}_frameStart`, note.frameStart);
        notesComp.int(`${p}_frameEnd`, note.frameEnd);
        notesComp.string(`${p}_text`, note.text);
        notesComp.string(`${p}_author`, note.author);
        notesComp.string(`${p}_createdAt`, note.createdAt);
        notesComp.string(`${p}_modifiedAt`, note.modifiedAt);
        notesComp.string(`${p}_status`, note.status);
        notesComp.string(`${p}_parentId`, note.parentId || '');
        notesComp.string(`${p}_color`, note.color);
      });
      notesComp.end();
    }

    // Versions component
    const versionGroups = session.versionManager.getGroups();
    if (versionGroups.length > 0) {
      const versionsComp = obj
        .component('versions')
        .int('groupCount', versionGroups.length);
      versionGroups.forEach((group, gIdx) => {
        const gp = `group_${String(gIdx).padStart(3, '0')}`;
        versionsComp.string(`${gp}_id`, group.id);
        versionsComp.string(`${gp}_shotName`, group.shotName);
        versionsComp.int(`${gp}_activeVersionIndex`, group.activeVersionIndex);
        versionsComp.int(`${gp}_versionCount`, group.versions.length);
        group.versions.forEach((ver, vIdx) => {
          const vp = `${gp}_v${String(vIdx + 1).padStart(3, '0')}`;
          versionsComp.int(`${vp}_versionNumber`, ver.versionNumber);
          versionsComp.int(`${vp}_sourceIndex`, ver.sourceIndex);
          versionsComp.string(`${vp}_label`, ver.label);
          versionsComp.string(`${vp}_addedAt`, ver.addedAt);
        });
      });
      versionsComp.end();
    }

    obj.end();

    return builder.build().objects[0]!;
  }

  /**
   * Build the full paint/annotations object - delegates to PaintSerializer
   */
  static buildPaintObject(session: Session, paintEngine: PaintEngine, name: string): ObjectData {
    return PaintSerializer.buildPaintObject(session, paintEngine, name);
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
        this.updateProperty(sessionComp, 'realtime', session.metadata.realtime || 0);
        this.updateProperty(sessionComp, 'bgColor', session.metadata.bgColor ?? [0.18, 0.18, 0.18, 1.0]);

        if (playback.marks.length > 0) {
           this.updateProperty(sessionComp, 'marks', playback.marks.map(m => m.frame));
           this.updateProperty(sessionComp, 'markerNotes', playback.marks.map(m => m.note || ''));
           this.updateProperty(sessionComp, 'markerColors', playback.marks.map(m => m.color || '#ff4444'));
        } else {
            // Remove marks property if empty? Or set to empty array?
             this.updateProperty(sessionComp, 'marks', []);
             this.updateProperty(sessionComp, 'markerNotes', []);
             this.updateProperty(sessionComp, 'markerColors', []);
        }

        // Update notes component — rebuild from scratch to avoid stale slots
        const notes = session.noteManager.getNotes();
        const components = obj.components as Record<string, unknown>;
        if (notes.length > 0) {
          // Delete old component to avoid leftover note_XXX properties
          delete components['notes'];
          const notesComp = this.findOrAddComponent(obj, 'notes');
          this.updateProperty(notesComp, 'totalNotes', notes.length);
          notes.forEach((note, idx) => {
            const p = `note_${String(idx + 1).padStart(3, '0')}`;
            this.updateProperty(notesComp, `${p}_id`, note.id);
            this.updateProperty(notesComp, `${p}_sourceIndex`, note.sourceIndex);
            this.updateProperty(notesComp, `${p}_frameStart`, note.frameStart);
            this.updateProperty(notesComp, `${p}_frameEnd`, note.frameEnd);
            this.updateProperty(notesComp, `${p}_text`, note.text);
            this.updateProperty(notesComp, `${p}_author`, note.author);
            this.updateProperty(notesComp, `${p}_createdAt`, note.createdAt);
            this.updateProperty(notesComp, `${p}_modifiedAt`, note.modifiedAt);
            this.updateProperty(notesComp, `${p}_status`, note.status);
            this.updateProperty(notesComp, `${p}_parentId`, note.parentId || '');
            this.updateProperty(notesComp, `${p}_color`, note.color);
          });
        } else if (components && 'notes' in components) {
          // Remove stale notes component when all notes deleted
          delete components['notes'];
        }

        // Update versions component — rebuild from scratch to avoid stale slots
        const versionGroups = session.versionManager.getGroups();
        if (versionGroups.length > 0) {
          delete components['versions'];
          const versionsComp = this.findOrAddComponent(obj, 'versions');
          this.updateProperty(versionsComp, 'groupCount', versionGroups.length);
          versionGroups.forEach((group, gIdx) => {
            const gp = `group_${String(gIdx).padStart(3, '0')}`;
            this.updateProperty(versionsComp, `${gp}_id`, group.id);
            this.updateProperty(versionsComp, `${gp}_shotName`, group.shotName);
            this.updateProperty(versionsComp, `${gp}_activeVersionIndex`, group.activeVersionIndex);
            this.updateProperty(versionsComp, `${gp}_versionCount`, group.versions.length);
            group.versions.forEach((ver, vIdx) => {
              const vp = `${gp}_v${String(vIdx + 1).padStart(3, '0')}`;
              this.updateProperty(versionsComp, `${vp}_versionNumber`, ver.versionNumber);
              this.updateProperty(versionsComp, `${vp}_sourceIndex`, ver.sourceIndex);
              this.updateProperty(versionsComp, `${vp}_label`, ver.label);
              this.updateProperty(versionsComp, `${vp}_addedAt`, ver.addedAt);
            });
          });
        } else if (components && 'versions' in components) {
          delete components['versions'];
        }
      }

      // 2. Update RVSourceGroup review status
      if (obj.protocol === 'RVSourceGroup') {
        // Extract source index from group name (e.g., 'sourceGroup000000' → 0)
        const match = obj.name.match(/sourceGroup(\d+)/);
        if (match) {
          const sourceIndex = parseInt(match[1]!, 10);
          const statusEntry = session.statusManager.getStatusEntry(sourceIndex);
          const components = obj.components as Record<string, unknown>;
          if (statusEntry) {
            delete components['review'];
            const reviewComp = this.findOrAddComponent(obj, 'review');
            this.updateProperty(reviewComp, 'status', statusEntry.status);
            this.updateProperty(reviewComp, 'statusColor', STATUS_COLORS[statusEntry.status] ?? '#94a3b8');
            this.updateProperty(reviewComp, 'setBy', statusEntry.setBy);
            this.updateProperty(reviewComp, 'setAt', statusEntry.setAt);
          } else if (components && 'review' in components) {
            delete components['review'];
          }
        }
      }

      // 3. Update RVFileSource paths
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

    // 4. Replace RVOverlay objects
    // Rebuild each overlay from graph node properties (same pattern as RVPaint)
    for (let i = data.objects.length - 1; i >= 0; i--) {
      const obj = data.objects[i]!;
      if (obj.protocol !== 'RVOverlay') continue;

      const node = session.graph?.getNode(obj.name);
      if (!node) continue;

      const settings: OverlaySettings = {};

      const overlayShow = node.properties.getValue<boolean>('overlayShow');
      if (typeof overlayShow === 'boolean') {
        settings.show = overlayShow;
      }

      const rectangles = node.properties.getValue<OverlayRect[]>('overlayRectangles');
      if (Array.isArray(rectangles) && rectangles.length > 0) {
        settings.rectangles = rectangles;
      }

      const texts = node.properties.getValue<OverlayText[]>('overlayTexts');
      if (Array.isArray(texts) && texts.length > 0) {
        settings.texts = texts;
      }

      const windows = node.properties.getValue<OverlayWindow[]>('overlayWindows');
      if (Array.isArray(windows) && windows.length > 0) {
        settings.windows = windows;
      }

      const matteShow = node.properties.getValue<boolean>('matteShow');
      const matteOpacity = node.properties.getValue<number>('matteOpacity');
      const matteAspect = node.properties.getValue<number>('matteAspect');
      const matteHeightVisible = node.properties.getValue<number>('matteHeightVisible');
      const matteCenterPoint = node.properties.getValue<[number, number]>('matteCenterPoint');

      if (typeof matteShow === 'boolean' || typeof matteOpacity === 'number' ||
          typeof matteAspect === 'number' || typeof matteHeightVisible === 'number' ||
          Array.isArray(matteCenterPoint)) {
        settings.matte = {};
        if (typeof matteShow === 'boolean') settings.matte.show = matteShow;
        if (typeof matteOpacity === 'number') settings.matte.opacity = matteOpacity;
        if (typeof matteAspect === 'number') settings.matte.aspect = matteAspect;
        if (typeof matteHeightVisible === 'number') settings.matte.heightVisible = matteHeightVisible;
        if (Array.isArray(matteCenterPoint)) settings.matte.centerPoint = matteCenterPoint;
      }

      // Only emit an overlay object if it has meaningful content
      const hasContent = settings.rectangles || settings.texts || settings.windows ||
                         settings.matte || typeof settings.show === 'boolean';
      if (hasContent) {
        data.objects[i] = this.buildOverlayObject(obj.name, settings);
      } else {
        // Remove empty overlay objects
        data.objects.splice(i, 1);
      }
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
}
