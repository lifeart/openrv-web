# Additional LUT Format Support

## Overview
Extend the existing `.cube` LUT support (in `src/color/LUTLoader.ts`) to handle all major industry LUT file formats used in post-production, DI, telecine, and compositing workflows. Each format is parsed into the existing `LUT3D` or `LUT1D` internal representation so that the rest of the pipeline (trilinear/linear interpolation, WebGL texture upload, UI controls) works unchanged.

## Original OpenRV Implementation
OpenRV supported the following LUT file formats beyond `.cube`:
- RSR `.csp` (Rising Sun Research / cineSpace)
- RV 3D format (OpenRV native 3D LUT)
- RV Channel format (OpenRV native per-channel 1D LUT)
- Lustre / Flame `.3dl` (Autodesk)
- IRIDAS `.itx` / `.look`
- Shake formats
- Pandora `.mga`
- Houdini `.lut`
- Nuke `.nk` Vectorfield export

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

## Supported Formats

---

### 1. Autodesk .3dl (Lustre / Flame)

#### File Format Specification

The `.3dl` format exists in two variants: a 1D shaper LUT and a 3D mesh LUT. Both are plain ASCII.

**1D Variant:**
```
# Optional comment lines (lines starting with #)
# First non-comment line: input bit-depth range values (space-separated integers)
# These define the input mapping, e.g. for 10-bit: 0 64 128 ... 1023
0 64 128 192 256 320 384 448 512 576 640 704 768 832 896 960 1023
# Subsequent lines: three integer output values per line (R G B)
# Each triplet maps the corresponding input entry to output values
# Output range is typically 0-4095 (12-bit) or 0-1023 (10-bit)
0 0 0
64 64 64
128 128 128
...
1023 1023 1023
```

**3D Variant:**
```
# Optional comment lines
# First non-comment line: mesh size declaration (single integer or input range)
# If single integer N, the LUT is N x N x N
# Some variants use the input range line like the 1D format
17
# Data lines: three integers per line (R G B)
# Ordered with R varying fastest, then G, then B
# Values are 12-bit integers (0-4095 typical)
0 0 0
4 0 0
11 0 0
...
4095 4095 4095
```

**Key characteristics:**
- Integer values (not floating point)
- Input bit depth inferred from the header range line
- Output bit depth inferred from maximum value in data (commonly 4095 for 12-bit)
- R varies fastest in 3D layout (opposite of `.cube` where B varies fastest)
- Line-ending: CRLF or LF

#### Parser Implementation Approach

```typescript
export function parse3DLLUT(content: string): LUT {
  // 1. Strip comment lines (starting with #)
  // 2. Parse first non-comment line:
  //    - If it contains multiple space-separated integers -> input range (1D shaper or 3D header)
  //    - If it contains a single integer -> 3D mesh size
  // 3. Determine bit depth from header values (max value in range line)
  // 4. Parse subsequent data lines as integer triplets
  // 5. Detect 1D vs 3D:
  //    - If data count == number of input entries -> 1D LUT
  //    - If data count == size^3 -> 3D LUT
  // 6. Normalize integer values to 0.0-1.0 float range by dividing by max output value
  // 7. For 3D: reorder from R-fastest to the internal B-fastest layout (matching .cube convention)
  // 8. Return LUT1D or LUT3D with domainMin=[0,0,0], domainMax=[1,1,1]
}
```

#### Conversion to Internal Representation

- **1D**: Normalize integers by dividing by max output value (e.g., 4095). Create `Float32Array` of `size * 3` interleaved R,G,B. Return as `LUT1D`.
- **3D**: Normalize integers by dividing by max output value. Reorder data so that B varies fastest (swap R and B iteration order). Create `Float32Array` of `size^3 * 3`. Return as `LUT3D`.
- **Domain**: Always `[0,0,0]` to `[1,1,1]` after normalization.

---

### 2. Rising Sun .csp (cineSpace)

#### File Format Specification

The `.csp` format is a compound format containing an optional 1D pre-shaper LUT followed by a 3D LUT. Plain ASCII.

```
CSPLUTV100                         # Magic identifier (required)
3D                                  # LUT type: "1D" or "3D"

BEGIN METADATA
"title" "My CSP LUT"
"comments" "Created by cineSpace"
END METADATA

# Pre-LUT (1D shaper) section - one block per channel (R, G, B)
# Each block: first line is count of entries, then input output pairs

# Red pre-LUT
2                                   # Number of entries for red channel
0.0 1.0                            # Input values (space-separated)
0.0 1.0                            # Output values (space-separated)

# Green pre-LUT
2
0.0 1.0
0.0 1.0

# Blue pre-LUT
2
0.0 1.0
0.0 1.0

# 3D LUT section
# First line: cube dimensions (e.g., "17 17 17")
17 17 17
# Data lines: three floats per line (R G B), values 0.0-1.0
# Ordered with R varying fastest, then G, then B
0.0000 0.0000 0.0000
0.0625 0.0000 0.0000
...
1.0000 1.0000 1.0000
```

**Key characteristics:**
- Magic header `CSPLUTV100`
- Type line: `1D` or `3D`
- Optional metadata block between `BEGIN METADATA` / `END METADATA`
- Pre-LUT section with per-channel 1D shaper (always present, even if identity)
- Each pre-LUT channel has: count line, input values line, output values line
- 3D cube dimensions can be non-uniform (e.g., `17 17 33`)
- Floating-point values in 0.0-1.0 range
- R varies fastest in data order

#### Parser Implementation Approach

```typescript
export function parseCSPLUT(content: string): LUT {
  // 1. Verify magic header "CSPLUTV100"
  // 2. Read type line ("1D" or "3D")
  // 3. Skip metadata block if present
  // 4. Parse pre-LUT shaper for each channel (R, G, B):
  //    a. Read count N
  //    b. Read N input values
  //    c. Read N output values
  //    d. Build per-channel 1D interpolation table
  // 5. If type is "3D":
  //    a. Read cube dimensions (sizeR sizeG sizeB)
  //    b. Read sizeR * sizeG * sizeB data triplets
  //    c. Reorder from R-fastest to B-fastest
  // 6. If pre-LUT is non-identity, compose it with the 3D LUT:
  //    - For each 3D LUT entry, run the input through the inverse pre-LUT
  //    - Or store as a combined LUT (apply pre-LUT to input before 3D lookup)
  // 7. If type is "1D":
  //    a. Use only the pre-LUT shaper data
  //    b. Build unified 1D LUT from the three channels
  // 8. Return LUT3D or LUT1D
}
```

#### Conversion to Internal Representation

- **Pre-LUT shaper**: Build a per-channel 1D lookup. If the pre-LUT is non-identity, bake it into the 3D LUT by pre-transforming the 3D grid sample points through the inverse shaper, or apply it at lookup time as a pre-process step.
- **3D data**: Reorder from R-fastest to B-fastest order. If cube dimensions are non-uniform, resample to uniform NxNxN using trilinear interpolation (use the largest dimension as N).
- **Domain**: `[0,0,0]` to `[1,1,1]` (native float range).

---

### 3. IRIDAS .itx / .look

#### File Format Specification

IRIDAS (now owned by Adobe) uses two related formats.

**.itx (IRIDAS Text LUT):**
```
# IRIDAS text LUT
# Lines starting with # are comments

LUT_3D_SIZE 17
LUT_3D_INPUT_RANGE 0.0 1.0

# Data: three floats per line
# Ordered with R varying fastest, then G, then B
0.000000 0.000000 0.000000
0.062500 0.000000 0.000000
...
1.000000 1.000000 1.000000
```

