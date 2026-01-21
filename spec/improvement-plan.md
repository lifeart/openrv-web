# OpenRV-Web Player Improvement Plan

> Plan for correctly handling all .rv (GTO) fields across save, update, creation, loading, and exporting operations.

## Executive Summary

Based on analysis of the GTO specification (`spec.md`), usage guide (`usage.md`), and current codebase implementation, this plan identifies gaps and proposes improvements to achieve full .rv file compatibility.

---

## Current State Analysis

### What Works Well

| Feature | Loading | Saving | Round-trip |
|---------|---------|--------|------------|
| RVSession (playback state) | ✅ | ✅ | ✅ |
| RVFileSource (media paths) | ✅ | ✅ | ✅ |
| RVPaint (annotations) | ✅ | ✅ | ✅ |
| Node graph structure | ✅ | ✅ (preserved) | ✅ |
| Basic color adjustments | ✅ | ✅ | ✅ |
| CDL grading | ✅ | ✅ | ✅ |
| 2D transforms (incl. scale/translate) | ✅ | ✅ | ✅ |
| Lens distortion (full Brown model) | ✅ | ✅ | ✅ |
| Crop settings | ✅ | ✅ | ✅ |
| Stereo display modes | ✅ | ✅ | ✅ |
| RVColor (full: CDL, luminanceLUT) | ✅ | ✅ | ✅ |
| RVLinearize (full) | ✅ | ✅ | ✅ |
| RVLookLUT/RVCacheLUT | ✅ | ✅ | ✅ |
| RVSequence/EDL | ✅ | ✅ | ✅ |
| RVStack (blend modes, opacity) | ✅ | ✅ | ✅ |
| RVRetime (speed, warp, explicit) | ✅ | ✅ | ✅ |
| RVDisplayColor | ✅ | ✅ | ✅ |
| RVDisplayStereo | ✅ | ✅ | ✅ |
| RVSourceStereo | ✅ | ✅ | ✅ |
| RVFormat (crop, channels) | ✅ | ✅ | ✅ |
| RVOverlay (rect, text, window, matte) | ✅ | ✅ | - |
| RVChannelMap | ✅ | ✅ | - |
| RVLayoutGroup/RVLayout | ✅ | ✅ | - |
| RVRetimeGroup | ✅ | ✅ | - |
| RVDisplayGroup | ✅ | ✅ | - |
| RVHistogram | ✅ | ✅ | ✅ |
| RVSwitchGroup/RVSwitch | ✅ | ✅ | - |
| RVFolderGroup | ✅ | ✅ | - |
| RVViewGroup | ✅ | ✅ | - |
| RVSoundTrack | ✅ | ✅ | - |
| Waveform | ✅ | ✅ | - |
| RVOCIO | ✅ | ✅ | - |
| RVICC (ICC Transforms) | ✅ | ✅ | - |
| RVColorExposure | ✅ | ✅ | - |
| RVColorCurve | ✅ | ✅ | - |
| RVColorTemperature | ✅ | ✅ | - |
| RVColorSaturation | ✅ | ✅ | - |
| RVColorVibrance | ✅ | ✅ | - |
| RVColorShadow | ✅ | ✅ | - |
| RVColorHighlight | ✅ | ✅ | - |
| RVColorGrayScale | ✅ | ✅ | - |
| RVColorCDL | ✅ | ✅ | - |
| RVColorLinearToSRGB | ✅ | ✅ | - |
| RVColorSRGBToLinear | ✅ | ✅ | - |
| RVFilterGaussian | ✅ | ✅ | - |
| RVUnsharpMask | ✅ | ✅ | - |
| RVNoiseReduction | ✅ | ✅ | - |
| RVClarity | ✅ | ✅ | - |
| RVRotateCanvas | ✅ | ✅ | - |
| RVResize | ✅ | ✅ | - |
| RVCache | ✅ | ✅ | - |
| RVPrimaryConvert | ✅ | ✅ | - |
| RVDispTransform2D | ✅ | ✅ | - |

### Gaps Identified

#### 1. Missing Node Type Support

The following node types are defined in the spec but not fully implemented:

**Source Nodes:**
| Node | Parse | Create | Update | Priority |
|------|-------|--------|--------|----------|
| RVImageSource | ⚠️ Partial | ❌ | ❌ | Medium |
| RVMovieSource | ⚠️ Partial | ❌ | ❌ | Low |

