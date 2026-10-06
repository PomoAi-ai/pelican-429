"""Fit editable blinking eyelids over the retained, texture-painted Rodin eyes."""
import math
from array import array

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


def build_eyelids(ob, rig, tier):
    """Return head-skinned lids with half-closed and closed shape targets."""
    mesh = ob.data
    mesh.calc_loop_triangles()
    triangles = list(mesh.loop_triangles)
    tree = BVHTree.FromPolygons([v.co for v in mesh.vertices],
                                [t.vertices for t in triangles], all_triangles=True)
    source_uv = mesh.uv_layers.active.data

    def surface(x, z):
        point, _, index, _ = tree.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)))
        if point is None:
            raise RuntimeError(f'Eyelid fitting ray missed {ob.name}: x={x:.5f}, z={z:.5f}')
        triangle = triangles[index]
        coordinates = [mesh.vertices[i].co for i in triangle.vertices]
        uv = [Vector((*source_uv[i].uv, 0)) for i in triangle.loops]
        sample = barycentric_transform(point, *coordinates, *uv)
        return point, (sample.x, sample.y)

    skin = mesh.materials[0].copy()
    skin.name = 'Grassy eyelid skin from original atlas'
    bsdf = next(node for node in skin.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    atlas = bsdf.inputs['Base Color'].links[0].from_node.image
    pixels = array('f', [0]) * len(atlas.pixels)
    atlas.pixels.foreach_get(pixels)
    # Sample colors into vertices: interpolating UVs between separate atlas islands
    # stretches hair/iris pixels across the moving skin patch.
    for input_name in ('Base Color', 'Normal', 'Roughness'):
        for link in list(bsdf.inputs[input_name].links):
            skin.node_tree.links.remove(link)
    bsdf.inputs['Roughness'].default_value = 0.55
    color_node = skin.node_tree.nodes.new('ShaderNodeVertexColor')
    color_node.layer_name = 'LidSkin'
    skin.node_tree.links.new(color_node.outputs['Color'], bsdf.inputs['Base Color'])
    skin.node_tree.links.new(color_node.outputs['Alpha'], bsdf.inputs['Alpha'])
    skin.surface_render_method = 'BLENDED'
    lash = bpy.data.materials.new('Grassy soft eyelid crease')
    lash.use_nodes = True
    lash_bsdf = lash.node_tree.nodes['Principled BSDF']
    lash_bsdf.inputs['Base Color'].default_value = (0.085, 0.031, 0.018, 1)
    lash_bsdf.inputs['Roughness'].default_value = 0.68
    lash.diffuse_color = lash_bsdf.inputs['Base Color'].default_value
    columns, rows = {'detailed': (48, 12), 'game': (32, 8), 'light': (24, 6)}[tier]
    result = []
    for side, sign in (('L', 1), ('R', -1)):
        for upper in (True, False):
            name = f'Eyelid{"Upper" if upper else "Lower"}_{side}'
            opened, halfway, closed, uvs, opacity, faces, materials = [], [], [], [], [], [], []
            for col in range(columns + 1):
                u = -1 + 2 * col / columns
                arch = math.sqrt(max(0, 1 - u * u))
                x = sign * 0.168 + u * 0.113
                center = 2.356 + sign * u * 0.012
                top, bottom = center + 0.092 * arch, center - 0.090 * arch
                meeting = top * 0.2 + bottom * 0.8
                outer = top if upper else bottom
                top_y = surface(x, top)[0].y
                bottom_y = surface(x, bottom)[0].y
                for row in range(rows + 1):
                    # Two narrow rows feather only the collar outside the painted eye.
                    t = (0, 0.02, 0.06)[row] if row < 3 else 0.06 + 0.94 * (row - 2) / (rows - 2)
                    z = outer + (meeting - outer) * t
                    point, _ = surface(x, z)
                    full_t = 0 if top == bottom else (top - z) / (top - bottom)
                    bridge = top_y + (bottom_y - top_y) * full_t
                    point.y = min(point.y, bridge) - 0.003 * math.sin(t * math.pi / 2) ** 2
                    folded = Vector((x, surface(x, outer)[0].y + 0.0002, outer))
                    half_arch = 0.014 * arch * t if upper else 0
                    middle, _ = surface(x, (outer + z) / 2 + half_arch)
                    clearance = 0.002 * math.sin(t * math.pi / 2)
                    middle.y -= clearance
                    # Keep the open fold behind the skin. A dedicated middle shape
                    # provides clearance through both halves without a raised open rim.
                    for weight in (0.125, 0.25, 0.5, 0.75, 0.875):
                        first_z = outer + (middle.z - outer) * weight
                        first_limit = (surface(x, first_z)[0].y - clearance - folded.y * (1 - weight)) / weight
                        second_z = middle.z + (point.z - middle.z) * weight
                        second_limit = (surface(x, second_z)[0].y - clearance - point.y * weight) / (1 - weight)
                        middle.y = min(middle.y, first_limit, second_limit)
                    opened.append(tuple(folded))
                    halfway.append(tuple(middle))
                    closed.append(tuple(point))
                    # Match the original skin at the fixed edge; moving rows sample
                    # adjacent unpainted skin rather than stretching iris pixels.
                    source_z = 2.45 if upper else 2.26
                    sample_z = outer + (source_z - outer) * math.sin(t * math.pi / 2)
                    uvs.append(surface(x, sample_z)[1])
                    opacity.append(min(1, abs(z - outer) / 0.01) * min(1, 0.113 * (1 - abs(u)) / 0.008))
            # A smooth outward envelope removes bumps inherited from the painted
            # eye mesh while preserving the clearance already established above.
            for shape in (halfway, closed):
                for _ in range(12):
                    previous = list(shape)
                    for col in range(1, columns):
                        for row in range(1, rows):
                            index = col * (rows + 1) + row
                            x, y, z = previous[index]
                            left, right = previous[index - rows - 1], previous[index + rows + 1]
                            before, after = previous[index - 1], previous[index + 1]
                            fraction = (z - before[2]) / (after[2] - before[2])
                            y = min(y, (left[1] + right[1]) / 2, before[1] + (after[1] - before[1]) * fraction)
                            shape[index] = (x, y, z)
            for col in range(columns):
                for row in range(rows):
                    a = col * (rows + 1) + row
                    face = (a, a + rows + 1, a + rows + 2, a + 1)
                    faces.append(tuple(reversed(face)) if upper else face)
                    materials.append(0)
            if upper:
                start = len(opened)
                for col in range(columns + 1):
                    index = col * (rows + 1) + rows
                    taper = math.sin(col / columns * math.pi)
                    for edge in (0, 1):
                        o, h, c = Vector(opened[index]), Vector(halfway[index]), Vector(closed[index])
                        h.y -= 0.001
                        c.y -= 0.001
                        h.z += edge * 0.0015 * taper
                        c.z += edge * 0.0025 * taper
                        opened.append(tuple(o))
                        halfway.append(tuple(h))
                        closed.append(tuple(c))
                        uvs.append(uvs[index])
                        opacity.append(1)
                for col in range(columns):
                    a = start + col * 2
                    faces.append((a, a + 2, a + 3, a + 1))
                    materials.append(1)
            data = bpy.data.meshes.new(name)
            data.from_pydata(opened, [], faces)
            data.materials.append(skin)
            data.materials.append(lash)
            uv_layer = data.uv_layers.new(name='UVMap')
            colors = data.color_attributes.new(name='LidSkin', type='FLOAT_COLOR', domain='POINT')
            for color, uv, alpha in zip(colors.data, uvs, opacity):
                ix = min(atlas.size[0] - 1, int(uv[0] * atlas.size[0]))
                iy = min(atlas.size[1] - 1, int(uv[1] * atlas.size[1]))
                offset = (iy * atlas.size[0] + ix) * 4
                color.color_srgb = (*pixels[offset:offset + 3], alpha)
            for polygon, material_index in zip(data.polygons, materials):
                polygon.material_index = material_index
                polygon.use_smooth = True
                for loop in polygon.loop_indices:
                    uv_layer.data[loop].uv = uvs[data.loops[loop].vertex_index]
            data.update()
            lid = bpy.data.objects.new(name, data)
            bpy.context.collection.objects.link(lid)
            # This skin overlay must not cast a second eyelid outline onto the head.
            lid.visible_shadow = False
            lid.matrix_world = ob.matrix_world.copy()
            lid.shape_key_add(name='Basis')
            for shape_name, positions in (('BlinkHalf', halfway), ('Blink', closed)):
                key = lid.shape_key_add(name=shape_name)
                key.value = 0
                for vertex, position in zip(key.data, positions):
                    vertex.co = position
            group = lid.vertex_groups.new(name='head')
            group.add(list(range(len(opened))), 1, 'REPLACE')
            modifier = lid.modifiers.new('Follow head', 'ARMATURE')
            modifier.object = rig
            modifier.use_deform_preserve_volume = False
            lid.parent = rig
            result.append(lid)
    return result
