"""Import the downloaded D1 OBJ without reshaping it; audit and export previews."""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from uuid import UUID

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-id', type=UUID, required=True, help='Rodin asset UUID')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
source_id = str(args.source_id)
asset_name = f'd1-rodin-{source_id[:8]}'
SOURCE = ROOT / 'assets/characters/grassy/customization/models' / asset_name
OUTPUT = SOURCE / 'inspection'
PUBLIC = ROOT / 'public/characters/human/customization'
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
import scene as studio

OUTPUT.mkdir(exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
source_faces = [tuple(int(token.split('/')[0]) for token in line.split()[1:])
                for line in (SOURCE / 'base.obj').read_text().splitlines() if line.startswith('f ')]
source_unique_faces = {tuple(sorted(face)) for face in source_faces}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=str(SOURCE / 'base.obj'), forward_axis='NEGATIVE_Z', up_axis='Y')
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
if not meshes:
    raise ValueError('Downloaded OBJ contains no meshes')
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum = Vector(tuple(min(p[i] for p in points) for i in range(3)))
maximum = Vector(tuple(max(p[i] for p in points) for i in range(3)))
scale = 3.1 / (maximum.z - minimum.z)
center = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
report = {'source': source_id,
          'sourceFaces': len(source_faces),
          'duplicateSourceFacesRemovedByImporter': len(source_faces) - len(source_unique_faces),
          'normalization': {'height': 3.1, 'uniformScale': scale, 'sourceBounds': [list(minimum), list(maximum)]},
          'objects': [], 'rigged': False, 'animations': [],
          'limits': ['UV overlap and self-intersection are not automatically checked.',
                     'Quad count alone does not establish deformation-ready edge flow.']}
for obj in meshes:
    mesh = obj.data
    if not mesh.uv_layers.active:
        raise ValueError(f'{obj.name}: missing UV coordinates')
    matrix = obj.matrix_world.copy()
    obj.matrix_world.identity()
    for vertex in mesh.vertices:
        vertex.co = (matrix @ vertex.co - center) * scale
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    unseen = set(bm.verts)
    components = []
    component_vertices = []
    while unseen:
        stack = [unseen.pop()]
        component = []
        while stack:
            vertex = stack.pop()
            component.append(vertex)
            for edge in vertex.link_edges:
                neighbor = edge.other_vert(vertex)
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    stack.append(neighbor)
        component_edges = {e for v in component for e in v.link_edges}
        component_vertices.append(component)
        components.append({'vertices': len(component),
            'boundaryEdges': sum(e.is_boundary for e in component_edges),
            'bounds': [[min(v.co[i] for v in component) for i in range(3)],
                       [max(v.co[i] for v in component) for i in range(3)]]})
    cleanup = {'removedIsolatedFaces': 0, 'removedIsolatedVertices': 0}
    if source_id == '83da83be-f48f-4422-b9ff-4c9d2b75680b':
        # This download was audited to contain exactly six disconnected triangle fragments.
        fragments = [vs for vs in component_vertices
                     if len(vs) == 3 and len({f for v in vs for f in v.link_faces}) == 1]
        main = max(component_vertices, key=len)
        if len(meshes) != 1 or len(components) != 7 or len(main) != 19179 or len(fragments) != 6:
            raise ValueError(f'{source_id}: geometry differs from the audited six-fragment download')
        cleanup['beforeCleanup'] = {
            'vertices': len(bm.verts), 'faces': len(bm.faces),
            'faceSizes': dict(Counter(len(f.verts) for f in bm.faces)),
            'boundaryEdges': sum(e.is_boundary for e in bm.edges),
            'nonManifoldEdges': sum(not e.is_manifold for e in bm.edges),
            'connectedComponents': sorted(components, key=lambda c: c['vertices'], reverse=True),
        }
        main_positions = [(v, v.co.copy()) for v in main]
        removed_vertices = [v for vs in fragments for v in vs]
        assert not set(main).intersection(removed_vertices), 'Cleanup would remove the main mesh'
        bmesh.ops.delete(bm, geom=removed_vertices, context='VERTS')
        assert all(v.is_valid and v.co == position for v, position in main_positions), 'Cleanup altered the main mesh'
        assert len(bm.verts) == 19179 and len(bm.faces) == cleanup['beforeCleanup']['faces'] - 6
        bm.to_mesh(mesh)
        mesh.update()
        assert mesh.uv_layers.active is not None, 'Cleanup removed the UV layer'
        assert len(mesh.uv_layers.active.data) == len(mesh.loops), 'Cleanup lost face UV coordinates'
        components = [details for details, vs in zip(components, component_vertices) if vs is main]
        cleanup['removedIsolatedFaces'] = 6
        cleanup['removedIsolatedVertices'] = len(removed_vertices)
    uv = mesh.uv_layers.active.data
    collapsed_uv = 0
    for face in mesh.polygons:
        coords = [uv[i].uv for i in face.loop_indices]
        area = sum(a.x * b.y - b.x * a.y for a, b in zip(coords, coords[1:] + coords[:1])) / 2
        collapsed_uv += abs(area) < 1e-12
    report['objects'].append({'name': obj.name, **cleanup, 'vertices': len(mesh.vertices),
        'faces': len(mesh.polygons), 'faceSizes': dict(Counter(len(p.vertices) for p in mesh.polygons)),
        'boundaryEdges': sum(e.is_boundary for e in bm.edges),
        'nonManifoldEdges': sum(not e.is_manifold for e in bm.edges),
        'wireEdges': sum(e.is_wire for e in bm.edges),
        'inconsistentWindingEdges': sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
        'degenerateFaces': sum(f.calc_area() < 1e-12 for f in bm.faces),
        'connectedComponents': sorted(components, key=lambda c: c['vertices'], reverse=True),
        'collapsedUvFaces': collapsed_uv,
        'uvOutsideUnitSquare': sum(not (0 <= p.uv.x <= 1 and 0 <= p.uv.y <= 1) for p in uv)})
    bm.free()

