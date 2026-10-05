"""Grassy's hair: thick strand-grooved locks swept over the scalp from a crown whorl.

Locks follow a flow field that radiates from the whorl at the back of the crown,
so the top sweeps forward into bangs, the sides fall past the ears and the back
spirals down to the nape. Each lock is a tapered crescent tube that lifts off the
scalp toward its tip, giving the layered, pointed silhouette of the reference.
"""
import numpy as np

from sculpt_head import skull
from sdf import round_cone, smax, smin, surface_y

CENTER = np.array([0.0, 0.05, 2.50])
RNG = np.random.default_rng(429)


def _grad(field, p, eps=1e-3):
    g = np.zeros_like(p)
    for i in range(3):
        e = np.zeros(3)
        e[i] = eps
        g[..., i] = (field(p + e) - field(p - e)) / (2 * eps)
    return g / np.linalg.norm(g, axis=-1, keepdims=True)


def _project(field, p, iters=6):
    for _ in range(iters):
        p = p - field(p)[..., None] * _grad(field, p)
    return p


def _extra(p):
    """Extra volume on the crown and sides; the face side of the head stays close."""
    front = np.clip((-p[..., 1] - 0.05) / 0.25, 0, 1)
    back = np.clip((p[..., 1] - 0.15) / 0.25, 0, 1)
    crown = np.clip((p[..., 2] - 2.70) / 0.25, 0, 1)
    side = np.clip((np.abs(p[..., 0]) - 0.2) / 0.15, 0, 1) * np.clip((p[..., 2] - 2.45) / 0.15, 0, 1)
    low = np.clip((p[..., 2] - 2.25) / 0.25, 0, 1)
    return ((0.045 - 0.02 * back) * low + 0.025 * side + 0.045 * crown) * (1 - 0.85 * front)


def _shell(offset):
    return lambda p: skull(p) - offset - _extra(p)


def _azimuth(p):
    """0 at the face (-Y), pi at the back."""
    return np.abs(np.arctan2(p[..., 0], -(p[..., 1] - CENTER[1])))


def hairline(az):
    """Lowest scalp height that grows hair, by azimuth."""
    return np.interp(az, [0, 0.6, 0.95, 1.45, 1.75, 2.2, np.pi], [2.76, 2.72, 2.60, 2.50, 2.32, 2.16, 2.12])


def tip_floor(az):
    """Locks may hang this low: above the brows in front, past the nape at the back."""
    return np.interp(az, [0, 0.7, 1.15, 1.35, 1.75, 2.0, 2.4, np.pi], [2.585, 2.56, 2.42, 2.43, 2.43, 2.24, 2.08, 2.05])


WHORL_DIR = np.array([0.04, 0.62, 0.62])
FRONT_PART = np.array([-0.05, -0.55, 0.85])


def _flow(p, n, whorl):
    away = p - whorl
    t = away - np.sum(away * n, -1, keepdims=True) * n
    t /= np.linalg.norm(t, axis=-1, keepdims=True) + 1e-9
    # Gentle clockwise swirl around the whorl seen from behind.
    swirl = np.cross(n, t)
    d = t + 0.42 * swirl * np.exp(-np.linalg.norm(away, axis=-1, keepdims=True) / 0.40)
    return d / np.linalg.norm(d, axis=-1, keepdims=True)


def _surface_point(field, direction):
    d = np.asarray(direction, float)
    d = d / np.linalg.norm(d)
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if field(CENTER + d * mid) < 0:
            lo = mid
        else:
            hi = mid
    return CENTER + d * lo


def _sample_roots(field, count, min_dist, region):
    """Blue-noise roots on the hair shell restricted by region(p)."""
    i = np.arange(count * 6) + 0.5
    phi = np.arccos(1 - 2 * i / (count * 6))
    theta = np.pi * (1 + 5 ** 0.5) * i
    dirs = np.stack([np.sin(phi) * np.cos(theta), np.sin(phi) * np.sin(theta), np.cos(phi)], -1)
    dirs = dirs[dirs[:, 2] > -0.45]
    pts = np.array([_surface_point(field, d) for d in dirs])
    pts = pts[region(pts)]
    RNG.shuffle(pts)
    keep = []
    for q in pts:
        if all(np.linalg.norm(q - k) >= min_dist for k in keep):
            keep.append(q)
        if len(keep) >= count:
            break
    return np.array(keep)


