"""One joint scalp-root, free main shoulder and two overlapping crown sweeps."""
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent
BASE=HERE.parent
SOURCE=BASE/'main-fringe-corrected-study-01/draft-04/Single-Lock.blend'
MAIN='Single broad swept fringe'
CHANGED=[MAIN,'Left swept crown','Left crown curled tip']
sys.dont_write_bytecode=True
sys.path.insert(0,str(BASE))
from build import skull_tree
from single_lock import smooth_controls
from build_bob_study import transported_frames


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value


prior=module('junction_previous_helpers',BASE/'main-fringe-corrected-study-01/build.py')


def sample_controls(controls,rows):
    controls=np.asarray(controls,dtype=float)
    dense=np.asarray([smooth_controls(controls,t) for t in np.linspace(0,1,801)])
    arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(dense[:,:3],axis=0),axis=1))]
    samples=np.column_stack([np.interp(np.linspace(0,1,rows),arc/arc[-1],dense[:,i]) for i in range(controls.shape[1])])
    assert np.min(samples[:,3:])>0,'Free root/shoulder profile lost thickness'
    return samples


def actual_root(head,seed):
    skin,normal=head.find_nearest(Vector(seed))[:2]
    skin=np.asarray(skin,dtype=float);normal=np.asarray(normal,dtype=float)
    return skin+normal*.001,normal,skin


def closed_object(name,rings,material,matrix,region):
    rings=np.asarray(rings,dtype=float);rows,sides=rings.shape[:2]
    guide=rings.mean(axis=1)
    arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(guide,axis=0),axis=1))];progress=arc/arc[-1]
    verts=rings.reshape(-1,3).tolist();faces=[]
    for row in range(rows-1):
        for col in range(sides):
            a=row*sides+col;b=row*sides+(col+1)%sides
            faces.append((a,b,b+sides,a+sides))
    for row in (0,rows-1):
        centre=len(verts);verts.append(guide[row].tolist())
        for col in range(sides):
            a=row*sides+col;b=row*sides+(col+1)%sides
            faces.append((centre,b,a) if row==0 else (centre,a,b))
    mesh=bpy.data.meshes.new(name+' rooted joint mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free()
    uv=mesh.uv_layers.new(name='Hair flow')
    for face in mesh.polygons:
        face.use_smooth=True
        seam=any(i<rows*sides and i%sides==sides-1 for i in face.vertices)
        for loop in face.loop_indices:
            index=mesh.loops[loop].vertex_index
            if index>=rows*sides:uv.data[loop].uv=(.5,0 if index==rows*sides else 1)
            else:
                row,col=divmod(index,sides)
                uv.data[loop].uv=(1 if seam and col==0 else col/sides,progress[row])
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material);obj.matrix_world=matrix.copy()
    obj['sectionSize']=sides;obj['region']=region;obj['flowProfile']='cosine'
    obj['guideBlender']=json.dumps(guide.tolist());obj['path']=guide.tolist()
    obj['nativeUV']='u=closed section angle0..1; v=actual scalp-root-to-tip guide arclength0..1; caps v0/v1'
    curve=bpy.data.curves.new(name+' joint editable guide','CURVE');curve.dimensions='3D'
    spline=curve.splines.new('POLY');spline.points.add(rows-1)
    for point,coordinate in zip(spline.points,guide):point.co=(*coordinate,1)
    handle=bpy.data.objects.new(curve.name,curve);bpy.context.scene.collection.objects.link(handle)
    handle.hide_render=True;handle.hide_set(True);handle.matrix_world=matrix.copy()
    return obj,guide


def free_rings(samples,sides=64,frames=None):
    if frames is None:frames=transported_frames(samples[:,:3],side_fan=False)
    angles=np.arange(sides)*math.tau/sides
    return np.asarray([sample[:3]+frame[2][None,:]*np.cos(angles)[:,None]*sample[3]/2
                       +frame[1][None,:]*np.sin(angles)[:,None]*sample[4]
                       for sample,frame in zip(samples,frames)])


