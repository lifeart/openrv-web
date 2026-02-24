/**
 * TextureCacheManager - LRU cache for WebGL textures
 *
 * Manages a pool of reusable WebGL textures to reduce allocation overhead
 * during playback and rendering. Uses an LRU eviction policy.
 */

import type { ManagerBase } from '../core/ManagerBase';

/**
 * Configuration for the texture cache
 */
export interface CacheConfig {
  /** Maximum memory usage in bytes (default: 512MB) */
  maxMemoryBytes: number;
  /** Maximum number of texture entries (default: 100) */
  maxEntries: number;
}

/**
 * Internal cache entry tracking texture metadata
 */
interface CacheEntry {
  texture: WebGLTexture;
  width: number;
  height: number;
  format: number;
  type: number;
  internalFormat: number;
  sizeBytes: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxMemoryBytes: 512 * 1024 * 1024, // 512MB
  maxEntries: 100,
};

/**
 * Calculates approximate texture memory size based on dimensions and format
 */
function calculateTextureSize(
  width: number,
  height: number,
  internalFormat: number,
  gl: WebGL2RenderingContext
): number {
  let bytesPerPixel = 4; // Default RGBA8

  // Estimate based on internal format
  switch (internalFormat) {
    case gl.R8:
      bytesPerPixel = 1;
      break;
    case gl.RG8:
      bytesPerPixel = 2;
      break;
    case gl.RGB8:
      bytesPerPixel = 3;
      break;
    case gl.RGBA8:
      bytesPerPixel = 4;
      break;
    case gl.R16F:
      bytesPerPixel = 2;
      break;
    case gl.RG16F:
      bytesPerPixel = 4;
      break;
    case gl.RGB16F:
      bytesPerPixel = 6;
      break;
    case gl.RGBA16F:
      bytesPerPixel = 8;
      break;
    case gl.R32F:
      bytesPerPixel = 4;
      break;
    case gl.RG32F:
      bytesPerPixel = 8;
      break;
    case gl.RGB32F:
      bytesPerPixel = 12;
      break;
    case gl.RGBA32F:
      bytesPerPixel = 16;
      break;
    case gl.R16UI:
    case gl.R16I:
      bytesPerPixel = 2;
      break;
    case gl.RG16UI:
    case gl.RG16I:
      bytesPerPixel = 4;
      break;
    case gl.RGB16UI:
    case gl.RGB16I:
      bytesPerPixel = 6;
      break;
    case gl.RGBA16UI:
    case gl.RGBA16I:
      bytesPerPixel = 8;
      break;
  }

  return width * height * bytesPerPixel;
}

/**
 * TextureCacheManager manages a pool of reusable WebGL textures
 */
export class TextureCacheManager implements ManagerBase {
  private gl: WebGL2RenderingContext;
  private config: CacheConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private currentMemoryUsage = 0;
  private contextLost = false;
  private canvas: HTMLCanvasElement | null = null;
  private boundContextLostHandler: ((e: Event) => void) | null = null;
  private boundContextRestoredHandler: ((e: Event) => void) | null = null;

  constructor(gl: WebGL2RenderingContext, config?: Partial<CacheConfig>) {
    this.gl = gl;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Set up context loss handling
    this.canvas = gl.canvas as HTMLCanvasElement | null;
    if (this.canvas) {
      this.boundContextLostHandler = (e: Event) => {
        e.preventDefault(); // Allow context restoration
        this.handleContextLost();
      };
      this.boundContextRestoredHandler = () => {
        this.handleContextRestored();
      };
      this.canvas.addEventListener('webglcontextlost', this.boundContextLostHandler);
      this.canvas.addEventListener('webglcontextrestored', this.boundContextRestoredHandler);
    }
  }

  /**
   * Check if the WebGL context is valid (not lost)
   */
  isContextValid(): boolean {
    return !this.contextLost && !this.gl.isContextLost();
  }

  /**
   * Handle WebGL context loss - all textures become invalid
   */
  private handleContextLost(): void {
    this.contextLost = true;
    // Clear cache entries but don't try to delete textures (they're already invalid)
    this.cache.clear();
    this.currentMemoryUsage = 0;
  }

  /**
   * Handle WebGL context restoration
   */
  private handleContextRestored(): void {
    this.contextLost = false;
    // Cache is already cleared, new textures will be created on demand
  }

