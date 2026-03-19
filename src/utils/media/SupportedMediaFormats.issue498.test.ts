/**
 * Regression tests for Issue #498:
 * Magic-number fallback for misnamed or extensionless files.
 *
 * Verifies that detectMediaTypeFromFileBytes() probes file bytes against the
 * DecoderRegistry when MIME/extension detection returns 'unknown', and that
 * the SessionMedia.loadFile() path correctly falls back to magic-number
 * sniffing before rejecting a file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectMediaTypeFromFile, detectMediaTypeFromFileBytes } from './SupportedMediaFormats';

// ---------------------------------------------------------------------------
// EXR magic number: 0x762f3101 stored little-endian at offset 0
// ---------------------------------------------------------------------------
function makeEXRBytes(): Uint8Array {
  // Minimal EXR header: magic 0x01312f76 (LE) + version 2.0 (4 bytes)
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 0x762f3101, false); // EXR magic in LE
  view.setUint32(4, 0x00000002, true); // version
  return buf;
}

// ---------------------------------------------------------------------------
// DPX magic number: "SDPX" (0x53445058) at offset 0
// ---------------------------------------------------------------------------
function makeDPXBytes(): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 0x53445058, false); // "SDPX"
  return buf;
}

// ---------------------------------------------------------------------------
// Cineon magic number: 0x802a5fd7 at offset 0
// ---------------------------------------------------------------------------
function makeCineonBytes(): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 0x802a5fd7, false);
  return buf;
}

// ---------------------------------------------------------------------------
// Radiance HDR magic: "#?RADIANCE"
// ---------------------------------------------------------------------------
function makeHDRBytes(): Uint8Array {
  const header = '#?RADIANCE\n';
  const buf = new Uint8Array(header.length);
  for (let i = 0; i < header.length; i++) {
    buf[i] = header.charCodeAt(i);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, bytes: Uint8Array, type = ''): File {
  return new File([bytes as BlobPart], name, { type });
}

// ---------------------------------------------------------------------------
// detectMediaTypeFromFile — sanity: existing behaviour unchanged
// ---------------------------------------------------------------------------

describe('detectMediaTypeFromFile — existing behaviour (issue #498)', () => {
  it('still returns image for a normal .exr file', () => {
    expect(detectMediaTypeFromFile({ name: 'render.exr', type: '' })).toBe('image');
  });

  it('still returns video for a normal .mp4 file', () => {
    expect(detectMediaTypeFromFile({ name: 'clip.mp4', type: 'video/mp4' })).toBe('video');
  });

  it('returns unknown for extensionless file with no MIME', () => {
    expect(detectMediaTypeFromFile({ name: 'mystery_file', type: '' })).toBe('unknown');
  });

  it('returns unknown for file with unrecognized extension', () => {
    expect(detectMediaTypeFromFile({ name: 'data.xyz', type: '' })).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// detectMediaTypeFromFileBytes — magic-number fallback
// ---------------------------------------------------------------------------

describe('detectMediaTypeFromFileBytes (issue #498)', () => {
  it('detects extensionless file with EXR magic bytes as image', async () => {
    const file = makeFile('mystery_file', makeEXRBytes());
    const result = await detectMediaTypeFromFileBytes(file);
    expect(result).toBe('image');
  });

  it('detects misnamed .txt file with EXR magic bytes as image', async () => {
    const file = makeFile('render.txt', makeEXRBytes());
    const result = await detectMediaTypeFromFileBytes(file);
    expect(result).toBe('image');
  });

  it('detects extensionless file with DPX magic bytes as image', async () => {
    const file = makeFile('scan_001', makeDPXBytes());
    const result = await detectMediaTypeFromFileBytes(file);
    expect(result).toBe('image');
  });

  it('detects misnamed .dat file with DPX magic bytes as image', async () => {
    const file = makeFile('frame.dat', makeDPXBytes());
    const result = await detectMediaTypeFromFileBytes(file);
    expect(result).toBe('image');
  });

  it('detects extensionless file with Cineon magic bytes as image', async () => {
    const file = makeFile('cin_frame', makeCineonBytes());
    const result = await detectMediaTypeFromFileBytes(file);
    expect(result).toBe('image');
  });

  it('detects extensionless file with Radiance HDR magic bytes as image', async () => {
    const file = makeFile('environment', makeHDRBytes());
    const result = await detectMediaTypeFromFileBytes(file);
    expect(result).toBe('image');
  });

  it('returns unknown for truly unrecognized bytes', async () => {
    const junk = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef]);
    const file = makeFile('mystery', junk);
    const result = await detectMediaTypeFromFileBytes(file);
    expect(result).toBe('unknown');
  });

  it('returns unknown for empty file', async () => {
    const file = makeFile('empty', new Uint8Array(0));
    const result = await detectMediaTypeFromFileBytes(file);
    expect(result).toBe('unknown');
  });

  it('returns unknown for very small file with insufficient bytes', async () => {
    const file = makeFile('tiny', new Uint8Array([0x01]));
    const result = await detectMediaTypeFromFileBytes(file);
    expect(result).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// SessionMedia.loadFile integration — magic-number fallback wiring
// ---------------------------------------------------------------------------

describe('SessionMedia.loadFile — magic-number fallback (issue #498)', () => {
  // We test the wiring by checking that loadFile does NOT reject a file
  // that has valid EXR magic bytes but no extension, and DOES reject a file
  // with unknown bytes and no extension.

  // The SessionMedia tests mock FileSourceNode and other heavy dependencies.
  // Here we only verify the classification path, not the actual decode.

  let SessionMedia: typeof import('../../core/session/SessionMedia').SessionMedia;
  let mockDetectMediaTypeFromFile: ReturnType<typeof vi.fn>;
  let mockDetectMediaTypeFromFileBytes: ReturnType<typeof vi.fn>;
  let mockFileSourceNodeInstance: any;

  beforeEach(async () => {
    vi.resetModules();

    mockDetectMediaTypeFromFile = vi.fn().mockReturnValue('unknown');
    mockDetectMediaTypeFromFileBytes = vi.fn().mockResolvedValue('unknown');

    // Mock sequence loader
    vi.doMock('../../utils/media/SequenceLoader', () => ({
      createSequenceInfo: vi.fn(),
      createSequenceInfoFromPattern: vi.fn(),
      loadFrameImage: vi.fn(),
      loadFrameImageFromURL: vi.fn(),
      preloadFrames: vi.fn(),
      releaseDistantFrames: vi.fn(),
      disposeSequence: vi.fn(),
      buildFrameNumberMap: vi.fn(),
      getSequenceFrameRange: vi.fn(),
    }));

    // Mock SupportedMediaFormats
    vi.doMock('./SupportedMediaFormats', () => ({
      detectMediaTypeFromFile: mockDetectMediaTypeFromFile,
      detectMediaTypeFromFileBytes: mockDetectMediaTypeFromFileBytes,
    }));

    // Mock FileSourceNode
    mockFileSourceNodeInstance = {
      loadFile: vi.fn().mockResolvedValue(undefined),
      isHDR: vi.fn().mockReturnValue(false),
      formatName: null,
      width: 100,
      height: 100,
      properties: {
        getValue: vi.fn().mockReturnValue(''),
      },
      dispose: vi.fn(),
    };

    vi.doMock('../../nodes/sources/FileSourceNode', () => ({
      FileSourceNode: vi.fn().mockImplementation(() => mockFileSourceNodeInstance),
    }));

    vi.doMock('../../nodes/sources/VideoSourceNode', () => ({
      VideoSourceNode: vi.fn(),
    }));

    vi.doMock('../../nodes/sources/ProceduralSourceNode', () => ({
      ProceduralSourceNode: vi.fn(),
      parseMovieProc: vi.fn(),
    }));

    vi.doMock('../../cache/MediaCacheKey', () => ({
      computeCacheKey: vi.fn().mockResolvedValue('key'),
    }));

    const mod = await import('../../core/session/SessionMedia');
    SessionMedia = mod.SessionMedia;
  });

  function createHost() {
    return {
      getFps: vi.fn().mockReturnValue(24),
      getCurrentFrame: vi.fn().mockReturnValue(1),
      setFps: vi.fn(),
      setInPoint: vi.fn(),
      setOutPoint: vi.fn(),
      setCurrentFrame: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      getIsPlaying: vi.fn().mockReturnValue(false),
      getMuted: vi.fn().mockReturnValue(false),
      getEffectiveVolume: vi.fn().mockReturnValue(1),
      initVideoPreservesPitch: vi.fn(),
      onSourceAdded: vi.fn().mockReturnValue({ currentSourceIndex: 0, emitEvent: false }),
      emitABChanged: vi.fn(),
      loadAudioFromVideo: vi.fn(),
      clearGraphData: vi.fn(),
      emitFpsChanged: vi.fn(),
      emitInOutChanged: vi.fn(),
    };
  }

  it('rejects a truly unknown file (no extension, unknown bytes)', async () => {
    const sm = new SessionMedia();
    sm.setHost(createHost());

    mockDetectMediaTypeFromFile.mockReturnValue('unknown');
    mockDetectMediaTypeFromFileBytes.mockResolvedValue('unknown');

    const file = new File([new Uint8Array([0xde, 0xad]) as BlobPart], 'mystery', { type: '' });
    await expect(sm.loadFile(file)).rejects.toThrow('Unsupported file type');
  });

  it('loads an extensionless file when magic bytes are recognized as image', async () => {
    const sm = new SessionMedia();
    sm.setHost(createHost());

    mockDetectMediaTypeFromFile.mockReturnValue('unknown');
    mockDetectMediaTypeFromFileBytes.mockResolvedValue('image');

    const file = new File([makeEXRBytes() as BlobPart], 'mystery_exr', { type: '' });

    // Should NOT throw — the magic-number fallback should classify as image
    await sm.loadFile(file);

    // Verify that detectMediaTypeFromFileBytes was called
    expect(mockDetectMediaTypeFromFileBytes).toHaveBeenCalledWith(file);
  });

  it('does not call magic-byte detection when extension matches', async () => {
    const sm = new SessionMedia();
    sm.setHost(createHost());

    mockDetectMediaTypeFromFile.mockReturnValue('image');

    const file = new File([makeEXRBytes() as BlobPart], 'render.exr', { type: '' });
    await sm.loadFile(file);

    // Should NOT have called the fallback since extension matched
    expect(mockDetectMediaTypeFromFileBytes).not.toHaveBeenCalled();
  });
});
