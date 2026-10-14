"""Fit the Rodin V3 dress onto the approved static body; reuse the already fitted boots."""
import bpy,bmesh,json,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
P=Path(__file__).resolve().parent;ROOT=P.parents[7];sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'scripts/character_customization'))
from inspect_standalone_head import bounds,mesh_report,setup_scene
SRC=P.parents[1]/'outfit-v3/source/rodin-ff5c55f8'
# Source landmarks (Z-up after OBJ import): waist seam z1.08, shoulder z1.63, collar top z1.89, hem z0.
SCALE=.654;WAIST_SRC=1.08;WAIST=1.57;Y_SHIFT=.027;MARGIN=.010
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(P.parent/'animated-base/candidate.blend'),link=False) as (src,dst):dst.objects=['Body','Head','Hair']
with bpy.data.libraries.load(str(P.parents[1]/'outfit-shoes/static-fit.blend'),link=False) as (src,shoes):shoes.objects=['Shoe.L','Shoe.R']
base=[]
for ob in dst.objects+shoes.objects:
 bpy.context.scene.collection.objects.link(ob);ob.parent=None
 for m in list(ob.modifiers):
  if m.type!='SOLIDIFY':ob.modifiers.remove(m)
 if ob.name in ('Body','Head','Hair'):base.append(ob)
body=next(o for o in base if o.name=='Body')
arm_ids={g.index for g in body.vertex_groups if g.name.startswith(('clavicle','upper_arm','forearm','hand'))}
arm_weight=[sum(g.weight for g in v.groups if g.group in arm_ids) for v in body.data.vertices]
for ob in base:ob.vertex_groups.clear()
bpy.ops.wm.obj_import(filepath=str(SRC/'base.obj'))
outfit=next(o for o in bpy.context.selected_objects if o.type=='MESH');outfit.name=outfit.data.name='Outfit'
outfit.data.transform(outfit.matrix_world);outfit.matrix_world.identity()
# Rodin leaves a few loose single faces and tiny chips beside the cuffs and back panel.
bm=bmesh.new();bm.from_mesh(outfit.data);left=set(bm.faces);debris=[]
while left:
 stack=[left.pop()];comp=[]
 while stack:
  f=stack.pop();comp.append(f)
  for e in f.edges:stack+=[g for g in e.link_faces if g in left and not left.remove(g)]
 if len(comp)<100:debris+=comp
bmesh.ops.delete(bm,geom=debris,context='FACES');bm.to_mesh(outfit.data);bm.free()
for v in outfit.data.vertices:
 v.co=Vector((v.co.x*SCALE,v.co.y*SCALE+Y_SHIFT,(v.co.z-WAIST_SRC)*SCALE+WAIST))
mat=bpy.data.materials.new('D1 V3 dress');mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes['Principled BSDF']
color=nodes.new('ShaderNodeTexImage');color.image=bpy.data.images.load(str(SRC/'texture_diffuse.png'))
# Rodin packs glTF ORM: G roughness, B metallic; the exporter reuses this image directly.
orm=nodes.new('ShaderNodeTexImage');orm.image=bpy.data.images.load(str(SRC/'texture_pbr.png'));orm.image.colorspace_settings.name='Non-Color'
split=nodes.new('ShaderNodeSeparateColor')
links.new(color.outputs['Color'],bsdf.inputs['Base Color']);links.new(orm.outputs['Color'],split.inputs['Color'])
links.new(split.outputs['Green'],bsdf.inputs['Roughness']);links.new(split.outputs['Blue'],bsdf.inputs['Metallic'])
outfit.data.materials.clear();outfit.data.materials.append(mat);outfit['characterPart']='outfit'
# Push cloth off the body along the body normal; dilate then blur so the shell's inner and outer layers move together.
bverts=[v.co.copy() for v in body.data.vertices];bvh=BVHTree.FromPolygons(bverts,[f.vertices[:] for f in body.data.polygons])
verts=outfit.data.vertices;push=[]
for v in verts:
 loc,normal,_,_=bvh.find_nearest(v.co);depth=MARGIN-(v.co-loc).dot(normal)
 push.append(normal*depth if depth>0 else Vector())
