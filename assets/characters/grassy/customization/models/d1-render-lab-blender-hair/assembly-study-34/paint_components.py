"""Carry the painted D1 locks along closed component flow UVs into one atlas.

paint_components(objects, output_directory) replaces each component's material
and remaps its existing 0..1 UVs into one shared base-color atlas. Geometry and
head attachment are left to the component builder. Run in Blender with
--python paint_components.py -- --test-stage paint-test-01 for the single-lock
visual study.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_volume import close_color_gaps, fill_highlight_holes, polygon_mask, FRONT_FACE, pixels
from single_lock import smooth_controls
from build import ORIGIN

VIEWS = ('front', 'side', 'back')
EAR_POLYGONS = {
    'front': [[(60, 161), (69, 158), (79, 161), (83, 173), (82, 187), (76, 196), (67, 191), (62, 180)],
              [(280, 162), (289, 158), (299, 162), (302, 173), (297, 188), (286, 195), (278, 185)]],
    'side': [[(139, 165), (151, 161), (164, 167), (173, 177), (172, 191), (163, 204), (151, 210), (141, 200)]],
    'back': [],
}
FACE_POLYGONS = {
    'front': FRONT_FACE,
    'side': [(226, 154), (262, 156), (275, 169), (280, 193), (296, 199), (302, 207),
             (299, 213), (292, 215), (294, 224), (288, 237), (280, 247), (257, 246),
             (226, 232), (215, 210), (207, 187), (218, 163)],
}
FLOW_COMPONENTS = {
    'Single broad swept fringe': ('fringe-outer-left', 64, 'refined', 0, 1),
    'Single rebuilt swept fringe': ('fringe-outer-left', 64, 'linear', 0, 1),
    'Inner long fringe': ('fringe-middle-left', 64, 'linear', 0, 1),
    'Inner short fringe': ('fringe-inner-centre', 64, 'linear', 0, 1),
    'Right swept fringe': ('fringe-right', 64, 'linear', 0, 1),
    'Left swept crown': ('crown-left-sweep', 48, 'round', 0, 1),
    'Rear swept crown': ('back-covering-lock', 48, 'round', 0, 1),
    'Right crown turn': ('crown-left-sweep', 48, 'round', 0, 1),
    'Left crown curled tip': ('crown-left-sweep', 48, 'round', .72, 1),
    'Rear cover swept centre': ('back-covering-lock', 28, 'round', 0, 1),
    'Rear cover right fold': ('back-covering-lock', 28, 'round', 0, 1),
    'Rear cover left fold': ('back-covering-lock', 28, 'round', 0, 1),
    'Rear part underfold': ('back-covering-lock', 28, 'round', .3, .7),
    'Nape central curl': ('side-bob-under-ear', 28, 'round', 0, 1),
    'Nape left low curl': ('side-bob-under-ear', 28, 'round', 0, 1),
    'Nape right raised curl': ('side-bob-under-ear', 28, 'round', 0, 1),
    'Nape right interval undercurl': ('side-bob-under-ear', 28, 'round', .2, 1),
    'Nape left interval undercurl': ('side-bob-under-ear', 28, 'round', .2, 1),
    'right rearward upper sweep': ('side-upper-back-sweep', 28, 'round', 0, 1),
    'left rearward upper sweep': ('side-upper-back-sweep', 28, 'round', 0, 1),
    'right ear-back shoulder fold': ('side-bob-under-ear', 28, 'round', 0, 1),
    'left ear-back shoulder fold': ('side-bob-under-ear', 28, 'round', 0, 1),
    'right outer soft hook': ('side-bob-under-ear', 28, 'round', 0, 1),
    'left outer soft hook': ('side-bob-under-ear', 28, 'round', 0, 1),
    'right lower rear curl': ('side-bob-under-ear', 28, 'round', 0, 1),
    'left lower rear curl': ('side-bob-under-ear', 28, 'round', 0, 1),
    'right ear-back inward curl': ('side-bob-under-ear', 28, 'round', 0, 1),
    'left ear-back inward curl': ('side-bob-under-ear', 28, 'round', 0, 1),
    'right cheek inner short curl': ('side-bob-under-ear', 28, 'round', 0, 1),
    'left cheek inner short curl': ('side-bob-under-ear', 28, 'round', 0, 1),
    'right plait-back filling sweep': ('side-upper-back-sweep', 28, 'round', 0, 1),
    'left plait-back filling sweep': ('side-upper-back-sweep', 28, 'round', 0, 1),
    'right outer split flick': ('side-bob-under-ear', 28, 'round', .45, 1),
    'left outer split flick': ('side-bob-under-ear', 28, 'round', .45, 1),
    'Left scalp flow connector': ('fringe-outer-left', 28, 'round', .05, .80),
    'Right scalp flow connector': ('fringe-right', 28, 'round', .05, .80),
    'Left temple forelock': ('temple-forelock', 28, 'round', 0, 1),
    'Right temple forelock': ('temple-forelock', 28, 'round', 0, 1),
    'Left temple split': ('temple-forelock', 28, 'round', .2, 1),
    'Right temple split': ('temple-forelock', 28, 'round', .2, 1),
}
TRACED_FRINGES = {'fringe-outer-left', 'fringe-middle-left', 'fringe-inner-centre', 'fringe-right'}
PROJECTED_COMPONENTS = {
    'Single broad swept fringe': 'front',
    'Inner long fringe': 'front',
    'Inner short fringe': 'front',
    'Right swept fringe': 'front',
    'Left swept crown': 'front',
    'Right crown turn': 'front',
    'Left crown curled tip': 'front',
    'right lower body underfold': 'side',
    'left lower body underfold': 'side',
    'right lower fan 01': 'side',
    'right lower fan 02': 'side',
    'right lower fan 03': 'side',
    'right lower fan 04': 'side',
    'right lower fan 05': 'side',
    'right lower fan 06': 'side',
    'right lower fan 07': 'side',
    'left lower fan 01': 'side',
    'left lower fan 02': 'side',
    'left lower fan 03': 'side',
    'left lower fan 04': 'side',
    'left lower fan 05': 'side',
    'left lower fan 06': 'side',
    'left lower fan 07': 'side',
}

PAINTED_FLOW_COMPONENTS = {
    'Rear swept crown',
    'Rear cover swept centre', 'Rear cover right fold', 'Rear cover left fold', 'Rear part underfold',
    'right rearward upper sweep', 'left rearward upper sweep',
    'right ear-back shoulder fold', 'left ear-back shoulder fold',
    'right plait-back filling sweep', 'left plait-back filling sweep',
    'Nape central curl', 'Nape right interval undercurl', 'Nape left interval undercurl',
    'right lower body underfold', 'left lower body underfold',
    'Left temple forelock', 'Left temple split', 'Right temple forelock', 'Right temple split',
    *(f'{side} lower fan {index:02d}' for side in ('right', 'left') for index in range(1, 8)),
}


def longitudinal_color(uv, obj, palette, root_color):
    """Paint uninterrupted strand volume, with edges matching its own section."""
    u, t = uv.T
    t = np.clip(t, 0, 1)
    crown = obj['region'] == 'crown'
    if crown:
        x = 2 * u - 1
        outside = np.ones_like(t)
        phase = 0
    else:
        x = np.cos(math.tau * u)
        outside = np.clip(np.sin(math.tau * u), 0, 1) ** .45
        guide = np.asarray(json.loads(obj['guideBlender']))
        direction = guide[-1] - guide[0]
        phase = math.atan2(direction[0], direction[1])
    edge, shade, base, light = palette
    mix = lambda a, b, amount: a * (1 - amount[:, None]) + b * amount[:, None]
    color = np.broadcast_to(base, (len(t), 3)).copy()
    underside = .22 * (1 - outside)
    color = mix(color, shade, underside)
    # Each strand has its own broad, curved patch of soft light. The variation
    # is attached to UV flow, so it cannot jump or slide with the viewing angle.
    seed = sum((index + 1) * ord(char) for index, char in enumerate(obj.name))
    centre = .40 + .16 * math.sin(seed * .041)
    centre = centre + .12 * x + .035 * np.sin(math.pi * x)
    spread = .145 + .025 * math.cos(seed * .073)
    band = np.exp(-((t - centre) / spread) ** 4)
    band *= np.exp(-((x + .08) / .97) ** 4) * outside
    color = mix(color, light, .80 * band)
    crest = -.12 + .035 * np.sin(3.6 * t + phase)
    sheen = np.exp(-((x - crest) / .57) ** 2)
    sheen *= .33 * (.72 + .28 * np.sin(math.pi * t)) * outside
    color = mix(color, light, sheen)
    edge_shadow = .68 * np.exp(-((np.abs(x) - .96) / .085) ** 2)
    color = mix(color, edge, edge_shadow)
    bob = obj['region'] in ('rear bob', 'inner bob', 'rear cover', 'side cover')
    a = -.39 + .09 * np.sin(4.8 * t + phase) if bob else -.28 + .055 * np.sin(5.2 * t)
    b = .28 - .05 * np.sin(5.3 * t - .6 * phase) if bob else .40 - .07 * np.sin(4.1 * t)
    taper = np.sin(math.pi * t) ** .55 * outside
    for groove, strength in ((a, .37), (b, .28)):
        dark = strength * np.exp(-((x - groove) / .037) ** 2) * taper
        color = mix(color, shade, dark)
        lip = .24 * np.exp(-((x - groove + .066) / .055) ** 2) * taper
        color = mix(color, light, lip)
    tip = np.clip((t - .69) / .31, 0, 1)
    tip = tip * tip * (3 - 2 * tip)
    color = mix(color, shade, .48 * tip)
    root = np.clip(t / (.29 if crown else .20), 0, 1)
    root = 1 - root * root * (3 - 2 * root)
    color = mix(color, root_color, root * (1 if crown else .79))
    return color


def edge_curve(points, piece_id):
    points = np.asarray(points, dtype=float)
    if points.ndim != 2 or points.shape[1] != 2 or len(points) < 2 or not np.isfinite(points).all():
        raise ValueError(f'{piece_id}: painted boundary needs at least two finite crop pixels')
    if piece_id in TRACED_FRINGES:
        # These boundaries must follow the same curve and arclength as the mesh.
        points = np.array([smooth_controls(points, t) for t in np.linspace(0, 1, 300)])
    distance = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    if distance[-1] == 0:
        raise ValueError(f'{piece_id}: painted boundary has no length')
    return distance / distance[-1], points


def edge_at(edge, t):
    distance, points = edge
    return np.column_stack((np.interp(t, distance, points[:, 0]), np.interp(t, distance, points[:, 1])))


def sample_table(table, uv):
    uv = uv.copy()
    uv[:, 0] = np.clip(uv[:, 0], 0, table.shape[1] - 1)
    uv[:, 1] = np.clip(uv[:, 1], 0, table.shape[0] - 1)
    lo = np.floor(uv).astype(int)
    hi = np.minimum(lo + 1, np.array([table.shape[1] - 1, table.shape[0] - 1]))
    f = uv - lo
    a = table[lo[:, 1], lo[:, 0]] * (1 - f[:, 0, None]) + table[lo[:, 1], hi[:, 0]] * f[:, 0, None]
    b = table[hi[:, 1], lo[:, 0]] * (1 - f[:, 0, None]) + table[hi[:, 1], hi[:, 0]] * f[:, 0, None]
    return a * (1 - f[:, 1, None]) + b * f[:, 1, None]


def projected(points, view):
    x, y, z = np.asarray(points).T
    if view == 'front':
        return np.column_stack((187 + x * 256.25, 179 + (2.4453 - z) * 256.25))
    if view == 'side':
        return np.column_stack((152 + (.09 - y) * 256.25, 186 + (2.4453 - z) * 256.25))
    if view == 'back':
        return np.column_stack((148 - x * 196.25, 144 + (2.4453 - z) * 196.25))
    raise ValueError(f'Unknown painted hair view: {view}')


def gold_palette(rgb):
    maximum, minimum = rgb.max(axis=2), rgb.min(axis=2)
    chroma = maximum - minimum
    saturation = np.divide(chroma, maximum, out=np.zeros_like(chroma), where=maximum > 0)
    hue = np.zeros_like(chroma)
    for channel in range(3):
        selected = (rgb[:, :, channel] == maximum) & (chroma > 0)
        if channel == 0: value = (rgb[:, :, 1] - rgb[:, :, 2]) / np.where(chroma > 0, chroma, 1)
        elif channel == 1: value = (rgb[:, :, 2] - rgb[:, :, 0]) / np.where(chroma > 0, chroma, 1) + 2
        else: value = (rgb[:, :, 0] - rgb[:, :, 1]) / np.where(chroma > 0, chroma, 1) + 4
        hue[selected] = value[selected]
    hue = (hue * 60) % 360
    red_blue = rgb[:, :, 0] - rgb[:, :, 2]
    green_ratio = np.divide(rgb[:, :, 1] - rgb[:, :, 2], red_blue,
                           out=np.zeros_like(red_blue), where=red_blue > 0)
    gold = (hue >= 20) & (hue <= 55) & (saturation >= .30) & (green_ratio > .33)
    highlight = (hue >= 32) & (hue <= 55) & (saturation >= .08) & (chroma > .08)
    return gold | highlight


def smooth_painted_field(table):
    kernel = np.exp(-np.arange(-6, 7, dtype=float) ** 2 / (2 * .8 ** 2))
    kernel /= kernel.sum()
    for axis in (0, 1):
        padding = [(0, 0)] * 3; padding[axis] = (6, 6)
        padded = np.pad(table, padding, mode='edge')
        slices = [slice(None)] * 3
        result = np.zeros_like(table)
        for index, weight in enumerate(kernel):
            slices[axis] = slice(index, index + table.shape[axis])
            result += padded[tuple(slices)] * weight
        table = result
    return table


class PaintedReference:
    def __init__(self):
        self.tables, self.masks, self.flow_tables = {}, {}, {}
        for view in VIEWS:
            image = pixels(HERE / 'reference' / f'{view}-crop.png')[:, :, :3]
            raw = pixels(HERE / 'reference' / f'{view}-hair-mask.png')[:, :, 0] > .5
            valid = fill_highlight_holes(close_color_gaps(raw), view)
            if view in FACE_POLYGONS:
                valid[polygon_mask(raw.shape, FACE_POLYGONS[view])] = False
            for polygon in EAR_POLYGONS[view]:
                valid[polygon_mask(raw.shape, polygon)] = False
            # Warm skin is also R >= G >= B. Hue and saturation distinguish it
            # from gold hair; broad yellow highlights have their own allowance.
            if view == 'front':
                # The original mask and explicit face/ear exclusions remain the
                # boundary. Restore only saturated reddish-brown hair shadows.
                red, green, blue = image[:, :, 0], image[:, :, 1], image[:, :, 2]
                chroma = red - blue
                ratio = np.divide(green - blue, chroma, out=np.zeros_like(red), where=chroma > 0)
                saturation = np.divide(chroma, red, out=np.zeros_like(red), where=red > 0)
                brown = (red > green) & (green > blue) & (ratio >= .28) & (ratio < .34)
                brown &= (saturation >= .30) & ((image @ np.array([.2126, .7152, .0722])) < .65)
                restore_shadow = valid & raw & brown
            else:
                restore_shadow = np.zeros_like(valid)
            valid &= gold_palette(image)
            valid |= restore_shadow
            rows, columns = np.where(valid)
            if not len(rows):
                raise ValueError(f'{view}: painted hair mask is empty')
            tree = KDTree(len(rows))
            for index, (u, v) in enumerate(zip(columns, rows)):
                tree.insert((float(u), float(v), 0.), index)
            tree.balance()
            # Only genuine hair may extend across a face, ear or background gap.
            # Keep interior pixels intact so broad painted highlights survive.
            table = image.copy()
            for v, u in zip(*np.where(~valid)):
                nearest = tree.find(Vector((float(u), float(v), 0.)))[0]
                table[v, u] = image[round(nearest.y), round(nearest.x)]
            # A nearest-pixel extension across a face void creates abrupt color
            # cells. A small source-space filter keeps the painted wide light
            # bands while removing those cells from the new curved components.
            self.tables[view], self.masks[view] = smooth_painted_field(table), valid
            # Switching from raw valid pixels to filtered invalid pixels cuts
            # fine painted creases into repeated sharp speckles. One continuous
            # source field preserves the wide light bands without those seams.
            self.flow_tables[view] = self.tables[view]
        records = json.loads((HERE / 'reference' / 'painted-lock-study.json').read_text())['pieces']
        self.pieces = {piece['id']: dict(view=piece['view'],
            a=edge_curve(piece['boundary_a_root_to_tip_px'], piece['id']),
            b=edge_curve(piece['boundary_b_root_to_tip_px'], piece['id'])) for piece in records}
        # Selected artist colors from the continuous original reference field.
        # Root: darkest quarter of front x197:225/y39:81. Strand colors: genuine
        # side hair x25:138/y175:245, luminance quantile bands 2.5–6.5%, 16–22%,
        # 33–43%, 95–98.5%. Keep these choices fixed when repairing source masks.
        self.root_color = np.array([0.6511331044027736, 0.2851942733318496, 0.08802125198393988])
        self.strand_palette = np.array([
            [0.7730416852299105, 0.3640018236149757, 0.1388256182763658],
            [0.9312978613012881, 0.514957031392429, 0.25824694939452403],
            [0.9846478788551154, 0.6399291494736667, 0.37544315284563107],
            [0.9956321043036415, 0.8406754513064157, 0.6085294531766964],
        ])
        self.strand_palette_pixels = 5811

    def sample(self, points, weights):
        result = np.zeros((len(points), 3), dtype=np.float32)
        for index, view in enumerate(VIEWS):
            result += sample_table(self.tables[view], projected(points, view)) * weights[index]
        return result

    def component_flow(self, name, coordinates):
        piece_id, columns, profile, start, end = FLOW_COMPONENTS[name]
        piece = self.pieces[piece_id]
        row = (len(coordinates) // columns - 1) // 2
        lo, hi = (0, columns // 2) if profile != 'round' else (columns // 2, 0)
        shoulders = projected(coordinates[[row * columns + lo, row * columns + hi]], piece['view'])
        t = np.array([(start + end) / 2])
        across = edge_at(piece['b'], t)[0] - edge_at(piece['a'], t)[0]
        return dict(piece=piece_id, profile=profile, start=start, end=end,
                    flip=bool(np.dot(shoulders[1] - shoulders[0], across) < 0))

    def sample_flow(self, uv, flow):
        u, t = uv.T
        phase = 2 * np.minimum(u, 1 - u)
        if flow['profile'] == 'refined':
            cosine = np.cos(math.pi * phase)
            w = np.where(phase <= .5, .68 * (1 - cosine), .68 - .32 * cosine)
        elif flow['profile'] == 'linear':
            w = phase
        elif flow['profile'] == 'cosine':
            w = (1 - np.cos(math.pi * phase)) / 2
        else:
            w = (1 + np.cos(math.tau * u)) / 2
        if flow['flip']: w = 1 - w
        w = .015 + .97 * w
        t = .004 + .992 * t if flow['piece'] in TRACED_FRINGES else .005 + .99 * t
        t = flow['start'] + (flow['end'] - flow['start']) * t
        piece = self.pieces[flow['piece']]
        a, b = edge_at(piece['a'], t), edge_at(piece['b'], t)
        source = a * (1 - w[:, None]) + b * w[:, None]
        return sample_table(self.flow_tables[piece['view']], source)


def raster_component(obj, reference, tile_size, padding):
    mesh = obj.data
    mesh.calc_loop_triangles()
    coordinates = np.asarray([vertex.co for vertex in mesh.vertices], dtype=np.float64)
    transform = np.asarray(obj.matrix_world, dtype=np.float64)
    coordinates = coordinates @ transform[:3, :3].T + transform[:3, 3]
    is_root_bed = obj.name == 'Thin scalp root bed'
    flow = reference.component_flow(obj.name, coordinates) if obj.name in FLOW_COMPONENTS else None
    if flow is not None and 'flowProfile' in obj:
        flow['profile'] = obj['flowProfile']
    projection_view = PROJECTED_COMPONENTS.get(obj.name)
    if not is_root_bed:
        direction = coordinates.mean(axis=0) - np.array([0, .035, 2.54])
        x, y = direction[:2]
        weights = np.array([max(0, -y) ** 4, abs(x) ** 4, max(0, y) ** 4])
        if weights.sum() == 0:
            raise ValueError(f'{obj.name}: component centre has no radial viewing direction')
        # One braid must keep one painted elevation across all its small convex
        # lobes; local surface normals otherwise change source image at every lobe.
        weights /= weights.sum()
    uv = np.asarray([loop.uv for loop in mesh.uv_layers.active.data], dtype=np.float64)
    if not np.isfinite(uv).all() or np.min(uv) < -1e-5 or np.max(uv) > 1 + 1e-5:
        raise ValueError(f'{obj.name}: component UV coordinates must be finite and in 0..1')
    flow_uv = uv.copy()
    uv = uv * (tile_size - padding * 2) + padding
    tile = np.zeros((tile_size, tile_size, 3), dtype=np.float32)
    covered = np.zeros((tile_size, tile_size), dtype=bool)
    for triangle in mesh.loop_triangles:
        loops = np.asarray(triangle.loops)
        a, b, c = uv[loops]
        denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(denominator) < 1e-10:
            continue
        low = np.maximum(np.floor(np.min(uv[loops], axis=0)).astype(int), 0)
        high = np.minimum(np.ceil(np.max(uv[loops], axis=0)).astype(int), tile_size - 1)
        yy, xx = np.mgrid[low[1]:high[1] + 1, low[0]:high[0] + 1]
        x, y = xx + .5, yy + .5
        wa = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator
        wb = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator
        wc = 1 - wa - wb
        inside = (wa >= -1e-6) & (wb >= -1e-6) & (wc >= -1e-6)
        if not np.any(inside):
            continue
        barycentric = np.column_stack((wa[inside], wb[inside], wc[inside]))
        if is_root_bed:
            points = barycentric @ coordinates[np.asarray(triangle.vertices)]
            radial = points - ORIGIN
            x, y = radial[:, 0], radial[:, 1]
            point_weights = np.column_stack((np.maximum(0, -y) ** 4, np.abs(x) ** 4, np.maximum(0, y) ** 4))
            totals = point_weights.sum(axis=1)
            if np.any(totals == 0):
                raise ValueError('Root bed sample has no XY direction from ORIGIN')
            point_weights /= totals[:, None]
            color = np.zeros((len(points), 3), dtype=np.float32)
            for index, view in enumerate(VIEWS):
                color += sample_table(reference.tables[view], projected(points, view)) * point_weights[:, index, None]
            color = .7 * color + .3 * reference.root_color
        elif obj.name in PAINTED_FLOW_COMPONENTS:
            color = longitudinal_color(barycentric @ flow_uv[loops], obj, reference.strand_palette, reference.root_color)
        elif projection_view is not None:
            pixels = projected(barycentric @ coordinates[np.asarray(triangle.vertices)], projection_view)
            color = sample_table(reference.tables[projection_view], pixels)
            if obj.name == 'Inner long fringe':
                # The reshaped tip falls below its original painted hair area.
                # Draw its final section from this same lock's upstream color,
                # keeping the upper projected flow and the real dark edge paint.
                local_uv = barycentric @ flow_uv[loops]
                source_uv = local_uv.copy()
                tip = np.clip((local_uv[:, 1] - .60) / .40, 0, 1)
                tip = tip * tip * (3 - 2 * tip)
                source_uv[:, 1] -= .16 * tip
                amount = np.clip((local_uv[:, 1] - .50) / .22, 0, 1)
                amount = amount * amount * (3 - 2 * amount)
                own_color = reference.sample_flow(source_uv, flow)
                color = color * (1 - amount[:, None]) + own_color * amount[:, None]
        elif flow is not None:
            color = reference.sample_flow(barycentric @ flow_uv[loops], flow)
        else:
            color = reference.sample(barycentric @ coordinates[np.asarray(triangle.vertices)], weights)
        tile[yy[inside], xx[inside]] = color
        covered[yy[inside], xx[inside]] = True
    count = int(covered.sum())
    if not count:
        raise ValueError(f'{obj.name}: no component UV triangle covers an atlas pixel')
    # Extend paint around each UV island so mipmaps do not reveal a dark seam.
    for _ in range(padding):
        total, neighbors = np.zeros_like(tile), np.zeros_like(covered, dtype=np.uint8)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            shifted = np.roll(covered, (dy, dx), (0, 1))
            if dy == -1: shifted[-1] = False
            if dy == 1: shifted[0] = False
            if dx == -1: shifted[:, -1] = False
            if dx == 1: shifted[:, 0] = False
            total += np.roll(tile, (dy, dx), (0, 1)) * shifted[:, :, None]
            neighbors += shifted
        new = ~covered & (neighbors > 0)
        tile[new] = total[new] / neighbors[new, None]
        covered |= new
    tile[~covered] = tile[covered].mean(axis=0)
    if is_root_bed:
        return tile, count, dict(mapping='registered-root-bed', spatialColor=.7, originalRootColor=.3)
    if obj.name in PAINTED_FLOW_COMPONENTS:
        return tile, count, dict(mapping='authored-longitudinal',
                                uvSection='linear-x' if obj['region'] == 'crown' else 'circular',
                                palette=reference.strand_palette.tolist(),
                                paletteSource='side crop x25:138 y175:245 genuine hair pixels only',
                                palettePixels=reference.strand_palette_pixels)
    if projection_view is not None:
        if obj.name == 'Inner long fringe':
            return tile, count, dict(mapping='registered-front-with-own-tip-flow',
                                    piece=flow['piece'], blend=[.50, .72],
                                    sourceTipCompression=.16, sourceTipCompressionRange=[.60, 1])
        return tile, count, dict(mapping=f'registered-{projection_view}')
    return tile, count, dict(mapping='flow', **flow) if flow is not None else dict(mapping='xyz')


def paint_components(objects, output_directory, resolution=2048):
    """Bake registered painted color onto component UVs and return their one material."""
    if not objects or any(obj.type != 'MESH' or obj.data.uv_layers.active is None for obj in objects):
        raise ValueError('Painted hair requires mesh components with existing 0..1 UVs')
    output_directory = Path(output_directory)
    output_directory.mkdir(parents=True, exist_ok=True)
    destination = output_directory / 'painted-hair-atlas.png'
    if destination.exists():
        raise ValueError(f'Preserved painted hair atlas exists: {destination}')
    reference = PaintedReference()
    grid = math.ceil(math.sqrt(len(objects)))
    tile_size, padding = resolution // grid, 8
    if tile_size < padding * 4:
        raise ValueError(f'{len(objects)} components exceed the {resolution}px hair atlas capacity')
    atlas = np.ones((resolution, resolution, 4), dtype=np.float32)
    report = []
    for index, obj in enumerate(objects):
        tile, count, mapping = raster_component(obj, reference, tile_size, padding)
        col, row = index % grid, index // grid
        atlas[row * tile_size:(row + 1) * tile_size, col * tile_size:(col + 1) * tile_size, :3] = tile
        for loop in obj.data.uv_layers.active.data:
            loop.uv = ((col * tile_size + padding + loop.uv.x * (tile_size - padding * 2)) / resolution,
                       (row * tile_size + padding + loop.uv.y * (tile_size - padding * 2)) / resolution)
        report.append(dict(name=obj.name, paintedPixels=count, tile=[col, row], meanColor=tile.mean(axis=(0, 1)).tolist(), **mapping))
    image = bpy.data.images.new('D1 painted component atlas', resolution, resolution)
    image.colorspace_settings.name = 'sRGB'
    image.pixels.foreach_set(atlas.ravel())
    image.filepath_raw, image.file_format = str(destination), 'PNG'
    image.save(); image.pack()
    previous = bpy.data.materials.get('model.001')
    if previous is not None:
        # The browser identifies hair by this exact material name; Blender must
        # not silently append a suffix because a hidden reference still uses it.
        previous.name = 'Reference hair material before painting'
    mat = bpy.data.materials.new('model.001')
    mat.use_nodes = True
    bsdf = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = .7
    bsdf.inputs['Specular IOR Level'].default_value = .18
    texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    mat.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    for obj in objects:
        obj.data.materials.clear(); obj.data.materials.append(mat)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
    (output_directory / 'paint-report.json').write_text(json.dumps(dict(source='D1 painted front/side/back crops',
        registration='ear anchored; Blender Z-up/front -Y', atlas=[resolution, resolution], components=report), indent=2) + '\n')
    return mat


def single_lock_test(stage_name):
    stage = HERE / stage_name
    if stage.exists():
        raise ValueError(f'Preserved painted component test exists: {stage}')
    stage.mkdir()
    bpy.ops.wm.open_mainfile(filepath=str(HERE / 'single-lock-01' / 'Single-Lock.blend'))
    lock = bpy.data.objects['Single rebuilt swept fringe']
    bpy.ops.object.select_all(action='DESELECT')
    lock.select_set(True); bpy.context.view_layer.objects.active = lock
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')
    original = np.asarray([vertex.co for vertex in lock.data.vertices]).copy()
    paint_components([lock], stage, resolution=1024)
    assert np.array_equal(original, np.asarray([vertex.co for vertex in lock.data.vertices])), 'Painting changed the closed lock geometry'
    scene, camera = bpy.context.scene, bpy.context.scene.camera
    centre = Vector((0, .015, 2.70))
    for name, direction in {'front': (0, -1, 0), 'right': (-1, 0, 0), 'three-quarter': (-1, -1, 0)}.items():
        camera.location = centre + Vector(direction) * 4
        camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(stage / f'{name}.png')
        bpy.ops.render.render(write_still=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(stage / 'Painted-Single-Lock.blend'))
    print('PAINTED_COMPONENT_TEST_OK', json.dumps(dict(stage=stage_name, geometryUnchanged=True)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--test-stage', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    single_lock_test(args.test_stage)
