"""Attach the merged original equipment to the finished D1 clothing rig."""
import sys,json,hashlib
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[7]
sys.path.insert(0,str(ROOT/'scripts/blender_grassy_rodin'))
from equipment import attach
import animate as animation
sys.path.insert(0,str(ROOT/'scripts/character_customization'))
from inspect_standalone_head import bounds,setup_scene
SOURCE=OUT.parent/'outfit-v3/outfit-game.blend'
assert SOURCE.is_file(),str(SOURCE)
source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
assert len(rig.data.bones)==26
assert {a.name for a in bpy.data.actions}>={'idle','walk','run','jump'}
rig.animation_data.action=None;rig.data.pose_position='REST';bpy.context.scene.frame_set(0)
def geometry_hash(obj):
    return hashlib.sha256(repr([tuple(v.co) for v in obj.data.vertices]).encode()).hexdigest()
character=[o for o in bpy.context.scene.objects if o.type=='MESH']
original_hashes={o.name:geometry_hash(o) for o in character}
for obj in list(bpy.context.scene.objects):
    if obj.type in {'LIGHT','CAMERA'}:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(OUT.parents[1]/'equipment/equipment-game.glb'))
roots=[bpy.data.objects[n] for n in ['FlightHarness','FlightCuff_L','FlightCuff_R']]
mounts=[]
for root,bone in zip(roots,['chest','forearm.L','forearm.R']):
    world=root.matrix_world.copy()
    if root.name=='FlightHarness':
        center=Vector((0,0,1.75))
        world=Matrix.Translation((0,-.015,.025))@Matrix.Translation(center)@Matrix.Scale(1.12,4)@Matrix.Translation(-center)@world
    attach(root,rig,bone,world)
    mounts.append({'root':root.name,'bone':bone,'restWorldMatrix':[list(r) for r in world]})
bpy.context.view_layer.update()
gear=[o for root in roots for o in root.children_recursive if o.type=='MESH']
assert len(gear)==18
assert all(not o.vertex_groups and not any(m.type=='ARMATURE' for m in o.modifiers) for o in gear)
center,span,camera=setup_scene(*bounds(character+gear))
scene=bpy.context.scene;scene.render.resolution_x=768;scene.render.resolution_y=1024
camera.data.ortho_scale=3.8
preview=OUT/'equipped-preview';preview.mkdir(exist_ok=True)
def render(name,direction):
    camera.location=center+Vector(direction).normalized()*span*4
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(preview/f'{name}.png');bpy.ops.render.render(write_still=True)
for name,direction in {'front':(0,-1,0),'right':(-1,0,0),'back':(0,1,0),'three-quarter':(-1,-1,0)}.items():render('rest-'+name,direction)
rig.data.pose_position='POSE';motion={}
for clip,duration in [('idle',96),('walk',36),('run',24),('jump',48)]:
    reference={};max_error=0
    for frame in range(duration+1):
        animation.activate(rig,clip,frame);bpy.context.view_layer.update()
        for mount in mounts:
            root=bpy.data.objects[mount['root']];bone=rig.pose.bones[mount['bone']]
            relative=(rig.matrix_world@bone.matrix).inverted()@root.matrix_world
            if frame==0:reference[root.name]=relative
            max_error=max(max_error,max(abs(relative[i][j]-reference[root.name][i][j]) for i in range(4) for j in range(4)))
    assert max_error<1e-5,(clip,max_error)
    motion[clip]={'frames':duration+1,'maximumBoneRelativeMatrixError':max_error}
    for frame in [duration//4,duration//2,3*duration//4]:
        animation.activate(rig,clip,frame)
        for name,direction in [('front',(0,-1,0)),('right',(-1,0,0)),('back',(0,1,0))]:render(f'{clip}-{frame:02d}-{name}',direction)
animation.activate(rig,'idle',0);rig.animation_data.action=None
for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
scene.frame_set(0)
assert {o.name:geometry_hash(o) for o in character}==original_hashes
bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'equipped-game.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.type not in {'LIGHT','CAMERA'}:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT/'d1-equipped-game.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_nla_strips=True,export_skins=True,export_all_influences=False,export_image_format='AUTO',export_lights=False,export_cameras=False)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
report={'source':str(SOURCE.relative_to(ROOT)),'sourceSHA256':source_hash,'equipmentSource':'equipment-game.glb','characterGeometryUnchanged':True,'rigBoneCount':len(rig.data.bones),'equipmentMeshCount':18,'mounts':mounts,'motionValidation':motion,'preview':'equipped-preview/','limitations':['No cloth collision simulation; visual inspection covers fixed views and selected action frames.']}
(OUT/'equipped-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
