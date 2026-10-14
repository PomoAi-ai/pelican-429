"""Rebuild the existing lower bob as overlapping compact volumes."""
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
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
STAGE = HERE / 'draft-01'
SOURCE = BASE / 'bob-cohesive-study-01/draft-02/Bob-Cohesive.blend'
sys.dont_write_bytecode = True
sys.path.insert(0, str(BASE))
from build import skull_tree


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


old = module('previous_cohesive_helpers', BASE/'bob-cohesive-study-01/draft-02/build_candidate.py')
bob = old.bob
SIDES, ROWS = 28, 81


def smooth(a, b, t):
    f = np.clip((t-a)/(b-a), 0, 1)
    return f*f*(3-2*f)


def resample(points):
    distance = np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]
    distance /= distance[-1]
    return np.column_stack([np.interp(np.linspace(0,1,ROWS),distance,points[:,axis]) for axis in range(3)])


def layout(obj):
    source = np.asarray(json.loads(obj['guideBlender']))
    path = resample(source)
    t = np.linspace(0,1,ROWS)
    side = -1 if source[-1,0] < 0 else 1
    phase = 0.
    if ' lower fan ' in obj.name:
        number = int(obj.name[-2:])-1
        envelope = smooth(.14,.5,t)*(1-.6*smooth(.78,1,t))
        path[:,0] += side*np.asarray([0,-.010,.015,-.035,0,.015,0])[number]*envelope
        path[:,1] += np.asarray([0,-.020,.020,.035,.028,.025,.010])[number]*envelope
        path[:,2] += np.asarray([0,.008,0,.025,0,.012,.002])[number]*smooth(.62,1,t)
        maximum_width = [.082,.080,.130,.087,.132,.093,.064][number]
        maximum_depth = maximum_width*[.36,.36,.34,.35,.34,.35,.36][number]
        phase = [.10,-.13,.12,-.18,.08,.15,-.12][number]
    elif obj.name.endswith('lower body underfold'):
        controls = np.asarray([source[0],source[10],[side*.415,.285,2.455],[side*.390,.245,2.30],[side*.360,.215,2.195],[side*.323,.205,2.145]])
        if side > 0:
            controls[2:,0] *= .96
            controls[2:,2] += .012
        path = resample(bob.catmull(controls,16))
        maximum_width, maximum_depth = .165,.050
        phase = side*.10
    else:
        maximum_width, maximum_depth = .12,.034
        # Keep the hidden nape volume, with a descending narrow finish.
        path[:,1] -= .018*smooth(.40,.75,t)
    width = maximum_width*np.interp(t,[0,.06,.20,.38,.63,.78,.9,.97,1],[.04,.32,.83,1,1,.80,.42,.12,.014])
    depth = maximum_depth*np.interp(t,[0,.06,.20,.38,.63,.78,.9,.97,1],[.045,.38,.90,1,.95,.72,.36,.10,.035])
    return source,path,width,depth,phase


def make_rings(path,width,depth,phase,is_fan):
    frames = bob.transported_frames(path,is_fan)
    rings=[]
    for row,(centre,frame,w,d) in enumerate(zip(path,frames,width,depth)):
        tangent,normal,lateral=frame
        t=row/(ROWS-1)
        angle=phase*math.sin(math.pi*t)
        normal,lateral=normal*math.cos(angle)+lateral*math.sin(angle),lateral*math.cos(angle)-normal*math.sin(angle)
        ring=[]
        for col in range(SIDES):
            u=2*math.pi*col/SIDES
            c,s=math.cos(u),math.sin(u)
            point=centre+lateral*c*w/2+normal*s*d
            if s>0:
                groove=math.exp(-((c+.34+.04*math.sin(5*t))/.14)**2)+.7*math.exp(-((c-.28)/.13)**2)
                point-=normal*d*.12*groove*s*math.sin(math.pi*t)
            ring.append(point)
        rings.append(ring)
    return np.asarray(rings)


