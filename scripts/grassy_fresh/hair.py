"""Layered hair: every lock is a tapered leaf swept along a path that drapes over the skull."""
import math

import numpy as np

from geo import add_batch, add_mesh, grid_normals, smoothstep, tube, unit, rs
import head

E_CENTER = np.array([0.0, 0.065, 2.50])
E_RADII = np.array([0.405, 0.412, 0.360])
WHORL = np.array([-0.03, 0.10, 2.84])


def ell_value(p):
    return (((p - E_CENTER) / E_RADII) ** 2).sum(-1)


def ell_normal(p):
    return unit((p - E_CENTER) / E_RADII**2)


def on_surface(p, push=1.0):
    d = np.sqrt(ell_value(p))[..., None]
    return E_CENTER + (p - E_CENTER) / np.maximum(d, 1e-6) * push


def hairline(psi):
    """Lowest z a root may have, by angle from straight ahead (0 front, pi back)."""
    a = np.abs(psi)
    keys = np.array([[0, 2.62], [0.7, 2.58], [1.2, 2.42], [1.6, 2.36], [2.1, 2.26], [2.7, 2.14], [3.2, 2.06]])
    return np.interp(a, keys[:, 0], keys[:, 1])


def sample_roots(rng, n):
    pts = []
    while len(pts) < n:
        th = np.arccos(rng.uniform(-0.15, 1.0))
        az = rng.uniform(-math.pi, math.pi)
        d = np.array([math.sin(th) * math.sin(az), -math.sin(th) * math.cos(az), math.cos(th)])
        p = E_CENTER + d * E_RADII
        if p[2] > hairline(az) and np.sin(th) > 0.05 or th < 0.1:
            pts.append(p)
    return np.array(pts)


def rim_roots(rng, n):
    """Roots in the lower band of the hair mass, so loose locks hang over the rim and break the outline."""
    pts = []
    while len(pts) < n:
        th = np.arccos(rng.uniform(-0.15, 0.95))
        az = rng.uniform(-math.pi, math.pi)
        d = np.array([math.sin(th) * math.sin(az), -math.sin(th) * math.cos(az), math.cos(th)])
        p = E_CENTER + d * E_RADII * 1.05
        if hairline(az) + 0.0 < p[2] < hairline(az) + 0.20 and np.sin(th) > 0.12:
            pts.append(p)
    return np.array(pts)


def sample_rows(rng, spacing, offset, theta_max=1.8):
    """Roots on rings around the crown, evenly spaced with small jitter, so locks lay in clean overlapping rows."""
    pts = []
    for th in np.arange(0.14, theta_max, 0.105):
        n = max(5, int(round(2 * math.pi * 0.40 * math.sin(th) / spacing)))
        for k in range(n):
            az = -math.pi + 2 * math.pi * (k + offset + rng.uniform(-0.18, 0.18)) / n
            t2 = th + rng.uniform(-0.03, 0.03)
            d = np.array([math.sin(t2) * math.sin(az), -math.sin(t2) * math.cos(az), math.cos(t2)])
            p = E_CENTER + d * E_RADII
            if p[2] > hairline(az) + 0.01:
                pts.append(p)
    return np.array(pts)


