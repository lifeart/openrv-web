# Fullscreen and Presentation Mode

## Original OpenRV Implementation
OpenRV provides dedicated modes for immersive viewing and client presentations:

**Fullscreen Mode**:
- Launch with -fullscreen flag
- Toggle fullscreen during playback
- Remove window decorations (-noBorders)
- Multi-monitor support with screen selection

**Presentation Mode**:
- Dedicated presentation mode for review sessions
- Video device configuration for output devices
- Display profiles for different output devices
- Multi-display setups (primary control screen + presentation display)

**Video Device Support**:
- Platform-specific video configuration (Linux, macOS, Windows)
- HDMI Frame Packed Mode for stereoscopic displays
- Custom data formats and video formats
- Display calibration integration

**Display Options**:
- Background color/pattern selection (black, grey18, grey50, checker, crosshatch)
- Presentation audio enable/disable
- Video format override
- Data format override

## Status
- [x] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

## Requirements
- Browser fullscreen mode (F11/Fullscreen API)
- Clean presentation view (hide UI elements)
- Background color options
- Multi-monitor support (where available)
- Keyboard shortcut for fullscreen toggle
- ESC to exit fullscreen
- Presentation mode with minimal UI
- Auto-hide cursor during playback

## UI/UX Specification

### Fullscreen Toggle Button
- **Location**: Header bar, utility controls section (right side)
- **Icon**: `maximize` icon from Icons.ts (or `minimize` when in fullscreen)
- **Tooltip**: "Fullscreen (F11)" / "Exit Fullscreen (Esc)"
- **Keyboard Shortcut**: F11 (standard browser shortcut)
- **data-testid**: `fullscreen-toggle-button`

### Presentation Mode Button
- **Location**: View tab context toolbar, rightmost group (Overlays)
- **Icon**: `presentation` or `monitor` icon
- **Tooltip**: "Presentation Mode (Shift+P)"
- **Keyboard Shortcut**: Shift+P
- **data-testid**: `presentation-mode-button`

### Presentation Mode Behavior
When enabled:
1. Hide Header bar (file ops, playback controls, volume)
2. Hide Tab bar
3. Hide Context toolbar
4. Hide Timeline
5. Show only the Viewer canvas (full viewport)
6. Auto-hide cursor after 3 seconds of inactivity during playback
7. Show cursor on mouse movement
8. ESC key exits presentation mode (before exiting fullscreen)

### Minimal UI Mode (Optional Enhancement)
- Show only playback controls on hover at bottom of screen
- Fade in/out with 0.3s transition
- data-testid: `minimal-ui-overlay`

### Background Color Selector (View Tab)
- **Location**: View tab context toolbar, Analysis group
- **Control Type**: Dropdown menu
- **Options**:
  - Black (default) - `#000000`
  - Grey 18% - `#2e2e2e` (photography standard)
  - Grey 50% - `#808080`
  - Checker (transparency pattern)
  - Custom color picker
- **data-testid**: `background-color-control`

### State Persistence
- Fullscreen state: Not persisted (browser-controlled)
- Presentation mode: Persisted in session
- Background color: Persisted in session/preferences
- Cursor auto-hide preference: Persisted in localStorage

## Technical Notes

### Fullscreen API Implementation
```typescript
// In src/ui/components/FullscreenManager.ts

export class FullscreenManager extends EventEmitter<FullscreenEvents> {
  private container: HTMLElement;
  private isFullscreen: boolean = false;

  constructor(container: HTMLElement) {
    super();
    this.container = container;
    this.setupEventListeners();
  }

  toggle(): void {
    if (this.isFullscreen) {
      this.exit();
    } else {
      this.enter();
    }
  }

  enter(): Promise<void> {
    return this.container.requestFullscreen();
  }

  exit(): Promise<void> {
    return document.exitFullscreen();
  }

  private setupEventListeners(): void {
    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen = !!document.fullscreenElement;
      this.emit('fullscreenChanged', this.isFullscreen);
    });
  }
}
```

