# 07 - Batch Inline Style Mutations

## Problem Description

The wipe line and split screen line positioning functions set multiple individual CSS properties on DOM elements one at a time. Each `element.style.property = value` assignment can trigger a style recalculation. When multiple properties are set sequentially on the same element, the browser may need to process each one independently, leading to unnecessary overhead. Consolidating these into a single `cssText` assignment (or using `Object.assign` to `style`) ensures the browser processes all changes as a single batch.

**Impact:** In `updateWipeLinePosition`, up to 5 individual style mutations on the wipe line element plus 2-3 on each label element per call. In `updateSplitScreenPosition`, up to 6 individual style mutations on the split line plus 2-3 on each label element. These are called during wipe/split-screen drag interactions and on every render frame when wipe/split mode is active.

## Current Code

### ViewerWipe.ts

**File:** `src/ui/components/ViewerWipe.ts`

#### updateWipeLinePosition - horizontal mode (lines 131-152)

```typescript
if (wipeState.mode === 'horizontal') {
  // Vertical line for horizontal wipe
  const x = canvasLeft + displayWidth * position;
  wipeLine.style.width = '3px';
  wipeLine.style.height = `${displayHeight}px`;
  wipeLine.style.left = `${x - 1}px`;
  wipeLine.style.top = `${canvasTop}px`;
  wipeLine.style.cursor = 'ew-resize';

  // Position labels at bottom of each side, hide at boundaries
  updateWipeLabelVisibility(
    wipeLabelA,
    position,
    true,
    `${canvasLeft + 10}px`,
    `${canvasTop + displayHeight - 30}px`
  );
  updateWipeLabelVisibility(
    wipeLabelB,
    position,
    false,
    `${x + 10}px`,
    `${canvasTop + displayHeight - 30}px`
  );
}
```

#### updateWipeLinePosition - vertical mode (lines 153-177)

```typescript
} else if (wipeState.mode === 'vertical') {
  // Horizontal line for vertical wipe
  const y = canvasTop + displayHeight * position;
  wipeLine.style.width = `${displayWidth}px`;
  wipeLine.style.height = '3px';
  wipeLine.style.left = `${canvasLeft}px`;
  wipeLine.style.top = `${y - 1}px`;
  wipeLine.style.cursor = 'ns-resize';

  // Position labels on left side, hide at boundaries
  updateWipeLabelVisibility(
    wipeLabelA,
    position,
    true,
    `${canvasLeft + 10}px`,
    `${canvasTop + 10}px`
  );
  updateWipeLabelVisibility(
    wipeLabelB,
    position,
    false,
    `${canvasLeft + 10}px`,
    `${y + 10}px`
  );
}
```

#### updateWipeLabelVisibility (lines 84-101)

```typescript
function updateWipeLabelVisibility(
  label: HTMLElement,
  position: number,
  isLowBoundary: boolean,
  left: string,
  top: string
): void {
  const shouldHide = isLowBoundary
    ? position < WIPE_LABEL_HIDE_THRESHOLD_LOW
    : position > WIPE_LABEL_HIDE_THRESHOLD_HIGH;

  if (shouldHide) {
    label.style.display = 'none';
  } else {
    label.style.display = 'block';
    label.style.left = left;
    label.style.top = top;
  }
}
```

### ViewerSplitScreen.ts

**File:** `src/ui/components/ViewerSplitScreen.ts`

#### updateSplitScreenPosition - horizontal split (lines 116-142)

```typescript
if (state.mode === 'splitscreen-h') {
  const x = canvasLeft + displayWidth * position;
  splitLine.style.width = '4px';
  splitLine.style.height = `${displayHeight}px`;
  splitLine.style.left = `${x - 2}px`;
  splitLine.style.top = `${canvasTop}px`;
  splitLine.style.cursor = 'ew-resize';
  splitLine.style.background = 'linear-gradient(to bottom, var(--accent-primary), rgba(var(--accent-primary-rgb), 0.5))';

  if (position < LABEL_HIDE_THRESHOLD_LOW) {
    labelA.style.display = 'none';
  } else {
    labelA.style.display = 'block';
    labelA.style.left = `${canvasLeft + 12}px`;
    labelA.style.top = `${canvasTop + displayHeight - 40}px`;
  }

  if (position > LABEL_HIDE_THRESHOLD_HIGH) {
    labelB.style.display = 'none';
  } else {
    labelB.style.display = 'block';
    labelB.style.left = `${canvasLeft + displayWidth - 40}px`;
    labelB.style.top = `${canvasTop + displayHeight - 40}px`;
  }
}
```

#### updateSplitScreenPosition - vertical split (lines 143-170)

