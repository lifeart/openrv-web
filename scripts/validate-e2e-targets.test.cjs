const fs = require('fs');
const path = require('path');
const { describe, it, expect } = require('vitest');

describe('E2E target validation', () => {
  it('all spec files referenced in BUGFIX.md exist on disk', () => {
    const bugfixPath = path.resolve(__dirname, '..', 'BUGFIX.md');
    const content = fs.readFileSync(bugfixPath, 'utf-8');
    const specRefs = [...content.matchAll(/e2e\/[\w-]+\.spec\.ts/g)].map(m => m[0]);
    const unique = [...new Set(specRefs)];

    const missing = unique.filter(ref => {
      const fullPath = path.resolve(__dirname, '..', ref);
      return !fs.existsSync(fullPath);
    });

    expect(missing, `Missing E2E spec files referenced in BUGFIX.md: ${missing.join(', ')}`).toEqual([]);
  });
});
