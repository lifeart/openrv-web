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
