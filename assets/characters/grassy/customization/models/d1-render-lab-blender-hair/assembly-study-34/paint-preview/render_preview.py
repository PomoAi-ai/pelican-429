"""Inspect painted hair with 75% texture emission and 25% diffuse response."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / 'D1-Hair-Painted.blend'


def geometry_hash():
    result = hashlib.sha256()
    for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name):
        if obj.type != 'MESH':
            continue
        result.update(obj.name.encode())
        result.update(np.asarray(obj.matrix_world, dtype=np.float64).tobytes())
        result.update(np.asarray([vertex.co for vertex in obj.data.vertices], dtype=np.float64).tobytes())
        result.update(np.asarray([index for face in obj.data.polygons for index in face.vertices], dtype=np.int32).tobytes())
        for uv in obj.data.uv_layers:
            result.update(np.asarray([loop.uv for loop in uv.data], dtype=np.float64).tobytes())
    return result.hexdigest()


def main():
    if (HERE / 'preview-report.json').exists():
        raise ValueError('Preserved paint preview exists')
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    frozen = geometry_hash()
    objects = [bpy.data.objects[name] for name in json.loads(scene['Hair components'])]
    original = objects[0].active_material
    assert all(obj.active_material == original for obj in objects)
    material = original.copy()
    material.name = 'Paint preview 75 texture 25 diffuse'
    nodes, links = material.node_tree.nodes, material.node_tree.links
    texture = next(node for node in nodes if node.type == 'TEX_IMAGE')
    output = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL')
    emission = nodes.new('ShaderNodeEmission')
    diffuse = nodes.new('ShaderNodeBsdfDiffuse')
    mix = nodes.new('ShaderNodeMixShader')
    emission.inputs['Strength'].default_value = 1
    diffuse.inputs['Roughness'].default_value = 0
    mix.inputs[0].default_value = .25
    links.new(texture.outputs['Color'], emission.inputs['Color'])
    links.new(texture.outputs['Color'], diffuse.inputs['Color'])
    links.new(emission.outputs[0], mix.inputs[1])
    links.new(diffuse.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs['Surface'])
    for obj in objects:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    scene.render.engine = 'CYCLES'
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = 'METAL'
    preferences.get_devices()
    metal = [device for device in preferences.devices if device.type == 'METAL']
    if not metal:
        raise RuntimeError('Metal GPU required for this isolated preview')
    for device in preferences.devices:
        device.use = device.type == 'METAL'
    scene.cycles.device = 'GPU'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = False
    centre = Vector((0, .015, 2.64))
    for view, direction in {'front': (0, -1, 0), 'right': (-1, 0, 0), 'three-quarter': (-1, -1, 0)}.items():
        scene.camera.location = centre + Vector(direction) * 4
        scene.camera.rotation_euler = (centre - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(HERE / f'{view}.png')
        bpy.ops.render.render(write_still=True)
    assert geometry_hash() == frozen
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'Paint-Preview.blend'))
    report = {'source': str(SOURCE), 'sourceSHA256': source_hash, 'sourceUnchanged': True,
              'meshTransformAndUVSHA256': frozen, 'geometryUnchanged': True,
              'hairMaterial': '0.75 texture emission + 0.25 Lambert diffuse; no specular',
              'renderer': 'Cycles Metal', 'samples': 64, 'denoising': False,
              'devices': [device.name for device in metal],
              'camera': {'centre': list(centre), 'scale': scene.camera.data.ortho_scale,
                         'resolution': [scene.render.resolution_x, scene.render.resolution_y]},
              'viewTransform': scene.view_settings.view_transform,
              'limitation': 'Static reference preview, not exact browser V10 lighting; original lights and cameras retained.'}
    (HERE / 'preview-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('PAINT_PREVIEW_OK; source and geometry unchanged', flush=True)


if __name__ == '__main__':
    main()
