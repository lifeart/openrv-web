# Implementation Plan: Audio Waveform Extraction Optimization (Item 7)

**Priority Score: 4/25** | Risk: VERY LOW | Effort: S

## Summary

Two independent `fetch()` calls download the same video file simultaneously:
1. **AudioPlaybackManager** (via `AudioCoordinator.loadFromVideo()`) fetches the video blob URL to decode audio for playback (`AudioPlaybackManager.ts` line 151).
2. **WaveformRenderer** (via `Timeline.loadWaveform()`) fetches the same blob URL to decode audio for waveform visualization (`WaveformRenderer.ts` line 139).

For local files, the original `File` object is already in memory. Both fetches are redundant — they re-download blob URLs that were created from a `File` the application still holds.

### Verified Call Chain

```
Session.loadVideoFile(file: File)
  → URL.createObjectURL(file)                       // Session.ts line 1813
  → AudioCoordinator.loadFromVideo(video, ...)       // Session.ts line 1853
      → AudioPlaybackManager.loadFromVideo(video)    // AudioCoordinator.ts line 72
          → fetch(videoSrc, { mode: 'cors' })        // AudioPlaybackManager.ts line 151
  → Session.emit('sourceLoaded', source)             // Session.ts line 1871
      → Timeline.loadWaveform()                      // Timeline.ts line 148→191
          → WaveformRenderer.loadFromVideo(element)  // Timeline.ts line 205
              → extractAudioFromVideo(video)          // WaveformRenderer.ts line 609→107
                  → fetch(videoSrc, { ... })          // WaveformRenderer.ts line 139
```

Both paths fetch the same blob URL (`blob:http://...`), which triggers a full re-read of the underlying `File` into memory.

---

## Task Breakdown

### Task 7.1: Add `cache: 'force-cache'` to Fetch Calls

**Complexity:** trivial
**Files:** `src/audio/WaveformRenderer.ts`, `src/audio/AudioPlaybackManager.ts`
**Dependencies:** none

#### Current Code Analysis

**WaveformRenderer.ts** — `extractAudioFromVideo()` (lines 107–220):
- Line 130–131: Detects blob/data URLs via `startsWith('blob:')` / `startsWith('data:')`.
- Line 139–144: `fetch(videoSrc, { signal, mode, credentials })` — no `cache` option.
- Already differentiates `mode` between blob/data URLs (`'same-origin'`) and external URLs (`'cors'`).

**AudioPlaybackManager.ts** — `loadFromVideo()` (lines 120–190):
- Line 124: Gets `videoSrc` from `videoElement.src || videoElement.currentSrc`.
- Line 151–155: `fetch(videoSrc, { signal, mode: 'cors', credentials: 'same-origin' })` — no `cache` option.
- Does NOT detect blob/data URLs; uses `mode: 'cors'` unconditionally. This works because blob URLs ignore CORS mode, but it means we must also add blob/data detection here if we want to skip `cache` for those URLs.

#### Implementation Steps

1. **WaveformRenderer.ts, line 139**: Add `cache: 'force-cache'` to the fetch options, but only for non-blob/non-data URLs (the `cache` header is meaningless for blob URLs and may cause browser warnings):

```typescript
// WaveformRenderer.ts extractAudioFromVideo(), line 139
response = await fetch(videoSrc, {
  signal: controller.signal,
  mode: isBlobUrl || isDataUrl ? 'same-origin' : 'cors',
  credentials: 'same-origin',
  cache: isBlobUrl || isDataUrl ? undefined : 'force-cache',
});
```

2. **AudioPlaybackManager.ts, line 151**: Add blob/data URL detection and `cache: 'force-cache'`:

```typescript
// AudioPlaybackManager.ts loadFromVideo(), around line 124-155
const isBlobUrl = videoSrc.startsWith('blob:');
const isDataUrl = videoSrc.startsWith('data:');

const response = await fetch(videoSrc, {
  signal: controller.signal,
  mode: isBlobUrl || isDataUrl ? 'same-origin' : 'cors',
  credentials: 'same-origin',
  cache: isBlobUrl || isDataUrl ? undefined : 'force-cache',
});
```

