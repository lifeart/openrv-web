/**
 * GTOGraphLoader - Reconstructs node graph from GTO/RV session files
 *
 * Parses RV session files using gto-js and creates the corresponding
 * node graph structure with proper connections.
 */

import type { GTODTO } from 'gto-js';
import { Graph } from '../graph/Graph';
import { NodeFactory } from '../../nodes/base/NodeFactory';
import type { IPNode } from '../../nodes/base/IPNode';

/**
 * Parsed node information from GTO
 */
export interface GTONodeInfo {
  name: string;
  protocol: string;
  inputs: string[];
  properties: Record<string, unknown>;
}

/**
 * Result of parsing a GTO file
 */
export interface GTOParseResult {
  graph: Graph;
  nodes: Map<string, IPNode>;
  rootNode: IPNode | null;
  sessionInfo: {
    name: string;
    viewNode?: string;
    frame?: number;
    fps?: number;
    inPoint?: number;
    outPoint?: number;
    marks?: number[];
  };
}

/**
 * Maps RV node protocols to our registered node types
 *
 * Note: Effect nodes (RVColor, RVTransform2D, etc.) are mapped but not yet
 * implemented. They will be silently skipped during graph construction.
 */
const PROTOCOL_TO_NODE_TYPE: Record<string, string> = {
  // Source nodes
  RVFileSource: 'RVFileSource',
  RVImageSource: 'RVFileSource',
  RVMovieSource: 'RVVideoSource',
  RVSequenceSource: 'RVSequenceSource',

  // Group nodes (containers)
  RVSequenceGroup: 'RVSequenceGroup',
  RVStackGroup: 'RVStackGroup',
  RVSwitchGroup: 'RVSwitchGroup',
  RVLayoutGroup: 'RVLayoutGroup',
  RVFolderGroup: 'RVFolderGroup',
  RVRetimeGroup: 'RVRetimeGroup',

  // Effect nodes
  RVColor: 'RVColor',
  RVTransform2D: 'RVTransform2D',
  RVLensWarp: 'RVLensWarp',
  RVCDL: 'RVCDL',
  RVLinearize: 'RVLinearize',
  RVLookLUT: 'RVLookLUT',
  RVCacheLUT: 'RVCacheLUT',
  RVRetime: 'RVRetime',

  // View/Display nodes
  RVDisplayColor: 'RVDisplayColor',
  RVDisplayStereo: 'RVDisplayStereo',
  RVSourceStereo: 'RVSourceStereo',

  // Overlay/Utility nodes
  RVOverlay: 'RVOverlay',
  RVFormat: 'RVFormat',
  RVChannelMap: 'RVChannelMap',
  RVLayout: 'RVLayout',
  RVSwitch: 'RVSwitch',

  // View nodes
  RVViewGroup: 'RVViewGroup',
  RVSoundTrack: 'RVSoundTrack',
  Waveform: 'Waveform',

  // Color management nodes
  RVOCIO: 'RVOCIO',
  RVICCTransform: 'RVICCTransform',
  RVICCLinearizeTransform: 'RVICCLinearizeTransform',
  RVICCDisplayTransform: 'RVICCDisplayTransform',

  // Color processing nodes
  RVColorExposure: 'RVColorExposure',
  RVColorCurve: 'RVColorCurve',
  RVColorTemperature: 'RVColorTemperature',
  RVColorSaturation: 'RVColorSaturation',
  RVColorVibrance: 'RVColorVibrance',
  RVColorShadow: 'RVColorShadow',
  RVColorHighlight: 'RVColorHighlight',
  RVColorGrayScale: 'RVColorGrayScale',
  RVColorCDL: 'RVColorCDL',
  RVColorACESLogCDL: 'RVColorACESLogCDL',
  RVColorLinearToSRGB: 'RVColorLinearToSRGB',
  RVColorSRGBToLinear: 'RVColorSRGBToLinear',
};

/**
 * Load node graph from an already-parsed GTODTO
 *
 * @param dto - Pre-parsed GTODTO object
 * @returns Parsed graph result with nodes and connections
 */
