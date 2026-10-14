"""Two independently editable, rooted volumes sharing one broad parting sweep."""
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
SOURCE = BASE / 'rear-flow-assembly-study-01/draft-02/D1-Hair-Painted.blend'
MAIN = 'Single broad swept fringe'
CROWN = 'Left swept crown'
CHANGED = [MAIN, CROWN]
OUTPUT = HERE / 'draft-01'
ROOT_SEED = (.10, -.18, 2.92)
ORIGIN = np.array([0., .035, 2.54])
sys.dont_write_bytecode = True
sys.path.insert(0, str(BASE))
from build import skull_tree
from single_lock import smooth_controls
from build_bob_study import transported_frames


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


helper = module('joint_volume_helpers', BASE / 'main-crown-junction-study-01/build.py')
audit_helper = module('joint_exact_audit', BASE / 'bob-cohesive-study-01/draft-02/build_candidate.py')


def mesh_hash(obj):
    digest = hashlib.sha256(np.asarray(obj.matrix_world, dtype='<f8').tobytes())
    digest.update(np.asarray([v.co for v in obj.data.vertices], dtype='<f4').tobytes())
    digest.update(np.asarray([i for p in obj.data.polygons for i in [len(p.vertices), *p.vertices]], dtype='<i4').tobytes())
    for layer in obj.data.uv_layers:
        digest.update(layer.name.encode())
        digest.update(np.asarray([v.uv for v in layer.data], dtype='<f4').tobytes())
    return digest.hexdigest()


def skin_point(head, seed, margin=.003):
    point, normal = head.find_nearest(Vector(seed))[:2]
    return np.asarray(point, float) + np.asarray(normal, float) * margin


def samples(controls, count=141):
    dense = np.asarray([smooth_controls(controls, t) for t in np.linspace(0, 1, 1201)])
    lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(dense[:, :3], axis=0), axis=1))]
    return np.column_stack([np.interp(np.linspace(0, 1, count), lengths/lengths[-1], dense[:, i]) for i in range(5)])


def control_recipe(name, root):
    if name == MAIN:
        controls = np.asarray([
            [*root, .092, .008],
            [.064, -.245, 2.967, .146, .030],
            [-.025, -.321, 3.003, .217, .048],
            [-.157, -.328, 2.947, .206, .047],
            [-.287, -.284, 2.823, .173, .045],
            [-.375, -.184, 2.680, .123, .035],
            [-.451, -.057, 2.560, .054, .020],
            [-.488, .031, 2.523, .002, .0015],
        ])
    else:
        controls = np.asarray([
            [*root, .094, .008],
            [.061, -.121, 2.992, .170, .040],
            [-.070, .012, 3.037, .300, .059],
            [-.254, .116, 3.015, .330, .063],
            [-.431, .179, 2.962, .230, .045],
            [-.552, .153, 2.944, .100, .024],
            [-.613, .104, 2.974, .002, .0015],
        ])
    return controls


def volumes(name, head):
    root = skin_point(head, ROOT_SEED, .005)
    controls = control_recipe(name, root)
    values = samples(controls)
    frames = transported_frames(values[:, :3], side_fan=False)
    sides = 48
    angle = np.arange(sides)*math.tau/sides
    rings = []
    root_contact = []
    for row, (value, frame) in enumerate(zip(values, frames)):
        tangent, normal, lateral = frame
        t = row/(len(values)-1)
        # The face is full and rounded; the shallow underside carries a broad
        # root area instead of an isolated circular tube touching at one point.
        ring = value[:3] + lateral[None, :]*np.cos(angle)[:, None]*value[3]/2
        thickness = np.where(np.sin(angle) >= 0, value[4], value[4]*.78)
        ring += normal[None, :]*np.sin(angle)[:, None]*thickness[:, None]
        contact_weight = max(0., min(1., (0.12-t)/.065))
        contact_weight = contact_weight*contact_weight*(3-2*contact_weight)
        for col in range(sides):
            if contact_weight == 0:
                continue
            skin, skin_normal = head.find_nearest(Vector(ring[col]))[:2]
            depth = .0015 if math.sin(angle[col]) < 0 else .012
            target = np.asarray(skin, float)+np.asarray(skin_normal, float)*depth
            ring[col] = ring[col]*(1-contact_weight)+target*contact_weight
            if t <= .055 and math.sin(angle[col]) < -.25:
                root_contact.append(row*sides+col)
        rings.append(ring)
    return np.asarray(rings), dict(controls=controls.tolist(), rootContactVertexIndices=root_contact,
                                  rootAreaProgress=[0., .055], rootBlendProgress=[.055, .12],
                                  shape='Free rounded sweep, broad parting foot; crown covers the rear of the main shoulder')


