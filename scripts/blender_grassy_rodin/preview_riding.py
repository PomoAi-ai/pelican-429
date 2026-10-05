"""Render and save the rider with the bicycle exported from the shared game model."""
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import extend_actions as movement


def inspect_contacts(rig, pedals, frames):
    body = next(obj for obj in bpy.data.objects if obj.type == 'MESH' and any(mod.type == 'ARMATURE' for mod in obj.modifiers))
    points = movement.base.mesh_coordinates(body.data)
    error = {'shoeBallToPedal': 0, 'wristToGripOffset': 0, 'pelvisToSaddleOffset': 0}
    shape = movement.CYCLING['blender']
    for frame in range(frames + 1):
        bpy.context.scene.frame_set(frame)
        for side, sign in (('L', 1), ('R', -1)):
            sole = points[(points[:, 0] * sign > .1) & (points[:, 2] < .035)]
            reference = Vector((sign * .32, -.19, float(sole[:, 2].min())))
            foot = f'foot.{side}'
            deformation = rig.pose.bones[foot].matrix @ rig.data.bones[foot].matrix_local.inverted()
            pedal = pedals[side].matrix_world.translation + Vector((0, 0, shape['pedalHalfThickness']))
            error['shoeBallToPedal'] = max(error['shoeBallToPedal'], (deformation @ reference - pedal).length)
            wrist = rig.pose.bones[f'hand.{side}'].head
            grip = Vector(shape['gripLeft' if side == 'L' else 'gripRight'])
            error['wristToGripOffset'] = max(error['wristToGripOffset'], (wrist - grip - Vector((0, .12, .07))).length)
        pelvis = rig.pose.bones['hips'].head
        error['pelvisToSaddleOffset'] = max(error['pelvisToSaddleOffset'], (pelvis - Vector(shape['saddleCenter']) - Vector((0, 0, .162))).length)
    if max(error.values()) > .0001:
        raise RuntimeError(f'Baked rider/bicycle contacts drifted: {error}')
    report = {'frames': frames + 1, 'seconds': movement.CYCLING['seconds'], 'maximumErrorTiles': error}
    (movement.EVIDENCE / 'ride-contact-report.json').write_text(json.dumps(report, indent=2) + '\n')


def main():
    bpy.ops.wm.open_mainfile(filepath=str(movement.BLENDS / 'grassy-equipped-game.blend'))
    bpy.context.preferences.filepaths.save_version = 0
    rig = bpy.data.objects['GrassyRodinRig']
    keyboard = bpy.data.objects['KeyboardWeapon']
    for target in (rig, keyboard):
        action = next(track.strips[0].action for track in target.animation_data.nla_tracks if track.name == 'ride')
        target.animation_data.action = action
        target.animation_data.action_slot = action.slots[0]
    bpy.ops.import_scene.gltf(filepath=str(movement.BLENDS / 'grassy-bicycle-reference.glb'))
    crank = bpy.data.objects['ride-bicycle-crank']
    wheels = [bpy.data.objects[f'ride-bicycle-wheel-{side}'] for side in ('front', 'rear')]
    pedals = {side: bpy.data.objects[f'ride-bicycle-pedal-{name}'] for side, name in (('R', 'near'), ('L', 'far'))}
    originals = {obj: obj.matrix_world.copy() for obj in (crank, *wheels, *pedals.values())}
    shape = movement.CYCLING['blender']
    crank_center = Vector(shape['bottomBracket'])
    frames = movement.CLIPS['ride'][0]
    previous = {}
    for frame in range(frames + 1):
        t = frame / frames
        for obj in (crank, *wheels):
            center = crank_center if obj == crank else originals[obj].translation
            ratio = 1 if obj == crank else movement.CYCLING['wheelPerCrank']
            angle = math.tau * t * movement.CYCLING['crankRevolutions'] * ratio
            obj.matrix_world = Matrix.Translation(center) @ movement.R('X', angle) @ Matrix.Translation(-center) @ originals[obj]
            obj.rotation_mode = 'QUATERNION'
            if obj in previous and obj.rotation_quaternion.dot(previous[obj]) < 0:
                obj.rotation_quaternion.negate()
            previous[obj] = obj.rotation_quaternion.copy()
            obj.keyframe_insert('rotation_quaternion', frame=frame)
        for side, obj in pedals.items():
            contact, _ = movement.riding_pedal(side, t)
            contact.z -= shape['pedalHalfThickness']
            world = originals[obj].copy()
            world.translation = contact
            obj.matrix_world = world
            obj.keyframe_insert('location', frame=frame)
    for obj in originals:
        movement.linearize(obj.animation_data.action)
    inspect_contacts(rig, pedals, frames)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 0, frames
    scene.cycles.device = 'CPU'
    scene.render.threads_mode, scene.render.threads = 'FIXED', 3
    scene.render.resolution_percentage = 100
    movement.base.studio.FRAMES['cycle'] = (1.58, 3.65, 1050, 950)
    for frame in (0, 9, 18, 27):
        scene.frame_set(frame)
        movement.base.studio.render('right', 'cycle', movement.EVIDENCE / f'game-ride-{frame:02d}-right.png', 24)
    scene.frame_set(0)
    movement.base.studio.FRAMES['cycle'] = (1.58, 4.15, 1050, 950)
    movement.base.studio.render('hero', 'cycle', movement.EVIDENCE / 'game-ride-00-hero.png', 24)
    for view in ('right', 'hero'):
        shutil.copyfile(movement.EVIDENCE / f'game-ride-00-{view}.png', movement.OUT / f'render-game-ride-{view}.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(movement.BLENDS / 'grassy-riding-game.blend'))


if __name__ == '__main__':
    main()
