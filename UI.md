# OpenRV Web - UI Architecture & Style Guide

## UI Architecture

### Design Principles
- **Industry Standard**: Match DaVinci Resolve, Nuke, RV style
- **Contextual Grouping**: Related tools together
- **Progressive Disclosure**: Simple → Advanced
- **Keyboard-First**: Power users rely on shortcuts
- **Minimal Clicks**: Common actions always visible

### Layout Structure

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

---

## Style Guide

### Theme System

The application uses a comprehensive CSS variable-based theming system managed by `ThemeManager` (`src/utils/ThemeManager.ts`). This enables seamless dark/light mode switching and consistent styling across all UI components.

#### Theme Modes
- **Dark** (default): Dark background with light text
- **Light**: Light background with dark text
- **Auto**: Follows system preference (prefers-color-scheme)

Theme preference is persisted to localStorage and can be cycled via the theme toggle button.

### CSS Variables (Runtime)

All UI components must use these CSS variables instead of hardcoded colors:

```css
/* Background colors */
--bg-primary: #1a1a1a;      /* Main background */
--bg-secondary: #252525;    /* Panels, toolbars */
--bg-tertiary: #2d2d2d;     /* Nested elements */
--bg-hover: #333333;        /* Hover state background */
--bg-active: #3a3a3a;       /* Active/pressed state */

/* Text colors */
--text-primary: #e0e0e0;    /* Primary text */
--text-secondary: #b0b0b0;  /* Secondary/label text */
--text-muted: #666666;      /* Muted/hint text */

/* Border colors */
--border-primary: #444444;  /* Primary borders */
--border-secondary: #333333; /* Subtle borders */

/* Accent colors (interactive elements) */
--accent-primary: #4a9eff;  /* Primary accent */
--accent-hover: #5aafff;    /* Hover state */
--accent-active: #3a8eef;   /* Active/pressed state */
--accent-primary-rgb: 74, 158, 255;  /* For rgba() usage */

/* Semantic colors */
--success: #4ade80;         /* Success state */
--warning: #facc15;         /* Warning state */
--error: #f87171;           /* Error/danger state */

/* Overlay colors */
--overlay-bg: rgba(0, 0, 0, 0.75);     /* Overlay background */
--overlay-border: rgba(255, 255, 255, 0.1); /* Overlay borders */

/* Viewer specific */
--viewer-bg: #1e1e1e;       /* Canvas/viewer background */
```

### Using CSS Variables in Components

#### Basic Usage
```typescript
// Always use CSS variables for colors
element.style.background = 'var(--bg-secondary)';
element.style.color = 'var(--text-primary)';
element.style.borderColor = 'var(--border-primary)';
```

#### Using RGBA with CSS Variables
For semi-transparent colors, use the `-rgb` suffix variables:
```typescript
// Transparent accent background
element.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';

// Active state highlight
button.style.cssText = `
  background: rgba(var(--accent-primary-rgb), 0.15);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
`;
```

#### Canvas/2D Context Colors
For canvas drawing, resolve CSS variables at render time:
```typescript
private getColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue('--bg-secondary').trim() || '#252525',
    accent: style.getPropertyValue('--accent-primary').trim() || '#4a9eff',
    // etc.
  };
}

protected draw(): void {
  const colors = this.getColors();
  ctx.fillStyle = colors.background;
  // ...
}
```

### Color Usage Guidelines

| Use Case | Variable | Example |
|----------|----------|---------|
| Panel/container background | `--bg-secondary` | Toolbars, dropdown panels |
| Hover state | `--bg-hover` | Button hover |
| Active/pressed state | `--bg-active` | Selected button |
| Primary text | `--text-primary` | Labels, headings |
| Secondary text | `--text-secondary` | Descriptions |
| Disabled/hint text | `--text-muted` | Placeholders, hints |
| Interactive elements | `--accent-primary` | Buttons, links, active states |
| Success indicator | `--success` | Cache complete, save success |
| Warning indicator | `--warning` | Pending, caution |
| Error/danger | `--error` | Delete button, error messages |
| Floating overlays | `--overlay-bg` | Modals, dropdowns, scopes |

### Do NOT Use

