"""Build the editable Grassy character and the shared game asset in Blender."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from body import build_body, create_coding_props, bake_actions
from head import build_head


def linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def rgb(hex_color):
    return tuple(linear(int(hex_color[i:i + 2], 16) / 255) for i in (0, 2, 4))


def material(name, color, roughness=0.65):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb(color), 1)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb(color), 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def fabric_texture(mat, style, color):
    """A small packed image survives GLB export, unlike Blender-only noise nodes."""
    size = 512
    image = bpy.data.images.new(f'{style}_weave', width=size, height=size, alpha=False)
    base = tuple(int(color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    pixels = []
    for y in range(size):
        for x in range(size):
            if style == 'denim':
                weave = math.sin((x + y * 1.5) * math.pi / 3) * 0.035
                weave += math.sin(y * math.pi) * 0.015
                fade = 0.018 * math.sin(x * 0.071) * math.cos(y * 0.037)
            else:
                course = y % 6 / 6
                wale = (x + abs(course - 0.5) * 4) % 4 / 4
                weave = 0.025 * math.cos(wale * math.tau) + 0.012 * math.sin(course * math.tau)
                fade = 0
            for channel in base:
                pixels.append(linear(max(0, min(1, channel * (1 + weave) + fade))))
            pixels.append(1)
    image.pixels.foreach_set(pixels)
    image.pack()
    nodes = mat.node_tree.nodes
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    bsdf = nodes.get('Principled BSDF')
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])


def make_materials():
    specs = {
        'skin': ('efb493', 0.60), 'skin_blush': ('e9a28e', 0.64),
        'hair': ('251b19', 0.43), 'hair_light': ('382822', 0.48),
        'eye_white': ('fff8eb', 0.25), 'iris': ('70401e', 0.25),
        'pupil': ('120b08', 0.15), 'lip': ('b45c52', 0.58),
        'sweater': ('d94139', 0.83), 'sweater_rib': ('bd312e', 0.85),
        'denim': ('527797', 0.84), 'denim_cuff': ('8b9dad', 0.87),
        'stitch': ('b99b70', 0.82), 'shoe': ('f3e9d8', 0.64),
        'sole': ('dcd0bc', 0.81), 'wood': ('b98966', 0.79),
        'frame': ('34414d', 0.58), 'screen': ('243f53', 0.35),
    }
    mats = {name: material(name, *spec) for name, spec in specs.items()}
    skin = mats['skin'].node_tree.nodes.get('Principled BSDF')
    skin.inputs['Subsurface Weight'].default_value = 0.06
    fabric_texture(mats['sweater'], 'knit', 'd94139')
    fabric_texture(mats['denim'], 'denim', '527797')
    return mats


def ensure_uv(objects):
    for obj in objects:
        if obj.type != 'MESH' or obj.data.uv_layers:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(65), island_margin=0.012)
        bpy.ops.object.mode_set(mode='OBJECT')


def add_references():
    collection = bpy.data.collections.new('Modeling references')
    bpy.context.scene.collection.children.link(collection)
    references = ROOT / 'public/characters/human/history/turnaround'
    for name, position, rotation in [
        ('front', (0, 0.75, 1.8), (math.pi / 2, 0, 0)),
        ('back', (0, -0.75, 1.8), (math.pi / 2, 0, math.pi)),
        ('left', (0.75, 0, 1.8), (math.pi / 2, 0, -math.pi / 2)),
        ('right', (-0.75, 0, 1.8), (math.pi / 2, 0, math.pi / 2)),
    ]:
        obj = bpy.data.objects.new(f'Reference_{name}', None)
        obj.empty_display_type = 'IMAGE'
        obj.data = bpy.data.images.load(str(references / f'{name}.png'))
        obj.data.pack()
        obj.empty_display_size = 4.0
        obj.location = position
        obj.rotation_euler = rotation
        obj.color[3] = 0.28
        obj.empty_image_depth = 'BACK'
        obj.hide_render = True
        collection.objects.link(obj)
    collection.hide_viewport = True


def studio():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.world.color = (0.28, 0.28, 0.28)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.72, 0.76, 0.82, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.55
    floor_mat = material('Studio backdrop', 'e5e8eb', 0.85)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.025))
    floor = bpy.context.object
    floor.name = 'Studio_floor'
    floor.data.materials.append(floor_mat)
    for name, location, energy, size in [
        ('Key', (-3.4, -4.5, 6.5), 600, 4.0),
        ('Fill', (4, -2, 3.8), 350, 3.5),
        ('Rim', (1.5, 3, 5), 500, 3.0),
    ]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (Vector((0, 0, 1.8)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(4, -7, 3.2))
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 4.2
    camera.rotation_euler = (Vector((0, 0, 1.8)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    return camera


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--views', default='hero,front,back,left,right')
    parser.add_argument('--samples', type=int, default=40)
    parser.add_argument('--actions', default='coding,run,jump')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    mats = make_materials()
    armature, attach = build_body(mats)
    build_head(mats, attach)
    props = create_coding_props(mats)
    characters = list(bpy.context.scene.objects)
    ensure_uv(characters)
    bake_actions(armature)
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_set(1)
    model_dir = ROOT / 'assets/characters/grassy/history/model'
    model_dir.mkdir(parents=True, exist_ok=True)
    export_path = ROOT / 'public/characters/human/history/grassy.glb'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in characters:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(export_path), export_format='GLB', use_selection=True,
        export_yup=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_anim_slide_to_zero=True,
        export_skins=True, export_materials='EXPORT', export_apply=False,
    )
    print('EXPORTED_GLB', export_path)
    if armature.animation_data:
        armature.animation_data.action = None
        for track in armature.animation_data.nla_tracks:
            track.mute = True
    for bone in armature.pose.bones:
        bone.rotation_mode = 'XYZ'
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)
    props.hide_render = True
    props.hide_set(True)
    for child in props.children_recursive:
        child.hide_render = True
        child.hide_set(True)
    camera = studio()
    bpy.context.scene.cycles.samples = args.samples
    add_references()
    bpy.context.scene.frame_end = 120
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action='DESELECT')
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_location = (0, 0, 1.8)
                area.spaces.active.region_3d.view_distance = 5.6
                area.spaces.active.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
                area.spaces.active.region_3d.view_perspective = 'ORTHO'
                area.spaces.active.shading.type = 'MATERIAL'
    bpy.ops.wm.save_as_mainfile(filepath=str(model_dir / 'grassy.blend'))
    positions = {
        'hero': (4, -8, 3.2), 'front': (0, -8, 1.8),
        'back': (0, 8, 1.8), 'left': (8, 0, 1.8), 'right': (-8, 0, 1.8),
    }
    for name in args.views.split(','):
        camera.location = positions[name]
        camera.rotation_euler = (Vector((0, 0, 1.8)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.render.filepath = str(model_dir / f'grassy-{name}.png')
        bpy.ops.render.render(write_still=True)
    for name in filter(None, args.actions.split(',')):
        action = bpy.data.actions[name]
        armature.animation_data.action = action
        armature.animation_data.action_slot = action.slots[0]
        bpy.context.scene.frame_set({'coding': 24, 'run': 12, 'jump': 36}[name])
        for obj in [props, *props.children_recursive]:
            obj.hide_render = name != 'coding'
            obj.hide_set(name != 'coding')
        camera.location = positions['hero']
        target = Vector((0, 0, 2.02 if name == 'jump' else 1.8))
        camera.data.ortho_scale = 4.8 if name == 'jump' else 4.2
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.render.filepath = str(model_dir / f'grassy-{name}.png')
        bpy.ops.render.render(write_still=True)
    print('BLENDER_MODEL_COMPLETE', model_dir)


if __name__ == '__main__':
    main()
