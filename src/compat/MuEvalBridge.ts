/**
 * MuEvalBridge — Graph Evaluation & Image Query Bridge for Mu API Compatibility
 *
 * Implements Phase 6 of the Mu compatibility layer (~12 commands):
 *   - metaEvaluate / metaEvaluateClosestByType
 *   - closestNodesOfType
 *   - mapPropertyToGlobalFrames
 *   - renderedImages
 *   - imagesAtPixel
 *   - imageGeometry / imageGeometryByIndex / imageGeometryByTag
 *   - eventToImageSpace / eventToCameraSpace
 *
 * Operates against a Graph instance and a MuNodeBridge for node lookup.
 * Coordinate transforms use the view transform state (scale, translation)
 * to convert between screen/event space and image space.
 */

import { Graph } from '../core/graph/Graph';
import type { IPNode } from '../nodes/base/IPNode';
import type { MuNodeBridge } from './MuNodeBridge';
import type {
  MetaEvalInfo,
  PixelImageInfo,
  RenderedImageInfo,
} from './types';

/**
 * View transform state needed for coordinate conversions.
 * Callers should update this whenever the view changes.
 */
export interface ViewTransformState {
  /** Current viewport width in pixels */
  viewWidth: number;
  /** Current viewport height in pixels */
  viewHeight: number;
  /** Current zoom/scale factor */
  scale: number;
  /** Translation/pan offset in pixels: [x, y] */
  translation: [number, number];
  /** Image width in pixels (native resolution) */
  imageWidth: number;
  /** Image height in pixels (native resolution) */
  imageHeight: number;
  /** Pixel aspect ratio of the image (default 1.0) */
  pixelAspect?: number;
}

/**
 * Minimal event subscription interface for connecting to the real view/render event system.
 * Compatible with EventsAPI.on() signature.
 */
export interface ViewEventSource {
  on(event: 'viewTransformChanged', cb: (data: ViewTransformState) => void): () => void;
  on(event: 'renderedImagesChanged', cb: (data: { images: RenderedImageInfo[] }) => void): () => void;
}

/**
 * MuEvalBridge provides graph evaluation traversal and image query
 * commands for the Mu compatibility layer.
 */
export class MuEvalBridge {
  private _graph: Graph;
  private _nodeBridge: MuNodeBridge;

  /** Current view transform (updated externally) */
  private _viewTransform: ViewTransformState = {
    viewWidth: 0,
    viewHeight: 0,
    scale: 1,
    translation: [0, 0],
    imageWidth: 0,
    imageHeight: 0,
    pixelAspect: 1,
  };

  /** Rendered image info list, updated after each render pass */
  private _renderedImages: RenderedImageInfo[] = [];

  /** Event unsubscribers for connectToEvents cleanup */
  private _eventUnsubscribers: Array<() => void> = [];
  private _disposed = false;

  constructor(graph: Graph, nodeBridge: MuNodeBridge) {
    this._graph = graph;
    this._nodeBridge = nodeBridge;
  }

  /** Replace the underlying graph (e.g. after session load). */
  setGraph(graph: Graph): void {
    this._graph = graph;
    this._renderedImages = [];
  }

  /** Update the view transform state (call after zoom/pan/resize). */
  setViewTransform(state: ViewTransformState): void {
    this._viewTransform = { ...state };
  }

  /** Get the current view transform state. */
  getViewTransform(): ViewTransformState {
    return { ...this._viewTransform };
  }

  /**
   * Update the list of currently rendered images.
   * Called by the renderer after each paint to keep the query state fresh.
   */
  setRenderedImages(images: RenderedImageInfo[]): void {
    this._renderedImages = [...images];
  }

  /**
   * Connect to real session view/render events.
   *
   * Subscribes to `viewTransformChanged` and `renderedImagesChanged` so that
   * image-query commands (`renderedImages()`, `imagesAtPixel()`, etc.) reflect
   * actual view and render state.
   *
   * Safe to call multiple times; previous subscriptions are cleaned up first.
   */
  connectToEvents(events: ViewEventSource): void {
    this.dispose();
    this._disposed = false;

    const unsubView = events.on('viewTransformChanged', (data) => {
      this.setViewTransform(data);
    });
    this._eventUnsubscribers.push(unsubView);

    const unsubImages = events.on('renderedImagesChanged', (data) => {
      this.setRenderedImages(data.images);
    });
    this._eventUnsubscribers.push(unsubImages);
  }

