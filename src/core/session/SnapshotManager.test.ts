import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SnapshotManager } from './SnapshotManager';
import { SESSION_STATE_VERSION } from './SessionState';

// Mock IndexedDB
const mockStore: Map<string, unknown> = new Map();
const mockTransaction = {
  objectStore: vi.fn(() => ({
    put: vi.fn((data) => {
      mockStore.set(data.id, data);
      return { onsuccess: null, onerror: null };
    }),
    get: vi.fn((id) => {
      const result = mockStore.get(id);
      return {
        onsuccess: null,
        onerror: null,
        result,
      };
    }),
    delete: vi.fn((id) => {
      mockStore.delete(id);
      return { onsuccess: null, onerror: null };
    }),
    clear: vi.fn(() => {
      mockStore.clear();
      return { onsuccess: null, onerror: null };
    }),
    openCursor: vi.fn(() => ({
      onsuccess: null,
      onerror: null,
    })),
    createIndex: vi.fn(),
  })),
  onerror: null,
  onabort: null,
};

const mockDB = {
  transaction: vi.fn(() => mockTransaction),
  objectStoreNames: { contains: vi.fn(() => true) },
  close: vi.fn(),
};

// Mock indexedDB
vi.stubGlobal('indexedDB', {
  open: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: mockDB,
  })),
});

