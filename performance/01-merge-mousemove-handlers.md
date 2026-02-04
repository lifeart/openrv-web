# 01 - Merge Duplicate Mousemove Handlers

## Problem Description

The Viewer component registers two separate `mousemove` event listeners on the same container element. Both handlers independently call `getBoundingClientRect()` and `getImageData()` on every mouse movement, doubling the cost of layout reads and expensive pixel reads. Since `getBoundingClientRect()` triggers a forced synchronous layout and `getImageData()` performs a full canvas pixel read, this duplication causes unnecessary jank during mouse interaction.

**Impact:** Every mousemove event triggers 2 forced layout reads (`getBoundingClientRect()`) and up to 2 full canvas pixel reads (`getImageData()`), where only 1 of each is needed.

## Current Code

**File:** `src/ui/components/Viewer.ts`

### Event Registration (lines 726-729)

```typescript
// Pixel probe events - track mouse movement for color sampling
this.container.addEventListener('mousemove', this.onMouseMoveForProbe);
this.container.addEventListener('mousemove', this.onMouseMoveForCursorColor);
this.container.addEventListener('mouseleave', this.onMouseLeaveForCursorColor);
this.container.addEventListener('click', this.onClickForProbe);
```

### Handler 1: onMouseMoveForProbe (lines 732-773)

```typescript
private onMouseMoveForProbe = (e: MouseEvent): void => {
  if (!this.pixelProbe.isEnabled()) return;

  // Throttle updates to ~60fps (16ms) for performance
  const now = Date.now();
  if (now - this.lastProbeUpdate < 16) {
    return;
  }
  this.lastProbeUpdate = now;

  // Get canvas-relative coordinates
  const canvasRect = this.imageCanvas.getBoundingClientRect();  // <-- Layout read #1
  const x = e.clientX - canvasRect.left;
  const y = e.clientY - canvasRect.top;

  // Check if within canvas bounds
  if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) {
    return;
  }

  // Scale to canvas pixel coordinates
  const scaleX = this.displayWidth / canvasRect.width;
  const scaleY = this.displayHeight / canvasRect.height;
  const canvasX = x * scaleX;
  const canvasY = y * scaleY;

  // Get image data for pixel value (rendered, after color pipeline)
  const imageData = this.getImageData();  // <-- Pixel read #1

  // Get source image data (before color pipeline) for source mode
  if (this.pixelProbe.getSourceMode() === 'source') {
    const sourceImageData = this.getSourceImageData();
    this.pixelProbe.setSourceImageData(sourceImageData);
  } else {
    this.pixelProbe.setSourceImageData(null);
  }

  // Update pixel probe
  this.pixelProbe.updateFromCanvas(canvasX, canvasY, imageData, this.displayWidth, this.displayHeight);
  this.pixelProbe.setOverlayPosition(e.clientX, e.clientY);
};
```

### Handler 2: onMouseMoveForCursorColor (lines 779-816)

```typescript
private onMouseMoveForCursorColor = (e: MouseEvent): void => {
  if (!this.cursorColorCallback) return;

  // Throttle updates to ~60fps (16ms)
  const now = Date.now();
  if (now - this.lastCursorColorUpdate < 16) {
    return;
  }
  this.lastCursorColorUpdate = now;

  const canvasRect = this.imageCanvas.getBoundingClientRect();  // <-- Layout read #2 (duplicate)
  const position = getPixelCoordinates(
    e.clientX,
    e.clientY,
    canvasRect,
    this.displayWidth,
    this.displayHeight
  );

  if (!position) {
    this.cursorColorCallback(null, null);
    return;
  }

  const imageData = this.getImageData();  // <-- Pixel read #2 (duplicate)
  if (!imageData) {
    this.cursorColorCallback(null, null);
    return;
  }

  const color = getPixelColor(imageData, position.x, position.y);
  if (!color) {
    this.cursorColorCallback(null, null);
    return;
  }

  this.cursorColorCallback(color, position);
};
```

## Implementation Plan

### Step 1: Combine the two throttle timestamps into one

Replace `lastProbeUpdate` and `lastCursorColorUpdate` with a single `lastMouseMoveUpdate` timestamp, since both handlers share the same 16ms throttle period.

### Step 2: Create a single merged handler

