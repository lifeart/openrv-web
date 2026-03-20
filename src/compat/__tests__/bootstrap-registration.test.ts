/**
 * Regression test for Issue #201:
 * Verify that registerMuCompat() is called during production bootstrap,
 * ensuring `window.rv.commands` and `window.rv.extra_commands` are available.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the compat module so we can spy on registerMuCompat
vi.mock('../index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index')>();
  return {
    ...actual,
    registerMuCompat: vi.fn(actual.registerMuCompat),
  };
});

import { registerMuCompat, _resetMuCompatCache } from '../index';

describe('bootstrap Mu compat registration (Issue #201)', () => {
  const g = globalThis as unknown as { rv?: { commands: unknown; extra_commands: unknown } };

  beforeEach(() => {
    delete g.rv;
    _resetMuCompatCache();
    vi.mocked(registerMuCompat).mockClear();
  });

  afterEach(() => {
    delete g.rv;
    _resetMuCompatCache();
  });

  it('registerMuCompat is exported and callable', () => {
    expect(typeof registerMuCompat).toBe('function');
  });

  it('sets up window.rv namespace with commands and extra_commands', () => {
    const result = registerMuCompat();

    expect(g.rv).toBeDefined();
    expect(g.rv!.commands).toBe(result.commands);
    expect(g.rv!.extra_commands).toBe(result.extra_commands);
  });

  it('main.ts imports registerMuCompat from compat module', async () => {
    // Verify the import exists in the production entrypoint by reading its source.
    // This is a static analysis check — if the import is removed, this test fails.
    const mainSource = await import('../../main.ts?raw');
    // Vite ?raw import returns the raw source text
    const source: string = typeof mainSource === 'string' ? mainSource : mainSource.default;

    expect(source).toContain("import { registerMuCompat } from './compat'");
    expect(source).toContain('registerMuCompat()');
  });

  it('repeat call returns the same objects as window.rv (Issue #207)', () => {
    const first = registerMuCompat();
    const second = registerMuCompat();

    expect(second.commands).toBe(first.commands);
    expect(second.extra_commands).toBe(first.extra_commands);
    expect(g.rv!.commands).toBe(first.commands);
    expect(g.rv!.extra_commands).toBe(first.extra_commands);
  });

  it('repeat call does not allocate new command objects (Issue #207)', () => {
    registerMuCompat();
    const commandsBefore = g.rv!.commands;
    const extraBefore = g.rv!.extra_commands;

    const second = registerMuCompat();

    // The returned objects must be the exact same references
    expect(second.commands).toBe(commandsBefore);
    expect(second.extra_commands).toBe(extraBefore);
    // window.rv must not have been replaced
    expect(g.rv!.commands).toBe(commandsBefore);
    expect(g.rv!.extra_commands).toBe(extraBefore);
  });

  it('returns installed objects when window.rv was set externally (Issue #207)', () => {
    // Simulate an external caller having already set window.rv
    const fakeCommands = { fake: true } as unknown as typeof g.rv;
    g.rv = fakeCommands as typeof g.rv;

    const result = registerMuCompat();

    // Must return the pre-existing objects, not freshly constructed ones
    expect(result.commands).toBe(g.rv!.commands);
    expect(result.extra_commands).toBe(g.rv!.extra_commands);
    // window.rv must be untouched
    expect(g.rv).toBe(fakeCommands);
  });

  it('registerMuCompat call appears after window.openrv initialization in main.ts', async () => {
    const mainSource = await import('../../main.ts?raw');
    const source: string = typeof mainSource === 'string' ? mainSource : mainSource.default;

    const openrvIndex = source.indexOf('window.openrv = new OpenRVAPI');
    const muCompatIndex = source.indexOf('registerMuCompat()');

    expect(openrvIndex).toBeGreaterThan(-1);
    expect(muCompatIndex).toBeGreaterThan(-1);
    expect(muCompatIndex).toBeGreaterThan(openrvIndex);
  });

  it('repeat calls return identical cached references (Issue #275)', () => {
    const first = registerMuCompat();
    const second = registerMuCompat();
    const third = registerMuCompat();

    // All calls must return the exact same object references
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(second.commands).toBe(first.commands);
    expect(second.extra_commands).toBe(first.extra_commands);
  });

  it('repeat calls do not construct new MuCommands instances (Issue #275)', () => {
    const first = registerMuCompat();

    const commandsRef = first.commands;
    const extraRef = first.extra_commands;

    const second = registerMuCompat();

    // Must return the exact same cached result object, not a new wrapper
    expect(second.commands).toBe(commandsRef);
    expect(second.extra_commands).toBe(extraRef);
  });
});
