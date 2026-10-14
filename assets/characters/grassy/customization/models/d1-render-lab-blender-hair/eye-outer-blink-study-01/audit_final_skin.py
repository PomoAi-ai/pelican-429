"""Minimal saved-file audit of the final local colour/material finishing step."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import bpy
import numpy as np

HERE=Path(__file__).resolve().parent
OUT=HERE/'draft-02-corrected'
SOURCE=OUT/'Eye-Local-Retopology.blend'
FINAL=OUT/'Eye-Surface-Final.blend'
spec=importlib.util.spec_from_file_location('eye_finish_audit_shared',HERE/'audit_candidate.py')
shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)


def socket_value(socket):
    if not hasattr(socket,'default_value'):return None
    value=socket.default_value
    if isinstance(value,(str,int,float,bool)):return value
    return list(value) if hasattr(value,'__iter__') else str(value)


def material_state(material):
    tree=material.node_tree
    return dict(diffuse=list(material.diffuse_color),roughness=material.roughness,
        metallic=material.metallic,useBackfaceCulling=material.use_backface_culling,
        nodes={n.name:dict(type=n.bl_idname,image=n.image.name if n.type=='TEX_IMAGE' and n.image else None,
            operation=getattr(n,'operation',None),blendType=getattr(n,'blend_type',None),
            inputs={s.identifier:socket_value(s) for s in n.inputs}) for n in tree.nodes} if tree else {},
        links=sorted((l.from_node.name,l.from_socket.identifier,l.to_node.name,l.to_socket.identifier) for l in tree.links) if tree else [])


def capture(path):
    state=shared.snapshot(path)
    state['materials']={m.name:material_state(m) for m in bpy.data.materials}
    return state


def inside(q,loop):
    result=np.zeros(q.shape[:-1],dtype=bool)
    x,y=q[...,0],q[...,1]
    for a,b in zip(loop,np.roll(loop,-1,axis=0)):
        if a[1]!=b[1]:
            result^=((a[1]>y)!=(b[1]>y))&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])
    return result


def main():
    global FINAL
    parser=argparse.ArgumentParser()
    parser.add_argument('--candidate',type=Path,default=FINAL)
    parser.add_argument('--report',type=Path,default=OUT/'independent-final-skin-audit.json')
    import sys
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    FINAL=args.candidate.resolve()
    hashes={str(p):shared.sha(p) for p in (SOURCE,FINAL)}
    before=capture(SOURCE)
    original_pixels=np.asarray(bpy.data.images['eye-surface-color'].pixels[:]).reshape(512,1024,4)
    after=capture(FINAL)
    changed_meshes={n:[k for k in before['meshes'][n] if before['meshes'][n][k]!=after['meshes'][n][k]] for n in before['meshes']}
    changed_meshes={n:v for n,v in changed_meshes.items() if v}
    changed_materials=[n for n in before['materials'] if before['materials'][n]!=after['materials'][n]]
    mesh=bpy.data.objects['Head'].data;mat=bpy.data.objects['Head'].material_slots[2].material
    shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    clean=bpy.data.images['eye-surface-color-clean']
    clean_pixels=np.asarray(clean.pixels[:]).reshape(512,1024,4)
    changed_pixels=np.any(clean_pixels!=original_pixels,axis=2)
    recipe=json.loads((OUT/'geometry-report.json').read_text())
    patch_checks=[]
    yy,xx=np.indices((512,512))
    for side,patch in enumerate(recipe['patches']):
        lo,hi=np.asarray(patch['parameterBounds']);q=np.stack([lo[0]+(xx+.5)/512*(hi[0]-lo[0]),lo[1]+(yy+.5)/512*(hi[1]-lo[1])],axis=-1)
        p=np.asarray([mesh.vertices[i].co[:] for i in patch['boundaryVertices']])
        loop=np.column_stack([np.arctan2(p[:,0],.035-p[:,1])*.42,p[:,2]])
        within=inside(q,loop);changed=changed_pixels[:,side*512:(side+1)*512]
        patch_checks.append(dict(side=side,changedPixels=int(changed.sum()),changedOutsideActualCut=int((changed&~within).sum())))
    usage=[dict(object=o.name,slot=i,material=s.material.name,polygons=sum(p.material_index==i for p in o.data.polygons))
        for o in bpy.context.scene.objects if o.type=='MESH' for i,s in enumerate(o.material_slots)
        if s.material and s.material.node_tree and any(n.type=='TEX_IMAGE' and n.image==clean for n in s.material.node_tree.nodes)]
    png=OUT/'eye-surface-color-clean.png'
    report=dict(sourceSHA256=hashes[str(SOURCE)],finalSHA256=hashes[str(FINAL)],
        bothFilesUnchanged=all(shared.sha(Path(p))==h for p,h in hashes.items()),
        meshCount=len(before['meshes']),allMeshesFrozen=before['meshes']==after['meshes'],changedMeshFields=changed_meshes,
        originalImageCount=len(before['images']),allPriorImagesFrozen=all(n in after['images'] and v==after['images'][n] for n,v in before['images'].items()),
        missingPriorImages=sorted(set(before['images'])-set(after['images'])),
        addedImages={n:v for n,v in after['images'].items() if n not in before['images']},
        materialCount=len(before['materials']),materialNamesFrozen=set(before['materials'])==set(after['materials']),
        changedMaterials=changed_materials,onlyLocalPatchMaterialChanged=changed_materials==[mat.name],
        skeletonsFrozen=before['bones']==after['bones'],actionsFrozen=before['actions']==after['actions'],
        actionCurveCounts={n:v['curveCount'] for n,v in after['actions'].items()},
        cleanImageUsage=usage,cleanImageSize=list(clean.size),cleanColorSpace=clean.colorspace_settings.name,
        cleanAlphaUnchanged=bool(np.array_equal(clean_pixels[:,:,3],original_pixels[:,:,3])),
        cleanPixelsExactlyEqualPriorColor=bool(np.array_equal(clean_pixels,original_pixels)),
        cleanPackedBytesMatchPriorPNG=bool(clean.packed_file and bytes(clean.packed_file.data)==(OUT/'eye-surface-color.png').read_bytes()),
        cleanPackedBytesMatchPNG=bool(clean.packed_file and bytes(clean.packed_file.data)==png.read_bytes()),
        cleanPNG_SHA256=hashlib.sha256(png.read_bytes()).hexdigest(),pixelScope=patch_checks,
        metallic=dict(value=shader.inputs['Metallic'].default_value,linked=shader.inputs['Metallic'].is_linked),
        roughness=dict(value=shader.inputs['Roughness'].default_value,linked=shader.inputs['Roughness'].is_linked),
        patchNormalLinked=shader.inputs['Normal'].is_linked,
        visualApproval=False,geometryIntersectionsRepeated=False)
    args.report.write_text(json.dumps(report,indent=2)+'\n')
    print('FINAL_SKIN_AUDIT',json.dumps(report),flush=True)


if __name__=='__main__':main()
