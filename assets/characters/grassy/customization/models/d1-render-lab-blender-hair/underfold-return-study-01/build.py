"""Return only the upper underfold shell into its real Head-side corridor."""
import hashlib
import importlib.util
import json
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('underfold_measurement', HERE / 'inspect_source.py')
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)
base = source.base
OUT = HERE / 'draft-02'
SIDES = 28


def digest_uv(obj):
    return {layer.name: hashlib.sha256(np.asarray([p.uv for p in layer.data], dtype='<f4').tobytes()).hexdigest()
            for layer in obj.data.uv_layers}


def native_flow(obj):
    layer = obj.data.uv_layers['Hair flow native']
    total, count = np.zeros(len(obj.data.vertices)), np.zeros(len(obj.data.vertices))
    for loop, uv in zip(obj.data.loops, layer.data):
        total[loop.vertex_index] += uv.uv.y
        count[loop.vertex_index] += 1
    assert np.all(count > 0)
    return total / count


def deform(obj, head):
    sign = -1 if obj.name.startswith('right') else 1
    points = np.asarray([v.co for v in obj.data.vertices], float)
    rings = points[:-2].reshape(-1, SIDES, 3)
    assert len(rings) == 81
    guide = rings.mean(axis=1)
    travel = base.maximum_travel(guide)
    flow = native_flow(obj)
    # A constant full-motion allowance makes this a spatial deformation,
    # independent of which overlapping loft row owns a vertex.
    motion_margin = .003 + travel
    changed = points.copy()
    records = []
    for i, point in enumerate(points):
        # These existing roots already meet skin; the neck volume is also
        # retained. Only the exposed upper/middle bridge changes thickness.
        amount = float(base.smooth(2.440, 2.540, point[2])
            * (1 - base.smooth(2.680, 2.760, point[2])))
        if amount == 0:
            continue
        hit, normal = head.ray_cast(Vector((sign * 2, point[1], point[2])), Vector((-sign, 0, 0)))[:2]
        assert hit is not None, (obj.name, i, 'Head section missing in upper return region')
        assert abs(normal.x) > .10, (obj.name, i, 'Head section tangent too shallow')
        old_gap = sign * (point[0] - hit.x)
        assert old_gap > 0, (obj.name, i, 'source body enters Head')
        # This strictly increasing X mapping keeps the two closed shell faces
        # ordered while following actual skull curvature at each Y/Z.
        target_gap = motion_margin / abs(normal.x) + .12 * old_gap
        changed[i, 0] = point[0] + sign * (target_gap - old_gap) * amount
        records.append(dict(vertex=i, amount=amount, oldHeadXGap=float(old_gap),
            targetHeadXGap=float(target_gap), requiredNormalGap=float(motion_margin)))
    assert np.array_equal(changed[:, 1:], points[:, 1:])
    assert np.array_equal(changed[points[:, 2] <= 2.440], points[points[:, 2] <= 2.440])
    assert np.array_equal(changed[:SIDES * 4], points[:SIDES * 4])
    # Preserve the same cap convention and update the actual guide used by
    # inspection and editing; native UVs stay material coordinates.
    new_guide = changed[:-2].reshape(-1, SIDES, 3).mean(axis=1)
    changed[-2:] = new_guide[[0, -1]]
    uv_hash = digest_uv(obj)
    for vertex, coordinate in zip(obj.data.vertices, changed):
        vertex.co = coordinate
    obj.data.update()
    obj['guideBlender'] = json.dumps(new_guide.tolist())
    obj['guideMeaning'] = 'Actual centreline of 81 retained closed sections; fixed scalp root and neck end preserved'
    for handle in bpy.context.scene.objects:
        if handle.type == 'CURVE' and handle.name.startswith(obj.name + ' '):
            assert len(handle.data.splines) == 1
            spline = handle.data.splines[0]
            assert len(spline.points) == len(new_guide), (handle.name, len(spline.points))
            for p, coordinate in zip(spline.points, new_guide):
                p.co = (*coordinate, 1)
    assert digest_uv(obj) == uv_hash
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    closed = all(edge.is_manifold for edge in bm.edges)
    volume = float(bm.calc_volume(signed=True))
    bm.free()
    audit = base.shared.joint.audit_helper
    audit.SIDES = SIDES
    crossings = audit.proper_crossings(obj.data)
    distances = np.asarray([audit.signed_distance(head, p) for p in changed])
    face_distances = [audit.signed_distance(head, changed[list(p.vertices)].mean(axis=0)) for p in obj.data.polygons]
    changed_indices = np.asarray([r['vertex'] for r in records], int)
    moving = changed_indices[flow[changed_indices] > .3]
    return dict(name=obj.name, vertices=len(points), sectionSize=SIDES, guideSamples=len(new_guide),
        closed=closed, signedVolume=volume, selfIntersection=crossings,
        headVertexMin=float(distances.min()), headFaceMin=float(min(face_distances)),
        changedHeadVertexMin=float(distances[changed_indices].min()),
        changedMovingHeadVertexMin=float(distances[moving].min()), maximumMeasuredStrandTravel=travel,
        fixedRootExact=True, neckBelowZ=2.440, neckBelowZExact=True,
        nativeUVHashesFrozen=uv_hash, allYZExact=True,
        maximumInwardShift=float(np.max(np.linalg.norm(changed - points, axis=1))),
        changedVertexCount=len(records), records=records)


