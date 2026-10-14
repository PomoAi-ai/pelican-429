"""Re-import final exported glTF and inspect skinning/animation, not the source blend."""
import bpy,json,struct
from pathlib import Path
P=Path(__file__).resolve().parent
import sys
label=sys.argv[sys.argv.index('--')+1]
source=P/f'd1-base-{label}.glb'
data=source.read_bytes();magic,version,length=struct.unpack_from('<III',data);assert magic==0x46546c67 and version==2 and length==len(data)
json_size,json_type=struct.unpack_from('<II',data,12);assert json_type==0x4e4f534a
doc=json.loads(data[20:20+json_size])
expected={'idle':3.2,'walk':1.2,'run':.8,'jump':1.6}
clips={a['name']:max(doc['accessors'][s['input']]['max'][0] for s in a['samplers']) for a in doc['animations']}
assert set(clips)==set(expected),(clips,expected)
for name,seconds in expected.items():assert abs(clips[name]-seconds)<1e-5,(name,clips[name])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
rigs=[o for o in bpy.data.objects if o.type=='ARMATURE'];assert len(rigs)==1
rig=rigs[0];assert len(rig.data.bones)==22
# Blender creates an Icosphere bone display widget on import; inspect glTF asset nodes.
mesh_nodes=[n for n in doc['nodes'] if 'mesh' in n]
assert {n['extras']['characterPart'] for n in mesh_nodes}=={'body','head','hair'} and len(mesh_nodes)==3
meshes=[bpy.data.objects[n['name']] for n in mesh_nodes]
assert all(o.type=='MESH' for o in meshes)
reports=[]
for ob in meshes:
 assert any(m.type=='ARMATURE' and m.object==rig for m in ob.modifiers),ob.name
 counts=[sum(g.weight>0 for g in v.groups) for v in ob.data.vertices]
 sums=[sum(g.weight for g in v.groups) for v in ob.data.vertices]
 assert min(counts)>0 and max(counts)<=4,(ob.name,min(counts),max(counts))
 assert max(abs(w-1) for w in sums)<2e-5,ob.name
 reports.append({'mesh':ob.name,'vertices':len(ob.data.vertices),'maxInfluences':max(counts),'unweighted':counts.count(0),'weightMaxError':max(abs(w-1) for w in sums)})
(P/f'{label}-export-validation.json').write_text(json.dumps({'source':source.name,'glbClipsSeconds':clips,'importedActions':[a.name for a in bpy.data.actions],'importedRigBones':len(rig.data.bones),'meshes':reports,'characterParts':{n['name']:n['extras']['characterPart'] for n in mesh_nodes},'validation':'Fresh Blender glTF import plus GLB animation time accessor checks'},indent=2))
print('EXPORTED_GLB_VERIFIED',json.dumps(clips))
