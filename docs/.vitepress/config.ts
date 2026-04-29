import { defineConfig } from 'vitepress';
import typedocSidebar from '../api/typedoc-sidebar.json';

// Fix typedoc-vitepress-theme sidebar links: strip '/docs' prefix and '.md' extension
interface SidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: SidebarItem[];
}

function fixSidebarLinks(items: SidebarItem[]): SidebarItem[] {
  return items.map((item) => ({
    ...item,
    link: item.link?.replace(/^\/docs/, '').replace(/\.md$/, ''),
    items: item.items ? fixSidebarLinks(item.items) : undefined,
  }));
}

const apiSidebar = fixSidebarLinks(typedocSidebar as SidebarItem[]);

export default defineConfig({
  title: 'OpenRV Web',
  description: 'Web-based VFX image/sequence viewer inspired by OpenRV',
  base: '/openrv-web/docs/',
  outDir: '.vitepress/dist',
  srcExclude: ['**/node_modules/**', '**/review/**', '**/scripts/**', '**/_templates/**', '**/generated/**'],

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started/' },
      {
        text: 'User Guide',
        items: [
          { text: 'Playback', link: '/playback/timeline-controls' },
          { text: 'Color', link: '/color/primary-controls' },
          { text: 'Comparison', link: '/compare/ab-switching' },
          { text: 'Scopes', link: '/scopes/histogram' },
          { text: 'Annotations', link: '/annotations/pen-eraser' },
          { text: 'Export', link: '/export/frame-export' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Rendering Pipeline', link: '/guides/rendering-pipeline' },
          { text: 'LUT System', link: '/guides/lut-system' },
          { text: 'CDL Color Correction', link: '/guides/cdl-color-correction' },
          { text: 'OCIO Color Management', link: '/guides/ocio-color-management' },
          { text: 'File Formats', link: '/guides/file-formats' },
          { text: 'Node Graph', link: '/guides/node-graph-architecture' },
          { text: 'Stereo 3D', link: '/guides/stereo-3d-viewing' },
          { text: 'Session Compatibility', link: '/guides/session-compatibility' },
        ],
      },
      { text: 'API Reference', link: '/api/' },
      {
        text: 'Links',
        items: [
          { text: 'App', link: 'https://lifeart.github.io/openrv-web' },
          { text: 'GitHub', link: 'https://github.com/lifeart/openrv-web' },
        ],
      },
    ],

    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/getting-started/' },
            { text: 'Installation', link: '/getting-started/installation' },
            { text: 'Browser Requirements', link: '/getting-started/browser-requirements' },
            { text: 'Quick Start', link: '/getting-started/quick-start' },
            { text: 'UI Overview', link: '/getting-started/ui-overview' },
          ],
        },
      ],

      '/playback/': [
        {
          text: 'Playback & Navigation',
          items: [
            { text: 'Timeline Controls', link: '/playback/timeline-controls' },
            { text: 'J/K/L Navigation', link: '/playback/jkl-navigation' },
            { text: 'Loop Modes & Stepping', link: '/playback/loop-modes-stepping' },
            { text: 'Audio', link: '/playback/audio' },
            { text: 'Image Sequences', link: '/playback/image-sequences' },
            { text: 'EXR Layers & AOVs', link: '/playback/exr-layers' },
            { text: 'Channel Isolation', link: '/playback/channel-isolation' },
            { text: 'Viewer Navigation', link: '/playback/viewer-navigation' },
          ],
        },
      ],

      '/color/': [
        {
          text: 'Color Management',
          items: [
            { text: 'Primary Controls', link: '/color/primary-controls' },
            { text: 'Color Wheels', link: '/color/color-wheels' },
            { text: 'HSL Qualifier', link: '/color/hsl-qualifier' },
            { text: 'CDL', link: '/color/cdl' },
            { text: 'Curves', link: '/color/curves' },
            { text: 'LUT', link: '/color/lut' },
            { text: 'OCIO', link: '/color/ocio' },
            { text: 'Log Curves', link: '/color/log-curves' },
            { text: 'Tone Mapping', link: '/color/tone-mapping' },
            { text: 'Display Profiles', link: '/color/display-profiles' },
            { text: 'Inversion & Hue', link: '/color/inversion-hue' },
          ],
        },
      ],

      '/compare/': [
        {
          text: 'Comparison & Review',
          items: [
            { text: 'A/B Switching', link: '/compare/ab-switching' },
            { text: 'Wipe Mode', link: '/compare/wipe-mode' },
            { text: 'Split Screen', link: '/compare/split-screen' },
            { text: 'Difference Matte', link: '/compare/difference-matte' },
            { text: 'Blend Modes', link: '/compare/blend-modes' },
            { text: 'Advanced Compare', link: '/compare/advanced-compare' },
          ],
        },
      ],

      '/scopes/': [
        {
          text: 'Scopes & Analysis',
          items: [
            { text: 'Histogram', link: '/scopes/histogram' },
            { text: 'Waveform', link: '/scopes/waveform' },
            { text: 'Vectorscope', link: '/scopes/vectorscope' },
            { text: 'Pixel Probe', link: '/scopes/pixel-probe' },
            { text: 'False Color & Zebra', link: '/scopes/false-color-zebra' },
            { text: 'Gamut Diagram', link: '/scopes/gamut-diagram' },
          ],
        },
      ],

      '/annotations/': [
        {
          text: 'Annotations',
          items: [
            { text: 'Pen & Eraser', link: '/annotations/pen-eraser' },
            { text: 'Shapes', link: '/annotations/shapes' },
            { text: 'Text', link: '/annotations/text' },
            { text: 'Per-Frame & Ghost Modes', link: '/annotations/per-frame-modes' },
            { text: 'Export', link: '/annotations/export' },
          ],
        },
      ],

      '/export/': [
        {
          text: 'Export',
          items: [
            { text: 'Frame Export', link: '/export/frame-export' },
            { text: 'Video Export', link: '/export/video-export' },
            { text: 'Slate & Frameburn', link: '/export/slate-frameburn' },
            { text: 'EDL & OTIO', link: '/export/edl-otio' },
            { text: 'Sessions', link: '/export/sessions' },
          ],
        },
      ],

      '/advanced/': [
        {
          text: 'Advanced Topics',
          items: [
            { text: 'Stereo 3D', link: '/advanced/stereo-3d' },
            { text: 'Network Sync', link: '/advanced/network-sync' },
            { text: 'DCC Integration', link: '/advanced/dcc-integration' },
            { text: 'Session Management', link: '/advanced/session-management' },
            { text: 'Scripting API', link: '/advanced/scripting-api' },
            { text: 'Plugin Development', link: '/advanced/plugin-development' },
            { text: 'Mu Compat Layer', link: '/advanced/mu-compat' },
            { text: 'Filters & Effects', link: '/advanced/filters-effects' },
            { text: 'Transforms', link: '/advanced/transforms' },
            { text: 'Overlays & Guides', link: '/advanced/overlays' },
            { text: 'Review Workflow', link: '/advanced/review-workflow' },
            { text: 'Playlist', link: '/advanced/playlist' },
          ],
        },
      ],

      '/guides/': [
        {
          text: 'Technical Guides',
          items: [
            { text: 'Overview', link: '/guides/' },
            { text: 'Rendering Pipeline', link: '/guides/rendering-pipeline' },
            { text: 'LUT System', link: '/guides/lut-system' },
            { text: 'CDL Color Correction', link: '/guides/cdl-color-correction' },
            { text: 'OCIO Color Management', link: '/guides/ocio-color-management' },
            { text: 'File Formats', link: '/guides/file-formats' },
            { text: 'Node Graph Architecture', link: '/guides/node-graph-architecture' },
            { text: 'Stereo 3D Viewing', link: '/guides/stereo-3d-viewing' },
            { text: 'Session Compatibility', link: '/guides/session-compatibility' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API Reference',
          items: [{ text: 'Overview', link: '/api/' }],
        },
        ...apiSidebar,
      ],

      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'Keyboard Shortcuts', link: '/reference/keyboard-shortcuts' },
            { text: 'File Formats', link: '/reference/file-formats' },
            { text: 'Browser Compatibility', link: '/reference/browser-compatibility' },
            { text: 'FAQ', link: '/reference/faq' },
            { text: 'Troubleshooting', link: '/reference/troubleshooting' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/lifeart/openrv-web' }],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2024-present Alex Kanunnikov',
    },
  },
});
