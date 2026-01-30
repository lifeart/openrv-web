/**
 * AnnotationJSONExporter - Export paint annotations to standalone JSON format
 *
 * Provides functionality to export paint engine annotations as structured JSON
 * that can be shared, backed up, or imported into other systems.
 */

import type { PaintEngine } from '../paint/PaintEngine';
import type { Annotation, PaintSnapshot } from '../paint/types';

/**
 * Options for annotation JSON export
 */
export interface AnnotationExportOptions {
  /** Include annotations from all frames (default: true) */
  includeAllFrames: boolean;
  /** Frame range to export [start, end], only used if includeAllFrames is false */
  frameRange?: [number, number];
  /** Include paint effect settings (hold, ghost, etc.) (default: true) */
  includeEffects: boolean;
  /** Pretty-print the JSON output (default: true) */
  prettify: boolean;
}

/**
 * Exported annotation data structure
 */
export interface AnnotationExportData {
  /** Export format version for future compatibility */
  version: 1;
  /** Export timestamp */
  exportedAt: string;
  /** Source application identifier */
  source: 'openrv-web';
  /** Paint effects settings (if includeEffects is true) */
  effects?: {
    hold: boolean;
    ghost: boolean;
    ghostBefore: number;
    ghostAfter: number;
  };
  /** Frame range included in export */
  frameRange: {
    start: number;
    end: number;
    totalFrames: number;
  };
  /** Statistics about exported annotations */
  statistics: {
    totalAnnotations: number;
    penStrokes: number;
    textAnnotations: number;
    shapeAnnotations: number;
    annotatedFrames: number;
  };
  /** Annotations grouped by frame */
  frames: Record<number, Annotation[]>;
}

const DEFAULT_EXPORT_OPTIONS: AnnotationExportOptions = {
  includeAllFrames: true,
  includeEffects: true,
  prettify: true,
};

/**
 * Export annotations from a PaintEngine to JSON format
 *
 * @param paintEngine - The paint engine containing annotations
 * @param options - Export options
 * @returns JSON string of exported annotations
 */
export function exportAnnotationsJSON(
  paintEngine: PaintEngine,
  options?: Partial<AnnotationExportOptions>
): string {
  const opts: AnnotationExportOptions = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const snapshot = paintEngine.toJSON() as PaintSnapshot;

  // Filter frames based on options
  let frames: Record<number, Annotation[]> = {};
  const frameNumbers = Object.keys(snapshot.frames)
    .map(Number)
    .sort((a, b) => a - b);

  if (opts.includeAllFrames || !opts.frameRange) {
    frames = { ...snapshot.frames };
  } else {
    const [startFrame, endFrame] = opts.frameRange;
    for (const frameNum of frameNumbers) {
      if (frameNum >= startFrame && frameNum <= endFrame) {
        frames[frameNum] = snapshot.frames[frameNum]!;
      }
    }
  }

  // Calculate statistics
  let penStrokes = 0;
  let textAnnotations = 0;
  let shapeAnnotations = 0;
  let totalAnnotations = 0;

  for (const annotations of Object.values(frames)) {
    for (const annotation of annotations) {
      totalAnnotations++;
      if (annotation.type === 'pen') penStrokes++;
      else if (annotation.type === 'text') textAnnotations++;
      else if (annotation.type === 'shape') shapeAnnotations++;
    }
  }

  // Determine frame range
  const includedFrameNumbers = Object.keys(frames).map(Number).sort((a, b) => a - b);
  const startFrame = includedFrameNumbers[0] ?? 0;
  const endFrame = includedFrameNumbers[includedFrameNumbers.length - 1] ?? 0;

  // Build export data
  const exportData: AnnotationExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'openrv-web',
    frameRange: {
      start: startFrame,
      end: endFrame,
      totalFrames: includedFrameNumbers.length,
    },
    statistics: {
      totalAnnotations,
      penStrokes,
      textAnnotations,
      shapeAnnotations,
      annotatedFrames: includedFrameNumbers.length,
    },
    frames,
  };

  // Include effects if requested
  if (opts.includeEffects) {
    exportData.effects = { ...snapshot.effects };
  }

  // Serialize to JSON
  if (opts.prettify) {
    return JSON.stringify(exportData, null, 2);
  }
  return JSON.stringify(exportData);
}

/**
 * Download annotations as a JSON file
 *
 * @param paintEngine - The paint engine containing annotations
 * @param filename - Filename for the download (without extension)
 * @param options - Export options
 */
export function downloadAnnotationsJSON(
  paintEngine: PaintEngine,
  filename: string,
  options?: Partial<AnnotationExportOptions>
): void {
  const json = exportAnnotationsJSON(paintEngine, options);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parse and validate imported annotation JSON
 *
 * @param jsonString - JSON string to parse
 * @returns Parsed annotation data or null if invalid
 */
export function parseAnnotationsJSON(jsonString: string): AnnotationExportData | null {
  try {
    const data = JSON.parse(jsonString);

    // Validate structure
    if (!data || typeof data !== 'object') return null;
    if (data.version !== 1) return null;
    if (data.source !== 'openrv-web') return null;
    if (!data.frames || typeof data.frames !== 'object') return null;

    return data as AnnotationExportData;
  } catch {
    return null;
  }
}
