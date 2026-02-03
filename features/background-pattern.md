# Background Pattern Display

## Original OpenRV Implementation
OpenRV provides configurable background patterns for image viewing:

**Available Patterns** (via -bg flag):
- **Black**: Solid black background (default)
- **Grey18**: 18% grey (photography standard)
- **Grey50**: 50% grey (neutral midtone)
- **Checker**: Checkerboard pattern (standard for alpha visualization)
- **Crosshatch**: Crosshatch pattern

**Use Cases**:
- Checker pattern reveals transparency/alpha regions
- Grey backgrounds provide neutral viewing environment
- Black for cinema-style presentation
- Crosshatch for edge detection

**Alpha Visualization**:
- Checkerboard clearly shows transparent areas
- Distinguish between black pixels and transparent pixels
- Essential for compositing review

## Status
- [x] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

**Analysis Date**: 2026-02-02

**Current State**:
- The viewer uses a solid black background (`background: #000;`) on the image canvas
- The viewer container uses `--viewer-bg` CSS variable (dark grey in dark theme)
- A checkerboard pattern exists only in `drawPlaceholder()` for the empty state (no media loaded)
- Stereo rendering has a `checkerboard` mode, but this is for 3D stereo interleaving, not alpha visualization
- No configurable background pattern system exists for alpha channel visualization during media viewing

**Related Files**:
- `/src/ui/components/Viewer.ts` - Main viewer component (line 312: `background: #000;`)
- `/src/ui/components/ViewerRenderingUtils.ts` - Contains `drawPlaceholder()` with checkerboard for empty state
- `/src/utils/ThemeManager.ts` - Manages `--viewer-bg` CSS variable

## Requirements
- Solid color backgrounds (black, grey, white)
- Checkerboard pattern for alpha
- Configurable checker size
- Custom background color picker
- Quick toggle between patterns
- Background color saved in preferences

## UI/UX Specification

### Control Location
Place the Background Pattern control in the **View tab** context toolbar, grouped with other analysis tools (after HSL Qualifier, before overlay toggles).

### Control Type
**Dropdown menu** with icon button trigger (similar to `FalseColorControl` or `ZebraControl`).

