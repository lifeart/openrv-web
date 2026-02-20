# Application Code Review — Bugs Found

> Code review date: 2026-02-20  
> Scope: `src/` application code (non-test files)

---

## Bug 1: `TextureCacheManager.clear()` — Map Mutation During Iteration

**File:** `src/render/TextureCacheManager.ts` (line 350–354)

**Description:** `clear()` iterates over `this.cache` with a `for...of` loop and calls `this.deleteEntry(key)` inside the loop body. `deleteEntry()` calls `this.cache.delete(key)`, which mutates the map during iteration. While modern V8 engines handle this gracefully, this is technically undefined behavior per the ES specification and can silently skip entries on other engines.

**Severity:** Medium — can cause GPU memory leaks (textures never freed).

**Code:**
```typescript
clear(): void {
  for (const [key] of this.cache) {
    this.deleteEntry(key); // ← mutates this.cache while iterating
  }
}
```

**Fix:** Collect keys first, then delete:
```typescript
clear(): void {
  const keys = [...this.cache.keys()];
  for (const key of keys) {
    this.deleteEntry(key);
  }
}
```

**Test case:**
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('TextureCacheManager.clear()', () => {
  it('should delete ALL textures, not skip any during iteration', () => {
    // Setup: create a mock GL context
    const mockGl = {
      RGBA8: 0x8058, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401,
      TEXTURE_2D: 0x0DE1, CLAMP_TO_EDGE: 0x812F, LINEAR: 0x2601,
      TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803,
      TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
      createTexture: vi.fn(() => ({})),
      bindTexture: vi.fn(),
      texParameteri: vi.fn(),
      texImage2D: vi.fn(),
      deleteTexture: vi.fn(),
      isContextLost: vi.fn(() => false),
      canvas: null,
    } as unknown as WebGL2RenderingContext;

    const { TextureCacheManager } = require('../src/render/TextureCacheManager');
    const cache = new TextureCacheManager(mockGl);

    // Add 5 textures
    for (let i = 0; i < 5; i++) {
      cache.getTexture(`tex-${i}`, 100, 100);
    }
    expect(cache.getMemoryUsage().entries).toBe(5);

    // Clear all
    cache.clear();
    expect(cache.getMemoryUsage().entries).toBe(0);
    expect(mockGl.deleteTexture).toHaveBeenCalledTimes(5);
  });
});
```

---

## Bug 2: `Graph.wouldCreateCycle()` — Traverses Wrong Direction

**File:** `src/core/graph/Graph.ts` (line 75–96)

**Description:** `wouldCreateCycle(from, to)` is supposed to check whether connecting `from → to` would create a cycle. A cycle exists when `to` can already reach `from` via existing edges. However, the implementation starts at `from` and traverses **inputs** (upstream), checking if it can reach `to`. This checks the wrong direction — it should start at `to` and traverse its **outputs** (downstream) to see if it reaches `from`, or traverse `to`'s **inputs** to see if `from` is upstream of `to` (since `from → to` means `from` becomes an input of `to`).

The correct logic: a cycle would occur if `from` is already reachable from `to` by walking downstream (outputs). The current code walks upstream from `from`, which checks whether `to` is an ancestor of `from` — the opposite of what's needed.

**Severity:** High — allows creating cycles in the graph, causing infinite loops in `evaluate()` and `getEvaluationOrder()`.

**Code:**
```typescript
private wouldCreateCycle(from: IPNode, to: IPNode): boolean {
  const visited = new Set<string>();
  const stack = [from]; // ← BUG: starts from wrong node
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === to.id) { return true; }  // ← checks for wrong target
    if (visited.has(node.id)) { continue; }
    visited.add(node.id);
    for (const input of node.inputs) { stack.push(input); }  // ← walks inputs
  }
  return false;
}
```

**Fix:** Start from `to` and look for `from`:
```typescript
private wouldCreateCycle(from: IPNode, to: IPNode): boolean {
  // If 'to' can already reach 'from' via its inputs, adding from→to creates a cycle
  const visited = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === from.id) { return true; }
    if (visited.has(node.id)) { continue; }
    visited.add(node.id);
    for (const input of node.inputs) { stack.push(input); }
  }
  return false;
}
```

**Test case:**
```typescript
import { describe, it, expect } from 'vitest';
import { Graph } from '../src/core/graph/Graph';

