# OpenRV Web - UI Redesign Plan

## Current State Analysis

### Problems Identified

1. **Toolbar Overflow**: 12+ control groups in a single horizontal row
2. **No Logical Grouping**: Related tools scattered across toolbar
3. **Inconsistent Panel Behavior**: Each control opens its own dropdown panel
4. **Visual Clutter**: Too many buttons competing for attention
5. **Poor Discoverability**: Advanced features hidden behind individual buttons
6. **Inefficient Workflow**: Frequent panel opening/closing disrupts work

### Current Toolbar Order (Left to Right)
```
[Toolbar] [PaintToolbar] [ColorControls] [CDLControl] [FilterControl]
[CropControl] [LensControl] [StackControl] [CompareControl] [TransformControl]
[VolumeControl] [ExportControl]
```
*Note: WipeControl has been merged into CompareControl along with A/B comparison.*

---

## Proposed UI Architecture

### Design Principles
- **Industry Standard**: Match DaVinci Resolve, Nuke, RV style
- **Contextual Grouping**: Related tools together
- **Progressive Disclosure**: Simple → Advanced
- **Keyboard-First**: Power users rely on shortcuts
- **Minimal Clicks**: Common actions always visible

### New Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│ HEADER BAR (40px)                                                       │
│ [📂 Open] [💾 Export▾]  │  [◀◀][◀][▶/⏸][▶][▶▶] [🔁]  │  [🔊▁▁▁] [⌨ ?] │
├─────────────────────────────────────────────────────────────────────────┤
│ TOOL TABS (36px)                                                        │
│ [ 🖼 View ][ 🎨 Color ][ ✨ Effects ][ 📐 Transform ][ ✏️ Annotate ]     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                           VIEWER AREA                                   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ CONTEXT TOOLBAR (44px) - Changes based on active tab                    │
│ Example for "Color" tab:                                                │
│ [Exposure ▁▁▁▁] [Contrast ▁▁▁▁] [Saturation ▁▁▁▁] │ [🎬CDL] [📊LUT] │ │
├─────────────────────────────────────────────────────────────────────────┤
│ TIMELINE (80px)                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tab Organization

### Tab 1: 🖼 View (Default)
**Purpose**: Navigation and comparison tools

**Context Toolbar Contents** (Reorganized with dropdown menus):
- **Zoom dropdown**: Fit, 25%, 50%, 100%, 200%, 400%
- **Channel dropdown**: RGB, Red, Green, Blue, Alpha, Luma
- **Compare dropdown**: Wipe (Off/H-Wipe/V-Wipe), A/B source toggle
- **Stereo dropdown**: Off, Side-by-Side, Over-Under, Mirror, Anaglyph, etc.
- **Scopes dropdown**: Histogram, Waveform, Vectorscope toggles
- **Stack button**: Opens layer panel

**Reduction**: From ~23 visible elements to 6 compact dropdowns

### Tab 2: 🎨 Color
**Purpose**: All color grading tools

**Context Toolbar Contents**:
- Quick sliders: Exposure, Contrast, Saturation (inline)
- Panel toggles: [🎬 CDL] [📊 LUT] [🌡 Advanced]
- Reset button
- Before/After toggle (uses wipe)

**Sub-panels**:
- **CDL Panel**: Slope/Offset/Power/Sat with RGB channels
- **LUT Panel**: Load, intensity, active LUT display
- **Advanced Panel**: Gamma, Temperature, Tint, Brightness

### Tab 3: ✨ Effects
**Purpose**: Image processing effects

**Context Toolbar Contents**:
- Filter sliders: Blur, Sharpen (inline)
- Lens Distortion button (opens panel)
- Reset button

### Tab 4: 📐 Transform
**Purpose**: Geometric transformations

**Context Toolbar Contents**:
- Rotate: [↺ -90°] [↻ +90°]
- Flip: [⇆ H] [⇅ V]
- Crop toggle + aspect ratio dropdown
- Reset button

### Tab 5: ✏️ Annotate
**Purpose**: Drawing and annotation tools

**Context Toolbar Contents**:
- Tools: [🖐 Pan] [✏️ Pen] [🧹 Eraser] [T Text]
- Brush: Size slider, Color picker, Presets
- Actions: [↩️ Undo] [↪️ Redo] [🗑 Clear]
- Ghost mode toggle

---

## Implementation Plan

### Phase 1: Header Bar Consolidation ✅
- [x] Create `HeaderBar.ts` component
- [x] Move file operations (Open, Export dropdown)
- [x] Move playback controls
- [x] Move volume control
- [x] Move help button
- [x] Style: 40px height, clean separation

### Phase 2: Tab System ✅
- [x] Create `TabBar.ts` component
- [x] Create `ContextToolbar.ts` component
- [x] Implement tab switching logic
- [x] Store active tab in App state
- [x] Style: 36px tabs, active indicator

### Phase 3: View Tab ✅
- [x] Move zoom controls to context toolbar
- [x] Move wipe control
- [x] Add stack button (opens side panel)
- [x] Add resolution/fps display

### Phase 4: Color Tab ✅
- [x] Create inline exposure/contrast/saturation sliders
- [x] Consolidate CDL and LUT as panel toggles
- [x] Create "Advanced" panel for secondary adjustments
- [x] Add reset and before/after buttons

### Phase 5: Effects Tab ✅
- [x] Move blur/sharpen to inline sliders
- [x] Keep lens distortion as panel button
- [x] Add global reset

