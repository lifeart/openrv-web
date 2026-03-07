import { describe, it, expect } from 'vitest';
import {
  createRepresentation,
  generateRepresentationId,
  serializeRepresentation,
  deserializeRepresentation,
  type AddRepresentationConfig,
  type MediaRepresentation,
  type SerializedRepresentation,
} from './representation';
import type { BaseSourceNode } from '../../nodes/sources/BaseSourceNode';

describe('representation types', () => {
  describe('generateRepresentationId', () => {
    it('should generate a unique string', () => {
      const id1 = generateRepresentationId();
      const id2 = generateRepresentationId();
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createRepresentation', () => {
    it('should create a representation with required fields', () => {
      const config: AddRepresentationConfig = {
        kind: 'movie',
        resolution: { width: 1920, height: 1080 },
        loaderConfig: { url: 'http://example.com/video.mp4' },
      };

      const rep = createRepresentation(config);
      expect(rep.id).toBeTruthy();
      expect(rep.kind).toBe('movie');
      expect(rep.status).toBe('idle');
      expect(rep.resolution.width).toBe(1920);
      expect(rep.resolution.height).toBe(1080);
      expect(rep.par).toBe(1.0);
      expect(rep.sourceNode).toBeNull();
      expect(rep.audioTrackPresent).toBe(false);
      expect(rep.startFrame).toBe(0);
    });

    it('should use provided optional fields', () => {
      const config: AddRepresentationConfig = {
        id: 'custom-id',
        label: 'Custom Label',
        kind: 'frames',
        priority: 5,
        resolution: { width: 4096, height: 2160 },
        par: 2.0,
        audioTrackPresent: true,
        startFrame: 1001,
        colorSpace: { transferFunction: 'PQ', colorPrimaries: 'bt2020' },
        loaderConfig: { path: '/path/to/file.exr' },
      };

      const rep = createRepresentation(config);
      expect(rep.id).toBe('custom-id');
      expect(rep.label).toBe('Custom Label');
      expect(rep.priority).toBe(5);
      expect(rep.par).toBe(2.0);
      expect(rep.audioTrackPresent).toBe(true);
      expect(rep.startFrame).toBe(1001);
      expect(rep.colorSpace?.transferFunction).toBe('PQ');
      expect(rep.colorSpace?.colorPrimaries).toBe('bt2020');
    });

    it('should auto-generate label from kind and resolution', () => {
      const config: AddRepresentationConfig = {
        kind: 'proxy',
        resolution: { width: 960, height: 540 },
        loaderConfig: {},
      };

      const rep = createRepresentation(config);
      expect(rep.label).toBe('proxy (960x540)');
    });

    it('should set status to ready when sourceNode is provided', () => {
      const mockNode = { name: 'mock' } as unknown as BaseSourceNode;
      const config: AddRepresentationConfig = {
        kind: 'movie',
        resolution: { width: 1920, height: 1080 },
        loaderConfig: {},
        sourceNode: mockNode,
      };

      const rep = createRepresentation(config);
      expect(rep.status).toBe('ready');
      expect(rep.sourceNode).toBe(mockNode);
    });

    it('should use default priorities for each kind', () => {
      const framesRep = createRepresentation({
        kind: 'frames', resolution: { width: 100, height: 100 }, loaderConfig: {},
      });
      const movieRep = createRepresentation({
        kind: 'movie', resolution: { width: 100, height: 100 }, loaderConfig: {},
      });
      const proxyRep = createRepresentation({
        kind: 'proxy', resolution: { width: 100, height: 100 }, loaderConfig: {},
      });
      const streamRep = createRepresentation({
        kind: 'streaming', resolution: { width: 100, height: 100 }, loaderConfig: {},
      });

      expect(framesRep.priority).toBe(0);
      expect(movieRep.priority).toBe(1);
      expect(proxyRep.priority).toBe(2);
      expect(streamRep.priority).toBe(3);
    });
  });

  describe('serializeRepresentation', () => {
    it('should serialize a representation without runtime fields', () => {
      const rep: MediaRepresentation = {
        id: 'test-id',
        label: 'Test',
        kind: 'movie',
        priority: 1,
        status: 'ready',
        resolution: { width: 1920, height: 1080 },
        par: 1.0,
        sourceNode: { name: 'mock' } as unknown as BaseSourceNode,
        loaderConfig: {
          file: new File([], 'test.mp4'),
          path: '/path/to/test.mp4',
          url: 'http://example.com/test.mp4',
          opfsCacheKey: 'cache-key',
        },
        audioTrackPresent: true,
        startFrame: 0,
        colorSpace: { transferFunction: 'sRGB', colorPrimaries: 'bt709' },
      };

      const serialized = serializeRepresentation(rep);

      // Should not include sourceNode
      expect(serialized).not.toHaveProperty('sourceNode');
      expect(serialized).not.toHaveProperty('status');

      // Should not include File object in loaderConfig
      expect(serialized.loaderConfig).not.toHaveProperty('file');
      expect(serialized.loaderConfig).not.toHaveProperty('files');

      // Should include serializable fields
      expect(serialized.id).toBe('test-id');
      expect(serialized.label).toBe('Test');
      expect(serialized.kind).toBe('movie');
      expect(serialized.priority).toBe(1);
      expect(serialized.resolution).toEqual({ width: 1920, height: 1080 });
      expect(serialized.par).toBe(1.0);
      expect(serialized.audioTrackPresent).toBe(true);
      expect(serialized.startFrame).toBe(0);
      expect(serialized.colorSpace).toEqual({ transferFunction: 'sRGB', colorPrimaries: 'bt709' });
      expect(serialized.loaderConfig.path).toBe('/path/to/test.mp4');
      expect(serialized.loaderConfig.url).toBe('http://example.com/test.mp4');
      expect(serialized.loaderConfig.opfsCacheKey).toBe('cache-key');
    });

    it('should handle representation without colorSpace', () => {
      const rep: MediaRepresentation = {
        id: 'test-id',
        label: 'Test',
        kind: 'proxy',
        priority: 2,
        status: 'idle',
        resolution: { width: 960, height: 540 },
        par: 1.0,
        sourceNode: null,
        loaderConfig: {},
        audioTrackPresent: false,
        startFrame: 0,
      };

      const serialized = serializeRepresentation(rep);
      expect(serialized.colorSpace).toBeUndefined();
    });
  });

  describe('deserializeRepresentation', () => {
    it('should deserialize a representation in idle state', () => {
      const serialized: SerializedRepresentation = {
        id: 'test-id',
        label: 'Test',
        kind: 'movie',
        priority: 1,
        resolution: { width: 1920, height: 1080 },
        par: 1.0,
        audioTrackPresent: true,
        startFrame: 1001,
        colorSpace: { transferFunction: 'PQ', colorPrimaries: 'bt2020' },
        loaderConfig: {
          path: '/path/to/test.mp4',
          opfsCacheKey: 'cache-key',
        },
      };

      const rep = deserializeRepresentation(serialized);
      expect(rep.id).toBe('test-id');
      expect(rep.status).toBe('idle');
      expect(rep.sourceNode).toBeNull();
      expect(rep.kind).toBe('movie');
      expect(rep.priority).toBe(1);
      expect(rep.resolution).toEqual({ width: 1920, height: 1080 });
      expect(rep.par).toBe(1.0);
      expect(rep.audioTrackPresent).toBe(true);
      expect(rep.startFrame).toBe(1001);
      expect(rep.colorSpace).toEqual({ transferFunction: 'PQ', colorPrimaries: 'bt2020' });
      expect(rep.loaderConfig.path).toBe('/path/to/test.mp4');
    });

    it('should round-trip through serialize/deserialize', () => {
      const rep: MediaRepresentation = {
        id: 'round-trip',
        label: 'Round Trip',
        kind: 'frames',
        priority: 0,
        status: 'ready',
        resolution: { width: 4096, height: 2160 },
        par: 1.5,
        sourceNode: null,
        loaderConfig: { path: '/path/to/file.exr' },
        audioTrackPresent: false,
        startFrame: 100,
        colorSpace: { transferFunction: 'linear', colorPrimaries: 'aces' },
      };

      const serialized = serializeRepresentation(rep);
      const deserialized = deserializeRepresentation(serialized);

      expect(deserialized.id).toBe(rep.id);
      expect(deserialized.label).toBe(rep.label);
      expect(deserialized.kind).toBe(rep.kind);
      expect(deserialized.priority).toBe(rep.priority);
      expect(deserialized.resolution).toEqual(rep.resolution);
      expect(deserialized.par).toBe(rep.par);
      expect(deserialized.audioTrackPresent).toBe(rep.audioTrackPresent);
      expect(deserialized.startFrame).toBe(rep.startFrame);
      expect(deserialized.colorSpace).toEqual(rep.colorSpace);
      expect(deserialized.status).toBe('idle'); // Always idle after deserialization
      expect(deserialized.sourceNode).toBeNull(); // Always null after deserialization
    });
  });
});
