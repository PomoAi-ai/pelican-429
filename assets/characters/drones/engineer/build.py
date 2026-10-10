"""Rebuild the engineer drone: Blender --background --python <this file>."""
import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
FPS = 24
CLIPS = {'idle': 2, 'move': 1, 'work': 1.5, 'carry': 2, 'unload': 1.25,
         'build': 2, 'dock': 2.5, 'stalled': 2}
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.fps = FPS
parts = []


def mat(name, color, metal=0, rough=.35, glow=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = m.diffuse_color
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Emission Color'].default_value = m.diffuse_color
    bs.inputs['Emission Strength'].default_value = glow
    return m


orange = mat('Enamel / safety amber', (.92, .24, .018), .25, .3)
amber = mat('Enamel / sunlit amber', (1, .48, .055), .2, .31)
gray = mat('Chassis / graphite', (.027, .035, .045), .6, .32)
rubber = mat('Gripper / soft graphite', (.014, .019, .025), .05, .65)
steel = mat('Hardware / brushed titanium', (.34, .40, .46), .8, .24)
black = mat('Recesses / carbon', (.006, .009, .012), .15, .4)
optic = mat('Optics / warm laser', (1, .19, .018), .35, .2, 2)
status = mat('Status / code tint / untextured white', (1, 1, 1), .05, .25, .65)
# A real packed texture carries only safety markings; the status material stays untextured.
hazard = mat('Markings / diagonal safety tape', (.9, .4, .02), .15, .45)
tex = bpy.data.images.new('Safety tape / embedded RGBA', width=128, height=128)
pixels = []
for y in range(128):
    for x in range(128):
        color = (.06, .075, .09, 1) if ((x + y) // 18) % 2 else (1, .57, .06, 1)
        pixels.extend(color)
tex.pixels.foreach_set(pixels)
tex.filepath_raw = str(OUT / 'safety-tape.png')
tex.file_format = 'PNG'
tex.save()
tex.pack()
node = hazard.node_tree.nodes.new('ShaderNodeTexImage')
node.image = tex
hazard.node_tree.links.new(node.outputs['Color'], hazard.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])


def empty(name, loc, parent=None):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    o.location = loc
    o.parent = parent
    parts.append(o)
    return o


root = empty('engineer', (0, 0, 0))
root['forward'] = '+X'
root['up'] = '+Y (glTF)'
root['height'] = .8
root.scale.x = 1.14
body_center_x = -.00825
root['animationLoops'] = {name: name != 'unload' for name in CLIPS}
body = empty('flight_body', (body_center_x, 0, 0), root)


def finish(o, name, loc, material, parent, bevel=0):
    o.name = name
    o.location = loc
    o.parent = parent
    o.data.materials.append(material)
    if bevel:
        mod = o.modifiers.new('Soft machined edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in o.data.polygons:
        poly.use_smooth = True
    parts.append(o)
    return o


def box(name, loc, size, material, parent=body, bevel=.018):
    bpy.ops.mesh.primitive_cube_add()
    o = bpy.context.object
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, loc, material, parent, bevel)


def cyl(name, loc, radius, depth, material, parent=body, axis='Z', vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    o = finish(bpy.context.object, name, loc, material, parent, .004)
    if axis == 'X':
        o.rotation_euler.y = math.pi / 2
    elif axis == 'Y':
        o.rotation_euler.x = math.pi / 2
    return o


def ring(name, loc, outer, inner, depth, material, parent=body):
    verts, faces = [], []
    n = 64
    for z, r in [(-depth / 2, outer), (depth / 2, outer),
                 (-depth / 2, inner), (depth / 2, inner)]:
        verts.extend((r * math.cos(i * math.tau / n), r * math.sin(i * math.tau / n), z) for i in range(n))
    for i in range(n):
        j = (i + 1) % n
        faces.extend([(i, j, n + j, n + i), (2*n+i, 3*n+i, 3*n+j, 2*n+j),
                      (n+i, n+j, 3*n+j, 3*n+i), (i, 2*n+i, 2*n+j, j)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(o)
    return finish(o, name, loc, material, parent, .006)


box('Lower impact cradle', (-.015, 0, .455), (.66, .28, .16), gray, bevel=.06)
box('Armored orange hull', (-.045, 0, .56), (.72, .27, .24), orange, bevel=.09)
box('Crown armor', (-.07, 0, .678), (.49, .22, .038), amber, bevel=.017)
box('Nose graphite bumper', (.303, 0, .54), (.11, .25, .20), gray, bevel=.04)
box('Rear graphite bumper', (-.394, 0, .535), (.07, .25, .19), gray, bevel=.02)
for side in [-1, 1]:
    y = side * .30
    ring(f'Duct {side} / amber housing', (-.055, y, .555), .205, .169, .135, orange)
    ring(f'Duct {side} / top lip', (-.055, y, .624), .204, .173, .024, amber)
    ring(f'Duct {side} / inner liner', (-.055, y, .55), .174, .158, .11, gray)
    ring(f'Duct {side} / lower lip', (-.055, y, .486), .199, .163, .017, gray)
    rotor = empty(f'rotor_{side}', (-.055, y, .553), body)
    cyl(f'Rotor {side} / hub', (0, 0, 0), .042, .055, steel, rotor)
    for b in range(7):
        blade = box(f'Rotor {side} / blade {b}', (0, 0, 0), (.128, .029, .01), gray, rotor, .005)
        a = b * math.tau / 7
        blade.location = (.085 * math.cos(a), .085 * math.sin(a), 0)
        blade.rotation_euler = (.15, .08, a + .22)
    # Cross braces sit within the annular housing, without an exposed X airframe.
    for a in [0, math.pi/2]:
        brace = box(f'Duct {side} / grille', (-.055, y, .598), (.316, .013, .012), steel, bevel=.003)
        brace.rotation_euler.z = a
    panel = box(f'Safety tape {side}', (-.045, side * .507, .555), (.19, .004, .055), hazard, bevel=.001)
    for x in [-.25, .13]:
        cyl(f'Duct {side} / captive bolt {x}', (x, y, .636), .01, .008, steel)
    for x in [-.25, -.207, -.164]:
        box(f'Rear louvre {side} {x}', (x, side*.138, .59), (.022, .009, .073), gray, bevel=.005)
    box(f'Forward marker {side}', (.303, side*.118, .57), (.039, .036, .038), amber, bevel=.012)

cyl('Beacon graphite plinth', (-.11, 0, .72), .076, .044, gray)
cyl('status_light', (-.11, 0, .769), .058, .062, status)
ring('Beacon guard collar', (-.11, 0, .745), .064, .055, .01, steel)
# +X is the actual barrel direction, also recorded on the empty attachment node.
laser = empty('laser_gimbal', (.325, 0, .512), body)
cyl('Laser / armored sleeve', (.046, 0, 0), .068, .093, orange, laser, 'X')
cyl('Laser / graphite rim', (.098, 0, 0), .055, .025, gray, laser, 'X')
cyl('Laser / optical seat', (.112, 0, 0), .039, .006, steel, laser, 'X')
cyl('Laser / emission aperture', (.117, 0, 0), .021, .007, optic, laser, 'X')
socket = empty('laser_socket', (.122, 0, 0), laser)
socket['forward'] = '+X'

cyl('Claw / shoulder bearing', (0, 0, .386), .067, .14, gray, axis='Y')
shoulder = empty('claw_shoulder', (0, 0, .386), body)
cyl('Claw / shoulder cap', (0, -.079, 0), .041, .018, steel, shoulder, 'Y')
arm = box('Claw / upper linkage', (-.047, 0, -.078), (.061, .085, .177), orange, shoulder, .018)
arm.rotation_euler.y = .53
elbow = empty('claw_elbow', (-.090, 0, -.151), shoulder)
cyl('Claw / elbow joint', (0, 0, 0), .044, .11, steel, elbow, 'Y')
arm = box('Claw / forearm', (.062, 0, -.04), (.15, .059, .053), gray, elbow, .015)
arm.rotation_euler.y = .52
wrist = empty('claw_wrist', (.12, 0, -.077), elbow)
cyl('Claw / wrist coupling', (0, 0, 0), .041, .054, orange, wrist)
for sign in [-1, 1]:
    jaw = empty(f'claw_jaw_{sign}', (0, sign*.041, -.025), wrist)
    cyl(f'Claw / knuckle {sign}', (0, 0, 0), .019, .055, steel, jaw, 'X')
    link = box(f'Claw / finger {sign}', (0, sign*.021, -.055), (.035, .029, .117), steel, jaw, .01)
    link.rotation_euler.x = sign * .36
    box(f'Claw / rubber toe {sign}', (.009, sign*.028, -.113), (.068, .050, .027), rubber, jaw, .01)
empty('cargo_socket', (.006, 0, -.135), wrist)

# glTF has no portable visibility bit: zero scale is the interoperable Lv1 default.
drill = empty('drill', (.245, 0, .352), body)
drill['defaultHidden'] = True
drill['visible'] = False
drill['enabledScale'] = [1, 1, 1]
cyl('Drill / motor', (0, 0, 0), .051, .13, gray, drill, 'X')
cyl('Drill / amber collar', (.064, 0, 0), .055, .031, orange, drill, 'X')
bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=.045, radius2=0, depth=.15)
o = finish(bpy.context.object, 'Drill / conical cutter', (.149, 0, 0), steel, drill)
o.rotation_euler.y = math.pi / 2
for i in range(5):
    ring_o = ring(f'Drill / cutting flute {i}', (.09+i*.022, 0, 0), .043-i*.006, .031-i*.005, .008, gray, drill)
    ring_o.rotation_euler.y = math.pi/2
rack = empty('rack', (-.30, 0, .43), body)
rack['defaultHidden'] = True
rack['visible'] = False
rack['enabledScale'] = [1, 1, 1]
box('Rack / platform', (-.034, 0, 0), (.26, .42, .03), gray, rack, .01)
for s in [-1, 1]:
    box(f'Rack / rail {s}', (-.035, s*.2, .051), (.26, .018, .10), orange, rack, .008)
    box(f'Rack / hazard tip {s}', (-.15, s*.2, .04), (.016, .025, .07), hazard, rack, .002)
for o in [drill, rack]:
    o.scale = (0, 0, 0)

animated = [body, shoulder, elbow, wrist, laser,
            bpy.data.objects['claw_jaw_-1'], bpy.data.objects['claw_jaw_1'],
            bpy.data.objects['rotor_-1'], bpy.data.objects['rotor_1']]
rest = {o.name: (o.location.copy(), o.rotation_euler.copy()) for o in animated}
for name, duration in CLIPS.items():
    frames = round(duration * FPS)
    for o in animated:
        o.animation_data_create()
        act = bpy.data.actions.new(f'{name}/{o.name}')
        o.animation_data.action = act
        for f in range(frames+1):
            t = f/frames
            phase = math.tau*t
            o.location = rest[o.name][0]
            o.rotation_euler = (0, 0, 0)
            if o == body:
                o.location.z += .01*math.sin(phase)
                o.rotation_euler.x = .012*math.sin(phase)
                if name == 'move':
                    o.rotation_euler.y = .15 + .012*math.sin(phase)
                elif name == 'carry':
                    o.rotation_euler.y = .055 + .007*math.sin(phase)
                    o.location.z = .014*math.sin(phase)
                elif name == 'work':
                    o.location.x += .004*math.sin(phase*6)
                elif name == 'build':
                    o.location.x += .018*math.sin(phase)
                elif name == 'unload':
                    o.location.z = -.035 * math.sin(t*math.pi/2)
                elif name == 'dock':
                    o.location.z = -.016*(1-math.cos(phase))
                elif name == 'stalled':
                    o.location.z = -.065*(.5-.5*math.cos(phase))
                    o.rotation_euler = (.09*math.sin(phase*2), .055*math.sin(phase*3), 0)
            elif o == shoulder:
                o.rotation_euler.y = {'move': -.32, 'carry': -.12, 'dock': -.52*(.5-.5*math.cos(phase)), 'work': .05*math.sin(phase*3), 'build': .12*math.sin(phase)}.get(name, 0)
            elif o == elbow:
                o.rotation_euler.y = {'move': .48, 'carry': .15, 'dock': .9*(.5-.5*math.cos(phase)), 'build': -.16*math.sin(phase)}.get(name, 0)
            elif o == wrist:
                o.rotation_euler.z = .10*math.sin(phase) if name in ['work', 'build'] else 0
            elif o == laser:
                o.rotation_euler.y = .045*math.sin(phase*2) if name == 'work' else .1*math.sin(phase) if name == 'build' else 0
                o.rotation_euler.z = .08*math.cos(phase) if name == 'build' else 0
            elif o.name.startswith('claw_jaw_'):
                sign = -1 if o.name.endswith('-1') else 1
                opening = -.28 if name == 'carry' else .08
                if name == 'unload':
                    opening = -.28 + .9*(.5-.5*math.cos(math.pi*min(t/.8, 1)))
                elif name == 'dock':
                    opening = -.22*(.5-.5*math.cos(phase))
                o.rotation_euler.x = sign*opening
            elif o.name.startswith('rotor_'):
                sign = -1 if o.name.endswith('-1') else 1
                o.rotation_euler.z = sign*phase*4
            o.keyframe_insert(data_path='location', frame=f+1)
            o.keyframe_insert(data_path='rotation_euler', frame=f+1)
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
        track = o.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, act)
        track.mute = True
        o.animation_data.action = None
        o.location, o.rotation_euler = rest[o.name]
scene.frame_set(1)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'), export_format='GLB', use_selection=True,
                         export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                         export_force_sampling=True, export_optimize_animation_keep_anim_object=True, export_extras=True, export_apply=True,
                         export_anim_slide_to_zero=True)

# Studio objects are preview-only and are added after the GLB export.
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.world.color = (.12, .12, .12)
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
floor_mat = mat('Studio / warm neutral', (.19, .205, .225), 0, .65)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.075))
bpy.context.object.data.materials.append(floor_mat)
bpy.context.object.name = 'STUDIO floor'
for name, pos, energy, size, color in [('Key', (2,-3,5), 500, 4, (1,.85,.69)), ('Fill', (0,3,2.5), 350, 3, (.67,.79,1)), ('Rim', (-3,-1,3), 500, 3, (1,.9,.74))]:
    data = bpy.data.lights.new('STUDIO '+name, 'AREA')
    data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
    obj = bpy.data.objects.new('STUDIO '+name, data)
    scene.collection.objects.link(obj)
    obj.location = pos
    obj.rotation_euler = (Vector((0,0,.4))-obj.location).to_track_quat('-Z','Y').to_euler()
