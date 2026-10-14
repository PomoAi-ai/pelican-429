"""Compact bob bodies with continuous full-width horizontal sections."""
import hashlib
import importlib.util
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('bob_reference_contract', HERE / 'build.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
OUT = HERE / 'draft-03'
NAMES = [f'{side} lower fan {number:02}' for side in ('right', 'left') for number in (2, 4, 5)]

# The original visible bright widths are not complete physical strand widths.
# These are authored full sections, continuously opening from the existing
# covered root area to the compact body. All heights remain independent.
RECIPES = {
    2: dict(group='rear_outer_body',
        body=[[.292, .371, 2.576], [.376, .390, 2.519], [.414, .426, 2.461],
              [.436, .454, 2.379], [.429, .451, 2.301], [.402, .424, 2.235], [.365, .390, 2.189]],
        width=[.106, .128, .144, .162, .165, .136, .077, .004],
        depth=[.007, .019, .029, .037, .039, .031, .017, .0015], entryIndex=2,
        positiveDelta=[0., .006, .006, .012, .009, .005, .004]),
    4: dict(group='middle_rear_body',
        body=[[.380, .236, 2.551], [.410, .284, 2.508], [.431, .316, 2.437],
              [.441, .345, 2.348], [.422, .346, 2.266], [.385, .310, 2.192], [.341, .259, 2.145]],
        width=[.110, .132, .148, .176, .180, .147, .074, .004],
        depth=[.008, .023, .033, .040, .043, .032, .014, .0015], entryIndex=2,
        positiveDelta=[0., .002, .008, .008, .006, .003, .009]),
    5: dict(group='middle_front_body',
        body=[[.397, .149, 2.525], [.453, .183, 2.496], [.480, .211, 2.436],
              [.493, .239, 2.349], [.462, .230, 2.252], [.399, .177, 2.151], [.333, .105, 2.090]],
        width=[.106, .128, .143, .173, .186, .144, .063, .004],
        depth=[.009, .025, .034, .043, .047, .033, .013, .0015], entryIndex=2,
        positiveDelta=[0., .004, .007, .013, .009, .011, .016]),
}


def arc(rings):
    guide = rings.mean(axis=1)
    lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(guide, axis=0), axis=1))]
    return guide, lengths / lengths[-1]


def sections(root, recipe, sign, head):
    points = np.asarray(recipe['body'], float)
    points[:, 0] *= sign
    if sign > 0:
        points[:, 2] += recipe['positiveDelta']
        points[2:, 0] -= [.006, .010, .012, .011, .013]
    root_near, root_normal = head.find_nearest(Vector(root))[:2]
    root = np.asarray(root_near) + np.asarray(root_normal) * .003
    controls = np.vstack((root, points))
    assert np.all(np.diff(controls[:, 2]) < 0), controls[:, 2]
    heights = np.linspace(controls[0, 2], controls[-1, 2], base.ROWS)
    stations = -controls[:, 2]
    evaluate = lambda values: np.asarray([base.cubic.interpolate(stations, values, -z) for z in heights])
    path = np.column_stack((evaluate(controls[:, 0]), evaluate(controls[:, 1]), heights))
    widths = evaluate(recipe['width'])
    depths = evaluate(recipe['depth'])
    angle = np.arange(base.SIDES) * 2 * np.pi / base.SIDES
    c, s = np.cos(angle), np.sin(angle)
    start_normal = np.asarray(root_normal, float)
    start_angle = np.arctan2(start_normal[1], sign * start_normal[0])
    angles = start_angle * (1 - base.smooth(0., .28, np.linspace(0, 1, base.ROWS)))
    normals = np.column_stack((sign * np.cos(angles), np.sin(angles), np.zeros(base.ROWS)))
    laterals = np.column_stack((-sign * np.sin(angles), np.cos(angles), np.zeros(base.ROWS)))
    rings = np.asarray([p + np.outer(c * width * .5, lateral)
                          + np.outer(s * depth * np.where(s < 0, 1.22, 1.), normal)
        for p, width, depth, normal, lateral in zip(path, widths, depths, normals, laterals)])
    initial = rings.copy()
    _, native_v = arc(rings)
    q = np.clip((native_v - .3) / .7, 0, 1)
    weights = q ** 3 * (q * (q * 6 - 15) + 10)
    travel = base.maximum_travel(rings.mean(axis=1))
    directions = path.copy()
    directions[:, 1] -= .035
    directions[:, 2] = 0
    directions /= np.linalg.norm(directions, axis=1)[:, None]
    required = []
    for row, ring in enumerate(rings):
        margin = -.0012 if native_v[row] < .08 else .0015 + travel * weights[row]
        probes = np.vstack((ring, (ring + np.roll(ring, -1, axis=0)) * .5))
        def minimum(distance):
            return min(base.shared.joint.audit_helper.signed_distance(head, p + directions[row] * distance)
                       for p in probes)
        if minimum(0) >= margin:
            required.append(0.)
            continue
        low, high = 0., .12
        assert minimum(high) >= margin, ('Head clearance', row)
        for _ in range(15):
            distance = (low + high) * .5
            if minimum(distance) < margin:
                low = distance
            else:
                high = distance
        required.append(high + .0003)
    shifts = np.asarray(required)
    for _ in range(3):
        padded = np.pad(shifts, (2, 2), mode='edge')
        shifts = np.maximum(required, np.asarray([padded[i:i + 5].mean() for i in range(base.ROWS)]))
    rings += directions[:, None, :] * shifts[:, None, None]
    assert np.array_equal(rings[:, :, 2], initial[:, :, 2])
    assert np.all(np.diff(rings[:, 0, 2]) < 0)
    guide, native_v = arc(rings)
    entry_row = int(np.argmin(abs(heights - controls[recipe['entryIndex'], 2])))
    metadata = dict(group=recipe['group'], controls=controls.tolist(),
        physicalWidth=recipe['width'], radialDepth=recipe['depth'],
        sectionConstruction='continuous horizontal closed ellipse, C1 width/centre; no tangent tube',
        headFit='whole-section horizontal radial translation; fixed Z and local relative positions',
        maximumHeadFitShift=float(shifts.max()),
        visibleEntrySourcePixels=base.GROUPS[recipe['group']]['side']['visibleEntry'],
        visibleEntryRow=entry_row, visibleEntryNativeV=float(native_v[entry_row]),
        visibleEntryWorldCentre=guide[entry_row].tolist(),
        maximumMeasuredStrandTravel=travel,
        authoringNote='visible light-strip widths were not used as physical full strand widths')
    return rings, metadata


