"""Render the concrete artwork directly from the existing grid geometry."""
import argparse
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent
SHAPES = json.loads((ROOT / 'shapes.json').read_text())['shapes']
WALLS = json.loads((ROOT / 'walls.json').read_text())['walls']
args_parser = argparse.ArgumentParser()
args_parser.add_argument('--mode', choices=['solids', 'walls', 'camera', 'assembly'], default='solids')
args_parser.add_argument('--width', type=int, default=3600)
args = args_parser.parse_args(__import__('sys').argv[__import__('sys').argv.index('--') + 1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('Soft neutral environment')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.66, .73, .86, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .65
FONT = bpy.data.fonts.load('/System/Library/Fonts/STHeiti Medium.ttc')


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def color(hexcode):
    return tuple(linear(int(hexcode[i:i + 2], 16) / 255) for i in (1, 3, 5)) + (1,)


def flat(name, hexcode):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = color(hexcode)
    material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    return material


INK = flat('Ink', '#21364B')
MUTED = flat('Muted', '#687D90')
GRID = flat('Half-cell guides', '#9BABBB')
ACCENT = flat('Accent', '#38678A')
PAPER = flat('Paper', '#F1F3F5')
CARD = flat('Card', '#8D9EAE')
WHITE = flat('White', '#FFFFFF')

CONCRETE = bpy.data.materials.new('White concrete - shared by all profiles')
CONCRETE.use_nodes = True
nodes = CONCRETE.node_tree.nodes
links = CONCRETE.node_tree.links
principled = nodes.get('Principled BSDF')
principled.inputs['Roughness'].default_value = .78
principled.inputs['Metallic'].default_value = 0
image_node = nodes.new('ShaderNodeTexImage')
image_node.image = bpy.data.images.load(str(ROOT / 'white-concrete-basecolor-v1.png'))
image_node.projection = 'BOX'
image_node.projection_blend = .25
coordinate = nodes.new('ShaderNodeTexCoord')
links.new(coordinate.outputs['Object'], image_node.inputs['Vector'])
links.new(image_node.outputs['Color'], principled.inputs['Base Color'])
noise = nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 85
noise.inputs['Detail'].default_value = 2
links.new(coordinate.outputs['Object'], noise.inputs['Vector'])
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .12
bump.inputs['Distance'].default_value = .002
links.new(noise.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], principled.inputs['Normal'])


def light(name, location, power, size, tint):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.shape = 'DISK'
    data.size = size
    data.color = tint
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()


light('Soft upper-left key', (-9, 18, 22), 4700, 12, (1, .95, .86))
light('Cool right fill', (15, 4, 18), 2400, 16, (.80, .88, 1))
sun_data = bpy.data.lights.new('Uniform soft key', 'SUN')
sun_data.energy = .75
sun_data.angle = math.radians(15)
sun = bpy.data.objects.new('Uniform soft key', sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(25), math.radians(-35), math.radians(-20))


def mesh(name, poly, depth=2, bevel=.007):
    if sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(poly, poly[1:] + poly[:1])) < 0:
        poly = list(reversed(poly))
    n = len(poly)
    vertices = [(x, y, depth / 2) for x, y in poly] + [(x, y, -depth / 2) for x, y in poly]
    faces = [tuple(range(n)), tuple(reversed(range(n, n * 2)))]
    faces += [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    data.materials.append(CONCRETE)
    if bevel:
        mod = obj.modifiers.new('Small concrete edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        normal = obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
    return obj


def panel(x, y, w, h, material=CARD, z=-4):
    data = bpy.data.meshes.new('Panel')
    data.from_pydata([(x, y, z), (x + w, y, z), (x + w, y + h, z), (x, y + h, z)], [], [(0, 1, 2, 3)])
    obj = bpy.data.objects.new('Panel', data)
    scene.collection.objects.link(obj)
    data.materials.append(material)


def text(value, x, y, size=.19, material=INK, align='LEFT', z=4):
    data = bpy.data.curves.new(value, 'FONT')
    data.body = value
    data.font = FONT
    data.size = size
    data.align_x = align
    data.align_y = 'BOTTOM_BASELINE'
    obj = bpy.data.objects.new(value, data)
    scene.collection.objects.link(obj)
    data.materials.append(material)
    obj.location = (x, y, z)
    return obj


def line(points, material=GRID, radius=.008, name='Guide'):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius
    data.bevel_resolution = 0
    spline = data.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for p, xyz in zip(spline.points, points):
        p.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    data.materials.append(material)
    return obj


def cage(x, y, size=1, w=1, h=1, z=.035):
    for i in range(round(w * 2) + 1):
        u = i / 2
        line([(x + u * size, y, z), (x + u * size, y + h * size, z)], radius=.0035)
    for j in range(round(h * 2) + 1):
        v = j / 2
        line([(x, y + v * size, z), (x + w * size, y + v * size, z)], radius=.0035)


ROTATION = Matrix.Rotation(math.radians(17), 4, 'X') @ Matrix.Rotation(math.radians(-28), 4, 'Y')


def place(obj, x, y, scale=1, turned=False, center=(.5, .5, 0)):
    obj.matrix_world = Matrix.Translation((x, y, 0)) @ (ROTATION if turned else Matrix.Identity(4)) @ Matrix.Scale(scale, 4) @ Matrix.Translation(tuple(-v for v in center))


def camera(width, height, perspective=False):
    data = bpy.data.cameras.new('Camera')
    obj = bpy.data.objects.new('Camera', data)
    scene.collection.objects.link(obj)
    scene.camera = obj
    if perspective:
        data.type = 'PERSP'
        data.sensor_fit = 'VERTICAL'
        data.sensor_height = 24
        data.lens = 24 / (2 * math.tan(math.radians(15)))
        obj.location = (0, 0, 30)
    else:
        data.type = 'ORTHO'
        data.ortho_scale = max(width, height)
        obj.location = (width / 2, height / 2, 60)
    obj.rotation_euler = (0, 0, 0)
    scene.render.resolution_x = args.width
    scene.render.resolution_y = round(args.width * height / width)


def render(filename):
    scene.render.filepath = str(ROOT / filename)
    scene.render.image_settings.color_mode = 'RGB'
    bpy.context.preferences.filepaths.save_version = 0
    image_node.image.pack()
    report = {
        'image': filename,
        'material': CONCRETE.name,
        'resolution': [scene.render.resolution_x, scene.render.resolution_y],
        'solidCount': len(SHAPES),
        'wallEntryCount': len(WALLS),
        'cameraType': scene.camera.data.type,
        'cameraLocation': list(scene.camera.location),
        'cameraRotation': list(scene.camera.rotation_euler),
        'verticalFieldOfViewDegrees': math.degrees(scene.camera.data.angle_y) if scene.camera.data.type == 'PERSP' else None,
        'solidDepth': 2,
        'wallDepth': .2,
        'stage': 'artwork only; not game runtime integration',
    }
    (ROOT / (Path(filename).stem + '.json')).write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / (Path(filename).stem + '.blend')))
    bpy.ops.render.render(write_still=True)


