/**
 * Regression test for issue #117:
 * The OCIO button advertises the wrong shortcut.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OCIOControl } from './OCIOControl';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

describe('OCIOControl - issue #117', () => {
  let control: OCIOControl;

  beforeEach(() => {
    control = new OCIOControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('toggle button tooltip shows correct shortcut (O)', () => {
    const el = control.render();
    const button = el.querySelector('[data-testid="ocio-panel-button"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.title).toContain('(O)');
    // Should NOT contain Shift+O
    expect(button.title).not.toContain('Shift+O');
  });
});