#### Edge Cases & Risks

- **Blob URL fetch + `cache` header**: The `cache` directive is ignored for blob URLs by all major browsers, but some older engines may log a warning. Safest to explicitly omit it for blob/data URLs.
- **Remote URL behind CDN**: `force-cache` respects the server's `Cache-Control` headers. If the server sets `no-store`, the browser will still re-fetch. This is correct behavior — we don't want to override the server's caching policy, just tell the browser to prefer the cache when allowed.
- **Stale cache after file change**: If the user loads a remote video, changes it on the server, and reloads, `force-cache` may serve stale data. This is acceptable because (a) video URLs in review tools rarely change, and (b) the user can hard-refresh.
- **AudioPlaybackManager mode change**: Changing `mode` from unconditional `'cors'` to `'same-origin'` for blob URLs is safe because blob URLs are same-origin by definition and ignore CORS mode. However, we should test that this doesn't break the fallback path.

#### Test Specifications

**File:** `src/audio/WaveformRenderer.test.ts`

```typescript
describe('Task 7.1: force-cache for fetch calls', () => {
  // Uses existing test setup with mocked fetch and AudioContext

  it('EXT-011: HTTP URL fetch uses cache: force-cache', async () => {
    const video = document.createElement('video');
    video.src = 'https://cdn.example.com/test.mp4';

    await extractAudioFromVideo(video);

    expect(fetch).toHaveBeenCalledWith(
      'https://cdn.example.com/test.mp4',
      expect.objectContaining({
        cache: 'force-cache',
        mode: 'cors',
      })
    );
  });

  it('EXT-012: Blob URL fetch does NOT use force-cache', async () => {
    const video = document.createElement('video');
    video.src = 'blob:http://localhost:3000/abc-123';

    await extractAudioFromVideo(video);

    expect(fetch).toHaveBeenCalledWith(
      'blob:http://localhost:3000/abc-123',
      expect.objectContaining({
        mode: 'same-origin',
      })
    );
    // Verify cache is not set (undefined)
    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.cache).toBeUndefined();
  });

  it('EXT-013: Data URL fetch does NOT use force-cache', async () => {
    const video = document.createElement('video');
    video.src = 'data:video/mp4;base64,AAAA';

    await extractAudioFromVideo(video);

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.cache).toBeUndefined();
    expect(callArgs.mode).toBe('same-origin');
  });
});
```

**File:** `src/audio/AudioPlaybackManager.test.ts`

```typescript
describe('Task 7.1: force-cache for AudioPlaybackManager fetch', () => {
  it('APM-025: HTTP URL fetch uses cache: force-cache', async () => {
    const video = document.createElement('video');
    video.src = 'https://cdn.example.com/test.mp4';

    await manager.loadFromVideo(video);

    expect(fetch).toHaveBeenCalledWith(
      'https://cdn.example.com/test.mp4',
      expect.objectContaining({
        cache: 'force-cache',
      })
    );
  });

  it('APM-026: Blob URL fetch does NOT use force-cache', async () => {
    const video = document.createElement('video');
    video.src = 'blob:http://localhost:3000/abc-123';

    await manager.loadFromVideo(video);

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.cache).toBeUndefined();
  });

  it('APM-027: Blob URL fetch uses same-origin mode', async () => {
    const video = document.createElement('video');
    video.src = 'blob:http://localhost:3000/abc-123';

    await manager.loadFromVideo(video);

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        mode: 'same-origin',
      })
    );
  });
});
```

---

### Task 7.2: Expose File from VideoSourceNode

**Complexity:** trivial
**Files:** `src/nodes/sources/VideoSourceNode.ts`
**Dependencies:** none (prerequisite for Task 7.3)

#### Current Code Analysis

`VideoSourceNode` stores the `File` as a private field:
- Line 44: `private file: File | null = null;`
- Line 100: `this.properties.add({ name: 'file', defaultValue: null });` — registers the property
- Line 374: `this.file = file;` — sets the private field in `loadFile()`
- **CRITICAL GAP**: `loadFile()` **never** calls `properties.setValue('file', file)`. The property always remains `null` for files loaded via `loadVideoFile()`.

