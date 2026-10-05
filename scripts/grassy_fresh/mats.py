"""Materials and tileable textures, all generated procedurally."""
import math

import bpy
import numpy as np

from geo import smoothstep


def rgb(hex_):
    h = hex_.lstrip('#')
    lin = lambda v: ((v / 255 + 0.055) / 1.055) ** 2.4 if v / 255 > 0.04045 else v / 255 / 12.92
    return tuple(lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def periodic_noise(h, w, cut, seed):
    rng = np.random.default_rng(seed)
    f = np.fft.fft2(rng.standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f *= np.exp(-(fx**2 + fy**2) / (2 * cut**2))
    out = np.real(np.fft.ifft2(f))
    return (out - out.mean()) / (out.std() + 1e-9)


def to_image(name, arr, nonColor=False):
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1))], -1)
    if not nonColor:  # callers work in linear; the image datablock stores sRGB
        a = np.clip(arr[..., :3], 0, 1)
        arr = np.concatenate([np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055), arr[..., 3:]], -1)
    img = bpy.data.images.new(name, w, h, alpha=True)
    if nonColor:
        img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    img.pack()
    return img


def normal_from_height(hmap, strength):
    dx = (np.roll(hmap, -1, 1) - np.roll(hmap, 1, 1)) * 0.5
    dy = (np.roll(hmap, -1, 0) - np.roll(hmap, 1, 0)) * 0.5
    n = np.stack([-dx * strength, -dy * strength, np.ones_like(hmap)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def hex_height(h, w, period, rim):
    """Honeycomb with raised borders. The tile holds a whole number of cells so it repeats cleanly."""
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    ax, ay = period, period * math.sqrt(3)
    dist = []
    for j in range(-2, int(h / (ay / 2)) + 3):
        for i in range(-2, int(w / ax) + 3):
            cx = i * ax + (j % 2) * ax / 2
            cy = j * ay / 2
            dist.append(np.hypot(xx - cx, yy - cy))
    d = np.partition(np.stack(dist), 1, axis=0)[:2]
    return smoothstep(0, rim, d[1] - d[0])


def knit_textures(base, seed):
    h, w = 296, 256
    hexh = hex_height(h, w, 256 / 4, 7)
    fuzz = periodic_noise(h, w, 30, seed)
    height = 0.30 * hexh + 0.05 * fuzz
    col = np.array(rgb(base))[None, None, :] * (0.78 + 0.28 * hexh[..., None] + 0.05 * fuzz[..., None])
    return to_image('knit_color', col), to_image('knit_normal', normal_from_height(height, 1.3), True)


def denim_textures(base, seed):
    h, w = 296, 256
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    twill = 0.5 + 0.5 * np.sin((xx + yy) * 2 * math.pi / 8)
    weft = periodic_noise(h, w, 90, seed)
    hexh = hex_height(h, w, 256 / 4, 9)
    fade = periodic_noise(h, w, 5, seed + 1)
    height = 0.30 * twill + 0.03 * weft + 0.10 * hexh
    tint = 1.0 + 0.04 * fade[..., None] + 0.02 * weft[..., None]
    col = np.array(rgb(base))[None, None, :] * tint * (0.9 + 0.12 * hexh[..., None])
    return to_image('denim_color', col), to_image('denim_normal', normal_from_height(height, 1.1), True)


def hair_texture():
    h, w = 256, 64
    v = np.linspace(0, 1, h)[:, None]
    u = np.linspace(0, 1, w)[None, :]
    root, mid, tip = np.array(rgb('0f0907')), np.array(rgb('2a1a14')), np.array(rgb('3a251d'))
    t = np.clip(v, 0, 1)
    col = np.where(t[..., None] < 0.5, root + (mid - root) * (t[..., None] / 0.5),
                   mid + (tip - mid) * ((t[..., None] - 0.5) / 0.5))
    streak = periodic_noise(h, w, 14, 3)
    ridge = np.exp(-((u - 0.25) / 0.14) ** 2) + np.exp(-((u - 0.75) / 0.14) ** 2)
    col = col * (0.82 + 0.1 * streak[..., None] + 0.30 * ridge[..., None] * smoothstep(0.1, 0.8, t)[..., None] * 0.55)
    return to_image('hair_color', col)


def principled(name, base, rough, metal=0.0, color_img=None, normal_img=None, nstrength=1.0, sheen=0.0, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb(base), 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if sheen:
        bsdf.inputs['Sheen Weight'].default_value = sheen
        bsdf.inputs['Sheen Roughness'].default_value = 0.5
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.2
    if color_img is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = color_img
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if normal_img is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = normal_img
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = nstrength
        nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def make_materials(skin_img=None):
    kc, kn = knit_textures('c70f1b', 11)
    dc, dn = denim_textures('4a78b2', 21)
    M = {
        'skin': principled('skin', 'f7bfa5', 0.48, color_img=skin_img, coat=0.0),
        'hair': principled('hair', '2b1d18', 0.42, color_img=hair_texture()),
        'sweater': principled('sweater', 'd8161d', 0.9, color_img=kc, normal_img=kn, nstrength=0.8, sheen=0.1),
        'jeans': principled('jeans', '4572ae', 0.74, color_img=dc, normal_img=dn, nstrength=0.7),
        'thread': principled('thread', 'c98a3d', 0.7),
        'rivet': principled('rivet', 'b9733a', 0.35, metal=1.0),
        'shoe': principled('shoe', 'f1e4d6', 0.5, coat=0.2),
        'shoe_panel': principled('shoe_panel', '8a7466', 0.6),
        'sole': principled('sole', 'f7efe4', 0.55),
        'lace': principled('lace', 'f4eadf', 0.7),
        'eye_white': principled('eye_white', 'fbf6f2', 0.25),
        'iris': principled('iris', '5a2e1c', 0.2),
        'pupil': principled('pupil', '0b0605', 0.15),
        'brow': principled('brow', '1f140f', 0.55),
        'lip': principled('lip', 'c7685f', 0.4),
        'nail': principled('nail', 'fbd0c0', 0.3),
    }
    hl = principled('highlight', 'ffffff', 0.05)
    nt = hl.node_tree
    nt.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 1, 1, 1)
    nt.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.0
    M['highlight'] = hl
    return M
