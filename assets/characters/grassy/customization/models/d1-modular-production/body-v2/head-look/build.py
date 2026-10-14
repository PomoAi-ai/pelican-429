"""Move the head's painted eyes onto separate blinkable eye patches, thin the brows and redraw the full lips as the concept's
smile line; the hair (../hair-v2) passes through unchanged. The head surface (../head-shape) keeps its positions and UVs;
the eye patches are appended as extra faces with their own material."""
import sys
from pathlib import Path
import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

OUT = Path(__file__).resolve().parent
MODELS = OUT.parents[1]
ROOT = OUT.parents[7]
sys.path.insert(0, str(ROOT / 'scripts/character_customization'))
from inspect_standalone_head import bounds, setup_scene

LASH = np.array([.13, .065, .05])
# Shadow the upper lid casts on the eye white; the white itself is pure white so the shader can use it as the iris shade.
SCLERA_SHADOW = np.array([.70, .74, .86])
# Concept brows are thin warm brown arcs. The runtime skin shader lifts red texels above linear red 0.25 toward white,
# so the brow sits just above it and is only lifted a little.
BROW = np.array([.58, .27, .14])
# The brow is redrawn along a quadratic fitted to the generated stroke: half-width BROW_WIDTH (head units) near the
# inner end, thinning to BROW_TIP of that at the outer end.
BROW_WIDTH, BROW_TIP = .016, .35
# The generated full lips become the concept's thin smile line (head units, arc length x and height z round the mouth):
# lips are the texels redder than skin by LIP_RED in MOUTH_BOX; the line spans the middle MOUTH_WIDTH of them and rises
# SMILE at its ends. The line colour stays under the shader lift threshold.
MOUTH_BOX = (.22, .45, .7)
LIP_RED = .3
MOUTH_WIDTH, SMILE, MOUTH_LINE = .8, .02, .011
MOUTH = np.array([.45, .17, .14])
# The concept's eyes are larger; the patches grow by EYE_SCALE round their centre. They stay over the sculpted eye sockets:
# moved off them, the patch drapes onto the cheek.
EYE_SCALE = 1.08
# Pink blush under each eye (eye space centre and radii, peak opacity), as in the concept.
BLUSH = np.array([.98, .55, .55])
BLUSH_AT, BLUSH_SIZE, BLUSH_ALPHA = (.2, -2.2), (1.2, .6), .45
FLAT_NORMAL = np.array([.5, .5, 1.])
# Eye space is iris-normalised: u toward the outer corner, v up. Patch extent (u0, u1, v0, v1); the shader in
# src/render/grassy/d1-anime-material.ts uses the same extent to recover iris coordinates from the patch UV.
EYE_EXTENT = (-2.2, 2.5, -1.5, 1.8)
# One atlas quadrant per blink frame. The frames are drawn with gpt-image-2.5 from source-eye.png (eye-frames/prompts.txt)
# on a 1536x1024 canvas whose middle 1396 px span eye-space u -1.6..2.9 and the full height v -1.5..1.8 (the patch extent
# when they were drawn).
FRAMES = ('open', 'half', 'mostly', 'closed')
CANVAS = (1536, 1024)
CANVAS_EYE_WIDTH = 1396
CANVAS_U = (-1.6, 2.9)
EYE_CELL = 512
EYE_GRID = (160, 64)
# Paint-out area around each old eye (eye space, wider than the patch) and its fill grid size.
FILL_EXTENT = (-2.4, 3.6, -2.4, 2.4)
FILL_GRID = 256
# Patch offset along the surface normal (head units, head height 1.9): clear of depth fighting, invisible from the side.
EYE_LIFT = .004

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(MODELS / 'body-v2/hair-v2/head-hair.glb'))
head = bpy.data.objects['Head']
hair = bpy.data.objects['Hair']


def image_of(material, socket):
    principled = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node = principled.inputs[socket].links[0].from_node
    if node.type == 'NORMAL_MAP':
        node = node.inputs['Color'].links[0].from_node
    return node.image


def pixels(image):
    w, h = image.size
    data = np.empty(w * h * 4, np.float32)
    image.pixels.foreach_get(data)
    return data.reshape(h, w, 4)