### Presentation Mode Implementation
```typescript
// In src/ui/components/PresentationMode.ts

export interface PresentationState {
  enabled: boolean;
  cursorAutoHide: boolean;
  cursorHideDelay: number; // milliseconds
}

export class PresentationMode extends EventEmitter<PresentationEvents> {
  private state: PresentationState = {
    enabled: false,
    cursorAutoHide: true,
    cursorHideDelay: 3000,
  };
  private cursorTimer: number | null = null;
  private elementsToHide: HTMLElement[] = [];

  setElementsToHide(elements: HTMLElement[]): void {
    this.elementsToHide = elements;
  }

  toggle(): void {
    this.setState({ enabled: !this.state.enabled });
  }

  private hideCursor(): void {
    document.body.style.cursor = 'none';
  }

  private showCursor(): void {
    document.body.style.cursor = 'default';
    this.resetCursorTimer();
  }

  private resetCursorTimer(): void {
    if (this.cursorTimer) {
      clearTimeout(this.cursorTimer);
    }
    if (this.state.enabled && this.state.cursorAutoHide) {
      this.cursorTimer = window.setTimeout(() => {
        this.hideCursor();
      }, this.state.cursorHideDelay);
    }
  }
}
```

### Keyboard Bindings Addition
```typescript
// Add to src/utils/KeyBindings.ts

'view.toggleFullscreen': {
  code: 'F11',
  description: 'Toggle fullscreen mode'
},
'view.togglePresentation': {
  code: 'KeyP',
  shift: true,
  description: 'Toggle presentation mode'
},
```

### CSS Transitions for UI Hide/Show
```css
.presentation-hide {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.presentation-show {
  opacity: 1;
  pointer-events: auto;
  transition: opacity 0.3s ease;
}
```

### Browser Compatibility Notes
- Fullscreen API is well-supported in modern browsers
- Safari requires webkit prefix for some methods
- Mobile browsers may have limited fullscreen support
- F11 is reserved by browsers; may need alternative shortcut (Shift+F)

### Integration with App.ts
1. Create FullscreenManager instance in constructor
2. Create PresentationMode instance in constructor
3. Wire up fullscreen button in HeaderBar
4. Wire up presentation button in ViewContextToolbar
5. Pass UI elements to PresentationMode.setElementsToHide()
6. Handle keyboard shortcuts in handleKeydown()

## E2E Test Cases

### FS-001: Fullscreen button visibility
**Preconditions**: App loaded with media file
**Steps**:
1. Verify fullscreen toggle button is visible in header bar
**Expected**: Button with data-testid="fullscreen-toggle-button" is visible

### FS-002: Enter fullscreen via button click
**Preconditions**: App loaded, not in fullscreen
**Steps**:
1. Click fullscreen toggle button
2. Wait for fullscreen change event
**Expected**: Document.fullscreenElement is truthy, button icon changes to minimize

### FS-003: Exit fullscreen via button click
**Preconditions**: App in fullscreen mode
**Steps**:
1. Click fullscreen toggle button
2. Wait for fullscreen change event
**Expected**: Document.fullscreenElement is null, button icon changes to maximize

### FS-004: Exit fullscreen via ESC key
**Preconditions**: App in fullscreen mode
**Steps**:
1. Press ESC key
**Expected**: Fullscreen mode exits (browser native behavior)

### FS-005: Fullscreen keyboard shortcut
**Preconditions**: App loaded, not in fullscreen
**Steps**:
1. Press Shift+F (or configured shortcut)
**Expected**: App enters fullscreen mode

### FS-010: Presentation mode button visibility
**Preconditions**: App loaded with media file, View tab active
**Steps**:
1. Verify presentation mode button is visible in View tab toolbar
**Expected**: Button with data-testid="presentation-mode-button" is visible

