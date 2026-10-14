"""Finite triangle and point-gap checks, comparing both sides of head-diff.npz."""
import argparse
import json
from pathlib import Path

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def tree(points, faces):
    return BVHTree.FromPolygons(points.tolist(), faces.tolist(), all_triangles=True, epsilon=1e-7)


def strict_segment_triangle(start, end, triangles):
    # Interior edge-segment hits reject ordinary shared vertex/edge contacts.
    direction = end-start
    a, b, c = triangles[:,0], triangles[:,1], triangles[:,2]
    edge1, edge2 = b-a, c-a
    h = np.cross(direction, edge2)
    det = np.einsum('ij,ij->i', edge1, h)
    nonparallel = np.abs(det) > 1e-16
    inv = np.zeros_like(det)
    inv[nonparallel] = 1/det[nonparallel]
    s = start-a
    u = inv*np.einsum('ij,ij->i', s, h)
    q = np.cross(s, edge1)
    v = inv*np.einsum('ij,ij->i', direction, q)
    t = inv*np.einsum('ij,ij->i', edge2, q)
    length = np.linalg.norm(direction, axis=1)
    endpoint = 1e-8/np.maximum(length, 1e-20)
    good = nonparallel & (u>1e-7) & (v>1e-7) & (u+v<1-1e-7) & (t>endpoint) & (t<1-endpoint)
    return good, start+t[:,None]*direction


def crossings(points, faces_a, faces_b, tree_a, tree_b, self_check=False, ids_a=None, ids_b=None):
    pairs = np.asarray(tree_a.overlap(tree_b), dtype=np.int64).reshape(-1,2)
    if self_check:
        pairs = pairs[pairs[:,0]<pairs[:,1]]
    results = []
    for offset in range(0, len(pairs), 50000):
        chunk = pairs[offset:offset+50000]
        a, b = points[faces_a[chunk[:,0]]], points[faces_b[chunk[:,1]]]
        hit = np.zeros(len(chunk), dtype=bool)
        contact = np.zeros((len(chunk),3))
        for start_tri, end_tri in ((a,b),(b,a)):
            for i in range(3):
                yes, at = strict_segment_triangle(start_tri[:,i], start_tri[:,(i+1)%3], end_tri)
                contact[yes & ~hit] = at[yes & ~hit]
                hit |= yes
        for pair,p in zip(chunk[hit], contact[hit]):
            ia = int(ids_a[pair[0]]) if ids_a is not None else int(pair[0])
            ib = int(ids_b[pair[1]]) if ids_b is not None else int(pair[1])
            if self_check and ia > ib:
                ia,ib = ib,ia
            results.append((ia,ib,p.tolist()))
    return dict(broadphasePairs=int(len(pairs)), crossingPairCount=len(results), pairs=results)


def quality(points, faces):
    t = points[faces]
    area = .5*np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)
    return dict(minArea=float(area.min()), areaBelow1e12=int((area<1e-12).sum()),
        zeroAreaCount=int((area==0).sum()), degenerateFaces=np.flatnonzero(area<1e-12).tolist())


