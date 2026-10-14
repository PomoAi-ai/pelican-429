"""Bind the Rodin ce912294 body (landmarks ../landmarks.json); retain approved head/hair and all source UVs."""
import argparse,heapq,json,math,sys,hashlib
from pathlib import Path
import bpy,numpy as np
from mathutils import Matrix,Vector
P=Path(__file__).resolve().parent
ROOT=P.parents[7]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'scripts/blender_grassy_rodin'))
import animate as base
S=base.smooth;R=base.rotation
FPS=30
DURATIONS={'idle':96,'walk':36,'run':24,'jump':48}


def configure(scale,landmarks):
    p={name:tuple(v*scale for v in xyz) for name,xyz in landmarks.items()}
    j={'root':((0,0,0),(0,0,.16),None),
       'hips':(p['pelvis'],p['spine'],'root'),
       'spine':(p['spine'],p['chest'],'hips'),
       'chest':(p['chest'],p['neck_base'],'spine'),
       'neck':(p['neck_base'],p['head_attach'],'chest'),
       'head':(p['head_attach'],(p['head_attach'][0],p['head_attach'][1],2.8),'neck')}
    for side in ('L','R'):
        j.update({f'clavicle.{side}':(p['chest'],p['shoulder.'+side],'chest'),
          f'upper_arm.{side}':(p['shoulder.'+side],p['elbow.'+side],f'clavicle.{side}'),
          f'forearm.{side}':(p['elbow.'+side],p['wrist.'+side],f'upper_arm.{side}'),
          f'hand.{side}':(p['wrist.'+side],p['hand.'+side],f'forearm.{side}'),
          f'thigh.{side}':(p['hip.'+side],p['knee.'+side],'hips'),
          f'shin.{side}':(p['knee.'+side],p['ankle.'+side],f'thigh.{side}'),
          f'foot.{side}':(p['ankle.'+side],p['ball.'+side],f'shin.{side}'),
          f'toe.{side}':(p['ball.'+side],p['toe.'+side],f'foot.{side}')})
    base.JOINTS=j;base.CLIPS=DURATIONS;base.frame_pose=pose;base.WALK_SPEED=.44/(.60*1.2)
    return j


def surface_distance(ob,p,seeds):
    adjacency=[[] for _ in p]
    for e in ob.data.edges:
        a,b=e.vertices;length=float(np.linalg.norm(p[a]-p[b]));adjacency[a].append((b,length));adjacency[b].append((a,length))
    result=np.full(len(p),np.inf);queue=[]
    for seed in seeds:
        vi=int(np.argmin(np.linalg.norm(p-np.array(seed),axis=1)));result[vi]=0;heapq.heappush(queue,(0,vi))
    while queue:
        cost,vi=heapq.heappop(queue)
        if cost>result[vi]:continue
        for n,length in adjacency[vi]:
            target=cost+length
            if target<result[n]:result[n]=target;heapq.heappush(queue,(target,n))
    assert np.isfinite(result).all(),'Body must be one continuous connected surface'
    return result


