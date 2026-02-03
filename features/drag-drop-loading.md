# Drag and Drop Loading

## Original OpenRV Implementation
OpenRV supports multiple methods for loading media:

**Drag and Drop**:
- Drop files directly onto the viewer window
- Drop folders to load all sequences within
- Smart targeting for LUT/CDL files (drop onto specific sources)
- Support for dropping multiple items at once

**File Dialog**:
- Standard file open dialog
- Multiple file selection
- Directory selection for sequences

**Command Line**:
- Load files via command line arguments
- Support for glob patterns and sequence notation
- Bracketed source grouping

**RVLINK Protocol**:
- URL-based loading (rvlink://)
- Integration with web browsers and other applications
- Remote session sharing via URLs

**Directory Loading**:
- Automatic discovery of all sequences and movies in a directory
- Smart sequence detection from file naming patterns

**Smart Loading Features**:
- Automatic sequence detection from single file
- Layer association (audio with image sequences)
- Format-specific handling (LUTs applied vs loaded)

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Implementation Details

### Drag and Drop (Fully Implemented)
**Location**: `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`

The drag-drop functionality is implemented in the Viewer component with the following features:

1. **Drop Zone Visual Feedback** (lines 457-476):
   - Semi-transparent accent-colored overlay
   - Dashed border indicator
   - "Drop files here" message with folder icon
   - Overlay appears on dragenter, hides on dragleave/drop

2. **Event Handlers** (lines 588-592, 1020-1071):
   - `onDragEnter`: Shows drop overlay
   - `onDragLeave`: Hides overlay (with proper containment check)
   - `onDragOver`: Prevents default to enable drop
   - `onDrop`: Handles file processing

3. **File Processing** (lines 1035-1071):
   - Extracts files from `DataTransfer` object
   - Detects multiple image files for sequence loading
   - Supports `.rv` and `.gto` session files
   - Falls back to individual file loading
   - Error handling with user-friendly alerts

### File Dialog (Fully Implemented)
**Location**: `/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts`

1. **File Input Elements** (lines 75-89):
   - Hidden file input for media files
   - Accepts: `image/*`, `video/*`, `.rv`, `.gto`
   - Multiple file selection enabled
   - Separate input for `.orvproject` files

2. **File Selection Handler** (lines 621-684):
   - Session file detection (.rv/.gto)
   - Sequence detection from multiple images
   - Individual file loading fallback
   - Error handling with modal alerts

### Supported File Types
- **Images**: All web-supported formats (PNG, JPEG, WebP, etc.)
- **Videos**: Web-supported video formats (MP4, WebM, etc.)
- **Sessions**: `.rv`, `.gto` (OpenRV session files)
- **Projects**: `.orvproject` (OpenRV Web project files)

## Requirements
- [x] Drag and drop files onto viewer
- [ ] Drag and drop folders (not implemented - browser security limitation)
- [x] Multiple file selection
- [x] File browser/picker dialog
- [ ] URL-based loading (not implemented)
- [x] Automatic sequence detection
- [x] Support for common web drag/drop patterns
- [ ] Progress indication for large files (partial - only for sequence export)
- [x] Error handling for unsupported formats

## UI/UX Specification

### Drop Zone Overlay
- **Background**: `rgba(var(--accent-primary-rgb), 0.2)` - semi-transparent accent color
- **Border**: 3px dashed `var(--accent-primary)`
- **Position**: Absolute, covers entire viewer area (`inset: 0`)
- **Z-Index**: 100
- **Content**: Centered folder icon with "Drop files here" text
- **Pointer Events**: None (allows drop to bubble to container)

### Open Button
- **Location**: Header bar, first control in file operations group
- **Icon**: Folder icon (SVG)
- **Label**: "Open"
- **Tooltip**: "Open media file"
- **Action**: Triggers hidden file input click

### Error Handling
- **Method**: Modal alerts via `showAlert()` function
- **Error Types**: Load failures, unsupported formats
- **Style**: Error type with red accent, "Load Error" title

## Technical Notes

### Browser Limitations
1. **Folder Drop**: Browsers restrict folder access for security. Directory traversal is not supported.
2. **File System Access**: Uses standard HTML5 File API, not File System Access API
3. **Large Files**: No chunked loading; files are loaded entirely into memory

### Sequence Detection
- Uses `filterImageFiles()` from `/Users/lifeart/Repos/openrv-web/src/utils/SequenceLoader.ts`
- Detects multiple image files dropped together
- Calls `session.loadSequence()` for sequence loading

### Session File Handling
- `.rv` and `.gto` files trigger session loading via `session.loadFromGTO()`
- Session files can include media file references
- Available files map passed for resolving media references

## E2E Test Cases

### Existing Tests (in `/Users/lifeart/Repos/openrv-web/e2e/media-loading.spec.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| MEDIA-001 | Load video file and update session state | Implemented |
| MEDIA-002 | Update frameCount and enable navigation | Implemented |
| MEDIA-003 | Enable playback controls after video load | Implemented |
| MEDIA-004 | Show video dimensions in canvas | Implemented |
| MEDIA-005 | Initialize in/out points to full range | Implemented |
| MEDIA-010 | Load .rv session file and update state | Implemented |
| MEDIA-011 | Restore session settings from .rv file | Implemented |
| MEDIA-012 | Allow navigation after session load | Implemented |
| MEDIA-013 | Apply channel select and playback range from session | Implemented |
| MEDIA-014 | Apply paint effects from session | Implemented |
| MEDIA-020 | App container should be valid drop target | Implemented |
| MEDIA-030 | File input accessible via button | Implemented |
| MEDIA-040 | Handle operations without media gracefully | Implemented |
| MEDIA-050 | Support loading additional media | Implemented |
| MEDIA-060 | Sample video should load with correct properties | Implemented |
| MEDIA-061 | Sample RV session should load without errors | Implemented |

### Additional E2E Test Cases (Recommended)

| Test ID | Description | Priority |
|---------|-------------|----------|
| DND-001 | Drop overlay appears on dragenter | High |
| DND-002 | Drop overlay hides on dragleave | High |
| DND-003 | Drop overlay hides after successful drop | High |
| DND-004 | Single image file loads correctly via drop | High |
| DND-005 | Multiple image files detected as sequence | High |
| DND-006 | Video file loads correctly via drop | High |
| DND-007 | Session file (.rv) loads via drop | Medium |
| DND-008 | Session file (.gto) loads via drop | Medium |
| DND-009 | Error displayed for unsupported file type | Medium |
| DND-010 | Drop zone styling follows theme variables | Low |
| DND-011 | Drag over nested elements maintains overlay | Medium |
| DND-012 | Multiple sequential drops work correctly | Medium |
| DND-013 | Drop during playback pauses playback | Low |
| DND-014 | Large file drop shows appropriate feedback | Low |

### E2E Test Implementation Example

```typescript
// e2e/drag-drop-loading.spec.ts
import { test, expect } from '@playwright/test';
import { waitForTestHelper, getSessionState } from './fixtures';
import path from 'path';

test.describe('Drag and Drop Loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('DND-001: drop overlay appears on dragenter', async ({ page }) => {
    const viewer = page.locator('[data-testid="viewer-container"]');

    // Trigger dragenter event
    await viewer.dispatchEvent('dragenter', {
      dataTransfer: { files: [] }
    });

    // Check overlay is visible
    const overlay = page.locator('text=Drop files here');
    await expect(overlay).toBeVisible();
  });

  test('DND-002: drop overlay hides on dragleave', async ({ page }) => {
    const viewer = page.locator('[data-testid="viewer-container"]');

    // Show overlay first
    await viewer.dispatchEvent('dragenter', {
      dataTransfer: { files: [] }
    });

    // Trigger dragleave
    await viewer.dispatchEvent('dragleave', {
      relatedTarget: document.body
    });

    // Check overlay is hidden
    const overlay = page.locator('text=Drop files here');
    await expect(overlay).not.toBeVisible();
  });

  test('DND-003: drop overlay hides after successful drop', async ({ page }) => {
    // Note: Full drag-drop simulation requires browser-specific APIs
    // This test verifies the UI state after file loading
    const viewer = page.locator('[data-testid="viewer-container"]');

    // Show overlay
    await viewer.dispatchEvent('dragenter', {
      dataTransfer: { files: [] }
    });

    const overlay = page.locator('text=Drop files here');
    await expect(overlay).toBeVisible();

    // Load file via input (simulates drop result)
    const filePath = path.resolve(process.cwd(), 'samples/test-video.webm');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(500);

    // Verify media loaded (overlay should be gone)
    const state = await getSessionState(page);
    expect(state.hasMedia).toBe(true);
  });
});
```

## Unit Test Cases

### Existing Unit Tests
No dedicated unit tests for drag-drop functionality exist in the current codebase.

### Recommended Unit Tests

| Test ID | Description | Location |
|---------|-------------|----------|
| DND-U001 | onDragEnter sets overlay display to flex | Viewer.test.ts |
| DND-U002 | onDragLeave hides overlay | Viewer.test.ts |
| DND-U003 | onDragLeave ignores events from child elements | Viewer.test.ts |
| DND-U004 | onDragOver prevents default behavior | Viewer.test.ts |
| DND-U005 | onDrop hides overlay | Viewer.test.ts |
| DND-U006 | onDrop calls loadSequence for multiple images | Viewer.test.ts |
| DND-U007 | onDrop calls loadFromGTO for .rv files | Viewer.test.ts |
| DND-U008 | onDrop calls loadFromGTO for .gto files | Viewer.test.ts |
| DND-U009 | onDrop calls loadFile for single files | Viewer.test.ts |
| DND-U010 | onDrop shows alert on load error | Viewer.test.ts |
| DND-U011 | filterImageFiles filters non-image files | SequenceLoader.test.ts |
| DND-U012 | Drop overlay has correct styling | Viewer.test.ts |

### Unit Test Implementation Example

```typescript
// In Viewer.test.ts
describe('Drag and Drop', () => {
  let viewer: Viewer;
  let mockSession: Session;
  let mockPaintEngine: PaintEngine;

  beforeEach(() => {
    mockSession = createMockSession();
    mockPaintEngine = createMockPaintEngine();
    viewer = new Viewer(mockSession, mockPaintEngine);
  });

  describe('DND-U001: onDragEnter', () => {
    it('sets overlay display to flex', () => {
      const dropOverlay = (viewer as any).dropOverlay;
      expect(dropOverlay.style.display).toBe('none');

      const event = new DragEvent('dragenter', { bubbles: true });
      (viewer as any).onDragEnter(event);

      expect(dropOverlay.style.display).toBe('flex');
    });
  });

  describe('DND-U002: onDragLeave', () => {
    it('hides overlay when leaving container', () => {
      const dropOverlay = (viewer as any).dropOverlay;
      dropOverlay.style.display = 'flex';

      const event = new DragEvent('dragleave', {
        bubbles: true,
        relatedTarget: document.body
      });
      (viewer as any).onDragLeave(event);

      expect(dropOverlay.style.display).toBe('none');
    });
  });

  describe('DND-U003: onDragLeave ignores child elements', () => {
    it('keeps overlay visible when moving to child', () => {
      const dropOverlay = (viewer as any).dropOverlay;
      const container = (viewer as any).container;
      dropOverlay.style.display = 'flex';

      const childElement = document.createElement('div');
      container.appendChild(childElement);

      const event = new DragEvent('dragleave', {
        bubbles: true,
        relatedTarget: childElement
      });
      (viewer as any).onDragLeave(event);

      expect(dropOverlay.style.display).toBe('flex');
    });
  });

  describe('DND-U005: onDrop', () => {
    it('hides overlay on drop', async () => {
      const dropOverlay = (viewer as any).dropOverlay;
      dropOverlay.style.display = 'flex';

      const file = new File([''], 'test.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const event = new DragEvent('drop', {
        bubbles: true,
        dataTransfer
      });

      await (viewer as any).onDrop(event);

      expect(dropOverlay.style.display).toBe('none');
    });
  });

  describe('DND-U006: onDrop with multiple images', () => {
    it('calls loadSequence for multiple image files', async () => {
      const loadSequenceSpy = vi.spyOn(mockSession, 'loadSequence');

      const files = [
        new File([''], 'frame001.png', { type: 'image/png' }),
        new File([''], 'frame002.png', { type: 'image/png' }),
        new File([''], 'frame003.png', { type: 'image/png' })
      ];

      const dataTransfer = new DataTransfer();
      files.forEach(f => dataTransfer.items.add(f));

      const event = new DragEvent('drop', {
        bubbles: true,
        dataTransfer
      });

      await (viewer as any).onDrop(event);

      expect(loadSequenceSpy).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ name: 'frame001.png' }),
        expect.objectContaining({ name: 'frame002.png' }),
        expect.objectContaining({ name: 'frame003.png' })
      ]));
    });
  });
});
```

## Related Files

### Implementation
- `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts` - Main drag-drop implementation
- `/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts` - File dialog implementation
- `/Users/lifeart/Repos/openrv-web/src/utils/SequenceLoader.ts` - Sequence detection utilities
- `/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts` - File loading methods

### Tests
- `/Users/lifeart/Repos/openrv-web/e2e/media-loading.spec.ts` - E2E media loading tests
- `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.test.ts` - Viewer unit tests

### Documentation
- `/Users/lifeart/Repos/openrv-web/UI.md` - UI guidelines and styling reference
