"""Portable textile sampling and physical garment UVs for the atelier model."""
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


KNIT_TILE_METRES = .56


def _blur(array, sigma):
    fy = np.fft.fftfreq(array.shape[0])[:, None]
    fx = np.fft.fftfreq(array.shape[1])[None, :]
    kernel = np.exp(-2 * math.pi ** 2 * sigma ** 2 * (fx * fx + fy * fy))
    return np.fft.ifft2(np.fft.fft2(array) * kernel).real


def _resize_tile(array, size):
    height, width = array.shape
    y, x = np.arange(size) * height / size, np.arange(size) * width / size
    y0, x0 = np.floor(y).astype(int), np.floor(x).astype(int)
    fy, fx = (y - y0)[:, None], (x - x0)[None, :]
    a, b = array[y0[:, None], x0[None, :]], array[y0[:, None], (x0 + 1)[None, :] % width]
    c = array[(y0 + 1)[:, None] % height, x0[None, :]]
    d = array[(y0 + 1)[:, None] % height, (x0 + 1)[None, :] % width]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fabric_sample(size, kind):
    """Keep the reference's local yarn pattern while removing its broad lighting."""
    path = Path(__file__).resolve().parents[2] / 'public/characters/human/history/turnaround-master-v2/front.png'
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = 'Non-Color'
    width, height = image.size
    pixels = np.asarray(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    top, left, height, width = {'knit': (510, 575, 120, 130),
                                'denim': (875, 686, 120, 68)}[kind]
    sample = pixels[::-1][top:top+height, left:left+width, :3]
    if sample.shape != (height, width, 3):
        raise ValueError(f'Reference must contain the {kind} sample region: {path}')
    luminance = sample @ np.array((.2126, .7152, .0722), dtype=np.float32)
    log_color = np.log(np.maximum(luminance, .005))
    relief = _blur(log_color, .65) - _blur(log_color, 8)
    relief /= float(np.std(relief))
    relief = np.clip(relief, -2.3, 2.3)
    # Mirrored borders share both edge values, without copying a clothing silhouette.
    tile = np.block([[relief, relief[:, ::-1]], [relief[::-1], relief[::-1, ::-1]]])
    tile = _resize_tile(tile, size).astype(np.float32)
    bpy.data.images.remove(image)
    contrast = .026 if kind == 'knit' else .055
    return .075 * tile, .977 + contrast * tile, 1.5 * size / 250


def garment_uv(obj):
    """Unwrap each sleeve about its own axis rather than stretching torso UVs."""
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    layer = obj.data.uv_layers.new(name='UVMap')
    layer.active_render = True
    for poly in obj.data.polygons:
        center = sum((obj.data.vertices[i].co for i in poly.vertices), Vector()) / len(poly.vertices)
        sleeve = abs(center.x) > .31 + .23 * (1.85-center.z) and center.z < 1.853
        side = -1 if center.x < 0 else 1
        axis = Vector((side * .36, -.04, -.86)).normalized()
        front = Vector((0, -1, 0))
        front = (front - axis * front.dot(axis)).normalized()
        cross = axis.cross(front).normalized()
        root = Vector((side * .257, .015, 1.842))
        coords = []
        for index in poly.loop_indices:
            p = obj.data.vertices[obj.data.loops[index].vertex_index].co
            if sleeve:
                length = (p - root).dot(axis)
                radial = p - root - axis * length
                angle = math.atan2(radial.dot(cross), radial.dot(front)) / math.tau
                coords.append((index, angle, .94, -length))
            else:
                angle = math.atan2(p.x, -p.y) / math.tau
                coords.append((index, angle, 1.98, p.z))
        seam = max(c[1] for c in coords) - min(c[1] for c in coords) > .5
        for index, angle, circumference, length in coords:
            angle += 1 if seam and angle < 0 else 0
            layer.data[index].uv = (angle * circumference / KNIT_TILE_METRES,
                                    length / KNIT_TILE_METRES)
