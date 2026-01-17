/**
 * FrameExporter Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportCanvas,
  exportMergedCanvases,
  canvasToBlob,
  copyCanvasToClipboard,
  captureVideoFrame,
  DEFAULT_EXPORT_OPTIONS,
} from './FrameExporter';
import type { ExportFormat } from './FrameExporter';

describe('FrameExporter', () => {
  describe('DEFAULT_EXPORT_OPTIONS', () => {
    it('has correct defaults', () => {
      expect(DEFAULT_EXPORT_OPTIONS.format).toBe('png');
      expect(DEFAULT_EXPORT_OPTIONS.quality).toBe(0.92);
      expect(DEFAULT_EXPORT_OPTIONS.includeAnnotations).toBe(true);
    });
  });

  describe('exportCanvas', () => {
    let canvas: HTMLCanvasElement;
    let mockLink: { href: string; download: string; style: { display: string }; click: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 100, 100);

      mockLink = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      };

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          return mockLink as unknown as HTMLAnchorElement;
        }
        // For other tags, use a real element but we won't need them
        const el = document.createElementNS('http://www.w3.org/1999/xhtml', tag);
        return el as HTMLElement;
      });

      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as HTMLElement);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as HTMLElement);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('EXP-001: exports PNG format', () => {
      exportCanvas(canvas, { format: 'png' });

      expect(mockLink.click).toHaveBeenCalled();
      // jsdom canvas returns data:image/png for toDataURL
      expect(typeof mockLink.href).toBe('string');
      expect(mockLink.href.length).toBeGreaterThan(0);
      expect(mockLink.download).toMatch(/\.png$/);
    });

    it('EXP-002: exports JPEG format', () => {
      exportCanvas(canvas, { format: 'jpeg' });

      expect(mockLink.click).toHaveBeenCalled();
      // jsdom canvas may not support all formats, just check it was set
      expect(typeof mockLink.href).toBe('string');
      expect(mockLink.href.length).toBeGreaterThan(0);
      expect(mockLink.download).toMatch(/\.jpeg$/);
    });

    it('EXP-003: exports WebP format', () => {
      exportCanvas(canvas, { format: 'webp' });

      expect(mockLink.click).toHaveBeenCalled();
      // jsdom canvas may not support all formats, just check it was set
      expect(typeof mockLink.href).toBe('string');
      expect(mockLink.href.length).toBeGreaterThan(0);
      expect(mockLink.download).toMatch(/\.webp$/);
    });

    it('EXP-004: uses custom filename', () => {
      exportCanvas(canvas, { filename: 'my-export.png' });

      expect(mockLink.download).toBe('my-export.png');
    });

    it('EXP-005: generates timestamp filename by default', () => {
      exportCanvas(canvas);

      expect(mockLink.download).toMatch(/^frame_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/);
    });

    it('EXP-006: triggers link click', () => {
      exportCanvas(canvas);

      expect(mockLink.click).toHaveBeenCalled();
    });
  });

  describe('exportMergedCanvases', () => {
    let canvas1: HTMLCanvasElement;
    let canvas2: HTMLCanvasElement;
    let mockLink: { href: string; download: string; style: { display: string }; click: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      canvas1 = document.createElement('canvas');
      canvas1.width = 100;
      canvas1.height = 100;
      const ctx1 = canvas1.getContext('2d')!;
      ctx1.fillStyle = 'red';
      ctx1.fillRect(0, 0, 100, 100);

      canvas2 = document.createElement('canvas');
      canvas2.width = 100;
      canvas2.height = 100;
      const ctx2 = canvas2.getContext('2d')!;
      ctx2.fillStyle = 'blue';
      ctx2.fillRect(50, 50, 50, 50);

      mockLink = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('EXP-007: merges multiple canvases', () => {
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          return mockLink as unknown as HTMLAnchorElement;
        }
        if (tag === 'canvas') {
          // Return real canvas for merge
          const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas') as HTMLCanvasElement;
          return c;
        }
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as HTMLElement);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as HTMLElement);

      exportMergedCanvases([canvas1, canvas2], 100, 100);

      expect(mockLink.click).toHaveBeenCalled();
    });

    it('EXP-008: creates canvas with specified dimensions', () => {
      let createdCanvas: HTMLCanvasElement | null = null;

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') {
          createdCanvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas') as HTMLCanvasElement;
          return createdCanvas;
        }
        if (tag === 'a') {
          return mockLink as unknown as HTMLAnchorElement;
        }
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as HTMLElement);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as HTMLElement);

      exportMergedCanvases([canvas1], 200, 150);

      expect(createdCanvas).not.toBeNull();
      expect(createdCanvas!.width).toBe(200);
      expect(createdCanvas!.height).toBe(150);
    });
  });

  describe('canvasToBlob', () => {
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
      canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
    });

    it('EXP-009: converts canvas to PNG blob', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
        callback(mockBlob);
      });

      const blob = await canvasToBlob(canvas, 'png');

      expect(blob).toBe(mockBlob);
      expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined);
    });

    it('EXP-010: converts canvas to JPEG with quality', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' });
      vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
        callback(mockBlob);
      });

      const blob = await canvasToBlob(canvas, 'jpeg', 0.8);

      expect(blob).toBe(mockBlob);
      expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8);
    });

    it('EXP-011: converts canvas to WebP with quality', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/webp' });
      vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
        callback(mockBlob);
      });

      const blob = await canvasToBlob(canvas, 'webp', 0.9);

      expect(blob).toBe(mockBlob);
      expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.9);
    });

    it('EXP-012: returns null when toBlob fails', async () => {
      vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
        callback(null);
      });

      const blob = await canvasToBlob(canvas);

      expect(blob).toBeNull();
    });
  });

  describe('copyCanvasToClipboard', () => {
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
      canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
    });

    it('EXP-013: copies to clipboard successfully', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
        callback(mockBlob);
      });

      const mockWrite = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: mockWrite },
        configurable: true,
      });

      // Mock ClipboardItem
      (globalThis as { ClipboardItem?: unknown }).ClipboardItem = vi.fn();

      const result = await copyCanvasToClipboard(canvas);

      expect(result).toBe(true);
      expect(mockWrite).toHaveBeenCalled();
    });

    it('EXP-014: returns false when blob creation fails', async () => {
      vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
        callback(null);
      });

      const result = await copyCanvasToClipboard(canvas);

      expect(result).toBe(false);
    });

    it('EXP-015: returns false when clipboard.write fails', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
        callback(mockBlob);
      });

      const mockWrite = vi.fn().mockRejectedValue(new Error('Clipboard error'));
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: mockWrite },
        configurable: true,
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await copyCanvasToClipboard(canvas);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('captureVideoFrame', () => {
    it('EXP-016: captures frame from video element', () => {
      const video = document.createElement('video');
      Object.defineProperty(video, 'videoWidth', { value: 640 });
      Object.defineProperty(video, 'videoHeight', { value: 480 });

      const mockLink = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      };

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          return mockLink as unknown as HTMLAnchorElement;
        }
        if (tag === 'canvas') {
          return document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas') as HTMLCanvasElement;
        }
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
      });

      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as HTMLElement);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as HTMLElement);

      captureVideoFrame(video);

      expect(mockLink.click).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });

  describe('format MIME types', () => {
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
      canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
    });

    const formats: ExportFormat[] = ['png', 'jpeg', 'webp'];

    formats.forEach((format) => {
      it(`uses correct MIME type for ${format}`, async () => {
        const mockBlob = new Blob(['test'], { type: `image/${format}` });
        const toBlobSpy = vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
          callback(mockBlob);
        });

        await canvasToBlob(canvas, format);

        const expectedMime = `image/${format}`;
        expect(toBlobSpy).toHaveBeenCalledWith(
          expect.any(Function),
          expectedMime,
          format === 'png' ? undefined : 0.92
        );

        toBlobSpy.mockRestore();
      });
    });
  });
});
