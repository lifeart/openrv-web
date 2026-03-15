/**
 * Image Sequence Loader
 * Handles parsing, sorting, and loading of numbered image sequences
 */

import { SUPPORTED_IMAGE_EXTENSIONS, isDecoderBackedExtension } from './SupportedMediaFormats';
import { decoderRegistry } from '../../formats/DecoderRegistry';

/** Decoded HDR/pro-format frame data preserved as full-precision Float32Array */
export interface DecodedFrameData {
  data: Float32Array;
  width: number;
  height: number;
  channels: number;
  colorSpace: string;
  formatName: string;
}

export interface SequenceFrame {
  index: number; // 0-based frame index
  frameNumber: number; // Original frame number from filename
  file: File;
  url?: string; // Object URL when loaded
  image?: ImageBitmap;
  decodedData?: DecodedFrameData; // HDR decoded data (preserved full precision)
}

export interface SequenceInfo {
  name: string;
  pattern: string; // Detected pattern like "frame_####.png"
  frames: SequenceFrame[];
  startFrame: number;
  endFrame: number;
  width: number;
  height: number;
  fps: number;
  missingFrames: number[]; // List of missing frame numbers in the sequence
}

// Common frame number patterns
const FRAME_PATTERNS = [
  /(\d+)(?=\.[^.]+$)/, // Any numbers before extension: file123.png
  /[._-](\d+)(?=\.[^.]+$)/, // Separator then numbers: file_001.png, file-001.png, file.001.png
  /(\d{3,})(?=\.[^.]+$)/, // 3+ digit numbers: file0001.png
];

const IMAGE_EXTENSIONS = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);

/**
 * Filter files to only include supported image formats
 */
export function filterImageFiles(files: File[]): File[] {
  return files.filter((file) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return IMAGE_EXTENSIONS.has(ext);
  });
}

/**
 * Extract frame number from filename
 */
export function extractFrameNumber(filename: string): number | null {
  for (const pattern of FRAME_PATTERNS) {
    const match = filename.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}

/**
 * Detect the naming pattern from a list of filenames
 */
export function detectPattern(filenames: string[]): string | null {
  if (filenames.length === 0) return null;

  const first = filenames[0]!;
  const frameNum = extractFrameNumber(first);
  if (frameNum === null) return null;

  // Get file extension - must have a dot for valid sequence naming
  const lastDotIdx = first.lastIndexOf('.');
  if (lastDotIdx === -1) return null;

  const ext = first.slice(lastDotIdx + 1);
  const nameWithoutExt = first.slice(0, lastDotIdx);

  // Find the actual digit sequence at the end of the filename (before extension)
  // This handles padded numbers correctly (e.g., "0001" not just "1")
  const digitMatch = nameWithoutExt.match(/(\d+)$/);
  if (!digitMatch) return null;

  const fullNumStr = digitMatch[1]!;
  const actualFrameNum = parseInt(fullNumStr, 10);

  // Verify it matches what we extracted
  if (actualFrameNum !== frameNum) return null;

  const padding = fullNumStr.length;
  const idx = nameWithoutExt.lastIndexOf(fullNumStr);
  if (idx === -1) return null;

  const pattern = nameWithoutExt.slice(0, idx) + '#'.repeat(padding) + '.' + ext;
  return pattern;
}

/**
 * Sort files by their frame numbers
 */
export function sortByFrameNumber(files: File[]): SequenceFrame[] {
  const frames: SequenceFrame[] = [];

  for (const file of files) {
    const frameNumber = extractFrameNumber(file.name);
    if (frameNumber !== null) {
      frames.push({
        index: 0, // Will be set after sorting
        frameNumber,
        file,
      });
    }
  }

  // Sort by frame number
  frames.sort((a, b) => a.frameNumber - b.frameNumber);

  // Assign sequential indices
  frames.forEach((frame, idx) => {
    frame.index = idx;
  });

  return frames;
}

/**
 * Get the file extension (lowercase, no dot) from a filename.
 */
function getExtension(filename: string): string {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx === filename.length - 1) return '';
  return filename.slice(dotIdx + 1).toLowerCase();
}

