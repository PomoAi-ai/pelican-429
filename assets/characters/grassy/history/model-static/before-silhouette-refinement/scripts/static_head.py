"""Continuous rounded facial sculpture with shallow inset eyes and soft eyelids."""

import math

import bpy
from mathutils import Vector

from static_hair import build_hair


PROFILE = [
    (2.046, 0.004, 0.007, 0.007, -0.038),
    (2.055, 0.053, 0.089, 0.053, -0.039),
    (2.075, 0.124, 0.196, 0.130, -0.033),
    (2.110, 0.191, 0.266, 0.209, -0.029),
    (2.150, 0.247, 0.306, 0.278, -0.015),
    (2.200, 0.314, 0.344, 0.342, 0.000),
    (2.255, 0.363, 0.355, 0.380, 0.009),
    (2.305, 0.379, 0.360, 0.390, 0.009),
    (2.390, 0.378, 0.352, 0.399, 0.013),
    (2.490, 0.365, 0.348, 0.403, 0.013),
    (2.590, 0.359, 0.335, 0.391, 0.013),
    (2.695, 0.337, 0.295, 0.354, 0.013),
    (2.795, 0.277, 0.241, 0.284, 0.013),
    (2.874, 0.172, 0.151, 0.174, 0.013),
    (2.916, 0.064, 0.057, 0.069, 0.013),
    (2.925, 0.003, 0.003, 0.003, 0.013),
]

EYE_X = 0.166
EYE_Z = 2.398
EYE_WIDTH = 0.093
EYE_UPPER = 0.087
EYE_LOWER = 0.078


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
    cheeks = sum(0.044 * _gauss(x, z, sign * 0.222, 2.301, 0.115, 0.083) for sign in (-1, 1))
    muzzle = 0.019 * _gauss(x, z, 0, 2.230, 0.118, 0.042)
    chin = 0.016 * _gauss(x, z, 0, 2.157, 0.133, 0.039)
    bridge = 0.007 * _gauss(x, z, 0, 2.345, 0.034, 0.065)
    wings = sum(0.009 * _gauss(x, z, sign * 0.030, 2.278, 0.021, 0.020) for sign in (-1, 1))
    philtrum = 0.0022 * _gauss(x, z, 0, 2.241, 0.013, 0.015)
    sockets = sum(0.011 * _gauss(x, z, sign * EYE_X, EYE_Z, 0.102, 0.088) for sign in (-1, 1))
    smile_corners = sum(0.004 * _gauss(x, z, sign * 0.107, 2.240, 0.018, 0.015) for sign in (-1, 1))
    relief = cheeks + muzzle + chin + bridge + wings - sockets - philtrum - smile_corners

    # Fuse the front cap of a small ellipsoid into the face. A Gaussian peak
    # becomes a pointed wedge in profile; this gives the tip a rounded turn.
    radius = (x / 0.043) ** 2 + ((z - 2.290) / 0.032) ** 2
    if radius < 1:
        width, front, _, center = _profile(z)
        cosine = math.sqrt(1 - (x / width) ** 2)
        surface = center - front * cosine - relief * cosine ** 3
        nose = -0.352 - 0.052 * math.sqrt(1 - radius)
        blend = max(0, 0.010 - abs(surface - nose)) / 0.010
        fused = min(surface, nose) - 0.0025 * blend * blend
        relief += (surface - fused) / cosine ** 3
    return relief

def _surface(x, z):
    width, front, _, center = _profile(z)
    cosine = math.sqrt(max(0.00001, 1 - min(0.99999, abs(x) / width) ** 2))
    return center - front * cosine - _relief(x, z) * cosine ** 3


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


def _face_tint(obj, vertices, materials):
    colors = obj.data.color_attributes.new(name='FaceTint', type='FLOAT_COLOR', domain='POINT')
    skin, blush = materials['skin'].diffuse_color[:3], materials['skin_blush'].diffuse_color[:3]
    for point, (x, y, z) in zip(colors.data, vertices):
        strength = sum(_gauss(x, z, sign * 0.253, 2.306, 0.084, 0.048) for sign in (-1, 1))
        strength += 0.82 * _gauss(x, z, 0, 2.285, 0.048, 0.030)
        strength = min(0.59, strength * 0.56) if y < -0.16 else 0
        point.color = tuple(a * (1 - strength) + b * strength for a, b in zip(skin, blush)) + (1,)

