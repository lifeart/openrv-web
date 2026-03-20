import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session } from './Session';

// Mock SequenceLoader — import the real isSequencePattern so pattern detection works
vi.mock('../../utils/media/SequenceLoader', async () => {
  const actual = await vi.importActual<typeof import('../../utils/media/SequenceLoader')>(
    '../../utils/media/SequenceLoader',
  );
  return {
    createSequenceInfo: vi.fn(),
    createSequenceInfoFromPattern: vi.fn(),
    preloadFrames: vi.fn(),
    loadFrameImage: vi.fn(),
    loadFrameImageFromURL: vi.fn(),
    releaseDistantFrames: vi.fn(),
    disposeSequence: vi.fn(),
    buildFrameNumberMap: vi.fn().mockReturnValue(new Map()),
    getSequenceFrameRange: vi.fn().mockReturnValue(1),
    isSequencePattern: actual.isSequencePattern,
    parsePatternNotation: actual.parsePatternNotation,
    generateFilename: actual.generateFilename,
    expandPatternToURLs: actual.expandPatternToURLs,
  };
});

// Mock fetchUrlAsFile so we don't actually fetch anything
vi.mock('../../utils/media/fetchUrlAsFile', () => ({
  fetchUrlAsFile: vi
    .fn()
    .mockImplementation((_url: string, name: string) => Promise.resolve(new File([new ArrayBuffer(8)], name))),
}));

import { fetchUrlAsFile } from '../../utils/media/fetchUrlAsFile';