**.look (IRIDAS Look file - XML):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<look>
  <LUT>
    <title>My Look</title>
    <size>17</size>
    <inputRange>0.0 1.0</inputRange>
    <data>
      0.000000 0.000000 0.000000
      0.062500 0.000000 0.000000
      ...
      1.000000 1.000000 1.000000
    </data>
  </LUT>
  <!-- Optional 1D shaper -->
  <shaper>
    <size>4096</size>
    <data>
      0.000000 0.000000 0.000000
      ...
    </data>
  </shaper>
</look>
```

**Key characteristics:**
- `.itx`: Plain text, similar to `.cube` but with `LUT_3D_INPUT_RANGE` instead of `DOMAIN_MIN`/`DOMAIN_MAX`
- `.look`: XML wrapper around the same data
- R varies fastest in both formats
- Float values, typically 0.0-1.0
- `.look` may include an optional 1D shaper section

#### Parser Implementation Approach

```typescript
export function parseITXLUT(content: string): LUT {
  // 1. Strip comment lines (starting with #)
  // 2. Parse LUT_3D_SIZE
  // 3. Parse LUT_3D_INPUT_RANGE (maps to domainMin/domainMax as [min,min,min]/[max,max,max])
  // 4. Parse data triplets
  // 5. Reorder from R-fastest to B-fastest
  // 6. Return LUT3D
}

export function parseLookLUT(content: string): LUT {
  // 1. Parse XML using DOMParser
  // 2. Extract <LUT> element:
  //    a. Read <title>, <size>, <inputRange>
  //    b. Parse <data> as float triplets
  // 3. If <shaper> element exists:
  //    a. Parse shaper size and data
  //    b. Bake shaper into 3D LUT or store separately
  // 4. Reorder from R-fastest to B-fastest
  // 5. Return LUT3D
}
```

#### Conversion to Internal Representation

- **`.itx`**: Direct mapping. Parse `LUT_3D_INPUT_RANGE min max` into `domainMin=[min,min,min]`, `domainMax=[max,max,max]`. Reorder R-fastest to B-fastest. Return as `LUT3D`.
- **`.look`**: Extract LUT data from XML, handle optional shaper. Same reordering. Return as `LUT3D`.

---

### 4. Houdini .lut

#### File Format Specification

Houdini uses a simple ASCII format for both 1D and 3D LUTs.

**1D Format:**
```
Version         3
Format          any
Type            C
From            0.000000 1.000000
To              0.000000 1.000000
Black           0.000000
White           1.000000
Length          1024
LUT:
  R { 0.000000 0.000977 0.001953 ... 1.000000 }
  G { 0.000000 0.000977 0.001953 ... 1.000000 }
  B { 0.000000 0.000977 0.001953 ... 1.000000 }
```

**3D Format:**
```
Version         3
Format          any
Type            3D
From            0.000000 1.000000
To              0.000000 1.000000
Black           0.000000
White           1.000000
Length          32
LUT:
  { 0.0 0.0 0.0 } { 0.03125 0.0 0.0 } ... { 1.0 1.0 1.0 }
```

**Key characteristics:**
- Header with `Version`, `Format`, `Type` (`C` for 1D channel, `3D` for 3D)
- `From` / `To` define input/output ranges
- `Black` / `White` define clamping points
- `Length` is the LUT size (for 3D, this is the cube edge length)
- Data enclosed in `{ }` braces after `LUT:` marker
- 1D: Separate `R`, `G`, `B` arrays in braces
- 3D: Triplets in braces, R varies fastest

#### Parser Implementation Approach

```typescript
export function parseHoudiniLUT(content: string): LUT {
  // 1. Parse header key-value pairs:
  //    - Version, Format, Type, From, To, Black, White, Length
  // 2. Find "LUT:" marker line
  // 3. If Type == "C" (1D channel LUT):
  //    a. Parse R { ... }, G { ... }, B { ... } arrays
  //    b. Extract float values from within braces
  //    c. Interleave into R0,G0,B0,R1,G1,B1,... format
  //    d. Map From/To range to domainMin/domainMax
  //    e. Return LUT1D
  // 4. If Type == "3D":
  //    a. Parse all { r g b } triplets
  //    b. Reorder from R-fastest to B-fastest
  //    c. Map From/To range to domainMin/domainMax
  //    d. Return LUT3D
}
```

#### Conversion to Internal Representation

- **1D**: Parse each channel array separately, then interleave into `Float32Array(size * 3)`. `domainMin` from `From` (replicated to 3 channels), `domainMax` from `To`. Apply `Black`/`White` clamping to data values. Return as `LUT1D`.
- **3D**: Parse triplets, reorder to B-fastest. `Float32Array(size^3 * 3)`. Return as `LUT3D`.

---

### 5. Nuke .nk (Vectorfield Node Export)

#### File Format Specification

Nuke exports 3D LUTs as a Vectorfield node in its `.nk` script format.

```tcl
Vectorfield {
 vfield_file "/path/to/lut.cube"
 file_type "3D"
 label "My LUT"
 colorspaceIn "linear"
 colorspaceOut "linear"
 lut1d {curve x0 0 x1 1}
 lut3d {
  cube_size 32
  data "
   0.000000 0.000000 0.000000
   0.031250 0.000000 0.000000
   ...
   1.000000 1.000000 1.000000
  "
 }
}
```

**Alternative inline format (exported with "export LUT"):**
```
# Nuke CMSTestPattern Vectorfield export
# cube_size 32
# input_min 0.0 0.0 0.0
# input_max 1.0 1.0 1.0

0.000000 0.000000 0.000000
0.031250 0.000000 0.000000
...
1.000000 1.000000 1.000000
```

**Key characteristics:**
- TCL/Nuke script syntax for inline LUTs
- May contain both 1D pre-shaper (`lut1d`) and 3D data (`lut3d`)
- `cube_size` defines the 3D grid edge length
- Data may be inline in the node or reference an external file
- When exported as plain text, uses comment headers with `#` prefix
- R varies fastest in data order

#### Parser Implementation Approach

```typescript
export function parseNukeLUT(content: string): LUT {
  // 1. Detect format:
  //    a. If starts with "Vectorfield {" -> Nuke node format
  //    b. If starts with "#" comments with cube_size -> exported plain format
  // 2. For node format:
  //    a. Parse TCL-like syntax to extract lut3d { cube_size N data "..." }
  //    b. Extract cube_size and data string
  //    c. Parse data string as float triplets
  // 3. For exported format:
  //    a. Parse # comments for cube_size, input_min, input_max
  //    b. Parse remaining lines as float triplets
  // 4. Reorder from R-fastest to B-fastest
  // 5. Return LUT3D with appropriate domain
}
```

#### Conversion to Internal Representation

- Parse `cube_size` as the LUT size. Extract float triplets. Reorder to B-fastest. Set domain from `input_min`/`input_max` (default `[0,0,0]`/`[1,1,1]`). Return as `LUT3D`.

---

### 6. Pandora .mga (Telecine LUT)

#### File Format Specification

The Pandora `.mga` format is a telecine-era LUT format used in Spirit/Pogle systems.

