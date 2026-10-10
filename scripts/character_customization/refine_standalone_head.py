"""Small nose/lip corrections on the standalone D1 candidate, preserving source UVs."""
import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from inspect_standalone_head import bounds, main as inspect_candidate

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / 'assets/characters/grassy/customization/models/d1-head-standalone'
SOURCE = DIRECTORY / 'source/base_basic_pbr.glb'
OUTPUT = DIRECTORY / 'nose-lip-refinement'


def falloff(value):
    return (1 - value * value) ** 2 if abs(value) < 1 else 0


def displacement(x, y, z):
    if y >= -.60:
        return 0
    # Measurements use the downloaded head's unchanged Blender coordinates.
    nose = .024 * falloff(x / .13) * falloff((z - .622) / .10)
    lower_lip = .010 * falloff(x / .10) * falloff((z - .425) / .047)
    corners = -.006 * falloff((abs(x) - .127) / .047) * falloff((z - .485) / .040)
    return nose + lower_lip + corners


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(meshes) != 1:
        raise ValueError(f'Expected one D1 head mesh in {SOURCE}; got {len(meshes)}')
    obj = meshes[0]
    minimum, maximum = bounds(meshes)
    if any(abs(value) > 1e-6 for row in obj.matrix_world - Matrix.Identity(4) for value in row) or abs(maximum.z - 1.890785) > .0001:
        raise ValueError('D1 candidate coordinate contract changed; remeasure nose and lip landmarks')
    mesh = obj.data
    original = [vertex.co.copy() for vertex in mesh.vertices]
    uv_before = [[tuple(loop.uv) for loop in layer.data] for layer in mesh.uv_layers]
    normals = [normal.vector.copy() for normal in mesh.corner_normals]
    derivatives = {}
    changes = []
    epsilon = .00001
    for vertex, point in zip(mesh.vertices, original):
        x, y, z = point
        delta = displacement(x, y, z)
        if delta == 0:
            continue
        vertex.co.y += delta
        derivatives[vertex.index] = (
            (displacement(x + epsilon, y, z) - displacement(x - epsilon, y, z)) / (2 * epsilon),
            (displacement(x, y, z + epsilon) - displacement(x, y, z - epsilon)) / (2 * epsilon),
        )
        changes.append({'vertex': vertex.index, 'before': list(point), 'delta': [0, delta, 0]})
    # Transform the imported split normals with the same local deformation;
    # recalculating every normal would also change untouched eye/ear shading.
    for loop, normal in zip(mesh.loops, normals):
        if loop.vertex_index in derivatives:
            dx, dz = derivatives[loop.vertex_index]
            normal.x -= dx * normal.y
            normal.z -= dz * normal.y
            normal.normalize()
    mesh.normals_split_custom_set(normals)
    mesh.update()
    assert changes, 'D1 nose/lip correction did not touch any vertices'
    assert uv_before == [[tuple(loop.uv) for loop in layer.data] for layer in mesh.uv_layers], 'UVs changed'
    assert all(vertex.co == point for vertex, point in zip(mesh.vertices, original)
               if abs(point.x) >= .20 or point.z >= .73 or point.z <= .37 or point.y >= -.60), 'Protected eye/ear/skull/chin region moved'
    assert max(abs(change['delta'][1]) for change in changes) <= .024001, 'D1 correction exceeded measured nose displacement'
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = {
        'source': str(SOURCE), 'sourceBounds': [list(minimum), list(maximum)],
        'bounds': [list(v) for v in bounds(meshes)], 'changedVertices': len(changes),
        'maxDisplacement': max(abs(change['delta'][1]) for change in changes),
        'uvUnchanged': True, 'protectedRegionsUnchanged': True,
        'corrections': {'noseTipRetraction': .024, 'lowerLipRetraction': .010, 'lipCornerRecessFill': .006},
        'normalUpdate': 'Inverse-transpose local deformation Jacobian; original split normals retained outside edited region',
        'vertexChanges': changes,
    }
    (OUTPUT / 'refinement.json').write_text(json.dumps(report, indent=2) + '\n')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    target = OUTPUT / 'refined-head.glb'
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
                             export_animations=False, export_cameras=False, export_lights=False)
    sys.argv = ['inspect_standalone_head.py', '--', '--input', str(target), '--output-dir', str(OUTPUT)]
    inspect_candidate()
    print('D1_HEAD_REFINED', json.dumps({key: value for key, value in report.items() if key != 'vertexChanges'}))


if __name__ == '__main__':
    main()
