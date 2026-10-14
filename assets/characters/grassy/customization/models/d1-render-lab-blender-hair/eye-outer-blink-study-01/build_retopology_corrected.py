"""Replace only the obsolete solid eye rim with a continuous local skin patch."""
import hashlib
import importlib.util
import json
from collections import Counter, defaultdict
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
SOURCE=HERE.parent/'temple-root-continuity-study-01/draft-01/PBR-Game-Export.blend'
OUT=HERE/'draft-02-corrected'
AXIS=.035
spec=importlib.util.spec_from_file_location('eye_contract',HERE/'build_candidate.py')
shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)


def polar(p):
    return np.stack([np.arctan2(p[...,0],AXIS-p[...,1])*.42,p[...,2]],axis=-1),np.hypot(p[...,0],p[...,1]-AXIS)


def inside(p,loop):
    x,y=p[...,0],p[...,1];result=np.zeros(x.shape,bool)
    for a,b in zip(loop,np.roll(loop,-1,axis=0)):
        if abs(a[1]-b[1])>1e-12:
            result^=((a[1]>y)!=(b[1]>y))&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])
    return result


def phi(d):
    d2=np.sum(d*d,axis=-1)
    return .5*d2*np.log(np.maximum(d2,1e-24))


def fit(support,values):
    p=np.column_stack([np.ones(len(support)),support])
    k=phi(support[:,None]-support[None,:]);k.flat[::len(k)+1]+=1e-11
    system=np.block([[k,p],[p.T,np.zeros((3,3))]])
    c=np.linalg.solve(system,np.r_[values,[0.,0.,0.]])
    return lambda q:phi(q[:,None]-support[None,:])@c[:-3]+np.column_stack([np.ones(len(q)),q])@c[-3:]


def bvh(p,t):
    return BVHTree.FromPolygons([Vector(v) for v in p],t.tolist(),all_triangles=True)


def bary(p,tri):
    a,b,c=tri;v0=b-a;v1=c-a;v2=p-a
    d00=v0@v0;d01=v0@v1;d11=v1@v1;d20=v2@v0;d21=v2@v1
    denominator=d00*d11-d01*d01
    v=(d11*d20-d01*d21)/denominator;w=(d00*d21-d01*d20)/denominator
    return np.array([1-v-w,v,w])


def sample_image(image, uv):
    w,h=image.size
    pixels=np.asarray(image.pixels[:]).reshape(h,w,4)
    xy=uv*np.array([w,h])-.5
    lower=np.floor(xy).astype(int);fraction=xy-lower
    x0=lower[:,0]%w;x1=(x0+1)%w;y0=np.clip(lower[:,1],0,h-1);y1=np.clip(y0+1,0,h-1)
    a=pixels[y0,x0]*(1-fraction[:,0,None])+pixels[y0,x1]*fraction[:,0,None]
    b=pixels[y1,x0]*(1-fraction[:,0,None])+pixels[y1,x1]*fraction[:,0,None]
    return a*(1-fraction[:,1,None])+b*fraction[:,1,None]


