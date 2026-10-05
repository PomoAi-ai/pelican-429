"""Build Grassy's editable static sculpture, then derive shared game assets."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True

from static_body import build_body
from static_head import build_head
from static_materials import make_materials, material, rgb, shade_denim

MODEL_DIR = ROOT / 'assets/characters/grassy/history/model-static'
PUBLIC_DIR = ROOT / 'public/characters/human/history/models'
REFERENCE_DIR = ROOT / 'public/characters/human/history/turnaround-master-v2'
HEIGHT = 3.1


def activate(objects):
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def bounds(objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    low, high = [math.inf] * 3, [-math.inf] * 3
    for source in objects:
        obj = source.evaluated_get(depsgraph)
        # Curve control bounds can extend well beyond their visible surface.
        mesh = obj.to_mesh()
        for vertex in mesh.vertices:
            point = obj.matrix_world @ vertex.co
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
        obj.to_mesh_clear()
    return low, high


def normalize(objects):
    bpy.context.view_layer.update()
    low, high = bounds(objects)
    scale = HEIGHT / (high[2] - low[2])
    for obj in objects:
        obj.location.z -= low[2]
        obj.location *= scale
        obj.scale *= scale
    bpy.context.view_layer.update()
    return scale


def collection(name, objects):
    target = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(target)
    for obj in objects:
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        target.objects.link(obj)
    return target


def mesh_copy(source, name):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    target = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(target)
    for original in source.objects:
        evaluated = original.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        obj = bpy.data.objects.new(original.name + '_' + name, mesh)
        obj.matrix_world = original.matrix_world.copy()
        obj['grassy_part'] = original.get('grassy_part', 'body')
        obj['grassy_detail'] = original.get('grassy_detail', 0)
        target.objects.link(obj)
    return target


def ensure_uv(objects):
    for obj in objects:
        if obj.data.uv_layers:
            continue
        activate([obj])
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.008)
        bpy.ops.object.mode_set(mode='OBJECT')


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def simplify(target, variant):
    budgets = {
        'game': {'face': 8500, 'eyes': 2800, 'ears': 1200, 'hair': 10000,
                 'hair_detail': 800, 'body': 1200, 'clothes': 8500,
                 'hands': 2800, 'shoes': 4000, 'seams': 1200, 'ribbing': 2200,
                 'cuffs': 1800, 'micro_seams': 0},
        'light': {'face': 3200, 'eyes': 1400, 'ears': 550, 'hair': 3400,
                  'hair_detail': 0, 'body': 500, 'clothes': 3000,
                  'hands': 1400, 'shoes': 1700, 'seams': 350, 'ribbing': 900,
                  'cuffs': 1000, 'micro_seams': 0},
    }[variant]
    groups = {}
    for obj in list(target.objects):
        part = obj['grassy_part']
        if part not in budgets:
            raise ValueError(f'Unknown Grassy geometry group {part}: {obj.name}')
        if budgets[part] == 0:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            groups.setdefault(part, []).append(obj)
    for part, objects in groups.items():
        count = sum(triangles(obj) for obj in objects)
        ratio = min(1, budgets[part] / count)
        for obj in objects:
            if ratio < 0.98 and triangles(obj) > 24:
                activate([obj])
                modifier = obj.modifiers.new('Preserve volume', 'DECIMATE')
                modifier.ratio = ratio
                modifier.use_collapse_triangulate = True
                bpy.ops.object.modifier_apply(modifier=modifier.name)
    normalize(list(target.objects))


def material_groups(target):
    """Merging disconnected pieces with a common material cuts game draw calls."""
    for obj in list(target.objects):
        if len(obj.data.materials) > 1:
            activate([obj])
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.separate(type='MATERIAL')
            bpy.ops.object.mode_set(mode='OBJECT')
    groups = {}
    for obj in list(target.objects):
        # Join matches UV layers by name. Preserve each copied part's mapping
        # as the shared active layer before consolidating materials.
        obj.data.uv_layers.active.name = 'UVMap'
        activate([obj])
        bpy.ops.object.material_slot_remove_unused()
        mat = obj.data.materials[0]
        groups.setdefault(mat.name, []).append(obj)
    for name, objects in groups.items():
        activate(objects)
        if len(objects) > 1:
            bpy.ops.object.join()
        bpy.context.object.name = 'Grassy_' + name


def resize_variant_textures(target, variant):
    """Keep fine maps in the master while matching each game tier's screen size."""
    size = {'game': 512, 'light': 256}[variant]
    materials, images = {}, {}
    for obj in target.objects:
        for slot in obj.material_slots:
            original = slot.material
            if original not in materials:
                copied = original.copy()
                copied.name = original.name + '_' + variant
                for node in copied.node_tree.nodes:
                    if node.type != 'TEX_IMAGE':
                        continue
                    source = node.image
                    if source not in images:
                        reduced = source.copy()
                        reduced.name = source.name + '_' + variant
                        reduced.scale(size, size)
                        reduced.pack()
                        images[source] = reduced
                    node.image = images[source]
                materials[original] = copied
            slot.material = materials[original]