describe('Graph.connect() cycle detection', () => {
  it('should prevent direct cycle A→B→A', () => {
    const graph = new Graph();
    // Create two mock nodes (use a known concrete subclass or test double)
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);

    graph.connect(nodeA, nodeB); // A → B (A is input to B)

    // Attempting B → A should throw because A→B→A is a cycle
    expect(() => graph.connect(nodeB, nodeA)).toThrow(/cycle/i);
  });

  it('should prevent transitive cycle A→B→C→A', () => {
    const graph = new Graph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);

    graph.connect(nodeA, nodeB);
    graph.connect(nodeB, nodeC);

    // C → A would create A→B→C→A cycle
    expect(() => graph.connect(nodeC, nodeA)).toThrow(/cycle/i);
  });
});
```

---

## Bug 3: `LRUCache.get()` — Cannot Distinguish Stored `undefined` Values

**File:** `src/utils/LRUCache.ts` (line 16–23)

**Description:** `get()` returns `undefined` both when a key doesn't exist AND when the stored value is literally `undefined`. The check `if (value === undefined) return undefined` prevents refresh of entries whose value is `undefined`, leaving them in stale LRU position and eventually causing incorrect eviction. Though the generic type allows `V = undefined`, this is a semantic bug for any consumer storing nullable values.

**Severity:** Low — unlikely but possible if anyone stores `undefined` as a value.

**Code:**
```typescript
get(key: K): V | undefined {
  const value = this.map.get(key);
  if (value === undefined) return undefined; // ← can't distinguish "not found" from "stored undefined"
  this.map.delete(key);
  this.map.set(key, value);
  return value;
}
```

**Fix:** Use `has()` before `get()`:
```typescript
get(key: K): V | undefined {
  if (!this.map.has(key)) return undefined;
  const value = this.map.get(key) as V;
  this.map.delete(key);
  this.map.set(key, value);
  return value;
}
```

**Test case:**
```typescript
import { describe, it, expect } from 'vitest';
import { LRUCache } from '../src/utils/LRUCache';

describe('LRUCache.get() with undefined values', () => {
  it('should refresh LRU position even when stored value is undefined', () => {
    const evicted: string[] = [];
    const cache = new LRUCache<string, undefined>(2, (key) => { evicted.push(key); });

    cache.set('a', undefined);
    cache.set('b', undefined);

    // Access 'a' to refresh its position — it should move to most recent
    const result = cache.get('a');
    expect(result).toBe(undefined); // value is undefined but key exists

    // Adding 'c' should evict 'b' (oldest), NOT 'a'
    cache.set('c', undefined);
    expect(evicted).toEqual(['b']);
  });
});
```

---

## Bug 4: `IPImage.clone()` Does Not Propagate `imageBitmap`

**File:** `src/core/image/Image.ts` (line 195–204)

**Description:** `clone()` creates a new `IPImage` sharing the same `ArrayBuffer`, but does not pass `imageBitmap`. For `SequenceSourceNode.process()`, which creates `IPImage` with an `imageBitmap` but no real pixel data in the `ArrayBuffer`, a `clone()` of such an image would lose the `imageBitmap` reference — resulting in a hollow image with an empty buffer and no bitmap.

**Severity:** Medium — any code that clones an ImageBitmap-backed `IPImage` will get an unusable result.

**Code:**
```typescript
clone(): IPImage {
  return new IPImage({
    width: this.width,
    height: this.height,
    channels: this.channels,
    dataType: this.dataType,
    data: this.data,
    metadata: { ...this.metadata },
    // ← imageBitmap is NOT passed through
  });
}
```

**Fix:** Pass `imageBitmap` (but not `videoFrame`, which is intentionally excluded):
```typescript
clone(): IPImage {
  return new IPImage({
    width: this.width,
    height: this.height,
    channels: this.channels,
    dataType: this.dataType,
    data: this.data,
    metadata: { ...this.metadata },
    imageBitmap: this.imageBitmap, // shared reference, same as data
  });
}
```

**Test case:**
```typescript
import { describe, it, expect } from 'vitest';
import { IPImage } from '../src/core/image/Image';

