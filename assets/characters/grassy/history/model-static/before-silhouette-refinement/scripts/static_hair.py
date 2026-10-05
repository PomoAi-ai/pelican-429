"""A short tousled groom: one crown, overlapping swept bundles and loose tips."""

import math

import bpy
from mathutils import Vector


def _mesh(name, vertices, faces, material, uvs):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    layer = mesh.uv_layers.new(name='Hair strands')
    for polygon, coordinates in zip(mesh.polygons, uvs):
        for loop, uv in zip(polygon.loop_indices, coordinates):
            layer.data[loop].uv = uv
    obj['grassy_part'] = 'hair'
    obj['grassy_detail'] = 0
    return obj


def _bezier(control, t):
    a, b, c, d = [Vector(point) for point in control]
    return a * (1 - t) ** 3 + b * (3 * t * (1 - t) ** 2) + c * (3 * t * t * (1 - t)) + d * t ** 3


def _scalp(theta, phi, offset, head_profile):
    # The reference has a full, rounded upper cranium rather than a narrow
    # dome. Width grows before the crown turns down into the temple.
    radial = max(0, math.sin(phi)) ** 0.82
    z = 2.602 + 0.447 * math.cos(phi)
    width, front, back, center = head_profile(z)
    pole = min(1, max(0, phi) / 0.09)
    rx = max(0.458 * radial, width + 0.025) * pole
    ry = max((0.441 if math.cos(theta) > 0 else 0.455) * radial,
             (front if math.cos(theta) > 0 else back) + 0.027) * pole
    crown = max(0, math.cos(phi))
    point = Vector((rx * math.sin(theta) - 0.012 * crown ** 2,
                    center - ry * math.cos(theta), z))
    normal = Vector((math.sin(theta) * math.sin(phi),
                     -math.cos(theta) * math.sin(phi), math.cos(phi)))
    return point + normal * offset


def _hairline(theta):
    angle = abs((theta + math.pi) % math.tau - math.pi)
    keys = [(0, 1.06), (0.4, 1.12), (0.78, 1.30), (1.12, 1.52),
            (1.48, 1.86), (1.82, 2.17), (2.25, 2.51), (math.pi, 2.72)]
    for (a, va), (b, vb) in zip(keys, keys[1:]):
        if a <= angle <= b:
            t = (angle - a) / (b - a)
            t = t * t * (3 - 2 * t)
            return va * (1 - t) + vb * t + 0.014 * math.sin(theta * 11)
    return keys[-1][1]


def _cap(material, scalp):
    vertices, faces, uvs = [], [], []
    rows, sides = 48, 128
    for row in range(rows + 1):
        for side in range(sides):
            theta = math.tau * side / sides
            edge = _hairline(theta)
            phi = 0.006 + (edge - 0.006) * row / rows
            relief = (0.0015 * math.sin(theta * 41 + phi * 4)
                      + 0.0006 * math.sin(theta * 79 - phi * 5)) * math.sin(phi)
            # Fill the hollow beneath the side/back bundles. Feather this
            # support into the crown and cut edge, preserving the fringe.
            angle = abs((theta + math.pi) % math.tau - math.pi)
            coverage = min(1, max(0, (angle - 0.72) / 0.40))
            coverage = coverage * coverage * (3 - 2 * coverage)
            edge_blend = min(1, max(0, (edge - phi) / 0.24))
            support = min(0.028, 0.050 * math.sin(phi) ** 1.5)
            support *= coverage * edge_blend * edge_blend * (3 - 2 * edge_blend)
            vertices.append(tuple(scalp(theta, phi, relief - 0.012 + support)))
    for row in range(rows):
        for side in range(sides):
            a, b = row * sides + side, row * sides + (side + 1) % sides
            faces.append((a, a + sides, b + sides, b))
            u, v, un, vn = side / sides, row / rows, (side + 1) / sides, (row + 1) / rows
            uvs.append(((u * 8, v), (u * 8, vn), (un * 8, vn), (un * 8, v)))
    faces.append(tuple(range(sides)))
    uvs.append(tuple((side / sides, 0) for side in range(sides)))
    bottom = len(vertices)
    vertices.append((0, 0.08, 2.43))
    for side in range(sides):
        faces.append((bottom, rows * sides + (side + 1) % sides, rows * sides + side))
        uvs.append(((0.5, 0.5), ((side + 1) / sides, 1), (side / sides, 1)))
    return _mesh('Hair fitted underlayer', vertices, faces, material, uvs)


