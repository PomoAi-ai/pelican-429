"""Ceramic 75% keyboard weapon, authored in its own local coordinates.

The caller animates KeyboardWeapon as one rigid prop.  X spans the keys, Z is
the keycap normal, and -Y is the firing edge (+Z after glTF axis conversion).
"""
import math

import bpy
from mathutils import Matrix


def _material(name, color, metallic=0, roughness=.36, emission=0):
    def linear(value):
        return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
    rgb = tuple(linear(int(color[i:i + 2], 16) / 255) for i in (1, 3, 5))
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = .18 if metallic < .5 else .08
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    material.diffuse_color = (*rgb, 1)
    return material


def _outline(width, depth, radius, segments):
    points = []
    for cx, cy, start in ((width / 2 - radius, depth / 2 - radius, 0),
                          (-width / 2 + radius, depth / 2 - radius, 90),
                          (-width / 2 + radius, -depth / 2 + radius, 180),
                          (width / 2 - radius, -depth / 2 + radius, 270)):
        for step in range(segments):
            angle = math.radians(start + step * 90 / (segments - 1))
            points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return points


def _profile_mesh(name, profiles, segments, material, parent, capped=True):
    vertices = [(x, y, z) for width, depth, radius, z in profiles
                for x, y in _outline(width, depth, radius, segments)]
    count = segments * 4
    faces = []
    for ring in range(len(profiles) - 1):
        for i in range(count):
            j = (i + 1) % count
            faces.append((ring * count + i, ring * count + j, (ring + 1) * count + j, (ring + 1) * count + i))
    if capped:
        faces.extend((tuple(range(count - 1, -1, -1)), tuple(range((len(profiles) - 1) * count, len(profiles) * count))))
    else:
        for i in range(count):
            j = (i + 1) % count
            faces.append(((len(profiles) - 1) * count + i, (len(profiles) - 1) * count + j, j, i))
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(material)
    for polygon in data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return obj


def _rounded_box(name, size, location, material, parent, bevel, segments):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.parent = parent
    obj.data.materials.append(material)
    modifier = obj.modifiers.new('Machined edge radii', 'BEVEL')
    modifier.width, modifier.segments = bevel, segments
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4 and face.area < .001
    return obj


def _legend(text, position, material, root, resolution):
    font = bpy.data.curves.new('Laser etched key legend', 'FONT')
    font.body, font.size = text, .012 if len(text) <= 2 else .009
    font.align_x, font.align_y = 'CENTER', 'CENTER'
    font.resolution_u = resolution
    obj = bpy.data.objects.new('Key legend ' + text, font)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    obj.location = position
    font.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def _merge_material_groups(objects, root):
    """A compact keyboard does not need a separate draw call for every keycap."""
    groups = {}
    for obj in objects:
        groups.setdefault(obj.data.materials[0], []).append(obj)
    merged = []
    for material, group in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in group:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        if len(group) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = 'Keyboard ' + material.name
        # Bake the surviving key's offset into vertices so all prop children
        # share the identity origin used by the authored weapon action.
        obj.data.transform(obj.matrix_local)
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Identity(4)
        obj.parent = root
        merged.append(obj)
    return merged