/**
 * Convert a Float32Array RGBA decode result into an ImageBitmap.
 * The decoder output has linear float values (0-1+ for HDR).
 * We clamp to [0,1] and convert to 8-bit RGBA for the ImageBitmap.
 */
export async function float32ToImageBitmap(
  data: Float32Array,
  width: number,
  height: number,
  channels: number,
): Promise<ImageBitmap> {
  const pixelCount = width * height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);

  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * channels;
    const dstIdx = i * 4;
    // Clamp to [0,1] and convert to 8-bit
    rgba[dstIdx] = Math.round(Math.min(1, Math.max(0, data[srcIdx]!)) * 255);
    rgba[dstIdx + 1] = Math.round(Math.min(1, Math.max(0, data[srcIdx + 1]!)) * 255);
    rgba[dstIdx + 2] = Math.round(Math.min(1, Math.max(0, data[srcIdx + 2]!)) * 255);
    rgba[dstIdx + 3] = channels >= 4 ? Math.round(Math.min(1, Math.max(0, data[srcIdx + 3]!)) * 255) : 255;
  }

  const imageData = new ImageData(rgba, width, height);
  return createImageBitmap(imageData);
}

/**
 * Check if a frame has been loaded (either as ImageBitmap or decoded HDR data).
 */
export function isFrameLoaded(frame: SequenceFrame): boolean {
  return frame.image !== undefined || frame.decodedData !== undefined;
}

/**
 * Load a single frame image using background decoders.
 *
 * For decoder-backed formats (EXR, DPX, Cineon, HDR, TIFF, etc.), the full-precision
 * Float32Array is stored in `frame.decodedData` to preserve HDR information. An
 * ImageBitmap preview is also generated and stored in `frame.image` for dimension
 * queries and preview/thumbnail use.
 *
 * For browser-native formats (PNG, JPEG, WebP, etc.), `createImageBitmap()` is used
 * directly and only `frame.image` is populated.
 *
 * @param frame - The frame to load
 * @param signal - Optional AbortSignal to cancel the load operation
 */
export async function loadFrameImage(frame: SequenceFrame, signal?: AbortSignal): Promise<ImageBitmap> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  }

  if (frame.image) {
    return frame.image;
  }

  const ext = getExtension(frame.file.name);

  try {
    let bitmap: ImageBitmap;

    if (isDecoderBackedExtension(ext)) {
      // Route through the decoder registry for pro formats (EXR, DPX, Cineon, HDR, TIFF, etc.)
      const buffer = await frame.file.arrayBuffer();

      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
      }

      const result = await decoderRegistry.detectAndDecode(buffer);
      if (!result) {
        throw new Error(`No decoder found for format: ${ext}`);
      }

      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
      }

      // Store full-precision decoded data for the HDR rendering path
      frame.decodedData = {
        data: result.data,
        width: result.width,
        height: result.height,
        channels: result.channels,
        colorSpace: result.colorSpace,
        formatName: result.formatName,
      };

      // Also generate an ImageBitmap preview for dimension queries and fallback display
      bitmap = await float32ToImageBitmap(result.data, result.width, result.height, result.channels);
    } else {
      // Browser-native formats (PNG, JPEG, WebP, etc.) use createImageBitmap directly.
      // createImageBitmap runs on a background thread and doesn't block the main thread.
      // We explicitly disable colorspace conversion and premultiplied alpha so we get raw pixels.
      bitmap = await createImageBitmap(frame.file, {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
    }

    if (signal?.aborted) {
      bitmap.close();
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    frame.image = bitmap;
    return bitmap;
  } catch (err: any) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }
    throw new Error(`Failed to load frame: ${frame.file.name} - ${err.message}`);
  }
}