```typescript
} else if (state.mode === 'splitscreen-v') {
  const y = canvasTop + displayHeight * position;
  splitLine.style.width = `${displayWidth}px`;
  splitLine.style.height = '4px';
  splitLine.style.left = `${canvasLeft}px`;
  splitLine.style.top = `${y - 2}px`;
  splitLine.style.cursor = 'ns-resize';
  splitLine.style.background = 'linear-gradient(to right, var(--accent-primary), rgba(var(--accent-primary-rgb), 0.5))';

  if (position < LABEL_HIDE_THRESHOLD_LOW) {
    labelA.style.display = 'none';
  } else {
    labelA.style.display = 'block';
    labelA.style.left = `${canvasLeft + 12}px`;
    labelA.style.top = `${canvasTop + 12}px`;
  }

  if (position > LABEL_HIDE_THRESHOLD_HIGH) {
    labelB.style.display = 'none';
  } else {
    labelB.style.display = 'block';
    labelB.style.left = `${canvasLeft + 12}px`;
    labelB.style.top = `${canvasTop + displayHeight - 40}px`;
  }
}
```

## Implementation Plan

### Step 1: Batch wipe line styles in ViewerWipe.ts

Replace individual style assignments with a single `cssText` assignment that preserves the existing base styles. The wipe line element is created with `style.cssText` set to base positioning styles (position: absolute, etc.), so the batched update must include those.

**Important:** When using `cssText`, it replaces all inline styles. We need to either: (a) include all styles in the `cssText` string, or (b) use a helper that preserves base styles. Approach (a) is cleaner since we know all the styles.

```typescript
export function updateWipeLinePosition(
  wipeState: WipeState,
  elements: WipeUIElements,
  containerRect: DOMRect,
  canvasRect: DOMRect,
  displayWidth: number,
  displayHeight: number
): void {
  const { wipeLine, wipeLabelA, wipeLabelB } = elements;

  if (wipeState.mode === 'off') {
    wipeLine.style.display = 'none';
    wipeLabelA.style.display = 'none';
    wipeLabelB.style.display = 'none';
    return;
  }

  const canvasLeft = canvasRect.left - containerRect.left;
  const canvasTop = canvasRect.top - containerRect.top;
  const position = wipeState.position;

  // Base styles that are always present on the wipe line
  const baseStyles = 'position: absolute; background: var(--accent-primary); z-index: 10; pointer-events: auto; display: block;';

  if (wipeState.mode === 'horizontal') {
    const x = canvasLeft + displayWidth * position;
    wipeLine.style.cssText = `${baseStyles} width: 3px; height: ${displayHeight}px; left: ${x - 1}px; top: ${canvasTop}px; cursor: ew-resize;`;

    batchLabelStyle(wipeLabelA, position < WIPE_LABEL_HIDE_THRESHOLD_LOW,
      canvasLeft + 10, canvasTop + displayHeight - 30);
    batchLabelStyle(wipeLabelB, position > WIPE_LABEL_HIDE_THRESHOLD_HIGH,
      x + 10, canvasTop + displayHeight - 30);
  } else if (wipeState.mode === 'vertical') {
    const y = canvasTop + displayHeight * position;
    wipeLine.style.cssText = `${baseStyles} width: ${displayWidth}px; height: 3px; left: ${canvasLeft}px; top: ${y - 1}px; cursor: ns-resize;`;

    batchLabelStyle(wipeLabelA, position < WIPE_LABEL_HIDE_THRESHOLD_LOW,
      canvasLeft + 10, canvasTop + 10);
    batchLabelStyle(wipeLabelB, position > WIPE_LABEL_HIDE_THRESHOLD_HIGH,
      canvasLeft + 10, y + 10);
  }
}
```

#### Step 2: Add batched label helper

```typescript
const LABEL_BASE_STYLES = 'position: absolute; font-size: 12px; color: white; text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events: none; z-index: 11;';

function batchLabelStyle(label: HTMLElement, shouldHide: boolean, left: number, top: number): void {
  if (shouldHide) {
    label.style.display = 'none';
  } else {
    label.style.cssText = `${LABEL_BASE_STYLES} display: block; left: ${left}px; top: ${top}px;`;
  }
}
```

> **Note:** Check the actual base styles from `createWipeUIElements()` to ensure all styles are preserved. The `LABEL_BASE_STYLES` string above is illustrative and should be verified against the actual element creation code.

### Step 3: Batch split screen line styles in ViewerSplitScreen.ts

Apply the same pattern to `updateSplitScreenPosition`:

