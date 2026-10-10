"""Retain the Rodin face and eye UVs, refine its surface, and close its support shell."""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'assets/characters/grassy/customization/models/d1-rodin-6e73423c'
OUT=SOURCE/'modular'
PUBLIC=ROOT/'public/characters/human/customization/d1-head.glb'
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'scripts/blender_grassy_opus55'))
import scene as studio
sys.path.insert(0,str(Path(__file__).parent))
from d1_head_rebuild import tube


def source_brow_face(face,materials):
    center=face.calc_center_median() if hasattr(face,'calc_center_median') else face.center
    return ('hair' in materials[face.material_index].name and .105<abs(center.x)<.23
            and -.36<center.y<-.28 and 2.56<center.z<2.63)


def source_head_face(face,materials):
    """Shared body/head split; gold collar material must never count as hair/head."""
    center=face.calc_center_median() if hasattr(face,'calc_center_median') else face.center
    material=materials[face.material_index].name
    return source_brow_face(face,materials) or (abs(center.x)<.47 and 'hair' not in material and ((center.z>2.17 and 'skin' in material) or center.z>2.30))


def extracted_head(source):
    obj=source.copy();obj.data=source.data.copy();bpy.context.collection.objects.link(obj)
    obj.name='D1_Head_SourceFace'
    bm=bmesh.new();bm.from_mesh(obj.data)
    selected=[f.index for f in bm.faces if source_head_face(f,obj.data.materials)]
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if not source_head_face(f,obj.data.materials)],context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    brow_vertices={v for f in bm.faces if source_brow_face(f,obj.data.materials) for v in f.verts}
    # These gold source patches were misclassified as hair. Fit their depth to
    # adjacent forehead skin so they are eyebrows on the face, not free spikes.
    boundary={v:v.co.copy() for v in brow_vertices if v.is_boundary}
    for _ in range(4):
        updates={v:sum((edge.other_vert(v).co.y for edge in v.link_edges))/len(v.link_edges) for v in brow_vertices if not v.is_boundary}
        for vertex,y in updates.items():vertex.co.y=vertex.co.y*.35+y*.65
    assert all((vertex.co-position).length<1e-8 for vertex,position in boundary.items()),'Brow smoothing opened the shared hair seam'
    crease=bm.edges.layers.float.new('crease_edge')
    for edge in bm.edges:
        if edge.is_boundary:edge[crease]=1
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    before=len(obj.data.vertices)
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Source surface curvature','SUBSURF');mod.levels=1;mod.uv_smooth='PRESERVE_BOUNDARIES'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for face in obj.data.polygons:face.use_smooth=True
    bm=bmesh.new();bm.from_mesh(obj.data);remaining=set(bm.verts);components=[]
    while remaining:
        first=remaining.pop();stack=[first];size=0
        while stack:
            vertex=stack.pop();size+=1
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if other in remaining:remaining.remove(other);stack.append(other)
        components.append(size)
    bm.free()
    assert len(components)==1,f'Source head contains detached fragments: {components}'
    return obj,selected,before


def shell(name,center,radii,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,radius=1,location=center)
    obj=bpy.context.object;obj.name=name;obj.scale=radii
    bpy.ops.object.transform_apply(location=True,rotation=False,scale=True)
    obj.data.materials.append(material)
    for face in obj.data.polygons:face.use_smooth=True
    return obj


def surface_tree(obj):
    return BVHTree.FromPolygons([v.co for v in obj.data.vertices],[p.vertices[:] for p in obj.data.polygons])


def surface_point(tree,x,z):
    hit,normal,_,_=tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)))
    if hit is None:raise ValueError(f'No original face under eyelash at {x}, {z}')
    return hit,normal


def eyelashes(face):
    tree=surface_tree(face)
    material=studio.principled('D1 source eyelash','#261b21',.74)
    objects=[];roots=[]
    # Measured from the retained dark upper-lid pixels, not the procedural eye.
    for sign in (1,-1):
        for index,(x,z) in enumerate(((.204,2.528),(.232,2.519),(.251,2.509))):
            if sign<0:z+=.002
            root,normal=surface_point(tree,sign*x,z)
            root+=normal*.0007
            points=[];radii=[]
            for i in range(9):
                t=i/8
                point=root+Vector((sign*(.006+.004*index)*t,-(.010+.003*index)*t*t,(.014+.004*index)*t))
                points.append(point);radii.append(.0022*(1-t)**1.3+.00015)
            lash=tube(f'D1_Head_Lash_{sign}_{index}',points,radii,material,sides=8)
            objects.append(lash);roots.append({'position':list(root),'surfaceOffset':.0007})
    return objects,roots