/**
 * Preload a range of frames around the current frame
 * @param frames - Array of sequence frames
 * @param currentIndex - The current frame index to center preloading around
 * @param windowSize - Number of frames on each side to preload (default: 5)
 * @param signal - Optional AbortSignal to cancel remaining load operations
 */
export async function preloadFrames(
  frames: SequenceFrame[],
  currentIndex: number,
  windowSize: number = 5,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  }

  const start = Math.max(0, currentIndex - windowSize);
  const end = Math.min(frames.length - 1, currentIndex + windowSize);

  const loadPromises: Promise<ImageBitmap>[] = [];

  for (let i = start; i <= end; i++) {
    const frame = frames[i];
    if (frame && !isFrameLoaded(frame)) {
      loadPromises.push(loadFrameImage(frame, signal));
    }
  }

  await Promise.allSettled(loadPromises);
}

/**
 * Release memory for frames outside the cache window
 */
export function releaseDistantFrames(frames: SequenceFrame[], currentIndex: number, keepWindow: number = 10): void {
  for (let i = 0; i < frames.length; i++) {
    const distance = Math.abs(i - currentIndex);
    if (distance > keepWindow) {
      const frame = frames[i];
      if (frame) {
        if (frame.image) {
          frame.image.close();
          frame.image = undefined;
        }
        if (frame.decodedData) {
          frame.decodedData = undefined;
        }
        if (frame.url) {
          URL.revokeObjectURL(frame.url);
          frame.url = undefined;
        }
      }
    }
  }
}

/**
 * Create a SequenceInfo from a list of files
 */
export async function createSequenceInfo(files: File[], fps: number = 24): Promise<SequenceInfo | null> {
  // Filter to image files only
  const imageFiles = filterImageFiles(files);
  if (imageFiles.length === 0) return null;

  // Sort by frame number
  const frames = sortByFrameNumber(imageFiles);
  if (frames.length === 0) return null;

  // Detect pattern
  const pattern = detectPattern(imageFiles.map((f) => f.name)) || 'unknown';

  // Load first frame to get dimensions
  const firstFrame = frames[0]!;
  const firstImage = await loadFrameImage(firstFrame);

  // Get base name (remove frame numbers and extension)
  const firstFile = frames[0]!.file;
  const baseName = firstFile.name.replace(/[._-]?\d+(?=\.[^.]+$)/, '').replace(/\.[^.]+$/, '');

  // Detect missing frames in the sequence
  const missingFrames = detectMissingFrames(frames);

  return {
    name: baseName || 'sequence',
    pattern,
    frames,
    startFrame: frames[0]!.frameNumber,
    endFrame: frames[frames.length - 1]!.frameNumber,
    width: firstImage.width,
    height: firstImage.height,
    fps,
    missingFrames,
  };
}

/**
 * Detect missing frames in a sequence by finding gaps between frame numbers
 */
export function detectMissingFrames(frames: SequenceFrame[]): number[] {
  if (frames.length < 2) return [];

  const frameNumbers = frames.map((f) => f.frameNumber).sort((a, b) => a - b);
  const missing: number[] = [];
  const presentSet = new Set(frameNumbers);

  const min = frameNumbers[0]!;
  const max = frameNumbers[frameNumbers.length - 1]!;

  for (let f = min; f <= max; f++) {
    if (!presentSet.has(f)) {
      missing.push(f);
    }
  }

  return missing;
}

/**
 * Check if a specific frame number is missing
 */
export function isFrameMissing(sequenceInfo: SequenceInfo, frameNumber: number): boolean {
  return sequenceInfo.missingFrames.includes(frameNumber);
}

/**
 * Get the index of a frame by its frame number
 * Returns -1 if the frame is missing
 */
export function getFrameIndexByNumber(sequenceInfo: SequenceInfo, frameNumber: number): number {
  const frame = sequenceInfo.frames.find((f) => f.frameNumber === frameNumber);
  return frame ? frame.index : -1;
}

