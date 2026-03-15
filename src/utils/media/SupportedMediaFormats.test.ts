import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectMediaTypeFromFile,
  detectMediaTypeFromUrl,
  getExtensionFromUrl,
} from './SupportedMediaFormats';

// ---------------------------------------------------------------------------
// getExtensionFromUrl
// ---------------------------------------------------------------------------

describe('getExtensionFromUrl', () => {
  it('extracts extension from a simple URL', () => {
    expect(getExtensionFromUrl('https://example.com/video.mp4')).toBe('mp4');
  });

  it('extracts extension ignoring query string', () => {
    expect(getExtensionFromUrl('https://cdn.example.com/file.mov?token=abc')).toBe('mov');
  });

  it('extracts extension ignoring fragment', () => {
    expect(getExtensionFromUrl('https://example.com/image.png#section')).toBe('png');
  });

  it('returns empty string for extensionless URL', () => {
    expect(getExtensionFromUrl('https://example.com/media/12345')).toBe('');
  });

  it('returns empty string for root URL', () => {
    expect(getExtensionFromUrl('https://example.com/')).toBe('');
  });

  it('handles URL with multiple dots', () => {
    expect(getExtensionFromUrl('https://example.com/my.video.file.webm')).toBe('webm');
  });

  it('handles relative path', () => {
    expect(getExtensionFromUrl('/stream/latest')).toBe('');
  });

  it('handles relative path with extension', () => {
    expect(getExtensionFromUrl('/assets/clip.mp4')).toBe('mp4');
  });
});

// ---------------------------------------------------------------------------
// detectMediaTypeFromFile (existing function - basic sanity)
// ---------------------------------------------------------------------------

describe('detectMediaTypeFromFile', () => {
  it('detects video from MIME type', () => {
    expect(detectMediaTypeFromFile({ name: 'file', type: 'video/mp4' })).toBe('video');
  });

  it('detects image from MIME type', () => {
    expect(detectMediaTypeFromFile({ name: 'file', type: 'image/png' })).toBe('image');
  });

  it('detects video from extension when MIME is empty', () => {
    expect(detectMediaTypeFromFile({ name: 'clip.mp4', type: '' })).toBe('video');
  });

  it('defaults to unknown for unrecognized files', () => {
    expect(detectMediaTypeFromFile({ name: 'unknown', type: '' })).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// detectMediaTypeFromUrl
// ---------------------------------------------------------------------------

describe('detectMediaTypeFromUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Extension-based (fast path, no fetch) ---

  it('detects video from .mp4 extension without fetching', async () => {
    const result = await detectMediaTypeFromUrl('https://cdn.example.com/video.mp4');
    expect(result).toBe('video');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('detects video from .webm extension without fetching', async () => {
    const result = await detectMediaTypeFromUrl('https://cdn.example.com/clip.webm');
    expect(result).toBe('video');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('detects video from .mov extension with query params', async () => {
    const result = await detectMediaTypeFromUrl('https://cdn.example.com/clip.mov?sig=abc');
    expect(result).toBe('video');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('detects image from .png extension without fetching', async () => {
    const result = await detectMediaTypeFromUrl('https://cdn.example.com/photo.png');
    expect(result).toBe('image');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('detects image from .exr extension without fetching', async () => {
    const result = await detectMediaTypeFromUrl('https://cdn.example.com/render.exr');
    expect(result).toBe('image');
    expect(fetch).not.toHaveBeenCalled();
  });

  // --- HEAD request (slow path) ---

  it('detects video via HEAD when URL has no extension', async () => {
    vi.mocked(fetch).mockResolvedValue({
      headers: new Headers({ 'content-type': 'video/mp4' }),
    } as Response);

    const result = await detectMediaTypeFromUrl('https://api.example.com/media/12345');
    expect(result).toBe('video');
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/media/12345', {
      method: 'HEAD',
      signal: expect.any(AbortSignal),
    });
  });

  it('detects image via HEAD when URL has no extension', async () => {
    vi.mocked(fetch).mockResolvedValue({
      headers: new Headers({ 'content-type': 'image/jpeg' }),
    } as Response);

    const result = await detectMediaTypeFromUrl('https://api.example.com/media/67890');
    expect(result).toBe('image');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('detects video from content-type with charset parameter', async () => {
    vi.mocked(fetch).mockResolvedValue({
      headers: new Headers({ 'content-type': 'video/webm; codecs="vp9"' }),
    } as Response);

    const result = await detectMediaTypeFromUrl('/stream/latest');
    expect(result).toBe('video');
  });

  it('detects video from application/ogg alias', async () => {
    vi.mocked(fetch).mockResolvedValue({
      headers: new Headers({ 'content-type': 'application/ogg' }),
    } as Response);

    const result = await detectMediaTypeFromUrl('/stream/ogg');
    expect(result).toBe('video');
  });

  it('falls back to image when HEAD request fails (network error)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const result = await detectMediaTypeFromUrl('/media/12345');
    expect(result).toBe('image');
  });

  it('falls back to image when HEAD returns unrecognized content-type', async () => {
    vi.mocked(fetch).mockResolvedValue({
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
    } as Response);

    const result = await detectMediaTypeFromUrl('/media/12345');
    expect(result).toBe('image');
  });

  it('falls back to image when HEAD returns no content-type header', async () => {
    vi.mocked(fetch).mockResolvedValue({
      headers: new Headers(),
    } as Response);

    const result = await detectMediaTypeFromUrl('/media/12345');
    expect(result).toBe('image');
  });

  it('does not fetch for unknown extension that is not a media extension', async () => {
    // .xyz is not a known media extension, so HEAD should be attempted
    vi.mocked(fetch).mockResolvedValue({
      headers: new Headers({ 'content-type': 'video/mp4' }),
    } as Response);

    const result = await detectMediaTypeFromUrl('https://example.com/file.xyz');
    expect(result).toBe('video');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