**Group Nodes:**
| Node | Parse | Create | Update | Priority |
|------|-------|--------|--------|----------|
| RVSequenceGroup | ✅ | ✅ | ✅ | ~~High~~ Done |
| RVSequence (EDL) | ✅ | ✅ | ✅ | ~~High~~ Done |
| RVStackGroup | ✅ | ✅ | ✅ | ~~High~~ Done |
| RVStack | ✅ | ✅ | ✅ | ~~High~~ Done |
| RVLayoutGroup | ✅ | ✅ | ❌ | Medium |
| RVSwitchGroup | ✅ | ✅ | ❌ | Medium |
| RVFolderGroup | ✅ | ✅ | ❌ | Low |
| RVRetimeGroup | ✅ | ✅ | ❌ | Medium |

**Processing Nodes:**
| Node | Parse | Create | Update | Priority |
|------|-------|--------|--------|----------|
| RVLinearize | ✅ | ✅ | ✅ | ~~High~~ Done |
| RVLookLUT | ✅ | ✅ | ✅ | ~~High~~ Done |
| RVCacheLUT | ✅ | ✅ | ✅ | ~~Low~~ Done |
| RVDisplayColor | ✅ | ✅ | ✅ | ~~Medium~~ Done |
| RVDisplayStereo | ✅ | ✅ | ✅ | ~~Medium~~ Done |
| RVSourceStereo | ✅ | ✅ | ✅ | ~~Medium~~ Done |

**Filter Nodes:**
| Node | Parse | Create | Update | Priority |
|------|-------|--------|--------|----------|
| RVFilterGaussian | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVUnsharpMask | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVNoiseReduction | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVClarity | ✅ | ✅ | ❌ | ~~Low~~ Done |

**Color Processing Nodes:**
| Node | Parse | Create | Update | Priority |
|------|-------|--------|--------|----------|
| RVColorExposure | ✅ | ✅ | ❌ | ~~Medium~~ Done |
| RVColorCurve | ✅ | ✅ | ❌ | ~~Medium~~ Done |
| RVColorTemperature | ✅ | ✅ | ❌ | ~~Medium~~ Done |
| RVColorSaturation | ✅ | ✅ | ❌ | ~~Medium~~ Done |
| RVColorVibrance | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVColorShadow | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVColorHighlight | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVColorGrayScale | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVColorCDL | ✅ | ✅ | ❌ | ~~Medium~~ Done |
| RVColorLinearToSRGB | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVColorSRGBToLinear | ✅ | ✅ | ❌ | ~~Low~~ Done |

**Utility Nodes:**
| Node | Parse | Create | Update | Priority |
|------|-------|--------|--------|----------|
| RVRetime | ✅ | ✅ | ✅ | ~~Medium~~ Done |
| RVRotateCanvas | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVChannelMap | ✅ | ✅ | ❌ | Low |
| RVFormat | ✅ | ✅ | ✅ | ~~Medium~~ Done |
| RVOverlay | ✅ | ✅ | ❌ | Medium |
| RVResize | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVHistogram | ✅ | ✅ | ✅ | ~~Low~~ Done |
| RVCache | ✅ | ✅ | ❌ | ~~Low~~ Done |

**View Nodes:**
| Node | Parse | Create | Update | Priority |
|------|-------|--------|--------|----------|
| RVViewGroup | ✅ | ✅ | ❌ | Medium |
| RVSoundTrack | ✅ | ✅ | ❌ | Medium |
| RVDispTransform2D | ✅ | ✅ | ❌ | ~~Low~~ Done |
| RVDisplayGroup | ✅ | ✅ | ❌ | Medium |

**Color Management:**
| Node | Parse | Create | Update | Priority |
|------|-------|--------|--------|----------|
| RVOCIO | ✅ | ✅ | ❌ | ~~High~~ Done |
| RVICC | ✅ | ✅ | ❌ | ~~Medium~~ Done |
| RVPrimaryConvert | ✅ | ✅ | ❌ | ~~Low~~ Done |

---

#### 2. Missing Property Support

**RVSession Properties** ✅ IMPLEMENTED:
- ~~`session.inc` (frame increment)~~ ✅
- `session.clipboard` (clipboard state) - not yet
- ~~`session.version` (session version)~~ ✅
- ~~`root.name` (session name)~~ ✅
- ~~`root.comment` (session notes)~~ ✅
- `internal.creationContext` - not yet
- `node.origin` - not yet
- `membership.contains` - not yet
- ~~`matte.*` (session-level matte settings)~~ ✅
- ~~`paintEffects.*` (session-level paint settings)~~ ✅

