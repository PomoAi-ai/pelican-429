"""Skin the approved Rodin gatekeeper and line hound, preserving their mesh and textures.

blender --background --python scripts/blender_enemies/build_bipeds.py -- --kind gatekeeper
Source orientation is inspected with --yaw-deg before exporting; +X is forward.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/blender_npcs'))
from studio import setup_studio

HEIGHTS = {'gatekeeper': 2.6, 'line-hound': 1.5}
TIMINGS = {'gatekeeper': {'skill1': (42, 8, 48), 'skill2': (30, 14, 54)},
           'line-hound': {'skill1': (30, 32, 54), 'skill2': (36, 10, 54)}}


def points_of(obj):
    values = np.empty(len(obj.data.vertices) * 3, np.float32)
    obj.data.vertices.foreach_get('co', values)
    return values.reshape(-1, 3)


def smooth(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def normalize(objects, height, yaw):
    rotation = Matrix.Rotation(math.radians(yaw), 4, 'Z')
    for obj in objects:
        world = rotation @ obj.matrix_world
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(world)
    points = np.concatenate([points_of(obj) for obj in objects])
    low, high = points.min(axis=0), points.max(axis=0)
    source_height = high[2] - low[2]
    if not np.isfinite(points).all() or source_height <= 0:
        raise ValueError('Rodin source has invalid vertex positions or height')
    soles = points[points[:, 2] < low[2] + source_height * .03]
    center = (soles.min(axis=0) + soles.max(axis=0)) / 2
    transform = Matrix.Scale(height / source_height, 4) @ Matrix.Translation((-center[0], -center[1], -low[2]))
    for obj in objects:
        obj.data.transform(transform)
        obj.data.update()
    return {'sourceBounds': [low.tolist(), high.tolist()], 'yawDegrees': yaw}


def joint_positions(kind):
    if kind == 'gatekeeper':
        joints = {'root': (0, 0, 0), 'pelvis': (-.015, 0, .53), 'chest': (-.005, 0, .64), 'head': (0, 0, .81)}
        parents = {'pelvis': 'root', 'chest': 'pelvis', 'head': 'chest'}
        for side, sign in [('L', 1), ('R', -1)]:
            joints.update({f'arm.{side}': (-.04, sign * .145, .72), f'forearm.{side}': (-.03, sign * .18, .585),
                           f'hand.{side}': (.005, sign * .22, .44), f'thigh.{side}': (-.015, sign * .12, .53),
                           f'shin.{side}': (-.01, sign * .12, .33), f'foot.{side}': (-.045, sign * .12, .087)})
            parents.update({f'arm.{side}': 'chest', f'forearm.{side}': f'arm.{side}', f'hand.{side}': f'forearm.{side}',
                            f'thigh.{side}': 'pelvis', f'shin.{side}': f'thigh.{side}', f'foot.{side}': f'shin.{side}'})
    else:
        joints = {'root': (0, 0, 0), 'body': (0, 0, .66), 'head': (.47, 0, .77)}
        parents = {'body': 'root', 'head': 'body'}
        for fore, x, z, knee_x, knee_z, foot_x in [('F', .27, .64, .24, .42, .44), ('B', -.41, .74, -.60, .44, -.48)]:
            for side, sign in [('L', 1), ('R', -1)]:
                limb = f'{fore}{side}'
                joints.update({f'thigh.{limb}': (x, sign * .23, z), f'shin.{limb}': (knee_x, sign * .25, knee_z), f'foot.{limb}': (foot_x, sign * .26, .115)})
                parents.update({f'thigh.{limb}': 'body', f'shin.{limb}': f'thigh.{limb}', f'foot.{limb}': f'shin.{limb}'})
    return joints, parents


def build_armature(kind, height):
    joints, parents = joint_positions(kind)
    data = bpy.data.armatures.new(f'{kind} skeleton')
    rig = bpy.data.objects.new(f'{kind}Rig', data)
    bpy.context.collection.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, position in joints.items():
        bone = data.edit_bones.new(name)
        bone.head = Vector(position) * height
        bone.tail = bone.head + Vector((0, 0, height * .035))
        if name != 'root':
            bone.parent = data.edit_bones[parents[name]]
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
    rig.show_in_front = True
    return rig


def bind(objects, rig, kind, height):
    names = [bone.name for bone in rig.data.bones]
    reports = []
    for obj in objects:
        weights = np.zeros((len(obj.data.vertices), len(names)))
        # Rodin's disconnected armour panels are rigid mechanical parts. Keep every
        # connected panel on one joint so a shoulder sweep cannot stretch its plating.
        parents = list(range(len(obj.data.vertices)))
        def component(index):
            while parents[index] != index:
                parents[index] = parents[parents[index]]
                index = parents[index]
            return index
        for edge in obj.data.edges:
            a, b = edge.vertices
            parents[component(a)] = component(b)
        components = {}
        for index in range(len(parents)):
            components.setdefault(component(index), []).append(index)
        joints, hierarchy = joint_positions(kind)
        segments = {}
        for name, point in joints.items():
            if name == 'root':
                continue
            start = np.asarray(point)
            children = [child for child, parent in hierarchy.items() if parent == name]
            if name.startswith('foot.'):
                end = start + np.asarray((.085, 0, -.045))
            elif name.startswith('hand.'):
                end = start + np.asarray((.005, 0, -.12))
            elif name == 'head':
                end = start + np.asarray((.035, 0, .11))
            elif len(children) == 1:
                end = np.asarray(joints[children[0]])
            elif name == 'chest':
                end = np.asarray(joints['head'])
            elif name == 'body':
                start = np.asarray((-.4, 0, .73))
                end = np.asarray((.4, 0, .73))
            else:
                end = start + np.asarray((0, 0, .08))
            segments[name] = (start, end)
        positions = points_of(obj) / height
        for indices in components.values():
            center = positions[indices].mean(axis=0)
            distances = {}
            for name, (start, end) in segments.items():
                direction = end - start
                along = np.clip(np.dot(center-start,direction)/np.dot(direction,direction),0,1)
                distances[name] = np.linalg.norm(center-start-direction*along)
            joint_name = min(distances,key=distances.get)
            if kind == 'line-hound' and center[0] < -.48 and center[2] > .58:
                joint_name = 'body'
            joint = names.index(joint_name)
            weights[indices] = 0
            weights[indices, joint] = 1
            assigned = names[joint]
            if assigned.startswith(('thigh.', 'shin.', 'foot.')):
                limb = assigned.split('.')[1]
                z = positions[indices, 2]
                knee = joints[f'shin.{limb}'][2]
                ankle = joints[f'foot.{limb}'][2]
                hip = joints[f'thigh.{limb}'][2]
                body = 'pelvis' if kind == 'gatekeeper' else 'body'
                upper = smooth(knee-.015,knee+.015,z)
                lower = 1-smooth(ankle-.015,ankle+.02,z)
                pelvis = smooth(hip-.015,hip+.025,z)
                weights[indices] = 0
                weights[indices,names.index(body)] = pelvis
                weights[indices,names.index(f'thigh.{limb}')] = upper*(1-pelvis)
                weights[indices,names.index(f'shin.{limb}')] = (1-upper)*(1-lower)*(1-pelvis)
                weights[indices,names.index(f'foot.{limb}')] = lower*(1-pelvis)
        for column, name in enumerate(names):
            group = obj.vertex_groups.new(name=name)
            for index in np.flatnonzero(weights[:, column] > .00001):
                group.add([int(index)], float(weights[index, column]), 'REPLACE')
        obj.parent = rig
        modifier = obj.modifiers.new('Enemy mechanical skeleton', 'ARMATURE')
        modifier.object = rig
        reports.append({'mesh': obj.name, 'vertices': len(weights), 'maxInfluences': int((weights > 0).sum(axis=1).max())})
    return reports


def turn(rig, name, axis, angle):
    bone = rig.pose.bones[name]
    local_axis = rig.data.bones[name].matrix_local.to_3x3().inverted() @ Vector(axis)
    bone.rotation_quaternion = Quaternion(local_axis, angle)


def shift(rig, name, vector):
    rig.pose.bones[name].location = rig.data.bones[name].matrix_local.to_3x3().inverted() @ Vector(vector)


def pose_feet(rig, kind, height, time, stride, lift):
    """Two-joint mechanical legs follow grounded stance and a raised return arc."""
    joints, _ = joint_positions(kind)
    limbs = [('L', 0), ('R', .5)] if kind == 'gatekeeper' else [('FL', 0), ('BR', 0), ('FR', .5), ('BL', .5)]
    body_name = 'pelvis' if kind == 'gatekeeper' else 'body'
    bpy.context.view_layer.update()
    parent_pose = rig.pose.bones[body_name].matrix.copy()
    parent_rest = rig.data.bones[body_name].matrix_local
    deform = parent_pose @ parent_rest.inverted()
    for limb, phase in limbs:
        upper, lower, foot = [f'{part}.{limb}' for part in ['thigh', 'shin', 'foot']]
        hip_rest, knee_rest, ankle_rest = [Vector(joints[name]) * height for name in [upper, lower, foot]]
        hip = deform @ hip_rest
        u = (time + phase) % 1
        if u < .6:
            travel, raised = stride * (.5 - u / .6), 0
        else:
            v = (u - .6) / .4
            travel, raised = stride * (-.5 + float(smooth(0, 1, v))), lift * math.sin(math.pi * v) ** 2
        ankle = ankle_rest + Vector((travel * height, 0, raised * height))
        a, b = (knee_rest - hip_rest).length, (ankle_rest - knee_rest).length
        direction = ankle - hip
        distance = direction.length
        if distance >= a + b:
            ankle = hip + direction.normalized() * (a + b - height * .0001)
            direction = ankle - hip
            distance = direction.length
        axis = direction.normalized()
        pole = Vector((1 if kind == 'gatekeeper' else -1, 0, 0))
        bend = (pole - axis * pole.dot(axis)).normalized()
        along = (a*a - b*b + distance*distance) / (2*distance)
        knee = hip + axis * along + bend * math.sqrt(max(0, a*a - along*along))
        deforms = {}
        for name, rest_start, rest_end, start, end in [(upper, hip_rest, knee_rest, hip, knee), (lower, knee_rest, ankle_rest, knee, ankle)]:
            rotation = (rest_end-rest_start).rotation_difference(end-start)
            deforms[name] = Matrix.Translation(start) @ rotation.to_matrix().to_4x4() @ Matrix.Translation(-rest_start)
        deforms[foot] = Matrix.Translation(ankle-ankle_rest)
        poses = {name: deforms[name] @ rig.data.bones[name].matrix_local for name in deforms}
        poses[body_name] = parent_pose
        for name in [upper, lower, foot]:
            bone = rig.data.bones[name]
            inherited = poses[bone.parent.name] @ bone.parent.matrix_local.inverted() @ bone.matrix_local
            rig.pose.bones[name].matrix_basis = inherited.inverted() @ poses[name]


def animate(rig, kind, name, frame, duration, height):
    t = frame / duration
    wave = math.sin(t * math.tau)
    body = 'chest' if kind == 'gatekeeper' else 'body'
    if name == 'idle':
        turn(rig, 'head', (0,0,1), .055 * wave)
        turn(rig, body, (0,1,0), .008 * wave)
    elif name == 'move':
        shift(rig, 'root', (0, 0, -height * (.027 + .006 * math.cos(t * math.tau * 2))))
        pose_feet(rig, kind, height, t, .20 if kind == 'gatekeeper' else .27, .05 if kind == 'gatekeeper' else .09)
        turn(rig, 'head', (0,0,1), .02*wave)
        if kind == 'gatekeeper':
            for side, sign in [('L',1),('R',-1)]:
                turn(rig, f'arm.{side}', (0,1,0), .2*wave*sign)
                turn(rig, f'forearm.{side}', (0,1,0), -.13)
    elif name == 'hit':
        recoil = math.sin(math.pi*t) ** 2
        turn(rig, body, (0,1,0), -.15*recoil)
        turn(rig, 'head', (0,1,0), -.10*recoil)
        if kind == 'gatekeeper':
            turn(rig, 'arm.R', (0,1,0), -.18*recoil)
            turn(rig, 'arm.L', (0,1,0), -.18*recoil)
    else:
        startup, active, recovery = TIMINGS[kind][name]
        prepare = float(smooth(0, startup, frame))
        release = float(smooth(startup, startup + active, frame))
        recover = 1 - float(smooth(startup + active, duration, frame))
        if kind == 'gatekeeper':
            if name == 'skill1':
                turn(rig, 'chest', (0,0,1), (.18*prepare - .35*release)*recover)
                turn(rig, 'arm.R', (0,1,0), (-.85*prepare - .35*release)*recover)
                turn(rig, 'forearm.R', (0,1,0), (-.6*prepare + .55*release)*recover)
                turn(rig, 'hand.R', (0,0,1), (.25*prepare - .5*release)*recover)
            else:
                turn(rig, 'chest', (0,1,0), (.06*prepare + .10*release)*recover)
                turn(rig, 'arm.R', (0,1,0), (-.6*prepare - .6*release)*recover)
                turn(rig, 'forearm.R', (0,1,0), (-.8*prepare + .75*release)*recover)
                turn(rig, 'arm.L', (0,1,0), -.45*prepare*recover)
                turn(rig, 'forearm.L', (0,1,0), -.6*prepare*recover)
            turn(rig, 'head', (0,0,1), -.06*prepare*recover)
        else:
            # Logical jump supplies world translation. The clip only folds real joints.
            tuck = prepare * recover
            if name == 'skill2':
                tuck = prepare * (1 - float(smooth(startup, startup + active*.4, frame)))
            shift(rig, 'root', (0,0,-height*.06*tuck))
            pose_feet(rig, kind, height, .1, .05*tuck, 0)
            turn(rig, 'head', (0,1,0), -.10*tuck)
            for limb, sign in [('FL',1),('FR',1),('BL',-1),('BR',-1)]:
                turn(rig, f'thigh.{limb}', (0,1,0), -.18*sign*tuck)
                turn(rig, f'shin.{limb}', (0,1,0), .28*sign*tuck)


def bake(rig, kind, height):
    clips = {'idle': 180, 'move': 48 if kind == 'gatekeeper' else 36,
             **{name: sum(timing) for name,timing in TIMINGS[kind].items()}, 'hit': 36}
    scene = bpy.context.scene
    scene.render.fps = 60
    rig.animation_data_create()
    actions = {}
    for name, duration in clips.items():
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        for frame in range(duration+1):
            for bone in rig.pose.bones:
                bone.matrix_basis = Matrix.Identity(4)
            animate(rig, kind, name, frame, duration, height)
            for bone in rig.pose.bones:
                for path in ['location','rotation_quaternion','scale']:
                    bone.keyframe_insert(data_path=path, frame=frame, group=bone.name)
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, action)
        track.mute = True
        actions[name] = action
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    scene.frame_set(0)
    bpy.context.view_layer.update()
    return actions, clips


def render(objects, rig, kind, height, output, actions):
    camera = setup_studio(height)
    scene = bpy.context.scene
    scene.cycles.samples = 32
    scene.render.resolution_x = 960
    scene.render.resolution_y = 960
    bounds = np.concatenate([points_of(obj) for obj in objects])
    width = float(np.ptp(bounds[:,0]))
    camera.data.ortho_scale = max(height,width)*1.28
    target = Vector((0,0,height*.5))
    for label, position in [('front',(3,0,.5)),('side',(0,-3,.5)),('thumbnail',(2.2,-3,1.5))]:
        camera.location = Vector(position)*height
        camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(output/f'{label}.png')
        bpy.ops.render.render(write_still=True)
    camera.location = Vector((0,-3,.5))*height
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale *= 1.25
    for name in ['move','skill1','skill2']:
        rig.animation_data.action = actions[name]
        rig.animation_data.action_slot = actions[name].slots[0]
        scene.frame_set(12 if name == 'move' else TIMINGS[kind][name][0] + TIMINGS[kind][name][1])
        scene.render.filepath = str(output/f'{name}.png')
        bpy.ops.render.render(write_still=True)
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    scene.frame_set(0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--kind', choices=tuple(HEIGHTS), required=True)
    parser.add_argument('--yaw-deg', type=float, default=90)
    parser.add_argument('--skip-render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    kind, height = args.kind, HEIGHTS[args.kind]
    source_dir = ROOT/'assets/characters/enemies'/kind
    source = source_dir/'rodin-original/source.glb'
    if not source.is_file():
        raise FileNotFoundError(source)
    output = ROOT/'public/characters/enemies'/kind
    output.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = [obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    if not objects or any(obj.type=='ARMATURE' for obj in bpy.context.scene.objects):
        raise ValueError(f'{source}: expected static source mesh')
    for obj in objects:
        if not obj.data.uv_layers or not obj.data.materials:
            raise ValueError(f'{obj.name}: source UVs and textured materials are required')
    report = normalize(objects,height,args.yaw_deg)
    rig = build_armature(kind,height)
    report['skin'] = bind(objects,rig,kind,height)
    actions, clips = bake(rig,kind,height)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(output/'model.glb'),export_format='GLB',use_selection=True,
        export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
        export_anim_slide_to_zero=True,export_skins=True,export_materials='EXPORT',export_apply=False,export_extras=True)
    if not args.skip_render:
        render(objects,rig,kind,height,output,actions)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(source_dir/f'{kind}-rigged.blend'))
    report.update({'kind':kind,'height':height,'forward':'+X','up':'Y in glTF; Z in Blender',
                   'source':str(source.relative_to(ROOT)),'bones':list(rig.data.bones.keys()),
                   'clips':{name:frames/60 for name,frames in clips.items()},
                   'triangles':sum(len(face.vertices)-2 for obj in objects for face in obj.data.polygons)})
    (source_dir/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