### Button Design
```typescript
// Button with icon and dropdown indicator
button.innerHTML = `${getIconSvg('grid', 'sm')}<span>BG</span><span style="font-size: 8px;">&#9660;</span>`;
button.dataset.testid = 'background-pattern-button';
```

### Dropdown Menu Structure
```
+---------------------------+
| Background Pattern        |
+---------------------------+
| [*] Black       (default) |
| [ ] Grey 18%              |
| [ ] Grey 50%              |
| [ ] White                 |
+---------------------------+
| [ ] Checkerboard          |
|     Size: [Small|Med|Lrg] |
| [ ] Crosshatch            |
+---------------------------+
| [ ] Custom Color...       |
|     [#____] [picker]      |
+---------------------------+
```

### Active State Indication
- Button shows accent highlight when non-default pattern is active
- Button label updates to show current pattern: "BG: Checker" or "BG: Grey18"

### Keyboard Shortcut
- `Shift+B` - Cycle through patterns: Black -> Grey18 -> Grey50 -> Checker -> Black
- `Shift+Alt+B` - Toggle checkerboard on/off (quick toggle for alpha work)

### State Persistence
- Store selected pattern in localStorage under `openrv.backgroundPattern`
- Include in session GTO file for project-specific settings

## Technical Notes

### Implementation Components

#### 1. BackgroundPattern Types (`/src/ui/components/BackgroundPatternControl.ts`)
```typescript
export type BackgroundPatternType =
  | 'black'
  | 'grey18'
  | 'grey50'
  | 'white'
  | 'checker'
  | 'crosshatch'
  | 'custom';

export interface BackgroundPatternState {
  pattern: BackgroundPatternType;
  checkerSize: 'small' | 'medium' | 'large'; // 8px, 16px, 32px
  customColor: string; // hex color for custom pattern
}

export const DEFAULT_BACKGROUND_PATTERN_STATE: BackgroundPatternState = {
  pattern: 'black',
  checkerSize: 'medium',
  customColor: '#1a1a1a',
};
```

#### 2. Pattern Colors
```typescript
export const PATTERN_COLORS = {
  black: '#000000',
  grey18: '#2e2e2e',  // 18% grey = 46 in RGB
  grey50: '#808080',  // 50% grey = 128 in RGB
  white: '#ffffff',
  checkerLight: '#808080',  // Light squares in checker
  checkerDark: '#404040',   // Dark squares in checker
  crosshatchBg: '#404040',
  crosshatchLine: '#808080',
};
```

#### 3. Viewer Integration

**Rendering Pipeline Position**: The background pattern should be rendered **before** the image, so it shows through transparent areas.

```typescript
// In Viewer.ts renderImage() method, before drawing the source image:
private renderBackgroundPattern(): void {
  if (this.backgroundState.pattern === 'black') {
    // Default - just use canvas background
    return;
  }

  const ctx = this.imageCtx;
  const { displayWidth, displayHeight } = this;

  switch (this.backgroundState.pattern) {
    case 'checker':
      this.drawCheckerboard(ctx, displayWidth, displayHeight);
      break;
    case 'crosshatch':
      this.drawCrosshatch(ctx, displayWidth, displayHeight);
      break;
    default:
      // Solid color
      ctx.fillStyle = PATTERN_COLORS[this.backgroundState.pattern]
        ?? this.backgroundState.customColor;
      ctx.fillRect(0, 0, displayWidth, displayHeight);
  }
}

private drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const sizes = { small: 8, medium: 16, large: 32 };
  const size = sizes[this.backgroundState.checkerSize];

  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const isLight = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = isLight ? PATTERN_COLORS.checkerLight : PATTERN_COLORS.checkerDark;
      ctx.fillRect(x, y, size, size);
    }
  }
}
```

#### 4. Session Integration

**GTO Storage** (`/src/core/session/SessionGTOStore.ts`):
```typescript
// Add to settings serialization
backgroundPattern: state.backgroundPattern?.pattern ?? 'black',
backgroundCheckerSize: state.backgroundPattern?.checkerSize ?? 'medium',
backgroundCustomColor: state.backgroundPattern?.customColor ?? '#1a1a1a',
```

**GTO Parsing** (`/src/core/session/Session.ts`):
```typescript
// Add to parseViewSettings()
const bgPattern = viewGroup.property('backgroundPattern')?.value() as string;
const bgCheckerSize = viewGroup.property('backgroundCheckerSize')?.value() as string;
const bgCustomColor = viewGroup.property('backgroundCustomColor')?.value() as string;

if (bgPattern) {
  settings.backgroundPattern = {
    pattern: bgPattern as BackgroundPatternType,
    checkerSize: (bgCheckerSize as 'small' | 'medium' | 'large') ?? 'medium',
    customColor: bgCustomColor ?? '#1a1a1a',
  };
}
```

#### 5. Test Helper State (`/src/test-helper.ts`)
```typescript
export interface ViewerState {
  // ... existing fields
  backgroundPattern: 'black' | 'grey18' | 'grey50' | 'white' | 'checker' | 'crosshatch' | 'custom';
  backgroundCheckerSize: 'small' | 'medium' | 'large';
  backgroundCustomColor: string;
}
```

### Performance Considerations
- Cache the checkerboard pattern as an ImageData or OffscreenCanvas when size doesn't change
- Only redraw pattern when pattern type or checker size changes
- Use globalCompositeOperation = 'destination-over' to draw pattern behind image

### Icon Requirement
Add a `grid` icon to `/src/ui/components/shared/Icons.ts` for the background pattern button:
```typescript
'grid': '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
```

## E2E Test Cases

### File: `/e2e/background-pattern.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { loadImageFile, getViewerState, waitForTestHelper, captureViewerScreenshot, imagesAreDifferent } from './fixtures';

