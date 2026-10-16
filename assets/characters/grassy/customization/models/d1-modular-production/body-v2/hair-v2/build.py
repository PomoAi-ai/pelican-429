"""Procedural D1 hair on the reshaped head (../head-shape/head.glb), modelled after the seven-view concept.

Anime hair cards (the representation of VRoid and CHARM: a control-point line per lock with a width and thickness):
broad locks with a crescent section whose edges wrap toward the head, an S wave and a pointed tip fan out from the
crown in layers whose ends are staggered; a side-swept fringe parts over the character's left eye, sidelocks hang in
front of the ears, and a three-strand braid runs from the parting down the side of the head to behind the top of the
ear. Ears stay uncovered. A scalp shell under the locks hides gaps. All locks share one material `model.001`
(the hair role) whose texture darkens lock edges and roots. Output: head-hair.glb (Head unchanged + Hair),
the input of ../head-look/build.py.

Coordinates are the head space of ../head-shape: Blender Z-up, front -Y, character's left +X.
Azimuth a: 0 front, 90 character's left, 180 back. Polar angle t from the top of the skull centre ORIGIN."""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT = Path(__file__).resolve().parent
MODELS = OUT.parents[1]
ROOT = OUT.parents[7]
sys.path.insert(0, str(ROOT / 'scripts/character_customization'))
from inspect_standalone_head import bounds, mesh_report, setup_scene

PART_AZ = 24
BACK_LOFT = .14

ORIGIN = np.array([0, .02, 1.12])
RING = 10
LAYER = .03
TEXTURE = 2048
# Every lock gets its own atlas cell so baked contact shadows stay per lock; the top row holds the scalp shell.
GRID = 12
PAD = .04
# Previous wig top; assembled-base normalises total height including hair, so keep the crown height.
CROWN_TOP = 2.11
rng = np.random.default_rng(429)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT.parent / 'head-shape/head.glb'))
head = bpy.data.objects['Head']
head_before = [tuple(v.co) for v in head.data.vertices]
tree = BVHTree.FromPolygons([v.co for v in head.data.vertices], [list(p.vertices) for p in head.data.polygons])


def direction(a, t):
    a, t = math.radians(a), math.radians(t)
    return np.array([math.sin(a) * math.sin(t), -math.cos(a) * math.sin(t), math.cos(t)])


def skull(a, t):
    """Distance from ORIGIN to the outermost head surface along (a, t)."""
    d = direction(a, t)
    hit = tree.ray_cast(Vector(ORIGIN + d * 4), Vector(-d), 4)[0]
    assert hit is not None, (a, t)
    return (np.array(hit) - ORIGIN) @ d


def extent(a, z):
    """Horizontal distance from the head axis to the outermost surface (ears, neck) at height z."""
    h = np.array([math.sin(math.radians(a)), -math.cos(math.radians(a)), 0])
    axis = np.array([ORIGIN[0], ORIGIN[1], z])
    hit = tree.ray_cast(Vector(axis + h * 4), Vector(-h), 4)[0]
    return 0 if hit is None else (np.array(hit) - axis) @ h


def volume(a, t):
    """Extra loft over the skull: a rounded crown that settles toward the hairline, plus a bulge behind the occiput
    (the concept's profile reaches far behind the skull)."""
    back = BACK_LOFT * max(0, -math.cos(math.radians(a))) * math.sin(math.radians(min(t, 100))) ** 2
    return .14 * math.cos(math.radians(min(t, 110)) * .75) ** 2 + .03 + back


def resample(points, count):
    seg = np.linalg.norm(np.diff(points, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)]) / seg.sum()
    u = np.linspace(0, 1, count)
    out = np.stack([np.interp(u, s, points[:, k]) for k in range(3)], 1)
    for _ in range(3):
        out[1:-1] = out[1:-1] * .5 + (out[:-2] + out[2:]) * .25
    return out


def angles(d):
    return math.degrees(math.atan2(d[0], -d[1])), math.degrees(math.acos(max(-1, min(1, d[2]))))


def slerp(p, q, u):
    omega = math.acos(max(-1, min(1, p @ q)))
    if omega < 1e-4:
        return p
    return (math.sin((1 - u) * omega) * p + math.sin(u * omega) * q) / math.sin(omega)


