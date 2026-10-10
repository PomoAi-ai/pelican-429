"""Derive a customizable male surface without changing the equipped source."""
import json
import sys
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
import scene as studio

OUT = ROOT / 'assets/characters/grassy/customization/models/male'
GLB = ROOT / 'public/characters/human/customization/male.glb'
FACE_KEYS = ('FaceWidth', 'FaceLength', 'JawWidth', 'ChinLength', 'EyeSize',
             'EyeSpacing', 'NoseSize', 'MouthWidth')
HAIR_KEYS = ('HairFrontSway', 'HairFrontLift', 'HairCrownSway', 'HairCrownLift',
             'HairRearSway', 'HairRearLift', 'HairTurn')


def smooth(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def coordinates(points):
    data = np.empty(len(points) * 3, np.float32)
    points.foreach_get('co', data)
    return data.reshape(-1, 3)


def deform(points, name):
    result = points.copy()
    x, y, z = points.T
    face = smooth(1.96, 2.13, z) * (1 - smooth(2.57, 2.80, z))
    front = 1 - smooth(-0.13, 0.03, y)
    if name == 'FaceWidth':
        result[:, 0] += x * .08 * face
    elif name == 'FaceLength':
        result[:, 2] += (z - 2.47) * .09 * face
    elif name == 'JawWidth':
        result[:, 0] += x * .12 * face * (1 - smooth(2.18, 2.38, z))
    elif name == 'ChinLength':
        result[:, 2] -= .035 * face * (1 - smooth(2.13, 2.29, z)) * front
    elif name in ('EyeSize', 'EyeSpacing'):
        centers = np.sign(x) * .168
        # A flat inner plateau moves the painted eye and its entire eyelid together.
        eye = (1 - smooth(.115, .18, abs(x - centers))) * (1 - smooth(.10, .17, abs(z - 2.356))) * front
        if name == 'EyeSize':
            result[:, 0] += (x - centers) * .10 * eye
            result[:, 2] += (z - 2.356) * .10 * eye
        else:
            result[:, 0] += np.sign(x) * .017 * eye
    elif name == 'NoseSize':
        nose = (1 - smooth(.035, .095, abs(x))) * (1 - smooth(.025, .085, abs(z - 2.255))) * front
        result[:, 0] += x * .16 * nose
        result[:, 1] -= .018 * nose
    elif name == 'MouthWidth':
        mouth = (1 - smooth(.095, .17, abs(x))) * (1 - smooth(.025, .07, abs(z - 2.157))) * front
        result[:, 0] += x * .16 * mouth
    return result


def add_morphs(obj):
    if obj.data.shape_keys is None:
        obj.shape_key_add(name='Basis')
    keys = obj.data.shape_keys.key_blocks
    basis = coordinates(keys['Basis'].data)
    blink = {name: coordinates(keys[name].data) for name in ('Blink', 'BlinkHalf') if name in keys}
    for name in FACE_KEYS:
        transformed = deform(basis, name)
        key = obj.shape_key_add(name=name)
        key.value = 0
        key.slider_min, key.slider_max = -1, 1
        key.data.foreach_set('co', transformed.ravel())
        for blink_name, closed in blink.items():
            corrective = obj.shape_key_add(name=name + blink_name)
            corrective.value = 0
            corrective.slider_min, corrective.slider_max = -1, 1
            # Additive morph composition needs the change of the blink delta too.
            corrective.data.foreach_set('co', (basis + deform(closed, name) - closed - transformed + basis).ravel())


def add_hair_morphs(obj):
    """Bake the existing grassy-rig.ts free-strand guides into the replacement."""
    basis = coordinates(obj.data.shape_keys.key_blocks['Basis'].data)
    # Existing runtime guides use glTF Y-up; Blender geometry uses Z-up.
    points = basis[:, [0, 2, 1]].copy()
    points[:, 2] *= -1
    guides = [
        ((-.182, 2.812, .45), (-.25, 2.70, .51), .054, 0, .19),
        ((.214, 2.812, .367), (.286, 2.73, .418), .043, 2, .17),
        ((-.35, 2.85, -.08), (-.437, 2.778, -.087), .05, 1, .2),
        ((.325, 2.895, -.042), (.43, 2.82, -.08), .058, 0, .18),
        ((-.152, 2.975, -.138), (-.25, 3.02, -.10), .054, 2, .21),
        ((-.105, 2.417, -.438), (-.105, 2.29, -.46), .061, 0, .18),
        ((.105, 2.417, -.438), (.105, 2.29, -.46), .061, 2, .17),
        ((0, 2.547, -.495), (0, 2.42, -.54), .072, 1, .19),
        ((.005, 2.72, -.47), (.005, 2.57, -.53), .065, 2, .2),
    ]
    directions = np.array(((0, 0, -1), (0, 1, -.35), (1, 0, 0)), dtype=float)
    directions /= np.linalg.norm(directions, axis=1)[:, None]
    offsets = np.zeros((7, len(points), 3), np.float32)
    total = np.zeros(len(points))
    for root, tip, radius, group, bend in guides:
        axis = np.array(tip) - root
        length = np.linalg.norm(axis)
        axis /= length
        local = points - root
        along = local @ axis
        progress = along / length
        distance = np.linalg.norm(local - along[:, None] * axis, axis=1) / radius
        weight = smooth(0, .2, progress) * (1 - smooth(1, 1.25, progress)) * (1 - smooth(.25, 1, distance))
        total += weight
        for channel, direction in enumerate(directions):
            rotation = np.cross(axis, direction)
            strength = np.linalg.norm(rotation)
            rotation /= strength
            angle = bend * smooth(0, .85, progress) * strength * (.55 if channel == 2 else 1)
            cosine, sine = np.cos(angle)[:, None], np.sin(angle)[:, None]
            turned = local * cosine + np.cross(rotation, local) * sine + (local @ rotation)[:, None] * rotation * (1 - cosine)
            slot = 6 if channel == 2 else group * 2 + channel
            offsets[slot] += (turned - local) * weight[:, None]
    offsets /= np.maximum(total, 1)[None, :, None]
    x, y, z = points.T
    blend = (1 - smooth(.65, 1, np.hypot(x - .025, z - .14) / .13)) * (y > 2.94)
    height = y - 2.94
    bend = smooth(2.94, 3.10, y)
    for group in range(3):
        for channel in range(2):
            slot = group * 2 + channel
            angle = (-.85 if channel == 0 else .60) * bend
            from_root = z - (.24 if channel == 1 else .14)
            dy = height * (np.cos(angle) - 1) - from_root * np.sin(angle) if group == 1 else np.zeros(len(points))
            dz = height * np.sin(angle) + from_root * (np.cos(angle) - 1) if group == 1 else np.zeros(len(points))
            offsets[slot, :, 1] += (dy - offsets[slot, :, 1]) * blend
            offsets[slot, :, 2] += (dz - offsets[slot, :, 2]) * blend
    for name, delta in zip(HAIR_KEYS, offsets):
        local_delta = delta[:, [0, 2, 1]].copy()
        local_delta[:, 1] *= -1
        key = obj.shape_key_add(name=name)
        key.value = 0
        key.slider_min, key.slider_max = -2, 2
        key.data.foreach_set('co', (basis + local_delta).ravel())


def partition_materials(obj):
    mesh = obj.data
    original = mesh.materials[0]
    shader = next(n for n in original.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    atlas = shader.inputs['Base Color'].links[0].from_node.image
    pixels = np.empty(len(atlas.pixels), np.float32)
    atlas.pixels.foreach_get(pixels)
    pixels = pixels.reshape(atlas.size[1], atlas.size[0], 4)
    channels = ('skin', 'hair', 'top', 'bottom', 'shoes')
    for channel in channels:
        material = original.copy()
        material.name = 'custom.' + channel
        material['customizationChannel'] = channel
        mesh.materials.append(material)
    counts = dict.fromkeys(('fixed', *channels), 0)
    uv = mesh.uv_layers.active.data
    for polygon in mesh.polygons:
        xyz = np.mean([mesh.vertices[v].co[:] for v in polygon.vertices], axis=0)
        samples = np.array([uv[i].uv[:] for i in polygon.loop_indices])
        rgb = pixels[np.clip((samples[:, 1] * atlas.size[1]).astype(int), 0, atlas.size[1] - 1),
                     np.clip((samples[:, 0] * atlas.size[0]).astype(int), 0, atlas.size[0] - 1), :3].mean(axis=0)
        x, y, z = xyz
        r, g, b = rgb
        channel = 'fixed'
        if z < .29:
            channel = 'shoes'
        elif z < 1.30 and b > r * 1.08:
            channel = 'bottom'
        elif z < 2.03 and z > 1.13 and r > g * 1.8 and r > b * 1.8:
            channel = 'top'
        elif z > 2.04 and (z > 2.50 or y > -.06 or abs(x) > .38) and r < .55 and g < .39:
            channel = 'hair'
        elif z > .82 and r > .35 and r > g * 1.10 and g > b * 1.08:
            channel = 'skin'
        polygon.material_index = 0 if channel == 'fixed' else channels.index(channel) + 1
        counts[channel] += 1
    for channel in channels:
        if counts[channel] == 0:
            raise RuntimeError(f'Missing male material region {channel}')
    return counts


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/characters/grassy/model-equipped/grassy-equipped-game.blend'))
    rig = bpy.data.objects['GrassyRodinRig']
    body = bpy.data.objects['grassy-rodin-refined-game']
    surfaces = [body] + [o for o in bpy.context.scene.objects if o.name.startswith('Eyelid')]
    for obj in list(bpy.context.scene.objects):
        if obj not in surfaces and obj != rig:
            bpy.data.objects.remove(obj, do_unlink=True)
    rig.animation_data_clear()
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    counts = partition_materials(body)
    for obj in surfaces:
        obj['customPart'] = 'body'
        obj.animation_data_clear()
        if obj != body:
            obj.data.materials[0]['customizationChannel'] = 'skin'
            obj.data.materials[0].name = 'custom.skin.eyelids'
        add_morphs(obj)
    add_hair_morphs(body)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=True,
                              export_animations=False, export_extras=True, export_morph=True,
                              export_skins=True, export_yup=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'Standard'
    scene.render.film_transparent = True
    studio.studio()
    for view in ('front', 'right'):
        studio.render(view, 'full', OUT / f'{view}.png', 16)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'male.blend'))
    (OUT / 'contract.json').write_text(json.dumps({'source': 'grassy-equipped-game.blend',
        'faceTargets': list(FACE_KEYS), 'hairTargets': list(HAIR_KEYS), 'range': [-1, 1], 'neutral': 0,
        'materialPolygons': counts, 'bones': [b.name for b in rig.data.bones],
        'blinkCorrectives': 'FaceTarget + Blink or BlinkHalf; weight is faceWeight * blinkWeight'}, indent=2) + '\n')
    # Inspect region boundaries in an intentionally exaggerated recolor.
    palette = {'skin': (.70, .90, 1), 'hair': (1, .45, .20),
               'top': (.10, .60, 1), 'bottom': (1, .30, .15), 'shoes': (.25, 1, .25)}
    for material in bpy.data.materials:
        channel = material.get('customizationChannel')
        if channel in palette:
            shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            source = shader.inputs['Base Color'].links[0].from_socket
            mix = material.node_tree.nodes.new('ShaderNodeMixRGB')
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1
            mix.inputs[2].default_value = (*palette[channel], 1)
            material.node_tree.links.new(source, mix.inputs[1])
            material.node_tree.links.new(mix.outputs[0], shader.inputs['Base Color'])
    for obj in surfaces:
        for name in FACE_KEYS:
            obj.data.shape_keys.key_blocks[name].value = 1
        keys = obj.data.shape_keys.key_blocks
        if 'Blink' in keys:
            keys['Blink'].value = 1
            for name in FACE_KEYS:
                keys[name + 'Blink'].value = 1
    studio.render('front', 'full', OUT / 'customization-extreme.png', 16)
    for obj in surfaces:
        for key in obj.data.shape_keys.key_blocks:
            key.value = 0


if __name__ == '__main__':
    main()