```typescript
export function updateSplitScreenPosition(
  state: SplitScreenState,
  elements: SplitScreenUIElements,
  containerRect: DOMRect,
  canvasRect: DOMRect,
  displayWidth: number,
  displayHeight: number
): void {
  const { splitLine, labelA, labelB } = elements;

  if (state.mode === 'off') {
    splitLine.style.display = 'none';
    labelA.style.display = 'none';
    labelB.style.display = 'none';
    return;
  }

  const canvasLeft = canvasRect.left - containerRect.left;
  const canvasTop = canvasRect.top - containerRect.top;
  const position = state.position;

  const splitBaseStyles = 'position: absolute; z-index: 10; pointer-events: auto; display: block;';

  if (state.mode === 'splitscreen-h') {
    const x = canvasLeft + displayWidth * position;
    splitLine.style.cssText = `${splitBaseStyles} width: 4px; height: ${displayHeight}px; left: ${x - 2}px; top: ${canvasTop}px; cursor: ew-resize; background: linear-gradient(to bottom, var(--accent-primary), rgba(var(--accent-primary-rgb), 0.5));`;

    batchSplitLabel(labelA, position < LABEL_HIDE_THRESHOLD_LOW,
      canvasLeft + 12, canvasTop + displayHeight - 40);
    batchSplitLabel(labelB, position > LABEL_HIDE_THRESHOLD_HIGH,
      canvasLeft + displayWidth - 40, canvasTop + displayHeight - 40);
  } else if (state.mode === 'splitscreen-v') {
    const y = canvasTop + displayHeight * position;
    splitLine.style.cssText = `${splitBaseStyles} width: ${displayWidth}px; height: 4px; left: ${canvasLeft}px; top: ${y - 2}px; cursor: ns-resize; background: linear-gradient(to right, var(--accent-primary), rgba(var(--accent-primary-rgb), 0.5));`;

    batchSplitLabel(labelA, position < LABEL_HIDE_THRESHOLD_LOW,
      canvasLeft + 12, canvasTop + 12);
    batchSplitLabel(labelB, position > LABEL_HIDE_THRESHOLD_HIGH,
      canvasLeft + 12, canvasTop + displayHeight - 40);
  }
}
```

### Step 4: Add batched split label helper

```typescript
const SPLIT_LABEL_BASE_STYLES = 'position: absolute; font-size: 14px; font-weight: bold; color: white; text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events: none; z-index: 11;';

function batchSplitLabel(label: HTMLElement, shouldHide: boolean, left: number, top: number): void {
  if (shouldHide) {
    label.style.display = 'none';
  } else {
    label.style.cssText = `${SPLIT_LABEL_BASE_STYLES} display: block; left: ${left}px; top: ${top}px;`;
  }
}
```

### Step 5: Verify base styles from element creation functions

Before finalizing the `baseStyles` strings, read the `createWipeUIElements()` and `createSplitScreenUIElements()` functions to ensure all initial CSS properties are captured. The `cssText` approach replaces all inline styles, so any properties set during element creation must be included in the batched strings.

## Testing Approach

1. **Visual regression - wipe mode:** Enable horizontal wipe, drag the wipe line across the canvas. Verify the line, labels, and boundary hiding behavior are visually identical to before. Repeat for vertical wipe.

2. **Visual regression - split screen:** Enable horizontal split screen, drag the divider. Verify the line, gradient background, and label positioning are identical. Repeat for vertical split screen.

3. **Label visibility thresholds:** Drag the wipe/split line to positions below 10% and above 90% and verify labels hide/show at the correct thresholds.

4. **Mode switching:** Switch between off, horizontal, and vertical modes. Verify elements are correctly shown/hidden.

5. **Performance verification:** Use Chrome DevTools Performance tab, record a wipe drag interaction. Compare "Recalculate Style" events before and after the change. Should see fewer style recalculation events.

6. **Style completeness:** Inspect the wipe line and labels in DevTools Elements panel. Verify all expected CSS properties are present and match the pre-change values. This is critical to ensure no styles from the creation function are lost.

7. **Existing tests:** Run `ViewerWipe.test.ts` and `ViewerSplitScreen.test.ts` (if they exist) to verify no regressions.

## Acceptance Criteria

- [ ] Wipe line visual appearance is unchanged in horizontal and vertical modes
- [ ] Split screen line visual appearance is unchanged in both modes
- [ ] Wipe labels show/hide at correct position thresholds
- [ ] Split screen labels show/hide at correct position thresholds
- [ ] Gradient backgrounds on split screen line are preserved
- [ ] Cursor styles (ew-resize, ns-resize) are preserved
- [ ] All base styles from element creation are preserved in batched cssText
- [ ] Fewer style recalculation events during drag interactions (measurable in DevTools)
- [ ] All existing tests pass