### Phase 6: Transform Tab ✅
- [x] Redesign rotation buttons with degrees
- [x] Improve flip button states
- [x] Integrate crop control inline
- [x] Add reset button

### Phase 7: Annotate Tab ✅
- [x] Reorganize paint toolbar layout
- [x] Move ghost mode to context toolbar
- [x] Improve color picker UX
- [x] Add brush preview

### Phase 8: Polish & Consistency ✅
- [x] Unify all button styles
- [x] Consistent panel shadows and borders
- [x] Smooth tab transitions
- [x] Keyboard navigation for tabs (1-5)
- [x] Update all keyboard shortcuts help

---

## Style Guide

### Colors
```css
--bg-darkest: #1a1a1a;
--bg-dark: #222;
--bg-medium: #2a2a2a;
--bg-light: #333;
--bg-lighter: #3a3a3a;

--border-dark: #333;
--border-medium: #444;
--border-light: #555;

--text-primary: #e0e0e0;
--text-secondary: #aaa;
--text-muted: #666;

--accent-primary: #4a9eff;
--accent-hover: #5aafff;
--accent-active: #3a8eef;

--danger: #ff6b6b;
--success: #6bff6b;
--warning: #ffbb33;
```

### Spacing
```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 24px;
```

### Typography
```css
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'SF Mono', 'Fira Code', monospace;

--text-xs: 10px;
--text-sm: 11px;
--text-base: 12px;
--text-lg: 13px;
--text-xl: 14px;
```

### Component Dimensions
```css
--header-height: 40px;
--tab-bar-height: 36px;
--context-toolbar-height: 44px;
--timeline-height: 80px;

--button-sm: 24px;
--button-md: 32px;
--button-lg: 40px;

--panel-width-sm: 200px;
--panel-width-md: 280px;
--panel-width-lg: 360px;
```

### Button Styles
```css
/* Default Button */
.btn {
  background: var(--bg-light);
  border: 1px solid var(--border-medium);
  color: var(--text-primary);
  border-radius: 4px;
  transition: all 0.15s ease;
}

.btn:hover {
  background: var(--bg-lighter);
  border-color: var(--border-light);
}

/* Active/Selected Button */
.btn-active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

/* Icon Button (square) */
.btn-icon {
  width: var(--button-md);
  height: var(--button-md);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

---

## Keyboard Shortcuts (Updated)

### Keyboard Management System

The application uses a centralized `KeyboardManager` class for all keyboard shortcuts:

- **Centralized Registration**: All shortcuts registered through a single manager instance
- **Flexible Configuration**: Shortcuts defined in `KeyBindings.ts` with descriptions
- **Cross-Platform Compatibility**: Meta key (Cmd) treated as Ctrl automatically
- **Input Field Handling**: Shortcuts disabled in text inputs (except global keys)
- **Runtime Reconfiguration**: Shortcuts can be changed without code changes

**Modal Exceptions**: Modal dialogs have local keyboard handling for Escape/Enter keys, as they are focused, temporary UI elements requiring immediate response.

```typescript
// Example usage in App.ts
this.keyboardManager.register(DEFAULT_KEY_BINDINGS['playback.toggle'], () => {
  this.session.togglePlayback();
});
```

### Tab Navigation
- `1` - View tab
- `2` - Color tab
- `3` - Effects tab
- `4` - Transform tab
- `5` - Annotate tab

### Global (Always Available)
- `Space` - Play/Pause
- `←/→` - Step frame
- `Home/End` - Go to start/end
- `[/]` or `I/O` - Set in/out points
- `F` - Fit to window
- `Ctrl+S` - Quick export PNG
- `Ctrl+C` - Copy to clipboard
- `Ctrl+Z/Y` - Undo/Redo

### View Tab
- `F` - Fit to window
- `W` - Cycle wipe mode (off → horizontal → vertical)
- `H` - Toggle histogram
- `w` - Toggle waveform (lowercase)
- `y` - Toggle vectorscope
- `\`` - Toggle A/B source
- `Shift+R/G/B/A/L/N` - Channel isolation (Red/Green/Blue/Alpha/Luma/Normal)
- `Shift+3` - Cycle stereo mode

### Color Tab
- `C` - Toggle color panel
- `Ctrl+R` - Reset color

### Transform Tab
- `Shift+R` - Rotate left
- `Alt+R` - Rotate right
- `Shift+H` - Flip horizontal
- `Shift+V` - Flip vertical
- `K` - Toggle crop

### Annotate Tab
- `P` - Pen tool
- `E` - Eraser
- `V` - Pan/Select
- `G` - Toggle ghost mode

---

## Progress Tracking

### Phase 1: Header Bar ✅
- [x] HeaderBar.ts component
- [x] File operations group
- [x] Playback controls group
- [x] Utility controls group
- [x] Integration with App.ts

### Phase 2: Tab System ✅
- [x] TabBar.ts component
- [x] ContextToolbar.ts component
- [x] Tab state management
- [x] Tab switching animations

### Phase 3: View Tab ✅
- [x] ViewContextToolbar.ts
- [x] Zoom controls
- [x] Wipe controls
- [x] Stack side panel trigger

### Phase 4: Color Tab ✅
- [x] ColorContextToolbar.ts
- [x] Inline sliders
- [x] Panel consolidation
- [x] Before/After toggle

### Phase 5: Effects Tab ✅
- [x] EffectsContextToolbar.ts
- [x] Inline filter sliders
- [x] Lens panel button