test.describe('Background Pattern Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // BG-001: Default state
  test('BG-001: default background pattern is black', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png'); // PNG with transparency
    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');
  });

  // BG-002: Control visibility
  test('BG-002: background pattern control is visible in View tab', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    const control = page.locator('[data-testid="background-pattern-button"]');
    await expect(control).toBeVisible();
  });

  // BG-003: Dropdown opens
  test('BG-003: clicking button opens dropdown menu', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.waitForTimeout(100);
    const dropdown = page.locator('[data-testid="background-pattern-dropdown"]');
    await expect(dropdown).toBeVisible();
  });

  // BG-004: Select grey18
  test('BG-004: selecting Grey 18% changes background', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');
    const before = await captureViewerScreenshot(page);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="grey18"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey18');

    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  // BG-005: Select grey50
  test('BG-005: selecting Grey 50% changes background', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="grey50"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey50');
  });

  // BG-006: Select white
  test('BG-006: selecting White changes background', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="white"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('white');
  });

  // BG-007: Select checkerboard
  test('BG-007: selecting Checkerboard shows pattern behind alpha', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');
    const before = await captureViewerScreenshot(page);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="checker"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  // BG-008: Checkerboard size options
  test('BG-008: checkerboard size can be changed', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');

    // Enable checkerboard first
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="checker"]');
    await page.waitForTimeout(100);

    const beforeSmall = await captureViewerScreenshot(page);

    // Change to large
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-checker-size="large"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundCheckerSize).toBe('large');

    const afterLarge = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(beforeSmall, afterLarge)).toBe(true);
  });

  // BG-009: Select crosshatch
  test('BG-009: selecting Crosshatch shows pattern', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="crosshatch"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('crosshatch');
  });

  // BG-010: Keyboard shortcut Shift+B cycles patterns
  test('BG-010: Shift+B cycles through background patterns', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');

    // Start at black (default)
    let state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');

    // Cycle to grey18
    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey18');

    // Cycle to grey50
    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey50');

    // Cycle to checker
    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    // Cycle back to black
    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');
  });

  // BG-011: Keyboard shortcut Shift+Alt+B toggles checkerboard
  test('BG-011: Shift+Alt+B toggles checkerboard on/off', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');

    // Start at black
    let state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');

    // Toggle to checkerboard
    await page.keyboard.press('Shift+Alt+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    // Toggle back to black
    await page.keyboard.press('Shift+Alt+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');
  });

  // BG-012: Button shows active state
  test('BG-012: button shows active state when non-default pattern selected', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');

    await page.click('button[data-tab-id="view"]');
    const button = page.locator('[data-testid="background-pattern-button"]');

    // Default state - no highlight
    await expect(button).not.toHaveCSS('border-color', 'var(--accent-primary)');

    // Select checkerboard
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="checker"]');
    await page.waitForTimeout(100);

    // Should now have active styling
    const borderColor = await button.evaluate(el => getComputedStyle(el).borderColor);
    expect(borderColor).not.toBe('transparent');
  });

  // BG-013: State persists across frames
  test('BG-013: background pattern persists when changing frames', async ({ page }) => {
    await loadImageFile(page, 'test-video.mp4');

    // Set to checkerboard
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="checker"]');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    // Change frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Pattern should persist
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');
  });

  // BG-014: Dropdown closes on selection
  test('BG-014: dropdown closes after selecting pattern', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');

    const dropdown = page.locator('[data-testid="background-pattern-dropdown"]');
    await expect(dropdown).toBeVisible();

    await page.click('[data-bg-pattern="grey18"]');
    await page.waitForTimeout(100);

    await expect(dropdown).not.toBeVisible();
  });

  // BG-015: Custom color option
  test('BG-015: custom color can be set via color input', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="custom"]');
    await page.waitForTimeout(100);

    // Set custom color
    const colorInput = page.locator('[data-testid="background-custom-color"]');
    await colorInput.fill('#ff0000');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('custom');
    expect(state.backgroundCustomColor).toBe('#ff0000');
  });

  // BG-016: Works with opaque images
  test('BG-016: pattern visible under transparent areas only', async ({ page }) => {
    // Load image with partial transparency
    await loadImageFile(page, 'test-alpha.png');

    // Enable checkerboard
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="checker"]');
    await page.waitForTimeout(200);

    // Visual verification that checker shows through alpha
    // (This is primarily for visual regression testing)
    const screenshot = await captureViewerScreenshot(page);
    expect(screenshot).toBeTruthy();
  });

  // BG-017: Integration with channel view
  test('BG-017: checkerboard visible when viewing alpha channel', async ({ page }) => {
    await loadImageFile(page, 'test-alpha.png');

    // Enable checkerboard
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="checker"]');
    await page.waitForTimeout(100);

    // Switch to alpha channel view
    await page.click('[data-testid="channel-select-button"]');
    await page.click('[role="option"]:has-text("Alpha")');
    await page.waitForTimeout(200);

    // Both states should be set
    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');
    expect(state.channelMode).toBe('alpha');
  });
});
```

## Unit Test Cases

### File: `/src/ui/components/BackgroundPatternControl.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BackgroundPatternControl,
  BackgroundPatternState,
  DEFAULT_BACKGROUND_PATTERN_STATE,
  PATTERN_COLORS
} from './BackgroundPatternControl';