**RVFileSource Properties** ✅ MOSTLY IMPLEMENTED:
- ~~`group.balance` (stereo balance)~~ ✅
- ~~`group.crossover` (audio crossover)~~ ✅
- ~~`group.noMovieAudio` (ignore embedded audio)~~ ✅
- ~~`group.rangeStart` (explicit start frame)~~ ✅
- ~~`group.fps`, `group.volume`, `group.audioOffset`~~ ✅
- ~~`cut.in`, `cut.out` (cut points)~~ ✅
- ~~`request.readAllChannels` (EXR all channels)~~ ✅
- `proxy.*` (proxy settings) - partial

**RVColor Properties** ✅ IMPLEMENTED:
- ~~`color.lut` (LUT selection)~~ ✅
- ~~`color.normalize` (normalize bounds)~~ ✅
- ~~`color.unpremult` (unpremultiply alpha)~~ ✅
- ~~`luminanceLUT.*` (luminance LUT)~~ ✅
- `matrix:output.RGBA` (output matrix) - not yet

**RVLinearize Properties** ✅ IMPLEMENTED:
- ~~`lut.*` (LUT data)~~ ✅
- ~~`color.alphaType`, `color.logtype`, `color.YUV`~~ ✅
- ~~`color.sRGB2linear`, `color.Rec709ToLinear`~~ ✅
- ~~`color.fileGamma`, `color.ignoreChromaticities`~~ ✅
- ~~`cineon.*` (Cineon settings)~~ ✅
- `CDL.*` (CDL in linearize) - not yet

**RVTransform2D Properties** ✅ MOSTLY IMPLEMENTED:
- ~~`transform.scale` (scale)~~ ✅
- ~~`transform.translate` (translation)~~ ✅
- `visibleBox.*` (visible region) - not yet
- `stencil.*` (stencil data) - not yet

**RVLensWarp Properties** ✅ MOSTLY IMPLEMENTED:
- ~~`warp.model` (distortion model)~~ ✅
- ~~`warp.pixelAspectRatio`~~ ✅
- ~~`warp.k3` (k3 distortion)~~ ✅
- ~~`warp.d` (distortion scale)~~ ✅
- ~~`warp.p1`, `warp.p2` (tangential)~~ ✅
- ~~`warp.offset` (center offset)~~ ✅
- ~~`warp.fx`, `warp.fy` (focal length)~~ ✅
- ~~`warp.cropRatioX`, `warp.cropRatioY`~~ ✅
- 3DE4 anamorphic properties - not yet

**RVSequence/EDL Properties** ✅ IMPLEMENTED:
- ~~`edl.frame`, `edl.source`, `edl.in`, `edl.out` (EDL data)~~ ✅
- ~~`output.*` (output settings)~~ ✅
- ~~`mode.*` (mode settings)~~ ✅
- ~~`composite.*` (per-input blend modes)~~ ✅

**RVStack Properties** ✅ IMPLEMENTED:
- ~~`output.chosenAudioInput`~~ ✅
- ~~`output.outOfRangePolicy`~~ ✅
- ~~`mode.alignStartFrames`, `mode.strictFrameRanges`~~ ✅
- ~~`composite.type` (blend mode)~~ ✅

**RVPaint Properties Not Handled:**
- `paint.exclude`, `paint.include` (frame filters)
- `pen:*.version`, `pen:*.mode` (pen mode)
- Dynamic `window:*` components

**RVOverlay Properties Not Handled:**
- `rect:*` (rectangle overlays)
- `text:*` (text overlays)
- `window:*` (window overlays)

---

#### 3. Connection System Gaps

Current implementation preserves connections but doesn't:
- Create new connections when building sessions
- Update connections when adding/removing sources
- Handle `__graph` internal component
- Support `connections` alternative format (paired array)

---

## Improvement Tasks

### Phase 1: Core Infrastructure (Priority: Critical)

#### Task 1.1: Connection System Builder
**Files:** `src/core/session/SessionGTOExporter.ts`

Add ability to create proper connection objects:
```typescript
buildConnectionObject(graph: Graph): ObjectData {
  // Build evaluation.lhs/rhs from graph edges
  // Build top.nodes from root nodes
}
```

**Acceptance Criteria:**
- [ ] Can create new .rv files with proper graph connectivity
- [ ] Sources connected to sequences/stacks correctly
- [ ] Round-trip preserves all connections

