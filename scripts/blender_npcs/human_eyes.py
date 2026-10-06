"""Eyeball-following blink shells fitted to the retained human face texture."""
import math

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


def make_eyelids(obj, eyes, skin_sample_z, line_shape):
    mesh = obj.data
    mesh.calc_loop_triangles()
    triangles = list(mesh.loop_triangles)
    surface = BVHTree.FromPolygons([v.co for v in mesh.vertices],
                                   [t.vertices for t in triangles], all_triangles=True)
    uv_data = mesh.uv_layers.active.data
    source = mesh.materials[0]
    shader = next(n for n in source.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    image = shader.inputs['Base Color'].links[0].from_node.image
    space = image.colorspace_settings.name
    image.colorspace_settings.name = 'Non-Color'
    pixels = np.asarray(image.pixels[:]).reshape(image.size[1], image.size[0], 4)
    image.colorspace_settings.name = space

    def sample(x, z):
        point, _, index, _ = surface.ray_cast(Vector((x, -3, z)), Vector((0, 1, 0)))
        if point is None:
            raise ValueError(f'{obj.name} human eyelid misses face: x={x:.5f}, z={z:.5f}')
        triangle = triangles[index]
        uv = barycentric_transform(point, *[mesh.vertices[i].co for i in triangle.vertices],
                                   *[Vector((*uv_data[i].uv, 0)) for i in triangle.loops])
        ix = min(image.size[0] - 1, int(uv.x * image.size[0]))
        iy = min(image.size[1] - 1, int(uv.y * image.size[1]))
        return point, pixels[iy, ix]

    material = bpy.data.materials.new('Human eyelid skin sampled from source')
    material.use_nodes = True
    bsdf = material.node_tree.nodes['Principled BSDF']
    colors = material.node_tree.nodes.new('ShaderNodeVertexColor')
    colors.layer_name = 'EyelidSkin'
    material.node_tree.links.new(colors.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = .65
    crease = bpy.data.materials.new('Human eyelid crease')
    crease.use_nodes = True
    crease.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.16, .055, .032, 1)
    crease.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .8
    positions, closed, travel, skin, faces, materials = [], [], [], [], [], []
    rows, columns = 8, 40
    for eye in eyes:
        cx, cz = eye['center']
        for upper in (True, False):
            start = len(positions)
            for column in range(columns + 1):
                u = column / columns * 2 - 1
                outward = u * (1 if cx > 0 else -1)
                radius = eye['outerRadius'] if outward > 0 else eye['innerRadius']
                x, arch = cx + u * radius, math.sqrt(max(0, 1 - u * u))
                line = cz + line_shape[0] * outward + line_shape[1] * (1 - u * u)
                rim = line + (eye['upper'] if upper else eye['lower']) * arch
                for row in range(rows + 1):
                    v = (0, .18, .36, .54, .72, .86, .95, .985, 1)[row]
                    open_z = rim + (-1 if upper else 1) * .0004 * v * arch
                    closed_z = rim + (line - rim) * v
                    position, _ = sample(x, open_z)
                    target, _ = sample(x, closed_z)
                    position.y -= .0008
                    # The attachment rim and eye corners stay on the face;
                    # only the moving edge needs clearance over the eyeball.
                    attachment = min(1, v / .18) * min(1, arch / .25)
                    target.y -= .0008 + (.0042 if upper else .0027) * attachment
                    correction = 0
                    for fraction in (.2, .4, .6, .8):
                        middle, _ = sample(x, open_z + (closed_z - open_z) * fraction)
                        clearance = .0008 + .0022 * attachment
                        delta = middle.y - clearance - (position.y * (1 - fraction) + target.y * fraction)
                        correction = min(correction, delta / (4 * fraction * (1 - fraction)))
                    # The nearby cheek is the same original skin; no iris or eyebrow
                    # pixels are stretched onto the closed lid through atlas seams.
                    _, color = sample(x, skin_sample_z - .018 * v)
                    positions.append(position)
                    closed.append(target)
                    travel.append(correction)
                    skin.append(color)
                if column:
                    for row in range(rows):
                        a = start + (column - 1) * (rows + 1) + row
                        b = start + column * (rows + 1) + row
                        faces.append((a, a + 1, b + 1, b) if upper else (a, b, b + 1, a + 1))
                        materials.append(1 if upper and row == rows - 1 else 0)
    data = bpy.data.meshes.new('Human eyelids')
    data.from_pydata(positions, [], faces)
    data.materials.append(material)
    data.materials.append(crease)
    colors = data.color_attributes.new(name='EyelidSkin', type='FLOAT_COLOR', domain='POINT')
    for color, value in zip(colors.data, skin):
        color.color_srgb = value
    for face, material_index in zip(data.polygons, materials):
        face.use_smooth = True
        face.material_index = material_index
    eyelids = bpy.data.objects.new('Human eyelids', data)
    bpy.context.collection.objects.link(eyelids)
    for group in obj.vertex_groups:
        eyelids.vertex_groups.new(name=group.name)
    eyelids.vertex_groups['head'].add(list(range(len(positions))), 1, 'REPLACE')
    original_count = len(mesh.vertices)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    eyelids.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    obj.shape_key_add(name='Basis', from_mix=False)
    blink = obj.shape_key_add(name='Blink', from_mix=False)
    arc = obj.shape_key_add(name='BlinkTravel', from_mix=False)
    for index, target in enumerate(closed):
        blink.data[original_count + index].co = target
        arc.data[original_count + index].co.y += travel[index]
    obj['eyelid_original_vertices'] = original_count
    return blink, arc