def export(target, variant):
    objects = list(target.objects)
    activate(objects)
    path = PUBLIC_DIR / f'grassy-{variant}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, collection=target.name,
                             export_yup=True, export_animations=False, export_skins=False,
                             export_apply=True, export_materials='EXPORT', export_cameras=False,
                             export_lights=False)
    low, high = bounds(objects)
    stats = {'id': variant, 'triangles': sum(triangles(obj) for obj in objects),
             'meshObjects': len(objects), 'materials': len({mat.name for obj in objects for mat in obj.data.materials}),
             'height': round(high[2] - low[2], 6), 'width': round(high[0] - low[0], 6),
             'depth': round(high[1] - low[1], 6), 'bytes': path.stat().st_size,
             'path': '/characters/human/history/models/' + path.name}
    print('GRASSY_ASSET', json.dumps(stats), flush=True)
    return stats


def references():
    target = bpy.data.collections.new('Approved four-view references')
    bpy.context.scene.collection.children.link(target)
    for name, position, rotation in [
        ('front', (0, 0.8, 1.55), (math.pi / 2, 0, 0)),
        ('back', (0, -0.8, 1.55), (math.pi / 2, 0, math.pi)),
        ('left', (0.8, 0, 1.55), (math.pi / 2, 0, -math.pi / 2)),
        ('right', (-0.8, 0, 1.55), (math.pi / 2, 0, math.pi / 2)),
    ]:
        obj = bpy.data.objects.new('Reference_' + name, None)
        obj.empty_display_type = 'IMAGE'
        obj.data = bpy.data.images.load(str(REFERENCE_DIR / (name + '.png')))
        obj.data.pack()
        obj.empty_display_size = 3.32
        obj.location, obj.rotation_euler = position, rotation
        obj.color[3] = 0.25
        obj.empty_image_depth = 'BACK'
        obj.hide_render = True
        target.objects.link(obj)
    target.hide_viewport = True
    target.hide_render = True


