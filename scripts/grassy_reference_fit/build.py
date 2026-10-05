"""Fit the editable character to approved front/side landmarks and render real views."""
import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SOURCE = ROOT / 'assets/characters/grassy/history/model-reference-fit'
PUBLIC = ROOT / 'public/characters/human/history/models-reference-fit'
sys.path.insert(0, str(ROOT / 'scripts/grassy_atelier'))
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True

studio_spec = importlib.util.spec_from_file_location('atelier_studio', ROOT / 'scripts/grassy_atelier/build.py')
studio_tools = importlib.util.module_from_spec(studio_spec)
studio_spec.loader.exec_module(studio_tools)
from common import activate, collection, materials
from face_fit import sculpt_head, eyes_and_brows, mouth_and_ears
from hair_fit import build_hair


def load_outfit():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/characters/grassy/history/model-atelier/grassy-atelier-detailed.blend'))
    keep = []
    for obj in list(bpy.data.objects):
        retain = obj.type == 'MESH' and (any(c.name.startswith('Outfit') for c in obj.users_collection)
                                       or obj.name.startswith(('Hand ', 'Ankle ')))
        if retain:
            keep.append(obj)
        else:
            bpy.data.objects.remove(obj, do_unlink=True)
    # Undo the source's display normalization before rebuilding fitted features.
    inverse_display = Matrix.Diagonal((1 / 1.011089325,) * 3 + (1,)) @ Matrix.Translation((0, 0, .012133072))
    for obj in keep:
        obj.matrix_world = Matrix.Diagonal((1.015, 1, 1, 1)) @ inverse_display @ obj.matrix_world
    bpy.context.view_layer.update()
    return keep


def garment_fit(objects):
    """Raise the collar, round the hem and add sleeve fullness at the cuff."""
    for obj in objects:
        if not any('sweater' in m.name.lower() or 'rib' in m.name.lower() for m in obj.data.materials):
            continue
        inverse = obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            p = obj.matrix_world @ vertex.co
            p.z -= .022 * min(1, max(0, (p.z - 1.84) / .16)) ** 2
            torso = max(0, 1 - (abs(p.x) / .39) ** 4)
            lower = math.exp(-((p.z - 1.42) / .17) ** 2)
            p.y *= 1 + .10 * torso * lower
            p.y += .004 * torso * math.sin(p.x * 17 + p.z * 11) * lower
            vertex.co = inverse @ p
        obj.data.update()
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        if 'sweater' in mat.name.lower():
            for node in mat.node_tree.nodes:
                if node.type == 'NORMAL_MAP':
                    node.inputs['Strength'].default_value = .30