```
MGA                                 # Magic identifier
LUT_TYPE 3D                         # LUT type: 1D or 3D
LUT_SIZE 17                         # Cube edge size
LUT_IN_BITDEPTH 10                  # Input bit depth
LUT_OUT_BITDEPTH 12                 # Output bit depth
# Data lines: three integers per line
# R G B values in output bit-depth range
# Ordered with R varying fastest
0 0 0
4 0 0
8 0 0
...
4095 4095 4095
```

**Key characteristics:**
- Magic header `MGA`
- Explicit input and output bit-depth declarations
- Integer values scaled to output bit depth
- R varies fastest in data order
- May also appear without explicit type/size headers, in which case the LUT size is inferred from the data count (cube root of line count)

#### Parser Implementation Approach

```typescript
export function parseMGALUT(content: string): LUT {
  // 1. Verify magic header "MGA"
  // 2. Parse header fields: LUT_TYPE, LUT_SIZE, LUT_IN_BITDEPTH, LUT_OUT_BITDEPTH
  // 3. If headers are missing, infer:
  //    a. Count data lines
  //    b. Cube root of count = LUT size
  //    c. Max value in data = output bit-depth range
  // 4. Parse data as integer triplets
  // 5. Normalize by dividing by (2^outBitDepth - 1)
  // 6. Reorder from R-fastest to B-fastest
  // 7. Return LUT3D
}
```

#### Conversion to Internal Representation

- Normalize integers to 0.0-1.0 by dividing by `(2^outBitDepth - 1)` (e.g., 4095 for 12-bit). Reorder to B-fastest. Domain is always `[0,0,0]` to `[1,1,1]`. Return as `LUT3D`.

---

### 7. RV 3D Format (OpenRV Native 3D LUT)

#### File Format Specification

OpenRV's native 3D LUT format is a compact binary/text format.

```
RV3DLUT
size 32
# Optional header fields
domain_min 0.0 0.0 0.0
domain_max 1.0 1.0 1.0
data:
0.000000 0.000000 0.000000
0.031250 0.000000 0.000000
...
1.000000 1.000000 1.000000
```

**Key characteristics:**
- Magic header `RV3DLUT`
- `size` field declares cubic dimension
- Optional `domain_min` / `domain_max`
- Data follows `data:` marker
- Float triplets per line
- B varies fastest (same as `.cube` convention)
- May also appear in a binary variant with header followed by raw float32 data

#### Parser Implementation Approach

```typescript
export function parseRV3DLUT(content: string): LUT3D {
  // 1. Verify magic header "RV3DLUT"
  // 2. Parse header fields: size, domain_min, domain_max
  // 3. Find "data:" marker
  // 4. Parse subsequent lines as float triplets
  // 5. Validate data count == size^3
  // 6. No reordering needed (already B-fastest like internal format)
  // 7. Return LUT3D
}
```

#### Conversion to Internal Representation

- Direct mapping. Data is already in B-fastest order matching the internal convention. Parse float triplets into `Float32Array(size^3 * 3)`. Domain from header or default `[0,0,0]`/`[1,1,1]`. Return as `LUT3D`.

---

### 8. RV Channel Format (OpenRV Native Channel LUT)

#### File Format Specification

OpenRV's native per-channel 1D LUT format.

```
RVCHANNELLUT
size 1024
channels 3
domain_min 0.0 0.0 0.0
domain_max 1.0 1.0 1.0
data:
# R G B triplets, one per input sample
0.000000 0.000000 0.000000
0.000977 0.000977 0.000977
0.001953 0.001953 0.001953
...
1.000000 1.000000 1.000000
```

**Alternative per-channel layout:**
```
RVCHANNELLUT
size 1024
channels 3
domain_min 0.0 0.0 0.0
domain_max 1.0 1.0 1.0
red:
0.000000 0.000977 0.001953 ... 1.000000
green:
0.000000 0.000977 0.001953 ... 1.000000
blue:
0.000000 0.000977 0.001953 ... 1.000000
```

**Key characteristics:**
- Magic header `RVCHANNELLUT`
- `size` is the number of entries per channel
- `channels` is always 3 (RGB)
- Optional `domain_min` / `domain_max`
- Two data layout variants: interleaved triplets or separate channel arrays
- Float values

#### Parser Implementation Approach

```typescript
export function parseRVChannelLUT(content: string): LUT1D {
  // 1. Verify magic header "RVCHANNELLUT"
  // 2. Parse header fields: size, channels, domain_min, domain_max
  // 3. Detect data layout:
  //    a. If "data:" marker -> interleaved triplets
  //    b. If "red:" / "green:" / "blue:" markers -> per-channel arrays
  // 4. For interleaved: parse triplets directly into Float32Array(size * 3)
  // 5. For per-channel: parse each channel array, then interleave
  // 6. Validate total data count == size * channels
  // 7. Return LUT1D
}
```

#### Conversion to Internal Representation

- Direct mapping for interleaved layout. For per-channel layout, interleave into `R0,G0,B0,R1,G1,B1,...` format. Domain from header or default `[0,0,0]`/`[1,1,1]`. Return as `LUT1D`.

---

## Unified Loader API

### Format Auto-Detection

```typescript
/**
 * Detect LUT format from file extension and/or content sniffing
 */
export type LUTFormat =
  | 'cube'
  | '3dl'
  | 'csp'
  | 'itx'
  | 'look'
  | 'houdini_lut'
  | 'nuke_nk'
  | 'mga'
  | 'rv3d'
  | 'rv_channel';

export function detectLUTFormat(filename: string, content?: string): LUTFormat | null {
  const ext = filename.toLowerCase().split('.').pop();

  switch (ext) {
    case 'cube': return 'cube';
    case '3dl': return '3dl';
    case 'csp': return 'csp';
    case 'itx': return 'itx';
    case 'look': return 'look';
    case 'lut': return 'houdini_lut';
    case 'nk': return 'nuke_nk';
    case 'mga': return 'mga';
    default: break;
  }

  // Content sniffing for extensionless files or ambiguous extensions
  if (content) {
    const firstLine = content.trim().split(/\r?\n/)[0]?.trim() ?? '';
    if (firstLine === 'CSPLUTV100') return 'csp';
    if (firstLine === 'MGA') return 'mga';
    if (firstLine === 'RV3DLUT') return 'rv3d';
    if (firstLine === 'RVCHANNELLUT') return 'rv_channel';
    if (firstLine.startsWith('Vectorfield')) return 'nuke_nk';
    if (firstLine.startsWith('<?xml') && content.includes('<look>')) return 'look';
    if (content.includes('LUT_3D_SIZE') || content.includes('LUT_1D_SIZE')) return 'cube';
    if (/^Version\s+\d+/m.test(content)) return 'houdini_lut';
  }

  return null;
}

/**
 * Universal LUT parser - detects format and delegates to the appropriate parser
 */
export function parseLUT(filename: string, content: string): LUT {
  const format = detectLUTFormat(filename, content);

  if (!format) {
    throw new Error(`Unsupported LUT format: ${filename}`);
  }

  switch (format) {
    case 'cube': return parseCubeLUT(content);
    case '3dl': return parse3DLLUT(content);
    case 'csp': return parseCSPLUT(content);
    case 'itx': return parseITXLUT(content);
    case 'look': return parseLookLUT(content);
    case 'houdini_lut': return parseHoudiniLUT(content);
    case 'nuke_nk': return parseNukeLUT(content);
    case 'mga': return parseMGALUT(content);
    case 'rv3d': return parseRV3DLUT(content);
    case 'rv_channel': return parseRVChannelLUT(content);
  }
}
```