def _lock(field_at, root, whorl, length, width, thick, lift, gravity, bend=0.0, steps=34, ring=16):
    """March a lock over the shell, then sweep a tapered grooved crescent along it."""
    path = [root]
    p = root.copy()
    prev = None
    ds = length / (steps - 1)
    for i in range(1, steps):
        t = i / (steps - 1)
        field = field_at(t)
        n = _grad(field, p)
        d = _flow(p, n, whorl)
        down = np.array([0, 0, -1.0]) - n * n[2]
        down /= np.linalg.norm(down) + 1e-9
        d = d * (1 - gravity * t) + down * gravity * t
        # Sweep sideways into a comma shape.
        a = bend * t
        d = d * np.cos(a) + np.cross(n, d) * np.sin(a)
        if prev is not None:
            d = 0.55 * d + 0.45 * prev
        d -= n * np.dot(d, n)
        d /= np.linalg.norm(d)
        p = _project(field, p + d * ds, 3)
        # Lift the tip away from the scalp for a spiky outline.
        prev = d
        path.append(p.copy())
    path = np.array(path)
    ts = np.linspace(0, 1, steps)
    normals = np.array([_grad(field_at(t), q) for t, q in zip(ts, path)])
    path = path + normals * (lift * ts ** 2.2)[:, None]
    return path, normals, width, thick


