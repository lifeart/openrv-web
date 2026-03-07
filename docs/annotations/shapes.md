# Shape Tools

Shape tools create geometric annotations on the viewer canvas. They are useful for circling areas of interest, drawing attention to specific regions, and creating structured markup for review notes.

## Available Shapes

| Tool | Shortcut | Description |
|------|----------|-------------|
| Rectangle | `R` | Draw a rectangle by clicking and dragging |
| Ellipse | `O` | Draw an ellipse by clicking and dragging |
| Line | `L` | Draw a straight line between two points |
| Arrow | `A` | Draw a line with an arrowhead at the end |
| Polygon | -- | Draw a multi-point polygon (via toolbar) |

Select a shape tool from the toolbar or press the corresponding shortcut key while in the Annotate tab (key `5`).

## Drawing Shapes

### Rectangle and Ellipse

1. Select the tool (`R` for rectangle, `O` for ellipse)
2. Click on the canvas where one corner (or edge) should start
3. Drag to the opposite corner
4. Release the mouse button to finalize the shape

### Line and Arrow

1. Select the tool (`L` for line, `A` for arrow)
2. Click on the canvas at the start point
3. Drag to the end point
4. Release to finalize

Arrow shapes include an arrowhead at the end point, indicating direction.

## Fill and Stroke

Shapes support both fill and stroke options:

- **Stroke color** -- the outline color, set via the color picker or presets in the toolbar
- **Stroke width** -- the outline thickness, set via the width slider
- **Fill** -- shapes can optionally have a filled interior

Configure these properties before drawing the shape. The active settings apply to all subsequently drawn shapes.

## Spotlight Tool

Press `Shift+Q` to enable the spotlight tool. This creates a highlighted region (circle or rectangle) while dimming everything outside it. The effect draws the viewer's attention to a specific area of the image.

Spotlight is useful during presentations and review sessions to focus discussion on a particular region without the distraction of the surrounding image.

## Shape Annotations vs. Freehand

Shape annotations are stored as geometric primitives (type, position, dimensions, color, width) rather than as pixel data. This means they:

- Scale cleanly when zooming in and out
- Take less storage space than freehand strokes
- Can be precisely positioned using click-and-drag

Freehand pen strokes (see [Pen and Eraser](pen-eraser.md)) are better for organic, hand-drawn markup.

## Undo and Redo

Each shape placed on the canvas is an individual undo step. Press `Ctrl+Z` to remove the most recent shape. Press `Ctrl+Y` to restore it.

## Per-Frame Storage

Like all annotations, shapes are stored per frame. Each frame maintains its own collection of shapes, pen strokes, and text annotations independently.

---

## Related Pages

- [Pen and Eraser](pen-eraser.md) -- freehand drawing tools
- [Text Annotations](text.md) -- add text labels
- [Per-Frame Modes](per-frame-modes.md) -- ghost and hold modes
- [Exporting Annotations](export.md) -- JSON and PDF export
