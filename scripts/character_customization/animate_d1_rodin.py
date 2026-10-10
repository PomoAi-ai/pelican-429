"""Bind the retained D1 surface and bake four basic in-place game clips.

blender --background --python scripts/character_customization/animate_d1_rodin.py
Add -- --preview to render front/side deformation checkpoints.
"""
import heapq
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/characters/grassy/customization/models/d1-rodin-6e73423c'
OUT = SOURCE / 'animation'
PUBLIC = ROOT / 'public/characters/human/customization/d1-rodin-animated.glb'
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_rodin'))
import animate as base

FPS = 30
CLIPS = {'idle': (96, True), 'walk': (36, True), 'run': (24, True), 'jump': (48, False)}
J = {
    'root': ((0, 0, 0), (0, 0, .16), None),
    'hips': ((0, .025, 1.24), (0, .01, 1.52), 'root'),
    'spine': ((0, .01, 1.52), (0, -.015, 1.76), 'hips'),
    'chest': ((0, -.015, 1.76), (0, -.015, 1.97), 'spine'),
    'neck': ((0, -.015, 1.97), (0, 0, 2.17), 'chest'),
    'head': ((0, 0, 2.17), (0, 0, 2.86), 'neck'),
}
for side, sign in (('L', 1), ('R', -1)):
    J.update({
        f'clavicle.{side}': ((sign*.10, -.03, 1.94), (sign*.32, .035, 1.93), 'chest'),
        f'upper_arm.{side}': ((sign*.32, .035, 1.93), (sign*.48, .035, 1.55), f'clavicle.{side}'),
        f'forearm.{side}': ((sign*.48, .035, 1.55), (sign*.59, .035, 1.29), f'upper_arm.{side}'),
        f'hand.{side}': ((sign*.59, .035, 1.29), (sign*.62, .035, 1.09), f'forearm.{side}'),
        f'thigh.{side}': ((sign*.205, .025, 1.24), (sign*.19, .015, .84), 'hips'),
        f'shin.{side}': ((sign*.19, .015, .84), (sign*.235, .062, .44), f'thigh.{side}'),
        f'foot.{side}': ((sign*.235, .062, .44), (sign*.27, -.26, .09), f'shin.{side}'),
        f'toe.{side}': ((sign*.27, -.26, .09), (sign*.27, -.40, .07), f'foot.{side}'),
    })
for name, x, y in (('front', 0, -.2), ('back', 0, .2), ('left', .25, 0), ('right', -.25, 0)):
    J[f'skirt.{name}'] = ((x, y, 1.67), (x*1.7, y*2, 1.07), 'hips')
base.JOINTS = J
S = base.smooth
R = base.rotation


