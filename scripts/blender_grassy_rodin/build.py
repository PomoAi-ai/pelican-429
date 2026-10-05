"""Assemble the Hyper3D Rodin Grassy and export the three showcase tiers.

blender --background --python scripts/blender_grassy_rodin/build.py

Rodin gives the whole body a 2K atlas in which the face is only ~200 px wide, so the head
comes from a separate head-only generation (cropped reference views) that spends a full 2K
atlas on hair and face. It is registered onto the head of the quad body generation, which
keeps the body's proportions, and joined inside the sweater collar. Each tier collapses
both parts to a budget, unwraps it anew and bakes colour and normals from the full-resolution
sources.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
sys.dont_write_bytecode = True

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, kdtree  # noqa: E402

import scene  # noqa: E402

BODY = ROOT / 'assets/characters/grassy/history/model-rodin/raw-quad-01/base_basic_pbr.glb'
HEAD = ROOT / 'assets/characters/grassy/history/model-rodin/raw-head-01/base_basic_pbr.glb'
SOURCE = ROOT / 'assets/characters/grassy/history/model-rodin'
OUT = ROOT / 'public/characters/human/history/models-rodin'
# name: ({part: triangles}, texture px, bake cage). The cage grows with the reduction: too short
# misses the source where collapse moved the surface, too long hits the arm inside the sleeve.
TIERS = {
    'detailed': ({'body': 80_000, 'head': 80_000}, 2048, 0.01),
    'game': ({'body': 14_000, 'head': 12_000}, 1024, 0.02),
    'light': ({'body': 8_000, 'head': 6_000}, 512, 0.02),
}
# The head mesh dips this far below the collar top so no gap shows at the neckline.
NECK_OVERLAP = 0.07


def import_part(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
    if len(meshes) != 1:
        raise RuntimeError(f'{path} 应为单个网格，实际 {len(meshes)} 个')
    ob = meshes[0]
    ob.name = ob.data.name = name
    bpy.context.view_layer.update()
    ob.data.transform(ob.matrix_world)
    ob.parent = None
    ob.matrix_world = Matrix()
    return ob


def principled(ob):
    return next(n for n in ob.active_material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def linked_image_node(socket):
    node = socket.links[0].from_node
    while node.type != 'TEX_IMAGE':
        node = node.inputs['Color'].links[0].from_node
    return node


def coords(ob):
    co = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def sweater_mask(ob):
    """True for vertices whose base colour is the red sweater."""
    image = linked_image_node(principled(ob).inputs['Base Color']).image
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    loops = np.empty(len(ob.data.loops), dtype=np.int64)
    ob.data.loops.foreach_get('vertex_index', loops)
    uv = np.empty(len(ob.data.loops) * 2)
    ob.data.uv_layers[0].data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    vuv = np.zeros((len(ob.data.vertices), 2))
    vuv[loops] = uv
    x = np.clip((vuv[:, 0] * w).astype(int), 0, w - 1)
    y = np.clip((vuv[:, 1] * h).astype(int), 0, h - 1)
    c = px[y, x]
    # Blush and lips are reddish too but keep green and blue well above the dyed knit.
    return (c[:, 0] > 0.45) & (c[:, 1] < 0.22) & (c[:, 2] < 0.22)


def collar_top(z):
    """Top of the sweater: the highest dense slice of red vertices.

    A plain maximum lands on stray red samples at UV chart borders (brow height on the body).
    """
    edges = np.arange(z.min(), z.max() + 0.01, 0.01)
    counts, _ = np.histogram(z, edges)
    dense = np.nonzero(counts >= 0.25 * np.median(counts[counts > 0]))[0]
    return edges[dense.max() + 1]


def similarity(src, dst):
    """Umeyama: scale, rotation and translation taking src onto dst."""
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    u, d, vt = np.linalg.svd(b.T @ a / len(src))
    sign = np.eye(3)
    sign[2, 2] = np.sign(np.linalg.det(u @ vt))
    r = u @ sign @ vt
    s = np.trace(np.diag(d) @ sign) / (a ** 2).sum(1).mean()
    return s, r, md - s * r @ ms


def register_head(body, head):
    """Fit the head-only generation onto the body's own head above the collar."""
    bco, hco = coords(body), coords(head)
    bc = collar_top(bco[sweater_mask(body)][:, 2])
    hred = sweater_mask(head)
    hc = collar_top(hco[hred][:, 2])
    bpts = bco[bco[:, 2] > bc]
    hpts = hco[(hco[:, 2] > hc) & ~hred]
    s = (bpts[:, 2].max() - bc) / (hpts[:, 2].max() - hc)
    r = np.eye(3)
    t = np.array([bpts[:, 0].mean(), bpts[:, 1].mean(), bc]) - s * np.array([hpts[:, 0].mean(), hpts[:, 1].mean(), hc])
    tree = kdtree.KDTree(len(bpts))
    for i, p in enumerate(bpts):
        tree.insert(p, i)
    tree.balance()
    sample = hpts[np.random.default_rng(7).choice(len(hpts), min(20_000, len(hpts)), replace=False)]
    for _ in range(40):
        moved = (s * (r @ sample.T)).T + t
        nearest = np.array([tree.find(p)[0] for p in moved])
        ds, dr, dt = similarity(moved, nearest)
        s, r, t = ds * s, dr @ r, ds * (dr @ t) + dt
    err = np.linalg.norm((s * (r @ sample.T)).T + t - np.array([tree.find(p)[0] for p in (s * (r @ sample.T)).T + t]), axis=1)
    m = Matrix.Identity(4)
    for i in range(3):
        for j in range(3):
            m[i][j] = s * r[i, j]
        m[i][3] = t[i]
    head.data.transform(m)
    print(f'head registration: scale {s:.4f}, mean error {err.mean():.4f}, collar body {bc:.3f}', flush=True)
    return bc