describe('Session.loadSourceFromUrl', () => {
  let session: Session;
  let loadImageSpy: ReturnType<typeof vi.fn>;
  let loadVideoSpy: ReturnType<typeof vi.fn>;
  let loadImageFileSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    session = new Session();
    loadImageSpy = vi.spyOn(session, 'loadImage').mockResolvedValue(undefined);
    loadVideoSpy = vi.spyOn(session, 'loadVideo').mockResolvedValue(undefined);
    loadImageFileSpy = vi.spyOn(session, 'loadImageFile').mockResolvedValue(undefined);
    vi.mocked(fetchUrlAsFile).mockClear();
  });

  describe('scheme validation', () => {
    it('rejects javascript: scheme', async () => {
      // eslint-disable-next-line no-script-url
      await expect(session.loadSourceFromUrl('javascript:alert(1)')).rejects.toThrow('Unsupported URL scheme');
    });

    it('rejects data: scheme', async () => {
      await expect(session.loadSourceFromUrl('data:text/html,<h1>hi</h1>')).rejects.toThrow('Unsupported URL scheme');
    });

    it('rejects ftp: scheme', async () => {
      await expect(session.loadSourceFromUrl('ftp://example.com/file.png')).rejects.toThrow('Unsupported URL scheme');
    });

    it('rejects completely invalid URL', async () => {
      await expect(session.loadSourceFromUrl('not a url at all')).rejects.toThrow('Invalid source URL');
    });
  });

  describe('accepted schemes', () => {
    it('accepts http:// and calls loadImage for browser-native formats', async () => {
      await session.loadSourceFromUrl('http://example.com/photo.png');
      expect(loadImageSpy).toHaveBeenCalledWith('photo.png', 'http://example.com/photo.png');
    });

    it('accepts https:// and calls loadImage for browser-native formats', async () => {
      await session.loadSourceFromUrl('https://example.com/photo.jpg');
      expect(loadImageSpy).toHaveBeenCalledWith('photo.jpg', 'https://example.com/photo.jpg');
    });
  });

  describe('video detection', () => {
    it('detects .mp4 as video', async () => {
      await session.loadSourceFromUrl('https://example.com/clip.mp4');
      expect(loadVideoSpy).toHaveBeenCalledWith('clip.mp4', 'https://example.com/clip.mp4');
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it('detects .mov as video', async () => {
      await session.loadSourceFromUrl('https://example.com/clip.mov');
      expect(loadVideoSpy).toHaveBeenCalledWith('clip.mov', 'https://example.com/clip.mov');
    });

    it('detects .webm as video', async () => {
      await session.loadSourceFromUrl('https://example.com/clip.webm');
      expect(loadVideoSpy).toHaveBeenCalledWith('clip.webm', 'https://example.com/clip.webm');
    });
  });

  describe('decoder-backed format detection', () => {
    it('routes .exr URLs through loadImageFile (decoder pipeline)', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/render.exr');
      expect(fetchUrlAsFile).toHaveBeenCalledWith('https://cdn.example.com/render.exr', 'render.exr');
      expect(loadImageFileSpy).toHaveBeenCalled();
      expect(loadImageSpy).not.toHaveBeenCalled();
      expect(loadVideoSpy).not.toHaveBeenCalled();
    });

    it('routes .dpx URLs through loadImageFile', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/frame.dpx');
      expect(fetchUrlAsFile).toHaveBeenCalledWith('https://cdn.example.com/frame.dpx', 'frame.dpx');
      expect(loadImageFileSpy).toHaveBeenCalled();
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it('routes .hdr URLs through loadImageFile', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/env.hdr');
      expect(loadImageFileSpy).toHaveBeenCalled();
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it('routes .tiff URLs through loadImageFile', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/scan.tiff');
      expect(loadImageFileSpy).toHaveBeenCalled();
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it('routes .cin (Cineon) URLs through loadImageFile', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/frame.cin');
      expect(loadImageFileSpy).toHaveBeenCalled();
    });

    it('routes .jxl URLs through loadImageFile', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/photo.jxl');
      expect(loadImageFileSpy).toHaveBeenCalled();
    });

    it('routes .heic URLs through loadImageFile', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/photo.heic');
      expect(loadImageFileSpy).toHaveBeenCalled();
    });

    it('routes .jp2 URLs through loadImageFile', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/photo.jp2');
      expect(loadImageFileSpy).toHaveBeenCalled();
    });

    it('routes .cr2 (RAW) URLs through loadImageFile', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/photo.cr2');
      expect(loadImageFileSpy).toHaveBeenCalled();
    });

    it('routes .exr with query params through loadImageFile', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/image.exr?v=2&sig=xyz');
      expect(fetchUrlAsFile).toHaveBeenCalledWith('https://cdn.example.com/image.exr?v=2&sig=xyz', 'image.exr');
      expect(loadImageFileSpy).toHaveBeenCalled();
      expect(loadVideoSpy).not.toHaveBeenCalled();
    });

    it('passes the fetched File to loadImageFile with correct name', async () => {
      const mockFile = new File([new ArrayBuffer(8)], 'render.exr');
      vi.mocked(fetchUrlAsFile).mockResolvedValueOnce(mockFile);
      await session.loadSourceFromUrl('https://cdn.example.com/render.exr');
      expect(loadImageFileSpy).toHaveBeenCalledWith(mockFile);
    });
  });

  describe('browser-native image formats use fast path', () => {
    it('routes .png through loadImage (HTMLImageElement)', async () => {
      await session.loadSourceFromUrl('https://example.com/photo.png');
      expect(loadImageSpy).toHaveBeenCalledWith('photo.png', 'https://example.com/photo.png');
      expect(loadImageFileSpy).not.toHaveBeenCalled();
    });

    it('routes .jpg through loadImage', async () => {
      await session.loadSourceFromUrl('https://example.com/photo.jpg');
      expect(loadImageSpy).toHaveBeenCalled();
      expect(loadImageFileSpy).not.toHaveBeenCalled();
    });

    it('routes .jpeg through loadImage', async () => {
      await session.loadSourceFromUrl('https://example.com/photo.jpeg');
      expect(loadImageSpy).toHaveBeenCalled();
      expect(loadImageFileSpy).not.toHaveBeenCalled();
    });

    it('routes .webp through loadImage', async () => {
      await session.loadSourceFromUrl('https://example.com/photo.webp');
      expect(loadImageSpy).toHaveBeenCalled();
      expect(loadImageFileSpy).not.toHaveBeenCalled();
    });

    it('routes .gif through loadImage', async () => {
      await session.loadSourceFromUrl('https://example.com/anim.gif');
      expect(loadImageSpy).toHaveBeenCalled();
      expect(loadImageFileSpy).not.toHaveBeenCalled();
    });

    it('routes .avif through loadImage', async () => {
      await session.loadSourceFromUrl('https://example.com/photo.avif');
      expect(loadImageSpy).toHaveBeenCalled();
      expect(loadImageFileSpy).not.toHaveBeenCalled();
    });
  });

  describe('error handling for failed URL fetches', () => {
    it('propagates fetch errors for decoder-backed formats', async () => {
      vi.mocked(fetchUrlAsFile).mockRejectedValueOnce(
        new Error('Failed to fetch URL (404): https://cdn.example.com/missing.exr'),
      );
      await expect(session.loadSourceFromUrl('https://cdn.example.com/missing.exr')).rejects.toThrow(
        'Failed to fetch URL (404)',
      );
    });
  });

  describe('URL with query params', () => {
    it('still detects video extension with query params', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/clip.mp4?t=1');
      expect(loadVideoSpy).toHaveBeenCalledWith('clip.mp4', 'https://cdn.example.com/clip.mp4?t=1');
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it('works when URL has no query params', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/clip.mp4');
      expect(loadVideoSpy).toHaveBeenCalled();
    });

    it('detects .mov with signed token query string', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/shot.mov?token=abc123');
      expect(loadVideoSpy).toHaveBeenCalledWith('shot.mov', 'https://cdn.example.com/shot.mov?token=abc123');
      expect(loadImageSpy).not.toHaveBeenCalled();
    });
  });

  describe('URL with hash fragment', () => {
    it('detects .mp4 with hash fragment', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/clip.mp4#signed');
      expect(loadVideoSpy).toHaveBeenCalledWith('clip.mp4', 'https://cdn.example.com/clip.mp4#signed');
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it('detects .mov with hash fragment', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/shot.mov#t=5');
      expect(loadVideoSpy).toHaveBeenCalledWith('shot.mov', 'https://cdn.example.com/shot.mov#t=5');
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it('detects image extension with hash fragment', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/photo.png#section');
      expect(loadImageSpy).toHaveBeenCalledWith('photo.png', 'https://cdn.example.com/photo.png#section');
      expect(loadVideoSpy).not.toHaveBeenCalled();
    });
  });

  describe('URL with both query and hash', () => {
    it('detects video with query and hash combined', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/clip.mp4?token=abc#t=5');
      expect(loadVideoSpy).toHaveBeenCalledWith('clip.mp4', 'https://cdn.example.com/clip.mp4?token=abc#t=5');
      expect(loadImageSpy).not.toHaveBeenCalled();
    });
  });

  describe('display name is clean', () => {
    it('display name does not contain query params', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/shot.mov?token=abc');
      expect(loadVideoSpy).toHaveBeenCalledWith('shot.mov', expect.any(String));
      // Verify name does NOT contain '?'
      const calledName = loadVideoSpy.mock.calls[0]![0];
      expect(calledName).not.toContain('?');
      expect(calledName).not.toContain('token');
    });

    it('display name does not contain hash fragment', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/clip.mp4#signed');
      const calledName = loadVideoSpy.mock.calls[0]![0];
      expect(calledName).not.toContain('#');
      expect(calledName).not.toContain('signed');
    });

    it('decodes percent-encoded characters in display name', async () => {
      await session.loadSourceFromUrl('https://cdn.example.com/my%20shot.mov?token=abc');
      expect(loadVideoSpy).toHaveBeenCalledWith('my shot.mov', expect.any(String));
    });
  });

  describe('URL with no extension', () => {
    it('defaults to loadImage when no extension present', async () => {
      await session.loadSourceFromUrl('https://example.com/media');
      expect(loadImageSpy).toHaveBeenCalledWith('media', 'https://example.com/media');
      expect(loadVideoSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Issue #520: pattern string routing
  // ==========================================================================

  describe('pattern string routing (Issue #520)', () => {
    let loadSeqPatternSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      loadSeqPatternSpy = vi.spyOn(session, 'loadImageSequenceFromPattern').mockResolvedValue(undefined);
    });

    it('routes hash pattern (####) to loadImageSequenceFromPattern', async () => {
      await session.loadSourceFromUrl('shot.####.exr');
      expect(loadSeqPatternSpy).toHaveBeenCalledWith('shot', 'shot.####.exr', 1, 100, undefined);
      expect(loadImageSpy).not.toHaveBeenCalled();
      expect(loadVideoSpy).not.toHaveBeenCalled();
    });

    it('routes printf pattern (%04d) to loadImageSequenceFromPattern', async () => {
      await session.loadSourceFromUrl('frame.%04d.exr');
      expect(loadSeqPatternSpy).toHaveBeenCalledWith('frame', 'frame.%04d.exr', 1, 100, undefined);
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it('routes at-sign pattern (@@@@) to loadImageSequenceFromPattern', async () => {
      await session.loadSourceFromUrl('render.@@@@.exr');
      expect(loadSeqPatternSpy).toHaveBeenCalledWith('render', 'render.@@@@.exr', 1, 100, undefined);
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it('routes path-prefixed pattern to loadImageSequenceFromPattern', async () => {
      await session.loadSourceFromUrl('/path/to/shot.####.exr');
      expect(loadSeqPatternSpy).toHaveBeenCalledWith('shot', '/path/to/shot.####.exr', 1, 100, undefined);
    });

    it('does not route regular URLs to pattern loader', async () => {
      await session.loadSourceFromUrl('https://example.com/photo.png');
      expect(loadSeqPatternSpy).not.toHaveBeenCalled();
      expect(loadImageSpy).toHaveBeenCalled();
    });

    it('does not route numbered filenames to pattern loader', async () => {
      await session.loadSourceFromUrl('https://example.com/shot.0001.exr');
      expect(loadSeqPatternSpy).not.toHaveBeenCalled();
    });
  });

  describe('loadSequenceFromPatternString (Issue #520)', () => {
    let loadSeqPatternSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      loadSeqPatternSpy = vi.spyOn(session, 'loadImageSequenceFromPattern').mockResolvedValue(undefined);
    });

    it('accepts custom frame range', async () => {
      await session.loadSequenceFromPatternString('shot.####.exr', 1001, 1100);
      expect(loadSeqPatternSpy).toHaveBeenCalledWith('shot', 'shot.####.exr', 1001, 1100, undefined);
    });

    it('accepts custom fps', async () => {
      await session.loadSequenceFromPatternString('frame.%04d.png', 1, 48, 30);
      expect(loadSeqPatternSpy).toHaveBeenCalledWith('frame', 'frame.%04d.png', 1, 48, 30);
    });

    it('derives display name from hash pattern', async () => {
      await session.loadSequenceFromPatternString('render_######.tif', 1, 10);
      const calledName = loadSeqPatternSpy.mock.calls[0]![0];
      expect(calledName).toBe('render');
    });

    it('derives display name from printf pattern with underscores', async () => {
      await session.loadSequenceFromPatternString('my_shot_%04d.exr', 1, 10);
      const calledName = loadSeqPatternSpy.mock.calls[0]![0];
      expect(calledName).toBe('my_shot');
    });

    it('derives display name from at-sign pattern', async () => {
      await session.loadSequenceFromPatternString('comp.@@@@.png', 1, 10);
      const calledName = loadSeqPatternSpy.mock.calls[0]![0];
      expect(calledName).toBe('comp');
    });

    it('uses "sequence" as fallback name', async () => {
      await session.loadSequenceFromPatternString('%04d.png', 1, 10);
      const calledName = loadSeqPatternSpy.mock.calls[0]![0];
      expect(calledName).toBe('sequence');
    });

    it('defaults to frame range 1-100', async () => {
      await session.loadSequenceFromPatternString('shot.####.exr');
      expect(loadSeqPatternSpy).toHaveBeenCalledWith('shot', 'shot.####.exr', 1, 100, undefined);
    });
  });
});
