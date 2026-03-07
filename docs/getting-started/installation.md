# Installation and Accessing the App

OpenRV Web is a browser-based VFX image and video review tool that requires no installation for end users. It runs entirely in the browser with no server-side processing. There are two ways to access it: via the hosted live demo or by self-hosting a local instance.

## Live Demo

The fastest way to start using OpenRV Web is through the hosted version:

**[https://lifeart.github.io/openrv-web](https://lifeart.github.io/openrv-web)**

Open this URL in a supported browser (Chrome, Firefox, Safari, or Edge) and begin reviewing media immediately. No account or installation is required. All processing happens locally in the browser -- files never leave the machine.

## Self-Hosting

For studios, teams, or individuals who prefer to host their own instance, OpenRV Web can be built and deployed as a static website.

### Prerequisites

Before building OpenRV Web, ensure the following tools are installed:

- **Node.js** 18 or later -- download from [nodejs.org](https://nodejs.org)
- **pnpm** package manager -- install via `npm install -g pnpm`
- **Git** -- for cloning the repository

### Clone and Install

Open a terminal and run the following commands:

```bash
# Clone the repository
git clone https://github.com/lifeart/openrv-web.git
cd openrv-web

# Install dependencies
pnpm install
```

### Development Server

To start a local development server with hot module replacement:

```bash
pnpm dev
```

The server starts on `http://localhost:5173` by default. Open this URL in a browser to use OpenRV Web locally. Changes to source files are reflected immediately without a full page reload.

### Production Build

To create an optimized production build:

```bash
pnpm build
```

This generates static files in the `dist/` directory. The build process minifies JavaScript, optimizes assets, and bundles WebAssembly modules for EXR, JPEG XL, JPEG 2000, HEIC, and OCIO decoding.

To preview the production build locally:

```bash
pnpm preview
```

## Deploying to a Web Server

The production build output in `dist/` is a collection of static files (HTML, JavaScript, CSS, WASM) that can be served by any web server. No server-side runtime is required.

### Static File Hosting

Copy the contents of `dist/` to any static file hosting service:

- **GitHub Pages** -- the official demo uses this approach via GitHub Actions
- **Netlify, Vercel, or Cloudflare Pages** -- drag and drop the `dist/` folder
- **nginx or Apache** -- serve the `dist/` directory as the document root
- **Amazon S3 + CloudFront** -- upload files to an S3 bucket with CloudFront distribution

### MIME Type Configuration

Ensure the web server serves WebAssembly files with the correct MIME type. If `.wasm` files fail to load, add the following MIME type mapping to the server configuration:

```
application/wasm    wasm
```

### HTTPS Recommendation

Some browser APIs used by OpenRV Web (such as WebCodecs for video decoding, clipboard access, and the Fullscreen API) require a secure context. Serve the application over HTTPS in production to ensure all features work correctly.

### Cross-Origin Headers

If loading media from external origins (e.g., a CDN or separate media server), ensure those servers include appropriate CORS headers:

```
Access-Control-Allow-Origin: *
```

Without CORS headers, the browser blocks cross-origin media loading and audio extraction.

## Environment Variables

OpenRV Web supports optional configuration through Vite environment variables:

| Variable | Purpose |
|----------|---------|
| `VITE_NETWORK_SIGNALING_SERVERS` | Custom WebSocket signaling server URLs for collaborative review sessions |

Set these in a `.env` file at the project root before building.

## Verifying the Installation

After deploying, verify that the application loads correctly:

1. Open the URL in a supported browser
2. Confirm the viewer interface appears with the header bar, timeline, and canvas area
3. Drag and drop an image or video file onto the viewer
4. Verify playback controls respond to keyboard shortcuts (`Space` to play/pause)

If any issues arise, consult the [Troubleshooting](../reference/troubleshooting.md) guide.

---

## Related Pages

- [Browser Requirements](browser-requirements.md) -- minimum browser versions and required APIs
- [Quick Start](quick-start.md) -- load media and use basic controls
- [Troubleshooting](../reference/troubleshooting.md) -- resolve common setup issues
