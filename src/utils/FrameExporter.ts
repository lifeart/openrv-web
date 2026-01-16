/**
 * Frame export utilities
 * Captures and exports frames with applied color adjustments
 */

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportOptions {
  format: ExportFormat;
  quality: number;  // 0-1 for JPEG/WebP
  includeAnnotations: boolean;
  filename?: string;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'png',
  quality: 0.92,
  includeAnnotations: true,
};

/**
 * Export a canvas to a downloadable file
 */
export function exportCanvas(
  canvas: HTMLCanvasElement,
  options: Partial<ExportOptions> = {}
): void {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };

  // Get MIME type
  const mimeTypes: Record<ExportFormat, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  const mimeType = mimeTypes[opts.format];

  // Convert to data URL
  const dataUrl = opts.format === 'png'
    ? canvas.toDataURL(mimeType)
    : canvas.toDataURL(mimeType, opts.quality);

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = opts.filename || `frame_${timestamp}.${opts.format}`;

  // Trigger download
  downloadDataUrl(dataUrl, filename);
}

/**
 * Export multiple canvases merged together (e.g., image + annotations)
 */
export function exportMergedCanvases(
  canvases: HTMLCanvasElement[],
  width: number,
  height: number,
  options: Partial<ExportOptions> = {}
): void {
  // Create temporary canvas for merging
  const mergedCanvas = document.createElement('canvas');
  mergedCanvas.width = width;
  mergedCanvas.height = height;
  const ctx = mergedCanvas.getContext('2d');

  if (!ctx) {
    console.error('Failed to create merge canvas context');
    return;
  }

  // Draw each canvas in order
  for (const canvas of canvases) {
    ctx.drawImage(canvas, 0, 0, width, height);
  }

  // Export merged result
  exportCanvas(mergedCanvas, options);
}

/**
 * Capture frame from video element
 */
export function captureVideoFrame(
  video: HTMLVideoElement,
  options: Partial<ExportOptions> = {}
): void {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to create canvas context');
    return;
  }

  ctx.drawImage(video, 0, 0);
  exportCanvas(canvas, options);
}

/**
 * Download a data URL as a file
 */
function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Convert a canvas to a Blob
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ExportFormat = 'png',
  quality = 0.92
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const mimeTypes: Record<ExportFormat, string> = {
      png: 'image/png',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    };

    canvas.toBlob(
      (blob) => resolve(blob),
      mimeTypes[format],
      format === 'png' ? undefined : quality
    );
  });
}

/**
 * Copy canvas to clipboard (if supported)
 */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await canvasToBlob(canvas, 'png');
    if (!blob) return false;

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);

    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}
