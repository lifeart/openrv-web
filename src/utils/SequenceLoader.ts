/**
 * Image Sequence Loader
 * Handles parsing, sorting, and loading of numbered image sequences
 */

export interface SequenceFrame {
  index: number;      // 0-based frame index
  frameNumber: number; // Original frame number from filename
  file: File;
  url?: string;       // Object URL when loaded
  image?: HTMLImageElement;
}

export interface SequenceInfo {
  name: string;
  pattern: string;    // Detected pattern like "frame_####.png"
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
  /(\d+)(?=\.[^.]+$)/,           // Any numbers before extension: file123.png
  /[._-](\d+)(?=\.[^.]+$)/,      // Separator then numbers: file_001.png, file-001.png, file.001.png
  /(\d{3,})(?=\.[^.]+$)/,        // 3+ digit numbers: file0001.png
];

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'exr'
]);

/**
 * Filter files to only include supported image formats
 */
export function filterImageFiles(files: File[]): File[] {
  return files.filter(file => {
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

  // Find the frame number in the string and replace with #'s
  const numStr = frameNum.toString();
  const idx = first.lastIndexOf(numStr);
  if (idx === -1) return null;

  const padding = numStr.length;
  const pattern = first.slice(0, idx) + '#'.repeat(padding) + first.slice(idx + padding);
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
 * Load a single frame image
 */
export function loadFrameImage(frame: SequenceFrame): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (frame.image) {
      resolve(frame.image);
      return;
    }

    // Create object URL if not exists
    if (!frame.url) {
      frame.url = URL.createObjectURL(frame.file);
    }

    const img = new Image();
    img.onload = () => {
      frame.image = img;
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error(`Failed to load frame: ${frame.file.name}`));
    };
    img.src = frame.url;
  });
}

/**
 * Preload a range of frames around the current frame
 */
export async function preloadFrames(
  frames: SequenceFrame[],
  currentIndex: number,
  windowSize: number = 5
): Promise<void> {
  const start = Math.max(0, currentIndex - windowSize);
  const end = Math.min(frames.length - 1, currentIndex + windowSize);

  const loadPromises: Promise<HTMLImageElement>[] = [];

  for (let i = start; i <= end; i++) {
    const frame = frames[i];
    if (frame && !frame.image) {
      loadPromises.push(loadFrameImage(frame));
    }
  }

  await Promise.all(loadPromises);
}

/**
 * Release memory for frames outside the cache window
 */
export function releaseDistantFrames(
  frames: SequenceFrame[],
  currentIndex: number,
  keepWindow: number = 10
): void {
  for (let i = 0; i < frames.length; i++) {
    const distance = Math.abs(i - currentIndex);
    if (distance > keepWindow) {
      const frame = frames[i];
      if (frame) {
        if (frame.url) {
          URL.revokeObjectURL(frame.url);
          frame.url = undefined;
        }
        frame.image = undefined;
      }
    }
  }
}

/**
 * Create a SequenceInfo from a list of files
 */
export async function createSequenceInfo(
  files: File[],
  fps: number = 24
): Promise<SequenceInfo | null> {
  // Filter to image files only
  const imageFiles = filterImageFiles(files);
  if (imageFiles.length === 0) return null;

  // Sort by frame number
  const frames = sortByFrameNumber(imageFiles);
  if (frames.length === 0) return null;

  // Detect pattern
  const pattern = detectPattern(imageFiles.map(f => f.name)) || 'unknown';

  // Load first frame to get dimensions
  const firstFrame = frames[0]!;
  const firstImage = await loadFrameImage(firstFrame);

  // Get base name (remove frame numbers and extension)
  const firstFile = frames[0]!.file;
  const baseName = firstFile.name
    .replace(/[._-]?\d+(?=\.[^.]+$)/, '')
    .replace(/\.[^.]+$/, '');

  // Detect missing frames in the sequence
  const missingFrames = detectMissingFrames(frames);

  return {
    name: baseName || 'sequence',
    pattern,
    frames,
    startFrame: frames[0]!.frameNumber,
    endFrame: frames[frames.length - 1]!.frameNumber,
    width: firstImage.naturalWidth,
    height: firstImage.naturalHeight,
    fps,
    missingFrames,
  };
}

/**
 * Detect missing frames in a sequence by finding gaps between frame numbers
 */
export function detectMissingFrames(frames: SequenceFrame[]): number[] {
  if (frames.length < 2) return [];

  const frameNumbers = frames.map(f => f.frameNumber).sort((a, b) => a - b);
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
  const frame = sequenceInfo.frames.find(f => f.frameNumber === frameNumber);
  return frame ? frame.index : -1;
}

/**
 * Cleanup all frame resources
 */
export function disposeSequence(frames: SequenceFrame[]): void {
  for (const frame of frames) {
    if (frame.url) {
      URL.revokeObjectURL(frame.url);
      frame.url = undefined;
    }
    frame.image = undefined;
  }
}
