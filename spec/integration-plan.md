# Session Data Integration Plan

> Plan for connecting parsed GTO/RV session values to UI widgets and application tools.

## Executive Summary

The GTOGraphLoader successfully parses session properties from .rv files, but several parsed values are not yet integrated into the application's UI and tools. This plan outlines the work needed to fully utilize all parsed session data.

---

## Current Integration Status

### Fully Integrated (Working)

| Property | Source | Target | Events | Status |
|----------|--------|--------|--------|--------|
| `fps` | sessionInfo.fps | Session._fps | fpsChanged | ✅ |
| `frame` | sessionInfo.frame | Session._currentFrame | frameChanged | ✅ |
| `inPoint/outPoint` | sessionInfo.inPoint/outPoint | Session._inPoint/_outPoint | inOutChanged | ✅ |
| `marks` | sessionInfo.marks | Session._marks Map | marksChanged | ✅ |
| `viewNode` | sessionInfo.viewNode | Used to find rootNode | - | ✅ |
| `matte.*` | sessionInfo.matte | Session._matteSettings → MatteOverlay | matteChanged | ✅ |
| `paintEffects.*` | sessionInfo.paintEffects | Session._sessionPaintEffects → PaintEngine | paintEffectsLoaded | ✅ |
| `inc` | sessionInfo.inc | Session._frameIncrement | frameIncrementChanged | ✅ |
| `version` | sessionInfo.version | Session._metadata.version | metadataChanged | ✅ |
| `clipboard` | sessionInfo.clipboard | Session._metadata.clipboard | metadataChanged | ✅ |
| `creationContext` | sessionInfo.creationContext | Session._metadata.creationContext | metadataChanged | ✅ |
| `origin` | sessionInfo.origin | Session._metadata.origin | metadataChanged | ✅ |
| `membershipContains` | sessionInfo.membershipContains | Session._metadata.membershipContains | metadataChanged | ✅ |
| `displayName` | sessionInfo.displayName | Session._metadata.displayName → HeaderBar | metadataChanged | ✅ |
| `comment` | sessionInfo.comment | Session._metadata.comment → HeaderBar tooltip | metadataChanged | ✅ |

### All Properties Fully Integrated ✅

All parsed session properties are now:
1. Stored in Session state
2. Events emitted on change
3. Connected to UI components (where applicable)
4. Correctly exported for round-trip support

---

## Integration Tasks

### Phase 1: High Priority (Core Functionality)

#### Task 1.1: Paint Effects Integration

**Goal:** Apply parsed paintEffects to PaintEngine when loading a session.

**Files to modify:**
- `src/core/session/Session.ts`

**Implementation:**

```typescript
// In Session.ts, after loading graph (around line 948)
// Apply paint effects from session info
if (result.sessionInfo.paintEffects) {
  const pe = result.sessionInfo.paintEffects;
  // Emit event for App.ts to apply to PaintEngine
  this.emit('paintEffectsLoaded', pe);
}
```

**Files to modify:**
- `src/App.ts`

**Implementation:**

```typescript
// In App.ts, connect session paint effects to PaintEngine
this.session.on('paintEffectsLoaded', (effects) => {
  if (effects.ghost !== undefined) {
    this.paintEngine.setGhostMode(
      effects.ghost,
      effects.ghostBefore ?? 3,
      effects.ghostAfter ?? 3
    );
  }
  if (effects.hold !== undefined) {
    this.paintEngine.setHoldMode(effects.hold);
  }
});
```

**Tests:**
- Load .rv file with ghost=1, verify PaintEngine.effects.ghost === true
- Load .rv file with hold=1, verify PaintEngine.effects.hold === true
- Load .rv file with ghostBefore=5, ghostAfter=7, verify values applied

---

#### Task 1.2: Matte Overlay Integration

**Goal:** Display matte overlay from session settings.

**Option A: Create new MatteOverlay component**

**Files to create:**
- `src/ui/components/MatteOverlay.ts`

**MatteOverlay Component:**

