"""Grassy's clothes and limbs, sized from turnaround-master-v2.

Sweater hem 1.26-1.34, cuffs 1.24-1.34, jeans waist 1.32, crotch ~1.0,
rolled cuffs 0.30-0.40, shoes 0-0.28, toe at y -0.43 and heel at +0.24.
"""
import numpy as np

from sdf import ellipsoid, round_cone, round_box, capsule, smin, smax, rotate, smoothstep


def _ring_coord(p, a, b):
    """Distance along segment a->b and angle around it, for folds and ribs."""
    a = np.asarray(a, np.float32)
    b = np.asarray(b, np.float32)
    axis = (b - a) / np.linalg.norm(b - a)
    q = p - a
    s = q @ axis
    radial = q - s[..., None] * axis
    ref = np.cross(axis, [0, 1.0, 0]) if abs(axis[1]) < 0.9 else np.cross(axis, [1.0, 0, 0])
    ref = ref / np.linalg.norm(ref)
    ang = np.arctan2(radial @ np.cross(axis, ref), radial @ ref)
    return s, ang


def _ribs(ang, count, depth):
    return depth * (0.5 + 0.5 * np.cos(ang * count))


def _ellip_band(p, c, rx, ry, z0, z1, round_r):
    """Elliptic tube between heights z0..z1 (approximate distance)."""
    x = (p[..., 0] - c[0]) / rx
    y = (p[..., 1] - c[1]) / ry
    radial = (np.sqrt(x * x + y * y) - 1) * min(rx, ry)
    vertical = np.maximum(z0 - p[..., 2], p[..., 2] - z1)
    q0 = np.maximum(radial + round_r, 0)
    q1 = np.maximum(vertical + round_r, 0)
    return np.sqrt(q0 * q0 + q1 * q1) + np.minimum(np.maximum(radial, vertical) + round_r, 0) - round_r


# ---------------------------------------------------------------- sweater

SHOULDER = 0.30
ARM = [((0.30, 0.0, 1.875), 0.110), ((0.43, -0.005, 1.58), 0.106), ((0.522, -0.015, 1.385), 0.114)]
CUFF = ((0.535, -0.015, 1.345), (0.552, -0.018, 1.235), 0.086)
HEM = (1.255, 1.345)


def _sleeve(p, s):
    pts = [((s * x, y, z), r) for (x, y, z), r in ARM]
    d = None
    for (a, ra), (b, rb) in zip(pts, pts[1:]):
        seg = round_cone(p, a, b, ra, rb)
        d = seg if d is None else smin(d, seg, 0.05)
    # Sleeve blouses over the cuff.
    d = smin(d, ellipsoid(p, (s * 0.525, -0.015, 1.395), (0.12, 0.118, 0.075)), 0.04)
    # Soft folds: rings that wander around the elbow and above the cuff.
    sa, ang = _ring_coord(p, pts[0][0], CUFF[0] if s > 0 else (-CUFF[0][0], *CUFF[0][1:]))
    wobble = 0.9 * np.sin(ang * 2 + 0.7 * s) + 0.4 * np.sin(ang * 3 + 1.9)
    phase = 2 * np.pi * sa / 0.11 + wobble
    window = smoothstep(0.20, 0.30, sa) * (1 - smoothstep(0.36, 0.42, sa)) + smoothstep(0.44, 0.50, sa)
    d = d - 0.004 * np.sin(phase) * window
    a, b, r = CUFF
    cuff_a, cuff_b = (s * a[0], a[1], a[2]), (s * b[0], b[1], b[2])
    cuff = round_cone(p, cuff_a, cuff_b, r, r * 0.98)
    _, cang = _ring_coord(p, cuff_a, cuff_b)
    cuff = cuff - _ribs(cang, 40, 0.0055)
    return smin(d, cuff, 0.012)


def sweater_field(p):
    chest = ellipsoid(p, (0, -0.005, 1.70), (0.265, 0.235, 0.30))
    belly = ellipsoid(p, (0, -0.03, 1.47), (0.30, 0.255, 0.22))
    yoke = ellipsoid(p, (0, 0.005, 1.87), (0.24, 0.19, 0.11))
    shoulders = capsule(p, (-0.235, 0.005, 1.86), (0.235, 0.005, 1.86), 0.095)
    d = smin(chest, belly, 0.12)
    d = smin(d, yoke, 0.08)
    d = smin(d, shoulders, 0.08)
    # Body tucks into the narrower ribbed hem.
    d = smax(d, HEM[1] - 0.01 - p[..., 2], 0.02)
    for s in (-1, 1):
        d = smin(d, _sleeve(p, s), 0.06)
    hem = _ellip_band(p, (0, -0.025, 0), 0.292, 0.242, HEM[0], HEM[1], 0.018)
    ang = np.arctan2(p[..., 1] + 0.025, p[..., 0])
    hem = hem - _ribs(ang, 130, 0.006)
    d = smin(d, hem, 0.015)
    # Ribbed crew collar, lower at the front.
    q = rotate(p, (0, 0.0, 1.96), 'x', 12)
    ring = np.sqrt(q[..., 0] ** 2 + (q[..., 1] - 0.005) ** 2)
    collar = np.sqrt((ring - 0.146) ** 2 + ((q[..., 2] - 1.972) * 0.8) ** 2) - 0.027
    cang = np.arctan2(q[..., 1], q[..., 0])
    collar = collar - _ribs(cang, 70, 0.0035)
    d = smin(d, collar, 0.02)
    neck_hole = np.sqrt(q[..., 0] ** 2 + (q[..., 1] - 0.005) ** 2) - 0.13
    d = smax(d, -np.maximum(neck_hole, 1.87 - q[..., 2]), 0.01)
    return d


