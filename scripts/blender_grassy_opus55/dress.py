"""Turn sculpted parts into a dressed character: colors, eyes and materials."""
import json
import math
from pathlib import Path

import bpy
import numpy as np

import scene
from scene import srgb

SKIN = '#f9bc9c'
from sculpt_head import EYE_X, EYE_Z, EYE_RADII, EYE_YAW, EYE_PITCH, EYE_SINK, MOUTH_Z, MOUTH_HALF, MOUTH_LIFT


def _lin(hex_color):
    return np.array(srgb(hex_color)[:3], dtype=np.float32)


def _blend(base, color, weight):
    return base * (1 - weight[:, None]) + _lin(color)[None, :] * weight[:, None]


def _falloff(d, radius):
    t = np.clip(1 - d / radius, 0, 1)
    return t * t * (3 - 2 * t)


def skin_colors(v):
    col = np.tile(_lin(SKIN), (len(v), 1))
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    for s in (-1, 1):
        d = np.sqrt(((x - s * 0.20) / 1.0) ** 2 + ((z - 2.275) / 0.8) ** 2)
        col = _blend(col, '#f39484', 0.55 * _falloff(d, 0.09) * (y < -0.15))
        ear = np.sqrt((x - s * 0.425) ** 2 + (y - 0.045) ** 2 + (z - 2.31) ** 2)
        col = _blend(col, '#f2a088', 0.5 * _falloff(ear, 0.07))
    nose = np.sqrt(x ** 2 + (z - 2.30) ** 2 + (y + 0.41) ** 2)
    col = _blend(col, '#f7b29c', 0.35 * _falloff(nose, 0.05))
    curve = MOUTH_Z + MOUTH_LIFT * x * x
    mouth = np.sqrt((z - curve) ** 2 + np.maximum(np.abs(x) - MOUTH_HALF + 0.004, 0) ** 2)
    front = (y < -0.30).astype(np.float32)
    col = _blend(col, '#8e3f3a', 0.95 * _falloff(mouth, 0.011) * front)
    lip = np.sqrt((x / 1.6) ** 2 + (z - MOUTH_Z + 0.014) ** 2)
    col = _blend(col, '#f19c8c', 0.35 * _falloff(lip, 0.03) * front)
    return np.concatenate([col, np.ones((len(v), 1), np.float32)], axis=1)


def iris_image(size=512):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u = (xx + 0.5) / size * 2 - 1
    v = 1 - (yy + 0.5) / size * 2
    r = np.sqrt(u * u + v * v)
    rgba = np.ones((size, size, 4), np.float32)
    rgba[..., :3] = _lin('#fbf8f4')
    iris_r, pupil_r = 0.72, 0.33
    t = np.clip(r / iris_r, 0, 1)
    warm = np.clip((-v / iris_r) * 0.5 + 0.5, 0, 1)
    iris = _lin('#2e140b')[None, None, :] * (1 - warm[..., None]) + _lin('#7a4226')[None, None, :] * warm[..., None] ** 1.5
    # Radial fibres and a darker limbal ring.
    ang = np.arctan2(v, u)
    fibre = 1 + 0.08 * np.sin(ang * 37) * np.sin(ang * 11 + 1.3) * (t > 0.4)
    iris = iris * fibre[..., None]
    limbal = np.clip((t - 0.78) / 0.22, 0, 1)
    iris = iris * (1 - 0.65 * limbal[..., None])
    inside = r < iris_r
    rgba[inside, :3] = iris[inside]
    edge = (r >= iris_r) & (r < iris_r + 0.02)
    rgba[edge, :3] = rgba[edge, :3] * 0.6 + _lin('#2a120a') * 0.4
    pupil = r < pupil_r
    rgba[pupil, :3] = _lin('#140804')
    for cx, cy, rad in ((0.26, 0.27, 0.15), (-0.23, -0.27, 0.06)):
        d = np.sqrt((u - cx) ** 2 + (v - cy) ** 2)
        a = np.clip((rad - d) / 0.02, 0, 1)
        rgba[..., :3] = rgba[..., :3] * (1 - a[..., None]) + a[..., None]
    # Upper lid casts a soft shadow onto the eyeball.
    shade = np.clip((v - 0.35) / 0.65, 0, 1) * 0.35
    rgba[..., :3] *= (1 - shade[..., None])
    return rgba


