import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_USER_NAME,
  MAX_USER_NAME_LENGTH,
  getPreferredUserName,
  getStoredUserName,
  normalizeUserName,
  setPreferredUserName,
} from './UserIdentity';
import { getCorePreferencesManager, resetCorePreferencesManagerForTests } from './PreferencesManager';

describe('UserIdentity', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCorePreferencesManagerForTests();
  });

  afterEach(() => {
    localStorage.clear();
    resetCorePreferencesManagerForTests();
  });

  describe('normalizeUserName', () => {
    it('UID-001: trims and collapses whitespace', () => {
      expect(normalizeUserName('  Jane   Doe  ')).toBe('Jane Doe');
    });

    it('UID-002: strips control characters', () => {
      expect(normalizeUserName('Jane\u0000\nDoe\u007f')).toBe('Jane Doe');
    });

    it('UID-003: caps the length', () => {
      expect(normalizeUserName('x'.repeat(200))).toHaveLength(MAX_USER_NAME_LENGTH);
    });

    it('UID-004: blank input becomes empty string', () => {
      expect(normalizeUserName('   ')).toBe('');
    });
  });

  describe('get/set', () => {
    it('UID-010: falls back to "User" when nothing is stored', () => {
      expect(getStoredUserName()).toBe('');
      expect(getPreferredUserName()).toBe(DEFAULT_USER_NAME);
      expect(getPreferredUserName('Host')).toBe('Host');
    });

    it('UID-011: persists to GeneralPrefs.userName', () => {
      setPreferredUserName('  Alice  ');
      expect(getCorePreferencesManager().getGeneralPrefs().userName).toBe('Alice');
      expect(getPreferredUserName('Host')).toBe('Alice');
    });

    it('UID-012: survives a fresh PreferencesManager (storage-backed)', () => {
      setPreferredUserName('Bob');
      resetCorePreferencesManagerForTests();
      expect(getPreferredUserName()).toBe('Bob');
    });

    it('UID-013: clearing the name restores the fallback', () => {
      setPreferredUserName('Carol');
      setPreferredUserName('   ');
      expect(getPreferredUserName('Host')).toBe('Host');
    });

    it('UID-014: emits generalPrefsChanged', () => {
      const seen: string[] = [];
      getCorePreferencesManager().on('generalPrefsChanged', (p) => seen.push(p.userName));
      setPreferredUserName('Dana');
      expect(seen).toEqual(['Dana']);
    });
  });
});