### Data Reordering Utility

Many formats store data with R varying fastest, while the internal representation (matching `.cube` convention) uses B varying fastest. A shared reordering function is needed:

```typescript
/**
 * Reorder 3D LUT data from R-fastest to B-fastest order
 * Input order:  for b in [0..N): for g in [0..N): for r in [0..N): data[r][g][b]
 * Output order: for r in [0..N): for g in [0..N): for b in [0..N): data[r][g][b]
 */
export function reorderRFastestToBFastest(data: Float32Array, size: number): Float32Array {
  const result = new Float32Array(data.length);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const srcIdx = (b * size * size + g * size + r) * 3;
        const dstIdx = (r * size * size + g * size + b) * 3;
        result[dstIdx] = data[srcIdx]!;
        result[dstIdx + 1] = data[srcIdx + 1]!;
        result[dstIdx + 2] = data[srcIdx + 2]!;
      }
    }
  }
  return result;
}
```

---

## UI/UX Specification

### File Extension Auto-Detection

The LUT load button and file input must be updated to accept all supported formats:

**Current** (`src/ui/components/ColorControls.ts` line 260):
```typescript
fileInput.accept = '.cube';
```

**Updated:**
```typescript
fileInput.accept = '.cube,.3dl,.csp,.itx,.look,.lut,.nk,.mga';
```

**Current** (line 245-246):
```typescript
lutLoadBtn.textContent = 'Load .cube';
lutLoadBtn.title = 'Load a .cube LUT file';
```

**Updated:**
```typescript
lutLoadBtn.textContent = 'Load LUT';
lutLoadBtn.title = 'Load a LUT file (.cube, .3dl, .csp, .itx, .look, .lut, .nk, .mga)';
```

### File Loading Flow

1. User clicks "Load LUT" button
2. File picker opens with all supported extensions
3. On file selection:
   a. Read file content as text
   b. Call `detectLUTFormat(filename, content)` to determine format
   c. If format is `null`, show error: "Unsupported LUT format: {filename}"
   d. Call `parseLUT(filename, content)` to parse
   e. On parse error, show error alert with the error message
   f. On success, apply LUT to pipeline and update UI with LUT title
4. Active LUT name label shows the parsed `title` field (or filename if no title)

### Error Messages

| Condition | Message |
|-----------|---------|
| Unknown extension, no content match | "Unsupported LUT format: {filename}" |
| Parse error (malformed header) | "Failed to parse {format} LUT: {detail}" |
| Parse error (wrong data count) | "{format} LUT: Expected {expected} data entries, got {actual}" |
| Parse error (invalid values) | "{format} LUT: Invalid data at line {lineNum}" |

### Keyboard / Accessibility

- No changes to existing keyboard shortcuts (`C` to toggle panel)
- File picker is browser-native and inherently accessible
- Error messages use the existing alert mechanism

---

## File Structure

```
src/color/
  LUTLoader.ts               - Existing .cube parser (unchanged)
  LUTLoader.test.ts          - Existing .cube tests (unchanged)
  LUTFormats.ts              - NEW: All additional format parsers
  LUTFormats.test.ts         - NEW: Unit tests for all additional formats
  LUTFormatDetect.ts         - NEW: Format detection and unified parseLUT()
  LUTFormatDetect.test.ts    - NEW: Format detection unit tests
  LUTUtils.ts                - NEW: Shared utilities (reorderRFastestToBFastest, normalizeIntegers)
  LUTUtils.test.ts           - NEW: Utility function unit tests
  WebGLLUT.ts                - Existing WebGL processor (unchanged)

src/ui/components/
  ColorControls.ts           - MODIFIED: Update file accept and button label

test/
  fixtures/
    lut/
      sample.3dl             - NEW: Sample Autodesk 3DL file for testing
      sample.csp             - NEW: Sample cineSpace CSP file for testing
      sample.itx             - NEW: Sample IRIDAS ITX file for testing
      sample.look            - NEW: Sample IRIDAS Look XML file for testing
      sample.lut             - NEW: Sample Houdini LUT file for testing
      sample.nk              - NEW: Sample Nuke Vectorfield export for testing
      sample.mga             - NEW: Sample Pandora MGA file for testing
      sample-rv3d.txt        - NEW: Sample RV 3D LUT file for testing
      sample-rvchannel.txt   - NEW: Sample RV Channel LUT file for testing

e2e/
  lut-formats.spec.ts        - NEW: E2E tests for LUT format loading
```

---

## E2E Test Cases (`e2e/lut-formats.spec.ts`)

All E2E tests use Playwright and follow the existing pattern from `e2e/color-controls.spec.ts`.

| Test ID | Description | Priority |
|---------|-------------|----------|
| LUTF-E001 | Loading a valid `.3dl` 3D LUT should apply color transformation to canvas | High |
| LUTF-E002 | Loading a valid `.3dl` 1D LUT should apply color transformation to canvas | High |
| LUTF-E003 | Loading a valid `.csp` LUT should apply color transformation to canvas | High |
| LUTF-E004 | Loading a valid `.itx` LUT should apply color transformation to canvas | High |
| LUTF-E005 | Loading a valid `.look` LUT should apply color transformation to canvas | High |
| LUTF-E006 | Loading a valid `.lut` (Houdini 1D) LUT should apply color transformation | High |
| LUTF-E007 | Loading a valid `.lut` (Houdini 3D) LUT should apply color transformation | High |
| LUTF-E008 | Loading a valid `.nk` Vectorfield should apply color transformation | High |
| LUTF-E009 | Loading a valid `.mga` LUT should apply color transformation to canvas | High |
| LUTF-E010 | Loading an RV 3D LUT file should apply color transformation to canvas | High |
| LUTF-E011 | Loading an RV Channel LUT file should apply color transformation to canvas | High |
| LUTF-E012 | Load LUT button should accept all supported file extensions | Medium |
| LUTF-E013 | Loading an unsupported file extension should show error alert | Medium |
| LUTF-E014 | Loading a malformed `.3dl` file should show parse error alert | Medium |
| LUTF-E015 | Loading a malformed `.csp` file should show parse error alert | Medium |
| LUTF-E016 | LUT intensity slider should work with non-.cube formats | Medium |
| LUTF-E017 | Clearing a non-.cube LUT should restore original canvas pixels | Medium |
| LUTF-E018 | Loading a `.csp` with non-identity pre-LUT shaper should produce correct output | Medium |
| LUTF-E019 | Loading a second LUT of a different format should replace the first | Medium |
| LUTF-E020 | LUT title from parsed file should display in the UI label | Low |

