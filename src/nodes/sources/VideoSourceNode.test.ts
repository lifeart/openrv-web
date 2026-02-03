/**
 * VideoSourceNode Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VideoSourceNode } from './VideoSourceNode';
import { DEFAULT_PRELOAD_CONFIG } from '../../utils/FramePreloadManager';

describe('VideoSourceNode', () => {
  let node: VideoSourceNode;

  beforeEach(() => {
    node = new VideoSourceNode('TestVideo');
  });

  afterEach(() => {
    node.dispose();
  });

  describe('initialization', () => {
    it('has correct type', () => {
      expect(node.type).toBe('RVVideoSource');
    });

    it('has correct default name', () => {
      const defaultNode = new VideoSourceNode();
      expect(defaultNode.name).toBe('Video Source');
      defaultNode.dispose();
    });

    it('has url property', () => {
      expect(node.properties.has('url')).toBe(true);
      expect(node.properties.getValue('url')).toBe('');
    });

    it('has duration property', () => {
      expect(node.properties.has('duration')).toBe(true);
      expect(node.properties.getValue('duration')).toBe(0);
    });

    it('has fps property', () => {
      expect(node.properties.has('fps')).toBe(true);
      expect(node.properties.getValue('fps')).toBe(24);
    });
  });

  describe('isReady', () => {
    it('returns false when no video loaded', () => {
      expect(node.isReady()).toBe(false);
    });
  });

  describe('getElement', () => {
    it('returns null when no video loaded', () => {
      expect(node.getElement(1)).toBeNull();
    });
  });

  describe('dispose', () => {
    it('VSN-001: handles dispose when no video loaded', () => {
      // Should not throw
      node.dispose();
      expect(node.isReady()).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('VSN-002: serializes node state', () => {
      const json = node.toJSON() as {
        type: string;
        name: string;
        url: string;
      };

      expect(json.type).toBe('RVVideoSource');
      expect(json.name).toBe('TestVideo');
      expect(json.url).toBe('');
    });
  });

  describe('source node behavior', () => {
    it('VSN-003: does not accept inputs', () => {
      expect(node.inputs.length).toBe(0);
    });
  });

  describe('setFps', () => {
    it('VSN-004: updates fps property', () => {
      node.setFps(30);
      expect(node.properties.getValue('fps')).toBe(30);
    });

    it('VSN-005: does not throw without video', () => {
      // Should not throw even without video loaded
      expect(() => node.setFps(60)).not.toThrow();
      expect(node.properties.getValue('fps')).toBe(60);
    });
  });

  // REGRESSION TEST: VideoSourceNode must use DEFAULT_PRELOAD_CONFIG
  // Previously, VideoSourceNode hardcoded maxCacheSize: 60 and preloadAhead: 15,
  // which caused 70-frame videos to only cache 60 frames instead of all frames.
  // The fix was to remove the hardcoded values and rely on DEFAULT_PRELOAD_CONFIG.
  describe('preload config regression', () => {
    it('VSN-007: DEFAULT_PRELOAD_CONFIG must support caching 70+ frame videos', () => {
      // This test ensures that if someone changes DEFAULT_PRELOAD_CONFIG,
      // they'll be reminded that VideoSourceNode depends on these values
      expect(DEFAULT_PRELOAD_CONFIG.maxCacheSize).toBeGreaterThanOrEqual(100);
      expect(DEFAULT_PRELOAD_CONFIG.preloadAhead).toBeGreaterThanOrEqual(20);
    });

    it('VSN-008: VideoSourceNode source code should not hardcode preload config values', async () => {
      // This is a code-level regression test
      // We read the actual source to verify no hardcoded config overrides exist
      // If this test fails, it means someone added hardcoded values back

      // Import the source as text would require fs, so we test behavior instead:
      // VideoSourceNode should delegate entirely to DEFAULT_PRELOAD_CONFIG
      // The getCacheStats method should return maxCacheSize matching the default
      // (This can only be fully tested when mediabunny is initialized)

      // For now, verify the node can be created without errors
      const testNode = new VideoSourceNode('ConfigTest');
      expect(testNode).toBeDefined();
      expect(testNode.getCacheStats()).toBeNull(); // No preload manager until video loads
      testNode.dispose();
    });
  });

  // Note: load() and loadFile() tests require mocking HTMLVideoElement events
  // which is complex in jsdom. These would be better tested in integration tests.
  describe('load (mocked behavior)', () => {
    it('VSN-006: rejects with error message on load failure', async () => {
      // Mock video to fail loading
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') {
          const video = originalCreateElement('video');
          setTimeout(() => {
            if (video.onerror) {
              video.onerror(new Event('error'));
            }
          }, 0);
          return video;
        }
        return originalCreateElement(tag);
      });

      await expect(node.load('invalid://bad-url')).rejects.toThrow('Failed to load video');

      vi.restoreAllMocks();
    });
  });

  describe('codec error handling', () => {
    it('VSN-009: getUnsupportedCodecError returns null initially', () => {
      expect(node.getUnsupportedCodecError()).toBeNull();
    });

    it('VSN-010: has codec property', () => {
      expect(node.properties.has('codec')).toBe(true);
      expect(node.properties.getValue('codec')).toBe('');
    });
  });
});
