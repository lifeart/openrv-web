# Stereo 3D Viewing

Stereo 3D review is essential for visual effects and animated feature production. OpenRV Web delivers a comprehensive set of software-based stereo display modes that run entirely in the browser via WebGL2, requiring no special hardware, drivers, or plugins. Artists can load stereo content, view it through seven primary display modes, adjust convergence in real time, and annotate individual eyes independently.

This guide covers practical workflows for stereo review. For the underlying technical architecture, shader pipeline position, and renderer implementation, see [Stereo 3D Viewing -- Technical Guide](../guides/stereo-3d-viewing.md).

---

## Display Modes

OpenRV Web supports seven stereo display modes plus the default Off state. All modes are selectable from the **Stereo** dropdown in the View tab context toolbar, or by pressing `Shift+3` to cycle through them sequentially.

### Side-by-Side

The left eye occupies the left half of the viewport and the right eye occupies the right half, both rendered at full color. Side-by-side is the most common delivery format for passive 3D displays and for quick visual comparison of left and right eye content during production.

Side-by-side is also the preferred format for stereoscopic broadcast masters and many consumer 3D televisions that accept HDMI side-by-side input.

### Over-Under

The left eye image is placed above the right eye image, each occupying half the vertical resolution. Over-under is the preferred input format for many digital cinema 3D systems and some consumer 3D televisions. This mode preserves full horizontal resolution per eye, making it suitable for wide-aspect content.

### Mirror

The right eye image is horizontally flipped and displayed alongside the left eye in a side-by-side layout. This mode enables the **cross-eye free-viewing technique**, where the viewer crosses their eyes to fuse the two images into a single stereo percept without glasses or special display hardware. Mirror mode is useful for quick depth checks on standard monitors.

### Anaglyph (Red/Cyan)

The classic color anaglyph mode. The left eye is mapped to the red channel and the right eye is mapped to the green and blue (cyan) channels. Viewing requires inexpensive red/cyan anaglyph glasses, which are widely available.

Anaglyph mode works best with scenes that have moderate color saturation. Highly saturated reds or cyans in source imagery may cause retinal rivalry -- visible flicker or discomfort that occurs when the two eyes receive conflicting color signals.

### Anaglyph Luminance

A variant of anaglyph that converts both eyes to luminance (grayscale) before applying the red/cyan channel split. This eliminates color artifacts and retinal rivalry at the cost of losing color information. Luminance anaglyph is recommended for:

- Evaluating stereo depth and convergence without color distraction
- Reviewing scenes with highly saturated reds or cyans that cause artifacts in color anaglyph
- Checking parallax and convergence settings before committing to final stereo adjustments

### Checkerboard

Alternating pixels from the left and right eye are interleaved in a checkerboard pattern. This mode is designed for DLP projectors that support pixel-interleaved stereo (e.g., SpectronIQ HD, TI DLP systems). On a standard monitor without a compatible display, the image will appear blended rather than producing a stereo effect.

### Scanline

Alternating horizontal scanlines carry the left and right eye images. This mode targets line-interleaved 3D monitors that use row-based polarization to separate the two eyes. As with checkerboard mode, a compatible display is required for the stereo effect to be visible.

---

## Selecting a Display Mode

Three methods are available for selecting the stereo display mode:

1. **Dropdown menu** -- Click the **Stereo** button in the View tab context toolbar. A dropdown appears with all eight options (Off plus seven active modes). The active mode is highlighted.

2. **Keyboard shortcut** -- Press `Shift+3` to cycle through all stereo modes in order: Off, Side-by-Side, Over-Under, Mirror, Anaglyph, Anaglyph (Luma), Checkerboard, Scanline.

3. **Scripting API** -- Use the view API from the browser console or an automation script to set the stereo mode programmatically.

When a stereo mode is active, the Stereo button label changes to show the current mode name (e.g., "Side-by-Side") and the button receives an accent highlight.

---

## Eye Swap

The **Swap** button in the stereo control bar reverses the left and right eyes. This is essential when:

