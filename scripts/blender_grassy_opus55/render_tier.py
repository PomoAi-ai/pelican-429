"""Render an exported tier's .blend with the shared studio.

blender --background FILE.blend --python render_tier.py -- OUT_PREFIX [--views hero,front] [--samples 32]
"""
import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True

import bpy  # noqa: E402
import scene  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--views', default='hero,front,right,back,left')
ap.add_argument('--samples', type=int, default=32)
ap.add_argument('--focus', default='full')
args = ap.parse_args(argv)
s = bpy.context.scene
s.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = True
s.cycles.device = 'GPU'
s.cycles.use_denoising = True
s.view_settings.view_transform = 'Standard'
s.view_settings.look = 'Medium High Contrast'
s.render.film_transparent = True
for ob in [o for o in s.objects if o.type in ('LIGHT', 'CAMERA')]:
    bpy.data.objects.remove(ob)
scene.studio()
for view in args.views.split(','):
    scene.render(view, args.focus, Path(f'{args.out}-{view}.png'), args.samples)
