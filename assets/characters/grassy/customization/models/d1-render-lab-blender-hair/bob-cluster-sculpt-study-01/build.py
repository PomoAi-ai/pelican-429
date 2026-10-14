"""Grouped short bob sculpture: separate major folds and nested shorter tips."""
import hashlib, importlib.util, json, math, sys
from pathlib import Path
import bpy, bmesh, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent;BASE=HERE.parent;STAGE=HERE/'draft-01'
SOURCE=BASE/'rear-flow-assembly-study-01/draft-02/D1-Hair-Painted.blend'
sys.dont_write_bytecode=True
sys.path.insert(0,str(BASE))
from build import skull_tree

def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
checks=module('bob_cluster_checks',BASE/'bob-cohesive-study-01/draft-02/build_candidate.py')
SIDES,ROWS=32,97
CLAY_COLOR=(.52,.54,.56,1)
CLAY_ROUGHNESS,CLAY_SPECULAR=.78,.12
checks.SIDES=SIDES
# Each record is an independent root-to-tip body, not a common tail offset.
# Positive X is reflected for the two sides; the existing physical roots are fitted below.
FANS={
 1:dict(role='short rear layer nested into the rear primary',p=[[.20,.39,2.67],[.255,.45,2.57],[.298,.486,2.48],[.309,.49,2.415],[.302,.47,2.365]],w=[.05,.095,.12,.065,.002],d=[.004,.027,.036,.021,.0014]),
 2:dict(role='broad rear primary with a long inward finish',p=[[.25,.34,2.62],[.315,.424,2.54],[.372,.465,2.435],[.380,.446,2.32],[.348,.40,2.23],[.300,.362,2.20]],w=[.055,.12,.175,.175,.09,.002],d=[.004,.036,.049,.05,.03,.0014]),
 3:dict(role='short offshoot lying across the middle primary',p=[[.32,.256,2.583],[.374,.335,2.51],[.422,.368,2.415],[.44,.35,2.335],[.437,.31,2.285],[.461,.278,2.265]],w=[.05,.085,.103,.087,.045,.002],d=[.004,.03,.035,.032,.02,.0014]),
 4:dict(role='middle primary with a softly folded inward lower body',p=[[.356,.183,2.576],[.415,.264,2.525],[.462,.302,2.42],[.470,.287,2.325],[.441,.247,2.235],[.37,.221,2.177]],w=[.055,.13,.158,.173,.118,.002],d=[.004,.031,.045,.051,.033,.0014]),
 5:dict(role='ear-back primary connected to the nape mass',p=[[.373,.106,2.543],[.439,.179,2.485],[.48,.213,2.392],[.48,.192,2.297],[.43,.14,2.196],[.366,.112,2.147],[.338,.11,2.139]],w=[.058,.123,.156,.159,.124,.041,.002],d=[.004,.033,.048,.052,.039,.017,.0014]),
 6:dict(role='short inner-overlap tip tucked beside the ear-back body',p=[[.368,.137,2.555],[.411,.197,2.472],[.432,.187,2.385],[.409,.148,2.308],[.37,.095,2.248],[.352,.065,2.229]],w=[.045,.081,.108,.106,.047,.002],d=[.004,.026,.034,.029,.016,.0014]),
 7:dict(role='small nape finishing tip emerging underneath the primary',p=[[.34,.165,2.483],[.358,.202,2.409],[.366,.187,2.333],[.342,.142,2.265],[.31,.085,2.225],[.282,.044,2.217]],w=[.044,.078,.09,.084,.034,.002],d=[.004,.025,.03,.026,.014,.0014]),
}
UNDER=dict(role='continuous hidden ear-back to nape support',p=[[.267,.22,2.82],[.34,.29,2.67],[.373,.325,2.50],[.365,.302,2.369],[.328,.24,2.267],[.275,.17,2.211],[.252,.14,2.202]],w=[.07,.152,.213,.23,.184,.08,.002],d=[.004,.025,.034,.036,.028,.016,.0014])

def unit(x):return x/np.linalg.norm(x)

def sample_controls(values,count):
    a=np.asarray(values,float);pad=np.vstack((a[0],a,a[-1]));samples=[]
    for i in range(1,len(pad)-2):
        p,q,r,s=pad[i-1:i+3]
        for t in np.linspace(0,1,24,endpoint=False):samples.append(.5*(2*q+(-p+r)*t+(2*p-5*q+4*r-s)*t*t+(-p+3*q-3*r+s)*t*t*t))
    samples=np.vstack((samples,a[-1]));arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(samples[:,:3],axis=0),axis=1))]
    return np.column_stack([np.interp(np.linspace(0,arc[-1],count),arc,samples[:,i]) for i in range(a.shape[1])])