### FS-011: Enter presentation mode hides UI
**Preconditions**: App loaded with media file
**Steps**:
1. Click presentation mode button
2. Wait 300ms for transition
**Expected**:
- Header bar is hidden (opacity: 0)
- Tab bar is hidden
- Context toolbar is hidden
- Timeline is hidden
- Viewer canvas fills viewport

### FS-012: Exit presentation mode shows UI
**Preconditions**: App in presentation mode
**Steps**:
1. Press ESC key (or click presentation button if visible)
2. Wait 300ms for transition
**Expected**: All UI elements restored to visible state

### FS-013: Presentation mode keyboard shortcut
**Preconditions**: App loaded, not in presentation mode
**Steps**:
1. Press Shift+P
**Expected**: App enters presentation mode, UI hidden

### FS-014: ESC exits presentation before fullscreen
**Preconditions**: App in fullscreen AND presentation mode
**Steps**:
1. Press ESC key once
**Expected**: Presentation mode exits, UI visible, still in fullscreen
**Steps continued**:
2. Press ESC key again
**Expected**: Fullscreen exits

### FS-020: Cursor auto-hide during playback
**Preconditions**: App in presentation mode, video playing
**Steps**:
1. Wait 3+ seconds without moving mouse
**Expected**: Cursor becomes hidden (cursor: none)

### FS-021: Cursor shows on mouse movement
**Preconditions**: App in presentation mode, cursor hidden
**Steps**:
1. Move mouse
**Expected**: Cursor becomes visible immediately

### FS-022: Cursor auto-hide timer resets
**Preconditions**: App in presentation mode
**Steps**:
1. Move mouse
2. Wait 2 seconds
3. Move mouse again
4. Wait 4 seconds
**Expected**: Cursor visible during steps 1-3, hidden after step 4

