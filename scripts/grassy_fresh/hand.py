"""Relaxed hand: palm, four curled fingers and a thumb unioned into one soft surface."""
import math

import numpy as np

import solid
from geo import add_mesh, spline, sphere, tube, unit, rs

WRIST_X, WRIST_Z = 0.543, 1.16


def polyline(points, n):
    pts = np.asarray(points, float)
    return spline(np.linspace(0, 1, len(pts)), pts, np.linspace(0, 1, n))


def dome(u, start=0.8):
    return np.sqrt(np.clip(1 - np.clip((u - start) / (1 - start), 0, 1) ** 2, 0.0004, 1))


def nail_spec(c, r, out, across_r, along_r):
    along = unit(c[-1] - c[max(-len(c), -6)])
    out = unit(out - (out @ along) * along)
    across = np.cross(along, out)
    centre = c[-4] + out * r[-4] * 0.8
    return centre, np.array([across, along, out]), (across_r, along_r, 0.0028)


def hand_parts(s, C, R):
    inner = -s
    pn = unit(np.array([inner * 0.92, 0.32, 0.0]))          # palm side: toward the thigh, slightly back
    wx = s * WRIST_X
    parts = []
    nails = []
    # wrist and palm
    t = np.linspace(0, 1, R)
    z = WRIST_Z + 0.02 - 0.205 * t
    w = 0.048 + 0.024 * np.sin(np.clip(t * 1.1, 0, 1) * math.pi * 0.62)
    th = 0.034 - 0.002 * t
    path = np.stack([wx + s * 0.003 * t, 0.003 - 0.012 * t, z], -1)
    parts.append((tube(path, w * dome(t, 0.9), th * dome(t, 0.9), C, hint=(0, -1, 0), n=2.5), (True, True)))
    # fingers: index nearest the thumb is `inner`
    spec = [(inner * 0.054, 0.108, 0.0165, 9), (inner * 0.018, 0.122, 0.0170, 7), (-inner * 0.018, 0.112, 0.0165, 8),
            (-inner * 0.054, 0.088, 0.0148, 11)]
    for k, (dx, length, rad, curl) in enumerate(spec):
        base = np.array([wx + dx, -0.003, 1.005])
        segs = np.array([0.46, 0.32, 0.22]) * length
        ang = np.radians([curl * 0.6, curl * 2.2, curl * 3.0])
        d = np.array([0, 0, -1.0])
        pts = [base - np.array([0, 0, 0.02])]
        p = base.copy()
        for ln, a in zip(segs, ang):
            p = p + d * ln
            pts.append(p.copy())
            d = unit(d * math.cos(a) + pn * math.sin(a))
        c = polyline(pts, R)
        u = np.linspace(0, 1, R)
        c[:, 0] += (dx * 0.14) * u
        r = rad * (1 - 0.2 * u) * dome(u, 0.82)
        parts.append((tube(c, r, r * 0.93, C, hint=(0, -1, 0)), (True, True)))
        nails.append(nail_spec(c, r, -pn, 0.0075, 0.0095))
    # thumb with a thenar bulge
    base = np.array([wx + inner * 0.040, -0.020, 1.095])
    pts = [base, base + np.array([inner * 0.020, -0.034, -0.030]), base + np.array([inner * 0.034, -0.058, -0.070]),
           base + np.array([inner * 0.036, -0.074, -0.112])]
    c = polyline(pts, R)
    u = np.linspace(0, 1, R)
    r = 0.027 * (1 - 0.30 * u) * dome(u, 0.8)
    parts.append((tube(c, r, r * 0.92, C, hint=(0, 0, 1)), (True, True)))
    nails.append(nail_spec(c, r, unit(-pn * 0.4 + np.array([0, -0.9, 0])), 0.0090, 0.0105))
    return parts, nails


def build_hands(M, col, Q):
    voxel = 0.0028 if Q > 0.7 else 0.004
    C, R = rs(40, Q), rs(30, Q)
    for s in (1, -1):
        parts, nails = hand_parts(s, C, R)
        obj = solid.union(f'hand_{s}', parts, col, voxel, smooth=8)
        if Q <= 0.7:
            solid.decimate(obj, 1800 if Q > 0.15 else 800)
        obj.data.materials.append(M['skin'])
        if Q >= 0.4:
            for k, (centre, basis, radii) in enumerate(nails):
                E = sphere((0, 0, 0), radii, 8, 14)
                P = E[..., 0:1] * basis[0] + E[..., 1:2] * basis[1] + E[..., 2:3] * basis[2] + centre
                add_mesh(f'nail_{s}_{k}', P, M['nail'], col)
