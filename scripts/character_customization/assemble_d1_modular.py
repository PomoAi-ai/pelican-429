"""Assemble the retained animated body with independently authored head and hair."""
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/characters/grassy/customization/models/d1-rodin-6e73423c'
OUT = SOURCE / 'modular'
PUBLIC = ROOT / 'public/characters/human/customization'
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
import scene as studio
sys.path.insert(0, str(Path(__file__).parent))
from d1_head_from_source import source_head_face


def append_meshes(path, prefix):
    with bpy.data.libraries.load(str(path), link=False) as (source, target):
        target.objects = [name for name in source.objects if name.startswith(prefix)]
    meshes = [obj for obj in target.objects if obj.type == 'MESH']
    if not meshes:
        raise ValueError(f'{path} contains no {prefix} meshes')
    for obj in meshes:
        bpy.context.collection.objects.link(obj)
        obj.parent = None
    return meshes


def bind_to_head(obj, rig):
    obj.vertex_groups.clear()
    group = obj.vertex_groups.new(name='head')
    group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    obj.parent = rig
    mod = obj.modifiers.new('Head attachment', 'ARMATURE')
    mod.object = rig


def join_part(objects, name):
    # glTF must see one color layer after joining skin and iris meshes.
    if any(obj.data.color_attributes for obj in objects):
        for obj in objects:
            attrs = obj.data.color_attributes
            assert len(attrs) <= 1, f'{obj.name}: multiple color layers need explicit mapping'
            if attrs:
                attrs[0].name = 'Color'
            else:
                layer = attrs.new(name='Color', type='FLOAT_COLOR', domain='POINT')
                layer.data.foreach_set('color', np.ones(len(layer.data) * 4))
            attrs.active_color = attrs['Color']
            for mat in obj.data.materials:
                for node in mat.node_tree.nodes:
                    if node.type == 'VERTEX_COLOR':
                        node.layer_name = 'Color'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return [obj]


def export(path, rig, objects, animated=True):
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                             export_yup=True, export_apply=False, export_animations=animated,
                             export_animation_mode='NLA_TRACKS', export_frame_range=False,
                             export_force_sampling=True, export_nla_strips=True,
                             export_skins=True, export_all_influences=False,
                             export_lights=False, export_cameras=False, export_extras=True)


def main():
    OUT.mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'animation/d1-animated.blend'))
    rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
    rig.animation_data.action = None
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(0)
    body = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
    body.name = 'D1_Body'
    bm = bmesh.new()
    bm.from_mesh(body.data)
    # Clothing reaches above the neck base; a horizontal cut would remove collar and shoulders.
    remove = []
    for face in bm.faces:
        material = body.data.materials[face.material_index].name
        z = face.calc_center_median().z
        center = face.calc_center_median()
        # Gold collar embroidery shares the source hair color classification.
        old_hair = 'hair' in material and (z > 2.19 or abs(center.x) > .16)
        if old_hair or source_head_face(face, body.data.materials):
            remove.append(face)
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    head = join_part(append_meshes(OUT / 'head.blend', 'D1_Head'), 'D1_Head')
    hair = join_part(append_meshes(OUT / 'hair.blend', 'D1_Hair'), 'D1_Hair')
    for obj in head + hair:
        bind_to_head(obj, rig)
    for obj in head:
        obj['characterPart'] = 'head'
    for obj in hair:
        obj['characterPart'] = 'hair'
    rig['hairAttachment'] = 'head'
    objects = [body] + head + hair
    coords = np.array([tuple(obj.matrix_world @ v.co) for obj in objects for v in obj.data.vertices])
    assert np.isfinite(coords).all(), 'Non-finite D1 geometry'
    assert abs(coords[:, 2].min()) < .02, 'D1 feet moved away from ground'
    assert abs(coords[:, 2].max() - 3.1) < .02, 'D1 head/hair height changed'
    for obj in head + hair:
        assert all(v.groups and abs(v.groups[0].weight - 1) < 1e-6 for v in obj.data.vertices)
    export(PUBLIC / 'd1-modular-animated.glb', rig, objects)
    export(PUBLIC / 'd1-hair-braided-rigged.glb', rig, hair, animated=False)
    scene = bpy.context.scene
    scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.view_settings.view_transform = 'Standard'
    studio.VIEWS['three-quarter'] = Vector((-.707, -.707, 0))
    for view in ('front', 'right', 'three-quarter', 'back'):
        studio.render(view, 'head', OUT / f'assembled-{view}.png', 16)
    for obj in hair:
        obj.hide_render = True
    studio.render('three-quarter', 'head', OUT / 'assembled-bare-head.png', 16)
    for obj in hair:
        obj.hide_render = False
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'd1-modular.blend'))
    report = {'parts': {'body': body.name, 'head': [o.name for o in head], 'hair': [o.name for o in hair]},
              'vertices': {key: sum(len(o.data.vertices) for o in value) for key, value in
                           [('body', [body]), ('head', head), ('hair', hair)]},
              'attachmentBone': 'head', 'restHeight': float(coords[:, 2].max()),
              'animations': [t.name for t in rig.animation_data.nla_tracks],
              'hairAsset': 'd1-hair-braided-rigged.glb'}
    (OUT / 'assembly-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('D1_MODULAR', json.dumps(report))


if __name__ == '__main__':
    main()
