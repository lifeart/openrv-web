/**
 * GTOGraphLoader - Reconstructs node graph from GTO/RV session files
 *
 * Parses RV session files using gto-js and creates the corresponding
 * node graph structure with proper connections.
 */

import { SimpleReader, GTODTO } from 'gto-js';
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
  };
}

/**
 * Maps RV node protocols to our registered node types
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

  // View nodes
  RVDisplayColor: 'RVDisplayColor',
  RVDisplayStereo: 'RVDisplayStereo',
};

/**
 * Load and parse a GTO file into a node graph
 */
export async function loadGTOGraph(data: ArrayBuffer | string): Promise<GTOParseResult> {
  const reader = new SimpleReader();

  // Parse the GTO data
  if (typeof data === 'string') {
    reader.open(data);
  } else {
    const bytes = new Uint8Array(data);
    // Check for text format GTO (starts with "GTOa")
    const isTextFormat =
      bytes[0] === 0x47 && // 'G'
      bytes[1] === 0x54 && // 'T'
      bytes[2] === 0x4f && // 'O'
      bytes[3] === 0x61; // 'a'

    if (isTextFormat) {
      const textContent = new TextDecoder('utf-8').decode(bytes);
      reader.open(textContent);
    } else {
      reader.open(bytes);
    }
  }

  const dto = new GTODTO(reader.result);
  return parseGTOToGraph(dto);
}

/**
 * Parse GTODTO into a Graph
 */
function parseGTOToGraph(dto: GTODTO): GTOParseResult {
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
      if (typeof frame === 'number') {
        sessionInfo.frame = frame;
      }

      const fps = sessionComp.property('fps').value() as number;
      if (typeof fps === 'number') {
        sessionInfo.fps = fps;
      }

      const realtime = sessionComp.property('realtime').value() as number;
      if (typeof realtime === 'number') {
        sessionInfo.fps = realtime;
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
        }
      }

      const proxyComp = obj.component('proxy');
      if (proxyComp?.exists()) {
        const size = proxyComp.property('size').value() as number[];
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

        if (typeof rotate === 'number') nodeInfo.properties.rotate = rotate;
        if (typeof flip === 'boolean') nodeInfo.properties.flip = flip;
        if (typeof flop === 'boolean') nodeInfo.properties.flop = flop;
        if (Array.isArray(scale)) nodeInfo.properties.scale = scale;
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
      console.log(`No mapping for protocol: ${info.protocol} (${name})`);
      continue;
    }

    if (!NodeFactory.isRegistered(nodeType)) {
      console.log(`Node type not registered: ${nodeType} (${name})`);
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
