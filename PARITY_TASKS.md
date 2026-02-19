# OpenRV-Web Feature Parity — Remaining Tasks

> **Updated**: 2026-02-19
> **Status**: 36/38 tasks implemented. Only 2 remaining.

---

## Remaining Tasks

### T3.1 EXR Tiled Image Support

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 1 week |
| **Key Files** | `src/formats/EXRDecoder.ts` |

#### Description

Add tiled reading mode alongside scanline. Tile sizes typically 32x32 or 64x64. Currently `EXRDecoder.ts` explicitly throws: `"Tiled EXR images are not yet supported"`. Header parsing already supports the tiled flag (line 74), but decompression/reconstruction is not implemented.

#### Acceptance Criteria

- [ ] EXR files with tiled storage load and display correctly
- [ ] Common tile sizes (32x32, 64x64) supported
- [ ] Non-tiled (scanline) EXR files continue to work (no regression)

---

### T3.2 TIFF LZW/ZIP Compression

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | 1 week |
| **Key Files** | `src/formats/TIFFFloatDecoder.ts` |

#### Description

Add LZW (compression=5) and Deflate/ZIP (compression=8) decompression to TIFFFloatDecoder. Currently the decoder throws: `"Unsupported TIFF compression: ${compression}. Only uncompressed (1) is supported."` The file header comments claim LZW and Deflate support but the implementation rejects them.

#### Acceptance Criteria

- [ ] TIFF files with LZW compression (5) load correctly
- [ ] TIFF files with Deflate/ZIP compression (8) load correctly
- [ ] Uncompressed TIFF files continue to work (no regression)
