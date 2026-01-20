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

  // Effect nodes (not yet implemented - will be skipped)
  RVColor: 'RVColor',
  RVTransform2D: 'RVTransform2D',
  RVLensWarp: 'RVLensWarp',
  RVCDL: 'RVCDL',
  RVLinearize: 'RVLinearize',

  // View nodes (not yet implemented - will be skipped)
  RVDisplayColor: 'RVDisplayColor',
  RVDisplayStereo: 'RVDisplayStereo',
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
        const exposure = colorComp.property('exposure').value() as number;
        const gamma = colorComp.property('gamma').value() as number;
        const saturation = colorComp.property('saturation').value() as number;
        const offset = colorComp.property('offset').value() as number;
        const contrast = colorComp.property('contrast').value() as number;

        if (typeof exposure === 'number') nodeInfo.properties.exposure = exposure;
        if (typeof gamma === 'number') nodeInfo.properties.gamma = gamma;
        if (typeof saturation === 'number') nodeInfo.properties.saturation = saturation;
        if (typeof offset === 'number') nodeInfo.properties.offset = offset;
        if (typeof contrast === 'number') nodeInfo.properties.contrast = contrast;
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
      const warpComp = obj.component('warp');
      if (warpComp?.exists()) {
        const k1 = warpComp.property('k1').value() as number;
        const k2 = warpComp.property('k2').value() as number;
        const k3 = warpComp.property('k3').value() as number;

        if (typeof k1 === 'number') nodeInfo.properties.k1 = k1;
        if (typeof k2 === 'number') nodeInfo.properties.k2 = k2;
        if (typeof k3 === 'number') nodeInfo.properties.k3 = k3;
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
