"""One diagnostic horizontal envelope: independent front X and side Y silhouettes."""
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent
BASE=HERE.parent
SOURCE=BASE/'main-side-return-study-02/draft-05/Side-Return-Context.blend'
NAME='Single broad swept fringe'
sys.dont_write_bytecode=True
sys.path.insert(0,str(BASE))
from build import skull_tree


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value


prior=module('long_arc_helpers',BASE/'main-fringe-long-arc-study-01/build.py')
preview=module('return_preview',BASE/'main-side-return-study-01/build_study.py')


def horizontal_bounds(contour,v):
    hits=[]
    for a,b in zip(contour,np.roll(contour,-1,axis=0)):
        if abs(a[1]-b[1])<1e-10:
            if abs(v-a[1])<1e-8:hits.extend([float(a[0]),float(b[0])])
        elif min(a[1],b[1])-1e-8<=v<=max(a[1],b[1])+1e-8:
            hits.append(float(a[0]+(b[0]-a[0])*(v-a[1])/(b[1]-a[1])))
    if not hits:raise ValueError(f'No source contour at v={v}')
    return min(hits),max(hits)


def envelope(material):
    front_study=json.loads((BASE/'reference/painted-lock-study.json').read_text())
    piece=next(p for p in front_study['pieces'] if p['id']=='fringe-outer-left')
    front=np.asarray(piece['boundary_a_root_to_tip_px']+piece['boundary_b_root_to_tip_px'][-2::-1],dtype=float)
    side_study=json.loads((BASE/'main-fringe-long-arc-study-01/reference-review.json').read_text())['visibleSideMainLock']
    side=np.asarray(side_study['visibleShoulderConnector']['points']+side_study['boundaryB']['points'][1:]+side_study['boundaryA']['points'][-2::-1],dtype=float)
    sections=[];verts=[];faces=[];sides=64
    for row,front_v in enumerate(np.arange(20.,161.)):
        side_v=front_v+7
        if front_v<43:
            centre_u=float(np.interp(front_v,[20,27,35,43],[203,201,199,194.5]))
            width=float(np.interp(front_v,[20,27,35,43],[4,12,20,29]))
            xmin_u,xmax_u=centre_u-width/2,centre_u+width/2
            evidence='Assumed narrow X shoulder above the visible front boundary'
        elif front_v<=153:
            xmin_u,xmax_u=horizontal_bounds(front,front_v)
            evidence='Both source contours have visible evidence at this height'
        else:
            xmin_u=xmax_u=72.
            evidence='Seven-pixel source endpoint mismatch: narrow X continuation only'
        ymin_u,ymax_u=horizontal_bounds(side,side_v)
        xmin,xmax=(xmin_u-187)/256.25,(xmax_u-187)/256.25
        ymin,ymax=.09-(ymax_u-152)/256.25,.09-(ymin_u-152)/256.25
        z=2.4453+(179-front_v)/256.25
        centre=np.array([(xmin+xmax)/2,(ymin+ymax)/2,z])
        radii=np.array([max((xmax-xmin)/2,.0001),max((ymax-ymin)/2,.0001)])
        sections.append(dict(row=row,frontV=float(front_v),sideV=float(side_v),z=z,
                             frontUBounds=[xmin_u,xmax_u],sideUBounds=[ymin_u,ymax_u],
                             xBounds=[xmin,xmax],yBounds=[ymin,ymax],centre=centre.tolist(),
                             radius=radii.tolist(),evidence=evidence))
        for col in range(sides):
            angle=math.tau*col/sides
            verts.append(centre+[math.cos(angle)*radii[0],math.sin(angle)*radii[1],0])
        if row:
            for col in range(sides):
                a=(row-1)*sides+col;b=(row-1)*sides+(col+1)%sides
                faces.append((a,b,b+sides,a+sides))
    rows=len(sections)
    for row in (0,rows-1):
        centre=len(verts);verts.append(sections[row]['centre'])
        for col in range(sides):
            a,b=row*sides+col,row*sides+(col+1)%sides
            faces.append((centre,b,a) if row==0 else (centre,a,b))
    mesh=bpy.data.meshes.new('Independent horizontal silhouette envelope')
    mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free()
    uv=mesh.uv_layers.new(name='Diagnostic section coordinates')
    for polygon in mesh.polygons:
        polygon.use_smooth=True
        for loop in polygon.loop_indices:
            index=mesh.loops[loop].vertex_index
            if index>=rows*sides:uv.data[loop].uv=(.5,0 if index==rows*sides else 1)
            else:
                row,col=divmod(index,sides);uv.data[loop].uv=(col/sides,row/(rows-1))
    obj=bpy.data.objects.new(NAME,mesh);bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj['sectionSize']=sides;obj['region']='fringe'
    obj['guideBlender']=json.dumps([s['centre'] for s in sections])
    obj['Diagnostic']='Independent per-Z X/Y envelope; no scalp fit, root join, texture or runtime approval'
    return obj,sections