def lock_path(root, end, layer, z_end=None, flare=.06, curl=.05, lift=0., wave=0., hug=0.):
    """Centre line over the skull along the great circle from root to end (each an (azimuth, polar) pair),
    then, if z_end is given, hanging down with a bob flare and an inward (curl > 0) or outward (curl < 0) tip.
    `hug` (0–1) pulls the hanging part from a straight fall onto a constant gap over the face, jaw and neck below it,
    so side locks lie on the cheek and back hair follows the nape instead of standing off like a skirt."""
    d0, d1 = direction(*root), direction(*end)
    pts = []
    n_arc = 24
    for i in range(n_arc):
        u = i / (n_arc - 1)
        d = slerp(d0, d1, u)
        a, t = angles(d)
        r = skull(a, t) + volume(a, t) + LAYER * layer + lift * math.sin(math.pi * u ** .6)
        p = ORIGIN + d * r
        # Hair falls from the widest point of the skull instead of wrapping under it.
        if z_end is not None and pts and t > 80:
            h = (p - ORIGIN)[:2]
            reach = np.linalg.norm((pts[-1] - ORIGIN)[:2])
            if np.linalg.norm(h) < reach:
                p[:2] = ORIGIN[:2] + h / np.linalg.norm(h) * reach
        pts.append(p)
    if z_end is not None:
        a = end[0]
        h = np.array([math.sin(math.radians(a)), -math.cos(math.radians(a)), 0])
        top = pts[-1]
        r0 = (top - ORIGIN)[:2] @ h[:2]
        n_hang = 20
        for i in range(1, n_hang):
            u = i / (n_hang - 1)
            z = top[2] + (z_end - top[2]) * u
            floor = extent(a, z) + .05 + LAYER * layer
            # The flare only opens the lower part: hair lies on the head, then the bob swings out toward the ends.
            r = max(floor, (1 - hug) * r0 + hug * floor + flare * max(0, (u - .35) / .65) ** 1.5 - curl * u ** 3)
            side = np.cross([0, 0, 1], h) * wave * math.sin(u * math.pi * 2)
            pts.append(np.array([ORIGIN[0], ORIGIN[1], z]) + h * r + side)
    return resample(np.array(pts), 30)


def outward(p):
    """Lock 'up' direction: radial from the skull centre, horizontal once below the centre."""
    d = p - ORIGIN
    if d[2] < 0:
        d = d * np.array([1, 1, max(0, 1 + d[2] * 2)])
    return d / np.linalg.norm(d)


verts, faces, uvs, cells = [], [], [], []


def tube(path, width, thick, normals=None, profile=None, bend=0.):
    """Tube along `path`: width across the hair surface, thickness away from it, tapering to a point. `bend` (in widths)
    pulls the section's edges toward the head so a lock reads as a curved anime card rather than a round strand.
    In its atlas cell, u runs around the section (0/0.5 are the lock edges, .25 the outer face), v from root (0) to tip (1)."""
    cell = len(cells)
    assert cell < GRID * (GRID - 1), 'atlas full'
    cells.append(cell)
    cx, cy = cell % GRID, cell // GRID
    to_uv = lambda cu, cv: ((cx + PAD + (1 - 2 * PAD) * cu) / GRID, (cy + PAD + (1 - 2 * PAD) * cv) / GRID)
    count = len(path)
    tangent = np.gradient(path, axis=0)
    tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
    start = len(verts)
    for i, p in enumerate(path):
        u = i / (count - 1)
        k = profile(u) if profile else (.82 + .18 * math.sin(math.pi * min(u / .5, 1) / 2)) * (1 - max(0, (u - .5) / .5) ** 2) ** .6
        n = normals[i] if normals is not None else outward(p)
        b = np.cross(tangent[i], n)
        b /= np.linalg.norm(b)
        n = np.cross(b, tangent[i])
        for j in range(RING + 1):
            phi = 2 * math.pi * j / RING
            verts.append(p + b * (width * k / 2 * math.cos(phi)) + n * (thick * k ** .5 / 2 * math.sin(phi) - bend * width * k * math.cos(phi) ** 2))
            uvs.append(to_uv(j / RING, u))
    for i in range(count - 1):
        for j in range(RING):
            a = start + i * (RING + 1) + j
            faces.append((a, a + 1, a + RING + 2, a + RING + 1))
    # Root cap so a lock never shows its hollow inside.
    centre = len(verts)
    verts.append(path[0])
    uvs.append(to_uv(.25, 0))
    faces.extend((centre, start + j + 1, start + j) for j in range(RING))


