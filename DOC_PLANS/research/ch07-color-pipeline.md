# OpenRV Chapter 7: Color Pipeline -- Research Notes

## Source
- URL: https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-seven.md
- License: Apache 2.0

## Key Concepts to Reuse

### Pipeline Stages (in order)
1. **Image Layers** - Multiple layers from files or single files (stereo left/right)
2. **Image Attributes** - Metadata reading (aspect ratio, alpha, ColorSpace/* attributes)
3. **Image Channels** - Channel mapping to RGBA, precision selection (8i, 16i, 16f, 32f)
4. **Crop and Uncrop** - Geometry adjustment (EXR data/display windows)
5. **Conversion to Linear Color Space** - Non-linear to linear transformation
6. **Color Correction** - Per-source adjustments (exposure, saturation, contrast, hue, CDL)
7. **Display Simulation and Correction** - Global display transforms (LUTs, gamma, sRGB, Rec.709, brightness)
8. **Final Display Filters** - Channel reordering, channel isolation, out-of-range display

### Formulas

**Relative Exposure:** `c * 2^exposure`

**Saturation Matrix (Rw=0.3086, Gw=0.6094, Bw=0.0820):**
```
| Rw(1-s)+s    Gw(1-s)      Bw(1-s)      0 |
| Rw(1-s)      Gw(1-s)+s    Bw(1-s)      0 |
| Rw(1-s)      Gw(1-s)      Bw(1-s)+s    0 |
| 0            0            0            1 |
```

**Contrast Matrix (k = contrast value):**
```
| 1+k   0     0    -k/2 |
| 0     1+k   0    -k/2 |
| 0     0     1+k  -k/2 |
| 0     0     0     1   |
```

**Inversion Matrix:**
```
| -1  0   0   0 |
|  0 -1   0   0 |
|  0  0  -1   0 |
|  1  1   1   1 |
```

**ASC-CDL:** `SOP = Clamp(Cin * slope + offset)^power`
- CDL luminance weights: Rw=0.2126, Gw=0.7152, Bw=0.0722

**sRGB to Linear:**
- If c_sRGB <= 0.04045: c_linear = c_sRGB / 12.92
- Else: c_linear = ((c_sRGB + 0.055) / 1.055)^2.4

**Linear to sRGB:**
- If c_linear <= 0.0031308: c_sRGB = 12.92 * c_linear
- Else: c_sRGB = 1.055 * c_linear^(1/2.4) - 0.055

**Rec. 709 to Linear:**
- If c_709 <= 0.081: c_linear = c_709 / 4.5
- Else: c_linear = ((c_709 + 0.099) / 1.099)^(1/0.45)

**Linear to Rec. 709:**
- If c_linear <= 0.018: c_709 = 4.5 * c_linear
- Else: c_709 = 1.099 * c_linear^0.45 - 0.099

**YUV to RGB:**
```
| 1     0        1.402    |
| 1    -0.344   -0.714    |
| 1     1.772    0        |
```

### Channel Mapping Defaults
| File Channels | Names      | RGBA Mapping |
|---------------|------------|--------------|
| 1             | Y          | YYY1         |
| 2             | Y, A       | YYYA         |
| 3             | R, G, B    | RGB1         |
| 4             | R, G, B, A | RGBA         |

### Node and Property Names
- `color.maxBitDepth`, `color.allowFloatingPoint`
- `format.channels` - channel remapping
- `display.channelOrder` - channel reordering
- `display.channelFlood` - channel isolation
- ColorSpace attributes: `ColorSpace/Primary`, `ColorSpace/Transfer`, `ColorSpace/Gamma`, `ColorSpace/Primaries`, `ColorSpace/Conversion`, `ColorSpace/ConversionMatrix`
- `ColorSpace/Black Point`, `ColorSpace/White Point`, `ColorSpace/Rolloff` (Kodak log)
- `ColorSpace/Red Primary`, `ColorSpace/Green Primary`, `ColorSpace/Blue Primary`, `ColorSpace/White Primary`
- LogC params: `ColorSpace/LogCBlackSignal`, `ColorSpace/LogCEncodingOffset`, `ColorSpace/LogCEncodingGain`, `ColorSpace/LogCGraySignal`, `ColorSpace/LogCBlackOffset`, `ColorSpace/LogCLinearSlope`, `ColorSpace/LogCLinearOffset`, `ColorSpace/LogCCutPoint`
- ICC: `ColorSpace/ICC Profile Name`, `ColorSpace/ICC Profile Data`

### Color Spaces Referenced
- sRGB, Rec. 709, CIE XYZ, NTSC
- Kodak Cineon (logarithmic), DPX (10-bit log)
- ARRI LogC parameters

### Linearization Sub-stages (Section 7.5)
1. Non-Rec.709 primaries conversion (matrix via CIE XYZ, chromatic adaptation)
2. YRyBy conversion (hardware, planar to RGBA)
3. YUV/YCbCr conversion (hardware, matrix)
4. Log to Linear (Cineon/DPX, Kodak params, Viper FilmStream)
5. File Gamma correction (c^gamma)
6. sRGB to Linear
7. Rec.709 to Linear
8. Pre-Cache LUT (software, before cache)
9. File CDL (pre-linearization)

### Color Correction Sub-stages (Section 7.6)
1. Luminance LUTs (HSV, Random, Contour)
2. Relative Exposure
3. Hue Rotation (luminance-preserving, 2pi = no change)
4. Relative Saturation
5. Contrast
6. Inversion
7. ASC-CDL (Slope, Offset, Power per-channel, then Saturation)

### Display Sub-stages (Section 7.7)
1. Look LUT (per-source, hardware)
2. Display LUT (session-wide, hardware)
3. Display Gamma
4. sRGB Display Correction
5. Rec.709 Display Correction
6. Display Brightness (final luminance multiplier)

## What Does NOT Apply to OpenRV Web
- Pre-Cache LUT stage (software CPU-based, involves disk caching)
- ChannelMap node as separate software stage (web version handles this differently)
- ICC Profile support (browser handles ICC differently)
- Kodak Cineon/DPX log-to-linear with full parameter set (web may have simplified version)
- Viper FilmStream variant
- YRyBy planar conversion (OpenEXR-specific hardware path)
- Pixel aspect ratio handling (web displays are square-pixel)
- Clean Aperture (QuickTime concept)
- Multiple display devices / presentation mode
- LogC full parameterized decode (unless web supports ARRI footage)

## Adaptation Notes
- The fragment shader pipeline in `Renderer.ts` maps closely to stages 5-7: input EOTF -> exposure -> temp/tint -> brightness -> contrast -> saturation -> hue -> tone mapping -> gamma -> inversion -> output mode
- Web version adds temp/tint (color temperature) and tone mapping stages not in original RV
- Web version uses `u_inputTransfer` uniform (0=sRGB, 1=HLG, 2=PQ) for HDR transfer functions -- this replaces several linearization sub-stages
- Saturation matrix formula is directly reusable
- Contrast and exposure formulas are directly reusable
- Channel mapping defaults are reusable
- sRGB/Rec.709 transfer function formulas are directly reusable in shaders
- The web version collapses the pipeline into a single WebGL2 fragment shader rather than separate node stages