def fit_to_head(path,width,depth,phase,is_fan,tree):
    path=path.copy()
    surface,normal,_,_=tree.find_nearest(Vector(path[0]))
    path[0]=np.asarray(surface)-np.asarray(normal)*.0022
    adjustments=[]
    # Each correction translates a whole section; roots are narrow closed volumes,
    # never flattened/reprojected rings joined to differently oriented body rings.
    for iteration in range(7):
        rings=make_rings(path,width,depth,phase,is_fan)
        corrections=np.zeros_like(path)
        for row,ring in enumerate(rings):
            margin=-.003+.0055*min(1,row/5)
            tests=list(ring)
            tests.extend((ring+np.roll(ring,-1,axis=0))*.5)
            signed=[old.signed_distance(tree,p) for p in tests]
            worst=int(np.argmin(signed))
            if signed[worst]<margin:
                hit,normal,_,_=tree.find_nearest(Vector(tests[worst]))
                corrections[row]+=np.asarray(normal)*(margin-signed[worst]+.0003)
        if iteration>=2:
            for row in range(5,ROWS-1):
                face_centres=(rings[row]+np.roll(rings[row],-1,axis=0)+rings[row+1]+np.roll(rings[row+1],-1,axis=0))*.25
                signed=[old.signed_distance(tree,p) for p in face_centres]
                worst=int(np.argmin(signed))
                if signed[worst]<.001:
                    hit,normal,_,_=tree.find_nearest(Vector(face_centres[worst]))
                    shift=np.asarray(normal)*(.0015-signed[worst])
                    corrections[row]+=shift
                    corrections[row+1]+=shift
        maximum=float(np.max(np.linalg.norm(corrections,axis=1)))
        adjustments.append(maximum)
        if maximum<1e-6:
            break
        path+=corrections
    return path,make_rings(path,width,depth,phase,is_fan),adjustments


def rebuild(obj,tree,tile,atlas_size,tile_size):
    source,path,width,depth,phase=layout(obj)
    old_anchor=path[0].copy()
    path,rings,fit=fit_to_head(path,width,depth,phase,obj.get('region')=='rear bob',tree)
    verts=rings.reshape(-1,3).tolist()
    faces=[]
    for row in range(ROWS-1):
        for col in range(SIDES):
            a=row*SIDES+col;b=row*SIDES+(col+1)%SIDES
            faces.append((a,b,b+SIDES,a+SIDES))
    for row in [0,ROWS-1]:
        cap=len(verts);verts.append(np.mean(rings[row],axis=0).tolist())
        for col in range(SIDES):
            a=row*SIDES+col;b=row*SIDES+(col+1)%SIDES
            faces.append((cap,b,a) if row==0 else (cap,a,b))
    mesh=bpy.data.meshes.new(obj.name+' cohesive closed volume')
    mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bm.calc_volume(signed=True)<0:
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges),obj.name
    assert bm.calc_volume(signed=True)>0,obj.name
    bm.to_mesh(mesh);bm.free()
    distance=np.r_[0,np.cumsum(np.linalg.norm(np.diff(path,axis=0),axis=1))];distance/=distance[-1]
    atlas=mesh.uv_layers.new(name='Hair flow')
    native=mesh.uv_layers.new(name='Hair flow native')
    offset=np.asarray(tile)*tile_size
    for face in mesh.polygons:
        face.use_smooth=True
        seam=any(v<ROWS*SIDES and v%SIDES==SIDES-1 for v in face.vertices)
        for i in face.loop_indices:
            vertex=mesh.loops[i].vertex_index
            if vertex>=ROWS*SIDES:
                value=np.array([.5,0 if vertex==ROWS*SIDES else 1])
            else:
                row,col=divmod(vertex,SIDES)
                value=np.array([1 if seam and col==0 else col/SIDES,distance[row]])
            native.data[i].uv=value
            atlas.data[i].uv=(offset+8+value*(tile_size-16))/atlas_size
    mesh.uv_layers.active=atlas;atlas.active_render=True
    materials=list(obj.data.materials)
    obj.data=mesh
    for mat in materials:mesh.materials.append(mat)
    obj['guideBlender']=json.dumps(path.tolist())
    obj['guideMeaning']='Actual centreline of 81 closed sections; first 5 sections form the natural embedded root transition'
    obj['nativeFlowUV']='Hair flow native 0..1, active Hair flow is original atlas tile'
    obj['rootDistance']=old.signed_distance(tree,path[0])
    obj['rootEmbeddingRows']=5
    return dict(name=obj.name,sourceGuide=source.tolist(),maximumWidth=float(max(width)),maximumDepth=float(max(depth)),rootCenterDisplacement=float(np.linalg.norm(path[0]-old_anchor)),rootCenterSignedDistance=obj['rootDistance'],fittingMaximumPerPass=fit,vertices=len(mesh.vertices),faces=len(mesh.polygons),nativeUVLayer='Hair flow native',atlasTile=tile)


