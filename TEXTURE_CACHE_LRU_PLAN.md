# Implementation Plan: TextureCacheManager LRU Eviction Optimization

**Priority Score: 3/25** | Risk: VERY LOW | Effort: S (Quick Win)

## Summary

`evictLRU()` (lines 398-412 of `TextureCacheManager.ts`) iterates ALL cache entries O(n) to find the lowest `accessCounter` value. Replace with JavaScript Map insertion-order semantics for O(1) eviction, matching the existing `LRUCache` utility class pattern (`src/utils/LRUCache.ts` lines 44-45).

**Current state:** 28 existing tests all pass. The `CacheEntry` interface and `lastAccessed`/`accessCounter` fields are entirely private -- no external code reads them. `TextureCacheManager` is not yet imported by any production code (only by its test file), so refactoring is zero-risk to consumers.

---

## Architecture Context

### Existing LRU Pattern (`src/utils/LRUCache.ts`)

The codebase already has a generic `LRUCache<K, V>` class that uses Map insertion-order for O(1) eviction:

- **get()** (line 16-22): delete + re-insert to move accessed entry to end (MRU)
- **peek()** (line 30-31): read without refreshing position (hot-path optimization)
- **set()** (line 34-49): delete + re-insert for existing keys; evict from front (`this.map.keys().next().value!`) when over capacity
- **eviction** (line 44-45): `const oldest = this.map.keys().next().value!` -- O(1) read of first Map key

### Current TextureCacheManager Approach (`src/render/TextureCacheManager.ts`)

Uses a monotonically increasing `accessCounter` (line 117) stamped onto `CacheEntry.lastAccessed` (line 31). The `evictLRU()` method (lines 398-412) performs a full linear scan to find the minimum `lastAccessed` value:

```typescript
// Lines 398-412 (current, O(n) scan)
private evictLRU(): void {
  let oldestKey: string | null = null;
  let oldestAccess = Infinity;
  for (const [key, entry] of this.cache) {
    if (entry.lastAccessed < oldestAccess) {
      oldestAccess = entry.lastAccessed;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    this.deleteEntry(oldestKey);
  }
}
```

Three places stamp the counter:
1. **getTexture() cache hit** -- line 209: `existing.lastAccessed = ++this.accessCounter;`
2. **getTexture() new entry creation** -- line 249: `lastAccessed: ++this.accessCounter,`
3. **updateTexture()** -- line 305: `entry.lastAccessed = ++this.accessCounter;`

---

## Implementation

### Task 8.1: Remove `lastAccessed` Field from `CacheEntry` Interface
**Complexity:** trivial
**Files:** `src/render/TextureCacheManager.ts`
**Dependencies:** none

#### Current Code Analysis
The `CacheEntry` interface (lines 23-32) includes `lastAccessed: number` at line 31. This field is only used internally for LRU ordering. It is never exposed through `getTextureInfo()` (line 319 returns only `width`, `height`, `sizeBytes`). No external code or test references this field.

#### Implementation Steps
1. Remove `lastAccessed: number;` from the `CacheEntry` interface (line 31).
2. Remove `private accessCounter = 0;` field (line 117).
3. Remove `lastAccessed: ++this.accessCounter,` from the new entry object literal in `getTexture()` (line 249) -- the whole property line, not the surrounding code.

#### Edge Cases & Risks
- **Risk: External consumers reading `lastAccessed`** -- Verified: `CacheEntry` is a non-exported interface (declared with `interface`, not `export interface` at line 23). `getTextureInfo()` at line 319 returns a subset that excludes `lastAccessed`. Zero risk.
- **Risk: `accessCounter` used elsewhere** -- Verified: only used 4 times total (declaration + 3 increments), all in this file.

#### Test Specifications
No new tests needed for this subtask. All 28 existing tests must continue passing (they never assert on `lastAccessed` or `accessCounter`).

---

### Task 8.2: Add Move-to-End on Cache Hit in `getTexture()`
**Complexity:** small
**Files:** `src/render/TextureCacheManager.ts`
**Dependencies:** Task 8.1

#### Current Code Analysis
When `getTexture()` finds an existing entry with matching dimensions (lines 201-211), it currently just stamps `accessCounter`:

```typescript
// Lines 207-210
if (...dimensions match...) {
  existing.lastAccessed = ++this.accessCounter;  // line 209
  return existing.texture;                        // line 210
}
```

After Task 8.1 removes `lastAccessed`, this needs to instead delete+re-insert the Map entry to move it to the end (MRU position), mirroring `LRUCache.get()` at lines 19-21.

