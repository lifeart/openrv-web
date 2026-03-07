# Phase 1: VitePress + TypeDoc Infrastructure Setup

## 1. Overview

This phase establishes the documentation site infrastructure for OpenRV Web using VitePress (static site generator built on Vite) and TypeDoc (TypeScript API documentation generator). By the end of this phase, the project will have:

- A working VitePress documentation site with local dev server
- Auto-generated API reference from the `src/api/` TypeScript source via TypeDoc
- A landing page and basic navigation structure
- A GitHub Actions workflow that builds and deploys the docs site to GitHub Pages alongside the main app
- Developer workflow for previewing and iterating on docs locally

The docs site will be deployed to a `/docs` sub-path under the existing GitHub Pages deployment at `https://lifeart.github.io/openrv-web/docs/`.

## 2. Prerequisites

- Node.js >= 20 (project uses Node 20 in CI)
- pnpm >= 9 (lockfile version 9.0)
- Existing GitHub Pages deployment workflow at `.github/workflows/deploy.yml`
- Public API surface in `src/api/` (11 source files, 9 API classes + types)

## 3. Atomic Tasks

### 1.1 VitePress Installation & Configuration

#### Task 1.1.1: Install VitePress

- **Time estimate:** 15min
- **Dependencies:** none
- **Description:** Add VitePress as a dev dependency using pnpm. VitePress v1.x (stable) is recommended.
- **Commands/Code:**
  ```bash
  pnpm add -D vitepress
  ```
- **Acceptance criteria:** `pnpm ls vitepress` shows the installed version. No dependency conflicts in `pnpm-lock.yaml`.

#### Task 1.1.2: Create docs directory structure

- **Time estimate:** 15min
- **Dependencies:** Task 1.1.1
- **Description:** Create the directory structure that VitePress expects.
- **Commands/Code:**
  ```bash
  mkdir -p docs/.vitepress
  mkdir -p docs/getting-started
  mkdir -p docs/api
  mkdir -p docs/guides
  mkdir -p docs/public
  ```
  Directory layout:
  ```
  docs/
  ├── .vitepress/
  │   └── config.ts
  ├── api/
  ├── getting-started/
  │   └── index.md
  ├── guides/
  │   └── index.md
  ├── public/
  └── index.md
  ```
- **Acceptance criteria:** All directories exist. Running `ls -R docs/` shows the expected structure.

#### Task 1.1.3: Create VitePress configuration file

- **Time estimate:** 30min
- **Dependencies:** Task 1.1.2
- **Description:** Create `docs/.vitepress/config.ts` with full site configuration including nav, sidebar, theme, and search. The `base` must be set for GitHub Pages deployment under the repo name sub-path.
- **Commands/Code:** Create `docs/.vitepress/config.ts`:
  ```ts
  import { defineConfig } from 'vitepress';

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
  ```
- **Note:** Because `base` is set to `/openrv-web/docs/`, `pnpm docs:preview` will serve at `http://localhost:4173/openrv-web/docs/`, not at the root path. The dev server (`pnpm docs:dev`) also respects this base path.
- **Acceptance criteria:** `npx vitepress dev docs` starts without config errors. Nav and sidebar render correctly.

#### Task 1.1.4: Add package.json scripts for docs

- **Time estimate:** 15min
- **Dependencies:** Task 1.1.3
- **Description:** Add npm scripts to `package.json` for common docs operations.
- **Commands/Code:** Add to `"scripts"`:
  ```json
  {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }
  ```
- **Acceptance criteria:** `pnpm docs:dev` starts the dev server. `pnpm docs:build` produces output in `docs/.vitepress/dist/`.

#### Task 1.1.5: Add docs output to .gitignore

- **Time estimate:** 5min
- **Dependencies:** Task 1.1.2
- **Description:** Add the VitePress build output directory and cache to `.gitignore`.
- **Commands/Code:** Append to `.gitignore`:
  ```
  # Docs build output
  docs/.vitepress/dist/
  docs/.vitepress/cache/
  ```
- **Acceptance criteria:** `git status` does not show build artifacts after a docs build.

### 1.2 TypeDoc Setup

#### Task 1.2.0: Create TypeDoc-specific tsconfig