def lock_paths(rng, roots, K, scale):
    n = len(roots)
    nrm = ell_normal(roots)
    az = np.arctan2(roots[:, 0], -(roots[:, 1] - E_CENTER[1]))   # 0 front, +pi/2 character-left (+X)
    flow = roots - WHORL
    flow -= (flow * nrm).sum(-1, keepdims=True) * nrm
    flow = unit(flow)
    # side hair sweeps back-and-down, front hair falls to the forehead
    down = np.array([0, 0, -1.0])
    zrel = (roots[:, 2] - 2.45) / 0.4
    length = rng.uniform(0.85, 1.15, n) * (0.22 + 0.04 * np.clip(1.4 - zrel, 0, 1.2))
    length = length * scale * (1 - 0.2 * smoothstep(1.8, 2.8, np.abs(az)))
    top = np.clip((roots[:, 2] - 2.62) / 0.2, 0, 1)
    lift = np.radians(rng.uniform(4, 22, n) + 26 * top) * (1 + 0.3 * np.clip(zrel, 0, 1))
    length = length * (1 + 0.25 * top)
    vol = (rng.uniform(0.01, 0.04, n) + top * rng.uniform(0.05, 0.12, n)) * \
        (1 + 0.9 * np.clip(1.2 - np.abs(az) / 0.9, 0, 1) * np.clip((roots[:, 2] - 2.55) / 0.2, 0, 1))
    gravity = rng.uniform(2.4, 3.4, n)
    flick = rng.uniform(0.0, 0.06, n)
    swirl = rng.normal(0, 0.3, n)
    front_w = np.clip(1.2 - np.abs(az) / 0.9, 0, 1) * np.clip((roots[:, 2] - 2.5) / 0.3, 0, 1)
    part = np.sign(roots[:, 0] - 0.03 + 0.02 * rng.normal(size=n))
    d = unit(flow * np.cos(lift)[:, None] + nrm * np.sin(lift)[:, None])
    pos = roots + nrm * 0.004
    paths = [pos.copy()]
    ds = (length / K)[:, None]
    for k in range(1, K + 1):
        t = (k / K)
        nn = ell_normal(pos)
        side = np.cross(nn, d)
        d = d + down * (gravity * (0.15 + 1.1 * t**1.3) * ds[:, 0] * 2.2)[:, None]
        d = d + nn * (vol * (1 - t) ** 1.2 * ds[:, 0] * 2.4)[:, None] - nn * (flick * 0 * ds[:, 0])[:, None]
        d = d + side * (swirl * ds[:, 0] * 0.9 * math.sin(t * math.pi))[:, None]
        d = d + np.array([1.0, 0, 0]) * (part * front_w * ds[:, 0] * 2.6 * t)[:, None]
        d = d + nn * (flick * np.clip(t - 0.65, 0, 1) * ds[:, 0] * 5.0)[:, None]
        d = unit(d)
        pos = pos + d * ds
        v = ell_value(pos)
        inside = v < 1.0
        if inside.any():
            pos[inside] = on_surface(pos[inside], 1.012)
            nin = ell_normal(pos[inside])
            d[inside] = unit(d[inside] - np.minimum((d[inside] * nin).sum(-1, keepdims=True), 0) * nin)
        paths.append(pos.copy())
    return np.stack(paths, 1), nrm, length


def zlimit(p, off=0.0):
    """Lowest z a lock point may reach: keeps the face and ears clear and the nape short."""
    az = np.abs(np.arctan2(p[..., 0], -(p[..., 1] - E_CENTER[1])))
    lim = np.interp(az, [0, 0.7, 1.0, 1.3, 1.6, 2.1, 2.7, 3.2], [2.60, 2.58, 2.52, 2.44, 2.36, 2.24, 2.14, 2.10])
    face = (-p[..., 1] > 0.285) & (np.abs(p[..., 0]) < 0.33)
    return np.where(face, np.maximum(lim, 2.62), lim) + off


def truncate(paths, off):
    """Shorten any lock that would hang below its limit so tips stay pointed instead of being clipped."""
    out = paths.copy()
    K1 = paths.shape[1]
    for i in range(len(paths)):
        bad = paths[i][:, 2] < zlimit(paths[i], off[i])
        bad[0] = False
        if not bad.any():
            continue
        k = int(np.argmax(bad))
        a, b = paths[i][k - 1], paths[i][k]
        za, zb = a[2] - zlimit(a, off[i]), b[2] - zlimit(b, off[i])
        f = np.clip(za / max(za - zb, 1e-6), 0, 1)
        end = k - 1 + f
        u = np.linspace(0, end, K1)
        i0 = np.minimum(np.floor(u).astype(int), K1 - 2)
        fr = (u - i0)[:, None]
        out[i] = paths[i][i0] * (1 - fr) + paths[i][i0 + 1] * fr
    return out


