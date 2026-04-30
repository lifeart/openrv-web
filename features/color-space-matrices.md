# CIE XYZ Color Space Matrices

## Original OpenRV Implementation

OpenRV uses CIE XYZ as the interchange color space for all color transformations:

- **Standard Matrices**: sRGB/Rec.709, ACEScg (AP1), ACES2065-1 (AP0), DCI-P3, Rec.2020
- **Chromatic Adaptation**: Bradford method for illuminant adaptation (D50, D60, D65)
- **Transfer Functions**: sRGB, Rec.709, PQ (ST 2084), HLG, Gamma 2.2/2.4/2.6
- **Matrix Chaining**: Compose multiple transforms into single matrix for efficiency

## Status
- [ ] Not implemented
- [x] Partially implemented
- [ ] Fully implemented

## GPU Pipeline Color Primaries Matrices (Canonical)

> **MED-54 verification (2026-04-29).** This section was added as part of the
> MED-54 documentation pass that documented ~10 inline shader matrices with
> source/destination spaces, derivation references, and column-major storage
> conventions, and corrected the misleading "Bradford CAT" JSDoc on
> `COLOR_PRIMARIES_MATRICES`. The user-facing summary lives in
> [`docs/color/display-profiles.md` "Supported Color Primaries"](../docs/color/display-profiles.md#supported-color-primaries).
> Pinned-value tests: `MED-54-001..011` in
> `src/render/__tests__/shaderMathColorPipeline.test.ts`.

The render pipeline carries scene-referred RGB in a BT.709/sRGB linear working
space and uses a small, fixed set of D65→D65 primary-conversion matrices for
gamut mapping at stages 7a and 7d. These matrices are the source of truth used
by the WebGL2, WebGPU, and CPU paths and must stay in sync.

### Canonical Matrix Set

| Matrix | Source space | Destination space | Reference |
|--------|--------------|-------------------|-----------|
| `REC2020_TO_SRGB` | BT.2020 (D65) | BT.709/sRGB (D65) | ITU-R BT.2020-2 Table 4 + ITU-R BT.709-6 Item 1.4 |
| `REC2020_TO_P3` | BT.2020 (D65) | Display-P3 (D65) | SMPTE EG 432-1 + ITU-R BT.2020-2 |
| `P3_TO_SRGB` | Display-P3 (D65) | BT.709/sRGB (D65) | SMPTE EG 432-1 + ITU-R BT.709-6 |
| `SRGB_TO_P3` | BT.709/sRGB (D65) | Display-P3 (D65) | SMPTE EG 432-1 + ITU-R BT.709-6 |
| `SRGB_TO_REC2020` | BT.709/sRGB (D65) | BT.2020 (D65) | ITU-R BT.2020-2 + ITU-R BT.709-6 |

All five share the D65 white point, so derivation is the direct RGB→XYZ→RGB
chain from the CIE xy chromaticity coordinates with **no chromatic adaptation
transform**. A Bradford (or other) CAT is only needed when source and
destination white points differ (for example, theatrical DCI-P3 with white at
x=0.314, y=0.351 ≠ D65). Earlier JSDoc that referenced "Bradford CAT" for
these matrices was misleading and has been corrected (see MED-54).

### Storage Convention

GLSL `mat3` and WGSL `mat3x3f` are **column-major**. The matrices are stored
as nine floats per matrix; reading them as visual rows in the source files
gives one column per visual row of the storage matrix. Multiplication
`M * v` resolves to:

```
r' = m[0]*r + m[3]*g + m[6]*b
g' = m[1]*r + m[4]*g + m[7]*b
b' = m[2]*r + m[5]*g + m[8]*b
```

The CPU path stores the same numerical matrices in **row-major** order so that
the JavaScript reference implementation reads naturally; the row-major form is
the transpose of the GPU layout and produces identical math.

### Mirror Locations (kept in sync byte-for-byte)

| File | Layout | Notes |
|------|--------|-------|
| `src/render/ShaderConstants.ts` (`COLOR_PRIMARIES_MATRICES`) | Column-major `Float32Array(9)` | TypeScript uniform source |
| `src/render/shaders/viewer.frag.glsl` | Column-major GLSL `mat3` | WebGL2 fragment shader |
| `src/render/webgpu/shaders/common.wgsl` | Column-major WGSL `mat3x3f` | WebGPU shared module |
| `src/render/webgpu/shaders/scene_analysis.wgsl` | Column-major WGSL `mat3x3f` | WebGPU analysis pass |
| `src/utils/effects/effectProcessing.shared.ts` | Row-major flat array | CPU/test path |

Pinned-value tests live in
`src/render/__tests__/shaderMathColorPipeline.test.ts` (`XE-MATRIX-002..006`
plus `MED-54-001..011`) — they fail if any mirror drifts.

### Tone-Mapping Matrices (NOT pure primary conversions)

The following matrices appear in the same shaders alongside the canonical set
but are **not** interchangeable with primary conversions. They are tone-mapping
internals and are documented inline at their declaration sites:

- **AgX inset / outset** (`viewer.frag.glsl`, `common.wgsl`,
  `effectProcessing.shared.ts`): inner/outer gamut compression pair from
  Troy Sobotka's AgX 0.13.5 LUT-free fit (MJP variant). Working space is
  BT.709 linear. They are gamut-compression operators, not BT.709↔ACEScg.
- **ACES Hill input / output** (same files): Stephen Hill's ODT-tuned
  composite that bakes BT.709→AP0→AP1 with a slight desaturation pre-bake
  and the AP1→BT.709 tuned inverse. The output approximately matches the
  reference ACES 1.0 Output Transform output for a BT.709 display.
  Working space is BT.709 linear (post input-primaries normalization).
  Source: BakingLab `ACES.hlsl`.

These are flagged in source comments so future readers do not treat them as
canonical Rec.709↔AP1 primary matrices.

### What Exists Today

1. **OCIOTransform.ts** (`src/color/OCIOTransform.ts`):
   - Matrix3x3 type and operations (multiply, vector multiply)
   - sRGB <-> XYZ (D65) matrices
   - ACEScg (AP1) <-> XYZ (D60) matrices
   - ACES2065-1 (AP0) <-> XYZ (D60) matrices
   - DCI-P3 <-> XYZ (D65) matrices
   - Rec.709 aliases to sRGB matrices
   - Bradford chromatic adaptation (D60 <-> D65)
   - Transfer functions: sRGB encode/decode, Rec.709 encode/decode
   - ACES tone mapping (Narkowicz approximation)
   - OCIOTransform class with transform chain builder

2. **OCIOTransform.test.ts** (`src/color/OCIOTransform.test.ts`):
   - Unit tests for matrices, transfer functions, identity transforms

### What Needs to Be Implemented

#### 1. Additional Color Space Matrices
- **Rec.2020** <-> XYZ (D65) - Wide gamut HDR broadcast
- **Adobe RGB** <-> XYZ (D65) - Photography workflow
- **ProPhoto RGB** <-> XYZ (D50) - Wide gamut photography with Bradford adaptation to D65
- **ARRI Wide Gamut 3/4** <-> XYZ - ARRI camera native color space
- **REDWideGamutRGB** <-> XYZ - RED camera native color space
- **S-Gamut3/S-Gamut3.Cine** <-> XYZ - Sony camera native spaces

#### 2. Additional Transfer Functions
- **PQ (ST 2084)**: HDR perceptual quantizer for HDR10
- **HLG (Hybrid Log-Gamma)**: HDR broadcast standard
- **ARRI LogC3/LogC4**: ARRI camera log encoding
- **Log3G10**: RED camera log encoding
- **S-Log3**: Sony camera log encoding
- **Gamma 2.2/2.4/2.6**: Simple power curves
- **ACEScct**: ACES log-like encoding for grading

#### 3. Matrix Optimization
- Compose multiple sequential matrix transforms into single matrix
- Cache frequently-used transform chains
- GLSL shader generation for GPU-accelerated transforms

#### 4. Additional Chromatic Adaptation
- **D50** illuminant support (ICC Profile connection space)
- **D55** illuminant support
- **A** illuminant (tungsten) support
- Von Kries adaptation method option

## Implementation Plan

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/color/OCIOTransform.ts` | Modify | Add new matrices, transfer functions, matrix composition |
| `src/color/OCIOTransform.test.ts` | Modify | Add tests for new matrices and transfer functions |
| `src/color/TransferFunctions.ts` | Create | Extract and extend transfer functions |
| `src/color/TransferFunctions.test.ts` | Create | Tests for all transfer functions |

### Key Matrices to Add

```typescript
// Rec.2020 to XYZ (D65) - ITU-R BT.2020
export const REC2020_TO_XYZ: Matrix3x3 = [
  0.6369580, 0.1446169, 0.1688810,
  0.2627002, 0.6779981, 0.0593017,
  0.0000000, 0.0280727, 1.0609851
];

// Adobe RGB to XYZ (D65)
export const ADOBERGB_TO_XYZ: Matrix3x3 = [
  0.5767309, 0.1855540, 0.1881852,
  0.2973769, 0.6273491, 0.0752741,
  0.0270343, 0.0706872, 0.9911085
];
```

### Key Transfer Functions to Add

```typescript
// PQ (ST 2084) EOTF
function pqDecode(encoded: number): number {
  const m1 = 0.1593017578125;
  const m2 = 78.84375;
  const c1 = 0.8359375;
  const c2 = 18.8515625;
  const c3 = 18.6875;
  const Np = Math.pow(encoded, 1 / m2);
  return Math.pow(Math.max(Np - c1, 0) / (c2 - c3 * Np), 1 / m1);
}

// ARRI LogC3 (EI 800)
function logC3Decode(encoded: number): number {
  const cut = 0.010591;
  const a = 5.555556;
  const b = 0.052272;
  const c = 0.247190;
  const d = 0.385537;
  const e = 5.367655;
  const f = 0.092809;
  if (encoded > e * cut + f) {
    return (Math.pow(10, (encoded - d) / c) - b) / a;
  }
  return (encoded - f) / e;
}
```

## Unit Test Cases

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| CSM-001 | sRGB -> XYZ -> sRGB roundtrip | Identity within 1e-6 tolerance |
| CSM-002 | ACEScg -> XYZ -> ACEScg roundtrip | Identity within 1e-6 tolerance |
| CSM-003 | Rec.2020 -> XYZ -> Rec.2020 roundtrip | Identity within 1e-6 tolerance |
| CSM-004 | Adobe RGB -> XYZ -> Adobe RGB roundtrip | Identity within 1e-6 tolerance |
| CSM-005 | D60 -> D65 -> D60 adaptation roundtrip | Identity within 1e-5 tolerance |
| CSM-006 | sRGB encode/decode roundtrip | Identity within 1e-6 tolerance |
| CSM-007 | PQ encode/decode roundtrip | Identity within 1e-5 tolerance |
| CSM-008 | LogC3 encode/decode roundtrip | Identity within 1e-5 tolerance |
| CSM-009 | HLG encode/decode roundtrip | Identity within 1e-5 tolerance |
| CSM-010 | Matrix composition produces same result as sequential | Within 1e-6 tolerance |
| CSM-011 | sRGB white point maps to D65 XYZ | [0.95047, 1.0, 1.08883] |
| CSM-012 | Known color values through Rec.2020 | Match reference values |

## E2E Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| CSM-E001 | Rec.2020 input space available in OCIO | Enable OCIO, open input dropdown | Rec.2020 option visible |
| CSM-E002 | Transform chain visually changes canvas | Select non-sRGB input space | Canvas pixels differ |
| CSM-E003 | Roundtrip preserves visual identity | Apply then reverse transform | Similar to original |

## Dependencies
- None (foundational module)

## Architectural Note: IPImage Metadata Flow Through LUTs (MED-51)

`IPImage` (`src/core/image/Image.ts`) carries `colorPrimaries` and
`transferFunction` fields that drive renderer behavior — for example the
WebGL2 `u_inputTransfer` uniform selects between sRGB / HLG / PQ / SMPTE 240M
EOTF in the fragment shader (`src/render/Renderer.ts:617-624`). These fields
used to be set once at decode time and were never updated when the LUT
pipeline transformed the pixels into a different color space. A Display LUT
that did PQ -> sRGB on the GPU left `transferFunction = 'pq'` on the IPImage,
so the renderer applied the wrong EOTF.

The fix (issue MED-51) is a **metadata cascade** on `LUTPipeline`
(`src/color/pipeline/LUTPipeline.ts`):

- `LUTPipeline.computeOutputMetadata(sourceId, input)` walks the four stages
  Pre-Cache -> File -> Look -> Display, layering each enabled stage's
  declared output color space (`outputColorPrimaries` /
  `outputTransferFunction`) onto the running metadata. `null` preserves the
  running value; a concrete value overrides. Disabled, no-LUT-loaded, and
  zero-intensity stages are skipped because they are bypassed at render time.
- `LUTPipeline.applyToIPImage(sourceId, image)` materializes the cascaded
  metadata onto an IPImage. The pixel buffer is shared (zero copy); only
  metadata is freshly allocated. No-op cascades return the input by reference
  so steady-state rendering is allocation-free.
- HDR-video safety: `applyToIPImage` uses `IPImage.cloneMetadataOnly()`
  rather than `clone()`. For HDR video the IPImage holds a 4-byte placeholder
  `data` buffer and the real pixels live in `managedVideoFrame` (a
  `VideoFrame`); a plain `clone()` would drop that reference and the renderer
  would read 4 bytes as the full pixel buffer. The metadata-only clone shares
  the `VideoFrame` ref via a non-owning view — `_nonOwning = true`
  short-circuits `close()` so the GPU resource is not double-released.
- Stage state is exposed via setter / getter pairs on `LUTPipeline`
  (`getStageState`, `getDisplayLUTState`, `getStageOutputColorPrimaries`,
  `getStageOutputTransferFunction`, etc.) so UI / inspector code can both
  read and write the declared output color space.
- The Viewer calls `applyLUTMetadataCascade()` on the IPImage handed to the
  renderer in all three HDR branches (HDR video, HDR file, HDR procedural —
  `src/ui/components/Viewer.ts` around lines 1804, 1832, 1859). SDR sources
  do not currently use the cascade because the SDR path does not read color-
  space metadata from the IPImage. The right-eye IPImage in `'separate'`
  multi-view stereo is also not currently routed through the cascade — see
  the TODO at `src/ui/components/Viewer.ts:1527-1535`. Both are tracked as
  non-blocking follow-ups.
