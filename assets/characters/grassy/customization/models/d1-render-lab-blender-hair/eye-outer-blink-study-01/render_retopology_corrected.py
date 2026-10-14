"""Render source/candidate eye geometry and the candidate's preserved/open and closed artwork."""
import hashlib
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE/'draft-02-corrected'
SOURCE = HERE.parent/'temple-root-continuity-study-01/draft-01/PBR-Game-Export.blend'
CANDIDATE = OUT/'Eye-Local-Retopology.blend'
VIEWS = {'front':(0,-1,0), 'three-quarter':(-1,-1,0), 'right':(-1,0,0)}


def views(scene, prefix, center, scale, samples):
    scene.camera.data.type = 'ORTHO'
    scene.camera.data.ortho_scale = scale
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    for label, axis in VIEWS.items():
        scene.camera.location = center+Vector(axis)*4
        scene.camera.rotation_euler = (center-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(OUT/f'{prefix}{label}.png')
        bpy.ops.render.render(write_still=True)
        print('EYE_VIEW_READY', prefix+label, flush=True)


def clay(path, prefix):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.context.scene
    original = bpy.data.objects['Head']
    vertices = [original.matrix_world@v.co for v in original.data.vertices]
    slot = [m.name for m in original.data.materials].index('D1 eye')
    faces = [p.vertices[:] for p in original.data.polygons if p.material_index != slot]
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.hide_render = True
    mesh = bpy.data.meshes.new('Isolated actual head skin')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    head = bpy.data.objects.new('Eye-surface inspection', mesh)
    scene.collection.objects.link(head)
    for p in mesh.polygons:
        p.use_smooth = True
    material = bpy.data.materials.new('Eye-region matte clay')
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (.35,.35,.35,1)
    shader.inputs['Roughness'].default_value = .8
    mesh.materials.append(material)
    views(scene, prefix, Vector((0,-.08,2.46)), 1.03, 20)


def closed_material():
    material = bpy.data.materials.new('Closed atlas inspection only')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    uv = nodes.new('ShaderNodeTexCoord')
    shift = nodes.new('ShaderNodeVectorMath')
    shift.operation = 'ADD'
    shift.inputs[1].default_value = (.5,-.5,0)
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images['eye-atlas']
    texture.extension = 'CLIP'
    emission = nodes.new('ShaderNodeEmission')
    clear = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    output = nodes.new('ShaderNodeOutputMaterial')
    links = material.node_tree.links
    links.new(uv.outputs['UV'], shift.inputs[0])
    links.new(shift.outputs['Vector'], texture.inputs['Vector'])
    links.new(texture.outputs['Color'], emission.inputs['Color'])
    links.new(texture.outputs['Alpha'], mix.inputs[0])
    links.new(clear.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs['Surface'])
    return material


before = {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in (SOURCE,CANDIDATE)}
clay(CANDIDATE, 'candidate-clay-')
bpy.ops.wm.open_mainfile(filepath=str(CANDIDATE))
views(bpy.context.scene, 'color-open-', Vector((0,.015,2.64)), 1.5, 32)
head = bpy.data.objects['Head']
eye_slot = [m.name for m in head.data.materials].index('D1 eye')
head.material_slots[eye_slot].link = 'OBJECT'
head.material_slots[eye_slot].material = closed_material()
assert head.material_slots[eye_slot].material.name.startswith('Closed atlas inspection only')
print('ACTUAL_CLOSED_OBJECT_MATERIAL', head.material_slots[eye_slot].material.name, flush=True)
views(bpy.context.scene, 'color-closed-', Vector((0,.015,2.64)), 1.5, 32)
assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest() == h for p,h in before.items())
print('EYE_ALL_VIEWS_READY_SOURCE_AND_CANDIDATE_UNCHANGED', flush=True)