- **Time estimate:** 15min
- **Dependencies:** none
- **Description:** The project uses `"moduleResolution": "bundler"` and `"allowImportingTsExtensions": true` in the base `tsconfig.json`. TypeDoc uses the TS compiler API to resolve modules and will fail with this config. Create a `tsconfig.typedoc.json` that extends the base config but overrides the incompatible settings.
- **Commands/Code:** Create `tsconfig.typedoc.json`:
  ```json
  {
    "extends": "./tsconfig.json",
    "compilerOptions": {
      "moduleResolution": "node",
      "allowImportingTsExtensions": false
    }
  }
  ```
- **Acceptance criteria:** `npx tsc --project tsconfig.typedoc.json --noEmit` succeeds (or only produces non-resolution errors). TypeDoc can use this config to resolve all `src/api/` imports.

#### Task 1.2.1: Install TypeDoc and VitePress plugin

- **Time estimate:** 15min
- **Dependencies:** Task 1.1.1
- **Description:** Install TypeDoc and the markdown/VitePress plugins.
- **Commands/Code:**
  ```bash
  pnpm add -D typedoc typedoc-plugin-markdown typedoc-vitepress-theme
  ```
- **Acceptance criteria:** All three packages installed without conflicts.

#### Task 1.2.2: Create TypeDoc configuration

- **Time estimate:** 30min
- **Dependencies:** Task 1.2.0, Task 1.2.1
- **Description:** Create `typedoc.json` at the project root targeting `src/api/index.ts`.
- **Commands/Code:** Create `typedoc.json`:
  ```json
  {
    "$schema": "https://typedoc.org/schema.json",
    "entryPoints": ["src/api/index.ts"],
    "out": "docs/api",
    "plugin": ["typedoc-plugin-markdown", "typedoc-vitepress-theme"],
    "tsconfig": "tsconfig.typedoc.json",
    "readme": "none",
    "githubPages": false,
    "disableSources": false,
    "excludePrivate": true,
    "excludeProtected": true,
    "excludeInternal": true,
    "hideGenerator": true,
    "entryPointStrategy": "resolve",
    "outputFileStrategy": "modules",
    "flattenOutputFiles": false,
    "membersWithOwnFile": ["Class", "Interface", "Enum"],
    "navigationModel": {
      "excludeGroups": false,
      "excludeCategories": false
    }
  }
  ```
- **Acceptance criteria:** Running `npx typedoc` generates `.md` files in `docs/api/`.

#### Task 1.2.3: Add TypeDoc generation script

- **Time estimate:** 10min
- **Dependencies:** Task 1.2.2
- **Description:** Update `package.json` scripts to integrate TypeDoc with VitePress build.
- **Commands/Code:** Update scripts:
  ```json
  {
    "docs:api": "typedoc",
    "docs:build": "pnpm docs:api && vitepress build docs",
    "docs:dev": "pnpm docs:api && vitepress dev docs"
  }
  ```
- **Acceptance criteria:** `pnpm docs:api` generates API docs. `pnpm docs:build` generates full site.

#### Task 1.2.4: Verify TypeDoc output and fix warnings

- **Time estimate:** 2-4 hours
- **Dependencies:** Task 1.2.3
- **Description:** Run TypeDoc and verify all 9 API classes appear. Fix any warnings.
- **Note:** This task may require significant debugging if `moduleResolution` issues persist even with `tsconfig.typedoc.json`. Budget time for iterating on TypeDoc configuration, fixing unresolved imports, and adding `@internal` tags to problematic types.
- **Expected output files:**
  - `docs/api/classes/OpenRVAPI.md`
  - `docs/api/classes/PlaybackAPI.md`
  - `docs/api/classes/MediaAPI.md`
  - `docs/api/classes/AudioAPI.md`
  - `docs/api/classes/LoopAPI.md`
  - `docs/api/classes/ViewAPI.md`
  - `docs/api/classes/ColorAPI.md`
  - `docs/api/classes/MarkersAPI.md`
  - `docs/api/classes/EventsAPI.md`
  - `docs/api/interfaces/` (ViewerProvider, ColorAdjustmentProvider, etc.)
- **Acceptance criteria:** All 9 API classes have generated markdown files. No critical TypeDoc warnings.

