/**
 * ViewerInputHandler – Text Input Overlay Tests (H-04)
 *
 * Verifies that the text tool uses an inline <textarea> overlay
 * instead of window.prompt().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViewerInputHandler, ViewerInputContext } from './ViewerInputHandler';
import { PaintEngine } from '../../paint/PaintEngine';
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
    renderPaint: vi.fn(),
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
