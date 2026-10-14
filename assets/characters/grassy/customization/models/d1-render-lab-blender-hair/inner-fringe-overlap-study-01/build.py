"""One overlapping inner-fringe pair; preserve every other mesh and atlas."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent; BASE=HERE.parent
SOURCE=BASE/'parting-wrap-assembly-study-01/draft-03/D1-Hair-Painted.blend'
NAMES=['Inner long fringe','Inner short fringe']
SIDES=64
spec=importlib.util.spec_from_file_location('overlap_existing_helpers',BASE/'joint-crown-fringe-sculpt-study-01/build.py')
joint=importlib.util.module_from_spec(spec);spec.loader.exec_module(joint)


def smoothstep(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)


def image_hashes():
    result={}
    for image in bpy.data.images:
        if image.type=='RENDER_RESULT' or image.size[0]==0:
            continue
        result[image.name]=hashlib.sha256(np.asarray(image.pixels,dtype='<f4').tobytes()).hexdigest()
    return result


def source_rings(obj):
    points=np.asarray([v.co for v in obj.data.vertices],float)
    assert obj['sectionSize']==SIDES
    rows=len(points)//SIDES
    assert len(points) in (rows*SIDES,rows*SIDES+2)
    return points[:rows*SIDES].reshape(rows,SIDES,3)


def make_safe_rings(rings,head):
    result=rings.copy(); shifts=[]
    for row,ring in enumerate(rings):
        def minimum(delta):
            return min(joint.audit_helper.signed_distance(head,p+[0,-delta,0]) for p in ring)
        if minimum(0)>=.004:
            shifts.append(0.);continue
        low,high=0.,.001
        while minimum(high)<.004:
            high*=2
            if high>.16:
                raise ValueError(f'Inner Head clearance would require an excessive shift at row {row}')
        for _ in range(20):
            middle=(low+high)/2
            if minimum(middle)<.004:low=middle
            else:high=middle
        result[row,:,1]-=high+.0005
        shifts.append(high+.0005)
    # Smooth an upper envelope of the required rigid forward translations;
    # never press separate vertices into a distorted or inverted section.
    padded=np.pad(shifts,(3,3),mode='edge')
    envelope=np.asarray([max(padded[i:i+7]) for i in range(len(shifts))])
    kernel=np.asarray([1,6,15,20,15,6,1])/64
    final=np.convolve(np.pad(envelope,(3,3),mode='edge'),kernel,mode='valid')
    assert np.all(final>=np.asarray(shifts)-1e-10)
    result=rings.copy();result[:,:,1]-=final[:,None]
    return result,final.tolist()


def long_shape(old,head):
    centres=old.mean(axis=1)
    distances=np.r_[0,np.cumsum(np.linalg.norm(np.diff(centres,axis=0),axis=1))]
    progress=distances/distances[-1]
    new=old.copy();records=[]
    for row,(ring,centre,t) in enumerate(zip(old,centres,progress)):
        z=centre[2]
        root_blend=smoothstep(.10,.23,t)
        shoulder=smoothstep(2.76,2.94,z)*root_blend
        shift=np.interp(z,[2.57,2.74,2.81,2.90,2.98,3.03],[0,0,.014,.050,.062,.030])*root_blend
        y_scale=1-.27*shoulder
        xmin,xmax=ring[:,0].min(),ring[:,0].max()
        extension=np.interp(z,[2.57,2.63,2.68,2.715,2.76,2.82,2.88,2.94,3.02],
                              [0,.012,.025,.044,.044,.032,.014,0,0])*root_blend
        new[row,:,0]=xmin+(ring[:,0]-xmin)*(1+extension/(xmax-xmin))
        new[row,:,1]=centre[1]+(ring[:,1]-centre[1])*y_scale+shift
        records.append(dict(row=row,oldCentre=centre.tolist(),shoulderBackShift=float(shift),
                            sectionYScale=float(y_scale),innerEdgeXExtension=float(extension)))
    new,clearance=make_safe_rings(new,head)
    return new,dict(method='Existing long sweep with upper forward shoulder compressed/retracted, opposite inner edge unfolded toward short fringe',
                    stations=records,rigidHeadClearanceForwardShifts=clearance,
                    rootContactVertexIndices=[])


def interp_stations(rings,z,field):
    centres=rings.mean(axis=1)
    # The long source has a tiny hidden root arch. Use the descending body
    # after its peak when matching an adjacent forehead station.
    peak=int(np.argmax(centres[:,2]))
    values=np.asarray([field(r) for r in rings[peak:]])
    heights=centres[peak:,2]
    order=np.argsort(heights)
    return np.interp(z,heights[order],values[order])


def short_shape(old,long,head):
    old_centres=old.mean(axis=1)
    tip=old_centres[-1].copy()
    root_skin,root_normal=head.find_nearest(Vector((.074,-.085,2.948)))[:2]
    root=np.asarray(root_skin,float)+np.asarray(root_normal,float)*.005
    rows=145
    zs=np.linspace(root[2],tip[2],rows)
    ring_list=[];stations=[]
    angles=np.arange(SIDES)*math.tau/SIDES
    old_zmax=float(old_centres[:,2].max())
    for row,z in enumerate(zs):
        if z>old_zmax:
            t=np.clip((root[2]-z)/(root[2]-old_zmax),0,1)
            q=t*t*(3-2*t)
            xcentre=root[0]*(1-q)+.034*q
            xmin=xcentre-(.018*(1-q)+.042*q)
            xmax=xcentre+(.018*(1-q)+.042*q)
            cy=root[1]*(1-q)-.305*q
            ry=.006*(1-q)+.026*q
        else:
            raw_xmin=interp_stations(old,z,lambda r:r[:,0].min())
            xmax=interp_stations(old,z,lambda r:r[:,0].max())
            close=interp_stations(long,z,lambda r:r[:,0].max())
            overlap=np.interp(z,[2.57,2.715,2.745,2.82,2.90],[0,0,.011,.017,.010])
            expansion=smoothstep(2.625,2.715,z)
            xmin=raw_xmin+(min(raw_xmin,close-overlap)-raw_xmin)*expansion
            ymin=interp_stations(old,z,lambda r:r[:,1].min())
            ymax=interp_stations(old,z,lambda r:r[:,1].max())
            shoulder=smoothstep(2.74,2.84,z)
            cy=(ymin+ymax)/2+.022*shoulder
            ry=(ymax-ymin)/2*(1-.20*shoulder)
        fade=smoothstep(tip[2],tip[2]+.015,z)
        if row==rows-1:
            xmin,xmax=tip[0]-.0012,tip[0]+.0012
            cy=tip[1];ry=.0012
        cx=(xmin+xmax)/2;rx=(xmax-xmin)/2
        rho=.78
        section=np.column_stack([cx+rx*np.cos(angles),
                                 cy+ry*(-rho*np.cos(angles)+math.sqrt(1-rho*rho)*np.sin(angles)),
                                 np.full(SIDES,z)])
        ring_list.append(section)
        stations.append(dict(row=row,z=float(z),xmin=float(xmin),xmax=float(xmax),
                             centreY=float(cy),halfDepthY=float(ry)))
    rings,clearance=make_safe_rings(np.asarray(ring_list),head)
    return rings,dict(method='Monotone-height closed correlated sections, actual part root, broad overlap before source lower split/tip',
                      rootSkin=list(root_skin),rootNormal=list(root_normal),rootSeed=root.tolist(),
                      sourceTip=tip.tolist(),stations=stations,rigidHeadClearanceForwardShifts=clearance,
                      rootContactVertexIndices=[])


def add_atlas_uv(obj,origin,scale):
    mesh=obj.data
    native=mesh.uv_layers.active
    native.name='Hair flow native'
    packed=mesh.uv_layers.new(name='Hair flow')
    for n,p in zip(native.data,packed.data):p.uv=origin+np.asarray(n.uv)*scale
    mesh.uv_layers.active=packed;packed.active_render=True
    t=mesh.attributes.new('_D1_STRAND_T','FLOAT','POINT')
    sums=np.zeros(len(mesh.vertices));counts=np.zeros(len(mesh.vertices))
    for loop,uv in zip(mesh.loops,native.data):
        sums[loop.vertex_index]+=uv.uv.y;counts[loop.vertex_index]+=1
    for item,value in zip(t.data,sums/counts):item.value=float(value)
    guide=np.asarray(json.loads(obj['guideBlender']))
    sides=obj['sectionSize']
    contacts=[]
    # Actual root contact is recorded from both faces of the measured root
    # zone; guide origin alone cannot prove attachment.
    head=joint.skull_tree(bpy.data.objects['Head'])
    for vertex in mesh.vertices[:min(8,len(guide))*sides]:
        if abs(joint.audit_helper.signed_distance(head,vertex.co))<=.012:
            contacts.append(vertex.index)
    if not contacts:raise ValueError(f'No measured root patch on {obj.name}')
    obj['rootContactVertexIndices']=contacts
    obj['strandTopology']='ordered-closed-sweep'
    return contacts


def main():
    out=HERE/'draft-01';out.mkdir(exist_ok=False)
    source_sha=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    atlas=SOURCE.parent/'painted-hair-atlas.png';atlas_sha=hashlib.sha256(atlas.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
    frozen={o.name:joint.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o.name not in NAMES}
    images_before=image_hashes()
    head=joint.skull_tree(bpy.data.objects['Head'])
    originals={name:bpy.data.objects[name] for name in NAMES}
    metadata={}
    for name,obj in originals.items():
        uv=np.asarray([v.uv for v in obj.data.uv_layers.active.data])
        metadata[name]=dict(matrix=obj.matrix_world.copy(),material=obj.active_material,origin=uv.min(axis=0),scale=uv.max(axis=0)-uv.min(axis=0))
    long,recipe_long=long_shape(source_rings(originals[NAMES[0]]),head)
    short,recipe_short=short_shape(source_rings(originals[NAMES[1]]),long,head)
    for obj in originals.values():bpy.data.objects.remove(obj,do_unlink=True)
    reports=[]
    for name,rings,recipe in [(NAMES[0],long,recipe_long),(NAMES[1],short,recipe_short)]:
        item=metadata[name]
        obj,guide=joint.helper.closed_object(name,rings,item['material'],item['matrix'],'fringe')
        obj['flowProfile']='cosine'
        add_atlas_uv(obj,item['origin'],item['scale'])
        reports.append(joint.inspect(obj,head,recipe))
    for name,digest in frozen.items():assert joint.mesh_hash(bpy.data.objects[name])==digest,name
    assert image_hashes()==images_before
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_sha
    assert hashlib.sha256(atlas.read_bytes()).hexdigest()==atlas_sha
    report=dict(source=str(SOURCE),sourceSHA256=source_sha,changedObjects=NAMES,other51MeshHashes=frozen,
                allImagePixelHashesUnchanged=images_before,atlasSHA256Unchanged=atlas_sha,
                components=reports,structurePass=all(r['closed'] and r['signedVolume']>0 and r['selfIntersection']['exactCrossings']==0 for r in reports),
                imageAtlasFrozen=True,sourceTipPositionsRetained=False,
                tipDecision='Tip silhouettes were not deliberately moved; final guide displacement is recorded by saved verification',
                artisticApproval=False,published=False)
    (out/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
    (out/'build.py').write_text(Path(__file__).read_text())
    text=bpy.data.texts.new('Inner overlap editable recipe.py');text.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Inner-Overlap.blend'))
    print('INNER_OVERLAP_READY',out,'structure',report['structurePass'],flush=True)
    grey=bpy.data.materials.new('Inner overlap shape check');grey.use_nodes=True
    bsdf=grey.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.42,.42,.42,1)
    bsdf.inputs['Roughness'].default_value=.76
    for name in json.loads(scene['Hair components']):
        obj=bpy.data.objects[name];obj.data.materials.clear();obj.data.materials.append(grey)
    centre=Vector((0,.015,2.64));scene.camera.data.ortho_scale=1.5
    scene.render.resolution_x=scene.render.resolution_y=768;scene.cycles.samples=24;scene.cycles.use_denoising=True
    for view,axis in [('front',(0,-1,0)),('right',(-1,0,0)),('three-quarter',(-1,-1,0))]:
        scene.camera.location=centre+Vector(axis)*4
        scene.camera.rotation_euler=(centre-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/(view+'.png'));bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Inner-Overlap-Clay.blend'))
    print('INNER_OVERLAP_COMPLETE',out,flush=True)


if __name__=='__main__':main()
