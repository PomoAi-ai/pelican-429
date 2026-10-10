"""Render the actual game GLB without modifying its geometry or proportions."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
SOURCE = ROOT / 'public/characters/human/customization/d1-modular-animated.glb'
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
import scene as studio

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
for obj in bpy.context.scene.objects:
    if obj.animation_data:
        obj.animation_data_clear()
    if obj.type == 'ARMATURE':
        obj.data.pose_position = 'REST'
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
parts = {}
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or obj.name not in ('D1_Body', 'D1_Head', 'D1_Hair'):
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    coords = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    parts[obj.name] = {
        'min': [min(v[i] for v in coords) for i in range(3)],
        'max': [max(v[i] for v in coords) for i in range(3)],
    }
    evaluated.to_mesh_clear()
minimum = [min(p['min'][i] for p in parts.values()) for i in range(3)]
maximum = [max(p['max'][i] for p in parts.values()) for i in range(3)]
assert abs(minimum[2]) < .02 and abs(maximum[2] - 3.1) < .02, (minimum, maximum)
studio.studio()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 6
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.resolution_x = scene.render.resolution_y = 1600
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'Standard'
camera = studio._camera()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 4
target = Vector((0, 0, 1.55))
camera.location = target + Vector((0, -8, 0))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.filepath = str(OUT / 'model-front.png')
bpy.ops.render.render(write_still=True)
report = {'source': str(SOURCE.relative_to(ROOT)), 'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
          'pose': 'REST', 'geometryModified': False, 'parts': parts, 'bounds': [minimum, maximum],
          'renderPixels': 1600, 'orthographicSpan': 4, 'pixelsPerWorldUnit': 400,
          'cameraCenterZ': 1.55}
(OUT / 'model-render.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('MODEL_RENDER', json.dumps(report))
