"""One continuous head-side return, sculpted from the existing closed Main."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
SOURCE = BASE/'joint-crown-fringe-sculpt-study-01/draft-02/Joint-Sculpt.blend'
MAIN = 'Single broad swept fringe'
spec = importlib.util.spec_from_file_location('return_existing_helpers', BASE/'joint-crown-fringe-sculpt-study-01/build.py')
joint = importlib.util.module_from_spec(spec); spec.loader.exec_module(joint)


def smoothstep(start, end, values):
    t = np.clip((values-start)/(end-start), 0, 1)
    return t*t*(3-2*t)


def barycentric(point, triangle):
    a, b, c = triangle
    x, y, z = b-a, c-a, point-a
    xx, xy, yy = x@x, x@y, y@y
    den = xx*yy-xy*xy
    u = (yy*(z@x)-xy*(z@y))/den
    v = (xx*(z@y)-xy*(z@x))/den
    weights = np.maximum([1-u-v, u, v], 0)
    return weights/sum(weights)


def transfer_native_uv(mesh, source):
    source.calc_loop_triangles()
    triangles = list(source.loop_triangles)
    positions = np.asarray([v.co for v in source.vertices], float)
    before = np.asarray([v.uv for v in source.uv_layers['Hair flow native'].data], float)
    tree = BVHTree.FromPolygons([v.co for v in source.vertices], [tuple(t.vertices) for t in triangles], all_triangles=True)
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    native = mesh.uv_layers.new(name='Hair flow native')
    active = mesh.uv_layers.new(name='Hair flow')
    vertex_uv = []
    for vertex in mesh.vertices:
        point, _, index, _ = tree.find_nearest(vertex.co)
        tri = triangles[index]
        vertex_uv.append(barycentric(np.asarray(point),positions[list(tri.vertices)]) @ before[list(tri.loops)])
    for face in mesh.polygons:
        centre = np.mean([mesh.vertices[i].co for i in face.vertices],axis=0)
        hit, _, index, _ = tree.find_nearest(Vector(centre))
        tri = triangles[index]
        centre_uv = barycentric(np.asarray(hit),positions[list(tri.vertices)]) @ before[list(tri.loops)]
        face.use_smooth = True
        for loop in face.loop_indices:
            value = vertex_uv[mesh.loops[loop].vertex_index].copy()
            if abs(value[0]-centre_uv[0]) > .5:
                value[0] = 0 if centre_uv[0] < .5 else 1
            native.data[loop].uv = value; active.data[loop].uv = value
    mesh.uv_layers.active = active; active.active_render = True
    if '_D1_STRAND_T' in mesh.attributes:
        mesh.attributes.remove(mesh.attributes['_D1_STRAND_T'])
    progress = mesh.attributes.new('_D1_STRAND_T','FLOAT','POINT')
    for datum, value in zip(progress.data,np.asarray(vertex_uv)[:,1]):
        datum.value = float(value)
    return np.asarray(vertex_uv)


def scalp_return(obj, head):
    mesh = obj.data
    before = np.asarray([v.co for v in mesh.vertices],float)
    normals = np.asarray([v.normal for v in mesh.vertices],float)
    progress = np.asarray([d.value for d in mesh.attributes['_D1_STRAND_T'].data])
    u_sum = np.zeros(len(before)); u_count = np.zeros(len(before))
    for loop, uv in zip(mesh.loops,mesh.uv_layers['Hair flow native'].data):
        u_sum[loop.vertex_index] += math.sin(uv.uv.x*math.tau)
        u_count[loop.vertex_index] += 1
    sine = u_sum/u_count
    weight_t = smoothstep(.025,.065,progress)*(1-smoothstep(.25,.35,progress))
    after = before.copy(); changes = []
    for index in np.flatnonzero((weight_t>0) & (sine<-.08)):
        point = before[index]
        skin, normal = head.find_nearest(Vector(point))[:2]
        skin = np.asarray(skin,float); normal = np.asarray(normal,float)
        distance = float(np.dot(point-skin,normal))
        alignment = -float(np.dot(normals[index],normal))
        weight = float(weight_t[index]*smoothstep(.04,.50,alignment))
        if weight == 0 or distance <= .004:
            continue
        target = skin+normal*.004
        after[index] = point+(target-point)*weight
        changes.append(dict(vertex=int(index),uvV=float(progress[index]),sineU=float(sine[index]),
                            headwardAlignment=alignment,weight=weight,before=point.tolist(),after=after[index].tolist(),
                            headDistanceBefore=distance,displacement=(after[index]-point).tolist()))
    for vertex, coordinate in zip(mesh.vertices,after):
        vertex.co = coordinate
    mesh.update()
    untouched = weight_t == 0
    assert np.array_equal(after[untouched],before[untouched])
    obj['returnSculpt'] = 'Same solid head-side half expands down to actual nearest Head +.004, root/tip and outer face unchanged before final fine remesh'
    return before,after,changes


def remesh(obj):
    source = obj.data.copy()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new('Unify continuous rooted return','REMESH')
    modifier.mode='VOXEL'; modifier.voxel_size=.0025; modifier.adaptivity=0; modifier.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    smooth = obj.modifiers.new('Round remeshed return','SMOOTH'); smooth.factor=.16; smooth.iterations=2
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    bm=bmesh.new(); bm.from_mesh(obj.data); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bm.calc_volume(signed=True)<0:
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data); bm.free(); obj.data.update()
    remove_voxel_debris(obj.data)
    uv = transfer_native_uv(obj.data,source)
    obj['rootContactVertexIndices'] = np.flatnonzero((uv[:,1]<=.045) & (np.sin(uv[:,0]*math.tau)<-.25)).tolist()
    obj['strandTopology'] = 'authored-guide'
    obj['nativeUV'] = 'Native angular U and actual guide arclength V transferred from the sculpted same solid; periodic seam per face'
    bpy.data.meshes.remove(source)


def remove_voxel_debris(mesh):
    bm=bmesh.new(); bm.from_mesh(mesh)
    unseen=set(bm.verts); islands=[]
    while unseen:
        start=unseen.pop(); queue=[start]; group=[start]
        while queue:
            for edge in queue.pop().link_edges:
                for other in edge.verts:
                    if other in unseen:
                        unseen.remove(other); queue.append(other); group.append(other)
        islands.append(group)
    islands.sort(key=len,reverse=True)
    assert all(len(group)<=8 for group in islands[1:]),'Another substantial solid cannot be silently removed'
    removed=sum(len(group) for group in islands[1:])
    if removed:
        bmesh.ops.delete(bm,geom=[v for group in islands[1:] for v in group],context='VERTS')
    bm.to_mesh(mesh); bm.free(); mesh.update()
    return removed


def components(mesh):
    adjacent=[[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a,b=edge.vertices; adjacent[a].append(b); adjacent[b].append(a)
    unseen=set(range(len(mesh.vertices))); counts=[]
    while unseen:
        start=unseen.pop(); queue=[start]; size=1
        while queue:
            for neighbour in adjacent[queue.pop()]:
                if neighbour in unseen:
                    unseen.remove(neighbour); queue.append(neighbour); size+=1
        counts.append(size)
    return sorted(counts,reverse=True)


def main():
    out=HERE/'draft-01'; out.mkdir(exist_ok=False)
    source_sha=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE)); scene=bpy.context.scene
    frozen={o.name:joint.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o.name!=MAIN}
    obj=bpy.data.objects[MAIN]; guide_before=str(obj['guideBlender']); matrix_before=obj.matrix_world.copy()
    head=joint.skull_tree(bpy.data.objects['Head'])
    before,sculpted,changes=scalp_return(obj,head)
    remesh(obj)
    assert str(obj['guideBlender'])==guide_before
    assert np.array_equal(np.asarray(obj.matrix_world),np.asarray(matrix_before))
    for name,digest in frozen.items():
        assert joint.mesh_hash(bpy.data.objects[name])==digest,name
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_sha
    recipe=dict(rootContactVertexIndices=list(obj['rootContactVertexIndices']),method=obj['returnSculpt'])
    check=joint.inspect(obj,head,recipe)
    check['connectedComponentVertexCounts']=components(obj.data)
    layers={l.name:np.asarray([v.uv for v in l.data]) for l in obj.data.uv_layers}
    assert all(np.isfinite(v).all() and v.min()>=0 and v.max()<=1 for v in layers.values())
    displacement=sculpted-before
    report=dict(source=str(SOURCE),sourceSHA256=source_sha,changedObjects=[MAIN],other52MeshHashes=frozen,
                guideBlenderExactlyFrozen=True,objectMatrixExactlyFrozen=True,changes=changes,
                changedAuthorVertices=len(changes),uvVChangeRange=[min(c['uvV'] for c in changes),max(c['uvV'] for c in changes)],
                sculptDisplacementMax=float(np.linalg.norm(displacement,axis=1).max()),
                sourceLowerUVvGE035AndOuterHalfUnchangedBeforeRemesh=True,
                voxelSize=.0025,structure=check,
                UVRanges={name:[uv.min(axis=0).tolist(),uv.max(axis=0).tolist()] for name,uv in layers.items()},
                completeSceneSafetyNotClaimed='Frozen source Left crown has its own pre-existing root self-intersections; this checks changed Main only',
                artisticApproval=False,published=False,sharedExporterChanged=False)
    (out/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
    (out/'build.py').write_text(Path(__file__).read_text())
    text=bpy.data.texts.new('Continuous Main return recipe.py'); text.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Main-Return.blend'))
    print('MAIN_RETURN_READY',out,'crossings',check['selfIntersection']['exactCrossings'],flush=True)
    grey=bpy.data.materials.new('Main return clay'); grey.use_nodes=True
    bsdf=grey.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value=(.42,.42,.42,1)
    bsdf.inputs['Roughness'].default_value=.76
    for name in json.loads(scene['Hair components']):
        item=bpy.data.objects[name]; item.data.materials.clear(); item.data.materials.append(grey)
    centre=Vector((0,.015,2.64)); scene.camera.data.ortho_scale=1.5
    scene.render.resolution_x=scene.render.resolution_y=768
    scene.cycles.samples=24; scene.cycles.use_denoising=True
    for view,axis in [('front',(0,-1,0)),('right',(-1,0,0)),('three-quarter',(-1,-1,0))]:
        scene.camera.location=centre+Vector(axis)*4
        scene.camera.rotation_euler=(centre-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/(view+'.png')); bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Main-Return-Clay.blend'))
    print('MAIN_RETURN_COMPLETE',out,flush=True)


if __name__=='__main__':
    main()
