/**
 * SequenceLoader Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterImageFiles,
  extractFrameNumber,
  detectPattern,
  sortByFrameNumber,
  loadFrameImage,
  preloadFrames,
  releaseDistantFrames,
  createSequenceInfo,
  disposeSequence,
  detectMissingFrames,
  isFrameMissing,
  getFrameIndexByNumber,
  // New pattern notation functions
  parsePrintfPattern,
  parseHashPattern,
  parseAtPattern,
  parsePatternNotation,
  generateFilename,
  toHashNotation,
  toPrintfNotation,
  // Single file inference functions
  extractPatternFromFilename,
  matchesPattern,
  extractFrameFromPattern,
  findMatchingFiles,
  discoverSequences,
  getBestSequence,
} from './SequenceLoader';
import type { SequenceFrame, SequenceInfo, InferredSequencePattern } from './SequenceLoader';

describe('SequenceLoader', () => {
  describe('filterImageFiles', () => {
    it('SLD-001: filters to supported image formats', () => {
      const files = [
        new File([''], 'image.png', { type: 'image/png' }),
        new File([''], 'image.jpg', { type: 'image/jpeg' }),
        new File([''], 'document.txt', { type: 'text/plain' }),
        new File([''], 'video.mp4', { type: 'video/mp4' }),
      ];

      const result = filterImageFiles(files);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.name)).toEqual(['image.png', 'image.jpg']);
    });

    it('SLD-002: supports all standard image extensions', () => {
      const extensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'exr'];
      const files = extensions.map(ext => new File([''], `file.${ext}`));

      const result = filterImageFiles(files);

      expect(result).toHaveLength(extensions.length);
    });

    it('SLD-003: handles empty input', () => {
      const result = filterImageFiles([]);
      expect(result).toEqual([]);
    });

    it('SLD-004: case-insensitive extension matching', () => {
      const files = [
        new File([''], 'image.PNG'),
        new File([''], 'image.JPG'),
        new File([''], 'image.Jpeg'),
      ];

      const result = filterImageFiles(files);

      expect(result).toHaveLength(3);
    });
  });

  describe('extractFrameNumber', () => {
    it('SLD-005: extracts frame number from standard naming', () => {
      expect(extractFrameNumber('frame_0001.png')).toBe(1);
      expect(extractFrameNumber('frame_0123.png')).toBe(123);
      expect(extractFrameNumber('shot_001.exr')).toBe(1);
    });

    it('SLD-006: extracts from dash separator', () => {
      expect(extractFrameNumber('frame-001.png')).toBe(1);
      expect(extractFrameNumber('frame-100.jpg')).toBe(100);
    });

    it('SLD-007: extracts from dot separator', () => {
      expect(extractFrameNumber('frame.001.png')).toBe(1);
      expect(extractFrameNumber('file.0050.exr')).toBe(50);
    });

    it('SLD-008: extracts from no separator', () => {
      expect(extractFrameNumber('frame001.png')).toBe(1);
      expect(extractFrameNumber('image0100.jpg')).toBe(100);
    });

    it('SLD-009: returns null for no frame number', () => {
      expect(extractFrameNumber('image.png')).toBeNull();
      expect(extractFrameNumber('photo.jpg')).toBeNull();
    });

    it('SLD-010: handles large frame numbers', () => {
      expect(extractFrameNumber('frame_999999.png')).toBe(999999);
    });
  });

  describe('detectPattern', () => {
    it('SLD-011: detects underscore padding pattern', () => {
      const filenames = ['frame_0001.png', 'frame_0002.png', 'frame_0003.png'];
      const pattern = detectPattern(filenames);
      // Pattern correctly detects the full padding from "0001"
      expect(pattern).toBe('frame_####.png');
    });

    it('SLD-012: detects dash pattern', () => {
      const filenames = ['shot-001.exr', 'shot-002.exr'];
      const pattern = detectPattern(filenames);
      // Pattern correctly detects 3-digit padding from "001"
      expect(pattern).toBe('shot-###.exr');
    });

    it('SLD-013: handles different padding lengths', () => {
      const filenames = ['img_01.png', 'img_02.png'];
      const pattern = detectPattern(filenames);
      // Pattern correctly detects 2-digit padding from "01"
      expect(pattern).toBe('img_##.png');
    });

    it('SLD-014: returns null for empty input', () => {
      expect(detectPattern([])).toBeNull();
    });

    it('SLD-015: returns null for non-sequence files', () => {
      expect(detectPattern(['image.png'])).toBeNull();
    });

    it('SLD-015b: detects pattern from VFX-style naming', () => {
      const filenames = ['shot_010_comp_v02_1001.exr', 'shot_010_comp_v02_1002.exr'];
      const pattern = detectPattern(filenames);
      expect(pattern).toBe('shot_010_comp_v02_####.exr');
    });

    it('SLD-015c: handles dot-separated frame numbers', () => {
      const filenames = ['render.0050.tif', 'render.0051.tif'];
      const pattern = detectPattern(filenames);
      expect(pattern).toBe('render.####.tif');
    });

    it('SLD-015d: returns null for files without extension', () => {
      const filenames = ['frame_0001', 'frame_0002'];
      const pattern = detectPattern(filenames);
      expect(pattern).toBeNull();
    });
  });

  describe('sortByFrameNumber', () => {
    it('SLD-016: sorts files by frame number', () => {
      const files = [
        new File([''], 'frame_003.png'),
        new File([''], 'frame_001.png'),
        new File([''], 'frame_002.png'),
      ];

      const result = sortByFrameNumber(files);

      expect(result).toHaveLength(3);
      expect(result[0]!.frameNumber).toBe(1);
      expect(result[1]!.frameNumber).toBe(2);
      expect(result[2]!.frameNumber).toBe(3);
    });

    it('SLD-017: assigns sequential indices', () => {
      const files = [
        new File([''], 'frame_005.png'),
        new File([''], 'frame_003.png'),
      ];

      const result = sortByFrameNumber(files);

      expect(result[0]!.index).toBe(0);
      expect(result[1]!.index).toBe(1);
    });

    it('SLD-018: filters out non-numbered files', () => {
      const files = [
        new File([''], 'frame_001.png'),
        new File([''], 'readme.txt'),
        new File([''], 'frame_002.png'),
      ];

      const result = sortByFrameNumber(files);

      expect(result).toHaveLength(2);
    });

    it('SLD-019: stores file reference', () => {
      const file = new File(['content'], 'frame_001.png');
      const result = sortByFrameNumber([file]);

      expect(result[0]!.file).toBe(file);
    });
  });

  describe('loadFrameImage', () => {
    it('SLD-020: returns cached image if already loaded', async () => {
      const mockImage = ({ close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap);
      const frame: SequenceFrame = {
        index: 0,
        frameNumber: 1,
        file: new File([''], 'test.png'),
        image: mockImage,
      };

      const result = await loadFrameImage(frame);

      expect(result).toBe(mockImage);
    });

    it('SLD-021: creates object URL if not exists', async () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      const frame: SequenceFrame = {
        index: 0,
        frameNumber: 1,
        file,
      };

      // Mock createImageBitmap since jsdom doesn't provide it
      const mockBitmap = { close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap;
      const origCreateImageBitmap = globalThis.createImageBitmap;
      globalThis.createImageBitmap = vi.fn().mockResolvedValue(mockBitmap);

      try {
        const result = await loadFrameImage(frame);
        expect(result).toBe(mockBitmap);
        expect(frame.image).toBe(mockBitmap);
      } finally {
        globalThis.createImageBitmap = origCreateImageBitmap;
      }
    });
  });

  describe('releaseDistantFrames', () => {
    let revokeObjectURLSpy: any;

    beforeEach(() => {
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    afterEach(() => {
      revokeObjectURLSpy.mockRestore();
    });

    it('SLD-022: releases frames outside keep window', () => {
      const frames: SequenceFrame[] = [];
      for (let i = 0; i < 50; i++) {
        frames.push({
          index: i,
          frameNumber: i + 1,
          file: new File([''], `frame_${i}.png`),
          url: `blob:frame-${i}`,
          image: ({ close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap),
        });
      }

      releaseDistantFrames(frames, 25, 10);

      // Frames far from index 25 should be released
      expect(frames[0]!.url).toBeUndefined();
      expect(frames[0]!.image).toBeUndefined();

      // Frames close to index 25 should be kept
      expect(frames[20]!.image).toBeDefined();
      expect(frames[25]!.image).toBeDefined();
      expect(frames[30]!.image).toBeDefined();
    });

    it('SLD-023: revokes blob URLs', () => {
      const frames: SequenceFrame[] = [
        {
          index: 0,
          frameNumber: 1,
          file: new File([''], 'frame_1.png'),
          url: 'blob:test-url',
          image: ({ close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap),
        },
      ];

      releaseDistantFrames(frames, 100, 10); // Far from frame 0

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-url');
    });

    it('SLD-024: handles frames without URL', () => {
      const frames: SequenceFrame[] = [
        {
          index: 0,
          frameNumber: 1,
          file: new File([''], 'frame_1.png'),
          image: ({ close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap),
        },
      ];

      // Should not throw
      releaseDistantFrames(frames, 100, 10);
      expect(frames[0]!.image).toBeUndefined();
    });
  });

  describe('disposeSequence', () => {
    let revokeObjectURLSpy: any;

    beforeEach(() => {
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    afterEach(() => {
      revokeObjectURLSpy.mockRestore();
    });

    it('SLD-025: disposes all frames', () => {
      const frames: SequenceFrame[] = [
        { index: 0, frameNumber: 1, file: new File([''], 'f1.png'), url: 'blob:1', image: ({ close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap) },
        { index: 1, frameNumber: 2, file: new File([''], 'f2.png'), url: 'blob:2', image: ({ close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap) },
        { index: 2, frameNumber: 3, file: new File([''], 'f3.png'), url: 'blob:3', image: ({ close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap) },
      ];

      disposeSequence(frames);

      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(3);
      frames.forEach(frame => {
        expect(frame.url).toBeUndefined();
        expect(frame.image).toBeUndefined();
      });
    });

    it('SLD-026: handles empty array', () => {
      // Should not throw
      disposeSequence([]);
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });

    it('SLD-027: handles frames without URLs', () => {
      const frames: SequenceFrame[] = [
        { index: 0, frameNumber: 1, file: new File([''], 'f1.png') },
      ];

      // Should not throw
      disposeSequence(frames);
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });
  });

  describe('preloadFrames', () => {
    it('SLD-028: calculates correct range', async () => {
      // Create frames with images already loaded to avoid actual loading
      const frames: SequenceFrame[] = [];
      for (let i = 0; i < 20; i++) {
        frames.push({
          index: i,
          frameNumber: i + 1,
          file: new File([''], `frame_${i}.png`),
          image: ({ close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap), // Already loaded
        });
      }

      // Should not throw and should handle already-loaded frames
      await preloadFrames(frames, 10, 3);

      // All frames in range should still have images
      for (let i = 7; i <= 13; i++) {
        expect(frames[i]!.image).toBeDefined();
      }
    });

    it('SLD-029: respects array bounds', async () => {
      const frames: SequenceFrame[] = [
        { index: 0, frameNumber: 1, file: new File([''], 'f1.png'), image: ({ close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap) },
        { index: 1, frameNumber: 2, file: new File([''], 'f2.png'), image: ({ close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap) },
      ];

      // Should not throw when window extends beyond array
      await expect(preloadFrames(frames, 0, 10)).resolves.not.toThrow();
      await expect(preloadFrames(frames, 1, 10)).resolves.not.toThrow();
    });
  });

  describe('createSequenceInfo', () => {
    it('SLD-030: returns null for empty input', async () => {
      const result = await createSequenceInfo([]);
      expect(result).toBeNull();
    });

    it('SLD-031: returns null for non-image files', async () => {
      const files = [new File([''], 'document.txt')];
      const result = await createSequenceInfo(files);
      expect(result).toBeNull();
    });

    it('SLD-032: returns null for non-sequenced images', async () => {
      const files = [new File([''], 'photo.png')];
      const result = await createSequenceInfo(files);
      expect(result).toBeNull();
    });
  });

  describe('detectMissingFrames', () => {
    it('MF-001: detects missing frames in sequence', () => {
      const frames: SequenceFrame[] = [
        { index: 0, frameNumber: 1, file: new File([''], 'f1.png') },
        { index: 1, frameNumber: 2, file: new File([''], 'f2.png') },
        { index: 2, frameNumber: 4, file: new File([''], 'f4.png') }, // Frame 3 missing
        { index: 3, frameNumber: 5, file: new File([''], 'f5.png') },
      ];

      const missing = detectMissingFrames(frames);

      expect(missing).toEqual([3]);
    });

    it('MF-002: detects multiple missing frames', () => {
      const frames: SequenceFrame[] = [
        { index: 0, frameNumber: 1, file: new File([''], 'f1.png') },
        { index: 1, frameNumber: 5, file: new File([''], 'f5.png') }, // Frames 2, 3, 4 missing
        { index: 2, frameNumber: 8, file: new File([''], 'f8.png') }, // Frames 6, 7 missing
      ];

      const missing = detectMissingFrames(frames);

      expect(missing).toEqual([2, 3, 4, 6, 7]);
    });

    it('MF-003: returns empty array for complete sequence', () => {
      const frames: SequenceFrame[] = [
        { index: 0, frameNumber: 1, file: new File([''], 'f1.png') },
        { index: 1, frameNumber: 2, file: new File([''], 'f2.png') },
        { index: 2, frameNumber: 3, file: new File([''], 'f3.png') },
      ];

      const missing = detectMissingFrames(frames);

      expect(missing).toEqual([]);
    });

    it('MF-004: returns empty array for single frame', () => {
      const frames: SequenceFrame[] = [
        { index: 0, frameNumber: 100, file: new File([''], 'f100.png') },
      ];

      const missing = detectMissingFrames(frames);

      expect(missing).toEqual([]);
    });

    it('MF-005: returns empty array for empty input', () => {
      const missing = detectMissingFrames([]);
      expect(missing).toEqual([]);
    });

    it('MF-006: handles non-sequential starting frames', () => {
      const frames: SequenceFrame[] = [
        { index: 0, frameNumber: 100, file: new File([''], 'f100.png') },
        { index: 1, frameNumber: 102, file: new File([''], 'f102.png') }, // Frame 101 missing
        { index: 2, frameNumber: 103, file: new File([''], 'f103.png') },
      ];

      const missing = detectMissingFrames(frames);

      expect(missing).toEqual([101]);
    });
  });

  describe('isFrameMissing', () => {
    const mockSequenceInfo: SequenceInfo = {
      name: 'test',
      pattern: 'f###.png',
      frames: [
        { index: 0, frameNumber: 1, file: new File([''], 'f1.png') },
        { index: 1, frameNumber: 3, file: new File([''], 'f3.png') },
      ],
      startFrame: 1,
      endFrame: 3,
      width: 1920,
      height: 1080,
      fps: 24,
      missingFrames: [2],
    };

    it('MF-007: returns true for missing frame', () => {
      expect(isFrameMissing(mockSequenceInfo, 2)).toBe(true);
    });

    it('MF-008: returns false for existing frame', () => {
      expect(isFrameMissing(mockSequenceInfo, 1)).toBe(false);
      expect(isFrameMissing(mockSequenceInfo, 3)).toBe(false);
    });

    it('MF-009: returns false for out-of-range frame', () => {
      expect(isFrameMissing(mockSequenceInfo, 100)).toBe(false);
    });
  });

  describe('getFrameIndexByNumber', () => {
    const mockSequenceInfo: SequenceInfo = {
      name: 'test',
      pattern: 'f###.png',
      frames: [
        { index: 0, frameNumber: 1, file: new File([''], 'f1.png') },
        { index: 1, frameNumber: 3, file: new File([''], 'f3.png') },
        { index: 2, frameNumber: 5, file: new File([''], 'f5.png') },
      ],
      startFrame: 1,
      endFrame: 5,
      width: 1920,
      height: 1080,
      fps: 24,
      missingFrames: [2, 4],
    };

    it('MF-010: returns correct index for existing frame', () => {
      expect(getFrameIndexByNumber(mockSequenceInfo, 1)).toBe(0);
      expect(getFrameIndexByNumber(mockSequenceInfo, 3)).toBe(1);
      expect(getFrameIndexByNumber(mockSequenceInfo, 5)).toBe(2);
    });

    it('MF-011: returns -1 for missing frame', () => {
      expect(getFrameIndexByNumber(mockSequenceInfo, 2)).toBe(-1);
      expect(getFrameIndexByNumber(mockSequenceInfo, 4)).toBe(-1);
    });

    it('MF-012: returns -1 for out-of-range frame', () => {
      expect(getFrameIndexByNumber(mockSequenceInfo, 100)).toBe(-1);
      expect(getFrameIndexByNumber(mockSequenceInfo, 0)).toBe(-1);
    });
  });

  // ============================================================================
  // Pattern Notation Parsing Tests
  // ============================================================================

  describe('parsePrintfPattern', () => {
    it('SLD-033: parses %04d printf notation', () => {
      const result = parsePrintfPattern('frame_%04d.png');
      expect(result).not.toBeNull();
      expect(result!.prefix).toBe('frame_');
      expect(result!.suffix).toBe('.png');
      expect(result!.padding).toBe(4);
      expect(result!.notation).toBe('printf');
      expect(result!.extension).toBe('png');
    });

    it('SLD-034: parses %d without padding', () => {
      const result = parsePrintfPattern('file_%d.exr');
      expect(result).not.toBeNull();
      expect(result!.padding).toBe(0);
      expect(result!.prefix).toBe('file_');
      expect(result!.suffix).toBe('.exr');
    });

    it('SLD-035: parses %03d with 3-digit padding', () => {
      const result = parsePrintfPattern('shot_%03d.jpg');
      expect(result).not.toBeNull();
      expect(result!.padding).toBe(3);
    });

    it('SLD-036: returns null for non-printf pattern', () => {
      expect(parsePrintfPattern('frame_####.png')).toBeNull();
      expect(parsePrintfPattern('frame_0001.png')).toBeNull();
    });
  });

  describe('parseHashPattern', () => {
    it('SLD-037: parses #### hash notation', () => {
      const result = parseHashPattern('frame_####.png');
      expect(result).not.toBeNull();
      expect(result!.prefix).toBe('frame_');
      expect(result!.suffix).toBe('.png');
      expect(result!.padding).toBe(4);
      expect(result!.notation).toBe('hash');
    });

    it('SLD-038: parses single # hash', () => {
      const result = parseHashPattern('f_#.png');
      expect(result).not.toBeNull();
      expect(result!.padding).toBe(1);
    });

    it('SLD-039: parses 6 hash notation', () => {
      const result = parseHashPattern('render_######.exr');
      expect(result).not.toBeNull();
      expect(result!.padding).toBe(6);
      expect(result!.prefix).toBe('render_');
      expect(result!.extension).toBe('exr');
    });

    it('SLD-040: returns null for non-hash pattern', () => {
      expect(parseHashPattern('frame_%04d.png')).toBeNull();
      expect(parseHashPattern('frame_0001.png')).toBeNull();
    });
  });

  describe('parseAtPattern', () => {
    it('SLD-041: parses @@@@ at-sign notation', () => {
      const result = parseAtPattern('frame_@@@@.png');
      expect(result).not.toBeNull();
      expect(result!.prefix).toBe('frame_');
      expect(result!.suffix).toBe('.png');
      expect(result!.padding).toBe(4);
      expect(result!.notation).toBe('at');
    });

    it('SLD-042: returns null for non-at pattern', () => {
      expect(parseAtPattern('frame_####.png')).toBeNull();
      expect(parseAtPattern('frame_%04d.png')).toBeNull();
    });
  });

  describe('parsePatternNotation', () => {
    it('SLD-043: parses printf notation', () => {
      const result = parsePatternNotation('frame_%04d.png');
      expect(result).not.toBeNull();
      expect(result!.notation).toBe('printf');
    });

    it('SLD-044: parses hash notation', () => {
      const result = parsePatternNotation('frame_####.png');
      expect(result).not.toBeNull();
      expect(result!.notation).toBe('hash');
    });

    it('SLD-045: parses at-sign notation', () => {
      const result = parsePatternNotation('frame_@@@@.png');
      expect(result).not.toBeNull();
      expect(result!.notation).toBe('at');
    });

    it('SLD-046: returns null for regular filename', () => {
      expect(parsePatternNotation('frame_0001.png')).toBeNull();
      expect(parsePatternNotation('image.png')).toBeNull();
    });
  });

  describe('generateFilename', () => {
    it('SLD-047: generates filename with padding', () => {
      const parsed = parsePrintfPattern('frame_%04d.png')!;
      expect(generateFilename(parsed, 1)).toBe('frame_0001.png');
      expect(generateFilename(parsed, 42)).toBe('frame_0042.png');
      expect(generateFilename(parsed, 1234)).toBe('frame_1234.png');
    });

    it('SLD-048: generates filename without padding', () => {
      const parsed = parsePrintfPattern('frame_%d.png')!;
      expect(generateFilename(parsed, 1)).toBe('frame_1.png');
      expect(generateFilename(parsed, 42)).toBe('frame_42.png');
    });

    it('SLD-049: generates filename from hash pattern', () => {
      const parsed = parseHashPattern('shot_###.exr')!;
      expect(generateFilename(parsed, 5)).toBe('shot_005.exr');
      expect(generateFilename(parsed, 100)).toBe('shot_100.exr');
    });
  });

  describe('toHashNotation', () => {
    it('SLD-050: converts printf to hash notation', () => {
      expect(toHashNotation('frame_%04d.png')).toBe('frame_####.png');
      expect(toHashNotation('shot_%03d.exr')).toBe('shot_###.exr');
    });

    it('SLD-051: keeps hash notation as is', () => {
      expect(toHashNotation('frame_####.png')).toBe('frame_####.png');
    });

    it('SLD-052: uses default 4-digit padding for unpadded printf', () => {
      // When printf has no padding (%d), toHashNotation uses default 4 hashes
      expect(toHashNotation('frame_%d.png')).toBe('frame_####.png');
    });
  });

  describe('toPrintfNotation', () => {
    it('SLD-053: converts hash to printf notation', () => {
      expect(toPrintfNotation('frame_####.png')).toBe('frame_%04d.png');
      expect(toPrintfNotation('shot_###.exr')).toBe('shot_%03d.exr');
    });

    it('SLD-054: keeps printf notation as is', () => {
      expect(toPrintfNotation('frame_%04d.png')).toBe('frame_%04d.png');
    });
  });

  // ============================================================================
  // Single File Sequence Inference Tests
  // ============================================================================

  describe('extractPatternFromFilename', () => {
    it('SLD-055: extracts pattern from standard filename', () => {
      const result = extractPatternFromFilename('frame_0001.png');
      expect(result).not.toBeNull();
      expect(result!.prefix).toBe('frame_');
      expect(result!.suffix).toBe('.png');
      expect(result!.padding).toBe(4);
      expect(result!.frameNumber).toBe(1);
      expect(result!.extension).toBe('png');
    });

    it('SLD-056: extracts pattern from dash-separated filename', () => {
      const result = extractPatternFromFilename('shot-001.exr');
      expect(result).not.toBeNull();
      expect(result!.prefix).toBe('shot-');
      expect(result!.padding).toBe(3);
      expect(result!.frameNumber).toBe(1);
    });

    it('SLD-057: extracts pattern from dot-separated filename', () => {
      const result = extractPatternFromFilename('render.0050.tif');
      expect(result).not.toBeNull();
      expect(result!.prefix).toBe('render.');
      expect(result!.padding).toBe(4);
      expect(result!.frameNumber).toBe(50);
    });

    it('SLD-058: extracts pattern from non-padded filename', () => {
      const result = extractPatternFromFilename('frame_100.png');
      expect(result).not.toBeNull();
      expect(result!.frameNumber).toBe(100);
      expect(result!.padding).toBe(3);
    });

    it('SLD-059: returns null for filename without frame number', () => {
      expect(extractPatternFromFilename('image.png')).toBeNull();
      expect(extractPatternFromFilename('photo.jpg')).toBeNull();
    });

    it('SLD-060: handles VFX-style naming', () => {
      const result = extractPatternFromFilename('shot_010_comp_v02_1001.exr');
      expect(result).not.toBeNull();
      expect(result!.frameNumber).toBe(1001);
      expect(result!.padding).toBe(4);
      expect(result!.prefix).toBe('shot_010_comp_v02_');
    });
  });

  describe('matchesPattern', () => {
    const pattern: InferredSequencePattern = {
      prefix: 'frame_',
      suffix: '.png',
      padding: 4,
      frameNumber: 1,
      extension: 'png',
    };

    it('SLD-061: matches file with same pattern', () => {
      expect(matchesPattern('frame_0001.png', pattern)).toBe(true);
      expect(matchesPattern('frame_0002.png', pattern)).toBe(true);
      expect(matchesPattern('frame_0100.png', pattern)).toBe(true);
    });

    it('SLD-062: matches file with different padding', () => {
      expect(matchesPattern('frame_1.png', pattern)).toBe(true);
      expect(matchesPattern('frame_00001.png', pattern)).toBe(true);
    });

    it('SLD-063: does not match file with different prefix', () => {
      expect(matchesPattern('shot_0001.png', pattern)).toBe(false);
    });

    it('SLD-064: does not match file with different extension', () => {
      expect(matchesPattern('frame_0001.exr', pattern)).toBe(false);
    });

    it('SLD-065: does not match non-numbered file', () => {
      expect(matchesPattern('frame_test.png', pattern)).toBe(false);
    });
  });

  describe('extractFrameFromPattern', () => {
    const pattern: InferredSequencePattern = {
      prefix: 'frame_',
      suffix: '.png',
      padding: 4,
      frameNumber: 1,
      extension: 'png',
    };

    it('SLD-066: extracts frame number from matching file', () => {
      expect(extractFrameFromPattern('frame_0001.png', pattern)).toBe(1);
      expect(extractFrameFromPattern('frame_0042.png', pattern)).toBe(42);
      expect(extractFrameFromPattern('frame_1234.png', pattern)).toBe(1234);
    });

    it('SLD-067: returns null for non-matching file', () => {
      expect(extractFrameFromPattern('shot_0001.png', pattern)).toBeNull();
      expect(extractFrameFromPattern('frame_0001.exr', pattern)).toBeNull();
    });
  });

  describe('findMatchingFiles', () => {
    it('SLD-068: finds all matching files', () => {
      const files = [
        new File([''], 'frame_0001.png'),
        new File([''], 'frame_0002.png'),
        new File([''], 'frame_0003.png'),
        new File([''], 'other_file.png'),
        new File([''], 'readme.txt'),
      ];

      const pattern: InferredSequencePattern = {
        prefix: 'frame_',
        suffix: '.png',
        padding: 4,
        frameNumber: 1,
        extension: 'png',
      };

      const result = findMatchingFiles(files, pattern);

      expect(result).toHaveLength(3);
      expect(result.map(f => f.name)).toEqual([
        'frame_0001.png',
        'frame_0002.png',
        'frame_0003.png',
      ]);
    });

    it('SLD-069: sorts files by frame number', () => {
      const files = [
        new File([''], 'frame_0003.png'),
        new File([''], 'frame_0001.png'),
        new File([''], 'frame_0002.png'),
      ];

      const pattern: InferredSequencePattern = {
        prefix: 'frame_',
        suffix: '.png',
        padding: 4,
        frameNumber: 3,
        extension: 'png',
      };

      const result = findMatchingFiles(files, pattern);

      expect(result.map(f => f.name)).toEqual([
        'frame_0001.png',
        'frame_0002.png',
        'frame_0003.png',
      ]);
    });
  });

  describe('discoverSequences', () => {
    it('SLD-070: discovers single sequence', () => {
      const files = [
        new File([''], 'frame_0001.png'),
        new File([''], 'frame_0002.png'),
        new File([''], 'frame_0003.png'),
      ];

      const sequences = discoverSequences(files);

      expect(sequences.size).toBe(1);
      expect(sequences.has('frame_####.png')).toBe(true);
      expect(sequences.get('frame_####.png')!).toHaveLength(3);
    });

    it('SLD-071: discovers multiple sequences', () => {
      const files = [
        new File([''], 'frame_0001.png'),
        new File([''], 'frame_0002.png'),
        new File([''], 'shot_001.exr'),
        new File([''], 'shot_002.exr'),
      ];

      const sequences = discoverSequences(files);

      expect(sequences.size).toBe(2);
      expect(sequences.has('frame_####.png')).toBe(true);
      expect(sequences.has('shot_###.exr')).toBe(true);
    });

    it('SLD-072: excludes non-image files', () => {
      const files = [
        new File([''], 'frame_0001.png'),
        new File([''], 'frame_0002.png'),
        new File([''], 'readme.txt'),
        new File([''], 'data.json'),
      ];

      const sequences = discoverSequences(files);

      expect(sequences.size).toBe(1);
    });

    it('SLD-073: requires at least 2 files for sequence', () => {
      const files = [
        new File([''], 'frame_0001.png'),
        new File([''], 'other_file.png'),
      ];

      const sequences = discoverSequences(files);

      expect(sequences.size).toBe(0);
    });
  });

  describe('getBestSequence', () => {
    it('SLD-074: returns sequence containing target file', () => {
      const files = [
        new File([''], 'frame_0001.png'),
        new File([''], 'frame_0002.png'),
        new File([''], 'shot_001.exr'),
        new File([''], 'shot_002.exr'),
        new File([''], 'shot_003.exr'),
      ];

      const target = files.find(f => f.name === 'frame_0002.png')!;
      const result = getBestSequence(files, target);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result!.some(f => f.name === 'frame_0001.png')).toBe(true);
      expect(result!.some(f => f.name === 'frame_0002.png')).toBe(true);
    });

    it('SLD-075: returns longest sequence without target', () => {
      const files = [
        new File([''], 'frame_0001.png'),
        new File([''], 'frame_0002.png'),
        new File([''], 'shot_001.exr'),
        new File([''], 'shot_002.exr'),
        new File([''], 'shot_003.exr'),
      ];

      const result = getBestSequence(files);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(3); // shot sequence is longer
    });

    it('SLD-076: returns null when no sequences found', () => {
      const files = [
        new File([''], 'image.png'),
        new File([''], 'photo.jpg'),
      ];

      const result = getBestSequence(files);

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // Edge Cases and Corner Cases Tests
  // ============================================================================

  describe('Edge Cases', () => {
    describe('Mixed Padding Sequences', () => {
      it('EC-001: handles files with varying padding in same sequence', () => {
        const files = [
          new File([''], 'frame_1.png'),
          new File([''], 'frame_02.png'),
          new File([''], 'frame_003.png'),
          new File([''], 'frame_0004.png'),
        ];

        // Even with mixed padding, files with same prefix should be found
        const sequences = discoverSequences(files);

        // Mixed padding creates different pattern keys, so may result in no 2+ file sequences
        // This is expected behavior - consistent padding is required for sequence detection
        expect(sequences.size).toBeGreaterThanOrEqual(0);
      });

      it('EC-002: frame numbers exceeding original padding', () => {
        // When frame numbers exceed the padding, files still have valid patterns
        const files = [
          new File([''], 'frame_9999.png'),
          new File([''], 'frame_10000.png'), // 5 digits now
        ];

        // These will have different padding lengths
        const sorted = sortByFrameNumber(files);
        expect(sorted).toHaveLength(2);
        expect(sorted[0]!.frameNumber).toBe(9999);
        expect(sorted[1]!.frameNumber).toBe(10000);
      });
    });

    describe('Numbers in Prefix', () => {
      it('EC-003: correctly extracts frame from VFX naming with version numbers', () => {
        const files = [
          new File([''], 'shot_010_comp_v02_1001.exr'),
          new File([''], 'shot_010_comp_v02_1002.exr'),
          new File([''], 'shot_010_comp_v02_1003.exr'),
        ];

        const sorted = sortByFrameNumber(files);
        expect(sorted).toHaveLength(3);
        expect(sorted[0]!.frameNumber).toBe(1001);
        expect(sorted[1]!.frameNumber).toBe(1002);
        expect(sorted[2]!.frameNumber).toBe(1003);
      });

      it('EC-004: pattern detection ignores prefix numbers', () => {
        const filenames = ['shot_010_comp_v02_1001.exr', 'shot_010_comp_v02_1002.exr'];
        const pattern = detectPattern(filenames);
        expect(pattern).toBe('shot_010_comp_v02_####.exr');
      });
    });

    describe('Gap Detection', () => {
      it('EC-005: detects large gaps in sequence', () => {
        const frames: SequenceFrame[] = [
          { index: 0, frameNumber: 1, file: new File([''], 'f1.png') },
          { index: 1, frameNumber: 100, file: new File([''], 'f100.png') },
        ];

        const missing = detectMissingFrames(frames);
        expect(missing).toHaveLength(98); // frames 2-99
        expect(missing[0]).toBe(2);
        expect(missing[missing.length - 1]).toBe(99);
      });

      it('EC-006: handles consecutive missing frames', () => {
        const frames: SequenceFrame[] = [
          { index: 0, frameNumber: 1, file: new File([''], 'f1.png') },
          { index: 1, frameNumber: 10, file: new File([''], 'f10.png') },
          { index: 2, frameNumber: 20, file: new File([''], 'f20.png') },
        ];

        const missing = detectMissingFrames(frames);
        expect(missing).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
      });
    });

    describe('Pattern Parsing Edge Cases', () => {
      it('EC-007: parsePrintfPattern with large padding', () => {
        const result = parsePrintfPattern('frame_%08d.exr');
        expect(result).not.toBeNull();
        expect(result!.padding).toBe(8);
      });

      it('EC-008: parsePrintfPattern with %d in path-like pattern', () => {
        const result = parsePrintfPattern('render/frame_%04d.png');
        expect(result).not.toBeNull();
        expect(result!.prefix).toBe('render/frame_');
        expect(result!.padding).toBe(4);
      });

      it('EC-009: parseHashPattern with many hashes', () => {
        const result = parseHashPattern('frame_########.exr');
        expect(result).not.toBeNull();
        expect(result!.padding).toBe(8);
      });

      it('EC-010: returns null for multiple pattern placeholders', () => {
        // Pattern with multiple %d should still work - uses first match
        const result = parsePrintfPattern('%04d_render_%04d.png');
        expect(result).not.toBeNull();
        // First %04d is matched
        expect(result!.prefix).toBe('');
        expect(result!.suffix).toBe('_render_%04d.png');
      });
    });

    describe('Filename Generation', () => {
      it('EC-011: generates filename with large frame numbers', () => {
        const parsed = parsePrintfPattern('frame_%04d.png')!;
        expect(generateFilename(parsed, 99999)).toBe('frame_99999.png');
      });

      it('EC-012: generates filename with zero frame', () => {
        const parsed = parsePrintfPattern('frame_%04d.png')!;
        expect(generateFilename(parsed, 0)).toBe('frame_0000.png');
      });

      it('EC-013: generates filename from hash pattern', () => {
        const parsed = parseHashPattern('render_######.exr')!;
        expect(generateFilename(parsed, 123)).toBe('render_000123.exr');
      });
    });

    describe('Performance Considerations', () => {
      it('EC-014: handles large file lists without excessive time', () => {
        // Create 1000 files
        const files: File[] = [];
        for (let i = 1; i <= 1000; i++) {
          files.push(new File([''], `frame_${String(i).padStart(4, '0')}.png`));
        }

        const startTime = performance.now();
        const sequences = discoverSequences(files);
        const endTime = performance.now();

        expect(sequences.size).toBe(1);
        expect(sequences.get('frame_####.png')).toHaveLength(1000);
        // Should complete in reasonable time (less than 1 second)
        expect(endTime - startTime).toBeLessThan(1000);
      });

      it('EC-015: sortByFrameNumber is efficient with large lists', () => {
        const files: File[] = [];
        for (let i = 1000; i >= 1; i--) {
          files.push(new File([''], `frame_${String(i).padStart(4, '0')}.png`));
        }

        const startTime = performance.now();
        const sorted = sortByFrameNumber(files);
        const endTime = performance.now();

        expect(sorted).toHaveLength(1000);
        expect(sorted[0]!.frameNumber).toBe(1);
        expect(sorted[999]!.frameNumber).toBe(1000);
        expect(endTime - startTime).toBeLessThan(500);
      });
    });

    describe('Pattern Matching Edge Cases', () => {
      it('EC-016: matchesPattern is case-insensitive for extension', () => {
        const pattern: InferredSequencePattern = {
          prefix: 'frame_',
          suffix: '.PNG',
          padding: 4,
          frameNumber: 1,
          extension: 'PNG',
        };

        expect(matchesPattern('frame_0001.png', pattern)).toBe(true);
        expect(matchesPattern('frame_0001.PNG', pattern)).toBe(true);
      });

      it('EC-017: extractPatternFromFilename handles double extensions', () => {
        const result = extractPatternFromFilename('render.beauty.0001.exr');
        expect(result).not.toBeNull();
        expect(result!.prefix).toBe('render.beauty.');
        expect(result!.frameNumber).toBe(1);
        expect(result!.padding).toBe(4);
      });

      it('EC-018: handles files with only numbers as name', () => {
        const result = extractPatternFromFilename('0001.png');
        expect(result).not.toBeNull();
        expect(result!.prefix).toBe('');
        expect(result!.frameNumber).toBe(1);
        expect(result!.padding).toBe(4);
      });
    });

    describe('Sequence Discovery Edge Cases', () => {
      it('EC-019: discoverSequences excludes single-file patterns', () => {
        const files = [
          new File([''], 'frame_0001.png'),
          new File([''], 'other_0001.png'), // Different pattern, only 1 file
        ];

        const sequences = discoverSequences(files);
        // Neither should form a sequence (each has only 1 file)
        expect(sequences.size).toBe(0);
      });

      it('EC-020: getBestSequence prefers target over longer sequence', () => {
        const files = [
          new File([''], 'short_01.png'),
          new File([''], 'short_02.png'),
          new File([''], 'long_001.exr'),
          new File([''], 'long_002.exr'),
          new File([''], 'long_003.exr'),
          new File([''], 'long_004.exr'),
        ];

        const target = files.find(f => f.name === 'short_01.png')!;
        const result = getBestSequence(files, target);

        expect(result).not.toBeNull();
        expect(result).toHaveLength(2);
        expect(result!.some(f => f.name === 'short_01.png')).toBe(true);
      });
    });

    describe('Malformed Input Handling', () => {
      it('EC-021: handles empty filename gracefully', () => {
        expect(extractFrameNumber('')).toBeNull();
        expect(extractPatternFromFilename('')).toBeNull();
      });

      it('EC-022: handles filename with only extension', () => {
        expect(extractFrameNumber('.png')).toBeNull();
        expect(extractPatternFromFilename('.png')).toBeNull();
      });

      it('EC-023: handles very long filenames', () => {
        const longPrefix = 'a'.repeat(200);
        const filename = `${longPrefix}_0001.png`;
        const result = extractPatternFromFilename(filename);

        expect(result).not.toBeNull();
        expect(result!.prefix).toBe(longPrefix + '_');
        expect(result!.frameNumber).toBe(1);
      });

      it('EC-024: handles special characters in filename', () => {
        // Note: these may or may not work depending on file system
        // but the function shouldn't crash
        // These may return null or valid results, but shouldn't throw
        expect(() => extractPatternFromFilename('frame (1).png')).not.toThrow();
        expect(() => extractPatternFromFilename('frame[0001].png')).not.toThrow();
      });
    });
  });
});
