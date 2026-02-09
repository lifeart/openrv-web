/**
 * AnnotationJSONExporter Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  exportAnnotationsJSON,
  downloadAnnotationsJSON,
  parseAnnotationsJSON,
  applyAnnotationsJSON,
  type AnnotationExportData,
} from './AnnotationJSONExporter';
import { PaintEngine } from '../../paint/PaintEngine';

describe('AnnotationJSONExporter', () => {
  let paintEngine: PaintEngine;

  beforeEach(() => {
    paintEngine = new PaintEngine();
  });

  describe('exportAnnotationsJSON', () => {
    it('ANN-JSON-U001: exports empty annotations correctly', () => {
      const json = exportAnnotationsJSON(paintEngine);
      const data = JSON.parse(json) as AnnotationExportData;

      expect(data.version).toBe(1);
      expect(data.source).toBe('openrv-web');
      expect(data.statistics.totalAnnotations).toBe(0);
      expect(data.statistics.annotatedFrames).toBe(0);
      expect(Object.keys(data.frames)).toHaveLength(0);
    });

    it('ANN-JSON-U002: exports pen strokes correctly', () => {
      paintEngine.tool = 'pen';
      paintEngine.color = [1, 0, 0, 1];
      paintEngine.width = 5;

      paintEngine.beginStroke(1, { x: 0.1, y: 0.2 });
      paintEngine.continueStroke({ x: 0.3, y: 0.4 });
      paintEngine.endStroke();

      const json = exportAnnotationsJSON(paintEngine);
      const data = JSON.parse(json) as AnnotationExportData;

      expect(data.statistics.penStrokes).toBe(1);
      expect(data.statistics.totalAnnotations).toBe(1);
      expect(data.frames[1]).toHaveLength(1);
      expect(data.frames[1]![0]!.type).toBe('pen');
    });

    it('ANN-JSON-U003: exports text annotations correctly', () => {
      paintEngine.tool = 'text';
      paintEngine.addText(5, { x: 0.5, y: 0.5 }, 'Test annotation', 24);

      const json = exportAnnotationsJSON(paintEngine);
      const data = JSON.parse(json) as AnnotationExportData;

      expect(data.statistics.textAnnotations).toBe(1);
      expect(data.frames[5]).toHaveLength(1);
      expect(data.frames[5]![0]!.type).toBe('text');
    });

    it('ANN-JSON-U004: exports shape annotations correctly', () => {
      paintEngine.addRectangle(10, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 });

      const json = exportAnnotationsJSON(paintEngine);
      const data = JSON.parse(json) as AnnotationExportData;

      expect(data.statistics.shapeAnnotations).toBe(1);
      expect(data.frames[10]).toHaveLength(1);
      expect(data.frames[10]![0]!.type).toBe('shape');
    });

    it('ANN-JSON-U005: includes effects when requested', () => {
      paintEngine.setGhostMode(true, 5, 3);
      paintEngine.setHoldMode(true);

      const json = exportAnnotationsJSON(paintEngine, { includeEffects: true });
      const data = JSON.parse(json) as AnnotationExportData;

      expect(data.effects).toBeDefined();
      expect(data.effects!.ghost).toBe(true);
      expect(data.effects!.ghostBefore).toBe(5);
      expect(data.effects!.ghostAfter).toBe(3);
      expect(data.effects!.hold).toBe(true);
    });

    it('ANN-JSON-U006: excludes effects when not requested', () => {
      paintEngine.setGhostMode(true, 5, 3);

      const json = exportAnnotationsJSON(paintEngine, { includeEffects: false });
      const data = JSON.parse(json) as AnnotationExportData;

      expect(data.effects).toBeUndefined();
    });

    it('ANN-JSON-U007: filters by frame range correctly', () => {
      paintEngine.addText(5, { x: 0.5, y: 0.5 }, 'Frame 5');
      paintEngine.addText(10, { x: 0.5, y: 0.5 }, 'Frame 10');
      paintEngine.addText(15, { x: 0.5, y: 0.5 }, 'Frame 15');

      const json = exportAnnotationsJSON(paintEngine, {
        includeAllFrames: false,
        frameRange: [7, 12],
      });
      const data = JSON.parse(json) as AnnotationExportData;

      expect(Object.keys(data.frames)).toHaveLength(1);
      expect(data.frames[10]).toBeDefined();
      expect(data.frames[5]).toBeUndefined();
      expect(data.frames[15]).toBeUndefined();
    });

    it('ANN-JSON-U008: calculates frame range statistics correctly', () => {
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'First');
      paintEngine.addText(50, { x: 0.5, y: 0.5 }, 'Middle');
      paintEngine.addText(100, { x: 0.5, y: 0.5 }, 'Last');

      const json = exportAnnotationsJSON(paintEngine);
      const data = JSON.parse(json) as AnnotationExportData;

      expect(data.frameRange.start).toBe(1);
      expect(data.frameRange.end).toBe(100);
      expect(data.frameRange.totalFrames).toBe(3);
    });

    it('ANN-JSON-U009: produces prettified JSON by default', () => {
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Test');

      const json = exportAnnotationsJSON(paintEngine);

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('ANN-JSON-U010: produces compact JSON when prettify is false', () => {
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Test');

      const json = exportAnnotationsJSON(paintEngine, { prettify: false });

      expect(json).not.toContain('\n');
    });

    it('ANN-JSON-U011: includes export timestamp', () => {
      const before = new Date().toISOString();
      const json = exportAnnotationsJSON(paintEngine);
      const after = new Date().toISOString();
      const data = JSON.parse(json) as AnnotationExportData;

      expect(data.exportedAt).toBeDefined();
      expect(data.exportedAt >= before).toBe(true);
      expect(data.exportedAt <= after).toBe(true);
    });

    it('ANN-JSON-U012: handles multiple annotations per frame', () => {
      paintEngine.addText(1, { x: 0.1, y: 0.1 }, 'Text 1');
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Text 2');
      paintEngine.addRectangle(1, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 });

      const json = exportAnnotationsJSON(paintEngine);
      const data = JSON.parse(json) as AnnotationExportData;

      expect(data.frames[1]).toHaveLength(3);
      expect(data.statistics.totalAnnotations).toBe(3);
    });
  });

  describe('parseAnnotationsJSON', () => {
    it('ANN-JSON-U013: parses valid exported JSON', () => {
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Test');
      const json = exportAnnotationsJSON(paintEngine);
      const parsed = parseAnnotationsJSON(json);

      expect(parsed).not.toBeNull();
      expect(parsed!.version).toBe(1);
      expect(parsed!.source).toBe('openrv-web');
    });

    it('ANN-JSON-U014: returns null for invalid JSON', () => {
      const result = parseAnnotationsJSON('not valid json');
      expect(result).toBeNull();
    });

    it('ANN-JSON-U015: returns null for wrong version', () => {
      const json = JSON.stringify({ version: 999, source: 'openrv-web', frames: {} });
      const result = parseAnnotationsJSON(json);
      expect(result).toBeNull();
    });

    it('ANN-JSON-U016: returns null for wrong source', () => {
      const json = JSON.stringify({ version: 1, source: 'other-app', frames: {} });
      const result = parseAnnotationsJSON(json);
      expect(result).toBeNull();
    });

    it('ANN-JSON-U017: returns null for missing frames', () => {
      const json = JSON.stringify({ version: 1, source: 'openrv-web' });
      const result = parseAnnotationsJSON(json);
      expect(result).toBeNull();
    });
  });

  describe('downloadAnnotationsJSON', () => {
    it('ANN-JSON-U018: creates download link correctly', () => {
      // Mock DOM APIs
      const mockCreateElement = vi.spyOn(document, 'createElement');
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as never);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as never);
      const mockRevokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const mockCreateObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');

      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      mockCreateElement.mockReturnValue(mockAnchor as never);

      downloadAnnotationsJSON(paintEngine, 'test-export');

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockAnchor.download).toBe('test-export.json');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test');

      // Cleanup
      mockCreateElement.mockRestore();
      mockRevokeObjectURL.mockRestore();
      mockCreateObjectURL.mockRestore();
    });

    it('ANN-JSON-U019: preserves .json extension if provided', () => {
      const mockCreateElement = vi.spyOn(document, 'createElement');
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as never);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as never);
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');

      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      mockCreateElement.mockReturnValue(mockAnchor as never);

      downloadAnnotationsJSON(paintEngine, 'test-export.json');

      expect(mockAnchor.download).toBe('test-export.json');

      vi.restoreAllMocks();
    });
  });

  describe('applyAnnotationsJSON', () => {
    it('ANN-JSON-U020: round-trip export → parse → apply → export produces equivalent data', () => {
      // Create annotations of different types
      paintEngine.tool = 'pen';
      paintEngine.color = [1, 0, 0, 1];
      paintEngine.width = 5;
      paintEngine.beginStroke(1, { x: 0.1, y: 0.2 });
      paintEngine.continueStroke({ x: 0.3, y: 0.4 });
      paintEngine.endStroke();

      paintEngine.addText(2, { x: 0.5, y: 0.5 }, 'Hello world', 24);
      paintEngine.addRectangle(3, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 });

      // Export
      const json1 = exportAnnotationsJSON(paintEngine, { includeEffects: true });
      const data1 = JSON.parse(json1) as AnnotationExportData;

      // Parse
      const parsed = parseAnnotationsJSON(json1);
      expect(parsed).not.toBeNull();

      // Apply to a fresh PaintEngine
      const paintEngine2 = new PaintEngine();
      applyAnnotationsJSON(paintEngine2, parsed!);

      // Export again
      const json2 = exportAnnotationsJSON(paintEngine2, { includeEffects: true });
      const data2 = JSON.parse(json2) as AnnotationExportData;

      // Compare (ignoring exportedAt timestamp)
      expect(data2.version).toBe(data1.version);
      expect(data2.source).toBe(data1.source);
      expect(data2.statistics).toEqual(data1.statistics);
      expect(data2.frameRange).toEqual(data1.frameRange);
      expect(Object.keys(data2.frames)).toEqual(Object.keys(data1.frames));

      // Compare annotations per frame
      for (const frameStr of Object.keys(data1.frames)) {
        const frame = Number(frameStr);
        expect(data2.frames[frame]).toHaveLength(data1.frames[frame]!.length);
        for (let i = 0; i < data1.frames[frame]!.length; i++) {
          expect(data2.frames[frame]![i]!.type).toBe(data1.frames[frame]![i]!.type);
          expect(data2.frames[frame]![i]!.frame).toBe(data1.frames[frame]![i]!.frame);
        }
      }
    });

    it('ANN-JSON-U021: replace mode clears existing annotations before applying', () => {
      // Add initial annotations
      paintEngine.addText(1, { x: 0.1, y: 0.1 }, 'Existing annotation');
      paintEngine.addRectangle(2, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 });

      // Create import data with different annotations
      const importEngine = new PaintEngine();
      importEngine.addText(5, { x: 0.5, y: 0.5 }, 'Imported annotation');

      const json = exportAnnotationsJSON(importEngine);
      const importData = parseAnnotationsJSON(json)!;

      // Apply in replace mode (default)
      applyAnnotationsJSON(paintEngine, importData, { mode: 'replace' });

      // Export to check the result
      const resultJson = exportAnnotationsJSON(paintEngine);
      const result = JSON.parse(resultJson) as AnnotationExportData;

      // Should only have the imported annotation, existing ones should be cleared
      expect(result.statistics.totalAnnotations).toBe(1);
      expect(result.frames[1]).toBeUndefined();
      expect(result.frames[2]).toBeUndefined();
      expect(result.frames[5]).toHaveLength(1);
      expect(result.frames[5]![0]!.type).toBe('text');
    });

    it('ANN-JSON-U022: merge mode preserves existing annotations and adds new ones', () => {
      // Add initial annotations
      paintEngine.addText(1, { x: 0.1, y: 0.1 }, 'Existing annotation');

      // Create import data with different annotations
      const importEngine = new PaintEngine();
      importEngine.addText(5, { x: 0.5, y: 0.5 }, 'Imported annotation');

      const json = exportAnnotationsJSON(importEngine);
      const importData = parseAnnotationsJSON(json)!;

      // Apply in merge mode
      applyAnnotationsJSON(paintEngine, importData, { mode: 'merge' });

      // Export to check the result
      const resultJson = exportAnnotationsJSON(paintEngine);
      const result = JSON.parse(resultJson) as AnnotationExportData;

      // Should have both existing and imported annotations
      expect(result.statistics.totalAnnotations).toBe(2);
      expect(result.frames[1]).toHaveLength(1);
      expect(result.frames[5]).toHaveLength(1);
    });

    it('ANN-JSON-U023: frame offset shifts all annotation frames correctly', () => {
      // Create import data with annotations on specific frames
      const importEngine = new PaintEngine();
      importEngine.addText(5, { x: 0.5, y: 0.5 }, 'Frame 5');
      importEngine.addText(10, { x: 0.5, y: 0.5 }, 'Frame 10');
      importEngine.addRectangle(15, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 });

      const json = exportAnnotationsJSON(importEngine);
      const importData = parseAnnotationsJSON(json)!;

      // Apply with frame offset of 100
      applyAnnotationsJSON(paintEngine, importData, { frameOffset: 100 });

      // Export to check the result
      const resultJson = exportAnnotationsJSON(paintEngine);
      const result = JSON.parse(resultJson) as AnnotationExportData;

      // Annotations should be shifted by 100 frames
      expect(result.statistics.totalAnnotations).toBe(3);
      expect(result.frames[5]).toBeUndefined();
      expect(result.frames[10]).toBeUndefined();
      expect(result.frames[15]).toBeUndefined();
      expect(result.frames[105]).toHaveLength(1);
      expect(result.frames[110]).toHaveLength(1);
      expect(result.frames[115]).toHaveLength(1);
    });

    it('ANN-JSON-U024: returns correct count of applied annotations', () => {
      // Create import data with multiple annotations
      const importEngine = new PaintEngine();
      importEngine.addText(1, { x: 0.1, y: 0.1 }, 'Text 1');
      importEngine.addText(1, { x: 0.5, y: 0.5 }, 'Text 2');
      importEngine.addRectangle(2, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 });

      importEngine.tool = 'pen';
      importEngine.beginStroke(3, { x: 0.1, y: 0.2 });
      importEngine.continueStroke({ x: 0.3, y: 0.4 });
      importEngine.endStroke();

      const json = exportAnnotationsJSON(importEngine);
      const importData = parseAnnotationsJSON(json)!;

      const count = applyAnnotationsJSON(paintEngine, importData);

      expect(count).toBe(4);
    });

    it('ANN-JSON-U025: ID collision avoidance when applying multiple times in merge mode', () => {
      // Create import data
      const importEngine = new PaintEngine();
      importEngine.addText(1, { x: 0.5, y: 0.5 }, 'Annotation A');

      const json = exportAnnotationsJSON(importEngine);
      const importData = parseAnnotationsJSON(json)!;

      // Apply twice in merge mode
      applyAnnotationsJSON(paintEngine, importData, { mode: 'merge' });
      applyAnnotationsJSON(paintEngine, importData, { mode: 'merge' });

      // Export to check the result
      const resultJson = exportAnnotationsJSON(paintEngine);
      const result = JSON.parse(resultJson) as AnnotationExportData;

      // Should have both copies of the annotation on frame 1
      expect(result.statistics.totalAnnotations).toBe(2);
      expect(result.frames[1]).toHaveLength(2);
    });

    it('ANN-JSON-U026: effects (hold/ghost) are applied from import data', () => {
      // Create import data with effects
      const importEngine = new PaintEngine();
      importEngine.setGhostMode(true, 7, 4);
      importEngine.setHoldMode(true);
      importEngine.addText(1, { x: 0.5, y: 0.5 }, 'With effects');

      const json = exportAnnotationsJSON(importEngine, { includeEffects: true });
      const importData = parseAnnotationsJSON(json)!;

      // Verify effects exist in import data
      expect(importData.effects).toBeDefined();
      expect(importData.effects!.ghost).toBe(true);
      expect(importData.effects!.ghostBefore).toBe(7);
      expect(importData.effects!.ghostAfter).toBe(4);
      expect(importData.effects!.hold).toBe(true);

      // Apply to a fresh engine
      applyAnnotationsJSON(paintEngine, importData);

      // Check effects were applied
      const effects = paintEngine.effects;
      expect(effects.ghost).toBe(true);
      expect(effects.ghostBefore).toBe(7);
      expect(effects.ghostAfter).toBe(4);
      expect(effects.hold).toBe(true);
    });

    it('ANN-JSON-U027: empty import data applies 0 annotations', () => {
      // Add some existing annotations
      paintEngine.addText(1, { x: 0.5, y: 0.5 }, 'Existing');

      // Create empty import data
      const emptyData: AnnotationExportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        source: 'openrv-web',
        frameRange: { start: 0, end: 0, totalFrames: 0 },
        statistics: {
          totalAnnotations: 0,
          penStrokes: 0,
          textAnnotations: 0,
          shapeAnnotations: 0,
          annotatedFrames: 0,
        },
        frames: {},
      };

      const count = applyAnnotationsJSON(paintEngine, emptyData);

      expect(count).toBe(0);

      // In replace mode (default), existing annotations should be cleared
      const resultJson = exportAnnotationsJSON(paintEngine);
      const result = JSON.parse(resultJson) as AnnotationExportData;
      expect(result.statistics.totalAnnotations).toBe(0);
    });
  });
});
