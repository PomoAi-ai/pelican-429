"""Rebuild only the two folded temple roots; freeze visible lower shape and T."""
import hashlib
import importlib.util
import json
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('temple_saved_contract', HERE / 'inspect_source.py')
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)
base, export = contract.base, contract.export
SOURCE, NAMES = contract.SOURCE, contract.NAMES
OUT = HERE / 'draft-01'
JOIN, SIDES = 14, 28


def unit(value):
    return value / np.linalg.norm(value)


def transport(centres, end_lateral, end_positive):
    tangents = np.gradient(centres, axis=0)
    tangents /= np.linalg.norm(tangents, axis=1)[:, None]
    lateral = unit(end_lateral-tangents[-1]*np.dot(end_lateral, tangents[-1]))
    normal_sign = np.sign(np.dot(np.cross(tangents[-1], lateral), end_positive))
    assert normal_sign != 0
    result = [(None, None)] * len(centres)
    for row in range(len(centres)-1, -1, -1):
        tangent = tangents[row]
        if row < len(centres)-1:
            axis = np.cross(tangents[row+1], tangent)
            sine = np.linalg.norm(axis)
            if sine > 1e-10:
                axis /= sine
                cosine = np.clip(np.dot(tangents[row+1], tangent), -1, 1)
                lateral = lateral*cosine + np.cross(axis, lateral)*sine + axis*np.dot(axis, lateral)*(1-cosine)
        lateral = unit(lateral-tangent*np.dot(lateral, tangent))
        normal = normal_sign*np.cross(tangent, lateral)
        result[row] = (lateral.copy(), normal)
    return result