/**
 * Build a Map from frame number → SequenceFrame for O(1) lookups.
 */
export function buildFrameNumberMap(frames: SequenceFrame[]): Map<number, SequenceFrame> {
  const map = new Map<number, SequenceFrame>();
  for (const frame of frames) {
    map.set(frame.frameNumber, frame);
  }
  return map;
}

/**
 * Compute the numeric frame range (total timeline frames including gaps).
 */
export function getSequenceFrameRange(sequenceInfo: SequenceInfo): number {
  return sequenceInfo.endFrame - sequenceInfo.startFrame + 1;
}

/**
 * Cleanup all frame resources
 */
export function disposeSequence(frames: SequenceFrame[]): void {
  for (const frame of frames) {
    if (frame.image) {
      frame.image.close();
      frame.image = undefined;
    }
    if (frame.decodedData) {
      frame.decodedData = undefined;
    }
    if (frame.url) {
      URL.revokeObjectURL(frame.url);
      frame.url = undefined;
    }
  }
}

// ============================================================================
// Pattern Notation Parsing
// ============================================================================

/**
 * Pattern notation types supported
 */
export type PatternNotation = 'hash' | 'printf' | 'at';

/**
 * Parsed pattern information
 */
export interface ParsedPattern {
  prefix: string; // Everything before the frame number placeholder
  suffix: string; // Everything after (including extension)
  padding: number; // Number of digits (0 = no padding)
  notation: PatternNotation;
  extension: string; // File extension without dot
}

/**
 * Pattern matching regex for different notations
 */
