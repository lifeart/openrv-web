# Getting Started

OpenRV Web is a browser-native VFX image and sequence viewer inspired by [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV).

## Supported Formats

| Category | Formats |
|----------|---------|
| Image | EXR, DPX, Cineon, TIFF, PNG, JPEG, JPEG XL, JPEG 2000 |
| HDR | EXR (half/full float), HDR (Radiance), JPEG Gainmap, HEIC Gainmap, AVIF Gainmap |
| Video | MP4, WebM (via WebCodecs) |
| Session | `.rv` (GTO-based session files) |
| Color | `.cube`, `.3dl`, `.csp`, `.spi1d`, `.spi3d` (LUT formats) |

## Quick Start

1. Open the app at [lifeart.github.io/openrv-web](https://lifeart.github.io/openrv-web)
2. Drag and drop a media file onto the viewer
3. Use the toolbar tabs to access color, effects, and annotation tools

## Development Setup

```bash
# Clone the repository
git clone https://github.com/lifeart/openrv-web.git
cd openrv-web

# Install dependencies
pnpm install

# Start the development server
pnpm dev

# Run tests
pnpm test
```
