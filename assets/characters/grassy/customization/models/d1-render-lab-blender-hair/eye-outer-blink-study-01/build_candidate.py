"""An offline local eye-surface candidate; preserve the published stage and all other parts."""
import hashlib
import importlib.util
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
SOURCE = BASE / 'temple-root-continuity-study-01/draft-01/PBR-Game-Export.blend'
OUT = HERE / 'draft-01'
AXIS_Y = .035


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


shared = module('eye_source_contract', BASE / 'inner-fringe-overlap-study-01/build.py')


def smooth(a, b, value):
    t = np.clip((value-a)/(b-a), 0, 1)
    return t*t*t*(t*(t*6-15)+10)


def polar(points):
    p = np.asarray(points)
    return np.arctan2(p[..., 0], AXIS_Y-p[..., 1]), np.hypot(p[..., 0], p[..., 1]-AXIS_Y)


def amount(theta, height):
    a = np.abs(theta)
    return (smooth(.20, .30, a)*(1-smooth(.92, 1.07, a))
        * smooth(2.310, 2.350, height)*(1-smooth(2.524, 2.553, height)))


def basis(theta, height):
    u, v = (np.abs(theta)-.60)/.45, (height-2.430)/.125
    return np.stack([np.ones_like(u), u, v, u*u, u*v, v*v], axis=-1)


def support_fit(tree, sign):
    samples = []
    for a in np.linspace(.19, 1.08, 35):
        for z in np.linspace(2.305, 2.558, 33):
            if amount(a, z) > .015:
                continue
            direction = Vector((sign*np.sin(a), -np.cos(a), 0))
            center = Vector((0, AXIS_Y, z))
            hit, normal, face, _ = tree.ray_cast(center+direction, -direction)
            assert hit is not None, ('Eye peripheral support ray missed', sign, a, z)
            samples.append([a, z, np.hypot(hit.x, hit.y-AXIS_Y)])
    samples = np.asarray(samples)
    matrix = basis(samples[:, 0], samples[:, 1])
    coefficients, _, _, _ = np.linalg.lstsq(matrix, samples[:, 2], rcond=None)
    residual = matrix@coefficients-samples[:, 2]
    return coefficients, dict(sign=sign, coefficients=coefficients.tolist(), samples=samples.tolist(),
        fitRMS=float(np.sqrt(np.mean(residual**2))), maximumResidual=float(np.max(np.abs(residual))))


def deform(points, coefficients):
    theta, radius = polar(points)
    weight = amount(theta, points[:, 2])*smooth(.08, .11, np.abs(points[:, 0]))
    target = basis(theta, points[:, 2])@coefficients
    # A strictly positive radial scale retains the ordering of both sides of a
    # sculpted fold; an exact projection would collapse them onto each other.
    new_radius = radius + .98*weight*(target-radius)
    result = points.copy()
    result[:, 0] = np.sin(theta)*new_radius
    result[:, 1] = AXIS_Y-np.cos(theta)*new_radius
    result[weight == 0] = points[weight == 0]
    return result, weight


def tree(points, faces):
    return BVHTree.FromPolygons([Vector(p) for p in points], faces.tolist(), all_triangles=True)