def split_hand_contacts(ob):
    """Give skin and fabric separate boundary vertices at the fused hand contact."""
    old=ob.data; coords=[tuple(v.co) for v in old.vertices]
    faces=[]; variants={}; origins=list(range(len(coords))); uvvalues=[]
    material=next(m for m in old.materials if 'skin' in m.name)
    color_node=material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].links[0].from_node
    im=color_node.image;pixels=np.array(im.pixels[:]).reshape(im.size[1],im.size[0],4)
    skin_material=next(i for i,m in enumerate(old.materials) if 'skin' in m.name)
    face_materials=[]
    for face in old.polygons:
        samples=[pixels[min(int(old.uv_layers.active.data[li].uv.y*im.size[1]),im.size[1]-1),min(int(old.uv_layers.active.data[li].uv.x*im.size[0]),im.size[0]-1),:3] for li in face.loop_indices]
        r,g,b=np.median(samples,axis=0)
        skin='skin' in old.materials[face.material_index].name or (r>g*1.03 and g>b*1.01 and b/r>.60 and r-b>.025 and r-g>(g-b)*1.5)
        center=face.center
        contact=1.04<center.z<1.64 and abs(center.x)>.43
        face_materials.append(skin_material if contact and skin else face.material_index)
        indices=[]
        for li in face.loop_indices:
            vi=old.loops[li].vertex_index; x,y,z=coords[vi]
            if 1.04<z<1.64 and abs(x)>.43:
                key=(vi,skin)
                if key not in variants:
                    variants[key]=len(coords);coords.append(coords[vi]);origins.append(vi)
                vi=variants[key]
            indices.append(vi);uvvalues.append(tuple(old.uv_layers.active.data[li].uv))
        faces.append(indices)
    mesh=bpy.data.meshes.new('D1 separated hand contacts');mesh.from_pydata(coords,[],faces)
    for mat in old.materials:mesh.materials.append(mat)
    uv=mesh.uv_layers.new(name='UVMap')
    for dst,src in zip(uv.data,uvvalues):dst.uv=src
    for dst,mi in zip(mesh.polygons,face_materials):dst.material_index=mi;dst.use_smooth=True
    ob.data=mesh
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    # Existing tiny source islands are left alone; only new contact boundaries
    # are closed, with the neighboring surface's own UV and material.
    edges=[e for e in bm.edges if e.is_boundary and any(1.035<v.co.z<1.645 and abs(v.co.x)>.425 for v in e.verts)]
    uv_layer=bm.loops.layers.uv.active
    uv_by_vertex={v:next(iter(v.link_loops))[uv_layer].uv.copy() for e in edges for v in e.verts}
    result=bmesh.ops.holes_fill(bm,edges=edges,sides=0)
    cap_materials={}
    for region,color in [('skin','#f7d9d1'),('blue','#164da8')]:
        mat=base.studio.principled('D1 contact '+region,color,.72)
        cap_materials[region]=len(mesh.materials);mesh.materials.append(mat)
    # Newly exposed inner hand surfaces inherit clean skin instead of the
    # source atlas's projected gold skirt trim at the fused contact.
    for face in bm.faces:
        c=face.calc_center_median()
        if 1.04<c.z<1.64 and abs(c.x)>.43 and 'skin' in mesh.materials[face.material_index].name:
            face.material_index=cap_materials['skin']
    for face in result['faces']:
        neighbors=[f for e in face.edges for f in e.link_faces if f!=face and f not in result['faces']]
        if neighbors:face.material_index=max(set(f.material_index for f in neighbors),key=lambda i:sum(f.material_index==i for f in neighbors))
        center=face.calc_center_median()
        region='skin' if 'skin' in mesh.materials[face.material_index].name else 'blue'
        face.material_index=cap_materials[region]
        for loop in face.loops:
            if loop.vert in uv_by_vertex:loop[uv_layer].uv=uv_by_vertex[loop.vert]
        face.smooth=True
    added=len(result['faces'])
    # The source hand/skirt bridge left a blade-like inner thumb. Compress only
    # that newly exposed palm edge into the retained hand's round envelope.
    rounded=0
    for v in bm.verts:
        x,y,z=v.co
        if .46<abs(x)<.68 and 1.10<z<1.43 and y<-.045 and all('skin' in mesh.materials[f.material_index].name for f in v.link_faces):
            amount=float(S(1.43,1.35,z))
            v.co.y+=(-.045-y)*.86*amount
            v.co.x+=math.copysign(max(0,.56-abs(x))*.30*amount,x)
            rounded+=1
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
    return {'sourceVertices':len(old.vertices),'sourceFaces':len(old.polygons),'vertices':len(mesh.vertices),'faces':len(mesh.polygons),'contactCapFaces':added,'roundedInnerHandVertices':rounded,'purpose':'Separate fused bare hand/fabric contact; preserve source face UVs.'}


