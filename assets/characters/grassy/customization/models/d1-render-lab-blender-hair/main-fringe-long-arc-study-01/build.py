"""One free closed fringe: a narrow scalp neck, high shoulder and descending earward arc."""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
SOURCE = BASE/'main-side-return-study-02/draft-05/Side-Return-Context.blend'
NAME = 'Single broad swept fringe'
sys.dont_write_bytecode = True
sys.path.insert(0,str(BASE))
from build import scalp,skull_tree
from single_lock import smooth_controls
from build_bob_study import transported_frames

# Width is full width; depth is ellipse half-depth. Only the root centre is fitted.
CONTROLS = np.asarray([
    [.080,-.250,2.900,.016,.0025],
    [.070,-.325,2.964,.045,.016],
    [.035,-.390,3.006,.118,.045],
    [-.035,-.425,2.934,.190,.027],
    [-.150,-.407,2.808,.213,.026],
    [-.305,-.286,2.643,.140,.018],
    [-.445,-.055,2.550,.034,.006],
    [-.458,.0315,2.535,.0036,.0016],
],dtype=float)


def mesh_hash(obj):
    h = hashlib.sha256()
    h.update(np.asarray(obj.matrix_world,dtype=np.float64).tobytes())
    h.update(np.asarray([v.co for v in obj.data.vertices],dtype=np.float64).tobytes())
    h.update(np.asarray([i for p in obj.data.polygons for i in [len(p.vertices),*p.vertices]],dtype=np.int32).tobytes())
    for uv in obj.data.uv_layers:
        h.update(np.asarray([v.uv for v in uv.data],dtype=np.float64).tobytes())
    return h.hexdigest()


def make_main(tree,material):
    controls = CONTROLS.copy()
    skin = scalp(controls[0,:3],tree,0)
    root_normal = np.asarray(tree.find_nearest(Vector(skin))[1],dtype=float)
    controls[0,:3] = skin+root_normal*(controls[0,4]+.003)
    raw = np.asarray([smooth_controls(controls,t) for t in np.linspace(0,1,801)])
    arc = np.r_[0,np.cumsum(np.linalg.norm(np.diff(raw[:,:3],axis=0),axis=1))]
    rows,sides = 129,40
    progress = np.linspace(0,1,rows)
    samples = np.column_stack([np.interp(progress,arc/arc[-1],raw[:,axis]) for axis in range(raw.shape[1])])
    assert np.min(samples[:,3:])>0, 'Catmull profile lost positive thickness'
    frames = transported_frames(samples[:,:3],side_fan=False)
    tangent,normal,lateral = frames[0]
    desired = root_normal-tangent*np.dot(root_normal,tangent);desired /= np.linalg.norm(desired)
    initial_roll = math.atan2(np.dot(tangent,np.cross(normal,desired)),np.dot(normal,desired))
    verts,faces = [],[]
    for row,(sample,frame,t) in enumerate(zip(samples,frames,progress)):
        tangent,normal,lateral = frame
        roll = initial_roll+.18*math.sin(math.pi*t)**1.3
        normal = normal*math.cos(roll)+np.cross(tangent,normal)*math.sin(roll)
        lateral = np.cross(tangent,normal);lateral /= np.linalg.norm(lateral)
        root_inner = 1+.24*math.sin(math.pi*min(1,t/.42))**2
        for col in range(sides):
            angle = math.tau*col/sides
            depth = sample[4]*(root_inner if math.sin(angle)<0 else 1)
            verts.append(sample[:3]+lateral*math.cos(angle)*sample[3]/2+normal*math.sin(angle)*depth)
        if row:
            for col in range(sides):
                a = (row-1)*sides+col;b = (row-1)*sides+(col+1)%sides
                faces.append((a,b,b+sides,a+sides))
    for row in (0,rows-1):
        centre = len(verts);verts.append(samples[row,:3])
        for col in range(sides):
            a,b = row*sides+col,row*sides+(col+1)%sides
            faces.append((centre,b,a) if row==0 else (centre,a,b))
    mesh = bpy.data.meshes.new('Free long-arc fringe native mesh')
    mesh.from_pydata(verts,[],faces);mesh.update()
    bm = bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bm.calc_volume(signed=True)<0:
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free()
    uv = mesh.uv_layers.new(name='Hair flow')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        seam = any(i<rows*sides and i%sides==sides-1 for i in polygon.vertices)
        for loop in polygon.loop_indices:
            index = mesh.loops[loop].vertex_index
            if index>=rows*sides:
                uv.data[loop].uv = (.5,0 if index==rows*sides else 1)
            else:
                row,col = divmod(index,sides)
                uv.data[loop].uv = (1 if seam and col==0 else col/sides,progress[row])
    obj = bpy.data.objects.new(NAME,mesh);bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj['sectionSize'] = sides;obj['region'] = 'fringe';obj['flowProfile'] = 'cosine'
    obj['guideBlender'] = json.dumps(samples[:,:3].tolist())
    obj['nativeUV'] = 'u=circumference/40 (0 and 1 seam); positive-normal face u0..0.5; v=centreline arc length; caps v0/v1'
    spacing = np.gradient(samples[:,:3],axis=0)
    tangents = spacing/np.linalg.norm(spacing,axis=1)[:,None]
    curvature = np.linalg.norm(np.gradient(tangents,axis=0),axis=1)/np.linalg.norm(spacing,axis=1)
    return obj,dict(controls=controls.tolist(),rows=rows,sectionSize=sides,capCentreVertices=2,
                    centrelineLength=float(arc[-1]),curvatureRadiusMaximum=float(np.max(curvature*np.maximum(samples[:,3]/2,samples[:,4]))),
                    transportedFrame='parallel transport with .06 radial orientation alignment, one root rotation + continuous .18rad roll; no body scalp projection',
                    uvRule=obj['nativeUV'])