def bind_body(ob,rig,scale):
    points=base.mesh_coordinates(ob.data);p=points/scale;x,y,z=p.T;ax=np.abs(x-.0002689)
    arms=surface_distance(ob,p,[(s*a,b,c) for s in (-1,1) for a,b,c in ((.23,.04,1.12),(.27,.04,.98),(.37,0,.80),(.405,-.005,.69))])
    torso=surface_distance(ob,p,[(0,-.10,1.15),(0,.09,1.15),(0,-.10,.91),(0,.14,.91)])
    arm=S(-.025,.065,torso-arms)*(1-S(1.235,1.285,z))
    arm*=S(.11,.16,ax)
    arm=np.maximum(arm,((ax>.25)&(z<.88)).astype(float))
    leg=(1-S(.70,.84,z))*(1-arm)
    trunk=1-arm-leg
    head=S(1.30,1.315,z)
    neck=S(1.255,1.30,z)*(1-head)
    chest=S(1.05,1.15,z)*(1-head-neck)
    spine=S(.82,1.0,z)*(1-head-neck-chest)
    w={name:np.zeros(len(p)) for name in base.JOINTS}
    for name,a in [('head',head),('neck',neck),('chest',chest),('spine',spine),('hips',1-head-neck-chest-spine)]:w[name]=trunk*a
    for side,sign in [('L',1),('R',-1)]:
        a=arm*((x-.0002689)*sign>0)
        clavicle=S(1.18,1.26,z)
        hand=1-S(.77,.83,z)
        forearm=(1-S(.92,1.05,z))*(1-hand)
        for name,amount in [('clavicle',clavicle),('upper_arm',(1-hand-forearm)*(1-clavicle)),('forearm',forearm*(1-clavicle)),('hand',hand*(1-clavicle))]:w[f'{name}.{side}']=a*amount
        l=leg*S(-.045,.045,(x-.0002689)*sign)
        foot=1-S(.10,.175,z)
        thigh=S(.40,.54,z)*(1-foot)
        toe=(1-S(-.10,-.06,y))*foot
        for name,amount in [('thigh',thigh),('shin',1-foot-thigh),('foot',foot-toe),('toe',toe)]:w[f'{name}.{side}']=l*amount
    weights=np.stack(list(w.values()),axis=1)
    assert np.isfinite(weights).all() and weights.min()>-1e-10 and (weights.sum(axis=1)>0).all()
    weights=np.maximum(weights,0)
    np.put_along_axis(weights,np.argsort(weights,axis=1)[:,:-4],0,axis=1)
    weights/=weights.sum(axis=1)[:,None]
    for k,name in enumerate(w):
        group=ob.vertex_groups.new(name=name)
        for vi in np.flatnonzero(weights[:,k]>0):group.add([int(vi)],float(weights[vi,k]),'REPLACE')
    attach(ob,rig)
    return {'vertices':len(p),'maximumInfluences':int(np.count_nonzero(weights,axis=1).max()),'unweightedVertices':int(np.count_nonzero(weights.sum(axis=1)==0)),'normalizationMaxError':float(np.abs(weights.sum(axis=1)-1).max()),'bodyPartition':'New surface geodesic arm-vs-torso distances, new measured knee/ankle bands; four-influence linear skinning'},points


