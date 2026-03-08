# Scripting API

OpenRV Web exposes a public JavaScript API at `window.openrv` that provides programmatic control over playback, media, audio, view, color, markers, and events. The API is accessible from the browser developer console, embedded page scripts, and automation tools.

---

## Overview

The API is organized into namespaced modules:

| Module | Purpose |
|--------|---------|
| `window.openrv.playback` | Play, pause, seek, step, speed control |
| `window.openrv.media` | Source information, resolution, duration, FPS |
| `window.openrv.audio` | Volume, mute, pitch correction, audio scrub |
| `window.openrv.loop` | Loop mode, in/out points |
| `window.openrv.view` | Zoom, pan, fit modes, channel isolation |
| `window.openrv.color` | Color adjustments, CDL, curves |
| `window.openrv.markers` | Add, remove, navigate markers |
| `window.openrv.events` | Subscribe to state change events |
| `window.openrv.plugins` | Register and manage plugins |
| `window.openrv.version` | API version string (semver) |
| `window.openrv.isReady()` | Check if API is initialized |

---

## Version and Readiness

Before calling any API method, verify that the API is ready:

```javascript
if (window.openrv && window.openrv.isReady()) {
  console.log('OpenRV API v' + window.openrv.version);
}
```

The `version` property returns a semantic version string (e.g., `"1.0.0"`). The `isReady()` method returns `true` once the application has fully initialized and `false` after `dispose()` is called.

---

## Playback Control

The `playback` module controls transport and frame navigation.

```javascript
// Start and stop playback
openrv.playback.play();
openrv.playback.pause();
openrv.playback.toggle();     // Toggle between play and pause
openrv.playback.stop();       // Pause and seek to start

// Frame navigation (frames are 1-based)
openrv.playback.seek(100);    // Jump to frame 100
openrv.playback.step();       // Step forward 1 frame
openrv.playback.step(-1);     // Step backward 1 frame
openrv.playback.step(5);      // Step forward 5 frames

// Speed control (0.1x to 8.0x, default 1.0)
openrv.playback.setSpeed(2.0);
const speed = openrv.playback.getSpeed();

// Playback mode
openrv.playback.setPlaybackMode('realtime');      // May skip frames to maintain FPS
openrv.playback.setPlaybackMode('playAllFrames'); // Display every frame, FPS may drop

// State queries
const frame = openrv.playback.getCurrentFrame();
const total = openrv.playback.getTotalFrames();
const playing = openrv.playback.isPlaying();
```

Frame numbers are 1-based and clamped to the valid range by the session. Invalid arguments (non-numeric, NaN) throw a `ValidationError`.

---

## Media Information

The `media` module provides read-only information about loaded sources.

```javascript
// Source information
const src = openrv.media.getCurrentSource();
if (src) {
  console.log(src.name);       // e.g., "shot_010_v003.exr"
  console.log(src.type);       // "image", "video", or "sequence"
  console.log(src.width);      // e.g., 1920
  console.log(src.height);     // e.g., 1080
  console.log(src.duration);   // Total frames
  console.log(src.fps);        // e.g., 24
}

// Convenience methods
const frames = openrv.media.getDuration();
const fps = openrv.media.getFPS();
const { width, height } = openrv.media.getResolution();
const loaded = openrv.media.hasMedia();
const count = openrv.media.getSourceCount();

// Procedural test patterns
openrv.media.loadProceduralSource('smpte_bars');
openrv.media.loadProceduralSource('checkerboard', { width: 3840, height: 2160, cellSize: 32 });
openrv.media.loadMovieProc('checkerboard,cellSize=32.movieproc');
```

---

## Audio Control

The `audio` module manages volume, mute, pitch correction, and audio scrubbing.

```javascript
// Volume (0.0 to 1.0)
openrv.audio.setVolume(0.75);
const vol = openrv.audio.getVolume();

// Mute
openrv.audio.mute();
openrv.audio.unmute();
openrv.audio.toggleMute();
const muted = openrv.audio.isMuted();

// Pitch correction during non-1x playback
openrv.audio.setPreservesPitch(false);  // Allow pitch to shift with speed
const preserved = openrv.audio.getPreservesPitch();

// Audio scrubbing (play audio snippets during frame stepping)
openrv.audio.enableAudioScrub();
openrv.audio.disableAudioScrub();
openrv.audio.setAudioScrubEnabled(true);
const scrubbing = openrv.audio.isAudioScrubEnabled();
```

