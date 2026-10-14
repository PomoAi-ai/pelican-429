"""One explained correction: C1 support, soft ear limit and paired strip caps."""
import importlib.util
import json
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('first_surface_bob',HERE/'build.py')
study=importlib.util.module_from_spec(spec);spec.loader.exec_module(study)
BASE=study.BASE
spec2=importlib.util.spec_from_file_location('bob_c1_previous_components',BASE/'joint-main-return-study-01/build.py')
connected=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(connected)


def pchip_slopes(x,y):
    h=np.diff(x);d=np.diff(y)/h;m=np.zeros(len(x))
    for i in range(1,len(x)-1):
        if d[i-1]*d[i]<=0:continue
        w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1]
        m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i])
    for i,hi,hj,di,dj in [(0,h[0],h[1],d[0],d[1]),(-1,h[-1],h[-2],d[-1],d[-2])]:
        value=((2*hi+hj)*di-hi*dj)/(hi+hj)
        if value*di<=0:value=0
        elif di*dj<0 and abs(value)>3*abs(di):value=3*di
        m[i]=value
    return m


def interpolate(x,y,z):
    x=np.asarray(x,float);y=np.asarray(y,float);m=pchip_slopes(x,y)
    i=max(0,min(len(x)-2,int(np.searchsorted(x,z)-1)))
    h=x[i+1]-x[i];t=np.clip((z-x[i])/h,0,1)
    return ((2*t**3-3*t*t+1)*y[i]+(t**3-2*t*t+t)*h*m[i]
            +(-2*t**3+3*t*t)*y[i+1]+(t**3-t*t)*h*m[i+1])


HEIGHTS=[2.08,2.14,2.25,2.40,2.56,2.72,2.85]
RX=[.41,.46,.57,.605,.54,.46,.39]
RY=[.31,.38,.55,.575,.49,.405,.32]


def radius(z):
    return np.asarray([interpolate(HEIGHTS,RX,z),interpolate(HEIGHTS,RY,z)])


def soft_max(a,b,width):
    return .5*(a+b+math.sqrt((a-b)**2+width**2))


def make_region(name,head):
    recipe=study.recipe_for(name);number=recipe['number'];major=number in (2,4,5)
    root=recipe['zroot'];tip=recipe['ztip'];sign=recipe['sign']
    rings=[];angles=[]
    for row,t in enumerate(np.linspace(0,1,study.ROWS)):
        z=root+(tip-root)*t
        theta=math.radians(float(study.joint.smooth_controls(np.asarray(recipe['theta']),t)))
        release=study.smoothstep(.72,1,t)
        width=recipe['width']*(.40+.60*study.smoothstep(0,.22,t))*(1-release)+.004*release
        # Both the ear bound and its influence have continuous first slopes.
        # Below the ear, the support may move toward the actual cheek volume.
        limit=math.radians(interpolate([2.12,2.22,2.30,2.38,2.45,2.62,2.85],
                                      [58,68,85,105,111,110,108],z))
        theta=soft_max(theta,limit+width/2,math.radians(1.7))
        shift=recipe['tipRadial']*release
        if number==0:
            # The previous constant inner offset pulled the emerging root
            # beneath Head before it had left the scalp support.
            shift-=.028*study.smoothstep(.22,.40,t)
        elif not major:shift-=.007*(1-release)
        thickness=(.013 if major else .0075)*(1-release)+.0016*release
        lift=(.010 if major else .0025)*(1-release)
        blend=study.smoothstep(.025,.20,t)
        section=[]
        for outer,indices in [(True,range(study.COLUMNS+1)),(False,range(study.COLUMNS-1,0,-1))]:
            for col in indices:
                u=col/study.COLUMNS
                angle=theta+(u-.5)*width+math.radians(2)*math.sin(math.pi*t)*math.sin(math.pi*u)
                point=study.surface_point(sign,angle,z,shift)
                outward=np.asarray([sign*math.sin(angle),-math.cos(angle),0.])
                point+=outward*(lift*math.sin(math.pi*u)**1.2 if outer else -thickness)
                direction=point-study.ORIGIN;direction/=np.linalg.norm(direction)
                skin,normal,_,_=head.ray_cast(study.Vector(study.ORIGIN+direction*2),study.Vector(-direction),4)
                if skin is None:raise ValueError(f'Head missing under {name} row {row}')
                rooted=np.asarray(skin,float)+direction*(.006 if outer else .001)
                section.append(rooted*(1-blend)+point*blend)
        rings.append(section);angles.append(theta)
    return np.asarray(rings),dict(**recipe,rootTransitionProgress=[.025,.20],
                                 support='PCHIP C1 no-overshoot shared envelope; soft ear bound; lower cheek turn',
                                 centreAnglesDegrees=np.degrees(angles).tolist(),
                                 underfoldInnerOffsetProgress=[.22,.40] if number==0 else None,
                                 capMethod='outer/inner column paired narrow strips; no cap centre fan')


