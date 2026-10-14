"""按世界尺寸投影太阳能家具设计稿；独立于游戏场景，不修改模型。"""
from pathlib import Path
from math import sin, cos, pi, sqrt
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
W, H = 3400, 2720
image = Image.new('RGB', (W, H), '#fbfcfe')
draw = ImageDraw.Draw(image)
FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'
INK, BLUE, ACTIVE = '#23364a', '#25698b', '#d46825'
GRAY, GREEN, GOLD = '#aebbc7', '#368974', '#af8035'


def text(x, y, content, size=30, color=INK, anchor='la'):
    draw.text((x, y), content, font=ImageFont.truetype(FONT, size), fill=color, anchor=anchor)


def line(a, b, color=INK, width=3, dashed=False):
    if not dashed:
        draw.line([a, b], fill=color, width=width)
        return
    dx, dy = b[0] - a[0], b[1] - a[1]
    distance = sqrt(dx * dx + dy * dy)
    for offset in range(0, int(distance), 17):
        end = min(offset + 9, distance)
        draw.line([(a[0] + dx * offset / distance, a[1] + dy * offset / distance),
                   (a[0] + dx * end / distance, a[1] + dy * end / distance)], fill=color, width=width)


def arrow(a, b, color=ACTIVE, width=3):
    line(a, b, color, width)
    dx, dy = a[0] - b[0], a[1] - b[1]
    length = sqrt(dx * dx + dy * dy)
    dx, dy = dx / length, dy / length
    draw.polygon([b, (b[0] + 13 * dx + 6 * dy, b[1] + 13 * dy - 6 * dx),
                  (b[0] + 13 * dx - 6 * dy, b[1] + 13 * dy + 6 * dx)], fill=color)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def unit(a):
    length = sqrt(dot(a, a))
    return tuple(x / length for x in a)


class View:
    def __init__(self, center, scale, camera=(3, 3.2, -6), target=(.5, .2, 0)):
        self.center, self.scale, self.camera = center, scale, camera
        self.forward = unit(tuple(t - c for t, c in zip(target, camera)))
        fx, fy, fz = self.forward
        self.right = unit((fz, 0, -fx))
        rx, _, rz = self.right
        self.up = (fy * rz, fz * rx - fx * rz, -fy * rx)
        self.distance = sqrt(sum((t - c) ** 2 for t, c in zip(target, camera)))

    def p(self, point):
        v = tuple(p - c for p, c in zip(point, self.camera))
        factor = self.scale * self.distance / dot(v, self.forward)
        return self.center[0] + dot(v, self.right) * factor, self.center[1] - dot(v, self.up) * factor

    def path(self, points, color=INK, width=3, dashed=False, close=False):
        points = list(points)
        if close:
            points.append(points[0])
        for a, b in zip(points, points[1:]):
            line(self.p(a), self.p(b), color, width, dashed)

    def box(self, low, high, color=GRAY, width=2, dashed=False, transform=lambda p: p):
        points = [(x, y, z) for x in (low[0], high[0]) for y in (low[1], high[1]) for z in (low[2], high[2])]
        for i in range(8):
            for bit in (1, 2, 4):
                if i < (i ^ bit):
                    self.path([transform(points[i]), transform(points[i ^ bit])], color, width, dashed)


def tilt(point, angle, pivot):
    x, y, z = point
    px, py, pz = pivot
    x, y = x - px, y - py
    return px + x * cos(angle) - y * sin(angle), py + x * sin(angle) + y * cos(angle), z


def solar(view, angle=15, depth=2, envelope=False):
    """整板在半格高包络内转动；以Z=0居中，底座只占中央一格，加深只延长板面与转轴。"""
    radians = angle * pi / 180
    pivot = (.5, .27, 0)
    transform = lambda p: tilt(p, radians, pivot)
    half = depth / 2
    if envelope:
        view.box((0, 0, -half), (1, .5, half), GREEN, 2, True)
    view.box((.32, 0, -.12), (.68, .075, .12), INK, 3)
    for x in (.46, .54):
        view.path([(x, .075, -.06), (x, .245, -.06), (x, .245, .06), (x, .075, .06)], INK, 2, close=True)
    for z in (.36 - half, half - .36):
        view.path([(.5 + .025 * cos(t * pi / 12), .27 + .025 * sin(t * pi / 12), z)
                   for t in range(25)], INK, 2)
    view.path([(.5, .295, .36 - half), (.5, .295, half - .36)], INK, 2)
    view.box((.03, .245, .03 - half), (.97, .295, half - .03), BLUE, 4, transform=transform)
    cell = (depth - .12 - .03 * (depth * 2 - 1)) / (depth * 2)
    for col in range(4):
        for row in range(depth * 2):
            x1, x2 = .055 + col * .224, .26 + col * .224
            z1 = .06 - half + row * (cell + .03)
            z2 = z1 + cell
            view.path([transform((x1, .298, z1)), transform((x2, .298, z1)),
                       transform((x2, .298, z2)), transform((x1, .298, z2))], BLUE, 2, close=True)


