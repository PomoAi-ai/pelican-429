"""Read-only source-head extraction and Catmull-Clark feasibility study."""
import bpy,bmesh,sys,json
from pathlib import Path
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[8]
SOURCE=ROOT/'assets/characters/grassy/customization/models/d1-rodin-6e73423c'
OUT=SOURCE/'modular/head-source-study'
sys.path.insert(0,str(ROOT/'scripts/blender_grassy_opus55'))
import scene as studio

def extract(source,name,predicate):
    obj=source.copy();obj.data=source.data.copy();bpy.context.collection.objects.link(obj);obj.name=name
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if not predicate(f.calc_center_median(),obj.data.materials[f.material_index].name)],context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    return obj

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'refined/d1-refined.blend'))
    source=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    head=extract(source,'D1_Head_Source',lambda c,m:'hair' not in m and ((c.z>2.17 and 'skin' in m) or c.z>2.30))
    hair=extract(source,'D1_Hair_Source',lambda c,m:'hair' in m)
    source.hide_render=True;source.hide_viewport=True
    s=bpy.context.scene;s.cycles.device='CPU';s.render.threads_mode='FIXED';s.render.threads=4
    studio.FRAMES['head']=(2.54,1.28,900,900)
    studio.VIEWS['three-quarter']=Vector((-.707,-.707,0))
    for view in ('front','right','three-quarter'):
        studio.render(view,'head',OUT/f'base-{view}.png',16)
    hair.hide_render=True
    studio.render('three-quarter','head',OUT/'base-bare.png',16)
    hair.hide_render=False
    before=len(head.data.vertices)
    original=head.data.copy()
    bpy.ops.object.select_all(action='DESELECT');head.select_set(True);bpy.context.view_layer.objects.active=head
    mod=head.modifiers.new('Source head curvature','SUBSURF');mod.subdivision_type='CATMULL_CLARK';mod.levels=1;mod.uv_smooth='PRESERVE_BOUNDARIES'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in head.data.polygons:p.use_smooth=True
    for view in ('front','right','three-quarter'):
        studio.render(view,'head',OUT/f'cc1-{view}.png',16)
    hair.hide_render=True;studio.render('three-quarter','head',OUT/'cc1-bare.png',16);hair.hide_render=False
    cc_vertices=len(head.data.vertices)
    head.data=original.copy()
    bm=bmesh.new();bm.from_mesh(head.data);bm.normal_update()
    bmesh.ops.subdivide_edges(bm,edges=[e for e in bm.edges if not e.is_boundary],cuts=2,use_grid_fill=True,smooth=.60,use_smooth_even=True)
    # Keep original vertices and all perimeter seams fixed; curve only samples
    # inserted inside the existing facial surface.
    bm.to_mesh(head.data);bm.free();head.data.update()
    for p in head.data.polygons:p.use_smooth=True
    for view in ('front','right','three-quarter'):
        studio.render(view,'head',OUT/f'curved-{view}.png',16)
    curved_coords=np.array([tuple(v.co) for v in head.data.vertices])
    moved=0
    for v in head.data.vertices:
        x,y,z=v.co
        if y>-.29 or abs(x)>.105 or not 2.27<z<2.44:continue
        # A small rounded tip and lower-lip roll; do not displace painted eyes.
        tip=np.exp(-((x/.033)**2+((z-2.395)/.025)**2))
        lip=np.exp(-((x/.058)**2+((z-2.302)/.014)**2))
        v.co.y-=.005*tip+.003*lip
        moved+=1
    head.data.update()
    for view in ('front','right','three-quarter'):
        studio.render(view,'head',OUT/f'curved-sculpt-{view}.png',16)
    hair.hide_render=True;studio.render('three-quarter','head',OUT/'curved-sculpt-bare.png',16);hair.hide_render=False
    # Curvature from source normals exaggerates the old mouth indentation.
    # Prefer one Catmull-Clark level with the cut perimeter pinned.
    head.data=original.copy()
    bm=bmesh.new();bm.from_mesh(head.data)
    crease=bm.edges.layers.float.new('crease_edge')
    for edge in bm.edges:
        if edge.is_boundary:edge[crease]=1.0
    bm.to_mesh(head.data);bm.free()
    mod=head.modifiers.new('Pinned source head subdivision','SUBSURF');mod.levels=1;mod.uv_smooth='PRESERVE_BOUNDARIES'
    bpy.context.view_layer.objects.active=head;bpy.ops.object.modifier_apply(modifier=mod.name)
    for polygon in head.data.polygons:polygon.use_smooth=True
    for view in ('front','right','three-quarter'):
        studio.render(view,'head',OUT/f'cc1-pinned-{view}.png',16)
    hair.hide_render=True;studio.render('three-quarter','head',OUT/'cc1-pinned-bare.png',16);hair.hide_render=False
    bm=bmesh.new();bm.from_mesh(head.data);boundary=sum(e.is_boundary for e in bm.edges);bm.free()
    report={'sourceHeadVertices':before,'catmullClarkVertices':cc_vertices,'chosenPinnedCatmullClarkVertices':len(head.data.vertices),'noseLipAdjustedVertices':moved,'rejectedNormalGuidedCandidate':'It exaggerates mouth dimples; do not use it.','headFaces':len(head.data.polygons),'boundaryEdges':boundary,'UVLayers':list(head.data.uv_layers.keys()),'hairSeparateObject':hair.name,'materialNames':[m.name for m in head.data.materials]}
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'head-source-pinned-cc1.blend'))
    print('HEAD_SOURCE_STUDY',json.dumps(report),flush=True)
if __name__=='__main__':main()