def refine_leg_bends(ob):
    """Create a genuinely curved leg surface without subdividing boots or clothes."""
    mesh=ob.data;before=len(mesh.vertices);source=base.mesh_coordinates(mesh)
    # Keep a linear split for a measurable geometric comparison, not a render-only
    # smooth-normal change. Both runs use identical topology and UV interpolation.
    coordinates=[]
    for amount in (0,.65):
        bm=bmesh.new();bm.from_mesh(mesh);bm.normal_update()
        edges=[e for e in bm.edges if all(.47<v.co.z<1.045 and .07<abs(v.co.x)<.4 for v in e.verts)]
        bmesh.ops.subdivide_edges(bm,edges=edges,cuts=3,use_grid_fill=True,smooth=amount,use_smooth_even=True)
        bm.verts.ensure_lookup_table()
        coordinates.append(np.array([tuple(v.co) for v in bm.verts]))
        if amount:
            bm.to_mesh(mesh)
        bm.free()
    mesh.update()
    for face in mesh.polygons:face.use_smooth=True
    displacement=np.linalg.norm(coordinates[1]-coordinates[0],axis=1)
    protected=~((source[:,2]>.47)&(source[:,2]<1.045)&(np.abs(source[:,0])>.07)&(np.abs(source[:,0])<.4))
    protected_error=float(np.linalg.norm(coordinates[1][:before][protected]-source[protected],axis=1).max())
    assert protected_error<1e-7,'Leg refinement modified protected clothes, shoes or head'
    assert displacement.max()>.001,'Leg surface remains a linear subdivision'
    assert displacement.max()<.035,'Leg refinement exceeds the source volume tolerance'
    return {'sourceVertices':before,'vertices':len(mesh.vertices),'addedVertices':len(mesh.vertices)-before,
            'surfaceMethod':'Normal-guided curved subdivision of bare legs only','surfaceSmooth':.65,
            'maximumCurveDisplacement':float(displacement.max()),'movedSurfaceVertices':int((displacement>1e-6).sum()),
            'protectedOriginalVertexMaximumDisplacement':protected_error,
            'kneeCenterZ':.84,'kneeWeightTransition':[.73,.95],'bootTopZ':.47,'ankleWeightTransition':[.47,.55],
            'purpose':'Round real leg geometry while keeping the narrow source proportions, boot rigidity and calibrated knee.'}


def arm_partition(ob, p):
    """Surface distances separate hands from the skirt even where silhouettes meet."""
    adjacency = [[] for _ in p]
    for edge in ob.data.edges:
        a, b = edge.vertices
        length = float(np.linalg.norm(p[a]-p[b]))
        adjacency[a].append((b, length)); adjacency[b].append((a, length))

    def distance(seeds):
        values = np.full(len(p), np.inf); queue = []
        for seed in seeds:
            index = int(np.argmin(np.linalg.norm(p-np.array(seed), axis=1)))
            values[index] = 0; heapq.heappush(queue, (0, index))
        while queue:
            cost, index = heapq.heappop(queue)
            if cost > values[index]: continue
            for neighbor, length in adjacency[index]:
                target = cost+length
                if target < values[neighbor]:
                    values[neighbor] = target; heapq.heappush(queue, (target, neighbor))
        return values

    arms = distance([(sign*.64, .035, 1.24) for sign in (1, -1)] +
                    [(sign*.49, .035, 1.58) for sign in (1, -1)])
    body = distance([(0, -.24, 1.79), (0, .17, 1.78), (0, -.5, 1.24), (0, .43, 1.24)])
    finite = np.isfinite(arms) & np.isfinite(body)
    amount = np.zeros(len(p))
    amount[finite] = S(-.025, .14, body[finite]-arms[finite])
    amount[np.isfinite(arms) & ~np.isfinite(body)] = 1
    amount *= (1-S(1.91, 2.05, p[:,2])) * S(1.025,1.08,p[:,2])
    return amount


