/**
 * AnnotationPDFExporter - Export paint annotations to PDF format
 *
 * Uses browser's native print functionality with a custom print stylesheet
 * to generate PDFs without requiring external libraries.
 */

import type { PaintEngine } from '../../paint/PaintEngine';
import type { Session } from '../../core/session/Session';
import type { Annotation, PaintSnapshot } from '../../paint/types';

/**
 * Options for PDF annotation export
 */
export interface PDFExportOptions {
  /** Include frame thumbnails for each annotated frame (default: true) */
  includeFrameThumbnails: boolean;
  /** Thumbnail size preset (default: 'medium') */
  thumbnailSize: 'small' | 'medium' | 'large';
  /** Include timecode information (default: true) */
  includeTimecodes: boolean;
  /** Include a list of all annotations at the end (default: true) */
  includeAnnotationList: boolean;
  /** Document title */
  title?: string;
}

const DEFAULT_PDF_OPTIONS: PDFExportOptions = {
  includeFrameThumbnails: true,
  thumbnailSize: 'medium',
  includeTimecodes: true,
  includeAnnotationList: true,
};

const THUMBNAIL_SIZES = {
  small: { width: 160, height: 90 },
  medium: { width: 320, height: 180 },
  large: { width: 640, height: 360 },
};

/**
 * Format frame number as timecode
 */
function frameToTimecode(frame: number, fps: number): string {
  // Guard against division by zero
  if (fps <= 0) {
    return '00:00:00:00';
  }
  const totalSeconds = frame / fps;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = frame % fps;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${Math.floor(frames).toString().padStart(2, '0')}`;
}

/**
 * Get annotation type display name
 */
function getAnnotationTypeName(type: string): string {
  switch (type) {
    case 'pen':
      return 'Pen Stroke';
    case 'text':
      return 'Text';
    case 'shape':
      return 'Shape';
    default:
      return type;
  }
}

/**
 * Create print stylesheet for PDF generation
 */
function createPrintStyles(): string {
  return `
    @media print {
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12pt;
        line-height: 1.5;
        color: #333;
        margin: 0;
        padding: 20px;
      }

      .pdf-header {
        text-align: center;
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 2px solid #333;
      }

      .pdf-header h1 {
        margin: 0 0 10px 0;
        font-size: 24pt;
      }

      .pdf-header .subtitle {
        color: #666;
        font-size: 10pt;
      }

      .frame-section {
        page-break-inside: avoid;
        margin-bottom: 30px;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 15px;
      }

      .frame-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
      }

      .frame-number {
        font-weight: bold;
        font-size: 14pt;
      }

      .timecode {
        font-family: monospace;
        color: #666;
        font-size: 10pt;
      }

      .thumbnail-container {
        text-align: center;
        margin-bottom: 15px;
      }

      .thumbnail {
        max-width: 100%;
        border: 1px solid #ddd;
        border-radius: 4px;
      }

      .annotations-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .annotation-item {
        padding: 8px;
        margin-bottom: 8px;
        background: #f9f9f9;
        border-radius: 4px;
        border-left: 3px solid #007bff;
      }

      .annotation-type {
        font-weight: bold;
        color: #007bff;
        font-size: 10pt;
      }

      .annotation-details {
        font-size: 9pt;
        color: #666;
        margin-top: 4px;
      }

      .summary-section {
        page-break-before: always;
        margin-top: 30px;
      }

      .summary-section h2 {
        font-size: 18pt;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 1px solid #333;
      }

      .summary-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10pt;
      }

      .summary-table th,
      .summary-table td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid #ddd;
      }

      .summary-table th {
        background: #f5f5f5;
        font-weight: bold;
      }

      .color-swatch {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 1px solid #333;
        border-radius: 2px;
        margin-right: 6px;
        vertical-align: middle;
      }

      @page {
        size: A4;
        margin: 20mm;
      }
    }
  `;
}

/**
 * Build HTML content for PDF export
 */
function buildPDFContent(
  paintEngine: PaintEngine,
  session: Session,
  frameThumbnails: Map<number, string>,
  options: PDFExportOptions
): string {
  const snapshot = paintEngine.toJSON() as PaintSnapshot;
  const fps = session.fps;
  const title = options.title || 'Annotation Report';

  // Get sorted frame numbers
  const frameNumbers = Object.keys(snapshot.frames)
    .map(Number)
    .sort((a, b) => a - b);

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>${createPrintStyles()}</style>
    </head>
    <body>
      <div class="pdf-header">
        <h1>${title}</h1>
        <div class="subtitle">
          Generated: ${new Date().toLocaleString()} |
          Total Frames: ${frameNumbers.length} |
          FPS: ${fps}
        </div>
      </div>
  `;

  // Add frame sections
  for (const frameNum of frameNumbers) {
    const annotations = snapshot.frames[frameNum] || [];
    const timecode = options.includeTimecodes ? frameToTimecode(frameNum, fps) : '';
    const thumbnail = frameThumbnails.get(frameNum);

    html += `
      <div class="frame-section">
        <div class="frame-header">
          <span class="frame-number">Frame ${frameNum}</span>
          ${options.includeTimecodes ? `<span class="timecode">${timecode}</span>` : ''}
        </div>
    `;

    if (options.includeFrameThumbnails && thumbnail) {
      const size = THUMBNAIL_SIZES[options.thumbnailSize];
      html += `
        <div class="thumbnail-container">
          <img class="thumbnail" src="${thumbnail}" width="${size.width}" height="${size.height}" alt="Frame ${frameNum}">
        </div>
      `;
    }

    html += `<ul class="annotations-list">`;
    for (const annotation of annotations) {
      const colorStr = getAnnotationColorString(annotation);
      html += `
        <li class="annotation-item">
          <span class="annotation-type">${getAnnotationTypeName(annotation.type)}</span>
          ${getAnnotationDetailsHTML(annotation)}
          ${colorStr ? `<span class="color-swatch" style="background: ${colorStr}"></span>` : ''}
        </li>
      `;
    }
    html += `</ul></div>`;
  }

  // Add summary section
  if (options.includeAnnotationList) {
    html += buildSummarySection(snapshot, fps);
  }

  html += `</body></html>`;
  return html;
}