**Never use hardcoded hex colors in UI components:**
```typescript
// BAD - hardcoded colors
button.style.color = '#4a9eff';
button.style.background = 'rgba(74, 158, 255, 0.15)';
panel.style.background = '#252525';

// GOOD - CSS variables
button.style.color = 'var(--accent-primary)';
button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
panel.style.background = 'var(--bg-secondary)';
```

### Light Theme Values

When auto mode detects light system preference, these values are used:
```css
--bg-primary: #ffffff;
--bg-secondary: #f5f5f5;
--bg-hover: #e0e0e0;
--bg-active: #d5d5d5;
--text-primary: #1a1a1a;
--text-secondary: #4a4a4a;
--text-muted: #999999;
--accent-primary: #0066cc;
--accent-primary-rgb: 0, 102, 204;
/* etc. */
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

## View Tab Space Optimization

Controls organized into 5 logical groups with only 4 dividers between them:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Zoom][Ch] │ [Compare][Stereo] │ [Scopes][Stack] │ [Guides][False][Zebra][HSL] │ [🔍][☀️][ℹ️] │
│  Navigation │    Comparison     │   Monitoring    │        Analysis            │   Overlays  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Implementation in App.ts setupTabContents()

```typescript
private setupTabContents(): void {
  const viewContent = document.createElement('div');
  viewContent.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';

  // --- GROUP 1: Navigation (Zoom + Channel) ---
  viewContent.appendChild(this.zoomControl.render());
  viewContent.appendChild(this.channelSelect.render());
  viewContent.appendChild(ContextToolbar.createDivider());

  // --- GROUP 2: Comparison (Compare + Stereo) ---
  viewContent.appendChild(this.compareControl.render());
  viewContent.appendChild(this.stereoControl.render());
  viewContent.appendChild(ContextToolbar.createDivider());

  // --- GROUP 3: Monitoring (Scopes + Stack) ---
  viewContent.appendChild(this.scopesControl.render());
  viewContent.appendChild(this.stackControl.render());
  viewContent.appendChild(ContextToolbar.createDivider());

  // --- GROUP 4: Analysis Tools (no internal dividers) ---
  viewContent.appendChild(this.safeAreasControl.render());
  viewContent.appendChild(this.falseColorControl.render());
  viewContent.appendChild(this.zebraControl.render());
  viewContent.appendChild(this.hslQualifierControl.render());
  viewContent.appendChild(ContextToolbar.createDivider());

  // --- GROUP 5: Overlay Toggles (icon-only buttons) ---
  const pixelProbeButton = ContextToolbar.createIconButton('eyedropper', ...);
  const spotlightButton = ContextToolbar.createIconButton('sun', ...);
  const infoPanelButton = ContextToolbar.createIconButton('info', ...);
  // ...
}
```

### Space Savings Achieved

| Optimization | Savings |
|--------------|---------|
| Reduced dividers (13 → 4) | ~80px |
| Icon-only overlay buttons (3 buttons) | ~115px |
| Reduced gaps (8px → 6px) | ~50px |
| **Total** | **~245px (~17% reduction)** |

### Icon-Only Buttons Pattern

Use `ContextToolbar.createIconButton()` for compact toggle buttons:

```typescript
// Icon-only button (28px × 28px)
const probeButton = ContextToolbar.createIconButton('eyedropper', () => {
  this.viewer.getPixelProbe().toggle();
}, { title: 'Pixel Probe (Shift+I)' });
probeButton.dataset.testid = 'pixel-probe-toggle';

// Update state on change
this.viewer.getPixelProbe().on('stateChanged', (state) => {
  if (state.enabled) {
    probeButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
    probeButton.style.borderColor = 'var(--accent-primary)';
    probeButton.style.color = 'var(--accent-primary)';
  } else {
    probeButton.style.background = 'transparent';
    probeButton.style.borderColor = 'transparent';
    probeButton.style.color = 'var(--text-secondary)';
  }
});
```

### Divider Strategy

**Principle:** Use dividers only between major conceptual groups, not between every control.

**Before (excessive):**
```
[Zoom] | [Channel] | [Compare] | [Stereo] | [Scopes] | [Stack] | [Guides] | [False] | [Zebra] | [HSL] | [Probe] | [Spotlight] | [Info]
       ^          ^           ^          ^          ^         ^          ^         ^         ^       ^          ^             ^
       13 dividers total
