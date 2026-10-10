# /// script
# requires-python = ">=3.12"
# dependencies = ["pillow==12.3.0"]
# ///
"""Draw exact dimensions and paste the protagonist's original front/side artwork."""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
SOURCE = ROOT / 'assets/characters/grassy/customization/female/concepts/d1-no-gear/individual/front-v1.png'
SIDE_SOURCE = SOURCE.with_name('right-v1.png')
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
W, H, UNIT = 2560, 1600, 240
FOOT, CX, SIDE_CX = 1180, 550, 915
VISIBLE, BODY_H, BODY_W, HEADS = 3.1, 2.8, .8, 3.3
TOP = FOOT - VISIBLE * UNIT
paper, ink, blue = '#F5F4EF', '#21324A', '#2856A3'
gray, line, purple, orange, cyan = '#627183', '#DCE2E6', '#7550AA', '#C75C25', '#087C91'
im = Image.new('RGB', (W, H), paper)
d = ImageDraw.Draw(im)


def text(x, y, value, size=30, color=ink, anchor='la'):
    d.text((x, y), value, font=ImageFont.truetype(FONT, size), fill=color, anchor=anchor)


def dash(a, b, color=line, width=2, step=14):
    x1, y1 = a
    x2, y2 = b
    distance = ((x2-x1)**2 + (y2-y1)**2)**.5
    for start in range(0, round(distance), step*2):
        end = min(start+step, distance)
        d.line((x1+(x2-x1)*start/distance, y1+(y2-y1)*start/distance,
                x1+(x2-x1)*end/distance, y1+(y2-y1)*end/distance), fill=color, width=width)


def hdim(x1, x2, y, label, color=gray):
    d.line((x1, y, x2, y), fill=color, width=2)
    for x in (x1, x2):
        d.line((x, y-8, x, y+8), fill=color, width=2)
    text((x1+x2)/2, y+12, label, 25, color, 'ma')


def vdim(x, y1, y2, label, color=gray):
    d.line((x, y1, x, y2), fill=color, width=2)
    for y in (y1, y2):
        d.line((x-8, y, x+8, y), fill=color, width=2)
    text(x+15, (y1+y2)/2, label, 25, color, 'lm')


text(80, 62, '人物与场景 · 统一尺度图', 64, blue)
text(82, 151, '主角正面与侧面原图  /  等高、脚底对齐  /  Python 精确绘制格子与标尺', 30, gray)
d.line((80, 211, 2480, 211), fill=line, width=2)
for box in [(70, 242, 1270, 1430), (1310, 242, 2490, 1430)]:
    d.rounded_rectangle(box, radius=24, fill='#FFFFFF', outline=line, width=2)
text(110, 272, '01  主角：正面与右侧原图', 36, blue)
text(1350, 272, '02  模块：与人物使用同一把尺', 36, blue)
text(1350, 325, '所有 1 格 = 240 px；以下为精确轮廓示意', 27, gray)

# Both panels share UNIT; only whole-image uniform resizing is allowed.
for n in range(8):
    y = FOOT - n*UNIT/2
    d.line((390, y, 1040, y), fill=line if n%2 == 0 else '#EEF1F2', width=2 if n%2 == 0 else 1)
for x in range(370, 1091, UNIT):
    d.line((x, 350, x, FOOT), fill=line, width=1)

source = Image.open(SOURCE).convert('RGB')
assert source.size == (1024, 1536)
# Visual landmarks in this source: highest hair at y=24, sole ends at y=1425.
# Retain original white background and all interior pixels; only crop outer whitespace.
crop_box = (192, 24, 788, 1426)
cropped = source.crop(crop_box)
ratio = VISIBLE*UNIT/cropped.height
art = cropped.resize((round(cropped.width*ratio), round(cropped.height*ratio)), Image.Resampling.LANCZOS)
offset = (round(CX-art.width/2), round(TOP))
im.paste(art, offset)
side_source = Image.open(SIDE_SOURCE).convert('RGB')
assert side_source.size == (1024, 1536)
# Matching source landmarks: hair starts at y=34; the last sole row is y=1407.
side_crop_box = (224, 34, 758, 1408)
side_crop = side_source.crop(side_crop_box)
side_ratio = VISIBLE*UNIT/side_crop.height
side_art = side_crop.resize((round(side_crop.width*side_ratio), round(side_crop.height*side_ratio)), Image.Resampling.LANCZOS)
side_offset = (round(SIDE_CX-side_art.width/2), round(TOP))
im.paste(side_art, side_offset)
text(CX, TOP-46, '正面原图', 25, gray, 'ma')
text(SIDE_CX, TOP-46, '右侧原图', 25, gray, 'ma')

