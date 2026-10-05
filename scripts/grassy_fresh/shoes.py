"""Canvas-and-leather sneakers: sole, upper, toe cap, side panels, laces and bow."""
import math

import numpy as np

import geo
from geo import add_mesh, sp, spline, sphere, thread, tube, unit, rs

SOLE_TOP = 0.052
ANKLE_Y = 0.048
FOOT_X = 0.268
SPLAY = math.radians(17)
KEYS = [  # f, half-width W, top height T
    (-0.282, 0.0, 0.15), (-0.275, 0.07, 0.17), (-0.268, 0.108, 0.235), (-0.235, 0.120, 0.268),
    (-0.15, 0.124, 0.285), (-0.08, 0.136, 0.300), (0.0, 0.154, 0.288), (0.08, 0.172, 0.242),
    (0.16, 0.183, 0.190), (0.24, 0.182, 0.150), (0.31, 0.164, 0.138), (0.355, 0.121, 0.112),
    (0.372, 0.072, 0.088), (0.382, 0.0, 0.066)]
KA = np.array(KEYS)
NEXP = 3.6


def profile(f):
    f = np.asarray(f, float)
    return spline(KA[:, 0], KA[:, 1], f), spline(KA[:, 0], KA[:, 2], f)


def point(f, phi, off=0.0, grow=0.0):
    """Upper surface point at length f and angle phi (0 = top centre, 90 = outer side)."""
    f, phi = np.broadcast_arrays(np.asarray(f, float), np.asarray(phi, float))
    W, T = profile(f)
    W, T = W + grow, T + grow
    zc, hh = (SOLE_TOP + T) / 2, (T - SOLE_TOP) / 2
    s, c = np.sin(phi), np.cos(phi)
    n = np.where(c < 0, 9.0, NEXP)   # near-vertical walls at the bottom so the upper sits flush on the sole
    x = W * sp(s, n)
    z = zc + hh * sp(c, n)
    nrm = unit(np.stack([x / np.maximum(W, 1e-4) ** 2, np.zeros_like(x), (z - zc) / np.maximum(hh, 1e-4) ** 2], -1))
    return np.stack([x, -f, z], -1) + nrm * np.asarray(off, float)[..., None]


def place(P, side):
    """Splay the shoe outward about the ankle and move it to the +X/-X foot."""
    P = np.asarray(P, float)
    pivot = np.array([0, ANKLE_Y, 0])
    a = SPLAY
    R = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
    Q_ = (P - pivot) @ R.T + pivot + np.array([FOOT_X, 0, 0])
    return Q_ * np.array([side, 1, 1])


def emit(name, P, mat, col, side, **kw):
    return add_mesh(f'{name}_{side}', place(P.reshape(-1, 3), side).reshape(P.shape), mat, col, **kw)


def spaced(a, b, R):
    return a + (b - a) * (1 - np.cos(np.linspace(0, math.pi, R))) / 2


