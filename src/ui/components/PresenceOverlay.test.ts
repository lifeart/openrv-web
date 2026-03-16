/**
 * PresenceOverlay - Unit Tests
 *
 * Regression tests for the viewer presence overlay (#341).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PresenceOverlay } from './PresenceOverlay';
import type { SyncUser } from '../../network/types';

function createUser(overrides: Partial<SyncUser> = {}): SyncUser {
  return {
    id: 'user-1',
    name: 'Alice',
    color: '#4a9eff',
    isHost: false,
    joinedAt: Date.now(),
    ...overrides,
  };
}

describe('PresenceOverlay', () => {
  let overlay: PresenceOverlay;
  let container: HTMLElement;

  beforeEach(() => {
    overlay = new PresenceOverlay();
    container = document.createElement('div');
    container.appendChild(overlay.getElement());
  });

  afterEach(() => {
    overlay.dispose();
  });

  // ---- Rendering in the viewer area ----

  it('PO-001: renders a DOM element that can be mounted in the viewer', () => {
    const element = overlay.getElement();
    expect(element).toBeInstanceOf(HTMLElement);
    expect(element.dataset.testid).toBe('presence-overlay');
    expect(container.contains(element)).toBe(true);
  });

  it('PO-002: overlay is positioned absolutely in top-right corner', () => {
    const element = overlay.getElement();
    expect(element.style.position).toBe('absolute');
    expect(element.style.top).toBe('12px');
    expect(element.style.right).toBe('12px');
  });

  // ---- Hidden when disconnected ----

  it('PO-003: overlay is hidden by default (not connected)', () => {
    const element = overlay.getElement();
    expect(element.style.display).toBe('none');
  });

  it('PO-004: overlay is hidden after calling hide()', () => {
    overlay.show();
    overlay.setUsers([createUser()]);
    overlay.hide();
    expect(overlay.getElement().style.display).toBe('none');
  });

  it('PO-005: overlay is hidden when visible is true but no users', () => {
    overlay.show();
    // No users set
    expect(overlay.getElement().style.display).toBe('none');
  });

  // ---- Avatars appear for connected users ----

  it('PO-006: shows avatar circles when connected with users', () => {
    const users = [
      createUser({ id: 'u1', name: 'Alice', color: '#4a9eff' }),
      createUser({ id: 'u2', name: 'Bob', color: '#4ade80' }),
    ];
    overlay.show();
    overlay.setUsers(users);

    const element = overlay.getElement();
    expect(element.style.display).toBe('flex');
    expect(element.children.length).toBe(2);
  });

  it('PO-007: each avatar shows user initials', () => {
    const users = [
      createUser({ id: 'u1', name: 'Alice' }),
      createUser({ id: 'u2', name: 'bob' }),
    ];
    overlay.show();
    overlay.setUsers(users);

    const avatars = overlay.getElement().children;
    expect(avatars[0]!.textContent).toBe('A');
    expect(avatars[1]!.textContent).toBe('B');
  });

  it('PO-008: each avatar has a test ID based on user ID', () => {
    const users = [
      createUser({ id: 'user-alpha', name: 'Alpha' }),
      createUser({ id: 'user-beta', name: 'Beta' }),
    ];
    overlay.show();
    overlay.setUsers(users);

    const avatars = overlay.getElement().children;
    expect((avatars[0] as HTMLElement).dataset.testid).toBe('presence-avatar-user-alpha');
    expect((avatars[1] as HTMLElement).dataset.testid).toBe('presence-avatar-user-beta');
  });

  it('PO-009: each avatar shows the user color as background', () => {
    const users = [
      createUser({ id: 'u1', name: 'Alice', color: '#4a9eff' }),
      createUser({ id: 'u2', name: 'Bob', color: '#f87171' }),
    ];
    overlay.show();
    overlay.setUsers(users);

    const avatars = overlay.getElement().children;
    expect((avatars[0] as HTMLElement).dataset.color).toBe('#4a9eff');
    expect((avatars[1] as HTMLElement).dataset.color).toBe('#f87171');
  });

  // ---- Updates when users join/leave ----

  it('PO-010: avatars update when a new user joins', () => {
    overlay.show();
    overlay.setUsers([createUser({ id: 'u1', name: 'Alice' })]);
    expect(overlay.getElement().children.length).toBe(1);

    overlay.setUsers([
      createUser({ id: 'u1', name: 'Alice' }),
      createUser({ id: 'u2', name: 'Bob' }),
    ]);
    expect(overlay.getElement().children.length).toBe(2);
  });

  it('PO-011: avatars update when a user leaves', () => {
    overlay.show();
    overlay.setUsers([
      createUser({ id: 'u1', name: 'Alice' }),
      createUser({ id: 'u2', name: 'Bob' }),
    ]);
    expect(overlay.getElement().children.length).toBe(2);

    overlay.setUsers([createUser({ id: 'u1', name: 'Alice' })]);
    expect(overlay.getElement().children.length).toBe(1);
  });

  it('PO-012: clearing all users hides the overlay', () => {
    overlay.show();
    overlay.setUsers([createUser({ id: 'u1', name: 'Alice' })]);
    expect(overlay.getElement().style.display).toBe('flex');

    overlay.setUsers([]);
    expect(overlay.getElement().style.display).toBe('none');
  });

  // ---- State management ----

  it('PO-013: getState returns current users and visibility', () => {
    const users = [createUser({ id: 'u1', name: 'Alice' })];
    overlay.show();
    overlay.setUsers(users);

    const state = overlay.getState();
    expect(state.visible).toBe(true);
    expect(state.users).toHaveLength(1);
    expect(state.users[0]!.id).toBe('u1');
  });

  it('PO-014: getState returns a defensive copy of users', () => {
    const users = [createUser({ id: 'u1', name: 'Alice' })];
    overlay.setUsers(users);

    const state = overlay.getState();
    state.users.push(createUser({ id: 'u2', name: 'Bob' }));
    expect(overlay.getState().users).toHaveLength(1);
  });

  it('PO-015: emits stateChanged when users are set', () => {
    const events: unknown[] = [];
    overlay.on('stateChanged', (state) => events.push(state));

    overlay.setUsers([createUser()]);
    expect(events).toHaveLength(1);
  });

  it('PO-016: emits stateChanged when show/hide is called', () => {
    const events: unknown[] = [];
    overlay.on('stateChanged', (state) => events.push(state));

    overlay.show();
    overlay.hide();
    expect(events).toHaveLength(2);
  });

  // ---- Color sanitization ----

  it('PO-017: avatar falls back to default color for invalid CSS', () => {
    overlay.show();
    overlay.setUsers([createUser({ id: 'u1', name: 'Eve', color: 'url(evil)' })]);

    const avatar = overlay.getElement().children[0] as HTMLElement;
    // Should fallback to USER_COLORS[0] = '#4a9eff'
    expect(avatar.dataset.color).toBe('#4a9eff');
  });

  it('PO-018: avatar accepts valid hex colors', () => {
    overlay.show();
    overlay.setUsers([createUser({ id: 'u1', name: 'Eve', color: '#ff00ff' })]);

    const avatar = overlay.getElement().children[0] as HTMLElement;
    expect(avatar.dataset.color).toBe('#ff00ff');
  });

  // ---- Edge cases ----

  it('PO-019: handles user with empty name gracefully', () => {
    overlay.show();
    overlay.setUsers([createUser({ id: 'u1', name: '' })]);

    const avatar = overlay.getElement().children[0] as HTMLElement;
    expect(avatar.textContent).toBe('?');
  });

  it('PO-020: dispose clears users and hides overlay', () => {
    overlay.show();
    overlay.setUsers([createUser()]);
    overlay.dispose();

    expect(overlay.getElement().children.length).toBe(0);
    const state = overlay.getState();
    expect(state.visible).toBe(false);
    expect(state.users).toHaveLength(0);
  });

  it('PO-021: show() is idempotent', () => {
    const events: unknown[] = [];
    overlay.on('stateChanged', (state) => events.push(state));

    overlay.show();
    overlay.show(); // second call should be no-op
    expect(events).toHaveLength(1);
  });

  it('PO-022: hide() is idempotent', () => {
    overlay.show();
    const events: unknown[] = [];
    overlay.on('stateChanged', (state) => events.push(state));

    overlay.hide();
    overlay.hide(); // second call should be no-op
    expect(events).toHaveLength(1);
  });

  it('PO-023: avatar title attribute shows full user name', () => {
    overlay.show();
    overlay.setUsers([createUser({ id: 'u1', name: 'Alice Wonderland' })]);

    const avatar = overlay.getElement().children[0] as HTMLElement;
    expect(avatar.title).toBe('Alice Wonderland');
  });
});