def exact_crossings(mesh):
    mesh.calc_loop_triangles();verts=[v.co.copy() for v in mesh.vertices]
    faces=[tuple(p.vertices) for p in mesh.polygons];triangles={}
    for tri in mesh.loop_triangles:
        triangles.setdefault(tri.polygon_index,[]).append(tuple(tri.vertices))
    tree=BVHTree.FromPolygons(verts,faces)
    pairs={(i,j) for i,j in tree.overlap(tree) if i<j and not set(faces[i]).intersection(faces[j])}
    def crosses(a,b):
        p,q,r=[verts[i] for i in b];normal=(q-p).cross(r-p).normalized()
        for j in range(3):
            origin=verts[a[j]];edge=verts[a[(j+1)%3]]-origin;length=edge.length
            direction=edge.normalized()
            if abs(direction.dot(normal))<1e-7:continue
            hit=intersect_ray_tri(p,q,r,direction,origin,True)
            if hit is None:continue
            distance=(hit-origin).dot(direction)
            if distance<1e-6 or distance>length-1e-6:continue
            e0,e1,delta=q-p,r-p,hit-p
            d00,d01,d11,d20,d21=e0.dot(e0),e0.dot(e1),e1.dot(e1),delta.dot(e0),delta.dot(e1)
            den=d00*d11-d01*d01
            u,v=(d11*d20-d01*d21)/den,(d00*d21-d01*d20)/den
            if min(u,v,1-u-v)>1e-4:return True
        return False
    exact=[]
    for i,j in sorted(pairs):
        if any(crosses(a,b) or crosses(b,a) for a in triangles[i] for b in triangles[j]):
            exact.append([i,j])
    return dict(nonNeighborBVHPairs=len(pairs),exactCrossingPairs=len(exact),crossingSamples=exact[:20],
                crossingMethod='existing finite edge/triangle, strict interior audit; coplanar overlaps excluded')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--draft',default='draft-01')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    output=HERE/args.draft
    if output.exists():raise ValueError(f'Preserved draft exists: {output}')
    output.mkdir()
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
    old=bpy.data.objects[NAME];mat=old.active_material
    frozen={o.name:mesh_hash(o) for o in scene.objects if o.type=='MESH' and o!=old}
    tree=skull_tree(bpy.data.objects['Head'])
    bpy.data.objects.remove(old,do_unlink=True)
    obj,report=make_main(tree,mat)
    points=np.asarray([v.co for v in obj.data.vertices],dtype=float)
    bm=bmesh.new();bm.from_mesh(obj.data)
    report.update(closed=all(e.is_manifold for e in bm.edges),signedVolume=float(bm.calc_volume(signed=True)));bm.free()
    report.update(exact_crossings(obj.data))
    distances=[];face_distances=[];negative_rows=[];negative_face_rows=[]
    for index,p in enumerate(points):
        q,n=tree.find_nearest(Vector(p))[:2];distance=float((Vector(p)-q).dot(n));distances.append(distance)
        if distance<0:negative_rows.append(index//40)
    for face in obj.data.polygons:
        p=points[list(face.vertices)].mean(axis=0);q,n=tree.find_nearest(Vector(p))[:2]
        distance=float((Vector(p)-q).dot(n));face_distances.append(distance)
        if distance<0:negative_face_rows.append(min(face.vertices)//40)
    report.update(source=str(SOURCE),sourceSHA256=source_hash,vertices=len(points),faces=len(obj.data.polygons),
                  headVertexClearanceMin=min(distances),headFaceClearanceMin=min(face_distances),
                  negativeHeadVertices=sum(d<0 for d in distances),negativeHeadFaces=sum(d<0 for d in face_distances),
                  negativeHeadVertexRows=sorted(set(negative_rows)),negativeHeadFaceRows=sorted(set(negative_face_rows)),
                  bounds=[points.min(axis=0).tolist(),points.max(axis=0).tolist()],otherMeshesExactlyFrozen=frozen,visualApproval=False)
    for name,digest in frozen.items():assert mesh_hash(bpy.data.objects[name])==digest,name
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
    report['onlyHiddenRootEmbedded']=all(row<20 for row in [*negative_rows,*negative_face_rows])
    report['geometricChecksPass']=report['closed'] and report['signedVolume']>0 and report['exactCrossingPairs']==0 and report['onlyHiddenRootEmbedded']
    (output/'build.py').write_text(Path(__file__).read_text())
    (output/'model-report.json').write_text(json.dumps(report,indent=2)+'\n')
    text=bpy.data.texts.new('Free long-arc fringe recipe.py');text.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'Single-Lock.blend'))
    print('LONG_ARC_BLEND_READY',output,json.dumps({k:v for k,v in report.items() if k!='otherMeshesExactlyFrozen'}),flush=True)
    centre=Vector((0,.015,2.64));scene.camera.data.ortho_scale=1.5
    scene.render.resolution_x=scene.render.resolution_y=768
    scene.cycles.samples=24;scene.cycles.use_denoising=True
    for view,axis in {'front':(0,-1,0),'right':(-1,0,0),'three-quarter':(-1,-1,0)}.items():
        scene.camera.location=centre+Vector(axis)*4
        scene.camera.rotation_euler=(centre-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(output/f'context-{view}.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'Long-Arc-Context.blend'))
    print('LONG_ARC_RENDER_COMPLETE',output,report['geometricChecksPass'],flush=True)
    if not report['geometricChecksPass']:raise ValueError('First draft retained with geometry failures; see report')


if __name__=='__main__':main()
