# Image Sequence Detection

## Original OpenRV Implementation
OpenRV automatically detects and loads image sequences from various naming conventions:

**Padding Formats Supported**:
- `foo.#.tif` - Standard hash notation
- `foo.@@@@.tif` - At-sign padding (4 digits)
- `foo.%04d.tif` - Printf-style notation
- `foo.2-8#.tif` - Explicit frame range notation
- `foo.1-100x10#.tif` - Incremented sequences (every 10th frame)
- `foo.1,3,5,7,8,9#.tif` - Explicit frame list

**Negative Frame Support**:
- `foo.-010-020#.tif` - Range with negative start
- `foo.-010--5#.tif` - Negative to negative range

**Stereo Notation**:
- `foo.%04d.%V.exr` - Named stereo pairs (Left/Right)
- `foo.%04d.%v.exr` - Character pairs (L/R)
- Customizable via environment variables

**Detection Behavior**:
- Automatic detection from single file (-inferSequence)
- Disable auto-detection (-noSequence)
- Directory scan discovers all sequences

**Sequence Information**:
- First/last frame detection
- Missing frame handling
- Frame rate inference from metadata

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented (core features)

## Implementation Status

### What's Implemented

| Feature | Status | Location |
|---------|--------|----------|
| Basic sequence detection from multi-file selection | Done | `src/utils/SequenceLoader.ts` |
| Underscore separator (`frame_001.png`) | Done | `extractFrameNumber()` |
| Dash separator (`frame-001.png`) | Done | `extractFrameNumber()` |
| Dot separator (`frame.001.png`) | Done | `extractFrameNumber()` |
| No separator (`frame001.png`) | Done | `extractFrameNumber()` |
| Pattern display (`frame_####.png`) | Done | `detectPattern()` |
| Frame range detection (start/end) | Done | `createSequenceInfo()` |
| Missing frame detection | Done | `detectMissingFrames()` |
| Missing frame query | Done | `isFrameMissing()` |
| Frame index lookup | Done | `getFrameIndexByNumber()` |
| Intelligent frame caching | Done | `preloadFrames()`, `releaseDistantFrames()` |
| Memory cleanup on dispose | Done | `disposeSequence()` |
| Session integration | Done | `Session.loadSequence()` |
| UI auto-detection (multi-file) | Done | `HeaderBar.handleFileSelect()` |
| SequenceSourceNode | Done | `src/nodes/sources/SequenceSourceNode.ts` |
| Printf notation parsing (`%04d`) | Done | `parsePrintfPattern()` |
| Hash notation parsing (`####`) | Done | `parseHashPattern()` |
| At-sign notation parsing (`@@@@`) | Done | `parseAtPattern()` |
| Pattern notation conversion | Done | `toHashNotation()`, `toPrintfNotation()` |
| Filename generation from pattern | Done | `generateFilename()` |
| Single file sequence inference | Done | `inferSequenceFromSingleFile()` |
| Directory/batch scanning | Done | `discoverSequences()`, `getBestSequence()` |
| Pattern matching | Done | `matchesPattern()`, `extractFrameFromPattern()` |
| Matching file discovery | Done | `findMatchingFiles()` |

### What's Not Implemented

| Feature | Priority | Notes |
|---------|----------|-------|
| ~~Printf-style notation (`%04d`)~~ | ~~Medium~~ | Done: `parsePrintfPattern()` |
| ~~Hash notation input (`####`)~~ | ~~Medium~~ | Done: `parseHashPattern()` |
| ~~At-sign notation (`@@@@`)~~ | ~~Low~~ | Done: `parseAtPattern()` |
| Explicit frame range (`foo.2-8#.tif`) | Medium | Useful for partial loads |
| Incremented sequences (`1-100x10#`) | Low | Every Nth frame |
| Explicit frame list (`1,3,5,7#`) | Low | Sparse sequences |
| Negative frame numbers | Medium | Animation industry standard |
| Stereo pair detection (`%V`, `%v`) | Medium | VFX/stereo workflows |
| ~~Single file inference~~ | ~~High~~ | Done: `inferSequenceFromSingleFile()` |
| ~~Directory scanning~~ | ~~High~~ | Done: `discoverSequences()`, `getBestSequence()` |
| Frame rate from metadata | Low | EXR/TIFF metadata |
| Manual frame range override UI | Medium | User control |
| Disable auto-detection flag | Low | Edge cases |

