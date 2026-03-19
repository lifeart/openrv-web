/**
 * Regression tests for issues #93-#102 (P1 batch)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Issue #101: InfoPanel unwired fields documentation
// ============================================================
import { InfoPanel } from './InfoPanel';

describe('Issue #101: InfoPanel unwired fields documentation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('#101-1: logs console.info about unwired fields on first enable', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const panel = new InfoPanel();
    panel.enable();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Most fields'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('#101'));

    panel.dispose();
  });

  it('#101-2: unwired fields hint is logged only once', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const panel = new InfoPanel();
    panel.enable();
    panel.disable();
    panel.enable();

    const matchingCalls = spy.mock.calls.filter((args) => String(args[0]).includes('#101'));
    expect(matchingCalls).toHaveLength(1);

    panel.dispose();
  });
});
