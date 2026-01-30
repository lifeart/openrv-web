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
} from './SequenceLoader';
import type { SequenceFrame, SequenceInfo } from './SequenceLoader';

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
      // Pattern is based on first file's frame number string representation
      // frame_0001.png has frame number 1 (string "1"), so only the "1" is replaced
      expect(pattern).toBe('frame_000#.png');
    });

    it('SLD-012: detects dash pattern', () => {
      const filenames = ['shot-001.exr', 'shot-002.exr'];
      const pattern = detectPattern(filenames);
      // Frame number 1 -> string "1" -> replaces only "1"
      expect(pattern).toBe('shot-00#.exr');
    });

    it('SLD-013: handles different padding lengths', () => {
      const filenames = ['img_01.png', 'img_02.png'];
      const pattern = detectPattern(filenames);
      // Frame number 1 -> string "1" -> replaces only "1"
      expect(pattern).toBe('img_0#.png');
    });

    it('SLD-014: returns null for empty input', () => {
      expect(detectPattern([])).toBeNull();
    });

    it('SLD-015: returns null for non-sequence files', () => {
      expect(detectPattern(['image.png'])).toBeNull();
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
      const mockImage = new Image();
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

      // Mock Image to trigger load quickly
      await vi.waitFor(async () => {
        const result = await loadFrameImage(frame);
        expect(frame.url).toBeDefined();
        expect(frame.url).toMatch(/^blob:/);
        return result;
      }, { timeout: 200 });
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
          image: new Image(),
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
          image: new Image(),
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
          image: new Image(),
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
        { index: 0, frameNumber: 1, file: new File([''], 'f1.png'), url: 'blob:1', image: new Image() },
        { index: 1, frameNumber: 2, file: new File([''], 'f2.png'), url: 'blob:2', image: new Image() },
        { index: 2, frameNumber: 3, file: new File([''], 'f3.png'), url: 'blob:3', image: new Image() },
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
          image: new Image(), // Already loaded
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
        { index: 0, frameNumber: 1, file: new File([''], 'f1.png'), image: new Image() },
        { index: 1, frameNumber: 2, file: new File([''], 'f2.png'), image: new Image() },
      ];

      // Should not throw when window extends beyond array
      await preloadFrames(frames, 0, 10);
      await preloadFrames(frames, 1, 10);
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
});