### FS-030: Background color default is black
**Preconditions**: App loaded with image that has transparency
**Steps**:
1. Observe viewer background
**Expected**: Background is black (#000000 or --viewer-bg default)

### FS-031: Background color selector in View tab
**Preconditions**: App loaded, View tab active
**Steps**:
1. Click background color control dropdown
**Expected**: Options for Black, Grey 18%, Grey 50%, Checker visible

### FS-032: Change background to checker pattern
**Preconditions**: App loaded with transparent image, View tab active
**Steps**:
1. Click background color control
2. Select "Checker" option
**Expected**: Viewer background shows checkerboard pattern through transparent areas

### FS-033: Background color persists across sessions
**Preconditions**: Background set to Grey 50%
**Steps**:
1. Note background color
2. Reload page
3. Load same media
**Expected**: Background color remains Grey 50%

### FS-040: Playback controls work in presentation mode
**Preconditions**: App in presentation mode with video loaded
**Steps**:
1. Press Space to toggle playback
2. Press Arrow keys to step frames
**Expected**: Playback controls function normally via keyboard

### FS-041: Viewer interactions work in presentation mode
**Preconditions**: App in presentation mode
**Steps**:
1. Use mouse wheel to zoom
2. Click and drag to pan
**Expected**: Zoom and pan work normally

## Unit Test Cases

### FullscreenManager Tests (src/ui/components/FullscreenManager.test.ts)

```typescript
describe('FullscreenManager', () => {
  describe('initialization', () => {
    it('should initialize with isFullscreen = false', () => {
      const manager = new FullscreenManager(container);
      expect(manager.isFullscreen).toBe(false);
    });

    it('should attach fullscreenchange listener', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      new FullscreenManager(container);
      expect(addEventListenerSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    });
  });

  describe('toggle()', () => {
    it('should call enter() when not in fullscreen', async () => {
      const manager = new FullscreenManager(container);
      const enterSpy = vi.spyOn(manager, 'enter');
      await manager.toggle();
      expect(enterSpy).toHaveBeenCalled();
    });

    it('should call exit() when in fullscreen', async () => {
      const manager = new FullscreenManager(container);
      manager['isFullscreen'] = true;
      const exitSpy = vi.spyOn(manager, 'exit');
      await manager.toggle();
      expect(exitSpy).toHaveBeenCalled();
    });
  });

  describe('enter()', () => {
    it('should call requestFullscreen on container', async () => {
      const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
      container.requestFullscreen = requestFullscreenMock;
      const manager = new FullscreenManager(container);
      await manager.enter();
      expect(requestFullscreenMock).toHaveBeenCalled();
    });
  });

  describe('exit()', () => {
    it('should call document.exitFullscreen', async () => {
      const exitFullscreenMock = vi.fn().mockResolvedValue(undefined);
      document.exitFullscreen = exitFullscreenMock;
      const manager = new FullscreenManager(container);
      await manager.exit();
      expect(exitFullscreenMock).toHaveBeenCalled();
    });
  });

  describe('event emission', () => {
    it('should emit fullscreenChanged when fullscreen state changes', () => {
      const manager = new FullscreenManager(container);
      const handler = vi.fn();
      manager.on('fullscreenChanged', handler);

      // Simulate fullscreenchange event
      Object.defineProperty(document, 'fullscreenElement', { value: container, writable: true });
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(handler).toHaveBeenCalledWith(true);
    });
  });

  describe('dispose()', () => {
    it('should remove event listener on dispose', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      const manager = new FullscreenManager(container);
      manager.dispose();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    });
  });
});
```

### PresentationMode Tests (src/ui/components/PresentationMode.test.ts)

```typescript
describe('PresentationMode', () => {
  describe('initialization', () => {
    it('should initialize with enabled = false', () => {
      const mode = new PresentationMode();
      expect(mode.getState().enabled).toBe(false);
    });

    it('should initialize with default cursor hide delay of 3000ms', () => {
      const mode = new PresentationMode();
      expect(mode.getState().cursorHideDelay).toBe(3000);
    });
  });

  describe('toggle()', () => {
    it('should toggle enabled state from false to true', () => {
      const mode = new PresentationMode();
      mode.toggle();
      expect(mode.getState().enabled).toBe(true);
    });

    it('should toggle enabled state from true to false', () => {
      const mode = new PresentationMode();
      mode.setState({ enabled: true });
      mode.toggle();
      expect(mode.getState().enabled).toBe(false);
    });
  });

  describe('setElementsToHide()', () => {
    it('should store elements to hide', () => {
      const mode = new PresentationMode();
      const elements = [document.createElement('div'), document.createElement('div')];
      mode.setElementsToHide(elements);
      expect(mode['elementsToHide']).toEqual(elements);
    });
  });

  describe('element visibility', () => {
    it('should hide elements when enabled', () => {
      const mode = new PresentationMode();
      const element = document.createElement('div');
      mode.setElementsToHide([element]);
      mode.setState({ enabled: true });
      expect(element.style.opacity).toBe('0');
    });

    it('should show elements when disabled', () => {
      const mode = new PresentationMode();
      const element = document.createElement('div');
      element.style.opacity = '0';
      mode.setElementsToHide([element]);
      mode.setState({ enabled: true });
      mode.setState({ enabled: false });
      expect(element.style.opacity).toBe('1');
    });
  });

  describe('cursor auto-hide', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should hide cursor after delay when enabled', () => {
      const mode = new PresentationMode();
      mode.setState({ enabled: true, cursorAutoHide: true });

      vi.advanceTimersByTime(3000);

      expect(document.body.style.cursor).toBe('none');
    });

    it('should not hide cursor if cursorAutoHide is false', () => {
      const mode = new PresentationMode();
      mode.setState({ enabled: true, cursorAutoHide: false });

      vi.advanceTimersByTime(5000);

      expect(document.body.style.cursor).not.toBe('none');
    });

    it('should show cursor on mouse movement', () => {
      const mode = new PresentationMode();
      mode.setState({ enabled: true, cursorAutoHide: true });
      document.body.style.cursor = 'none';

      mode.handleMouseMove();

      expect(document.body.style.cursor).toBe('default');
    });

    it('should reset timer on mouse movement', () => {
      const mode = new PresentationMode();
      mode.setState({ enabled: true, cursorAutoHide: true });

      vi.advanceTimersByTime(2000);
      mode.handleMouseMove();
      vi.advanceTimersByTime(2000);

      // Cursor should still be visible (timer reset)
      expect(document.body.style.cursor).not.toBe('none');

      vi.advanceTimersByTime(1500);
      expect(document.body.style.cursor).toBe('none');
    });
  });

  describe('event emission', () => {
    it('should emit stateChanged when state changes', () => {
      const mode = new PresentationMode();
      const handler = vi.fn();
      mode.on('stateChanged', handler);

      mode.setState({ enabled: true });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });
  });

  describe('dispose()', () => {
    it('should clear cursor timer on dispose', () => {
      vi.useFakeTimers();
      const mode = new PresentationMode();
      mode.setState({ enabled: true, cursorAutoHide: true });

      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      mode.dispose();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should restore cursor on dispose', () => {
      const mode = new PresentationMode();
      mode.setState({ enabled: true, cursorAutoHide: true });
      document.body.style.cursor = 'none';

      mode.dispose();

      expect(document.body.style.cursor).toBe('default');
    });
  });
});
```

### BackgroundPatternControl Tests (src/ui/components/BackgroundPatternControl.test.ts)

```typescript
describe('BackgroundPatternControl', () => {
  describe('initialization', () => {
    it('should render dropdown button', () => {
      const control = new BackgroundPatternControl();
      const element = control.render();
      expect(element.querySelector('[data-testid="background-color-control"]')).toBeTruthy();
    });

    it('should default to black background', () => {
      const control = new BackgroundPatternControl();
      expect(control.getPattern()).toBe('black');
    });
  });

  describe('pattern options', () => {
    it('should have all required patterns', () => {
      const control = new BackgroundPatternControl();
      const patterns = control.getAvailablePatterns();
      expect(patterns).toContain('black');
      expect(patterns).toContain('grey18');
      expect(patterns).toContain('grey50');
      expect(patterns).toContain('checker');
    });
  });

  describe('setPattern()', () => {
    it('should update current pattern', () => {
      const control = new BackgroundPatternControl();
      control.setPattern('checker');
      expect(control.getPattern()).toBe('checker');
    });

    it('should emit patternChanged event', () => {
      const control = new BackgroundPatternControl();
      const handler = vi.fn();
      control.on('patternChanged', handler);

      control.setPattern('grey50');

      expect(handler).toHaveBeenCalledWith('grey50');
    });
  });

  describe('CSS variable integration', () => {
    it('should update --viewer-bg variable for solid colors', () => {
      const control = new BackgroundPatternControl();
      control.setPattern('grey18');

      const bgValue = document.documentElement.style.getPropertyValue('--viewer-bg');
      expect(bgValue).toBe('#2e2e2e');
    });
  });
});
```

### Keyboard Shortcut Tests (addition to KeyBindings.test.ts)

```typescript
describe('Fullscreen/Presentation keybindings', () => {
  it('should have fullscreen toggle binding', () => {
    expect(DEFAULT_KEY_BINDINGS['view.toggleFullscreen']).toBeDefined();
    expect(DEFAULT_KEY_BINDINGS['view.toggleFullscreen'].description).toContain('fullscreen');
  });

  it('should have presentation mode binding', () => {
    expect(DEFAULT_KEY_BINDINGS['view.togglePresentation']).toBeDefined();
    expect(DEFAULT_KEY_BINDINGS['view.togglePresentation'].shift).toBe(true);
    expect(DEFAULT_KEY_BINDINGS['view.togglePresentation'].code).toBe('KeyP');
  });
});
```