---

## Loop Control

The `loop` module manages loop modes and in/out points.

```javascript
// Loop mode: 'once', 'loop', or 'pingpong'
openrv.loop.setMode('loop');
const mode = openrv.loop.getMode();

// In/out points (1-based frame numbers)
openrv.loop.setInPoint(10);
openrv.loop.setOutPoint(200);
const inPt = openrv.loop.getInPoint();
const outPt = openrv.loop.getOutPoint();

// Reset to full range
openrv.loop.clearInOut();
```

---

## View Control

The `view` module controls zoom, pan, fit modes, and channel isolation.

```javascript
// Zoom (1.0 = 100%)
openrv.view.setZoom(2.0);       // 200%
const zoom = openrv.view.getZoom();

// Fit modes
openrv.view.fitToWindow();
openrv.view.fitToWidth();
openrv.view.fitToHeight();
const fitMode = openrv.view.getFitMode();  // 'all', 'width', 'height', or null

// Pan (pixel offset)
openrv.view.setPan(100, -50);
const { x, y } = openrv.view.getPan();

// Channel isolation
openrv.view.setChannel('red');       // Isolate red channel
openrv.view.setChannel('alpha');     // View alpha channel
openrv.view.setChannel('luminance'); // Luminance only
openrv.view.setChannel('rgb');       // Reset to full color
const ch = openrv.view.getChannel();

// Shorthand aliases are accepted: 'r', 'g', 'b', 'a', 'luma', 'l'
openrv.view.setChannel('a');  // Same as 'alpha'
```

---

## Color Adjustments

The `color` module provides access to the color correction pipeline, CDL values, and color curves.

### Primary Corrections

```javascript
// Partial update -- only provided keys are changed
openrv.color.setAdjustments({
  exposure: 1.5,
  saturation: 0.8,
  contrast: 1.1
});

// Read all values
const adj = openrv.color.getAdjustments();
console.log(adj.exposure, adj.gamma, adj.temperature);

// Reset to defaults
openrv.color.reset();
```

Available adjustment keys: `exposure`, `gamma`, `saturation`, `contrast`, `hueRotation`, `temperature`, `tint`, `brightness`, `highlights`, `shadows`, `whites`, `blacks`.

### CDL (Color Decision List)

```javascript
// Set CDL values (partial update)
openrv.color.setCDL({
  slope: { r: 1.1, g: 1.0, b: 0.9 },
  saturation: 1.2
});

// Read CDL
const cdl = openrv.color.getCDL();
console.log(cdl.slope.r, cdl.offset.g, cdl.power.b, cdl.saturation);
```

### Color Curves

```javascript
// Set curves per channel (partial update)
openrv.color.setCurves({
  red: {
    points: [{ x: 0, y: 0.05 }, { x: 0.5, y: 0.6 }, { x: 1, y: 0.95 }],
    enabled: true
  },
  blue: { enabled: false }
});

// Read curves
const curves = openrv.color.getCurves();
console.log(curves.master.points.length);

// Reset curves to identity
openrv.color.resetCurves();
```

Curve points must have `x` and `y` values in the [0, 1] range. At least two points are required per channel.

---

## Marker Management

The `markers` module manages timeline markers with notes and colors.

```javascript
// Add a marker
openrv.markers.add(50);                              // Basic marker at frame 50
openrv.markers.add(50, 'Fix this artifact');          // With note
openrv.markers.add(50, 'Approved', '#00ff00');        // With note and color
openrv.markers.add(50, 'Range note', '#ff0000', 75);  // Duration marker (frames 50-75)

// Query markers
const all = openrv.markers.getAll();   // Sorted by frame
const m = openrv.markers.get(50);      // Specific frame, or null
const n = openrv.markers.count();      // Total count

// Navigate
openrv.markers.goToNext();      // Jump to next marker
openrv.markers.goToPrevious();  // Jump to previous marker

// Remove
openrv.markers.remove(50);  // Remove marker at frame 50
openrv.markers.clear();     // Remove all markers
```