def solids():
    cw, ch, cols = 4.6, 3.1, 5
    width, height = 24, 24.4
    panel(-1, -1, width + 2, height + 2, PAPER, -5)
    text('白色混凝土  /  全部 33 种实体形态', .6, height - .75, .46)
    text('同一材质 · XY 方格 1×1 · Z 深度全部为 2 格 · 含旋转与倒置形态', .65, height - 1.3, .23, MUTED)
    for index, shape in enumerate(SHAPES):
        col, row = index % cols, index // cols
        x, y = .5 + col * cw, height - 1.7 - (row + 1) * ch
        panel(x, y, cw - .15, ch - .15)
        text(shape['id'], x + .18, y + 2.61, .29, ACCENT)
        text(shape['name'], x + 1.4, y + 2.65, .18)
        cage(x + .31, y + .77, 1.1)
        front = mesh(shape['id'] + ' exact front', shape['vertices'], .03, 0)
        place(front, x + .86, y + 1.32, 1.1)
        body = mesh(shape['id'] + ' depth 2', shape['vertices'])
        place(body, x + 3, y + 1.5, 1.06, True)
        text('正面占格', x + .86, y + .47, .16, INK, 'CENTER')
        text('实体厚度', x + 3, y + .47, .16, INK, 'CENTER')
        text(f"{shape['width']:g} × {shape['height']:g} × 2 格", x + .18, y + .14, .17, INK)
    text('细网格为半格。上半、左右半、四角砖均保留在原格位；所有外露面使用同一白色混凝土。', .65, .42, .20, MUTED)
    camera(width, height)
    render('white-concrete-all-33.png')


