"""One closed main lock from the re-read front band and registered side contour."""
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
SOURCE = BASE/'main-side-return-study-02/draft-05/Side-Return-Context.blend'
NAME = 'Single broad swept fringe'
sys.dont_write_bytecode = True
sys.path.insert(0, str(BASE))
from build import skull_tree


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


prior = module('long_arc_helpers', BASE/'main-fringe-long-arc-study-01/build.py')
envelope_helpers = module('envelope_helpers', BASE/'main-fringe-envelope-study-01/build.py')


def rigid_ring_clearance(verts, faces, centres, head, sides):
    source = np.asarray(verts,dtype=float)
    rows = len(centres)
    directions = centres.copy()
    directions[:,1] -= .035
    directions[:,2] = 0
    directions /= np.linalg.norm(directions,axis=1)[:,None]
    rings = source[:rows*sides].reshape(rows,sides,3)
    target = .004001
    def minimum_clearance(points):
        values=[]
        for point in points:
            skin,normal=head.find_nearest(Vector(point))[:2]
            values.append(float((Vector(point)-skin).dot(normal)))
        return min(values)
    required=np.zeros(rows)
    for row in range(rows):
        if minimum_clearance(rings[row])>target:
            continue
        low,high=0.,.001
        while minimum_clearance(rings[row]+directions[row]*high)<=target:
            high *= 2
            if high>.25:
                raise ValueError(f'Head clearance cannot be reached locally for ring {row}')
        for _ in range(24):
            middle=(low+high)/2
            if minimum_clearance(rings[row]+directions[row]*middle)>target:
                high=middle
            else:
                low=middle
        required[row]=high
    # Every local maximum contributing to the convolution includes this row,
    # so the smooth upper envelope cannot dip below its required translation.
    padded=np.pad(required,(3,3),mode='edge')
    envelope=np.asarray([max(padded[row:row+7]) for row in range(rows)])
    kernel=np.asarray([1,6,15,20,15,6,1],dtype=float)/64
    shifts=np.convolve(np.pad(envelope,(3,3),mode='edge'),kernel,mode='valid')
    assert np.all(shifts+1e-12>=required)
    def translated_points(amounts):
        result=source.copy()
        result[:rows*sides]=(rings+directions[:,None,:]*amounts[:,None,None]).reshape(-1,3)
        result[rows*sides]=source[rows*sides]+directions[0]*amounts[0]
        result[rows*sides+1]=source[rows*sides+1]+directions[-1]*amounts[-1]
        return result
    corrected=translated_points(shifts)
    face_centres=np.asarray([corrected[list(face)].mean(axis=0) for face in faces])
    margin=0.
    if min(minimum_clearance(corrected),minimum_clearance(face_centres))<=.004:
        margin=.001
        shifts=np.where(shifts>0,shifts+margin,0)
        corrected=translated_points(shifts)
    actual_rings=corrected[:rows*sides].reshape(rows,sides,3)
    relative_error=float(np.max(np.abs((actual_rings-actual_rings[:,0:1])-(rings-rings[:,0:1]))))
    assert relative_error<1e-12
    assert np.array_equal(corrected[:,2],source[:,2])
    records=[]
    for row in range(rows):
        delta=directions[row]*shifts[row]
        records.append(dict(row=row,requiredShift=float(required[row]),shift=float(shifts[row]),
                            direction=directions[row].tolist(),translation=delta.tolist(),
                            sourceCentre=centres[row].tolist(),afterCentre=actual_rings[row].mean(axis=0).tolist()))
    adjustments=[]
    for index,(before,after) in enumerate(zip(source,corrected)):
        if np.array_equal(before,after):
            continue
        adjustments.append(dict(vertex=index,row=min(index//sides,rows-1),before=before.tolist(),
                                after=after.tolist(),displacement=(after-before).tolist()))
    return corrected,adjustments,dict(method='Whole rigid horizontal ellipse, X/Y radial translation relative to (0,.035); minimum binary search then local-max convolution upper envelope',
                                     targetVertexClearance=target,addedUniformMargin=margin,
                                     relativeCoordinateErrorMax=relative_error,allVertexZExactlyUnchanged=True,
                                     ringAdjustments=records)


def make_main(material, head):
    front = json.loads((BASE/'main-fringe-long-arc-study-01/front-review.json').read_text())
    side = json.loads((BASE/'main-fringe-long-arc-study-01/reference-review.json').read_text())['visibleSideMainLock']
    side_contour = np.asarray(side['visibleShoulderConnector']['points'] + side['boundaryB']['points'][1:] + side['boundaryA']['points'][-2::-1], dtype=float)
    a = np.asarray(front['visibleBoundaryA']['points'], dtype=float)
    b = np.asarray(front['visibleBoundaryB']['points'][2:], dtype=float)
    # The upper arch is covered differently in each view. It has broad volume,
    # while its actual scalp contact is on the upper rear surface, not this apex.
    upper = np.asarray([[19,173.8,174.2],[20,161,187],[22,147,200],
                        [27,140,207],[35,131,207],[43,131,198],[48,125,178]], dtype=float)
    raw = []
    front_vs = np.arange(19.,161.)
    for front_v in front_vs:
        if front_v < 48:
            xmin_u = np.interp(front_v,upper[:,0],upper[:,1])
            xmax_u = np.interp(front_v,upper[:,0],upper[:,2])
        else:
            xmin_u = np.interp(front_v,a[:,1],a[:,0])
            xmax_u = np.interp(front_v,b[:,1],b[:,0])
        if front_v < 20:
            side_min,side_max = 263.8,264.2
        else:
            side_min,side_max = envelope_helpers.horizontal_bounds(side_contour,front_v+7)
        xmin,xmax = (xmin_u-187)/256.25,(xmax_u-187)/256.25
        ymin,ymax = .09-(side_max-152)/256.25,.09-(side_min-152)/256.25
        # A visible seam against the crown is not the hidden rear boundary.
        # Broaden this return under the crown without moving the forward side.
        rear_extension = np.interp(front_v,[19,20,24,32,43,50,60,68,160],
                                    [.020,.035,.095,.145,.145,.110,.045,0,0])
        raw.append([xmin,xmax,ymin,ymax+rear_extension])
    raw = np.asarray(raw)
    kernel = np.asarray([1,2,3,2,1],dtype=float)/9
    bounds = np.column_stack([np.convolve(np.pad(raw[:,i],(2,2),mode='edge'),kernel,mode='valid') for i in range(4)])
    prior_bounds = bounds.copy()
    rounded = bounds.copy()
    shoulder_kernel = np.asarray([1,4,6,4,1],dtype=float)/16
    for _ in range(4):
        rounded = np.column_stack([np.convolve(np.pad(rounded[:,i],(2,2),mode='edge'),shoulder_kernel,mode='valid') for i in range(4)])
    shoulder_weight = np.maximum(0,1-np.arange(len(bounds))/20)[:,None]
    bounds += np.clip(rounded-bounds,-3/256.25,3/256.25)*shoulder_weight
    rows,sides = len(bounds),64
    centres = np.column_stack([(bounds[:,0]+bounds[:,1])/2,(bounds[:,2]+bounds[:,3])/2,
                               2.4453+(179-front_vs)/256.25])
    radii = np.column_stack([np.maximum((bounds[:,1]-bounds[:,0])/2,.0008),
                             np.maximum((bounds[:,3]-bounds[:,2])/2,.0008)])
    length = np.r_[0,np.cumsum(np.linalg.norm(np.diff(centres,axis=0),axis=1))]
    progress = length/length[-1]
    verts,faces = [],[]
    rho = .90
    transverse = math.sqrt(1-rho*rho)
    for row,(centre,radius) in enumerate(zip(centres,radii)):
        for col in range(sides):
            angle = math.tau*col/sides
            verts.append(centre+[math.cos(angle)*radius[0],
                                 radius[1]*(-rho*math.cos(angle)+transverse*math.sin(angle)),0])
        if row:
            for col in range(sides):
                aindex=(row-1)*sides+col;bindex=(row-1)*sides+(col+1)%sides
                faces.append((aindex,bindex,bindex+sides,aindex+sides))
    for row in (0,rows-1):
        centre_index=len(verts);verts.append(centres[row])
        for col in range(sides):
            aindex=row*sides+col;bindex=row*sides+(col+1)%sides
            faces.append((centre_index,bindex,aindex) if row==0 else (centre_index,aindex,bindex))
    verts,clearance_adjustments,ring_clearance = rigid_ring_clearance(verts,faces,centres,head,sides)
    actual_guides = np.asarray(verts[:rows*sides]).reshape(rows,sides,3).mean(axis=1)
    mesh=bpy.data.meshes.new('Corrected front and side broad closed fringe')
    mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free()
    uv=mesh.uv_layers.new(name='Hair flow')
    for polygon in mesh.polygons:
        polygon.use_smooth=True
        seam=any(i<rows*sides and i%sides==sides-1 for i in polygon.vertices)
        for loop in polygon.loop_indices:
            index=mesh.loops[loop].vertex_index
            if index>=rows*sides:
                uv.data[loop].uv=(.5,0 if index==rows*sides else 1)
            else:
                row,col=divmod(index,sides)
                uv.data[loop].uv=(1 if seam and col==0 else col/sides,progress[row])
    obj=bpy.data.objects.new(NAME,mesh);bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj['sectionSize']=sides;obj['region']='fringe';obj['flowProfile']='cosine'
    obj['guideBlender']=json.dumps(actual_guides.tolist())
    obj['nativeUV']='u=ellipse parameter angle/64, seam0/1; negative correlation rho.90; v=centre guide arclength0..1; caps v0/v1'
    sections=[]
    for row,(front_v,centre,radius) in enumerate(zip(front_vs,centres,radii)):
        sections.append(dict(row=row,frontV=float(front_v),sideV=float(front_v+7),centre=actual_guides[row].tolist(),generatedEllipseCentre=centre.tolist(),
                             radius=radius.tolist(),frontUBounds=[187+256.25*(centre[0]-radius[0]),187+256.25*(centre[0]+radius[0])],
                             sideUBounds=[152+256.25*(.09-centre[1]-radius[1]),152+256.25*(.09-centre[1]+radius[1])]))
    shoulder_adjustment = float(np.max(np.abs(bounds-prior_bounds))*256.25)
    assert np.array_equal(np.asarray([v.co.z for v in mesh.vertices],dtype=np.float32),np.asarray(verts[:,2],dtype=np.float32))
    return obj,sections,clearance_adjustments,shoulder_adjustment,ring_clearance


def exposed_negative_faces(obj, points, negative_faces):
    # Exclude Head from the occluders: a face hidden only because it is inside
    # skin must not be called a safe hidden return surface.
    occluders=[]
    for other in bpy.context.scene.objects:
        if other.type!='MESH' or other.hide_render or other.name in {'Head','Body','Outfit','Shoe.L','Shoe.R'}:
            continue
        vertices=[other.matrix_world@v.co for v in other.data.vertices]
        occluders.append((other.name,BVHTree.FromPolygons(vertices,[tuple(f.vertices) for f in other.data.polygons])))
    views={'front':Vector((0,-1,0)),'right':Vector((-1,0,0)),'three-quarter':Vector((-1,-1,0)).normalized()}
    visible=[];hidden={}
    for index in negative_faces:
        face=obj.data.polygons[index];point=Vector(points[list(face.vertices)].mean(axis=0))
        for view,axis in views.items():
            if face.normal.dot(axis)<=0:continue
            origin=point+axis*4
            hits=[]
            for name,tree in occluders:
                hit,normal,polygon,distance=tree.ray_cast(origin,-axis,4.01)
                if hit is not None:hits.append((distance,name,polygon))
            if not hits:raise ValueError(f'No hair ray hit at face {index}')
            distance,name,polygon=min(hits)
            if name==obj.name and (polygon==index or abs(distance-4)<.0005):
                visible.append(dict(face=index,view=view,row=min(face.vertices)//64,point=list(point)))
            else:hidden[name]=hidden.get(name,0)+1
    return visible,hidden


def main():
    output=HERE/'draft-04'
    if output.exists():raise ValueError(f'Preserved candidate exists: {output}')
    output.mkdir()
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
    old=bpy.data.objects[NAME];material=old.active_material
    frozen={o.name:prior.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o!=old}
    head=skull_tree(bpy.data.objects['Head'])
    bpy.data.objects.remove(old,do_unlink=True)
    obj,sections,adjustments,shoulder_delta,ring_clearance=make_main(material,head)
    points=np.asarray([v.co for v in obj.data.vertices],dtype=float)
    distances=[];negative_vertices=[];negative_faces=[];face_distances=[]
    for index,p in enumerate(points):
        q,n=head.find_nearest(Vector(p))[:2];d=float((Vector(p)-q).dot(n));distances.append(d)
        if d<0:negative_vertices.append(index)
    for face in obj.data.polygons:
        point=points[list(face.vertices)].mean(axis=0)
        q,n=head.find_nearest(Vector(point))[:2];d=float((Vector(point)-q).dot(n));face_distances.append(d)
        if d<0:negative_faces.append(face.index)
    visible,hidden=exposed_negative_faces(obj,points,negative_faces)
    bm=bmesh.new();bm.from_mesh(obj.data)
    closed=all(e.is_manifold for e in bm.edges);volume=float(bm.calc_volume(signed=True));bm.free()
    crossings=prior.exact_crossings(obj.data)
    deltas = np.asarray([r['displacement'] for r in adjustments],dtype=float)
    report=dict(source=str(SOURCE),sourceSHA256=source_hash,construction='Negative-correlated closed ellipses; upper rows0..20 bounded smoothing; only whole-ring horizontal radial translations to clear Head, no point projection',
                ellipseCorrelation=-.90,skinClearanceTarget=.004,
                **ring_clearance,
                localHeadAdjustedVertices=len(adjustments),localHeadAdjustedRows=sorted(set(r['row'] for r in adjustments)),
                localHeadDisplacementMaximum=float(np.max(np.linalg.norm(deltas,axis=1))) if len(adjustments) else 0,
                localHeadMaxFrontProjectionPx=(np.max(np.abs(deltas[:,[0,2]]),axis=0)*256.25).tolist() if len(adjustments) else [0,0],
                localHeadMaxSideProjectionPx=(np.max(np.abs(deltas[:,[1,2]]),axis=0)*256.25).tolist() if len(adjustments) else [0,0],
                upperShoulderBoundarySmoothingMaxPx=shoulder_delta,guideUpdate='Mean of each corrected mesh ring; original flow UV retained',
                hiddenUpperRearExtensionControls=[[19,.020],[20,.035],[24,.095],[32,.145],[43,.145],[50,.110],[60,.045],[68,0]],
                rows=len(sections),sectionSize=64,vertices=len(points),faces=len(obj.data.polygons),nativeUV=obj['nativeUV'],
                closed=closed,signedVolume=volume,**crossings,sections=sections,
                headVertexClearanceMin=min(distances),headFaceClearanceMin=min(face_distances),
                negativeHeadVertexCount=len(negative_vertices),negativeHeadFaceCount=len(negative_faces),
                negativeVertexRows=sorted(set(min(i//64,len(sections)-1) for i in negative_vertices)),
                negativeFaceRows=sorted(set(min(obj.data.polygons[i].vertices)//64 for i in negative_faces)),
                exposedNegativeFaceViewCount=len(visible),exposedNegativeFaceSamples=visible[:24],hiddenNegativeFaceViewCounts=hidden,
                bounds=[points.min(axis=0).tolist(),points.max(axis=0).tolist()],otherMeshesExactlyFrozen=frozen,
                referenceTolerancePx=4,visualApproval=False,productionReady=False)
    report['geometryConstructionPass']=closed and volume>0 and crossings['exactCrossingPairs']==0
    report['visibleHeadSafetyPass']=not visible
    report['headClearancePass']=min(distances)>.004 and min(face_distances)>.004
    for name,digest in frozen.items():assert prior.mesh_hash(bpy.data.objects[name])==digest,name
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
    (output/'build.py').write_text(Path(__file__).read_text())
    (output/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
    (output/'vertex-adjustments.json').write_text(json.dumps(adjustments,indent=2)+'\n')
    (output/'ring-adjustments.json').write_text(json.dumps(ring_clearance,indent=2)+'\n')
    text=bpy.data.texts.new('Corrected main fringe recipe.py');text.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'Single-Lock.blend'))
    print('CORRECTED_BLEND_READY',output,json.dumps({k:v for k,v in report.items() if k not in {'sections','otherMeshesExactlyFrozen','exposedNegativeFaceSamples','ringAdjustments'}}),flush=True)
    centre=Vector((0,.015,2.64));scene.camera.data.ortho_scale=1.5
    scene.render.resolution_x=scene.render.resolution_y=768
    scene.cycles.samples=24;scene.cycles.use_denoising=True
    for view,axis in {'front':(0,-1,0),'right':(-1,0,0),'three-quarter':(-1,-1,0)}.items():
        scene.camera.location=centre+Vector(axis)*4
        scene.camera.rotation_euler=(centre-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(output/f'context-{view}.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'Corrected-Context.blend'))
    print('CORRECTED_RENDER_COMPLETE',output,flush=True)
    if not report['geometryConstructionPass'] or not report['visibleHeadSafetyPass'] or not report['headClearancePass']:
        raise ValueError('One corrected candidate preserved with geometry or exposed Head failures')


if __name__=='__main__':main()