def refine_nose_lips(face):
    changed=[]
    for vertex in face.data.vertices:
        x,y,z=vertex.co
        if y>-.29 or abs(x)>.085 or not 2.28<z<2.43:continue
        before=vertex.co.copy()
        # Sub-millimetric in character coordinates: keep painted smile narrow.
        tip=math.exp(-((x/.026)**2+((z-2.396)/.021)**2))
        lower=math.exp(-((x/.050)**2+((z-2.302)/.012)**2))
        vertex.co.y-=.0018*tip+.0003*lower
        if (vertex.co-before).length>1e-6:changed.append((vertex.co-before).length)
    face.data.update()
    return {'changedVertices':len(changed),'maximumDisplacement':max(changed),'separateLipStrip':False,'lowerLipMaximumOffset':.0003}


def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'refined/d1-refined.blend'))
    source=next(obj for obj in bpy.context.scene.objects if obj.type=='MESH')
    face,indices,before=extracted_head(source)
    facial=refine_nose_lips(face)
    skin=studio.principled('D1 source support skin','#ffddd0',.74)
    scalp=shell('D1_Head_ClosedScalp',(0,.045,2.62),(.373,.250,.38),skin)
    neck=shell('D1_Head_NeckClosure',(0,.040,2.245),(.070,.065,.065),skin)
    lashes,roots=eyelashes(face)
    objects=[face,scalp,neck]+lashes
    assert face.data.uv_layers.active and len(face.data.uv_layers.active.data)==len(face.data.loops),'Original face UVs missing'
    for obj in (scalp,neck):
        bm=bmesh.new();bm.from_mesh(obj.data)
        assert all(e.is_manifold for e in bm.edges),f'{obj.name} is not a closed support'
        bm.free()
    assert facial['maximumDisplacement']<.002,'Lip/nose refinement exceeds source shape tolerance'
    assert max(abs(root['surfaceOffset']) for root in roots)<.001,'Eyelash roots float above eyelids'
    for obj in objects:obj['characterPart']='head'
    source.hide_render=True
    hair=source.copy();hair.data=source.data.copy();hair.name='SourceHairPreviewOnly';bpy.context.collection.objects.link(hair);hair.hide_render=False
    bm=bmesh.new();bm.from_mesh(hair.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if 'hair' not in hair.data.materials[f.material_index].name or f.calc_center_median().z<2.13 or source_brow_face(f,hair.data.materials)],context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(hair.data);bm.free();hair.data.update()
    hair.hide_render=True
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=face
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_lights=False,export_cameras=False)
    scene=bpy.context.scene;scene.cycles.device='CPU';scene.render.threads_mode='FIXED';scene.render.threads=4
    studio.FRAMES['head']=(2.55,1.26,900,900);studio.VIEWS['three-quarter']=Vector((-.707,-.707,0))
    for view in ('front','right','three-quarter'):
        studio.render(view,'head',OUT/f'head-bare-{view}.png',16)
    hair.hide_render=False
    for view in ('front','right','three-quarter'):
        studio.render(view,'head',OUT/f'head-{view}.png',16)
    bpy.data.objects.remove(hair,do_unlink=True)
    bpy.data.objects.remove(source,do_unlink=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'head.blend'))
    report={'method':'Source face and eye UVs retained; pinned-boundary Catmull-Clark level 1',
            'source':str(SOURCE/'refined/d1-refined.blend'),'sourceHeadVertices':before,
            'faceVertices':len(face.data.vertices),'vertices':sum(len(o.data.vertices) for o in objects),
            'sourceFaceIndices':indices,'sharedSplitFunction':'source_head_face(face, materials)','sourceBrowRegion':'Hair-classified forehead patches reassigned; only interior vertices depth-smoothed, shared hair boundaries fixed' ,
            'separateClosedSupportMeshes':[scalp.name,neck.name],'headPreviewHair':'Source hair is rendered for context only; not included in head asset.','facialGeometry':facial,
            'eyelashes':{'meshStrands':len(lashes),'roots':roots,'originalEyeTextureRetained':True},
            'limitations':['Original iris and eyelid textures retained; no independently animated eyeballs.','Face shell overlaps closed scalp and neck support; not a welded facial-expression mesh.']}
    (OUT/'head-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('D1_SOURCE_HEAD',json.dumps({k:v for k,v in report.items() if k!='sourceFaceIndices'}),flush=True)

if __name__=='__main__':main()
