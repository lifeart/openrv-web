/**
 * Dailies Report Exporter
 *
 * Generates CSV and HTML reports from a dailies review session.
 * Each row represents one source (shot) with its status, notes,
 * version info, frame range, and timecodes.
 */

import type { ShotStatus } from '../core/session/StatusManager';
import { STATUS_COLORS } from '../core/session/StatusManager';
import { frameToTimecode, formatTimecode } from '../ui/components/TimecodeDisplay';

// ---------------------------------------------------------------------------
// Data Model
// ---------------------------------------------------------------------------

export interface ReportRow {
  shotName: string;
  versionLabel: string;
  status: ShotStatus;
  notes: string[];
  frameRange: string;
  timecodeIn: string;
  timecodeOut: string;
  duration: string;
  setBy: string;
  setAt: string;
}

export interface ReportOptions {
  format: 'csv' | 'html';
  includeNotes: boolean;
  includeTimecodes: boolean;
  includeVersions: boolean;
  title: string;
  dateRange?: string;
}

// ---------------------------------------------------------------------------
// Minimal interfaces so the exporter does not depend on full Session/Manager
// types. Callers pass the real objects which satisfy these shapes.
// ---------------------------------------------------------------------------

export interface ReportSource {
  name: string;
  duration: number; // total frames
  fps: number;
  startFrame?: number; // editorial start frame (default 1)
}

export interface ReportNoteManager {
  getNotesForSource(sourceIndex: number): { text: string }[];
}

export interface ReportStatusManager {
  getStatus(sourceIndex: number): ShotStatus;
  getStatusEntry(sourceIndex: number): { setBy: string; setAt: string } | undefined;
}

export interface ReportVersionManager {
  getGroupForSource(sourceIndex: number): {
    shotName: string;
    versions: { sourceIndex: number; label: string }[];
    activeVersionIndex: number;
  } | undefined;
}

export interface ReportSession {
  sourceCount: number;
  getSourceByIndex(index: number): ReportSource | null;
  fps: number;
}

// ---------------------------------------------------------------------------
// CSV helpers (RFC 4180)
// ---------------------------------------------------------------------------

const CSV_HEADER_CORE = ['Shot', 'Status'];
const CSV_HEADER_VERSION = ['Version'];
const CSV_HEADER_NOTES = ['Notes'];
const CSV_HEADER_TC = ['Frame In', 'Frame Out', 'TC In', 'TC Out'];
const CSV_HEADER_TAIL = ['Duration', 'Reviewed By', 'Status Date'];

/**
 * Escape a single field for CSV per RFC 4180:
 * - If the field contains a comma, double-quote, or newline, wrap in double-quotes
 * - Double-quotes inside the field are escaped by doubling them
 */
export function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// ---------------------------------------------------------------------------
// Row builder
// ---------------------------------------------------------------------------

/**
 * Build report rows from session data. One row per source.
 */
