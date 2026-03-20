/**
 * DCCSettings - Persisted DCC bridge endpoint preference.
 *
 * Stores the DCC bridge WebSocket URL in localStorage so that artists
 * do not need to append `?dcc=` to the URL every session.
 *
 * Priority order for resolving the DCC endpoint:
 * 1. `?dcc=<url>` query parameter (highest priority)
 * 2. Persisted setting in localStorage
 * 3. No DCC bridge (default)
 */

import { type PreferencesManager, getPreferencesManager } from '../utils/preferences/PreferencesManager';

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

export const DCC_STORAGE_KEY = 'openrv-dcc-endpoint' as const;

// ---------------------------------------------------------------------------
// DCC preferences shape
// ---------------------------------------------------------------------------

export interface DCCPrefs {
  /** WebSocket URL for the DCC bridge (e.g. 'ws://localhost:9200'). Empty string means disabled. */
  endpoint: string;
  /** Whether to auto-connect on page load when a persisted endpoint exists. */
  autoConnect: boolean;
}

export const DEFAULT_DCC_PREFS: DCCPrefs = {
  endpoint: '',
  autoConnect: true,
};

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate and sanitise a raw value into a well-formed DCCPrefs object.
 * Any missing or invalid fields fall back to defaults.
 */
export function sanitizeDCCPrefs(value: unknown): DCCPrefs {
  const out: DCCPrefs = { ...DEFAULT_DCC_PREFS };
  if (!isRecord(value)) return out;

  if (typeof value.endpoint === 'string') {
    out.endpoint = value.endpoint.trim();
  }
  if (typeof value.autoConnect === 'boolean') {
    out.autoConnect = value.autoConnect;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Read / write helpers
// ---------------------------------------------------------------------------

/**
 * Load persisted DCC preferences from storage.
 */
export function getDCCPrefs(storage: PreferencesManager = getPreferencesManager()): DCCPrefs {
  return sanitizeDCCPrefs(storage.getJSON<unknown>(DCC_STORAGE_KEY));
}

/**
 * Persist DCC preferences to storage.
 */
export function setDCCPrefs(prefs: Partial<DCCPrefs>, storage: PreferencesManager = getPreferencesManager()): void {
  const current = getDCCPrefs(storage);
  const merged = sanitizeDCCPrefs({ ...current, ...prefs });
  storage.setJSON(DCC_STORAGE_KEY, merged);
}

/**
 * Remove persisted DCC preferences from storage.
 */
export function clearDCCPrefs(storage: PreferencesManager = getPreferencesManager()): void {
  storage.remove(DCC_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Endpoint resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective DCC bridge URL by checking (in order):
 * 1. The `?dcc=` query parameter
 * 2. The persisted endpoint preference (if autoConnect is enabled)
 *
 * Returns `null` when no DCC bridge should be created.
 */
export function resolveDCCEndpoint(
  searchParams: URLSearchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''),
  storage: PreferencesManager = getPreferencesManager(),
): string | null {
  // 1. Query param takes highest priority
  const queryUrl = searchParams.get('dcc');
  if (queryUrl) return queryUrl;

  // 2. Persisted preference
  const prefs = getDCCPrefs(storage);
  if (prefs.endpoint && prefs.autoConnect) return prefs.endpoint;

  return null;
}
