import type { EncryptedSessionStatePayload } from './types';

const PBKDF2_ITERATIONS = 250_000;
const AES_KEY_LENGTH = 256;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function requireCryptoSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto SubtleCrypto is not available in this environment.');
  }
  return subtle;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  let b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function normalizePinCode(pinCode: string): string {
  return pinCode.trim();
}

export function isValidPinCode(pinCode: string): boolean {
  return /^[0-9]{4,10}$/.test(normalizePinCode(pinCode));
}

async function deriveKey(pinCode: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = requireCryptoSubtle();
  const normalizedPin = normalizePinCode(pinCode);
  if (!isValidPinCode(normalizedPin)) {
    throw new Error('PIN code must be 4 to 10 digits.');
  }

  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(normalizedPin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSessionStateWithPin(
  plainState: string,
  pinCode: string
): Promise<EncryptedSessionStatePayload> {
  const subtle = requireCryptoSubtle();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(pinCode, salt);
  const encoder = new TextEncoder();

  const ciphertextBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainState)
  );

  return {
    version: 1,
    algorithm: 'AES-GCM',
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertextBuffer)),
  };
}

export async function decryptSessionStateWithPin(
  encryptedPayload: EncryptedSessionStatePayload,
  pinCode: string
): Promise<string> {
  const subtle = requireCryptoSubtle();
  if (encryptedPayload.algorithm !== 'AES-GCM' || encryptedPayload.version !== 1) {
    throw new Error('Unsupported encrypted state payload format.');
  }

  const salt = fromBase64Url(encryptedPayload.salt);
  const iv = fromBase64Url(encryptedPayload.iv);
  const ciphertext = fromBase64Url(encryptedPayload.ciphertext);
  const key = await deriveKey(pinCode, salt);

  let plainBuffer: ArrayBuffer;
  try {
    plainBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error('Failed to decrypt state payload. PIN may be incorrect.');
  }

  return new TextDecoder().decode(plainBuffer);
}