#### Implementation Steps
1. Replace line 209 (`existing.lastAccessed = ++this.accessCounter;`) with:
   ```typescript
   this.cache.delete(key);
   this.cache.set(key, existing);
   ```
2. This preserves the `existing` object reference -- `existing.texture` is still returned on line 210.

#### Edge Cases & Risks
- **Risk: Performance of delete+re-insert vs. counter bump** -- Map delete+set is O(1) amortized in V8. The `LRUCache` class already uses this pattern in its `get()` method (line 19-21) and even documents a `peek()` alternative for hot paths (lines 26-31). For TextureCacheManager, `getTexture()` is called at most once per frame per texture key, so GC pressure is negligible.
- **Risk: The entry reference survives delete** -- The `delete` only removes the Map slot; the `existing` JS object remains valid because we hold a reference to it. The subsequent `set` re-inserts the same object.

#### Test Specifications
**File:** `src/render/TextureCacheManager.test.ts`

```typescript
describe('LRU eviction', () => {
  it('TEX-U030: getTexture cache hit refreshes LRU order (multiple evictions maintain correct order)', () => {
    const smallCache = new TextureCacheManager(gl, { maxEntries: 3, maxMemoryBytes: 10000000 });

    // Insert A, B, C (in that order -- A is oldest)
    smallCache.getTexture('A', 10, 10);
    smallCache.getTexture('B', 10, 10);
    smallCache.getTexture('C', 10, 10);

    // Access in order C -> B -> A (A becomes newest, C becomes oldest)
    smallCache.getTexture('C', 10, 10);
    smallCache.getTexture('B', 10, 10);
    smallCache.getTexture('A', 10, 10);

    // Insert D -- should evict C (the oldest after re-access pattern)
    smallCache.getTexture('D', 10, 10);

    expect(smallCache.hasTexture('C')).toBe(false); // evicted (oldest)
    expect(smallCache.hasTexture('B')).toBe(true);
    expect(smallCache.hasTexture('A')).toBe(true);
    expect(smallCache.hasTexture('D')).toBe(true);
  });
});
```

**Rationale:** TEX-U017 already tests basic LRU eviction but only accesses one entry before triggering eviction. This test exercises a more complex re-access pattern to validate that the delete+re-insert approach correctly maintains full ordering.

---

### Task 8.3: Add Move-to-End on `updateTexture()`
**Complexity:** trivial
**Files:** `src/render/TextureCacheManager.ts`
**Dependencies:** Task 8.1

#### Current Code Analysis
`updateTexture()` (lines 266-307) retrieves an entry at line 267, uploads pixel data via `texSubImage2D`, then stamps the counter at line 305:

```typescript
// Line 305
entry.lastAccessed = ++this.accessCounter;
```

#### Implementation Steps
1. Replace line 305 with:
   ```typescript
   this.cache.delete(key);
   this.cache.set(key, entry);
   ```
2. This moves the entry to the MRU position, matching the LRUCache pattern.

#### Edge Cases & Risks
- **Risk: `entry` object mutation after re-insert** -- Not an issue. The `entry` reference is unchanged; the Map just re-positions it. The `gl.bindTexture(gl.TEXTURE_2D, null)` call on line 302 has already completed.
- **Risk: `updateTexture()` called on a key that was just deleted** -- The early return at line 268 (`if (!entry) return false;`) handles this. If the key was deleted between the `get` and the `set`, the `delete` on the missing key is a no-op and `set` correctly inserts it back. But this is purely theoretical -- no code path deletes entries concurrently.

#### Test Specifications
**File:** `src/render/TextureCacheManager.test.ts`

```typescript
describe('LRU eviction', () => {
  it('TEX-U029: updateTexture refreshes LRU order', () => {
    const smallCache = new TextureCacheManager(gl, { maxEntries: 3, maxMemoryBytes: 10000000 });

    smallCache.getTexture('A', 10, 10);
    smallCache.getTexture('B', 10, 10);
    smallCache.getTexture('C', 10, 10);

    // Update A to refresh its position (A was oldest, now becomes newest)
    const data = new Uint8Array(10 * 10 * 4);
    smallCache.updateTexture('A', data);

    // Insert D -- should evict B (now the oldest)
    smallCache.getTexture('D', 10, 10);

    expect(smallCache.hasTexture('A')).toBe(true);  // refreshed by updateTexture
    expect(smallCache.hasTexture('B')).toBe(false); // evicted (oldest after A was refreshed)
    expect(smallCache.hasTexture('C')).toBe(true);
    expect(smallCache.hasTexture('D')).toBe(true);
  });
});
```