def build_shoes(M, col, Q, fine=True):
    R, C = rs(138, Q), rs(92, Q)
    f = spaced(KA[0, 0], KA[-1, 0], R)
    phi = 2 * math.pi * np.arange(C) / C
    upper = point(f[:, None], phi[None, :])
    # sole: same footprint as the upper plus a small flange, pinched to a rounded tip at both ends
    Cs = rs(104, Q)
    pp = 2 * math.pi * np.arange(Cs) / Cs
    Wp = profile(f)[0]
    flange = 0.009 * np.sqrt(np.clip(Wp / 0.1, 0, 1))
    Wl = Wp + flange
    toe_lift = 0.016 * np.clip((f - 0.2) / 0.18, 0, 1) ** 2
    heel_lift = 0.007 * np.clip((-0.19 - f) / 0.1, 0, 1) ** 2
    sole = np.stack([Wl[:, None] * sp(np.sin(pp), 3.2)[None, :], -f[:, None] + 0 * pp[None, :],
                     0.028 + 0.028 * sp(np.cos(pp), 3.0)[None, :] + (toe_lift + heel_lift)[:, None]], -1)
    # toe cap
    fc = spaced(0.205, KA[-1, 0], rs(52, Q))
    cap = point(fc[:, None], phi[None, :], grow=0.0042)
    for side in (1, -1):
        emit('upper', upper, M['shoe'], col, side)
        emit('sole', sole, M['sole'], col, side)
        emit('toecap', cap, M['shoe'], col, side, caps=(True, False))
        # taupe side panel and heel tab patches
        pf = np.linspace(-0.07, 0.115, rs(40, Q))
        pph = np.radians(np.linspace(96, 138, rs(20, Q)))
        for sgn in (1, -1):
            patch = point(pf[:, None], (sgn * pph)[None, :], off=0.0035)
            add_mesh(f'panel_{side}_{sgn}', place(patch.reshape(-1, 3), side).reshape(patch.shape), M['shoe_panel'], col,
                     closed_u=False)
        tab = point(spaced(-0.282, -0.222, 10)[:, None], np.radians(np.linspace(-26, 26, 14))[None, :], off=0.0035)
        add_mesh(f'heeltab_{side}', place(tab.reshape(-1, 3), side).reshape(tab.shape), M['shoe_panel'], col,
                 closed_u=False)
        if not fine:
            continue
        # laces: five crossings over the instep
        for k in range(5):
            f0 = 0.012 + 0.032 * k
            t = np.linspace(-1, 1, rs(36, Q))
            for sg in (1, -1):
                path = point(f0 + sg * 0.020 * t, np.radians(66) * t * 1.0, off=0.0085 + 0.003 * (1 - np.abs(t)))
                tubeP = tube(path, 0.0072, 0.0058, 10, hint=(0, 0, 1))
                add_mesh(f'lace_{side}_{k}_{sg}', place(tubeP.reshape(-1, 3), side).reshape(tubeP.shape), M['lace'], col,
                         caps=(True, True))
        # eyelet rings along both lace rows
        for k in range(6):
            f0 = 0.0 + 0.032 * k
            for sg in (1, -1):
                c = point(np.array([f0]), np.array([sg * math.radians(63)]), off=0.002)[0]
                ring_t = np.linspace(0, 2 * math.pi, 18, endpoint=False)
                path = np.stack([c[0] + 0.012 * np.cos(ring_t) * 0.6, c[1] + 0.012 * np.sin(ring_t), c[2] + 0 * ring_t], -1)
                ringP = tube(path, 0.0028, 0.0028, 6, hint=(0, 0, 1), closed=True)
                add_mesh(f'eyelet_{side}_{k}_{sg}', place(ringP.reshape(-1, 3), side).reshape(ringP.shape), M['rivet'], col,
                         closed_v=True)
        # tongue pad and bow
        tong = sphere((0, 0.034, 0.302), (0.058, 0.052, 0.030), rs(20, Q), rs(28, Q))
        add_mesh(f'tongue_{side}', place(tong.reshape(-1, 3), side).reshape(tong.shape), M['shoe'], col)
        for sg in (1, -1):
            loop_t = np.linspace(0, 2 * math.pi, 28, endpoint=False)
            base = point(np.array([-0.012]), np.array([0.0]), off=0.010)[0]
            lp = np.stack([base[0] + sg * (0.030 + 0.030 * np.cos(loop_t)), base[1] + 0.016 * np.sin(loop_t) * 1.0,
                           base[2] + 0.010 + 0.014 * np.sin(loop_t) ** 2], -1)
            loopP = tube(lp, 0.0065, 0.0055, 8, hint=(0, 0, 1), closed=True)
            add_mesh(f'bow_{side}_{sg}', place(loopP.reshape(-1, 3), side).reshape(loopP.shape), M['lace'], col, closed_v=True)
            tail = np.stack([base[0] + sg * 0.012 * np.linspace(0, 1, 12) + sg * 0.02 * np.linspace(0, 1, 12) ** 2,
                             base[1] + 0.02 * np.linspace(0, 1, 12) ** 1.5, base[2] + 0.005 - 0.026 * np.linspace(0, 1, 12)], -1)
            add_mesh(f'tail_{side}_{sg}', place(tube(tail, 0.0058, 0.0048, 8, hint=(0, 1, 0)).reshape(-1, 3), side)
                     .reshape(12, 8, 3), M['lace'], col, caps=(True, True))
        # stitching on toe cap seam
        t = np.linspace(-1, 1, 60)
        seam = point(np.full(60, 0.208), np.radians(88) * t, off=0.0018)
        geo.thread(f'seam_{side}', place(seam, side), M['thread'], col, radius=0.0021)
