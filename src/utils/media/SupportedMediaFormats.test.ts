import { describe, it, expect } from 'vitest';
import { detectMediaTypeFromFile, isVideoExtension, SUPPORTED_VIDEO_EXTENSIONS } from './SupportedMediaFormats';

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
      'photo.jp2',
      'photo.j2k',
      'photo.j2c',
      'photo.jph',
      'photo.jhc',
      'photo.cr2',
      'photo.dng',
    ])('%s', (name) => {
      expect(detectMediaTypeFromFile(fakeFile(name))).toBe('image');
    });
  });

  describe('returns "video" for known video extensions', () => {
    it.each(['clip.mp4', 'clip.mov', 'clip.mkv', 'clip.webm', 'clip.ogg', 'clip.avi', 'clip.mxf'])('%s', (name) => {
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

  describe('JPEG 2000 / HTJ2K extensions are classified as image (issue #512)', () => {
    it.each(['scan.jp2', 'scan.j2k', 'scan.j2c', 'scan.jph', 'scan.jhc'])('%s', (name) => {
      expect(detectMediaTypeFromFile(fakeFile(name))).toBe('image');
    });

    it('JPEG 2000 file with no MIME is still classified by extension', () => {
      expect(detectMediaTypeFromFile(fakeFile('plate.jp2', ''))).toBe('image');
    });
  });

  describe('MXF files are classified as video (issue #513)', () => {
    it('clip.mxf is classified as video by extension', () => {
      expect(detectMediaTypeFromFile(fakeFile('clip.mxf'))).toBe('video');
    });

    it('MXF file with no MIME is still classified by extension', () => {
      expect(detectMediaTypeFromFile(fakeFile('rushes.mxf', ''))).toBe('video');
    });

    it('MXF file with video MIME is classified by MIME', () => {
      expect(detectMediaTypeFromFile(fakeFile('rushes.mxf', 'video/mxf'))).toBe('video');
    });
  });

  it('MIME type takes priority over unrecognized extension', () => {
    // A file with .pdf extension but image/png MIME should be classified as image
    expect(detectMediaTypeFromFile(fakeFile('weird.pdf', 'image/png'))).toBe('image');
  });
});

describe('isVideoExtension (single source of truth — issues #522/#523)', () => {
  it('SMF-V001: returns true for all SUPPORTED_VIDEO_EXTENSIONS', () => {
    for (const ext of SUPPORTED_VIDEO_EXTENSIONS) {
      expect(isVideoExtension(ext)).toBe(true);
    }
  });

  it('SMF-V002: returns true for common video extensions', () => {
    for (const ext of ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mxf', 'ogv', 'm4v', '3gp']) {
      expect(isVideoExtension(ext)).toBe(true);
    }
  });

  it('SMF-V003: returns false for image extensions', () => {
    for (const ext of ['png', 'jpg', 'exr', 'dpx', 'tiff', 'avif']) {
      expect(isVideoExtension(ext)).toBe(false);
    }
  });

  it('SMF-V004: returns false for non-media extensions', () => {
    for (const ext of ['pdf', 'txt', 'zip', 'js', 'html']) {
      expect(isVideoExtension(ext)).toBe(false);
    }
  });

  it('SMF-V005: returns false for empty string', () => {
    expect(isVideoExtension('')).toBe(false);
  });

  it('SMF-V006: is case-sensitive (expects lowercase input)', () => {
    expect(isVideoExtension('MP4')).toBe(false);
    expect(isVideoExtension('mp4')).toBe(true);
  });
});
