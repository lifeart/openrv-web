# Browser Requirements

OpenRV Web runs entirely in the browser and relies on modern web APIs for GPU-accelerated rendering, video decoding, and audio playback. This page lists the minimum browser versions, required APIs, and optional capabilities.

## Minimum Browser Versions

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Google Chrome | 56+ | Recommended for best feature coverage |
| Mozilla Firefox | 51+ | Full support |
| Apple Safari | 15+ | macOS and iOS |
| Microsoft Edge | 79+ | Chromium-based versions |

All browsers must support **WebGL2** as the primary rendering backend. Older browsers without WebGL2 cannot run OpenRV Web.

## Required APIs

These APIs are essential for core functionality. OpenRV Web will not operate correctly without them.

### WebGL2

WebGL2 powers the GPU-accelerated rendering pipeline, including the fragment shader chain for color corrections, tone mapping, LUT processing, and display output. Without WebGL2, no image rendering occurs.

### Web Audio API

The Web Audio API handles audio playback, volume control, waveform extraction, and audio-video sync with drift correction. It is required for any media that includes an audio track.

### HTML5 Canvas

The Canvas 2D API is used for the timeline, scopes (histogram, waveform, vectorscope), color wheels, curve editor, and annotation rendering. It also serves as a fallback HDR display path.

### File API

The HTML5 File API enables drag-and-drop file loading and the file picker dialog. All media loading depends on this API.

## Recommended APIs

These APIs enhance the experience but are not strictly required. OpenRV Web detects their availability at startup and enables features accordingly.

### WebCodecs

WebCodecs provides frame-accurate video decoding through the mediabunny library. It is available in Chrome 94+, Edge 94+, and Safari 16.4+. Firefox does not yet support WebCodecs. Without it, video playback falls back to the HTMLVideoElement, which may not provide frame-level precision.

### IndexedDB

IndexedDB stores session snapshots, auto-save data, and crash recovery information. Without it, auto-save and snapshot features are unavailable. All modern browsers support IndexedDB.

## Optional APIs

These APIs unlock advanced features. The application functions without them but with reduced capability.

### WebGPU (Experimental)

WebGPU enables the experimental HDR rendering backend with `rgba16float` textures and extended tone mapping. It is available behind flags in Chrome 113+ and is not yet widely supported. OpenRV Web automatically falls back to WebGL2 when WebGPU is unavailable.

### BroadcastChannel

The BroadcastChannel API enables the External Presentation feature, which synchronizes frame, playback, and color state between multiple browser windows on the same origin. Available in Chrome 54+, Firefox 38+, and Safari 15.4+.

### Fullscreen API

The Fullscreen API provides native fullscreen mode via `F11` or the toolbar button. Presentation mode (clean display with cursor auto-hide) also depends on this API. It requires a secure context (HTTPS).

### Clipboard API

The Clipboard API enables copying the current frame to the system clipboard via `Ctrl+C`. It requires a secure context and user permission.

### WebRTC

WebRTC powers peer-to-peer connections for collaborative review sessions with NAT traversal via STUN/TURN servers. Required only for network sync features.

## Hi-DPI and Retina Support

OpenRV Web automatically detects `devicePixelRatio` and renders all canvas-based UI components at native resolution. This includes the viewer, scopes, color wheels, curve editor, and overlays. Displays with 2x, 3x, or fractional DPR values are fully supported for crisp rendering.

## Mobile Browser Support

OpenRV Web works on mobile browsers with WebGL2 support, including Safari on iOS 15+ and Chrome on Android. Touch interactions (pinch-to-zoom, tap-to-seek) are supported. However, the interface is optimized for desktop displays, and some features (keyboard shortcuts, drag-and-drop) are limited on mobile devices.

## Compatibility Check

On first load, OpenRV Web runs a capability detection check for WebGL2, WebGPU, video frame texturing, Display P3 color, and HDR display support. The results inform which rendering paths and features are enabled. If WebGL2 is unavailable, the application displays an error message rather than loading a broken interface.

---

## Related Pages

- [Installation](installation.md) -- set up and deploy OpenRV Web
- [Browser Compatibility Matrix](../reference/browser-compatibility.md) -- detailed feature-by-browser table
- [Troubleshooting](../reference/troubleshooting.md) -- resolve browser-specific issues
