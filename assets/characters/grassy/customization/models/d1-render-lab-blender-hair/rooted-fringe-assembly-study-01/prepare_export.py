"""Expose the same painted atlas as base color for the existing game renderer."""
import hashlib
import importlib.util
import json
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'painted/D1-Hair-Painted.blend'
DESTINATION = HERE / 'painted/PBR-Export-v2.blend'


def main():
    if DESTINATION.exists():
        raise ValueError(f'Preserved export scene exists: {DESTINATION}')
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    spec = importlib.util.spec_from_file_location('export_scene_check',
        HERE.parent / 'assembly-study-34/paint-preview/render_preview.py')
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)
    geometry = helpers.geometry_hash()
    names = json.loads(bpy.context.scene['Hair components'])
    material = bpy.data.objects[names[0]].active_material.copy()
    material.name = 'Golden hair roots'
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    texture = next(node for node in nodes if node.type == 'TEX_IMAGE')
    output = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL')
    for link in list(output.inputs['Surface'].links):
        links.remove(link)
    links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['Roughness'].default_value = .72
    for name in names:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(material)
    assert helpers.geometry_hash() == geometry
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(DESTINATION))
    print('GAME_EXPORT_MATERIAL_READY', DESTINATION, flush=True)


if __name__ == '__main__':
    main()
