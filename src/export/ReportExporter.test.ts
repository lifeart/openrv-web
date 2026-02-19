import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildReportRows,
  generateCSV,
  generateHTML,
  generateReport,
  escapeCSVField,
  type ReportSession,
  type ReportNoteManager,
  type ReportStatusManager,
  type ReportVersionManager,
  type ReportOptions,
  type ReportRow,
} from './ReportExporter';
import type { ShotStatus } from '../core/session/StatusManager';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function createMockSession(
  sources: { name: string; duration: number; fps: number; startFrame?: number }[]
): ReportSession {
  return {
    sourceCount: sources.length,
    getSourceByIndex: (i: number) => sources[i] ?? null,
    fps: 24,
  };
}

function createMockNoteManager(notes: Record<number, { text: string }[]>): ReportNoteManager {
  return {
    getNotesForSource: (i: number) => notes[i] ?? [],
  };
}

function createMockStatusManager(
  statuses: Record<number, { status: ShotStatus; setBy: string; setAt?: string }>
): ReportStatusManager {
  return {
    getStatus: (i: number) => statuses[i]?.status ?? 'pending',
    getStatusEntry: (i: number) =>
      statuses[i] ? { setBy: statuses[i]!.setBy, setAt: statuses[i]!.setAt ?? '' } : undefined,
  };
}

function createMockVersionManager(
  groups: Record<number, { shotName: string; label: string }>
): ReportVersionManager {
  return {
    getGroupForSource: (i: number) => {
      const g = groups[i];
      if (!g) return undefined;
      return {
        shotName: g.shotName,
        versions: [{ sourceIndex: i, label: g.label }],
        activeVersionIndex: 0,
      };
    },
  };
}

const defaultOptions: ReportOptions = {
  format: 'csv',
  includeNotes: true,
  includeTimecodes: true,
  includeVersions: true,
  title: 'Dailies Report',
};

