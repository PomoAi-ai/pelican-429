"""Build OMI's articulated mechanical shells and bake the shared game animation set."""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Quaternion, Vector
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/blender_npcs'))
from studio import setup_studio
H = 2.6
OUT = ROOT/'public/characters/enemies/gatekeeper'
SOURCE = ROOT/'assets/characters/enemies/gatekeeper'
PARTS = []
JOINTS = {'root': (0,0,0), 'pelvis': (0,0,1.02), 'chest': (0,0,1.12),
          'head': (0,0,1.76), 'eye': (0,0,2.16)}
PARENTS = {'pelvis':'root','chest':'pelvis','head':'chest','eye':'head'}
for side, sign in [('L',1),('R',-1)]:
    for name, p, parent in [('arm',(0,sign*.40,1.57),'chest'),
         ('forearm',(0,sign*.51,1.22),f'arm.{side}'),
         ('hand',(.01,sign*.57,.91),f'forearm.{side}'),
         ('thigh',(0,sign*.235,1.02),'pelvis'),
         ('shin',(0,sign*.235,.58),f'thigh.{side}'),
         ('foot',(-.015,sign*.235,.19),f'shin.{side}')]:
        JOINTS[f'{name}.{side}']=p; PARENTS[f'{name}.{side}']=parent
    for jaw, offset in [('inner',-.09),('outer',.09)]:
        name=f'claw_{jaw}.{side}'
        JOINTS[name]=(.015,sign*.57+offset,.91)
        PARENTS[name]=f'hand.{side}'


def material(name, color, metal=0, rough=.4, glow=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    s=m.node_tree.nodes.get('Principled BSDF'); s.inputs['Base Color'].default_value=(*color,1)
    s.inputs['Metallic'].default_value=metal; s.inputs['Roughness'].default_value=rough
    s.inputs['Emission Color'].default_value=(*color,1); s.inputs['Emission Strength'].default_value=glow
    return m


def finish(obj, name, mat, bone):
    obj.name=name; obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for p in obj.data.polygons: p.use_smooth=True
    PARTS.append((obj,bone)); return obj


def ellipsoid(name, center, scale, mat, bone):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=center)
    obj=bpy.context.object; obj.scale=scale
    return finish(obj,name,mat,bone)


def cylinder(name, a, b, radius, mat, bone, vertices=48):
    a,b=Vector(a),Vector(b); delta=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=delta.length,location=(a+b)/2)
    obj=bpy.context.object; obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    bevel=obj.modifiers.new('Machined edge radius','BEVEL'); bevel.width=.008; bevel.segments=3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return finish(obj,name,mat,bone)


def ring(name, center, radius, thickness, mat, bone, axis='X'):
    bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=12,location=center,
        major_radius=radius,minor_radius=thickness)
    obj=bpy.context.object; obj.rotation_euler=Vector((1,0,0) if axis=='X' else (0,1,0)).to_track_quat('Z','Y').to_euler()
    return finish(obj,name,mat,bone)


def plate(name, yz, front, depth, mat, bone, bevel=.035):
    vertices=[(x,y,z) for x in [front-depth,front] for y,z in yz]; n=len(yz)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj; obj.select_set(True)
    mod=obj.modifiers.new('Rounded armor edge','BEVEL'); mod.width=bevel; mod.segments=4
    bpy.ops.object.modifier_apply(modifier=mod.name)
    finish(obj,name,mat,bone)
    for face in obj.data.polygons:
        if abs(face.normal.x)>.99: face.use_smooth=False
    return obj


def shell(name,a,b,width,depth,mat,bone):
    a,b=Vector(a),Vector(b); center=(a+b)/2
    obj=ellipsoid(name,center,(depth,width,(b-a).length*.74),mat,bone)
    # Transform the baked ellipsoid around its midpoint to follow the limb.
    rot=Vector((0,0,1)).rotation_difference((b-a).normalized()).to_matrix().to_4x4()
    obj.data.transform(Matrix.Translation(center)@rot@Matrix.Translation(-center))
    return obj


