"""Measure the real mesh against registered reference cameras and named face points."""
import json
from pathlib import Path

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/characters/grassy/history/model-reference-fit/fit-evidence'
REFERENCES = ROOT / 'public/characters/human/history/turnaround-master-v2'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/characters/grassy/history/model-reference-fit/grassy-reference-fit.blend'))
scene = bpy.context.scene
camera = scene.camera
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
scene.cycles.use_denoising = False
scene.render.threads_mode = 'FIXED'
scene.render.threads = 3
scene.render.film_transparent = False
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.color_mode = 'RGBA'

material = bpy.data.materials.new('Fit evidence • flat white silhouette')
material.use_nodes = True
nodes = material.node_tree.nodes
nodes.clear()
shader = nodes.new('ShaderNodeEmission')
shader.inputs['Color'].default_value = (1, 1, 1, 1)
output = nodes.new('ShaderNodeOutputMaterial')
material.node_tree.links.new(shader.outputs[0], output.inputs['Surface'])
for obj in bpy.data.objects:
    if obj.type == 'MESH' and not obj.name.startswith('Studio'):
        obj.data.materials.clear()
        obj.data.materials.append(material)

records = []
frames = {}
for view, direction, horizontal, origin in [
    ('front', (0, -8, 0), (1, 0, 0), 627),
    ('right', (-8, 0, 0), (0, -1, 0), 638),
    ('left', (8, 0, 0), (0, 1, 0), 615),
    ('back', (0, 8, 0), (-1, 0, 0), 630),
]:
    reference = bpy.data.images.load(str(REFERENCES / f'{view}.png'), check_existing=False)
    width, height = reference.size
    pixels = np.asarray(reference.pixels[:]).reshape(height, width, 4)[::-1]
    rows, cols = np.nonzero(pixels[:, :, 3] > 32 / 255)
    ppunit = (rows.max() - rows.min()) / 3.1
    target = Vector(horizontal) * ((width / 2 - origin) / ppunit)
    target.z = (rows.max() - height / 2) / ppunit
    camera.location = target + Vector(direction)
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = height / ppunit
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    frames[view] = {'imageSize': [width, height], 'referenceAlphaBounds': [int(cols.min()), int(rows.min()), int(cols.max()), int(rows.max())],
                    'pixelsPerUnit': float(ppunit), 'bodyOriginX': origin,
                    'cameraTarget': list(target), 'orthoScale': camera.data.ortho_scale}

    def project(name, point, classification='feature'):
        p = world_to_camera_view(scene, camera, point)
        records.append({'view': view, 'name': name, 'class': classification,
                        'x': p.x * width, 'y': (1 - p.y) * height})

    if view in ('front', 'right'):
        face = bpy.data.objects['Face • rounded cheeks small chin and sculpted nose']
        nose = min((v for v in face.data.vertices if abs(v.co.x) < .008 and 2.26 < v.co.z < 2.35), key=lambda v: v.co.y)
        chin = min(face.data.vertices, key=lambda v: v.co.z)
        mouth = bpy.data.objects['Mouth • short warm lifted smile']
        smile = min(mouth.data.vertices, key=lambda v: v.co.z)
        project('nose_tip', face.matrix_world @ nose.co)
        project('chin', face.matrix_world @ chin.co)
        project('smile_low', mouth.matrix_world @ smile.co)
        sides = ('L', 'R') if view == 'front' else ('L',)
        for label in sides:
            iris = bpy.data.objects[f'Iris {label} • rounded glassy eye']
            project('eye_' + label, iris.matrix_world @ iris.data.vertices[0].co)
        if view == 'front':
            hair = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Hair_')]
            top = max((o.matrix_world @ v.co for o in hair for v in o.data.vertices), key=lambda p: p.z)
            project('hair_top', top, 'structural_tip')
    scene.render.filepath = str(OUT / f'silhouette-{view}.png')
    bpy.ops.render.render(write_still=True)
    bpy.data.images.remove(reference)

(OUT / 'registered-cameras.json').write_text(json.dumps(frames, indent=2) + '\n')
(OUT / 'product-landmarks.json').write_text(json.dumps({'schema': 'landmarks.v1', 'image_size': [1254, 1254], 'landmarks': records}, indent=2) + '\n')
print('FIT_EVIDENCE ' + str(OUT), flush=True)