def walls():
    cw, ch, cols = 5.6, 3.45, 4
    width, height = 23.4, 23.6
    panel(-1, -1, width + 2, height + 2, PAPER, -5)
    text('白色混凝土  /  背景薄墙与拼窗', .6, height - .75, .46)
    text('22 项形态 / 开口 / 组合 · 墙厚 0.2 格 · 单格、跨格及四角组合均保留真实开口', .65, height - 1.25, .22, MUTED)
    for index, wall in enumerate(WALLS):
        x, y = .5 + index % cols * cw, height - 1.7 - (index // cols + 1) * ch
        panel(x, y, cw - .15, ch - .15)
        text(wall['id'], x + .18, y + 2.96, .28, ACCENT)
        text(wall['name'], x + 1.72, y + 3.00, .17)
        w, h = wall['width'], wall['height']
        scale = min(1.25, 1.85 / w, 1.55 / h)
        center = (w / 2, h / 2, 0)
        cage(x + 1.25 - w * scale / 2, y + 1.63 - h * scale / 2, scale, w, h)
        for k, poly in enumerate(wall['polygons']):
            front = mesh(wall['id'] + f' front {k}', poly, .03, 0)
            place(front, x + 1.25, y + 1.63, scale, center=center)
            body = mesh(wall['id'] + f' body {k}', poly, .2, .002)
            place(body, x + 4.0, y + 1.63, scale, True, center)
        if not wall['polygons']:
            text('不生成墙面', x + 3.95, y + 1.6, .2, INK, 'CENTER')
        text('正面占格', x + 1.25, y + .48, .17, INK, 'CENTER')
        text('厚度 0.2', x + 4.0, y + .48, .17, INK, 'CENTER')
        text(f'占位 {w:g} × {h:g} 格', x + .18, y + .15, .18, INK)
    text('窗框边宽 b=0.1、斜角切距 c=0.5 沿用现有草案；蓝灰底代表空处，窗后没有完整墙面。', .65, .30, .19, MUTED)
    camera(width, height)
    render('white-concrete-walls-22.png')


def game_camera():
    width = 2 * 30 * math.tan(math.radians(15)) * 16 / 9
    height = width * 9 / 16
    panel(-40, -25, 80, 50, PAPER, -5)
    for index, shape in enumerate(SHAPES):
        x, y = -12 + index % 11 * 2.4, 4 - index // 11 * 4
        body = mesh(shape['id'], shape['vertices'])
        body.location = (x - .5, y - .5, 0)
        text(shape['id'], x, y - 1.36, .28, INK, 'CENTER', z=0)
        line([(x - .6, y - .56, 1.01), (x + .6, y - .56, 1.01)], radius=.007)
    text('白色混凝土｜真实游戏镜头', -13, 7, .49, z=0)
    text('垂直 FOV 30°  /  距离 30 格  /  +Z 平视  /  33 种实体同尺度', -13, 6.32, .29, MUTED, z=0)
    text('中心几乎不露顶面与侧面；边缘逐渐露出纵深。全部实体深 2 格，宽高按形态变化。', -13, -7, .28, MUTED, z=0)
    camera(width, height, True)
    render('white-concrete-game-camera.png')


def assembly():
    panel(-1, -1, 27, 18, PAPER, -5)
    text('白色混凝土  /  拼接与材质检查', .6, 15.6, .48)
    text('完整格、半格、坡形、薄墙共用同一材质；蓝灰处为真实留空。', .65, 14.9, .25, MUTED)
    lookup = {s['id']: s for s in SHAPES}
    tests = [('整砖 + 四向半砖', ['A', 'B', 'C', 'K', 'L']), ('完整坡接平地', ['D', 'A', 'A', 'E']), ('半高坡连续拼接', ['F', 'B', 'B', 'I']), ('两格缓坡连续拼接', ['F', 'G', 'H', 'I'])]
    for row, (title, ids) in enumerate(tests):
        y = 12.8 - row * 2.8
        text(title, .75, y + .66, .31)
        panel(8.4, y - .68, 5.8, 1.45)
        for col, code in enumerate(ids):
            x = 8.8 + col
            body = mesh(f'{title}-{col}-{code}', lookup[code]['vertices'])
            body.location = (x, y - .5, 0)
            text(code, x + .5, y - .9, .2, MUTED, 'CENTER')
        text('1 格', 7.0, y - .1, .22, MUTED)
        line([(7.9, y - .5, 1.1), (7.9, y + .5, 1.1)], ACCENT, .013)
    text('材质近看', 18.0, 13.45, .31)
    panel(17.5, 8.2, 7.7, 4.7)
    body = mesh('Material close view', lookup['A']['vertices'])
    place(body, 21.0, 10.6, 2.15, True)
    text('细颗粒 / 微孔 / 哑光 / 轻微圆边', 18.0, 7.8, .23, MUTED)
    for i, wall_id in enumerate(['W0', 'W2-2x2', 'W8-2x2']):
        wall = next(w for w in WALLS if w['id'] == wall_id)
        x = 18.3 + i * 2.25
        for k, p in enumerate(wall['polygons']):
            part = mesh(f'{wall_id}-{k}', p, .2, .002)
            place(part, x, 4.2, .78, True, (wall['width'] / 2, wall['height'] / 2, 0))
        text(wall_id, x, 2.9, .21, MUTED, 'CENTER')
    text('实体深 2 格；背景墙厚 0.2 格，墙在 Z=[−1.2,−1]。当前为美术制作图，未接入游戏建造。', .65, .75, .24, MUTED)
    camera(26, 17)
    render('white-concrete-assembly.png')


{'solids': solids, 'walls': walls, 'camera': game_camera, 'assembly': assembly}[args.mode]()