def closed_patch(name,rings,material,matrix,region):
    rows,sides=rings.shape[:2]
    guide=rings.mean(axis=1)
    arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(guide,axis=0),axis=1))];arc/=arc[-1]
    verts=rings.reshape(-1,3).tolist();faces=[]
    for row in range(rows-1):
        for col in range(sides):
            a=row*sides+col;b=row*sides+(col+1)%sides
            faces.append((a,b,b+sides,a+sides))
    def inner(col):
        return col if col in (0,study.COLUMNS) else sides-col
    for row in [0,rows-1]:
        base=row*sides
        for col in range(study.COLUMNS):
            face=[base+col,base+col+1,base+inner(col+1),base+inner(col)]
            face=list(dict.fromkeys(face))
            if row==0:face.reverse()
            faces.append(tuple(face))
    mesh=bpy.data.meshes.new(name+' C1 shared surface');mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free()
    uv=mesh.uv_layers.new(name='Hair flow')
    for face in mesh.polygons:
        face.use_smooth=True
        seam=any(i%sides==sides-1 for i in face.vertices)
        for loop in face.loop_indices:
            row,col=divmod(mesh.loops[loop].vertex_index,sides)
            uv.data[loop].uv=(1 if seam and col==0 else col/sides,arc[row])
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material);obj.matrix_world=matrix.copy()
    obj['sectionSize']=sides;obj['region']=region;obj['flowProfile']='cosine'
    obj['guideBlender']=json.dumps(guide.tolist());obj['path']=guide.tolist()
    obj['nativeUV']='U closed 64-point surface perimeter; V true guide arclength0..1; paired root/tip strip caps, no centre vertices'
    curve=bpy.data.curves.new(name+' C1 author guide','CURVE');curve.dimensions='3D'
    spline=curve.splines.new('POLY');spline.points.add(rows-1)
    for point,coordinate in zip(spline.points,guide):point.co=(*coordinate,1)
    handle=bpy.data.objects.new(curve.name,curve);bpy.context.scene.collection.objects.link(handle)
    handle.hide_render=True;handle.hide_set(True);handle.matrix_world=matrix.copy()
    return obj,guide


# Keep the first-draft builder and frozen input. These local replacements do
# not touch the shared cap helper or any previously retained candidate.
study.radius=radius
study.RECIPES[5]['theta']=[122,117,108,81,74]
study.RECIPES[0]['theta']=[139,134,119,85,73]
study.make_region=make_region
study.joint.helper.closed_object=closed_patch


