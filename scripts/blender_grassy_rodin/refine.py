"""Locally refine the Rodin source while retaining its topology, UVs and identity.

blender --background --threads 3 --python scripts/blender_grassy_rodin/refine.py
Use -- --geometry-preview for a four-view checkpoint before material calibration.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
sys.path.insert(0, str(Path(__file__).parent))
sys.dont_write_bytecode = True
import scene

RAW = ROOT / 'assets/characters/grassy/history/model-rodin/raw-01/base_basic_pbr.glb'
SOURCE = ROOT / 'assets/characters/grassy/history/model-rodin-refined'
OUT = ROOT / 'public/characters/human/history/models-rodin-refined'
EVIDENCE = SOURCE / 'evidence'
MASTER = SOURCE / 'grassy-rodin-refined-master.blend'
TIERS = {'detailed': (500_000, 2048), 'game': (45_000, 1024), 'light': (20_000, 512)}
EYE_ROTATION_DEGREES = 12.0


def vector_field(p):
    """Compact smooth fields keep each correction away from unrelated features."""
    d = np.zeros_like(p)

    def edit(center, radii, translation, scale=(0, 0, 0)):
        q = p - center
        distance = np.sum((q / radii) ** 2, axis=1)
        w = np.maximum(0, 1 - distance) ** 3
        d[:] += w[:, None] * (np.asarray(translation) + q * scale)

    edit((0, -.455, 2.278), (.105, .075, .080), (0, .015, 0))
    edit((0, -.405, 2.206), (.175, .080, .068), (0, .008, .001))
    edit((0, -.340, 2.095), (.225, .130, .085), (0, .007, -.008))
    edit((0, -.145, 2.082), (.235, .160, .115), (0, 0, .026))
    for side in (-1, 1):
        # The eyeball, lid and painted iris all follow the original surface together.
        q = p - (side * .176, -.366, 2.358)
        radius = np.sqrt(np.sum((q / (.153, .156, .147)) ** 2, axis=1))
        blend = np.clip((1 - radius) / .45, 0, 1)
        blend = blend * blend * (3 - 2 * blend)
        angle = side * np.deg2rad(EYE_ROTATION_DEGREES) * blend
        cosine, sine = np.cos(angle), np.sin(angle)
        d[:, 0] += cosine * q[:, 0] - sine * q[:, 1] - q[:, 0]
        d[:, 1] += sine * q[:, 0] + cosine * q[:, 1] - q[:, 1]
        edit((side * .176, -.366, 2.358), (.126, .110, .112),
             (0, 0, .005), (0, 0, .16))
        edit((side * .205, -.305, 2.214), (.160, .120, .147),
             (side * .023, -.003, .006))
        # Move lower fingers away from the palm without disturbing the wrist/thumb.
        edit((side * .600, -.105, .970), (.115, .180, .170),
             (side * .002, -.010, -.052), (0, 0, .25))
        # Local rear strands retain their roots; the curled ends fall slightly lower.
        edit((side * .105, .456, 2.323), (.140, .115, .180),
             (side * -.008, -.008, -.046), (-.08, 0, 0))
        # Round only the upper toe/sole edge; the contact plane stays unchanged.
        edit((side * .340, -.455, .115), (.185, .085, .080),
             (0, .006, -.003))
    # Pull the bottoms into descending tips rather than translating whole U-shaped locks.
    edit((.005, .535, 2.580), (.150, .105, .240), (0, -.013, -.082), (-.20, 0, 0))
    edit((.000, .545, 2.435), (.215, .100, .180), (0, -.017, -.062), (-.18, 0, 0))
    return d


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.render.threads_mode = 'FIXED'
    s.render.threads = 3
    s.cycles.device = 'CPU'
    s.cycles.use_denoising = True
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'Medium High Contrast'
    s.render.film_transparent = True


def fit(ob):
    p = np.asarray([ob.matrix_world @ v.co for v in ob.data.vertices])
    lo, hi = p.min(0), p.max(0)
    center = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]))
    ob.matrix_world = Matrix.Scale(scene.HEIGHT / (hi[2] - lo[2]), 4) @ Matrix.Translation(-center) @ ob.matrix_world
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def uv_hash(mesh):
    values = np.empty(len(mesh.uv_layers.active.data) * 2, np.float32)
    mesh.uv_layers.active.data.foreach_get('uv', values)
    return hashlib.sha256(values.tobytes()).hexdigest()


def refine_geometry(ob):
    mesh = ob.data
    p = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get('co', p)
    p = p.reshape(-1, 3)
    displacement = vector_field(p)
    source_uv = uv_hash(mesh)
    # Transform the imported split normals too, preserving smooth UV seams.
    normals = np.empty(len(mesh.loops) * 3, np.float32)
    mesh.corner_normals.foreach_get('vector', normals)
    normals = normals.reshape(-1, 3)
    vertex_index = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get('vertex_index', vertex_index)
    jacobian = np.broadcast_to(np.eye(3), (len(p), 3, 3)).copy()
    epsilon = .0001
    for axis in range(3):
        delta = np.zeros(3)
        delta[axis] = epsilon
        jacobian[:, :, axis] += (vector_field(p + delta) - vector_field(p - delta)) / (2 * epsilon)
    inverse_transpose = np.swapaxes(np.linalg.inv(jacobian), 1, 2)
    corrected_normals = np.einsum('ijk,ik->ij', inverse_transpose[vertex_index], normals)
    corrected_normals /= np.linalg.norm(corrected_normals, axis=1)[:, None]
    mesh.vertices.foreach_set('co', (p + displacement).ravel())
    mesh.update()
    mesh.normals_split_custom_set(corrected_normals)
    centers = {'nose': (0, -.455, 2.278), 'mouth': (0, -.405, 2.206),
               'chin': (0, -.340, 2.095), 'jawTransition': (0, -.145, 2.082),
               'rearHairUpper': (.005, .535, 2.580), 'rearHairMiddle': (0, .545, 2.435)}
    for side in (-1, 1):
        centers[f'eye{side}'] = (side * .176, -.366, 2.358)
        centers[f'cheek{side}'] = (side * .205, -.305, 2.214)
        centers[f'fingers{side}'] = (side * .600, -.105, .970)
        centers[f'rearHair{side}'] = (side * .105, .456, 2.323)
        centers[f'toe{side}'] = (side * .340, -.455, .115)
    anchors = []
    for name, center in centers.items():
        index = int(np.argmin(np.linalg.norm(p - center, axis=1)))
        anchors.append({'name': name, 'operationCenter': list(center),
                        'anchorKind': 'nearest source vertex to operation center; not an automatically detected semantic landmark',
                        'sourceVertexIndex': index, 'before': p[index].tolist(),
                        'after': (p[index] + displacement[index]).tolist(),
                        'displacement': displacement[index].tolist()})
    report = {
        'sourceVertices': len(p), 'sourceTriangles': len(mesh.polygons),
        'uvSha256Before': source_uv, 'uvSha256After': uv_hash(mesh),
        'maxVertexDisplacement': float(np.linalg.norm(displacement, axis=1).max()),
        'movedVertices': int(np.count_nonzero(np.linalg.norm(displacement, axis=1) > .00001)),
        'boundsBefore': [p.min(0).tolist(), p.max(0).tolist()],
        'boundsAfter': [(p + displacement).min(0).tolist(), (p + displacement).max(0).tolist()],
        'normalMethod': 'inverse-transpose of local deformation Jacobian; source UV seams retained',
        'minimumLocalJacobianDeterminant': float(np.linalg.det(jacobian).min()),
        'eyeRotationDegrees': EYE_ROTATION_DEGREES,
        'scope': ['nose', 'mouth', 'chin', 'cheeks', 'eye opening', 'rear hair tips', 'lower fingers', 'toe edge'],
        'localAnchors': anchors,
    }
    (EVIDENCE / 'geometry-report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def source_model():
    reset()
    bpy.ops.import_scene.gltf(filepath=str(RAW))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if len(meshes) != 1:
        raise RuntimeError(f'Rodin PBR source must have one mesh; got {len(meshes)}')
    ob = meshes[0]
    fit(ob)
    refine_geometry(ob)
    return ob


def studio():
    scene.studio()
    scene._camera()


def render_views(prefix, views, samples):
    for view in views:
        scene.render(view, 'full', Path(str(prefix) + f'-{view}.png'), samples)
        print('RENDER_READY', str(prefix) + f'-{view}.png', flush=True)


def topology_counts(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    counts = {'vertices': len(bm.verts), 'faces': len(bm.faces),
              'boundaryEdges': sum(e.is_boundary for e in bm.edges)}
    bm.free()
    return counts


def build(tier, triangles, texture_size, samples):
    bpy.ops.wm.open_mainfile(filepath=str(MASTER))
    ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    ob.name = f'grassy-rodin-refined-{tier}'
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    if triangles < len(ob.data.polygons):
        topology = {'beforeWeld': topology_counts(ob.data), 'uvSha256BeforeWeld': uv_hash(ob.data)}
        # glTF splits spatial vertices at UV seams. Collapsing those boundaries
        # independently tears the surface; weld geometry while retaining loop UVs.
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=.000001)
        bpy.ops.object.mode_set(mode='OBJECT')
        topology['afterWeld'] = topology_counts(ob.data)
        topology['uvSha256AfterWeld'] = uv_hash(ob.data)
        modifier = ob.modifiers.new('Game triangle budget', 'DECIMATE')
        modifier.ratio = triangles / len(ob.data.polygons)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.delete_loose()
        bpy.ops.object.mode_set(mode='OBJECT')
        fit(ob)
        topology['afterDecimation'] = topology_counts(ob.data)
        (EVIDENCE / f'lod-{tier}-topology.json').write_text(json.dumps(topology, indent=2) + '\n')
    for image in bpy.data.images:
        if image.size[0] > texture_size:
            image.scale(texture_size, texture_size)
        image.pack()
    path = OUT / f'grassy-rodin-refined-{tier}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_animations=False,
                              export_image_format='AUTO')
    render_views(OUT / f'render-{tier}', ('front', 'right', 'back', 'left', 'hero'), samples)
    # Save a useful camera and inspection lights, rather than an unlit imported mesh.
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / f'grassy-rodin-refined-{tier}.blend'))
    if tier == 'detailed':
        for view in ('front', 'right', 'back'):
            scene.render(view, 'head', EVIDENCE / f'final-head-{view}.png', samples)
            print('RENDER_READY', EVIDENCE / f'final-head-{view}.png', flush=True)
    z = [v.co.z for v in ob.data.vertices]
    return {'id': tier, 'triangles': sum(len(p.vertices) - 2 for p in ob.data.polygons),
            'meshObjects': 1, 'materials': len(ob.data.materials),
            'height': round(max(z) - min(z), 6), 'sole': round(min(z), 6),
            'texture': texture_size, 'bytes': path.stat().st_size,
            'path': f'/characters/human/history/models-rodin-refined/{path.name}'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--geometry-preview', action='store_true')
    parser.add_argument('--from-master', action='store_true', help='Derive tiers from the existing calibrated master')
    parser.add_argument('--tiers', nargs='+', choices=list(TIERS), default=list(TIERS))
    parser.add_argument('--samples', type=int, default=32)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    SOURCE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    if args.geometry_preview:
        ob = source_model()
        ob.name = 'grassy-rodin-refined-geometry'
        studio()
        render_views(EVIDENCE / 'geometry', ('front', 'right', 'back', 'hero'), args.samples)
        for view in ('front', 'right', 'back'):
            scene.render(view, 'head', EVIDENCE / f'geometry-head-{view}.png', args.samples)
            print('RENDER_READY', EVIDENCE / f'geometry-head-{view}.png', flush=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'grassy-rodin-refined-geometry.blend'))
        return
    if not args.from_master:
        import refine_materials
        ob = source_model()
        ob.name = 'grassy-rodin-refined-master'
        refine_materials.apply(ob)
        studio()
        bpy.ops.wm.save_as_mainfile(filepath=str(MASTER))
    models = [build(tier, *TIERS[tier], args.samples) for tier in args.tiers]
    manifest_path = OUT / 'manifest.json'
    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text())['models']
        models = [m for m in existing if m['id'] not in args.tiers] + models
    manifest = {'name': 'Rodin 精修版', 'height': scene.HEIGHT, 'orientation': 'Y-up, +Z forward',
                'pose': 'static', 'reference': '/characters/human/history/turnaround-master-v2/right.png',
                'source': 'Hyper3D Rodin Gen-2.5-High raw PBR with local geometry and material refinement',
                'textureEncoding': 'lossless PNG', 'models': models}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print('FINISHED', json.dumps(manifest, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
