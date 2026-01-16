/**
 * Test Helper - Exposes app internals for e2e testing
 * This file should only be imported in development/test builds
 */

import type { App } from './App';

declare global {
  interface Window {
    __OPENRV_TEST__?: {
      app: App;
      getSessionState: () => SessionState;
      getViewerState: () => ViewerState;
      getColorState: () => ColorState;
      getTransformState: () => TransformState;
      getPaintState: () => PaintState;
    };
  }
}

export interface SessionState {
  currentFrame: number;
  frameCount: number;
  inPoint: number;
  outPoint: number;
  isPlaying: boolean;
  loopMode: 'once' | 'loop' | 'pingpong';
  playDirection: number;
  volume: number;
  muted: boolean;
  fps: number;
  hasMedia: boolean;
  mediaType: string | null;
  mediaName: string | null;
  marks: number[];
}

export interface ViewerState {
  zoom: number;
  panX: number;
  panY: number;
  wipeMode: 'off' | 'horizontal' | 'vertical' | 'quad';
  wipePosition: number;
  cropEnabled: boolean;
}

export interface ColorState {
  exposure: number;
  gamma: number;
  saturation: number;
  contrast: number;
  temperature: number;
  tint: number;
  brightness: number;
  hasLUT: boolean;
  lutIntensity: number;
}

export interface TransformState {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface PaintState {
  currentTool: 'pan' | 'pen' | 'eraser' | 'text';
  strokeColor: string;
  strokeWidth: number;
  brushType: 'circle' | 'gaussian';
  ghostMode: boolean;
  annotatedFrames: number[];
  canUndo: boolean;
  canRedo: boolean;
}

export function exposeForTesting(app: App): void {
  // Access private properties through any cast (for testing only)
  const appAny = app as any;

  window.__OPENRV_TEST__ = {
    app,

    getSessionState: (): SessionState => {
      const session = appAny.session;
      const source = session.currentSource;
      return {
        currentFrame: session.currentFrame,
        // frameCount is the duration in the in/out range, use source?.duration for total
        frameCount: source?.duration ?? 0,
        inPoint: session.inPoint,
        outPoint: session.outPoint,
        isPlaying: session.isPlaying,
        loopMode: session.loopMode,
        playDirection: session.playDirection,
        volume: session.volume,
        muted: session.muted,
        fps: session.fps,
        hasMedia: !!source,
        mediaType: source?.type ?? null,
        mediaName: source?.name ?? null,
        marks: Array.from(session.marks ?? []),
      };
    },

    getViewerState: (): ViewerState => {
      const viewer = appAny.viewer;
      return {
        zoom: viewer.zoom ?? 1,
        panX: viewer.panX ?? 0,
        panY: viewer.panY ?? 0,
        wipeMode: viewer.wipeState?.mode ?? 'off',
        wipePosition: viewer.wipeState?.position ?? 0.5,
        cropEnabled: viewer.cropState?.enabled ?? false,
      };
    },

    getColorState: (): ColorState => {
      const colorControls = appAny.colorControls;
      const adjustments = colorControls?.adjustments ?? {};
      return {
        exposure: adjustments.exposure ?? 0,
        gamma: adjustments.gamma ?? 1,
        saturation: adjustments.saturation ?? 1,
        contrast: adjustments.contrast ?? 1,
        temperature: adjustments.temperature ?? 0,
        tint: adjustments.tint ?? 0,
        brightness: adjustments.brightness ?? 0,
        hasLUT: !!colorControls?.currentLUT,
        lutIntensity: colorControls?.lutIntensity ?? 1,
      };
    },

    getTransformState: (): TransformState => {
      const transformControl = appAny.transformControl;
      const transform = transformControl?.transform ?? {};
      return {
        rotation: transform.rotation ?? 0,
        flipH: transform.flipH ?? false,
        flipV: transform.flipV ?? false,
      };
    },

    getPaintState: (): PaintState => {
      const paintEngine = appAny.paintEngine;
      // Map 'none' tool to 'pan' for test interface consistency
      const tool = paintEngine?.tool ?? 'none';
      const toolMap: Record<string, 'pan' | 'pen' | 'eraser' | 'text'> = {
        'none': 'pan',
        'pen': 'pen',
        'eraser': 'eraser',
        'text': 'text',
      };
      // Convert RGBA color array to hex string
      const color = paintEngine?.color ?? [1, 0, 0, 1];
      const hexColor = '#' +
        Math.round(color[0] * 255).toString(16).padStart(2, '0') +
        Math.round(color[1] * 255).toString(16).padStart(2, '0') +
        Math.round(color[2] * 255).toString(16).padStart(2, '0');
      // Get brush type - 0 is Circle, 1 is Gaussian (from BrushType enum)
      const brush = paintEngine?.brush ?? 0;
      const brushTypeMap: Record<number, 'circle' | 'gaussian'> = { 0: 'circle', 1: 'gaussian' };
      // Check undo/redo stacks directly since there are no public methods
      const undoStack = paintEngine?.undoStack ?? [];
      const redoStack = paintEngine?.redoStack ?? [];

      return {
        currentTool: toolMap[tool] ?? 'pan',
        strokeColor: hexColor,
        strokeWidth: paintEngine?.width ?? 4,
        brushType: brushTypeMap[brush] ?? 'circle',
        ghostMode: paintEngine?.effects?.ghost ?? false,
        annotatedFrames: Array.from(paintEngine?.getAnnotatedFrames?.() ?? []),
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
      };
    },
  };
}