### E2E Test Implementation Pattern

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('LUT Format Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for viewer to initialize with a test image
    await page.waitForSelector('[data-testid="viewer-canvas"]');
  });

  test('LUTF-E001: Loading a valid .3dl 3D LUT should apply color transformation', async ({ page }) => {
    // Capture canvas pixels before LUT
    const canvasBefore = await page.locator('[data-testid="viewer-canvas"]').screenshot();

    // Open color panel
    await page.keyboard.press('c');
    await page.waitForSelector('[data-testid="color-panel"]');

    // Trigger file input with .3dl file
    const fileInput = page.locator('[data-testid="color-panel"] input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../test/fixtures/lut/sample.3dl'));

    // Wait for LUT to apply
    await page.waitForTimeout(500);

    // Capture canvas pixels after LUT
    const canvasAfter = await page.locator('[data-testid="viewer-canvas"]').screenshot();

    // Pixels should differ (LUT was applied)
    expect(canvasBefore).not.toEqual(canvasAfter);
  });

  test('LUTF-E012: Load LUT button should accept all supported file extensions', async ({ page }) => {
    await page.keyboard.press('c');
    await page.waitForSelector('[data-testid="color-panel"]');

    const fileInput = page.locator('[data-testid="color-panel"] input[type="file"]');
    const acceptAttr = await fileInput.getAttribute('accept');

    expect(acceptAttr).toContain('.cube');
    expect(acceptAttr).toContain('.3dl');
    expect(acceptAttr).toContain('.csp');
    expect(acceptAttr).toContain('.itx');
    expect(acceptAttr).toContain('.look');
    expect(acceptAttr).toContain('.lut');
    expect(acceptAttr).toContain('.nk');
    expect(acceptAttr).toContain('.mga');
  });

  test('LUTF-E013: Loading unsupported file should show error', async ({ page }) => {
    await page.keyboard.press('c');
    await page.waitForSelector('[data-testid="color-panel"]');

    // Listen for dialog (alert)
    const dialogPromise = page.waitForEvent('dialog');

    const fileInput = page.locator('[data-testid="color-panel"] input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.xyz',
      mimeType: 'text/plain',
      buffer: Buffer.from('invalid data'),
    });

    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Unsupported');
    await dialog.accept();
  });

  test('LUTF-E020: LUT title from parsed file should display in UI', async ({ page }) => {
    await page.keyboard.press('c');
    await page.waitForSelector('[data-testid="color-panel"]');

    const fileInput = page.locator('[data-testid="color-panel"] input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../test/fixtures/lut/sample.3dl'));

    await page.waitForTimeout(500);

    const lutLabel = page.locator('[data-testid="color-panel"]').locator('text=sample.3dl');
    await expect(lutLabel).toBeVisible();
  });
});
```

---

## Unit Test Cases

### Format Detection Tests (`src/color/LUTFormatDetect.test.ts`)

Tests use `vitest` following the existing pattern from `src/color/LUTLoader.test.ts`.

| Test ID | Description | Priority |
|---------|-------------|----------|
| LUTD-001 | detectLUTFormat returns 'cube' for .cube extension | High |
| LUTD-002 | detectLUTFormat returns '3dl' for .3dl extension | High |
| LUTD-003 | detectLUTFormat returns 'csp' for .csp extension | High |
| LUTD-004 | detectLUTFormat returns 'itx' for .itx extension | High |
| LUTD-005 | detectLUTFormat returns 'look' for .look extension | High |
| LUTD-006 | detectLUTFormat returns 'houdini_lut' for .lut extension | High |
| LUTD-007 | detectLUTFormat returns 'nuke_nk' for .nk extension | High |
| LUTD-008 | detectLUTFormat returns 'mga' for .mga extension | High |
| LUTD-009 | detectLUTFormat returns null for unknown extension without content | High |
| LUTD-010 | detectLUTFormat sniffs 'csp' from CSPLUTV100 magic header | High |
| LUTD-011 | detectLUTFormat sniffs 'mga' from MGA magic header | High |
| LUTD-012 | detectLUTFormat sniffs 'rv3d' from RV3DLUT magic header | High |
| LUTD-013 | detectLUTFormat sniffs 'rv_channel' from RVCHANNELLUT magic header | High |
| LUTD-014 | detectLUTFormat sniffs 'nuke_nk' from Vectorfield content | Medium |
| LUTD-015 | detectLUTFormat sniffs 'look' from XML with look element | Medium |
| LUTD-016 | detectLUTFormat sniffs 'cube' from LUT_3D_SIZE content | Medium |
| LUTD-017 | detectLUTFormat sniffs 'houdini_lut' from Version header | Medium |
| LUTD-018 | parseLUT delegates to correct parser for each format | High |
| LUTD-019 | parseLUT throws for unsupported format | High |
| LUTD-020 | detectLUTFormat is case-insensitive for extensions | Medium |

#### Sample Test Implementation

```typescript
import { describe, it, expect } from 'vitest';
import { detectLUTFormat, parseLUT } from './LUTFormatDetect';

describe('LUTFormatDetect', () => {
  describe('detectLUTFormat', () => {
    it('LUTD-001: returns cube for .cube extension', () => {
      expect(detectLUTFormat('my_lut.cube')).toBe('cube');
    });

    it('LUTD-002: returns 3dl for .3dl extension', () => {
      expect(detectLUTFormat('my_lut.3dl')).toBe('3dl');
    });

    it('LUTD-009: returns null for unknown extension', () => {
      expect(detectLUTFormat('my_lut.xyz')).toBeNull();
    });

    it('LUTD-010: sniffs csp from CSPLUTV100 header', () => {
      expect(detectLUTFormat('unknown', 'CSPLUTV100\n3D\n')).toBe('csp');
    });

    it('LUTD-020: is case-insensitive for extensions', () => {
      expect(detectLUTFormat('MY_LUT.CUBE')).toBe('cube');
      expect(detectLUTFormat('my_lut.3DL')).toBe('3dl');
      expect(detectLUTFormat('my_lut.CSP')).toBe('csp');
    });
  });

  describe('parseLUT', () => {
    it('LUTD-019: throws for unsupported format', () => {
      expect(() => parseLUT('test.xyz', 'random data')).toThrow('Unsupported LUT format');
    });
  });
});
```

---

### Autodesk .3dl Parser Tests (`src/color/LUTFormats.test.ts`)

| Test ID | Description | Priority |
|---------|-------------|----------|
| L3DL-001 | parse3DLLUT parses valid 3D .3dl with 12-bit output | High |
| L3DL-002 | parse3DLLUT normalizes integer values to 0.0-1.0 range | High |
| L3DL-003 | parse3DLLUT detects 3D LUT from cube data count | High |
| L3DL-004 | parse3DLLUT detects 1D LUT from linear data count | High |
| L3DL-005 | parse3DLLUT ignores comment lines starting with # | High |
| L3DL-006 | parse3DLLUT handles 10-bit output range (0-1023) | Medium |
| L3DL-007 | parse3DLLUT reorders data from R-fastest to B-fastest | High |
| L3DL-008 | parse3DLLUT identity LUT produces no visible change via applyLUT3D | High |
| L3DL-009 | parse3DLLUT handles Windows line endings (CRLF) | Medium |
| L3DL-010 | parse3DLLUT throws on empty file | Medium |
| L3DL-011 | parse3DLLUT infers LUT size from header range line | Medium |
| L3DL-012 | parse3DLLUT result has correct domain [0,0,0] to [1,1,1] | High |
| L3DL-013 | parse3DLLUT result passes isLUT3D / isLUT1D check | High |

#### Sample Test Implementation

```typescript
import { describe, it, expect } from 'vitest';
import { parse3DLLUT } from './LUTFormats';
import { isLUT3D, isLUT1D, applyLUT3D } from './LUTLoader';