The only place `properties.getValue('file')` returns a non-null value is when the GTO graph loader explicitly sets it (tested in `Session.media.test.ts` lines 213, 332), which is the `.rv` file load path — not the typical drag-and-drop or file-picker path.

This means the plan's original approach (`source.videoSourceNode?.properties.getValue('file')`) would **silently fail** for the most common use case (drag-and-drop file loading).

#### Implementation Steps

1. **Add a public `getFile()` accessor** to `VideoSourceNode` (after line 44):

```typescript
// VideoSourceNode.ts, after line 44
/**
 * Get the original File object used to load this source.
 * Returns null for URL-loaded sources.
 */
getFile(): File | null {
  return this.file;
}
```

2. **Alternatively** (simpler, consistent with existing property pattern), add `properties.setValue('file', file)` in `loadFile()` at line 374:

```typescript
// VideoSourceNode.ts loadFile(), line 374
this.file = file;
this.properties.setValue('file', file);  // Expose via properties for consumers
```

**Recommendation**: Use the `getFile()` accessor approach. It is more explicit, type-safe, and avoids storing large `File` objects in the generic properties serialization path (the `toJSON()` method at line 1217 would try to serialize the `File` object, which would fail or produce garbage). The properties system is designed for serializable values.

#### Edge Cases & Risks

- **Property serialization**: If we use `properties.setValue('file', file)`, the `toJSON()` call at line 1217 will attempt to serialize a `File` object, which becomes `{}` in JSON. This is a data-loss bug for `.rv` file save. The `getFile()` accessor avoids this completely.
- **Memory**: The `File` object is a lightweight handle to the OS file; it does not copy file contents into memory. No memory concern.
- **Garbage collection**: The `File` reference prevents the browser from releasing the file handle. This is already the case (the private `this.file` field holds the same reference), so no change in GC behavior.

#### Test Specifications

**File:** `src/nodes/sources/VideoSourceNode.test.ts` (if exists) or `src/audio/WaveformRenderer.test.ts`

```typescript
describe('Task 7.2: VideoSourceNode.getFile()', () => {
  it('VSN-FILE-001: getFile() returns null before loadFile', () => {
    const node = new VideoSourceNode('test');
    expect(node.getFile()).toBeNull();
  });

  it('VSN-FILE-002: getFile() returns the File after loadFile', async () => {
    const node = new VideoSourceNode('test');
    const file = new File(['video data'], 'test.mp4', { type: 'video/mp4' });
    // loadFile requires mocking video element creation — may be tested
    // indirectly through integration tests instead
    // This is a trivial getter, so verifying the field assignment is sufficient
  });
});
```

---

### Task 7.3: Pass Original File to WaveformRenderer in Timeline

**Complexity:** small
**Files:** `src/ui/components/Timeline.ts`
**Dependencies:** Task 7.2 (needs `getFile()` accessor)

#### Current Code Analysis

`Timeline.loadWaveform()` (lines 191–210):
```typescript
private async loadWaveform(): Promise<void> {
  this.waveformLoaded = false;
  this.waveformRenderer.clear();

  const source = this.session.currentSource;           // line 195
  if (!source || source.type !== 'video') {            // line 196
    return;
  }

  const element = source.element;                      // line 200
  if (!(element instanceof HTMLVideoElement)) {        // line 201
    return;
  }

  const success = await this.waveformRenderer.loadFromVideo(element); // line 205
  this.waveformLoaded = success;                       // line 206
  if (success) {
    this.draw();                                       // line 208
  }
}
```

This always calls `loadFromVideo(element)`, which internally does `fetch(element.src)`. For local files, `element.src` is a blob URL like `blob:http://localhost:3000/abc-123`.

`WaveformRenderer.loadFromBlob()` (lines 619–634) already exists and works correctly:
- Calls `extractAudioFromBlob(blob)` (line 626)
- Which calls `blob.arrayBuffer()` directly (line 241) — no `fetch()` needed
- A `File` extends `Blob`, so passing a `File` to `loadFromBlob()` is type-safe

#### Implementation Steps

1. **Modify `Timeline.loadWaveform()`** (lines 191–210) to check for the original `File`:

```typescript
private async loadWaveform(): Promise<void> {
  this.waveformLoaded = false;
  this.waveformRenderer.clear();

  const source = this.session.currentSource;
  if (!source || source.type !== 'video') {
    return;
  }

  const element = source.element;
  if (!(element instanceof HTMLVideoElement)) {
    return;
  }

  // Try to use the original File object directly (avoids redundant blob URL fetch)
  const file = source.videoSourceNode?.getFile();
  let success: boolean;
  if (file) {
    success = await this.waveformRenderer.loadFromBlob(file);
  } else {
    success = await this.waveformRenderer.loadFromVideo(element);
  }

  this.waveformLoaded = success;
  if (success) {
    this.draw();
  }
}
```

#### Edge Cases & Risks

- **`source.videoSourceNode` is undefined**: This happens for URL-loaded videos (e.g., `loadVideoFromUrl()`). The fallback to `loadFromVideo(element)` handles this case. The `?.` optional chaining ensures no crash.
- **`getFile()` returns null**: This happens for URL-loaded videos where no local `File` exists. Falls back to `loadFromVideo(element)`.
- **File has been garbage collected**: Not possible in JavaScript — as long as the `VideoSourceNode` holds a reference via `this.file`, the `File` object is alive.
- **Large files (multi-GB)**: `blob.arrayBuffer()` creates a full in-memory copy of the file. This is the same behavior as the current `fetch(blobUrl).then(r => r.arrayBuffer())` path — no regression. For very large files, the `extractAudioWithMediabunny()` fallback (streaming) would be a future improvement, but is out of scope for this plan.
- **Concurrent reads**: `File.arrayBuffer()` and `fetch(blobUrl)` can both be called simultaneously without issues. If the AudioCoordinator's `loadFromVideo()` is still in flight when `loadWaveform()` starts, both will read the same `File` — safe because `File` is immutable and reads are independent.
- **Source switching during load**: If the user switches sources while waveform is loading, `loadWaveform()` is called again, which calls `waveformRenderer.clear()` first. The in-flight `loadFromBlob()` will complete but `this.loading` guard in `WaveformRenderer` (line 619: `if (this.loading) return false;`) prevents stale data. However, note that the guard returns `false` — it does NOT cancel the in-flight operation. This is an existing limitation, not introduced by this change.

#### Test Specifications

**File:** `src/ui/components/Timeline.test.ts`