### Phase 6: Transform Tab ✅
- [x] TransformContextToolbar.ts
- [x] Rotation controls
- [x] Flip controls
- [x] Crop integration

### Phase 7: Annotate Tab ✅
- [x] AnnotateContextToolbar.ts
- [x] Tool buttons
- [x] Brush controls
- [x] Action buttons

### Phase 8: Polish ✅
- [x] Keyboard nav (1-5 for tabs)
- [x] Help updates
- [x] Style unification (consistent button styles, dividers)
- [x] Smooth tab transitions (CSS transitions)

### Phase 9: Design Consistency Pass ✅
- [x] SVG icon system replacing all emojis
- [x] Flat design pattern for all buttons
- [x] Container styling unification (no boxed appearances)
- [x] Divider standardization (1-2 per section)

---

## File Structure (New)

```
src/ui/
├── components/
│   ├── layout/
│   │   ├── HeaderBar.ts        # Top bar with file/playback/utils
│   │   ├── TabBar.ts           # Tab navigation
│   │   ├── ContextToolbar.ts   # Base context toolbar
│   │   └── SidePanel.ts        # Slide-out panel container
│   ├── ZoomControl.ts          # Zoom level dropdown (View tab)
│   ├── ChannelSelect.ts        # Channel isolation dropdown (View tab)
│   ├── CompareControl.ts       # Wipe + A/B comparison dropdown (View tab)
│   ├── ScopesControl.ts        # Histogram/Waveform/Vectorscope dropdown (View tab)
│   ├── StereoControl.ts        # Stereo viewing mode dropdown (View tab)
│   ├── StackControl.ts         # Layer stack panel button (View tab)
│   ├── panels/
│   │   ├── CDLPanel.ts         # CDL controls (refactored)
│   │   ├── LUTPanel.ts         # LUT controls (extracted)
│   │   ├── LensPanel.ts        # Lens controls (refactored)
│   │   └── StackPanel.ts       # Stack/layers (refactored)
│   ├── controls/
│   │   ├── InlineSlider.ts     # Reusable inline slider
│   │   ├── IconButton.ts       # Reusable icon button
│   │   ├── DropdownMenu.ts     # Reusable dropdown
│   │   └── ToggleGroup.ts      # Reusable toggle group
│   └── ... (existing)
```

---

## Mockup Reference

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📂 Open  💾 Export▾  │  ⏮ ⏪ ▶ ⏩ ⏭  🔁 Loop  │  🔊━━━━  ⌨ Help           │
├──────────────────────────────────────────────────────────────────────────────┤
│  🖼 View    🎨 Color    ✨ Effects    📐 Transform    ✏️ Annotate           │
│ ━━━━━━━━                                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                                                                              │
│                              [VIEWER]                                        │
│                                                                              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  Exposure ━━●━━  Contrast ━━━●━  Saturation ━●━━━  │  🎬 CDL  📊 LUT  ⟲     │
├──────────────────────────────────────────────────────────────────────────────┤
│  ▼ Timeline with waveform and markers                                   ▼   │
│  [1━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━100]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Shared Components

### Button Component (`src/ui/components/shared/Button.ts`)

Unified button component for consistent styling across the application.

```typescript
import { createButton, createIconButton, setButtonActive } from './shared/Button';

// Text button
const btn = createButton('Save', () => handleSave(), {
  variant: 'primary',  // 'default' | 'primary' | 'danger' | 'ghost' | 'icon'
  size: 'md',          // 'sm' | 'md' | 'lg'
  active: false,
  disabled: false,
  title: 'Save file',
  minWidth: '80px'
});

// Icon button
const iconBtn = createIconButton('<svg>...</svg>', () => handleClick(), {
  variant: 'ghost',
  size: 'sm',
  title: 'Settings'
});

// Update active state
setButtonActive(btn, true, 'default');
```

### Modal Component (`src/ui/components/shared/Modal.ts`)

Native modal dialogs replacing browser alerts/confirms/prompts.

```typescript
import { showAlert, showConfirm, showPrompt, showModal, closeModal } from './shared/Modal';

// Alert (replaces window.alert)
await showAlert('Operation completed', {
  title: 'Success',
  type: 'success'  // 'info' | 'success' | 'warning' | 'error'
});

// Confirm (replaces window.confirm)
const confirmed = await showConfirm('Delete this item?', {
  title: 'Confirm Delete',
  confirmText: 'Delete',
  cancelText: 'Cancel',
  confirmVariant: 'danger'
});

// Prompt (replaces window.prompt)
const value = await showPrompt('Enter name:', {
  title: 'Rename',
  placeholder: 'New name',
  defaultValue: 'Untitled'
});

// Custom modal
const { close } = showModal(contentElement, {
  title: 'Custom Dialog',
  width: '500px',
  closable: true
});
```

### Panel Component (`src/ui/components/shared/Panel.ts`)

Reusable dropdown panel utility for consistent panel styling.

```typescript
import { createPanel, createPanelHeader, createSliderRow } from './shared/Panel';

const panel = createPanel({ width: '280px' });
const header = createPanelHeader('Settings', () => panel.hide());
const slider = createSliderRow('Volume', {
  min: 0, max: 100, step: 1, value: 50,
  onChange: (v) => setVolume(v)
});

panel.element.appendChild(header);
panel.element.appendChild(slider.container);
panel.show(anchorElement);
```

### DraggableContainer Component (`src/ui/components/shared/DraggableContainer.ts`)

