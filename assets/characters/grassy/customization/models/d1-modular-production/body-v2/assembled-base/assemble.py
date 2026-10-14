"""Assemble the approved head/hair with the headless Rodin body ce912294 at a short shared neck boundary."""
import sys, json, math
from array import array
from pathlib import Path
import bpy, bmesh
from mathutils import Vector

OUT=Path(__file__).resolve().parent
MODELS=OUT.parents[1]
ROOT=OUT.parents[7]
sys.path.insert(0,str(ROOT/'scripts/character_customization'))
from inspect_standalone_head import bounds, setup_scene, mesh_report

# Same head placement as ../../assembled-base: the head and hair keep their approved size and final position.
HEAD_SCALE=.34803386697909533
HEAD_TRANSLATION=Vector((.000269-.0003513544797897339*HEAD_SCALE,.0275-.08639738708734512*HEAD_SCALE,1.2330005356789293))
FINAL_SCALE=1.575201300203449
# The body references were cut at source y=267 of d1-bald-slim-legs-v1.png, 2.1166 tiles above the sole on the shared ruler.
BODY_TOP_TILES=2.1166
# The new neck is thinner than the head's own neck and widens into the shoulders below 1.31, so the joint sits higher than before.
BODY_CUT=1.315
HEAD_CUT=1.325
CHIN=1.336

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT.parent/'head-look/head-hair-look.glb'))
head=bpy.data.objects['Head']
hair=bpy.data.objects['Hair']
for obj in [head,hair]:
    world=obj.matrix_world.copy()
    for v in obj.data.vertices:
        v.co=(world@v.co)*HEAD_SCALE+HEAD_TRANSLATION
    obj.matrix_world.identity()
head_reference=[tuple(v.co) for v in head.data.vertices if v.co.z>1.34]

source=OUT.parent/'source/rodin-ce912294'
bpy.ops.wm.obj_import(filepath=str(source/'base.obj'))
body=bpy.context.selected_objects[0]
body.name='Body'
body.data.transform(body.matrix_world)
body.matrix_world.identity()
body_height=max(v.co.z for v in body.data.vertices)
body_scale=BODY_TOP_TILES/FINAL_SCALE/body_height
for v in body.data.vertices: v.co*=body_scale

material=bpy.data.materials.new('Body')
material.use_nodes=True
nodes=material.node_tree.nodes; links=material.node_tree.links
shader=nodes.get('Principled BSDF')
def texture(name,color):
    node=nodes.new('ShaderNodeTexImage')
    node.image=bpy.data.images.load(str(name))
    if not color: node.image.colorspace_settings.name='Non-Color'
    return node
links.new(texture(OUT/'texture_diffuse_skin.png',True).outputs['Color'],shader.inputs['Base Color'])
links.new(texture(source/'texture_roughness.png',False).outputs['Color'],shader.inputs['Roughness'])
links.new(texture(source/'texture_metallic.png',False).outputs['Color'],shader.inputs['Metallic'])
body.data.materials.clear(); body.data.materials.append(material)

def cut(obj,z,above):
    bm=bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,0,z),plane_no=(0,0,1),clear_outer=above,clear_inner=not above)
    ring=list({v for e in bm.edges if e.is_boundary and all(abs(v.co.z-z)<1e-5 for v in e.verts) for v in e.verts})
    assert len(ring)>10, (obj.name,len(ring))
    center=sum((v.co for v in ring),Vector())/len(ring)
    ring.sort(key=lambda v: math.atan2(v.co.y-center.y,v.co.x-center.x))
    return bm,ring,center

