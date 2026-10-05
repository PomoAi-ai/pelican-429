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
    """Interpolate profile contours, keeping the garment silhouette continuous."""
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
            width = rx * (1 - .12 * math.sin(angle)) if toe_shape else rx
            vertices.append((x + (width + fold) * math.cos(angle),
                             y + (ry + fold) * math.sin(angle), z))
    faces = []
    for row in range(len(contours) - 1):
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((row * segments + segment, row * segments + nxt,
                          (row + 1) * segments + nxt, (row + 1) * segments + segment))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(contours) - 1) * segments + j for j in range(segments)))
    return _mesh(name, vertices, faces, material, part, detail)


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
    modifier.factor = .52
    modifier.iterations = 9 if part == 'clothes' else 4
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
    for vertex in obj.data.vertices:
        x, y, z = vertex.co
        if style == 'sweater':
            torso = abs(x) < .36
            center = 0 if torso else math.copysign(.52 - (z - 1.3) * .40, x)
            rx, ry = (.35, .30) if torso else (.13, .15)
            angle = math.atan2(y / ry, (x - center) / rx)
            if torso:
                fold = .021 * math.exp(-((z - 1.355 - .022 * math.cos(angle * 5)) / .027) ** 2)
                fold -= .010 * math.exp(-((z - 1.403 - .035 * math.cos(angle * 3)) / .027) ** 2)
                fold += .009 * math.exp(-((z - 1.487 - .055 * math.cos(angle * 2)) / .055) ** 2)
            else:
                fold = .018 * math.exp(-((z - 1.351 - .027 * math.sin(angle * 2)) / .025) ** 2)
                fold -= .010 * math.exp(-((z - 1.420 - .028 * math.cos(angle * 2)) / .025) ** 2)
                fold += .009 * math.exp(-((z - 1.494 - .034 * math.sin(angle)) / .032) ** 2)
        else:
            center = math.copysign(.247 - max(0, z - .45) * .045, x)
            angle = math.atan2(y / .17, (x - center) / .16)
            fold = .017 * math.exp(-((z - .462 - .030 * math.sin(angle * 2)) / .027) ** 2)
            fold -= .010 * math.exp(-((z - .514 - .043 * math.sin(angle)) / .024) ** 2)
            fold += .010 * math.exp(-((z - .655 - .039 * math.cos(angle * 2)) / .035) ** 2)
            fold -= .006 * math.exp(-((z - .703 - .044 * math.sin(angle)) / .028) ** 2)
            fold += .008 * math.exp(-((z - .944 - .035 * math.sin(angle)) / .035) ** 2)
        vertex.co.x += fold * math.cos(angle)
        vertex.co.y += fold * math.sin(angle)
    obj.data.update()


def _rib_band(name, center, width, depth, height, ribs, material, lean=0):
    x, y, z = center
    ring_profile = [(-.5, .95), (-.40, 1), (-.22, 1.014),
                    (.22, 1.014), (.40, 1), (.5, .95)]
    segments = ribs * 5
    vertices = []
    for row, (offset, fullness) in enumerate(ring_profile):
        for segment in range(segments):
            angle = segment * math.tau / segments
            ridge = .0031 * (.5 + .5 * math.cos(angle * ribs))
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
    return _mesh(name, vertices, faces, material, 'ribbing')