```

**After (logical):**
```
[Zoom][Channel] | [Compare][Stereo] | [Scopes][Stack] | [Guides][False][Zebra][HSL] | [Probe][Spotlight][Info]
                ^                   ^                 ^                             ^
                4 dividers total (between logical groups)
```

### Gap Optimization

Reduced `gap` from 8px to 6px across all toolbar containers:

```typescript
// ContextToolbar.ts - container and content
this.container.style.gap = '6px';
this.contentContainer.style.gap = '6px';

// App.ts - all tab content containers
viewContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
colorContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
effectsContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
// etc.
```

---

## File Structure

```
src/ui/
├── components/
│   ├── layout/
│   │   ├── HeaderBar.ts        # Top bar with file/playback/utils
│   │   ├── TabBar.ts           # Tab navigation
│   │   ├── ContextToolbar.ts   # Base context toolbar
│   │   └── SidePanel.ts        # Slide-out panel container
│   ├── shared/
│   │   ├── Button.ts           # Unified button utilities
│   │   ├── Modal.ts            # Native modal dialogs
│   │   ├── Panel.ts            # Reusable dropdown panel
│   │   ├── DropdownMenu.ts     # Dropdown menu with a11y
│   │   ├── DraggableContainer.ts # Draggable scope/panel container
│   │   └── Icons.ts            # SVG icon system
│   ├── ZoomControl.ts          # Zoom level dropdown (View tab)
│   ├── ChannelSelect.ts        # Channel isolation dropdown (View tab)
│   ├── CompareControl.ts       # Wipe + A/B comparison dropdown (View tab)
│   ├── ScopesControl.ts        # Histogram/Waveform/Vectorscope dropdown (View tab)
│   ├── StereoControl.ts        # Stereo viewing mode dropdown (View tab)
│   ├── StackControl.ts         # Layer stack panel button (View tab)
│   ├── ColorControls.ts        # Exposure/contrast/saturation (Color tab)
│   ├── CDLControl.ts           # ASC CDL panel (Color tab)
│   ├── FilterControl.ts        # Blur/sharpen sliders (Effects tab)
│   ├── LensControl.ts          # Lens distortion panel (Effects tab)
│   ├── TransformControl.ts     # Rotation/flip (Transform tab)
│   ├── CropControl.ts          # Crop tool (Transform tab)
│   ├── PaintToolbar.ts         # Paint tools (Annotate tab)
│   └── ... (70+ component files total)
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
import { createButton, createIconButton, setButtonActive, applyA11yFocus } from './shared/Button';

// Text button (includes A11Y focus handling automatically)
const btn = createButton('Save', () => handleSave(), {
  variant: 'primary',  // 'default' | 'primary' | 'danger' | 'ghost' | 'icon'
  size: 'md',          // 'sm' | 'md' | 'lg'
  active: false,
  disabled: false,
  title: 'Save file',
  minWidth: '80px'
});

// Icon button (includes A11Y focus handling automatically)
const iconBtn = createIconButton('<svg>...</svg>', () => handleClick(), {
  variant: 'ghost',
  size: 'sm',
  title: 'Settings'
});

// Update active state
setButtonActive(btn, true, 'default');

// For custom buttons: apply A11Y focus handling
// Shows focus ring only for keyboard navigation, not mouse clicks
const customBtn = document.createElement('button');
customBtn.style.cssText = '...outline: none;'; // Must include outline: none
applyA11yFocus(customBtn); // Returns cleanup function if needed
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

### DropdownMenu Component (`src/ui/components/shared/DropdownMenu.ts`)

Reusable dropdown menu with keyboard navigation, accessibility support, and single/multi-select modes.

**Features:**
- Full keyboard navigation (ArrowUp/Down, Home/End, Enter, Space, Escape, Tab)
- ARIA accessibility (role="listbox", aria-selected, aria-activedescendant)
- Single-select and multi-select modes
- Auto-close when clicking outside or opening another dropdown
- Visual deselection when changing selection (accent styling properly reset)
- Color indicators and shortcut hints for items
- Disabled item support
- Z-index stacking for multiple dropdowns

