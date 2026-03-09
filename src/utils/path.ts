/**
 * Extract the filename from a path string, handling both POSIX and Windows separators.
 */
export function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}
