# Getting Started

## What is OpenRV Web?

OpenRV Web is a browser-native VFX image and sequence viewer inspired by [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV). It is built for VFX artists, colorists, supervisors, and pipeline TDs who need a fast, zero-install review tool with professional color controls. All processing happens locally in the browser -- files never leave the machine.

## What can I do with it?

- **Review media** -- Load images, image sequences, and video files for frame-accurate playback with [timeline controls](/playback/timeline-controls) and [J/K/L navigation](/playback/jkl-navigation)
- **Grade and color correct** -- Apply [exposure, contrast, saturation](/color/primary-controls), [CDL](/color/cdl), [curves](/color/curves), [LUTs](/color/lut), and [OCIO](/color/ocio) color pipelines in real time
- **Compare versions** -- Use [A/B switching](/compare/ab-switching), [wipe](/compare/wipe-mode), [split screen](/compare/split-screen), and [difference matte](/compare/difference-matte) to compare shots
- **Analyze images** -- Inspect with [histogram](/scopes/histogram), [waveform](/scopes/waveform), [vectorscope](/scopes/vectorscope), and [pixel probe](/scopes/pixel-probe)
- **Annotate and review** -- Draw notes on frames with the [annotation tools](/annotations/pen-eraser) and track shot status in the [review workflow](/advanced/review-workflow)
- **Automate with scripting** -- Control the viewer programmatically via the [scripting API](/advanced/scripting-api) or integrate with [Nuke, Maya, and Houdini](/advanced/dcc-integration)

## Learning Path

Follow this sequence to get productive quickly:

1. **[Installation](/getting-started/installation)** -- Access the live demo or self-host a local instance
2. **[Browser Requirements](/getting-started/browser-requirements)** -- Verify your browser supports the required APIs
3. **[Quick Start](/getting-started/quick-start)** -- Load media, play back, adjust color, and compare sources
4. **[UI Overview](/getting-started/ui-overview)** -- Understand the full interface layout
5. **Pick your workflow** -- Jump to [Color](/color/primary-controls), [Comparison](/compare/ab-switching), [Scopes](/scopes/histogram), or [Annotations](/annotations/pen-eraser) based on your role

## Why OpenRV Web?

There are many ways to review VFX work. Here is how OpenRV Web compares to the alternatives.

### vs Desktop RV / OpenRV

| | Desktop RV | OpenRV Web |
|---|---|---|
| Installation | Compile from source or obtain license | Open a URL |
| Platform | OS-specific builds | Any modern browser, any OS |
| Color pipeline | Full OCIO, CDL, LUT | CDL, LUT, OCIO, curves, scopes |
| Cost | Commercial (RV) or build-from-source (OpenRV) | Free, MIT license |
| Remote review | Requires network config | Share a link -- reviewers join instantly |

### vs Cloud Review Platforms (SyncSketch, Frame.io, ftrack)

| | Cloud Platforms | OpenRV Web |
|---|---|---|
| Cost | Per-seat subscription | Free forever |
| Data privacy | Files uploaded to vendor servers | Files stay on your machine -- nothing leaves the browser |
| Color accuracy | Limited, browser-dependent | Professional pipeline with CDL, LUT, OCIO, scopes |
| Format support | Transcoded proxies | Native EXR, DPX, Cineon -- no transcoding |
| Offline use | Requires internet | Works fully offline once loaded |

### vs Desktop Viewers (DJV, mrViewer)

| | Desktop Viewers | OpenRV Web |
|---|---|---|
| Installation | Download and install per OS | Zero install |
| Color tools | Basic exposure/gamma | Full CDL, OCIO, curves, LUT, tone mapping |
| Collaboration | None | Real-time sync via WebSocket (with WebRTC data channel) |
| Scripting | Limited or none | Full API via `window.openrv` |
| EXR support | Yes | Yes, with HDR display and gain map support |

## Use Cases

### Dailies Review
Load EXR sequences, apply the show LUT or OCIO config, and review with the team. Annotate frames, set shot status, and export with slate and frameburn for delivery. All without leaving the browser.

### Remote Client Review
Create a sync room, share the link, and review together in real time. The host controls playback while clients follow along. PIN-secured rooms keep confidential content protected. Each participant uses their own calibrated display.

### Color QC
Set up your OCIO pipeline with the correct camera-to-display transform. Use scopes (histogram, waveform, vectorscope), false color, and pixel probe to verify exposure and gamut. Compare grades with A/B wipe.

### Comp Check
Load two versions and use difference matte to spot pixel-level changes. Isolate channels (R, G, B, A, luma) to inspect edges and mattes. Use the wipe tool to compare before and after.

### Editorial Review
Import OTIO timelines, scrub with frame-accurate playback, drop markers at notes, and export annotated frames or video with timecode burn-in for editorial hand-off.

## Supported Formats

| Category | Formats |
|----------|---------|
| Image | EXR, DPX, Cineon, TIFF, PNG, JPEG, JPEG XL, JPEG 2000 |
| HDR | EXR (half/full float), HDR (Radiance), JPEG Gainmap, HEIC Gainmap, AVIF Gainmap |
| Video | MP4, WebM (via WebCodecs) |
| Session | `.rv` (GTO-based session files) |
| Color | `.cube`, `.3dl`, `.csp`, `.itx`, `.look`, `.lut`, `.nk`, `.mga` (LUT formats) |

For the complete list with technical details, see the [File Formats Reference](/reference/file-formats).

## Quick Start

1. Open the app at [lifeart.github.io/openrv-web](https://lifeart.github.io/openrv-web)
2. Drag and drop a media file onto the viewer
3. Use the toolbar tabs to access color, effects, and annotation tools

## Development Setup

```bash
# Clone the repository
git clone https://github.com/lifeart/openrv-web.git
cd openrv-web

# Install dependencies
pnpm install

# Start the development server
pnpm dev

# Run tests
pnpm test
```
