# OpenRV Chapter 9: CDL (Color Decision List) -- Research Notes

## Source
- URL: https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-nine.md
- License: Apache 2.0

## Key Concepts to Reuse

### CDL Model (ASC CDL)
The ASC CDL (American Society of Cinematographers Color Decision List) defines a standard color correction model:

**SOP Formula:** `output = Clamp(input * slope + offset) ^ power`
- Slope: per-channel multiplier (R, G, B)
- Offset: per-channel additive value
- Power: per-channel gamma/power curve
- Applied per-channel independently

**Saturation:** Applied after SOP using luminance-based saturation matrix
- CDL luminance weights: Rw=0.2126, Gw=0.7152, Bw=0.0722 (Rec. 709 luminance coefficients)

### File Format Support
Three CDL file formats supported:
- **Color Decision List (.cdl)** - Full CDL file
- **Color Correction (.cc)** - Single color correction
- **Color Correction Collection (.ccc)** - Multiple corrections tagged by ID
  - Limitation: "We do not support reading the properties by id. Therefore the first Color Collection found in the file will be read and used."

### Pipeline Integration Points
Two integration points in the node graph:
1. **RVLinearize node** (in RVLinearizePipeline): CDL applied *before* linearization
2. **RVColor node** (in RVLookPipeline): CDL applied *after* linearization and linear color changes

### Assignment
"The Import menu under the File menu is used to assign CDL files to either the source's Look or File pipelines."

## Specific Content to Extract
- The SOP formula is universally applicable and should be preserved exactly
- The saturation post-SOP application order is important
- The Rec. 709 luminance weights (0.2126, 0.7152, 0.0722) for CDL saturation

## What Does NOT Apply to OpenRV Web
- File menu / Import menu UI (web has different UI)
- RVLinearize / RVLookPipeline node architecture (web uses single shader pipeline)
- .ccc file ID-based lookup (limitation preserved but may not apply)
- Pre-linearization CDL stage (web linearization is handled differently)

## Adaptation Notes
- The CDL SOP formula maps directly to GLSL shader operations: `pow(clamp(input * slope + offset, 0.0, 1.0), power)`
- The web renderer already has per-channel color correction controls that could implement CDL
- CDL file parsing (.cdl, .cc, .ccc) would need a JavaScript/TypeScript XML parser
- The saturation matrix with Rec. 709 weights is already used in the web renderer's saturation stage
- CDL could be exposed as import functionality + UI controls for slope/offset/power/saturation
- The two-stage CDL (pre-linearization vs post-linearization) is less relevant in the web version's single-pass shader
