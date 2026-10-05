"""Head, face features, ears and neck."""
import math

import numpy as np

import mats
from geo import add_mesh, grid_normals, loft, rot_axis, rs, sample_grid, smoothstep, spline, sphere, tube, unit

CY = 0.07  # head ring centre; the head sits slightly behind the torso axis
EYE_X, EYE_Y, EYE_Z, EYE_R = 0.158, -0.213, 2.395, 0.105
EYE_AX, EYE_AZ, EYE_DEPTH = 0.092, 0.086, 0.055

HEAD_KEYS = [  # z, rx, ryf, ryb
    (2.050, 0.0, 0.0, 0.0), (2.058, .07, .08, .07), (2.072, .12, .18, .11), (2.095, .18, .31, .16),
    (2.125, .23, .385, .21), (2.17, .285, .415, .26), (2.22, .325, .425, .30), (2.28, .355, .425, .34),
    (2.34, .378, .418, .375), (2.42, .395, .408, .39), (2.55, .398, .41, .40), (2.66, .36, .38, .39),
    (2.75, .295, .30, .33), (2.81, .20, .2, .24), (2.84, .10, .10, .13), (2.852, 0.0, 0.0, 0.0)]


def gauss(P, c, r):
    d = (P - np.asarray(c)) / np.asarray(r)
    return np.exp(-(d**2).sum(-1))


def head_grid(R, C):
    s = (1 - np.cos(np.linspace(0, math.pi, R))) / 2
    z = HEAD_KEYS[0][0] + s * (HEAD_KEYS[-1][0] - HEAD_KEYS[0][0])
    keys = np.array(HEAD_KEYS)
    rx, ryf, ryb = (spline(keys[:, 0], keys[:, i], z) for i in (1, 2, 3))
    rx, ryf, ryb = (np.maximum(a, 0) for a in (rx, ryf, ryb))
    P = loft(z, np.zeros(R), np.full(R, CY), rx, ryf, ryb, np.full(R, 2.25), C)
    return P


def sculpt_face(P):
    n = grid_normals(P)
    front = np.clip(-n[..., 1], 0, 1)  # faces that look forward
    X, Y, Z = P[..., 0], P[..., 1], P[..., 2]
    ax = np.abs(X)
    fy = lambda x, z: nearest_front_y(P, x, z)
    d = np.zeros(P.shape[:2])
    for s in (-1, 1):
        d += 0.022 * gauss(P, (s * .215, fy(.215, 2.28) + .02, 2.28), (.14, .12, .12))     # cheeks
        d += 0.010 * gauss(P, (s * .15, fy(.15, 2.50), 2.50), (.09, .07, .03))             # brow ridge
        d += 0.012 * gauss(P, (s * .03, fy(.03, 2.27) + .01, 2.27), (.022, .03, .025))     # nostril wings
        d += -0.010 * gauss(P, (s * .15, fy(.15, 2.31) + .01, 2.31), (.07, .06, .03))      # under-eye soft hollow
        e = np.sqrt(((X - s * EYE_X) / EYE_AX) ** 2 + ((Z - EYE_Z) / EYE_AZ) ** 2)
        d -= EYE_DEPTH * (1 - smoothstep(0.82, 1.18, e)) * (Y < CY - 0.1)                   # eye sockets
    d += 0.013 * gauss(P, (0, fy(0, 2.14) + .01, 2.14), (.10, .10, .055))                  # chin
    d += 0.020 * gauss(P, (0, fy(0, 2.35), 2.35), (.03, .04, .08))                          # nose bridge
    d += 0.036 * gauss(P, (0, fy(0, 2.287) + .02, 2.287), (.042, .042, .036))               # nose tip
    d += 0.007 * gauss(P, (0, fy(0, 2.185) + .005, 2.185), (.05, .04, .016))               # lower-lip fullness
    zc = 2.205 + 0.02 * (X / 0.08) ** 2                                                     # smile groove
    dist = np.abs(Z - zc) * (np.abs(X) < 0.085) * (Y < CY - 0.2) + 9 * ((np.abs(X) >= 0.085) | (Y >= CY - 0.2))
    d -= 0.0075 * np.exp(-(dist / 0.0065) ** 2) * (1 - smoothstep(0.06, 0.085, ax))
    d -= 0.006 * gauss(P, (0, fy(0, 2.235), 2.235), (.02, .03, .008))                       # philtrum dimple
    return P + n * (d * np.where(front > 0.05, 1, 0.0))[..., None]