def main():
    OUT.mkdir(exist_ok=True)
    output=OUT/'Eye-Local-Retopology.blend'
    assert not output.exists(),'Candidate already preserved'
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    head=bpy.data.objects['Head'];old=head.data;scene=bpy.context.scene
    freeze={o.name:shared.shared.joint.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o!=head}
    images=shared.shared.image_hashes()
    p=np.asarray([v.co[:] for v in old.vertices]);tris=np.asarray([f.vertices[:] for f in old.polygons]);materials=np.asarray([f.material_index for f in old.polygons])
    assert tris.shape[1]==3
    old_normals=np.asarray([n.vector[:] for n in old.corner_normals]).reshape(-1,3,3)
    uvs={layer.name:np.asarray([l.uv[:] for l in layer.data]).reshape(-1,3,2) for layer in old.uv_layers}
    old_weights=[[(g.group,g.weight) for g in v.groups] for v in old.vertices]
    group_names=[g.name for g in head.vertex_groups]
    material_links=[(s.link,s.material) for s in head.material_slots]
    skin_id=[m.name for m in old.materials].index('model');eye_id=[m.name for m in old.materials].index('D1 eye')
    skin_poly=np.flatnonzero(materials==skin_id);skin=tris[skin_poly];skin_vertices=np.unique(skin)
    eye_vertices=np.unique(tris[materials==eye_id])
    old_tree=bvh(p,skin)
    unique,indices,inv=np.unique(p,axis=0,return_index=True,return_inverse=True)
    uv2,radius=polar(p);center=p[skin].mean(1);ct,_=polar(center)
    remove=np.zeros(len(tris),bool);points=p.tolist();new_faces=[];patches=[];new_uv={n:[] for n in uvs}
    source_uv_map=[]
    for sign in (-1,1):
        angle=np.abs(ct[:,0]/.42)
        selected=((((angle-.65)/.48)**4+((ct[:,1]-2.43)/.127)**4)<1)&(np.sign(center[:,0])==sign)&(np.abs(p[skin,0]).min(1)>.08)&(p[skin,2].max(1)<2.56)&(p[skin,2].min(1)>2.30)
        removed=skin_poly[selected];remove[removed]=True
        welded=inv[skin[selected]]
        edge_count=Counter(tuple(sorted((int(x),int(y)))) for f in welded for x,y in zip(f,np.roll(f,-1)))
        adjacency=defaultdict(list)
        for (a,b),count in edge_count.items():
            if count==1:adjacency[a].append(b);adjacency[b].append(a)
        assert all(len(a)==2 for a in adjacency.values())
        loop=[next(iter(adjacency))];prev=None
        while True:
            following=next(v for v in adjacency[loop[-1]] if v!=prev)
            if following==loop[0]:break
            prev=loop[-1];loop.append(following)
        assert len(loop)==len(adjacency),'Multiple patch boundaries'
        boundary=indices[loop];loop2=uv2[boundary].copy()
        if np.sum(loop2[:,0]*np.roll(loop2[:,1],-1)-loop2[:,1]*np.roll(loop2[:,0],-1))<0:
            boundary=boundary[::-1];loop2=loop2[::-1]
        # Healthy skin immediately outside the actual cut supplies both curvature
        # and its approach to the seam. Old folded interior does not constrain it.
        candidate=skin_vertices[(np.sign(p[skin_vertices,0])==sign)&(p[skin_vertices,2]>2.25)&(p[skin_vertices,2]<2.61)]
        candidate=candidate[~inside(uv2[candidate],loop2)]
        distance=np.sqrt(((uv2[candidate,None]-loop2[None,:])**2).sum(2)).min(1)
        candidate=candidate[(distance>.003)&(distance<.037)]
        # One real source point per small cell is enough; boundary samples remain exact.
        cells=np.floor(uv2[candidate]/.007).astype(int)
        _,keep=np.unique(cells,axis=0,return_index=True);support_indices=np.r_[boundary,candidate[keep]]
        support=uv2[support_indices];values=radius[support_indices]
        _,dedup=np.unique(np.round(support,9),axis=0,return_index=True);support=support[dedup];values=values[dedup]
        surface=fit(support,values)
        lo=loop2.min(0);hi=loop2.max(0);grid=[]
        for row,z in enumerate(np.arange(lo[1]+.007,hi[1],.008)):
            for x in np.arange(lo[0]+.007+(row%2)*.004,hi[0],.008):
                q=np.array([x,z]);d=np.linalg.norm(loop2-q,axis=1).min()
                if inside(q,loop2) and d>.004:grid.append(q)
        coords=np.concatenate([loop2,np.asarray(grid)])
        edges=[(i,(i+1)%len(loop2)) for i in range(len(loop2))]
        result=delaunay_2d_cdt([Vector(v) for v in coords],edges,[list(range(len(loop2)))],1,1e-7,True)
        q=np.asarray(result[0]);rr=surface(q);local_ids=[]
        boundary_output=0
        for i,(xy,orig) in enumerate(zip(q,result[3])):
            old_boundary=[j for j in orig if j<len(boundary)]
            if old_boundary:
                assert len(old_boundary)==1
                local_ids.append(int(boundary[old_boundary[0]]));boundary_output+=1
            else:
                a=xy[0]/.42
                local_ids.append(len(points));points.append([np.sin(a)*rr[i],AXIS-np.cos(a)*rr[i],xy[1]])
        assert boundary_output==len(boundary)
        current_faces=[]
        for face in result[2]:
            assert len(face)==3
            ids=[local_ids[j] for j in face];tri=np.asarray([points[j] for j in ids]);normal=np.cross(tri[1]-tri[0],tri[2]-tri[0]);mid=tri.mean(0);outward=np.array([mid[0],mid[1]-AXIS,0])
            if normal@outward<0:ids.reverse()
            current_faces.append(ids)
        new_faces.extend(current_faces)
        patches.append(dict(parameterBounds=[(lo-.004).tolist(),(hi+.004).tolist()],sign=sign,removedTriangles=len(removed),boundaryVertices=boundary.tolist(),supportVertices=len(support),addedTriangles=len(current_faces),surfaceRadialRange=[float(rr.min()),float(rr.max())],boundaryInterpolationMax=float(np.max(np.abs(surface(loop2)-radius[boundary])))))
    points=np.asarray(points)
    retained=np.flatnonzero(~remove);new_faces=np.asarray(new_faces,int);combined=np.concatenate([tris[retained],new_faces]);new_materials=np.r_[materials[retained],np.full(len(new_faces),skin_id)]
    new_skin=combined[new_materials==skin_id];new_tree=bvh(points,new_skin)
    # Use the original UV grid as its monotone surface coordinates, removing
    # historical offsets from the folded old normal field. UV/topology stay exact.
    vertex_uv=np.zeros((len(p),2))
    uv_layer=old.uv_layers.active
    for polygon in old.polygons:
        if polygon.material_index==eye_id:
            for li in polygon.loop_indices:vertex_uv[old.loops[li].vertex_index]=uv_layer.data[li].uv[:]
    eye_fit=[];eye_parameter_fits=[]
    for sign in (-1,1):
        selected=eye_vertices[p[eye_vertices,0]*sign>0]
        design=np.column_stack([np.ones(len(selected)),vertex_uv[selected]])
        target=uv2[selected].copy();target[:,0]/=.42
        coefficients=np.linalg.lstsq(design,target,rcond=None)[0]
        fitted=design@coefficients
        eye_parameter_fits.append(dict(sign=sign,coefficients=coefficients.tolist(),maximumResidual=np.abs(fitted-target).max(0).tolist(),rmsResidual=np.sqrt(((fitted-target)**2).mean(0)).tolist()))
        for i,(angle,height) in zip(selected,fitted):
            direction=Vector((np.sin(angle),-np.cos(angle),0));axis=Vector((0,AXIS,height))
            hit,normal,face,_=new_tree.ray_cast(axis+direction,-direction)
            assert hit is not None
            # A single-valued radial offset cannot fold neighbouring grid rows
            # back across each other, unlike independent face-normal offsets.
            points[i]=np.asarray(hit)+np.asarray(direction)*.0025
            eye_fit.append([int(i),.0025,int(face)])
    # A new, local, single-valued chart avoids interpolating across old UV islands.
    # Every texel reads the actual old skin hit, then the whole patch interpolates
    # within this chart. Existing images/retained polygon UVs stay unchanged.
    chart_uv={}
    for face in new_faces:
        sign=-1 if points[face,0].mean()<0 else 1
        record=next(r for r in patches if r['sign']==sign)
        lo,hi=np.asarray(record['parameterBounds']);q,_=polar(points[face]);uv=(q-lo)/(hi-lo)
        uv[:,0]=uv[:,0]*.5+(0 if sign<0 else .5)
        for name in uvs:new_uv[name].append(uv)
    source_uv=[];size=512
    for iy in range(size):
        for side in range(2):
            record=patches[side];lo,hi=np.asarray(record['parameterBounds'])
            z=lo[1]+(iy+.5)/size*(hi[1]-lo[1])
            for ix in range(size):
                qx=lo[0]+(ix+.5)/size*(hi[0]-lo[0]);angle=qx/.42
                direction=Vector((np.sin(angle),-np.cos(angle),0));axis=Vector((0,AXIS,z))
                hit,_,f,_=old_tree.ray_cast(axis+direction,-direction)
                assert hit is not None
                poly=skin_poly[f];weights=bary(np.asarray(hit),p[tris[poly]])
                source_uv.append(weights@uvs[uv_layer.name][poly])
    source_uv=np.asarray(source_uv)
    patch_material=old.materials[skin_id].copy();patch_material.name='model eye surface continuity'
    new_images=[]
    for node in patch_material.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image.name in ('head-diffuse','texture_metallic-texture_roughness.001'):
            source_image=node.image
            pixels=sample_image(source_image,source_uv)
            name='eye-surface-color' if source_image.name=='head-diffuse' else 'eye-surface-metal-roughness'
            img=bpy.data.images.new(name,size*2,size,alpha=True)
            img.colorspace_settings.name=source_image.colorspace_settings.name
            img.pixels.foreach_set(pixels.astype(np.float32).ravel());img.filepath_raw=str(OUT/(name+'.png'));img.file_format='PNG';img.save();img.pack()
            node.image=img;new_images.append(dict(name=name,source=source_image.name,sha256=hashlib.sha256((OUT/(name+'.png')).read_bytes()).hexdigest()))
    for node in patch_material.node_tree.nodes:
        if node.type=='BSDF_PRINCIPLED':
            for link in list(node.inputs['Normal'].links):patch_material.node_tree.links.remove(link)
    new_materials[len(retained):]=len(old.materials)
    mesh=bpy.data.meshes.new('Head continuous eye skin local retopology')
    mesh.from_pydata(points.tolist(),[],combined.tolist());mesh.update()
    for material in old.materials:mesh.materials.append(material)
    mesh.materials.append(patch_material)
    mesh.polygons.foreach_set('material_index',new_materials.astype(np.int32))
    for poly in mesh.polygons:poly.use_smooth=True
    for name,data in uvs.items():
        layer=mesh.uv_layers.new(name=name)
        layer.data.foreach_set('uv',np.concatenate([data[retained],np.asarray(new_uv[name])]).ravel())
    mesh.uv_layers.active_index=old.uv_layers.active_index
    # Preserve imported normals elsewhere, recompute the new skin/eye area and
    # the single row of existing faces sharing its boundary.
    mesh.update();normal=np.asarray([n.vector[:] for n in mesh.corner_normals]).reshape(-1,3,3)
    new_normals=normal.copy();new_normals[:len(retained)]=old_normals[retained]
    affected=np.unique(np.r_[new_faces.ravel(),eye_vertices])
    loopvertices=combined
    mask=np.isin(loopvertices,affected)
    corner_points=points[loopvertices]
    protected=(np.abs(corner_points[...,0])<.08)|(corner_points[...,2]>=2.56)|(corner_points[...,2]<=2.30)
    mask &= ~protected
    new_normals[mask]=normal[mask]
    mesh.normals_split_custom_set(new_normals.reshape(-1,3).tolist())
    # All old vertices keep their exact imported weights, including loose vertices.
    head.data=mesh
    assert not head.vertex_groups
    for name in group_names:head.vertex_groups.new(name=name)
    for slot,(link,material) in zip(head.material_slots,material_links):
        slot.link=link;slot.material=material
    for i,groups in enumerate(old_weights):
        for group,weight in groups:head.vertex_groups[group].add([i],weight,'REPLACE')
    skin_weights={tuple(old_weights[int(i)]) for i in skin_vertices}
    assert len(skin_weights)==1,skin_weights
    for group,weight in next(iter(skin_weights)):
        head.vertex_groups[group].add(list(range(len(p),len(points))),weight,'REPLACE')
    actual=np.asarray([v.co[:] for v in mesh.vertices]);fixed=np.ones(len(p),bool);fixed[eye_vertices]=False
    assert np.array_equal(actual[:len(p)][fixed],p[fixed])
    assert all(shared.shared.joint.mesh_hash(bpy.data.objects[n])==h for n,h in freeze.items())
    assert all(shared.shared.image_hashes()[name]==value for name,value in images.items())
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output))
    np.savez(OUT/'head-diff.npz',before=p,after=actual,sourceTriangles=tris,sourceMaterials=materials,triangles=combined,materials=new_materials,retainedSourcePolygons=retained,newFaces=new_faces,removedSourcePolygons=np.flatnonzero(remove),eyeVertices=eye_vertices)
    report=dict(source=str(SOURCE),sourceSHA256=source_hash,candidate=str(output),candidateSHA256=hashlib.sha256(output.read_bytes()).hexdigest(),other53MeshesFrozen=freeze,imagesFrozen=images,patches=patches,sourceVertices=len(p),newVertices=len(points),removedTriangles=int(remove.sum()),addedTriangles=len(new_faces),allOriginalSkinVertexPositionsUnchanged=True,retainedPolygonsAndUVExactlyPreserved=True,eyeTopologyAndUVPreserved=True,eyeRefit=eye_fit,eyeParameterFits=eye_parameter_fits,newLocalImages=new_images,localSkinNormalMap='flat on new skin patch only; retained head normal unchanged',maximumEyeTravel=float(np.linalg.norm(actual[eye_vertices]-p[eye_vertices],axis=1).max()),newSkinWeights=[list(v) for v in next(iter(skin_weights))],visualApproval=False,structureApproval=False,exported=False,published=False)
    (OUT/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('EYE_RETOPOLOGY_SAVED',output,flush=True)

if __name__=='__main__':main()
