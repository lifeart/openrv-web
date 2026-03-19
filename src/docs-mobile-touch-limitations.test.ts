import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';

/**
 * Regression test for Issue #497:
 * Ensures the browser-compatibility docs accurately reflect mobile touch
 * interaction limitations (no "touch-optimized" claim, known limitations
 * documented).
 */
describe('Issue #497: browser-compatibility docs reflect touch limitations', () => {
  // @ts-ignore -- __dirname available in test environment
  const docsPath = resolve(__dirname, '..', 'docs', 'reference', 'browser-compatibility.md');
  const content = readFileSync(docsPath, 'utf-8');

  it('does NOT claim mobile support is "touch-optimized"', () => {
    expect(content).not.toContain('touch-optimized');
  });

  it('describes mobile support status as having limitations', () => {
    // Each mobile row should mention limitations or desktop-optimized
    expect(content).toContain('Functional with limitations');
  });

  it('documents the hover-dependent volume control limitation', () => {
    expect(content).toContain('Volume control');
    expect(content).toContain('pointerenter');
    expect(content).toContain('pointerleave');
  });

  it('references issue #116 for the volume control gap', () => {
    expect(content).toContain('#116');
  });

  it('documents virtual slider touch exclusion', () => {
    expect(content).toContain('Virtual slider');
    expect(content).toContain('touch');
  });

  it('lists mobile touch limitations in Known Issues table', () => {
    expect(content).toContain('Volume slider inaccessible without hover');
    expect(content).toContain('Virtual slider color controls unavailable');
  });

  it('describes the interface as desktop-optimized', () => {
    expect(content).toContain('desktop-optimized');
  });
});