def nearest_front_y(P, x, z):
    m = P[..., 1] < CY - 0.1
    pts = P[m]
    dist = (pts[:, 0] - x) ** 2 + (pts[:, 2] - z) ** 2
    k = np.argsort(dist)[:4]
    return pts[k, 1].mean()


def skin_texture(P):
    H, W = 512, 1024
    v, u = np.mgrid[0:H, 0:W]
    pos = sample_grid(P, v / (H - 1) * (P.shape[0] - 1), u / W * P.shape[1])
    base = np.array(mats.rgb('f7bfa5'))
    img = np.zeros((H, W, 3)) + base
    blush = np.zeros((H, W))
    for s in (-1, 1):
        blush += 0.55 * gauss(pos, (s * .20, -.30, 2.27), (.075, .07, .045))
        blush += 0.20 * gauss(pos, (s * .13, -.33, 2.36), (.05, .05, .02))
    blush += 0.35 * gauss(pos, (0, -.36, 2.285), (.035, .035, .03))
    blush += 0.18 * gauss(pos, (0, -.33, 2.18), (.06, .04, .015))
    ears = 0.1 * (np.abs(pos[..., 0]) > .39)
    tint = np.array(mats.rgb('e9766a'))
    k = np.clip(blush + ears, 0, 0.75)[..., None]
    return mats.to_image('skin_face', img * (1 - k) + tint * k)


def cap(center, radius, theta, direction, mat, col, name, R=14, C=40):
    th = np.linspace(0, theta, R)
    phi = 2 * math.pi * np.arange(C) / C
    P = np.stack([radius * np.sin(th)[:, None] * np.cos(phi)[None, :],
                  radius * np.sin(th)[:, None] * np.sin(phi)[None, :],
                  np.broadcast_to((radius * np.cos(th))[:, None], (R, C))], -1)
    z = np.array([0, 0, 1.0])
    d = unit(np.asarray(direction, float))
    ax = np.cross(z, d)
    if np.linalg.norm(ax) > 1e-9:
        P = P @ rot_axis(ax, math.acos(np.clip(z @ d, -1, 1))).T
    elif d[2] < 0:
        P = P * np.array([1, 1, -1])
    return add_mesh(name, P + np.asarray(center), mat, col, flip=False)


def eye(side, M, col, Q):
    c = np.array([side * EYE_X, EYE_Y, EYE_Z])
    look = unit(np.array([side * 0.04, -1.0, 0.0]))
    add_mesh(f'eye_white_{side}', sphere(c, (EYE_R,) * 3, rs(38, Q), rs(48, Q)), M['eye_white'], col)
    cap(c, EYE_R * 1.010, math.radians(44), look, M['iris'], col, f'iris_{side}', rs(20, Q), rs(56, Q))
    cap(c, EYE_R * 1.016, math.radians(17), look, M['pupil'], col, f'pupil_{side}', 8, rs(40, Q))
    hl1 = unit(np.array([side * 0.04 - 0.30, -1.0, 0.36]))
    cap(c, EYE_R * 1.022, math.radians(11), hl1, M['highlight'], col, f'hl_big_{side}', 8, 24)
    hl2 = unit(np.array([side * 0.04 + 0.38, -1.0, -0.34]))
    cap(c, EYE_R * 1.022, math.radians(5.5), hl2, M['highlight'], col, f'hl_small_{side}', 6, 16)
    # upper lash line follows the lid opening and flicks outward
    beta = np.radians(np.linspace(172, -12, rs(52, Q)))
    ex, ez = EYE_AX * 0.94, EYE_AZ * 0.94
    x = c[0] + side * np.cos(beta) * ex * (1 + 0.0)
    z = c[2] + np.sin(beta) * ez
    dx, dz = x - c[0], z - c[2]
    y = c[1] - np.sqrt(np.maximum(EYE_R**2 - dx**2 - dz**2, 1e-6)) - 0.004
    path = np.stack([x, y, z], -1)
    w = np.sin(np.linspace(0.15, 1.0, len(beta)) * math.pi * 0.95) ** 0.7
    r1 = 0.0035 + 0.0085 * w
    add_mesh(f'lash_{side}', tube(path, r1, 0.006, 10, hint=(0, -1, 0)), M['pupil'], col, closed_u=True,
             caps=(True, True))


