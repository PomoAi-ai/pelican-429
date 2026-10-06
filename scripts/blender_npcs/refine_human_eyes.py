"""Refit the eyelid attachment without rebuilding the approved body or clips."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from build import export
from rebake_actions import action_fingerprint
from refresh_idle import reset_pose, rest_fingerprint


def render_eyes(scene, rig, blink, travel, kind, output, prefix):
    camera = scene.camera
    original = (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage,
                scene.cycles.samples, camera.matrix_world.copy(), camera.data.ortho_scale)
    scene.render.resolution_x, scene.render.resolution_y = 768, 512
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 24
    center = Vector((0, 0, 2.20 if kind == 'sam' else 2.09))
    camera.data.ortho_scale = .64 if kind == 'sam' else .85
    rig.data.pose_position = 'REST'
    views = [('half', .5, 0), ('closed', 1, 0)]
    if prefix == 'after':
        views += [('open', 0, 0), ('half-side', .5, 1.6)]
    for name, value, side in views:
        camera.location = (side, -4, center.z)
        camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
        blink.value, travel.value = value, 4 * value * (1 - value)
        scene.render.filepath = str(output / f'{prefix}-{name}.png')
        bpy.ops.render.render(write_still=True)
    rig.data.pose_position = 'POSE'
    reset_pose(rig, blink, travel)
    (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage,
     scene.cycles.samples, camera.matrix_world, camera.data.ortho_scale) = original


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=('sam', 'tibo'), required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    kind, output = args.kind, args.output
    source = ROOT / f'assets/characters/{kind}/human/{kind}-human-rigged.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    obj, rig = bpy.data.objects['model'], bpy.data.objects[f'{kind.title()}Rig']
    mesh, keys = obj.data, obj.data.shape_keys.key_blocks
    blink, travel = keys['Blink'], keys['BlinkTravel']
    count = obj['eyelid_original_vertices']
    if len(mesh.vertices) - count != 4 * 41 * 9:
        raise ValueError(f'{kind}: expected the approved four human eyelid grids')
    counts = (len(mesh.vertices), len(mesh.polygons), len(mesh.loops))
    preserved = rest_fingerprint(obj, rig, counts)
    actions = {a.name: action_fingerprint(a) for a in bpy.data.actions}
    reset_pose(rig, blink, travel)
    output.mkdir(parents=True, exist_ok=True)
    render_eyes(bpy.context.scene, rig, blink, travel, kind, output, 'before')
    surface = BVHTree.FromPolygons([v.co for v in list(mesh.vertices)[:count]],
                                   [p.vertices for p in mesh.polygons if max(p.vertices) < count])

    def point(x, z):
        value, _, _, _ = surface.ray_cast(Vector((x, -3, z)), Vector((0, 1, 0)))
        if value is None:
            raise ValueError(f'{kind}: original eye surface missing at {x}, {z}')
        return value

    rim_error = 0
    for index in range(count, len(mesh.vertices)):
        local = index - count
        upper = (local // (41 * 9)) % 2 == 0
        u = (local % (41 * 9)) // 9 / 40 * 2 - 1
        v = (0, .18, .36, .54, .72, .86, .95, .985, 1)[local % 9]
        arch = math.sqrt(max(0, 1 - u * u))
        attachment = min(1, v / .18) * min(1, arch / .25)
        basis, target = keys['Basis'].data[index].co, blink.data[index].co
        target.y = point(target.x, target.z).y - .0008 - (.0042 if upper else .0027) * attachment
        correction = 0
        for fraction in (.2, .4, .6, .8):
            middle = point(basis.x, basis.z + (target.z - basis.z) * fraction)
            delta = middle.y - (.0008 + .0022 * attachment) - (basis.y * (1 - fraction) + target.y * fraction)
            correction = min(correction, delta / (4 * fraction * (1 - fraction)))
        travel.data[index].co.y = basis.y + correction
        if v == 0 or arch == 0:
            rim_error = max(rim_error, (target - basis).length, abs(correction))
    if rim_error > .000001:
        raise ValueError(f'{kind}: eyelid attachment moved by {rim_error}')
    if rest_fingerprint(obj, rig, counts) != preserved:
        raise ValueError(f'{kind}: eye refinement changed the approved rest geometry or materials')
    if any(action_fingerprint(bpy.data.actions[name]) != value for name, value in actions.items()):
        raise ValueError(f'{kind}: eye refinement changed an approved action')
    report = {'kind': kind, 'originalVertexCount': count, 'refinedEyelidVertices': len(mesh.vertices) - count,
              'fixedRimMaximumMovement': rim_error, 'restGeometryUvWeightsMaterialsSha256': preserved,
              'preservedClipSha256': actions, 'bodyAndClipsUnchanged': True}
    export(f'{kind}-human', [obj], rig, output)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / f'{kind}-human-rigged.blend'))
    render_eyes(bpy.context.scene, rig, blink, travel, kind, output, 'after')
    (output / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
