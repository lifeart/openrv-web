/**
 * Module definitions for AI documentation generation.
 *
 * Each module maps to a template type, source files, output path, and category.
 * These correspond to the 30 tasks in section 5.3 of the doc generation plan.
 */

import type { TemplateType } from './lib/templates.js';

export interface ModuleConfig {
  /** Unique module key used for caching and CLI --module flag. */
  key: string;
  /** Human-readable module name. */
  name: string;
  /** Template type to use for generation. */
  template: TemplateType;
  /** Source file paths relative to repo root. */
  sourceFiles: string[];
  /** Output category directory (under docs/generated/). */
  category: string;
  /** Output filename (without .md extension). */
  outputName: string;
  /** Use Opus model instead of Sonnet. */
  useOpus?: boolean;
}

export const MODULE_CONFIGS: ModuleConfig[] = [
  // === 5.3.1: Core -- IPImage ===
  {
    key: 'core-ip-image',
    name: 'IPImage',
    template: 'user-guide',
    sourceFiles: ['src/core/image/Image.ts', 'src/core/image/ManagedVideoFrame.ts'],
    category: 'core',
    outputName: 'ip-image',
  },

  // === 5.3.2: Core -- Session System ===
  {
    key: 'core-session-system',
    name: 'Session System',
    template: 'architecture',
    sourceFiles: [
      'src/core/session/Session.ts',
      'src/core/session/SessionGraph.ts',
      'src/core/session/SessionMedia.ts',
      'src/core/session/SessionPlayback.ts',
      'src/core/session/SessionManager.ts',
    ],
    category: 'core',
    outputName: 'session-system',
    useOpus: true,
  },

  // === 5.3.3: Render -- Renderer Pipeline ===
  {
    key: 'render-renderer-pipeline',
    name: 'Renderer Pipeline',
    template: 'architecture',
    sourceFiles: [
      'src/render/Renderer.ts',
      'src/render/ShaderStateManager.ts',
      'src/render/RenderState.ts',
      'src/render/shaders/viewer.frag.glsl',
      'src/render/shaders/viewer.vert.glsl',
    ],
    category: 'render',
    outputName: 'renderer-pipeline',
    useOpus: true,
  },

  // === 5.3.4: Render -- Shader System ===
  {
    key: 'render-shader-system',
    name: 'Shader System',
    template: 'user-guide',
    sourceFiles: [
      'src/render/ShaderProgram.ts',
      'src/render/ShaderPipeline.ts',
      'src/render/ShaderStage.ts',
      'src/render/shaders/viewer.frag.glsl',
    ],
    category: 'render',
    outputName: 'shader-system',
  },

  // === 5.3.5: Color -- CDL ===
  {
    key: 'color-cdl',
    name: 'CDL (Color Decision List)',
    template: 'api-reference',
    sourceFiles: ['src/color/CDL.ts', 'src/color/CDLNode.ts', 'src/api/ColorAPI.ts'],
    category: 'color',
    outputName: 'cdl',
  },

  // === 5.3.6: Color -- LUT System ===
  {
    key: 'color-lut-system',
    name: 'LUT System',
    template: 'user-guide',
    sourceFiles: [
      'src/color/LUTLoader.ts',
      'src/color/LUTFormats.ts',
      'src/color/LUTFormatDetect.ts',
      'src/color/LUTPrecision.ts',
      'src/color/LUTPresets.ts',
      'src/color/LUTUtils.ts',
      'src/color/WebGLLUT.ts',
      'src/color/TetrahedralInterp.ts',
    ],
    category: 'color',
    outputName: 'lut-system',
  },

  // === 5.3.7: Color -- OCIO Integration ===
  {
    key: 'color-ocio-integration',
    name: 'OCIO Integration',
    template: 'architecture',
    sourceFiles: [
      'src/color/OCIOConfig.ts',
      'src/color/OCIOConfigParser.ts',
      'src/color/OCIOProcessor.ts',
      'src/color/OCIOTransform.ts',
      'src/color/OCIOPresets.ts',
    ],
    category: 'color',
    outputName: 'ocio-integration',
    useOpus: true,
  },

  // === 5.3.8: Color -- Curves and Color Wheels ===
  {
    key: 'color-curves-and-wheels',
    name: 'Curves and Color Wheels',
    template: 'user-guide',
    sourceFiles: ['src/color/ColorCurves.ts', 'src/color/HueRotation.ts', 'src/color/ColorWheelsNode.ts'],
    category: 'color',
    outputName: 'curves-and-wheels',
  },

  // === 5.3.9: Color -- Display Pipeline ===
  {
    key: 'color-display-pipeline',
    name: 'Display Pipeline',
    template: 'user-guide',
    sourceFiles: [
      'src/color/DisplayCapabilities.ts',
      'src/color/DisplayTransfer.ts',
      'src/color/TransferFunctions.ts',
      'src/color/BrowserColorSpace.ts',
      'src/color/LogCurves.ts',
      'src/color/AutoExposureController.ts',
    ],
    category: 'color',
    outputName: 'display-pipeline',
  },

  // === 5.3.10: Format -- EXR ===
  {
    key: 'format-exr',
    name: 'EXR Decoder',
    template: 'user-guide',
    sourceFiles: ['src/formats/EXRDecoder.ts', 'src/formats/MultiViewEXR.ts'],
    category: 'formats',
    outputName: 'exr',
  },

  // === 5.3.11: Format -- DPX/Cineon ===
  {
    key: 'format-dpx-cineon',
    name: 'DPX and Cineon Decoders',
    template: 'user-guide',
    sourceFiles: ['src/formats/DPXDecoder.ts', 'src/formats/CineonDecoder.ts'],
    category: 'formats',
    outputName: 'dpx-cineon',
  },

  // === 5.3.12: Format -- HDR/JXL/JP2 ===
  {
    key: 'format-hdr-jxl-jp2',
    name: 'HDR, JXL, and JP2 Decoders',
    template: 'user-guide',
    sourceFiles: ['src/formats/HDRDecoder.ts', 'src/formats/JXLDecoder.ts', 'src/formats/JP2Decoder.ts'],
    category: 'formats',
    outputName: 'hdr-jxl-jp2',
  },

  // === 5.3.13: Format -- Gainmap ===
  {
    key: 'format-gainmap',
    name: 'Gainmap Decoders',
    template: 'user-guide',
    sourceFiles: [
      'src/formats/JPEGGainmapDecoder.ts',
      'src/formats/HEICGainmapDecoder.ts',
      'src/formats/AVIFGainmapDecoder.ts',
    ],
    category: 'formats',
    outputName: 'gainmap',
  },

  // === 5.3.14: Format -- TIFF/AVIF/HEIC/MXF/RAW ===
  {
    key: 'format-misc',
    name: 'TIFF, AVIF, HEIC, MXF, and RAW Decoders',
    template: 'user-guide',
    sourceFiles: [
      'src/formats/TIFFDecoder.ts',
      'src/formats/AVIFDecoder.ts',
      'src/formats/HEICDecoder.ts',
      'src/formats/MXFDecoder.ts',
      'src/formats/RAWDecoder.ts',
    ],
    category: 'formats',
    outputName: 'tiff-avif-heic-mxf-raw',
  },

  // === 5.3.15: Format -- DecoderRegistry ===
  {
    key: 'format-decoder-registry',
    name: 'Decoder Registry',
    template: 'api-reference',
    sourceFiles: ['src/formats/index.ts'],
    category: 'formats',
    outputName: 'decoder-registry',
  },

  // === 5.3.16: Node -- Source Nodes ===
  {
    key: 'node-source-nodes',
    name: 'Source Nodes',
    template: 'user-guide',
    sourceFiles: ['src/nodes/FileSourceNode.ts', 'src/nodes/VideoSourceNode.ts'],
    category: 'nodes',
    outputName: 'source-nodes',
  },

  // === 5.3.17: Node -- Group Nodes ===
  {
    key: 'node-group-nodes',
    name: 'Group Nodes',
    template: 'user-guide',
    sourceFiles: [
      'src/nodes/SequenceGroupNode.ts',
      'src/nodes/StackGroupNode.ts',
      'src/nodes/LayoutGroupNode.ts',
      'src/nodes/SwitchGroupNode.ts',
      'src/nodes/FolderGroupNode.ts',
      'src/nodes/RetimeGroupNode.ts',
    ],
    category: 'nodes',
    outputName: 'group-nodes',
  },

  // === 5.3.18: Node -- Effect Nodes ===
  {
    key: 'node-effect-nodes',
    name: 'Effect Nodes',
    template: 'user-guide',
    sourceFiles: [
      'src/nodes/AnnotationNode.ts',
      'src/nodes/CropNode.ts',
      'src/nodes/FlipNode.ts',
      'src/nodes/FlopNode.ts',
      'src/nodes/RotateNode.ts',
      'src/nodes/ResizeNode.ts',
      'src/nodes/TextNode.ts',
      'src/nodes/WatermarkNode.ts',
      'src/nodes/TransformNode.ts',
      'src/nodes/ChannelMapNode.ts',
      'src/nodes/PremultNode.ts',
      'src/nodes/UnpremultNode.ts',
      'src/nodes/GrainNode.ts',
    ],
    category: 'nodes',
    outputName: 'effect-nodes',
  },

  // === 5.3.19: Node -- Infrastructure ===
  {
    key: 'node-infrastructure',
    name: 'Node Infrastructure',
    template: 'user-guide',
    sourceFiles: ['src/nodes/IPNode.ts', 'src/nodes/NodeFactory.ts'],
    category: 'nodes',
    outputName: 'node-infrastructure',
  },

  // === 5.3.20: API -- PlaybackAPI ===
  {
    key: 'api-playback',
    name: 'PlaybackAPI',
    template: 'api-reference',
    sourceFiles: ['src/api/PlaybackAPI.ts', 'src/api/types.ts'],
    category: 'api',
    outputName: 'playback-api',
  },

  // === 5.3.21: API -- MediaAPI ===
  {
    key: 'api-media',
    name: 'MediaAPI',
    template: 'api-reference',
    sourceFiles: ['src/api/MediaAPI.ts', 'src/api/types.ts'],
    category: 'api',
    outputName: 'media-api',
  },

  // === 5.3.22: API -- AudioAPI ===
  {
    key: 'api-audio',
    name: 'AudioAPI',
    template: 'api-reference',
    sourceFiles: ['src/api/AudioAPI.ts', 'src/api/types.ts'],
    category: 'api',
    outputName: 'audio-api',
  },

  // === 5.3.23: API -- ViewAPI ===
  {
    key: 'api-view',
    name: 'ViewAPI',
    template: 'api-reference',
    sourceFiles: ['src/api/ViewAPI.ts', 'src/api/types.ts'],
    category: 'api',
    outputName: 'view-api',
  },

  // === 5.3.24: API -- ColorAPI ===
  {
    key: 'api-color',
    name: 'ColorAPI',
    template: 'api-reference',
    sourceFiles: ['src/api/ColorAPI.ts', 'src/api/types.ts'],
    category: 'api',
    outputName: 'color-api',
  },

  // === 5.3.25: API -- MarkersAPI ===
  {
    key: 'api-markers',
    name: 'MarkersAPI',
    template: 'api-reference',
    sourceFiles: ['src/api/MarkersAPI.ts', 'src/api/types.ts'],
    category: 'api',
    outputName: 'markers-api',
  },

  // === 5.3.26: API -- EventsAPI ===
  {
    key: 'api-events',
    name: 'EventsAPI',
    template: 'api-reference',
    sourceFiles: ['src/api/EventsAPI.ts', 'src/api/types.ts'],
    category: 'api',
    outputName: 'events-api',
  },

  // === 5.3.27: API -- LoopAPI ===
  {
    key: 'api-loop',
    name: 'LoopAPI',
    template: 'api-reference',
    sourceFiles: ['src/api/LoopAPI.ts', 'src/api/types.ts'],
    category: 'api',
    outputName: 'loop-api',
  },

  // === 5.3.28: API -- OpenRVAPI ===
  {
    key: 'api-openrv',
    name: 'OpenRVAPI',
    template: 'api-reference',
    sourceFiles: ['src/api/OpenRVAPI.ts', 'src/api/types.ts'],
    category: 'api',
    outputName: 'openrv-api',
  },

  // === 5.3.29: Plugins -- Plugin System (architecture) ===
  {
    key: 'plugin-system',
    name: 'Plugin System',
    template: 'architecture',
    sourceFiles: ['src/plugins/types.ts', 'src/plugins/PluginRegistry.ts', 'src/plugins/ExporterRegistry.ts'],
    category: 'plugins',
    outputName: 'plugin-system',
    useOpus: true,
  },

  // === 5.3.29b: Plugins -- Create Plugin Tutorial ===
  {
    key: 'plugin-tutorial',
    name: 'Creating a Plugin',
    template: 'tutorial',
    sourceFiles: ['src/plugins/types.ts', 'src/plugins/PluginRegistry.ts', 'src/plugins/ExporterRegistry.ts'],
    category: 'plugins',
    outputName: 'tutorial-create-plugin',
  },

  // === 5.3.30: Render -- Additional Components ===
  {
    key: 'render-components',
    name: 'Render Components',
    template: 'user-guide',
    sourceFiles: [
      'src/render/CompositingRenderer.ts',
      'src/render/TransitionRenderer.ts',
      'src/render/TextureCacheManager.ts',
      'src/render/LuminanceAnalyzer.ts',
      'src/render/SphericalProjection.ts',
      'src/render/FBOPingPong.ts',
      'src/render/WebGPUBackend.ts',
    ],
    category: 'render',
    outputName: 'render-components',
  },
];

/**
 * Get a module config by its key.
 */
export function getModuleConfig(key: string): ModuleConfig | undefined {
  return MODULE_CONFIGS.find((m) => m.key === key);
}

/**
 * Get all module configs.
 */
export function getAllModuleConfigs(): ModuleConfig[] {
  return MODULE_CONFIGS;
}

/**
 * List all module keys.
 */
export function listModuleKeys(): string[] {
  return MODULE_CONFIGS.map((m) => m.key);
}