# ---------------------------------------------------------------- hands

def _hand_local(q):
    """Left-side hand in local frame: wrist at origin, fingers toward -z,
    palm facing +x (the thigh), thumb toward -y (forward)."""
    palm = round_box(q, (0.0, 0.0, -0.085), (0.034, 0.068, 0.07), 0.03)
    palm = smin(palm, ellipsoid(q, (0.005, -0.03, -0.085), (0.04, 0.05, 0.06)), 0.03)  # thenar pad
    wrist = round_cone(q, (0, 0, 0.05), (0, 0, -0.03), 0.052, 0.05)
    d = smin(palm, wrist, 0.03)
    # Fingers: index (front) .. little (back), slightly curled toward the palm.
    for i, (y, length, r) in enumerate(((-0.048, 0.125, 0.0205), (-0.016, 0.137, 0.021),
                                         (0.016, 0.130, 0.020), (0.046, 0.108, 0.0175))):
        base = np.array([0.0, y, -0.148])
        segs = (0.42, 0.33, 0.25)
        angles = (12 + i * 2, 28 + i * 3, 24 + i * 2)
        heading = np.radians(-4 + i * 3)  # little fingers splay back a little
        pt = base
        tilt = 0.0
        rr = r
        for frac, ang in zip(segs, angles):
            tilt += np.radians(ang)
            step = length * frac
            nxt = pt + step * np.array([np.sin(tilt), np.sin(heading) * 0.3, -np.cos(tilt)])
            d = smin(d, round_cone(q, pt, nxt, rr, rr * 0.9), 0.012)
            pt, rr = nxt, rr * 0.9
    # Thumb from the forward edge of the palm, pointing down and toward the thigh.
    t0 = np.array([0.012, -0.058, -0.05])
    t1 = t0 + np.array([0.02, -0.03, -0.055])
    t2 = t1 + np.array([0.022, -0.006, -0.05])
    d = smin(d, round_cone(q, t0, t1, 0.026, 0.022), 0.02)
    d = smin(d, round_cone(q, t1, t2, 0.022, 0.019), 0.01)
    return d


def hands_field(p):
    d = None
    for s in (-1, 1):
        wrist = np.array([s * 0.552, -0.018, 1.255])
        q = p - wrist
        q = q.copy()
        q[..., 0] *= -s  # local +x points at the thigh on both sides
        # Hang along the forearm and turn the palm toward the thigh.
        q = rotate(q, (0, 0, 0), 'y', 8)
        q = rotate(q, (0, 0, 0), 'z', 35)
        h = _hand_local(q / 1.18) * 1.18
        d = h if d is None else np.minimum(d, h)
    return d


# ---------------------------------------------------------------- jeans

LEG_TOP = (0.165, 0.0, 1.06)
LEG_BOTTOM = (0.245, -0.012, 0.42)


def _scaled_y(p, k):
    q = p.copy()
    q[..., 1] = q[..., 1] * k
    return q


def jeans_field(p):
    hips = ellipsoid(p, (0, 0.0, 1.20), (0.315, 0.235, 0.17))
    seat = ellipsoid(p, (0, 0.06, 1.13), (0.27, 0.20, 0.14))
    d = smin(hips, seat, 0.06)
    q = _scaled_y(p, 0.88)
    for s in (-1, 1):
        a = (s * LEG_TOP[0], LEG_TOP[1] * 0.88, LEG_TOP[2])
        b = (s * LEG_BOTTOM[0], LEG_BOTTOM[1] * 0.88, LEG_BOTTOM[2])
        leg = round_cone(q, b, a, 0.160, 0.178)
        sa, ang = _ring_coord(p, (s * LEG_BOTTOM[0], LEG_BOTTOM[1], LEG_BOTTOM[2]),
                              (s * LEG_TOP[0], LEG_TOP[1], LEG_TOP[2]))
        # Denim stacks in soft creases above the cuff and behind the knee.
        wob = 1.1 * np.sin(ang * 2 + s) + 0.5 * np.sin(ang * 3 + 2.0)
        crease = np.sin(2 * np.pi * sa / 0.085 + wob)
        window = (1 - smoothstep(0.10, 0.22, sa)) + 0.6 * smoothstep(0.30, 0.36, sa) * (1 - smoothstep(0.42, 0.48, sa))
        leg = leg - 0.0038 * crease * window
        d = smin(d, leg, 0.07)
        # Rolled cuff: a fat band with a soft lip at each edge.
        c0, c1 = (s * 0.248, -0.012, 0.300), (s * 0.247, -0.012, 0.400)
        cuff = round_cone(_scaled_y(p, 0.9), (c0[0], c0[1] * 0.9, c0[2]), (c1[0], c1[1] * 0.9, c1[2]), 0.183, 0.185)
        cuff = smin(cuff, _torus_at(p, c1, 0.168, 0.02), 0.01)
        cuff = smin(cuff, _torus_at(p, c0, 0.168, 0.02), 0.01)
        d = smin(d, cuff, 0.012)
    d = smax(d, p[..., 2] - 1.335, 0.02)
    return np.maximum(d, 0.29 - p[..., 2])


