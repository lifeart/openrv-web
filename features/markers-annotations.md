# Markers and Annotations

## Original OpenRV Implementation
OpenRV provides marking and navigation features for review workflows:

**Timeline Marks**:
- User-defined marks at specific frames
- Automatic marks at source boundaries
- Quick navigation between marks (arrow keys)
- Visual mark indicators on timeline

**Mark Types**:
- Source boundary marks (automatic)
- User-placed marks
- In/out point markers

**Navigation**:
- Jump to next/previous mark
- Jump to specific frame number
- Navigate to mark by index

**Mark Management**:
- Add marks at current frame
- Remove individual marks
- Clear all marks
- Marks saved with session

**Drawing/Annotation Tools**:
(Based on reference to annotation capabilities in widgets)
- Drawing overlays on frames
- Text annotations
- Shape tools
- Per-frame annotations

Note: Detailed annotation features may be available through packages/extensions.

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Implementation Summary

The markers and annotations feature is **fully implemented** in openrv-web with comprehensive functionality:

### Markers (Timeline Marks)

**Implemented Components:**
- `Session` class (`/src/core/session/Session.ts`) - Core marker data management
- `MarkerListPanel` component (`/src/ui/components/MarkerListPanel.ts`) - Visual marker management UI
- `Timeline` component (`/src/ui/components/Timeline.ts`) - Visual marker indicators on timeline

**Features:**
- Add frame markers with M key or UI button
- Marker notes (editable with rich text support)
- Marker colors (8-color palette, cycling via click)
- Visual markers displayed on timeline with note indicators
- Navigation to marker frame by clicking
- Delete individual markers
- Clear all markers (with confirmation)
- Markers persist in session state
- Current frame marker highlighting

**Keyboard Shortcuts:**
- `M` - Add/toggle marker at current frame
- `Shift+Alt+M` - Toggle marker list panel visibility

### Annotations (Drawing/Paint Tools)

**Implemented Components:**
- `PaintEngine` class (`/src/paint/PaintEngine.ts`) - Core annotation management
- `PaintRenderer` class (`/src/paint/PaintRenderer.ts`) - Annotation rendering
- `PaintToolbar` component (`/src/ui/components/PaintToolbar.ts`) - Drawing tools UI

**Drawing Tools:**
- Pen tool (freehand drawing) - P key
- Eraser tool - E key
- Text annotations - T key
- Rectangle shapes - R key
- Ellipse shapes - O key
- Line shapes - L key
- Arrow shapes - A key
- Pan/Select tool - V key

**Features:**
- Per-frame annotations (stored by frame number)
- Multiple brush types (Circle, Gaussian)
- Configurable stroke color (color picker + presets)
- Configurable stroke width (slider)
- Ghost mode (show annotations from nearby frames) - G key
- Hold mode (annotations persist across frames) - X key
- Undo/Redo support (Ctrl+Z / Ctrl+Y)
- Clear current frame annotations
- Navigation between annotated frames (. and , keys)
- Annotation indicators on timeline (yellow triangles)

**Annotation Export:**
- JSON export (`/src/utils/AnnotationJSONExporter.ts`)
- PDF export with thumbnails (`/src/utils/AnnotationPDFExporter.ts`)
- Export via Export menu dropdown

## Requirements Checklist

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Add frame markers | Done | Session.setMarker(), M key |
| Navigate between markers | Done | Click marker entry, panel navigation |
| Marker labels/notes | Done | MarkerListPanel note editing |
| Marker colors/categories | Done | 8-color palette, click to cycle |
| Visual markers on timeline | Done | Timeline.draw() renders markers |
| Drawing tools (freehand, shapes) | Done | PaintEngine, PaintToolbar |
| Text annotations | Done | Text tool with formatting |
| Per-frame annotations | Done | PaintEngine.annotations Map |
| Export annotations | Done | JSON and PDF exporters |
| Annotation persistence in session | Done | GTO session serialization |

## UI/UX Specification

### Marker Panel (MarkerListPanel)
- **Location:** Floating panel, right side of viewer (right: 10px, top: 60px)
- **Dimensions:** 320px width, max 450px height
- **Toggle:** Shift+Alt+M keyboard shortcut
- **Style:** Semi-transparent dark background (`--overlay-bg`), rounded corners (8px)

**Panel Layout:**
```
+------------------------------------------+
| Markers                  [+Add][Clear][X]|
+------------------------------------------+
| (Color) Frame 1 (00:00:00:00)    [Edit][Del]|
|         Note text here...                 |
+------------------------------------------+
| (Color) Frame 25 (00:00:01:00)   [Edit][Del]|
|         Click edit to add a note          |
+------------------------------------------+
```

**Interactions:**
- Click frame info to navigate
- Click color circle to cycle colors
- Click edit icon to open note textarea
- Ctrl+Enter to save note, Escape to cancel

### Annotate Tab (Paint Tools)
- **Location:** Context toolbar when Annotate tab (5) is active
- **Keyboard:** Tab 5 switches to Annotate mode

