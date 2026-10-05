"""Render material-independent evidence for the reference-painted volume.

Uses the registration and multiview-fit skill contracts. Metrics diagnose
silhouette and color only; they are not claims about face likeness.
"""
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import SOURCE, PUBLIC, REFERENCES, SCALE, CANONICAL, LANDMARKS, sample

OUT = PUBLIC / 'validation'


def pixels(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = 'Non-Color'
    width, height = image.size
    data = np.array(image.pixels[:], np.float32).reshape(height, width, 4)[::-1]
    bpy.data.images.remove(image)
    return data


def save(name, rgba):
    image = bpy.data.images.new(name, width=rgba.shape[1], height=rgba.shape[0], alpha=True)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())
    image.filepath_raw = str(OUT / name)
    image.file_format = 'PNG'
    image.save()
    bpy.data.images.remove(image)


def measure(mask):
    yy, xx = np.where(mask)
    if not len(xx):
        raise ValueError('Reference or render mask is empty')
    return {'bbox': [int(xx.min()), int(yy.min()), int(xx.max()-xx.min()+1), int(yy.max()-yy.min()+1)],
            'centroid': [float(xx.mean()), float(yy.mean())]}


def color_stats(image):
    rgb = image[:, :, :3][image[:, :, 3] > .8]
    maximum, minimum = rgb.max(axis=1), rgb.min(axis=1)
    return {'mean_rgb': rgb.mean(axis=0).tolist(), 'brightness_mean': float(maximum.mean()),
            'brightness_p95': float(np.percentile(maximum, 95)),
            'saturation_mean': float(np.mean((maximum-minimum)/np.maximum(maximum, .0001)))}


