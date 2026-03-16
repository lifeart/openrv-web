# Frequently Asked Questions

## General

### What is OpenRV Web?

OpenRV Web is a professional browser-based image and video review tool inspired by [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV). It provides frame-accurate playback, comprehensive color management, annotation tools, and collaborative review sessions -- all running entirely in the browser with no server-side processing.

### Is OpenRV Web free?

Yes. OpenRV Web is released under the MIT license. It is free to use, modify, and distribute. The source code is available on GitHub.

### Does OpenRV Web send my files to a server?

No server upload is required for viewing. All decoding and rendering happens locally in the browser -- files loaded through drag-and-drop or the file picker are never uploaded to a server for processing. However, when you join a collaborative review session, the media-sync feature may transmit file data to other participants over the session's peer-to-peer or WebSocket transport so that all reviewers can view the same content. Outside of collaboration, your files stay entirely on your machine.

### What is the relationship to the original OpenRV?

OpenRV Web is a web-based reimplementation inspired by the original C++ [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV) application from the Academy Software Foundation. It shares design philosophy and supports loading `.rv` session files, but it is a separate codebase written in TypeScript for the browser.

### Can I self-host OpenRV Web?

Yes. Build the project with `pnpm build` and deploy the static files in the `dist/` directory to any web server or static hosting service. See the [Installation](../getting-started/installation.md) guide for details.

## File Loading

### What file formats are supported?

OpenRV Web supports a wide range of image formats (PNG, JPEG, WebP, EXR, DPX, Cineon, HDR, TIFF, JPEG XL, JPEG 2000, HEIC, AVIF, gainmap HDR variants), video formats (MP4, MOV, MKV, WebM, OGG, AVI), and session formats (RV, GTO, OTIO). See the [File Formats](file-formats.md) reference for the complete list.

### How do I load an image sequence?

Select multiple numbered image files through the file picker or drag and drop them onto the viewer. OpenRV Web automatically detects the numbering pattern and treats the files as a playable sequence. Supported patterns include `frame_001.png`, `frame.001.exr`, `frame001.png`, and hash/printf notation.

### Why does my video not play with frame accuracy?

Frame-accurate video playback requires the WebCodecs API, which is available in Chrome 94+, Edge 94+, and Safari 16.4+. Firefox does not yet support WebCodecs and falls back to HTMLVideoElement, which may not provide frame-level precision. For the best experience with video, use Chrome or Edge.

### Can I load files from a URL?

Yes. URL-based loading is supported through share links that include a `sourceUrl` parameter. When you open a share link containing a media URL, OpenRV Web fetches and loads the file automatically via `session.loadSourceFromUrl()`. There is no standalone "paste a URL" input in the UI yet, but the share-link bootstrap flow provides full URL-based loading.

## Color Management

### What color corrections are available?

OpenRV Web provides a comprehensive color pipeline including: exposure, gamma, contrast, saturation, brightness, temperature, tint, vibrance, clarity, highlight/shadow recovery, whites/blacks adjustment, three-way color wheels (lift/gamma/gain), HSL qualifier, ASC CDL, color curves, 1D/3D LUTs, log curve presets, OCIO integration, and tone mapping (Reinhard, Filmic, ACES). All adjustments are GPU-accelerated and applied in real time.

### Does OpenRV Web support OCIO?

Yes. OpenRV Web includes an OpenColorIO-style pipeline with built-in presets (ACES 1.2, sRGB) and the ability to load custom `.ocio` configuration files. Input color space auto-detection, display/view transform selection, and look transforms are all supported. OCIO processing uses a WASM-based implementation.

### Are LUT files embedded in saved projects?

No. LUT files are referenced by path, not embedded in the `.orvproject` file. The LUT file must be accessible when the project is reopened. If the LUT file is unavailable, the project loads without the LUT applied.

## Playback

### What is the maximum playback speed?

Forward playback supports speeds up to 8x. Reverse playback is limited to 4x to prevent frame extraction issues with the WebCodecs decoder.

### Why is audio muted during reverse playback?

Audio is automatically muted during reverse playback because reversed audio does not provide useful information during review. Audio resumes automatically when playback returns to forward direction at 1x speed.

### What loop modes are available?

Three loop modes are available: **Loop** (continuous repetition), **Ping-pong** (reverse at boundaries), and **Once** (stop at boundary). Press `Ctrl+L` to cycle between them.

## Collaboration

### How does collaborative review work?

OpenRV Web uses WebSocket (server-relayed) connections as its primary transport for real-time collaboration. Create a room, share the room code with other viewers, and sync playback position, zoom, color adjustments, annotations, and cursor position. When available, WebRTC peer-to-peer connections are attempted first for session state transfer, with WebSocket used as a fallback. Both state sync and media transfer can flow through either transport path depending on availability. PIN-based encryption secures the session.

### Is a server required for collaboration?

A WebSocket server is used for room creation, joining, and as the default transport for real-time sync messages and media transfer requests. When WebRTC is available, session state responses are sent peer-to-peer first and fall back to the WebSocket relay if the peer channel is unavailable. Public STUN/TURN servers (Google, Cloudflare, OpenRelay) assist WebRTC connection establishment. URL-based signaling provides a serverless P2P alternative for WebRTC. Note: when media sync is active, file data may be transmitted to other participants through either transport so everyone can review the same content.

## Export

### What video codecs can I export?

Video export supports H.264 (Baseline, Main, High profiles), VP9, and AV1. Codec availability depends on the browser. H.264 is the most widely supported. Video export requires the WebCodecs API (Chrome 94+, Edge 94+, Safari 16.4+).

### Can I export annotations?

Yes. Annotations can be exported as JSON (for data interchange and re-import) or as PDF (printable review reports with thumbnails and timecodes). Both options are available in the Export menu.

### How do I copy a frame to the clipboard?

Press `Ctrl+C` to copy the current frame to the system clipboard. This works in secure contexts (HTTPS) and may require user permission on first use.

---

## Related Pages

- [Troubleshooting](troubleshooting.md) -- solutions to common problems
- [Quick Start](../getting-started/quick-start.md) -- get started quickly
- [Browser Compatibility](browser-compatibility.md) -- feature support by browser
