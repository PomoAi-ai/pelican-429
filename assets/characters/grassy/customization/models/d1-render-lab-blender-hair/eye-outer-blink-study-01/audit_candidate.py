"""Independent read-only audit of the saved first eye surface candidate."""
import hashlib
import json
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / 'temple-root-continuity-study-01/draft-01/PBR-Game-Export.blend'
CANDIDATE = HERE / 'draft-01/Eye-Surface-Continuity.blend'
OUT = HERE / 'draft-01'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def digest(value):
    if isinstance(value, np.ndarray):
        return hashlib.sha256(value.tobytes()).hexdigest()
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def values(items, attr, width, dtype=np.float32):
    result = np.empty(len(items)*width, dtype=dtype)
    items.foreach_get(attr, result)
    return result.reshape(-1, width)


def mesh_state(obj):
    m = obj.data
    return dict(points=digest(values(m.vertices, 'co', 3)),
        topology=digest([[*p.vertices] for p in m.polygons]),
        materialIds=digest([p.material_index for p in m.polygons]),
        uv={uv.name:digest(values(uv.data, 'uv', 2)) for uv in m.uv_layers},
        cornerNormals=digest(values(m.corner_normals, 'vector', 3)),
        groups=digest(dict(names=[g.name for g in obj.vertex_groups],
            weights=[[(g.group, g.weight) for g in v.groups] for v in m.vertices])),
        matrix=digest(np.asarray(obj.matrix_world, dtype=np.float64)),
        slots=[(s.link, s.material.name if s.material else None) for s in obj.material_slots])


def action_state(action):
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    curves.append(dict(layer=layer.name, slot=bag.slot_handle,
                        path=fc.data_path, index=fc.array_index, extrapolation=fc.extrapolation,
                        points=[dict(co=list(p.co), left=list(p.handle_left), right=list(p.handle_right),
                            interpolation=p.interpolation, easing=p.easing,
                            leftType=p.handle_left_type, rightType=p.handle_right_type,
                            amplitude=p.amplitude, back=p.back, period=p.period)
                            for p in fc.keyframe_points]))
    return dict(curveCount=len(curves), digest=digest(curves), frameRange=list(action.frame_range))


def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    meshes = {o.name:mesh_state(o) for o in bpy.context.scene.objects if o.type == 'MESH'}
    images = {}
    for img in bpy.data.images:
        if img.type == 'RENDER_RESULT' or not img.size[0]:
            continue
        pixels = np.empty(len(img.pixels), dtype=np.float32)
        img.pixels.foreach_get(pixels)
        images[img.name] = dict(size=list(img.size), pixels=digest(pixels))
    bones = {}
    for o in bpy.context.scene.objects:
        if o.type == 'ARMATURE':
            bones[o.name] = dict(matrix=np.asarray(o.matrix_world).tolist(),
                bones=[dict(name=b.name, parent=b.parent.name if b.parent else None,
                    restMatrix=np.asarray(b.matrix_local).tolist(), head=list(b.head_local),
                    tail=list(b.tail_local), deform=b.use_deform) for b in o.data.bones])
    head = bpy.data.objects['Head'].data
    return dict(meshes=meshes, images=images, bones=bones,
        actions={a.name:action_state(a) for a in bpy.data.actions},
        points=values(head.vertices, 'co', 3),
        normals=values(head.corner_normals, 'vector', 3),
        loopVertices=values(head.loops, 'vertex_index', 1, np.int32).ravel())


