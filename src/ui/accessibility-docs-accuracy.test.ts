/**
 * Regression tests for Issue #462: Verify documentation claims about
 * accessibility match the actual code reality.
 *
 * These tests ensure the docs/getting-started/ui-overview.md accessibility
 * section accurately reflects the current state of interactive controls.
 */

import { describe, it, expect, beforeEach } from 'vitest';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';

// ---------- helpers ----------

function readDocFile(): string {
  // @ts-ignore -- __dirname available in test environment
  return readFileSync(resolve(__dirname, '../../docs/getting-started/ui-overview.md'), 'utf-8');
}

function readSourceFile(relativePath: string): string {
  // @ts-ignore -- __dirname available in test environment
  return readFileSync(resolve(__dirname, relativePath), 'utf-8');
}

// ---------- 1. PixelProbe value row element types ----------

describe('PixelProbe value row accessibility', () => {
  /** Extract the createValueRow method body for scoped assertions. */
  function getCreateValueRowBody(source: string): string {
    const methodStart = source.indexOf('createValueRow(container');
    expect(methodStart).toBeGreaterThan(-1);
    // Grab a generous slice of the method body (the method is ~60 lines)
    return source.slice(methodStart, methodStart + 1500);
  }

  it('createValueRow produces <div> elements, not <button>', () => {
    const body = getCreateValueRowBody(readSourceFile('components/PixelProbe.ts'));

    const rowMatch = body.match(
      /const row = document\.createElement\(['"](\w+)['"]\)/,
    );
    expect(rowMatch).not.toBeNull();
    expect(rowMatch![1]).toBe('div');
  });

  it('value rows have role="button" ARIA attribute', () => {
    const body = getCreateValueRowBody(readSourceFile('components/PixelProbe.ts'));

    expect(body).toMatch(/row\.setAttribute\(['"]role['"],\s*['"]button['"]\)/);
  });

  it('value rows have tabindex="0" for keyboard focusability', () => {
    const body = getCreateValueRowBody(readSourceFile('components/PixelProbe.ts'));

    expect(body).toMatch(/row\.setAttribute\(['"]tabindex['"],\s*['"]0['"]\)/);
  });

  it('value rows have keyboard event handlers (Enter/Space)', () => {
    const body = getCreateValueRowBody(readSourceFile('components/PixelProbe.ts'));

    // The createValueRow method should bind keydown with Enter and Space handling
    expect(body).toMatch(/row\.addEventListener\(['"]keydown['"]/);
    expect(body).toMatch(/e\.key\s*===\s*['"]Enter['"]/);
    expect(body).toMatch(/e\.key\s*===\s*['"] ['"]/);
  });
});

// ---------- 2. CollapsibleSection (accordion header) accessibility ----------

describe('CollapsibleSection accordion header accessibility', () => {
  it('header is a <div>, not a semantic <button>', () => {
    const source = readSourceFile('layout/panels/CollapsibleSection.ts');

    // The header is created with document.createElement('div')
    const headerMatch = source.match(
      /this\.header\s*=\s*document\.createElement\(['"](\w+)['"]\)/,
    );
    expect(headerMatch).not.toBeNull();
    expect(headerMatch![1]).toBe('div');
  });

  it('header has role="button" and aria-expanded attributes', () => {
    const source = readSourceFile('layout/panels/CollapsibleSection.ts');

    expect(source).toContain("setAttribute('role', 'button')");
    expect(source).toContain("setAttribute('aria-expanded'");
  });

  it('header has tabindex="0" for keyboard focusability', () => {
    const source = readSourceFile('layout/panels/CollapsibleSection.ts');

    expect(source).toContain("setAttribute('tabindex', '0')");
  });

  it('header responds to Enter and Space keyboard events', () => {
    const source = readSourceFile('layout/panels/CollapsibleSection.ts');

    expect(source).toContain("addEventListener('keydown'");
    expect(source).toMatch(/e\.key\s*===\s*['"]Enter['"]/);
    expect(source).toMatch(/e\.key\s*===\s*['"] ['"]/);
  });
});

// ---------- 3. LeftPanelContent history items accessibility ----------

describe('LeftPanelContent history item accessibility', () => {
  it('history items are plain <div> elements without ARIA roles', () => {
    const source = readSourceFile('layout/panels/LeftPanelContent.ts');

    // The renderHistory method creates items with document.createElement('div')
    const renderHistorySection = source.slice(source.indexOf('renderHistory'));
    const itemMatch = renderHistorySection.match(
      /const item = document\.createElement\(['"](\w+)['"]\)/,
    );
    expect(itemMatch).not.toBeNull();
    expect(itemMatch![1]).toBe('div');

    // History items do NOT have ARIA-related attributes
    const itemBlock = renderHistorySection.slice(
      renderHistorySection.indexOf('const item'),
      renderHistorySection.indexOf('this.historyList.appendChild(item)'),
    );
    expect(itemBlock).not.toMatch(/setAttribute\(\s*['"]role['"]/);
    expect(itemBlock).not.toMatch(/setAttribute\(\s*['"]tabindex['"]/);
    expect(itemBlock).not.toMatch(/setAttribute\(\s*['"]aria-/);
    expect(itemBlock).not.toContain('tabindex');
    expect(itemBlock).not.toContain("'role'");
  });

  it('history items only have click handlers, no keyboard handlers', () => {
    const source = readSourceFile('layout/panels/LeftPanelContent.ts');

    const renderHistorySection = source.slice(source.indexOf('renderHistory'));
    const itemBlock = renderHistorySection.slice(
      renderHistorySection.indexOf('const item'),
      renderHistorySection.indexOf('this.historyList.appendChild(item)'),
    );

    expect(itemBlock).toContain("addEventListener('click'");
    expect(itemBlock).not.toContain("addEventListener('keydown'");
  });
});

// ---------- 4. Documentation accuracy ----------

describe('ui-overview.md accessibility section accuracy', () => {
  let doc: string;

  beforeEach(() => {
    doc = readDocFile();
  });

  it('does NOT claim all controls use semantic HTML elements', () => {
    expect(doc).not.toContain(
      'All interactive controls use semantic HTML elements with appropriate ARIA labels and roles',
    );
  });

  it('acknowledges that some controls use <div> with ARIA roles instead of semantic elements', () => {
    expect(doc).toMatch(/<div>.*ARIA roles.*rather than.*semantic.*<button>/s);
  });

  it('references issue #75 for PixelProbe accessibility gap', () => {
    expect(doc).toContain('#75');
  });

  it('references issue #65 for accordion/inspector header accessibility gap', () => {
    expect(doc).toContain('#65');
  });

  it('describes what IS accessible (ARIA announcer, live region)', () => {
    expect(doc).toContain('ARIA announcer');
    expect(doc).toContain('live region');
  });

  it('mentions that many controls have keyboard support', () => {
    expect(doc).toMatch(/keyboard/i);
  });

  it('mentions known gaps honestly without removing content', () => {
    expect(doc).toMatch(/known gap/i);
  });
});
