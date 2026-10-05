"""Packed PBR surfaces for Grassy's editable sculpture and shared GLB assets."""

import math

import bpy
import numpy as np


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def rgb(color):
    return tuple(linear(int(color[i:i + 2], 16) / 255) for i in (0, 2, 4))


def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb(color), 1)
    shader = mat.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = mat.diffuse_color
    shader.inputs['Roughness'].default_value = roughness
    return mat


def _image(name, channels, color=False):
    height, width = channels.shape[:2]
    pixels = np.ones((height, width, 4), dtype=np.float32)
    pixels[:, :, :3] = channels
    result = bpy.data.images.new(name, width=width, height=height, alpha=False)
    if not color:
        result.colorspace_settings.name = 'Non-Color'
    result.pixels.foreach_set(pixels.ravel())
    result.pack()
    return result


def _normal(height, strength):
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    normal = np.stack((-dx, -dy, np.ones_like(height)), axis=2)
    normal /= np.linalg.norm(normal, axis=2)[:, :, None]
    return normal * .5 + .5


def _surface_maps(style, size=1024):
    y, x = np.mgrid[:size, :size].astype(np.float32) / size
    rng = np.random.default_rng(429)
    noise = rng.normal(0, 1, (size, size)).astype(np.float32)
    if style == 'knit':
        # Two curved yarn limbs meet at the foot of each stocking stitch.
        # Fine ply modulation follows the limb, separate from garment folds.
        u, v = x * 8, y * 12
        row = v % 1
        half_width = .080 + .28 * np.sin(row * math.pi / 2) ** .78
        column = (u + .5) % 1 - .5
        distance = np.abs(np.abs(column) - half_width)
        strand = np.exp(-(distance / .065) ** 2)
        ply = .92 + .08 * np.sin(math.tau * (row * 10 + np.abs(column) * 11))
        loop = strand * ply
        bottom = np.exp(-((row - .055) / .10) ** 2) * np.exp(-(column / .15) ** 2)
        height = .65 * loop + .16 * bottom + .025 * noise
        diamond = np.abs(np.abs((x * 4 + .5) % 1 - .5) + np.abs((y * 6 + .5) % 1 - .5) - .50)
        jacquard = np.exp(-(diamond / .035) ** 2)
        height += .085 * jacquard
        shade = .93 + .033 * loop + .035 * jacquard + .007 * noise
        rough = .83 + .035 * (1 - strand) + .013 * noise
        strength = 1.35
    elif style == 'denim':
        warp = (.5 + .5 * np.cos(math.tau * (x * 64 + .035 * np.sin(math.tau * y * 13)))) ** 3
        weft = (.5 + .5 * np.cos(math.tau * y * 64)) ** 3
        twill = .5 + .5 * np.sin(math.tau * (x * 16 - y * 16))
        height = .20 * warp + .16 * weft + .16 * twill + .025 * noise
        slub = .5 + .5 * np.sin(math.tau * (x * 11 + .035 * np.sin(math.tau * y * 3)))
        shade = .91 + .055 * twill + .025 * warp + .027 * slub + .012 * noise
        rough = .78 + .06 * twill + .02 * noise
        strength = .62
    elif style == 'rib':
        column = .5 + .5 * np.cos(math.tau * x * 16)
        yarn = .5 + .5 * np.sin(math.tau * (y * 64 + .13 * np.cos(math.tau * x * 16)))
        height = .22 * column + .065 * yarn + .01 * noise
        shade = .96 + .035 * yarn + .015 * noise
        rough = .82 + .04 * (1 - column)
        strength = 1.2
    elif style == 'hair':
        # Small nonuniform strands run root-to-tip; no painted bright stripes.
        bend = .008 * np.sin(math.tau * y) + .002 * np.sin(math.tau * (y * 3 + x * 2))
        wave = math.tau * (x + bend)
        strand = .48 * np.sin(wave * 93) + .27 * np.sin(wave * 157 + 1.7)
        strand += .14 * np.sin(wave * 211 + .4)
        groups = .5 + .5 * np.sin(math.tau * (x * 11 + .14 * np.sin(math.tau * y)))
        height = .07 * strand + .035 * groups
        root_tone = .84 + .16 * np.sin(math.pi * y * .85)
        shade = root_tone * (.94 + .05 * groups + .045 * strand)
        rough = .56 + .07 * groups + .018 * strand
        strength = .85
    else:
        grain = .5 + .5 * np.sin(math.tau * x * 96) * np.sin(math.tau * y * 96)
        height = .045 * noise + .035 * grain
        shade = .985 + .008 * noise
        rough = .59 + .025 * grain + .017 * noise
        strength = .5
    return shade, _normal(height, strength), np.clip(rough, .15, 1)