def main_upper(head,source_rings,source_guide):
    root,normal,skin=actual_root(head,(.10,-.18,2.92))
    join=49  # front v68; the legacy hidden-rear extension is zero here.
    source_offsets=source_rings-source_guide[:,None,:]
    angles=np.arange(64)*math.tau/64
    def trim_extension(offsets,front_v):
        extension=np.interp(front_v,[19,20,24,32,43,50,60,68,160],[.020,.035,.095,.145,.145,.110,.045,0,0])
        offsets=offsets.copy()
        offsets[:,1]-=(-.90*np.cos(angles)+math.sqrt(1-.90**2)*np.sin(angles))*extension/2
        return offsets,extension
    row=39;target,extension=trim_extension(source_offsets[row],19+row)
    bend=source_guide[row].copy();bend[1]-=extension/2
    end=source_guide[join]
    controls=[[*root,.026,.003],[*(root+normal*.050),.055,.010],
              [.052,-.275,3.014,.105,.022],[-.005,-.345,3.030,.170,.036],
              [-.120,-.340,2.980,.176,.031],
              [*bend,2*np.linalg.norm(target[0]),np.linalg.norm(target[16])],
              [*end,2*np.linalg.norm(source_offsets[join,0]),np.linalg.norm(source_offsets[join,16])]]
    upper=sample_controls(controls,97)
    guide_path=np.vstack([upper[:,:3],source_guide[join+1:]])
    frames=transported_frames(guide_path,side_fan=False)
    tangent,normal_frame,lateral=frames[len(upper)-1]
    desired=source_offsets[join,0]-tangent*np.dot(source_offsets[join,0],tangent)
    desired/=np.linalg.norm(desired)
    roll=math.atan2(np.dot(tangent,np.cross(lateral,desired)),np.dot(lateral,desired))
    rolled=[]
    for tangent,normal_frame,lateral in frames[:len(upper)]:
        normal_frame=normal_frame*math.cos(roll)+np.cross(tangent,normal_frame)*math.sin(roll)
        rolled.append((tangent,normal_frame,np.cross(tangent,normal_frame)))
    rings=free_rings(upper,frames=rolled)
    # Deepen only the head-facing half of the upper shoulder. The extra volume
    # belongs to the same ordered section, rather than a sheet under the arch.
    for row,(sample,frame,t) in enumerate(zip(upper,rolled,np.linspace(0,1,len(upper)))):
        ramp=np.clip((t-.20)/.45,0,1)
        boost=.014*math.sin(math.pi*ramp)**2
        if boost==0:continue
        nearest_skin=head.find_nearest(Vector(sample[:3]))[0]
        outward=np.dot(frame[1],sample[:3]-np.asarray(nearest_skin))
        for col,angle in enumerate(angles):
            sine=math.sin(angle)
            if sine*outward<0:rings[row,col]+=frame[1]*sine*boost
    for row,(sample,t) in enumerate(zip(upper,np.linspace(0,1,len(upper)))):
        blend=np.clip((t-.70)/.30,0,1);blend=blend*blend*(3-2*blend)
        if blend==0:continue
        front_v=179+(2.4453-sample[2])*256.25
        offsets=np.stack([np.column_stack([np.interp(front_v,np.arange(19,161),source_offsets[:,col,axis]) for axis in range(3)]) for col in range(64)]).reshape(64,3)
        offsets,_=trim_extension(offsets,front_v)
        rings[row]=rings[row]*(1-blend)+(sample[:3]+offsets)*blend
    rings[-1]=source_rings[join]
    combined=np.vstack([rings,source_rings[join+1:]])
    assert np.array_equal(combined[len(upper):],source_rings[join+1:])
    return combined,dict(controls=controls,rootSkin=skin.tolist(),rootNormal=normal.tolist(),rootGuide=root.tolist(),
                         upperHeadFacingHalfDepthBoost=.014,boostGuideProgressRange=[.20,.65],
                         sourceJoinRow=join,sourceJoinFrontV=19+join,newJoinRow=len(upper)-1,
                         sourceLowerRingCount=len(source_rings)-join-1,sourceLowerRingsExactlyFrozen=True,
                         sourceLowerSHA256=hashlib.sha256(source_rings[join+1:].astype(np.float32).tobytes()).hexdigest())


def crown_rings(name,head):
    root,normal,skin=actual_root(head,(.10,-.18,2.92))
    if name=='Left swept crown':
        controls=[[*root,.026,.003],[*(root+normal*.050),.070,.012],
                  [.030,-.125,3.036,.150,.041],[-.110,.035,3.044,.205,.041],
                  [-.255,.160,2.982,.185,.036],[-.385,.265,2.940,.100,.028],[-.465,.325,3.015,.003,.001]]
    else:
        controls=[[*root,.026,.003],[*(root+normal*.040),.060,.012],
                  [.025,-.120,3.015,.150,.032],[-.140,0,2.980,.200,.034],
                  [-.290,.180,2.865,.160,.030],[-.410,.390,2.710,.003,.001]]
    samples=sample_controls(controls,121)
    return free_rings(samples),dict(controls=controls,rootSkin=skin.tolist(),rootNormal=normal.tolist(),rootGuide=root.tolist())