def build_keyboard(tier):
    """Return KeyboardWeapon, rigid child meshes, and fx_keyboard for export."""
    segments = {'detailed': 9, 'game': 5, 'light': 3}[tier]
    bevel_segments = {'detailed': 4, 'game': 3, 'light': 2}[tier]
    root = bpy.data.objects.new('KeyboardWeapon', None)
    bpy.context.collection.objects.link(root)
    root.empty_display_size = .08
    ceramic = _material('Keyboard ceramic pearl', '#e6e9e6', .28, .29)
    graphite = _material('Keyboard graphite chassis', '#27343f', .55, .34)
    dark_keys = _material('Keyboard graphite keycaps', '#3c4d5d', .05, .42)
    light_keys = _material('Keyboard porcelain keycaps', '#d9e2e6', .08, .33)
    pale_legend = _material('Keyboard pale legends', '#c6d5df', 0, .48)
    dark_legend = _material('Keyboard dark legends', '#344651', 0, .48)
    luminous = _material('Keyboard cyan optical channels', '#43d9ff', .18, .22, 2.5)
    steel = _material('Keyboard steel fasteners', '#91a5af', .85, .25)
    parts = [_profile_mesh('Keyboard graphite bottom', [
        (1.012, .342, .028, -.0375), (1.040, .368, .040, -.029),
        (1.040, .368, .040, -.007), (1.018, .346, .029, .008),
    ], segments, graphite, root)]
    parts.append(_profile_mesh('Keyboard continuous ceramic frame', [
        (1.036, .366, .037, -.023), (1.050, .380, .044, -.016),
        (1.050, .380, .044, .012), (1.038, .368, .038, .021),
        (.970, .310, .019, .021), (.958, .298, .015, .012),
        (.958, .298, .015, -.016), (.970, .310, .019, -.023),
    ], segments, ceramic, root, capped=False))
    parts.append(_rounded_box('Keyboard recessed deck', (.965, .305, .019), (0, 0, .001), graphite, root, .012, bevel_segments))

    # ANSI-style compact 75% layout: function row, staggered typing rows,
    # dedicated right navigation column, spacebar and inverted-T arrows.
    rows = [
        [('Esc', 1), ('', 1)] + [(f'F{i}', 1) for i in range(1, 5)] + [('', .25)]
        + [(f'F{i}', 1) for i in range(5, 9)] + [('', .25)]
        + [(f'F{i}', 1) for i in range(9, 13)] + [('', .5), ('Del', 1)],
        [(text, 1) for text in ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']] + [('Back', 2), ('Home', 1)],
        [('Tab', 1.5)] + [(text, 1) for text in 'QWERTYUIOP[]'] + [('\\', 1.5), ('PgUp', 1)],
        [('Caps', 1.75)] + [(text, 1) for text in "ASDFGHJKL;'" ] + [('Enter', 2.25), ('PgDn', 1)],
        [('Shift', 2.25)] + [(text, 1) for text in 'ZXCVBNM,./'] + [('Shift', 1.75), ('^', 1), ('End', 1)],
        [('Ctrl', 1.25), ('Win', 1.25), ('Alt', 1.25), ('Space', 6.25), ('Alt', 1), ('Fn', 1), ('Ctrl', 1), ('<', 1), ('v', 1), ('>', 1)],
    ]
    for row, keys in enumerate(rows):
        unit, x = .058, -.464
        y = .118 - row * .047
        for label, units in keys:
            width = unit * units - .005
            center = x + unit * units / 2
            x += units * unit
            if not label:
                continue
            pale = label in ('Esc', 'Tab', 'Caps', 'Shift', 'Ctrl', 'Win', 'Alt', 'Fn', 'Enter', 'Back', 'Home', 'End', 'PgUp', 'PgDn', 'Del', '<', 'v', '>', '^', 'Space')
            depth = .039 if row == 0 else .042
            obj = _profile_mesh('Keycap ' + label, [
                (width, depth, .005, .012),
                (width, depth, .005, .019),
                (width - .005, depth - .005, .006, .034),
                (width - .010, depth - .010, .005, .0375),
                (width - .017, depth - .017, .004, .0356),
            ], segments if tier == 'detailed' else 3, light_keys if pale else dark_keys, root)
            obj.location = (center, y, 0)
            parts.append(obj)
            if label != 'Space' and (tier != 'light' or label in ('Esc', 'Enter', '<', 'v', '>', '^')):
                parts.append(_legend(label, (center, y, .036), dark_legend if pale else pale_legend, root, 4 if tier == 'detailed' else 2))

    for x in (-.315, .315):
        parts.append(_rounded_box('Inset front optical slot', (.275, .010, .010), (x, -.187, -.004), graphite, root, .003, bevel_segments))
        parts.append(_rounded_box('Cyan front light guide', (.237, .006, .003), (x, -.191, -.004), luminous, root, .0014, bevel_segments))
    for x in (-.503, .503):
        parts.append(_rounded_box('Ceramic edge light guide', (.004, .120, .004), (x, 0, .022), luminous, root, .0015, bevel_segments))
    parts.append(_rounded_box('Magnetic docking contact', (.25, .13, .0015), (0, .015, -.0365), steel, root, .015, bevel_segments))
    if tier != 'light':
        for x in (-.496, .496):
            for y in (-.151, .151):
                bpy.ops.mesh.primitive_cylinder_add(vertices=16 if tier == 'detailed' else 10, radius=.005, depth=.0015, location=(x, y, .022))
                screw = bpy.context.object
                screw.name, screw.parent = 'Keyboard recessed fastener', root
                screw.data.materials.append(steel)
                parts.append(screw)
                parts.append(_rounded_box('Fastener slot', (.005, .0012, .0004), (x, y, .0229), graphite, root, .0004, 1))
        for x in (-.4, -.35, -.3, .3, .35, .4):
            parts.append(_rounded_box('Graphite rear cooling slit', (.029, .004, .009), (x, .187, -.004), graphite, root, .002, bevel_segments))
    meshes = _merge_material_groups(parts, root)
    socket = bpy.data.objects.new('fx_keyboard', None)
    bpy.context.collection.objects.link(socket)
    socket.parent = root
    socket.location = (0, -.205, .025)
    socket.empty_display_size = .045
    return [root, *meshes, socket]
