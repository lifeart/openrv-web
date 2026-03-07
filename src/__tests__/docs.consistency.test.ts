/**
 * Documentation consistency tests.
 *
 * These tests verify that documentation stays in sync with the source code.
 * They extract facts from source files and validate that docs reflect them
 * accurately. Run as part of the normal test suite to catch drift at CI time.
 */

import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

function listFiles(relPath: string): string[] {
  const dir = path.join(ROOT, relPath);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

// ---------------------------------------------------------------------------
// Extract source-of-truth values
// ---------------------------------------------------------------------------

function getEventNames(): string[] {
  const source = readFile('src/api/EventsAPI.ts');
  const match = source.match(
    /export type OpenRVEventName\s*=\s*([\s\S]*?);/,
  );
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function getAPIClassFiles(): string[] {
  const dir = path.join(ROOT, 'src/api');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('API.ts') && !f.endsWith('.test.ts'));
}

function getAPIClassNames(): string[] {
  return getAPIClassFiles().map((f) => f.replace('.ts', ''));
}

function getRegisteredNodes(): string[] {
  const srcDir = path.join(ROOT, 'src/nodes');
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        const content = fs.readFileSync(path.join(dir, entry.name), 'utf8');
        const matches = content.matchAll(/@RegisterNode\('([^']+)'\)/g);
        for (const m of matches) results.push(m[1]);
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
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function getLUT3DUniformNames(): string[] {
  const shader = readFile('src/render/shaders/viewer.frag.glsl');
  const matches = shader.matchAll(/uniform sampler3D (u_\w+LUT3D)\b/g);
  return [...matches].map((m) => m[1]);
}

function getScreenshotRefsInDocs(): string[] {
  const docsDir = path.join(ROOT, 'docs');
  const refs: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '.vitepress' && entry.name !== 'node_modules') {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        const content = fs.readFileSync(full, 'utf8');
        const matches = content.matchAll(
          /\/assets\/screenshots\/([^)\s"]+\.png)/g,
        );
        for (const m of matches) refs.push(m[1]);
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
    // The TypeDoc-generated index should contain all event names
    for (const name of eventNames) {
      expect(apiIndex).toContain(name);
    }
  });

  // -- API classes ----------------------------------------------------------

  test('API docs list all API classes', () => {
    const classNames = getAPIClassNames();
    expect(classNames.length).toBe(9);

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
      // Should not claim tetrahedral on GPU - trilinear is correct
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
    expect(formats.length).toBeGreaterThanOrEqual(13);
  });

  // -- README cross-checks --------------------------------------------------

  test('README LUT interpolation claim is accurate', () => {
    const readme = readFile('README.md');
    // Should mention trilinear for GPU
    expect(readme).toMatch(/trilinear/i);
    // Should not claim tetrahedral runs on GPU (check line-by-line)
    const lines = readme.split('\n');
    for (const line of lines) {
      // A line should not claim tetrahedral ON the GPU
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
    // README says "all 9 public API classes"
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
});