def main():
    hashes = {str(p):sha(p) for p in (SOURCE, CANDIDATE)}
    source, candidate = snapshot(SOURCE), snapshot(CANDIDATE)
    diff = np.load(OUT/'head-diff.npz')
    actual_moved = np.any(source['points'] != candidate['points'], axis=1)
    faces, material_ids = diff['triangles'], diff['materialIds']
    skin = np.unique(faces[material_ids == 0])
    eye = np.unique(faces[material_ids == 1])
    other_names = sorted(set(source['meshes'])-{'Head'})
    changed_mesh_fields = {n:[k for k in source['meshes'][n] if source['meshes'][n][k] != candidate['meshes'][n][k]] for n in other_names}
    changed_mesh_fields = {n:v for n,v in changed_mesh_fields.items() if v}
    head_fields = [k for k in source['meshes']['Head'] if source['meshes']['Head'][k] != candidate['meshes']['Head'][k]]
    normal_delta = np.linalg.norm(source['normals']-candidate['normals'], axis=1)
    fixed_corners = ~diff['changedCornerMask']
    protected_corners = diff['protected'][source['loopVertices']]
    eye_delta = candidate['points'][eye]-source['points'][eye]
    skin_before, skin_after = source['points'][skin], candidate['points'][skin]
    theta_before = np.arctan2(skin_before[:,0], .035-skin_before[:,1])
    theta_after = np.arctan2(skin_after[:,0], .035-skin_after[:,1])
    report = dict(sourceSHA256=hashes[str(SOURCE)], candidateSHA256=hashes[str(CANDIDATE)],
        bothFilesUnchanged=all(sha(Path(p)) == h for p,h in hashes.items()),
        sceneMeshCount=len(source['meshes']), otherMeshCount=len(other_names),
        meshNameSetFrozen=set(source['meshes']) == set(candidate['meshes']),
        otherMeshesFullyFrozen=not changed_mesh_fields, changedOtherMeshFields=changed_mesh_fields,
        headChangedFields=head_fields,
        everyMeshUVFrozen=all(source['meshes'][n]['uv'] == candidate['meshes'][n]['uv'] for n in source['meshes']),
        imageCount=len(source['images']), imagesFrozen=source['images'] == candidate['images'],
        skeletonsFrozen=source['bones'] == candidate['bones'],
        actionsFrozen=source['actions'] == candidate['actions'], actions=source['actions'],
        headSourceMatchesDiff=bool(np.array_equal(source['points'], diff['before'])),
        headSavedCandidateMatchesDiff=bool(np.array_equal(candidate['points'], diff['after'])),
        movedMaskMatchesActual=bool(np.array_equal(actual_moved, diff['moved'])),
        actualMovedSkinVertices=int(actual_moved[skin].sum()), actualMovedEyeVertices=int(actual_moved[eye].sum()),
        unchangedCoordinatesExactlyFrozen=bool(np.array_equal(source['points'][~diff['moved']], candidate['points'][~diff['moved']])),
        protectedCoordinatesExactlyFrozen=bool(np.array_equal(source['points'][diff['protected']], candidate['points'][diff['protected']])),
        protectedSkinVertexCount=int(diff['protected'][skin].sum()),
        skinZExactlyFrozen=bool(np.array_equal(skin_before[:,2], skin_after[:,2])),
        skinMaxPolarAngleChangeRadians=float(np.max(np.abs(theta_after-theta_before))),
        eyeDisplacementStdXYZ=eye_delta.std(0).tolist(), eyeDisplacementMeanXYZ=eye_delta.mean(0).tolist(),
        eyeDisplacementMinXYZ=eye_delta.min(0).tolist(), eyeDisplacementMaxXYZ=eye_delta.max(0).tolist(),
        fixedCornerNormals=dict(count=int(fixed_corners.sum()), changed=int((normal_delta[fixed_corners]>0).sum()),
            maxVectorDifference=float(normal_delta[fixed_corners].max())),
        protectedCornerNormals=dict(count=int(protected_corners.sum()), changed=int((normal_delta[protected_corners]>0).sum()),
            maxVectorDifference=float(normal_delta[protected_corners].max())),
        visualStatus='rejected: original folded topology remains as thin rings/cracks; numeric audit does not authorize publication')
    (OUT/'independent-contract-audit.json').write_text(json.dumps(report, indent=2)+'\n')
    print('INDEPENDENT_CONTRACT', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
