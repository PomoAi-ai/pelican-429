"""Build one level of detail, normalise to 3.1 high, export GLB, render checks, update the manifest.

blender -b --factory-startup -P export.py -- --variant detailed|game|light
"""
import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True

import build
import studio

HEIGHT = 3.1
QUALITY = {'detailed': 1.0, 'game': 0.22, 'light': 0.11}
PUBLIC = ROOT / 'public/characters/human/history/models-fresh'
ASSETS = ROOT / 'assets/characters/grassy/history/model-fresh'
VIEWS = {
    'front': ((0, -12, 1.55), (0, 0, 1.55), 3.55), 'back': ((0, 12, 1.55), (0, 0, 1.55), 3.55),
    'left': ((12, 0, 1.55), (0, 0, 1.55), 3.55), 'right': ((-12, 0, 1.55), (0, 0, 1.55), 3.55),
    'hero': ((-6, -8.5, 2.6), (0, 0, 1.5), 3.55), 'face': ((0, -10, 2.52), (0, 0, 2.52), 1.35),
}


def mesh_objects(col):
    return [o for o in col.objects if o.type == 'MESH']


def bounds(objs):
    pts = np.concatenate([np.array([o.matrix_world @ Vector(c) for c in o.bound_box]) for o in objs])
    return pts.min(0), pts.max(0)


def normalise(col):
    objs = mesh_objects(col)
    lo, hi = bounds(objs)
    k = HEIGHT / (hi[2] - lo[2])
    m = Matrix.Scale(k, 4) @ Matrix.Translation((0, 0, -lo[2]))
    for o in objs:
        o.data.transform(m)
        o.data.update()
    return k


def join_by_material(col):
    groups = {}
    for o in mesh_objects(col):
        groups.setdefault(o.data.materials[0].name, []).append(o)
    for name, objs in groups.items():
        for o in bpy.context.scene.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        bpy.context.object.name = 'Grassy_' + name


def triangles(objs):
    total = 0
    for o in objs:
        o.data.calc_loop_triangles()
        total += len(o.data.loop_triangles)
    return total


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--variant', required=True, choices=list(QUALITY))
    p.add_argument('--samples', type=int, default=48)
    p.add_argument('--size', type=int, default=900)
    p.add_argument('--no-render', action='store_true')
    a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
    PUBLIC.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.data.collections.new('Grassy')
    bpy.context.scene.collection.children.link(col)
    build.build(col, QUALITY[a.variant])
    normalise(col)
    cam = studio.setup_scene(a.size, a.samples)
    if a.variant == 'detailed':
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / 'grassy-fresh-detailed.blend'))
    join_by_material(col)
    objs = mesh_objects(col)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    path = PUBLIC / f'grassy-{a.variant}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True,
                              export_animations=False, export_skins=False, export_apply=True,
                              export_materials='EXPORT', export_cameras=False, export_lights=False)
    lo, hi = bounds(objs)
    stats = {'id': a.variant, 'triangles': triangles(objs), 'meshObjects': len(objs),
             'materials': len({m.name for o in objs for m in o.data.materials}),
             'height': round(float(hi[2] - lo[2]), 6), 'width': round(float(hi[0] - lo[0]), 6),
             'depth': round(float(hi[1] - lo[1]), 6), 'bytes': path.stat().st_size,
             'path': f'/characters/human/history/models-fresh/{path.name}'}
    print('GRASSY_ASSET', json.dumps(stats), flush=True)
    for o in sorted(objs, key=lambda o: -len(o.data.loop_triangles))[:8]:
        print('  TRIS', o.name, len(o.data.loop_triangles), flush=True)
    mf = PUBLIC / 'manifest.json'
    manifest = json.loads(mf.read_text()) if mf.exists() else {
        'height': HEIGHT, 'orientation': 'Y-up, +Z forward', 'pose': 'static',
        'reference': '/characters/human/history/turnaround-master-v2/right.png', 'models': []}
    manifest['models'] = [m for m in manifest['models'] if m['id'] != a.variant] + [stats]
    manifest['models'].sort(key=lambda m: -m['triangles'])
    mf.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    if not a.no_render:
        bpy.context.scene.cycles.samples = a.samples
        for v, spec in VIEWS.items():
            studio.render(cam, PUBLIC / f'render-{a.variant}-{v}.png', spec, a.size)
        for v in ('front', 'right', 'back'):
            print('IOU', a.variant, v, round(studio.compare(cam, v, ASSETS / f'silhouette-{a.variant}-{v}.png'), 4), flush=True)


if __name__ == '__main__':
    main()
