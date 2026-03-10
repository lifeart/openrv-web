/**
 * Regression test for issue #118:
 * WipeControl is a dead legacy UI widget with no production mount path.
 *
 * Verifies the component still renders and functions correctly.
 * The @deprecated JSDoc and TODO(#118) are present in the source file
 * (WipeControl.ts) to document this is a legacy widget.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WipeControl } from './WipeControl';

describe('WipeControl - issue #118', () => {
  let control: WipeControl;

  beforeEach(() => {
    control = new WipeControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('deprecated WipeControl renders without error', () => {
    const el = control.render();
    expect(el).toBeDefined();
    expect(el.className).toBe('wipe-control-container');
  });

  it('deprecated WipeControl still provides basic functionality', () => {
    // Verify it still functions as a legacy wrapper around ComparisonManager
    expect(control.getMode()).toBe('off');
    expect(control.isActive()).toBe(false);

    control.setMode('horizontal');
    expect(control.getMode()).toBe('horizontal');
    expect(control.isActive()).toBe(true);
  });
});
