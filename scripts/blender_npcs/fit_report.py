"""Render actual NPC geometry against registered references without changing sources.

Blender --background --python scripts/blender_npcs/fit_report.py -- --kind sam
Add --source rigged to inspect assets/characters/sam/sam-rigged.blend in rest pose.
Optional fit-landmarks-source.json / fit-landmarks-rigged.json beside the model:
{"sourceSha256": "...", "points": {"chin": [x, y, z], "hem": [x, y, z]}}
Points are manually placed on the inspected, normalized Blender-space geometry.
Without an actual chin annotation, head proportion remains explicitly unverified.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from build import HEIGHTS, normalize, vertices_world
from studio import setup_studio

WIDTH, HEIGHT = 1024, 1536
VIEWS = {'front': (0, -1), 'back': (0, 1), 'left': (1, 0), 'right': (-1, 0)}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_pixels(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = 'Non-Color'
    width, height = image.size
    pixels = np.array(image.pixels[:], np.float32).reshape(height, width, 4)[::-1].copy()
    bpy.data.images.remove(image)
    return pixels


def save_pixels(path, pixels):
    image = bpy.data.images.new(path.stem, width=WIDTH, height=HEIGHT, alpha=True)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(pixels[::-1].astype(np.float32).ravel())
    image.filepath_raw = str(path)
    image.file_format = 'PNG'
    image.save()
    bpy.data.images.remove(image)


def registered_mask(reference, pixels):
    transform = reference['suggested_uniform_registration']
    scale, (dx, dy) = transform['scale'], transform['translation_xy']
    yy, xx = np.mgrid[:HEIGHT, :WIDTH]
    source_x = np.rint((xx - dx) / scale).astype(int)
    source_y = np.rint((yy - dy) / scale).astype(int)
    valid = ((source_x >= 0) & (source_x < WIDTH)
             & (source_y >= 0) & (source_y < HEIGHT))
    mask = np.zeros((HEIGHT, WIDTH), bool)
    mask[valid] = pixels[source_y[valid], source_x[valid], 3] > 127 / 255
    return mask


def mask_stats(mask):
    y, x = np.where(mask)
    if not len(x):
        raise ValueError('Cannot compare an empty reference or model silhouette')
    box = [int(x.min()), int(y.min()), int(x.max()), int(y.max())]
    return {'bbox': box, 'size': [box[2] - box[0] + 1, box[3] - box[1] + 1],
            'bboxCenter': [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2],
            'centroid': [float(x.mean()), float(y.mean())], 'area': int(len(x))}


def compare_masks(expected, actual, view, directory):
    ref, model = mask_stats(expected), mask_stats(actual)
    center_delta = [model['bboxCenter'][i] - ref['bboxCenter'][i] for i in (0, 1)]
    size_delta = [model['size'][i] / ref['size'][i] - 1 for i in (0, 1)]
    overlay = np.ones((HEIGHT, WIDTH, 4), np.float32)
    overlay[:, :, :3] = .035
    overlay[expected & ~actual, :3] = (1, .12, .12)
    overlay[actual & ~expected, :3] = (.05, .6, 1)
    overlay[actual & expected, :3] = (.15, .65, .3)
    save_pixels(directory / f'overlay-{view}.png', overlay)
    tolerance = .03 if view == 'front' else .05
    return {'reference': ref, 'model': model, 'bboxCenterDeltaPx': center_delta,
            'bboxSizeErrorRatio': size_delta,
            'centroidDeltaPx': [model['centroid'][i] - ref['centroid'][i] for i in (0, 1)],
            'silhouetteIoU': float(np.count_nonzero(expected & actual)
                                   / np.count_nonzero(expected | actual)),
            'bboxCenterPass': all(abs(value) <= WIDTH * .015 for value in center_delta),
            'bboxSizePass': all(abs(value) <= tolerance for value in size_delta),
            'silhouetteIoUNote': 'Diagnostic only: independent illustrations contain documented pose/detail conflicts.'}


def load_model(path, source, kind):
    if not path.is_file():
        raise FileNotFoundError(f'{kind}: actual {source} model is required: {path}')
    if source == 'source':
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        bpy.ops.wm.open_mainfile(filepath=str(path))
        for obj in bpy.context.scene.objects:
            if obj.type == 'ARMATURE':
                obj.data.pose_position = 'REST'
        bpy.context.scene.frame_set(1)
    scene = bpy.context.scene
    old_studio_objects = set()
    for collection in bpy.data.collections:
        if collection.name.startswith('NPC Studio'):
            old_studio_objects.update(collection.all_objects)
            collection.hide_render = True
    objects = [obj for obj in scene.objects if obj.type == 'MESH' and obj not in old_studio_objects]
    if not objects:
        raise ValueError(f'{kind}: model has no character mesh: {path}')
    points = vertices_world(objects)
    if not np.isfinite(points).all() or np.ptp(points[:, 2]) <= 0:
        raise ValueError(f'{kind}: model has non-finite coordinates or no vertical extent')
    imported_bounds = {'min': points.min(axis=0).tolist(), 'max': points.max(axis=0).tolist()}
    if source == 'source':
        if any(obj.type == 'ARMATURE' for obj in scene.objects):
            raise ValueError(f'{kind}: source.glb must be the static Rodin model, not a skinned export')
        normalize(objects, kind, HEIGHTS[kind])
    bpy.context.view_layer.update()
    points = vertices_world(objects)
    return objects, imported_bounds, points.min(axis=0), points.max(axis=0)


def setup_camera(height, front):
    scene = bpy.context.scene
    before = set(scene.objects)
    camera = setup_studio(height)
    for obj in set(scene.objects) - before:
        if obj.type == 'MESH':
            obj.hide_render = True
    scene.render.resolution_x, scene.render.resolution_y = WIDTH, HEIGHT
    scene.render.film_transparent = True
    scene.cycles.samples = 24
    world_per_pixel = height / front['height_span_px']
    vertical_span = HEIGHT * world_per_pixel
    camera.data.ortho_scale = 1
    frame = camera.data.view_frame(scene=scene)
    camera.data.ortho_scale = vertical_span / (max(v.y for v in frame) - min(v.y for v in frame))
    center_z = (front['bbox_alpha127'][3] - HEIGHT / 2) * world_per_pixel
    return camera, center_z, world_per_pixel


def flat_material():
    material = bpy.data.materials.new('NPC QA flat white silhouette')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (1, 1, 1, 1)
    output = nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(emission.outputs[0], output.inputs[0])
    return material


def annotations(path, source_hash):
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    if data['sourceSha256'] != source_hash:
        raise ValueError(f'3D landmark annotations refer to a different model: {path}')
    for name, point in data['points'].items():
        if len(point) != 3 or not np.isfinite(point).all():
            raise ValueError(f'Invalid 3D landmark {name!r} in {path}')
    return data['points']


def projected_landmarks(camera, points, reference):
    if points is None:
        return {'status': 'unverified', 'reason': 'No manual 3D landmark annotations for this exact source.'}
    result = {}
    for name, xyz in points.items():
        projected = world_to_camera_view(bpy.context.scene, camera, Vector(xyz))
        xy = [projected.x * WIDTH, (1 - projected.y) * HEIGHT]
        row = reference['registered_manual_y'].get(f'{name}_y')
        result[name] = {'world': xyz, 'projectedPx': xy, 'referenceY': row,
                        'verticalDeltaPx': xy[1] - row if row is not None else None}
    return {'status': 'manually_annotated', 'points': result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=tuple(HEIGHTS), required=True)
    parser.add_argument('--source', choices=('source', 'rigged'), default='source')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    registration_path = ROOT / 'assets/characters/reference-fit-v5/registration.json'
    registration = json.loads(registration_path.read_text())
    refs = registration['characters'][args.kind]['views']
    reference_masks = {}
    for view, ref in refs.items():
        path = ROOT / ref['path']
        if sha256(path) != ref['sha256']:
            raise ValueError(f'{args.kind}/{view}: reference changed; refresh registration first: {path}')
        pixels = image_pixels(path)
        if pixels.shape != (HEIGHT, WIDTH, 4):
            raise ValueError(f'{args.kind}/{view}: expected {WIDTH} x {HEIGHT} RGBA reference')
        reference_masks[view] = registered_mask(ref, pixels)
    asset_dir = ROOT / 'assets/characters' / args.kind
    source = asset_dir / ('source.glb' if args.source == 'source' else f'{args.kind}-rigged.blend')
    objects, imported_bounds, lo, hi = load_model(source, args.source, args.kind)
    source_hash = sha256(source)
    points = annotations(asset_dir / f'fit-landmarks-{args.source}.json', source_hash)
    if points is not None and 'chin' in points and not lo[2] < points['chin'][2] < hi[2]:
        raise ValueError(f'{args.kind}: chin annotation must be between the sole and highest hair tip')
    out = asset_dir / f'fit-{args.source}'
    out.mkdir(parents=True, exist_ok=True)
    height = HEIGHTS[args.kind]
    camera, center_z, pixel_size = setup_camera(height, refs['front'])
    material = flat_material()
    scene = bpy.context.scene
    report = {'kind': args.kind, 'source': str(source.relative_to(ROOT)), 'sourceSha256': source_hash,
              'registrationSha256': sha256(registration_path), 'referenceImagesUnmodified': True,
              'sourceImagesUnmodified': True, 'pose': 'static source' if args.source == 'source' else 'rest',
              'importedBounds': imported_bounds, 'inspectedBounds': {'min': lo.tolist(), 'max': hi.tolist()},
              'measuredHeight': float(hi[2] - lo[2]), 'soleZ': float(lo[2]),
              'heightPass': bool(abs(hi[2] - lo[2] - height) <= .01), 'solePass': bool(abs(lo[2]) <= .01),
              'orientationContract': 'Blender Z up, front -Y; glTF import converts standard Y up / +Z front.',
              'sourceNormalization': args.source == 'source',
              'camera': {'resolution': [WIDTH, HEIGHT], 'orthoScale': camera.data.ortho_scale,
                         'centerZ': center_z, 'worldUnitsPerPixel': pixel_size,
                         'sameScaleAndBaselineForAllViews': True},
              'meshes': [{'name': obj.name, 'vertices': len(obj.data.vertices),
                           'uvLayers': len(obj.data.uv_layers), 'materials': len(obj.data.materials)}
                          for obj in objects],
              'views': {}, 'referenceConflicts': registration['findings'],
              'limitations': ['Silhouette agreement does not establish face likeness or material quality.',
                              'No semantic structural-part count is inferred from a fused Rodin mesh.',
                              'Manual chin annotations are required before claiming a measured head ratio.',
                              'Reference alpha registration is applied only to comparison masks, not original files.']}
    for view, (x, y) in VIEWS.items():
        camera.location = (x * height * 4, y * height * 4, center_z)
        camera.rotation_euler = (Vector((0, 0, center_z)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()
        scene.view_layers[0].material_override = None
        scene.cycles.samples = 24
        scene.render.filepath = str(out / f'render-{view}.png')
        bpy.ops.render.render(write_still=True)
        scene.view_layers[0].material_override = material
        scene.cycles.samples = 1
        silhouette_path = out / f'silhouette-{view}.png'
        scene.render.filepath = str(silhouette_path)
        bpy.ops.render.render(write_still=True)
        actual = image_pixels(silhouette_path)[:, :, 3] > .5
        result = compare_masks(reference_masks[view], actual, view, out)
        result['landmarks'] = projected_landmarks(camera, points, refs[view])
        report['views'][view] = result
    if points is not None and 'chin' in points:
        ratio = float((hi[2] - lo[2]) / (hi[2] - points['chin'][2]))
        report['headProportion'] = {'status': 'manually_annotated', 'heads': ratio,
                                    'pass': 3.0 <= ratio <= 3.2}
    else:
        report['headProportion'] = {'status': 'unverified', 'pass': False,
                                    'reason': 'The actual mesh chin has not been annotated.'}
    report['bboxGatesPass'] = all(v['bboxCenterPass'] and v['bboxSizePass'] for v in report['views'].values())
    report['status'] = 'visual_review_required' if report['bboxGatesPass'] else 'adjustment_required'
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'report': str(out / 'report.json'), 'status': report['status'],
                      'bboxGatesPass': report['bboxGatesPass'], 'headProportion': report['headProportion']}))


if __name__ == '__main__':
    main()