```typescript
import { DropdownMenu } from './shared/DropdownMenu';

// Create dropdown menu
const dropdown = new DropdownMenu({
  minWidth: '120px',
  multiSelect: false,  // Set to true for checkbox-style multi-select
  closeOthers: true,   // Auto-close other open dropdowns
  onSelect: (value) => {
    // Called when item is selected (single-select mode)
    console.log('Selected:', value);
  },
  onSelectionChange: (values) => {
    // Called when selection changes (multi-select mode)
    console.log('Selected values:', values);
  },
  onClose: () => {
    // Called when dropdown closes
    updateButtonStyle();
  },
});

// Set items
dropdown.setItems([
  { value: 'rgb', label: 'RGB', color: '#ccc', shortcut: 'N' },
  { value: 'red', label: 'Red', color: '#ff6b6b', shortcut: 'R' },
  { value: 'green', label: 'Green', color: '#6bff6b', shortcut: 'G' },
  { value: 'blue', label: 'Blue', color: '#6b9fff', shortcut: 'B' },
  { value: 'disabled', label: 'Disabled Option', disabled: true },
]);

// Open/close/toggle
dropdown.open(anchorButton);
dropdown.close();
dropdown.toggle(anchorButton);

// Selection management
dropdown.setSelectedValue('red');           // Single value
dropdown.setSelectedValues(['red', 'blue']); // Multiple values (multi-select mode)
dropdown.clearSelection();
dropdown.getSelectedValues();  // Returns string[]
dropdown.isValueSelected('red'); // Returns boolean

// State
dropdown.isVisible(); // Returns boolean
dropdown.getElement(); // Returns HTMLElement

// Cleanup
dropdown.dispose();
```

**Usage with ChannelSelect/ZoomControl:**
```typescript
// In component constructor
this.dropdown = new DropdownMenu({
  onSelect: (value) => this.setChannel(value as ChannelMode),
  onClose: () => this.updateButtonLabel(),
});

// Set items with colors
this.dropdown.setItems(
  channels.map((channel) => ({
    value: channel,
    label: CHANNEL_LABELS[channel],
    color: CHANNEL_COLORS[channel],
    shortcut: CHANNEL_SHORT_LABELS[channel],
  }))
);

// In button click handler
this.button.addEventListener('click', () => {
  this.dropdown.toggle(this.button);
});

// When programmatically changing selection
setChannel(channel: ChannelMode): void {
  if (this.currentChannel === channel) return;
  this.currentChannel = channel;
  this.dropdown.setSelectedValue(channel); // Updates visual styling
  this.emit('channelChanged', channel);
}
```

**Important:** Always call `setSelectedValue()` after changing selection to ensure proper visual deselection of previous item.

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

All interactive buttons follow a consistent flat design pattern using CSS variables:

```typescript
// Default state - use CSS variables
button.style.cssText = `
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s ease;
`;

// Hover state
button.addEventListener('mouseenter', () => {
  button.style.background = 'var(--bg-hover)';
  button.style.borderColor = 'var(--border-primary)';
  button.style.color = 'var(--text-primary)';
});

// Active/Selected state
button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
button.style.borderColor = 'var(--accent-primary)';
button.style.color = 'var(--accent-primary)';
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
separator.style.cssText = 'width: 1px; height: 18px; background: var(--border-secondary); margin: 0 2px;';
```

---

## View Tab Control Layout

The View tab uses a grouped layout pattern to reduce visual clutter and horizontal scroll. Controls are organized into 5 logical groups with minimal dividers.

### Current Layout (Optimized):
```
[Zoom ▾][Ch ▾] │ [Compare ▾][Stereo ▾] │ [Scopes ▾][Stack] │ [Guides ▾][False ▾][Zebra ▾][HSL ▾] │ [🔍][☀️][ℹ️]
   Navigation  │      Comparison       │    Monitoring     │           Analysis               │  Overlays
```

### Control Groups:

| Group | Controls | Purpose |
|-------|----------|---------|
| **Navigation** | ZoomControl, ChannelSelect | Basic view navigation |
| **Comparison** | CompareControl, StereoControl | A/B, wipe, stereo modes |
| **Monitoring** | ScopesControl, StackControl | Scopes and layer panel |
| **Analysis** | SafeAreas, FalseColor, Zebra, HSL | Exposure and color analysis |
| **Overlays** | Probe, Spotlight, Info (icon-only) | Toggle overlays |

