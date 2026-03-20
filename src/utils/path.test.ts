import { describe, it, expect } from 'vitest';
import { basename } from './path';

describe('basename', () => {
  it('extracts filename from POSIX paths', () => {
    expect(basename('/foo/bar/file.exr')).toBe('file.exr');
  });

  it('extracts filename from Windows paths', () => {
    expect(basename('C:\\foo\\bar\\file.exr')).toBe('file.exr');
  });

  it('extracts filename from mixed separator paths', () => {
    expect(basename('C:\\foo/bar\\file.exr')).toBe('file.exr');
  });

  it('extracts filename from URLs', () => {
    expect(basename('https://example.com/file.exr')).toBe('file.exr');
  });

  it('strips query strings from URLs', () => {
    expect(basename('https://example.com/media/file.exr?token=abc')).toBe('file.exr');
  });

  it('strips fragment identifiers from URLs', () => {
    expect(basename('https://example.com/media/file.exr#section')).toBe('file.exr');
  });

  it('strips both query string and fragment', () => {
    expect(basename('https://example.com/file.exr?v=1#top')).toBe('file.exr');
  });

  it('returns simple filenames unchanged', () => {
    expect(basename('file.exr')).toBe('file.exr');
  });

  it('handles trailing slashes', () => {
    expect(basename('/foo/bar/')).toBe('bar');
  });

  it('handles trailing backslashes', () => {
    expect(basename('C:\\foo\\bar\\')).toBe('bar');
  });

  it('returns the original string for empty input', () => {
    expect(basename('')).toBe('');
  });

  it('handles Windows full paths like C:\\shots\\plate.exr', () => {
    expect(basename('C:\\shots\\plate.exr')).toBe('plate.exr');
  });

  it('handles deep nested paths', () => {
    expect(basename('/a/b/c/d/e/f.dpx')).toBe('f.dpx');
  });

  it('handles filenames with multiple dots', () => {
    expect(basename('/path/to/file.1001.exr')).toBe('file.1001.exr');
  });
});
