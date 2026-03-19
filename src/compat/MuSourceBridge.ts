/**
 * MuSourceBridge — Source Management Bridge for Mu API Compatibility (Phase 4)
 *
 * Implements OpenRV's source management commands (~27 commands) including:
 *   - Source listing and queries (sources, sourcesAtFrame, sourceGeometry)
 *   - Source addition (addSource, addSources, addSourceVerbose, addSourceBegin/End)
 *   - Source media queries (sourceMedia, sourceMediaInfo, sourceMediaInfoList)
 *   - Source modification (setSourceMedia, addToSource, relocateSource)
 *   - Source attributes (sourceAttributes, sourceDataAttributes, sourcePixelValue)
 *   - Source display channels (sourceDisplayChannelNames)
 *
 * When an optional Graph is provided, media-representation helper nodes
 * (source + switch) are created as real graph nodes so that downstream
 * queries (e.g. MuNodeBridge.nodeExists) can resolve them.
 *   - Image sources (newImageSource, newImageSourcePixels, getCurrentImageSize)
 *   - Session clearing (clearSession)
 *   - Media representations (addSourceMediaRep, setActiveSourceMediaRep, etc.)
 *
 * Operates against the openrv-web public API (`window.openrv.media.*`) where
 * possible, and maintains local state for features not yet exposed.
 */

import type { SourceMediaInfo } from './types';
import { Graph } from '../core/graph/Graph';
import { IPNode } from '../nodes/base/IPNode';
import type { IPImage } from '../core/image/Image';
import type { EvalContext } from '../core/graph/Graph';

/**
 * Lightweight placeholder node used to materialise media-representation
 * node names inside the graph so they are queryable via `nodeExists()` etc.
 */
class MediaRepNode extends IPNode {
  activeInputIndex = 0;

  constructor(type: string, name: string) {
    super(type, name);
  }

  /** Set which input index is currently active (used by switch nodes). */
  setActiveInput(index: number): void {
    this.activeInputIndex = index;
  }

  process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    return inputs[this.activeInputIndex] ?? null;
  }
}

/**
 * Provider interface for reading pixel data from GPU-backed sources.
 *
 * Implementations should read the rendered pixel at the given source-space
 * coordinates and return [R, G, B, A] as float values, or `null` when
 * readback is unavailable (e.g. no active GL context).
 */
export interface PixelReadbackProvider {
  /**
   * Read a single pixel from the named source at (x, y).
   * Returns [R, G, B, A] floats, or null if readback is not possible.
   */
  readSourcePixel(sourceName: string, x: number, y: number): [number, number, number, number] | null;
}

/** Shape of the openrv public API that this bridge may consume. */
interface OpenRVMediaAPI {
  getCurrentSource(): {
    name: string;
    url: string;
    type: string;
    width: number;
    height: number;
    duration: number;
    fps: number;
  } | null;
  getResolution(): { width: number; height: number };
  hasMedia(): boolean;
  getFPS(): number;
  getSourceCount(): number;
  /** Load a media source from a URL (async, may not exist on older builds). */
  addSourceFromURL?(url: string): Promise<void>;
  /** Load a procedural source from a .movieproc URL string. */
  loadMovieProc?(url: string): void;
  /** Clear all loaded media sources. */
  clearSources?(): void;
}

interface OpenRVAPI {
  media: OpenRVMediaAPI;
}

/**
 * Lazily resolve the openrv API from the global scope.
 * Throws when the API is not yet initialised.
 */
function getOpenRV(): OpenRVAPI {
  const api = (globalThis as Record<string, unknown>).openrv;
  if (!api) {
    throw new Error('window.openrv is not available. Initialize OpenRVAPI first.');
  }
  return api as OpenRVAPI;
}

/**
 * Try to resolve the openrv API, returning null when unavailable.
 * Used by mutation methods that should degrade gracefully.
 */
function tryGetOpenRV(): OpenRVAPI | null {
  const api = (globalThis as Record<string, unknown>).openrv;
  return (api as OpenRVAPI) ?? null;
}