def _sweater(materials):
    torso = [(0, .010, 1.292, .324, .250), (0, .005, 1.330, .355, .280),
             (0, .002, 1.385, .366, .301), (0, 0, 1.485, .348, .284),
             (0, .003, 1.635, .330, .264), (0, .008, 1.790, .335, .263),
             (0, .011, 1.875, .324, .249), (0, .010, 1.940, .271, .216),
             (0, .007, 1.986, .187, .161), (0, .003, 2.024, .126, .126)]
    pieces = [_loft('Sweater torso sculpt', torso, materials['sweater'], folds=.007)]
    for label, sign in (('Left', 1), ('Right', -1)):
        sleeve = [(sign * .503, -.006, 1.259, .094, .108),
                  (sign * .502, -.004, 1.318, .133, .149),
                  (sign * .493, -.002, 1.356, .139, .153),
                  (sign * .478, .000, 1.406, .124, .143),
                  (sign * .453, .003, 1.482, .136, .152),
                  (sign * .421, .010, 1.597, .143, .159),
                  (sign * .378, .011, 1.722, .149, .166),
                  (sign * .326, .011, 1.830, .158, .166),
                  (sign * .262, .010, 1.906, .143, .158),
                  (sign * .194, .007, 1.950, .095, .118)]
        pieces.append(_loft(f'{label} gathered sleeve sculpt', sleeve, materials['sweater'],
                            segments=56, folds=.0075))
    objects = [_fuse('Grassy continuous sweater', pieces, .0085, 'clothes')]
    _cloth_folds(objects[0], 'sweater')
    objects.append(_rib_band('Sweater ribbed waist', (0, .008, 1.297),
                             .334, .250, .087, 76, materials['sweater_rib']))
    objects.append(_rib_band('Sweater rounded collar', (0, .003, 2.011),
                             .137, .137, .068, 48, materials['sweater_rib']))
    objects.append(_loft('Grassy short neck', [(0, .013, 1.970, .110, .112),
                                              (0, .012, 2.044, .117, .119),
                                              (0, .011, 2.111, .127, .126),
                                              (0, .010, 2.151, .138, .135)],
                         materials['skin'], 'body', segments=64))
    for label, sign in (('Left', 1), ('Right', -1)):
        objects.append(_rib_band(f'{label} sweater cuff', (sign * .510, -.005, 1.258),
                                 .101, .113, .104, 36, materials['sweater_rib'], -sign * .17))
        shoulder = [(sign * .168, -.125, 1.983), (sign * .229, -.179, 1.953),
                    (sign * .304, -.210, 1.884), (sign * .370, -.159, 1.779)]
        objects.append(_curve(f'{label} sweater shoulder stitching', _onto(_surface(objects[0]), shoulder), .0017,
                              materials['sweater_rib'], 'micro_seams'))
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
    seam = _curve(f'{name} fine stitching', seam_points, .0010,
                  materials['stitch'], closed=True, linear=True)
    top = _back_points(surface, _sample_path(points[:2], corners=True), .0075)
    lip = _curve(f'{name} top folded opening', top, .0031,
                 materials['denim'], 'clothes', 0, linear=True)
    return [patch, seam, lip]


