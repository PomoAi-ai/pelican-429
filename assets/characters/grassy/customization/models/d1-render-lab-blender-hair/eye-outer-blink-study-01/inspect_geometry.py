"""Inspect only the frozen Head and eye patch geometry decoded from the published GLB."""
import hashlib
import importlib.util
import json
from collections import defaultdict
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from io_scene_gltf2.io.imp.gltf2_io_binary import BinaryData
from io_scene_gltf2.io.imp.gltf2_io_gltf import glTFImporter

OUT=Path(__file__).resolve().parent
BASE=OUT.parent
ROOT=next(p for p in BASE.parents if (p/'package.json').is_file())
SOURCE=ROOT/'public/characters/human/render-lab/d1-outfit-blender-temple-root-v1.glb'
FROZEN=ROOT/'public/characters/human/render-lab/d1-outfit-rodin-hair.web-1k.glb'
spec=importlib.util.spec_from_file_location('eye_source_read_glb',BASE/'publish_hair.py')
pub=importlib.util.module_from_spec(spec);spec.loader.exec_module(pub)


def components(points,faces):
    adjacency=[set() for _ in points]
    for a,b,c in faces:
        adjacency[a].update((b,c));adjacency[b].update((a,c));adjacency[c].update((a,b))
    remaining=set(range(len(points)));result=[]
    while remaining:
        pending=[remaining.pop()];group=[]
        while pending:
            v=pending.pop();group.append(v)
            neighbors=remaining.intersection(adjacency[v]);remaining.difference_update(neighbors);pending.extend(neighbors)
        result.append(np.asarray(group))
    return sorted(result,key=lambda a:float(points[a,0].mean()))