```typescript
export interface MatteSettings {
  show: boolean;
  aspect: number;        // e.g., 2.35 for cinemascope
  opacity: number;       // 0-1
  heightVisible: number; // -1 = auto, or specific value
  centerPoint: [number, number];
}

export class MatteOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: MatteSettings;

  constructor(container: HTMLElement) {
    // Create overlay canvas
  }

  setSettings(settings: Partial<MatteSettings>): void {
    // Update and redraw
  }

  draw(): void {
    // Draw letterbox/pillarbox based on aspect ratio
    // Apply opacity to matte areas
    // Respect centerPoint offset
  }
}
```

**Files to modify:**
- `src/core/session/Session.ts` - Store matte settings, emit event
- `src/App.ts` - Connect session matte to MatteOverlay

**Session.ts additions:**

```typescript
// Add property
private _matteSettings: MatteSettings | null = null;

get matteSettings(): MatteSettings | null {
  return this._matteSettings;
}

// In loadFromGTO, after marks:
if (result.sessionInfo.matte) {
  this._matteSettings = {
    show: result.sessionInfo.matte.show ?? false,
    aspect: result.sessionInfo.matte.aspect ?? 1.78,
    opacity: result.sessionInfo.matte.opacity ?? 0.66,
    heightVisible: result.sessionInfo.matte.heightVisible ?? -1,
    centerPoint: result.sessionInfo.matte.centerPoint ?? [0, 0],
  };
  this.emit('matteChanged', this._matteSettings);
}
```

**Option B: Integrate with existing SafeAreasOverlay**

Add matte overlay mode to SafeAreasOverlay instead of creating a new component.

**Files to modify:**
- `src/ui/components/SafeAreasOverlay.ts`

```typescript
// Add matte mode to SafeAreasOverlay
setMatteSettings(settings: MatteSettings): void {
  this.matteSettings = settings;
  this.draw();
}

// In draw(), add matte rendering before/after safe areas
private drawMatte(): void {
  if (!this.matteSettings?.show) return;
  // Calculate letterbox/pillarbox regions
  // Fill with semi-transparent black
}
```

**Recommended:** Option A (separate component) for cleaner separation of concerns.

---

### Phase 2: Medium Priority (Metadata & UX)

#### Task 2.1: Session Metadata Display

**Goal:** Display session name, comment, and version in UI.

**Files to modify:**
- `src/core/session/Session.ts` - Store metadata in unified `_metadata` object
- `src/ui/components/layout/HeaderBar.ts` - Display session name with tooltip

**Actual Implementation (Session.ts:177-185, 318-320):**

```typescript
// SessionMetadata interface (line 86-94)
export interface SessionMetadata {
  displayName: string;
  comment: string;
  version: number;
  origin: string;
  creationContext: number;
  clipboard: number;
  membershipContains: string[];
}

// Unified _metadata property (line 177-185)
private _metadata: SessionMetadata = {
  displayName: '',
  comment: '',
  version: 2,
  origin: 'openrv-web',
  creationContext: 0,
  clipboard: 0,
  membershipContains: [],
};

get metadata(): SessionMetadata { return this._metadata; }

// In loadFromGTO (line 1046-1062):
this._metadata = {
  displayName: result.sessionInfo.displayName ?? '',
  comment: result.sessionInfo.comment ?? '',
  version: result.sessionInfo.version ?? 2,
  origin: result.sessionInfo.origin ?? 'openrv-web',
  creationContext: result.sessionInfo.creationContext ?? 0,
  clipboard: result.sessionInfo.clipboard ?? 0,
  membershipContains: result.sessionInfo.membershipContains ?? [],
};
this.emit('metadataChanged', this._metadata);
```

**UI Implementation (HeaderBar.ts:304-375):**

- Session name displayed between file operations and playback controls
- Shows `displayName` or "Untitled" if empty
- Tooltip shows: displayName, comment (if any), origin (if not openrv-web), version