def _lock(name, path, width, depth, material, phase=0, outward=None):
    """Rounded closed bundle with fine unequal channels flowing into its tip."""
    rows, sides = 32, 36
    vertices, faces, uvs = [], [], []
    for row in range(rows + 1):
        t = row / rows
        center = path(t)
        tangent = (path(min(1, t + 0.001)) - path(max(0, t - 0.001))).normalized()
        normal = Vector(outward) if outward else Vector((center.x / 0.47,
                        (center.y - 0.02) / 0.455, (center.z - 2.602) / 0.447))
        across = tangent.cross(normal).normalized()
        normal = across.cross(tangent).normalized()
        # The broad root starts inside the cap; its sides emerge continuously
        # and cover the previous layer before the free tip narrows.
        root = 0.64 + 0.36 * math.sin(min(1, t / 0.25) * math.pi / 2)
        taper = max(0.0002, root * (1 - t ** 2.4) ** 0.66)
        for side in range(sides):
            angle = math.tau * side / sides
            lateral, bulge = math.cos(angle), math.sin(angle)
            asymmetry = 1 + 0.11 * lateral * math.sin(t * 4.7 + phase)
            channels = 0
            for channel, strength in ((-0.57, 0.74), (-0.12, 1.0), (0.43, 0.85)):
                bend = channel + 0.06 * math.sin(t * 4 + phase + channel * 3)
                channels += strength * math.exp(-((lateral - bend) / 0.105) ** 2)
            relief = -depth * taper * 0.17 * channels * max(0, bulge) ** 1.25
            relief += depth * taper * 0.018 * math.sin(lateral * 54 + phase + t * 3) * max(0, bulge)
            point = center + across * (width * taper * lateral * asymmetry)
            point += normal * (depth * taper * bulge * (1 if bulge > 0 else 0.90) + relief)
            vertices.append(tuple(point))
    for row in range(rows):
        for side in range(sides):
            a, b = row * sides + side, row * sides + (side + 1) % sides
            faces.append((a, a + sides, b + sides, b))
            u, v, un, vn = side / sides, row / rows, (side + 1) / sides, (row + 1) / rows
            uvs.append(((u, v), (u, vn), (un, vn), (un, v)))
    faces.append(tuple(range(sides)))
    uvs.append(tuple((side / sides, 0) for side in range(sides)))
    faces.append(tuple(reversed([rows * sides + side for side in range(sides)])))
    uvs.append(tuple((side / sides, 1) for side in reversed(range(sides))))
    obj = _mesh(name, vertices, faces, material, uvs)
    smoothing = obj.modifiers.new('Soft strand contours', 'SUBSURF')
    smoothing.levels = smoothing.render_levels = 1
    return obj


def _sweep(name, scalp, theta, phi, span, sweep, width, depth, material,
           phase=0, lift=0.025, arch=0.022):
    def path(t):
        # Growth is diagonal near the root, then the free end turns gently.
        angle = theta + sweep * (0.43 * t + 0.57 * t * t)
        angle += 0.045 * math.sin(math.pi * t) * math.sin(phase)
        latitude = phi + span * t
        offset = -0.047 * (1 - t) ** 3 + arch * math.sin(math.pi * t)
        offset += lift * t ** 3
        return scalp(angle, latitude, offset)

    return _lock(name, path, width, depth, material, phase)


def _fringe(materials, scalp):
    # The fringe fans from a slightly right-of-centre part. Its pointed ends
    # alternate in height; the sideward sweep is visible from the front.
    directions = [
        (0.24, 0.43, 1.20, -0.29, 0.073, 0.030),
        (0.11, 0.50, 1.11, -0.35, 0.075, 0.032),
        (-0.10, 0.57, 1.11, -0.35, 0.070, 0.031),
        (-0.33, 0.68, 0.99, -0.35, 0.064, 0.029),
        (-0.58, 0.78, 0.99, -0.31, 0.060, 0.029),
        (-0.83, 0.94, 0.98, -0.27, 0.054, 0.026),
        (-1.05, 1.10, 0.83, -0.17, 0.047, 0.025),
        (0.42, 0.40, 1.15, -0.11, 0.073, 0.032),
        (0.54, 0.50, 1.04, 0.06, 0.069, 0.030),
        (0.78, 0.61, 1.04, 0.03, 0.064, 0.029),
        (0.95, 0.83, 1.03, 0.14, 0.056, 0.027),
        (1.09, 1.06, 0.85, 0.16, 0.050, 0.025),
    ]
    objects = []
    for index, (theta, phi, span, sweep, width, depth) in enumerate(directions):
        objects.append(_sweep(f'Hair swept fringe {index}', scalp, theta, phi,
                            span, sweep, width, depth, materials['hair'],
                            phase=index * 1.37, lift=-0.040, arch=0.012))
    # Short secondary strands cross the long bundles, hiding their origins and
    # breaking the smooth canopy without a horizontal second row of plates.
    accents = [
        (-0.12, 0.26, 0.57, -0.73, 0.055), (-0.51, 0.35, 0.56, -0.65, 0.051),
        (-0.96, 0.58, 0.58, -0.40, 0.048), (0.22, 0.20, 0.54, -0.56, 0.054),
        (0.51, 0.33, 0.60, 0.48, 0.050), (0.87, 0.55, 0.62, 0.45, 0.047),
        (0.28, 0.67, 0.92, -0.24, 0.028), (-0.20, 0.79, 0.91, -0.19, 0.029),
        (0.60, 0.73, 0.89, 0.05, 0.028), (-0.69, 0.91, 0.88, -0.19, 0.026),
    ]
    for index, (theta, phi, span, sweep, width) in enumerate(accents):
        objects.append(_sweep(f'Hair fringe split strand {index}', scalp, theta,
                            phi, span, sweep, width, 0.021, materials['hair'],
                            phase=index * 2.1, lift=-0.012 if index > 5 else 0.013,
                            arch=0.024))
    return objects