---

### Task 8.4: Add Move-to-End for New Entry Creation in `getTexture()`
**Complexity:** trivial
**Files:** `src/render/TextureCacheManager.ts`
**Dependencies:** Task 8.1

#### Current Code Analysis
When a new texture is created (lines 241-252), the entry object includes `lastAccessed: ++this.accessCounter` at line 249, then `this.cache.set(key, entry)` at line 251. After Task 8.1 removes the `lastAccessed` field, the `set` call at line 251 already inserts the new entry at the Map end (MRU position). No additional code change is needed beyond removing the `lastAccessed` property.

Additionally, when a dimension change occurs (line 214: `this.deleteEntry(key)`), the old entry is removed and a new entry is created. The `deleteEntry` call at line 214 removes the old entry from the Map, and the subsequent `this.cache.set(key, entry)` at line 251 naturally inserts the replacement at the end (MRU position). This is correct behavior.

#### Implementation Steps
1. Remove `lastAccessed: ++this.accessCounter,` from the entry object literal at line 249. The remaining `cache.set(key, entry)` at line 251 already provides correct MRU insertion.

#### Edge Cases & Risks
- **Risk: Dimension change re-creation loses LRU position** -- Not a risk. `deleteEntry(key)` removes the old entry, and `cache.set(key, newEntry)` re-inserts at end. The re-created entry correctly becomes MRU.

#### Test Specifications
**File:** `src/render/TextureCacheManager.test.ts`

```typescript
describe('LRU eviction', () => {
  it('TEX-U031: dimension-change re-creation places entry at MRU position', () => {
    const smallCache = new TextureCacheManager(gl, { maxEntries: 3, maxMemoryBytes: 10000000 });

    smallCache.getTexture('A', 10, 10);
    smallCache.getTexture('B', 10, 10);
    smallCache.getTexture('C', 10, 10);

    // Re-create A with different dimensions (delete + insert at end)
    smallCache.getTexture('A', 20, 20);

    // Insert D -- should evict B (oldest after A was re-created at end)
    smallCache.getTexture('D', 10, 10);

    expect(smallCache.hasTexture('A')).toBe(true);  // re-created, now MRU-1
    expect(smallCache.hasTexture('B')).toBe(false); // evicted (oldest)
    expect(smallCache.hasTexture('C')).toBe(true);
    expect(smallCache.hasTexture('D')).toBe(true);
  });
});
```

---

### Task 8.5: Replace `evictLRU()` Body with O(1) Map-Front Eviction
**Complexity:** small
**Files:** `src/render/TextureCacheManager.ts`
**Dependencies:** Tasks 8.2, 8.3, 8.4 (all access points must move-to-end before eviction logic changes)

#### Current Code Analysis
The current `evictLRU()` (lines 398-412) does an O(n) full scan:

```typescript
private evictLRU(): void {
  let oldestKey: string | null = null;
  let oldestAccess = Infinity;
  for (const [key, entry] of this.cache) {
    if (entry.lastAccessed < oldestAccess) {
      oldestAccess = entry.lastAccessed;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    this.deleteEntry(oldestKey);
  }
}
```

It is called from `ensureCapacity()` (lines 380-393) in two `while` loops:
- Line 382-384: evict while `cache.size >= maxEntries`
- Line 387-392: evict while `currentMemoryUsage + requiredSize > maxMemoryBytes && cache.size > 0`

#### Implementation Steps
1. Replace the entire body of `evictLRU()` (lines 398-412) with:
   ```typescript
   private evictLRU(): void {
     const oldest = this.cache.keys().next().value;
     if (oldest !== undefined) {
       this.deleteEntry(oldest);
     }
   }
   ```
2. This matches the `LRUCache` eviction pattern at line 45 of `src/utils/LRUCache.ts`.

