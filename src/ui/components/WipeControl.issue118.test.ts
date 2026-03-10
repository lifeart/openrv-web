/**
 * Regression test for issue #118:
 * WipeControl is a dead legacy UI widget with no production mount path.
 *
 * Verifies the deprecated annotation exists and the component still renders.
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

  it('renders without error despite being deprecated', () => {
    const el = control.render();
    expect(el).toBeDefined();
    expect(el.className).toBe('wipe-control-container');
  });

  it('source file contains @deprecated JSDoc', async () => {
    // Read the source file to verify @deprecated annotation
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, './WipeControl.ts'),
      'utf8',
    );
    expect(source).toContain('@deprecated');
    expect(source).toContain('TODO(#118)');
  });
});
