"""Build downward-facing nostril recesses in the standalone D1 nose surface."""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from inspect_standalone_head import bounds, main as inspect_candidate

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / 'assets/characters/grassy/customization/models/d1-head-standalone'
SOURCE = DIRECTORY / 'nose-lip-refinement/refined-head.glb'
OUTPUT = DIRECTORY / 'nostril-refinement'
VIEWS = {'front': Vector((0, -1, 0)), 'right': Vector((-1, 0, 0)),
         'three-quarter': Vector((-1, -1, 0)).normalized(),
         'low-angle': Vector((0, -1, -.8)).normalized()}


def in_nose(point):
    return abs(point.x) < .115 and point.y < -.68 and .505 < point.z < .650


def corner_key(mesh, loop):
    point = mesh.vertices[loop.vertex_index].co
    uv = mesh.uv_layers.active.data[loop.index].uv
    return tuple(round(value, 6) for value in (*point, *uv))


def cavity_patch(bm, sign, material_index):
    cx, cy, rx, ry = sign * .034, -.773, .019, .018
    selected = {face for face in bm.faces if .53 < face.calc_center_median().z < .650
                and face.normal.z < -.12
                and ((face.calc_center_median().x - cx) / rx) ** 2
                + ((face.calc_center_median().y - cy) / ry) ** 2 < 1}
    remaining = set(selected)
    components = []
    while remaining:
        component = {remaining.pop()}
        pending = list(component)
        while pending:
            face = pending.pop()
            for edge in face.edges:
                for neighbor in edge.link_faces:
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        component.add(neighbor)
                        pending.append(neighbor)
        components.append(component)
    selected = max(components, key=len)
    # Triangle-centroid selection can leave point-touching notches; fill the local fan.
    for _ in range(3):
        boundary = {edge for face in selected for edge in face.edges
                    if sum(link in selected for link in edge.link_faces) == 1}
        corners = {vertex for edge in boundary for vertex in edge.verts
                   if sum(link in boundary for link in vertex.link_edges) > 2}
        if not corners:
            break
        selected.update(face for vertex in corners for face in vertex.link_faces)
    boundary = {edge for face in selected for edge in face.edges
                if sum(link in selected for link in edge.link_faces) == 1}
    vertices = {vertex for edge in boundary for vertex in edge.verts}
    assert selected and all(sum(edge in boundary for edge in vertex.link_edges) == 2 for vertex in vertices), f'Nasal patch {sign} does not have one closed boundary'
    first = min(vertices, key=lambda vertex: vertex.co.x)
    ring = [first]
    previous = None
    while True:
        following = next(edge.other_vert(ring[-1]) for edge in ring[-1].link_edges
                         if edge in boundary and edge.other_vert(ring[-1]) != previous)
        if following == first:
            break
        previous = ring[-1]
        ring.append(following)
    assert len(ring) == len(vertices), 'Nasal patch contains multiple boundary loops'
    area = sum(vertex.co.x * ring[(i + 1) % len(ring)].co.y - vertex.co.y * ring[(i + 1) % len(ring)].co.x
               for i, vertex in enumerate(ring))
    if area > 0:
        ring.reverse()
    uv_layer = bm.loops.layers.uv.active
    uvs = [next(loop[uv_layer].uv.copy() for loop in vertex.link_loops if loop.face not in selected) for vertex in ring]
    uv_center = sum(uvs, Vector((0, 0))) / len(uvs)
    positions = [vertex.co.copy() for vertex in ring]
    distances = [(positions[(i + 1) % len(ring)].xy - point.xy).length for i, point in enumerate(positions)]
    angle = math.atan2((positions[0].y - cy) / ry, (positions[0].x - cx) / rx)
    angles = []
    for distance in distances:
        angles.append(angle)
        angle -= 2 * math.pi * distance / sum(distances)
    bmesh.ops.delete(bm, geom=list(selected), context='FACES')
    rings = [ring]
    ring_uvs = [uvs]
    # Transition from the existing nasal slope into a rolled, downward-facing rim.
    recipes = [(.84 * rx, .84 * ry, 0, 0, .25), (.012, .010, 0, 0, 1),
               (.010, .0075, .001, 0, 1), (.0088, .0066, .007, .0005, 1),
               (.0076, .0057, .017, .001, 1), (.0046, .0033, .025, .002, 1)]
    for ring_index, (width, depth, rise, back, blend) in enumerate(recipes, 1):
        current, current_uv = [], []
        for original, angle, uv in zip(positions, angles, uvs):
            x = cx + width * math.cos(angle)
            y = cy + back + depth * math.sin(angle)
            plane = .582 + .60 * (abs(x) - .034) + .05 * (y - cy)
            z = original.z * (1 - blend) + (plane + rise) * blend
            current.append(bm.verts.new((x, y, z)))
            current_uv.append(uv.lerp(uv_center, 1 - width / rx))
        rings.append(current)
        ring_uvs.append(current_uv)
        for i in range(len(ring)):
            j = (i + 1) % len(ring)
            face = bm.faces.new((rings[-2][i], rings[-2][j], current[j], current[i]))
            face.material_index = material_index if ring_index >= 4 else 0
            for loop, uv in zip(face.loops, (ring_uvs[-2][i], ring_uvs[-2][j], current_uv[j], current_uv[i])):
                loop[uv_layer].uv = uv
    center = bm.verts.new((cx, cy + .002, .610))
    for i in range(len(ring)):
        j = (i + 1) % len(ring)
        face = bm.faces.new((rings[-1][i], rings[-1][j], center))
        face.material_index = material_index
        for loop, uv in zip(face.loops, (ring_uvs[-1][i], ring_uvs[-1][j], uv_center)):
            loop[uv_layer].uv = uv
    record = {'centerXY': [cx, cy], 'openingRadii': [.010, .0075], 'openingZ': .583,
              'depth': .027, 'outwardSlope': .60, 'boundaryVertices': len(ring), 'replacedFaces': len(selected)}
    return record, set(rings[0] + rings[1] + rings[2]), set(vertex for group in rings[3:] for vertex in group) | {center}