#### Edge Cases & Risks
- **Risk: Empty cache** -- `this.cache.keys().next().value` returns `undefined` when the Map is empty. The `if` guard handles this. Additionally, `ensureCapacity()` guards the memory-eviction loop with `this.cache.size > 0` (line 389), and the entry-count loop condition `this.cache.size >= this.config.maxEntries` naturally won't trigger on an empty cache (since `maxEntries` defaults to 100). So `evictLRU()` should never be called on an empty cache, but the guard is defensive.
- **Risk: String key `"undefined"`** -- If a cache key is literally the string `"undefined"`, `this.cache.keys().next().value` would return the string `"undefined"`, which is truthy and !== `undefined`. This is correct behavior.
- **Risk: Map mutation during `ensureCapacity` while loops** -- The `while` loops call `evictLRU()` which calls `deleteEntry()` which calls `this.cache.delete()`. This is safe because we are not iterating the Map in the while loop -- we check `cache.size` and `currentMemoryUsage` as loop conditions, then `evictLRU()` reads only the first key. No iterator invalidation.
- **Risk: Batch eviction correctness** -- When `ensureCapacity()` needs to evict multiple entries (e.g., adding a large RGBA32F texture that exceeds remaining memory), the while loop calls `evictLRU()` repeatedly. Each call removes the front of the Map, so entries are evicted in correct oldest-first order.

#### Test Specifications
**File:** `src/render/TextureCacheManager.test.ts`

```typescript
describe('LRU eviction', () => {
  it('TEX-U032: memory-based eviction respects LRU order', () => {
    // Memory limit allows ~2 entries of 10x10 RGBA8 (400 bytes each)
    const smallCache = new TextureCacheManager(gl, { maxMemoryBytes: 800, maxEntries: 100 });

    smallCache.getTexture('A', 10, 10); // 400 bytes
    smallCache.getTexture('B', 10, 10); // 400 bytes

    // Access A to refresh it
    smallCache.getTexture('A', 10, 10);

    // Insert C -- needs memory, should evict B (the oldest)
    smallCache.getTexture('C', 10, 10);

    expect(smallCache.hasTexture('A')).toBe(true);  // refreshed, survived
    expect(smallCache.hasTexture('B')).toBe(false); // evicted
    expect(smallCache.hasTexture('C')).toBe(true);
  });

  it('TEX-U033: batch eviction evicts in correct oldest-first order', () => {
    const smallCache = new TextureCacheManager(gl, { maxEntries: 4, maxMemoryBytes: 10000000 });

    smallCache.getTexture('A', 10, 10);
    smallCache.getTexture('B', 10, 10);
    smallCache.getTexture('C', 10, 10);
    smallCache.getTexture('D', 10, 10);

    // Access D and C to make them recent
    smallCache.getTexture('D', 10, 10);
    smallCache.getTexture('C', 10, 10);

    // Reduce maxEntries to 2 by adding 2 entries (evicts 2 oldest: A, B)
    // Actually, we need to trigger eviction. With maxEntries=4, adding a 5th evicts 1.
    // Let's use a smaller cache to test batch eviction.
    const tinyCache = new TextureCacheManager(gl, { maxEntries: 2, maxMemoryBytes: 10000000 });

    tinyCache.getTexture('A', 10, 10);
    tinyCache.getTexture('B', 10, 10);

    // Access A so B is oldest
    tinyCache.getTexture('A', 10, 10);

    // Remove B and add C, D in quick succession
    tinyCache.getTexture('C', 10, 10); // evicts B (oldest)
    expect(tinyCache.hasTexture('B')).toBe(false);
    expect(tinyCache.hasTexture('A')).toBe(true);

    tinyCache.getTexture('D', 10, 10); // evicts A (now oldest)
    expect(tinyCache.hasTexture('A')).toBe(false);
    expect(tinyCache.hasTexture('C')).toBe(true);
    expect(tinyCache.hasTexture('D')).toBe(true);
  });
});
```

---

## Consolidated Change Summary

### Files Modified
| File | Changes |
|------|---------|
| `src/render/TextureCacheManager.ts` | Remove `lastAccessed` from `CacheEntry`; remove `accessCounter` field; add delete+re-insert in 2 locations; replace `evictLRU()` body |
| `src/render/TextureCacheManager.test.ts` | Add 5 new test cases (TEX-U029 through TEX-U033) |

### Exact Diff for `src/render/TextureCacheManager.ts`

**1. `CacheEntry` interface (line 31):**
Remove:
```typescript
  lastAccessed: number;
```

**2. Class field (line 117):**
Remove:
```typescript
  private accessCounter = 0;
```

**3. `getTexture()` cache-hit path (lines 208-209):**
Replace:
```typescript
        existing.lastAccessed = ++this.accessCounter;
```
With:
```typescript
        this.cache.delete(key);
        this.cache.set(key, existing);
```

**4. `getTexture()` new entry creation (line 249):**
Remove from the object literal:
```typescript
      lastAccessed: ++this.accessCounter,
```