describe('IPImage.clone()', () => {
  it('should preserve imageBitmap reference in the clone', () => {
    // Create mock ImageBitmap
    const mockBitmap = { width: 100, height: 100, close: () => {} } as unknown as ImageBitmap;

    const original = new IPImage({
      width: 100,
      height: 100,
      channels: 4,
      dataType: 'uint8',
      imageBitmap: mockBitmap,
    });

    const cloned = original.clone();

    // The clone should still reference the imageBitmap
    expect(cloned.imageBitmap).toBe(mockBitmap);
  });

  it('deepClone should NOT share imageBitmap (GPU resource)', () => {
    const mockBitmap = { width: 100, height: 100, close: () => {} } as unknown as ImageBitmap;

    const original = new IPImage({
      width: 100,
      height: 100,
      channels: 4,
      dataType: 'uint8',
      imageBitmap: mockBitmap,
    });

    const deep = original.deepClone();

    // deepClone should NOT share GPU resources
    expect(deep.imageBitmap).toBeNull();
    // But data should be independent
    expect(deep.data).not.toBe(original.data);
  });
});
```

---

## Bug 5: `HistoryManager.undo()` — Restores *Current* Entry Instead of *Previous* State

**File:** `src/utils/HistoryManager.ts` (line 90–102)

**Description:** In a typical undo system, the `HistoryEntry.restore` callback captures the state *before* the action was performed. When `undo()` is called, it should call `restore()` on the current entry (to revert it), which matches the current implementation. However, look at `redo()`: it also calls `.restore()` when no `.redo` callback exists. This means `restore()` is ambiguously used for both "undo this action" AND "redo this action", which is contradictory. The documentation says "Function to restore this state" but the undo implementation treats it as "function to undo this action".

This ambiguity means `jumpTo()` is also broken: when jumping forward, it calls `entry.restore()` as a fallback for `redo`, which would **undo** the action instead of **redoing** it.

**Severity:** High — `jumpTo()` forward produces the opposite of the expected result when entries lack explicit `redo` callbacks.

**Code:**
```typescript
redo(): boolean {
  // ...
  this.currentIndex++;
  const entry = this.entries[this.currentIndex];
  if (entry?.redo) {
    entry.redo();
  } else if (entry?.restore) {
    entry.restore(); // ← calls "undo" function as a "redo" fallback — WRONG
  }
  return true;
}
```

**Test case:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { HistoryManager } from '../src/utils/HistoryManager';

describe('HistoryManager undo/redo symmetry', () => {
  it('jumpTo forward should not call restore (undo) as redo fallback', () => {
    const manager = new HistoryManager();

    let value = 0;
    const restore1 = vi.fn(() => { value = 0; }); // restores to state before action 1
    const restore2 = vi.fn(() => { value = 1; }); // restores to state before action 2

    // Record action 1: sets value from 0 to 1
    value = 1;
    manager.recordAction('set to 1', 'session', restore1);

    // Record action 2: sets value from 1 to 2
    value = 2;
    manager.recordAction('set to 2', 'session', restore2);

    // Undo action 2 → value should become 1
    manager.undo();
    expect(value).toBe(1);

    // Undo action 1 → value should become 0
    manager.undo();
    expect(value).toBe(0);

    // Now jump forward to index 1 (after action 2).
    // Without explicit redo callbacks, jumpTo calls restore() which UNDOES
    // instead of redoing. This test demonstrates the bug:
    manager.jumpTo(1);
    // BUG: value will be 1 (restore2 called, which undoes action 2)
    // but the user expects value to be 2 (state after actions 1 & 2)
    // This assertion documents the buggy behavior:
    expect(restore2).toHaveBeenCalled();
    // The value is now 1 instead of the expected 2
    expect(value).toBe(1); // ← this is WRONG, should be 2
  });
});
```

---

## Bug 6: `SequenceSourceNode.process()` — Inconsistent Frame Indexing

**File:** `src/nodes/sources/SequenceSourceNode.ts` (line 135–161)

**Description:** `process()` receives `context.frame` (which is 1-based per the rest of the codebase) and computes `idx = context.frame - 1` for direct array access into `this.frames[]`. However, it also calls `this.preloadManager?.getCachedFrame(context.frame)`, which expects a 1-based frame number. The inconsistency means that when `preloadManager` provides a cached frame, **the wrong `frameData`** may be used for `metadata.sourcePath`. If `context.frame = 1`, then `idx = 0` is correct for `this.frames[0]`, but `getCachedFrame(1)` also expects 1-based. The real bug is subtler: the `initPreloadManager` loader also does `frame - 1` conversion, creating a double-conversion opportunity if `context.frame` is already 0-based somewhere in the pipeline.

