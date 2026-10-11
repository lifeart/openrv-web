import { describe, it, expect, afterEach, vi } from 'vitest';
import { ToolbarOverflowController, ToolbarPopover } from './ToolbarOverflow';
import { resetOutsideClickRegistry } from '../../../utils/ui/__test-helpers__/outsideClickTestUtils';

/**
 * jsdom has no layout, so simulate a toolbar: each child carries a
 * `data-w` width; scrollWidth is the sum of the widths of the elements
 * currently inside the container (hidden ones excluded), clientWidth is fixed.
 */
function makeToolbar(clientWidth: number) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const state = { clientWidth };
  Object.defineProperty(container, 'clientWidth', { get: () => state.clientWidth });
  Object.defineProperty(container, 'scrollWidth', {
    get: () => {
      let sum = 0;
      container.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => {
        if (el.style.display !== 'none') sum += Number(el.dataset.w);
      });
      return Math.max(sum, state.clientWidth);
    },
  });
  const add = (id: string, w: number) => {
    const el = document.createElement('button');
    el.dataset.testid = id;
    el.dataset.w = String(w);
    container.appendChild(el);
    return el;
  };
  return { container, state, add };
}

function makePopover() {
  return new ToolbarPopover({
    triggerTestId: 'more-btn',
    panelTestId: 'more-menu',
    icon: 'more-horizontal',
    title: 'More controls',
    align: 'right',
  });
}

describe('ToolbarOverflowController', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    resetOutsideClickRegistry();
    vi.restoreAllMocks();
  });

  it('moves nothing and hides the trigger when everything fits', () => {
    const { container, add } = makeToolbar(500);
    const play = add('play', 100);
    const docs = add('docs', 100);
    const popover = makePopover();
    container.appendChild(popover.trigger);
    const ctl = new ToolbarOverflowController({ container, popover, items: [{ element: docs }] });

    ctl.update();

    expect(popover.trigger.style.display).toBe('none');
    expect(container.contains(docs)).toBe(true);
    expect(container.contains(play)).toBe(true);
    expect(ctl.getOverflowedElements()).toEqual([]);
    ctl.dispose();
  });

  it('moves items in priority order until the toolbar fits, never unregistered ones', () => {
    const { container, add } = makeToolbar(300);
    const help = add('help', 100);
    const play = add('play', 150);
    const docs = add('docs', 100);
    const theme = add('theme', 100);
    const popover = makePopover();
    popover.trigger.dataset.w = '30';
    container.appendChild(popover.trigger);
    const ctl = new ToolbarOverflowController({
      container,
      popover,
      items: [{ element: docs, label: 'Docs' }, { element: theme }, { element: help }],
    });

    ctl.update(); // 450 + trigger 30 > 300 -> move docs (380), theme (280) -> fits

    expect(popover.trigger.style.display).toBe('');
    expect(container.contains(play)).toBe(true);
    expect(container.contains(help)).toBe(true);
    expect(popover.panel.contains(docs)).toBe(true);
    expect(popover.panel.contains(theme)).toBe(true);
    // Labels are rendered next to moved items and listed in DOM order.
    expect(popover.panel.textContent).toContain('Docs');
    expect(ctl.getOverflowedElements()).toEqual([docs, theme]);
    ctl.dispose();
  });

  it('restores items in their original position when space becomes available', () => {
    const { container, state, add } = makeToolbar(200);
    const a = add('a', 100);
    const b = add('b', 100);
    const c = add('c', 100);
    const popover = makePopover();
    container.appendChild(popover.trigger);
    const ctl = new ToolbarOverflowController({ container, popover, items: [{ element: b }] });

    ctl.update();
    expect(popover.panel.contains(b)).toBe(true);

    state.clientWidth = 1000;
    ctl.update();
    expect(popover.panel.contains(b)).toBe(false);
    const order = Array.from(container.querySelectorAll('[data-w]')).map((el) => (el as HTMLElement).dataset.testid);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(popover.trigger.style.display).toBe('none');
    expect(a.isConnected && c.isConnected).toBe(true);
    ctl.dispose();
  });

  it('skips hidden items and does not run while inactive', () => {
    const { container, add } = makeToolbar(100);
    add('play', 150);
    const hidden = add('hidden', 100);
    hidden.style.display = 'none';
    const popover = makePopover();
    container.appendChild(popover.trigger);
    let active = false;
    const ctl = new ToolbarOverflowController({
      container,
      popover,
      items: [{ element: hidden }],
      isActive: () => active,
    });

    ctl.update();
    expect(container.contains(hidden)).toBe(true);

    active = true;
    ctl.update();
    expect(container.contains(hidden)).toBe(true);
    expect(popover.trigger.style.display).toBe('none');
    ctl.dispose();
  });

  it('dispose restores moved items and removes anchors', () => {
    const { container, add } = makeToolbar(100);
    const item = add('item', 200);
    const popover = makePopover();
    container.appendChild(popover.trigger);
    const ctl = new ToolbarOverflowController({ container, popover, items: [{ element: item }] });
    ctl.update();
    expect(popover.panel.contains(item)).toBe(true);

    ctl.dispose();

    expect(container.contains(item)).toBe(true);
    expect(Array.from(container.childNodes).some((n) => n.nodeType === Node.COMMENT_NODE)).toBe(false);
  });

  it('scheduleUpdate coalesces into a single animation frame', () => {
    const { container, add } = makeToolbar(500);
    add('a', 10);
    const popover = makePopover();
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const ctl = new ToolbarOverflowController({ container, popover, items: [] });
    ctl.scheduleUpdate();
    ctl.scheduleUpdate();
    expect(raf).toHaveBeenCalledTimes(1);
    ctl.dispose();
  });
});

describe('ToolbarPopover', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    resetOutsideClickRegistry();
  });

  it('opens on trigger click, appends the panel to body and sets aria-expanded', () => {
    const popover = makePopover();
    document.body.appendChild(popover.trigger);
    popover.trigger.click();
    expect(popover.isOpen()).toBe(true);
    expect(popover.panel.parentElement).toBe(document.body);
    expect(popover.panel.style.display).toBe('flex');
    expect(popover.trigger.getAttribute('aria-expanded')).toBe('true');
    expect(popover.trigger.getAttribute('aria-controls')).toBe(popover.panel.id);

    popover.trigger.click();
    expect(popover.isOpen()).toBe(false);
    expect(popover.panel.style.display).toBe('none');
    popover.dispose();
  });

  it('positions the panel under the header instead of (0,0) when the trigger is hidden', () => {
    const popover = makePopover();
    popover.open();
    expect(parseInt(popover.panel.style.top, 10)).toBeGreaterThan(0);
    popover.dispose();
    expect(popover.panel.isConnected).toBe(false);
  });

  it('row labels forward clicks to the hosted control', () => {
    const popover = makePopover();
    const btn = document.createElement('button');
    const onClick = vi.fn();
    btn.addEventListener('click', onClick);
    const row = popover.addItem(btn, 'Spotlight');
    (row.querySelector('.toolbar-popover-label') as HTMLElement).click();
    expect(onClick).toHaveBeenCalledTimes(1);
    popover.dispose();
  });
});
