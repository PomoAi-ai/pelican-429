"""Register authored female parts to the game's skeleton and export customization."""
import argparse
import heapq
import json
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_rodin'))
import animate as rigging

PARTS = {
    'royal': {'s': 's1', 'hair': [2], 'body': [3],
              'channels': {'skin': [0, 3, 9], 'hair': [2], 'top': [4, 6], 'bottom': [5, 8], 'shoes': [1, 7]}},
    'urban': {'s': 's2', 'hair': [2]},
    'explorer': {'s': 's3', 'hair': [5]},
    'soft': {'s': 's4', 'hair': [2]},
    'dark': {'s': 's5', 'hair': [8]},
    'sport': {'s': 's6', 'hair': [6]},
}
MORPHS = ['FaceWidth', 'FaceLength', 'JawWidth', 'ChinLength', 'EyeSize', 'EyeSpacing', 'NoseSize', 'MouthWidth']
COLORS = {
    'royal': ('#e6bd75', '#3567ae', '#4b4545', '#ddd6ca'),
    'urban': ('#d9b995', '#30313c', '#89394f', '#29282b'),
    'explorer': ('#deb88a', '#83b9a3', '#34465f', '#765a40'),
    'soft': ('#ddb38a', '#eee5d7', '#bc8597', '#ddd6ca'),
    'dark': ('#ded1ad', '#383540', '#302d38', '#29282b'),
    'sport': ('#d9b080', '#e98777', '#eee8dd', '#e8d9cc'),
}


def color_reference(material, channel, style):
    references = dict(zip(['hair', 'top', 'bottom', 'shoes'], COLORS[style]))
    references['skin'] = '#f9d8c7'
    material['customBaseColor'] = references[channel]


def hair_keys(obj):
    p = rigging.mesh_coordinates(obj.data)
    x, y, z = p.T
    regions = {
        'Front': (1 - smooth(2.40, 2.8, z)) * (1 - smooth(-.2, .02, y)),
        'Crown': smooth(2.84, 3.08, z) * smooth(.15, .36, abs(x)) * .25,
        'Rear': (1 - smooth(2.4, 2.76, z)) * smooth(0, .16, y),
    }
    obj.shape_key_add(name='Basis')
    for region, weight in regions.items():
        for channel in ('Sway', 'Lift'):
            q = p.copy()
            q[:, 1] += weight * (.045 if channel == 'Sway' else .016)
            if channel == 'Lift':
                q[:, 2] += weight * .035
            key = obj.shape_key_add(name=f'Hair{region}{channel}')
            key.value = 0
            key.slider_min = -1
            key.data.foreach_set('co', q.ravel())
    q = p.copy()
    q[:, 0] += sum(regions.values()) * .035
    key = obj.shape_key_add(name='HairTurn')
    key.value = 0
    key.data.foreach_set('co', q.ravel())


