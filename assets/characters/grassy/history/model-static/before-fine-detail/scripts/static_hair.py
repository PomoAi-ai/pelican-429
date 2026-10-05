"""A short tousled groom: one crown, overlapping swept bundles and loose tips."""

import math

import bpy
from mathutils import Vector


def _crown_width(z):
    shoulder = min(1, max(0, (z - 2.67) / 0.12))
    crown = min(1, max(0, (z - 2.79) / 0.155))
    return (1 - 0.125 * shoulder * shoulder * (3 - 2 * shoulder)
            - 0.120 * crown * crown * (3 - 2 * crown))


def _nape_position(x, y, z):
    """Tuck the extended nape behind the jaw without shortening its back cut."""
    lower = min(1, max(0, (2.24 - z) / 0.19))
    rear = min(1, max(0, (y - 0.02) / 0.10))
    contraction = 0.58 * lower * lower * (3 - 2 * lower) * rear * rear * (3 - 2 * rear)
    return x * (1 - contraction), y, z


def _mesh(name, vertices, faces, material, uvs):
    # Narrow all upper locks together, retaining the broad lower silhouette
    # and every side-view depth. A cap-only change leaves wide floating locks.
    vertices = [_nape_position(x * _crown_width(z), y, z) for x, y, z in vertices]
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
    # Fullness belongs above and behind the ear. Keep the original crown and
    # cut heights while letting the upper silhouette spread sideways.
    radial = max(0, math.sin(phi)) ** 0.82
    z = 2.602 + 0.447 * math.cos(phi)
    width, front, back, center = head_profile(z)
    pole = min(1, max(0, phi) / 0.09)
    fullness = math.exp(-((phi - 1.16) / 0.89) ** 4)
    rx = max((0.458 + 0.039 * fullness) * radial, width + 0.025) * pole
    ry = max(((0.441 + 0.012 * fullness) if math.cos(theta) > 0
              else (0.455 + 0.069 * fullness)) * radial,
             (front if math.cos(theta) > 0 else back) + 0.027) * pole
    crown = max(0, math.cos(phi))
    point = Vector((rx * math.sin(theta) - 0.012 * crown ** 2,
                    center - ry * math.cos(theta), z))
    normal = Vector((math.sin(theta) * math.sin(phi),
                     -math.cos(theta) * math.sin(phi), math.cos(phi)))
    point += normal * offset
    # Carry the back cut down to the nape, fading out before the ear and
    # upper occiput so that neither the face nor crown silhouette moves.
    angle = abs((theta + math.pi) % math.tau - math.pi)
    rear = min(1, max(0, (angle - 1.76) / 0.84))
    lower = min(1, max(0, (2.56 - point.z) / 0.30))
    point.z -= 0.125 * rear * rear * (3 - 2 * rear) * lower * lower * (3 - 2 * lower)
    return point


def _hairline(theta):
    angle = abs((theta + math.pi) % math.tau - math.pi)
    keys = [(0, 1.06), (0.4, 1.12), (0.78, 1.30), (1.12, 1.52),
            (1.48, 1.78), (1.82, 2.12), (2.25, 2.51), (math.pi, 2.72)]
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
        normal = Vector(outward) if outward else Vector((center.x / 0.50,
                        (center.y - 0.02) / 0.49, (center.z - 2.602) / 0.447))
        across = tangent.cross(normal).normalized()
        normal = across.cross(tangent).normalized()
        # The broad root starts inside the cap; its sides emerge continuously
        # and cover the previous layer before the free tip narrows.
        root = 0.64 + 0.36 * math.sin(min(1, t / 0.25) * math.pi / 2)
        taper = max(0.0002, root * (1 - t ** 2.4) ** 0.66)
        for side in range(sides):
            angle = math.tau * side / sides
            lateral, bulge = math.cos(angle), math.sin(angle)
            asymmetry = 1 + 0.16 * lateral * math.sin(t * 4.7 + phase)
            channels = 0
            for channel, strength in ((-0.57, 0.74), (-0.12, 1.0), (0.43, 0.85)):
                bend = channel + 0.06 * math.sin(t * 4 + phase + channel * 3)
                channels += strength * math.exp(-((lateral - bend) / 0.105) ** 2)
            relief = -depth * taper * 0.085 * channels * max(0, bulge) ** 1.25
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
        angle += 0.11 * math.sin(math.pi * t) * math.sin(phase)
        latitude = phi + span * t
        offset = -0.047 * (1 - t) ** 3 + arch * math.sin(math.pi * t)
        offset += lift * t ** 3
        return scalp(angle, latitude, offset)

    return _lock(name, path, width, depth, material, phase)


