import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUrlAsFile } from './fetchUrlAsFile';

describe('fetchUrlAsFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a File with the correct name and content', async () => {
    const body = new Uint8Array([0x76, 0x2f, 0x31, 0x01]);
    const blob = new Blob([body], { type: 'application/octet-stream' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob),
    } as unknown as Response);

    const file = await fetchUrlAsFile('https://cdn.example.com/render.exr', 'render.exr');

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('render.exr');
    expect(file.size).toBe(4);
  });

  it('preserves the MIME type from the response', async () => {
    const blob = new Blob([new ArrayBuffer(2)], { type: 'image/x-exr' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob),
    } as unknown as Response);

    const file = await fetchUrlAsFile('https://cdn.example.com/render.exr', 'render.exr');
    expect(file.type).toBe('image/x-exr');
  });

  it('throws on non-OK HTTP responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as unknown as Response);

    await expect(fetchUrlAsFile('https://cdn.example.com/missing.exr', 'missing.exr')).rejects.toThrow(
      'Failed to fetch URL (404)',
    );
  });

  it('throws on network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(fetchUrlAsFile('https://cdn.example.com/render.exr', 'render.exr')).rejects.toThrow('fetch failed');
  });
});