kd=KDTree(len(verts))
for v in verts:kd.insert(v.co,v.index)
kd.balance()
dilated=[max((push[i] for _,i,_ in kd.find_range(v.co,.05)),key=lambda d:d.length) for v in verts]
smooth=[]
for v in verts:
 near=kd.find_range(v.co,.05);w=[1-d/.05 for _,_,d in near]
 smooth.append(sum((dilated[i]*a for (_,i,_),a in zip(near,w)),Vector())/sum(w))
moved=[max(d.length,s.length) for d,s in zip(push,smooth)]
for v,d,s in zip(verts,push,smooth):v.co+=s if s.length>=d.length else d
# Hide body faces under the dress: the outward normal meets the dress, or the face pokes through the sparse
# outer shell (bust). Legs stay visible below the hips. Arms are hidden only where they poke through: skin inside
# a sleeve stays visible so a lifted sleeve hem never reveals the lining, and forearms beside the wide skirt stay intact.
ovb=BVHTree.FromPolygons([v.co for v in verts],[f.vertices[:] for f in outfit.data.polygons])
mask=bpy.data.materials.new('Covered base surface - preview mask');mask.use_nodes=True;mask.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value=0;mask.surface_render_method='DITHERED'
body.data.materials.append(mask);mi=len(body.data.materials)-1;covered=[]
for f in body.data.polygons:
 c=f.center;arm=sum(arm_weight[i] for i in f.vertices)/len(f.vertices)
 back=ovb.ray_cast(c+f.normal*1e-3,-f.normal,.04)
 if c.z<.25 or (c.z>1.16 and ((arm<.5 and ovb.ray_cast(c+f.normal*1e-3,f.normal,.12)[0] is not None) or (back[0] is not None and back[1].dot(f.normal)>0))):
  covered.append(f.index);f.material_index=mi
(P/'coverage-faces.json').write_text(json.dumps({'bodySource':'../animated-base/candidate.blend','faceIndices':covered,'purpose':'Preview-only material visibility; original Body positions and UV remain intact','rules':'Hide foot under boot below Z .25; above Z1.16, torso faces whose outward normal meets the V3 dress within .12, and any face that pokes through its outer shell'},indent=2)+'\n')
bpy.context.view_layer.update()
for ob in [outfit,*base]:
 for p in ob.data.polygons:p.use_smooth=True
(P/'fit-report.json').write_text(json.dumps({'source':'Rodin ff5c55f8 v2, 2K PBR OBJ','scale':SCALE,'waistSeamZ':WAIST,'yShift':Y_SHIFT,'bodyMargin':MARGIN,'removedDebrisFaces':len(debris),'pushedVertices':sum(m>0 for m in moved),'maximumPush':max(moved),'coveredBodyFaces':len(covered),'bodyUnchanged':True,'parts':[mesh_report(o) for o in (outfit,*shoes.objects)]},indent=2)+'\n')
c,span,cam=setup_scene(*bounds(base));scene=bpy.context.scene;scene.cycles.samples=12;scene.render.resolution_x=800;scene.render.resolution_y=1000;cam.data.ortho_scale=3.6
(P/'fit-preview').mkdir(exist_ok=True)
for name,d in [('front',(0,-1,0)),('right',(1,0,0)),('back',(0,1,0)),('three-quarter',(1,-1,0)),('below',(.3,-1,-1.2))]:
 cam.location=c+Vector(d).normalized()*span*4;cam.rotation_euler=(c-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(P/'fit-preview'/(name+'.png'));bpy.ops.render.render(write_still=True)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(P/'static-fit.blend'))
