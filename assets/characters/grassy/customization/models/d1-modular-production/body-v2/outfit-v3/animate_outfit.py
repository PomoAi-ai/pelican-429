"""Bind the fitted V3 dress and reused boots to the continuous-body rig, preserving head/hair."""
import bpy,bmesh,sys,json,math,hashlib
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.kdtree import KDTree
import numpy as np
P=Path(__file__).resolve().parent;ROOT=P.parents[7];sys.dont_write_bytecode=True
sys.path.insert(0,str(P.parent/'animated-base'));import build_animation as anim
base=anim.base
sys.path.insert(0,str(ROOT/'scripts/character_customization'))
from inspect_standalone_head import bounds,setup_scene,mesh_report
bpy.ops.wm.open_mainfile(filepath=str(P.parent/'animated-base/candidate.blend'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
objects={n:bpy.data.objects[n] for n in ('Body','Head','Hair')};body=objects['Body']
rig.animation_data.action=None
for tr in rig.animation_data.nla_tracks:tr.mute=True
for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
bpy.context.scene.frame_set(0)
before={n:base.surface_hash(o.data) for n,o in objects.items()}
with bpy.data.libraries.load(str(P/'static-fit.blend'),link=False) as (src,dst):dst.objects=['Outfit','Shoe.L','Shoe.R']
for ob in dst.objects:
 bpy.context.scene.collection.objects.link(ob);objects[ob.name]=ob
 # Render shell thickness becomes real geometry before binding and GLB export.
 bpy.context.view_layer.objects.active=ob;ob.select_set(True)
 for m in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=m.name)
 ob.select_set(False)
# Preserve the continuous Body; switching outfit off restores these material assignments.
coverage=json.loads((P/'coverage-faces.json').read_text())
oldslots={str(i):body.data.polygons[i].material_index for i in coverage['faceIndices']}
maskslots={};faceparts={}
for i in coverage['faceIndices']:
 face=body.data.polygons[i];part=('shoe.L' if face.center.x>0 else 'shoe.R') if face.center.z<.25 else 'outfit';old=face.material_index;key=(part,old)
 if key not in maskslots:
  original=body.data.materials[old];mask=original.copy();mask.name='D1.Covered.'+part+'.'+str(old)
  bsdf=mask.node_tree.nodes.get('Principled BSDF')
  for link in list(bsdf.inputs['Alpha'].links):mask.node_tree.links.remove(link)
  bsdf.inputs['Alpha'].default_value=0;mask.surface_render_method='DITHERED';mask.diffuse_color=(*mask.diffuse_color[:3],0)
  mask['coveragePart']=part;mask['coverageOriginalMaterial']=original.name;mask['uncoveredOpacity']=1.0
  body.data.materials.append(mask);maskslots[key]=len(body.data.materials)-1
 face.material_index=maskslots[key];faceparts[str(i)]=part
body['outfitCoverage']='outfit-v3/coverage-faces.json';body['coverageActive']=True
coverage.update({'originalMaterialByFace':oldslots,'partByFace':faceparts,'hiddenMaterials':[body.data.materials[i].name for i in maskslots.values()],'restore':'Coverage materials copy the original atlas/material. Set opacity 1 to uncover corresponding coveragePart, opacity 0 to cover. Source face indices and originalMaterialByFace are Blender authoring metadata only, not glTF vertex indices.'})
(P/'coverage-faces.json').write_text(json.dumps(coverage,indent=2))
# Four skirt controls are children of hips. The original 22 bones remain unchanged.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
# Tails follow the V3 hem (z≈.86, radius≈.6).
skirt={'Front':((0,-.15,1.55),(0,-.47,.92)),'Back':((0,.15,1.55),(0,.45,.92)),'L':((.21,0,1.55),(.57,0,.92)),'R':((-.21,0,1.55),(-.57,0,.92))}
for part,(head,tail) in skirt.items():
 b=rig.data.edit_bones.new('skirt.'+part);b.head=head;b.tail=tail;b.parent=rig.data.edit_bones['hips'];b.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT')
for b in rig.pose.bones:b.rotation_mode='QUATERNION'
points=base.mesh_coordinates(body.data);kd=KDTree(len(points))
for i,p in enumerate(points):kd.insert(p,i)
kd.balance();bodygroups={g.index:g.name for g in body.vertex_groups}
weights=[{bodygroups[g.group]:g.weight for g in v.groups} for v in body.data.vertices]
binding={}
# Ankle joint z=.135; the sole and toe box stay rigid on the foot below .15, the shaft is fully shin-driven above .26.
BOOT_SHAFT=(.15,.26)
for name in ('Outfit','Shoe.L','Shoe.R'):
 ob=objects[name];ob.vertex_groups.clear();groups={b.name:ob.vertex_groups.new(name=b.name) for b in rig.data.bones}
 maxinf=0
 for v in ob.data.vertices:
  if name.startswith('Shoe'):
   # The boot shaft reaches almost to the knee: above the ankle it follows the shin, otherwise the bent shin leaves a rigid shaft.
   side=name[-1];shaft=float(anim.S(BOOT_SHAFT[0],BOOT_SHAFT[1],v.co.z));w={'foot.'+side:1-shaft,'shin.'+side:shaft}
  else:
   w={};nearest=kd.find_n(v.co,4);inv=[1/max(d,1e-5)**2 for _,_,d in nearest];total=sum(inv)
   for (_,vi,d),fac in zip(nearest,inv):
    for bone,value in weights[vi].items():
     if not bone.startswith(('thigh','shin','foot','toe')):w[bone]=w.get(bone,0)+value*fac/total
   if not w:w={'hips':1.}
   sw=sum(w.values());w={k:a/sw for k,a in w.items()}
   skirt_amount=1-float(anim.S(1.42,1.60,v.co.z))
   if skirt_amount>0:
    direction=Vector((v.co.x,v.co.y-.02));direction.normalize()
    amounts={'skirt.Front':max(0,-direction.y)**2,'skirt.Back':max(0,direction.y)**2,'skirt.L':max(0,direction.x)**2,'skirt.R':max(0,-direction.x)**2}
    w={k:a*(1-skirt_amount) for k,a in w.items()}
    for k,a in amounts.items():w[k]=a*skirt_amount
  w=dict(sorted(((k,a) for k,a in w.items() if a>1e-7),key=lambda kv:kv[1],reverse=True)[:4]);sw=sum(w.values());assert sw>0
  maxinf=max(maxinf,len(w))
  for bone,value in w.items():groups[bone].add([v.index],value/sw,'REPLACE')
 anim.attach(ob,rig);binding[name]={'vertices':len(ob.data.vertices),'maxInfluences':maxinf,'unweighted':0,'skin':f'foot below z {BOOT_SHAFT[0]}, shin above z {BOOT_SHAFT[1]}, smooth blend between' if name.startswith('Shoe') else 'body surface weights above waist; four dedicated skirt controls below waist','topology':mesh_report(ob)}
assembly=json.loads((P.parent/'assembled-base/assembly-report.json').read_text());landmarks=json.loads((P.parent/'landmarks.json').read_text())
anim.configure(assembly['gameNormalizeScale'],landmarks['landmarks'])
soles={s:base.mesh_coordinates(objects['Shoe.'+s].data) for s in ('L','R')}
def pose(r,clip,t,unused):
 contacts=anim.pose(r,clip,t,soles);bpy.context.view_layer.update();phase=t*math.tau
 hip=r.pose.bones['hips'].matrix@r.data.bones['hips'].matrix_local.inverted()
 wave=math.sin(phase);swing=math.sin(phase)**2
 a={'Front':-.10*swing,'Back':.045*swing,'L':.025*wave,'R':-.025*wave}
 if clip=='run':a={k:v*1.5 for k,v in a.items()}
 if clip=='idle':a={k:0 for k in a}
 if clip=='jump':
  c=anim.curve(t,[(0,0),(.15,1),(.35,.4),(.65,.5),(.78,1),(1,0)]);a={'Front':-.14*c,'Back':.05*c,'L':.025*c,'R':-.025*c}
 for part,angle in a.items():
  n='skirt.'+part;bone=r.data.bones[n];h=Vector(skirt[part][0]);axis='Y' if part in ('L','R') else 'X'
  desired=hip@Matrix.Translation(h)@anim.R(axis,angle)@Matrix.Translation(-h)@bone.matrix_local
  inherited=r.pose.bones['hips'].matrix@r.data.bones['hips'].matrix_local.inverted()@bone.matrix_local
  r.pose.bones[n].matrix_basis=inherited.inverted()@desired
 return contacts
for tr in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(tr)
rig.animation_data.action=None
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
base.frame_pose=pose;base.actions(rig,body)
assert before=={n:base.surface_hash(objects[n].data) for n in before},'Approved body/head/hair positions or UV changed'
# Validate actual shoe contact and all mesh loop endpoints over every baked frame.
validation={}
for clip,dur in anim.DURATIONS.items():
 minz=99;maxground=0;seam=0;first={}
 for frame in range(dur+1):
  base.activate(rig,clip,frame)
  if frame==0:first={n:anim.evaluated_points(o) for n,o in objects.items()}
  for side,offset in [('L',0),('R',.5)]:
   p=anim.evaluated_points(objects['Shoe.'+side]);z=float(p[:,2].min());minz=min(minz,z)
   if clip in ('walk','run') and (frame/dur+offset)%1<(.44 if clip=='run' else .60):maxground=max(maxground,abs(z))
  assert all(np.isfinite(anim.evaluated_points(objects[n])).all() for n in ('Outfit','Shoe.L','Shoe.R'))
 closure=max(float(np.linalg.norm(anim.evaluated_points(o)-first[n],axis=1).max()) for n,o in objects.items())
 assert minz>-.005 and maxground<.003 and closure<.0002,(clip,minz,maxground,closure)
 validation[clip]={'seconds':dur/30,'minimumShoeZ':minz,'maximumSupportGroundError':maxground,'loopEndpointMaximumVertexDifference':closure}
base.activate(rig,'idle',0);rig.animation_data.action=None
for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
bpy.context.scene.frame_set(0);bpy.ops.object.select_all(action='DESELECT')
for ob in [rig,*objects.values()]:ob.select_set(True)
bpy.context.view_layer.objects.active=rig
def export_file(name,meshes):
 bpy.ops.object.select_all(action='DESELECT')
 for o in [rig,*meshes]:o.select_set(True)
 bpy.context.view_layer.objects.active=rig
 bpy.ops.export_scene.gltf(filepath=str(P/name),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_nla_strips=True,export_skins=True,export_all_influences=False,export_image_format='AUTO',export_lights=False,export_cameras=False)
export_file('d1-outfit-animated.glb',list(objects.values()))
export_file('d1-outfit-shoes-only.glb',[objects[n] for n in ('Outfit','Shoe.L','Shoe.R')])
export_file('d1-body-coverage.glb',[body])

(P/'animation-report.json').write_text(json.dumps({'rigBones':len(rig.data.bones),'addedBones':list('skirt.'+n for n in skirt),'original22BoneRestUnchanged':True,'approvedHeadHairBodySurfaceUnchanged':True,'binding':binding,'clips':validation,'coverage':coverage['rules'],'status':'Animated outfit candidate; awaiting joint and dress-margin visual review'},indent=2))
# Compact action extrema with front/profile/back evidence.
base.activate(rig,'idle',0)
for o in list(bpy.data.objects):
 if o.type in ('CAMERA','LIGHT'):bpy.data.objects.remove(o,do_unlink=True)
center,span,cam=setup_scene(*bounds(list(objects.values())));scene=bpy.context.scene;scene.cycles.samples=10;scene.render.resolution_x=640;scene.render.resolution_y=800
(P/'preview').mkdir(exist_ok=True)
for clip,frames in [('idle',[0,48]),('walk',[0,9,18,27]),('run',[0,6,12]),('jump',[7,23,36])]:
 for frame in frames:
  base.activate(rig,clip,frame)
  for view,d in [('front',(0,-1,0)),('right',(1,0,0)),('back',(0,1,0))]:
   cam.location=center+Vector(d)*span*4;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.85;scene.render.filepath=str(P/'preview'/f'{clip}-{frame:02d}-{view}.png');bpy.ops.render.render(write_still=True)
base.activate(rig,'idle',0);bpy.context.scene.frame_end=96;bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(P/'candidate.blend'))
print('OUTFIT_ANIMATION_READY',json.dumps(validation),flush=True)