### Dropdown Components:

| Component | Controls | Description |
|-----------|----------|-------------|
| `ZoomControl` | Fit, 25%, 50%, 100%, 200%, 400% | Shows current zoom level |
| `ChannelSelect` | RGB, R, G, B, A, Luma | Channel isolation with color dots |
| `CompareControl` | Wipe modes, A/B source, Diff matte | Comparison tools grouped |
| `StereoControl` | Stereo viewing modes | Side-by-side, anaglyph, etc. |
| `ScopesControl` | Histogram, Waveform, Vectorscope | Scope visibility toggles |
| `SafeAreasControl` | Safe zones, guides, aspect overlays | Broadcast safe areas |
| `FalseColorControl` | False color presets, legend | Exposure visualization |
| `ZebraControl` | Zebra stripes, thresholds | Exposure warnings |
| `HSLQualifierControl` | HSL ranges, eyedropper | Secondary color correction |

### Icon-Only Overlay Toggles:

| Button | Icon | Shortcut | Purpose |
|--------|------|----------|---------|
| Pixel Probe | `eyedropper` | Shift+I | Color sampling |
| Spotlight | `sun` | Shift+Q | Focus spotlight |
| Info Panel | `info` | Shift+Alt+I | Floating info overlay |

### Active State Indicators:
- Dropdowns show active state (highlighted) when any non-default option is selected
- `ScopesControl` shows count: "Scopes (2)" when 2 scopes are visible
- `CompareControl` shows active modes: "H-Wipe + B"
- Icon-only buttons highlight with accent color when enabled

---

## Notes

- Performance: Only the active tab's context toolbar is rendered
- Accessibility: All controls are keyboard navigable
- Tab preference is stored in app state

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

### Updating Tests When UI Changes

When UI controls change from individual buttons to dropdowns (or vice versa), e2e tests must be updated.

#### Pattern: Individual Buttons → Dropdown

**Before (individual zoom buttons):**
```typescript
// OLD - looking for individual buttons by text
const zoom200 = page.locator('button:has-text("200%")');
await zoom200.click();
```

**After (dropdown pattern):**
```typescript
// NEW - helper function for dropdown interaction
async function selectZoomLevel(page: Page, label: string) {
  // Open the dropdown
  await page.click('[data-testid="zoom-control-button"]');
  await page.waitForTimeout(100);
  // Click the option (dropdown items use role="option")
  await page.click(`[role="option"]:has-text("${label}")`);
  await page.waitForTimeout(100);
}

// Usage
await selectZoomLevel(page, '200%');
await selectZoomLevel(page, 'Fit');
```

#### Pattern: Text Buttons → Icon-Only Buttons

**Before (text button):**
```typescript
// OLD - looking for button by text content
const control = page.locator('button:has-text("Info")');
await expect(control).toBeVisible();
```

**After (icon-only with testid):**
```typescript
// NEW - use data-testid for icon-only buttons
const control = page.locator('[data-testid="info-panel-toggle"]');
await expect(control).toBeVisible();
```

#### Pattern: Wipe Control → CompareControl Dropdown

**Before (separate wipe button):**
```typescript
const wipeButton = page.locator('button[title*="wipe"]').first();
await wipeButton.click();
```

**After (CompareControl dropdown):**
```typescript
// Open Compare dropdown
await page.click('[data-testid="compare-control-button"]');
await page.waitForTimeout(100);

// Click specific wipe mode option
await page.click('[data-wipe-mode="horizontal"]');
```

#### Key Selectors for View Tab Controls

| Control | Button Selector | Dropdown/Option Selector |
|---------|----------------|-------------------------|
| Zoom | `[data-testid="zoom-control-button"]` | `[role="option"]:has-text("...")` |
| Channel | `[data-testid="channel-select-button"]` | `[role="option"]:has-text("...")` |
| Compare | `[data-testid="compare-control-button"]` | `[data-wipe-mode="..."]` |
| Stereo | `[data-testid="stereo-mode-button"]` | `[data-stereo-mode="..."]` |
| Scopes | `[data-testid="scopes-control-button"]` | `[data-scope="..."]` |
| Probe | `[data-testid="pixel-probe-toggle"]` | N/A (toggle button) |
| Spotlight | `[data-testid="spotlight-toggle-btn"]` | N/A (toggle button) |
| Info | `[data-testid="info-panel-toggle"]` | N/A (toggle button) |