def studio(size, samples):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = size
    scene.render.resolution_y = round(size * 1.15)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.72, 0.77, 0.85, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.18
    studio_objects = []
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.008))
    floor = bpy.context.object
    floor.name = 'Studio_floor'
    floor_mat = material('Studio_floor', 'edf1f5', 0.86)
    floor_shader = floor_mat.node_tree.nodes['Principled BSDF']
    floor_shader.inputs['Emission Color'].default_value = (*rgb('edf1f5'), 1)
    floor_shader.inputs['Emission Strength'].default_value = 0.22
    floor.data.materials.append(floor_mat)
    studio_objects.append(floor)
    for name, location, energy, area in [
        ('Key', (-3, -4, 5.5), 550, 3.0),
        ('Fill', (3.4, -2.5, 4), 100, 3.2),
        ('Rim', (1, 3, 4.6), 210, 2.6),
    ]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.name, light.data.energy, light.data.size = name, energy, area
        light.rotation_euler = (Vector((0, 0, 1.6)) - light.location).to_track_quat('-Z', 'Y').to_euler()
        studio_objects.append(light)
    bpy.ops.object.camera_add(location=(4, -8, 2.8))
    camera = bpy.context.object
    camera.name = 'Studio_camera'
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 3.55
    camera.rotation_euler = (Vector((0, 0, 1.55)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    studio_objects.append(camera)
    collection('Studio', studio_objects)
    return camera


def render_views(camera, variant, views):
    positions = {'hero': (4.5, -8, 3.0), 'front': (0, -8, 1.55),
                 'back': (0, 8, 1.55), 'right': (-8, 0, 1.55), 'left': (8, 0, 1.55),
                 'face': (2.8, -7, 2.9), 'face-front': (0, -8, 2.55),
                 'cloth': (2.1, -8, 1.65), 'shoes': (3, -8, 1.1)}
    crops = {'face': (2.53, 1.26), 'face-front': (2.53, 1.26),
             'cloth': (1.54, 1.32), 'shoes': (.34, 1.10)}
    for view in views:
        camera.location = positions[view]
        height, frame = crops[view] if view in crops else (1.55, 3.55)
        target = Vector((0, 0, height))
        camera.data.ortho_scale = frame
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        path = PUBLIC_DIR / f'render-{variant}-{view}.png'
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        print('GRASSY_RENDER', str(path), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--views', default='hero,front,right,back,left,face')
    parser.add_argument('--samples', type=int, default=32)
    parser.add_argument('--size', type=int, default=900)
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--detail-views', default='face,face-front,cloth,shoes')
    parser.add_argument('--from-blend', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    if args.from_blend:
        bpy.ops.wm.open_mainfile(filepath=str(args.from_blend))
        source = bpy.data.collections['Detailed sculpture']
        for item in list(bpy.data.collections):
            if item != source:
                for obj in list(item.objects):
                    bpy.data.objects.remove(obj, do_unlink=True)
                bpy.data.collections.remove(item)
        source.hide_viewport = False
        source.hide_render = False
    else:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
        mats = make_materials()
        print('GRASSY_BUILD materials complete', flush=True)
        body = build_body(mats)
        print('GRASSY_BUILD body complete', flush=True)
        shade_denim(body, mats)
        objects = [*body, *build_head(mats)]
        print('GRASSY_BUILD head and hair complete', flush=True)
        source = collection('Detailed sculpture', objects)
    normalize(list(source.objects))
    ensure_uv([obj for obj in source.objects if obj.type == 'MESH'])
    print('GRASSY_BUILD surfaces complete', flush=True)
    camera = studio(args.size, args.samples)
    references()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action='DESELECT')
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_location = (0, 0, 1.55)
                area.spaces.active.region_3d.view_distance = 4.9
                area.spaces.active.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
                area.spaces.active.region_3d.view_perspective = 'ORTHO'
                area.spaces.active.shading.type = 'MATERIAL'
                area.spaces.active.overlay.show_overlays = False
    bpy.ops.wm.save_as_mainfile(filepath=str(MODEL_DIR / 'grassy-detailed.blend'))
    if args.preview:
        render_views(camera, 'detailed', args.views.split(','))
        print('GRASSY_PREVIEW_COMPLETE', flush=True)
        return
    detailed = mesh_copy(source, 'Detailed export')
    ensure_uv(list(detailed.objects))
    source.hide_render = True
    source.hide_viewport = True
    variants = {'detailed': detailed}
    for variant in ['game', 'light']:
        variants[variant] = mesh_copy(detailed, variant.capitalize() + ' export')
        simplify(variants[variant], variant)
        resize_variant_textures(variants[variant], variant)
    statistics = []
    for variant, target in variants.items():
        material_groups(target)
        statistics.append(export(target, variant))
        target.hide_render = True
        target.hide_viewport = True
    manifest = {'height': HEIGHT, 'orientation': 'Y-up, +Z forward', 'pose': 'static',
                'reference': '/characters/human/history/turnaround-master-v2/right.png', 'models': statistics}
    (PUBLIC_DIR / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    for variant, target in variants.items():
        target.hide_render = False
        target.hide_viewport = False
        render_views(camera, variant, args.views.split(','))
        if variant == 'detailed' and args.detail_views:
            render_views(camera, variant, args.detail_views.split(','))
        target.hide_render = True
        target.hide_viewport = True
    source.hide_render = False
    source.hide_viewport = False
    for variant, target in variants.items():
        target.hide_viewport = variant != 'game'
        target.hide_render = variant != 'game'
    source.hide_render = True
    source.hide_viewport = True
    bpy.ops.wm.save_as_mainfile(filepath=str(MODEL_DIR / 'grassy-variants.blend'))
    print('GRASSY_STATIC_COMPLETE', json.dumps(statistics), flush=True)


if __name__ == '__main__':
    main()
