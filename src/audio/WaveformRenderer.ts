/**
 * Audio Waveform Renderer
 * Extracts audio data from video and renders waveform visualization
 *
 * Supports multiple extraction methods:
 * 1. Native Web Audio API fetch + decode (fastest, but blocked by CORS)
 * 2. Mediabunny audio extraction (works for local files, bypasses CORS)
 */

import { Input, BlobSource, ALL_FORMATS, AudioBufferSink } from 'mediabunny';
import type { InputAudioTrack } from 'mediabunny';

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
 * Helper function to average all channels of an AudioBuffer into mono
 * @param audioBuffer The audio buffer to process
 * @returns Float32Array with averaged channel data
 */
function getMonoChannelData(audioBuffer: AudioBuffer): Float32Array {
  const numChannels = audioBuffer.numberOfChannels;

  if (numChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  // Average all channels for multi-channel audio
  const length = audioBuffer.length;
  const monoData = new Float32Array(length);

  for (let ch = 0; ch < numChannels; ch++) {
    const chData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      monoData[i]! += chData[i]! / numChannels;
    }
  }

  return monoData;
}

/**
 * Helper function to calculate peaks from channel data
 * @param channelData The audio samples
 * @param targetPeaks Target number of peaks (default 2000)
 * @returns Float32Array with peak values
 */
function calculatePeaks(channelData: Float32Array, targetPeaks = 2000): Float32Array {
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

  return peaks;
}

/**
 * Audio extraction error types for better debugging
 */
export interface AudioExtractionError {
  type: 'cors' | 'network' | 'decode' | 'timeout' | 'no-source' | 'unknown';
  message: string;
  originalError?: Error;
}

/**
 * Extract audio data from a video element
 * @param videoElement The video element to extract audio from
 * @param options Optional configuration
 * @returns WaveformData or null on failure
 */
export async function extractAudioFromVideo(
  videoElement: HTMLVideoElement,
  options: { timeout?: number; onError?: (error: AudioExtractionError) => void } = {}
): Promise<WaveformData | null> {
  const { timeout = 30000, onError } = options;

  const handleError = (error: AudioExtractionError): null => {
    console.warn(`Waveform extraction failed (${error.type}): ${error.message}`, error.originalError);
    onError?.(error);
    return null;
  };

  try {
    // Get the video source URL
    const videoSrc = videoElement.src || videoElement.currentSrc;
    if (!videoSrc) {
      return handleError({
        type: 'no-source',
        message: 'No video source found',
      });
    }

    // Skip blob URLs that might have CORS issues
    const isBlobUrl = videoSrc.startsWith('blob:');
    const isDataUrl = videoSrc.startsWith('data:');

    // Fetch the video file with timeout and CORS handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(videoSrc, {
        signal: controller.signal,
        // Use cors mode for external URLs, same-origin for blob/data
        mode: isBlobUrl || isDataUrl ? 'same-origin' : 'cors',
        credentials: 'same-origin',
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const err = fetchError as Error;

      if (err.name === 'AbortError') {
        return handleError({
          type: 'timeout',
          message: `Fetch timed out after ${timeout}ms`,
          originalError: err,
        });
      }

      // Check for CORS errors (typically manifest as TypeError in fetch)
      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        return handleError({
          type: 'cors',
          message: 'CORS policy blocked audio extraction. The video server must allow cross-origin requests.',
          originalError: err,
        });
      }

      return handleError({
        type: 'network',
        message: `Network error: ${err.message}`,
        originalError: err,
      });
    }

    if (!response.ok) {
      return handleError({
        type: 'network',
        message: `HTTP ${response.status}: ${response.statusText}`,
      });
    }

    const arrayBuffer = await response.arrayBuffer();

    // Create audio context
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    let audioBuffer: AudioBuffer;
    try {
      // Decode audio data
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (decodeError) {
      await audioContext.close();
      return handleError({
        type: 'decode',
        message: 'Failed to decode audio data. The video may not contain audio or uses an unsupported codec.',
        originalError: decodeError as Error,
      });
    }

    // Get channel data - combine all channels for better visualization
    const channelData = getMonoChannelData(audioBuffer);

    // Calculate peaks for visualization
    const peaks = calculatePeaks(channelData);

    // Close audio context to free resources
    await audioContext.close();

    return {
      peaks,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
    };
  } catch (error) {
    return handleError({
      type: 'unknown',
      message: `Unexpected error: ${(error as Error).message}`,
      originalError: error as Error,
    });
  }
}

/**
 * Extract audio from a Blob (for local files)
 * @param blob The blob containing audio/video data
 * @param options Optional configuration
 * @returns WaveformData or null on failure
 */
export async function extractAudioFromBlob(
  blob: Blob,
  options: { onError?: (error: AudioExtractionError) => void } = {}
): Promise<WaveformData | null> {
  const { onError } = options;

  const handleError = (error: AudioExtractionError): null => {
    console.warn(`Waveform extraction from blob failed (${error.type}): ${error.message}`, error.originalError);
    onError?.(error);
    return null;
  };

  try {
    const arrayBuffer = await blob.arrayBuffer();

    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (decodeError) {
      await audioContext.close();
      return handleError({
        type: 'decode',
        message: 'Failed to decode audio data from blob',
        originalError: decodeError as Error,
      });
    }

    // Get channel data - combine all channels for better visualization
    const channelData = getMonoChannelData(audioBuffer);

    // Calculate peaks for visualization
    const peaks = calculatePeaks(channelData);

    // Close audio context to free resources
    await audioContext.close();

    return {
      peaks,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
    };
  } catch (error) {
    return handleError({
      type: 'unknown',
      message: `Unexpected error: ${(error as Error).message}`,
      originalError: error as Error,
    });
  }
}

