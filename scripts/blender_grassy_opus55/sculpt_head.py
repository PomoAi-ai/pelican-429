"""Grassy's head: one continuous skin surface with face, jaw, neck and ears.

Landmarks come from turnaround-master-v2 (sole 0, highest hair tip 3.10):
chin 2.10, eye centers 2.39 spaced 0.33, nose tip y -0.41, ears 2.21-2.44.
Facial features are placed on the measured skin surface so they sit flush.
"""
from functools import lru_cache

import numpy as np

from sdf import ellipsoid, round_cone, smin, smax, rotate, surface_y, resample

EYE_X, EYE_Z = 0.152, 2.385
EYE_OPEN = (0.094, 0.086, 0.070)  # half width, upper and lower reach of the eye opening
EYE_RADII = (0.103, 0.062, 0.099)
EYE_YAW, EYE_PITCH = 20.0, -3.0
EYE_SINK = 0.054                  # eyeball centre behind the unsculpted face surface
MOUTH_Z, MOUTH_HALF, MOUTH_LIFT = 2.208, 0.068, 3.4


def _ear(p, side):
    c = (side * 0.392, 0.055, 2.335)
    q = rotate(p, c, 'z', side * 42)
    q = rotate(q, c, 'x', -12)
    outer = ellipsoid(q, c, (0.048, 0.088, 0.128))
    rim_hollow = ellipsoid(q, (c[0] + side * 0.034, 0.05, 2.345), (0.032, 0.062, 0.098))
    bowl = ellipsoid(q, (c[0] + side * 0.03, 0.04, 2.305), (0.03, 0.036, 0.045))
    ear = smax(outer, -rim_hollow, 0.02)
    ear = smax(ear, -bowl, 0.012)
    ear = smin(ear, ellipsoid(q, (c[0] + side * 0.02, -0.012, 2.30), (0.018, 0.02, 0.028)), 0.012)
    return ear


def skull(p):
    cranium = ellipsoid(p, (0, 0.05, 2.50), (0.395, 0.42, 0.395))
    back = ellipsoid(p, (0, 0.17, 2.47), (0.33, 0.30, 0.31))
    face = ellipsoid(p, (0, -0.10, 2.33), (0.32, 0.275, 0.25))
    d = smin(cranium, back, 0.08)
    d = smin(d, face, 0.10)
    for s in (-1, 1):
        cheek = ellipsoid(p, (s * 0.175, -0.17, 2.27), (0.16, 0.175, 0.135))
        d = smin(d, cheek, 0.07)
    jaw = ellipsoid(p, (0, -0.14, 2.22), (0.20, 0.19, 0.115))
    d = smin(d, jaw, 0.08)
    chin = ellipsoid(p, (0, -0.22, 2.18), (0.12, 0.10, 0.072))
    d = smin(d, chin, 0.05)
    q = p.copy()
    q[..., 1] = (q[..., 1] - 0.02) * 1.12 + 0.02
    neck = round_cone(q, (0, 0.04, 1.90), (0, 0.0, 2.22), 0.098, 0.092)
    d = smin(d, neck, 0.06)
    return d


def face_base(p):
    d = skull(p)
    nose = ellipsoid(p, (0, -0.366, 2.302), (0.036, 0.034, 0.027))
    d = smin(d, nose, 0.03)
    for s in (-1, 1):
        d = smin(d, ellipsoid(p, (s * 0.026, -0.350, 2.290), (0.019, 0.017, 0.015)), 0.015)
    return d


def eyeball(p, side, eye_y):
    c = (side * EYE_X, eye_y + EYE_SINK, EYE_Z)
    q = rotate(p, c, 'z', side * EYE_YAW)
    q = rotate(q, c, 'x', EYE_PITCH)
    return ellipsoid(q, c, EYE_RADII)


def eye_opening(p, side):
    """Almond opening seen from the front: a taller upper arc over a flatter lower lid."""
    dx = (p[..., 0] - side * EYE_X) / EYE_OPEN[0]
    dz = p[..., 2] - EYE_Z
    dz = np.where(dz > 0, dz / EYE_OPEN[1], dz / EYE_OPEN[2])
    return (np.sqrt(dx * dx + dz * dz) - 1) * EYE_OPEN[2]


