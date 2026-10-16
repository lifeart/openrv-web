#!/usr/bin/env python3
"""Regenerate the integer TIFF, TGA and SGI fixtures in this folder.

Writers: Pillow and ImageMagick (`convert`), so the decoders are checked
against files from independent encoders. Every image is 20x18 (odd edge
tiles, odd strip sizes) and uses the patterns that
src/formats/StillFormats.reference.test.ts recomputes:

  8-bit:  r=(13x+7y)%256  g=(5x+11y+64)%256  b=(x*x+3y)%256  a=(9xy+30)%256
  16-bit: r=(3001x+977y)%65536  g=(1999x+4093y+512)%65536
          b=(x*x*61+y*389)%65536  a=(7919x+31y+1000)%65536
  gray:   the 8- or 16-bit red pattern
  palette index (x+20y)%256, entry i = (i, 255-i, 7i%256)
  bilevel: (x+y)%2

gray8-miniswhite.tif keeps the gray values but tags them WhiteIsZero, so a
correct reader (libtiff, Pillow) shows the inverted pattern.

Run from the repository root: python3 test-assets/still-formats/generate.py
"""
import os
import subprocess
import tempfile

from PIL import Image

W, H = 20, 18
OUT = os.path.dirname(os.path.abspath(__file__))


def p8(x, y):
    return ((13 * x + 7 * y) % 256, (5 * x + 11 * y + 64) % 256, (x * x + 3 * y) % 256, (9 * x * y + 30) % 256)


def p16(x, y):
    return (
        (3001 * x + 977 * y) % 65536,
        (1999 * x + 4093 * y + 512) % 65536,
        (x * x * 61 + y * 389) % 65536,
        (7919 * x + 31 * y + 1000) % 65536,
    )


def img8(mode):
    im = Image.new(mode, (W, H))
    for y in range(H):
        for x in range(W):
            px = p8(x, y)
            im.putpixel((x, y), px[0] if mode == 'L' else px[: len(mode)])
    return im


def palette_img():
    im = Image.new('P', (W, H))
    pal = []
    for i in range(256):
        pal += [i, 255 - i, (7 * i) % 256]
    im.putpalette(pal)
    for y in range(H):
        for x in range(W):
            im.putpixel((x, y), (x + 20 * y) % 256)
    return im


def bilevel_img():
    im = Image.new('1', (W, H))
    for y in range(H):
        for x in range(W):
            im.putpixel((x, y), 255 if (x + y) % 2 else 0)
    return im


def write_ppm16(path, channels):
    """Write a 16-bit PAM so ImageMagick gets exact 16-bit input."""
    tupl = {1: 'GRAYSCALE', 3: 'RGB', 4: 'RGB_ALPHA'}[channels]
    with open(path, 'wb') as f:
        f.write(f'P7\nWIDTH {W}\nHEIGHT {H}\nDEPTH {channels}\nMAXVAL 65535\nTUPLTYPE {tupl}\nENDHDR\n'.encode())
        for y in range(H):
            for x in range(W):
                for c in range(channels):
                    f.write(p16(x, y)[c].to_bytes(2, 'big'))


def magick(*args):
    subprocess.run(['convert', *args], check=True)


def out(name):
    return os.path.join(OUT, name)


def main():
    tmp = tempfile.mkdtemp()
    rgb8 = img8('RGB')
    rgba8 = img8('RGBA')
    gray8 = img8('L')
    rgb8_png = os.path.join(tmp, 'rgb8.png')
    gray8_png = os.path.join(tmp, 'gray8.png')
    rgb8.save(rgb8_png)
    gray8.save(gray8_png)
    rgb16 = os.path.join(tmp, 'rgb16.pam')
    rgba16 = os.path.join(tmp, 'rgba16.pam')
    gray16 = os.path.join(tmp, 'gray16.pam')
    write_ppm16(rgb16, 3)
    write_ppm16(rgba16, 4)
    write_ppm16(gray16, 1)

    # --- Integer TIFF ---
    rgb8.save(out('rgb8-none.tif'))
    rgb8.save(out('rgb8-lzw.tif'), compression='tiff_lzw')
    rgba8.save(out('rgba8-packbits.tif'), compression='packbits')
    gray8.save(out('gray8-deflate.tif'), compression='tiff_adobe_deflate')
    palette_img().save(out('palette8.tif'))
    bilevel_img().save(out('bilevel1.tif'))
    magick(rgb8_png, '-define', 'tiff:predictor=2', '-compress', 'LZW', out('rgb8-lzw-pred.tif'))
    magick(gray8_png, '-define', 'quantum:polarity=min-is-white', '-compress', 'None', out('gray8-miniswhite.tif'))
    magick(rgb16, '-depth', '16', '-define', 'tiff:predictor=2', '-compress', 'Zip', out('rgb16-zip-pred.tif'))
    magick(rgba16, '-depth', '16', '-endian', 'MSB', '-compress', 'LZW', out('rgba16-be-lzw.tif'))
    magick(gray16, '-depth', '16', '-compress', 'None', out('gray16-none.tif'))
    magick(rgb16, '-depth', '16', '-define', 'tiff:tile-geometry=16x16', '-compress', 'LZW', out('rgb16-tiled.tif'))

    # --- TGA ---
    rgb8.save(out('rgb24.tga'))
    rgba8.save(out('rgba32-rle.tga'), compression='tga_rle')
    gray8.save(out('gray8-rle.tga'), compression='tga_rle')
    palette_img().save(out('palette8.tga'))
    rgba8.save(out('rgba32-topleft.tga'), orientation=1)

    # --- SGI ---
    rgb8.save(out('rgb8.sgi'))
    rgba8.save(out('rgba8.rgba'))
    gray8.save(out('gray8.bw'))
    magick(rgb8_png, '-compress', 'RLE', out('rgb8-rle.sgi'))
    magick(rgb16, '-depth', '16', '-compress', 'RLE', out('rgb16-rle.sgi'))
    magick(rgba16, '-depth', '16', '-compress', 'None', out('rgba16.sgi'))


if __name__ == '__main__':
    main()
