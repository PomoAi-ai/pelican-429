import argparse,math,sys
from pathlib import Path
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--baseline',action='store_true');parser.add_argument('--draft',default='draft-01');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
source=HERE.parent/'temple-root-continuity-study-01/draft-01/Temple-Root-Continuity.blend' if args.baseline else HERE/args.draft/'Hair-Surface-Paint.blend'
out=HERE/'baseline' if args.baseline else HERE/args.draft
out.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene
scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100
scene.cycles.samples=48;scene.cycles.use_denoising=True
target=Vector((0,.015,2.64));scene.camera.data.type='ORTHO';scene.camera.data.ortho_scale=1.5
for name,angle in [('front',0),('side',80),('three-quarter',45)]:
    yaw=math.radians(angle);scene.camera.location=target+Vector((-math.sin(yaw),-math.cos(yaw),0))*4
    scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
print('HAIR_VIEWS_DONE',str(out),flush=True)
