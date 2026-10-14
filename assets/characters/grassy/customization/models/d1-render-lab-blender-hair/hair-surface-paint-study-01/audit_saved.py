"""Read the saved material study and prove its geometry/guide lock."""
import importlib.util,json
from pathlib import Path
import bpy,numpy as np
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('paint_build',HERE/'build_paint.py');build=importlib.util.module_from_spec(spec);spec.loader.exec_module(build)
spec=importlib.util.spec_from_file_location('paint_material_audit',HERE.parent/'eye-outer-blink-study-01/audit_final_skin.py');materials=importlib.util.module_from_spec(spec);spec.loader.exec_module(materials)
shared=build.shared
SOURCE=build.SOURCE;CANDIDATE=HERE/'draft-02/Hair-Surface-Paint.blend'

def capture(path):
    result=shared.snapshot(path)
    result['guides']={o.name:{k:str(v) for k,v in o.items()} for o in bpy.context.scene.objects if o.type=='MESH'}
    result['material']={m.name:materials.material_state(m) for m in bpy.data.materials}
    mat=bpy.data.objects[build.TARGETS[0]].material_slots[0].material
    img=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE')
    result['activeMaterial']=mat.name;result['activeImage']=img.name
    result['pixels']=np.asarray(img.pixels[:],np.float32).reshape(2048,2048,4)
    result['packed']=bytes(img.packed_file.data)
    return result

before=capture(SOURCE);after=capture(CANDIDATE)
changed={name:[k for k in before['meshes'][name] if before['meshes'][name][k]!=after['meshes'][name][k]] for name in before['meshes']}
changed={n:v for n,v in changed.items() if v}
old_material=before['material'][before['activeMaterial']]
new_material=after['material'][after['activeMaterial']]
for node in new_material['nodes'].values():
    if node['image']==after['activeImage']:node['image']=before['activeImage']
mask=np.zeros((2048,2048),bool)
recipe=json.loads((HERE/'draft-02/paint-report.json').read_text())
for item in recipe['components']:
    x,y=np.array(item['tile'])*292;mask[y:y+292,x:x+292]=True
report=dict(sourceSHA256=shared.sha(SOURCE),candidateSHA256=shared.sha(CANDIDATE),meshCount=len(before['meshes']),
    changedMeshFields=changed,onlyExpectedEightMaterialSlotsChanged=changed=={n:['slots'] for n in build.TARGETS},
    allGeometryUVNormalsWeightsTransformsFrozen=all(all(k=='slots' for k in changes) for changes in changed.values()),
    allGuidesAndObjectPropertiesFrozen=before['guides']==after['guides'],
    rigFrozen=before['bones']==after['bones'],actionsFrozen=before['actions']==after['actions'],
    oldImageCount=len(before['images']),allOldImagesFrozen=all(n in after['images'] and v==after['images'][n] for n,v in before['images'].items()),
    materialResponseExactlyFrozen=new_material==old_material,
    allSourceMaterialsFrozen=all(n in after['material'] and v==after['material'][n] for n,v in before['material'].items()),
    unmodifiedAtlasPixelsExactlyFrozen=bool(np.array_equal(before['pixels'][~mask],after['pixels'][~mask])),
    alphaExactlyFrozen=bool(np.array_equal(before['pixels'][:,:,3],after['pixels'][:,:,3])),
    newPackedAtlasMatchesPNG=after['packed']==(HERE/'draft-02/hair-continuous-flow-atlas.png').read_bytes(),
    visualVerdict='rejected: wrong sampled bars removed, but the remaining evenly polished ribbon appearance does not yet match the painted reference',
    allowedCorrectionCount=1,correctionsUsed=1,exported=False,published=False)
assert report['onlyExpectedEightMaterialSlotsChanged']
assert report['allGeometryUVNormalsWeightsTransformsFrozen'] and report['allGuidesAndObjectPropertiesFrozen']
assert report['allOldImagesFrozen'] and report['unmodifiedAtlasPixelsExactlyFrozen'] and report['materialResponseExactlyFrozen']
(HERE/'draft-02/saved-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print('PAINT_SAVED_AUDIT',json.dumps(report),flush=True)