def build_geometry():
    white=material('OMI porcelain white ceramic',(.65,.68,.72),.06,.46)
    navy=material('OMI midnight blue armor',(.035,.062,.105),.18,.46)
    black=material('OMI graphite joint seals',(.012,.018,.025),.3,.37)
    visor=material('OMI obsidian face screen',(.009,.015,.021),.12,.30)
    teal=material('OMI frosted teal abdomen',(.12,.33,.38),.12,.43)
    metal=material('OMI brushed titanium',(.25,.28,.31),.75,.28)
    amber=material('OMI amber indicator', (1,.28,.018),.15,.3,3)
    # Helmet and face use matching curved surfaces so the movable optic stays on glass.
    ellipsoid('Helmet ceramic shell',(0,0,2.16),(.42,.46,.44),white,'head')
    verts=[(.436,0,2.16)]; faces=[]
    steps=64; rows=14
    for j in range(1,rows+1):
        r=j/rows
        for i in range(steps):
            t=i/steps*math.tau; y=.365*r*math.cos(t); z=.345*r*math.sin(t)
            x=.42*math.sqrt(1-(y/.46)**2-(z/.44)**2)+.016
            verts.append((x,y,2.16+z))
    for i in range(steps): faces.append((0,1+i,1+(i+1)%steps))
    for j in range(rows-1):
        a=1+j*steps; b=a+steps
        for i in range(steps): faces.append((a+i,b+i,b+(i+1)%steps,a+(i+1)%steps))
    mesh=bpy.data.meshes.new('Curved visor'); mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('Curved faceplate',mesh);bpy.context.collection.objects.link(obj)
    finish(obj,'Curved obsidian faceplate',visor,'head')
    ring('Amber eye ring',(.441,0,2.16),.091,.014,amber,'eye')
    ring('Optic bezel',(.438,0,2.16),.109,.006,metal,'eye')
    cylinder('Neck bellows',(0,0,1.68),(0,0,1.83),.16,black,'head')
    for sign in [-1,1]:
        y=sign*.453
        cylinder('Temple circular housing',(0,y-sign*.035,2.16),(0,y+sign*.035,2.16),.133,navy,'head')
        ring('Temple amber ring',(0,y+sign*.041,2.16),.094,.008,amber,'head','Y')
    ellipsoid('Torso graphite core',(0,0,1.40),(.215,.30,.34),black,'chest')
    # Segmented breastplate frames the reference's teal central abdomen.
    plate('Chest upper ceramic bridge',[(-.32,1.70),(.32,1.70),(.29,1.49),(.18,1.44),(-.18,1.44),(-.29,1.49)],.20,.24,white,'chest')
    for s in [-1,1]:
        plate('Chest ceramic side',[(s*.30,1.59),(s*.18,1.49),(s*.14,1.24),(s*.25,1.18),(s*.32,1.35)],.225,.22,white,'chest',.026)
    plate('Teal abdomen shield',[(-.16,1.48),(.16,1.48),(.22,1.35),(.13,1.13),(-.13,1.13),(-.22,1.35)],.238,.065,teal,'chest',.035)
    ellipsoid('Pelvis flexible body',(0,0,1.02),(.20,.29,.15),black,'pelvis')
    plate('Pelvis ceramic shield',[(-.27,1.10),(-.15,1.03),(0,.85),(.15,1.03),(.27,1.10),(.22,1.17),(-.22,1.17)],.19,.28,white,'pelvis',.035)
    for side,s in [('L',1),('R',-1)]:
        arm,fore,hand,thigh,shin,foot=[f'{p}.{side}' for p in ['arm','forearm','hand','thigh','shin','foot']]
        shoulder,elbow,wrist,hip,knee,ankle=[Vector(JOINTS[p]) for p in [arm,fore,hand,thigh,shin,foot]]
        for name,p,r,bone in [('Shoulder',shoulder,.115,arm),('Elbow',elbow,.089,fore),('Wrist',wrist,.078,hand),('Hip',hip,.115,thigh),('Knee',knee,.092,shin),('Ankle',ankle,.079,foot)]:
            ellipsoid(name+' joint '+side,p,(r,r,r),black,bone)
            cylinder(name+' axle '+side,p-Vector((0,r,0)),p+Vector((0,r,0)),r*.88,metal,bone)
            ring(name+' light '+side,p+Vector((0,s*(r+.005),0)),r*.68,.006,amber,bone,'Y')
        # Front-facing shoulder and wrist lights retain the approved front silhouette.
        for p,r,bone in [(shoulder,.06,arm),(wrist,.05,hand)]: ring('Front joint signal '+side,p+Vector((.092,0,0)),r,.006,amber,bone)
        cap=ellipsoid('Navy shoulder cap '+side,shoulder+Vector((0,s*.02,.068)),(.16,.19,.19),navy,arm)
        for v in cap.data.vertices: v.co.z=max(shoulder.z-.035,v.co.z)
        shell('Upper arm white shell '+side,shoulder+Vector((0,s*.015,-.11)),elbow+Vector((0,-s*.01,.045)),.11,.105,white,arm)
        shell('Forearm white shell '+side,elbow+Vector((0,s*.02,-.03)),wrist+Vector((0,0,.045)),.12,.115,white,fore)
        shell('Forearm navy spine '+side,elbow+Vector((-.025,s*.09,-.02)),wrist+Vector((-.025,s*.08,.06)),.04,.09,navy,fore)
        cylinder('Wrist amber piston '+side,elbow+Vector((.10,0,-.055)),wrist+Vector((.10,0,.055)),.018,amber,fore)
        for jaw,offset,sign in [('inner',-.09,-1),('outer',.09,1)]:
            y=s*.57; z=.91; bone=f'claw_{jaw}.{side}'
            coords=[(y+sign*.02,z+.03),(y+sign*.105,z+.015),(y+sign*.15,z-.08),(y+sign*.14,z-.18),(y+sign*.075,z-.26),(y+sign*.04,z-.24),(y+sign*.09,z-.15),(y+sign*.08,z-.075)]
            plate('Articulated pincer '+jaw+' '+side,coords,.085,.145,navy,bone,.019)
            for i in range(3):
                zz=z-.10-i*.034; yy=y+sign*(.075-i*.008)
                plate('Pincer tooth '+side+str(i),[(yy,zz),(yy-sign*.018,zz-.012),(yy,zz-.024)],.08,.125,metal,bone,.003)
        shell('Thigh ceramic armor '+side,hip+Vector((0,0,-.06)),knee+Vector((0,0,.075)),.155,.145,white,thigh)
        shell('Shin ceramic armor '+side,knee+Vector((0,0,-.065)),ankle+Vector((0,0,.045)),.137,.13,white,shin)
        # Flattened broad boot soles are stable at z=0, matching the design reference.
        boot=ellipsoid('Boot ceramic '+side,(.065,s*.235,.13),(.255,.18,.15),white,foot)
        for v in boot.data.vertices: v.co.z=max(.028,v.co.z)
        toe=ellipsoid('Navy toe cap '+side,(.21,s*.235,.083),(.12,.17,.095),navy,foot)
        for v in toe.data.vertices: v.co.z=max(.015,v.co.z)
        sole=ellipsoid('Boot rubber sole '+side,(.065,s*.235,.032),(.257,.182,.033),black,foot)
        for v in sole.data.vertices: v.co.z=max(0,v.co.z)
    return len(PARTS)


