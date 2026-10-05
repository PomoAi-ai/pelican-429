import sys
from pathlib import Path
import bpy
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.dont_write_bytecode = True
import mats, head, body, studio
OUT = Path(sys.argv[sys.argv.index('--') + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)
col = bpy.data.collections.new('Body'); bpy.context.scene.collection.children.link(col)
M = mats.make_materials()
Q = 0.5
head.build_head(M, col, Q)
body.build_torso(M, col, Q); body.build_sleeves(M, col, Q); body.build_hands(M, col, Q); body.build_jeans(M, col, Q); import shoes; shoes.build_shoes(M, col, Q)
cam = studio.setup_scene(900, 24)
studio.render(cam, OUT / 'b_front.png', ((0, -12, 1.55), (0, 0, 1.55), 3.4))
studio.render(cam, OUT / 'b_34.png', ((-6, -8, 2.6), (0, 0, 1.45), 3.4))
for v in ('front', 'right'):
    print(v, 'IoU', studio.compare(cam, v, OUT / f'cmp_{v}.png'))