def nearest_record(tree,point,index,kind,section):
    skin,normal=tree.find_nearest(Vector(point))[:2]
    d=float((Vector(point)-skin).dot(normal))
    return dict(index=index,kind=kind,signedDistance=d,point=list(map(float,point)),
                nearestHeadPoint=list(skin),headNormal=list(normal),
                frontPixel=[187+float(point[0])*256.25,179+(2.4453-float(point[2]))*256.25],
                sidePixel=[152+(.09-float(point[1]))*256.25,186+(2.4453-float(point[2]))*256.25],
                section=section)


def main():
    if (HERE/'Envelope-Context.blend').exists():raise ValueError('Preserved one-shot envelope already exists')
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
    old=bpy.data.objects[NAME];material=old.active_material
    frozen={o.name:prior.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o!=old}
    tree=skull_tree(bpy.data.objects['Head'])
    bpy.data.objects.remove(old,do_unlink=True)
    obj,sections=envelope(material);points=np.asarray([v.co for v in obj.data.vertices])
    vertex_records=[nearest_record(tree,p,i,'vertex',min(i//64,len(sections)-1)) for i,p in enumerate(points)]
    face_records=[nearest_record(tree,points[list(face.vertices)].mean(axis=0),face.index,'face-centre',min(min(face.vertices)//64,len(sections)-1)) for face in obj.data.polygons]
    negative_vertices=[r for r in vertex_records if r['signedDistance']<0]
    negative_faces=[r for r in face_records if r['signedDistance']<0]
    for section in sections:
        rows=[r for r in vertex_records if r['section']==section['row']]
        fs=[r for r in face_records if r['section']==section['row']]
        section['minVertexHeadDistance']=min(r['signedDistance'] for r in rows)
        section['negativeVertices']=sum(r['signedDistance']<0 for r in rows)
        section['minFaceHeadDistance']=min((r['signedDistance'] for r in fs),default=None)
    bm=bmesh.new();bm.from_mesh(obj.data)
    closed=all(e.is_manifold for e in bm.edges);volume=float(bm.calc_volume(signed=True));bm.free()
    crossing=prior.exact_crossings(obj.data)
    negative_all=negative_vertices+negative_faces
    report=dict(purpose='One-shot independent envelope compatibility test, not a finished or publishable hairstyle',
                source=str(SOURCE),sourceSHA256=source_hash,sectionConstruction='Horizontal Z planes; independent exact X and Y silhouette extrema; axis-aligned ellipses; no endpoint/material-t pairing and no transported frames',
                assumptions=['front_v20..43: narrow hidden-shoulder X envelope, not measured from front art',
                             'front_v153..160: source tips differ by seven pixels after registration; narrow X continuation to side_v167',
                             'A .0001 minimum radius only regularizes zero-width endpoint caps',
                             'Scalp/root attachment is intentionally not attempted; no point was moved to clear Head'],
                measuredCommonFrontVRange=[43,153],rows=len(sections),sectionSize=64,vertices=len(points),faces=len(obj.data.polygons),
                closed=closed,signedVolume=volume,**crossing,
                headVertexClearanceMin=min(r['signedDistance'] for r in vertex_records),
                headFaceClearanceMin=min(r['signedDistance'] for r in face_records),
                negativeHeadVertices=len(negative_vertices),negativeHeadFaces=len(negative_faces),
                conflictZRange=None if not negative_all else [min(r['point'][2] for r in negative_all),max(r['point'][2] for r in negative_all)],
                deepestVertices=sorted(negative_vertices,key=lambda r:r['signedDistance'])[:16],
                deepestFaces=sorted(negative_faces,key=lambda r:r['signedDistance'])[:16],
                sections=sections,otherMeshesExactlyFrozen=frozen,
                visualApproval=False,headCompatibilityPass=not negative_all,
                productionReady=False)
    for name,digest in frozen.items():assert prior.mesh_hash(bpy.data.objects[name])==digest,name
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
    report['geometryConstructionPass']=closed and volume>0 and crossing['exactCrossingPairs']==0
    (HERE/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
    text=bpy.data.texts.new('Horizontal envelope recipe.py');text.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'Envelope-Context.blend'))
    print('ENVELOPE_SAVED',json.dumps({k:v for k,v in report.items() if k not in ['sections','otherMeshesExactlyFrozen','deepestVertices','deepestFaces']}),flush=True)
    preview.STAGE=HERE;preview.render(scene,'context')
    print('ENVELOPE_RENDER_COMPLETE',flush=True)
    if not report['geometryConstructionPass']:raise ValueError('Envelope construction invalid; study retained')


if __name__=='__main__':main()
