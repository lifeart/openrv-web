# Browser Compatibility Matrix

This page details which features are available in each major browser. Core functionality requires WebGL2, which is supported by all modern browsers. Advanced features depend on newer APIs with varying support.

## Core Requirements

| Feature | Chrome 56+ | Firefox 51+ | Safari 15+ | Edge 79+ |
|---------|-----------|-------------|------------|----------|
| WebGL2 rendering | Yes | Yes | Yes | Yes |
| Canvas 2D (scopes, timeline) | Yes | Yes | Yes | Yes |
| Web Audio API | Yes | Yes | Yes | Yes |
| File API (drag-drop, picker) | Yes | Yes | Yes | Yes |
| CSS Custom Properties | Yes | Yes | Yes | Yes |
| Hi-DPI rendering | Yes | Yes | Yes | Yes |

All core features -- image display, color corrections, scopes, annotations, and timeline -- work in every supported browser.

## Video Decoding

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| WebCodecs (frame-accurate) | 94+ | Not supported | 16.4+ | 94+ |
| HTMLVideoElement fallback | Yes | Yes | Yes | Yes |
| H.264 decoding | Yes | Yes | Yes | Yes |
| VP9 decoding | Yes | Yes | Partial | Yes |
| AV1 decoding | Yes | Yes (limited) | 17+ | Yes |
| HDR video (HLG/PQ) | Yes | Partial | Yes | Yes |

Firefox users should be aware that video playback uses the HTMLVideoElement fallback, which does not guarantee frame-accurate seeking and may not support all container formats.

## Advanced Features

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| WebGPU (experimental HDR) | 113+ (flag) | Not supported | Not supported | 113+ (flag) |
| BroadcastChannel (ext. presentation, text-only) | 54+ | 38+ | 15.4+ | 79+ |
| Fullscreen API | Yes | Yes | Yes | Yes |
| Clipboard API (copy frame) | Yes | Yes | Yes | Yes |
| IndexedDB (auto-save, snapshots) | Yes | Yes | Yes | Yes |
| WebRTC (network sync) | Yes | Yes | Yes | Yes |

## Video Export

| Codec | Chrome | Firefox | Safari | Edge |
|-------|--------|---------|--------|------|
| H.264 encoding | Yes | Not supported | 16.4+ | Yes |
| VP9 encoding | Yes | Not supported | Not supported | Yes |
| AV1 encoding | Yes | Not supported | Not supported | Yes |

Video export relies on WebCodecs for encoding. Browsers without WebCodecs support cannot export video.

## WASM Decoders

| Decoder | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| EXR (TypeScript) | Yes | Yes | Yes | Yes |
| JPEG XL (WASM) | Yes | Yes | Yes | Yes |
| JPEG 2000 / HTJ2K (WASM) | Yes | Yes | Yes | Yes |
| HEIC (WASM fallback) | Yes | Yes | Native | Yes |
| OCIO (WASM) | Yes | Yes | Yes | Yes |

WASM decoders work across all supported browsers. Safari uses native HEIC decoding when available.

## Mobile Support

| Platform | Browser | Status |
|----------|---------|--------|
| iOS 15+ | Safari | Functional with limitations (desktop-optimized) |
| Android | Chrome | Functional with limitations (desktop-optimized) |
| Android | Firefox | Limited (no WebCodecs, desktop-optimized) |

Mobile browsers support core functionality including basic touch gestures (pinch-to-zoom, tap-to-seek). However, the interface is **desktop-optimized** and several UI components rely on interaction patterns that do not translate well to touch devices:

- **Volume control**: The volume slider is hidden by default and only appears on pointer hover (`pointerenter`/`pointerleave`). On touch devices without hover capability, the slider cannot be revealed through normal interaction. See issue #116.
- **Virtual slider controls**: The color-adjustment virtual sliders (key-hold-and-drag for exposure, saturation, etc.) explicitly exclude touch input (`pointerType === 'touch'` is ignored), so these controls are mouse/pen only.
- **Keyboard shortcuts**: Unavailable without an external keyboard.
- **General layout**: The interface is designed for desktop-sized viewports and may be cramped on smaller screens.

## Known Issues

| Browser | Issue | Workaround |
|---------|-------|------------|
| Firefox | No WebCodecs support | Video playback uses HTMLVideoElement fallback; frame accuracy may vary |
| Safari < 16.4 | No WebCodecs | Same as Firefox |
| All browsers | CORS restrictions on cross-origin media | Ensure media servers include CORS headers |
| All browsers | Autoplay restrictions | First play requires user interaction |
| Safari | Limited WebGPU support | Falls back to WebGL2 |
| All browsers | External Presentation shows text-only status (no viewer rendering) | Feature is partial; see issue #29 |
| Mobile (all) | Volume slider inaccessible without hover | No current workaround; see issue #116 |
| Mobile (all) | Virtual slider color controls unavailable | Use the color panel UI instead |

---

## Related Pages

- [Browser Requirements](../getting-started/browser-requirements.md) -- detailed API requirements
- [Installation](../getting-started/installation.md) -- deployment and MIME type configuration
- [Troubleshooting](troubleshooting.md) -- resolving browser-specific issues