describe('BackgroundPatternControl', () => {
  let control: BackgroundPatternControl;

  beforeEach(() => {
    control = new BackgroundPatternControl();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const state = control.getState();
      expect(state.pattern).toBe('black');
      expect(state.checkerSize).toBe('medium');
      expect(state.customColor).toBe('#1a1a1a');
    });

    it('should render container with correct testid', () => {
      const element = control.render();
      expect(element.dataset.testid).toBe('background-pattern-control');
    });
  });

  describe('pattern selection', () => {
    it('should emit stateChanged when pattern changes', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setPattern('checker');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ pattern: 'checker' })
      );
    });

    it('should update state when setPattern is called', () => {
      control.setPattern('grey18');
      expect(control.getState().pattern).toBe('grey18');
    });

    it('should cycle patterns correctly', () => {
      expect(control.getState().pattern).toBe('black');

      control.cyclePattern();
      expect(control.getState().pattern).toBe('grey18');

      control.cyclePattern();
      expect(control.getState().pattern).toBe('grey50');

      control.cyclePattern();
      expect(control.getState().pattern).toBe('checker');

      control.cyclePattern();
      expect(control.getState().pattern).toBe('black');
    });
  });

  describe('checker size', () => {
    it('should update checker size', () => {
      control.setCheckerSize('large');
      expect(control.getState().checkerSize).toBe('large');
    });

    it('should emit stateChanged when checker size changes', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setCheckerSize('small');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ checkerSize: 'small' })
      );
    });
  });

  describe('custom color', () => {
    it('should update custom color', () => {
      control.setCustomColor('#ff0000');
      expect(control.getState().customColor).toBe('#ff0000');
    });

    it('should auto-select custom pattern when setting custom color', () => {
      control.setCustomColor('#00ff00');
      expect(control.getState().pattern).toBe('custom');
    });

    it('should validate hex color format', () => {
      expect(() => control.setCustomColor('invalid')).toThrow();
      expect(() => control.setCustomColor('#fff')).not.toThrow(); // 3-char hex
      expect(() => control.setCustomColor('#ffffff')).not.toThrow(); // 6-char hex
    });
  });

  describe('toggle checkerboard', () => {
    it('should toggle between black and checker', () => {
      expect(control.getState().pattern).toBe('black');

      control.toggleCheckerboard();
      expect(control.getState().pattern).toBe('checker');

      control.toggleCheckerboard();
      expect(control.getState().pattern).toBe('black');
    });

    it('should return to previous pattern when disabling checker', () => {
      control.setPattern('grey18');
      control.toggleCheckerboard();
      expect(control.getState().pattern).toBe('checker');

      control.toggleCheckerboard();
      expect(control.getState().pattern).toBe('grey18');
    });
  });

  describe('setState', () => {
    it('should set full state', () => {
      const newState: BackgroundPatternState = {
        pattern: 'crosshatch',
        checkerSize: 'large',
        customColor: '#123456',
      };

      control.setState(newState);
      expect(control.getState()).toEqual(newState);
    });

    it('should emit stateChanged', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setState({ pattern: 'white', checkerSize: 'small', customColor: '#000' });

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('keyboard handling', () => {
    it('should handle Shift+B to cycle patterns', () => {
      const handled = control.handleKeyboard('b', true, false);
      expect(handled).toBe(true);
      expect(control.getState().pattern).toBe('grey18');
    });

    it('should handle Shift+Alt+B to toggle checkerboard', () => {
      const handled = control.handleKeyboard('b', true, true);
      expect(handled).toBe(true);
      expect(control.getState().pattern).toBe('checker');
    });

    it('should return false for unhandled keys', () => {
      const handled = control.handleKeyboard('x', false, false);
      expect(handled).toBe(false);
    });
  });

  describe('isActive', () => {
    it('should return false for black (default)', () => {
      expect(control.isActive()).toBe(false);
    });

    it('should return true for non-default patterns', () => {
      control.setPattern('checker');
      expect(control.isActive()).toBe(true);

      control.setPattern('grey18');
      expect(control.isActive()).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should clean up dropdown from body', () => {
      control.render();
      // Simulate opening dropdown
      const button = control.render().querySelector('button');
      button?.click();

      control.dispose();

      // Dropdown should be removed from body
      expect(document.querySelector('[data-testid="background-pattern-dropdown"]')).toBeNull();
    });
  });
});
```

### File: `/src/ui/components/ViewerRenderingUtils.test.ts` (additions)

```typescript
// Add to existing ViewerRenderingUtils.test.ts

describe('drawBackgroundPattern', () => {
  it('should draw solid color for grey18', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'grey18', checkerSize: 'medium', customColor: '' });

    // Verify fill was called with grey18 color
    expect(ctx.fillStyle).toBe('#2e2e2e');
  });

  it('should draw checkerboard pattern with correct size', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'checker', checkerSize: 'medium', customColor: '' });

    // With medium (16px) checker on 100x100, expect many fillRect calls
    expect(fillRectSpy.mock.calls.length).toBeGreaterThan(10);
  });

  it('should scale checker size correctly', () => {
    const sizes = { small: 8, medium: 16, large: 32 };

    for (const [sizeName, expectedSize] of Object.entries(sizes)) {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      drawBackgroundPattern(ctx, 100, 100, {
        pattern: 'checker',
        checkerSize: sizeName as 'small' | 'medium' | 'large',
        customColor: ''
      });

      // Verify fillRect was called with correct size
      const calls = fillRectSpy.mock.calls;
      expect(calls[0][2]).toBe(expectedSize); // width
      expect(calls[0][3]).toBe(expectedSize); // height
    }
  });

  it('should use custom color for custom pattern', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'custom', checkerSize: 'medium', customColor: '#ff5500' });

    expect(ctx.fillStyle).toBe('#ff5500');
  });

  it('should not draw anything for black pattern (optimization)', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'black', checkerSize: 'medium', customColor: '' });

    // Black is handled by canvas background, no explicit draw needed
    expect(fillRectSpy).not.toHaveBeenCalled();
  });
});