def audit(obj,tree,neck_tree):
    mesh=obj.data
    bm=bmesh.new();bm.from_mesh(mesh)
    result=dict(closed=all(e.is_manifold for e in bm.edges),volume=float(bm.calc_volume(signed=True)));bm.free()
    roots=[];body=[];surface=[];neck=[]
    for v in mesh.vertices:
        signed=old.signed_distance(tree,v.co)
        (roots if v.index<5*SIDES or v.index==ROWS*SIDES else body).append(signed)
        if v.co.z<2.3:neck.append(old.signed_distance(neck_tree,v.co))
    for f in mesh.polygons:
        if min(f.vertices)<5*SIDES or ROWS*SIDES in f.vertices:continue
        surface.append(old.signed_distance(tree,np.mean([mesh.vertices[i].co for i in f.vertices],axis=0)))
    result.update(rootMinimum=min(roots),bodyVertexMinimum=min(body),bodyFaceMinimum=min(surface),neckBodyMinimum=min(neck) if neck else None,selfIntersections=old.proper_crossings(mesh))
    return result


def main():
    STAGE.mkdir(exist_ok=False)
    (STAGE/'recipe.py').write_text(Path(__file__).read_text())
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
    names=json.loads((SOURCE.parent/'merge-contract.json').read_text())['changedComponents']
    frozen={o.name:old.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o.name not in names}
    tree=skull_tree(bpy.data.objects['Head'])
    body=bpy.data.objects['Body']
    neck=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[tuple(p.vertices) for p in body.data.polygons])
    paint=json.loads((BASE/'fringe-junction-assembly-study-01/draft-03/paint-report.json').read_text())
    components={r['name']:r for r in paint['components']}
    mat=bpy.data.objects[names[0]].active_material
    texture=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE').image
    atlas_size=texture.size[0];tile_size=atlas_size//math.ceil(math.sqrt(len(components)))
    changed=[rebuild(bpy.data.objects[name],tree,components[name]['tile'],atlas_size,tile_size) for name in names]
    audits={name:audit(bpy.data.objects[name],tree,neck) for name in names}
    for name,digest in frozen.items():assert old.mesh_hash(bpy.data.objects[name])==digest,name
    result=dict(source=str(SOURCE),sourceSHA256=source_hash,changedComponents=names,changes=changed,frozenOtherMeshHashes=frozen,geometry=audits,atlasSize=atlas_size,tileSize=tile_size,atlasPadding=8,UVMode='Hair flow active is unchanged atlas tile; Hair flow native is 0..1 with actual arclength V',atlasPixelsChanged=False,rootPolicy='Old flattened rings replaced by narrow closed volumetric roots; embedding permitted only in first 5 rings and reported separately.',visualApproval=False,animationApproval=False,exported=False)
    (STAGE/'geometry-report.json').write_text(json.dumps(result,indent=2)+'\n')
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(STAGE/'Bob-Cohesive.blend'))
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
    preview=module('cohesive_round_preview',BASE/'assembly-study-34/paint-preview/render_preview.py')
    preview.HERE=STAGE;preview.SOURCE=STAGE/'Bob-Cohesive.blend';preview.main()
    print('COHESIVE_VOLUME_READY',STAGE,flush=True)


if __name__=='__main__':main()
