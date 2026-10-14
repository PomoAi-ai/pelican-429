"""Extend only the six upper bob connections underneath the retained cover hair."""
import hashlib
import importlib.util
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('bob_horizontal_contract', HERE / 'build_third.py')
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
base = previous.base
SOURCE = HERE / 'draft-03/Bob-Reference-Sculpt.blend'
OUT = HERE / 'draft-04'
NAMES = previous.NAMES


def upper_connection(old, head, number, sign):
    points = np.asarray([v.co for v in old.data.vertices], float)
    assert old['sectionSize'] == base.SIDES
    old_rings = points[:-2].reshape(-1, base.SIDES, 3)
    assert np.all(np.diff(old_rings[:, 0, 2]) < 0)
    join_height = {2: 2.566, 4: 2.510, 5: 2.492}[number]
    join_index = int(np.where(old_rings[:, 0, 2] <= join_height)[0][0])
    retained = old_rings[join_index:].copy()
    end = retained[0]
    centre = end.mean(axis=0)
    root_z = {2: 2.684, 4: 2.671, 5: 2.654}[number]
    root_y = {2: .320, 4: .235, 5: .145}[number]
    hit = head.ray_cast(Vector((sign * 2, root_y, root_z)), Vector((-sign, 0, 0)))[0]
    assert hit is not None, (old.name, 'actual Head root ray')
    root = np.asarray(hit) + [sign * .004, 0, 0]
    angle = np.arange(base.SIDES) * 2 * np.pi / base.SIDES
    start = root + np.column_stack((sign * np.sin(angle) * .0025,
        np.cos(angle) * .006, np.zeros(base.SIDES)))
    heights = np.linspace(root_z, centre[2], 45)
    t = (root_z - heights) / (root_z - centre[2])
    # Match the retained surface tangent at the join, rather than exposing a
    # second shoulder where a new connector meets the old body.
    slope_end = (retained[1] - end) / (centre[2] - retained[1, 0, 2])
    tangent_end = slope_end * (root_z - centre[2])
    tangent_start = (end - start) * 1.12
    rings = np.asarray([(2*q**3 - 3*q*q + 1)*start
        + (q**3 - 2*q*q + q)*tangent_start
        + (-2*q**3 + 3*q*q)*end
        + (q**3 - q*q)*tangent_end for q in t])
    rings[:, :, 2] = heights[:, None]
    shifts = []
    for row, ring in enumerate(rings[:-1]):
        direction = ring.mean(axis=0) - [0, .035, 0]
        direction[2] = 0
        direction /= np.linalg.norm(direction)
        probes = np.vstack((ring, (ring + np.roll(ring, -1, axis=0)) * .5))
        margin = .0002 if row == 0 else .001
        def gap(distance):
            return min(base.shared.joint.audit_helper.signed_distance(head, p + direction * distance)
                for p in probes)
        if gap(0) >= margin:
            shifts.append(0.)
            continue
        low, high = 0., .10
        assert gap(high) >= margin, (old.name, row, 'root connector clearance')
        for _ in range(16):
            distance = (low + high) * .5
            if gap(distance) < margin:
                low = distance
            else:
                high = distance
        rings[row] += direction * (high + .0001)
        shifts.append(high + .0001)
    rings = np.concatenate((rings[:-1], retained))
    assert np.array_equal(rings[44:], retained)
    assert np.all(np.diff(rings[:, 0, 2]) < 0)
    guide, native_v = previous.arc(rings)
    old_recipe = previous.RECIPES[number]
    entry_height = old_recipe['body'][1][2]
    entry_row = int(np.argmin(abs(guide[:, 2] - entry_height)))
    return rings, dict(group=old_recipe['group'], controls=guide.tolist(),
        sourceRetainedRow=join_index, retainedFromZ=float(centre[2]),
        retainedVerticesSHA256=hashlib.sha256(retained.tobytes()).hexdigest(),
        newRoot=root.tolist(), actualHeadRay=tuple(hit), upperSectionClearanceShifts=shifts,
        visibleEntrySourcePixels=base.GROUPS[old_recipe['group']]['side']['visibleEntry'],
        visibleEntryRow=entry_row, visibleEntryNativeV=float(native_v[entry_row]),
        visibleEntryWorldCentre=guide[entry_row].tolist(),
        method='Hidden small scalp root opens continuously into unchanged lower full-width sections')


