/**
 * Shared media format helpers used by file inputs, placeholder UI copy,
 * and media type detection in Session/MediaManager.
 */

/**
 * Image extensions supported by FileSourceNode (including HDR/pro formats)
 * plus common browser-native image formats.
 */
export const SUPPORTED_IMAGE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'jpe', 'webp', 'gif', 'bmp', 'svg',
  'tif', 'tiff',
  'exr', 'sxr', 'dpx', 'cin', 'cineon', 'hdr', 'pic',
  'avif', 'jxl', 'heic', 'heif',
  // RAW formats (preview extraction)
  'cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw',
] as const;

/**
 * Video container extensions we can currently attempt to load via
 * MediaBunny and/or HTMLVideoElement fallback.
 */
export const MEDIABUNNY_VIDEO_EXTENSIONS = [
  // MP4 (ISOBMFF)
  'mp4', 'm4v', '3gp', '3g2',
  // QTFF (QuickTime / MOV)
  'mov', 'qt',
  // Matroska / WebM
  'mkv', 'mk3d', 'webm',
  // Ogg
  'ogg', 'ogv', 'ogm', 'ogx',
] as const;

/**
 * Browser video fallback extensions (outside mediabunny ALL_FORMATS).
 */
export const HTML_VIDEO_FALLBACK_EXTENSIONS = [
  'avi',
] as const;

export const SUPPORTED_VIDEO_EXTENSIONS = [
  ...MEDIABUNNY_VIDEO_EXTENSIONS,
  ...HTML_VIDEO_FALLBACK_EXTENSIONS,
] as const;

const IMAGE_EXTENSION_SET = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);
const VIDEO_EXTENSION_SET = new Set<string>(SUPPORTED_VIDEO_EXTENSIONS);
const VIDEO_MIME_ALIASES = new Set<string>([
  'application/ogg',
]);

function getFileExtension(filename: string): string {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx === filename.length - 1) {
    return '';
  }
  return filename.slice(dotIdx + 1).toLowerCase();
}

/**
 * Classify a file as image/video using MIME first, then extension fallback.
 * Unknown types default to image to preserve existing behavior.
 */
export function detectMediaTypeFromFile(file: Pick<File, 'name' | 'type'>): 'image' | 'video' {
  const mime = (file.type ?? '').trim().toLowerCase();

  if (mime.startsWith('video/')) {
    return 'video';
  }
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (VIDEO_MIME_ALIASES.has(mime)) {
    return 'video';
  }

  const ext = getFileExtension(file.name);
  if (VIDEO_EXTENSION_SET.has(ext)) {
    return 'video';
  }
  if (IMAGE_EXTENSION_SET.has(ext)) {
    return 'image';
  }

  return 'image';
}

const acceptExtensions = Array.from(
  new Set<string>([...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS])
).map(ext => `.${ext}`);

/**
 * File input accept string for all image/video formats we can attempt.
 */
export const SUPPORTED_MEDIA_ACCEPT = ['image/*', 'video/*', ...acceptExtensions].join(',');

/**
 * Viewer placeholder support lines (rendered as multiline helper text).
 */
export const VIEWER_PLACEHOLDER_SUPPORT_LINES = [
  'Images: EXR, DPX/CIN, HDR, AVIF, JXL, HEIC, RAW, PNG/JPEG/WebP/TIFF',
  'Video: MP4/M4V/3GP, MOV/QT, MKV/WebM, OGG/OGV (AVI fallback)',
] as const;