#### Task 1.2: Session Properties Expansion
**Files:** `src/core/session/Session.ts`, `SessionGTOStore.ts`, `SessionGTOExporter.ts`

Add support for missing RVSession properties:
- Session name and comment
- Frame increment
- Session-level matte settings
- Paint effects settings (ghost, hold)

**Acceptance Criteria:**
- [ ] Session name/comment editable and saved
- [ ] Frame increment respected in playback
- [ ] Matte settings round-trip correctly

#### Task 1.3: Source Group Creation
**Files:** `src/core/session/SessionGTOExporter.ts`

Implement full RVSourceGroup/RVFileSource creation:
```typescript
buildSourceGroup(source: MediaSource, index: number): ObjectData[]
```

**Acceptance Criteria:**
- [ ] Can create new sessions with multiple sources
- [ ] All source properties preserved
- [ ] Cut in/out points saved correctly

---

### Phase 2: Group Nodes (Priority: High) ✅ COMPLETED

#### Task 2.1: RVSequence/EDL Support ✅ COMPLETED
**Files:** `src/core/session/GTOGraphLoader.ts`, `SessionGTOExporter.ts`, `SessionGTOStore.ts`

Full EDL parsing and creation:
- ~~Parse `edl.frame`, `edl.source`, `edl.in`, `edl.out`~~ ✅
- ~~Create EDL from timeline state~~ ✅
- ~~Update EDL when timeline edited~~ ✅

**Acceptance Criteria:**
- [x] EDL-based sequences play correctly
- [x] Can create sequences with EDL
- [x] Timeline edits update EDL

#### Task 2.2: RVStack Compositing ✅ COMPLETED
**Files:** Same as 2.1

Full stack/composite support:
- ~~Parse blend modes per layer~~ ✅
- ~~Parse/save opacity per layer~~ ✅
- ~~Support all composite types~~ ✅

**Acceptance Criteria:**
- [x] Stack blend modes applied
- [x] Opacity per layer works
- [x] All composite types supported

#### Task 2.3: RVLayout Support
**Files:** Same as 2.1

Layout group creation and editing:
- Grid layout support
- Row/column layouts
- Spacing and timing options

**Acceptance Criteria:**
- [ ] Can create layout views
- [ ] Grid/row/column modes work
- [ ] Layout saves correctly

---

### Phase 3: Processing Nodes (Priority: High) ✅ COMPLETED

#### Task 3.1: RVLinearize Full Support ✅ COMPLETED
**Files:** `src/core/session/GTOGraphLoader.ts`, `SessionGTOStore.ts`

Complete linearization pipeline:
- ~~All transfer functions (sRGB, Rec709, log curves)~~ ✅
- ~~Cineon settings~~ ✅
- ~~LUT file loading~~ ✅
- ~~Matrix transforms~~ ✅

**Acceptance Criteria:**
- [x] All transfer functions work
- [x] Cineon log files display correctly
- [x] LUT files loaded from linearize node

#### Task 3.2: RVLookLUT Support ✅ COMPLETED
**Files:** Same as 3.1

Look LUT implementation:
- ~~Load LUT files (.cube, .csp, .3dl, etc.)~~ ✅
- ~~Apply 1D/3D LUTs~~ ✅
- ~~Pre-LUT support~~ ✅

**Acceptance Criteria:**
- [x] Can load .cube files
- [x] Can load .3dl files
- [x] LUTs apply to image correctly

#### Task 3.3: Full RVColor Support ✅ COMPLETED
**Files:** Same as 3.1

Complete color node:
- ~~Luminance LUT~~ ✅
- ~~Normalize option~~ ✅
- ~~Unpremult option~~ ✅

**Acceptance Criteria:**
- [x] All color properties functional
- [x] Luminance LUT works
- [x] Properties round-trip

---

### Phase 4: Color Management (Priority: High)

#### Task 4.1: OCIO Integration
**Files:** New files needed

OpenColorIO support:
- Parse OCIO node properties
- Load OCIO config files
- Apply OCIO transforms

**Acceptance Criteria:**
- [ ] OCIO config files supported
- [ ] Color transforms apply correctly
- [ ] OCIO nodes round-trip

#### Task 4.2: ICC Profile Support
**Files:** New files needed

ICC profile handling:
- Load ICC profiles
- Apply ICC transforms
- Display profile support