- Source material was authored with reversed eye assignments
- The viewing setup requires the opposite eye order (e.g., some projection systems expect right-left rather than left-right)
- A quick confirmation that depth cues are correct -- swapping eyes should make objects that appear in front of the screen recede behind it, and vice versa

The Swap button is visible only when a stereo mode other than Off is active. When enabled, the button receives an accent highlight. Eye swap state persists across frames and tab switches.

---

## Convergence Control (Horizontal Offset)

The **Offset** slider adjusts the horizontal separation between the left and right eye images. This controls the perceived screen-plane depth -- the distance at which objects appear to sit at the screen surface rather than in front of or behind it.

### Range and Precision

- **Range**: -20.0 to +20.0 (percentage of image width)
- **Step size**: 0.5
- **Default**: 0.0

Positive offset values shift the right eye image to the right, increasing positive parallax and pushing objects further behind the screen. Negative offset values reduce parallax, pulling objects toward or in front of the screen.

### Practical Use

Convergence adjustment is the single most important control for comfortable stereo viewing. Incorrect convergence causes eyestrain, headaches, and visual discomfort. The recommended workflow is:

1. Set the stereo mode to Anaglyph or Anaglyph Luminance (easiest to evaluate convergence with glasses)
2. Identify the object or region that should appear at screen depth
3. Adjust the offset slider until that object has zero parallax -- the left and right eye images of that object are perfectly aligned
4. Switch to the desired viewing mode for further review

The offset value is displayed next to the slider with a sign indicator (e.g., "+5.0", "-3.5", "0.0"). The offset slider is only visible when a stereo mode other than Off is active.

---

::: tip VFX Use Case
For stereo dailies review, start with **Anaglyph Luminance** mode and red/cyan glasses to evaluate convergence and depth placement without color distraction. Use the convergence offset slider to set the screen plane at the subject's eye position -- this is the standard for dialogue-heavy scenes. Swap eyes periodically to verify that depth cues are consistent and comfortable. Flag any shots with excessive negative parallax (objects popping too far in front of the screen) for adjustment by the stereo compositor.
:::

::: info Pipeline Note
Multi-view EXR is the preferred stereo delivery format in VFX because both eyes travel together in a single file, eliminating the risk of left/right eye mismatch during file management. When loading multi-view EXRs, verify that the view naming convention matches your pipeline standard (`left`/`right`, `L`/`R`, or custom names) to ensure correct eye assignment.
:::

## Alignment Overlay

When reviewing stereo content, vertical misalignment between the two eyes is a common issue that causes discomfort. OpenRV Web provides an alignment overlay mode that superimposes both eyes at reduced opacity, making vertical shifts, rotation differences, and scale mismatches immediately visible.

To use the alignment overlay:

1. Enable a stereo mode (anaglyph modes work best for alignment checks)
2. Activate the alignment overlay from the View menu
3. Look for vertical offset between corresponding features in the left and right eyes
4. Note any rotation differences (features that are level in one eye but tilted in the other)

The alignment overlay is a diagnostic tool intended for identifying problems. Correcting the alignment requires returning to the compositing or stereo pipeline to fix the source material.

---

## Convergence Measurement

OpenRV Web provides a convergence measurement tool that analyzes the horizontal disparity between the left and right eye images. This allows quantitative evaluation of parallax values across the frame, supplementing the visual convergence check with numerical data. The measurement reports maximum positive parallax (background depth), maximum negative parallax (foreground pop-out), and average parallax, expressed as a percentage of image width.

---

## Floating Window

Floating window (also called floating edge or stereo window) is a technique used in stereo 3D presentation to prevent objects with negative parallax from being clipped by the physical screen edge, which breaks the stereo illusion.

OpenRV Web supports floating window adjustments that add a soft gradient mask along the edges of each eye, creating the illusion that the screen surface extends beyond its physical boundaries. This is particularly important for:

- Shots where characters or objects cross the screen edge while appearing in front of the screen plane
- Theatrical stereo presentations where edge violations are unacceptable
- Review sessions that need to evaluate floating window settings before final delivery

