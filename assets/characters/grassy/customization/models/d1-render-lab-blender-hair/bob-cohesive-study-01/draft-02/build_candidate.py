"""One cohesive bob candidate; preserve the source scene outside its lower hair."""
import hashlib
import importlib.util
import json
import math
import sys
from collections import Counter
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri

HERE = Path(__file__).resolve().parent
BASE = HERE.parent.parent
SOURCE = BASE / 'fringe-junction-assembly-study-01/draft-03/D1-Hair-Painted.blend'
sys.dont_write_bytecode = True
sys.path.insert(0, str(BASE))
from build import skull_tree

spec = importlib.util.spec_from_file_location('frozen_bob_helpers', HERE.parent / 'bob-helpers.py')
bob = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bob)
SIDES = 28


def mesh_hash(obj):
    digest = hashlib.sha256()
    digest.update(np.asarray(obj.matrix_world, dtype='<f8').tobytes())
    digest.update(np.asarray([v.co for v in obj.data.vertices], dtype='<f4').tobytes())
    digest.update(np.asarray([i for p in obj.data.polygons for i in [len(p.vertices), *p.vertices]], dtype='<i4').tobytes())
    for layer in obj.data.uv_layers:
        digest.update(layer.name.encode())
        digest.update(np.asarray([v.uv for v in layer.data], dtype='<f4').tobytes())
    return digest.hexdigest()


def scene_visibility():
    points, faces, owners = [], [], []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or obj.hide_render:
            continue
        offset = len(points)
        points.extend(obj.matrix_world @ v.co for v in obj.data.vertices)
        faces.extend(tuple(offset + i for i in p.vertices) for p in obj.data.polygons)
        owners.extend([obj.name] * len(obj.data.polygons))
    tree = BVHTree.FromPolygons(points, faces)
    result = {}
    for view, direction in [('front', Vector((0, 1, 0))), ('right', Vector((1, 0, 0)))]:
        counts, skin = Counter(), []
        xs = range(72, 340, 8) if view == 'front' else range(72, 440, 8)
        for y in range(450, 700, 8):
            for x in xs:
                z = 2.64 + (384-y-.5)/512
                origin = Vector(((x+.5-384)/512, -4, z)) if view == 'front' else Vector((-4, .015-(x+.5-384)/512, z))
                point, normal, face, distance = tree.ray_cast(origin, direction)
                name = 'background' if face is None else owners[face]
                counts[name] += 1
                if name in ('background', 'Head'):
                    skin.append([x, y, name])
        result[view] = dict(firstHitCounts=dict(counts), headOrBackgroundSamples=skin)
    return result


def signed_distance(tree, point):
    hit, normal, _, _ = tree.find_nearest(Vector(point))
    return float((Vector(point)-hit).dot(normal))


