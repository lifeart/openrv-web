/**
 * Unit tests for the Vite plugin's `extractManifestId` helper.
 *
 * The regex deliberately rejects three previously-observed false positives:
 *   1. Comments containing the word "manifest" before an unrelated `{ id }`
 *      literal.
 *   2. Nested `manifest:` shorthand keys wrapping `{ id: '...' }` (we
 *      should match only top-level `const/let/var manifest = ...`).
 *   3. Template-literal ids that interpolate `${...}` (we capture the
 *      literal without realising it's a template, so we warn-and-skip).
 */

import { describe, it, expect } from 'vitest';
import { extractManifestId } from '../../scripts/vite/pluginHotReload';

describe('extractManifestId', () => {
  it('MIR-001: extracts id from simple const manifest literal', () => {
    const src = `
const manifest = {
  id: 'openrv.sample',
  name: 'Sample',
};
`;
    expect(extractManifestId(src)).toBe('openrv.sample');
  });

  it('MIR-002: extracts id with type annotation', () => {
    const src = `
const manifest: PluginManifest = {
  id: 'openrv.sample',
  name: 'Sample',
};
`;
    expect(extractManifestId(src)).toBe('openrv.sample');
  });

  it('MIR-003: extracts id from exported manifest', () => {
    const src = `
export const manifest: PluginManifest = {
  id: 'openrv.exported',
  name: 'Exported',
};
`;
    expect(extractManifestId(src)).toBe('openrv.exported');
  });

  it('MIR-004: handles double-quoted id', () => {
    const src = `
const manifest = {
  id: "openrv.dq",
};
`;
    expect(extractManifestId(src)).toBe('openrv.dq');
  });

  it('MIR-005: handles backtick id without interpolation', () => {
    const src = `
const manifest = {
  id: \`openrv.bt\`,
};
`;
    expect(extractManifestId(src)).toBe('openrv.bt');
  });

  it('MIR-006: skips other fields before id', () => {
    const src = `
const manifest = {
  name: 'Has Other Fields',
  version: '1.2.3',
  contributes: ['decoder', 'blendMode'],
  id: 'openrv.late.id',
  description: 'whatever',
};
`;
    expect(extractManifestId(src)).toBe('openrv.late.id');
  });

  it('MIR-007: handles multi-line manifest with nested object before id', () => {
    const src = `
const manifest = {
  name: 'Nested',
  meta: {
    author: 'Someone',
    contact: { email: 'x@y.z' },
  },
  id: 'openrv.nested',
};
`;
    expect(extractManifestId(src)).toBe('openrv.nested');
  });

  it('MIR-008: rejects comment containing "manifest" before unrelated { id }', () => {
    const src = `
// manifest description here
const real = { id: 'fake.id' };
`;
    expect(extractManifestId(src)).toBeNull();
  });

  it('MIR-009: rejects block comment containing "manifest" before unrelated { id }', () => {
    const src = `
/** Documentation: manifest contains 'fake' */
const real = { id: 'real.id' };
`;
    expect(extractManifestId(src)).toBeNull();
  });

  it('MIR-010: does NOT match nested `manifest:` shorthand key', () => {
    const src = `
const x = { manifest: { id: 'nested.id' } };
`;
    // The nested form requires the key to start at column 0 with optional
    // whitespace; here `manifest:` is preceded by `const x = { ` so the
    // anchored ^[ \t]*manifest: alternative does not match.
    expect(extractManifestId(src)).toBeNull();
  });

  it('MIR-011: rejects template-literal id with ${} interpolation', () => {
    const src = `
const name = 'foo';
const manifest = {
  id: \`openrv.\${name}\`,
};
`;
    // We deliberately reject `$` in the captured id so we never ship a
    // literal "openrv.${name}" as the plugin id.
    expect(extractManifestId(src)).toBeNull();
  });

  it('MIR-012: matches when manifest is the only thing on the line', () => {
    const src = `const manifest = { id: 'openrv.oneline' };`;
    expect(extractManifestId(src)).toBe('openrv.oneline');
  });

  it('MIR-013: works with let / var as well', () => {
    const srcLet = `let manifest = { id: 'l.id' };`;
    const srcVar = `var manifest = { id: 'v.id' };`;
    expect(extractManifestId(srcLet)).toBe('l.id');
    expect(extractManifestId(srcVar)).toBe('v.id');
  });

  it('MIR-014: matches the real SamplePlugin file shape', () => {
    const src = `
import type { Plugin, PluginManifest } from '../types';

const manifest: PluginManifest = {
  id: 'openrv.sample.hot-reload-demo',
  name: 'Sample',
  version: '1.0.0',
  contributes: ['blendMode'],
};

export default {
  manifest,
  init() {},
  activate() {},
};
`;
    expect(extractManifestId(src)).toBe('openrv.sample.hot-reload-demo');
  });

  it('MIR-015: returns null for source without any manifest declaration', () => {
    const src = `
const config = { id: 'something' };
export const value = 42;
`;
    expect(extractManifestId(src)).toBeNull();
  });

  it('MIR-016: matches indented top-level manifest declaration', () => {
    // Some formatters indent top-level statements; ^[ \t]* handles that.
    const src = `  const manifest = { id: 'openrv.indented' };`;
    expect(extractManifestId(src)).toBe('openrv.indented');
  });

  it('MIR-017: does not match when manifest is on a comment line', () => {
    // A line starting with `//` should not match the const/manifest
    // alternative because it begins with `//` not optional whitespace
    // followed by `(export )? const|let|var|manifest`.
    const src = `// const manifest = { id: 'commented.out' };
const real = { somethingElse: true };
`;
    expect(extractManifestId(src)).toBeNull();
  });
});
