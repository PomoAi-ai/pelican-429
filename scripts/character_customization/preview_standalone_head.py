"""Fit a standalone D1 head to the retained body/hair for candidate-only review."""
import argparse
import json
import math
import struct
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from assemble_d1_modular import bind_to_head, export, studio
from d1_hair_from_source import _components
from inspect_standalone_head import bounds

ROOT = Path(__file__).resolve().parents[2]
CANDIDATES = ROOT / 'assets/characters/grassy/customization/models/d1-head-standalone'
BODY = ROOT / 'assets/characters/grassy/customization/models/d1-rodin-6e73423c/modular/d1-modular.blend'
SOURCE_LANDMARKS = {'top': 1.8908, 'chin': .235, 'eye': .82, 'mouth': .46}
TARGET_TOP, TARGET_CHIN = 3.0, 2.23


def remove_old_neck(body):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    uv = bm.loops.layers.uv.active
    def face_record(face):
        return (face.material_index, tuple((tuple(loop.vert.co), tuple(loop[uv].uv)) for loop in face.loops))
    remove = [face for face in bm.faces
              if 'skin' in body.data.materials[face.material_index].name
              and all(abs(vertex.co.x) < .05 and -.13 < vertex.co.y < -.05
                      and 2.11 < vertex.co.z < 2.19 for vertex in face.verts)]
    if not remove:
        raise ValueError('Expected old central neck skin inside the collar; inspect the body split')
    retained_faces = sorted(face_record(face) for face in bm.faces if face not in remove)
    report = {'facesRemoved': len(remove), 'region': 'skin material only; |X|<.05, -.13<Y<-.05, 2.11<Z<2.19',
              'removedFaces': [face_record(face) for face in remove]}
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if not vertex.link_faces], context='VERTS')
    assert retained_faces == sorted(face_record(face) for face in bm.faces), 'Clothing or other body faces changed'
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    return report


def inset_ear_lining(hair):
    bm = bmesh.new()
    bm.from_mesh(hair.data)
    groups = _components(bm.faces, lambda face: (other for edge in face.edges for other in edge.link_faces))
    liners = [group for group in groups if all(hair.data.materials[face.material_index].name == 'D1 hair hidden lining' for face in group)]
    if len(liners) != 1:
        raise ValueError(f'Expected one separate hidden scalp lining; found {len(liners)}')
    lining_vertices = {vertex for face in liners[0] for vertex in face.verts}
    protected = {vertex: vertex.co.copy() for vertex in bm.verts if vertex not in lining_vertices}
    changes = []
    def fade(value, inner, outer):
        t = min(1, max(0, (outer - abs(value)) / (outer - inner)))
        return t * t * (3 - 2 * t)
    for vertex in lining_vertices:
        x, y, z = vertex.co
        if abs(x) <= .23:
            continue
        # The separate backing crosses both ears; the authored outer strands stay fixed.
        weight = fade(y - .05, .13, .19) * fade(z - 2.48, .12, .19)
        if weight:
            before = list(vertex.co)
            vertex.co.x += (math.copysign(.23, x) - x) * weight
            changes.append({'before': before, 'after': list(vertex.co)})
    assert changes, 'Ear lining repair did not move any backing vertices'
    assert all(vertex.co == point for vertex, point in protected.items()), 'Outer hair strands changed'
    bm.to_mesh(hair.data)
    bm.free()
    hair.data.update()
    return {'componentFaces': len(liners[0]), 'verticesMoved': len(changes),
            'insetX': .23, 'earRegionY': [-.08, .18], 'earRegionZ': [2.36, 2.60],
            'maxDisplacement': max(abs(change['after'][0] - change['before'][0]) for change in changes),
            'outerHairUnchanged': True, 'vertexChanges': changes}


def glb_document(path):
    with path.open('rb') as stream:
        stream.seek(12)
        size, chunk_type = struct.unpack('<II', stream.read(8))
        assert chunk_type == 0x4E4F534A, 'Exported GLB lacks its JSON chunk'
        return json.loads(stream.read(size))


