"""Create the protected-boundary game LOD for the V3 dress rig."""
import bpy,bmesh,sys,json,math,hashlib
import numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
P=Path(__file__).resolve().parent;ROOT=P.parents[7];sys.dont_write_bytecode=True
sys.path.insert(0,str(P.parent/'animated-base'));import build_animation as anim
base=anim.base
bpy.ops.wm.open_mainfile(filepath=str(P/'candidate.blend'))
rig=bpy.data.objects['D1ModularBaseRig'];objects={n:bpy.data.objects[n] for n in ('Body','Head','Hair','Outfit','Shoe.L','Shoe.R')}
rig.animation_data.action=None
for tr in rig.animation_data.nla_tracks:tr.mute=True
for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
bpy.context.scene.frame_set(0)

def pts(ob):return np.array([v.co[:] for v in ob.data.vertices])
def tris(ob):return sum(len(f.vertices)-2 for f in ob.data.polygons)
def tree(ob):return BVHTree.FromPolygons([v.co for v in ob.data.vertices],[f.vertices[:] for f in ob.data.polygons])
def distances(p,t):
 d=np.array([t.find_nearest(Vector(v))[3] for v in p]);return {'max':float(d.max()),'p99':float(np.percentile(d,99)),'rms':float(np.sqrt((d*d).mean()))}
def render(label,frames):
 scene=bpy.context.scene;scene.render.resolution_x=640;scene.render.resolution_y=800;scene.cycles.samples=10;cam=scene.camera;center=Vector((0,0,1.55));cam.data.ortho_scale=3.85
 for clip,frame in frames:
  base.activate(rig,clip,frame)
  for view,v in [('front',(0,-1,0)),('right',(1,0,0)),('back',(0,1,0))]:
   cam.location=center+Vector(v)*12;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(P/'game-preview'/f'{label}-{clip}-{frame:02d}-{view}.png')
   bpy.ops.render.render(write_still=True)
def rest():
 rig.animation_data.action=None
 for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
 bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
def export(name):
 rest();bpy.ops.object.select_all(action='DESELECT')
 for ob in [rig,*objects.values()]:ob.select_set(True)
 bpy.context.view_layer.objects.active=rig
 bpy.ops.export_scene.gltf(filepath=str(P/name),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_nla_strips=True,export_skins=True,export_all_influences=False,export_image_format='AUTO',export_lights=False,export_cameras=False)
(P/'game-preview').mkdir(exist_ok=True)
original={n:{'points':pts(o),'tree':tree(o),'hash':base.surface_hash(o.data),'tris':tris(o)} for n,o in objects.items()}
body=objects['Body'];protected=set()
for v in body.data.vertices:
 if any(body.vertex_groups[g.group].name=='head' and g.weight>.95 for g in v.groups):protected.add(v.index)
edgefaces={tuple(sorted(e.vertices)):[] for e in body.data.edges}
for f in body.data.polygons:
 for a,b in zip(f.vertices,list(f.vertices)[1:]+[f.vertices[0]]):edgefaces[tuple(sorted((a,b)))].append(f.material_index)
for (a,b),mats in edgefaces.items():
 if len(set(mats))>1:protected.update((a,b))
# Protect one neighbor ring too, so decimation cannot drag the visible alpha boundary.
core=set(protected)
for e in body.data.edges:
 if any(i in core for i in e.vertices):protected.update(e.vertices)
protected_points=[body.data.vertices[i].co.copy() for i in sorted(protected)]
protect=body.vertex_groups.new(name='LOD preserved material boundaries');protect.add(sorted(protected),1,'REPLACE')
for n,ratio in [('Body',.55),('Hair',.35)]:
 o=objects[n];bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Game LOD','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
 if n=='Body':mod.vertex_group=protect.name;mod.invert_vertex_group=True;mod.vertex_group_factor=1000
 bpy.ops.object.modifier_move_up(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod.name)
 if n=='Body':o.vertex_groups.remove(o.vertex_groups['LOD preserved material boundaries'])
 for v in o.data.vertices:
  weights=sorted([(g.group,g.weight) for g in v.groups if g.weight>0],key=lambda a:-a[1])[:4];s=sum(w for _,w in weights);assert s>0
  for g in list(v.groups):o.vertex_groups[g.group].remove([v.index])
  for gi,w in weights:o.vertex_groups[gi].add([v.index],w/s,'REPLACE')
