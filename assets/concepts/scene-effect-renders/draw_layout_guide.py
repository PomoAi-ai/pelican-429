"""两层房屋 + 远景构图底图：FOV30°、镜头距玩法平面 30 格的真实正面透视。
房屋按 docs/room-layout-definitions.md「两层房屋透视」：外轮廓 11×13，每层净宽 9、净高 5，共用楼板 1，
格子 Z=[-1,+1]，背景墙 Z=[-1.2,-1]，门洞 3＋门上沿 1，2×2 窗，2 格通口与平台 2/4/6。人物外观 3.1 格。"""
import math
import sys
from PIL import Image, ImageDraw

W, H = 2560, 1440
D = 30.0
F = H / 2 / math.tan(math.radians(15))
CAM_X, CAM_Y = 5.5, 5.5
HALF = 'half' in sys.argv[1:]
DOOR = 'door' in sys.argv[1:]


def p(x, y, z):
    d = D - z
    return (W / 2 + (x - CAM_X) * F / d, H / 2 - (y - CAM_Y) * F / d)


img = Image.new('RGB', (W, H), (226, 236, 244))
g = ImageDraw.Draw(img)
shade = lambda c, k: tuple(max(0, min(255, int(v * k))) for v in c)


def box(x0, y0, x1, y1, z0, z1, fill, edge=None):
    edge = edge or shade(fill, .6)
    if y1 < CAM_Y:  # 顶面
        g.polygon([p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z0)], fill=shade(fill, 1.12), outline=edge)
    if y0 > CAM_Y:  # 底面
        g.polygon([p(x0, y0, z1), p(x1, y0, z1), p(x1, y0, z0), p(x0, y0, z0)], fill=shade(fill, .78), outline=edge)
    if x1 < CAM_X:  # 右侧面
        g.polygon([p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0), p(x1, y0, z0)], fill=shade(fill, .88), outline=edge)
    if x0 > CAM_X:  # 左侧面
        g.polygon([p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), p(x0, y0, z0)], fill=shade(fill, .88), outline=edge)
    a, b = p(x0, y1, z1), p(x1, y0, z1)
    g.rectangle([a[0], a[1], b[0], b[1]], fill=fill, outline=edge, width=2)


def draw(cells):
    # 离消失点越远越先画，近中心的格子盖住外侧格子的侧面
    for c in sorted(cells, key=lambda c: -abs((c[0] + c[2]) / 2 - CAM_X) - abs((c[1] + c[3]) / 2 - CAM_Y)):
        box(*c)


# 远处背景格子：Z=-16 与 Z=-7，房屋两侧
far = [(x, y, x + 1, y + 1, -17, -15, (206, 214, 222)) for x in [*range(-14, -6), *range(16, 26)] for y in range(-2, 2 + (x % 3))]
near = [(x, y, x + 1, y + 1, -8, -6, (182, 190, 200)) for x in [*range(-12, -4), *range(15, 23)] for y in range(-2, 1 + (x % 2))]
draw(far); draw(near)

