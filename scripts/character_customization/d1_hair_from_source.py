"""Separate and curve the original D1 braided hair while preserving its UV detail."""
from pathlib import Path
import hashlib
import json
import math
import sys

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets/characters/grassy/customization/models/d1-rodin-6e73423c'
OUT = BASE / 'modular'
PUBLIC = ROOT / 'public/characters/human/customization'
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
import scene as studio


def _components(items, neighbors):
    unseen=set(items);groups=[]
    while unseen:
        seed=unseen.pop();group={seed};stack=[seed]
        while stack:
            item=stack.pop()
            for other in neighbors(item):
                if other in unseen:unseen.remove(other);group.add(other);stack.append(other)
        groups.append(group)
    return groups


def _lining(material):
    """Thin scalp backing fills braid-root gaps while leaving the forehead open."""
    verts=[];faces=[];segments=64;rings=18
    for i in range(rings+1):
        t=.01+i/rings*.99
        for j in range(segments):
            theta=j/segments*math.tau
            front=max(0,-math.sin(theta))
            end=2.10-1.12*front**3
            polar=t*end
            verts.append((.384*math.sin(polar)*math.cos(theta),
                          .012+.305*math.sin(polar)*math.sin(theta),2.64+.342*math.cos(polar)))
    for i in range(rings):
        for j in range(segments):
            a=i*segments+j;b=i*segments+(j+1)%segments
            faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(reversed(range(segments))))
    mesh=bpy.data.meshes.new('D1_Hair_Scalp');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('D1_Hair_Scalp',mesh);bpy.context.collection.objects.link(obj)
    mesh.materials.append(material);uv=mesh.uv_layers.new(name='UVMap')
    for f in mesh.polygons:
        f.use_smooth=True
        for li in f.loop_indices:
            v=mesh.loops[li].vertex_index;uv.data[li].uv=((v%segments)/segments,(v//segments)/rings)
    bpy.context.view_layer.objects.active=obj
    solid=obj.modifiers.new('Thin scalp lining','SOLIDIFY');solid.thickness=.006;solid.offset=-1
    bpy.ops.object.modifier_apply(modifier=solid.name)
    return obj


def build_from_source(source):
    mesh=source.data
    selected={f.index for f in mesh.polygons if 'hair' in mesh.materials[f.material_index].name
              and min(mesh.vertices[i].co.z for i in f.vertices)>2.06}
    obj=source.copy();obj.data=mesh.copy();bpy.context.collection.objects.link(obj)
    obj.name='D1_Hair_BraidedBob';obj.parent=None;obj.matrix_world=source.matrix_world.copy()
    for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
    obj.vertex_groups.clear()
    bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table()
    original_id=bm.faces.layers.int.new('sourceFaceId')
    for f in bm.faces:f[original_id]=f.index
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in selected],context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    # Eyebrow skin sits behind the fringe; its gold texels were misclassified as hair.
    brow_faces=[]
    for f in bm.faces:
        c=f.calc_center_median()
        if .105<abs(c.x)<.23 and -.36<c.y<-.28 and 2.56<c.z<2.63:
            brow_faces.append(f)
    brow_ids=[f[original_id] for f in brow_faces]
    brow_region=[[list(v.co) for v in f.verts] for f in brow_faces]
    bmesh.ops.delete(bm,geom=brow_faces,context='FACES')
    groups=_components(bm.faces,lambda f:(n for e in f.edges for n in e.link_faces))
    main=max(groups,key=len);discard=[f for g in groups if g is not main for f in g]
    bmesh.ops.delete(bm,geom=discard,context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    uv=bm.loops.layers.uv.active
    before_uv=[tuple(loop[uv].uv) for f in bm.faces for loop in f.loops]
    source_faces=len(bm.faces)
    assert source_faces>7350, 'Source hair segmentation changed; inspect before export'
    lining_material=studio.principled('D1 hair hidden lining','#DA984F',.52)
    obj.data.materials.append(lining_material);lining_index=len(obj.data.materials)-1
    loops=_components([e for e in bm.edges if e.is_boundary],lambda e:(n for v in e.verts for n in v.link_edges if n.is_boundary))
    filled=[]
    for loop in loops:
        if len(loop)>30:continue
        cap=bmesh.ops.holes_fill(bm,edges=list(loop),sides=30)['faces']
        for f in cap:
            f.material_index=lining_index
            for l in f.loops:l[uv].uv=(.5,.5)
        filled.append({'boundaryEdges':len(loop),'newFaces':len(cap)})
    # Keep original UV coordinates; only soften the isolated central M point.
    moved=[]
    for v in bm.verts:
        x,y,z=v.co
        weight=max(0,min(1,(.11-abs(x))/.085))*max(0,min(1,(-y-.355)/.040))*max(0,min(1,(2.73-z)/.15))*max(0,min(1,(z-2.52)/.06))
        if weight:
            v.co.x-=.012*weight;v.co.y+=.007*weight;v.co.z+=.026*weight;moved.append(v.index)
    retained_uv=[tuple(loop[uv].uv) for f in main if f.is_valid for loop in f.loops]
    assert sorted(before_uv)==sorted(retained_uv),'Hair source UVs changed during split'
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(obj.data);bm.free()
    for f in obj.data.polygons:f.use_smooth=True
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Applied Catmull-Clark hair surface','SUBSURF');mod.levels=1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Pull in only the outer tips; the root and scalp remain unchanged.
    tip_vertices=0
    for vertex in obj.data.vertices:
        x=vertex.co.x
        t=max(0.0,min(1.0,(abs(x)-.36)/.2211));t=t*t*(3-2*t)
        if t:
            vertex.co.x -= math.copysign(.0331*t,x);tip_vertices+=1
    obj.data.update()
    obj['asset_part']='hair';obj['attachment_bone']='head';obj['attachment_origin']=[0,0,2.17]
    liner=_lining(lining_material)
    for o in bpy.context.selected_objects:o.select_set(False)
    obj.select_set(True);liner.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
    report={'sourceSelectedFaces':len(selected),'retainedSourceFaces':source_faces,'removedStrayFaces':len(discard),'removedBrowFaces':len(brow_ids),'removedBrowSourceFaceIds':brow_ids,'removedBrowRegion':brow_region,
            'retainedSourceUVsUnchanged':True,'sourceUVHash':hashlib.sha256(repr(sorted(before_uv)).encode()).hexdigest(),
            'filledSmallLoops':filled,'fringeVerticesSoftened':len(moved),'subdivision':'Catmull-Clark level 1 applied',
            'liningThickness':.006,'outerTipVerticesNarrowed':tip_vertices,'outerTipMaxInset':.0331,'vertices':len(obj.data.vertices),'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),
            'bounds':[[min(v.co[i] for v in obj.data.vertices) for i in range(3)],[max(v.co[i] for v in obj.data.vertices) for i in range(3)]],
            'attachmentOrigin':[0,0,2.17]}
    assert all(math.isfinite(c) for v in obj.data.vertices for c in v.co)
    return obj,report


def main():
    OUT.mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(BASE/'animation/d1-animated.blend'))
    bpy.context.scene.frame_set(0)
    source=next(o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.vertices)>1000)
    obj,report=build_from_source(source)
    for other in list(bpy.context.scene.objects):
        if other!=obj:bpy.data.objects.remove(other,do_unlink=True)
    obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'d1-hair-braided.glb'),export_format='GLB',use_selection=True,export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'hair.blend'))
    (OUT/'hair-report.json').write_text(json.dumps(report,indent=2))
    with bpy.data.libraries.load(str(OUT/'head.blend'),link=False) as (src,dst):
        dst.objects=[name for name in src.objects if name.startswith('D1_Head_')]
    for head in dst.objects:bpy.context.scene.collection.objects.link(head)
    studio.studio();bpy.context.scene.view_settings.look='None';studio.FRAMES['head']=(2.61,1.25,900,900)
    for view in ('front','right','back','hero'):studio.render(view,'head',OUT/f'hair-{view}.png',32)
    studio.VIEWS['top']=Vector((0,0,1));studio.render('top','head',OUT/'hair-top.png',32)
    print(json.dumps(report))


if __name__=='__main__':main()