def _face(materials):
    rows, sides = 176, 224
    vertices, faces = [], []
    for row in range(rows + 1):
        z = PROFILE[0][0] + 0.001 + (PROFILE[-1][0] - PROFILE[0][0] - 0.002) * row / rows
        width, front, back, center = _profile(z)
        for side in range(sides):
            theta = math.tau * side / sides
            cosine = math.cos(theta)
            x = width * math.sin(theta)
            y = center - (front if cosine >= 0 else back) * cosine
            if cosine > 0:
                y -= _relief(x, z) * cosine ** 3
            vertices.append((x, y, z))
    for row in range(rows):
        for side in range(sides):
            a, b = row * sides + side, row * sides + (side + 1) % sides
            face = (a, b, b + sides, a + sides)
            faces.append(face)
    faces.extend([tuple(reversed(range(sides))), tuple(rows * sides + side for side in range(sides))])
    obj = _mesh('Face continuous cheek nose muzzle chin', vertices, faces, _tinted_skin(materials), 'face', subdiv=0)
    _face_tint(obj, vertices, materials)
    return obj


def _eye_position(sign, dx, dz, offset=0):
    x = sign * EYE_X + dx
    z = EYE_Z + dz + sign * dx / EYE_WIDTH * 0.006
    radius = math.sqrt((dx / EYE_WIDTH) ** 2 + (dz / (EYE_UPPER if dz >= 0 else EYE_LOWER)) ** 2)
    # A rounded corneal cap gives the iris volume in profile while its edge
    # remains under the eyelid, rather than following the cheek like a decal.
    bulge = 0.031 * max(0, 1 - radius * radius) ** 1.25
    return (x, _surface(x, z) - 0.0009 - bulge - offset, z)


