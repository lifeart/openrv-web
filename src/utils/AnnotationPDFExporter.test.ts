/**
 * AnnotationPDFExporter Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  exportAnnotationsPDF,
  previewAnnotationsPDF,
} from './AnnotationPDFExporter';
import { PaintEngine } from '../paint/PaintEngine';
import { Session } from '../core/session/Session';

describe('AnnotationPDFExporter', () => {
  let paintEngine: PaintEngine;
  let session: Session;

  beforeEach(() => {
    paintEngine = new PaintEngine();
    session = new Session();
    session.fps = 24;
  });

  describe('previewAnnotationsPDF', () => {
    it('ANN-PDF-U001: generates valid HTML structure', () => {
      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
    });

    it('ANN-PDF-U002: includes print stylesheet', () => {
      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('@media print');
      expect(html).toContain('@page');
    });

    it('ANN-PDF-U003: includes document header with default title', () => {
      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('Annotation Report');
      expect(html).toContain('class="pdf-header"');
    });

    it('ANN-PDF-U004: uses custom title when provided', () => {
      const html = previewAnnotationsPDF(paintEngine, session, { title: 'My Custom Report' });

      expect(html).toContain('My Custom Report');
    });

    it('ANN-PDF-U005: includes FPS in header', () => {
      session.fps = 30;
      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('FPS: 30');
    });

    it('ANN-PDF-U006: creates frame sections for annotated frames', () => {
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Test annotation');
      paintEngine.addText(10, { x: 0.5, y: 0.5 }, 'Another annotation');

      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('Frame 1');
      expect(html).toContain('Frame 10');
      expect(html).toContain('class="frame-section"');
    });

    it('ANN-PDF-U007: includes timecodes when enabled', () => {
      paintEngine.addText(48, { x: 0.5, y: 0.5 }, 'Test'); // 2 seconds at 24fps

      const html = previewAnnotationsPDF(paintEngine, session, { includeTimecodes: true });

      expect(html).toContain('class="timecode"');
      expect(html).toContain('00:00:02:00'); // Frame 48 at 24fps
    });

    it('ANN-PDF-U008: excludes timecodes when disabled', () => {
      paintEngine.addText(48, { x: 0.5, y: 0.5 }, 'Test');

      const html = previewAnnotationsPDF(paintEngine, session, { includeTimecodes: false });

      expect(html).not.toContain('class="timecode"');
    });

    it('ANN-PDF-U021: handles minimum FPS (Session clamps fps >= 1)', () => {
      // Note: Session.fps setter clamps to [1, 120], so fps=0 becomes fps=1
      session.fps = 0;
      paintEngine.addText(48, { x: 0.5, y: 0.5 }, 'Test');

      const html = previewAnnotationsPDF(paintEngine, session, { includeTimecodes: true });

      // With clamped fps=1, frame 48 should be 48 seconds
      expect(html).toContain('class="timecode"');
      expect(html).toContain('00:00:48:00'); // 48 frames at 1fps = 48 seconds
    });

    it('ANN-PDF-U009: lists pen stroke annotations', () => {
      paintEngine.tool = 'pen';
      paintEngine.beginStroke(1, { x: 0.1, y: 0.2 });
      paintEngine.continueStroke({ x: 0.3, y: 0.4 });
      paintEngine.endStroke();

      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('Pen Stroke');
      expect(html).toContain('Points:');
    });

    it('ANN-PDF-U010: lists text annotations with content', () => {
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Hello World');

      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('Text');
      expect(html).toContain('Hello World');
    });

    it('ANN-PDF-U011: lists shape annotations', () => {
      paintEngine.addRectangle(1, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 });

      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('Shape');
      expect(html).toContain('rectangle');
    });

    it('ANN-PDF-U012: includes annotation summary section by default', () => {
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Test');

      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('Annotation Summary');
      expect(html).toContain('class="summary-section"');
    });

    it('ANN-PDF-U013: excludes summary section when disabled', () => {
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Test');

      const html = previewAnnotationsPDF(paintEngine, session, { includeAnnotationList: false });

      expect(html).not.toContain('Annotation Summary');
    });

    it('ANN-PDF-U014: includes color swatches for annotations', () => {
      paintEngine.color = [1, 0, 0, 1]; // Red
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Red text');

      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('class="color-swatch"');
      expect(html).toContain('rgba(255, 0, 0, 1)');
    });

    it('ANN-PDF-U015: handles empty annotations gracefully', () => {
      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('Total Frames: 0');
      expect(html).not.toContain('class="frame-section"');
    });

    it('ANN-PDF-U016: calculates correct annotation counts in summary', () => {
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Text 1');
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Text 2');
      paintEngine.addRectangle(2, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 });

      paintEngine.tool = 'pen';
      paintEngine.beginStroke(3, { x: 0.1, y: 0.2 });
      paintEngine.continueStroke({ x: 0.3, y: 0.4 });
      paintEngine.endStroke();

      const html = previewAnnotationsPDF(paintEngine, session);

      expect(html).toContain('Total Annotations:</strong> 4');
      expect(html).toContain('Pen Strokes:</strong> 1');
      expect(html).toContain('Text:</strong> 2');
      expect(html).toContain('Shapes:</strong> 1');
    });

    it('ANN-PDF-U017: truncates long text in summary table', () => {
      const longText = 'This is a very long annotation text that should be truncated in the summary table';
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, longText);

      const html = previewAnnotationsPDF(paintEngine, session);

      // The summary table should contain truncated text with ellipsis
      expect(html).toContain('...');
      // Full text appears in the frame section, but summary table should truncate
      // Count occurrences - should only appear once (in frame section, not in summary)
      const fullTextOccurrences = (html.match(new RegExp(longText, 'g')) || []).length;
      expect(fullTextOccurrences).toBe(1); // Only in frame section, not summary table
    });
  });

  describe('exportAnnotationsPDF', () => {
    it('ANN-PDF-U018: opens print window with correct content', async () => {
      const mockPrintWindow = {
        document: {
          write: vi.fn(),
          close: vi.fn(),
        },
        print: vi.fn(),
        onload: null as (() => void) | null,
      };

      const originalOpen = window.open;
      window.open = vi.fn().mockReturnValue(mockPrintWindow);

      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Test');

      const renderFrame = vi.fn().mockResolvedValue(document.createElement('canvas'));

      // Don't await - just start the export
      void exportAnnotationsPDF(paintEngine, session, renderFrame, {
        includeFrameThumbnails: false,
      });

      // Give async operation time to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(window.open).toHaveBeenCalledWith('', '_blank', 'width=800,height=600');
      expect(mockPrintWindow.document.write).toHaveBeenCalled();
      expect(mockPrintWindow.document.close).toHaveBeenCalled();

      window.open = originalOpen;
    });

    it('ANN-PDF-U019: throws error when popup is blocked', async () => {
      const originalOpen = window.open;
      window.open = vi.fn().mockReturnValue(null);

      const renderFrame = vi.fn().mockResolvedValue(document.createElement('canvas'));

      await expect(
        exportAnnotationsPDF(paintEngine, session, renderFrame)
      ).rejects.toThrow('Failed to open print window');

      window.open = originalOpen;
    });

    it('ANN-PDF-U020: calls renderFrame for each annotated frame when thumbnails enabled', async () => {
      const mockPrintWindow = {
        document: {
          write: vi.fn(),
          close: vi.fn(),
        },
        print: vi.fn(),
        onload: null as (() => void) | null,
      };

      const originalOpen = window.open;
      window.open = vi.fn().mockReturnValue(mockPrintWindow);

      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Frame 1');
      paintEngine.addText(5, { x: 0.5, y: 0.5 }, 'Frame 5');
      paintEngine.addText(10, { x: 0.5, y: 0.5 }, 'Frame 10');

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      mockCanvas.getContext('2d'); // Initialize context

      const renderFrame = vi.fn().mockResolvedValue(mockCanvas);

      await exportAnnotationsPDF(paintEngine, session, renderFrame, {
        includeFrameThumbnails: true,
      });

      expect(renderFrame).toHaveBeenCalledWith(1);
      expect(renderFrame).toHaveBeenCalledWith(5);
      expect(renderFrame).toHaveBeenCalledWith(10);
      expect(renderFrame).toHaveBeenCalledTimes(3);

      window.open = originalOpen;
    });
  });
});
