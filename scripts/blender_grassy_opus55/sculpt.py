"""Polygonize the sculpted SDF parts into .npz meshes for the Blender build.

uv run --with numpy --with scikit-image --with scipy python3 scripts/blender_grassy_opus55/sculpt.py OUT_DIR [--voxel 0.004] [--parts head,brows]
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdf import polygonize
import hair
import sculpt_body
import sculpt_head

PARTS = {
    'head': (sculpt_head.head_field, sculpt_head.HEAD_BOX, 1.0),
    'brows': (sculpt_head.brow_field, sculpt_head.BROW_BOX, 0.5),
    'lashes': (sculpt_head.lash_field, sculpt_head.LASH_BOX, 0.4),
    'hair_cap': (hair.cap_field, hair.CAP_BOX, 1.5),
    'sweater': (sculpt_body.sweater_field, sculpt_body.SWEATER_BOX, 1.0),
    'hands': (sculpt_body.hands_field, sculpt_body.HANDS_BOX, 0.6),
    'jeans': (sculpt_body.jeans_field, sculpt_body.JEANS_BOX, 1.0),
    'shoes': (sculpt_body.shoes_field, sculpt_body.SHOES_BOX, 0.8),
    'ankles': (sculpt_body.ankles_field, sculpt_body.ANKLES_BOX, 1.5),
}
SWEPT = {'hair': hair.build_sdf}


def save_locks(out):
    """Lock guides (path, normal, width, thickness) for the strand groom in Blender."""
    records = hair.locks()
    np.savez_compressed(out / 'locks.npz',
                        paths=np.concatenate([r[0] for r in records]).astype(np.float32),
                        normals=np.concatenate([r[1] for r in records]).astype(np.float32),
                        counts=np.array([len(r[0]) for r in records], np.int32),
                        widths=np.array([r[2] for r in records], np.float32),
                        thicks=np.array([r[3] for r in records], np.float32))
    print(f'locks: {len(records)}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--voxel', type=float, default=0.004)
    ap.add_argument('--parts', default=','.join([*PARTS, *SWEPT, 'locks', 'hair_cap']))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name in args.parts.split(','):
        t = time.time()
        if name == 'locks':
            save_locks(out)
            continue
        if name in SWEPT:
            verts, faces, col = SWEPT[name](args.voxel)
            np.savez_compressed(out / f'{name}.npz', verts=verts, faces=faces, col=col)
        else:
            field, (lo, hi), scale = PARTS[name]
            verts, faces = polygonize(field, lo, hi, args.voxel * scale)
            np.savez_compressed(out / f'{name}.npz', verts=verts, faces=faces)
        print(f'{name}: {len(verts)} verts {len(faces)} tris {time.time() - t:.1f}s')
    (out / 'landmarks.json').write_text(json.dumps(sculpt_head.landmarks(), indent=1))


if __name__ == '__main__':
    main()
