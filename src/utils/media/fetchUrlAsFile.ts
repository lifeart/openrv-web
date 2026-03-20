/**
 * Fetch a URL and wrap the response as a File object suitable for
 * the FileSourceNode / decoder pipeline.
 *
 * @param url  Absolute HTTP(S) URL to fetch.
 * @param name Filename to attach to the resulting File (used for
 *             extension-based format detection downstream).
 * @returns A File containing the fetched bytes.
 */
export async function fetchUrlAsFile(url: string, name: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status}): ${url}`);
  }
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type });
}