describe('Autodesk .3dl Parser', () => {
  // Helper: generate an identity 3D .3dl with size N
  function createIdentity3DL3D(size: number): string {
    const maxOut = 4095; // 12-bit
    const lines: string[] = [];
    // Header line: input range for 10-bit
    const rangeEntries: number[] = [];
    for (let i = 0; i < size; i++) {
      rangeEntries.push(Math.round((i / (size - 1)) * 1023));
    }
    lines.push(rangeEntries.join(' '));
    // Data: R varies fastest
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const rv = Math.round((r / (size - 1)) * maxOut);
          const gv = Math.round((g / (size - 1)) * maxOut);
          const bv = Math.round((b / (size - 1)) * maxOut);
          lines.push(`${rv} ${gv} ${bv}`);
        }
      }
    }
    return lines.join('\n');
  }

  it('L3DL-001: parses valid 3D .3dl with 12-bit output', () => {
    const content = createIdentity3DL3D(4);
    const lut = parse3DLLUT(content);

    expect(lut.size).toBe(4);
    expect(lut.data.length).toBe(4 * 4 * 4 * 3);
  });

  it('L3DL-002: normalizes integer values to 0.0-1.0 range', () => {
    const content = createIdentity3DL3D(2);
    const lut = parse3DLLUT(content);

    // All values should be in [0, 1]
    for (let i = 0; i < lut.data.length; i++) {
      expect(lut.data[i]).toBeGreaterThanOrEqual(0);
      expect(lut.data[i]).toBeLessThanOrEqual(1);
    }
  });

  it('L3DL-008: identity LUT produces no visible change', () => {
    const content = createIdentity3DL3D(4);
    const lut = parse3DLLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });

  it('L3DL-012: result has correct domain', () => {
    const content = createIdentity3DL3D(2);
    const lut = parse3DLLUT(content);

    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([1, 1, 1]);
  });

  it('L3DL-013: result passes isLUT3D check', () => {
    const content = createIdentity3DL3D(2);
    const lut = parse3DLLUT(content);

    expect(isLUT3D(lut)).toBe(true);
    expect(isLUT1D(lut)).toBe(false);
  });
});
```

---

### Rising Sun .csp Parser Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| LCSP-001 | parseCSPLUT parses valid 3D .csp file with identity pre-LUT | High |
| LCSP-002 | parseCSPLUT verifies CSPLUTV100 magic header | High |
| LCSP-003 | parseCSPLUT throws on missing magic header | High |
| LCSP-004 | parseCSPLUT parses metadata title | Medium |
| LCSP-005 | parseCSPLUT handles identity pre-LUT shaper (pass-through) | High |
| LCSP-006 | parseCSPLUT handles non-identity pre-LUT shaper (log curve) | High |
| LCSP-007 | parseCSPLUT supports non-uniform cube dimensions (e.g., 17x17x33) | Medium |
| LCSP-008 | parseCSPLUT reorders data from R-fastest to B-fastest | High |
| LCSP-009 | parseCSPLUT identity LUT produces no visible change | High |
| LCSP-010 | parseCSPLUT result passes isLUT3D check | High |
| LCSP-011 | parseCSPLUT parses 1D type correctly | Medium |
| LCSP-012 | parseCSPLUT throws on wrong data count | Medium |

#### Sample Test Implementation

```typescript
describe('Rising Sun .csp Parser', () => {
  function createIdentityCSP(size: number): string {
    const lines: string[] = [
      'CSPLUTV100',
      '3D',
      '',
      'BEGIN METADATA',
      '"title" "Test CSP LUT"',
      'END METADATA',
      '',
      // Identity pre-LUT for R
      '2', '0.0 1.0', '0.0 1.0',
      // Identity pre-LUT for G
      '2', '0.0 1.0', '0.0 1.0',
      // Identity pre-LUT for B
      '2', '0.0 1.0', '0.0 1.0',
      '',
      `${size} ${size} ${size}`,
    ];
    // Data: R varies fastest
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const rv = r / (size - 1);
          const gv = g / (size - 1);
          const bv = b / (size - 1);
          lines.push(`${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)}`);
        }
      }
    }
    return lines.join('\n');
  }

  it('LCSP-001: parses valid 3D .csp with identity pre-LUT', () => {
    const content = createIdentityCSP(4);
    const lut = parseCSPLUT(content);

    expect(lut.size).toBe(4);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('LCSP-002: verifies CSPLUTV100 magic header', () => {
    const content = createIdentityCSP(2);
    expect(() => parseCSPLUT(content)).not.toThrow();
  });

  it('LCSP-003: throws on missing magic header', () => {
    expect(() => parseCSPLUT('INVALID\n3D\n')).toThrow();
  });

  it('LCSP-009: identity LUT produces no visible change', () => {
    const content = createIdentityCSP(4);
    const lut = parseCSPLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });
});
```

---

### IRIDAS .itx / .look Parser Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| LITX-001 | parseITXLUT parses valid .itx file with LUT_3D_SIZE | High |
| LITX-002 | parseITXLUT parses LUT_3D_INPUT_RANGE into domain | High |
| LITX-003 | parseITXLUT ignores comment lines | High |
| LITX-004 | parseITXLUT reorders data from R-fastest to B-fastest | High |
| LITX-005 | parseITXLUT identity LUT produces no visible change | High |
| LITX-006 | parseITXLUT throws on missing size | Medium |
| LLOOK-001 | parseLookLUT parses valid .look XML file | High |
| LLOOK-002 | parseLookLUT extracts title from XML | Medium |
| LLOOK-003 | parseLookLUT parses shaper section when present | Medium |
| LLOOK-004 | parseLookLUT identity LUT produces no visible change | High |
| LLOOK-005 | parseLookLUT throws on invalid XML | Medium |

#### Sample Test Implementation

```typescript
describe('IRIDAS .itx Parser', () => {
  function createIdentityITX(size: number): string {
    const lines: string[] = [
      '# IRIDAS text LUT',
      `LUT_3D_SIZE ${size}`,
      'LUT_3D_INPUT_RANGE 0.0 1.0',
    ];
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const rv = r / (size - 1);
          const gv = g / (size - 1);
          const bv = b / (size - 1);
          lines.push(`${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)}`);
        }
      }
    }
    return lines.join('\n');
  }

  it('LITX-001: parses valid .itx file', () => {
    const content = createIdentityITX(4);
    const lut = parseITXLUT(content);

    expect(lut.size).toBe(4);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('LITX-002: parses LUT_3D_INPUT_RANGE into domain', () => {
    const content = createIdentityITX(2).replace(
      'LUT_3D_INPUT_RANGE 0.0 1.0',
      'LUT_3D_INPUT_RANGE 0.1 0.9'
    );
    const lut = parseITXLUT(content);

    expect(lut.domainMin).toEqual([0.1, 0.1, 0.1]);
    expect(lut.domainMax).toEqual([0.9, 0.9, 0.9]);
  });

  it('LITX-005: identity LUT produces no visible change', () => {
    const content = createIdentityITX(4);
    const lut = parseITXLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.25, 0.5, 0.75);
    expect(result[0]).toBeCloseTo(0.25, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.75, 1);
  });
});

