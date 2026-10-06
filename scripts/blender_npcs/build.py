"""Normalize, skin and export the two NPCs from approved static Rodin GLB sources.

Run with Blender --background --python scripts/blender_npcs/build.py -- --kind sam.
The imported source is retained separately; exports and editable scenes are local assets.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from animation import CLIP_FRAMES, PROPORTIONS, bake_actions, build_armature, joint_positions
from studio import render_views, setup_studio

HEIGHTS = {'sam': 2.7, 'tibo': 2.65}


def vertices_world(objects):
    return np.asarray([tuple(obj.matrix_world @ vertex.co)
                       for obj in objects for vertex in obj.data.vertices])


def mesh_coordinates(mesh):
    coordinates = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get('co', coordinates)
    return coordinates.reshape(-1, 3)


def normalize(objects, kind, height):
    points = vertices_world(objects)
    if not len(points) or not np.isfinite(points).all():
        raise ValueError(f'{kind}: Rodin source has empty or non-finite vertex coordinates')
    lo, hi = points.min(axis=0), points.max(axis=0)
    source_height = hi[2] - lo[2]
    if not math.isfinite(source_height) or source_height <= 0:
        raise ValueError('Imported NPC source has no finite positive height')
    # A lateral tail must not move the character's standing center away from its feet.
    feet = points[points[:, 2] < lo[2] + source_height * .09]
    center_x = (feet[:, 0].min() + feet[:, 0].max()) / 2
    torso = points[(points[:, 2] > lo[2] + source_height * .44)
                   & (points[:, 2] < lo[2] + source_height * .54)
                   & (np.abs(points[:, 0] - center_x) < source_height * .065)]
    if not len(torso):
        raise ValueError(f'{kind}: Rodin source has no central torso section; inspect orientation before binding')
    center_y = sum(np.quantile(torso[:, 1], (.02, .98))) / 2
    transform = Matrix.Scale(height / source_height, 4) @ Matrix.Translation(
        Vector((-center_x, -center_y, -lo[2])))
    for obj in objects:
        world = transform @ obj.matrix_world
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(world)
        obj.data.update()


def reduce_geometry(objects, target=60000):
    triangles = sum(len(poly.vertices) - 2 for obj in objects for poly in obj.data.polygons)
    if triangles <= target:
        return
    ratio = target / triangles
    for obj in objects:
        if len(obj.data.polygons) < 100:
            continue
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new('Game geometry', 'DECIMATE')
        modifier.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def calibrate_shape(objects, kind, height):
    """Fit measured head and tail landmarks while leaving each source GLB untouched."""
    for obj in objects:
        points = mesh_coordinates(obj.data)
        z = points[:, 2].copy()
        if kind == 'tibo':
            vertical = smooth(1.35, 1.62, z)
            head = smooth(1.62, 1.72, z)
            points[:, 0] += head * (.10 * points[:, 0] - .015)
            points[:, 1] += head * (-.02 * points[:, 1] + .01)
            points[:, 2] += vertical * (height - z) * (1 - .92432)
        else:
            head = smooth(1.73, 1.85, z)
            tail = smooth(.25, .34, points[:, 1]) * (1 - smooth(1.00, 1.12, z))
            arm = smooth(.10 * height, .15 * height, np.abs(points[:, 0]))
            arm *= smooth(.30 * height, .34 * height, z) * (1 - smooth(.60 * height, .64 * height, z))
            arm *= 1 - smooth(.075 * height, .10 * height, points[:, 1])
            points[:, 0] *= 1 - .03 * head + .03 * tail + .025 * arm
            points[:, 1] += head * (.055 * points[:, 1] - .0209)
            points[:, 1] += tail * (.23 - points[:, 1]) * .13
            points[:, 2] += head * (height - z) * (1 - 1.01874)
        obj.data.vertices.foreach_set('co', points.ravel())
        obj.data.update()


def smooth(a, b, values):
    t = np.clip((values - a) / (b - a), 0, 1)
    t = t * t * (3 - 2 * t)
    return t


def skin_weights(points, kind, height, bone_names):
    """Spatial partitions for the v5 static Rodin surface; head protection comes first."""
    positions = points / height
    x, y, z = np.abs(positions[:, 0]), positions[:, 1], positions[:, 2]
    p = PROPORTIONS[kind]
    weights = {name: np.zeros(len(points)) for name in bone_names}
    head = smooth(p['head'] - .01, p['head'] + .018, z)
    weights['head'] = head
    available = 1 - head
    if kind == 'sam':
        tail = smooth(p['tail_y'] + .01, p['tail_y'] + .04, y)
        tail *= 1 - smooth(p['tail_z'], p['tail_z'] + .045, z)
        weights['tail'] = available * tail
        available *= 1 - tail
    if kind == 'tibo':
        # The inner sleeve wraps around the torso in depth. A flat X cutoff
        # freezes its rear surface and stretches it into a sheet when the paw rises.
        body_x = np.interp(z, (.38, .46, .54, .624), (.133, .145, .13, .105))
        body_y = np.interp(z, (.38, .46, .54, .624), (.102, .108, .105, .08))
        rounded = body_x * np.sqrt(np.maximum(.05, 1 - (y / body_y) ** 2))
        edge = np.where(z < .395, .135, np.maximum(.12, rounded))
        width = .015
        arm_floor = smooth(.21, .23, z)
    else:
        body_x = np.interp(z, (.42, .50, .605), (.112, .116, .09))
        body_y = np.interp(z, (.42, .50, .605), (.083, .085, .069))
        rounded = body_x * np.sqrt(np.maximum(.05, 1 - (y / body_y) ** 2))
        paw_edge = np.interp(z, (.32, .34, .36, .42), (.11, .111, .101, .104))
        edge = np.where(z < .425, paw_edge, np.maximum(.087, rounded))
        width = np.where(z < .425, .007, .013)
        arm_floor = smooth(.30, .315, z)
    arm = smooth(edge, edge + width, x)
    arm *= arm_floor
    arm *= 1 - smooth(p['shoulder'] - .01, p['head'] - .015, z)
    arm *= available
    leg = (1 - smooth(p['hips'] - .025, p['hips'] + .055, z)) * (available - arm)
    if kind == 'sam':
        # The tail socket belongs to the pelvis, including the transition before
        # full tail influence; otherwise the passing thigh drags it into a web.
        socket = smooth(.06, .08, y) * smooth(.13, .16, z) * (1 - smooth(.40, .43, z))
        leg *= 1 - socket
    # The connected crotch follows the pelvis instead of switching thighs at X=0.
    crotch = .295 if kind == 'sam' else .265
    pelvis = smooth(crotch - .03, crotch + .015, z) * (1 - smooth(.012, .09, x))
    leg *= 1 - pelvis
    upper_leg = smooth(crotch - .07, crotch - .015, z)
    left_leg = ((positions[:, 0] >= 0) * (1 - upper_leg)
                + smooth(-.025, .025, positions[:, 0]) * upper_leg)
    torso = available - arm - leg
    spine = smooth(p['hips'], p['hips'] + .13, z)
    weights['spine'] = torso * spine
    weights['hips'] = torso * (1 - spine)
    for side, side_mask in (('L', positions[:, 0] >= 0), ('R', positions[:, 0] < 0)):
        arm_amount = arm * side_mask
        leg_amount = leg * (left_leg if side == 'L' else 1 - left_leg)
        hand = 1 - smooth(p['wrist'] - .01, p['wrist'] + .025, z)
        forearm = (1 - smooth(p['elbow'] - .03, p['elbow'] + .03, z)) * (1 - hand)
        weights[f'hand.{side}'] = arm_amount * hand
        weights[f'forearm.{side}'] = arm_amount * forearm
        weights[f'upper_arm.{side}'] = arm_amount * (1 - hand - forearm)
        foot = 1 - smooth(p['ankle'] + .025, p['ankle'] + .055, z)
        thigh = smooth(p['knee'] - .035, p['knee'] + .04, z) * (1 - foot)
        weights[f'foot.{side}'] = leg_amount * foot
        weights[f'thigh.{side}'] = leg_amount * thigh
        weights[f'shin.{side}'] = leg_amount * (1 - foot - thigh)
    result = np.stack([weights[name] for name in bone_names], axis=1)
    # Match the four-joint glTF skinning contract before both preview and export.
    np.put_along_axis(result, np.argsort(result, axis=1)[:, :-4], 0, axis=1)
    result /= result.sum(axis=1)[:, None]
    return result


def bind_rodin_meshes(objects, rig, kind, height):
    bone_names = [bone.name for bone in rig.data.bones]
    reports = []
    for obj in objects:
        points = mesh_coordinates(obj.data)
        weights = skin_weights(points, kind, height, bone_names)
        for column, name in enumerate(bone_names):
            group = obj.vertex_groups.new(name=name)
            for index in np.flatnonzero(weights[:, column] > 0):
                group.add([int(index)], float(weights[index, column]), 'REPLACE')
        obj.parent = rig
        modifier = obj.modifiers.new('NPC skeleton', 'ARMATURE')
        modifier.object = rig
        modifier.use_deform_preserve_volume = False
        reports.append({'mesh': obj.name, 'vertices': len(points),
                        'maximumInfluences': int(np.count_nonzero(weights, axis=1).max()),
                        'normalizationMaxError': float(np.abs(weights.sum(axis=1) - 1).max())})
    return reports


def shoe_soles(objects, kind, height):
    points = np.concatenate([mesh_coordinates(obj.data) for obj in objects])
    soles = {}
    for side, sign in (('L', 1), ('R', -1)):
        soles[side] = points[(points[:, 0] * sign > height * .015) & (points[:, 2] < height * .025)]
        if not len(soles[side]):
            raise ValueError(f'{kind}: {side} shoe has no sole vertices near the ground')
    return soles


def measure_walk(objects, rig, actions, height):
    """Measure the exported linear deformation against the actual sole vertices."""
    originals = [mesh_coordinates(obj.data) for obj in objects]
    masks = [{side: (points[:, 0] * sign > height * .015) & (points[:, 2] < height * .025)
              for side, sign in (('L', 1), ('R', -1))} for points in originals]
    rig.animation_data.action = actions['walk']
    rig.animation_data.action_slot = actions['walk'].slots[0]
    support_error, minimum, loop_error = 0, float('inf'), 0
    first = []
    duration = CLIP_FRAMES['walk']
    for frame in range(1, duration + 2):
        bpy.context.scene.frame_set(frame)
        graph = bpy.context.evaluated_depsgraph_get()
        sole_heights = {'L': [], 'R': []}
        for index, obj in enumerate(objects):
            evaluated = obj.evaluated_get(graph)
            mesh = evaluated.to_mesh()
            points = mesh_coordinates(mesh)
            evaluated.to_mesh_clear()
            if frame == 1:
                first.append(points.copy())
            if frame == duration + 1:
                loop_error = max(loop_error, float(np.linalg.norm(points - first[index], axis=1).max()))
            for side in ('L', 'R'):
                sole = points[masks[index][side], 2]
                if len(sole):
                    sole_heights[side].append(float(sole.min()))
        for side, offset in (('L', 0), ('R', .5)):
            lowest = min(sole_heights[side])
            minimum = min(minimum, lowest)
            if ((frame - 1) / duration + offset) % 1 < .60:
                support_error = max(support_error, abs(lowest))
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(1)
    return {'minimumSoleZ': minimum, 'supportFootMaximumGroundError': support_error,
            'loopEndpointMaximumVertexDifference': loop_error}


def export(kind, objects, rig, out):
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(out / f'{kind}.glb'), export_format='GLB', use_selection=True,
        export_yup=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_anim_slide_to_zero=True,
        export_skins=True, export_materials='EXPORT', export_apply=False, export_extras=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--kind', choices=tuple(HEIGHTS), required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    kind = args.kind
    height = HEIGHTS[kind]
    source_dir = ROOT / 'assets/characters' / kind
    source = source_dir / 'source.glb'
    if not source.is_file():
        raise FileNotFoundError(f'{kind}: approved textured source is required: {source}')
    out = ROOT / 'public/characters' / kind
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not objects:
        raise ValueError(f'{kind}: source has no mesh: {source}')
    if any(obj.type == 'ARMATURE' for obj in bpy.context.scene.objects):
        raise ValueError(f'{kind}: expected a static Rodin source, but imported an existing armature')
    for obj in objects:
        if not obj.data.uv_layers or not obj.data.materials:
            raise ValueError(f'{kind}: {obj.name} is missing the Rodin source UVs or materials')
        if not any(mat and mat.use_nodes and any(node.type == 'TEX_IMAGE' and node.image
                   for node in mat.node_tree.nodes) for mat in obj.data.materials):
            raise ValueError(f'{kind}: {obj.name} has no loaded Rodin texture image')
    normalize(objects, kind, height)
    calibrate_shape(objects, kind, height)
    reduce_geometry(objects)
    rig = build_armature(kind, height, joint_positions(kind, height))
    skin_report = bind_rodin_meshes(objects, rig, kind, height)
    actions = bake_actions(rig, kind, shoe_soles(objects, kind, height))
    walk_report = measure_walk(objects, rig, actions, height)
    bpy.context.scene.frame_set(1)
    export(kind, objects, rig, out)
    setup_studio(height)
    source_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_dir / f'{kind}-rigged.blend'))
    render_views(kind, height, out)
    report = {
        'kind': kind, 'height': height, 'source': str(source.relative_to(ROOT)),
        'triangles': sum(len(p.vertices) - 2 for obj in objects for p in obj.data.polygons),
        'bones': [bone.name for bone in rig.data.bones],
        'sourceType': 'Rodin static textured mesh', 'skin': skin_report, 'walk': walk_report,
        'actions': {action.name: (action.frame_range[1] - action.frame_range[0]) / 30
                    for action in bpy.data.actions},
        'asset': str((out / f'{kind}.glb').relative_to(ROOT)),
    }
    (source_dir / 'build-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
