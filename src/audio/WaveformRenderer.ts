/**
 * Audio Waveform Renderer
 * Extracts audio data from video and renders waveform visualization
 */

export interface WaveformData {
  peaks: Float32Array;  // Normalized peak values (-1 to 1)
  duration: number;     // Audio duration in seconds
  sampleRate: number;   // Original sample rate
}

export interface WaveformRenderOptions {
  width: number;
  height: number;
  color: string;
  backgroundColor: string;
  barWidth: number;
  barGap: number;
  centerLine: boolean;
}

const DEFAULT_RENDER_OPTIONS: WaveformRenderOptions = {
  width: 800,
  height: 40,
  color: '#4a9eff',
  backgroundColor: 'transparent',
  barWidth: 2,
  barGap: 1,
  centerLine: true,
};

/**
 * Extract audio data from a video element
 */
export async function extractAudioFromVideo(
  videoElement: HTMLVideoElement
): Promise<WaveformData | null> {
  try {
    // Get the video source URL
    const videoSrc = videoElement.src || videoElement.currentSrc;
    if (!videoSrc) {
      console.warn('No video source found');
      return null;
    }

    // Fetch the video file
    const response = await fetch(videoSrc);
    if (!response.ok) {
      console.warn('Failed to fetch video:', response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();

    // Create audio context
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get channel data (use first channel for mono visualization)
    const channelData = audioBuffer.getChannelData(0);

    // Calculate peaks for visualization
    // We want roughly 1000-2000 peaks for smooth display
    const targetPeaks = 2000;
    const samplesPerPeak = Math.max(1, Math.floor(channelData.length / targetPeaks));
    const numPeaks = Math.ceil(channelData.length / samplesPerPeak);

    const peaks = new Float32Array(numPeaks);

    for (let i = 0; i < numPeaks; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, channelData.length);

      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]!);
        if (abs > max) max = abs;
      }
      peaks[i] = max;
    }

    // Close audio context
    await audioContext.close();

    return {
      peaks,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
    };
  } catch (error) {
    console.warn('Failed to extract audio:', error);
    return null;
  }
}

/**
 * Extract audio from a Blob URL video
 */
export async function extractAudioFromBlob(
  blob: Blob
): Promise<WaveformData | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();

    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);

    const targetPeaks = 2000;
    const samplesPerPeak = Math.max(1, Math.floor(channelData.length / targetPeaks));
    const numPeaks = Math.ceil(channelData.length / samplesPerPeak);

    const peaks = new Float32Array(numPeaks);

    for (let i = 0; i < numPeaks; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, channelData.length);

      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]!);
        if (abs > max) max = abs;
      }
      peaks[i] = max;
    }

    await audioContext.close();

    return {
      peaks,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
    };
  } catch (error) {
    console.warn('Failed to extract audio from blob:', error);
    return null;
  }
}

/**
 * Render waveform to a canvas context
 */