**5. `updateTexture()` (line 305):**
Replace:
```typescript
    entry.lastAccessed = ++this.accessCounter;
```
With:
```typescript
    this.cache.delete(key);
    this.cache.set(key, entry);
```

**6. `evictLRU()` (lines 398-412):**
Replace entire method body:
```typescript
  private evictLRU(): void {
    const oldest = this.cache.keys().next().value;
    if (oldest !== undefined) {
      this.deleteEntry(oldest);
    }
  }
```

### Total Lines Changed
- **Removed:** ~17 lines (interface field, class field, 3 counter assignments, 10-line evictLRU body)
- **Added:** ~8 lines (2 delete+set pairs, 5-line evictLRU body)
- **Net:** -9 lines

---

## Complete Test Specifications

**File:** `src/render/TextureCacheManager.test.ts`

All 5 new tests go inside the existing `describe('LRU eviction', ...)` block (currently at line 263).

```typescript
  // --- New tests for LRU optimization (Tasks 8.2-8.5) ---

  it('TEX-U029: updateTexture refreshes LRU order', () => {
    const smallCache = new TextureCacheManager(gl, { maxEntries: 3, maxMemoryBytes: 10000000 });

    smallCache.getTexture('A', 10, 10);
    smallCache.getTexture('B', 10, 10);
    smallCache.getTexture('C', 10, 10);

    // Update A -- refreshes its LRU position to newest
    const data = new Uint8Array(10 * 10 * 4);
    smallCache.updateTexture('A', data);

    // Insert D -- should evict B (now the oldest)
    smallCache.getTexture('D', 10, 10);

    expect(smallCache.hasTexture('A')).toBe(true);  // refreshed via updateTexture
    expect(smallCache.hasTexture('B')).toBe(false); // evicted as oldest
    expect(smallCache.hasTexture('C')).toBe(true);
    expect(smallCache.hasTexture('D')).toBe(true);
  });

  it('TEX-U030: multiple access pattern maintains correct eviction order', () => {
    const smallCache = new TextureCacheManager(gl, { maxEntries: 3, maxMemoryBytes: 10000000 });

    smallCache.getTexture('A', 10, 10);
    smallCache.getTexture('B', 10, 10);
    smallCache.getTexture('C', 10, 10);

    // Access in order C -> B -> A (A becomes newest, C becomes oldest)
    smallCache.getTexture('C', 10, 10);
    smallCache.getTexture('B', 10, 10);
    smallCache.getTexture('A', 10, 10);

    // Insert D -- should evict C (the oldest after re-access)
    smallCache.getTexture('D', 10, 10);

    expect(smallCache.hasTexture('C')).toBe(false); // evicted as oldest
    expect(smallCache.hasTexture('B')).toBe(true);
    expect(smallCache.hasTexture('A')).toBe(true);
    expect(smallCache.hasTexture('D')).toBe(true);
  });

  it('TEX-U031: dimension-change re-creation places entry at MRU position', () => {
    const smallCache = new TextureCacheManager(gl, { maxEntries: 3, maxMemoryBytes: 10000000 });

    smallCache.getTexture('A', 10, 10);
    smallCache.getTexture('B', 10, 10);
    smallCache.getTexture('C', 10, 10);

    // Re-create A with different dimensions -- deleteEntry + set puts it at end
    smallCache.getTexture('A', 20, 20);

    // Insert D -- should evict B (oldest after A was re-created)
    smallCache.getTexture('D', 10, 10);

    expect(smallCache.hasTexture('A')).toBe(true);  // re-created at MRU position
    expect(smallCache.hasTexture('B')).toBe(false); // evicted as oldest
    expect(smallCache.hasTexture('C')).toBe(true);
    expect(smallCache.hasTexture('D')).toBe(true);
  });

  it('TEX-U032: memory-based eviction respects LRU order', () => {
    // 10x10 RGBA8 = 400 bytes; limit allows ~2 entries
    const smallCache = new TextureCacheManager(gl, { maxMemoryBytes: 800, maxEntries: 100 });

    smallCache.getTexture('A', 10, 10); // 400 bytes
    smallCache.getTexture('B', 10, 10); // 400 bytes (total: 800)

    // Access A to refresh it
    smallCache.getTexture('A', 10, 10);

    // Insert C -- exceeds memory, should evict B (the oldest)
    smallCache.getTexture('C', 10, 10);

    expect(smallCache.hasTexture('A')).toBe(true);  // refreshed, survived
    expect(smallCache.hasTexture('B')).toBe(false); // evicted as oldest
    expect(smallCache.hasTexture('C')).toBe(true);
  });

  it('TEX-U033: sequential evictions evict in correct oldest-first order', () => {
    const smallCache = new TextureCacheManager(gl, { maxEntries: 2, maxMemoryBytes: 10000000 });

    smallCache.getTexture('A', 10, 10);
    smallCache.getTexture('B', 10, 10);

    // Access A so B is oldest
    smallCache.getTexture('A', 10, 10);

    // Add C -- evicts B (oldest)
    smallCache.getTexture('C', 10, 10);
    expect(smallCache.hasTexture('B')).toBe(false);
    expect(smallCache.hasTexture('A')).toBe(true);

    // Add D -- evicts A (now oldest; C is newer)
    smallCache.getTexture('D', 10, 10);
    expect(smallCache.hasTexture('A')).toBe(false);
    expect(smallCache.hasTexture('C')).toBe(true);
    expect(smallCache.hasTexture('D')).toBe(true);
  });
```

