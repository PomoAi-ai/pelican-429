"""Render identical-camera silhouette evidence for the original and refined Rodin."""
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/characters/grassy/history/model-rodin-refined/fit-evidence'
REFERENCES = ROOT / 'public/characters/human/history/turnaround-master-v2'
SIZE = 800
ORTHO = 3.4
SCALE = SIZE / ORTHO
VIEWS = {'front': (0, -8, 0), 'right': (-8, 0, 0),
         'left': (8, 0, 0), 'back': (0, 8, 0)}
MODELS = {
    'before': ROOT / 'public/characters/human/history/models-rodin/grassy-rodin-detailed.glb',
    'after': ROOT / 'public/characters/human/history/models-rodin-refined/grassy-rodin-refined-detailed.glb',
}


def read_image(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = 'Non-Color'
    w, h = image.size
    pixels = np.empty(w * h * 4, np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(h, w, 4)[::-1]


def save_overlay(path, expected, actual):
    rgba = np.ones((SIZE, SIZE, 4), np.float32)
    rgba[:, :, :3] = .03
    rgba[expected & actual, :3] = (.2, .7, .38)
    rgba[expected & ~actual, :3] = (1, .2, .2)
    rgba[actual & ~expected, :3] = (.12, .6, 1)
    image = bpy.data.images.new(path.name, SIZE, SIZE, alpha=True)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(rgba[::-1].ravel())
    image.file_format = 'PNG'
    image.filepath_raw = str(path)
    image.save()
    bpy.data.images.remove(image)


def measure(mask):
    y, x = np.where(mask)
    return {'bbox': [int(x.min()), int(y.min()), int(x.max()), int(y.max())],
            'centroid': [float(x.mean()), float(y.mean())]}


def registered_reference(view):
    original = read_image(REFERENCES / f'{view}.png')[:, :, 3] > .5
    rows, cols = np.where(original)
    origin = float((cols.min() + cols.max()) / 2)
    reference_scale = (rows.max() - rows.min()) / 3.1
    yy, xx = np.mgrid[:SIZE, :SIZE]
    source_x = np.rint((xx - SIZE / 2) / SCALE * reference_scale + origin).astype(int)
    source_y = np.rint(rows.max() - (SIZE / 2 - yy + 1.55 * SCALE) / SCALE * reference_scale).astype(int)
    valid = (source_x >= 0) & (source_x < original.shape[1]) & (source_y >= 0) & (source_y < original.shape[0])
    result = np.zeros((SIZE, SIZE), bool)
    result[valid] = original[source_y[valid], source_x[valid]]
    return result, {'image': str(REFERENCES / f'{view}.png'), 'sourceOriginX': origin,
                    'sourcePixelsPerUnit': float(reference_scale),
                    'note': 'Reference uses the same full-bounds horizontal center and sole-to-hair normalization as the model export; no anisotropic warp.'}


def render_model(path, tag):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 3
    scene.render.resolution_x = scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.world = bpy.data.worlds.new('Black validation background')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [o for o in scene.objects if o.type == 'MESH']
    mat = bpy.data.materials.new('Flat silhouette only')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    flat = nodes.new('ShaderNodeEmission')
    flat.inputs['Color'].default_value = (1, 1, 1, 1)
    out = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(flat.outputs[0], out.inputs['Surface'])
    scene.view_layers[0].material_override = mat
    camera = bpy.data.objects.new('Registered camera', bpy.data.cameras.new('Registered camera'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = ORTHO
    target = Vector((0, 0, 1.55))
    masks = {}
    for view, direction in VIEWS.items():
        camera.location = target + Vector(direction)
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        output = OUT / f'{tag}-silhouette-{view}.png'
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        masks[view] = read_image(output)[:, :, :3].mean(axis=2) > .5
    return masks, len(meshes)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'camera': {'imageSize': SIZE, 'orthoScale': ORTHO, 'target': [0, 0, 1.55]},
              'views': {}, 'limitations': [
                  'Silhouette does not measure face likeness, material quality or internal hair flow.',
                  'References have conflicting finger poses and hair tufts; approved side image governs depth.',
                  'Before is the existing 200k export; after preserves the raw 500k geometry before local refinement.',
              ]}
    references = {view: registered_reference(view) for view in VIEWS}
    for tag, path in MODELS.items():
        masks, mesh_count = render_model(path, tag)
        report[tag] = {'meshObjects': mesh_count, 'glb': str(path)}
        for view, actual in masks.items():
            expected, registration = references[view]
            if view not in report['views']:
                report['views'][view] = {'registration': registration, 'reference': measure(expected)}
            source, result = measure(expected), measure(actual)
            a, b = source['bbox'], result['bbox']
            center_error = [(b[i] + b[i+2] - a[i] - a[i+2]) / 2 for i in (0, 1)]
            size_error = [(b[i+2] - b[i] + 1) / (a[i+2] - a[i] + 1) - 1 for i in (0, 1)]
            result.update(iou=float((expected & actual).sum() / (expected | actual).sum()),
                          bboxCenterDriftPx=center_error, bboxSizeErrorRatio=size_error,
                          passCenter=all(abs(n) <= SIZE * .015 for n in center_error),
                          passSize=all(abs(n) <= (.03 if view == 'front' else .05) for n in size_error))
            report['views'][view][tag] = result
            save_overlay(OUT / f'{tag}-overlay-{view}.png', expected, actual)
    (OUT / 'multiview-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('RODIN_FIT_REPORT', str(OUT / 'multiview-report.json'), flush=True)


if __name__ == '__main__':
    main()
