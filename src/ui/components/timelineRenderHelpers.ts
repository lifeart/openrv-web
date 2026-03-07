/**
 * Shared rendering helpers for Timeline and TimelineMagnifier.
 *
 * These functions encapsulate common canvas drawing primitives so that both
 * the main Timeline and the TimelineMagnifier can produce visually consistent
 * output without duplicating code.
 */

/**
 * Draw the playhead indicator (vertical line + top circle).
 */
export function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  trackY: number,
  trackHeight: number,
  color: string,
  shadowColor: string,
  circleRadius: number,
): void {
  // Glow
  ctx.fillStyle = shadowColor;
  ctx.beginPath();
  ctx.arc(x, trackY + trackHeight / 2, 14, 0, Math.PI * 2);
  ctx.fill();

  // Line
  ctx.fillStyle = color;
  ctx.fillRect(x - 1.5, trackY - 10, 3, trackHeight + 20);

  // Circle (drag handle)
  ctx.beginPath();
  ctx.arc(x, trackY - 10, circleRadius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw in/out bracket markers at the given x positions.
 */
export function drawInOutBrackets(
  ctx: CanvasRenderingContext2D,
  inX: number,
  outX: number,
  trackY: number,
  trackHeight: number,
  color: string,
): void {
  ctx.fillStyle = color;

  // In bracket (left)
  ctx.fillRect(inX - 2, trackY - 4, 4, trackHeight + 8);
  ctx.fillRect(inX - 2, trackY - 4, 8, 3);
  ctx.fillRect(inX - 2, trackY + trackHeight + 1, 8, 3);

  // Out bracket (right)
  ctx.fillRect(outX - 2, trackY - 4, 4, trackHeight + 8);
  ctx.fillRect(outX - 6, trackY - 4, 8, 3);
  ctx.fillRect(outX - 6, trackY + trackHeight + 1, 8, 3);
}

/**
 * Draw the in/out range highlight.
 */
export function drawInOutRange(
  ctx: CanvasRenderingContext2D,
  inX: number,
  outX: number,
  trackY: number,
  trackHeight: number,
  color: string,
): void {
  const rangeWidth = outX - inX;
  ctx.fillStyle = color;
  ctx.fillRect(inX, trackY, rangeWidth, trackHeight);
}

/**
 * Draw the played region fill.
 */
export function drawPlayedRegion(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  trackY: number,
  trackHeight: number,
  color: string,
): void {
  const playedWidth = endX - startX;
  if (playedWidth > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(startX, trackY, playedWidth, trackHeight);
  }
}

/**
 * Draw mark lines at given positions.
 */
export function drawMarkLines(
  ctx: CanvasRenderingContext2D,
  marks: Iterable<{
    frame: number;
    color?: string;
    endFrame?: number;
    note?: string;
  }>,
  frameToX: (frame: number) => number,
  trackY: number,
  trackHeight: number,
  defaultColor: string,
  duration: number,
): void {
  for (const marker of marks) {
    if (marker.frame < 1 || marker.frame > duration) continue;
    const markX = frameToX(marker.frame);
    const markerColor = marker.color || defaultColor;

    if (marker.endFrame !== undefined && marker.endFrame > marker.frame) {
      const endX = frameToX(Math.min(marker.endFrame, duration));

      // Duration marker: draw colored span
      ctx.fillStyle = markerColor;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(markX, trackY, endX - markX, trackHeight);
      ctx.globalAlpha = 1.0;

      // Solid start and end lines
      ctx.fillStyle = markerColor;
      ctx.fillRect(markX - 1, trackY, 2, trackHeight);
      ctx.fillRect(endX - 1, trackY, 2, trackHeight);

      // Top and bottom borders
      ctx.fillRect(markX, trackY, endX - markX, 1);
      ctx.fillRect(markX, trackY + trackHeight - 1, endX - markX, 1);
    } else {
      // Point marker: single vertical line
      ctx.fillStyle = markerColor;
      ctx.fillRect(markX - 1, trackY, 2, trackHeight);
    }

    // Note indicator dot
    if (marker.note) {
      ctx.fillStyle = markerColor;
      ctx.beginPath();
      ctx.arc(markX, trackY + trackHeight + 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Draw annotation triangles (small upward-pointing triangles below the track).
 */
export function drawAnnotationTriangles(
  ctx: CanvasRenderingContext2D,
  annotatedFrames: Set<number>,
  frameToX: (frame: number) => number,
  trackY: number,
  trackHeight: number,
  color: string,
  duration: number,
): void {
  ctx.fillStyle = color;
  for (const frame of annotatedFrames) {
    if (frame >= 1 && frame <= duration) {
      const annotX = frameToX(frame);
      ctx.beginPath();
      ctx.moveTo(annotX, trackY + trackHeight + 8);
      ctx.lineTo(annotX - 4, trackY + trackHeight + 14);
      ctx.lineTo(annotX + 4, trackY + trackHeight + 14);
      ctx.closePath();
      ctx.fill();
    }
  }
}