---

## Edge Cases & Risks (Comprehensive)

| Case | Analysis | Severity |
|------|----------|----------|
| Empty cache eviction | `keys().next().value` returns `undefined`; `if` guard is a no-op. `ensureCapacity` further guards with `cache.size > 0` (line 389). | None |
| Dimension change re-creation | `deleteEntry(key)` removes old entry from Map; `cache.set(key, newEntry)` inserts at end. Entry is correctly at MRU position. | None |
| Map mutation during `while` loop in `ensureCapacity` | The `while` loop (lines 382-384, 387-392) checks `cache.size` as a loop condition, then calls `evictLRU()`. No Map iterator is held open across iterations. Safe. | None |
| `accessCounter` overflow (pre-change) | **Eliminated** by removing the counter entirely. Previously, after 2^53 accesses, JS Number precision would degrade. Purely theoretical but now impossible. | None (eliminated) |
| Key is the string `"undefined"` | `this.cache.keys().next().value` returns the string `"undefined"`, which is `!== undefined` (a non-string). Correctly evicted. | None |
| `deleteEntry` returns false in `evictLRU` | If `deleteEntry` fails (entry not found), `currentMemoryUsage` is not decremented. This would cause an infinite loop in `ensureCapacity`. However, this can only happen if the Map is corrupted (impossible in normal JS). The `if (oldest !== undefined)` guard ensures we only call `deleteEntry` when the Map is non-empty. | Theoretical only |
| GC pressure from delete+re-insert | V8 optimizes Map operations. `LRUCache.get()` (line 19-21) already uses this pattern in production. Per-frame overhead is one Map delete + one Map set per accessed texture -- far cheaper than creating/destroying WebGL textures. | Negligible |
| Concurrency / re-entrancy | JavaScript is single-threaded. No risk of concurrent access to the Map during eviction. WebGL context loss events are dispatched synchronously. | None |
| `handleContextLost` clearing the cache | `this.cache.clear()` (line 155) resets the Map. After context restoration, new entries are inserted at the end. LRU ordering starts fresh. No interaction with the eviction changes. | None |

---

## Verification Plan

1. **All 28 existing tests pass** -- behavioral contract is unchanged.
2. **5 new tests pass** -- LRU ordering is correct under the new implementation.
3. **TypeScript compilation** -- `npx tsc --noEmit` passes (no type errors from removing `lastAccessed`).
4. **Manual review**: confirm no reference to `lastAccessed` or `accessCounter` remains in the file.

```bash
npx vitest run src/render/TextureCacheManager.test.ts
npx tsc --noEmit
grep -n 'lastAccessed\|accessCounter' src/render/TextureCacheManager.ts  # should return nothing
```

---

## Task Dependency Graph

```
Task 8.1 (remove fields)
  |
  +---> Task 8.2 (move-to-end in getTexture hit)
  |
  +---> Task 8.3 (move-to-end in updateTexture)
  |
  +---> Task 8.4 (remove lastAccessed from new entry)
  |
  v
Task 8.5 (replace evictLRU body)
  |
  v
Add tests (TEX-U029 through TEX-U033)
```

**Note:** Tasks 8.1-8.4 should be applied atomically (in a single commit) along with 8.5 and the new tests. Applying them incrementally would leave the code in a broken state (no `lastAccessed` field but `evictLRU` still trying to read it). The task decomposition above is for review clarity, not for incremental commits.