def main():
    hashes={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in (SOURCE,FROZEN)}
    doc,binary=pub.read_glb(SOURCE);old,old_binary=pub.read_glb(FROZEN)
    head_nodes=[n for n in doc['nodes'] if n.get('name')=='Head']
    assert len(head_nodes)==1
    head_node=head_nodes[0];mesh=doc['meshes'][head_node['mesh']]
    assert mesh==old['meshes'][head_node['mesh']] and binary[:len(old_binary)]==old_binary
    reader=glTFImporter(str(SOURCE),{'import_user_extensions':[]});reader.read()
    primitives={doc['materials'][p['material']]['name']:p for p in mesh['primitives']}
    def read(name):
        p=primitives[name]
        return (np.asarray(BinaryData.decode_accessor(reader,p['attributes']['POSITION']),float),
            np.asarray(BinaryData.decode_accessor(reader,p['indices']),int).reshape(-1,3),
            np.asarray(BinaryData.decode_accessor(reader,p['attributes']['TEXCOORD_0']),float))
    hp,hf,huv=read('model');ep,ef,euv=read('D1 eye')
    np.savez(OUT/'eye-head-data.npz',headPoints=hp,headTriangles=hf,headUV=huv,eyePoints=ep,eyeTriangles=ef,eyeUV=euv)
    tree=BVHTree.FromPolygons([Vector(p) for p in hp],hf.tolist(),all_triangles=True)
    near=[];dist=[]
    for p in ep:
        q,n,face,d=tree.find_nearest(Vector(p));near.append(q);dist.append(d if (Vector(p)-q).dot(n)>=0 else -d)
    dist=np.asarray(dist);near=np.asarray(near)
    raw_components=components(ep,ef)
    welded,vertex_map=np.unique(ep,axis=0,return_inverse=True)
    welded_faces=vertex_map[ef]
    comp=components(welded,welded_faces);component_report=[]
    edge_faces=defaultdict(list)
    for i,f in enumerate(hf):
        for j in range(3):edge_faces[tuple(sorted((int(f[j]),int(f[(j+1)%3]))))].append(i)
    hn=np.cross(hp[hf[:,1]]-hp[hf[:,0]],hp[hf[:,2]]-hp[hf[:,0]])
    hn/=np.maximum(np.linalg.norm(hn,axis=1)[:,None],1e-12)
    silhouette_reports=[]
    for welded_group in comp:
        group=np.flatnonzero(np.isin(vertex_map,welded_group))
        selected=np.isin(welded_faces[:,0],welded_group);faces=welded_faces[selected]
        edges=np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1)
        unique,counts=np.unique(edges,axis=0,return_counts=True)
        boundary=unique[counts==1]
        outer=group[euv[group,0]>.34]
        component_report.append(dict(vertices=len(group),weldedVertices=len(welded_group),faces=len(faces),edges=len(unique),boundaryEdges=len(boundary),
            eulerCharacteristic=int(len(welded_group)-len(unique)+len(faces)),nonManifoldEdges=int(np.count_nonzero(counts>2)),
            bounds=[ep[group].min(0).tolist(),ep[group].max(0).tolist()],uvBounds=[euv[group].min(0).tolist(),euv[group].max(0).tolist()],
            headDistance=dict(minimum=float(dist[group].min()),median=float(np.median(dist[group])),maximum=float(dist[group].max())),
            outerCornerVertexCount=len(outer),outerCornerHeadDistance=dict(minimum=float(dist[outer].min()),median=float(np.median(dist[outer])),maximum=float(dist[outer].max()))))
    # Silhouette edges are a direct geometric property and need no eye texture or outline shader.
    for degrees in (-45,45):
        yaw=np.deg2rad(degrees);view=np.array([np.sin(yaw),0,np.cos(yaw)])
        facing=hn@view
        edges=[edge for edge,owners in edge_faces.items() if len(owners)==2 and facing[owners[0]]*facing[owners[1]]<0]
        coords=hp[np.asarray(edges)]
        eye_zone=(coords[:,:,1].mean(1)>ep[:,1].min()-.01)&(coords[:,:,1].mean(1)<ep[:,1].max()+.01)&(coords[:,:,2].mean(1)>.12)
        local=coords[eye_zone]
        silhouette_reports.append(dict(cameraYaw=degrees,eyeHeightSilhouetteEdges=len(local),segments=local.tolist()))
    atlas=bpy.data.images.load(str(OUT/'eye-atlas.webp'))
    pixels=np.asarray(atlas.pixels[:]).reshape(atlas.size[1],atlas.size[0],4)[::-1]
    closed=pixels[512:,512:];opaque=closed[:,:,3]>.05
    colors=closed[:,:,:3][opaque]
    # Pink arcs would require light red opaque texels; the closed tile contains dark lashes only.
    pink=(colors[:,0]>.35)&(colors[:,0]-colors[:,1]>.05)&(colors[:,1]>.10)
    report=dict(source=str(SOURCE),inputSHA256=hashes,headFrozenExactly=True,
        namedEyesNodes=[n['name'] for n in doc['nodes'] if 'eye' in n.get('name','').lower()],
        headNodes=len(head_nodes),headMeshPrimitives=[dict(material=k,vertices=len(read(k)[0]),triangles=len(read(k)[1])) for k in primitives],
        eyePrimitiveCount=sum(doc['materials'][p['material']]['name']=='D1 eye' for m in doc['meshes'] for p in m['primitives']),
        rawIndexConnectedComponentSizes=[len(group) for group in raw_components],
        eyeGeometryConnectedComponentsAfterExactPositionWeld=component_report,headSilhouetteAtEyeHeight=silhouette_reports,
        atlas=dict(size=list(atlas.size),closedQuadrant='bottom-right, pixels x=512..1023 and y=512..1023 in top-down image',
            opaqueThreshold=.05,closedOpaquePixels=int(opaque.sum()),closedOpaqueRGBMin=colors.min(0).tolist(),closedOpaqueRGBMax=colors.max(0).tolist(),closedPinkPixelCount=int(pink.sum())),
        limits=['Geometry is rest pose in shared head-local frame; no action or browser replay.',
            'Eye patch is a curved open surface; depth to Head is measured at its vertices.'])
    (OUT/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
    # Clay isolation: render the actual Head base primitive with no eye patch, texture, or runtime outline.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    verts=hp[:,[0,2,1]]*[1,-1,1]
    mesh=bpy.data.meshes.new('Actual GLB Head base surface');mesh.from_pydata(verts.tolist(),[],hf.tolist());mesh.update()
    obj=bpy.data.objects.new('Actual Head base only',mesh);bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:polygon.use_smooth=True
    mat=bpy.data.materials.new('Neutral clay');mat.diffuse_color=(.65,.65,.65,1);mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.65,.65,.65,1);bsdf.inputs['Roughness'].default_value=.8
    mesh.materials.append(mat)
    world=bpy.data.worlds.new('White inspection');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(1,1,1,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;bpy.context.scene.world=world
    for name,loc,power,size in [('Key',(-3,-4,5),500,3),('Fill',(4,-1,3),200,3)]:
        ld=bpy.data.lights.new(name,'AREA');lo=bpy.data.objects.new(name,ld);bpy.context.collection.objects.link(lo);lo.location=loc;ld.energy=power;ld.shape='DISK';ld.size=size;lo.rotation_euler=(Vector((0,0,2.6))-lo.location).to_track_quat('-Z','Y').to_euler()
    camdata=bpy.data.cameras.new('Inspection');cam=bpy.data.objects.new('Inspection',camdata);bpy.context.collection.objects.link(cam);bpy.context.scene.camera=cam;camdata.type='ORTHO';camdata.ortho_scale=.73
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
    focus=Vector((0,-.035,2.49))
    for angle in (-45,45,0):
        yaw=np.deg2rad(angle);cam.location=focus+Vector((float(np.sin(yaw)*4),float(-np.cos(yaw)*4),0));cam.rotation_euler=(focus-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/f'head-base-clay-{angle}.png');bpy.ops.render.render(write_still=True)
    assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in hashes.items())
    print('EYE_GEOMETRY_READY',json.dumps({k:v for k,v in report.items() if k!='headSilhouetteAtEyeHeight'}),flush=True)


if __name__=='__main__':main()
