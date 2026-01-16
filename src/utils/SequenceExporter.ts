/**
 * Sequence Export Utilities
 * Export multiple frames as individual image files
 */

import { ExportFormat } from './FrameExporter';

export interface SequenceExportOptions {
  format: ExportFormat;
  quality: number;
  startFrame: number;
  endFrame: number;
  includeAnnotations: boolean;
  filenamePattern: string;  // e.g., "frame_####" where # is replaced with frame number
  padLength: number;        // Number of digits for frame padding (default 4)
}

export interface SequenceExportProgress {
  currentFrame: number;
  totalFrames: number;
  percent: number;
  cancelled: boolean;
}

export type ProgressCallback = (progress: SequenceExportProgress) => void;
export type RenderFrameCallback = (frame: number) => Promise<HTMLCanvasElement>;

/**
 * Generate filename for a specific frame
 */
export function generateFilename(
  pattern: string,
  frame: number,
  padLength: number,
  format: ExportFormat
): string {
  const paddedFrame = String(frame).padStart(padLength, '0');

  // Replace # characters with frame number
  let filename = pattern.replace(/#+/g, paddedFrame);

  // If pattern doesn't have #, append frame number
  if (!pattern.includes('#')) {
    filename = `${pattern}_${paddedFrame}`;
  }

  return `${filename}.${format}`;
}

/**
 * Export a single frame to a downloadable file
 */
function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  format: ExportFormat,
  quality: number
): void {
  const mimeTypes: Record<ExportFormat, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };

  const dataUrl = format === 'png'
    ? canvas.toDataURL(mimeTypes[format])
    : canvas.toDataURL(mimeTypes[format], quality);

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export a sequence of frames
 * Uses a render callback to get the canvas for each frame
 */
export async function exportSequence(
  options: SequenceExportOptions,
  renderFrame: RenderFrameCallback,
  onProgress?: ProgressCallback,
  cancellationToken?: { cancelled: boolean }
): Promise<{ success: boolean; exportedFrames: number; error?: string }> {
  const { format, quality, startFrame, endFrame, filenamePattern, padLength } = options;
  const totalFrames = endFrame - startFrame + 1;
  let exportedFrames = 0;

  for (let frame = startFrame; frame <= endFrame; frame++) {
    // Check for cancellation
    if (cancellationToken?.cancelled) {
      return {
        success: false,
        exportedFrames,
        error: 'Export cancelled by user',
      };
    }

    try {
      // Render the frame
      const canvas = await renderFrame(frame);

      // Generate filename
      const filename = generateFilename(filenamePattern, frame, padLength, format);

      // Download
      downloadCanvas(canvas, filename, format, quality);

      exportedFrames++;

      // Report progress
      if (onProgress) {
        onProgress({
          currentFrame: frame,
          totalFrames,
          percent: Math.round((exportedFrames / totalFrames) * 100),
          cancelled: false,
        });
      }

      // Small delay to prevent browser from being overwhelmed
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (err) {
      console.error(`Failed to export frame ${frame}:`, err);
      return {
        success: false,
        exportedFrames,
        error: `Failed to export frame ${frame}: ${err}`,
      };
    }
  }

  return {
    success: true,
    exportedFrames,
  };
}

/**
 * Export sequence as a ZIP file (requires JSZip library)
 * Falls back to individual downloads if JSZip is not available
 */
export async function exportSequenceAsZip(
  options: SequenceExportOptions,
  renderFrame: RenderFrameCallback,
  onProgress?: ProgressCallback,
  cancellationToken?: { cancelled: boolean }
): Promise<{ success: boolean; exportedFrames: number; error?: string }> {
  // Check if JSZip is available
  const JSZip = (window as unknown as { JSZip?: unknown }).JSZip;
  if (!JSZip) {
    console.warn('JSZip not available, falling back to individual downloads');
    return exportSequence(options, renderFrame, onProgress, cancellationToken);
  }

  // For now, just use individual downloads
  // ZIP support can be added later with JSZip integration
  return exportSequence(options, renderFrame, onProgress, cancellationToken);
}

/**
 * Calculate estimated export size
 */
export function estimateExportSize(
  width: number,
  height: number,
  frameCount: number,
  format: ExportFormat
): string {
  // Rough estimates based on format
  const bytesPerPixel: Record<ExportFormat, number> = {
    png: 3,      // PNG with compression
    jpeg: 0.5,   // JPEG compressed
    webp: 0.4,   // WebP compressed
  };

  const pixelCount = width * height;
  const bytesPerFrame = pixelCount * bytesPerPixel[format];
  const totalBytes = bytesPerFrame * frameCount;

  if (totalBytes < 1024 * 1024) {
    return `~${Math.round(totalBytes / 1024)} KB`;
  } else if (totalBytes < 1024 * 1024 * 1024) {
    return `~${Math.round(totalBytes / (1024 * 1024))} MB`;
  } else {
    return `~${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}
