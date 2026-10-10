"""Independent D1 head: continuous quad skin, shaped eyelids and blue eyes.

All coordinates are character coordinates (Z up, face toward -Y). The closed
head is separate from the hair so it can be reused with another hairstyle.
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/characters/grassy/customization/models/d1-rodin-6e73423c/modular'
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
import scene as studio

# Named silhouette stations: chin, jaw, cheek, temple, forehead and crown.
STATIONS = [(2.215, .018, -.16, .06), (2.237, .11, -.24, .12),
            (2.278, .205, -.291, .20), (2.34, .305, -.319, .28),
            (2.43, .381, -.337, .328), (2.56, .411, -.345, .363),
            (2.69, .409, -.337, .37), (2.81, .35, -.29, .33),
            (2.92, .244, -.193, .25), (2.985, .101, -.062, .132),
            (3.0, .005, .036, .044)]


def profile(z):
    """Cubic interpolation keeps silhouette stations smooth across the jaw."""
    for i in range(len(STATIONS) - 1):
        if z <= STATIONS[i + 1][0]:
            a, b = STATIONS[i:i+2]
            p, q = STATIONS[max(0, i-1)], STATIONS[min(len(STATIONS)-1, i+2)]
            t = (z-a[0])/(b[0]-a[0]); d = b[0]-a[0]
            return tuple((2*t**3-3*t*t+1)*a[k] + (t**3-2*t*t+t)*d*(b[k]-p[k])/(b[0]-p[0])
                         + (-2*t**3+3*t*t)*b[k] + (t**3-t*t)*d*(q[k]-a[k])/(q[0]-a[0]) for k in (1,2,3))
    return STATIONS[-1][1:]


def gauss(x, z, cx, cz, sx, sz):
    return math.exp(-((x-cx)/sx)**2-((z-cz)/sz)**2)


def face_y(x, z):
    width, front, back = profile(z)
    side = .025
    # A broad cheek plane curves smoothly into temples rather than a sphere.
    u = min(.9999, abs(x)/max(width,.005))
    y = side + (front-side)*(1-u**2.6)**.5
    y -= .016*gauss(x,z,0,2.425,.034,.031)
    y -= .005*gauss(x,z,0,2.477,.034,.067)
    y -= .001*gauss(x,z,.036,2.413,.026,.02)
    y -= .001*gauss(x,z,-.036,2.413,.026,.02)
    y += .002*gauss(x,z,0,2.386,.04,.02)
    # The lip seam is recessed into the same continuous cheek mesh.
    t=x/.067
    taper=max(0.,1-t*t)**2
    seam=2.350+.008*min(1.,t*t)
    d=z-seam
    upper=.0018*math.exp(-((d-.005)/.0045)**2)
    lower=.0028*math.exp(-((d+.0065)/.0070)**2)
    groove=.0009*math.exp(-(d/.0018)**2)
    y += taper*(groove-upper-lower)
    y += .0010*gauss(abs(x),z,.064,2.358,.011,.007)
    y -= .004*gauss(x,z,0,2.29,.14,.037)
    return y


def mesh_object(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces); me.update()
    bm=bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    ob=bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(material)
    for p in me.polygons: p.use_smooth=True
    return ob


def subdivide(obj, levels=1):
    mod=obj.modifiers.new('Surface subdivision', 'SUBSURF')
    mod.subdivision_type='CATMULL_CLARK'; mod.levels=levels; mod.render_levels=levels
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def colored_skin(ob):
    colors=[]
    base=studio.srgb('#ffe1d7'); blush=studio.srgb('#f5a99c'); lip=studio.srgb('#dfa093')
    for v in ob.data.vertices:
        x,y,z=v.co
        front=max(0,min(1,(-y-.10)/.14))
        f=.24*max(gauss(x,z,.235,2.40,.093,.055),gauss(x,z,-.235,2.40,.093,.055))*front
        c=[a+(b-a)*f for a,b in zip(base,blush)]
        t=x/.067; taper=max(0.,1-t*t)**2; d=z-(2.350+.008*min(1.,t*t))
        f=.62*taper*math.exp(-(d/.010)**2)*front
        c=tuple(a+(b-a)*f for a,b in zip(c,lip))
        f=.70*taper*math.exp(-(d/.002)**2)*front
        colors.append(tuple(a+(b-a)*f for a,b in zip(c,studio.srgb('#b87670'))))
    studio.set_vertex_colors(ob,'SkinTint',colors)


def tube(name, points, radii, material, sides=8):
    verts=[]; faces=[]
    for i,p in enumerate(points):
        p=Vector(p)
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
        tangent.normalize(); n=tangent.cross(Vector((0,1,0))).normalized(); b=tangent.cross(n).normalized()
        for j in range(sides):
            a=j*math.tau/sides
            verts.append(tuple(p+radii[i]*(math.cos(a)*n+math.sin(a)*b)))
        if i:
            for j in range(sides):
                a=(i-1)*sides+j; b0=(i-1)*sides+(j+1)%sides
                faces.append((a,b0,b0+sides,a+sides))
    faces += [tuple(reversed(range(sides))), tuple((len(points)-1)*sides+j for j in range(sides))]
    return mesh_object(name,verts,faces,material)


def build_shell(skin):
    # Denser support loops around the small mouth preserve the recessed seam.
    angles=sorted(set([round(math.tau*i/64,6) for i in range(64)]+[0. if abs(t)<1e-6 else round(t%math.tau,6) for t in np.linspace(-.255,.255,35)]))
    heights=sorted(set([round(z,6) for z in np.linspace(2.215,3.,48)]+[round(z,6) for z in np.linspace(2.326,2.377,35)]))
    n=len(angles);rings=len(heights);verts=[];faces=[]
    for j,z in enumerate(heights):
        width,front,back=profile(z)
        for i,t in enumerate(angles):
            x=width*math.sin(t)
            if math.cos(t)>=0: y=face_y(x,z)
            else: y=.025+(back-.025)*(-math.cos(t))
            verts.append((x,y,z))
        if j:
            for i in range(n):
                a=(j-1)*n+i; b=(j-1)*n+(i+1)%n; faces.append((a,b,b+n,a+n))
    faces.extend([tuple(reversed(range(n))),tuple((rings-1)*n+i for i in range(n))])
    ob=mesh_object('D1_head_skin',verts,faces,skin)
    subdivide(ob,1); colored_skin(ob)
    return ob


def eye_surface(side, u, v):
    # Wide round eyes with almost level corners, faithful to the face sheet.
    x=side*(.200+u*.125)
    z=2.556+v*(.088 if v>=0 else .078)+u*.004
    y=face_y(x,z)-.002-.010*max(0,1-u*u-v*v)
    return x,y,z


def build_eye(side, mats):
    name='L' if side>0 else 'R'; result=[]; n=64; rings=10
    verts=[eye_surface(side,0,0)]; faces=[]
    for r in range(1,rings+1):
        for i in range(n):
            a=i*math.tau/n; rad=r/rings
            verts.append(eye_surface(side,rad*math.cos(a),rad*math.sin(a)))
        if r==1:
            faces.extend((0,1+i,1+(i+1)%n) for i in range(n))
        else:
            k=1+(r-2)*n
            faces.extend((k+i,k+(i+1)%n,k+n+(i+1)%n,k+n+i) for i in range(n))
    result.append(mesh_object(f'D1_eye_white_{name}',verts,faces,mats['white']))
    # Iris follows the eye lens: no sphere protrudes outside the eyelids.
    iris_material=studio.vertex_color_material(f'D1 iris gradient {name}','IrisTint',.42, **{'Specular IOR Level': .15})
    verts=[tuple(Vector(eye_surface(side,0,0))+Vector((0,-.0015,0)))]; faces=[]; colors=[studio.srgb('#081525')]
    pupil=studio.srgb('#081525'); upper=studio.srgb('#104e7c'); lower=studio.srgb('#29b4d4'); rim=studio.srgb('#12374a')
    for j in range(1,17):
        r=j/16
        for i in range(n):
            a=i*math.tau/n
            x,y,z=eye_surface(side,r*.55*math.cos(a),r*.98*math.sin(a))
            verts.append((x,y-.0015,z))
            light=(math.sin(a)+1)/2
            c=tuple(hi+(lo-hi)*light for hi,lo in zip(lower,upper))
            pupil_mix=max(0,min(1,(r-.43)/.12))
            c=tuple(p+(v-p)*pupil_mix for p,v in zip(pupil,c))
            rim_mix=max(0,min(1,(r-.90)/.10))
            colors.append(tuple(v+(e-v)*rim_mix for v,e in zip(c,rim)))
            if j==1: faces.append((0,1+i,1+(i+1)%n))
            else:
                k=1+(j-2)*n;faces.append((k+i,k+(i+1)%n,k+n+(i+1)%n,k+n+i))
    iris=mesh_object(f'D1_iris_{name}',verts,faces,iris_material)
    studio.set_vertex_colors(iris,'IrisTint',colors);result.append(iris)
    for label,ux,vz,radius in [('large',-.22,.40,.014),('small',.21,-.32,.006)]:
        x,y,z=eye_surface(side,ux,vz)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=(x,y-.005,z))
        dot=bpy.context.object;dot.name=f'D1_eye_glint_{label}_{name}';dot.scale=(radius,.003,radius*1.12)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        dot.data.materials.append(mats['glint']);result.append(dot)
    for upper in (True,False):
        angles=np.linspace(0,math.pi,41) if upper else np.linspace(math.pi,math.tau,41)
        pts=[]; rr=[]
        for a in angles:
            x,y,z=eye_surface(side,math.cos(a),math.sin(a))
            pts.append((x,y-.002,z));rr.append((.0065 if upper else .0010)*(.3+.7*math.sin(a)**2))
        result.append(tube(f'D1_eyelid_{name}_{upper}',pts,rr,mats['lash'] if upper else mats['mouth']))
    for j in range(3):
        a=.18+j*.19; p=Vector(eye_surface(side,math.cos(a),math.sin(a)))
        p.y-=.001
        points=[];radii=[]
        for k in range(9):
            t=k/8
            points.append(tuple(p+Vector((side*(.018+j*.003)*t,-.014*t*t,(.005+j*.003)*t+.004*math.sin(math.pi*t)))))
            radii.append(.0037*(1-t)**1.15+.00012)
        result.append(tube(f'D1_lash_{name}_{j}',points,radii,mats['lash']))
    pts=[]; rr=[]
    for i in range(33):
        t=i/32; x=side*(.082+.214*t); z=2.675+.017*math.sin(math.pi*t)-.013*t
        pts.append((x,face_y(x,z)-.005,z));rr.append(.006*(.4+.6*math.sin(math.pi*t)))
    result.append(tube(f'D1_brow_{name}',pts,rr,mats['brow']))
    return result


def build_ear(side, skin):
    # A continuous ear bowl: concha depression, raised helix and closed back.
    verts=[(side*.427,.013,2.494)];faces=[];n=48
    ring_specs=[(.22,.014),(.43,.012),(.61,-.004),(.78,-.023),(.94,-.021),(1.,-.006)]
    for j,(r,depth) in enumerate(ring_specs):
        for i in range(n):
            t=i*math.tau/n
            x=side*(.427+.061*r*math.cos(t))
            z=2.494+.084*r*math.sin(t)
            y=depth+.014*(1-math.cos(t))
            verts.append((x,y,z))
            if j==0: faces.append((0,1+i,1+(i+1)%n))
            else:
                k=1+(j-1)*n;faces.append((k+i,k+(i+1)%n,k+n+(i+1)%n,k+n+i))
    back=len(verts);verts.append((side*.427,.050,2.494));k=1+(len(ring_specs)-1)*n
    for i in range(n):faces.append((k+i,back,k+(i+1)%n))
    ear=mesh_object('D1_ear_'+('L' if side>0 else 'R'),verts,faces,skin)
    subdivide(ear,1);colored_skin(ear)
    # Warm inner-ear tint is vertex color and exports directly with the mesh.
    layer=ear.data.color_attributes['SkinTint'];inner=studio.srgb('#efb6a6')
    for vertex,color in zip(ear.data.vertices,layer.data):
        x,y,z=vertex.co;f=.45*gauss(x,z,side*.427,2.494,.042,.057)*max(0,min(1,(.045-y)/.03))
        color.color=tuple(a+(b-a)*f for a,b in zip(color.color,inner))
    return ear


def build_head():
    skin=studio.vertex_color_material('D1 warm skin','SkinTint',.64)
    mats={key:studio.principled('D1 '+key,col,rough) for key,col,rough in [
        ('white','#fff8f3',.42),('glint','#ffffff',.2),
        ('lash','#382422',.65),('brow','#b9804d',.66),('mouth','#b97068',.64)]}
    objects=[build_shell(skin)]
    verts=[];faces=[]
    for j in range(9):
        z=2.025+j*.255/8;r=.096+.018*(j/8)**2
        for i in range(40):
            a=i*math.tau/40;verts.append((r*math.cos(a),.060+r*.90*math.sin(a),z))
            if j:
                k=(j-1)*40;faces.append((k+i,k+(i+1)%40,k+40+(i+1)%40,k+40+i))
    faces.extend([tuple(reversed(range(40))),tuple(320+i for i in range(40))])
    neck=mesh_object('D1_neck',verts,faces,skin);subdivide(neck,1);colored_skin(neck);objects.append(neck)
    objects.extend(build_eye(1,mats));objects.extend(build_eye(-1,mats))
    objects += [build_ear(1,skin),build_ear(-1,skin)]
    for ob in objects: ob.name='D1_Head_'+ob.name.removeprefix('D1_')
    return objects


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True); OUT.mkdir(parents=True,exist_ok=True)
    objects=build_head()
    assert any(o.name=='D1_Head_head_skin' for o in objects)
    for ob in objects:
        assert all(math.isfinite(c) for v in ob.data.vertices for c in v.co),ob.name
        assert all(p.area>1e-12 for p in ob.data.polygons),f'{ob.name}: degenerate surface'
    shell=objects[0]; bm=bmesh.new();bm.from_mesh(shell.data)
    assert all(e.is_manifold for e in bm.edges),'The head skin must be a closed, reusable shell'
    bm.free()
    report={'coordinates':'Z-up, front -Y, existing D1 character world coordinates',
            'headBonePivot':[0,0,2.17],'skinBounds':[[min(v.co[i] for v in shell.data.vertices),max(v.co[i] for v in shell.data.vertices)] for i in range(3)],
            'subdivision':'Catmull-Clark 1 level, applied to the continuous head and ears',
            'noseTip':[0,face_y(0,2.425),2.425],'mouthCenter':[0,face_y(0,2.350),2.350],
            'mouthConstruction':'closed seam recessed in continuous skin; upper and lower lip support loops; no separate mouth mesh',
            'eyelashes':'curved tapered mesh strands embedded in upper eyelid roots',
            'referenceProportionStudy': {
                'source':'exec-3b9e21f6-95d5-4f67-be0e-c374e655d709.png FACE FRONT and FACE RIGHT',
                'measurement':'manual image landmarks, approximate pixel bounds with 2-4 px uncertainty',
                'referenceEyeAspect':1.47,'referenceIrisAspect':.87,
                'referenceIrisEyeWidthRatio':[.53,.57],
                'candidateEyeAspect':.250/.166,'candidateIrisAspect':(.250*.55)/(.166*.98),
                'eyeHalfWidth':.125,'eyeTopHeight':.088,'eyeBottomHeight':.078,
                'eyeCenterX':.200,'irisWidthFactor':.55,'irisHeightFactor':.98,
                'browBaseZ':2.675,'jawHalfWidthAt2_278':.205,'cheekHalfWidthAt2_34':.305,
                'noseTipOffset':.016,'upperLipOffset':.0018,'lowerLipOffset':.0028,'lipSeamDepth':.0009},
            'objects':[{ 'name':ob.name,'vertices':len(ob.data.vertices),'polygons':len(ob.data.polygons)} for ob in objects]}
    (OUT/'head-report.json').write_text(json.dumps(report,indent=2)+'\n')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/characters/human/customization/d1-head.glb'),export_format='GLB',use_selection=True,export_animations=False)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=6
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
    studio.studio(); scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
    cam=studio._camera();cam.data.type='ORTHO';cam.data.ortho_scale=1.14
    scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.film_transparent=False
    for name,direction in [('front',(0,-1,0)),('right',(-1,0,0)),('three-quarter',(-.65,-1,0))]:
        target=Vector((0,0,2.60));cam.location=target+Vector(direction).normalized()*7
        cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/f'head-{name}.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'head.blend'))
    print(json.dumps(report))


if __name__=='__main__':main()
