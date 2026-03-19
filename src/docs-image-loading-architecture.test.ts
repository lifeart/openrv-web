import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';

/**
 * Regression test for Issue #500:
 * Ensures the file-formats guide accurately describes the two image-loading
 * entry points (loadImageFile → FileSourceNode, loadImage → HTMLImageElement).
 */
describe('Image loading architecture docs (Issue #500)', () => {
  // @ts-ignore -- __dirname available in test environment
  const docsPath = resolve(__dirname, '..', 'docs', 'guides', 'file-formats.md');
  const content = readFileSync(docsPath, 'utf-8');

  it('docs describe loadImageFile routing through FileSourceNode', () => {
    expect(content).toContain('SessionMedia.loadImageFile()');
    expect(content).toContain('FileSourceNode');
    expect(content).toContain('fileSourceNode.loadFile(file)');
  });

  it('docs describe loadImage as the URL/HTMLImageElement path', () => {
    expect(content).toContain('SessionMedia.loadImage(name, url)');
    expect(content).toContain('<img>');
  });

  it('docs do NOT claim browser-native formats bypass FileSourceNode for local files', () => {
    expect(content).not.toContain(
      'handled at the `Session.loadImage()` level using the browser\'s `<img>` element, bypassing the `DecoderRegistry` entirely',
    );
  });

  it('docs explain the two different entry points', () => {
    expect(content).toContain('local files');
    expect(content).toContain('URL');
    expect(content).toContain('even browser-native formats pass through `FileSourceNode`');
  });
});
