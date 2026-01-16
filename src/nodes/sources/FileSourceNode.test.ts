/**
 * FileSourceNode Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FileSourceNode } from './FileSourceNode';

describe('FileSourceNode', () => {
  let node: FileSourceNode;

  beforeEach(() => {
    node = new FileSourceNode('TestFileSource');
  });

  afterEach(() => {
    node.dispose();
  });

  describe('initialization', () => {
    it('has correct type', () => {
      expect(node.type).toBe('RVFileSource');
    });

    it('has correct default name', () => {
      const defaultNode = new FileSourceNode();
      expect(defaultNode.name).toBe('File Source');
      defaultNode.dispose();
    });

    it('has url property', () => {
      expect(node.properties.has('url')).toBe(true);
      expect(node.properties.getValue('url')).toBe('');
    });

    it('has width and height properties', () => {
      expect(node.properties.has('width')).toBe(true);
      expect(node.properties.has('height')).toBe(true);
      expect(node.properties.getValue('width')).toBe(0);
      expect(node.properties.getValue('height')).toBe(0);
    });
  });

  describe('isReady', () => {
    it('returns false when no image loaded', () => {
      expect(node.isReady()).toBe(false);
    });
  });

  describe('getElement', () => {
    it('returns null when no image loaded', () => {
      expect(node.getElement(1)).toBeNull();
    });
  });

  describe('load', () => {
    it('FSN-001: loads image from URL', async () => {
      // The mock setup in test/setup.ts triggers onload after setTimeout
      const loadPromise = node.load('test-image.png', 'test');

      // Wait for mock image to "load"
      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });

      await loadPromise;
      expect(node.isReady()).toBe(true);
    });

    it('FSN-006: populates metadata after load', async () => {
      const loadPromise = node.load('test-image.png', 'MyImage');

      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });
      await loadPromise;

      expect(node.properties.getValue('width')).toBe(100); // Mock returns 100x100
      expect(node.properties.getValue('height')).toBe(100);
    });

    it('updates url property', async () => {
      const loadPromise = node.load('test.png');

      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });
      await loadPromise;

      expect(node.properties.getValue('url')).toBe('test.png');
    });
  });

  describe('loadFile', () => {
    it('FSN-002: loads from File object', async () => {
      const file = new File([''], 'test-file.png', { type: 'image/png' });
      const loadPromise = node.loadFile(file);

      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });
      await loadPromise;

      expect(node.isReady()).toBe(true);
    });
  });

  describe('dispose', () => {
    it('FSN-005: revokes blob URL on dispose', async () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      const loadPromise = node.loadFile(file);

      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });
      await loadPromise;

      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL');

      node.dispose();

      expect(revokeObjectURLSpy).toHaveBeenCalled();
      revokeObjectURLSpy.mockRestore();
    });

    it('cleans up image reference', async () => {
      const loadPromise = node.load('test.png');

      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });
      await loadPromise;

      node.dispose();

      expect(node.isReady()).toBe(false);
      expect(node.getElement(1)).toBeNull();
    });
  });

  describe('toJSON', () => {
    it('serializes node state', () => {
      const json = node.toJSON() as {
        type: string;
        id: string;
        name: string;
        url: string;
      };

      expect(json.type).toBe('RVFileSource');
      expect(json.name).toBe('TestFileSource');
      expect(json.url).toBe('');
    });
  });

  describe('source node behavior', () => {
    it('does not accept inputs', () => {
      // Source nodes should not accept inputs
      expect(node.inputs.length).toBe(0);
    });
  });
});