hbm,hring,hcenter=cut(head,HEAD_CUT,False)
source_bm,source_ring,source_center=cut(body,HEAD_CUT,True)
source_uv_layer=source_bm.loops.layers.uv.active
source_uv=[v.link_loops[0][source_uv_layer].uv.copy() for v in source_ring]
source_angles=[math.atan2(v.co.y-source_center.y,v.co.x-source_center.x) for v in source_ring]
bbm,bring,bcenter=cut(body,BODY_CUT,True)
neck_sx=(max(v.co.x for v in bring)-min(v.co.x for v in bring))/(max(v.co.x for v in hring)-min(v.co.x for v in hring))
neck_sy=(max(v.co.y for v in bring)-min(v.co.y for v in bring))/(max(v.co.y for v in hring)-min(v.co.y for v in hring))
# Only the head neck below the chin tapers to the body neck; the face above CHIN keeps its coordinates.
for v in hbm.verts:
    if v.co.z<CHIN:
        t=min(1,max(0,(CHIN-v.co.z)/(CHIN-HEAD_CUT))); weight=t*t*(3-2*t)
        target=Vector((bcenter.x+(v.co.x-hcenter.x)*neck_sx,bcenter.y+(v.co.y-hcenter.y)*neck_sy,v.co.z))
        v.co=v.co.lerp(target,weight)
hcenter=sum((v.co for v in hring),Vector())/len(hring)
uv=bbm.loops.layers.uv.active
lower_uv=[v.link_loops[0][uv].uv.copy() for v in bring]
upper=[bbm.verts.new(v.co) for v in hring]

def angles(ring,center):
    return [math.atan2(v.co.y-center.y,v.co.x-center.x) for v in ring]

ba=angles(bring,bcenter); ha=angles(upper,hcenter)
def uv_at(angle):
    a=angle
    while a<source_angles[0]: a+=2*math.pi
    for i in range(len(source_angles)):
        lo=source_angles[i]; hi=source_angles[i+1] if i+1<len(source_angles) else source_angles[0]+2*math.pi
        if lo<=a<=hi:
            return source_uv[i].lerp(source_uv[(i+1)%len(source_angles)],(a-lo)/(hi-lo))
    raise ValueError(angle)

uvs={v:u for v,u in zip(bring,lower_uv)}
uvs.update({v:uv_at(a) for v,a in zip(upper,ha)})
# A new neck strip cannot interpolate UVs across the source atlas chart seams.
# Sample its end colors from the two unchanged source maps, then interpolate colors.
def sampler(mat):
    principled=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    image=principled.inputs['Base Color'].links[0].from_node.image
    pixels=array('f',[0])*(len(image.pixels))
    image.pixels.foreach_get(pixels)
    w,h=image.size
    def sample(uv_value):
        x=max(0,min(w-1,int(uv_value.x*w))); y=max(0,min(h-1,int(uv_value.y*h)))
        rgb=pixels[(y*w+x)*4:(y*w+x)*4+3]
        return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)+(1,)
    return sample
body_sample=sampler(material)
head_sample=sampler(head.data.materials[0])
head_uv_layer=hbm.loops.layers.uv.active
colors={v:body_sample(uv_value) for v,uv_value in zip(bring,lower_uv)}
colors.update({v:head_sample(hv.link_loops[0][head_uv_layer].uv) for v,hv in zip(upper,hring)})
color_layer=bbm.loops.layers.float_color.new('NeckSourceColor')
for face in bbm.faces:
    for loop in face.loops: loop[color_layer]=(1,1,1,1)
seam_material=bpy.data.materials.new('Neck source-color transition')
seam_material.use_nodes=True
seam_shader=seam_material.node_tree.nodes.get('Principled BSDF')
color_node=seam_material.node_tree.nodes.new('ShaderNodeVertexColor')
color_node.layer_name='NeckSourceColor'
seam_material.node_tree.links.new(color_node.outputs['Color'],seam_shader.inputs['Base Color'])
seam_shader.inputs['Roughness'].default_value=.75
body.data.materials.append(seam_material)
seam_material_index=len(body.data.materials)-1
# Zipper triangulation links two unequal closed rings with exact shared top positions.
i=j=0
n,m=len(bring),len(upper)
while i<n or j<m:
    next_b=(ba[(i+1)%n]+(2*math.pi if i+1>=n else 0)) if i<n else math.inf
    next_h=(ha[(j+1)%m]+(2*math.pi if j+1>=m else 0)) if j<m else math.inf
    if next_b<next_h:
        verts=(bring[i%n],bring[(i+1)%n],upper[j%m]); i+=1
    else:
        verts=(bring[i%n],upper[(j+1)%m],upper[j%m]); j+=1
    face=bbm.faces.new(verts); face.material_index=seam_material_index; face.smooth=True
    for loop in face.loops:
        loop[uv].uv=uvs[loop.vert]
        loop[color_layer]=colors[loop.vert]