def rig_model():
    data=bpy.data.armatures.new('OMI skeleton');rig=bpy.data.objects.new('OMI01Rig',data);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for name,p in JOINTS.items():
        b=data.edit_bones.new(name);b.head=p;b.tail=Vector(p)+Vector((0,0,.09))
        if name!='root': b.parent=data.edit_bones[PARENTS[name]]
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj,bone in PARTS:
        group=obj.vertex_groups.new(name=bone);group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
        obj.parent=rig;mod=obj.modifiers.new('Rigid mechanical joint','ARMATURE');mod.object=rig
    for b in rig.pose.bones:b.rotation_mode='QUATERNION'
    return rig


def turn(rig,name,axis,angle):
    local=rig.data.bones[name].matrix_local.to_3x3().inverted()@Vector(axis)
    rig.pose.bones[name].rotation_quaternion @= Quaternion(local,angle)


def shift(rig,name,v):rig.pose.bones[name].location=rig.data.bones[name].matrix_local.to_3x3().inverted()@Vector(v)


def smooth(t):
    t=max(0,min(1,t));return t*t*(3-2*t)


def feet(rig,t,stride,lift,crouch=0):
    shift(rig,'pelvis',(0,0,-crouch));bpy.context.view_layer.update()
    parent=rig.pose.bones['pelvis'].matrix.copy();deform=parent@rig.data.bones['pelvis'].matrix_local.inverted()
    for side,phase in [('L',0),('R',.5)]:
        names=[f'{p}.{side}' for p in ['thigh','shin','foot']];h,k,a=[Vector(JOINTS[n]) for n in names];hip=deform@h
        u=(t+phase)%1
        travel=stride*(.5-u/.6) if u<.6 else stride*(-.5+smooth((u-.6)/.4))
        raised=0 if u<.6 else lift*math.sin(math.pi*(u-.6)/.4)**2
        ankle=a+Vector((travel,0,raised));direction=ankle-hip;d=direction.length;l1=(k-h).length;l2=(a-k).length
        d=min(d,l1+l2-.00001);axis=direction.normalized();ankle=hip+axis*d
        pole=Vector((1,0,0));bend=(pole-axis*pole.dot(axis)).normalized();along=(l1*l1-l2*l2+d*d)/(2*d)
        knee=hip+axis*along+bend*math.sqrt(max(0,l1*l1-along*along));poses={'pelvis':parent}
        for n,rs,re,p,q in [(names[0],h,k,hip,knee),(names[1],k,a,knee,ankle)]:
            rot=(re-rs).rotation_difference(q-p).to_matrix().to_4x4()
            poses[n]=Matrix.Translation(p)@rot@Matrix.Translation(-rs)@rig.data.bones[n].matrix_local
        poses[names[2]]=Matrix.Translation(ankle-a)@rig.data.bones[names[2]].matrix_local
        for n in names:
            b=rig.data.bones[n];inherited=poses[b.parent.name]@b.parent.matrix_local.inverted()@b.matrix_local
            rig.pose.bones[n].matrix_basis=inherited.inverted()@poses[n]


