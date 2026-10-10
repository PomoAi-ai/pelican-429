"""Independent, replaceable D1 braided bob built from smooth quad hair locks."""
from pathlib import Path
import json
import math
import sys

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'assets/characters/grassy/customization/models/d1-rodin-6e73423c/modular'
PUBLIC = ROOT / 'public/characters/human/customization'
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
import scene as studio


def _path(points, t):
    """Centrally sampled Catmull path; duplicated ends preserve root and tip."""
    p = [Vector(points[0]), *map(Vector, points), Vector(points[-1])]
    value = min(t * (len(points)-1), len(points)-1-1e-8)
    i = int(value) + 1
    f = value-int(value)
    a,b,c,d = p[i-1:i+3]
    return .5 * ((2*b) + (-a+c)*f + (2*a-5*b+4*c-d)*f*f + (-a+3*b-3*c+d)*f*f*f)


def _lock(name, points, width, thickness, material, normal=None, fullness=.7, root_taper=False):
    verts, faces = [], []
    steps, sides = 12, 12
    for i in range(steps+1):
        t = i/steps
        center = _path(points,t)
        tangent = (_path(points,min(1,t+.002))-_path(points,max(0,t-.002))).normalized()
        outward = Vector(normal) if normal else Vector((center.x, center.y, (center.z-2.60)*.45)).normalized()
        if normal and normal[1] < -.9:
            outward = Vector((center.x*.4, center.y, (center.z-2.58)*1.2)).normalized()
        side = tangent.cross(outward).normalized()
        outward = side.cross(tangent).normalized()
        # Broad roots overlap; the final quarter thins continuously to a fine curved tip.
        profile = (.10+.90*math.sin(math.pi*(t*.78+.12))) * max(.018,(1-t)**fullness)
        if root_taper:
            root_length = root_taper if isinstance(root_taper,float) else .10
            profile *= min(1.0, .02+(t/root_length)**1.6)
        for j in range(sides):
            angle = 2*math.pi*j/sides
            across=math.cos(angle)
            groove=.003*sum(math.exp(-((across-g)/.13)**2) for g in (-.42,.38))*max(0,math.sin(angle))**2
            v = center + side*(width*profile*across) + outward*((thickness*math.sin(angle)-groove)*profile)
            verts.append(v)
    for i in range(steps):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple(steps*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
    uv=mesh.uv_layers.new(name='HairUV')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi=mesh.loops[li].vertex_index
            uv.data[li].uv=((vi%sides)/sides,(vi//sides)/steps)
    mesh.materials.append(material)
    for p in mesh.polygons:p.use_smooth=True
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    mod=obj.modifiers.new('Applied smooth hair surface','SUBSURF');mod.subdivision_type='CATMULL_CLARK';mod.levels=1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if name.startswith('D1_Hair_Back_'):
        # Root normals meet the scalp tangentially instead of revealing an overlap ring.
        normals=[]
        for vertex in obj.data.vertices:
            x,y,z=vertex.co
            t=max(0.0,min(1.0,(z-2.79)/.18));t=t*t*(3-2*t)
            scalp=Vector((x/.438**2,y/.379**2,(z-2.58)/.492**2)).normalized()
            normals.append(vertex.normal.lerp(scalp,t).normalized())
        obj.data.normals_split_custom_set_from_vertices(normals)
    obj.select_set(False)
    return obj


def _crown(material):
    verts=[];faces=[];rings=20;segments=64
    for i in range(rings+1):
        t=.008+i/rings*.992
        for j in range(segments):
            angle=2*math.pi*j/segments
            front=max(0,-math.sin(angle))
            end=2.08-1.43*front**.35
            polar=t*end
            ripple=.002*math.cos(angle*13+polar*.8)*math.sin(polar)**2
            radial=math.sin(polar) if polar<1.3 else .964-.045*((polar-1.3)/.95)**2
            flow=angle+.07*math.sin(polar*1.6)
            x=(.438+ripple)*radial*math.cos(flow)
            y=(.379+ripple)*radial*math.sin(flow)
            z=2.58+.492*math.cos(polar)
            verts.append((x,y,z))
    for i in range(rings):
        for j in range(segments):
            a=i*segments+j;b=i*segments+(j+1)%segments
            faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(reversed(range(segments))))
    mesh=bpy.data.meshes.new('D1_Hair_Crown');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('D1_Hair_Crown',mesh);bpy.context.collection.objects.link(obj)
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
    uv=mesh.uv_layers.new(name='HairUV')
    for poly in mesh.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:
            vi=mesh.loops[li].vertex_index;uv.data[li].uv=((vi%segments)/segments,(vi//segments)/rings)
    mesh.materials.append(material)
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Applied crown surface','SUBSURF');mod.levels=1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def build_hair():
    """Full-character coordinates: Z up, face -Y; attachment follows head bone."""
    mats=[studio.principled('D1 Hair / '+name,color,.43,**{'Specular IOR Level':.28}) for name,color in
          [('gold copper','#E8A151'),('sunlit gold','#EEAF60'),('warm underlayer','#D48A42'),('braid','#E5A054')]]
    objs=[_crown(mats[0])]
    # Overlapping locks wrap the crown and nape; no solid helmet spans the forehead.
    for i in range(15):
        angle=-math.pi*.015 + i/14*math.pi*1.03
        x=math.cos(angle); y=math.sin(angle)
        curl=math.sin(i*2.1)*.035
        endz=2.29 + .040*math.cos(i*1.7)
        points=[(.10+.008*x,.012*y,3.05),(.035+.15*x,.132*y,3.020),(.018+.303*x,.267*y,2.94),(.414*x,.359*y,2.83),
                (.467*x,.415*y,2.60),(.474*x+curl,.411*y,2.40),
                (.456*x+curl*1.2,.388*y,endz+.045),(.419*x+curl*.8,.346*y,endz)]
        objs.append(_lock(f'D1_Hair_Back_{i:02}',points,.086,.027,mats[0],fullness=.23,root_taper=.45))
    # Fore-crown sweeps travel out from an off-centre part rather than a symmetric M fringe.
    fringes=[
      ([(.13,-.035,3.080),(.12,-.18,3.010),(-.03,-.276,2.945),(-.22,-.340,2.755),(-.365,-.340,2.625)],.112,.027),
      ([(.12,-.025,3.072),(.035,-.19,2.998),(-.19,-.310,2.870),(-.345,-.325,2.685),(-.403,-.268,2.61)],.103,.029),
      ([(.14,-.04,3.070),(.215,-.195,2.998),(.264,-.305,2.875),(.257,-.34,2.79),(.205,-.35,2.749)],.095,.026),
      ([(.16,-.025,3.065),(.302,-.18,2.96),(.387,-.27,2.78),(.40,-.27,2.632),(.428,-.23,2.581)],.112,.032),
      ([(.13,.005,3.075),(-.085,-.12,3.016),(-.30,-.19,2.917),(-.436,-.187,2.774)],.088,.022),
    ]
    fringes.append(([(.12,-.025,3.067),(.02,-.19,3.00),(-.14,-.31,2.868),
                      (-.28,-.343,2.712),(-.375,-.31,2.606)],.064,.018))
    for i,(points,w,d) in enumerate(fringes):
        objs.append(_lock(f'D1_Hair_Fringe_{i:02}',points,w,d,mats[i%2],normal=(0,-1,.15),fullness=.51,root_taper=True))
    # Face framing ends: keep ears readable; gently curl inward at jaw height.
    for sign in (-1,1):
        side_locks=[
            ([(.40,-.22,2.82),(.437,-.251,2.63),(.445,-.274,2.46),(.484,-.254,2.32),(.443,-.286,2.245)],.047,.010),
            ([(.413,-.13,2.83),(.462,-.166,2.65),(.48,-.202,2.49),(.521,-.143,2.405),(.474,-.086,2.31)],.052,.012),
            ([(.432,-.03,2.82),(.472,-.087,2.64),(.454,-.094,2.49),(.519,-.032,2.38),(.553,.022,2.39)],.057,.010),
            ([(.424,.09,2.81),(.481,.065,2.63),(.511,.125,2.46),(.478,.213,2.33),(.425,.244,2.29)],.068,.013),
            ([(.43,.055,2.74),(.488,.072,2.59),(.528,.115,2.49),(.543,.181,2.50)],.047,.009),
        ]
        for j,(points,width,depth) in enumerate(side_locks):
            mirrored=[(x*sign,y,z) for x,y,z in points]
            objs.append(_lock(f'D1_Hair_Temple_{sign}_{j}',mirrored,width,depth,mats[j%2],normal=(sign*.8,-.4,0),fullness=.4,root_taper=True))
        # The braid is a series of interleaved, tapered leaf locks following the scalp.
        for j in range(8):
            polar=.50+j*.13
            z=2.58+.495*math.cos(polar)-max(0,2-j)*.012
            x=sign*.451*math.sin(polar)*math.cos(.43)
            y=-.389*math.sin(polar)*math.sin(.43)
            for lane in (-1,1):
                points=[(x-sign*.010,y+lane*.024,z+.021),(x+sign*.015,y-lane*.003,z),
                        (x+sign*.003,y-lane*.024,z-.024)]
                objs.append(_lock(f'D1_Hair_Braid_{sign}_{j}_{lane}',points,.026,.010,mats[3],normal=(sign*.9*math.sin(polar),-.43*math.sin(polar),math.cos(polar)),fullness=.2))
    # One replaceable mesh, three constant PBR materials; no per-lock draw calls.
    for obj in bpy.context.selected_objects:obj.select_set(False)
    for obj in objs:obj.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    bpy.ops.object.join()
    hair=bpy.context.object;hair.name='D1_Hair_BraidedBob'
    for vertex in hair.data.vertices:
        t=max(0.0,min(1.0,(vertex.co.z-2.94)/.13))
        vertex.co.z += .022*t*t*(3-2*t)
    hair.data.update()
    hair['asset_part']='hair';hair['attachment_bone']='head';hair['attachment_origin']=[0,0,2.17]
    assert len(hair.data.uv_layers)==1
    assert all(math.isfinite(c) for v in hair.data.vertices for c in v.co)
    assert all(p.area>1e-14 for p in hair.data.polygons), 'Hair loft produced a degenerate face'
    return [hair]


def main():
    studio.reset();OUTPUT.mkdir(parents=True,exist_ok=True)
    objects=build_hair()
    for o in bpy.context.selected_objects:o.select_set(False)
    for o in objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'d1-hair-braided.glb'),export_format='GLB',use_selection=True,export_yup=True)
    bounds=[[min(v.co[i] for o in objects for v in o.data.vertices) for i in range(3)],
            [max(v.co[i] for o in objects for v in o.data.vertices) for i in range(3)]]
    report={'objects':len(objects),'vertices':sum(len(o.data.vertices) for o in objects),
            'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),
            'bounds':bounds,'subdivision':'Catmull-Clark level 1 applied per quad loft','attachmentOrigin':[0,0,2.17]}
    (OUTPUT/'hair-report.json').write_text(json.dumps(report,indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/'hair.blend'))
    # Preview the actual shared head; excluded from the replaceable hair export.
    with bpy.data.libraries.load(str(OUTPUT/'head.blend'), link=False) as (source, target):
        target.objects=[n for n in source.objects if n.startswith('D1_Head_')]
    for obj in target.objects:bpy.context.collection.objects.link(obj)
    studio.studio();bpy.context.scene.view_settings.look='None'
    studio.FRAMES['head']=(2.61,1.25,900,900)
    for view in ('front','right','back','hero'):studio.render(view,'head',OUTPUT/f'hair-{view}.png',32)
    studio.VIEWS['top']=Vector((0,0,1));studio.render('top','head',OUTPUT/'hair-top.png',32)
    print(json.dumps(report))


if __name__=='__main__':main()
