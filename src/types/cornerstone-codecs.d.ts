/**
 * Minimal typings for the Emscripten-generated JPEG 2000 codecs shipped by
 * `@cornerstonejs/codec-openjpeg` (classic JPEG 2000, decode-only build) and
 * `@cornerstonejs/codec-openjph` (HTJ2K / JPEG 2000 Part 15).
 *
 * Only the members used by `src/formats/JP2WasmCodecs.ts` are declared.
 * The shared shapes live in the type-only global namespace `J2KCodec`.
 */

declare namespace J2KCodec {
  interface FrameInfo {
    width: number;
    height: number;
    bitsPerSample: number;
    componentCount: number;
    isSigned: boolean;
  }

  /** Embind-wrapped decoder (`J2KDecoder` in OpenJPEG, `HTJ2KDecoder` in OpenJPH). */
  interface DecoderInstance {
    /** Allocates a WASM-heap buffer of `length` bytes to copy the encoded stream into. */
    getEncodedBuffer(length: number): Uint8Array;
    decode(): void;
    decodeSubResolution(decompositionLevel: number, decodeLayer: number): void;
    getFrameInfo(): FrameInfo;
    /** View into the WASM heap holding interleaved samples (1 byte for <=8 bpc, 2 bytes LE otherwise). */
    getDecodedBuffer(): Uint8Array;
    /** Frees the native object. */
    delete(): void;
  }

  interface Module {
    J2KDecoder?: new () => DecoderInstance;
    HTJ2KDecoder?: new () => DecoderInstance;
  }

  interface ModuleOptions {
    locateFile?: (path: string, scriptDirectory: string) => string;
    print?: (text: string) => void;
    printErr?: (text: string) => void;
  }

  type Factory = (options?: ModuleOptions) => Promise<Module>;
}

declare module '@cornerstonejs/codec-openjpeg/decodewasmjs' {
  const factory: J2KCodec.Factory;
  export default factory;
}

declare module '@cornerstonejs/codec-openjph' {
  const factory: J2KCodec.Factory;
  export default factory;
}
