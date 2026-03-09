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

  it('returns simple filenames unchanged', () => {
    expect(basename('file.exr')).toBe('file.exr');
  });

  it('returns the original string for empty segments', () => {
    expect(basename('')).toBe('');
  });
});