Unified draggable overlay container for scopes and floating panels. Used by Histogram, Waveform, and Vectorscope.

**Features:**
- Draggable by header (click and drag to reposition)
- Consistent styling for all scope overlays
- Position management with bounds checking
- Close button integration
- Configurable controls slot for custom buttons

```typescript
import {
  createDraggableContainer,
  createControlButton,
  DraggableContainer
} from './shared/DraggableContainer';

// Create a draggable container
const container = createDraggableContainer({
  id: 'my-scope',              // Used for class names and test IDs
  title: 'My Scope',           // Displayed in header
  initialPosition: {           // Starting position (CSS values)
    top: '10px',
    right: '10px'
  },
  zIndex: 100,                 // Optional, defaults to 100
  onClose: () => hide(),       // Called when close button clicked
});

// Add custom control buttons
const modeButton = createControlButton('RGB', 'Toggle mode');
modeButton.addEventListener('click', () => cycleMode());
const closeButton = container.controls.querySelector('[data-testid="my-scope-close-button"]');
container.controls.insertBefore(modeButton, closeButton);

// Add content (e.g., canvas)
const canvas = document.createElement('canvas');
container.content.appendChild(canvas);

// Add optional footer
const footer = document.createElement('div');
footer.innerHTML = '<span>0</span><span>128</span><span>255</span>';
container.setFooter(footer);

// Show/hide
container.show();
container.hide();

// Position management
const pos = container.getPosition();  // { x: number, y: number }
container.setPosition(100, 50);       // Move to specific position
container.resetPosition();            // Reset to initial position

// Render to DOM
viewerElement.appendChild(container.element);

// Cleanup
container.dispose();
```

**Test IDs Generated:**
- `{id}-container` - Main container element
- `{id}-header` - Draggable header element
- `{id}-close-button` - Close button

**Styling:**
- Semi-transparent black background (`rgba(0, 0, 0, 0.8)`)
- 1px border (`#333`)
- 4px border radius
- 8px padding
- `z-index: 100` (or custom)
- Cursor changes to `grab` on header, `grabbing` while dragging

**Components using DraggableContainer:**
- `Histogram` (`src/ui/components/Histogram.ts`) - Real-time histogram display
- `Waveform` (`src/ui/components/Waveform.ts`) - Waveform monitor
- `Vectorscope` (`src/ui/components/Vectorscope.ts`) - Color vectorscope with auto-fit zoom
- `CurvesControl` (`src/ui/components/CurvesControl.ts`) - Color curves editor panel

All these components support:
- Dragging by header to reposition
- Position management: `getPosition()`, `setPosition(x, y)`, `resetPosition()`
- Close button in header
- Show/hide with `show()`, `hide()`, `toggle()`, `isVisible()`

**Vectorscope Auto-Fit Zoom:**
The vectorscope includes an auto-fit zoom feature that analyzes the chrominance distribution and automatically selects the optimal zoom level (1x, 2x, or 4x). This is the default mode.

- **Auto mode (default)**: Analyzes image saturation and selects appropriate zoom
  - 4x for very low saturation content (< 0.10 chrominance)
  - 2x for low saturation content (< 0.20 chrominance)
  - 1x for normal/high saturation content
- **Manual modes**: 1x, 2x, 4x fixed zoom levels
- **Cycle order**: Auto → 1x → 2x → 4x → Auto
- **Button display**: Shows "A:Nx" in auto mode (e.g., "A:2x"), "Nx" in manual mode

---

## No Emojis Policy

**Never use emojis in UI components.** Use SVG icons from the centralized icon system instead.

**Why:**
- Emojis render inconsistently across platforms (Windows, macOS, Linux)
- Emojis have different sizes and baselines, breaking visual alignment
- Emojis cannot be styled (no color control, no stroke width)
- SVG icons integrate with the color scheme (use `currentColor`)
- Professional applications (Maya, Blender, DaVinci Resolve) use monochrome icons

**Examples:**
```typescript
// BAD - Using emojis
button.textContent = '🎨 Color';
button.textContent = '✏️ Edit';
button.textContent = '🗑️ Delete';

// GOOD - Using SVG icons
import { getIconSvg } from './shared/Icons';

button.innerHTML = `${getIconSvg('palette', 'sm')}<span>Color</span>`;
button.innerHTML = `${getIconSvg('pencil', 'sm')}<span>Edit</span>`;
button.innerHTML = `${getIconSvg('trash', 'sm')}<span>Delete</span>`;
```

---

## Icon System (`src/ui/components/shared/Icons.ts`)

Centralized SVG icon system for consistent iconography across the application.

### Architecture Flow

```
Icons.ts (Source of Truth)
    │
    ├── ICONS constant: Record<IconName, string>
    │   └── Contains SVG path data for each icon (24x24 viewBox)
    │
    ├── getIconSvg(name, size) → string
    │   └── Returns complete SVG element as HTML string
    │   └── Used with innerHTML: button.innerHTML = getIconSvg('play', 'sm')
    │
    └── createIcon(name, size) → SVGSVGElement
        └── Returns actual DOM element
        └── Used with appendChild: container.appendChild(createIcon('play', 'sm'))
```

### Usage Patterns

