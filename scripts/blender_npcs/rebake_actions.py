"""Refresh NPC clips without rebuilding the approved geometry, materials or skin.

Blender --background --python scripts/blender_npcs/rebake_actions.py -- --kind sam
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from animation import CLIP_FRAMES, bake_actions
from build import export, measure_walk, shoe_soles


def action_fingerprint(action):
    channels = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    channels.append((curve.data_path, curve.array_index,
                                     [tuple(key.co) for key in curve.keyframe_points]))
    return hashlib.sha256(json.dumps(sorted(channels)).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--kind', choices=('sam', 'tibo'), required=True)
    kind = parser.parse_args(sys.argv[sys.argv.index('--') + 1:]).kind
    directory = ROOT / 'assets/characters' / kind
    source = directory / f'{kind}-rigged.blend'
    if not source.is_file():
        raise FileNotFoundError(f'{kind}: approved rigged scene is required: {source}')
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig = bpy.data.objects[f'{kind.title()}Rig']
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.parent == rig]
    if not objects:
        raise ValueError(f'{kind}: approved rig contains no skinned meshes')
    preserved = {name: action_fingerprint(bpy.data.actions[name]) for name in ('idle', 'walk', 'greet')}
    rig.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    height = rig['character_height']
    actions = bake_actions(rig, kind, shoe_soles(objects, kind, height))
    for name, fingerprint in preserved.items():
        if action_fingerprint(actions[name]) != fingerprint:
            raise ValueError(f'{kind}: rebaking unexpectedly changed the approved {name} clip')
    walk = measure_walk(objects, rig, actions, height)
    if walk['supportFootMaximumGroundError'] > .0001 or walk['loopEndpointMaximumVertexDifference'] > .0001:
        raise ValueError(f'{kind}: approved walk regressed: {walk}')
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    output = ROOT / 'public/characters' / kind
    export(kind, objects, rig, output)
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    report = {
        'kind': kind, 'fps': 30,
        'clips': {name: frames / 30 for name, frames in CLIP_FRAMES.items()},
        'preservedClipSha256': preserved, 'walk': walk,
        'blendSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'glbSha256': hashlib.sha256((output / f'{kind}.glb').read_bytes()).hexdigest(),
    }
    evidence = directory / 'evidence/action-skills'
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / 'rebake-report.json').write_text(json.dumps(report, indent=2) + '\n')
    build_path = directory / 'build-report.json'
    build_report = json.loads(build_path.read_text())
    build_report.update(actions=report['clips'], walk=walk)
    build_path.write_text(json.dumps(build_report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