def root_cover(objects):
    trees = {o.name: base.shared.joint.skull_tree(o) for o in objects}
    result = {}
    for name in NAMES:
        obj = bpy.data.objects[name]
        rings = np.asarray([v.co for v in obj.data.vertices][:-2]).reshape(-1, base.SIDES, 3)
        sign = -1 if name.startswith('right') else 1
        views = {}
        for label, direction in [('front', np.asarray([0., 1., 0.])),
                                  ('own-side', np.asarray([-sign, 0., 0.]))]:
            counts = {}
            records = []
            for row in (0, 2, 4, 8, 12, 20, 32):
                ring = rings[row]
                facing = np.argsort(ring @ direction)[:5]
                for vertex in facing:
                    target = ring[vertex]
                    origin = target - direction * 4
                    hits = []
                    for other, tree in trees.items():
                        point, _, _, distance = tree.ray_cast(Vector(origin), Vector(direction))
                        if point is not None:
                            hits.append((distance, other))
                    assert hits
                    hit = min(hits)[1]
                    counts[hit] = counts.get(hit, 0) + 1
                    records.append(dict(row=row, z=float(target[2]), firstHit=hit))
            views[label] = dict(firstHitCounts=counts, samples=records,
                rootSamplesExposed=sum(r['firstHit'] == name for r in records if r['row'] <= 4))
        result[name] = views
    return result


def main():
    OUT.mkdir(exist_ok=False)
    source_sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    frozen = {o.name: base.shared.joint.mesh_hash(o) for o in scene.objects
        if o.type == 'MESH' and o.name not in NAMES}
    assert len(frozen) == 48
    images = base.shared.image_hashes()
    head = base.shared.joint.skull_tree(bpy.data.objects['Head'])
    reports = []
    for name in NAMES:
        old = bpy.data.objects[name]
        sign = -1 if name.startswith('right') else 1
        number = int(name[-2:])
        material, matrix, region = old.active_material, old.matrix_world.copy(), old['region']
        uv = np.asarray([l.uv for l in old.data.uv_layers.active.data])
        offset, scale = uv.min(axis=0), np.ptp(uv, axis=0)
        rings, recipe = upper_connection(old, head, number, sign)
        bpy.data.objects.remove(old, do_unlink=True)
        for handle in list(scene.objects):
            if handle.type == 'CURVE' and handle.name.startswith(name + ' '):
                bpy.data.objects.remove(handle, do_unlink=True)
        obj, guide = base.shared.joint.helper.closed_object(name, rings, material, matrix, region)
        base.shared.add_atlas_uv(obj, offset, scale)
        obj['authorControls'] = json.dumps(recipe['controls'])
        report = base.shared.joint.inspect(obj, head, recipe)
        reports.append(report)
        print('BOB_COVERED_ROOT', name, report['selfIntersection']['exactCrossings'], flush=True)
    assert all(base.shared.joint.mesh_hash(bpy.data.objects[n]) == h for n, h in frozen.items())
    assert base.shared.image_hashes() == images
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_sha
    cover = root_cover([o for o in scene.objects if o.type == 'MESH' and not o.hide_render])
    structure = all(r['closed'] and r['signedVolume'] > 0 and r['selfIntersection']['exactCrossings'] == 0
        for r in reports)
    report = dict(source=str(SOURCE), sourceSHA256=source_sha, components=reports,
        changedComponents=NAMES, other48MeshHashes=frozen, allImagePixelHashesFrozen=images,
        structurePass=structure, rootCover=cover, sourceComponentCount=len(json.loads(scene['Hair components'])),
        visualApproval=False, animationApproval=False, exported=False, published=False)
    (OUT / 'geometry-report.json').write_text(json.dumps(report, indent=2) + '\n')
    (OUT / 'build_fourth.py').write_text(Path(__file__).read_text())
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'Bob-Reference-Sculpt.blend'))
    print('BOB_COVERED_ROOT_SAVED', structure, flush=True)
    clay = bpy.data.materials.new('Covered scalp-root bob clay')
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
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'Bob-Reference-Clay.blend'))
    print('BOB_COVERED_ROOT_VIEWS_READY', flush=True)


if __name__ == '__main__':
    main()
