"""Geometry and portable PBR materials for the independent Grassy sculpture."""
import math

import bpy
from mathutils import Vector


def linear_color(hex_color):
    h = hex_color.lstrip('#')
    values = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def material(name, hex_color, roughness=.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    color = (*linear_color(hex_color), 1)
    mat.diffuse_color = color
    shader = mat.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Roughness'].default_value = roughness
    return mat


def materials():
    palette = {
        'skin': ('f3b797', .48), 'ear_inner': ('dc8b77', .54),
        'lip': ('b95e50', .50), 'nail': ('f5c5b0', .36),
        'white': ('fff8ed', .30), 'iris': ('754023', .32),
        'iris_dark': ('352016', .30), 'pupil': ('100b09', .25),
        'brow': ('38231c', .65), 'lash': ('271814', .60),
        'hair': ('483027', .42), 'hair_light': ('53382d', .42),
        'hair_dark': ('39271f', .46),
        'sweater': ('d92b39', .79), 'rib': ('c91e2d', .78),
        'denim': ('376496', .79), 'denim_cuff': ('7393b8', .82),
        'stitch': ('c39061', .82), 'shoe': ('eee5d6', .58),
        'sole': ('e0d8ca', .65), 'suede': ('aa9080', .86),
        'lace': ('f8efe2', .78), 'metal': ('998777', .3),
    }
    result = {key: material('Grassy_' + key, color, rough) for key, (color, rough) in palette.items()}
    skin = result['skin'].node_tree.nodes['Principled BSDF']
    skin.inputs['Subsurface Weight'].default_value = .065
    skin.inputs['Subsurface Radius'].default_value = (1, .45, .28)
    result['metal'].node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = .6
    result['pupil'].node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = .18
    for key in ('hair', 'hair_light', 'hair_dark'):
        result[key].node_tree.nodes['Principled BSDF'].inputs['Anisotropic'].default_value = .25
    return result


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def activate(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def mesh(name, verts, faces, mat, uvs=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    for poly in data.polygons:
        poly.use_smooth = True
    if uvs is not None:
        layer = data.uv_layers.new(name='UVMap')
        for loop in data.loops:
            layer.data[loop.index].uv = uvs[loop.vertex_index]
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    assign(obj, mat)
    return obj


def ellipsoid(name, loc, scale, mat, segments=64, rings=40):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return assign(obj, mat)


def curve(name, points, radius, mat, resolution=16):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = resolution
    data.bevel_depth = radius
    data.bevel_resolution = 3
    data.use_fill_caps = True
    spline = data.splines.new('NURBS')
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (*co[:3], 1)
        if len(co) == 4:
            p.radius = co[3]
    spline.order_u = min(3, len(points))
    spline.use_endpoint_u = True
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    assign(obj, mat)
    activate([obj])
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def union(name, objects, voxel=.007, smooth=4):
    activate(objects)
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    modifier = obj.modifiers.new('Continuous sculpt surface', 'REMESH')
    modifier.mode = 'VOXEL'
    modifier.voxel_size = voxel
    modifier.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = obj.modifiers.new('Soft sculpt polish', 'SMOOTH')
    modifier.factor = .65
    modifier.iterations = smooth
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def collection(name, objects):
    target = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(target)
    for obj in objects:
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        target.objects.link(obj)
    return target


def front_surface(obj, x, z):
    origin = obj.matrix_world.inverted() @ Vector((x, -2, z))
    hit, point, _, _ = obj.ray_cast(origin, Vector((0, 1, 0)))
    if not hit:
        raise ValueError(f'{obj.name}: no face surface at x={x}, z={z}')
    return (obj.matrix_world @ point).y