camdata = bpy.data.cameras.new('STUDIO camera')
cam = bpy.data.objects.new('STUDIO camera', camdata)
scene.collection.objects.link(cam)
scene.camera = cam
camdata.type = 'ORTHO'
camdata.ortho_scale = 1.55


def render(name, pos):
    cam.location = pos
    cam.rotation_euler = (Vector((0,0,.40))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(OUT/name)
    bpy.ops.render.render(write_still=True)


render('preview-hero.png', (2.4,-3.2,2.1))
render('preview-side.png', (0,-4,.65))
for o in [drill, rack]:
    o.scale = (1,1,1)
render('preview-lv2.png', (2.4,-3.2,2.1))
for o in [drill, rack]:
    o.scale = (0,0,0)
cam.location = (2.4,-3.2,2.1)
cam.rotation_euler = (Vector((0,0,.40))-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'model.blend'))
# Contact sheet source frames demonstrate every clip at its midpoint.
scene.render.resolution_x = 600
scene.render.resolution_y = 450
scene.cycles.samples = 16
for name, duration in CLIPS.items():
    for o in animated:
        o.animation_data.action = bpy.data.actions[f'{name}/{o.name}']
    scene.frame_set(round(duration*FPS*.5)+1)
    scene.render.filepath = str(OUT/f'animation-{name}.png')
    bpy.ops.render.render(write_still=True)

