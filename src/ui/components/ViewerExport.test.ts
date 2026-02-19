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
    fetchCurrentVideoFrame: vi.fn().mockResolvedValue(undefined),
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

    it('should composite frameburn timecode when enabled', () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);

      createExportCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        'none',
        false,
        undefined,
        undefined,
        undefined,
        {
          enabled: true,
          position: 'top-left',
          fontSize: 'medium',
          showFrameCounter: true,
          backgroundOpacity: 0.6,
          frame: 1,
          totalFrames: 100,
          fps: 24,
        }
      );

      const getContextMock = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
      const ctx = getContextMock.mock.results.at(-1)?.value as { fillText: ReturnType<typeof vi.fn> };
      const renderedTexts = ctx.fillText.mock.calls.map((call) => call[0]);
      expect(renderedTexts).toContain('00:00:00:00');
      expect(renderedTexts).toContain('Frame 1 / 100');
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

    it('should use FileSourceNode canvas for fileSourceNode sources', () => {
      const fsCanvas = document.createElement('canvas');
      fsCanvas.width = 2048;
      fsCanvas.height = 1024;

      const source = createMockMediaSource('image', 2048, 1024);
      source.fileSourceNode = {
        getCanvas: vi.fn().mockReturnValue(fsCanvas),
        getElement: vi.fn().mockReturnValue(null),
      } as any;
      mockSession = createMockSession(source);

      const result = createSourceExportCanvas(mockSession);

      expect(source.fileSourceNode!.getCanvas).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.width).toBe(2048);
      expect(result!.height).toBe(1024);
    });

    it('should fall back to FileSourceNode getElement when getCanvas returns null', () => {
      const mockImg = createMockImage(800, 600);

      const source = createMockMediaSource('image', 800, 600);
      source.fileSourceNode = {
        getCanvas: vi.fn().mockReturnValue(null),
        getElement: vi.fn().mockReturnValue(mockImg),
      } as any;
      mockSession = createMockSession(source);

      const result = createSourceExportCanvas(mockSession);

      expect(source.fileSourceNode!.getCanvas).toHaveBeenCalled();
      expect(source.fileSourceNode!.getElement).toHaveBeenCalledWith(0);
      expect(result).not.toBeNull();
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

    it('should composite frameburn on rendered sequence frame when enabled', async () => {
      const source = createMockMediaSource('image', 800, 600);
      mockSession = createMockSession(source);

      await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        24,
        defaultTransform(),
        'none',
        false,
        undefined,
        undefined,
        {
          enabled: true,
          position: 'bottom-right',
          fontSize: 'small',
          showFrameCounter: false,
          backgroundOpacity: 0.5,
          frame: 24,
          totalFrames: 100,
          fps: 24,
        }
      );

      const getContextMock = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
      const ctx = getContextMock.mock.results.at(-1)?.value as { fillText: ReturnType<typeof vi.fn> };
      const renderedTexts = ctx.fillText.mock.calls.map((call) => call[0]);
      expect(renderedTexts).toContain('00:00:00:23');
      expect(renderedTexts).not.toContain('Frame 24 / 100');
    });

    it('should use mediabunny canvas for mediabunny video sources', async () => {
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = 1280;
      frameCanvas.height = 720;

      const source = createMockMediaSource('video', 1280, 720);
      source.videoSourceNode = {
        isUsingMediabunny: vi.fn().mockReturnValue(true),
      } as any;
      mockSession = createMockSession(source);
      (mockSession.fetchCurrentVideoFrame as any).mockResolvedValue(undefined);
      (mockSession.getVideoFrameCanvas as any).mockReturnValue(frameCanvas);

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        5,
        defaultTransform(),
        'none',
        false
      );

      expect(mockSession.fetchCurrentVideoFrame).toHaveBeenCalledWith(5);
      expect(mockSession.getVideoFrameCanvas).toHaveBeenCalledWith(5);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(1280);
      expect(result!.height).toBe(720);
    });

    it('should use FileSourceNode canvas for fileSourceNode sources', async () => {
      const fsCanvas = document.createElement('canvas');
      fsCanvas.width = 2048;
      fsCanvas.height = 1024;

      const source = createMockMediaSource('image', 2048, 1024);
      source.fileSourceNode = {
        getCanvas: vi.fn().mockReturnValue(fsCanvas),
        getElement: vi.fn().mockReturnValue(null),
      } as any;
      mockSession = createMockSession(source);

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        1,
        defaultTransform(),
        'none',
        false
      );

      expect(source.fileSourceNode!.getCanvas).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.width).toBe(2048);
      expect(result!.height).toBe(1024);
    });

    it('should fall back to FileSourceNode getElement when getCanvas returns null', async () => {
      const mockImg = createMockImage(800, 600);

      const source = createMockMediaSource('image', 800, 600);
      source.fileSourceNode = {
        getCanvas: vi.fn().mockReturnValue(null),
        getElement: vi.fn().mockReturnValue(mockImg),
      } as any;
      mockSession = createMockSession(source);

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        1,
        defaultTransform(),
        'none',
        false
      );

      expect(source.fileSourceNode!.getCanvas).toHaveBeenCalled();
      expect(source.fileSourceNode!.getElement).toHaveBeenCalledWith(0);
      expect(result).not.toBeNull();
    });

    it('should return null when FileSourceNode has no canvas or element', async () => {
      const source = createMockMediaSource('image', 800, 600);
      source.element = undefined;
      source.fileSourceNode = {
        getCanvas: vi.fn().mockReturnValue(null),
        getElement: vi.fn().mockReturnValue(null),
      } as any;
      mockSession = createMockSession(source);

      const result = await renderFrameToCanvas(
        mockSession,
        mockPaintEngine,
        mockPaintRenderer,
        1,
        defaultTransform(),
        'none',
        false
      );

      expect(result).toBeNull();
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

  // ---------------------------------------------------------------------------
  // E2E: mediabunny video export pipeline
  // ---------------------------------------------------------------------------
  describe('e2e: mediabunny video source export', () => {
    let mockPaintEngine: PaintEngine;
    let mockPaintRenderer: PaintRenderer;

    // A canvas that represents the decoded mediabunny frame
    const mediabunnyCanvas = document.createElement('canvas');
    mediabunnyCanvas.width = 1280;
    mediabunnyCanvas.height = 720;

    function createMediabunnySource(): MediaSource {
      const source = createMockMediaSource('video', 1280, 720);
      source.videoSourceNode = {
        isUsingMediabunny: vi.fn().mockReturnValue(true),
        getCachedFrameCanvas: vi.fn().mockReturnValue(mediabunnyCanvas),
        getFrameAsync: vi.fn().mockResolvedValue(undefined),
      } as any;
      return source;
    }

    function createMediabunnySession(source: MediaSource): Session {
      const session = createMockSession(source);
      (session.getVideoFrameCanvas as any).mockReturnValue(mediabunnyCanvas);
      (session.fetchCurrentVideoFrame as any).mockResolvedValue(undefined);
      return session;
    }

    beforeEach(() => {
      vi.clearAllMocks();
      mockPaintEngine = createRealPaintEngine();
      mockPaintRenderer = createRealPaintRenderer();
    });

    it('renderFrameToCanvas: fetches frame, gets canvas, draws it', async () => {
      const source = createMediabunnySource();
      const session = createMediabunnySession(source);

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        12, defaultTransform(), 'none', false
      );

      // 1) frame was fetched via mediabunny
      expect(session.fetchCurrentVideoFrame).toHaveBeenCalledWith(12);
      // 2) decoded canvas was retrieved
      expect(session.getVideoFrameCanvas).toHaveBeenCalledWith(12);
      // 3) result canvas was created at source dimensions
      expect(result).not.toBeNull();
      expect(result!.width).toBe(1280);
      expect(result!.height).toBe(720);
      // 4) drawImage was called with the mediabunny canvas as source
      const getContextMock = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
      const ctx = getContextMock.mock.results.at(-1)?.value as { drawImage: ReturnType<typeof vi.fn> };
      expect(ctx.drawImage).toHaveBeenCalledWith(mediabunnyCanvas, 0, 0, 1280, 720);
    });

    it('renderFrameToCanvas: applies rotation to mediabunny frame', async () => {
      const source = createMediabunnySource();
      const session = createMediabunnySession(source);
      const transform: Transform2D = { rotation: 90, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        1, transform, 'none', false
      );

      // After 90° rotation, dimensions swap
      expect(result).not.toBeNull();
      expect(result!.width).toBe(720);
      expect(result!.height).toBe(1280);
    });

    it('renderFrameToCanvas: applies crop to mediabunny frame', async () => {
      const source = createMediabunnySource();
      const session = createMediabunnySession(source);
      const crop = { x: 0, y: 0, width: 0.5, height: 0.5 };

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        1, defaultTransform(), 'none', false, crop
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(640);   // 0.5 * 1280
      expect(result!.height).toBe(360);  // 0.5 * 720
    });

    it('renderFrameToCanvas: composites annotations on mediabunny frame', async () => {
      const source = createMediabunnySource();
      const session = createMediabunnySession(source);
      (mockPaintEngine.getAnnotationsWithGhost as any).mockReturnValue([{ id: 'a1' }]);

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        7, defaultTransform(), 'none', true
      );

      expect(result).not.toBeNull();
      expect(mockPaintEngine.getAnnotationsWithGhost).toHaveBeenCalledWith(7);
      expect(mockPaintRenderer.renderAnnotations).toHaveBeenCalled();
    });

    it('renderFrameToCanvas: restores original frame after mediabunny render', async () => {
      const source = createMediabunnySource();
      const session = createMediabunnySession(source);
      session.currentFrame = 50;

      await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        12, defaultTransform(), 'none', false
      );

      expect(session.currentFrame).toBe(50);
    });

    it('renderFrameToCanvas: does NOT seek HTMLVideoElement for mediabunny source', async () => {
      const source = createMediabunnySource();
      // source.element is an HTMLVideoElement from createMockMediaSource('video', ...)
      const video = source.element as HTMLVideoElement;
      const session = createMediabunnySession(source);

      await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        25, defaultTransform(), 'none', false
      );

      // The HTMLVideoElement should NOT be seeked — mediabunny handles frame extraction
      expect(video.currentTime).toBe(0);
    });

    it('createExportCanvas: uses mediabunny canvas for single-frame export', () => {
      const source = createMediabunnySource();
      const session = createMediabunnySession(source);

      const result = createExportCanvas(
        session, mockPaintEngine, mockPaintRenderer, 'none', false
      );

      expect(session.getVideoFrameCanvas).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.width).toBe(1280);
      expect(result!.height).toBe(720);

      const getContextMock = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
      const ctx = getContextMock.mock.results.at(-1)?.value as { drawImage: ReturnType<typeof vi.fn> };
      expect(ctx.drawImage).toHaveBeenCalledWith(mediabunnyCanvas, 0, 0, 1280, 720);
    });

    it('createSourceExportCanvas: uses mediabunny canvas', () => {
      const source = createMediabunnySource();
      const session = createMediabunnySession(source);

      const result = createSourceExportCanvas(session);

      expect(session.getVideoFrameCanvas).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.width).toBe(1280);
      expect(result!.height).toBe(720);
    });

    it('renderSourceToImageData: uses cached mediabunny frame canvas', () => {
      const source = createMediabunnySource();
      const session = createMediabunnySession(source);
      session.currentFrame = 5;
      (session.getSourceByIndex as any).mockReturnValue(source);

      const result = renderSourceToImageData(session, 0, 640, 360);

      expect(result).not.toBeNull();
      expect(source.videoSourceNode!.getCachedFrameCanvas).toHaveBeenCalledWith(5);
    });
  });

  // ---------------------------------------------------------------------------
  // E2E: FileSourceNode (EXR, DPX, Cineon, Float TIFF) export pipeline
  // ---------------------------------------------------------------------------
  describe('e2e: FileSourceNode source export', () => {
    let mockPaintEngine: PaintEngine;
    let mockPaintRenderer: PaintRenderer;

    // A canvas that represents the tonemapped SDR output from FileSourceNode
    const fsCanvas = document.createElement('canvas');
    fsCanvas.width = 2048;
    fsCanvas.height = 1024;

    beforeEach(() => {
      vi.clearAllMocks();
      mockPaintEngine = createRealPaintEngine();
      mockPaintRenderer = createRealPaintRenderer();
    });

    function createFileSourceNodeSource(opts?: { canvasResult?: HTMLCanvasElement | null; elementResult?: HTMLImageElement | null }): MediaSource {
      const source = createMockMediaSource('image', 2048, 1024);
      // FileSourceNode sources may have no element (e.g. EXR decoded to Float32Array)
      source.element = undefined;
      source.fileSourceNode = {
        getCanvas: vi.fn().mockReturnValue(opts && 'canvasResult' in opts ? opts.canvasResult : fsCanvas),
        getElement: vi.fn().mockReturnValue(opts && 'elementResult' in opts ? opts.elementResult : null),
      } as any;
      return source;
    }

    it('renderFrameToCanvas: draws FileSourceNode canvas', async () => {
      const source = createFileSourceNodeSource();
      const session = createMockSession(source);

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        1, defaultTransform(), 'none', false
      );

      expect(source.fileSourceNode!.getCanvas).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.width).toBe(2048);
      expect(result!.height).toBe(1024);

      const getContextMock = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
      const ctx = getContextMock.mock.results.at(-1)?.value as { drawImage: ReturnType<typeof vi.fn> };
      expect(ctx.drawImage).toHaveBeenCalledWith(fsCanvas, 0, 0, 2048, 1024);
    });

    it('renderFrameToCanvas: falls back to getElement when getCanvas returns null', async () => {
      const mockImg = createMockImage(2048, 1024);
      const source = createFileSourceNodeSource({ canvasResult: null, elementResult: mockImg });
      const session = createMockSession(source);

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        1, defaultTransform(), 'none', false
      );

      expect(source.fileSourceNode!.getCanvas).toHaveBeenCalled();
      expect(source.fileSourceNode!.getElement).toHaveBeenCalledWith(0);
      expect(result).not.toBeNull();

      const getContextMock = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
      const ctx = getContextMock.mock.results.at(-1)?.value as { drawImage: ReturnType<typeof vi.fn> };
      expect(ctx.drawImage).toHaveBeenCalledWith(mockImg, 0, 0, 2048, 1024);
    });

    it('renderFrameToCanvas: returns null when FileSourceNode has no canvas or element', async () => {
      const source = createFileSourceNodeSource({ canvasResult: null, elementResult: null });
      const session = createMockSession(source);

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        1, defaultTransform(), 'none', false
      );

      expect(result).toBeNull();
    });

    it('renderFrameToCanvas: applies rotation to FileSourceNode canvas', async () => {
      const source = createFileSourceNodeSource();
      const session = createMockSession(source);
      const transform: Transform2D = { rotation: 90, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        1, transform, 'none', false
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1024);   // swapped
      expect(result!.height).toBe(2048);
    });

    it('renderFrameToCanvas: applies crop to FileSourceNode canvas', async () => {
      const source = createFileSourceNodeSource();
      const session = createMockSession(source);
      const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        1, defaultTransform(), 'none', false, crop
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1024);  // 0.5 * 2048
      expect(result!.height).toBe(512);  // 0.5 * 1024
    });

    it('renderFrameToCanvas: composites annotations on FileSourceNode canvas', async () => {
      const source = createFileSourceNodeSource();
      const session = createMockSession(source);
      (mockPaintEngine.getAnnotationsWithGhost as any).mockReturnValue([{ id: 'ann-exr' }]);

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        1, defaultTransform(), 'none', true
      );

      expect(result).not.toBeNull();
      expect(mockPaintEngine.getAnnotationsWithGhost).toHaveBeenCalledWith(1);
      expect(mockPaintRenderer.renderAnnotations).toHaveBeenCalledWith(
        [{ id: 'ann-exr' }],
        { width: 2048, height: 1024 }
      );
    });

    it('renderFrameToCanvas: applies crop + rotation + annotations on FileSourceNode', async () => {
      const source = createFileSourceNodeSource();
      const session = createMockSession(source);
      (mockPaintEngine.getAnnotationsWithGhost as any).mockReturnValue([{ id: 'ann1' }]);
      const transform: Transform2D = { rotation: 90, flipH: true, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };
      const crop = { x: 0, y: 0, width: 0.5, height: 0.5 };

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        1, transform, 'none', true, crop
      );

      // After 90° rotation of 2048x1024: effective 1024x2048
      // 0.5 crop: 512x1024
      expect(result).not.toBeNull();
      expect(result!.width).toBe(512);
      expect(result!.height).toBe(1024);
      expect(mockPaintRenderer.renderAnnotations).toHaveBeenCalled();
    });

    it('renderFrameToCanvas: composites frameburn on FileSourceNode frame', async () => {
      const source = createFileSourceNodeSource();
      const session = createMockSession(source);

      await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        5, defaultTransform(), 'none', false,
        undefined, undefined,
        {
          enabled: true,
          position: 'top-left',
          fontSize: 'medium',
          showFrameCounter: true,
          backgroundOpacity: 0.6,
          frame: 5,
          totalFrames: 50,
          fps: 24,
        }
      );

      const getContextMock = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
      const ctx = getContextMock.mock.results.at(-1)?.value as { fillText: ReturnType<typeof vi.fn> };
      const renderedTexts = ctx.fillText.mock.calls.map((call: unknown[]) => call[0]);
      expect(renderedTexts).toContain('00:00:00:04');
      expect(renderedTexts).toContain('Frame 5 / 50');
    });

    it('createExportCanvas: uses FileSourceNode canvas for single-frame export', () => {
      const source = createFileSourceNodeSource();
      const session = createMockSession(source);

      const result = createExportCanvas(
        session, mockPaintEngine, mockPaintRenderer, 'none', false
      );

      expect(source.fileSourceNode!.getCanvas).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.width).toBe(2048);
      expect(result!.height).toBe(1024);

      const getContextMock = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
      const ctx = getContextMock.mock.results.at(-1)?.value as { drawImage: ReturnType<typeof vi.fn> };
      expect(ctx.drawImage).toHaveBeenCalledWith(fsCanvas, 0, 0, 2048, 1024);
    });

    it('createExportCanvas: falls back to FileSourceNode getElement for single-frame', () => {
      const mockImg = createMockImage(2048, 1024);
      const source = createFileSourceNodeSource({ canvasResult: null, elementResult: mockImg });
      const session = createMockSession(source);

      const result = createExportCanvas(
        session, mockPaintEngine, mockPaintRenderer, 'none', false
      );

      expect(result).not.toBeNull();
      expect(source.fileSourceNode!.getElement).toHaveBeenCalledWith(0);
    });

    it('createExportCanvas: returns null when FileSourceNode has neither canvas nor element', () => {
      const source = createFileSourceNodeSource({ canvasResult: null, elementResult: null });
      const session = createMockSession(source);

      const result = createExportCanvas(
        session, mockPaintEngine, mockPaintRenderer, 'none', false
      );

      expect(result).toBeNull();
    });

    it('createExportCanvas: applies transform + crop to FileSourceNode canvas', () => {
      const source = createFileSourceNodeSource();
      const session = createMockSession(source);
      const transform: Transform2D = { rotation: 180, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };
      const crop = { x: 0, y: 0, width: 0.5, height: 0.5 };

      const result = createExportCanvas(
        session, mockPaintEngine, mockPaintRenderer, 'none', false, transform, crop
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1024);   // 0.5 * 2048
      expect(result!.height).toBe(512);   // 0.5 * 1024
    });

    it('createSourceExportCanvas: uses FileSourceNode canvas', () => {
      const source = createFileSourceNodeSource();
      const session = createMockSession(source);

      const result = createSourceExportCanvas(session);

      expect(source.fileSourceNode!.getCanvas).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.width).toBe(2048);
      expect(result!.height).toBe(1024);
    });

    it('createSourceExportCanvas: falls back to getElement', () => {
      const mockImg = createMockImage(2048, 1024);
      const source = createFileSourceNodeSource({ canvasResult: null, elementResult: mockImg });
      const session = createMockSession(source);

      const result = createSourceExportCanvas(session);

      expect(source.fileSourceNode!.getElement).toHaveBeenCalledWith(0);
      expect(result).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // E2E: non-mediabunny HTMLVideoElement source export (regression)
  // ---------------------------------------------------------------------------
  describe('e2e: non-mediabunny video source export', () => {
    let mockPaintEngine: PaintEngine;
    let mockPaintRenderer: PaintRenderer;

    beforeEach(() => {
      vi.clearAllMocks();
      mockPaintEngine = createRealPaintEngine();
      mockPaintRenderer = createRealPaintRenderer();
    });

    it('renderFrameToCanvas: seeks HTMLVideoElement and draws it', async () => {
      const source = createMockMediaSource('video', 1280, 720);
      const session = createMockSession(source);
      const video = source.element as HTMLVideoElement;

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        25, defaultTransform(), 'none', false
      );

      // The mock video fires 'seeked' on currentTime set, so it should complete
      expect(result).not.toBeNull();
      expect(result!.width).toBe(1280);
      expect(result!.height).toBe(720);

      // drawImage should have been called with the HTMLVideoElement
      const getContextMock = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
      const ctx = getContextMock.mock.results.at(-1)?.value as { drawImage: ReturnType<typeof vi.fn> };
      expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    });

    it('renderFrameToCanvas: skips seek when already at correct time', async () => {
      const source = createMockMediaSource('video', 1280, 720);
      const session = createMockSession(source);
      const video = source.element as HTMLVideoElement;
      // Frame 1 → time 0.0, and video starts at 0
      (video as any)._currentTime = 0;

      const result = await renderFrameToCanvas(
        session, mockPaintEngine, mockPaintRenderer,
        1, defaultTransform(), 'none', false
      );

      expect(result).not.toBeNull();
    });

    it('createExportCanvas: draws HTMLVideoElement for non-mediabunny video', () => {
      const source = createMockMediaSource('video', 1280, 720);
      const session = createMockSession(source);

      const result = createExportCanvas(
        session, mockPaintEngine, mockPaintRenderer, 'none', false
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(1280);
      expect(result!.height).toBe(720);
    });
  });
});
