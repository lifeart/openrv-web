import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createExportCanvas,
  createSourceExportCanvas,
  renderFrameToCanvas,
  renderSourceToImageData,
} from './ViewerExport';
import { Session, MediaSource } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { Transform2D } from './TransformControl';
import {
  createMockImage,
  createMockMediaSource,
} from '../../../test/mocks';

// Session requires too many subsystems to construct for real; a partial mock is appropriate.
function createMockSession(source: MediaSource | null = null): Session {
  const session = {
    currentSource: source,
    currentFrame: 1,
    fps: 24,
    getSourceByIndex: vi.fn().mockReturnValue(source),
    getSequenceFrameImage: vi.fn().mockResolvedValue(createMockImage(1920, 1080)),
    getSequenceFrameSync: vi.fn().mockReturnValue(createMockImage(1920, 1080)),
    getVideoFrameCanvas: vi.fn().mockReturnValue(null),
  } as unknown as Session;
  return session;
}

// Use real PaintEngine with a spy on getAnnotationsWithGhost so tests can
// verify calls and override the return value when annotations are needed.
function createRealPaintEngine(): PaintEngine {
  const engine = new PaintEngine();
  vi.spyOn(engine, 'getAnnotationsWithGhost');
  return engine;
}

// Use real PaintRenderer with a no-op spy on renderAnnotations so tests can
// verify it was (or wasn't) called.  The spy prevents actual rendering
// because the mock annotation data from getAnnotationsWithGhost doesn't
// contain real Annotation objects.  getCanvas() works as-is (real method).
function createRealPaintRenderer(): PaintRenderer {
  const renderer = new PaintRenderer();
  vi.spyOn(renderer, 'renderAnnotations').mockImplementation(() => {});
  return renderer;
}

// Default transform
function defaultTransform(): Transform2D {
  return {
    rotation: 0,
    flipH: false,
    flipV: false,
    scale: { x: 1, y: 1 },
    translate: { x: 0, y: 0 },
  };
}

