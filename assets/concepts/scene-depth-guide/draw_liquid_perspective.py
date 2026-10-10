"""Dimensioned liquid design sheet; illustration only, not runtime water geometry."""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/concepts/liquid-perspective.png'
W, H = 2400, 2200
im = Image.new('RGB', (W, H), '#F5F8FA')
d = ImageDraw.Draw(im)
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
INK, MUTED, BLUE, GRID = '#203B4E', '#637885', '#167EAB', '#D5E0E7'


def text(x, y, value, size=28, color=INK):
    font = ImageFont.truetype(FONT, size)
    bounds = d.textbbox((x, y), value, font=font)
    assert 15 <= bounds[0] and bounds[2] < W - 15 and bounds[3] < H - 15, value
    d.text((x, y), value, font=font, fill=color)


def arrow(a, b, color=BLUE, width=3):
    d.line((a, b), fill=color, width=width)
    angle = math.atan2(b[1] - a[1], b[0] - a[0])
    d.polygon([b, (b[0] - 14 * math.cos(angle - .4), b[1] - 14 * math.sin(angle - .4)),
               (b[0] - 14 * math.cos(angle + .4), b[1] - 14 * math.sin(angle + .4))], fill=color)


def dimension(a, b):
    arrow(a, b)
    arrow(b, a)


def dashed(a, b, color=MUTED):
    length = math.dist(a, b)
    for t in range(0, math.ceil(length), 20):
        d.line([tuple(a[i] + (b[i] - a[i]) * s / length for i in range(2))
                for s in (t, min(t + 10, length))], fill=color, width=2)


def panel(bounds, title):
    d.rounded_rectangle(bounds, 20, fill='white', outline=GRID, width=2)
    text(bounds[0] + 30, bounds[1] + 22, title, 34)


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def norm(v):
    return tuple(x / math.sqrt(dot(v, v)) for x in v)


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


# Reflect design Z for the inspection camera: the inner reserve is the near side.
EYE, TARGET = (10, 7, 13), (3, 1.5, 0)
FORWARD = norm(sub(TARGET, EYE))
RIGHT = norm(cross(FORWARD, (0, 1, 0)))
UP = cross(RIGHT, FORWARD)


def project(p):
    v = sub((p[0], p[1], -p[2]), EYE)
    depth = dot(v, FORWARD)
    assert depth > 0
    return (1150 + 2800 * dot(v, RIGHT) / depth, 665 - 2800 * dot(v, UP) / depth)


faces = []


def face(points, color):
    depth = sum(dot(sub((x, y, -z), EYE), FORWARD) for x, y, z in points) / len(points)
    faces.append((depth, points, color))


def box(x, y, z, w, h, depth, colors):
    face([(x,y,z), (x+w,y,z), (x+w,y+h,z), (x,y+h,z)], colors[0])
    face([(x,y+h,z), (x+w,y+h,z), (x+w,y+h,z+depth), (x,y+h,z+depth)], colors[1])
    face([(x+w,y,z), (x+w,y,z+depth), (x+w,y+h,z+depth), (x+w,y+h,z)], colors[2])


text(60, 38, '液体定义｜水体、占格与透视', 54)
text(63, 114, '程序已有水 · 本图补齐空间定义 · 蓝色是可进入的水体，棕色是挡水地形', 29, MUTED)
panel((50, 185, 2350, 1105), '01  水池剖切透视 · 新版中间深度 1 格')
text(85, 260, '设计坐标：内沿 −Z / 外延 +Z；斜上方检查视角，不是游戏默认镜头。', 27, MUTED)

stone = ('#BBA184', '#D9C6A9', '#947C66')
for x in range(6):
    box(x, 0, -.5, 1, 1, 1, stone)
for x in (0, 5):
    for y in (1, 2):
        box(x, y, -.5, 1, 1, 1, stone)
box(1, 1, .5, 4, 2, .2, ('#D9E1E7', '#ECF0F4', '#B8C8D2'))
# One connected volume: no internal glass-box seams between water cells.
face([(1,1,-.5), (5,1,-.5), (5,2.5,-.5), (1,2.5,-.5)], '#75BFD3')
face([(1,2.5,-.5), (5,2.5,-.5), (5,2.5,.5), (1,2.5,.5)], '#ADE4E6')
for _, points, color in sorted(faces, key=lambda f: f[0], reverse=True):
    pts = [project(p) for p in points]
    d.polygon(pts, fill=color)
    d.line(pts + [pts[0]], fill='#607D89', width=2)
for z in (-.28, 0, .27):
    d.line([project((x, 2.505, z + .025 * math.sin(x * 6))) for x in [1.2 + i * .08 for i in range(45)]], fill='#E8FCFF', width=3)