# Small rendered frames give a real animation contact sheet, not inferred motion.
scene.render.resolution_x = 400
scene.render.resolution_y = 300
scene.cycles.samples = 8
frame_dir = OUT / 'animation-frames'
frame_dir.mkdir(exist_ok=True)
for name, duration in CLIPS.items():
    for o in animated:
        o.animation_data.action = bpy.data.actions[f'{name}/{o.name}']
    for sample in range(12):
        scene.frame_set(round(duration*FPS*sample/12)+1)
        scene.render.filepath = str(frame_dir/f'{name}-{sample:02}.png')
        bpy.ops.render.render(write_still=True)

# Reload exported GLB, so validation measures the delivered asset, not the authoring scene.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/'model.glb'))
bpy.context.view_layer.update()
points = [o.matrix_world @ v.co for o in scene.objects if o.type == 'MESH' and o.matrix_world.determinant() != 0 for v in o.data.vertices]
lo = [min(p[i] for p in points) for i in range(3)]
hi = [max(p[i] for p in points) for i in range(3)]
raw = (OUT/'model.glb').read_bytes()
jsonlen = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20+jsonlen])
node_names = {n.get('name'): n for n in gltf['nodes']}
clip_names = [a['name'] for a in gltf['animations']]
assert set(clip_names) == set(CLIPS), clip_names
assert all(name in node_names for name in ['status_light','laser_socket','cargo_socket','drill','rack'])
assert abs(lo[2]) <= .03, lo
assert abs((hi[2]-lo[2])-.8) <= .03, (lo,hi)
assert .85 <= hi[0]-lo[0] <= 1.15, (lo,hi)
assert all(node_names[n]['scale'] == [0,0,0] for n in ['drill','rack'])
assert len(gltf.get('images', [])) >= 1
assert all('bufferView' in image for image in gltf['images'])
status_node = node_names['status_light']
status_material = gltf['materials'][gltf['meshes'][status_node['mesh']]['primitives'][0]['material']]
assert 'baseColorTexture' not in status_material['pbrMetallicRoughness']
assert status_material['pbrMetallicRoughness'].get('baseColorFactor', [1,1,1,1]) == [1,1,1,1]
result = {'source':'Round-trip import of delivered model.glb', 'axes':'glTF +X forward, +Y up; Blender import +Z up',
          'boundsGlTF': {'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]]},
          'height':hi[2]-lo[2], 'widthX':hi[0]-lo[0], 'depthZ':hi[1]-lo[1], 'lowestY':lo[2],
          'nodes':{name:True for name in ['status_light','laser_socket','cargo_socket','drill','rack']},
          'animations':{a['name']:{'channels':len(a['channels']),'loop':a['name']!='unload'} for a in gltf['animations']},
          'embeddedImages':len(gltf['images']), 'statusUntexturedWhite':True, 'defaultHiddenScaleZero':['drill','rack'],
          'meshCount':len(gltf['meshes']), 'bytes':len(raw)}
(OUT/'validation.json').write_text(json.dumps(result, indent=2)+'\n')
print('ENGINEER VALIDATION', json.dumps(result))