material = bpy.data.materials.new('D1 original Rodin PBR')
material.use_nodes = True
nodes = material.node_tree.nodes
links = material.node_tree.links
bsdf = nodes['Principled BSDF']
def texture(filename, color_space):
    node = nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(str(SOURCE / filename), check_existing=True)
    node.image.colorspace_settings.name = color_space
    return node

color = texture('texture_diffuse.png', 'sRGB')
links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
for filename, socket in [('texture_roughness.png', 'Roughness'), ('texture_metallic.png', 'Metallic')]:
    links.new(texture(filename, 'Non-Color').outputs['Color'], bsdf.inputs[socket])
normal = nodes.new('ShaderNodeNormalMap')
links.new(texture('texture_normal.png', 'Non-Color').outputs['Color'], normal.inputs['Color'])
links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
clay = studio.principled('D1 neutral geometry check', '#b6b6b6', 0.85)
albedo = bpy.data.materials.new('D1 unlit base-color check')
albedo.use_nodes = True
an = albedo.node_tree.nodes
an.clear()
ao = an.new('ShaderNodeOutputMaterial')
ae = an.new('ShaderNodeEmission')
at = an.new('ShaderNodeTexImage')
at.image = color.image
albedo.node_tree.links.new(at.outputs['Color'], ae.inputs['Color'])
albedo.node_tree.links.new(ae.outputs['Emission'], ao.inputs['Surface'])

def assign(mat):
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        for face in obj.data.polygons:
            face.material_index = 0

def export(mat, name):
    assign(mat)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    target = PUBLIC / name
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
                             export_animations=False, export_yup=True)
    if target.read_bytes()[:4] != b'glTF':
        raise ValueError(f'Invalid export: {target}')

export(material, f'{asset_name}-pbr.glb')
export(clay, f'{asset_name}-clay.glb')
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = True
studio.studio()
for obj in scene.objects:
    if obj.type == 'LIGHT':
        obj.data.color = (1, 1, 1)
for mode, mat, views, focus in [
    ('pbr', material, ('front', 'right', 'back'), 'full'),
    ('pbr', material, ('front', 'right'), 'head'),
    ('clay', clay, ('front', 'right'), 'head'),
    ('albedo', albedo, ('front',), 'full'),
]:
    assign(mat)
    for view in views:
        studio.render(view, focus, OUTPUT / f'{mode}-{view}-{focus}.png', 16)
assign(material)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'd1-inspection.blend'))
(OUTPUT / 'quality-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('D1 import and inspection complete', json.dumps(report))