def inspect(obj, head, recipe):
    coordinates = np.asarray([v.co for v in obj.data.vertices], float)
    distances = [audit_helper.signed_distance(head, p) for p in coordinates]
    face_distances = [audit_helper.signed_distance(head, coordinates[list(p.vertices)].mean(axis=0)) for p in obj.data.polygons]
    negative = [i for i, d in enumerate(face_distances) if d < -.0001]
    visible, hidden = helper.prior.exposed_negative_faces(obj, coordinates, negative)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    closed = all(e.is_manifold for e in bm.edges)
    volume = float(bm.calc_volume(signed=True)); bm.free()
    contacts = np.asarray(obj['rootContactVertexIndices'], int)
    foot = coordinates[contacts]
    guide = np.asarray(json.loads(obj['guideBlender']), float)
    return dict(name=obj.name, vertices=len(coordinates), faces=len(obj.data.polygons),
                closed=closed, signedVolume=volume,
                selfIntersection=audit_helper.proper_crossings(obj.data),
                headVertexMin=min(distances), headFaceMin=min(face_distances),
                exposedNegativeFaceCount=len(visible), exposedNegativeSamples=visible[:12],
                hiddenNegativeFaceCounts=hidden,
                rootGuide=guide[0].tolist(), rootGuideDistance=audit_helper.signed_distance(head, guide[0]),
                actualRootAreaVertexCount=len(contacts), actualRootAreaHeadDistanceRange=[min(distances[i] for i in contacts), max(distances[i] for i in contacts)],
                actualRootAreaSpan=(foot.max(axis=0)-foot.min(axis=0)).tolist(),
                topology=obj['strandTopology'], guideSamples=len(guide), nativeUV=obj['nativeUV'],
                bounds=[coordinates.min(axis=0).tolist(), coordinates.max(axis=0).tolist()], recipe=recipe)


def prepare_object(obj):
    pass


def main():
    output = OUTPUT
    output.mkdir(exist_ok=True)
    if (output/'Joint-Sculpt.blend').exists():
        raise ValueError('Retained draft already exists')
    source_sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    frozen = {o.name: mesh_hash(o) for o in scene.objects if o.type == 'MESH' and o.name not in CHANGED}
    head = skull_tree(bpy.data.objects['Head'])
    originals = {name: bpy.data.objects[name] for name in CHANGED}
    matrices = {name: obj.matrix_world.copy() for name, obj in originals.items()}
    roots = {name: volumes(name, head) for name in CHANGED}
    grey = bpy.data.materials.new('Joint volume clay')
    grey.use_nodes = True
    principled = grey.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = (.42, .42, .42, 1)
    principled.inputs['Roughness'].default_value = .76
    grey.diffuse_color = (.42, .42, .42, 1)
    for obj in originals.values():
        bpy.data.objects.remove(obj, do_unlink=True)
    reports = []
    for name, (rings, recipe) in roots.items():
        obj, guide = helper.closed_object(name, rings, grey, matrices[name], 'fringe' if name == MAIN else 'crown')
        obj['strandTopology'] = 'ordered-closed-sweep'
        obj['rootContactVertexIndices'] = recipe['rootContactVertexIndices']
        prepare_object(obj)
        reports.append(inspect(obj, head, recipe))
    for name, digest in frozen.items():
        assert mesh_hash(bpy.data.objects[name]) == digest, name
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_sha
    report = dict(source=str(SOURCE), sourceSHA256=source_sha, changedObjects=CHANGED,
                  otherMeshesExactlyFrozen=frozen, componentCount=len(json.loads(scene['Hair components'])),
                  components=reports,
                  structurePass=all(r['closed'] and r['signedVolume'] > 0 and r['selfIntersection']['exactCrossings'] == 0 for r in reports),
                  visibleHeadSafetyPass=all(r['exposedNegativeFaceCount'] == 0 for r in reports),
                  nativeUV='u=ordered closed cross-section angle0..1; v=actual rooted guide arclength0..1; cap v0/v1',
                  guideContract='Each component has its own broad scalp-contact root area, guideBlender and editable Blender curve; 141 rows x48 +2caps',
                  previewOnly=True, artisticApproval=False)
    scene['Joint sculpt candidate'] = 'Main and Left swept crown; other51 meshes remain byte-identical'
    text = bpy.data.texts.new('Joint rooted-volume recipe.py'); text.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'Joint-Sculpt.blend'))
    (output/'geometry-report.json').write_text(json.dumps(report, indent=2)+'\n')
    (output/'build.py').write_text(Path(__file__).read_text())
    print('JOINT_BLEND_READY', output, 'structure', report['structurePass'], 'headVisible', report['visibleHeadSafetyPass'], flush=True)
    for name in json.loads(scene['Hair components']):
        obj = bpy.data.objects[name]
        obj.data.materials.clear(); obj.data.materials.append(grey)
    centre = Vector((0, .015, 2.64))
    scene.camera.data.ortho_scale = 1.5
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.cycles.samples = 24; scene.cycles.use_denoising = True
    for view, axis in [('front', (0,-1,0)), ('right', (-1,0,0)), ('three-quarter', (-1,-1,0))]:
        scene.camera.location = centre + Vector(axis)*4
        scene.camera.rotation_euler = (centre-scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(output/(view+'.png'))
        bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'Joint-Clay.blend'))
    for name, digest in frozen.items():
        assert mesh_hash(bpy.data.objects[name]) == digest, name
    print('JOINT_DRAFT_COMPLETE', output, flush=True)


if __name__ == '__main__':
    main()
