/**
 * MediaCacheKey - Cache key generation using SHA-256 of file metadata + content prefix.
 *
 * Produces a deterministic key from a File object by hashing:
 *   `${file.name}|${file.size}|${file.lastModified}|${first64kHash}`
 *
 * Falls back to a simpler key when crypto.subtle is unavailable (e.g. insecure contexts).
 */

import { Logger } from '../utils/Logger';

const log = new Logger('MediaCacheKey');

/** Number of leading bytes used to fingerprint file content. */
const CONTENT_PREFIX_BYTES = 65536; // 64 KB

/** Memoization cache – one key per File identity. */
const memo = new WeakMap<File, string>();

/**
 * Injectable SubtleCrypto instance. When non-null, `computeCacheKey` uses
 * this instead of `globalThis.crypto?.subtle`.
 */
let _subtleOverride: SubtleCrypto | null = null;

/**
 * Set or clear the SubtleCrypto override.
 * Primarily used by tests running in environments (jsdom) where the global
 * `crypto.subtle` is unavailable.
 */
export function setSubtleCrypto(subtle: SubtleCrypto | null): void {
  _subtleOverride = subtle;
}

/**
 * Resolve the SubtleCrypto implementation to use.
 */
function getSubtle(): SubtleCrypto | undefined {
  if (_subtleOverride) return _subtleOverride;
  try {
    return globalThis.crypto?.subtle;
  } catch {
    return undefined;
  }
}

/**
 * Convert an ArrayBuffer to a hex-encoded string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hexParts: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hexParts.push(bytes[i]!.toString(16).padStart(2, '0'));
  }
  return hexParts.join('');
}

/**
 * Compute a deterministic cache key for a File.
 *
 * The key is the hex-encoded SHA-256 of:
 *   `name|size|lastModified|sha256(first64KB)`
 *
 * When `crypto.subtle` is unavailable the function falls back to a simpler
 * (but still unique-enough) key built from metadata only.
 */
export async function computeCacheKey(file: File): Promise<string> {
  const cached = memo.get(file);
  if (cached !== undefined) {
    return cached;
  }

  let key: string;

  try {
    const subtle = getSubtle();
    if (!subtle) {
      throw new Error('crypto.subtle unavailable');
    }

    // Read first 64 KB of the file.
    // Prefer slice() to avoid reading entire large files into memory.
    // Fall back to full-file read when slice().arrayBuffer() is unavailable (e.g. jsdom).
    // Wrap in Uint8Array to ensure cross-realm compatibility (e.g. jsdom + Node crypto).
    let rawPrefix: ArrayBuffer;
    const sliced = file.slice(0, CONTENT_PREFIX_BYTES);
    if (typeof sliced.arrayBuffer === 'function') {
      rawPrefix = await sliced.arrayBuffer();
    } else {
      const full = await file.arrayBuffer();
      rawPrefix = full.slice(0, Math.min(full.byteLength, CONTENT_PREFIX_BYTES));
    }
    const contentBytes = new Uint8Array(rawPrefix.byteLength);
    contentBytes.set(new Uint8Array(rawPrefix));

    // Hash the content prefix
    const contentHash = bufferToHex(
      await subtle.digest('SHA-256', contentBytes),
    );

    // Build the composite string and hash it
    const composite = `${file.name}|${file.size}|${file.lastModified}|${contentHash}`;
    const encoder = new TextEncoder();
    const compositeHash = bufferToHex(
      await subtle.digest('SHA-256', encoder.encode(composite)),
    );

    key = compositeHash;
  } catch (_err) {
    // Fallback: metadata-only key (still reasonably unique for local files)
    log.warn('crypto.subtle unavailable – using metadata-only cache key');
    key = `fallback-${file.name}-${file.size}-${file.lastModified}`;
  }

  memo.set(file, key);
  return key;
}
