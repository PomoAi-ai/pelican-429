"""Reopen the source and render the actual exported asset for visual comparison."""
import json
import struct
import sys
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from build import PUBLIC, SOURCE, bounds, render_views, studio


def main():
    path = PUBLIC / 'grassy-atelier-detailed.glb'
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data)
    if (magic, version, length) != (b'glTF', 2, len(data)):
        raise ValueError(f'Invalid glTF binary header: {path}')
    json_length, chunk_type = struct.unpack_from('<II', data, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError(f'Expected glTF JSON chunk: {path}')
    gltf = json.loads(data[20:20 + json_length])
    primitives = [p for mesh in gltf['meshes'] for p in mesh['primitives']]
    embedded = [image for image in gltf['images'] if 'bufferView' in image]
    if len(embedded) != len(gltf['images']):
        raise ValueError(f'GLB contains external texture references: {path}')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'grassy-atelier-detailed.blend'))
    source_meshes = sum(obj.type == 'MESH' for col in bpy.data.collections
                        if col.name in ('Face ears hands • editable parts',
                                        'Hair • individual sculpted locks',
                                        'Outfit • knit denim sneakers') for obj in col.objects)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    normal_indices = {gltf['textures'][mat['normalTexture']['index']]['source']
                      for mat in gltf['materials'] if 'normalTexture' in mat}
    normal_pixels = {}
    for index in normal_indices:
        name = gltf['images'][index]['name']
        image = bpy.data.images[name]
        pixels = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(pixels)
        rgb = pixels.reshape(-1, 4)[:, :3]
        mean = rgb.mean(axis=0)
        if mean[2] < .5:
            raise ValueError(f'Invalid tangent normal image {name}: mean RGB {mean}')
        normal_pixels[name] = [round(float(value), 4) for value in mean]
    bpy.context.view_layer.update()
    low, high = bounds(objects)
    height = high[2] - low[2]
    if abs(height - 3.1) > .0001:
        raise ValueError(f'Imported asset has unexpected height: {height}, {path}')
    report = {'sourceReopened': True, 'sourceMeshObjects': source_meshes,
              'glbImported': True, 'importedMeshObjects': len(objects),
              'height': height, 'imagesEmbedded': len(embedded),
              'materials': len(gltf['materials']),
              'normalImageMeanRGB': normal_pixels,
              'vertexColorPrimitives': sum('COLOR_0' in p['attributes'] for p in primitives),
              'triangles': sum(gltf['accessors'][p['indices']]['count'] // 3 for p in primitives),
              'extensions': gltf.get('extensionsUsed', [])}
    camera = studio()
    render_views(camera, ['hero', 'face'], 32, 1000, 'glb-check')
    (SOURCE / 'export-inspection.json').write_text(json.dumps(report, indent=2) + '\n')
    print('ATELIER_INSPECT ' + json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