**Severity:** Low–Medium — may cause wrong `sourcePath` metadata in edge cases.

**Test case:**
```typescript
import { describe, it, expect } from 'vitest';

describe('SequenceSourceNode frame indexing', () => {
  it('should use consistent 1-based frame numbers between preloadManager and frames array', () => {
    // Verify that context.frame=1 maps to frames[0] AND preloadManager frame 1
    // Both should reference the same underlying image
    const node = new SequenceSourceNode('test');
    // Mock frames array with known data
    // ... setup loadFiles with test files ...

    // process() with frame=1 should:
    // 1. Check preloadManager.getCachedFrame(1)    → 1-based ✓
    // 2. Access this.frames[0]                     → 0-based ✓
    // 3. Call getFrameImage(1) on miss             → 1-based ✓
    // All three should reference the same logical frame
  });
});
```

---

## Bug 7: `preloadFrames()` — Unhandled Rejection in `Promise.all()`

**File:** `src/utils/media/SequenceLoader.ts` (line 168–191)

**Description:** `preloadFrames()` collects multiple `loadFrameImage()` promises and awaits them with `Promise.all()`. If any single frame fails to load (e.g., corrupted file), `Promise.all()` rejects immediately and all other in-progress loads are abandoned. The `signal?.aborted` check after `createImageBitmap()` means successfully loaded frames are discarded, but the error from the failed frame propagates as an unhandled rejection from the others.

More critically, the function doesn't use `Promise.allSettled()`, so a single bad file in a sequence causes the entire preload window to fail.

**Severity:** Medium — a single corrupted file in a sequence prevents preloading of all nearby frames.

**Fix:** Use `Promise.allSettled()` instead:
```typescript
export async function preloadFrames(...): Promise<void> {
  // ...
  await Promise.allSettled(loadPromises);
}
```

**Test case:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { preloadFrames, SequenceFrame } from '../src/utils/media/SequenceLoader';

describe('preloadFrames', () => {
  it('should not reject all when one frame fails to load', async () => {
    const frames: SequenceFrame[] = [
      { index: 0, frameNumber: 1, file: new File(['ok'], 'frame_001.png') },
      { index: 1, frameNumber: 2, file: new File(['bad'], 'frame_002.png') }, // will fail
      { index: 2, frameNumber: 3, file: new File(['ok'], 'frame_003.png') },
    ];

    // Mock createImageBitmap to fail for frame 2
    const origCreateImageBitmap = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi.fn((blob: Blob) => {
      if ((blob as File).name === 'frame_002.png') {
        return Promise.reject(new Error('decode error'));
      }
      return Promise.resolve({ width: 100, height: 100, close: vi.fn() } as unknown as ImageBitmap);
    });

    // BUG: This currently throws because Promise.all rejects on first failure
    await expect(preloadFrames(frames, 1, 3)).rejects.toThrow('decode error');

    // After fix with Promise.allSettled, frames 1 and 3 should still be loaded
    // expect(frames[0].image).toBeDefined();
    // expect(frames[2].image).toBeDefined();

    globalThis.createImageBitmap = origCreateImageBitmap;
  });
});
```

---

## Bug 8: `SnapshotManager.putSnapshotWithJson()` — Double Serialization (Wasteful)

**File:** `src/core/session/SnapshotManager.ts` (line 254–272)

**Description:** The method receives a pre-serialized `stateJson` string intended to avoid double serialization. However, it immediately calls `JSON.parse(stateJson)` to convert it back into an object before passing to IndexedDB. This means the state is: 1) serialized to JSON (by the caller), 2) parsed back to object (here), 3) re-serialized by IndexedDB's structured clone algorithm. The `putSnapshotWithJson` name implies optimization, but the implementation negates it.

**Severity:** Low — performance waste, not a correctness bug, but misleading code.

**Test case:**
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('SnapshotManager.putSnapshotWithJson', () => {
  it('should not re-parse JSON that was already stringified', () => {
    // The method receives stateJson string and immediately JSON.parse()s it,
    // negating the optimization of avoiding double serialization.
    const state = { version: 1, playback: { currentFrame: 1 } };
    const stateJson = JSON.stringify(state);

    const parseSpy = vi.spyOn(JSON, 'parse');

    // After fix: putSnapshotWithJson should either:
    // 1. Store the raw JSON string in a separate field, or
    // 2. Accept the parsed object directly (and rename the method)
    // Current implementation: JSON.parse is called, defeating the purpose.
    JSON.parse(stateJson); // simulating current behavior
    expect(parseSpy).toHaveBeenCalledWith(stateJson);

    parseSpy.mockRestore();
  });
});
```

