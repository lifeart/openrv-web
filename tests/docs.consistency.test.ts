/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Documentation consistency tests.
 *
 * These tests verify that documentation stays in sync with the source code.
 * They extract facts from source files and validate that docs reflect them
 * accurately. Run as part of the normal test suite to catch drift at CI time.
 *
 * Note: Uses dynamic require() for Node.js built-ins to avoid TypeScript errors
 * in a browser-targeted tsconfig that lacks @types/node.
 */

import { describe, test, expect } from 'vitest';

// Dynamic imports to avoid TS2307 "Cannot find module 'fs'" in browser tsconfig
const fs: typeof import('fs') = (await import('fs' as any)).default ?? (await import('fs' as any));
const path: typeof import('path') = (await import('path' as any)).default ?? (await import('path' as any));
const url: typeof import('url') = (await import('url' as any)).default ?? (await import('url' as any));

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ---------------------------------------------------------------------------
// Extract source-of-truth values
// ---------------------------------------------------------------------------

function getEventNames(): string[] {
  const source = readFile('src/api/EventsAPI.ts');
  const match = source.match(
    /export type OpenRVEventName\s*=\s*([\s\S]*?);/,
  );
  if (!match?.[1]) return [];
  const results: string[] = [];
  for (const m of match[1].matchAll(/'([^']+)'/g)) {
    if (m[1]) results.push(m[1]);
  }
  return results;
}

function getAPIClassFiles(): string[] {
  const dir = path.join(ROOT, 'src/api');
  return (fs.readdirSync(dir) as string[]).filter(
    (f: string) => f.endsWith('API.ts') && !f.endsWith('.test.ts'),
  );
}

function getAPIClassNames(): string[] {
  return getAPIClassFiles().map((f: string) => f.replace('.ts', ''));
}

function getRegisteredNodes(): string[] {
  const srcDir = path.join(ROOT, 'src/nodes');
  const results: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        const content = fs.readFileSync(path.join(dir, entry.name), 'utf8');
        for (const m of content.matchAll(/@RegisterNode\('([^']+)'\)/g)) {
          if (m[1]) results.push(m[1]);
        }
      }
    }
  }
  walk(srcDir);
  return results;
}

function getBuiltinFormats(): string[] {
  const source = readFile('src/formats/DecoderRegistry.ts');
  const match = source.match(
    /export type BuiltinFormatName\s*=\s*([\s\S]*?);/,
  );
  if (!match?.[1]) return [];
  const results: string[] = [];
  for (const m of match[1].matchAll(/'([^']+)'/g)) {
    if (m[1]) results.push(m[1]);
  }
  return results;
}

function getLUT3DUniformNames(): string[] {
  const shader = readFile('src/render/shaders/viewer.frag.glsl');
  const results: string[] = [];
  for (const m of shader.matchAll(/uniform sampler3D (u_\w+LUT3D)\b/g)) {
    if (m[1]) results.push(m[1]);
  }
  return results;
}

