# Keyboard Shortcuts

## Original OpenRV Implementation
OpenRV provides over 100 built-in hotkeys for comprehensive keyboard control:

**Navigation Keys**:
- Arrow keys: Frame-by-frame navigation and marked range jumping
- Number keys (1-8): Zoom levels (1:1, fit, etc.)
- Home/End: Jump to start/end
- [ and ]: Set in/out points

**F-Keys**:
- Toggle major interface elements (menu bar, timeline, magnifier, info widgets)

**Playback Control**:
- Space: Play/pause
- J/K/L: Reverse/pause/forward (professional editing standard)
- Various speed controls

**Parameter Editing**:
- Dedicated single-key modes for adjustments:
  - Y: Gamma adjustment
  - K: Contrast adjustment
  - And many more
- Parameter edit mode supports scrubbing, numerical input, increment/decrement, and reset

**Stereo Controls**:
- Alt+S activates stereo-specific hotkey mode

**Customization**:
- Key bindings customizable via ~/.rvrc.mu configuration
- Help menu provides binding documentation
- Hotkey lookup functionality

All major functions are accessible through three locations: menu bar, popup menus, and keyboard shortcuts.

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Requirements
- [x] Standard playback shortcuts (Space, J/K/L)
- [x] Frame navigation (arrow keys)
- [x] Zoom controls (number keys, +/-)
- [x] In/out point setting
- [x] Color adjustment shortcuts
- [x] View switching shortcuts
- [x] Full keyboard accessibility
- [x] Customizable key bindings
- [x] Shortcut reference/help panel
- [x] Modifier key support (Ctrl, Alt, Shift)

## Implementation Summary

The keyboard shortcuts feature is **fully implemented** with a comprehensive centralized keyboard management system.

### Core Components

| Component | File Path | Purpose |
|-----------|-----------|---------|
| KeyboardManager | `/Users/lifeart/Repos/openrv-web/src/utils/KeyboardManager.ts` | Centralized keyboard event handling, modifier support, input field isolation |
| KeyBindings | `/Users/lifeart/Repos/openrv-web/src/utils/KeyBindings.ts` | Default key binding configuration with 60+ shortcuts |
| CustomKeyBindingsManager | `/Users/lifeart/Repos/openrv-web/src/utils/CustomKeyBindingsManager.ts` | User-customizable key bindings with localStorage persistence |

### Implemented Shortcuts

#### Playback Controls
| Action | Shortcut | Description |
|--------|----------|-------------|
| playback.toggle | Space | Toggle play/pause |
| playback.stepForward | ArrowRight | Step forward one frame |
| playback.stepBackward | ArrowLeft | Step backward one frame |
| playback.toggleDirection | ArrowUp | Toggle play direction |
| playback.goToStart | Home | Go to first frame |
| playback.goToEnd | End | Go to last frame |
| playback.slower | J | Decrease playback speed |
| playback.stop | K | Stop playback |
| playback.faster | L | Increase playback speed |

#### Timeline Controls
| Action | Shortcut | Description |
|--------|----------|-------------|
| timeline.setInPoint | I | Set in point |
| timeline.setInPointAlt | [ | Set in point (alternative) |
| timeline.setOutPoint | O | Set out point |
| timeline.setOutPointAlt | ] | Set out point (alternative) |
| timeline.toggleMark | M | Toggle mark at current frame |
| timeline.resetInOut | R | Reset in/out points to full range |
| timeline.cycleLoopMode | Ctrl+L | Cycle loop mode |

#### Tab Navigation
| Action | Shortcut | Description |
|--------|----------|-------------|
| tab.view | 1 | Switch to View tab |
| tab.color | 2 | Switch to Color tab |
| tab.effects | 3 | Switch to Effects tab |
| tab.transform | 4 | Switch to Transform tab |
| tab.annotate | 5 | Switch to Annotate tab |
| tab.qc | 6 | Switch to QC tab |

