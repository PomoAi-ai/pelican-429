"""Procedural grid geometry: lofts, tubes and meshes built from numpy arrays."""
import math

import bpy
import numpy as np

PX = 3.1 / 1183  # world units per reference-image pixel


def sp(a, n):
    """Superellipse power: n=2 is a circle, larger n is boxier."""
    return np.sign(a) * np.abs(a) ** (2.0 / n)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def spline(ts, vs, t):
    """Cubic Hermite through key values with finite-difference tangents."""
    ts = np.asarray(ts, float)
    vs = np.asarray(vs, float)
    squeeze = vs.ndim == 1
    if squeeze:
        vs = vs[:, None]
    m = np.gradient(vs, ts, axis=0)
    t = np.asarray(t, float)
    i = np.clip(np.searchsorted(ts, t, side='right') - 1, 0, len(ts) - 2)
    h = (ts[i + 1] - ts[i])[..., None]
    u = ((t - ts[i])[..., None]) / h
    h00 = 2 * u**3 - 3 * u**2 + 1
    h10 = u**3 - 2 * u**2 + u
    h01 = -2 * u**3 + 3 * u**2
    h11 = u**3 - u**2
    out = h00 * vs[i] + h10 * h * m[i] + h01 * vs[i + 1] + h11 * h * m[i + 1]
    return out[..., 0] if squeeze else out


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def loft(z, cx, cy, rx, ryf, ryb, n, C):
    """Rings stacked along Z. Character faces -Y; ring starts at the back.

    ryf / ryb are the front and back half-depths so a ring can be asymmetric.
    """
    z, cx, cy, rx, ryf, ryb, n = [np.asarray(a, float) for a in (z, cx, cy, rx, ryf, ryb, n)]
    phi = math.pi + 2 * math.pi * np.arange(C) / C
    s, c = np.sin(phi)[None, :], np.cos(phi)[None, :]
    n = n[:, None]
    fwd = sp(c, n) * np.where(c >= 0, ryf[:, None], ryb[:, None])
    P = np.empty((len(z), C, 3))
    P[..., 0] = cx[:, None] + rx[:, None] * sp(s, n)
    P[..., 1] = cy[:, None] - fwd
    P[..., 2] = z[:, None]
    return P


def tube(path, r1, r2, C, hint=(0, -1, 0), n=2.0, twist=None, closed=False):
    """Elliptical sweep along a path. r1 spans the side axis, r2 the hint axis."""
    path = np.asarray(path, float)
    R = len(path)
    T = unit(np.roll(path, -1, 0) - np.roll(path, 1, 0)) if closed else unit(np.gradient(path, axis=0))
    hint = np.broadcast_to(np.asarray(hint, float), path.shape)
    N = unit(hint - (hint * T).sum(-1, keepdims=True) * T)
    B = np.cross(T, N)
    r1 = np.broadcast_to(np.asarray(r1, float), (R,))
    r2 = np.broadcast_to(np.asarray(r2, float), (R,))
    phi = 2 * math.pi * np.arange(C) / C
    if twist is not None:
        phi = phi[None, :] + np.asarray(twist, float)[:, None]
    else:
        phi = np.broadcast_to(phi[None, :], (R, C))
    cs, sn = sp(np.cos(phi), n), sp(np.sin(phi), n)
    return (path[:, None, :] + (r1[:, None] * cs)[..., None] * B[:, None, :]
            + (r2[:, None] * sn)[..., None] * N[:, None, :])


def grid_normals(P, closed_u=True):
    dc = (np.roll(P, -1, 1) - np.roll(P, 1, 1)) if closed_u else np.gradient(P, axis=1)
    dr = np.gradient(P, axis=0)
    nrm = unit(np.cross(dc, dr))
    centre = P.mean(axis=1, keepdims=True)
    if (nrm * (P - centre)).sum() < 0:
        nrm = -nrm
    return nrm


def sphere(center, radii, R=24, C=32, rot=None):
    th = np.linspace(0, math.pi, R)
    z = np.cos(th)
    r = np.sin(th)
    phi = 2 * math.pi * np.arange(C) / C
    P = np.empty((R, C, 3))
    P[..., 0] = r[:, None] * np.cos(phi)[None, :] * radii[0]
    P[..., 1] = r[:, None] * np.sin(phi)[None, :] * radii[1]
    P[..., 2] = z[:, None] * radii[2]
    if rot is not None:
        P = P @ np.asarray(rot).T
    return P + np.asarray(center, float)


def rot_axis(axis, ang):
    axis = unit(np.asarray(axis, float))
    x, y, z = axis
    c, s = math.cos(ang), math.sin(ang)
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                     [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                     [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])


