/**
 * UserIdentity - the local user's display name.
 *
 * Thin read/write helpers over `GeneralPrefs.userName` so every surface that
 * attributes work to "you" (note authorship, collaboration room presence)
 * resolves the name the same way and falls back consistently when the user
 * has not set one.
 */

import { getCorePreferencesManager } from './PreferencesManager';
import { Logger } from '../utils/Logger';

const logger = new Logger('UserIdentity');

/** Fallback used when no name has been configured. */
export const DEFAULT_USER_NAME = 'User';

/** Maximum stored length; keeps presence badges and note headers readable. */
export const MAX_USER_NAME_LENGTH = 64;

/**
 * Normalize a user-supplied display name: strip control characters, collapse
 * whitespace, trim and cap the length. Returns '' for blank input.
 */
export function normalizeUserName(raw: string): string {
  let withoutControls = '';
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    withoutControls += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  return withoutControls.replace(/\s+/g, ' ').trim().slice(0, MAX_USER_NAME_LENGTH).trim();
}

/**
 * The configured display name, or `''` when none is set.
 */
export function getStoredUserName(): string {
  try {
    return normalizeUserName(getCorePreferencesManager().getGeneralPrefs().userName ?? '');
  } catch (error) {
    logger.debug('getStoredUserName: preferences unavailable', { error });
    return '';
  }
}

/**
 * The display name to use for attribution, falling back to `fallback`
 * (default `'User'`) when the user has not configured one.
 */
export function getPreferredUserName(fallback: string = DEFAULT_USER_NAME): string {
  return getStoredUserName() || fallback;
}

/**
 * Persist the display name. Blank input clears it (callers then fall back to
 * their default).
 */
export function setPreferredUserName(name: string): void {
  const normalized = normalizeUserName(name);
  try {
    getCorePreferencesManager().setGeneralPrefs({ userName: normalized });
  } catch (error) {
    logger.warn('setPreferredUserName: failed to persist user name', { error });
  }
}