#### View Controls
| Action | Shortcut | Description |
|--------|----------|-------------|
| view.fitToWindow | F | Fit image to window |
| view.fitToWindowAlt | Shift+F | Fit image to window (alternative) |
| view.zoom50 | 0 | Zoom to 50% (when on View tab) |
| view.cycleWipeMode | Shift+W | Cycle wipe mode |
| view.toggleWaveform | W | Toggle waveform scope |
| view.toggleAB | ` | Toggle A/B source compare |
| view.toggleDifferenceMatte | Shift+D | Toggle difference matte mode |
| view.toggleSplitScreen | Shift+Alt+S | Toggle split screen A/B comparison |

#### Channel Selection
| Action | Shortcut | Description |
|--------|----------|-------------|
| channel.red | Shift+R | Select red channel |
| channel.green | Shift+G | Select green channel |
| channel.blue | Shift+B | Select blue channel |
| channel.alpha | Shift+A | Select alpha channel |
| channel.luminance | Shift+L | Select luminance channel |
| channel.grayscale | Shift+Y | Toggle grayscale mode |
| channel.none | Shift+N | Select no channel (RGB) |

#### Transform Controls
| Action | Shortcut | Description |
|--------|----------|-------------|
| transform.rotateLeft | Shift+R | Rotate left 90 degrees |
| transform.rotateRight | Alt+R | Rotate right 90 degrees |
| transform.flipHorizontal | Alt+H | Flip horizontal |
| transform.flipVertical | Shift+V | Flip vertical |

#### Paint Tools
| Action | Shortcut | Description |
|--------|----------|-------------|
| paint.pan | V | Select pan tool |
| paint.pen | P | Select pen tool |
| paint.eraser | E | Select eraser tool |
| paint.text | T | Select text tool |
| paint.rectangle | R | Select rectangle tool |
| paint.ellipse | O | Select ellipse tool |
| paint.line | L | Select line tool |
| paint.arrow | A | Select arrow tool |
| paint.toggleBrush | B | Toggle brush type |
| paint.toggleGhost | G | Toggle ghost mode |
| paint.toggleHold | X | Toggle hold mode |

#### Export/Edit Controls
| Action | Shortcut | Description |
|--------|----------|-------------|
| export.quickExport | Ctrl+S | Quick export current frame |
| export.copyFrame | Ctrl+C | Copy current frame to clipboard |
| edit.undo | Ctrl+Z | Undo last action |
| edit.redo | Ctrl+Y | Redo last action |

#### Panel Toggles
| Action | Shortcut | Description |
|--------|----------|-------------|
| panel.color | C | Toggle color controls panel |
| panel.effects | Shift+Alt+E | Toggle effects panel |
| panel.curves | U | Toggle curves panel |
| panel.crop | Shift+K | Toggle crop mode |
| panel.histogram | H | Toggle histogram |
| panel.vectorscope | Y | Toggle vectorscope |
| panel.close | Escape | Close open panels |
| panel.history | Shift+Alt+H | Toggle undo/redo history panel |
| panel.snapshots | Ctrl+Shift+Alt+S | Toggle snapshots panel |
| panel.markers | Shift+Alt+M | Toggle markers list panel |
| panel.playlist | Shift+Alt+P | Toggle playlist panel |

#### Advanced View Controls
| Action | Shortcut | Description |
|--------|----------|-------------|
| view.togglePixelProbe | Shift+I | Toggle pixel color probe |
| view.toggleFalseColor | Shift+Alt+F | Toggle false color exposure display |
| view.toggleTimecodeOverlay | Shift+Alt+T | Toggle timecode overlay on viewer |
| view.toggleZebraStripes | Shift+Alt+Z | Toggle zebra stripes exposure warning |
| view.toggleSpotlight | Shift+Q | Toggle spotlight focus tool |
| view.toggleInfoPanel | Shift+Alt+I | Toggle info panel overlay |
| view.toggleGhostFrames | Ctrl+G | Toggle ghost frames (onion skin) |
| view.toggleGuides | ; | Toggle safe areas and guides overlay |

#### Other Controls
| Action | Shortcut | Description |
|--------|----------|-------------|
| stereo.toggle | Shift+3 | Toggle stereo viewing mode |
| color.toggleColorWheels | Shift+Alt+W | Toggle Lift/Gamma/Gain color wheels |
| color.toggleHSLQualifier | Shift+H | Toggle HSL Qualifier |
| annotation.previous | , | Go to previous annotated frame |
| annotation.next | . | Go to next annotated frame |
| snapshot.create | Ctrl+Shift+S | Create quick snapshot |
| theme.cycle | Shift+T | Cycle theme |

## UI/UX Specification

### Keyboard Management Architecture
- **Centralized Registration**: All shortcuts registered through a single KeyboardManager instance
- **Flexible Configuration**: Shortcuts defined in KeyBindings.ts with descriptions
- **Cross-Platform Compatibility**: Meta key (Cmd on macOS) treated as Ctrl automatically
- **Input Field Handling**: Shortcuts disabled in text inputs (text, number, search, password, email, url, tel, textarea, contenteditable)
- **Non-Text Input Support**: Shortcuts work in range/slider inputs, checkboxes, and buttons
- **Runtime Reconfiguration**: Shortcuts can be changed via CustomKeyBindingsManager without code changes
- **LocalStorage Persistence**: Custom key bindings saved to localStorage

### Modal Exception Handling
Modal dialogs have local keyboard handling for Escape/Enter keys, as they are focused, temporary UI elements requiring immediate response.

### Help/Reference
Keyboard shortcuts are documented in UI.md and accessible through the help panel. All bindings include human-readable descriptions.

## Technical Notes

### KeyboardManager Features
1. **Key Combination Support**: Supports single keys and combinations with Ctrl, Shift, Alt, Meta modifiers
2. **Key String Parsing**: Parses strings like "Ctrl+Shift+S" into KeyCombination objects
3. **Unique ID Generation**: Normalizes key combinations for consistent matching
4. **Event Attachment**: Can attach to document or specific elements
5. **Enable/Disable Toggle**: Can temporarily disable all shortcuts
6. **Binding Management**: Register, unregister, clear all, get all bindings

### CustomKeyBindingsManager Features
1. **Default Override**: Allows users to override any default binding
2. **Persistence**: Saves custom bindings to localStorage
3. **Migration Support**: Handles old binding formats gracefully
4. **Change Notifications**: Notifies listeners when bindings change
5. **Reset Capability**: Can reset all custom bindings to defaults
6. **Available Actions Query**: Returns all actions with current effective bindings

### Input Field Isolation
The KeyboardManager implements comprehensive input field detection:
- Text inputs: text, search, password, email, url, tel, number
- Textarea elements
- Contenteditable elements

This ensures users can type in forms without triggering shortcuts.

## E2E Test Cases

File: `/Users/lifeart/Repos/openrv-web/e2e/keyboard-shortcuts.spec.ts`

### Tab Navigation Shortcuts
| Test ID | Description | Status |
|---------|-------------|--------|
| KEYS-001 | 1 key should switch to View tab and show zoom controls | Implemented |
| KEYS-002 | 2 key should switch to Color tab | Implemented |
| KEYS-003 | 3 key should switch to Effects tab | Implemented |
| KEYS-004 | 4 key should switch to Transform tab | Implemented |
| KEYS-005 | 5 key should switch to Annotate tab and show paint tools | Implemented |

### Playback Shortcuts
| Test ID | Description | Status |
|---------|-------------|--------|
| KEYS-010 | Space should toggle play/pause and update isPlaying state | Implemented |
| KEYS-011 | ArrowLeft should step backward and update currentFrame | Implemented |
| KEYS-012 | ArrowRight should step forward and update currentFrame | Implemented |
| KEYS-013 | Home should go to frame 1 | Implemented |
| KEYS-014 | End should go to last frame | Implemented |
| KEYS-015 | ArrowUp should toggle play direction | Implemented |

### View Shortcuts
| Test ID | Description | Status |
|---------|-------------|--------|
| KEYS-020 | F should fit to window and update zoom state | Implemented |
| KEYS-021 | 0 should zoom to 50% | Implemented |
| KEYS-022 | W should cycle wipe mode and update wipeMode state | Implemented |

### Timeline Shortcuts
| Test ID | Description | Status |
|---------|-------------|--------|
| KEYS-030 | I should set in point and update inPoint state | Implemented |
| KEYS-031 | O should set out point and update outPoint state | Implemented |
| KEYS-032 | [ should set in point | Implemented |
| KEYS-033 | ] should set out point | Implemented |
| KEYS-034 | R should reset in/out points to full range | Implemented |
| KEYS-035 | M should toggle mark and update marks array | Implemented |
| KEYS-036 | L should cycle loop mode | Implemented |

### Paint Shortcuts
| Test ID | Description | Status |
|---------|-------------|--------|
| KEYS-040 | V should select pan tool and update currentTool state | Implemented |
| KEYS-041 | P should select pen tool and update currentTool state | Implemented |
| KEYS-042 | E should select eraser tool and update currentTool state | Implemented |
| KEYS-043 | T should select text tool and update currentTool state | Implemented |
| KEYS-044 | B should toggle brush type and update brushType state | Implemented |
| KEYS-045 | G should toggle ghost mode and update ghostMode state | Implemented |
| KEYS-046 | Ctrl+Z should undo and update canUndo/canRedo state | Implemented |
| KEYS-047 | Ctrl+Y should redo and update canUndo/canRedo state | Implemented |

### Color Shortcuts
| Test ID | Description | Status |
|---------|-------------|--------|
| KEYS-050 | C should toggle color panel visibility | Implemented |
| KEYS-051 | Escape should close color panel | Implemented |

### Transform Shortcuts
| Test ID | Description | Status |
|---------|-------------|--------|
| KEYS-060 | Shift+R should rotate left and update rotation state | Implemented |
| KEYS-061 | Alt+R should rotate right and update rotation state | Implemented |
| KEYS-062 | Shift+H should flip horizontal and update flipH state | Implemented |
| KEYS-063 | Shift+V should flip vertical and produce visual change | Implemented |
| KEYS-064 | K should toggle crop mode and update cropEnabled state | Implemented |

### Export Shortcuts
| Test ID | Description | Status |
|---------|-------------|--------|
| KEYS-070 | Ctrl+S should trigger export | Implemented |
| KEYS-071 | Ctrl+C should copy frame (no error) | Implemented |

### Annotation Navigation Shortcuts
| Test ID | Description | Status |
|---------|-------------|--------|
| KEYS-080 | , should go to previous annotation | Implemented |
| KEYS-081 | . should go to next annotation | Implemented |

### Input Focus Handling
| Test ID | Description | Status |
|---------|-------------|--------|
| KEYS-090 | shortcuts should not trigger when typing in text input | Implemented |
| KEYS-091 | global shortcuts should work with range/slider inputs | Implemented |
| KEYS-092 | shortcuts should not trigger when typing in number input | Implemented |
| KEYS-093 | space key should not toggle playback when focused on number input | Implemented |
| KEYS-094 | arrow keys should not navigate frames when in number input | Implemented |
| KEYS-095 | shortcuts work after blurring number input | Implemented |
| KEYS-096 | Home/End keys should not navigate timeline when in number input | Implemented |

## Unit Test Cases

### KeyboardManager Tests
File: `/Users/lifeart/Repos/openrv-web/src/utils/KeyboardManager.test.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| KBM-001 | registers a key combination with handler | Implemented |
| KBM-002 | registers a key string with handler | Implemented |
| KBM-003 | registers binding object directly | Implemented |
| KBM-004 | allows multiple registrations for different combinations | Implemented |
| KBM-005 | overwrites existing binding when registering same combination | Implemented |
| KBM-006 | unregisters a key combination | Implemented |
| KBM-007 | unregisters a key string | Implemented |
| KBM-008 | parses simple key | Implemented |
| KBM-009 | parses Ctrl modifier | Implemented |
| KBM-010 | parses Shift modifier | Implemented |
| KBM-011 | parses Alt modifier | Implemented |
| KBM-012 | parses Meta modifier | Implemented |
| KBM-013 | parses multiple modifiers | Implemented |
| KBM-014 | handles case insensitive modifiers | Implemented |
| KBM-015 | handles alternative modifier names | Implemented |
| KBM-016 | generates unique ID for simple key | Implemented |
| KBM-017 | generates unique ID for modified key | Implemented |
| KBM-018 | generates unique ID for multiple modifiers | Implemented |
| KBM-019 | normalizes key case | Implemented |
| KBM-020 | calls handler when key combination matches | Implemented |
| KBM-021 | does not call handler when key combination does not match | Implemented |
| KBM-022 | skips events when typing in input fields | Implemented |
| KBM-023 | skips all keys in input fields including Escape | Implemented |
| KBM-023b | skips events when typing in contenteditable elements | Implemented |
| KBM-024 | treats meta key as ctrl for cross-platform compatibility | Implemented |
| KBM-025 | disables event handling when set to false | Implemented |
| KBM-026 | re-enables event handling when set to true | Implemented |
| KBM-027 | returns all registered bindings | Implemented |
| KBM-028 | preserves binding descriptions | Implemented |
| KBM-029 | attaches to specified element | Implemented |
| KBM-030 | detaches from specified element | Implemented |
| KBM-031 | attaches to document by default | Implemented |
| KBM-032 | detaches from document by default | Implemented |
| KBM-033 | handles empty key string gracefully | Implemented |
| KBM-034 | handles key with no modifiers | Implemented |
| KBM-035 | handles special keys | Implemented |
| KBM-036 | normalizes modifier order | Implemented |
| KBM-037 | clears all registered bindings | Implemented |
| KBM-038 | Space key triggers playback toggle | Implemented |
| KBM-039 | Arrow keys trigger step navigation | Implemented |
| KBM-040 | Home and End keys trigger go to start/end | Implemented |
| KBM-041 | playback controls work when disabled then re-enabled | Implemented |
| KBM-042 | playback keys are skipped in input fields to allow text editing | Implemented |
| KBM-043 | ArrowUp toggles play direction | Implemented |
| KBM-044 | comboToId throws error for undefined code | Implemented |
| KBM-045 | comboToId throws error for empty code | Implemented |
| KBM-050 | skips events when typing in number input | Implemented |
| KBM-051 | skips events when typing in search input | Implemented |
| KBM-052 | skips events when typing in password input | Implemented |
| KBM-053 | skips events when typing in email input | Implemented |
| KBM-054 | skips events when typing in url input | Implemented |
| KBM-055 | skips events when typing in tel input | Implemented |
| KBM-056 | skips events when typing in textarea | Implemented |
| KBM-057 | allows shortcuts on checkbox input | Implemented |
| KBM-058 | allows shortcuts on range input (slider) | Implemented |
| KBM-059 | Space key does not toggle playback in number input | Implemented |
| KBM-060 | number keys do not switch tabs in number input | Implemented |
| KBM-061 | arrow keys do not navigate frames in number input | Implemented |
| KBM-062 | Home/End keys do not navigate timeline in number input | Implemented |
| KBM-063 | allows shortcuts on button elements | Implemented |
| KBM-064 | allows shortcuts on div elements | Implemented |