def store(image, data, name):
    path = OUT / name
    image.pixels.foreach_set(data.ravel())
    image.filepath_raw = str(path)
    image.file_format = 'PNG'
    image.save()
    # Swap in a fresh datablock loaded from the PNG so the export packs the repainted bytes, not the imported original.
    fresh = bpy.data.images.load(str(path))
    fresh.colorspace_settings.name = image.colorspace_settings.name
    fresh.pack()
    image.user_remap(fresh)
    bpy.data.images.remove(image)
    return fresh


def texel_positions(obj, size):
    """World position of every texel covered by the mesh UVs (rasterised triangles); NaN elsewhere."""
    mesh = obj.data
    mesh.calc_loop_triangles()
    w, h = size
    uv = np.empty(len(mesh.loops) * 2, np.float32)
    mesh.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2) * (w, h)
    co = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get('co', co)
    world = np.array(obj.matrix_world)
    co = co.reshape(-1, 3) @ world[:3, :3].T + world[:3, 3]
    tri_loops = np.empty(len(mesh.loop_triangles) * 3, np.int32)
    mesh.loop_triangles.foreach_get('loops', tri_loops)
    tri_loops = tri_loops.reshape(-1, 3)
    loop_vert = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get('vertex_index', loop_vert)
    out = np.full((h, w, 3), np.nan, np.float32)
    for loops in tri_loops:
        a, b, c = uv[loops]
        x0, y0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
        x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
        xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, w - 1) + 1), np.arange(max(y0, 0), min(y1, h - 1) + 1))
        p = np.stack([xs + .5, ys + .5], -1).reshape(-1, 2)
        m = np.array([b - a, c - a]).T
        if abs(np.linalg.det(m)) < 1e-9:
            continue
        l = np.linalg.solve(m, (p - a).T).T
        inside = (l[:, 0] >= -1e-4) & (l[:, 1] >= -1e-4) & (l.sum(1) <= 1 + 1e-4)
        if not inside.any():
            continue
        l = l[inside]
        v = co[loop_vert[loops]]
        pos = v[0] + l[:, :1] * (v[1] - v[0]) + l[:, 1:] * (v[2] - v[0])
        q = p[inside].astype(int)
        out[q[:, 1], q[:, 0]] = pos
    return out


head_material = head.data.materials[0]
diffuse_image = image_of(head_material, 'Base Color')
normal_image = image_of(head_material, 'Normal')
diffuse = pixels(diffuse_image)
normal = pixels(normal_image)
rgb = diffuse[..., :3]
pos = texel_positions(head, diffuse_image.size)
# Eye work uses arc length around the head's vertical axis instead of x: the outer eye corners wrap round the side of the face,
# where a front projection would sample them in long smears. Front is -Y, so the angle is measured from -Y toward +X.
corners = np.array([v.co[:] for v in head.data.vertices])
axis_x, axis_y = (corners[:, 0].min() + corners[:, 0].max()) / 2, (corners[:, 1].min() + corners[:, 1].max()) / 2
radius = (corners[:, 0].max() - corners[:, 0].min()) / 2
pos[..., 0] = radius * np.arctan2(pos[..., 0] - axis_x, axis_y - pos[..., 1])
valid = ~np.isnan(pos[..., 0])
source = diffuse.copy()
blue = valid & (rgb[..., 2] > rgb[..., 0] + .25) & (rgb[..., 2] > .3)
dark = valid & (rgb.max(-1) < .06)
eyes = {}
brows = []
for side, sign in [('left', -1), ('right', 1)]:
    iris = blue & (pos[..., 0] * sign > 0)
    p = pos[iris | (dark & (np.abs(pos[..., 0] - np.median(pos[iris][:, 0])) < .08) & (np.abs(pos[..., 2] - np.median(pos[iris][:, 2])) < .08))]
    lo, hi = np.percentile(p, .5, 0), np.percentile(p, 99.5, 0)
    center = (lo + hi) / 2
    rx, rz = (hi[0] - lo[0]) / 2, (hi[2] - lo[2]) / 2
    brow_zone = valid & (np.abs(pos[..., 0] - center[0]) < rx * 2.4) & (pos[..., 2] > center[2] + rz * 1.3) & (pos[..., 2] < center[2] + rz * 3.4) & (pos[..., 1] < center[1] + .1)
    brow = brow_zone & (rgb.mean(-1) < .42) & (rgb[..., 0] > rgb[..., 2])
    brows.append(brow)
    eyes[side] = {'sign': sign, 'center': center, 'radius': (rx, rz), 'irisTexels': int(iris.sum()), 'browTexels': int(brow.sum())}


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def blur(image, radius):
    """Two box-blur passes per axis (edge-clamped), close to a Gaussian of the same radius."""
    for _ in range(2):
        for axis in (0, 1):
            n = image.shape[axis]
            padded = np.concatenate([np.repeat(image.take([0], axis), radius + 1, axis), image, np.repeat(image.take([-1], axis), radius, axis)], axis)
            total = np.cumsum(padded, axis)
            image = (total.take(range(2 * radius + 1, 2 * radius + 1 + n), axis) - total.take(range(n), axis)) / (2 * radius + 1)
    return image