**Tool Layout:**
```
[Pan][Pen][Eraser][Text] | [Rect][Ellipse][Line][Arrow] | [Size: ===] [Color] | [Undo][Redo][Clear] | [Ghost][Hold]
```

**Tool Shortcuts:**
- V = Pan/Select
- P = Pen
- E = Eraser
- T = Text
- R = Rectangle
- O = Ellipse
- L = Line
- A = Arrow
- B = Toggle brush type
- G = Toggle ghost mode
- X = Toggle hold mode

## Technical Notes

### Data Structures

**Marker Interface (`Session.ts`):**
```typescript
interface Marker {
  frame: number;
  note: string;
  color: string; // Hex color like '#ff0000'
}
```

**Annotation Types (`/src/paint/types.ts`):**
- `PenStroke` - Freehand drawing with points array
- `TextAnnotation` - Text with position, size, font, styling
- `ShapeAnnotation` - Rectangle, ellipse, line, arrow shapes

**Paint Effects:**
- `ghost: boolean` - Show nearby frame annotations
- `ghostBefore: number` - Frames before to show
- `ghostAfter: number` - Frames after to show
- `hold: boolean` - Annotations persist on all subsequent frames

### Event Flow

1. User draws annotation -> PaintEngine records stroke
2. PaintEngine emits 'strokeAdded' -> Timeline redraws with annotation indicator
3. User changes frame -> PaintRenderer renders annotations for current frame
4. User enables ghost mode -> PaintRenderer shows faded nearby annotations

### Export Formats

**JSON Export Structure:**
```typescript
interface AnnotationExportData {
  version: 1;
  exportedAt: string;
  source: 'openrv-web';
  effects?: { hold, ghost, ghostBefore, ghostAfter };
  frameRange: { start, end, totalFrames };
  statistics: { totalAnnotations, penStrokes, textAnnotations, shapeAnnotations, annotatedFrames };
  frames: Record<number, Annotation[]>;
}
```

**PDF Export:**
- Uses browser print dialog
- Includes frame thumbnails (configurable size)
- Timecode information
- Annotation summary table
- Color swatches for each annotation

## E2E Test Coverage

### Existing E2E Tests (`e2e/markers.spec.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| MKR-E001 | Marker panel is hidden by default | Pass |
| MKR-E002 | Shift+Alt+M toggles marker panel visibility | Pass |
| MKR-E003 | Clicking close button hides marker panel | Pass |
| MKR-E010 | Empty state message shown when no markers | Pass |
| MKR-E011 | Pressing M adds marker at current frame | Pass |
| MKR-E012 | Clicking Add button adds marker | Pass |
| MKR-E013 | Marker entry appears in panel after adding | Pass |
| MKR-E014 | Clicking Clear All removes all markers | Pass |
| MKR-E020 | Clicking marker entry navigates to frame | Pass |
| MKR-E021 | Current frame marker is highlighted | Pass |
| MKR-E030 | Marker has default color | Pass |
| MKR-E031 | Clicking color button cycles marker color | Pass |
| MKR-E040 | Clicking edit button shows note input | Pass |
| MKR-E041 | Entering text and clicking save updates note | Pass |
| MKR-E042 | Ctrl+Enter saves note | Pass |
| MKR-E043 | Escape cancels note editing | Pass |
| MKR-E050 | Clicking delete button removes marker | Pass |
| MKR-E060 | Edit button has aria-label | Pass |
| MKR-E061 | Delete button has aria-label | Pass |
| MKR-R001 | Space key inserts space in note input (not toggle playback) | Pass |
| MKR-R002 | Home/End keys move cursor in note input | Pass |
| MKR-R003 | Arrow keys work for text selection in note input | Pass |
| MKR-R004 | Letter keys type in note input (no shortcuts) | Pass |
| MKR-R005 | Keyboard shortcuts work when input not focused | Pass |
| MKR-R006 | Escape cancels editing without side effects | Pass |
| MKR-R007 | Number keys type in note input (no tab switching) | Pass |
| MKR-R008 | Ctrl+Enter saves note from input field | Pass |
| MKR-R009 | Enter key allows multiline input in note | Pass |

### Existing E2E Tests (`e2e/paint-tools.spec.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| PAINT-010 | Selecting pan tool with V key updates state | Pass |
| PAINT-011 | Selecting pen tool with P key updates state | Pass |
| PAINT-012 | Selecting eraser tool with E key updates state | Pass |
| PAINT-013 | Selecting text tool with T key updates state | Pass |
| PAINT-014 | Toggling brush type with B key updates state | Pass |
| PAINT-015 | Selecting rectangle tool with R key | Pass |
| PAINT-016 | Selecting ellipse tool with O key | Pass |
| PAINT-017 | Selecting line tool with L key | Pass |
| PAINT-018 | Selecting arrow tool with A key | Pass |
| PAINT-020 | Drawing stroke modifies canvas and adds to annotatedFrames | Pass |
| PAINT-021 | Drawing multiple strokes adds to undo stack | Pass |
| PAINT-022 | Erasing strokes modifies canvas | Pass |
| PAINT-030 | Changing stroke color updates state | Pass |
| PAINT-031 | Clicking preset color updates state | Pass |
| PAINT-040 | Adjusting stroke width updates state | Pass |
| PAINT-050-058 | Shape tool selection and drawing | Pass |
| PAINT-060 | Toggling ghost mode with G key | Pass |
| PAINT-070 | Undo removes stroke and updates state | Pass |
| PAINT-071 | Redo restores stroke | Pass |
| PAINT-080 | Clearing frame removes all annotations | Pass |
| PAINT-090 | Annotations stored per frame | Pass |
| PAINT-100 | Navigation with . and , keys between annotated frames | Pass |
| HOLD-E001-E008 | Hold mode functionality tests | Pass |