export function loadGTOGraph(dto: GTODTO, availableFiles?: Map<string, File>): GTOParseResult {
  try {
    return parseGTOToGraph(dto, availableFiles);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to construct node graph from GTO: ${message}`);
  }
}

/**
 * Parse GTODTO into a Graph
 */
function parseGTOToGraph(dto: GTODTO, availableFiles?: Map<string, File>): GTOParseResult {
  const graph = new Graph();
  const nodes = new Map<string, IPNode>();
  let rootNode: IPNode | null = null;

  // Session info
  const sessionInfo: GTOParseResult['sessionInfo'] = {
    name: 'Untitled Session',
  };

  // Parse RVSession first to get session-level info
  const sessions = dto.byProtocol('RVSession');
  if (sessions.length > 0) {
    const session = sessions.first();
    sessionInfo.name = session.name;

    // Get view node reference
    const sessionComp = session.component('session');
    if (sessionComp?.exists()) {
      const viewNode = sessionComp.property('viewNode').value() as string;
      if (viewNode) {
        sessionInfo.viewNode = viewNode;
      }

      const frame = sessionComp.property('frame').value() as number;
      const currentFrame = sessionComp.property('currentFrame').value() as number;
      if (typeof frame === 'number') {
        sessionInfo.frame = frame;
      } else if (typeof currentFrame === 'number') {
        sessionInfo.frame = currentFrame;
      }

      const region = sessionComp.property('region').value();
      const range = sessionComp.property('range').value();
      const resolveRange = (value: unknown): [number, number] | undefined => {
        if (!Array.isArray(value) || value.length === 0) {
          return undefined;
        }

        if (value.length >= 2) {
          const start = value[0];
          const end = value[1];
          if (typeof start === 'number' && typeof end === 'number') {
            return [start, end];
          }
          if (Array.isArray(start) && start.length >= 2) {
            const startValue = start[0];
            const endValue = start[1];
            if (typeof startValue === 'number' && typeof endValue === 'number') {
              return [startValue, endValue];
            }
          }
        }

        if (value.length === 1 && Array.isArray(value[0]) && value[0].length >= 2) {
          const startValue = value[0][0];
          const endValue = value[0][1];
          if (typeof startValue === 'number' && typeof endValue === 'number') {
            return [startValue, endValue];
          }
        }

        return undefined;
      };

      const resolvedRegion = resolveRange(region) ?? resolveRange(range);
      if (resolvedRegion) {
        sessionInfo.inPoint = resolvedRegion[0];
        sessionInfo.outPoint = resolvedRegion[1];
      }

      const marksValue = sessionComp.property('marks').value();
      if (Array.isArray(marksValue)) {
        const marks = marksValue.filter((value): value is number => typeof value === 'number');
        if (marks.length > 0) {
          sessionInfo.marks = marks;
        }
      }

      // Prefer 'realtime' (actual playback fps) over 'fps' if both exist
      const fps = sessionComp.property('fps').value() as number;
      const realtime = sessionComp.property('realtime').value() as number;
      if (typeof realtime === 'number' && realtime > 0) {
        sessionInfo.fps = realtime;
      } else if (typeof fps === 'number' && fps > 0) {
        sessionInfo.fps = fps;
      }
    }
  }

  // Collect all objects and their connections
  const nodeInfos = new Map<string, GTONodeInfo>();
  const allObjects = dto.objects();

  for (const obj of allObjects) {
    const protocol = obj.protocol;
    const name = obj.name;

    // Skip non-node objects
    if (!protocol || protocol === 'RVSession') continue;

    const nodeInfo: GTONodeInfo = {
      name,
      protocol,
      inputs: [],
      properties: {},
    };

    // Parse inputs from group component
    const groupComp = obj.component('group');
    if (groupComp?.exists()) {
      const uiName = groupComp.property('ui_name').value() as string;
      if (uiName) {
        nodeInfo.properties.ui_name = uiName;
      }
    }

    // Parse inputs from mode component (common in group nodes)
    const modeComp = obj.component('mode');
    if (modeComp?.exists()) {
      const inputs = modeComp.property('inputs').value();
      if (Array.isArray(inputs)) {
        nodeInfo.inputs = inputs.filter((i): i is string => typeof i === 'string');
      }
    }

    // Parse source-specific properties
    if (protocol === 'RVFileSource' || protocol === 'RVImageSource') {
      const mediaComp = obj.component('media');
      if (mediaComp?.exists()) {
        const movie = mediaComp.property('movie').value() as string;
        if (movie) {
          nodeInfo.properties.url = movie;

          // If we have available files (user selected), check for name match
          if (availableFiles && availableFiles.size > 0) {
            // Extract basename from movie path (e.g., /path/to/video.mp4 -> video.mp4)
            const basename = movie.split(/[/\\]/).pop();
            
            if (basename && availableFiles.has(basename)) {
              // Found a match! Use the blob URL for loading
              const file = availableFiles.get(basename)!;
              const blobUrl = URL.createObjectURL(file);

              nodeInfo.properties.url = blobUrl;
              nodeInfo.properties.originalUrl = movie; // Store original path for preservation
              nodeInfo.properties.file = file; // Store file for mediabunny initialization

              console.log(`Matched GTO file "${movie}" to local file "${file.name}"`);
            }
          }
        }
      }

      const proxyComp = obj.component('proxy');
      if (proxyComp?.exists()) {
        const sizeValue = proxyComp.property('size').value();
        const size = Array.isArray(sizeValue)
          ? (Array.isArray(sizeValue[0]) ? sizeValue[0] : sizeValue)
          : null;
        if (Array.isArray(size) && size.length >= 2) {
          nodeInfo.properties.width = size[0];
          nodeInfo.properties.height = size[1];
        }
      }
    }

    // Parse color properties
    if (protocol === 'RVColor') {
      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const exposure = colorComp.property('exposure').value() as number | number[];
        const gamma = colorComp.property('gamma').value() as number | number[];
        const saturation = colorComp.property('saturation').value() as number;
        const offset = colorComp.property('offset').value() as number | number[];
        const contrast = colorComp.property('contrast').value() as number | number[];
        const scale = colorComp.property('scale').value() as number[];
        const invert = colorComp.property('invert').value() as number;
        const lut = colorComp.property('lut').value() as string;
        const normalize = colorComp.property('normalize').value() as number;
        const hue = colorComp.property('hue').value() as number;
        const active = colorComp.property('active').value() as number;
        const unpremult = colorComp.property('unpremult').value() as number;

        if (exposure !== undefined) nodeInfo.properties.exposure = exposure;
        if (gamma !== undefined) nodeInfo.properties.gamma = gamma;
        if (typeof saturation === 'number') nodeInfo.properties.saturation = saturation;
        if (offset !== undefined) nodeInfo.properties.offset = offset;
        if (contrast !== undefined) nodeInfo.properties.contrast = contrast;
        if (Array.isArray(scale)) nodeInfo.properties.colorScale = scale;
        if (typeof invert === 'number') nodeInfo.properties.invert = invert !== 0;
        if (typeof lut === 'string') nodeInfo.properties.colorLut = lut;
        if (typeof normalize === 'number') nodeInfo.properties.normalize = normalize !== 0;
        if (typeof hue === 'number') nodeInfo.properties.hue = hue;
        if (typeof active === 'number') nodeInfo.properties.colorActive = active !== 0;
        if (typeof unpremult === 'number') nodeInfo.properties.unpremult = unpremult !== 0;
      }

      // Parse CDL component in RVColor
      const cdlComp = obj.component('CDL');
      if (cdlComp?.exists()) {
        const cdlActive = cdlComp.property('active').value() as number;
        const colorspace = cdlComp.property('colorspace').value() as string;
        const slope = cdlComp.property('slope').value() as number[];
        const cdlOffset = cdlComp.property('offset').value() as number[];
        const power = cdlComp.property('power').value() as number[];
        const cdlSaturation = cdlComp.property('saturation').value() as number;
        const noClamp = cdlComp.property('noClamp').value() as number;

        if (typeof cdlActive === 'number') nodeInfo.properties.cdlActive = cdlActive !== 0;
        if (typeof colorspace === 'string') nodeInfo.properties.cdlColorspace = colorspace;
        if (Array.isArray(slope)) nodeInfo.properties.slope = slope;
        if (Array.isArray(cdlOffset)) nodeInfo.properties.cdlOffset = cdlOffset;
        if (Array.isArray(power)) nodeInfo.properties.power = power;
        if (typeof cdlSaturation === 'number') nodeInfo.properties.cdlSaturation = cdlSaturation;
        if (typeof noClamp === 'number') nodeInfo.properties.cdlNoClamp = noClamp !== 0;
      }

      // Parse luminanceLUT component
      const lumLutComp = obj.component('luminanceLUT');
      if (lumLutComp?.exists()) {
        const lumLutActive = lumLutComp.property('active').value() as number;
        const lumLut = lumLutComp.property('lut').value() as number[];
        const lumMax = lumLutComp.property('max').value() as number;
        const lumSize = lumLutComp.property('size').value() as number;
        const lumName = lumLutComp.property('name').value() as string;

        if (typeof lumLutActive === 'number') nodeInfo.properties.luminanceLutActive = lumLutActive !== 0;
        if (Array.isArray(lumLut)) nodeInfo.properties.luminanceLut = lumLut;
        if (typeof lumMax === 'number') nodeInfo.properties.luminanceLutMax = lumMax;
        if (typeof lumSize === 'number') nodeInfo.properties.luminanceLutSize = lumSize;
        if (typeof lumName === 'string') nodeInfo.properties.luminanceLutName = lumName;
      }
    }

    // Parse CDL properties
    if (protocol === 'RVCDL') {
      const cdlComp = obj.component('CDL');
      if (cdlComp?.exists()) {
        const slope = cdlComp.property('slope').value() as number[];
        const offset = cdlComp.property('offset').value() as number[];
        const power = cdlComp.property('power').value() as number[];
        const saturation = cdlComp.property('saturation').value() as number;

        if (Array.isArray(slope)) nodeInfo.properties.slope = slope;
        if (Array.isArray(offset)) nodeInfo.properties.cdlOffset = offset;
        if (Array.isArray(power)) nodeInfo.properties.power = power;
        if (typeof saturation === 'number') nodeInfo.properties.cdlSaturation = saturation;
      }
    }

    // Parse transform properties
    if (protocol === 'RVTransform2D') {
      const transformComp = obj.component('transform');
      if (transformComp?.exists()) {
        const rotate = transformComp.property('rotate').value() as number;
        const flip = transformComp.property('flip').value() as boolean;
        const flop = transformComp.property('flop').value() as boolean;
        const scale = transformComp.property('scale').value() as number[];
        const translate = transformComp.property('translate').value() as number[];

        if (typeof rotate === 'number') nodeInfo.properties.rotate = rotate;
        if (typeof flip === 'boolean') nodeInfo.properties.flip = flip;
        if (typeof flop === 'boolean') nodeInfo.properties.flop = flop;
        if (Array.isArray(scale)) nodeInfo.properties.scale = scale;
        if (Array.isArray(translate)) nodeInfo.properties.translate = translate;
      }
    }

    // Parse lens warp properties
    if (protocol === 'RVLensWarp') {
      // Parse node component for active state
      const nodeComp = obj.component('node');
      if (nodeComp?.exists()) {
        const active = nodeComp.property('active').value() as number;
        if (typeof active === 'number') nodeInfo.properties.lensWarpActive = active !== 0;
      }

      const warpComp = obj.component('warp');
      if (warpComp?.exists()) {
        // Radial distortion coefficients
        const k1 = warpComp.property('k1').value() as number;
        const k2 = warpComp.property('k2').value() as number;
        const k3 = warpComp.property('k3').value() as number;
        // Tangential distortion
        const p1 = warpComp.property('p1').value() as number;
        const p2 = warpComp.property('p2').value() as number;
        // Distortion model
        const model = warpComp.property('model').value() as string;
        // Distortion scale
        const d = warpComp.property('d').value() as number;
        // Center point
        const center = warpComp.property('center').value() as number[];
        const offset = warpComp.property('offset').value() as number[];
        // Pixel aspect ratio
        const pixelAspectRatio = warpComp.property('pixelAspectRatio').value() as number;
        // Focal length
        const fx = warpComp.property('fx').value() as number;
        const fy = warpComp.property('fy').value() as number;
        // Crop ratios
        const cropRatioX = warpComp.property('cropRatioX').value() as number;
        const cropRatioY = warpComp.property('cropRatioY').value() as number;

        if (typeof k1 === 'number') nodeInfo.properties.k1 = k1;
        if (typeof k2 === 'number') nodeInfo.properties.k2 = k2;
        if (typeof k3 === 'number') nodeInfo.properties.k3 = k3;
        if (typeof p1 === 'number') nodeInfo.properties.p1 = p1;
        if (typeof p2 === 'number') nodeInfo.properties.p2 = p2;
        if (typeof model === 'string') nodeInfo.properties.lensModel = model;
        if (typeof d === 'number') nodeInfo.properties.distortionScale = d;
        if (Array.isArray(center) && center.length >= 2) {
          nodeInfo.properties.centerX = center[0]! - 0.5;
          nodeInfo.properties.centerY = center[1]! - 0.5;
        }
        if (Array.isArray(offset) && offset.length >= 2) {
          nodeInfo.properties.offsetX = offset[0];
          nodeInfo.properties.offsetY = offset[1];
        }
        if (typeof pixelAspectRatio === 'number') nodeInfo.properties.pixelAspectRatio = pixelAspectRatio;
        if (typeof fx === 'number') nodeInfo.properties.fx = fx;
        if (typeof fy === 'number') nodeInfo.properties.fy = fy;
        if (typeof cropRatioX === 'number') nodeInfo.properties.cropRatioX = cropRatioX;
        if (typeof cropRatioY === 'number') nodeInfo.properties.cropRatioY = cropRatioY;
      }
    }

    // Parse linearize properties
    if (protocol === 'RVLinearize') {
      // Parse node component (active state)
      const nodeComp = obj.component('node');
      if (nodeComp?.exists()) {
        const active = nodeComp.property('active').value() as number;
        if (typeof active === 'number') nodeInfo.properties.linearizeActive = active !== 0;
      }

      // Parse color component (transfer functions)
      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const colorActive = colorComp.property('active').value() as number;
        const lut = colorComp.property('lut').value() as string;
        const alphaType = colorComp.property('alphaType').value() as number;
        const logtype = colorComp.property('logtype').value() as number;
        const yuv = colorComp.property('YUV').value() as number;
        const invert = colorComp.property('invert').value() as number;
        const sRGB2linear = colorComp.property('sRGB2linear').value() as number;
        const rec709ToLinear = colorComp.property('Rec709ToLinear').value() as number;
        const fileGamma = colorComp.property('fileGamma').value() as number;
        const ignoreChromaticities = colorComp.property('ignoreChromaticities').value() as number;

        if (typeof colorActive === 'number') nodeInfo.properties.linearizeColorActive = colorActive !== 0;
        if (typeof lut === 'string') nodeInfo.properties.linearizeLut = lut;
        if (typeof alphaType === 'number') nodeInfo.properties.alphaType = alphaType;
        if (typeof logtype === 'number') nodeInfo.properties.logtype = logtype;
        if (typeof yuv === 'number') nodeInfo.properties.yuv = yuv !== 0;
        if (typeof invert === 'number') nodeInfo.properties.linearizeInvert = invert !== 0;
        if (typeof sRGB2linear === 'number') nodeInfo.properties.sRGB2linear = sRGB2linear !== 0;
        if (typeof rec709ToLinear === 'number') nodeInfo.properties.rec709ToLinear = rec709ToLinear !== 0;
        if (typeof fileGamma === 'number') nodeInfo.properties.fileGamma = fileGamma;
        if (typeof ignoreChromaticities === 'number') nodeInfo.properties.ignoreChromaticities = ignoreChromaticities !== 0;
      }

      // Parse cineon component
      const cineonComp = obj.component('cineon');
      if (cineonComp?.exists()) {
        const whiteCodeValue = cineonComp.property('whiteCodeValue').value() as number;
        const blackCodeValue = cineonComp.property('blackCodeValue').value() as number;
        const breakPointValue = cineonComp.property('breakPointValue').value() as number;

        if (typeof whiteCodeValue === 'number') nodeInfo.properties.cineonWhiteCode = whiteCodeValue;
        if (typeof blackCodeValue === 'number') nodeInfo.properties.cineonBlackCode = blackCodeValue;
        if (typeof breakPointValue === 'number') nodeInfo.properties.cineonBreakPoint = breakPointValue;
      }

      // Parse LUT component
      const lutComp = obj.component('lut');
      if (lutComp?.exists()) {
        const lutActive = lutComp.property('active').value() as number;
        const lutFile = lutComp.property('file').value() as string;
        const lutName = lutComp.property('name').value() as string;
        const lutType = lutComp.property('type').value() as string;
        const lutScale = lutComp.property('scale').value() as number;
        const lutOffset = lutComp.property('offset').value() as number;
        const lutSize = lutComp.property('size').value() as number[];
        const inMatrix = lutComp.property('inMatrix').value() as number[][];
        const outMatrix = lutComp.property('outMatrix').value() as number[][];

        if (typeof lutActive === 'number') nodeInfo.properties.lutActive = lutActive !== 0;
        if (typeof lutFile === 'string') nodeInfo.properties.lutFile = lutFile;
        if (typeof lutName === 'string') nodeInfo.properties.lutName = lutName;
        if (typeof lutType === 'string') nodeInfo.properties.lutType = lutType;
        if (typeof lutScale === 'number') nodeInfo.properties.lutScale = lutScale;
        if (typeof lutOffset === 'number') nodeInfo.properties.lutOffset = lutOffset;
        if (Array.isArray(lutSize)) nodeInfo.properties.lutSize = lutSize;
        if (Array.isArray(inMatrix)) nodeInfo.properties.lutInMatrix = inMatrix;
        if (Array.isArray(outMatrix)) nodeInfo.properties.lutOutMatrix = outMatrix;
      }
    }

    // Parse LookLUT/CacheLUT properties
    if (protocol === 'RVLookLUT' || protocol === 'RVCacheLUT') {
      // Parse node component (active state)
      const nodeComp = obj.component('node');
      if (nodeComp?.exists()) {
        const active = nodeComp.property('active').value() as number;
        if (typeof active === 'number') nodeInfo.properties.lookLutActive = active !== 0;
      }

      // Parse LUT component
      const lutComp = obj.component('lut');
      if (lutComp?.exists()) {
        const lutActive = lutComp.property('active').value() as number;
        const lutFile = lutComp.property('file').value() as string;
        const lutName = lutComp.property('name').value() as string;
        const lutType = lutComp.property('type').value() as string;
        const lutScale = lutComp.property('scale').value() as number;
        const lutOffset = lutComp.property('offset').value() as number;
        const lutSize = lutComp.property('size').value() as number[];
        const conditioningGamma = lutComp.property('conditioningGamma').value() as number;
        const preLUTSize = lutComp.property('preLUTSize').value() as number;
        const inMatrix = lutComp.property('inMatrix').value() as number[][];
        const outMatrix = lutComp.property('outMatrix').value() as number[][];

        if (typeof lutActive === 'number') nodeInfo.properties.lookLutComponentActive = lutActive !== 0;
        if (typeof lutFile === 'string') nodeInfo.properties.lookLutFile = lutFile;
        if (typeof lutName === 'string') nodeInfo.properties.lookLutName = lutName;
        if (typeof lutType === 'string') nodeInfo.properties.lookLutType = lutType;
        if (typeof lutScale === 'number') nodeInfo.properties.lookLutScale = lutScale;
        if (typeof lutOffset === 'number') nodeInfo.properties.lookLutOffset = lutOffset;
        if (Array.isArray(lutSize)) nodeInfo.properties.lookLutSize = lutSize;
        if (typeof conditioningGamma === 'number') nodeInfo.properties.lookLutConditioningGamma = conditioningGamma;
        if (typeof preLUTSize === 'number') nodeInfo.properties.lookLutPreLUTSize = preLUTSize;
        if (Array.isArray(inMatrix)) nodeInfo.properties.lookLutInMatrix = inMatrix;
        if (Array.isArray(outMatrix)) nodeInfo.properties.lookLutOutMatrix = outMatrix;
      }

      // Parse output component (compiled LUT data)
      const outputComp = obj.component('lut:output');
      if (outputComp?.exists()) {
        const outputSize = outputComp.property('size').value() as number;
        const outputType = outputComp.property('type').value() as string;
        const outputLut = outputComp.property('lut').value() as number[];
        const outputPrelut = outputComp.property('prelut').value() as number[];

        if (typeof outputSize === 'number') nodeInfo.properties.lookLutOutputSize = outputSize;
        if (typeof outputType === 'string') nodeInfo.properties.lookLutOutputType = outputType;
        if (Array.isArray(outputLut)) nodeInfo.properties.lookLutOutputData = outputLut;
        if (Array.isArray(outputPrelut)) nodeInfo.properties.lookLutOutputPrelut = outputPrelut;
      }
    }

    // Parse retime properties
    if (protocol === 'RVRetime') {
      // Parse visual component (video time scaling)
      const visualComp = obj.component('visual');
      if (visualComp?.exists()) {
        const visualScale = visualComp.property('scale').value() as number;
        const visualOffset = visualComp.property('offset').value() as number;

        if (typeof visualScale === 'number') nodeInfo.properties.visualScale = visualScale;
        if (typeof visualOffset === 'number') nodeInfo.properties.visualOffset = visualOffset;
      }

      // Parse audio component (audio time scaling)
      const audioComp = obj.component('audio');
      if (audioComp?.exists()) {
        const audioScale = audioComp.property('scale').value() as number;
        const audioOffset = audioComp.property('offset').value() as number;

        if (typeof audioScale === 'number') nodeInfo.properties.audioScale = audioScale;
        if (typeof audioOffset === 'number') nodeInfo.properties.audioOffset = audioOffset;
      }

      // Parse output component
      const outputComp = obj.component('output');
      if (outputComp?.exists()) {
        const outputFps = outputComp.property('fps').value() as number;

        if (typeof outputFps === 'number') nodeInfo.properties.retimeOutputFps = outputFps;
      }

      // Parse warp component (variable speed)
      const warpComp = obj.component('warp');
      if (warpComp?.exists()) {
        const warpActive = warpComp.property('active').value() as number;
        const warpStyle = warpComp.property('style').value() as number;
        const keyFrames = warpComp.property('keyFrames').value() as number[];
        const keyRates = warpComp.property('keyRates').value() as number[];

        if (typeof warpActive === 'number') nodeInfo.properties.warpActive = warpActive !== 0;
        if (typeof warpStyle === 'number') nodeInfo.properties.warpStyle = warpStyle;
        if (Array.isArray(keyFrames)) nodeInfo.properties.warpKeyFrames = keyFrames;
        if (Array.isArray(keyRates)) nodeInfo.properties.warpKeyRates = keyRates;
      }

      // Parse explicit component (explicit frame mapping)
      const explicitComp = obj.component('explicit');
      if (explicitComp?.exists()) {
        const explicitActive = explicitComp.property('active').value() as number;
        const firstOutputFrame = explicitComp.property('firstOutputFrame').value() as number;
        const inputFrames = explicitComp.property('inputFrames').value() as number[];

        if (typeof explicitActive === 'number') nodeInfo.properties.explicitActive = explicitActive !== 0;
        if (typeof firstOutputFrame === 'number') nodeInfo.properties.explicitFirstOutputFrame = firstOutputFrame;
        if (Array.isArray(inputFrames)) nodeInfo.properties.explicitInputFrames = inputFrames;
      }
    }

    // Parse stack/wipe properties
    if (protocol === 'RVStackGroup') {
      const stackComp = obj.component('stack');
      if (stackComp?.exists()) {
        const composite = stackComp.property('composite').value() as string;
        const mode = stackComp.property('mode').value() as string;

        if (composite) nodeInfo.properties.composite = composite;
        if (mode) nodeInfo.properties.mode = mode;
      }

      const wipeComp = obj.component('wipe');
      if (wipeComp?.exists()) {
        const x = wipeComp.property('x').value() as number;
        const y = wipeComp.property('y').value() as number;
        const angle = wipeComp.property('angle').value() as number;

        if (typeof x === 'number') nodeInfo.properties.wipeX = x;
        if (typeof y === 'number') nodeInfo.properties.wipeY = y;
        if (typeof angle === 'number') nodeInfo.properties.wipeAngle = angle;
      }

      // Parse per-layer composite settings
      const compositeComp = obj.component('composite');
      if (compositeComp?.exists()) {
        const types = compositeComp.property('type').value() as string[];
        if (Array.isArray(types)) {
          nodeInfo.properties.layerBlendModes = types;
        }
      }

      // Parse per-layer opacities from output component
      const outputComp = obj.component('output');
      if (outputComp?.exists()) {
        const opacities = outputComp.property('opacity').value() as number[];
        if (Array.isArray(opacities)) {
          nodeInfo.properties.layerOpacities = opacities;
        }
        const chosenAudio = outputComp.property('chosenAudioInput').value() as number;
        if (typeof chosenAudio === 'number') {
          nodeInfo.properties.chosenAudioInput = chosenAudio;
        }
        const policy = outputComp.property('outOfRangePolicy').value() as string;
        if (policy) {
          nodeInfo.properties.outOfRangePolicy = policy;
        }
      }

      // Parse mode settings
      const modeComp = obj.component('mode');
      if (modeComp?.exists()) {
        const alignStart = modeComp.property('alignStartFrames').value() as boolean;
        const strictRanges = modeComp.property('strictFrameRanges').value() as boolean;
        if (typeof alignStart === 'boolean') {
          nodeInfo.properties.alignStartFrames = alignStart;
        }
        if (typeof strictRanges === 'boolean') {
          nodeInfo.properties.strictFrameRanges = strictRanges;
        }
      }
    }

    // Parse RVSequenceGroup EDL properties
    if (protocol === 'RVSequenceGroup') {
      const edlComp = obj.component('edl');
      if (edlComp?.exists()) {
        const frames = edlComp.property('frame').value() as number[];
        const sources = edlComp.property('source').value() as number[];
        const inPoints = edlComp.property('in').value() as number[];
        const outPoints = edlComp.property('out').value() as number[];

        if (Array.isArray(frames)) nodeInfo.properties.edlFrames = frames;
        if (Array.isArray(sources)) nodeInfo.properties.edlSources = sources;
        if (Array.isArray(inPoints)) nodeInfo.properties.edlIn = inPoints;
        if (Array.isArray(outPoints)) nodeInfo.properties.edlOut = outPoints;
      }

      // Parse sequence output settings
      const outputComp = obj.component('output');
      if (outputComp?.exists()) {
        const autoSize = outputComp.property('autoSize').value() as boolean;
        if (typeof autoSize === 'boolean') {
          nodeInfo.properties.autoSize = autoSize;
        }
      }

      // Parse sequence mode settings
      const modeComp = obj.component('mode');
      if (modeComp?.exists()) {
        const autoEDL = modeComp.property('autoEDL').value() as boolean;
        const useCutInfo = modeComp.property('useCutInfo').value() as boolean;
        if (typeof autoEDL === 'boolean') {
          nodeInfo.properties.autoEDL = autoEDL;
        }
        if (typeof useCutInfo === 'boolean') {
          nodeInfo.properties.useCutInfo = useCutInfo;
        }
      }
    }

    // Parse switch properties
    if (protocol === 'RVSwitchGroup') {
      const switchComp = obj.component('output');
      if (switchComp?.exists()) {
        const index = switchComp.property('index').value() as number;
        if (typeof index === 'number') {
          nodeInfo.properties.outputIndex = index;
        }
      }
    }

    // Parse display color properties
    if (protocol === 'RVDisplayColor') {
      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const active = colorComp.property('active').value() as number;
        const channelOrder = colorComp.property('channelOrder').value() as string;
        const channelFlood = colorComp.property('channelFlood').value() as number;
        const premult = colorComp.property('premult').value() as number;
        const gamma = colorComp.property('gamma').value() as number;
        const sRGB = colorComp.property('sRGB').value() as number;
        const Rec709 = colorComp.property('Rec709').value() as number;
        const brightness = colorComp.property('brightness').value() as number;
        const outOfRange = colorComp.property('outOfRange').value() as number;
        const dither = colorComp.property('dither').value() as number;
        const ditherLast = colorComp.property('ditherLast').value() as number;
        const overrideColorspace = colorComp.property('overrideColorspace').value() as string;

        if (typeof active === 'number') nodeInfo.properties.displayColorActive = active !== 0;
        if (typeof channelOrder === 'string') nodeInfo.properties.channelOrder = channelOrder;
        if (typeof channelFlood === 'number') nodeInfo.properties.channelFlood = channelFlood;
        if (typeof premult === 'number') nodeInfo.properties.premult = premult !== 0;
        if (typeof gamma === 'number') nodeInfo.properties.displayGamma = gamma;
        if (typeof sRGB === 'number') nodeInfo.properties.sRGB = sRGB !== 0;
        if (typeof Rec709 === 'number') nodeInfo.properties.Rec709 = Rec709 !== 0;
        if (typeof brightness === 'number') nodeInfo.properties.displayBrightness = brightness;
        if (typeof outOfRange === 'number') nodeInfo.properties.outOfRange = outOfRange;
        if (typeof dither === 'number') nodeInfo.properties.dither = dither;
        if (typeof ditherLast === 'number') nodeInfo.properties.ditherLast = ditherLast !== 0;
        if (typeof overrideColorspace === 'string') nodeInfo.properties.overrideColorspace = overrideColorspace;
      }

      // Parse chromaticities component
      const chromComp = obj.component('chromaticities');
      if (chromComp?.exists()) {
        const chromActive = chromComp.property('active').value() as number;
        const adoptedNeutral = chromComp.property('adoptedNeutral').value() as number;
        const white = chromComp.property('white').value() as number[];
        const red = chromComp.property('red').value() as number[];
        const green = chromComp.property('green').value() as number[];
        const blue = chromComp.property('blue').value() as number[];
        const neutral = chromComp.property('neutral').value() as number[];

        if (typeof chromActive === 'number') nodeInfo.properties.chromaticitiesActive = chromActive !== 0;
        if (typeof adoptedNeutral === 'number') nodeInfo.properties.adoptedNeutral = adoptedNeutral !== 0;
        if (Array.isArray(white)) nodeInfo.properties.chromaticitiesWhite = white;
        if (Array.isArray(red)) nodeInfo.properties.chromaticitiesRed = red;
        if (Array.isArray(green)) nodeInfo.properties.chromaticitiesGreen = green;
        if (Array.isArray(blue)) nodeInfo.properties.chromaticitiesBlue = blue;
        if (Array.isArray(neutral)) nodeInfo.properties.chromaticitiesNeutral = neutral;
      }
    }

    // Parse display stereo properties
    if (protocol === 'RVDisplayStereo') {
      const stereoComp = obj.component('stereo');
      if (stereoComp?.exists()) {
        const stereoType = stereoComp.property('type').value() as string;
        const swap = stereoComp.property('swap').value() as number;
        const relativeOffset = stereoComp.property('relativeOffset').value() as number;
        const rightOffset = stereoComp.property('rightOffset').value() as number[];

        if (typeof stereoType === 'string') nodeInfo.properties.stereoType = stereoType;
        if (typeof swap === 'number') nodeInfo.properties.stereoSwap = swap !== 0;
        if (typeof relativeOffset === 'number') nodeInfo.properties.stereoRelativeOffset = relativeOffset;
        if (Array.isArray(rightOffset)) nodeInfo.properties.stereoRightOffset = rightOffset;
      }
    }

    // Parse source stereo properties (per-source stereo configuration)
    if (protocol === 'RVSourceStereo') {
      const stereoComp = obj.component('stereo');
      if (stereoComp?.exists()) {
        const swap = stereoComp.property('swap').value() as number;
        const relativeOffset = stereoComp.property('relativeOffset').value() as number;
        const rightOffset = stereoComp.property('rightOffset').value() as number;

        if (typeof swap === 'number') nodeInfo.properties.sourceStereoSwap = swap !== 0;
        if (typeof relativeOffset === 'number') nodeInfo.properties.sourceStereoRelativeOffset = relativeOffset;
        if (typeof rightOffset === 'number') nodeInfo.properties.sourceStereoRightOffset = rightOffset;
      }

      // Parse right eye transform
      const rightTransformComp = obj.component('rightTransform');
      if (rightTransformComp?.exists()) {
        const flip = rightTransformComp.property('flip').value() as number;
        const flop = rightTransformComp.property('flop').value() as number;
        const rotate = rightTransformComp.property('rotate').value() as number;
        const translate = rightTransformComp.property('translate').value() as number[];

        if (typeof flip === 'number') nodeInfo.properties.rightEyeFlip = flip !== 0;
        if (typeof flop === 'number') nodeInfo.properties.rightEyeFlop = flop !== 0;
        if (typeof rotate === 'number') nodeInfo.properties.rightEyeRotate = rotate;
        if (Array.isArray(translate)) nodeInfo.properties.rightEyeTranslate = translate;
      }
    }

    // Parse RVOverlay properties
    if (protocol === 'RVOverlay') {
      // Overlay metadata component
      const overlayComp = obj.component('overlay');
      if (overlayComp?.exists()) {
        const show = overlayComp.property('show').value() as number;
        const nextRectId = overlayComp.property('nextRectId').value() as number;
        const nextTextId = overlayComp.property('nextTextId').value() as number;

        if (typeof show === 'number') nodeInfo.properties.overlayShow = show !== 0;
        if (typeof nextRectId === 'number') nodeInfo.properties.overlayNextRectId = nextRectId;
        if (typeof nextTextId === 'number') nodeInfo.properties.overlayNextTextId = nextTextId;
      }

      // Matte component
      const matteComp = obj.component('matte');
      if (matteComp?.exists()) {
        const show = matteComp.property('show').value() as number;
        const opacity = matteComp.property('opacity').value() as number;
        const aspect = matteComp.property('aspect').value() as number;
        const heightVisible = matteComp.property('heightVisible').value() as number;
        const centerPoint = matteComp.property('centerPoint').value() as number[];

        if (typeof show === 'number') nodeInfo.properties.matteShow = show !== 0;
        if (typeof opacity === 'number') nodeInfo.properties.matteOpacity = opacity;
        if (typeof aspect === 'number') nodeInfo.properties.matteAspect = aspect;
        if (typeof heightVisible === 'number') nodeInfo.properties.matteHeightVisible = heightVisible;
        if (Array.isArray(centerPoint)) nodeInfo.properties.matteCenterPoint = centerPoint;
      }

      // Parse dynamic rect components (rect:0, rect:1, etc.)
      const rectangles: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 100; i++) {
        const rectComp = obj.component(`rect:${i}`);
        if (!rectComp?.exists()) break;

        const rect: Record<string, unknown> = { id: i };
        const width = rectComp.property('width').value() as number;
        const height = rectComp.property('height').value() as number;
        const color = rectComp.property('color').value() as number[];
        const position = rectComp.property('position').value() as number[];
        const eye = rectComp.property('eye').value() as number;
        const active = rectComp.property('active').value() as number;

        if (typeof width === 'number') rect.width = width;
        if (typeof height === 'number') rect.height = height;
        if (Array.isArray(color)) rect.color = color;
        if (Array.isArray(position)) rect.position = position;
        if (typeof eye === 'number') rect.eye = eye;
        if (typeof active === 'number') rect.active = active !== 0;

        rectangles.push(rect);
      }
      if (rectangles.length > 0) nodeInfo.properties.overlayRectangles = rectangles;

      // Parse dynamic text components (text:0, text:1, etc.)
      const texts: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 100; i++) {
        const textComp = obj.component(`text:${i}`);
        if (!textComp?.exists()) break;

        const text: Record<string, unknown> = { id: i };
        const position = textComp.property('position').value() as number[];
        const color = textComp.property('color').value() as number[];
        const size = textComp.property('size').value() as number;
        const scale = textComp.property('scale').value() as number;
        const rotation = textComp.property('rotation').value() as number;
        const spacing = textComp.property('spacing').value() as number;
        const font = textComp.property('font').value() as string;
        const textContent = textComp.property('text').value() as string;
        const origin = textComp.property('origin').value() as string;
        const debug = textComp.property('debug').value() as number;
        const eye = textComp.property('eye').value() as number;
        const active = textComp.property('active').value() as number;
        const pixelScale = textComp.property('pixelScale').value() as number;
        const firstFrame = textComp.property('firstFrame').value() as number;

        if (Array.isArray(position)) text.position = position;
        if (Array.isArray(color)) text.color = color;
        if (typeof size === 'number') text.size = size;
        if (typeof scale === 'number') text.scale = scale;
        if (typeof rotation === 'number') text.rotation = rotation;
        if (typeof spacing === 'number') text.spacing = spacing;
        if (typeof font === 'string') text.font = font;
        if (typeof textContent === 'string') text.text = textContent;
        if (typeof origin === 'string') text.origin = origin;
        if (typeof debug === 'number') text.debug = debug !== 0;
        if (typeof eye === 'number') text.eye = eye;
        if (typeof active === 'number') text.active = active !== 0;
        if (typeof pixelScale === 'number') text.pixelScale = pixelScale;
        if (typeof firstFrame === 'number') text.firstFrame = firstFrame;

        texts.push(text);
      }
      if (texts.length > 0) nodeInfo.properties.overlayTexts = texts;

      // Parse dynamic window components (window:0, window:1, etc.)
      const windows: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 100; i++) {
        const winComp = obj.component(`window:${i}`);
        if (!winComp?.exists()) break;

        const win: Record<string, unknown> = { id: i };
        const eye = winComp.property('eye').value() as number;
        const windowActive = winComp.property('windowActive').value() as number;
        const outlineActive = winComp.property('outlineActive').value() as number;
        const outlineWidth = winComp.property('outlineWidth').value() as number;
        const outlineColor = winComp.property('outlineColor').value() as number[];
        const outlineBrush = winComp.property('outlineBrush').value() as string;
        const windowColor = winComp.property('windowColor').value() as number[];
        const imageAspect = winComp.property('imageAspect').value() as number;
        const pixelScale = winComp.property('pixelScale').value() as number;
        const firstFrame = winComp.property('firstFrame').value() as number;
        const windowULx = winComp.property('windowULx').value() as number;
        const windowULy = winComp.property('windowULy').value() as number;
        const windowURx = winComp.property('windowURx').value() as number;
        const windowURy = winComp.property('windowURy').value() as number;
        const windowLLx = winComp.property('windowLLx').value() as number;
        const windowLLy = winComp.property('windowLLy').value() as number;
        const windowLRx = winComp.property('windowLRx').value() as number;
        const windowLRy = winComp.property('windowLRy').value() as number;
        const antialias = winComp.property('antialias').value() as number;

        if (typeof eye === 'number') win.eye = eye;
        if (typeof windowActive === 'number') win.windowActive = windowActive !== 0;
        if (typeof outlineActive === 'number') win.outlineActive = outlineActive !== 0;
        if (typeof outlineWidth === 'number') win.outlineWidth = outlineWidth;
        if (Array.isArray(outlineColor)) win.outlineColor = outlineColor;
        if (typeof outlineBrush === 'string') win.outlineBrush = outlineBrush;
        if (Array.isArray(windowColor)) win.windowColor = windowColor;
        if (typeof imageAspect === 'number') win.imageAspect = imageAspect;
        if (typeof pixelScale === 'number') win.pixelScale = pixelScale;
        if (typeof firstFrame === 'number') win.firstFrame = firstFrame;
        if (typeof windowULx === 'number') win.upperLeft = [windowULx, windowULy];
        if (typeof windowURx === 'number') win.upperRight = [windowURx, windowURy];
        if (typeof windowLLx === 'number') win.lowerLeft = [windowLLx, windowLLy];
        if (typeof windowLRx === 'number') win.lowerRight = [windowLRx, windowLRy];
        if (typeof antialias === 'number') win.antialias = antialias !== 0;

        windows.push(win);
      }
      if (windows.length > 0) nodeInfo.properties.overlayWindows = windows;
    }

    // Parse RVChannelMap properties
    if (protocol === 'RVChannelMap') {
      const formatComp = obj.component('format');
      if (formatComp?.exists()) {
        const channels = formatComp.property('channels').value() as string[];
        if (Array.isArray(channels)) nodeInfo.properties.channelMapChannels = channels;
      }
    }

    // Parse RVFormat properties (format component, different from crop)
    if (protocol === 'RVFormat') {
      const formatComp = obj.component('format');
      if (formatComp?.exists()) {
        const channels = formatComp.property('channels').value() as string[];
        if (Array.isArray(channels)) nodeInfo.properties.formatChannels = channels;
      }
    }

    // Parse RVLayout properties
    if (protocol === 'RVLayout') {
      const layoutComp = obj.component('layout');
      if (layoutComp?.exists()) {
        const mode = layoutComp.property('mode').value() as string;
        const spacing = layoutComp.property('spacing').value() as number;
        const gridRows = layoutComp.property('gridRows').value() as number;
        const gridColumns = layoutComp.property('gridColumns').value() as number;

        if (typeof mode === 'string') nodeInfo.properties.layoutMode = mode;
        if (typeof spacing === 'number') nodeInfo.properties.layoutSpacing = spacing;
        if (typeof gridRows === 'number') nodeInfo.properties.layoutGridRows = gridRows;
        if (typeof gridColumns === 'number') nodeInfo.properties.layoutGridColumns = gridColumns;
      }

      const timingComp = obj.component('timing');
      if (timingComp?.exists()) {
        const retimeInputs = timingComp.property('retimeInputs').value() as number;
        if (typeof retimeInputs === 'number') nodeInfo.properties.layoutRetimeInputs = retimeInputs !== 0;
      }
    }

    // Parse RVSwitch properties
    if (protocol === 'RVSwitch') {
      const outputComp = obj.component('output');
      if (outputComp?.exists()) {
        const fps = outputComp.property('fps').value() as number;
        const size = outputComp.property('size').value() as number[];
        const input = outputComp.property('input').value() as string;
        const autoSize = outputComp.property('autoSize').value() as number;

        if (typeof fps === 'number') nodeInfo.properties.switchFps = fps;
        if (Array.isArray(size)) nodeInfo.properties.switchSize = size;
        if (typeof input === 'string') nodeInfo.properties.switchInput = input;
        if (typeof autoSize === 'number') nodeInfo.properties.switchAutoSize = autoSize !== 0;
      }

      const modeComp = obj.component('mode');
      if (modeComp?.exists()) {
        const useCutInfo = modeComp.property('useCutInfo').value() as number;
        const autoEDL = modeComp.property('autoEDL').value() as number;
        const alignStartFrames = modeComp.property('alignStartFrames').value() as number;

        if (typeof useCutInfo === 'number') nodeInfo.properties.switchUseCutInfo = useCutInfo !== 0;
        if (typeof autoEDL === 'number') nodeInfo.properties.switchAutoEDL = autoEDL !== 0;
        if (typeof alignStartFrames === 'number') nodeInfo.properties.switchAlignStartFrames = alignStartFrames !== 0;
      }
    }

    // Parse RVSoundTrack properties
    if (protocol === 'RVSoundTrack') {
      const audioComp = obj.component('audio');
      if (audioComp?.exists()) {
        const volume = audioComp.property('volume').value() as number;
        const balance = audioComp.property('balance').value() as number;
        const offset = audioComp.property('offset').value() as number;
        const internalOffset = audioComp.property('internalOffset').value() as number;
        const mute = audioComp.property('mute').value() as number;
        const softClamp = audioComp.property('softClamp').value() as number;

        if (typeof volume === 'number') nodeInfo.properties.audioVolume = volume;
        if (typeof balance === 'number') nodeInfo.properties.audioBalance = balance;
        if (typeof offset === 'number') nodeInfo.properties.audioOffset = offset;
        if (typeof internalOffset === 'number') nodeInfo.properties.audioInternalOffset = internalOffset;
        if (typeof mute === 'number') nodeInfo.properties.audioMute = mute !== 0;
        if (typeof softClamp === 'number') nodeInfo.properties.audioSoftClamp = softClamp !== 0;
      }

      const visualComp = obj.component('visual');
      if (visualComp?.exists()) {
        const width = visualComp.property('width').value() as number;
        const height = visualComp.property('height').value() as number;

        if (typeof width === 'number') nodeInfo.properties.waveformWidth = width;
        if (typeof height === 'number') nodeInfo.properties.waveformHeight = height;
      }
    }

    // Parse RVOCIO properties
    if (protocol === 'RVOCIO') {
      const ocioComp = obj.component('ocio');
      if (ocioComp?.exists()) {
        const active = ocioComp.property('active').value() as number;
        const func = ocioComp.property('function').value() as string;
        const inColorSpace = ocioComp.property('inColorSpace').value() as string;
        const lut3DSize = ocioComp.property('lut3DSize').value() as number;

        if (typeof active === 'number') nodeInfo.properties.ocioActive = active !== 0;
        if (typeof func === 'string') nodeInfo.properties.ocioFunction = func;
        if (typeof inColorSpace === 'string') nodeInfo.properties.ocioInColorSpace = inColorSpace;
        if (typeof lut3DSize === 'number') nodeInfo.properties.ocioLut3DSize = lut3DSize;
      }

      const ocioColorComp = obj.component('ocio_color');
      if (ocioColorComp?.exists()) {
        const outColorSpace = ocioColorComp.property('outColorSpace').value() as string;
        if (typeof outColorSpace === 'string') nodeInfo.properties.ocioOutColorSpace = outColorSpace;
      }

      const ocioLookComp = obj.component('ocio_look');
      if (ocioLookComp?.exists()) {
        const look = ocioLookComp.property('look').value() as string;
        const direction = ocioLookComp.property('direction').value() as number;

        if (typeof look === 'string') nodeInfo.properties.ocioLook = look;
        if (typeof direction === 'number') nodeInfo.properties.ocioLookDirection = direction;
      }

      const ocioDisplayComp = obj.component('ocio_display');
      if (ocioDisplayComp?.exists()) {
        const display = ocioDisplayComp.property('display').value() as string;
        const view = ocioDisplayComp.property('view').value() as string;

        if (typeof display === 'string') nodeInfo.properties.ocioDisplay = display;
        if (typeof view === 'string') nodeInfo.properties.ocioView = view;
      }

      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const dither = colorComp.property('dither').value() as number;
        const channelOrder = colorComp.property('channelOrder').value() as string;

        if (typeof dither === 'number') nodeInfo.properties.ocioDither = dither !== 0;
        if (typeof channelOrder === 'string') nodeInfo.properties.ocioChannelOrder = channelOrder;
      }

      const inTransformComp = obj.component('inTransform');
      if (inTransformComp?.exists()) {
        const url = inTransformComp.property('url').value() as string;
        if (typeof url === 'string') nodeInfo.properties.ocioInTransformUrl = url;
      }

      const outTransformComp = obj.component('outTransform');
      if (outTransformComp?.exists()) {
        const url = outTransformComp.property('url').value() as string;
        if (typeof url === 'string') nodeInfo.properties.ocioOutTransformUrl = url;
      }

      const configComp = obj.component('config');
      if (configComp?.exists()) {
        const description = configComp.property('description').value() as string;
        const workingDir = configComp.property('workingDir').value() as string;

        if (typeof description === 'string') nodeInfo.properties.ocioConfigDescription = description;
        if (typeof workingDir === 'string') nodeInfo.properties.ocioWorkingDir = workingDir;
      }
    }

    // Parse RVICCTransform properties
    if (protocol === 'RVICCTransform' || protocol === 'RVICCLinearizeTransform' || protocol === 'RVICCDisplayTransform') {
      const nodeComp = obj.component('node');
      if (nodeComp?.exists()) {
        const active = nodeComp.property('active').value() as number;
        const samples2D = nodeComp.property('samples2D').value() as number;
        const samples3D = nodeComp.property('samples3D').value() as number;

        if (typeof active === 'number') nodeInfo.properties.iccActive = active !== 0;
        if (typeof samples2D === 'number') nodeInfo.properties.iccSamples2D = samples2D;
        if (typeof samples3D === 'number') nodeInfo.properties.iccSamples3D = samples3D;
      }

      const inProfileComp = obj.component('inProfile');
      if (inProfileComp?.exists()) {
        const url = inProfileComp.property('url').value() as string;
        const description = inProfileComp.property('description').value() as string;

        if (typeof url === 'string') nodeInfo.properties.iccInProfileUrl = url;
        if (typeof description === 'string') nodeInfo.properties.iccInProfileDescription = description;
      }

      const outProfileComp = obj.component('outProfile');
      if (outProfileComp?.exists()) {
        const url = outProfileComp.property('url').value() as string;
        const description = outProfileComp.property('description').value() as string;

        if (typeof url === 'string') nodeInfo.properties.iccOutProfileUrl = url;
        if (typeof description === 'string') nodeInfo.properties.iccOutProfileDescription = description;
      }
    }

    // Parse RVColorExposure properties
    if (protocol === 'RVColorExposure') {
      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const active = colorComp.property('active').value() as number;
        const exposure = colorComp.property('exposure').value() as number;

        if (typeof active === 'number') nodeInfo.properties.colorExposureActive = active !== 0;
        if (typeof exposure === 'number') nodeInfo.properties.colorExposure = exposure;
      }
    }

    // Parse RVColorCurve properties
    if (protocol === 'RVColorCurve') {
      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const active = colorComp.property('active').value() as number;
        const contrast = colorComp.property('contrast').value() as number;

        if (typeof active === 'number') nodeInfo.properties.colorCurveActive = active !== 0;
        if (typeof contrast === 'number') nodeInfo.properties.colorContrast = contrast;
      }
    }

    // Parse RVColorTemperature properties
    if (protocol === 'RVColorTemperature') {
      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const active = colorComp.property('active').value() as number;
        const inWhitePrimary = colorComp.property('inWhitePrimary').value() as number[];
        const inTemperature = colorComp.property('inTemperature').value() as number;
        const outTemperature = colorComp.property('outTemperature').value() as number;
        const method = colorComp.property('method').value() as number;

        if (typeof active === 'number') nodeInfo.properties.colorTemperatureActive = active !== 0;
        if (Array.isArray(inWhitePrimary)) nodeInfo.properties.colorInWhitePrimary = inWhitePrimary;
        if (typeof inTemperature === 'number') nodeInfo.properties.colorInTemperature = inTemperature;
        if (typeof outTemperature === 'number') nodeInfo.properties.colorOutTemperature = outTemperature;
        if (typeof method === 'number') nodeInfo.properties.colorTemperatureMethod = method;
      }
    }

    // Parse RVColorSaturation properties
    if (protocol === 'RVColorSaturation') {
      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const active = colorComp.property('active').value() as number;
        const saturation = colorComp.property('saturation').value() as number;

        if (typeof active === 'number') nodeInfo.properties.colorSaturationActive = active !== 0;
        if (typeof saturation === 'number') nodeInfo.properties.colorSaturation = saturation;
      }
    }

    // Parse RVColorVibrance properties
    if (protocol === 'RVColorVibrance') {
      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const active = colorComp.property('active').value() as number;
        const vibrance = colorComp.property('vibrance').value() as number;

        if (typeof active === 'number') nodeInfo.properties.colorVibranceActive = active !== 0;
        if (typeof vibrance === 'number') nodeInfo.properties.colorVibrance = vibrance;
      }
    }

    // Parse RVColorShadow properties
    if (protocol === 'RVColorShadow') {
      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const active = colorComp.property('active').value() as number;
        const shadow = colorComp.property('shadow').value() as number;

        if (typeof active === 'number') nodeInfo.properties.colorShadowActive = active !== 0;
        if (typeof shadow === 'number') nodeInfo.properties.colorShadow = shadow;
      }
    }

    // Parse RVColorHighlight properties
    if (protocol === 'RVColorHighlight') {
      const colorComp = obj.component('color');
      if (colorComp?.exists()) {
        const active = colorComp.property('active').value() as number;
        const highlight = colorComp.property('highlight').value() as number;

        if (typeof active === 'number') nodeInfo.properties.colorHighlightActive = active !== 0;
        if (typeof highlight === 'number') nodeInfo.properties.colorHighlight = highlight;
      }
    }

    // Parse RVColorGrayScale properties
    if (protocol === 'RVColorGrayScale') {
      const nodeComp = obj.component('node');
      if (nodeComp?.exists()) {
        const active = nodeComp.property('active').value() as number;
        if (typeof active === 'number') nodeInfo.properties.colorGrayScaleActive = active !== 0;
      }
    }

    // Parse RVColorCDL properties
    if (protocol === 'RVColorCDL' || protocol === 'RVColorACESLogCDL') {
      const nodeComp = obj.component('node');
      if (nodeComp?.exists()) {
        const active = nodeComp.property('active').value() as number;
        const file = nodeComp.property('file').value() as string;
        const colorspace = nodeComp.property('colorspace').value() as string;
        const slope = nodeComp.property('slope').value() as number[];
        const offset = nodeComp.property('offset').value() as number[];
        const power = nodeComp.property('power').value() as number[];
        const saturation = nodeComp.property('saturation').value() as number;
        const noClamp = nodeComp.property('noClamp').value() as number;

        if (typeof active === 'number') nodeInfo.properties.cdlActive = active !== 0;
        if (typeof file === 'string') nodeInfo.properties.cdlFile = file;
        if (typeof colorspace === 'string') nodeInfo.properties.cdlColorspace = colorspace;
        if (Array.isArray(slope)) nodeInfo.properties.cdlSlope = slope;
        if (Array.isArray(offset)) nodeInfo.properties.cdlOffset = offset;
        if (Array.isArray(power)) nodeInfo.properties.cdlPower = power;
        if (typeof saturation === 'number') nodeInfo.properties.cdlSaturation = saturation;
        if (typeof noClamp === 'number') nodeInfo.properties.cdlNoClamp = noClamp !== 0;
      }
    }

    // Parse RVColorLinearToSRGB properties
    if (protocol === 'RVColorLinearToSRGB') {
      const nodeComp = obj.component('node');
      if (nodeComp?.exists()) {
        const active = nodeComp.property('active').value() as number;
        if (typeof active === 'number') nodeInfo.properties.linearToSRGBActive = active !== 0;
      }
    }

    // Parse RVColorSRGBToLinear properties
    if (protocol === 'RVColorSRGBToLinear') {
      const nodeComp = obj.component('node');
      if (nodeComp?.exists()) {
        const active = nodeComp.property('active').value() as number;
        if (typeof active === 'number') nodeInfo.properties.srgbToLinearActive = active !== 0;
      }
    }

    nodeInfos.set(name, nodeInfo);
  }

  // Create nodes
  for (const [name, info] of nodeInfos) {
    const nodeType = PROTOCOL_TO_NODE_TYPE[info.protocol];
    if (!nodeType) {
      // Unknown protocol - skip silently (many RV internals aren't needed)
      continue;
    }

    if (!NodeFactory.isRegistered(nodeType)) {
      // Node type mapped but not implemented yet - skip silently
      continue;
    }

    const node = NodeFactory.create(nodeType);
    if (!node) {
      console.warn(`Failed to create node: ${nodeType}`);
      continue;
    }

    // Set node name
    node.name = (info.properties.ui_name as string) ?? name;

    // Set node properties
    for (const [key, value] of Object.entries(info.properties)) {
      if (key !== 'ui_name' && node.properties.has(key)) {
        node.properties.setValue(key, value);
      }
    }

    nodes.set(name, node);
    graph.addNode(node);
  }

  // Establish connections
  for (const [name, info] of nodeInfos) {
    const node = nodes.get(name);
    if (!node) continue;

    for (const inputName of info.inputs) {
      const inputNode = nodes.get(inputName);
      if (inputNode) {
        try {
          graph.connect(inputNode, node);
        } catch (err) {
          console.warn(`Failed to connect ${inputName} -> ${name}:`, err);
        }
      }
    }
  }

  // Find root/view node
  if (sessionInfo.viewNode) {
    rootNode = nodes.get(sessionInfo.viewNode) ?? null;
  }

  // If no view node specified, find the node with no outputs (leaf node)
  if (!rootNode) {
    for (const node of nodes.values()) {
      if (node.outputs.length === 0) {
        rootNode = node;
        break;
      }
    }
  }

  if (rootNode) {
    graph.setOutputNode(rootNode);
  }

  return {
    graph,
    nodes,
    rootNode,
    sessionInfo,
  };
}

/**
 * Get a summary of the parsed graph for debugging
 */
export function getGraphSummary(result: GTOParseResult): string {
  const lines: string[] = [];
  lines.push(`Session: ${result.sessionInfo.name}`);
  lines.push(`Nodes: ${result.nodes.size}`);
  lines.push(`Root: ${result.rootNode?.name ?? 'none'}`);
  lines.push('');
  lines.push('Nodes:');

  for (const [name, node] of result.nodes) {
    const inputs = node.inputs.map((i) => i.name).join(', ') || 'none';
    lines.push(`  ${name} (${node.type}) <- [${inputs}]`);
  }

  return lines.join('\n');
}
