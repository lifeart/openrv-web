# Session Data Integration Plan

> Plan for connecting parsed GTO/RV session values to UI widgets and application tools.

## Executive Summary

The GTOGraphLoader successfully parses session properties from .rv files, but several parsed values are not yet integrated into the application's UI and tools. This plan outlines the work needed to fully utilize all parsed session data.

---

## Current Integration Status

### Fully Integrated (Working)

| Property | Source | Target | Events |
|----------|--------|--------|--------|
| `fps` | sessionInfo.fps | Session._fps | fpsChanged |
| `frame` | sessionInfo.frame | Session._currentFrame | frameChanged |
| `inPoint/outPoint` | sessionInfo.inPoint/outPoint | Session._inPoint/_outPoint | inOutChanged |
| `marks` | sessionInfo.marks | Session._marks Map | marksChanged |
| `viewNode` | sessionInfo.viewNode | Used to find rootNode | - |

### Parsed But Not Integrated

| Property | Parsed Location | Current State | Priority |
|----------|-----------------|---------------|----------|
| `matte.*` | sessionInfo.matte | Not consumed | High |
| `paintEffects.*` | sessionInfo.paintEffects | Not consumed | High |
| `displayName` | sessionInfo.displayName | Not consumed | Medium |
| `comment` | sessionInfo.comment | Not consumed | Medium |
| `inc` | sessionInfo.inc | Not consumed | Medium |
| `version` | sessionInfo.version | Not consumed | Low |
| `clipboard` | sessionInfo.clipboard | Not consumed | Low |
| `creationContext` | sessionInfo.creationContext | Not consumed | Low |
| `origin` | sessionInfo.origin | Not consumed | Low |
| `membershipContains` | sessionInfo.membershipContains | Not consumed | Low |

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
- `src/core/session/Session.ts` - Store metadata
- `src/ui/components/HeaderBar.ts` or new `SessionInfoPanel.ts`

**Session.ts additions:**

```typescript
// Add properties
private _displayName: string = '';
private _comment: string = '';
private _sessionVersion: number = 2;

get displayName(): string { return this._displayName; }
get comment(): string { return this._comment; }
get sessionVersion(): number { return this._sessionVersion; }

// In loadFromGTO:
if (result.sessionInfo.displayName) {
  this._displayName = result.sessionInfo.displayName;
}
if (result.sessionInfo.comment) {
  this._comment = result.sessionInfo.comment;
}
if (result.sessionInfo.version) {
  this._sessionVersion = result.sessionInfo.version;
}
this.emit('metadataChanged');
```

**UI Options:**

1. **HeaderBar tooltip/dropdown:** Show session info on hover/click
2. **Info Panel:** Dedicated panel showing session metadata
3. **Title bar:** Display session name in window/tab title

**Recommended:** Add to HeaderBar with hover tooltip showing name + comment.

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

### Sprint 1: Core Functionality
1. [ ] Task 1.1: Paint Effects Integration
2. [ ] Task 1.2: Matte Overlay Integration

### Sprint 2: User Experience
3. [ ] Task 2.1: Session Metadata Display
4. [ ] Task 2.2: Frame Increment Integration

### Sprint 3: Compatibility
5. [ ] Task 3.1: Session Origin Tracking
6. [ ] Task 3.2: Creation Context Tracking
7. [ ] Task 3.3: Membership Contains Integration
8. [ ] Task 3.4: Clipboard State

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

| File | Changes |
|------|---------|
| `src/core/session/Session.ts` | Add properties, event emissions, getters |
| `src/App.ts` | Connect session events to UI components |
| `src/ui/components/MatteOverlay.ts` | New component (or modify SafeAreasOverlay) |
| `src/ui/components/HeaderBar.ts` | Add metadata display |
| `src/ui/components/PaintToolbar.ts` | Sync with session paint effects |

---

## Event Flow After Integration

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
     ├──▶ Apply paintEffects ──▶ emit('paintEffectsLoaded')
     │                                    │
     │                                    ▼
     │                          App.ts listener
     │                                    │
     │                                    ▼
     │                          PaintEngine.setGhostMode()
     │                          PaintEngine.setHoldMode()
     │                                    │
     │                                    ▼
     │                          PaintToolbar updates UI
     │
     ├──▶ Apply matteSettings ──▶ emit('matteChanged')
     │                                    │
     │                                    ▼
     │                          App.ts listener
     │                                    │
     │                                    ▼
     │                          MatteOverlay.setSettings()
     │
     ├──▶ Apply metadata ──▶ emit('metadataChanged')
     │                                │
     │                                ▼
     │                        HeaderBar.updateTitle()
     │
     └──▶ Apply inc, origin, etc. (stored for export)
```

---

*Plan created: 2026-01-21*
*Based on: GTOGraphLoader analysis, Session.ts review, UI component exploration*
