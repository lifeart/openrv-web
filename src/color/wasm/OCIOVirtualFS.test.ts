/**
 * OCIOVirtualFS Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OCIOVirtualFS } from './OCIOVirtualFS';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeData(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OCIOVirtualFS', () => {
  let vfs: OCIOVirtualFS;

  beforeEach(() => {
    vfs = new OCIOVirtualFS();
  });

  describe('file operations', () => {
    it('VFS-001: writeFile and readFile round-trip', () => {
      const data = makeData('hello');
      vfs.writeFile('luts/test.spi3d', data);
      const result = vfs.readFile('luts/test.spi3d');
      expect(result).toEqual(data);
    });

    it('VFS-002: readFile returns null for missing files', () => {
      expect(vfs.readFile('nonexistent.cube')).toBeNull();
    });

    it('VFS-003: hasFile returns true for existing files', () => {
      vfs.writeFile('a.cube', makeData('x'));
      expect(vfs.hasFile('a.cube')).toBe(true);
      expect(vfs.hasFile('b.cube')).toBe(false);
    });

    it('VFS-004: removeFile deletes a file', () => {
      vfs.writeFile('a.cube', makeData('x'));
      expect(vfs.removeFile('a.cube')).toBe(true);
      expect(vfs.hasFile('a.cube')).toBe(false);
    });

    it('VFS-005: removeFile returns false for missing files', () => {
      expect(vfs.removeFile('missing')).toBe(false);
    });

    it('VFS-006: listFiles returns all entries', () => {
      vfs.writeFile('a.cube', makeData('1'));
      vfs.writeFile('b.spi3d', makeData('22'));
      const files = vfs.listFiles();
      expect(files).toHaveLength(2);
      expect(files.map(f => f.path).sort()).toEqual(['a.cube', 'b.spi3d']);
    });

    it('VFS-007: getTotalSize sums bytes', () => {
      vfs.writeFile('a', makeData('abc'));   // 3 bytes
      vfs.writeFile('b', makeData('defgh')); // 5 bytes
      expect(vfs.getTotalSize()).toBe(8);
    });

    it('VFS-008: clear removes all files', () => {
      vfs.writeFile('a', makeData('x'));
      vfs.writeFile('b', makeData('y'));
      vfs.clear();
      expect(vfs.listFiles()).toHaveLength(0);
      expect(vfs.getTotalSize()).toBe(0);
    });

    it('VFS-009: writeFile overwrites existing file', () => {
      vfs.writeFile('a', makeData('old'));
      vfs.writeFile('a', makeData('new'));
      expect(vfs.listFiles()).toHaveLength(1);
      expect(new TextDecoder().decode(vfs.readFile('a')!)).toBe('new');
    });
  });

  describe('path normalisation', () => {
    it('VFS-PATH-001: normalises backslashes', () => {
      vfs.writeFile('luts\\sub\\test.cube', makeData('x'));
      expect(vfs.hasFile('luts/sub/test.cube')).toBe(true);
    });

    it('VFS-PATH-002: strips leading slash', () => {
      vfs.writeFile('/luts/test.cube', makeData('x'));
      expect(vfs.hasFile('luts/test.cube')).toBe(true);
    });

    it('VFS-PATH-003: collapses redundant slashes', () => {
      vfs.writeFile('luts///test.cube', makeData('x'));
      expect(vfs.hasFile('luts/test.cube')).toBe(true);
    });

    it('VFS-PATH-004: resolves ../ segments', () => {
      vfs.writeFile('luts/aces/../shared/file.cube', makeData('x'));
      expect(vfs.hasFile('luts/shared/file.cube')).toBe(true);
    });

    it('VFS-PATH-005: resolves ./ segments', () => {
      vfs.writeFile('luts/./test.cube', makeData('x'));
      expect(vfs.hasFile('luts/test.cube')).toBe(true);
    });

    it('VFS-PATH-006: ../ beyond root does not crash', () => {
      vfs.writeFile('../../test.cube', makeData('x'));
      expect(vfs.hasFile('test.cube')).toBe(true);
    });

    it('VFS-PATH-007: complex mixed path normalisation', () => {
      vfs.writeFile('luts/aces/../shared/./inner/../file.cube', makeData('x'));
      expect(vfs.hasFile('luts/shared/file.cube')).toBe(true);
    });
  });

  describe('loadFromURL', () => {
    it('VFS-URL-001: fetches and stores file', async () => {
      const data = makeData('LUT data');
      const bufferCopy = data.buffer.slice(0);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(bufferCopy),
      });

      await vfs.loadFromURL('luts/test.cube', 'https://example.com/test.cube', {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(vfs.hasFile('luts/test.cube')).toBe(true);
      const stored = vfs.readFile('luts/test.cube')!;
      expect(new TextDecoder().decode(stored)).toBe('LUT data');
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/test.cube', { signal: undefined });
    });

    it('VFS-URL-002: throws on fetch failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        vfs.loadFromURL('luts/test.cube', 'https://example.com/missing.cube', {
          fetchFn: mockFetch as unknown as typeof fetch,
        })
      ).rejects.toThrow('Failed to load');
    });
  });

  describe('loadFromFile', () => {
    it('VFS-FILE-001: loads from Blob', async () => {
      const content = 'LUT file content';
      const blob = new Blob([content]);
      await vfs.loadFromFile('luts/uploaded.cube', blob);

      expect(vfs.hasFile('luts/uploaded.cube')).toBe(true);
      const stored = vfs.readFile('luts/uploaded.cube');
      expect(new TextDecoder().decode(stored!)).toBe(content);
    });
  });

  describe('preloadBatch', () => {
    it('VFS-BATCH-001: loads multiple files', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(makeData(`data-for-${url}`).buffer),
        });
      });

      const result = await vfs.preloadBatch(
        [
          { virtualPath: 'a.cube', url: 'https://cdn.example.com/a.cube' },
          { virtualPath: 'b.spi3d', url: 'https://cdn.example.com/b.spi3d' },
        ],
        { fetchFn: mockFetch as unknown as typeof fetch },
      );

      expect(result.loaded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(vfs.hasFile('a.cube')).toBe(true);
      expect(vfs.hasFile('b.spi3d')).toBe(true);
    });

    it('VFS-BATCH-002: continues on individual failure', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 500, statusText: 'Error' });
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(makeData('ok').buffer),
        });
      });

      const result = await vfs.preloadBatch(
        [
          { virtualPath: 'fail.cube', url: 'https://cdn.example.com/fail.cube' },
          { virtualPath: 'ok.cube', url: 'https://cdn.example.com/ok.cube' },
        ],
        { fetchFn: mockFetch as unknown as typeof fetch },
      );

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.path).toBe('fail.cube');
      // ok.cube might be loaded (concurrent), but at least one succeeded
      expect(result.loaded.length + result.failed.length).toBe(2);
    });

    it('VFS-BATCH-003: resolves URLs with baseUrl', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(makeData('x').buffer),
      });

      await vfs.preloadBatch(
        [{ virtualPath: 'lut.cube', url: 'lut.cube' }],
        { baseUrl: 'https://cdn.example.com/luts', fetchFn: mockFetch as unknown as typeof fetch },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://cdn.example.com/luts/lut.cube',
        expect.anything(),
      );
    });
  });

  describe('config file parsing', () => {
    it('VFS-PARSE-001: extractFileReferences finds src paths', () => {
      const yaml = `
colorspaces:
  - !<ColorSpace>
    name: sRGB
    to_reference: !<FileTransform> {src: luts/srgb_to_linear.spi3d}
  - !<ColorSpace>
    name: ACEScg
    from_reference: !<GroupTransform>
      children:
        - !<FileTransform> {src: luts/acescg.cube, interpolation: linear}
`;
      const refs = vfs.extractFileReferences(yaml);
      expect(refs).toContain('luts/srgb_to_linear.spi3d');
      expect(refs).toContain('luts/acescg.cube');
    });

    it('VFS-PARSE-002: extractFileReferences handles src: on own line', () => {
      const yaml = `
    to_reference: !<FileTransform>
      src: luts/test.spi1d
      interpolation: linear
`;
      const refs = vfs.extractFileReferences(yaml);
      expect(refs).toContain('luts/test.spi1d');
    });

    it('VFS-PARSE-003: extractSearchPaths finds colon-separated paths', () => {
      const yaml = `ocio_profile_version: 2
search_path: luts:luts/aces:shared
colorspaces:
  - !<ColorSpace>
    name: sRGB
`;
      const paths = vfs.extractSearchPaths(yaml);
      expect(paths).toEqual(['luts', 'luts/aces', 'shared']);
    });

    it('VFS-PARSE-004: extractSearchPaths returns empty for missing', () => {
      const yaml = `ocio_profile_version: 2\ncolorspaces:\n`;
      expect(vfs.extractSearchPaths(yaml)).toEqual([]);
    });

    it('VFS-PARSE-006: extractSearchPaths handles YAML list form', () => {
      const yaml = `ocio_profile_version: 2
search_path:
  - luts
  - luts/aces
  - shared
colorspaces:
  - !<ColorSpace>
    name: sRGB
`;
      const paths = vfs.extractSearchPaths(yaml);
      expect(paths).toEqual(['luts', 'luts/aces', 'shared']);
    });

    it('VFS-PARSE-005: extractFileReferences skips absolute paths', () => {
      const yaml = `
  to_reference: !<FileTransform> {src: /absolute/path/lut.spi3d}
`;
      const refs = vfs.extractFileReferences(yaml);
      expect(refs).toHaveLength(0);
    });
  });

  describe('dispose', () => {
    it('VFS-DISP-001: writeFile throws after dispose', () => {
      vfs.writeFile('a', makeData('x'));
      vfs.dispose();
      expect(() => vfs.writeFile('b', makeData('y'))).toThrow('disposed');
    });

    it('VFS-DISP-002: loadFromURL throws after dispose', async () => {
      vfs.dispose();
      await expect(
        vfs.loadFromURL('x', 'https://example.com/x')
      ).rejects.toThrow('disposed');
    });

    it('VFS-DISP-003: readFile throws after dispose', () => {
      vfs.writeFile('a', makeData('x'));
      vfs.dispose();
      expect(() => vfs.readFile('a')).toThrow('disposed');
    });

    it('VFS-DISP-004: hasFile throws after dispose', () => {
      vfs.dispose();
      expect(() => vfs.hasFile('a')).toThrow('disposed');
    });

    it('VFS-DISP-005: listFiles throws after dispose', () => {
      vfs.dispose();
      expect(() => vfs.listFiles()).toThrow('disposed');
    });

    it('VFS-DISP-006: removeFile throws after dispose', () => {
      vfs.writeFile('a', makeData('x'));
      vfs.dispose();
      expect(() => vfs.removeFile('a')).toThrow('disposed');
    });

    it('VFS-DISP-007: getTotalSize throws after dispose', () => {
      vfs.dispose();
      expect(() => vfs.getTotalSize()).toThrow('disposed');
    });

    it('VFS-DISP-008: clear throws after dispose', () => {
      vfs.dispose();
      expect(() => vfs.clear()).toThrow('disposed');
    });
  });
});