export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  data: WaveformData,
  options: Partial<WaveformRenderOptions> = {},
  startTime = 0,
  endTime?: number
): void {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const { width, height, color, backgroundColor, barWidth, barGap, centerLine } = opts;

  // Clear canvas
  if (backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  const duration = endTime ?? data.duration;
  const timeRange = duration - startTime;

  if (timeRange <= 0 || data.peaks.length === 0) return;

  // Calculate which peaks to display
  const peaksPerSecond = data.peaks.length / data.duration;
  const startPeak = Math.floor(startTime * peaksPerSecond);
  const endPeak = Math.min(Math.ceil(duration * peaksPerSecond), data.peaks.length);
  const visiblePeaks = endPeak - startPeak;

  if (visiblePeaks <= 0) return;

  // Calculate bar positions
  const totalBarWidth = barWidth + barGap;
  const numBars = Math.floor(width / totalBarWidth);
  const peaksPerBar = visiblePeaks / numBars;

  // Draw center line
  if (centerLine) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  // Draw waveform bars
  ctx.fillStyle = color;

  for (let i = 0; i < numBars; i++) {
    const peakStart = startPeak + Math.floor(i * peaksPerBar);
    const peakEnd = Math.min(startPeak + Math.floor((i + 1) * peaksPerBar), endPeak);

    // Find max peak in this range
    let maxPeak = 0;
    for (let j = peakStart; j < peakEnd; j++) {
      if (data.peaks[j]! > maxPeak) {
        maxPeak = data.peaks[j]!;
      }
    }

    // Draw symmetrical bar around center
    const barHeight = maxPeak * (height - 4); // Leave small margin
    const x = i * totalBarWidth;
    const y = (height - barHeight) / 2;

    ctx.fillRect(x, y, barWidth, barHeight);
  }
}

/**
 * Render waveform for a specific time range (for timeline integration)
 */
export function renderWaveformRegion(
  ctx: CanvasRenderingContext2D,
  data: WaveformData,
  x: number,
  y: number,
  width: number,
  height: number,
  startTime: number,
  endTime: number,
  color = 'rgba(74, 158, 255, 0.5)'
): void {
  if (data.peaks.length === 0 || width <= 0 || height <= 0) return;

  const timeRange = endTime - startTime;
  if (timeRange <= 0) return;

  const peaksPerSecond = data.peaks.length / data.duration;
  const startPeak = Math.max(0, Math.floor(startTime * peaksPerSecond));
  const endPeak = Math.min(Math.ceil(endTime * peaksPerSecond), data.peaks.length);
  const visiblePeaks = endPeak - startPeak;

  if (visiblePeaks <= 0) return;

  // Calculate how many pixels per peak
  const pixelsPerPeak = width / visiblePeaks;

  ctx.fillStyle = color;

  if (pixelsPerPeak >= 1) {
    // Draw individual bars when we have enough space
    for (let i = 0; i < visiblePeaks; i++) {
      const peakIndex = startPeak + i;
      const peak = data.peaks[peakIndex] ?? 0;
      const barHeight = peak * height;
      const barX = x + i * pixelsPerPeak;
      const barY = y + (height - barHeight) / 2;

      ctx.fillRect(barX, barY, Math.max(1, pixelsPerPeak - 0.5), barHeight);
    }
  } else {
    // When zoomed out, sample peaks
    const peaksPerPixel = visiblePeaks / width;

    for (let px = 0; px < width; px++) {
      const peakStart = startPeak + Math.floor(px * peaksPerPixel);
      const peakEnd = Math.min(startPeak + Math.floor((px + 1) * peaksPerPixel), endPeak);

      let maxPeak = 0;
      for (let j = peakStart; j < peakEnd; j++) {
        if (data.peaks[j]! > maxPeak) {
          maxPeak = data.peaks[j]!;
        }
      }

      const barHeight = maxPeak * height;
      const barY = y + (height - barHeight) / 2;

      ctx.fillRect(x + px, barY, 1, barHeight);
    }
  }
}

/**
 * WaveformRenderer class for managing waveform state
 */
export class WaveformRenderer {
  private data: WaveformData | null = null;
  private loading = false;
  private error: string | null = null;

  async loadFromVideo(videoElement: HTMLVideoElement): Promise<boolean> {
    if (this.loading) return false;

    this.loading = true;
    this.error = null;

    try {
      this.data = await extractAudioFromVideo(videoElement);
      this.loading = false;
      return this.data !== null;
    } catch (err) {
      this.error = String(err);
      this.loading = false;
      return false;
    }
  }

  async loadFromBlob(blob: Blob): Promise<boolean> {
    if (this.loading) return false;

    this.loading = true;
    this.error = null;

    try {
      this.data = await extractAudioFromBlob(blob);
      this.loading = false;
      return this.data !== null;
    } catch (err) {
      this.error = String(err);
      this.loading = false;
      return false;
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    startTime: number,
    endTime: number,
    color?: string
  ): void {
    if (!this.data) return;
    renderWaveformRegion(ctx, this.data, x, y, width, height, startTime, endTime, color);
  }

  hasData(): boolean {
    return this.data !== null;
  }

  isLoading(): boolean {
    return this.loading;
  }

  getError(): string | null {
    return this.error;
  }

  getData(): WaveformData | null {
    return this.data;
  }

  clear(): void {
    this.data = null;
    this.loading = false;
    this.error = null;
  }
}
