"""Create a new editable sculpture and an independently verifiable GLB."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SOURCE = ROOT / 'assets/characters/grassy/history/model-atelier'
PUBLIC = ROOT / 'public/characters/human/history/models-atelier'
REFERENCES = ROOT / 'public/characters/human/history/turnaround-master-v2'
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True

from common import activate, collection, material, materials
from face import build_face
from comparison import compare_view


def bounds(objects):
    low, high = [math.inf] * 3, [-math.inf] * 3
    for obj in objects:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high


def normalize(objects):
    bpy.context.view_layer.update()
    low, high = bounds(objects)
    factor = 3.1 / (high[2] - low[2])
    for obj in objects:
        obj.location.z -= low[2]
        obj.location *= factor
        obj.scale *= factor
    bpy.context.view_layer.update()


def reference_collection():
    objects = []
    for name, rotation in [('front', (math.pi / 2, 0, 0)),
                           ('back', (math.pi / 2, 0, math.pi)),
                           ('left', (math.pi / 2, 0, -math.pi / 2)),
                           ('right', (math.pi / 2, 0, math.pi / 2))]:
        obj = bpy.data.objects.new('Reference • ' + name, None)
        obj.empty_display_type = 'IMAGE'
        obj.data = bpy.data.images.load(str(REFERENCES / (name + '.png')))
        obj.data.pack()
        obj.empty_display_size = 3.3
        obj.location = (0, .65, 1.55)
        obj.rotation_euler = rotation
        obj.color[3] = .25
        obj.hide_render = True
        bpy.context.scene.collection.objects.link(obj)
        objects.append(obj)
    target = collection('References • packed four views', objects)
    target.hide_viewport = True
    target.hide_render = True


def export(objects):
    target = bpy.data.collections.new('Export geometry')
    bpy.context.scene.collection.children.link(target)
    copies = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for original in objects:
        evaluated = original.evaluated_get(depsgraph)
        data = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        obj = bpy.data.objects.new(original.name, data)
        obj.matrix_world = original.matrix_world.copy()
        target.objects.link(obj)
        copies.append(obj)
    groups = {}
    for obj in copies:
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    merged = []
    for name, members in groups.items():
        activate(members)
        if len(members) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = name
        merged.append(obj)
    activate(merged)
    path = PUBLIC / 'grassy-atelier-detailed.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                             export_yup=True, export_apply=True, export_materials='EXPORT',
                             export_animations=False, export_skins=False,
                             export_cameras=False, export_lights=False)
    triangle_count = 0
    for obj in merged:
        obj.data.calc_loop_triangles()
        triangle_count += len(obj.data.loop_triangles)
    low, high = bounds(merged)
    report = {'name': 'gpt6.1sol版本', 'sourceObjects': len(objects),
              'exportMeshes': len(merged), 'triangles': triangle_count,
              'materials': len(groups), 'height': high[2] - low[2],
              'width': high[0] - low[0], 'depth': high[1] - low[1],
              'glbBytes': path.stat().st_size, 'static': True,
              'glb': str(path), 'blend': str(SOURCE / 'grassy-atelier-detailed.blend')}
    for obj in merged:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(target)
    (PUBLIC / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('ATELIER_EXPORT ' + json.dumps(report), flush=True)


def studio():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'Khronos PBR Neutral'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.render.film_transparent = True
    world = bpy.data.worlds.new('Warm neutral studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.72, .76, .83, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .14
    scene.world = world
    objects = []
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.012))
    plane = bpy.context.object
    plane.name = 'Studio • matte floor'
    plane.hide_render = True
    plane.data.materials.append(material('Studio_floor', 'e5e7eb', .85))
    objects.append(plane)
    for name, pos, energy, size, color in [
        ('Key', (-3, -4.5, 6), 450, 4, (1.0, .95, .90)),
        ('Fill', (3, -4, 3.4), 110, 3, (.85, .92, 1)),
        ('Bounce', (0, -3, .7), 40, 3, (1, .92, .86)),
        ('Rim', (1.3, 3.3, 4.5), 300, 2, (1, .92, .84)),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.shape = 'DISK'
        data.energy, data.size, data.color = energy, size, color
        obj = bpy.data.objects.new('Studio • ' + name, data)
        obj.location = pos
        obj.rotation_euler = (Vector((0, 0, 1.6)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(obj)
        objects.append(obj)
    camera = bpy.data.objects.new('Studio • Camera', bpy.data.cameras.new('Camera'))
    scene.collection.objects.link(camera)
    camera.data.type = 'ORTHO'
    camera.data.clip_end = 200
    scene.camera = camera
    objects.append(camera)
    collection('Studio • excluded from GLB', objects)
    return camera


def render_device(device):
    scene = bpy.context.scene
    scene.cycles.device = 'CPU' if device == 'CPU' else 'GPU'
    if device != 'CPU':
        preferences = bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type = device
        preferences.get_devices()
        selected = [item for item in preferences.devices if item.type == device]
        if not selected:
            raise RuntimeError(f'Cycles render device {device} is unavailable')
        for item in preferences.devices:
            item.use = item.type == device


def set_view(camera, view, size):
    crops = {'face': (2.51, 1.28), 'face-front': (2.51, 1.28),
             'cloth': (1.60, 1.30), 'shoes': (.24, .92)}
    z, frame = crops[view] if view in crops else (1.55, 3.45)
    positions = {'front': (0, -8, z), 'back': (0, 8, z),
                 'right': (-8, 0, z), 'left': (8, 0, z),
                 'hero': (-4.3, -8, 2.7), 'face': (-3.1, -8, 2.85),
                 'face-front': (0, -8, 2.51), 'cloth': (-2.1, -8, 2.2),
                 'shoes': (-3, -8, 2.3)}
    camera.location = positions[view]
    camera.data.ortho_scale = frame
    camera.rotation_euler = (Vector((0, 0, z)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene = bpy.context.scene
    scene.render.resolution_x = size
    scene.render.resolution_y = size if view in crops else round(size * 1.16)
    scene.render.resolution_percentage = 100


def render_views(camera, views, samples, size, prefix='render'):
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    for view in views:
        set_view(camera, view, size)
        scene.render.filepath = str(PUBLIC / f'{prefix}-{view}.png')
        bpy.ops.render.render(write_still=True)
        print('ATELIER_RENDER ' + view, flush=True)
        if prefix == 'render' and view in ('front', 'right'):
            compare_view(PUBLIC, REFERENCES, view)


def viewport(objects):
    activate([obj for obj in objects if obj.name.startswith('Face')])
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                space = area.spaces.active
                space.shading.type = 'MATERIAL'
                space.overlay.show_overlays = False
                space.region_3d.view_distance = 5.4
                space.region_3d.view_location = (0, 0, 1.55)
                space.region_3d.view_rotation = Quaternion((.86, .50, -.035, -.06))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--views', default='front,back,left,right,hero,face,face-front,cloth,shoes')
    parser.add_argument('--samples', type=int, default=32)
    parser.add_argument('--size', type=int, default=1000)
    parser.add_argument('--render-only', action='store_true')
    parser.add_argument('--device', choices=['CPU', 'METAL'], default='CPU')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    SOURCE.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    if args.render_only:
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'grassy-atelier-detailed.blend'))
        camera = bpy.context.scene.camera
    else:
        from hair import build_hair
        from outfit import build_outfit
        bpy.ops.wm.read_factory_settings(use_empty=True)
        mats = materials()
        face = build_face(mats)
        hair = build_hair(mats)
        outfit = build_outfit(mats, SOURCE / 'textures')
        collection('Face ears hands • editable parts', face)
        collection('Hair • individual sculpted locks', hair)
        collection('Outfit • knit denim sneakers', outfit)
        objects = [*face, *hair, *outfit]
        normalize(objects)
        export(objects)
        reference_collection()
        camera = studio()
        set_view(camera, 'hero', args.size)
        viewport(objects)
        bpy.context.scene['Model'] = 'gpt6.1sol版本 • independent Grassy sculpture; static, unrigged'
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'grassy-atelier-detailed.blend'))
    render_device(args.device)
    if args.views:
        render_views(camera, args.views.split(','), args.samples, args.size)


if __name__ == '__main__':
    main()
