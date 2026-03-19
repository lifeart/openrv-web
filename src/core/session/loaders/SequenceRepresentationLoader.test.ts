/**
 * Regression tests for issue #528:
 * Sequence representations cannot round-trip through serialization because
 * the serialized loader config omits `files` while SequenceRepresentationLoader
 * requires them.
 *
 * The fix adds a URL/pattern-based loading path so that deserialized
 * representations (which have `pattern` + `frameRange` but no `files`)
 * can still be loaded.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SequenceRepresentationLoader, SequenceSourceNodeWrapper } from './SequenceRepresentationLoader';
import { serializeRepresentation, deserializeRepresentation } from '../../types/representation';
import type { MediaRepresentation } from '../../types/representation';
import type { SequenceInfo, SequenceFrame } from '../../../utils/media/SequenceLoader';

// Mock SequenceLoader utilities
vi.mock('../../../utils/media/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
  createSequenceInfoFromPattern: vi.fn(),
}));

// Import mocked functions for per-test configuration
import { createSequenceInfo, createSequenceInfoFromPattern } from '../../../utils/media/SequenceLoader';

const mockedCreateSequenceInfo = vi.mocked(createSequenceInfo);
const mockedCreateSequenceInfoFromPattern = vi.mocked(createSequenceInfoFromPattern);

function makeSequenceInfo(overrides?: Partial<SequenceInfo>): SequenceInfo {
  return {
    name: 'shot',
    pattern: 'shot.####.exr',
    frames: [
      { index: 0, frameNumber: 1001, file: new File([], 'shot.1001.exr'), url: '/frames/shot.1001.exr' },
      { index: 1, frameNumber: 1002, file: new File([], 'shot.1002.exr'), url: '/frames/shot.1002.exr' },
      { index: 2, frameNumber: 1003, file: new File([], 'shot.1003.exr'), url: '/frames/shot.1003.exr' },
    ] as SequenceFrame[],
    startFrame: 1001,
    endFrame: 1003,
    width: 4096,
    height: 2160,
    fps: 24,
    missingFrames: [],
    ...overrides,
  };
}

function makeRepresentation(loaderConfig: MediaRepresentation['loaderConfig']): MediaRepresentation {
  return {
    id: 'seq-rep-1',
    label: 'EXR Sequence (4096x2160)',
    kind: 'frames',
    priority: 0,
    status: 'idle',
    resolution: { width: 4096, height: 2160 },
    par: 1.0,
    sourceNode: null,
    loaderConfig,
    audioTrackPresent: false,
    startFrame: 1001,
    duration: 3,
    fps: 24,
  };
}

describe('SequenceRepresentationLoader (issue #528)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- File-based loading (backward compat) ---

  it('should load from files when files are provided', async () => {
    const seqInfo = makeSequenceInfo();
    mockedCreateSequenceInfo.mockResolvedValue(seqInfo);

    const files = [new File([], 'shot.1001.exr'), new File([], 'shot.1002.exr')];
    const rep = makeRepresentation({ files, fps: 24 });
    const loader = new SequenceRepresentationLoader();

    const result = await loader.load(rep);

    expect(mockedCreateSequenceInfo).toHaveBeenCalledWith(files, 24);
    expect(mockedCreateSequenceInfoFromPattern).not.toHaveBeenCalled();
    expect(result.sourceNode).toBeInstanceOf(SequenceSourceNodeWrapper);
    expect(result.resolution).toEqual({ width: 4096, height: 2160 });
    expect(result.duration).toBe(3);

    loader.dispose();
  });

  it('should populate pattern and frameRange on loaderConfig after file-based load', async () => {
    const seqInfo = makeSequenceInfo();
    mockedCreateSequenceInfo.mockResolvedValue(seqInfo);

    const files = [new File([], 'shot.1001.exr'), new File([], 'shot.1002.exr')];
    const rep = makeRepresentation({ files, fps: 24 });
    const loader = new SequenceRepresentationLoader();

    await loader.load(rep);

    // After loading, loaderConfig should have pattern and frameRange populated
    expect(rep.loaderConfig.pattern).toBe('shot.####.exr');
    expect(rep.loaderConfig.frameRange).toEqual({ start: 1001, end: 1003 });

    loader.dispose();
  });

  it('should not overwrite existing pattern on loaderConfig', async () => {
    const seqInfo = makeSequenceInfo();
    mockedCreateSequenceInfo.mockResolvedValue(seqInfo);

    const files = [new File([], 'shot.1001.exr')];
    const rep = makeRepresentation({
      files,
      fps: 24,
      pattern: 'custom.####.exr',
    });
    const loader = new SequenceRepresentationLoader();

    await loader.load(rep);

    // Should keep the original pattern, not overwrite it
    expect(rep.loaderConfig.pattern).toBe('custom.####.exr');

    loader.dispose();
  });

  // --- Pattern-based loading (deserialized / restored) ---

  it('should load from pattern + frameRange when files are absent', async () => {
    const seqInfo = makeSequenceInfo();
    mockedCreateSequenceInfoFromPattern.mockResolvedValue(seqInfo);

    const rep = makeRepresentation({
      pattern: 'shot.####.exr',
      frameRange: { start: 1001, end: 1003 },
      fps: 24,
    });
    const loader = new SequenceRepresentationLoader();

    const result = await loader.load(rep);

    expect(mockedCreateSequenceInfoFromPattern).toHaveBeenCalledWith('shot.####.exr', 1001, 1003, 24);
    expect(mockedCreateSequenceInfo).not.toHaveBeenCalled();
    expect(result.sourceNode).toBeInstanceOf(SequenceSourceNodeWrapper);
    expect(result.resolution).toEqual({ width: 4096, height: 2160 });

    loader.dispose();
  });

  it('should use default fps of 24 when not specified in pattern-based load', async () => {
    const seqInfo = makeSequenceInfo();
    mockedCreateSequenceInfoFromPattern.mockResolvedValue(seqInfo);

    const rep = makeRepresentation({
      pattern: 'shot.####.exr',
      frameRange: { start: 1, end: 10 },
      // no fps
    });
    const loader = new SequenceRepresentationLoader();

    await loader.load(rep);

    expect(mockedCreateSequenceInfoFromPattern).toHaveBeenCalledWith('shot.####.exr', 1, 10, 24);

    loader.dispose();
  });

  // --- Error cases ---

  it('should throw when neither files nor pattern+frameRange are provided', async () => {
    const rep = makeRepresentation({});
    const loader = new SequenceRepresentationLoader();

    await expect(loader.load(rep)).rejects.toThrow('no files or pattern provided');

    loader.dispose();
  });

  it('should throw when only pattern is provided without frameRange', async () => {
    const rep = makeRepresentation({ pattern: 'shot.####.exr' });
    const loader = new SequenceRepresentationLoader();

    await expect(loader.load(rep)).rejects.toThrow('no files or pattern provided');

    loader.dispose();
  });

  it('should throw when only frameRange is provided without pattern', async () => {
    const rep = makeRepresentation({ frameRange: { start: 1, end: 10 } });
    const loader = new SequenceRepresentationLoader();

    await expect(loader.load(rep)).rejects.toThrow('no files or pattern provided');

    loader.dispose();
  });

  it('should throw when files array is empty', async () => {
    const rep = makeRepresentation({ files: [] });
    const loader = new SequenceRepresentationLoader();

    await expect(loader.load(rep)).rejects.toThrow('no files or pattern provided');

    loader.dispose();
  });

  // --- Round-trip serialization ---

  it('should serialize sequence representation with pattern and frameRange', () => {
    const rep = makeRepresentation({
      files: [new File([], 'shot.1001.exr')],
      pattern: 'shot.####.exr',
      frameRange: { start: 1001, end: 1003 },
      fps: 24,
    });

    const serialized = serializeRepresentation(rep);

    // files should be stripped
    expect(serialized.loaderConfig).not.toHaveProperty('files');
    // pattern and frameRange should survive
    expect(serialized.loaderConfig.pattern).toBe('shot.####.exr');
    expect(serialized.loaderConfig.frameRange).toEqual({ start: 1001, end: 1003 });
    expect(serialized.loaderConfig.fps).toBe(24);
  });

  it('should round-trip: serialize then deserialize preserves pattern and frameRange', () => {
    const rep = makeRepresentation({
      files: [new File([], 'shot.1001.exr')],
      pattern: 'shot.####.exr',
      frameRange: { start: 1001, end: 1003 },
      fps: 24,
    });

    const serialized = serializeRepresentation(rep);
    const deserialized = deserializeRepresentation(serialized);

    expect(deserialized.loaderConfig.pattern).toBe('shot.####.exr');
    expect(deserialized.loaderConfig.frameRange).toEqual({ start: 1001, end: 1003 });
    expect(deserialized.loaderConfig.fps).toBe(24);
    // Runtime fields should not be present
    expect(deserialized.loaderConfig).not.toHaveProperty('files');
    expect(deserialized.loaderConfig).not.toHaveProperty('file');
    expect(deserialized.sourceNode).toBeNull();
    expect(deserialized.status).toBe('idle');
  });

  it('should round-trip: serialize, deserialize, then load from pattern', async () => {
    const seqInfo = makeSequenceInfo();

    // 1. Start with a file-based representation
    mockedCreateSequenceInfo.mockResolvedValue(seqInfo);
    const files = [new File([], 'shot.1001.exr'), new File([], 'shot.1002.exr')];
    const originalRep = makeRepresentation({ files, fps: 24 });

    // 2. Load to populate pattern/frameRange
    const loader1 = new SequenceRepresentationLoader();
    await loader1.load(originalRep);
    loader1.dispose();

    // 3. Serialize (strips files)
    const serialized = serializeRepresentation(originalRep);
    expect(serialized.loaderConfig).not.toHaveProperty('files');
    expect(serialized.loaderConfig.pattern).toBe('shot.####.exr');
    expect(serialized.loaderConfig.frameRange).toEqual({ start: 1001, end: 1003 });

    // 4. Deserialize
    const restored = deserializeRepresentation(serialized);

    // 5. Load from pattern (the fix for #528)
    mockedCreateSequenceInfoFromPattern.mockResolvedValue(seqInfo);
    const loader2 = new SequenceRepresentationLoader();
    const result = await loader2.load(restored);

    expect(mockedCreateSequenceInfoFromPattern).toHaveBeenCalledWith('shot.####.exr', 1001, 1003, 24);
    expect(result.sourceNode).toBeInstanceOf(SequenceSourceNodeWrapper);
    expect(result.resolution).toEqual({ width: 4096, height: 2160 });
    expect(result.duration).toBe(3);

    loader2.dispose();
  });

  // --- SequenceSourceNodeWrapper ---

  it('SequenceSourceNodeWrapper should expose sequenceInfo and frames', () => {
    const seqInfo = makeSequenceInfo();
    const wrapper = new SequenceSourceNodeWrapper(seqInfo, seqInfo.frames);

    expect(wrapper.sequenceInfo).toBe(seqInfo);
    expect(wrapper.frames).toBe(seqInfo.frames);
    expect(wrapper.isReady()).toBe(true);

    wrapper.dispose();
  });
});