**Acceptance Criteria:**
- [ ] ICC profiles loaded
- [ ] Display profiles work
- [ ] ICC nodes round-trip

---

### Phase 5: Transform & Distortion (Priority: Medium) ✅ MOSTLY COMPLETED

#### Task 5.1: Full RVTransform2D ✅ COMPLETED
**Files:** `src/core/session/GTOGraphLoader.ts`, `SessionGTOStore.ts`

Complete 2D transform:
- ~~Scale (currently missing)~~ ✅
- ~~Translate (currently missing)~~ ✅
- Visible box/crop region - not yet

**Acceptance Criteria:**
- [x] Scale transform works
- [x] Translate transform works
- [ ] Visible box clips image

#### Task 5.2: Full RVLensWarp ✅ MOSTLY COMPLETED
**Files:** Same as 5.1

Complete lens distortion:
- ~~All distortion models~~ ✅
- ~~All distortion parameters~~ ✅
- 3DE4 anamorphic support - not yet

**Acceptance Criteria:**
- [x] Brown model complete
- [x] Other models work
- [ ] 3DE4 import works

#### Task 5.3: RVCrop Full Support
**Files:** Same as 5.1

Complete crop implementation:
- Base dimensions tracking
- Pixel-accurate cropping
- UI for interactive crop

**Acceptance Criteria:**
- [ ] Crop values round-trip perfectly
- [ ] Interactive crop UI works
- [ ] Pixel values match spec

---

### Phase 6: Retime & Audio (Priority: Medium)

#### Task 6.1: RVRetime Full Support ✅ COMPLETED
**Files:** `src/core/session/GTOGraphLoader.ts`, `SessionGTOStore.ts`, `SessionGTOExporter.ts`

Complete retime implementation:
- ~~Visual and audio scale/offset~~ ✅
- ~~Warp mode with keyframes~~ ✅
- ~~Explicit frame mapping~~ ✅

**Acceptance Criteria:**
- [x] Speed changes work
- [x] Warp keyframes work
- [x] Explicit mapping works

#### Task 6.2: RVSoundTrack Support
**Files:** New files needed

Audio track handling:
- Volume per source
- Audio offset sync
- Mute per track

**Acceptance Criteria:**
- [ ] Volume saved/loaded
- [ ] Offset sync works
- [ ] Mute state persists

---

### Phase 7: Additional Features (Priority: Low)

#### Task 7.1: Filter Nodes
Implement filter node support:
- RVFilterGaussian (blur)
- RVUnsharpMask (sharpen)
- RVNoiseReduction
- RVClarity

#### Task 7.2: Overlay System
Complete RVOverlay implementation:
- Rectangle overlays
- Text overlays with formatting
- Window overlays

#### Task 7.3: Additional Color Nodes
Standalone color processing nodes:
- RVColorExposure
- RVColorCurve
- RVColorTemperature
- RVColorSaturation
- etc.

#### Task 7.4: Stereo Improvements
Full stereo support:
- RVSourceStereo per-source settings
- All display stereo modes
- Eye-specific transforms

---

## Implementation Guidelines

### For Loading (Parsing)

1. **Use GTODTO query methods** for safe property access:
```typescript
const fps = dto.queryProperty<number>('mySession', 'session', 'fps') ?? 24.0;
```

2. **Handle missing properties gracefully** with defaults from spec

3. **Validate data types** match expected types from spec

4. **Log warnings** for unrecognized properties (future compatibility)

### For Saving (Exporting)

1. **Use GTOBuilder** for creating new objects:
```typescript
const session = new GTOBuilder()
  .object('mySession', 'RVSession', 1)
    .component('session')
      .string('viewNode', 'defaultSequence')
      .float('fps', 24.0)
    .end()
  .end()
  .build();
```

2. **Preserve existing data** when updating:
```typescript
// Deep clone first
const updated = structuredClone(original);
// Then patch specific properties
```

3. **Only write non-default values** to keep files minimal

4. **Match spec data types exactly**:
   - `int` for integers
   - `float` for floats
   - `string` for strings
   - `float[3]` for RGB, `float[4]` for RGBA
   - `int[2]` for ranges

### For Updating (Runtime)

1. **Track dirty state** per-property for efficient sync

2. **Batch updates** to avoid excessive writes

3. **Validate changes** against spec constraints

4. **Emit events** when state changes

### For Creating (New Sessions)