def _layers(materials, scalp):
    objects = []
    # Stagger the layers around the head, not in persistent vertical columns.
    # Their overlap and changing slant give the back a soft, rounded outline.
    layers = [(0.20, 11, 0.67), (0.57, 15, 0.67), (0.96, 17, 0.60),
              (1.35, 17, 0.58), (1.76, 15, 0.51), (2.11, 11, 0.47),
              (2.41, 7, 0.30)]
    for row, (latitude, count, length) in enumerate(layers):
        for column in range(count):
            phase = column * 2.39996 + row * 1.731
            theta = 0.97 + (math.tau - 1.94) * (column + 0.13 * math.sin(phase)) / (count - 1)
            phi = latitude + 0.07 * math.sin(phase * 1.23)
            direction = 1 if theta < math.pi else -1
            if row in (3, 4) and column in (1, count - 2):
                theta += direction * (0.08 if row == 3 else 0.16)
            rear = math.exp(-((theta - math.pi) / 0.66) ** 2)
            sweep = direction * (0.26 + 0.18 * math.sin(phase * 0.7)) * (1 - rear)
            sweep += rear * (0.19 * math.sin(phase * 1.31) + 0.04)
            span = length + 0.10 * math.sin(phase * 0.91)
            span = min(span, _hairline(theta + sweep) + 0.13 - phi)
            if span < 0.28:
                continue
            width = (0.071 + 0.011 * math.sin(phase * 0.83)) * (0.83 if row > 4 else 1)
            depth = 0.026 if row < 4 else 0.023
            # A few outward turned ends create the irregular cut at the crown
            # and behind the ear. Most finish close to the neighbouring hair.
            lift = 0.030 if (column + row * 2) % 6 == 0 else 0.014
            objects.append(_sweep(f'Hair staggered bundle {row} {column}', scalp,
                            theta, phi, span, sweep, width, depth,
                            materials['hair'], phase, lift=lift,
                            arch=0.005 + 0.002 * math.sin(phase)))
    return objects


def _crown(materials, scalp):
    objects = []
    # One asymmetrical crest grows out of the crown. Its neighbouring tips
    # continue sideways into the groom instead of standing as separate horns.
    controls = [
        ([(0.025, 0.040, 2.990), (0.109, 0.043, 3.040), (0.023, 0.025, 3.108), (-0.103, 0.010, 3.078)], 0.034, 0.042),
        ([(-0.012, -0.026, 3.007), (-0.081, -0.058, 3.067), (-0.235, -0.105, 3.052), (-0.344, -0.109, 3.013)], 0.032, 0.038),
    ]
    for index, (control, width, depth) in enumerate(controls):
        objects.append(_lock(f'Hair soft crown sweep {index}',
                            lambda t, points=control: _bezier(points, t),
                            width, depth, materials['hair'], index, (0, -1, 0)))
    accents = [
        (1.20, 0.17, 0.67, 0.63, 0.050), (2.24, 0.22, 0.62, 0.52, 0.049),
        (3.30, 0.26, 0.69, -0.51, 0.055), (4.33, 0.18, 0.65, -0.62, 0.050),
        (5.09, 0.30, 0.51, -0.54, 0.047),
    ]
    for index, (theta, phi, span, sweep, width) in enumerate(accents):
        objects.append(_sweep(f'Hair crown loose strand {index}', scalp,
                            theta, phi, span, sweep, width, 0.023,
                            materials['hair'], index * 1.47, lift=0.010, arch=0.005))
    return objects


def build_hair(materials, head_profile):
    def scalp(theta, phi, offset=0):
        return _scalp(theta, phi, offset, head_profile)

    return [_cap(materials['hair'], scalp), *_layers(materials, scalp),
            *_fringe(materials, scalp), *_crown(materials, scalp)]
