"""Render actual authored meshes in the shared game's poses and a six-style board."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
import scene as studio

STYLES = ('royal', 'urban', 'explorer', 'soft', 'dark', 'sport')
MODELS = ROOT / 'assets/characters/grassy/customization/models'


def shared_body(rig):
    with bpy.data.libraries.load(str(MODELS / 's1/female-royal.blend'), link=False) as (available, selected):
        selected.objects = [name for name in available.objects if name.startswith('Female_royal_body')]
    for obj in selected.objects:
        bpy.context.collection.objects.link(obj)
        obj.parent = rig
        for modifier in obj.modifiers:
            if modifier.type == 'ARMATURE':
                modifier.object = rig


def lighting():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = True
    scene.render.threads_mode, scene.render.threads = 'FIXED', 4
    scene.view_settings.view_transform = 'Standard'
    scene.render.film_transparent = True
    studio.studio()


def poses(style):
    number = STYLES.index(style) + 1
    directory = MODELS / f's{number}'
    bpy.ops.wm.open_mainfile(filepath=str(directory / f'female-{style}.blend'))
    rig = bpy.data.objects['GrassyRodinRig']
    if style != 'royal':
        for obj in list(bpy.data.objects):
            if obj.get('customPart') == 'body':
                bpy.data.objects.remove(obj, do_unlink=True)
        shared_body(rig)
    source = ROOT / 'assets/characters/grassy/model-equipped/grassy-equipped-game.blend'
    with bpy.data.libraries.load(str(source), link=False) as (available, selected):
        selected.actions = [name for name in ('ride', 'takeoff', 'keyboard_smash') if name in available.actions]
    actions = {action.name: action for action in selected.actions}
    rig.animation_data_create()
    lighting()
    studio.FRAMES['neck'] = (2.35, 1.6, 800, 900)
    studio.render('front', 'neck', directory / 'neck-front.png', 16)
    studio.render('right', 'neck', directory / 'neck-right.png', 16)
    for name, frame in [('ride', 12), ('takeoff', 20), ('keyboard_smash', 22)]:
        action = actions[name]
        rig.animation_data.action = action
        rig.animation_data.action_slot = action.slots[0]
        bpy.context.scene.frame_set(frame)
        studio.render('right' if name == 'ride' else 'hero', 'full', directory / f'pose-{name}.png', 16)


def board():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ink = bpy.data.materials.new('Contact labels')
    ink.use_nodes = True
    ink.diffuse_color = (.045, .055, .07, 1)
    ink.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = ink.diffuse_color
    for number, style in enumerate(STYLES, 1):
        source = MODELS / f's{number}' / f'female-{style}.blend'
        with bpy.data.libraries.load(str(source), link=False) as (available, selected):
            selected.objects = [name for name in available.objects if (name.startswith(f'Female_{style}_') and '_body' not in name) or name == 'GrassyRodinRig']
        rig = next(obj for obj in selected.objects if obj.type == 'ARMATURE')
        for obj in selected.objects:
            bpy.context.collection.objects.link(obj)
        shared_body(rig)
        x = (number - 3.5) * 1.75
        rig.location.x = x
        text = bpy.data.curves.new(f'Label S{number}', 'FONT')
        text.body, text.align_x, text.size = f'S{number}', 'CENTER', .16
        text.materials.append(ink)
        obj = bpy.data.objects.new(f'Label S{number}', text)
        bpy.context.collection.objects.link(obj)
        obj.rotation_euler.x = math.pi / 2
        obj.location = (x, -.4, -.18)
    lighting()
    scene = bpy.context.scene
    scene.render.film_transparent = False
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .8
    for obj in bpy.data.objects:
        if obj.type == 'LIGHT':
            obj.data.size = 8
    studio.FRAMES['contact'] = (1.46, 3.5, 2400, 800)
    studio.render('front', 'contact', MODELS / 'female-six-styles-render.png', 24)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--style', choices=STYLES)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    poses(args.style) if args.style else board()