def lock_profile(u):
    """Lock width along its length: a narrow wedge at the root (locks meeting at the parting and crown do not stack
    flat on each other), full from a third, then a leaf-shaped point over the last 45% as in the concept: full
    clumps that close to a point, neither blunt nor needles."""
    return (.4 + .6 * math.sin(math.pi * min(u / .35, 1) / 2)) * (1 - max(0, (u - .55) / .45) ** 1.6) ** .8


def lock(path, width, thick=.34, forks=(), sway=0.):
    """`forks` ((shift, keep, scale), ...): narrower locks that run inside this one and part from it over the last half,
    `shift` widths to the side, ending at `keep` of its length, so the end splits into two or three points as in the
    concept. `sway` bends the end sideways (in widths), the curved tips of the fringe."""
    tangent = np.gradient(path, axis=0)
    side = np.cross(tangent, [outward(p) for p in path])
    side /= np.linalg.norm(side, axis=1, keepdims=True)
    u = np.linspace(0, 1, len(path))[:, None]
    path = path + side * sway * width * u ** 2
    tube(path, width, width * thick, profile=lock_profile, bend=.08)
    for shift, keep, scale in forks:
        part = path + side * shift * width * np.clip((u - .45) / .55, 0, 1) ** 1.5
        tube(resample(part[:round(len(part) * keep)], 30), width * scale, width * scale * thick, profile=lock_profile, bend=.08)


# Braid line (polar angle by azimuth): from beside the parting high at the front, down the side of the head, ending
# behind the top of the ear (ear spans a≈86–112, its top t≈94).
BRAID = [(40, 44), (65, 58), (90, 74), (112, 88), (130, 96)]
BRAID_START, BRAID_END = 38, 130
braid_t = lambda a: float(np.interp(abs(a), *zip(*BRAID)))
# Back hair hangs from here round to the nape, clear of the ear.
BACK_FROM = 128
# Parting line from the front hairline over the top to the crown whorl; locks are combed away from it to both sides.
PART_FRONT, PART_BACK = direction(PART_AZ, 62), direction(180, 36)
part = lambda s: angles(slerp(PART_FRONT, PART_BACK, s))
jitter = lambda spread: rng.uniform(-spread, spread)
for side in (1, -1):
    # Flare by azimuth: the sides open the bob's width seen from behind, the centre falls nearly straight so the
    # profile hangs down from the occiput instead of fanning back like a cone.
    spread = lambda a, most: most * (1 - .55 * (a - BACK_FROM) / (180 - BACK_FROM))
    # Back, lower tier (the hem row): locks roughly as wide as their spacing, each on its own layer (coincident surfaces
    # flicker); the under layer ends higher, filling the gaps the flare opens without its tips showing below the hem.
    for i, a in enumerate(np.linspace(BACK_FROM + 12, 176, 4)):
        lock(lock_path(part(.3 + .7 * (a - BACK_FROM) / (180 - BACK_FROM)), (side * a, 100), .2 * i, z_end=.26, flare=spread(a, .26), curl=.02, hug=.15), .42, .45, forks=((.4 * (-1) ** i, .86, .65),))
    for i, a in enumerate(np.linspace(BACK_FROM + 4, 170, 4)):
        lock(lock_path(part(.32 + .68 * (a - BACK_FROM) / (180 - BACK_FROM) + jitter(.02)), (side * a + jitter(2), 100), 1.2 + .2 * i,
                       z_end=.14 + jitter(.06), flare=spread(a, .34), curl=-.07 + jitter(.03), wave=jitter(.08), hug=.1), .4, .5,
             forks=((.45 * (-1) ** i, .84 + jitter(.05), .62),))
    # Back, upper tier: broad locks fanning from the crown that end mid-back over the hem row, tips turning in,
    # the concept's layered bob.
    for i, (a, z) in enumerate(((140, .62), (156, .54), (172, .66))):
        lock(lock_path(part(.6 + .15 * i), (side * a, 98), 2.4 + .2 * i, z_end=z, flare=spread(a, .3), curl=.05, wave=jitter(.06), hug=.1), .52, .4,
             forks=((.4, .84, .6),))
    # Behind the ear: from under the end of the braid down to the jaw, covering the skull between ear and back hair.
    for i, a in enumerate((122, 133)):
        lock(lock_path((side * (a - 6), braid_t(a) + 2), (side * a, 104), 1 + .2 * i, z_end=.2 + jitter(.03), flare=.36, curl=-.1, wave=jitter(.05), hug=.2), .42, .45, forks=((-.45, .84, .62),))
    # Above the ear: from the parting down under the braid.
    for i, s in enumerate(np.linspace(.08, .36, 6)):
        a = 46 + 72 * (s - .08) / .28
        lock(lock_path(part(s), (side * a, braid_t(a) + 4), .6 + .15 * (i % 2)), .36)
    # Tucks between the braid and the top of the ear, rooted under the braid so no root end shows above it.
    for i, a in enumerate(np.arange(76, 124, 12)):
        lock(lock_path((side * a, braid_t(a)), (side * (a + 6), 96), 1.4 + .15 * (i % 2), lift=.01), .26)
    # Temple locks from the parting over the temple, between the fringe and the sidelocks, so no forehead shows there.
    for i, (a, t) in enumerate(((34, 86), (48, 92))):
        lock(lock_path(part(.03 + .03 * i), (side * a, t), 2.2 + .2 * i, lift=.02), .32)
    # Sidelocks down to the jaw, tips turning out: a thin one framing the face, then a flatter one (lower layer) toward
    # the ear, filling the temple in profile; none lies over the ear, which the concept shows from the front.
    for a, z, w, layer in ((46, .3, .18, 1.6), (54, .36, .18, 1.)):
        lock(lock_path((side * (a - 16), 48), (side * a, 98), layer, z_end=z, flare=.16, curl=-.03, wave=.03 * side, hug=1), w)
