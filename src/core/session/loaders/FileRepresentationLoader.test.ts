/**
 * Regression tests for issue #530:
 * Non-sequence file representations cannot round-trip through serialization
 * because the serialized loader config strips the `File` objects their live
 * loaders require.
 *
 * The fix populates `url` (via URL.createObjectURL) on the loader config after
 * file-based loading, so that deserialized representations (which have `url`
 * but no `file`) can still be loaded.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileRepresentationLoader } from './FileRepresentationLoader';
import { serializeRepresentation, deserializeRepresentation } from '../../types/representation';
import type { MediaRepresentation } from '../../types/representation';

// Mock FileSourceNode
vi.mock('../../../nodes/sources/FileSourceNode', () => ({
  FileSourceNode: class MockFileSourceNode {
    loadFile = vi.fn().mockResolvedValue(undefined);
    load = vi.fn().mockResolvedValue(undefined);
    isHDR = vi.fn().mockReturnValue(false);
    width = 1920;
    height = 1080;
    dispose = vi.fn();
  },
}));

// Mock URL.createObjectURL
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-url');
vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: mockCreateObjectURL,
});

function makeRepresentation(loaderConfig: MediaRepresentation['loaderConfig']): MediaRepresentation {
  return {
    id: 'file-rep-1',
    label: 'EXR Full (1920x1080)',
    kind: 'frames',
    priority: 0,
    status: 'idle',
    resolution: { width: 1920, height: 1080 },
    par: 1.0,
    sourceNode: null,
    loaderConfig,
    audioTrackPresent: false,
    startFrame: 0,
  };
}

describe('FileRepresentationLoader (issue #530)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- File-based loading (backward compat) ---

  it('should load from file when file is provided', async () => {
    const file = new File(['data'], 'image.exr', { type: 'image/x-exr' });
    const rep = makeRepresentation({ file });
    const loader = new FileRepresentationLoader();

    const result = await loader.load(rep);

    expect(result.sourceNode).toBeDefined();
    expect(result.audioTrackPresent).toBe(false);
    expect(result.resolution).toEqual({ width: 1920, height: 1080 });

    loader.dispose();
  });

  it('should populate url on loaderConfig after file-based load', async () => {
    const file = new File(['data'], 'image.exr', { type: 'image/x-exr' });
    const rep = makeRepresentation({ file });
    const loader = new FileRepresentationLoader();

    await loader.load(rep);

    // After loading, loaderConfig should have url populated
    expect(rep.loaderConfig.url).toBe('blob:http://localhost/mock-blob-url');
    expect(mockCreateObjectURL).toHaveBeenCalledWith(file);

    loader.dispose();
  });

  it('should not overwrite existing url on loaderConfig', async () => {
    const file = new File(['data'], 'image.exr', { type: 'image/x-exr' });
    const rep = makeRepresentation({
      file,
      url: 'https://example.com/existing-url.exr',
    });
    const loader = new FileRepresentationLoader();

    await loader.load(rep);

    // Should keep the original url, not overwrite it
    expect(rep.loaderConfig.url).toBe('https://example.com/existing-url.exr');
    expect(mockCreateObjectURL).not.toHaveBeenCalled();

    loader.dispose();
  });

  // --- URL-based loading (deserialized / restored) ---

  it('should load from url when file is absent', async () => {
    const rep = makeRepresentation({
      url: 'blob:http://localhost/mock-blob-url',
      path: 'image.exr',
    });
    const loader = new FileRepresentationLoader();

    const result = await loader.load(rep);

    expect(result.sourceNode).toBeDefined();
    expect(result.resolution).toEqual({ width: 1920, height: 1080 });

    loader.dispose();
  });

  it('should load from path (as url fallback) when file is absent', async () => {
    const rep = makeRepresentation({
      path: '/assets/image.exr',
    });
    const loader = new FileRepresentationLoader();

    const result = await loader.load(rep);

    expect(result.sourceNode).toBeDefined();

    loader.dispose();
  });

  // --- Error cases ---

  it('should throw when neither file nor url/path are provided', async () => {
    const rep = makeRepresentation({});
    const loader = new FileRepresentationLoader();

    await expect(loader.load(rep)).rejects.toThrow('no file or url provided');

    loader.dispose();
  });

  // --- Round-trip serialization ---

  it('should serialize file representation with url after load', async () => {
    const file = new File(['data'], 'image.exr', { type: 'image/x-exr' });
    const rep = makeRepresentation({ file, path: 'image.exr' });
    const loader = new FileRepresentationLoader();

    await loader.load(rep);
    loader.dispose();

    const serialized = serializeRepresentation(rep);

    // file should be stripped
    expect(serialized.loaderConfig).not.toHaveProperty('file');
    // url should survive
    expect(serialized.loaderConfig.url).toBe('blob:http://localhost/mock-blob-url');
    expect(serialized.loaderConfig.path).toBe('image.exr');
  });

  it('should round-trip: serialize then deserialize preserves url', async () => {
    const file = new File(['data'], 'image.exr', { type: 'image/x-exr' });
    const rep = makeRepresentation({ file, path: 'image.exr' });
    const loader = new FileRepresentationLoader();

    await loader.load(rep);
    loader.dispose();

    const serialized = serializeRepresentation(rep);
    const deserialized = deserializeRepresentation(serialized);

    expect(deserialized.loaderConfig.url).toBe('blob:http://localhost/mock-blob-url');
    expect(deserialized.loaderConfig.path).toBe('image.exr');
    // Runtime fields should not be present
    expect(deserialized.loaderConfig).not.toHaveProperty('file');
    expect(deserialized.sourceNode).toBeNull();
    expect(deserialized.status).toBe('idle');
  });

  it('should round-trip: serialize, deserialize, then load from url', async () => {
    // 1. Start with a file-based representation
    const file = new File(['data'], 'image.exr', { type: 'image/x-exr' });
    const originalRep = makeRepresentation({ file, path: 'image.exr' });

    // 2. Load to populate url
    const loader1 = new FileRepresentationLoader();
    await loader1.load(originalRep);
    loader1.dispose();

    // 3. Serialize (strips file)
    const serialized = serializeRepresentation(originalRep);
    expect(serialized.loaderConfig).not.toHaveProperty('file');
    expect(serialized.loaderConfig.url).toBe('blob:http://localhost/mock-blob-url');

    // 4. Deserialize
    const restored = deserializeRepresentation(serialized);

    // 5. Load from url (the fix for #530)
    const loader2 = new FileRepresentationLoader();
    const result = await loader2.load(restored);

    expect(result.sourceNode).toBeDefined();
    expect(result.resolution).toEqual({ width: 1920, height: 1080 });

    loader2.dispose();
  });

  // --- Dispose ---

  it('should dispose the source node', async () => {
    const file = new File(['data'], 'image.exr');
    const rep = makeRepresentation({ file });
    const loader = new FileRepresentationLoader();

    await loader.load(rep);
    loader.dispose();
    // Calling dispose again should not throw
    loader.dispose();
  });
});