class Front:
    def __init__(self, origin, scale, y_offset=0):
        self.origin, self.scale, self.y_offset = origin, scale, y_offset

    def p(self, point):
        x, y, _ = point
        return self.origin[0] + x * self.scale, self.origin[1] - (y + self.y_offset) * self.scale

    path = View.path
    box = View.box


def grid(origin, scale, bottom=-1, top=1):
    x0, y0 = origin
    for i in range(11):
        color = '#e1e7ed' if i not in (0, 10) else '#879aab'
        x = x0 + i * scale / 10
        line((x, y0 - top * scale), (x, y0 - bottom * scale), color, 1 if i not in (0, 10) else 3)
    for i in range(bottom * 10, top * 10 + 1):
        y = y0 - i * scale / 10
        line((x0, y), (x0 + scale, y), '#879aab' if i % 10 == 0 else '#e1e7ed', 3 if i % 10 == 0 else 1)


def sun(x, y, end):
    draw.ellipse((x - 15, y - 15, x + 15, y + 15), outline=GOLD, width=3)
    for i in range(8):
        a = i * pi / 4
        line((x + 21 * cos(a), y + 21 * sin(a)), (x + 30 * cos(a), y + 30 * sin(a)), GOLD, 2)
    arrow((x + 34, y + 10), end, GOLD, 2)


text(100, 42, '半格太阳能板｜占格、踩踏与追光', 64)
text(103, 129, '一整块活动面板，不拆片。宽 1 × 高 0.5；深 2 或深 3，都以人物平面 Z=0 居中；底座固定，面板可左右倾转。', 32, BLUE)
line((100, 193), (3300, 193), GRAY, 2)
text(100, 224, '01  方格定义：半格指总高度，包含底座与面板的完整转动范围', 38)
text(100, 283, '正视图 X/Y 等比例；每个大方格为 1×1，小格为 0.1。绿色虚框是物件包络，不是实心碰撞砖。', 27)

for i, (title, y_base) in enumerate([('A  整砖顶面：占上方格子的下半格', 0), ('B  下半砖顶面：补齐同一格的上半格', .5)]):
    cx = 620 + i * 1120
    text(cx, 365, title, 29, INK, 'mm')
    origin, scale = (cx - 190, 690), 310
    grid(origin, scale)
    # 灰色实心区是另外的支撑砖，面板物件不包含它。
    y_top, y_bottom = (0, -1) if i == 0 else (.5, 0)
    draw.rectangle((origin[0] + 2, origin[1] - y_top * scale + 2,
                    origin[0] + scale - 2, origin[1] - y_bottom * scale - 2), fill='#e4eaf0', outline='#879aab', width=2)
    text(cx - 35, origin[1] - (y_top + y_bottom) * scale / 2, '整砖 1 高' if i == 0 else '下半砖 0.5 高', 24, INK, 'mm')
    front = Front(origin, scale, y_base)
    solar(front, 15, envelope=True)
    for a in (-22, 22):
        points = [tilt(p, a * pi / 180, (.5, .27, 0)) for p in [(.03, .245, 0), (.97, .245, 0), (.97, .298, 0), (.03, .298, 0)]]
        front.path(points, '#8fa8bb', 2, True, True)
    y1, y2 = origin[1] - y_base * scale, origin[1] - (y_base + .5) * scale
    x = origin[0] + scale + 42
    arrow((x, y1), (x, y2), GREEN, 2)
    arrow((x, y2), (x, y1), GREEN, 2)
    text(x + 18, (y1 + y2) / 2, '0.5 高', 25, GREEN, 'lm')
    if i == 0:
        text(cx - 35, origin[1] - .77 * scale, '其余半格为空', 24, '#6f8293', 'mm')
    text(cx, 1040, '砖与物件分开；放置锚点跟随实际支撑顶面', 26, INK, 'mm')