/** Internal source record tracked by the bridge */
interface SourceRecord {
  /** Unique source node name (e.g. "sourceGroup000000") */
  name: string;
  /** Tag/type hint (e.g. "default", "smptebars") */
  tag: string;
  /** Media file paths / URLs associated with this source */
  mediaPaths: string[];
  /** Source attributes (key-value metadata) */
  attributes: Map<string, string>;
  /** Binary data attributes (e.g. ICC profiles) */
  dataAttributes: Map<string, Uint8Array>;
  /** Channel names available in this source */
  channelNames: string[];
  /** Width (may be 0 until loaded) */
  width: number;
  /** Height (may be 0 until loaded) */
  height: number;
  /** Pixel aspect ratio */
  pixelAspect: number;
  /** Start frame for this source */
  startFrame: number;
  /** End frame for this source */
  endFrame: number;
  /** Media representations */
  representations: MediaRepRecord[];
  /** Active representation name */
  activeRep: string;
}

/** Internal media representation record */
interface MediaRepRecord {
  name: string;
  tag: string;
  mediaPaths: string[];
  /** Corresponding node name for this rep */
  nodeName: string;
  /** Switch node name for rep switching */
  switchNodeName: string;
}

/**
 * Pixel data store for in-memory image sources created via newImageSource.
 */
interface ImageSourcePixels {
  width: number;
  height: number;
  channels: number;
  data: Float32Array;
}

export class MuSourceBridge {
  /** All tracked sources, keyed by source node name */
  private _sources = new Map<string, SourceRecord>();

  /** Counter for auto-generated source names */
  private _sourceCounter = 0;

  /** Whether we are inside an addSourceBegin/End batch */
  private _batchMode = false;

  /** Queued additions during batch mode */
  private _batchQueue: Array<{ paths: string[]; tag: string; name?: string }> = [];

  /** In-memory image source pixel data */
  private _imageSources = new Map<string, ImageSourcePixels>();

  /** Optional graph for materialising media-rep nodes */
  private _graph: Graph | null = null;

  constructor(graph?: Graph) {
    this._graph = graph ?? null;
  }

  /** Get the underlying graph (if any). */
  get graph(): Graph | null {
    return this._graph;
  }

  /** Assign or replace the graph used for media-rep node creation. */
  setGraph(graph: Graph): void {
    this._graph = graph;
  }

  /** Optional GPU pixel readback provider for non-in-memory sources */
  private _pixelReadbackProvider: PixelReadbackProvider | null = null;

  // =====================================================================
  // Source Listing & Queries (commands 52, 67-68)
  // =====================================================================

  /**
   * Get all sources as tuples of [name, mediaPath, tag].
   * Equivalent to Mu's `commands.sources()`. (Mu #52)
   *
   * Returns array of { name, media, tag } objects.
   */
  sources(): Array<{ name: string; media: string; tag: string }> {
    const result: Array<{ name: string; media: string; tag: string }> = [];
    for (const [, src] of this._sources) {
      result.push({
        name: src.name,
        media: this._getActiveMediaPaths(src)[0] ?? '',
        tag: src.tag,
      });
    }
    // Also include the current openrv source if we have no local sources
    if (result.length === 0) {
      const current = this._ensureFallbackSourceRegistered();
      if (current) {
        result.push({
          name: current.name,
          media: current.url || '',
          tag: 'default',
        });
      }
    }
    return result;
  }