def main():
    OUT.mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'grassy-multiview.blend'))
    scene = bpy.context.scene
    scene.camera.location = (-5.5,-8,2.25)
    scene.camera.rotation_euler = (Vector((0,0,1.55))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                space = area.spaces.active
                space.shading.type = 'SOLID'
                space.shading.color_type = 'TEXTURE'
                space.overlay.show_overlays = False
                space.region_3d.view_location = (0,0,1.55)
                space.region_3d.view_distance = 5.0
                space.region_3d.view_rotation = Quaternion((.87,.48,-.04,-.08))
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'grassy-multiview.blend'))
    scene.cycles.samples = 4
    scene.render.resolution_x = scene.render.resolution_y = 1254
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    camera = scene.camera
    camera.data.ortho_scale = 1254 * SCALE
    z = (1225 - 627) * SCALE
    flat = bpy.data.materials.new('Validation only • flat white silhouette')
    flat.use_nodes = True
    nodes = flat.node_tree.nodes
    nodes.clear()
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (1, 1, 1, 1)
    output = nodes.new('ShaderNodeOutputMaterial')
    flat.node_tree.links.new(emission.outputs[0], output.inputs[0])
    scene.view_layers[0].material_override = flat
    registration = {'coordinate_contract': {'front': 'X/Z', 'right_left': 'Y/Z', 'back': 'rear X/Z'},
                    'world_height': 3.1, 'pixel_to_world': SCALE, 'canonical_landmark_rows': CANONICAL.tolist(),
                    'view_landmark_rows': {k:v.tolist() for k,v in LANDMARKS.items()},
                    'notes': ['Front is the silhouette authority; right is the depth authority.',
                              'Source four-view images are independent illustrations: hair tufts, hand pose, and shoe stance conflict.',
                              'Vertical landmark correspondence is fixed before fitting; camera scale is shared across all views.'],
                    'views': {}}
    report = {'schema': 'multiview_fit_report.v1', 'views': {},
              'limitations': ['Silhouette IoU does not score eye, face, material or hairstyle resemblance.',
                              'No top photograph exists; top has no template metric.']}
    yy, xx = np.mgrid[0:1254, 0:1254].astype(np.float32)
    for view, pos in [('front', (0,-9,z)), ('right', (-9,0,z)), ('left', (9,0,z)), ('back', (0,9,z))]:
        ref = pixels(REFERENCES / (view+'.png'))
        registration['views'][view] = measure(ref[:,:,3]>.8)
        source_rows = np.interp(yy, CANONICAL, LANDMARKS[view])
        registered = sample(ref, xx + (6 if view=='back' else 0), source_rows)
        registered[(yy < CANONICAL[0]) | (yy > CANONICAL[-1]), 3] = 0
        save('registered-'+view+'.png', registered)
        camera.location = pos
        camera.rotation_euler = (Vector((0,0,z))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(OUT / ('silhouette-'+view+'.png'))
        bpy.ops.render.render(write_still=True)
        actual = pixels(OUT / ('silhouette-'+view+'.png'))[:,:,:3].mean(axis=2)>.5
        expected = registered[:,:,3]>.8
        first, second = measure(expected), measure(actual)
        a,b = first['bbox'],second['bbox']
        delta = [(b[i]+b[i+2]/2)-(a[i]+a[i+2]/2) for i in (0,1)]
        size_error = [b[i+2]/a[i+2]-1 for i in (0,1)]
        report['views'][view] = {'reference': first, 'render': second,
            'iou': float((actual&expected).sum()/(actual|expected).sum()),
            'bbox_center_drift_px': delta, 'bbox_size_error_ratio': size_error,
            'pass_bbox_center_1p5pct': all(abs(n)<=1254*.015 for n in delta),
            'pass_bbox_size': all(abs(n)<=(.03 if view=='front' else .05) for n in size_error)}
        overlay = np.ones((1254,1254,4),np.float32)
        overlay[:,:,:3] = .025
        overlay[expected & ~actual,:3] = (1,.15,.15)
        overlay[actual & ~expected,:3] = (.1,.65,1)
        overlay[actual & expected,:3] = (.2,.7,.38)
        save('overlay-'+view+'.png',overlay)
    report['summary'] = {'all_bbox_centers_pass': all(v['pass_bbox_center_1p5pct'] for v in report['views'].values()),
                         'all_bbox_sizes_pass': all(v['pass_bbox_size'] for v in report['views'].values()),
                         'visual_review_required': True}
    report['reference_conflicts'] = ['Back reference arms/hands spread wider than the approved front pose. Front pose wins; back width is not forced by scaling the camera.']
    (OUT/'registration_report.json').write_text(json.dumps(registration,ensure_ascii=False,indent=2)+'\n')
    (OUT/'multiview_fit_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    looks = {'schema': 'look_fit_report.v1', 'notes': ['Whole-character color statistics; not a perceptual likeness score.',
              'Before calibration used a repeated sRGB transfer. After calibration removes that transfer.'], 'views': {}}
    for view in ('front','right'):
        looks['views'][view] = {'reference': color_stats(pixels(REFERENCES/(view+'.png'))),
            'before': color_stats(pixels(SOURCE/'validation'/('before-color-'+view+'.png'))),
            'after': color_stats(pixels(PUBLIC/('render-'+view+'.png')))}
    (OUT/'look_fit_report.json').write_text(json.dumps(looks,ensure_ascii=False,indent=2)+'\n')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'grassy-multiview.blend'))
    collection = bpy.data.collections.new('Registered references • hidden for viewing')
    bpy.context.scene.collection.children.link(collection)
    for view, angle, location in [('front', 0, (0,.8,z)), ('right', -math.pi/2, (.8,0,z)),
                                   ('left', math.pi/2, (-.8,0,z)), ('back', math.pi, (0,-.8,z))]:
        reference = bpy.data.objects.new('Registered reference • '+view, None)
        reference.empty_display_type = 'IMAGE'
        reference.data = bpy.data.images.load(str(OUT/('registered-'+view+'.png')))
        reference.data.pack()
        reference.empty_display_size = 1254*SCALE
        reference.location = location
        reference.rotation_euler = (math.pi/2,0,angle)
        reference.color[3] = .35
        reference.hide_render = True
        collection.objects.link(reference)
    collection.hide_viewport = collection.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'grassy-multiview.blend'))
    print('FIT_REPORT '+json.dumps(report['views']),flush=True)


if __name__ == '__main__':
    main()
