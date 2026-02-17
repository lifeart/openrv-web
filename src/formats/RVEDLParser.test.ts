import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseRVEDL } from './RVEDLParser';

// Use vi.hoisted so the mock is available before vi.mock is hoisted
const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
}));

// Mock Logger to capture warnings
vi.mock('../utils/Logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    warn: warnMock,
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('RVEDLParser', () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  // EDL-001: Parse 3-line RVEDL -> 3 source entries with correct paths/ranges
  it('EDL-001: parses 3-line RVEDL with correct paths and ranges', () => {
    const text = `/path/to/source1.exr 1 100
/path/to/source2.mov 50 200
/path/to/source3.dpx 1 48`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ sourcePath: '/path/to/source1.exr', inFrame: 1, outFrame: 100 });
    expect(entries[1]).toEqual({ sourcePath: '/path/to/source2.mov', inFrame: 50, outFrame: 200 });
    expect(entries[2]).toEqual({ sourcePath: '/path/to/source3.dpx', inFrame: 1, outFrame: 48 });
  });

  // EDL-002: Empty file -> empty array
  it('EDL-002: returns empty array for empty file', () => {
    expect(parseRVEDL('')).toEqual([]);
  });

  // EDL-003: Comment-only file -> empty array
  it('EDL-003: returns empty array for comment-only file', () => {
    const text = `# This is a comment
# Another comment
# Yet another comment`;

    expect(parseRVEDL(text)).toEqual([]);
  });

  // EDL-004: Malformed line (missing outFrame) -> skip with warning, parse valid lines
  it('EDL-004: skips malformed line with missing outFrame and parses valid lines', () => {
    const text = `/path/to/valid.exr 1 100
/path/to/malformed.exr 50
/path/to/also_valid.dpx 1 48`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ sourcePath: '/path/to/valid.exr', inFrame: 1, outFrame: 100 });
    expect(entries[1]).toEqual({ sourcePath: '/path/to/also_valid.dpx', inFrame: 1, outFrame: 48 });
    expect(warnMock).toHaveBeenCalled();
  });

  // EDL-005: Mixed valid and invalid lines -> only valid entries returned
  it('EDL-005: returns only valid entries from mixed content', () => {
    const text = `# header comment
/path/to/source1.exr 1 100
malformed_line_no_frames
/path/to/source2.mov 50 200
/path/bad abc def
/path/to/source3.dpx 1 48
# trailing comment`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(3);
    expect(entries[0]!.sourcePath).toBe('/path/to/source1.exr');
    expect(entries[1]!.sourcePath).toBe('/path/to/source2.mov');
    expect(entries[2]!.sourcePath).toBe('/path/to/source3.dpx');
  });

  // EDL-006: Lines with extra whitespace -> trimmed correctly
  it('EDL-006: handles lines with extra whitespace', () => {
    const text = `   /path/to/source1.exr   1   100
\t/path/to/source2.mov\t50\t200\t
  /path/to/source3.dpx  1  48  `;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ sourcePath: '/path/to/source1.exr', inFrame: 1, outFrame: 100 });
    expect(entries[1]).toEqual({ sourcePath: '/path/to/source2.mov', inFrame: 50, outFrame: 200 });
    expect(entries[2]).toEqual({ sourcePath: '/path/to/source3.dpx', inFrame: 1, outFrame: 48 });
  });

  // EDL-007: Paths with spaces (quoted) -> handled correctly
  it('EDL-007: handles quoted paths with spaces', () => {
    const text = `"/path/with spaces/source1.exr" 1 100
"/another path/to file.mov" 50 200
/simple/path.dpx 1 48`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ sourcePath: '/path/with spaces/source1.exr', inFrame: 1, outFrame: 100 });
    expect(entries[1]).toEqual({ sourcePath: '/another path/to file.mov', inFrame: 50, outFrame: 200 });
    expect(entries[2]).toEqual({ sourcePath: '/simple/path.dpx', inFrame: 1, outFrame: 48 });
  });

  // EDL-008: Non-numeric frame numbers -> skip with warning
  it('EDL-008: skips lines with non-numeric frame numbers', () => {
    const text = `/path/to/source1.exr abc 100
/path/to/source2.mov 50 xyz
/path/to/valid.dpx 1 48`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ sourcePath: '/path/to/valid.dpx', inFrame: 1, outFrame: 48 });
    expect(warnMock).toHaveBeenCalledTimes(2);
  });

  // EDL-009: Negative frame numbers -> accepted (valid in some workflows)
  it('EDL-009: accepts negative frame numbers', () => {
    const text = `/path/to/source.exr -10 100
/path/to/other.mov 1 -5`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ sourcePath: '/path/to/source.exr', inFrame: -10, outFrame: 100 });
    expect(entries[1]).toEqual({ sourcePath: '/path/to/other.mov', inFrame: 1, outFrame: -5 });
  });

  // EDL-010: inFrame > outFrame -> accepted (reverse playback indicator)
  it('EDL-010: accepts inFrame > outFrame for reverse playback', () => {
    const text = `/path/to/source.exr 100 1`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ sourcePath: '/path/to/source.exr', inFrame: 100, outFrame: 1 });
  });

  // Additional edge cases

  it('handles Windows-style line endings (CRLF)', () => {
    const text = "/path/to/source1.exr 1 100\r\n/path/to/source2.mov 50 200\r\n";

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(2);
    expect(entries[0]!.sourcePath).toBe('/path/to/source1.exr');
    expect(entries[1]!.sourcePath).toBe('/path/to/source2.mov');
  });

  it('handles unterminated quoted path with warning', () => {
    const text = `"unterminated/path 1 100
/valid/path.exr 1 50`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.sourcePath).toBe('/valid/path.exr');
    expect(warnMock).toHaveBeenCalled();
  });

  it('handles line with only a path and no frame numbers', () => {
    const text = `/path/to/source.exr`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(0);
    expect(warnMock).toHaveBeenCalled();
  });

  it('handles whitespace-only lines', () => {
    const text = `
\t
/path/to/source.exr 1 100
   \t   `;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ sourcePath: '/path/to/source.exr', inFrame: 1, outFrame: 100 });
  });

  it('handles floating point frame numbers by accepting them', () => {
    const text = `/path/to/source.exr 1.5 100.7`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ sourcePath: '/path/to/source.exr', inFrame: 1.5, outFrame: 100.7 });
  });

  it('handles comment lines with leading whitespace', () => {
    const text = `   # this is an indented comment
/path/to/source.exr 1 100`;

    const entries = parseRVEDL(text);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.sourcePath).toBe('/path/to/source.exr');
  });
});