/**
 * Get annotation color as CSS string
 */
function getAnnotationColorString(annotation: Annotation): string {
  if (annotation.type === 'pen') {
    const [r, g, b, a] = annotation.color;
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  }
  if (annotation.type === 'text') {
    const [r, g, b, a] = annotation.color;
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  }
  if (annotation.type === 'shape') {
    const [r, g, b, a] = annotation.strokeColor;
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  }
  return '';
}

/**
 * Get annotation details as HTML
 */
function getAnnotationDetailsHTML(annotation: Annotation): string {
  if (annotation.type === 'text') {
    return `<div class="annotation-details">Text: "${annotation.text}"</div>`;
  }
  if (annotation.type === 'pen') {
    return `<div class="annotation-details">Points: ${annotation.points.length}</div>`;
  }
  if (annotation.type === 'shape') {
    return `<div class="annotation-details">Shape: ${annotation.shapeType}</div>`;
  }
  return '';
}

/**
 * Build summary section HTML
 */
function buildSummarySection(snapshot: PaintSnapshot, fps: number): string {
  let penCount = 0;
  let textCount = 0;
  let shapeCount = 0;

  const allAnnotations: Array<{ frame: number; annotation: Annotation }> = [];

  for (const [frameKey, annotations] of Object.entries(snapshot.frames)) {
    const frame = Number(frameKey);
    for (const annotation of annotations) {
      allAnnotations.push({ frame, annotation });
      if (annotation.type === 'pen') penCount++;
      else if (annotation.type === 'text') textCount++;
      else if (annotation.type === 'shape') shapeCount++;
    }
  }

  return `
    <div class="summary-section">
      <h2>Annotation Summary</h2>
      <p>
        <strong>Total Annotations:</strong> ${allAnnotations.length} |
        <strong>Pen Strokes:</strong> ${penCount} |
        <strong>Text:</strong> ${textCount} |
        <strong>Shapes:</strong> ${shapeCount}
      </p>

      <table class="summary-table">
        <thead>
          <tr>
            <th>Frame</th>
            <th>Timecode</th>
            <th>Type</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${allAnnotations.map(({ frame, annotation }) => `
            <tr>
              <td>${frame}</td>
              <td><code>${frameToTimecode(frame, fps)}</code></td>
              <td>${getAnnotationTypeName(annotation.type)}</td>
              <td>${getAnnotationSummary(annotation)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Get short annotation summary for table
 */
function getAnnotationSummary(annotation: Annotation): string {
  if (annotation.type === 'text') {
    const text = annotation.text.length > 30 ? annotation.text.substring(0, 30) + '...' : annotation.text;
    return `"${text}"`;
  }
  if (annotation.type === 'pen') {
    return `${annotation.points.length} points`;
  }
  if (annotation.type === 'shape') {
    return annotation.shapeType;
  }
  return '';
}

/**
 * Export annotations as a PDF using browser print functionality
 *
 * @param paintEngine - The paint engine containing annotations
 * @param session - The session for timecode calculation
 * @param renderFrame - Function to render a frame and return canvas data URL
 * @param options - Export options
 */
export async function exportAnnotationsPDF(
  paintEngine: PaintEngine,
  session: Session,
  renderFrame: (frame: number) => Promise<HTMLCanvasElement>,
  options?: Partial<PDFExportOptions>
): Promise<void> {
  const opts: PDFExportOptions = { ...DEFAULT_PDF_OPTIONS, ...options };
  const snapshot = paintEngine.toJSON() as PaintSnapshot;

  // Get sorted frame numbers
  const frameNumbers = Object.keys(snapshot.frames)
    .map(Number)
    .sort((a, b) => a - b);

  // Render thumbnails if requested
  const thumbnails = new Map<number, string>();
  if (opts.includeFrameThumbnails) {
    for (const frameNum of frameNumbers) {
      try {
        const canvas = await renderFrame(frameNum);
        const size = THUMBNAIL_SIZES[opts.thumbnailSize];

        // Resize canvas to thumbnail size
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = size.width;
        thumbCanvas.height = size.height;
        const ctx = thumbCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, 0, size.width, size.height);
          thumbnails.set(frameNum, thumbCanvas.toDataURL('image/jpeg', 0.85));
        }
      } catch (err) {
        console.warn(`Failed to render thumbnail for frame ${frameNum}:`, err);
      }
    }
  }

  // Build HTML content
  const htmlContent = buildPDFContent(paintEngine, session, thumbnails, opts);

  // Open print window
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    throw new Error('Failed to open print window. Please allow popups for this site.');
  }

  printWindow.document.write(htmlContent);
  printWindow.document.close();

  // Wait for images to load, then trigger print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
}

/**
 * Generate a preview of the PDF content without triggering print
 *
 * @param paintEngine - The paint engine containing annotations
 * @param session - The session for timecode calculation
 * @param options - Export options
 * @returns HTML string of the preview content
 */
export function previewAnnotationsPDF(
  paintEngine: PaintEngine,
  session: Session,
  options?: Partial<PDFExportOptions>
): string {
  const opts: PDFExportOptions = { ...DEFAULT_PDF_OPTIONS, ...options };
  return buildPDFContent(paintEngine, session, new Map(), opts);
}