```typescript
private onMouseMoveForPixelSampling = (e: MouseEvent): void => {
  const probeEnabled = this.pixelProbe.isEnabled();
  const cursorColorEnabled = !!this.cursorColorCallback;

  // Early exit if neither consumer is active
  if (!probeEnabled && !cursorColorEnabled) return;

  // Single throttle for both consumers
  const now = Date.now();
  if (now - this.lastMouseMoveUpdate < 16) {
    return;
  }
  this.lastMouseMoveUpdate = now;

  // Single layout read
  const canvasRect = this.imageCanvas.getBoundingClientRect();

  // Compute canvas-relative coordinates once
  const position = getPixelCoordinates(
    e.clientX,
    e.clientY,
    canvasRect,
    this.displayWidth,
    this.displayHeight
  );

  // Handle out-of-bounds for cursor color
  if (!position) {
    if (cursorColorEnabled) {
      this.cursorColorCallback!(null, null);
    }
    return;
  }

  // Single pixel read, shared by both consumers
  const imageData = this.getImageData();

  // Dispatch to probe consumer
  if (probeEnabled && imageData) {
    if (this.pixelProbe.getSourceMode() === 'source') {
      const sourceImageData = this.getSourceImageData();
      this.pixelProbe.setSourceImageData(sourceImageData);
    } else {
      this.pixelProbe.setSourceImageData(null);
    }

    this.pixelProbe.updateFromCanvas(
      position.x, position.y, imageData,
      this.displayWidth, this.displayHeight
    );
    this.pixelProbe.setOverlayPosition(e.clientX, e.clientY);
  }

  // Dispatch to cursor color consumer
  if (cursorColorEnabled) {
    if (!imageData) {
      this.cursorColorCallback!(null, null);
      return;
    }
    const color = getPixelColor(imageData, position.x, position.y);
    if (!color) {
      this.cursorColorCallback!(null, null);
    } else {
      this.cursorColorCallback!(color, position);
    }
  }
};
```

### Step 3: Update event registration (lines 726-727)

Replace the two `addEventListener` calls with one:

```typescript
// Pixel probe + cursor color events - single handler for both consumers
this.container.addEventListener('mousemove', this.onMouseMoveForPixelSampling);
this.container.addEventListener('mouseleave', this.onMouseLeaveForCursorColor);
this.container.addEventListener('click', this.onClickForProbe);
```

### Step 4: Update cleanup / removeEventListener calls

Search for any corresponding `removeEventListener` calls for the old handlers and update them to reference `onMouseMoveForPixelSampling`.

### Step 5: Remove the old handlers and their separate throttle timestamps

Delete `onMouseMoveForProbe`, `onMouseMoveForCursorColor`, `lastProbeUpdate`, and `lastCursorColorUpdate`. Replace with `lastMouseMoveUpdate`.

## Testing Approach

1. **Functional - Pixel Probe:** Enable the pixel probe overlay, move the mouse over the viewer canvas, and verify that the pixel color values update correctly as the cursor moves. Verify the overlay follows the cursor position.

2. **Functional - Cursor Color (InfoPanel):** Open the InfoPanel, move the mouse over the viewer, and verify the color readout updates. Move the mouse off the canvas and verify it clears to null.

3. **Functional - Mouse Leave:** Verify that moving the mouse off the canvas still clears the cursor color callback (the `onMouseLeaveForCursorColor` handler remains unchanged).

4. **Performance - Single getBoundingClientRect:** Add a temporary counter or use the browser Performance DevTools to confirm that only one `getBoundingClientRect()` call occurs per mousemove event, not two.

5. **Performance - Single getImageData:** Confirm that `getImageData()` is called at most once per mousemove event when both probe and cursor color are active.

6. **Edge case - Neither enabled:** Verify no work is done when neither probe nor cursor color is active.

7. **Edge case - Only one enabled:** Verify correct behavior when only probe is enabled (no cursor color callback set) or only cursor color is enabled (probe disabled).

## Acceptance Criteria

- [ ] Only one `mousemove` event listener is registered on the container for pixel sampling
- [ ] `getBoundingClientRect()` is called at most once per mousemove event
- [ ] `getImageData()` is called at most once per mousemove event
- [ ] Pixel probe overlay displays correct color values and follows cursor
- [ ] InfoPanel cursor color readout works correctly
- [ ] Mouse leave clears cursor color as before
- [ ] Both consumers work independently (enabling one does not require the other)
- [ ] Throttle behavior (~60fps) is preserved
- [ ] All existing tests pass
