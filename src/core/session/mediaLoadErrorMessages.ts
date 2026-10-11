/**
 * User-facing error messages for media load failures.
 *
 * Load errors used to surface the object URL (`blob:https://…/uuid`) instead
 * of the file name and the actual cause. These helpers build messages that
 * name the file and say *why* it failed, and scrub opaque blob/data URLs out
 * of lower-level decoder messages.
 */

const OPAQUE_URL_PATTERN = /\b(?:blob|data):[^\s"')]+/g;

export const UNSUPPORTED_OR_CORRUPT_IMAGE = 'the image format is not supported by this browser or the file is corrupt';

/**
 * Replace opaque blob:/data: URLs in `text` with `name` (or "the file").
 */
export function scrubOpaqueUrls(text: string, name?: string): string {
  return text.replace(OPAQUE_URL_PATTERN, name ? `"${name}"` : 'the file');
}

/**
 * Extract a readable reason from an unknown thrown value, with blob/data URLs
 * scrubbed. Returns '' when there is nothing useful to say.
 */
export function describeErrorCause(cause: unknown, name?: string): string {
  let message = '';
  if (cause instanceof Error) {
    message = cause.message;
  } else if (typeof cause === 'string') {
    message = cause;
  }
  return scrubOpaqueUrls(message, name).trim();
}

/**
 * Human-readable reason for an HTMLMediaElement `MediaError`.
 * Codes: 1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED.
 */
export function describeMediaElementError(error: { code: number; message?: string } | null | undefined): string {
  switch (error?.code) {
    case 1:
      return 'loading was aborted';
    case 2:
      return 'a network error interrupted loading';
    case 3:
      return 'the video could not be decoded (corrupt file or unsupported codec)';
    case 4:
      return 'the video format or codec is not supported by this browser';
    default:
      return 'the video could not be decoded (corrupt file or unsupported format)';
  }
}

/**
 * Message for an image that neither the format decoders nor the browser's
 * built-in image loader could read.
 *
 * @param name - The file / source name shown to the user.
 * @param decoderCause - The error from the primary (format-specific) decoder, if any.
 */
export function imageLoadFailedMessage(name: string, decoderCause?: unknown): string {
  const detail = describeErrorCause(decoderCause, name);
  const base = `Failed to load image "${name}": ${UNSUPPORTED_OR_CORRUPT_IMAGE}`;
  return detail ? `${base} (decoder: ${detail})` : base;
}

/**
 * Message for a video the browser's media element could not load.
 */
export function videoLoadFailedMessage(
  name: string,
  mediaError: { code: number; message?: string } | null | undefined,
): string {
  return `Failed to load video "${name}": ${describeMediaElementError(mediaError)}`;
}