/**
 * Extract audio from a File using mediabunny
 * This is useful when native Web Audio API fails due to CORS or other issues
 * @param file The file to extract audio from
 * @param options Optional configuration
 * @returns WaveformData or null on failure
 */
export async function extractAudioWithMediabunny(
  file: File | Blob,
  options: { onError?: (error: AudioExtractionError) => void; onProgress?: (progress: number) => void } = {}
): Promise<WaveformData | null> {
  const { onError, onProgress } = options;

  const handleError = (error: AudioExtractionError): null => {
    console.warn(`Mediabunny audio extraction failed (${error.type}): ${error.message}`, error.originalError);
    onError?.(error);
    return null;
  };

  let input: Input | null = null;
  let source: BlobSource | null = null;

  try {
    // Create mediabunny input from blob - wrap in try-catch to handle creation errors
    try {
      source = new BlobSource(file);
      input = new Input({
        source,
        formats: ALL_FORMATS,
      });
    } catch (initError) {
      return handleError({
        type: 'decode',
        message: 'Failed to initialize media parser',
        originalError: initError as Error,
      });
    }

    // Get primary audio track
    const audioTrack = await input.getPrimaryAudioTrack() as InputAudioTrack | null;
    if (!audioTrack) {
      return handleError({
        type: 'decode',
        message: 'No audio track found in file',
      });
    }

    // Check if we can decode the audio
    const canDecode = await audioTrack.canDecode();
    if (!canDecode) {
      return handleError({
        type: 'decode',
        message: `Cannot decode audio codec: ${audioTrack.codec ?? 'unknown'}`,
      });
    }

    // Get duration
    const duration = await input.computeDuration();

    // Get audio metadata
    const sampleRate = audioTrack.sampleRate;

    // Create AudioBufferSink for Web Audio API compatible buffers
    const audioBufferSink = new AudioBufferSink(audioTrack);

    // Collect all audio buffers
    const allSamples: Float32Array[] = [];
    let totalSamples = 0;
    const expectedSamples = Math.ceil(duration * sampleRate);

    // Iterate through all audio buffers
    for await (const wrapped of audioBufferSink.buffers()) {
      const audioBuffer: AudioBuffer = wrapped.buffer;

      // Extract mono data from the audio buffer using helper function
      const monoData = getMonoChannelData(audioBuffer);

      // Copy the data since AudioBuffer might be reused
      allSamples.push(new Float32Array(monoData));
      totalSamples += monoData.length;

      if (onProgress && expectedSamples > 0) {
        onProgress(Math.min(1, totalSamples / expectedSamples));
      }
    }

    if (allSamples.length === 0) {
      return handleError({
        type: 'decode',
        message: 'No audio samples could be decoded',
      });
    }

    // Calculate peaks for visualization
    const targetPeaks = 2000;
    const samplesPerPeak = Math.max(1, Math.floor(totalSamples / targetPeaks));
    const numPeaks = Math.ceil(totalSamples / samplesPerPeak);

    const peaks = new Float32Array(numPeaks);

    // Process samples chunk by chunk
    let sampleIndex = 0;
    let chunkIndex = 0;
    let chunkOffset = 0;

    for (let peakIndex = 0; peakIndex < numPeaks; peakIndex++) {
      let max = 0;
      const endSample = Math.min(sampleIndex + samplesPerPeak, totalSamples);

      while (sampleIndex < endSample) {
        const chunk = allSamples[chunkIndex];
        if (!chunk) break;

        while (chunkOffset < chunk.length && sampleIndex < endSample) {
          const abs = Math.abs(chunk[chunkOffset]!);
          if (abs > max) max = abs;
          chunkOffset++;
          sampleIndex++;
        }

        if (chunkOffset >= chunk.length) {
          chunkIndex++;
          chunkOffset = 0;
        }
      }

      peaks[peakIndex] = max;
    }

    // Clean up
    input.dispose();

    return {
      peaks,
      duration,
      sampleRate,
    };
  } catch (error) {
    if (input) {
      input.dispose();
    }
    return handleError({
      type: 'unknown',
      message: `Mediabunny extraction failed: ${(error as Error).message}`,
      originalError: error as Error,
    });
  }
}

/**
 * Extract audio with automatic fallback
 * Tries native Web Audio API first, then falls back to mediabunny
 * @param videoElement The video element to extract audio from
 * @param file Optional file for mediabunny fallback
 * @param options Optional configuration
 */
export async function extractAudioWithFallback(
  videoElement: HTMLVideoElement,
  file?: File | Blob,
  options: { timeout?: number; onError?: (error: AudioExtractionError) => void; onProgress?: (progress: number) => void } = {}
): Promise<WaveformData | null> {
  // Try native Web Audio API first
  const nativeResult = await extractAudioFromVideo(videoElement, options);
  if (nativeResult) {
    return nativeResult;
  }

  // If native method failed and we have a file, try mediabunny
  if (file) {
    console.log('Native audio extraction failed, trying mediabunny...');
    return extractAudioWithMediabunny(file, options);
  }

  return null;
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