  /**
   * Get source names that are active at a given frame.
   * Equivalent to Mu's `commands.sourcesAtFrame(frame)`. (Mu #67)
   *
   * In the single-source web model, returns the current source
   * if the frame falls within its range.
   */
  sourcesAtFrame(frame: number): string[] {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new TypeError('sourcesAtFrame() requires a valid frame number');
    }
    const active: string[] = [];
    for (const [, src] of this._sources) {
      if (frame >= src.startFrame && frame <= src.endFrame) {
        active.push(src.name);
      }
    }
    // Fall back to openrv API
    if (active.length === 0) {
      const current = this._ensureFallbackSourceRegistered();
      if (current) {
        // Only include if the requested frame falls within the source's range
        const record = this._sources.get(current.name)!;
        if (frame >= record.startFrame && frame <= record.endFrame) {
          active.push(current.name);
        }
      }
    }
    return active;
  }

  /**
   * Get current image size as [width, height].
   * Equivalent to Mu's deprecated `commands.getCurrentImageSize()`. (Mu #68)
   */
  getCurrentImageSize(): [number, number] {
    try {
      const { width, height } = getOpenRV().media.getResolution();
      return [width, height];
    } catch {
      return [0, 0];
    }
  }

  // =====================================================================
  // Source Addition (commands 53-57)
  // =====================================================================

  /**
   * Add a source from one or more media paths.
   * Equivalent to Mu's `commands.addSource(paths, tag)`. (Mu #53)
   *
   * Returns a Promise since loading is async in the web context.
   */
  async addSource(paths: string[], tag: string = 'default'): Promise<void> {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new TypeError('addSource() requires a non-empty paths array');
    }
    if (this._batchMode) {
      this._batchQueue.push({ paths, tag });
      return;
    }
    this._createSourceRecord(paths, tag);
    await this._loadIntoSession(paths);
  }

  /**
   * Add multiple sources at once.
   * Equivalent to Mu's `commands.addSources(paths, tag, mergeIntoOne)`. (Mu #54)
   */
  async addSources(pathGroups: string[][], tag: string = 'default', _mergeIntoOne: boolean = false): Promise<void> {
    if (!Array.isArray(pathGroups)) {
      throw new TypeError('addSources() requires an array of path arrays');
    }
    for (const paths of pathGroups) {
      await this.addSource(paths, tag);
    }
  }

  /**
   * Add a source and return the created node name.
   * Equivalent to Mu's `commands.addSourceVerbose(paths, tag)`. (Mu #55)
   */
  async addSourceVerbose(paths: string[], tag: string = 'default'): Promise<string> {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new TypeError('addSourceVerbose() requires a non-empty paths array');
    }
    if (this._batchMode) {
      const name = this._generateSourceName();
      this._batchQueue.push({ paths, tag, name });
      return name;
    }
    const record = this._createSourceRecord(paths, tag);
    await this._loadIntoSession(paths);
    return record.name;
  }

  /**
   * Add multiple sources and return the created node names.
   * Equivalent to Mu's `commands.addSourcesVerbose(pathGroups, ...)`. (Mu #56)
   */
  async addSourcesVerbose(pathGroups: string[][], tag: string = 'default'): Promise<string[]> {
    const names: string[] = [];
    for (const paths of pathGroups) {
      const name = await this.addSourceVerbose(paths, tag);
      names.push(name);
    }
    return names;
  }

  /**
   * Begin a batch source addition.
   * Equivalent to Mu's `commands.addSourceBegin()`. (Mu #57)
   *
   * Sources added between addSourceBegin/addSourceEnd are queued
   * and committed together for efficiency.
   */
  addSourceBegin(): void {
    this._batchMode = true;
    this._batchQueue = [];
  }

  /**
   * End a batch source addition, committing all queued sources.
   * Equivalent to Mu's `commands.addSourceEnd()`. (Mu #57)
   */
  async addSourceEnd(): Promise<void> {
    this._batchMode = false;
    const queue = [...this._batchQueue];
    this._batchQueue = [];
    for (const { paths, tag, name } of queue) {
      this._createSourceRecord(paths, tag, name);
      await this._loadIntoSession(paths);
    }
  }

  // =====================================================================
  // Source Modification (commands 58-60)
  // =====================================================================

  /**
   * Add a media layer to an existing source.
   * Equivalent to Mu's `commands.addToSource(sourceName, mediaPath)`. (Mu #58)
   */
  addToSource(sourceName: string, mediaPath: string): void {
    const source = this._getSource(sourceName);
    source.mediaPaths.push(mediaPath);
    this._loadIntoSession([mediaPath]).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[MuSourceBridge] addToSource session propagation failed:', err);
    });
  }

  /**
   * Replace the media paths for a source.
   * Equivalent to Mu's `commands.setSourceMedia(sourceName, paths)`. (Mu #59)
   */
  setSourceMedia(sourceName: string, paths: string[]): void {
    if (!Array.isArray(paths)) {
      throw new TypeError('setSourceMedia() requires a string array');
    }
    const source = this._getSource(sourceName);
    source.mediaPaths = [...paths];
    this._loadIntoSession(paths).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[MuSourceBridge] setSourceMedia session propagation failed:', err);
    });
  }

  /**
   * Replace a single media path in a source (relocate).
   * Equivalent to Mu's `commands.relocateSource(sourceName, newPath)`. (Mu #60)
   */
  relocateSource(sourceName: string, newPath: string): void {
    if (typeof newPath !== 'string') {
      throw new TypeError('relocateSource() requires a string path');
    }
    const source = this._getSource(sourceName);
    if (source.mediaPaths.length > 0) {
      source.mediaPaths[0] = newPath;
    } else {
      source.mediaPaths.push(newPath);
    }
    this._loadIntoSession([newPath]).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[MuSourceBridge] relocateSource session propagation failed:', err);
    });
  }

  // =====================================================================
  // Source Media Queries (commands 61-62)
  // =====================================================================

  /**
   * Get the media paths from a source node.
   * Equivalent to Mu's `commands.sourceMedia(sourceName)`. (Mu #61)
   *
   * Returns { media: string[] } with the associated media paths.
   */
  sourceMedia(sourceName: string): { media: string[] } {
    const source = this._getSource(sourceName);
    return { media: [...this._getActiveMediaPaths(source)] };
  }

  /**
   * Get media info for a source.
   * Equivalent to Mu's `commands.sourceMediaInfo(sourceName, mediaName)`. (Mu #62)
   */
  sourceMediaInfo(sourceName: string, _mediaName?: string): SourceMediaInfo {
    const source = this._getSource(sourceName);

    // Try to enrich from openrv API
    let width = source.width;
    let height = source.height;
    let fps = 0;
    let duration = 0;

    try {
      const current = getOpenRV().media.getCurrentSource();
      if (current && current.name === sourceName) {
        width = current.width;
        height = current.height;
        fps = current.fps;
        duration = current.duration;
      }
    } catch {
      // openrv not available — use local state
    }

    const activePaths = this._getActiveMediaPaths(source);

    return {
      name: sourceName,
      file: activePaths[0] ?? '',
      width,
      height,
      fps,
      duration,
      startFrame: source.startFrame,
      endFrame: source.endFrame,
      pixelAspect: source.pixelAspect,
      channelNames: [...source.channelNames],
      numChannels: source.channelNames.length || 4,
    };
  }

  /**
   * Get media info for all sources.
   * Not a direct Mu command but useful for batch queries.
   */
  sourceMediaInfoList(): SourceMediaInfo[] {
    this._ensureFallbackSourceRegistered();
    return Array.from(this._sources.values()).map((src) => this.sourceMediaInfo(src.name));
  }

  // =====================================================================
  // Source Attributes (commands 63-66)
  // =====================================================================

  /**
   * Get source attributes (key-value metadata).
   * Equivalent to Mu's `commands.sourceAttributes(sourceName)`. (Mu #63)
   *
   * Returns array of [key, value] tuples.
   */
  sourceAttributes(sourceName: string): Array<[string, string]> {
    const source = this._getSource(sourceName);
    return Array.from(source.attributes.entries());
  }

  /**
   * Get binary data attributes for a source.
   * Equivalent to Mu's `commands.sourceDataAttributes(sourceName)`. (Mu #64)
   *
   * Returns array of [key, data] tuples.
   */
  sourceDataAttributes(sourceName: string): Array<[string, Uint8Array]> {
    const source = this._getSource(sourceName);
    return Array.from(source.dataAttributes.entries());
  }

  /**
   * Read a pixel value from a source.
   * Equivalent to Mu's `commands.sourcePixelValue(sourceName, x, y)`. (Mu #65)
   *
   * Returns [R, G, B, A] as float values.
   *
   * Resolution order:
   * 1. In-memory image source data (created via newImageSource)
   * 2. GPU readback via the injected PixelReadbackProvider
   * 3. Returns `null` when no pixel data is available
   */
  sourcePixelValue(sourceName: string, x: number, y: number): [number, number, number, number] | null {
    // Validate source exists
    this._getSource(sourceName);
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new TypeError('sourcePixelValue() requires valid x, y coordinates');
    }

    // 1. Check if there's in-memory pixel data
    const imageData = this._imageSources.get(sourceName);
    if (imageData) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix >= 0 && ix < imageData.width && iy >= 0 && iy < imageData.height) {
        const channels = imageData.channels;
        const idx = (iy * imageData.width + ix) * channels;
        return [
          imageData.data[idx] ?? 0,
          channels > 1 ? (imageData.data[idx + 1] ?? 0) : 0,
          channels > 2 ? (imageData.data[idx + 2] ?? 0) : 0,
          channels > 3 ? (imageData.data[idx + 3] ?? 0) : 1,
        ];
      }
      // Out-of-bounds on an in-memory source
      return null;
    }

    // 2. Try GPU readback provider
    if (this._pixelReadbackProvider) {
      return this._pixelReadbackProvider.readSourcePixel(sourceName, x, y);
    }

    // 3. No pixel data available
    return null;
  }

  /**
   * Get display channel names for a source.
   * Equivalent to Mu's `commands.sourceDisplayChannelNames(sourceName)`. (Mu #66)
   */
  sourceDisplayChannelNames(sourceName: string): string[] {
    const source = this._getSource(sourceName);
    if (source.channelNames.length > 0) {
      return [...source.channelNames];
    }
    // Default channel names
    return ['R', 'G', 'B', 'A'];
  }

  // =====================================================================
  // In-Memory Image Sources (commands 69-70)
  // =====================================================================

  /**
   * Create an in-memory image source.
   * Equivalent to Mu's `commands.newImageSource(name, width, height, channels, ...)`. (Mu #69)
   *
   * @returns The created source name
   */
  newImageSource(name: string, width: number, height: number, channels: number = 4): string {
    if (typeof name !== 'string' || !name) {
      throw new TypeError('newImageSource() requires a non-empty name');
    }
    if (width <= 0 || height <= 0) {
      throw new TypeError('newImageSource() requires positive width and height');
    }
    const pendingInBatch = this._batchQueue.some((entry) => entry.name === name);
    if (this._sources.has(name) || this._imageSources.has(name) || pendingInBatch) {
      throw new TypeError(`Source '${name}' already exists. Use a unique name or delete the existing source first.`);
    }

    const record = this._createSourceRecord([name], 'image');
    const autoName = record.name;
    record.name = name;
    record.width = width;
    record.height = height;
    record.channelNames =
      channels >= 4 ? ['R', 'G', 'B', 'A'] : channels === 3 ? ['R', 'G', 'B'] : channels === 2 ? ['R', 'G'] : ['R'];

    // Replace the auto-generated name entry with the custom name
    this._sources.delete(autoName);
    this._sources.set(name, record);

    // Create pixel buffer
    this._imageSources.set(name, {
      width,
      height,
      channels,
      data: new Float32Array(width * height * channels),
    });

    return name;
  }

  /**
   * Set pixel data for an in-memory image source.
   * Equivalent to Mu's `commands.newImageSourcePixels(name, frame, pixels, ...)`. (Mu #70)
   */
  newImageSourcePixels(name: string, _frame: number, pixels: Float32Array | number[]): void {
    const imageData = this._imageSources.get(name);
    if (!imageData) {
      throw new Error(`Image source not found: "${name}"`);
    }

    const floatPixels = pixels instanceof Float32Array ? pixels : new Float32Array(pixels);

    if (floatPixels.length !== imageData.data.length) {
      throw new Error(`Pixel data length mismatch: expected ${imageData.data.length}, got ${floatPixels.length}`);
    }

    imageData.data.set(floatPixels);
  }

  // =====================================================================
  // Session Management (command 71)
  // =====================================================================

  /**
   * Clear all sources from the session.
   * Equivalent to Mu's `commands.clearSession()`. (Mu #71)
   */
  clearSession(): void {
    // Clear the real session first
    try {
      const api = tryGetOpenRV();
      if (api?.media.clearSources) {
        api.media.clearSources();
      }
    } catch {
      // eslint-disable-next-line no-console
      console.warn('[MuSourceBridge] clearSession: real session unavailable, clearing local state only');
    }

    // Remove media-rep nodes from the graph before clearing source records
    if (this._graph) {
      const removedNames = new Set<string>();
      for (const source of this._sources.values()) {
        for (const rep of source.representations) {
          if (!removedNames.has(rep.nodeName)) {
            const node = this._graph.getAllNodes().find((n) => n.name === rep.nodeName);
            if (node) this._graph.removeNode(node.id);
            removedNames.add(rep.nodeName);
          }
          if (!removedNames.has(rep.switchNodeName)) {
            const node = this._graph.getAllNodes().find((n) => n.name === rep.switchNodeName);
            if (node) this._graph.removeNode(node.id);
            removedNames.add(rep.switchNodeName);
          }
        }
      }
    }

    this._sources.clear();
    this._imageSources.clear();
    this._sourceCounter = 0;
    this._batchMode = false;
    this._batchQueue = [];
  }

  // =====================================================================
  // Media Representations (commands 72-78)
  // =====================================================================

  /**
   * Add a media representation to a source.
   * Equivalent to Mu's `commands.addSourceMediaRep(sourceName, repName, paths)`. (Mu #72)
   *
   * @returns The representation node name (empty string when no graph is attached)
   */
  addSourceMediaRep(sourceName: string, repName: string, paths: string[]): string {
    const source = this._getSource(sourceName);

    // Only fabricate node names when a real graph is attached so that the
    // returned names always correspond to actual graph nodes.  Without a
    // graph the names would be meaningless placeholders (Issue #258).
    const nodeName = this._graph ? `${sourceName}_${repName}_source` : '';
    const switchNodeName = this._graph ? `${sourceName}_switch` : '';

    source.representations.push({
      name: repName,
      tag: repName,
      mediaPaths: [...paths],
      nodeName,
      switchNodeName,
    });

    // If this is the first rep, set it as active
    if (source.representations.length === 1) {
      source.activeRep = repName;
    }

    // Materialise nodes in the graph so they are discoverable
    this._ensureRepNodes(source, nodeName, switchNodeName);

    // Propagate to live session when available
    const api = tryGetOpenRV();
    if (api && paths.length > 0) {
      this._loadIntoSession(paths).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[MuSourceBridge] addSourceMediaRep session propagation failed:', err);
      });
    }

    return nodeName;
  }

  /**
   * Switch the active media representation for a source.
   * Equivalent to Mu's `commands.setActiveSourceMediaRep(sourceName, repName)`. (Mu #73)
   */
  setActiveSourceMediaRep(sourceName: string, repName: string): void {
    const source = this._getSource(sourceName);
    const rep = source.representations.find((r) => r.name === repName);
    if (!rep) {
      throw new Error(`Media representation "${repName}" not found on source "${sourceName}"`);
    }
    source.activeRep = repName;

    // Update the graph switch node's active input
    if (this._graph) {
      const activeIdx = source.representations.findIndex((r) => r.name === repName);
      if (activeIdx >= 0) {
        const switchNode = this._graph.getAllNodes().find((n) => n.name === rep.switchNodeName);
        if (switchNode && switchNode instanceof MediaRepNode) {
          switchNode.setActiveInput(activeIdx);
        }
      }
    }

    // Propagate to real session — attempt to load the rep's media
    if (rep.mediaPaths.length > 0) {
      this._loadIntoSession(rep.mediaPaths).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[MuSourceBridge] setActiveSourceMediaRep session propagation failed:', err);
      });
    }
  }

  /**
   * Get the active media representation name for a source.
   * Equivalent to Mu's `commands.sourceMediaRep(sourceName)`. (Mu #74)
   */
  sourceMediaRep(sourceName: string): string {
    const source = this._getSource(sourceName);
    return source.activeRep;
  }

  /**
   * List all media representation names for a source.
   * Equivalent to Mu's `commands.sourceMediaReps(sourceName)`. (Mu #75)
   */
  sourceMediaReps(sourceName: string): string[] {
    const source = this._getSource(sourceName);
    return source.representations.map((r) => r.name);
  }

  /**
   * List media representation name-node pairs for a source.
   * Equivalent to Mu's `commands.sourceMediaRepsAndNodes(sourceName)`. (Mu #76)
   */
  sourceMediaRepsAndNodes(sourceName: string): Array<[string, string]> {
    const source = this._getSource(sourceName);
    return source.representations.map((r) => [r.name, r.nodeName]);
  }

  /**
   * Get the switch node name for a source's representations.
   * Equivalent to Mu's `commands.sourceMediaRepSwitchNode(sourceName)`. (Mu #77)
   */
  sourceMediaRepSwitchNode(sourceName: string): string {
    const source = this._getSource(sourceName);
    if (source.representations.length === 0) return '';
    return source.representations[0]!.switchNodeName;
  }

  /**
   * Get the source node name for a specific representation.
   * Equivalent to Mu's `commands.sourceMediaRepSourceNode(sourceName)`. (Mu #78)
   */
  sourceMediaRepSourceNode(sourceName: string, repName?: string): string {
    const source = this._getSource(sourceName);
    const targetRep = repName ?? source.activeRep;
    const rep = source.representations.find((r) => r.name === targetRep);
    return rep?.nodeName ?? '';
  }

  // =====================================================================
  // Source Geometry (bridge helper — used by nodeImageGeometry)
  // =====================================================================

  /**
   * Get the image geometry of a source.
   * Returns { width, height, pixelAspect } for the named source.
   */
  sourceGeometry(sourceName: string): { width: number; height: number; pixelAspect: number } {
    const source = this._getSource(sourceName);
    return {
      width: source.width,
      height: source.height,
      pixelAspect: source.pixelAspect,
    };
  }

  // =====================================================================
  // Attribute Helpers (for setting attributes programmatically)
  // =====================================================================

  /**
   * Set an attribute on a source (bridge helper, not in Mu API).
   */
  setSourceAttribute(sourceName: string, key: string, value: string): void {
    const source = this._getSource(sourceName);
    source.attributes.set(key, value);
  }

  /**
   * Set a binary data attribute on a source (bridge helper).
   */
  setSourceDataAttribute(sourceName: string, key: string, data: Uint8Array): void {
    const source = this._getSource(sourceName);
    source.dataAttributes.set(key, data);
  }

  /**
   * Set source channel names (bridge helper).
   */
  setSourceChannelNames(sourceName: string, names: string[]): void {
    const source = this._getSource(sourceName);
    source.channelNames = [...names];
  }

  /**
   * Set source dimensions (bridge helper).
   */
  setSourceDimensions(sourceName: string, width: number, height: number, pixelAspect?: number): void {
    const source = this._getSource(sourceName);
    source.width = width;
    source.height = height;
    if (pixelAspect !== undefined) {
      source.pixelAspect = pixelAspect;
    }
  }

  /**
   * Set source frame range (bridge helper).
   */
  setSourceFrameRange(sourceName: string, startFrame: number, endFrame: number): void {
    const source = this._getSource(sourceName);
    source.startFrame = startFrame;
    source.endFrame = endFrame;
  }

  /**
   * Set the pixel readback provider for GPU-backed source pixel reads.
   *
   * When set, `sourcePixelValue()` will delegate to this provider for
   * sources that do not have in-memory pixel data (i.e. GPU-rendered sources).
   */
  setPixelReadbackProvider(provider: PixelReadbackProvider | null): void {
    this._pixelReadbackProvider = provider;
  }

  /**
   * Check if a source exists by name.
   */
  hasSource(name: string): boolean {
    return this._sources.has(name);
  }

  /**
   * Get count of tracked sources.
   */
  sourceCount(): number {
    return this._sources.size;
  }

  // =====================================================================
  // Internal Helpers
  // =====================================================================

  /**
   * Generate a unique source node name following RV conventions.
   */
  private _generateSourceName(): string {
    const idx = this._sourceCounter++;
    return `sourceGroup${String(idx).padStart(6, '0')}`;
  }

  /**
   * If no sources have been registered yet, attempt to discover and register the
   * current openrv media source as a fallback. Returns the current source info
   * from the openrv API if one was found, or undefined otherwise.
   */
  private _ensureFallbackSourceRegistered(): ReturnType<OpenRVMediaAPI['getCurrentSource']> | undefined {
    if (this._sources.size !== 0) return undefined;
    try {
      const current = getOpenRV().media.getCurrentSource();
      if (current && !this._sources.has(current.name)) {
        const mediaPath = current.url || '';
        const record = this._createSourceRecord([mediaPath], 'default', current.name);
        if (current.duration > 0) {
          record.endFrame = current.duration;
        }
      }
      return current;
    } catch {
      // openrv not available
      return undefined;
    }
  }

  /**
   * Create a new source record and register it.
   */
  private _createSourceRecord(paths: string[], tag: string, preGeneratedName?: string): SourceRecord {
    const name = preGeneratedName ?? this._generateSourceName();
    const record: SourceRecord = {
      name,
      tag,
      mediaPaths: [...paths],
      attributes: new Map(),
      dataAttributes: new Map(),
      channelNames: [],
      width: 0,
      height: 0,
      pixelAspect: 1.0,
      startFrame: 1,
      endFrame: 1,
      representations: [],
      activeRep: '',
    };
    this._sources.set(name, record);
    return record;
  }

  /**
   * Look up a source by name, throw if not found.
   */
  private _getSource(name: string): SourceRecord {
    const source = this._sources.get(name);
    if (!source) {
      throw new Error(`Source not found: "${name}"`);
    }
    return source;
  }

  /**
   * Return the media paths for the currently active representation,
   * falling back to the base source paths when no rep is active or the
   * active rep has no media paths of its own.
   */
  private _getActiveMediaPaths(source: SourceRecord): string[] {
    if (source.activeRep) {
      const rep = source.representations.find((r) => r.name === source.activeRep);
      if (rep && rep.mediaPaths.length > 0) {
        return rep.mediaPaths;
      }
    }
    return source.mediaPaths;
  }

  /**
   * Attempt to load media paths into the real OpenRV session.
   *
   * For each path:
   * - `.movieproc` suffixes are loaded as procedural sources.
   * - `http://` / `https://` URLs are loaded via the session URL loader.
   * - Other paths (local file paths) are tracked in the shadow registry only
   *   because browser security prevents direct filesystem access.
   *
   * Errors are caught and logged so that the shadow state remains intact
   * even when the real session is unavailable.
   */
  private async _loadIntoSession(paths: string[]): Promise<void> {
    const api = tryGetOpenRV();
    if (!api) return;

    for (const path of paths) {
      try {
        if (path.endsWith('.movieproc') && api.media.loadMovieProc) {
          api.media.loadMovieProc(path);
        } else if (/^https?:\/\//i.test(path) && api.media.addSourceFromURL) {
          await api.media.addSourceFromURL(path);
        }
        // Local file paths cannot be loaded in the browser; shadow-only.
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[MuSourceBridge] Failed to load "${path}" into session:`, err);
      }
    }
  }

  /**
   * Create real graph nodes for a media representation so that the
   * names stored in the rep record are resolvable by MuNodeBridge.nodeExists() etc.
   * Only called with non-empty names when a graph is attached (Issue #258).
   *
   * - One source node per representation (type `RVMediaRepSource`)
   * - One switch node per source, shared across all reps (type `RVMediaRepSwitch`)
   * - Source nodes are wired as inputs to the switch node.
   */
  private _ensureRepNodes(source: SourceRecord, sourceNodeName: string, switchNodeName: string): void {
    if (!this._graph) return;

    // Create the source node for this rep
    const sourceNode = new MediaRepNode('RVMediaRepSource', sourceNodeName);
    this._graph.addNode(sourceNode);

    // Create or find the switch node (one per source)
    let switchNode: IPNode | undefined;
    for (const n of this._graph.getAllNodes()) {
      if (n.name === switchNodeName) {
        switchNode = n;
        break;
      }
    }
    if (!switchNode) {
      switchNode = new MediaRepNode('RVMediaRepSwitch', switchNodeName);
      this._graph.addNode(switchNode);
    }

    // Wire source -> switch
    this._graph.connect(sourceNode, switchNode);

    // Set the switch's active input to the currently active rep index
    const activeIdx = source.representations.findIndex((r) => r.name === source.activeRep);
    if (activeIdx >= 0 && switchNode instanceof MediaRepNode) {
      switchNode.setActiveInput(activeIdx);
    }
  }
}