### KeyBindings Tests
File: `/Users/lifeart/Repos/openrv-web/src/utils/KeyBindings.test.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| KB-U001 | defines playback.toggle binding | Implemented |
| KB-U002 | defines playback.stepForward binding | Implemented |
| KB-U003 | defines playback.stepBackward binding | Implemented |
| KB-U004 | defines JKL speed controls | Implemented |
| KB-U005 | defines timeline.setInPoint binding | Implemented |
| KB-U006 | defines timeline.setOutPoint binding | Implemented |
| KB-U007 | defines view.fitToWindow binding | Implemented |
| KB-U008 | defines edit.undo with ctrl modifier | Implemented |
| KB-U009 | defines edit.redo with ctrl modifier | Implemented |
| KB-U010 | defines tab navigation bindings | Implemented |
| KB-U011 | defines paint tool bindings | Implemented |
| KB-U012 | defines channel selection bindings with shift | Implemented |
| KB-U013 | all bindings have descriptions | Implemented |
| KB-U014 | all bindings have code property | Implemented |
| KB-U015 | defines export bindings | Implemented |
| KB-U016 | defines panel toggles | Implemented |
| KB-U017 | defines transform bindings | Implemented |
| KB-U018 | defines annotation navigation | Implemented |
| KB-U019 | defines view toggles with multiple modifiers | Implemented |
| KB-U020 | defines panel.close with Escape | Implemented |
| KB-U030-047 | describeKeyCombo function tests | Implemented |
| KB-U050-059 | binding categories tests | Implemented |
| KB-U060-066 | specific bindings validation | Implemented |

### CustomKeyBindingsManager Tests
File: `/Users/lifeart/Repos/openrv-web/src/utils/CustomKeyBindingsManager.test.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| CKBM-001 | initializes with empty custom bindings | Implemented |
| CKBM-002 | loads custom bindings from localStorage | Implemented |
| CKBM-003 | sets custom binding for valid action | Implemented |
| CKBM-004 | throws error for invalid action | Implemented |
| CKBM-005 | removes custom binding | Implemented |
| CKBM-006 | resets all custom bindings | Implemented |
| CKBM-007 | saves custom bindings to localStorage | Implemented |
| CKBM-008 | loads custom bindings from localStorage on initialization | Implemented |
| CKBM-009 | handles corrupted localStorage data gracefully | Implemented |
| CKBM-010 | notifies when custom bindings are applied | Implemented |
| CKBM-011 | notifies when custom binding is removed | Implemented |
| CKBM-012 | returns all available actions with descriptions | Implemented |
| CKBM-013 | shows custom combo as current when set | Implemented |

## Test Coverage Summary

| Test Category | File | Tests |
|---------------|------|-------|
| E2E Tests | keyboard-shortcuts.spec.ts | 35 tests |
| Unit Tests - KeyboardManager | KeyboardManager.test.ts | 64 tests |
| Unit Tests - KeyBindings | KeyBindings.test.ts | 46 tests |
| Unit Tests - CustomKeyBindingsManager | CustomKeyBindingsManager.test.ts | 13 tests |
| **Total** | | **158 tests** |
