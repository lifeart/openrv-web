/**
 * OCIOVirtualFS — Virtual filesystem for OCIO LUT file references
 *
 * OCIO configs reference external files (LUTs, CLFs, etc.) by relative path.
 * The real OpenColorIO uses OS filesystem access; in browser WASM we need to
 * preload those files and make them available via Emscripten's MEMFS/WORKERFS.
 *
 * This module provides:
 * - URL-based LUT file loading with caching
 * - In-memory file storage for the WASM virtual filesystem
 * - Path resolution for OCIO search_path entries
 * - Batch preloading of all files referenced by a config
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A file entry in the virtual filesystem */
export interface VFSEntry {
  /** Virtual path as OCIO will reference it (e.g. 'luts/srgb.spi3d') */
  path: string;
  /** Raw file data */
  data: Uint8Array;
  /** Where this file came from */
  source: 'url' | 'inline' | 'upload';
  /** Size in bytes */
  size: number;
}

/** Options for loading a file by URL */
export interface VFSLoadOptions {
  /** Base URL to resolve relative paths against */
  baseUrl?: string;
  /** Custom fetch implementation (for testing) */
  fetchFn?: typeof fetch;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/** Result of a batch preload operation */
export interface PreloadResult {
  /** Successfully loaded paths */
  loaded: string[];
  /** Paths that failed to load */
  failed: Array<{ path: string; error: string }>;
}

// ---------------------------------------------------------------------------
// OCIOVirtualFS
// ---------------------------------------------------------------------------

export class OCIOVirtualFS {
  private files: Map<string, VFSEntry> = new Map();
  private disposed = false;

  /**
   * Write a file into the virtual filesystem.
   */
  writeFile(path: string, data: Uint8Array, source: VFSEntry['source'] = 'inline'): void {
    if (this.disposed) throw new Error('OCIOVirtualFS is disposed');
    const normalized = normalizePath(path);
    this.files.set(normalized, {
      path: normalized,
      data,
      source,
      size: data.byteLength,
    });
  }

  /**
   * Read a file from the virtual filesystem.
   * @returns The file data, or null if not found
   */
  readFile(path: string): Uint8Array | null {
    this.ensureNotDisposed();
    const normalized = normalizePath(path);
    return this.files.get(normalized)?.data ?? null;
  }

  /**
   * Check if a file exists in the virtual filesystem.
   */
  hasFile(path: string): boolean {
    this.ensureNotDisposed();
    return this.files.has(normalizePath(path));
  }

  /**
   * Remove a file from the virtual filesystem.
   */
  removeFile(path: string): boolean {
    this.ensureNotDisposed();
    return this.files.delete(normalizePath(path));
  }

  /**
   * List all files in the virtual filesystem.
   */
  listFiles(): VFSEntry[] {
    this.ensureNotDisposed();
    return Array.from(this.files.values());
  }

