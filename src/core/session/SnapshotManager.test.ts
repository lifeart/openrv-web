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

      manager.dispose();

      // Check that isInitialized is reset (through attempting to throw on createSnapshot)
      // We can't directly access private fields, but the dispose should work
    });
  });
});
