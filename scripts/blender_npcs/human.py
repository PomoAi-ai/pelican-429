"""Build a separate human form from its approved textured Rodin source.

Blender --background --python scripts/blender_npcs/human.py -- --kind tibo --inspect
Inspect the source before recording its joints and eyelid landmarks.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from animation import CLIP_FRAMES, bake_actions, build_armature
from build import HEIGHTS, export, mesh_coordinates, normalize, shoe_soles, smooth, vertices_world
from refresh_idle import refresh_action, reset_pose
from studio import render_views, setup_studio

SAM_SKIN = {
    'headZ': (1.745, 1.825),
    'torsoZ': (1.08, 1.20, 1.38, 1.60, 1.72),
    'torsoX': (.295, .315, .30, .28, .20),
    'torsoY': (.22, .25, .25, .23, .18),
    'torsoCenterY': .025, 'armMinimumX': .255,
    'lowerArmZ': 1.15, 'lowerArmX': .32, 'armBlend': .045,
    'armFloorZ': (.78, .84), 'shoulderZ': (1.62, 1.77),
    'connectedHandZ': (.72, 1.13), 'connectedHandSeedX': .40,
    'legZ': (1.005, 1.145), 'pelvisZOffsets': (-.07, .065),
    'pelvisX': (.02, .16), 'upperLegZOffsets': (-.18, -.025),
    'legSideBlend': .085, 'spineZ': (1.08, 1.43),
    'wristZOffsets': (-.018, .045), 'elbowZ': (1.28, 1.405),
    'footZ': (.285, .355), 'kneeZ': (.555, .715),
}


def load_source(kind, asset):
    source = asset / 'rodin-original/source.glb'
    if not source.is_file():
        raise FileNotFoundError(f'{kind} human textured Rodin source is required: {source}')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not objects or any(obj.type == 'ARMATURE' for obj in bpy.context.scene.objects):
        raise ValueError(f'{kind} human requires an unrigged mesh source: {source}')
    for obj in objects:
        if not obj.data.uv_layers or not obj.data.materials:
            raise ValueError(f'{kind} human {obj.name}: missing source UVs or materials')
        for material in obj.data.materials:
            if not material or not material.use_nodes or not any(
                    node.type == 'TEX_IMAGE' and node.image for node in material.node_tree.nodes):
                raise ValueError(f'{kind} human {obj.name}: missing loaded source texture')
    normalize(objects, f'{kind}-human', HEIGHTS[kind])
    return objects


def inspect_source(objects, kind, asset):
    source = asset / 'rodin-original/source.glb'
    output = asset / 'evidence/source'
    output.mkdir(parents=True, exist_ok=True)
    setup_studio(HEIGHTS[kind])
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 640, 800
    scene.cycles.samples = 16
    points = vertices_world(objects)
    report = {
        'source': str(source.relative_to(ROOT)),
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'orientation': 'Blender Z up, front -Y',
        'bounds': {'min': points.min(axis=0).tolist(), 'max': points.max(axis=0).tolist()},
        'height': float(np.ptp(points[:, 2])),
        'meshes': [{'name': obj.name, 'vertices': len(obj.data.vertices),
                    'triangles': sum(len(p.vertices) - 2 for p in obj.data.polygons),
                    'materials': [m.name for m in obj.data.materials]} for obj in objects],
    }
    (output / 'inspection.json').write_text(json.dumps(report, indent=2) + '\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'normalized.blend'))
    render_views(f'{kind}-human', HEIGHTS[kind], output)
    print(json.dumps(report, indent=2))


def connected_hands(mesh, points, z_range, seed_x):
    # Fingers overlap the trousers in front projection. Follow the actual mesh
    # below the wrists, joining its coincident UV-seam vertices only for this mask.
    _, ids = np.unique(np.round(points, 5), axis=0, return_inverse=True)
    parents = list(range(int(ids.max()) + 1))

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    allowed = (points[:, 2] > z_range[0]) & (points[:, 2] < z_range[1])
    for edge in mesh.edges:
        a, b = edge.vertices
        if allowed[a] and allowed[b]:
            parents[root(int(ids[a]))] = root(int(ids[b]))
    seeds = np.flatnonzero(allowed & (abs(points[:, 0]) > seed_x))
    components = {root(int(ids[index])) for index in seeds}
    return np.asarray([allowed[i] and root(int(ids[i])) in components for i in range(len(points))])


def bind_human(obj, rig, landmarks, fit):
    points = mesh_coordinates(obj.data)
    x, y, z = abs(points[:, 0]), points[:, 1], points[:, 2]
    head = smooth(*fit['headZ'], z)
    available = 1 - head
    # Follow the measured oval torso boundary, including the sleeve's back surface.
    body_x = np.interp(z, fit['torsoZ'], fit['torsoX'])
    body_y = np.interp(z, fit['torsoZ'], fit['torsoY'])
    edge = np.maximum(fit['armMinimumX'], body_x * np.sqrt(
        np.maximum(.04, 1 - ((y - fit['torsoCenterY']) / body_y) ** 2)))
    edge = np.where(z < fit['lowerArmZ'], fit['lowerArmX'], edge)
    arm = smooth(edge, edge + fit['armBlend'], x) * smooth(*fit['armFloorZ'], z)
    arm *= 1 - smooth(*fit['shoulderZ'], z)
    arm *= available
    hands = connected_hands(obj.data, points, fit['connectedHandZ'], fit['connectedHandSeedX'])
    arm[hands] = 1
    leg = (1 - smooth(*fit['legZ'], z)) * (available - arm)
    crotch = landmarks['crotchZ']
    pelvis = smooth(*(crotch + offset for offset in fit['pelvisZOffsets']), z)
    pelvis *= 1 - smooth(*fit['pelvisX'], x)
    leg *= 1 - pelvis
    upper_leg = smooth(*(crotch + offset for offset in fit['upperLegZOffsets']), z)
    left_leg = ((points[:, 0] >= 0) * (1 - upper_leg)
                + smooth(-fit['legSideBlend'], fit['legSideBlend'], points[:, 0]) * upper_leg)
    torso = available - arm - leg
    spine = smooth(*fit['spineZ'], z)
    weights = {bone.name: np.zeros(len(points)) for bone in rig.data.bones}
    weights.update(head=head, spine=torso * spine, hips=torso * (1 - spine))
    for side, sign in (('L', 1), ('R', -1)):
        joints = landmarks['joints']
        arm_amount = arm * (points[:, 0] * sign >= 0)
        leg_amount = leg * (left_leg if side == 'L' else 1 - left_leg)
        hand = 1 - smooth(*(joints[f'hand.{side}'][2] + offset for offset in fit['wristZOffsets']), z)
        forearm = (1 - smooth(*fit['elbowZ'], z)) * (1 - hand)
        weights[f'hand.{side}'] = arm_amount * hand
        weights[f'forearm.{side}'] = arm_amount * forearm
        weights[f'upper_arm.{side}'] = arm_amount * (1 - hand - forearm)
        foot = 1 - smooth(*fit['footZ'], z)
        thigh = smooth(*fit['kneeZ'], z) * (1 - foot)
        weights[f'foot.{side}'] = leg_amount * foot
        weights[f'thigh.{side}'] = leg_amount * thigh
        weights[f'shin.{side}'] = leg_amount * (1 - foot - thigh)
    names = list(weights)
    values = np.stack([weights[name] for name in names], axis=1)
    np.put_along_axis(values, np.argsort(values, axis=1)[:, :-4], 0, axis=1)
    values /= values.sum(axis=1)[:, None]
    for column, name in enumerate(names):
        group = obj.vertex_groups.new(name=name)
        for index in np.flatnonzero(values[:, column] > 0):
            group.add([int(index)], float(values[index, column]), 'REPLACE')
    obj.parent = rig
    modifier = obj.modifiers.new('NPC skeleton', 'ARMATURE')
    modifier.object = rig
    modifier.use_deform_preserve_volume = False
    return {'maximumInfluences': int(np.count_nonzero(values, axis=1).max()),
            'normalizationMaxError': float(abs(values.sum(axis=1) - 1).max()),
            'connectedHandVertices': int(hands.sum())}


def build_human(objects, kind, asset):
    from human_eyes import make_eyelids
    source = asset / 'rodin-original/source.glb'
    height = HEIGHTS[kind]
    out = ROOT / f'public/characters/{kind}/human'
    landmarks = json.loads((asset / 'landmarks.json').read_text())
    if landmarks['sourceSha256'] != hashlib.sha256(source.read_bytes()).hexdigest():
        raise ValueError(f'{kind} human landmarks belong to a different source mesh')
    if len(objects) != 1:
        raise ValueError(f'{kind} human calibration requires one Rodin mesh, got {len(objects)}')
    obj = objects[0]
    profile = landmarks['profileFit']
    points = mesh_coordinates(obj.data)
    head = smooth(*profile['neckBlendZ'], points[:, 2])
    points[:, 1] += head * ((profile['depthScale'] - 1) * points[:, 1] + profile['forwardShift'])
    obj.data.vertices.foreach_set('co', points.ravel())
    obj.data.update()
    rig = build_armature(kind, height, landmarks['joints'])
    skin = bind_human(obj, rig, landmarks, SAM_SKIN if kind == 'sam' else landmarks['skin'])
    bake_actions(rig, kind, shoe_soles(objects, f'{kind}-human', height))
    blink, arc = make_eyelids(obj, landmarks['eyes'],
                            2.14 if kind == 'sam' else landmarks['eyeSkinZ'],
                            (-.006, .003) if kind == 'sam' else landmarks['eyeLine'])
    refresh_action(rig, blink, arc, kind)
    reset_pose(rig, blink, arc)
    out.mkdir(parents=True, exist_ok=True)
    export(f'{kind}-human', objects, rig, out)
    setup_studio(height)
    scene = bpy.context.scene
    scene.cycles.samples = 24
    scene.render.resolution_x, scene.render.resolution_y = 640, 800
    bpy.ops.wm.save_as_mainfile(filepath=str(asset / f'{kind}-human-rigged.blend'))
    render_views(f'{kind}-human', height, out)
    report = {'sourceSha256': landmarks['sourceSha256'], 'height': height,
              'profileFit': profile,
              'headProportion': height / (height - landmarks['chin'][2]), 'skin': skin,
              'actions': {name: duration / 30 for name, duration in CLIP_FRAMES.items()},
              'bones': [bone.name for bone in rig.data.bones]}
    (asset / 'build-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=tuple(HEIGHTS), default='sam')
    parser.add_argument('--inspect', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    asset = ROOT / f'assets/characters/{args.kind}/human'
    objects = load_source(args.kind, asset)
    if args.inspect:
        inspect_source(objects, args.kind, asset)
    else:
        build_human(objects, args.kind, asset)


if __name__ == '__main__':
    main()
