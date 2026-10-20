"""Reshape the approved v9 head toward the bald concept (public/catalog/d1-bald/d1-bald-slim-legs-v1.png).

Silhouette overlays against the concept (crown and chin aligned) showed four differences, each fixed by a smooth
displacement; positions move, topology, UVs and textures stay, so the painted face follows its surface:
- the back of the skull runs ~0.17 too far back: depth behind BACK_FROM is eased down to BACK_KEEP;
- the ears are small: the part standing off the skull is scaled up and turned out a little from its front root (the concept's
  ears stay upright against the head, not winged);
- the nape bulges behind the concept's straight neck and the jaw underside hangs low: both are drawn in;
- the neck under the jaw is wider than the concept's: it narrows below NECK_TOP.
Output: head.glb (object `Head`), the head every later step reads. Coordinates: Blender Z-up, front -Y, character's left +X."""
import json
import sys
from pathlib import Path

import bpy
import numpy as np

OUT = Path(__file__).resolve().parent
MODELS = OUT.parents[1]
ROOT = OUT.parents[7]
sys.path.insert(0, str(ROOT / 'scripts/character_customization'))
from inspect_standalone_head import bounds, mesh_report, setup_scene

BACK_FROM, BACK_KEEP, BACK_EASE = .15, .72, .2
# Ear box (y, z ranges) and its front root line; the part more than EAR_LIFT off the skull is the flap.
EAR_Y, EAR_Z, EAR_ROOT_Y = (.0, .3), (.6, 1.06), .03
EAR_LIFT = (.004, .03)
EAR_SCALE, EAR_STAND, EAR_FLARE, EAR_DROP = 1.15, 1.15, .12, .03
NAPE, NAPE_Z = .4, (.75, .45)
CHIN_TOP, CHIN_LIFT, CHIN_FRONT = .6, .15, (-.1, -.3)
NECK_TOP, NECK_BOTTOM, NECK_SCALE = .42, .3, .8


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def band(lo, hi, x, soft):
    return smooth(lo - soft, lo, x) * smooth(hi + soft, hi, x)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(MODELS / 'head-hair-fit/head-hair.glb'))
for obj in list(bpy.data.objects):
    if obj.name != 'Head':
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)
head = bpy.data.objects['Head']
head.parent = None
assert np.allclose(np.array(head.matrix_world), np.eye(4)), 'Head transform must be identity'
mesh = head.data
p = np.empty(len(mesh.vertices) * 3)
mesh.vertices.foreach_get('co', p)
p = p.reshape(-1, 3)
before = p.copy()
x, y, z = p.T
side, ax = np.sign(x), np.abs(x)

# Ears first, on the unscaled skull. Skull baseline under the ear: quadratic in (y, z) fitted to the outermost
# vertices of the ring around the ear box.
ring = (ax > .45) & (y > EAR_Y[0] - .15) & (y < EAR_Y[1] + .15) & (z > EAR_Z[0] - .12) & (z < EAR_Z[1] + .12)
ring &= ~((y > EAR_Y[0] - .03) & (y < EAR_Y[1] + .03) & (z > EAR_Z[0] - .03) & (z < EAR_Z[1] + .03))
cells = {}
for i in np.nonzero(ring)[0]:
    key = (side[i], round(y[i] / .03), round(z[i] / .03))
    if key not in cells or ax[i] > ax[cells[key]]:
        cells[key] = i
outer = np.array(list(cells.values()))
basis = lambda yy, zz: np.stack([np.ones_like(yy), yy, zz, yy * yy, yy * zz, zz * zz], -1)
coef, *_ = np.linalg.lstsq(basis(y[outer], z[outer]), ax[outer], rcond=None)
skull = basis(y, z) @ coef
lift = ax - skull
ear = band(*EAR_Y, y, .06) * band(*EAR_Z, z, .06) * smooth(*EAR_LIFT, lift) * (ax > .45)
center_y, center_z = np.mean(EAR_Y), np.mean(EAR_Z)
ear_ax = skull + lift * EAR_STAND + EAR_FLARE * smooth(EAR_ROOT_Y, EAR_ROOT_Y + .12, y) * (y - EAR_ROOT_Y)
p[:, 0] += ear * (side * ear_ax - x)
p[:, 1] += ear * (center_y + (y - center_y) * EAR_SCALE - y)
p[:, 2] += ear * (center_z + (z - center_z) * EAR_SCALE - EAR_DROP - z)

# Back of the skull: depth u behind BACK_FROM becomes u * (BACK_KEEP + (1 - BACK_KEEP) * exp(-u / BACK_EASE)),
# slope 1 at BACK_FROM so the side of the head has no crease.
u = np.maximum(p[:, 1] - BACK_FROM, 0)
p[:, 1] -= u - u * (BACK_KEEP + (1 - BACK_KEEP) * np.exp(-u / BACK_EASE))

# Nape: the back of the neck and lower skull scale toward y 0, most at the bottom.
p[:, 1] -= NAPE * smooth(*NAPE_Z, p[:, 2]) * p[:, 1] * smooth(0, .15, p[:, 1])
# Chin and jaw underside: the front of the face below CHIN_TOP is pulled up by CHIN_LIFT of its depth below it.
below = np.maximum(CHIN_TOP - p[:, 2], 0)
p[:, 2] += CHIN_LIFT * below * smooth(CHIN_TOP, CHIN_TOP - .15, p[:, 2]) * smooth(*CHIN_FRONT, p[:, 1])

p[:, 0] *= 1 - (1 - NECK_SCALE) * smooth(NECK_TOP, NECK_BOTTOM, p[:, 2])

mesh.vertices.foreach_set('co', p.ravel())
mesh.update()
moved = np.linalg.norm(p - before, axis=1)
print('SHAPE', {'earVertices': int((ear > .5).sum()), 'maxMove': float(moved.max()), 'depth': [float(before[:, 1].max()), float(p[:, 1].max())]}, flush=True)

bpy.ops.object.select_all(action='DESELECT')
head.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'head.glb'), export_format='GLB', use_selection=True)

lo, hi = bounds([head])
center, span, camera = setup_scene(lo, hi)
scene = bpy.context.scene
scene.render.resolution_x = scene.render.resolution_y = 900
camera.data.ortho_scale = (hi - lo).z * 1.1
from mathutils import Vector
for name, direction in {'front': (0, -1, 0), 'right': (-1, 0, 0), 'back': (0, 1, 0), 'three-quarter': (-1, -1, 0)}.items():
    camera.location = center + Vector(direction).normalized() * span * 4
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(OUT / f'{name}.png')
    bpy.ops.render.render(write_still=True)
(OUT / 'shape-report.json').write_text(json.dumps({'source': '../../head-hair-fit/head-hair.glb (approved v9 head)', 'earVertices': int((ear > .5).sum()), 'maxMove': float(moved.max()), 'object': mesh_report(head)}, indent=2) + '\n')