kd=KDTree(len(body.data.vertices))
for v in body.data.vertices:kd.insert(v.co,v.index)
kd.balance();boundary_error=max(kd.find(v)[2] for v in protected_points);assert boundary_error<1e-5,boundary_error
source_rig=json.loads((P.parent/'animated-base/rig-report.json').read_text());base.JOINTS=source_rig['joints'];body.vertex_groups.clear()
for mod in list(body.modifiers):
 if mod.type=='ARMATURE':body.modifiers.remove(mod)
anim.bind_body(body,rig,source_rig['scale'])
assert original['Head']['hash']==base.surface_hash(objects['Head'].data)
for name in ('Outfit','Shoe.L','Shoe.R'):assert original[name]['hash']==base.surface_hash(objects[name].data)
# The actual shared ring must stay closed throughout all four clips after rebinding.
head=objects['Head'];bp=pts(body);hp=pts(head);pairs=[]
for hi in np.flatnonzero(abs(hp[:,2]-hp[:,2].min())<1e-5):
 bi=int(np.argmin(np.linalg.norm(bp-hp[hi],axis=1)))
 if np.linalg.norm(bp[bi]-hp[hi])<2e-5:pairs.append((bi,int(hi)))
assert len(pairs)>=100,len(pairs)
checks={}
for clip,dur in anim.DURATIONS.items():
 gap=0;minz=99;ground=0;first={}
 for frame in range(dur+1):
  base.activate(rig,clip,frame);b=anim.evaluated_points(body);h=anim.evaluated_points(head);gap=max(gap,max(float(np.linalg.norm(b[bi]-h[hi])) for bi,hi in pairs))
  if frame==0:first={n:anim.evaluated_points(o) for n,o in objects.items()}
  for side,offset in [('L',0),('R',.5)]:
   z=float(anim.evaluated_points(objects['Shoe.'+side])[:,2].min());minz=min(minz,z)
   if clip in ('walk','run') and (frame/dur+offset)%1<(.44 if clip=='run' else .60):ground=max(ground,abs(z))
 closure=max(float(np.linalg.norm(anim.evaluated_points(o)-first[n],axis=1).max()) for n,o in objects.items())
 assert gap<1e-4 and ground<.003 and minz>-.005 and closure<.0002
 checks[clip]={'neckGap':gap,'minimumShoeZ':minz,'supportGroundError':ground,'loopEndpointDifference':closure}
report={'headUnchanged':True,'clothesShoesDecimated':False,'bodyRatio':.55,'hairRatio':.35,'protectedBoundaryVertices':len(protected),'protectedBoundaryPositionError':boundary_error,'sharedNeckPairs':len(pairs),'meshes':{},'clips':checks}
for n,o in objects.items():
 before=original[n];p=pts(o);report['meshes'][n]={'sourceTriangles':before['tris'],'triangles':tris(o),'vertices':len(p),'sourceToLOD':distances(before['points'],tree(o)),'LODToSource':distances(p,before['tree'])}
report['totalTriangles']=sum(tris(o) for o in objects.values());export('d1-outfit-game.glb');report['glbBytes']=(P/'d1-outfit-game.glb').stat().st_size
(P/'game-lod-report.json').write_text(json.dumps(report,indent=2))
render('game',[('idle',0),('walk',9),('run',6),('jump',7),('jump',23)]);rest();bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(P/'outfit-game.blend'))
print('OUTFIT_GAME_READY',json.dumps({'totalTriangles':report['totalTriangles'],'boundaryError':boundary_error}),flush=True)
