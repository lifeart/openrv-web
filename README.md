# OpenRV Web

[![Deploy to GitHub Pages](https://github.com/lifeart/openrv-web/actions/workflows/deploy.yml/badge.svg)](https://github.com/lifeart/openrv-web/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Live Demo](https://lifeart.github.io/openrv-web)**

A professional web-based image and video review tool inspired by [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV). Built for VFX, animation, and post-production workflows, OpenRV Web provides frame-accurate playback, comprehensive color management, annotation tools, collaborative review sessions, and RV session file compatibility -- all running entirely in the browser with no server-side processing.

---

## Features

### Format Support

**Images**
- PNG, JPEG, WebP, GIF, BMP, AVIF, HEIC/HEIF -- via browser-native decoding
- **EXR** (.exr/.sxr) -- WebAssembly decoder with Float32 HDR precision
  - Multi-layer EXR with AOV selection and channel remapping
  - PIZ wavelet compression (Huffman + Haar + LUT)
  - DWA compression support
  - Multi-view EXR for stereo workflows
  - Data window / display window visualization overlay
- **DPX** -- Digital Picture Exchange format with log-to-linear conversion
- **Cineon** -- Kodak Cineon format with configurable film gamma
- **Radiance HDR** (.hdr/.pic) -- RGBE encoding with adaptive RLE decompression
- **Float TIFF** -- 32-bit floating-point TIFF images
- **JPEG XL** (.jxl) -- modern HDR-capable format via WASM decoder and browser-native HDR path
- **JPEG 2000 / HTJ2K** (.jp2/.j2k/.j2c/.jph/.jhc) -- via openjph-based WASM module
- **JPEG Gainmap HDR** -- MPF parsing, XMP headroom extraction, sRGB-to-linear + gain reconstruction
- **HEIC Gainmap HDR** -- Apple gainmap format and ISO 21496-1 standard; ISOBMFF parsing with WASM fallback for non-Safari browsers
- **AVIF Gainmap HDR** -- auxiliary gain map items per ISO 21496-1
- **RAW Preview** -- embedded preview extraction from camera RAW files

**Video**
- Mediabunny WebCodecs containers: MP4/M4V/3GP/3G2, MOV/QuickTime, MKV/WebM, OGG/OGV/OGX
- AVI browser fallback
- **MXF Demuxer** -- Material eXchange Format container parsing (identifies codec, resolution, frame rate)
- ProRes/DNxHD codec detection with FFmpeg transcoding guidance
- HDR video support with VideoFrame texturing (HLG, PQ transfer functions)

**Sequences and Sessions**
- Image sequences with numbered files (e.g., `frame_001.png`, `file.0001.exr`)
  - Pattern notation: `%04d` (printf), `####` (hash), `@` notation
  - Single-file sequence inference and directory scanning
  - Missing frame detection with visual overlay
- RV/GTO session files with full graph reconstruction
- **RV EDL** -- OpenRV edit decision list format parsing
- **OTIO (OpenTimelineIO)** -- import editorial timelines with clips, gaps, and transitions

### Color Management

**Primary Color Controls**
- Exposure, gamma, saturation, contrast, brightness
- Color temperature and tint
- Hue rotation
- Vibrance with skin tone protection (hue 20-50 degrees protected)
- Clarity / local contrast enhancement
- Highlight and shadow recovery
- Whites and blacks clipping adjustment
- Color inversion

**Three-Way Color Correction**
- Lift / Gamma / Gain color wheels with master wheel
- 120px wheels with color preview ring, undo/redo, and linked gang adjustments

**HSL Qualifier**
- Secondary color correction via hue/saturation/luminance selection
- Matte preview, invert selection, and eyedropper color picking

**CDL (Color Decision List)**
- ASC CDL support (slope, offset, power, saturation) with .cdl file import

**LUT Support**
- 3D LUT and 1D LUT loading (.cube, .csp, .3dl, and other formats)
- Single-pass float LUT pipeline in the fragment shader (no 8-bit bottleneck)
- Tetrahedral interpolation for 3D LUTs
- LUT pipeline with pre-cache stage and GPU chain
- Film emulation presets (10 built-in looks: Warm Film, Cool Chrome, Bleach Bypass, Cross Process, Monochrome, Cinematic Teal & Orange, Vintage Fade, High Contrast, Low Contrast)

**Color Curves**
- Master / R / G / B channel curves with presets and import/export

**Log Curve Presets**
- Camera-specific log-to-linear conversion: Cineon Film Log, ARRI LogC3/LogC4, Sony S-Log3, RED Log3G10
- GLSL shader generation for GPU processing

**OCIO Color Management**
- OpenColorIO-style color pipeline with built-in presets (ACES 1.2, sRGB)
- Custom .ocio config file loading with drag-and-drop and validation
- Input color space auto-detection from metadata
- Working, display, and view transform selection
- Look transforms with forward/inverse direction
- Reverse transforms for bidirectional camera space conversions
- WASM-based OCIO processing with shader translation

**Tone Mapping**
- Reinhard operator with adjustable white point
- Filmic operator with configurable exposure bias and white point
- ACES filmic tone mapping
- Per-operator parameter sliders with real-time preview

**Display Color Management**
- Transfer functions: Linear, sRGB, Rec.709, Gamma 2.2, Gamma 2.4, Custom Gamma
- Display gamma and brightness adjustments
- GPU-accelerated via fragment shader
- LocalStorage persistence for profile settings

**HDR and Wide Color Gamut**
- Display P3 automatic wide gamut output on supported displays
- HLG and PQ output modes for HDR displays (experimental)
- Display capabilities detection (P3, HDR, WebGPU)
- User gamut preference (force sRGB or Display P3)
- Gamut mapping control (clip, soft compress) with source/target gamut selection
- HDR-aware scopes extending beyond 1.0
- Canvas2D HDR fallback path (srgb-linear, rec2100-hlg, float16)

**Additional Color Tools**
- ICC profile support
- Auto exposure controller
- Scene analysis
- Temporal smoother for color adjustments
- Color space conversion utilities

### Rendering

- **WebGL2** GPU-accelerated renderer with full fragment shader pipeline
  - Input EOTF, exposure, temperature/tint, brightness, contrast, saturation, hue, tone mapping, gamma, inversion, output mode
  - Shader state management and texture cache (LRU)
  - Tiled rendering for large images
  - Mipmap generation for static textures
- **WebGPU Backend** (experimental) -- rgba16float, extended tone mapping
- **WebGPU HDR Blit** -- direct HDR output via WebGPU
- **Canvas2D HDR Blit** -- fallback HDR display when WebGL2 native HDR and WebGPU are unavailable
- **Spherical / 360-degree Projection** -- equirectangular panorama viewing with interactive yaw/pitch and FOV zoom
- **Render Worker** -- off-main-thread rendering via OffscreenCanvas
- **Luminance Analyzer** -- scene luminance analysis
- **Adaptive Proxy Rendering** -- DPI-aware canvas, interaction quality tiering, GL mipmaps, cache-level resize
- **Premultiply / Unpremultiply** alpha control

### Scopes and Analysis

- **Histogram** -- RGB, luminance, and separate channel modes with log scale
  - Clipping indicators showing percentage of clipped highlights/shadows
  - Clipping overlay (red for highlights, blue for shadows)
- **Waveform Monitor** -- luma, RGB, parade, and YCbCr modes (BT.709 coefficients)
- **Vectorscope** -- with zoom levels
- **Pixel Probe / Color Sampler** -- click to sample RGB/HSL/IRE values
  - Area averaging (1x1, 3x3, 5x5, 9x9), source vs rendered toggle
  - Alpha channel display, HDR out-of-range indicators, nits readout, color space info
  - Float precision toggle (3 or 6 decimal places)
- **False Color** -- exposure visualization with ARRI, RED, and custom presets
- **Zebra Stripes** -- animated diagonal stripes for high (>95% IRE) and low (<5% IRE) exposure warnings
- **Luminance Visualization** -- luminance heatmap display
- **Gamut Diagram** -- CIE 1931 chromaticity diagram
- All scopes are WebGL-accelerated

### Playback and Audio

- Frame-accurate timeline with scrubbing
- **Timeline Thumbnails** -- LRU-cached preview thumbnails with progressive loading
- In/out points and markers with notes (color-coded, with text annotations)
  - Duration markers spanning frame ranges
- Loop modes: once, loop, ping-pong
- Playback speed control (0.1x to 8x) with J/K/L shuttle shortcuts
  - Audio pitch correction at non-1x speeds
- Sub-frame interpolation (alpha blending between frames for smooth slow motion)
- Smooth zoom animation with ease-out cubic easing
- Cache indicator showing cached frames and memory usage
- **Prerender Buffer** -- double-buffered cache for glitch-free effect parameter changes
  - SIMD-like TypedArray optimizations, half-resolution convolution, async chunked processing
- **Multi-Clip Playlist** -- manage and play multiple clips in sequence
  - Drag-and-drop reordering, loop modes, in/out points
  - EDL (CMX3600) export and OTIO import
  - Web Worker parallel effect processing with smart LRU cache
- **Audio Playback** -- Web Audio API with HTMLVideoElement and Mediabunny fallbacks
  - Audio sync with drift correction, graceful autoplay handling
  - Automatic muting during reverse playback
- Audio waveform display with multi-channel support
- Volume control with mute (volume preserved across mute/unmute cycles)
- Page visibility handling (auto-pause when tab is hidden)

### Comparison and Composition

- **Wipe Comparison** -- horizontal/vertical split view with interactive drag
- **Split Screen** -- side-by-side A/B comparison with draggable divider
- **Difference Matte** -- pixel differences between A/B with gain and heatmap modes
- **Blend Modes** for A/B comparison: onion skin, flicker (1-30 Hz), blend ratio
- **Quad View** -- A/B/C/D four-up comparison mode
- Multi-layer stack with blend modes and per-layer opacity/visibility
- A/B source switching with auto-assignment when loading multiple files
- Quick toggle between sources with backtick key
- **Reference Image Manager** -- capture and compare against a stored snapshot
  - View modes: split-h, split-v, overlay, side-by-side, toggle
- **Matte Overlay** -- letterbox/pillarbox with configurable aspect ratio and opacity

### Stereo 3D Viewing

- Side-by-side and over/under stereo modes
- Mirror mode (side-by-side with flipped right eye)
- Anaglyph mode (red/cyan) and luminance anaglyph (reduced color fringing)
- Checkerboard mode (for DLP projectors with shutter glasses)
- Scanline interleaved mode (for line-blanking displays)
- Eye swap control and convergence offset adjustment
- **Stereo Eye Transform** -- per-eye geometric transforms
- **Stereo Alignment Overlay** -- alignment aids for stereo setup
- **Convergence Measurement** -- measure convergence between eyes
- **Floating Window Detection** -- detect floating window violations
- **Per-Eye Annotations** -- separate annotations for left and right eyes

### Annotations

- **Pen Tool** with pressure sensitivity and brush types (soft/hard)
- **Text Annotations** with formatting (bold, italic, underline, background color, callouts)
- **Shape Tools** -- rectangle, ellipse, line, arrow, and polygon with fill/stroke options
- **Spotlight Tool** -- dim everything except highlighted region (circle or rectangle)
- Eraser tool
- Ghost mode (show nearby frame annotations)
- Hold mode (persist annotations across frames)
- Per-frame annotation storage
- **Ghost Frames / Onion Skin** -- semi-transparent previous/next frames for animation review
  - Configurable range (0-5 frames before/after), opacity falloff, optional color tinting
- **Comparison Annotations** -- annotate during A/B compare
- **WebGL Paint Renderer** -- GPU-accelerated annotation rendering

### Filters and Effects

- **Noise Reduction** -- edge-preserving bilateral filter (GPU-accelerated with CPU fallback)
- **Sharpen** -- WebGL-accelerated unsharp mask
- **Deinterlace** -- bob, weave, and blend methods with field order selection
- **Film Emulation** -- classic film stock emulation with grain overlay
  - Kodak Portra 400, Kodak Ektar 100, Fuji Pro 400H, Fuji Velvia 50, Kodak Tri-X 400, Ilford HP5+
  - Luminance-dependent grain with per-frame animation
- **Motion Stabilization** -- preview 2D stabilization with block-matching, EMA smoothing, and border cropping
- **Effect Registry** -- extensible effect system with category-based lookup and registration-order pipeline

### Transform

- Rotation (90/180/270 degrees) and flip (horizontal/vertical)
- Crop with aspect ratio presets and rule-of-thirds guides
- **Uncrop / Canvas Extension** -- add padding with uniform or per-side controls and custom fill color
- **Pixel Aspect Ratio (PAR)** -- auto-detection from metadata with presets for DV NTSC, DV PAL, HD Anamorphic, 2:1 Anamorphic
- **Lens Distortion Correction** -- barrel/pincushion
- **Perspective Correction** -- four-point perspective transform with grid overlay

### Export

- **Frame Export** -- PNG, JPEG, WebP with single-frame or sequence export with progress
- **Copy to Clipboard** -- copy current frame to system clipboard
- **Video Export** -- WebCodecs-based encoding to H.264 (Baseline/Main/High), VP9, and AV1
  - Configurable bitrate, GOP size, hardware acceleration preference
  - MP4 muxer (ISO BMFF) for single-track video output
- **Slate / Leader Frames** -- production metadata overlay (show, shot, version, artist, date, timecode, resolution)
  - Studio logo placement, custom fields, configurable typography and colors
  - Slate editor UI with live preview
- **Frameburn Compositor** -- burn-in timecode, frame number, shot name, date, resolution, FPS, color space, codec, and custom text
- **EDL Writer** -- CMX3600-format edit decision lists with drop-frame timecode support
- **OTIO Support** -- OpenTimelineIO import with conform/re-link panel
- **Dailies Report Exporter** -- CSV and HTML reports with shot status, notes, version info, frame ranges, and timecodes
- **Annotation Export** -- JSON round-trip (export/import with merge and frame offset) and PDF printable reports
- Session save/load (.orvproject format)

### Overlays and Guides

- **Timecode Overlay** -- on-screen SMPTE timecode display (HH:MM:SS:FF)
- **Safe Areas** -- title safe, action safe zones, rule of thirds, center crosshair, aspect ratio overlays
- **Clipping Overlay** -- visual overlay showing blown-out highlights and crushed shadows
- **False Color Overlay** -- exposure heatmap
- **Zebra Stripes** -- animated exposure warning stripes
- **Spotlight Overlay** -- focus attention on a region by dimming the rest
- **Missing Frame Overlay** -- visual indicator for gaps in image sequences
- **EXR Window Overlay** -- data window and display window boundary visualization
- **Matte Overlay** -- letterbox/pillarbox with configurable aspect ratio
- **Bug Overlay** -- small corner logo/branding image (configurable position, size, opacity)
- **Watermark Overlay** -- logos/watermarks with 9 preset positions, adjustable scale, opacity, and margin
- **Perspective Grid Overlay** -- vanishing point grid for perspective reference
- **Note Overlay** -- color-coded timeline bars for review notes (open, resolved, wontfix)

### Review Workflow

- **Shot Status Tracking** -- per-source status (pending, approved, needs-work, CBB, omit) with color-coded badges
- **Version Management** -- group multiple versions of the same shot with version navigation and annotation carry-forward
- **Note System** -- per-source, per-frame-range threaded notes with status filtering (all/open/resolved), inline editing, and replies
- **Dailies Reports** -- CSV/HTML export of review session with status, notes, timecodes, and version info
- **Client Mode** -- locked UI for review presentations (playback and navigation only, editing blocked)
  - URL parameter locking for secure viewer-only links
- **Conform / Re-link Panel** -- re-link unresolved media from OTIO/EDL imports with fuzzy filename matching

### Network and Collaboration

- **WebSocket-based Sync** -- real-time collaboration between multiple viewers
  - Room creation and joining with unique room codes
  - User presence indicators
  - Configurable sync: playback, view (pan/zoom), color adjustments, annotations, cursor position
  - Host/participant role distinction
  - Reconnection with exponential backoff
- **WebRTC Peer Connections** -- NAT traversal via public STUN/TURN servers (Google, Cloudflare, OpenRelay)
  - URL-based signaling for serverless P2P connections
- **PIN-based Encryption** -- encrypted message payloads for secure review sessions
- **Media Transfer** -- request/offer/chunk-based media sharing between peers
- Configurable signaling servers via `VITE_NETWORK_SIGNALING_SERVERS`

### Integrations

- **DCC Bridge** -- WebSocket-based integration with Nuke, Maya, Houdini, and other DCC tools
  - JSON message protocol with auto-reconnect and heartbeat
  - Inbound commands: loadMedia, syncFrame, syncColor
  - Outbound events: frameChanged, colorChanged, annotationAdded
- **ShotGrid (ShotGun) Integration** -- REST API bridge
  - Authentication, version loading, note push, and status sync
  - Bidirectional status mapping between OpenRV Web and ShotGrid

### Scripting API

- **Public JavaScript API** (`window.openrv`) for programmatic control
  - Playback: `play()`, `pause()`, `toggle()`, `stop()`, `seek(frame)`, `step()`, `setSpeed()`, `isPlaying()`, `getCurrentFrame()`
  - Media: `getCurrentSource()`, `getDuration()`, `getFPS()`, `getResolution()`
  - Audio: `setVolume()`, `getVolume()`, `mute()`, `unmute()`, `isMuted()`
  - Loop: `setMode()`, `getMode()`, `setInPoint()`, `setOutPoint()`, `clearInOut()`
  - View: `setZoom()`, `getZoom()`, `fitToWindow()`, `setPan()`, `setChannel()`
  - Color: `setAdjustments()`, `getAdjustments()`, `reset()`, `setCDL()`, `loadLUT()`
  - Markers: `add()`, `remove()`, `getAll()`, `clear()`, `goToNext()`, `goToPrevious()`
  - Events: `on()`, `off()`, `once()` for frameChange, play, pause, sourceLoaded, error, etc.
  - Version and readiness: `openrv.version`, `openrv.isReady()`

### UI and UX

- **Dark/Light Theme** with auto (system) mode
- **Fullscreen Mode** via F11 or toolbar button
- **Presentation Mode** -- clean display with all UI hidden and cursor auto-hide on inactivity
- **External Presentation** -- secondary browser window via BroadcastChannel with synced frame/playback/color
- **Background Pattern Selector** -- checkerboard, grey 18%/50%, white, black, crosshatch, custom color
- **History Panel** -- visual undo/redo with jump to any state
- **Floating Info Panel** -- filename, resolution, frame, FPS, cursor color readout
- **Hi-DPI / Retina Support** -- crisp rendering on 2x, 3x, and fractional DPR displays
- **Session Snapshots** -- named version history with preview and restore (IndexedDB persistence)
- **Auto-Save** -- configurable interval with crash recovery, storage quota monitoring, and visual indicator
- **Session Recovery** -- detects invalid blob URLs after browser restart with file re-selection prompts
- **Shortcut Editor** -- view and customize keyboard shortcuts with conflict detection and export/import
- **Shortcut Cheat Sheet** -- quick-reference keyboard shortcut overlay
- **Accessibility** -- ARIA announcer for screen reader support

---

## Installation

```bash
# Clone the repository
git clone https://github.com/lifeart/openrv-web.git
cd openrv-web

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Usage

### Opening Media
- Drag and drop files onto the viewer
- Click the folder icon to open file picker
- Load RV session files (.rv) directly
- Load multiple files for A/B comparison (second file auto-assigns as source B)

### Keyboard Shortcuts

#### Playback
| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `Left/Right` | Step frame backward/forward |
| `Up` | Toggle play direction |
| `Home/End` | Go to start/end |
| `I` or `[` | Set in point |
| `O` or `]` | Set out point |
| `R` | Reset in/out points |
| `M` | Toggle mark at current frame |
| `L` | Cycle loop mode (once/loop/ping-pong) |
| `J` | Decrease playback speed |
| `K` | Pause playback |
| `L` | Increase playback speed |

#### View and Navigation
| Key | Action |
|-----|--------|
| `F` | Fit to window |
| `=` / `-` | Zoom in/out |
| `Shift+=` / `Shift+-` | Fine zoom in/out |
| `1-5` | Switch tabs (View, Color, Effects, Transform, Annotate) |
| `0` | Set zoom to 50% |
| `F11` | Toggle fullscreen mode |
| `Ctrl+Shift+P` | Toggle presentation mode (clean display, cursor auto-hide) |
| `Shift+B` | Cycle background pattern (checker, grey, white, etc.) |
| `Shift+Alt+B` | Toggle checkerboard background |
| `Shift+P` | Toggle pixel aspect ratio correction |

#### A/B Compare
| Key | Action |
|-----|--------|
| `` ` `` (backtick) | Toggle between A/B sources |
| `~` (tilde) | Toggle between A/B sources |
| `Shift+D` | Toggle difference matte |
| `Shift+Alt+S` | Toggle split screen A/B comparison |

#### Scopes and Wipe
| Key | Action |
|-----|--------|
| `Shift+W` | Cycle wipe modes (off/horizontal/vertical) |
| `w` | Toggle waveform monitor |
| `h` | Toggle histogram |
| `y` | Toggle vectorscope |

#### Exposure and Analysis
| Key | Action |
|-----|--------|
| `Shift+I` | Toggle pixel probe |
| `Shift+Alt+F` | Toggle false color display |
| `Shift+Alt+Z` | Toggle zebra stripes |
| `;` | Toggle safe areas overlay |
| `Shift+Alt+T` | Toggle timecode overlay |
| `Shift+Alt+W` | Toggle color wheels panel |

#### Stereo 3D
| Key | Action |
|-----|--------|
| `Shift+3` | Cycle stereo modes (off/side-by-side/over-under/mirror/anaglyph/etc.) |

#### Channel View
| Key | Action |
|-----|--------|
| `Shift+R` | Red channel |
| `Shift+G` | Green channel |
| `Shift+B` | Blue channel |
| `Shift+A` | Alpha channel |
| `Shift+L` | Luminance/Grayscale |
| `Shift+Y` | Grayscale (alias for Shift+L) |
| `Shift+N` | Normal (RGB) |

#### Color and Effects
| Key | Action |
|-----|--------|
| `C` | Toggle color panel |
| `U` | Toggle curves panel |
| `Shift+O` | Toggle OCIO color management panel |
| `Shift+Alt+J` | Toggle tone mapping |
| `Shift+D` | Cycle display color profile |
| `Shift+Alt+E` | Toggle effects/filter panel |
| `Shift+K` | Toggle crop mode |
| `Shift+H` | Toggle HSL Qualifier |

#### Transform
| Key | Action |
|-----|--------|
| `Shift+R` | Rotate left 90 degrees |
| `Alt+R` | Rotate right 90 degrees |
| `Alt+H` | Flip horizontal |
| `Shift+V` | Flip vertical |

#### Annotations
| Key | Action |
|-----|--------|
| `V` | Pan tool |
| `P` | Pen tool |
| `E` | Eraser tool |
| `T` | Text tool |
| `R` | Rectangle tool |
| `O` | Ellipse tool |
| `L` | Line tool |
| `A` | Arrow tool |
| `B` | Toggle brush type (soft/hard) |
| `G` | Toggle ghost mode |
| `Shift+G` | Toggle ghost frames (onion skin) |
| `X` | Toggle hold mode (persist annotations across frames) |
| `Shift+Q` | Toggle spotlight |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `,` / `.` | Jump to prev/next annotation |

#### UI Panels
| Key | Action |
|-----|--------|
| `Shift+T` | Cycle theme (auto/dark/light) |
| `Shift+Alt+H` | Toggle history panel |
| `Shift+Alt+I` | Toggle info panel |
| `Shift+Alt+M` | Toggle markers panel |
| `Shift+N` | Toggle network sync panel |
| `Ctrl+Shift+S` | Create quick snapshot |
| `Ctrl+Shift+Alt+S` | Toggle snapshots panel |
| `Shift+Alt+P` | Toggle playlist panel |

#### Export
| Key | Action |
|-----|--------|
| `Ctrl+S` | Export frame |
| `Ctrl+C` | Copy frame to clipboard |

### Mouse Controls
- **Scroll**: Zoom in/out
- **Drag**: Pan image
- **Click timeline**: Seek to frame
- **Drag timeline**: Scrub

---

## Architecture

```
src/
├── api/                # Public scripting API (window.openrv)
├── core/
│   ├── graph/          # Node graph system (Graph, Property, Signal)
│   ├── image/          # IPImage data structure (with PAR metadata)
│   └── session/        # Session management, GTO loading, serialization, auto-save
│       ├── SnapshotManager.ts   # IndexedDB-based session snapshots
│       ├── PlaylistManager.ts   # Multi-clip playlist with EDL export & OTIO import
│       ├── StatusManager.ts     # Per-source shot status tracking
│       ├── VersionManager.ts    # Shot versioning and navigation
│       └── NoteManager.ts       # Threaded review notes
├── formats/
│   ├── EXRDecoder.ts            # WebAssembly EXR decoder with multi-layer support
│   ├── EXRPIZCodec.ts           # PIZ wavelet compression codec
│   ├── EXRDWACodec.ts           # DWA compression codec
│   ├── DPXDecoder.ts            # DPX format decoder
│   ├── CineonDecoder.ts         # Cineon format decoder
│   ├── HDRDecoder.ts            # Radiance HDR decoder with RLE support
│   ├── TIFFFloatDecoder.ts      # Float TIFF decoder
│   ├── JXLDecoder.ts            # JPEG XL decoder (WASM + browser-native HDR)
│   ├── JP2Decoder.ts            # JPEG 2000 / HTJ2K decoder
│   ├── JPEGGainmapDecoder.ts    # JPEG HDR gainmap decoder
│   ├── HEICGainmapDecoder.ts    # HEIC HDR gainmap decoder
│   ├── AVIFGainmapDecoder.ts    # AVIF HDR gainmap decoder
│   ├── RAWPreviewDecoder.ts     # RAW preview extraction
│   ├── MXFDemuxer.ts            # MXF container demuxer
│   ├── RVEDLParser.ts           # RV EDL format parser
│   └── MultiViewEXR.ts          # Multi-view EXR support
├── nodes/
│   ├── base/           # IPNode, NodeFactory with @RegisterNode decorator
│   ├── sources/        # FileSourceNode, VideoSourceNode, SequenceSourceNode
│   └── groups/         # SequenceGroup, StackGroup, SwitchGroup, LayoutGroup, FolderGroup
├── render/
│   ├── Renderer.ts              # WebGL2 renderer and shader pipeline
│   ├── RendererBackend.ts       # Renderer abstraction (WebGL2/WebGPU)
│   ├── WebGPUBackend.ts         # WebGPU HDR renderer
│   ├── WebGPUHDRBlit.ts         # WebGPU HDR output
│   ├── Canvas2DHDRBlit.ts       # Canvas 2D API HDR fallback
│   ├── SphericalProjection.ts   # 360-degree panorama projection
│   ├── TextureCacheManager.ts   # LRU texture cache
│   ├── RenderWorkerProxy.ts     # Off-main-thread rendering
│   └── LuminanceAnalyzer.ts     # Scene luminance analysis
├── color/
│   ├── CDL.ts                   # ASC CDL processing
│   ├── ColorCurves.ts           # Color curves
│   ├── HueRotation.ts           # Hue rotation
│   ├── LogCurves.ts             # Camera log curve presets
│   ├── LUTLoader.ts             # 3D/1D LUT loading
│   ├── LUTPresets.ts            # Film emulation preset library
│   ├── LUTFormats.ts            # Multi-format LUT parsing
│   ├── TetrahedralInterp.ts     # Tetrahedral interpolation for 3D LUTs
│   ├── WebGLLUT.ts              # GPU LUT application
│   ├── DisplayCapabilities.ts   # HDR/P3/WebGPU detection
│   ├── DisplayTransfer.ts       # Display transfer functions
│   ├── TransferFunctions.ts     # PQ, HLG, sRGB transfer functions
│   ├── HDRPixelData.ts          # HDR-aware pixel value access
│   ├── ICCProfile.ts            # ICC profile support
│   ├── AutoExposureController.ts # Auto exposure
│   ├── SceneAnalysis.ts         # Scene analysis
│   ├── TemporalSmoother.ts      # Temporal smoothing
│   ├── Inversion.ts             # Color inversion
│   ├── OCIO*.ts                 # OCIO config, transforms, processor, presets
│   ├── pipeline/                # LUT pipeline, stages, GPU chain
│   └── wasm/                    # OCIO WASM bridge, shader translator, virtual FS
├── scopes/
│   └── WebGLScopes.ts           # GPU-accelerated waveform, vectorscope, histogram, parade
├── stereo/
│   ├── StereoRenderer.ts        # Stereo display modes
│   ├── StereoEyeTransform.ts    # Per-eye transforms
│   ├── StereoAlignOverlay.ts    # Stereo alignment aids
│   ├── ConvergenceMeasure.ts    # Convergence measurement
│   └── FloatingWindowDetector.ts # Floating window detection
├── paint/
│   ├── PaintEngine.ts           # Freehand drawing engine
│   ├── PaintRenderer.ts         # WebGL annotation rendering
│   └── AdvancedPaintTools.ts    # Shapes, text, arrows, spotlight
├── filters/
│   ├── NoiseReduction.ts        # Bilateral filter (CPU)
│   ├── WebGLNoiseReduction.ts   # Bilateral filter (GPU)
│   ├── WebGLSharpen.ts          # GPU sharpen
│   ├── Deinterlace.ts           # Deinterlacing
│   ├── FilmEmulation.ts         # Film stock emulation with grain
│   └── StabilizeMotion.ts       # 2D motion stabilization
├── effects/
│   ├── EffectRegistry.ts        # Central effect registry
│   ├── ImageEffect.ts           # Effect interface
│   └── adapters/                # Effect adapters (CDL, inversion, hue, tone mapping, etc.)
├── export/
│   ├── VideoExporter.ts         # WebCodecs video encoder
│   ├── MP4Muxer.ts              # ISO BMFF MP4 muxer
│   ├── EDLWriter.ts             # CMX3600 EDL writer
│   ├── SlateRenderer.ts         # Slate/leader frame generator
│   └── ReportExporter.ts        # Dailies report exporter (CSV/HTML)
├── network/
│   ├── WebSocketClient.ts       # WebSocket sync client
│   ├── WebRTCURLSignaling.ts    # URL-based WebRTC signaling
│   ├── NetworkSyncManager.ts    # Sync orchestrator
│   ├── SyncStateManager.ts      # Sync state tracking
│   ├── PinEncryption.ts         # PIN-based message encryption
│   └── MessageProtocol.ts       # Typed message protocol
├── integrations/
│   ├── DCCBridge.ts             # Maya/Nuke/Houdini WebSocket bridge
│   └── ShotGridBridge.ts        # ShotGrid REST API integration
├── transform/
│   ├── LensDistortion.ts        # Barrel/pincushion correction
│   └── PerspectiveCorrection.ts # Four-point perspective transform
├── composite/                   # Blend modes
├── audio/
│   ├── AudioPlaybackManager.ts  # Web Audio API with fallbacks
│   └── WaveformRenderer.ts      # Waveform extraction and rendering
├── ui/
│   ├── components/              # All UI panels, controls, overlays, and editors
│   └── shared/                  # Button, Modal, Panel utilities
├── utils/                       # EventEmitter, FrameExporter, SequenceLoader, HiDPICanvas, etc.
├── workers/
│   └── effectProcessor.worker.ts # Background effect processing
└── config/                      # Image size limits, playback, render, timing, UI config
```

### Node Graph

The application uses a directed acyclic graph (DAG) for media processing:

```
[Source Nodes] -> [Group Nodes] -> [Effect Nodes] -> [Output]
     |                |               |
FileSource      SequenceGroup     CDL, Tone Mapping
VideoSource     StackGroup        Hue Rotation, etc.
SequenceSource  SwitchGroup
                LayoutGroup
                FolderGroup
```

Nodes are registered via decorators:
```typescript
@RegisterNode('RVFileSource')
export class FileSourceNode extends BaseSourceNode { ... }
```

### GTO/RV Session Loading

RV session files are parsed using `gto-js` and reconstructed into the node graph, restoring key session settings such as playback ranges, channel selection, scopes, and paint effects. Exporting `.rv`/`.gto` sessions currently preserves playback and annotation data (not the full media graph), and re-exports loaded sessions with UI changes applied.

```typescript
// Session loads GTO and builds graph
await session.loadFromGTO(fileData);

// Access the reconstructed graph
const graph = session.graph;
const rootNode = session.graphParseResult?.rootNode;
```

---

## Development

```bash
# Type check
pnpm typecheck

# Run unit tests (12200+ tests)
pnpm test

# Run e2e tests (requires dev server running)
pnpm dev  # in one terminal
npx playwright test  # in another terminal

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Test Coverage

The codebase includes comprehensive test coverage with **12200+ unit tests** across 294 test files and **103 e2e test suites**.

---

## Tech Stack

- **TypeScript** -- type-safe development
- **Vite** -- fast bundler with HMR
- **Vitest** -- unit testing framework
- **Playwright** -- end-to-end testing
- **WebGL2** -- GPU-accelerated rendering (tone mapping, LUT processing, color transforms)
- **WebGPU** -- experimental HDR rendering backend
- **WebAssembly** -- high-performance EXR, JPEG XL, JPEG 2000, HEIC, and OCIO decoding
- **WebCodecs API** -- frame-accurate video decoding via [mediabunny](https://github.com/nickarora/mediabunny) and video encoding for export
- **Web Audio API** -- audio playback, waveform generation, volume control, and pitch correction
- **WebRTC** -- peer-to-peer connections for collaborative review
- **BroadcastChannel API** -- same-origin cross-window communication for external presentation
- **Fullscreen API** -- native fullscreen and presentation modes
- **IndexedDB** -- persistent storage for snapshots, auto-save, and session recovery
- **gto-js** -- RV/GTO file parsing
- **@jsquash/jxl** -- JPEG XL WebAssembly decoder (libjxl)
- **libheif-js** -- HEIC/HEIF WebAssembly decoder (libheif)
- **gl-matrix** -- matrix/vector math

## Browser Support

Requires WebGL2 support:
- Chrome 56+
- Firefox 51+
- Safari 15+
- Edge 79+

Hi-DPI/Retina displays are fully supported with automatic detection of `devicePixelRatio`. All canvas-based UI components (scopes, color wheels, curve editor, overlays) render at native resolution for crisp display on 2x, 3x, and fractional DPR screens.

## License

MIT

## Related Projects

- [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV) -- Original C++ application
- [gto-js](https://github.com/lifeart/gto-js) -- GTO file format parser for JavaScript
