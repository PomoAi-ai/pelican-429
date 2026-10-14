import bpy,json,struct
from pathlib import Path
from mathutils import Matrix
P=Path(__file__).resolve().parent;f=P/'d1-outfit-game.glb';raw=f.read_bytes();doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(f));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.animation_data.action=None
for t in rig.animation_data.nla_tracks:t.mute=True
for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
names=[n['name'] for n in doc['nodes'] if 'mesh' in n];points=[bpy.data.objects[n].matrix_world@v.co for n in names for v in bpy.data.objects[n].data.vertices];lo=[min(v[k] for v in points) for k in range(3)];hi=[max(v[k] for v in points) for k in range(3)];height=hi[2]-lo[2]
assert abs(lo[2])<1e-4 and abs(height-3.1)<.02,(lo,hi,height)
assert len(rig.data.bones)==26
assert next(n for n in doc['nodes'] if n.get('name')=='Hair')['extras']['characterPart']=='hair'
assert {a['name'] for a in doc['animations']}=={'idle','walk','run','jump'}
report={'source':f.name,'restBoundsMin':lo,'restBoundsMax':hi,'restSoleZ':lo[2],'height':height,'bones':len(rig.data.bones),'clips':[a['name'] for a in doc['animations']],'hairCharacterPart':'hair','freshImport':True}
(P/'game-runtime-contract.json').write_text(json.dumps(report,indent=2));print('RUNTIME_CONTRACT_OK',json.dumps(report),flush=True)
