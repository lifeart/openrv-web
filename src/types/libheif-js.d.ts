declare module 'libheif-js' {
  interface HeifImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }

  interface HeifImage {
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    display(imageData: HeifImageData, callback: (result: HeifImageData | null) => void): void;
    free(): void;
  }

  class HeifDecoder {
    decode(data: Uint8Array | ArrayBuffer): HeifImage[] | null;
  }
}
