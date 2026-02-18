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
});
