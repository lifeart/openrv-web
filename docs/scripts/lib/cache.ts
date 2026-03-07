/**
 * Content-hash caching for AI documentation generation.
 *
 * Before each API call, computes SHA-256 of (template content + source file contents).
 * Stores hashes in docs/generated/.cache.json. Skips API call if hash matches.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CACHE_FILE = resolve(import.meta.dirname, '../../generated/.cache.json');

interface CacheEntry {
  hash: string;
  outputPath: string;
  generatedAt: string;
}

type CacheData = Record<string, CacheEntry>;

function loadCache(): CacheData {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(data: CacheData): void {
  const dir = dirname(CACHE_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Compute a SHA-256 hash from template content and source file contents.
 */
export function computeHash(templateContent: string, sourceFiles: Record<string, string>): string {
  const hash = createHash('sha256');
  hash.update(templateContent);

  // Sort keys for deterministic hashing
  const sortedKeys = Object.keys(sourceFiles).sort();
  for (const key of sortedKeys) {
    hash.update(key);
    hash.update(sourceFiles[key]);
  }

  return hash.digest('hex');
}

/**
 * Check if a module's documentation is already up to date.
 *
 * @param moduleKey - Unique key for the module (e.g., "core/ip-image").
 * @param hash - Current content hash.
 * @returns true if the cache matches and the output file still exists.
 */
export function isCached(moduleKey: string, hash: string): boolean {
  const cache = loadCache();
  const entry = cache[moduleKey];
  if (!entry) return false;
  if (entry.hash !== hash) return false;
  // Verify output file still exists
  return existsSync(entry.outputPath);
}

/**
 * Update the cache after a successful generation.
 */
export function updateCache(moduleKey: string, hash: string, outputPath: string): void {
  const cache = loadCache();
  cache[moduleKey] = {
    hash,
    outputPath,
    generatedAt: new Date().toISOString(),
  };
  saveCache(cache);
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  saveCache({});
}
