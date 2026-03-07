# Screenshot Automation

Playwright-based screenshot pipeline for generating documentation-quality images of OpenRV Web's UI.

## Running

```bash
# Generate all screenshots
pnpm screenshots

# Update snapshot baselines (if using visual comparison)
pnpm screenshots:update

# List available screenshot tests without running them
pnpm screenshots -- --list
```

## Output

Screenshots are saved to `docs/assets/screenshots/` as PNG files.

## Naming Convention

Each screenshot follows the pattern:

```
<NN>-<kebab-name>.png
```

- `NN` is a two-digit number for ordering.
- `<kebab-name>` is a short descriptive name in kebab-case.

### Category Ranges

| Range | Category | Spec file |
|-------|----------|-----------|
| 01-10 | Core UI | `core-ui.screenshot.ts` |
| 11-17 | Scopes & Analysis | `scopes.screenshot.ts` |
| 18-25 | Features | `features.screenshot.ts` |

## Adding New Screenshots

1. Choose the next available number in the appropriate category range.
2. Add a new `test('NN-name', ...)` block in the corresponding spec file.
3. Use the helpers from `screenshot-helpers.ts`:
   - `initApp(page)` -- navigate and wait for the app
   - `initWithVideo(page)` -- navigate, load sample video, wait for canvas
   - `switchTab(page, tabId)` -- switch to a toolbar tab
   - `takeDocScreenshot(page, name)` -- save screenshot to output dir
   - `takeElementScreenshot(page, name, selector)` -- screenshot a specific element
   - `waitForCanvasStable(page)` -- wait for canvas to stop changing
4. Run `pnpm screenshots` to generate the new image.

## Architecture

- **`screenshot-helpers.ts`** -- shared helpers for init, navigation, and capture
- **`core-ui.screenshot.ts`** -- empty state, loaded video, header, tabs, color panel, timeline
- **`scopes.screenshot.ts`** -- histogram, waveform, vectorscope, parade, pixel probe, false color
- **`features.screenshot.ts`** -- channels, A/B compare, annotations, shortcuts, EXR, curves, zebra, safe areas

## CI Notes

The `screenshots` project is configured in `playwright.config.ts` with:
- Fixed viewport: 1440x900
- Dark color scheme
- No retries (screenshots must be deterministic)

SwiftShader (software GL) on CI runners produces visually different output from hardware GPU rendering. For documentation-quality screenshots, prefer running on a machine with hardware-accelerated graphics.
