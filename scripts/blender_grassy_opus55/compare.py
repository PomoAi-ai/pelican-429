"""Place renders beside reference crops at identical ortho framing.

uv run --with pillow --with numpy python3 compare.py RENDER_DIR OUT.png --focus head --views front,right
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

REF = Path(__file__).resolve().parents[2] / 'public/characters/human/history/turnaround-master-v2'
FRAMES = {'full': (1.55, 3.3, 800, 900), 'head': (2.50, 1.30, 700, 700),
          'torso': (1.55, 1.45, 700, 700), 'legs': (0.55, 1.20, 700, 700)}
# Reference columns that sit on the character's vertical axis.
CENTER = {'front': 620, 'right': 620, 'back': 630, 'left': 634}


def ref_crop(view, focus):
    cz, oh, w, h = FRAMES[focus]
    ppu = h / oh
    im = Image.open(REF / f'{view}.png').convert('RGBA')
    a = np.array(im)[:, :, 3] > 128
    ys = np.nonzero(a.any(axis=1))[0]
    top, bot = ys.min(), ys.max()
    s = 3.1 * ppu / (bot - top)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    out = Image.new('RGBA', (w, h), (154, 154, 154, 255))
    ox = w / 2 - CENTER[view] * s
    oy = h / 2 + cz * ppu - bot * s
    out.alpha_composite(im, (round(ox), round(oy)))
    return out.convert('RGB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('renders')
    ap.add_argument('out')
    ap.add_argument('--focus', default='full')
    ap.add_argument('--views', default='front,right')
    args = ap.parse_args()
    tiles = []
    for view in args.views.split(','):
        r = Image.open(Path(args.renders) / f'{args.focus}-{view}.png').convert('RGBA')
        bg = Image.new('RGBA', r.size, (154, 154, 154, 255))
        bg.alpha_composite(r)
        r = bg.convert('RGB')
        ref = ref_crop(view, args.focus) if view in CENTER else None
        tiles += [r] + ([ref] if ref else [])
    w = sum(t.width for t in tiles)
    sheet = Image.new('RGB', (w, max(t.height for t in tiles)), (60, 60, 60))
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0))
        x += t.width
    sheet.save(args.out)


if __name__ == '__main__':
    main()
