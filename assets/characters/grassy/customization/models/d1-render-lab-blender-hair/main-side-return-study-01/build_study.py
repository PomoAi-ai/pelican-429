"""Wrap only the hidden return of the registered fringe around the real left temple."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

STAGE = Path(__file__).resolve().parent
BASE = STAGE.parent
SOURCE = BASE/'main-fringe-sweep-study-11/Single-Lock.blend'
CONTEXT = BASE/'assembly-study-34/D1-Hair-Assembly.blend'
NAMES = ['Single broad swept fringe','Inner long fringe','Inner short fringe','Right swept fringe']
sys.dont_write_bytecode = True
sys.path.insert(0,str(BASE))
from build import skull_tree
from export_assembly import strand_data,world_points
from single_lock import smooth_controls


def smooth(t):
    t = float(np.clip(t,0,1))
    return t*t*(3-2*t)


def mesh_hash(obj):
    digest = hashlib.sha256()
    digest.update(np.asarray(obj.matrix_world,dtype=np.float64).tobytes())
    digest.update(np.asarray([vertex.co for vertex in obj.data.vertices],dtype=np.float64).tobytes())
    digest.update(np.asarray([vertex for face in obj.data.polygons for vertex in face.vertices],dtype=np.int32).tobytes())
    for layer in obj.data.uv_layers:
        digest.update(np.asarray([loop.uv for loop in layer.data],dtype=np.float64).tobytes())
    return digest.hexdigest()


def section_hit(tree,theta,z):
    direction = Vector((math.sin(theta),-math.cos(theta),0))
    origin = Vector((0,.035,z))
    hit = tree.ray_cast(origin+direction*2,-direction,3)[0]
    return None if hit is None else np.asarray(hit,dtype=float)


def wrap_return(obj,tree):
    before = np.asarray([vertex.co for vertex in obj.data.vertices],dtype=float)
    rings = before.reshape((-1,64,3));after = rings.copy()
    side_controls = np.asarray([(267,28),(239,42),(222,75),(201,110),(186,142),(172,168)],dtype=float)
    side = np.asarray([smooth_controls(side_controls,t) for t in np.linspace(0,1,500)])
    changed = []
    for row in range(len(rings)):
        along = smooth((row-24)/32)*smooth((155-row)/28)
        if along == 0:
            continue
        for col in range(43,64):
            across = smooth((col-42)/10)*smooth((64-col)/8)
            weight = along*across
            point = rings[row,col]
            theta = math.atan2(point[0],-(point[1]-.035))
            old_skin = section_hit(tree,theta,point[2])
            if old_skin is None:
                continue
            side_v = 186+(2.4453-point[2])*256.25
            side_u = float(np.interp(side_v,side[:,1],side[:,0]))
            target_y = .09-(side_u-152)/256.25
            target_angles = np.linspace(math.radians(-108),math.radians(-15),64)
            samples = [(angle,section_hit(tree,angle,point[2])) for angle in target_angles]
            samples = [(angle,skin) for angle,skin in samples if skin is not None]
            target_theta = float(np.interp(target_y,[skin[1] for angle,skin in samples][::-1],
                                          [angle for angle,skin in samples][::-1]))
            wrapped_theta = theta+(target_theta-theta)*weight
            skin = section_hit(tree,wrapped_theta,point[2])
            direction = np.asarray([math.sin(wrapped_theta),-math.cos(wrapped_theta),0.])
            old_radius = float(np.linalg.norm(point[:2]-[0,.035]))
            old_skin_radius = float(np.linalg.norm(old_skin[:2]-[0,.035]))
            clearance = (old_radius-old_skin_radius)*(1-weight)+.012*weight
            after[row,col] = skin+direction*clearance
            after[row,col,2] = point[2]
            changed.append(row*64+col)
    for vertex,point in zip(obj.data.vertices,after.reshape((-1,3))):
        vertex.co = point
    obj.data.update()
    actual = np.asarray([vertex.co for vertex in obj.data.vertices],dtype=float).reshape(rings.shape)
    assert np.array_equal(actual[:,:33],rings[:,:33]), 'Visible frontal surface changed'
    assert np.array_equal(actual[:,:,2],rings[:,:,2]), 'Longitudinal reference coordinates changed'
    fixed = np.ones(len(before),dtype=bool);fixed[changed] = False
    assert np.array_equal(actual.reshape((-1,3))[fixed],before[fixed]), 'Unselected fringe points changed'
    guides = np.asarray(json.loads(obj['guideBlender']),dtype=float)
    guides[:] = actual.mean(axis=1)
    obj['guideBlender'] = json.dumps(guides.tolist())
    return before,actual.reshape((-1,3)),changed


def scene_tree(scene):
    points,faces,owners = [],[],[]
    for obj in scene.objects:
        if obj.type != 'MESH' or obj.hide_render:
            continue
        offset = len(points);points.extend(world_points(obj))
        faces.extend(tuple(offset+vertex for vertex in face.vertices) for face in obj.data.polygons)
        owners.extend([obj.name]*len(obj.data.polygons))
    return BVHTree.FromPolygons(points,faces),owners


def frontal_probe(scene,bounds):
    tree,owners = scene_tree(scene)
    result = []
    for py in range(bounds[1],bounds[3]+1):
        for px in range(bounds[0],bounds[2]+1):
            origin = Vector(((px+.5-384)/512,-4,2.64+(384-py-.5)/512))
            point,normal,index,distance = tree.ray_cast(origin,Vector((0,1,0)),10)
            result.append(None if point is None else owners[index])
    return result


def render(scene,prefix):
    centre = Vector((0,.015,2.64));camera = scene.camera
    camera.data.type = 'ORTHO';camera.data.ortho_scale = 1.5
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.cycles.samples = 24;scene.cycles.use_denoising = True
    for view,axis in {'front':(0,-1,0),'right':(-1,0,0),'three-quarter':(-1,-1,0)}.items():
        camera.location = centre+Vector(axis)*4
        camera.rotation_euler = (centre-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(STAGE/f'{prefix}-{view}.png')
        bpy.ops.render.render(write_still=True)


def main():
    if (STAGE/'Single-Lock.blend').exists():
        raise ValueError(f'Preserved candidate exists: {STAGE}')
    sources = {str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in (SOURCE,CONTEXT)}
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene = bpy.context.scene
    obj = bpy.data.objects[NAMES[0]]
    protected = {name:mesh_hash(bpy.data.objects[name]) for name in ['Head',*NAMES[1:]]}
    uv_before = np.asarray([loop.uv for loop in obj.data.uv_layers.active.data])
    faces_before = [tuple(face.vertices) for face in obj.data.polygons]
    tree = skull_tree(bpy.data.objects['Head'])
    before,after,changed = wrap_return(obj,tree)
    assert faces_before == [tuple(face.vertices) for face in obj.data.polygons]
    assert np.array_equal(uv_before,np.asarray([loop.uv for loop in obj.data.uv_layers.active.data]))
    for name,digest in protected.items():
        assert mesh_hash(bpy.data.objects[name]) == digest, f'Protected mesh changed: {name}'
    bm = bmesh.new();bm.from_mesh(obj.data)
    closed = all(edge.is_manifold for edge in bm.edges)
    volume = float(bm.calc_volume(signed=True));bm.free()
    vertex_distances,face_distances = [],[]
    for point in after:
        skin,normal = tree.find_nearest(Vector(point))[:2]
        vertex_distances.append(float((Vector(point)-skin).dot(normal)))
    for face in obj.data.polygons:
        point = after[list(face.vertices)].mean(axis=0)
        skin,normal = tree.find_nearest(Vector(point))[:2]
        face_distances.append(float((Vector(point)-skin).dot(normal)))
    _,strand_t,flow,guides = strand_data(obj,world_points(obj),uv_before,0)
    assert len(guides) == 1 and np.isfinite(flow).all()
    report = dict(source='main-fringe-sweep-study-11',context='assembly-study-34',
                  changedVertices=len(changed),rows=[min(changed)//64,max(changed)//64],
                  columns=sorted({index%64 for index in changed}),frontColumns0To32ExactlyFrozen=True,
                  allZExactlyFrozen=True,rootAndTipExactlyFrozen=True,UVExactlyFrozen=True,topologyExactlyFrozen=True,
                  closed=closed,signedVolume=volume,headVertexClearanceMin=min(vertex_distances),
                  headFaceClearanceMin=min(face_distances),maxLocalDisplacement=float(np.linalg.norm(after-before,axis=1).max()),
                  innerReturnRadialClearance=.012,otherThreeAndHeadFrozen=protected,sourceBlendsFrozen=sources,
                  exportedGuideCount=len(guides),strandTFinite=bool(np.isfinite(strand_t).all()),visualApproval=False)
    report['geometricChecksPass'] = closed and volume>0 and min(vertex_distances)>0 and min(face_distances)>0
    text = bpy.data.texts.new('Hidden temple return recipe.py');text.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(STAGE/'Single-Lock.blend'))
    print('SIDE_RETURN_BLEND_READY',STAGE,flush=True)
    names = [name for name in json.loads((CONTEXT.parent/'report.json').read_text())['components'] if name not in NAMES]
    with bpy.data.libraries.load(str(CONTEXT)) as (source,target):
        target.objects = list(names)
    for other in target.objects:
        scene.collection.objects.link(other);other.hide_render = False
    context_hashes = {name:mesh_hash(bpy.data.objects[name]) for name in names}
    scene['Hair components'] = json.dumps([*NAMES,*names])
    bounds_points = np.vstack([before[changed],after[changed]])
    bounds = [max(0,int(np.floor(bounds_points[:,0].min()*512+384))-3),
              max(0,int(np.floor(384-(bounds_points[:,2].max()-2.64)*512))-3),
              min(767,int(np.ceil(bounds_points[:,0].max()*512+384))+3),
              min(767,int(np.ceil(384-(bounds_points[:,2].min()-2.64)*512))+3)]
    for vertex,point in zip(obj.data.vertices,before):vertex.co = point
    obj.data.update();old_probe = frontal_probe(scene,bounds)
    render(scene,'before')
    for vertex,point in zip(obj.data.vertices,after):vertex.co = point
    obj.data.update();new_probe = frontal_probe(scene,bounds)
    old_main = np.asarray([owner == NAMES[0] for owner in old_probe])
    new_main = np.asarray([owner == NAMES[0] for owner in new_probe])
    report['frontalProbeBounds'] = bounds
    report['frontFirstHitOwnerChanges'] = sum(old != new for old,new in zip(old_probe,new_probe))
    report['frontVisibleMainAddedPixels'] = int(np.count_nonzero(new_main & ~old_main))
    report['frontVisibleMainLostPixels'] = int(np.count_nonzero(old_main & ~new_main))
    report['frontHairSilhouetteChanges'] = sum((old is None) != (new is None) for old,new in zip(old_probe,new_probe))
    bpy.ops.wm.save_as_mainfile(filepath=str(STAGE/'Side-Return-Context.blend'))
    render(scene,'context')
    for name,digest in context_hashes.items():
        assert mesh_hash(bpy.data.objects[name]) == digest, f'Context component changed: {name}'
    for path,digest in sources.items():
        assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest
    report['allContextComponentsExactlyFrozen'] = True
    (STAGE/'model-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('SIDE_RETURN_COMPLETE',json.dumps(report),flush=True)
    if not report['geometricChecksPass']:
        raise ValueError('Preserved candidate failed geometric checks; see model-report.json')


if __name__ == '__main__':
    main()
