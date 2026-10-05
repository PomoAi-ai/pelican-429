"""Static, full-volume garments and anatomy for the approved Grassy proportions."""

import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def _mesh(name, vertices, faces, material, part, detail=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj['grassy_part'] = part
    obj['grassy_detail'] = detail
    return obj


def _apply(obj, modifier):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def _sample_rings(rings, divisions=3):
    result = []
    for index in range(len(rings) - 1):
        a = rings[max(0, index - 1)]
        b = rings[index]
        c = rings[index + 1]
        d = rings[min(len(rings) - 1, index + 2)]
        for step in range(divisions):
            t = step / divisions
            result.append(tuple(.5 * ((2 * bv) + (-av + cv) * t
                                     + (2 * av - 5 * bv + 4 * cv - dv) * t * t
                                     + (-av + 3 * bv - 3 * cv + dv) * t * t * t)
                                for av, bv, cv, dv in zip(a, b, c, d)))
    result.append(rings[-1])
    return result


def _loft(name, rings, material, part='clothes', segments=64, folds=0, detail=0,
          divisions=3, toe_shape=False):
    contours = _sample_rings(rings, divisions)
    vertices = []
    for index, (x, y, z, rx, ry) in enumerate(contours):
        envelope = math.sin(math.pi * index / (len(contours) - 1))
        for segment in range(segments):
            angle = segment * math.tau / segments
            fold = folds * envelope * (.65 * math.sin(angle * 5 + z * 23)
                                       + .35 * math.sin(angle * 3 - z * 31))
            width = rx * (1 - .065 * math.sin(angle)) if toe_shape else rx
            lift = .014 * max(0, -math.sin(angle)) ** 8 * math.exp(-z / .10) if toe_shape else 0
            vertices.append((x + (width + fold) * math.cos(angle),
                             y + (ry + fold) * math.sin(angle), z + lift))
    faces = []
    for row in range(len(contours) - 1):
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((row * segments + segment, row * segments + nxt,
                          (row + 1) * segments + nxt, (row + 1) * segments + segment))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(contours) - 1) * segments + j for j in range(segments)))
    obj = _mesh(name, vertices, faces, material, part, detail)
    if part in ('clothes', 'cuffs'):
        uv = obj.data.uv_layers.new(name='Longitudinal weave')
        for face in obj.data.polygons:
            columns = [index % segments for index in face.vertices]
            crosses_seam = max(columns) - min(columns) > segments / 2
            for loop, index in zip(face.loop_indices, face.vertices):
                row, column = divmod(index, segments)
                if crosses_seam and column == 0:
                    column = segments
                x, y, z, rx, ry = contours[row]
                uv.data[loop].uv = (column / segments * math.tau * (rx + ry) * .5 / .21,
                                    z / .21)
    return obj


