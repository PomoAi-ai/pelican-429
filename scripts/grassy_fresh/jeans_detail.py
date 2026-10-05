"""Denim details projected onto the jeans surface by ray casting: stitching, pockets, hardware."""
import math

import numpy as np

import jeans
from geo import add_mesh, sphere, spline, thread, tube

FRONT, BACK = (0, 1, 0), (0, -1, 0)   # rays travel +Y when shooting at the front, -Y at the back


def curve(points, n=40):
    pts = np.asarray(points, float)
    return spline(np.linspace(0, 1, len(pts)), pts, np.linspace(0, 1, n))


def on_front(S, pts, off=0.002):
    return S.line([(x, -2.0, z) for x, z in pts], FRONT, off)


def on_back(S, pts, off=0.002):
    return S.line([(x, 2.0, z) for x, z in pts], BACK, off)


def build_details(M, col, Q, S):
    W = dict(radius=0.0034)
    mir = lambda p, s: p * np.array([s, 1, 1])
    for sx in (1, -1):
        def stitch(name, path, **kw):
            thread(f'{name}_{sx}', mir(path, sx), M['thread'], col, **{**W, **kw})
        for k, d in enumerate((0.0, 0.013)):
            stitch(f'fpocket{k}', on_front(S, curve([(0.235 - d, 1.215), (0.222 - d, 1.17), (0.185 - d, 1.11),
                                                    (0.14 - d, 1.075), (0.115 - d * 0.5, 1.035)])))
        stitch('coin', on_front(S, curve([(0.215, 1.188), (0.16, 1.188), (0.16, 1.152), (0.21, 1.15)])))
        for k, dd in enumerate((0.0, 0.013)):
            xs, xe = 0.105 + dd * 0.4, 0.315 - dd * 0.4
            xm = (xs + xe) / 2
            pts = [(xs, 1.205 - dd), (xs, 1.065 + dd * 0.4), (xm, 0.985 + dd), (xe, 1.065 + dd * 0.4), (xe, 1.205 - dd), (xs, 1.205 - dd)]
            dense = [((a[0] * (1 - t) + b[0] * t), (a[1] * (1 - t) + b[1] * t)) for a, b in zip(pts[:-1], pts[1:])
                     for t in np.linspace(0, 1, 14, endpoint=False)] + [pts[-1]]
            stitch(f'bpocket{k}', on_back(S, dense))
        for x in (0.085, 0.255):
            for half, fn in (('front', on_front), ('back', on_back)):
                path = fn(S, [(x, z) for z in np.linspace(1.17, 1.265, 8)], 0.004)
                add_mesh(f'beltloop_{half}_{x}_{sx}', tube(mir(path, sx), 0.0135, 0.0045, 10, hint=(0, -1, 0)), M['jeans'], col,
                         caps=(True, True))
        for fn, pts in ((on_front, [(0.235, 1.205), (0.115, 1.04)]), (on_back, [(0.105, 1.2), (0.315, 1.2)])):
            for x, z in pts:
                p = fn(S, [(x, z)], 0.0)[0]
                add_mesh(f'rivet_{x}_{z}_{sx}', sphere(mir(p, sx), (0.0075,) * 3, 8, 12), M['rivet'], col)
        # leg seams and cuff stitching
        for name, origin_x, direction in (('outer', 2.0, (-1, 0, 0)), ('inner', 0.0, (1, 0, 0))):
            for k, dy in enumerate((-0.011, 0.011)):
                pts = []
                for z in np.linspace(0.99, 0.49, 120):
                    cx, cy = jeans.leg_center(z)
                    o = (origin_x if name == 'outer' else 0.0, cy + dy, z)
                    h = S.cast(o, direction)
                    if h is not None and (name == 'outer' or h[0][0] > 0):
                        pts.append(h[0] + h[1] * 0.002)
                stitch(f'seam_{name}{k}', np.array(pts))
        for k, zr in enumerate((0.452, 0.482, 0.318)):
            stitch(f'cuff{k}', S.ring(zr, 220, 0.002))
    p = S.cast((0, -2, 1.215), FRONT)
    add_mesh('button', sphere(p[0] + p[1] * 0.006, (0.020, 0.008, 0.020), 12, 20), M['rivet'], col)
    thread('fly', on_front(S, curve([(0.0, 1.20), (0.0, 1.10), (0.012, 1.045), (0.04, 1.0)]), 0.0022), M['thread'], col, **W)
    for k, zr in enumerate((1.205, 1.235)):
        ring = []
        for a in np.linspace(0, 2 * math.pi, 240, endpoint=False):
            o = np.array([1.0 * math.sin(a), 0.022 - 1.0 * math.cos(a), zr])
            d = np.array([0, 0.022, zr]) - o
            h = S.cast(o, d / np.linalg.norm(d))
            if h:
                ring.append(h[0] + h[1] * 0.002)
        ring = np.array(ring)
        thread(f'waist{k}', np.concatenate([ring, ring[:1]]), M['thread'], col, **W)
