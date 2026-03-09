---
layout: home

hero:
  name: OpenRV Web
  text: Professional VFX Review in Your Browser
  tagline: No install. No plugins. No compromise. Open source and free forever.
  image:
    src: /assets/screenshots/26-color-wheels.png
    alt: OpenRV Web with color wheels, video playback, and timeline
  actions:
    - theme: brand
      text: Try the Live Demo
      link: https://lifeart.github.io/openrv-web
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: API Reference
      link: /api/
    - theme: alt
      text: View on GitHub
      link: https://github.com/lifeart/openrv-web

features:
  - title: Professional Color Pipeline
    details: Grade with the same tools you trust -- CDL, curves, LUTs, OCIO, and tone mapping. GPU-accelerated, so adjustments are instant even on 4K EXR.
  - title: Every Format You Work With
    details: Open EXR, DPX, Cineon, HEIF, JPEG XL, JPEG Gainmap, TIFF, and video natively. No transcoding, no plugins -- just drag and drop.
  - title: Compare Versions Instantly
    details: Catch every difference with A/B switching, wipe, split screen, and difference matte. Stop guessing -- see exactly what changed between versions.
  - title: Scopes & Exposure Analysis
    details: Make confident color decisions with histogram, waveform, vectorscope, pixel probe, false color, and zebra stripes -- all updating in real time.
  - title: Annotate and Communicate
    details: Draw directly on frames to give clear, visual feedback. Per-frame and ghost modes keep your notes tied to the exact context.
  - title: Scripting API
    details: Automate your pipeline with full programmatic control via window.openrv. Drive playback, color, markers, and events from scripts or external tools.
  - title: Plugin System
    details: Build exactly the workflow you need. Add custom exporters, blend modes, and UI panels without touching core code.
---

## Quick Links

<div class="quick-links">

### For New Users
- [Quick Start Guide](/getting-started/quick-start) -- Load media and start reviewing in 5 minutes
- [UI Overview](/getting-started/ui-overview) -- Learn the interface layout
- [Keyboard Shortcuts](/reference/keyboard-shortcuts) -- Essential shortcuts at a glance

### For Colorists
- [Color Controls](/color/primary-controls) -- Exposure, contrast, saturation, and more
- [CDL Workflow](/color/cdl) -- ASC CDL import and adjustment
- [LUT Pipeline](/color/lut) -- Load and manage 3D LUTs
- [OCIO Integration](/color/ocio) -- OpenColorIO color management

### For Reviewers
- [A/B Comparison](/compare/ab-switching) -- Compare versions side by side
- [Annotations](/annotations/pen-eraser) -- Draw and annotate on frames
- [Review Workflow](/advanced/review-workflow) -- Status tracking and notes
- [Export](/export/frame-export) -- Export frames and video

### For Pipeline TDs
- [Scripting API](/advanced/scripting-api) -- Control OpenRV Web programmatically
- [Mu Compat Layer](/advanced/mu-compat) -- Migrate existing Mu scripts to the browser
- [API Reference](/api/) -- Full TypeDoc-generated API docs
- [DCC Integration](/advanced/dcc-integration) -- Connect to Nuke, Maya, Houdini
- [Session Compatibility](/guides/session-compatibility) -- RV session file support

</div>

<script setup>
import { withBase } from 'vitepress'
</script>

<div class="screenshot-showcase">

## See It in Action

<p class="showcase-subtitle">A sampling of OpenRV Web's interface across color grading, comparison, scopes, and annotation workflows.</p>

<div class="screenshot-grid">
<div class="screenshot-card">
  <img :src="withBase('/assets/screenshots/09-color-panel.png')" alt="Color adjustment panel" loading="lazy" />
  <div class="caption">Color Controls<span>Exposure, contrast, saturation, temperature, and more</span></div>
</div>
<div class="screenshot-card">
  <img :src="withBase('/assets/screenshots/24-curves-editor.png')" alt="Curves editor" loading="lazy" />
  <div class="caption">Curves Editor<span>Per-channel curve adjustments with live preview</span></div>
</div>
<div class="screenshot-card">
  <img :src="withBase('/assets/screenshots/35-split-screen.png')" alt="Split screen comparison" loading="lazy" />
  <div class="caption">Split Screen Compare<span>Side-by-side A/B comparison with draggable divider</span></div>
</div>
<div class="screenshot-card">
  <img :src="withBase('/assets/screenshots/17-false-color.png')" alt="False color exposure map" loading="lazy" />
  <div class="caption">False Color Analysis<span>Exposure visualization for quick evaluation</span></div>
</div>
<div class="screenshot-card">
  <img :src="withBase('/assets/screenshots/20-annotations.png')" alt="Annotation tools" loading="lazy" />
  <div class="caption">Annotations<span>Pen, shapes, and text tools for review notes</span></div>
</div>
<div class="screenshot-card">
  <img :src="withBase('/assets/screenshots/36-difference-matte.png')" alt="Difference matte" loading="lazy" />
  <div class="caption">Difference Matte<span>Pixel-level comparison between versions</span></div>
</div>
</div>

</div>
