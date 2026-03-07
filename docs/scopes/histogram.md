# Histogram

The histogram displays the distribution of pixel values across the image, providing a quantitative view of exposure, contrast, and color balance. It is one of the most commonly used scopes in color grading and quality control.

## Opening the Histogram

Press `H` to toggle the histogram panel. It appears as a floating overlay on the viewer. Press `H` again or `Escape` to close it.

## Display Modes

The histogram supports several display modes:

### RGB Mode

Displays overlapping red, green, and blue histograms on the same graph. This mode reveals the relative distribution of each color channel and makes color casts immediately visible. For example, if the red histogram is shifted to the right compared to green and blue, the image has a warm (red) cast.

### Luminance Mode

Displays a single white histogram representing the perceived brightness of each pixel, calculated using Rec.709 luminance coefficients (0.2126R + 0.7152G + 0.0722B). This mode is useful for evaluating overall exposure without regard to color.

### Separate Channels

Displays each channel (R, G, B) as its own histogram, making it easier to analyze channels that overlap heavily in RGB mode.

## Log Scale

The histogram offers a logarithmic scale option. In linear scale, very common values (such as a large sky area at similar brightness) dominate the display, making less common values nearly invisible. Log scale compresses the vertical axis so that both common and uncommon values are visible.

## Reading the Histogram

The horizontal axis represents pixel value (0 on the left, 255 or 1.0 on the right). The vertical axis represents how many pixels have each value.

| Shape | Interpretation |
|-------|---------------|
| Peak on the left | Many dark pixels; possible underexposure |
| Peak on the right | Many bright pixels; possible overexposure |
| Spikes at edges | Clipped shadows (left) or highlights (right) |
| Narrow spread | Low contrast |
| Wide spread | Full tonal range |
| Even distribution | Well-exposed, high-contrast image |

## Clipping Indicators

The histogram displays clipping percentages at the boundaries:

- **Left edge**: Percentage of pixels at absolute black (crushed shadows)
- **Right edge**: Percentage of pixels at absolute white (blown highlights)

These percentages help identify images with irrecoverable data loss in the shadows or highlights.

## Clipping Overlay

The clipping overlay visualizes clipped pixels directly on the viewer:

- **Red overlay**: Blown-out highlights (pixel values at maximum)
- **Blue overlay**: Crushed shadows (pixel values at zero)

This overlay makes it immediately obvious which parts of the image have clipped data.

## Channel Isolation Integration

When a channel is isolated (e.g., `Shift+R` for red only), the histogram updates to reflect the isolated channel data. The histogram always shows the distribution of what is currently visible in the viewer.

## GPU Acceleration

The histogram is rendered using WebGL for fast computation. Pixel analysis runs on the GPU, ensuring real-time updates even for large images. The canvas-based display component renders at native resolution on Hi-DPI screens.

## Practical Tips

- Check the histogram before and after color corrections to verify the intended effect
- A well-graded image typically uses the full tonal range without clipping at either end
- Use the clipping overlay during exposure adjustments to avoid losing detail
- Compare the RGB histogram shapes to identify and correct color casts

---

## Related Pages

- [Waveform Monitor](waveform.md) -- spatial luminance distribution
- [Vectorscope](vectorscope.md) -- color vector analysis
- [Pixel Probe](pixel-probe.md) -- exact pixel value readout
- [False Color and Zebra](false-color-zebra.md) -- exposure visualization overlays
