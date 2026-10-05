"""Build Sam's approved short-bodied white-stoat sculpt in a background Blender.

The photograph supplies surface colour only; the silhouette, face, hair and limbs
are closed three-dimensional meshes. Front is -Y, up is Z, feet touch Z=0.
"""
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/characters/sam/local-sculpt'
REFERENCE = ROOT / 'output/imagegen/animal-npc-concepts-v4/sam-the-model-router-front.png'
PIXEL = 2.7 / 1392
PART = 'head'
PROJECTED = []


def color(value):
    channels = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels) + (1,)


def material(name, value, roughness=.65, projection=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color(value)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = color(value)
    shader.inputs['Roughness'].default_value = roughness
    if projection:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        image = nodes.new('ShaderNodeTexImage')
        image.image = bpy.data.images.load(str(REFERENCE), check_existing=True)
        image.extension = 'EXTEND'
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'Reference front'
        links.new(uv.outputs['UV'], image.inputs['Vector'])
        normal = nodes.new('ShaderNodeNewGeometry')
        facing = nodes.new('ShaderNodeVectorMath')
        facing.operation = 'DOT_PRODUCT'
        facing.inputs[1].default_value = (0, -1, 0)
        links.new(normal.outputs['Normal'], facing.inputs[0])
        weight = nodes.new('ShaderNodeMapRange')
        weight.inputs['From Min'].default_value = .2
        weight.inputs['From Max'].default_value = .86
        weight.inputs['To Max'].default_value = projection
        links.new(facing.outputs['Value'], weight.inputs['Value'])
        blend = nodes.new('ShaderNodeMixRGB')
        blend.inputs[1].default_value = color(value)
        links.new(weight.outputs['Result'], blend.inputs[0])
        links.new(image.outputs['Color'], blend.inputs[2])
        links.new(blend.outputs['Color'], shader.inputs['Base Color'])
        mat['reference_projected'] = True
    return mat


def mesh(name, vertices, faces, mat, subdivision=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    obj['npc_part'] = PART
    for poly in data.polygons:
        poly.use_smooth = True
    if subdivision:
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new('Continuous sculpted surface', 'SUBSURF')
        modifier.levels = subdivision
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def ellipsoid(name, center, scale, mat, segments=48, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj['npc_part'] = PART
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def loft(name, rings, mat, sides=48, subdivision=2, face=False, rib=0):
    vertices, faces = [], []
    for z, cx, cy, rx, front, back in rings:
        for j in range(sides):
            a = math.tau * j / sides
            x = cx + rx * math.sin(a)
            y = cy - (front if math.cos(a) >= 0 else back) * math.cos(a)
            if face and math.cos(a) > 0:
                recess = sum(math.exp(-((x - sx) / .105) ** 2 - ((z - 2.01) / .075) ** 2) for sx in (-.178, .178))
                y += .022 * recess * math.cos(a)
            if rib:
                amount = 1 + rib * math.sin(a * 40)
                x = cx + (x - cx) * amount
                y = cy + (y - cy) * amount
            vertices.append((x, y, z))
    for row in range(len(rings) - 1):
        for j in range(sides):
            a = row * sides + j
            b = row * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(reversed(range(sides))), tuple((len(rings) - 1) * sides + j for j in range(sides))])
    return mesh(name, vertices, faces, mat, subdivision)


def bezier(points, t):
    a, b, c, d = [Vector(p) for p in points]
    return a * (1 - t) ** 3 + b * 3 * t * (1 - t) ** 2 + c * 3 * t * t * (1 - t) + d * t ** 3


def tube(name, points, radius, mat, sides=8, steps=24, taper=False):
    vertices, faces = [], []
    for row in range(steps + 1):
        t = row / steps
        center = bezier(points, t)
        tangent = (bezier(points, min(1, t + .001)) - bezier(points, max(0, t - .001))).normalized()
        across = tangent.cross(Vector((0, 1, .04))).normalized()
        normal = across.cross(tangent).normalized()
        r = radius * ((1 - t) ** .65 + .02 if taper else 1)
        for j in range(sides):
            angle = j * math.tau / sides
            vertices.append(center + r * (across * math.cos(angle) + normal * math.sin(angle)))
    for row in range(steps):
        for j in range(sides):
            a = row * sides + j
            b = row * sides + (j + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    faces.extend([tuple(reversed(range(sides))), tuple(steps * sides + j for j in range(sides))])
    return mesh(name, vertices, faces, mat)


def union_sculpt(objects, name, voxel=.008):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    remesh = obj.modifiers.new('Unified organic volume', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = voxel
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth = obj.modifiers.new('Soft integrated transitions', 'SMOOTH')
    smooth.factor = 1.15
    smooth.iterations = 5
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def make_head(mats):
    global PART
    PART = 'head'
    head = loft('Sam white stoat head', [
        (1.43, 0, .02, .14, .10, .14), (1.49, 0, .01, .24, .23, .25),
        (1.60, 0, 0, .35, .31, .30), (1.72, 0, 0, .43, .365, .35),
        (1.84, 0, 0, .465, .372, .38), (1.98, 0, 0, .455, .354, .39),
        (2.12, 0, .015, .443, .347, .37), (2.25, 0, .02, .414, .325, .34),
        (2.35, 0, .025, .345, .28, .285), (2.42, 0, .025, .23, .18, .21),
        (2.455, 0, .025, .025, .035, .035)], mats['fur'], face=True)
    snout = [ellipsoid('Integrated short muzzle', (s * .094, -.379, 1.795), (.141, .116, .088), mats['fur']) for s in (-1, 1)]
    head = union_sculpt([head, *snout], 'Sam continuous head and short muzzle')
    PROJECTED.append(head)
    for s in (-1, 1):
        ear = ellipsoid('Rounded stoat ear', (s * .495, .014, 2.205), (.153, .084, .195), mats['ivory'])
        ear.rotation_euler.y = s * -.20
        inset = ellipsoid('Pink ear hollow', (s * .512, -.058, 2.217), (.107, .025, .145), mats['pink'])
        inset.rotation_euler.y = s * -.20
        cx = .165 if s > 0 else -.188
        eye = ellipsoid('Almond eye white', (cx, -.351, 2.013), (.096, .060, .067), mats['eye'])
        iris = ellipsoid('Grey blue iris', (cx, -.408, 2.013), (.048, .012, .049), mats['iris'])
        ellipsoid('Iris dark limbal ring', (cx, -.410, 2.013), (.0485, .009, .0495), mats['iris_edge'])
        ellipsoid('Iris blue inner disc', (cx, -.419, 2.013), (.042, .005, .043), mats['iris'])
        ellipsoid('Focused pupil', (cx, -.425, 2.015), (.023, .006, .026), mats['pupil'])
        ellipsoid('Softbox eye catchlight', (cx - .011, -.431, 2.034), (.008, .003, .008), mats['eye'], 24, 16)
        ellipsoid('Eye secondary glint', (cx + .013, -.431, 1.996), (.003, .002, .003), mats['eye'], 16, 12)
        for i in range(28):
            angle = i * math.tau / 28
            inner, outer = .027, .041 + .003 * math.sin(i * 7)
            def iris_point(r):
                return (cx + r * math.sin(angle), -.4255, 2.013 + r * math.cos(angle))
            start, finish = iris_point(inner), iris_point(outer)
            tube('Fine iris spokes', [start, start, finish, finish], .00065, mats['iris_light'], sides=4, steps=3)
        tube('Upper eyelid', [(cx - .089, -.377, 2.003), (cx - .066, -.425, 2.098), (cx + .067, -.425, 2.097), (cx + .090, -.379, 2.003)], .0045, mats['lid'])
        tube('Lower fur eyelid', [(cx - .091, -.378, 2.004), (cx - .057, -.415, 1.946), (cx + .061, -.415, 1.948), (cx + .090, -.379, 2.003)], .0045, mats['ivory'])
        brow_points = [(s * .072, -.345, 2.151), (s * .114, -.377, 2.169), (s * .230, -.341, 2.136), (s * .285, -.303, 2.112)]
        tube('Expressive brown eyebrow', brow_points, .021, mats['brow'], taper=True, sides=12)
        for i in range(12):
            t = .04 + i / 15
            start = bezier(brow_points, t)
            end = start + Vector((s * .014, -.004, .013))
            tube('Individual brow hairs', [start, start, end, end], .0015, mats['hair_light'], taper=True, sides=4, steps=4)
    nose_outline = [(-.055, .025), (-.033, .044), (.033, .044), (.055, .025), (.060, -.003), (.033, -.026), (0, -.057), (-.033, -.026), (-.060, -.003)]
    vertices, faces = [], []
    for depth, scale in ((-.509, .78), (-.551, 1), (-.578, .81)):
        vertices.extend((x * scale * 1.3, depth + .035, 1.879 + z * scale * 1.15) for x, z in nose_outline)
    n = len(nose_outline)
    for row in range(2):
        for j in range(n):
            faces.append((row * n + j, row * n + (j + 1) % n, (row + 1) * n + (j + 1) % n, (row + 1) * n + j))
    faces += [tuple(reversed(range(n))), tuple(2 * n + j for j in range(n))]
    mesh('Soft triangular stoat nose', vertices, faces, mats['nose'], 2)
    for s in (-1, 1):
        ellipsoid('Nostril', (s * .042, -.540, 1.866), (.011, .006, .010), mats['pupil'], 24, 16)
        tube('Quiet animal smile', [(0, -.480, 1.775), (s * .046, -.484, 1.747), (s * .105, -.464, 1.754), (s * .139, -.443, 1.77)], .003, mats['mouth'])
        for i in range(4):
            start = (s * .145, -.504, 1.839 - i * .025)
            end = (s * (.49 + i * .014), -.421, 1.871 - i * .055)
            tube('Fine white whisker', [start, (s * .26, -.519, start[2] + .012), (s * .39, -.461, end[2] + .028), end], .0013, mats['ivory'], sides=5, taper=True)
    tube('Short animal philtrum', [(0, -.520, 1.824), (0, -.502, 1.805), (0, -.488, 1.789), (0, -.480, 1.775)], .003, mats['mouth'])


def make_hair(mats):
    # Reuse the project's already-tuned short human groom rather than inventing
    # a second comb of uniform bundles. Fit its scalp to Sam's shorter skull.
    import sys
    sys.path.insert(0, str(ROOT / 'scripts/blender_grassy'))
    from static_hair import build_hair
    objects = build_hair({'hair': mats['hair']}, lambda z: (0, 0, 0, 0))
    for obj in objects:
        obj['npc_part'] = 'head'
        for key in ('grassy_part', 'grassy_detail'):
            if key in obj:
                del obj[key]
        for modifier in list(obj.modifiers):
            obj.modifiers.remove(modifier)
        for vertex in obj.data.vertices:
            vertex.co.x *= .94
            vertex.co.y *= .86
            vertex.co.z = vertex.co.z * .73 + .418
        obj.data.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    hair = bpy.context.object
    hair.name = 'Sam fitted tousled human hair'
    PROJECTED.append(hair)


def make_body(mats):
    global PART
    PART = 'torso'
    body = loft('Charcoal sweater body', [(.77, 0, 0, .285, .215, .205), (.82, 0, 0, .33, .235, .22),
        (.94, 0, 0, .343, .252, .23), (1.12, 0, .01, .324, .24, .23),
        (1.31, 0, .015, .299, .216, .22), (1.41, 0, .02, .263, .187, .197),
        (1.47, 0, .025, .205, .167, .166)], mats['sweater'])
    PROJECTED.append(body)
    loft('Ribbed sweater hem', [(.774, 0, 0, .299, .216, .209), (.785, 0, 0, .317, .226, .22),
        (.856, 0, 0, .322, .231, .223), (.865, 0, 0, .307, .215, .215)], mats['rib'], sides=160, subdivision=1, rib=.012)
    loft('Knitted round collar', [(1.419, 0, .005, .218, .175, .177), (1.452, 0, .008, .228, .182, .18),
        (1.489, 0, .016, .214, .177, .18), (1.481, 0, .016, .198, .16, .163)], mats['rib'], sides=160, subdivision=1, rib=.010)
    for s in (-1, 1):
        tube('Raglan sweater seam', [(s * .193, -.158, 1.454), (s * .244, -.179, 1.406), (s * .284, -.20, 1.296), (s * .31, -.18, 1.23)], .0025, mats['stitch'])
    badge = ellipsoid('Brushed silver route badge', (.184, -.18, 1.292), (.066, .015, .07), mats['metal'], 48, 24)
    for endpoint in ((.207, -.199, 1.319), (.208, -.199, 1.271)):
        tube('Routing connector', [(.165, -.199, 1.294), (.17, -.199, 1.294), endpoint, endpoint], .005, mats['teal'], sides=8, steps=8)
    for x, z in ((.164, 1.294), (.208, 1.321), (.208, 1.269)):
        ellipsoid('Route node', (x, -.201, z), (.014, .005, .014), mats['teal'], 24, 16)
    for s, side in ((1, 'L'), (-1, 'R')):
        PART = f'arm.{side}'
        sleeve = loft('Soft sweater sleeve', [(.892, s * .482, 0, .081, .088, .095),
            (.93, s * .479, 0, .107, .105, .107), (1.05, s * .458, .01, .133, .116, .112),
            (1.14, s * .427, .018, .133, .116, .115), (1.28, s * .368, .025, .115, .102, .109),
            (1.365, s * .309, .025, .104, .098, .106)], mats['sweater'])
        PROJECTED.append(sleeve)
        loft('Ribbed sleeve cuff', [(.879, s * .485, 0, .086, .087, .089), (.898, s * .484, 0, .094, .095, .097),
            (.955, s * .473, .004, .10, .097, .1), (.958, s * .473, .004, .091, .09, .092)], mats['rib'], sides=160, subdivision=1, rib=.025)
        palm = ellipsoid('Small fur paw', (s * .491, -.012, .799), (.103, .083, .118), mats['ivory'])
        thumb = ellipsoid('Paw thumb', (s * .434, -.066, .809), (.047, .041, .074), mats['ivory'], 32, 24)
        palm = union_sculpt([palm, thumb], 'Rounded short stoat paw', .006)
        for i in (-1, 0, 1):
            x = s * .491 + i * .037
            tube('Paw finger fold', [(x, -.077, .778), (x, -.083, .758), (x + s * .002, -.066, .728), (x + s * .007, -.04, .717)], .0013, mats['fur_shadow'], sides=4, steps=10)
        PART = f'leg.{side}'
        pant = loft('Short denim trouser leg', [(.226, s * .224, .013, .112, .098, .108),
            (.30, s * .225, .012, .145, .134, .124), (.43, s * .217, .013, .142, .139, .137),
            (.62, s * .185, .012, .162, .153, .151), (.80, s * .161, .009, .166, .187, .168),
            (.837, s * .16, .009, .156, .165, .15)], mats['denim'])
        PROJECTED.append(pant)
        loft('Turned denim cuff', [(.222, s * .224, .007, .13, .114, .119), (.235, s * .224, .007, .145, .12, .126),
            (.293, s * .224, .007, .147, .123, .126), (.301, s * .224, .007, .134, .112, .118)], mats['denim_light'], subdivision=1)
        shoe(s, mats)
    PART = 'tail'
    points = [(0, .22, .69), (.20, .39, .35), (.72, .34, .22), (.855, .25, .79)]
    vertices, faces = [], []
    rows, sides = 64, 24
    for i in range(rows + 1):
        t = i / rows
        center = bezier(points, t)
        tangent = (bezier(points, min(1, t + .001)) - bezier(points, max(0, t - .001))).normalized()
        across = tangent.cross(Vector((0, 1, 0))).normalized()
        normal = across.cross(tangent).normalized()
        radius = .092 * (1 - t ** 5) ** .6 + .002
        for j in range(sides):
            angle = math.tau * j / sides
            vertices.append(center + radius * (across * math.cos(angle) + normal * math.sin(angle)))
    for i in range(rows):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    faces.extend([tuple(reversed(range(sides))), tuple(rows * sides + j for j in range(sides))])
    tail = mesh('Curving white stoat tail with black tip', vertices, faces, mats['ivory'], 1)
    tail.data.materials.append(mats['tail_tip'])
    for poly in tail.data.polygons:
        if poly.center.z > .59 and poly.center.x > .73:
            poly.material_index = 1


def shoe(s, mats):
    x = s * .234
    loft('White sneaker sole', [(.015, x, -.052, .151, .239, .159), (.025, x, -.052, .175, .264, .179),
        (.073, x, -.052, .178, .262, .18), (.092, x, -.052, .169, .25, .169)], mats['sole'], sides=64, subdivision=1)
    loft('Rounded leather sneaker', [(.067, x, -.047, .163, .25, .16), (.103, x, -.043, .17, .242, .166),
        (.154, x, -.028, .154, .224, .159), (.205, x, .018, .112, .153, .128),
        (.236, x, .039, .096, .10, .105)], mats['leather'], sides=64, subdivision=2)
    for i in range(4):
        y = -.177 + i * .047
        z = .17 + i * .011
        tube('Sneaker lace', [(x - .064, y, z), (x - .036, y - .004, z + .011), (x + .036, y - .004, z + .011), (x + .064, y, z)], .006, mats['lace'], sides=8, steps=12)
    for sign in (-1, 1):
        tube('Leather stitched toe panel', [(x + sign * .126, -.205, .10), (x + sign * .126, -.187, .16), (x + sign * .086, -.14, .19), (x + sign * .079, -.056, .214)], .0018, mats['stitch_light'], sides=5)


def bake_reference_colors(objects):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 8
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 8
    for index, obj in enumerate(objects):
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        uv = obj.data.uv_layers.new(name='Reference front')
        for poly in obj.data.polygons:
            for loop in poly.loop_indices:
                point = obj.matrix_world @ obj.data.vertices[obj.data.loops[loop].vertex_index].co
                uv.data[loop].uv = ((point.x / PIXEL + 507) / 1024, 1 - (1475 - point.z / PIXEL) / 1536)
        obj.data.uv_layers.new(name='Baked colour')
        obj.data.uv_layers.active_index = len(obj.data.uv_layers) - 1
        obj.data.uv_layers.active.active_render = True
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.015)
        bpy.ops.object.mode_set(mode='OBJECT')
        resolution = 2048 if obj['npc_part'] == 'head' else 1024
        image = bpy.data.images.new(f'Sam surface colour {index}', width=resolution, height=resolution)
        for slot in obj.material_slots:
            slot.material = slot.material.copy()
            node = slot.material.node_tree.nodes.new('ShaderNodeTexImage')
            node.image = image
            slot.material.node_tree.nodes.active = node
        bpy.ops.object.bake(type='DIFFUSE')
        image.filepath_raw = str(OUT / f'surface-{index}.png')
        image.file_format = 'PNG'
        image.save()
        baked = bpy.data.materials.new(f'Sam baked {obj.name}')
        baked.use_nodes = True
        shader = baked.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value = .83
        texture = baked.node_tree.nodes.new('ShaderNodeTexImage')
        texture.image = image
        baked.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
        obj.data.materials.clear()
        obj.data.materials.append(baked)
        obj.data.uv_layers.remove(obj.data.uv_layers['Reference front'])
        image.pack()


def render_preview():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('Sam preview studio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (.34, .37, .42, 1)
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value = .55
    for location, power, size in (((-3, -4, 5), 600, 4), ((3, -2, 3), 380, 3), ((1, 3, 4), 550, 3)):
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.data.energy = power
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (Vector((0, 0, 1.4)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(0, -8, 1.35))
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 3.0
    scene.camera = camera
    for name, location in (('front', (0, -8, 1.35)), ('hero', (3.6, -8, 3.3))):
        camera.location = location
        camera.rotation_euler = (Vector((.04, 0, 1.35)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(OUT / f'source-{name}.png')
        bpy.ops.render.render(write_still=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    mats = {
        'fur': material('White stoat reference fur', 'EEE9DF', .9, .90),
        'ivory': material('Warm white fur', 'EDE8DF', .9), 'fur_shadow': material('Fine paw crease', 'CFC7BA', .95),
        'pink': material('Warm pink ear hollow', 'D3A59A', .85), 'eye': material('Warm eye white', 'F6F3EA', .23),
        'iris': material('Blue grey iris', '7195AE', .26), 'iris_edge': material('Dark iris edge', '334956', .28),
        'iris_light': material('Radial iris details', 'A6B6BE', .29), 'pupil': material('Soft black pupils', '17191B', .20),
        'lid': material('Warm eyelid rim', 'A78274', .65), 'nose': material('Brown black animal nose', '594037', .38),
        'mouth': material('Gentle mouth crease', '786255', .8), 'brow': material('Brown expressive eyebrows', '604836', .72),
        'hair': material('Hair reference groom', '33251D', .76, .85), 'hair_mid': material('Chestnut hair bundles', '514034', .5),
        'hair_light': material('Warm fine hair highlights', '695242', .5),
        'sweater': material('Reference charcoal knit', '555253', .9, .75), 'rib': material('Charcoal ribbed knit', '49474A', .95),
        'stitch': material('Dark knit seam', '403E40', .95), 'metal': material('Brushed badge silver', 'CFCFC9', .30),
        'teal': material('Teal model router glyph', '079D99', .35), 'denim': material('Blue reference denim', '2C6090', .9, .68),
        'denim_light': material('Turned blue denim', '6785A3', .95), 'denim_stitch': material('Copper denim seams', 'AD8050', .8),
        'sole': material('Warm rubber soles', 'D8D2C7', .8), 'leather': material('Off white sneaker leather', 'E9E4DA', .6),
        'lace': material('White cotton laces', 'F0ECE2', .85), 'stitch_light': material('Leather panel stitches', 'BFB7A8', .85),
        'tail_tip': material('Dark stoat tail tip', '2A2525', .95),
    }
    make_head(mats)
    make_hair(mats)
    make_body(mats)
    bake_reference_colors(PROJECTED)
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'source.glb'), export_format='GLB', use_selection=True,
        export_yup=True, export_animations=False, export_materials='EXPORT', export_extras=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'source.blend'))
    render_preview()
    print(f'Sam source finished: {len(objects)} meshes; source.glb + source.blend')


if __name__ == '__main__':
    main()
