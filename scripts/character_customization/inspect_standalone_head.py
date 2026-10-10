"""Inspect a standalone GLB without changing its shape or publishing game assets."""
import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
VIEWS = {'front': (0, -1, 0), 'right': (-1, 0, 0), 'three-quarter': (-1, -1, 0)}


def bounds(objects):
    points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    if not points or any(not math.isfinite(value) for point in points for value in point):
        raise ValueError('Imported head has no finite mesh vertices')
    return [Vector(tuple(fn(point[i] for point in points) for i in range(3))) for fn in (min, max)]


def mesh_report(obj):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    remaining = set(bm.verts)
    components = []
    while remaining:
        pending = [remaining.pop()]
        size = 0
        while pending:
            vertex = pending.pop()
            size += 1
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other in remaining:
                    remaining.remove(other)
                    pending.append(other)
        components.append(size)
    result = {
        'name': obj.name, 'bounds': [list(v) for v in bounds([obj])],
        'vertices': len(mesh.vertices), 'edges': len(mesh.edges), 'faces': len(mesh.polygons),
        'faceSides': dict(Counter(len(face.vertices) for face in mesh.polygons)),
        'connectedComponents': sorted(components, reverse=True),
        'nonManifoldEdges': sum(not edge.is_manifold for edge in bm.edges),
        'boundaryEdges': sum(edge.is_boundary for edge in bm.edges),
        'wireEdges': sum(edge.is_wire for edge in bm.edges),
        'edgesWithMoreThanTwoFaces': sum(len(edge.link_faces) > 2 for edge in bm.edges),
        'uvLayers': [{'name': layer.name, 'loops': len(layer.data)} for layer in mesh.uv_layers],
        'materials': [material.name if material else None for material in mesh.materials],
    }
    bm.free()
    return result


def material_report(material):
    nodes = list(material.node_tree.nodes) if material.node_tree else []
    return {
        'name': material.name,
        'shaders': [node.type for node in nodes if node.type.startswith('BSDF')],
        'textures': [{'name': node.image.name, 'size': list(node.image.size),
                      'colorSpace': node.image.colorspace_settings.name}
                     for node in nodes if node.type == 'TEX_IMAGE' and node.image],
    }


def setup_scene(minimum, maximum):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    center = (minimum + maximum) / 2
    size = maximum - minimum
    span = max(size.z, math.hypot(size.x, size.y))
    world = bpy.data.worlds.new('Head inspection world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.5, .5, .5, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
    scene.world = world
    for name, offset, energy in [('Key', (-3, -4, 4), 180), ('Fill', (3, -3, 1), 100),
                                  ('Rim', (1, 3, 3), 160)]:
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = energy * span * span
        light.size = span * 3
        obj = bpy.data.objects.new(name, light)
        scene.collection.objects.link(obj)
        obj.location = center + Vector(offset) * span
        obj.rotation_euler = (center - obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('Inspection camera', bpy.data.cameras.new('Inspection camera'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = span * 1.15
    camera.data.clip_start = span * .001
    camera.data.clip_end = span * 100
    return center, span, camera


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--rotation-deg', type=float, nargs=3, default=(0, 0, 0), metavar=('X', 'Y', 'Z'))
    parser.add_argument('--head-height', type=float, help='Uniformly scale the entire imported head, including neck, to this Z height')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    source, output = args.input.resolve(), args.output_dir.resolve()
    if not source.is_file() or source.suffix.lower() != '.glb':
        parser.error(f'Expected an existing GLB: {source}')
    if output.is_relative_to(ROOT / 'public'):
        parser.error('Candidate inspection must not write into public game assets')
    if any(not math.isfinite(value) for value in args.rotation_deg):
        parser.error('Rotation must contain finite degrees')
    if args.head_height is not None and (not math.isfinite(args.head_height) or args.head_height <= 0):
        parser.error('Head height must be finite and positive')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    for obj in bpy.context.scene.objects:
        if obj.type in {'LIGHT', 'CAMERA'}:
            obj.hide_render = True
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    source_bounds = bounds(meshes)
    root = bpy.data.objects.new('Head inspection transform', None)
    bpy.context.scene.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.parent is None:
            obj.parent = root
    root.matrix_world = Euler(tuple(math.radians(value) for value in args.rotation_deg), 'XYZ').to_matrix().to_4x4()
    bpy.context.view_layer.update()
    rotated_bounds = bounds(meshes)
    height = rotated_bounds[1].z - rotated_bounds[0].z
    if height <= 0:
        raise ValueError(f'Imported head has no Z height after rotation: {source}')
    scale = args.head_height / height if args.head_height is not None else 1
    root.matrix_world = Matrix.Scale(scale, 4) @ root.matrix_world
    bpy.context.view_layer.update()
    fitted_bounds = bounds(meshes)
    used_materials = {mat for obj in meshes for mat in obj.data.materials if mat}
    report = {
        'source': str(source), 'sourceBounds': [list(v) for v in source_bounds],
        'bounds': [list(v) for v in fitted_bounds], 'rotationDegreesXYZ': args.rotation_deg,
        'uniformScale': scale, 'requestedHeadHeight': args.head_height,
        'coordinates': 'Blender Z-up; front -Y; no translation or shape edits',
        'objects': [mesh_report(obj) for obj in meshes],
        'materials': [material_report(mat) for mat in sorted(used_materials, key=lambda mat: mat.name)],
        'notes': ['Components and non-manifold counts describe indexed mesh connectivity; UV-split vertices may inflate them.',
                  'Gray renders override all materials, including transparent eye or eyelash surfaces.'],
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / 'inspection.json').write_text(json.dumps(report, indent=2) + '\n')
    center, span, camera = setup_scene(*fitted_bounds)
    clay = bpy.data.materials.new('Inspection gray')
    clay.use_nodes = True
    bsdf = next(node for node in clay.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (.45, .45, .45, 1)
    bsdf.inputs['Roughness'].default_value = .8
    for mode, material in [('material', None), ('gray', clay)]:
        bpy.context.view_layer.material_override = material
        for view, direction in VIEWS.items():
            camera.location = center + Vector(direction).normalized() * span * 4
            camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
            bpy.context.scene.render.filepath = str(output / f'{mode}-{view}.png')
            bpy.ops.render.render(write_still=True)
    bpy.context.view_layer.material_override = None
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'candidate.blend'))
    print('HEAD_INSPECTION', json.dumps({'output': str(output), 'meshes': len(meshes), 'scale': scale}))


if __name__ == '__main__':
    main()