def _torus_at(p, c, R, r):
    q = p - np.asarray(c, np.float32)
    ring = np.sqrt(q[..., 0] ** 2 + (q[..., 1] / 0.9) ** 2) - R
    return np.sqrt(ring ** 2 + q[..., 2] ** 2) - r


# ---------------------------------------------------------------- shoes and ankles

SHOE_CENTER = (0.262, -0.095)
TOE_OUT = 7.0


SHOE_TOP_Y = [-0.34, -0.30, -0.24, -0.16, -0.06, 0.04, 0.10, 0.16, 0.24, 0.34]
SHOE_TOP_Z = [0.075, 0.125, 0.150, 0.160, 0.198, 0.232, 0.215, 0.205, 0.245, 0.255]


def shoe_top(y):
    return np.interp(y, SHOE_TOP_Y, SHOE_TOP_Z)


def _plan(q, grow):
    """Rounded sneaker outline in x/y, a little wider across the ball of the foot."""
    y = q[..., 1]
    half_w = 0.132 + 0.014 * np.clip(-y / 0.25, -1, 1) + grow
    x = q[..., 0] / half_w * 0.12
    half = np.array([0.12, 0.33 + grow])
    r = 0.118
    dx = np.abs(x) - (half[0] - r)
    dy = np.abs(y + 0.005) - (half[1] - r)
    return np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dy, 0) ** 2) + np.minimum(np.maximum(dx, dy), 0) - r


def _shoe_local(q):
    """Low-top court sneaker, toe toward -y, sole on z=0."""
    z = q[..., 2]
    upper = smax(_plan(q, 0.0), z - shoe_top(q[..., 1]), 0.05)
    upper = smax(upper, 0.04 - z, 0.01)
    tongue = ellipsoid(q, (0, -0.005, 0.228), (0.068, 0.105, 0.04))
    upper = smin(upper, tongue, 0.025)
    opening = ellipsoid(q, (0, 0.125, 0.30), (0.083, 0.125, 0.085))
    upper = smax(upper, -opening, 0.015)
    sole = smax(_plan(q, 0.008), np.maximum(z - 0.062, -z), 0.012)
    d = smin(sole, upper, 0.006)
    for yy in (-0.11, -0.06, -0.01):
        zz = shoe_top(yy) + 0.006
        d = smin(d, capsule(q, (-0.058, yy + 0.012, zz), (0.058, yy - 0.012, zz), 0.0085), 0.004)
    return d


def _shoe_q(p, s):
    q = p - np.array([s * SHOE_CENTER[0], SHOE_CENTER[1], 0.0], np.float32)
    q = rotate(q, (0, 0, 0), 'z', -s * TOE_OUT)
    q = q.copy()
    q[..., 0] *= s
    return q


def shoes_field(p):
    return np.minimum(_shoe_local(_shoe_q(p, -1)), _shoe_local(_shoe_q(p, 1)))


def shoe_local_coords(v):
    """Per-vertex local shoe coordinates for colour zones (x outward, toe -y)."""
    side = np.where(v[:, 0] >= 0, 1.0, -1.0)
    q = v - np.stack([side * SHOE_CENTER[0], np.full(len(v), SHOE_CENTER[1]), np.zeros(len(v))], 1)
    a = np.radians(side * TOE_OUT)
    x = q[:, 0] * np.cos(a) - q[:, 1] * np.sin(a)
    y = q[:, 0] * np.sin(a) + q[:, 1] * np.cos(a)
    return np.stack([x * side, y, q[:, 2]], 1)


def ankles_field(p):
    d = None
    for s in (-1, 1):
        a = capsule(p, (s * 0.255, 0.04, 0.14), (s * 0.25, 0.01, 0.42), 0.068)
        d = a if d is None else np.minimum(d, a)
    return d


SWEATER_BOX = ((-0.72, -0.34, 1.12), (0.72, 0.32, 2.10))
HANDS_BOX = ((-0.76, -0.24, 0.78), (0.76, 0.20, 1.42))
JEANS_BOX = ((-0.50, -0.30, 0.27), (0.50, 0.32, 1.36))
SHOES_BOX = ((-0.50, -0.50, -0.02), (0.50, 0.32, 0.34))
ANKLES_BOX = ((-0.36, -0.06, 0.05), (0.36, 0.12, 0.51))