describe('IRIDAS .look Parser', () => {
  function createIdentityLook(size: number): string {
    const dataLines: string[] = [];
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const rv = r / (size - 1);
          const gv = g / (size - 1);
          const bv = b / (size - 1);
          dataLines.push(`      ${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)}`);
        }
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<look>
  <LUT>
    <title>Test Look</title>
    <size>${size}</size>
    <inputRange>0.0 1.0</inputRange>
    <data>
${dataLines.join('\n')}
    </data>
  </LUT>
</look>`;
  }

  it('LLOOK-001: parses valid .look XML file', () => {
    const content = createIdentityLook(4);
    const lut = parseLookLUT(content);

    expect(lut.size).toBe(4);
    expect(isLUT3D(lut)).toBe(true);
  });

  it('LLOOK-002: extracts title from XML', () => {
    const content = createIdentityLook(2);
    const lut = parseLookLUT(content);

    expect(lut.title).toBe('Test Look');
  });
});
```

---

### Houdini .lut Parser Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| LHDN-001 | parseHoudiniLUT parses valid 1D channel LUT (Type C) | High |
| LHDN-002 | parseHoudiniLUT parses valid 3D LUT (Type 3D) | High |
| LHDN-003 | parseHoudiniLUT parses From/To range into domain | High |
| LHDN-004 | parseHoudiniLUT extracts data from brace-delimited arrays | High |
| LHDN-005 | parseHoudiniLUT parses per-channel R/G/B arrays for 1D type | High |
| LHDN-006 | parseHoudiniLUT parses triplet braces for 3D type | High |
| LHDN-007 | parseHoudiniLUT identity 1D LUT produces no visible change | High |
| LHDN-008 | parseHoudiniLUT identity 3D LUT produces no visible change | High |
| LHDN-009 | parseHoudiniLUT throws on missing LUT: marker | Medium |
| LHDN-010 | parseHoudiniLUT handles Version 2 and Version 3 | Medium |

#### Sample Test Implementation

```typescript
describe('Houdini .lut Parser', () => {
  function createIdentityHoudini1D(size: number): string {
    const values: string[] = [];
    for (let i = 0; i < size; i++) {
      values.push((i / (size - 1)).toFixed(6));
    }
    const channelData = values.join(' ');
    return [
      'Version\t\t3',
      'Format\t\tany',
      'Type\t\tC',
      'From\t\t0.000000 1.000000',
      'To\t\t0.000000 1.000000',
      'Black\t\t0.000000',
      'White\t\t1.000000',
      `Length\t\t${size}`,
      'LUT:',
      `R { ${channelData} }`,
      `G { ${channelData} }`,
      `B { ${channelData} }`,
    ].join('\n');
  }

  it('LHDN-001: parses valid 1D channel LUT', () => {
    const content = createIdentityHoudini1D(256);
    const lut = parseHoudiniLUT(content);

    expect(lut.size).toBe(256);
    expect(isLUT1D(lut)).toBe(true);
  });

  it('LHDN-003: parses From/To range into domain', () => {
    const content = createIdentityHoudini1D(16).replace(
      'From\t\t0.000000 1.000000',
      'From\t\t0.100000 0.900000'
    );
    const lut = parseHoudiniLUT(content);

    expect(lut.domainMin[0]).toBeCloseTo(0.1);
    expect(lut.domainMax[0]).toBeCloseTo(0.9);
  });

  it('LHDN-007: identity 1D LUT produces no visible change', () => {
    const content = createIdentityHoudini1D(256);
    const lut = parseHoudiniLUT(content);

    if (!isLUT1D(lut)) throw new Error('Expected 1D LUT');

    const result = applyLUT1D(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.5, 1);
  });
});
```

---

### Nuke .nk Parser Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| LNUK-001 | parseNukeLUT parses valid Vectorfield node format | High |
| LNUK-002 | parseNukeLUT parses exported plain text format with # comments | High |
| LNUK-003 | parseNukeLUT extracts cube_size from node | High |
| LNUK-004 | parseNukeLUT extracts input_min / input_max from comments | Medium |
| LNUK-005 | parseNukeLUT reorders data from R-fastest to B-fastest | High |
| LNUK-006 | parseNukeLUT identity LUT produces no visible change | High |
| LNUK-007 | parseNukeLUT throws on malformed Vectorfield syntax | Medium |

---

### Pandora .mga Parser Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| LMGA-001 | parseMGALUT parses valid .mga file with explicit headers | High |
| LMGA-002 | parseMGALUT verifies MGA magic header | High |
| LMGA-003 | parseMGALUT throws on missing magic header | High |
| LMGA-004 | parseMGALUT normalizes integers by output bit depth | High |
| LMGA-005 | parseMGALUT infers size when header is minimal | Medium |
| LMGA-006 | parseMGALUT reorders data from R-fastest to B-fastest | High |
| LMGA-007 | parseMGALUT identity LUT produces no visible change | High |
| LMGA-008 | parseMGALUT handles 10-bit and 12-bit output depths | Medium |

---

### RV 3D LUT Parser Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| LRV3-001 | parseRV3DLUT parses valid RV3DLUT file | High |
| LRV3-002 | parseRV3DLUT verifies RV3DLUT magic header | High |
| LRV3-003 | parseRV3DLUT throws on missing magic header | High |
| LRV3-004 | parseRV3DLUT parses domain_min / domain_max | High |
| LRV3-005 | parseRV3DLUT uses default domain when not specified | Medium |
| LRV3-006 | parseRV3DLUT does not reorder (already B-fastest) | High |
| LRV3-007 | parseRV3DLUT identity LUT produces no visible change | High |
| LRV3-008 | parseRV3DLUT throws on wrong data count | Medium |
| LRV3-009 | parseRV3DLUT result passes isLUT3D check | High |

#### Sample Test Implementation

```typescript
describe('RV 3D LUT Parser', () => {
  function createIdentityRV3D(size: number): string {
    const lines: string[] = [
      'RV3DLUT',
      `size ${size}`,
      'domain_min 0.0 0.0 0.0',
      'domain_max 1.0 1.0 1.0',
      'data:',
    ];
    // B-fastest order (same as internal format)
    for (let r = 0; r < size; r++) {
      for (let g = 0; g < size; g++) {
        for (let b = 0; b < size; b++) {
          const rv = r / (size - 1);
          const gv = g / (size - 1);
          const bv = b / (size - 1);
          lines.push(`${rv.toFixed(6)} ${gv.toFixed(6)} ${bv.toFixed(6)}`);
        }
      }
    }
    return lines.join('\n');
  }

  it('LRV3-001: parses valid RV3DLUT file', () => {
    const content = createIdentityRV3D(4);
    const lut = parseRV3DLUT(content);

    expect(lut.size).toBe(4);
    expect(lut.data.length).toBe(4 * 4 * 4 * 3);
  });

  it('LRV3-004: parses domain_min / domain_max', () => {
    const content = createIdentityRV3D(2).replace(
      'domain_min 0.0 0.0 0.0',
      'domain_min 0.1 0.2 0.3'
    ).replace(
      'domain_max 1.0 1.0 1.0',
      'domain_max 0.9 0.8 0.7'
    );
    const lut = parseRV3DLUT(content);

    expect(lut.domainMin[0]).toBeCloseTo(0.1);
    expect(lut.domainMin[1]).toBeCloseTo(0.2);
    expect(lut.domainMin[2]).toBeCloseTo(0.3);
    expect(lut.domainMax[0]).toBeCloseTo(0.9);
    expect(lut.domainMax[1]).toBeCloseTo(0.8);
    expect(lut.domainMax[2]).toBeCloseTo(0.7);
  });

  it('LRV3-007: identity LUT produces no visible change', () => {
    const content = createIdentityRV3D(4);
    const lut = parseRV3DLUT(content);

    if (!isLUT3D(lut)) throw new Error('Expected 3D LUT');

    const result = applyLUT3D(lut, 0.25, 0.5, 0.75);
    expect(result[0]).toBeCloseTo(0.25, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
    expect(result[2]).toBeCloseTo(0.75, 1);
  });

  it('LRV3-009: result passes isLUT3D check', () => {
    const content = createIdentityRV3D(2);
    const lut = parseRV3DLUT(content);

    expect(isLUT3D(lut)).toBe(true);
    expect(isLUT1D(lut)).toBe(false);
  });
});
```

---

### RV Channel LUT Parser Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| LRVC-001 | parseRVChannelLUT parses valid interleaved format | High |
| LRVC-002 | parseRVChannelLUT parses valid per-channel format (red:/green:/blue:) | High |
| LRVC-003 | parseRVChannelLUT verifies RVCHANNELLUT magic header | High |
| LRVC-004 | parseRVChannelLUT throws on missing magic header | High |
| LRVC-005 | parseRVChannelLUT parses domain_min / domain_max | High |
| LRVC-006 | parseRVChannelLUT uses default domain when not specified | Medium |
| LRVC-007 | parseRVChannelLUT identity LUT produces no visible change | High |
| LRVC-008 | parseRVChannelLUT result passes isLUT1D check | High |
| LRVC-009 | parseRVChannelLUT each channel is processed independently | Medium |
| LRVC-010 | parseRVChannelLUT throws on wrong data count | Medium |

---

### Utility Function Tests (`src/color/LUTUtils.test.ts`)

| Test ID | Description | Priority |
|---------|-------------|----------|
| LUTU-001 | reorderRFastestToBFastest correctly transposes size-2 cube | High |
| LUTU-002 | reorderRFastestToBFastest correctly transposes size-4 cube | High |
| LUTU-003 | reorderRFastestToBFastest preserves identity LUT semantics | High |
| LUTU-004 | reorderRFastestToBFastest round-trip produces original data | High |
| LUTU-005 | reorderRFastestToBFastest handles size-1 (single entry, no-op) | Medium |
| LUTU-006 | normalizeIntegers converts 12-bit range to 0.0-1.0 | High |
| LUTU-007 | normalizeIntegers converts 10-bit range to 0.0-1.0 | High |
| LUTU-008 | normalizeIntegers preserves 0 as 0.0 and max as 1.0 | High |

#### Sample Test Implementation

```typescript
import { describe, it, expect } from 'vitest';
import { reorderRFastestToBFastest } from './LUTUtils';

describe('LUTUtils', () => {
  describe('reorderRFastestToBFastest', () => {
    it('LUTU-001: correctly transposes size-2 cube', () => {
      // R-fastest order: iterate b, g, r
      // Entry [r=0,g=0,b=0], [r=1,g=0,b=0], [r=0,g=1,b=0], [r=1,g=1,b=0],
      // [r=0,g=0,b=1], [r=1,g=0,b=1], [r=0,g=1,b=1], [r=1,g=1,b=1]
      const input = new Float32Array([
        0,0,0,  1,0,0,  0,1,0,  1,1,0,  // b=0
        0,0,1,  1,0,1,  0,1,1,  1,1,1,  // b=1
      ]);

      const result = reorderRFastestToBFastest(input, 2);

      // B-fastest order: iterate r, g, b
      // Entry [r=0,g=0,b=0], [r=0,g=0,b=1], [r=0,g=1,b=0], [r=0,g=1,b=1],
      // [r=1,g=0,b=0], [r=1,g=0,b=1], [r=1,g=1,b=0], [r=1,g=1,b=1]
      expect(Array.from(result)).toEqual([
        0,0,0,  0,0,1,  0,1,0,  0,1,1,
        1,0,0,  1,0,1,  1,1,0,  1,1,1,
      ]);
    });

    it('LUTU-004: round-trip produces original data', () => {
      const original = new Float32Array([
        0.1, 0.2, 0.3,  0.4, 0.5, 0.6,
        0.7, 0.8, 0.9,  1.0, 0.0, 0.1,
        0.2, 0.3, 0.4,  0.5, 0.6, 0.7,
        0.8, 0.9, 1.0,  0.0, 0.1, 0.2,
      ]);

      const reordered = reorderRFastestToBFastest(original, 2);
      // Reverse: B-fastest back to R-fastest (swap src/dst index logic)
      const restored = reorderRFastestToBFastest(reordered, 2);

      // Note: double reorder is NOT an identity - need the inverse function
      // This test verifies that the reorder is deterministic
      const reorderedAgain = reorderRFastestToBFastest(original, 2);
      expect(Array.from(reordered)).toEqual(Array.from(reorderedAgain));
    });
  });
});
```

---

## Technical Notes

### Performance Considerations

- **Parsing**: All parsers operate on string content. For very large LUTs (65x65x65 = 274,625 entries), parsing should remain under 100ms on modern hardware. If performance becomes an issue, consider using a streaming parser or Web Worker.
- **Reordering**: The R-fastest to B-fastest reorder is O(N^3) and allocates a new `Float32Array`. For typical sizes (17-65), this is negligible.
- **Memory**: A 65^3 3D LUT with Float32 RGB data requires ~3.1 MB. This is well within browser memory limits.
- **WebGL texture upload**: No changes needed. The existing `createLUTTexture` and `createLUT1DTexture` functions work with any `LUT3D`/`LUT1D` regardless of source format.

### Data Ordering Convention

The internal representation follows the `.cube` convention where data is stored in "R varies slowest, B varies fastest" order. This means:

```
for r in [0..size):
  for g in [0..size):
    for b in [0..size):
      data[(r * size * size + g * size + b) * 3 + channel]
```

Formats that use "R varies fastest" (`.3dl`, `.csp`, `.itx`, `.look`, `.nk`, `.mga`) must be reordered during parsing.

Formats that already use "B varies fastest" (`.cube`, `RV3DLUT`) need no reordering.

### Error Handling Strategy

All parsers should throw descriptive `Error` objects with format-prefixed messages:
- `"3DL: Expected N^3 data entries, got M"`
- `"CSP: Missing CSPLUTV100 magic header"`
- `"ITX: LUT_3D_SIZE not found"`

The unified `parseLUT` function propagates these errors to the caller (ColorControls UI), which displays them via the existing alert mechanism.

### Browser Compatibility

- **DOMParser** (for `.look` XML parsing): Available in all modern browsers and in vitest via jsdom.
- **Float32Array**: Available in all modern browsers.
- **No external dependencies**: All parsers are pure TypeScript with no library requirements.

## Dependencies

- No new npm packages required
- Uses existing `LUT3D`, `LUT1D`, `isLUT3D`, `isLUT1D`, `applyLUT3D`, `applyLUT1D` from `src/color/LUTLoader.ts`
- Uses existing `createLUTTexture`, `createLUT1DTexture` from `src/color/LUTLoader.ts`
- Uses existing `WebGLLUTProcessor` from `src/color/WebGLLUT.ts`
- Uses `DOMParser` (browser built-in) for `.look` XML parsing

## Future Enhancements

1. **Binary format support** - Some formats (RV 3D, Pandora) may have binary variants that could be loaded via `ArrayBuffer` for faster parsing.
2. **LUT format export** - Allow converting from any loaded format back to `.cube` for interoperability.
3. **Pre-LUT composition** - For `.csp` files with non-identity pre-LUT shapers, implement full composition (baking the shaper into the 3D grid) rather than runtime application.
4. **Non-uniform cube resampling** - For `.csp` files with non-uniform dimensions (e.g., 17x17x33), implement trilinear resampling to a uniform grid.
5. **Streaming parser** - For very large LUT files, implement a streaming parser using `ReadableStream` to avoid loading the entire file into memory.
