import { describe, it, expect } from 'vitest';
import { PreferencesManager } from '../utils/preferences/PreferencesManager';
import type { StorageLike } from '../utils/preferences/PreferencesManager';
import {
  DCC_STORAGE_KEY,
  DEFAULT_DCC_PREFS,
  sanitizeDCCPrefs,
  getDCCPrefs,
  setDCCPrefs,
  clearDCCPrefs,
  resolveDCCEndpoint,
} from './DCCSettings';

// ---------------------------------------------------------------------------
// In-memory storage for tests
// ---------------------------------------------------------------------------

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

function createStorage(): PreferencesManager {
  return new PreferencesManager(() => createMemoryStorage());
}

// A shared memory storage so getDCCPrefs and setDCCPrefs see the same state
function createSharedStorage(): { storage: PreferencesManager; raw: StorageLike } {
  const raw = createMemoryStorage();
  const storage = new PreferencesManager(() => raw);
  return { storage, raw };
}

// ---------------------------------------------------------------------------
// sanitizeDCCPrefs
// ---------------------------------------------------------------------------

describe('sanitizeDCCPrefs', () => {
  it('returns defaults for null', () => {
    expect(sanitizeDCCPrefs(null)).toEqual(DEFAULT_DCC_PREFS);
  });

  it('returns defaults for undefined', () => {
    expect(sanitizeDCCPrefs(undefined)).toEqual(DEFAULT_DCC_PREFS);
  });

  it('returns defaults for non-object', () => {
    expect(sanitizeDCCPrefs('hello')).toEqual(DEFAULT_DCC_PREFS);
    expect(sanitizeDCCPrefs(42)).toEqual(DEFAULT_DCC_PREFS);
    expect(sanitizeDCCPrefs([])).toEqual(DEFAULT_DCC_PREFS);
  });

  it('accepts a valid endpoint', () => {
    const result = sanitizeDCCPrefs({ endpoint: 'ws://localhost:9200' });
    expect(result.endpoint).toBe('ws://localhost:9200');
    expect(result.autoConnect).toBe(true);
  });

  it('trims whitespace from endpoint', () => {
    const result = sanitizeDCCPrefs({ endpoint: '  ws://localhost:9200  ' });
    expect(result.endpoint).toBe('ws://localhost:9200');
  });

  it('accepts autoConnect false', () => {
    const result = sanitizeDCCPrefs({ autoConnect: false });
    expect(result.autoConnect).toBe(false);
  });

  it('ignores non-string endpoint', () => {
    const result = sanitizeDCCPrefs({ endpoint: 123 });
    expect(result.endpoint).toBe('');
  });

  it('ignores non-boolean autoConnect', () => {
    const result = sanitizeDCCPrefs({ autoConnect: 'yes' });
    expect(result.autoConnect).toBe(true); // default
  });
});

// ---------------------------------------------------------------------------
// getDCCPrefs / setDCCPrefs / clearDCCPrefs
// ---------------------------------------------------------------------------

describe('getDCCPrefs', () => {
  it('returns defaults when nothing is stored', () => {
    const storage = createStorage();
    expect(getDCCPrefs(storage)).toEqual(DEFAULT_DCC_PREFS);
  });

  it('returns stored prefs', () => {
    const { storage, raw } = createSharedStorage();
    raw.setItem(DCC_STORAGE_KEY, JSON.stringify({ endpoint: 'ws://10.0.0.1:9200', autoConnect: true }));
    const prefs = getDCCPrefs(storage);
    expect(prefs.endpoint).toBe('ws://10.0.0.1:9200');
    expect(prefs.autoConnect).toBe(true);
  });

  it('handles corrupt JSON gracefully', () => {
    const { storage, raw } = createSharedStorage();
    raw.setItem(DCC_STORAGE_KEY, '{broken json');
    expect(getDCCPrefs(storage)).toEqual(DEFAULT_DCC_PREFS);
  });
});

describe('setDCCPrefs', () => {
  it('persists endpoint', () => {
    const { storage } = createSharedStorage();
    setDCCPrefs({ endpoint: 'ws://localhost:9200' }, storage);
    const prefs = getDCCPrefs(storage);
    expect(prefs.endpoint).toBe('ws://localhost:9200');
    expect(prefs.autoConnect).toBe(true);
  });

  it('merges partial updates', () => {
    const { storage } = createSharedStorage();
    setDCCPrefs({ endpoint: 'ws://localhost:9200' }, storage);
    setDCCPrefs({ autoConnect: false }, storage);
    const prefs = getDCCPrefs(storage);
    expect(prefs.endpoint).toBe('ws://localhost:9200');
    expect(prefs.autoConnect).toBe(false);
  });
});

describe('clearDCCPrefs', () => {
  it('removes stored prefs', () => {
    const { storage } = createSharedStorage();
    setDCCPrefs({ endpoint: 'ws://localhost:9200' }, storage);
    clearDCCPrefs(storage);
    expect(getDCCPrefs(storage)).toEqual(DEFAULT_DCC_PREFS);
  });
});

// ---------------------------------------------------------------------------
// resolveDCCEndpoint
// ---------------------------------------------------------------------------

describe('resolveDCCEndpoint', () => {
  it('returns null when no query param and no stored pref', () => {
    const storage = createStorage();
    const params = new URLSearchParams('');
    expect(resolveDCCEndpoint(params, storage)).toBeNull();
  });

  it('returns query param when present', () => {
    const storage = createStorage();
    const params = new URLSearchParams('dcc=ws://localhost:1234');
    expect(resolveDCCEndpoint(params, storage)).toBe('ws://localhost:1234');
  });

  it('returns stored endpoint when no query param', () => {
    const { storage } = createSharedStorage();
    setDCCPrefs({ endpoint: 'ws://localhost:9200' }, storage);
    const params = new URLSearchParams('');
    expect(resolveDCCEndpoint(params, storage)).toBe('ws://localhost:9200');
  });

  it('query param takes precedence over stored endpoint', () => {
    const { storage } = createSharedStorage();
    setDCCPrefs({ endpoint: 'ws://localhost:9200' }, storage);
    const params = new URLSearchParams('dcc=ws://localhost:5555');
    expect(resolveDCCEndpoint(params, storage)).toBe('ws://localhost:5555');
  });

  it('returns null when stored endpoint exists but autoConnect is false', () => {
    const { storage } = createSharedStorage();
    setDCCPrefs({ endpoint: 'ws://localhost:9200', autoConnect: false }, storage);
    const params = new URLSearchParams('');
    expect(resolveDCCEndpoint(params, storage)).toBeNull();
  });

  it('returns query param even when autoConnect is false', () => {
    const { storage } = createSharedStorage();
    setDCCPrefs({ endpoint: 'ws://localhost:9200', autoConnect: false }, storage);
    const params = new URLSearchParams('dcc=ws://localhost:5555');
    expect(resolveDCCEndpoint(params, storage)).toBe('ws://localhost:5555');
  });

  it('returns null when stored endpoint is empty string', () => {
    const { storage } = createSharedStorage();
    setDCCPrefs({ endpoint: '' }, storage);
    const params = new URLSearchParams('');
    expect(resolveDCCEndpoint(params, storage)).toBeNull();
  });
});