def proper_crossings(mesh):
    mesh.calc_loop_triangles()
    verts = [v.co.copy() for v in mesh.vertices]
    tris = [tuple(t.vertices) for t in mesh.loop_triangles]
    tree = BVHTree.FromPolygons(verts, tris, all_triangles=True)
    pairs = [(a, b) for a, b in tree.overlap(tree) if a < b and not set(tris[a]).intersection(tris[b])]
    hits = []
    for ia, ib in pairs:
        crossed = False
        for a, b in [(tris[ia], tris[ib]), (tris[ib], tris[ia])]:
            p, q, r = [verts[i] for i in b]
            normal = (q-p).cross(r-p)
            if normal.length < 1e-12:
                continue
            normal.normalize()
            for j in range(3):
                origin = verts[a[j]]
                edge = verts[a[(j+1)%3]]-origin
                length = edge.length
                if length < 1e-10 or abs(edge.normalized().dot(normal)) < 1e-7:
                    continue
                hit = intersect_ray_tri(p, q, r, edge.normalized(), origin, True)
                if hit is None:
                    continue
                distance = (hit-origin).dot(edge.normalized())
                if not 1e-6 < distance < length-1e-6:
                    continue
                e0, e1, delta = q-p, r-p, hit-p
                d00, d01, d11 = e0.dot(e0), e0.dot(e1), e1.dot(e1)
                den = d00*d11-d01*d01
                if abs(den) < 1e-20:
                    continue
                u = (d11*delta.dot(e0)-d01*delta.dot(e1))/den
                v = (d00*delta.dot(e1)-d01*delta.dot(e0))/den
                if min(u, v, 1-u-v) > 1e-4:
                    crossed = True
                    break
            if crossed:
                break
        if crossed:
            rows = [min(tris[i])//SIDES for i in (ia, ib)]
            hits.append(dict(triangles=[ia, ib], rows=rows, rootOnly=max(rows) < 13))
    return dict(bvhCandidates=len(pairs), exactCrossings=len(hits), rootOnly=sum(x['rootOnly'] for x in hits), body=sum(not x['rootOnly'] for x in hits), samples=hits[:12])


def audit(obj, head_tree, neck_tree):
    mesh = obj.data
    rows = (len(mesh.vertices)-2)//SIDES
    bm = bmesh.new()
    bm.from_mesh(mesh)
    topology = dict(closed=all(e.is_manifold for e in bm.edges), signedVolume=float(bm.calc_volume(signed=True)))
    bm.free()
    root, body, faces, neck = [], [], [], []
    for vertex in mesh.vertices:
        value = signed_distance(head_tree, vertex.co)
        if vertex.index < 13*SIDES or vertex.index == rows*SIDES:
            root.append(value)
        else:
            body.append(value)
        if vertex.co.z < 2.3:
            neck.append(signed_distance(neck_tree, vertex.co))
    for polygon in mesh.polygons:
        if min(polygon.vertices) < 13*SIDES or rows*SIDES in polygon.vertices:
            continue
        point = np.mean([mesh.vertices[i].co for i in polygon.vertices], axis=0)
        faces.append(signed_distance(head_tree, point))
    return dict(**topology, selfIntersection=proper_crossings(mesh), rootHeadMinimum=min(root), bodyHeadVertexMinimum=min(body), bodyHeadFaceMinimum=min(faces), neckBodyMinimum=min(neck) if neck else None)


def target_controls(obj):
    old = np.asarray(json.loads(obj['guideBlender']), float)
    new = old.copy()
    side = -1 if old[-1, 0] < 0 else 1
    if ' lower fan ' in obj.name:
        number = int(obj.name[-2:])
        # Three overlapping tiers replace the repeated long open crescents.
        tails = {
            1: [[.31,.525,2.49],[.338,.545,2.40],[.325,.527,2.325],[.292,.495,2.335]],
            2: [[.395,.47,2.41],[.415,.475,2.30],[.390,.445,2.225],[.350,.405,2.22]],
            3: [[.455,.41,2.38],[.455,.405,2.25],[.405,.37,2.15],[.345,.335,2.16]],
            4: [[.490,.32,2.33],[.458,.295,2.22],[.395,.245,2.13],[.335,.225,2.145]],
            5: [[.532,.21,2.30],[.495,.175,2.18],[.425,.135,2.085],[.365,.150,2.105]],
            6: [[.425,.10,2.32],[.385,.07,2.225],[.330,.02,2.14],[.285,.035,2.15]],
            7: [[.365,.06,2.31],[.320,.01,2.235],[.280,-.012,2.19],[.252,.005,2.20]],
        }
        tail = np.asarray(tails[number])
        # Finish along the descending body tangent, not back up into a U.
        tail[-1] = tail[-2] + (.38,.34,.34,.35,.35,.35,.33)[number-1]*(tail[-2]-tail[-3])
        if side > 0:
            tail[:,0] *= .93
            tail[:,2] += [.005,-.015,.01,-.006,.006,.012,-.008][number-1]
            tail[:,1] += [0,.008,-.008,.008,-.008,.005,-.005][number-1]
            if number == 7:
                # The jaw-side chord needs body clearance, not vertex-only projection.
                tail[:2,0] += [.050,.030]
        tail[:,0] *= side
        new[3:] = tail
        widths = [1.00,1.05,1.08,1.04,.97,1.07,1.02][number-1]
        depths = [1.00,1.04,1.08,1.07,1.05,1.06,1.04][number-1]
    elif obj.name.endswith('lower body underfold'):
        tail = np.asarray([[.415,.30,2.445],[.355,.215,2.28],[.285,.155,2.175],[.242,.130,2.165]])
        if side > 0:
            tail[:,0] *= .94
            tail[:,2] += .018
        tail[:,0] *= side
        tail[-1] = tail[-2] + .35*(tail[-2]-tail[-3])
        new[2:] = tail
        widths, depths = .92, 1.10
    elif obj.name == 'Nape central curl':
        new[3:] = [[.02,.435,2.29],[-.035,.375,2.205],[-.05425,.354,2.17525]]
        widths, depths = 1.0, 1.05
    else:
        tail = np.asarray([[.190,.425,2.29],[.218,.365,2.20],[.215,.300,2.185]])
        if side > 0:
            tail[:,2] += .018
        tail[:,0] *= side
        tail[-1] = tail[-2] + .35*(tail[-2]-tail[-3])
        new[3:] = tail
        widths, depths = 1.04, 1.06
    return old, new, widths, depths


def deform(obj, head_tree, tile, atlas_size, tile_size):
    mesh = obj.data
    before = np.asarray([v.co for v in mesh.vertices], float)
    old, controls, width_scale, depth_scale = target_controls(obj)
    old_path = bob.catmull(old)
    proposed = bob.catmull(controls)
    assert len(before) == len(old_path)*SIDES+2, obj.name
    t = np.linspace(0,1,len(old_path))
    weight = np.clip((t-.2)/.2,0,1)
    weight = weight*weight*(3-2*weight)
    path = old_path + (proposed-old_path)*weight[:,None]
    old_frames = bob.transported_frames(old_path, obj.get('region') == 'rear bob')
    new_frames = bob.transported_frames(path, obj.get('region') == 'rear bob')
    after = before.copy()
    protection = []
    for row in range(13,len(path)):
        tangent, normal, lateral = old_frames[row]
        nt, nn, nl = new_frames[row]
        body = math.sin(math.pi*t[row])**.6
        tip = np.clip((t[row]-.79)/.21,0,1)
        tip = tip*tip*(3-2*tip)
        tip_width, tip_depth = 1-.32*tip, 1-.35*tip
        for j in range(SIDES):
            index = row*SIDES+j
            offset = before[index]-old_path[row]
            after[index] = path[row]+nt*np.dot(offset,tangent)+nn*np.dot(offset,normal)*(1+(depth_scale-1)*body)*tip_depth+nl*np.dot(offset,lateral)*(1+(width_scale-1)*body)*tip_width
        ring = after[row*SIDES:(row+1)*SIDES]
        # Translate an unsafe cross-section as a whole; do not dent individual faces.
        for attempt in range(6):
            signed = [signed_distance(head_tree,p) for p in ring]
            minimum = min(signed)
            if minimum >= .0015:
                break
            worst = int(np.argmin(signed))
            hit, normal, _, _ = head_tree.find_nearest(Vector(ring[worst]))
            shift = np.asarray(normal)*(.0016-minimum)
            ring += shift
            path[row] += shift
            protection.append(dict(row=row, amount=float(np.linalg.norm(shift))))
        assert min(signed_distance(head_tree,p) for p in ring) >= .00149, obj.name
    after[-1] = np.mean(after[(len(path)-1)*SIDES:len(path)*SIDES],axis=0)
    assert np.array_equal(before[:13*SIDES],after[:13*SIDES]), obj.name
    for vertex, value in zip(mesh.vertices,after):
        vertex.co = value
    mesh.update()
    distance = np.r_[0,np.cumsum(np.linalg.norm(np.diff(path,axis=0),axis=1))]
    distance /= distance[-1]
    atlas = mesh.uv_layers.active
    uv_before = np.asarray([v.uv for v in atlas.data])
    offset = np.asarray(tile)*tile_size
    native_before = (uv_before*atlas_size-offset-8)/(tile_size-16)
    assert native_before.min() > -1e-5 and native_before.max() < 1.00001, obj.name
    native = mesh.uv_layers.new(name='Hair flow native')
    for i, loop in enumerate(mesh.loops):
        vertex = loop.vertex_index
        if vertex < len(path)*SIDES:
            v = distance[vertex//SIDES]
        else:
            v = 0. if vertex == len(path)*SIDES else 1.
        value = np.asarray([native_before[i,0],v])
        native.data[i].uv = value
        atlas.data[i].uv = (offset+8+value*(tile_size-16))/atlas_size
    mesh.uv_layers.active = atlas
    obj['guideBlender'] = json.dumps(path.tolist())
    obj['guideControlRecipe'] = json.dumps(controls.tolist())
    obj['guideMeaning'] = 'Sampled body centerline; actual first 13 cross-sections and root cap preserved'
    obj['nativeFlowUV'] = 'Hair flow native; active UV is the unchanged atlas tile with updated arclength V'
    return dict(name=obj.name, oldControls=old.tolist(), proposedControls=controls.tolist(), rootVerticesFrozen=13*SIDES+1, rootCenterDisplacement=float(np.linalg.norm(path[0]-old_path[0])), maximumVertexDisplacement=float(np.max(np.linalg.norm(after-before,axis=1))), widthScale=width_scale, depthScale=depth_scale, rigidHeadProtection=protection, nativeUVLayer='Hair flow native', atlasTile=tile)


def main():
    output = HERE/'Bob-Cohesive.blend'
    if output.exists():
        raise ValueError('Preserved candidate already exists')
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    names = [o.name for o in scene.objects if o.get('region') == 'rear bob' or o.name.endswith('lower body underfold') or o.name in ('Nape central curl','Nape right interval undercurl','Nape left interval undercurl')]
    assert len(names) == 19, names
    frozen = {o.name:mesh_hash(o) for o in scene.objects if o.type == 'MESH' and o.name not in names}
    head_tree = skull_tree(bpy.data.objects['Head'])
    body = bpy.data.objects['Body']
    neck_tree = BVHTree.FromPolygons([body.matrix_world @ v.co for v in body.data.vertices], [tuple(p.vertices) for p in body.data.polygons])
    before_visibility = scene_visibility()
    before_audit = {name:audit(bpy.data.objects[name],head_tree,neck_tree) for name in names}
    report = json.loads((SOURCE.parent/'paint-report.json').read_text())
    components = {r['name']:r for r in report['components']}
    material = bpy.data.objects[names[0]].active_material
    texture = next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE').image
    atlas_size = texture.size[0]
    tile_size = atlas_size//math.ceil(math.sqrt(len(components)))
    changes = [deform(bpy.data.objects[name],head_tree,components[name]['tile'],atlas_size,tile_size) for name in names]
    after_audit = {name:audit(bpy.data.objects[name],head_tree,neck_tree) for name in names}
    for name in names:
        assert after_audit[name]['closed'] and after_audit[name]['signedVolume']>0, name
    for name,digest in frozen.items():
        assert mesh_hash(bpy.data.objects[name]) == digest, name
    after_visibility = scene_visibility()
    result = dict(source=str(SOURCE),sourceSHA256=source_hash,changedComponents=names,unchangedMeshCount=len(frozen),unchangedMeshHashes=frozen,changes=changes,baselineAudit=before_audit,candidateAudit=after_audit,baselineVisibility=before_visibility,candidateVisibility=after_visibility,rootEmbeddingPolicy='First 13 source rings frozen; signed root embedding is reported separately from body. Inherited self-crossings are reported, not declared valid merely because they are hidden.',intersectionMethod='BVH triangle candidates + finite segment/strict triangle interior test. Coplanar overlap not counted. Cross-component artistic overlap is not classified as self-intersection.',visualApproval=False,animationApproval=False,exported=False)
    (HERE/'geometry-report.json').write_text(json.dumps(result,indent=2)+'\n')
    scene['Bob cohesive source'] = str(SOURCE)
    scene['Bob cohesive edited components'] = json.dumps(names)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash
    print('COHESIVE_CANDIDATE_SAVED',output,flush=True)
    preview_spec=importlib.util.spec_from_file_location('cohesive_preview',BASE/'assembly-study-34/paint-preview/render_preview.py')
    preview=importlib.util.module_from_spec(preview_spec)
    preview_spec.loader.exec_module(preview)
    preview.HERE=HERE
    preview.SOURCE=output
    preview.main()


if __name__=='__main__':
    main()
