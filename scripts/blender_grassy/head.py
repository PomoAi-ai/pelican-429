"""Grassy's sculpted face, inset eyes and layered swept hair."""

import math

import bpy
from mathutils import Vector


PROFILE = [
    (2.500, 0.005, 0.055, 0.075),
    (2.525, 0.100, 0.130, 0.150),
    (2.570, 0.204, 0.200, 0.209),
    (2.635, 0.277, 0.244, 0.253),
    (2.710, 0.327, 0.272, 0.290),
    (2.805, 0.367, 0.285, 0.318),
    (2.920, 0.380, 0.292, 0.332),
    (3.035, 0.375, 0.297, 0.339),
    (3.155, 0.357, 0.291, 0.327),
    (3.265, 0.299, 0.253, 0.280),
    (3.350, 0.206, 0.180, 0.205),
    (3.398, 0.084, 0.079, 0.090),
    (3.410, 0.003, 0.003, 0.004),
]


def _profile(z):
    for index, (a, b) in enumerate(zip(PROFILE, PROFILE[1:])):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            previous = PROFILE[max(0, index - 1)]
            following = PROFILE[min(len(PROFILE) - 1, index + 2)]
            values = []
            for i in range(1, 4):
                slope_a = (b[i] - previous[i]) / (b[0] - previous[0])
                slope_b = (following[i] - a[i]) / (following[0] - a[0])
                values.append((2 * t ** 3 - 3 * t * t + 1) * a[i] + (t ** 3 - 2 * t * t + t) * (b[0] - a[0]) * slope_a + (-2 * t ** 3 + 3 * t * t) * b[i] + (t ** 3 - t * t) * (b[0] - a[0]) * slope_b)
            return tuple(values)
    return PROFILE[0][1:] if z < PROFILE[0][0] else PROFILE[-1][1:]


def _gaussian(x, z, cx, cz, sx, sz):
    return math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2))


def _facial_relief(x, z):
    nose = 0.072 * _gaussian(x, z, 0, 2.841, 0.047, 0.041)
    bridge = 0.022 * _gaussian(x, z, 0, 2.900, 0.037, 0.095)
    cheeks = sum(0.015 * _gaussian(x, z, s * 0.206, 2.815, 0.100, 0.080) for s in (-1, 1))
    muzzle = 0.024 * _gaussian(x, z, 0, 2.736, 0.110, 0.069)
    return nose + bridge + cheeks + muzzle


def _surface(x, z):
    width, front, _ = _profile(z)
    ratio = min(abs(x) / width, 0.9999)
    return -front * math.sqrt(1 - ratio * ratio) - _facial_relief(x, z)


