# OpenRV Chapter 8: LUTs -- Research Notes

## Source
- URL: https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-eight.md
- License: Apache 2.0

## Key Concepts to Reuse

### LUT Types

**Channel LUTs (1D LUTs)**
- Three independent lookup tables for R, G, B channels
- Alpha channel unaffected
- Resolution up to 4,096 samples
- Maps input [0,1] to unbounded output
- Cannot modify channels interdependently (no cross-talk)
- Useful for gamma, log-to-linear without channel interaction

**3D LUTs**
- Output depends on all three input R, G, B channels (enables "channel cross-talk")
- Memory intensive: 64^3 requires 3MB; 128^3 causes slowdown
- Can use different resolutions per dimension
- Suited for general color transforms and film simulation
- Input [0,1] to unbounded output range

**Pre-LUT (Channel Pre-LUT)**
- Same implementation as channel LUT
- Always maps [0,1] input to [0,1] output
- Conditions data before 3D LUT transformation
- Example: converting linear to log space before 3D LUT input

### Pipeline Stages for LUT Application
1. **Pre-Cache LUT** - Immediately after file read, before caching (CPU-based, slower)
2. **File LUT** - Directly after cache (hardware)
3. **Look LUT** - Just before display transforms (per-source)
4. **Display LUT** - Single per-session display transform

First three are per-source; display LUT is session-wide.

### Supported LUT File Formats

| Format    | Type            | 1D | 3D | PreLUT | Float | Input Range | Output Range |
|-----------|-----------------|----|----|--------|-------|-------------|--------------|
| .csp      | RSR CinemaSpace | Y  | Y  | Y      | Y     | [-inf,inf]  | [-inf,inf]   |
| .rv3dlut  | RV 3D           |    | Y  |        | Y     | [0,1]       | [-inf,inf]   |
| .rvchlut  | RV Channel      | Y  |    |        | Y     | [0,1]       | [-inf,inf]   |
| .3dl      | Lustre          |    | Y  |        |       | [0,1]       | [0,1]        |
| .cube     | IRIDAS          |    | Y  |        | Y     | [0,1]       | [-inf,inf]   |
| (any)     | Shake           | Y  |    |        | Y     | [0,1]       | [-inf,inf]   |

Recommended: ".csp is currently the best LUT format for use with RV" (HDR support, alignment with internal functions).

### Interpolation Methods
- **Channel LUTs (1D):** Linear interpolation between sample values
- **3D LUTs:** Tri-linear interpolation between sample values

### Input Matrix and Pre-LUT Mechanics
- General 4x4 matrix preceding all LUT types
- Rescales HDR data to [0,1] range for LUT processing
- Pre-LUTs with only two values are linear and converted to matrix form
- Linear pre-LUTs: no clamping outside bounds
- Non-linear pre-LUTs: clamp values outside specified range

### Storage and Hardware Rendering
- Half-precision floating point or 16-bit integral internal storage
- Not all hardware can process floating-point 3D LUTs
- May need to force fixed-point via Rendering preferences to avoid banding
- GPU algorithms: floating-point texture processing or fixed-point 16-bit integer

### Important Caveats
- Many LUT files map directly from specific file formats to display output
- Using RV's color corrections with such LUTs "will not produce expected results"
- .csp limitation: Cannot process channel LUT with non-linear pre-LUT (rare case)

## What Does NOT Apply to OpenRV Web
- Pre-Cache LUT (CPU-based, involves disk caching system)
- .rv3dlut and .rvchlut proprietary RV formats (unlikely to be supported)
- .3dl Lustre format (limited use)
- Shake format support
- Fixed-point rendering preference toggle
- Multiple LUT pipeline stages (web likely has simplified pipeline)
- Import menu UI for LUT assignment

## Adaptation Notes
- WebGL2 supports 3D texture lookups (`texture(sampler3D, vec3)`) which can implement 3D LUTs
- 1D LUTs can be implemented as 1D textures or small 2D textures in WebGL2
- The .cube format is widely used and should be priority for web support
- .csp format is versatile and worth supporting
- Tri-linear interpolation is handled natively by GPU texture sampling with LINEAR filtering
- The input matrix concept (4x4 pre-transform) maps well to a uniform matrix in the shader
- LUT size constraints (64^3 recommended max) apply even more to WebGL2 due to texture memory limits
- The web renderer already has a fragment shader pipeline; LUT application would be an additional texture lookup stage
