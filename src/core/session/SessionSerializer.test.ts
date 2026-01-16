/**
 * SessionSerializer Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { SessionSerializer } from './SessionSerializer';
import type { SessionState } from './SessionState';
import { SESSION_STATE_VERSION } from './SessionState';

describe('SessionSerializer', () => {
  describe('createEmpty', () => {
    it('creates empty session state with defaults', () => {
      const state = SessionSerializer.createEmpty('Test Project');

      expect(state.name).toBe('Test Project');
      expect(state.version).toBe(SESSION_STATE_VERSION);
      expect(state.media).toEqual([]);
      expect(state.playback).toBeDefined();
      expect(state.paint).toBeDefined();
      expect(state.view).toBeDefined();
      expect(state.color).toBeDefined();
      expect(state.cdl).toBeDefined();
      expect(state.filters).toBeDefined();
      expect(state.transform).toBeDefined();
      expect(state.crop).toBeDefined();
      expect(state.lens).toBeDefined();
      expect(state.wipe).toBeDefined();
      expect(state.stack).toEqual([]);
      expect(state.lutIntensity).toBe(1.0);
    });

    it('uses "Untitled" as default name', () => {
      const state = SessionSerializer.createEmpty();
      expect(state.name).toBe('Untitled');
    });

    it('sets timestamps', () => {
      const before = new Date().toISOString();
      const state = SessionSerializer.createEmpty();
      const after = new Date().toISOString();

      expect(state.createdAt >= before).toBe(true);
      expect(state.createdAt <= after).toBe(true);
      expect(state.modifiedAt >= before).toBe(true);
      expect(state.modifiedAt <= after).toBe(true);
    });
  });

  describe('loadFromFile', () => {
    it('SER-001: parses valid project file', async () => {
      const validState = SessionSerializer.createEmpty('ValidProject');
      const json = JSON.stringify(validState);
      const file = new File([json], 'test.orvproject', { type: 'application/json' });

      const loaded = await SessionSerializer.loadFromFile(file);

      expect(loaded.name).toBe('ValidProject');
      expect(loaded.version).toBe(SESSION_STATE_VERSION);
    });

    it('SER-004: throws error for invalid JSON', async () => {
      const file = new File(['not valid json'], 'test.orvproject');

      await expect(SessionSerializer.loadFromFile(file)).rejects.toThrow();
    });

    it('throws error for missing version', async () => {
      const invalidState = { media: [], playback: {} };
      const json = JSON.stringify(invalidState);
      const file = new File([json], 'test.orvproject');

      await expect(SessionSerializer.loadFromFile(file)).rejects.toThrow('missing version');
    });

    it('throws error for missing media array', async () => {
      const invalidState = { version: 1, playback: {} };
      const json = JSON.stringify(invalidState);
      const file = new File([json], 'test.orvproject');

      await expect(SessionSerializer.loadFromFile(file)).rejects.toThrow('missing media array');
    });

    it('throws error for missing playback state', async () => {
      const invalidState = { version: 1, media: [] };
      const json = JSON.stringify(invalidState);
      const file = new File([json], 'test.orvproject');

      await expect(SessionSerializer.loadFromFile(file)).rejects.toThrow('missing playback state');
    });
  });

  describe('saveToFile', () => {
    it('creates downloadable file', async () => {
      const state = SessionSerializer.createEmpty('TestSave');

      // Mock DOM methods
      const mockClick = vi.fn();
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();

      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        click: mockClick,
      } as unknown as HTMLAnchorElement);

      vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
      vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);

      await SessionSerializer.saveToFile(state, 'test');

      expect(mockClick).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalled();
    });

    it('adds .orvproject extension if missing', async () => {
      const state = SessionSerializer.createEmpty();

      let capturedDownload = '';
      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        set download(val: string) {
          capturedDownload = val;
        },
        get download() {
          return capturedDownload;
        },
        click: vi.fn(),
      } as unknown as HTMLAnchorElement);

      vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn());
      vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn());

      await SessionSerializer.saveToFile(state, 'myproject');

      expect(capturedDownload).toBe('myproject.orvproject');
    });

    it('does not duplicate .orvproject extension', async () => {
      const state = SessionSerializer.createEmpty();

      let capturedDownload = '';
      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        set download(val: string) {
          capturedDownload = val;
        },
        get download() {
          return capturedDownload;
        },
        click: vi.fn(),
      } as unknown as HTMLAnchorElement);

      vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn());
      vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn());

      await SessionSerializer.saveToFile(state, 'myproject.orvproject');

      expect(capturedDownload).toBe('myproject.orvproject');
    });
  });

  describe('round-trip', () => {
    it('SER-003: preserves data through save/load cycle', async () => {
      const original = SessionSerializer.createEmpty('RoundTripTest');

      // Modify some values
      original.playback.fps = 30;
      original.playback.loopMode = 'pingpong';
      original.color.exposure = 0.5;
      original.view.zoom = 2.0;

      // Simulate save/load
      const json = JSON.stringify(original);
      const file = new File([json], 'test.orvproject');
      const loaded = await SessionSerializer.loadFromFile(file);

      expect(loaded.name).toBe('RoundTripTest');
      expect(loaded.playback.fps).toBe(30);
      expect(loaded.playback.loopMode).toBe('pingpong');
      expect(loaded.color.exposure).toBe(0.5);
      expect(loaded.view.zoom).toBe(2.0);
    });
  });

  describe('migration', () => {
    it('SER-005: handles missing fields with defaults', async () => {
      // Create minimal valid state (older version format)
      const minimalState: Partial<SessionState> = {
        version: 1,
        name: 'Minimal',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        media: [],
        playback: {
          currentFrame: 1,
          inPoint: 1,
          outPoint: 1,
          fps: 24,
          loopMode: 'loop',
          volume: 1,
          muted: false,
          marks: [],
          currentSourceIndex: 0,
        },
        // Missing many other fields
      };

      const json = JSON.stringify(minimalState);
      const file = new File([json], 'minimal.orvproject');
      const loaded = await SessionSerializer.loadFromFile(file);

      // Should parse without error
      expect(loaded.version).toBe(1);
      expect(loaded.name).toBe('Minimal');
    });
  });
});
