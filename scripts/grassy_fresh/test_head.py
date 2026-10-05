import sys
from pathlib import Path
import bpy
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.dont_write_bytecode = True
import mats, head, studio
OUT = Path(sys.argv[sys.argv.index('--') + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)
col = bpy.data.collections.new('Body'); bpy.context.scene.collection.children.link(col)
M = mats.make_materials()
head.build_head(M, col, 0.6)
cam = studio.setup_scene(700, 24)
studio.render(cam, OUT / 'h_front.png', ((0, -10, 2.45), (0, 0, 2.45), 1.5))
studio.render(cam, OUT / 'h_side.png', ((-10, 0, 2.45), (0, 0, 2.45), 1.5))
studio.render(cam, OUT / 'h_34.png', ((-5, -7, 3.1), (0, 0, 2.45), 1.5))
