"""Read-only saved-file and seam audit of the second local skin candidate."""
import argparse
import importlib.util
import json
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
OUT = HERE/'draft-02'
spec=importlib.util.spec_from_file_location('eye_saved_contract',HERE/'audit_candidate.py')
shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)


def capture(path):
    state=shared.snapshot(path)
    obj=bpy.data.objects['Head'];mesh=obj.data
    state.update(triangles=np.asarray([p.vertices[:] for p in mesh.polygons]),
        materials=np.asarray([p.material_index for p in mesh.polygons]),
        uv={l.name:shared.values(l.data,'uv',2).reshape(-1,3,2) for l in mesh.uv_layers},
        groupNames=[g.name for g in obj.vertex_groups],
        weightPatterns=sorted(set(tuple((g.group,g.weight) for g in v.groups) for v in mesh.vertices)),
        shapeKeys=mesh.shape_keys.name if mesh.shape_keys else None,
        colors=[l.name for l in mesh.color_attributes],
        materialDetails=[dict(index=i,link=s.link,name=s.material.name,
            images=[dict(image=n.image.name,size=list(n.image.size),colorspace=n.image.colorspace_settings.name,packed=bool(n.image.packed_file))
                for n in s.material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image],
            principledNormalLinked=[n.inputs['Normal'].is_linked for n in s.material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'])
            for i,s in enumerate(obj.material_slots)],
        imageUsage={img.name:[(o.name,j,s.material.name) for o in bpy.context.scene.objects if o.type=='MESH' for j,s in enumerate(o.material_slots)
            if s.material and s.material.node_tree and any(n.type=='TEX_IMAGE' and n.image==img for n in s.material.node_tree.nodes)]
            for img in bpy.data.images if img.type!='RENDER_RESULT'})
    return state


def topology(points,faces):
    used=np.unique(faces)
    unique,inv=np.unique(points[used],axis=0,return_inverse=True)
    remap=np.full(len(points),-1);remap[used]=inv;f=remap[faces]
    directed=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]])
    edges,count=np.unique(np.sort(directed,axis=1),axis=0,return_counts=True)
    boundary=edges[count==1];bp=unique[np.unique(boundary)]
    parent=np.arange(len(unique))
    def find(a):
        while parent[a]!=a:
            parent[a]=parent[parent[a]];a=parent[a]
        return a
    for a,b in edges:
        ra,rb=find(a),find(b)
        if ra!=rb:parent[ra]=rb
    directed_unique,directed_counts=np.unique(directed,axis=0,return_counts=True)
    return dict(usedVertices=len(used),weldedVertices=len(unique),triangles=len(f),
        connectedComponents=len(set(find(a) for a in range(len(unique)))),
        boundaryEdges=len(boundary),boundaryCoordinateDigest=shared.digest(unique[boundary]),
        boundaryBounds=[bp.min(0).tolist(),bp.max(0).tolist()],
        eyeHeightBoundaryVertices=int(((bp[:,2]>2.30)&(bp[:,2]<2.56)).sum()),
        nonmanifoldEdges=int((count>2).sum()),duplicatedDirectedEdges=int((directed_counts>1).sum()),
        euler=len(unique)-len(edges)+len(f))


def crossing_depths(points,faces,pairs):
    measures=[]
    for ia,ib,hit in pairs:
        a,b=points[faces[ia]],points[faces[ib]]
        na=np.cross(a[1]-a[0],a[2]-a[0]);na/=np.linalg.norm(na)
        nb=np.cross(b[1]-b[0],b[2]-b[0]);nb/=np.linalg.norm(nb)
        da=(a-b[0])@nb;db=(b-a[0])@na
        depth=max(min(float(da.max()),float(-da.min())),min(float(db.max()),float(-db.min())))
        measures.append(dict(pair=[ia,ib],point=hit,maxStraddleDepth=depth,
            planeAngleDegrees=float(np.degrees(np.arccos(np.clip(abs(na@nb),-1,1)))),
            sharedVertexCount=len(set(faces[ia])&set(faces[ib]))))
    measures.sort(key=lambda p:p['maxStraddleDepth'],reverse=True)
    return dict(count=len(measures),depthOver1e7=sum(m['maxStraddleDepth']>1e-7 for m in measures),
        depthOver1e6=sum(m['maxStraddleDepth']>1e-6 for m in measures),
        maxStraddleDepth=measures[0]['maxStraddleDepth'] if measures else 0,examples=measures[:10])


