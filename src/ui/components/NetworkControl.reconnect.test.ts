/**
 * NetworkControl Reconnect Button - Regression Tests (Issue #447)
 *
 * Tests that the reconnect button appears after retry exhaustion,
 * triggers reconnect events, and is hidden during normal states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkControl } from './NetworkControl';

describe('NetworkControl Reconnect Button (Issue #447)', () => {
  let control: NetworkControl;

  beforeEach(() => {
    control = new NetworkControl();
    control.render();
    // Open the panel so it gets appended to document.body
    control.openPanel();
  });

  afterEach(() => {
    control.dispose();
  });

  function getReconnectPanel(): HTMLElement | null {
    return document.querySelector('[data-testid="network-reconnect-panel"]');
  }

  function getReconnectButton(): HTMLButtonElement | null {
    return document.querySelector('[data-testid="network-reconnect-button"]');
  }

  function getDisconnectedPanel(): HTMLElement | null {
    return document.querySelector('[data-testid="network-disconnected-panel"]');
  }

  function getConnectingPanel(): HTMLElement | null {
    return document.querySelector('[data-testid="network-connecting-panel"]');
  }

  describe('reconnect panel visibility', () => {
    it('NC-RE-001: reconnect panel is hidden in normal disconnected state', () => {
      control.setConnectionState('disconnected');

      const panel = getReconnectPanel();
      expect(panel).not.toBeNull();
      expect(panel!.style.display).toBe('none');
    });

    it('NC-RE-002: disconnected panel is visible in normal disconnected state', () => {
      control.setConnectionState('disconnected');

      const panel = getDisconnectedPanel();
      expect(panel).not.toBeNull();
      expect(panel!.style.display).toBe('block');
    });

    it('NC-RE-003: reconnect panel is shown when reconnect exhausted + error state', () => {
      control.setConnectionState('error');
      control.setReconnectExhausted(true);

      const panel = getReconnectPanel();
      expect(panel).not.toBeNull();
      expect(panel!.style.display).toBe('block');
    });

    it('NC-RE-004: disconnected panel is hidden when reconnect exhausted', () => {
      control.setConnectionState('error');
      control.setReconnectExhausted(true);

      const panel = getDisconnectedPanel();
      expect(panel).not.toBeNull();
      expect(panel!.style.display).toBe('none');
    });

    it('NC-RE-005: reconnect panel hidden when state is connecting', () => {
      control.setReconnectExhausted(true);
      control.setConnectionState('connecting');

      const panel = getReconnectPanel();
      expect(panel!.style.display).toBe('none');
    });

    it('NC-RE-006: reconnect panel hidden when state is connected', () => {
      control.setReconnectExhausted(true);
      control.setConnectionState('connected');

      const panel = getReconnectPanel();
      expect(panel!.style.display).toBe('none');
    });

    it('NC-RE-007: reconnect exhausted flag is cleared on connecting state', () => {
      control.setReconnectExhausted(true);
      control.setConnectionState('connecting');

      // Now go back to error -- should show disconnected panel, not reconnect
      control.setConnectionState('error');
      const reconnectPanel = getReconnectPanel();
      const disconnectedPanel = getDisconnectedPanel();
      expect(reconnectPanel!.style.display).toBe('none');
      expect(disconnectedPanel!.style.display).toBe('block');
    });

    it('NC-RE-008: reconnect panel shown with disconnected state too', () => {
      control.setConnectionState('disconnected');
      control.setReconnectExhausted(true);

      const panel = getReconnectPanel();
      expect(panel!.style.display).toBe('block');
    });
  });

  describe('reconnect button', () => {
    it('NC-RE-010: reconnect button exists in the reconnect panel', () => {
      const btn = getReconnectButton();
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('Reconnect');
    });

    it('NC-RE-011: clicking reconnect button emits reconnect event', () => {
      const handler = vi.fn();
      control.on('reconnect', handler);

      control.setConnectionState('error');
      control.setReconnectExhausted(true);

      const btn = getReconnectButton();
      btn!.click();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('NC-RE-012: reconnect button can be clicked multiple times', () => {
      const handler = vi.fn();
      control.on('reconnect', handler);

      control.setConnectionState('error');
      control.setReconnectExhausted(true);

      const btn = getReconnectButton();
      btn!.click();
      btn!.click();

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('reconnect panel content', () => {
    it('NC-RE-020: reconnect panel displays an explanatory message', () => {
      control.setConnectionState('error');
      control.setReconnectExhausted(true);

      const panel = getReconnectPanel();
      expect(panel!.textContent).toContain('exhausted');
    });

    it('NC-RE-021: reconnect panel has testid', () => {
      const panel = getReconnectPanel();
      expect(panel!.dataset.testid).toBe('network-reconnect-panel');
    });
  });

  describe('state transitions', () => {
    it('NC-RE-030: transition from exhausted to connecting hides reconnect panel', () => {
      control.setConnectionState('error');
      control.setReconnectExhausted(true);
      expect(getReconnectPanel()!.style.display).toBe('block');

      control.setConnectionState('connecting');
      expect(getReconnectPanel()!.style.display).toBe('none');
      expect(getConnectingPanel()!.style.display).toBe('block');
    });

    it('NC-RE-031: setReconnectExhausted(false) returns to normal disconnected panel', () => {
      control.setConnectionState('error');
      control.setReconnectExhausted(true);
      expect(getReconnectPanel()!.style.display).toBe('block');

      control.setReconnectExhausted(false);
      expect(getReconnectPanel()!.style.display).toBe('none');
      expect(getDisconnectedPanel()!.style.display).toBe('block');
    });
  });
});
