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
[CropControl] [LensControl] [StackControl] [WipeControl] [TransformControl]
[VolumeControl] [ExportControl]
```

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

**Context Toolbar Contents**:
- Zoom controls: [Fit] [50%] [100%] [200%] [400%]
- Wipe toggle: [Off] [H-Wipe] [V-Wipe]
- Stack/Layers button (opens side panel)
- Display info: Resolution, Frame rate

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

### Phase 1: Header Bar Consolidation
- [ ] Create `HeaderBar.ts` component
- [ ] Move file operations (Open, Export dropdown)
- [ ] Move playback controls
- [ ] Move volume control
- [ ] Move help button
- [ ] Style: 40px height, clean separation

### Phase 2: Tab System
- [ ] Create `TabBar.ts` component
- [ ] Create `ContextToolbar.ts` component
- [ ] Implement tab switching logic
- [ ] Store active tab in App state
- [ ] Style: 36px tabs, active indicator

### Phase 3: View Tab
- [ ] Move zoom controls to context toolbar
- [ ] Move wipe control
- [ ] Add stack button (opens side panel)
- [ ] Add resolution/fps display

### Phase 4: Color Tab
- [ ] Create inline exposure/contrast/saturation sliders
- [ ] Consolidate CDL and LUT as panel toggles
- [ ] Create "Advanced" panel for secondary adjustments
- [ ] Add reset and before/after buttons

### Phase 5: Effects Tab
- [ ] Move blur/sharpen to inline sliders
- [ ] Keep lens distortion as panel button
- [ ] Add global reset

### Phase 6: Transform Tab
- [ ] Redesign rotation buttons with degrees
- [ ] Improve flip button states
- [ ] Integrate crop control inline
- [ ] Add reset button

### Phase 7: Annotate Tab
- [ ] Reorganize paint toolbar layout
- [ ] Move ghost mode to context toolbar
- [ ] Improve color picker UX
- [ ] Add brush preview

### Phase 8: Polish & Consistency
- [ ] Unify all button styles
- [ ] Consistent panel shadows and borders
- [ ] Smooth tab transitions
- [ ] Keyboard navigation for tabs (1-5)
- [ ] Update all keyboard shortcuts help

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
- `W` - Cycle wipe mode
- `0-4` - Zoom levels

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
│   ├── tabs/
│   │   ├── ViewTab.ts          # View tab context toolbar
│   │   ├── ColorTab.ts         # Color tab context toolbar
│   │   ├── EffectsTab.ts       # Effects tab context toolbar
│   │   ├── TransformTab.ts     # Transform tab context toolbar
│   │   └── AnnotateTab.ts      # Annotate tab context toolbar
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

---

## Notes

- Maintain backward compatibility during transition
- Add migration path for keyboard shortcuts
- Consider saving tab preference in localStorage
- Performance: Only render active tab's context toolbar
- Accessibility: Ensure all controls are keyboard navigable
