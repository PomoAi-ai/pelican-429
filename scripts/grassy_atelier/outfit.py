"""Editable knitwear, sewn denim and panelled sneakers for the Grassy atelier."""
import math
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from common import curve, ellipsoid, linear_color, mesh, union
from clothing import garment_uv, fabric_sample


TAU = math.tau


def _mix(a, b, t):
    return a + (b - a) * t


def _profile(points, t):
    for index, (a, b) in enumerate(zip(points, points[1:])):
        if t <= b[0]:
            u = (t - a[0]) / (b[0] - a[0])
            previous = points[max(0, index - 1)]
            following = points[min(len(points) - 1, index + 2)]
            span = b[0] - a[0]
            result = []
            for k in range(1, len(a)):
                m0 = (b[k] - previous[k]) / (b[0] - previous[0])
                m1 = (following[k] - a[k]) / (following[0] - a[0])
                result.append((2 * u ** 3 - 3 * u * u + 1) * a[k]
                              + (u ** 3 - 2 * u * u + u) * span * m0
                              + (-2 * u ** 3 + 3 * u * u) * b[k]
                              + (u ** 3 - u * u) * span * m1)
            return tuple(result)
    return points[-1][1:]


def _surface(name, fn, mat, columns=96, rows=48, uv_scale=(1, 1), flip=False):
    verts, uvs, faces = [], [], []
    for j in range(rows + 1):
        for i in range(columns + 1):
            u, v = i / columns, j / rows
            verts.append(fn(u, v))
            uvs.append((u * uv_scale[0], v * uv_scale[1]))
    for j in range(rows):
        for i in range(columns):
            a = j * (columns + 1) + i
            face = (a, a + 1, a + columns + 2, a + columns + 1)
            faces.append(tuple(reversed(face)) if flip else face)
    return mesh(name, verts, faces, mat, uvs)


def _tube(name, points, radius, mat, sides=6):
    verts, faces = [], []
    for i, co in enumerate(points):
        p = Vector(co[:3])
        tangent = (Vector(points[min(len(points) - 1, i + 1)][:3])
                   - Vector(points[max(0, i - 1)][:3])).normalized()
        up = Vector((0, 0, 1)) if abs(tangent.z) < .92 else Vector((0, 1, 0))
        a = tangent.cross(up).normalized()
        b = tangent.cross(a).normalized()
        for j in range(sides):
            angle = j * TAU / sides
            verts.append(tuple(p + radius * (a * math.cos(angle) + b * math.sin(angle))))
    for i in range(len(points) - 1):
        for j in range(sides):
            k, q = i * sides + j, i * sides + (j + 1) % sides
            faces.append((k, q, q + sides, k + sides))
    faces.extend([tuple(reversed(range(sides))),
                  tuple(range((len(points) - 1) * sides, len(points) * sides))])
    return mesh(name, verts, faces, mat)


