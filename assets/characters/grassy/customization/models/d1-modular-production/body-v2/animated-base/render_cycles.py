"""Small loop frames from the verified saved rig; no rebinding or export."""
import sys
from pathlib import Path
import bpy
from mathutils import Vector
P=Path(__file__).resolve().parent;ROOT=P.parents[7];sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'scripts/blender_grassy_rodin'))
import animate as base
bpy.ops.wm.open_mainfile(filepath=str(P/'candidate.blend'))
rig=bpy.data.objects['D1ModularBaseRig'];scene=bpy.context.scene;cam=scene.camera
center=Vector((0,0,1.65));cam.location=center+Vector((1,-1,0)).normalized()*12;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.85
scene.render.resolution_x=400;scene.render.resolution_y=500;scene.cycles.samples=8
for clip,duration in {'idle':96,'walk':36,'run':24,'jump':48}.items():
 for frame in range(0,duration,3):
  base.activate(rig,clip,frame);scene.render.filepath=str(P/'preview'/f'{clip}-cycle-{frame:02d}.png');bpy.ops.render.render(write_still=True)
