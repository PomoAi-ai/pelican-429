"""Bind the retained Rodin surface and bake repeatable breathing/walking clips.

blender --background --threads 3 --python scripts/blender_grassy_rodin/animate.py
Use -- --tiers game --preview for a game-resolution deformation checkpoint.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/characters/grassy/history/model-rodin-refined'
BLENDS = ROOT / 'assets/characters/grassy/history/model-rodin-animated'
OUT = ROOT / 'public/characters/human/history/models-rodin-animated'
EVIDENCE = BLENDS / 'evidence'
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
sys.dont_write_bytecode = True
import scene as studio

FPS = 30
CLIPS = {'idle': 96, 'walk': 36}
WALK_SPEED = 5 / 6
JOINTS = {
    'root': ((0, 0, 0), (0, 0, .16), None),
    'hips': ((0, -.035, 1.16), (0, -.04, 1.35), 'root'),
    'spine': ((0, -.04, 1.35), (0, -.04, 1.66), 'hips'),
    'chest': ((0, -.04, 1.66), (0, -.03, 1.94), 'spine'),
    'neck': ((0, -.03, 1.94), (0, -.025, 2.13), 'chest'),
    'head': ((0, -.025, 2.13), (0, -.025, 2.80), 'neck'),
}
for side, sign in (('L', 1), ('R', -1)):
    JOINTS.update({
        f'clavicle.{side}': ((sign * .10, -.045, 1.88), (sign * .325, -.05, 1.85), 'chest'),
        f'upper_arm.{side}': ((sign * .325, -.05, 1.85), (sign * .475, -.07, 1.50), f'clavicle.{side}'),
        f'forearm.{side}': ((sign * .475, -.07, 1.50), (sign * .575, -.085, 1.20), f'upper_arm.{side}'),
        f'hand.{side}': ((sign * .575, -.085, 1.20), (sign * .60, -.10, .96), f'forearm.{side}'),
        f'thigh.{side}': ((sign * .215, -.035, 1.16), (sign * .275, -.055, .67), 'hips'),
        f'shin.{side}': ((sign * .275, -.055, .67), (sign * .320, .015, .225), f'thigh.{side}'),
        f'foot.{side}': ((sign * .320, .015, .225), (sign * .320, -.28, .09), f'shin.{side}'),
        f'toe.{side}': ((sign * .320, -.28, .09), (sign * .320, -.43, .08), f'foot.{side}'),
    })


def smooth(a, b, values):
    t = np.clip((values - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mesh_coordinates(mesh):
    values = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get('co', values)
    return values.reshape(-1, 3)


def surface_hash(mesh):
    uv = np.empty(len(mesh.uv_layers.active.data) * 2, np.float32)
    mesh.uv_layers.active.data.foreach_get('uv', uv)
    return {'positions': hashlib.sha256(mesh_coordinates(mesh).tobytes()).hexdigest(),
            'uv': hashlib.sha256(uv.tobytes()).hexdigest()}


def make_rig():
    data = bpy.data.armatures.new('Grassy Rodin deformation skeleton')
    rig = bpy.data.objects.new('GrassyRodinRig', data)
    bpy.context.collection.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail, parent) in JOINTS.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
    rig.show_in_front = True
    rig['rest_height'] = 3.1
    rig['walk_speed_tiles_per_second'] = WALK_SPEED
    return rig


def bind_surface(ob, rig):
    """Continuous anatomical partitions keep the close arm and torso separate."""
    p = mesh_coordinates(ob.data)
    x, y, z = np.abs(p[:, 0]), p[:, 1], p[:, 2]
    weights = {name: np.zeros(len(p)) for name in JOINTS}
    head = smooth(2.02, 2.13, z)
    neck = smooth(1.93, 2.035, z) * (1 - head)
    chest = smooth(1.43, 1.77, z) * (1 - head - neck)
    spine = smooth(1.20, 1.46, z) * (1 - head - neck - chest)
    hip = 1 - head - neck - chest - spine
    # The arm boundary narrows toward the shoulder; wrists and hands are already
    # spatially separated from the hip at x > .43 in the retained Rodin mesh.
    edge = .375 - .13 * smooth(1.55, 1.93, z)
    arm = smooth(edge, edge + .09, x) * smooth(.76, .84, z) * (1 - smooth(1.92, 2.025, z))
    leg = (1 - smooth(1.04, 1.32, z)) * (1 - arm)
    torso = 1 - arm - leg
    for name, values in (('head', head), ('neck', neck), ('chest', chest), ('spine', spine), ('hips', hip)):
        weights[name] = values * torso
    for side, sign in (('L', 1), ('R', -1)):
        side_mask = (p[:, 0] * sign > 0).astype(float)
        # The crotch is a continuous surface; a hard left/right split tears it
        # into a stretched sheet when the thighs move in opposite directions.
        leg_side = smooth(-.08, .08, p[:, 0] * sign)
        arm_amount, leg_amount = arm * side_mask, leg * leg_side
        clavicle = smooth(1.78, 1.96, z)
        hand = 1 - smooth(1.13, 1.26, z)
        forearm = (1 - smooth(1.40, 1.60, z)) * (1 - hand)
        upper = 1 - hand - forearm
        weights[f'clavicle.{side}'] = arm_amount * clavicle
        weights[f'upper_arm.{side}'] = arm_amount * upper * (1 - clavicle)
        weights[f'forearm.{side}'] = arm_amount * forearm * (1 - clavicle)
        weights[f'hand.{side}'] = arm_amount * hand * (1 - clavicle)
        foot = 1 - smooth(.265, .355, z)
        thigh = smooth(.57, .78, z) * (1 - foot)
        shin = 1 - foot - thigh
        toe = (1 - smooth(-.40, -.27, y)) * foot
        weights[f'thigh.{side}'] = leg_amount * thigh
        weights[f'shin.{side}'] = leg_amount * shin
        weights[f'foot.{side}'] = leg_amount * (foot - toe)
        weights[f'toe.{side}'] = leg_amount * toe
    w = np.stack(list(weights.values()), axis=1)
    # glTF supports four joints per vertex. Prune tiny blended boundary terms
    # before export so Blender and Three use identical linear skinning weights.
    order = np.argsort(w, axis=1)
    np.put_along_axis(w, order[:, :-4], 0, axis=1)
    w /= w.sum(axis=1)[:, None]
    for index, name in enumerate(weights):
        group = ob.vertex_groups.new(name=name)
        for vertex_index in np.flatnonzero(w[:, index] > 0):
            group.add([int(vertex_index)], float(w[vertex_index, index]), 'REPLACE')
    ob.parent = rig
    modifier = ob.modifiers.new('Rodin weighted skeleton', 'ARMATURE')
    modifier.object = rig
    # Three/glTF uses linear skinning. Preview the same deformation in Blender.
    modifier.use_deform_preserve_volume = False
    return {'vertices': len(p), 'maximumInfluences': int(np.count_nonzero(w, axis=1).max()),
            'unweightedVertices': int(np.count_nonzero(w.sum(axis=1) == 0)),
            'normalizationMaxError': float(np.max(np.abs(w.sum(axis=1) - 1)))}


def around(pivot, rotation):
    return Matrix.Translation(pivot) @ rotation @ Matrix.Translation(-Vector(pivot))


def rotation(axis, angle):
    return Matrix.Rotation(angle, 4, axis)


def local_edit(name, matrix):
    return around(JOINTS[name][0], matrix)


def solve_knee(hip, ankle, side):
    rest_hip, rest_knee = map(Vector, JOINTS[f'thigh.{side}'][:2])
    rest_ankle = Vector(JOINTS[f'shin.{side}'][1])
    upper, lower = (rest_knee - rest_hip).length, (rest_ankle - rest_knee).length
    direction = ankle - hip
    distance = direction.length
    if distance >= upper + lower:
        raise RuntimeError(f'{side} leg target exceeds reach: {distance:.6f} >= {upper + lower:.6f}')
    axis = direction.normalized()
    forward = Vector((0, -1, 0))
    bend = (forward - axis * forward.dot(axis)).normalized()
    along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
    height = math.sqrt(max(0, upper * upper - along * along))
    return hip + axis * along + bend * height


def segment_deform(name, head, tail):
    rest_head, rest_tail = map(Vector, JOINTS[name][:2])
    q = (rest_tail - rest_head).rotation_difference(tail - head)
    return Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-rest_head)


def foot_trajectory(phase, sole, side):
    u = phase % 1
    if u < .60:
        y, lift = -.30 + u, 0
        pitch = -.10 * (1 - float(smooth(0, .11, u))) + .14 * float(smooth(.48, .60, u))
    else:
        t = (u - .60) / .40
        y = .30 + .40 * t - 3 * t * t + 2 * t * t * t
        lift = .16 * math.sin(math.pi * t) ** 2
        pitch = .14 * (1 - t) - .10 * t
    r = rotation('X', pitch)
    rest_ankle = Vector(JOINTS[f'foot.{side}'][0])
    relative = sole - np.asarray(rest_ankle)
    transformed_z = relative[:, 1] * math.sin(pitch) + relative[:, 2] * math.cos(pitch)
    ankle = rest_ankle.copy()
    ankle.y += y
    ankle.z = -float(transformed_z.min()) + lift
    return ankle, r, {'phase': u, 'support': u < .60, 'soleClearance': lift}


def frame_pose(rig, clip, t, soles):
    phase = math.tau * t
    deforms = {}
    root_drop = 0 if clip == 'idle' else -.061 - .025 * math.cos(phase * 2)
    deforms['root'] = Matrix.Translation((0, 0, root_drop))
    hip_rotation = Matrix.Identity(4) if clip == 'idle' else rotation('Z', .028 * math.sin(phase))
    deforms['hips'] = deforms['root'] @ local_edit('hips', hip_rotation)
    # A quicker inhale and a longer release avoid the mechanical sine-wave sway.
    breath_time = t % 1
    breath = float(smooth(0, .38, breath_time)) if breath_time < .38 else 1-float(smooth(.38, 1, breath_time))
    spine_rotation = rotation('X', -.014 * breath if clip == 'idle' else .018)
    deforms['spine'] = deforms['hips'] @ local_edit('spine', spine_rotation)
    if clip == 'idle':
        chest_change = Matrix.Translation((0, 0, .014 * breath)) @ Matrix.Diagonal((1 + .018 * breath, 1 + .035 * breath, 1 + .006 * breath, 1))
    else:
        chest_change = rotation('Z', -.045 * math.sin(phase)) @ rotation('X', -.01)
    deforms['chest'] = deforms['spine'] @ local_edit('chest', chest_change)
    neck_rest = Vector(JOINTS['neck'][0])
    neck_pos = deforms['chest'] @ neck_rest
    neck_rotation = rotation('X', .008 * breath if clip == 'idle' else -.008)
    deforms['neck'] = Matrix.Translation(neck_pos) @ neck_rotation @ Matrix.Translation(-neck_rest)
    deforms['head'] = deforms['neck']
    contacts = {}
    for side, offset in (('L', 0), ('R', .5)):
        limb_phase = phase + offset * math.tau
        shoulder_lift = Matrix.Translation((0, 0, .009 * breath)) if clip == 'idle' else Matrix.Identity(4)
        deforms[f'clavicle.{side}'] = deforms['chest'] @ shoulder_lift
        arm_swing = -.028 * breath if clip == 'idle' else .25 * math.cos(limb_phase)
        upper = f'upper_arm.{side}'
        deforms[upper] = deforms[f'clavicle.{side}'] @ local_edit(upper, rotation('X', arm_swing))
        forearm = f'forearm.{side}'
        elbow = 0 if clip == 'idle' else -.065 - .045 * (1 - math.cos(limb_phase))
        deforms[forearm] = deforms[upper] @ local_edit(forearm, rotation('X', elbow))
        deforms[f'hand.{side}'] = deforms[forearm]
        if clip == 'idle':
            for part in ('thigh', 'shin', 'foot', 'toe'):
                deforms[f'{part}.{side}'] = Matrix.Identity(4)
        else:
            hip = deforms['hips'] @ Vector(JOINTS[f'thigh.{side}'][0])
            ankle, foot_rotation, contacts[side] = foot_trajectory(t + offset, soles[side], side)
            knee = solve_knee(hip, ankle, side)
            deforms[f'thigh.{side}'] = segment_deform(f'thigh.{side}', hip, knee)
            deforms[f'shin.{side}'] = segment_deform(f'shin.{side}', knee, ankle)
            rest_ankle = Vector(JOINTS[f'foot.{side}'][0])
            deforms[f'foot.{side}'] = Matrix.Translation(ankle) @ foot_rotation @ Matrix.Translation(-rest_ankle)
            deforms[f'toe.{side}'] = deforms[f'foot.{side}']
    poses = {name: deforms[name] @ rig.data.bones[name].matrix_local for name in JOINTS}
    for name, (_, _, parent) in JOINTS.items():
        rest = rig.data.bones[name].matrix_local
        inherited = poses[parent] @ rig.data.bones[parent].matrix_local.inverted() @ rest if parent else rest
        rig.pose.bones[name].matrix_basis = inherited.inverted() @ poses[name]
    return contacts


def actions(rig, ob):
    rig.animation_data_create()
    s = bpy.context.scene
    s.render.fps = FPS
    s.frame_start, s.frame_end = 0, 96
    p = mesh_coordinates(ob.data)
    soles = {side: p[(p[:, 0] * sign > .1) & (p[:, 2] < .035)] for side, sign in (('L', 1), ('R', -1))}
    contact_report = []
    for clip, duration in CLIPS.items():
        action = bpy.data.actions.new(clip)
        rig.animation_data.action = action
        previous = {}
        for frame in range(duration + 1):
            contacts = frame_pose(rig, clip, frame / duration, soles)
            if clip == 'walk':
                contact_report.append({'frame': frame, **contacts})
            for bone in rig.pose.bones:
                # Quaternion hemisphere continuity prevents an interpolated flip.
                q = bone.rotation_quaternion
                if bone.name in previous and q.dot(previous[bone.name]) < 0:
                    q.negate()
                previous[bone.name] = q.copy()
                for path in ('location', 'rotation_quaternion', 'scale'):
                    bone.keyframe_insert(data_path=path, frame=frame, group=bone.name)
        for layer in action.layers:
            for strip in layer.strips:
                for channelbag in strip.channelbags:
                    for curve in channelbag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
        track = rig.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, 0, action)
        strip.action_frame_start, strip.action_frame_end = 0, duration
        track.mute = True
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    s.frame_set(0)
    return contact_report


def activate(rig, clip, frame):
    action = bpy.data.actions[clip]
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(frame)



def measure_animation(rig, ob, tier):
    """Measure the deformed retained surface, including the actual shoe sole."""
    original = mesh_coordinates(ob.data)
    sole = original[:, 2] < .035
    chest = (original[:, 2] > 1.62) & (original[:, 2] < 1.83) & (np.abs(original[:, 0]) < .24) & (original[:, 1] < -.18)
    shoulder = (original[:, 2] > 1.78) & (original[:, 2] < 1.90) & (np.abs(original[:, 0]) > .25) & (np.abs(original[:, 0]) < .39)
    report = {'sampling': '30 fps baked keyframes; loop endpoints compare all retained mesh vertices'}
    for clip, duration in CLIPS.items():
        first = None
        minimum = 99
        support_maximum = 0
        extremes = {}
        frames = range(duration + 1) if clip == 'walk' else (0, 24, 72, 96)
        for frame in frames:
            activate(rig, clip, frame)
            evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            points = mesh_coordinates(mesh)
            evaluated.to_mesh_clear()
            minimum = min(minimum, float(points[sole, 2].min()))
            if first is None:
                first = points.copy()
            if clip == 'idle' and frame in (24, 72):
                extremes[frame] = points.copy()
            if clip == 'walk':
                for sign, offset in ((1, 0), (-1, .5)):
                    if (frame / duration + offset) % 1 < .60:
                        mask = sole & (original[:, 0] * sign > .1)
                        support_maximum = max(support_maximum, abs(float(points[mask, 2].min())))
        report[clip] = {'minimumSoleZ': minimum,
                        'loopEndpointMaximumVertexDifference': float(np.linalg.norm(points - first, axis=1).max())}
        if clip == 'walk':
            report[clip]['supportFootMaximumGroundError'] = support_maximum
        else:
            delta = extremes[24] - extremes[72]
            report[clip]['chestFrontMedianPeakToPeakDepth'] = float(np.median(np.abs(delta[chest, 1])))
            report[clip]['shoulderMedianPeakToPeakHeight'] = float(np.median(np.abs(delta[shoulder, 2])))
            report[clip]['soleMaximumPeakToPeakDisplacement'] = float(np.linalg.norm(delta[sole], axis=1).max())
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(0)
    (EVIDENCE / f'{tier}-deformation-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('DEFORMATION', json.dumps(report), flush=True)
    return report


def render_preview(rig, tier):
    s = bpy.context.scene
    s.cycles.device = 'CPU'
    s.render.threads_mode, s.render.threads = 'FIXED', 3
    s.render.resolution_percentage = 75
    for clip, frames in (('idle', (0, 24, 72)), ('walk', (0, 6, 9, 18, 24, 27))):
        for frame in frames:
            activate(rig, clip, frame)
            views = ('right', 'front') if frame in (0, 9, 27) else ('right',)
            for view in views:
                path = EVIDENCE / f'{tier}-{clip}-{frame:02d}-{view}.png'
                studio.render(view, 'full', path, 16)
                print('PREVIEW', path, flush=True)
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    s.frame_set(0)


def build(tier, preview):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / f'grassy-rodin-refined-{tier}.blend'))
    bpy.context.preferences.filepaths.save_version = 0
    ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    before = surface_hash(ob.data)
    ob.name = f'grassy-rodin-animated-{tier}'
    rig = make_rig()
    skin = bind_surface(ob, rig)
    contact_report = actions(rig, ob)
    if tier == 'game':
        measure_animation(rig, ob, tier)
    after = surface_hash(ob.data)
    if before != after:
        raise RuntimeError('Binding modified retained Rodin positions or UVs')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = OUT / f'grassy-rodin-animated-{tier}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=False, export_animations=True,
                              export_animation_mode='NLA_TRACKS', export_frame_range=False,
                              export_force_sampling=True, export_nla_strips=True,
                              export_skins=True, export_all_influences=False,
                              export_image_format='AUTO', export_lights=False, export_cameras=False)
    if preview:
        render_preview(rig, tier)
    activate(rig, 'idle', 0)
    bpy.context.scene.frame_end = 96
    blend = BLENDS / f'grassy-rodin-animated-{tier}.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report = {'id': tier, 'triangles': sum(len(p.vertices) - 2 for p in ob.data.polygons),
              'bones': len(rig.data.bones), 'height': 3.1, 'restPoseSurfaceUnchanged': before == after,
              'surfaceHash': after, 'skin': skin, 'clips': {name: frames / FPS for name, frames in CLIPS.items()},
              'walkSpeedTilesPerSecond': WALK_SPEED, 'bytes': path.stat().st_size,
              'glb': path.relative_to(ROOT).as_posix(), 'blend': blend.relative_to(ROOT).as_posix()}
    (EVIDENCE / f'{tier}-rig-report.json').write_text(json.dumps(report, indent=2) + '\n')
    if tier == 'game':
        (EVIDENCE / 'walk-foot-trajectory.json').write_text(json.dumps(contact_report, indent=2) + '\n')
    print('TIER_READY', json.dumps(report), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tiers', nargs='+', choices=('detailed', 'game', 'light'), default=['detailed', 'game', 'light'])
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    for directory in (BLENDS, OUT, EVIDENCE):
        directory.mkdir(parents=True, exist_ok=True)
    for tier in args.tiers:
        build(tier, args.preview)
    available = [json.loads(p.read_text()) for p in EVIDENCE.glob('*-rig-report.json')]
    (OUT / 'manifest.json').write_text(json.dumps({'source': 'Retained Rodin refined meshes; new weighted skeleton and baked actions',
        'fps': FPS, 'clips': {'idle': 3.2, 'walk': 1.2}, 'walkSpeedTilesPerSecond': WALK_SPEED,
        'loop': 'identical endpoint pose; in-place root; alternating 60% support / 40% swing',
        'tiers': available}, indent=2) + '\n')


if __name__ == '__main__':
    main()