#### Always Prefer data-testid

When adding new controls, always include `data-testid` for stable test selectors:

```typescript
// In component code
button.dataset.testid = 'my-feature-toggle';
dropdown.dataset.testid = 'my-feature-dropdown';

// In tests
await page.click('[data-testid="my-feature-toggle"]');
await expect(page.locator('[data-testid="my-feature-dropdown"]')).toBeVisible();
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

### 2b. ContextToolbar.createIconButton

Use for **compact icon-only toggle buttons** in toolbars (saves ~40px per button vs text+icon):

```typescript
import { ContextToolbar } from './layout/ContextToolbar';

// Icon-only button (28px × 28px square)
const probeBtn = ContextToolbar.createIconButton('eyedropper', () => {
  viewer.getPixelProbe().toggle();
}, {
  title: 'Pixel Probe (Shift+I)',  // Tooltip is essential for discoverability
  active: false,
  size: 'sm',  // 'sm' (28px) or 'md' (32px)
});
probeBtn.dataset.testid = 'pixel-probe-toggle';

// Update active state dynamically
viewer.getPixelProbe().on('stateChanged', (state) => {
  if (state.enabled) {
    probeBtn.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
    probeBtn.style.borderColor = 'var(--accent-primary)';
    probeBtn.style.color = 'var(--accent-primary)';
  } else {
    probeBtn.style.background = 'transparent';
    probeBtn.style.borderColor = 'transparent';
    probeBtn.style.color = 'var(--text-secondary)';
  }
});
```

**When to use icon-only vs text+icon:**
- **Icon-only:** Secondary features, toggle overlays, when space is limited
- **Text+icon:** Primary features, dropdown triggers, when discoverability is important

### 3. Inline Button Creation (Custom Controls)

Use for **component-specific buttons** with full control:

```typescript
// Standard flat button pattern - ALWAYS use CSS variables
import { applyA11yFocus } from './shared/Button';

const button = document.createElement('button');
button.dataset.testid = 'my-button'; // Required for e2e tests
button.title = 'Button tooltip';
button.style.cssText = `
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.12s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  outline: none;
`;

// Hover state
button.addEventListener('mouseenter', () => {
  if (!isActive) {
    button.style.background = 'var(--bg-hover)';
    button.style.borderColor = 'var(--border-primary)';
    button.style.color = 'var(--text-primary)';
  }
});

button.addEventListener('mouseleave', () => {
  if (!isActive) {
    button.style.background = 'transparent';
    button.style.borderColor = 'transparent';
    button.style.color = 'var(--text-muted)';
  }
});

// Apply A11Y focus handling (shows focus ring only for keyboard navigation)
applyA11yFocus(button);

// Active state (when selected/enabled)
function setActive(active: boolean): void {
  if (active) {
    button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
    button.style.borderColor = 'var(--accent-primary)';
    button.style.color = 'var(--accent-primary)';
  } else {
    button.style.background = 'transparent';
    button.style.borderColor = 'transparent';
    button.style.color = 'var(--text-muted)';
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

3. **Always add A11Y focus handling** for keyboard navigation:
   ```typescript
   import { applyA11yFocus } from './shared/Button';

   // Add outline: none to base style, then apply A11Y focus
   button.style.cssText = `...outline: none;`;
   applyA11yFocus(button);
   ```
   This shows a focus ring (`outline: 2px solid var(--accent-primary)`) only when the button is focused via keyboard (Tab), not on mouse click.

4. **Use consistent sizing**:
   - Toolbar buttons: `padding: 6px 10px`, `font-size: 12px`
   - Small inline buttons: `padding: 4px 8px`, `font-size: 11px`
   - Icon buttons: `min-width: 28px`, same height

5. **Use consistent active state colors** (CSS variables):
   ```css
   /* Active/selected state - ALWAYS use CSS variables */
   background: rgba(var(--accent-primary-rgb), 0.15);
   border-color: var(--accent-primary);
   color: var(--accent-primary);
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
divider.style.cssText = 'width: 1px; height: 18px; background: var(--border-secondary); margin: 0 4px;';
container.appendChild(divider);

container.appendChild(button3);
```