  /**
   * Disconnect from session events and clean up subscriptions.
   */
  dispose(): void {
    this._disposed = true;
    for (const unsub of this._eventUnsubscribers) {
      unsub();
    }
    this._eventUnsubscribers = [];
  }

  // =====================================================================
  // Graph Evaluation (commands 117-120)
  // =====================================================================

  /**
   * Traverse the graph from the view node without rendering, collecting
   * evaluation info for each node encountered.
   *
   * Mu equivalent: `commands.metaEvaluate(frame, viewNodeName, typeName)`
   *
   * @param frame - Frame number for evaluation context
   * @param viewNodeName - Starting node name (defaults to current view node)
   * @param typeName - Optional type filter (only include nodes of this type)
   * @returns Array of MetaEvalInfo describing each node in the evaluation chain
   */
  metaEvaluate(frame: number, viewNodeName?: string, typeName?: string): MetaEvalInfo[] {
    const startName = viewNodeName || this._nodeBridge.viewNode();
    if (!startName) return [];

    const startNode = this._findNode(startName);
    if (!startNode) return [];

    const result: MetaEvalInfo[] = [];
    const visited = new Set<string>();

    this._traverseEvalChain(startNode, frame, typeName, result, visited);

    return result;
  }

  /**
   * Traverse the graph and stop at the first node matching the given type.
   *
   * Mu equivalent: `commands.metaEvaluateClosestByType(frame, viewNodeName, typeName)`
   *
   * @param frame - Frame number for evaluation context
   * @param viewNodeName - Starting node name
   * @param typeName - Stop at the first node of this type
   * @returns Array of MetaEvalInfo up to and including the first matching node
   */
  metaEvaluateClosestByType(frame: number, viewNodeName?: string, typeName?: string): MetaEvalInfo[] {
    const startName = viewNodeName || this._nodeBridge.viewNode();
    if (!startName) return [];

    const startNode = this._findNode(startName);
    if (!startNode) return [];

    const result: MetaEvalInfo[] = [];
    const visited = new Set<string>();

    this._traverseEvalChainUntilType(startNode, frame, typeName ?? '', result, visited);

    return result;
  }