# Fringe: the big sweep crosses the forehead from the parting toward the character's right temple; three locks fall
# the other way, leaving a narrow triangle of forehead under the parting.
for i, (s, a, t, w, lift, sway) in enumerate(((.24, -56, 104, .34, .06, .5), (.2, -44, 99, .28, .07, .3), (.16, -32, 96, .3, .07, .4),
                                              (.13, -21, 93, .26, .06, .2), (.1, -10, 95, .28, .06, .3), (.07, 0, 91, .24, .05, .1))):
    lock(lock_path(part(s), (a, t), 2.6 + .25 * i, lift=lift * 1.3), w * .85, .3, sway=sway,
         forks=((.45, .82, .6),) if i % 2 == 0 else ())
# One long lock from the crown whorl crosses the centre of the back diagonally over the others, as in the concept.
lock(lock_path((180, 30), (156, 98), 3.4, z_end=.5, flare=.2, curl=.06, hug=.1), .46, .4)
for i, (s, a, t, w, lift) in enumerate(((.1, 40, 95, .26, .05), (.06, 50, 100, .26, .04), (.03, 60, 106, .28, .03))):
    lock(lock_path(part(s), (a, t), 2.5 + .25 * i, lift=lift * 1.3), w * .85, .3, sway=-.3)


def braid(side):
    """Three strands woven along a temple-to-back path: lateral sin, double-frequency height sin."""
    along = np.linspace(0, 1, 220)
    centre, normal, binormal = [], [], []
    for u in along:
        a = side * (BRAID_START + (BRAID_END - BRAID_START) * u)
        t = braid_t(BRAID_START + (BRAID_END - BRAID_START) * u)
        # The start dips under the parting locks so the braid emerges from the hair instead of showing a cut end.
        r = skull(a, t) + volume(a, t) + LAYER * 3 - .22 * max(0, 1 - u / .3) ** 1.5
        centre.append(ORIGIN + direction(a, t) * r)
    centre = np.array(centre)
    tangent = np.gradient(centre, axis=0)
    tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
    for p, tg in zip(centre, tangent):
        n = outward(p)
        b = np.cross(tg, n)
        b /= np.linalg.norm(b)
        normal.append(np.cross(b, tg))
        binormal.append(b)
    normal, binormal = np.array(normal), np.array(binormal)
    length = np.linalg.norm(np.diff(centre, axis=0), axis=1).sum()
    turns = length / .42
    taper = (.55 + .45 * np.clip((1 - along) / .35, 0, 1)) * np.clip(along / .25, .2, 1) ** .7
    for k in range(3):
        phase = 2 * math.pi * (turns * along + k / 3)
        # Strands converge at the start, where the braid gathers its first hair under the parting.
        lateral = .11 * np.sin(phase) * taper * np.clip(along / .1, 0, 1)
        height = .04 * np.sin(2 * phase) * np.clip(along / .1, 0, 1)
        strand = centre + binormal * lateral[:, None] + normal * height[:, None]
        tube(strand, .27, .17, normals=normal, profile=lambda u: float(np.interp(u, along, taper)) * (1 - max(0, (u - .94) / .06) ** 2) ** .5)