def bezier(p0, p1, p2, p3, K):
    t = np.linspace(0, 1, K + 1)[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def bangs(rng, n, K):
    """Fringe: broad locks rising off the crown, arching over and ending in points on the forehead."""
    paths, nrms, lens = [], [], []
    for i in range(n):
        az = -1.12 + 2.24 * (i + rng.uniform(-0.25, 0.25)) / max(n - 1, 1)
        th0 = 0.50 + 0.12 * rng.random()
        th1 = 1.22 + 0.10 * rng.random() + 0.05 * abs(az)
        az1 = az * 1.10 + 0.10 * math.copysign(1, az) * rng.random()

        def pt(th, a_, push):
            d = np.array([math.sin(th) * math.sin(a_), -math.sin(th) * math.cos(a_), math.cos(th)])
            return E_CENTER + d * E_RADII * push
        root = pt(th0, az, 1.0)
        tip = pt(th1, az1, 1.05)
        n0, n1 = ell_normal(root), ell_normal(tip)
        p = bezier(root, root + n0 * 0.11 + unit(tip - root) * 0.07, tip + n1 * 0.075 + np.array([0, 0, 0.09]), tip, K)
        paths.append(p); nrms.append(n0); lens.append(0.4)
    return np.array(paths), np.array(nrms), np.array(lens)


def build_hair(M, col, Q, seed=7):
    rng = np.random.default_rng(seed)
    K = rs(16, Q)
    Cc = rs(10, Q)
    allpaths, nrms, lens, kinds = [], [], [], []
    for n_locks, sc, kind in ((rs(90, Q, 12), 1.0, 0),):
        roots = rim_roots(rng, n_locks)
        p, nn, ln = lock_paths(rng, roots, K, sc)
        allpaths.append(p); nrms.append(nn); lens.append(ln); kinds.append(np.full(len(p), kind))
    p, nn, ln = bangs(rng, rs(11, Q), K)
    allpaths.append(p); nrms.append(nn); lens.append(ln); kinds.append(np.full(len(p), 2))
    nsp = rs(4, Q)
    ang = rng.uniform(0, 2 * math.pi, nsp)
    sp_roots = on_surface(np.stack([WHORL[0] + 0.12 * np.cos(ang), WHORL[1] + 0.10 * np.sin(ang) - 0.05,
                                    np.full(nsp, 2.8)], -1), 1.0)
    p, nn, ln = lock_paths(rng, sp_roots, K, 0.8)
    for i in range(nsp):
        up = np.array([0.55 * math.cos(ang[i]) + 0.30, -0.20, 0.8])
        t = np.linspace(0, 1, K + 1)[:, None]
        base = sp_roots[i]
        tip = base + unit(up) * (0.10 + 0.05 * rng.random())
        p[i] = base + (tip - base) * t + np.array([0.08, -0.04, 0.0]) * (1 + rng.random()) * t**2
    allpaths.append(p); nrms.append(nn); lens.append(ln); kinds.append(np.full(len(p), 3))
    flat = np.concatenate(allpaths)
    kind = np.concatenate(kinds)
    off = rng.uniform(-0.05, 0.07, len(flat))
    off[kind == 2] = 0.0                      # bangs are authored to stop on the forehead
    paths = truncate(flat, off)
    nrm = np.concatenate(nrms)
    t = np.linspace(0, 1, K + 1)
    verts = []
    for i in range(len(paths)):
        base_w = {0: 0.085, 1: 0.05, 2: 0.085, 3: 0.07}[int(kind[i])] * (0.85 + 0.35 * rng.random())
        r1 = base_w * (0.55 + 0.45 * smoothstep(0.0, 0.18, t)) * (1 - t) ** 0.6 + 0.0008
        r2 = 0.022 * (1 - t) ** 0.7 + 0.002
        verts.append(tube(paths[i], r1, r2, Cc, hint=nrm[i], n=2.0))
    add_batch('hair_locks', np.stack(verts), M['hair'], col)
    return paths


CLUMPS = 16


def whorl_angle(p):
    return np.arctan2(p[..., 1] - WHORL[1], p[..., 0] - WHORL[0])


def clump_phase(p):
    return (whorl_angle(p) / (2 * math.pi) * CLUMPS) % 1.0


def build_scalp(M, col, Q, P):
    """Sculpted hair mass: a domed cap grooved into leaf-shaped clumps that radiate from the whorl and end in pointed teeth."""
    R, C, _ = P.shape
    N = grid_normals(P)
    X, Y, Z = P[..., 0], P[..., 1], P[..., 2]
    phi = math.pi + 2 * math.pi * np.arange(C) / C
    psi = np.arctan2(np.sin(phi), np.cos(phi))
    zrow = P[:, 0, 2]
    ph = clump_phase(P)
    leaf = np.sin(math.pi * ph) ** 0.9
    top = np.clip((Z - 2.55) / 0.3, 0, 1)
    rho = np.hypot(X - WHORL[0], Y - WHORL[1])
    thick = 0.040 + 0.075 * top + 0.045 * leaf * (0.6 + 0.4 * (1 - top)) + 0.020 * np.exp(-(rho / 0.14) ** 2) + 0.020 * smoothstep(2.45, 2.7, Z)
    out = P + N * thick[..., None]
    for c in range(C):
        r0 = int(np.searchsorted(zrow, hairline(psi[c]) + 0.03))
        r0 = min(r0, R - 2)
        t = 1 - abs(2 * ph[r0, c] - 1)
        zedge = hairline(psi[c]) + 0.06 - 0.12 * t ** 1.1
        r1 = min(int(np.searchsorted(zrow, zedge)), R - 2)
        out[:r1, c] = out[r1, c]
    uv = np.zeros((R, C + 1, 2))
    uv[:, :C, 0] = ph
    uv[:, C, 0] = ph[:, 0]
    uv[:, :C, 1] = np.clip(rho / 0.62, 0, 1)
    uv[:, C, 1] = uv[:, 0, 1]
    return add_mesh('scalp', out, M['hair'], col, uv=uv)
