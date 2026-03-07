# Gamut Diagram

The gamut diagram displays the CIE 1931 chromaticity diagram with the image's color data plotted on it. This scope visualizes which colors in the image fall within or outside a target color gamut, making it essential for HDR and wide color gamut workflows.

![CIE gamut diagram scope](/assets/screenshots/38-gamut-diagram.png)

## CIE 1931 Display

The diagram shows the familiar horseshoe-shaped CIE 1931 chromaticity space. Standard color gamuts (sRGB, Display P3, Rec. 2020) are drawn as triangles within this space, with their primaries at the vertices.

The image's pixel colors are plotted as points on the diagram, showing where they fall relative to the target gamut boundary.

## Reading the Diagram

| Observation | Interpretation |
|-------------|---------------|
| All points inside the triangle | Colors are within the target gamut |
| Points outside the triangle | Colors exceed the target gamut (out-of-gamut) |
| Points clustered in one area | Limited color variety in the image |
| Wide spread across the diagram | Rich, diverse color palette |
| Points near the triangle edge | Colors approaching the gamut boundary |

## Gamut Compliance

Use the gamut diagram to verify that an image's colors conform to a delivery specification. For example:

- **sRGB delivery**: All pixels should fall within the sRGB triangle
- **Display P3 mastering**: Pixels may use the wider P3 gamut but should not exceed Rec. 2020
- **HDR content**: Colors may extend to Rec. 2020, with the diagram showing how much of the wider gamut is utilized

Out-of-gamut colors are clipped or compressed during display, depending on the gamut mapping setting (clip or soft compress). The diagram reveals which colors will be affected.

## Practical Uses

- Verify that wide-gamut content is actually utilizing the extended color range
- Identify specific hues that fall outside the target delivery gamut
- Evaluate the effectiveness of gamut mapping settings before final output
- Compare color coverage between different grades or versions of the same shot

---

## Related Pages

- [Vectorscope](vectorscope.md) -- hue and saturation analysis
- [Histogram](histogram.md) -- pixel value distribution
- [Pixel Probe](pixel-probe.md) -- exact color values at a point
