import { describe, it, expect, afterEach, vi } from 'vitest';
import { computeAnchoredPanelPosition, getTopChromeBottom, isAnchorVisible } from './anchorPosition';
import { createPanel } from './Panel';

function mockRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  const full = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, ...rect };
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ ...full, toJSON: () => full } as DOMRect);
}

describe('anchorPosition', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('isAnchorVisible is false for disconnected, null or zero-size anchors', () => {
    const detached = document.createElement('button');
    mockRect(detached, { width: 20, height: 20, bottom: 20, right: 20 });
    expect(isAnchorVisible(detached)).toBe(false);
    expect(isAnchorVisible(null)).toBe(false);

    const hidden = document.createElement('button');
    document.body.appendChild(hidden);
    expect(isAnchorVisible(hidden)).toBe(false); // jsdom rect is all zeros (display:none equivalent)
  });

  it('positions below a visible anchor (left and right align)', () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    mockRect(anchor, { top: 100, bottom: 130, left: 200, right: 300, width: 100, height: 30 });

    expect(computeAnchoredPanelPosition(anchor, 240, 'right')).toEqual({ top: 134, left: 60 });
    expect(computeAnchoredPanelPosition(anchor, 240, 'left')).toEqual({ top: 134, left: 200 });
  });

  it('falls back to top-right under the top chrome when the anchor is hidden (U10)', () => {
    const top = document.createElement('div');
    top.className = 'layout-top';
    document.body.appendChild(top);
    mockRect(top, { bottom: 120, width: 1024, height: 120 });

    const hidden = document.createElement('button');
    document.body.appendChild(hidden);

    const pos = computeAnchoredPanelPosition(hidden, 300, 'left');
    expect(pos.top).toBe(124);
    expect(pos.left).toBe(window.innerWidth - 300 - 8);
    expect(pos.top).toBeGreaterThan(0);
  });

  it('uses a default top when no top chrome is present', () => {
    expect(getTopChromeBottom()).toBe(60);
  });

  it('createPanel does not draw at (0,0) when shown for a hidden anchor', () => {
    const hidden = document.createElement('button');
    hidden.style.display = 'none';
    document.body.appendChild(hidden);
    const panel = createPanel({ width: '280px' });
    panel.show(hidden);
    expect(parseInt(panel.element.style.top, 10)).toBeGreaterThan(0);
    expect(parseInt(panel.element.style.left, 10)).toBe(window.innerWidth - 280 - 8);
    panel.dispose();
  });
});
