"""One six-piece local bob/temple candidate; retain inner support and all UVs."""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
sys.path.insert(0, str(BASE))
import export_assembly as export
spec = importlib.util.spec_from_file_location('leaf_existing_helpers', BASE / 'underfold-return-study-01/build.py')
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
base = prior.base
SOURCE = BASE / 'underfold-return-study-01/draft-03/Underfold-Return-Sculpt.blend'
OUT = HERE / 'draft-01'
NAMES = [f'{side} lower fan {number:02}' for side in ('right', 'left') for number in (4, 5)] + ['Left temple forelock', 'Right temple forelock']


def flow_values(obj):
    layer = obj.data.uv_layers['Hair flow native']
    sums, counts = np.zeros(len(obj.data.vertices)), np.zeros(len(obj.data.vertices))
    for loop, uv in zip(obj.data.loops, layer.data):
        sums[loop.vertex_index] += uv.uv.y
        counts[loop.vertex_index] += 1
    assert np.all(counts > 0)
    return sums / counts


def bob_shape(obj, original):
    sides = int(obj['sectionSize'])
    rings = original[:-2].reshape(-1, sides, 3)
    flow = flow_values(obj)[:-2].reshape(-1, sides)[:, 0]
    centres = rings.mean(axis=1)
    number = int(obj.name[-2:])
    sign = np.sign(centres[-1, 0])
    changed = rings.copy()
    if number == 4:
        profile = base.smooth(.40, .52, flow) * (1-base.smooth(.66, .77, flow))
        width, thickness, tip_start, lift, turn_x, turn_y = .21, .08, .86, .013, .003, -.003
    else:
        profile = base.smooth(.35, .46, flow) * (1-base.smooth(.63, .74, flow))
        width, thickness, tip_start, lift, turn_x, turn_y = .24, .10, .78, .040, .008, -.005
    for row, (ring, centre, amount) in enumerate(zip(rings, centres, profile)):
        inner = (ring[:, 0] * sign).min()
        gap = ring[:, 0] * sign - inner
        facing = gap / gap.max()
        # The innermost contact edge stays fixed; the outer belly loses bulk
        # without moving a whole strand towards the head or neck.
        changed[row, :, 0] = sign * (inner + gap * (1-thickness*amount))
        changed[row, :, 1] = centre[1] + (ring[:, 1]-centre[1]) * (1-width*amount*facing)
    turn = base.smooth(tip_start, 1., flow)
    changed[:, :, 2] += lift * turn[:, None]
    changed[:, :, 0] -= sign * turn_x * turn[:, None]
    changed[:, :, 1] += turn_y * turn[:, None]
    assert np.array_equal(changed[flow <= .35], rings[flow <= .35])
    guide = changed.mean(axis=1)
    assert np.all(np.diff(guide[:, 2]) < 0), 'shortened tip must retain descending ordered sections'
    points = np.vstack((changed.reshape(-1, 3), guide[[0, -1]]))
    return points, guide, dict(kind='local outside belly reduction and continuous descending short return',
        protectedNativeVThrough=.35, widthMaximumSideEdgeReduction=width*.5,
        thicknessReduction=thickness, tipStartNativeV=tip_start, tipLift=lift,
        actualGuideSamples=len(guide), sectionSize=sides,
        originalLargestYWidth=float(np.ptp(rings[:, :, 1], axis=1).max()),
        candidateLargestYWidth=float(np.ptp(changed[:, :, 1], axis=1).max()))


def temple_transform(points, tip_z, sign):
    points = np.asarray(points, float)
    t = np.clip((2.34-points[:, 2])/(2.34-tip_z), 0, 1)
    turn = t*t*(3-2*t)
    result = points.copy()
    result[:, 2] += .025*turn
    result[:, 0] -= sign*.010*turn
    result[:, 1] += .009*turn
    return result


def temple_shape(obj, original):
    controls = np.asarray(json.loads(obj['guideBlender']), float)
    assert len(controls) == 5 and len(original) == 1150
    sign = np.sign(controls[-1, 0])
    changed = temple_transform(original, controls[-1, 2], sign)
    assert np.array_equal(changed[original[:, 2] >= 2.34], original[original[:, 2] >= 2.34])
    return changed, temple_transform(controls, controls[-1, 2], sign), dict(
        kind='only existing ear-side tip; C1 spatial turn into a shorter ending',
        protectedZAtOrAbove=2.34, tipLift=.025, tipInwardReturn=.010, tipBackwardReturn=.009,
        guideMeaning='Five existing authored control points, not section centres', sectionSize=28)


