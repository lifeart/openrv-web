import { describe, it, expect } from 'vitest';
import { detectMediaTypeFromFile } from './SupportedMediaFormats';

describe('detectMediaTypeFromFile', () => {
  // Helper to create a minimal file-like object
  function fakeFile(name: string, type = ''): Pick<File, 'name' | 'type'> {
    return { name, type };
  }

  describe('returns "image" for known image extensions', () => {
    it.each([
      'photo.png',
      'photo.jpg',
      'photo.jpeg',
      'photo.webp',
      'photo.gif',
      'photo.bmp',
      'photo.tif',
      'photo.tiff',
      'photo.exr',
      'photo.dpx',
      'photo.cin',
      'photo.hdr',
      'photo.avif',
      'photo.jxl',
      'photo.heic',
      'photo.heif',
      'photo.cr2',
      'photo.dng',
    ])('%s', (name) => {
      expect(detectMediaTypeFromFile(fakeFile(name))).toBe('image');
    });
  });

  describe('returns "video" for known video extensions', () => {
    it.each(['clip.mp4', 'clip.mov', 'clip.mkv', 'clip.webm', 'clip.ogg', 'clip.avi'])('%s', (name) => {
      expect(detectMediaTypeFromFile(fakeFile(name))).toBe('video');
    });
  });

  describe('returns "image" for image MIME types', () => {
    it('image/png MIME', () => {
      expect(detectMediaTypeFromFile(fakeFile('unknown', 'image/png'))).toBe('image');
    });

    it('image/jpeg MIME', () => {
      expect(detectMediaTypeFromFile(fakeFile('unknown', 'image/jpeg'))).toBe('image');
    });
  });

  describe('returns "video" for video MIME types', () => {
    it('video/mp4 MIME', () => {
      expect(detectMediaTypeFromFile(fakeFile('unknown', 'video/mp4'))).toBe('video');
    });

    it('application/ogg MIME alias', () => {
      expect(detectMediaTypeFromFile(fakeFile('unknown', 'application/ogg'))).toBe('video');
    });
  });

  describe('returns "unknown" for unrecognized extensions', () => {
    it.each(['document.pdf', 'document.docx', 'readme.txt', 'data.csv', 'archive.zip', 'script.js', 'style.css'])(
      '%s',
      (name) => {
        expect(detectMediaTypeFromFile(fakeFile(name))).toBe('unknown');
      },
    );
  });

  it('returns "unknown" for files with no extension', () => {
    expect(detectMediaTypeFromFile(fakeFile('Makefile'))).toBe('unknown');
  });

  it('returns "unknown" for files with empty MIME and unrecognized extension', () => {
    expect(detectMediaTypeFromFile(fakeFile('report.xlsx', ''))).toBe('unknown');
  });

  it('MIME type takes priority over unrecognized extension', () => {
    // A file with .pdf extension but image/png MIME should be classified as image
    expect(detectMediaTypeFromFile(fakeFile('weird.pdf', 'image/png'))).toBe('image');
  });
});