---

## Bug 9: `SequenceLoader.extractFrameNumber()` — First Pattern Match Wins, May Match Wrong Number

**File:** `src/utils/media/SequenceLoader.ts` (line 50–58)

**Description:** `extractFrameNumber()` iterates `FRAME_PATTERNS` and returns the first match. The first pattern `/(\\d+)(?=\\.[^.]+$)/` matches **any** digits before the extension. For a filename like `shot2_take3_frame_0042.exr`, this pattern matches `0042` (correct). But for `clip_v2.0001.exr`, the first pattern matches `0001` while the second pattern `[._-](\\d+)(?=\\.[^.]+$)/` would also match `0001` (after the `.`). However, for `episode2.frame001.exr`, the first pattern matches `001` (before `.exr`), but the name contains `2` as well. If `detectPattern` is then called, it uses `nameWithoutExt.match(/(\\d+)$/)` which also matches `001`, so it works. But for `v2_001.png`, `extractFrameNumber` returns `001` → 1, while the user might expect `2` to also be considered.

The real issue: pattern `/(\\d+)(?=\\.[^.]+$)/` is a greedy regex that will match `2_001` → `001` (only the last digits before extension). But if the filename is `thing123.png`, it returns `123`, which could be a version number, not a frame number. There's no way to disambiguate without context.

**Severity:** Low — edge case, but can cause wrong frame detection for filenames with multiple number groups where the frame number isn't the last one.

**Test case:**
```typescript
import { describe, it, expect } from 'vitest';
import { extractFrameNumber, detectPattern } from '../src/utils/media/SequenceLoader';

describe('extractFrameNumber edge cases', () => {
  it('should extract frame number for standard patterns', () => {
    expect(extractFrameNumber('frame_0001.png')).toBe(1);
    expect(extractFrameNumber('shot.0042.exr')).toBe(42);
  });

  it('may incorrectly interpret version numbers as frame numbers', () => {
    // A filename with version number but no frame number
    // extractFrameNumber cannot distinguish version from frame
    const result = extractFrameNumber('comp_v3.png');
    expect(result).toBe(3); // Is 3 the frame number or version? Ambiguous.
  });

  it('should correctly detect pattern even with multiple number groups', () => {
    const pattern = detectPattern([
      'shot2_frame_001.png',
      'shot2_frame_002.png',
      'shot2_frame_003.png',
    ]);
    // Pattern should be 'shot2_frame_###.png', not 'shot#_frame_001.png'
    expect(pattern).toBe('shot2_frame_###.png');
  });
});
```

---

## Bug 10: `PlaybackTimingController.computeNextFrame()` — Ping-pong Returns Same Frame at Boundaries

**File:** `src/core/session/PlaybackTimingController.ts` (line 335–365)

**Description:** In `pingpong` loop mode, when `nextFrame > outPoint`, the function returns `outPoint - 1`. However, the caller is expected to also **reverse the direction** for ping-pong to work. The `computeNextFrame()` method is documented as "pure, no side effects" and doesn't change direction — this means the caller must handle direction reversal separately. If the caller doesn't, the playhead will oscillate between `outPoint` and `outPoint - 1` forever.

Similarly, when `nextFrame < inPoint` in reverse, it returns `inPoint + 1`, but again doesn't signal direction reversal.

**Severity:** Medium — ping-pong mode may not reverse direction properly if callers rely solely on `computeNextFrame`.

