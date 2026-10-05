"""Load sculpted parts into Blender and render orthographic checks.

blender --background --factory-startup --python preview.py -- BUILD_DIR OUT_DIR [--views front,right] [--samples 32] [--focus head]
"""
import argparse
import math
import sys
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True

import dress  # noqa: E402
import scene  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('build')
    ap.add_argument('out')
    ap.add_argument('--views', default='front,right,hero')
    ap.add_argument('--samples', type=int, default=32)
    ap.add_argument('--focus', default='full')
    ap.add_argument('--blend', default='')
    ap.add_argument('--mesh-hair', action='store_true', help='skip strands for quick face checks')
    args = ap.parse_args(argv)
    scene.reset()
    dress.assemble(Path(args.build), strands_hair=not args.mesh_hair)
    scene.studio()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for view in args.views.split(','):
        scene.render(view, args.focus, out / f'{args.focus}-{view}.png', args.samples)
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=args.blend)


main()