text(90, 370, '水面：水平顶面 + 轻微波动', 29, BLUE)
d.line([(510,410), (620,410), project((3,2.5,0))], fill=BLUE, width=3)
text(90, 490, '岸壁、池底：实心格挡水', 28)
d.line([(480,530), project((.5,2.8,-.5))], fill=MUTED, width=3)
text(1720, 375, '背景墙在水体后方', 29)
text(1720, 419, '厚 0.2；此处位置为示例', 25, MUTED)
d.line([(1710,470), project((4.7,2.9,.5))], fill=MUTED, width=3)
text(1780, 690, '水下截面', 31, BLUE)
text(1780, 737, '观察剖面，不是玻璃墙', 25, MUTED)
d.line([(1760,720), project((4,1.8,-.5))], fill=BLUE, width=3)
dimension(project((1,.7,-.7)), project((5,.7,-.7)))
text(920, 960, '示例水池内宽 4 格', 28, BLUE)
dimension(project((6.25,1,-.5)), project((6.25,1,.5)))
text(1830, 925, '水体深 1 格', 28, BLUE)
text(85, 1037, '水面下降只改变 Y 高度，Z 深度保持 1；相邻水格拼成连续水体，不画内部盒边。', 28, MUTED)

panel((50, 1140, 1175, 1780), '02  正视 XY · 水量决定水位')
u, ox, oy = 132, 235, 1615
for x in range(6):
    for y in range(3):
        a, b = (ox+x*u, oy-(y+1)*u), (ox+(x+1)*u, oy-y*u)
        solid = y == 0 or x in (0, 5)
        d.rectangle((*a,*b), fill='#D9C6A9' if solid else '#F8FBFC', outline=GRID, width=2)
        if not solid:
            height = 1 if y == 1 else 128 / 255
            d.rectangle((a[0]+2, b[1]-height*u, b[0]-2, b[1]-2), fill='#80CADC')
text(85, 1250, '水面', 27, BLUE)
arrow((155,1298), (230,oy-(2+128/255)*u))
text(399, 1310, 'q=128 ≈ 半格水', 27, BLUE)
text(399, 1433, 'q=255 · 满格水', 27, BLUE)
text(85, 1650, '每格 0～255；顶格水面 Y=j+q/255。', 27)
text(85, 1703, '波纹、水膜和格线仅是表现，不增加水量。', 27, MUTED)

panel((1205, 1140, 2350, 1780), '03  等比例 YZ · 预留区不注满')
u, ox, oy = 255, 1450, 1600
# One world unit is the same number of pixels on both axes.
d.rectangle((ox,oy-u,ox+2*u,oy), fill='#FAFCFD', outline=GRID, width=2)
for i in range(21):
    x = ox + i*u/10
    d.line((x,oy-u,x,oy), fill=GRID, width=1)
for i in range(11):
    y = oy-i*u/10
    d.line((ox,y,ox+2*u,y), fill=GRID, width=1)
d.rectangle((ox+.5*u,oy-u,ox+1.5*u,oy), fill='#80CADC', outline=BLUE, width=3)
d.rectangle((ox+1.5*u,oy-u,ox+1.7*u,oy), fill='#CBD6DE', outline='#718898', width=2)
dashed((ox+u,oy-u-20),(ox+u,oy+20),'#BB7138')
text(1478, 1274, '内沿', 25, MUTED)
text(1644, 1274, '水体深 1', 27, BLUE)
text(1850, 1274, '外延', 25, MUTED)
for z in (-1, -.5, 0, .5, 1):
    text(ox+(z+1)*u-24, oy+17, f'{z:g}', 23, MUTED)
text(2002, 1360, '墙厚 0.2', 26)
text(2002, 1415, '人物 Z=0', 26, '#BB7138')
text(1240, 1675, '中间 1 + 两侧各 0.5 = 总空间 2 格。', 27)
text(1240, 1722, '此为新版设计；不与现行世界 Z 坐标混用。', 27, MUTED)

panel((50, 1815, 2350, 2140), '04  已有规则与实现边界')
text(85, 1890, '已有：向下流动、横向铺开、游泳与氧气；平台不挡水，背景墙不作池壁。', 29)
text(85, 1950, '限制：半砖 / 斜坡仍按整格挡水；放砖会清除该格水，尚无自动排水。', 29, '#A36132')
text(85, 2010, '现行渲染：水前面 +0.42，背板 −1，湖中顶面可到 −1.3；本次没有修改。', 29, MUTED)
text(85, 2070, '水色板不是新液体；完整定义见基础概念页「液体定义」及 docs/liquid-definitions.md。', 27, MUTED)

im.save(OUT)
print(OUT)