def main():
    global OUT
    parser=argparse.ArgumentParser();parser.add_argument('--out-dir',type=Path,default=OUT)
    import sys
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    OUT=args.out_dir.resolve()
    source_path=shared.SOURCE;candidate_path=OUT/'Eye-Local-Retopology.blend'
    hashes={str(p):shared.sha(p) for p in (source_path,candidate_path)}
    a,b=capture(source_path),capture(candidate_path)
    d=np.load(OUT/'head-diff.npz');retained=d['retainedSourcePolygons']
    n=len(a['points']);eye=d['eyeVertices'];skin=np.unique(a['triangles'][a['materials']==0])
    protected=(abs(a['points'][:,0])<.08)|(a['points'][:,2]>=2.56)|(a['points'][:,2]<=2.30)
    normals_a=a['normals'].reshape(-1,3,3)[retained]
    normals_b=b['normals'].reshape(-1,3,3)[:len(retained)]
    normal_delta=np.linalg.norm(normals_a-normals_b,axis=2)
    protected_corners=protected[a['triangles'][retained]]
    corners_frozen_coordinates=np.all(a['points'][a['triangles'][retained]]==b['points'][b['triangles'][:len(retained)]],axis=2)
    other_names=sorted(set(a['meshes'])-{'Head'})
    changed_other={n:[k for k in a['meshes'][n] if a['meshes'][n][k]!=b['meshes'][n][k]] for n in other_names}
    changed_other={n:v for n,v in changed_other.items() if v}
    report=dict(sourceSHA256=hashes[str(source_path)],candidateSHA256=hashes[str(candidate_path)],
        filesUnchanged=all(shared.sha(Path(p))==h for p,h in hashes.items()),
        otherMeshCount=len(other_names),otherMeshesFullyFrozen=not changed_other,changedOtherMeshFields=changed_other,
        originalImageCount=len(a['images']),originalImagesFrozen=all(a['images'][n]==b['images'][n] for n in a['images']),
        addedImages={n:v for n,v in b['images'].items() if n not in a['images']},
        newImageUsage={n:b['imageUsage'][n] for n in b['images'] if n not in a['images']},
        materialDetails=b['materialDetails'],
        skeletonsFrozen=a['bones']==b['bones'],actionsFrozen=a['actions']==b['actions'],actions=a['actions'],
        sourcePointsMatchDiff=bool(np.array_equal(a['points'],d['before'])),
        candidatePointsMatchDiff=bool(np.array_equal(b['points'],d['after'])),
        savedTrianglesMatchDiff=bool(np.array_equal(b['triangles'],d['triangles'])),
        savedMaterialsMatchDiff=bool(np.array_equal(b['materials'],d['materials'])),
        retainedTrianglesExactlyFrozen=bool(np.array_equal(b['triangles'][:len(retained)],a['triangles'][retained])),
        retainedMaterialsExactlyFrozen=bool(np.array_equal(b['materials'][:len(retained)],a['materials'][retained])),
        retainedUVExactlyFrozen={name:bool(np.array_equal(uv[retained],b['uv'][name][:len(retained)])) for name,uv in a['uv'].items()},
        eyeTrianglesExactlyFrozen=bool(np.array_equal(a['triangles'][a['materials']==1],b['triangles'][b['materials']==1])),
        eyeUVExactlyFrozen={name:bool(np.array_equal(uv[a['materials']==1],b['uv'][name][b['materials']==1])) for name,uv in a['uv'].items()},
        allOriginalSkinPositionsFrozen=bool(np.array_equal(a['points'][skin],b['points'][skin])),
        protectedPositionsFrozen=bool(np.array_equal(a['points'][protected],b['points'][:n][protected])),
        removedPolygonCount=len(d['removedSourcePolygons']),addedPolygonCount=len(d['newFaces']),
        newVertexCount=len(b['points'])-n,
        groupNamesFrozen=a['groupNames']==b['groupNames'],sourceWeightPatterns=a['weightPatterns'],candidateWeightPatterns=b['weightPatterns'],
        noShapeKeysOrColors=b['shapeKeys'] is None and not b['colors'],
        skinTopology={key:topology(v['points'],v['triangles'][np.isin(v['materials'],[0,2])]) for key,v in [('before',a),('after',b)]},
        retainedProtectedCornerNormals=dict(count=int(protected_corners.sum()),changed=int((normal_delta[protected_corners]>0).sum()),
            maxVectorDifference=float(normal_delta[protected_corners].max())),
        eyeDisplacementRangeXYZ=[(b['points'][eye]-a['points'][eye]).min(0).tolist(),(b['points'][eye]-a['points'][eye]).max(0).tolist()],
        visualApproval=False)
    if np.any(b['materials']==2):
        patch_uv=b['uv']['UVMap'][b['materials']==2]
        patch_faces=b['triangles'][b['materials']==2]
        delta=patch_uv[:,1:]-patch_uv[:,0,None]
        uv_area=.5*(delta[:,0,0]*delta[:,1,1]-delta[:,0,1]*delta[:,1,0])
        by_vertex={};uv_discontinuities=0
        for tri,uvs in zip(patch_faces,patch_uv):
            for vi,uv in zip(tri,uvs):
                if vi in by_vertex and not np.array_equal(by_vertex[vi],uv):uv_discontinuities+=1
                by_vertex[vi]=uv
        report['patchAtlasScope']=dict(material2ExclusiveToNewPolygons=bool(np.array_equal(np.flatnonzero(b['materials']==2),np.arange(len(retained),len(b['triangles'])))),
            newMaterialTriangleCount=len(patch_faces),continuousUVAtSharedVertices=uv_discontinuities==0,
            uvBounds=[patch_uv.reshape(-1,2).min(0).tolist(),patch_uv.reshape(-1,2).max(0).tolist()],
            minimumAbsoluteUVTriangleArea=float(abs(uv_area).min()),uvWindingSigns=np.unique(np.sign(uv_area)).tolist(),
            negativeXWithinLeftHalf=bool(np.all(patch_uv[b['points'][patch_faces].mean(1)[:,0]<0,:,0]<.5)),
            positiveXWithinRightHalf=bool(np.all(patch_uv[b['points'][patch_faces].mean(1)[:,0]>0,:,0]>.5)))
    cross=json.loads((OUT/'independent-intersection-audit.json').read_text())
    # Retained eye faces preserve original full-Head polygon IDs after retopology.
    report['eyeSelfCrossingDepths']={key:crossing_depths(v['points'],a['triangles'],cross['states'][key]['eyeSelf']['pairs']) for key,v in [('before',a),('after',b)]}
    (OUT/'independent-contract-audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print('RETOPOLOGY_SAVED_CONTRACT',json.dumps({k:v for k,v in report.items() if k!='eyeSelfCrossingDepths'}),flush=True)
    print('EYE_CROSSING_DEPTH',json.dumps(report['eyeSelfCrossingDepths']),flush=True)


if __name__=='__main__':main()