def export(objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    copies = []
    for original in objects:
        evaluated = original.evaluated_get(depsgraph)
        data = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        obj = bpy.data.objects.new(original.name, data)
        obj.matrix_world = original.matrix_world.copy()
        bpy.context.scene.collection.objects.link(obj)
        copies.append(obj)
    groups = {}
    for obj in copies:
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    merged = []
    for members in groups.values():
        activate(members)
        if len(members) > 1:
            bpy.ops.object.join()
        merged.append(bpy.context.object)
    activate(merged)
    path = PUBLIC / 'grassy-reference-fit.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                             export_yup=True, export_apply=True, export_materials='EXPORT',
                             export_animations=False, export_skins=False,
                             export_cameras=False, export_lights=False)
    triangles = 0
    for obj in merged:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    low, high = studio_tools.bounds(merged)
    report = {'name': '参考校准版', 'method': 'reference-fit',
              'description': 'Front/side constrained face, embedded eyes, flatter layered solid hair and garment volume fitting',
              'base': 'atelier editable outfit and hands; rebuilt face and hair',
              'triangles': triangles, 'materials': len(groups), 'meshes': len(merged),
              'height': high[2] - low[2], 'width': high[0] - low[0], 'depth': high[1] - low[1],
              'static': True, 'glbBytes': path.stat().st_size,
              'glb': str(path.relative_to(ROOT)),
              'blend': str((SOURCE / 'grassy-reference-fit.blend').relative_to(ROOT)),
              'references': ['public/characters/human/history/turnaround-master-v2/front.png',
                             'public/characters/human/history/turnaround-master-v2/right.png']}
    landmarks = json.loads((SOURCE / 'fit-evidence/landmark-report.json').read_text())
    report['fitEvidence'] = {
        'directory': str((SOURCE / 'fit-evidence').relative_to(ROOT)),
        'landmarkCount': len(landmarks['landmarks']),
        'landmarkTolerancePx': landmarks['tolerance_px'],
        'allLandmarksWithinTolerance': landmarks['all_pass'],
        'maximumLandmarkErrorPx': max(row['distance_px'] for row in landmarks['landmarks']),
        'skills': ['multiview-fit-loop', 'landmark-fit-repair'],
    }
    report['limitations'] = [
        'Static high-resolution comparison candidate; no rig or animation.',
        'Measured alignment checks proportions, not final artistic likeness.',
        'Hair clump shapes remain stylized and more regular than the reference.',
    ]
    (PUBLIC / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    for obj in merged:
        bpy.data.objects.remove(obj, do_unlink=True)
    print('REFERENCE_FIT_EXPORT ' + json.dumps(report), flush=True)


def render(camera, views, samples, size, head):
    scene = bpy.context.scene
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 3
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    for view in views:
        studio_tools.set_view(camera, view, size)
        if head:
            z = 2.52
            direction = {'front': (0, -8, z), 'right': (-8, 0, z),
                         'hero': (-5.5, -8, 2.75)}[view]
            camera.location = direction
            camera.rotation_euler = (Vector((0, 0, z)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
            camera.data.ortho_scale = 1.22
            scene.render.resolution_y = size
        scene.render.filepath = str(PUBLIC / f'{"preview-head" if head else "render"}-{view}.png')
        bpy.ops.render.render(write_still=True)
        print('REFERENCE_FIT_RENDER ' + view, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--views', default='front,right,hero')
    parser.add_argument('--samples', type=int, default=12)
    parser.add_argument('--size', type=int, default=640)
    parser.add_argument('--head', action='store_true')
    parser.add_argument('--render-only', action='store_true')
    parser.add_argument('--export', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    SOURCE.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    studio_tools.PUBLIC, studio_tools.SOURCE = PUBLIC, SOURCE
    if args.render_only:
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'grassy-reference-fit.blend'))
        camera = bpy.context.scene.camera
        objects = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Studio')]
    else:
        outfit = load_outfit()
        garment_fit(outfit)
        mats = materials()
        head, neck, plain, tinted = sculpt_head(mats)
        face = [head, neck, *eyes_and_brows(mats, plain, tinted), *mouth_and_ears(mats, plain, tinted)]
        # Registered front and side eye/nose/chin landmarks put the facial mass lower.
        for obj in face:
            obj.location.z -= .044
        hair = build_hair(mats)
        for obj in hair:
            for vertex in obj.data.vertices:
                vertex.co.z -= .044 * min(1, max(0, (3.0 - vertex.co.z) / .66))
                p = vertex.co
                # Side silhouettes place the crown farther behind the facial plane.
                shift = 1 if p.y > .02 else min(1, max(0, (p.z - 2.56) / .22))
                p.y += .052 * shift
                ear_region = ((p.y - .085) / .105) ** 2 + ((p.z - 2.285) / .145) ** 2
                if ear_region < 1 and abs(p.x) > .275:
                    weight = (1 - ear_region) ** .55
                    p.x = math.copysign(abs(p.x) * (1 - weight) + .275 * weight, p.x)
            obj.data.update()
        collection('Reference fit • facial anatomy', face)
        collection('Reference fit • layered solid hair', hair)
        objects = [*outfit, *face, *hair]
        studio_tools.normalize(objects)
        camera = studio_tools.studio()
        bpy.context.scene['method'] = 'Reference-constrained editable sculpture; full 3D mesh, static'
        studio_tools.reference_collection()
        studio_tools.set_view(camera, 'hero', args.size)
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'grassy-reference-fit.blend'))
    if args.export:
        export(objects)
    render(camera, args.views.split(',') if args.views else [], args.samples, args.size, args.head)


if __name__ == '__main__':
    main()