const PRINTF_PATTERN = /%(\d*)d/; // %d, %04d, %4d
const HASH_PATTERN = /(#+)/; // #, ##, ####
const AT_PATTERN = /(@+)/; // @, @@, @@@@

/**
 * Parse a printf-style pattern notation (e.g., "frame_%04d.png")
 * Returns null if not a valid printf pattern
 */
export function parsePrintfPattern(pattern: string): ParsedPattern | null {
  const match = pattern.match(PRINTF_PATTERN);
  if (!match) return null;

  const fullMatch = match[0]!;
  const paddingStr = match[1] || '';
  const padding = paddingStr ? parseInt(paddingStr, 10) : 0;
  const idx = pattern.indexOf(fullMatch);

  const prefix = pattern.slice(0, idx);
  const suffix = pattern.slice(idx + fullMatch.length);
  const ext = suffix.split('.').pop() || '';

  return {
    prefix,
    suffix,
    padding,
    notation: 'printf',
    extension: ext,
  };
}

/**
 * Parse a hash notation pattern (e.g., "frame_####.png")
 * Returns null if not a valid hash pattern
 */
export function parseHashPattern(pattern: string): ParsedPattern | null {
  const match = pattern.match(HASH_PATTERN);
  if (!match) return null;

  const fullMatch = match[0]!;
  const padding = fullMatch.length;
  const idx = pattern.indexOf(fullMatch);

  const prefix = pattern.slice(0, idx);
  const suffix = pattern.slice(idx + fullMatch.length);
  const ext = suffix.split('.').pop() || '';

  return {
    prefix,
    suffix,
    padding,
    notation: 'hash',
    extension: ext,
  };
}

/**
 * Parse an at-sign notation pattern (e.g., "frame_@@@@.png")
 * Returns null if not a valid at-sign pattern
 */
export function parseAtPattern(pattern: string): ParsedPattern | null {
  const match = pattern.match(AT_PATTERN);
  if (!match) return null;

  const fullMatch = match[0]!;
  const padding = fullMatch.length;
  const idx = pattern.indexOf(fullMatch);

  const prefix = pattern.slice(0, idx);
  const suffix = pattern.slice(idx + fullMatch.length);
  const ext = suffix.split('.').pop() || '';

  return {
    prefix,
    suffix,
    padding,
    notation: 'at',
    extension: ext,
  };
}

/**
 * Parse any supported pattern notation
 * Tries printf, hash, then at-sign notation
 */
export function parsePatternNotation(pattern: string): ParsedPattern | null {
  return parsePrintfPattern(pattern) || parseHashPattern(pattern) || parseAtPattern(pattern);
}

/**
 * Generate a filename from a parsed pattern and frame number
 */
export function generateFilename(parsed: ParsedPattern, frameNumber: number): string {
  const numStr = parsed.padding > 0 ? String(frameNumber).padStart(parsed.padding, '0') : String(frameNumber);
  return parsed.prefix + numStr + parsed.suffix;
}

/**
 * Convert a pattern to hash notation
 */
export function toHashNotation(pattern: string): string {
  const parsed = parsePatternNotation(pattern);
  if (!parsed) return pattern;

  const hashStr = '#'.repeat(parsed.padding || 4);
  return parsed.prefix + hashStr + parsed.suffix;
}

/**
 * Convert a pattern to printf notation
 */
export function toPrintfNotation(pattern: string): string {
  const parsed = parsePatternNotation(pattern);
  if (!parsed) return pattern;

  const printfStr = parsed.padding > 0 ? `%0${parsed.padding}d` : '%d';
  return parsed.prefix + printfStr + parsed.suffix;
}

// ============================================================================
// Single File Sequence Inference
// ============================================================================

/**
 * Information extracted from a single file for sequence inference
 */
export interface InferredSequencePattern {
  prefix: string;
  suffix: string;
  padding: number;
  frameNumber: number;
  extension: string;
}

/**
 * Extract sequence pattern information from a single filename
 * Returns null if no frame number pattern is detected
 */
export function extractPatternFromFilename(filename: string): InferredSequencePattern | null {
  // Try to extract frame number
  const frameNumber = extractFrameNumber(filename);
  if (frameNumber === null) return null;

  // Find where the number appears in the filename
  // We need to find the padded version, not just the number
  // e.g., for "frame_0001.png" with frameNumber 1, we need to find "0001"
  const ext = filename.split('.').pop() || '';
  const nameWithoutExt = filename.slice(0, filename.length - ext.length - 1);

  // Search for the number pattern in the filename
  // Look for the longest sequence of digits that ends with our frame number
  const digitMatch = nameWithoutExt.match(/(\d+)$/);
  if (!digitMatch) return null;

  const fullNumStr = digitMatch[1]!;
  const actualFrameNum = parseInt(fullNumStr, 10);

  // Verify the parsed number matches
  if (actualFrameNum !== frameNumber) return null;

  const padding = fullNumStr.length;
  const idx = nameWithoutExt.lastIndexOf(fullNumStr);

  return {
    prefix: nameWithoutExt.slice(0, idx),
    suffix: '.' + ext,
    padding,
    frameNumber,
    extension: ext,
  };
}

/**
 * Check if a filename matches a sequence pattern
 */
export function matchesPattern(filename: string, pattern: InferredSequencePattern): boolean {
  // Check extension (case-insensitive)
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (ext !== pattern.extension.toLowerCase()) return false;

  // Check prefix
  if (!filename.startsWith(pattern.prefix)) return false;

  // Check suffix (case-insensitive for extension part)
  if (!filename.toLowerCase().endsWith(pattern.suffix.toLowerCase())) return false;

  // Extract the frame number part
  const nameWithoutExt = filename.slice(0, filename.length - pattern.suffix.length);
  const numPart = nameWithoutExt.slice(pattern.prefix.length);

  // Must be all digits
  if (!/^\d+$/.test(numPart)) return false;

  // If padding is specified, verify length (but allow flexible padding)
  // Many sequences have consistent padding, but we should be flexible
  return true;
}

/**
 * Extract frame number from a filename given a known pattern
 */
export function extractFrameFromPattern(filename: string, pattern: InferredSequencePattern): number | null {
  if (!matchesPattern(filename, pattern)) return null;

  const nameWithoutExt = filename.slice(0, filename.length - pattern.suffix.length);
  const numPart = nameWithoutExt.slice(pattern.prefix.length);

  const num = parseInt(numPart, 10);
  return isNaN(num) ? null : num;
}

/**
 * Find all files matching a sequence pattern from a list of files
 * Returns files sorted by frame number
 */
export function findMatchingFiles(files: File[], pattern: InferredSequencePattern): File[] {
  const matches: Array<{ file: File; frameNumber: number }> = [];

  for (const file of files) {
    const frameNum = extractFrameFromPattern(file.name, pattern);
    if (frameNum !== null) {
      matches.push({ file, frameNumber: frameNum });
    }
  }

  // Sort by frame number
  matches.sort((a, b) => a.frameNumber - b.frameNumber);

  return matches.map((m) => m.file);
}

/**
 * Infer a sequence from a single file by scanning other available files
 *
 * @param singleFile - The single file that was selected/dropped
 * @param availableFiles - All files available in the same context (e.g., all files in drop)
 * @param fps - Frame rate for the sequence
 * @returns SequenceInfo if a sequence is found, null otherwise
 */
export async function inferSequenceFromSingleFile(
  singleFile: File,
  availableFiles: File[],
  fps: number = 24,
): Promise<SequenceInfo | null> {
  // Extract pattern from the single file
  const pattern = extractPatternFromFilename(singleFile.name);
  if (!pattern) return null;

  // Find all matching files
  const matchingFiles = findMatchingFiles(availableFiles, pattern);

  // Need at least 2 files to be a sequence
  if (matchingFiles.length < 2) return null;

  // Use the existing createSequenceInfo with all matching files
  return createSequenceInfo(matchingFiles, fps);
}

/**
 * Scan a list of files and group them into potential sequences
 * Returns a map of pattern string to matching files
 */
export function discoverSequences(files: File[]): Map<string, File[]> {
  const sequences = new Map<string, File[]>();
  const processedFiles = new Set<string>();

  // Filter to image files only
  const imageFiles = filterImageFiles(files);

  for (const file of imageFiles) {
    if (processedFiles.has(file.name)) continue;

    const pattern = extractPatternFromFilename(file.name);
    if (!pattern) {
      // File doesn't have a frame number, skip for sequence detection
      continue;
    }

    // Create a pattern key
    const patternKey = pattern.prefix + '#'.repeat(pattern.padding) + pattern.suffix;

    // Find all matching files
    const matchingFiles = findMatchingFiles(imageFiles, pattern);

    if (matchingFiles.length >= 2) {
      sequences.set(patternKey, matchingFiles);

      // Mark all matched files as processed
      for (const matched of matchingFiles) {
        processedFiles.add(matched.name);
      }
    }
  }

  return sequences;
}

/**
 * Get the best sequence from a list of files
 * If multiple sequences are found, returns the one with the most frames
 * If the target file is provided, prefer sequences containing that file
 */
export function getBestSequence(files: File[], targetFile?: File): File[] | null {
  const sequences = discoverSequences(files);

  if (sequences.size === 0) return null;

  // If target file is specified, find a sequence containing it
  if (targetFile) {
    for (const [, seqFiles] of sequences) {
      if (seqFiles.some((f) => f.name === targetFile.name)) {
        return seqFiles;
      }
    }
  }

  // Otherwise, return the sequence with the most frames
  let bestSequence: File[] | null = null;
  let maxFrames = 0;

  for (const [, seqFiles] of sequences) {
    if (seqFiles.length > maxFrames) {
      maxFrames = seqFiles.length;
      bestSequence = seqFiles;
    }
  }

  return bestSequence;
}

// ============================================================================
// URL-based Sequence Utilities
// ============================================================================

/**
 * Check whether a URL/path contains a frame-sequence pattern placeholder.
 * Recognises `####`, `%04d`, and `@@@@` notations.
 */
export function isSequencePattern(url: string): boolean {
  return parsePatternNotation(url) !== null;
}

/**
 * Expand a pattern path into an array of concrete URLs/paths for the
 * given frame range.
 *
 * @param pattern - A path containing a placeholder, e.g. `/path/shot.####.exr`
 * @param startFrame - First frame number (inclusive)
 * @param endFrame - Last frame number (inclusive)
 * @returns Array of expanded URL strings, one per frame
 */
export function expandPatternToURLs(pattern: string, startFrame: number, endFrame: number): string[] {
  const parsed = parsePatternNotation(pattern);
  if (!parsed) return [];

  const urls: string[] = [];
  for (let f = startFrame; f <= endFrame; f++) {
    urls.push(generateFilename(parsed, f));
  }
  return urls;
}

/**
 * Load an image from a URL and return an ImageBitmap.
 * Used for URL-based (remote) sequence frames.
 */
export async function loadImageBitmapFromURL(url: string, signal?: AbortSignal): Promise<ImageBitmap> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  }

  return new Promise<ImageBitmap>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const onAbort = () => {
      img.src = '';
      reject(signal!.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    img.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      createImageBitmap(img).then(resolve, reject);
    };

    img.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error(`Failed to load image from URL: ${url}`));
    };

    img.src = url;
  });
}