def main():
    source_sha=study.hashlib.sha256(study.SOURCE.read_bytes()).hexdigest()
    out=HERE/'draft-02';out.mkdir(exist_ok=False)
    bpy.ops.wm.open_mainfile(filepath=str(study.SOURCE));scene=bpy.context.scene
    frozen={o.name:study.joint.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o.name not in study.NAMES}
    images=study.image_hashes();head=study.joint.skull_tree(bpy.data.objects['Head'])
    originals={name:bpy.data.objects[name] for name in study.NAMES};metadata={}
    for name,obj in originals.items():
        uv=np.asarray([d.uv for d in obj.data.uv_layers.active.data])
        metadata[name]=dict(matrix=obj.matrix_world.copy(),material=obj.active_material,region=obj['region'],
                            origin=uv.min(axis=0),scale=np.ptp(uv,axis=0))
    geometry={name:make_region(name,head) for name in study.NAMES}
    for obj in originals.values():bpy.data.objects.remove(obj,do_unlink=True)
    results=[]
    for name,(rings,recipe) in geometry.items():
        meta=metadata[name]
        obj,guide=closed_patch(name,rings,meta['material'],meta['matrix'],meta['region'])
        study.atlas_uv(obj,meta['origin'],meta['scale'],head)
        obj['referenceRole']=recipe['role']
        result=study.joint.inspect(obj,head,recipe)
        result['connectedComponentVertexCounts']=connected.components(obj.data)
        results.append(result)
        print('C1_BOB_COMPONENT',name,result['selfIntersection']['exactCrossings'],result['headVertexMin'],flush=True)
    for name,digest in frozen.items():assert study.joint.mesh_hash(bpy.data.objects[name])==digest,name
    assert study.image_hashes()==images
    assert study.hashlib.sha256(study.SOURCE.read_bytes()).hexdigest()==source_sha
    sample_z=np.linspace(HEIGHTS[0],HEIGHTS[-1],1001)
    sampled=np.asarray([radius(z) for z in sample_z])
    assert sampled[:,0].min()>=min(RX) and sampled[:,0].max()<=max(RX)
    assert sampled[:,1].min()>=min(RY) and sampled[:,1].max()<=max(RY)
    report=dict(source=str(study.SOURCE),sourceSHA256=source_sha,changedObjects=study.NAMES,other37MeshHashes=frozen,
                allSourceImagePixelHashes=images,allAtlasFrozen=True,components=results,
                correction='Only C1 no-overshoot radius, continuous ear bound, forward lower ear/underfold turn and paired narrow strip caps',
                interpolation='shape-preserving cubic Hermite PCHIP; derivative zero at2.40 radius maximum',
                radiusSampledRanges=[sampled.min(axis=0).tolist(),sampled.max(axis=0).tolist()],
                structurePass=all(r['closed'] and r['signedVolume']>0 and r['selfIntersection']['exactCrossings']==0 and len(r['connectedComponentVertexCounts'])==1 for r in results),
                capContract='89x64 vertices; no root/tip centre; each cap32 paired narrow faces',
                artisticApproval=False,published=False,exported=False)
    (out/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
    (out/'build_second.py').write_text(Path(__file__).read_text())
    text=bpy.data.texts.new('C1 bob correction recipe.py');text.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Bob-Surface.blend'))
    print('C1_BOB_BLEND_READY',out,report['structurePass'],flush=True)
    grey=bpy.data.materials.new('C1 shared bob clay');grey.use_nodes=True
    shader=grey.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.42,.42,.42,1)
    shader.inputs['Roughness'].default_value=.76
    for name in json.loads(scene['Hair components']):
        obj=bpy.data.objects[name];obj.data.materials.clear();obj.data.materials.append(grey)
    centre=study.Vector((0,.015,2.64));scene.camera.data.ortho_scale=1.5
    scene.render.resolution_x=scene.render.resolution_y=768;scene.cycles.samples=24;scene.cycles.use_denoising=True
    for view,axis in [('front',(0,-1,0)),('right',(-1,0,0)),('three-quarter',(-1,-1,0))]:
        scene.camera.location=centre+study.Vector(axis)*4
        scene.camera.rotation_euler=(centre-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/(view+'.png'));bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Bob-Surface-Clay.blend'))
    print('C1_BOB_COMPLETE',out,flush=True)


if __name__=='__main__':main()
