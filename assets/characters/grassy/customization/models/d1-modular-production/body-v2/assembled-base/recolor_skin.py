"""Shift the Rodin body skin to the approved v9 head skin colour (Lab mean shift); white base layer untouched.

Run: uv run --with pillow --with numpy --with scikit-image python3 recolor_skin.py <head-basecolor.png>
The head base colour is the Head material image of ../../head-hair-fit/head-hair.glb.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from skimage.color import rgb2lab, lab2rgb

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / 'source/rodin-ce912294/texture_diffuse.png'


def lab(path):
    return rgb2lab(np.asarray(Image.open(path).convert('RGB')).astype(float) / 255)


def skin_weight(l):
    chroma = np.hypot(l[..., 1], l[..., 2])
    # White fabric and its grey trim have chroma < 6; skin sits above 12.
    t = np.clip((chroma - 6) / 6, 0, 1)
    return t * t * (3 - 2 * t) * (l[..., 0] > 40)


def skin_mean(l):
    m = (np.hypot(l[..., 1], l[..., 2]) > 12) & (l[..., 0] > 55) & (l[..., 2] > 5)
    return l[m].mean(0)


head, body = lab(sys.argv[1]), lab(SRC)
shift = skin_mean(head) - skin_mean(body)
out = body + skin_weight(body)[..., None] * shift
Image.fromarray((np.clip(lab2rgb(out), 0, 1) * 255 + .5).astype(np.uint8)).save(HERE / 'texture_diffuse_skin.png')
print('Lab shift', shift.round(2), 'result skin mean', skin_mean(out).round(1), 'head', skin_mean(head).round(1))