def inspect_component(obj,head,recipe):
    points=np.asarray([v.co for v in obj.data.vertices],dtype=float)
    guide=np.asarray(json.loads(obj['guideBlender']),dtype=float);sides=int(obj['sectionSize'])
    vertex_distances=[];face_distances=[];negative_faces=[]
    for point in points:
        skin,normal=head.find_nearest(Vector(point))[:2]
        vertex_distances.append(float((Vector(point)-skin).dot(normal)))
    for face in obj.data.polygons:
        point=points[list(face.vertices)].mean(axis=0);skin,normal=head.find_nearest(Vector(point))[:2]
        d=float((Vector(point)-skin).dot(normal));face_distances.append(d)
        if d<0:negative_faces.append(face.index)
    visible,hidden=prior.exposed_negative_faces(obj,points,negative_faces)
    bm=bmesh.new();bm.from_mesh(obj.data)
    closed=all(edge.is_manifold for edge in bm.edges);volume=float(bm.calc_volume(signed=True));bm.free()
    skin,normal,face,root_distance=head.find_nearest(Vector(guide[0]))
    return dict(name=obj.name,rows=len(guide),sectionSize=sides,vertices=len(points),faces=len(obj.data.polygons),
                closed=closed,signedVolume=volume,**prior.prior.exact_crossings(obj.data),recipe=recipe,
                actualRootGuide=guide[0].tolist(),actualRootNearestSkin=list(skin),actualRootDistance=root_distance,
                actualRootRingHeadDistance=[min(vertex_distances[:sides]),max(vertex_distances[:sides])],
                headVertexClearanceMin=min(vertex_distances),headFaceClearanceMin=min(face_distances),
                negativeHeadVertices=sum(d<0 for d in vertex_distances),negativeHeadFaces=len(negative_faces),
                negativeVertexRows=sorted(set(i//sides for i,d in enumerate(vertex_distances[:len(guide)*sides]) if d<0)),
                exposedNegativeFaceViewCount=len(visible),exposedNegativeFaceSamples=visible[:24],hiddenNegativeFaceViewCounts=hidden,
                nativeUV=obj['nativeUV'],bounds=[points.min(axis=0).tolist(),points.max(axis=0).tolist()])


def main():
    output=HERE/'draft-02'
    if output.exists():raise ValueError(f'Preserved candidate exists: {output}')
    output.mkdir()
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
    frozen={o.name:prior.prior.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o.name not in CHANGED}
    objects={name:bpy.data.objects[name] for name in CHANGED}
    matrices={name:obj.matrix_world.copy() for name,obj in objects.items()}
    materials={name:obj.active_material for name,obj in objects.items()}
    head=skull_tree(bpy.data.objects['Head'])
    main_source=objects[MAIN];source_guide=np.asarray(json.loads(main_source['guideBlender']),dtype=float)
    source_rings=np.asarray([v.co for v in main_source.data.vertices[:len(source_guide)*64]],dtype=float).reshape(-1,64,3)
    rings,recipe=main_upper(head,source_rings,source_guide)
    built={MAIN:(rings,recipe)}
    for name in CHANGED[1:]:built[name]=crown_rings(name,head)
    for obj in objects.values():bpy.data.objects.remove(obj,do_unlink=True)
    recipes={};new_objects={}
    for name,(rings,recipe) in built.items():
        obj,guide=closed_object(name,rings,materials[name],matrices[name],'fringe' if name==MAIN else 'crown')
        new_objects[name]=obj;recipes[name]=recipe
        assert np.array_equal(np.asarray(obj.matrix_world),np.asarray(matrices[name]))
    reports=[inspect_component(new_objects[name],head,recipes[name]) for name in CHANGED]
    for name,digest in frozen.items():assert prior.prior.mesh_hash(bpy.data.objects[name])==digest,name
    new_main=new_objects[MAIN]
    lower=np.asarray([v.co for v in new_main.data.vertices[97*64:len(json.loads(new_main['guideBlender']))*64]],dtype=np.float32)
    assert np.array_equal(lower,source_rings[50:].reshape(-1,3).astype(np.float32))
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
    geometry_pass=all(r['closed'] and r['signedVolume']>0 and r['exactCrossingPairs']==0 for r in reports)
    visible_head_pass=all(r['exposedNegativeFaceViewCount']==0 for r in reports)
    report=dict(source=str(SOURCE),sourceSHA256=source_hash,changedObjects=CHANGED,otherMeshesExactlyFrozen=frozen,
                rootContract='All three guides begin at actual nearest Head surface +.001 normal; free shoulders are later guide samples',
                components=reports,geometryConstructionPass=geometry_pass,visibleHeadSafetyPass=visible_head_pass,
                mainLowerGeometryExactlyFrozen=True,originalObjectMatricesExactlyFrozen=True,visualApproval=False,productionReady=False)
    text=bpy.data.texts.new('Root and crown joint recipe.py');text.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'Single-Lock.blend'))
    (output/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
    (output/'build.py').write_text(Path(__file__).read_text())
    print('JUNCTION_BLEND_READY',output,json.dumps({k:v for k,v in report.items() if k not in {'components','otherMeshesExactlyFrozen'}}),flush=True)
    centre=Vector((0,.015,2.64));scene.camera.data.ortho_scale=1.5
    scene.render.resolution_x=scene.render.resolution_y=768;scene.cycles.samples=24;scene.cycles.use_denoising=True
    for view,axis in {'front':(0,-1,0),'right':(-1,0,0),'three-quarter':(-1,-1,0)}.items():
        scene.camera.location=centre+Vector(axis)*4
        scene.camera.rotation_euler=(centre-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(output/f'context-{view}.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'Joint-Context.blend'))
    print('JUNCTION_RENDER_COMPLETE',output,flush=True)
    if not geometry_pass or not visible_head_pass:
        raise ValueError('Joint candidate preserved with geometry or visible Head failures')


if __name__=='__main__':main()