The floating window parameters control the width and softness of the edge mask for each side of the frame independently (left, right, top, bottom).

---

## Per-Eye Annotations

OpenRV Web supports annotations that are specific to the left or right eye. When a stereo mode is active and annotations are enabled (key `5`), the annotation layer applies to the currently dominant eye context.

This capability is useful for:

- Marking convergence issues that affect only one eye
- Noting objects that need stereo-specific paint or roto adjustments
- Flagging left-right differences in lighting, grain, or color that require correction

Per-eye annotations are preserved in the session state and appear only when the corresponding eye is displayed.

---

## Multi-View EXR

Multi-view EXR files store left and right eye images (and potentially additional views such as center or custom camera positions) within a single file container. Each view is stored as a named layer within the EXR.

OpenRV Web supports loading multi-view EXR files and automatically detecting stereo pairs based on standard view naming conventions:

- `left` / `right`
- `Left` / `Right`
- `L` / `R`

When a multi-view EXR is loaded and a stereo mode is active, the viewer automatically maps the detected views to the left and right eye channels. If no recognized stereo pair is found, the file is treated as a standard single-view EXR.

Multi-view EXR support also extends to image sequences where each frame is a multi-view EXR file. The stereo mode is applied per-frame as the sequence plays.

---

## Stereo in the Render Pipeline

Stereo processing occurs early in the rendering pipeline, before color corrections, LUT application, and channel isolation. The processing order is:

1. Source image with spatial transform
2. Crop
3. **Stereo mode** (eye extraction, offset, display mode composition)
4. Lens distortion
5. LUT
6. Color adjustments and CDL
7. Color curves
8. Sharpen/blur
9. Channel isolation
10. Annotations

This positioning ensures that color corrections, scopes, and annotations all operate on the stereo-composited image, providing an accurate representation of the final stereo output.

---

## Stereo State Persistence

All stereo settings -- mode, eye swap state, and horizontal offset -- are persisted:

- Across frame changes during playback
- Across tab switches within the application
- In saved `.orvproject` session files
- In imported RV/GTO session files (stereo settings are mapped from the desktop RV equivalents)

Restoring a session that was saved with an active stereo mode will re-enable that mode and all associated settings.

---

## Choosing the Right Mode

| Mode | Requires Hardware | Best For |
|------|-------------------|----------|
| Side-by-Side | Passive 3D display or none | Quick L/R comparison, delivery format review |
| Over-Under | Cinema 3D system or none | Checking delivery format, projection preview |
| Mirror | None | Cross-eye free-viewing on any monitor |
| Anaglyph | Red/cyan glasses | General stereo review, convergence checks |
| Anaglyph Luminance | Red/cyan glasses | Convergence evaluation, saturated scenes |
| Checkerboard | DLP stereo projector | Projection room review |
| Scanline | Line-interleaved 3D monitor | Desktop stereo monitor review |

For day-to-day VFX review without specialized hardware, **Anaglyph** or **Anaglyph Luminance** with inexpensive red/cyan glasses provides the most accessible stereo experience. For delivery verification, use the mode that matches the intended output format (Side-by-Side or Over-Under).

---

## Limitations

The following desktop OpenRV stereo features are not available in the browser-based version:

- **Hardware stereo (quad-buffered)** -- Requires WebGL quad-buffered stereo, which has very limited browser support.
- **HDMI 1.4a output modes** -- The browser does not provide direct HDMI output control.
- **Stereo QuickTime** -- Requires container format stereo metadata parsing, which is not supported by browser video decoders.
- **WebXR / VR headset support** -- A potential future enhancement that would allow stereo review in VR.

---

## Related Pages

- [Stereo 3D Viewing -- Technical Guide](../guides/stereo-3d-viewing.md) -- Renderer architecture, shader pipeline, StereoRenderer implementation
- [Rendering Pipeline](../guides/rendering-pipeline.md) -- Full shader pipeline stage ordering
- [Session Compatibility](../guides/session-compatibility.md) -- RV/GTO session import including stereo settings
- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md) -- Complete shortcut reference including `Shift+3`
