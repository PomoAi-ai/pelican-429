"""Round sculpted head with volumetric eyes, cheeks, ears and closed hair locks."""

import math

import bpy
from mathutils import Vector

from static_hair import build_hair


PROFILE = [
    (2.078, 0.009, 0.015, 0.015, -0.266),
    (2.092, 0.106, 0.081, 0.090, -0.235),
    (2.124, 0.206, 0.220, 0.181, -0.119),
    (2.175, 0.287, 0.294, 0.286, -0.065),
    (2.235, 0.342, 0.345, 0.351, -0.010),
    (2.305, 0.373, 0.355, 0.379, 0.008),
    (2.390, 0.376, 0.350, 0.397, 0.013),
    (2.490, 0.365, 0.348, 0.403, 0.013),
    (2.590, 0.359, 0.335, 0.391, 0.013),
    (2.695, 0.337, 0.295, 0.354, 0.013),
    (2.795, 0.277, 0.241, 0.284, 0.013),
    (2.874, 0.172, 0.151, 0.174, 0.013),
    (2.916, 0.064, 0.057, 0.069, 0.013),
    (2.925, 0.003, 0.003, 0.003, 0.013),
]


def _gauss(x, z, cx, cz, sx, sz):
    return math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2))


def _profile(z):
    for index, (a, b) in enumerate(zip(PROFILE, PROFILE[1:])):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            previous, following = PROFILE[max(0, index - 1)], PROFILE[min(len(PROFILE) - 1, index + 2)]
            values = []
            for dimension in range(1, 5):
                slope_a = (b[dimension] - previous[dimension]) / (b[0] - previous[0])
                slope_b = (following[dimension] - a[dimension]) / (following[0] - a[0])
                values.append((2 * t ** 3 - 3 * t * t + 1) * a[dimension] + (t ** 3 - 2 * t * t + t) * (b[0] - a[0]) * slope_a + (-2 * t ** 3 + 3 * t * t) * b[dimension] + (t ** 3 - t * t) * (b[0] - a[0]) * slope_b)
            return tuple(values)
    return PROFILE[0][1:] if z < PROFILE[0][0] else PROFILE[-1][1:]


def _relief(x, z):
    nose = 0.060 * _gauss(x, z, 0, 2.270, 0.056, 0.043)
    nose += 0.016 * _gauss(x, z, 0, 2.331, 0.043, 0.079)
    nose += sum(0.016 * _gauss(x, z, sign * 0.037, 2.260, 0.029, 0.022) for sign in (-1, 1))
    cheeks = sum(0.039 * _gauss(x, z, sign * 0.225, 2.283, 0.118, 0.079) for sign in (-1, 1))
    muzzle = 0.014 * _gauss(x, z, 0, 2.213, 0.142, 0.060)
    sockets = sum(0.006 * _gauss(x, z, sign * 0.159, 2.391, 0.088, 0.078) for sign in (-1, 1))
    return nose + cheeks + muzzle - sockets


def _surface(x, z):
    width, front, _, center = _profile(z)
    cosine = math.sqrt(max(0.00001, 1 - min(0.99999, abs(x) / width) ** 2))
    return center - front * cosine - _relief(x, z) * cosine ** 5


