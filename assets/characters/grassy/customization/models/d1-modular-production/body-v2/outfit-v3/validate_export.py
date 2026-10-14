"""Validate independent exported GLBs by JSON contracts and fresh Blender imports."""
import bpy,json,struct
from pathlib import Path
P=Path(__file__).resolve().parent
expected={'idle':3.2,'walk':1.2,'run':.8,'jump':1.6};results={}
for filename,names in [('d1-outfit-animated.glb',{'Body','Head','Hair','Outfit','Shoe.L','Shoe.R'}),('d1-outfit-shoes-only.glb',{'Outfit','Shoe.L','Shoe.R'}),('d1-body-coverage.glb',{'Body'})]:
 raw=(P/filename).read_bytes();assert struct.unpack_from('<I',raw)[0]==0x46546c67
 doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
 nodes=[n for n in doc['nodes'] if 'mesh' in n];assert {n['name'] for n in nodes}==names
 clips={a['name']:max(doc['accessors'][s['input']]['max'][0] for s in a['samplers']) for a in doc['animations']}
 assert set(clips)==set(expected)
 for clip,duration in expected.items():assert abs(clips[clip]-duration)<1e-5
 skirts={i for i,n in enumerate(doc['nodes']) if n.get('name','').startswith('skirt.')};assert len(skirts)==4
 for a in doc['animations']:assert skirts.issubset({c['target']['node'] for c in a['channels']}),a['name']
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(P/filename))
 rigs=[o for o in bpy.data.objects if o.type=='ARMATURE'];assert len(rigs)==1;rig=rigs[0];assert len(rig.data.bones)==26
 report=[]
 for n in nodes:
  ob=bpy.data.objects[n['name']];assert any(m.type=='ARMATURE' and m.object==rig for m in ob.modifiers)
  counts=[sum(g.weight>0 for g in v.groups) for v in ob.data.vertices];sums=[sum(g.weight for g in v.groups) for v in ob.data.vertices]
  assert min(counts)>0 and max(counts)<=4;error=max(abs(v-1) for v in sums);assert error<2e-5
  report.append({'mesh':ob.name,'vertices':len(ob.data.vertices),'maxInfluences':max(counts),'unweighted':counts.count(0),'maximumWeightError':error})
 hidden=[]
 if 'Body' in names:
  for m in doc['materials']:
   if m.get('name','').startswith('D1.Covered.'):
    assert m['alphaMode'] in ('BLEND','MASK') and m['pbrMetallicRoughness']['baseColorFactor'][3]==0,m
    source_name=m['extras']['coverageOriginalMaterial']
    original=next((mat for mat in doc['materials'] if mat.get('name')==source_name),None)
    if original and 'baseColorTexture' in original.get('pbrMetallicRoughness',{}):
     def image_bytes(mat):
      tex=doc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']];im=doc['images'][tex['source']];view=doc['bufferViews'][im['bufferView']];start=28+struct.unpack_from('<I',raw,12)[0]+view.get('byteOffset',0);return raw[start:start+view['byteLength']]
     assert image_bytes(m)==image_bytes(original),m['name']
    assert m['extras']['coveragePart'] in ('outfit','shoe.L','shoe.R')
    hidden.append(m['name'])
  assert len(hidden)>=3
 results[filename]={'bytes':len(raw),'clipsSeconds':clips,'bones':len(rig.data.bones),'skirtBonesAnimatedInAllClips':True,'parts':{n['name']:n['extras']['characterPart'] for n in nodes},'meshes':report,'reversibleCoverageMaterials':hidden,'freshImportVerified':True}
(P/'export-validation.json').write_text(json.dumps(results,indent=2))
print('OUTFIT_EXPORT_VERIFIED',json.dumps(results),flush=True)
