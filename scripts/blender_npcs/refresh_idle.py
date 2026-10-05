"""Refresh only idle and add a local eyelid morph to the approved Rodin mesh.

Blender --background --python scripts/blender_npcs/refresh_idle.py -- \
    --kind sam --output /private/tmp/sam-idle-candidate

Inspect the candidate renders before promoting its blend and GLB to production.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from animation import CLIP_FRAMES, _idle
from build import export
from rebake_actions import action_fingerprint

# Registered on the approved Rodin mesh, facing -Y, in Blender world units.
EYES = {'sam': ((-.148, 2.137), (.148, 2.137)),
        'tibo': ((-.154, 2.121), (.123, 2.121))}


def rest_fingerprint(obj, rig, counts):
    mesh = obj.data
    vertices, polygons, loops = counts
    values = {
        'vertices': [tuple(v.co) for v in list(mesh.vertices)[:vertices]],
        'faces': [tuple(p.vertices) for p in list(mesh.polygons)[:polygons]],
        'uv': [[tuple(v.uv) for v in list(layer.data)[:loops]] for layer in mesh.uv_layers],
        'weights': [[(g.group, g.weight) for g in v.groups] for v in list(mesh.vertices)[:vertices]],
        'groups': [g.name for g in obj.vertex_groups],
        'bones': [(b.name, tuple(map(tuple, b.matrix_local))) for b in rig.data.bones],
        'objectMatrix': tuple(map(tuple, obj.matrix_world)),
        'rigMatrix': tuple(map(tuple, rig.matrix_world)),
        'materials': [m.name for m in mesh.materials],
        'textures': [(i.name, hashlib.sha256(i.packed_file.data).hexdigest())
                     for i in bpy.data.images if i.packed_file],
    }
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()


def make_blink(obj, kind):
    if obj.data.shape_keys is not None:
        keys = obj.data.shape_keys.key_blocks
        return keys['Blink'], keys['BlinkTravel'], 0
    mesh = obj.data
    surface = BVHTree.FromPolygons([v.co for v in mesh.vertices],
                                   [p.vertices for p in mesh.polygons])
    source_uv = mesh.uv_layers.active.data

    def sample(x, z):
        point, _, index, _ = surface.ray_cast(Vector((x, -3, z)), Vector((0, 1, 0)))
        if point is None:
            raise ValueError(f'{kind}: eyelid projection missed the original face at {x}, {z}')
        face = mesh.polygons[index]
        corners = [mesh.vertices[i].co for i in face.vertices]
        weights = barycentric_transform(point, *corners,
                                         Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        uv = sum((source_uv[i].uv * w for i, w in zip(face.loop_indices, weights)), Vector((0, 0)))
        skin = {}
        for i, weight in zip(face.vertices, weights):
            for group in mesh.vertices[i].groups:
                name = obj.vertex_groups[group.group].name
                skin[name] = skin.get(name, 0) + group.weight * weight
        return point, uv, skin

    positions, closed, travel, uvs, skin_weights, faces = [], [], [], [], [], []
    rows = (0, .2, .4, .6, .8, .97, 1)
    for cx, cz in EYES[kind]:
        for upper in (True, False):
            start = len(positions)
            for column in range(33):
                u = column / 32 * 2 - 1
                outward = u * (1 if cx > 0 else -1)
                radius = (.086 if outward > 0 else .073) if kind == 'sam' else .085
                x, arch = cx + u * radius, math.sqrt(max(0, 1 - u * u))
                line = cz + .009 * outward + .004 * (1 - u * u)
                rim = line + ((.084 if kind == 'sam' else .082) if upper else -.029) * arch
                for row, v in enumerate(rows):
                    open_z = rim + (-1 if upper else 1) * .0008 * v * arch
                    closed_z = rim + (line - rim) * v
                    position, _, skin = sample(x, open_z)
                    target, _, _ = sample(x, closed_z)
                    position.y -= .0015
                    target.y -= .004 if upper else .003
                    # The lid travels over the eye instead of cutting through its convex surface.
                    correction = 0
                    for fraction in (.2, .4, .6, .8):
                        middle, _, _ = sample(x, open_z + (closed_z - open_z) * fraction)
                        clearance = .003
                        delta = middle.y - clearance - (position.y * (1 - fraction) + target.y * fraction)
                        correction = min(correction, delta / (4 * fraction * (1 - fraction)))
                    tx = .15 + u * .045 if kind == 'sam' else u * .032
                    tz = 2.101 - .016 * v if kind == 'sam' else 2.228 - .040 * v
                    if upper and row == len(rows) - 1:
                        tx, tz = (-.02, 2.033) if kind == 'sam' else (-.154, 2.14)
                    _, uv, _ = sample(tx, tz)
                    positions.append(position)
                    closed.append(target)
                    travel.append(correction)
                    uvs.append(uv)
                    skin_weights.append(skin)
                if column:
                    for row in range(len(rows) - 1):
                        a = start + (column - 1) * len(rows) + row
                        b = start + column * len(rows) + row
                        faces.append((a, a + 1, b + 1, b) if upper else (a, b, b + 1, a + 1))
    lids = bpy.data.meshes.new('EyelidSurface')
    lids.from_pydata(positions, [], faces)
    lids.materials.append(mesh.materials[0])
    layer = lids.uv_layers.new(name=mesh.uv_layers.active.name)
    for face in lids.polygons:
        face.use_smooth = True
        for loop in face.loop_indices:
            layer.data[loop].uv = uvs[lids.loops[loop].vertex_index]
    eyelids = bpy.data.objects.new('EyelidSurface', lids)
    bpy.context.collection.objects.link(eyelids)
    for group in obj.vertex_groups:
        eyelids.vertex_groups.new(name=group.name)
    for index, weights in enumerate(skin_weights):
        for name, weight in weights.items():
            eyelids.vertex_groups[name].add([index], weight, 'REPLACE')
    original_count = len(mesh.vertices)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    eyelids.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    obj.shape_key_add(name='Basis', from_mix=False)
    blink = obj.shape_key_add(name='Blink', from_mix=False)
    arc = obj.shape_key_add(name='BlinkTravel', from_mix=False)
    for index, target in enumerate(closed):
        blink.data[original_count + index].co = target
        arc.data[original_count + index].co.y += travel[index]
    obj['eyelid_original_vertices'] = original_count
    return blink, arc, len(positions)


def refresh_action(rig, blink, arc, kind):
    action = bpy.data.actions['idle']
    rig.animation_data.action = action
    rig.animation_data.action_slot = next(slot for slot in action.slots if slot.target_id_type == 'OBJECT')
    for frame in range(1, CLIP_FRAMES['idle'] + 2):
        for bone in rig.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
        _idle(rig.pose.bones, (frame - 1) / CLIP_FRAMES['idle'] * math.tau, kind)
        for bone in rig.pose.bones:
            for path in ('location', 'rotation_euler', 'scale'):
                bone.keyframe_insert(data_path=path, frame=frame, group=bone.name)
    keys = blink.id_data
    keys.animation_data_create()
    keys.animation_data.action = action
    slot = next((slot for slot in action.slots if slot.target_id_type == 'KEY'), None)
    if slot is None:
        slot = action.slots.new('KEY', keys.name)
    keys.animation_data.action_slot = slot
    # A quick close, short contact and slower reopening reads as a blink, not a squint.
    offset = 5 if kind == 'tibo' else 0
    for frame in range(1, CLIP_FRAMES['idle'] + 2):
        blink.value = max(0, min(1, (frame - 39 - offset) / 3, (49 + offset - frame) / 5))
        arc.value = 4 * blink.value * (1 - blink.value)
        blink.keyframe_insert(data_path='value', frame=frame, group='Eyelids')
        arc.keyframe_insert(data_path='value', frame=frame, group='Eyelids')
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = 'LINEAR'
    for track in list(keys.animation_data.nla_tracks):
        keys.animation_data.nla_tracks.remove(track)
    track = keys.animation_data.nla_tracks.new()
    track.name = 'idle'
    strip = track.strips.new('idle', 1, action)
    strip.action_slot = slot
    strip.action_frame_start, strip.action_frame_end = 1, 121
    track.mute = True
    keys.animation_data.action = None
    rig.animation_data.action = None
    return action, slot


def reset_pose(rig, blink, arc):
    rig.animation_data.action = None
    blink.id_data.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    blink.value = arc.value = 0
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def render_eyes(scene, rig, blink, arc, kind, output):
    scene.render.resolution_x, scene.render.resolution_y = 768, 512
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 32
    camera = scene.camera
    center_z = 2.155 if kind == 'sam' else 2.140
    camera.location = (0, -4, center_z)
    camera.rotation_euler = (Vector((0, 0, center_z)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = .85
    rig.data.pose_position = 'REST'
    for name, value in (('open', 0), ('half', .5), ('closed', 1)):
        blink.value = value
        arc.value = 4 * value * (1 - value)
        scene.render.filepath = str(output / f'eyes-{name}.png')
        bpy.ops.render.render(write_still=True)
    rig.data.pose_position = 'POSE'
    reset_pose(rig, blink, arc)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--kind', choices=tuple(EYES), required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    kind, output = args.kind, args.output
    source = ROOT / f'assets/characters/{kind}/{kind}-rigged.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig, obj = bpy.data.objects[f'{kind.title()}Rig'], bpy.data.objects['model']
    counts = (len(obj.data.vertices), len(obj.data.polygons), len(obj.data.loops))
    original = rest_fingerprint(obj, rig, counts)
    preserved = {a.name: action_fingerprint(a) for a in bpy.data.actions if a.name != 'idle'}
    blink, arc, added = make_blink(obj, kind)
    refresh_action(rig, blink, arc, kind)
    reset_pose(rig, blink, arc)
    if rest_fingerprint(obj, rig, counts) != original:
        raise ValueError(f'{kind}: refreshing idle changed the approved rest mesh or binding')
    if any(action_fingerprint(bpy.data.actions[name]) != value for name, value in preserved.items()):
        raise ValueError(f'{kind}: refreshing idle changed another action')
    output.mkdir(parents=True, exist_ok=True)
    # Preserve the approved studio when saving the candidate; diagnostic framing is temporary.
    bpy.ops.wm.save_as_mainfile(filepath=str(output / f'{kind}-rigged.blend'))
    export(kind, [obj], rig, output)
    report = {
        'kind': kind, 'source': str(source), 'restSha256': original,
        'preservedClipSha256': preserved, 'originalVertexCount': counts[0], 'addedEyelidVertices': added,
        'eyeClosureCentersXZ': EYES[kind], 'morphs': ['Blink', 'BlinkTravel'],
        'idleSeconds': 4, 'blinkClosedFrames': [47, 49] if kind == 'tibo' else [42, 44],
        'originalGeometryUvWeightsAndTexturesUnchanged': True,
        'newEyelidWeights': 'Barycentric interpolation from original eye-rim triangles',
        'sourceTextureImagesUnchanged': True,
    }
    (output / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    render_eyes(bpy.context.scene, rig, blink, arc, kind, output)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
