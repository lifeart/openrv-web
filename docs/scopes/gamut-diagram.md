# Gamut Diagram

The gamut diagram displays the CIE 1931 chromaticity diagram with the image's color data plotted on it. Pixel chromaticity coordinates are scattered over the diagram alongside gamut triangles for the current input, working, and display color spaces, giving a visual overview of color coverage.

![CIE gamut diagram scope](/assets/screenshots/38-gamut-diagram.png)

## CIE 1931 Display

The diagram shows the familiar horseshoe-shaped CIE 1931 chromaticity space. Gamut triangles for the input, working, and display color spaces (e.g., sRGB, ACEScg, Display P3, Rec. 2020) are drawn within this space, with their primaries at the vertices and a white-point marker inside each triangle.

The image's pixel colors are plotted as a scatter overlay on the diagram, showing where they fall relative to the three gamut triangles.

## Reading the Diagram

| Observation | Interpretation |
|-------------|---------------|
| Points clustered in one area | Limited color variety in the image |
| Wide spread across the diagram | Rich, diverse color palette |
| Points near a triangle edge | Colors approaching that gamut's boundary |
| Points outside a triangle | Colors that exceed that particular gamut |
| Points inside all three triangles | Colors representable in every configured space |

## Gamut Triangles

The diagram draws up to three gamut triangles, one per configured color space:

- **Input color space** (cyan, dashed) — the gamut of the source media
- **Working color space** (amber, dashed) — the gamut used for internal processing (hidden when it matches the input space)
- **Display color space** (white, solid) — the gamut of the output display (hidden when it matches the input space)

These spaces are set programmatically via `setColorSpaces(input, working, display)`. There is no interactive target-gamut selector or compliance classification; the diagram simply visualizes where the pixel scatter sits relative to each triangle.

## Practical Uses

- Verify that wide-gamut content is actually utilizing the extended color range
- See at a glance which of the three configured gamuts encloses the image's colors
- Compare color coverage between different grades or versions of the same shot
- Identify hues that extend beyond a particular gamut triangle

---

## Related Pages

- [Vectorscope](vectorscope.md) -- hue and saturation analysis
- [Histogram](histogram.md) -- pixel value distribution
- [Pixel Probe](pixel-probe.md) -- exact color values at a point
