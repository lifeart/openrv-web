# Implementation Plan: TextureCacheManager LRU Eviction (Item 8)

**Priority Score: 3/25** | Risk: VERY LOW | Effort: S (Quick Win)

## Summary

`evictLRU()` iterates ALL cache entries O(n) to find lowest `accessCounter`. Replace with Map insertion-order for O(1) eviction, matching the existing `LRUCache` pattern.

## Implementation (Single Atomic Change)

### Task 8.1: Replace accessCounter with Map Insertion-Order LRU
**Files:** `src/render/TextureCacheManager.ts`

**Remove:**
- `lastAccessed: number` from `CacheEntry` interface (line 31)
- `private accessCounter = 0` field (line 117)
- All `entry.lastAccessed = ++this.accessCounter` assignments

**Add move-to-end on access:**
```typescript
// In getTexture() cache-hit path (lines 208-210):
this.cache.delete(key);
this.cache.set(key, existing);

// In updateTexture() (line 305):
this.cache.delete(key);
this.cache.set(key, entry);
```

**Replace evictLRU() body (lines 398-412):**
```typescript
private evictLRU(): void {
  const oldest = this.cache.keys().next().value;
  if (oldest !== undefined) {
    this.deleteEntry(oldest);
  }
}
```

This matches `LRUCache.ts` line 45 exactly.

## Edge Cases (All Safe)
| Case | Analysis |
|------|---------|
| Empty cache eviction | `keys().next().value` = undefined → no-op; `ensureCapacity` guards with `cache.size > 0` |
| Dimension change re-creation | `deleteEntry(key)` removes, `cache.set(key, newEntry)` inserts at end → correctly MRU |
| Map mutation during iteration | `evictLRU()` doesn't iterate — just reads first key |
| accessCounter overflow | **Eliminated** — no counter at all |

## Tests
| ID | Test | Assertion |
|----|------|-----------|
| TEX-U029 | `updateTexture` refreshes LRU order | Updated entry survives, older one evicted |
| TEX-U030 | Multiple evictions maintain correct order | Access C→B→A, add D: C evicted first |
| TEX-U031 | Dimension-change re-creation respects LRU | Re-created entry at end of order |
| TEX-U032 | Memory-based eviction respects LRU | Refreshed entry survives memory eviction |
| TEX-U033 | Batch eviction evicts in correct order | Two oldest evicted, not two newest |

All 28 existing tests must continue passing (behavioral contract unchanged).