braid(1)
braid(-1)
# The braid finishes in a short loose tail flicking back over the hair behind the ear, as in the concept's profile.
for side in (1, -1):
    for i, (a, t, w) in enumerate(((BRAID_END + 2, 112, .2), (BRAID_END + 10, 106, .16))):
        lock(lock_path((side * (BRAID_END - 8), braid_t(BRAID_END - 8)), (side * a, t), 2.6 + .2 * i, lift=.03), w)

hair_mesh = bpy.data.meshes.new('Hair')
hair_mesh.from_pydata([tuple(v) for v in verts], [], faces)
uv_layer = hair_mesh.uv_layers.new(name='UVMap')
loops = np.array([index for poly in hair_mesh.polygons for index in poly.vertices])
uv_layer.data.foreach_set('uv', np.array(uvs)[loops].ravel())
hair_mesh.validate()
# Weld each ring's UV seam and the collapsed tip ring: UVs stay per loop, normals become continuous.
bm = bmesh.new()
bm.from_mesh(hair_mesh)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bm.to_mesh(hair_mesh)
bm.free()
hair = bpy.data.objects.new('Hair', hair_mesh)
bpy.context.scene.collection.objects.link(hair)
for poly in hair_mesh.polygons:
    poly.use_smooth = True

# Scalp shell under the locks, mapped to the dark root texels.
cap = bpy.data.meshes.new('cap')
bm = bmesh.new()
bm.from_mesh(head.data)
# Cap edge kept under the fringe and side locks so no cut edge shows at the forehead and temples.
hairline = [(0, 69), (40, 75), (70, 90), (100, 98), (130, 118), (180, 128)]
remove = []
for face in bm.faces:
    d = np.array(face.calc_center_median()) - ORIGIN
    a = abs(math.degrees(math.atan2(d[0], -d[1])))
    t = math.degrees(math.acos(d[2] / np.linalg.norm(d)))
    if t > np.interp(a, *zip(*hairline)):
        remove.append(face)
