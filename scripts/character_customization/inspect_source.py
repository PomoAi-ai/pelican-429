"""Inspect and render a downloaded character before rig registration."""
import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
import scene as studio

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
args.output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(args.source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum = Vector(tuple(min(p[i] for p in points) for i in range(3)))
maximum = Vector(tuple(max(p[i] for p in points) for i in range(3)))
scale = 3.1 / (maximum.z - minimum.z)
center = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
for obj in meshes:
    matrix = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world.identity()
    for vertex in obj.data.vertices:
        vertex.co = (matrix @ vertex.co - center) * scale
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = True
studio.studio()
for view in ('front', 'right', 'back'):
    studio.render(view, 'full', args.output / f'{view}.png', 16)
report = {'sourceBounds': [list(minimum), list(maximum)], 'scale': scale,
          'objects': [{'name': obj.name, 'vertices': len(obj.data.vertices),
                       'materials': [mat.name for mat in obj.data.materials]} for obj in meshes]}
(args.output / 'inspection.json').write_text(json.dumps(report, indent=2) + '\n')
bpy.ops.wm.save_as_mainfile(filepath=str(args.output / 'normalized.blend'))
