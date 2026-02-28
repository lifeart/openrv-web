/**
 * ExporterRegistry Unit Tests
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ExporterRegistry } from './ExporterRegistry';
import type { ExporterContribution } from './types';

describe('ExporterRegistry', () => {
  // Use the singleton, but clean up after each test
  const registeredNames: string[] = [];

  afterEach(() => {
    for (const name of registeredNames) {
      ExporterRegistry.unregister(name);
    }
    registeredNames.length = 0;
  });

  it('EXREG-001: register and get exporter', () => {
    const exporter: ExporterContribution = {
      kind: 'blob',
      label: 'Test',
      extensions: ['test'],
      export: vi.fn(),
    };
    ExporterRegistry.register('test-exp', exporter);
    registeredNames.push('test-exp');
    expect(ExporterRegistry.get('test-exp')).toBe(exporter);
  });

  it('EXREG-002: unregister removes exporter', () => {
    const exporter: ExporterContribution = {
      kind: 'blob',
      label: 'Test',
      extensions: ['test'],
      export: vi.fn(),
    };
    ExporterRegistry.register('test-exp-2', exporter);
    registeredNames.push('test-exp-2');
    expect(ExporterRegistry.unregister('test-exp-2')).toBe(true);
    expect(ExporterRegistry.get('test-exp-2')).toBeUndefined();
  });

  it('EXREG-003: unregister returns false for unknown', () => {
    expect(ExporterRegistry.unregister('nonexistent')).toBe(false);
  });

  it('EXREG-004: getAll returns copy of map', () => {
    const exporter: ExporterContribution = {
      kind: 'text',
      label: 'CSV',
      extensions: ['csv'],
      mimeType: 'text/csv',
      export: vi.fn(),
    };
    ExporterRegistry.register('csv-exp', exporter);
    registeredNames.push('csv-exp');
    const all = ExporterRegistry.getAll();
    expect(all.get('csv-exp')).toBe(exporter);
    // Modifying returned map doesn't affect registry
    all.delete('csv-exp');
    expect(ExporterRegistry.get('csv-exp')).toBe(exporter);
  });
});
