/**
 * JPEG 2000 / HTJ2K WASM codec bindings.
 *
 * Wraps two Emscripten builds:
 * - OpenJPEG (`@cornerstonejs/codec-openjpeg`, decode-only build) for classic
 *   JPEG 2000 Part 1 codestreams and JP2 box files. OpenJPEG >= 2.5 also
 *   decodes HTJ2K, so it doubles as the fallback for Part 15 streams.
 * - OpenJPH (`@cornerstonejs/codec-openjph`) for HTJ2K (Part 15) codestreams.
 *   It only accepts raw codestreams with the HTJ2K capability bit set.
 *
 * Both codecs (JS glue + .wasm) are loaded lazily via dynamic import so they
 * land in separate chunks; the .wasm binaries are emitted as hashed assets
 * through Vite `?url` imports and wired up with Emscripten's `locateFile`.
 *
 * Output is interleaved RGBA Float32 holding the *raw integer* sample values
 * (not yet normalized); `decodeJP2()` normalizes by bit depth afterwards.
 */

import { DecoderError } from '../core/errors';
import { Logger } from '../utils/Logger';
import type { JP2DecodeOptions, JP2DecodeResult } from './JP2Decoder';

const logger = new Logger('JP2WasmCodecs');

/** Everything the codecs need about the input, pre-parsed from the headers. */
export interface JP2CodecInput {
  /** The complete file (JP2 box file or raw codestream). */
  buffer: ArrayBuffer;
  /** Byte offset of the codestream (SOC marker) inside `buffer`. */
  codestreamOffset: number;
  /** Whether `buffer` is a JP2/JPH box container (vs. a raw codestream). */
  isContainer: boolean;
  /** Whether the codestream signals HTJ2K (CAP marker). */
  isHTJ2K: boolean;
  /** Colour space reported by the headers (e.g. 'sRGB', 'sYCC', 'greyscale'). */
  colorSpace: string;
  /** Full-resolution image width. */
  width: number;
  /** Full-resolution image height. */
  height: number;
  /** Number of image components reported by the headers. */
  numComponents: number;
  /** Number of wavelet decomposition levels (from COD), or null when unknown. */
  numDecompositions: number | null;
}

/** Decoder object returned by `loadJP2Codecs()`. */
export interface JP2CodecModule {
  decode(input: JP2CodecInput, options?: JP2DecodeOptions): Promise<JP2DecodeResult>;
  destroy(): void;
}

type CodecKind = 'openjpeg' | 'openjph';

// ---------------------------------------------------------------------------
// Lazy codec loading
// ---------------------------------------------------------------------------

/**
 * Captures Emscripten stdout/stderr so codec chatter goes through the Logger
 * and the last error line can be surfaced in DecoderError messages.
 */
class CodecOutput {
  lastError = '';

  constructor(private readonly name: string) {}

  readonly options = {
    print: (text: string): void => {
      // OpenJPEG reports its own errors on stdout as "[ERROR] ..."
      if (text.startsWith('[ERROR]')) this.lastError = text;
      logger.debug(`[${this.name}] ${text}`);
    },
    printErr: (text: string): void => {
      this.lastError = text;
      logger.debug(`[${this.name}] ${text}`);
    },
  };
}

interface LoadedCodec {
  module: J2KCodec.Module;
  output: CodecOutput;
}

function wasmLocator(wasmUrl: string): (path: string, scriptDirectory: string) => string {
  return (path, scriptDirectory) => (path.endsWith('.wasm') ? wasmUrl : scriptDirectory + path);
}

/**
 * Emscripten in Node (vitest) reads the .wasm from disk next to the glue
 * script; the Vite asset URL is only meaningful in a browser.
 */
function isBrowserRuntime(): boolean {
  const proc = (globalThis as { process?: { versions?: { node?: unknown } } }).process;
  return typeof proc?.versions?.node !== 'string';
}

async function loadOpenJPEG(): Promise<LoadedCodec> {
  const [{ default: factory }, { default: wasmUrl }] = await Promise.all([
    import('@cornerstonejs/codec-openjpeg/decodewasmjs'),
    import('@cornerstonejs/codec-openjpeg/decodewasm?url'),
  ]);
  const output = new CodecOutput('openjpeg');
  const module = await factory({
    ...output.options,
    ...(isBrowserRuntime() ? { locateFile: wasmLocator(wasmUrl) } : {}),
  });
  return { module, output };
}

async function loadOpenJPH(): Promise<LoadedCodec> {
  const [{ default: factory }, { default: wasmUrl }] = await Promise.all([
    import('@cornerstonejs/codec-openjph'),
    import('@cornerstonejs/codec-openjph/wasm?url'),
  ]);
  const output = new CodecOutput('openjph');
  const module = await factory({
    ...output.options,
    ...(isBrowserRuntime() ? { locateFile: wasmLocator(wasmUrl) } : {}),
  });
  return { module, output };
}

// ---------------------------------------------------------------------------
// Sample conversion
// ---------------------------------------------------------------------------