#### Task 1.2.5: Add generated API docs to .gitignore

- **Time estimate:** 5min
- **Dependencies:** Task 1.2.2
- **Description:** Generated API docs should not be committed (generated in CI). The hand-written `docs/api/index.md` (API overview from Task 1.3.4) must remain tracked, so use a specific gitignore pattern that excludes TypeDoc-generated files but keeps the overview page.
- **Commands/Code:** Append to `.gitignore`:
  ```
  # Generated API docs (built from source by TypeDoc)
  docs/api/*
  !docs/api/index.md
  ```
- **Acceptance criteria:** TypeDoc-generated files in `docs/api/` are gitignored. `docs/api/index.md` is NOT gitignored and can be committed.

### 1.3 Landing Page & Basic Structure

#### Task 1.3.1: Create the landing page

- **Time estimate:** 30min
- **Dependencies:** Task 1.1.3
- **Description:** Create `docs/index.md` with VitePress hero section and feature cards.
- **Commands/Code:** Create `docs/index.md`:
  ```markdown
  ---
  layout: home

  hero:
    name: OpenRV Web
    text: Web-based VFX Image & Sequence Viewer
    tagline: A browser-native viewer inspired by OpenRV for reviewing images, sequences, and video with professional color tools.
    actions:
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
      details: Exposure, CDL, curves, LUTs, and tone mapping via a WebGL2 fragment shader pipeline.
    - title: Wide Format Support
      details: EXR, DPX, Cineon, HEIF, JPEG XL, JPEG Gainmap, TIFF, and video via WebCodecs.
    - title: Scripting API
      details: Full programmatic control via window.openrv -- playback, view, color, markers, and events.
    - title: Plugin System
      details: Extend functionality with custom exporters, blend modes, and UI panels.
  ---
  ```
- **Acceptance criteria:** `pnpm docs:dev` shows the landing page with hero and feature cards.

#### Task 1.3.2: Create Getting Started placeholder

- **Time estimate:** 15min
- **Dependencies:** Task 1.1.2
- **Description:** Create `docs/getting-started/index.md` with introduction and basic content.
- **Acceptance criteria:** Page renders in VitePress dev server with format table and dev setup instructions.

#### Task 1.3.3: Create Guides placeholder

- **Time estimate:** 10min
- **Dependencies:** Task 1.1.2
- **Description:** Create `docs/guides/index.md` with planned guide topics list.
- **Acceptance criteria:** Page renders, sidebar navigation works.

#### Task 1.3.4: Create API overview page

- **Time estimate:** 15min
- **Dependencies:** Task 1.2.4
- **Description:** Create hand-written `docs/api/index.md` with API overview, quick example, and module table linking to auto-generated class docs.
- **Acceptance criteria:** API overview page renders with working links to class documentation.

#### Task 1.3.5: Update sidebar with TypeDoc-generated pages

- **Time estimate:** 20min
- **Dependencies:** Task 1.2.4, Task 1.3.4
- **Description:** Update `docs/.vitepress/config.ts` sidebar to include all API classes and interfaces. The `typedoc-vitepress-theme` plugin generates a `typedoc-sidebar.json` file alongside the output — import this file in `config.ts` and spread it into the `/api/` sidebar section instead of manually listing pages.
- **Commands/Code:** In `docs/.vitepress/config.ts`:
  ```ts
  import typedocSidebar from '../api/typedoc-sidebar.json';
  // ...
  sidebar: {
    '/api/': [
      { text: 'API Reference', items: [
        { text: 'Overview', link: '/api/' },
        ...typedocSidebar,
      ]},
    ],
  }
  ```
- **Acceptance criteria:** Sidebar shows all API classes. All links resolve to existing pages.

### 1.4 CI/CD Pipeline

#### Task 1.4.1: Create docs build and deploy workflow

- **Time estimate:** 45min
- **Dependencies:** Task 1.2.3, Task 1.1.4
- **Description:** Modify `.github/workflows/deploy.yml` to build both app and docs, merging outputs into a single artifact. The docs go into a `docs/` subdirectory of the `dist/` folder.
- **Commands/Code:** Add to deploy workflow:
  ```yaml
  - name: Generate API docs
    run: pnpm docs:api

  - name: Build docs site
    run: pnpm docs:build

  - name: Merge app and docs into deploy artifact
    run: cp -r docs/.vitepress/dist dist/docs
  ```