def frames(path):
    tangent=np.gradient(path,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None]
    outward=np.array([path[0,0],path[0,1]-.035,0.]);outward=unit(outward-tangent[0]*np.dot(outward,tangent[0]));result=[]
    for i,t in enumerate(tangent):
        if i:
            q=Vector(tangent[i-1]).rotation_difference(Vector(t));outward=np.asarray(q@Vector(outward))
        outward=unit(outward-t*np.dot(outward,t));result.append((t,outward,unit(np.cross(t,outward))))
    return result

def recipe(obj):
    side=-1 if obj.name.startswith('right') else 1
    number=int(obj.name[-2:]) if ' lower fan ' in obj.name else 0
    r=json.loads(json.dumps(FANS[number] if number else UNDER));p=np.asarray(r['p']);p[:,0]*=side
    if side>0:
        # Deliberate unequal mass and terminal heights, with shared physical scalp scale.
        progress=np.linspace(0,1,len(p));blend=progress*progress*(3-2*progress)
        p[:,0]-=.015*blend
        p[:,2]+=({1:.014,2:-.006,3:.023,4:.01,5:.016,6:-.013,7:.007,0:.012}[number])*blend
        p[:,1]+=({1:-.008,2:.005,3:-.014,4:.008,5:-.004,6:.008,7:.003,0:0}[number])*blend
    old=np.asarray(json.loads(obj['guideBlender']));p[0]=old[0]
    r['p']=p.tolist();return r