def _eye_patch(name, sign, rx, rz, offset, material, iris=False, sclera=False, center_z=0):
    vertices, faces = [_eye_position(sign, 0, center_z, offset)], []
    rings, sides = 22, 128
    tones = [(0.025, 0.012, 0.008, 1)]
    for ring in range(1, rings + 1):
        for side in range(sides):
            angle = math.tau * side / sides
            ray_x, ray_z = rx * math.cos(angle), rz * math.sin(angle)
            limit = 1
            if iris:
                # Intersect each iris ray with the eye opening so the upper lid
                # cuts across the iris, rather than exposing a complete white ring.
                height = EYE_UPPER if center_z + ray_z >= 0 else EYE_LOWER
                a = (ray_x / EYE_WIDTH) ** 2 + (ray_z / height) ** 2
                b = 2 * center_z * ray_z / height ** 2
                c = (center_z / height) ** 2 - 0.996 ** 2
                limit = min(1, (-b + math.sqrt(b * b - 4 * a * c)) / (2 * a))
            radius = ring / rings * limit
            dx, dz = ray_x * radius, ray_z * radius
            if sclera and dz < 0:
                dz *= EYE_LOWER / EYE_UPPER
            dz += center_z
            vertices.append(_eye_position(sign, dx, dz, offset))
            limbus = 1 - 0.88 * radius ** 16
            lower_light = 0.69 - 0.31 * math.sin(angle)
            warmth = (0.42 + 0.58 * math.sin(math.pi * radius / 2)) * limbus
            detail = 1 + 0.025 * math.sin(angle * 43 + radius * 7)
            tones.append((0.180 * warmth * lower_light * detail,
                          0.065 * warmth * lower_light * detail,
                          0.031 * warmth * lower_light * detail, 1))
    for side in range(sides):
        faces.append((0, 1 + side, 1 + (side + 1) % sides))
    for ring in range(rings - 1):
        for side in range(sides):
            a, b = 1 + ring * sides + side, 1 + ring * sides + (side + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    if iris:
        material = material.copy()
        material.name = 'Soft deep chestnut iris'
        shader = material.node_tree.nodes['Principled BSDF']
        shader.inputs['Roughness'].default_value = 0.19
        shader.inputs['Specular IOR Level'].default_value = 0.16
        tint = material.node_tree.nodes.new('ShaderNodeVertexColor')
        tint.layer_name = 'IrisTint'
        material.node_tree.links.new(tint.outputs['Color'], shader.inputs['Base Color'])
    obj = _mesh(name, vertices, faces, material, 'eyes')
    if iris:
        colors = obj.data.color_attributes.new(name='IrisTint', type='FLOAT_COLOR', domain='POINT')
        for color, value in zip(colors.data, tones):
            color.color = value
    return obj


def _eyelid(sign, materials):
    vertices, faces = [], []
    sides, rows = 128, 7
    for row in range(rows + 1):
        t = row / rows
        for side in range(sides):
            angle = math.tau * side / sides
            radius = 0.995 + t * (0.15 if math.sin(angle) >= 0 else 0.060)
            dx = EYE_WIDTH * radius * math.cos(angle)
            dz = (EYE_UPPER if math.sin(angle) >= 0 else EYE_LOWER) * radius * math.sin(angle)
            x = sign * EYE_X + dx
            z = EYE_Z + dz + sign * dx / EYE_WIDTH * 0.006
            lift = (0.0040 if dz >= 0 else 0.0004) * math.sin(math.pi * t) + 0.0013 * (1 - t)
            vertices.append((x, _surface(x, z) - lift + 0.00015 * t, z))
    for row in range(rows):
        for side in range(sides):
            a = row * sides + side
            b = row * sides + (side + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    obj = _mesh(f'Skin eyelid flowing into cheek {sign}', vertices, faces, _tinted_skin(materials), 'face')
    _face_tint(obj, vertices, materials)
    lashes = []
    for step in range(41):
        angle = math.pi * step / 40
        lashes.append(_eye_position(sign, EYE_WIDTH * math.cos(angle), EYE_UPPER * math.sin(angle), 0.0012))
    taper = [0.12 + 0.88 * math.sin(math.pi * step / 40) ** 0.40 for step in range(41)]
    lash = _tube(f'Upper eyelid fine dark margin {sign}', lashes, 0.0055, materials['brow'], 'eyes', taper)
    return [obj, lash]


def _brow(sign, materials):
    vertices, faces = [], []
    length, width = 64, 10
    for row in range(length + 1):
        t = row / length
        x = sign * (0.066 + 0.199 * t)
        z = 2.515 + 0.031 * math.sin(math.pi * t * 0.94) - 0.014 * t
        inner_round = (1 - math.exp(-(t / 0.055) ** 2)) ** 0.32
        thickness = 0.0175 * inner_round * (1 - t) ** 0.52 + 0.0002
        for side in range(width + 1):
            across = -1 + 2 * side / width
            zz = z + thickness * across
            vertices.append((x, _surface(x, zz) - 0.0008 - 0.0022 * (1 - across * across), zz))
    for row in range(length):
        for side in range(width):
            a = row * (width + 1) + side
            quad = (a, a + width + 1, a + width + 2, a + 1)
            faces.append(quad if sign > 0 else tuple(reversed(quad)))
    return _mesh(f'Tapered sculpted brow {sign}', vertices, faces, materials['brow'], 'face', subdiv=1)


def _eyes(materials):
    objects = []
    for sign in (-1, 1):
        objects.append(_eye_patch(f'Shallow inset sclera {sign}', sign, EYE_WIDTH, EYE_UPPER, 0, materials['eye_white'], sclera=True))
        objects.append(_eye_patch(f'Deep chestnut iris {sign}', sign, 0.066, 0.080, 0.0007, materials['iris'], iris=True, center_z=0.004))
        objects.append(_eye_patch(f'Rounded dark pupil {sign}', sign, 0.034, 0.038, 0.0014, materials['pupil'], center_z=0.004))
        for index, (dx, dz, sx, sz) in enumerate([(-0.021, 0.032, 0.011, 0.0115), (0.024, 0.020, 0.004, 0.0045)]):
            point = _eye_position(sign, dx, dz + 0.004, 0.0022)
            objects.append(_ellipsoid(f'Eye soft reflected light {sign} {index}', point, (sx, 0.0015, sz), materials['highlight'], 'eyes', 32, 20, 1))
        objects.extend(_eyelid(sign, materials))
        objects.append(_brow(sign, materials))
    return objects

def _ears(materials):
    objects = []
    for sign in (-1, 1):
        center = Vector((sign * 0.407, -0.100, 2.338))
        along = Vector((sign * 0.700, 0.714, 0))
        normal = Vector((sign * 0.714, -0.700, 0))
        def point(u, v, depth):
            return tuple(center + along * u + normal * depth + Vector((0, 0, v)))
        vertices, faces = [], []
        rows, sides = 24, 72
        for back in (False, True):
            for row in range(rows + 1):
                radius = row / rows
                for side in range(sides):
                    angle = math.tau * side / sides
                    u = 0.107 * radius * math.cos(angle)
                    v = 0.119 * radius * math.sin(angle)
                    rim = 0.027 * math.exp(-((radius - 0.80) / 0.21) ** 2)
                    depth = rim - 0.008 if not back else -0.010 - 0.023 * (1 - radius * radius)
                    vertices.append(point(u, v, depth))
        stride = (rows + 1) * sides
        for back in (False, True):
            offset = stride if back else 0
            for row in range(rows):
                for side in range(sides):
                    a, b = offset + row * sides + side, offset + row * sides + (side + 1) % sides
                    quad = (a, a + sides, b + sides, b)
                    faces.append(tuple(reversed(quad)) if (sign < 0) != back else quad)
        for side in range(sides):
            a, b = rows * sides + side, rows * sides + (side + 1) % sides
            quad = (a, a + stride, b + stride, b)
            faces.append(tuple(reversed(quad)) if sign < 0 else quad)
        obj = _mesh(f'Ear outward facing pinna and lobe {sign}', vertices, faces, _tinted_skin(materials), 'ears', subdiv=1)
        colors = obj.data.color_attributes.new(name='FaceTint', type='FLOAT_COLOR', domain='POINT')
        skin, blush = materials['skin'].diffuse_color[:3], materials['skin_blush'].diffuse_color[:3]
        for index, color in enumerate(colors.data):
            radius = (index // sides) / rows
            strength = 0.48 * max(0, 1 - radius) if index < stride else 0.12
            color.color = tuple(a * (1 - strength) + b * strength for a, b in zip(skin, blush)) + (1,)
        objects.append(obj)
        fold = [point(u, v, depth) for u, v, depth in [(-0.010, -0.073, 0.010), (0.028, -0.035, 0.012), (0.035, 0.038, 0.014), (0.010, 0.075, 0.010), (-0.016, 0.065, 0.010)]]
        objects.append(_tube(f'Ear raised antihelix {sign}', fold, 0.008, materials['skin_blush'], 'ears', [0.1, 0.72, 1, 0.8, 0.12]))
        tragus = _ellipsoid(f'Ear rounded tragus {sign}', point(-0.039, -0.012, 0.011), (0.018, 0.015, 0.027), materials['skin'], 'ears', 32, 24)
        objects.append(tragus)
    return objects


def _mouth(materials):
    objects, seam, lip = [], [], []
    crease_material = materials['mouth_shadow'].copy()
    crease_material.name = 'Warm red smile crease'
    crease_material.diffuse_color = (0.46, 0.040, 0.022, 1)
    crease_shader = crease_material.node_tree.nodes['Principled BSDF']
    crease_shader.inputs['Base Color'].default_value = crease_material.diffuse_color
    crease_shader.inputs['Roughness'].default_value = 0.65
    crease_shader.inputs['Specular IOR Level'].default_value = 0.12
    lip_material = materials['skin'].copy()
    lip_material.name = 'Warm soft lower lip'
    shader = lip_material.node_tree.nodes['Principled BSDF']
    lip_material.diffuse_color = tuple(0.78 * skin + 0.22 * lip for skin, lip in zip(materials['skin'].diffuse_color, materials['lip'].diffuse_color))
    shader.inputs['Base Color'].default_value = lip_material.diffuse_color
    shader.inputs['Roughness'].default_value = 0.49
    for step in range(25):
        x = -0.107 + 0.214 * step / 24
        z = 2.216 + 0.025 * (x / 0.107) ** 2 + 0.0012 * x / 0.107
        seam.append((x, _surface(x, z) - 0.0009, z))
        lower_z = z - 0.005 * (1 - (x / 0.107) ** 2)
        lip.append((x, _surface(x, lower_z) - 0.0002, lower_z))
    radius = [0.08, 0.35] + [1] * 21 + [0.35, 0.08]
    objects.append(_tube('Smile soft lower lip volume', lip, 0.0035, lip_material, 'face', radius))
    objects.append(_tube('Smile fine closed mouth seam', seam, 0.0033, crease_material, 'face', radius))
    for sign in (-1, 1):
        points = []
        for dx, dz in [(-0.006, 0.001), (0, -0.001), (0.006, 0.0015)]:
            x, z = sign * 0.021 + dx, 2.274 + dz
            points.append((x, _surface(x, z) - 0.0017, z))
        objects.append(_tube(f'Nose subtle nostril crease {sign}', points, 0.0018, crease_material, 'face', [0.05, 1, 0.05], 1))
    return objects


def build_head(materials):
    """Build the static reference head facing -Y, with no rig or picture planes."""
    return [_face(materials), *_eyes(materials), *_ears(materials), *_mouth(materials), *build_hair(materials, _profile)]
