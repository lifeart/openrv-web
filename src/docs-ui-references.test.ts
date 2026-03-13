import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Validates that documentation files do not reference a "View menu" UI element,
 * which does not exist in the shipped application. Features are accessed via
 * the View tab toolbar, header bar buttons, or keyboard shortcuts.
 */
describe('Documentation UI references', () => {
  const docsRoot = resolve(__dirname, '..', 'docs');

  const docFiles = [
    'advanced/review-workflow.md',
    'advanced/playlist.md',
    'guides/stereo-3d-viewing.md',
    'playback/viewer-navigation.md',
    'advanced/stereo-3d.md',
  ];

  for (const file of docFiles) {
    it(`${file} should not reference "View menu"`, () => {
      const content = readFileSync(resolve(docsRoot, file), 'utf-8');
      expect(content).not.toMatch(/\bView menu\b/i);
    });
  }
});
