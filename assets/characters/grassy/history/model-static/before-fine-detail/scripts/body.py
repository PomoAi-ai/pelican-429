"""Grassy's continuous garments, deforming body, prop set and animation clips."""

import math

import bpy
from mathutils import Quaternion, Vector


def _mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for poly in data.polygons:
        poly.use_smooth = True
    return obj


def _loft(name, rings, material, segments=40, folds=0.0):
    """Closed horizontal contour rings; not stacked primitive capsules."""
    vertices = []
    for index, (x, y, z, rx, ry) in enumerate(rings):
        for j in range(segments):
            a = j * math.tau / segments
            ripple = folds * math.sin(a * 5 + z * 17) * math.sin(math.pi * index / (len(rings) - 1))
            vertices.append((x + math.cos(a) * (rx + ripple), y + math.sin(a) * (ry + ripple), z))
    faces = []
    for i in range(len(rings) - 1):
        for j in range(segments):
            n = (j + 1) % segments
            faces.append((i * segments + j, i * segments + n, (i + 1) * segments + n, (i + 1) * segments + j))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(rings) - 1) * segments + j for j in range(segments)))
    return _mesh(name, vertices, faces, material)


def _tube(name, points, radii, material, segments=12):
    vertices = []
    for i, point in enumerate(points):
        p = Vector(point)
        tangent = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])
        tangent.normalize()
        cross = tangent.cross(Vector((0, 1, 0)))
        if cross.length < 0.01:
            cross = tangent.cross(Vector((1, 0, 0)))
        cross.normalize()
        up = tangent.cross(cross).normalized()
        for j in range(segments):
            a = j * math.tau / segments
            vertices.append(tuple(p + radii[i] * (math.cos(a) * cross + math.sin(a) * up)))
    faces = []
    for i in range(len(points) - 1):
        for j in range(segments):
            n = (j + 1) % segments
            faces.append((i * segments + j, i * segments + n, (i + 1) * segments + n, (i + 1) * segments + j))
    faces += [tuple(reversed(range(segments))), tuple((len(points) - 1) * segments + j for j in range(segments))]
    return _mesh(name, vertices, faces, material)


def _curve(name, points, radius, material):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, point in zip(spline.bezier_points, points):
        bp.co = point
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def _round_box(name, location, dimensions, bevel, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    modifier = obj.modifiers.new("Soft tailored edges", "BEVEL")
    modifier.width = bevel
    modifier.segments = 4
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.select_set(False)
    return obj


def _fuse(name, objects, voxel_size, smooth_iterations=4):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = objects[0]
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    modifier = obj.modifiers.new("Continuous sewn surface", "REMESH")
    modifier.mode = "VOXEL"
    modifier.voxel_size = voxel_size
    modifier.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = obj.modifiers.new("Relax surface", "SMOOTH")
    modifier.factor = 0.55
    modifier.iterations = smooth_iterations
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    return obj


def _skin(obj, armature, weights):
    obj.parent = armature
    groups = {}
    for vertex in obj.data.vertices:
        for bone, amount in weights(vertex.co).items():
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=bone)
            groups[bone].add([vertex.index], amount, "REPLACE")
    modifier = obj.modifiers.new("Grassy skeleton", "ARMATURE")
    modifier.object = armature
    modifier.use_deform_preserve_volume = True


def _cloth_uv(obj):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.018)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def _mix(a, b, t):
    t = max(0, min(1, t))
    return {a: 1 - t, b: t}