def _textured(mat, style, color, maps):
    shade, normal, rough = maps
    base = np.asarray([int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)
    colors = np.clip(shade[:, :, None] * base, 0, 1)
    # Byte-buffer images store encoded sRGB values. Linearizing these pixels
    # here applies gamma twice and turns brown hair almost black after packing.
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes['Principled BSDF']
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = _image(mat.name + '_color', colors, color=True)
    links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    normal_name, rough_name = style + '_normal', style + '_roughness'
    normal_image = bpy.data.images.get(normal_name)
    if normal_image is None:
        normal_image = _image(normal_name, normal)
    rough_image = bpy.data.images.get(rough_name)
    if rough_image is None:
        rough_image = _image(rough_name, np.repeat(rough[:, :, None], 3, axis=2))
    tex_normal = nodes.new('ShaderNodeTexImage')
    tex_normal.image = normal_image
    normal_node = nodes.new('ShaderNodeNormalMap')
    normal_node.inputs['Strength'].default_value = .55 if style == 'knit' else .65
    links.new(tex_normal.outputs['Color'], normal_node.inputs['Color'])
    links.new(normal_node.outputs['Normal'], shader.inputs['Normal'])
    tex_rough = nodes.new('ShaderNodeTexImage')
    tex_rough.image = rough_image
    links.new(tex_rough.outputs['Color'], shader.inputs['Roughness'])


def make_materials():
    specs = {
        'skin': ('ffc0a0', .48), 'skin_blush': ('f09277', .53),
        'skin_nail': ('f4bca9', .48), 'hair': ('2a1c17', .44),
        'hair_light': ('34231c', .47), 'hair_dark': ('201612', .50),
        'brow': ('38241d', .62), 'eye_white': ('fff8ed', .23),
        'iris': ('754021', .31), 'iris_light': ('a9753f', .34),
        'pupil': ('170e09', .23), 'highlight': ('fffdf7', .09),
        'lip': ('d57966', .56), 'mouth_shadow': ('994335', .62),
        'sweater': ('ce0413', .89), 'sweater_rib': ('be0716', .88),
        'denim': ('3e649b', .88), 'denim_cuff': ('809bb8', .88),
        'stitch': ('ba8550', .77), 'shoe': ('faf5ed', .63),
        'sole': ('e9dac9', .79), 'shoe_trim': ('ad9988', .70),
        'shoe_lace': ('f7eada', .82),
    }
    mats = {name: material(name, *values) for name, values in specs.items()}
    skin = mats['skin'].node_tree.nodes['Principled BSDF']
    skin.inputs['Subsurface Weight'].default_value = .075
    skin.inputs['Subsurface Radius'].default_value = (.8, .35, .22)
    skin.inputs['Subsurface Scale'].default_value = .035
    skin.inputs['Specular IOR Level'].default_value = .22
    mats['pupil'].node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = .10
    mats['iris'].node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = .22
    for name in ['hair', 'hair_light', 'hair_dark']:
        shader = mats[name].node_tree.nodes['Principled BSDF']
        shader.inputs['Specular IOR Level'].default_value = .21
        shader.inputs['Anisotropic'].default_value = .20
    for name in ['sweater', 'sweater_rib', 'denim', 'denim_cuff']:
        shader = mats[name].node_tree.nodes['Principled BSDF']
        shader.inputs['Sheen Weight'].default_value = .025
        shader.inputs['Sheen Roughness'].default_value = .75
        shader.inputs['Specular IOR Level'].default_value = .16
    for style, names in [('knit', ['sweater']), ('denim', ['denim', 'denim_cuff']),
                         ('rib', ['sweater_rib']), ('hair', ['hair', 'hair_light', 'hair_dark']),
                         ('leather', ['shoe', 'shoe_trim'])]:
        maps = _surface_maps(style)
        for name in names:
            _textured(mats[name], style, specs[name][0], maps)
    return mats


def shade_denim(objects, materials):
    """Place broad indigo wear on the garment, independently of repeating weave UVs."""
    for name in ('denim', 'denim_cuff'):
        mat = materials[name]
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        shader = nodes['Principled BSDF']
        color_socket = shader.inputs['Base Color'].links[0].from_socket
        tint = nodes.new('ShaderNodeVertexColor')
        tint.layer_name = 'DenimWear'
        multiply = nodes.new('ShaderNodeMix')
        multiply.data_type = 'RGBA'
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        links.new(color_socket, multiply.inputs[6])
        links.new(tint.outputs['Color'], multiply.inputs[7])
        links.new(multiply.outputs[2], shader.inputs['Base Color'])
    for obj in objects:
        if obj.type != 'MESH' or not any(mat in (materials['denim'], materials['denim_cuff']) for mat in obj.data.materials):
            continue
        points = np.empty((len(obj.data.vertices), 3), dtype=np.float32)
        normals = np.empty_like(points)
        obj.data.vertices.foreach_get('co', points.ravel())
        obj.data.vertices.foreach_get('normal', normals.ravel())
        cuff = materials['denim_cuff'] in list(obj.data.materials)
        x, y, z = points.T
        front = np.maximum(0, -normals[:, 1]) ** 1.5
        back = np.maximum(0, normals[:, 1]) ** 1.5
        worn = np.exp(-((z - .76) / .19) ** 2) * front
        worn += .68 * np.exp(-((z - 1.08) / .18) ** 2) * front
        worn += .55 * np.exp(-((z - 1.11) / .12) ** 2) * back
        worn = np.minimum(1, .19 + .66 * worn + .028 * np.sin(x * 43 + z * 25 + y * 19))
        dark, light = ((.79, .84, .92), (1, 1, 1)) if cuff else ((.36, .49, .68), (.96, .98, 1))
        rgba = np.ones((len(points), 4), dtype=np.float32)
        rgba[:, :3] = np.asarray(dark) + (np.asarray(light) - dark) * worn[:, None]
        colors = obj.data.color_attributes.new(name='DenimWear', type='FLOAT_COLOR', domain='POINT')
        obj.data.color_attributes.active_color = colors
        colors.data.foreach_set('color', rgba.ravel())
