"""Shared Blender scene pieces: mesh import, materials, studio and ortho checks."""
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HEIGHT = 3.1
FRAMES = {
    # name: (center z, ortho height, width px, height px)
    'full': (1.55, 3.3, 800, 900),
    'head': (2.50, 1.30, 700, 700),
    'torso': (1.55, 1.45, 700, 700),
    'legs': (0.55, 1.20, 700, 700),
}
VIEWS = {
    # name: (camera direction from target, up axis)
    'front': Vector((0, -1, 0)),
    'right': Vector((-1, 0, 0)),
    'back': Vector((0, 1, 0)),
    'left': Vector((1, 0, 0)),
}


def srgb(hex_color):
    def lin(v):
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    h = hex_color.lstrip('#')
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    s.cycles.device = 'GPU'
    s.cycles.use_denoising = True
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'Medium High Contrast'
    s.render.film_transparent = True


def mesh_from_arrays(name, verts, faces, collection=None):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set('co', np.asarray(verts, dtype=np.float32).ravel())
    me.loops.add(faces.size)
    me.loops.foreach_set('vertex_index', np.asarray(faces, dtype=np.int32).ravel())
    me.polygons.add(len(faces))
    me.polygons.foreach_set('loop_start', np.arange(0, faces.size, 3, dtype=np.int32))
    me.polygons.foreach_set('loop_total', np.full(len(faces), 3, dtype=np.int32))
    me.update()
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def load_part(build, name):
    data = np.load(build / f'{name}.npz')
    ob = mesh_from_arrays(name, data['verts'], data['faces'])
    if 'uv' in data:
        me = ob.data
        loops = np.empty(len(me.loops), dtype=np.int32)
        me.loops.foreach_get('vertex_index', loops)
        me.uv_layers.new(name='UVMap').data.foreach_set('uv', data['uv'][loops].ravel())
    return ob


def principled(name, color, roughness=0.5, **inputs):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = srgb(color) if isinstance(color, str) else color
    bsdf.inputs['Roughness'].default_value = roughness
    for key, value in inputs.items():
        bsdf.inputs[key].default_value = value
    mat.diffuse_color = bsdf.inputs['Base Color'].default_value
    return mat


def vertex_color_material(name, attr, roughness=0.5, **inputs):
    mat = principled(name, '#ffffff', roughness, **inputs)
    nt = mat.node_tree
    node = nt.nodes.new('ShaderNodeVertexColor')
    node.layer_name = attr
    nt.links.new(node.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    return mat


def image_material(name, image, roughness=0.4, **inputs):
    mat = principled(name, '#ffffff', roughness, **inputs)
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    nt.links.new(tex.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    return mat


def image_from_array(name, rgba):
    """rgba holds linear colours; store them as an sRGB image like a painted texture."""
    rgba = np.array(rgba, dtype=np.float32)
    c = np.clip(rgba[..., :3], 0, 1)
    rgba[..., :3] = np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.flipud(rgba).astype(np.float32).ravel())
    img.pack()
    return img


def set_vertex_colors(ob, attr, colors):
    me = ob.data
    layer = me.color_attributes.new(attr, 'FLOAT_COLOR', 'POINT')
    layer.data.foreach_set('color', np.asarray(colors, dtype=np.float32).ravel())


def vertices(ob):
    co = np.empty(len(ob.data.vertices) * 3, dtype=np.float32)
    ob.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


def studio():
    s = bpy.context.scene
    world = bpy.data.worlds.new('Studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = srgb('#9a9a9a')
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    s.world = world

    def area(name, loc, energy, size, color='#ffffff'):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = energy
        light.size = size
        light.color = srgb(color)[:3]
        ob = bpy.data.objects.new(name, light)
        ob.location = loc
        direction = Vector((0, 0, 1.6)) - Vector(loc)
        ob.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        s.collection.objects.link(ob)

    area('Key', (-2.6, -4.2, 4.6), 250, 3.0, '#ffe8d4')
    area('Fill', (4.2, -3.0, 2.4), 90, 4.0, '#eef3ff')
    area('Rim', (1.5, 4.5, 4.2), 220, 2.5)
    area('RimL', (-3.5, 3.5, 3.0), 120, 2.5)
    area('Front', (0, -5.0, 1.8), 55, 5.0)


def _camera():
    s = bpy.context.scene
    cam = s.objects.get('Camera')
    if cam is None:
        cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
        s.collection.objects.link(cam)
    s.camera = cam
    return cam


def render(view, focus, path, samples):
    s = bpy.context.scene
    cz, oh, w, h = FRAMES[focus]
    cam = _camera()
    s.render.resolution_x, s.render.resolution_y = w, h
    s.cycles.samples = samples
    target = Vector((0, 0, cz))
    if view == 'hero':
        cam.data.type = 'PERSP'
        cam.data.lens = 70
        direction = Vector((-0.55, -1, 0.12)).normalized()
        cam.location = target + direction * (oh * 2.1)
    else:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = oh if h >= w else oh * w / h
        cam.location = target + VIEWS[view] * 8
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_end = 50
    s.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