def bind(ob, rig):
    p = base.mesh_coordinates(ob.data); x,y,z = p.T
    w = {name: np.zeros(len(p)) for name in J}
    arm = arm_partition(ob,p)
    # Material regions come from the source UV classification; skin under the
    # skirt follows thighs while embroidered fabric never follows the legs.
    skin = np.zeros(len(p)); count = np.zeros(len(p)); hair = np.zeros(len(p))
    for face in ob.data.polygons:
        name = ob.data.materials[face.material_index].name
        for i in face.vertices:
            count[i] += 1
            skin[i] += 'skin' in name
            hair[i] += 'hair' in name
    skin /= count; hair /= count
    arm=np.maximum(arm,((skin>.5)&(np.abs(x)>.47)&(z>1.04)&(z<1.64)).astype(float))
    arm *= S(.29,.40,np.abs(x))
    arm *= np.maximum(S(1.68,1.78,z),(skin>.5).astype(float))
    head = S(2.035,2.15,z)
    head = np.maximum(head,(hair>.5).astype(float))
    arm *= 1-head
    skirt = ((z>1.015)&(z<1.69)&((skin<.5)|(np.abs(x)>.4))).astype(float)*(1-arm)*(1-head)
    leg = (1-S(1.18,1.34,z))*(1-arm)*(1-head)*(1-skirt)
    torso = np.maximum(0,1-arm-head-skirt-leg)
    neck = S(1.96,2.09,z)
    chest = S(1.65,1.83,z)*(1-neck)
    spine = S(1.39,1.63,z)*(1-neck-chest)
    w['head'] = head
    for name, amount in [('neck',neck),('chest',chest),('spine',spine),('hips',1-neck-chest-spine)]:
        w[name] = torso*amount
    skirt_flex = (1-S(1.25,1.65,z))*.70
    radial = np.stack([np.maximum(-y,0),np.maximum(y,0),np.maximum(x,0),np.maximum(-x,0)],axis=1)+.001
    radial /= radial.sum(axis=1)[:,None]
    for k,name in enumerate(('front','back','left','right')): w['skirt.'+name] = skirt*skirt_flex*radial[:,k]
    w['hips'] += skirt*(1-skirt_flex)
    for side,sign in (('L',1),('R',-1)):
        a = arm*(x*sign>0)
        clavicle = S(1.82,1.98,z)
        hand = 1-S(1.25,1.34,z)
        forearm = (1-S(1.49,1.62,z))*(1-hand)
        for name,amount in [('clavicle',clavicle),('upper_arm',(1-hand-forearm)*(1-clavicle)),('forearm',forearm*(1-clavicle)),('hand',hand*(1-clavicle))]:
            w[f'{name}.{side}']=a*amount
        l=leg*S(-.07,.07,x*sign)
        # Keep the complete boot rigid; blend only the exposed ankle above it.
        foot=1-S(.47,.55,z)
        thigh=S(.73,.95,z)*(1-foot)
        toe=(1-S(-.35,-.24,y))*foot
        for name,amount in [('thigh',thigh),('shin',1-foot-thigh),('foot',foot-toe),('toe',toe)]: w[f'{name}.{side}']=l*amount
    weights=np.stack(list(w.values()),axis=1)
    np.put_along_axis(weights,np.argsort(weights,axis=1)[:,:-4],0,axis=1)
    assert np.isfinite(weights).all() and (weights.sum(axis=1)>0).all(), 'Unweighted D1 vertex'
    weights/=weights.sum(axis=1)[:,None]
    for k,name in enumerate(w):
        group=ob.vertex_groups.new(name=name)
        for i in np.flatnonzero(weights[:,k]>0): group.add([int(i)],float(weights[i,k]),'REPLACE')
    ob.parent=rig
    mod=ob.modifiers.new('D1 skeleton','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=False
    return {'vertices':len(p),'bones':len(J),'maximumInfluences':int(np.count_nonzero(weights,axis=1).max()),'normalizationMaxError':float(np.abs(weights.sum(axis=1)-1).max()),'unweightedVertices':0},p


def curve(t, keys):
    for (a,av),(b,bv) in zip(keys,keys[1:]):
        if t<=b:return av+(bv-av)*float(S(a,b,t))
    return keys[-1][1]


def ankle_target(side,soles,travel,lift,pitch):
    ankle=Vector(J[f'foot.{side}'][0]); relative=soles[side]-np.array(ankle)
    ankle.y+=travel
    ankle.z=lift-float((relative[:,1]*math.sin(pitch)+relative[:,2]*math.cos(pitch)).min())
    return ankle,R('X',pitch)


def pose(rig,clip,t,soles):
    phase=math.tau*t; breath=(1-math.cos(phase))*.5
    locomotion=clip in ('walk','run'); running=clip=='run'
    lift=curve(t,[(0,0),(.20,0),(.48,.43),(.74,0),(1,0)]) if clip=='jump' else 0
    crouch=curve(t,[(0,0),(.15,.10),(.22,.035),(.48,.09),(.74,.13),(1,0)]) if clip=='jump' else 0
    drop=(-.070-(.024 if running else .012)*math.cos(phase*2)) if locomotion else -crouch
    d={'root':Matrix.Translation((0,0,drop+lift))}
    d['hips']=d['root']@base.local_edit('hips',R('Z',.018*math.sin(phase) if locomotion else 0))
    d['spine']=d['hips']@base.local_edit('spine',R('X',-.045 if running else -.008*breath))
    d['chest']=d['spine']@base.local_edit('chest',Matrix.Translation((0,0,.008*breath if clip=='idle' else 0)))
    d['neck']=d['chest'];d['head']=d['neck']
    for name in ('front','back','left','right'):
        swing=(.04 if running else .025)*math.sin(phase+.6) if locomotion else 0
        d['skirt.'+name]=d['hips']@base.local_edit('skirt.'+name,R('X',swing))
    for side,sign,offset in (('L',1,0),('R',-1,.5)):
        wave=math.cos(phase+offset*math.tau)
        d[f'clavicle.{side}']=d['chest']
        upper=f'upper_arm.{side}'; fore=f'forearm.{side}'
        swing=(.38 if running else .24)*wave if locomotion else -.018*breath
        if clip=='jump':swing=curve(t,[(0,0),(.15,.16),(.36,-.55),(.67,-.4),(.82,.1),(1,0)])
        d[upper]=d[f'clavicle.{side}']@base.local_edit(upper,R('Y',-.07*sign)@R('X',swing))
        d[fore]=d[upper]@base.local_edit(fore,R('X',-.30 if running else -.055 if locomotion else 0))
        d[f'hand.{side}']=d[fore]
        if clip=='idle':
            for name in ('thigh','shin','foot','toe'):d[f'{name}.{side}']=Matrix.Identity(4)
            continue
        travel=pitch=clearance=0
        if locomotion:
            u=(t+offset)%1;support=.44 if running else .60;stride=.28 if running else .19
            if u<support:
                travel=-stride+2*stride*u/support;pitch=-.05+.13*float(S(0,support,u))
            else:
                v=(u-support)/(1-support)
                travel=stride-2*stride*float(S(0,1,v));clearance=(.22 if running else .12)*math.sin(math.pi*v)**2
                pitch=.08-.13*float(S(0,1,v))
        else:clearance=lift
        ankle,rotation=ankle_target(side,soles,travel,clearance,pitch)
        hip=d['hips']@Vector(J[f'thigh.{side}'][0]);knee=base.solve_knee(hip,ankle,side)
        d[f'thigh.{side}']=base.segment_deform(f'thigh.{side}',hip,knee)
        d[f'shin.{side}']=base.segment_deform(f'shin.{side}',knee,ankle)
        d[f'foot.{side}']=Matrix.Translation(ankle)@rotation@Matrix.Translation(-Vector(J[f'foot.{side}'][0]))
        d[f'toe.{side}']=d[f'foot.{side}']
    poses={name:d[name]@rig.data.bones[name].matrix_local for name in J}
    for name,(_,_,parent) in J.items():
        rest=rig.data.bones[name].matrix_local
        inherited=poses[parent]@rig.data.bones[parent].matrix_local.inverted()@rest if parent else rest
        rig.pose.bones[name].matrix_basis=inherited.inverted()@poses[name]


def bake(rig,p):
    rig.animation_data_create();bpy.context.scene.render.fps=FPS
    soles={side:p[(p[:,0]*sign>.1)&(p[:,2]<.025)] for side,sign in (('L',1),('R',-1))}
    for clip,(frames,loop) in CLIPS.items():
        action=bpy.data.actions.new(clip);rig.animation_data.action=action;previous={}
        for frame in range(frames+1):
            pose(rig,clip,frame/frames,soles)
            for bone in rig.pose.bones:
                q=bone.rotation_quaternion
                if bone.name in previous and q.dot(previous[bone.name])<0:q.negate()
                previous[bone.name]=q.copy()
                for path in ('location','rotation_quaternion','scale'):bone.keyframe_insert(data_path=path,frame=frame,group=bone.name)
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for key in fc.keyframe_points:key.interpolation='LINEAR'
        track=rig.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,0,action);track.mute=True
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
    bpy.context.scene.frame_set(0)


