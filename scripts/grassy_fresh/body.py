"""Sweater torso, sleeves, hands, jeans."""
import math

import numpy as np

from geo import add_mesh, grid_normals, loft, smoothstep, spline, sphere, tube, rs


def perimeter_uv(P, tile):
    around = np.linalg.norm(np.roll(P, -1, 1) - P, axis=2).sum(1).mean()
    along = np.linalg.norm(np.diff(P, axis=0), axis=2).sum(0).mean()
    return (around / tile, along / tile)


def spl(keys, t):
    k = np.asarray(keys, float)
    return spline(k[:, 0], k[:, 1:], t)


def folds(P, N, func):
    """Displace a ring grid along its normals by func(phi, z, row_param)."""
    R, C, _ = P.shape
    phi = 2 * math.pi * np.arange(C)[None, :] / C
    return P + N * func(phi, P[..., 2], P)[..., None]


def emit_pair(name, P, mat, col, tile, caps=(False, False), mirror=True, closed_u=True):
    out = []
    for s in ((1, -1) if mirror else (1,)):
        Q_ = P * np.array([s, 1, 1])
        out.append(add_mesh(f'{name}_{s}', Q_, mat, col, uvscale=perimeter_uv(P, tile), caps=caps, closed_u=closed_u))
    return out


# ---------------------------------------------------------------- sweater
TORSO_KEYS = [  # z, rx, ryf, ryb, cy, n
    (1.236, .290, .225, .225, .02, 2.4), (1.248, .322, .252, .245, .02, 2.5), (1.262, .338, .262, .252, .02, 2.5),
    (1.34, .345, .266, .256, .02, 2.5), (1.38, .355, .264, .256, .02, 2.5), (1.55, .370, .248, .242, .02, 2.5),
    (1.72, .380, .232, .228, .02, 2.5), (1.85, .372, .212, .216, .025, 2.4), (1.92, .340, .182, .192, .03, 2.2),
    (1.96, .292, .152, .172, .04, 2.1), (1.99, .226, .138, .154, .05, 2.0), (2.01, .198, .130, .146, .055, 2.0)]


def build_torso(M, col, Q):
    R, C = rs(180, Q), rs(280, Q)
    z = np.linspace(TORSO_KEYS[0][0], TORSO_KEYS[-1][0], R)
    k = np.array(TORSO_KEYS)
    rx, ryf, ryb, cy, n = (spline(k[:, 0], k[:, i], z) for i in (1, 2, 3, 4, 5))
    P = loft(z, np.zeros(R), cy, rx, ryf, ryb, n, C)
    N = grid_normals(P)
    phi = 2 * math.pi * np.arange(C)[None, :] / C
    Z = z[:, None] + 0 * phi
    rib = np.sin(phi * 96) * (1 - smoothstep(1.365, 1.40, Z)) * 0.0045
    bulge = 0.010 * np.exp(-((Z - 1.318) / 0.045) ** 2)                      # ribbing band is slightly thicker
    soft = (0.006 * np.sin(Z * 38 + phi * 3.0) + 0.005 * np.sin(Z * 21 - phi * 5.0)) * smoothstep(1.38, 1.6, Z) \
        * (1 - smoothstep(1.8, 1.95, Z))
    under = 0.008 * np.exp(-((Z - 1.43) / 0.05) ** 2) * (0.5 + 0.5 * np.cos(phi * 2))   # blouse overhang above rib
    P = P + N * (rib + bulge + soft + under)[..., None]
    add_mesh('sweater_body', P, M['sweater'], col, uvscale=perimeter_uv(P, 0.17), caps=(True, False))
    # crew-neck collar: a ribbed tube along a closed loop that dips at the front
    t = np.linspace(0, 2 * math.pi, rs(200, Q), endpoint=False)
    path = np.stack([0.168 * np.sin(t), 0.055 - 0.122 * np.cos(t), 2.036 - 0.018 * np.cos(t)], -1)
    ring = tube(path, 0.044, 0.042, rs(42, Q), hint=(0, 0, 1), closed=True)
    Nr = grid_normals(ring, True)
    ribs = 0.0022 * np.sin(np.linspace(0, 2 * math.pi * 120, ring.shape[0], endpoint=False)[:, None]) * np.ones((1, ring.shape[1]))
    add_mesh('collar', ring + Nr * ribs[..., None], M['sweater'], col, uvscale=(6, 14), closed_u=True, closed_v=True)
    return P


