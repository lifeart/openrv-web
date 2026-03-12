import { describe, it, expect } from 'vitest';
import { parseSemVer, satisfiesMinVersion, ENGINE_VERSION } from './version';

describe('parseSemVer', () => {
  it('parses standard semver string', () => {
    expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('parses semver with pre-release suffix (ignores suffix)', () => {
    expect(parseSemVer('2.0.0-beta.1')).toEqual({ major: 2, minor: 0, patch: 0 });
  });

  it('throws on invalid semver string', () => {
    expect(() => parseSemVer('not-a-version')).toThrow('Invalid semver string');
  });

  it('throws on empty string', () => {
    expect(() => parseSemVer('')).toThrow('Invalid semver string');
  });
});

describe('satisfiesMinVersion', () => {
  it('returns true when versions are equal', () => {
    expect(satisfiesMinVersion('1.0.0', '1.0.0')).toBe(true);
  });

  it('returns true when host major is greater', () => {
    expect(satisfiesMinVersion('2.0.0', '1.0.0')).toBe(true);
  });

  it('returns false when host major is less', () => {
    expect(satisfiesMinVersion('1.0.0', '2.0.0')).toBe(false);
  });

  it('returns true when host minor is greater', () => {
    expect(satisfiesMinVersion('1.2.0', '1.1.0')).toBe(true);
  });

  it('returns false when host minor is less', () => {
    expect(satisfiesMinVersion('1.0.0', '1.1.0')).toBe(false);
  });

  it('returns true when host patch is greater', () => {
    expect(satisfiesMinVersion('1.0.2', '1.0.1')).toBe(true);
  });

  it('returns false when host patch is less', () => {
    expect(satisfiesMinVersion('1.0.0', '1.0.1')).toBe(false);
  });
});

describe('ENGINE_VERSION', () => {
  it('is a valid semver string', () => {
    expect(() => parseSemVer(ENGINE_VERSION)).not.toThrow();
  });
});