def hair_image(size=512):
    rng = np.random.default_rng(7)
    u = np.arange(size) / size
    # Strand clumps across the lock, a few lighter fibres, slight variation along it.
    stripes = np.zeros(size)
    for freq, amp in ((23, 0.03), (53, 0.05), (121, 0.06), (233, 0.05)):
        stripes += amp * np.sin(2 * np.pi * (u * freq + rng.random()))
    stripes += 0.05 * rng.standard_normal(size)
    along = np.linspace(0, 1, size)[:, None]
    shade = 0.82 + stripes[None, :] + 0.10 * np.sin(along * 9 + stripes[None, :] * 4)
    base = _lin('#3e281f')
    light = _lin('#76493a')
    t = np.clip(shade - 0.85, 0, 1)[..., None] * 1.8
    rgb = base * np.clip(shade, 0.4, 1.2)[..., None] * (1 - t) + light * t
    # Tips get a touch warmer and lighter, roots darker.
    rgb *= (0.85 + 0.25 * along)[..., None]
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((size, size, 1))], -1)
    return rgba


def build_eyes(mat, eye_y, segments=(64, 40)):
    eyes = []
    for s in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments[0], ring_count=segments[1], radius=1)
        ob = bpy.context.object
        ob.name = 'eye_R' if s > 0 else 'eye_L'
        me = ob.data
        uv = me.uv_layers[0]
        co = np.array([vt.co[:] for vt in me.vertices], dtype=np.float32)
        loops = np.empty(len(me.loops), dtype=np.int32)
        me.loops.foreach_get('vertex_index', loops)
        uvs = np.stack([0.5 + co[loops, 0] * 0.5, 0.5 + co[loops, 2] * 0.5], axis=1)
        uv.data.foreach_set('uv', uvs.ravel())
        me.shade_smooth()
        ob.scale = EYE_RADII
        ob.location = (s * EYE_X, eye_y + EYE_SINK, EYE_Z)
        ob.rotation_euler = (math.radians(EYE_PITCH), 0, math.radians(s * EYE_YAW))
        scene.assign(ob, mat)
        eyes.append(ob)
    return eyes


def _bump(mat, kind, scale, strength):
    """Procedural fabric relief for the sculpt renders (baked for export later)."""
    nt = mat.node_tree
    coord = nt.nodes.new('ShaderNodeTexCoord')
    if kind == 'knit':
        tex = nt.nodes.new('ShaderNodeTexVoronoi')
        tex.feature = 'DISTANCE_TO_EDGE'
        tex.inputs['Scale'].default_value = scale
        out = tex.outputs['Distance']
    else:
        tex = nt.nodes.new('ShaderNodeTexWave')
        tex.wave_type = 'BANDS'
        tex.bands_direction = 'DIAGONAL'
        tex.inputs['Scale'].default_value = scale
        tex.inputs['Distortion'].default_value = 2.0
        out = tex.outputs['Fac']
    nt.links.new(coord.outputs['Object'], tex.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = 0.01
    nt.links.new(out, bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])


def jeans_colors(v):
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    rng = np.random.default_rng(3)
    col = np.tile(_lin('#3d6fb2'), (len(v), 1))
    # Worn, lighter fronts of the thighs and knees.
    fade = _falloff(np.abs(z - 0.75) / 0.9, 0.5) * (y < -0.05)
    col = _blend(col, '#5a87c4', 0.35 * fade)
    col *= (1 + 0.05 * rng.standard_normal(len(v)))[:, None]
    # Rolled cuffs show the lighter inside of the denim.
    col = _blend(col, '#7aa0d2', ((z > 0.298) & (z < 0.404)).astype(np.float32))
    stitch = '#c8823e'
    ax = np.abs(x)
    outseam = np.abs(np.arctan2(y + 0.012, ax - (0.245 + (1.06 - z) * 0.0)) )
    # Outseam: the outermost line of each leg.
    leg_center = 0.165 + (1.06 - np.clip(z, 0.42, 1.06)) / 0.64 * 0.08
    out_line = np.abs(y + 0.01) < 0.005
    col = _blend(col, stitch, (out_line & (ax > leg_center) & (z > 0.41) & (z < 1.25)).astype(np.float32) * 0.9)
    # Fly: J-stitch on the front.
    fly = (y < -0.12) & (z > 1.02) & (z < 1.30) & (np.abs(x - 0.045 + 0.5 * np.clip(1.08 - z, 0, 1)) < 0.004)
    col = _blend(col, stitch, fly.astype(np.float32))
    # Front pocket curves and the waistband seam.
    for sgn in (-1, 1):
        r = np.sqrt((x - sgn * 0.33) ** 2 + (z - 1.33) ** 2)
        pocket = (np.abs(r - 0.15) < 0.005) & (y < -0.05)
        col = _blend(col, stitch, pocket.astype(np.float32))
        # Back pockets: a stitched pentagon outline.
        bx, bz = x - sgn * 0.13, z - 1.10
        inside = (np.abs(bx) < 0.085) & (bz < 0.09) & (bz > -0.09 + 0.6 * np.abs(bx) - 0.0)
        edge = inside & ((np.abs(np.abs(bx) - 0.085) < 0.006) | (np.abs(bz - 0.09) < 0.006) |
                         (np.abs(bz + 0.09 - 0.6 * np.abs(bx)) < 0.006))
        col = _blend(col, stitch, (edge & (y > 0.12)).astype(np.float32))
    band = (np.abs(z - 1.285) < 0.004)
    col = _blend(col, stitch, band.astype(np.float32))
    return np.concatenate([col, np.ones((len(v), 1), np.float32)], 1)