def _polish_normals(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    for poly in obj.data.polygons:
        poly.use_smooth = True


def _close_surface(obj, columns, rows):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.faces.new([bm.verts[i] for i in range(columns - 1, -1, -1)])
    bm.faces.new([bm.verts[rows * (columns + 1) + i] for i in range(columns)])
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()


def _cylindrical_uv(obj, scale=(3, 2.5)):
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    layer = obj.data.uv_layers.new(name='UVMap')
    layer.active_render = True
    for poly in obj.data.polygons:
        coords = []
        for index in poly.loop_indices:
            x, y, z = obj.data.vertices[obj.data.loops[index].vertex_index].co
            coords.append((index, math.atan2(x, -y) / TAU, z))
        seam = max(c[1] for c in coords) - min(c[1] for c in coords) > .5
        for index, a, z in coords:
            layer.data[index].uv = ((a + 1 if seam and a < 0 else a) * scale[0], z * scale[1])


def _reduce_surface(obj, ratio=.72):
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new('Balanced editable sculpt density', 'DECIMATE')
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def _depth_shape(objects, factor):
    for obj in objects:
        inverse = obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            point.y = .01 + (point.y - .01) * factor(point.z)
            vertex.co = inverse @ point
        obj.data.update()


def _texture_image(name, rgba, path, noncolor=False):
    size = rgba.shape[0]
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    if noncolor:
        image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(np.asarray(rgba, dtype=np.float32).ravel())
    image.filepath_raw = str(path)
    image.file_format = 'PNG'
    image.save()
    stored = bpy.data.images.load(str(path), check_existing=False)
    if noncolor:
        stored.colorspace_settings.name = 'Non-Color'
    stored.pack()
    bpy.data.images.remove(image)
    stored.name = name
    return stored


def _fabric_texture(mat, kind, texture_dir, size=1024):
    """Bake yarn and leather relief to portable, ordinary UV images."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    grain = np.random.default_rng(581).random((size, size)).astype(np.float32) - .5
    warp = yy + .006 * np.sin(xx * TAU * 5) + .003 * np.sin(xx * TAU * 11)
    if kind == 'knit':
        height, variation, strength = fabric_sample(size, kind)
    elif kind == 'rib':
        height = .65 * np.cos(xx * TAU * 48) + .10 * np.sin(yy * TAU * 64)
        height += .06 * np.cos(xx * TAU * 144 + yy * TAU * 64)
        variation = .977 + .022 * height + .008 * grain
        strength = .62
    elif kind == 'leather':
        height = .12 * grain + .027 * np.sin(xx * TAU * 97) * np.cos(yy * TAU * 83)
        variation = .988 + .018 * grain
        strength = .36
    else:
        pattern, variation, _ = fabric_sample(size, kind)
        diagonal = np.sin((xx * 128 + yy * 96) * TAU)
        weave = np.sin(xx * TAU * 224) * np.sin(yy * TAU * 208)
        slub = np.sin(xx * TAU * 71 + .22 * np.sin(yy * TAU * 4))
        height = .15 * diagonal + .08 * weave + .045 * slub + .055 * grain + pattern
        variation += .015 * diagonal + .011 * slub + .020 * grain
        strength = .48
    color = np.array(mat.diffuse_color[:3], dtype=np.float32)
    srgb = np.where(color <= .0031308, color * 12.92, 1.055 * color ** (1 / 2.4) - .055)
    if kind == 'knit':
        srgb = np.array((217, 32, 45), dtype=np.float32) / 255
    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(srgb[None, None, :] * variation[:, :, None], 0, 1)
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    normal = np.dstack((-dx, -dy, np.ones_like(dx)))
    normal /= np.linalg.norm(normal, axis=2)[:, :, None]
    normal_rgba = np.ones_like(rgba)
    normal_rgba[:, :, :3] = normal * .5 + .5
    base = _texture_image(mat.name + '_weave_color', rgba, texture_dir / (mat.name + '-color.png'))
    relief = _texture_image(mat.name + '_weave_normal', normal_rgba,
                            texture_dir / (mat.name + '-normal.png'), True)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes['Principled BSDF']
    base_node = nodes.new('ShaderNodeTexImage')
    base_node.image = base
    base_node.label = 'Portable woven base color'
    links.new(base_node.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Base Color'].default_value = (1, 1, 1, 1)
    normal_node = nodes.new('ShaderNodeTexImage')
    normal_node.image = relief
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = (.68 if kind == 'knit'
                                                  else .26 if kind in ('denim', 'leather') else .34)
    links.new(normal_node.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], shader.inputs['Normal'])


def _torso_point(u, v):
    z = _mix(1.316, 1.99, v)
    rx, ry = _profile([(1.316, .324, .171), (1.36, .355, .202),
                      (1.43, .359, .208), (1.59, .338, .195),
                      (1.76, .327, .185), (1.85, .299, .174),
                      (1.918, .245, .159), (1.967, .186, .134),
                      (1.99, .151, .125)], z)
    theta = u * TAU
    side = abs(math.cos(theta)) ** 4
    front = max(0, -math.sin(theta)) ** 3
    lower_line = 1.391 + .038 * math.cos(theta) + .016 * math.sin(theta * 2)
    fold = .009 * math.exp(-((z - lower_line) / .027) ** 2)
    fold -= .0045 * math.exp(-((z - lower_line - .032) / .022) ** 2)
    underarm = 1.53 + .21 * abs(math.cos(theta))
    fold += .011 * side * math.exp(-((z - underarm) / .047) ** 2)
    fold -= .006 * side * math.exp(-((z - underarm - .042) / .030) ** 2)
    fold += .006 * front * math.exp(-((z - 1.49 - .09 * math.cos(theta)) / .046) ** 2)
    rx += fold
    ry += .6 * fold
    back = max(0, math.sin(theta)) ** 3
    y = ry * math.sin(theta)
    y -= .015 * front * math.exp(-((z - 1.51) / .16) ** 2)
    y += .011 * back * math.exp(-((z - 1.46) / .16) ** 2)
    neck_blend = max(0, (z - 1.83) / .16) ** 2
    neck_lift = .045 * max(0, math.sin(theta)) ** 2 * neck_blend
    return (rx * math.cos(theta), y,
            z + neck_lift + .004 * math.exp(-((z - 1.38) / .10) ** 2) * math.cos(3 * theta + .4))


def _oval_band(name, center, rx, ry, height, mat, ribs=76, columns=152, rows=20):
    cx, cy, cz = center
    def point(u, v):
        a = u * TAU
        b = v * TAU
        bulge = .007 * math.cos(b)
        ripple = .0015 * math.cos(ribs * a) * max(0, math.cos(b)) ** 2
        return (cx + (rx + bulge + ripple) * math.cos(a),
                cy + (ry + bulge + ripple) * math.sin(a), cz + math.sin(b) * height / 2)
    return _surface(name, point, mat, columns, rows, uv_scale=(1.5, .25))


def _collar(mat):
    def point(u, v):
        a, b = u * TAU, v * TAU
        across = .5 + .5 * math.cos(b)
        ripple = .0014 * math.cos(a * 68)
        front, back = max(0, -math.sin(a)), max(0, math.sin(a))
        inner = Vector((.112 * math.cos(a), .018 + .078 * math.sin(a),
                        2.007 - .026 * front + .026 * back))
        outer = Vector(_torso_point(a / TAU, .968 - .045 * front + .014 * back))
        outer += Vector((.0016 * math.cos(a), .0016 * math.sin(a), .0025))
        p = inner.lerp(outer, across)
        z = p.z + .005 * math.sin(b)
        z += .003 * math.sin(math.pi * across) + .0007 * math.cos(a * 68)
        return (p.x + ripple * math.cos(a), p.y + ripple * math.sin(a), z)
    return _surface('Sweater round ribbed neck binding', point, mat, 272, 28,
                    uv_scale=(1.5, .35))


def _sleeve_frame(side, t):
    points = [(0, .221, .014, 1.922, .003), (.12, .270, .012, 1.817, .114),
              (.29, .346, .006, 1.718, .128), (.49, .413, -.001, 1.563, .122),
              (.70, .475, -.010, 1.432, .125),
              (.87, .510, -.016, 1.357, .138), (1, .530, -.018, 1.303, .108)]
    x, y, z, r = _profile(points, t)
    center = Vector((side * x, y, z))
    direction = Vector((side * .36, -.04, -.86)).normalized()
    front = Vector((0, -1, 0))
    front = (front - direction * front.dot(direction)).normalized()
    cross = direction.cross(front).normalized()
    return center, front, cross, r


def _sleeve_point(side, u, v):
    center, front, cross, radius = _sleeve_frame(side, v)
    a = u * TAU
    for level, slope, amplitude, width, phase, spread in [
        (.62, .074, .010, .055, math.pi - .3 * side, 1.15),
        (.755, -.070 * side, .020, .047, .22 * side, 1.20),
        (.86, .060 * side, .016, .068, -.38 * side, 1.34),
    ]:
        angle = math.atan2(math.sin(a - phase), math.cos(a - phase))
        weight = math.exp(-(angle / spread) ** 2)
        line = level + slope * math.sin(a - phase)
        radius += amplitude * weight * math.exp(-((v - line) / width) ** 2)
        radius -= amplitude * .31 * weight * math.exp(-((v - line - .058) / (width * .82)) ** 2)
    upper = math.exp(-((v - .34) / .25) ** 2)
    return tuple(center + radius * (front * math.cos(a) * (1 - .032 * upper)
                                   + cross * math.sin(a) * (1 - .08 * upper)))


def _sleeve_cuff(side, mat):
    center, front, cross, _ = _sleeve_frame(side, 1)
    direction = Vector((side * .36, -.04, -.86)).normalized()
    center += direction * .036
    def point(u, v):
        a, b = u * TAU, v * TAU
        r = .100 + .012 * math.cos(b) + .0018 * math.cos(44 * a) * max(0, math.cos(b)) ** 2
        return tuple(center + direction * (math.sin(b) * .045)
                     + r * (front * math.cos(a) + cross * math.sin(a)))
    return _surface(('Left' if side < 0 else 'Right') + ' sweater ribbed cuff',
                    point, mat, 176, 16, uv_scale=(1, .28))


def _sweater(materials):
    torso = _surface('Soft red sweater continuous torso', _torso_point,
                     materials['sweater'], 96, 48, uv_scale=(3, 2))
    _close_surface(torso, 96, 48)
    pieces = [torso]
    result = [_collar(materials['rib']),
              _oval_band('Sweater ribbed waistband', (0, 0, 1.309), .336, .181,
                         .078, materials['rib'], columns=304, rows=16)]
    for side in (-1, 1):
        label = 'Left' if side < 0 else 'Right'
        sleeve = _surface(label + ' sweater softly folded sleeve',
                          lambda u, v: _sleeve_point(side, u, v), materials['sweater'],
                          64, 48, uv_scale=(2, 2))
        _close_surface(sleeve, 64, 48)
        pieces.append(sleeve)
        result.append(_sleeve_cuff(side, materials['rib']))
    sweater = union('Sweater continuous sculpted shoulders torso and sleeves', pieces,
                    voxel=.0085, smooth=4)
    _reduce_surface(sweater, .82)
    result.insert(0, sweater)
    _depth_shape(result, lambda z: 1.24)
    garment_uv(sweater)
    return result


def _leg_point(side, theta, z):
    rx, ry, center = _profile([(.325, .145, .141, .220), (.43, .170, .157, .224),
                              (.56, .174, .162, .231), (.73, .160, .151, .222),
                              (.89, .181, .171, .213), (1.035, .190, .174, .194)], z)
    folds = 0
    for level, slope, amplitude, width, phase, spread in [
        (.423, .063 * side, .024, .032, -math.pi / 2 + side * .32, 1.25),
        (.495, -.077 * side, .020, .041, -math.pi / 2 - side * .54, 1.02),
        (.454, .052, .018, .046, math.pi / 2 + side * .50, 1.10),
        (.625, .072 * side, .010, .065, -math.pi / 2 + side * .10, 1.06),
        (.774, -.094 * side, .017, .047, -math.pi / 2 - side * .52, 1.12),
        (.820, .064 * side, .010, .057, math.pi / 2, 1.20),
        (.952, -.052 * side, .009, .029, -math.pi / 2 + side * .30, 1.10),
        (.991, .045 * side, .007, .039, math.pi / 2, 1.05),
    ]:
        angle = math.atan2(math.sin(theta - phase), math.cos(theta - phase))
        weight = math.exp(-(angle / spread) ** 2)
        line = level + slope * math.sin(theta - phase) + side * .009
        folds += amplitude * weight * math.exp(-((z - line) / width) ** 2)
        folds -= amplitude * .40 * weight * math.exp(-((z - line - .046) / (width * .70)) ** 2)
    folds += .007 * math.cos(3 * theta + .4 * side) * math.exp(-((z - .69) / .31) ** 2)
    tucked = max(0, min(1, (.421 - z) / .070)) ** 2
    rx, ry = _mix(rx, .134, tucked), _mix(ry, .129, tucked)
    folds *= 1 - tucked
    return (side * (center + (rx + folds) * math.cos(theta)),
            (ry + .7 * folds) * math.sin(theta), z)


def _denim_cuff_point(side, u, v):
    a, b = u * TAU, v * TAU
    thick = .016 * (1 + .27 * math.sin(3 * a + side * .55) + .12 * math.cos(5 * a - .4))
    r = .164 + thick * math.copysign(abs(math.cos(b)) ** .50, math.cos(b))
    r += .007 * math.cos(2 * a + .35 * side) + .004 * math.sin(3 * a + side)
    outer = max(0, math.cos(b))
    pinch = .014 * math.exp(-math.sin((a - 4.34 - side * .12) / 2) ** 2 / .013)
    pinch += .009 * math.exp(-math.sin((a - 5.13) / 2) ** 2 / .018)
    r -= pinch * outer
    r += .006 * math.exp(-math.sin((a - 4.73) / 2) ** 2 / .025) * outer
    level = .350 + .012 * math.sin(a + .45 * side) + .005 * math.sin(3 * a - .8)
    height = .049 * (1 + .12 * math.cos(a - .5) + .08 * math.sin(3 * a + side))
    z = level + math.copysign(abs(math.sin(b)) ** .44, math.sin(b)) * height
    return (side * .22 + r * math.cos(a), (r - .006) * math.sin(a), z)


def _jeans_body(mat):
    """One shared waist/crotch topology branches into both trouser legs."""
    verts, faces, uvs = [], [], []
    segments, waist_rows, bridge = 128, 20, 15
    for j in range(waist_rows + 1):
        z = _mix(1.11, 1.32, j / waist_rows)
        rx = _mix(.382, .337, j / waist_rows)
        ry = _mix(.182, .172, j / waist_rows)
        for i in range(segments):
            a = i * TAU / segments
            verts.append((rx * math.sin(a), -ry * math.cos(a), z))
            uvs.append((i / segments * 3, (z - .365) * 2.5))
    for j in range(waist_rows):
        for i in range(segments):
            a = j * segments + i
            b = j * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    crotch = []
    for i in range(1, bridge + 1):
        t = i / (bridge + 1)
        crotch.append(len(verts))
        verts.append((0, .182 * (1 - 2 * t), 1.11 - .024 * math.sin(math.pi * t)))
        uvs.append((1.5, 1.86 + .02 * math.sin(math.pi * t)))
    outer_right = list(range(65))
    outer_left = [0] + list(range(127, 63, -1))
    top_rings = [(1, outer_right + crotch), (-1, outer_left + crotch)]
    ring_count = 65 + bridge
    for side, top in top_rings:
        previous = top
        for j in range(1, 69):
            v = j / 68
            z = _mix(1.055, .325, v)
            current = []
            for i in range(ring_count):
                a = (-math.pi / 2 + math.pi * i / 64 if i <= 64
                     else math.pi / 2 + math.pi * (i - 64) / (bridge + 1))
                p = _leg_point(side, a, z)
                if j <= 5:
                    blend = j / 5
                    q = verts[top[i]]
                    p = tuple(_mix(q[k], p[k], blend) for k in range(3))
                current.append(len(verts))
                verts.append(p)
                uvs.append((i / ring_count * 1.8, (z - .365) * 2.5))
            for i in range(ring_count):
                a, b = previous[i], previous[(i + 1) % ring_count]
                c, d = current[(i + 1) % ring_count], current[i]
                faces.append((d, c, b, a) if side == 1 else (a, b, c, d))
            previous = current
        faces.append(tuple(reversed(previous)) if side == 1 else tuple(previous))
    faces.append(tuple(range(waist_rows * segments, (waist_rows + 1) * segments)))
    obj = mesh('Jeans continuous waist crotch and folded legs', verts, faces, mat, uvs)
    obj = union('Jeans continuous waist crotch and folded legs', [obj], voxel=.0085, smooth=3)
    _reduce_surface(obj, .84)
    _cylindrical_uv(obj)
    return obj


def _stitch_path(name, points, mat, radius=.0015):
    if len(points) <= 8:
        points = [tuple(_mix(a[k], b[k], j / 8) for k in range(3))
                  for a, b in zip(points, points[1:]) for j in range(8)] + [points[-1]]
    return _tube(name, points, radius, mat)


def _pants_surface(pants, x, z, back):
    origin = Vector((x, 2 if back else -2, z))
    direction = Vector((0, -1 if back else 1, 0))
    hit, point, _, _ = pants.ray_cast(origin, direction)
    if not hit:
        raise ValueError(f'{pants.name}: no {"back" if back else "front"} surface at x={x}, z={z}')
    return point.y


def _pants_side(pants, side, y, z):
    hit, point, _, _ = pants.ray_cast(Vector((side * 2, y, z)), Vector((-side, 0, 0)))
    if not hit:
        raise ValueError(f'{pants.name}: no side surface at y={y}, z={z}, side={side}')
    return point.x


def _back_pocket(side, materials, pants):
    center = side * .190
    boundary = [(-.095, 1.275), (.095, 1.275), (.088, 1.108),
                (0, 1.066), (-.088, 1.108)]
    verts = [(center + x, .187 + .016 * (1 - abs(x) / .11), z) for x, z in boundary]
    verts.append((center, .218, 1.188))
    faces = [(i, (i + 1) % 5, 5) for i in range(5)]
    pocket = mesh(('Left' if side < 0 else 'Right') + ' denim sewn patch pocket', verts,
                  faces, materials['denim'], [(x / .2 + .5, (z - 1.06) / .22) for x, z in boundary]
                  + [(.5, .55)])
    solid = pocket.modifiers.new('Folded pocket cloth thickness', 'SOLIDIFY')
    solid.thickness = .004
    bevel = pocket.modifiers.new('Soft sewn pocket edge', 'BEVEL')
    bevel.width, bevel.segments = .003, 3
    result = [pocket]
    for inset in (.003, .010):
        points = []
        for x, z in boundary + [boundary[0]]:
            x *= (1 - inset / .10)
            z = _mix(z, 1.18, inset / .10)
            points.append((center + x, .191 + .016 * (1 - abs(x) / .11), z))
        result.append(_stitch_path('Pocket double ochre topstitch', points, materials['stitch'], .00135))
    points = [(center + _mix(-.089, .089, i / 30),
               .191 + .016 * (1 - abs(_mix(-.089, .089, i / 30)) / .11), 1.257) for i in range(31)]
    result.append(_stitch_path('Patch pocket folded top seam', points, materials['stitch']))
    for index, vertex in enumerate(pocket.data.vertices):
        vertex.co.y = _pants_surface(pants, vertex.co.x, vertex.co.z, True) + (.009 if index == 5 else .004)
    pocket.data.update()
    for seam in result[1:]:
        for vertex in seam.data.vertices:
            vertex.co.y = _pants_surface(pants, vertex.co.x, vertex.co.z, True) + .006
        seam.data.update()
    return result


def _jeans(materials):
    result = [_jeans_body(materials['denim'])]
    pants = result[0]
    for side in (-1, 1):
        label = 'Left' if side < 0 else 'Right'
        result.append(_surface(label + ' turned denim ankle cuff',
                               lambda u, v: _denim_cuff_point(side, u, v),
                               materials['denim_cuff'], 128, 24, uv_scale=(1.8, .4)))
        for b in (math.pi / 2 - .10, 3 * math.pi / 2 + .10):
            points = []
            for i in range(85):
                a = i * TAU / 84
                x, y, z = _denim_cuff_point(side, i / 84, b / TAU)
                points.append((x + .0012 * math.cos(a), y + .0012 * math.sin(a), z))
            result.append(_stitch_path(label + ' cuff stitched folded edge', points,
                                       materials['stitch'], .00125))
        for shift in (-.023, .023):
            a = (0 if side > 0 else math.pi) + shift
            points = []
            for i in range(45):
                b = math.pi / 2 - i / 44 * math.pi
                x, y, z = _denim_cuff_point(side, a / TAU, b / TAU)
                points.append((x + side * .0014, y, z))
            result.append(_stitch_path(label + ' cuff continuous felled side seam', points,
                                       materials['stitch'], .0012))
        for shift in (-.021, .021):
            points = []
            for i in range(76):
                z = _mix(.412, 1.284, i / 75)
                y = shift * .18
                x = _pants_side(pants, side, y, z) + side * .002
                points.append((x, y, z))
            result.append(_stitch_path(label + ' outer leg double felled seam', points,
                                       materials['stitch'], .0013))
        result.extend(_back_pocket(side, materials, pants))
        for offset in (0, .006):
            points = []
            for i in range(35):
                t = i / 34
                x = side * (.158 + .185 * (1 - math.cos(t * math.pi / 2)))
                z = 1.302 - .105 * math.sin(t * math.pi / 2) - offset
                y = _pants_surface(pants, x, z, False) - .003
                points.append((x, y, z))
            result.append(_stitch_path(label + ' curved front pocket twin stitching', points,
                                       materials['stitch'], .0015))
        for x in (.162, .338):
            result.append(ellipsoid(label + ' copper pocket rivet',
                                    (side * x, -.183 * math.sqrt(1 - (x / .39) ** 2) - .008,
                                     1.29 if x < .2 else 1.20), (.004, .002, .004),
                                    materials['metal'], 16, 8))
    for x in (-.012, .012):
        points = [(x, -.185, 1.303), (x, -.186, 1.245),
                  (x, -.183, 1.161), (x + .015, -.175, 1.12)]
        points = [(x, _pants_surface(pants, x, z, False) - .0025, z) for x, _, z in points]
        result.append(_stitch_path('Jeans fly double sewn placket', points, materials['stitch']))
    for side in (-1, 1):
        points = [(side * .014, .187, 1.302), (side * .025, .19, 1.222),
                  (side * .021, .184, 1.135), (0, .161, 1.12)]
        points = [(x, _pants_surface(pants, x, z, True) + .003, z) for x, _, z in points]
        result.append(_stitch_path('Seat center felled double seam', points, materials['stitch']))
    _depth_shape(result, lambda z: _profile([(.28, 1.15), (.60, 1.16),
                                           (.82, 1.19), (1.12, 1.24), (1.32, 1.24)], z)[0])
    return result


def _shoe_outline(a):
    x = .183 * math.cos(a)
    y = -.083 + .298 * math.sin(a)
    forefoot = .94 + .07 * max(0, -math.sin(a))
    heel = 1 - .13 * max(0, math.sin(a)) ** 3
    return x * forefoot * heel, y


def _sole(side, materials):
    def point(u, v):
        a = u * TAU
        x, y = _shoe_outline(a)
        edge = .006 * math.sin(math.pi * v)
        return (side * .22 + x * (1 + edge / .15), y, .012 + v * .074)
    result = [_surface(('Left' if side < 0 else 'Right') + ' shoe rubber sole wall',
                       point, materials['sole'], 112, 14)]
    verts = [(side * .22, -.083, .012)]
    verts.extend((side * .22 + _shoe_outline(i * TAU / 112)[0],
                  _shoe_outline(i * TAU / 112)[1], .012) for i in range(112))
    result.append(mesh('Shoe sole underside', verts,
                       [(0, (i + 1) % 112 + 1, i + 1) for i in range(112)],
                       materials['sole'], [(.5, .5)] +
                       [(.5 + .5 * math.cos(i * TAU / 112), .5 + .5 * math.sin(i * TAU / 112))
                        for i in range(112)]))
    for z, radius in ((.078, .003), (.030, .0015)):
        points = [(side * .22 + _shoe_outline(i * TAU / 112)[0] * 1.02,
                   _shoe_outline(i * TAU / 112)[1], z) for i in range(113)]
        result.append(_tube('Continuous sneaker sole moulding', points, radius, materials['shoe'], sides=8))
    return result


def _upper_point(side, u, v):
    a = u * TAU
    x, y = _shoe_outline(a)
    x = _mix(x, .077 * math.cos(a), v) + .006 * math.sin(math.pi * v) * math.cos(a)
    y = _mix(y, .060 + .102 * math.sin(a), v)
    front = .5 - .5 * math.sin(a)
    radial = math.sin(v * math.pi / 2) ** .56
    z = .086 + .194 * radial - .018 * front * v
    z += .012 * front * math.sin(v * math.pi)
    z -= .024 * front * front * radial
    z += .014 * front ** 3 * math.exp(-((v - .33) / .22) ** 2)
    z += .008 * front * math.sin(v * math.pi)
    return (side * .22 + x, y, z)


def _eyelet(name, center, mat):
    cx, cy, cz = center
    def point(u, v):
        a, b = u * TAU, v * TAU
        major, tube = .0080, .0021
        return (cx + (major + tube * math.cos(b)) * math.cos(a),
                cy + (major + tube * math.cos(b)) * math.sin(a), cz + tube * math.sin(b))
    return _surface(name, point, mat, 24, 8)


def _conformed_patch(name, side, upper, fn, mat, stitch, flip=False):
    def point(u, v):
        p, q = 2 * u - 1, 2 * v - 1
        rounded_u = .5 + .5 * p * math.sqrt(1 - .24 * q * q)
        rounded_v = .5 + .5 * q * math.sqrt(1 - .24 * p * p)
        a, height = fn(rounded_u, rounded_v)
        p = Vector(_upper_point(side, a / TAU, height))
        tangent = Vector(_upper_point(side, a / TAU + .0001, height)) - p
        rise = Vector(_upper_point(side, a / TAU, height + .0001)) - p
        normal = tangent.cross(rise).normalized()
        surface, normal, _, _ = upper.ray_cast(p + normal * .035, -normal)
        if surface is None:
            raise ValueError(f'{name}: no leather upper surface at angle={a}, height={height}')
        return tuple(surface + normal * .0025)
    result = [_surface(name, point, mat, 36, 20, flip=flip)]
    solid = result[0].modifiers.new('Soft leather sewn layer', 'SOLIDIFY')
    solid.thickness = .0012
    solid.offset = 1
    for edge in (lambda t: point(t, .04), lambda t: point(.04, t),
                 lambda t: point(.96, t)):
        points = [(x, y, z + .0013) for x, y, z in [edge(i / 30) for i in range(31)]]
        result.append(_stitch_path(name + ' fine edge sewing', points, stitch, .001))
    return result


def _sneaker(side, materials):
    label = 'Left' if side < 0 else 'Right'
    result = _sole(side, materials)
    upper = _surface(label + ' sneaker leather upper with ankle opening',
                     lambda u, v: _upper_point(side, u, v), materials['shoe'], 160, 40)
    result.append(upper)
    upper_surface = BVHTree.FromPolygons([v.co.copy() for v in upper.data.vertices],
                                        [list(p.vertices) for p in upper.data.polygons])
    ankle = [_upper_point(side, i / 80, 1) for i in range(81)]
    result.append(_tube(label + ' padded ankle collar', ankle, .009, materials['shoe'], sides=12))
    for direction in (-1, 1):
        def quarter(u, v):
            a = -.46 + .67 * u + .19 * v
            return (a if direction > 0 else math.pi - a, .11 + .49 * v)
        result.extend(_conformed_patch(label + ' warm suede side quarter', side, upper_surface, quarter,
                                        materials['suede'], materials['lace'], direction < 0))
        def heel(u, v):
            a = .31 + .76 * u - .08 * v
            return (a if direction > 0 else math.pi - a, .055 + .79 * v)
        result.extend(_conformed_patch(label + ' leather heel reinforcement', side, upper_surface, heel,
                                        materials['shoe'], materials['lace'], direction < 0))
    result.extend(_conformed_patch(label + ' suede heel tab', side, upper_surface,
                                    lambda u, v: (math.pi / 2 + (u - .5) * .68, .05 + .69 * v),
                                    materials['suede'], materials['lace']))
    def toe(u, v):
        a = math.pi + u * math.pi
        x, y, z = _upper_point(side, a / TAU, v * .39)
        return (x + .0015 * math.cos(a), y + .0015 * math.sin(a), z + .002)
    result.append(_surface(label + ' rounded leather toe cap', toe, materials['shoe'], 64, 18))
    toe_edge = [toe(i / 60, 1) for i in range(61)]
    result.append(_stitch_path(label + ' toe cap curved double sewing',
                               [(x, y - .002, z + .003) for x, y, z in toe_edge], materials['lace']))
    def tongue(u, v):
        y = _mix(-.274, -.022, v)
        width = _mix(.076, .063, v)
        across = 2 * u - 1
        y += .027 * (1 - 1.4 * across * across) * v ** 8
        y += .016 * across * across * (1 - v) ** 10
        radial = (y + .381) / .339
        z = _upper_point(side, .75, radial)[2] + .014 - .014 * across * across
        z -= .004 * math.sin(v * math.pi) * math.sin(across * math.pi)
        return (side * .22 + across * width, y, z)
    padded_tongue = _surface(label + ' sneaker padded tongue', tongue, materials['shoe'], 24, 32)
    solid = padded_tongue.modifiers.new('Soft padded tongue thickness', 'SOLIDIFY')
    solid.thickness = .0055
    bevel = padded_tongue.modifiers.new('Rounded tongue lip', 'BEVEL')
    bevel.width, bevel.segments = .0075, 4
    result.append(padded_tongue)
    for direction in (-1, 1):
        points = [tongue(0 if direction < 0 else 1, i / 35) for i in range(36)]
        result.append(_tube(label + ' raised lace stay', points, .0075, materials['shoe'], sides=12))
    left, right = [], []
    for i in range(6):
        t = .08 + .12 * i
        a, b = tongue(.05, t), tongue(.95, t)
        a, b = (a[0], a[1], a[2] + .011), (b[0], b[1], b[2] + .011)
        left.append(a)
        right.append(b)
        result.append(_eyelet(label + ' metal lace eyelet left', a, materials['metal']))
        result.append(_eyelet(label + ' metal lace eyelet right', b, materials['metal']))
    for i in range(5):
        for a, b in ((left[i], right[i + 1]), (right[i], left[i + 1])):
            middle = tuple(_mix(a[k], b[k], .5) for k in range(3))
            middle = (middle[0], middle[1], middle[2] + .011)
            result.append(curve(label + ' separate crossed cotton lace',
                                [a, middle, b], .0041, materials['lace'], resolution=8))
    bow_center = (side * .22, -.103, tongue(.5, .7415)[2] + .017)
    result.append(ellipsoid(label + ' lace bow knot', bow_center, (.010, .009, .007),
                            materials['lace'], 24, 12))
    for direction in (-1, 1):
        x, y, z = bow_center
        points = [(x, y, z), (x + direction * .055, y + .022, z + .008),
                  (x + direction * .073, y - .003, z + .003),
                  (x + direction * .040, y - .024, z + .005), (x, y, z)]
        result.append(curve(label + ' tied lace bow loop', points, .0035, materials['lace'], resolution=8))
        result.append(curve(label + ' lace bow hanging end',
                            [(x, y, z), (x + direction * .033, y - .040, z - .006),
                             (x + direction * .052, y - .074, z - .016)], .0033, materials['lace'], resolution=8))
    pivot = Vector((side * .22, .06, 0))
    transform = (Matrix.Translation(pivot) @ Matrix.Rotation(side * math.radians(26), 4, 'Z')
                 @ Matrix.Diagonal((1, 1.09, 1, 1))
                 @ Matrix.Translation(-pivot))
    for obj in result:
        obj.matrix_world = transform @ obj.matrix_world
    return result


def build_outfit(materials, texture_dir):
    texture_dir = Path(texture_dir)
    texture_dir.mkdir(parents=True, exist_ok=True)
    palette = {'sweater': 'ed2633', 'rib': 'd8202b', 'denim': '4b79aa',
               'denim_cuff': '83a0bd', 'shoe': 'f1e7df', 'sole': 'eaded8',
               'suede': 'b5a59b'}
    for key, color in palette.items():
        materials[key].diffuse_color = (*linear_color(color), 1)
        shader = materials[key].node_tree.nodes['Principled BSDF']
        shader.inputs['Base Color'].default_value = materials[key].diffuse_color
        shader.inputs['Specular IOR Level'].default_value = .20 if key in ('sweater', 'rib', 'denim') else .28
    for key, kind in (('sweater', 'knit'), ('rib', 'rib'), ('denim', 'denim'),
                      ('denim_cuff', 'denim'), ('shoe', 'leather')):
        _fabric_texture(materials[key], kind, texture_dir)
    objects = _sweater(materials) + _jeans(materials) + _sneaker(-1, materials) + _sneaker(1, materials)
    for obj in objects:
        _polish_normals(obj)
    return objects