  /**
   * Get or create a texture for the given key and dimensions
   *
   * If a texture with matching key exists and has the same dimensions,
   * it is returned for reuse. Otherwise, a new texture is created.
   *
   * @param key - Unique identifier for the texture (e.g., frame number, source ID)
   * @param width - Texture width in pixels
   * @param height - Texture height in pixels
   * @param internalFormat - WebGL internal format (default: RGBA8)
   * @param format - WebGL format (default: RGBA)
   * @param type - WebGL data type (default: UNSIGNED_BYTE)
   * @returns The WebGL texture
   */
  getTexture(
    key: string,
    width: number,
    height: number,
    internalFormat?: number,
    format?: number,
    type?: number
  ): WebGLTexture {
    // Check for context loss
    if (this.contextLost) {
      throw new Error('WebGL context lost - cannot create texture');
    }

    const gl = this.gl;
    const iFormat = internalFormat ?? gl.RGBA8;
    const fmt = format ?? gl.RGBA;
    const dataType = type ?? gl.UNSIGNED_BYTE;

    // Check for existing entry
    const existing = this.cache.get(key);
    if (existing) {
      // Check if dimensions match
      if (
        existing.width === width &&
        existing.height === height &&
        existing.internalFormat === iFormat
      ) {
        // Move to end (MRU position) and return existing texture
        this.cache.delete(key);
        this.cache.set(key, existing);
        return existing.texture;
      }

      // Dimensions changed - delete old texture and create new one
      this.deleteEntry(key);
    }

    // Ensure we have space for the new texture
    const newSize = calculateTextureSize(width, height, iFormat, gl);
    this.ensureCapacity(newSize);

    // Create new texture
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create WebGL texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Allocate texture storage
    gl.texImage2D(gl.TEXTURE_2D, 0, iFormat, width, height, 0, fmt, dataType, null);

    gl.bindTexture(gl.TEXTURE_2D, null);

    // Store in cache
    const entry: CacheEntry = {
      texture,
      width,
      height,
      format: fmt,
      type: dataType,
      internalFormat: iFormat,
      sizeBytes: newSize,
    };
    this.cache.set(key, entry);
    this.currentMemoryUsage += newSize;

    return texture;
  }

  /**
   * Update texture data for an existing cached texture
   *
   * Uses texSubImage2D for efficient updates when dimensions match.
   *
   * @param key - The texture key
   * @param data - The pixel data to upload
   * @returns true if update succeeded, false if texture not found
   */
  updateTexture(key: string, data: ArrayBufferView | ImageData | HTMLCanvasElement | HTMLImageElement): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);

    if (data instanceof ImageData) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        data.width,
        data.height,
        entry.format,
        entry.type,
        data.data
      );
    } else if (data instanceof HTMLCanvasElement || data instanceof HTMLImageElement) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, entry.format, entry.type, data);
    } else {
      // ArrayBufferView
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        entry.width,
        entry.height,
        entry.format,
        entry.type,
        data
      );
    }

    gl.bindTexture(gl.TEXTURE_2D, null);

    // Move to end (MRU position)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return true;
  }

  /**
   * Check if a texture exists in the cache
   */
  hasTexture(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get the texture entry metadata (for debugging/monitoring)
   */
  getTextureInfo(key: string): { width: number; height: number; sizeBytes: number } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    return {
      width: entry.width,
      height: entry.height,
      sizeBytes: entry.sizeBytes,
    };
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryUsage(): { used: number; max: number; entries: number } {
    return {
      used: this.currentMemoryUsage,
      max: this.config.maxMemoryBytes,
      entries: this.cache.size,
    };
  }

  /**
   * Remove a specific texture from the cache
   */
  remove(key: string): boolean {
    return this.deleteEntry(key);
  }

  /**
   * Clear all cached textures
   */
  clear(): void {
    const keys = [...this.cache.keys()];
    for (const key of keys) {
      this.deleteEntry(key);
    }
  }

  /**
   * Dispose of the cache manager and release all resources
   */
  dispose(): void {
    // Remove context loss listeners
    if (this.canvas) {
      if (this.boundContextLostHandler) {
        this.canvas.removeEventListener('webglcontextlost', this.boundContextLostHandler);
        this.boundContextLostHandler = null;
      }
      if (this.boundContextRestoredHandler) {
        this.canvas.removeEventListener('webglcontextrestored', this.boundContextRestoredHandler);
        this.boundContextRestoredHandler = null;
      }
      this.canvas = null;
    }

    this.clear();
  }

  /**
   * Ensure there is capacity for a new texture of the given size
   */
  private ensureCapacity(requiredSize: number): void {
    // Check entry count limit
    while (this.cache.size >= this.config.maxEntries && this.cache.size > 0) {
      this.evictLRU();
    }

    // Check memory limit
    while (
      this.currentMemoryUsage + requiredSize > this.config.maxMemoryBytes &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }
  }

  /**
   * Evict the least recently used cache entry
   */
  private evictLRU(): void {
    const oldest = this.cache.keys().next().value;
    if (oldest !== undefined) {
      this.deleteEntry(oldest);
    }
  }

  /**
   * Delete a cache entry and free its resources
   */
  private deleteEntry(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.gl.deleteTexture(entry.texture);
    this.currentMemoryUsage -= entry.sizeBytes;
    this.cache.delete(key);
    return true;
  }
}