def verify(rig,ob,p):
    report={};sole=p[:,2]<.025
    for clip,(frames,loop) in CLIPS.items():
        first=None;lowest=99;peak=0;support_error=0;calf_error=0;boot_error=0
        for frame in range(frames+1):
            base.activate(rig,clip,frame)
            evaluated=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
            points=base.mesh_coordinates(mesh);evaluated.to_mesh_clear()
            assert np.isfinite(points).all(),f'{clip} contains non-finite geometry'
            # A calf shaft and a boot must stay rigid; only the knee and exposed
            # ankle may flex. This catches misplaced skinning transitions.
            for side,sign in (('L',1),('R',-1)):
                for name,region in [('shin',(p[:,2]>.56)&(p[:,2]<.71)),('foot',p[:,2]<.465)]:
                    region=region&(p[:,0]*sign>.09)
                    matrix=np.array(rig.pose.bones[f'{name}.{side}'].matrix@rig.data.bones[f'{name}.{side}'].matrix_local.inverted())
                    expected=p[region]@matrix[:3,:3].T+matrix[:3,3]
                    error=float(np.linalg.norm(points[region]-expected,axis=1).max())
                    if name=='shin':calf_error=max(calf_error,error)
                    else:boot_error=max(boot_error,error)
            lowest=min(lowest,float(points[sole,2].min()));peak=max(peak,float(points[sole,2].min()))
            if first is None:first=points.copy()
            if clip in ('walk','run'):
                for sign,offset in ((1,0),(-1,.5)):
                    if (frame/frames+offset)%1<(.44 if clip=='run' else .60):
                        support_error=max(support_error,abs(float(points[sole&(p[:,0]*sign>.1),2].min())))
        closure=float(np.linalg.norm(first-points,axis=1).max())
        assert lowest>-.002,f'{clip} soles penetrate ground: {lowest}'
        assert closure<.0001,f'{clip} endpoints disagree: {closure}'
        assert support_error<.002,f'{clip} supporting feet float: {support_error}'
        assert calf_error<.002,f'{clip} has an extra calf bend: {calf_error}'
        assert boot_error<.002,f'{clip} deforms the rigid boots: {boot_error}'
        report[clip]={'duration':frames/FPS,'loop':loop,'minimumSoleZ':lowest,'maximumAirborneSoleZ':peak,'supportFootGroundError':support_error,'endpointMaximumVertexDifference':closure,'calfShaftRigidError':calf_error,'bootRigidError':boot_error}
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
    bpy.context.scene.frame_set(0)
    return report