def _fringe(materials, scalp):
    # Broad bent locks fan from the part, with unequal short ends. Their
    # rounded bellies interrupt the outline of a smooth combed curtain.
    directions = [
        (0.29, 0.47, 1.06, -0.53, 0.095, 0.042),
        (0.03, 0.62, 1.05, -0.51, 0.093, 0.041),
        (-0.31, 0.78, 0.94, -0.43, 0.084, 0.039),
        (-0.70, 0.99, 0.79, -0.35, 0.073, 0.036),
        (0.48, 0.55, 0.94, 0.12, 0.091, 0.042),
        (0.72, 0.70, 0.96, 0.23, 0.083, 0.039),
        (0.99, 0.96, 0.79, 0.22, 0.072, 0.035),
    ]
    objects = []
    for index, (theta, phi, span, sweep, width, depth) in enumerate(directions):
        objects.append(_sweep(f'Hair swept fringe {index}', scalp, theta, phi,
                            span, sweep, width, depth, materials['hair'],
                            phase=index * 1.37, lift=-0.032,
                            arch=0.025 + 0.008 * math.sin(index * 1.7)))
    # Short secondary strands cross the long bundles, hiding their origins and
    # breaking the smooth canopy without a horizontal second row of plates.
    accents = [
        (0.14, 0.22, 0.64, -0.91, 0.075), (-0.33, 0.39, 0.53, -0.79, 0.070),
        (-0.76, 0.59, 0.57, -0.66, 0.065), (0.36, 0.29, 0.55, 0.66, 0.072),
        (0.76, 0.47, 0.62, 0.62, 0.069), (1.03, 0.75, 0.61, 0.54, 0.061),
        (-0.60, 0.93, 0.62, -0.50, 0.044), (0.73, 1.04, 0.49, 0.29, 0.039),
    ]
    for index, (theta, phi, span, sweep, width) in enumerate(accents):
        objects.append(_sweep(f'Hair fringe split strand {index}', scalp, theta,
                            phi, span, sweep, width, 0.034, materials['hair'],
                            phase=index * 2.1, lift=-0.015 if index > 5 else 0.029,
                            arch=0.030))
    # Small unequal tips break the open triangle without lowering the main
    # fringe across the eyebrows.
    forehead = [(0.34, 0.80, 0.77, -0.23, 0.045),
                (0.44, 0.90, 0.72, -0.13, 0.039),
                (0.58, 0.92, 0.59, -0.12, 0.037)]
    for index, (theta, phi, span, sweep, width) in enumerate(forehead):
        objects.append(_sweep(f'Hair short forehead tip {index}', scalp, theta,
                            phi, span, sweep, width, 0.025, materials['hair'],
                            phase=index * 1.61, lift=-0.039, arch=0.013))
    return objects


def _layers(materials, scalp):
    objects = []
    # Irrational angular spacing prevents the roots and tips from falling in
    # rings. Short overlapping bundles follow the crown's diagonal growth.
    count = 68
    for index in range(count):
        phase = index * 2.39996
        theta = 0.91 + (math.tau - 1.82) * ((index * 0.61803398875 + 0.13) % 1)
        edge = _hairline(theta)
        phi = 0.16 + (edge - 0.52) * ((index + 0.5) / count) ** 0.81
        direction = 1 if theta < math.pi else -1
        rear = math.exp(-((theta - math.pi) / 0.64) ** 2)
        sweep = direction * (0.37 + 0.19 * math.sin(phase * 0.73)) * (1 - rear)
        sweep += rear * (0.29 * math.sin(phase * 1.31) + 0.08)
        span = 0.60 + 0.15 * math.sin(phase * 0.91)
        span = min(span, _hairline(theta + sweep) + 0.055 - phi)
        width = (0.080 + 0.014 * math.sin(phase * 0.83)) * (0.84 if phi > 1.90 else 1)
        depth = 0.038 if phi < 1.75 else 0.030
        lift = 0.038 if index % 5 == 0 else 0.018
        objects.append(_sweep(f'Hair tousled diagonal bundle {index}', scalp,
                        theta, phi, span, sweep, width, depth,
                        materials['hair'], phase, lift=lift,
                        arch=0.021 + 0.008 * math.sin(phase)))
    return objects


