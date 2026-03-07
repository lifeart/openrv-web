# Vectorscope

The vectorscope displays the color information of the image as a circular plot, showing the hue (angle) and saturation (distance from center) of every pixel. It is the primary tool for evaluating color accuracy, identifying color casts, and verifying skin tone consistency.

![Vectorscope display](/assets/screenshots/14-vectorscope.png)

## Opening the Vectorscope

Press `Y` to toggle the vectorscope. It appears as a floating overlay. Press `Y` again or `Escape` to close it.

## Reading the Vectorscope

The vectorscope plots each pixel's chrominance on a circular graph:

- **Angle** represents hue (red, yellow, green, cyan, blue, magenta around the circle)
- **Distance from center** represents saturation (center is neutral/gray, edge is fully saturated)
- **Targets** at standard positions indicate the broadcast primary and secondary colors (R, G, B, Cy, Mg, Yl)

### Key Patterns

| Pattern | Interpretation |
|---------|---------------|
| Tight cluster at center | Desaturated or neutral image |
| Spread toward one direction | Strong color cast in that hue |
| Points near the edge | Highly saturated colors |
| Even circular spread | Wide range of colors present |
| Points along skin tone line | Accurate flesh tones |

## Skin Tone Line

A reference line on the vectorscope indicates the expected hue angle for human skin tones. Regardless of skin color (light to dark), well-photographed skin tones cluster along this line. If skin tone pixels deviate from the line, a color cast may be affecting the image.

During color correction, adjust temperature and tint until skin tone pixels align with the reference line.

## Zoom Levels

The vectorscope supports zoom levels to magnify the center region. Zooming in is useful for images with low saturation, where the pixel dots cluster near the center and are difficult to interpret at the default zoom.

## GPU Acceleration

The vectorscope is rendered using WebGL for real-time performance. It updates live as color adjustments are applied, providing immediate feedback on how grading operations affect the color distribution.

::: tip VFX Use Case
The **skin tone line** (approximately 123 degrees on the vectorscope, between red and yellow) is the single most important reference for color correction. Regardless of ethnicity, properly white-balanced skin tones cluster along this line -- only the distance from center (saturation) varies. If skin tones drift off the line during comp or grading, the shot will look wrong to the audience even if they cannot articulate why.
:::

::: info Pipeline Note
Use the vectorscope to check **memory colors** -- colors that audiences have strong expectations about, such as sky blue, foliage green, and skin tones. During dailies review, if the point cloud is shifted uniformly in one direction, a global color cast is present. This is often caused by an incorrect input color space or a missing white balance correction from set.
:::

## Practical Tips

- Use the vectorscope alongside the waveform when color correcting: the waveform handles exposure while the vectorscope handles color
- A neutral gray card in the image should produce a tight dot at the center of the vectorscope
- Color casts appear as a shift of the entire point cloud in one direction
- After correcting a color cast, the point cloud should be more centered

---

## Related Pages

- [Histogram](histogram.md) -- pixel value distribution
- [Waveform Monitor](waveform.md) -- spatial luminance distribution
- [Pixel Probe](pixel-probe.md) -- exact color readout under cursor
