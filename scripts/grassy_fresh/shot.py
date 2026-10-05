"""Quick close-up renders: python build via Blender -P shot.py -- outdir Q name:locx,locy,locz:tgtx,tgty,tgtz:scale ..."""
import sys
from pathlib import Path
import bpy
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.dont_write_bytecode = True
import build, studio
a = sys.argv[sys.argv.index('--') + 1:]
out, q = Path(a[0]), float(a[1])
bpy.ops.wm.read_factory_settings(use_empty=True)
col = bpy.data.collections.new('Grassy'); bpy.context.scene.collection.children.link(col)
build.build(col, q)
cam = studio.setup_scene(900, 32)
for spec in a[2:]:
    name, loc, tgt, scale = spec.split(':')
    studio.render(cam, out / f'{name}.png', (tuple(map(float, loc.split(','))), tuple(map(float, tgt.split(','))), float(scale)))
