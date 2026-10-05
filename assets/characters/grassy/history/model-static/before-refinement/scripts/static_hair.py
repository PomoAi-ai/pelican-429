"""Closed sculpted locks following Grassy's round, layered reference silhouette."""

import math

import bpy
from mathutils import Vector


def _mesh(name, vertices, faces, material, detail=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj['grassy_part'] = 'hair' if detail == 0 else 'hair_detail'
    obj['grassy_detail'] = detail
    return obj


def _bezier(control, t):
    a, b, c, d = [Vector(point) for point in control]
    return a * (1 - t) ** 3 + b * (3 * t * (1 - t) ** 2) + c * (3 * t * t * (1 - t)) + d * t ** 3


def _scalp(theta, phi, offset=0):
    radial = math.sin(phi)
    if phi > math.pi / 2:
        radial = max(0, radial) ** 0.36
    return Vector((
        (0.437 + offset) * radial * math.sin(theta),
        0.020 - (0.397 + offset) * radial * math.cos(theta),
        2.601 + (0.434 + offset) * math.cos(phi),
    ))


def _lock(name, control, width, depth, material, outward=None):
    """An elliptical volume with closed ends retains thickness from every angle."""
    rows, sides = 22, 16
    vertices, faces = [], []
    for row in range(rows + 1):
        t = row / rows
        center = _bezier(control, t)
        tangent = (_bezier(control, min(1, t + 0.001)) - _bezier(control, max(0, t - 0.001))).normalized()
        normal = Vector(outward) if outward else Vector((center.x / 0.44, (center.y - 0.02) / 0.40, (center.z - 2.601) / 0.45))
        normal.normalize()
        across = tangent.cross(normal).normalized()
        normal = across.cross(tangent).normalized()
        taper = (0.34 + 0.88 * math.sin(math.pi * t * 0.82)) * (1 - t) ** 0.57
        taper = max(0.002, taper)
        for side in range(sides):
            angle = math.tau * side / sides
            lateral = math.cos(angle)
            bulge = math.sin(angle)
            # Shallow carved channels give the solid tufts a brushed surface.
            groove = 0.0012 * math.sin((lateral + 0.08 * math.sin(t * 5)) * 29) * max(0, bulge) ** 3
            point = center + across * (width * taper * lateral) + normal * ((depth * taper + groove) * bulge)
            vertices.append(tuple(point))
    for row in range(rows):
        for side in range(sides):
            a = row * sides + side
            b = row * sides + (side + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    faces.append(tuple(range(sides)))
    faces.append(tuple(reversed([rows * sides + side for side in range(sides)])))
    obj = _mesh(name, vertices, faces, material)
    smoothing = obj.modifiers.new('Rounded sculpted lock', 'SUBSURF')
    smoothing.levels = 1
    smoothing.render_levels = 1
    return obj


def _cap(material, head_profile):
    vertices, faces = [], []
    rows, sides = 36, 112
    for row in range(rows + 1):
        for side in range(sides):
            theta = math.tau * side / sides
            frontness = math.cos(theta)
            blend = (1 - frontness) / 2
            limit = 1.34 + 1.53 * min(1, blend * 1.42) ** 0.54
            phi = 0.003 + (limit - 0.003) * row / rows
            point = _scalp(theta, phi, -0.004)
            width, front, back, center = head_profile(point.z)
            x_skin = (width + 0.021) * math.sin(theta)
            y_skin = center - ((front if frontness >= 0 else back) + 0.021) * frontness
            # The lower cranium is fuller than an ellipsoid: fit the cap to the
            # actual skin profile so the scalp never reappears between locks.
            if abs(x_skin) > abs(point.x):
                point.x = x_skin
            point.y = min(point.y, y_skin) if frontness >= 0 else max(point.y, y_skin)
            vertices.append(tuple(point))
    for row in range(rows):
        for side in range(sides):
            a = row * sides + side
            b = row * sides + (side + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    faces.append(tuple(range(sides)))
    bottom = len(vertices)
    vertices.append((0, 0.06, 2.49))
    for side in range(sides):
        faces.append((bottom, rows * sides + (side + 1) % sides, rows * sides + side))
    return _mesh('Hair fitted full-volume underlayer', vertices, faces, material)


def _layered_locks(materials):
    objects = []
    # Long crown locks overlap successively shorter side and nape locks.
    for row, (phi, count, length, width) in enumerate([
        (0.28, 10, 0.59, 0.080),
        (0.59, 15, 0.62, 0.075),
        (0.94, 20, 0.65, 0.068),
        (1.27, 22, 0.63, 0.064),
        (1.60, 23, 0.65, 0.060),
        (1.91, 22, 0.63, 0.054),
        (2.24, 20, 0.60, 0.048),
    ]):
        for index in range(count):
            theta = math.tau * (index + 0.47 * (row % 2) + 0.12 * math.sin(index * 1.8 + row)) / count
            frontness = math.cos(theta)
            if frontness > 0.54 and row >= 2:
                continue
            if row >= 4 and frontness > -0.10:
                continue
            end_phi = phi + length + 0.072 * math.sin(index * 2.9 + row)
            if frontness > 0.10:
                end_phi = min(end_phi, 1.94)
            sweep = -0.09 + 0.25 * math.sin(theta * 1.3 + row * 0.63) + 0.095 * math.sin(index * 2.1)
            if row >= 5:
                sweep *= 0.50
            crest = 0.033 + 0.016 * math.sin(index * 1.7 + row)
            control = [
                _scalp(theta, phi, -0.006),
                _scalp(theta + sweep * 0.4, phi + length * 0.35, crest),
                _scalp(theta + sweep, end_phi - 0.12, crest + 0.013),
                _scalp(theta + sweep * 1.3, end_phi, 0.025 if index % 4 == 0 else 0.013),
            ]
            material = materials['hair_light'] if (index + 2 * row) % 11 == 0 else materials['hair']
            objects.append(_lock(f'Hair overlapping layer {row} lock {index}', control, width * (0.90 + 0.12 * math.sin(index * 2.4)), 0.029 if row < 3 else 0.024, material))
    return objects


def _fringe(materials):
    # The swept part and irregular bang tips are the strongest front-view cues.
    controls = [
        ([(0.055, -0.108, 2.985), (-0.166, -0.312, 3.010), (-0.354, -0.424, 2.772), (-0.404, -0.235, 2.542)], 0.091, 0.040),
        ([(0.076, -0.137, 2.980), (-0.095, -0.370, 2.970), (-0.283, -0.413, 2.698), (-0.290, -0.309, 2.508)], 0.090, 0.039),
        ([(0.090, -0.143, 2.959), (-0.005, -0.371, 2.947), (-0.139, -0.423, 2.701), (-0.169, -0.329, 2.531)], 0.083, 0.040),
        ([(0.119, -0.160, 2.944), (0.107, -0.376, 2.871), (0.022, -0.392, 2.674), (-0.027, -0.323, 2.565)], 0.074, 0.035),
        ([(0.139, -0.160, 2.938), (0.204, -0.341, 2.845), (0.191, -0.360, 2.684), (0.132, -0.324, 2.575)], 0.067, 0.034),
        ([(0.157, -0.141, 2.944), (0.287, -0.303, 2.863), (0.290, -0.327, 2.662), (0.303, -0.207, 2.518)], 0.073, 0.037),
        ([(0.162, -0.083, 2.965), (0.364, -0.252, 2.885), (0.427, -0.196, 2.650), (0.416, -0.047, 2.459)], 0.074, 0.038),
        ([(-0.055, -0.057, 3.014), (-0.276, -0.197, 3.020), (-0.407, -0.223, 2.877), (-0.499, -0.124, 2.787)], 0.080, 0.033),
        ([(-0.108, 0.066, 3.010), (-0.307, -0.042, 3.067), (-0.431, -0.092, 2.980), (-0.500, -0.022, 2.930)], 0.075, 0.030),
        ([(0.062, 0.034, 3.017), (0.005, -0.040, 3.100), (-0.158, -0.069, 3.053), (-0.266, -0.029, 3.070)], 0.080, 0.030),
        ([(0.092, 0.086, 3.008), (0.166, 0.022, 3.062), (0.140, -0.009, 3.087), (0.065, 0.001, 3.100)], 0.055, 0.025),
        ([(0.149, 0.077, 2.999), (0.268, 0.004, 3.066), (0.360, 0.055, 3.026), (0.445, 0.103, 2.994)], 0.073, 0.031),
    ]
    objects = []
    for index, (control, width, depth) in enumerate(controls):
        objects.append(_lock(f'Hair sculpted swept fringe {index}', control, width, depth, materials['hair'], (0, -1, 0.33)))
    # Short sideburns merge the hairstyle into the ear region without square ends.
    for sign in (-1, 1):
        controls = [
            (sign * 0.405, -0.068, 2.571),
            (sign * 0.418, -0.134, 2.498),
            (sign * 0.396, -0.152, 2.381),
            (sign * 0.355, -0.137, 2.341),
        ]
        objects.append(_lock(f'Hair tapered temple {sign}', controls, 0.043, 0.029, materials['hair_dark'], (sign, -0.3, 0.15)))
    return objects


def _silhouette_tips(materials):
    controls = [
        ([(-0.23, 0.00, 2.967), (-0.379, -0.014, 2.993), (-0.469, 0.018, 3.016), (-0.523, 0.030, 3.036)], 0.050),
        ([(-0.354, 0.015, 2.816), (-0.439, -0.006, 2.789), (-0.486, -0.031, 2.752), (-0.531, -0.051, 2.768)], 0.041),
        ([(0.360, -0.024, 2.823), (0.436, -0.006, 2.842), (0.476, -0.002, 2.815), (0.533, -0.010, 2.837)], 0.043),
        ([(0.373, 0.055, 2.567), (0.439, 0.100, 2.533), (0.479, 0.080, 2.521), (0.519, 0.093, 2.542)], 0.033),
        ([(-0.351, 0.066, 2.538), (-0.438, 0.090, 2.482), (-0.463, 0.123, 2.460), (-0.505, 0.134, 2.477)], 0.035),
    ]
    return [_lock(f'Hair irregular silhouette tip {index}', control, width, 0.021, materials['hair']) for index, (control, width) in enumerate(controls)]


def build_hair(materials, head_profile):
    return [_cap(materials['hair_dark'], head_profile), *_layered_locks(materials), *_fringe(materials), *_silhouette_tips(materials)]