def motion_check(obj, head):
    points = export.world_points(obj)
    uv = np.asarray([loop.uv for loop in obj.data.uv_layers.active.data])
    _, t, _, guides = export.strand_data(obj, points, uv, 0)
    assert len(guides) == 1
    guide = guides[0]
    root, tip = np.asarray([guide['root'], guide['tip']])
    x, z = (root[0]+tip[0])*.5-.000230005, (root[2]+tip[2])*.5+.006884412
    back, right = 1-base.smooth(-.25, -.05, z), base.smooth(-.12, .12, x)
    regions = np.asarray([(1-right)*(1-back), right*(1-back), back])
    delta = (base.INFLUENCES*regions[None, :, None]).sum(axis=1) * [.024, .015, .024] * (1-guide['stiffness'])
    maximum = min(float(np.linalg.norm(delta, axis=1).max()), float(np.linalg.norm(tip-root))*.1)
    q = np.clip((t-.3)/.7, 0, 1)
    weight = q**3*(q*(q*6-15)+10)
    obj.data.calc_loop_triangles()
    faces = np.asarray([f.vertices[:] for f in obj.data.loop_triangles])
    edges = np.unique(np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1), axis=0)
    checks = {}
    for label, p, w in [('vertices', points, weight), ('triangleCentres', points[faces].mean(1), weight[faces].mean(1)),
            ('edgeMidpoints', points[edges].mean(1), weight[edges].mean(1))]:
        distance = np.asarray([base.shared.joint.audit_helper.signed_distance(head, v) for v in p])
        moving = w > 1e-10
        checks[label] = dict(restMinimum=float(distance.min()), fixedMinimum=float(distance[~moving].min()),
            movingLowerBound=float((distance-maximum*w)[moving].min()))
    return dict(actualExportGuide=guide, maximumSampledStrandTravel=maximum, probes=checks,
        frameCount=len(base.INFLUENCES), limits='Conservative sampled surface distances for saved influence frames; no every-triangle or continuous-time certificate')


def main():
    OUT.mkdir(exist_ok=False)
    source_sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    frozen = {o.name: base.shared.joint.mesh_hash(o) for o in scene.objects if o.type == 'MESH' and o.name not in NAMES}
    assert len(frozen) == 48
    images = base.shared.image_hashes()
    head = base.shared.joint.skull_tree(bpy.data.objects['Head'])
    reports = []
    for name in NAMES:
        obj = bpy.data.objects[name]
        original = np.asarray([v.co for v in obj.data.vertices], float)
        assert np.allclose(np.asarray(obj.matrix_world), np.eye(4), rtol=0, atol=1e-7)
        uv_hashes = prior.digest_uv(obj)
        points, guide, recipe = bob_shape(obj, original) if 'lower fan' in name else temple_shape(obj, original)
        obj.data.vertices.foreach_set('co', points.ravel())
        obj.data.update()
        obj['guideBlender'] = json.dumps(guide.tolist())
        for handle in scene.objects:
            if handle.type == 'CURVE' and handle.name.startswith(name+' '):
                spline = handle.data.splines[0]
                assert len(spline.points) == len(guide), (name, 'guide handle sample count')
                for p, coordinate in zip(spline.points, guide):
                    p.co = (*coordinate, 1)
        assert prior.digest_uv(obj) == uv_hashes
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        closed, volume = all(e.is_manifold for e in bm.edges), float(bm.calc_volume(signed=True))
        bm.free()
        base.shared.joint.audit_helper.SIDES = recipe['sectionSize']
        crossings = base.shared.joint.audit_helper.proper_crossings(obj.data)
        report = dict(name=name, closed=closed, signedVolume=volume, selfIntersection=crossings,
            recipe=recipe, originalUVHashesFrozen=uv_hashes, maximumVertexShift=float(np.linalg.norm(points-original, axis=1).max()),
            motion=motion_check(obj, head))
        reports.append(report)
        print('LEAF_LOCAL_CHECK', name, closed, crossings['exactCrossings'], report['motion']['probes'], flush=True)
    assert all(base.shared.joint.mesh_hash(bpy.data.objects[name]) == sha for name, sha in frozen.items())
    assert base.shared.image_hashes() == images
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_sha
    report = dict(source=str(SOURCE), sourceSHA256=source_sha, changedComponents=NAMES,
        other48MeshHashes=frozen, allImagePixelHashesFrozen=images, components=reports,
        structurePass=all(r['closed'] and r['signedVolume'] > 0 and r['selfIntersection']['exactCrossings'] == 0 for r in reports),
        movingSampleBoundsPass=all(p['movingLowerBound'] > 0 for r in reports for p in r['motion']['probes'].values()),
        visualApproval=False, animationApproval=False, exported=False, published=False)
    (OUT/'geometry-report.json').write_text(json.dumps(report, indent=2)+'\n')
    (OUT/'build.py').write_text(Path(__file__).read_text())
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Bob-Leaf-Local-Sculpt.blend'))
    print('LEAF_LOCAL_SAVED', report['structurePass'], report['movingSampleBoundsPass'], flush=True)
    clay = bpy.data.materials.new('Local short return study clay')
    clay.use_nodes = True
    shader = clay.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (.38, .38, .38, 1)
    shader.inputs['Roughness'].default_value = .76
    for name in json.loads(scene['Hair components']):
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(clay)
    base.render.HERE = OUT
    base.render.render_three(scene, '', 24, True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Bob-Leaf-Local-Clay.blend'))
    print('LEAF_LOCAL_VIEWS_READY', flush=True)


if __name__ == '__main__':
    main()
