"""Lights, cameras and silhouette comparison against the reference turnaround."""
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

from geo import PX

REF = Path(__file__).resolve().parents[2] / 'public/characters/human/history/turnaround-master-v2'
SIDE_ORIGIN = 637  # reference px column that corresponds to the torso axis in the side view


def setup_scene(size=700, samples=24):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.world = bpy.data.worlds.new('w') if sc.world is None else sc.world
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.8, 0.84, 0.9, 1)
    bg.inputs['Strength'].default_value = 0.42
    col = bpy.data.collections.new('Studio')
    sc.collection.children.link(col)
    for name, loc, energy, size_ in (('Key', (-3, -4, 5.5), 420, 3.0), ('Fill', (3.4, -2.5, 4), 170, 3.2),
                                      ('Rim', (1, 3, 4.6), 300, 2.6)):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.size = energy, size_
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        obj.rotation_euler = (Vector((0, 0, 1.6)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
        col.objects.link(obj)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    col.objects.link(cam)
    sc.camera = cam
    return cam


def aim(cam, loc, target, scale=None, ortho=True):
    cam.location = loc
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    if scale:
        cam.data.ortho_scale = scale
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


VIEWS = {  # name: (camera location, target, ortho scale)
    'front': ((0, -10, 1.0), (0, 0, 1.0), None),
    'back': ((0, 10, 1.0), (0, 0, 1.0), None),
    'left': ((10, 0, 1.0), (0, 0, 1.0), None),
    'right': ((-10, 0, 1.0), (0, 0, 1.0), None),
}


def render(cam, path, view, size=None):
    sc = bpy.context.scene
    if size:
        sc.render.resolution_x = sc.render.resolution_y = size
    loc, tgt, scale = VIEWS[view] if view in VIEWS else view
    aim(cam, loc, tgt, scale)
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def ref_aligned_camera(cam, view):
    """Orthographic camera registered pixel-for-pixel to a reference image."""
    scale = 1254 * PX
    zc = (1221 - 627) * PX
    if view in ('front', 'back'):
        y = -10 if view == 'front' else 10
        aim(cam, (0, y, zc), (0, 0, zc), scale)
    else:
        # side camera: screen-right is -Y for the left-side view (camera at -X looking +X)
        off = (627 - SIDE_ORIGIN) * PX
        zc = (1234 - 627) * PX
        if view == 'right':
            aim(cam, (-10, -off, zc), (0, -off, zc), scale)
        else:
            aim(cam, (10, off, zc), (0, off, zc), scale)


def mask_render(cam, view, collection_names=None):
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = 1254
    sc.render.film_transparent = True
    sc.cycles.samples = 4
    sc.cycles.use_denoising = False
    ref_aligned_camera(cam, view)
    sc.render.filepath = str(Path(bpy.app.tempdir) / f'_mask_{view}.png')
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(sc.render.filepath)
    a = np.array(img.pixels[:]).reshape(1254, 1254, 4)[::-1, :, 3] > 0.5
    bpy.data.images.remove(img)
    sc.render.film_transparent = False
    return a


def load_alpha(path):
    img = bpy.data.images.load(str(path))
    a = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)[::-1, :, 3] > 0.5
    bpy.data.images.remove(img)
    return a


def save_rgb(path, arr):
    h, w, _ = arr.shape
    img = bpy.data.images.new('ov', w, h)
    rgba = np.concatenate([arr[::-1] / 255.0, np.ones((h, w, 1))], -1)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = str(path)
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def compare(cam, view, out):
    """Returns IoU and writes a red(reference only) / cyan(mine only) overlay."""
    mine = mask_render(cam, view)
    ref = load_alpha(REF / f'{"right" if view in ("left", "right") else view}.png')
    if view == 'left':
        ref = ref[:, ::-1]
    iou = (mine & ref).sum() / max((mine | ref).sum(), 1)
    over = np.zeros((1254, 1254, 3)) + 255
    over[ref & ~mine] = (230, 40, 40)
    over[mine & ~ref] = (30, 160, 220)
    over[mine & ref] = (200, 200, 200)
    save_rgb(out, over)
    return iou
