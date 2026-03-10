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
 *   - Image sources (newImageSource, newImageSourcePixels, getCurrentImageSize)
 *   - Session clearing (clearSession)
 *   - Media representations (addSourceMediaRep, setActiveSourceMediaRep, etc.)
 *
 * Operates against the openrv-web public API (`window.openrv.media.*`) where
 * possible, and maintains local state for features not yet exposed.
 */

import type { SourceMediaInfo } from './types';

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
  readSourcePixel(
    sourceName: string,
    x: number,
    y: number,
  ): [number, number, number, number] | null;
}

/**
 * Lazily resolve the openrv API from the global scope.
 */
function getOpenRV(): {
  media: {
    getCurrentSource(): {
      name: string;
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
  };
} {
  const api = (globalThis as Record<string, unknown>).openrv;
  if (!api) {
    throw new Error('window.openrv is not available. Initialize OpenRVAPI first.');
  }
  return api as ReturnType<typeof getOpenRV>;
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
  private _batchQueue: Array<{ paths: string[]; tag: string }> = [];

  /** In-memory image source pixel data */
  private _imageSources = new Map<string, ImageSourcePixels>();

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
        media: src.mediaPaths[0] ?? '',
        tag: src.tag,
      });
    }
    // Also include the current openrv source if we have no local sources
    if (result.length === 0) {
      try {
        const current = getOpenRV().media.getCurrentSource();
        if (current) {
          result.push({
            name: current.name,
            media: current.name,
            tag: 'default',
          });
        }
      } catch {
        // openrv not available — return empty
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
      try {
        const current = getOpenRV().media.getCurrentSource();
        if (current) {
          active.push(current.name);
        }
      } catch {
        // openrv not available
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
  }

  /**
   * Add multiple sources at once.
   * Equivalent to Mu's `commands.addSources(paths, tag, mergeIntoOne)`. (Mu #54)
   */
  async addSources(
    pathGroups: string[][],
    tag: string = 'default',
    _mergeIntoOne: boolean = false,
  ): Promise<void> {
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
      this._batchQueue.push({ paths, tag });
      return this._generateSourceName();
    }
    const record = this._createSourceRecord(paths, tag);
    return record.name;
  }

  /**
   * Add multiple sources and return the created node names.
   * Equivalent to Mu's `commands.addSourcesVerbose(pathGroups, ...)`. (Mu #56)
   */
  async addSourcesVerbose(
    pathGroups: string[][],
    tag: string = 'default',
  ): Promise<string[]> {
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
    for (const { paths, tag } of queue) {
      this._createSourceRecord(paths, tag);
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
    return { media: [...source.mediaPaths] };
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

    return {
      name: sourceName,
      file: source.mediaPaths[0] ?? '',
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
    return Array.from(this._sources.values()).map((src) =>
      this.sourceMediaInfo(src.name),
    );
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
  newImageSource(
    name: string,
    width: number,
    height: number,
    channels: number = 4,
  ): string {
    if (typeof name !== 'string' || !name) {
      throw new TypeError('newImageSource() requires a non-empty name');
    }
    if (width <= 0 || height <= 0) {
      throw new TypeError('newImageSource() requires positive width and height');
    }

    const record = this._createSourceRecord([name], 'image');
    const autoName = record.name;
    record.name = name;
    record.width = width;
    record.height = height;
    record.channelNames =
      channels >= 4
        ? ['R', 'G', 'B', 'A']
        : channels === 3
          ? ['R', 'G', 'B']
          : channels === 2
            ? ['R', 'G']
            : ['R'];

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
  newImageSourcePixels(
    name: string,
    _frame: number,
    pixels: Float32Array | number[],
  ): void {
    const imageData = this._imageSources.get(name);
    if (!imageData) {
      throw new Error(`Image source not found: "${name}"`);
    }

    const floatPixels =
      pixels instanceof Float32Array ? pixels : new Float32Array(pixels);

    if (floatPixels.length !== imageData.data.length) {
      throw new Error(
        `Pixel data length mismatch: expected ${imageData.data.length}, got ${floatPixels.length}`,
      );
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
   * @returns The created representation node name
   */
  addSourceMediaRep(
    sourceName: string,
    repName: string,
    paths: string[],
  ): string {
    const source = this._getSource(sourceName);
    const nodeName = `${sourceName}_${repName}_source`;
    const switchNodeName = `${sourceName}_switch`;

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
      throw new Error(
        `Media representation "${repName}" not found on source "${sourceName}"`,
      );
    }
    source.activeRep = repName;
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
  sourceMediaRepsAndNodes(
    sourceName: string,
  ): Array<[string, string]> {
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
  sourceGeometry(
    sourceName: string,
  ): { width: number; height: number; pixelAspect: number } {
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
  setSourceDataAttribute(
    sourceName: string,
    key: string,
    data: Uint8Array,
  ): void {
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
  setSourceDimensions(
    sourceName: string,
    width: number,
    height: number,
    pixelAspect?: number,
  ): void {
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
  setSourceFrameRange(
    sourceName: string,
    startFrame: number,
    endFrame: number,
  ): void {
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
   * Create a new source record and register it.
   */
  private _createSourceRecord(
    paths: string[],
    tag: string,
  ): SourceRecord {
    const name = this._generateSourceName();
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
}
