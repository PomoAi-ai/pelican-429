"""Build Grassy's editable static sculpture, then derive shared game assets."""
import argparse
import json
import math
import sys
from array import array
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True

from static_body import build_body
from static_head import build_head

MODEL_DIR = ROOT / 'assets/characters/grassy/history/model-static'
PUBLIC_DIR = ROOT / 'public/characters/human/history/models'
REFERENCE_DIR = ROOT / 'public/characters/human/history/turnaround-master-v2'
HEIGHT = 3.1


def linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def rgb(hex_color):
    return tuple(linear(int(hex_color[i:i + 2], 16) / 255) for i in (0, 2, 4))


def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb(color), 1)
    shader = mat.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = mat.diffuse_color
    shader.inputs['Roughness'].default_value = roughness
    return mat


def fabric(mat, style, color):
    """Packed tileable surface maps keep textile detail in all exported tiers."""
    size = 256
    base = tuple(int(color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    colors, normals = array('f'), array('f')
    for y in range(size):
        for x in range(size):
            u, v = x / size, y / size
            if style == 'knit':
                row = v * 32
                phase = u * 32 + abs(row % 1 - 0.5) * 0.65
                a = math.tau * phase
                b = math.tau * row
                shade = 1 + 0.014 * math.cos(a) + 0.008 * math.cos(b)
                nx, ny = 0.20 * math.sin(a), 0.13 * math.sin(b)
            else:
                a = math.tau * (u * 64 + v * 48)
                b = math.tau * v * 64
                shade = 1 + 0.018 * math.cos(a) + 0.008 * math.cos(b)
                nx, ny = 0.13 * math.sin(a), 0.12 * math.sin(a) + 0.05 * math.sin(b)
            colors.extend((*[linear(min(1, max(0, c * shade))) for c in base], 1))
            normal = Vector((nx, ny, 1)).normalized()
            normals.extend(((normal.x + 1) * 0.5, (normal.y + 1) * 0.5, (normal.z + 1) * 0.5, 1))
    color_image = bpy.data.images.new(f'{style}_color', width=size, height=size, alpha=False)
    color_image.pixels.foreach_set(colors)
    color_image.pack()
    normal_image = bpy.data.images.new(f'{style}_normal', width=size, height=size, alpha=False)
    normal_image.colorspace_settings.name = 'Non-Color'
    normal_image.pixels.foreach_set(normals)
    normal_image.pack()
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes['Principled BSDF']
    tex_color = nodes.new('ShaderNodeTexImage')
    tex_color.image = color_image
    links.new(tex_color.outputs['Color'], shader.inputs['Base Color'])
    tex_normal = nodes.new('ShaderNodeTexImage')
    tex_normal.image = normal_image
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = 0.20
    links.new(tex_normal.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], shader.inputs['Normal'])
    mat['grassy_weave_scale'] = 6.0


def make_materials():
    specs = {
        'skin': ('f4b898', 0.48), 'skin_blush': ('eea18f', 0.54),
        'skin_nail': ('f4c4b0', 0.48), 'hair': ('1d1512', 0.57),
        'hair_light': ('2a1e18', 0.58), 'hair_dark': ('140e0c', 0.56),
        'brow': ('31201a', 0.55), 'eye_white': ('fff7e9', 0.23),
        'iris': ('673b23', 0.27), 'iris_light': ('a77039', 0.28),
        'pupil': ('120b08', 0.18), 'highlight': ('fffdf7', 0.10),
        'lip': ('bb6958', 0.53), 'mouth_shadow': ('73352b', 0.68),
        'sweater': ('d9292c', 0.83), 'sweater_rib': ('bb222b', 0.83),
        'denim': ('4b7197', 0.84), 'denim_cuff': ('728ba4', 0.83),
        'stitch': ('bf8c55', 0.78), 'shoe': ('f3e8d9', 0.62),
        'sole': ('e0d5c5', 0.74), 'shoe_trim': ('b4a296', 0.73),
        'shoe_lace': ('fff3e3', 0.71),
    }
    mats = {name: material(name, *values) for name, values in specs.items()}
    skin = mats['skin'].node_tree.nodes['Principled BSDF']
    skin.inputs['Subsurface Weight'].default_value = 0.055
    skin.inputs['Specular IOR Level'].default_value = 0.25
    for name in ['hair', 'hair_light', 'hair_dark']:
        mats[name].node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = 0.24
    fabric(mats['sweater'], 'knit', specs['sweater'][0])
    fabric(mats['denim'], 'denim', specs['denim'][0])
    return mats


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
        if any('grassy_weave_scale' in mat for mat in obj.data.materials):
            for uv in obj.data.uv_layers.active.data:
                uv.uv *= 6


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
        activate([obj])
        bpy.ops.object.material_slot_remove_unused()
        mat = obj.data.materials[0]
        groups.setdefault(mat.name, []).append(obj)
    for name, objects in groups.items():
        activate(objects)
        if len(objects) > 1:
            bpy.ops.object.join()
        bpy.context.object.name = 'Grassy_' + name


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
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.72, 0.77, 0.85, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.45
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
        ('Key', (-3, -4, 5.5), 480, 3.4),
        ('Fill', (3.4, -2.5, 4), 360, 3.2),
        ('Rim', (1, 3, 4.6), 600, 2.6),
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
                 'face': (2.8, -7, 2.9)}
    for view in views:
        camera.location = positions[view]
        target = Vector((0, 0, 2.52 if view == 'face' else 1.55))
        camera.data.ortho_scale = 1.4 if view == 'face' else 3.55
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
        objects = [*build_body(mats), *build_head(mats)]
        source = collection('Detailed sculpture', objects)
    normalize(list(source.objects))
    ensure_uv([obj for obj in source.objects if obj.type == 'MESH'])
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