export function buildReportRows(
  session: ReportSession,
  noteManager: ReportNoteManager,
  statusManager: ReportStatusManager,
  versionManager: ReportVersionManager,
): ReportRow[] {
  const rows: ReportRow[] = [];

  for (let i = 0; i < session.sourceCount; i++) {
    const source = session.getSourceByIndex(i);
    if (!source) continue;

    const fps = source.fps || session.fps || 24;
    const duration = source.duration || 0;

    // Shot name: prefer version group shot name, fall back to source name
    const versionGroup = versionManager.getGroupForSource(i);
    const shotName = versionGroup?.shotName ?? source.name;

    // Version label
    let versionLabel = '';
    if (versionGroup) {
      const entry = versionGroup.versions.find(v => v.sourceIndex === i);
      versionLabel = entry?.label ?? '';
    }

    // Status
    const status = statusManager.getStatus(i);
    const statusEntry = statusManager.getStatusEntry(i);
    const setBy = statusEntry?.setBy ?? '';
    const setAt = statusEntry?.setAt ?? '';

    // Notes
    const notes = noteManager.getNotesForSource(i).map(n => n.text);

    // Frame range using editorial start frame
    const startFrame = source.startFrame ?? 1;
    const frameIn = startFrame;
    const frameOut = startFrame + duration - 1;
    const frameRange = duration > 0 ? `${frameIn}-${frameOut}` : '';

    // Timecodes (TC Out is exclusive: first frame after last)
    const tcIn = formatTimecode(frameToTimecode(frameIn, fps, 0));
    const tcOut = duration > 0
      ? formatTimecode(frameToTimecode(frameOut + 1, fps, 0))
      : tcIn;

    // Duration string
    const durationStr = duration > 0 ? `${duration} frames` : '0 frames';

    rows.push({
      shotName,
      versionLabel,
      status,
      notes,
      frameRange,
      timecodeIn: tcIn,
      timecodeOut: tcOut,
      duration: durationStr,
      setBy,
      setAt,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// CSV generation
// ---------------------------------------------------------------------------

/**
 * Build the CSV header array based on which columns are enabled.
 */
function buildCSVHeaders(options: ReportOptions): string[] {
  const h = [...CSV_HEADER_CORE];
  if (options.includeVersions) h.splice(1, 0, ...CSV_HEADER_VERSION);
  if (options.includeNotes) h.push(...CSV_HEADER_NOTES);
  if (options.includeTimecodes) h.push(...CSV_HEADER_TC);
  h.push(...CSV_HEADER_TAIL);
  return h;
}

/**
 * Generate a CSV string from report rows. Uses CRLF line endings per RFC 4180.
 */
export function generateCSV(rows: ReportRow[], options: ReportOptions): string {
  const lines: string[] = [];

  // Header
  lines.push(buildCSVHeaders(options).map(escapeCSVField).join(','));

  // Data rows
  for (const row of rows) {
    const fields: string[] = [row.shotName];
    if (options.includeVersions) fields.push(row.versionLabel);
    fields.push(row.status);
    if (options.includeNotes) fields.push(row.notes.join('; '));
    if (options.includeTimecodes) {
      fields.push(
        row.frameRange.split('-')[0] ?? '',
        row.frameRange.split('-')[1] ?? '',
        row.timecodeIn,
        row.timecodeOut,
      );
    }
    fields.push(row.duration, row.setBy, row.setAt);
    lines.push(fields.map(escapeCSVField).join(','));
  }

  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function buildHTMLHeaders(options: ReportOptions): string {
  const ths: string[] = ['<th>Shot</th>'];
  if (options.includeVersions) ths.push('<th>Version</th>');
  ths.push('<th>Status</th>');
  if (options.includeNotes) ths.push('<th>Notes</th>');
  if (options.includeTimecodes) ths.push('<th>Frame Range</th>', '<th>TC In</th>', '<th>TC Out</th>');
  ths.push('<th>Duration</th>', '<th>Reviewed By</th>', '<th>Status Date</th>');
  return ths.join('');
}

function statusBadgeHTML(status: ShotStatus): string {
  const color = STATUS_COLORS[status] ?? '#94a3b8';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:#fff;font-weight:600;font-size:0.85em;">${escapeHTML(status)}</span>`;
}

/**
 * Generate an HTML report string from report rows.
 */
export function generateHTML(rows: ReportRow[], options: ReportOptions): string {
  const title = options.title || 'Dailies Report';
  const dateRange = options.dateRange ? `<p style="color:#666;">${escapeHTML(options.dateRange)}</p>` : '';

  // Summary counts
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  const summaryParts = Object.entries(counts)
    .map(([s, c]) => `${statusBadgeHTML(s as ShotStatus)} ${c}`)
    .join(' &nbsp; ');

  // Table rows (columns match dynamic headers)
  const tableRows = rows.map(row => {
    const cells: string[] = [`<td>${escapeHTML(row.shotName)}</td>`];
    if (options.includeVersions) cells.push(`<td>${escapeHTML(row.versionLabel)}</td>`);
    cells.push(`<td>${statusBadgeHTML(row.status)}</td>`);
    if (options.includeNotes) cells.push(`<td>${row.notes.map(n => escapeHTML(n)).join('<br>')}</td>`);
    if (options.includeTimecodes) {
      cells.push(
        `<td>${escapeHTML(row.frameRange)}</td>`,
        `<td>${escapeHTML(row.timecodeIn)}</td>`,
        `<td>${escapeHTML(row.timecodeOut)}</td>`,
      );
    }
    cells.push(
      `<td>${escapeHTML(row.duration)}</td>`,
      `<td>${escapeHTML(row.setBy)}</td>`,
      `<td>${escapeHTML(row.setAt)}</td>`,
    );
    return `<tr>${cells.join('')}</tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHTML(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 2em; color: #1a1a2e; }
  h1 { margin-bottom: 0.25em; }
  table { border-collapse: collapse; width: 100%; margin-top: 1em; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f0f0f5; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }
  .summary { margin: 0.5em 0 1em; }
  @media print {
    body { margin: 0.5em; }
    table { font-size: 0.85em; }
  }
</style>
</head>
<body>
<h1>${escapeHTML(title)}</h1>
${dateRange}
<div class="summary">${summaryParts}</div>
<table>
<thead>
<tr>
  ${buildHTMLHeaders(options)}
</tr>
</thead>
<tbody>
${tableRows}
</tbody>
</table>
</body>
</html>`;
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Download trigger
// ---------------------------------------------------------------------------

/**
 * Generate report and trigger browser download.
 */
export function generateReport(
  session: ReportSession,
  noteManager: ReportNoteManager,
  statusManager: ReportStatusManager,
  versionManager: ReportVersionManager,
  options: ReportOptions,
): void {
  const rows = buildReportRows(session, noteManager, statusManager, versionManager);

  let content: string;
  let mimeType: string;
  let extension: string;

  if (options.format === 'html') {
    content = generateHTML(rows, options);
    mimeType = 'text/html';
    extension = 'html';
  } else {
    content = generateCSV(rows, options);
    mimeType = 'text/csv';
    extension = 'csv';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${options.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