def rooted_sections(original, head, old_t):
    old = original[:-2].reshape(41, SIDES, 3)
    centres = old[:JOIN+1].mean(axis=1)
    skin, normal = head.find_nearest(Vector(centres[0]))[:2]
    centres[0] = np.asarray(skin)+np.asarray(normal)*.003
    frames = transport(centres, old[JOIN, 0]-old[JOIN, SIDES//2],
        old[JOIN, SIDES//4]-old[JOIN, SIDES*3//4])
    angles = np.arange(SIDES)*np.pi*2/SIDES
    width = np.asarray([.010, .015, .021, .028, .035, .042, .049, .054, .059, .064, .070, .073, .074, .074, .074])
    depth = np.asarray([.0015, .002, .0028, .0035, .0045, .006, .0075, .009, .010, .012, .014, .016, .017, .018, .020])
    rings = old.copy()
    for row in range(JOIN):
        lateral, normal = frames[row]
        ellipse = centres[row] + np.outer(np.cos(angles)*width[row]*.5, lateral) + np.outer(np.sin(angles)*depth[row], normal)
        blend = float(base.smooth(.52, 1., row/JOIN))
        rings[row] = ellipse*(1-blend) + old[row]*blend
    original_root = rings[:JOIN].copy()
    corrections = []
    for row in range(JOIN):
        ring = rings[row]
        direction = np.asarray(head.find_nearest(Vector(ring.mean(0)))[1])
        probes = np.vstack((ring, (ring+np.roll(ring, -1, axis=0))*.5))
        q = np.clip((old_t[row*SIDES]-.3)/.7, 0, 1)
        margin = .0008 if row == 0 else .0018+.00682*q**3*(q*(q*6-15)+10)
        def gap(distance):
            return min(base.shared.joint.audit_helper.signed_distance(head, p+direction*distance) for p in probes)
        shift = 0.
        if gap(0) < margin:
            low, high = 0., .06
            assert gap(high) >= margin, ('root clearance cannot fit', row)
            for _ in range(18):
                middle = (low+high)*.5
                if gap(middle) < margin:
                    low = middle
                else:
                    high = middle
            shift = high+.0001
            rings[row] += direction*shift
        corrections.append(dict(row=row, normal=direction.tolist(), shift=shift, requiredMargin=float(margin)))
    points = np.vstack((rings.reshape(-1, 3), original[-2:]))
    points[-2] = rings[0].mean(0)
    assert np.array_equal(points[JOIN*SIDES:-2], original[JOIN*SIDES:-2])
    assert np.array_equal(points[-1], original[-1])
    return points, dict(joinRow=JOIN, firstRetainedRuntimeT=float(old_t[JOIN*SIDES]),
        sourceLowerVerticesExactlyRetained=True, tipCapExactlyRetained=True,
        construction='Parallel-transported thin root sections open into original row14; whole-section real Head clearance',
        widths=width.tolist(), depths=depth.tolist(), rigidSectionCorrections=corrections,
        rootBeforeClearanceMean=original_root[0].mean(0).tolist())


def add_native_contract(obj, old_t, old_uv):
    active = obj.data.uv_layers.active
    assert active.name == 'Hair flow' and len(obj.data.uv_layers) == 1
    native = obj.data.uv_layers.new(name='Hair flow native')
    u0, u1 = old_uv[:, 0].min(), old_uv[:, 0].max()
    for loop, pixel, uv in zip(obj.data.loops, old_uv, native.data):
        uv.uv = ((pixel[0]-u0)/(u1-u0), old_t[loop.vertex_index])
    obj.data.uv_layers.active = active
    active.active_render = True
    points = export.world_points(obj)
    rings = points[:-2].reshape(41, SIDES, 3)
    guide = rings.mean(1)
    # The legacy exporter included each cap centre in its root/tip level.
    guide[0] = points[np.r_[np.arange(SIDES), len(points)-2]].mean(0)
    guide[-1] = points[np.r_[np.arange(40*SIDES, 41*SIDES), len(points)-1]].mean(0)
    obj['guideBlender'] = json.dumps(guide.tolist())
    obj['guideMeaning'] = 'Actual geometry section centres; cap centres included at root/tip; lower motion T retained in native UV'
    obj['sectionSize'] = SIDES
    obj['strandTopology'] = 'ordered-closed-sweep'
    obj['nativeUV'] = 'U=original atlas strip normalized; V=frozen previous actual exporter runtime T per vertex'
    return guide


def main():
    # Baseline evidence must exist before any candidate can be built.
    assert (HERE/'baseline-motion/report.json').exists(), 'Run actual source motion/contact audit first'
    OUT.mkdir(exist_ok=False)
    source_sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    saved = np.load(HERE/'source-runtime.npz')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    frozen = {o.name: base.shared.joint.mesh_hash(o) for o in scene.objects if o.type == 'MESH' and o.name not in NAMES}
    assert len(frozen) == 52
    images = base.shared.image_hashes()
    head = base.shared.joint.skull_tree(bpy.data.objects['Head'])
    reports, arrays, sections = [], {}, []
    for index, name in enumerate(NAMES):
        obj = bpy.data.objects[name]
        original = export.world_points(obj)
        old_t, old_flow, old_uv = saved[f'{index}_runtimeT'], saved[f'{index}_runtimeFlow'], saved[f'{index}_uv']
        assert np.array_equal(original, saved[f'{index}_points'])
        changed, recipe = rooted_sections(original, head, old_t)
        obj.data.vertices.foreach_set('co', changed.ravel())
        obj.data.update()
        guide = add_native_contract(obj, old_t, old_uv)
        uv = np.asarray([p.uv for p in obj.data.uv_layers['Hair flow'].data])
        assert np.array_equal(uv, old_uv)
        points = export.world_points(obj)
        _, t, flow, exported_guides = export.strand_data(obj, points, uv, 0)
        assert np.array_equal(t.astype(np.float32), old_t.astype(np.float32)), 'actual runtime T changed'
        lower = np.r_[np.arange(JOIN*SIDES, len(points)-2), len(points)-1]
        assert np.array_equal(points[lower], original[lower])
        angles = np.degrees(np.arccos(np.clip(np.sum(flow[lower]*old_flow[lower], axis=1), -1, 1)))
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        closed, volume = all(e.is_manifold for e in bm.edges), float(bm.calc_volume(signed=True))
        bm.free()
        base.shared.joint.audit_helper.SIDES = SIDES
        crossings = base.shared.joint.audit_helper.proper_crossings(obj.data)
        root_distances = np.asarray([base.shared.joint.audit_helper.signed_distance(head, p) for p in points[:SIDES*3]])
        obj['rootDistance'] = base.shared.joint.audit_helper.signed_distance(head, guide[0])
        obj['rootContactVertexIndices'] = np.flatnonzero(np.abs(root_distances) <= .012).tolist()
        motion = contract.shared.motion_check(obj, head)
        reports.append(dict(name=name, closed=closed, signedVolume=volume, selfIntersection=crossings,
            recipe=recipe, actualRuntimeTFloat32ExactlyFrozen=True, lowerGeometryExactlyFrozen=True,
            activeAtlasUVExactlyFrozen=True, maximumLowerFlowAngleDegrees=float(angles.max()),
            meanLowerFlowAngleDegrees=float(angles.mean()), rootGuideDistance=obj['rootDistance'],
            firstThreeRootRowsSkinDistanceRange=[float(root_distances.min()), float(root_distances.max())],
            actualRootContactVertexCount=len(obj['rootContactVertexIndices']), motion=motion))
        obj.data.calc_loop_triangles()
        arrays.update({f'{index}_points':points, f'{index}_runtimeT':t, f'{index}_runtimeFlow':flow,
            f'{index}_triangles':np.asarray([f.vertices[:] for f in obj.data.loop_triangles])})
        sections.append(dict(name=name, oldRuntimeGuide=exported_guides[0]))
        print('TEMPLE_ROOT_CHECK', name, crossings['exactCrossings'], float(angles.max()), motion['probes'], flush=True)
    assert all(base.shared.joint.mesh_hash(bpy.data.objects[name]) == sha for name, sha in frozen.items())
    assert base.shared.image_hashes() == images
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_sha
    arrays['headPoints'], arrays['headTriangles'] = saved['headPoints'], saved['headTriangles']
    np.savez(OUT/'candidate-runtime.npz', **arrays)
    candidate = OUT/'Temple-Root-Continuity.blend'
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    candidate_sha = hashlib.sha256(candidate.read_bytes()).hexdigest()
    (OUT/'candidate-sections.json').write_text(json.dumps(dict(source=str(candidate), sourceSHA256=candidate_sha,
        components=sections), indent=2)+'\n')
    report = dict(source=str(SOURCE), sourceSHA256=source_sha, candidateSHA256=candidate_sha,
        other52MeshHashes=frozen, allImagePixelHashesFrozen=images, components=reports,
        structurePass=all(r['closed'] and r['signedVolume'] > 0 and r['selfIntersection']['exactCrossings'] == 0 for r in reports),
        movingSampleBoundsPass=all(p['movingLowerBound'] > 0 for r in reports for p in r['motion']['probes'].values()),
        visualApproval=False, animationApproval=False, exported=False, published=False)
    (OUT/'geometry-report.json').write_text(json.dumps(report, indent=2)+'\n')
    (OUT/'build.py').write_text(Path(__file__).read_text())
    clay = bpy.data.materials.new('Repaired temple root inspection clay')
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
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Temple-Root-Continuity-Clay.blend'))
    print('TEMPLE_ROOT_VIEWS_READY', report['structurePass'], report['movingSampleBoundsPass'], flush=True)


if __name__ == '__main__':
    main()
