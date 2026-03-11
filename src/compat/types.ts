/**
 * Mu API Compatibility Layer — Type Definitions
 *
 * These types mirror the Mu language's type system for the RV commands module,
 * adapted to JavaScript/TypeScript equivalents.
 */

/** Settings value — matches Mu's SettingsValue union */
export type SettingsValue = number | string | boolean | number[] | string[];

/** Event binding callback */
export type MuEventCallback = (event: MuEvent) => void;

/** Mu-compatible event object wrapping DOM events */
export interface MuEvent {
  /** Event name (e.g. 'key-down--a', 'pointer--move') */
  name: string;
  /** Sender (mode or component name) */
  sender: string;
  /** Contents / payload string */
  contents: string;
  /** Return contents (for reject/accept signaling) */
  returnContents: string;
  /** Whether the event was rejected by a handler */
  reject: boolean;
  /** Underlying DOM event, if any */
  domEvent?: Event;
  /** Pointer position in view coordinates */
  pointer?: { x: number; y: number };
  /** Pointer position in relative coordinates */
  relativePointer?: { x: number; y: number };
  /** Key name if keyboard event */
  key?: string;
  /** Button index if pointer event */
  button?: number;
  /** Modifier state */
  modifiers?: {
    shift: boolean;
    control: boolean;
    alt: boolean;
    meta: boolean;
  };
  /** Optional tag for BBox-scoped hit-testing */
  tag?: string;
}

/** Event table entry: maps event name pattern to a callback + documentation */
export interface EventTableBinding {
  eventName: string;
  callback: MuEventCallback;
  documentation: string;
  /** For regex bindings: the compiled pattern used for matching */
  regex?: RegExp;
}

/** Event table: named collection of bindings */
export interface EventTable {
  name: string;
  bindings: Map<string, EventTableBinding>;
  /** Count of regex bindings in this table (for fast skip in dispatch) */
  regexCount: number;
}

/** Minor mode definition */
export interface MinorModeDefinition {
  name: string;
  /** Ordering priority (lower = earlier evaluation) */
  order: number;
  /** Global event table (always active when mode is active) */
  globalBindings: EventTable;
  /** Overrides table (checked first) */
  overrideBindings: EventTable;
  /** Icon name or path */
  icon?: string;
  /** Menu definition (N/A in web but stored) */
  menu?: unknown;
  /** Activation callback */
  activate?: () => void;
  /** Deactivation callback */
  deactivate?: () => void;
}

/** Support status for a command */
export type CommandSupportStatus = true | false | 'partial';

/** Named timer entry */
export interface NamedTimer {
  id: ReturnType<typeof setTimeout>;
  name: string;
  type: 'timeout' | 'interval';
  startTime: number;
}

/** HTTP request options */
export interface MuHttpOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

/** HTTP response */
export interface MuHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  data?: Uint8Array;
}

/** Remote connection info */
export interface RemoteConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  connected: boolean;
  /** Peer's contact name received via handshake */
  peerContactName?: string;
  /** Peer's permission level received via handshake */
  peerPermission?: number;
}

/** File kind constants (matching Mu's enum) */
export const FileKind = {
  UnknownFile: 0,
  ImageFile: 1,
  MovieFile: 2,
  AudioFile: 3,
  CDLFile: 4,
  LUTFile: 5,
  RVFile: 6,
  DirectoryFile: 7,
  ProfileFile: 8,
} as const;

export type FileKindValue = (typeof FileKind)[keyof typeof FileKind];

/** Property type constants matching Mu's type system. */
export const MuPropertyType = {
  Float: 0,
  Int: 1,
  String: 2,
  Byte: 3,
  Half: 4,
} as const;

export type MuPropertyTypeValue = (typeof MuPropertyType)[keyof typeof MuPropertyType];

/** Mapping from property type constant to type name string. */
export const MuPropertyTypeNames: Record<number, string> = {
  [MuPropertyType.Float]: 'float',
  [MuPropertyType.Int]: 'int',
  [MuPropertyType.String]: 'string',
  [MuPropertyType.Byte]: 'byte',
  [MuPropertyType.Half]: 'half',
};