windows = {(x, y) for x in (7, 8) for y in (1, 2, 7, 8)}
wall, lintel = (236, 236, 230), (176, 140, 96)
if HALF:
    # 半砖版（docs/room-layout-definitions.md「半砖层间组合」②上半砖C）：侧墙 K/L 宽 0.5 位于 X=0.5~1、10~10.5，
    # 底板 C 占 Y=-0.5~0，层间楼板 C 占 Y=5.5~6（通口 X=4~6），顶板 B 占 Y=11~11.5；总高 12，一层净高 5.5、二层 5。
    draw([(x, y, x + 1, y + 1, -1.2, -1, (214, 222, 228)) for x in range(1, 10) for y in range(0, 11) if (x, y) not in windows])
    cells = [(x, -.5, x + 1, 0, -1, 1, wall) for x in range(1, 10)] + [(.5, -.5, 1, 0, -1, 1, wall), (10, -.5, 10.5, 0, -1, 1, wall)]
    cells += [(x, 5.5, x + 1, 6, -1, 1, wall) for x in range(1, 10) if x not in (4, 5)]
    cells += [(x, 11, x + 1, 11.5, -1, 1, wall) for x in range(1, 10)] + [(.5, 11, 1, 11.5, -1, 1, wall), (10, 11, 10.5, 11.5, -1, 1, wall)]
    cells += [(10, y, 10.5, y + 1, -1, 1, wall) for y in range(0, 11)]
    for base, top in ((0, 5.5), (6, 11)):
        if not DOOR:
            cells.append((.5, base + 3, 1, base + 4, -1, 1, lintel))
        cells += [(.5, y, 1, min(y + 1, top), -1, 1, wall) for y in range(base + 4, math.ceil(top))]
    cells += [(.5, 5.5, 1, 6, -1, 1, wall)]
    # 室外地面顶面 Y=0；房下 Y=-1 格的下半为地基，上半是底板 C
    dirt = (150, 128, 100)
    cells += [(x, -2, x + 1, -1, -1, 1, dirt) for x in range(-10, 22)]
    cells += [(x, -1, x + 1, 0, -1, 1, dirt) for x in [*range(-10, 0), *range(11, 22)]]
    cells += [(0, -1, .5, 0, -1, 1, dirt), (10.5, -1, 11, 0, -1, 1, dirt)]
    cells += [(x, -1, x + 1, -.5, -1, 1, dirt) for x in range(1, 10)] + [(.5, -1, 1, -.5, -1, 1, dirt), (10, -1, 10.5, -.5, -1, 1, dirt)]
    draw(cells)

    for top in (2, 4):
        box(4, top - .1, 6, top, -1, 1, (214, 160, 90))
    if DOOR:
        # 能量门模块（docs/room-layout-definitions.md）：占左墙厚度 X=0.5~1，Z=[-0.9,0.5]，高 4＝净洞 3＋门框顶 1。
        # 正面镜头下门面朝 +X、几乎侧对镜头：看到的是前柱与门框顶的正面，屏障只是一条收向消失点的窄面。
        frame, barrier = (246, 246, 242), (70, 150, 235)
        for base in (0, 6):
            box(.5, base, 1, base + 3, -.9, -.7, frame)
            g.polygon([p(.75, base, .3), p(.75, base + 3, .3), p(.75, base + 3, -.7), p(.75, base, -.7)], fill=barrier, outline=(30, 90, 170))
            g.polygon([p(1.6, base, .3), p(1.6, base, -.7), p(.75, base, -.7), p(.75, base, .3)], fill=(150, 205, 245))  # 地面蓝光
            box(.5, base, 1, base + 3, .3, .5, frame)
            box(.5, base + 3, 1, base + 4, -.9, .5, frame)
            for y in (base + .8, base + 1.6, base + 2.4):
                a, b = p(.62, y, .5), p(.88, y + .25, .5)
                g.rectangle([a[0], b[1], b[0], a[1]], fill=(40, 220, 230))
    for ceiling in (5.5, 11):
        box(2, ceiling - 1, 3, ceiling, -.6, 0, (200, 176, 120))
    box(1, 6, 4, 7, -1, 0, (120, 140, 175))
    box(7, 0, 9, 1.2, -1, 0, (120, 110, 100))

else:
    # 背景墙：后沿 Z=[-1.2,-1]，窗口处移除墙板
    draw([(x, y, x + 1, y + 1, -1.2, -1, (214, 222, 228)) for x in range(1, 10) for y in [*range(0, 5), *range(6, 11)] if (x, y) not in windows])

    # 房屋格子：底板、楼板（通口 X=4~6）、顶板、侧墙（左侧门洞 3 + 门上沿 1）
    cells = [(x, -1, x + 1, 0, -1, 1, wall) for x in range(11)]
    cells += [(x, 5, x + 1, 6, -1, 1, wall) for x in range(11) if x not in (4, 5)]
    cells += [(x, 11, x + 1, 12, -1, 1, wall) for x in range(11)]
    for base in (0, 6):
        cells.append((0, base + 3, 1, base + 4, -1, 1, lintel))
        cells += [(0, base + 4, 1, base + 5, -1, 1, wall)]
        cells += [(10, y, 11, y + 1, -1, 1, wall) for y in range(base, base + 5)]
    # 室外地面
    cells += [(x, y, x + 1, y + 1, -1, 1, (150, 128, 100)) for x in [*range(-10, 0), *range(11, 22)] for y in (-2, -1)]
    cells += [(x, -2, x + 1, -1, -1, 1, wall) for x in range(11)]
    draw(cells)

    # 通口平台：顶面 2、4（6 与二层地面齐平）
    for top in (2, 4):
        box(4, top - .1, 6, top, -1, 1, (214, 160, 90))
    # 吊灯、上层床 3×1、下层桌 2×2
    for base in (0, 6):
        box(2, base + 4, 3, base + 5, -.6, 0, (200, 176, 120))
    box(1, 6, 4, 7, -1, 0, (120, 140, 175))
    box(7, 0, 9, 1.2, -1, 0, (120, 110, 100))

# 人物占位 3.1 格：一层女主、二层男主
for x, base, col in [(2.2, 0, (110, 110, 125)), (7.0, 6, (90, 90, 105))]:
    a, b = p(x, base + 3.1, 0), p(x + .9, base, 0)
    g.rounded_rectangle([a[0], a[1], b[0], b[1]], radius=28, fill=col)

# 前景格子：Z=+3 下沉 1 格，只在底边
draw([(x, -2, x + 1, -1, 2, 4, (70, 76, 84)) for x in [*range(-9, -5), *range(14, 19)]])
img.save(('layout-guide-half-brick' + ('-door' if DOOR else '') + '.png') if HALF else 'layout-guide-two-storey.png')
