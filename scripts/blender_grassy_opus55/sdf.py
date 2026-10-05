"""Signed-distance sculpting helpers: blend soft primitives, then polygonize.

Coordinates match Blender: Z up, the character faces -Y, units are world tiles.
"""
import numpy as np


def ellipsoid(p, c, r):
    q = (p - np.asarray(c, dtype=np.float32)) / np.asarray(r, dtype=np.float32)
    k0 = np.linalg.norm(q, axis=-1)
    k1 = np.linalg.norm(q / np.asarray(r, dtype=np.float32), axis=-1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


def sphere(p, c, r):
    return np.linalg.norm(p - np.asarray(c, dtype=np.float32), axis=-1) - r


def round_cone(p, a, b, ra, rb):
    """Capsule whose radius blends from ra at a to rb at b."""
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    ba = b - a
    l2 = float(ba @ ba)
    rr = ra - rb
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = p - a
    y = pa @ ba
    z = y - l2
    x = pa * l2 - y[..., None] * ba
    x2 = np.sum(x * x, axis=-1)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d_a = np.sqrt(x2 + y2) * il2 - ra
    d_b = np.sqrt(x2 + z2) * il2 - rb
    d_m = (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra
    out = d_m
    out = np.where(np.sign(z) * a2 * z2 > k, d_b, out)
    out = np.where(np.sign(y) * a2 * y2 < k, d_a, out)
    return out


def capsule(p, a, b, r):
    return round_cone(p, a, b, r, r)


def round_box(p, c, half, r):
    q = np.abs(p - np.asarray(c, dtype=np.float32)) - (np.asarray(half, dtype=np.float32) - r)
    return np.linalg.norm(np.maximum(q, 0.0), axis=-1) + np.minimum(np.max(q, axis=-1), 0.0) - r


def torus_z(p, c, R, r):
    q = p - np.asarray(c, dtype=np.float32)
    ring = np.sqrt(q[..., 0] ** 2 + q[..., 1] ** 2) - R
    return np.sqrt(ring ** 2 + q[..., 2] ** 2) - r


def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def union(*ds, k):
    out = ds[0]
    for d in ds[1:]:
        out = smin(out, d, k)
    return out


def rotate(p, center, axis, degrees):
    """Rotate sample points about a world axis (inverse transform of the shape)."""
    c = np.asarray(center, dtype=np.float32)
    a = np.radians(-degrees)
    q = p - c
    i, j = {'x': (1, 2), 'y': (2, 0), 'z': (0, 1)}[axis]
    qi = q[..., i] * np.cos(a) - q[..., j] * np.sin(a)
    qj = q[..., i] * np.sin(a) + q[..., j] * np.cos(a)
    q = q.copy()
    q[..., i] = qi
    q[..., j] = qj
    return q + c


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def polygonize(field, lo, hi, voxel, chunk=48):
    """Sample field(points)->distance on a grid and run marching cubes."""
    from skimage import measure  # only the sculpt step needs it, not Blender
    lo = np.asarray(lo, dtype=np.float32)
    hi = np.asarray(hi, dtype=np.float32)
    n = np.ceil((hi - lo) / voxel).astype(int) + 1
    xs = lo[0] + np.arange(n[0], dtype=np.float32) * voxel
    ys = lo[1] + np.arange(n[1], dtype=np.float32) * voxel
    zs = lo[2] + np.arange(n[2], dtype=np.float32) * voxel
    vol = np.empty((n[0], n[1], n[2]), dtype=np.float32)
    for start in range(0, n[2], chunk):
        zc = zs[start:start + chunk]
        g = np.stack(np.meshgrid(xs, ys, zc, indexing='ij'), axis=-1)
        vol[:, :, start:start + len(zc)] = field(g)
    if vol.min() >= 0 or vol.max() <= 0:
        raise ValueError(f'surface not inside sampling box {lo}..{hi}')
    for axis in range(3):
        if (np.take(vol, 0, axis) <= 0).any() or (np.take(vol, -1, axis) <= 0).any():
            raise ValueError(f'surface touches sampling box on axis {axis}: {lo}..{hi}')
    verts, faces, _, _ = measure.marching_cubes(vol, 0.0, spacing=(voxel, voxel, voxel))
    verts += lo
    # marching_cubes winds faces so normals point toward lower values (inside); flip to outward.
    return verts.astype(np.float32), faces[:, ::-1].astype(np.int32)


def surface_y(field, x, z, y0=-0.7, y1=0.3, steps=2000):
    """Front-most surface depth along -Y at (x, z), for placing facial features."""
    ys = np.linspace(y0, y1, steps, dtype=np.float32)
    pts = np.stack([np.full_like(ys, x), ys, np.full_like(ys, z)], axis=-1)
    d = field(pts)
    inside = np.nonzero(d <= 0)[0]
    if len(inside) == 0:
        raise ValueError(f'no surface at x={x} z={z}')
    i = inside[0]
    return float(ys[i - 1] + (ys[i] - ys[i - 1]) * d[i - 1] / (d[i - 1] - d[i]))


def resample(points, n):
    """Catmull-Rom through control tuples (x, y, z, radius) -> n smooth samples."""
    pts = np.asarray(points, dtype=np.float64)
    ext = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
    out = []
    segs = len(pts) - 1
    for i in range(n):
        t = i / (n - 1) * segs
        k = min(int(t), segs - 1)
        u = t - k
        p0, p1, p2, p3 = ext[k], ext[k + 1], ext[k + 2], ext[k + 3]
        out.append(0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    return [tuple(float(v) for v in o) for o in out]
