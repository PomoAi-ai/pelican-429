"""Reference-constrained volumetric character with four-view projected surface color.

The mesh is a closed, round volume. Image lighting is deliberately retained in
its texture, so this is a painted multiview variant, not learned reconstruction.
"""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'public/characters/human/history/models-multiview'
SOURCE = ROOT / 'assets/characters/grassy/history/model-multiview'
REFERENCES = ROOT / 'public/characters/human/history/turnaround-master-v2'
SCALE = 3.1 / (1225 - 36)
CENTER = 627
CANONICAL = np.array([36, 310, 421, 456, 741, 950, 1105, 1225])
LANDMARKS = {
    'front': CANONICAL,
    'right': np.array([67, 334, 450, 477, 763, 973, 1125, 1236]),
    'left': np.array([57, 336, 454, 480, 762, 975, 1126, 1237]),
    'back': np.array([48, 323, 423, 451, 748, 968, 1126, 1234]),
}
NECK_POINTS = [(397, 599, 656, 43, -48), (432, 590, 665, 42, -45),
               (456, 590, 665, 34, -32), (478, 596, 660, 25, -25)]


def interp(points, rows):
    array = np.array(points, dtype=float)
    index = np.clip(np.searchsorted(array[:, 0], rows, side='right') - 1, 0, len(array) - 2)
    span = array[index + 1, 0] - array[index, 0]
    t = (rows - array[index, 0]) / span
    result = []
    for i in range(1, array.shape[1]):
        slopes = np.gradient(array[:, i], array[:, 0])
        result.append((2*t**3-3*t*t+1)*array[index,i] + (t**3-2*t*t+t)*span*slopes[index]
                      + (-2*t**3+3*t*t)*array[index+1,i] + (t**3-t*t)*span*slopes[index+1])
    return tuple(result)


def load_references():
    result = {}
    for name in LANDMARKS:
        image = bpy.data.images.load(str(REFERENCES / (name + '.png')))
        image.colorspace_settings.name = 'Non-Color'
        w, h = image.size
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
        # Pull edge colors into transparent pixels; projection never samples black fringes.
        mask = pixels[:, :, 3] > .5
        for _ in range(16):
            color_sum = np.zeros_like(pixels[:, :, :3])
            weight = np.zeros_like(mask, dtype=np.float32)
            for axis, shift in ((0, -1), (0, 1), (1, -1), (1, 1)):
                valid = np.roll(mask, shift, axis=axis)
                color_sum += np.roll(pixels[:, :, :3], shift, axis=axis) * valid[:, :, None]
                weight += valid
            fill = (~mask) & (weight > 0)
            pixels[fill, :3] = color_sum[fill] / weight[fill, None]
            mask |= fill
        result[name] = pixels
        bpy.data.images.remove(image)
    return result