```typescript
import { getIconSvg, createIcon, IconName } from './shared/Icons';

// Method 1: HTML string (most common - use with innerHTML)
button.innerHTML = getIconSvg('pencil', 'sm');

// Method 2: DOM element (use when you need to manipulate the SVG)
const icon = createIcon('play', 'md');
icon.style.color = '#4a9eff';
container.appendChild(icon);

// Method 3: Button with icon and text
button.innerHTML = `${getIconSvg('eye', 'sm')}<span style="margin-left: 4px;">View</span>`;

// Method 4: Type-safe icon selection
function setIcon(name: IconName): void {
  element.innerHTML = getIconSvg(name, 'md');
}
```

### Icon Categories

| Category | Icons |
|----------|-------|
| **File** | folder-open, save, download, upload |
| **Playback** | play, pause, stop, skip-back, skip-forward, rewind, fast-forward, repeat |
| **Audio** | volume, volume-high, volume-low, volume-mute |
| **Paint** | hand, pen, pencil, brush, eraser, type, text |
| **Actions** | undo, redo, trash, x, check, plus, minus, refresh, reset |
| **View** | zoom-in, zoom-out, maximize, minimize, fit, eye, eye-off |
| **Transform** | rotate-ccw, rotate-cw, flip-horizontal, flip-vertical, crop, move |
| **Effects** | sliders, adjustments, filter, sparkles |
| **Color** | palette, droplet, sun, contrast |
| **Export** | image, film, clipboard, copy |
| **Layers** | layers, stack, box |
| **Lens** | aperture, camera, lens |
| **Compare** | split-vertical, split-horizontal, columns |
| **Scopes** | histogram, waveform, vectorscope |
| **Navigation** | chevron-left/right/up/down, arrow-left/right/up/down |
| **Misc** | help, info, settings, menu, more-horizontal/vertical, keyboard, ghost |
| **Timeline** | marker, flag, bracket-left, bracket-right |

### Icon Sizing
- `sm`: 14px - For compact toolbar buttons
- `md`: 16px - For standard buttons
- `lg`: 20px - For prominent UI elements

### SVG Design Principles

All icons follow these design rules:
- **ViewBox**: 24x24 (scales to any size)
- **Stroke-based**: Uses `stroke="currentColor"` for color inheritance
- **Stroke width**: 2px for consistent weight
- **Line caps**: Round (`stroke-linecap="round"`)
- **Line joins**: Round (`stroke-linejoin="round"`)
- **No fill**: Most icons use `fill="none"` (stroke only)

```typescript
// The generated SVG structure
<svg
  width="${size}"
  height="${size}"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <!-- icon paths -->
</svg>
```

### Adding New Icons

1. Find or create an icon path for 24x24 viewBox
2. Add to the `ICONS` constant in `Icons.ts`:
   ```typescript
   const ICONS = {
     // ... existing icons
     'my-new-icon': '<path d="..."/><circle cx="..." cy="..." r="..."/>',
   } as const;
   ```