def clean_hair_neck(obj):
    """Remove tiny disconnected debris without cutting holes into hair strands."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    unseen = set(bm.verts)
    remove = []
    while unseen:
        start = unseen.pop()
        component, queue = [start], [start]
        while queue:
            vertex = queue.pop()
            for edge in vertex.link_edges:
                neighbor = edge.other_vert(vertex)
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    component.append(neighbor)
                    queue.append(neighbor)
        if max(vertex.co.z for vertex in component) < 2.15 and len(component) < 200:
            spans = [max(vertex.co[axis] for vertex in component) - min(vertex.co[axis] for vertex in component) for axis in range(3)]
            if max(spans) < .08:
                remove.extend(component)
    bmesh.ops.delete(bm, geom=remove, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()


def original_head(directory, face_guide, hair_guide):
    """Use segmentation only as a guide; keep the original face texture and topology."""
    def tree(obj):
        return BVHTree.FromPolygons([vertex.co for vertex in obj.data.vertices],
                                   [list(face.vertices) for face in obj.data.polygons])
    face_tree, hair_tree = tree(face_guide), tree(hair_guide)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(directory / 'source.glb'))
    obj = next(obj for obj in bpy.data.objects if obj not in before and obj.type == 'MESH')
    register([obj])
    fitting = obj.copy()
    fitting.data = obj.data.copy()
    fitting.name = 'FemaleEyelidSurface'
    fitting.hide_render = True
    bpy.context.collection.objects.link(fitting)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    remove = []
    for polygon in mesh.faces:
        point = polygon.calc_center_median()
        if face_tree.find_nearest(point)[3] > hair_tree.find_nearest(point)[3]:
            remove.append(polygon)
    bmesh.ops.delete(mesh, geom=remove, context='FACES')
    bmesh.ops.bisect_plane(mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces),
                           plane_co=(0, 0, 2.105), plane_no=(0, 0, 1), dist=.00001, clear_inner=True)
    bmesh.ops.delete(mesh, geom=[vertex for vertex in mesh.verts if not vertex.link_faces], context='VERTS')
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.name = 'OriginalFemaleFace'
    # Painted lashes need a continuous face surface for a closed lid to cover them.
    for target in (obj, fitting):
        p = rigging.mesh_coordinates(target.data)
        x, y, z = p.T
        mask = smooth(2.24, 2.30, z) * (1 - smooth(2.53, 2.59, z))
        mask *= smooth(.035, .07, abs(x)) * (1 - smooth(.26, .30, abs(x)))
        mask *= 1 - smooth(-.12, .02, y)
        dome = -.36 * np.sqrt(np.maximum(.01, 1 - (x / .44) ** 2)) + .007
        p[:, 1] += np.maximum(0, dome - y) * mask
        target.data.vertices.foreach_set('co', p.ravel())
        target.data.update()
    return obj


def build_neck(rig):
    mesh = bpy.data.meshes.new('Female neck surface')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=40, radius1=.108, radius2=.092, depth=.28)
    for vertex in bm.verts:
        vertex.co.y = vertex.co.y * .86 - .005
        vertex.co.z += 2.005
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('Female_royal_body_neck', mesh)
    bpy.context.collection.objects.link(obj)
    obj['customPart'], obj['customStyle'] = 'body', 'royal'
    mat = bpy.data.materials.new('custom.skin.royal.neck')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = rigging.studio.srgb('#f9d8c7')
    bsdf.inputs['Roughness'].default_value = .64
    mat['customizationChannel'] = 'skin'
    color_reference(mat, 'skin', 'royal')
    mesh.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = True
    rigging.bind_surface(obj, rig)
    shape_keys(obj)
    return obj


def smooth(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def face_deltas(p):
    """Continuous localized deformations preserve facial topology and UVs."""
    x, y, z = p.T
    front = 1 - smooth(-.17, .03, y)
    face = smooth(2.03, 2.16, z) * (1 - smooth(2.70, 2.88, z))
    jaw = np.exp(-((z - 2.20) / .15) ** 2) * front
    chin = np.exp(-(x / .14) ** 2 - ((z - 2.10) / .10) ** 2) * front
    eye_center = np.where(x < 0, -.15, .15)
    eye = np.exp(-((x - eye_center) / .115) ** 4 - ((z - 2.40) / .095) ** 4) * front
    nose = np.exp(-(x / .065) ** 2 - ((z - 2.31) / .09) ** 2) * front
    mouth = np.exp(-(x / .13) ** 4 - ((z - 2.21) / .055) ** 2) * front
    deltas = {name: np.zeros_like(p) for name in MORPHS}
    deltas['FaceWidth'][:, 0] = x * .08 * face
    deltas['FaceLength'][:, 2] = (z - 2.47) * .13 * face
    deltas['JawWidth'][:, 0] = x * .12 * jaw
    deltas['ChinLength'][:, 2] = -.045 * chin
    deltas['EyeSize'][:, 0] = (x - eye_center) * .12 * eye
    deltas['EyeSize'][:, 2] = (z - 2.40) * .12 * eye
    deltas['EyeSpacing'][:, 0] = np.sign(x) * .020 * eye
    deltas['NoseSize'][:, 0] = x * .20 * nose
    deltas['NoseSize'][:, 1] = -.025 * nose
    deltas['MouthWidth'][:, 0] = x * .24 * mouth
    return deltas


def shape_keys(obj):
    p = rigging.mesh_coordinates(obj.data).astype(np.float64)
    deltas = face_deltas(p)
    if obj.data.shape_keys is None:
        obj.shape_key_add(name='Basis')
    keys = obj.data.shape_keys.key_blocks
    blink = {}
    for name in ('Blink', 'BlinkHalf'):
        if name in keys:
            coordinates = np.array([vertex.co[:] for vertex in keys[name].data])
            blink[name] = face_deltas(coordinates)
    for name, delta in deltas.items():
        key = obj.shape_key_add(name=name)
        key.value = 0
        key.slider_min, key.slider_max = -1, 1
        key.data.foreach_set('co', (p + delta).astype(np.float32).ravel())
        for blink_name, closed_deltas in blink.items():
            corrective = obj.shape_key_add(name=name + blink_name)
            corrective.value = 0
            corrective.slider_min, corrective.slider_max = -1, 1
            corrective.data.foreach_set('co', (p + closed_deltas[name] - delta).astype(np.float32).ravel())
    return {name: float(np.linalg.norm(delta, axis=1).max()) for name, delta in deltas.items()}


def register(meshes):
    coordinates = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    minimum = np.array([min(point[i] for point in coordinates) for i in range(3)])
    maximum = np.array([max(point[i] for point in coordinates) for i in range(3)])
    center = np.array([(minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, minimum[2]])
    scale = 3.1 / (maximum[2] - minimum[2])
    # Register the generated body to the existing shoulder, hip, knee and ankle heights.
    source_z = [0, .32, .80, 1.16, 1.67, 2.04, 2.20, 2.29, 3.10]
    target_z = [0, .27, .67, 1.02, 1.35, 1.85, 1.97, 2.10, 3.10]
    for obj in meshes:
        matrix = obj.matrix_world.copy()
        p = np.array([matrix @ vertex.co for vertex in obj.data.vertices])
        p = (p - center) * scale
        p[:, 2] = np.interp(p[:, 2], source_z, target_z)
        chest = smooth(1.30, 1.47, p[:, 2]) * (1 - smooth(1.89, 2.03, p[:, 2]))
        chest *= 1 - smooth(.27, .42, abs(p[:, 0]))
        p[:, 1] += np.maximum(0, -p[:, 1] - .235) * .72 * chest
        obj.parent = None
        obj.matrix_world.identity()
        obj.data.vertices.foreach_set('co', p.astype(np.float32).ravel())
        obj.data.update()
    return {'sourceBounds': [minimum.tolist(), maximum.tolist()], 'scale': scale,
            'registrationZ': {'source': source_z, 'target': target_z}}


def garment_weights(obj, style):
    """A skirt follows the pelvis continuously while sleeves retain arm motion."""
    if style not in ('royal', 'urban', 'soft', 'dark'):
        return
    groups = {group.name: group for group in obj.vertex_groups}
    for vertex in obj.data.vertices:
        z = vertex.co.z
        old = {obj.vertex_groups[item.group].name: item.weight for item in vertex.groups}
        arms = sum(weight for name, weight in old.items() if name.startswith(('clavicle.', 'upper_arm.', 'forearm.', 'hand.')))
        influence = float(smooth(.93, 1.03, z) * (1 - smooth(1.20, 1.48, z)) * (1 - smooth(.05, .45, arms)))
        if influence == 0:
            continue
        follow = float(1 - smooth(1.04, 1.32, z)) * .28
        values = {name: weight * (1 - influence) for name, weight in old.items()}
        for name, weight in {'hips': 1 - follow, 'thigh.L': follow / 2, 'thigh.R': follow / 2}.items():
            values[name] = values.get(name, 0) + weight * influence
        values = dict(sorted(values.items(), key=lambda item: item[1], reverse=True)[:4])
        total = sum(values.values())
        for group in obj.vertex_groups:
            group.remove([vertex.index])
        for name, weight in values.items():
            if weight > .00001:
                groups[name].add([vertex.index], weight / total, 'REPLACE')


def garment_arm_partition(obj):
    """Surface distance follows sleeves through the shoulder instead of using x alone."""
    p = rigging.mesh_coordinates(obj.data)
    unique, inverse = np.unique(np.round(p, 6), axis=0, return_inverse=True)
    edges = set()
    for edge in obj.data.edges:
        a, b = inverse[list(edge.vertices)]
        if a != b:
            edges.add(tuple(sorted((int(a), int(b)))))
    adjacency = [[] for _ in unique]
    for a, b in edges:
        length = float(np.linalg.norm(unique[a] - unique[b]))
        adjacency[a].append((b, length))
        adjacency[b].append((a, length))
    def distances(seeds):
        distance = np.full(len(unique), np.inf)
        queue = []
        for seed in seeds:
            index = int(np.argmin(np.linalg.norm(unique - seed, axis=1)))
            distance[index] = 0
            heapq.heappush(queue, (0, index))
        while queue:
            current, index = heapq.heappop(queue)
            if current > distance[index]:
                continue
            for neighbor, length in adjacency[index]:
                cost = current + length
                if cost < distance[neighbor]:
                    distance[neighbor] = cost
                    heapq.heappush(queue, (cost, neighbor))
        return distance[inverse]
    body = distances(((0, -.25, 1.5), (0, .12, 1.5), (0, -.25, 1.1), (.25, -.1, .75), (-.25, -.1, .75)))
    arm = distances(((.59, -.10, 1.1), (-.59, -.10, 1.1), (.47, -.08, 1.53), (-.47, -.08, 1.53)))
    groups = {group.name: group for group in obj.vertex_groups}
    for vertex in obj.data.vertices:
        index = vertex.index
        if not np.isfinite(arm[index]) or vertex.co.z < .85:
            continue
        target = float(smooth(-.03, .28, body[index] - arm[index])) if np.isfinite(body[index]) else 1
        old = {obj.vertex_groups[item.group].name: item.weight for item in vertex.groups}
        rest = {name: weight for name, weight in old.items() if not name.startswith(('clavicle.', 'upper_arm.', 'forearm.', 'hand.'))}
        total = sum(rest.values())
        z = vertex.co.z
        if total > .0001 and z < 1.28:
            values = {name: weight / total * (1 - target) for name, weight in rest.items()}
        else:
            chest = float(smooth(1.43, 1.77, z))
            spine = float(smooth(1.20, 1.46, z)) * (1 - chest)
            values = {'hips': (1 - chest - spine) * (1 - target), 'spine': spine * (1 - target), 'chest': chest * (1 - target)}
        side = 'L' if vertex.co.x > 0 else 'R'
        hand = float(1 - smooth(1.13, 1.26, z))
        forearm = float(1 - smooth(1.40, 1.60, z)) * (1 - hand)
        clavicle = float(smooth(1.78, 1.96, z))
        values.update({f'hand.{side}': target * hand * (1 - clavicle),
                       f'forearm.{side}': target * forearm * (1 - clavicle),
                       f'upper_arm.{side}': target * (1 - hand - forearm) * (1 - clavicle),
                       f'clavicle.{side}': target * clavicle})
        values = dict(sorted(values.items(), key=lambda item: item[1], reverse=True)[:4])
        normalization = sum(values.values())
        for group in obj.vertex_groups:
            group.remove([index])
        for name, weight in values.items():
            if weight > .00001:
                groups[name].add([index], weight / normalization, 'REPLACE')


def original_outfit(directory, style):
    """Retain the complete source garment; BANG can omit entire dark garments."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(directory / ('source.glb' if style == 'royal' else 'original/base_basic_pbr.glb')))
    imported = [obj for obj in bpy.data.objects if obj not in before and obj.type == 'MESH']
    if len(imported) != 1:
        raise RuntimeError(f'{style}: expected one original surface, got {len(imported)}')
    obj = imported[0]
    register(imported)
    material = obj.data.materials[0]
    bsdf = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    image = bsdf.inputs['Base Color'].links[0].from_node.image
    pixels = np.empty(len(image.pixels), np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(image.size[1], image.size[0], 4)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    uv_layer = mesh.loops.layers.uv.active
    remove = []
    channels = ['skin', 'top', 'bottom', 'shoes']
    hair = next(obj for obj in bpy.data.objects if obj.get('customPart') == 'hair' and obj.get('customStyle') == style)
    hair_tree = BVHTree.FromPolygons([vertex.co for vertex in hair.data.vertices], [list(face.vertices) for face in hair.data.polygons])
    for face in mesh.faces:
        point = face.calc_center_median()
        uv = sum((loop[uv_layer].uv for loop in face.loops), Vector((0, 0))) / len(face.loops)
        ix = int(np.clip(uv.x * image.size[0], 0, image.size[0] - 1))
        iy = int(np.clip(uv.y * image.size[1], 0, image.size[1] - 1))
        r, g, b = pixels[iy, ix, :3]
        gold_hair = r > .28 and r > g * 1.08 and b < g * .88 and r - g < 2 * (g - b)
        skin = r > .35 and r > g * 1.12 and g > b * 1.05 and g > r * .54 and b > g * .70
        if point.z > 1.79 and gold_hair and hair_tree.find_nearest(point)[3] < .06:
            remove.append(face)
            continue
        channel = 'skin' if skin else 'shoes' if point.z < .29 else 'bottom' if point.z < 1.3 else 'top'
        face.material_index = channels.index(channel)
    bmesh.ops.delete(mesh, geom=remove, context='FACES')
    bmesh.ops.bisect_plane(mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces),
                           plane_co=(0, 0, 2.035), plane_no=(0, 0, 1), dist=.00001, clear_outer=True)
    bmesh.ops.delete(mesh, geom=[vertex for vertex in mesh.verts if not vertex.link_faces], context='VERTS')
    obj.data.materials.clear()
    for channel in channels:
        mat = material.copy()
        mat.name = f'custom.{channel}.{style}'
        mat['customizationChannel'] = channel
        color_reference(mat, channel, style)
        obj.data.materials.append(mat)
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.name = f'Female_{style}_outfit'
    obj['customPart'] = 'outfit'
    obj['customStyle'] = style
    return obj