describe('drawCrosshatchPattern', () => {
  it('should draw crosshatch lines', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const strokeSpy = vi.spyOn(ctx, 'stroke');

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'crosshatch', checkerSize: 'medium', customColor: '' });

    // Crosshatch should use stroke for lines
    expect(strokeSpy).toHaveBeenCalled();
  });
});
```

### Integration Test Additions

Add to `/src/core/session/Session.test.ts`:

```typescript
describe('background pattern GTO parsing', () => {
  it('should parse backgroundPattern from GTO', () => {
    const mockDTO = createMockGTODTO({
      viewGroup: {
        backgroundPattern: 'checker',
        backgroundCheckerSize: 'large',
        backgroundCustomColor: '#112233',
      },
    });

    const settings = session.parseViewSettings(mockDTO);

    expect(settings.backgroundPattern).toEqual({
      pattern: 'checker',
      checkerSize: 'large',
      customColor: '#112233',
    });
  });

  it('should default to black when not specified', () => {
    const mockDTO = createMockGTODTO({});
    const settings = session.parseViewSettings(mockDTO);

    expect(settings.backgroundPattern).toBeUndefined();
  });
});
```

Add to `/src/core/session/SessionGTOStore.test.ts`:

```typescript
describe('background pattern GTO storage', () => {
  it('should store backgroundPattern in GTO', () => {
    const state = {
      backgroundPattern: {
        pattern: 'checker' as const,
        checkerSize: 'small' as const,
        customColor: '#aabbcc',
      },
    };

    const gtoData = store.serializeViewSettings(state);

    expect(gtoData.backgroundPattern).toBe('checker');
    expect(gtoData.backgroundCheckerSize).toBe('small');
    expect(gtoData.backgroundCustomColor).toBe('#aabbcc');
  });
});
```