---

## Event System

The `events` module allows subscribing to state change events. All subscriptions return an unsubscribe function.

```javascript
// Subscribe to frame changes
const unsub = openrv.events.on('frameChange', (data) => {
  console.log('Frame:', data.frame);
});

// One-time subscription
openrv.events.once('sourceLoaded', (data) => {
  console.log('Loaded:', data.name, data.width + 'x' + data.height);
});

// Unsubscribe
unsub();
// or
openrv.events.off('frameChange', myHandler);

// List all event names
const names = openrv.events.getEventNames();
```

### Available Events

| Event | Data |
|-------|------|
| `frameChange` | `{ frame }` |
| `play` | (none) |
| `pause` | (none) |
| `stop` | (none) |
| `speedChange` | `{ speed }` |
| `volumeChange` | `{ volume }` |
| `muteChange` | `{ muted }` |
| `audioScrubEnabledChange` | `{ enabled }` |
| `loopModeChange` | `{ mode }` |
| `inOutChange` | `{ inPoint, outPoint }` |
| `markerChange` | `{ markers: [{ frame, note, color }] }` |
| `sourceLoaded` | `{ name, type, width, height, duration, fps }` |
| `error` | `{ message, code? }` |

---

## Custom Workflow Example

The following script automates a QC pass that checks every 10th frame for exposure issues:

```javascript
async function exposureCheck() {
  const duration = openrv.media.getDuration();
  const issues = [];

  for (let frame = 1; frame <= duration; frame += 10) {
    openrv.playback.seek(frame);

    // Allow the frame to render
    await new Promise(resolve => {
      openrv.events.once('frameChange', resolve);
    });

    const adj = openrv.color.getAdjustments();
    // Log frames where exposure compensation is applied
    if (adj.exposure !== 0) {
      issues.push({ frame, exposure: adj.exposure });
    }
  }

  console.table(issues);
  console.log('QC check complete:', issues.length, 'frames with exposure adjustment');
}

exposureCheck();
```

Another common workflow is syncing the viewer with an external timeline:

```javascript
// External timeline sends frame updates
window.addEventListener('message', (event) => {
  if (event.data.type === 'seekFrame' && openrv.isReady()) {
    openrv.playback.seek(event.data.frame);
  }
});

// Report frame changes back to parent
openrv.events.on('frameChange', (data) => {
  window.parent.postMessage({ type: 'frameUpdate', frame: data.frame }, '*');
});
```

---

## Plugin System

OpenRV Web includes a plugin registry that allows extending the application with custom capabilities. Plugins are registered through `window.openrv.plugins` and can contribute:

| Extension Point | Description |
|-----------------|-------------|
| Format decoders | Add support for additional image/video formats |
| Node types | Register custom processing nodes in the render graph |
| Paint tools | Add custom annotation/drawing tools |
| Exporters | Register custom export formats |
| Blend modes | Add compositing blend modes beyond the built-in set |
| UI panels | Inject custom panels into the interface |

Plugins follow a lifecycle of register, initialize, activate, deactivate, and dispose. Dependencies between plugins are resolved automatically with cycle detection. All registrations are scoped per-plugin and cleaned up on deactivation.

```javascript
// Example: register a plugin
openrv.plugins.register({
  id: 'my-custom-exporter',
  name: 'Custom Exporter',
  version: '1.0.0',
  activate(context) {
    context.registerExporter({
      name: 'custom-pdf',
      label: 'Custom PDF Report',
      export(state) { /* ... */ }
    });
  }
});
```

### Plugin Settings Schema

Plugins can declare a `settingsSchema` in their manifest to expose configurable settings. Values are validated against the schema and persisted to localStorage.

