import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node modules available in test environment
import { readFileSync, existsSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';

/**
 * Regression test for Issue #563:
 * Ensures API docs use relative source links instead of hardcoded GitHub
 * commit URLs, and that all referenced source files actually exist.
 */
describe('API docs source links (Issue #563)', () => {
  // @ts-ignore -- __dirname available in test environment
  const apiDocPath = resolve(__dirname, '..', 'docs', 'api', 'index.md');
  const content = readFileSync(apiDocPath, 'utf-8');

  it('should not contain hardcoded GitHub commit hashes in links', () => {
    const githubBlobPattern =
      /github\.com\/[^/]+\/[^/]+\/blob\/[0-9a-f]{7,40}\//;
    const matches = content.match(
      new RegExp(githubBlobPattern.source, 'g'),
    );
    expect(matches, 'Found hardcoded GitHub blob URLs with commit hashes').toBeNull();
  });

  it('should use relative paths for all "Defined in" links', () => {
    const definedInLinks = [
      ...content.matchAll(/Defined in:\s*\[([^\]]+)\]\(([^)]+)\)/g),
    ];
    expect(definedInLinks.length).toBeGreaterThan(0);

    for (const match of definedInLinks) {
      const linkText = match[1];
      const linkUrl = match[2];
      expect(
        linkUrl,
        `"Defined in" link for "${linkText}" should be a relative path, not an absolute URL`,
      ).not.toMatch(/^https?:\/\//);
      expect(
        linkUrl,
        `"Defined in" link for "${linkText}" should start with a relative path`,
      ).toMatch(/^\.\.\/|^\.\//);
    }
  });

  it('should reference source files that actually exist', () => {
    const definedInLinks = [
      ...content.matchAll(/Defined in:\s*\[([^\]]+)\]\(([^)]+)\)/g),
    ];
    expect(definedInLinks.length).toBeGreaterThan(0);

    // @ts-ignore -- __dirname available in test environment
    const apiDir = resolve(__dirname, '..', 'docs', 'api');

    for (const match of definedInLinks) {
      const linkText = match[1];
      const linkUrl = match[2];
      // Strip the #L<line> anchor if present
      const filePath = linkUrl.replace(/#.*$/, '');
      const absolutePath = resolve(apiDir, filePath);
      expect(
        existsSync(absolutePath),
        `Source file referenced by "${linkText}" does not exist: ${absolutePath}`,
      ).toBe(true);
    }
  });

  it('typedoc config should use relative sourceLinkTemplate', () => {
    // @ts-ignore -- __dirname available in test environment
    const typedocPath = resolve(__dirname, '..', 'typedoc.json');
    const typedocContent = readFileSync(typedocPath, 'utf-8');
    const config = JSON.parse(typedocContent);
    expect(config.sourceLinkTemplate).toBeDefined();
    expect(
      config.sourceLinkTemplate,
      'sourceLinkTemplate should not contain github.com',
    ).not.toMatch(/github\.com/);
    expect(
      config.sourceLinkTemplate,
      'sourceLinkTemplate should use a relative path',
    ).toMatch(/^\.\.\//);
  });
});
