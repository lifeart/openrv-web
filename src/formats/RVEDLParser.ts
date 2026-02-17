/**
 * Parser for OpenRV RVEDL (Edit Decision List) files.
 *
 * RVEDL is a simple ASCII format where each non-comment, non-empty line
 * specifies a source path and in/out frame range:
 *
 *   # comment lines start with #
 *   /path/to/source1.exr 1 100
 *   /path/to/source2.mov 50 200
 *   "/path/with spaces/source3.dpx" 1 48
 *
 * Each line: sourcePath inFrame outFrame
 * Paths containing spaces may be enclosed in double quotes.
 */

import { Logger } from '../utils/Logger';

const log = new Logger('RVEDLParser');

/** A single entry parsed from an RVEDL file. */
export interface RVEDLEntry {
  /** Path to the source file */
  sourcePath: string;
  /** Start frame (inclusive) */
  inFrame: number;
  /** End frame (inclusive) */
  outFrame: number;
}

/**
 * Parse RVEDL text into an array of entries.
 *
 * - Lines starting with `#` (after optional leading whitespace) are treated as comments.
 * - Empty / whitespace-only lines are skipped.
 * - Malformed lines (missing fields, non-numeric frames) are skipped with a warning.
 * - Paths may be enclosed in double-quotes to support spaces.
 * - Negative frame numbers are accepted (valid in some workflows).
 * - inFrame > outFrame is accepted (reverse playback indicator).
 */
export function parseRVEDL(text: string): RVEDLEntry[] {
  const entries: RVEDLEntry[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();

    // Skip empty lines
    if (trimmed.length === 0) continue;

    // Skip comment lines
    if (trimmed.startsWith('#')) continue;

    // Parse the line — extract path (possibly quoted) then two frame numbers
    const parsed = parseLine(trimmed, i + 1);
    if (parsed !== null) {
      entries.push(parsed);
    }
  }

  return entries;
}

/**
 * Parse a single non-comment, non-empty line.
 * Returns null if the line is malformed (logs a warning).
 */
function parseLine(line: string, lineNumber: number): RVEDLEntry | null {
  let sourcePath: string;
  let rest: string;

  if (line.startsWith('"')) {
    // Quoted path — find the closing quote
    const closingQuote = line.indexOf('"', 1);
    if (closingQuote === -1) {
      log.warn(`Line ${lineNumber}: unterminated quoted path, skipping`);
      return null;
    }
    sourcePath = line.substring(1, closingQuote);
    rest = line.substring(closingQuote + 1).trim();
  } else {
    // Unquoted path — first whitespace-separated token
    const firstSpace = line.search(/\s/);
    if (firstSpace === -1) {
      log.warn(`Line ${lineNumber}: missing frame numbers, skipping`);
      return null;
    }
    sourcePath = line.substring(0, firstSpace);
    rest = line.substring(firstSpace).trim();
  }

  // Split the remaining part into tokens
  const tokens = rest.split(/\s+/).filter(t => t.length > 0);

  if (tokens.length < 2) {
    log.warn(`Line ${lineNumber}: missing frame numbers (need inFrame and outFrame), skipping`);
    return null;
  }

  const inFrameStr = tokens[0]!;
  const outFrameStr = tokens[1]!;

  const inFrame = Number(inFrameStr);
  const outFrame = Number(outFrameStr);

  if (!Number.isFinite(inFrame)) {
    log.warn(`Line ${lineNumber}: non-numeric inFrame "${inFrameStr}", skipping`);
    return null;
  }

  if (!Number.isFinite(outFrame)) {
    log.warn(`Line ${lineNumber}: non-numeric outFrame "${outFrameStr}", skipping`);
    return null;
  }

  return {
    sourcePath,
    inFrame,
    outFrame,
  };
}