def _mesh(name, vertices, faces, material, attach, subdiv=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    for face in mesh.polygons:
        face.use_smooth = True
    if subdiv:
        modifier = obj.modifiers.new('Sculpt surface smoothing', 'SUBSURF')
        modifier.levels = subdiv
        modifier.render_levels = subdiv
    attach(obj, 'head')
    return obj


def _tube(name, points, radius, material, attach, radii=None):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 12
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for i, (point, location) in enumerate(zip(spline.bezier_points, points)):
        point.co = location
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
        if radii:
            point.radius = radii[i]
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    attach(obj, 'head')
    return obj


def _material(name, color, roughness=0.5):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    principled = material.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = (*color, 1)
    principled.inputs['Roughness'].default_value = roughness
    return material


def _skin(materials):
    material = materials['skin'].copy()
    material.name = 'Warm skin with painted cheek tint'
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (1, 1, 1, 1)
    shader.inputs['Roughness'].default_value = 0.58
    shader.inputs['Subsurface Weight'].default_value = 0.055
    color = material.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'FaceTint'
    material.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
    return material


def _face(materials, attach):
    vertices, faces = [], []
    rows, segments = 80, 112
    for row in range(rows + 1):
        z = 2.501 + (3.409 - 2.501) * row / rows
        width, front, back = _profile(z)
        for i in range(segments):
            theta = math.tau * i / segments
            x = width * math.sin(theta)
            depth = front if math.cos(theta) >= 0 else back
            y = -depth * math.cos(theta)
            y -= _facial_relief(x, z) * max(0, math.cos(theta)) ** 10
            vertices.append((x, y, z))
    for row in range(rows):
        for i in range(segments):
            a = row * segments + i
            b = row * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces += [tuple(reversed(range(segments))), tuple(rows * segments + i for i in range(segments))]
    obj = _mesh('Face • continuous cheeks nose chin', vertices, faces, _skin(materials), attach, 1)
    color = obj.data.color_attributes.new(name='FaceTint', type='FLOAT_COLOR', domain='POINT')
    base = materials['skin'].diffuse_color[:3]
    for point, (x, y, z) in zip(color.data, vertices):
        blush = sum(_gaussian(x, z, sign * 0.22, 2.804, 0.091, 0.060) for sign in (-1, 1))
        blush += 0.5 * _gaussian(x, z, 0, 2.837, 0.037, 0.032)
        tint = min(0.35, blush * 0.26) if y < -0.10 else 0
        point.color = tuple(c * (1 - tint) + r * tint for c, r in zip(base, (0.84, 0.255, 0.175))) + (1,)
    return obj


def _eye_arc(cosine, upper):
    return (0.091 if upper else -0.087) * max(0, 1 - abs(cosine) ** 1.65) ** 0.61


def _eye_material(materials):
    material = _material('Continuous eye with chestnut iris', (1, 1, 1), 0.28)
    size = 256
    image = bpy.data.images.new('Grassy painted chestnut eye', width=size, height=size)
    image.colorspace_settings.name = 'Non-Color'
    pixels = []
    white = materials['eye_white'].diffuse_color[:3]
    for row in range(size):
        z = -0.087 + 0.178 * (row + 0.5) / size
        for col in range(size):
            x = 0.182 * ((col + 0.5) / size - 0.5)
            r = math.hypot(x / 0.060, (z + 0.002) / 0.070)
            angle = math.atan2(z + 0.002, x)
            fibers = 0.90 + 0.07 * math.sin(angle * 47 + r * 15) + 0.04 * math.sin(angle * 91 - r * 9)
            limbal = 0.40 + 0.60 * (1 - min(1, r) ** 9)
            iris_color = (0.19 * fibers * limbal, 0.072 * fibers * limbal, 0.027 * fibers * limbal)
            edge = max(0, min(1, (1.005 - r) / 0.012))
            color = tuple(white[i] * (1 - edge) + iris_color[i] * edge for i in range(3))
            pupil_radius = math.hypot(x / 0.034, (z + 0.002) / 0.044)
            pupil = max(0, min(1, (1.005 - pupil_radius) / 0.015))
            color = tuple(color[i] * (1 - pupil) + (0.006, 0.003, 0.002)[i] * pupil for i in range(3))
            for hx, hz, radius in [(-0.016, 0.029, 0.0105), (0.019, -0.024, 0.004)]:
                highlight = max(0, min(1, (radius - math.hypot(x - hx, z - hz)) / 0.0012))
                color = tuple(component * (1 - highlight) + 0.98 * highlight for component in color)
            pixels.extend((*color, 1))
    image.pixels = pixels
    image.pack()
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    material.node_tree.links.new(texture.outputs['Color'], material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    return material


def _eye_surface(name, cx, cz, material, attach):
    def position(x, z):
        radius = ((x - cx) / 0.094) ** 2 + ((z - cz) / 0.094) ** 2
        return (x, _surface(x, z) - 0.0015 - 0.014 * max(0, 1 - radius), z)
    vertices = [position(cx, cz)]
    faces = []
    rings, count = 18, 96
    for ring in range(1, rings + 1):
        r = ring / rings
        for i in range(count):
            theta = math.tau * i / count
            x = cx + 0.091 * r * math.cos(theta)
            z = cz + r * _eye_arc(math.cos(theta), math.sin(theta) >= 0)
            vertices.append(position(x, z))
    for i in range(count):
        faces.append((0, 1 + i, 1 + (i + 1) % count))
    for ring in range(rings - 1):
        for i in range(count):
            a, b = 1 + ring * count + i, 1 + ring * count + (i + 1) % count
            faces.append((a, a + count, b + count, b))
    obj = _mesh(name, vertices, faces, material, attach)
    uv = obj.data.uv_layers.new(name='EyeUV')
    for loop in obj.data.loops:
        x, _, z = vertices[loop.vertex_index]
        uv.data[loop.index].uv = ((x - cx) / 0.182 + 0.5, (z - cz + 0.087) / 0.178)
    return obj


def _eyes(materials, attach):
    objects = []
    dark_lid = _material('Soft brown upper lash', (0.065, 0.026, 0.020))
    eye_material = _eye_material(materials)
    for sign in (-1, 1):
        cx, cz = sign * 0.155, 2.942
        objects.append(_eye_surface(f'Continuous almond eye {sign}', cx, cz, eye_material, attach))
        for upper in (False, True):
            points = []
            for step in range(17):
                angle = math.pi * step / 16 + (0 if upper else math.pi)
                x = cx + 0.093 * math.cos(angle)
                z = cz + _eye_arc(math.cos(angle), upper)
                points.append((x, _surface(x, z) + 0.002, z))
            objects.append(_tube(f'Anatomical eyelid {sign} {upper}', points, 0.008 if upper else 0.004, materials['skin'], attach))
            if upper:
                lash = [(x, y - 0.006, z - 0.002) for x, y, z in points]
                objects.append(_tube(f'Fine upper lash {sign}', lash, 0.0035, dark_lid, attach, [0.2] + [1] * 15 + [0.2]))
        points = []
        for step in range(11):
            t = step / 10
            x = sign * (0.078 + t * 0.162)
            z = 3.078 + 0.026 * math.sin(t * math.pi * 0.88) - 0.003 * t
            points.append((x, _surface(x, z) - 0.007, z))
        objects.append(_tube(f'Swept eyebrow {sign}', points, 0.0125, materials['hair'], attach, [0.2, 0.75, 0.9, 1, 1, 0.9, 0.8, 0.65, 0.45, 0.25, 0.03]))
    return objects


def _ears(materials, attach):
    objects = []
    for sign in (-1, 1):
        vertices, faces = [], []
        rings, sides = 16, 48
        side_count = (rings + 1) * sides
        for back in (False, True):
            for ring in range(rings + 1):
                radius = ring / rings
                for i in range(sides):
                    angle = math.tau * i / sides
                    x = sign * (0.394 + 0.088 * radius * math.cos(angle))
                    z = 2.819 + 0.132 * radius * math.sin(angle)
                    rim = 0.034 * math.exp(-((radius - 0.78) / 0.19) ** 2)
                    y = -0.041 - rim if not back else -0.015 + 0.047 * (1 - radius * radius)
                    vertices.append((x, y, z))
            offset = side_count if back else 0
            for ring in range(rings):
                for i in range(sides):
                    a = offset + ring * sides + i
                    b = offset + ring * sides + (i + 1) % sides
                    quad = (a, a + sides, b + sides, b)
                    faces.append(tuple(reversed(quad)) if (sign < 0) != back else quad)
        for i in range(sides):
            a, b = rings * sides + i, rings * sides + (i + 1) % sides
            quad = (a, b, b + side_count, a + side_count)
            faces.append(tuple(reversed(quad)) if sign < 0 else quad)
        ear = _mesh(f'Ear sculpted helix {sign}', vertices, faces, _skin(materials), attach, 1)
        color = ear.data.color_attributes.new(name='FaceTint', type='FLOAT_COLOR', domain='POINT')
        base = materials['skin'].diffuse_color[:3]
        for index, point in enumerate(color.data):
            radius = (index // sides) / rings
            tint = 0.22 * max(0, 1 - radius) if index < side_count else 0
            point.color = tuple(c * (1 - tint) + r * tint for c, r in zip(base, (0.84, 0.255, 0.175))) + (1,)
        objects.append(ear)
        points = [(sign * x, y, z) for x, y, z in [(0.393, -0.066, 2.737), (0.423, -0.072, 2.767), (0.429, -0.070, 2.838), (0.411, -0.071, 2.888), (0.382, -0.069, 2.877)]]
        objects.append(_tube(f'Ear inner fold {sign}', points, 0.011, materials['skin_blush'], attach, [0.25, 0.8, 1, 0.7, 0.1]))
    return objects


def _mouth(materials, attach):
    points = []
    for step in range(21):
        x = -0.112 + 0.224 * step / 20
        z = 2.725 + 0.018 * (x / 0.112) ** 2 + 0.006 * x / 0.112
        points.append((x, _surface(x, z) - 0.0025, z))
    objects = [_tube('Small asymmetrical smile', points, 0.0036, materials['lip'], attach, [0.15] + [1] * 19 + [0.15])]
    for sign in (-1, 1):
        x, z = sign * 0.032, 2.818
        points = [(x + dx, _surface(x + dx, z + dz) - 0.001, z + dz) for dx, dz in [(-0.007, 0.000), (0, -0.0015), (0.006, 0.002)]]
        objects.append(_tube(f'Nostril crease {sign}', points, 0.0017, materials['skin_blush'], attach, [0.1, 1, 0.1]))
    return objects


def _bezier(points, t):
    a, b, c, d = [Vector(point) for point in points]
    return (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d


def _lock(name, control, width, thickness, material, attach, normal=None):
    vertices, faces = [], []
    rows, columns = 18, 12
    for row in range(rows + 1):
        t = row / rows
        center = _bezier(control, t)
        tangent = (_bezier(control, min(1, t + 0.001)) - _bezier(control, max(0, t - 0.001))).normalized()
        outward = Vector(normal) if normal else Vector((center.x / 0.43, center.y / 0.37, (center.z - 3.045) / 0.49)).normalized()
        across = tangent.cross(outward).normalized()
        outward = across.cross(tangent).normalized()
        shape = (0.20 + 0.98 * math.sin(math.pi * t * 0.84)) * (1 - t) ** 0.54
        for col in range(columns + 1):
            s = -1 + 2 * col / columns
            ridge = 0.00035 * math.cos((s + 0.19 * math.sin(t * 3)) * math.pi * 7) * (1 - s * s)
            bulge = thickness * math.sqrt(max(0, 1 - s * s)) * math.sin(math.pi * (0.13 + 0.86 * t)) ** 0.7 + ridge
            point = center + across * width * shape * s + outward * bulge
            vertices.append(tuple(point))
    for row in range(rows):
        for col in range(columns):
            a = row * (columns + 1) + col
            faces.append((a, a + 1, a + columns + 2, a + columns + 1))
    obj = _mesh(name, vertices, faces, material, attach, 1)
    uv = obj.data.uv_layers.new(name='StrandUV')
    for loop in obj.data.loops:
        row, col = divmod(loop.vertex_index, columns + 1)
        uv.data[loop.index].uv = (col / columns, row / rows)
    solid = obj.modifiers.new('Closed hair lock', 'SOLIDIFY')
    solid.thickness = 0.005
    return obj


def _fiber_material(base, name):
    material = base.copy()
    material.name = name
    size = 128
    image = bpy.data.images.new(name + ' texture', width=size, height=size)
    image.colorspace_settings.name = 'Non-Color'
    pixels = []
    for y in range(size):
        for x in range(size):
            offset = 0.5 * math.sin(y * 0.045)
            shade = 1 + 0.13 * math.sin((x + offset) * 0.74) + 0.08 * math.sin((x + offset) * 1.91) + 0.045 * math.sin(x * 2.98)
            pixels.extend([base.diffuse_color[i] * shade for i in range(3)] + [1])
    image.pixels = pixels
    image.pack()
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    material.node_tree.links.new(texture.outputs['Color'], material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    return material


def _scalp(theta, phi, offset=0):
    return ((0.413 + offset) * math.sin(phi) * math.sin(theta), -(0.340 + offset) * math.sin(phi) * math.cos(theta), 3.036 + (0.485 + offset) * math.cos(phi))


def _hair(materials, attach):
    vertices, faces = [], []
    for material in (materials['hair'], materials['hair_light']):
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value = 0.58
        shader.inputs['Specular IOR Level'].default_value = 0.28
    rings, sides = 32, 96
    for ring in range(rings + 1):
        for i in range(sides):
            theta = math.tau * i / sides
            angle = abs((theta + math.pi) % math.tau - math.pi)
            t = max(0, min(1, (angle - 0.85) / 0.73))
            max_phi = 1.15 + 0.97 * t * t * (3 - 2 * t)
            vertices.append(_scalp(theta, 0.004 + max_phi * ring / rings))
    for ring in range(rings):
        for i in range(sides):
            a, b = ring * sides + i, ring * sides + (i + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    objects = [_mesh('Hair • fitted underlayers', vertices, faces, materials['hair'], attach, 1)]
    fibers = _fiber_material(materials['hair'], 'Fine dark swept hair fibers')
    light_fibers = _fiber_material(materials['hair_light'], 'Fine warm swept hair fibers')
    for row, phi in enumerate([0.42, 0.77, 1.11, 1.43, 1.72]):
        count = [11, 15, 19, 19, 16][row]
        for index in range(count):
            theta = math.tau * (index + 0.40 * (row % 2) + 0.13 * math.sin(index * 2.1 + row)) / count
            front = math.cos(theta)
            if front > 0.68 and row >= 2:
                continue
            end_phi = phi + 0.50
            if front > 0.2:
                end_phi = min(end_phi, 1.67)
            if end_phi < phi + 0.30:
                continue
            sweep = -0.18 + 0.10 * math.sin(theta * 2)
            control = [_scalp(theta, phi, -0.003), _scalp(theta + sweep * 0.3, phi + 0.17, 0.017), _scalp(theta + sweep, end_phi - 0.08, 0.025), _scalp(theta + sweep * 1.4, end_phi, 0.019)]
            material = light_fibers if (index + row * 2) % 7 == 0 else fibers
            width = (0.069 if row < 2 else 0.062) * (0.94 + 0.12 * math.sin(index * 1.7 + row))
            objects.append(_lock(f'Layered swept lock {row} {index}', control, width, 0.013, material, attach))
    bangs = [
        ([(0.086, -0.150, 3.444), (-0.100, -0.325, 3.450), (-0.240, -0.375, 3.274), (-0.345, -0.269, 3.116)], 0.076),
        ([(0.107, -0.170, 3.424), (-0.051, -0.348, 3.396), (-0.182, -0.369, 3.227), (-0.212, -0.297, 3.058)], 0.073),
        ([(0.119, -0.188, 3.407), (0.031, -0.358, 3.377), (-0.061, -0.366, 3.199), (-0.113, -0.319, 3.090)], 0.071),
        ([(0.134, -0.182, 3.409), (0.126, -0.339, 3.351), (0.049, -0.348, 3.196), (0.014, -0.299, 3.129)], 0.060),
        ([(0.148, -0.174, 3.407), (0.230, -0.311, 3.334), (0.274, -0.282, 3.211), (0.314, -0.206, 3.078)], 0.071),
        ([(0.162, -0.135, 3.412), (0.327, -0.211, 3.381), (0.346, -0.172, 3.179), (0.391, -0.064, 3.038)], 0.063),
        ([(-0.139, -0.124, 3.462), (-0.282, -0.229, 3.420), (-0.358, -0.204, 3.294), (-0.437, -0.105, 3.251)], 0.064),
        ([(0.126, -0.034, 3.474), (-0.011, -0.117, 3.541), (-0.208, -0.133, 3.468), (-0.320, -0.073, 3.493)], 0.073),
        ([(0.124, 0.044, 3.467), (0.128, -0.039, 3.530), (0.019, -0.059, 3.557), (-0.058, -0.025, 3.568)], 0.054),
        ([(0.074, 0.080, 3.468), (0.198, 0.007, 3.503), (0.283, 0.031, 3.484), (0.343, 0.074, 3.464)], 0.062),
    ]
    for index, (control, width) in enumerate(bangs):
        objects.append(_lock(f'Sculpted asymmetric fringe {index}', control, width, 0.017, fibers, attach, (0, -1, 0.35)))
    return objects


def build_head(materials, attach):
    """Build the neutral human head facing -Y, bound through attach(object, 'head')."""
    objects = [_face(materials, attach)]
    objects.extend(_eyes(materials, attach))
    objects.extend(_ears(materials, attach))
    objects.extend(_mouth(materials, attach))
    objects.extend(_hair(materials, attach))
    return objects
