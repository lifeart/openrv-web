# Blend Modes

Blend modes provide additional methods for comparing sources A and B by combining them in the viewer. Three blend modes are available: onion skin, flicker, and blend.

![Blend modes and onion skin](/assets/screenshots/37-blend-modes.png)

## Onion Skin

Onion skin overlays source B on top of source A with adjustable opacity. At 0% opacity, only source A is visible. At 100%, only source B is visible. At 50%, both sources are equally blended.

### Controls

- **Toggle**: Click the "Onion Skin" button in the Blend Modes section of the Compare dropdown
- **Opacity slider**: Drag to adjust the blend (0--100%)

Onion skin is useful for aligning elements between two versions or checking that a composite matches a reference.

## Flicker

Flicker mode alternates the display between source A and source B at a configurable rate. The rapid switching makes differences between the two sources immediately apparent -- changed areas appear to flicker while unchanged areas remain stable.

### Controls

- **Toggle**: Click the "Flicker" button in the Compare dropdown
- **Rate slider**: Drag to set the alternation rate (1--30 Hz)

A rate of 2--5 Hz is typically effective for spotting changes. Higher rates produce a more continuous blended appearance.

The flicker implementation uses `setInterval` to alternate a frame flag (0 or 1), triggering re-renders at the configured rate. The interval is cleaned up when the mode changes or the component disposes.

## Blend

Blend mode mixes sources A and B with an adjustable ratio. At 0%, the viewer shows source A exclusively. At 100%, it shows source B. At 50%, each source contributes equally.

### Controls

- **Toggle**: Click the "Blend" button in the Compare dropdown
- **A/B ratio slider**: Drag to adjust the mix (0--100%)

Blend mode is similar to onion skin but provides a linear mix rather than an alpha overlay, which can produce different visual results depending on the source content.

## Mutual Exclusivity

Only one blend mode can be active at a time. Enabling onion skin disables flicker and blend. Enabling any blend mode also disables wipe mode, split screen, and difference matte.

This mutual exclusivity prevents conflicting visualizations. The Compare dropdown clearly indicates which mode is active with accent-color highlighting.

## Practical Tips

- **Flicker at 4 Hz** is a common choice for change detection -- slow enough to see each frame but fast enough to make differences pop
- **Onion skin at 50%** provides a balanced overlay for registration checks
- **Blend ratio sweep** -- drag the blend slider back and forth to smoothly reveal and hide changes

---

## Related Pages

- [A/B Switching](ab-switching.md) -- load two sources for comparison
- [Difference Matte](difference-matte.md) -- pixel-level difference visualization
- [Split Screen](split-screen.md) -- side-by-side display
