"""按世界尺寸投影太阳能家具设计稿；独立于游戏场景，不修改模型。"""
from pathlib import Path
from math import sin, cos, pi, sqrt
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
W, H = 3200, 2480
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


def panel(view, active='upper', angle=22, depth=1, z0=0, envelope=False, ghost=False):
    a = angle * pi / 180
    if envelope:
        view.box((0, 0, z0 - depth / 2), (1, .5, z0 + depth / 2), GRAY, dashed=True)
    view.box((.28, 0, z0 - .20 * depth), (.72, .075, z0 + .20 * depth), INK, 3)
    for name, sign in [('upper', 1), ('lower', -1)]:
        z = z0 + sign * .265 * depth
        moving = active == name
        rot = a if moving else 0
        color = ACTIVE if moving else BLUE
        pivot = (.5, .27, z)
        transform = lambda p: tilt(p, rot, pivot)
        view.box((.46, .075, z - .065 * depth), (.54, .27, z + .065 * depth), INK, 2)
        for end in (-1, 1):
            ring_z = z + end * .10 * depth
            view.path([(.5 + .027 * cos(t * pi / 12), .27 + .027 * sin(t * pi / 12), ring_z)
                       for t in range(25)], INK, 2)
        for y in (.243, .297):
            view.path([(.5, y, z - .10 * depth), (.5, y, z + .10 * depth)], INK, 2)
        low, high = (.03, .245, z - .235 * depth), (.97, .295, z + .235 * depth)
        if moving and ghost:
            view.box(low, high, GRAY, 2, True)
        view.box(low, high, color, 4, transform=transform)
        for cell in range(4):
            x1, x2 = .055 + cell * .224, .055 + cell * .224 + .205
            z1, z2 = z - .213 * depth, z + .213 * depth
            view.path([transform((x1, .298, z1)), transform((x2, .298, z1)),
                       transform((x2, .298, z2)), transform((x1, .298, z2))], color, 2, close=True)
            view.path([transform(((x1 + x2) / 2, .298, z1)), transform(((x1 + x2) / 2, .298, z2))], color, 1)
        if moving and ghost:
            arc = [(.5 + .33 * cos(t * a / 20), .27 + .33 * sin(t * a / 20), z - .27 * depth) for t in range(21)]
            view.path(arc, ACTIVE, 4)
            arrow(view.p(arc[-2]), view.p(arc[-1]), ACTIVE, 3)


def dim(view, a, b, label, shift=(0, 0)):
    pa, pb = view.p(a), view.p(b)
    arrow(pa, pb, GRAY, 2)
    arrow(pb, pa, GRAY, 2)
    text((pa[0] + pb[0]) / 2 + shift[0], (pa[1] + pb[1]) / 2 + shift[1], label, 27, INK, 'mm')


def sun(x, y, end):
    draw.ellipse((x - 18, y - 18, x + 18, y + 18), outline=GOLD, width=3)
    for i in range(8):
        t = i * pi / 4
        line((x + 24 * cos(t), y + 24 * sin(t)), (x + 35 * cos(t), y + 35 * sin(t)), GOLD, 3)
    arrow((x, y + 40), end, GOLD)


text(100, 42, '太阳能构件｜线框透视设计', 66)
text(103, 125, '砖块 / 家具候选 · 宽 1 格 × 高 0.5 格 · 深 1 / 0.5 格 · Python 参数化透视投影', 30, BLUE)
line((100, 183), (3100, 183), GRAY, 2)
text(100, 210, '01  结构：选定半片独立转动，底座与另一半保持固定', 38)
text(100, 268, '“上半片”＝板面远排；“下半片”＝板面近排。橙色：活动半片；蓝色：固定半片；灰虚线：占格与水平位置。', 27)

for index, (name, active, angle) in enumerate([('A  上半片转动', 'upper', 22), ('B  下半片转动', 'lower', -22)]):
    cx = 820 + index * 1560
    text(cx, 330, name, 39, INK, 'mm')
    v = View((cx, 610), 470)
    panel(v, active, angle, envelope=True, ghost=True)
    dim(v, (0, -.08, -.58), (1, -.08, -.58), '宽 1', (0, 24))
    dim(v, (1.12, 0, .5), (1.12, .5, .5), '高 0.5', (82, 0))
    dim(v, (-.13, 0, -.5), (-.13, 0, .5), '深 1', (-45, -20))
    text(cx, 896, '独立转轴沿深度 Z；绕轴倾转，使面板朝左 / 朝右受光', 27, INK, 'mm')

line((100, 947), (3100, 947), GRAY, 2)
text(100, 977, '02  摆放：同一件半深家具，三种安装位置', 38)
text(100, 1034, '中间实体深 1；内沿、外延各预留 0.5。灰色砖和侧托板只是安装参照，不并入太阳能物件。', 28)

for i, (name, center_z, color, band) in enumerate([
    ('内沿安装', -.75, GREEN, 'Z = -1 ～ -0.5'),
    ('居中安装', 0, BLUE, 'Z = -0.25 ～ +0.25'),
    ('外延安装', .75, GOLD, 'Z = +0.5 ～ +1'),
]):
    cx = 590 + i * 1020
    text(cx, 1120, name, 36, color, 'mm')
    v = View((cx, 1390), 350, target=(.5, -.05, 0))
    v.box((0, -.55, -.5), (1, 0, .5), GRAY, 2)
    v.box((0, -.12, -1), (1, 0, -.5), GREEN, 2)
    v.box((0, -.12, .5), (1, 0, 1), GOLD, 2)
    panel(v, 'upper', 15, .5, center_z)
    text(cx, 1670, band, 28, color, 'mm')
    text(cx, 1719, '物件尺寸 1 × 0.5 × 0.5 格', 26, INK, 'mm')

line((100, 1785), (3100, 1785), GRAY, 2)
text(100, 1815, '03  追光：同一件“上半转”构件的三个姿态', 38)

for i, (name, angle, sun_offset) in enumerate([('太阳在左 · 向左倾转', 22, -230), ('太阳在顶 · 两片水平', 0, 0), ('太阳在右 · 向右倾转', -22, 230)]):
    cx = 590 + i * 1020
    text(cx, 1900, name, 31, INK, 'mm')
    v = View((cx, 2150), 430, camera=(.5, 3.2, -7))
    panel(v, 'upper', angle)
    sun(cx + sun_offset, 1965, v.p((.5, .30, .265)))
    text(cx, 2330, f'活动半片 {angle:+d}° · 下半片不动' if angle else '活动半片 0° · 下半片不动', 28, BLUE, 'mm')

text(100, 2410, '结构提案，尚未定稿。尺寸以标注为准；此图表达空间与机构，不把太阳能构件画成附带整块地砖的设施。', 27)

# 轴符号与包围高度是图稿的几何契约，防止调整画法时反转受光方向。
left = tilt((.03, .27, 0), 22 * pi / 180, (.5, .27, 0))
right = tilt((.97, .27, 0), 22 * pi / 180, (.5, .27, 0))
assert left[1] < .27 < right[1]
for degrees in range(-22, 23):
    for x in (.03, .97):
        for y in (.245, .298):
            assert 0 <= tilt((x, y, 0), degrees * pi / 180, (.5, .27, 0))[1] <= .5
image.save(OUT / 'solar-wireframe-perspective.png')
print(OUT / 'solar-wireframe-perspective.png')
