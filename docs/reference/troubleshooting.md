# Troubleshooting

This guide addresses common issues encountered when using OpenRV Web. Each section describes the symptom, likely causes, and recommended solutions.

## Black Screen or No Image

**Symptom**: The viewer canvas is black or empty after loading a file.

**Possible Causes and Solutions**:

1. **WebGL2 not supported** -- OpenRV Web requires WebGL2 for rendering. Check that the browser meets the [minimum version requirements](../getting-started/browser-requirements.md). Try updating the browser to the latest version.

2. **Hardware acceleration disabled** -- Ensure hardware acceleration is enabled in the browser settings. In Chrome, navigate to `chrome://settings/system` and verify "Use hardware acceleration when available" is on.

3. **GPU driver issues** -- Outdated or corrupted GPU drivers can cause WebGL failures. Update the graphics card drivers to the latest version from the manufacturer (NVIDIA, AMD, Intel).

4. **Corrupted or unsupported file** -- The file may be in an unsupported format or corrupted. Try loading a known-good PNG or JPEG to verify the viewer works. Check the browser developer console (F12) for error messages.

5. **Large image exceeding GPU limits** -- Very large images may exceed the GPU's maximum texture size. The renderer uses tiled rendering for large images, but extremely large files may still fail. Check the console for texture size warnings.

## Video Not Playing

**Symptom**: A video file loads but does not play, shows only the first frame, or plays without frame accuracy.

**Possible Causes and Solutions**:

1. **WebCodecs not available** -- Frame-accurate playback requires WebCodecs. In Firefox or older Safari, video falls back to HTMLVideoElement, which may not seek to exact frames. Use Chrome 94+ or Edge 94+ for the best video experience.

2. **Unsupported codec** -- The browser may not support the video codec (e.g., ProRes, DNxHD). OpenRV Web detects these codecs and provides guidance. Transcode the video to H.264 MP4 using FFmpeg: `ffmpeg -i input.mov -c:v libx264 -crf 18 output.mp4`

3. **CORS restrictions** -- If the video is served from a different origin, CORS headers are required. Ensure the media server includes `Access-Control-Allow-Origin: *`.

4. **Large video file** -- Very large video files load entirely into memory. If the browser tab crashes, try using a shorter clip or a lower-resolution proxy.

## Colors Look Wrong

**Symptom**: Image colors appear incorrect -- too bright, too dark, wrong hue, or washed out.

**Possible Causes and Solutions**:

1. **Active color corrections** -- Check whether exposure, gamma, contrast, saturation, or other color adjustments are applied. Press `2` to open the Color tab and verify all sliders are at their defaults. Use the reset button to clear all adjustments.

2. **LUT applied** -- A loaded LUT may be transforming colors. Check the LUT controls and remove or bypass the LUT.

3. **Log-encoded source without log curve** -- Log-encoded footage (ARRI LogC, Sony S-Log3, etc.) appears flat and desaturated without the appropriate log-to-linear conversion. Apply the correct log curve preset from the Color tab.

4. **Wrong transfer function** -- The display transfer function may not match the content. Check the display color management settings. sRGB content should use the sRGB transfer function.

5. **Channel isolation active** -- A single channel may be isolated, showing a grayscale image. Press `Shift+N` to return to normal RGB display.

6. **Tone mapping active** -- An enabled tone mapping operator (Reinhard, Filmic, ACES) alters the image appearance. Toggle tone mapping off if unwanted.

## Playback Stuttering

**Symptom**: Video playback drops frames, stutters, or pauses intermittently.

**Possible Causes and Solutions**:

1. **CPU/GPU overload** -- Close other demanding applications and browser tabs. Check the browser task manager (Shift+Escape in Chrome) for high CPU or memory usage.

2. **Frame caching** -- The first playthrough may stutter while frames are cached. The second loop should play more smoothly. The cache indicator on the timeline shows cached frames.

3. **High playback speed** -- Playback at 4x or 8x may exceed the decoding throughput. Reduce speed for smoother playback.

4. **Large resolution** -- 4K and larger images require more GPU and memory resources. The adaptive proxy rendering system may help by reducing quality during interaction.

5. **Complex color pipeline** -- Multiple active effects (LUT + tone mapping + curves + CDL) increase GPU load per frame. Simplify the pipeline for smoother playback.

6. **Browser memory pressure** -- Long sessions with many loaded files consume memory. Refresh the page to release resources, then reload the needed media.

## Session Recovery

**Symptom**: The browser crashed or was closed unexpectedly, and work needs to be recovered.

**Solutions**:

1. **Auto-save recovery** -- On restart, OpenRV Web checks for auto-save data in IndexedDB. If a crash is detected (no clean shutdown flag), a recovery prompt may appear with the most recent auto-saved state. Accept the recovery to restore the session.

2. **Snapshot recovery** -- Open the Snapshots panel (`Ctrl+Shift+Alt+S`) to browse previously saved snapshots. Manual and automatic snapshots can be restored.

3. **Project file** -- If a `.orvproject` file was saved manually, load it to restore the session state. Media files with blob URLs will need to be re-linked.

## Network Sync Issues

**Symptom**: Collaborative review sessions fail to connect, disconnect frequently, or lose sync.

**Possible Causes and Solutions**:

1. **Firewall blocking WebRTC** -- Corporate firewalls may block peer-to-peer connections. Ensure STUN/TURN server ports are accessible. The application uses public STUN/TURN servers (Google, Cloudflare, OpenRelay).

2. **Signaling server unavailable** -- The WebSocket signaling server must be reachable for room creation and joining. Check network connectivity and signaling server configuration.

3. **Browser permissions** -- Some browsers require explicit permission for WebRTC. Check that the browser is not blocking peer connections.

4. **Reconnection** -- The client implements exponential backoff for reconnection. If disconnected, wait a few seconds for automatic reconnection. If it fails, try rejoining the room manually.

## Export Failures

**Symptom**: Frame or video export fails, produces corrupted output, or does not start.

**Possible Causes and Solutions**:

1. **WebCodecs not available** -- Video export requires WebCodecs (Chrome 94+, Edge 94+, Safari 16.4+). Firefox cannot export video. Use frame export (PNG/JPEG/WebP) as an alternative.

2. **Codec not supported** -- AV1 encoding may not be available in all browsers. Try H.264, which has the broadest support.

3. **Secure context required** -- Clipboard copy (`Ctrl+C`) requires HTTPS. If using HTTP in development, clipboard access may be denied.

4. **Insufficient storage** -- Video export generates data in memory before downloading. Very long exports may exceed available memory. Export shorter segments.

5. **Download blocked** -- Some browser configurations or extensions block automatic downloads. Check the download settings and allow downloads from the application URL.

## Bug Reporting

If an issue persists after trying the solutions above:

1. Open the browser developer console (F12 or Cmd+Option+I)
2. Check the Console tab for error messages
3. Note the browser name, version, and operating system
4. Describe the steps to reproduce the issue
5. Report the issue on the [GitHub repository](https://github.com/lifeart/openrv-web/issues) with the collected information

---

## Related Pages

- [FAQ](faq.md) -- answers to common questions
- [Browser Requirements](../getting-started/browser-requirements.md) -- API requirements
- [Browser Compatibility](browser-compatibility.md) -- feature-by-browser matrix
- [Installation](../getting-started/installation.md) -- deployment configuration
