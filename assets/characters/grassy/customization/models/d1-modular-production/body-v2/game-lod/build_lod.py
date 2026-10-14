"""LOD asset copies. Preserve approved Head and shared neck ring; verify exported rigs."""
import bpy,sys,json,hashlib,importlib.util
import numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
P=Path(__file__).resolve().parent;SRC=P.parent/'animated-base';ROOT=P.parents[7]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'scripts/blender_grassy_rodin'));import animate as base
spec=importlib.util.spec_from_file_location('source_anim',SRC/'build_animation.py');anim=importlib.util.module_from_spec(spec);spec.loader.exec_module(anim)

def points(o):return np.array([v.co[:] for v in o.data.vertices])
def tris(o):return sum(len(p.vertices)-2 for p in o.data.polygons)
def surface(o):return BVHTree.FromPolygons([v.co for v in o.data.vertices],[p.vertices[:] for p in o.data.polygons])
def distance(a,b):
 d=np.array([b.find_nearest(Vector(p))[3] for p in a]);return {'maximum':float(d.max()),'p99':float(np.percentile(d,99)),'rms':float(np.sqrt((d*d).mean()))}
def reduce(o,ratio):
 bpy.context.view_layer.objects.active=o
 m=o.modifiers.new('LOD collapse','DECIMATE');m.ratio=ratio;m.use_collapse_triangulate=True
 if o.name=='Body':m.vertex_group='head';m.invert_vertex_group=True;m.vertex_group_factor=1000
 bpy.ops.object.modifier_move_up(modifier=m.name);bpy.ops.object.modifier_apply(modifier=m.name)
 for v in o.data.vertices:
  weights=sorted([(g.group,g.weight) for g in v.groups if g.weight>0],key=lambda a:-a[1])[:4];total=sum(w for _,w in weights);assert total>0
  for g in list(v.groups):o.vertex_groups[g.group].remove([v.index])
  for gi,w in weights:o.vertex_groups[gi].add([v.index],w/total,'REPLACE')

def render(rig,label):
 scene=bpy.context.scene;scene.render.resolution_x=512;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.cycles.samples=8;scene.render.film_transparent=True
 cam=scene.camera;center=Vector((0,0,1.55));cam.data.ortho_scale=3.5
 for clip,frame,view,vector in [('idle',0,'front',(0,-1,0)),('idle',0,'right',(1,0,0)),('walk',9,'right',(1,0,0)),('run',6,'right',(1,0,0)),('jump',12,'right',(1,0,0))]:
  base.activate(rig,clip,frame);cam.location=center+Vector(vector)*12;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(P/'preview'/f'{label}-{clip}-{view}.png');bpy.ops.render.render(write_still=True)

(P/'preview').mkdir(exist_ok=True);reports={}
for label,ratios in [('source',None),('game',(.55,.35)),('light',(.3,.2))]:
 bpy.ops.wm.open_mainfile(filepath=str(SRC/'candidate.blend'));rig=bpy.data.objects['D1ModularBaseRig'];objects={n:bpy.data.objects[n] for n in ('Body','Head','Hair')}
 rig.animation_data.action=None
 for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
 bpy.context.scene.frame_set(0)
 original={n:{'tris':tris(o),'vertices':len(o.data.vertices),'points':points(o),'surface':surface(o),'hash':base.surface_hash(o.data)} for n,o in objects.items()}
 if ratios:
  reduce(objects['Body'],ratios[0]);reduce(objects['Hair'],ratios[1])
  source_rig=json.loads((SRC/'rig-report.json').read_text());base.JOINTS=source_rig['joints']
  body=objects['Body'];body.vertex_groups.clear()
  for modifier in list(body.modifiers):
   if modifier.type=='ARMATURE':body.modifiers.remove(modifier)
  anim.bind_body(body,rig,source_rig['scale'])
  assert original['Head']['hash']==base.surface_hash(objects['Head'].data),'Approved head changed'
  report={'headUnchanged':True,'sourceSHA256':hashlib.sha256((SRC/'candidate.blend').read_bytes()).hexdigest(),'meshes':{}}
  for n,o in objects.items():
   before=original[n];after=points(o);report['meshes'][n]={'sourceTriangles':before['tris'],'triangles':tris(o),'vertices':len(after),'sourceToLOD':distance(before['points'],surface(o)),'LODToSource':distance(after,before['surface']),'boundsMinDelta':(after.min(0)-before['points'].min(0)).tolist(),'boundsMaxDelta':(after.max(0)-before['points'].max(0)).tolist()}
  report['totalTriangles']=sum(tris(o) for o in objects.values());report['animationChecks']=anim.verify(rig,objects,json.loads((SRC/'rig-report.json').read_text())['scale'])
  bpy.ops.object.select_all(action='DESELECT')
  for o in [rig,*objects.values()]:o.select_set(True)
  bpy.context.view_layer.objects.active=rig;rig.animation_data.action=None
  for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
  bpy.context.scene.frame_set(0)
  path=P/f'd1-base-{label}.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_nla_strips=True,export_skins=True,export_all_influences=False,export_image_format='AUTO',export_lights=False,export_cameras=False)
  report['glbBytes']=path.stat().st_size;reports[label]=report
  bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(P/f'{label}.blend'))
  (P/'lod-report.json').write_text(json.dumps(reports,indent=2))
 if label!='source' or not (P/'preview/source-jump-right.png').exists():render(rig,label)
print('LOD_GENERATED',json.dumps({k:v['totalTriangles'] for k,v in reports.items()}))