bmesh.ops.delete(bm, geom=remove, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
for v in bm.verts:
    d = np.array(v.co) - ORIGIN
    t = math.degrees(math.acos(d[2] / np.linalg.norm(d)))
    a = math.degrees(math.atan2(d[0], -d[1]))
    margin = np.interp(abs(a), *zip(*hairline)) - t
    v.co = Vector(ORIGIN + d / np.linalg.norm(d) * (np.linalg.norm(d) + .012 + max(0, volume(a, t) - .02) * min(1, margin / 25)))
uv = bm.loops.layers.uv.active
for f in bm.faces:
    for loop in f.loops:
        d = np.array(loop.vert.co) - ORIGIN
        a, t = angles(d / np.linalg.norm(d))
        loop[uv].uv = ((a + 180) / 360, (GRID - 1 + PAD + (1 - 2 * PAD) * min(t, 140) / 140) / GRID)
bm.to_mesh(cap)
bm.free()
cap_obj = bpy.data.objects.new('cap', cap)
bpy.context.scene.collection.objects.link(cap_obj)
for poly in cap.polygons:
    poly.use_smooth = True

# Base texture per atlas cell: dark lock edges (u = 0, .5) and inner face, bright outer face with fine strands;
# darker roots, lighter tips. Contact shadows are baked over it below.
y, x = (np.mgrid[0:TEXTURE, 0:TEXTURE] + .5) / TEXTURE * GRID
cell = y.astype(int) * GRID + x.astype(int)
cu, cv = np.clip(((x % 1) - PAD) / (1 - 2 * PAD), 0, 1), np.clip(((y % 1) - PAD) / (1 - 2 * PAD), 0, 1)
around = np.cos(2 * math.pi * cu)
outer = np.clip(np.sin(2 * math.pi * cu), 0, 1)
freq, phase = rng.uniform(8, 14, (GRID * GRID, 6)), rng.uniform(0, 2 * math.pi, (GRID * GRID, 6))
strands = sum(np.sin(freq[cell, k] * cu * 2 * math.pi + phase[cell, k]) for k in range(6)) / 6
shade = .6 + .28 * outer - .3 * np.abs(around) ** 3 + .16 * np.sign(strands) * np.abs(strands) ** .5 * outer - .25 * np.exp(-cv / .1) + .1 * cv
scalp = y >= GRID - 1
shade[scalp] = .5
dark, mid, light = np.array([.84, .36, .14]), np.array([.94, .57, .29]), np.array([1, .77, .48])
rgb = np.where(shade[..., None] < .6, dark + (mid - dark) * np.clip((shade[..., None] - .25) / .35, 0, 1), mid + (light - mid) * np.clip((shade[..., None] - .6) / .3, 0, 1))
image = bpy.data.images.new('hair_basecolor', TEXTURE, TEXTURE)
image.pixels.foreach_set(np.concatenate([rgb, np.ones((TEXTURE, TEXTURE, 1))], 2).astype(np.float32).ravel())

material = bpy.data.materials.new('model.001')
assert material.name == 'model.001', material.name
material.use_nodes = True
nodes = material.node_tree.nodes
tex = nodes.new('ShaderNodeTexImage')
tex.image = image
bsdf = nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = .6
material.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
for obj in (hair, cap_obj):
    obj.data.materials.append(material)

bpy.ops.object.select_all(action='DESELECT')
hair.select_set(True)
cap_obj.select_set(True)
bpy.context.view_layer.objects.active = hair
bpy.ops.object.join()
assert head_before == [tuple(v.co) for v in head.data.vertices], 'Approved head geometry modified'
top = max(v.co.z for v in hair.data.vertices)

# Contact shadows between locks and against the head, baked with Cycles and multiplied into the base colour.
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 128
scene.world = bpy.data.worlds.new('bake')
scene.world.light_settings.distance = .06
ao = bpy.data.images.new('hair_ao', TEXTURE, TEXTURE)
target = nodes.new('ShaderNodeTexImage')
target.image = ao
nodes.active = target
bpy.ops.object.select_all(action='DESELECT')
hair.select_set(True)
bpy.context.view_layer.objects.active = hair
bpy.ops.object.bake(type='AO', margin=6)
nodes.remove(target)
occlusion = np.empty(TEXTURE * TEXTURE * 4, np.float32)
ao.pixels.foreach_get(occlusion)
occlusion = occlusion.reshape(TEXTURE, TEXTURE, 4)[..., :1]
# The runtime hair shader darkens by (linear luma / 0.45)^3, so keep luma in a narrow band (0.27–0.58, like the
# previous wig) and let hue carry the rest: shadowed texels go redder, lit ones yellower.
# Contact shadow only tints: the runtime cubes luma, so full-strength AO reads as dark blotches where locks meet.
tone = np.clip((shade[..., None] - .25) / .65, 0, 1) * (.7 + .3 * occlusion)
linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
luma = linear @ np.array([.2126, .7152, .0722])
linear *= ((.27 + .31 * tone[..., 0]) / np.maximum(luma, 1e-4))[..., None]
rgb = np.clip(np.where(linear <= .0031308, linear * 12.92, 1.055 * np.clip(linear, 0, None) ** (1 / 2.4) - .055), 0, 1)
image.pixels.foreach_set(np.concatenate([rgb, np.ones((TEXTURE, TEXTURE, 1))], 2).astype(np.float32).ravel())
image.filepath_raw = str(OUT / 'hair-basecolor.png')
image.file_format = 'PNG'
image.save()

bpy.ops.object.select_all(action='DESELECT')
head.select_set(True)
hair.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'head-hair.glb'), export_format='GLB', use_selection=True)

minimum, maximum = bounds([head, hair])
center, span, camera = setup_scene(minimum, maximum)
scene = bpy.context.scene
scene.render.resolution_x = scene.render.resolution_y = 768
for name, d in {'front': (0, -1, 0), 'three-quarter': (1, -1, 0), 'right': (1, 0, 0), 'back': (0, 1, 0), 'top': (0, -.2, 1)}.items():
    camera.location = center + Vector(d).normalized() * span * 4
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(OUT / f'{name}.png')
    bpy.ops.render.render(write_still=True)
(OUT / 'build-report.json').write_text(json.dumps({'coordinates': 'Z-up, front -Y (head-hair-fit space)', 'headUnchanged': True, 'hairTop': top, 'previousHairTop': CROWN_TOP, 'objects': [mesh_report(o) for o in (head, hair)]}, indent=2) + '\n')
print('HAIR', len(verts), len(faces), 'top', round(top, 3))
