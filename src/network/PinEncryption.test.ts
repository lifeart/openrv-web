import { describe, expect, it } from 'vitest';
import {
  isValidPinCode,
  normalizePinCode,
  encryptSessionStateWithPin,
  decryptSessionStateWithPin,
} from './PinEncryption';

describe('PinEncryption', () => {
  it('PEN-001: normalizePinCode trims surrounding whitespace', () => {
    expect(normalizePinCode(' 1234 ')).toBe('1234');
  });

  it('PEN-002: isValidPinCode accepts 4-10 digits only', () => {
    expect(isValidPinCode('1234')).toBe(true);
    expect(isValidPinCode('1234567890')).toBe(true);
    expect(isValidPinCode('123')).toBe(false);
    expect(isValidPinCode('12345678901')).toBe(false);
    expect(isValidPinCode('12ab')).toBe(false);
  });

  it('PEN-003: encrypt/decrypt round-trip recovers original state', async () => {
    const plaintext = 's=ZXhhbXBsZS1zZXNzaW9uLXN0YXRl';
    const pin = '123456';

    const encrypted = await encryptSessionStateWithPin(plaintext, pin);
    const decrypted = await decryptSessionStateWithPin(encrypted, pin);

    expect(decrypted).toBe(plaintext);
  });

  it('PEN-004: decrypt with wrong pin rejects', async () => {
    const plaintext = 'state';
    const encrypted = await encryptSessionStateWithPin(plaintext, '123456');

    await expect(decryptSessionStateWithPin(encrypted, '654321'))
      .rejects
      .toThrow('Failed to decrypt state payload');
  });

  // ---------------------------------------------------------------------------
  // PIN validation edge cases
  // ---------------------------------------------------------------------------

  it('PEN-005: isValidPinCode rejects exactly 3 digits (below minimum)', () => {
    expect(isValidPinCode('123')).toBe(false);
  });

  it('PEN-006: isValidPinCode accepts exactly 4 digits (minimum)', () => {
    expect(isValidPinCode('1234')).toBe(true);
  });

  it('PEN-007: isValidPinCode accepts exactly 10 digits (maximum)', () => {
    expect(isValidPinCode('1234567890')).toBe(true);
  });

  it('PEN-008: isValidPinCode rejects exactly 11 digits (above maximum)', () => {
    expect(isValidPinCode('12345678901')).toBe(false);
  });

  it('PEN-009: isValidPinCode rejects empty string', () => {
    expect(isValidPinCode('')).toBe(false);
  });

  it('PEN-010: isValidPinCode rejects letters mixed with digits', () => {
    expect(isValidPinCode('12ab')).toBe(false);
    expect(isValidPinCode('abcd')).toBe(false);
  });

  it('PEN-011: isValidPinCode rejects special characters', () => {
    expect(isValidPinCode('12-34')).toBe(false);
    expect(isValidPinCode('1234!')).toBe(false);
    expect(isValidPinCode('12.34')).toBe(false);
  });

  it('PEN-012: isValidPinCode rejects whitespace-only input', () => {
    expect(isValidPinCode('    ')).toBe(false);
  });

  it('PEN-013: normalizePinCode handles multiple spaces and tabs', () => {
    expect(normalizePinCode('  \t 1234 \t  ')).toBe('1234');
  });

  it('PEN-014: isValidPinCode validates after normalization (leading/trailing spaces)', () => {
    // normalizePinCode trims, so " 1234 " becomes "1234" which is valid
    expect(isValidPinCode(' 1234 ')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Encrypt with invalid PIN
  // ---------------------------------------------------------------------------

  it('PEN-015: encrypt rejects PIN shorter than 4 digits', async () => {
    await expect(encryptSessionStateWithPin('state', '123'))
      .rejects.toThrow('PIN code must be 4 to 10 digits');
  });

  it('PEN-016: encrypt rejects PIN with letters', async () => {
    await expect(encryptSessionStateWithPin('state', 'abcd'))
      .rejects.toThrow('PIN code must be 4 to 10 digits');
  });

  // ---------------------------------------------------------------------------
  // Large payload encryption
  // ---------------------------------------------------------------------------

  it('PEN-017: encrypt/decrypt round-trip with large payload', async () => {
    const largeState = JSON.stringify({
      data: 'x'.repeat(10_000),
      nested: { array: Array.from({ length: 100 }, (_, i) => i) },
    });
    const pin = '5678';

    const encrypted = await encryptSessionStateWithPin(largeState, pin);
    const decrypted = await decryptSessionStateWithPin(encrypted, pin);

    expect(decrypted).toBe(largeState);
  });

  it('PEN-018: encrypt/decrypt round-trip with empty plaintext', async () => {
    const pin = '1234';
    const encrypted = await encryptSessionStateWithPin('', pin);
    const decrypted = await decryptSessionStateWithPin(encrypted, pin);
    expect(decrypted).toBe('');
  });

  it('PEN-019: encrypt/decrypt round-trip with unicode content', async () => {
    const unicodeState = '\u00e9\u00e8\u00ea \u4e16\u754c \ud83c\udf1f';
    const pin = '9999';
    const encrypted = await encryptSessionStateWithPin(unicodeState, pin);
    const decrypted = await decryptSessionStateWithPin(encrypted, pin);
    expect(decrypted).toBe(unicodeState);
  });

  // ---------------------------------------------------------------------------
  // Payload format validation
  // ---------------------------------------------------------------------------

  it('PEN-020: encrypted payload has correct structure', async () => {
    const encrypted = await encryptSessionStateWithPin('test', '1234');
    expect(encrypted.version).toBe(1);
    expect(encrypted.algorithm).toBe('AES-GCM');
    expect(typeof encrypted.salt).toBe('string');
    expect(typeof encrypted.iv).toBe('string');
    expect(typeof encrypted.ciphertext).toBe('string');
    // Salt and IV should be non-empty
    expect(encrypted.salt.length).toBeGreaterThan(0);
    expect(encrypted.iv.length).toBeGreaterThan(0);
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);
  });

  it('PEN-021: two encryptions of same plaintext produce different ciphertexts', async () => {
    const plaintext = 'same-state-data';
    const pin = '1234';
    const enc1 = await encryptSessionStateWithPin(plaintext, pin);
    const enc2 = await encryptSessionStateWithPin(plaintext, pin);

    // Salt and IV should differ (random)
    expect(enc1.salt).not.toBe(enc2.salt);
    expect(enc1.iv).not.toBe(enc2.iv);
    // Ciphertext should also differ
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });

  it('PEN-022: decrypt rejects unsupported algorithm', async () => {
    const encrypted = await encryptSessionStateWithPin('test', '1234');
    const tampered = { ...encrypted, algorithm: 'AES-CBC' as 'AES-GCM' };

    await expect(decryptSessionStateWithPin(tampered, '1234'))
      .rejects.toThrow('Unsupported encrypted state payload format');
  });

  it('PEN-023: decrypt rejects unsupported version', async () => {
    const encrypted = await encryptSessionStateWithPin('test', '1234');
    const tampered = { ...encrypted, version: 2 as 1 };

    await expect(decryptSessionStateWithPin(tampered, '1234'))
      .rejects.toThrow('Unsupported encrypted state payload format');
  });

  it('PEN-024: decrypt with tampered ciphertext fails', async () => {
    const encrypted = await encryptSessionStateWithPin('test', '1234');
    // Modify ciphertext
    const tampered = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -4) + 'AAAA',
    };

    await expect(decryptSessionStateWithPin(tampered, '1234'))
      .rejects.toThrow('Failed to decrypt state payload');
  });

  // ---------------------------------------------------------------------------
  // Concurrent operations
  // ---------------------------------------------------------------------------

  it('PEN-025: concurrent encrypt/decrypt operations succeed independently', async () => {
    const pin = '123456';
    const states = ['state-a', 'state-b', 'state-c', 'state-d', 'state-e'];

    // Encrypt all concurrently
    const encryptedAll = await Promise.all(
      states.map(s => encryptSessionStateWithPin(s, pin))
    );

    // Decrypt all concurrently
    const decryptedAll = await Promise.all(
      encryptedAll.map(e => decryptSessionStateWithPin(e, pin))
    );

    expect(decryptedAll).toEqual(states);
  });

  it('PEN-026: different PINs produce different ciphertexts', async () => {
    const plaintext = 'shared-state';
    const enc1 = await encryptSessionStateWithPin(plaintext, '1234');
    const enc2 = await encryptSessionStateWithPin(plaintext, '5678');

    // Even with same plaintext, different PINs derive different keys
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });
});
