import { describe, it, expect } from 'vitest';
import {
  describeErrorCause,
  describeMediaElementError,
  imageLoadFailedMessage,
  scrubOpaqueUrls,
  videoLoadFailedMessage,
} from './mediaLoadErrorMessages';

describe('mediaLoadErrorMessages', () => {
  it('MLE-001: scrubs blob: URLs and replaces them with the file name', () => {
    expect(scrubOpaqueUrls('Failed to load image: blob:http://localhost:5173/6f1c-uuid', 'a.png')).toBe(
      'Failed to load image: "a.png"',
    );
    expect(scrubOpaqueUrls('bad data:image/png;base64,AAAA here')).toBe('bad the file here');
  });

  it('MLE-002: does not mangle ordinary text that mentions data', () => {
    expect(scrubOpaqueUrls('Invalid data: header too short')).toBe('Invalid data: header too short');
    expect(scrubOpaqueUrls('metadata:missing')).toBe('metadata:missing');
  });

  it('MLE-003: describeErrorCause handles Error, string and unknown values', () => {
    expect(describeErrorCause(new Error('Unsupported EXR compression: B44'))).toBe('Unsupported EXR compression: B44');
    expect(describeErrorCause('oops')).toBe('oops');
    expect(describeErrorCause({ weird: true })).toBe('');
    expect(describeErrorCause(undefined)).toBe('');
  });

  it('MLE-004: image message names the file and gives the reason, never the blob URL', () => {
    const msg = imageLoadFailedMessage('shot_010.exr', new Error('Failed to load image: blob:http://x/1234'));
    expect(msg).toContain('"shot_010.exr"');
    expect(msg).toContain('not supported');
    expect(msg).toContain('corrupt');
    expect(msg).not.toContain('blob:');
  });

  it('MLE-005: image message without a decoder cause keeps the base reason only', () => {
    expect(imageLoadFailedMessage('a.png')).toBe(
      'Failed to load image "a.png": the image format is not supported by this browser or the file is corrupt',
    );
  });

  it('MLE-006: maps MediaError codes to readable reasons', () => {
    expect(describeMediaElementError({ code: 1 })).toMatch(/aborted/);
    expect(describeMediaElementError({ code: 2 })).toMatch(/network/);
    expect(describeMediaElementError({ code: 3 })).toMatch(/decoded/);
    expect(describeMediaElementError({ code: 4 })).toMatch(/not supported/);
    expect(describeMediaElementError(null)).toMatch(/could not be decoded/);
  });

  it('MLE-007: video message names the file', () => {
    const msg = videoLoadFailedMessage('clip.mov', { code: 4 });
    expect(msg).toBe('Failed to load video "clip.mov": the video format or codec is not supported by this browser');
  });
});