def _sweep(path, normals, width, thick, ring=16):
    steps = len(path)
    ts = np.linspace(0, 1, steps)
    tang = np.gradient(path, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    side = np.cross(tang, normals)
    side /= np.linalg.norm(side, axis=1, keepdims=True)
    up = np.cross(side, tang)
    w = width * (0.80 + 0.35 * ts) * (1 - ts ** 1.7) ** 0.85
    w = np.maximum(w, 0.0015)
    th = thick * (1 - ts) ** 0.75 + 0.0012
    alpha = np.linspace(0, 2 * np.pi, ring, endpoint=False)
    ca, sa = np.cos(alpha), np.sin(alpha)
    verts = []
    for k in range(steps):
        x = 0.5 * w[k] * ca
        top = sa > 0
        y = 0.5 * th[k] * np.sign(sa) * np.abs(sa) ** 0.85 - 0.22 * th[k] * ca ** 2
        # Strand grooves along the lock's upper face.
        y = y + np.where(top, 0.12 * th[k] * np.cos(ca * np.pi * 3.0) * sa, 0)
        verts.append(path[k] + np.outer(x, side[k]) + np.outer(y, up[k]))
    verts = np.concatenate(verts)
    faces = []
    for k in range(steps - 1):
        for j in range(ring):
            a = k * ring + j
            b = k * ring + (j + 1) % ring
            faces.append((a, b, b + ring))
            faces.append((a, b + ring, a + ring))
    # Close the root with a fan; the tip is already a point.
    centre = len(verts)
    verts = np.vstack([verts, path[0]])
    for j in range(ring):
        faces.append((centre, (j + 1) % ring, j))
    uv = np.stack([np.tile(alpha / (2 * np.pi), steps), np.repeat(ts, ring)], 1)
    uv = np.vstack([uv, [0.5, 0.0]])
    return verts, np.array(faces), uv


def _cowlick():
    """Upright tuft at the front of the crown that sets the 3.10 top."""
    shell = _shell(0.06)
    locks = []
    for base, rise, sweep, width, thick in (
            ((-0.01, -0.20, 1.0), 0.15, (-0.14, 0.04), 0.11, 0.06),
            ((0.04, -0.14, 1.0), 0.10, (0.10, 0.08), 0.09, 0.05)):
        root = _surface_point(shell, base) - np.array([0, 0, 0.03])
        n = _grad(shell, root)
        t = np.linspace(0, 1, 24)[:, None]
        up = np.array([0, 0.02, 1.0])
        side = np.array([sweep[0], sweep[1], 0.0])
        path = root + up * rise * np.sin(t * np.pi * 0.5) + side * t ** 2 + n * 0.02 * t
        normals = np.tile(np.array([0, -0.6, 0.8]) / np.linalg.norm([0, -0.6, 0.8]), (len(t), 1))
        locks.append((path, normals, width, thick))
    return locks


# Art-directed bangs measured on the front master: (x, z) from crown to tip, width, thickness.
BANGS = [
    ([(-0.02, 2.97), (-0.06, 2.86), (-0.13, 2.74), (-0.22, 2.57)], 0.15, 0.065),
    ([(0.00, 2.97), (-0.03, 2.86), (-0.06, 2.72), (-0.08, 2.575)], 0.12, 0.06),
    ([(0.04, 2.96), (0.03, 2.86), (0.01, 2.74), (0.0, 2.63)], 0.09, 0.05),
    ([(0.05, 2.96), (0.08, 2.85), (0.14, 2.72), (0.18, 2.585)], 0.14, 0.065),
    ([(0.09, 2.95), (0.15, 2.86), (0.23, 2.74), (0.28, 2.61)], 0.14, 0.06),
    ([(0.15, 2.94), (0.24, 2.86), (0.33, 2.74), (0.40, 2.62)], 0.15, 0.06),
    ([(-0.08, 2.96), (-0.15, 2.88), (-0.26, 2.76), (-0.34, 2.61)], 0.15, 0.065),
    ([(-0.15, 2.95), (-0.26, 2.88), (-0.38, 2.76), (-0.46, 2.60)], 0.15, 0.06),
    ([(0.22, 2.93), (0.32, 2.86), (0.42, 2.74), (0.49, 2.64)], 0.13, 0.055),
]


def _bangs():
    from sdf import resample
    locks = []
    for ctrl, width, thick in BANGS:
        width, thick = width * 1.25, thick * 1.3
        pts = resample([(x, 0.0, z, 0.0) for x, z in ctrl], 30)
        ts = np.linspace(0, 1, len(pts))
        path, normals = [], []
        for t, (x, _, z, _) in zip(ts, pts):
            shell = _shell(0.035 + 0.025 * (1 - t))
            # Outer bangs leave the frontal silhouette: hug the side, then flare outward.
            xs = x
            while True:
                try:
                    q = np.array([xs, surface_y(shell, xs, z), z])
                    break
                except ValueError:
                    xs *= 0.97
            q[0] = x
            path.append(q)
            normals.append(_grad(shell, q))
        path = np.array(path)
        normals = np.array(normals)
        # Tips flick slightly off the forehead.
        path = path + normals * (0.035 * ts ** 2.0)[:, None]
        locks.append((path, normals, width, thick))
    return locks


def locks():
    whorl = _surface_point(_shell(0.05), WHORL_DIR)
    out = []
    add = out.append

    def grows(pts):
        return pts[:, 2] > hairline(_azimuth(pts)) + 0.03

    def in_bangs(q):
        return _azimuth(q[None])[0] < 0.85 and q[2] < 2.92

    # Rings of locks around the whorl: each ring's tips shingle over the next ring's roots.
    w_dir = WHORL_DIR / np.linalg.norm(WHORL_DIR)
    e1 = np.cross(w_dir, [0, 0, 1.0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(w_dir, e1)
    base = 0.035
    for k, r in enumerate(np.arange(0.10, 2.75, 0.18)):
        count = max(5, int(round(2 * np.pi * np.sin(r) * 0.47 / 0.13)))
        for j in range(count):
            phi = 2 * np.pi * (j + RNG.uniform(-0.2, 0.2)) / count + k * 2.39996
            d = np.cos(r) * w_dir + np.sin(r) * (np.cos(phi) * e1 + np.sin(phi) * e2)
            off = base + (0.008 if j % 2 else 0.0)
            root = _surface_point(_shell(off - 0.02), d)
            az = _azimuth(root[None])[0]
            if root[2] < hairline(az) + 0.02 or in_bangs(root):
                continue
            # Side locks flick outward below the crown; on top they stay on the dome.
            flare = (0.5 + 1.2 * np.sin(az) ** 2) * (1.0 if root[2] < 2.72 else 0.35)
            shape = (RNG.uniform(0.13, 0.17), RNG.uniform(0.06, 0.075), RNG.uniform(0.01, 0.05) * flare,
                     0.25 * (0.5 + 0.5 * az / np.pi), RNG.uniform(-0.7, 0.7))
            raise_tip = RNG.uniform(0.06, 0.12) * np.clip(1 - az / 0.9, 0, 1)
            rise = 0.05 * np.clip((root[2] - 2.2) / 0.4, 0.15, 1)
            field_at = (lambda o, g: (lambda t: _shell(o - 0.02 + g * t)))(off, rise)
            length = RNG.uniform(0.28, 0.36)
            while length > 0.09:
                lock = _lock(field_at, root, whorl, length, *shape)
                v = lock[0]
                if (v[:, 2] - 0.5 * shape[1] >= tip_floor(_azimuth(v)) + raise_tip - 0.01).all():
                    add(lock)
                    break
                length *= 0.85
    out.extend(_cowlick() + _bangs())
    # Crown: a few locks fan out of the whorl and lift slightly, as on the back view.
    shell = _shell(0.06)
    n = _grad(shell, whorl)
    e1 = np.cross(n, [1.0, 0, 0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(n, e1)
    for i in range(6):
        a = i / 6 * 2 * np.pi + 0.4
        root = _project(shell, whorl + 0.02 * (np.cos(a) * e1 + np.sin(a) * e2))
        field_at = lambda t: _shell(0.04 + 0.04 * t)
        out.append(_lock(field_at, root, whorl, RNG.uniform(0.2, 0.26), 0.13, 0.07, 0.05, 0.0, 0.35))
    return out


def _profile(ts, width):
    return width * (0.80 + 0.35 * ts) * (1 - ts ** 1.7) ** 0.85 + 0.003


def _lock_segment(q, a, b, n, ra, rb, flat):
    """Flattened, grooved round cone from a to b lying on normal n."""
    t = b - a
    t = t / np.linalg.norm(t)
    n = n - t * np.dot(n, t)
    n = n / np.linalg.norm(n)
    side = np.cross(t, n)
    rel = q - a
    cn = rel @ n
    cs = rel @ side
    ct = rel @ t
    squashed = a + ct[..., None] * t + cs[..., None] * side + (cn / flat)[..., None] * n
    if abs(ra - rb) >= np.linalg.norm(b - a):
        # One end swallows the other: the larger sphere is the segment.
        c, r = (a, ra) if ra > rb else (b, rb)
        d = (np.linalg.norm(squashed - c, axis=-1) - r) * (0.5 + 0.5 * flat)
    else:
        d = round_cone(squashed, a, b, ra, rb) * (0.5 + 0.5 * flat)
    # Strand grooves along the upper face.
    ang = np.arctan2(cn / flat, cs)
    r_local = np.clip(ra + (rb - ra) * np.clip(ct / np.linalg.norm(b - a), 0, 1), 0, None)
    return d + 0.16 * r_local * flat * (0.5 + 0.5 * np.cos(ang * 7)) * (cn > 0)


VOXEL_BOX = ((-0.62, -0.58, 2.00), (0.62, 0.66, 3.20))


def build_sdf(voxel):
    """All locks fused with the base volume into one sculpted hair surface."""
    from skimage import measure
    lo = np.array(VOXEL_BOX[0], np.float32)
    hi = np.array(VOXEL_BOX[1], np.float32)
    n = np.ceil((hi - lo) / voxel).astype(int) + 1
    axes = [lo[i] + np.arange(n[i], dtype=np.float32) * voxel for i in range(3)]
    vol = np.empty(n, np.float32)
    for z0 in range(0, n[2], 48):
        g = np.stack(np.meshgrid(axes[0], axes[1], axes[2][z0:z0 + 48], indexing='ij'), -1)
        vol[:, :, z0:z0 + 48] = cap_field(g)
    k = 0.006
    for path, normals, width, thick in locks():
        ts = np.linspace(0, 1, len(path))
        radius = _profile(ts, width) / 2
        flat = float(np.clip(thick / width * 1.5, 0.45, 0.8))
        # Fewer, longer segments keep the evaluation cheap without visible kinks.
        idx = np.unique(np.r_[np.arange(0, len(path), 3), len(path) - 1])
        for i0, i1 in zip(idx, idx[1:]):
            a, b = path[i0], path[i1]
            r0, r1 = radius[i0], radius[i1]
            pad = max(r0, r1) + k + 2 * voxel
            blo = np.maximum(((np.minimum(a, b) - pad - lo) / voxel).astype(int), 0)
            bhi = np.minimum(((np.maximum(a, b) + pad - lo) / voxel).astype(int) + 2, n)
            g = np.stack(np.meshgrid(axes[0][blo[0]:bhi[0]], axes[1][blo[1]:bhi[1]],
                                     axes[2][blo[2]:bhi[2]], indexing='ij'), -1)
            seg = _lock_segment(g, a, b, normals[i0], r0, r1, flat)
            sub = vol[blo[0]:bhi[0], blo[1]:bhi[1], blo[2]:bhi[2]]
            vol[blo[0]:bhi[0], blo[1]:bhi[1], blo[2]:bhi[2]] = smin(sub, seg, k)
    verts, faces, _, _ = measure.marching_cubes(vol, 0.0, spacing=(voxel,) * 3)
    verts = (verts + lo).astype(np.float32)
    return verts, faces[:, ::-1].astype(np.int32), strand_colors(verts)


def strand_colors(verts):
    """Per-vertex strand streaks and root-to-tip shading, so exported mesh hair reads as strands."""
    from scipy.spatial import cKDTree
    pts, sides, widths, ts, seeds = [], [], [], [], []
    rng = np.random.default_rng(5)
    for i, (path, normals, width, thick) in enumerate(locks()):
        t = np.linspace(0, 1, len(path))
        tang = np.gradient(path, axis=0)
        tang /= np.linalg.norm(tang, axis=1, keepdims=True)
        side = np.cross(tang, normals)
        side /= np.linalg.norm(side, axis=1, keepdims=True)
        pts.append(path)
        sides.append(side)
        widths.append(_profile(t, width))
        ts.append(t)
        seeds.append(np.full(len(path), rng.uniform(0, 6.28)))
    pts, sides = np.concatenate(pts), np.concatenate(sides)
    widths, ts, seeds = np.concatenate(widths), np.concatenate(ts), np.concatenate(seeds)
    dist, idx = cKDTree(pts).query(verts)
    u = np.sum((verts - pts[idx]) * sides[idx], 1) / (widths[idx] / 2 + 1e-4)
    streak = 0.5 + 0.25 * np.sin(u * np.pi * 4.5 + seeds[idx]) + 0.25 * np.sin(u * np.pi * 11 + 2 * seeds[idx])
    near = np.clip(1 - dist / 0.06, 0, 1)
    base = np.array([0.030, 0.015, 0.009])
    light = np.array([0.105, 0.055, 0.034])
    # Deep gaps between clumps stay dark; clump faces carry lighter streaks toward the tips.
    depth = np.clip((skull(verts.astype(np.float64)) - 0.03) / 0.08, 0, 1)
    k = np.clip(near * (0.35 + 0.65 * streak) * (0.55 + 0.45 * ts[idx]) * (0.4 + 0.6 * depth), 0, 1)
    col = base[None] * (1 - k[:, None]) + light[None] * k[:, None]
    return np.concatenate([col, np.ones((len(col), 1))], 1).astype(np.float32)


def cap_field(p):
    """Dark base volume under the locks so no scalp shows between them."""
    shell = skull(p) - 0.025 - 0.7 * _extra(p)
    az = _azimuth(p)
    cut = hairline(az) + 0.01 - p[..., 2]
    return smax(shell, cut, 0.03)


CAP_BOX = ((-0.50, -0.48, 2.05), (0.50, 0.58, 3.02))