  /**
   * Get total bytes stored in the virtual filesystem.
   */
  getTotalSize(): number {
    this.ensureNotDisposed();
    let total = 0;
    for (const entry of this.files.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Clear all files.
   */
  clear(): void {
    this.ensureNotDisposed();
    this.files.clear();
  }

  /**
   * Load a file from a URL and store it in the VFS.
   *
   * @param virtualPath - The path OCIO will use to reference this file
   * @param url - URL to fetch the file from
   * @param options - Load options
   */
  async loadFromURL(
    virtualPath: string,
    url: string,
    options: VFSLoadOptions = {},
  ): Promise<void> {
    if (this.disposed) throw new Error('OCIOVirtualFS is disposed');
    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    const response = await fetchFn(url, { signal: options.signal });
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    this.writeFile(virtualPath, new Uint8Array(buffer), 'url');
  }

  /**
   * Load a file from a user upload (File/Blob).
   */
  async loadFromFile(virtualPath: string, file: Blob): Promise<void> {
    if (this.disposed) throw new Error('OCIOVirtualFS is disposed');
    // Use FileReader for broader compatibility (jsdom lacks Blob.arrayBuffer)
    const buffer = await blobToArrayBuffer(file);
    this.writeFile(virtualPath, new Uint8Array(buffer), 'upload');
  }

  /**
   * Batch-preload multiple files by URL.
   * Continues loading even if individual files fail.
   *
   * @param entries - Array of { virtualPath, url } pairs
   * @param options - Shared load options
   * @returns Summary of loaded and failed files
   */
  async preloadBatch(
    entries: Array<{ virtualPath: string; url: string }>,
    options: VFSLoadOptions = {},
  ): Promise<PreloadResult> {
    const loaded: string[] = [];
    const failed: PreloadResult['failed'] = [];

    const promises = entries.map(async ({ virtualPath, url }) => {
      try {
        const resolvedUrl = options.baseUrl
          ? resolveUrl(options.baseUrl, url)
          : url;
        await this.loadFromURL(virtualPath, resolvedUrl, options);
        loaded.push(virtualPath);
      } catch (e) {
        failed.push({
          path: virtualPath,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });

    await Promise.all(promises);
    return { loaded, failed };
  }

  /**
   * Extract LUT file references from an OCIO config YAML text.
   * Parses search_path and file_transform entries.
   *
   * @param configYaml - OCIO config YAML text
   * @returns Array of relative file paths referenced by the config
   */
  extractFileReferences(configYaml: string): string[] {
    const paths: Set<string> = new Set();
    const lines = configYaml.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Match file_transform references: src: path/to/lut.spi3d
      const srcMatch = trimmed.match(/^src:\s*(.+)/);
      if (srcMatch) {
        const path = stripQuotes(srcMatch[1]!.trim());
        if (path && !isAbsolutePath(path)) {
          paths.add(path);
        }
      }

      // Match !<FileTransform> {src: path, ...}
      const ftMatch = trimmed.match(/!<FileTransform>\s*\{[^}]*src:\s*([^,}]+)/);
      if (ftMatch) {
        const path = stripQuotes(ftMatch[1]!.trim());
        if (path && !isAbsolutePath(path)) {
          paths.add(path);
        }
      }
    }

    return Array.from(paths);
  }

  /**
   * Extract search paths from an OCIO config.
   * These are directories where OCIO looks for LUT files.
   */
  extractSearchPaths(configYaml: string): string[] {
    const lines = configYaml.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed.startsWith('search_path:')) {
        const value = stripQuotes(trimmed.substring('search_path:'.length).trim());
        if (value) {
          // Single-line colon-separated form: search_path: luts:shared
          return value.split(':').map(p => p.trim()).filter(Boolean);
        }
        // YAML list form:
        //   search_path:
        //     - luts
        //     - shared
        const paths: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j]!.trim();
          if (next.startsWith('- ')) {
            paths.push(stripQuotes(next.substring(2).trim()));
          } else if (next === '' || next.startsWith('#')) {
            continue; // skip blank lines and comments
          } else if (lines[j]![0] !== ' ' && lines[j]![0] !== '\t') {
            break; // new top-level key
          }
        }
        if (paths.length > 0) return paths.filter(Boolean);
      }
    }
    return [];
  }

  /**
   * Dispose of all resources. VFS cannot be used after this.
   */
  dispose(): void {
    this.files.clear();
    this.disposed = true;
  }

  private ensureNotDisposed(): void {
    if (this.disposed) throw new Error('OCIOVirtualFS is disposed');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a virtual path: forward slashes, no leading slash, collapse ../ and ./
 */
function normalizePath(path: string): string {
  // Convert backslashes to forward slashes
  let normalized = path.replace(/\\/g, '/');
  // Remove leading slash
  if (normalized.startsWith('/')) {
    normalized = normalized.substring(1);
  }
  // Collapse redundant slashes
  normalized = normalized.replace(/\/+/g, '/');
  // Resolve . and .. segments
  const parts = normalized.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.') {
      resolved.push(part);
    }
  }
  normalized = resolved.join('/');
  // Remove trailing slash
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

/**
 * Convert a Blob to ArrayBuffer using FileReader (broader compatibility).
 */
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Resolve a relative URL against a base URL.
 */
function resolveUrl(base: string, relative: string): string {
  // If relative is already absolute, return as-is
  if (relative.startsWith('http://') || relative.startsWith('https://')) {
    return relative;
  }
  // Ensure base ends with /
  const baseWithSlash = base.endsWith('/') ? base : base + '/';
  return baseWithSlash + relative;
}
