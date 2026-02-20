# Implementation Plan: Audio Waveform Extraction (Item 7)

**Priority Score: 4/25** | Risk: VERY LOW | Effort: S

## Summary

Two independent `fetch()` calls download the same video file simultaneously (AudioPlaybackManager + WaveformRenderer). For local files, the File object is already in memory — no fetch needed.

## Implementation Order

### Task 7.1: Add `cache: 'force-cache'` to Fetch Calls
**Files:** `src/audio/WaveformRenderer.ts` (line 139), `src/audio/AudioPlaybackManager.ts` (line 151)

- For non-blob/non-data URLs, add `cache: 'force-cache'` to fetch options
- For blob/data URLs, `cache` directive is meaningless (blob data in memory)
- `force-cache` leverages browser HTTP cache for remote video URLs

```
// WaveformRenderer.ts extractAudioFromVideo():
response = await fetch(videoSrc, {
  signal: controller.signal,
  mode: isBlobUrl || isDataUrl ? 'same-origin' : 'cors',
  credentials: 'same-origin',
  cache: isBlobUrl || isDataUrl ? undefined : 'force-cache',
});
```

### Task 7.2: Pass Original File to WaveformRenderer (HIGH IMPACT for local files)
**Files:** `src/ui/components/Timeline.ts` (lines 191-210)

- In `loadWaveform()`, extract File from `source.videoSourceNode?.properties.getValue('file')`
- If File exists: call `waveformRenderer.loadFromBlob(file)` directly (avoids fetch entirely)
- If no File (remote URL): fall back to existing `loadFromVideo(element)`

```
// Timeline.ts loadWaveform():
const file = source.videoSourceNode?.properties.getValue('file') as File | undefined;
if (file) {
  success = await this.waveformRenderer.loadFromBlob(file);
} else {
  success = await this.waveformRenderer.loadFromVideo(element);
}
```

- `loadFromBlob()` already exists on WaveformRenderer — uses `blob.arrayBuffer() → decodeAudioData()` without fetch

## Edge Cases
| Case | Handling |
|------|---------|
| Blob URL fetch | `cache` option is no-op; Fix B (File passthrough) is the real fix |
| Remote URL without CORS | Same behavior as before; `force-cache` doesn't change CORS |
| File property missing | `getValue('file')` returns null → falls back to `loadFromVideo()` |
| Large files (GB) | Same as current — `arrayBuffer()` creates memory copy |
| Race with AudioCoordinator | `File.arrayBuffer()` safe for concurrent reads |

## Tests
| ID | Test | Assertion |
|----|------|-----------|
| EXT-011 | HTTP URL fetch uses `cache: 'force-cache'` | Fetch options contain `cache: 'force-cache'` |
| EXT-012 | Blob URL fetch does NOT use `force-cache` | `cache` is undefined |
| WAV-010 | `loadFromBlob` with File succeeds | Returns true, `hasData()` true |
| WAV-011 | `loadFromBlob` does not call fetch | `global.fetch` spy: 0 calls |

## Impact
- **Local files**: Eliminates redundant blob URL fetch; reads File directly from memory
- **Remote files**: Second fetch served from HTTP cache