text(102, 357, '3.3 头身设计参照', 28, purple)
d.line((280, TOP, 280, FOOT), fill=purple, width=3)
head_step = VISIBLE*UNIT/HEADS
head_ticks = []
for h in (0, 1, 2, 3, 3.3):
    y = TOP+h*head_step
    head_ticks.append(y)
    d.line((266, y, 294, y), fill=purple, width=3)
    dash((295, y), (375, y), '#B9A6D1')
    text(245, y, f'{h:g} H', 28, purple, 'rm')
text(1130, 357, '格子尺', 28, orange, 'ma')
d.line((1130, TOP, 1130, FOOT), fill=orange, width=3)
for i in range(32):
    y = FOOT-i*UNIT/10
    length = 20 if i%10 == 0 else 12 if i%5 == 0 else 6
    d.line((1130-length, y, 1130+length, y), fill=orange, width=2)
    if i%10 == 0:
        text(1170, y, str(i//10), 27, orange, 'lm')
text(1110, TOP-16, '3.1', 30, orange, 'rb')
dash((390, TOP), (1130, TOP), '#E2B898')
d.line((375, FOOT, 1210, FOOT), fill=ink, width=3)

collision = [CX-BODY_W*UNIT/2, FOOT-BODY_H*UNIT, CX+BODY_W*UNIT/2, FOOT]
x0, y0, x1, y1 = collision
for a, b in [((x0,y0),(x1,y0)), ((x1,y0),(x1,y1)), ((x1,y1),(x0,y1)), ((x0,y1),(x0,y0))]:
    dash(a, b, cyan, 2, 9)
hdim(x0, x1, FOOT+35, '0.8 格', cyan)
side_collision = [SIDE_CX-BODY_W*UNIT/2, FOOT-BODY_H*UNIT, SIDE_CX+BODY_W*UNIT/2, FOOT]
sx0, sy0, sx1, sy1 = side_collision
for a, b in [((sx0,sy0),(sx1,sy0)), ((sx1,sy0),(sx1,sy1)), ((sx1,sy1),(sx0,sy1)), ((sx0,sy1),(sx0,sy0))]:
    dash(a, b, cyan, 2, 9)
hdim(sx0, sx1, FOOT+35, '0.8 格', cyan)
text(400, 1280, '外观高 3.1 格  ·  碰撞宽 0.8 / 高 2.8 格', 30, ink)
text(115, 1344, '原图头身保持不变；紫尺是设计参照，橙尺是格子尺度。', 27, gray)

modules = []


def tile(x, base, kind, label, note):
    height = UNIT/2 if kind == 'half' else UNIT
    y = base-height
    text(x, base-UNIT-64, label, 30, blue)
    if kind in ('left', 'right', 'half'):
        for a,b in [((x,base-UNIT),(x+UNIT,base-UNIT)),((x,base-UNIT),(x,base)),((x+UNIT,base-UNIT),(x+UNIT,base))]:
            dash(a,b,'#B5C2CD',1,7)
    if kind == 'left':
        polygon = [(x,base-UNIT),(x+UNIT,base),(x,base)]
    elif kind == 'right':
        polygon = [(x,base),(x+UNIT,base-UNIT),(x+UNIT,base)]
    else:
        polygon = [(x,y),(x+UNIT,y),(x+UNIT,base),(x,base)]
    d.polygon(polygon, fill='#DCEAF3' if kind=='wall' else '#A0B9AA')
    d.line(polygon+[polygon[0]],fill='#446479',width=2)
    if kind=='wall':
        d.line((x+15,y+UNIT*.7,x+UNIT-15,y+UNIT*.7),fill='#89A8C6',width=5)
    else:
        edge = (polygon[0],polygon[1])
        d.line((*edge[0],*edge[1]),fill='#407B60',width=4)
    hdim(x,x+UNIT,base+22,'1 格')
    vdim(x+UNIT+24,y,base,'0.5' if kind=='half' else '1 格')
    text(x,base+76,note,25,gray)
    modules.append({'kind':kind,'bounds':[x,y,x+UNIT,base],'polygon':polygon,
                    'widthPixels':UNIT,'heightPixels':height})


tile(1390, 715, 'wall', '背景墙  1 × 1', '视觉层，不参与碰撞')
tile(1740, 715, 'full', '实体砖  1 × 1', '实心碰撞，正面为正方形')
tile(2090, 715, 'half', '半高砖  1 × 0.5', '同宽，恰好一半高度')
tile(1390, 1165, 'left', '左高右低  1 × 1', '斜坡低端为零高度')
tile(1740, 1165, 'right', '左低右高  1 × 1', '斜坡低端为零高度')
text(2100, 932, '统一单位', 31, blue)
text(2100, 992, '1 格 = 240 px', 29)
text(2100, 1044, '半格 = 120 px', 29)
text(2100, 1096, '人物 = 744 px', 29)
text(2100, 1160, '原图全高对应', 27, gray)
text(2100, 1201, '3.1 个整格', 27, gray)
text(1350, 1344, '背景墙与实体砖正面同尺寸；材质色仅用于区分类别。', 27, gray)

text(82, 1470, '人物来源：主角 D1 原图 front-v1.png / right-v1.png；各自等比缩放至相同身高，保留原图造型。', 27, gray)
text(82, 1520, '3.3 头身尺表示设计目标，不将其刻度当作原图解剖地标。背景墙 1×1 为设计示意。', 27, gray)

# Checks exercise coordinate relationships, not label text.
assert all(m['widthPixels']==UNIT for m in modules)
assert modules[0]['heightPixels']==modules[1]['heightPixels']==UNIT
assert modules[2]['heightPixels']*2==modules[1]['heightPixels']
assert abs((FOOT-TOP)/UNIT-3.1)<1e-9
assert abs((x1-x0)/UNIT-.8)<1e-9 and abs((y1-y0)/UNIT-2.8)<1e-9
assert all(abs((head_ticks[i+1]-head_ticks[i])-head_step)<1e-9 for i in range(3))
assert abs((head_ticks[4]-head_ticks[3])/head_step-.3)<1e-9
assert art.height==VISIBLE*UNIT and offset[1]+art.height==FOOT
assert abs(art.width-cropped.width*ratio)<=.5
assert side_art.height==art.height and side_offset[1]+side_art.height==FOOT
assert abs(side_art.width-side_crop.width*side_ratio)<=.5
assert offset[0]+art.width<side_offset[0]
assert side_collision[2]-side_collision[0]==collision[2]-collision[0]
im.save(OUT / 'character-tile-scale-front-side.png')
audit = {'canvas':[W,H], 'pixelsPerTile':UNIT,'characterConfiguredHeightPixels':VISIBLE*UNIT,
         'source':str(SOURCE.relative_to(ROOT)), 'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
         'sourceCrop':crop_box,'sourceImageSize':list(source.size),'artImageSize':list(art.size),
         'uniformImageScale':ratio,'artOffset':offset,'headReferenceTicks':head_ticks,
         'collisionBounds':collision,
         'side':{'source':str(SIDE_SOURCE.relative_to(ROOT)), 'sourceSha256':hashlib.sha256(SIDE_SOURCE.read_bytes()).hexdigest(),
                 'crop':side_crop_box,'artImageSize':list(side_art.size),'uniformImageScale':side_ratio,
                 'artOffset':side_offset,'collisionBounds':side_collision},
         'modules':modules,'coordinateChecks':'passed'}
(OUT / 'front-side-drawing-checks.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(audit,ensure_ascii=False))
