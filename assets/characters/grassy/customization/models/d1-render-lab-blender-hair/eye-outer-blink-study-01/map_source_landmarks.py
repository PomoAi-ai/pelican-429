"""Map observed old eye features to read-only Blender source indices and nearby support samples."""
import hashlib
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

OUT=Path(__file__).resolve().parent
SOURCE=OUT.parent/'temple-root-continuity-study-01/draft-01/PBR-Game-Export.blend'
before=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
obj=bpy.data.objects['Head'];mesh=obj.data;mesh.calc_loop_triangles()
points=np.asarray([obj.matrix_world@v.co for v in mesh.vertices]);gltf=points[:,[0,2,1]]*[1,1,-1]
kd=KDTree(len(points))
for i,p in enumerate(points):kd.insert(Vector(p),i)
kd.balance()
material_names=[m.name for m in mesh.materials]
base_index=material_names.index('model')
base_faces=np.asarray([t.vertices[:] for t in mesh.loop_triangles if t.material_index==base_index])
base_vertices=np.unique(base_faces)
base_kd=KDTree(len(base_vertices))
for i in base_vertices:base_kd.insert(Vector(points[i]),int(i))
base_kd.balance()
head=BVHTree.FromPolygons([Vector(p) for p in gltf],base_faces.tolist(),all_triangles=True)
landmarks=json.loads((OUT/'rim-landmarks.json').read_text())['landmarks'];mapped=[]
for mark in landmarks:
    vertices=[];error=[]
    for p in mark['triangleCoordinatesGLTF']:
        b=Vector((p[0],-p[2],p[1]));q,i,d=kd.find(b);assert d<1e-6,(mark['name'],p,d)
        vertices.append(i);error.append(d)
    source_faces=[polygon.index for polygon in mesh.polygons if polygon.material_index==base_index and len(set(polygon.vertices).intersection(vertices))>=2]
    mapped.append(dict(name=mark['name'],positionGLTF=mark['positionGLTF'],sourceVertexIndices=vertices,sourcePolygonCandidates=source_faces,maximumCoordinateError=max(error)))
# UV space is the documented iris-normalized eye coordinate system; interpolate its exact origin on the patch.
r=np.load(OUT/'eye-head-data.npz');ep,ef,uv=r['eyePoints'],r['eyeTriangles'],r['eyeUV']
target=np.array([2.2/4.7*.5,1.8/3.3*.5]);centres=[]
for sign in (-1,1):
    found=[]
    for face in ef[np.sign(ep[ef[:,0],0])==sign]:
        a,b,c=uv[face];matrix=np.array([b-a,c-a]).T
        if abs(np.linalg.det(matrix))<1e-12:continue
        bc=np.linalg.solve(matrix,target-a);weights=np.array([1-bc.sum(),*bc])
        if weights.min()>=-1e-8:
            found.append(weights@ep[face]);break
    assert found
    centre=found[0]
    # The outer ring is a support proposal to inspect, not a deformation mask; its top stays below y=2.56 and inner side avoids the nose.
    stencil=[('inner',.09,2.44),('upper_inner',.12,2.545),('upper_mid',.22,2.55),('upper_outer',.32,2.55),
        ('outer',.335,2.42),('lower_outer',.30,2.335),('lower_mid',.22,2.32),('lower_inner',.11,2.35)]
    supports=[]
    for label,x,y in stencil:
        hit,n,face,d=head.ray_cast(Vector((sign*x,y,4)),Vector((0,0,-1)));assert hit is not None and hit.z > .15, (sign,label,hit)
        b=Vector((hit.x,-hit.z,hit.y));near,vertex,error=base_kd.find(b)
        supports.append(dict(label=label,positionGLTF=list(hit),positionBlender=list(b),nearestSourceVertex=vertex,
            nearestSourceVertexDistance=error,headPrimitiveTriangle=int(face)))
    centres.append(dict(sideSign=sign,irisOriginUV=target.tolist(),eyePatchIrisOriginGLTF=centre.tolist(),
        eyePatchIrisOriginBlender=[float(centre[0]),float(-centre[2]),float(centre[1])],peripheralSupportProposal=supports))
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==before
report=dict(source=str(SOURCE),sourceSHA256=before,sourceUnchanged=True,sourceHeadVertices=len(points),sourceHeadPolygons=len(mesh.polygons),
    sourceMaterialSlots=material_names,landmarks=mapped,eyes=centres,
    scopeRecommendation=dict(candidateOnlyBoundsGLTF=dict(absoluteX=[.085,.38],y=[2.32,2.55],frontZMinimum=.15),
        hardProtectedAreas='Do not affect |x|<.08 (nose bridge), y>=2.56 (brow), or y<=2.30 (mouth/cheek transition); actual mesh material D1 eye, UVs, normals/indices outside the chosen Head-base patch stay frozen.',
        note='Bounds are a search envelope, not authorization to move every enclosed vertex. Derive each local patch from old-rim landmarks and inspect the peripheral support before fitting. Preserve brow/nose via an explicit unchanged vertex mask.'))
(OUT/'source-landmarks.json').write_text(json.dumps(report,indent=2)+'\n')
print('SOURCE_MAPPED',json.dumps(dict(sourceSHA256=before,landmarks=mapped,centres=[e['eyePatchIrisOriginGLTF'] for e in centres])),flush=True)