### Existing E2E Tests (`e2e/annotation-export.spec.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| ANN-EXP-E001 | Show annotation export options in export menu | Pass |
| ANN-EXP-E002 | Export annotations as JSON | Pass |
| ANN-EXP-E003 | Exported JSON contains valid structure | Pass |
| ANN-EXP-E004 | PDF export flow triggers | Pass |
| ANN-EXP-E005 | Export multiple annotation types | Pass |
| ANN-EXP-E006 | Include annotations from multiple frames | Pass |
| ANN-EXP-E007 | Handle export with no annotations | Pass |
| ANN-EXP-E008 | JSON has version and source fields | Pass |
| ANN-EXP-E009 | Annotation statistics are accurate | Pass |
| ANN-EXP-E010 | Ghost mode settings available for export | Pass |
| ANN-EXP-E011 | Hold mode settings available for export | Pass |
| ANN-EXP-E012 | Track annotations across frame navigation | Pass |

## Unit Test Coverage

### Existing Unit Tests (`src/ui/components/MarkerListPanel.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| MARK-U001 | Creates MarkerListPanel instance | Pass |
| MARK-U002 | Panel hidden by default | Pass |
| MARK-U003 | Panel has correct test ID | Pass |
| MARK-U010-U014 | Visibility toggle tests | Pass |
| MARK-U020-U025 | Marker list rendering tests | Pass |
| MARK-U030-U032 | Marker navigation tests | Pass |
| MARK-U040-U043 | Marker editing tests | Pass |
| MARK-U050-U051 | Marker color cycling tests | Pass |
| MARK-U060-U061 | Marker deletion tests | Pass |
| MARK-U070-U071 | Add marker button tests | Pass |
| MARK-U080-U083 | Clear all button tests | Pass |
| MARK-U090 | Close button test | Pass |
| MARK-U100-U101 | getState tests | Pass |

### Existing Unit Tests (`src/paint/PaintEngine.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| PAINT-001 | Initializes with default values | Pass |
| PAINT-002 | Sets tool and emits event | Pass |
| PAINT-003 | Begins stroke on pen tool | Pass |
| PAINT-004 | Continues stroke | Pass |
| PAINT-005 | Ends stroke and adds annotation | Pass |
| PAINT-006 | Adds text annotation | Pass |
| PAINT-007 | Removes annotation by id | Pass |
| + 40 more tests | Full coverage of PaintEngine | Pass |

### Existing Unit Tests (`src/utils/AnnotationJSONExporter.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| ANN-JSON-U001 | Exports empty annotations correctly | Pass |
| ANN-JSON-U002 | Exports pen strokes correctly | Pass |
| ANN-JSON-U003 | Exports text annotations correctly | Pass |
| ANN-JSON-U004 | Exports shape annotations correctly | Pass |
| ANN-JSON-U005-U019 | Full exporter coverage | Pass |

### Existing Unit Tests (`src/utils/AnnotationPDFExporter.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| ANN-PDF-U001-U021 | PDF exporter tests | Pass |

### Existing Unit Tests (`src/ui/components/Timeline.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| TML-001-TML-020 | Timeline tests including marker display | Pass |

## User Flow Verification

### Add Marker Flow
1. User navigates to desired frame
2. User presses M key (or opens marker panel with Shift+Alt+M, clicks Add)
3. Marker created with default color at current frame
4. Timeline shows marker indicator
5. Marker appears in marker list panel

**Status: Verified Working**

### Edit Marker Note Flow
1. User opens marker panel (Shift+Alt+M)
2. User clicks edit icon on marker entry
3. Textarea appears with existing note (if any)
4. User types note (supports Enter for multiline)
5. User presses Ctrl+Enter to save (or clicks Save button)
6. Note saved, textarea closes

**Status: Verified Working**

### Draw Annotation Flow
1. User switches to Annotate tab (key 5)
2. User selects pen tool (P key)
3. User clicks and drags on canvas to draw
4. Stroke rendered in real-time
5. On mouse up, stroke saved to current frame
6. Timeline shows annotation indicator (yellow triangle)
7. Undo available (Ctrl+Z)

**Status: Verified Working**

### Export Annotations Flow
1. User clicks Export button in header
2. User selects "Export Annotations (JSON)" or "Export Annotations (PDF)"
3. JSON: File downloads with .json extension
4. PDF: Print dialog opens with formatted annotation report

**Status: Verified Working**