def attach(ob,rig):
    ob.parent=rig
    mod=ob.modifiers.new('D1 base skeleton','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=False


def curve(t,keys):
    for (a,av),(b,bv) in zip(keys,keys[1:]):
        if t<=b:return av+(bv-av)*float(S(a,b,t))
    return keys[-1][1]


def pose(rig,clip,t,soles):
    j=base.JOINTS;phase=math.tau*t;breath=(1-math.cos(phase))*.5
    running=clip=='run';locomotion=clip in ('walk','run')
    lift=curve(t,[(0,0),(.20,0),(.48,.38),(.74,0),(1,0)]) if clip=='jump' else 0
    crouch=curve(t,[(0,0),(.15,.12),(.22,.04),(.48,.08),(.74,.15),(1,0)]) if clip=='jump' else 0
    drop=(-.065-(.025 if running else .012)*math.cos(phase*2)) if locomotion else -crouch
    d={'root':Matrix.Translation((0,0,drop+lift))}
    d['hips']=d['root']@base.local_edit('hips',R('Z',.018*math.sin(phase) if locomotion else 0))
    d['spine']=d['hips']@base.local_edit('spine',R('X',-.04 if running else -.008*breath))
    d['chest']=d['spine']@base.local_edit('chest',Matrix.Translation((0,0,.007*breath if clip=='idle' else 0)))
    d['neck']=d['chest'];d['head']=d['neck']
    contacts={}
    for side,offset in [('L',0),('R',.5)]:
        wave=math.cos(phase+offset*math.tau)
        d[f'clavicle.{side}']=d['chest'];upper=f'upper_arm.{side}';fore=f'forearm.{side}'
        swing=(.36 if running else .23)*wave if locomotion else -.014*breath
        if clip=='jump':swing=curve(t,[(0,0),(.15,.16),(.36,-.5),(.67,-.4),(.82,.1),(1,0)])
        d[upper]=d[f'clavicle.{side}']@base.local_edit(upper,R('X',swing))
        d[fore]=d[upper]@base.local_edit(fore,R('X',-.30 if running else -.055 if locomotion else 0))
        d[f'hand.{side}']=d[fore]
        if clip=='idle':
            for part in ('thigh','shin','foot','toe'):d[f'{part}.{side}']=Matrix.Identity(4)
            continue
        travel=pitch=clearance=0;support=True
        if locomotion:
            u=(t+offset)%1;duration=.44 if running else .60;stride=.32 if running else .22
            support=u<duration
            if support:
                travel=-stride+2*stride*u/duration;pitch=-.04+.11*float(S(0,duration,u))
            else:
                v=(u-duration)/(1-duration);travel=stride-2*stride*float(S(0,1,v));clearance=(.20 if running else .105)*math.sin(math.pi*v)**2;pitch=.07-.11*float(S(0,1,v))
        else:clearance=lift;support=lift==0
        ankle=Vector(j[f'foot.{side}'][0]);relative=soles[side]-np.asarray(ankle)
        ankle.y+=travel;ankle.z=clearance-float((relative[:,1]*math.sin(pitch)+relative[:,2]*math.cos(pitch)).min())
        hip=d['hips']@Vector(j[f'thigh.{side}'][0]);knee=base.solve_knee(hip,ankle,side)
        d[f'thigh.{side}']=base.segment_deform(f'thigh.{side}',hip,knee)
        d[f'shin.{side}']=base.segment_deform(f'shin.{side}',knee,ankle)
        d[f'foot.{side}']=Matrix.Translation(ankle)@R('X',pitch)@Matrix.Translation(-Vector(j[f'foot.{side}'][0]))
        d[f'toe.{side}']=d[f'foot.{side}'];contacts[side]={'support':support,'soleClearance':clearance}
    poses={name:d[name]@rig.data.bones[name].matrix_local for name in j}
    for name,(_,_,parent) in j.items():
        rest=rig.data.bones[name].matrix_local;inherited=poses[parent]@rig.data.bones[parent].matrix_local.inverted()@rest if parent else rest
        rig.pose.bones[name].matrix_basis=inherited.inverted()@poses[name]
    return contacts


def evaluated_points(ob):
    ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();p=base.mesh_coordinates(mesh);ev.to_mesh_clear();return p


def verify(rig,objects,scale):
    body=objects['Body'];rest=base.mesh_coordinates(body.data);raw=rest/scale
    head=objects['Head'];hr=base.mesh_coordinates(head.data)
    seam_pairs=[]
    for hi in np.flatnonzero(np.abs(hr[:,2]-hr[:,2].min())<1e-5):
        bi=int(np.argmin(np.linalg.norm(rest-hr[hi],axis=1)))
        if np.linalg.norm(rest[bi]-hr[hi])<2e-5:seam_pairs.append((bi,int(hi)))
    assert len(seam_pairs)>30,'No exact shared body/head neck ring found'
    report={};sole=rest[:,2]<.035
    for clip,duration in DURATIONS.items():
        first={};minimum=99.;max_support=0.;max_calf=0.;max_foot=0.;seam_error=0.;peak=0.
        for frame in range(duration+1):
            base.activate(rig,clip,frame);bp=evaluated_points(body);hp=evaluated_points(head)
            assert np.isfinite(bp).all() and np.isfinite(hp).all()
            seam_error=max(seam_error,max(float(np.linalg.norm(bp[b]-hp[h])) for b,h in seam_pairs))
            minimum=min(minimum,float(bp[sole,2].min()));peak=max(peak,float(bp[sole,2].min()))
            for side,sign,offset in [('L',1,0),('R',-1,.5)]:
                for part,region in [('shin',(raw[:,2]>.20)&(raw[:,2]<.38)),('foot',raw[:,2]<.095)]:
                    region&=raw[:,0]*sign>.045
                    m=np.array(rig.pose.bones[f'{part}.{side}'].matrix@rig.data.bones[f'{part}.{side}'].matrix_local.inverted());expected=rest[region]@m[:3,:3].T+m[:3,3]
                    error=float(np.linalg.norm(bp[region]-expected,axis=1).max())
                    if part=='shin':max_calf=max(max_calf,error)
                    else:max_foot=max(max_foot,error)
                support=(frame/duration+offset)%1<(.44 if clip=='run' else .60)
                if clip in ('walk','run') and support:max_support=max(max_support,abs(float(bp[sole&(raw[:,0]*sign>.045),2].min())))
            if frame==0:
                first={name:evaluated_points(ob) for name,ob in objects.items()}
        closure=max(float(np.linalg.norm(evaluated_points(ob)-first[name],axis=1).max()) for name,ob in objects.items())
        report[clip]={'frames':duration,'seconds':duration/FPS,'minimumSoleZ':minimum,'peakLowestFootHeight':peak,'maximumSupportGroundError':max_support,'neckSeamMaximumGap':seam_error,'calfRigidShaftMaximumError':max_calf,'footRigidRegionMaximumError':max_foot,'loopEndpointMaximumVertexDifference':closure}
        assert minimum>-.002,report[clip]
        assert max_support<.003 and seam_error<.0001 and max_calf<.0001 and max_foot<.0001 and closure<.0001,report[clip]
    return report


def preview(rig,objects,cycles):
    from inspect_standalone_head import bounds,setup_scene
    for obj in list(bpy.data.objects):
        if obj.type in ('CAMERA','LIGHT'):bpy.data.objects.remove(obj,do_unlink=True)
    base.activate(rig,'idle',0)
    center,span,cam=setup_scene(*bounds(list(objects.values())))
    scene=bpy.context.scene;scene.render.resolution_x=640;scene.render.resolution_y=800;scene.cycles.samples=12
    for clip,frames in [('idle',[0,36,72]),('walk',[0,6,9,18,27]),('run',[0,6,12,18]),('jump',[0,7,23,36,48])]:
        for frame in frames:
            base.activate(rig,clip,frame)
            for view,d in [('front',(0,-1,0)),('right',(1,0,0))]:
                cam.location=center+Vector(d)*span*4;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.85
                scene.render.filepath=str(P/'preview'/f'{clip}-{frame:02d}-{view}.png');bpy.ops.render.render(write_still=True)
    if not cycles:return
    # Evenly sampled full cycles for HTML flipbook previews.
    scene.render.resolution_x=400;scene.render.resolution_y=500;scene.cycles.samples=8
    for clip,duration in DURATIONS.items():
        for frame in range(0,duration,3):
            base.activate(rig,clip,frame);cam.location=center+Vector((1,-1,0)).normalized()*span*4;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(P/'preview'/f'{clip}-cycle-{frame:02d}.png');bpy.ops.render.render(write_still=True)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');parser.add_argument('--cycles',action='store_true');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    source=P.parent/'assembled-base/candidate.blend';assembly=json.loads((source.parent/'assembly-report.json').read_text());landmarks=json.loads((P.parent/'landmarks.json').read_text());scale=assembly['gameNormalizeScale']
    bpy.ops.wm.open_mainfile(filepath=str(source));objects={name:bpy.data.objects[name] for name in ('Body','Head','Hair')}
    for name,obj in objects.items():
        assert np.allclose(np.array(obj.matrix_world),np.eye(4)),'Bake transforms before binding'
        obj['characterPart']=name.lower()
    before={name:base.surface_hash(ob.data) for name,ob in objects.items()}
    joints=configure(scale,landmarks['landmarks']);rig=base.make_rig();rig.name='D1ModularBaseRig';rig['run_speed_tiles_per_second']=.64/(.44*.8);skin,points=bind_body(objects['Body'],rig,scale)
    for name in ('Head','Hair'):
        ob=objects[name];group=ob.vertex_groups.new(name='head');group.add(list(range(len(ob.data.vertices))),1,'REPLACE');attach(ob,rig)
    base.actions(rig,objects['Body'])
    checks=verify(rig,objects,scale)
    assert before=={name:base.surface_hash(ob.data) for name,ob in objects.items()},'Binding changed approved surface/UV'
    base.activate(rig,'idle',0)
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
    bpy.context.scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [rig,*objects.values()]:ob.select_set(True)
    bpy.context.view_layer.objects.active=rig
    glb=P/'d1-base-animated.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_nla_strips=True,export_skins=True,export_all_influences=False,export_image_format='AUTO',export_lights=False,export_cameras=False)
    (P/'rig-report.json').write_text(json.dumps({'assemblySHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'scale':scale,'joints':joints,'skin':skin,'approvedSurfacesUnchanged':True,'seamPolicy':'Rigid Head and Hair; Body seam region shares 100% head weight','clips':checks,'walkGroundSpeed':.44/(.60*1.2),'runGroundSpeed':.64/(.44*.8),'glbBytes':glb.stat().st_size},indent=2))
    if args.preview:
        sys.path.insert(0,str(ROOT/'scripts/character_customization'));(P/'preview').mkdir(exist_ok=True);preview(rig,objects,args.cycles)
    base.activate(rig,'idle',0);bpy.context.scene.frame_end=96;bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(P/'candidate.blend'))
    print('D1_ANIMATION_READY',json.dumps(checks),flush=True)

if __name__=='__main__':main()