interface RawFrame {
  width: number;
  height: number;
  components: number;
  bitsPerSample: number;
  isSigned: boolean;
  /** Copied (heap-independent) interleaved sample bytes. */
  bytes: Uint8Array;
}

function sampleView(frame: RawFrame): ArrayLike<number> {
  const { bytes, bitsPerSample, isSigned } = frame;
  if (bitsPerSample <= 8) {
    return isSigned ? new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length) : bytes;
  }
  const count = bytes.length >> 1;
  return isSigned
    ? new Int16Array(bytes.buffer, bytes.byteOffset, count)
    : new Uint16Array(bytes.buffer, bytes.byteOffset, count);
}

/**
 * Convert interleaved 1-4+ component samples to RGBA Float32 with raw
 * integer values. Missing alpha is filled with the value that normalizes
 * to 1.0 in `decodeJP2()`.
 */
function toRawRGBA(frame: RawFrame, colorSpace: string): Float32Array {
  const { width, height, components, bitsPerSample, isSigned } = frame;
  const samples = sampleView(frame);
  const pixelCount = width * height;
  const out = new Float32Array(pixelCount * 4);

  const maxVal = Math.pow(2, bitsPerSample) - 1;
  const half = Math.pow(2, bitsPerSample - 1);
  const minVal = isSigned ? -half : 0;
  const hiVal = isSigned ? half - 1 : maxVal;
  const opaque = hiVal;
  const convertSYCC = colorSpace === 'sYCC' && components >= 3 && !isSigned;

  // Samples are always in range; the fallback only satisfies noUncheckedIndexedAccess.
  const at = (i: number): number => samples[i] ?? 0;

  for (let p = 0; p < pixelCount; p++) {
    const s = p * components;
    const d = p * 4;
    if (components === 1 || components === 2) {
      const g = at(s);
      out[d] = g;
      out[d + 1] = g;
      out[d + 2] = g;
      out[d + 3] = components === 2 ? at(s + 1) : opaque;
    } else if (convertSYCC) {
      // sYCC (ITU-R BT.601 full range, JP2 EnumCS 18) -> RGB
      const y = at(s);
      const cb = at(s + 1) - half;
      const cr = at(s + 2) - half;
      out[d] = Math.min(hiVal, Math.max(minVal, y + 1.402 * cr));
      out[d + 1] = Math.min(hiVal, Math.max(minVal, y - 0.344136 * cb - 0.714136 * cr));
      out[d + 2] = Math.min(hiVal, Math.max(minVal, y + 1.772 * cb));
      out[d + 3] = components >= 4 ? at(s + 3) : opaque;
    } else {
      out[d] = at(s);
      out[d + 1] = at(s + 1);
      out[d + 2] = at(s + 2);
      out[d + 3] = components >= 4 ? at(s + 3) : opaque;
    }
  }
  return out;
}

function cropRGBA(
  data: Float32Array,
  width: number,
  height: number,
  region: { x: number; y: number; w: number; h: number },
): { data: Float32Array; width: number; height: number } {
  const x0 = Math.max(0, Math.min(width, Math.floor(region.x)));
  const y0 = Math.max(0, Math.min(height, Math.floor(region.y)));
  const x1 = Math.max(x0, Math.min(width, Math.floor(region.x + region.w)));
  const y1 = Math.max(y0, Math.min(height, Math.floor(region.y + region.h)));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w === 0 || h === 0) {
    throw new DecoderError('JP2', `Requested region ${JSON.stringify(region)} does not intersect the image`);
  }
  const out = new Float32Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y0 + row) * width + x0) * 4;
    out.set(data.subarray(src, src + w * 4), row * w * 4);
  }
  return { data: out, width: w, height: h };
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/** Run one codec on `encoded`, returning a heap-independent copy of the samples. */
function runCodec(
  codec: LoadedCodec,
  kind: CodecKind,
  encoded: Uint8Array,
  level: number,
  expectedWidth: number,
  expectedHeight: number,
): RawFrame {
  const Ctor = kind === 'openjph' ? codec.module.HTJ2KDecoder : codec.module.J2KDecoder;
  if (!Ctor) {
    throw new DecoderError('JP2', `${kind} module does not expose a decoder class`);
  }

  codec.output.lastError = '';
  const decoder = new Ctor();
  try {
    decoder.getEncodedBuffer(encoded.length).set(encoded);
    if (level > 0) {
      decoder.decodeSubResolution(level, 0);
    } else {
      decoder.decode();
    }

    const info = decoder.getFrameInfo();
    const decoded = decoder.getDecodedBuffer();
    // getFrameInfo() reports full-resolution size even after decodeSubResolution.
    const scale = Math.pow(2, level);
    const width = Math.ceil(expectedWidth / scale);
    const height = Math.ceil(expectedHeight / scale);
    const bytesPerSample = info.bitsPerSample > 8 ? 2 : 1;
    const expectedBytes = width * height * info.componentCount * bytesPerSample;

    // OpenJPH reports failures via stderr and an empty frame rather than throwing.
    if (info.width === 0 || info.componentCount === 0 || decoded.length === 0) {
      throw new DecoderError('JP2', `${kind} failed to decode: ${codec.output.lastError || 'empty output'}`);
    }
    if (decoded.length !== expectedBytes) {
      throw new DecoderError(
        'JP2',
        `${kind} returned ${decoded.length} bytes, expected ${expectedBytes} for ${width}x${height}x${info.componentCount}`,
      );
    }

    return {
      width,
      height,
      components: info.componentCount,
      bitsPerSample: info.bitsPerSample,
      isSigned: info.isSigned,
      // slice() copies out of the WASM heap before the decoder is freed
      bytes: decoded.slice(),
    };
  } catch (err) {
    if (err instanceof DecoderError) throw err;
    // Emscripten may throw raw numbers (C++ exception pointers) or strings
    const detail = err instanceof Error ? err.message : String(err);
    throw new DecoderError('JP2', `${kind} failed to decode: ${codec.output.lastError || detail}`);
  } finally {
    decoder.delete();
  }
}