def shoulder_hits(scene):
    trees = {o.name: base.shared.joint.skull_tree(o) for o in scene.objects if o.type == 'MESH' and not o.hide_render}
    result = []
    for x, y in ((230, 390), (260, 402), (272, 420), (265, 442), (239, 514)):
        origin = Vector((-4, .015 - (x + .5 - 384) / 512, 2.64 + (384 - y - .5) / 512))
        hits = []
        for name, tree in trees.items():
            hit, _, face, distance = tree.ray_cast(origin, Vector((1, 0, 0)))
            if hit is not None:
                hits.append([distance, name, list(hit), face])
        result.append(dict(pixel=[x, y], orderedHits=sorted(hits)[:6]))
    return result


def main():
    OUT.mkdir(exist_ok=False)
    source_sha = hashlib.sha256(source.SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source.SOURCE))
    scene = bpy.context.scene
    frozen = {o.name: base.shared.joint.mesh_hash(o) for o in scene.objects if o.type == 'MESH' and o.name not in source.NAMES}
    assert len(frozen) == 52
    images = base.shared.image_hashes()
    head = base.shared.joint.skull_tree(bpy.data.objects['Head'])
    reports = [deform(bpy.data.objects[name], head) for name in source.NAMES]
    assert all(base.shared.joint.mesh_hash(bpy.data.objects[name]) == sha for name, sha in frozen.items())
    assert base.shared.image_hashes() == images
    assert hashlib.sha256(source.SOURCE.read_bytes()).hexdigest() == source_sha
    structure = all(r['closed'] and r['signedVolume'] > 0 and r['selfIntersection']['exactCrossings'] == 0 for r in reports)
    report = dict(source=str(source.SOURCE), sourceSHA256=source_sha, changedComponents=source.NAMES,
        other52MeshHashes=frozen, allImagePixelHashesFrozen=images, components=reports,
        structurePass=structure, sideShoulderPixelHits=shoulder_hits(scene),
        method='Same-Y/Z actual Head section; compress only positive X clearance of upper/middle underfold',
        visualApproval=False, animationApproval=False, exported=False, published=False)
    (OUT / 'geometry-report.json').write_text(json.dumps(report, indent=2) + '\n')
    (OUT / 'build.py').write_text(Path(__file__).read_text())
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'Underfold-Return-Sculpt.blend'))
    print('UNDERFOLD_RETURN_SAVED', structure, flush=True)
    clay = bpy.data.materials.new('Underfold return inspection clay')
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
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'Underfold-Return-Clay.blend'))
    print('UNDERFOLD_RETURN_VIEWS_READY', flush=True)


if __name__ == '__main__':
    main()