**Chosen approach:** HeaderBar with hover tooltip (recommended option #1).

---

#### Task 2.2: Frame Increment Integration

**Goal:** Use `inc` property for playback step size.

**Files to modify:**
- `src/core/session/Session.ts`

**Implementation:**

```typescript
// Add property
private _frameIncrement: number = 1;

get frameIncrement(): number { return this._frameIncrement; }

// In loadFromGTO:
if (result.sessionInfo.inc) {
  this._frameIncrement = result.sessionInfo.inc;
}

// Modify step methods to use increment
stepForward(): void {
  this.goToFrame(this._currentFrame + this._frameIncrement);
}

stepBackward(): void {
  this.goToFrame(this._currentFrame - this._frameIncrement);
}
```

**UI:**
- Add frame increment control to playback controls
- Or just use the parsed value silently for step operations

---

### Phase 3: Low Priority (Metadata Preservation)

#### Task 3.1: Session Origin Tracking

**Goal:** Track and display where the session originated.

**Files to modify:**
- `src/core/session/Session.ts`

```typescript
private _origin: string = 'openrv-web';

get origin(): string { return this._origin; }

// In loadFromGTO:
if (result.sessionInfo.origin) {
  this._origin = result.sessionInfo.origin;
}
```

**Use cases:**
- Display "Created in: OpenRV 2.0" in session info
- Compatibility warnings for sessions from older versions

---

#### Task 3.2: Creation Context Tracking

**Goal:** Preserve creation context for round-trip compatibility.

**Files to modify:**
- `src/core/session/Session.ts`

```typescript
private _creationContext: number = 0;

get creationContext(): number { return this._creationContext; }

// In loadFromGTO:
if (result.sessionInfo.creationContext !== undefined) {
  this._creationContext = result.sessionInfo.creationContext;
}
```

**Use case:** Preserve value when re-exporting session.

---

#### Task 3.3: Membership Contains Integration

**Goal:** Track which nodes belong to the session.

**Files to modify:**
- `src/core/session/Session.ts`

```typescript
private _membershipContains: string[] = [];

get membershipContains(): string[] { return this._membershipContains; }

// In loadFromGTO:
if (result.sessionInfo.membershipContains) {
  this._membershipContains = result.sessionInfo.membershipContains;
}
```

**Use case:** Node management, graph validation, export.

---

#### Task 3.4: Clipboard State

**Goal:** Preserve clipboard state for full RV compatibility.

**Files to modify:**
- `src/core/session/Session.ts`

```typescript
private _clipboardState: number = 0;

get clipboardState(): number { return this._clipboardState; }

// In loadFromGTO:
if (result.sessionInfo.clipboard !== undefined) {
  this._clipboardState = result.sessionInfo.clipboard;
}
```

**Use case:** Preserve value when re-exporting session.

---

## Implementation Order

### Sprint 1: Core Functionality ✅ COMPLETED
1. [x] Task 1.1: Paint Effects Integration
2. [x] Task 1.2: Matte Overlay Integration

### Sprint 2: User Experience ✅ COMPLETED
3. [x] Task 2.1: Session Metadata Display (HeaderBar shows session name with tooltip for comment/origin/version)
4. [x] Task 2.2: Frame Increment Integration

### Sprint 3: Compatibility ✅ COMPLETED
5. [x] Task 3.1: Session Origin Tracking
6. [x] Task 3.2: Creation Context Tracking
7. [x] Task 3.3: Membership Contains Integration
8. [x] Task 3.4: Clipboard State

### Round-trip Export ✅ COMPLETED
9. [x] SessionGTOExporter uses actual session values (not hardcoded defaults)
10. [x] Round-trip tests verify export preserves all session properties

---

## Testing Strategy

### Unit Tests

For each integration task:
1. Parse .rv file with specific property values
2. Verify Session stores the values correctly
3. Verify events are emitted
4. Verify UI components receive and display values

### Integration Tests

1. **Paint Effects Round-trip:**
   - Load .rv with ghost mode enabled
   - Verify PaintToolbar shows ghost enabled
   - Modify ghost settings
   - Export session
   - Reload and verify settings preserved

2. **Matte Overlay Round-trip:**
   - Load .rv with matte settings
   - Verify matte overlay displayed correctly
   - Modify matte aspect ratio
   - Export and reload
   - Verify settings preserved

3. **Session Metadata Display:**
   - Load .rv with displayName and comment
   - Verify info displayed in UI
   - Verify export preserves metadata

---

## File Change Summary

| File | Changes | Status |
|------|---------|--------|
| `src/core/session/Session.ts` | Add properties, event emissions, getters | ✅ Done |
| `src/App.ts` | Connect session events to UI components | ✅ Done |
| `src/ui/components/MatteOverlay.ts` | New component | ✅ Done |
| `src/ui/components/layout/HeaderBar.ts` | Add metadata display (session name + tooltip) | ✅ Done |
| `src/ui/components/Viewer.ts` | Integrate MatteOverlay | ✅ Done |
| `src/ui/components/PaintToolbar.ts` | Sync with session paint effects (via effectsChanged) | ✅ Done |
| `src/core/session/SessionGTOExporter.ts` | Export actual session values for round-trip | ✅ Done |

---

## Event Flow After Integration (Verified)

```
GTO File Load
     │
     ▼
GTOGraphLoader.loadGTOGraph()
     │
     ▼
Session.loadFromGTO()
     │
     ├──▶ Apply fps, frame, marks, in/out (existing)
     │
     ├──▶ Apply frameIncrement ──▶ emit('frameIncrementChanged')
     │                                    │
     │                                    ▼
     │                          Used by stepForward()/stepBackward()
     │
     ├──▶ Apply paintEffects ──▶ emit('paintEffectsLoaded')
     │                                    │
     │                                    ▼
     │                          App.ts listener (App.ts:887)
     │                                    │
     │                                    ▼
     │                          PaintEngine.setGhostMode()
     │                          PaintEngine.setHoldMode()
     │                                    │
     │                                    ▼
     │                          emit('effectsChanged')
     │                                    │
     │                                    ▼
     │                          PaintToolbar.updateGhostButton()
     │
     ├──▶ Apply matteSettings ──▶ emit('matteChanged')
     │                                    │
     │                                    ▼
     │                          App.ts listener (App.ts:901)
     │                                    │
     │                                    ▼
     │                          MatteOverlay.setSettings()
     │
     └──▶ Apply metadata ──▶ emit('metadataChanged')
                                    │
                                    ▼
                          HeaderBar.updateSessionNameDisplay()
                          (shows displayName, tooltip with comment/origin/version)
```

---

---

## Implementation Log

### 2026-01-21: Initial Implementation

**Files Created:**
- `src/ui/components/MatteOverlay.ts` - New matte overlay component

**Files Modified:**
- `src/core/session/Session.ts`
  - Added `MatteSettings` and `SessionMetadata` interfaces
  - Added `_matteSettings`, `_sessionPaintEffects`, `_metadata`, `_frameIncrement` properties
  - Added events: `paintEffectsLoaded`, `matteChanged`, `metadataChanged`, `frameIncrementChanged`
  - Modified `stepForward()` / `stepBackward()` to use `_frameIncrement`
  - Applied all session properties in `loadFromGTO()`

- `src/ui/components/Viewer.ts`
  - Integrated MatteOverlay component
  - Added `getMatteOverlay()` method

- `src/App.ts`
  - Connected `paintEffectsLoaded` event to PaintEngine
  - Connected `matteChanged` event to MatteOverlay
  - Added `metadataChanged` listener (logs displayName)

- `src/core/session/SessionGTOExporter.ts`
  - Fixed `buildSessionObject()` to use actual session values instead of hardcoded defaults
  - Now correctly exports: frameIncrement, matteSettings, paintEffects, metadata

**Tests Added:**
- `e2e/session-integration.spec.ts` - 41 E2E tests for session integration
- `src/core/session/SessionGTOExporter.test.ts` - 15 round-trip export tests

**Test Results:**
- 3640 unit tests passing
- 234 exporter tests passing

### 2026-01-21: Session Metadata UI Display (Task 2.1)

**Files Modified:**
- `src/ui/components/layout/HeaderBar.ts`
  - Added `sessionNameDisplay` element between file ops and playback controls
  - Added `createSessionNameDisplay()` method to create UI element
  - Added `updateSessionNameDisplay()` method to update from session metadata
  - Bound `metadataChanged` event to update display
  - Shows session displayName (or "Untitled")
  - Tooltip shows: displayName, comment, origin (if not openrv-web), version

- `src/ui/components/layout/HeaderBar.test.ts`
  - Added 9 unit tests (HDR-U160 to HDR-U168) for session name display

- `e2e/session-integration.spec.ts`
  - Added 6 e2e tests (SI-E050 to SI-E055) for metadata UI integration

**Test Results:**
- 3649 unit tests passing (60 HeaderBar tests)
- All e2e tests passing

---

*Plan created: 2026-01-21*
*Implementation completed: 2026-01-21*
*Based on: GTOGraphLoader analysis, Session.ts review, UI component exploration*