def shoe_colors(v):
    import sculpt_body
    q = sculpt_body.shoe_local_coords(v)
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    col = np.tile(_lin('#f4e9df'), (len(v), 1))
    col = _blend(col, '#fdfbf7', (z < 0.064).astype(np.float32))
    col = _blend(col, '#e2d6cc', (np.abs(z - 0.064) < 0.004).astype(np.float32))
    # Taupe side stripe slanting back toward the heel, on both faces of the shoe.
    stripe = np.abs((y + 0.005) - 0.45 * (z - 0.13)) < 0.032
    col = _blend(col, '#8a7262', (stripe & (np.abs(x) > 0.06) & (z > 0.07) & (z < 0.21)).astype(np.float32))
    heel = (y > 0.29) & (z > 0.12)
    col = _blend(col, '#a48e7e', heel.astype(np.float32))
    laces = (z > 0.17) & (np.abs(x) < 0.07) & (y < 0.03) & (y > -0.14)
    col = _blend(col, '#fdfaf6', laces.astype(np.float32))
    return np.concatenate([col, np.ones((len(v), 1), np.float32)], 1)


def assemble(build: Path, strands_hair=True, eye_segments=(64, 40)):
    names = {p.stem for p in build.glob('*.npz')}
    if 'head' in names:
        head = scene.load_part(build, 'head')
        scene.set_vertex_colors(head, 'Col', skin_colors(scene.vertices(head)))
        scene.assign(head, scene.vertex_color_material(
            'Skin', 'Col', 0.48, **{'Subsurface Weight': 0.12, 'Subsurface Radius': (0.9, 0.35, 0.2), 'Subsurface Scale': 0.03}))
        eye_mat = scene.image_material('Eye', scene.image_from_array('eye_iris', iris_image()), 0.35,
                                       **{'Specular IOR Level': 0.3})
        build_eyes(eye_mat, json.loads((build / 'landmarks.json').read_text())['eye_y'], eye_segments)
    if 'brows' in names:
        scene.assign(scene.load_part(build, 'brows'), scene.principled('Brow', '#3a241c', 0.7))
    if 'locks' in names and strands_hair:
        import groom
        groom.strands(build)
    elif 'hair' in names:
        ob = scene.load_part(build, 'hair')
        scene.set_vertex_colors(ob, 'Col', np.load(build / 'hair.npz')['col'])
        scene.assign(ob, scene.vertex_color_material('Hair', 'Col', 0.45, **{'Specular IOR Level': 0.45}))
    if 'hair_cap' in names and strands_hair:
        scene.assign(scene.load_part(build, 'hair_cap'), scene.principled('HairBase', '#3b2519', 0.7))
    if 'sweater' in names:
        mat = scene.principled('Knit', '#d61c26', 0.9, **{'Sheen Weight': 0.25, 'Sheen Tint': (1.0, 0.35, 0.35, 1.0)})
        _bump(mat, 'knit', 42, 0.3)
        scene.assign(scene.load_part(build, 'sweater'), mat)
    skin = None
    for name in ('hands', 'ankles'):
        if name in names:
            skin = skin or scene.principled('SkinPlain', SKIN, 0.5, **{'Subsurface Weight': 0.12, 'Subsurface Radius': (0.9, 0.35, 0.2), 'Subsurface Scale': 0.03})
            scene.assign(scene.load_part(build, name), skin)
    if 'jeans' in names:
        ob = scene.load_part(build, 'jeans')
        scene.set_vertex_colors(ob, 'Col', jeans_colors(scene.vertices(ob)))
        mat = scene.vertex_color_material('Denim', 'Col', 0.8)
        _bump(mat, 'knit', 36, 0.18)
        scene.assign(ob, mat)
    if 'shoes' in names:
        ob = scene.load_part(build, 'shoes')
        scene.set_vertex_colors(ob, 'Col', shoe_colors(scene.vertices(ob)))
        scene.assign(ob, scene.vertex_color_material('Shoe', 'Col', 0.45))
    if 'lashes' in names:
        scene.assign(scene.load_part(build, 'lashes'), scene.principled('Lash', '#1e110c', 0.6))