def delete_vertices(ob, mask):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(mask)[0]], context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()


def assemble():
    scene.reset()
    body = import_part(BODY, 'body')
    head = import_part(HEAD, 'head')
    collar = register_head(body, head)
    bco = coords(body)
    delete_vertices(body, (bco[:, 2] > collar) & ~sweater_mask(body))
    hco = coords(head)
    delete_vertices(head, (hco[:, 2] < collar - NECK_OVERLAP) | sweater_mask(head))
    parts = [body, head]
    pts = np.concatenate([coords(o) for o in parts])
    lo, hi = pts.min(0), pts.max(0)
    fit = Matrix.Scale(scene.HEIGHT / (hi[2] - lo[2]), 4) @ Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))
    for o in parts:
        o.data.transform(fit)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'grassy-rodin-source.blend'))


def bake(low, high, image, kind):
    """Bake one pass from the full-resolution part into image through a temporary active node."""
    nodes = low.active_material.node_tree.nodes
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    nodes.active = target
    bpy.ops.object.select_all(action='DESELECT')
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    if kind == 'COLOR':
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    else:
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    nodes.remove(target)


def decimate(low, triangles):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = low
    low.select_set(True)
    mod = low.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = min(1.0, triangles / sum(len(p.vertices) - 2 for p in low.data.polygons))
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.delete_loose()
    bpy.ops.object.mode_set(mode='OBJECT')


