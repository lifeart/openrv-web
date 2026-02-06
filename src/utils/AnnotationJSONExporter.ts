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

/**
 * Options for applying imported annotations
 */
export interface AnnotationApplyOptions {
  /** How to apply: 'replace' clears existing annotations first, 'merge' adds to existing */
  mode: 'replace' | 'merge';
  /** Frame offset to shift all imported annotations by (default: 0) */
  frameOffset?: number;
}

const DEFAULT_APPLY_OPTIONS: AnnotationApplyOptions = {
  mode: 'replace',
  frameOffset: 0,
};

/**
 * Apply parsed annotation data to a PaintEngine
 *
 * @param paintEngine - The paint engine to apply annotations to
 * @param data - Parsed annotation data from parseAnnotationsJSON()
 * @param options - Apply options (replace/merge mode, frame offset)
 * @returns Number of annotations applied
 */
export function applyAnnotationsJSON(
  paintEngine: PaintEngine,
  data: AnnotationExportData,
  options?: Partial<AnnotationApplyOptions>
): number {
  const opts: AnnotationApplyOptions = { ...DEFAULT_APPLY_OPTIONS, ...options };
  const frameOffset = opts.frameOffset ?? 0;

  if (opts.mode === 'replace') {
    paintEngine.clearAll();
  }

  // Collect all annotations with offset applied, reassigning IDs to avoid collisions
  const allAnnotations: Annotation[] = [];

  for (const [frameStr, annotations] of Object.entries(data.frames)) {
    const originalFrame = Number(frameStr);
    const targetFrame = originalFrame + frameOffset;

    for (const annotation of annotations) {
      // Clone the annotation with updated frame and new unique frame target
      const imported: Annotation = {
        ...annotation,
        frame: targetFrame,
        startFrame: (annotation.startFrame ?? originalFrame) + frameOffset,
      };
      allAnnotations.push(imported);
    }
  }

  // Apply effects if present
  const effects = data.effects ?? undefined;

  // Use loadFromAnnotations which handles ID collision avoidance
  // In merge mode, we need to add individually to preserve existing annotations
  if (opts.mode === 'merge') {
    for (const annotation of allAnnotations) {
      // Strip the id so addAnnotation assigns a new unique one,
      // avoiding ID collisions with existing annotations
      const { id: _stripId, ...withoutId } = annotation;
      paintEngine.addAnnotation(withoutId as Annotation);
    }
    if (effects) {
      paintEngine.setHoldMode(effects.hold);
      paintEngine.setGhostMode(effects.ghost, effects.ghostBefore, effects.ghostAfter);
    }
  } else {
    paintEngine.loadFromAnnotations(allAnnotations, effects);
  }

  return allAnnotations.length;
}