def visibility(mesh, inner_indices):
    tree = BVHTree.FromPolygons([vertex.co for vertex in mesh.vertices], [face.vertices[:] for face in mesh.polygons])
    result = {}
    for name, direction in VIEWS.items():
        visible = []
        for index in inner_indices:
            center = mesh.polygons[index].center
            _, _, hit_index, _ = tree.ray_cast(center + direction * 4, -direction, 4.001)
            if hit_index in inner_indices:
                visible.append(index)
        result[name] = {'visibleInnerFaceSamples': len(visible), 'totalInnerFaces': len(inner_indices)}
    return result


def render_extra_views(output):
    scene = bpy.context.scene
    camera = scene.camera
    objects = [obj for obj in scene.objects if obj.type == 'MESH']
    low, high = bounds(objects)
    head_center = (low + high) / 2
    head_span = camera.data.ortho_scale / 1.15
    clay = bpy.data.materials['Inspection gray']
    for mode, material in [('material', None), ('gray', clay)]:
        bpy.context.view_layer.material_override = material
        for focus, center, span, views in [
            ('head', head_center, head_span, {'low-angle': VIEWS['low-angle']}),
            ('nose', Vector((0, -.753, .590)), .29, VIEWS),
        ]:
            camera.data.ortho_scale = span * 1.15
            for view, direction in views.items():
                camera.location = center + direction * 4
                camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
                filename = f'{mode}-{view}.png' if focus == 'head' else f'{mode}-nose-{view}.png'
                scene.render.filepath = str(output / filename)
                bpy.ops.render.render(write_still=True)
    bpy.context.view_layer.material_override = None
    camera.data.ortho_scale = head_span * 1.15
    camera.location = head_center + VIEWS['three-quarter'] * head_span * 4
    camera.rotation_euler = (head_center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'candidate.blend'))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
    mesh = obj.data
    protected = {corner_key(mesh, loop): mesh.corner_normals[loop.index].vector.copy()
                 for loop in mesh.loops if not in_nose(mesh.vertices[loop.vertex_index].co)}
    original_bounds = bounds([obj])
    original_nose = [list(vertex.co) for vertex in mesh.vertices if in_nose(vertex.co)]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    # GLB stores UV seams as duplicate positions; weld geometry while keeping loop UVs.
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
    edges = [edge for edge in bm.edges if all(in_nose(vertex.co) for vertex in edge.verts)]
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=3, use_grid_fill=True)
    inner = bpy.data.materials.new('D1 nostril inner skin')
    inner.use_nodes = True
    bsdf = next(node for node in inner.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (.791, .434, .346, 1)
    bsdf.inputs['Roughness'].default_value = .8
    mesh.materials.append(inner)
    bm.normal_update()
    patches = [cavity_patch(bm, sign, len(mesh.materials) - 1) for sign in (-1, 1)]
    cavities = [patch[0] for patch in patches]
    transition = set().union(*(patch[1] for patch in patches))
    pinned = set().union(*(patch[2] for patch in patches))
    for _ in range(2):
        transition.update(edge.other_vert(vertex) for vertex in list(transition) for edge in vertex.link_edges
                          if edge.other_vert(vertex) not in pinned and in_nose(edge.other_vert(vertex).co))
    for _ in range(16):
        updates = {vertex: vertex.co.lerp(sum((edge.other_vert(vertex).co for edge in vertex.link_edges), Vector()) / len(vertex.link_edges), .45)
                   for vertex in transition}
        for vertex, point in updates.items():
            vertex.co = point
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    mesh = obj.data
    for face in mesh.polygons:
        face.use_smooth = True
    mesh.normals_split_custom_set([(0, 0, 0)] * len(mesh.loops))
    mesh.update()
    normals = [normal.vector.copy() for normal in mesh.corner_normals]
    restored = set()
    for loop in mesh.loops:
        key = corner_key(mesh, loop)
        if key in protected:
            normals[loop.index] = protected[key]
            restored.add(key)
    assert restored == protected.keys(), f'Protected UV/position corners lost: {len(protected.keys() - restored)}'
    mesh.normals_split_custom_set(normals)
    mesh.update()
    inner_indices = {face.index for face in mesh.polygons if mesh.materials[face.material_index] == inner}
    assert inner_indices, 'Nasal surface replacement did not create cavity walls'
    bm = bmesh.new()
    bm.from_mesh(mesh)
    invalid = [edge for edge in bm.edges if not edge.is_manifold]
    assert not invalid, f'Nostril construction left {len(invalid)} non-manifold edges'
    bm.free()
    assert all(math.isfinite(value) for normal in mesh.corner_normals for value in normal.vector), 'Non-finite surface normals'
    report = {'source': str(SOURCE), 'sourceBounds': [list(value) for value in original_bounds],
              'bounds': [list(value) for value in bounds([obj])], 'originalNoseVertexCount': len(original_nose),
              'cavities': cavities, 'cavityFaces': len(inner_indices),
              'vertices': len(mesh.vertices), 'faces': len(mesh.polygons), 'nonManifoldEdges': 0,
              'protectedPositionUVCornerCount': len(protected), 'protectedPositionUVNormalsPreserved': True,
              'visibility': visibility(mesh, inner_indices),
              'method': 'Replace two nasal underside patches with continuous rolled rims, inward walls and blind caps; no floating or added dark geometry'}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'structure.json').write_text(json.dumps(report, indent=2) + '\n')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    target = OUTPUT / 'refined-head.glb'
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
                             export_animations=False, export_cameras=False, export_lights=False)
    sys.argv = ['inspect_standalone_head.py', '--', '--input', str(target), '--output-dir', str(OUTPUT)]
    inspect_candidate()
    render_extra_views(OUTPUT)
    print('D1_NOSTRILS', json.dumps({key: value for key, value in report.items() if key != 'undersideChanges'}))


if __name__ == '__main__':
    main()