def main():
    OUT.mkdir(exist_ok=False)
    source_sha = hashlib.sha256(base.SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(base.SOURCE))
    scene = bpy.context.scene
    frozen = {o.name: base.shared.joint.mesh_hash(o) for o in scene.objects if o.type == 'MESH' and o.name not in NAMES}
    assert len(frozen) == 48
    image_hashes = base.shared.image_hashes()
    head = base.shared.joint.skull_tree(bpy.data.objects['Head'])
    reports = []
    for sign, label in ((-1, 'right'), (1, 'left')):
        for number in (2, 4, 5):
            name = f'{label} lower fan {number:02}'
            old = bpy.data.objects[name]
            root = np.asarray(json.loads(old['guideBlender']))[0]
            uv = np.asarray([loop.uv for loop in old.data.uv_layers.active.data])
            offset, scale = uv.min(axis=0), np.ptp(uv, axis=0)
            material, matrix, region = old.active_material, old.matrix_world.copy(), old['region']
            rings, recipe = sections(root, RECIPES[number], sign, head)
            bpy.data.objects.remove(old, do_unlink=True)
            for handle in list(scene.objects):
                if handle.type == 'CURVE' and handle.name.startswith(name + ' '):
                    bpy.data.objects.remove(handle, do_unlink=True)
            obj, guide = base.shared.joint.helper.closed_object(name, rings, material, matrix, region)
            base.shared.add_atlas_uv(obj, offset, scale)
            obj['authorControls'] = json.dumps(recipe['controls'])
            r = base.shared.joint.inspect(obj, head, recipe)
            reports.append(r)
            print('BOB_HORIZONTAL_COMPONENT', name, r['selfIntersection']['exactCrossings'], r['rootGuideDistance'], flush=True)
    assert all(base.shared.joint.mesh_hash(bpy.data.objects[n]) == h for n, h in frozen.items())
    assert base.shared.image_hashes() == image_hashes
    assert hashlib.sha256(base.SOURCE.read_bytes()).hexdigest() == source_sha
    report = dict(source=str(base.SOURCE), sourceSHA256=source_sha,
        changedComponents=NAMES, other48MeshHashes=frozen, allImagePixelHashesFrozen=image_hashes,
        components=reports, structurePass=all(r['closed'] and r['signedVolume'] > 0 and r['selfIntersection']['exactCrossings'] == 0 for r in reports),
        sourceUnderfoldAndSmallTipsFrozen=True, sourceComponentCount=len(json.loads(scene['Hair components'])),
        nativeUV='U=closed section angle 0..1; V=actual section-centre arclength 0..1',
        visualApproval=False, animationApproval=False, exported=False, published=False)
    (OUT / 'geometry-report.json').write_text(json.dumps(report, indent=2) + '\n')
    (OUT / 'build_third.py').write_text(Path(__file__).read_text())
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'Bob-Reference-Sculpt.blend'))
    print('BOB_HORIZONTAL_SAVED', OUT, flush=True)
    clay = bpy.data.materials.new('Reference compact full-width bob clay')
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
    print('BOB_HORIZONTAL_VIEWS_READY', OUT, flush=True)


if __name__ == '__main__':
    main()
