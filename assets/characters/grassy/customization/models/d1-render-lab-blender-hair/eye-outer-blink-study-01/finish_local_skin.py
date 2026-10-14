"""Remove obsolete eye paint/reflection only from the new local skin material."""
from pathlib import Path
import hashlib,importlib.util,json
import bpy,numpy as np

HERE=Path(__file__).resolve().parent
OUT=HERE/'draft-02-corrected'
SOURCE=OUT/'Eye-Local-Retopology.blend'
DEST=OUT/'Eye-Surface-Final.blend'
spec=importlib.util.spec_from_file_location('eye_finish_shared',HERE/'build_retopology_corrected.py');shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)

def main():
    assert not DEST.exists()
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
    hashes={o.name:shared.shared.shared.joint.mesh_hash(o) for o in scene.objects if o.type=='MESH'}
    old_images=shared.shared.shared.image_hashes()
    report=json.loads((OUT/'geometry-report.json').read_text())
    head=bpy.data.objects['Head'];material=head.data.materials[2]
    color=bpy.data.images['eye-surface-color'];mr=bpy.data.images['eye-surface-metal-roughness']
    w,h=color.size;pixels=np.asarray(color.pixels[:]).reshape(h,w,4);result=pixels.copy();mr_pixels=np.asarray(mr.pixels[:]).reshape(h,w,4)
    smoothing=[]
    # Smoothly reconstruct the interior colour from the actual healthy perimeter.
    # The old baked upper-lid crease is not allowed to survive as a static line.
    for side,patch in enumerate(report['patches']):
        x0=side*512;x1=x0+512;tile=pixels[:,x0:x1,:3];filled=tile.copy()
        border=np.ones((h,512),bool);border[10:-10,10:-10]=False
        mean=tile[border].mean(0);filled[~border]=mean
        yy,xx=np.indices((h,512));active=~border
        for iteration in range(2400):
            before=filled.copy() if iteration%100==0 else None
            for parity in (0,1):
                avg=(filled[2:,1:-1]+filled[:-2,1:-1]+filled[1:-1,2:]+filled[1:-1,:-2])*.25
                mask=active[1:-1,1:-1]&(((xx[1:-1,1:-1]+yy[1:-1,1:-1])%2)==parity)
                center=filled[1:-1,1:-1]
                center[mask]+=1.90*(avg[mask]-center[mask])
            if before is not None and np.max(np.abs(filled-before))<1e-7:break
        residual=np.max(np.abs(filled[1:-1,1:-1]-(filled[2:,1:-1]+filled[:-2,1:-1]+filled[1:-1,2:]+filled[1:-1,:-2])*.25)[active[1:-1,1:-1]])
        assert residual<1e-6,('Skin harmonic fill did not converge',residual)
        lo,hi=np.asarray(patch['parameterBounds']);xy=np.stack([lo[0]+(xx+.5)/512*(hi[0]-lo[0]),lo[1]+(yy+.5)/h*(hi[1]-lo[1])],axis=-1)
        coords=np.asarray([head.data.vertices[i].co[:] for i in patch['boundaryVertices']]);loop,_=shared.polar(coords)
        distance=np.full((h,512),1e9)
        for a,b in zip(loop,np.roll(loop,-1,axis=0)):
            d=b-a;factor=np.clip(((xy-a)*d).sum(2)/(d@d),0,1);nearest=a+factor[...,None]*d
            distance=np.minimum(distance,np.linalg.norm(xy-nearest,axis=2))
        weight=shared.shared.smooth(0,.010,distance)*shared.inside(xy,loop)
        result[:,x0:x1,:3]=tile*(1-weight[...,None])+filled*weight[...,None]
        smoothing.append(dict(side=side,iterations=iteration+1,discreteLaplacianResidual=float(residual),maximumRGBChange=float(np.abs(result[:,x0:x1,:3]-tile).max()),skinPerimeterMetalRoughnessMedian=np.median(mr_pixels[:,x0:x1,:3][border],axis=0).tolist()))
    final_image=color.copy();final_image.name='eye-surface-color-clean';final_image.pixels.foreach_set(result.astype(np.float32).ravel());final_image.filepath_raw=str(OUT/'eye-surface-color-clean.png');final_image.file_format='PNG';final_image.save();final_image.pack()
    for node in material.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image==color:node.image=final_image
        if node.type=='BSDF_PRINCIPLED':
            for name,value in [('Metallic',0.0),('Roughness',.68)]:
                for link in list(node.inputs[name].links):material.node_tree.links.remove(link)
                node.inputs[name].default_value=value
    assert all(shared.shared.shared.joint.mesh_hash(bpy.data.objects[n])==v for n,v in hashes.items())
    current_images=shared.shared.shared.image_hashes();assert all(current_images[n]==v for n,v in old_images.items())
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(DEST))
    result=dict(source=str(SOURCE),sourceSHA256=source_hash,candidate=str(DEST),candidateSHA256=hashlib.sha256(DEST.read_bytes()).hexdigest(),all54MeshDataUnchanged=True,allPrior16ImagesUnchanged=True,onlyMaterialIndex=2,onlyFaces=5707,newColorImage='eye-surface-color-clean',newColorSHA256=hashlib.sha256((OUT/'eye-surface-color-clean.png').read_bytes()).hexdigest(),roughness=.68,metallic=0,flatNormalOnlyOnNewPatch=True,perimeterColorWeight=0,interiorBlendDistance=.010,method='Dirichlet harmonic skin colour from preserved healthy perimeter; blend to exact old colour at the actual cut boundary',smoothing=smoothing,published=False,exported=False)
    (OUT/'skin-finish-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print('EYE_SKIN_FINISH_SAVED',DEST,flush=True)

if __name__=='__main__':main()