def sculpt(obj,tree):
    r=recipe(obj);values=np.column_stack((r['p'],r['w'],r['d']))
    hit,n,_,_=tree.find_nearest(Vector(values[0,:3]));values[0,:3]=np.asarray(hit)+np.asarray(n)*.002
    sample=sample_controls(values,ROWS);path=sample[:,:3];width=np.maximum(sample[:,3],.002);depth=np.maximum(sample[:,4],.0014)
    moved=[]
    # Fit the complete section as one volume. Never push individual boundary vertices onto skin.
    for attempt in range(3):
        f=frames(path);shift=np.zeros_like(path)
        for i,(t,n,b) in enumerate(f):
            angles=np.linspace(0,2*math.pi,SIDES,endpoint=False);ca=np.cos(angles);sa=np.sin(angles)
            ring=path[i]+np.outer(ca,b)*width[i]/2+np.outer(sa*(np.where(sa>0,1.,.76)),n)*depth[i]
            limit=-.0025+.0045*min(1,i/10)
            for _ in range(3):
                signed=np.asarray([checks.signed_distance(tree,p) for p in ring]);worst=int(np.argmin(signed))
                if signed[worst]>=limit:break
                q,normal,_,_=tree.find_nearest(Vector(ring[worst]));delta=np.asarray(normal)*(limit-signed[worst]+.0003);ring+=delta;shift[i]+=delta
        if np.max(np.linalg.norm(shift,axis=1))<1e-7:break
        # Gentle neighbouring displacement avoids turning contact fitting into ring steps.
        kernel=np.array([1,3,6,3,1],float)/14
        smooth=np.column_stack([np.convolve(np.pad(shift[:,j],(2,2),mode='edge'),kernel,mode='valid') for j in range(3)])
        path+=shift*.75+smooth*.25
        moved.append(float(np.max(np.linalg.norm(shift,axis=1))))
    f=frames(path);rings=[]
    for i,(t,n,b) in enumerate(f):
        along=i/(ROWS-1);ring=[]
        for j in range(SIDES):
            a=2*math.pi*j/SIDES;x,y=math.cos(a),math.sin(a)
            w=width[i]*(1.035 if x<0 else .965)
            point=path[i]+b*x*w/2+n*y*depth[i]*(1 if y>=0 else .76)
            if y>0:
                # Low-relief channels stay on the continuous major body, without opening deep leaf gaps.
                centre=-.28+.12*math.sin(along*3.0+(.4 if 'fan 04' in obj.name else 0))
                groove=math.exp(-((x-centre)/.16)**2)+.55*math.exp(-((x-.46)/.15)**2)
                point-=n*depth[i]*.12*groove*y*math.sin(math.pi*along)**.7
            ring.append(point)
        rings.append(ring)
    rings=np.asarray(rings);actual=rings.mean(1);arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(actual,axis=0),axis=1))];arc/=arc[-1]
    vertices=np.vstack((rings.reshape(-1,3),actual[0],actual[-1]));faces=[]
    for i in range(ROWS-1):
        for j in range(SIDES):
            a=i*SIDES+j;b=i*SIDES+(j+1)%SIDES;faces.append((a,b,b+SIDES,a+SIDES))
    for row in [0,ROWS-1]:
        cap=ROWS*SIDES+(row>0)
        for j in range(SIDES):
            a=row*SIDES+j;b=row*SIDES+(j+1)%SIDES;faces.append((cap,b,a) if row==0 else (cap,a,b))
    mesh=bpy.data.meshes.new(obj.name+' grouped volume');mesh.from_pydata(vertices.tolist(),[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    closed=all(e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.to_mesh(mesh);bm.free()
    assert closed and volume>0,obj.name
    old_uv=np.asarray([l.uv for l in obj.data.uv_layers['Hair flow'].data]);offset=old_uv.min(0);scale=np.ptp(old_uv,axis=0)
    mesh.materials.append(obj.data.materials[0]);atlas=mesh.uv_layers.new(name='Hair flow');native=mesh.uv_layers.new(name='Hair flow native')
    for poly in mesh.polygons:
        poly.use_smooth=True;seam=any(v<ROWS*SIDES and v%SIDES==SIDES-1 for v in poly.vertices)
        for li in poly.loop_indices:
            index=mesh.loops[li].vertex_index
            if index>=ROWS*SIDES:u=.5;v=float(index>ROWS*SIDES)
            else:
                row,col=divmod(index,SIDES);u=1. if seam and col==0 else col/SIDES;v=float(arc[row])
            native.data[li].uv=(u,v);atlas.data[li].uv=offset+np.array([u,v])*scale
    mesh.uv_layers.active=atlas;atlas.active_render=True;obj.data=mesh
    obj['guideBlender']=json.dumps(actual.tolist());obj['path']=actual.tolist();obj['sectionSize']=SIDES
    obj['referenceRole']=r['role'];obj['nativeFlowUV']='Hair flow native: U closed perimeter, V actual centroid-guide arclength; active Hair flow uses existing tile'
    result=checks.audit(obj,tree,neck)
    result.update(recipe=r,contactFitMaximumRingShift=moved,guideRoot=actual[0].tolist(),guideTip=actual[-1].tolist(),rootCentreSigned=checks.signed_distance(tree,actual[0]),nativeUVRange=[0,1],guideSamples=len(actual))
    print('CLUSTER_COMPONENT',obj.name,json.dumps({k:v for k,v in result.items() if k not in ('recipe',)}),flush=True)
    return result

def main():
    global neck
    STAGE.mkdir(exist_ok=False);sha=hashlib.sha256(SOURCE.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
    names=[f'{side} lower fan {i:02}' for side in ('right','left') for i in range(1,8)]+[f'{side} lower body underfold' for side in ('right','left')]
    frozen={o.name:checks.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o.name not in names}
    head=skull_tree(bpy.data.objects['Head']);body=bpy.data.objects['Body'];neck=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[p.vertices[:] for p in body.data.polygons])
    results={name:sculpt(bpy.data.objects[name],head) for name in names}
    assert all(checks.mesh_hash(bpy.data.objects[n])==h for n,h in frozen.items())
    report=dict(source=str(SOURCE),sourceSHA256=sha,changedComponents=names,frozenOtherMeshes=frozen,componentResults=results,visualApproval=False,animationApproval=False,exported=False)
    (STAGE/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n');(STAGE/'recipe.py').write_text(Path(__file__).read_text())
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(STAGE/'Bob-Clusters.blend'))
    clay=bpy.data.materials.new('Short bob sculpture clay');clay.use_nodes=True;node=clay.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=CLAY_COLOR;node.inputs['Roughness'].default_value=CLAY_ROUGHNESS;node.inputs['Specular IOR Level'].default_value=CLAY_SPECULAR
    for name in json.loads(scene['Hair components']):bpy.data.objects[name].data.materials.clear();bpy.data.objects[name].data.materials.append(clay)
    centre=Vector((0,.015,2.64));scene.camera.data.type='ORTHO';scene.camera.data.ortho_scale=1.5;scene.render.resolution_x=scene.render.resolution_y=768;scene.cycles.samples=48;scene.cycles.use_denoising=False
    for view,axis in {'front':(0,-1,0),'right':(-1,0,0),'three-quarter':(-1,-1,0)}.items():
        scene.camera.location=centre+Vector(axis)*4;scene.camera.rotation_euler=(centre-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(STAGE/f'clay-{view}.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(STAGE/'Clay-Preview.blend'))
    assert all(checks.mesh_hash(bpy.data.objects[n])==h for n,h in frozen.items());assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==sha
    print('BOB_CLUSTER_READY',STAGE,flush=True)
if __name__=='__main__':main()
