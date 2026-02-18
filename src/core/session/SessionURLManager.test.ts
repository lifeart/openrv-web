import { describe, it, expect } from 'vitest';
import {
  encodeSessionState,
  decodeSessionState,
  buildShareURL,
  type SessionURLState,
} from './SessionURLManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMinimalState(): SessionURLState {
  return {
    frame: 42,
    fps: 24,
    sourceIndex: 0,
  };
}

function createFullState(): SessionURLState {
  return {
    frame: 100,
    fps: 24,
    sourceIndex: 2,
    sourceUrl: 'file:///shots/vfx_010_020.exr',
    inPoint: 50,
    outPoint: 200,
    sourceAIndex: 0,
    sourceBIndex: 1,
    currentAB: 'B',
    transform: {
      rotation: 90,
      flipH: true,
      flipV: false,
      scale: { x: 2.0, y: 2.0 },
      translate: { x: 0.5, y: -0.3 },
    },
    wipeMode: 'horizontal',
    wipePosition: 0.6,
    ocio: {
      enabled: true,
      configName: 'aces_1.2',
      inputColorSpace: 'ACEScg',
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionURLManager', () => {
  describe('encode / decode', () => {
    it('URL-001: encodeToURL() produces a valid base64url string', () => {
      const state = createMinimalState();
      const hash = encodeSessionState(state);

      // Should be a non-empty string with only base64url chars
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('URL-002: decodeFromURL() restores frame number', () => {
      const state = createMinimalState();
      const hash = encodeSessionState(state);
      const decoded = decodeSessionState(hash);

      expect(decoded).not.toBeNull();
      expect(decoded!.frame).toBe(42);
      expect(decoded!.fps).toBe(24);
      expect(decoded!.sourceIndex).toBe(0);
    });

    it('URL-003: round-trip encode → decode preserves all state fields', () => {
      const state = createFullState();
      const hash = encodeSessionState(state);
      const decoded = decodeSessionState(hash);

      expect(decoded).not.toBeNull();
      expect(decoded!.frame).toBe(100);
      expect(decoded!.fps).toBe(24);
      expect(decoded!.sourceIndex).toBe(2);
      expect(decoded!.sourceUrl).toBe('file:///shots/vfx_010_020.exr');
      expect(decoded!.inPoint).toBe(50);
      expect(decoded!.outPoint).toBe(200);
      expect(decoded!.sourceAIndex).toBe(0);
      expect(decoded!.sourceBIndex).toBe(1);
      expect(decoded!.currentAB).toBe('B');

      // Transform
      expect(decoded!.transform).toEqual({
        rotation: 90,
        flipH: true,
        flipV: false,
        scale: { x: 2.0, y: 2.0 },
        translate: { x: 0.5, y: -0.3 },
      });

      // Wipe
      expect(decoded!.wipeMode).toBe('horizontal');
      expect(decoded!.wipePosition).toBe(0.6);

      // OCIO
      expect(decoded!.ocio).toEqual({
        enabled: true,
        configName: 'aces_1.2',
        inputColorSpace: 'ACEScg',
        display: 'sRGB',
        view: 'ACES 1.0 SDR-video',
        look: 'None',
      });
    });

    it('URL-004: handles missing optional fields', () => {
      const state = createMinimalState();
      const hash = encodeSessionState(state);
      const decoded = decodeSessionState(hash);

      expect(decoded).not.toBeNull();
      expect(decoded!.frame).toBe(42);
      expect(decoded!.sourceUrl).toBeUndefined();
      expect(decoded!.inPoint).toBeUndefined();
      expect(decoded!.outPoint).toBeUndefined();
      expect(decoded!.sourceAIndex).toBeUndefined();
      expect(decoded!.sourceBIndex).toBeUndefined();
      expect(decoded!.currentAB).toBeUndefined();
      expect(decoded!.transform).toBeUndefined();
      expect(decoded!.wipeMode).toBeUndefined();
      expect(decoded!.wipePosition).toBeUndefined();
      expect(decoded!.ocio).toBeUndefined();
    });

    it('URL-005: handles invalid/corrupted URL gracefully', () => {
      expect(decodeSessionState('')).toBeNull();
      expect(decodeSessionState('#')).toBeNull();
      expect(decodeSessionState('not-base64!!!')).toBeNull();
      expect(decodeSessionState('#s=INVALIDBASE64$$$')).toBeNull();
      // Valid base64 but invalid JSON
      const badJson = btoa('not json at all');
      expect(decodeSessionState(badJson)).toBeNull();
      // Valid JSON but missing required fields
      const missingFields = btoa(JSON.stringify({ foo: 'bar' }));
      expect(decodeSessionState(missingFields)).toBeNull();
    });
  });

  describe('buildShareURL', () => {
    it('produces a URL with hash containing state', () => {
      const state = createMinimalState();
      const url = buildShareURL('https://app.example.com/', state);

      expect(url).toContain('https://app.example.com/');
      expect(url).toContain('#s=');

      // Extract hash and decode
      const hashPart = url.split('#')[1]!;
      const decoded = decodeSessionState('#' + hashPart);
      expect(decoded).not.toBeNull();
      expect(decoded!.frame).toBe(42);
    });

    it('preserves existing URL path', () => {
      const state = createMinimalState();
      const url = buildShareURL('https://app.example.com/viewer', state);
      expect(url).toContain('/viewer');
      expect(url).toContain('#s=');
    });

    it('supports relative base URLs', () => {
      const state = createMinimalState();
      const url = buildShareURL('/?room=ABCD-1234&pin=1234', state);
      const parsed = new URL(url);

      expect(parsed.searchParams.get('room')).toBe('ABCD-1234');
      expect(parsed.searchParams.get('pin')).toBe('1234');
      expect(parsed.hash.startsWith('#s=')).toBe(true);
    });

    it('falls back to window location when base URL is empty', () => {
      const originalHref = window.location.href;
      history.replaceState({}, '', '/viewer?room=WXYZ-5678');

      try {
        const state = createMinimalState();
        const url = buildShareURL('', state);
        const parsed = new URL(url);
        expect(parsed.pathname).toBe('/viewer');
        expect(parsed.searchParams.get('room')).toBe('WXYZ-5678');
        expect(parsed.hash.startsWith('#s=')).toBe(true);
      } finally {
        const original = new URL(originalHref);
        history.replaceState({}, '', `${original.pathname}${original.search}${original.hash}`);
      }
    });
  });

  describe('compact encoding', () => {
    it('omits default transform to reduce URL size', () => {
      const state: SessionURLState = {
        ...createMinimalState(),
        transform: {
          rotation: 0,
          flipH: false,
          flipV: false,
          scale: { x: 1, y: 1 },
          translate: { x: 0, y: 0 },
        },
      };
      const hash = encodeSessionState(state);
      const decoded = decodeSessionState(hash);

      // Default transform should be stripped
      expect(decoded!.transform).toBeUndefined();
    });

    it('omits currentAB when it is "A" (default)', () => {
      const state: SessionURLState = {
        ...createMinimalState(),
        currentAB: 'A',
      };
      const hash = encodeSessionState(state);
      const decoded = decodeSessionState(hash);
      expect(decoded!.currentAB).toBeUndefined();
    });

    it('omits wipeMode when "off"', () => {
      const state: SessionURLState = {
        ...createMinimalState(),
        wipeMode: 'off',
      };
      const hash = encodeSessionState(state);
      const decoded = decodeSessionState(hash);
      expect(decoded!.wipeMode).toBeUndefined();
    });

    it('omits OCIO when not enabled', () => {
      const state: SessionURLState = {
        ...createMinimalState(),
        ocio: { enabled: false },
      };
      const hash = encodeSessionState(state);
      const decoded = decodeSessionState(hash);
      expect(decoded!.ocio).toBeUndefined();
    });

    it('includes non-default transform', () => {
      const state: SessionURLState = {
        ...createMinimalState(),
        transform: {
          rotation: 180,
          flipH: false,
          flipV: true,
          scale: { x: 1.5, y: 1.5 },
          translate: { x: 0, y: 0 },
        },
      };
      const hash = encodeSessionState(state);
      const decoded = decodeSessionState(hash);
      expect(decoded!.transform).toBeDefined();
      expect(decoded!.transform!.rotation).toBe(180);
      expect(decoded!.transform!.flipV).toBe(true);
      expect(decoded!.transform!.scale.x).toBe(1.5);
    });
  });

  describe('validation', () => {
    it('rejects negative frame numbers', () => {
      const json = JSON.stringify({ f: -1, fps: 24, si: 0 });
      const encoded = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      expect(decodeSessionState(encoded)).toBeNull();
    });

    it('rejects zero fps', () => {
      const json = JSON.stringify({ f: 1, fps: 0, si: 0 });
      const encoded = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      expect(decodeSessionState(encoded)).toBeNull();
    });

    it('rejects negative sourceIndex', () => {
      const json = JSON.stringify({ f: 1, fps: 24, si: -1 });
      const encoded = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      expect(decodeSessionState(encoded)).toBeNull();
    });

    it('clamps invalid rotation to 0', () => {
      const json = JSON.stringify({ f: 1, fps: 24, si: 0, t: { r: 45 } });
      const encoded = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const decoded = decodeSessionState(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.transform!.rotation).toBe(0);
    });

    it('handles hash with # prefix', () => {
      const state = createMinimalState();
      const hash = '#' + encodeSessionState(state);
      const decoded = decodeSessionState(hash);
      expect(decoded).not.toBeNull();
      expect(decoded!.frame).toBe(42);
    });

    it('handles hash with s= prefix', () => {
      const state = createMinimalState();
      const encoded = encodeSessionState(state);
      const decoded = decodeSessionState(`s=${encoded}`);
      expect(decoded).not.toBeNull();
      expect(decoded!.frame).toBe(42);
    });

    it('handles hash with #s= prefix', () => {
      const state = createMinimalState();
      const encoded = encodeSessionState(state);
      const decoded = decodeSessionState(`#s=${encoded}`);
      expect(decoded).not.toBeNull();
      expect(decoded!.frame).toBe(42);
    });
  });

  describe('unicode support', () => {
    it('handles unicode source URLs', () => {
      const state: SessionURLState = {
        ...createMinimalState(),
        sourceUrl: 'file:///shots/日本語ショット.exr',
      };
      const hash = encodeSessionState(state);
      const decoded = decodeSessionState(hash);
      expect(decoded!.sourceUrl).toBe('file:///shots/日本語ショット.exr');
    });
  });
});