def _curve(name, points, radius, material, part='seams', detail=1, closed=False, linear=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 5
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new('POLY' if linear else 'BEZIER')
    spline.use_cyclic_u = closed
    if linear:
        spline.points.add(len(points) - 1)
        for knot, point in zip(spline.points, points):
            knot.co = (*point, 1)
    else:
        spline.bezier_points.add(len(points) - 1)
        for knot, point in zip(spline.bezier_points, points):
            knot.co = point
            knot.handle_left_type = 'AUTO'
            knot.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    obj['grassy_part'] = part
    obj['grassy_detail'] = detail
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def _fuse(name, objects, voxel_size, part):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    obj = objects[0]
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    modifier = obj.modifiers.new('Joined sculpt surface', 'REMESH')
    modifier.mode = 'VOXEL'
    modifier.voxel_size = voxel_size
    modifier.use_smooth_shade = True
    _apply(obj, modifier)
    modifier = obj.modifiers.new('Soft cloth transitions', 'SMOOTH')
    modifier.factor = .80 if part == 'clothes' else .52
    modifier.iterations = 14 if part == 'clothes' else 4
    _apply(obj, modifier)
    obj['grassy_part'] = part
    obj['grassy_detail'] = 0
    return obj


def _surface(obj):
    return BVHTree.FromPolygons([vertex.co for vertex in obj.data.vertices],
                               [tuple(face.vertices) for face in obj.data.polygons])


def _onto(surface, points, offset=.0015):
    projected = []
    for point in points:
        position, normal, _, _ = surface.find_nearest(Vector(point))
        projected.append(tuple(position + normal * offset))
    return projected


def _sample_path(points, closed=False, corners=False):
    result = []
    count = len(points) if closed else len(points) - 1
    for index in range(count):
        a = points[(index - 1) % len(points)] if closed else points[max(0, index - 1)]
        b, c = points[index], points[(index + 1) % len(points)]
        d = points[(index + 2) % len(points)] if closed else points[min(len(points) - 1, index + 2)]
        for step in range(24):
            t = step / 24
            if corners:
                result.append(tuple(bv * (1 - t) + cv * t for bv, cv in zip(b, c)))
            else:
                result.append(tuple(.5 * ((2 * bv) + (-av + cv) * t
                                         + (2 * av - 5 * bv + 4 * cv - dv) * t * t
                                         + (-av + 3 * bv - 3 * cv + dv) * t * t * t)
                                    for av, bv, cv, dv in zip(a, b, c, d)))
    if not closed:
        result.append(points[-1])
    return result


def _stitch(name, points, surface, radius, material, offset=.0008):
    samples = _onto(surface, _sample_path(points), offset)
    return _curve(name, samples, radius, material, linear=True)


def _back_points(surface, points, offset):
    result = []
    for x, _, z in points:
        position, _, _, _ = surface.ray_cast(Vector((x, 1, z)), Vector((0, -1, 0)))
        result.append((x, position.y + offset, z))
    return result


def _cloth_folds(obj, style):
    # Fold displacement fades between torso and sleeve so fused cloth stays continuous.
    def crease(distance, width, amount):
        t = distance / width
        return amount * (math.exp(-t * t) - .32 * math.exp(-((t - 1.65) / 1.1) ** 2))

    for vertex in obj.data.vertices:
        x, y, z = vertex.co
        side = 1 if x > 0 else -1
        if style == 'sweater':
            boundary = .35 - max(0, z - 1.62) * .13
            blend = min(1, max(0, (abs(x) - boundary + .04) / .08))
            blend = blend * blend * (3 - 2 * blend)
            torso_angle = math.atan2(y / .28, x / .35)
            face = abs(math.sin(torso_angle)) ** 3
            torso_fold = .012 * math.exp(-((z - 1.365 - .018 * math.sin(torso_angle * 2 + .7)) / .033) ** 2)
            for origin, lean, amount in ((-.24, -.43, .021), (.23, .58, .024),
                                         (-.08, -.19, -.012), (.10, .22, .008)):
                torso_fold += crease(x - origin - lean * (z - 1.38), .038, amount) * face * math.exp(-((z - 1.45) / .13) ** 2)
            torso_fold += crease(z - 1.435 + .23 * x, .032, .014) * face * math.exp(-((x + .06) / .23) ** 2)
            torso_fold += crease(z - 1.562 + .40 * abs(x), .034, -.012) * face * math.exp(-((abs(x) - .27) / .10) ** 2)
            center = math.copysign(.52 - (z - 1.3) * .40, x)
            sleeve_angle = math.atan2(y / .15, (x - center) / .13)
            around = .10 + .90 * max(0, -math.sin(sleeve_angle + side * .55)) ** 2
            sleeve_fold = crease(z - 1.331 - .30 * (x - center) - .19 * y, .022, .020) * around
            sleeve_fold += crease(z - 1.405 + .39 * (x - center) + .28 * y + side * .013, .028, .014) * around
            sleeve_fold += crease(z - 1.525 - .44 * y, .034, .010) * max(0, -math.sin(sleeve_angle)) ** 4
            sleeve_fold += crease(z - 1.610 - .40 * y, .045, -.008) * max(0, math.sin(sleeve_angle)) ** 3
            vertex.co.x += torso_fold * math.cos(torso_angle) * (1 - blend) + sleeve_fold * math.cos(sleeve_angle) * blend
            vertex.co.y += torso_fold * math.sin(torso_angle) * (1 - blend) + sleeve_fold * math.sin(sleeve_angle) * blend
            continue
        else:
            center = math.copysign(.247 - max(0, z - .45) * .045, x)
            angle = math.atan2(y / .17, (x - center) / .16)
            local = (x - center) * side
            front = max(0, -math.sin(angle)) ** 3
            back = max(0, math.sin(angle)) ** 3
            outer = max(0, math.cos(angle) * side) ** 4
            fold = crease(z - .474 + local * .56 + side * .014, .028, .023) * (.75 * front + .30 * outer)
            fold += crease(z - .566 - local * .77 - side * .016, .030, .018) * front * math.exp(-((local - .025) / .14) ** 2)
            fold += crease(z - .735 + local * .36, .038, -.011) * back
            fold += crease(z - .810 - local * .47 + side * .015, .037, .009) * front
            fold += crease(z - 1.047 + local * .62, .039, .007) * front
            fold += crease(z - 1.128 - local * .35, .036, -.004) * front
            fold += crease(z - 1.035 - local * .29, .041, -.006) * back
        vertex.co.x += fold * math.cos(angle)
        vertex.co.y += fold * math.sin(angle)
    obj.data.update()


def _cloth_uv(obj, style):
    uv = obj.data.uv_layers.new(name='Garment weave')
    for face in obj.data.polygons:
        center = face.center
        samples = []
        for vertex_index in face.vertices:
            x, y, z = obj.data.vertices[vertex_index].co
            if style == 'denim':
                blend = min(1, max(0, (z - 1.005) / .20))
                blend = blend * blend * (3 - 2 * blend)
                cx = math.copysign(.247 - max(0, z - .45) * .045, center.x) * (1 - blend)
                radius = .165 * (1 - blend) + .32 * blend
                tile_width, tile_height = .21, .21
            else:
                boundary = .35 - max(0, z - 1.62) * .13
                blend = min(1, max(0, (abs(x) - boundary + .055) / .11))
                blend = blend * blend * (3 - 2 * blend)
                cx = math.copysign(.52 - (z - 1.3) * .40, center.x) * blend
                radius = .326 * (1 - blend) + .143 * blend
                tile_width, tile_height = .24, .144
            angle = math.atan2(x - cx, -y)
            samples.append((angle, z, radius, tile_width, tile_height))
        if max(item[0] for item in samples) - min(item[0] for item in samples) > math.pi:
            samples = [(a + math.tau if a < 0 else a, z, r, tw, th) for a, z, r, tw, th in samples]
        for loop_index, (angle, z, radius, width, height) in zip(face.loop_indices, samples):
            uv.data[loop_index].uv = ((angle + math.pi) * radius / width, z / height)


def _crew_collar(material):
    # The collar follows the shoulder slope rather than sitting above the neck.
    profile = [(.121, .110, 2.042), (.125, .114, 2.045),
               (.151, .133, 2.032), (.183, .158, 2.004),
               (.192, .166, 1.993), (.185, .161, 1.989),
               (.146, .129, 2.028), (.123, .110, 2.038)]
    columns, rows = 256, len(profile)
    vertices, faces = [], []
    for column in range(columns):
        angle = column * math.tau / columns
        for width, depth, height in profile:
            rib = .0007 * math.cos(angle * 64)
            vertices.append(((width + rib) * math.cos(angle),
                             .003 + (depth + rib) * math.sin(angle),
                             height + .026 * math.sin(angle) + rib * .45))
    for column in range(columns):
        for row in range(rows):
            a = column * rows + row
            faces.append((a, ((column + 1) % columns) * rows + row,
                          ((column + 1) % columns) * rows + (row + 1) % rows,
                          column * rows + (row + 1) % rows))
    obj = _mesh('Sweater soft open crew neckline', vertices, faces, material, 'ribbing')
    uv = obj.data.uv_layers.new(name='Collar rib weave')
    for face in obj.data.polygons:
        columns_on_face = [index // rows for index in face.vertices]
        for loop, index in zip(face.loop_indices, face.vertices):
            column, row = divmod(index, rows)
            if max(columns_on_face) - min(columns_on_face) > columns / 2 and column == 0:
                column = columns
            uv.data[loop].uv = (column / columns * 8, row / rows)
    return obj


def _rib_band(name, center, width, depth, height, ribs, material, lean=0):
    x, y, z = center
    ring_profile = [(-.5, .95), (-.40, 1), (-.22, 1.014),
                    (.22, 1.014), (.40, 1), (.5, .95)]
    segments = ribs * 5
    vertices = []
    for row, (offset, fullness) in enumerate(ring_profile):
        for segment in range(segments):
            angle = segment * math.tau / segments
            ridge = .0018 * (.5 + .5 * math.cos(angle * ribs))
            vertices.append((x + offset * height * lean
                             + (width * fullness + ridge) * math.cos(angle),
                             y + (depth * fullness + ridge) * math.sin(angle),
                             z + offset * height))
    faces = []
    for row in range(len(ring_profile) - 1):
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((row * segments + segment, row * segments + nxt,
                          (row + 1) * segments + nxt, (row + 1) * segments + segment))
    faces += [tuple(reversed(range(segments))),
              tuple((len(ring_profile) - 1) * segments + j for j in range(segments))]
    obj = _mesh(name, vertices, faces, material, 'ribbing')
    uv = obj.data.uv_layers.new(name='Rib knit direction')
    for face in obj.data.polygons:
        for loop, index in zip(face.loop_indices, face.vertices):
            row, column = divmod(index, segments)
            uv.data[loop].uv = (column / segments * ribs / 8, row / (len(ring_profile) - 1))
    return obj


def _sweater(materials):
    torso = [(0, .010, 1.292, .324, .232), (0, .002, 1.342, .349, .250),
             (0, -.003, 1.395, .356, .258), (0, -.003, 1.493, .343, .246),
             (0, .002, 1.635, .318, .226), (0, .007, 1.780, .325, .232),
             (0, .010, 1.873, .317, .232), (0, .009, 1.933, .277, .205),
             (0, .006, 1.997, .191, .158), (0, .003, 2.038, .121, .108)]
    main = _loft('Sweater torso sculpt', torso, materials['sweater'], segments=96, divisions=5)
    for vertex in main.data.vertices:
        if vertex.co.z > 1.87:
            angle = math.atan2(vertex.co.y / .15, vertex.co.x / .18)
            vertex.co.z += .026 * math.sin(angle) * min(1, (vertex.co.z - 1.87) / .11)
    pieces = [main]
    for label, sign in (('Left', 1), ('Right', -1)):
        sleeve = [(sign * .503, -.006, 1.259, .094, .105),
                  (sign * .501, -.009, 1.320, .124, .137),
                  (sign * .490, -.008, 1.360, .134, .148),
                  (sign * .474, -.004, 1.422, .129, .144),
                  (sign * .449, .004, 1.497, .125, .143),
                  (sign * .418, .013, 1.602, .136, .149),
                  (sign * .377, .009, 1.718, .145, .156),
                  (sign * .316, -.001, 1.824, .145, .161),
                  (sign * .244, -.002, 1.902, .118, .150),
                  (sign * .177, .002, 1.954, .081, .113),
                  (sign * .119, .003, 1.988, .057, .094)]
        pieces.append(_loft(f'{label} gathered sleeve sculpt', sleeve, materials['sweater'],
                            segments=72, divisions=5))
    objects = [_fuse('Grassy continuous sweater', pieces, .0045, 'clothes')]
    _cloth_folds(objects[0], 'sweater')
    _cloth_uv(objects[0], 'sweater')
    objects.append(_rib_band('Sweater ribbed waist', (0, .008, 1.297),
                             .332, .235, .087, 76, materials['sweater_rib']))
    objects.append(_crew_collar(materials['sweater_rib']))
    objects.append(_loft('Grassy short neck', [(0, .013, 1.958, .108, .104),
                                              (0, .014, 2.017, .111, .107),
                                              (0, .023, 2.080, .117, .112),
                                              (0, .033, 2.151, .130, .125)],
                         materials['skin'], 'body', segments=64))
    for label, sign in (('Left', 1), ('Right', -1)):
        objects.append(_rib_band(f'{label} sweater cuff', (sign * .510, -.005, 1.258),
                                 .101, .113, .104, 36, materials['sweater_rib'], -sign * .17))
        shoulder = [(sign * .271, -.127, 1.910), (sign * .330, -.178, 1.866),
                    (sign * .376, -.179, 1.802), (sign * .402, -.147, 1.740)]
        objects.append(_stitch(f'{label} sweater shoulder stitching', shoulder,
                               _surface(objects[0]), .00045, materials['sweater']))
    return objects


def _pocket(name, points, materials, surface):
    center = tuple(sum(point[axis] for point in points) / len(points) for axis in range(3))
    boundary = _sample_path(points, closed=True, corners=True)
    vertices = _back_points(surface, [center], .006)
    ring_count = len(boundary)
    for ring in range(1, 5):
        factor = ring / 4
        contour = [tuple(cv * (1 - factor) + pv * factor for cv, pv in zip(center, point))
                   for point in boundary]
        vertices.extend(_back_points(surface, contour, .004 + .002 * (1 - factor)))
    faces = [(0, index + 1, (index + 1) % ring_count + 1) for index in range(ring_count)]
    for ring in range(3):
        for index in range(ring_count):
            nxt = (index + 1) % ring_count
            a = 1 + ring * ring_count
            faces.append((a + index, a + ring_count + index, a + ring_count + nxt, a + nxt))
    patch = _mesh(name, vertices, faces, materials['denim'], 'clothes')
    solidify = patch.modifiers.new('Denim patch thickness', 'SOLIDIFY')
    solidify.thickness = .003
    _apply(patch, solidify)
    inset = [tuple(cv * .075 + pv * .925 for cv, pv in zip(center, point)) for point in points]
    seam_points = _back_points(surface, _sample_path(inset, closed=True, corners=True), .006)
    seam = _curve(f'{name} fine stitching', seam_points, .0012,
                  materials['stitch'], closed=True, linear=True)
    top = _back_points(surface, _sample_path(points[:2], corners=True), .0075)
    lip = _curve(f'{name} top folded opening', top, .0031,
                 materials['denim'], 'clothes', 0, linear=True)
    return [patch, seam, lip]


def _jeans(materials):
    pelvis = [(0, .018, 1.066, .030, .100), (0, .015, 1.089, .148, .170),
              (0, .013, 1.128, .294, .199),
              (0, .011, 1.163, .334, .214), (0, .009, 1.226, .339, .220),
              (0, .008, 1.310, .322, .206)]
    pieces = [_loft('Jeans hips sculpt', pelvis, materials['denim'], segments=80, divisions=5)]
    for label, sign in (('Left', 1), ('Right', -1)):
        leg = [(sign * .247, .007, .365, .153, .150),
               (sign * .247, .003, .423, .161, .163),
               (sign * .246, -.001, .474, .169, .172),
               (sign * .240, .003, .546, .165, .169),
               (sign * .233, .002, .648, .163, .170),
               (sign * .229, -.006, .750, .167, .174),
               (sign * .225, -.009, .852, .173, .182),
               (sign * .217, .003, .978, .172, .189),
               (sign * .202, .010, 1.078, .180, .199),
               (sign * .181, .009, 1.184, .174, .204),
               (sign * .164, .009, 1.252, .161, .192),
               (sign * .145, .008, 1.320, .140, .171)]
        pieces.append(_loft(f'{label} jeans leg sculpt', leg, materials['denim'],
                            segments=80, divisions=5))
    objects = [_fuse('Grassy continuous jeans', pieces, .0048, 'clothes')]
    _cloth_folds(objects[0], 'denim')
    _cloth_uv(objects[0], 'denim')
    surface = _surface(objects[0])
    for label, sign in (('Left', 1), ('Right', -1)):
        x = sign * .247
        cuff = [(x, .005, .307, .157, .151), (x, .005, .321, .173, .168),
                (x, .005, .345, .176, .171), (x, .005, .392, .175, .171),
                (x, .005, .425, .172, .168), (x, .005, .440, .157, .152)]
        cuff_obj = _loft(f'{label} rolled denim cuff', cuff, materials['denim_cuff'],
                         part='cuffs', folds=.0015, segments=80)
        for vertex in cuff_obj.data.vertices:
            angle = math.atan2((vertex.co.y - .005) / .17, (vertex.co.x - x) / .18)
            vertex.co.z += .011 * math.sin(angle + sign * .6) + .002 * math.cos(angle * 2 + .4)
        objects.append(cuff_obj)
        cuff_edge = [(x + .171 * math.cos(t * math.tau / 36),
                      .005 + .167 * math.sin(t * math.tau / 36), .332) for t in range(36)]
        objects.append(_stitch(f'{label} cuff rolled edge', cuff_edge, _surface(cuff_obj),
                               .0015, materials['denim_cuff'], offset=.0002))
        side_seam = [(sign * .417, .008, .428), (sign * .419, .008, .456),
                     (sign * .402, .008, .492), (sign * .384, .009, .618),
                     (sign * .383, .010, .747), (sign * .384, .017, .950),
                     (sign * .373, .028, 1.100), (sign * .337, .012, 1.260)]
        objects.append(_stitch(f'{label} jeans outside seam', side_seam, surface, .0013, materials['stitch'], offset=.0005))
        objects.append(_stitch(f'{label} jeans paired outside stitch', [(px, py - .007, pz) for px, py, pz in side_seam],
                               surface, .0009, materials['stitch'], offset=.0005))
        cuff_seam = [(sign * .421, .007, .321), (sign * .427, .007, .368),
                     (sign * .425, .007, .412), (sign * .417, .007, .448)]
        objects.append(_stitch(f'{label} cuff outside seam', cuff_seam, _surface(cuff_obj), .0011, materials['stitch'], offset=.0006))
        front = []
        for step in range(31):
            t = step / 30
            px = sign * (.305 - .135 * t)
            pz = 1.281 - .091 * math.sin(t * math.pi / 2)
            position, normal, _, _ = surface.ray_cast(Vector((px, -1, pz)), Vector((0, 1, 0)))
            front.append(tuple(position + normal * .0008))
        objects.append(_stitch(f'{label} jeans front pocket seam', front, surface,
                               .0014, materials['stitch'], offset=.0005))
        objects.append(_curve(f'{label} jeans pocket welt', front,
                              .0014, materials['denim'], linear=True))
        front_inner = [(px * .982, py, pz - .006) for px, py, pz in front]
        objects.append(_stitch(f'{label} jeans front pocket inner stitch', front_inner, surface,
                               .0010, materials['stitch'], offset=.0005))
        back = [(sign * .092, .225, 1.225), (sign * .298, .195, 1.225),
                (sign * .289, .197, 1.086), (sign * .199, .224, 1.038),
                (sign * .101, .228, 1.086)]
        if sign == -1:
            back = [back[1], back[0], back[4], back[3], back[2]]
        objects.extend(_pocket(f'{label} jeans rear patch pocket', back, materials, surface))
        inset = [(sign * .108, .232, 1.212), (sign * .283, .205, 1.212)]
        objects.append(_curve(f'{label} rear pocket top stitch',
                              _back_points(surface, _sample_path(inset), .006), .001,
                              materials['stitch'], linear=True))
        inner = [(sign * .078, -.034, 1.016), (sign * .078, -.051, .835),
                 (sign * .085, -.057, .608), (sign * .089, -.059, .436)]
        objects.append(_stitch(f'{label} jeans inner seam', inner, surface, .0007, materials['stitch']))
    objects.append(_curve('Jeans rear yoke double seam',
                          _back_points(surface, _sample_path([(-.29, .19, 1.26),
                                                               (0, .23, 1.22),
                                                               (.29, .19, 1.26)]), .002),
                          .0009, materials['stitch'], linear=True))
    objects.append(_stitch('Jeans fly stitching', [(0, -.222, 1.275), (.041, -.229, 1.239),
                                                (.042, -.231, 1.133), (.007, -.218, 1.108)],
                           surface, .0014, materials['stitch']))
    return objects


def _finger(name, points, radii, material):
    samples = _sample_rings([(*point, radius) for point, radius in zip(points, radii)], 6)
    vertices = []
    segments = 28
    for index, sample in enumerate(samples):
        center = Vector(sample[:3])
        previous = Vector(samples[max(0, index - 1)][:3])
        following = Vector(samples[min(len(samples) - 1, index + 1)][:3])
        tangent = (following - previous).normalized()
        u = tangent.cross(Vector((0, 1, 0))).normalized()
        v = tangent.cross(u).normalized()
        for segment in range(segments):
            angle = segment * math.tau / segments
            vertices.append(tuple(center + sample[3] * (u * math.cos(angle) + .86 * v * math.sin(angle))))
    faces = []
    for row in range(len(samples) - 1):
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((row * segments + segment, row * segments + nxt,
                          (row + 1) * segments + nxt, (row + 1) * segments + segment))
    faces.extend([tuple(reversed(range(segments))),
                  tuple((len(samples) - 1) * segments + j for j in range(segments))])
    return _mesh(name, vertices, faces, material, 'hands')


def _hands(materials):
    objects = []
    for label, sign in (('Left', 1), ('Right', -1)):
        palm = _loft(f'{label} palm sculpt', [(0, -.004, 1.052, .032, .018),
                    (0, -.004, 1.073, .069, .032), (0, -.003, 1.102, .077, .038),
                    (-.003, -.003, 1.143, .075, .041),
                    (-.008, -.002, 1.178, .065, .040), (-.014, -.001, 1.214, .055, .038),
                    (-.019, 0, 1.247, .052, .041)],
                    materials['skin'], 'hands', segments=64, divisions=5)
        pieces = [palm]
        digits = [(-.051, .171, .021, .029), (-.017, .180, .022, .035),
                  (.019, .167, .021, .041), (.051, .143, .019, .050)]
        nails = []
        for index, (offset, length, radius, curl) in enumerate(digits):
            spread = (index - 1.5) * .004
            points = [(offset, .002, 1.113), (offset + spread, .003, 1.074),
                      (offset + spread, -curl * .15, 1.112 - length * .43),
                      (offset + spread - .002, -curl * .47, 1.112 - length * .68),
                      (offset + spread - .006, -curl * .84, 1.112 - length * .85),
                      (offset + spread - .009, -curl, 1.112 - length * .92)]
            pieces.append(_finger(f'{label} finger {index + 1}', points,
                                  [radius * 1.11, radius, radius * .93, radius * .87,
                                   radius * .85, .0015],
                                  materials['skin']))
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12,
                                                location=(offset + spread - .003, -curl * .72 + radius * .70,
                                                          1.112 - length * .77))
            nail = bpy.context.object
            nail.name = f'{label} softly inset fingernail {index + 1}'
            nail.scale = (radius * .57, .0023, length * .085)
            nail.rotation_euler.x = -.64
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            nail.data.materials.append(materials['skin_nail'])
            nail['grassy_part'], nail['grassy_detail'] = 'hands', 1
            for face in nail.data.polygons:
                face.use_smooth = True
            nails.append(nail)
        pieces.append(_finger(f'{label} thumb', [(-.047, -.006, 1.184), (-.075, -.018, 1.163),
                                                (-.106, -.040, 1.127), (-.107, -.062, 1.097),
                                                (-.094, -.075, 1.088)],
                              [.034, .031, .027, .023, .002], materials['skin']))
        hand = _fuse(f'Grassy {label.lower()} hand', pieces, .0021, 'hands')
        for item in [hand, *nails]:
            for vertex in item.data.vertices:
                x, y, z = vertex.co
                x *= 1.26
                y *= 1.29
                vertex.co = (sign * (.533 + x * .766 + y * .643),
                             -.012 - x * .643 + y * .766, 1.247 - (1.247 - z) * 1.16)
            if sign < 0:
                item.data.flip_normals()
            objects.append(item)
    return objects


def _shoe_ring(rings, z):
    contours = _sample_rings(rings)
    for index in range(len(contours) - 1):
        a, b = contours[index], contours[index + 1]
        if a[2] <= z <= b[2]:
            t = (z - a[2]) / (b[2] - a[2])
            return tuple(av * (1 - t) + bv * t for av, bv in zip(a, b))
    raise ValueError(f'Shoe panel height {z} lies outside the upper contour')


def _shoe_panel(label, x, sign, rings, materials):
    vertices = []
    rows, columns = 12, 10
    for row in range(rows + 1):
        z = .105 + row / rows * .117
        _, center_y, _, rx, ry = _shoe_ring(rings, z)
        for column in range(columns + 1):
            angle = -.39 + column / columns * .65 + row / rows * .14
            vertices.append((x + sign * (rx * (1 - .065 * math.sin(angle)) * math.cos(angle) + .0018),
                             center_y + ry * math.sin(angle), z))
    faces = []
    for row in range(rows):
        for column in range(columns):
            a = row * (columns + 1) + column
            face = (a, a + 1, a + columns + 2, a + columns + 1)
            faces.append(face if sign == 1 else tuple(reversed(face)))
    panel = _mesh(f'{label} sneaker taupe side panel {sign}', vertices, faces,
                  materials['shoe_trim'], 'shoes')
    solidify = panel.modifiers.new('Leather panel thickness', 'SOLIDIFY')
    solidify.thickness = .002
    _apply(panel, solidify)
    boundary = [vertices[column] for column in range(columns + 1)]
    boundary += [vertices[row * (columns + 1) + columns] for row in range(1, rows + 1)]
    boundary += [vertices[rows * (columns + 1) + column] for column in range(columns - 1, -1, -1)]
    boundary += [vertices[row * (columns + 1)] for row in range(rows - 1, 0, -1)]
    seam = _curve(f'{label} side panel stitching {sign}',
                  [(px + sign * .002, py, pz) for px, py, pz in boundary[::3]],
                  .0009, materials['shoe_lace'], closed=True)
    return [panel, seam]


def _shoe_top(surface, x, y, offset=0):
    position, _, _, _ = surface.ray_cast(Vector((x, y, .8)), Vector((0, 0, -1)))
    return (x, y, position.z + offset)


def _lace(name, points, material, width=.0075, thickness=.0013):
    samples = _sample_path(points)
    vertices, faces = [], []
    segments = 12
    for index, point in enumerate(samples):
        center = Vector(point)
        tangent = (Vector(samples[min(len(samples) - 1, index + 1)])
                   - Vector(samples[max(0, index - 1)])).normalized()
        across = Vector((0, 0, 1)).cross(tangent).normalized()
        normal = tangent.cross(across).normalized()
        for segment in range(segments):
            a = segment * math.tau / segments
            vertices.append(tuple(center + across * width * math.cos(a)
                                  + normal * thickness * math.sin(a)))
    for row in range(len(samples) - 1):
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((row * segments + segment, row * segments + nxt,
                          (row + 1) * segments + nxt, (row + 1) * segments + segment))
    faces += [tuple(reversed(range(segments))),
              tuple((len(samples) - 1) * segments + column for column in range(segments))]
    return _mesh(name, vertices, faces, material, 'seams')


def _eyestay(label, x, sign, surface, materials):
    vertices, faces = [], []
    rows, columns = 20, 6
    for row in range(rows + 1):
        t = row / rows
        y = -.284 + t * .229
        for column in range(columns + 1):
            width = .025 * math.sin(math.pi * t) ** .20 + .012
            px = x + sign * (.054 + column / columns * width)
            vertices.append(_shoe_top(surface, px, y, .009))
    for row in range(rows):
        for column in range(columns):
            a = row * (columns + 1) + column
            face = (a, a + 1, a + columns + 2, a + columns + 1)
            faces.append(face if sign > 0 else tuple(reversed(face)))
    panel = _mesh(f'{label} sneaker folded leather eyestay {sign}', vertices, faces,
                  materials['shoe'], 'shoes')
    solidify = panel.modifiers.new('Eyestay leather thickness', 'SOLIDIFY')
    solidify.thickness = .004
    _apply(panel, solidify)
    edge = [vertices[row * (columns + 1) + columns] for row in range(rows + 1)]
    stitches = _curve(f'{label} eyestay stitches {sign}',
                       [(px, py, pz + .0015) for px, py, pz in edge], .0007,
                       materials['shoe_trim'])
    objects = [panel, stitches]
    for row in range(4):
        y = -.250 + row * .047
        ring = [_shoe_top(surface, x + sign * .065 + .005 * math.cos(a * math.tau / 16),
                          y + .005 * math.sin(a * math.tau / 16), .013)
                for a in range(16)]
        objects.append(_curve(f'{label} punched lace eyelet {sign} {row}', ring, .0011,
                              materials['shoe_trim'], 'micro_seams', closed=True))
    return objects


def _shoes(materials):
    objects = []
    for label, sign in (('Left', 1), ('Right', -1)):
        x = sign * .247
        sole = [(x, -.150, 0, .165, .302), (x, -.150, .009, .178, .321),
                (x, -.150, .022, .183, .327), (x, -.150, .029, .183, .327)]
        objects.append(_loft(f'{label} sneaker rubber sole', sole, materials['sole'], 'shoes',
                             segments=96, toe_shape=True))
        foxing = [(x, -.150, .024, .181, .324), (x, -.150, .034, .185, .329),
                  (x, -.150, .064, .183, .326), (x, -.150, .078, .176, .315)]
        objects.append(_loft(f'{label} sneaker rounded foxing band', foxing, materials['shoe'],
                             'shoes', segments=96, toe_shape=True))
        upper = [(x, -.150, .068, .173, .300), (x, -.148, .098, .178, .298),
                 (x, -.139, .140, .171, .276), (x, -.111, .185, .154, .242),
                 (x, -.063, .224, .134, .196), (x, -.012, .259, .108, .125),
                 (x, .009, .282, .092, .093)]
        upper_obj = _loft(f'{label} sneaker leather upper', upper, materials['shoe'], 'shoes',
                          segments=96, divisions=5, toe_shape=True)
        objects.append(upper_obj)
        surface = _surface(upper_obj)
        objects.append(_loft(f'{label} ankle', [(x, .012, .214, .078, .080),
                                              (x, .012, .286, .092, .092),
                                              (x, .010, .370, .105, .100)],
                             materials['skin'], 'body', segments=48))
        collar = [(x + .098 * math.cos(t * math.tau / 40),
                   .014 + .096 * math.sin(t * math.tau / 40),
                   .270 + .010 * math.sin(t * math.tau / 40)) for t in range(40)]
        objects.append(_curve(f'{label} sneaker padded collar', collar, .013,
                              materials['shoe'], 'shoes', 0, closed=True))
        for outward in (-1, 1):
            objects.extend(_shoe_panel(label, x, outward, upper, materials))
            objects.extend(_eyestay(label, x, outward, surface, materials))
        tongue, faces = [], []
        for row in range(15):
            y = -.278 + row / 14 * .211
            for column in range(9):
                px = x + (column / 8 - .5) * .137
                tongue.append(_shoe_top(surface, px, y, .012 + .004 * math.sin(column / 8 * math.pi)))
        for row in range(14):
            for column in range(8):
                a = row * 9 + column
                faces.append((a, a + 1, a + 10, a + 9))
        tongue_obj = _mesh(f'{label} sneaker tongue', tongue, faces,
                           materials['shoe'], 'shoes')
        solidify = tongue_obj.modifiers.new('Tongue padded thickness', 'SOLIDIFY')
        solidify.thickness = .008
        _apply(tongue_obj, solidify)
        bevel = tongue_obj.modifiers.new('Tongue rounded edge', 'BEVEL')
        bevel.width = .004
        bevel.segments = 3
        _apply(tongue_obj, bevel)
        objects.append(tongue_obj)
        for edge in (-1, 1):
            tongue_edge = [_shoe_top(surface, x + edge * .068, -.275 + row / 12 * .202, .014)
                           for row in range(13)]
            objects.append(_curve(f'{label} tongue edge stitching {edge}', tongue_edge,
                                  .0008, materials['shoe_trim']))
        for row in range(4):
            y = -.250 + row * .047
            for diagonal in (-1, 1):
                lace = [_shoe_top(surface, x - .065, y, .019),
                        _shoe_top(surface, x, y + diagonal * .015, .027 + diagonal * .003),
                        _shoe_top(surface, x + .065, y + diagonal * .025, .019)]
                objects.append(_lace(f'{label} flat woven sneaker lace {row + 1} {diagonal}', lace,
                                     materials['shoe_lace']))
        bow_y = -.085
        for loop in (-1, 1):
            bow = [_shoe_top(surface, x, bow_y, .041),
                   _shoe_top(surface, x + loop * .064, bow_y + .025, .047),
                   _shoe_top(surface, x + loop * .079, bow_y - .005, .041),
                   _shoe_top(surface, x, bow_y, .041)]
            objects.append(_lace(f'{label} tied lace loop {loop}', bow, materials['shoe_lace'], .005))
            end = [_shoe_top(surface, x, bow_y, .039),
                   _shoe_top(surface, x + loop * .020, bow_y - .047, .047),
                   _shoe_top(surface, x + loop * .047, bow_y - .093, .032)]
            objects.append(_lace(f'{label} loose lace end {loop}', end, materials['shoe_lace'], .0046))
        toe_trim = [(x + .160 * math.cos(angle), -.154 + .290 * math.sin(angle),
                     .113 + .015 * math.cos(angle) ** 2)
                    for angle in [math.pi + t * math.pi / 32 for t in range(33)]]
        objects.append(_curve(f'{label} sneaker toe stitching', _onto(surface, toe_trim, .0010), .0010,
                              materials['shoe_lace']))
        sole_edge = [(x + .183 * (1 - .065 * math.sin(t * math.tau / 48)) * math.cos(t * math.tau / 48),
                      -.150 + .325 * math.sin(t * math.tau / 48),
                      .046 + .008 * max(0, -math.sin(t * math.tau / 48)) ** 8) for t in range(48)]
        objects.append(_curve(f'{label} sneaker sole seam', sole_edge, .0014,
                              materials['shoe'], closed=True))
        heel, heel_faces = [], []
        heel_profile = [(.103, .046), (.111, .061), (.140, .063),
                        (.174, .059), (.203, .047), (.216, .028)]
        for z, width in heel_profile:
            row_points = [(x + (column / 8 * 2 - 1) * width, .2, z) for column in range(9)]
            heel.extend(_back_points(surface, row_points, .003))
        for row in range(len(heel_profile) - 1):
            for column in range(8):
                a = row * 9 + column
                heel_faces.append((a, a + 9, a + 10, a + 1))
        heel_tab = _mesh(f'{label} sneaker heel tab', heel, heel_faces,
                         materials['shoe_trim'], 'shoes')
        solidify = heel_tab.modifiers.new('Heel leather thickness', 'SOLIDIFY')
        solidify.thickness = .003
        _apply(heel_tab, solidify)
        objects.append(heel_tab)
        heel_boundary = [heel[column] for column in range(9)]
        heel_boundary += [heel[row * 9 + 8] for row in range(1, len(heel_profile))]
        heel_boundary += [heel[(len(heel_profile) - 1) * 9 + column] for column in range(7, -1, -1)]
        heel_boundary += [heel[row * 9] for row in range(len(heel_profile) - 2, 0, -1)]
        objects.append(_curve(f'{label} heel tab fine sewing',
                              [(px, py + .0015, pz) for px, py, pz in heel_boundary], .0009,
                              materials['shoe_lace'], closed=True))
    for obj in objects:
        for vertex in obj.data.vertices:
            vertex.co.y = .012 + (vertex.co.y - .012) * .91
            vertex.co.z *= 1.065
    return objects


def build_body(materials):
    """Build the stationary body in meters/tiles, with soles at Z=0."""
    return _sweater(materials) + _jeans(materials) + _hands(materials) + _shoes(materials)