1. **Generate proper names** following spec conventions:
   - `sourceGroup000000`, `sourceGroup000001`, etc.
   - `sourceGroup000000_source`, `sourceGroup000000_RVColor`, etc.
   - `defaultSequence`, `defaultStack`, `defaultLayout`

2. **Build complete pipeline** for each source group:
   - FileSource → Format → ChannelMap → Cache
   - → Linearize → Color → Look → Stereo
   - → Transform2D → Crop

3. **Create proper connections** between nodes

---

## Testing Strategy

### Unit Tests

For each node type, test:
1. Parse from sample .rv file
2. Create programmatically
3. Update properties
4. Export and verify output
5. Round-trip (load → save → load)

### Integration Tests

1. Load OpenRV-created .rv files
2. Verify all properties parsed correctly
3. Save and reload
4. Compare output to input
5. Load in OpenRV and verify

### Sample Files

Create test .rv files for:
- Minimal session (spec example)
- Single source with all properties
- Multi-source sequence with EDL
- Stack with blend modes
- Layout with grid
- Full color pipeline
- LUT-based color
- Stereo session
- Annotated session

---

## File Locations Reference

| Purpose | File |
|---------|------|
| Session loading | `src/core/session/Session.ts` |
| Graph parsing | `src/core/session/GTOGraphLoader.ts` |
| Exporting | `src/core/session/SessionGTOExporter.ts` |
| State tracking | `src/core/session/SessionGTOStore.ts` |
| Node definitions | `src/nodes/` directory |
| Property system | `src/core/graph/Property.ts` |
| Paint types | `src/paint/types.ts` |

---

## Priority Summary

| Priority | Tasks | Status |
|----------|-------|--------|
| Critical | 1.1, 1.2, 1.3 (Connection, Session, Source) | ⚠️ Partial |
| High | 2.1-2.2 (Groups), 3.1-3.3 (Processing) | ✅ **COMPLETED** |
| High | 4.1-4.2 (Color Mgmt - OCIO/ICC) | ❌ Not started |
| Medium | 5.1-5.2 (Transform, Lens) | ✅ **COMPLETED** |
| Medium | 6.1 (Retime) | ✅ **COMPLETED** |
| Medium | 2.3 (Layout), 5.3 (Crop), 6.2 (Audio) | ❌ Not started |
| Low | 7.1-7.4 (Filters, Overlay, Extra) | ❌ Not started |

### Completed Work Summary

**Fully Implemented:**
- RVSequence/EDL parsing and creation
- RVStack compositing (blend modes, opacity per layer)
- RVLinearize (all transfer functions, cineon, LUT)
- RVLookLUT/RVCacheLUT parsing and creation
- RVColor (full: exposure, gamma, saturation, CDL, luminanceLUT, normalize, unpremult)
- RVTransform2D (rotation, flip/flop, scale, translate)
- RVLensWarp (k1-k3, p1-p2 tangential, model, focal length, crop ratios)
- RVRetime (visual/audio scale, warp mode, explicit mapping)
- RVDisplayColor (full parsing and export: gamma, sRGB, Rec709, brightness, chromaticities)
- RVDisplayStereo (full parsing and export: type, swap, offset)
- RVSourceStereo (full parsing and export: swap, offset, right eye transform)

**Remaining High-Priority:**
- OCIO integration
- ICC profile support

---

## Appendix: Spec Quick Reference

### Data Type Mapping

| Spec Type | JavaScript | GTOBuilder Method |
|-----------|------------|-------------------|
| `int` | `number` | `.int()` |
| `float` | `number` | `.float()` |
| `string` | `string` | `.string()` |
| `int[2]` | `number[][]` | `.int2()` |
| `int[3]` | `number[][]` | `.int3()` |
| `float[2]` | `number[][]` | `.float2()` |
| `float[3]` | `number[][]` | `.float3()` |
| `float[4]` | `number[][]` | `.float4()` |
| `float[4,4]` | `number[][]` | `.float44()` |

### Required Objects

Every .rv file must have:
1. `RVSession : <name> (1)` - Session root
2. `connection : connections (1)` - Graph topology

### Naming Conventions

- Source groups: `sourceGroupNNNNNN` (6-digit padded)
- Member nodes: `parentName_nodeName`
- Default views: `defaultSequence`, `defaultStack`, `defaultLayout`
- Display: `displayGroup`

---

*Plan created: 2025-01-20*
*Last updated: 2026-01-21*
*Based on: spec.md, usage.md, codebase analysis*
