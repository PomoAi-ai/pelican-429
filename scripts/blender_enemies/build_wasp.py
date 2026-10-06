"""Bind the approved Rodin production quadcopter without replacing its sculpted white armor."""
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


def prepare_meshes():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE / 'rodin-compact/source.glb'))
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
    # Measured on the immutable production source: copper windings locate each motor axis.
    pivots = {'root': (0,0,.35), 'camera': (.80,0,.33),
              'rotor0': (-.68470,-.82807,.583), 'rotor1': (-.68894,.73981,.584),
              'rotor2': (.76077,-.88587,.584), 'rotor3': (.76673,.94304,.584)}
    accent = material('Wasp accent', (.012,.57,.69), .4, .3)
    light = material('Wasp light', (.01,.58,.74), .1, .28, 1.5)
    for obj in meshes:
        # Retain all sculpted armor and panel seams. Only remove the source propeller surfaces.
        bm=bmesh.new();bm.from_mesh(obj.data)
        blades=[face for face in bm.faces if any(
            math.hypot(face.calc_center_median().x-p[0],face.calc_center_median().y-p[1]) < .88
            and face.calc_center_median().z > .515
            and abs(face.calc_center_median().y) > .38
            for name,p in pivots.items() if name.startswith('rotor'))]
        bmesh.ops.delete(bm,geom=blades,context='FACES')
        # Three blade tips cross the body outline; remove their disconnected islands after cutting.
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
        unvisited=set(bm.verts);islands=[]
        while unvisited:
            first=unvisited.pop();island={first};pending=[first]
            while pending:
                for edge in pending.pop().link_edges:
                    for vertex in edge.verts:
                        if vertex in unvisited:
                            unvisited.remove(vertex);island.add(vertex);pending.append(vertex)
            islands.append(island)
        body=max(islands,key=len)
        bmesh.ops.delete(bm,geom=[vertex for island in islands if island is not body for vertex in island],context='VERTS')
        bm.to_mesh(obj.data);bm.free()
        # The input's cyan inlays become their own material; the white PBR texture stays intact.
        shader=next(n for n in obj.data.materials[0].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        tex=shader.inputs['Base Color'].links[0].from_node.image
        pixels=np.array(tex.pixels[:]).reshape(tex.size[1],tex.size[0],4)
        obj.data.materials.append(light)
        for poly in obj.data.polygons:
            colors=[]
            for li in poly.loop_indices:
                uv=obj.data.uv_layers.active.data[li].uv
                colors.append(pixels[min(tex.size[1]-1,max(0,int(uv.y*tex.size[1]))),min(tex.size[0]-1,max(0,int(uv.x*tex.size[0])))])
            r,g,b,_=np.mean(colors,axis=0)
            x,y,z=poly.center
            if g>.30 and b>.30 and r<min(g,b)*.7 and z>.25 and (x>.7 or abs(y)>.35):
                poly.material_index=len(obj.data.materials)-1
    black=material('Wasp rotor hub',(.018,.022,.028),.65,.26)
    silver=material('Wasp rotor collar',(.45,.49,.53),.82,.23)
    for name,p in pivots.items():
        if not name.startswith('rotor'): continue
        index=name[-1]
        for label,z,radius,depth,mat in [('Base',.534,.103,.044,silver),('Neck',.596,.063,.080,black),('Cap',.643,.072,.030,black)]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=depth,location=(p[0],p[1],z))
            hub=bpy.context.object;hub.name=f'WaspHub{label}{index}'
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            hub.data.materials.append(mat)
            bevel=hub.modifiers.new('Rounded shaft edge','BEVEL');bevel.width=.005;bevel.segments=2
            bpy.ops.object.modifier_apply(modifier=bevel.name)
            for face in hub.data.polygons: face.use_smooth=abs(face.normal.z)<.7
            meshes.append(hub)
        bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=6,location=(p[0],p[1],.414),major_radius=.186,minor_radius=.005)
        ring=bpy.context.object;ring.name='Wasp motor accent ring'
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        ring.data.materials.append(accent);meshes.append(ring)
    meshes.extend(make_propellers(pivots))
    return meshes, pivots


def build():
    meshes, pivots = prepare_meshes()
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
            name = f'rotor{obj.name[-1]}' if obj.name.startswith(('WaspRotor','WaspHub')) else 'root'
            if name == 'root' and v.co.x > .79 and abs(v.co.y) < .14 and .19 < v.co.z < .46:
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
    durations = {'idle':120, 'move':120, 'skill1':100, 'skill2':253, 'hit':36}
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
                release = (57 if name=='skill1' else 72)/frames
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
    camera.data.ortho_scale=3.15
    # The white canopy needs restrained highlights so the faceted side panels remain visible.
    scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=.2
    background=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
    background.inputs['Strength'].default_value=.35
    for name,pos in [('front',(4,0,.4)),('side',(0,-4,.4)),('thumbnail',(3,-4,2))]:
        camera.location=pos;_aim(camera,(0,0,.4));scene.render.filepath=str(OUT/f'{name}.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'watch-wasp-rigged.blend'))
    report={'height':HEIGHT,'forward':'+X','pivots':pivots,'vertexCounts':counts,'clips':{n:f/60 for n,f in durations.items()},'source':'rodin-compact/source.glb','color':'retained Rodin production white armor and panel texture / independent emissive lights, motor rings and blade tips','propellerVariants':[2,3]}
    (SOURCE/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))

if __name__=='__main__':build()