/**
 * Create a codec module. The WASM codecs themselves are loaded on first use,
 * so OpenJPH is only fetched once an HTJ2K file is actually decoded.
 */
export function createJP2CodecModule(): JP2CodecModule {
  const loaders: Record<CodecKind, () => Promise<LoadedCodec>> = { openjpeg: loadOpenJPEG, openjph: loadOpenJPH };
  const loaded = new Map<CodecKind, Promise<LoadedCodec>>();

  const getCodec = (kind: CodecKind): Promise<LoadedCodec> => {
    let p = loaded.get(kind);
    if (!p) {
      p = loaders[kind]();
      // Allow a retry if the fetch/instantiate failed
      p.catch(() => loaded.delete(kind));
      loaded.set(kind, p);
    }
    return p;
  };

  return {
    async decode(input, options) {
      const bytes = new Uint8Array(input.buffer);
      const codestream = bytes.subarray(input.codestreamOffset);

      const requested = Math.max(0, Math.floor(options?.maxResolutionLevel ?? 0));
      const level = input.numDecompositions === null ? 0 : Math.min(requested, input.numDecompositions);
      if (requested !== level) {
        logger.debug(`Clamped resolution level ${requested} to ${level}`);
      }

      // The OpenJPEG wrapper only emits 1- or 3-component images (it throws
      // "unsupported J2K component count" otherwise); OpenJPH handles any count
      // but only for HTJ2K codestreams.
      if (!input.isHTJ2K && input.numComponents !== 1 && input.numComponents !== 3) {
        throw new DecoderError(
          'JP2',
          `Classic JPEG 2000 images with ${input.numComponents} components are not supported ` +
            '(1 or 3 components are; HTJ2K supports any component count)',
        );
      }

      // Attempt order: HTJ2K -> OpenJPH on the raw codestream, falling back to
      // OpenJPEG; classic J2K -> OpenJPEG on the whole file (it parses JP2 boxes
      // itself, applying palette / channel definitions), then on the bare codestream.
      const attempts: Array<{ kind: CodecKind; data: Uint8Array }> = input.isHTJ2K
        ? [
            { kind: 'openjph', data: codestream },
            { kind: 'openjpeg', data: codestream },
          ]
        : [{ kind: 'openjpeg', data: bytes }];
      if (!input.isHTJ2K && input.isContainer) {
        attempts.push({ kind: 'openjpeg', data: codestream });
      }

      let frame: RawFrame | null = null;
      let lastErr: unknown = null;
      for (const attempt of attempts) {
        try {
          const codec = await getCodec(attempt.kind);
          frame = runCodec(codec, attempt.kind, attempt.data, level, input.width, input.height);
          break;
        } catch (err) {
          lastErr = err;
          logger.warn(`JPEG 2000 decode via ${attempt.kind} failed, trying next decoder if any`, err);
        }
      }
      if (!frame) {
        if (lastErr instanceof DecoderError) throw lastErr;
        throw new DecoderError('JP2', `JPEG 2000 decode failed: ${String(lastErr)}`);
      }

      let data = toRawRGBA(frame, input.colorSpace);
      let { width, height } = frame;
      if (options?.region) {
        const scale = Math.pow(2, level);
        const cropped = cropRGBA(data, width, height, {
          x: options.region.x / scale,
          y: options.region.y / scale,
          w: options.region.w / scale,
          h: options.region.h / scale,
        });
        ({ data, width, height } = cropped);
      }

      const convertedSYCC = input.colorSpace === 'sYCC' && frame.components >= 3 && !frame.isSigned;
      return {
        width,
        height,
        data,
        channels: 4,
        bitsPerComponent: frame.bitsPerSample,
        isSigned: frame.isSigned,
        colorSpace: convertedSYCC ? 'sRGB' : input.colorSpace,
      };
    },

    destroy() {
      // Emscripten modules cannot be torn down explicitly; drop references so
      // the WASM memory can be garbage collected.
      loaded.clear();
    },
  };
}