def add_mesh(name, P, mat, col, closed_u=True, uv=None, uvscale=(1, 1), flip=None, caps=(False, False), closed_v=False):
    R, C, _ = P.shape
    nu = C if closed_u else C - 1
    idx = np.arange(R * C).reshape(R, C)
    nr = R if closed_v else R - 1
    r = np.arange(nr)[:, None]
    r1 = (r + 1) % R
    c = np.arange(nu)[None, :]
    c1 = (c + 1) % C
    quads = np.stack([idx[r, c], idx[r, c1], idx[r1, c1], idx[r1, c]], -1).reshape(-1, 4)
    if uv is None:
        U = np.arange(nu + 1) / nu * uvscale[0]
        V = np.arange(R + 1) / (R if closed_v else max(R - 1, 1)) * uvscale[1]
        uv = np.stack(np.broadcast_arrays(U[None, :], V[:, None]), -1)
    quv = np.stack([uv[r, c], uv[r, c + 1], uv[r + 1, c + 1], uv[r + 1, c]], -2).reshape(-1, 4, 2)
    verts = [P.reshape(-1, 3)]
    tris, tuv = [], []
    if caps[0] or caps[1]:
        for k, (do, row, sgn) in enumerate(((caps[0], 0, 1), (caps[1], R - 1, -1))):
            if not do:
                continue
            centre = P[row].mean(0)
            ci = sum(len(v) for v in verts)
            verts.append(centre[None, :])
            ring = idx[row]
            a, b = ring, np.roll(ring, -1)
            t = np.stack([np.full(C, ci), b, a], -1) if sgn > 0 else np.stack([np.full(C, ci), a, b], -1)
            tris.append(t)
            tuv.append(np.zeros((C, 3, 2)))
    verts = np.concatenate(verts)
    # decide winding so normals point away from the mesh centroid
    p0, p1, p2, p3 = (verts[quads[:, i]] for i in range(4))
    fn = np.cross(p2 - p0, p3 - p1)
    ctr = (p0 + p1 + p2 + p3) / 4 - verts.mean(0)
    if flip is None:
        flip = (fn * ctr).sum() < 0
    faces = [q for q in quads]
    if flip:
        quads = quads[:, ::-1]
        quv = quv[:, ::-1]
        tris = [t[:, ::-1] for t in tris]
    mesh = bpy.data.meshes.new(name)
    allf = quads.tolist() + [t for blk in tris for t in blk.tolist()]
    mesh.from_pydata(verts.tolist(), [], allf)
    mesh.update()
    layer = mesh.uv_layers.new(name='UVMap')
    data = [quv.reshape(-1, 2)] + [np.concatenate(tuv).reshape(-1, 2)] if tuv else [quv.reshape(-1, 2)]
    layer.data.foreach_set('uv', np.concatenate(data).astype(np.float32).ravel())
    mesh.shade_smooth()
    if mat is not None:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    return obj


def merge_grids(parts):
    """Stack rows of ring grids that share a column count (for one seamless mesh)."""
    return np.concatenate(parts, axis=0)


def sample_grid(P, rr, cc):
    R, C, _ = P.shape
    r0 = np.clip(np.floor(rr).astype(int), 0, R - 2)
    fr = (rr - r0)[..., None]
    c0 = np.floor(cc).astype(int) % C
    c1 = (c0 + 1) % C
    fc = (cc - np.floor(cc))[..., None]
    a = P[r0, c0] * (1 - fc) + P[r0, c1] * fc
    b = P[r0 + 1, c0] * (1 - fc) + P[r0 + 1, c1] * fc
    return a * (1 - fr) + b * fr


def resample(path, step):
    path = np.asarray(path, float)
    seg = np.linalg.norm(np.diff(path, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], max(int(s[-1] / step), 2))
    return np.stack([np.interp(t, s, path[:, k]) for k in range(3)], -1), t


def thread(name, pts, mat, col, radius=0.0028, dash=0.02, gap=0.011, step=0.0032, C=8, solid=False):
    """Stitch line: a thin tube whose radius pulses so it reads as separate stitches."""
    path, s = resample(pts, step)
    if solid:
        r = np.full(len(s), radius)
    else:
        m = (s % (dash + gap)) / dash
        r = radius * np.where(m <= 1, smoothstep(0, 0.2, m) * smoothstep(1.0, 0.8, m), 0.0)
    axis = np.zeros(3)
    axis[np.argmin(np.abs(unit(np.gradient(path, axis=0)).mean(0)))] = 1
    return add_mesh(name, tube(path, r, r, C, hint=axis), mat, col, caps=(True, True))


def add_batch(name, P4, mat, col):
    """Many independent open-ended tubes (L, R, C, 3) as one mesh; faces never cross between tubes."""
    L, R, C, _ = P4.shape
    idx = np.arange(L * R * C).reshape(L, R, C)
    r = np.arange(R - 1)[:, None]
    c = np.arange(C)[None, :]
    c1 = (c + 1) % C
    quads = np.stack([idx[:, r, c], idx[:, r, c1], idx[:, r + 1, c1], idx[:, r + 1, c]], -1)  # (L, R-1, C, 4)
    V = P4.reshape(-1, 3)
    q = quads.reshape(L, -1, 4)
    p0, p1, p2, p3 = (V[q[..., i]] for i in range(4))
    fn = np.cross(p2 - p0, p3 - p1)
    ctr = (p0 + p1 + p2 + p3) / 4 - P4.mean(axis=(1, 2))[:, None, :]
    flip = (fn * ctr).sum((1, 2)) < 0
    q = np.where(flip[:, None, None], q[..., ::-1], q).reshape(-1, 4)
    U = np.arange(C + 1) / C
    Vv = np.arange(R) / (R - 1)
    uv = np.stack(np.broadcast_arrays(U[None, :], Vv[:, None]), -1)
    quv = np.stack([uv[r, c], uv[r, c + 1], uv[r + 1, c + 1], uv[r + 1, c]], -2).reshape(-1, 4, 2)
    quv = np.broadcast_to(quv[None], (L,) + quv.shape).copy()
    quv = np.where(flip[:, None, None, None], quv[:, :, ::-1], quv).reshape(-1, 4, 2)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(V.tolist(), [], q.tolist())
    mesh.update()
    mesh.uv_layers.new(name='UVMap').data.foreach_set('uv', quv.astype(np.float32).ravel())
    mesh.shade_smooth()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    return obj


def rs(n, Q, lo=5):
    """Resolution scaled by the level-of-detail factor, never below `lo`."""
    return max(lo, int(round(n * Q)))
