/**
 * Loader for the integer TIFF / TGA / SGI fixtures in
 * test-assets/still-formats/ (written by Pillow and ImageMagick; see
 * generate.py there). Tests only.
 */

// Typed boundary for Node built-ins (the app tsconfig has no Node types).
interface NodeFs {
  readFileSync(path: string): Uint8Array;
}
interface NodeProcess {
  cwd(): string;
}
const NODE_FS_MODULE = 'fs';
const NODE_PROCESS_MODULE = 'process';
const { readFileSync } = (await import(/* @vite-ignore */ NODE_FS_MODULE)) as NodeFs;
const { cwd } = (await import(/* @vite-ignore */ NODE_PROCESS_MODULE)) as NodeProcess;

/** Width and height of every fixture. */
export const STILL_FIXTURE_WIDTH = 20;
export const STILL_FIXTURE_HEIGHT = 18;

/** Read a fixture as a standalone ArrayBuffer (vitest runs from the repository root). */
export function loadStillFixture(name: string): ArrayBuffer {
  const bytes = readFileSync(`${cwd()}/test-assets/still-formats/${name}`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
