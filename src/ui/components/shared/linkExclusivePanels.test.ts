import { describe, it, expect, vi } from 'vitest';
import { linkExclusivePanels, type ExclusiveGroupMember } from './linkExclusivePanels';

function makeMember(): ExclusiveGroupMember & { open(): void; openState: boolean } {
  const listeners = new Set<() => void>();
  const m = {
    openState: false,
    isOpen: () => m.openState,
    hide: vi.fn(() => {
      m.openState = false;
    }),
    onOpen: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    open: () => {
      m.openState = true;
      for (const cb of listeners) cb();
    },
  };
  return m;
}

describe('linkExclusivePanels', () => {
  it('opening one member closes all other open members', () => {
    const a = makeMember();
    const b = makeMember();
    const c = makeMember();
    linkExclusivePanels([a, b, c]);

    b.open();
    c.openState = true; // simulate a panel opened without the group noticing
    a.open();

    expect(a.isOpen()).toBe(true);
    expect(b.isOpen()).toBe(false);
    expect(c.isOpen()).toBe(false);
    expect(a.hide).not.toHaveBeenCalled();
  });

  it('does not hide members that are already closed', () => {
    const a = makeMember();
    const b = makeMember();
    linkExclusivePanels([a, b]);

    a.open();

    expect(b.hide).not.toHaveBeenCalled();
  });

  it('disposer removes the subscriptions', () => {
    const a = makeMember();
    const b = makeMember();
    const dispose = linkExclusivePanels([a, b]);
    dispose();

    b.open();
    a.open();

    expect(b.hide).not.toHaveBeenCalled();
  });
});