def flood(seed, mask):
    """Part of mask 4-connected to seed."""
    region = seed & mask
    while True:
        grown = region.copy()
        grown[1:] |= region[:-1]; grown[:-1] |= region[1:]; grown[:, 1:] |= region[:, :-1]; grown[:, :-1] |= region[:, 1:]
        grown &= mask
        if (grown == region).all():
            return region
        region = grown


def pushpull(image, known):
    """Fill unknown pixels from known ones: average down a pyramid, then push the coarse values back up."""
    if min(known.shape) == 1:
        return np.broadcast_to(image[known].mean(0), image.shape).copy()
    h, w = known.shape
    weight = known.reshape(h // 2, 2, w // 2, 2).sum((1, 3))
    coarse = (image * known[..., None]).reshape(h // 2, 2, w // 2, 2, -1).sum((1, 3)) / np.maximum(weight, 1)[..., None]
    up = pushpull(coarse, weight > 0).repeat(2, 0).repeat(2, 1)
    up = np.dstack([blur(up[..., c], 1) for c in range(up.shape[-1])])
    return np.where(known[..., None], image, up)


def bilinear(image, uv):
    """Sample a bottom-up Blender pixel array at UVs; u wraps because the right eye crosses the u=0 seam."""
    h, w = image.shape[:2]
    x = (uv[..., 0] % 1) * w - .5
    y = np.clip(uv[..., 1] * h - .5, 0, h - 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    x1, y1 = (x0 + 1) % w, np.minimum(y0 + 1, h - 1)
    x0 %= w
    return (image[y0, x0] * (1 - fx) + image[y0, x1] * fx) * (1 - fy) + (image[y1, x0] * (1 - fx) + image[y1, x1] * fx) * fy


# Brows and mouth are repainted over a skin fill. The fill runs on an (arc length, height) grid around each
# feature, from skin-coloured texels only: neighbouring UV islands hold eye and lip colours.
FEATURE_GRID = 128
paint = np.zeros(valid.shape, bool)
ink = np.zeros(valid.shape)
ink_color = np.zeros(rgb.shape)
skin = valid & (rgb.mean(-1) > .7) & (rgb[..., 0] - rgb[..., 2] > .08) & (rgb[..., 0] - rgb[..., 1] < LIP_RED)


def repaint(region, cover, color):
    ys, xs = np.nonzero(region)
    a, h = pos[ys, xs, 0], pos[ys, xs, 2]
    a0, a1, h0, h1 = a.min() - .05, a.max() + .05, h.min() - .05, h.max() + .05
    near = skin & ~region & (pos[..., 1] < 0) & (pos[..., 0] > a0) & (pos[..., 0] < a1) & (pos[..., 2] > h0) & (pos[..., 2] < h1)
    cell = lambda a, h: (np.minimum(((h1 - h) / (h1 - h0) * FEATURE_GRID).astype(int), FEATURE_GRID - 1), np.minimum(((a - a0) / (a1 - a0) * FEATURE_GRID).astype(int), FEATURE_GRID - 1))
    total = np.zeros((FEATURE_GRID, FEATURE_GRID, 3))
    count = np.zeros((FEATURE_GRID, FEATURE_GRID))
    rows, cols = cell(pos[..., 0][near], pos[..., 2][near])
    np.add.at(total, (rows, cols), rgb[near])
    np.add.at(count, (rows, cols), 1)
    filled = pushpull(total / np.maximum(count, 1)[..., None], count > 0)
    cover = cover[:, None]
    rgb[ys, xs] = filled[cell(a, h)] * (1 - cover) + color * cover
    paint[ys, xs] = True


for brow in brows:
    weight = 1 - rgb[brow].mean(-1)
    a, h = np.abs(pos[..., 0][brow]), pos[..., 2][brow]
    fit = np.polyfit(a, h, 2, w=weight)
    inner, outer = np.percentile(a, [2, 98])
    # The generated stroke is erased, and the new one may run past it: both lie in the region.
    side = np.sign(np.median(pos[..., 0][brow]))
    near = np.abs(pos[..., 2] - np.polyval(fit, np.abs(pos[..., 0]))) < .045
    region = valid & ((blur(brow.astype(float), 4) > 0) | (near & (pos[..., 0] * side > inner - .06) & (pos[..., 0] * side < outer + .06) & (pos[..., 1] < 0)))
    ys, xs = np.nonzero(region)
    t = (np.abs(pos[ys, xs, 0]) - inner) / (outer - inner)
    width = BROW_WIDTH * (1 - (1 - BROW_TIP) * np.clip(t, 0, 1)) * smooth(-.02, .08, t) * smooth(1.02, .95, t)
    # Distance in stroke widths: zero width past the ends is no ink rather than 0/0.
    repaint(region, smooth(1, .4, np.abs(pos[ys, xs, 2] - np.polyval(fit, np.abs(pos[ys, xs, 0]))) / np.maximum(width, 1e-9)), BROW)

lips = valid & (np.abs(pos[..., 0]) < MOUTH_BOX[0]) & (pos[..., 2] > MOUTH_BOX[1]) & (pos[..., 2] < MOUTH_BOX[2]) & (rgb[..., 0] - rgb[..., 1] > LIP_RED)
region = valid & (blur(lips.astype(float), 4) > 0)
la, lz = pos[..., 0][lips], pos[..., 2][lips]
ys, xs = np.nonzero(region)
u = (pos[ys, xs, 0] - (la.min() + la.max()) / 2) / ((la.max() - la.min()) / 2 * MOUTH_WIDTH)
line = (lz.min() + lz.max()) / 2 + SMILE * u * u
width = MOUTH_LINE * (1 - .4 * np.minimum(u * u, 1))
repaint(region, smooth(width, width * .4, np.abs(pos[ys, xs, 2] - line)) * smooth(1, .8, np.abs(u)), MOUTH)
normal[paint, :3] = FLAT_NORMAL
for eye in eyes.values():
    (rx, rz), center = eye['radius'], eye['center']
    u = eye['sign'] * (pos[..., 0] - center[0]) / rx
    v = (pos[..., 2] - center[2]) / rz
    alpha = BLUSH_ALPHA * np.exp(-((u - BLUSH_AT[0]) / BLUSH_SIZE[0]) ** 2 - ((v - BLUSH_AT[1]) / BLUSH_SIZE[1]) ** 2)
    near = valid & (pos[..., 1] < center[1] + .3) & (alpha > .01)
    rgb[near] += (BLUSH - rgb[near]) * alpha[near][:, None]
    paint |= near

features = {'lipTexels': int(lips.sum()), 'repaintedTexels': int(paint.sum())}

mesh = head.data
assert np.allclose(np.array(head.matrix_world), np.eye(4)), 'Head transform must be identity'
mesh.calc_loop_triangles()
coords = [v.co.copy() for v in mesh.vertices]
vertex_normals = [v.normal.copy() for v in mesh.vertices]
uv_data = mesh.uv_layers.active.data
bvh = BVHTree.FromPolygons(coords, [tuple(t.vertices) for t in mesh.loop_triangles])


def surface(arc, z):
    """Head surface at arc length `arc` round the vertical axis and height z, hit from outside: position, smooth normal, UV."""
    angle = arc / radius
    inward = Vector((-np.sin(angle), np.cos(angle), 0))
    hit, _, index, _ = bvh.ray_cast(Vector((axis_x, axis_y, z)) - inward * 3, inward)
    assert hit is not None, ('Eye patch misses the head', arc, z)
    tri = mesh.loop_triangles[index]
    a, b, c = (coords[i] for i in tri.vertices)
    n = barycentric_transform(hit, a, b, c, *(vertex_normals[i] for i in tri.vertices)).normalized()
    uv = barycentric_transform(hit, a, b, c, *(uv_data[l].uv.to_3d() for l in tri.loops))
    return hit, n, (uv.x, uv.y)


def eye_coords(eye, x, z):
    (rx, rz), center = eye['radius'], eye['center']
    return eye['sign'] * (x - center[0]) / rx, (z - center[2]) / rz


def eye_point(eye, u, v):
    (rx, rz), center = eye['radius'], eye['center']
    return center[0] + eye['sign'] * u * rx, center[2] + v * rz


# Both eyes share one mirrored atlas drawn from the eye with more texels; rows top-down, u toward the outer corner.
u0, u1, v0, v1 = EYE_EXTENT
N = EYE_CELL
eu, ev = np.meshgrid(u0 + (np.arange(N) + .5) / N * (u1 - u0), v1 - (np.arange(N) + .5) / N * (v1 - v0))
best = max(eyes.values(), key=lambda eye: eye['irisTexels'])
uv = np.array([surface(*eye_point(best, a, b))[2] for a, b in zip(eu.ravel(), ev.ravel())]).reshape(N, N, 2)
eye_rgb = bilinear(source, uv)[..., :3]
pad = (CANVAS[0] - CANVAS_EYE_WIDTH) // 2


def drawn_frame(name, shift):
    """A drawn frame resampled to eye space (rows top-down), its content moved by `shift` along u."""
    image = bpy.data.images.load(str(OUT / 'eye-frames' / f'{name}.png'))
    assert tuple(image.size) == CANVAS, (name, tuple(image.size))
    data = pixels(image)[::-1, :, :3]
    bpy.data.images.remove(image)
    x = pad + (eu + shift - CANVAS_U[0]) / (CANVAS_U[1] - CANVAS_U[0]) * CANVAS_EYE_WIDTH - .5
    y = (v1 - ev) / (v1 - v0) * CANVAS[1] - .5
    x0 = np.clip(np.floor(x).astype(int), 0, CANVAS[0] - 2)
    y0 = np.clip(np.floor(y).astype(int), 0, CANVAS[1] - 2)
    fx, fy = np.clip(x - x0, 0, 1)[..., None], np.clip(y - y0, 0, 1)[..., None]
    return (data[y0, x0] * (1 - fx) + data[y0, x0 + 1] * fx) * (1 - fy) + (data[y0 + 1, x0] * (1 - fx) + data[y0 + 1, x0 + 1] * fx) * fy


border = np.zeros((N, N), bool)
border[[0, -1]] = border[:, [0, -1]] = True


def masks(rgb):
    """Eye opening (white and iris, pupil included) and lid lines of a drawn frame."""
    lum = rgb.mean(-1)
    warm = rgb[..., 0] - rgb[..., 2]
    blue = (rgb[..., 2] > rgb[..., 0] + .15) & (rgb[..., 2] > .3)
    dark = (lum < .4) & (warm > -.08)
    # The pupil is dark too, but it has iris blue on both sides in its row; the lid lines never do.
    left, right = np.maximum.accumulate(blue, 1), np.maximum.accumulate(blue[:, ::-1], 1)[:, ::-1]
    opening = blue | ((lum > .62) & (warm < .05)) | (dark & left & right)
    lash = dark & ~opening
    # Anti-aliased iris rims and catchlight edges are neither blue nor white; they are holes closed in by white and lid lines.
    opening |= ~flood(border, ~(opening | lash)) & ~lash
    return opening, lash, lum


# The drawn eye keeps the painted iris off-centre toward the nose; shift the frames so the opening centres on the shader's
# iris (eye space origin) and move the patches the other way below, so the outline stays where it is drawn on the face.
opening, _, _ = masks(drawn_frame('open', 0))
span = eu[0, opening.any(0)]
IRIS_SHIFT = float(span.min() + span.max()) / 2
# Fade the patch edge so a lash tip running off the extent ends softly.
edge = smooth(0, .12, np.minimum.reduce([eu - u0, u1 - eu, ev - v0, v1 - ev]))


def frame(name):
    opening, lash, lum = masks(drawn_frame(name, IRIS_SHIFT))
    white = smooth(.3, .7, blur(opening.astype(float), 1))
    lashes = (blur(lash.astype(float), 1) > 0) * smooth(.6, .3, lum) * edge
    # Shadow under the upper lid: distance below the opening's top edge in each column.
    top = np.where(opening.any(0), opening.argmax(0), N)
    shadow = 1 - smooth(0, .5 * N / (v1 - v0), np.arange(N)[:, None] - blur(top[None, :].astype(float), 20)[0])
    sclera = 1 - (1 - SCLERA_SHADOW) * shadow[..., None]
    # Lashes over the white; a faint lash edge over skin stays lash-coloured instead of fading to white.
    behind = (white * (1 - lashes))[..., None]
    alpha = lashes[..., None] + behind
    color = (LASH * lashes[..., None] + sclera * behind) / np.maximum(alpha, 1e-6)
    return np.dstack([color, alpha[..., 0]])


atlas = np.zeros((2 * N, 2 * N, 4), np.float32)
for i, name in enumerate(FRAMES):
    atlas[i // 2 * N:(i // 2 + 1) * N, i % 2 * N:(i % 2 + 1) * N] = frame(name)

# Paint the old eyes out: every non-skin texel around each eye (lashes, white, iris) is refilled from the surrounding skin.
# The fill runs in eye space, where both sides of the UV seams meet, and reaches past the patch extent to catch lash tips.
f0, f1, g0, g1 = FILL_EXTENT
# Repainted brows and mouth also spread past the UV island edges below.
changed = paint.copy()
for eye in eyes.values():
    a, b = eye_coords(eye, pos[..., 0], pos[..., 2])
    ys, xs = np.nonzero(valid & (pos[..., 1] < eye['center'][1] + .4) & (a > f0) & (a < f1) & (b > g0) & (b < g1))
    a, b, color = a[ys, xs], b[ys, xs], rgb[ys, xs]
    col = ((a - f0) / (f1 - f0) * FILL_GRID).astype(int)
    row = ((g1 - b) / (g1 - g0) * FILL_GRID).astype(int)
    # Brows sit above v 2 and stay; below that anything dark, cool or white belongs to the painted eye.
    # Redrawn brows, mouth and blush are not part of the painted eye.
    stuff = ((color.mean(-1) < .45) | (color[:, 0] - color[:, 2] < .08)) & (b < 1.9) & ~paint[ys, xs]
    total = np.zeros((FILL_GRID, FILL_GRID, 3))
    count = np.zeros((FILL_GRID, FILL_GRID))
    marked = np.zeros((FILL_GRID, FILL_GRID))
    np.add.at(total, (row, col), color)
    np.add.at(count, (row, col), 1)
    np.add.at(marked, (row, col), stuff)
    weight = smooth(.02, .25, blur((marked > 0).astype(float), 5))
    filled = pushpull(total / np.maximum(count, 1)[..., None], (count > 0) & (weight == 0))
    w = weight[row, col]
    sel = w > 0
    rgb[ys[sel], xs[sel]] = color[sel] * (1 - w[sel, None]) + filled[row[sel], col[sel]] * w[sel, None]
    changed[ys[sel], xs[sel]] = True
    eye['paintedTexels'] = int(sel.sum())
normal[changed, :3] = FLAT_NORMAL
# Texels just outside the UV islands are reached by bilinear filtering and mipmaps; they still hold the old eye colours.
for _ in range(4):
    total = np.zeros_like(rgb)
    count = np.zeros(valid.shape)
    for shift in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        total += np.roll(rgb * changed[..., None], shift, (0, 1))
        count += np.roll(changed, shift, (0, 1))
    grow = ~valid & ~changed & (count > 0)
    rgb[grow] = total[grow] / count[grow, None]
    changed |= grow
diffuse[..., :3] = rgb
store(diffuse_image, diffuse, 'head-diffuse.png')
store(normal_image, normal, 'head-normal.png')
atlas_image = bpy.data.images.new('eye-atlas', 2 * N, 2 * N, alpha=True)
atlas_image = store(atlas_image, atlas[::-1], 'eye-atlas.png')

eye_material = bpy.data.materials.new('D1 eye')
eye_material.use_nodes = True
eye_material.surface_render_method = 'BLENDED'
nodes = eye_material.node_tree.nodes
principled = nodes.get('Principled BSDF')
texture = nodes.new('ShaderNodeTexImage')
texture.image = atlas_image
eye_material.node_tree.links.new(texture.outputs['Color'], principled.inputs['Base Color'])
eye_material.node_tree.links.new(texture.outputs['Alpha'], principled.inputs['Alpha'])
mesh.materials.append(eye_material)

for eye in eyes.values():
    eye['center'][0] += eye['sign'] * IRIS_SHIFT * eye['radius'][0]
    eye['radius'] = (eye['radius'][0] * EYE_SCALE, eye['radius'][1] * EYE_SCALE)
# Patch quads follow the face, lifted along its normal; UVs address the open-frame quadrant (glTF v runs downward).
covered = blur(atlas[:N, :N, 3], 12) > 0
bm = bmesh.new()
bm.from_mesh(mesh)
uv_layer = bm.loops.layers.uv.active
gu, gv = EYE_GRID
for eye in eyes.values():
    grid = {}
    for j in range(gv + 1):
        for i in range(gu + 1):
            a, b = u0 + (u1 - u0) * i / gu, v1 - (v1 - v0) * j / gv
            hit, n, _ = surface(*eye_point(eye, a, b))
            grid[i, j] = (bm.verts.new(hit + n * EYE_LIFT), (i / gu * .5, 1 - j / gv * .5))
    patch = 0
    for j in range(gv):
        for i in range(gu):
            if not covered[min(j * N // gv, N - 1):(j + 1) * N // gv, i * N // gu:(i + 1) * N // gu].any():
                continue
            corners = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
            # Mirrored eye: u runs toward -x there, so flip the winding to keep the face pointing out of the head.
            if eye['sign'] < 0:
                corners.reverse()
            face = bm.faces.new([grid[c][0] for c in corners])
            face.material_index = 1
            face.smooth = True
            for loop, c in zip(face.loops, corners):
                loop[uv_layer].uv = grid[c][1]
            patch += 1
    bmesh.ops.delete(bm, geom=[v for v, _ in grid.values() if not v.link_faces], context='VERTS')
    eye['patchFaces'] = patch
bm.verts.index_update()
bm.to_mesh(mesh)
bm.free()
mesh.update()
for eye in eyes.values():
    eye['center'] = eye['center'].tolist()
print('EYES', {'irisShift': IRIS_SHIFT, **features, **eyes}, flush=True)

bpy.ops.object.select_all(action='DESELECT')
for obj in (head, hair):
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'head-hair-look.glb'), export_format='GLB', use_selection=True)

lo, hi = bounds([head])
center, span, camera = setup_scene(lo, hi)
scene = bpy.context.scene
scene.render.resolution_x = scene.render.resolution_y = 900
from mathutils import Vector
target = Vector((center.x, center.y, lo.z + (hi - lo).z * .45))
for name, direction, show_hair in [('front', (0, -1, 0), False), ('hair-front', (0, -1, 0), True), ('hair-three-quarter', (-1, -1, 0), True), ('hair-back', (0, 1, 0), True)]:
    hair.hide_render = not show_hair
    camera.data.ortho_scale = (hi - lo).z * (1.25 if show_hair else .75)
    camera.location = target + Vector(direction).normalized() * span * 4
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(OUT / f'look-{name}.png')
    bpy.ops.render.render(write_still=True)