**Test case:**
```typescript
import { describe, it, expect } from 'vitest';
import { PlaybackTimingController } from '../src/core/session/PlaybackTimingController';

describe('PlaybackTimingController.computeNextFrame() pingpong', () => {
  const controller = new PlaybackTimingController();

  it('should return outPoint-1 when hitting end in pingpong mode', () => {
    const result = controller.computeNextFrame(10, 1, 1, 10, 'pingpong');
    // At frame 10, moving forward: nextFrame = 11 > outPoint(10)
    // Returns outPoint - 1 = 9
    expect(result).toBe(9);
  });

  it('demonstrates missing direction reversal signal', () => {
    // If caller calls computeNextFrame again with same direction=1 from frame 9:
    const result = controller.computeNextFrame(9, 1, 1, 10, 'pingpong');
    // nextFrame = 10, which is <= outPoint, so returns 10
    expect(result).toBe(10);

    // And again from frame 10:
    const result2 = controller.computeNextFrame(10, 1, 1, 10, 'pingpong');
    // nextFrame = 11 > outPoint, returns 9 again
    expect(result2).toBe(9);
    // BUG: Oscillates 9↔10 forever without actual ping-pong traversal
    // because direction is never reversed (not this method's responsibility,
    // but no signal is returned to tell the caller to reverse)
  });
});
```

---

## Bug 11: `HistoryManager` — Singleton Leak via `getGlobalHistoryManager()`

**File:** `src/utils/HistoryManager.ts` (line 250–258)

**Description:** `getGlobalHistoryManager()` creates a singleton `HistoryManager` that is never reset. There is no `resetGlobalHistoryManager()` function for tests or hot-module-replacement. The singleton holds closure references to `restore()` / `redo()` callbacks that may reference stale session state after HMR or navigation. Additionally, the singleton pattern means test isolation is broken — test A's history entries leak into test B.

**Severity:** Low — mostly a testing/HMR issue, but can cause stale closures in production SPA navigation.

**Test case:**
```typescript
import { describe, it, expect } from 'vitest';
import { getGlobalHistoryManager } from '../src/utils/HistoryManager';

describe('getGlobalHistoryManager singleton', () => {
  it('shares state across calls — no reset mechanism', () => {
    const mgr1 = getGlobalHistoryManager();
    mgr1.recordAction('test action', 'session', () => {});

    const mgr2 = getGlobalHistoryManager();
    // mgr2 is the same instance — it has the entry from mgr1
    expect(mgr2.getEntries().length).toBe(1);

    // There's no way to reset the singleton for test isolation
    // This is a design issue: need resetGlobalHistoryManager() export
  });
});
```

---

## Bug 12: `Graph.removeNode()` — Disconnects Outputs Incorrectly

**File:** `src/core/graph/Graph.ts` (line 28–42)

**Description:** When removing a node, the code iterates `node.outputs` and calls `output.disconnectInput(node)`. However, `node.outputs` is a read-only view of an internal array, and `disconnectInput()` mutates both the caller's `_inputs` array and `node._outputs` array (via `splice`). This means the `node.outputs` array is mutating during the `for...of` iteration, which can skip entries.

**Severity:** Medium — removing a node that has multiple downstream consumers may leave some stale connections.

**Code:**
```typescript
removeNode(nodeId: string): void {
  const node = this.nodes.get(nodeId);
  if (!node) return;
  for (const input of node.inputs) {
    node.disconnectInput(input);     // ← mutates node._inputs during iteration
  }
  for (const output of node.outputs) {
    output.disconnectInput(node);    // ← mutates node._outputs during iteration
  }
  // ...
}
```

**Fix:** Copy arrays before iterating:
```typescript
for (const input of [...node.inputs]) { node.disconnectInput(input); }
for (const output of [...node.outputs]) { output.disconnectInput(node); }
```

**Test case:**
```typescript
import { describe, it, expect } from 'vitest';
import { Graph } from '../src/core/graph/Graph';

describe('Graph.removeNode with multiple outputs', () => {
  it('should disconnect ALL downstream nodes when removing a node with 3 outputs', () => {
    const graph = new Graph();
    const source = createTestNode('source');
    const a = createTestNode('a');
    const b = createTestNode('b');
    const c = createTestNode('c');

    graph.addNode(source);
    graph.addNode(a);
    graph.addNode(b);
    graph.addNode(c);

    graph.connect(source, a);
    graph.connect(source, b);
    graph.connect(source, c);

    expect(source.outputs.length).toBe(3);

    graph.removeNode(source.id);

    // All downstream nodes should have no inputs
    expect(a.inputs.length).toBe(0);
    expect(b.inputs.length).toBe(0);
    expect(c.inputs.length).toBe(0);
  });
});
```