function getScreenshotRefsInDocs(): string[] {
  const docsDir = path.join(ROOT, 'docs');
  const refs: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '.vitepress' && entry.name !== 'node_modules') {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        const content = fs.readFileSync(full, 'utf8');
        for (const m of content.matchAll(/\/assets\/screenshots\/([^)\s"]+\.png)/g)) {
          if (m[1]) refs.push(m[1]);
        }
      }
    }
  }
  walk(docsDir);
  return [...new Set(refs)];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Documentation consistency', () => {
  // -- Events ---------------------------------------------------------------

  test('event reference doc lists all OpenRVEventName members', () => {
    const eventNames = getEventNames();
    expect(eventNames.length).toBeGreaterThanOrEqual(13);

    const apiIndex = readFile('docs/api/index.md');
    for (const name of eventNames) {
      expect(apiIndex).toContain(name);
    }
  });

  // -- API classes ----------------------------------------------------------

  test('API docs list all API classes', () => {
    const classNames = getAPIClassNames();
    expect(classNames.length).toBe(10);

    const apiIndex = readFile('docs/api/index.md');
    for (const name of classNames) {
      expect(apiIndex).toContain(name);
    }
  });

  // -- LUT slots ------------------------------------------------------------

  test('shader has 3 LUT3D slots', () => {
    const lutNames = getLUT3DUniformNames();
    expect(lutNames).toContain('u_fileLUT3D');
    expect(lutNames).toContain('u_lookLUT3D');
    expect(lutNames).toContain('u_displayLUT3D');
    expect(lutNames.length).toBe(3);
  });

  test('LUT docs do not claim single LUT slot', () => {
    const lutDoc = readFile('docs/guides/lut-system.md');
    expect(lutDoc.toLowerCase()).not.toMatch(/single lut slot/);
    expect(lutDoc.toLowerCase()).not.toMatch(/only one lut/);
  });

  // -- GPU interpolation ----------------------------------------------------

  test('docs do not claim tetrahedral interpolation on GPU', () => {
    const filesToCheck = [
      'docs/guides/lut-system.md',
      'docs/color/lut.md',
      'docs/reference/file-formats.md',
      'README.md',
    ];

    for (const file of filesToCheck) {
      if (!fileExists(file)) continue;
      const content = readFile(file);
      expect(content).not.toMatch(
        /tetrahedral\s+interpolation\s+(in|on|for)\s+(the\s+)?GPU/i,
      );
      expect(content).not.toMatch(
        /GPU\s+(uses?|performs?)\s+tetrahedral/i,
      );
    }
  });

  test('LUT docs mention trilinear for GPU path', () => {
    const lutDoc = readFile('docs/guides/lut-system.md');
    expect(lutDoc.toLowerCase()).toContain('trilinear');
  });

  // -- Screenshots ----------------------------------------------------------

  test('all screenshot references in docs point to existing files', () => {
    const refs = getScreenshotRefsInDocs();
    expect(refs.length).toBeGreaterThan(0);

    const screenshotDirs = [
      'docs/public/assets/screenshots',
      'docs/assets/screenshots',
    ];

    for (const ref of refs) {
      const exists = screenshotDirs.some((dir) => fileExists(path.join(dir, ref)));
      expect(exists, `Screenshot not found: ${ref}`).toBe(true);
    }
  });

  // -- Registered nodes vs doc catalog --------------------------------------

  test('all @RegisterNode types exist in source', () => {
    const nodes = getRegisteredNodes();
    expect(nodes.length).toBeGreaterThanOrEqual(20);
  });

  // -- Builtin formats ------------------------------------------------------

  test('builtin format count is accurate', () => {
    const formats = getBuiltinFormats();
    expect(formats.length).toBeGreaterThanOrEqual(12);
  });

  // -- README cross-checks --------------------------------------------------

  test('README LUT interpolation claim is accurate', () => {
    const readme = readFile('README.md');
    expect(readme).toMatch(/trilinear/i);
    const lines = readme.split('\n');
    for (const line of lines) {
      expect(line).not.toMatch(
        /tetrahedral\s+interpolation\s+(in|on|for)\s+(the\s+)?GPU/i,
      );
      expect(line).not.toMatch(
        /GPU\s+(uses?|performs?)\s+tetrahedral/i,
      );
    }
  });

  test('README API class count matches source', () => {
    const readme = readFile('README.md');
    const classCount = getAPIClassNames().length;
    expect(readme).toContain(`${classCount} public API classes`);
  });

  test('README documentation link exists', () => {
    const readme = readFile('README.md');
    expect(readme).toMatch(/\[Documentation\]/);
  });

  // -- Doc page existence ---------------------------------------------------

  test('key doc pages exist', () => {
    const requiredPages = [
      'docs/getting-started/quick-start.md',
      'docs/getting-started/ui-overview.md',
      'docs/color/primary-controls.md',
      'docs/color/lut.md',
      'docs/color/cdl.md',
      'docs/color/curves.md',
      'docs/color/tone-mapping.md',
      'docs/scopes/histogram.md',
      'docs/scopes/waveform.md',
      'docs/scopes/vectorscope.md',
      'docs/compare/wipe-mode.md',
      'docs/compare/split-screen.md',
      'docs/annotations/pen-eraser.md',
      'docs/playback/timeline-controls.md',
      'docs/playback/channel-isolation.md',
      'docs/guides/rendering-pipeline.md',
      'docs/guides/lut-system.md',
      'docs/guides/node-graph-architecture.md',
      'docs/api/index.md',
    ];

    for (const page of requiredPages) {
      expect(fileExists(page), `Missing doc page: ${page}`).toBe(true);
    }
  });

  // -- Keyboard shortcut accuracy (H/W hidden defaults) ---------------------

  test('docs do not advertise H as histogram shortcut', () => {
    const filesToCheck = [
      'docs/reference/keyboard-shortcuts.md',
      'docs/getting-started/ui-overview.md',
      'docs/scopes/histogram.md',
    ];

    for (const file of filesToCheck) {
      if (!fileExists(file)) continue;
      const content = readFile(file);
      // Should not claim `H` toggles the histogram (H is fit-to-height)
      expect(content).not.toMatch(/\| `H` \| .*[Hh]istogram/);
      expect(content).not.toMatch(/Press `H` to toggle the histogram/);
    }
  });

  test('docs do not advertise W as waveform shortcut', () => {
    const filesToCheck = [
      'docs/reference/keyboard-shortcuts.md',
      'docs/getting-started/ui-overview.md',
      'docs/scopes/waveform.md',
    ];

    for (const file of filesToCheck) {
      if (!fileExists(file)) continue;
      const content = readFile(file);
      // Should not claim `W` toggles the waveform (W is fit-to-width)
      expect(content).not.toMatch(/\| `W` \| .*[Ww]aveform/);
      expect(content).not.toMatch(/Press `W` to toggle the waveform/);
    }
  });

  test('keyboard shortcuts doc lists H for fit-to-height and W for fit-to-width', () => {
    const shortcutsDoc = readFile('docs/reference/keyboard-shortcuts.md');
    expect(shortcutsDoc).toMatch(/\| `H` \| Fit image height to window \|/);
    expect(shortcutsDoc).toMatch(/\| `W` \| Fit image width to window \|/);
  });

  test('scope shortcuts are context-aware in AppKeyboardHandler and documented correctly', () => {
    const source = readFile('src/AppKeyboardHandler.ts');
    // Verify that panel.histogram and panel.waveform are in CONTEXTUAL_DEFAULTS (context-aware dispatch)
    expect(source).toMatch(/CONTEXTUAL_DEFAULTS.*=.*new Set\(\[[\s\S]*?'panel\.waveform'/);
    expect(source).toMatch(/CONTEXTUAL_DEFAULTS.*=.*new Set\(\[[\s\S]*?'panel\.histogram'/);

    // Verify the docs mention that histogram/waveform have no default shortcut
    const shortcutsDoc = readFile('docs/reference/keyboard-shortcuts.md');
    expect(shortcutsDoc).toContain('Histogram and waveform scopes do not have default keyboard shortcuts');
  });
});
