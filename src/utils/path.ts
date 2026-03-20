/**
 * Extract the filename from a path, URL, or mixed-separator string.
 *
 * Handles POSIX paths, Windows paths, mixed separators, and URLs with
 * query strings or fragment identifiers.
 */
export function basename(path: string): string {
  // Strip query string and fragment (for URLs)
  const cleaned = path.split(/[?#]/)[0] ?? path;
  // Split on both POSIX and Windows separators, take the last non-empty segment
  const segments = cleaned.split(/[/\\]/);
  // Walk backwards to skip trailing separators (e.g. "/foo/bar/")
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg !== undefined && seg !== '') return seg;
  }
  return path;
}