def _skeleton():
    data = bpy.data.armatures.new("Grassy skeleton")
    rig = bpy.data.objects.new("GrassyRig", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    joints = [("root", (0, 0, 0), None), ("hips", (0, 0, 1.55), "root"),
              ("spine", (0, 0, 1.74), "hips"), ("head", (0, 0, 2.52), "spine")]
    for side, s in (("L", 1), ("R", -1)):
        joints.extend([(f"upper_arm.{side}", (s * 0.35, 0, 2.35), "spine"),
                       (f"forearm.{side}", (s * 0.56, -0.006, 1.98), f"upper_arm.{side}"),
                       (f"hand.{side}", (s * 0.73, -0.016, 1.61), f"forearm.{side}"),
                       (f"thigh.{side}", (s * 0.22, 0, 1.50), "hips"),
                       (f"shin.{side}", (s * 0.235, -0.012, 0.87), f"thigh.{side}"),
                       (f"foot.{side}", (s * 0.245, 0, 0.24), f"shin.{side}")])
    for name, head, parent in joints:
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = Vector(head) + Vector((0, 0, 0.16))
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    rig.select_set(False)
    rig.show_in_front = True
    return rig


def _rib_band(name, x, z, width, depth, height, material, rib_count=52):
    rings = [(x, 0, z - height / 2, width * 0.96, depth * 0.96),
             (x, 0, z - height * 0.35, width, depth),
             (x, 0, z + height * 0.35, width, depth),
             (x, 0, z + height / 2, width * 0.96, depth * 0.96)]
    obj = _loft(name, rings, material, segments=64 if rib_count == 0 else rib_count * 4)
    for v in obj.data.vertices:
        a = math.atan2(v.co.y / depth, (v.co.x - x) / width)
        groove = 0.0034 * (0.5 + 0.5 * math.cos(a * rib_count)) if rib_count else 0
        v.co.x += groove * math.cos(a)
        v.co.y += groove * math.sin(a)
    return obj


def _sweater(materials, rig):
    rings = [(0, 0, 1.62, .31, .19), (0, 0, 1.69, .35, .215),
             (0, -.004, 1.74, .363, .229), (0, -.008, 1.81, .347, .222),
             (0, -.005, 1.92, .319, .208), (0, 0, 2.06, .33, .206),
             (0, 0, 2.20, .35, .214), (0, 0, 2.30, .356, .208),
             (0, 0, 2.37, .31, .188), (0, 0, 2.43, .225, .163),
             (0, 0, 2.46, .145, .14)]
    pieces = [_loft("Sweater body", rings, materials["sweater"], 64, .009)]
    for side, s in (("L", 1), ("R", -1)):
        sleeve = [(s * .71, -.015, 1.61, .09, .089),
                  (s * .70, -.015, 1.68, .129, .120),
                  (s * .68, -.012, 1.73, .148, .140),
                  (s * .65, -.009, 1.80, .131, .122),
                  (s * .62, -.008, 1.86, .146, .14),
                  (s * .58, -.006, 1.94, .13, .125),
                  (s * .55, 0, 2.02, .138, .14),
                  (s * .49, 0, 2.13, .151, .157),
                  (s * .42, 0, 2.24, .157, .168),
                  (s * .34, 0, 2.33, .165, .174),
                  (s * .29, 0, 2.39, .10, .12)]
        pieces.append(_loft(f"Sweater sleeve {side}", sleeve, materials["sweater"], 40, .007))
    sweater = _fuse("Grassy_Sweater", pieces, .018, 4)
    _cloth_uv(sweater)

    def weights(v):
        x, z = abs(v.x), v.z
        side = "L" if v.x > 0 else "R"
        torso = _mix("hips", "spine", (z - 1.62) / .37)
        arm = _mix(f"upper_arm.{side}", f"forearm.{side}", (2.07 - z) / .22)
        shoulder = max(0, min(1, (z - 1.90) / .42))
        shoulder = shoulder * shoulder * (3 - 2 * shoulder)
        edge = .40 - .10 * shoulder
        width = .08 + .09 * shoulder
        influence = max(0, min(1, (x - edge) / width))
        result = {bone: value * (1 - influence) for bone, value in torso.items()}
        result.update({bone: value * influence for bone, value in arm.items()})
        return result

    _skin(sweater, rig, weights)
    hem = _rib_band("Sweater ribbed hem", 0, 1.65, .331, .202, .12, materials["sweater_rib"], 80)
    _skin(hem, rig, lambda v: {"hips": 1})
    neck = _loft("Grassy neck", [(0, 0, 2.38, .109, .109), (0, 0, 2.50, .113, .11),
                                (0, 0, 2.60, .144, .14)], materials["skin"], 40)
    _skin(neck, rig, lambda v: _mix("spine", "head", (v.z - 2.42) / .16))
    collar = _rib_band("Sweater ribbed collar", 0, 2.447, .148, .143, .063, materials["sweater_rib"], 52)
    _skin(collar, rig, lambda v: {"spine": 1})
    for side, s in (("L", 1), ("R", -1)):
        cuff = _rib_band(f"Sweater wrist ribbing {side}", s * .721, 1.625, .105, .100, .112, materials["sweater_rib"], 34)
        _skin(cuff, rig, lambda v, side=side: {f"forearm.{side}": 1})


def _jeans(materials, rig):
    pieces = [_loft("Jeans waist and pelvis", [(0, 0, 1.275, .265, .142), (0, 0, 1.38, .318, .183),
                                             (0, .012, 1.49, .336, .192), (0, .01, 1.60, .319, .183),
                                             (0, 0, 1.66, .306, .177)], materials["denim"], 56)]
    for side, s in (("L", 1), ("R", -1)):
        rings = [(s * .246, 0, .255, .126, .120), (s * .25, .004, .34, .15, .137),
                 (s * .254, .006, .44, .157, .150), (s * .244, -.004, .56, .139, .131),
                 (s * .235, -.008, .70, .145, .138), (s * .235, -.019, .84, .147, .150),
                 (s * .227, -.018, .93, .15, .151), (s * .218, -.004, 1.07, .158, .15),
                 (s * .207, 0, 1.22, .169, .165), (s * .19, .01, 1.38, .18, .18),
                 (s * .17, .01, 1.49, .183, .18)]
        pieces.append(_loft(f"Jeans leg {side}", rings, materials["denim"], 48, .004))
    jeans = _fuse("Grassy_Jeans", pieces, .014, 4)
    _cloth_uv(jeans)

    def leg_weights(v):
        side = "L" if v.x > 0 else "R"
        if v.z > 1.36:
            return _mix(f"thigh.{side}", "hips", (v.z - 1.36) / .18)
        return _mix(f"shin.{side}", f"thigh.{side}", (v.z - .77) / .21)

    _skin(jeans, rig, leg_weights)
    col = jeans.data.color_attributes.new(name="DenimWash", type="BYTE_COLOR", domain="POINT")
    for v, color in zip(jeans.data.vertices, col.data):
        front = max(0, min(1, -v.co.y / .16))
        thigh = math.exp(-((v.co.z - 1.12) / .37) ** 2)
        center = math.exp(-((abs(v.co.x) - .215) / .12) ** 2)
        wash = front * thigh * center * .24
        irregular = .025 * math.sin(v.co.z * 94 + v.co.x * 37) * math.sin(v.co.x * 165)
        color.color = (.78 + wash + irregular, .80 + wash + irregular, .83 + wash * .7 + irregular, 1)
    for side, s in (("L", 1), ("R", -1)):
        cuff = _rib_band(f"Jeans folded cuff {side}", s * .25, .303, .153, .143, .107, materials["denim_cuff"], 0)
        _skin(cuff, rig, lambda v, side=side: {f"shin.{side}": 1})
        points = [(s * .37, .002, .36), (s * .382, .003, .48), (s * .37, .004, .72),
                  (s * .38, .004, .98), (s * .385, .007, 1.22), (s * .35, .009, 1.51)]
        seam = _curve(f"Jeans outer gold seam {side}", points, .0017, materials["stitch"])
        _skin(seam, rig, leg_weights)
        front = [(s * .315, -.099, 1.585), (s * .29, -.139, 1.535),
                 (s * .24, -.18, 1.485), (s * .17, -.19, 1.463)]
        seam = _curve(f"Jeans front pocket {side}", front, .0027, materials["stitch"])
        _skin(seam, rig, leg_weights)
        pocket = [(s * .105, .181, 1.53), (s * .28, .159, 1.51), (s * .281, .16, 1.36),
                  (s * .205, .182, 1.31), (s * .108, .19, 1.355), (s * .105, .181, 1.53)]
        seam = _curve(f"Jeans back patch pocket seam {side}", pocket, .003, materials["stitch"])
        _skin(seam, rig, leg_weights)
        for direction in (-1, 1):
            pts = [(s * .25 + direction * .153, -.028, .258), (s * .25 + direction * .157, -.028, .303),
                   (s * .25 + direction * .153, -.028, .351)]
            seam = _curve(f"Cuff selvedge {side} {direction}", pts, .0024, materials["stitch"])
            _skin(seam, rig, leg_weights)
    fly = _curve("Jeans fly topstitch", [(0, -.187, 1.61), (.035, -.19, 1.56), (.036, -.194, 1.43), (0, -.19, 1.40)], .0025, materials["stitch"])
    _skin(fly, rig, leg_weights)


def _hands(materials, rig):
    for side, s in (("L", 1), ("R", -1)):
        x = s * .749
        palm = _loft(f"Palm {side}", [(x, -.02, 1.38, .072, .036), (x, -.021, 1.43, .086, .046),
                                     (x, -.018, 1.50, .087, .051), (x, -.015, 1.58, .068, .049),
                                     (x, -.01, 1.62, .055, .048)], materials["skin"], 28)
        pieces = [palm]
        for digit, (offset, length, radius) in enumerate(((-.054, .151, .020), (-.015, .189, .022), (.027, .18, .021), (.063, .14, .018))):
            fx = x + s * offset
            points = [(fx, -.024, 1.43), (fx + s * .004, -.026, 1.39),
                      (fx + s * .003, -.014, 1.40 - length * .53),
                      (fx - s * .008, -.040, 1.40 - length * .88),
                      (fx - s * .016, -.050, 1.40 - length)]
            pieces.append(_tube(f"Finger {side} {digit}", points, [radius, radius, radius * .94, radius * .78, radius * .38], materials["skin"], 12))
        thumb = [(x - s * .060, -.028, 1.50), (x - s * .111, -.044, 1.457),
                 (x - s * .123, -.071, 1.397), (x - s * .115, -.09, 1.368)]
        pieces.append(_tube(f"Thumb {side}", thumb, [.034, .030, .023, .014], materials["skin"], 16))
        hand = _fuse(f"Grassy_Hand_{side}", pieces, .007, 3)
        for vertex in hand.data.vertices:
            vertex.co.z = 1.61 + (vertex.co.z - 1.61) * .84
        _skin(hand, rig, lambda v, side=side: {f"hand.{side}": 1})


def _shoes(materials, rig):
    for side, s in (("L", 1), ("R", -1)):
        x = s * .25
        sole = _loft(f"Sneaker rubber sole {side}", [(x, -.111, .020, .143, .25),
                    (x, -.111, .03, .151, .258), (x, -.112, .081, .152, .26),
                    (x, -.112, .10, .148, .253)], materials["sole"], 56)
        _skin(sole, rig, lambda v, side=side: {f"foot.{side}": 1})
        rings = [(x, -.108, .083, .141, .246), (x, -.113, .116, .145, .243),
                 (x, -.115, .165, .135, .225), (x, -.072, .215, .125, .176),
                 (x, -.018, .26, .108, .118), (x, .003, .287, .083, .085)]
        shoe = _loft(f"Sneaker leather upper {side}", rings, materials["shoe"], 56)
        subs = shoe.modifiers.new("Supple leather", "SUBSURF")
        subs.levels = 2
        bpy.context.view_layer.objects.active = shoe
        bpy.ops.object.modifier_apply(modifier=subs.name)
        _skin(shoe, rig, lambda v, side=side: {f"foot.{side}": 1})
        tongue = _round_box(f"Sneaker tongue {side}", (x, -.125, .242), (.112, .181, .027), .015, materials["shoe"])
        bpy.context.view_layer.objects.active = tongue
        tongue.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        tongue.select_set(False)
        _skin(tongue, rig, lambda v, side=side: {f"foot.{side}": 1})
        for row in range(4):
            y = -.204 + row * .037
            z = .239 + row * .015
            lace = _curve(f"Sneaker laces {side} {row}", [(x - .056, y, z), (x, y + .007, z + .019), (x + .056, y + .012, z)], .006, materials["sole"])
            _skin(lace, rig, lambda v, side=side: {f"foot.{side}": 1})
        for direction in (-1, 1):
            trim = _curve(f"Sneaker stitching {side} {direction}", [(x + direction * .133, -.20, .125),
                (x + direction * .139, -.125, .15), (x + direction * .123, -.037, .223),
                (x + direction * .098, .034, .252)], .002, materials["sole"])
            _skin(trim, rig, lambda v, side=side: {f"foot.{side}": 1})
        ankle = _loft(f"Ankle {side}", [(x, 0, .22, .07, .078), (x, 0, .32, .08, .08)], materials["skin"], 24)
        _skin(ankle, rig, lambda v, side=side: {f"foot.{side}": 1})


def build_body(materials):
    rig = _skeleton()
    _sweater(materials, rig)
    _jeans(materials, rig)
    _hands(materials, rig)
    _shoes(materials, rig)

    def attach(obj, bone_name):
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        if obj.type == "CURVE":
            bpy.ops.object.convert(target="MESH")
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.select_set(False)
        _skin(obj, rig, lambda v: {bone_name: 1})

    return rig, attach


def _prop_material(name, color, metallic=0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = .43
    return material


def create_coding_props(materials):
    parent = bpy.data.objects.new("CodingProps", None)
    bpy.context.collection.objects.link(parent)
    wood = _prop_material("Desk warm ash", (.33, .19, .105))
    metal = _prop_material("Desk graphite", (.04, .055, .066), .30)
    screen = _prop_material("Editor midnight", (.008, .025, .04))
    glow = _prop_material("Editor aqua code", (.10, .63, .62))
    shader = glow.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Emission Color"].default_value = (.04, .32, .31, 1)
    shader.inputs["Emission Strength"].default_value = .45
    parts = []
    parts.append(_round_box("CodingDesk", (0, -.85, 1.70), (1.80, .86, .085), .028, wood))
    for x in (-.76, .76):
        for y in (-1.14, -.54):
            parts.append(_round_box("Desk leg", (x, y, .85), (.07, .07, 1.67), .018, metal))
    parts.append(_round_box("Monitor stand", (0, -1.07, 1.85), (.06, .08, .26), .02, metal))
    parts.append(_round_box("Monitor base", (0, -1.06, 1.765), (.35, .20, .027), .01, metal))
    parts.append(_round_box("Monitor casing", (0, -1.1, 2.11), (.98, .065, .58), .037, metal))
    parts.append(_round_box("Monitor screen", (0, -1.061, 2.11), (.906, .01, .506), .015, screen))
    for line in range(11):
        y = -1.052
        z = 2.31 - line * .035
        width = .16 + (line * 7 % 9) * .052
        left = -.39 + (.035 if line % 3 else 0)
        parts.append(_round_box("Editor code line", (left + width / 2, y, z), (width, .007, .007), .002, glow))
    parts.append(_round_box("Keyboard plate", (0, -.64, 1.763), (.64, .235, .032), .015, metal))
    for row in range(4):
        for col in range(12):
            parts.append(_round_box("Keyboard key", (-.273 + col * .049, -.724 + row * .05, 1.788), (.040, .039, .012), .004, materials["shoe"]))
    parts.append(_round_box("Chair seat", (0, .23, .92), (.60, .56, .10), .07, metal))
    parts.append(_round_box("Chair back", (0, .48, 1.43), (.58, .07, .78), .08, metal))
    parts.append(_round_box("Chair stem", (0, .24, .48), (.10, .10, .83), .02, metal))
    for x in (-.25, .25):
        parts.append(_round_box("Chair base", (x, .24, .075), (.58, .065, .065), .02, metal))
    for obj in parts:
        if obj.name.startswith(("Chair", "Desk leg")):
            continue
        obj.location.z -= .27
    for obj in parts:
        if obj.name.startswith("Desk leg"):
            obj.location.z = .715
            obj.scale.z = 1.40 / 1.67
        obj.parent = parent
    return parent


def bake_actions(rig):
    """All bones have aligned rest axes: local X bends, Y turns, Z leans."""
    clips = (("idle", 120), ("walk", 60), ("run", 45), ("jump", 72), ("coding", 120), ("dizzy", 120))
    rig.animation_data_create()
    bpy.context.scene.render.fps = 30
    for name, duration in clips:
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        for frame in range(1, duration + 2):
            t = (frame - 1) / duration
            phase = t * math.tau
            for bone in rig.pose.bones:
                bone.location = (0, 0, 0)
                bone.rotation_euler = (0, 0, 0)
                bone.scale = (1, 1, 1)
            bones = rig.pose.bones
            if name == "idle":
                bones["spine"].rotation_euler.x = .011 * math.sin(phase)
                bones["head"].rotation_euler.y = .035 * math.sin(phase * 2)
                for side, s in (("L", 1), ("R", -1)):
                    bones[f"upper_arm.{side}"].rotation_euler.z = s * .015 * math.sin(phase)
            elif name in ("walk", "run"):
                fast = name == "run"
                amplitude = .63 if fast else .37
                bones["root"].location.y = (.06 if fast else .015) * (1 - math.cos(phase * 2))
                bones["spine"].rotation_euler.x = .09 if fast else .012
                bones["hips"].rotation_euler.y = .075 * math.sin(phase)
                for side, offset in (("L", 0), ("R", math.pi)):
                    angle = phase + offset
                    swing = math.sin(angle)
                    bones[f"thigh.{side}"].rotation_euler.x = -amplitude * swing
                    bones[f"shin.{side}"].rotation_euler.x = (.85 if fast else .40) * max(0, -swing)
                    bones[f"foot.{side}"].rotation_euler.x = .14 * swing
                    bones[f"upper_arm.{side}"].rotation_euler.x = amplitude * .72 * swing
                    bones[f"forearm.{side}"].rotation_euler.x = -.65 if fast else -.14
            elif name == "jump":
                lift = math.sin(math.pi * max(0, min(1, (t - .18) / .64)))
                squat = math.sin(math.pi * min(1, t / .20)) if t < .20 else 0
                landing = math.sin(math.pi * (t - .82) / .18) if t > .82 else 0
                bones["root"].location.y = .61 * lift - .11 * (squat + landing)
                for side, s in (("L", 1), ("R", -1)):
                    bones[f"thigh.{side}"].rotation_euler.x = -.25 * lift - .35 * (squat + landing)
                    bones[f"shin.{side}"].rotation_euler.x = .47 * lift + .65 * (squat + landing)
                    bones[f"upper_arm.{side}"].rotation_euler.x = -1.45 * lift
                    bones[f"upper_arm.{side}"].rotation_euler.z = -s * .12 * lift
                    bones[f"forearm.{side}"].rotation_euler.x = -.20 * lift
            elif name == "coding":
                bones["root"].location.y = -.46
                bones["root"].location.z = -.22
                bones["spine"].rotation_euler.x = -.11
                bones["head"].rotation_euler.x = .12 + .018 * math.sin(phase)
                for side, s in (("L", 1), ("R", -1)):
                    tap = math.sin(phase * 8 + s)
                    bones[f"upper_arm.{side}"].rotation_euler.x = -.948
                    bones[f"upper_arm.{side}"].rotation_euler.z = -s * .730
                    bones[f"forearm.{side}"].rotation_euler.x = -.194 + .012 * tap
                    bones[f"forearm.{side}"].rotation_euler.z = -s * .592
                    bones[f"thigh.{side}"].rotation_euler.x = -1.30
                    bones[f"shin.{side}"].rotation_euler.x = 1.30
                bpy.context.view_layer.update()
                for side, s in (("L", 1), ("R", -1)):
                    wrist = bones[f"hand.{side}"]
                    palm = Quaternion((1, 0, 0), -math.pi / 2 + .020 * math.sin(phase * 8 + s))
                    rest = rig.data.bones[f"hand.{side}"].matrix_local.to_quaternion()
                    wrist.rotation_euler = (bones[f"forearm.{side}"].matrix.to_quaternion().inverted() @ palm @ rest).to_euler("XYZ")
            else:
                bones["root"].rotation_euler.z = .065 * math.sin(phase)
                bones["spine"].rotation_euler.z = .08 * math.sin(phase + .4)
                bones["head"].rotation_euler.y = .21 * math.sin(phase + .8)
                bones["head"].rotation_euler.z = .08 * math.cos(phase)
                for side, s in (("L", 1), ("R", -1)):
                    bones[f"upper_arm.{side}"].rotation_euler.z = -s * .34 + .09 * math.sin(phase)
                    bones[f"forearm.{side}"].rotation_euler.x = -.28 + s * .08 * math.cos(phase)
            for bone in bones:
                bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
                bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone.name)
                bone.keyframe_insert(data_path="scale", frame=frame, group=bone.name)
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.action_frame_start = 1
        strip.action_frame_end = duration + 1
        track.mute = True
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)
    bpy.context.scene.frame_set(1)