## Requirements
- [x] Common padding format detection (####, %04d) - Fully implemented
- [x] Frame range specification - Auto-detected
- [x] Missing frame detection and handling - Implemented
- [x] Directory scan for sequences - Implemented (`discoverSequences()`)
- [ ] Manual frame range override - Not implemented
- [ ] First frame number specification - Not implemented (auto-detected)
- [x] Support for various naming conventions - All basic patterns
- [ ] Stereo pair detection - Not implemented

## UI/UX Specification

### Current Implementation (Partial)

**File Loading:**
- Open button in HeaderBar allows multi-file selection
- When multiple image files are selected, automatically treated as sequence
- Single image file loaded as static image
- No explicit "Load Sequence" button

**Information Display:**
- Sequence name shown in HeaderBar session display
- Duration shown in timeline (frame count)
- FPS displayed in viewer info panel
- Missing frames not visually indicated

### Proposed Enhancements

**Load Sequence Dialog (Not Implemented):**
```
+------------------------------------------+
| Load Image Sequence                       |
+------------------------------------------+
| Pattern: frame_####.png                  |
| Start Frame: [1001]  End Frame: [1100]   |
| FPS: [24] v                              |
| [ ] Include missing frames               |
| [ ] Stereo mode: [None v]                |
+------------------------------------------+
| [Cancel]              [Load Sequence]    |
+------------------------------------------+
```

**Sequence Info Panel (Not Implemented):**
```
+------------------------------------------+
| Sequence Information                      |
+------------------------------------------+
| Name: shot_010_comp                       |
| Pattern: shot_010_comp_####.exr          |
| Range: 1001 - 1150 (150 frames)          |
| Missing: 1025, 1026, 1089 (3 frames)     |
| Resolution: 1920 x 1080                  |
| FPS: 24                                  |
+------------------------------------------+
```

**Timeline Missing Frame Indicator (Not Implemented):**
- Red tick marks on timeline for missing frames
- Tooltip showing missing frame number
- Option to skip or hold on missing frames

### Styling (per UI.md)

All UI elements should use CSS variables:
- Background: `var(--bg-secondary)`
- Text: `var(--text-primary)`
- Labels: `var(--text-secondary)`
- Borders: `var(--border-primary)`
- Inputs: Follow existing input patterns from color controls
- Buttons: Use `createButton()` from shared/Button.ts

## Technical Notes

### Architecture

```
User selects files
       |
       v
HeaderBar.handleFileSelect()
       |
       v
filterImageFiles() - Filter to image types
       |
       v
Session.loadSequence(files[])
       |
       v
createSequenceInfo()
  |-- filterImageFiles()
  |-- sortByFrameNumber()
  |     |-- extractFrameNumber() for each file
  |-- detectPattern()
  |-- loadFrameImage() for first frame (dimensions)
  |-- detectMissingFrames()
       |
       v
MediaSource { type: 'sequence', sequenceInfo, sequenceFrames }
       |
       v
Viewer.getSequenceFrame() / getSequenceFrameSync()
  |-- loadFrameImage()
  |-- preloadFrames()
  |-- releaseDistantFrames()
```

### Key Files

| File | Purpose |
|------|---------|
| `src/utils/SequenceLoader.ts` | Core sequence parsing and loading utilities |
| `src/utils/SequenceLoader.test.ts` | Unit tests for SequenceLoader |
| `src/nodes/sources/SequenceSourceNode.ts` | Node graph integration |
| `src/nodes/sources/SequenceSourceNode.test.ts` | Unit tests for SequenceSourceNode |
| `src/core/session/Session.ts` | Session integration (`loadSequence()`) |
| `src/ui/components/layout/HeaderBar.ts` | UI file selection handling |

### Frame Number Extraction Patterns

Current patterns in `FRAME_PATTERNS`:
```javascript
const FRAME_PATTERNS = [
  /(\d+)(?=\.[^.]+$)/,           // Any numbers before extension: file123.png
  /[._-](\d+)(?=\.[^.]+$)/,      // Separator then numbers: file_001.png
  /(\d{3,})(?=\.[^.]+$)/,        // 3+ digit numbers: file0001.png
];
```

### Memory Management

- **Preload window**: 5 frames ahead/behind current
- **Keep window**: 20 frames in memory
- **Blob URL lifecycle**: Created on load, revoked on release
- **Dispose**: All URLs revoked, images dereferenced

### Supported Image Formats

```javascript
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'exr'
]);
```

Note: EXR support is limited to browser-compatible EXR files (8-bit preview).

## E2E Test Cases

### Existing Coverage (via multi-file.spec.ts)
No direct sequence-specific e2e tests exist. Multi-file tests focus on A/B comparison.

### Required Test Cases

| ID | Test Case | Priority | Status |
|----|-----------|----------|--------|
| SEQ-001 | Load sequence from multiple numbered files | High | Not implemented |
| SEQ-002 | Sequence playback advances through frames | High | Not implemented |
| SEQ-003 | Timeline shows correct duration for sequence | High | Not implemented |
| SEQ-004 | Frame stepping works with sequence | High | Not implemented |
| SEQ-005 | Sequence with missing frames handles gaps | Medium | Not implemented |
| SEQ-006 | Different naming conventions detected | Medium | Not implemented |
| SEQ-007 | Sequence info displayed correctly | Medium | Not implemented |
| SEQ-008 | Export single frame from sequence | Medium | Not implemented |
| SEQ-009 | Memory released when switching sources | Medium | Not implemented |
| SEQ-010 | Large sequence (100+ frames) loads efficiently | Low | Not implemented |

### Test Implementation Details

**SEQ-001: Load sequence from multiple numbered files**
```typescript
test('SEQ-001: Load sequence from multiple numbered files', async ({ page }) => {
  // Setup: Create test sequence files (frame_001.png through frame_010.png)
  // Action: Select all files via file input
  // Assert: Viewer shows first frame
  // Assert: Timeline duration shows 10 frames
  // Assert: Source type is 'sequence'
});
```

**SEQ-002: Sequence playback advances through frames**
```typescript
test('SEQ-002: Sequence playback advances through frames', async ({ page }) => {
  // Setup: Load test sequence
  // Action: Press Space to play
  // Assert: Frame number increments
  // Assert: Canvas content changes between frames
  // Action: Press Space to pause
  // Assert: Playback stops
});
```

**SEQ-003: Timeline shows correct duration for sequence**
```typescript
test('SEQ-003: Timeline shows correct duration for sequence', async ({ page }) => {
  // Setup: Load 10-frame sequence
  // Assert: Timeline end frame shows 10
  // Assert: Duration display shows correct value
});
```

**SEQ-004: Frame stepping works with sequence**
```typescript
test('SEQ-004: Frame stepping works with sequence', async ({ page }) => {
  // Setup: Load sequence, pause at frame 1
  // Action: Press Right Arrow
  // Assert: Frame advances to 2
  // Assert: Canvas shows different content
  // Action: Press Left Arrow
  // Assert: Frame returns to 1
});
```

**SEQ-005: Sequence with missing frames handles gaps**
```typescript
test('SEQ-005: Sequence with missing frames handles gaps', async ({ page }) => {
  // Setup: Load sequence with gap (1, 2, 4, 5 - missing 3)
  // Action: Step through frames
  // Assert: Application doesn't crash on missing frame
  // Assert: Missing frame indicator shown (if implemented)
});
```

## Unit Test Cases

### Existing Coverage

| File | Test Count | Coverage |
|------|------------|----------|
| `SequenceLoader.test.ts` | 32 tests | ~95% |
| `SequenceSourceNode.test.ts` | 15 tests | ~90% |

### Test Case Summary

**SequenceLoader.test.ts:**
- SLD-001 through SLD-032: Filter, extract, detect, sort, load, release, dispose
- MF-001 through MF-012: Missing frame detection and handling

**SequenceSourceNode.test.ts:**
- SSN-001: Load sequence from files
- SSN-002: Update properties after load
- SSN-003: Throw error for invalid sequence
- SSN-004: Load frame on demand
- SSN-005: Preload adjacent frames
- SSN-006: Release distant frames
- SSN-007: Dispose sequence on cleanup

### Additional Unit Tests Needed

| ID | Test Case | Target |
|----|-----------|--------|
| SLD-033 | Printf notation parsing (`%04d`) | `extractFrameNumber()` |
| SLD-034 | Hash notation parsing (`####`) | `extractFrameNumber()` |
| SLD-035 | Negative frame numbers | `extractFrameNumber()` |
| SLD-036 | Stereo file detection | New function |
| SLD-037 | Frame range parsing | New function |
| SSN-008 | Process returns IPImage for loaded frame | `process()` |
| SSN-009 | Metadata correct after load | `loadFiles()` |

## Future Enhancements

1. **Directory Browser**: Allow selecting a folder to auto-discover sequences
2. **Sequence Browser UI**: Preview thumbnails of detected sequences
3. **Frame Range Editor**: UI to specify custom in/out points for sequence
4. **Missing Frame Handling Options**: Hold last frame, skip, or show placeholder
5. **Stereo Sequence Support**: Detect and load stereo pairs
6. **EXR Deep Support**: Multi-channel EXR with layer selection
7. **OCIO Integration**: Color space handling for EXR sequences
8. **Proxy Sequences**: Generate/load lower-res proxies for performance