  /**
   * Find the closest nodes of a given type by walking upstream from a starting node.
   *
   * Mu equivalent: `commands.closestNodesOfType(startNodeName, typeName, frame)`
   *
   * @param startNodeName - Name of the node to start searching from
   * @param typeName - The node type to search for
   * @param _frame - Frame number (used for context; currently not affecting search)
   * @returns Array of node names of the matching type, closest first
   */
  closestNodesOfType(startNodeName: string, typeName: string, _frame = 0): string[] {
    const startNode = this._findNode(startNodeName);
    if (!startNode) return [];

    const result: string[] = [];
    const visited = new Set<string>();
    const queue: IPNode[] = [startNode];

    // BFS to find closest nodes of the target type
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node.id)) continue;
      visited.add(node.id);

      if (node.type === typeName) {
        result.push(node.name);
      }

      // Walk upstream through inputs
      for (const input of node.inputs) {
        if (!visited.has(input.id)) {
          queue.push(input);
        }
      }
    }

    return result;
  }

  /**
   * Map a local property frame to global frame numbers.
   *
   * Mu equivalent: `commands.mapPropertyToGlobalFrames(localFrame, nodeName, propertyName)`
   *
   * In this simplified implementation, returns the local frame as-is since
   * openrv-web does not have the full frame remapping infrastructure.
   *
   * @param localFrame - The local frame number
   * @param _nodeName - Source node name
   * @param _propertyName - Property path
   * @returns Array with the mapped global frame (currently identity mapping)
   */
  mapPropertyToGlobalFrames(localFrame: number, _nodeName?: string, _propertyName?: string): number[] {
    return [localFrame];
  }

  // =====================================================================
  // Image Query (commands 121-127)
  // =====================================================================

  /**
   * Get info about all currently rendered images.
   *
   * Mu equivalent: `commands.renderedImages()`
   *
   * @returns Array of RenderedImageInfo for each image in the current render
   */
  renderedImages(): RenderedImageInfo[] {
    return [...this._renderedImages];
  }

  /**
   * Hit-test images at a screen pixel coordinate.
   *
   * Mu equivalent: `commands.imagesAtPixel(point, viewNodeName, useStencil)`
   *
   * @param point - Screen coordinates [x, y] in pixels
   * @param _viewNodeName - View node name (currently uses all rendered images)
   * @param _useStencil - Whether to use stencil buffer for precise hit-testing
   * @returns Array of PixelImageInfo for images under the point
   */
  imagesAtPixel(point: [number, number], _viewNodeName?: string, _useStencil = false): PixelImageInfo[] {
    const [sx, sy] = point;
    const results: PixelImageInfo[] = [];

    for (const img of this._renderedImages) {
      // Convert screen point to image coordinates
      const imageCoords = this._screenToImage(sx, sy, img);
      if (!imageCoords) continue;

      const [ix, iy] = imageCoords;

      // Check if the point is inside the image bounds
      const inside = ix >= 0 && ix < img.width && iy >= 0 && iy < img.height;
      const edge =
        !inside &&
        ix >= -1 && ix <= img.width &&
        iy >= -1 && iy <= img.height;

      results.push({
        name: img.name,
        x: Math.floor(ix),
        y: Math.floor(iy),
        px: ix,
        py: iy,
        inside,
        edge,
        modelMatrix: this._getImageModelMatrix(img),
      });
    }

    return results;
  }

  /**
   * Get the four corner coordinates of an image in view/screen space.
   *
   * Mu equivalent: `commands.imageGeometry(imageName)`
   *
   * @param imageName - Name of the image (as returned in RenderedImageInfo)
   * @returns Array of 4 [x, y] pairs: [bottomLeft, bottomRight, topRight, topLeft]
   */
  imageGeometry(imageName: string): [number, number][] {
    const img = this._renderedImages.find((i) => i.name === imageName);
    if (!img) return [];
    return this._computeImageCorners(img);
  }

  /**
   * Get image corner coordinates by render index.
   *
   * Mu equivalent: `commands.imageGeometryByIndex(index)`
   *
   * @param index - Index into the rendered images array
   * @returns Array of 4 [x, y] pairs, or empty array if index out of range
   */
  imageGeometryByIndex(index: number): [number, number][] {
    const img = this._renderedImages[index];
    if (!img) return [];
    return this._computeImageCorners(img);
  }

  /**
   * Get image corner coordinates by tag.
   *
   * Mu equivalent: `commands.imageGeometryByTag(imageName, tag)`
   *
   * @param imageName - Image name
   * @param tag - Tag to match
   * @returns Array of 4 [x, y] corner pairs
   */
  imageGeometryByTag(imageName: string, _tag: string): [number, number][] {
    // Tags are not fully implemented; fall back to name-based lookup
    return this.imageGeometry(imageName);
  }

  /**
   * Convert screen/event coordinates to image pixel coordinates.
   *
   * Mu equivalent: `commands.eventToImageSpace(imageName, eventPoint, useLocalCoords)`
   *
   * @param imageName - The target image name
   * @param eventPoint - Screen coordinates [x, y]
   * @param _useLocalCoords - Whether to use local coordinate system
   * @returns Image pixel coordinates [x, y], or [0, 0] if image not found
   */
  eventToImageSpace(imageName: string, eventPoint: [number, number], _useLocalCoords = false): [number, number] {
    const img = this._renderedImages.find((i) => i.name === imageName);
    if (!img) {
      // Fall back to using the view transform directly
      return this._screenToImageCoords(eventPoint[0], eventPoint[1]);
    }

    const coords = this._screenToImage(eventPoint[0], eventPoint[1], img);
    if (!coords) {
      return this._screenToImageCoords(eventPoint[0], eventPoint[1]);
    }

    return coords;
  }

  /**
   * Convert screen/event coordinates to camera/normalized coordinates.
   *
   * Mu equivalent: `commands.eventToCameraSpace(viewNodeName, eventPoint)`
   *
   * Camera space is normalized to [-1, 1] with (0, 0) at center.
   *
   * @param _viewNodeName - View node name (currently uses global view transform)
   * @param eventPoint - Screen coordinates [x, y]
   * @returns Normalized camera coordinates [x, y]
   */
  eventToCameraSpace(_viewNodeName: string, eventPoint: [number, number]): [number, number] {
    const vt = this._viewTransform;
    if (vt.viewWidth === 0 || vt.viewHeight === 0) return [0, 0];

    // Map event coords to normalized device coordinates [-1, 1]
    const ndcX = ((eventPoint[0] / vt.viewWidth) * 2) - 1;
    const ndcY = 1 - ((eventPoint[1] / vt.viewHeight) * 2); // Y is flipped

    return [ndcX, ndcY];
  }

  // =====================================================================
  // Internal helpers
  // =====================================================================

  /**
   * Recursively traverse the evaluation chain (DFS upstream through inputs).
   */
  private _traverseEvalChain(
    node: IPNode,
    frame: number,
    typeName: string | undefined,
    result: MetaEvalInfo[],
    visited: Set<string>,
  ): void {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    // Include this node if no type filter or type matches
    if (!typeName || node.type === typeName) {
      result.push({
        node: node.name,
        nodeType: node.type,
        frame,
      });
    }

    // Walk upstream through all inputs
    for (const input of node.inputs) {
      this._traverseEvalChain(input, frame, typeName, result, visited);
    }
  }

  /**
   * Traverse upstream and stop at the first node matching the target type.
   * Returns true if a matching node was found (signals callers to stop).
   */
  private _traverseEvalChainUntilType(
    node: IPNode,
    frame: number,
    typeName: string,
    result: MetaEvalInfo[],
    visited: Set<string>,
  ): boolean {
    if (visited.has(node.id)) return false;
    visited.add(node.id);

    result.push({
      node: node.name,
      nodeType: node.type,
      frame,
    });

    // If this node matches the target type, stop
    if (node.type === typeName) {
      return true;
    }

    // Walk upstream
    for (const input of node.inputs) {
      const found = this._traverseEvalChainUntilType(input, frame, typeName, result, visited);
      if (found) return true;
    }

    return false;
  }

  /**
   * Find a node by name in the graph.
   */
  private _findNode(name: string): IPNode | null {
    for (const node of this._graph.getAllNodes()) {
      if (node.name === name) return node;
    }
    return this._graph.getNode(name) ?? null;
  }

  /**
   * Convert screen coordinates to image pixel coordinates for a specific rendered image.
   * Returns null if the image has zero dimensions.
   */
  private _screenToImage(
    sx: number,
    sy: number,
    img: RenderedImageInfo,
  ): [number, number] | null {
    if (img.width === 0 || img.height === 0) return null;

    const vt = this._viewTransform;
    const pixelAspect = vt.pixelAspect ?? 1;

    // The image is rendered centered in the viewport, scaled by the view scale.
    // Screen position of the image top-left corner:
    const imgScreenW = img.width * vt.scale * pixelAspect;
    const imgScreenH = img.height * vt.scale;

    const imgScreenX = (vt.viewWidth - imgScreenW) / 2 + vt.translation[0];
    const imgScreenY = (vt.viewHeight - imgScreenH) / 2 + vt.translation[1];

    // Convert screen coords to image coords
    const ix = (sx - imgScreenX) / (vt.scale * pixelAspect);
    const iy = (sy - imgScreenY) / vt.scale;

    return [ix, iy];
  }

  /**
   * Convert screen coordinates to image pixel coordinates using the global view transform.
   */
  private _screenToImageCoords(sx: number, sy: number): [number, number] {
    const vt = this._viewTransform;
    if (vt.imageWidth === 0 || vt.imageHeight === 0) return [0, 0];

    const pixelAspect = vt.pixelAspect ?? 1;

    const imgScreenW = vt.imageWidth * vt.scale * pixelAspect;
    const imgScreenH = vt.imageHeight * vt.scale;

    const imgScreenX = (vt.viewWidth - imgScreenW) / 2 + vt.translation[0];
    const imgScreenY = (vt.viewHeight - imgScreenH) / 2 + vt.translation[1];

    const ix = (sx - imgScreenX) / (vt.scale * pixelAspect);
    const iy = (sy - imgScreenY) / vt.scale;

    return [ix, iy];
  }

  /**
   * Compute the four corners of an image in screen/view space.
   * Returns [bottomLeft, bottomRight, topRight, topLeft].
   */
  private _computeImageCorners(img: RenderedImageInfo): [number, number][] {
    const vt = this._viewTransform;
    const pixelAspect = vt.pixelAspect ?? 1;

    const imgScreenW = img.width * vt.scale * pixelAspect;
    const imgScreenH = img.height * vt.scale;

    const left = (vt.viewWidth - imgScreenW) / 2 + vt.translation[0];
    const top = (vt.viewHeight - imgScreenH) / 2 + vt.translation[1];
    const right = left + imgScreenW;
    const bottom = top + imgScreenH;

    return [
      [left, bottom],   // bottom-left
      [right, bottom],  // bottom-right
      [right, top],     // top-right
      [left, top],      // top-left
    ];
  }

  /**
   * Build a simple 4x4 identity model matrix for an image.
   * In a full implementation this would include the image's transform stack.
   */
  private _getImageModelMatrix(_img: RenderedImageInfo): number[] {
    return [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
  }
}
