# Stereo 3D Viewing

> *Portions of this guide are adapted from [OpenRV documentation](https://github.com/AcademySoftwareFoundation/OpenRV), (c) Contributors to the OpenRV Project, Apache 2.0. Content has been rewritten for the WebGL2/browser context of OpenRV Web.*

---

## Overview

Stereo 3D review is a critical part of modern VFX and animated feature production. OpenRV Web provides a full suite of software-based stereo display modes that run entirely in the browser via WebGL2, requiring no special hardware or drivers. Artists can load stereo content in several input formats, view it through ten distinct display modes, and adjust convergence and eye swap in real time.

This guide covers every stereo display mode, the supported input formats, convergence and alignment tools, and the differences compared to desktop OpenRV's stereo capabilities.

---

## Stereo Display Modes

OpenRV Web supports ten stereo display modes, selectable from the View menu or by pressing **Shift+3** to cycle through them. The modes are defined by the `StereoMode` type in the viewer core:

### Off

The default mode. No stereo processing is applied. The viewer displays a single image as-is.

### Side-by-Side

The left and right eye images are displayed horizontally adjacent in full color. The left eye occupies the left half of the viewport and the right eye occupies the right half. This mode is widely used for:

- Passive 3D displays that accept side-by-side input
- Quick visual comparison of left and right eye content
- Delivery masters for stereoscopic broadcast

### Over-Under

The left eye image is placed above the right eye image, each occupying half the vertical resolution. Over-under is the preferred input format for many cinema 3D systems and some consumer 3D televisions.

### Mirror

The right eye image is horizontally flipped (flopped) and displayed alongside the left eye. This mode enables the **cross-eye free-viewing technique**, where the viewer crosses their eyes to fuse the two images into a stereo percept without any glasses or display hardware.

### Anaglyph

The classic red/cyan anaglyph mode. The left eye is mapped to the red channel and the right eye is mapped to the green and blue (cyan) channels. Requires inexpensive red/cyan anaglyph glasses.

Anaglyph mode works best with scenes that have moderate color saturation. Highly saturated reds or cyans in the source imagery may cause retinal rivalry (visible flicker or discomfort).

### Anaglyph Luminance

A variant of anaglyph that converts both eyes to luminance (grayscale) before applying the red/cyan channel split. This eliminates color artifacts and retinal rivalry at the cost of losing color information. Recommended for:

- Evaluating depth and convergence without color distraction
- Reviewing scenes with strong saturated colors
- Quick stereo checks on any monitor with anaglyph glasses

### Checkerboard

Alternating pixels in a checkerboard pattern display left and right eye content. Designed for DLP projectors and displays that support checkerboard stereo, such as SpectronIQ HD and certain TI DLP-based cinema projectors.

The checkerboard pattern operates at full display resolution, with even-positioned pixels showing the left eye and odd-positioned pixels showing the right eye (or vice versa with eye swap enabled).

### Scanline

Alternating horizontal scanlines display left and right eye content. Even scanlines show the left eye and odd scanlines show the right eye. This mode is designed for:

- Autostereoscopic (glasses-free) displays that use lenticular lenses
- Line-interleaved 3D monitors
- Row-interleaved passive 3D systems

### Left Only

Displays only the left eye image at full resolution. Useful for isolating the left eye during stereo alignment checks, per-eye color grading review, or when one eye has artifacts that need inspection.

### Right Only

Displays only the right eye image at full resolution. The counterpart to left-only mode for right-eye inspection.

---

## Input Formats

OpenRV Web supports three stereo input format configurations, defined by the `StereoInputFormat` type:

### Side-by-Side Input

A single image or video file contains both eyes packed horizontally. The left half of the frame is the left eye and the right half is the right eye. The viewer automatically splits the frame at the horizontal midpoint.

Common in broadcast delivery, consumer 3D content, and real-time stereo camera outputs.

### Over-Under Input

A single image or video file contains both eyes packed vertically. The top half is the left eye and the bottom half is the right eye. The viewer splits at the vertical midpoint.

Common in cinema delivery formats and some VR camera outputs.

### Separate Input

Left and right eye content is provided as separate files, loaded independently and associated as a stereo pair. This is the standard approach in VFX pipelines where left and right eye renders are produced as independent image sequences.

In OpenRV Web, separate stereo sources are combined as layers in a stack view, with the viewer treating the first source as the left eye and the second as the right eye.

---

## Convergence and Eye Swap

### Convergence Offset

The convergence offset controls the horizontal displacement between the left and right eye images, expressed as a percentage of image width. The range is **-20 to +20** with a step size of **0.5** (stored as the `offset` field in `StereoState`).

- **Positive offset**: Pushes the stereo window further away from the viewer (increases screen-plane depth)
- **Negative offset**: Pulls the stereo window closer to the viewer (objects appear to float in front of the screen)
- **Zero offset**: No convergence adjustment; the stereo pair is displayed as-is

Convergence adjustment is essential when reviewing stereoscopic content for audience comfort. Excessive negative parallax (objects too far in front of the screen) causes eye strain; excessive positive parallax (objects too far behind the screen) causes divergence discomfort.

### Eye Swap

The **eye swap** toggle reverses the left and right eye assignments. When enabled, the image that would normally be displayed for the left eye is shown for the right eye, and vice versa.

Use eye swap when:

- Source material has the eyes labeled in the opposite convention
- A display system expects the opposite eye order
- Testing for pseudoscopic (reversed depth) effects during editorial review

### Keyboard Shortcut

Press **Shift+3** to cycle through stereo display modes in order: off, side-by-side, over-under, mirror, anaglyph, anaglyph-luminance, checkerboard, scanline, left-only, right-only, then back to off.

---

## Modes Not Supported

Several stereo modes available in desktop OpenRV are **not supported** in OpenRV Web due to browser platform limitations:

| Mode | Desktop OpenRV | OpenRV Web | Reason |
|------|---------------|------------|--------|
| Quad-buffered OpenGL | Supported | Not supported | Browsers do not expose quad-buffered GL stereo contexts. WebGL2 provides a single draw buffer. |
| HDMI 1.4a frame packing | Supported | Not supported | Browsers have no direct HDMI output control. Frame packing requires OS-level display mode switching. |
| Hardware shutter glasses | Supported | Not supported | Requires quad-buffered stereo sync with IR/RF emitters, which is inaccessible from a browser sandbox. |
| Multi-view EXR stereo | Supported | Not yet implemented | The `MultiViewEXR.ts` parser exists but automatic stereo pair assignment from multi-view channels is planned. |
| Stereo QuickTime movies | Supported | Not yet implemented | WebCodecs does not expose per-eye tracks from stereoscopic MOV containers. |

### Future: WebXR

WebXR provides a standards-based path for VR headset stereo rendering in the browser. OpenRV Web may add WebXR stereo output in a future release, enabling immersive review on headsets such as Meta Quest and Apple Vision Pro. This would replace the need for quad-buffered GL or HDMI frame packing, as VR headsets handle per-eye rendering and display synchronization internally.

---

## Advanced Stereo Features

OpenRV Web includes several stereo-specific tools that go beyond basic display mode selection:

### Stereo Alignment Overlay

A visual overlay for verifying left/right eye alignment during stereo setup. The overlay draws registration marks, grid lines, and edge highlights that make misalignment between the eyes immediately visible. This is critical during camera setup and rig calibration review.

### Convergence Measurement Tool

An interactive tool that measures the pixel offset (parallax) between corresponding points in the left and right eye images. By clicking a feature in the left eye, the tool shows the horizontal displacement to the same feature in the right eye, expressed in pixels and as a percentage of screen width.

This measurement maps directly to perceived depth: zero parallax means the object appears at screen plane, positive parallax places it behind the screen, and negative parallax places it in front.

### Floating Window Detection

Detects stereo depth violations at frame edges where objects with negative parallax (in front of the screen) are clipped by the frame boundary. These "floating window violations" break the stereo illusion and cause viewer discomfort. The detection highlights edge regions where the left and right eye images differ significantly, indicating objects that cross the stereo window boundary.

### Per-Eye Annotations

Separate annotation layers are maintained for the left and right eye images. When drawing annotations in stereo mode, artists can annotate each eye independently. This is essential for noting per-eye issues such as:

- Lens flares or reflections visible in only one eye
- Rig shadow artifacts specific to one camera
- Rotoscoping or paint differences between eyes

### Stereo Eye Transform

Per-eye geometric transforms (translate, rotate, scale) allow fine-grained alignment correction of each eye independently. This compensates for:

- Vertical misalignment between stereo rig cameras
- Rotation (tilt) differences between cameras
- Scale differences due to lens matching imperfections

The eye transform state is persisted in the session and applied in the rendering pipeline before stereo compositing.

### Stereo Eye Transform

Per-eye geometric transforms (translate, rotate, scale) allow fine-grained alignment correction of each eye independently. This compensates for:

- Vertical misalignment between stereo rig cameras
- Rotation (tilt) differences between cameras
- Scale differences due to lens matching imperfections

The eye transform state is persisted in the session and applied in the rendering pipeline before stereo compositing. The `StereoEyeTransform` module provides transform state management with configurable alignment modes.

### Session Persistence

All stereo settings -- mode, input format, convergence offset, eye swap, alignment overlay state, per-eye transforms, and alignment mode -- are stored in the GTO session format and the `.orvproject` native session format. Opening a saved session restores the complete stereo viewing configuration.

When loading a desktop RV session (.rv file) that contains stereo settings, the `GTOGraphLoader` reads the `RVDisplayStereo` and `RVSourceStereo` protocol objects and maps their properties to the OpenRV Web stereo state. This includes the display mode, eye swap flag, and convergence parameters.

---

## Stereo Review Workflow

A typical stereo review workflow in OpenRV Web follows these steps:

1. **Load stereo content**: Drag and drop a side-by-side or over-under stereo image/video, or load separate left and right eye files as a stack
2. **Select input format**: Choose the appropriate `StereoInputFormat` (side-by-side, over-under, or separate) to match your content
3. **Choose display mode**: Select a stereo display mode that matches your available hardware (anaglyph for glasses, side-by-side for passive displays, etc.)
4. **Adjust convergence**: Use the convergence offset to set comfortable screen-plane depth. Start at 0 and adjust based on the stereo content's intended depth budget
5. **Verify alignment**: Enable the stereo alignment overlay to check for vertical misalignment, rotation, or scale differences between eyes
6. **Apply per-eye corrections**: If alignment issues are detected, use the stereo eye transform to correct each eye independently
7. **Annotate**: Use per-eye annotation layers to mark issues visible in only one eye
8. **Save session**: Save as `.orvproject` to preserve all stereo settings for future review

---

## Stereo Mode Selection Summary

| Mode | Glasses Required | Best For |
|------|-----------------|----------|
| Side-by-Side | None (or passive 3D display) | Passive displays, broadcast QC |
| Over-Under | None (or passive 3D display) | Cinema delivery, VR camera review |
| Mirror | None (cross-eye technique) | Quick check without any hardware |
| Anaglyph | Red/cyan glasses | Inexpensive stereo review |
| Anaglyph Luminance | Red/cyan glasses | Depth-only review, saturated content |
| Checkerboard | DLP projector glasses | Projection-based review rooms |
| Scanline | Lenticular/line-interleaved display | Autostereoscopic monitors |
| Left Only | None | Per-eye inspection |
| Right Only | None | Per-eye inspection |

---

## Related Pages

- [File Formats](file-formats.md) -- Multi-view EXR and stereo video container support
- [Node Graph Architecture](node-graph-architecture.md) -- How stereo source pairs are represented in the DAG
- [Session Compatibility](session-compatibility.md) -- Stereo settings persistence in RV and .orvproject sessions