SLEEVE_KEYS = [  # z, x, y, r1, r2   (right sleeve, +X); starts as a dome inside the shoulder
    (1.945, .200, .02, .020, .020), (1.915, .225, .02, .095, .095), (1.875, .262, .022, .128, .124),
    (1.81, .295, .025, .140, .136), (1.68, .340, .03, .148, .143),
    (1.54, .424, .028, .158, .150), (1.42, .474, .022, .163, .154), (1.35, .505, .015, .160, .152),
    (1.29, .522, .008, .136, .132), (1.245, .532, .004, .104, .102), (1.205, .538, .0, .090, .088),
    (1.14, .543, .0, .088, .086)]


def build_sleeves(M, col, Q):
    R, C = rs(114, Q), rs(148, Q)
    zs = np.linspace(SLEEVE_KEYS[0][0], SLEEVE_KEYS[-1][0], R)
    k = np.array(SLEEVE_KEYS)
    # parameterise by row so the tube follows the arm direction
    px, py, r1, r2 = (spline(k[:, 0][::-1], k[:, i][::-1], zs[::-1])[::-1] for i in (1, 2, 3, 4))
    path = np.stack([px, py, zs], -1)
    P = tube(path, r1, r2, C, hint=(0, -1, 0), n=2.2)
    N = grid_normals(P)
    phi = 2 * math.pi * np.arange(C)[None, :] / C
    Z = zs[:, None] + 0 * phi
    rib = np.sin(phi * 28) * 0.0042 * smoothstep(1.25, 1.21, Z)
    wrinkle = (0.008 * np.sin(Z * 55 + phi * 2) * np.exp(-((Z - 1.40) / 0.12) ** 2)
               + 0.007 * np.sin(Z * 34 - phi * 3) * np.exp(-((Z - 1.60) / 0.2) ** 2))
    crease = 0.010 * np.exp(-((Z - 1.56) / 0.035) ** 2) * np.maximum(np.cos(phi - math.pi), 0)  # inner elbow fold
    P = P + N * (rib + wrinkle + crease)[..., None]
    emit_pair('sleeve', P, M['sweater'], col, 0.17, caps=(True, True))
    return P


# ---------------------------------------------------------------- jeans
PELVIS_KEYS = [(0.95, .364, .190, .222, .022, 2.4), (1.00, .366, .198, .228, .022, 2.45), (1.07, .358, .212, .238, .022, 2.5),
               (1.15, .348, .236, .252, .02, 2.55), (1.22, .336, .240, .254, .02, 2.55),
               (1.262, .330, .238, .252, .02, 2.55), (1.30, .326, .236, .250, .02, 2.55)]

LEG_KEYS = [  # z, x, y, r1, r2   (+X leg); the top starts inside the waist so hips widen smoothly
    (1.27, .168, .034, .178, .232), (1.15, .172, .036, .180, .228), (1.04, .184, .040, .182, .220),
    (0.98, .192, .041, .180, .214), (0.89, .200, .043, .172, .205),
    (0.74, .222, .049, .171, .199), (0.60, .241, .055, .170, .195), (0.48, .250, .058, .176, .196),
    (0.40, .254, .059, .182, .199), (0.31, .256, .060, .182, .199)]


def pelvis_grid(R, C):
    z = np.linspace(PELVIS_KEYS[0][0], PELVIS_KEYS[-1][0], R)
    k = np.array(PELVIS_KEYS)
    rx, ryf, ryb, cy, n = (spline(k[:, 0], k[:, i], z) for i in (1, 2, 3, 4, 5))
    return loft(z, np.zeros(R), cy, rx, ryf, ryb, n, C)


def leg_grid(R, C):
    zz = np.linspace(LEG_KEYS[0][0], LEG_KEYS[-1][0], R)
    kk = np.array(LEG_KEYS)
    px, py, r1, r2 = (spline(kk[:, 0][::-1], kk[:, i][::-1], zz[::-1])[::-1] for i in (1, 2, 3, 4))
    cuff_bulge = 1 + 0.07 * smoothstep(0.30, 0.345, zz) * (1 - smoothstep(0.455, 0.475, zz))
    groove = 1 - 0.035 * np.exp(-((zz - 0.467) / 0.008) ** 2)
    path = np.stack([px, py, zz], -1)
    return tube(path, r1 * cuff_bulge * groove, r2 * cuff_bulge * groove, C, hint=(0, -1, 0), n=2.3)
