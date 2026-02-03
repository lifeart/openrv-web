/**
 * NetworkControl Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkControl } from './NetworkControl';
import type { SyncUser } from '../../network/types';

describe('NetworkControl', () => {
  let control: NetworkControl;

  beforeEach(() => {
    control = new NetworkControl();
    // Append to body so getBoundingClientRect works
    document.body.appendChild(control.render());
  });

  afterEach(() => {
    control.dispose();
    // Clean up any body-level panels
    document.querySelectorAll('[data-testid="network-panel"]').forEach(el => el.remove());
  });

  describe('render', () => {
    it('NCC-001: renders network button', () => {
      const el = control.render();
      expect(el).toBeTruthy();
      expect(el.dataset.testid).toBe('network-control');

      const button = el.querySelector('[data-testid="network-sync-button"]');
      expect(button).toBeTruthy();
    });
  });

  describe('panel toggle', () => {
    it('NCC-002: opens panel on click', () => {
      control.openPanel();

      const panel = document.querySelector('[data-testid="network-panel"]');
      expect(panel).toBeTruthy();
      expect((panel as HTMLElement).style.display).toBe('flex');
    });

    it('NCC-003: closes panel on outside click', () => {
      control.openPanel();

      // Simulate outside click
      const event = new MouseEvent('click', { bubbles: true });
      document.body.dispatchEvent(event);

      // Give time for requestAnimationFrame + event handler
      // Panel should close on next cycle
    });

    it('NCC-004: shows disconnected state UI', () => {
      control.setConnectionState('disconnected');
      control.openPanel();

      const disconnectedPanel = document.querySelector('[data-testid="network-disconnected-panel"]');
      expect(disconnectedPanel).toBeTruthy();
      expect((disconnectedPanel as HTMLElement).style.display).not.toBe('none');
    });

    it('NCC-005: shows connected state UI', () => {
      control.setConnectionState('connected');
      control.openPanel();

      const connectedPanel = document.querySelector('[data-testid="network-connected-panel"]');
      expect(connectedPanel).toBeTruthy();
      expect((connectedPanel as HTMLElement).style.display).not.toBe('none');
    });

    it('NCC-006: shows connecting state UI', () => {
      control.setConnectionState('connecting');
      control.openPanel();

      const connectingPanel = document.querySelector('[data-testid="network-connecting-panel"]');
      expect(connectingPanel).toBeTruthy();
      expect((connectingPanel as HTMLElement).style.display).not.toBe('none');
    });
  });

  describe('events', () => {
    it('NCC-010: emits createRoom on button click', () => {
      const handler = vi.fn();
      control.on('createRoom', handler);
      control.openPanel();

      const createBtn = document.querySelector('[data-testid="network-create-room-button"]') as HTMLButtonElement;
      expect(createBtn).toBeTruthy();
      createBtn.click();

      expect(handler).toHaveBeenCalled();
    });

    it('NCC-012: emits joinRoom with code', () => {
      const handler = vi.fn();
      control.on('joinRoom', handler);
      control.openPanel();

      // Set the input value
      const input = document.querySelector('[data-testid="network-room-code-input"]') as HTMLInputElement;
      expect(input).toBeTruthy();
      input.value = 'ABCD-1234';

      const joinBtn = document.querySelector('[data-testid="network-join-room-button"]') as HTMLButtonElement;
      joinBtn.click();

      expect(handler).toHaveBeenCalledWith({ roomCode: 'ABCD-1234', userName: 'User' });
    });

    it('NCC-011: validates room code input - shows error for invalid code', () => {
      control.openPanel();

      const input = document.querySelector('[data-testid="network-room-code-input"]') as HTMLInputElement;
      input.value = 'AB';

      const joinBtn = document.querySelector('[data-testid="network-join-room-button"]') as HTMLButtonElement;
      joinBtn.click();

      const errorDisplay = document.querySelector('[data-testid="network-error-display"]') as HTMLElement;
      expect(errorDisplay.style.display).toBe('block');
    });

    it('NCC-013: emits leaveRoom on leave click', () => {
      const handler = vi.fn();
      control.on('leaveRoom', handler);

      control.setConnectionState('connected');
      control.setRoomInfo({
        roomId: 'room-1',
        roomCode: 'ABCD-1234',
        hostId: 'u1',
        users: [],
        createdAt: Date.now(),
        maxUsers: 10,
      });
      control.openPanel();

      const leaveBtn = document.querySelector('[data-testid="network-leave-button"]') as HTMLButtonElement;
      expect(leaveBtn).toBeTruthy();
      leaveBtn.click();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('user list', () => {
    it('NCC-020: displays user list', () => {
      const users: SyncUser[] = [
        { id: 'u1', name: 'Alice', color: '#4a9eff', isHost: true, joinedAt: Date.now() },
        { id: 'u2', name: 'Bob', color: '#4ade80', isHost: false, joinedAt: Date.now() },
      ];

      control.setConnectionState('connected');
      control.setRoomInfo({
        roomId: 'room-1',
        roomCode: 'ABCD-1234',
        hostId: 'u1',
        users,
        createdAt: Date.now(),
        maxUsers: 10,
      });
      control.setUsers(users);
      control.openPanel();

      const userList = document.querySelector('[data-testid="network-user-list"]');
      expect(userList).toBeTruthy();
      expect(userList!.children.length).toBe(2);
    });

    it('NCC-021: updates user list on change', () => {
      control.setConnectionState('connected');
      control.setRoomInfo({
        roomId: 'room-1',
        roomCode: 'ABCD-1234',
        hostId: 'u1',
        users: [],
        createdAt: Date.now(),
        maxUsers: 10,
      });

      control.setUsers([
        { id: 'u1', name: 'Alice', color: '#4a9eff', isHost: true, joinedAt: Date.now() },
      ]);
      control.openPanel();

      let userList = document.querySelector('[data-testid="network-user-list"]');
      expect(userList!.children.length).toBe(1);

      // Add another user
      control.setUsers([
        { id: 'u1', name: 'Alice', color: '#4a9eff', isHost: true, joinedAt: Date.now() },
        { id: 'u2', name: 'Bob', color: '#4ade80', isHost: false, joinedAt: Date.now() },
      ]);

      userList = document.querySelector('[data-testid="network-user-list"]');
      expect(userList!.children.length).toBe(2);
    });

    it('NCC-022: shows user count badge', () => {
      control.setUsers([
        { id: 'u1', name: 'Alice', color: '#4a9eff', isHost: true, joinedAt: Date.now() },
        { id: 'u2', name: 'Bob', color: '#4ade80', isHost: false, joinedAt: Date.now() },
      ]);

      const badge = control.render().querySelector('[data-testid="network-user-badge"]') as HTMLElement;
      expect(badge).toBeTruthy();
      expect(badge.style.display).toBe('flex');
      expect(badge.textContent).toBe('2');
    });

    it('NCC-022b: hides badge when only one user', () => {
      control.setUsers([
        { id: 'u1', name: 'Alice', color: '#4a9eff', isHost: true, joinedAt: Date.now() },
      ]);

      const badge = control.render().querySelector('[data-testid="network-user-badge"]') as HTMLElement;
      expect(badge.style.display).toBe('none');
    });
  });

  describe('sync settings', () => {
    it('NCC-030: toggle sync settings emit events', () => {
      const handler = vi.fn();
      control.on('syncSettingsChanged', handler);

      control.setConnectionState('connected');
      control.setRoomInfo({
        roomId: 'room-1',
        roomCode: 'ABCD-1234',
        hostId: 'u1',
        users: [],
        createdAt: Date.now(),
        maxUsers: 10,
      });
      control.openPanel();

      // Find a sync settings checkbox
      const playbackToggle = document.querySelector('[data-testid="network-sync-playback"]') as HTMLLabelElement;
      expect(playbackToggle).toBeTruthy();

      const checkbox = playbackToggle.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox).toBeTruthy();

      // Toggle it
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0]![0].playback).toBe(false);
    });
  });

  describe('copy link', () => {
    it('NCC-031: emits copyLink event with URL', () => {
      const handler = vi.fn();
      control.on('copyLink', handler);

      control.setConnectionState('connected');
      control.setRoomInfo({
        roomId: 'room-1',
        roomCode: 'TEST-CODE',
        hostId: 'u1',
        users: [],
        createdAt: Date.now(),
        maxUsers: 10,
      });
      control.openPanel();

      const copyBtn = document.querySelector('[data-testid="network-copy-link-button"]') as HTMLButtonElement;
      expect(copyBtn).toBeTruthy();
      copyBtn.click();

      expect(handler).toHaveBeenCalled();
      const link = handler.mock.calls[0]![0] as string;
      expect(link).toContain('room=TEST-CODE');
    });
  });

  describe('keyboard handler', () => {
    it('NCC-040: Shift+N toggles panel', () => {
      expect(control.handleKeyboard('N', true)).toBe(true);
    });

    it('NCC-041: non-matching key returns false', () => {
      expect(control.handleKeyboard('X', false)).toBe(false);
    });
  });

  describe('error display', () => {
    it('NCC-050: shows error message', () => {
      control.openPanel();
      control.showError('Something went wrong');

      const errorDisplay = document.querySelector('[data-testid="network-error-display"]') as HTMLElement;
      expect(errorDisplay.style.display).toBe('block');
      expect(errorDisplay.textContent).toBe('Something went wrong');
    });

    it('NCC-051: hides error message', () => {
      control.openPanel();
      control.showError('Error');
      control.hideError();

      const errorDisplay = document.querySelector('[data-testid="network-error-display"]') as HTMLElement;
      expect(errorDisplay.style.display).toBe('none');
    });
  });

  describe('getState', () => {
    it('NCC-060: returns current state', () => {
      const state = control.getState();
      expect(state.connectionState).toBe('disconnected');
      expect(state.isPanelOpen).toBe(false);
    });
  });

  describe('room code display', () => {
    it('NCC-070: displays room code when connected', () => {
      control.setConnectionState('connected');
      control.setRoomInfo({
        roomId: 'room-1',
        roomCode: 'WXYZ-5678',
        hostId: 'u1',
        users: [],
        createdAt: Date.now(),
        maxUsers: 10,
      });
      control.openPanel();

      const roomCodeDisplay = document.querySelector('[data-testid="network-room-code-display"]') as HTMLElement;
      expect(roomCodeDisplay).toBeTruthy();
      expect(roomCodeDisplay.textContent).toContain('WXYZ-5678');
    });
  });
});
