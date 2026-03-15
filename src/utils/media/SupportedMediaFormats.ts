/**
 * Shared media format helpers used by file inputs, placeholder UI copy,
 * and media type detection in Session/MediaManager.
 */

/**
 * Image extensions supported by FileSourceNode (including HDR/pro formats)
 * plus common browser-native image formats.
 */
export const SUPPORTED_IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'jpe',
  'webp',
  'gif',
  'bmp',
  'svg',
  'ico',
  'tif',
  'tiff',
  'exr',
  'sxr',
  'dpx',
  'cin',
  'cineon',
  'hdr',
  'pic',
  'avif',
  'jxl',
  'heic',
  'heif',
  // JPEG 2000 / HTJ2K
  'jp2',
  'j2k',
  'j2c',
  'jph',
  'jhc',
  // RAW formats (TIFF-based preview extraction only)
  'cr2',
  'nef',
  'arw',
  'dng',
  'orf',
  'pef',
  'srw',
] as const;

/**
 * Video container extensions we can currently attempt to load via
 * MediaBunny and/or HTMLVideoElement fallback.
 */
export const MEDIABUNNY_VIDEO_EXTENSIONS = [
  // MP4 (ISOBMFF)
  'mp4',
  'm4v',
  '3gp',
  '3g2',
  // QTFF (QuickTime / MOV)
  'mov',
  'qt',
  // Matroska / WebM
  'mkv',
  'mk3d',
  'webm',
  // Ogg
  'ogg',
  'ogv',
  'ogm',
  'ogx',
  // MXF (Material Exchange Format)
  'mxf',
] as const;

/**
 * Browser video fallback extensions (outside mediabunny ALL_FORMATS).
 */
export const HTML_VIDEO_FALLBACK_EXTENSIONS = ['avi'] as const;

export const SUPPORTED_VIDEO_EXTENSIONS = [...MEDIABUNNY_VIDEO_EXTENSIONS, ...HTML_VIDEO_FALLBACK_EXTENSIONS] as const;

const IMAGE_EXTENSION_SET = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);
const VIDEO_EXTENSION_SET = new Set<string>(SUPPORTED_VIDEO_EXTENSIONS);
const ALL_KNOWN_EXTENSIONS = new Set<string>([...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS]);
const VIDEO_MIME_ALIASES = new Set<string>(['application/ogg']);

/**
 * Check whether an extension (lowercase, no dot) is a recognized video extension.
 * This is the single source of truth for video-extension classification.
 */
export function isVideoExtension(ext: string): boolean {
  return VIDEO_EXTENSION_SET.has(ext);
}

function getFileExtension(filename: string): string {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx === filename.length - 1) {
    return '';
  }
  return filename.slice(dotIdx + 1).toLowerCase();
}

/**
 * Classify a file as image/video using MIME first, then extension fallback.
 * Returns `'unknown'` for unrecognized extensions/MIME types so callers can
 * reject unsupported files with a clear error instead of misclassifying them.
 */
export function detectMediaTypeFromFile(file: Pick<File, 'name' | 'type'>): 'image' | 'video' | 'unknown' {
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

  return 'unknown';
}

/**
 * Extract the file extension from a URL path, ignoring query strings and fragments.
 * Returns empty string if no extension is found.
 */
export function getExtensionFromUrl(url: string): string {
  try {
    // Handle both absolute and relative URLs
    const pathname = new URL(url, 'http://dummy').pathname;
    const lastSegment = pathname.split('/').pop() ?? '';
    return getFileExtension(lastSegment);
  } catch {
    // Fallback for malformed URLs: just use the raw string
    const parts = url.split('?')[0]?.split('#')[0]?.split('/');
    return getFileExtension(parts?.pop() ?? '');
  }
}

/** Default timeout for HEAD requests used in content-type sniffing (ms). */
const HEAD_REQUEST_TIMEOUT_MS = 3000;

/**
 * Detect whether a URL points to a video or image resource.
 *
 * 1. If the URL has a recognized extension, use it directly.
 * 2. Otherwise, issue a HEAD request to sniff the Content-Type header.
 * 3. Falls back to 'image' if the HEAD request fails or the type is unrecognized.
 */
export async function detectMediaTypeFromUrl(url: string): Promise<'image' | 'video'> {
  const ext = getExtensionFromUrl(url);

  // Fast path: known extension
  if (ext && ALL_KNOWN_EXTENSIONS.has(ext)) {
    if (VIDEO_EXTENSION_SET.has(ext)) {
      return 'video';
    }
    return 'image';
  }

  // Slow path: HEAD request to sniff Content-Type
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEAD_REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.startsWith('video/')) {
      return 'video';
    }
    if (contentType.startsWith('image/')) {
      return 'image';
    }
    if (VIDEO_MIME_ALIASES.has((contentType.split(';')[0] ?? '').trim())) {
      return 'video';
    }
  } catch {
    // Network error, timeout, or abort — fall through to default
  }

  return 'image';
}

const acceptExtensions = Array.from(
  new Set<string>([...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS]),
).map((ext) => `.${ext}`);

/**
 * File input accept string for all image/video formats we can attempt.
 */
export const SUPPORTED_MEDIA_ACCEPT = ['image/*', 'video/*', ...acceptExtensions].join(',');

/**
 * Project/session file extensions.
 */
export const PROJECT_EXTENSIONS = ['orvproject', 'rv', 'gto', 'rvedl'] as const;

/**
 * CDL (Color Decision List) sidecar extension.
 */
export const CDL_EXTENSIONS = ['cdl'] as const;

/**
 * File input accept string for the "Open Project" picker.
 * Includes project/session formats, media formats, and CDL sidecars
 * so users can multi-select an .rv/.gto file together with its
 * companion media/CDL files in a single action.
 */
export const SUPPORTED_PROJECT_ACCEPT = [
  ...PROJECT_EXTENSIONS.map((ext) => `.${ext}`),
  ...acceptExtensions,
  ...CDL_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

/**
 * Viewer placeholder support lines (rendered as multiline helper text).
 */
export const VIEWER_PLACEHOLDER_SUPPORT_LINES = [
  'Images: EXR, DPX/CIN, HDR, AVIF, JXL, HEIC, JP2/HTJ2K, RAW, PNG/JPEG/WebP/TIFF',
  'Video: MP4/M4V/3GP, MOV/QT, MKV/WebM, OGG/OGV, MXF (AVI fallback)',
] as const;