def build(style, render):
    profile = PARTS[style]
    directory = ROOT / 'assets/characters/grassy/customization/models' / profile['s']
    source = directory / 'parts/base_basic_pbr.glb'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    expected = {number for numbers in profile.get('channels', {}).values() for number in numbers}
    actual = {int(obj.name.removeprefix('root.')) for obj in meshes}
    if style == 'royal' and expected != actual:
        raise RuntimeError(f'{style}: part manifest differs from source: {expected ^ actual}')
    report = register(meshes)
    if style == 'royal':
        previous = next(obj for obj in meshes if obj.name == 'root.3')
        head = original_head(directory, previous, next(obj for obj in meshes if obj.name == 'root.2'))
        meshes.remove(previous)
        bpy.data.objects.remove(previous, do_unlink=True)
        head.name = 'root.3'
        meshes.append(head)
    for obj in list(meshes):
        if int(obj.name.removeprefix('root.')) not in profile['hair'] + profile.get('body', []):
            meshes.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
    rig = rigging.make_rig()
    morph_report = {}
    for obj in meshes:
        number = int(obj.name.removeprefix('root.'))
        part = 'hair' if number in profile['hair'] else 'body' if number in profile['body'] else 'outfit'
        channel = 'hair' if style != 'royal' else next(name for name, numbers in profile['channels'].items() if number in numbers)
        obj.name = f'Female_{style}_{part}_{number}'
        obj['customPart'] = part
        obj['customStyle'] = style
        for mat in obj.data.materials:
            mat.name = f'custom.{channel}.{style}.{number}'
            mat['customizationChannel'] = channel
            color_reference(mat, channel, style)
            bsdf = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
            bsdf.inputs['Roughness'].default_value = .64
            bsdf.inputs['Metallic'].default_value = 0
        rigging.bind_surface(obj, rig)
        if part == 'hair':
            clean_hair_neck(obj)
            obj.vertex_groups.clear()
            obj.vertex_groups.new(name='head').add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        if part == 'body':
            morph_report[obj.name] = shape_keys(obj)
        if part == 'hair':
            hair_keys(obj)
            shape_keys(obj)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    if style == 'royal':
        meshes.append(build_neck(rig))
        from face import build_eyelids
        body = next(obj for obj in meshes if obj['customPart'] == 'body')
        fitting = bpy.data.objects['FemaleEyelidSurface']
        lids = build_eyelids(fitting, rig, 'game', (.15, 2.40, .112, .088, .083, .014), skin_sample_scale=.8, skin_sample_z=2.30, meeting_fraction=.5)
        bpy.data.objects.remove(fitting, do_unlink=True)
        for lid in lids:
            for name in ('Blink', 'BlinkHalf'):
                for index, vertex in enumerate(lid.data.shape_keys.key_blocks[name].data):
                    row = index % 9 if index < 33 * 9 else 8
                    blend = float(smooth(0, 5, row))
                    dome = -.355 * max(.01, 1 - (vertex.co.x / .50) ** 2) ** .5
                    vertex.co.y += min(0, dome - vertex.co.y) * blend
            lid.name = f'Female_royal_body_{lid.name}'
            lid['customPart'] = 'body'
            lid['customStyle'] = 'royal'
            morph_report[lid.name] = shape_keys(lid)
            lid.data.materials[0].name = 'custom.skin.royal.eyelid'
            lid.data.materials[0]['customizationChannel'] = 'skin'
            color_reference(lid.data.materials[0], 'skin', style)
        meshes.extend(lids)
    outfit = original_outfit(directory, style)
    rigging.bind_surface(outfit, rig)
    garment_arm_partition(outfit)
    garment_weights(outfit, style)
    meshes.append(outfit)
    if style != 'royal':
        master = ROOT / 'assets/characters/grassy/customization/models/s1/female-royal.blend'
        with bpy.data.libraries.load(str(master), link=False) as (available, selected):
            selected.objects = [name for name in available.objects if name.startswith('Female_royal_body')]
        for obj in selected.objects:
            bpy.context.collection.objects.link(obj)
            obj.parent = rig
            for modifier in obj.modifiers:
                if modifier.type == 'ARMATURE':
                    modifier.object = rig
            obj.name = f'Female_{style}_body'
            meshes.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    exported = meshes if style == 'royal' else [obj for obj in meshes if obj['customPart'] != 'body']
    for obj in [rig, *exported]:
        obj.select_set(True)
    for image in bpy.data.images:
        width, height = image.size
        if max(width, height) > 1024:
            ratio = 1024 / max(width, height)
            image.scale(round(width * ratio), round(height * ratio))
    bpy.context.view_layer.objects.active = rig
    output = ROOT / 'public/characters/human/customization' / f'female-{style}.glb'
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=False, export_animations=False, export_skins=True,
        export_all_influences=False, export_extras=True, export_morph=True,
        export_image_format='AUTO', export_lights=False, export_cameras=False)
    report.update({'style': style, 'bones': len(rig.data.bones), 'morphs': morph_report,
        'parts': [{'name': obj.name, 'part': obj['customPart'], 'vertices': len(obj.data.vertices),
                   'materials': [mat.name for mat in obj.data.materials]} for obj in meshes],
        'bytes': output.stat().st_size})
    (directory / 'export-report.json').write_text(json.dumps(report, indent=2) + '\n')
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(directory / f'female-{style}.blend'))
    if render:
        studio = rigging.studio
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.render.threads_mode, scene.render.threads = 'FIXED', 4
        scene.cycles.use_denoising = True
        scene.view_settings.view_transform = 'Standard'
        scene.render.film_transparent = True
        studio.studio()
        for view in ('front', 'right', 'back'):
            studio.render(view, 'full', directory / f'registered-{view}.png', 16)
        if style == 'royal':
            for obj in lids:
                obj.data.shape_keys.key_blocks['Blink'].value = 1
            studio.render('front', 'head', directory / 'blink-closed.png', 16)
            for extreme in (-1, 1):
                for obj in meshes:
                    if obj.data.shape_keys is None:
                        continue
                    for key in obj.data.shape_keys.key_blocks:
                        if key.name in MORPHS or key.name in [name + 'Blink' for name in MORPHS]:
                            key.value = extreme
                studio.render('front', 'head', directory / f'face-extreme-{extreme}.png', 16)
            for obj in meshes:
                if obj.data.shape_keys:
                    for key in obj.data.shape_keys.key_blocks:
                        key.value = 0
    print('FEMALE_READY', output, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--style', required=True, choices=PARTS)
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    build(args.style, args.render)