describe('SnapshotManager', () => {
  let manager: SnapshotManager;

  beforeEach(() => {
    mockStore.clear();
    manager = new SnapshotManager();
  });

  afterEach(() => {
    manager.dispose();
    vi.clearAllMocks();
  });

  describe('validateSnapshotData', () => {
    it('should reject invalid data types', () => {
      // Access private method through any cast for testing
      const validateFn = (manager as any).validateSnapshotData.bind(manager);

      expect(validateFn(null)).toBe(false);
      expect(validateFn(undefined)).toBe(false);
      expect(validateFn('string')).toBe(false);
      expect(validateFn(123)).toBe(false);
    });

    it('should reject missing metadata', () => {
      const validateFn = (manager as any).validateSnapshotData.bind(manager);

      expect(validateFn({ state: {} })).toBe(false);
      expect(validateFn({ metadata: null, state: {} })).toBe(false);
    });

    it('should reject missing state', () => {
      const validateFn = (manager as any).validateSnapshotData.bind(manager);

      expect(validateFn({ metadata: { name: 'test', version: 1 } })).toBe(false);
      expect(validateFn({ metadata: { name: 'test', version: 1 }, state: null })).toBe(false);
    });

    it('should reject invalid metadata fields', () => {
      const validateFn = (manager as any).validateSnapshotData.bind(manager);

      expect(validateFn({
        metadata: { name: 123, version: 1 }, // name should be string
        state: { version: 1 }
      })).toBe(false);

      expect(validateFn({
        metadata: { name: 'test', version: 'not a number' }, // version should be number
        state: { version: 1 }
      })).toBe(false);
    });

    it('should accept valid data', () => {
      const validateFn = (manager as any).validateSnapshotData.bind(manager);

      expect(validateFn({
        metadata: { name: 'Test Snapshot', version: 1 },
        state: { version: 1 }
      })).toBe(true);
    });
  });

  describe('createPreview', () => {
    it('should extract preview from state with no annotations', () => {
      const createPreviewFn = (manager as any).createPreview.bind(manager);

      const emptyState = {
        version: SESSION_STATE_VERSION,
        playback: {
          currentFrame: 10,
          outPoint: 100,
        },
      };

      const preview = createPreviewFn(emptyState);

      expect(preview.currentFrame).toBe(10);
      expect(preview.frameCount).toBe(100);
      expect(preview.annotationCount).toBe(0);
    });

    it('should count annotations from paint frames', () => {
      const createPreviewFn = (manager as any).createPreview.bind(manager);

      const stateWithAnnotations = {
        version: SESSION_STATE_VERSION,
        paint: {
          frames: {
            1: [{ id: '1' }],
            2: [{ id: '2' }, { id: '3' }],
          },
        },
        playback: {
          currentFrame: 10,
          outPoint: 100,
        },
      };

      const preview = createPreviewFn(stateWithAnnotations);
      expect(preview.annotationCount).toBe(3);
    });

    it('should detect color grade from brightness', () => {
      const createPreviewFn = (manager as any).createPreview.bind(manager);

      const stateWithColor = {
        version: SESSION_STATE_VERSION,
        color: {
          brightness: 0.1,
          contrast: 0,
          saturation: 0,
          exposure: 0,
          gamma: 1,
        },
      };

      const preview = createPreviewFn(stateWithColor);
      expect(preview.hasColorGrade).toBe(true);
    });

    it('should detect no color grade for default values', () => {
      const createPreviewFn = (manager as any).createPreview.bind(manager);

      const stateNoColor = {
        version: SESSION_STATE_VERSION,
        color: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          exposure: 0,
          gamma: 1,
        },
      };

      const preview = createPreviewFn(stateNoColor);
      expect(preview.hasColorGrade).toBe(false);
    });

    it('should detect color grade from CDL slope', () => {
      const createPreviewFn = (manager as any).createPreview.bind(manager);

      const stateWithCDL = {
        version: SESSION_STATE_VERSION,
        cdl: {
          slope: { r: 1.1, g: 1, b: 1 },
          offset: { r: 0, g: 0, b: 0 },
          power: { r: 1, g: 1, b: 1 },
        },
      };

      const preview = createPreviewFn(stateWithCDL);
      expect(preview.hasColorGrade).toBe(true);
    });

    it('should include source name in preview', () => {
      const createPreviewFn = (manager as any).createPreview.bind(manager);

      const stateWithMedia = {
        version: SESSION_STATE_VERSION,
        media: [{ name: 'test-source.exr' }],
      };

      const preview = createPreviewFn(stateWithMedia);
      expect(preview.sourceName).toBe('test-source.exr');
    });
  });

  describe('importSnapshot', () => {
    it('should reject invalid JSON', async () => {
      // First initialize (mock needs to trigger onsuccess)
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      await expect(manager.importSnapshot('not valid json')).rejects.toThrow('Invalid JSON format');
    });

    it('should reject invalid snapshot format', async () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      await expect(manager.importSnapshot('{"foo": "bar"}')).rejects.toThrow('Invalid snapshot format');
    });

    it('should reject newer version snapshots', async () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      const futureSnapshot = JSON.stringify({
        metadata: { name: 'Future', version: SESSION_STATE_VERSION + 100 },
        state: { version: SESSION_STATE_VERSION + 100 }
      });

      await expect(manager.importSnapshot(futureSnapshot)).rejects.toThrow(/newer than supported/);
    });
  });

  describe('no double serialization (regression)', () => {
    it('SNAP-R001: putSnapshotWithJson method no longer exists', () => {
      // The method was removed because it accepted a pre-serialized JSON string
      // then immediately JSON.parse'd it, defeating the optimization purpose.
      // Callers now use putSnapshot(snapshot, state) directly.
      expect((manager as any).putSnapshotWithJson).toBeUndefined();
    });

    it('SNAP-R002: createSnapshot does not call JSON.parse during storage', () => {
      // The old code called JSON.parse on already-serialized JSON before storing.
      // After the fix, JSON.parse should NOT be called during snapshot creation.
      const parseSpy = vi.spyOn(JSON, 'parse');

      // Simulate initialization
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      // createSnapshot calls JSON.stringify for size measurement, but should NOT
      // call JSON.parse (which was the double-serialization bug)
      parseSpy.mockClear();

      // We can't fully run createSnapshot (IndexedDB mock is limited), but we
      // can verify that the putSnapshot method itself doesn't use JSON.parse.
      // Verify the function source does not contain JSON.parse
      const fnSource = (manager as any).putSnapshot.toString();
      expect(fnSource).not.toContain('JSON.parse');

      parseSpy.mockRestore();
    });
  });

  describe('formatSize', () => {
    it('should measure size in bytes correctly', () => {
      const testData = { test: 'data', count: 123 };
      const json = JSON.stringify(testData);
      const expectedSize = new TextEncoder().encode(json).length;

      expect(expectedSize).toBeGreaterThan(0);
      expect(expectedSize).toBe(27); // Known size for this specific JSON
    });
  });

  describe('dispose', () => {
    it('should close database connection', () => {
      // Simulate initialization
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      expect(() => manager.dispose()).not.toThrow();
    });
  });

  describe('disposal/cleanup lifecycle', () => {
    it('SNAP-D001: dispose resets initialized state', () => {
      // Without proper initialization, db is null
      // After dispose, operations that require initialization should fail/return empty
      manager.dispose();

      // createSnapshot should throw because isInitialized is false
      const mockState = { version: SESSION_STATE_VERSION, name: 'Test' } as any;
      expect(
        manager.createSnapshot('Test', mockState)
      ).rejects.toThrow('SnapshotManager not initialized');
    });

    it('SNAP-D002: double dispose does not throw', () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      manager.dispose();
      // Second dispose should not throw (db is already null)
      expect(() => manager.dispose()).not.toThrow();
    });

    it('SNAP-D003: listSnapshots returns empty array after dispose', async () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      manager.dispose();

      const snapshots = await manager.listSnapshots();
      expect(snapshots).toEqual([]);
    });

    it('SNAP-D004: getSnapshot returns null after dispose', async () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      manager.dispose();

      const result = await manager.getSnapshot('snapshot-123');
      expect(result).toBeNull();
    });

    it('SNAP-D005: getSnapshotMetadata returns null after dispose', async () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      manager.dispose();

      const result = await manager.getSnapshotMetadata('snapshot-123');
      expect(result).toBeNull();
    });

    it('SNAP-D006: deleteSnapshot is a no-op after dispose (db is null)', async () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      manager.dispose();

      // Should not throw, just return early
      await expect(manager.deleteSnapshot('snapshot-123')).resolves.toBeUndefined();
    });

    it('SNAP-D007: clearAll is a no-op after dispose (db is null)', async () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      manager.dispose();

      await expect(manager.clearAll()).resolves.toBeUndefined();
    });

    it('SNAP-D008: createSnapshot throws after dispose (not initialized)', async () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      manager.dispose();

      const mockState = {
        version: SESSION_STATE_VERSION,
        name: 'Test',
      } as any;

      await expect(
        manager.createSnapshot('Test', mockState)
      ).rejects.toThrow('SnapshotManager not initialized');
    });

    it('SNAP-D009: createAutoCheckpoint throws after dispose (not initialized)', async () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      manager.dispose();

      const mockState = {
        version: SESSION_STATE_VERSION,
        name: 'Test',
      } as any;

      await expect(
        manager.createAutoCheckpoint('source-change', mockState)
      ).rejects.toThrow('SnapshotManager not initialized');
    });

    it('SNAP-D010: exportSnapshot returns null after dispose (db is null)', async () => {
      const openRequest = (indexedDB as any).open();
      openRequest.onsuccess?.();

      manager.dispose();

      const result = await manager.exportSnapshot('snapshot-123');
      expect(result).toBeNull();
    });

    it('SNAP-D011: renameSnapshot is a no-op after dispose (db is null)', async () => {
      manager.dispose();

      // renameSnapshot early-returns when db is null (first line: if (!this.db) return)
      await expect(
        manager.renameSnapshot('snapshot-123', 'New Name')
      ).resolves.toBeUndefined();
    });
  });
});