def _mesh(name, vertices, faces, material, part, detail=0, subdiv=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj['grassy_part'], obj['grassy_detail'] = part, detail
    if subdiv:
        modifier = obj.modifiers.new('Soft sculpt surface', 'SUBSURF')
        modifier.levels = modifier.render_levels = subdiv
    return obj


def _ellipsoid(name, center, scale, material, part, segments=64, rings=40, detail=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=center)
    obj = bpy.context.object
    obj.name = name
    for vertex in obj.data.vertices:
        vertex.co.x *= scale[0]
        vertex.co.y *= scale[1]
        vertex.co.z *= scale[2]
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj['grassy_part'], obj['grassy_detail'] = part, detail
    return obj


def _tube(name, points, radius, material, part, radii=None, detail=0):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 10
    curve.bevel_depth, curve.bevel_resolution = radius, 3
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for index, (point, location) in enumerate(zip(spline.bezier_points, points)):
        point.co = location
        point.handle_left_type = point.handle_right_type = 'AUTO'
        if radii:
            point.radius = radii[index]
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(material)
    obj['grassy_part'], obj['grassy_detail'] = part, detail
    return obj


def _tinted_skin(materials):
    mat = materials['skin'].copy()
    mat.name = 'Grassy continuous skin and sculpted blush'
    shader = mat.node_tree.nodes.get('Principled BSDF')
    vertex = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'FaceTint'
    mat.node_tree.links.new(vertex.outputs['Color'], shader.inputs['Base Color'])
    return mat


def _face(materials):
    rows, sides = 128, 192
    vertices, faces = [], []
    for row in range(rows + 1):
        z = 2.079 + (2.924 - 2.079) * row / rows
        width, front, back, center = _profile(z)
        for side in range(sides):
            theta = math.tau * side / sides
            cosine = math.cos(theta)
            x = width * math.sin(theta)
            y = center - (front if cosine >= 0 else back) * cosine
            if cosine > 0:
                y -= _relief(x, z) * cosine ** 5
            vertices.append((x, y, z))
    for row in range(rows):
        for side in range(sides):
            a, b = row * sides + side, row * sides + (side + 1) % sides
            face = (a, b, b + sides, a + sides)
            x, y, z = [sum(vertices[index][axis] for index in face) / 4 for axis in range(3)]
            in_socket = y < 0 and any(((x - sign * 0.157) / 0.092) ** 2 + ((z - 2.386) / 0.098) ** 2 < 1.01 for sign in (-1, 1))
            if not in_socket:
                faces.append(face)
    faces.extend([tuple(reversed(range(sides))), tuple(rows * sides + side for side in range(sides))])
    obj = _mesh('Face continuous cheek nose muzzle chin', vertices, faces, _tinted_skin(materials), 'face', subdiv=1)
    colors = obj.data.color_attributes.new(name='FaceTint', type='FLOAT_COLOR', domain='POINT')
    skin, blush = materials['skin'].diffuse_color[:3], materials['skin_blush'].diffuse_color[:3]
    for point, (x, y, z) in zip(colors.data, vertices):
        strength = sum(_gauss(x, z, sign * 0.255, 2.291, 0.087, 0.061) for sign in (-1, 1))
        strength += 0.36 * _gauss(x, z, 0, 2.270, 0.055, 0.034)
        strength = min(0.62, strength * 0.56) if y < -0.16 else 0
        point.color = tuple(a * (1 - strength) + b * strength for a, b in zip(skin, blush)) + (1,)
    return obj


def _eye_position(sign, dx, dz, offset=0):
    angle = sign * 0.38
    dy = -0.090 * math.sqrt(max(0.002, 1 - (dx / 0.108) ** 2 - (dz / 0.112) ** 2)) - offset
    return (sign * 0.126 + dx * math.cos(angle) - dy * math.sin(angle),
            -0.239 + dx * math.sin(angle) + dy * math.cos(angle), 2.386 + dz)


def _eye_patch(name, sign, rx, rz, offset, material):
    vertices, faces = [_eye_position(sign, 0, 0, offset)], []
    rings, sides = 12, 80
    for ring in range(1, rings + 1):
        radius = ring / rings
        for side in range(sides):
            theta = math.tau * side / sides
            vertices.append(_eye_position(sign, rx * radius * math.cos(theta), rz * radius * math.sin(theta), offset))
    for side in range(sides):
        faces.append((0, 1 + side, 1 + (side + 1) % sides))
    for ring in range(rings - 1):
        for side in range(sides):
            a, b = 1 + ring * sides + side, 1 + ring * sides + (side + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    bottom = len(vertices)
    vertices.append((sign * 0.126, -0.239, 2.386))
    for side in range(sides):
        a = 1 + (rings - 1) * sides + side
        b = 1 + (rings - 1) * sides + (side + 1) % sides
        faces.append((bottom, a, b))
    return _mesh(name, vertices, faces, material, 'eyes')


def _eyes(materials):
    objects = []
    for sign in (-1, 1):
        eye = _ellipsoid(f'Eye inset full globe {sign}', (sign * 0.126, -0.239, 2.386), (0.108, 0.090, 0.112), materials['eye_white'], 'eyes')
        eye.rotation_euler.z = sign * 0.38
        objects.append(eye)
        objects.append(_eye_patch(f'Iris conforming chestnut globe {sign}', sign, 0.077, 0.089, 0.0016, materials['iris']))
        objects.append(_eye_patch(f'Pupil conforming to globe {sign}', sign, 0.044, 0.058, 0.0024, materials['pupil']))
        for index, (dx, dz, sx, sz) in enumerate([(-0.023, 0.041, 0.013, 0.016), (0.025, -0.023, 0.005, 0.007)]):
            point = _eye_position(sign, dx, dz, 0.0045)
            obj = _ellipsoid(f'Eye small catchlight {sign} {index}', point, (sx, 0.0024, sz), materials['highlight'], 'eyes', 32, 20, 1)
            obj.rotation_euler.z = sign * 0.38
            objects.append(obj)
        for upper in (True, False):
            points, lash = [], []
            for step in range(25):
                angle = math.pi * step / 24 + (0 if upper else math.pi)
                dx = 0.096 * math.cos(angle)
                dz = (0.101 if upper else 0.097) * math.sin(angle)
                x, z = sign * 0.157 + dx, 2.386 + dz
                y = _surface(x, z) - 0.002
                points.append((x, y, z))
                lash.append((x, y - 0.004, z - 0.003))
            objects.append(_tube(f'Integrated soft socket rim {sign} {upper}', points, 0.0075 if upper else 0.0035, materials['skin'], 'eyes', [0.2] + [1] * 23 + [0.2]))
            if upper:
                objects.append(_tube(f'Soft upper lash line {sign}', lash, 0.0045, materials['brow'], 'eyes', [0.1, 0.5] + [1] * 21 + [0.5, 0.1]))
        brow = []
        for step in range(17):
            t = step / 16
            x = sign * (0.068 + 0.190 * t)
            z = 2.500 + 0.028 * math.sin(t * math.pi * 0.95) - 0.009 * t
            brow.append((x, _surface(x, z) - 0.006, z))
        objects.append(_tube(f'Full sculpted eyebrow {sign}', brow, 0.017, materials['brow'], 'face', [0.35, 0.72, 0.9, 1, 1, 1, 1, 0.95, 0.9, 0.85, 0.76, 0.66, 0.56, 0.44, 0.30, 0.14, 0.02]))
    return objects


def _ears(materials):
    objects = []
    for sign in (-1, 1):
        center = Vector((sign * 0.389, -0.019, 2.315))
        along = Vector((sign * 0.43, -0.903, 0))
        normal = Vector((sign * 0.903, 0.43, 0))
        def point(u, v, depth):
            return tuple(center + along * u + normal * depth + Vector((0, 0, v)))
        vertices, faces = [], []
        rows, sides = 24, 72
        for back in (False, True):
            for row in range(rows + 1):
                radius = row / rows
                for side in range(sides):
                    angle = math.tau * side / sides
                    u = 0.087 * radius * math.cos(angle)
                    v = 0.119 * radius * math.sin(angle)
                    rim = 0.034 * math.exp(-((radius - 0.79) / 0.19) ** 2)
                    depth = rim - 0.008 if not back else -0.010 - 0.023 * (1 - radius * radius)
                    vertices.append(point(u, v, depth))
        stride = (rows + 1) * sides
        for back in (False, True):
            offset = stride if back else 0
            for row in range(rows):
                for side in range(sides):
                    a, b = offset + row * sides + side, offset + row * sides + (side + 1) % sides
                    quad = (a, a + sides, b + sides, b)
                    faces.append(tuple(reversed(quad)) if (sign > 0) != back else quad)
        for side in range(sides):
            a, b = rows * sides + side, rows * sides + (side + 1) % sides
            quad = (a, a + stride, b + stride, b)
            faces.append(tuple(reversed(quad)) if sign > 0 else quad)
        obj = _mesh(f'Ear outward facing pinna and lobe {sign}', vertices, faces, _tinted_skin(materials), 'ears', subdiv=1)
        colors = obj.data.color_attributes.new(name='FaceTint', type='FLOAT_COLOR', domain='POINT')
        skin, blush = materials['skin'].diffuse_color[:3], materials['skin_blush'].diffuse_color[:3]
        for index, color in enumerate(colors.data):
            radius = (index // sides) / rows
            strength = 0.65 * max(0, 1 - radius) if index < stride else 0.12
            color.color = tuple(a * (1 - strength) + b * strength for a, b in zip(skin, blush)) + (1,)
        objects.append(obj)
        fold = [point(u, v, depth) for u, v, depth in [(-0.010, -0.073, 0.010), (0.028, -0.035, 0.012), (0.035, 0.038, 0.014), (0.010, 0.075, 0.010), (-0.016, 0.065, 0.010)]]
        objects.append(_tube(f'Ear raised antihelix {sign}', fold, 0.011, materials['skin_blush'], 'ears', [0.1, 0.72, 1, 0.8, 0.12]))
        tragus = _ellipsoid(f'Ear rounded tragus {sign}', point(-0.045, -0.012, 0.011), (0.025, 0.018, 0.033), materials['skin'], 'ears', 32, 24)
        objects.append(tragus)
    return objects


def _mouth(materials):
    objects, seam, lip = [], [], []
    for step in range(25):
        x = -0.096 + 0.192 * step / 24
        z = 2.198 + 0.015 * (x / 0.096) ** 2 + 0.002 * x / 0.096
        seam.append((x, _surface(x, z) - 0.003, z))
        lower_z = z - 0.007 * (1 - (x / 0.096) ** 2)
        lip.append((x, _surface(x, lower_z) - 0.003, lower_z))
    radius = [0.08, 0.35] + [1] * 21 + [0.35, 0.08]
    objects.append(_tube('Smile soft lower lip volume', lip, 0.0046, materials['lip'], 'face', radius))
    objects.append(_tube('Smile fine closed mouth seam', seam, 0.0025, materials['mouth_shadow'], 'face', radius))
    for sign in (-1, 1):
        points = []
        for dx, dz in [(-0.006, 0.001), (0, -0.001), (0.006, 0.0015)]:
            x, z = sign * 0.026 + dx, 2.252 + dz
            points.append((x, _surface(x, z) - 0.0017, z))
        objects.append(_tube(f'Nose subtle nostril crease {sign}', points, 0.002, materials['skin_blush'], 'face', [0.05, 1, 0.05], 1))
    return objects


def build_head(materials):
    """Build the static reference head facing -Y, with no rig or picture planes."""
    return [_face(materials), *_eyes(materials), *_ears(materials), *_mouth(materials), *build_hair(materials, _profile)]
