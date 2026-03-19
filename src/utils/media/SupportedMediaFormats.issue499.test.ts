/**
 * Issue #499 regression tests:
 * GIF and animated WebP are classified as image formats (not video),
 * and the documentation accurately reflects single-frame behavior.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';
import {
  detectMediaTypeFromFile,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
  isVideoExtension,
} from './SupportedMediaFormats';

// ---------------------------------------------------------------------------
// SupportedMediaFormats: GIF and WebP are image, not video
// ---------------------------------------------------------------------------

describe('Issue #499 – GIF and WebP classified as image formats', () => {
  it('.gif is in SUPPORTED_IMAGE_EXTENSIONS', () => {
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('gif');
  });

  it('.webp is in SUPPORTED_IMAGE_EXTENSIONS', () => {
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('webp');
  });

  it('.gif is NOT in SUPPORTED_VIDEO_EXTENSIONS', () => {
    expect(SUPPORTED_VIDEO_EXTENSIONS).not.toContain('gif');
  });

  it('.webp is NOT in SUPPORTED_VIDEO_EXTENSIONS', () => {
    expect(SUPPORTED_VIDEO_EXTENSIONS).not.toContain('webp');
  });

  it('isVideoExtension returns false for gif', () => {
    expect(isVideoExtension('gif')).toBe(false);
  });

  it('isVideoExtension returns false for webp', () => {
    expect(isVideoExtension('webp')).toBe(false);
  });

  it('detectMediaTypeFromFile classifies .gif file as image', () => {
    expect(detectMediaTypeFromFile({ name: 'animation.gif', type: '' })).toBe('image');
  });

  it('detectMediaTypeFromFile classifies .webp file as image', () => {
    expect(detectMediaTypeFromFile({ name: 'animation.webp', type: '' })).toBe('image');
  });

  it('detectMediaTypeFromFile classifies image/gif MIME as image', () => {
    expect(detectMediaTypeFromFile({ name: 'file', type: 'image/gif' })).toBe('image');
  });

  it('detectMediaTypeFromFile classifies image/webp MIME as image', () => {
    expect(detectMediaTypeFromFile({ name: 'file', type: 'image/webp' })).toBe('image');
  });
});

// ---------------------------------------------------------------------------
// Documentation accuracy: docs must not claim animated playback for GIF/WebP
// ---------------------------------------------------------------------------

describe('Issue #499 – documentation reflects single-frame behavior', () => {
  // @ts-ignore -- __dirname available in test environment
  const docsRoot = resolve(__dirname, '../../../docs');
  const referenceDoc = readFileSync(
    resolve(docsRoot, 'reference/file-formats.md'),
    'utf-8',
  );
  const guideDoc = readFileSync(
    resolve(docsRoot, 'guides/file-formats.md'),
    'utf-8',
  );

  it('reference doc GIF entry does not claim "Animated GIF support" without qualification', () => {
    // The old text was: "Animated GIF support"
    // The fix should remove or qualify that claim.
    const gifLine = referenceDoc
      .split('\n')
      .find((line: string) => line.includes('`.gif`') || line.includes('.gif'));
    expect(gifLine).toBeDefined();
    // Must NOT contain "Animated GIF support" as a standalone claim
    expect(gifLine).not.toMatch(/Animated GIF support(?! is not| not supported)/i);
    // Must indicate single-frame / no animated playback
    expect(gifLine).toMatch(/single-frame|not supported|still/i);
  });

  it('reference doc WebP entry indicates single-frame behavior', () => {
    const webpLine = referenceDoc
      .split('\n')
      .find((line: string) => line.includes('`.webp`') || (line.includes('WebP') && line.includes('|')));
    expect(webpLine).toBeDefined();
    expect(webpLine).toMatch(/single-frame|not supported|still/i);
  });

  it('guide doc GIF entry does not claim unqualified animation support', () => {
    const gifLine = guideDoc
      .split('\n')
      .find((line: string) => line.includes('.gif') && line.includes('|'));
    expect(gifLine).toBeDefined();
    // Should not just say "animation" without qualifying it as unsupported
    expect(gifLine).toMatch(/single-frame|not supported|still/i);
  });

  it('guide doc WebP entry does not claim unqualified animation support', () => {
    const webpLine = guideDoc
      .split('\n')
      .find((line: string) => line.includes('.webp') && line.includes('|'));
    expect(webpLine).toBeDefined();
    expect(webpLine).toMatch(/single-frame|not supported|still/i);
  });
});