def animate(rig,name,f,d):
    t=f/d;wave=math.sin(t*math.tau)
    if name=='idle':
        shift(rig,'chest',(0,0,.008*(1-math.cos(t*math.tau))))
        # Smooth travel between held glances, returning exactly to the first pose.
        scan=.18*smooth((t-.10)/.12)-.36*smooth((t-.43)/.14)+.18*smooth((t-.79)/.13)
        turn(rig,'head',(0,0,1),scan*.3);turn(rig,'eye',(0,0,1),scan)
        turn(rig,'eye',(0,1,0),.025*math.sin(t*math.tau))
    elif name=='move':
        feet(rig,t,.40,.12,.055+.012*math.cos(t*math.tau*2))
        for side,s in [('L',1),('R',-1)]:
            turn(rig,f'arm.{side}',(0,1,0),.28*wave*s);turn(rig,f'forearm.{side}',(0,1,0),-.16)
    elif name=='hit':
        a=math.sin(math.pi*t)**2;turn(rig,'chest',(0,1,0),-.20*a);turn(rig,'head',(0,1,0),-.12*a)
        for side in ['L','R']:turn(rig,f'arm.{side}',(0,1,0),-.22*a)
    else:
        start,active=(42,8) if name=='skill1' else (30,14)
        prep=smooth(f/start);release=smooth((f-start)/active);recovery=1-smooth((f-start-active)/(d-start-active))
        a=prep*recovery;b=release*recovery
        feet(rig,.1,.10*a,0,.055*a)
        if name=='skill1':
            turn(rig,'chest',(0,0,1),(.24*a-.55*b));turn(rig,'chest',(0,1,0),.09*a)
            turn(rig,'arm.R',(0,1,0),.55*a-1.9*b);turn(rig,'forearm.R',(0,1,0),-.85*a+.65*b)
            turn(rig,'arm.L',(0,1,0),-.25*a)
        else:
            turn(rig,'chest',(0,1,0),.12*a+.15*b-.19*smooth((f-50)/12)*recovery)
            for side,s in [('L',1),('R',-1)]:
                turn(rig,f'arm.{side}',(0,1,0),-1.05*a-.35*b)
                turn(rig,f'forearm.{side}',(0,1,0),-.40*a+.3*b)
        for side in ['L','R']:
            for jaw,s in [('inner',-1),('outer',1)]:turn(rig,f'claw_{jaw}.{side}',(1,0,0),s*(-.25*a+.55*b))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True);OUT.mkdir(parents=True,exist_ok=True)
    build_geometry();rig=rig_model();scene=bpy.context.scene;scene.render.fps=60
    clips={'idle':240,'move':60,'skill1':98,'skill2':98,'hit':36};actions={};rig.animation_data_create()
    for name,d in clips.items():
        action=bpy.data.actions.new(name);rig.animation_data.action=action
        for f in range(d+1):
            for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
            animate(rig,name,f,d)
            for b in rig.pose.bones:
                for path in ['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=path,frame=f,group=b.name)
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
        track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,action);track.mute=True;actions[name]=action
    rig.animation_data.action=None
    for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
    scene.frame_set(0);bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
    for obj,_ in PARTS:obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',use_selection=True,export_yup=True,
        export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_skins=True,export_materials='EXPORT',export_apply=False)
    camera=setup_studio(H);scene.view_settings.view_transform='AgX';scene.cycles.samples=48;scene.render.resolution_x=900;scene.render.resolution_y=1000
    camera.data.ortho_scale=H*1.19;target=Vector((0,0,H*.5))
    for name,pos in [('front',(3,0,.5)),('side',(0,-3,.5)),('thumbnail',(2.2,-3,1.0))]:
        camera.location=Vector(pos)*H;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/f'{name}.png');bpy.ops.render.render(write_still=True)
    camera.location=Vector((.35,-3,.55))*H;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=H*1.4
    for name,f in [('move',12),('skill1',50),('skill2',44)]:
        rig.animation_data.action=actions[name];rig.animation_data.action_slot=actions[name].slots[0];scene.frame_set(f)
        scene.render.filepath=str(OUT/f'{name}.png');bpy.ops.render.render(write_still=True)
    rig.animation_data.action=None
    for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
    scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'omi-rigged.blend'))
    report={'name':'OMI-01','height':H,'forward':'+X','up':'glTF Y / Blender Z','source':'Local articulated mechanical reconstruction of approved-character.png','bones':JOINTS,'parts':len(PARTS),'clips':{n:d/60 for n,d in clips.items()},'eye':{'pivot':[0,0,2.16],'parent':'head','motion':'rotation around head center','boneLocalY':'Blender +Z / glTF +Y'},'skin':'Each armor component rigidly weighted to one joint'}
    (SOURCE/'build-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

if __name__=='__main__':main()
