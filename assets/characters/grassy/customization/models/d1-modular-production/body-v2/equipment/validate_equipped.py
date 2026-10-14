"""Fresh-import contract and attachment animation check for the equipped export."""
import bpy,json,struct,sys
from pathlib import Path
from mathutils import Matrix
P=Path(__file__).resolve().parent;ROOT=P.parents[7]
sys.path.insert(0,str(ROOT/'scripts/blender_grassy_rodin'))
from animate import activate
f=P/'d1-equipped-game.glb';b=f.read_bytes();doc=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
assert {a['name'] for a in doc['animations']}=={'idle','walk','run','jump'}
parents={c:i for i,n in enumerate(doc['nodes']) for c in n.get('children',[])}
for root,bone in [('FlightHarness','chest'),('FlightCuff_L','forearm.L'),('FlightCuff_R','forearm.R')]:
 i=next(i for i,n in enumerate(doc['nodes']) if n.get('name')==root)
 assert doc['nodes'][parents[i]]['name']==bone,(root,doc['nodes'][parents[i]]['name'])
assert len([n for n in doc['nodes'] if n.get('name','').startswith('fx_')])==4
assert next(n for n in doc['nodes'] if n.get('name')=='Hair')['extras']['characterPart']=='hair'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(f))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');assert len(rig.data.bones)==26
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
mesh_names=[n['name'] for n in doc['nodes'] if 'mesh' in n]
points=[bpy.data.objects[n].matrix_world@v.co for n in mesh_names for v in bpy.data.objects[n].data.vertices]
lo=[min(v[k] for v in points) for k in range(3)];hi=[max(v[k] for v in points) for k in range(3)]
assert abs(lo[2])<1e-4 and abs(hi[2]-lo[2]-3.1)<.02,(lo,hi)
measured={}
for clip,end in [('idle',96),('walk',36),('run',24),('jump',48)]:
 refs={};maxerror=0
 for frame in [0,end//4,end//2,3*end//4,end]:
  activate(rig,clip,frame);bpy.context.view_layer.update()
  for root,bone in [('FlightHarness','chest'),('FlightCuff_L','forearm.L'),('FlightCuff_R','forearm.R')]:
   rel=(rig.matrix_world@rig.pose.bones[bone].matrix).inverted()@bpy.data.objects[root].matrix_world
   if frame==0:refs[root]=rel
   maxerror=max(maxerror,max(abs(rel[r][c]-refs[root][r][c]) for r in range(4) for c in range(4)))
 assert maxerror<2e-5,(clip,maxerror)
 measured[clip]={'sampledFrames':5,'maximumBoneRelativeMatrixError':maxerror}
r={'freshImport':True,'restBoundsMin':lo,'restBoundsMax':hi,'height':hi[2]-lo[2],'bones':26,'clips':[a['name'] for a in doc['animations']],'meshObjects':len(doc['meshes']),'materialPrimitives':sum(len(m['primitives']) for m in doc['meshes']),'triangles':sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']),'fxSockets':4,'hairCharacterPart':'hair','attachmentAnimation':measured,'bytes':f.stat().st_size}
(P/'equipped-export-validation.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