def main():
    OUT.mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'refined/d1-refined.blend'))
    bpy.context.preferences.filepaths.save_version=0
    ob=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    repair=split_hand_contacts(ob)
    leg_repair=refine_leg_bends(ob)
    before=base.surface_hash(ob.data);rig=base.make_rig();rig.name='D1Rig'
    weights,p=bind(ob,rig);bake(rig,p);validation=verify(rig,ob,p)
    assert before==base.surface_hash(ob.data),'Binding changed retained D1 positions or UVs'
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_nla_strips=True,export_skins=True,export_all_influences=False,export_lights=False,export_cameras=False)
    report={'source':str(SOURCE/'refined/d1-refined.blend'),'restHeight':float(p[:,2].max()-p[:,2].min()),'retainedSurfaceUVMapping':'Original UV coordinates retained; new curved leg vertices use interpolated source UVs.','contactRepair':repair,'legRepair':leg_repair,'weights':weights,'clips':validation,'limitations':['No facial expression or finger animation.','No cloth simulation; four weighted skirt bones.']}
    (OUT/'animation-report.json').write_text(json.dumps(report,indent=2)+'\n')
    if '--preview' in sys.argv:
        scene=bpy.context.scene;scene.cycles.device='CPU';scene.render.threads_mode='FIXED';scene.render.threads=4
        base.studio.FRAMES['full']=(1.80,3.8,560,700)
        for clip,frames in [('idle',[24]),('walk',[0,9]),('run',[0,6]),('jump',[7,23,36])]:
            for frame in frames:
                base.activate(rig,clip,frame)
                for view in ('front','right'):base.studio.render(view,'full',OUT/f'{clip}-{frame:02d}-{view}.png',8)
    base.activate(rig,'idle',0);bpy.context.scene.frame_end=96
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'d1-animated.blend'))
    print('D1_ANIMATION',json.dumps(report),flush=True)


if __name__=='__main__':main()