def sample_animations(rig, objects, head_parts, output):
    scene = bpy.context.scene
    tracks = list(rig.animation_data.nla_tracks)
    rest_inverse = rig.data.bones['head'].matrix_local.inverted()
    result = []
    for track in tracks:
        for other in tracks:
            other.mute = True
        for bone in rig.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
        scene.frame_set(0)
        track.mute = False
        start = min(strip.frame_start for strip in track.strips)
        end = max(strip.frame_end for strip in track.strips)
        samples = []
        for phase in (0, .25, .5, .75, 1):
            frame = start + (end - start) * phase
            scene.frame_set(math.floor(frame), subframe=frame % 1)
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated = [obj.evaluated_get(depsgraph) for obj in objects]
            minimum, maximum = bounds(evaluated)
            errors = {}
            pose = rig.matrix_world @ rig.pose.bones['head'].matrix @ rest_inverse @ rig.matrix_world.inverted()
            for obj in head_parts:
                posed = obj.evaluated_get(depsgraph)
                assert len(posed.data.vertices) == len(obj.data.vertices), f'{obj.name}: unexpected topology change during animation'
                error = max(((posed.matrix_world @ vertex.co) - (pose @ obj.matrix_world @ source.co)).length
                            for source, vertex in zip(obj.data.vertices, posed.data.vertices))
                assert error < .0001, f'{track.name}@{phase}: {obj.name} does not follow the head bone ({error})'
                errors[obj.name] = error
            row = {'phase': phase, 'frame': frame, 'bounds': [list(minimum), list(maximum)], 'headBoneMaxError': errors}
            if phase in (.25, .75) or (track.name == 'jump' and phase == .5):
                span = maximum - minimum
                studio.FRAMES['animation'] = ((minimum.z + maximum.z) / 2,
                                             max(span.z, math.hypot(span.x, span.y) * 1.25) * 1.18, 800, 1000)
                path = output / f'action-{track.name}-{int(phase * 100):02d}.png'
                studio.render('three-quarter', 'animation', path, 16)
                row['screenshot'] = path.name
            samples.append(row)
        result.append({'clip': track.name, 'frames': [start, end], 'samples': samples})
    for track in tracks:
        track.mute = True
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    scene.frame_set(0)
    bpy.context.view_layer.update()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=CANDIDATES / 'source/base_basic_pbr.glb')
    parser.add_argument('--output-dir', type=Path, default=CANDIDATES / 'combined-preview')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    source, output = args.input.resolve(), args.output_dir.resolve()
    if not source.is_file() or source.suffix.lower() != '.glb':
        parser.error(f'Expected an existing head GLB: {source}')
    if not output.is_relative_to(CANDIDATES) or output == CANDIDATES / 'source':
        parser.error(f'Preview output must be a candidate subdirectory under {CANDIDATES}')

    bpy.ops.wm.open_mainfile(filepath=str(BODY))
    rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
    rig.animation_data.action = None
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(0)
    old_head = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name.startswith('D1_Head')]
    if not old_head:
        raise ValueError(f'No D1_Head found in {BODY}')
    for obj in old_head:
        bpy.data.objects.remove(obj, do_unlink=True)
    retained = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    hair = [obj for obj in retained if obj.name.startswith('D1_Hair')]
    if not hair:
        raise ValueError(f'No independent D1_Hair found in {BODY}')
    body = next(obj for obj in retained if obj.name == 'D1_Body')
    attachment_repairs = {'oldNeck': remove_old_neck(body), 'earLining': [inset_ear_lining(obj) for obj in hair]}
    retained_coords = {obj.name: [vertex.co.copy() for vertex in obj.data.vertices] for obj in retained}
    previous_objects = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported = set(bpy.context.scene.objects) - previous_objects
    head = [obj for obj in imported if obj.type == 'MESH']
    minimum, maximum = bounds(head)
    if abs(maximum.z - SOURCE_LANDMARKS['top']) > .001:
        raise ValueError('Head coordinate contract changed; remeasure landmarks before fitting')
    scale = (TARGET_TOP - TARGET_CHIN) / (SOURCE_LANDMARKS['top'] - SOURCE_LANDMARKS['chin'])
    offset = Vector((-(minimum.x + maximum.x) * scale / 2, .02, TARGET_CHIN - SOURCE_LANDMARKS['chin'] * scale))
    fit = Matrix.Translation(offset) @ Matrix.Scale(scale, 4)
    source_uv = {obj: [[tuple(loop.uv) for loop in layer.data] for layer in obj.data.uv_layers] for obj in head}
    for index, obj in enumerate(head):
        transform = rig.matrix_world.inverted() @ fit @ obj.matrix_world
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(transform)
        obj.name = 'D1_Head' if index == 0 else f'D1_Head_{index}'
        bind_to_head(obj, rig)
        obj['characterPart'] = 'head'
        assert source_uv[obj] == [[tuple(loop.uv) for loop in layer.data] for layer in obj.data.uv_layers], 'UVs changed during placement'
        assert all(vertex.groups and abs(vertex.groups[0].weight - 1) < 1e-6 for vertex in obj.data.vertices), 'Head attachment weight changed'
    for obj in imported - set(head):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()
    assert all(vertex.co == point for obj in retained for vertex, point in zip(obj.data.vertices, retained_coords[obj.name])), 'Body or hair changed after attachment repair'
    fitted_bounds = bounds(head)
    assert abs(fitted_bounds[1].z - TARGET_TOP) < .001, 'Fitted crown height differs from the D1 contract'
    objects = retained + head
    output.mkdir(parents=True, exist_ok=True)
    export(output / 'combined.glb', rig, objects)
    gltf = glb_document(output / 'combined.glb')
    animations = [animation['name'] for animation in gltf.get('animations', [])]
    expected = [track.name for track in rig.animation_data.nla_tracks]
    assert len(expected) == 4 and set(animations) == set(expected), f'Four retained animation clips were not exported: {animations}'

    scene = bpy.context.scene
    scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    studio.VIEWS['three-quarter'] = Vector((-.707, -.707, 0))
    studio.VIEWS['underside'] = Vector((0, -1, -.55)).normalized()
    for view in ('front', 'right', 'three-quarter', 'underside'):
        studio.render(view, 'head', output / f'head-{view}.png', 16)
    studio.render('front', 'full', output / 'full-front.png', 16)
    for obj in hair:
        obj.hide_render = True
    for view in ('front', 'right', 'three-quarter', 'underside'):
        studio.render(view, 'head', output / f'bare-head-{view}.png', 16)
    for obj in hair:
        obj.hide_render = False
    animation_samples = sample_animations(rig, objects, head + hair, output)
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'combined.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = body
    static_path = output / 'combined-static.glb'
    bpy.ops.export_scene.gltf(filepath=str(static_path), export_format='GLB', use_selection=True,
                             export_yup=True, export_apply=True, export_skins=False, export_animations=False,
                             export_cameras=False, export_lights=False, export_extras=True)
    static = glb_document(static_path)
    assert not static.get('animations') and not static.get('skins'), 'Static preview still contains animation or skin bindings'
    before_import = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(static_path))
    static_objects = set(bpy.context.scene.objects) - before_import
    static_bounds = bounds([obj for obj in static_objects if obj.type == 'MESH'])
    assert abs(static_bounds[0].z) < .02 and abs(static_bounds[1].z - 3.1) < .02, 'Static export changed D1 floor or height'
    for obj in static_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    report = {
        'sourceHead': str(source), 'retainedBody': str(BODY),
        'uniformScale': scale, 'translationXYZ': list(offset),
        'coordinates': 'Blender Z-up, front -Y; uniform head fit; old neck skin removed and hidden scalp lining recessed around ears',
        'sourceBounds': [list(minimum), list(maximum)], 'fittedHeadBounds': [list(v) for v in fitted_bounds],
        'sourceLandmarksZ': SOURCE_LANDMARKS,
        'fittedLandmarksZ': {name: z * scale + offset.z for name, z in SOURCE_LANDMARKS.items()},
        'hairBounds': [list(v) for v in bounds(hair)],
        'animations': animations, 'attachmentBone': 'head', 'attachmentRepairs': attachment_repairs,
        'animationSamples': animation_samples,
        'bodyClothingAndOuterHairUnchanged': True,
        'staticPreview': {'path': str(static_path), 'bounds': [list(value) for value in static_bounds], 'animations': [], 'skins': []},
        'notes': ['Candidate only; no public or runtime asset written.',
                  'Crown/chin placement uses approximate source landmarks, not a passed facial similarity score.',
                  'Hair strands were retained; only the separate hidden backing was recessed. Other hair/scalp intersections still require visual review.',
                  'Animation samples check finite geometry and rigid head/hair following, not every frame or the artistic quality of the retained body motions.',
                  'Rigid head binding preserves body animations but does not add facial expressions.'],
    }
    (output / 'assembly-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('STANDALONE_HEAD_PREVIEW', json.dumps({'output': str(output), 'scale': scale,
                                              'removedNeckFaces': attachment_repairs['oldNeck']['facesRemoved'],
                                              'animations': animations, 'staticBounds': report['staticPreview']['bounds']}))


if __name__ == '__main__':
    main()