cx = 2850
text(cx, 365, 'C  同一物件的线框透视', 30, INK, 'mm')
v = View((cx, 690), 360)
solar(v, 15, envelope=True)
text(cx, 978, '整件包络：宽 1 × 高 0.5 × 深 2', 28, GREEN, 'mm')
text(cx, 1030, '板面小格只是电池纹理，不是游戏方格', 25, INK, 'mm')

line((100, 1110), (3300, 1110), GRAY, 2)
text(100, 1140, '02  两种正式深度：深 2 与深 3，都以 Z=0 居中', 38)
text(100, 1200, '深2与格子Z=[-1,+1]同深；深3向前后各外延0.5到前沿、后沿，板面悬空不占砖。底座只占中央一格，不挡人物行走；背后有墙时只能用深2。', 27)
for i, (title, depth, color, band) in enumerate([
    ('深 2 · 与格子同深', 2, BLUE, '物件 Z=[-1, +1]'),
    ('深 3 · 外延到前后沿', 3, GREEN, '物件 Z=[-1.5, +1.5]'),
]):
    cx = 1000 + i * 1400
    text(cx, 1255, title, 32, color, 'mm')
    v = View((cx, 1470), 200, target=(.5, -.10, 0))
    v.box((0, -.5, -1), (1, 0, 1), '#bcc7d0', 2)
    v.box((0, -.5, -1.5), (1, 0, -1), GREEN, 1, True)
    v.box((0, -.5, 1), (1, 0, 1.5), GOLD, 1, True)
    solar(v, 0, depth)
    text(cx, 1830, band + f' · 深 {depth}', 27, color, 'mm')
    text(cx, 1874, '板面落在格子范围内' if depth == 2 else '板面伸进前沿与后沿各0.5，后沿有墙时不可用', 24, INK, 'mm')

line((100, 1940), (3300, 1940), GRAY, 2)
text(100, 1970, '03  受力过程：追光 → 玩家踩压 → 离开回弹 → 再次对准太阳', 38)
text(100, 2027, '太阳保持在左侧；玩家从右侧踩上，使右端下沉。离开后逐渐恢复追光角度，不瞬间跳回。', 27)
for i, (label, angle) in enumerate([('① 无人：朝向太阳', 15), ('② 踩右侧：右端下沉', -22), ('③ 离开：恢复途中', -5), ('④ 稳定：重新追光', 15)]):
    cx = 485 + i * 825
    text(cx, 2110, label, 29, INK, 'mm')
    v = View((cx, 2350), 335, camera=(.5, 3.2, -7))
    solar(v, angle)
    sun(cx - 220, 2190, v.p((.35, .32, .15)))
    if i == 1:
        # 仅示意脚部局部，避免把缩小的人物误当作真实人物尺寸。
        a = angle * pi / 180
        px = .81
        py = .27 + sin(a) / cos(a) * (px - .5) + .028 / cos(a)
        p = v.p((px, py, -.18))
        draw.line([(p[0] - 24, p[1] - 9), (p[0] + 42, p[1] - 9), (p[0] + 42, p[1] - 25),
                   (p[0] + 13, p[1] - 35), (p[0] + 8, p[1] - 84), (p[0] - 14, p[1] - 84), (p[0] - 24, p[1] - 9)], fill=ACTIVE, width=5)
        arrow((p[0] + 76, p[1] - 115), (p[0] + 76, p[1] - 22), ACTIVE, 4)
        text(cx, 2535, '脚部局部示意 · 支撑点产生转矩', 24, ACTIVE, 'mm')
    else:
        text(cx, 2535, f'整板倾角 {angle:+d}°（演示值）', 25, BLUE, 'mm')

text(100, 2610, '已定含义：半格高的整板，踩上会偏转，离开恢复追光。候选参数：约 ±22° 限位、回弹速度、承重与安装支架。', 27)
text(100, 2655, '本轮仅重绘设计图；没有把绿色包络当作实心砖，也没有新增玩家碰撞或场景逻辑。', 25, '#6f8293')

# 改变转轴或角度后仍须满足半格高包络；偏置底座必须落在格子内。
for degrees in range(-22, 23):
    for x in (.03, .97):
        for y in (.245, .298):
            px, py, _ = tilt((x, y, 0), degrees * pi / 180, (.5, .27, 0))
            assert 0 <= px <= 1 and 0 <= py <= .5
for depth in (2, 3):
    assert depth / 2 <= 1.5
assert tilt((.9, .27, 0), -22 * pi / 180, (.5, .27, 0))[1] < .27
image.save(OUT / 'solar-grid-and-load-perspective.png')
print(OUT / 'solar-grid-and-load-perspective.png')