/**
 * Create a SequenceInfo from a URL pattern and frame range, without requiring File objects.
 * Loads the first frame from URL to determine dimensions.
 *
 * @param pattern - URL/path with placeholder, e.g. `/path/shot.####.exr`
 * @param startFrame - First frame number (inclusive)
 * @param endFrame - Last frame number (inclusive)
 * @param fps - Frame rate (default: 24)
 * @returns SequenceInfo with URL-based frames
 */
export async function createSequenceInfoFromPattern(
  pattern: string,
  startFrame: number,
  endFrame: number,
  fps: number = 24,
): Promise<SequenceInfo> {
  const parsed = parsePatternNotation(pattern);
  if (!parsed) {
    throw new Error(`Invalid sequence pattern: ${pattern}`);
  }

  // Build SequenceFrame entries for every frame in the range.
  // We create a minimal File placeholder (empty blob) since SequenceFrame.file
  // is required by the interface but won't be used for URL-based loading.
  const frames: SequenceFrame[] = [];
  for (let f = startFrame; f <= endFrame; f++) {
    const url = generateFilename(parsed, f);
    const filename = url.split('/').pop() ?? url;
    frames.push({
      index: f - startFrame,
      frameNumber: f,
      file: new File([], filename),
      url,
    });
  }

  // Load the first frame to get dimensions
  const firstUrl = generateFilename(parsed, startFrame);
  const firstBitmap = await loadImageBitmapFromURL(firstUrl);
  frames[0]!.image = firstBitmap;

  // Derive a human-readable name from the pattern
  const patternFilename = pattern.split('/').pop() ?? pattern;
  const baseName = patternFilename
    .replace(/##+/g, '')
    .replace(/%\d*d/g, '')
    .replace(/@+/g, '')
    .replace(/[._-]?\.[^.]+$/, '')
    .replace(/[._-]$/, '') || 'sequence';

  return {
    name: baseName,
    pattern: patternFilename,
    frames,
    startFrame,
    endFrame,
    width: firstBitmap.width,
    height: firstBitmap.height,
    fps,
    missingFrames: [],
  };
}

/**
 * Load a sequence frame from its URL, storing the resulting ImageBitmap
 * on the frame. Used for URL-based (remote) sequence frames as an
 * alternative to `loadFrameImage` which requires a real File.
 */
export async function loadFrameImageFromURL(frame: SequenceFrame, signal?: AbortSignal): Promise<ImageBitmap> {
  if (frame.image) return frame.image;

  if (!frame.url) {
    throw new Error(`Frame ${frame.frameNumber} has no URL`);
  }

  const bitmap = await loadImageBitmapFromURL(frame.url, signal);
  frame.image = bitmap;
  return bitmap;
}
