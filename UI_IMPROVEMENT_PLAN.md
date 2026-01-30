# OpenRV Web - View Tab UI Improvement Plan

## Current State

The View tab has been optimized from ~1,400px to ~1,020px (**27% reduction**) through:
- Reduced dividers from 13 to 4 logical group separators
- Icon-only overlay toggle buttons (Probe, Spotlight, Info)
- Reduced gap spacing from 8px to 6px

**Current estimated width:** ~1,020px (fits 1366px laptops with comfortable margin)

---

## Remaining Improvements

### Phase 4: Create OverlaysControl Dropdown (Optional)

**Goal:** Group overlay toggles into single dropdown for additional space savings.

**New component:** `src/ui/components/OverlaysControl.ts`

**Contains:**
- Pixel Probe toggle
- Spotlight toggle
- Info Panel toggle
- Timecode Overlay toggle (future)

**Estimated savings:** ~135px (3+ buttons → 1 dropdown)

---

### Phase 6: Responsive Optimization (Future)

**Goal:** Auto-collapse on narrow viewports.

**Implementation:**
- CSS media queries for < 1200px screens
- JavaScript viewport detection
- Priority-based control hiding
- "More" overflow menu for hidden controls

---

## Testing Checklist

After changes:
- [ ] No horizontal scroll on 1366px display
- [ ] All keyboard shortcuts still work
- [ ] All controls accessible and functional
- [ ] Active states display correctly
- [ ] Dropdowns position correctly
- [ ] E2E tests pass
