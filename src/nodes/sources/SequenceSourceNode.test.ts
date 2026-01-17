/**
 * SequenceSourceNode Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SequenceSourceNode } from './SequenceSourceNode';

// Mock the SequenceLoader module
vi.mock('../../utils/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
  loadFrameImage: vi.fn(),
  preloadFrames: vi.fn(),
  releaseDistantFrames: vi.fn(),
  disposeSequence: vi.fn(),
}));

import {
  createSequenceInfo,
  loadFrameImage,
  preloadFrames,
  releaseDistantFrames,
  disposeSequence,
} from '../../utils/SequenceLoader';

describe('SequenceSourceNode', () => {
  let node: SequenceSourceNode;

  beforeEach(() => {
    vi.clearAllMocks();
    node = new SequenceSourceNode('TestSequence');
  });

  afterEach(() => {
    node.dispose();
  });

  describe('initialization', () => {
    it('has correct type', () => {
      expect(node.type).toBe('RVSequenceSource');
    });

    it('has correct default name', () => {
      const defaultNode = new SequenceSourceNode();
      expect(defaultNode.name).toBe('Sequence Source');
      defaultNode.dispose();
    });

    it('has pattern property', () => {
      expect(node.properties.has('pattern')).toBe(true);
      expect(node.properties.getValue('pattern')).toBe('');
    });

    it('has frame range properties', () => {
      expect(node.properties.has('startFrame')).toBe(true);
      expect(node.properties.has('endFrame')).toBe(true);
      expect(node.properties.getValue('startFrame')).toBe(1);
      expect(node.properties.getValue('endFrame')).toBe(1);
    });

    it('has fps property', () => {
      expect(node.properties.has('fps')).toBe(true);
      expect(node.properties.getValue('fps')).toBe(24);
    });
  });

  describe('isReady', () => {
    it('returns false when no sequence loaded', () => {
      expect(node.isReady()).toBe(false);
    });
  });

  describe('getElement', () => {
    it('returns null when no sequence loaded', () => {
      expect(node.getElement(1)).toBeNull();
    });
  });

  describe('loadFiles', () => {
    it('SSN-001: loads sequence from files', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 1920 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 1080 });

      const mockInfo = {
        name: 'test_sequence',
        pattern: 'frame_####.png',
        frames: [
          { index: 0, frameNumber: 1, file: new File([''], 'frame_0001.png'), image: mockImage },
          { index: 1, frameNumber: 2, file: new File([''], 'frame_0002.png') },
          { index: 2, frameNumber: 3, file: new File([''], 'frame_0003.png') },
        ],
        startFrame: 1,
        endFrame: 3,
        width: 1920,
        height: 1080,
        fps: 24,
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);

      const files = [
        new File([''], 'frame_0001.png', { type: 'image/png' }),
        new File([''], 'frame_0002.png', { type: 'image/png' }),
        new File([''], 'frame_0003.png', { type: 'image/png' }),
      ];

      await node.loadFiles(files, 24);

      expect(node.isReady()).toBe(true);
      expect(createSequenceInfo).toHaveBeenCalledWith(files, 24);
    });

    it('SSN-002: updates properties after load', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 1920 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 1080 });

      const mockInfo = {
        name: 'test',
        pattern: 'test_####.exr',
        frames: [
          { index: 0, frameNumber: 101, file: new File([''], 'test_0101.exr'), image: mockImage },
          { index: 1, frameNumber: 102, file: new File([''], 'test_0102.exr') },
        ],
        startFrame: 101,
        endFrame: 102,
        width: 4096,
        height: 2160,
        fps: 30,
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);

      await node.loadFiles([new File([''], 'test.exr')], 30);

      expect(node.properties.getValue('pattern')).toBe('test_####.exr');
      expect(node.properties.getValue('startFrame')).toBe(101);
      expect(node.properties.getValue('endFrame')).toBe(102);
      expect(node.properties.getValue('fps')).toBe(30);
    });

    it('SSN-003: throws error when no valid sequence found', async () => {
      vi.mocked(createSequenceInfo).mockResolvedValue(null);

      const files = [new File([''], 'invalid.txt')];

      await expect(node.loadFiles(files)).rejects.toThrow('No valid image sequence found');
    });

    it('accepts custom fps', async () => {
      const mockImage = new Image();
      const mockInfo = {
        name: 'test',
        pattern: 'frame_####.png',
        frames: [{ index: 0, frameNumber: 1, file: new File([''], 'frame_0001.png'), image: mockImage }],
        startFrame: 1,
        endFrame: 1,
        width: 100,
        height: 100,
        fps: 60,
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);

      await node.loadFiles([new File([''], 'frame_0001.png')], 60);

      expect(createSequenceInfo).toHaveBeenCalledWith(expect.any(Array), 60);
    });
  });

  describe('getFrameImage', () => {
    it('SSN-004: loads frame on demand', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 100 });

      const frame1 = { index: 0, frameNumber: 1, file: new File([''], 'frame_0001.png'), image: mockImage };
      const frame2 = { index: 1, frameNumber: 2, file: new File([''], 'frame_0002.png') };

      const mockInfo = {
        name: 'test',
        pattern: 'frame_####.png',
        frames: [frame1, frame2],
        startFrame: 1,
        endFrame: 2,
        width: 100,
        height: 100,
        fps: 24,
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);

      await node.loadFiles([new File([''], 'test.png')]);

      const result = await node.getFrameImage(1);

      expect(result).toBe(mockImage);
      expect(loadFrameImage).toHaveBeenCalled();
    });

    it('SSN-005: preloads adjacent frames', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 100 });

      const frames = [];
      for (let i = 1; i <= 10; i++) {
        frames.push({
          index: i - 1,
          frameNumber: i,
          file: new File([''], `frame_${i.toString().padStart(4, '0')}.png`),
          image: i === 1 ? mockImage : undefined,
        });
      }

      const mockInfo = {
        name: 'test',
        pattern: 'frame_####.png',
        frames,
        startFrame: 1,
        endFrame: 10,
        width: 100,
        height: 100,
        fps: 24,
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);

      await node.loadFiles([new File([''], 'test.png')]);
      await node.getFrameImage(5);

      expect(preloadFrames).toHaveBeenCalledWith(expect.any(Array), 4, 5);
    });

    it('SSN-006: releases distant frames', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 100 });

      const frames = [];
      for (let i = 1; i <= 50; i++) {
        frames.push({
          index: i - 1,
          frameNumber: i,
          file: new File([''], `frame_${i.toString().padStart(4, '0')}.png`),
          image: i === 1 ? mockImage : undefined,
        });
      }

      const mockInfo = {
        name: 'test',
        pattern: 'frame_####.png',
        frames,
        startFrame: 1,
        endFrame: 50,
        width: 100,
        height: 100,
        fps: 24,
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);

      await node.loadFiles([new File([''], 'test.png')]);
      await node.getFrameImage(25);

      expect(releaseDistantFrames).toHaveBeenCalledWith(expect.any(Array), 24, 20);
    });

    it('returns null for out of range frame', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 100 });

      const mockInfo = {
        name: 'test',
        pattern: 'frame_####.png',
        frames: [{ index: 0, frameNumber: 1, file: new File([''], 'frame_0001.png'), image: mockImage }],
        startFrame: 1,
        endFrame: 1,
        width: 100,
        height: 100,
        fps: 24,
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);

      await node.loadFiles([new File([''], 'test.png')]);

      const result = await node.getFrameImage(100);

      expect(result).toBeNull();
    });
  });

  describe('dispose', () => {
    it('SSN-007: disposes sequence on cleanup', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 100 });

      const mockInfo = {
        name: 'test',
        pattern: 'frame_####.png',
        frames: [{ index: 0, frameNumber: 1, file: new File([''], 'frame_0001.png'), image: mockImage }],
        startFrame: 1,
        endFrame: 1,
        width: 100,
        height: 100,
        fps: 24,
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);

      await node.loadFiles([new File([''], 'test.png')]);
      node.dispose();

      expect(disposeSequence).toHaveBeenCalled();
      expect(node.isReady()).toBe(false);
    });

    it('handles dispose when no sequence loaded', () => {
      // Should not throw
      node.dispose();
      expect(disposeSequence).not.toHaveBeenCalled();
    });
  });

  describe('toJSON', () => {
    it('serializes node state', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 1920 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 1080 });

      const mockInfo = {
        name: 'test',
        pattern: 'test_####.png',
        frames: [{ index: 0, frameNumber: 1, file: new File([''], 'test_0001.png'), image: mockImage }],
        startFrame: 1,
        endFrame: 1,
        width: 1920,
        height: 1080,
        fps: 24,
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);

      await node.loadFiles([new File([''], 'test.png')]);

      const json = node.toJSON() as {
        type: string;
        name: string;
        pattern: string;
        metadata: { width: number; height: number; duration: number };
      };

      expect(json.type).toBe('RVSequenceSource');
      expect(json.name).toBe('TestSequence');
      expect(json.pattern).toBe('test_####.png');
      expect(json.metadata.width).toBe(1920);
      expect(json.metadata.height).toBe(1080);
    });

    it('serializes empty node', () => {
      const json = node.toJSON() as { type: string; pattern: string | undefined };

      expect(json.type).toBe('RVSequenceSource');
      expect(json.pattern).toBeUndefined();
    });
  });

  describe('source node behavior', () => {
    it('does not accept inputs', () => {
      expect(node.inputs.length).toBe(0);
    });
  });

  describe('getElement', () => {
    it('returns loaded frame image', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 100 });

      const mockInfo = {
        name: 'test',
        pattern: 'frame_####.png',
        frames: [
          { index: 0, frameNumber: 1, file: new File([''], 'frame_0001.png'), image: mockImage },
          { index: 1, frameNumber: 2, file: new File([''], 'frame_0002.png') },
        ],
        startFrame: 1,
        endFrame: 2,
        width: 100,
        height: 100,
        fps: 24,
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);

      await node.loadFiles([new File([''], 'test.png')]);

      // Frame 1 has image loaded
      expect(node.getElement(1)).toBe(mockImage);
      // Frame 2 has no image loaded yet
      expect(node.getElement(2)).toBeNull();
    });
  });
});