def brow(side, M, col, Q, P):
    t = np.linspace(0, 1, rs(40, Q))
    x = 0.078 + 0.172 * t
    z = 2.515 + 0.042 * np.sin(t * math.pi * 0.85) - 0.012 * t ** 2
    y = np.array([nearest_front_y(P, xx, zz) for xx, zz in zip(x, z)]) - 0.001
    path = np.stack([side * x, y, z], -1)
    thick = 0.021 * np.sin(np.pi * np.clip(0.08 + 0.92 * (1 - t) ** 0.9, 0, 1)) ** 0.5 + 0.004
    add_mesh(f'brow_{side}', tube(path, thick, 0.008, 12, hint=(0, -1, 0), n=2.4), M['brow'], col,
             caps=(True, True))


def mouth(M, col, Q, P):
    x = np.linspace(-0.082, 0.082, rs(52, Q))
    z = 2.205 + 0.02 * (x / 0.08) ** 2
    y = np.array([nearest_front_y(P, xx, zz) for xx, zz in zip(x, z)]) + 0.0
    w = 0.0042 + 0.0022 * np.cos(x / 0.082 * math.pi / 2)
    add_mesh('smile', tube(np.stack([x, y, z], -1), w, 0.0045, 10, hint=(0, -1, 0)), M['lip'], col,
             caps=(True, True))


def ear(side, M, col, Q):
    c = np.array([side * 0.405, 0.075, 2.325])
    R, C = rs(46, Q), rs(60, Q)
    P = sphere((0, 0, 0), (0.042, 0.072, 0.118), R, C)
    n = unit(P / np.array([0.042, 0.072, 0.118]) ** 2)
    rho = np.sqrt((P[..., 1] / 0.072) ** 2 + (P[..., 2] / 0.118) ** 2)
    outer = np.clip(n[..., 0] * side, 0, 1)
    disp = outer * (-0.026 * (1 - smoothstep(0.1, 0.82, rho)) + 0.012 * np.exp(-((rho - 0.82) / 0.12) ** 2))
    P = P + n * disp[..., None]
    P[..., 0] += side * 0.028 * (P[..., 1] / 0.072) * (P[..., 1] > 0)
    return add_mesh(f'ear_{side}', P + c, M['skin'], col)


def neck(M, col, Q):
    R = rs(38, Q)
    z = np.linspace(1.94, 2.2, R)
    flare = 1.0 + 0.0 * z
    path = np.stack([np.zeros(R), np.full(R, 0.065), z], -1)
    return add_mesh('neck', tube(path, 0.148 * flare, 0.135 * flare, rs(60, Q)), M['skin'], col,
                    caps=(True, False))


def build_head(M, col, Q):
    R, C = rs(236, Q), rs(240, Q)
    P = sculpt_face(head_grid(R, C))
    mats_skin = M['skin']
    M['skin_face'] = mats.principled('skin_face', 'f7bfa5', 0.48, color_img=skin_texture(P))
    add_mesh('head', P, M['skin_face'], col)
    for s in (-1, 1):
        eye(s, M, col, Q)
        brow(s, M, col, Q, P)
        ear(s, M, col, Q)
    mouth(M, col, Q, P)
    neck(M, col, Q)
    return P