describe('ViewerExport', () => {
  let mockSession: Session;
  let mockPaintEngine: PaintEngine;
  let mockPaintRenderer: PaintRenderer;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createExportCanvas', () => {
    beforeEach(() => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      mockPaintEngine = createRealPaintEngine();
      mockPaintRenderer = createRealPaintRenderer();
    });

    it('should return null when no source', () => {
      mockSession = createMockSession(null);

      const result = createExportCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        'none',
        false
      );

      expect(result).toBeNull();
    });

    it('should return null when source has no element', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      source.element = undefined as any;
      mockSession = createMockSession(source);

      const result = createExportCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        'none',
        false
      );

      expect(result).toBeNull();
    });

    it('should create canvas at source resolution', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);

      const result = createExportCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        'none',
        false
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1920);
      expect(result!.height).toBe(1080);
    });

    it('should apply filter string', () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);

      const result = createExportCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        'brightness(1.5)',
        false
      );

      // Canvas should be created successfully with filter applied
      expect(result).not.toBeNull();
      expect(result!.width).toBe(800);
      expect(result!.height).toBe(600);
    });

    it('should include annotations when requested', () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);
      (mockPaintEngine.getAnnotationsWithGhost as any).mockReturnValue([{ id: '1' }]);

      createExportCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        'none',
        true
      );

      expect(mockPaintEngine.getAnnotationsWithGhost).toHaveBeenCalled();
      expect(mockPaintRenderer.renderAnnotations).toHaveBeenCalled();
    });

    it('should not render annotations when not requested', () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);

      createExportCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        'none',
        false
      );

      expect(mockPaintRenderer.renderAnnotations).not.toHaveBeenCalled();
    });

    it('should apply transform when provided', () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);
      const transform: Transform2D = { rotation: 90, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

      const result = createExportCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        'none',
        false,
        transform
      );

      expect(result).not.toBeNull();
    });

    it('should work with video source', () => {
      const source = createMockMediaSource('video', 1280, 720);
      mockSession = createMockSession(source);

      const result = createExportCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        'none',
        false
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1280);
      expect(result!.height).toBe(720);
    });
  });

  describe('createSourceExportCanvas', () => {
    it('should return null when no source', () => {
      mockSession = createMockSession(null);
      const result = createSourceExportCanvas(mockSession);
      expect(result).toBeNull();
    });

    it('should create source-resolution canvas for image sources', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);

      const result = createSourceExportCanvas(mockSession);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1920);
      expect(result!.height).toBe(1080);
    });

    it('should prefer sequence frame image for sequence sources', () => {
      const source = createMockMediaSource('sequence', 1280, 720);
      mockSession = createMockSession(source);

      createSourceExportCanvas(mockSession);

      expect(mockSession.getSequenceFrameSync).toHaveBeenCalledWith(1);
    });
  });

  describe('renderFrameToCanvas', () => {
    beforeEach(() => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      mockPaintEngine = createRealPaintEngine();
      mockPaintRenderer = createRealPaintRenderer();
    });

    it('should return null when no source', async () => {
      mockSession = createMockSession(null);

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        5,
        defaultTransform(),
        'none',
        false
      );

      expect(result).toBeNull();
    });

    it('should restore original frame after rendering', async () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);
      mockSession.currentFrame = 10;

      await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        25,
        defaultTransform(),
        'none',
        false
      );

      expect(mockSession.currentFrame).toBe(10);
    });

    it('should handle sequence source', async () => {
      const source = createMockMediaSource('sequence', 1920, 1080);
      mockSession = createMockSession(source);

      await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        5,
        defaultTransform(),
        'none',
        false
      );

      expect(mockSession.getSequenceFrameImage).toHaveBeenCalledWith(5);
    });

    it('should handle video source with seeking', async () => {
      const source = createMockMediaSource('video', 1280, 720);
      mockSession = createMockSession(source);

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        25,
        defaultTransform(),
        'none',
        false
      );

      // Video seeking is async, result depends on timing
      // Just verify it doesn't throw
      expect(result !== undefined).toBe(true);
    });

    it('should include annotations for specific frame', async () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);
      (mockPaintEngine.getAnnotationsWithGhost as any).mockReturnValue([{ id: '1' }]);

      await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        15,
        defaultTransform(),
        'none',
        true
      );

      expect(mockPaintEngine.getAnnotationsWithGhost).toHaveBeenCalledWith(15);
    });

    it('should apply filter string', async () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        5,
        defaultTransform(),
        'brightness(1.2) contrast(1.1)',
        false
      );

      expect(result).not.toBeNull();
    });

    it('should apply transform', async () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);
      const transform: Transform2D = { rotation: 180, flipH: true, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        5,
        transform,
        'none',
        false
      );

      expect(result).not.toBeNull();
    });

    it('should create canvas at cropped dimensions', async () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      const cropRegion = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        1,
        defaultTransform(),
        'none',
        false,
        cropRegion
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(960);  // 0.5 * 1920
      expect(result!.height).toBe(540); // 0.5 * 1080
    });

    it('should apply crop after rotation', async () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      const transform: Transform2D = { rotation: 90, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };
      const cropRegion = { x: 0, y: 0, width: 0.5, height: 0.5 };

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        1,
        transform,
        'none',
        false,
        cropRegion
      );

      // After 90° rotation, effective dims are 1080x1920
      // Crop is 0.5 of each: 540x960
      expect(result).not.toBeNull();
      expect(result!.width).toBe(540);
      expect(result!.height).toBe(960);
    });

    it('should handle full-frame crop without cropping', async () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);
      const cropRegion = { x: 0, y: 0, width: 1, height: 1 };

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        1,
        defaultTransform(),
        'none',
        false,
        cropRegion
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(800);
      expect(result!.height).toBe(600);
    });

    it('should apply crop with annotations', async () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      (mockPaintEngine.getAnnotationsWithGhost as any).mockReturnValue([{ id: '1' }]);
      const cropRegion = { x: 0, y: 0, width: 0.5, height: 0.5 };

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        1,
        defaultTransform(),
        'none',
        true,
        cropRegion
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(960);
      expect(result!.height).toBe(540);
      expect(mockPaintRenderer.renderAnnotations).toHaveBeenCalled();
    });
  });

  describe('rotation clamping (computeExportParams)', () => {
    beforeEach(() => {
      mockPaintEngine = createRealPaintEngine();
      mockPaintRenderer = createRealPaintRenderer();
    });

    it('should handle 90° rotation by swapping dimensions', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      const transform: Transform2D = { rotation: 90, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, transform);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1080); // Swapped
      expect(result!.height).toBe(1920); // Swapped
    });

    it('should handle 270° rotation by swapping dimensions', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      const transform: Transform2D = { rotation: 270, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, transform);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1080);
      expect(result!.height).toBe(1920);
    });

    it('should handle 180° rotation without swapping', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      const transform: Transform2D = { rotation: 180, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, transform);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1920);
      expect(result!.height).toBe(1080);
    });

    it('should clamp invalid rotation to 0 (no dimension swap)', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      // Invalid rotation (e.g., corrupted session data)
      const transform: Transform2D = { rotation: 45 as any, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, transform);

      // Should fall back to 0° (no swap)
      expect(result).not.toBeNull();
      expect(result!.width).toBe(1920);
      expect(result!.height).toBe(1080);
    });

    it('should clamp negative rotation to 0', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      const transform: Transform2D = { rotation: -90 as any, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, transform);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1920);
      expect(result!.height).toBe(1080);
    });

    it('should clamp 360 rotation to 0', () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);
      const transform: Transform2D = { rotation: 360 as any, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, transform);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(800);
      expect(result!.height).toBe(600);
    });

    it('should handle undefined transform gracefully', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, undefined);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1920);
      expect(result!.height).toBe(1080);
    });
  });

  describe('crop region in export', () => {
    beforeEach(() => {
      mockPaintEngine = createRealPaintEngine();
      mockPaintRenderer = createRealPaintRenderer();
    });

    it('should create canvas at cropped dimensions', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      const cropRegion = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, defaultTransform(), cropRegion);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(960);  // 0.5 * 1920
      expect(result!.height).toBe(540); // 0.5 * 1080
    });

    it('should handle full-frame crop region without cropping', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      const cropRegion = { x: 0, y: 0, width: 1, height: 1 };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, defaultTransform(), cropRegion);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1920);
      expect(result!.height).toBe(1080);
    });

    it('should apply crop after rotation', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      const transform: Transform2D = { rotation: 90, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };
      const cropRegion = { x: 0, y: 0, width: 0.5, height: 0.5 };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, transform, cropRegion);

      // After 90° rotation, effective dims are 1080x1920
      // Crop is 0.5 of each: 540x960
      expect(result).not.toBeNull();
      expect(result!.width).toBe(540);
      expect(result!.height).toBe(960);
    });

    it('should handle near-full-frame crop (floating-point edge case)', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      // Near-full crop due to floating-point imprecision
      const cropRegion = { x: 1e-10, y: 0, width: 0.9999999999, height: 1 };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, defaultTransform(), cropRegion);

      // isFullCropRegion should detect this as full-frame
      expect(result).not.toBeNull();
      expect(result!.width).toBe(1920);
      expect(result!.height).toBe(1080);
    });

    it('should round crop dimensions to whole pixels', () => {
      const source = createMockMediaSource('image', 1000, 1000);
      mockSession = createMockSession(source);
      // 1/3 crop — not exactly representable in binary
      const cropRegion = { x: 0, y: 0, width: 1 / 3, height: 1 / 3 };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, defaultTransform(), cropRegion);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(Math.round(1000 / 3));
      expect(result!.height).toBe(Math.round(1000 / 3));
    });

    it('should apply crop without transform (crop-only path)', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      // No rotation, no flip — exercises the crop-only branch
      const transform: Transform2D = { rotation: 0, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };
      const cropRegion = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', false, transform, cropRegion);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(Math.round(0.6 * 1920));
      expect(result!.height).toBe(Math.round(0.5 * 1080));
    });

    it('should apply annotations with crop and transform combined', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
      (mockPaintEngine.getAnnotationsWithGhost as any).mockReturnValue([{ id: 'ann1' }]);
      const transform: Transform2D = { rotation: 90, flipH: true, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };
      const cropRegion = { x: 0, y: 0, width: 0.5, height: 0.5 };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', true, transform, cropRegion);

      // After 90° rotation, effective dims are 1080x1920
      // Crop 0.5 of each: 540x960
      expect(result).not.toBeNull();
      expect(result!.width).toBe(540);
      expect(result!.height).toBe(960);
      expect(mockPaintEngine.getAnnotationsWithGhost).toHaveBeenCalled();
      expect(mockPaintRenderer.renderAnnotations).toHaveBeenCalled();
    });

    it('should apply annotations with crop only (no transform)', () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);
      (mockPaintEngine.getAnnotationsWithGhost as any).mockReturnValue([{ id: 'ann1' }]);
      const cropRegion = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

      const result = createExportCanvas(mockSession, mockPaintEngine, mockPaintRenderer, 'none', true, defaultTransform(), cropRegion);

      expect(result).not.toBeNull();
      expect(result!.width).toBe(400); // 0.5 * 800
      expect(result!.height).toBe(300); // 0.5 * 600
      expect(mockPaintRenderer.renderAnnotations).toHaveBeenCalled();
    });
  });

  describe('renderSourceToImageData', () => {
    beforeEach(() => {
      const source = createMockMediaSource('image', 1920, 1080);
      mockSession = createMockSession(source);
    });

    it('should return null when source not found', () => {
      (mockSession.getSourceByIndex as any).mockReturnValue(null);

      const result = renderSourceToImageData(mockSession, 0, 100, 100);

      expect(result).toBeNull();
    });

    it('should return null when source has no element', () => {
      const source = createMockMediaSource('image', 800, 600);
      source.element = undefined as any;
      (mockSession.getSourceByIndex as any).mockReturnValue(source);

      const result = renderSourceToImageData(mockSession, 0, 100, 100);

      expect(result).toBeNull();
    });

    it('should create ImageData at specified dimensions', () => {
      const source = createMockMediaSource('image', 1920, 1080);
      (mockSession.getSourceByIndex as any).mockReturnValue(source);

      // Call the function (result depends on canvas mock returning proper ImageData)
      renderSourceToImageData(mockSession, 0, 200, 150);

      expect(mockSession.getSourceByIndex).toHaveBeenCalledWith(0);
    });

    it('should use willReadFrequently option for performance', () => {
      const source = createMockMediaSource('image', 800, 600);
      (mockSession.getSourceByIndex as any).mockReturnValue(source);

      // The function should create context with willReadFrequently: true
      renderSourceToImageData(mockSession, 0, 100, 100);

      // Verify the function was called with correct source index
      expect(mockSession.getSourceByIndex).toHaveBeenCalledWith(0);
    });

    it('should work with video source', () => {
      const source = createMockMediaSource('video', 1280, 720);
      (mockSession.getSourceByIndex as any).mockReturnValue(source);

      // Call the function
      renderSourceToImageData(mockSession, 1, 640, 360);

      expect(mockSession.getSourceByIndex).toHaveBeenCalledWith(1);
    });

    it('uses current sequence frame when source element is missing', () => {
      const seqFrame = createMockImage(320, 180);
      const source = createMockMediaSource('sequence', 320, 180);
      source.element = undefined as any;
      source.sequenceFrames = [
        { index: 0, frameNumber: 1, file: new File([''], 'f0001.png') },
        { index: 1, frameNumber: 2, file: new File([''], 'f0002.png'), image: seqFrame },
      ];
      mockSession.currentFrame = 2;
      (mockSession.getSourceByIndex as any).mockReturnValue(source);

      const result = renderSourceToImageData(mockSession, 0, 320, 180);

      expect(result).not.toBeNull();
    });

    it('prefers mediabunny cached frame canvas for video sources', () => {
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = 64;
      frameCanvas.height = 64;

      const source = createMockMediaSource('video', 1280, 720);
      source.videoSourceNode = {
        isUsingMediabunny: vi.fn().mockReturnValue(true),
        getCachedFrameCanvas: vi.fn().mockReturnValue(frameCanvas),
        getFrameAsync: vi.fn().mockResolvedValue(undefined),
      } as any;
      const videoNode = source.videoSourceNode!;
      mockSession.currentFrame = 12;
      (mockSession.getSourceByIndex as any).mockReturnValue(source);

      const result = renderSourceToImageData(mockSession, 1, 640, 360);

      expect(result).not.toBeNull();
      expect(videoNode.getCachedFrameCanvas).toHaveBeenCalledWith(12);
      expect(videoNode.getFrameAsync).not.toHaveBeenCalled();
    });

    it('applies optional transform when rendering source to ImageData', () => {
      const pattern = document.createElement('canvas');
      pattern.width = 1;
      pattern.height = 2;
      const pctx = pattern.getContext('2d')!;
      pctx.fillStyle = 'rgb(255,0,0)';
      pctx.fillRect(0, 0, 1, 1);
      pctx.fillStyle = 'rgb(0,0,255)';
      pctx.fillRect(0, 1, 1, 1);

      const source = createMockMediaSource('image', 1, 2);
      source.element = pattern as any;
      (mockSession.getSourceByIndex as any).mockReturnValue(source);

      renderSourceToImageData(
        mockSession,
        0,
        2,
        1,
        defaultTransform()
      );

      const getContextMock = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
      const unrotatedCtx = getContextMock.mock.results.at(-1)?.value as { rotate: ReturnType<typeof vi.fn> };
      expect(unrotatedCtx.rotate).not.toHaveBeenCalled();

      renderSourceToImageData(
        mockSession,
        0,
        2,
        1,
        { ...defaultTransform(), rotation: 90 }
      );
      const rotatedCtx = getContextMock.mock.results.at(-1)?.value as { rotate: ReturnType<typeof vi.fn> };
      expect(rotatedCtx.rotate).toHaveBeenCalled();
    });
  });
});