@lru_cache(maxsize=None)
def landmarks():
    eye_y = surface_y(skull, EYE_X, EYE_Z)
    mouth_y0 = surface_y(skull, 0.0, MOUTH_Z)
    mouth_y1 = surface_y(skull, MOUTH_HALF, MOUTH_Z + MOUTH_LIFT * MOUTH_HALF ** 2)
    brow = []
    ctrl = [(0.080, 0, 2.512, 0.019), (0.130, 0, 2.526, 0.020), (0.185, 0, 2.531, 0.017),
            (0.238, 0, 2.524, 0.012), (0.280, 0, 2.506, 0.007)]
    for x, _, z, r in resample(ctrl, 24):
        brow.append((x, surface_y(skull, x, z) + 0.5 * r, z, r))
    lash = []
    lid = lambda q: eyeball(q, 1, eye_y) - 0.010
    for i in range(40):
        t = np.radians(2 + 172 * i / 39)
        x = EYE_X + EYE_OPEN[0] * 1.0 * np.cos(t)
        z = EYE_Z + EYE_OPEN[1] * np.sin(t)
        thick = 0.0125 * (1 - 0.55 * abs(np.cos(t)) ** 3) * (1 - 0.25 * max(0.0, -np.cos(t)))
        lash.append((float(x), surface_y(lid, float(x), float(z)) + 0.6 * thick, float(z) + 0.3 * thick, float(thick)))
    return {'eye_y': eye_y, 'mouth_y0': mouth_y0, 'mouth_y1': mouth_y1, 'brow': brow, 'lash': lash}


def head_field(p):
    L = landmarks()
    d = face_base(p)
    for s in (-1, 1):
        ball = eyeball(p, s, L['eye_y'])
        # Lids: a skin shell over the eyeball, blended into the cheeks and brow.
        d = smin(d, ball - 0.009, 0.045)
        cut = np.maximum(np.maximum(eye_opening(p, s), -(ball + 0.003)), p[..., 1] - (L["eye_y"] + EYE_SINK))
        d = smax(d, -cut, 0.005)
        d = smin(d, _ear(p, s), 0.035)
    # Smile: a shallow groove following the cheek curvature, corners lifting.
    x = p[..., 0]
    bend = (L['mouth_y1'] - L['mouth_y0']) / MOUTH_HALF ** 2
    curve_z = MOUTH_Z + MOUTH_LIFT * x * x
    curve_y = L['mouth_y0'] + bend * x * x
    groove = np.sqrt((p[..., 2] - curve_z) ** 2 + (p[..., 1] - curve_y) ** 2) - 0.006
    groove = np.maximum(groove, np.abs(x) - MOUTH_HALF)
    d = smax(d, -groove, 0.008)
    d = smin(d, ellipsoid(p, (0, L['mouth_y0'] + 0.012, MOUTH_Z - 0.016), (0.045, 0.02, 0.013)), 0.02)
    # The neck ends inside the sweater collar.
    return np.maximum(d, 1.88 - p[..., 2])


def _mirrored_chain(p, pts, k):
    out = None
    for s in (-1, 1):
        for a, b in zip(pts, pts[1:]):
            seg = round_cone(p, (s * a[0], a[1], a[2]), (s * b[0], b[1], b[2]), a[3], b[3])
            out = seg if out is None else smin(out, seg, k)
    return out


def brow_field(p):
    return _mirrored_chain(p, landmarks()['brow'], 0.01)


def lash_field(p):
    pts = landmarks()['lash']
    d = _mirrored_chain(p, pts, 0.006)
    # Outer-corner flick.
    x, y, z, r = pts[0]
    for s in (-1, 1):
        d = smin(d, round_cone(p, (s * x, y, z), (s * (x + 0.02), y + 0.012, z + 0.012), r, 0.003), 0.004)
    return d


HEAD_BOX = ((-0.50, -0.47, 1.85), (0.50, 0.52, 2.93))
BROW_BOX = ((-0.30, -0.42, 2.46), (0.30, -0.22, 2.60))
LASH_BOX = ((-0.30, -0.42, 2.28), (0.30, -0.18, 2.50))
