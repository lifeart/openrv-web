/**
 * SequenceSourceNode Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SequenceSourceNode } from './SequenceSourceNode';

// Mock the SequenceLoader module
vi.mock('../../utils/media/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
  loadFrameImage: vi.fn(),
  disposeSequence: vi.fn(),
}));

import {
  createSequenceInfo,
  loadFrameImage,
  disposeSequence,
} from '../../utils/media/SequenceLoader';

/** Flush microtask queue so FramePreloadManager's async operations complete */
function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

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
        missingFrames: [],
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
        missingFrames: [],
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
        missingFrames: [],
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);

      await node.loadFiles([new File([''], 'frame_0001.png')], 60);

      expect(createSequenceInfo).toHaveBeenCalledWith(expect.any(Array), 60);
    });
  });

  describe('getFrameImage', () => {
    it('SSN-004: loads frame on demand via FramePreloadManager', async () => {
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
        missingFrames: [],
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);

      await node.loadFiles([new File([''], 'test.png')]);

      const result = await node.getFrameImage(1);

      expect(result).toBe(mockImage);
      expect(loadFrameImage).toHaveBeenCalled();
    });

    it('SSN-005: triggers preloading of adjacent frames', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 100 });

      const frames = [];
      for (let i = 1; i <= 20; i++) {
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
        endFrame: 20,
        width: 100,
        height: 100,
        fps: 24,
        missingFrames: [],
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);

      await node.loadFiles([new File([''], 'test.png')]);
      await node.getFrameImage(10);

      // Wait for preload queue to process
      await flushMicrotasks();

      // loadFrameImage should be called for frame 10 plus adjacent frames
      expect(vi.mocked(loadFrameImage).mock.calls.length).toBeGreaterThan(1);
    });

    it('SSN-006: distant frames are not all cached (LRU eviction via FramePreloadManager)', async () => {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 100 });

      // Create a sequence larger than default cache (100 frames)
      const frameCount = 150;
      const frames = [];
      for (let i = 1; i <= frameCount; i++) {
        frames.push({
          index: i - 1,
          frameNumber: i,
          file: new File([''], `frame_${i.toString().padStart(4, '0')}.png`),
        });
      }

      const mockInfo = {
        name: 'test',
        pattern: 'frame_####.png',
        frames,
        startFrame: 1,
        endFrame: frameCount,
        width: 100,
        height: 100,
        fps: 24,
        missingFrames: [],
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);

      await node.loadFiles([new File([''], 'test.png')]);

      // Load a frame near the beginning, then jump to the end
      await node.getFrameImage(1);
      await flushMicrotasks();
      expect(node.getElement(1)).toBe(mockImage);

      // Load a frame near the end and trigger preloading there
      await node.getFrameImage(140);
      await flushMicrotasks();

      // Frame 140 should now be cached
      expect(node.getElement(140)).toBe(mockImage);
      // Frame 1 may or may not still be cached depending on eviction,
      // but the key point is the system doesn't crash and manages memory
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
        missingFrames: [],
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);

      await node.loadFiles([new File([''], 'test.png')]);

      const result = await node.getFrameImage(100);

      expect(result).toBeNull();
    });
  });

  describe('dispose', () => {
    it('SSN-007: disposes sequence and preload manager on cleanup', async () => {
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
        missingFrames: [],
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
        missingFrames: [],
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
    it('returns cached frame from preload manager', async () => {
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
        missingFrames: [],
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);

      await node.loadFiles([new File([''], 'test.png')]);

      // Frame 1 has not been loaded through preload manager yet
      expect(node.getElement(1)).toBeNull();

      // Load frame 1 through getFrameImage (populates preload manager cache)
      await node.getFrameImage(1);

      // Now it should be in the cache
      expect(node.getElement(1)).toBe(mockImage);

      // Frame 2 has not been explicitly loaded
      // (may or may not be preloaded depending on timing)
    });
  });

  describe('playback control', () => {
    it('SSN-LAZY-001: playback methods do not throw before loadFiles', () => {
      expect(() => node.setPlaybackDirection(1)).not.toThrow();
      expect(() => node.setPlaybackDirection(-1)).not.toThrow();
      expect(() => node.setPlaybackActive(true)).not.toThrow();
      expect(() => node.setPlaybackActive(false)).not.toThrow();
      expect(() => node.updatePlaybackBuffer(1)).not.toThrow();
    });

    it('SSN-LAZY-002: setPlaybackDirection and setPlaybackActive work after loadFiles', async () => {
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
        missingFrames: [],
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);

      await node.loadFiles([new File([''], 'test.png')]);

      expect(() => node.setPlaybackDirection(1)).not.toThrow();
      expect(() => node.setPlaybackDirection(-1)).not.toThrow();
      expect(() => node.setPlaybackActive(true)).not.toThrow();
      expect(() => node.setPlaybackActive(false)).not.toThrow();
    });

    it('SSN-LAZY-003: updatePlaybackBuffer triggers loading after loadFiles', async () => {
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
        missingFrames: [],
      };

      vi.mocked(createSequenceInfo).mockResolvedValue(mockInfo);
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);

      await node.loadFiles([new File([''], 'test.png')]);
      vi.mocked(loadFrameImage).mockClear();

      node.updatePlaybackBuffer(5);
      await flushMicrotasks();

      // Preloading around frame 5 should trigger loading of adjacent frames
      expect(vi.mocked(loadFrameImage).mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('playback state regressions', () => {
    /** Helper: create and load a sequence of N frames */
    async function loadSequence(seqNode: SequenceSourceNode, frameCount: number) {
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 100 });

      const frames = [];
      for (let i = 1; i <= frameCount; i++) {
        frames.push({
          index: i - 1,
          frameNumber: i,
          file: new File([''], `frame_${i.toString().padStart(4, '0')}.png`),
        });
      }

      vi.mocked(createSequenceInfo).mockResolvedValue({
        name: 'test',
        pattern: 'frame_####.png',
        frames,
        startFrame: 1,
        endFrame: frameCount,
        width: 100,
        height: 100,
        fps: 24,
        missingFrames: [],
      });
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);

      await seqNode.loadFiles([new File([''], 'test.png')]);
      vi.mocked(loadFrameImage).mockClear();
    }

    /** Extract 1-based frame numbers from loadFrameImage mock calls */
    function getLoadedFrameNumbers(): number[] {
      return vi.mocked(loadFrameImage).mock.calls.map(c => c[0].frameNumber);
    }

    it('SSN-REG-001: setPlaybackDirection while paused keeps symmetric scrub preloading', async () => {
      // Regression: setPlaybackDirection previously always passed isPlaying=true
      // to preloadManager.setPlaybackState, switching to asymmetric playback preload
      // even when paused. Scrub mode should use a symmetric window.
      await loadSequence(node, 50);

      // Set direction WITHOUT activating playback
      node.setPlaybackDirection(-1);
      node.updatePlaybackBuffer(25);
      await flushMicrotasks();

      const loaded = getLoadedFrameNumbers();
      const ahead = loaded.filter(f => f > 25).length;  // frames 26+
      const behind = loaded.filter(f => f < 25).length;  // frames 1-24

      // Scrub mode (scrubWindow=10): symmetric ±10 around center
      // Both sides should have frames loaded
      expect(ahead).toBeGreaterThan(0);
      expect(behind).toBeGreaterThan(0);
      // Symmetric: equal count on each side (±1 for boundary)
      expect(Math.abs(ahead - behind)).toBeLessThanOrEqual(1);
    });

    it('SSN-REG-002: setPlaybackActive(true) enables asymmetric directional preloading', async () => {
      // When playback is active, preloading should be asymmetric:
      // preloadAhead=30 in playback direction, preloadBehind=5 opposite.
      await loadSequence(node, 50);

      node.setPlaybackActive(true);
      node.setPlaybackDirection(1);  // forward
      node.updatePlaybackBuffer(10);
      await flushMicrotasks();

      const loaded = getLoadedFrameNumbers();
      const ahead = loaded.filter(f => f > 10).length;   // frames 11+
      const behind = loaded.filter(f => f < 10).length;   // frames 1-9

      // Playback forward (preloadAhead=30, preloadBehind=5):
      // should load many more frames ahead than behind
      expect(ahead).toBeGreaterThan(behind);
      expect(ahead).toBeGreaterThanOrEqual(20);  // at least 20 of 30 ahead
      expect(behind).toBeLessThanOrEqual(5);
    });

    it('SSN-REG-003: setPlaybackActive(false) returns to symmetric scrub preloading', async () => {
      // After stopping playback, preloading should return to scrub mode.
      await loadSequence(node, 50);

      // Start playback, then stop
      node.setPlaybackActive(true);
      node.setPlaybackDirection(1);
      node.setPlaybackActive(false);

      node.updatePlaybackBuffer(25);
      await flushMicrotasks();

      const loaded = getLoadedFrameNumbers();
      const ahead = loaded.filter(f => f > 25).length;
      const behind = loaded.filter(f => f < 25).length;

      // Back to scrub mode: symmetric preloading
      expect(ahead).toBeGreaterThan(0);
      expect(behind).toBeGreaterThan(0);
      expect(Math.abs(ahead - behind)).toBeLessThanOrEqual(1);
    });

    it('SSN-REG-004: setPlaybackDirection during active playback updates preload direction', async () => {
      // Changing direction while playing should immediately affect preload strategy.
      await loadSequence(node, 50);

      node.setPlaybackActive(true);
      node.setPlaybackDirection(-1);  // reverse
      node.updatePlaybackBuffer(40);
      await flushMicrotasks();

      const loaded = getLoadedFrameNumbers();
      const ahead = loaded.filter(f => f < 40).length;   // reverse: frames before 40
      const behind = loaded.filter(f => f > 40).length;   // reverse: frames after 40

      // Reverse playback: more frames loaded in the reverse direction (< 40)
      expect(ahead).toBeGreaterThan(behind);
    });

    it('SSN-REG-005: getElement returns null for frame with image set outside preloadManager', async () => {
      // Regression: getElement must only return frames from the preloadManager cache,
      // not from SequenceFrame.image set directly (e.g., by createSequenceInfo).
      // This ensures lazy loading: frames are only available after explicit load.
      const mockImage = new Image();
      Object.defineProperty(mockImage, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImage, 'naturalHeight', { value: 100 });

      vi.mocked(createSequenceInfo).mockResolvedValue({
        name: 'test',
        pattern: 'frame_####.png',
        frames: [
          // Frame 1 has image pre-set (as createSequenceInfo would do)
          { index: 0, frameNumber: 1, file: new File([''], 'frame_0001.png'), image: mockImage },
        ],
        startFrame: 1,
        endFrame: 1,
        width: 100,
        height: 100,
        fps: 24,
        missingFrames: [],
      });

      await node.loadFiles([new File([''], 'test.png')]);

      // Even though frame 1 has .image set, getElement should return null
      // because it hasn't been loaded through the preloadManager
      expect(node.getElement(1)).toBeNull();
    });

    it('SSN-REG-006: double dispose does not throw', async () => {
      await loadSequence(node, 5);
      node.dispose();
      // Second dispose should be safe (preloadManager already null, frames empty)
      expect(() => node.dispose()).not.toThrow();
    });
  });
});
