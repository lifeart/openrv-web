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
  srcExclude: ['**/node_modules/**'],

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started/' },
      { text: 'API Reference', link: '/api/' },
      { text: 'Guides', link: '/guides/' },
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
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
          ],
        },
        ...apiSidebar,
      ],
      '/guides/': [
        {
          text: 'Guides',
          items: [
            { text: 'Overview', link: '/guides/' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/lifeart/openrv-web' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2024-present Alex Kanunnikov',
    },
  },
});