```javascript
openrv.plugins.register({
  id: 'com.example.overlay',
  name: 'Overlay Plugin',
  version: '1.0.0',
  contributes: ['uiPanel'],
  settingsSchema: {
    settings: [
      { key: 'opacity', label: 'Overlay Opacity', type: 'range', default: 0.8, min: 0, max: 1, step: 0.05 },
      { key: 'color', label: 'Overlay Color', type: 'color', default: '#ff0000' },
      { key: 'position', label: 'Position', type: 'select', default: 'top-right',
        options: [
          { value: 'top-left', label: 'Top Left' },
          { value: 'top-right', label: 'Top Right' },
          { value: 'bottom-left', label: 'Bottom Left' },
          { value: 'bottom-right', label: 'Bottom Right' }
        ]
      },
      { key: 'label', label: 'Display Label', type: 'string', default: 'Overlay', maxLength: 50 },
      { key: 'enabled', label: 'Show Overlay', type: 'boolean', default: true }
    ]
  },
  activate(context) {
    // Read settings
    const opacity = context.settings.get('opacity');
    const allSettings = context.settings.getAll();

    // Update a setting
    context.settings.set('opacity', 0.5);

    // React to changes
    context.settings.onChange('opacity', (newValue, oldValue) => {
      console.log(`Opacity changed from ${oldValue} to ${newValue}`);
    });

    // Reset all to defaults
    // context.settings.reset();
  }
});
```

Supported setting types: `string`, `number`, `boolean`, `select`, `color`, `range`. See the [API reference](../api/index.md#plugin-settings-accessor) for full details.

### Hot-Reload State Preservation

Plugins can implement `getState()` and `restoreState()` to preserve state across hot-reload cycles. The `HotReloadManager` calls `getState()` before disposing the old version and `restoreState()` after activating the new version.

```javascript
openrv.plugins.register({
  id: 'com.example.annotations',
  name: 'Annotations',
  version: '1.0.0',
  contributes: ['tool'],

  _annotations: [],

  activate(context) {
    // ... register tools, set up UI
  },

  // Called before hot-reload disposal
  getState() {
    return { annotations: this._annotations };
  },

  // Called after hot-reload activation
  restoreState(state) {
    this._annotations = state.annotations || [];
    // Re-render UI with restored data
  }
});
```

### Custom Plugin-to-Plugin Events

Plugins can communicate with each other via custom events. Events emitted with `emitPlugin()` are automatically namespaced with the emitting plugin's ID. Other plugins subscribe using the full namespaced name.

```javascript
// Plugin A: emits events
openrv.plugins.register({
  id: 'com.example.analyzer',
  name: 'Frame Analyzer',
  version: '1.0.0',
  contributes: ['processor'],
  activate(context) {
    // Emitted as "com.example.analyzer:analysis-complete"
    context.events.emitPlugin('analysis-complete', {
      frame: 42,
      histogram: [/* ... */]
    });
  }
});

// Plugin B: listens to Plugin A's events
openrv.plugins.register({
  id: 'com.example.dashboard',
  name: 'Dashboard',
  version: '1.0.0',
  contributes: ['uiPanel'],
  activate(context) {
    // Subscribe using the full namespaced event name
    context.events.onPlugin('com.example.analyzer:analysis-complete', (data) => {
      console.log('Analysis result for frame', data.frame);
    });

    // Subscribe to app events
    context.events.onApp('app:frameChange', (data) => {
      console.log('Frame changed to', data.frame);
    });

    // One-shot subscription
    context.events.onceApp('app:sourceLoaded', (data) => {
      console.log('Source loaded:', data.name);
    });

    // Listen for plugin lifecycle events
    context.events.onApp('plugin:activated', (data) => {
      console.log('Plugin activated:', data.id);
    });
  }
});
```

All subscriptions created via `context.events` are automatically cleaned up when the plugin is deactivated.

---

## Error Handling

API methods validate their arguments and throw `ValidationError` for invalid input. Wrap API calls in try/catch blocks when using programmatic access:

```javascript
try {
  openrv.playback.seek('invalid');
} catch (e) {
  console.error(e.message); // "seek() requires a valid frame number"
}
```

Subscribe to the `error` event for asynchronous error notifications:

```javascript
openrv.events.on('error', (data) => {
  console.error('OpenRV error:', data.message, data.code);
});
```

---

## Related Pages

- [DCC Integration](dcc-integration.md) -- WebSocket-based external application control
- [Review Workflow](review-workflow.md) -- Automation in dailies and review processes
- [Session Management](session-management.md) -- Session state that the API operates on
- [Rendering Pipeline](../guides/rendering-pipeline.md) -- Color pipeline stages controlled by the color API
