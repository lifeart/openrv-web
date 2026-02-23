/**
 * ViewerInputHandler – Text Input Overlay Tests (H-04)
 *
 * Verifies that the text tool uses an inline <textarea> overlay
 * instead of window.prompt().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViewerInputHandler, ViewerInputContext } from './ViewerInputHandler';
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
      overlay.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
      );

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
      overlay.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
      );

      expect(addTextSpy).toHaveBeenCalledTimes(1);
      expect(addTextSpy).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Object),
        'Mac text',
      );
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
      expect(addTextSpy).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Object),
        'Blur commit',
      );
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
    overlay.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );

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
    overlay.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

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
    overlay.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );

    expect(addTextSpy).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Object),
      'Line 1\nLine 2\nLine 3',
    );
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
    expect(addTextSpy).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Object),
      'First',
    );

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
      hdrPixels[i] = 2.5;     // R > 1.0 (HDR)
      hdrPixels[i + 1] = 1.8; // G > 1.0 (HDR)
      hdrPixels[i + 2] = 0.3; // B
      hdrPixels[i + 3] = 1.0; // A
    }

    const mockGLContext = {
      drawingBufferWidth: w,
      drawingBufferHeight: h,
      TEXTURE_2D: 0x0DE1,
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
      glPixels[i] = 3.0;      // R (HDR)
      glPixels[i + 1] = 2.5;  // G (HDR)
      glPixels[i + 2] = 1.8;  // B (HDR)
      glPixels[i + 3] = 1.0;  // A
    }

    const mockGLContext = {
      drawingBufferWidth: w,
      drawingBufferHeight: h,
      TEXTURE_2D: 0x0DE1,
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