def sample(image, x, row):
    h, w = image.shape[:2]
    x = np.clip(x, 0, w - 1.001)
    row = np.clip(row, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(row).astype(int)
    a, b = x - x0, row - y0
    return ((image[y0, x0] * (1 - a)[..., None] + image[y0, x0 + 1] * a[..., None])
            * (1 - b)[..., None] + (image[y0 + 1, x0] * (1 - a)[..., None]
            + image[y0 + 1, x0 + 1] * a[..., None]) * b[..., None])


def projection(name, xyz, refs):
    x, y, row = xyz
    source_row = np.interp(row, CANONICAL, LANDMARKS[name])
    if name == 'front':
        column = CENTER + x
    elif name == 'back':
        column = 633 - x
    elif name == 'right':
        column = 627 - y
    else:
        column = 627 + y
    return sample(refs[name], column, source_row)


def painted_material(name, fn, refs, width=1536, height=1536, mode='body'):
    u, v = np.meshgrid(np.linspace(0, 1, width), np.linspace(0, 1, height))
    x, y, row = fn(u, v)
    theta = u * math.tau
    c, s = np.cos(theta), np.sin(theta)
    weights = [np.maximum(c, 0) ** 7, np.maximum(-s, 0) ** 7,
               np.maximum(-c, 0) ** 7, np.maximum(s, 0) ** 7]
    if mode == 'head':
        # Each eye belongs to the front projection. Blending independently drawn eyes creates ghosts.
        face = np.clip((c - .48) / .12, 0, 1)
        weights = [face, weights[1] * (1-face), weights[2] * (1-face), weights[3] * (1-face)]
    names = ['front', 'right', 'back', 'left']
    color, total = np.zeros((height, width, 3), np.float32), np.zeros((height, width), np.float32)
    for direction, weight in zip(names, weights):
        value = projection(direction, (x, y, row), refs)
        if mode == 'denim' and direction in ('left', 'right'):
            # Side photographs contain an occluding hand; the jeans underneath use visible fabric below it.
            clean = sample(refs['front'], 548 + y * .15, 906 + (row - 760) * .65)
            occluded = (row > 728) & (row < 890) & (abs(y) < 78)
            blend = np.clip((78-abs(y))/12,0,1) * np.clip((890-row)/16,0,1) * np.clip((row-728)/16,0,1)
            value[occluded] = value[occluded] * (1-blend[occluded,None]) + clean[occluded] * blend[occluded,None]
        # Reference alpha is a source-data boundary: invisible samples get no influence.
        alpha = np.clip(value[:, :, 3] * 5, 0, 1)
        weight *= alpha
        color += value[:, :, :3] * weight[:, :, None]
        total += weight
    missing = total < .00001
    if np.any(missing):
        # Hidden undersides have no photograph; use their neighboring surface colors.
        for _ in range(40):
            if not np.any(missing):
                break
            fill_sum, fill_count = np.zeros_like(color), np.zeros_like(total)
            for axis, shift in ((0, -1), (0, 1), (1, -1), (1, 1)):
                known = np.roll(~missing, shift, axis)
                source = np.roll(color / np.maximum(total[..., None], .00001), shift, axis)
                fill_sum += source * known[..., None]
                fill_count += known
            fill = missing & (fill_count > 0)
            color[fill] = fill_sum[fill] / fill_count[fill, None]
            total[fill] = 1
            missing[fill] = False
        if np.any(missing):
            fallback = {'head': (0.23, .14, .11), 'body': (.82, .08, .12),
                        'skin': (.94, .66, .52), 'denim': (.30, .46, .65),
                        'shoe': (.89, .85, .79)}[mode]
            color[missing] = fallback
            total[missing] = 1
    color /= total[..., None]
    rgba = np.ones((height, width, 4), np.float32)
    # Byte-backed image pixels use their declared sRGB colorspace; avoid a second gamma conversion.
    rgba[:, :, :3] = color
    image = bpy.data.images.new(name + '_reference_color', width=width, height=height)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(SOURCE / 'textures' / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    mat = bpy.data.materials.new(name + ' • projected reference color')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes['Principled BSDF']
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    links.new(texture.outputs['Color'], shader.inputs['Emission Color'])
    shader.inputs['Emission Strength'].default_value = .28
    shader.inputs['Roughness'].default_value = .82
    shader.inputs['Specular IOR Level'].default_value = .15
    return mat


def surface(name, fn, refs, mode, rows=100, columns=160, texture=1024):
    u, v = np.meshgrid(np.linspace(0, 1, columns + 1), np.linspace(0, 1, rows + 1))
    x, y, row = fn(u, v)
    coordinates = np.stack((x * SCALE, y * SCALE, (1225 - row) * SCALE), axis=-1).reshape(-1, 3)
    uv_coordinates = np.stack((u, v), axis=-1).reshape(-1, 2)
    faces = []
    for j in range(rows):
        for i in range(columns):
            a = j * (columns + 1) + i
            faces.append((a, a + 1, a + columns + 2, a + columns + 1))
    faces.extend((tuple(reversed(range(columns + 1))),
                  tuple(range(rows * (columns + 1), (rows + 1) * (columns + 1)))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(coordinates, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    layer = mesh.uv_layers.new(name='Reference surface UV')
    for loop in mesh.loops:
        layer.data[loop.index].uv = uv_coordinates[loop.vertex_index]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.0000001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj.data.materials.append(painted_material(name, fn, refs, texture, texture, mode))
    obj['construction'] = 'Closed volume constrained by reference silhouettes; four-view color projection'
    return obj


def rings(points, exponent=1., relief=0, nose=False):
    def fn(u, v):
        row = points[0][0] + (points[-1][0] - points[0][0]) * v
        left, right, rear, front = interp(points, row)
        theta = u * math.tau
        a, b = np.sin(theta), np.cos(theta)
        x = (left + right) / 2 - CENTER + (right - left) / 2 * np.sign(a) * abs(a) ** exponent
        y = (rear + front) / 2 + (front - rear) / 2 * np.sign(b) * abs(b) ** exponent
        if nose:
            y -= 11 * np.exp(-((x / 22) ** 2 + ((row - 345) / 19) ** 2)) * np.maximum(b, 0) ** 12
            y -= 5 * np.exp(-(((abs(x) - 68) / 48) ** 2 + ((row - 347) / 30) ** 2)) * np.maximum(b, 0) ** 4
        if relief:
            fold = relief * np.sin(row / 13 + a * 2.4) * np.exp(-((row - points[-1][0] + 30) / 80) ** 2)
            y += fold * b
            x += fold * a * .4
        return x, y, row
    return fn


def leg_surface(points):
    base = rings(points, .91, 2.0)
    def fn(u, v):
        x, y, row = base(u, v)
        envelope = np.sqrt(np.maximum(0, 1-((x-3)/130)**2))
        fitted = np.maximum(-83*envelope, np.minimum(81*envelope,y))
        blend = np.clip((row-790)/68,0,1)
        return x, fitted*(1-blend)+y*blend, row
    return fn


def clean_material(name, srgb, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    color = [v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb]
    shader = material.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = (*color,1)
    shader.inputs['Emission Color'].default_value = (*color,1)
    shader.inputs['Emission Strength'].default_value = .28
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Specular IOR Level'].default_value = .15
    material.diffuse_color = (*color,1)
    return material


def finish_surfaces(objects):
    skin = clean_material('Clean neck skin', (.96,.73,.64), .72)
    rubber = clean_material('Clean off-white sole', (.89,.85,.82), .84)
    for obj in objects:
        if obj.name == 'Neck':
            fn = rings(NECK_POINTS)
            uv = obj.data.uv_layers.active
            for loop in obj.data.loops:
                u,v = uv.data[loop.index].uv
                x,y,row = fn(np.asarray(u),np.asarray(v))
                obj.data.vertices[loop.vertex_index].co = (x*SCALE,y*SCALE,(1225-row)*SCALE)
            obj.data.materials.clear()
            obj.data.materials.append(skin)
            obj.data.update()
        if obj.name.endswith('sneaker'):
            obj.data.materials.append(rubber)
            slot = len(obj.data.materials)-1
            for polygon in obj.data.polygons:
                height = sum(obj.data.vertices[i].co.z for i in polygon.vertices)/len(polygon.vertices)
                if height < .071:
                    polygon.material_index = slot


def build(refs, texture):
    result = []
    head = [(36, 621, 630, -29, -39), (61, 566, 679, 45, -71),
            (93, 511, 733, 104, -117), (130, 474, 777, 148, -145),
            (177, 448, 807, 182, -162), (222, 434, 817, 188, -158),
            (261, 446, 807, 182, -149), (290, 479, 777, 174, -140),
            (321, 497, 757, 155, -144), (348, 508, 747, 132, -147),
            (371, 518, 735, 108, -141), (391, 540, 714, 66, -132),
            (409, 564, 690, 38, -106), (422, 591, 663, 23, -54)]
    measured = []
    for row in list(range(36, 283, 7)) + [p[0] for p in head if p[0] > 283]:
        left, right, rear, front = [float(a) for a in interp(head, np.asarray(row))]
        if row <= 283:
            cols = np.where(refs['front'][row, :, 3] > .8)[0]
            if len(cols):
                left, right = int(cols[0]), int(cols[-1])
        side_row = round(float(np.interp(row, CANONICAL, LANDMARKS['right'])))
        cols = np.where(refs['right'][side_row, :, 3] > .8)[0]
        if len(cols):
            rear, front = 627-int(cols[0]), 627-int(cols[-1])
        measured.append((row, left, right, rear, front))
    values = np.array(measured, dtype=float)
    kernel = np.array((1,2,3,2,1),dtype=float)/9
    for column in range(1,5):
        smoothed = np.convolve(np.pad(values[:,column],(2,2),mode='edge'), kernel, mode='valid')
        values[1:-1,column] = smoothed[1:-1]
    measured = values.tolist()
    result.append(surface('Head and hair volume', rings(measured, 1., nose=True), refs, 'head', 180, 224, texture))
    result.append(surface('Neck', rings(NECK_POINTS), refs, 'skin', 32, 80, texture // 2))
    for sign in (-1, 1):
        center = CENTER + sign * 146
        ear = [(299, center - 2, center + 2, -6, -14),
               (316, center - 25, center + 25, 22, -34),
               (341, center - 28, center + 28, 31, -35),
               (365, center - 17, center + 17, 26, -24),
               (378, center - 1, center + 1, 3, -4)]
        result.append(surface(('L' if sign < 0 else 'R') + ' ear', rings(ear), refs, 'skin', 40, 64, texture // 2))
    torso = [(449, 581, 674, 46, -37), (466, 549, 706, 52, -40),
             (490, 514, 743, 63, -47), (525, 511, 746, 68, -72),
             (573, 513, 745, 73, -91), (627, 516, 744, 76, -101),
             (673, 503, 754, 86, -111), (697, 493, 765, 92, -116),
             (712, 501, 758, 90, -111), (740, 507, 752, 87, -102)]
    result.append(surface('Red sweater torso', rings(torso, .88, 2.5), refs, 'body', 116, 144, texture))
    sleeve = [(480, 507, 525, 18, -17), (503, 472, 546, 45, -44),
              (549, 451, 527, 54, -57), (595, 430, 516, 61, -65),
              (637, 407, 508, 64, -64), (674, 387, 491, 64, -66),
              (700, 376, 488, 60, -68), (719, 391, 480, 48, -51),
              (743, 389, 466, 45, -43), (752, 403, 460, 32, -29)]
    for sign in (-1, 1):
        points = sleeve if sign < 0 else [(r, 1254-b, 1254-a, c, d) for r,a,b,c,d in sleeve]
        result.append(surface(('L' if sign < 0 else 'R') + ' sleeve', rings(points, .95, 2), refs, 'body', 96, 112, texture))
    hip = [(734, 510, 751, 79, -98), (762, 500, 758, 84, -98),
           (791, 500, 760, 83, -85), (812, 509, 745, 74, -69),
           (835, 536, 718, 66, -63)]
    result.append(surface('Jeans hip', rings(hip), refs, 'denim', 52, 144, texture))
    leg = [(790, 500, 630, 84, -91), (827, 493, 625, 84, -79),
           (868, 487, 617, 83, -75), (915, 483, 613, 78, -68),
           (960, 480, 606, 78, -62), (995, 474, 597, 82, -58),
           (1031, 462, 593, 88, -51), (1053, 465, 597, 83, -49),
           (1067, 459, 597, 87, -55), (1090, 461, 596, 86, -57),
           (1104, 472, 587, 80, -52)]
    for sign in (-1, 1):
        points = leg if sign < 0 else [(r, 1254-b, 1254-a, c, d) for r,a,b,c,d in leg]
        result.append(surface(('L' if sign < 0 else 'R') + ' jeans leg', leg_surface(points), refs, 'denim', 120, 144, texture))
        ankle = [(1095, 484, 571, 68, -37), (1131, 488, 570, 64, -43)]
        points = ankle if sign < 0 else [(r, 1254-b, 1254-a, c, d) for r,a,b,c,d in ankle]
        result.append(surface(('L' if sign < 0 else 'R') + ' ankle', rings(points), refs, 'skin', 20, 64, texture // 2))
        shoe = [(1106, 497, 558, 61, -47), (1128, 475, 574, 86, -91),
                (1154, 447, 581, 93, -133), (1184, 427, 585, 97, -150),
                (1205, 416, 588, 98, -151), (1220, 419, 583, 95, -144),
                (1225, 429, 574, 91, -136)]
        points = shoe if sign < 0 else [(r, 1254-b, 1254-a, c, d) for r,a,b,c,d in shoe]
        result.append(surface(('L' if sign < 0 else 'R') + ' sneaker', rings(points, .7), refs, 'shoe', 64, 128, texture))
    # Hands use a front-reference silhouette with actual palm thickness and separate fingers.
    for sign in (-1, 1):
        hand = [(742, 408, 455, 33, -28), (768, 398, 454, 30, -26),
                (791, 385, 454, 24, -22), (815, 380, 445, 19, -20),
                (839, 390, 427, 15, -18), (850, 403, 421, 10, -10)]
        points = hand if sign < 0 else [(r, 1254-b, 1254-a, c, d) for r,a,b,c,d in hand]
        result.append(surface(('L' if sign < 0 else 'R') + ' palm', rings(points), refs, 'skin', 60, 96, texture // 2))
        fingers = [([(811, 378, 394, 14, -12), (839, 383, 401, 12, -13),
                     (861, 406, 425, 8, -11), (870, 416, 425, 2, -4)]),
                   ([(795, 441, 457, 14, -15), (813, 445, 464, 10, -14),
                     (828, 450, 462, 3, -4)])]
        for i, finger in enumerate(fingers):
            points = finger if sign < 0 else [(r, 1254-b, 1254-a, c, d) for r,a,b,c,d in finger]
            result.append(surface(('L' if sign < 0 else 'R') + f' hand curl {i}', rings(points), refs, 'skin', 32, 40, texture // 2))
    finish_surfaces(result)
    return result


def studio():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.view_settings.view_transform = 'Standard'
    scene.render.film_transparent = True
    world = bpy.data.worlds.new('Neutral viewing light')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.8, .84, .9, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .4
    scene.world = world
    for name, loc, power, size in [('Key', (-3, -4, 6), 160, 5), ('Fill', (4, -2, 3), 70, 4), ('Rim', (2, 4, 4), 120, 4)]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size = power, 'DISK', size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        obj.rotation_euler = (Vector((0, 0, 1.6)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 3.4
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.location = (-5.5, -8, 2.25)
    camera.rotation_euler = (Vector((0,0,1.55))-camera.location).to_track_quat('-Z','Y').to_euler()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                space = area.spaces.active
                space.shading.type = 'SOLID'
                space.shading.color_type = 'TEXTURE'
                space.overlay.show_overlays = False
                space.region_3d.view_location = (0,0,1.55)
                space.region_3d.view_distance = 5.0
                space.region_3d.view_rotation = Quaternion((.87,.48,-.04,-.08))
    return camera


def render(camera, views, size):
    scene = bpy.context.scene
    scene.render.resolution_x = size
    scene.render.resolution_y = round(size * 1.1)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    for name in views:
        positions = {'front': (0, -9, 1.55), 'right': (-9, 0, 1.55), 'left': (9, 0, 1.55),
                     'back': (0, 9, 1.55), 'hero': (-5.5, -8, 2.25)}
        camera.location = positions[name]
        camera.rotation_euler = (Vector((0, 0, 1.55)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(PUBLIC / ('render-' + name + '.png'))
        bpy.ops.render.render(write_still=True)
        print('RENDERED ' + name, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--size', type=int, default=900)
    parser.add_argument('--texture', type=int, default=1024)
    parser.add_argument('--views', default='front,right,left,back,hero')
    parser.add_argument('--render-only', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (SOURCE / 'textures').mkdir(parents=True, exist_ok=True)
    if args.render_only:
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'grassy-multiview.blend'))
        camera = bpy.context.scene.camera
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        objects = build(load_references(), args.texture)
        camera = studio()
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        path = PUBLIC / 'grassy-multiview.glb'
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                                 export_yup=True, export_apply=True, export_animations=False,
                                 export_skins=False, export_cameras=False, export_lights=False)
        bpy.context.scene['Method'] = 'Multiview painted volume; no neural image-to-3D; source illumination retained'
        bpy.context.scene['Reference height'] = 3.1
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'grassy-multiview.blend'))
        triangle_count = sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in objects)
        manifest = {'name': '多视图贴图版', 'method': 'Reference constrained closed volumes with four-view projected UV colors',
                    'height': 3.1, 'triangles': triangle_count, 'meshCount': len(objects), 'glbBytes': path.stat().st_size,
                    'glb': str(path), 'blend': str(SOURCE / 'grassy-multiview.blend'), 'static': True,
                    'materialNotes': 'Reference-projected color with clean neck skin and off-white sole to avoid silhouette-edge artifacts.',
                    'limitations': ['Original reference lighting is retained in the surface colors.',
                                    'Occluded anatomy is approximated; this is not neural 3D reconstruction.',
                                    'Eyes, eyebrows, mouth and fine hair features are painted rather than individually sculpted.',
                                    'Four references contain conflicting hand poses; the model follows the front pose.']}
        (PUBLIC / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
        print('EXPORTED '+json.dumps(manifest), flush=True)
    if args.views:
        render(camera, args.views.split(','), args.size)


if __name__ == '__main__':
    main()
