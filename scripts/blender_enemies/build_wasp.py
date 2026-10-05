"""Retain the Rodin carbon chassis and build a compact white game canopy."""
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/blender_npcs'))
from studio import setup_studio, _aim
SOURCE = ROOT / 'assets/characters/enemies/watch-wasp'
OUT = ROOT / 'public/characters/enemies/watch-wasp'
HEIGHT = .8


def material(name, color, metallic=0, roughness=.35, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = mat.diffuse_color
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Emission Color'].default_value = mat.diffuse_color
    shader.inputs['Emission Strength'].default_value = emission
    return mat


def mesh_object(name, vertices, faces, mat, bevel=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.materials.append(mat)
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    if bevel:
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('Machined edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def box(name, center, scale, mat, bevel=.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    obj.data.materials.append(mat)
    mod = obj.modifiers.new('Rounded corners', 'BEVEL')
    mod.width = bevel
    mod.segments = 3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cylinder(name, start, end, radius, mat, vertices=32):
    a, b = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b-a).length, location=(a+b)/2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.append(mat)
    return obj


def compact_shell(pivots):
    white = material('Wasp body shell', (.82, .86, .90), .12, .29)
    dark = material('Wasp carbon details', (.012, .019, .025), .25, .38)
    silver = material('Wasp motor silver', (.48, .54, .60), .82, .24)
    accent = material('Wasp accent', (.015, .67, .77), .45, .26)
    lamp = material('Wasp light', (.012, .62, .77), .15, .25, 2.0)
    glass = material('Wasp camera glass', (.006, .06, .075), .72, .12)
    # Eight-sided cross sections form a low, continuous canopy over the exposed battery.
    sections = [(-.62,.14,.21,.32),(-.44,.24,.18,.43),(-.08,.27,.16,.46),(.37,.255,.15,.425),(.68,.22,.13,.37),(.88,.17,.12,.335)]
    vertices=[]
    for x,w,b,t in sections:
        vertices.extend([(x,-w*.68,t),(x,w*.68,t),(x,w,t-.065),(x,w,b+.055),(x,w*.68,b),(x,-w*.68,b),(x,-w,b+.055),(x,-w,t-.065)])
    faces=[tuple(reversed(range(8))),tuple((len(sections)-1)*8+j for j in range(8))]
    faces.extend((i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j) for i in range(len(sections)-1) for j in range(8))
    objects=[mesh_object('Wasp white sculpted canopy',vertices,faces,white,.008)]
    for side in [-1,1]:
        y=side*.276
        # A single restrained cooling recess and forward light keep the side silhouette clean.
        objects.append(mesh_object('Wasp side cooling recess', [(-.22,y,.34),(.06,y,.325),(.16,y,.235),(-.13,y,.25)],[(0,1,2,3)],dark))
        for i in range(3):
            objects.append(box('Wasp vent fin',(-.04,y*1.008,.269+i*.018),(.235,.008,.008),dark,.002))
        objects.append(mesh_object('Wasp forward light',[(.32,side*.258,.343),(.58,side*.238,.31),(.61,side*.235,.281),(.35,side*.259,.31)],[(0,1,2,3)],lamp))
        objects.append(mesh_object('Wasp rear accent', [(-.5,side*.21,.365),(-.35,side*.251,.39),(-.36,side*.253,.369),(-.51,side*.213,.344)],[(0,1,2,3)],accent))
    # Front bezel and lens stay independent so the retained camera joint can aim during skills.
    objects.append(box('Wasp front camera bezel',(.885,0,.222),(.035,.256,.204),dark,.033))
    objects.append(cylinder('Wasp camera silver rim',(.90,0,.222),(.916,0,.222),.087,silver))
    objects.append(cylinder('Wasp camera lens',(.917,0,.222),(.93,0,.222),.067,glass))
    objects.append(cylinder('Wasp camera pupil',(.931,0,.222),(.933,0,.222),.028,dark))
    for side in [-1,1]:
        objects.append(box('Wasp nose light',(.894,side*.147,.238),(.018,.018,.148),lamp,.006))
    objects.append(cylinder('Wasp antenna mast',(-.49,0,.405),(-.68,0,.72),.014,dark))
    objects.append(cylinder('Wasp antenna cap',(-.68,0,.72),(-.73,0,.799),.033,dark))
    for index in range(4):
        x,y,z=pivots[f'rotor{index}']
        bpy.ops.mesh.primitive_torus_add(major_segments=32, minor_segments=6, location=(x,y,z-.06), major_radius=.137, minor_radius=.006)
        ring=bpy.context.object
        ring.name='Wasp motor accent ring'
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        ring.data.materials.append(accent)
        objects.append(ring)
        # Painted upper arm saddle retains the source carbon arm below.
        objects.append(box('Wasp arm white saddle',(x*.83,y*.65,.16),(.20,.27,.045),white,.013))
        objects.append(box('Wasp arm light',(x*.83,y*.65,.186),(.075,.18,.008),lamp,.003))
    return objects


def make_propellers(pivots):
    material = bpy.data.materials.new('Wasp propeller')
    material.diffuse_color = (.022, .028, .035, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = material.diffuse_color
    shader.inputs['Metallic'].default_value = .12
    shader.inputs['Roughness'].default_value = .48
    tip = bpy.data.materials['Wasp accent']
    objects = []
    for count, label in [(2, 'Two'), (3, 'Three')]:
        for index in range(4):
            center = Vector(pivots[f'rotor{index}'])
            vertices, faces = [], []
            # A swept paddle with real thickness remains readable from the game's side camera.
            profile = [(.015,-.025),(.17,-.052),(.34,-.043),(.44,-.02),(.48,.007),(.478,.037),(.45,.06),(.36,.074),(.17,.061),(.04,.028)]
            for blade in range(count):
                angle = blade * math.tau / count + index * .55
                offset = len(vertices)
                for z in [-.006, .006]:
                    for x, y in profile:
                        vertices.append(tuple(center + Vector((x*math.cos(angle)-y*math.sin(angle), x*math.sin(angle)+y*math.cos(angle), z))))
                n = len(profile)
                faces.extend([tuple(offset+i for i in reversed(range(n))), tuple(offset+n+i for i in range(n))])
                faces.extend((offset+i, offset+(i+1)%n, offset+n+(i+1)%n, offset+n+i) for i in range(n))
            data = bpy.data.meshes.new(f'Propeller {count} blades')
            data.from_pydata(vertices, [], faces)
            data.materials.append(material)
            data.materials.append(tip)
            for poly in data.polygons:
                if (poly.center-center).length > .34:
                    poly.material_index = 1
            obj = bpy.data.objects.new(f'WaspRotor{label}{index}', data)
            bpy.context.collection.objects.link(obj)
            objects.append(obj)
    return objects


def build():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE / 'rodin-original/source.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in meshes:
        obj.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z') @ obj.matrix_world)
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
    pts = np.array([tuple(v.co) for o in meshes for v in o.data.vertices])
    lo, hi = pts.min(0), pts.max(0)
    transform = Matrix.Scale(HEIGHT / (hi[2] - lo[2]), 4) @ Matrix.Translation(Vector((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])))
    for obj in meshes:
        obj.data.transform(transform)
    # Pivots measured on the retained source top view, then refined from the red motor housings.
    approximate = [(-.36, -.68), (-.26, .79), (.89, -.73), (.89, .67)]
    pivots = {}
    for index, (x, y) in enumerate(approximate):
        points = []
        for obj in meshes:
            shader = next(n for n in obj.data.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            tex = shader.inputs['Base Color'].links[0].from_node.image
            pixels = np.array(tex.pixels[:]).reshape(tex.size[1], tex.size[0], 4)
            for poly in obj.data.polygons:
                for li in poly.loop_indices:
                    v = obj.data.vertices[obj.data.loops[li].vertex_index].co
                    if abs(v.x-x) > .2 or abs(v.y-y) > .2:
                        continue
                    uv = obj.data.uv_layers.active.data[li].uv
                    c = pixels[min(tex.size[1]-1,max(0,int(uv.y*tex.size[1]))), min(tex.size[0]-1,max(0,int(uv.x*tex.size[0])))]
                    if c[0] > .20 and c[0] > c[1]*1.5 and c[0] > c[2]*1.5:
                        points.append(tuple(v))
        if not points:
            raise ValueError(f'No orange motor surface at rotor {index}')
        motor = np.array(points)
        center = (motor.min(0) + motor.max(0)) / 2
        pivots[f'rotor{index}'] = (float(center[0]),float(center[1]),float(motor[:,2].max()+.025))
    pivots['root'] = (0,0,.2)
    pivots['camera'] = (.77,0,.21)
    # Separate the source blades for replacement while retaining the original motors and frame.
    for obj in meshes:
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        blades = [f for f in mesh.faces if any(
            math.hypot(f.calc_center_median().x-p[0], f.calc_center_median().y-p[1]) < .53
            and abs(f.calc_center_median().y) > .30
            and p[2]-.025 < f.calc_center_median().z < p[2]+.12
            for name, p in pivots.items() if name.startswith('rotor'))]
        bmesh.ops.delete(mesh, geom=blades, context='FACES')
        mesh.to_mesh(obj.data)
        mesh.free()
    # Remove the tall battery, straps, wiring and old camera. Keep only the carbon chassis and motor stations.
    for obj in meshes:
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        old_body = [face for face in mesh.faces if abs(face.calc_center_median().y) < .33
                    and (face.calc_center_median().z > .13 or
                         (face.calc_center_median().x > .62 and abs(face.calc_center_median().y) < .20 and face.calc_center_median().z > .06))]
        bmesh.ops.delete(mesh, geom=old_body, context='FACES')
        mesh.to_mesh(obj.data)
        mesh.free()
    shell_meshes = compact_shell(pivots)
    for obj in meshes:
        mesh=bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.bisect_plane(mesh, geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces), plane_co=(0,0,.135), plane_no=(0,0,1))
        mesh.to_mesh(obj.data)
        mesh.free()
        obj.data.materials.append(bpy.data.materials['Wasp motor silver'])
        for poly in obj.data.polygons:
            if any(math.hypot(poly.center.x-p[0], poly.center.y-p[1]) < .21 and poly.center.z > .135
                   for name,p in pivots.items() if name.startswith('rotor')):
                poly.material_index = len(obj.data.materials)-1
    meshes.extend(shell_meshes)
    meshes.extend(make_propellers(pivots))
    # Normalize the complete replacement to the existing loader's height and floor contract.
    points = np.array([tuple(v.co) for obj in meshes for v in obj.data.vertices])
    floor, top = points[:,2].min(), points[:,2].max()
    scale = HEIGHT / (top-floor)
    normalize = Matrix.Scale(scale,4) @ Matrix.Translation((0,0,-floor))
    for obj in meshes: obj.data.transform(normalize)
    pivots = {name: tuple(normalize @ Vector(p)) for name,p in pivots.items()}
    data = bpy.data.armatures.new('FPV mechanical joints')
    rig = bpy.data.objects.new('WatchWaspRig', data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name in ['root', 'camera', 'rotor0', 'rotor1', 'rotor2', 'rotor3']:
        b = data.edit_bones.new(name)
        b.head = pivots[name]
        b.tail = Vector(pivots[name]) + Vector((0,0,.08))
        if name != 'root':
            b.parent = data.edit_bones['root']
    bpy.ops.object.mode_set(mode='OBJECT')
    counts = {name: 0 for name in pivots}
    for obj in meshes:
        groups = {name: obj.vertex_groups.new(name=name) for name in pivots}
        for v in obj.data.vertices:
            name = f'rotor{obj.name[-1]}' if obj.name.startswith('WaspRotor') else 'root'
            if name == 'root' and obj.name.startswith(('Wasp front camera', 'Wasp camera')):
                name = 'camera'
            groups[name].add([v.index], 1, 'REPLACE')
            counts[name] += 1
        obj.parent = rig
        mod = obj.modifiers.new('Mechanical articulation', 'ARMATURE')
        mod.object = rig
    scene = bpy.context.scene
    scene.render.fps = 60
    rig.animation_data_create()
    actions = {}
    durations = {'idle':120, 'move':120, 'skill1':85, 'skill2':109, 'hit':36}
    for name, frames in durations.items():
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        for frame in range(frames+1):
            t = frame/frames
            phase = t*math.tau
            for bone in rig.pose.bones:
                bone.rotation_mode='XYZ';bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
            root = rig.pose.bones['root']
            root.location.y = .012*math.sin(phase)
            root.rotation_euler.x=.015*math.sin(phase)
            for i in range(4):
                # Four full revolutions per second; small baked steps prevent quaternion aliasing.
                rig.pose.bones[f'rotor{i}'].rotation_euler.y = (1 if i in (0,3) else -1) * frame/60 * math.tau*4
            camera = rig.pose.bones['camera']
            if name=='move':
                root.rotation_euler.z = .06*math.sin(phase)
                camera.rotation_euler.z=-root.rotation_euler.z
            if name.startswith('skill'):
                release = (48 if name=='skill1' else 60)/frames
                charge = min(t/release, 1) if t < release else max(0, 1-(t-release)/.28)
                recoil = math.sin(math.pi*(t-release)/.10) if release < t < release+.10 else 0
                camera.rotation_euler.z=.14*charge
                root.rotation_euler.z=-.12*recoil
                root.location.x=-.055*recoil
                if name=='skill2':
                    root.rotation_euler.y=.15*math.sin(phase)*charge
            if name=='hit':
                pulse=math.sin(math.pi*t)*math.exp(-2*t)
                root.rotation_euler.x=.23*pulse
                root.rotation_euler.z=-.17*pulse
                camera.rotation_euler.z=.12*pulse
            for bone in rig.pose.bones:
                bone.keyframe_insert(data_path='rotation_euler',frame=frame+1,group=bone.name)
                bone.keyframe_insert(data_path='location',frame=frame+1,group=bone.name)
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points: key.interpolation='LINEAR'
        track=rig.animation_data.nla_tracks.new();track.name=name
        track.strips.new(name,1,action);track.mute=True
        actions[name]=action
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.location=(0,0,0);bone.rotation_euler=(0,0,0)
    scene.frame_set(1);bpy.context.view_layer.update()
    OUT.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
    for obj in meshes:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_anim_slide_to_zero=True,export_skins=True,export_materials='EXPORT',export_apply=False)
    for obj in meshes:
        if obj.name.startswith('WaspRotorThree'):
            obj.hide_render = True
    camera=setup_studio(HEIGHT)
    scene.render.resolution_x=1000;scene.render.resolution_y=700;scene.cycles.samples=24
    camera.data.ortho_scale=2.9
    # The white canopy needs restrained highlights so the faceted side panels remain visible.
    scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=.2
    background=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
    background.inputs['Strength'].default_value=.35
    for name,pos in [('front',(4,0,.4)),('side',(0,-4,.4)),('thumbnail',(3,-4,2))]:
        camera.location=pos;_aim(camera,(0,0,.4));scene.render.filepath=str(OUT/f'{name}.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'watch-wasp-rigged.blend'))
    report={'height':HEIGHT,'forward':'+X','pivots':pivots,'vertexCounts':counts,'clips':{n:f/60 for n,f in durations.items()},'source':'rodin-original/source.glb','color':'fixed white sculpted canopy / accent motor rings and blade tips / emissive accent lights / retained carbon chassis','propellerVariants':[2,3]}
    (SOURCE/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))

if __name__=='__main__':build()