def _crown(materials, scalp):
    objects = []
    # One asymmetrical crest grows out of the crown. Its neighbouring tips
    # continue sideways into the groom instead of standing as separate horns.
    controls = [
        ([(0.060, 0.005, 2.965), (0.105, 0.006, 3.070), (-0.010, -0.024, 3.092), (-0.108, -0.048, 3.082)], 0.027, 0.036),
        ([(-0.040, -0.020, 2.966), (-0.150, -0.060, 3.039), (-0.280, -0.080, 3.049), (-0.379, -0.081, 3.039)], 0.034, 0.029),
    ]
    for index, (control, width, depth) in enumerate(controls):
        objects.append(_lock(f'Hair soft crown sweep {index}',
                            lambda t, points=control: _bezier(points, t),
                            width, depth, materials['hair'], index, (0, -1, 0)))
    accents = [
        (1.20, 0.17, 0.65, 0.78, 0.068), (2.24, 0.22, 0.56, 0.65, 0.071),
        (3.30, 0.26, 0.68, -0.69, 0.074), (4.33, 0.18, 0.58, -0.82, 0.067),
        (5.09, 0.30, 0.50, -0.72, 0.063),
    ]
    for index, (theta, phi, span, sweep, width) in enumerate(accents):
        objects.append(_sweep(f'Hair crown loose strand {index}', scalp,
                            theta, phi, span, sweep, width, 0.034,
                            materials['hair'], index * 1.47, lift=0.030, arch=0.022))
    return objects


def _outline(materials):
    # Short ends peel sideways out of the dome. The tip envelope stays inside
    # the existing width/depth, and the roots remain above the ears.
    side_paths = [
        [(0.160, -0.100, 2.920), (0.280, -0.120, 2.990), (0.400, -0.100, 2.960), (0.425, -0.080, 2.940)],
        [(0.280, -0.030, 2.810), (0.420, -0.010, 2.890), (0.500, 0.015, 2.820), (0.515, 0.030, 2.790)],
        [(0.350, 0.040, 2.720), (0.460, 0.080, 2.810), (0.530, 0.090, 2.750), (0.540, 0.100, 2.700)],
    ]
    back_paths = [
        [(0.060, 0.160, 2.950), (0.110, 0.360, 3.000), (0.160, 0.450, 2.940), (0.200, 0.480, 2.940)],
        [(0.070, 0.280, 2.850), (0.130, 0.440, 2.920), (0.200, 0.530, 2.850), (0.240, 0.555, 2.860)],
        [(0.040, 0.390, 2.710), (0.090, 0.520, 2.790), (0.160, 0.560, 2.710), (0.190, 0.568, 2.730)],
    ]
    objects = []
    for side in (-1, 1):
        for index, path in enumerate(side_paths + back_paths):
            control = [(x * side, y, z + (0.008 if side < 0 else -0.006) * (index % 3))
                       for x, y, z in path]
            objects.append(_lock(f'Hair free outline flick {side} {index}',
                                lambda t, points=control: _bezier(points, t),
                                0.038 if index % 3 == 0 else 0.033, 0.024,
                                materials['hair'], phase=index * 1.73 + side))
    return objects


def build_hair(materials, head_profile):
    def scalp(theta, phi, offset=0):
        return _scalp(theta, phi, offset, head_profile)

    return [_cap(materials['hair'], scalp), *_layers(materials, scalp),
            *_fringe(materials, scalp), *_crown(materials, scalp), *_outline(materials)]