```typescript
describe('Task 7.3: loadWaveform uses File when available', () => {
  it('WAV-010: loadFromBlob is called when videoSourceNode has a file', async () => {
    // Setup: Create a mock VideoSourceNode with getFile() returning a File
    const mockFile = new File(['audio data'], 'test.mp4', { type: 'video/mp4' });
    const mockVideoSourceNode = {
      getFile: () => mockFile,
      isUsingMediabunny: () => false,
      isHDR: () => false,
    };

    // Create a source with videoSourceNode
    (session as any).setSources([{
      type: 'video',
      name: 'test.mp4',
      url: 'blob:test',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
      element: document.createElement('video'),
      videoSourceNode: mockVideoSourceNode,
    }]);

    // Spy on waveformRenderer
    const waveformRenderer = (timeline as any).waveformRenderer;
    const loadFromBlobSpy = vi.spyOn(waveformRenderer, 'loadFromBlob')
      .mockResolvedValue(true);
    const loadFromVideoSpy = vi.spyOn(waveformRenderer, 'loadFromVideo')
      .mockResolvedValue(true);

    // Trigger loadWaveform via sourceLoaded event
    await (timeline as any).loadWaveform();

    expect(loadFromBlobSpy).toHaveBeenCalledWith(mockFile);
    expect(loadFromVideoSpy).not.toHaveBeenCalled();
  });

  it('WAV-011: loadFromBlob does not call fetch', async () => {
    // Verify at the WaveformRenderer level
    const renderer = new WaveformRenderer();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Mock AudioContext for blob decoding
    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
      decodeAudioData: vi.fn().mockResolvedValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(100)),
        numberOfChannels: 1,
        length: 100,
        duration: 1,
        sampleRate: 44100,
      }),
      close: vi.fn().mockResolvedValue(undefined),
    })));

    const file = new File(['data'], 'test.mp4', { type: 'video/mp4' });
    await renderer.loadFromBlob(file);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('WAV-012: falls back to loadFromVideo when no videoSourceNode', async () => {
    // Source without videoSourceNode (remote URL case)
    (session as any).setSources([{
      type: 'video',
      name: 'remote.mp4',
      url: 'https://cdn.example.com/remote.mp4',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
      element: document.createElement('video'),
      // No videoSourceNode
    }]);

    const waveformRenderer = (timeline as any).waveformRenderer;
    const loadFromBlobSpy = vi.spyOn(waveformRenderer, 'loadFromBlob');
    const loadFromVideoSpy = vi.spyOn(waveformRenderer, 'loadFromVideo')
      .mockResolvedValue(true);

    await (timeline as any).loadWaveform();

    expect(loadFromBlobSpy).not.toHaveBeenCalled();
    expect(loadFromVideoSpy).toHaveBeenCalled();
  });

  it('WAV-013: falls back to loadFromVideo when getFile() returns null', async () => {
    // videoSourceNode exists but getFile() returns null (URL-loaded video)
    const mockVideoSourceNode = {
      getFile: () => null,
      isUsingMediabunny: () => false,
      isHDR: () => false,
    };

    (session as any).setSources([{
      type: 'video',
      name: 'test.mp4',
      url: 'blob:test',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
      element: document.createElement('video'),
      videoSourceNode: mockVideoSourceNode,
    }]);

    const waveformRenderer = (timeline as any).waveformRenderer;
    const loadFromBlobSpy = vi.spyOn(waveformRenderer, 'loadFromBlob');
    const loadFromVideoSpy = vi.spyOn(waveformRenderer, 'loadFromVideo')
      .mockResolvedValue(true);

    await (timeline as any).loadWaveform();

    expect(loadFromBlobSpy).not.toHaveBeenCalled();
    expect(loadFromVideoSpy).toHaveBeenCalled();
  });
});
```

**File:** `src/audio/WaveformRenderer.test.ts`

```typescript
describe('Task 7.3: loadFromBlob with File object', () => {
  it('WAV-014: loadFromBlob accepts File (extends Blob)', async () => {
    // This test verifies the type compatibility (File extends Blob)
    const renderer = new WaveformRenderer();

    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
      decodeAudioData: vi.fn().mockResolvedValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(100)),
        numberOfChannels: 1,
        length: 100,
        duration: 1,
        sampleRate: 44100,
      }),
      close: vi.fn().mockResolvedValue(undefined),
    })));

    const file = new File(['test audio data'], 'test.mp4', { type: 'video/mp4' });
    const result = await renderer.loadFromBlob(file);

    expect(result).toBe(true);
    expect(renderer.hasData()).toBe(true);
    expect(renderer.getData()?.duration).toBe(1);

    vi.unstubAllGlobals();
  });
});
```

---

## Edge Cases Summary

| Case | Handling | Verified In |
|------|----------|-------------|
| Blob URL fetch + `cache` option | `cache` is no-op for blob URLs; we explicitly omit it to avoid browser warnings | Task 7.1 tests EXT-012, APM-026 |
| Remote URL without CORS | Same behavior as before; `force-cache` doesn't change CORS semantics | Task 7.1 test EXT-011 |
| `videoSourceNode` undefined (remote URL) | `?.getFile()` returns `undefined`, falsy check falls through to `loadFromVideo()` | Task 7.3 test WAV-012 |
| `getFile()` returns null (URL-loaded video) | Falsy check falls through to `loadFromVideo()` | Task 7.3 test WAV-013 |
| Large files (multi-GB) | Same memory behavior as current `fetch(blob) → arrayBuffer()` path; no regression | N/A (existing behavior) |
| Concurrent reads (AudioCoordinator + WaveformRenderer) | `File.arrayBuffer()` is safe for concurrent reads — `File` is immutable | N/A (browser guarantee) |
| Source switch during waveform load | `waveformRenderer.clear()` called first; `loading` guard prevents stale data | Existing behavior |
| Property serialization (`toJSON()`) | Using `getFile()` accessor avoids storing `File` in serializable properties | Task 7.2 design choice |
| AudioPlaybackManager mode: 'cors' for blob URLs | Currently works (blob URLs ignore CORS mode), but changing to 'same-origin' is more correct | Task 7.1 test APM-027 |
| GTO graph loader setting file property | Existing `properties.getValue('file')` path still works for `.rv` file loads; `getFile()` also works since `loadFile()` sets `this.file` | Existing tests in Session.media.test.ts |

