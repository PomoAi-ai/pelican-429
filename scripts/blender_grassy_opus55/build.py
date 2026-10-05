"""Build the Opus 5.5 Grassy: editable source, real renders and three exported tiers.

From the repository root, after sculpting:
  uv run --with numpy --with scikit-image --with scipy python3 scripts/blender_grassy_opus55/sculpt.py BUILD
  blender --background --factory-startup --python scripts/blender_grassy_opus55/build.py -- BUILD [--samples 64]
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True

import dress  # noqa: E402
import scene  # noqa: E402

MODEL_DIR = ROOT / 'assets/characters/grassy/history/model-opus55'
PUBLIC_DIR = ROOT / 'public/characters/human/history/models-opus55'
HEIGHT = 3.1
# Per-part triangle budgets; parts not listed keep their sculpted density in the detailed tier.
TIERS = {
    'detailed': {'head': 110000, 'hair': 190000, 'brows': 6000, 'lashes': 8000, 'sweater': 110000,
                 'hands': 40000, 'jeans': 90000, 'shoes': 50000, 'ankles': 3000, 'eyes': (64, 40)},
    'game': {'head': 7500, 'hair': 13000, 'brows': 400, 'lashes': 700, 'sweater': 8500,
             'hands': 4200, 'jeans': 6000, 'shoes': 4000, 'ankles': 300, 'eyes': (24, 16)},
    'light': {'head': 3200, 'hair': 5600, 'brows': 200, 'lashes': 320, 'sweater': 3400,
              'hands': 1700, 'jeans': 2500, 'shoes': 1600, 'ankles': 120, 'eyes': (14, 10)},
}
TILES = {'Knit': ('knit', 0.055), 'Denim': ('twill', 0.045)}
# Low tiers bake the sculpt's colours (face paint, stitches, stripes, hair streaks) into textures.
BAKE = {'game': 1024, 'light': 512}
BAKED_PARTS = ('head', 'hair', 'sweater', 'hands', 'jeans', 'shoes')


def normalize_height(objects):
    """Uniformly scale about the origin so the sole sits at 0 and the top reaches HEIGHT."""
    bpy.context.view_layer.update()
    lo, hi = math.inf, -math.inf
    for ob in objects:
        if ob.type == 'MESH':
            m = np.array(ob.matrix_world)
            z = scene.vertices(ob) @ m[:3, :3].T[:, 2] + m[2, 3]
            lo, hi = min(lo, z.min()), max(hi, z.max())
        elif ob.type == 'CURVES':
            co = np.empty(len(ob.data.points) * 3, np.float32)
            ob.data.position_data.foreach_get('vector', co)
            z = co[2::3]
            lo, hi = min(lo, z.min()), max(hi, z.max())
    k = HEIGHT / (hi - lo)
    for ob in objects:
        ob.scale = [v * k for v in ob.scale]
        ob.location = [v * k for v in ob.location]
        ob.location.z -= lo * k
    bpy.context.view_layer.update()
    return lo, hi, k


def fabric_normal(kind, size=256):
    """Tileable normal map: honeycomb knit cells or diagonal denim twill."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    if kind == 'knit':
        # Stockinette: columns of V-shaped stitches, integer frequencies keep it tileable.
        u = (xx * 16) % 1 - 0.5
        h = (0.5 + 0.5 * np.cos(2 * np.pi * (yy * 16 + 0.9 * np.abs(u)))) * (1 - np.abs(u) * 1.3)
    else:
        h = 0.5 + 0.5 * np.sin((xx + yy) * np.pi * 2 * 12)
        h += 0.1 * np.sin(yy * np.pi * 2 * 48)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * size / 2
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * size / 2
    s = 0.012
    n = np.stack([-gx * s, gy * s, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgba = np.concatenate([n * 0.5 + 0.5, np.ones_like(h)[..., None]], -1)
    img = bpy.data.images.new(f'{kind}_normal', size, size, alpha=True)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.flipud(rgba).astype(np.float32).ravel())
    img.pack()
    return img


def uv_world_scale(ob):
    """World units covered by one UV unit after a smart projection."""
    me = ob.data
    area3d = sum(p.area for p in me.polygons)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    area_uv = 0.0
    for p in me.polygons:
        pts = uv[p.loop_start:p.loop_start + p.loop_total]
        x, y = pts[:, 0], pts[:, 1]
        area_uv += 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
    return math.sqrt(area3d / area_uv)


def smart_uv(ob):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    if not ob.data.uv_layers:
        ob.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')


def export_material(ob, normals):
    """Swap procedural fabric relief for a tiled normal map the glTF exporter understands."""
    mat = ob.active_material
    kind, tile = TILES[mat.name.split('.')[0]]
    if not ob.data.uv_layers:
        smart_uv(ob)
    repeat = uv_world_scale(ob) / tile
    new = mat.copy()
    nt = new.node_tree
    for node in list(nt.nodes):
        if node.type in ('BUMP', 'TEX_VORONOI', 'TEX_WAVE', 'TEX_COORD'):
            nt.nodes.remove(node)
    uvn = nt.nodes.new('ShaderNodeUVMap')
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (repeat, repeat, 1)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = normals[kind]
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    nmap.inputs['Strength'].default_value = 0.8
    nt.links.new(uvn.outputs['UV'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
    ob.data.materials[0] = new


def bake_color(high, low, size):
    """Bake the high part's base colour onto the decimated part's fresh UVs."""
    smart_uv(low)
    img = bpy.data.images.new(f'{low.name}_color', size, size)
    mat = low.active_material.copy()
    nt = mat.node_tree
    for node in list(nt.nodes):
        if node.type == 'VERTEX_COLOR':
            nt.nodes.remove(node)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = low.data.uv_layers.active.name
    nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    nt.nodes.active = tex
    low.data.materials[0] = mat
    for o in bpy.context.selected_objects:
        o.select_set(False)
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bake = bpy.context.scene.render.bake
    bake.use_selected_to_active = True
    bake.cage_extrusion = 0.03
    bake.max_ray_distance = 0.12
    bake.margin = 6
    bpy.context.scene.cycles.samples = 4
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    img.pack()
    # The texture now carries the colour; a leftover COLOR_0 would be multiplied in again by three.js.
    for attr in list(low.data.color_attributes):
        low.data.color_attributes.remove(attr)


def triangles(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def decimate(ob, target):
    tris = triangles(ob)
    if target >= tris:
        return
    mod = ob.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = target / tris
    mod.use_collapse_triangulate = True
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)


def build_tier(build, tier):
    scene.reset()
    normals = {'knit': fabric_normal('knit'), 'twill': fabric_normal('twill')}
    dress.assemble(build, strands_hair=False, eye_segments=TIERS[tier]['eyes'])
    objects = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
    for ob in objects:
        for o in bpy.context.selected_objects:
            o.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        part = ob.name.split('_')[0]
        high = None
        if tier in BAKE and part in BAKED_PARTS:
            high = ob.copy()
            high.data = ob.data.copy()
            high.name = f'{part}_high'
            bpy.context.scene.collection.objects.link(high)
        if part in TIERS[tier]:
            decimate(ob, TIERS[tier][part])
        if high is not None:
            bake_color(high, ob, BAKE[tier])
            bpy.data.objects.remove(high)
        if ob.active_material.name.split('.')[0] in TILES:
            export_material(ob, normals)
    # One mesh per material: join the two eyes.
    eyes = [ob for ob in objects if ob.name.startswith('eye_')]
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for ob in eyes:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = eyes[0]
    bpy.ops.object.join()
    eyes[0].name = 'eyes'
    objects = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
    # Normalize after decimation so the exported extremes are exactly sole 0 and top HEIGHT.
    normalize_height(objects)
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    path = PUBLIC_DIR / f'grassy-opus55-{tier}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_animations=False, export_vertex_color='MATERIAL',
                              export_image_format='JPEG' if tier in BAKE else 'AUTO', export_image_quality=88)
    zs = np.concatenate([scene.vertices(ob)[:, 2] for ob in objects])
    xs = np.concatenate([scene.vertices(ob)[:, 0] for ob in objects])
    ys = np.concatenate([scene.vertices(ob)[:, 1] for ob in objects])
    stats = {
        'id': tier,
        'triangles': int(sum(triangles(ob) for ob in objects)),
        'meshObjects': len(objects),
        'materials': len({ob.active_material.name for ob in objects}),
        'height': round(float(zs.max() - zs.min()), 6),
        'sole': round(float(zs.min()), 6),
        'width': round(float(xs.max() - xs.min()), 6),
        'depth': round(float(ys.max() - ys.min()), 6),
        'bytes': path.stat().st_size,
        'path': f'/characters/human/history/models-opus55/{path.name}',
    }
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(MODEL_DIR / f'grassy-opus55-{tier}.blend'), compress=True)
    return stats


def build_source(build, samples, views):
    scene.reset()
    dress.assemble(build, strands_hair=True)
    normalize_height([ob for ob in bpy.context.scene.objects if ob.type in ('MESH', 'CURVES')])
    scene.studio()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for view in views:
        scene.render(view, 'full', MODEL_DIR / f'render-full-{view}.png', samples)
    for view in ('hero', 'front', 'right', 'back'):
        scene.render(view, 'head', MODEL_DIR / f'render-head-{view}.png', samples)
    bpy.ops.wm.save_as_mainfile(filepath=str(MODEL_DIR / 'grassy-opus55-source.blend'), compress=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('build')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--views', default='hero,front,right,back,left')
    ap.add_argument('--skip-source', action='store_true')
    ap.add_argument('--tiers', default=','.join(TIERS))
    args = ap.parse_args(argv)
    build = Path(args.build)
    if not args.skip_source:
        build_source(build, args.samples, args.views.split(','))
    models = []
    for tier in args.tiers.split(','):
        models.append(build_tier(build, tier))
        print('TIER', json.dumps(models[-1]))
    manifest = {'name': 'Opus 5.5 版', 'height': HEIGHT, 'orientation': 'Y-up, +Z forward', 'pose': 'static',
                'reference': '/characters/human/history/turnaround-master-v2/right.png', 'models': models}
    (PUBLIC_DIR / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


main()
