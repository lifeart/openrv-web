# OpenRV Chapter 12: Stereo Viewing -- Research Notes

## Source
- URL: https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-twelve.md
- License: Apache 2.0

## Key Concepts to Reuse

### Stereo Display Modes
1. **Anaglyph** - Left eye in red channel, right eye in green+blue (cyan)
2. **Luminance Anaglyph** - Grayscale version, reduces color artifacts
3. **Side-by-Side** - Left and right eyes displayed horizontally, full color
4. **Mirrored Side-by-Side** - Right eye flopped; left can be flopped via Image > Flop
5. **DLP Checker** - Texas Instruments checkerboard 3D input for DLP projectors
6. **Scanline Interleaved** - For LCD displays like SpectronIQ HD
7. **Hardware Left and Right Buffers** - Native stereo when GPU supports it
8. **HDMI 1.4a modes** - Side-by-Side and Top-and-Bottom via Presentation Mode

### Stereo Operations
- **Swap Eyes** - Reverses left/right order when stereo appears inverted
- **Relative Eye Offset** - Horizontal separation as percentage of image width
  - Objects at fusion depth appear coincident with screen depth
- **Single-Eye Manipulation** - Flip/flop right eye independently via Image > Stereo menu

### Source Setup
- Left and right eye images "normalized (conformed to fit the RV window)"
- May have different resolutions and/or bit depths
- Matching aspect ratios recommended
- Stereo parameters settable from command line

### Technical Notes
- Caching stores both left and right eye layers
- Color corrections, geometry manipulations, and display corrections all function with stereo
- Compression artifacts amplify in anaglyph mode; luminance display mitigates

## What Does NOT Apply to OpenRV Web
- Hardware stereo buffers (WebGL2 does not expose quad-buffer stereo)
- DLP Checker mode (specialized hardware)
- Scanline Interleaved (specialized LCD hardware)
- HDMI 1.4a Presentation Mode
- Command-line stereo parameter setup
- GPU quad-buffer detection

## Adaptation Notes
- **Anaglyph** is implementable in WebGL2 via fragment shader channel manipulation
- **Side-by-Side** is implementable via viewport splitting
- **Luminance Anaglyph** is implementable via shader (convert to luminance then route to channels)
- Swap eyes and relative eye offset are simple to implement
- The web version likely has limited stereo use cases but anaglyph and side-by-side are feasible
- Top-and-Bottom mode could also work in the web via viewport splitting
- The concept of stereo as two separate image layers feeding into a display mode is architecturally clean for web