def rebake(low, high, triangles, size):
    """Rodin splits vertices along thousands of tiny UV charts: collapsing drags UVs into the
    black atlas gaps and chart borders bake as cracks. Weld, collapse, unwrap anew and bake."""
    bm = bmesh.new()
    bm.from_mesh(low.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(low.data)
    bm.free()
    decimate(low, triangles)
    for layer in list(low.data.uv_layers):
        low.data.uv_layers.remove(layer)
    low.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    mat = bpy.data.materials.new(low.name)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.55
    bsdf.inputs['Metallic'].default_value = 0.0
    color = bpy.data.images.new(f'{low.name}-color', size, size)
    normal = bpy.data.images.new(f'{low.name}-normal', size, size)
    normal.colorspace_settings.name = 'Non-Color'
    color_node = tree.nodes.new('ShaderNodeTexImage')
    color_node.image = color
    tree.links.new(color_node.outputs['Color'], bsdf.inputs['Base Color'])
    normal_node = tree.nodes.new('ShaderNodeTexImage')
    normal_node.image = normal
    normal_map = tree.nodes.new('ShaderNodeNormalMap')
    tree.links.new(normal_node.outputs['Color'], normal_map.inputs['Color'])
    tree.links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    low.data.materials.clear()
    low.data.materials.append(mat)
    bake(low, high, color, 'COLOR')
    bake(low, high, normal, 'NORMAL')


def bake_tier(tier, budget, size, cage):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'grassy-rodin-source.blend'))
    s = bpy.context.scene
    s.cycles.samples = 1
    s.render.bake.use_selected_to_active = True
    s.render.bake.cage_extrusion = cage
    s.render.bake.max_ray_distance = cage * 3
    s.render.bake.margin = 16
    lows = []
    for name, triangles in budget.items():
        high = bpy.data.objects[name]
        low = high.copy()
        low.data = high.data.copy()
        low.data.materials[0] = high.active_material.copy()
        low.name = low.data.name = f'grassy-rodin-{tier}-{name}'
        s.collection.objects.link(low)
        rebake(low, high, triangles, size)
        lows.append(low)
    for name in budget:
        bpy.data.objects.remove(bpy.data.objects[name])
    # Collapse moves the extremes slightly; refit so every tier stands exactly 3.1 on z=0.
    pts = np.concatenate([coords(o) for o in lows])
    lo, hi = pts.min(0), pts.max(0)
    fit = Matrix.Scale(scene.HEIGHT / (hi[2] - lo[2]), 4) @ Matrix.Translation((0, 0, -lo[2]))
    for o in lows:
        o.data.transform(fit)
    bpy.ops.object.select_all(action='DESELECT')
    for o in lows:
        o.select_set(True)
    path = OUT / f'grassy-rodin-{tier}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_animations=False,
                              export_image_format='JPEG', export_image_quality=90)
    # pack_all skips generated images, which reopen blank.
    for image in bpy.data.images:
        if image.is_dirty or image.source == 'GENERATED':
            image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / f'grassy-rodin-{tier}.blend'))
    zs = np.concatenate([coords(o)[:, 2] for o in lows])
    stats = {'id': tier, 'triangles': sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in lows),
             'meshObjects': len(lows), 'materials': len(lows), 'height': round(float(zs.max() - zs.min()), 6),
             'sole': round(float(zs.min()), 6), 'texture': size, 'bytes': path.stat().st_size,
             'path': f'/characters/human/history/models-rodin/{path.name}'}
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'Medium High Contrast'
    s.render.film_transparent = True
    scene.studio()
    for view in ('hero', 'front', 'right', 'back', 'left'):
        scene.render(view, 'full', OUT / f'render-{tier}-{view}.png', 48)
    return stats


assemble()
if '--assemble-only' in sys.argv:
    sys.exit(0)
OUT.mkdir(parents=True, exist_ok=True)
manifest = {'name': 'Rodin 版', 'height': scene.HEIGHT, 'orientation': 'Y-up, +Z forward', 'pose': 'static',
            'reference': '/characters/human/history/turnaround-master-v2/right.png',
            'source': 'Hyper3D Rodin Gen-2.5-High：四向原画生成的四边面全身，加四向头部裁图单独生成的头部',
            'models': [bake_tier(tier, *spec) for tier, spec in TIERS.items()]}
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print('finished', json.dumps(manifest, ensure_ascii=False))