def main():
    OUT.mkdir(exist_ok=True)
    assert not (OUT/'Eye-Surface-Continuity.blend').exists(), 'Preserved candidate already exists'
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    head = bpy.data.objects['Head']
    mesh = head.data
    assert np.allclose(np.asarray(head.matrix_world), np.eye(4), atol=1e-7, rtol=0)
    frozen = {o.name: shared.joint.mesh_hash(o) for o in scene.objects if o.type == 'MESH' and o != head}
    images = shared.image_hashes()
    points = np.asarray([v.co[:] for v in mesh.vertices], float)
    old_corner_normals = np.asarray([n.vector[:] for n in mesh.corner_normals], float)
    polygons = np.asarray([p.vertices[:] for p in mesh.polygons])
    material_ids = np.asarray([p.material_index for p in mesh.polygons])
    assert polygons.shape[1] == 3
    face_index = [m.name for m in mesh.materials].index('model')
    eye_index = [m.name for m in mesh.materials].index('D1 eye')
    face_triangles = polygons[material_ids == face_index]
    eye_triangles = polygons[material_ids == eye_index]
    face_vertices, eye_vertices = np.unique(face_triangles), np.unique(eye_triangles)
    assert not np.intersect1d(face_vertices, eye_vertices).size
    old_tree = tree(points, face_triangles)
    changed = points.copy()
    weights = np.zeros(len(points))
    recipes, fits = [], {}
    for sign in (-1, 1):
        coefficients, recipe = support_fit(old_tree, sign)
        fits[sign] = coefficients
        selected = face_vertices[np.sign(points[face_vertices, 0]) == sign]
        changed[selected], weights[selected] = deform(points[selected], coefficients)
        recipes.append(recipe)
    protected = ((np.abs(points[:, 0]) < .08) | (points[:, 2] >= 2.56) | (points[:, 2] <= 2.30))
    assert np.array_equal(changed[protected], points[protected]), 'Nose/brow/mouth protection failed'
    fixed_face = face_vertices[weights[face_vertices] == 0]
    assert np.array_equal(changed[fixed_face], points[fixed_face])
    new_tree = tree(changed, face_triangles)
    eye_fit = []
    for index in eye_vertices:
        point = points[index]
        sign = -1 if point[0] < 0 else 1
        predicted, w = deform(point[None], fits[sign])
        if w[0] == 0:
            continue
        old_hit, old_normal, _, old_distance = old_tree.find_nearest(Vector(point))
        old_gap = (Vector(point)-old_hit).dot(old_normal)
        skin, normal, triangle, _ = new_tree.find_nearest(Vector(predicted[0]))
        # Refit to the actual repaired skin, retaining the small original decal
        # allowance. This is not a forward cover placed over the old solid rim.
        gap = .00218 if old_gap <= 0 else old_gap
        changed[index] = np.asarray(skin)+np.asarray(normal)*gap
        eye_fit.append(dict(vertex=int(index), oldGap=float(old_gap), targetGap=float(gap),
            surfaceTriangle=int(triangle)))
    moved = np.linalg.norm(changed-points, axis=1) > 1e-10
    assert np.array_equal(changed[protected], points[protected]), 'Eye refit altered protected features'
    mesh.vertices.foreach_set('co', changed.ravel())
    mesh.update()
    # Recompute only the corners touching the repaired area; other imported
    # split normals remain byte-for-byte sourced from the approved stage.
    temp = bpy.data.meshes.new('Eye repaired normal calculation')
    temp.from_pydata(changed.tolist(), [], polygons.tolist())
    for p in temp.polygons:
        p.use_smooth = True
    temp.update()
    computed = np.asarray([n.vector[:] for n in temp.corner_normals], float)
    affected_faces = moved[polygons].any(axis=1)
    affected_vertices = np.unique(polygons[affected_faces])
    loop_vertices = np.asarray([l.vertex_index for l in mesh.loops])
    update_normals = np.isin(loop_vertices, affected_vertices)
    next_normals = old_corner_normals.copy()
    next_normals[update_normals] = computed[update_normals]
    mesh.normals_split_custom_set(next_normals.tolist())
    bpy.data.meshes.remove(temp)
    mesh.update()
    saved_points = np.asarray([v.co[:] for v in mesh.vertices])
    assert all(shared.joint.mesh_hash(bpy.data.objects[n]) == h for n, h in frozen.items())
    assert shared.image_hashes() == images
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash
    assert np.array_equal(saved_points[~moved], points[~moved])
    candidate = OUT/'Eye-Surface-Continuity.blend'
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    np.savez(OUT/'head-diff.npz', before=points, after=saved_points, triangles=polygons,
        materialIds=material_ids, moved=moved, faceWeights=weights, protected=protected,
        originalCornerNormals=old_corner_normals, changedCornerMask=update_normals)
    report = dict(source=str(SOURCE), sourceSHA256=source_hash,
        candidate=str(candidate), candidateSHA256=hashlib.sha256(candidate.read_bytes()).hexdigest(),
        other53MeshesFrozen=frozen, imagesFrozen=images, polygonsExactlyRetained=True,
        eyeUVAndTopologyRetained=True, protectedFeaturesUnchanged=True,
        fixedFaceVertices=int(len(fixed_face)), movedHeadSkinVertices=int(moved[face_vertices].sum()),
        refittedEyePatchVertices=int(moved[eye_vertices].sum()),
        maximumHeadSkinTravel=float(np.linalg.norm(saved_points[face_vertices]-points[face_vertices], axis=1).max()),
        maximumEyePatchTravel=float(np.linalg.norm(saved_points[eye_vertices]-points[eye_vertices], axis=1).max()),
        changedSkinBounds=[saved_points[face_vertices[moved[face_vertices]]].min(0).tolist(), saved_points[face_vertices[moved[face_vertices]]].max(0).tolist()],
        radialResidualFraction=.02, supportFit=recipes, eyeRefit=eye_fit,
        visualApproval=False, structureApproval=False, exported=False, published=False)
    (OUT/'geometry-report.json').write_text(json.dumps(report, indent=2)+'\n')
    print('EYE_CANDIDATE_SAVED', json.dumps({k:v for k,v in report.items() if k not in ('supportFit','eyeRefit','other53MeshesFrozen','imagesFrozen')}), flush=True)


if __name__ == '__main__':
    main()
