# Keyboard Shortcuts Reference

This page lists all keyboard shortcuts available in OpenRV Web. Shortcuts are organized by category. On macOS, the `Ctrl` key maps to `Cmd` automatically.

For the auto-generated shortcut data, see [docs/generated/keyboard-shortcuts.md](../generated/keyboard-shortcuts.md) if available.

## Playback

| Shortcut | Action |
|----------|--------|
| `Space` | Play / Pause |
| `Left Arrow` | Step one frame backward |
| `Right Arrow` | Step one frame forward |
| `Up Arrow` | Toggle playback direction (forward/reverse) |
| `Home` | Go to first frame (or in point) |
| `End` | Go to last frame (or out point) |
| `J` | Decrease playback speed (previous preset) |
| `K` | Pause playback |
| `L` | Increase playback speed (next preset) |

## View and Navigation

| Shortcut | Action |
|----------|--------|
| `F` | Fit image to window |
| `Shift+F` | Fit image to window (alternative) |
| `=` | Zoom in |
| `-` | Zoom out |
| `Shift+=` | Fine zoom in |
| `Shift+-` | Fine zoom out |
| `0` | Set zoom to 50% |
| `1` | Switch to View tab |
| `2` | Switch to Color tab |
| `3` | Switch to Effects tab |
| `4` | Switch to Transform tab |
| `5` | Switch to Annotate tab |
| `6` | Switch to QC tab |
| `F11` | Toggle fullscreen mode |
| `Ctrl+Shift+P` | Toggle presentation mode (clean display, cursor auto-hide) |
| `Shift+B` | Cycle background pattern (checkerboard, grey, white, black, etc.) |
| `Shift+Alt+B` | Toggle checkerboard background |
| `Shift+P` | Toggle pixel aspect ratio correction |

## Timeline

| Shortcut | Action |
|----------|--------|
| `I` | Set in point |
| `[` | Set in point (alternative) |
| `O` | Set out point |
| `]` | Set out point (alternative) |
| `R` | Reset in/out points to full range |
| `M` | Toggle marker at current frame |
| `Ctrl+L` | Cycle loop mode (once / loop / ping-pong) |
| `Shift+Down` | Shift in/out range to next mark pair |
| `Shift+Up` | Shift in/out range to previous mark pair |
| `Ctrl+Right` | Shift in/out range to next mark pair (alternative) |
| `Ctrl+Left` | Shift in/out range to previous mark pair (alternative) |

## A/B Compare

| Shortcut | Action |
|----------|--------|
| `` ` `` (backtick) | Toggle between A/B sources |
| `~` (tilde) | Toggle between A/B sources |
| `Shift+W` | Cycle wipe mode (off / horizontal / vertical) |
| `Shift+Alt+S` | Toggle split screen (off / horizontal / vertical) |
| `Shift+D` | Toggle difference matte |

## Scopes

| Shortcut | Action |
|----------|--------|
| `H` | Toggle histogram |
| `W` | Toggle waveform monitor |
| `Y` | Toggle vectorscope |
| `Shift+I` | Toggle pixel probe |

## Exposure and Analysis

| Shortcut | Action |
|----------|--------|
| `Shift+Alt+F` | Toggle false color display |
| `Shift+Alt+Z` | Toggle zebra stripes |
| `;` | Toggle safe areas and guides overlay |
| `Shift+Alt+T` | Toggle timecode overlay |
| `Shift+Alt+I` | Toggle info panel |

## Stereo 3D

| Shortcut | Action |
|----------|--------|
| `Shift+3` | Cycle stereo modes (off / SBS / over-under / mirror / anaglyph / etc.) |

## Channel View

| Shortcut | Action |
|----------|--------|
| `Shift+R` | Red channel only |
| `Shift+G` | Green channel only |
| `Shift+B` | Blue channel only |
| `Shift+A` | Alpha channel only |
| `Shift+L` | Luminance / Grayscale |
| `Shift+Y` | Grayscale (alias for Shift+L) |
| `Shift+N` | Normal RGB (all channels) |

## Color and Effects

| Shortcut | Action |
|----------|--------|
| `C` | Toggle color panel |
| `U` | Toggle curves panel |
| `Shift+O` | Toggle OCIO color management panel |
| `Shift+Alt+W` | Toggle color wheels (Lift/Gamma/Gain) |
| `Shift+H` | Toggle HSL Qualifier |
| `Shift+Alt+J` | Toggle tone mapping |
| `Shift+Alt+E` | Toggle effects/filter panel |

## Transform

| Shortcut | Action |
|----------|--------|
| `Shift+R` | Rotate left 90 degrees |
| `Alt+R` | Rotate right 90 degrees |
| `Alt+H` | Flip horizontal |
| `Shift+V` | Flip vertical |
| `Shift+K` | Toggle crop mode |

## Annotations

| Shortcut | Action |
|----------|--------|
| `V` | Pan tool (no drawing) |
| `P` | Pen tool |
| `E` | Eraser tool |
| `T` | Text tool |
| `R` | Rectangle tool |
| `O` | Ellipse tool |
| `L` | Line tool |
| `A` | Arrow tool |
| `B` | Toggle brush type (soft/hard) |
| `G` | Toggle ghost mode |
| `Shift+G` | Toggle ghost frames (onion skin) |
| `Ctrl+G` | Toggle ghost frames (alternative) |
| `X` | Toggle hold mode (persist annotations across frames) |
| `Shift+Q` | Toggle spotlight |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `,` | Jump to previous annotated frame |
| `.` | Jump to next annotated frame |

## Panels

| Shortcut | Action |
|----------|--------|
| `Escape` | Close open panel |
| `Shift+T` | Cycle theme (auto / dark / light) |
| `Shift+Alt+H` | Toggle history panel |
| `Shift+Alt+M` | Toggle markers panel |
| `Shift+N` | Toggle network sync panel |
| `Shift+Alt+P` | Toggle playlist panel |
| `Ctrl+Shift+S` | Create quick snapshot |
| `Ctrl+Shift+Alt+S` | Toggle snapshots panel |

## Export

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Export current frame |
| `Ctrl+C` | Copy current frame to clipboard |

## Mouse Controls

| Action | Mouse Gesture |
|--------|---------------|
| Zoom in/out | Scroll wheel |
| Pan image | Click and drag |
| Seek to frame | Click on timeline |
| Scrub frames | Drag on timeline |
| Pinch zoom | Two-finger pinch (trackpad/touch) |

## Customizing Shortcuts

OpenRV Web supports customizable key bindings through the `CustomKeyBindingsManager`. Custom bindings are stored in the browser's localStorage and persist across sessions.

### Customization Features

- **Override any default binding** -- reassign any shortcut to a different key combination
- **Conflict detection** -- warns if a new binding conflicts with an existing one
- **Export/Import** -- save and restore custom bindings
- **Reset** -- return all bindings to defaults

### Input Field Handling

Keyboard shortcuts are automatically disabled when typing in text inputs, number inputs, search fields, password fields, textareas, and contenteditable elements. This prevents shortcuts from interfering with text entry.

Shortcuts remain active when focused on non-text controls such as sliders, checkboxes, and buttons.

---

## Related Pages

- [Quick Start](../getting-started/quick-start.md) -- essential shortcuts for new users
- [UI Overview](../getting-started/ui-overview.md) -- interface layout and tab system
- [J/K/L Navigation](../playback/jkl-navigation.md) -- detailed speed control guide
