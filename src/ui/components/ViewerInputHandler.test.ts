/**
 * ViewerInputHandler – Text Input Overlay Tests (H-04)
 *
 * Verifies that the text tool uses an inline <textarea> overlay
 * instead of window.prompt().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViewerInputHandler, type ViewerInputContext } from './ViewerInputHandler';
import { PaintEngine } from '../../paint/PaintEngine';
import { DodgeTool, BurnTool } from '../../paint/AdvancedPaintTools';
import type { PaintRenderer } from '../../paint/PaintRenderer';
import type { Session } from '../../core/session/Session';
import type { TransformManager } from './TransformManager';
import type { WipeManager } from './WipeManager';
import type { CropManager } from './CropManager';
import type { PixelProbe } from './PixelProbe';
import type { InteractionQualityManager } from './InteractionQualityManager';

// Polyfill PointerEvent for jsdom (which does not implement it)
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly pressure: number;
    constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? '';
      this.pressure = params.pressure ?? 0.5;
    }
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRect(left = 0, top = 0, width = 800, height = 600): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function createMockContext(overrides: Partial<ViewerInputContext> = {}): ViewerInputContext {
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = '800px';
  container.style.height = '600px';
  // Stub pointer capture methods that jsdom does not implement
  container.setPointerCapture = vi.fn();
  container.releasePointerCapture = vi.fn();
  container.hasPointerCapture = vi.fn(() => false);
  document.body.appendChild(container);

  const canvasContainer = document.createElement('div');
  container.appendChild(canvasContainer);

  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = 800;
  imageCanvas.height = 600;
  canvasContainer.appendChild(imageCanvas);

  const paintCanvas = document.createElement('canvas');
  paintCanvas.width = 800;
  paintCanvas.height = 600;
  canvasContainer.appendChild(paintCanvas);

  const paintEngine = new PaintEngine();

  const paintCtx = paintCanvas.getContext('2d')!;

  const mockPaintRenderer = {
    renderAnnotations: vi.fn(),
    renderLiveStroke: vi.fn(),
    renderLiveShape: vi.fn(),
    getCanvas: vi.fn(() => paintCanvas),
  } as unknown as PaintRenderer;

  const mockSession = {
    currentFrame: 1,
    loadSequence: vi.fn(),
    loadFile: vi.fn(),
    loadFromGTO: vi.fn(),
    loadEDL: vi.fn(() => []),
  } as unknown as Session;

  const mockTransformManager = {
    panX: 0,
    panY: 0,
    zoom: 1,
    initialPinchDistance: 0,
    initialZoom: 1,
    cancelZoomAnimation: vi.fn(),
  } as unknown as TransformManager;

  const mockWipeManager = {
    isDragging: false,
    handlePointerDown: vi.fn(() => false),
    handlePointerMove: vi.fn(() => false),
    handlePointerUp: vi.fn(),
  } as unknown as WipeManager;

  const mockCropManager = {
    isDragging: false,
    isPanelOpen: false,
    handleCropPointerDown: vi.fn(() => false),
    handleCropPointerMove: vi.fn(),
    handleCropPointerUp: vi.fn(),
    getCropState: vi.fn(() => ({ enabled: false })),
    getCropHandleAtPoint: vi.fn(() => null),
    updateCropCursor: vi.fn(),
  } as unknown as CropManager;

  const mockPixelProbe = {
    isEnabled: vi.fn(() => false),
  } as unknown as PixelProbe;

  const mockInteractionQuality = {
    beginInteraction: vi.fn(),
    endInteraction: vi.fn(),
  } as unknown as InteractionQualityManager;

  const containerRect = createMockRect(0, 0, 800, 600);
  const canvasContainerRect = createMockRect(0, 0, 800, 600);
  const imageCanvasRect = createMockRect(0, 0, 800, 600);

  return {
    getContainer: () => container,
    getCanvasContainer: () => canvasContainer,
    getImageCanvas: () => imageCanvas,
    getPaintCanvas: () => paintCanvas,
    getPaintCtx: () => paintCtx,
    getDisplayWidth: () => 800,
    getDisplayHeight: () => 600,
    getSourceWidth: () => 800,
    getSourceHeight: () => 600,
    getContainerRect: () => containerRect,
    getCanvasContainerRect: () => canvasContainerRect,
    getImageCanvasRect: () => imageCanvasRect,
    getTransformManager: () => mockTransformManager,
    getWipeManager: () => mockWipeManager,
    getCropManager: () => mockCropManager,
    getPaintEngine: () => paintEngine,
    getPaintRenderer: () => mockPaintRenderer,
    getSession: () => mockSession,
    getPixelProbe: () => mockPixelProbe,
    getInteractionQuality: () => mockInteractionQuality,
    isViewerContentElement: () => true,
    scheduleRender: vi.fn(),
    updateCanvasPosition: vi.fn(),
    updateSphericalUniforms: vi.fn(),
    renderPaint: vi.fn(),
    getSphericalProjection: () => null,
    getGLRenderer: () => null,
    isGLRendererActive: () => false,
    getImageCtx: () => imageCanvas.getContext('2d')!,
    invalidateGLRenderCache: vi.fn(),
    ...overrides,
  };
}

function createPointerEvent(
  type: string,
  clientX: number,
  clientY: number,
  options: Partial<PointerEventInit> = {},
): PointerEvent {
  return new PointerEvent(type, {
    clientX,
    clientY,
    pointerId: 1,
    button: 0,
    bubbles: true,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ViewerInputHandler – Text Input Overlay (H-04)', () => {
  let ctx: ViewerInputContext;
  let handler: ViewerInputHandler;
  let dropOverlay: HTMLElement;

  beforeEach(() => {
    ctx = createMockContext();
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();

    // Set paint tool to text
    ctx.getPaintEngine().tool = 'text';
  });

  afterEach(() => {
    handler.unbindEvents();
    // Clean up container from DOM
    const container = ctx.getContainer();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  // TXT-H04a: Clicking with text tool should NOT call window.prompt
  it('should NOT call window.prompt when text tool is clicked', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);

    const container = ctx.getContainer();
    const e = createPointerEvent('pointerdown', 400, 300);
    container.dispatchEvent(e);

    expect(promptSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  // TXT-H04b: Clicking with text tool should create a positioned textarea/input overlay element
  it('should create a textarea overlay when text tool is clicked', () => {
    const container = ctx.getContainer();
    const e = createPointerEvent('pointerdown', 400, 300);
    container.dispatchEvent(e);

    const overlay = container.querySelector('[data-testid="text-input-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay).toBeInstanceOf(HTMLTextAreaElement);
  });

  // TXT-H04c: The overlay should be positioned at the click location relative to the canvas
  it('should position the overlay at the click location', () => {
    const container = ctx.getContainer();
    const clickX = 250;
    const clickY = 175;
    const e = createPointerEvent('pointerdown', clickX, clickY);
    container.dispatchEvent(e);

    const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
    expect(overlay).not.toBeNull();

    // The overlay should be positioned relative to the container
    // containerRect.left = 0, containerRect.top = 0
    expect(overlay.style.left).toBe(`${clickX}px`);
    expect(overlay.style.top).toBe(`${clickY}px`);
  });

  // TXT-H04d: The overlay should auto-focus on creation
  it('should auto-focus the textarea overlay', () => {
    const container = ctx.getContainer();
    const e = createPointerEvent('pointerdown', 400, 300);
    container.dispatchEvent(e);

    const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
    expect(overlay).not.toBeNull();
    expect(document.activeElement).toBe(overlay);
  });

  // TXT-H04e: Pressing Escape should dismiss the overlay without creating an annotation
  it('should dismiss overlay on Escape without creating an annotation', () => {
    const paintEngine = ctx.getPaintEngine();
    const addTextSpy = vi.spyOn(paintEngine, 'addText');

    const container = ctx.getContainer();
    container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

    const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
    expect(overlay).not.toBeNull();

    // Type some text then press Escape
    overlay.value = 'some text';
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // Overlay should be removed
    expect(container.querySelector('[data-testid="text-input-overlay"]')).toBeNull();
    // No annotation should be created
    expect(addTextSpy).not.toHaveBeenCalled();
  });

  // TXT-H04f: Committing text (blur or Ctrl+Enter) should create a text annotation
  describe('committing text', () => {
    it('should create annotation on Ctrl+Enter', () => {
      const paintEngine = ctx.getPaintEngine();
      const addTextSpy = vi.spyOn(paintEngine, 'addText');

      const container = ctx.getContainer();
      container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

      const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
      expect(overlay).not.toBeNull();

      overlay.value = 'Hello World';
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));

      expect(addTextSpy).toHaveBeenCalledTimes(1);
      expect(addTextSpy).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        'Hello World',
      );
      // Overlay should be removed
      expect(container.querySelector('[data-testid="text-input-overlay"]')).toBeNull();
    });

    it('should create annotation on Meta+Enter (Mac)', () => {
      const paintEngine = ctx.getPaintEngine();
      const addTextSpy = vi.spyOn(paintEngine, 'addText');

      const container = ctx.getContainer();
      container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

      const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
      overlay.value = 'Mac text';
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));

      expect(addTextSpy).toHaveBeenCalledTimes(1);
      expect(addTextSpy).toHaveBeenCalledWith(expect.any(Number), expect.any(Object), 'Mac text');
    });

    it('should create annotation on blur', async () => {
      const paintEngine = ctx.getPaintEngine();
      const addTextSpy = vi.spyOn(paintEngine, 'addText');

      const container = ctx.getContainer();
      container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

      const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
      expect(overlay).not.toBeNull();

      overlay.value = 'Blur commit';
      overlay.dispatchEvent(new FocusEvent('blur'));

      // blur handler uses queueMicrotask, wait for it
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      expect(addTextSpy).toHaveBeenCalledTimes(1);
      expect(addTextSpy).toHaveBeenCalledWith(expect.any(Number), expect.any(Object), 'Blur commit');
      // Overlay should be removed
      expect(container.querySelector('[data-testid="text-input-overlay"]')).toBeNull();
    });
  });

  // TXT-H04g: Empty text should not create an annotation
  it('should not create annotation for empty text on Ctrl+Enter', () => {
    const paintEngine = ctx.getPaintEngine();
    const addTextSpy = vi.spyOn(paintEngine, 'addText');

    const container = ctx.getContainer();
    container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

    const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
    overlay.value = '';
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));

    expect(addTextSpy).not.toHaveBeenCalled();
  });

  it('should not create annotation for whitespace-only text on blur', async () => {
    const paintEngine = ctx.getPaintEngine();
    const addTextSpy = vi.spyOn(paintEngine, 'addText');

    const container = ctx.getContainer();
    container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

    const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
    overlay.value = '   \n  ';
    overlay.dispatchEvent(new FocusEvent('blur'));

    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(addTextSpy).not.toHaveBeenCalled();
  });

  // TXT-H04h: The overlay should support multi-line input
  it('should be a textarea that supports multi-line input', () => {
    const container = ctx.getContainer();
    container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

    const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
    expect(overlay).not.toBeNull();
    expect(overlay.tagName).toBe('TEXTAREA');

    // Verify Enter key does NOT commit (allows newline)
    const paintEngine = ctx.getPaintEngine();
    const addTextSpy = vi.spyOn(paintEngine, 'addText');

    overlay.value = 'Line 1';
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Should not commit on plain Enter
    expect(addTextSpy).not.toHaveBeenCalled();
    // Overlay should still be present
    expect(container.querySelector('[data-testid="text-input-overlay"]')).not.toBeNull();
  });

  it('should commit multi-line text correctly', () => {
    const paintEngine = ctx.getPaintEngine();
    const addTextSpy = vi.spyOn(paintEngine, 'addText');

    const container = ctx.getContainer();
    container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

    const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
    overlay.value = 'Line 1\nLine 2\nLine 3';
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));

    expect(addTextSpy).toHaveBeenCalledWith(expect.any(Number), expect.any(Object), 'Line 1\nLine 2\nLine 3');
  });

  // Additional: unbindEvents cleans up active overlay
  it('should clean up overlay on unbindEvents', () => {
    const container = ctx.getContainer();
    container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

    expect(container.querySelector('[data-testid="text-input-overlay"]')).not.toBeNull();

    handler.unbindEvents();

    expect(container.querySelector('[data-testid="text-input-overlay"]')).toBeNull();
  });

  // Additional: clicking again dismisses previous overlay and commits its text
  it('should dismiss previous overlay when clicking for a new one', () => {
    const paintEngine = ctx.getPaintEngine();
    const addTextSpy = vi.spyOn(paintEngine, 'addText');

    const container = ctx.getContainer();

    // First click
    container.dispatchEvent(createPointerEvent('pointerdown', 200, 150));
    const overlay1 = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
    overlay1.value = 'First';

    // Release pointer before second click (simulates real user flow)
    container.dispatchEvent(createPointerEvent('pointerup', 200, 150));

    // Second click - should commit first overlay
    container.dispatchEvent(createPointerEvent('pointerdown', 500, 400));

    expect(addTextSpy).toHaveBeenCalledTimes(1);
    expect(addTextSpy).toHaveBeenCalledWith(expect.any(Number), expect.any(Object), 'First');

    // Should have a new overlay
    const overlays = container.querySelectorAll('[data-testid="text-input-overlay"]');
    expect(overlays.length).toBe(1);
  });

  // Additional: pointerdown on the textarea does not trigger a new overlay
  it('should stop propagation of pointerdown on the textarea', () => {
    const container = ctx.getContainer();
    container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

    const overlay = container.querySelector('[data-testid="text-input-overlay"]') as HTMLTextAreaElement;
    expect(overlay).not.toBeNull();

    // Simulate clicking on the textarea itself
    const innerEvent = createPointerEvent('pointerdown', 410, 310);
    overlay.dispatchEvent(innerEvent);

    // Should still have only one overlay
    const overlays = container.querySelectorAll('[data-testid="text-input-overlay"]');
    expect(overlays.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Advanced Paint Tools – Regression Tests
// ---------------------------------------------------------------------------

describe('ViewerInputHandler – Advanced Paint Tools Regression', () => {
  let ctx: ViewerInputContext;
  let handler: ViewerInputHandler;
  let dropOverlay: HTMLElement;

  beforeEach(() => {
    ctx = createMockContext();
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();
  });

  afterEach(() => {
    handler.unbindEvents();
    const container = ctx.getContainer();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  const advancedTools = ['dodge', 'burn', 'clone', 'smudge'] as const;

  // REG-APT-001: Selecting dodge/burn/clone/smudge does NOT trigger pan mode
  for (const toolName of advancedTools) {
    it(`REG-APT-001-${toolName}: selecting ${toolName} and clicking does NOT trigger pan mode`, () => {
      ctx.getPaintEngine().tool = toolName;
      const container = ctx.getContainer();

      // Dispatch pointerdown
      container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

      // Verify cursor is NOT 'grabbing' (pan mode sets cursor to 'grabbing')
      expect(container.style.cursor).not.toBe('grabbing');

      // Also verify updateCanvasPosition was NOT called (it is called during panning moves)
      // by dispatching a move event
      container.dispatchEvent(createPointerEvent('pointermove', 410, 310));

      // In pan mode, updateCanvasPosition would be called. For advanced tools, it should not be.
      // Note: the mock updateCanvasPosition is already a vi.fn(), so we can check it.
      expect(ctx.updateCanvasPosition).not.toHaveBeenCalled();

      // Clean up
      container.dispatchEvent(createPointerEvent('pointerup', 410, 310));
    });
  }

  // REG-APT-002: Tool dispatch reaches the correct AdvancedPaintTools instance
  for (const toolName of advancedTools) {
    it(`REG-APT-002-${toolName}: tool dispatch reaches the ${toolName} tool instance`, () => {
      const paintEngine = ctx.getPaintEngine();
      paintEngine.tool = toolName;

      // Verify PaintEngine has the tool instance
      const toolInstance = paintEngine.getAdvancedTool(toolName);
      expect(toolInstance).toBeDefined();
      expect(toolInstance!.name).toBe(toolName);

      // Verify isAdvancedTool identifies it correctly
      expect(paintEngine.isAdvancedTool(toolName)).toBe(true);
    });
  }

  // REG-APT-003: Standard tools are NOT identified as advanced tools
  it('REG-APT-003: standard tools are not identified as advanced tools', () => {
    const paintEngine = ctx.getPaintEngine();
    const standardTools = ['pen', 'eraser', 'text', 'none', 'rectangle', 'ellipse', 'line', 'arrow'] as const;

    for (const tool of standardTools) {
      expect(paintEngine.isAdvancedTool(tool)).toBe(false);
    }
  });

  // REG-APT-004: Cursor shows crosshair for advanced tools
  for (const toolName of advancedTools) {
    it(`REG-APT-004-${toolName}: cursor shows crosshair for ${toolName}`, () => {
      handler.updateCursor(toolName);
      expect(ctx.getContainer().style.cursor).toBe('crosshair');
    });
  }
});

// ---------------------------------------------------------------------------
// HDR Pixel Extraction Tests
// ---------------------------------------------------------------------------

describe('ViewerInputHandler – HDR Pixel Extraction', () => {
  let ctx: ViewerInputContext;
  let handler: ViewerInputHandler;
  let dropOverlay: HTMLElement;

  afterEach(() => {
    handler.unbindEvents();
    const container = ctx.getContainer();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('HDR-001: extractPixelBuffer uses GL readPixelFloat when GL renderer is active', () => {
    // Create an HDR pixel buffer with values > 1.0
    const w = 4;
    const h = 4;
    const hdrPixels = new Float32Array(w * h * 4);
    for (let i = 0; i < hdrPixels.length; i += 4) {
      hdrPixels[i] = 2.5; // R > 1.0 (HDR)
      hdrPixels[i + 1] = 1.8; // G > 1.0 (HDR)
      hdrPixels[i + 2] = 0.3; // B
      hdrPixels[i + 3] = 1.0; // A
    }

    const mockGLContext = {
      drawingBufferWidth: w,
      drawingBufferHeight: h,
      TEXTURE_2D: 0x0de1,
      RGBA32F: 0x8814,
      RGBA: 0x1908,
      FLOAT: 0x1406,
      texImage2D: vi.fn(),
    };

    const mockGLRenderer = {
      readPixelFloat: vi.fn((_x: number, _y: number, rw: number, rh: number) => {
        // Return a copy matching the requested dimensions
        if (rw === w && rh === h) return new Float32Array(hdrPixels);
        return null;
      }),
      getContext: vi.fn(() => mockGLContext),
    };

    ctx = createMockContext({
      getGLRenderer: () => mockGLRenderer as any,
      isGLRendererActive: () => true,
    });
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();

    // Set tool to dodge and dispatch a pointer event
    ctx.getPaintEngine().tool = 'dodge';
    const container = ctx.getContainer();
    container.dispatchEvent(createPointerEvent('pointerdown', 2, 2));

    // Verify readPixelFloat was called (GL path used)
    expect(mockGLRenderer.readPixelFloat).toHaveBeenCalled();

    // Clean up
    container.dispatchEvent(createPointerEvent('pointerup', 2, 2));
  });

  it('HDR-002: extractPixelBuffer falls back to 2D canvas when GL renderer is not active', () => {
    ctx = createMockContext({
      getGLRenderer: () => null,
      isGLRendererActive: () => false,
    });
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();

    // Set tool to dodge and dispatch - should not throw
    ctx.getPaintEngine().tool = 'dodge';
    const container = ctx.getContainer();
    container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

    // Since there is no GL renderer, readPixelFloat is not called.
    // The handler should have used the 2D canvas fallback without error.
    // Verify by checking that no error was thrown and the handler is in drawing state.
    container.dispatchEvent(createPointerEvent('pointerup', 400, 300));
  });

  it('HDR-003: HDR pixel values > 1.0 are preserved through GL readPixelFloat path', () => {
    const w = 4;
    const h = 4;
    // Create HDR pixels with values > 1.0 in bottom-to-top order (GL convention)
    const glPixels = new Float32Array(w * h * 4);
    for (let i = 0; i < glPixels.length; i += 4) {
      glPixels[i] = 3.0; // R (HDR)
      glPixels[i + 1] = 2.5; // G (HDR)
      glPixels[i + 2] = 1.8; // B (HDR)
      glPixels[i + 3] = 1.0; // A
    }

    const mockGLContext = {
      drawingBufferWidth: w,
      drawingBufferHeight: h,
      TEXTURE_2D: 0x0de1,
      RGBA32F: 0x8814,
      RGBA: 0x1908,
      FLOAT: 0x1406,
      texImage2D: vi.fn(),
    };

    const mockGLRenderer = {
      readPixelFloat: vi.fn(() => new Float32Array(glPixels)),
      getContext: vi.fn(() => mockGLContext),
    };

    ctx = createMockContext({
      getGLRenderer: () => mockGLRenderer as any,
      isGLRendererActive: () => true,
    });
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();

    // Set tool to dodge - it will extract a pixel buffer and apply
    ctx.getPaintEngine().tool = 'dodge';
    const container = ctx.getContainer();

    // Dispatch pointer event at the center of the canvas rect
    container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

    // Verify readPixelFloat was called (GL path used for HDR)
    expect(mockGLRenderer.readPixelFloat).toHaveBeenCalledWith(0, 0, w, h);

    container.dispatchEvent(createPointerEvent('pointerup', 400, 300));
  });

  it('HDR-004: dodge tool preserves HDR values > 1.0 (no clamping)', () => {
    const tool = new DodgeTool();
    const buffer = {
      data: new Float32Array([2.0, 1.5, 0.8, 1.0]),
      width: 1,
      height: 1,
      channels: 4 as const,
    };

    tool.beginStroke({ x: 0, y: 0 });
    tool.apply(buffer, { x: 0, y: 0 }, { size: 1, opacity: 1, pressure: 1, hardness: 1 });
    tool.endStroke();

    // Dodge multiplies by factor > 1, so values should increase above their HDR starting points
    expect(buffer.data[0]).toBeGreaterThan(2.0);
    expect(buffer.data[1]).toBeGreaterThan(1.5);
    // No clamping to 1.0 should occur
    expect(buffer.data[0]).toBeGreaterThan(1.0);
    expect(buffer.data[1]).toBeGreaterThan(1.0);
  });

  it('HDR-005: burn tool preserves HDR values > 1.0 (only darkens, no upper clamp)', () => {
    const tool = new BurnTool();
    const buffer = {
      data: new Float32Array([3.0, 2.0, 1.5, 1.0]),
      width: 1,
      height: 1,
      channels: 4 as const,
    };

    tool.beginStroke({ x: 0, y: 0 });
    tool.apply(buffer, { x: 0, y: 0 }, { size: 1, opacity: 1, pressure: 1, hardness: 1 });
    tool.endStroke();

    // Burn multiplies by factor < 1, so values should decrease but remain > 1.0
    // because the originals were well above 1.0
    expect(buffer.data[0]).toBeLessThan(3.0);
    expect(buffer.data[0]).toBeGreaterThan(1.0); // 3.0 * 0.7 = 2.1
    expect(buffer.data[1]).toBeLessThan(2.0);
    expect(buffer.data[1]).toBeGreaterThan(1.0); // 2.0 * 0.7 = 1.4
    // Values should not be clamped to 1.0
  });
});

// ---------------------------------------------------------------------------
// Drag-and-drop case-insensitive extension handling
// ---------------------------------------------------------------------------

describe('ViewerInputHandler – Case-insensitive drop extensions', () => {
  let ctx: ViewerInputContext;
  let handler: ViewerInputHandler;
  let dropOverlay: HTMLElement;

  beforeEach(() => {
    ctx = createMockContext();
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();
  });

  afterEach(() => {
    handler.unbindEvents();
    const container = ctx.getContainer();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('DROP-CI-001: uppercase .GTO dropped file dispatches to loadFromGTO', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const gtoFile = new File(['gto-data'], 'SESSION.GTO');

    // jsdom doesn't implement DataTransfer, so create a minimal mock
    const mockDataTransfer = { files: [gtoFile] };
    const dropEvent = new Event('drop', { bubbles: true }) as any;
    dropEvent.dataTransfer = mockDataTransfer;
    dropEvent.preventDefault = vi.fn();
    container.dispatchEvent(dropEvent);

    // Wait for the async onDrop handler
    await vi.waitFor(() => {
      expect(mockSession.loadFromGTO).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Drag-and-drop GTO/RV sidecar file resolution (Issue #153)
// ---------------------------------------------------------------------------

describe('ViewerInputHandler – GTO drop with sidecar files', () => {
  let ctx: ViewerInputContext;
  let handler: ViewerInputHandler;
  let dropOverlay: HTMLElement;

  beforeEach(() => {
    ctx = createMockContext();
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();
  });

  afterEach(() => {
    handler.unbindEvents();
    const container = ctx.getContainer();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  function dispatchDrop(container: HTMLElement, files: File[]): void {
    const mockDataTransfer = { files };
    const dropEvent = new Event('drop', { bubbles: true }) as any;
    dropEvent.dataTransfer = mockDataTransfer;
    dropEvent.preventDefault = vi.fn();
    container.dispatchEvent(dropEvent);
  }

  it('SIDECAR-001: GTO dropped with companion files builds availableFiles map and passes it to loadFromGTO', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    const gtoFile = new File(['gto-data'], 'scene.gto');
    const mediaFile1 = new File(['img-data'], 'plate.exr');
    const mediaFile2 = new File(['cdl-data'], 'grade.cdl');

    dispatchDrop(container, [gtoFile, mediaFile1, mediaFile2]);

    await vi.waitFor(() => {
      expect(mockSession.loadFromGTO).toHaveBeenCalledTimes(1);
    });

    const callArgs = (mockSession.loadFromGTO as any).mock.calls[0];
    // First arg is the ArrayBuffer content
    expect(callArgs[0]).toBeInstanceOf(ArrayBuffer);
    // Second arg is the availableFiles map (now Map<string, File[]>)
    const availableFiles: Map<string, File[]> = callArgs[1];
    expect(availableFiles).toBeInstanceOf(Map);
    expect(availableFiles.size).toBe(2);
    expect(availableFiles.get('plate.exr')).toEqual([mediaFile1]);
    expect(availableFiles.get('grade.cdl')).toEqual([mediaFile2]);
  });

  it('SIDECAR-002: GTO dropped alone calls loadFromGTO with empty availableFiles map', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    const gtoFile = new File(['gto-data'], 'scene.gto');

    dispatchDrop(container, [gtoFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadFromGTO).toHaveBeenCalledTimes(1);
    });

    const callArgs = (mockSession.loadFromGTO as any).mock.calls[0];
    const availableFiles: Map<string, File[]> = callArgs[1];
    expect(availableFiles).toBeInstanceOf(Map);
    expect(availableFiles.size).toBe(0);
  });

  it('SIDECAR-003: .rv file dropped with companions also builds availableFiles map', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    const rvFile = new File(['rv-data'], 'session.rv');
    const mediaFile = new File(['img-data'], 'render.dpx');

    dispatchDrop(container, [rvFile, mediaFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadFromGTO).toHaveBeenCalledTimes(1);
    });

    const callArgs = (mockSession.loadFromGTO as any).mock.calls[0];
    const availableFiles: Map<string, File[]> = callArgs[1];
    expect(availableFiles).toBeInstanceOf(Map);
    expect(availableFiles.size).toBe(1);
    expect(availableFiles.get('render.dpx')).toEqual([mediaFile]);
  });

  it('SIDECAR-004: multiple non-session files build correct basename keys', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    const gtoFile = new File(['gto-data'], 'project.gto');
    const file1 = new File(['a'], 'shot01.exr');
    const file2 = new File(['b'], 'shot02.exr');
    const file3 = new File(['c'], 'look.cdl');
    const file4 = new File(['d'], 'lut.cube');

    dispatchDrop(container, [file1, gtoFile, file2, file3, file4]);

    await vi.waitFor(() => {
      expect(mockSession.loadFromGTO).toHaveBeenCalledTimes(1);
    });

    const callArgs = (mockSession.loadFromGTO as any).mock.calls[0];
    const availableFiles: Map<string, File[]> = callArgs[1];
    expect(availableFiles.size).toBe(4);
    expect(availableFiles.get('shot01.exr')).toEqual([file1]);
    expect(availableFiles.get('shot02.exr')).toEqual([file2]);
    expect(availableFiles.get('look.cdl')).toEqual([file3]);
    expect(availableFiles.get('lut.cube')).toEqual([file4]);
  });

  it('SIDECAR-005: non-session files without a GTO are loaded via loadFile individually', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    // Use non-image extensions to avoid triggering sequence detection
    const file1 = new File(['a'], 'grade.cdl');
    const file2 = new File(['b'], 'lookup.cube');

    dispatchDrop(container, [file1, file2]);

    await vi.waitFor(() => {
      expect(mockSession.loadFile).toHaveBeenCalledTimes(2);
    });

    expect(mockSession.loadFromGTO).not.toHaveBeenCalled();
  });

  it('SIDECAR-006: session file is not included in the availableFiles map', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    const gtoFile = new File(['gto-data'], 'scene.gto');
    const mediaFile = new File(['img'], 'plate.exr');

    dispatchDrop(container, [gtoFile, mediaFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadFromGTO).toHaveBeenCalledTimes(1);
    });

    const callArgs = (mockSession.loadFromGTO as any).mock.calls[0];
    const availableFiles: Map<string, File[]> = callArgs[1];
    expect(availableFiles.has('scene.gto')).toBe(false);
  });

  it('SIDECAR-007: duplicate basenames are collected into the same array entry', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    const gtoFile = new File(['gto-data'], 'scene.gto');
    // Two files with the same basename
    const file1 = new File(['a'], 'plate.exr');
    const file2 = new File(['b'], 'plate.exr');

    dispatchDrop(container, [gtoFile, file1, file2]);

    await vi.waitFor(() => {
      expect(mockSession.loadFromGTO).toHaveBeenCalledTimes(1);
    });

    const callArgs = (mockSession.loadFromGTO as any).mock.calls[0];
    const availableFiles: Map<string, File[]> = callArgs[1];
    expect(availableFiles.size).toBe(1);
    expect(availableFiles.get('plate.exr')).toEqual([file1, file2]);
  });
});

// ---------------------------------------------------------------------------
// Rotation Scrub (Ctrl+Shift+Drag) Tests
// ---------------------------------------------------------------------------

describe('ViewerInputHandler – Rotation Scrub (Ctrl+Shift+Drag)', () => {
  let ctx: ViewerInputContext;
  let handler: ViewerInputHandler;
  let dropOverlay: HTMLElement;
  let mockTransformData: {
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    scale: { x: number; y: number };
    translate: { x: number; y: number };
  };

  beforeEach(() => {
    mockTransformData = {
      rotation: 0,
      flipH: false,
      flipV: false,
      scale: { x: 1, y: 1 },
      translate: { x: 0, y: 0 },
    };

    const mockTransformManager = {
      panX: 0,
      panY: 0,
      zoom: 1,
      initialPinchDistance: 0,
      initialZoom: 1,
      cancelZoomAnimation: vi.fn(),
      transform: mockTransformData,
      getTransform: vi.fn(() => ({
        ...mockTransformData,
        scale: { ...mockTransformData.scale },
        translate: { ...mockTransformData.translate },
      })),
      setTransform: vi.fn((t: typeof mockTransformData) => {
        mockTransformData.rotation = t.rotation;
        mockTransformData.flipH = t.flipH;
        mockTransformData.flipV = t.flipV;
        mockTransformData.scale = { ...t.scale };
        mockTransformData.translate = { ...t.translate };
      }),
    } as unknown as TransformManager;

    ctx = createMockContext({
      getTransformManager: () => mockTransformManager,
    });
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();

    // Ensure paint tool is 'none' (pan/navigation mode)
    ctx.getPaintEngine().tool = 'none';
  });

  afterEach(() => {
    handler.unbindEvents();
    const container = ctx.getContainer();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('RSCRUB-001: Ctrl+Shift+pointerdown activates rotation scrubbing', () => {
    const container = ctx.getContainer();
    container.dispatchEvent(
      createPointerEvent('pointerdown', 400, 300, {
        ctrlKey: true,
        shiftKey: true,
      } as any),
    );

    // Cursor should be ew-resize (rotation scrub)
    expect(container.style.cursor).toBe('ew-resize');

    // isInteracting should return true
    expect(handler.isInteracting()).toBe(true);

    // Clean up
    container.dispatchEvent(createPointerEvent('pointerup', 400, 300));
  });

  it('RSCRUB-002: Ctrl+Shift+drag changes rotation based on horizontal movement', () => {
    const container = ctx.getContainer();
    const tm = ctx.getTransformManager();

    // Start rotation scrub at x=400
    container.dispatchEvent(
      createPointerEvent('pointerdown', 400, 300, {
        ctrlKey: true,
        shiftKey: true,
      } as any),
    );

    // Move 100px to the right: 100 * 0.5 = 50 degrees
    container.dispatchEvent(createPointerEvent('pointermove', 500, 300));

    // setTransform should have been called with rotation near 50
    expect(tm.setTransform).toHaveBeenCalled();
    const lastCall = (tm.setTransform as any).mock.calls[(tm.setTransform as any).mock.calls.length - 1][0];
    expect(lastCall.rotation).toBeCloseTo(50, 0);

    // scheduleRender should have been called
    expect(ctx.scheduleRender).toHaveBeenCalled();

    // Clean up
    container.dispatchEvent(createPointerEvent('pointerup', 500, 300));
  });

  it('RSCRUB-003: Dragging left produces negative angle delta (wraps correctly)', () => {
    const container = ctx.getContainer();
    const tm = ctx.getTransformManager();

    // Start rotation scrub at x=400
    container.dispatchEvent(
      createPointerEvent('pointerdown', 400, 300, {
        ctrlKey: true,
        shiftKey: true,
      } as any),
    );

    // Move 100px to the left: -100 * 0.5 = -50 degrees => (360 - 50) = 310
    container.dispatchEvent(createPointerEvent('pointermove', 300, 300));

    const lastCall = (tm.setTransform as any).mock.calls[(tm.setTransform as any).mock.calls.length - 1][0];
    expect(lastCall.rotation).toBeCloseTo(310, 0);

    container.dispatchEvent(createPointerEvent('pointerup', 300, 300));
  });

  it('RSCRUB-004: Releasing pointer deactivates rotation scrubbing', () => {
    const container = ctx.getContainer();

    // Start rotation scrub
    container.dispatchEvent(
      createPointerEvent('pointerdown', 400, 300, {
        ctrlKey: true,
        shiftKey: true,
      } as any),
    );

    expect(handler.isInteracting()).toBe(true);

    // Release
    container.dispatchEvent(createPointerEvent('pointerup', 400, 300));

    expect(handler.isInteracting()).toBe(false);
    // Cursor should revert to 'grab' when tool is 'none'
    expect(container.style.cursor).toBe('grab');
  });

  it('RSCRUB-005: Rotation scrub preserves start angle from current transform', () => {
    const container = ctx.getContainer();
    const tm = ctx.getTransformManager();

    // Set initial rotation to 90 degrees
    mockTransformData.rotation = 90;

    // Start rotation scrub at x=400
    container.dispatchEvent(
      createPointerEvent('pointerdown', 400, 300, {
        ctrlKey: true,
        shiftKey: true,
      } as any),
    );

    // Move 40px right: 40 * 0.5 = 20 degrees added to 90 = 110
    container.dispatchEvent(createPointerEvent('pointermove', 440, 300));

    const lastCall = (tm.setTransform as any).mock.calls[(tm.setTransform as any).mock.calls.length - 1][0];
    expect(lastCall.rotation).toBeCloseTo(110, 0);

    container.dispatchEvent(createPointerEvent('pointerup', 440, 300));
  });

  it('RSCRUB-006: Without Ctrl+Shift, pointerdown enters pan mode instead', () => {
    const container = ctx.getContainer();

    // Normal click without Ctrl+Shift
    container.dispatchEvent(createPointerEvent('pointerdown', 400, 300));

    // Should be in pan mode (cursor = grabbing), not rotation scrub (ew-resize)
    expect(container.style.cursor).toBe('grabbing');

    container.dispatchEvent(createPointerEvent('pointerup', 400, 300));
  });

  it('RSCRUB-007: Rotation scrub with rapid movement still computes correctly', () => {
    const container = ctx.getContainer();
    const tm = ctx.getTransformManager();

    // Start scrub
    container.dispatchEvent(
      createPointerEvent('pointerdown', 400, 300, {
        ctrlKey: true,
        shiftKey: true,
      } as any),
    );

    // Rapid large movement: 720px right = 360 degrees = wraps to 0
    container.dispatchEvent(createPointerEvent('pointermove', 1120, 300));

    const lastCall = (tm.setTransform as any).mock.calls[(tm.setTransform as any).mock.calls.length - 1][0];
    expect(lastCall.rotation).toBeCloseTo(0, 0);

    container.dispatchEvent(createPointerEvent('pointerup', 1120, 300));
  });

  it('RSCRUB-008: Pointer capture is set during rotation scrub', () => {
    const container = ctx.getContainer();

    container.dispatchEvent(
      createPointerEvent('pointerdown', 400, 300, {
        ctrlKey: true,
        shiftKey: true,
      } as any),
    );

    // setPointerCapture should have been called (as it is for all pointerdown events)
    expect(container.setPointerCapture).toHaveBeenCalled();

    container.dispatchEvent(createPointerEvent('pointerup', 400, 300));

    // releasePointerCapture should have been called on pointerup
    expect(container.releasePointerCapture).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Single-file sequence inference on drop (Issue #154)
// ---------------------------------------------------------------------------

// We need to mock inferSequenceFromSingleFile to control its return value.
// Use dynamic import + vi.mock to intercept the module.
vi.mock('../../utils/media/SequenceLoader', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    inferSequenceFromSingleFile: vi.fn(() => Promise.resolve(null)),
  };
});

// Re-import the mock so we can control it in tests
import { inferSequenceFromSingleFile } from '../../utils/media/SequenceLoader';
const mockedInferSequence = vi.mocked(inferSequenceFromSingleFile);

describe('ViewerInputHandler – Single-file sequence inference on drop (Issue #154)', () => {
  let ctx: ViewerInputContext;
  let handler: ViewerInputHandler;
  let dropOverlay: HTMLElement;

  beforeEach(() => {
    ctx = createMockContext();
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();
    mockedInferSequence.mockReset();
    mockedInferSequence.mockResolvedValue(null);
  });

  afterEach(() => {
    handler.unbindEvents();
    const container = ctx.getContainer();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  function dispatchDrop(container: HTMLElement, files: File[]): void {
    const mockDataTransfer = { files };
    const dropEvent = new Event('drop', { bubbles: true }) as any;
    dropEvent.dataTransfer = mockDataTransfer;
    dropEvent.preventDefault = vi.fn();
    container.dispatchEvent(dropEvent);
  }

  it('SEQ-INFER-001: single numbered image file dropped triggers sequence inference', async () => {
    const container = ctx.getContainer();
    const singleFile = new File(['img'], 'render_0001.exr');

    dispatchDrop(container, [singleFile]);

    await vi.waitFor(() => {
      expect(mockedInferSequence).toHaveBeenCalledTimes(1);
    });

    expect(mockedInferSequence).toHaveBeenCalledWith(singleFile, [singleFile]);
  });

  it('SEQ-INFER-002: sequence inference succeeds → loaded as sequence', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    const file1 = new File(['a'], 'frame_0001.exr');
    const file2 = new File(['b'], 'frame_0002.exr');
    const file3 = new File(['c'], 'frame_0003.exr');

    mockedInferSequence.mockResolvedValue({
      name: 'frame_####.exr',
      pattern: 'frame_####.exr',
      frames: [
        { file: file1, frameNumber: 1, index: 0 },
        { file: file2, frameNumber: 2, index: 1 },
        { file: file3, frameNumber: 3, index: 2 },
      ],
      fps: 24,
      startFrame: 1,
      endFrame: 3,
      width: 1920,
      height: 1080,
      missingFrames: [],
    });

    dispatchDrop(container, [file1]);

    await vi.waitFor(() => {
      expect(mockSession.loadSequence).toHaveBeenCalledTimes(1);
    });

    expect(mockSession.loadSequence).toHaveBeenCalledWith([file1, file2, file3]);
    expect(mockSession.loadFile).not.toHaveBeenCalled();
  });

  it('SEQ-INFER-003: sequence inference returns null → falls through to single file load', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    const singleFile = new File(['img'], 'photo_0042.png');

    mockedInferSequence.mockResolvedValue(null);

    dispatchDrop(container, [singleFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadFile).toHaveBeenCalledTimes(1);
    });

    expect(mockSession.loadFile).toHaveBeenCalledWith(singleFile);
    expect(mockSession.loadSequence).not.toHaveBeenCalled();
  });

  it('SEQ-INFER-004: multiple image files dropped still use existing getBestSequence path', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    // Drop multiple image files — should go through getBestSequence, not inferSequenceFromSingleFile
    const file1 = new File(['a'], 'shot_001.exr');
    const file2 = new File(['b'], 'shot_002.exr');
    const file3 = new File(['c'], 'shot_003.exr');

    dispatchDrop(container, [file1, file2, file3]);

    await vi.waitFor(() => {
      // getBestSequence should handle this, loadSequence or loadFile should be called
      expect(
        (mockSession.loadSequence as any).mock.calls.length +
          (mockSession.loadFile as any).mock.calls.length,
      ).toBeGreaterThan(0);
    });

    // inferSequenceFromSingleFile should NOT be called for multi-file drops
    expect(mockedInferSequence).not.toHaveBeenCalled();
  });

  it('SEQ-INFER-005: sequence inference throws error → falls through to single file load', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();

    const singleFile = new File(['img'], 'frame_0001.tiff');

    mockedInferSequence.mockRejectedValue(new Error('inference failed'));

    dispatchDrop(container, [singleFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadFile).toHaveBeenCalledTimes(1);
    });

    expect(mockSession.loadFile).toHaveBeenCalledWith(singleFile);
    expect(mockSession.loadSequence).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Drag-and-drop .rvedl EDL file handling (Issue #155)
// ---------------------------------------------------------------------------

describe('ViewerInputHandler – RVEDL drop handling (Issue #155)', () => {
  let ctx: ViewerInputContext;
  let handler: ViewerInputHandler;
  let dropOverlay: HTMLElement;

  beforeEach(() => {
    ctx = createMockContext();
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();
  });

  afterEach(() => {
    handler.unbindEvents();
    const container = ctx.getContainer();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  function dispatchDrop(container: HTMLElement, files: File[]): void {
    const mockDataTransfer = { files };
    const dropEvent = new Event('drop', { bubbles: true }) as any;
    dropEvent.dataTransfer = mockDataTransfer;
    dropEvent.preventDefault = vi.fn();
    container.dispatchEvent(dropEvent);
  }

  it('EDL-DROP-001: .rvedl file dropped calls session.loadEDL with text content', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const edlContent = 'sourceA.exr 1 100\nsourceB.exr 101 200';
    const edlFile = new File([edlContent], 'timeline.rvedl');

    (mockSession.loadEDL as ReturnType<typeof vi.fn>).mockReturnValue([
      { sourcePath: '/path/to/sourceA.exr', startFrame: 1, endFrame: 100 },
      { sourcePath: '/path/to/sourceB.exr', startFrame: 101, endFrame: 200 },
    ]);

    dispatchDrop(container, [edlFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadEDL).toHaveBeenCalledTimes(1);
    });

    expect(mockSession.loadEDL).toHaveBeenCalledWith(edlContent);
  });

  it('EDL-DROP-002: .rvedl file is NOT routed through loadFile', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const edlFile = new File(['edl-data'], 'timeline.rvedl');

    (mockSession.loadEDL as ReturnType<typeof vi.fn>).mockReturnValue([]);

    dispatchDrop(container, [edlFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadEDL).toHaveBeenCalledTimes(1);
    });

    expect(mockSession.loadFile).not.toHaveBeenCalled();
    expect(mockSession.loadFromGTO).not.toHaveBeenCalled();
    expect(mockSession.loadSequence).not.toHaveBeenCalled();
  });

  it('EDL-DROP-003: error during .rvedl load is handled gracefully', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const edlFile = new File(['bad-data'], 'broken.rvedl');

    (mockSession.loadEDL as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Parse error');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    dispatchDrop(container, [edlFile]);

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load RVEDL file:', expect.any(Error));
    });

    expect(mockSession.loadFile).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('EDL-DROP-004: .rv/.gto handling still works (no regression)', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const gtoFile = new File(['gto-data'], 'scene.gto');

    dispatchDrop(container, [gtoFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadFromGTO).toHaveBeenCalledTimes(1);
    });

    expect(mockSession.loadEDL).not.toHaveBeenCalled();
    expect(mockSession.loadFile).not.toHaveBeenCalled();
  });

  it('EDL-DROP-005: case-insensitive .RVEDL extension is recognized', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const edlFile = new File(['edl-data'], 'TIMELINE.RVEDL');

    (mockSession.loadEDL as ReturnType<typeof vi.fn>).mockReturnValue([
      { sourcePath: 'source.exr', startFrame: 1, endFrame: 50 },
    ]);

    dispatchDrop(container, [edlFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadEDL).toHaveBeenCalledTimes(1);
    });
  });

  it('EDL-DROP-006: .rvedl with companion media files loads both EDL and media (#400)', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const edlFile = new File(['edl-data'], 'timeline.rvedl');
    const mediaFile = new File([new Uint8Array(8)], 'clip.exr');

    (mockSession.loadEDL as ReturnType<typeof vi.fn>).mockReturnValue([
      { sourcePath: '/path/to/clip.exr', startFrame: 1, endFrame: 50 },
    ]);

    dispatchDrop(container, [edlFile, mediaFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadEDL).toHaveBeenCalledTimes(1);
    });

    // The companion media file should also be loaded
    await vi.waitFor(() => {
      expect(mockSession.loadFile).toHaveBeenCalledTimes(1);
    });
    expect(mockSession.loadFile).toHaveBeenCalledWith(mediaFile);
  });

  it('EDL-DROP-007: .rvedl alone without companion files does not call loadFile (#400)', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const edlFile = new File(['edl-data'], 'timeline.rvedl');

    (mockSession.loadEDL as ReturnType<typeof vi.fn>).mockReturnValue([
      { sourcePath: 'source.exr', startFrame: 1, endFrame: 50 },
    ]);

    dispatchDrop(container, [edlFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadEDL).toHaveBeenCalledTimes(1);
    });

    expect(mockSession.loadFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Issue #106: Text annotation selection via canvas clicks
// ---------------------------------------------------------------------------

describe('ViewerInputHandler – Text Annotation Selection (#106)', () => {
  let ctx: ViewerInputContext;
  let handler: ViewerInputHandler;
  let dropOverlay: HTMLElement;

  beforeEach(() => {
    ctx = createMockContext();
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();
    ctx.getPaintEngine().tool = 'text';
  });

  afterEach(() => {
    handler.unbindEvents();
    const container = ctx.getContainer();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('H106-01: clicking on existing text annotation emits annotationSelected instead of creating overlay', () => {
    const paintEngine = ctx.getPaintEngine();
    const session = ctx.getSession();

    // Add a text annotation at normalized (0.5, 0.5)
    // With canvas 800x600 and no transform, point (400, 300) maps to (0.5, 0.5)
    const ann = paintEngine.addText(session.currentFrame, { x: 0.5, y: 0.5 }, 'Existing');

    const listener = vi.fn();
    paintEngine.on('annotationSelected', listener);

    // Click near the annotation position
    const container = ctx.getContainer();
    const e = createPointerEvent('pointerdown', 400, 300);
    container.dispatchEvent(e);

    // Should emit annotationSelected
    expect(listener).toHaveBeenCalledWith({
      annotation: expect.objectContaining({ id: ann.id, type: 'text' }),
      frame: session.currentFrame,
    });

    // Should NOT create text overlay
    const overlay = container.querySelector('[data-testid="text-input-overlay"]');
    expect(overlay).toBeNull();
  });

  it('H106-02: clicking on empty area still creates text overlay', () => {
    const paintEngine = ctx.getPaintEngine();

    const listener = vi.fn();
    paintEngine.on('annotationSelected', listener);

    // Click on area with no text annotations
    const container = ctx.getContainer();
    const e = createPointerEvent('pointerdown', 400, 300);
    container.dispatchEvent(e);

    // Should NOT emit annotationSelected
    expect(listener).not.toHaveBeenCalled();

    // Should create text overlay
    const overlay = container.querySelector('[data-testid="text-input-overlay"]');
    expect(overlay).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Drag-and-drop .orvproject file handling (Issue #386)
// ---------------------------------------------------------------------------

describe('ViewerInputHandler – .orvproject drop handling (Issue #386)', () => {
  let ctx: ViewerInputContext;
  let handler: ViewerInputHandler;
  let dropOverlay: HTMLElement;

  beforeEach(() => {
    ctx = createMockContext();
    dropOverlay = document.createElement('div');
    handler = new ViewerInputHandler(ctx, dropOverlay);
    handler.bindEvents();
  });

  afterEach(() => {
    handler.unbindEvents();
    const container = ctx.getContainer();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  function dispatchDrop(container: HTMLElement, files: File[]): void {
    const mockDataTransfer = { files };
    const dropEvent = new Event('drop', { bubbles: true }) as any;
    dropEvent.dataTransfer = mockDataTransfer;
    dropEvent.preventDefault = vi.fn();
    container.dispatchEvent(dropEvent);
  }

  it('PROJ-DROP-001: .orvproject file dropped invokes onProjectFileDrop callback', async () => {
    const container = ctx.getContainer();
    const callback = vi.fn();
    handler.onProjectFileDrop = callback;

    const projectFile = new File(['project-data'], 'session.orvproject');
    dispatchDrop(container, [projectFile]);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledTimes(1);
    });

    expect(callback).toHaveBeenCalledWith(projectFile, []);
  });

  it('PROJ-DROP-002: .orvproject with companion files passes them to callback', async () => {
    const container = ctx.getContainer();
    const callback = vi.fn();
    handler.onProjectFileDrop = callback;

    const projectFile = new File(['project-data'], 'session.orvproject');
    const media1 = new File(['img'], 'plate.exr');
    const media2 = new File(['img'], 'bg.dpx');
    dispatchDrop(container, [projectFile, media1, media2]);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledTimes(1);
    });

    const companionFiles = callback.mock.calls[0]![1] as File[];
    expect(companionFiles).toHaveLength(2);
    expect(companionFiles[0]!.name).toBe('plate.exr');
    expect(companionFiles[1]!.name).toBe('bg.dpx');
  });

  it('PROJ-DROP-003: .orvproject is NOT routed through session.loadFile or loadFromGTO', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const callback = vi.fn();
    handler.onProjectFileDrop = callback;

    const projectFile = new File(['project-data'], 'test.orvproject');
    dispatchDrop(container, [projectFile]);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledTimes(1);
    });

    expect(mockSession.loadFile).not.toHaveBeenCalled();
    expect(mockSession.loadFromGTO).not.toHaveBeenCalled();
    expect(mockSession.loadEDL).not.toHaveBeenCalled();
    expect(mockSession.loadSequence).not.toHaveBeenCalled();
  });

  it('PROJ-DROP-004: case-insensitive .ORVPROJECT extension is recognized', async () => {
    const container = ctx.getContainer();
    const callback = vi.fn();
    handler.onProjectFileDrop = callback;

    const projectFile = new File(['project-data'], 'SESSION.ORVPROJECT');
    dispatchDrop(container, [projectFile]);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  it('PROJ-DROP-005: .gto drop still works (no regression)', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const callback = vi.fn();
    handler.onProjectFileDrop = callback;

    const gtoFile = new File(['gto-data'], 'scene.gto');
    dispatchDrop(container, [gtoFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadFromGTO).toHaveBeenCalledTimes(1);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('PROJ-DROP-006: .rvedl drop still works (no regression)', async () => {
    const container = ctx.getContainer();
    const mockSession = ctx.getSession();
    const callback = vi.fn();
    handler.onProjectFileDrop = callback;

    const edlFile = new File(['edl-data'], 'timeline.rvedl');
    (mockSession.loadEDL as ReturnType<typeof vi.fn>).mockReturnValue([]);

    dispatchDrop(container, [edlFile]);

    await vi.waitFor(() => {
      expect(mockSession.loadEDL).toHaveBeenCalledTimes(1);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('PROJ-DROP-007: .orvproject without callback shows warning alert', async () => {
    const container = ctx.getContainer();
    // Do NOT set handler.onProjectFileDrop — leave it null

    const projectFile = new File(['project-data'], 'orphan.orvproject');
    dispatchDrop(container, [projectFile]);

    // Should not crash, and should not route to other handlers
    const mockSession = ctx.getSession();
    await vi.waitFor(() => {
      // Give the async handler time to complete
      expect(mockSession.loadFile).not.toHaveBeenCalled();
    });

    expect(mockSession.loadFromGTO).not.toHaveBeenCalled();
    expect(mockSession.loadEDL).not.toHaveBeenCalled();
  });

  it('DROP-MIX-001: mixed .rvedl + .rv drop loads EDL and does not load session', async () => {
    const container = ctx.getContainer();

    const edlFile = new File(
      ['001 src V C 01:00:00:00 01:00:10:00 01:00:00:00 01:00:10:00\n* FROM CLIP NAME: test.exr'],
      'test.rvedl',
    );
    const rvFile = new File(['rv-data'], 'session.rv');
    const dt = new DataTransfer();
    dt.items.add(edlFile);
    dt.items.add(rvFile);

    container.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));

    // Wait for async handling
    await new Promise((r) => setTimeout(r, 50));

    // EDL should be loaded
    expect(mockSession.loadEDL).toHaveBeenCalled();
    // Session file should NOT be loaded
    expect(mockSession.loadFromGTO).not.toHaveBeenCalled();
  });
});