3. The `IconName` type updates automatically (it's derived from `ICONS` keys)
4. Use with `getIconSvg('my-new-icon', 'md')`

---

## Flat Design Pattern

All interactive buttons follow a consistent flat design pattern:

```typescript
// Default state
button.style.cssText = `
  background: transparent;
  border: 1px solid transparent;
  color: #999;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s ease;
`;

// Hover state
button.addEventListener('mouseenter', () => {
  button.style.background = '#3a3a3a';
  button.style.borderColor = '#4a4a4a';
  button.style.color = '#ccc';
});

// Active/Selected state
button.style.background = 'rgba(74, 158, 255, 0.15)';
button.style.borderColor = '#4a9eff';
button.style.color = '#4a9eff';
```

### Container Styling
Containers use simple flex layout without visible boxing:

```typescript
container.style.cssText = `
  display: flex;
  align-items: center;
  gap: 4px;
`;
```

### Divider Usage
Use 1-2 dividers per section for logical grouping:

```typescript
const separator = document.createElement('div');
separator.style.cssText = 'width: 1px; height: 18px; background: #3a3a3a; margin: 0 2px;';
```

---

## View Tab Dropdown Controls

The View tab uses a grouped dropdown pattern to reduce visual clutter. Instead of showing all controls as individual buttons, related controls are grouped into dropdown menus.

### Before (23+ elements with scroll issues):
```
[Zoom:] [Fit] [50%] [100%] [200%] [400%] | [Ch:] [RGB] [R] [G] [B] [A] [Luma] |
[Wipe] | [Stereo ▾] | [Stack] | [Histogram] [Waveform] [Vectorscope] |
[A/B:] [A] [B] [⇄]
```

### After (6 compact dropdowns):
```
[Zoom ▾] | [Ch ▾] | [Compare ▾] | [Stereo ▾] | [Scopes ▾] | [Stack]
```

### Dropdown Components:

| Component | Controls | Description |
|-----------|----------|-------------|
| `ZoomControl` | Fit, 25%, 50%, 100%, 200%, 400% | Shows current zoom level |
| `ChannelSelect` | RGB, R, G, B, A, Luma | Channel isolation with color dots |
| `CompareControl` | Wipe modes, A/B source | Comparison tools grouped |
| `StereoControl` | Stereo viewing modes | Existing dropdown (unchanged) |
| `ScopesControl` | Histogram, Waveform, Vectorscope | Scope visibility toggles |
| `StackControl` | Opens layer panel | Panel button (unchanged) |

### Active State Indicators:
- Dropdowns show active state (highlighted) when any non-default option is selected
- `ScopesControl` shows count: "Scopes (2)" when 2 scopes are visible
- `CompareControl` shows active modes: "H-Wipe + B"

---

## Notes

- Maintain backward compatibility during transition
- Add migration path for keyboard shortcuts
- Consider saving tab preference in localStorage
- Performance: Only render active tab's context toolbar
- Accessibility: Ensure all controls are keyboard navigable

---

## Component Development Patterns

### Creating a New Control Component

Follow this pattern when creating new UI control components (e.g., StereoControl, CompareControl):

```typescript
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';

// 1. Define events interface
export interface MyControlEvents extends EventMap {
  stateChanged: MyState;
  valueChanged: number;
}

// 2. Define state interface with defaults
export interface MyState {
  enabled: boolean;
  value: number;
}

export const DEFAULT_MY_STATE: MyState = {
  enabled: false,
  value: 0,
};

// 3. Create component class extending EventEmitter
export class MyControl extends EventEmitter<MyControlEvents> {
  private container: HTMLElement;
  private state: MyState = { ...DEFAULT_MY_STATE };

  constructor() {
    super();
    this.container = document.createElement('div');
    this.container.dataset.testid = 'my-control'; // Required for e2e tests
    // ... build UI
  }

  // 4. Public methods for external control
  setState(state: MyState): void {
    this.state = { ...state };
    this.updateUI();
    this.emit('stateChanged', { ...this.state });
  }

  getState(): MyState {
    return { ...this.state };
  }

  // 5. Keyboard handler (if applicable)
  handleKeyboard(key: string, shiftKey: boolean): boolean {
    if (shiftKey && key === 'X') {
      this.toggle();
      return true;
    }
    return false;
  }

  // 6. Standard render/dispose methods
  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Cleanup event listeners, remove body-level elements
  }
}
```

### Wiring Up in App.ts

```typescript
// 1. Import the component
import { MyControl } from './ui/components/MyControl';

// 2. Add private property
private myControl: MyControl;

// 3. Initialize in constructor
this.myControl = new MyControl();
this.myControl.on('stateChanged', (state) => {
  this.viewer.setMyState(state);
});

// 4. Add to appropriate tab in setupTabContents()
viewContent.appendChild(this.myControl.render());

// 5. Add keyboard shortcut in handleKeydown() if needed
if (e.shiftKey && this.myControl.handleKeyboard(e.key, e.shiftKey)) {
  e.preventDefault();
  return;
}
```

---

## Common Problem Solving

### Z-Index Issues with Dropdowns

**Problem**: Dropdowns appear behind the canvas or other elements.

**Solution**: Render dropdowns at body level with `position: fixed`:

```typescript
// BAD - dropdown inside container (z-index stacking context issues)
this.container.appendChild(this.dropdown);

// GOOD - dropdown at body level
private openDropdown(): void {
  if (!document.body.contains(this.dropdown)) {
    document.body.appendChild(this.dropdown);
  }
  this.positionDropdown();
  this.dropdown.style.display = 'flex';

  // Add listeners for outside click and reposition
  document.addEventListener('click', this.boundHandleOutsideClick);
  window.addEventListener('scroll', this.boundHandleReposition, true);
  window.addEventListener('resize', this.boundHandleReposition);
}

private closeDropdown(): void {
  this.dropdown.style.display = 'none';

  // Remove listeners
  document.removeEventListener('click', this.boundHandleOutsideClick);
  window.removeEventListener('scroll', this.boundHandleReposition, true);
  window.removeEventListener('resize', this.boundHandleReposition);
}

private positionDropdown(): void {
  const rect = this.button.getBoundingClientRect();
  this.dropdown.style.top = `${rect.bottom + 4}px`;
  this.dropdown.style.left = `${rect.left}px`;
}
```

**Z-Index Values** (use consistently):
- `z-index: 50-100` - Viewer overlays (waveform, histogram, vectorscope)
- `z-index: 9999` - Dropdown panels, control panels
- `z-index: 10000` - Modals

### Event Handler Cleanup

**Problem**: Memory leaks from event listeners not being removed.

**Solution**: Bind handlers in constructor and remove in dispose/close:

```typescript
// In constructor
this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
this.boundHandleReposition = () => this.positionDropdown();

// In dispose()
dispose(): void {
  this.closeDropdown();
  if (document.body.contains(this.dropdown)) {
    document.body.removeChild(this.dropdown);
  }
}
```

### State Initialization Order

**Problem**: Methods called before DOM elements are created.

**Solution**: Initialize UI elements before calling update methods:

```typescript
constructor() {
  super();

  // 1. Create all DOM elements first
  this.button = document.createElement('button');
  this.dropdown = document.createElement('div');
  // ... populate dropdown

  // 2. Assemble container
  this.container.appendChild(this.button);

  // 3. Initialize state/labels LAST
  this.updateButtonLabel(); // Safe - dropdown exists now
}
```

### Input Element Event Handling

**Problem**: Keyboard shortcuts interfere with text/range inputs.

**Solution**: Check target type in global keyboard handler (already implemented in App.ts):

```typescript
if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
  const input = e.target as HTMLInputElement;
  const isTextInput = input.type === 'text' || input.type === 'search' || ...;

  if (isTextInput) {
    return; // Let the input handle the key
  }
}
```

---

## Test Requirements

### E2E Test Structure

All e2e tests follow this pattern:

```typescript
import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('XX-001: descriptive test name', async ({ page }) => {
    // Test implementation
  });
});
```

### Test Naming Convention

Use prefix codes for organized test suites:
- `ST-XXX` - Stereo tests
- `CS-XXX` - Channel Select tests
- `WF-XXX` - Waveform tests
- `AB-XXX` - A/B Compare tests
- `VIEW-XXX` - View controls tests
- `PLAY-XXX` - Playback tests

### Required Test Categories

For each new feature, create tests covering:

1. **Default State Tests**
   ```typescript
   test('XX-001: default state is correct', async ({ page }) => {
     const state = await getViewerState(page);
     expect(state.featureEnabled).toBe(false);
   });
   ```

2. **UI Visibility Tests**
   ```typescript
   test('XX-002: control is visible in correct tab', async ({ page }) => {
     await page.click('button[data-tab-id="view"]');
     const control = page.locator('[data-testid="my-control"]');
     await expect(control).toBeVisible();
   });
   ```

3. **User Interaction Tests**
   ```typescript
   test('XX-003: clicking button changes state', async ({ page }) => {
     await page.click('[data-testid="my-button"]');
     await page.waitForTimeout(100);
     const state = await getViewerState(page);
     expect(state.featureEnabled).toBe(true);
   });
   ```

4. **Keyboard Shortcut Tests**
   ```typescript
   test('XX-010: Shift+X toggles feature', async ({ page }) => {
     await page.keyboard.press('Shift+x');
     await page.waitForTimeout(100);
     const state = await getViewerState(page);
     expect(state.featureEnabled).toBe(true);
   });
   ```

5. **Visual Change Tests**
   ```typescript
   test('XX-020: enabling feature changes canvas', async ({ page }) => {
     const before = await captureViewerScreenshot(page);
     await page.click('[data-testid="enable-feature"]');
     await page.waitForTimeout(200);
     const after = await captureViewerScreenshot(page);
     expect(imagesAreDifferent(before, after)).toBe(true);
   });
   ```

6. **State Persistence Tests**
   ```typescript
   test('XX-030: state persists across frames', async ({ page }) => {
     // Enable feature
     await page.click('[data-testid="enable-feature"]');
     let state = await getViewerState(page);
     expect(state.featureEnabled).toBe(true);

     // Change frame
     await page.keyboard.press('ArrowRight');
     await page.waitForTimeout(100);

     // State should persist
     state = await getViewerState(page);
     expect(state.featureEnabled).toBe(true);
   });
   ```

### Test Best Practices

1. **Never use `force: true`** - If a click requires force, the element is not properly visible/clickable. Fix the root cause (usually z-index).

2. **Use data-testid attributes** for reliable element selection:
   ```typescript
   // GOOD
   await page.click('[data-testid="stereo-mode-button"]');

   // BAD - brittle, depends on text/structure
   await page.click('button:has-text("Stereo")');
   ```

3. **Wait for state changes** before assertions:
   ```typescript
   await page.click('[data-testid="button"]');
   await page.waitForTimeout(100); // Let state propagate
   const state = await getViewerState(page);
   ```

4. **Test real changes, not just UI** - Verify canvas actually changes:
   ```typescript
   const before = await captureViewerScreenshot(page);
   // ... action
   const after = await captureViewerScreenshot(page);
   expect(imagesAreDifferent(before, after)).toBe(true);
   ```

5. **Expose state for testing** - Update `test-helper.ts` and `e2e/fixtures.ts`:
   ```typescript
   // In test-helper.ts ViewerState interface
   export interface ViewerState {
     // ... existing
     myFeatureEnabled: boolean;
     myFeatureValue: number;
   }

   // In getViewerState()
   myFeatureEnabled: viewer.myState?.enabled ?? false,
   myFeatureValue: viewer.myState?.value ?? 0,
   ```

### Running Tests

```bash
# Run specific test file
npx playwright test stereo-viewing.spec.ts

# Run tests matching pattern
npx playwright test --grep "ST-00"

# Run with visible browser
npx playwright test --headed

# Run single test
npx playwright test --grep "ST-001"
```

---

## Viewer Integration

### Adding State to Viewer

When a control needs to affect rendering:

1. **Add state property in Viewer.ts**:
   ```typescript
   private myState: MyState = { ...DEFAULT_MY_STATE };
   ```

2. **Add setter method**:
   ```typescript
   setMyState(state: MyState): void {
     this.myState = { ...state };
     this.scheduleRender();
   }
   ```

3. **Add to render pipeline** (in `renderImage()`):
   ```typescript
   // Apply my effect (choose appropriate position in pipeline)
   if (!isDefaultMyState(this.myState)) {
     this.applyMyEffect(this.imageCtx, displayWidth, displayHeight);
   }
   ```

4. **Implement the effect**:
   ```typescript
   private applyMyEffect(ctx: CanvasRenderingContext2D, width: number, height: number): void {
     const imageData = ctx.getImageData(0, 0, width, height);
     const processed = processImageData(imageData, this.myState);
     ctx.putImageData(processed, 0, 0);
   }
   ```

### Render Pipeline Order

Effects are applied in this order in `renderImage()`:

1. Draw source image with transform (rotation/flip)
2. Apply crop
3. **Stereo mode** (layout transformation)
4. Lens distortion
5. 3D LUT
6. Color adjustments (exposure, contrast, etc.)
7. CDL
8. Color curves
9. Sharpen/blur filters
10. Channel isolation
11. Paint annotations (on top layer)

---

## Unified Button System

The application provides multiple ways to create consistent buttons. Choose based on context:

### 1. Shared Button Utility (`src/ui/components/shared/Button.ts`)

Use for **modals, panels, and standalone UI**:

```typescript
import { createButton, createIconButton, setButtonActive } from './shared/Button';
import { getIconSvg } from './shared/Icons';

// Text button with variants
const saveBtn = createButton('Save', () => handleSave(), {
  variant: 'primary',   // 'default' | 'primary' | 'danger' | 'ghost' | 'icon'
  size: 'md',           // 'sm' (24px) | 'md' (28px) | 'lg' (32px)
  title: 'Save changes',
  disabled: false,
});

// Button with icon
const deleteBtn = createButton('Delete', () => handleDelete(), {
  variant: 'danger',
  icon: getIconSvg('trash', 'sm'),
});

// Icon-only button
const closeBtn = createIconButton(getIconSvg('x', 'sm'), () => close(), {
  variant: 'ghost',
  title: 'Close',
});

// Update active state dynamically
setButtonActive(myButton, isActive, 'default');
```

**Variant Styles:**
| Variant | Base | Hover | Active |
|---------|------|-------|--------|
| `default` | Gray background | Lighter gray | Blue highlight |
| `primary` | Blue background | Lighter blue | Darker blue |
| `danger` | Red background | Lighter red | Darker red |
| `ghost` | Transparent | Subtle highlight | Blue highlight |
| `icon` | Transparent | Subtle highlight | Blue highlight |

### 2. ContextToolbar.createButton

Use for **toolbar buttons in context toolbars**:

```typescript
import { ContextToolbar } from './layout/ContextToolbar';

// Text button
const fitBtn = ContextToolbar.createButton('Fit', () => viewer.fitToWindow(), {
  title: 'Fit to window (F)',
});

// Button with icon
const histogramBtn = ContextToolbar.createButton('Histogram', () => toggleHistogram(), {
  title: 'Toggle histogram (H)',
  icon: 'histogram',  // IconName from Icons.ts
  active: isVisible,
});

// Add to toolbar content
viewContent.appendChild(fitBtn);
viewContent.appendChild(ContextToolbar.createDivider());
viewContent.appendChild(histogramBtn);
```

### 3. Inline Button Creation (Custom Controls)

Use for **component-specific buttons** with full control:

```typescript
// Standard flat button pattern
const button = document.createElement('button');
button.dataset.testid = 'my-button'; // Required for e2e tests
button.title = 'Button tooltip';
button.style.cssText = `
  background: transparent;
  border: 1px solid transparent;
  color: #999;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.12s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
`;

// Hover state
button.addEventListener('mouseenter', () => {
  if (!isActive) {
    button.style.background = '#3a3a3a';
    button.style.borderColor = '#4a4a4a';
    button.style.color = '#ccc';
  }
});

button.addEventListener('mouseleave', () => {
  if (!isActive) {
    button.style.background = 'transparent';
    button.style.borderColor = 'transparent';
    button.style.color = '#999';
  }
});

// Active state (when selected/enabled)
function setActive(active: boolean): void {
  if (active) {
    button.style.background = 'rgba(74, 158, 255, 0.15)';
    button.style.borderColor = '#4a9eff';
    button.style.color = '#4a9eff';
  } else {
    button.style.background = 'transparent';
    button.style.borderColor = 'transparent';
    button.style.color = '#999';
  }
}
```

### Button Best Practices

1. **Always add `data-testid`** for e2e tests:
   ```typescript
   button.dataset.testid = 'stereo-mode-button';
   ```

2. **Always add `title`** for accessibility and tooltips:
   ```typescript
   button.title = 'Stereo viewing mode (Shift+3)';
   ```

3. **Use consistent sizing**:
   - Toolbar buttons: `padding: 6px 10px`, `font-size: 12px`
   - Small inline buttons: `padding: 4px 8px`, `font-size: 11px`
   - Icon buttons: `min-width: 28px`, same height

4. **Use consistent active state colors**:
   ```css
   /* Active/selected state */
   background: rgba(74, 158, 255, 0.15);
   border-color: #4a9eff;
   color: #4a9eff;
   ```

5. **Use consistent transition timing**:
   ```css
   transition: all 0.12s ease;
   ```

6. **Button content with icon**:
   ```typescript
   button.innerHTML = `${getIconSvg('eye', 'sm')}<span style="margin-left: 4px;">Label</span>`;
   ```

7. **Dropdown indicator**:
   ```typescript
   button.innerHTML = `${getIconSvg('eye', 'sm')}<span>Label</span><span style="font-size: 8px;">&#9660;</span>`;
   ```

### When to Use Which

| Scenario | Recommended Approach |
|----------|---------------------|
| Modal buttons (OK, Cancel) | `createButton` from shared/Button.ts |
| Panel buttons (Reset, Apply) | `createButton` from shared/Button.ts |
| Context toolbar buttons | `ContextToolbar.createButton` |
| Custom control buttons | Inline creation with standard pattern |
| Toggle buttons (active state) | Inline with `setActive()` function |
| Dropdown triggers | Inline with dropdown indicator |

### Button Grouping

Group related buttons with minimal spacing:

```typescript
const container = document.createElement('div');
container.style.cssText = `
  display: flex;
  align-items: center;
  gap: 4px;
`;

// Add buttons
container.appendChild(button1);
container.appendChild(button2);

// Add divider between groups
const divider = document.createElement('div');
divider.style.cssText = 'width: 1px; height: 18px; background: #3a3a3a; margin: 0 4px;';
container.appendChild(divider);

container.appendChild(button3);
```
