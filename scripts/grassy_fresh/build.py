"""Grassy, built from scratch: assemble parts, validate against the reference silhouettes, export."""
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True

import body
import jeans
import jeans_detail
import hair
import hand
import head
import mats
import shoes
import studio


def build(col, Q):
    M = mats.make_materials()
    Ph = head.build_head(M, col, Q)
    hair.build_scalp(M, col, Q, Ph)
    hair.build_hair(M, col, Q)
    body.build_torso(M, col, Q)
    body.build_sleeves(M, col, Q)
    hand.build_hands(M, col, Q)
    obj = jeans.build_jeans(M, col, Q)
    if Q >= 0.4:
        jeans_detail.build_details(M, col, Q, jeans.Surface(obj))
    shoes.build_shoes(M, col, Q, fine=Q >= 0.4)
    return M


if __name__ == '__main__':
    out = Path(sys.argv[sys.argv.index('--') + 1])
    q = float(sys.argv[sys.argv.index('--') + 2]) if len(sys.argv) > sys.argv.index('--') + 2 else 0.5
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.data.collections.new('Grassy')
    bpy.context.scene.collection.children.link(col)
    build(col, q)
    cam = studio.setup_scene(900, 24)
    studio.render(cam, out / 'f_front.png', ((0, -12, 1.55), (0, 0, 1.55), 3.4))
    studio.render(cam, out / 'f_34.png', ((-6, -8, 2.6), (0, 0, 1.45), 3.4))
    studio.render(cam, out / 'f_back.png', ((0, 12, 1.55), (0, 0, 1.55), 3.4))
    studio.render(cam, out / 'f_side.png', ((-12, 0, 1.55), (0, 0, 1.55), 3.4))
    studio.render(cam, out / 'f_headfront.png', ((0, -10, 2.6), (0, 0, 2.6), 1.6))
    studio.render(cam, out / 'f_head34.png', ((-5, -7, 3.0), (0, 0, 2.6), 1.6))
    for v in ('front', 'right', 'back'):
        print(v, 'IoU', round(studio.compare(cam, v, out / f'cmp_{v}.png'), 4))