- **Acceptance criteria:** Both app and docs deploy. Docs accessible at `/openrv-web/docs/`.

#### Task 1.4.2: Verify deployment works end-to-end

- **Time estimate:** 30min
- **Dependencies:** Task 1.4.1
- **Description:** Push changes, merge to master, verify both app and docs are accessible.
- **Acceptance criteria:** Both URLs return HTTP 200.

### 1.5 Development Workflow

#### Task 1.5.1: Document the local development workflow

- **Time estimate:** 15min
- **Dependencies:** Task 1.2.3
- **Description:** Add docs section to `README.md` explaining how to develop docs locally.
- **Acceptance criteria:** Developer can follow instructions to run docs site locally.

#### Task 1.5.2: Verify hot reload works for manual docs

- **Time estimate:** 15min
- **Dependencies:** Task 1.1.4
- **Description:** Start VitePress dev server and verify editing `.md` files triggers hot reload.
- **Acceptance criteria:** Editing docs files causes browser to refresh automatically.

#### Task 1.5.3: Add docs:watch script for API doc regeneration (optional)

- **Time estimate:** 30min
- **Dependencies:** Task 1.5.2
- **Description:** Set up a file watcher that re-runs TypeDoc when `src/api/` files change.
- **Commands/Code:**
  ```bash
  pnpm add -D chokidar-cli
  ```
  Add to scripts: `"docs:api:watch": "chokidar 'src/api/**/*.ts' -c 'pnpm docs:api' --initial"`
- **Acceptance criteria:** Changing TSDoc in API files triggers automatic regeneration.

## 4. Task Dependency Graph

```
1.1.1 (install vitepress)
  ├── 1.1.2 (create dirs)
  │     ├── 1.1.3 (config.ts)
  │     │     ├── 1.1.4 (scripts)
  │     │     │     └── 1.5.1 (document workflow)
  │     │     │     └── 1.5.2 (verify HMR)
  │     │     │           └── 1.5.3 (watch script)
  │     │     └── 1.3.1 (landing page)
  │     │     └── 1.3.2 (getting started)
  │     │     └── 1.3.3 (guides placeholder)
  │     └── 1.1.5 (gitignore)
  └── 1.2.1 (install typedoc)

1.2.0 (tsconfig.typedoc.json) ── no dependency, can start immediately
  └── 1.2.2 (typedoc.json) ── also depends on 1.2.1
        └── 1.2.3 (api script)
        │     └── 1.4.1 (CI workflow)
        │           └── 1.4.2 (verify deploy)
        └── 1.2.4 (verify output)
        │     └── 1.3.4 (API overview page)
        │     └── 1.3.5 (update sidebar, imports typedoc-sidebar.json)
        └── 1.2.5 (gitignore api/* !index.md)
```

## 5. Total Time Estimate

| Section | Tasks | Estimated Time |
|---------|-------|---------------|
| 1.1 VitePress Installation | 5 tasks | ~1h 20min |
| 1.2 TypeDoc Setup | 6 tasks | ~3h 15min - 5h 15min |
| 1.3 Landing Page & Structure | 5 tasks | ~1h 30min |
| 1.4 CI/CD Pipeline | 2 tasks | ~1h 15min |
| 1.5 Development Workflow | 3 tasks | ~1h |
| **Total** | **21 tasks** | **~8h 20min - 10h 20min** |

## 6. Risk & Decisions Log

| Risk / Decision | Mitigation |
|----------------|------------|
| GitHub Pages only supports one deployment source per repo | Merge app and docs into a single artifact (Strategy A) |
| `typedoc-vitepress-theme` output structure may differ | Run TypeDoc first, adjust sidebar links accordingly |
| TypeDoc may fail on internal types imported by API classes | Use `excludePrivate`, `excludeInternal`, add `@internal` tags |
| VitePress base path must match deployment sub-path | Set `base: '/openrv-web/docs/'` |
| Generated API docs -- commit or gitignore? | Recommended: gitignore and generate in CI |
