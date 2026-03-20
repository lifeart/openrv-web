/**
 * Reconnect Exhausted Feature - Regression Tests
 *
 * Tests for Issue #447: Manual reconnect button after retry exhaustion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkSyncManager } from './NetworkSyncManager';
import type { ConnectionState } from './types';

// Mock WebSocket
vi.stubGlobal(
  'WebSocket',
  class {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = 0;
    onopen: (() => void) | null = null;
    onclose: ((e: { code: number; reason: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;

    constructor(_url: string) {}

    send(_data: string): void {}
    close(_code?: number, _reason?: string): void {
      this.readyState = 3;
      this.onclose?.({ code: _code ?? 1000, reason: _reason ?? '' });
    }
  },
);

describe('Reconnect Exhaustion (Issue #447)', () => {
  let manager: NetworkSyncManager;

  beforeEach(() => {
    manager = new NetworkSyncManager({ userName: 'TestUser', serverUrl: 'ws://localhost:1234' });
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('NetworkSyncManager reconnectExhausted state', () => {
    it('RE-001: isReconnectExhausted is false initially', () => {
      expect(manager.isReconnectExhausted).toBe(false);
    });

    it('RE-002: isReconnectExhausted becomes true after reconnectFailed (join)', () => {
      manager.joinRoom('ABCD-1234', 'Guest');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);

      expect(manager.isReconnectExhausted).toBe(true);
    });

    it('RE-003: isReconnectExhausted becomes true after reconnectFailed (create, non-wss)', () => {
      manager.joinRoom('WXYZ-5678', 'Host');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);

      expect(manager.isReconnectExhausted).toBe(true);
    });

    it('RE-004: emits reconnectExhausted event on retry exhaustion', () => {
      const handler = vi.fn();
      manager.on('reconnectExhausted', handler);

      manager.joinRoom('ABCD-1234', 'Guest');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('RE-005: reconnectExhausted is cleared when createRoom is called', () => {
      // Exhaust retries first
      manager.joinRoom('ABCD-1234', 'Guest');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);
      expect(manager.isReconnectExhausted).toBe(true);

      // Now create a new room (resets the flag)
      manager.createRoom('Host');
      expect(manager.isReconnectExhausted).toBe(false);
    });

    it('RE-006: reconnectExhausted is cleared when joinRoom is called', () => {
      // Exhaust retries first
      manager.joinRoom('ABCD-1234', 'Guest');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);
      expect(manager.isReconnectExhausted).toBe(true);

      // Now join a room (resets the flag)
      manager.joinRoom('WXYZ-5678', 'Guest2');
      expect(manager.isReconnectExhausted).toBe(false);
    });

    it('RE-007: stores last room code for joinRoom', () => {
      manager.joinRoom('ABCD-1234', 'Guest');
      expect((manager as any)._lastRoomCode).toBe('ABCD-1234');
      expect((manager as any)._lastRoomAction).toBe('join');
    });

    it('RE-008: stores null room code for createRoom', () => {
      manager.createRoom('Host');
      expect((manager as any)._lastRoomCode).toBeNull();
      expect((manager as any)._lastRoomAction).toBe('create');
    });
  });

  describe('manualReconnect()', () => {
    it('RE-010: does nothing when reconnect is not exhausted', () => {
      const stateChanges: ConnectionState[] = [];
      manager.on('connectionStateChanged', (s) => stateChanges.push(s));

      manager.manualReconnect();

      expect(stateChanges).toEqual([]);
    });

    it('RE-011: triggers joinRoom with last room code after exhaustion', () => {
      manager.joinRoom('ABCD-1234', 'Guest');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);
      expect(manager.isReconnectExhausted).toBe(true);

      const stateChanges: ConnectionState[] = [];
      manager.on('connectionStateChanged', (s) => stateChanges.push(s));

      manager.manualReconnect();

      // Should have moved to connecting state
      expect(stateChanges).toContain('connecting');
      expect(manager.isReconnectExhausted).toBe(false);
    });

    it('RE-012: triggers createRoom after exhaustion on create path', () => {
      // Use ws:// so fallback doesn't kick in
      manager.dispose();
      manager = new NetworkSyncManager({ userName: 'TestUser', serverUrl: 'ws://localhost:1234' });

      manager.createRoom('Host');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);
      expect(manager.isReconnectExhausted).toBe(true);

      const stateChanges: ConnectionState[] = [];
      manager.on('connectionStateChanged', (s) => stateChanges.push(s));

      manager.manualReconnect();

      expect(stateChanges).toContain('connecting');
      expect(manager.isReconnectExhausted).toBe(false);
    });

    it('RE-013: clears exhausted flag after manual reconnect', () => {
      manager.joinRoom('ABCD-1234', 'Guest');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);
      expect(manager.isReconnectExhausted).toBe(true);

      manager.manualReconnect();
      expect(manager.isReconnectExhausted).toBe(false);
    });

    it('RE-014: preserves pin code across manual reconnect', () => {
      manager.joinRoom('ABCD-1234', 'Guest', '1234');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);

      expect(manager.pinCode).toBe('1234');

      manager.manualReconnect();
      // Pin code should still be set
      expect(manager.pinCode).toBe('1234');
    });
  });

  describe('wss fallback interaction', () => {
    it('RE-020: reconnectExhausted not set when wss fallback succeeds (createRoom)', () => {
      manager.dispose();
      manager = new NetworkSyncManager({ userName: 'TestUser', serverUrl: 'wss://sync.openrv.local' });

      const handler = vi.fn();
      manager.on('reconnectExhausted', handler);

      manager.createRoom('Host');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);

      // The fallback kicks in, so reconnectExhausted should NOT be emitted
      expect(handler).not.toHaveBeenCalled();
      expect(manager.isReconnectExhausted).toBe(false);
    });

    it('RE-021: reconnectExhausted IS set when wss fallback does not apply (joinRoom)', () => {
      manager.dispose();
      manager = new NetworkSyncManager({ userName: 'TestUser', serverUrl: 'wss://sync.openrv.local' });

      const handler = vi.fn();
      manager.on('reconnectExhausted', handler);

      manager.joinRoom('ABCD-1234', 'Guest');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(manager.isReconnectExhausted).toBe(true);
    });
  });
});
