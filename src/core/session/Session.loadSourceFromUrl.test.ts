import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session } from './Session';

// Mock SequenceLoader
vi.mock('../../utils/media/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
  preloadFrames: vi.fn(),
  loadFrameImage: vi.fn(),
  releaseDistantFrames: vi.fn(),
  disposeSequence: vi.fn(),
}));

// Mock fetchUrlAsFile so we don't actually fetch anything
vi.mock('../../utils/media/fetchUrlAsFile', () => ({
  fetchUrlAsFile: vi.fn().mockImplementation((_url: string, name: string) =>
    Promise.resolve(new File([new ArrayBuffer(8)], name)),
  ),
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
      expect(fetchUrlAsFile).toHaveBeenCalledWith(
        'https://cdn.example.com/image.exr?v=2&sig=xyz',
        'image.exr',
      );
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
      vi.mocked(fetchUrlAsFile).mockRejectedValueOnce(new Error('Failed to fetch URL (404): https://cdn.example.com/missing.exr'));
      await expect(
        session.loadSourceFromUrl('https://cdn.example.com/missing.exr'),
      ).rejects.toThrow('Failed to fetch URL (404)');
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
});