for face in bbm.faces: face.smooth=True
bmesh.ops.recalc_face_normals(bbm,faces=list(bbm.faces))
bbm.verts.index_update();hbm.verts.index_update()
boundary_pairs=[(bv.index,hv.index) for bv,hv in zip(upper,hring)]
bbm.to_mesh(body.data); hbm.to_mesh(head.data)
bbm.free();hbm.free();source_bm.free()
body.data.update();head.data.update()
# Identical positions and averaged boundary normals remove the split-object shading ring.
body_normals=[n.vector.copy() for n in body.data.corner_normals]
head_normals=[n.vector.copy() for n in head.data.corner_normals]
shared_body={};shared_head={}
for bi,hi in boundary_pairs:
    assert (body.data.vertices[bi].co-head.data.vertices[hi].co).length<1e-7
    normal=(body.data.vertices[bi].normal+head.data.vertices[hi].normal).normalized()
    shared_body[bi]=normal;shared_head[hi]=normal
for loop in body.data.loops:
    if loop.vertex_index in shared_body: body_normals[loop.index]=shared_body[loop.vertex_index]
for loop in head.data.loops:
    if head.data.vertices[loop.vertex_index].co.z<CHIN+.002: head_normals[loop.index]=head.data.vertices[loop.vertex_index].normal.copy()
    if loop.vertex_index in shared_head: head_normals[loop.index]=shared_head[loop.vertex_index]
body.data.normals_split_custom_set(body_normals)
head.data.normals_split_custom_set(head_normals)
assert set(head_reference)=={tuple(v.co) for v in head.data.vertices if v.co.z>1.34}, 'Face shape changed'
bpy.context.view_layer.update()
lo,hi=bounds([head,hair,body]); normalize=3.1/(hi.z-lo.z)
for obj in [head,hair,body]:
    for v in obj.data.vertices: v.co=(v.co-Vector((0,0,lo.z)))*normalize
bpy.context.view_layer.update()
lo,hi=bounds([head,hair,body])
assert abs(hi.z-lo.z-3.1)<1e-5
center,span,camera=setup_scene(lo,hi)
camera.data.ortho_scale=3.55
bpy.context.scene.render.resolution_x=768
bpy.context.scene.render.resolution_y=1024
for name,direction in {'front':(0,-1,0),'right':(-1,0,0),'back':(0,1,0),'three-quarter':(-1,-1,0)}.items():
    camera.location=center+Vector(direction).normalized()*span*4
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.render.filepath=str(OUT/f'{name}.png')
    bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in [head,hair,body]:obj.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.export_scene.gltf(filepath=str(OUT/'d1-base-static.glb'),export_format='GLB',use_selection=True)
bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'candidate.blend'))
report={'coordinates':'Blender Z-up; front -Y; glTF export Y-up','headUniformScale':HEAD_SCALE,'headTranslation':list(HEAD_TRANSLATION),'bodySource':'ce912294 base.obj','bodyUniformScale':body_scale,'gameNormalizeScale':normalize,'sourceFloorZ':lo.z,'totalHeightIncludingHair':3.1,'neck':{'bodyCutZ':BODY_CUT,'headCutZ':HEAD_CUT,'neckPlaneZ':HEAD_CUT*normalize,'bodyNeckLoopCount':n,'headLoopCount':m,'collarTriangles':n+m},'headFaceUnchanged':'asserted before global normalization','objects':[mesh_report(o) for o in [head,hair,body]]}
(OUT/'assembly-report.json').write_text(json.dumps(report,indent=2)+'\n')