def _jeans(materials):
    pelvis = [(0, .013, 1.026, .191, .173), (0, .009, 1.070, .274, .209),
              (0, .009, 1.152, .345, .226), (0, .009, 1.226, .339, .224),
              (0, .008, 1.310, .322, .206)]
    pieces = [_loft('Jeans hips sculpt', pelvis, materials['denim'])]
    for label, sign in (('Left', 1), ('Right', -1)):
        leg = [(sign * .247, .007, .365, .152, .148),
               (sign * .248, .002, .416, .163, .165),
               (sign * .243, -.002, .456, .175, .178),
               (sign * .239, -.002, .512, .153, .161),
               (sign * .233, -.006, .621, .150, .154),
               (sign * .230, -.011, .722, .160, .170),
               (sign * .225, -.007, .842, .167, .182),
               (sign * .217, .003, .979, .168, .187),
               (sign * .202, .010, 1.078, .182, .202),
               (sign * .181, .009, 1.184, .183, .208)]
        pieces.append(_loft(f'{label} jeans leg sculpt', leg, materials['denim'], folds=.005))
    objects = [_fuse('Grassy continuous jeans', pieces, .0075, 'clothes')]
    _cloth_folds(objects[0], 'denim')
    surface = _surface(objects[0])
    for label, sign in (('Left', 1), ('Right', -1)):
        x = sign * .247
        cuff = [(x, .005, .289, .158, .152), (x, .005, .308, .182, .174),
                (x, .005, .337, .182, .180), (x, .005, .376, .173, .169),
                (x, .005, .407, .178, .173), (x, .005, .426, .155, .151)]
        cuff_obj = _loft(f'{label} rolled denim cuff', cuff, materials['denim_cuff'],
                         part='cuffs', folds=.004, segments=80)
        for vertex in cuff_obj.data.vertices:
            angle = math.atan2((vertex.co.y - .005) / .17, (vertex.co.x - x) / .18)
            vertex.co.z += .0035 * math.sin(angle * 3) + .002 * math.cos(angle * 5)
        objects.append(cuff_obj)
        lower_fold = [(x, .005, .289, .157, .153), (x, .005, .300, .174, .170),
                      (x, .005, .308, .183, .177), (x, .005, .318, .180, .175),
                      (x, .005, .326, .171, .165)]
        lower_fold_obj = _loft(f'{label} cuff lower folded lip', lower_fold,
                               materials['denim_cuff'], part='cuffs', folds=.003, segments=80)
        for vertex in lower_fold_obj.data.vertices:
            angle = math.atan2((vertex.co.y - .005) / .17, (vertex.co.x - x) / .18)
            vertex.co.z += .0035 * math.sin(angle * 3) + .002 * math.cos(angle * 5)
        objects.append(lower_fold_obj)
        cuff_edge = [(x + .174 * math.cos(t * math.tau / 36),
                      .005 + .168 * math.sin(t * math.tau / 36), .313) for t in range(36)]
        objects.append(_curve(f'{label} cuff rolled edge', cuff_edge, .0026,
                              materials['denim_cuff'], closed=True))
        side_seam = [(sign * .417, .008, .428), (sign * .419, .008, .456),
                     (sign * .402, .008, .492), (sign * .384, .009, .618),
                     (sign * .383, .010, .747), (sign * .384, .017, .950),
                     (sign * .373, .028, 1.100), (sign * .337, .012, 1.260)]
        objects.append(_stitch(f'{label} jeans outside seam', side_seam, surface,
                               .0013, materials['stitch']))
        cuff_seam = [(sign * .421, .007, .296), (sign * .427, .007, .343),
                     (sign * .425, .007, .387), (sign * .417, .007, .423)]
        objects.append(_stitch(f'{label} cuff outside seam', cuff_seam, _surface(cuff_obj),
                               .0013, materials['stitch']))
        front = [(sign * .315, -.160, 1.273), (sign * .302, -.180, 1.249),
                 (sign * .280, -.201, 1.224), (sign * .250, -.214, 1.205),
                 (sign * .215, -.224, 1.193), (sign * .176, -.229, 1.190)]
        objects.append(_stitch(f'{label} jeans front pocket seam', front, surface,
                               .0011, materials['stitch']))
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
        objects.append(_stitch(f'{label} jeans inner seam', inner, surface, .001, materials['stitch']))
    objects.append(_stitch('Jeans fly stitching', [(0, -.222, 1.275), (.041, -.229, 1.239),
                                                (.042, -.231, 1.133), (.007, -.218, 1.108)],
                           surface, .0012, materials['stitch']))
    return objects


