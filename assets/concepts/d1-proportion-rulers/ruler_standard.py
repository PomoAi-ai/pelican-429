"""Unified character ruler, as defined in public/concepts/character-ruler-standard.md.

Same rulers as the concept page scale guide (character-tile-scale/local-drawing/draw_scale.py):
1 tile = 240 px, the haired barefoot base of each character stands 3.1 tiles tall,
an orange tile ruler and a purple 3.3-head design reference.
"""
from PIL import ImageFont

UNIT, VISIBLE, HEADS = 240, 3.1, 3.3
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
PAPER, INK, BLUE, GRAY, LINE = '#F5F4EF', '#21324A', '#2856A3', '#627183', '#DCE2E6'
PURPLE, ORANGE = '#7550AA', '#C75C25'


def panel(d, box):
    """White figure panel on paper, as on the concept page, so source backgrounds blend in."""
    d.rounded_rectangle(box, radius=20, fill='#FFFFFF', outline=LINE, width=2)


def font(size):
    return ImageFont.truetype(FONT, size)


def body_scale(spec, base):
    """Pixels per source pixel: the base's hair-to-sole height becomes 3.1 tiles; other forms keep that body size."""
    return VISIBLE * UNIT / (base['soles'][0] - base['top']) / spec['body_scale']


def head_ruler(d, x, foot):
    """Purple 3.3-head design reference over the 3.1-tile visible height; labels to the left."""
    top, step = foot - VISIBLE * UNIT, VISIBLE * UNIT / HEADS
    d.text((x, top - 50), '3.3 头身参照', font=font(24), fill=PURPLE, anchor='ma')
    d.line((x, top, x, foot), fill=PURPLE, width=3)
    ticks = [top + h * step for h in (0, 1, 2, 3, 3.3)]
    for h, y in zip((0, 1, 2, 3, 3.3), ticks):
        d.line((x - 14, y, x + 14, y), fill=PURPLE, width=3)
        d.text((x - 22, y), f'{h:g} H', font=font(24), fill=PURPLE, anchor='rm')
    return ticks


def tile_ruler(d, x, foot):
    """Orange tile ruler from the ground to 3.1 tiles in 0.1 steps; labels to the right."""
    top = foot - VISIBLE * UNIT
    d.text((x, top - 50), '格子尺', font=font(24), fill=ORANGE, anchor='ma')
    d.line((x, top, x, foot), fill=ORANGE, width=3)
    for i in range(32):
        y = foot - i * UNIT / 10
        length = 18 if i % 10 == 0 else 11 if i % 5 == 0 else 6
        d.line((x - length, y, x + length, y), fill=ORANGE, width=2)
        if i % 10 == 0:
            d.text((x + 26, y), f'{i // 10} 格', font=font(24), fill=ORANGE, anchor='lm')
    d.text((x - 24, top), '3.1', font=font(24), fill=ORANGE, anchor='rm')
    return top



GUIDE_COLORS = ['#237992', '#b1406e', '#5c7a1f', '#228257', '#93631c', '#7550aa', '#5261ad', '#21324a']


class Layer:
    """Dashed guides recorded as ops in image pixels instead of painted into the PNG; pages draw them on demand."""

    def __init__(self):
        self.ops = []

    def guide(self, y, x0, x1, color, label=None, width=2, step=9):
        """Dashed line across the figures; an optional reading sits above its right end."""
        self.ops.append(dict(type='line', x1=round(x0), y1=round(y, 1), x2=round(x1), y2=round(y, 1), color=color, width=width, dash=[step, step]))
        if label:
            self.ops.append(dict(type='text', x=round(x1) - 4, y=round(y, 1) - 4, text=label, color=color, size=22,
                                 align='right', baseline='bottom', backdrop='rgba(255,255,255,0.85)'))


def write_guides(path, size, guides):
    """The standard ruler is painted into the PNG; its dashed guides live beside it as data."""
    import json
    path.write_text(json.dumps(dict(size=list(size), ops=guides.ops), ensure_ascii=False) + '\n')