/** Mapping from type name string to property type constant. */
export const MuPropertyTypeByName: Record<string, number> = {
  float: MuPropertyType.Float,
  int: MuPropertyType.Int,
  string: MuPropertyType.String,
  byte: MuPropertyType.Byte,
  half: MuPropertyType.Half,
};

/** Metadata about a property, returned by `propertyInfo()`. */
export interface MuPropertyInfo {
  /** Full property path (e.g. "sourceGroup000000_source.media.movie") */
  name: string;
  /** Property type name: "float", "int", "string", "byte", "half" */
  type: string;
  /** Property dimensions (1D = [size], 2D = [rows, cols], etc.) */
  dimensions: number[];
  /** Total number of elements */
  size: number;
  /** Whether this property was created by user code (vs. built-in) */
  userDefined: boolean;
  /** Human-readable description */
  info: string;
}

/** Node image geometry, returned by `nodeImageGeometry()`. */
export interface NodeImageGeometry {
  width: number;
  height: number;
  pixelAspect: number;
  orientation: string;
}

// --- Phase 6: Graph Evaluation & Image Query types ---

/**
 * Meta-evaluation info returned by metaEvaluate / metaEvaluateClosestByType.
 * Describes a node encountered during graph traversal.
 */
export interface MetaEvalInfo {
  /** Node name */
  node: string;
  /** Node type (e.g. "RVSource", "RVColor") */
  nodeType: string;
  /** Frame number at which this node was evaluated */
  frame: number;
}

/**
 * Pixel-level image hit-test result returned by imagesAtPixel.
 */
export interface PixelImageInfo {
  /** Image/source name */
  name: string;
  /** Integer X coordinate in image space */
  x: number;
  /** Integer Y coordinate in image space */
  y: number;
  /** Precise X coordinate in image space (sub-pixel) */
  px: number;
  /** Precise Y coordinate in image space (sub-pixel) */
  py: number;
  /** Whether the point is inside the image bounds */
  inside: boolean;
  /** Whether the point is on the edge of the image */
  edge: boolean;
  /** 4x4 model matrix (column-major, 16 elements) */
  modelMatrix: number[];
}

/**
 * Info about a currently rendered image, returned by renderedImages().
 */
export interface RenderedImageInfo {
  /** Image/source name */
  name: string;
  /** Render index (order in the compositing stack) */
  index: number;
  /** Image bounds minimum in view space [x, y] */
  imageMin: [number, number];
  /** Image bounds maximum in view space [x, y] */
  imageMax: [number, number];
  /** Native image width in pixels */
  width: number;
  /** Native image height in pixels */
  height: number;
  /** Node name that produced this image */
  nodeName: string;
  /** Optional metadata tag identifying a view variant (e.g. "main", "thumbnail") */
  tag?: string;
}

// --- Phase 4: Source Management types ---

/**
 * Source media info returned by sourceMediaInfo().
 * Mirrors Mu's SourceMediaInfo struct with web-relevant fields.
 */
export interface SourceMediaInfo {
  /** Source node name */
  name: string;
  /** Primary media file path / URL */
  file: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Frames per second */
  fps: number;
  /** Duration in frames */
  duration: number;
  /** First frame number */
  startFrame: number;
  /** Last frame number */
  endFrame: number;
  /** Pixel aspect ratio */
  pixelAspect: number;
  /** Channel names (e.g. ["R", "G", "B", "A"]) */
  channelNames: string[];
  /** Number of channels */
  numChannels: number;
}

/**
 * Media representation info returned by sourceMediaReps-related commands.
 */
export interface MediaRepInfo {
  /** Representation name (e.g. "full", "proxy", "editorial") */
  name: string;
  /** Associated node name */
  nodeName: string;
  /** Media paths for this representation */
  mediaPaths: string[];
}

/** Cursor constants (matching Mu's enum, mapped to CSS cursor names) */
export const MuCursor: Record<number, string> = {
  0: 'default',
  1: 'crosshair',
  2: 'pointer',
  3: 'wait',
  4: 'text',
  5: 'move',
  6: 'not-allowed',
  7: 'help',
  8: 'grab',
  9: 'grabbing',
  10: 'col-resize',
  11: 'row-resize',
  12: 'zoom-in',
  13: 'zoom-out',
  14: 'none',
};