def _finger(name, points, radii, material):
    samples = []
    for index, point in enumerate(points):
        samples.append((*point, radii[index]))
    samples = _sample_rings(samples, 4)
    vertices = []
    segments = 20
    for index, sample in enumerate(samples):
        center = Vector(sample[:3])
        previous = Vector(samples[max(0, index - 1)][:3])
        following = Vector(samples[min(len(samples) - 1, index + 1)][:3])
        tangent = (following - previous).normalized()
        u = tangent.cross(Vector((0, 1, 0))).normalized()
        v = tangent.cross(u).normalized()
        for segment in range(segments):
            angle = segment * math.tau / segments
            vertices.append(tuple(center + sample[3] * (u * math.cos(angle) + v * math.sin(angle))))
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
        palm = _loft(f'{label} palm sculpt', [(0, 0, 1.064, .059, .033),
                    (0, -.004, 1.097, .083, .045), (0, -.003, 1.158, .080, .054),
                    (-.009, -.001, 1.210, .062, .050), (-.019, 0, 1.247, .055, .048)],
                    materials['skin'], 'hands', segments=48)
        pieces = [palm]
        digits = [(-.061, .166, .021), (-.020, .192, .023), (.025, .178, .022), (.066, .141, .019)]
        for index, (offset, length, radius) in enumerate(digits):
            points = [(offset, .008, 1.112), (offset + .005, .004, 1.068),
                      (offset + .003, -.021, 1.112 - length * .58),
                      (offset - .010, -.043, 1.112 - length * .88),
                      (offset - .021, -.049, 1.112 - length)]
            pieces.append(_finger(f'{label} finger {index + 1}', points,
                                  [radius, radius, radius * .94, radius * .78, radius * .26],
                                  materials['skin']))
        pieces.append(_finger(f'{label} thumb', [(-.057, -.008, 1.185), (-.096, -.021, 1.153),
                                                (-.110, -.042, 1.102), (-.100, -.061, 1.069)],
                              [.029, .028, .023, .012], materials['skin']))
        hand = _fuse(f'Grassy {label.lower()} hand', pieces, .004, 'hands')
        for vertex in hand.data.vertices:
            x, y, z = vertex.co
            x *= 1.22
            y *= 1.46
            vertex.co = (sign * (.528 + x * .90 + y * .436),
                         -.008 - x * .436 + y * .90, z)
        objects.append(hand)
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
            angle = -.37 + column / columns * .50 + row / rows * .15
            vertices.append((x + sign * (rx * (1 - .12 * math.sin(angle)) * math.cos(angle) + .0018),
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
                  .0015, materials['shoe_lace'], closed=True)
    return [panel, seam]


def _shoe_top(surface, x, y, offset=0):
    position, _, _, _ = surface.ray_cast(Vector((x, y, .8)), Vector((0, 0, -1)))
    return (x, y, position.z + offset)


def _shoes(materials):
    objects = []
    for label, sign in (('Left', 1), ('Right', -1)):
        x = sign * .247
        sole = [(x, -.155, 0, .174, .310), (x, -.155, .012, .185, .327),
                (x, -.155, .058, .187, .330), (x, -.155, .077, .180, .322)]
        objects.append(_loft(f'{label} sneaker rubber sole', sole, materials['sole'], 'shoes',
                             segments=80, toe_shape=True))
        upper = [(x, -.155, .068, .176, .307), (x, -.153, .095, .183, .310),
                 (x, -.147, .137, .180, .288), (x, -.123, .180, .165, .258),
                 (x, -.073, .222, .143, .212), (x, -.017, .259, .113, .133),
                 (x, .009, .282, .092, .093)]
        upper_obj = _loft(f'{label} sneaker leather upper', upper, materials['shoe'], 'shoes',
                          segments=80, toe_shape=True)
        objects.append(upper_obj)
        surface = _surface(upper_obj)
        objects.append(_loft(f'{label} ankle', [(x, .012, .214, .069, .073),
                                              (x, .012, .286, .077, .081),
                                              (x, .010, .340, .082, .082)],
                             materials['skin'], 'body', segments=48))
        collar = [(x + .098 * math.cos(t * math.tau / 40),
                   .014 + .096 * math.sin(t * math.tau / 40),
                   .270 + .010 * math.sin(t * math.tau / 40)) for t in range(40)]
        objects.append(_curve(f'{label} sneaker padded collar', collar, .013,
                              materials['shoe'], 'shoes', 0, closed=True))
        for outward in (-1, 1):
            objects.extend(_shoe_panel(label, x, outward, upper, materials))
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
                                  .002, materials['shoe_trim']))
        for row in range(5):
            y = -.252 + row * .033
            for diagonal in (-1, 1):
                lace = [_shoe_top(surface, x - .062, y, .026),
                        _shoe_top(surface, x, y + diagonal * .010, .038),
                        _shoe_top(surface, x + .062, y + diagonal * .020, .026)]
                objects.append(_curve(f'{label} sneaker lace {row + 1} {diagonal}', lace,
                                      .006, materials['shoe_lace'], 'seams'))
        bow_y = -.085
        for loop in (-1, 1):
            bow = [_shoe_top(surface, x, bow_y, .041),
                   _shoe_top(surface, x + loop * .064, bow_y + .025, .047),
                   _shoe_top(surface, x + loop * .079, bow_y - .005, .041),
                   _shoe_top(surface, x, bow_y, .041)]
            objects.append(_curve(f'{label} tied lace loop {loop}', bow, .0052, materials['shoe_lace']))
        toe_trim = [(x + .160 * math.cos(angle), -.154 + .290 * math.sin(angle),
                     .113 + .015 * math.cos(angle) ** 2)
                    for angle in [math.pi + t * math.pi / 32 for t in range(33)]]
        objects.append(_curve(f'{label} sneaker toe stitching', _onto(surface, toe_trim, .0015), .0019,
                              materials['shoe_lace']))
        sole_edge = [(x + .185 * (1 - .12 * math.sin(t * math.tau / 48)) * math.cos(t * math.tau / 48),
                      -.155 + .325 * math.sin(t * math.tau / 48), .050) for t in range(48)]
        objects.append(_curve(f'{label} sneaker sole seam', sole_edge, .002,
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
    return objects


def build_body(materials):
    """Build the stationary body in meters/tiles, with soles at Z=0."""
    return _sweater(materials) + _jeans(materials) + _hands(materials) + _shoes(materials)