def sample_gaps(points, eye_faces, skin_tree):
    eye_vertices = np.unique(eye_faces)
    edges = np.unique(np.sort(np.concatenate([eye_faces[:,[0,1]],eye_faces[:,[1,2]],eye_faces[:,[2,0]]]),axis=1),axis=0)
    sets = dict(vertex=points[eye_vertices], edgeMidpoint=points[edges].mean(1), faceCentroid=points[eye_faces].mean(1))
    result = {}
    for kind, samples in sets.items():
        gaps = np.empty(len(samples))
        distances = np.empty(len(samples))
        nearest_faces = np.empty(len(samples),dtype=np.int64)
        for i, point in enumerate(samples):
            near, normal, face, distance = skin_tree.find_nearest(Vector(point))
            gaps[i] = (Vector(point)-near).dot(normal)
            distances[i] = distance
            nearest_faces[i] = face
        low = int(np.argmin(gaps))
        result[kind] = dict(count=len(samples), negativeBelow1e7=int((gaps < -1e-7).sum()),
            signedMin=float(gaps.min()), distanceMin=float(distances.min()), signedMedian=float(np.median(gaps)),
            worstSampleIndex=low, worstPointBlender=samples[low].tolist(), nearestSkinFace=int(nearest_faces[low]))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--diff', type=Path, default=Path(__file__).resolve().parent/'draft-01/head-diff.npz')
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent/'draft-01/independent-intersection-audit.json')
    import sys
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    data = np.load(args.diff)
    retopology = 'sourceTriangles' in data
    states = {}
    for key in ('before','after'):
        points = data[key].astype(np.float64)
        if retopology:
            triangles = data['sourceTriangles' if key == 'before' else 'triangles']
            material_ids = data['sourceMaterials' if key == 'before' else 'materials']
            canonical_ids = np.arange(len(triangles)) if key == 'before' else np.r_[data['retainedSourcePolygons'], len(data['sourceTriangles'])+np.arange(len(data['newFaces']))]
        else:
            triangles, material_ids = data['triangles'],data['materialIds']
            canonical_ids = None
        skin_mask=np.isin(material_ids,[0,2])
        skin,eyes = triangles[skin_mask],triangles[material_ids==1]
        skin_ids = canonical_ids[skin_mask] if retopology else None
        eye_ids = canonical_ids[material_ids==1] if retopology else None
        skin_tree, eye_tree = tree(points,skin),tree(points,eyes)
        state = dict(skinQuality=quality(points,skin),eyeQuality=quality(points,eyes))
        for name, fa, fb, ta, tb, self_check, ia, ib in (
                ('skinSelf',skin,skin,skin_tree,skin_tree,True,skin_ids,skin_ids),
                ('eyeSelf',eyes,eyes,eye_tree,eye_tree,True,eye_ids,eye_ids),
                ('eyeSkin',eyes,skin,eye_tree,skin_tree,False,eye_ids,skin_ids)):
            state[name] = crossings(points,fa,fb,ta,tb,self_check,ia,ib)
            print('INTERSECTIONS',key,name,state[name]['broadphasePairs'],state[name]['crossingPairCount'],flush=True)
        state['eyeToSkinSamples'] = sample_gaps(points,eyes,skin_tree)
        states[key] = state
    comparison = {}
    for name in ('skinSelf','eyeSelf','eyeSkin'):
        before = {(a,b) for a,b,_ in states['before'][name]['pairs']}
        after = {(a,b) for a,b,_ in states['after'][name]['pairs']}
        comparison[name] = dict(sourcePairs=len(before),candidatePairs=len(after),
            newlyCrossingPairs=sorted(after-before),resolvedPairs=sorted(before-after),retainedPairs=len(before&after))
    for name in ('skinQuality','eyeQuality'):
        before = set(states['before'][name]['degenerateFaces'])
        after = set(states['after'][name]['degenerateFaces'])
        comparison[name] = dict(newDegenerateFaces=sorted(after-before),removedDegenerateFaces=sorted(before-after))
    report = dict(input=str(args.diff),states=states,comparison=comparison,
        method='BVH broadphase epsilon 1e-7; float64 finite edge/triangle interior intersection, endpoint distance exclusion 1e-8 and barycentric margin 1e-7.',
        pairIdentifiers='Original full Head polygon IDs; new polygons numbered starting at source polygon count' if retopology else 'Per-material triangle row IDs',
        limits='Coplanar overlap and contacts confined to triangle edges/vertices are excluded from proper crossings. Nearest-face signed samples are diagnostic, not independent proof of penetration. Static geometry only; no action replay.',
        visualApproval=False)
    args.out.write_text(json.dumps(report,indent=2)+'\n')
    print('INTERSECTION_AUDIT',json.dumps({k:{n:len(v) if isinstance(v,list) else v for n,v in entry.items()} for k,entry in comparison.items()}),flush=True)


if __name__ == '__main__':
    main()