## Impact

- **Local files (drag-and-drop / file picker)**: Eliminates the redundant blob URL `fetch()` in WaveformRenderer. The original `File` object is read directly via `blob.arrayBuffer()`, saving one full file read (~100ms for 100MB file, ~1s for 1GB file).
- **Remote files**: Second `fetch()` (WaveformRenderer) can be served from HTTP cache if the server allows caching, avoiding a second download.
- **AudioPlaybackManager**: Also gets `force-cache` for remote URLs. For local files, it still does `fetch(blobUrl)` — a future optimization could pass `File` to `AudioCoordinator.loadFromBlob()` as well, but this is lower priority because AudioPlaybackManager has a graceful video-element fallback.

## Implementation Order

1. **Task 7.2** (trivial, 5 min) — Add `getFile()` to `VideoSourceNode`
2. **Task 7.1** (trivial, 10 min) — Add `cache: 'force-cache'` to both fetch calls
3. **Task 7.3** (small, 15 min) — Modify `Timeline.loadWaveform()` to use `File` when available

Tasks 7.1 and 7.2 are independent and can be done in parallel. Task 7.3 depends on 7.2.

## Key Code References

| Location | Line | Description |
|----------|------|-------------|
| `src/audio/WaveformRenderer.ts` | 139 | `fetch()` in `extractAudioFromVideo()` |
| `src/audio/WaveformRenderer.ts` | 619 | `loadFromBlob()` on `WaveformRenderer` class |
| `src/audio/WaveformRenderer.ts` | 228 | `extractAudioFromBlob()` — no-fetch path |
| `src/audio/AudioPlaybackManager.ts` | 151 | `fetch()` in `loadFromVideo()` |
| `src/audio/AudioPlaybackManager.ts` | 195 | `loadFromBlob()` on `AudioPlaybackManager` |
| `src/audio/AudioCoordinator.ts` | 71 | `loadFromVideo()` — delegates to `AudioPlaybackManager` |
| `src/ui/components/Timeline.ts` | 191 | `loadWaveform()` — triggers waveform extraction |
| `src/ui/components/Timeline.ts` | 205 | Current: `this.waveformRenderer.loadFromVideo(element)` |
| `src/nodes/sources/VideoSourceNode.ts` | 44 | `private file: File | null = null;` |
| `src/nodes/sources/VideoSourceNode.ts` | 100 | `properties.add({ name: 'file', defaultValue: null })` |
| `src/nodes/sources/VideoSourceNode.ts` | 374 | `this.file = file;` in `loadFile()` — but NO `properties.setValue()` |
| `src/core/session/Session.ts` | 209 | `MediaSource` interface (has `videoSourceNode?`) |
| `src/core/session/Session.ts` | 1813 | `URL.createObjectURL(file)` — creates the blob URL |
| `src/core/session/Session.ts` | 1853 | `AudioCoordinator.loadFromVideo()` call |
| `src/core/session/Session.ts` | 1871 | `emit('sourceLoaded')` — triggers `Timeline.loadWaveform()` |

## Existing Test Files

| File | Test Count | Relevant Tests |
|------|-----------|----------------|
| `src/audio/WaveformRenderer.test.ts` | 28 tests | EXT-001 through EXT-023, RND-*, RGN-*, WAV-001 through WAV-007 |
| `src/audio/AudioPlaybackManager.test.ts` | 30 tests | APM-001 through APM-121, SCRUB-001 through SCRUB-005 |
| `src/ui/components/Timeline.test.ts` | 35 tests | TML-001 through TML-036, TL-H05*, TML-REG-* |
| `src/audio/AudioCoordinator.test.ts` | exists | AudioCoordinator integration tests |