function createSampleRows(): ReportRow[] {
  return [
    {
      shotName: 'vfx_010_020',
      versionLabel: 'v3',
      status: 'approved',
      notes: ['Looks great', 'Final comp'],
      frameRange: '1-48',
      timecodeIn: '00:00:00:00',
      timecodeOut: '00:00:02:00',
      duration: '48 frames',
      setBy: 'director',
      setAt: '2026-02-18T10:00:00Z',
    },
    {
      shotName: 'vfx_010_030',
      versionLabel: 'v1',
      status: 'needs-work',
      notes: ['Fix edge blending'],
      frameRange: '1-120',
      timecodeIn: '00:00:00:00',
      timecodeOut: '00:00:05:00',
      duration: '120 frames',
      setBy: 'supervisor',
      setAt: '2026-02-18T11:30:00Z',
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReportExporter', () => {
  describe('escapeCSVField', () => {
    it('returns plain text unchanged', () => {
      expect(escapeCSVField('hello')).toBe('hello');
    });

    it('wraps fields with commas in double-quotes', () => {
      expect(escapeCSVField('a,b')).toBe('"a,b"');
    });

    it('doubles embedded double-quotes and wraps', () => {
      expect(escapeCSVField('say "hello"')).toBe('"say ""hello"""');
    });

    it('wraps fields containing newlines', () => {
      expect(escapeCSVField('line1\nline2')).toBe('"line1\nline2"');
    });
  });

  describe('buildReportRows', () => {
    it('produces one row per source', () => {
      const session = createMockSession([
        { name: 'shot_A.exr', duration: 48, fps: 24 },
        { name: 'shot_B.exr', duration: 100, fps: 24 },
      ]);
      const rows = buildReportRows(
        session,
        createMockNoteManager({}),
        createMockStatusManager({}),
        createMockVersionManager({}),
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]!.shotName).toBe('shot_A.exr');
      expect(rows[1]!.shotName).toBe('shot_B.exr');
    });

    it('uses version group shotName when available', () => {
      const session = createMockSession([{ name: 'file_v3.exr', duration: 48, fps: 24 }]);
      const rows = buildReportRows(
        session,
        createMockNoteManager({}),
        createMockStatusManager({}),
        createMockVersionManager({ 0: { shotName: 'vfx_010', label: 'v3' } }),
      );
      expect(rows[0]!.shotName).toBe('vfx_010');
      expect(rows[0]!.versionLabel).toBe('v3');
    });

    it('collects notes for each source', () => {
      const session = createMockSession([{ name: 'shot.exr', duration: 48, fps: 24 }]);
      const rows = buildReportRows(
        session,
        createMockNoteManager({ 0: [{ text: 'Note A' }, { text: 'Note B' }] }),
        createMockStatusManager({}),
        createMockVersionManager({}),
      );
      expect(rows[0]!.notes).toEqual(['Note A', 'Note B']);
    });

    it('REPORT-009: handles sources with no notes/status', () => {
      const session = createMockSession([{ name: 'clean.exr', duration: 24, fps: 24 }]);
      const rows = buildReportRows(
        session,
        createMockNoteManager({}),
        createMockStatusManager({}),
        createMockVersionManager({}),
      );
      expect(rows[0]!.status).toBe('pending');
      expect(rows[0]!.notes).toEqual([]);
      expect(rows[0]!.setBy).toBe('');
      expect(rows[0]!.setAt).toBe('');
      expect(rows[0]!.versionLabel).toBe('');
    });

    it('computes frame range and timecodes from default start frame', () => {
      const session = createMockSession([{ name: 'shot.exr', duration: 48, fps: 24 }]);
      const rows = buildReportRows(
        session,
        createMockNoteManager({}),
        createMockStatusManager({}),
        createMockVersionManager({}),
      );
      expect(rows[0]!.frameRange).toBe('1-48');
      expect(rows[0]!.timecodeIn).toBe('00:00:00:00');
      // TC Out is exclusive (first frame after last = frame 49)
      expect(rows[0]!.timecodeOut).toBe('00:00:02:00');
      expect(rows[0]!.duration).toBe('48 frames');
    });

    it('uses editorial startFrame for frame range', () => {
      const session = createMockSession([
        { name: 'shot.exr', duration: 48, fps: 24, startFrame: 1001 },
      ]);
      const rows = buildReportRows(
        session,
        createMockNoteManager({}),
        createMockStatusManager({}),
        createMockVersionManager({}),
      );
      expect(rows[0]!.frameRange).toBe('1001-1048');
    });

    it('includes setAt timestamp from status entry', () => {
      const session = createMockSession([{ name: 'shot.exr', duration: 24, fps: 24 }]);
      const rows = buildReportRows(
        session,
        createMockNoteManager({}),
        createMockStatusManager({ 0: { status: 'approved', setBy: 'lead', setAt: '2026-02-18T10:00:00Z' } }),
        createMockVersionManager({}),
      );
      expect(rows[0]!.setAt).toBe('2026-02-18T10:00:00Z');
    });
  });

  describe('generateCSV', () => {
    it('REPORT-001: produces valid CSV with header row', () => {
      const csv = generateCSV([], defaultOptions);
      const lines = csv.split('\r\n');
      // Header + trailing empty from final CRLF
      expect(lines[0]).toContain('Shot');
      expect(lines[0]).toContain('Version');
      expect(lines[0]).toContain('Status');
      expect(lines[0]).toContain('Notes');
      expect(lines[0]).toContain('Duration');
      expect(lines[0]).toContain('Reviewed By');
      expect(lines[0]).toContain('Status Date');
    });

    it('REPORT-002: escapes commas and quotes in notes', () => {
      const rows: ReportRow[] = [{
        shotName: 'shot',
        versionLabel: 'v1',
        status: 'approved',
        notes: ['Fix "edge" blending, and roto'],
        frameRange: '1-48',
        timecodeIn: '00:00:00:00',
        timecodeOut: '00:00:02:00',
        duration: '48 frames',
        setBy: 'user',
        setAt: '',
      }];
      const csv = generateCSV(rows, defaultOptions);
      const dataLine = csv.split('\r\n')[1]!;
      // The notes field should be double-quoted and inner quotes doubled
      expect(dataLine).toContain('"Fix ""edge"" blending, and roto"');
    });

    it('REPORT-003: includes all fields per row', () => {
      const rows = createSampleRows();
      const csv = generateCSV(rows, defaultOptions);
      const lines = csv.split('\r\n').filter(l => l.length > 0);
      expect(lines).toHaveLength(3); // header + 2 data rows

      const fields = lines[1]!.split(',');
      // Shot, Version, Status are first 3 columns
      expect(fields[0]).toBe('vfx_010_020');
      expect(fields[1]).toBe('v3');
      expect(fields[2]).toBe('approved');
    });

    it('uses CRLF line endings per RFC 4180', () => {
      const csv = generateCSV(createSampleRows(), defaultOptions);
      expect(csv).toContain('\r\n');
      expect(csv.endsWith('\r\n')).toBe(true);
    });

    it('REPORT-006: includes notes when includeNotes=true', () => {
      const rows = createSampleRows();
      const csv = generateCSV(rows, { ...defaultOptions, includeNotes: true });
      expect(csv).toContain('Looks great; Final comp');
    });

    it('REPORT-007: excludes notes when includeNotes=false', () => {
      const rows = createSampleRows();
      const csv = generateCSV(rows, { ...defaultOptions, includeNotes: false });
      expect(csv).not.toContain('Looks great');
      expect(csv).not.toContain('Fix edge blending');
      // Header should not contain Notes column
      const header = csv.split('\r\n')[0]!;
      expect(header).not.toContain('Notes');
    });

    it('REPORT-008: handles empty playlist (header only)', () => {
      const csv = generateCSV([], defaultOptions);
      const lines = csv.split('\r\n').filter(l => l.length > 0);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Shot');
    });

    it('excludes version column when includeVersions=false', () => {
      const rows = createSampleRows();
      const csv = generateCSV(rows, { ...defaultOptions, includeVersions: false });
      const header = csv.split('\r\n')[0]!;
      expect(header).not.toContain('Version');
      // Data should not contain the version label as a separate column
      const dataLine = csv.split('\r\n')[1]!;
      expect(dataLine).not.toContain('v3');
    });

    it('excludes timecode columns when includeTimecodes=false', () => {
      const rows = createSampleRows();
      const csv = generateCSV(rows, { ...defaultOptions, includeTimecodes: false });
      const header = csv.split('\r\n')[0]!;
      expect(header).not.toContain('TC In');
      expect(header).not.toContain('TC Out');
      expect(header).not.toContain('Frame In');
      expect(header).not.toContain('Frame Out');
    });
  });

  describe('generateHTML', () => {
    it('REPORT-004: produces valid HTML table', () => {
      const rows = createSampleRows();
      const html = generateHTML(rows, defaultOptions);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<table>');
      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('</html>');
    });

    it('REPORT-005: color-codes status cells', () => {
      const rows = createSampleRows();
      const html = generateHTML(rows, defaultOptions);
      // approved badge is green
      expect(html).toContain('#22c55e');
      // needs-work badge is orange
      expect(html).toContain('#f97316');
      // Badge markup
      expect(html).toContain('approved</span>');
      expect(html).toContain('needs-work</span>');
    });

    it('includes title and date range', () => {
      const rows = createSampleRows();
      const html = generateHTML(rows, { ...defaultOptions, title: 'My Dailies', dateRange: '2026-02-18' });
      expect(html).toContain('My Dailies');
      expect(html).toContain('2026-02-18');
    });

    it('includes summary counts', () => {
      const rows = createSampleRows();
      const html = generateHTML(rows, defaultOptions);
      expect(html).toContain('approved');
      expect(html).toContain('needs-work');
    });

    it('includes print media styles', () => {
      const html = generateHTML([], defaultOptions);
      expect(html).toContain('@media print');
    });

    it('escapes HTML special characters in shot names', () => {
      const rows: ReportRow[] = [{
        shotName: '<script>alert("xss")</script>',
        versionLabel: '',
        status: 'pending',
        notes: [],
        frameRange: '1-24',
        timecodeIn: '00:00:00:00',
        timecodeOut: '00:00:01:00',
        duration: '24 frames',
        setBy: '',
        setAt: '',
      }];
      const html = generateHTML(rows, defaultOptions);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes HTML in dateRange to prevent XSS', () => {
      const html = generateHTML([], { ...defaultOptions, dateRange: '<img onerror=alert(1)>' });
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    });

    it('escapes HTML in notes', () => {
      const rows: ReportRow[] = [{
        shotName: 'shot',
        versionLabel: '',
        status: 'pending',
        notes: ['<b>bold</b>'],
        frameRange: '1-24',
        timecodeIn: '00:00:00:00',
        timecodeOut: '00:00:01:00',
        duration: '24 frames',
        setBy: '',
        setAt: '',
      }];
      const html = generateHTML(rows, defaultOptions);
      expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    });

    it('includes Status Date column', () => {
      const rows = createSampleRows();
      const html = generateHTML(rows, defaultOptions);
      expect(html).toContain('<th>Status Date</th>');
      expect(html).toContain('2026-02-18T10:00:00Z');
    });

    it('omits Version/Notes/TC headers when options disable them', () => {
      const rows = createSampleRows();
      const html = generateHTML(rows, {
        ...defaultOptions,
        includeVersions: false,
        includeNotes: false,
        includeTimecodes: false,
      });
      expect(html).not.toContain('<th>Version</th>');
      expect(html).not.toContain('<th>Notes</th>');
      expect(html).not.toContain('<th>TC In</th>');
      expect(html).not.toContain('<th>TC Out</th>');
      expect(html).not.toContain('<th>Frame Range</th>');
      // Core columns still present
      expect(html).toContain('<th>Shot</th>');
      expect(html).toContain('<th>Status</th>');
      expect(html).toContain('<th>Duration</th>');
    });
  });

  describe('generateReport', () => {
    let originalCreateElement: typeof document.createElement;
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;

    beforeEach(() => {
      originalCreateElement = document.createElement.bind(document);
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
    });

    it('REPORT-010: creates downloadable blob', () => {
      const mockClick = vi.fn();
      const mockAnchor = {
        href: '',
        download: '',
        click: mockClick,
      };

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return mockAnchor as unknown as HTMLAnchorElement;
        return originalCreateElement(tag);
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      const mockUrl = 'blob:http://localhost/test-blob-url';
      URL.createObjectURL = vi.fn(() => mockUrl);
      URL.revokeObjectURL = vi.fn();

      const session = createMockSession([
        { name: 'shot.exr', duration: 48, fps: 24 },
      ]);

      generateReport(
        session,
        createMockNoteManager({}),
        createMockStatusManager({ 0: { status: 'approved', setBy: 'lead', setAt: '2026-02-18T10:00:00Z' } }),
        createMockVersionManager({}),
        defaultOptions,
      );

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(mockAnchor.href).toBe(mockUrl);
      expect(mockAnchor.download).toContain('Dailies_Report');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);

      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    });

    it('generates HTML format when specified', () => {
      const mockClick = vi.fn();
      const mockAnchor = { href: '', download: '', click: mockClick };

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return mockAnchor as unknown as HTMLAnchorElement;
        return originalCreateElement(tag);
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();

      const session = createMockSession([{ name: 'shot.exr', duration: 48, fps: 24 }]);

      generateReport(
        session,
        createMockNoteManager({}),
        createMockStatusManager({}),
        createMockVersionManager({}),
        { ...defaultOptions, format: 'html' },
      );

      expect(mockAnchor.download).toContain('.html');

      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    });
  });
});
